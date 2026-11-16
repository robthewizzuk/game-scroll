/**
 * The built-in voice made more like a person after it is spoken (talk-worker.js runs it on each part of a line, before
 * its speed is set): a wider pitch range, the small unsteadiness of a real voice, and a quiet breath before a sentence
 * and in long pauses. Measured against the 7M's own sound (Rob's "sounds computer-made", 11-16): its pitch moved about
 * 9 semitones over a line and glided smoothly from moment to moment, where Tiny Voca's moved about 15 and Kokoro's and
 * Tiny Voca's wavered about 70% more; and widening the latents inside the model (the old lively) cost the sound more
 * than it gave. Here the voice's own sound is kept and only its pitch is moved (TD-PSOLA: a grain two periods long is
 * cut at each period of the voice and laid down again at the new period), so the words stay as clear.
 *   humanize(x, rate, { wide, wobble, breath, seed, first }) -> Float32Array (the same length, or longer by the breath
 *   before it: x is not changed)
 * wide: how far the pitch moves from the line it follows over the part (1 as spoken; 1.35 is the default here).
 * wobble: 0..1 the small unsteadiness (1: about half a percent of drift and a quarter of jitter, like a relaxed voice).
 * breath: 0..1 how loud the breaths are (0: none). first: true for the first part of a line, which takes no breath
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

/** A breath in, made in code: air through a throat (noise shaped by two broad resonances), rising then falling away. */
function breathe(n, rate, level, rnd) {
  const y = new Float32Array(n);
  // two band-passes (biquads) on white noise: about 1.4 kHz and 3.2 kHz, wide
  const bp = (f, q) => { const w = 2 * Math.PI * f / rate, al = Math.sin(w) / (2 * q), a0 = 1 + al; return [al / a0, 0, -al / a0, -2 * Math.cos(w) / a0, (1 - al) / a0]; };
  const B = [bp(1400 + 300 * rnd(), .9), bp(3200 + 500 * rnd(), 1.1)], z = B.map(() => [0, 0, 0, 0]);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n, env = t < .62 ? Math.sin(t / .62 * Math.PI / 2) ** 2 : Math.cos((t - .62) / .38 * Math.PI / 2) ** 1.5;
    const w = rnd() * 2 - 1; let v = 0;
    B.forEach((b, k) => { const s = z[k], o = b[0] * w + b[1] * s[0] + b[2] * s[1] - b[3] * s[2] - b[4] * s[3]; s[1] = s[0]; s[0] = w; s[3] = s[2]; s[2] = o; v += o * (k ? .6 : 1); });
    y[i] = v * env; sum += y[i] * y[i];
  }
  const k = sum > 0 ? level / Math.sqrt(sum / n) : 0;
  for (let i = 0; i < n; i++) y[i] *= k;
  return y;
}

export function humanize(x, rate, { wide = 1.35, wobble = 1, breath = 1, seed = 1, first = false } = {}) {
  if (!x || x.length < rate * .15) return x;
  const rnd = seeded(seed * 2654435761 + x.length), hopF = rate * .01, f0 = pitchOf(x, rate), F = f0.length;
  // how loud the voice is (for the breaths): the average of its louder 10 ms frames
  const fr = new Float32Array(F); let top = 0;
  for (let f = 0; f < F; f++) { let s = 0; const a = Math.round(f * hopF), b = Math.min(x.length, Math.round((f + 1) * hopF)); for (let i = a; i < b; i++) s += x[i] * x[i]; fr[f] = Math.sqrt(s / Math.max(1, b - a)); if (fr[f] > top) top = fr[f]; }
  let ls = 0, ln = 0; for (let f = 0; f < F; f++) if (fr[f] > top * .1) { ls += fr[f] * fr[f]; ln++; }
  const speech = ln ? Math.sqrt(ls / ln) : 0;

  // the new pitch: the line the pitch follows over the part (a straight fit of log pitch against time), the pitch moved
  // `wide` times as far from it, then a slow drift and a little jitter on top
  let sx = 0, sy = 0, sxx = 0, sxy = 0, nv = 0;
  for (let f = 0; f < F; f++) if (f0[f]) { const y = Math.log(f0[f]); sx += f; sy += y; sxx += f * f; sxy += f * y; nv++; }
  const ratio = new Float32Array(F).fill(1);
  if (nv >= 8) {
    const den = nv * sxx - sx * sx, slope = den ? (nv * sxy - sx * sy) / den : 0, icpt = (sy - slope * sx) / nv;
    let drift = 0; const keep = Math.exp(-2 * Math.PI * 4 / 100);   // (a drift a few times a second)
    for (let f = 0; f < F; f++) {
      drift = drift * keep + gauss(rnd) * Math.sqrt(1 - keep * keep);
      if (!f0[f]) continue;
      // (the pitch smoothed over 50 ms first, so the tracker's own small errors aren't made bigger too)
      let ys = 0, yn = 0; for (let g = Math.max(0, f - 2); g <= Math.min(F - 1, f + 2); g++) if (f0[g]) { ys += Math.log(f0[g]); yn++; }
      const y = ys / yn, line = icpt + slope * f;
      const to = line + (y - line) * wide + drift * .0065 * wobble;
      ratio[f] = Math.max(.72, Math.min(1.45, Math.exp(to - y)));
    }
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
  const grain = (from, at, left, right) => {
    for (let k = -left + 1; k < right; k++) {
      const i = at + k, j = from + k; if (i < 0 || i >= x.length || j < 0 || j >= x.length) continue;
      const w = .5 + .5 * Math.cos(Math.PI * k / (k < 0 ? left : right));
      out[i] += x[j] * w; ws[i] += w;
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
      grain(marks[mi], Math.round(t), left, right);
      t += Math.max(rate / MAX_HZ, right / ratio[f] * (1 + gauss(rnd) * .0028 * wobble));
    } else {
      grain(Math.round(t), Math.round(t), Math.round(rate * .01), Math.round(rate * .01));
      t += rate * .005;
    }
  }
  for (let i = 0; i < x.length; i++) out[i] = ws[i] > .05 ? out[i] / ws[i] : x[i];

  if (!(breath > 0) || !speech) return out;
  // breaths: in each pause of a third of a second or more inside the part (ending a little before the voice comes back),
  // and before the part when it isn't the first of its line. A breath is about 30 dB under the voice (quieter cost a speech-quality model less; this is the level of breaths in read speech).
  const level = speech * .03 * Math.min(1, breath), quiet = top * .06, adds = [];
  for (let f = 0, a = -1; f <= F; f++) {
    const q = f < F && fr[f] < quiet;
    if (q && a < 0) a = f;
    if (!q && a >= 0) {
      if (f < F && a > 0 && f - a >= 34) {
        const len = Math.round(Math.min(.42, (f - a) * .01 - .12) * rate), end = Math.round(f * hopF) - Math.round(rate * .05);
        if (len > rate * .18) adds.push([end - len, breathe(len, rate, level * (.8 + .4 * rnd()), rnd)]);
      }
      a = -1;
    }
  }
  for (const [at, b] of adds) for (let i = 0; i < b.length; i++) if (at + i >= 0 && at + i < out.length) out[at + i] += b[i];
  if (first) return out;
  const len = Math.round(rate * (.3 + .08 * rnd())), gap = Math.round(rate * .07), pre = new Float32Array(len + gap + out.length);
  pre.set(breathe(len, rate, level, rnd)); pre.set(out, len + gap);
  return pre;
}
