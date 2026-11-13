// Shared heart counts: every player's ♥ adds to one count per game, kept by the hearts backend
// (workers/hearts, a Cloudflare Worker + D1 at VITE_HEARTS_URL).
//
// No accounts: this install has a random anonymous device id, so it counts once per game.
// The app reads all counts in one request at start (and when you come back to it), and sends
// each heart or un-heart in the background. Changes made offline wait in a queue and go out later.
// Counts are saved locally too, so the feed shows the last known numbers straight away.
//
// Passes: on the phone apps, the API asks for proof that requests come from the real app
// (App Attest on iOS, Play Integrity on Android). The app gets a challenge, has the phone sign it,
// and trades it for a pass valid 24 hours, sent with each heart. Until the store builds exist the
// server accepts hearts without a pass (under tighter limits), so a failed check never blocks play.
//
// With no VITE_HEARTS_URL (before the backend is set up, and in the streaming tests) nothing is sent.
import { Capacitor } from '@capacitor/core';
import { store, deviceId } from './util.js';
import { nativePlugin } from './kit/services.js';

export const HEARTS_URL = String(import.meta.env.VITE_HEARTS_URL || '').replace(/\/+$/, '');
/**
 * A real build in someone's hands: not `npm run dev`, not a test build (`--mode bundled`) and not a
 * browser that a test script is driving. Only these send play stats and crash reports, so our own
 * test runs don't show up as players.
 */
export const REAL = import.meta.env.MODE === 'production' && !(typeof navigator !== 'undefined' && navigator.webdriver);
const COUNTS_KEY = 'gs_heart_counts', SENT_KEY = 'gs_heart_sent', QUEUE_KEY = 'gs_heart_queue';
const REFRESH_MS = 2 * 60 * 1000, FRESH_MS = 3 * 60 * 1000;
const PASS_KEY = 'gs_api_pass', ATTEST_KEY = 'gs_appattest_key', PASS_RETRY_MS = 30 * 60 * 1000;

/** This install's random anonymous id (shared with play stats, used only as a rate-limit key there). */
export { deviceId };

let counts = store.get(COUNTS_KEY, {}) || {};   // game id -> count from the server
let sent = store.get(SENT_KEY, {}) || {};       // game id -> true when the server has this device's heart
let queue = store.get(QUEUE_KEY, {}) || {};     // game id -> wanted state, not yet sent
const freshAt = {};                              // game id -> when we got its count from a write (newer than the cached list)
const listeners = new Set();
let lastLoad = 0, flushing = false, flushTimer = 0;

const changed = ids => listeners.forEach(f => { try { f(ids); } catch (_) {} });

export const hearts = {
  enabled: !!HEARTS_URL,

  /** The number to show for a game, given whether this player has hearted it. */
  count(id, mine) {
    // The server count already includes this device if it has received our heart.
    return Math.max(0, (counts[id] || 0) - (sent[id] ? 1 : 0)) + (mine ? 1 : 0);
  },

  /** Call with a list of game ids that changed (or none for "all"). */
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },

  /** Heart or un-heart a game. Sent in the background. */
  set(id, on) {
    if (!this.enabled) return;
    if (!!sent[id] === !!on) delete queue[id]; else queue[id] = !!on;
    store.set(QUEUE_KEY, queue);
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, 600);   // quick double taps send once
  },

  /** Make sure the server matches what this player has hearted (e.g. hearts from before syncing). */
  reconcile(ids, isMine) {
    if (!this.enabled) return;
    let any = false;
    for (const id of ids) { const on = !!isMine(id); if (!!sent[id] !== on && queue[id] !== on) { queue[id] = on; any = true; } }
    if (any) { store.set(QUEUE_KEY, queue); flush(); }
  },

  /** Fetch every game's count (one small, edge-cached request). */
  async load(force = false) {
    if (!this.enabled || (!force && Date.now() - lastLoad < REFRESH_MS)) return;
    lastLoad = Date.now();
    try {
      const r = await fetch(HEARTS_URL + '/counts');
      if (!r.ok) return;
      const next = (await r.json()).counts || {};
      // A count we just got back from our own write is newer than the cached list: keep it a while.
      for (const id in freshAt) if (Date.now() - freshAt[id] < FRESH_MS) next[id] = counts[id] || 0; else delete freshAt[id];
      counts = next; store.set(COUNTS_KEY, counts); changed();
    } catch (_) { /* offline: keep the saved counts */ }
    flush();
  },
};

/* ---------- passes (App Attest / Play Integrity) ---------- */
let passTry = 0, passing = null;
const canAttest = () => !!nativePlugin && ['ios', 'android'].includes(Capacitor.getPlatform());

async function post(path, body, pass) {
  const headers = { 'Content-Type': 'application/json' };
  if (pass) headers.Authorization = 'Bearer ' + pass;
  return fetch(HEARTS_URL + path, { method: 'POST', headers, body: JSON.stringify(body) });
}

/** A current pass, getting a new one if needed. null when the phone can't prove itself (yet). */
async function pass(force = false) {
  const p = store.get(PASS_KEY, null);
  if (!force && p && p.expires > Date.now() + 60 * 60 * 1000) return p.token;
  if (!canAttest() || Date.now() - passTry < PASS_RETRY_MS) return p && p.expires > Date.now() ? p.token : null;
  if (!passing) passing = (async () => {
    passTry = Date.now();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const c = await fetch(HEARTS_URL + '/challenge');
        if (!c.ok) return null;
        const { challenge } = await c.json();
        const keyId = store.get(ATTEST_KEY, null);
        let proof;
        try { proof = await nativePlugin.integrity({ challenge, ...(keyId ? { keyId } : {}) }); }
        catch (e) {
          if (e && e.code === 'INVALID_KEY') { store.set(ATTEST_KEY, null); continue; }   // make a new key
          return null;   // no store build / not set up yet
        }
        const r = await post('/session', { device: deviceId(), challenge, ...proof });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.session) {
          if (proof.attestation) store.set(ATTEST_KEY, proof.keyId);
          store.set(PASS_KEY, { token: j.session, expires: j.expires });
          passTry = 0;
          return j.session;
        }
        if (j.reattest) { store.set(ATTEST_KEY, null); continue; }   // the server lost our key
        return null;
      }
      return null;
    } catch (_) { return null; }
    finally { passing = null; }
  })();
  return passing;
}

async function flush() {
  if (flushing || !hearts.enabled) return;
  const ids = Object.keys(queue);
  if (!ids.length) return;
  flushing = true;
  const device = deviceId(), done = [];
  try {
    let token = await pass();
    for (const id of ids) {
      const on = queue[id];
      let r;
      try {
        r = await post('/heart', { device, game: id, on }, token);
        if (r.status === 401) {   // the server wants a (fresh) pass
          token = await pass(true);
          if (!token) break;     // can't get one now: keep the heart queued
          r = await post('/heart', { device, game: id, on }, token);
        }
      } catch (_) { break; }   // offline: try again later
      if (r.status === 429 || r.status === 401) break;
      if (r.ok) {
        const { n } = await r.json();
        counts[id] = n; freshAt[id] = Date.now(); done.push(id);
        if (on) sent[id] = true; else delete sent[id];
      } else if (r.status >= 400 && r.status < 500) {
        // Unknown game (e.g. not published yet) or bad request: drop it so it can't block the queue.
      } else break;
      if (queue[id] === on) delete queue[id];
    }
  } finally {
    flushing = false;
    store.set(QUEUE_KEY, queue); store.set(SENT_KEY, sent); store.set(COUNTS_KEY, counts);
    if (done.length) changed(done);
    if (Object.keys(queue).length) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 30_000); }
  }
}

if (hearts.enabled) {
  addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') hearts.load(); });
}

/** POSTs to the API with this install's pass (getting a fresh one if the server asks). For src/boards.js. */
export async function apiPost(path, body) {
  let token = await pass(), r = await post(path, body, token);
  if (r.status === 401) { token = await pass(true); if (token) r = await post(path, body, token); }
  return r;
}
