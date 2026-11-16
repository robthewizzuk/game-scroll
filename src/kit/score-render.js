// A film score rendered into loops: the stems a game's action music is mixed from (a low drone, sustained strings, a
// pulsing ostinato, ticking percussion, big drums, brass swells and a high lift for the last stand), each worked out
// once as a seamless loop a few bars long, plus the one-off moments laid over them (an orchestral hit, a riser that
// builds to an impact on a bar line, stings for winning, losing and finding something). The game then only says how
// intense things are: the stems come in and out under it, the way film and game composers write music to be mixed
// live (Saltline, a browser shooter made in code, does the same; the music here, its moods and its notes, are ours).
//
// Everything is plain numbers, so the kit's background workers make it (job-worker.js 'sound', what: 'score') while a
// round loads; where there are none, score.js steps the same generators a few milliseconds at a time.
// Kit use only: games reach it through gs.sound.score.
import { seeded, seedOf, buf, filter, sweep, shape, mixLoop, mix, rms, scale, noiseBuf, modes, thump, burst, norm, peak } from './sound-render.js';

const TAU = Math.PI * 2;
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const PCS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
// chord shapes, in semitones above their root
const QUAL = { m: [0, 3, 7], M: [0, 4, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], add9: [0, 3, 7, 14] };
// The moods (our own writing): tempo, the scale its melodies keep to, four chords of two bars each (root above the key,
// shape), the drum pattern (16 steps a bar: 2 a big drum, 1 a low tom, 0 none), the pulse (16 steps: which note of the
// chord, -1 rest) and how the stems sit.
export const MOODS = {
  tense: { tempo: 96, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'm']], drums: ['2000000010002000', '2000001000102010'], pulse: '0.20.10.20.10.20', motif: [7, 12, 10, 5, 7, 3, 2, 0] },
  heroic: { tempo: 104, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], drums: ['2000100020001000', '2000100020101011'], pulse: '0020102000201020', motif: [0, 7, 12, 10, 8, 7, 3, 7] },
  dark: { tempo: 84, scale: [0, 1, 3, 5, 7, 8, 10], chords: [[0, 'm'], [1, 'M'], [0, 'm'], [10, 'M']], drums: ['2000000000000000', '2000000010000000'], pulse: '0...1...0...2...', motif: [0, 1, 0, -2, 0, 3, 1, 0] },
  sad: { tempo: 72, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 'm'], [8, 'M7'], [5, 'm'], [0, 'sus2']], drums: ['2000000000000000', '2000000000001000'], pulse: '0..2..1..2..0..2', motif: [7, 8, 7, 5, 3, 5, 2, 0] },
  chase: { tempo: 128, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']], drums: ['2010001020100010', '2010201020101011'], pulse: '0202010202010201', motif: [12, 10, 7, 10, 12, 15, 14, 12] },
  explore: { tempo: 80, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 'add9'], [9, 'm'], [5, 'M7'], [7, 'sus4']], drums: ['2000000000000000', '2000000000100000'], pulse: '0.2.1.2.0.2.1.2.', motif: [4, 7, 9, 7, 11, 9, 7, 4] },
};
export const STEMS = ['drone', 'strings', 'pulse', 'ticks', 'drums', 'brass', 'lift'];
// each stem's loop in bars, samples a second and loudness (RMS) it is brought to
const STEM = { drone: [4, 16000, .065], strings: [8, 22050, .058], pulse: [8, 16000, .062], ticks: [1, 22050, .026], drums: [2, 16000, .11], brass: [8, 16000, .07], lift: [8, 22050, .055] };
export const ONESHOTS = ['hit', 'riser', 'impact', 'win', 'lose', 'found'];

/** A score's plan from its options: tempo, seconds a beat and a bar, the key's root (MIDI), the chords as notes. */
export function plan({ mood = 'tense', key = 'D', tempo = null, seed = 1 } = {}) {
  const M = MOODS[mood] || MOODS.tense, pc = PCS[key] ?? (Number.isFinite(+key) ? ((+key % 12) + 12) % 12 : 2), bpm = tempo || M.tempo;
  const root = 36 + pc + (pc > 7 ? -12 : 0) + 12;   // (the key's note in the third octave down: D3, A2...)
  return { mood, M, bpm, beat: 60 / bpm, bar: 240 / bpm, root, seed, chords: M.chords.map(([r, q]) => ({ root: root + r, notes: QUAL[q].map(x => root + r + x) })) };
}
/** How long each stem's loop is, in seconds. */
export const stemLength = (P, name) => STEM[name][0] * P.bar;

// ---------------------------------------------------------------- voices (each a mono note, into a buffer)

// a saw that doesn't alias (polyBLEP)
function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
function saws(sr, secs, f, n, cents, r, vib = null) {
  const b = buf(sr, secs), ph = [], df = []; for (let k = 0; k < n; k++) { ph.push(r()); df.push(Math.pow(2, ((n > 1 ? k / (n - 1) : .5) - .5) * 2 * cents / 1200)); }
  for (let i = 0; i < b.length; i++) {
    const t = i / sr, v = vib ? 1 + vib.depth * Math.min(1, t / vib.delay) * Math.sin(TAU * vib.rate * t + vib.ph) : 1; let s = 0;
    for (let k = 0; k < n; k++) { const dt = f * df[k] * v / sr; let p = ph[k] + dt; if (p >= 1) p -= 1; ph[k] = p; s += 2 * p - 1 - blep(p, dt); }
    b[i] = s / n;
  }
  return b;
}
const env = (a, len, rel) => t => (t < a ? t / a : 1) * (t > len ? Math.max(0, 1 - (t - len) / rel) : 1);
// a string section: three bows a little apart in pitch, a slow vibrato, warm
function strings(sr, len, f, r, { att = .35, rel = .7, bright = 1 } = {}) {
  const b = saws(sr, len + rel, f, 3, 9, r, { rate: 4.8 + r() * .8, depth: .0028, delay: .4, ph: r() * TAU });
  sweep(b, 'lp', t => (900 + 1300 * Math.min(1, t * (len + rel) / .6)) * bright * (1 - .35 * t), .7, sr);
  filter(b, 'hp', Math.max(60, f * .6), .7, sr);
  const bow = noiseBuf(sr, len + rel, r); filter(bow, 'bp', Math.min(f * 4, sr * .4), 2, sr); for (let i = 0; i < b.length; i++) b[i] += bow[i] * .04;
  return shape(b, sr, env(att, len, rel));
}
// a short plucked or bowed note: bright, then closing
function pluck(sr, len, f, r, { decay = .16, open = 2800 } = {}) {
  const b = saws(sr, len + .1, f, 2, 6, r);
  sweep(b, 'lp', t => 300 + open * Math.exp(-t * (len + .1) / (decay * .7)), .9, sr);
  return shape(b, sr, t => Math.min(1, t / .004) * Math.exp(-t / decay));
}
// brass: a scoop up into the note, the bell opening as it swells
function brass(sr, len, f, r, { att = .12, rel = .35, open = 2200 } = {}) {
  const n = buf(sr, len + rel), ph = [r(), r()]; let k = 0;
  for (let i = 0; i < n.length; i++) { const t = i / sr, ff = f * Math.pow(2, -.35 / 12 * Math.exp(-t / .05)); for (let j = 0; j < 2; j++) { const dt = ff * (j ? 1.0035 : .9965) / sr; let p = ph[j] + dt; if (p >= 1) p -= 1; ph[j] = p; k = 2 * p - 1 - blep(p, dt); n[i] += k * .5; } }
  sweep(n, 'lp', t => { const s = t * (len + rel); return 280 + open * Math.min(1, s / (att * 1.6)) * (s > len ? Math.max(.25, 1 - (s - len) / rel) : 1); }, 1.1, sr);
  return shape(n, sr, env(att, len, rel));
}
// a low drone: the note, its octave and a darker sawtooth breathing under a slow filter
function droneNote(sr, len, f, r) {
  const b = saws(sr, len, f, 2, 5, r); sweep(b, 'lp', t => 180 + 140 * (.5 + .5 * Math.sin(TAU * t * 2 + 1)), .8, sr);
  let p1 = r(), p2 = r(); for (let i = 0; i < b.length; i++) { p1 += f / sr; p2 += 2 * f / sr; b[i] = b[i] * .55 + Math.sin(TAU * p1) * .5 + Math.sin(TAU * p2) * .18; }
  return b;
}
// big drum (a taiko's skin dropping in pitch, the stick's slap, the shell) and a low tom
function taiko(sr, r, f = 52) { const b = thump(sr, 1.1, f * 2.3, f, .025, .38); mix(b, burst(sr, r, .1, .025, { bp: 700, q: 1.2 }), 0, .35, sr); mix(b, burst(sr, r, .5, .14, { bp: 170, q: 1.5 }), 0, .45, sr); return norm(b, .9); }
function tom(sr, r, f = 88) { const b = thump(sr, .55, f * 1.9, f, .018, .2); mix(b, burst(sr, r, .06, .015, { bp: 1300, q: 1 }), 0, .25, sr); return norm(b, .7); }
function tick(sr, r, accent) { const b = burst(sr, r, .05, accent ? .02 : .011, { hp: 5200 }); mix(b, modes(sr, .06, [[1850 + r() * 60, .025, .6], [3120, .015, .3]], r), 0, accent ? .5 : .25, sr); return b; }
function crash(sr, r, len = 2.2) { const b = noiseBuf(sr, len, r); filter(b, 'hp', 3200, .7, sr); sweep(b, 'lp', t => 12000 - 7000 * t, .6, sr); shape(b, sr, t => Math.min(1, t / .004) * Math.exp(-t / .6)); return norm(b, .6); }

// ---------------------------------------------------------------- the room the orchestra is in

// a small stereo hall (eight combs and two all-passes a side, freeverb's layout), run over the loop twice so its tail
// wraps round and the loop rings on seamlessly
function* hall(L, R, sr, { wet = .25, size = .84, damp = .35, loop = true }) {
  const CB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AP = [556, 441], k = sr / 44100, out = [new Float32Array(L.length), new Float32Array(L.length)];
  for (const [ci, x] of [[0, L], [1, R]]) {
    const spread = ci ? 23 : 0, cb = CB.map(d => ({ b: new Float32Array(Math.max(1, Math.round((d + spread) * k))), i: 0, f: 0 })), ap = AP.map(d => ({ b: new Float32Array(Math.max(1, Math.round((d + spread) * k))), i: 0 }));
    const passes = loop ? 2 : 1, n = x.length, o = out[ci];
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < n; i++) {
        const inp = (x[i] + (ci ? L[i] : R[i]) * .3) * .015; let s = 0;
        for (const c of cb) { const y = c.b[c.i]; c.f = y * (1 - damp) + c.f * damp; c.b[c.i] = inp + c.f * size; if (++c.i >= c.b.length) c.i = 0; s += y; }
        for (const a of ap) { const y = a.b[a.i]; a.b[a.i] = s + y * .5; s = y - s; if (++a.i >= a.b.length) a.i = 0; }
        if (pass === passes - 1) o[i] = s;
        if ((i & 32767) === 32767) yield;
      }
      yield;
    }
  }
  for (let i = 0; i < L.length; i++) { L[i] += out[0][i] * wet; R[i] += out[1][i] * wet; }
}
// a note into a stereo loop, panned (-1 left .. 1 right)
const put = (L, R, b, at, g, pan, sr) => { const a = Math.cos((pan + 1) * Math.PI / 4), c = Math.sin((pan + 1) * Math.PI / 4); mixLoop(L, b, at, g * a * 1.41, sr); mixLoop(R, b, at, g * c * 1.41, sr); };
const putOnce = (L, R, b, at, g, pan, sr) => { const a = Math.cos((pan + 1) * Math.PI / 4), c = Math.sin((pan + 1) * Math.PI / 4); mix(L, b, at, g * a * 1.41, sr); mix(R, b, at, g * c * 1.41, sr); };
// a chord voiced into the middle of the strings' range
const voice = (notes, lo = 57, hi = 72) => notes.map(n => { while (n < lo) n += 12; while (n > hi) n -= 12; return n; }).sort((a, b) => a - b);

// ---------------------------------------------------------------- the stems

function* stem(name, P, sr, r) {
  const bars = STEM[name][0], len = bars * P.bar, L = buf(sr, len), R = buf(sr, len), s16 = P.beat / 4, ch = (bar) => P.chords[Math.floor(bar / 2) % 4];
  const pat = (P.M.drums[(P.seed + 1) % 2] || P.M.drums[0]);
  if (name === 'drone') {
    const f = mtof(P.root - 12); put(L, R, droneNote(sr, len, f, r), 0, .9, -.15, sr); yield; put(L, R, droneNote(sr, len, f * 1.5, r), 0, .35, .2, sr); yield;
    const air = noiseBuf(sr, len, r); filter(air, 'bp', mtof(P.root + 24), 6, sr); shape(air, sr, t => .5 + .5 * Math.sin(TAU * t / len * 2)); put(L, R, air, 0, .12, 0, sr);
    // (made seamless: the notes run the whole loop, so cross-fade its two ends)
    for (const b of [L, R]) { const x = Math.round(.25 * sr); for (let i = 0; i < x; i++) { const k = i / x; b[i] = b[i] * k + b[b.length - x + i] * (1 - k); } }
    yield* hall(L, R, sr, { wet: .3 });
  } else if (name === 'strings') {
    for (let bar = 0; bar < bars; bar += 2) { const c = ch(bar), notes = voice(c.notes); notes.forEach((n, i) => put(L, R, strings(sr, P.bar * 2 - .05, mtof(n), r), bar * P.bar, .5, (i / Math.max(1, notes.length - 1) - .5) * 1.2, sr)); put(L, R, strings(sr, P.bar * 2 - .05, mtof(c.root - 12), r, { bright: .7 }), bar * P.bar, .55, 0, sr); yield; }
    yield* hall(L, R, sr, { wet: .38 });
  } else if (name === 'pulse') {
    const steps = P.M.pulse;
    for (let bar = 0; bar < bars; bar++) { const c = ch(bar), notes = [c.root, c.root + 7, c.root + 12].map(n => n - 12 + (n - 12 < P.root - 14 ? 12 : 0));
      for (let s = 0; s < 16; s++) { const k = steps[s % steps.length]; if (k === '.' || k == null) continue; const at = bar * P.bar + s * s16; put(L, R, pluck(sr, s16 * .9, mtof(notes[+k] || notes[0]), r, { decay: s % 4 ? .09 : .14, open: s % 4 ? 1800 : 2800 }), at, s % 4 ? .55 : .8, (s % 2 ? .25 : -.25), sr); }
      yield; }
    yield* hall(L, R, sr, { wet: .18 });
  } else if (name === 'ticks') {
    for (let s = 0; s < 16 * bars; s++) { const acc = s % 4 === 0, at = s * s16 + (s % 2 ? s16 * .04 : 0); put(L, R, tick(sr, r, acc), at, acc ? .7 : .38 + r() * .1, ((s * 7) % 5 - 2) * .18, sr); }
    yield* hall(L, R, sr, { wet: .15, size: .7 });
  } else if (name === 'drums') {
    const big = taiko(sr, r, mtof(P.root - 24) * 1.0), low = tom(sr, r, mtof(P.root - 12) * .75);
    for (let bar = 0; bar < bars; bar++) { const p = P.M.drums[bar % P.M.drums.length] || pat; for (let s = 0; s < 16; s++) { const k = p[s]; if (k === '2') put(L, R, big, bar * P.bar + s * s16, s === 0 ? 1 : .8, -.1, sr); else if (k === '1') put(L, R, low, bar * P.bar + s * s16, .55 + r() * .1, .3, sr); } yield; }
    yield* hall(L, R, sr, { wet: .32, size: .86 });
  } else if (name === 'brass') {
    for (let bar = 0; bar < bars; bar += 2) { const c = ch(bar), lo = c.root - 12 < P.root - 14 ? c.root : c.root - 12; for (const [n, g, pan] of [[lo, .6, -.2], [lo + 7, .45, .2], [lo + 12, .3, 0]]) put(L, R, brass(sr, P.bar * 1.2, mtof(n), r), bar * P.bar + P.beat * .02, g, pan, sr); yield; }
    yield* hall(L, R, sr, { wet: .35 });
  } else if (name === 'lift') {
    const m = P.M.motif, step = P.bar / 2;
    for (let i = 0; i < bars * 2; i++) { const c = ch(Math.floor(i / 2)), n = P.root + 24 + m[i % m.length]; let note = n; while (note < c.root + 17) note += 12; put(L, R, strings(sr, step * .95, mtof(note), r, { att: .18, rel: .5, bright: 1.25 }), i * step, .6, .1, sr); put(L, R, strings(sr, step * .95, mtof(note - 12), r, { att: .2, rel: .5 }), i * step, .3, -.2, sr); if (i % 4 === 3) yield; }
    yield* hall(L, R, sr, { wet: .42 });
  }
  const g = STEM[name][2] / (Math.max(rms(L), rms(R)) + 1e-9); scale(L, g); scale(R, g);
  return [L, R];
}

// the one-off moments (not loops): how long, and what is in them
function* oneshot(name, P, sr, r) {
  const t = P.chords[0], tonic = voice(t.notes, 55, 70);
  if (name === 'hit') {   // an orchestral hit: brass and strings stabbed together on the tonic, the big drum, a crash
    const L = buf(sr, 2.6), R = buf(sr, 2.6);
    for (const n of tonic) { putOnce(L, R, brass(sr, .28, mtof(n - 12), r, { att: .02, rel: .25, open: 3000 }), 0, .5, (n % 3 - 1) * .3, sr); putOnce(L, R, strings(sr, .25, mtof(n), r, { att: .01, rel: .3, bright: 1.3 }), 0, .35, 0, sr); }
    putOnce(L, R, taiko(sr, r, mtof(P.root - 24)), 0, 1.1, 0, sr); putOnce(L, R, crash(sr, r, 2.4), 0, .45, .3, sr); yield;
    yield* hall(L, R, sr, { wet: .45, loop: false }); return fin(L, R, .7);
  }
  if (name === 'riser') {   // a build: noise rising through the bands, strings sliding up an octave, ticks speeding up (5 s; it lands at the end)
    const T = 5, L = buf(sr, T + .4), R = buf(sr, T + .4);
    const n = noiseBuf(sr, T + .4, r); sweep(n, 'bp', x => 300 * Math.pow(20, Math.min(1, x * (T + .4) / T)), 1.3, sr); shape(n, sr, x => Math.pow(Math.min(1, x / T), 2.2) * (x > T ? Math.max(0, 1 - (x - T) / .05) : 1));
    putOnce(L, R, n, 0, .5, -.2, sr); putOnce(L, R, n, .011, .5, .2, sr); yield;
    for (const [m, g] of [[t.root, .4], [t.root + 7, .3]]) {   // (two bows a little apart, both sliding)
      const gl = buf(sr, T); let p1 = r(), p2 = r();
      for (let i = 0; i < gl.length; i++) { const x = i / gl.length, f = mtof(m + 12 * x * x); p1 = (p1 + f * .996 / sr) % 1; p2 = (p2 + f * 1.004 / sr) % 1; gl[i] = p1 + p2 - 1; }
      sweep(gl, 'lp', x => 600 + 4000 * x * x, .7, sr); shape(gl, sr, x => Math.pow(x / T, 1.6)); putOnce(L, R, gl, 0, g, 0, sr); yield;
    }
    for (let k = 0, at = 0; at < T - .05; k++) { putOnce(L, R, tick(sr, r, k % 4 === 0), at, .3 + .5 * at / T, (k % 2 ? .3 : -.3), sr); at += Math.max(.06, .5 * Math.pow(1 - at / T, 1.5)); }
    yield* hall(L, R, sr, { wet: .3, loop: false }); return fin(L, R, .6);
  }
  if (name === 'impact') {   // where a riser lands: a huge drum, low brass on the tonic, a crash and the hall ringing
    const L = buf(sr, 4), R = buf(sr, 4);
    putOnce(L, R, taiko(sr, r, mtof(P.root - 24) * .9), 0, 1.3, 0, sr); putOnce(L, R, thump(sr, 1.5, 90, 34, .06, .5), 0, .6, 0, sr); putOnce(L, R, crash(sr, r, 3.5), .005, .55, -.2, sr);
    for (const [n, g] of [[t.root - 12, .6], [t.root - 5, .45], [t.root, .35]]) putOnce(L, R, brass(sr, 1.4, mtof(n), r, { att: .03, rel: 1.2, open: 2600 }), 0, g, 0, sr);
    yield; yield* hall(L, R, sr, { wet: .5, loop: false }); return fin(L, R, .8);
  }
  if (name === 'win') {   // the tonic chord turned major and held, strings and brass swelling, the motif on top
    const L = buf(sr, 5), R = buf(sr, 5), maj = voice([t.root, t.root + 4, t.root + 7, t.root + 12], 57, 74);
    for (const n of maj) putOnce(L, R, strings(sr, 3.2, mtof(n), r, { att: .6, rel: 1.2, bright: 1.2 }), 0, .45, (n % 4 - 1.5) * .25, sr);
    putOnce(L, R, brass(sr, 2.6, mtof(t.root - 12), r, { att: .5, rel: 1 }), .1, .5, 0, sr); yield;
    [0, 4, 7, 12].forEach((d, i) => putOnce(L, R, strings(sr, .6, mtof(t.root + 12 + d), r, { att: .05, rel: .4, bright: 1.3 }), .2 + i * .22, .4, .2, sr));
    putOnce(L, R, taiko(sr, r, mtof(P.root - 24)), 0, .8, 0, sr); yield;
    yield* hall(L, R, sr, { wet: .5, loop: false }); return fin(L, R, .7);
  }
  if (name === 'lose') {   // low strings sinking a half step, a last drum
    const L = buf(sr, 5), R = buf(sr, 5);
    for (const [n, at] of [[t.root - 12, 0], [t.root - 9, 0], [t.root - 13, 1.4], [t.root - 10, 1.4]]) putOnce(L, R, strings(sr, 1.6, mtof(n), r, { att: .3, rel: 1.4, bright: .6 }), at, .5, 0, sr);
    putOnce(L, R, taiko(sr, r, mtof(P.root - 24) * .85), 1.4, .8, 0, sr); yield;
    yield* hall(L, R, sr, { wet: .5, loop: false }); return fin(L, R, .6);
  }
  if (name === 'found') {   // the motif's opening on a horn
    const L = buf(sr, 3), R = buf(sr, 3), m = P.M.motif;
    for (let i = 0; i < 3; i++) putOnce(L, R, brass(sr, i === 2 ? .7 : .22, mtof(P.root + 12 + m[i]), r, { att: .04, rel: .4, open: 1800 }), i * P.beat * .5, .6, 0, sr);
    yield; yield* hall(L, R, sr, { wet: .45, loop: false }); return fin(L, R, .55);
  }
  return null;
}
const fin = (L, R, to) => { const p = Math.max(peak(L), peak(R)); if (p > 0) { scale(L, to / p); scale(R, to / p); } return [L, R]; };

/** Rate each part is made at. */
export const partRate = name => STEM[name] ? STEM[name][1] : name === 'riser' || name === 'hit' ? 22050 : 22050;
/** A generator that makes one part ('drone' ... 'lift', 'hit' ... 'found') of a score with these options, yielding as it goes; its value: [left, right]. */
export function scorePart(name, o) {
  const P = plan(o), r = seeded(seedOf(name + ':' + (o.seed ?? 1) + ':' + (o.mood || 'tense') + ':' + (o.key || 'D')));
  return STEM[name] ? stem(name, P, STEM[name][1], r) : oneshot(name, P, partRate(name), r);
}
/** The same, made all at once (the background worker's way). */
export function renderScorePart(o) { const g = scorePart(o.part, o); let x; do { x = g.next(); } while (!x.done); return x.value; }
