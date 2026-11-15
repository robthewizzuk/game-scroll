// Heat planned ahead: a model of how warm this phone gets, fitted as it is played, so a game steps down a
// little before the phone gets warm and slows itself down, instead of after (Rob's pick 3, 2026-11-15).
//
// Phones throttle on heat: past a line the phone lowers its own clocks, frames come late, and the quality steps
// (hd3d.js) only hear of it once the phone already says it is warm (src/kit/power.js heat), by which time the
// game is stuttering and stays hot for minutes. Heat is slow and simple, though: a phone, like anything warm, is
// close to one lump that is heated by the work done in it and loses heat to the room in proportion to how much
// warmer than the room it is (an RC circuit: the heat it holds is the capacitor, the way out to the air the
// resistor). In Android's thermal headroom h (0 cool, 1 where it slows itself down; plugins/power-state):
//
//   dh/dt = a u - b h + c          u: the load (the share of each frame the CPU and the chip are busy)
//
// so at a steady load it settles at h = (a u + c) / b, getting there with a time constant of 1 / b (minutes).
// The three numbers are this phone's own, fitted live (recursive least squares, forgetting old readings slowly)
// from the headroom read every 3 s while a round is played, averaged over 15 s windows (the reading is noisy,
// and a step of 15 s in it says more than one of 3), and kept on the phone for the next time.
//
// From the fit:
//   heat.ahead   at the load full quality makes, the phone would reach the warm line (WARM) within LOOK seconds:
//                the 3D kit takes its hot steps now (one resolution step, one tier lower from the next round), frame
//                generation's power saving starts (power.saving: 'the phone is heating up'), and big bright areas are
//                dimmed a little on OLED screens (oled()). It lets go once full quality wouldn't reach it for a while.
//   heat.cap(rel)   the highest quality tier the phone can hold for as long as it is played (where it would settle
//                below LINE), so a game doesn't climb to a tier it would only have to give up again, hot.
//
// The load is the game's own measure of itself, not the battery's current (which the screen and the radio share,
// and which reads nothing while charging): the share of each frame the game's update and draw took (src/perf.js),
// plus the chip's share where WebGPU times it (hd3d.js); where it doesn't, the chip is taken to be as busy as the
// CPU. A throttled chip is busier for the same work, so the load reads high while the phone is slowed: the fit
// then expects a little more heat than comes, which errs the safe way.
//
// Where the phone doesn't say its headroom (iPhone, Android 10 and older, the web), nothing is fitted and only the
// reactive steps (power.heat) work, as before.
import { Capacitor } from '@capacitor/core';
import { power, onRead, pace, heatingUp } from './power.js';
import { store } from '../util.js';

/** The headroom where power.js calls the phone warm (heatOf), the line a tier should settle under, how far ahead (s) to look. */
export const WARM = .85, LINE = .8, LOOK = 90;
const HOLD = 60000, WIN = 15000, MIN_N = 8, KEY = 'gs_heat', SAVE_MS = 60000;
// the fit's starting guess for a phone it hasn't met (per minute): a time constant of 5 minutes, settling at .4
// idle and at 1.2 under a full load (a phone that throttles in every 3D game played flat out, as the Fold does on ultra)
const PRIOR = [.2, .16, .08], P0 = .04, NOISE = .0025, FORGET = .98;

const dot3 = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];

/** The phone's heat as one lump (pure: tests). th = [b, a, c] of dh/dt = -b h + a u + c, per minute. */
export class HeatModel {
  constructor(s) {
    this.th = Array.isArray(s?.th) && s.th.length === 3 && s.th.every(Number.isFinite) ? s.th.slice() : PRIOR.slice();
    this.P = Array.isArray(s?.P) && s.P.length === 9 && s.P.every(Number.isFinite) ? s.P.slice() : [P0, 0, 0, 0, P0, 0, 0, 0, P0];
    this.n = s?.n | 0;
  }
  get b() { return this.th[0]; } get a() { return this.th[1]; } get c() { return this.th[2]; }
  /** One window: headroom h0 then h1, dt seconds apart, at load u. */
  add(h0, h1, u, dt) {
    const m = dt / 60; if (!(m > 0) || !Number.isFinite(h0 + h1 + u)) return;
    const x = [-(h0 + h1) / 2, u, 1], y = (h1 - h0) / m, P = this.P;
    const Px = [P[0] * x[0] + P[1] * x[1] + P[2] * x[2], P[3] * x[0] + P[4] * x[1] + P[5] * x[2], P[6] * x[0] + P[7] * x[1] + P[8] * x[2]];
    const s = NOISE + dot3(x, Px), e = y - dot3(x, this.th);
    for (let i = 0; i < 3; i++) this.th[i] += Px[i] / s * e;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) P[i * 3 + j] = (P[i * 3 + j] - Px[i] * Px[j] / s) / FORGET;
    // (forgetting grows the uncertainty when nothing new comes in: kept no wider than where it started)
    const tr = P[0] + P[4] + P[8]; if (tr > 3 * P0) for (let i = 0; i < 9; i++) P[i] *= 3 * P0 / tr;
    this.n++;
  }
  /** Fitted well enough to plan by: enough windows, and numbers a phone could have (a time constant of 20 s to 50 min, more work makes more heat). */
  get ok() { return this.n >= MIN_N && this.b >= .02 && this.b <= 3 && this.a > .01; }
  /** Where the headroom settles at load u. */
  steady(u) { return (this.a * u + this.c) / this.b; }
  /** Seconds from headroom h until it reaches `line` at load u (Infinity: it never does; 0: it already has). */
  secsTo(h, u, line) {
    if (h >= line) return 0;
    const s = this.steady(u); if (!(s > line) || !(this.b > 0)) return Infinity;
    return -Math.log((line - s) / (h - s)) / this.b * 60;
  }
  /** Headroom t seconds on from h at load u. */
  at(h, u, t) { const s = this.steady(u); return s + (h - s) * Math.exp(-this.b * t / 60); }
  pack() { return { th: this.th.map(v => +v.toFixed(5)), P: this.P.map(v => +v.toPrecision(4)), n: this.n }; }
}

/** The highest tier (3 down to 0) whose load would settle under `line` (pure: tests); rel(t): tier t's chip work for the same frames as now's, as a share of now's (null: not a tier here). Never more than one below `drawn`, the tier the load was measured on. */
export function holdable(model, cpu, gpu, rel, drawn, line = LINE) {
  if (!model?.ok || !(cpu + gpu > 0)) return 3;
  for (let t = 3; t >= 0; t--) {
    const r = rel(t); if (r == null) continue;
    if (model.steady(cpu + gpu * r) <= line) return Math.max(t, drawn - 1);
  }
  return Math.max(0, drawn - 1);
}

const saved = store.get(KEY, null);
const model = new HeatModel(saved);
// the window being gathered: readings of the headroom, frames' time and work, the chip's time
let W = fresh(Date.now()), prev = null, lastWant = -1e9, lastSave = 0, lastFrame = -1e9, fast = false;
function fresh(t) { return { t0: t, hs: [], dt: 0, n: 0, work: 0, gpu: 0, gpuN: 0 }; }
let gpuMs = null, gpuAt = -1e9;

export const heat = {
  model,
  /** The last window's: headroom, load (cpu + gpu shares), and the load at full quality (measured while nothing was stepped down for heat). */
  h: null, u: null, cpu: 0, gpu: 0, full: null,
  /** Where the headroom settles at the full load, and seconds until the warm line at it (null: not fitted). */
  settles: null, secs: null,
  /** Full quality would make the phone warm within LOOK seconds: take the hot steps now. */
  ahead: false,
  /** Tests and screenshots: a fixed OLED dimming strength (0..1), or null to follow the heat. */
  oledForce: null,
  /** The chip's time a frame (WebGPU timestamps: hd3d.js), and when it was read. */
  get gpuMs() { return performance.now() - gpuAt < 1500 ? gpuMs : null; },
  /** Each frame of play (src/perf.js): dt and work in ms. */
  frame(dt, work) {
    W.dt += dt; W.n++; W.work += Math.min(work, dt); lastFrame = performance.now();
    if (!fast) { fast = true; pace('heat', 3000); }
  },
  /** The chip's time a frame, as WebGPU timestamps come back (hd3d.js). */
  chip(ms) { if (ms > 0 && ms < 1000) { gpuMs = ms; gpuAt = performance.now(); W.gpu += ms; W.gpuN++; } },
  /** The highest tier this phone holds without getting warm (3 where it can't say): rel(t) as in holdable(). */
  cap(rel, drawn) { return holdable(model, this.cpu, this.gpu, rel, drawn); },
  /** How strongly big bright areas are dimmed now (0..1, eased over a couple of seconds): on a phone's OLED screen while saving power. */
  oled(now = performance.now()) {
    if (this.oledForce != null) { oledT = now; return oledK = this.oledForce; }   // (pinned: at once, for a frozen A/B)
    const want = phone && (power.saving || this.ahead) ? 1 : 0, dt = Math.min(1000, Math.max(0, now - oledT)); oledT = now;
    oledK += (want - oledK) * Math.min(1, dt / 2000); if (Math.abs(want - oledK) < .002) oledK = want;
    return oledK;
  },
  /** In words, for the frame lab. */
  text() {
    if (power.headroom == null || power.headroom < 0) return 'heat plan: this phone doesn\'t say its headroom';
    const tau = model.b > 0 ? 1 / model.b : 0;
    if (!model.ok) return `heat plan: learning this phone (${model.n} of ${MIN_N} windows)`;
    const tail = this.secs == null ? '' : this.secs === Infinity ? ', never warm' : this.secs === 0 ? ', warm now' : `, warm in ${Math.round(this.secs)} s`;
    return `heat plan: τ ${tau.toFixed(1)} min · full load ${this.full != null ? this.full.toFixed(2) : '?'} settles at hr ${this.settles != null ? this.settles.toFixed(2) : '?'}${tail}${this.ahead ? ' · STEPPED DOWN AHEAD' : ''}`;
  },
  /** Another game came up (src/perf.js): its load is its own, so the last game's isn't planned by (the fit, the phone's own, stays). */
  forget() { this.cpu = this.gpu = 0; this.u = this.full = this.settles = this.secs = null; },
  /** Tests: one window by hand ({ h, u, dt (s), now (ms) }), as a reading would close it. */
  step(o) { close(o.h, o.u, o.cpu ?? o.u / 2, o.gpu ?? o.u / 2, o.dt * 1000, o.now ?? Date.now()); },
  /** Tests: forget the fit and the plan. */
  reset(s) { Object.assign(model, new HeatModel(s)); prev = null; this.ahead = false; this.full = this.u = this.h = this.settles = this.secs = null; lastWant = -1e9; heatingUp(false); },
};
const phone = Capacitor.isNativePlatform();
let oledK = 0, oledT = performance.now();

// a reading came in: add it to the window, and close the window once it has run WIN
function read() {
  const now = Date.now(), h = power.headroom;
  if (h != null && h >= 0) W.hs.push(h);
  if (now - W.t0 < WIN) return;
  const w = W; W = fresh(now);
  const span = now - w.t0, played = w.dt / span;
  if (fast && performance.now() - lastFrame > 5000) { fast = false; pace('heat', 0); }
  if (w.hs.length < 2) { prev = null; return; }
  const hm = w.hs.reduce((a, b) => a + b, 0) / w.hs.length;
  if (played < .6) { prev = { h: hm, t: now - span / 2, ok: false }; release(now); return; }   // (not a round: its heat is known, its load isn't)
  // (the chip's share: its ms a frame over the frames' average length)
  const cpu = Math.min(1, w.work / w.dt), gpu = w.gpuN ? Math.min(1, (w.gpu / w.gpuN) / (w.dt / w.n)) : cpu;
  close(hm, cpu + gpu, cpu, gpu, span, now);
}
function close(h, u, cpu, gpu, span, now) {
  const mid = now - span / 2;
  if (prev?.ok && mid - prev.t < 2.5 * WIN) model.add(prev.h, h, u, (mid - prev.t) / 1000);
  prev = { h, t: mid, ok: true };
  Object.assign(heat, { h, u, cpu, gpu });
  // the load at full quality: what the game asks while nothing is stepped down for heat
  const cut = heat.ahead || power.heat >= 1;
  if (!cut) heat.full = heat.full == null ? u : heat.full + (u - heat.full) * .3;
  const ref = heat.full ?? u;
  if (!model.ok) { heat.settles = heat.secs = null; release(now); return; }
  heat.settles = model.steady(ref); heat.secs = model.secsTo(h, ref, WARM);
  if (heat.secs < LOOK) { lastWant = now; if (!heat.ahead) { heat.ahead = true; heatingUp(true); } }
  else release(now);
  if (now - lastSave > SAVE_MS) { lastSave = now; store.set(KEY, model.pack()); }
}
function release(now) { if (heat.ahead && now - lastWant > HOLD) { heat.ahead = false; heatingUp(false); } }

onRead(read);
