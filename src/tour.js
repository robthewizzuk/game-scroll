// Phone test tour: one button in the QA panel that tries the app on the phone in your hand and gives
// one report to copy. The automatic checks run in a desktop browser on a build machine, so they can't
// say how a 3D game runs on a real phone's graphics chip, whether it stutters as the phone warms up, or
// whether a native plugin (sensors, haptics, screen rate, AR...) still answers after an update.
//
// What it does:
//  1. Asks every native plugin one harmless question, with a time limit. Never one that shows a
//     prompt or changes anything.
//  2. Shows each 3D game in turn through the real feed, waits for it to load, presses Play and plays it
//     for 20 s (Next Gen games in full screen, the way they're played) with a bot: taps, holds, swipes and thumb-stick drags from two fingers, sent to the
//     game's canvas as pointer events, so they travel the way a finger's do. The app's own frame loop
//     times every frame (src/perf.js), so frame pacing, frame generation and the screen's rate are
//     the real thing.
//  3. Shows one report: the phone, the plugins, then each game (load time, frames a second against the
//     rate it aims for, the worst 1% of frames, the longest frame, freezes, errors), problems first.
// Instead of games it can fly through the engine test scenes (src/detail-tour.js): heavy scenes drawn
// with each of the Next Gen engine's detail systems off and on, to say what each is worth on this phone.
//
// The bot plays as a guest (src/main.js): nothing it does is kept. No saves, bests, credits, trophies,
// leaderboard scores, play stats or Tiny Brains learning. Frame timings and errors do count, in the
// QA panel and the anonymous stutter reports: they are real ones from a real phone.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { store, hash } from './util.js';
import { perf, BUILD } from './perf.js';
import { sound } from './sfx.js';
import { hapticSettings } from './kit/device.js';
import { rng as makeRng } from './kit/math.js';
import { screenHz, fpsFor, frameGenFor, fpsPick, frameGenPick, phoneClass, settledFor, speed } from './kit/speed.js';
import { gpuName, hasWebGPU, gpuPick } from './kit/gpu.js';
import { power } from './kit/power.js';
import { prefs } from './kit/prefs.js';

const SLOW_MS = 25, FREEZE_MS = 70;   // the same lines src/perf.js draws
const EARLY_MS = 2000;                // a freeze this soon after Play is the round starting up, not play
const LOAD_LIMIT = 40, PLUGIN_LIMIT = 4000, LAST_KEY = 'gs_tour_last', SCENES = 'scenes';
const ERAS = { console: 'Console', nextgen: 'Next Gen', ar: 'AR', board: 'Board' };
const is3D = g => !!ERAS[g.era];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

/* ---------- which games ---------- */
/** The sets the tour offers: [key, name, games]. */
export function sets(games) {
  return [
    ['3d', '3D games', games.filter(is3D)],
    ['hd', 'Next Gen and AR', games.filter(g => g.era === 'nextgen' || g.era === 'ar')],
    ['all', 'Every game', games.slice()],
  ];
}
/** About how long a tour of n games takes, in words. */
export function howLong(n, seconds) {
  const m = Math.max(1, Math.round(n * (seconds + 6) / 60));
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h ${m % 60} min`;
}

/* ---------- the guest: saves and brains that go nowhere ---------- */
/**
 * What a game is given in place of its saves and brains while the bot plays it. Reads still see the
 * player's own (so the game looks as it does for them); writes stay in this card's memory.
 */
export function guestApi(api) {
  const copy = d => JSON.parse(JSON.stringify(d));
  const slot = (read) => {
    let mine;   // undefined: untouched, null: cleared, { d }: the bot's own
    return {
      save(d) { try { const c = copy(d); if (c === undefined) return false; mine = { d: c }; return true; } catch { return false; } },
      load(fallback = null) { return mine === undefined ? read(fallback) : mine ? copy(mine.d) : fallback; },
      clear() { mine = null; },
    };
  };
  // (the card's api is changed in place, so keep hold of the real ones first)
  const { load, loadLocal, brains: b } = api;
  const cloud = slot(f => load(f)), local = slot(f => loadLocal(f)), kept = new Map();
  return {
    save: d => cloud.save(d), load: f => cloud.load(f), clearSave: () => cloud.clear(),
    saveLocal: d => local.save(d), loadLocal: f => local.load(f), clearLocal: () => local.clear(),
    brains: b && {
      ...b,
      load: name => (kept.has(name) ? kept.get(name) : b.load(name)),
      save(name, text) { if (typeof text !== 'string') return false; kept.set(name, text); return true; },
      share() {}, onFun: () => () => {},
      player: { read: () => b.player.read(), write: () => true, clear() {} },
    },
  };
}

/* ---------- the bot ---------- */
const FINGERS = [7001, 7002];   // pointer ids no real finger has
/**
 * A player made of two thumbs. The first taps, holds, swipes, drags, and works a thumb-stick in the
 * lower left; while it holds a stick the second taps and drags on the right, the way a two-thumb game
 * is played. send(type, x, y, id) gets 'pointerdown' | 'pointermove' | 'pointerup' in game units;
 * size() is the game's [w, h] now. The same seed gives the same touches.
 */
export class Bot {
  constructor(send, size, seed = 1) {
    this.send = send; this.size = size; this.r = makeRng(seed);
    this.f = FINGERS.map(id => ({ id, g: null, next: 0 }));
    this.count = { tap: 0, hold: 0, swipe: 0, drag: 0, stick: 0 };
  }
  plan(second) {
    const [W, H] = this.size(), r = this.r, m = Math.min(W, H), k = r();
    const inside = ([x, y]) => [clamp(x, W * .03, W * .97), clamp(y, H * .03, H * .97)];
    const line = (p, q) => u => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    if (second) {   // the other thumb: buttons and looking about, on the right
      const p = [r.range(W * .55, W * .94), r.range(H * .35, H * .92)];
      if (k < .6) return { kind: 'tap', len: r.range(.04, .1), at: () => p };
      const a = r.range(0, Math.PI * 2), d = m * r.range(.08, .25);
      return { kind: 'drag', len: r.range(.25, .9), moves: true, at: line(p, inside([p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d])) };
    }
    const p = [r.range(W * .06, W * .94), r.range(H * .1, H * .94)];
    if (k < .3) return { kind: 'tap', len: r.range(.04, .1), at: () => p };
    if (k < .42) return { kind: 'hold', len: r.range(.3, 1.4), at: () => p };
    if (k < .62) {   // a flick one way, as fast and as far as a thumb does it
      const [dx, dy] = r.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]), d = m * r.range(.15, .35);
      return { kind: 'swipe', len: r.range(.06, .14), moves: true, at: line(p, inside([p[0] + dx * d, p[1] + dy * d])) };
    }
    if (k < .75) return { kind: 'drag', len: r.range(.2, .7), moves: true, at: line(p, [r.range(W * .06, W * .94), r.range(H * .1, H * .94)]) };
    // a thumb-stick: press in the lower left, push out, and steer round slowly
    const c = [r.range(W * .12, W * .34), r.range(H * .62, H * .88)], a0 = r.range(0, Math.PI * 2), turn = r.range(-1.4, 1.4), reach = m * r.range(.1, .2), len = r.range(1, 3);
    return { kind: 'stick', len, moves: true, at: u => { const a = a0 + turn * u, out = Math.min(1, u * len / .15); return inside([c[0] + Math.cos(a) * reach * out, c[1] + Math.sin(a) * reach * out]); } };
  }
  /** Call once a frame while the round is being played. t: seconds of play so far. */
  step(t) {
    for (const f of this.f) {
      const second = f !== this.f[0];
      if (f.g) {
        const u = (t - f.g.t0) / f.g.len;
        if (u >= 1) { this.send('pointerup', ...f.g.at(1), f.id); f.g = null; f.next = t + this.r.range(.08, second ? 1 : .5); }
        else if (f.g.moves) this.send('pointermove', ...f.g.at(u), f.id);
      } else if (t >= f.next && (!second || this.f[0].g?.kind === 'stick')) {
        const g = f.g = this.plan(second); g.t0 = t; this.count[g.kind]++;
        this.send('pointerdown', ...g.at(0), f.id);
      }
    }
  }
  /** Lifts both thumbs (the round ended, or the tour is moving on). t: when, so the next touch waits a moment. */
  release(t = 0) {
    for (const f of this.f) if (f.g) { const u = clamp((t - f.g.t0) / f.g.len, 0, 1); this.send('pointerup', ...f.g.at(u), f.id); f.g = null; f.next = t + .3; }
  }
}
/** Sends the bot's touches to a card's canvas as pointer events. */
function sender(s) {
  let rect = null, at = 0;
  return (type, x, y, id) => {
    const now = performance.now();
    if (!rect || type === 'pointerdown' || now - at > 250) { rect = s.canvas.getBoundingClientRect(); at = now; }   // (not every move: reading it can cost a layout)
    const up = type === 'pointerup';
    s.canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: id === FINGERS[0], bubbles: true, cancelable: true, composed: true,
      clientX: rect.left + x / s.w * rect.width, clientY: rect.top + y / s.h * rect.height,
      button: type === 'pointermove' ? -1 : 0, buttons: up ? 0 : 1, pressure: up ? 0 : .5, width: 24, height: 24,
    }));
  };
}

/* ---------- frames ---------- */
/**
 * How a run of frames went. dts: each frame's length in ms; works: the ms of each the game's own code
 * took; budget: the frame length the game aims for. low: the frame rate of the worst 1% of frames.
 */
export function summarise(dts, works = [], budget = 16.7) {
  const n = dts.length;
  if (!n) return { frames: 0, fps: 0, low: 0, worst: 0, slow: 0, freezes: 0, work: 0 };
  const lim = Math.max(SLOW_MS, budget * 1.5);
  let sum = 0, slow = 0, freezes = 0, worst = 0, work = 0;
  for (let i = 0; i < n; i++) { const d = dts[i]; sum += d; if (d >= lim) slow++; if (d >= FREEZE_MS) freezes++; if (d > worst) worst = d; work += works[i] || 0; }
  const sorted = Float64Array.from(dts).sort(), k = Math.max(1, Math.round(n * .01));
  let tail = 0; for (let i = n - k; i < n; i++) tail += sorted[i];
  return { frames: n, fps: 1000 * n / sum, low: 1000 * k / tail, worst, slow: slow / n, freezes, work: work / n };
}
/** One word for how a game did: 'ok', 'SLOW', 'STUTTER', 'ERROR', 'NO LOAD' or 'NO FRAMES'. */
export function verdict(r) {
  if (!r.loaded) return 'NO LOAD';
  if (r.errors.length) return 'ERROR';
  if (!r.frames) return 'NO FRAMES';
  if (r.fps < r.target * .85) return 'SLOW';
  if (r.freezes - r.early >= 3 || r.slow >= .05) return 'STUTTER';
  return 'ok';
}

/* ---------- native plugins ---------- */
// One harmless question each: [plugin, method, arguments, what to say of the answer (when the answer
// itself is too long to read)]. Nothing here shows a prompt, turns a sensor on or changes a setting
// (GameServices.signIn without `interactive` only asks whether the player is signed in already;
// SpeechAudio.render has the phone write three words of speech to sound, which nobody hears).
const PLUGINS = [
  ['Device', 'getInfo'], ['App', 'getState'], ['Haptics', 'selectionStart'], ['KeepAwake', 'isSupported'], ['Geolocation', 'checkPermissions'],
  ['Motion', null], ['Filesystem', 'checkPermissions'], ['Share', 'canShare'], ['TextToSpeech', 'getSupportedLanguages'],
  ['PowerState', 'get'], ['AppHealth', 'get', { since: 0 }, r => r ? { robot: r.robot, known: r.known, exits: (r.exits || []).length, web: !!r.web } : r, 'android'], ['ScreenRate', 'get'], ['PhoneSensors', 'available'], ['PhoneSensors', 'output'], ['RichHaptics', 'supported'],
  ['NativeAR', 'available'], ['NPU', 'available'], ['PhoneAI', 'modelAvailable'], ['PhoneAI', 'speechAvailable', { language: 'en-US' }],
  ['GameServices', 'signIn', {}],
  ['SpeechAudio', 'render', { text: 'Testing, one two.', lang: 'en-GB', rate: 1, pitch: 1 },
    r => r?.ok ? { ok: true, rate: r.rate, seconds: +(String(r.pcm || '').length * .375 / (r.rate || 1)).toFixed(2), wordMarks: (r.marks?.length || 0) / 2 } : r],
];
const brief = v => { let t; try { t = JSON.stringify(v); } catch { t = String(v); } t = t === undefined ? 'no value' : t; return t.length > 140 ? t.slice(0, 137) + '...' : t; };
/**
 * Asks every native plugin its question. Gives [{ name, state: 'ok' | 'FAIL' | 'MISSING', ms, note }],
 * or null on the web, where there are none. cap: Capacitor (a stand-in, for tests).
 */
export async function checkPlugins(cap = Capacitor, limit = PLUGIN_LIMIT) {
  if (!cap.isNativePlatform()) return null;
  const out = [];
  for (const [name, method, args, tell, only] of PLUGINS) {
    const label = method ? `${name}.${method}` : name;
    if (only && cap.getPlatform && cap.getPlatform() !== only) continue;   // (a plugin one kind of phone has no use for)
    if (!cap.isPluginAvailable(name)) { out.push({ name: label, state: 'MISSING', ms: 0, note: 'not in this build of the app' }); continue; }
    if (!method) { out.push({ name: label, state: 'ok', ms: 0, note: 'in the app (not asked: it only sends readings)' }); continue; }
    const t0 = performance.now();
    try {
      const p = cap.Plugins?.[name] || registerPlugin(name);
      const r = await Promise.race([p[method](args), wait(limit).then(() => { throw new Error(`no answer in ${limit / 1000} s`); })]);
      out.push({ name: label, state: 'ok', ms: Math.round(performance.now() - t0), note: brief(tell ? tell(r) : r) });
    } catch (e) { out.push({ name: label, state: 'FAIL', ms: Math.round(performance.now() - t0), note: String(e?.message || e).slice(0, 140) }); }
  }
  return out;
}

/* ---------- the phone ---------- */
const heatWord = h => ['cool', 'warm', 'hot'][h] || 'cool';
export const powerNow = () => ({ level: power.known ? power.level : null, charging: power.charging, heat: power.heat, saver: power.saver });
/** What this phone is, for a report's first lines. */
export async function phone() {
  const i = perf.info();
  return {
    model: i.model, os: i.os || i.platform, platform: i.platform, form: i.form, build: BUILD,
    screen: `${Math.round(screen.width)} x ${Math.round(screen.height)} at ${+devicePixelRatio.toFixed(2)}x`, hz: screenHz(),
    chip: gpuName() || 'unknown', webgpu: await hasWebGPU(), gpuPick: gpuPick(), klass: phoneClass(),
    cores: navigator.hardwareConcurrency || null, memory: navigator.deviceMemory || null,
    fpsPick: fpsPick(), frameGenPick: frameGenPick(), reduceMotion: prefs.reduceMotion,
  };
}

/* ---------- one game ---------- */
async function tourGame(driver, g, o, live) {
  const res = { id: g.id, title: g.title, style: String(g.tag || '').split(' · ')[0] || ERAS[g.era] || '', loaded: false, loadMs: 0, played: 0, rounds: 0, score: 0, errors: [], early: 0, note: '', heat: power.heat };
  const dts = [], works = [];
  let roundMs = 0, collecting = false;
  perf.tap = {
    frame(id, dt, work) { if (!collecting || id !== g.id) return; dts.push(dt); works.push(work); if (dt >= FREEZE_MS && roundMs < EARLY_MS) res.early++; roundMs += dt; },
    error(msg, game, where) { if (game && game !== g.id) return; const line = where ? `${msg} @ ${where}` : msg; if (!res.errors.includes(line) && res.errors.length < 5) res.errors.push(line); },
  };
  const t0 = performance.now();
  try {
    driver.show(g.id);
    // loaded: the card is up and its game was made (a game still fetching a kit shows "Loading…")
    let s = null, offline = false;
    while (!o.stopped()) {
      const a = driver.active();
      if (a && a.def.id === g.id && (!a.loading || a.failed)) { s = a; break; }
      if (performance.now() - t0 > LOAD_LIMIT * 1000) break;
      if (document.querySelector('.feed-msg.offline')) { offline = true; break; }   // a streamed game that isn't on the phone, and no connection
      await nextFrame();
    }
    if (!s) { res.note = o.stopped() ? 'stopped' : offline ? 'no connection, and this game is not on the phone yet' : `still loading after ${LOAD_LIMIT} s`; return res; }
    if (s.failed) { res.note = s.failed; return res; }
    res.loaded = true; res.loadMs = performance.now() - t0;
    await nextFrame(); await nextFrame();   // the card's first picture

    const bot = new Bot(sender(s), () => [s.w, s.h], hash(g.id) || 1);
    const limit = o.seconds * 1000, giveUp = performance.now() + limit * 2 + 15000;
    let last = performance.now(), overSince = 0, entered = false;
    const wantFull = o.full && g.era === 'nextgen';
    const play = () => { roundMs = 0; driver.play(); };
    play();
    while (res.played < limit && !o.stopped() && performance.now() < giveUp) {
      await nextFrame();
      const now = performance.now(), dt = Math.min(1000, now - last); last = now;   // (a longer gap: the app was away)
      if (driver.active() !== s) { res.note = 'the card went away'; break; }
      if (s.failed) { if (!res.errors.length) res.errors.push(s.failed); break; }
      if (s.paused) { collecting = false; if (document.visibilityState === 'visible') driver.resume(); continue; }   // the phone went to another app: carry on when it's back
      if (s.state === 'playing') {
        collecting = true; overSince = 0; res.played += dt; res.score = Math.max(res.score, s.score || 0);
        if (wantFull && !entered) { entered = true; if (driver.full(true)) res.full = true; }   // (a round's end leaves full screen, so each round goes in again)
        bot.step(res.played / 1000);
        live?.({ id: g.id, played: res.played / 1000 });
      } else {
        // the round ended (or never started: the game is loading something more): lift the thumbs and press Play again
        collecting = false; entered = false; bot.release(res.played / 1000);
        if (s.state === 'over' && !overSince) { overSince = now; res.rounds++; res.score = Math.max(res.score, s.score || 0); }
        if (!s.loading && (s.state === 'ready' ? now - (overSince || t0) > 500 : now - overSince > 700)) { overSince = now; play(); }
      }
    }
    collecting = false; bot.release(res.played / 1000); driver.full(false);
    if (s.state === 'playing') res.rounds++;
    res.touches = bot.count;
    const budget = 1000 / fpsFor(s.def);
    Object.assign(res, summarise(dts, works, budget), { target: Math.round(1000 / budget), hz: screenHz() });
    if (is3D(g)) { res.draws = speed.gpu ? 'WebGPU' : 'WebGL'; const q = settledFor(g.id); if (q && q.tier != null) res.tier = `${q.tier}${q.lvl != null ? '/' + q.lvl : ''}`; res.made = frameGenFor(s.def) ? Math.max(0, Math.round(screenHz() - res.target)) : 0; }
    if (res.played < limit * .5 && !o.stopped() && !res.errors.length) res.note = `only ${(res.played / 1000).toFixed(0)} s of play`;
    return res;
  } catch (e) {
    res.errors.push('tour: ' + String(e?.message || e)); return res;
  } finally { perf.tap = null; res.played = Math.round(res.played) / 1000; res.heatAfter = power.heat; }
}

/* ---------- the whole tour ---------- */
let running = null;
/**
 * Runs the tour. driver: the feed (src/main.js). Options: ids (which games, in order; default every 3D
 * game), seconds (of play each, 20), full (Next Gen games in full screen; true), sound (leave sound and
 * vibration on; off by default), plugins (ask the native plugins; true), onStep({ i, n, game }) and onPlay({ id, played }) for a progress
 * display, signal ({ stop: true } ends it after the current frame). Gives the result; reportText()
 * turns it into the report. scenes: true flies through the engine test scenes instead of playing games
 * (src/detail-tour.js; size and only are its options).
 */
export async function runTour(driver, { ids = null, seconds = 20, full = true, sound: loud = false, plugins = true, onStep = null, onPlay = null, signal = {}, scenes = false, size = 1, only = null } = {}) {
  if (running) return running;
  if (scenes) return running = import('./detail-tour.js').then(m => m.runScenes(driver, { seconds: clamp(+seconds || 20, 1, 120), size, only, onStep, onPlay, signal })).finally(() => { running = null; });
  const all = driver.games(), list = (ids ? ids.map(id => all.find(g => g.id === id)).filter(Boolean) : all.filter(is3D));
  const o = { seconds: clamp(+seconds || 20, 1, 120), full: !!full, stopped: () => !!signal.stop };
  return running = (async () => {
    const was = { muted: sound.muted, haptics: hapticSettings.on }, t0 = Date.now();
    const out = { at: new Date().toISOString(), seconds: o.seconds, full: o.full, asked: list.length, games: [], stopped: false };
    try {
      out.phone = await phone(); out.powerBefore = powerNow();
      out.plugins = plugins ? await checkPlugins() : undefined;
      if (!loud) { sound.muted = true; hapticSettings.on = false; }   // for now only: the player's settings aren't saved over
      document.body.classList.add('touring');   // (the style sheet keeps full screen's own "Exit" pill out of the way)
      driver.begin(guestApi);
      for (let i = 0; i < list.length && !o.stopped(); i++) {
        onStep?.({ i, n: list.length, game: list[i] });
        const r = await tourGame(driver, list[i], o, onPlay);
        if (r.note === 'stopped' && !r.loaded) break;
        r.verdict = verdict(r); out.games.push(r);
        await wait(250);   // a breath between games: the last one's memory is let go
      }
    } finally {
      driver.end(); document.body.classList.remove('touring'); sound.muted = was.muted; hapticSettings.on = was.haptics;
      out.stopped = o.stopped(); out.took = Math.round((Date.now() - t0) / 1000); out.powerAfter = powerNow(); running = null;
    }
    return out;
  })();
}

/* ---------- the report ---------- */
const pct = v => (100 * v).toFixed(v < .1 ? 1 : 0) + '%';
const battery = p => p.level == null ? 'battery unknown' : `battery ${Math.round(p.level * 100)}%${p.charging ? ' (charging)' : ''}`;
const ORDER = ['NO LOAD', 'ERROR', 'NO FRAMES', 'SLOW', 'STUTTER', 'ok'];
function gameLine(r) {
  const head = `${r.verdict.padEnd(9)} ${r.id} (${r.title})${r.style ? ' · ' + r.style : ''}`;
  if (!r.loaded) return `${head} · ${r.note || 'did not load'}`;
  const parts = [`loaded in ${(r.loadMs / 1000).toFixed(1)} s`];
  if (r.frames) {
    parts.push(`${Math.round(r.fps)} of ${r.target} fps${r.made ? ` (+${r.made} made)` : ''}`, `worst 1% ${Math.round(r.low)} fps`, `longest ${Math.round(r.worst)} ms`,
      `slow ${pct(r.slow)}`, `freezes ${r.freezes}${r.early ? ` (${r.early} as a round started)` : ''}`, `game code ${r.work.toFixed(1)} ms`);
  } else parts.push('no frames timed');
  if (r.draws) parts.push(r.draws + (r.tier ? `, quality ${r.tier}` : '') + (r.full ? ', full screen' : ''));
  parts.push(`${r.rounds} round${r.rounds === 1 ? '' : 's'}, best ${r.score}`);
  if (r.heatAfter) parts.push(`phone ${heatWord(r.heatAfter)}`);
  if (r.note) parts.push(r.note);
  return [head + ' · ' + parts.join(' · '), ...r.errors.map(e => `          ! ${e}`)].join('\n');
}
/** A report's first lines: what was run (`what`, and `extra` after how long it took), the phone, its power and its settings. */
export function head(t, what, extra = '') {
  const p = t.phone;
  return [
    `Game Scroll ${what} · ${t.at.slice(0, 16).replace('T', ' ')} UTC · build ${p.build} · took ${Math.floor(t.took / 60)} min ${t.took % 60} s${extra}`,
    `\nPHONE: ${p.model} · ${p.os} · ${p.form} screen ${p.screen} · ${p.hz} Hz · ${p.chip} · WebGPU ${p.webgpu ? 'yes' : 'no'} (set to ${p.gpuPick}) · ${p.klass} class${p.cores ? ` · ${p.cores} cores` : ''}${p.memory ? ` · ${p.memory} GB` : ''}`,
    `POWER: ${battery(t.powerBefore)} then ${battery(t.powerAfter)} · ${heatWord(t.powerBefore.heat)} then ${heatWord(t.powerAfter.heat)}${t.powerAfter.saver ? ' · battery saver on' : ''}`,
    `SETTINGS: frame rate ${p.fpsPick} · frame generation ${p.frameGenPick} · reduce motion ${p.reduceMotion ? 'on' : 'off'}`,
  ];
}
/** The tour's result as the text to copy. */
export function reportText(t) {
  if (t.kind === 'scenes') return t.text;   // (the engine test scenes write their own: src/detail-tour.js)
  const n = t.games.length, by = v => t.games.filter(r => r.verdict === v).length;
  const lines = head(t, 'phone test tour', t.stopped ? ` · STOPPED after ${n} of ${t.asked} games` : '');
  if (t.plugins === null) lines.push('\nPLUGINS: this is the web version, which has none. Run the tour in the Android or iPhone app to check them.');
  else if (t.plugins) {
    const bad = t.plugins.filter(x => x.state !== 'ok');
    lines.push(`\nPLUGINS (${t.plugins.length - bad.length} of ${t.plugins.length} answered):`, ...[...bad, ...t.plugins.filter(x => x.state === 'ok')].map(x => `${x.state.padEnd(9)} ${x.name}${x.ms ? ` · ${x.ms} ms` : ''} · ${x.note}`));
  }
  const counts = ORDER.filter(v => by(v)).map(v => `${by(v)} ${v}`).join(' · ') || 'none';
  lines.push(`\nGAMES (${n} played for ${t.seconds} s each): ${counts}`,
    ...[...t.games].sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict)).map(gameLine));
  lines.push('\nSLOW: under 85% of the frame rate the game aims for. STUTTER: 3 or more freezes (frames of 70 ms or longer) in play, or 1 frame in 20 slow. worst 1%: the frame rate of the slowest hundredth of frames.');
  return lines.join('\n');
}

/* ---------- the sheet in the QA panel ---------- */
const esc = t => String(t).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
function showReport(text, driver) {
  const el = document.createElement('dialog'); el.className = 'qa-panel tour';
  el.innerHTML = `<div class="qa-head"><b>TOUR REPORT</b><span></span><button class="qa-x" aria-label="Close">✕</button></div>
    <p class="qa-help">Copy this and paste it into chat. Problems are listed first.</p>
    <div class="qa-actions"><button class="qa-copy">Copy report</button><button class="qa-lab tour-again">Run again</button></div>
    <textarea class="tour-text" readonly aria-label="Tour report"></textarea>`;
  el.querySelector('textarea').value = text;
  document.body.appendChild(el);
  el.querySelector('.qa-x').onclick = () => el.close();
  el.addEventListener('close', () => el.remove());
  el.querySelector('.qa-copy').onclick = async e => {
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied ✓'; }
    catch { const t = el.querySelector('textarea'); t.focus(); t.select(); e.target.textContent = 'Select all, then copy'; }
  };
  el.querySelector('.tour-again').onclick = () => { el.close(); openTour(driver); };
  el.showModal();
}
/** The QA panel's "Phone test tour" button: choose what to play, then watch it go. */
export function openTour(driver) {
  if (running) return;
  const all = driver.games(), choice = sets(all).filter(([, , list]) => list.length), last = store.get(LAST_KEY, null);
  if (all.some(g => g.era === 'nextgen')) choice.push([SCENES, 'Engine test scenes', [1, 2, 3, 4, 5, 6, 7, 8, 9]]);   // (not games: the Next Gen engine's detail systems, off and on; src/detail-tour.js)
  const el = document.createElement('dialog'); el.className = 'qa-panel tour';
  el.innerHTML = `<div class="qa-head"><b>PHONE TEST TOUR</b><span></span><button class="qa-x" aria-label="Close">✕</button></div>
    <p class="qa-help">A bot plays each game on this phone and times every frame, then every native part of the app is asked whether it still answers. You get one report to copy. Nothing the bot does is kept: no saves, best scores, credits or leaderboard scores.</p>
    <div class="tour-opts">
      <label>Play <select class="tour-set">${choice.map(([k, name, list]) => `<option value="${k}">${esc(name)} (${list.length})</option>`).join('')}</select></label>
      <label>for <select class="tour-secs"><option>10</option><option selected>20</option><option>30</option></select> seconds each</label>
      <label class="tour-tick"><input type="checkbox" class="tour-full" checked> Next Gen games in full screen</label>
      <label class="tour-tick"><input type="checkbox" class="tour-loud"> Sound and vibration on</label>
    </div>
    <p class="qa-help tour-est"></p>
    <div class="qa-actions"><button class="tour-go">Start</button>${last ? '<button class="qa-lab tour-last">Last report</button>' : ''}</div>`;
  document.body.appendChild(el);
  const set = el.querySelector('.tour-set'), secs = el.querySelector('.tour-secs'), est = el.querySelector('.tour-est');
  const picked = () => choice.find(([k]) => k === set.value)[2], scenes = () => set.value === SCENES;
  const paint = () => {
    for (const t of el.querySelectorAll('.tour-tick')) t.hidden = scenes();   // (full screen and sound are for games)
    // (twenty-three runs where the forest flies four and the yard and the hall three each, on WebGPU; each has a few seconds of getting ready before it)
    est.textContent = scenes() ? `Nine scenes, each flown through for ${secs.value} seconds with one of the engine's systems off, then on: about ${Math.max(1, Math.round((23 * (+secs.value + 8) + 80) / 60))} min, and longer the first time, while the systems build what they need. Leave the phone on a table with the screen on.`
      : `${picked().length} games, ${howLong(picked().length, +secs.value)}. Leave the phone on a table with the screen on; AR games may ask for the camera.`;
  };
  set.onchange = secs.onchange = paint; paint();
  el.querySelector('.qa-x').onclick = () => el.close();
  el.addEventListener('close', () => el.remove());
  if (last) el.querySelector('.tour-last').onclick = () => { el.close(); showReport(last, driver); };
  el.querySelector('.tour-go').onclick = async () => {
    const what = scenes(), ids = what ? [] : picked().map(g => g.id), seconds = +secs.value, loud = el.querySelector('.tour-loud').checked, full = el.querySelector('.tour-full').checked;
    el.close();
    // while it runs: a small bar over the top of the app, out of the game's way
    const bar = document.createElement('div'); bar.className = 'tour-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="tour-now">Phone test tour</span><i class="tour-meter"><b></b></i><button>Stop</button>';
    document.body.appendChild(bar);
    const now = bar.querySelector('.tour-now'), meter = bar.querySelector('.tour-meter b'), signal = { stop: false };
    bar.querySelector('button').onclick = () => { signal.stop = true; now.textContent = 'Stopping…'; };
    let step = { i: 0, n: ids.length || 1, game: null }, shown = -1;
    try {
      const result = await runTour(driver, {
        ids, seconds, full, sound: loud, signal, scenes: what,
        onStep(s) { step = s; shown = -1; now.textContent = `${s.i + 1} of ${s.n} · ${s.game.title} · ${s.what || 'loading'}`; meter.style.width = `${100 * s.i / s.n}%`; },
        onPlay({ played }) { const sec = Math.floor(played); if (sec === shown || signal.stop) return; shown = sec; now.textContent = `${step.i + 1} of ${step.n} · ${step.game.title} · ${sec} s`; meter.style.width = `${100 * (step.i + played / seconds) / step.n}%`; },
      });
      const text = reportText(result);
      store.set(LAST_KEY, text);
      showReport(text, driver);
    } finally { bar.remove(); }
  };
  el.showModal();
}
