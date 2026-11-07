// Anonymous performance and crash reports, so stutters and crashes on real phones show up
// without anyone having to notice and describe them.
//
// - Frame timing: while a round is playing, every frame's length is timed. Per game the phone
//   adds up frames, time, "slow" frames (25 ms or more, under 40 fps) and "freezes" (70 ms or
//   more, a stutter you can feel), plus how much of that time the game's own code took.
// - Script errors: anything a game throws (the app ends that round), and any other uncaught error.
// - Crashes: while the app is on screen it keeps a small "open" marker. Going to the background
//   clears it. If the app starts and the marker is still there, it was killed or reloaded while
//   on screen (on a phone that's usually the system running out of memory), so that's sent as a
//   crash for the game that was open.
//
// Sent about once a minute to api.game-scroll.com/perf with the phone model (e.g. SM-F966B), OS
// version, app build and screen size class, and nothing else. Uses the same off switch as play
// stats (Settings). This phone's own numbers are also kept for the QA panel, even in test builds.
import { Capacitor } from '@capacitor/core';
import { store } from './util.js';
import { HEARTS_URL, deviceId } from './hearts.js';
import { playstats } from './playstats.js';

const PENDING_KEY = 'gs_perf_pending', LOCAL_KEY = 'gs_perf_local', GLOBAL_KEY = 'gs_perf_global', OPEN_KEY = 'gs_perf_open';
const SLOW_MS = 25, FREEZE_MS = 70, GAP_MS = 1000, FLUSH_MS = 60_000, LOAD_MS = 30 * 60_000, MAX_ERRORS = 10;
export const BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

const blank = () => ({ r: 0, f: 0, ms: 0, w: 0, sl: 0, h: 0, x: 0 });
let pending = store.get(PENDING_KEY, null) || { games: {}, errors: [] };   // not sent yet
let local = store.get(LOCAL_KEY, {}) || {};                                // this phone, all time: id -> counts
let global = store.get(GLOBAL_KEY, null);                                  // everyone, from GET /perf
let info = { platform: Capacitor.getPlatform(), model: 'unknown', os: '', app: BUILD };
let current = '', playing = false, lastFrame = 0, flushing = false, lastLoad = 0, saveT = 0;

const sending = () => !!HEARTS_URL && playstats.enabled;
const form = () => Math.min(innerWidth, innerHeight) >= 600 ? 'wide' : 'phone';
// Frames come in at 60-120 a second: save to storage at most every few seconds.
const save = () => { if (!saveT) saveT = setTimeout(() => { saveT = 0; store.set(PENDING_KEY, pending); store.set(LOCAL_KEY, local); }, 3000); };

/** Phone model and OS from the Device plugin (falls back to the browser's guess on the web). */
(async () => {
  try {
    const { Device } = await import('@capacitor/device');
    const d = await Device.getInfo();
    info = { ...info, model: String(d.model || 'unknown').slice(0, 40), os: `${d.operatingSystem || ''} ${d.osVersion || ''}`.trim().slice(0, 40) };
  } catch (_) { /* keep 'unknown' */ }
})();

/** Short, file-name-only location from a stack ("games/neon-drift.js:42"), no full URLs. */
function place(e) {
  const stack = String(e?.stack || '');
  for (const line of stack.split('\n').slice(0, 6)) {
    const m = line.match(/([\w.-]+\/)?([\w.-]+\.js)(?:\?[^:)\s]*)?:(\d+)(?::\d+)?/);
    if (m) return `${m[1] || ''}${m[2]}:${m[3]}`.slice(0, 80);
  }
  return '';
}
const message = e => (e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : (() => { try { return JSON.stringify(e); } catch (_) { return String(e); } })())
  .replace(/https?:\/\/[^\s)]+/g, u => u.split('/').pop()).slice(0, 160);

function addError(kind, game, msg, where) {
  if (!msg) return;
  const list = pending.errors, e = list.find(x => x.kind === kind && x.game === game && x.msg === msg && x.place === where);
  if (e) e.n++;
  else if (list.length < MAX_ERRORS) list.push({ kind, game, msg, place: where, n: 1 });
  save();
}

function openMarker() { store.set(OPEN_KEY, { game: current, playing, app: BUILD, at: Date.now() }); }

export const perf = {
  /** A game came up in the feed ('' for none). */
  shown(id) { current = id || ''; playing = false; lastFrame = 0; if (document.visibilityState !== 'hidden') openMarker(); },
  /** A round started or ended. */
  started(id) { current = id; playing = true; lastFrame = 0; const k = id + '|' + form(); (pending.games[k] ||= blank()).r++; (local[id] ||= blank()).r++; openMarker(); save(); },
  ended() { playing = false; lastFrame = 0; openMarker(); },

  /**
   * Call once per animation frame while a round is playing (not paused). now: the frame's
   * timestamp; work: milliseconds the game's update + draw took this frame; budget: the frame
   * length the game aims for (33 ms when it runs at 30 fps, so those frames don't count as slow).
   */
  frame(id, now, work, budget = 16.7) {
    const dt = lastFrame ? now - lastFrame : 0; lastFrame = now;
    if (dt <= 0 || dt > GAP_MS) return;   // first frame, or the app was away
    for (const c of [pending.games[id + '|' + form()] ||= blank(), local[id] ||= blank()]) {
      c.f++; c.ms += dt; c.w += Math.min(work, dt);
      if (dt >= Math.max(SLOW_MS, budget * 1.5)) c.sl++;
      if (dt >= FREEZE_MS) c.h++;
      if (dt > c.x) c.x = dt;
    }
    save();
  },
  /** Something paused frames on purpose (a dialog): don't count the gap as a freeze. */
  gap() { lastFrame = 0; },

  /** A script error, optionally inside a game. */
  error(e, game = current) { addError('error', game, message(e), place(e)); },

  /** This phone's numbers for a game: { r, f, ms, w, sl, h, x } or null. */
  local(id) { return local[id]?.f ? local[id] : null; },
  /** Everyone's totals from the server: { games: [...], errors: [...] } or null. */
  get global() { return global; },
  get reportUrl() { return HEARTS_URL ? HEARTS_URL + '/perf/report' : ''; },
  info: () => ({ ...info, form: form() }),

  async load(force = false) {
    if (!HEARTS_URL || (!force && Date.now() - lastLoad < LOAD_MS)) return;
    lastLoad = Date.now();
    try { const r = await fetch(HEARTS_URL + '/perf'); if (r.ok) { global = await r.json(); store.set(GLOBAL_KEY, global); } } catch (_) {}
  },

  async flush(keepalive = false) {
    if (!sending()) { if (Object.keys(pending.games).length || pending.errors.length) { pending = { games: {}, errors: [] }; store.set(PENDING_KEY, pending); } return; }
    if (flushing) return;
    // Batches go out per screen size, since a Fold can be used folded and unfolded in one minute.
    const keys = Object.keys(pending.games);
    const f = keys.length ? keys[0].split('|')[1] : form();
    const mine = keys.filter(k => k.endsWith('|' + f)).slice(0, 40);
    const games = Object.fromEntries(mine.map(k => { const c = pending.games[k]; return [k.split('|')[0], { ...c, ms: Math.round(c.ms), w: Math.round(c.w), x: Math.round(c.x) }]; }));
    const errors = pending.errors.slice();
    if (!mine.length && !errors.length) return;
    flushing = true;
    try {
      const r = await fetch(HEARTS_URL + '/perf', {
        method: 'POST', keepalive, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: deviceId(), info: { ...info, form: f }, games, errors }),
      });
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) {
        // Drop what was sent. Frames counted meanwhile are lost for this minute, which is fine.
        for (const k of mine) delete pending.games[k];
        pending.errors = pending.errors.filter(e => !errors.includes(e));
        store.set(PENDING_KEY, pending);
      }
    } catch (_) { /* offline: try again later */ }
    finally { flushing = false; }
  },
};

if (typeof document !== 'undefined') {
  // Left open last time without going to the background: the app crashed or was killed on screen.
  const was = store.get(OPEN_KEY, null);
  if (was && was.app === BUILD) addError('crash', was.game || '', was.playing ? 'App closed while playing' : 'App closed while open', '');
  openMarker();

  addEventListener('error', e => { if (e.error || e.message) perf.error(e.error || e.message); });
  addEventListener('unhandledrejection', e => perf.error(e.reason ?? 'unhandled rejection'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { store.set(OPEN_KEY, null); clearTimeout(saveT); saveT = 0; store.set(PENDING_KEY, pending); store.set(LOCAL_KEY, local); perf.flush(true); }
    else { lastFrame = 0; openMarker(); perf.load(); }
  });
  addEventListener('pagehide', () => store.set(OPEN_KEY, null));
  setInterval(() => { if (document.visibilityState === 'visible') perf.flush(); }, FLUSH_MS);
}
