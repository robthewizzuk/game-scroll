// Anonymous play stats: how often each game comes up in the feed (views), how many rounds
// people start (plays), how often they scroll past within 5 seconds without playing (quick skips),
// and seconds played. Counts are added up on the phone and sent about once a minute to
// api.game-scroll.com, which keeps only daily totals per game. Nothing identifies the player.
//
// The totals come back (GET /stats, last 30 days) for the QA panel and to give the feed a gentle
// nudge towards games people actually play. Off switch: Settings → "Share anonymous play stats".
import { store } from './util.js';
import { HEARTS_URL, REAL, deviceId } from './hearts.js';
import { history } from './history.js';

const PENDING_KEY = 'gs_stats_pending', GLOBAL_KEY = 'gs_stats_global', OFF_KEY = 'gs_stats_off';
const SKIP_MS = 5000, MIN_VIEW_MS = 300, FLUSH_MS = 60_000, LOAD_MS = 30 * 60_000;

let pending = store.get(PENDING_KEY, {}) || {};   // id -> { v, p, k, s } not sent yet
let global = store.get(GLOBAL_KEY, { games: {} }) || { games: {} };
let cur = null;                                    // { id, at, played, secs }
let flushing = false, lastLoad = 0;

const add = (id, f, n = 1) => { const c = pending[id] || (pending[id] = { v: 0, p: 0, k: 0, s: 0 }); c[f] += n; store.set(PENDING_KEY, pending); };

export const playstats = {
  get enabled() { return !!HEARTS_URL && !store.get(OFF_KEY, false); },
  set enabled(on) { store.set(OFF_KEY, !on); if (!on) { pending = {}; store.set(PENDING_KEY, pending); } },

  /** A game came up in the feed. */
  shown(id) { this.left(); cur = { id, at: performance.now(), played: false, secs: 0 }; },
  /** The current game scrolled away (or the app went to the background). */
  left() {
    if (!cur) return;
    const ms = performance.now() - cur.at, c = cur; cur = null;
    if (ms < MIN_VIEW_MS) return;
    history.viewed(c.id, ms, c.played, c.secs);   // your own history: kept on the phone even with sharing off
    if (!this.enabled) return;
    add(c.id, 'v');
    if (!c.played && ms < SKIP_MS) add(c.id, 'k');
  },
  /** A round started. */
  started(id) { if (cur && cur.id === id) cur.played = true; if (this.enabled) add(id, 'p'); },
  /** A round ended after ms milliseconds. */
  round(id, ms) { if (cur && cur.id === id && ms > 0) cur.secs += ms / 1000; if (this.enabled && ms > 0) add(id, 's', Math.round(Math.min(ms, 3600_000) / 1000)); },

  /** Everyone's totals for a game over the last 30 days: { v, p, k, s } or null. */
  global(id) { return global.games[id] || null; },

  /** Fetch everyone's totals (cached on the phone; refreshed at most every 30 minutes). */
  async load(force = false) {
    if (!HEARTS_URL || (!force && Date.now() - lastLoad < LOAD_MS)) return;
    lastLoad = Date.now();
    try {
      const r = await fetch(HEARTS_URL + '/stats');
      if (r.ok) { global = await r.json(); store.set(GLOBAL_KEY, global); }
    } catch (_) { /* offline: keep the saved totals */ }
  },

  /** Send what's been counted. keepalive lets it finish while the app goes to the background. */
  async flush(keepalive = false) {
    if (flushing || !this.enabled || !REAL) return;   // (test builds count, for the app's own checks, but never send)
    const ids = Object.keys(pending).slice(0, 60);
    if (!ids.length) return;
    const batch = Object.fromEntries(ids.map(id => [id, { ...pending[id] }]));
    flushing = true;
    try {
      const r = await fetch(HEARTS_URL + '/stats', {
        method: 'POST', keepalive, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: deviceId(), games: batch }),
      });
      // Sent (or refused as bad, which won't get better): forget these counts.
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) {
        for (const id of ids) {   // subtract what was sent; anything counted meanwhile stays
          const c = pending[id]; if (!c) continue;
          for (const f of ['v', 'p', 'k', 's']) c[f] = Math.max(0, c[f] - batch[id][f]);
          if (!c.v && !c.p && !c.k && !c.s) delete pending[id];
        }
        store.set(PENDING_KEY, pending);
      }
    } catch (_) { /* offline: try again later */ }
    finally { flushing = false; }
  },
};

if (HEARTS_URL && typeof document !== 'undefined') {
  setInterval(() => { if (document.visibilityState === 'visible') playstats.flush(); }, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { playstats.left(); playstats.flush(true); }
    else playstats.load();
  });
}
