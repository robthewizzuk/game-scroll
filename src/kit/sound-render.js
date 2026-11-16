// Sound rendered into buffers: the sums that make a gunshot, a gun's clicks, the tail a shot leaves in a room or
// out in the open (and, in score-render.js, a film score's stems) as plain numbers, once, before they are needed,
// instead of a few live oscillators each time. A sound written this way can have as much in it as it likes (a
// dozen filtered noise bands, metal ringing at its own pitches, a spring rattling after the bolt), because it is
// worked out once and then only played back. Nothing here needs a page: the kit's background workers run it
// (job-worker.js 'sound'), and the main thread runs the same code when there are none.
//
// The method follows how film and game sound designers build a gunshot (and Saltline, a browser shooter made in
// code, does the same): the report is layers of noise in separate bands, each with its own hold and decay, on a
// thump that drops in pitch and the push of the muzzle blast; driven into saturation; a low-pass that closes
// quickly after the crack (the top of a shot is gone in a few milliseconds, its body lasts); the action's clicks as
// struck metal (a few pitches ringing and dying, each its own length) with a short tick on top; a spring ringing
// after the bolt. Several takes of each, a little different in pitch and brightness, played in turn so no two shots
// in a row are the same. The place answers with its own tail: out in the open a few slaps off far walls and a
// long dull roll; indoors a burst of close reflections, flutter between two walls and the room's own low hum.
//
// Kit use: gunshots.js plays these; score-render.js builds on the same pieces.

/** A small seeded random number source, 0..1 (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** A word's own seed (FNV-1a). */
export function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const TAU = Math.PI * 2;
/** An empty buffer `secs` long. */
export const buf = (sr, secs) => new Float32Array(Math.max(1, Math.round(secs * sr)));
/** White noise `secs` long. */
export function noiseBuf(sr, secs, r) { const b = buf(sr, secs); for (let i = 0; i < b.length; i++) b[i] = r() * 2 - 1; return b; }
// a filter's numbers (RBJ's cookbook): lp, hp, bp (constant peak)
function coef(type, f, q, sr) {
  const w = TAU * Math.max(10, Math.min(f, sr * .47)) / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), a0 = 1 + al;
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0];
}
/** A filter over b in place: type 'lp' | 'hp' | 'bp', at f Hz. */
export function filter(b, type, f, q, sr) {
  const [b0, b1, b2, a1, a2] = coef(type, f, q, sr); let z1 = 0, z2 = 0;
  for (let i = 0; i < b.length; i++) { const x = b[i], y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; b[i] = y; }
  return b;
}
/** A filter that moves: f(t) Hz at t (0..1 through the buffer), q fixed or q(t); its numbers worked out every 32 samples. */
export function sweep(b, type, f, q, sr) {
  let z1 = 0, z2 = 0, k = null; const n = b.length;
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) k = coef(type, f(i / n), typeof q === 'function' ? q(i / n) : q, sr);
    const x = b[i], y = k[0] * x + z1; z1 = k[1] * x - k[3] * y + z2; z2 = k[2] * x - k[4] * y; b[i] = y;
  }
  return b;
}
/** Multiplies b by env(seconds). */
export function shape(b, sr, env) { for (let i = 0; i < b.length; i++) b[i] *= env(i / sr); return b; }
/** Adds src into dst from `at` seconds, times g. */
export function mix(dst, src, at, g, sr) { const o = Math.round(at * sr), n = Math.min(src.length, dst.length - o); for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * g; return dst; }
/** Adds src into dst from `at` seconds, wrapping round the end (a loop: what rings past it lands at its start). */
export function mixLoop(dst, src, at, g, sr) { const L = dst.length; let j = Math.round(at * sr) % L; if (j < 0) j += L; for (let i = 0; i < src.length; i++) { dst[j] += src[i] * g; if (++j >= L) j = 0; } return dst; }
export function peak(b) { let m = 0; for (let i = 0; i < b.length; i++) { const v = Math.abs(b[i]); if (v > m) m = v; } return m; }
/** Root mean square of b from sample a to sample e. */
export function rms(b, a = 0, e = b.length) { a = Math.max(0, a | 0); e = Math.min(b.length, e | 0); let s = 0; for (let i = a; i < e; i++) s += b[i] * b[i]; return Math.sqrt(s / Math.max(1, e - a)); }
export function scale(b, k) { for (let i = 0; i < b.length; i++) b[i] *= k; return b; }
/** Scaled so its loudest sample is `to`. */
export function norm(b, to = 1) { const p = peak(b); return p > 0 ? scale(b, to / p) : b; }
/** Saturation: tanh(x k), scaled so full scale stays full scale. */
export function drive(b, k) { const s = 1 / Math.tanh(k); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * k) * s; return b; }
/**
 * Struck metal: a sum of decaying sines, modes [[Hz, seconds to die by e, level], ...] (recursive resonators: two
 * multiplies a sample each, however long they ring). r: a random phase each, so two strikes differ.
 */
export function modes(sr, secs, list, r = null) {
  const b = buf(sr, secs);
  for (const [f, tau, a] of list) {
    if (f > sr * .46) continue;
    const w = TAU * f / sr, ph = r ? r() * TAU : 0, d = Math.exp(-1 / (tau * sr)), c = 2 * d * Math.cos(w), dd = d * d;
    const n = Math.min(b.length, Math.ceil(Math.log(1e-5 / Math.max(a, 1e-5)) / Math.log(d)) + 1);
    let y1 = a * Math.sin(ph), y0 = a / d * Math.sin(ph - w);   // (y[0] and y[-1])
    for (let i = 0; i < n; i++) { b[i] += y1; const y = c * y1 - dd * y0; y0 = y1; y1 = y; }
  }
  const at = Math.min(b.length, Math.round(4e-4 * sr)); for (let i = 0; i < at; i++) b[i] *= i / at;   // (no click from a mode that starts at full height)
  return b;
}
/** A burst of filtered noise, decaying with tau (and rising over att), normalised to 1. o: { hp, lp, bp, q, att }. */
export function burst(sr, r, secs, tau, o = {}) {
  const b = noiseBuf(sr, secs, r);
  if (o.hp) filter(b, 'hp', o.hp, .707, sr); if (o.lp) filter(b, 'lp', o.lp, .707, sr); if (o.bp) filter(b, 'bp', o.bp, o.q || 1, sr);
  shape(b, sr, o.att ? t => (1 - Math.exp(-t / o.att)) * Math.exp(-t / tau) : t => Math.exp(-t / tau));
  return norm(b);
}
/** A click of a gun's action: struck metal (modes, each pitch a little off by jit) and a short bright tick on top. */
export function click(sr, r, list, { jit = .02, ring = .6, tick = .7, tickTau = 9e-4, hp = 2500 } = {}) {
  let longest = .004; for (const m of list) longest = Math.max(longest, m[1]);
  const b = buf(sr, Math.min(.5, longest * 7 + .004));
  mix(b, modes(sr, b.length / sr, list.map(([f, d, a]) => [f * (1 + (r() * 2 - 1) * jit), d, a]), r), 0, ring, sr);
  if (tick) mix(b, burst(sr, r, .006, tickTau, { hp }), 0, tick, sr);
  return b;
}
/** A thump that drops in pitch: f0 to f1 Hz with tauF, dying with tauA. */
export function thump(sr, secs, f0, f1, tauF, tauA, att = 6e-4) {
  const b = buf(sr, secs); let ph = 0;
  for (let i = 0; i < b.length; i++) { const t = i / sr; ph += TAU * (f1 + (f0 - f1) * Math.exp(-t / tauF)) / sr; b[i] = Math.sin(ph) * Math.exp(-t / tauA) * (1 - Math.exp(-t / att)); }
  return b;
}
// the push of the muzzle blast: a quick rise and fall of pressure (the shape of a blast wave, (1 - s) e^-s)
function blast(sr, tau) { const b = buf(sr, tau * 12); for (let i = 0; i < b.length; i++) { const s = i / sr / tau; b[i] = (1 - s) * Math.exp(-s); } return b; }

// ---------------------------------------------------------------- gunshots

// Each gun's report (all of them our own numbers):
//   len: seconds; takes: how many takes are made; pitch / bright: each take's pitch and brightness, in turn;
//   bands: [[high-pass Hz, low-pass Hz, held level, decaying level, decay seconds], ...] layers of noise, each held at its
//     level for `hold` seconds (then dying with holdTau) plus a part dying from the start;
//   thump: [from Hz, to Hz, pitch fall s, decay s, level]; blast: [seconds, level] (the muzzle's push);
//   drive / reDrive: saturation before and after the filters; lp: [end Hz, mid Hz, mid falls in s, top Hz, top falls in s]
//     (the low-pass that closes after the crack); shelf: [Hz, level] extra low end; plateau: the loudness the held part
//     is brought to; mech: [[after s, level, [[Hz, s, level] ...], tick high-pass]] the action's clicks; spring: the
//     spring after the last click ([[Hz, s, level] ...], level); gain: the take's level when played.
const GUN = {
  pistol: { len: .48, takes: 4, pitch: [1, 1.035, .968, 1.015], bright: [1, .96, 1.05, 1.02], bands: [[115, 290, 1.25, .17, .046], [290, 1450, 2, .19, .034], [1450, 6200, 1.75, .11, .014]], hold: .011, holdTau: .005,
    thump: [212, 96, .015, .03, .25], blast: [4.6e-4, 2.3], drive: 1.5, lp: [960, 2200, .042, 15000, .0025], shelf: [255, .24], plateau: .78, reDrive: 1.5,
    mech: [[.017, .085, [[2830, .006, 1], [4520, .005, .75], [1710, .007, .4]], 3300], [.044, .11, [[3270, .008, 1], [5040, .007, .75], [1290, .01, .3]], 2900]], spring: [[[1120, .022, 1], [2290, .013, .4]], .014], gain: .55, tail: 'small' },
  revolver: { len: .7, takes: 4, pitch: [1, .97, 1.03, .99], bright: [1, 1.05, .95, 1.02], bands: [[90, 240, 1.5, .14, .07], [240, 1200, 2.3, .15, .05], [1200, 5500, 1.7, .08, .02]], hold: .016, holdTau: .007,
    thump: [180, 75, .02, .045, .3], blast: [5e-4, 2.8], drive: 1.7, lp: [850, 2500, .055, 15000, .0028], shelf: [230, .4], plateau: .82, reDrive: 1.6,
    mech: [[.09, .05, [[2650, .008, 1], [3900, .006, .6]], 3000]], spring: null, gain: .62, tail: 'big' },
  smg: { len: .32, takes: 5, pitch: [1, 1.03, .97, 1.015, .985], bright: [1, .96, 1.05, 1, 1.03], bands: [[120, 300, 1.2, .18, .04], [300, 1600, 2, .2, .028], [1600, 6500, 1.8, .12, .012]], hold: .008, holdTau: .004,
    thump: [240, 115, .012, .022, .22], blast: [4e-4, 2.2], drive: 1.5, lp: [1100, 2400, .03, 15000, .0022], shelf: [270, .18], plateau: .74, reDrive: 1.5,
    mech: [[.018, .07, [[3100, .005, 1], [4700, .004, .7]], 3500]], spring: [[[1350, .015, 1], [2700, .01, .35]], .012], gain: .42, tail: 'small' },
  shotgun: { len: .8, takes: 4, pitch: [1, .97, 1.025, .99], bright: [1, 1.04, .96, 1.01], bands: [[70, 200, 1.9, .12, .14], [200, 900, 2.3, .1, .06], [900, 4500, 1.4, .06, .03]], hold: .026, holdTau: .011,
    thump: [130, 55, .035, .07, .22], blast: [5e-4, 2.6], drive: 1.7, lp: [700, 2400, .08, 14000, .0032], shelf: [210, .6], plateau: .84, reDrive: 1.6,
    mech: [], spring: null, gain: .7, tail: 'big' },
  rifle: { len: .62, takes: 5, pitch: [1, .972, 1.028, .99, 1.012], bright: [1, 1.06, .95, 1.03, .98], bands: [[80, 230, 1.7, .12, .11], [230, 1000, 2.1, .11, .048], [1000, 5200, 1.55, .06, .024]], hold: .02, holdTau: .009,
    thump: [158, 64, .028, .05, .21], blast: [4.2e-4, 2.4], drive: 1.6, lp: [820, 2500, .065, 15500, .0027], shelf: [225, .5], plateau: .8, reDrive: 1.5,
    mech: [[.02, .055, [[2240, .007, 1], [3390, .006, .7], [1760, .009, .45]], 3000], [.056, .065, [[1990, .009, 1], [3010, .007, .7], [4450, .005, .45], [905, .013, .35]], 2400]], spring: [[[742, .05, 1], [1471, .032, .4]], .018], gain: .62, tail: 'big' },
  sniper: { len: .95, takes: 3, pitch: [1, .97, 1.02], bright: [1, 1.05, .96], bands: [[60, 180, 2, .1, .2], [180, 800, 2.4, .09, .08], [800, 5500, 1.7, .05, .035]], hold: .03, holdTau: .013,
    thump: [120, 48, .04, .09, .24], blast: [5.5e-4, 2.9], drive: 1.8, lp: [650, 2800, .1, 16000, .0035], shelf: [200, .7], plateau: .86, reDrive: 1.7,
    mech: [], spring: null, gain: .75, tail: 'big' },
  launcher: { len: 1.1, takes: 3, pitch: [1, .96, 1.04], bright: [1, .95, 1.05], bands: [[40, 160, 1.4, .3, .3], [160, 700, 1.6, .25, .15], [700, 3500, .8, .2, .08]], hold: .05, holdTau: .03,
    thump: [90, 40, .06, .14, .4], blast: [9e-4, 2], drive: 1.4, lp: [450, 1600, .15, 9000, .006], shelf: [160, .8], plateau: .7, reDrive: 1.3,
    mech: [], spring: null, gain: .6, tail: 'big' },
};
export const GUN_KINDS = Object.keys(GUN);
/** Which tail a gun's shot leaves ('big' | 'small'), and how loud its take plays. */
export const gunInfo = kind => GUN[kind] ? { tail: GUN[kind].tail, gain: GUN[kind].gain, takes: GUN[kind].takes } : null;

/** One take of a gun's report (mono, at sr), the n-th of its takes; r: random numbers. */
export function gunshot(kind, n, sr, r) {
  const P = GUN[kind]; if (!P) return null;
  const k = n % P.takes, pitch = P.pitch[k], bright = P.bright[k], out = buf(sr, P.len), c = out.length - Math.round(.004 * sr), u = new Float32Array(c);
  // the bands of noise, each brought to the same loudness first, then held and let go
  for (const [hp, lp, held, fall, tau] of P.bands) {
    const y = new Float32Array(c); for (let i = 0; i < c; i++) y[i] = r() * 2 - 1;
    filter(y, 'hp', hp * pitch, .707, sr); filter(y, 'hp', hp * pitch, .707, sr); filter(y, 'lp', lp * pitch * bright, .707, sr);
    const g = 1 / (rms(y, 0, .12 * sr) + 1e-9), dk = Math.exp(-1 / (tau * sr)), hk = Math.exp(-1 / (P.holdTau * sr)), H = Math.round(P.hold * sr);
    let a = fall, s = held;
    for (let i = 0; i < c; i++) { u[i] += y[i] * g * (s + a); a *= dk; if (i >= H) s *= hk; }
  }
  const [f0, f1, tf, ta, tk] = P.thump; mix(u, thump(sr, .3, f0 * pitch, f1 * pitch, tf, ta, .001), 0, tk, sr);
  mix(u, blast(sr, P.blast[0] / pitch), 0, P.blast[1], sr);
  for (let i = 0; i < c; i++) u[i] = Math.tanh(u[i] * P.drive);
  // the low-pass that closes after the crack (twice, for a steeper slope)
  const [lpEnd, lpMid, midTau, lpTop, topTau] = P.lp, dur = c / sr, lf = t => (lpEnd + lpMid * Math.exp(-t * dur / midTau)) * bright + lpTop * Math.exp(-t * dur / topTau);
  sweep(u, 'lp', lf, .6, sr); sweep(u, 'lp', lf, .6, sr);
  const lo = Float32Array.from(u); filter(lo, 'lp', P.shelf[0], .707, sr); for (let i = 0; i < c; i++) u[i] += lo[i] * P.shelf[1];
  filter(u, 'hp', 30, .707, sr);
  { const a = Math.round(.004 * sr), e = Math.round((P.hold + .004) * sr); scale(u, P.plateau / (rms(u, a, e) + 1e-12)); }
  drive(u, P.reDrive); mix(out, u, 5e-4, 1, sr);
  // the action: its clicks, and a spring after the last one
  P.mech.forEach(([at, lvl, list, hp], i) => {
    const t = 5e-4 + at * (.94 + r() * .12);
    mix(out, click(sr, r, list.map(([f, d, a]) => [f * pitch, d, a]), { hp, tick: .6, ring: .7 }), t, lvl, sr);
    if (P.spring && i === P.mech.length - 1) mix(out, modes(sr, .22, P.spring[0].map(([f, d, a]) => [f * pitch, d, a]), r), t + .002, P.spring[1], sr);
  });
  return out;
}

// The action's own sounds (not the shot): each [seconds long, [clicks: [at s, level, modes, tick high-pass, tick level]], noise: [at s, level, secs, tau, band Hz]]
const MECH = {
  empty: [.12, [[0, 1, [[2260, .005, 1], [3640, .0045, .75], [5880, .003, .5]], 2200, .9], [.0125, .16, [[3050, .003, 1], [4700, .0025, .6]], 3200, .5]], []],   // the hammer falls on nothing
  magout: [.25, [[0, .7, [[1450, .012, 1], [2380, .009, .6], [690, .02, .4]], 1800, .5]], [[.005, .25, .12, .04, 1600]]],   // the magazine let go and slid out
  magin: [.25, [[0, .9, [[1900, .01, 1], [2950, .008, .7], [880, .016, .5]], 2400, .8], [.03, .55, [[2600, .006, 1], [4100, .005, .6]], 3000, .7]], []],   // pushed home and seated
  catch: [.3, [[0, 1, [[1700, .02, 1], [2600, .014, .6], [3900, .008, .4], [760, .03, .4]], 2400, .9]], [[.002, .3, .06, .02, 2800]]],   // the bolt or slide let go forward
  pumpBack: [.2, [[0, .8, [[1200, .014, 1], [2000, .01, .6]], 1600, .6]], [[.004, .5, .1, .035, 1200]]],   // a shotgun's pump (or a bolt) back
  pumpFwd: [.2, [[.02, 1, [[1500, .012, 1], [2400, .009, .7], [640, .02, .4]], 2000, .8]], [[0, .4, .07, .025, 1500]]],   // and forward
  shell: [.14, [[0, .6, [[3100, .006, 1], [5200, .004, .5]], 3000, .4]], [[0, .2, .05, .02, 2500]]],   // one round pushed in
  draw: [.25, [[.12, .4, [[2100, .008, 1], [3300, .006, .5]], 2600, .5]], [[0, .4, .16, .06, 2200]]],   // out of the holster, cloth and a click
};
export const MECH_KINDS = Object.keys(MECH);
/** One of the action's sounds ('empty', 'magout', 'magin', 'catch', 'pumpBack', 'pumpFwd', 'shell', 'draw'), at pitch p. */
export function mechSound(what, p, sr, r) {
  const M = MECH[what]; if (!M) return null;
  const [len, clicks, rubs] = M, out = buf(sr, len);
  for (const [at, lvl, list, hp, tick] of clicks) mix(out, click(sr, r, list.map(([f, d, a]) => [f * p, d, a]), { hp, tick }), at, lvl, sr);
  for (const [at, lvl, secs, tau, band] of rubs) mix(out, burst(sr, r, secs, tau, { bp: band * p, q: 1.2, att: .003 }), at, lvl * .5, sr);
  filter(out, 'hp', 60, .707, sr);
  return norm(out, .9);
}

// ---------------------------------------------------------------- the place's tail

// out in the open: slaps off far walls [[at s, dB, low-pass Hz, pan -1..1, smear ms]], a dull diffuse roll, a far echo, a rumble
const OUT = {
  big: { len: 2.3, slaps: [[[.071, -12, 4600, -.75, 2.5], [.118, -11.5, 3500, .65, 3.4], [.183, -12.5, 2600, -.35, 2.4], [.271, -18.5, 1600, .55, 4]], [[.088, -11.8, 4300, .7, 3], [.137, -11.8, 3300, -.55, 2.6], [.192, -12.2, 2300, .4, 3.7], [.297, -18.5, 1450, -.45, 3]]],
    slapHold: .022, slapTau: .01, lp0: 3800, lp1: 620, early: -15.5, earlyTau: .028, floor: -14.5, lateT: .85, farT: .45, far: -18.5, rumble: -22.5, ceil: .75, ref: .7 },
  small: { len: 1.6, slaps: [[[.069, -12.2, 5000, -.65, 2.3], [.127, -12.4, 3800, .7, 3], [.176, -13, 2700, -.3, 3.2]]],
    slapHold: .014, slapTau: .0085, lp0: 4600, lp1: 720, early: -15.5, earlyTau: .028, floor: -15, lateT: .58, farT: .36, far: -22.5, rumble: -28, ceil: .6, ref: .53 },
};
// indoors: a burst of close reflections, flutter between two walls, a dense tail, the room's low hum
const IN = {
  big: { len: 1.35, lp0: 7500, lp1: 1250, tau: .16, early: -13.5, level: -9.5, modes: -21.5, ceil: .7, ref: .7 },
  small: { len: .95, lp0: 8200, lp1: 1650, tau: .11, early: -13.5, level: -10.5, modes: -27, ceil: .55, ref: .53 },
};
const dB = x => Math.pow(10, x / 20);
const softCeil = (b, c) => { for (let i = 0; i < b.length; i++) b[i] = c * Math.tanh(b[i] / c); return b; };
// the loudest 10 ms of b
function loudest(b, sr) { const w = Math.round(.01 * sr), s = Math.round(.002 * sr); let m = 0; for (let i = 0; i + w <= b.length; i += s) m = Math.max(m, rms(b, i, i + w)); return m; }
// a simple echo inside one slap (a comb): its smear
function smear(b, sr, ms, fb, wet) { const d = Math.max(1, Math.round(ms / 1000 * sr)), y = new Float32Array(b.length); for (let i = 0; i < b.length; i++) y[i] = b[i] + (i >= d ? y[i - d] * fb : 0); const k = 1 - fb * .5; for (let i = 0; i < b.length; i++) b[i] = b[i] * (1 - wet) + y[i] * k * wet; return b; }
const range = (r, a, b) => a + (b - a) * r();

/** The tail a shot leaves outside: [left, right]. size 'big' | 'small'; n: which of its takes. */
export function tailOut(size, n, sr, r) {
  const P = OUT[size] || OUT.big, r2 = seeded(Math.floor(r() * 1e9)), L = P.len, ref = P.ref;
  const slaps = P.slaps[n % P.slaps.length].map(([at, lv, lp, pan, ms]) => {
    const g = noiseBuf(sr, .16, r2); filter(g, 'hp', 300, .7, sr); filter(g, 'lp', lp, .7, sr);
    shape(g, sr, t => (1 - Math.exp(-t / .002)) * (t < P.slapHold ? 1 : Math.exp(-(t - P.slapHold) / P.slapTau))); norm(g); smear(g, sr, ms, .5, .7);
    mix(g, modes(sr, .1, [[range(r2, 110, 190), .05, 1], [range(r2, 240, 420), .035, .6]], r2), .002, .12, sr);
    return { b: scale(g, ref * dB(lv) / (loudest(g, sr) + 1e-9)), at: at - .007, pan };
  });
  const shared = noiseBuf(sr, L, r2), far = burst(sr, r2, .6, .14, { hp: 80, lp: 650, att: .04 }); scale(far, ref * dB(P.far) / (loudest(far, sr) + 1e-9));
  const rumble = noiseBuf(sr, L - .1, r2); filter(rumble, 'lp', 130, .7, sr); filter(rumble, 'hp', 34, .7, sr);
  shape(rumble, sr, t => (1 - Math.exp(-t / .05)) * Math.exp(-Math.pow(t / P.lateT, 2))); scale(rumble, ref * dB(P.rumble) / (rms(rumble, .1 * sr, .3 * sr) + 1e-9));
  const side = ch => {
    const rc = seeded(Math.floor(r2() * 1e9) + ch * 977), out = buf(sr, L), sgn = ch ? 1 : -1, own = noiseBuf(sr, L, rc), late = buf(sr, L);
    for (let i = 0; i < late.length; i++) late[i] = shared[i] * .72 + own[i] * .68;   // (partly the same in both ears: wide, not two separate rooms)
    const f = t => P.lp0 * Math.pow(P.lp1 / P.lp0, Math.pow(t, .55)); sweep(late, 'lp', f, .6, sr); filter(late, 'hp', 140, .7, sr);
    const early = Float32Array.from(late);
    shape(early, sr, t => (1 - Math.exp(-t / .003)) * Math.exp(-t / P.earlyTau)); shape(late, sr, t => (1 - Math.exp(-t / .03)) * Math.exp(-Math.pow(t / P.lateT, 2)));
    mix(out, early, .004, ref * dB(P.early) / (rms(early, 0, .05 * sr) + 1e-9), sr); mix(out, late, .004, ref * dB(P.floor) / (rms(late, .1 * sr, .2 * sr) + 1e-9), sr);
    for (const s of slaps) mix(out, s.b, s.at + (s.pan * sgn > 0 ? 0 : Math.abs(s.pan) * 9e-4), 1 + .4 * s.pan * sgn, sr);   // (a slap from the left reaches the left ear first and louder)
    mix(out, far, P.farT + (ch ? 7e-4 : 0), ch ? .85 : 1.1, sr); mix(out, rumble, .03, 1, sr);
    return softCeil(out, P.ceil);
  };
  return [side(0), side(1)];
}
/** The tail a shot leaves indoors: [left, right]. */
export function tailIn(size, n, sr, r) {
  const P = IN[size] || IN.big, r2 = seeded(Math.floor(r() * 1e9)), L = P.len, ref = P.ref, shared = noiseBuf(sr, L, r2), refl = [];
  for (let m = 0; m < 18; m++) refl.push([.006 + .085 * Math.pow((m + r2()) / 18, 1.3), Math.pow(.9, m) * range(r2, .6, 1.1), r2() * 2 - 1, range(r2, 3200, 7500)]);
  const flutter = n & 1 ? .053 : .044;
  const side = ch => {
    const rc = seeded(Math.floor(r2() * 1e9) + ch * 613), out = buf(sr, L), sgn = ch ? 1 : -1, early = buf(sr, .5);
    for (const [at, g, pan, lp] of refl) mix(early, burst(sr, rc, .03, .005, { hp: 350, lp, att: 4e-4 }), at + (pan * sgn > 0 ? 0 : 6e-4), g * (1 + .4 * pan * sgn), sr);
    for (let k = 1; k < 8; k++) mix(early, burst(sr, rc, .04, .007, { hp: 600, lp: 5200 / (1 + k * .3) }), flutter * k * (ch ? 1.012 : .99), .45 * Math.pow(.72, k), sr);
    mix(out, early, 0, ref * dB(P.early) / (rms(early, 0, .05 * sr) + 1e-9), sr);
    const own = noiseBuf(sr, L, rc), late = buf(sr, L); for (let i = 0; i < late.length; i++) late[i] = shared[i] * .7 + own[i] * .7;
    sweep(late, 'lp', t => P.lp0 * Math.pow(P.lp1 / P.lp0, Math.pow(t, .5)), .6, sr); filter(late, 'hp', 170, .7, sr);
    shape(late, sr, t => (1 - Math.exp(-t / .006)) * Math.exp(-t / P.tau));
    mix(out, late, .004, ref * dB(P.level) / (rms(late, .1 * sr, .2 * sr) + 1e-9), sr);
    for (const [hz, g] of [[61, 1], [92, .75], [131, .55], [184, .35]]) {   // the room's own low notes, ringing on
      const m = noiseBuf(sr, Math.min(L - .05, .9), rc); filter(m, 'bp', hz * (n & 1 ? 1.05 : 1), 8, sr);
      shape(m, sr, t => (1 - Math.exp(-t / .02)) * Math.exp(-t / (P.tau * 1.25)));
      mix(out, m, .01, g * ref * dB(P.modes) / (rms(m, .1 * sr, .2 * sr) + 1e-9), sr);
    }
    return softCeil(out, P.ceil);
  };
  return [side(0), side(1)];
}

/**
 * Renders one sound by name (what the background worker and the main thread both call): { what: 'gun', kind, n } a
 * take of a report; { what: 'mech', kind, pitch }; { what: 'tail', place: 'in' | 'out', size, n }. sr: samples a
 * second; seed: the same seed gives the same sound. An array of channels (Float32Array each).
 */
export function renderSound(o) {
  const sr = o.sr || 44100, r = seeded(o.seed ?? seedOf(JSON.stringify(o)));
  if (o.what === 'gun') { const b = gunshot(o.kind, o.n || 0, sr, r); return b ? [b] : null; }
  if (o.what === 'mech') { const b = mechSound(o.kind, o.pitch || 1, sr, r); return b ? [b] : null; }
  if (o.what === 'tail') return (o.place === 'in' ? tailIn : tailOut)(o.size || 'big', o.n || 0, sr, r);
  return null;
}
