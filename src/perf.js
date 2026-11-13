// Anonymous performance and crash reports, so stutters and crashes on real phones show up
// without anyone having to notice and describe them.
//
// - Frame timing: while a round is playing, every frame's length is timed. Per game the phone
//   adds up frames, time, "slow" frames (25 ms or more, under 40 fps) and "freezes" (70 ms or
//   more, a stutter you can feel), plus how much of that time the game's own code took.
// - Script errors: anything a game throws (the app ends that round), and any other uncaught error.
// - Crashes: while the app is on screen it keeps a small "open" marker. Going to the background
//   clears it. If the app starts and the marker is still there, it was killed or reloaded while
//   on screen, so that's sent as a crash for the game that was open. On Android 11 and later the
//   phone's own record of why the app ended is used instead (src/exits.js): it gives the reason
//   (crashed, out of memory, not responding) and the time, and leaves out the app being closed by
//   the player.
// - Heat: how much of the timed play was with the phone warm or hot (src/kit/power.js), since a
//   hot phone slows itself down and that isn't the game's doing.
//
// Sent about once a minute to api.game-scroll.com/perf with the phone model (e.g. SM-F966B), OS
// version, app build, screen size class, the version of each game's file (games are streamed, so
// a game can change without the app changing) and whether a test robot is driving the phone, and
// nothing else. Uses the same off switch as play stats (Settings). This phone's own numbers are
// also kept for the QA panel, even in test builds, which send nothing (REAL in hearts.js).
import { Capacitor } from '@capacitor/core';
import { store } from './util.js';
import { HEARTS_URL, REAL, deviceId } from './hearts.js';
import { playstats } from './playstats.js';
import { power } from './kit/power.js';
import { appHealth, judgeExit } from './exits.js';

const PENDING_KEY = 'gs_perf_pending', LOCAL_KEY = 'gs_perf_local', GLOBAL_KEY = 'gs_perf_global', OPEN_KEY = 'gs_perf_open';
const EXIT_KEY = 'gs_perf_exit', BUILD_KEY = 'gs_perf_build';   // the newest exit record already looked at; the build that ran last
const SLOW_MS = 25, FREEZE_MS = 70, GAP_MS = 1000, FLUSH_MS = 60_000, LOAD_MS = 30 * 60_000, MAX_ERRORS = 10;
export const BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

// r rounds, f frames, ms their time, w work time, sl slow, h freezes, x the longest; hk time with the phone's heat known, hw of it warm, hh hot
const blank = () => ({ r: 0, f: 0, ms: 0, w: 0, sl: 0, h: 0, x: 0, hk: 0, hw: 0, hh: 0 });
let pending = store.get(PENDING_KEY, null) || { games: {}, errors: [] };   // not sent yet: games by 'id|form|version'
let local = store.get(LOCAL_KEY, {}) || {};                                // this phone, all time: id -> counts
let global = store.get(GLOBAL_KEY, null);                                  // everyone, from GET /perf
let info = { platform: Capacitor.getPlatform(), model: 'unknown', os: '', app: BUILD };
let current = '', curVer = '', playing = false, lastFrame = 0, flushing = false, lastLoad = 0, saveT = 0;

const sending = () => (REAL || !!perf.outbox) && !!HEARTS_URL && playstats.enabled;
/** The version of a game's file (the short hash from the catalogue), '' for a game built into the app. */
const verOf = id => { try { return String((id && perf.versionOf && perf.versionOf(id)) || '').slice(0, 16); } catch (_) { return ''; } };
const key = (id, v) => id + '|' + form() + '|' + v;
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

/** v: the game file's version; at: when it happened (seconds since 1970) where that is known and isn't now. */
function addError(kind, game, msg, where, v = game && game === current ? curVer : verOf(game), at = 0) {
  if (!msg) return;
  const list = pending.errors, e = at ? null : list.find(x => x.kind === kind && x.game === game && x.msg === msg && x.place === where && (x.v || '') === v && !x.at);
  if (e) e.n++;
  else if (list.length < MAX_ERRORS) list.push({ kind, game, msg, place: where, n: 1, ...(v ? { v } : {}), ...(at ? { at } : {}) });
  save();
}

function openMarker() { store.set(OPEN_KEY, { game: current, ver: curVer, playing, app: BUILD, at: Date.now() }); }

/**
 * How the last session ended. was: the open marker it left (null if it had gone to the background).
 * health: for tests, in place of asking the phone.
 */
async function lastTime(was, health) {
  const seen = store.get(EXIT_KEY, 0) || 0, sameBuild = store.get(BUILD_KEY, '') === BUILD;
  store.set(BUILD_KEY, BUILD);
  const h = health === undefined ? await appHealth(seen) : health;
  if (h?.robot) info = { ...info, robot: true };
  let told = false;   // the phone has its own record of how that session ended
  if (h?.known) {
    let newest = seen;
    for (const x of h.exits || []) {
      if (!(x.at > seen)) continue;
      newest = Math.max(newest, x.at);
      if (was && x.at >= was.at - 2000) told = true;
      // (an exit from before an update belongs to the build that was running then: left out)
      const j = sameBuild ? judgeExit(x, was, h.web) : null;
      if (j) addError('crash', j.game, j.msg, j.place, j.ver, j.at);
    }
    if (newest > seen) store.set(EXIT_KEY, newest);
  }
  // Nothing from the phone about it (iPhone, the web, Android 10 and older): the marker is all there is.
  if (!told && was && was.app === BUILD) addError('crash', was.game || '', was.playing ? 'App closed while playing' : 'App closed while open', '', was.ver || '');
  store.set(PENDING_KEY, pending);
}

export const perf = {
  /** A game came up in the feed ('' for none). */
  shown(id) { current = id || ''; curVer = verOf(current); playing = false; lastFrame = 0; if (document.visibilityState !== 'hidden') openMarker(); },
  /** A round started or ended. */
  started(id) { current = id; curVer = verOf(id); playing = true; lastFrame = 0; (pending.games[key(id, curVer)] ||= blank()).r++; (local[id] ||= blank()).r++; openMarker(); save(); },
  ended() { playing = false; lastFrame = 0; openMarker(); },

  /**
   * Call once per animation frame while a round is playing (not paused). now: the frame's
   * timestamp; work: milliseconds the game's update + draw took this frame; budget: the frame
   * length the game aims for (33 ms when it runs at 30 fps, so those frames don't count as slow).
   */
  frame(id, now, work, budget = 16.7) {
    const dt = lastFrame ? now - lastFrame : 0; lastFrame = now;
    if (dt <= 0 || dt > GAP_MS) return;   // first frame, or the app was away
    if (perf.tap) try { perf.tap.frame(id, dt, work, budget); } catch (_) { /* the listener's own trouble */ }
    const heat = power.thermal == null ? -1 : power.heat;   // -1: this phone doesn't say (the web)
    for (const c of [pending.games[key(id, id === current ? curVer : verOf(id))] ||= blank(), local[id] ||= blank()]) {
      c.f++; c.ms += dt; c.w += Math.min(work, dt);
      if (dt >= Math.max(SLOW_MS, budget * 1.5)) c.sl++;
      if (dt >= FREEZE_MS) c.h++;
      if (dt > c.x) c.x = dt;
      if (heat >= 0) { c.hk = (c.hk || 0) + dt; if (heat === 1) c.hw = (c.hw || 0) + dt; else if (heat > 1) c.hh = (c.hh || 0) + dt; }
    }
    save();
  },
  /** Something paused frames on purpose (a dialog): don't count the gap as a freeze. */
  gap() { lastFrame = 0; },

  /** A script error, optionally inside a game. */
  error(e, game = current) {
    const msg = message(e), where = place(e); addError('error', game, msg, where);
    if (perf.tap) try { perf.tap.error(msg, game, where); } catch (_) { /* the listener's own trouble */ }
  },
  /** The phone test tour (src/tour.js) listens in while it runs: { frame(id, dt, work, budget), error(msg, game, place) }, or null. */
  tap: null,
  /** Set by the app: id => the version of that game's file ('' for one built into the app). */
  versionOf: null,
  /** Tests: a list here takes each batch in place of the network (and lets a test build "send"). */
  outbox: null,
  /** Tests: how a session that left this marker and these records from the phone would be reported. */
  lastTime,
  /** What is waiting to be sent. */
  get waiting() { return pending; },
  /** The phone's heat as it is read here (tests set it). */
  power,

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
    // Batches go out per screen size, since a Fold can be used folded and unfolded in one minute,
    // and with one version of a game each (a game that updated mid-minute waits for the next).
    const keys = Object.keys(pending.games);
    const f = keys.length ? keys[0].split('|')[1] : form();
    const ids = new Set(), mine = keys.filter(k => { const [id, kf] = k.split('|'); if (kf !== f || ids.has(id) || ids.size >= 40) return false; ids.add(id); return true; });
    const games = Object.fromEntries(mine.map(k => {
      const c = pending.games[k], [id, , v] = k.split('|');
      return [id, { ...c, ms: Math.round(c.ms), w: Math.round(c.w), x: Math.round(c.x), hk: Math.round(c.hk || 0), hw: Math.round(c.hw || 0), hh: Math.round(c.hh || 0), ...(v ? { v } : {}) }];
    }));
    const errors = pending.errors.slice();
    if (!mine.length && !errors.length) return;
    flushing = true;
    try {
      const body = JSON.stringify({ device: deviceId(), info: { ...info, form: f }, games, errors });
      const r = perf.outbox ? (perf.outbox.push(JSON.parse(body)), { ok: true, status: 200 })
        : await fetch(HEARTS_URL + '/perf', { method: 'POST', keepalive, headers: { 'Content-Type': 'application/json' }, body });
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
  // (What the phone itself says about it is asked for, so this is told a moment later.)
  const was = store.get(OPEN_KEY, null);
  openMarker();
  lastTime(was);

  addEventListener('error', e => { if (e.error || e.message) perf.error(e.error || e.message); });
  addEventListener('unhandledrejection', e => perf.error(e.reason ?? 'unhandled rejection'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { store.set(OPEN_KEY, null); clearTimeout(saveT); saveT = 0; store.set(PENDING_KEY, pending); store.set(LOCAL_KEY, local); perf.flush(true); }
    else { lastFrame = 0; openMarker(); perf.load(); }
  });
  addEventListener('pagehide', () => store.set(OPEN_KEY, null));
  setInterval(() => { if (document.visibilityState === 'visible') perf.flush(); }, FLUSH_MS);
}
