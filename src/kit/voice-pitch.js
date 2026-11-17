/**
 * The built-in voice made more like a person after it is spoken (talk-worker.js runs it on each part of a line, before
 * its speed is set): a wider pitch range, the small unsteadiness of a real voice, air through the voice, a quiet room
 * under it, and a soft breath before most later sentences and in some long pauses. Measured against the 7M's own sound (Rob's "sounds computer-made", 11-16): its pitch moved about
 * 9 semitones over a line and glided smoothly from moment to moment, where Tiny Voca's moved about 15 and Kokoro's and
 * Tiny Voca's wavered about 70% more; and widening the latents inside the model (the old lively) cost the sound more
 * than it gave. Here the voice's own sound is kept and only its pitch is moved (TD-PSOLA: a grain two periods long is
 * cut at each period of the voice and laid down again at the new period), so the words stay as clear.
 *   humanize(x, rate, { wide, wobble, breath, seed, first }) -> Float32Array (the same length, or longer by the breath
 *   before it: x is not changed)
 * wide: how far the pitch moves from the line it follows over the part (1 as spoken).
 * wobble: 0..1 the small unsteadiness (scales drift, a slow wander of the pitch, about 1.4% at 1 Hz, and jitter, period to
 * period, about 0.2%).
 * The defaults were tuned by CMA-ES (scripts/tune.cjs's search) against a speech-quality model (UTMOS) and the pitch of
 * real read speech (106 VCTK speakers: spread 3.7 semitones, 5-95% range 11.6): on 15 lines the 7M's own 2.4 / 8.0 become
 * 3.1 / 10.2 for a score 4.35 -> 4.29 (Rob 11-16: "keep going on making them more human like").
 * shift: the whole pitch moved this many times (lo, hi: how far any moment may go; act.mjs acts moods with these).
 * breathy: air through the voice (0: none). tone: the room's loudness against the voice (0: none, .003: about 50 dB under).
 * stress: [[from, to] seconds] words said higher (about 2 semitones), louder and longer. tilt: 0..1 effort (more of the
 * upper voice, as people speaking up over noise). pre: 'sigh' | 'gasp' before it, made through the voice's own mouth shape.
 * The pitch is moved only where two readings of it agree (YIN, and how well the sound repeats at that period and not at
 * half of it): a wrong reading moved is a warble or a crackle.
 * breath: 0..1 how loud the breaths are (0: none), each as deep as what follows it is long. first: true for the first part of a line, which takes no breath
 * before it (that would hold up the first word). seed: the same part, seed and settings come out the same.
 */

const MIN_HZ = 65, MAX_HZ = 420;

/** A seeded random number source (0..1). */
function seeded(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

/**
 * The voice's pitch every 10 ms (Hz, 0 where it isn't voiced), from a copy at half the rate (YIN: the lag where the
 * sound best repeats itself, read against the average so far so an octave below doesn't win).
 */
export function pitchOf(x, rate) {
  const r2 = rate / 2, n2 = x.length >> 1, h = new Float32Array(n2);
  for (let i = 0; i < n2; i++) h[i] = (x[2 * i] + x[2 * i + 1]) * .5;
  const hop = Math.round(r2 * .01), W = Math.round(r2 * .025), lo = Math.floor(r2 / MAX_HZ), hi = Math.ceil(r2 / MIN_HZ);
  const frames = Math.floor(x.length / (rate * .01)), f0 = new Float32Array(frames), d = new Float32Array(hi + 2);
  let top = 0; const pw = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const c = f * hop; let s = 0;
    for (let i = Math.max(0, c - (W >> 1)), e = Math.min(n2, c + (W >> 1)); i < e; i++) s += h[i] * h[i];
    pw[f] = s; if (s > top) top = s;
  }
  for (let f = 0; f < frames; f++) {
    if (pw[f] < top * 1e-3) continue;   // quiet: no voice to follow
    const s0 = f * hop - (W >> 1); if (s0 < 0 || s0 + W + hi >= n2) continue;
    let run = 0, best = -1, low = -1;
    for (let tau = 1; tau <= hi + 1; tau++) {
      let s = 0; for (let i = 0; i < W; i++) { const v = h[s0 + i] - h[s0 + i + tau]; s += v * v; }
      run += s; d[tau] = run ? s * tau / run : 1;
      const p = tau - 1;
      if (p >= lo && p > 1 && d[p] <= d[tau] && d[p] <= d[p - 1]) {   // a dip: the first deep one, else the deepest
        if (d[p] < .2) { best = p; break; }
        if (low < 0 || d[p] < d[low]) low = p;
      }
    }
    if (best < 0 && low >= 0 && d[low] < .4) best = low;
    if (best < 0) continue;
    const a = d[best - 1], b = d[best], c2 = d[best + 1], den = a - 2 * b + c2, shift = den > 0 ? .5 * (a - c2) / den : 0;
    f0[f] = r2 / (best + Math.max(-.5, Math.min(.5, shift)));
  }
  // a lone voiced or unvoiced frame is a mistake; a frame an octave off its neighbours too
  const out = Float32Array.from(f0);
  for (let f = 1; f + 1 < frames; f++) {
    const a = f0[f - 1], b = f0[f], c = f0[f + 1];
    if (b && !a && !c) out[f] = 0;
    else if (!b && a && c) out[f] = (a + c) / 2;
    else if (a && b && c) { const m = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); if (Math.abs(Math.log(b / m)) > .25) out[f] = m; }
  }
  // gaps of up to 40 ms inside the voice filled in (a missed frame would keep its old pitch next to moved ones)
  for (let f = 1; f < frames; f++) {
    if (out[f] || !out[f - 1]) continue;
    let g = f; while (g < frames && !out[g] && g - f < 5) g++;
    if (g < frames && out[g] && g - f <= 4 && Math.abs(Math.log(out[g] / out[f - 1])) < .3) for (let k = f; k < g; k++) out[k] = out[f - 1] + (out[g] - out[f - 1]) * (k - f + 1) / (g - f + 1);
    f = g;
  }
  return out;
}

/**
 * A breath in, made in code: air drawn through an open mouth (noise shaped by a broad, low resonance and a weaker one
 * higher up, the top above 5 kHz taken off so it isn't a hiss), swelling slowly and falling away quickly, as an inhale does.
 */
function breathe(n, rate, level, rnd) {
  const y = new Float32Array(n);
  const bp = (f, q) => { const w = 2 * Math.PI * f / rate, al = Math.sin(w) / (2 * q), a0 = 1 + al; return [al / a0, 0, -al / a0, -2 * Math.cos(w) / a0, (1 - al) / a0]; };
  const B = [bp(900 + 400 * rnd(), .7), bp(2300 + 500 * rnd(), 1.4)], z = B.map(() => [0, 0, 0, 0]), lp = Math.exp(-2 * Math.PI * 5000 / rate);
  let sum = 0, l1 = 0, l2 = 0;
  const peak = .55 + .2 * rnd();
  for (let i = 0; i < n; i++) {
    const t = i / n, env = t < peak ? Math.sin(t / peak * Math.PI / 2) ** 2 : Math.cos((t - peak) / (1 - peak) * Math.PI / 2) ** 2;
    const w = rnd() * 2 - 1; let v = 0;
    B.forEach((b, k) => { const s = z[k], o = b[0] * w + b[1] * s[0] + b[2] * s[1] - b[3] * s[2] - b[4] * s[3]; s[1] = s[0]; s[0] = w; s[3] = s[2]; s[2] = o; v += o * (k ? .35 : 1); });
    l1 = lp * l1 + (1 - lp) * v; l2 = lp * l2 + (1 - lp) * l1;
    y[i] = l2 * env; sum += y[i] * y[i];
  }
  const k = sum > 0 ? level / Math.sqrt(sum / n) : 0;
  for (let i = 0; i < n; i++) y[i] *= k;
  return y;
}

/**
 * A quiet room under the voice, as a microphone hears one: soft, low noise (mostly under 500 Hz, falling away above),
 * steady through the words and the pauses, so a pause is a room and not digital silence. level: its loudness (RMS).
 */
function roomTone(n, rate, level, rnd) {
  const y = new Float32Array(n), a = Math.exp(-2 * Math.PI * 180 / rate), b = Math.exp(-2 * Math.PI * 900 / rate);
  let u = 0, v = 0, sum = 0;
  for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; u = a * u + (1 - a) * w; v = b * v + (1 - b) * w; y[i] = u * 3 + v * .6; sum += y[i] * y[i]; }
  const k = sum > 0 ? level / Math.sqrt(sum / n) : 0, fade = Math.min(n >> 1, Math.round(rate * .01));
  for (let i = 0; i < n; i++) y[i] *= k * Math.min(1, i / fade, (n - 1 - i) / fade);
  return y;
}

/**
 * The shape of the voice's own mouth and throat: an all-pole filter (linear prediction, order 20) fitted to its voiced
 * sound, so air blown through it (a sigh, a gasp) sounds like this person's whisper and not like any noise.
 */
function tractOf(x, f0, rate) {
  const P = 20, N = Math.round(rate * .03), hop = rate * .01, r = new Float64Array(P + 1), w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
  const seg = new Float32Array(N);
  for (let f = 0, n = 0; f < f0.length && n < 60; f += 3) {
    if (!f0[f]) continue;
    const s0 = Math.round(f * hop); if (s0 + N > x.length) break;
    let e = 0; for (let i = 0; i < N; i++) { seg[i] = (x[s0 + i] - (i ? .9 * x[s0 + i - 1] : 0)) * w[i]; e += seg[i] * seg[i]; }   // (with the voice's own fall above taken off first)
    if (!(e > 0)) continue;
    for (let k = 0; k <= P; k++) { let s = 0; for (let i = k; i < N; i++) s += seg[i] * seg[i - k]; r[k] += s / e; }
    n++;
  }
  if (!(r[0] > 0)) return null;
  for (let k = 1; k <= P; k++) r[k] *= Math.exp(-.5 * (2 * Math.PI * 60 * k / rate) ** 2);   // (its peaks a little wider: steadier)
  r[0] *= 1.0001;
  const a = new Float64Array(P + 1), t = new Float64Array(P + 1); a[0] = 1; let err = r[0];
  for (let i = 1; i <= P; i++) {   // Levinson-Durbin
    let acc = r[i]; for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err; t.set(a);
    for (let j = 1; j < i; j++) a[j] = t[j] + k * t[i - j];
    a[i] = k; err *= 1 - k * k; if (!(err > 0)) return null;
  }
  for (let k = 1; k <= P; k++) a[k] *= .985 ** k;
  return a;
}
/** Air through the voice's tract (tractOf), as a whisper: noise in, filtered by it, the voice's fall above put back. */
function whisper(n, rate, a, rnd, open = 1) {
  const y = new Float32Array(n), P = a ? a.length - 1 : 0, h = new Float64Array(P + 1);
  let d = 0;
  for (let i = 0; i < n; i++) {
    let v = rnd() * 2 - 1;
    if (a) { for (let k = 1; k <= P; k++) v -= (open === 1 ? a[k] : a[k] * open ** k) * h[k]; for (let k = P; k > 1; k--) h[k] = h[k - 1]; h[1] = v; }
    d = .9 * d + v; y[i] = d;   // (de-emphasis: the -0.9 taken off in tractOf put back)
  }
  return y;
}
const fit = (y, level) => { let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i]; const k = s > 0 ? level / Math.sqrt(s / y.length) : 0; for (let i = 0; i < y.length; i++) y[i] *= k; return y; };
/**
 * A sigh: a long breath out through the voice's own mouth ("haah"), swelling quickly and dying away slowly, its top
 * closing down as it goes (from about 5 kHz to 1.2), the way a sigh trails off. level: its loudness (RMS).
 */
function sigh(n, rate, level, a, rnd) {
  const y = whisper(n, rate, a, rnd);
  const hp = Math.exp(-2 * Math.PI * 150 / rate); let u = 0, p = 0, l = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n, env = t < .18 ? Math.sin(t / .18 * Math.PI / 2) ** 2 : (1 - (t - .18) / .82) ** 1.8;
    const fc = 5000 * (1.2 / 5) ** t, k = Math.exp(-2 * Math.PI * fc / rate);
    u = hp * (u + y[i] - p); p = y[i]; l = k * l + (1 - k) * u;
    y[i] = l * env;
  }
  return fit(y, level);
}
/** A gasp: a quick, sharp breath in through the voice's own mouth, starting at once and stopped short. */
function gasp(n, rate, level, a, rnd) {
  const y = whisper(n, rate, a, rnd, .96);
  const hp = Math.exp(-2 * Math.PI * 700 / rate); let u = 0, p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n, env = Math.min(1, t / .1) * (.7 + .3 * t) * Math.min(1, (1 - t) / .12);
    u = hp * (u + y[i] - p); p = y[i]; y[i] = u * env;
  }
  return fit(y, level);
}

/** Variable-speed WSOLA: speed(i) is how far through x (samples) each output sample goes at x's sample i (1 as it was). */
function warp(x, rate, speed) {
  const N = Math.round(rate * .03) & ~1, hop = N >> 1, seek = Math.round(rate * .006), win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
  let len = 0; for (let p = 0; p < x.length; len += hop) p += hop * speed(Math.min(x.length - 1, Math.round(p)));
  const out = new Float32Array(len + N), ws = new Float32Array(len + N);
  let pos = 0, prev = 0;
  for (let o = 0, k = 0; o < len; o += hop, k++) {
    const want = Math.round(pos); let at = want;
    if (k && Math.abs(speed(Math.min(x.length - 1, want)) - 1) > 1e-3) {   // (where the speed is 1 the slices line up as they were)
      const ref = prev + hop; let best = -Infinity;
      for (let d = -seek; d <= seek; d += 2) {
        const s = want + d; if (s < 0 || s + hop > x.length || ref + hop > x.length) continue;
        let c = 0; for (let i = 0; i < hop; i += 2) c += x[s + i] * x[ref + i];
        if (c > best) { best = c; at = s; }
      }
    }
    at = Math.max(0, Math.min(x.length - 1, at)); prev = at;
    for (let i = 0; i < N && at + i < x.length; i++) { out[o + i] += x[at + i] * win[i]; ws[o + i] += win[i]; }
    pos += hop * speed(Math.min(x.length - 1, want));
  }
  const y = new Float32Array(len);
  for (let i = 0; i < len; i++) y[i] = ws[i] > 1e-3 ? out[i] / ws[i] : out[i];
  return y;
}

/** The sound sped up k times (slower under 1) at the same pitch: WSOLA, slices of it overlapped where they line up. */
export const pace = (x, rate, k) => Math.abs(k - 1) < 1e-3 ? x : warp(x, rate, () => k);

const WH = /^\W*(who|what|where|when|why|how|which|whose|whom)\b/i;
/** How a part ends, from its words: '?' a question asking yes or no (the voice rises), '.' anything else (it falls). */
export const endOf = text => /\?\W*$/.test(String(text || '').trim()) && !WH.test(String(text)) ? '?' : '.';

export function humanize(x, rate, { wide = 1.6, wobble = 1, breath = 1, seed = 1, first = false, drift: driftAmt = .014, jitter = .0022, driftHz = 1,
  end = '.', fall = 0, rise = 0, shimmer = 0, endJitter = 0, breathy = 0, lengthen = 1, tone = 0, shift = 1, lo = .72, hi = 1.35,
  stress = null, tilt = 0, pre = null } = {}) {
  if (!x || x.length < rate * .15) return x;
  const rnd = seeded(seed * 2654435761 + x.length), hopF = rate * .01, f0 = pitchOf(x, rate), F = f0.length;
  // how loud the voice is (for the breaths): the average of its louder 10 ms frames
  const fr = new Float32Array(F); let top = 0;
  for (let f = 0; f < F; f++) { let s = 0; const a = Math.round(f * hopF), b = Math.min(x.length, Math.round((f + 1) * hopF)); for (let i = a; i < b; i++) s += x[i] * x[i]; fr[f] = Math.sqrt(s / Math.max(1, b - a)); if (fr[f] > top) top = fr[f]; }
  let ls = 0, ln = 0; for (let f = 0; f < F; f++) if (fr[f] > top * .1) { ls += fr[f] * fr[f]; ln++; }
  const speech = ln ? Math.sqrt(ls / ln) : 0;
  // where the speech stops: the end of the part, and each pause of 120 ms or more inside it (a phrase's end); ez: how
  // near the end of its phrase each 10 ms is (1 at the end, over the last quarter of a second; inside the part, half)
  const said = top * .06, ends = [], ez = new Float32Array(F);
  for (let f = 0, last = -1; f <= F; f++) {
    if (f < F && fr[f] >= said) { last = f; continue; }
    let g = f; while (g < F && fr[g] < said) g++;
    if (last >= 0 && (g >= F || g - f >= 12)) ends.push([last, g >= F ? 1 : .5]);
    f = g - 1; if (g >= F) break;
  }
  for (const [e, w] of ends) for (let k = 0; k < 25; k++) if (e - k >= 0) ez[e - k] = Math.max(ez[e - k], w * (1 - k / 25));
  let vEnd = F - 1; while (vEnd > 0 && !f0[vEnd]) vEnd--;

  // the new pitch: the line the pitch follows over the part (a straight fit of log pitch against time), the pitch moved
  // `wide` times as far from it, then a slow drift and a little jitter on top
  let sx = 0, sy = 0, sxx = 0, sxy = 0, nv = 0;
  for (let f = 0; f < F; f++) if (f0[f]) { const y = Math.log(f0[f]); sx += f; sy += y; sxx += f * f; sxy += f * y; nv++; }
  const ratio = new Float32Array(F).fill(Math.max(lo, Math.min(hi, shift)));
  if (nv >= 8) {
    const den = nv * sxx - sx * sx, slope = den ? (nv * sxy - sx * sy) / den : 0, icpt = (sy - slope * sx) / nv;
    let drift = 0; const keep = Math.exp(-2 * Math.PI * driftHz / 100);   // (a drift a few times a second)
    for (let f = 0; f < F; f++) {
      drift = drift * keep + gauss(rnd) * Math.sqrt(1 - keep * keep);
      if (!f0[f]) continue;
      // (the pitch smoothed over 50 ms first, so the tracker's own small errors aren't made bigger too)
      let ys = 0, yn = 0; for (let g = Math.max(0, f - 2); g <= Math.min(F - 1, f + 2); g++) if (f0[g]) { ys += Math.log(f0[g]); yn++; }
      const y = ys / yn, line = icpt + slope * f;
      // the end of the part: further down (or up, asking), over its last 300 ms of voice
      const k = (f - (vEnd - 30)) / 30, tail = k > 0 ? k * k * (3 - 2 * k) : 0;
      const to = line + (y - line) * wide + drift * driftAmt * wobble + tail * (end === '?' ? rise : -fall) * Math.LN2 / 12;
      ratio[f] = Math.max(lo, Math.min(hi, Math.exp(to - y) * shift));   // (PSOLA stays clean within about a third either way)
    }
  }
  // stressed words (stress: [[from, to] seconds]): higher (about 2 semitones at the word's middle), louder and longer
  const acc = new Float32Array(F);
  for (const [a, b] of stress || []) {
    const fa = Math.max(0, Math.round(a * 100)), fb = Math.min(F, Math.round(b * 100));
    for (let f = fa; f < fb; f++) acc[f] = Math.max(acc[f], Math.sin(Math.PI * (f - fa + .5) / (fb - fa)) ** 1.5);
  }
  // only where two readings of the pitch agree is it moved: YIN's period (pitchOf) checked against how well the sound
  // itself repeats at that period, and not as well at half of it (where it would be an octave out). Where they don't,
  // the voice is left as it was said (shift alone): a pitch moved by a wrong reading is a warble, or a crackle.
  const sure = new Float32Array(F);
  for (let f = 0; f < F; f++) {
    if (!f0[f]) continue;
    const tau = Math.round(rate / f0[f]), c = Math.round((f + .5) * hopF), n = Math.min(Math.round(rate * .03), 2 * tau + 8), s0 = c - (n >> 1);
    if (s0 < 0 || s0 + n + tau >= x.length) { sure[f] = 1; continue; }
    const nc = l => { let xy = 0, xx = 0, yy = 0; for (let i = s0; i < s0 + n; i++) { const p = x[i], q = x[i + l]; xy += p * q; xx += p * p; yy += q * q; } return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0; };
    const r = nc(tau), r2 = tau >= 8 ? nc(tau >> 1) : -1;
    sure[f] = r >= .6 && r2 < r - .1 ? 1 : 0;
  }
  for (let f = 0, prev = 0; f < F; f++) {   // (eased over 50 ms either way, so it never snaps)
    let s2 = 0, n2 = 0; for (let g = Math.max(0, f - 2); g <= Math.min(F - 1, f + 2); g++) if (f0[g]) { s2 += sure[g]; n2++; }
    const v = n2 ? s2 / n2 : prev; prev = v;
    const base = Math.max(lo, Math.min(hi, shift));
    if (f0[f]) ratio[f] = Math.max(lo, Math.min(hi, base * (ratio[f] / base) ** v * 2 ** (2.2 * acc[f] / 12)));
  }
  const voiced = f => f >= 0 && f < F && f0[f] > 0;

  // the voice's own periods: a mark at each, on the peak of a smoothed copy (steadier than the raw sound's), each found
  // near where the period before says
  const sm = new Float32Array(x.length), ka = 1 - Math.exp(-2 * Math.PI * 900 / rate);
  for (let i = 0, v = 0, u = 0; i < x.length; i++) { v += (x[i] - v) * ka; u += (v - u) * ka; sm[i] = u; }
  const marks = [], runEnd = [];
  for (let f = 0; f < F;) {
    if (!voiced(f)) { f++; continue; }
    let g = f; while (voiced(g)) g++;
    const s0 = Math.round(f * hopF), s1 = Math.min(x.length - 1, Math.round(g * hopF));
    let P = rate / f0[f], best = s0, bv = -Infinity;
    for (let i = s0; i < Math.min(s1, s0 + P); i++) if (sm[i] > bv) { bv = sm[i]; best = i; }
    for (let m = best; m < s1;) {
      marks.push(m); runEnd.push(s1);
      const fi = Math.min(F - 1, Math.round(m / hopF)); P = rate / (f0[fi] || f0[f]);
      const want = Math.round(m + P), r = Math.round(P * .15); let nb = want; bv = -Infinity;
      for (let i = want - r; i <= want + r && i < x.length; i++) if (sm[i] > bv) { bv = sm[i]; nb = i; }
      m = nb > m ? nb : want;
    }
    f = g;
  }

  // laid down again: in voice, a grain from each mark (two of its periods long) at the new periods, the mark taken
  // being the one nearest in time, so with no change each grain lands back where it came from; elsewhere the sound as
  // it was (grains 20 ms long, half overlapping); everything divided by how much window landed on it
  const out = new Float32Array(x.length), ws = new Float32Array(x.length);
  const grain = (from, at, left, right, gain = 1) => {
    for (let k = -left + 1; k < right; k++) {
      const i = at + k, j = from + k; if (i < 0 || i >= x.length || j < 0 || j >= x.length) continue;
      const w = .5 + .5 * Math.cos(Math.PI * k / (k < 0 ? left : right));
      out[i] += x[j] * w * gain; ws[i] += w;
    }
  };
  const M = marks.length, gapOf = i => i + 1 < M && marks[i + 1] < runEnd[i] ? marks[i + 1] - marks[i] : i > 0 && marks[i - 1] >= marks[i] - 2 * rate / MIN_HZ && runEnd[i - 1] === runEnd[i] ? marks[i] - marks[i - 1] : Math.round(rate / 150);
  let mi = 0, inVoice = false;
  for (let t = 0; t < x.length;) {
    if (!voiced(Math.min(F - 1, Math.floor(t / hopF))) || !M) inVoice = false;
    else {
      if (!inVoice) { while (mi < M && marks[mi] < t) mi++; if (mi < M && marks[mi] - t < rate / MIN_HZ) { t = marks[mi]; inVoice = true; } }
      if (inVoice) while (mi + 1 < M && Math.abs(marks[mi + 1] - t) <= Math.abs(marks[mi] - t)) mi++;
      // past the last period of its stretch of voice: the rest of it as it was
      if (inVoice && (mi + 1 >= M || marks[mi + 1] >= runEnd[mi]) && t > marks[mi] + gapOf(mi) * .5) inVoice = false;
    }
    if (inVoice) {
      const f = Math.min(F - 1, Math.floor(t / hopF)), left = mi > 0 && runEnd[mi - 1] === runEnd[mi] ? marks[mi] - marks[mi - 1] : gapOf(mi), right = gapOf(mi);
      const e = ez[f];
      // (shimmer: each period a little louder or softer, more so at a phrase's end. A creak at the end, pulses far apart
      // with nothing between them, was heard as crackle: there is none.)
      grain(marks[mi], Math.round(t), left, right, Math.max(.5, 1 + gauss(rnd) * shimmer * (1 + e)) * (1 + .3 * acc[f]));
      t += Math.max(rate / MAX_HZ, right / ratio[f] * (1 + gauss(rnd) * jitter * wobble * (1 + endJitter * e)));
    } else {
      grain(Math.round(t), Math.round(t), Math.round(rate * .01), Math.round(rate * .01));
      t += rate * .005;
    }
  }
  // (where less than a whole window landed, at the edges of the voice, the sound as it was makes up the rest: dividing
  // by a thin edge of window there made the tail of a grain many times louder, a click)
  for (let i = 0; i < x.length; i++) out[i] = ws[i] >= 1 ? out[i] / ws[i] : out[i] + x[i] * (1 - ws[i]);
  // effort (tilt 0..1, speaking up over noise): more of the voice above 1.5 kHz, about 4 dB at full effort
  if (tilt > 0) { const k = Math.exp(-2 * Math.PI * 1500 / rate); let a = 0, p = 0; for (let i = 0; i < out.length; i++) { a = k * (a + out[i] - p); p = out[i]; out[i] += a * .6 * tilt; } }

  // breathiness: air escaping through the voice as the folds open each period (noise gated by the voice's own cycle,
  // between 2 and 6 kHz, as loud as the voice's own sound there at each moment, more as a phrase trails off): it sits
  // inside the voice where added hiss sat on top of it
  if (breathy > 0 && speech) {
    const h1 = Math.exp(-2 * Math.PI * 2000 / rate), l6 = Math.exp(-2 * Math.PI * 6000 / rate), hfr = new Float32Array(F);
    let a = 0, p = 0, b = 0;
    for (let f = 0; f < F; f++) {   // the voice's own 2-6 kHz level, every 10 ms
      let e = 0; const s0 = Math.round(f * hopF), s1 = Math.min(out.length, Math.round((f + 1) * hopF));
      for (let i = s0; i < s1; i++) { a = h1 * (a + out[i] - p); p = out[i]; b = l6 * b + (1 - l6) * a; e += b * b; }
      hfr[f] = Math.sqrt(e / Math.max(1, s1 - s0));
    }
    // (the filtered, gated noise measured once so breathy 1 is air as loud as the voice's own top end; it fades in and out
    // over 5 ms where the voice starts and stops, so it never switches on at full strength)
    const band = (n, gated) => { let n1 = 0, q1 = 0, n2 = 0, ph = 0, ss = 0; for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; n1 = h1 * (n1 + w - q1); q1 = w; n2 = l6 * n2 + (1 - l6) * n1; ph += 2 * Math.PI * 140 / rate; const v = n2 * (gated ? .25 + .75 * Math.max(0, Math.cos(ph)) ** 2 : 1); ss += v * v; } return Math.sqrt(ss / n); };
    const norm = 1 / Math.max(1e-6, band(4096, true)), fade = 1 - Math.exp(-1 / (rate * .005));
    let n1 = 0, q1 = 0, n2 = 0, ph = 0, on = 0;
    for (let i = 0; i < out.length; i++) {
      const f = Math.min(F - 1, Math.floor(i / hopF)), v = f0[f] > 0;
      on += ((v ? 1 : 0) - on) * fade; if (on < 1e-4) { ph = 0; continue; }
      if (v) ph += 2 * Math.PI * f0[f] * ratio[f] / rate;
      const w = rnd() * 2 - 1; n1 = h1 * (n1 + w - q1); q1 = w; n2 = l6 * n2 + (1 - l6) * n1;
      const gate = .25 + .75 * Math.max(0, Math.cos(ph)) ** 2;
      out[i] += n2 * gate * norm * on * hfr[f] * breathy * (1 + ez[f]);
    }
  }
  // the last syllable before each pause drawn out a little, as people do (lengthen 1: as said)
  const drawOut = y => {
    if (!(lengthen > 1.01) && !stress?.length) return y;
    const zone = new Float32Array(F); for (const [e, w] of ends) for (let k = 0; k < 20; k++) if (e - k >= 0) zone[e - k] = Math.max(zone[e - k], (1 - k / 20) * (w > .9 ? 1 : .8));
    return warp(y, rate, i => { const f = Math.min(F - 1, Math.floor(i / hopF)); return 1 / (1 + (lengthen - 1) * zone[f] + .2 * acc[f]); });
  };
  // the room under it all, the breath's gap before the part too, so no pause falls to digital silence
  const room = y => {
    if (tone > 0 && speech) { const r = roomTone(y.length, rate, speech * tone, rnd); for (let k = 0; k < y.length; k++) y[k] += r[k]; }
    return y;
  };

  if (!speech || !(breath > 0) && !pre) return room(drawOut(out));
  // breaths: in some of the pauses of nearly half a second or more inside the part (ending a little before the voice
  // comes back), and mostly before the part when it isn't the first of its line. Soft: about 35 dB under the voice, as
  // a close microphone hears breaths in read speech (louder, and taken at every pause, they sounded forced). Each as
  // deep as what comes after it is long, as people breathe: a few words take a little sip of air, or none; a long
  // sentence a fuller breath, more often
  const level = speech * .018 * Math.min(1, breath), quiet = top * .06, adds = [];
  const ahead = f => { let g = f, q = 0; for (; g < F; g++) { if (fr[g] < quiet) { if (++q >= 34) { g -= q; break; } } else q = 0; } return (g - f) * .01; };
  const deep = sec => Math.max(0, Math.min(1, (sec - .8) / 2.5));
  for (let f = 0, a = -1; breath > 0 && f <= F; f++) {
    const q = f < F && fr[f] < quiet;
    if (q && a < 0) a = f;
    if (!q && a >= 0) {
      const k = f < F && a > 0 && f - a >= 45 ? deep(ahead(f)) : -1;
      if (k >= 0 && rnd() < .35 + .45 * k) {
        const len = Math.round(Math.min(.18 + .2 * k + .04 * rnd(), (f - a) * .01 - .16) * rate), end = Math.round(f * hopF) - Math.round(rate * (.06 + .04 * rnd()));
        if (len > rate * .14) adds.push([end - len, breathe(len, rate, level * (.6 + .6 * k) * (.85 + .3 * rnd()), rnd)]);
      }
      a = -1;
    }
  }
  for (const [at, b] of adds) for (let i = 0; i < b.length; i++) if (at + i >= 0 && at + i < out.length) out[at + i] += b[i];
  const done = drawOut(out);
  // before it: a sigh or a gasp (pre), made from the voice's own sound; else, after the first part, mostly a breath
  let sound = null, gap = 0;
  if (pre === 'sigh' || pre === 'gasp') {
    const tract = tractOf(x, f0, rate);
    sound = pre === 'sigh' ? sigh(Math.round(rate * (.6 + .25 * rnd())), rate, speech * .08, tract, rnd) : gasp(Math.round(rate * (.2 + .08 * rnd())), rate, speech * .07, tract, rnd);
    gap = Math.round(rate * (pre === 'sigh' ? .2 + .1 * rnd() : .08 + .05 * rnd()));
  } else if (!first && breath > 0) {
    const k = deep(ahead(0));
    if (rnd() < .35 + .55 * k) { sound = breathe(Math.round(rate * (.16 + .2 * k + .05 * rnd())), rate, level * (.6 + .6 * k), rnd); gap = Math.round(rate * (.06 + .05 * rnd())); }
  }
  if (!sound) return room(done);
  const lead = new Float32Array(sound.length + gap + done.length);
  lead.set(sound); lead.set(done, sound.length + gap);
  return room(lead);
}
