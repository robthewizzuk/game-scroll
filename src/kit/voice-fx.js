// Shaping a line of speech (the `size` and `fx` of gs.sound.say). The phone writes the line to sound
// instead of speaking it (plugins/speech-audio), and this file makes what the player hears from it: the
// same voice as a bigger or smaller person, through a radio, a tannoy, a telephone, from inside a box.
// It is worked out ahead of time, faster than it plays (an OfflineAudioContext), then levelled, so a
// shaped line is as loud on every phone and with every treatment. Only the browser's own audio nodes:
// no sound files, nothing loaded. Kit use only (sound.js).

/**
 * The treatments by name. A recipe (also what a game can pass as fx: { like: 'radio', drive: .2 }):
 *   low, high   Hz: nothing below / above passes (a small speaker has no bass and no top)
 *   peaks       [[Hz, dB, sharpness]...]: the ring of a horn, a box, a handset
 *   bass, treble   dB: more or less of the low and the top end
 *   drive       0..1: overdriven, like a cheap amplifier turned up
 *   ring        [Hz, 0..1]: a robot's buzz
 *   comb        [seconds, 0..0.9 how long it rings, 0..1 how much]: a metal tube, a hollow thing
 *   squeeze     0..1: evened out hard, the way radios and adverts are
 *   echo        [[seconds, 0..1]...]: single slaps off far walls
 *   squelch     0..1: a burst of static as the line starts and ends (a radio keying up); hiss: static under the words
 *   mix         0..1: how much of the treatment (the rest is the plain voice)
 */
export const FX = {
  clean: {},
  radio: { low: 420, high: 2900, peaks: [[1800, 5, 1.2]], drive: .5, squeeze: .7, squelch: .7, hiss: .5 },
  tannoy: { low: 350, high: 3800, peaks: [[1100, 7, 2]], drive: .25, squeeze: .4, echo: [[.085, .3], [.19, .16]] },
  phone: { low: 320, high: 3300, peaks: [[2200, 3, 1]], drive: .12 },
  megaphone: { low: 500, high: 3200, peaks: [[1500, 7, 2.5]], drive: .7, squeeze: .6, echo: [[.14, .22]] },
  box: { high: 1500, bass: 3, peaks: [[250, 6, 3], [620, 4, 4]], comb: [.0055, .4, .5] },
  bright: { low: 160, treble: 5, peaks: [[2600, 2.5, 1]], squeeze: .6 },
  warm: { bass: 4, high: 6500, squeeze: .25 },
  robot: { low: 180, high: 5200, comb: [.0045, .72, .7], ring: [60, .35] },
  tiny: { low: 700, high: 7000, peaks: [[3000, 5, 1.5]] },
};

const num = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : d));
const pairs = (v, n) => (Array.isArray(v) ? (Array.isArray(v[0]) ? v : [v]) : []).filter(Array.isArray).slice(0, n);

/** The fx a game gave say(), tidied into a full recipe, or null for none (a name nobody knows is none). */
export function fxOf(fx) {
  if (fx == null || fx === false) return null;
  const o = typeof fx === 'string' ? FX[fx] : typeof fx === 'object' ? { ...(FX[fx.like] || {}), ...fx } : null;
  if (!o) return null;
  const s = {};
  if (o.low > 0) s.low = num(o.low, 40, 4000, 300);
  if (o.high > 0) s.high = num(o.high, 400, 16000, 3000);
  const peaks = pairs(o.peaks, 4).map(p => [num(p[0], 60, 12000, 1000), num(p[1], -18, 18, 0), num(p[2], .3, 12, 1)]);
  if (peaks.length) s.peaks = peaks;
  if (o.bass) s.bass = num(o.bass, -18, 18, 0);
  if (o.treble) s.treble = num(o.treble, -18, 18, 0);
  if (o.drive > 0) s.drive = num(o.drive, 0, 1, 0);
  if (Array.isArray(o.ring) && o.ring[1] > 0) s.ring = [num(o.ring[0], 10, 2000, 60), num(o.ring[1], 0, 1, .3)];
  if (Array.isArray(o.comb) && o.comb[0] > 0) s.comb = [num(o.comb[0], .003, .05, .005), num(o.comb[1], 0, .9, .4), num(o.comb[2], 0, 1, .6)];
  if (o.squeeze > 0) s.squeeze = num(o.squeeze, 0, 1, 0);
  const echo = pairs(o.echo, 3).map(e => [num(e[0], .02, .8, .1), num(e[1], 0, .8, .2)]).filter(e => e[1] > 0);
  if (echo.length) s.echo = echo;
  if (o.squelch > 0) s.squelch = num(o.squelch, 0, 1, 0);
  if (o.hiss > 0) s.hiss = num(o.hiss, 0, 1, 0);
  if (o.mix != null && o.mix < 1) s.mix = num(o.mix, 0, 1, 1);
  return s;
}

/** Sound from the phone: base64 of 16-bit little-endian samples, as numbers from -1 to 1. */
export function pcm16(b64) {
  const bin = atob(String(b64 || '')), n = bin.length >> 1, out = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 2) { const v = bin.charCodeAt(j) | (bin.charCodeAt(j + 1) << 8); out[i] = (v > 32767 ? v - 65536 : v) / 32768; }
  return out;
}

/**
 * How loud a stretch of speech is: { rms: over the parts that are speech (pauses and tails don't
 * count: only the fiftieths of a second within 26 dB of the loudest), peak }.
 */
export function loudness(x, rate) {
  const win = Math.max(32, Math.min(x.length, Math.round(rate * .02))), pow = []; let peak = 0, top = 0;
  for (let s = 0; s + win <= x.length; s += win) {
    let sum = 0;
    for (let i = s; i < s + win; i++) { const v = x[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    const p = sum / win; pow.push(p); if (p > top) top = p;
  }
  let sum = 0, n = 0; const floor = top * .0025;
  for (const p of pow) if (p > floor) { sum += p; n++; }
  return { rms: n ? Math.sqrt(sum / n) : 0, peak };
}

/** The line without the silence engines put before and after it: [first sample, one past the last]. */
export function trim(x, rate) {
  let peak = 0; for (let i = 0; i < x.length; i++) { const a = x[i] < 0 ? -x[i] : x[i]; if (a > peak) peak = a; }
  const th = Math.max(.0006, peak * .02); let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < th) a++;
  while (b > a && Math.abs(x[b]) < th) b--;
  if (a >= x.length) return [0, 0];
  return [Math.max(0, a - Math.round(rate * .01)), Math.min(x.length, b + 1 + Math.round(rate * .03))];
}

/**
 * Where each word starts, [place in the text, seconds, place, seconds...], guessed from the words
 * (longer words take longer, a full stop is a pause) for a line that takes `seconds`: for engines
 * that don't say.
 */
export function wordTimes(text, seconds) {
  const at = [], re = /\S+/g; let m, units = 0;
  while ((m = re.exec(String(text)))) { at.push(m.index, units); units += m[0].length + 1.5 + (/[.!?…]["')\]]?$/.test(m[0]) ? 5 : /[,;:]$/.test(m[0]) ? 2.5 : 0); }
  for (let i = 1; i < at.length; i += 2) at[i] = units ? at[i] / units * seconds : 0;
  return at;
}

/**
 * Where each word starts, [place in the text, seconds, ...], from the sound itself (for engines that don't say): the
 * words are spread over the time the voice is heard, not the pauses, and a pause long enough to be one is where the
 * word after a full stop or a comma begins, when one is near where it would fall. Within a sentence it is a guess by
 * word length, as wordTimes(); the pauses keep the guess from drifting a sentence out. x: samples -1..1 at `rate`.
 */
export function marksFrom(text, x, rate) {
  const hop = Math.max(1, Math.round(rate * .01)), n = Math.floor(x.length / hop), words = [], re = /\S+/g;
  for (let m; (m = re.exec(String(text)));) words.push({ at: m.index, u: m[0].replace(/[^\p{L}\p{N}]/gu, '').length + 1.5, end: /[.!?…]["')\]]?$/.test(m[0]) ? 2 : /[,;:—]["')\]]?$/.test(m[0]) ? 1 : 0 });
  if (!words.length) return [];
  if (n < 4) return wordTimes(text, x.length / rate);
  const e = new Float32Array(n);
  for (let f = 0; f < n; f++) { let s2 = 0; for (let i = f * hop, j = i + hop; i < j; i++) s2 += x[i] * x[i]; e[f] = Math.sqrt(s2 / hop); }
  const sorted = Float32Array.from(e).sort(), th = Math.max(1e-4, sorted[Math.floor(n * .9)] * .1);
  let a = 0, b = n - 1;
  while (a < n && e[a] < th) a++;
  while (b > a && e[b] < th) b--;
  if (b - a < 4) return wordTimes(text, x.length / rate);
  // pauses: quiet for 120 ms or more, inside the speech; q: how much speech came before each
  const pauses = []; let spoken = 0;
  for (let f = a; f <= b;) {
    if (e[f] >= th) { spoken++; f++; continue; }
    let g = f; while (g <= b && e[g] < th) g++;
    if (g - f >= 12) pauses.push({ s: f, e: g, q: spoken }); else spoken += g - f;
    f = g;
  }
  const S = Math.max(1, spoken), cum = [0];
  for (const w of words) cum.push(cum[cum.length - 1] + w.u);
  const U = cum[words.length];
  // each pause to the word boundary it most likely is (a full stop or comma before it, near where the guess puts it), in order
  const anchors = [{ k: 0, q: 0 }];
  for (const p of pauses) {
    let best = -1, cost = Infinity;
    for (let k = anchors[anchors.length - 1].k + 1; k < words.length; k++) {
      const d = Math.abs(cum[k] / U * S - p.q) / S, c = d - (words[k - 1].end === 2 ? .15 : words[k - 1].end ? .08 : 0);
      if (d < .25 && c < cost) { cost = c; best = k; }
    }
    if (best > 0) anchors.push({ k: best, q: p.q, pause: p });
  }
  anchors.push({ k: words.length, q: S });
  // speech time to sound time: skip the pauses before it (a word placed right at a pause starts after it)
  const real = q => { let f = a + q; for (const p of pauses) if (p.q <= q) f += p.e - p.s; return f; };
  const out = [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const A = anchors[i], B = anchors[i + 1], span = cum[B.k] - cum[A.k] || 1;
    for (let k = A.k; k < B.k; k++) {
      const q = A.q + (cum[k] - cum[A.k]) / span * (B.q - A.q);
      out.push(words[k].at, (k === A.k && A.pause ? A.pause.e : real(q)) * hop / rate);
    }
  }
  for (let i = 3; i < out.length; i += 2) if (out[i] < out[i - 2]) out[i] = out[i - 2];
  return out;
}

/**
 * The engine's own word marks if they make sense for this line (in order, inside the text and the
 * sound, and most of the words), else null: then wordTimes() guesses.
 */
export function goodMarks(marks, text, seconds) {
  if (!Array.isArray(marks) || marks.length < 2 || marks.length % 2) return null;
  const words = (String(text).match(/\S+/g) || []).length; if (marks.length / 2 < Math.max(1, words * .6)) return null;
  let i0 = -1, t0 = 0;
  for (let i = 0; i < marks.length; i += 2) {
    const at = marks[i], t = marks[i + 1];
    if (!Number.isFinite(at) || !Number.isFinite(t) || at < i0 || at >= text.length || t < t0 - .001 || t > seconds + .1) return null;
    i0 = at; t0 = t;
  }
  return marks.length / 2 > 1 && marks[marks.length - 1] <= 0 ? null : marks.slice();   // (every word at nought seconds is no timing at all)
}

const IN = .1;              // the level a line goes into its treatment at, whatever the engine wrote: so `drive` bites the same on every phone
export const LEVEL = .085;  // how loud a shaped line comes out (rms of its speech): a little over the kit's loudest effects, as a voice should be
export const PEAK = .6;     // and its highest peak

const tailOf = (s, close, hold) => Math.max(.04, ...(s.echo || []).map(e => e[0] + .12), s.comb ? Math.min(.6, s.comb[0] * 6 / Math.max(.02, 1 - s.comb[1])) : 0,
  s.squelch && close ? .16 : 0, (s.squelch || s.hiss) && !close ? hold + .03 : 0);
const LEAD = .07;   // a radio keys up before the first word

// the same static every time (so a line sounds the same twice, and tests can measure it)
function staticBuffer(c, seconds) {
  const n = Math.ceil(seconds * c.sampleRate), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let s = 0x2545f491;
  for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = (s >>> 0) / 2147483648 - 1; }
  return b;
}

// The treatment as audio nodes, from `input` to `dest`. lead: seconds before the voice starts; body: how long it
// speaks; open, close: the static of keying up before it and of letting go after it; hold: seconds the static
// under the words carries on for when it isn't let go (the pause before the next part of the line).
function build(c, s, input, dest, { lead, body, open, close, hold }) {
  let node = input;
  const then = x => { node.connect(x); node = x; return x; };
  const filt = (type, hz, q, gain) => { const f = c.createBiquadFilter(); f.type = type; f.frequency.value = hz; if (q != null) f.Q.value = q; if (gain != null) f.gain.value = gain; return f; };
  const edge = (type, hz) => { then(filt(type, hz, .54)); then(filt(type, hz, 1.31)); };   // a steep edge (24 dB an octave), flat up to it
  const amp = v => { const g = c.createGain(); g.gain.value = v; return g; };
  if (s.low) edge('highpass', s.low);
  if (s.high) edge('lowpass', s.high);
  for (const [hz, db, q] of s.peaks || []) then(filt('peaking', hz, q, db));
  if (s.bass) then(filt('lowshelf', 220, null, s.bass));
  if (s.treble) then(filt('highshelf', 3200, null, s.treble));
  if (s.drive) {
    const k = 1 + s.drive * 10, n = 1025, curve = new Float32Array(n), top = Math.tanh(k);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / top;
    const sh = c.createWaveShaper(); sh.curve = curve; try { sh.oversample = '2x'; } catch { /* as it comes */ }
    then(amp(1.6)); then(sh);
    if (s.high) then(filt('lowpass', s.high, .7));   // (the fizz overdrive adds stays inside the speaker's range)
  }
  if (s.ring) {
    const g = amp(1 - s.ring[1]), o = c.createOscillator(), og = amp(s.ring[1]);
    o.frequency.value = s.ring[0]; o.connect(og); og.connect(g.gain); o.start(0); then(g);
  }
  if (s.comb) {
    const d = c.createDelay(.1), fb = amp(s.comb[1]), wet = amp(s.comb[2]), sum = amp(1);
    d.delayTime.value = s.comb[0]; node.connect(sum); node.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(sum); node = sum;
  }
  if (s.mix != null && s.mix < 1) {   // some of the plain voice beside it
    const sum = amp(1), wet = amp(s.mix), dry = amp(1 - s.mix);
    node.connect(wet); wet.connect(sum); input.connect(dry); dry.connect(sum); node = sum;
  }
  // static goes in here, before the squeeze: a radio evens its static out with the voice, so it comes up between words
  const bus = amp(1); then(bus);
  if (s.squeeze) {
    const k = c.createDynamicsCompressor(), q = s.squeeze;
    k.threshold.value = -18 - 14 * q; k.knee.value = 8; k.ratio.value = 3 + 9 * q; k.attack.value = .004; k.release.value = .12;
    then(k);
  }
  node.connect(dest);
  for (const [secs, level] of s.echo || []) {
    const d = c.createDelay(1), g = amp(level), lp = filt('lowpass', 2400, .7);
    d.delayTime.value = secs; node.connect(d); d.connect(lp); lp.connect(g); g.connect(dest);
  }
  if (s.squelch || s.hiss) {
    const src = c.createBufferSource(), g = amp(0), band = filt('bandpass', Math.sqrt((s.low || 300) * (s.high || 4000)), .7);
    src.buffer = staticBuffer(c, 1); src.loop = true; src.connect(band); band.connect(g); g.connect(bus);
    // (levels beside a voice going in at IN: a burst about a third as loud as the words, the hiss far under them)
    const hiss = Math.max(1e-4, (s.hiss || 0) * .04), burst = (s.squelch || 0) * .4, a = g.gain, end = lead + body + .02 + (close ? 0 : hold);
    if (burst && open) { a.setValueAtTime(burst, 0); a.exponentialRampToValueAtTime(Math.max(hiss, burst * .25), lead - .012); a.setValueAtTime(hiss, lead - .01); }
    else a.setValueAtTime(hiss, 0);
    a.setValueAtTime(hiss, end);
    if (burst && close) { a.setValueAtTime(burst * .9, end + .004); a.exponentialRampToValueAtTime(1e-4, end + .12); }
    a.setValueAtTime(0, end + (burst && close ? .125 : .004));
    src.start(0); src.stop(end + .13);
  }
}

const finish = c => new Promise((res, rej) => {   // (older iPhones answer through oncomplete, not a promise)
  let done = false; const ok = b => { if (!done) { done = true; res(b); } };
  c.oncomplete = e => ok(e.renderedBuffer);
  try { const p = c.startRendering(); if (p && p.then) p.then(ok, rej); } catch (e) { rej(e); }
});

/** True where a line can be shaped at all (the browser can work sound out ahead of time). */
export const canShape = () => !!(globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext);

/**
 * A line of speech (samples -1..1 at `rate` a second, as the phone wrote it) as the player will hear
 * it: { buffer (an AudioBuffer at outRate), gain (play it at this for the kit's speech level), lead
 * (seconds before the first word), seconds (until the last word ends), total (with its echoes) }.
 * size: over 1 a bigger person (deeper in every way), under 1 smaller: the sound is played slower or
 * faster by that much, so have the phone speak `size` times faster to keep the pace. fx: a recipe from fxOf().
 * A line said in several parts through one radio stays keyed up between them: open: false leaves out the
 * burst of static before this part, close: false the one after it, and hold is the pause (seconds) to the
 * next part, which the static under the words carries on through. A line that comes in pieces (the built-in voice
 * writes a sentence at a time) keeps the silence between them: trimStart: false on all but the first piece, trimEnd:
 * false on all but the last.
 */
export async function shape(samples, rate, { size = 1, fx = null, outRate = 48000, open = true, close = true, hold = 0, trimStart = true, trimEnd = true } = {}) {
  const Off = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Off) throw new Error('no way to shape sound here');
  const [a0, b0] = trim(samples, rate), a = trimStart ? a0 : 0, b = trimEnd ? b0 : samples.length, x = samples.subarray(a, Math.max(a, b));
  if (x.length < rate * .03) throw new Error('no speech in it');
  const s = fx || {}, k = num(size, .5, 2, 1), body = x.length / rate * k, lead = s.squelch && open ? LEAD : 0, total = lead + body + tailOf(s, close, hold);
  const c = new Off(1, Math.ceil(total * outRate), outRate);
  // to the output's rate (and slowed by size) here, with a proper filter: a browser's own change of rate (a buffer
  // at 24 kHz in a 48 kHz context, or a playbackRate) is a straight line between samples, which dulls the top of a
  // voice and mirrors it above 12 kHz as a metallic ring
  const y = resample(x, outRate * k / rate), buf = c.createBuffer(1, y.length, outRate); buf.getChannelData(0).set(y);
  const src = c.createBufferSource(), pre = c.createGain(), lv = loudness(x, rate);
  src.buffer = buf; pre.gain.value = lv.rms > 0 ? IN / lv.rms : 1;
  src.connect(pre); build(c, s, pre, c.destination, { lead, body, open, close, hold }); src.start(lead);
  const out = await finish(c), heard = loudness(out.getChannelData(0), outRate);
  let gain = heard.rms > 0 ? LEVEL / heard.rms : 1;
  if (heard.peak * gain > PEAK) gain = PEAK / heard.peak;
  return { buffer: out, gain, lead, seconds: lead + body, total, cut: a / rate };
}

/**
 * Samples at another rate (ratio: new rate over old), through a windowed-sinc filter (Kaiser, 16 zero crossings
 * each side, cut a little under the lower rate's Nyquist): nothing mirrored, the top end kept. A table of the
 * filter at 512 phases, read with a straight line between them.
 */
const PH = 512, ZC = 16, KTAB = (() => {
  const bessel = x => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; }, beta = 8.6, n = ZC * PH, w = new Float32Array(n + 2);
  for (let i = 0; i <= n; i++) { const x = i / PH, r = x / ZC; w[i] = (x ? Math.sin(Math.PI * x) / (Math.PI * x) : 1) * bessel(beta * Math.sqrt(Math.max(0, 1 - r * r))) / bessel(beta); }
  return w;
})();
export function resample(x, ratio) {
  if (Math.abs(ratio - 1) < 1e-6) return x;
  const n = Math.max(1, Math.round(x.length * ratio)), y = new Float32Array(n), cut = Math.min(1, ratio) * .94, reach = ZC / cut, step = 1 / ratio;
  for (let i = 0; i < n; i++) {
    const p = i * step, c0 = Math.ceil(p - reach), c1 = Math.floor(p + reach);
    let acc = 0;
    for (let j = Math.max(0, c0), e = Math.min(x.length - 1, c1); j <= e; j++) {
      const t = Math.abs(p - j) * cut * PH, k = t | 0;
      if (k >= ZC * PH) continue;
      acc += x[j] * (KTAB[k] + (KTAB[k + 1] - KTAB[k]) * (t - k));
    }
    y[i] = acc * cut;
  }
  return y;
}

/**
 * The built-in voice's decoder hum taken out: its last stages build the sound up 5 and then 4 times over, and what
 * they never quite cancel is left as steady lines at whole multiples of 1.2 kHz (2.4, 3.6, 4.8 and 7.2 the
 * strongest, 2 to 6 dB over the voice beside them, most on the deep voices). A notch on each, 12 Hz wide (zeros on the
 * line, poles just inside it), takes the line out and leaves the voice either side as it was. Before anything moves the
 * pitch or the timing, while the lines are still steady.
 */
export function dehum(x, rate, { lines = 8, bw = 12 } = {}) {
  const y = Float32Array.from(x), r = 1 - Math.PI * bw / rate;
  for (let k = 1; k <= lines; k++) {
    const f = 1200 * k; if (f >= rate / 2 - bw) break;
    const c = Math.cos(2 * Math.PI * f / rate), g = (1 + r * r - 2 * r * c) / (2 - 2 * c);   // (as loud as before away from the line)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) { const v = y[i], o = g * (v - 2 * c * x1 + x2) + 2 * r * c * y1 - r * r * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; }
  }
  return y;
}

/**
 * The same speech faster or slower at the same pitch (tempo 1.25: a quarter faster), as people change their pace: the
 * vowels and other steady voiced sound take the change, while onsets, stops and hiss keep their own length (slices of
 * them laid twice or skipped are heard as a stutter: a "t" said twice). Overlapping slices of 30 ms, each taken from
 * where it lines up best with the one before (WSOLA, matched by normalised correlation so a louder slice is not
 * preferred over a better fitting one). For engines with no speed of their own (the desktop app's built-in voice).
 * tempo .5 to 2. Measured on 56 takes of 7 voices slowed to .95 (11-17): a speech-quality score 4.333 -> 4.347 (4.362
 * not slowed at all).
 */
export function stretch(x, rate, tempo) {
  tempo = Math.max(.5, Math.min(2, +tempo || 1));
  if (Math.abs(tempo - 1) < .01 || x.length < rate * .1) return x;
  // each 10 ms: how loud, how often it crosses zero (hiss crosses often)
  const hopF = Math.round(rate * .01), F = Math.ceil(x.length / hopF), en = new Float32Array(F), zc = new Float32Array(F);
  let peak = -Infinity;
  for (let f = 0; f < F; f++) {
    let e = 0, z = 0; const a = f * hopF, b = Math.min(x.length, a + hopF);
    for (let i = a; i < b; i++) { e += x[i] * x[i]; if (i > a && (x[i] >= 0) !== (x[i - 1] >= 0)) z++; }
    en[f] = 10 * Math.log10(e / Math.max(1, b - a) + 1e-12); zc[f] = z / Math.max(1, b - a) * rate; peak = Math.max(peak, en[f]);
  }
  // steady voice: loud enough, not hiss, and 20 ms from any jump in loudness (an onset or a stop)
  const steady = new Uint8Array(F);
  for (let f = 0; f < F; f++) steady[f] = en[f] > peak - 30 && zc[f] < 2500 ? 1 : 0;
  for (let f = 1; f < F; f++) if (Math.abs(en[f] - en[f - 1]) > 4) for (let g = Math.max(0, f - 2); g <= Math.min(F - 1, f + 2); g++) steady[g] = 2;
  let nS = 0; for (let f = 0; f < F; f++) if (steady[f] === 1) nS++;
  // the steady parts' speed, so the whole comes out 1 / tempo as long (everything at tempo where too little is steady)
  const some = nS > F * .15, v = some ? Math.max(1 / 1.8, Math.min(1.8, nS / Math.max(1, F / tempo - (F - nS)))) : tempo;
  const sm = new Float32Array(F);   // (eased over 70 ms, so the speed never jumps)
  for (let f = 0; f < F; f++) { let s = 0, n = 0; for (let g = f - 3; g <= f + 3; g++) if (g >= 0 && g < F) { s += some && steady[g] !== 1 ? 1 : 1 / v; n++; } sm[f] = n / s; }
  // where each 10 ms of it lands in the result, scaled so the whole comes out exactly 1 / tempo as long
  const len = Math.ceil(x.length / tempo), outAt = new Float64Array(F + 1);
  for (let f = 0; f < F; f++) outAt[f + 1] = outAt[f] + Math.min(hopF, x.length - f * hopF) / sm[f];
  const k0 = len / outAt[F]; for (let f = 0; f <= F; f++) outAt[f] *= k0;
  let fi = 0;
  const srcOf = o => { while (fi < F - 1 && outAt[fi + 1] <= o) fi++; while (fi > 0 && outAt[fi] > o) fi--; return f2s(fi, o); };
  const f2s = (f, o) => f * hopF + (o - outAt[f]) / Math.max(1e-9, outAt[f + 1] - outAt[f]) * Math.min(hopF, x.length - f * hopF);
  const N = Math.round(rate * .03) & ~1, hop = N >> 1, seek = Math.round(rate * .007), win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
  const out = new Float32Array(len + N), wsum = new Float32Array(len + N);
  let prev = 0;
  for (let o = 0, k = 0; o < len; o += hop, k++) {
    const want = Math.round(srcOf(o)); let at = want;
    if (k) {   // the slice that carries on best from the last one's second half
      const ref = prev + hop; let best = -Infinity;
      for (let d = -seek; d <= seek; d++) {
        const s = want + d; if (s < 0 || s + hop > x.length || ref + hop > x.length) continue;
        let c = 0, e = 1e-9; for (let i = 0; i < hop; i++) { c += x[s + i] * x[ref + i]; e += x[s + i] * x[s + i]; }
        if (c / Math.sqrt(e) > best) { best = c / Math.sqrt(e); at = s; }
      }
    }
    at = Math.max(0, Math.min(x.length - 1, at)); prev = at;
    for (let i = 0; i < N && at + i < x.length; i++) { out[o + i] += x[at + i] * win[i]; wsum[o + i] += win[i]; }
  }
  const y = new Float32Array(len);
  for (let i = 0; i < len; i++) y[i] = wsum[i] > 1e-3 ? out[i] / wsum[i] : out[i];
  return y;
}
