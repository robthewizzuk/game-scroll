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
 * wide: how far the pitch moves from the line it follows over the part (1 as spoken).
 * wobble: 0..1 the small unsteadiness (scales drift, a slow wander of the pitch, about 1.4% at 1 Hz, and jitter, period to
 * period, about 0.2%).
 * The defaults were tuned by CMA-ES (scripts/tune.cjs's search) against a speech-quality model (UTMOS) and the pitch of
 * real read speech (106 VCTK speakers: spread 3.7 semitones, 5-95% range 11.6): on 15 lines the 7M's own 2.4 / 8.0 become
 * 3.1 / 10.2 for a score 4.35 -> 4.29 (Rob 11-16: "keep going on making them more human like").
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

const WH = /^\W*(who|what|where|when|why|how|which|whose|whom)\b/i;
/** How a part ends, from its words: '?' a question asking yes or no (the voice rises), '.' anything else (it falls). */
export const endOf = text => /\?\W*$/.test(String(text || '').trim()) && !WH.test(String(text)) ? '?' : '.';

export function humanize(x, rate, { wide = 1.6, wobble = 1, breath = 1, seed = 1, first = false, drift: driftAmt = .014, jitter = .0022, driftHz = 1,
  end = '.', fall = 0, rise = 0, shimmer = 0, endJitter = 0, creak = 0, breathy = 0, lengthen = 1, tone = 0 } = {}) {
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
  // creak: at the very end of a falling part, sometimes the voice drops to a slow, uneven rattle
  const creaks = end !== '?' && rnd() < creak, crFrom = vEnd - 12 - Math.floor(rnd() * 6);

  // the new pitch: the line the pitch follows over the part (a straight fit of log pitch against time), the pitch moved
  // `wide` times as far from it, then a slow drift and a little jitter on top
  let sx = 0, sy = 0, sxx = 0, sxy = 0, nv = 0;
  for (let f = 0; f < F; f++) if (f0[f]) { const y = Math.log(f0[f]); sx += f; sy += y; sxx += f * f; sxy += f * y; nv++; }
  const ratio = new Float32Array(F).fill(1);
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
      ratio[f] = Math.max(.72, Math.min(1.35, Math.exp(to - y)));   // (PSOLA stays clean within about a third either way)
      if (creaks && f >= crFrom) ratio[f] *= .6;
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
  const out = new Float32Array(x.length), ws = new Float32Array(x.length), cz = creaks ? Math.round(crFrom * hopF) : x.length;
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
      const cr = t >= cz, e = ez[f];
      // (shimmer: each period a little louder or softer, more so at a phrase's end; creak: short pulses, far apart and uneven)
      grain(marks[mi], Math.round(t), left, cr ? Math.round(right * .7) : right, Math.max(.2, 1 + gauss(rnd) * shimmer * (1 + 2 * e)) * (cr ? .8 : 1));
      t += Math.max(rate / MAX_HZ, right / ratio[f] * (1 + gauss(rnd) * (cr ? .1 : jitter * wobble * (1 + endJitter * e))));
    } else {
      grain(Math.round(t), Math.round(t), Math.round(rate * .01), Math.round(rate * .01));
      t += rate * .005;
    }
  }
  // (where less than a whole window landed, at the edges of the voice, the sound as it was makes up the rest: dividing
  // by a thin edge of window there made the tail of a grain many times louder, a click)
  for (let i = 0; i < x.length; i++) out[i] = ws[i] >= 1 ? out[i] / ws[i] : i >= cz ? out[i] : out[i] + x[i] * (1 - ws[i]);

  // breathiness: air through the voice (noise above about 1.5 kHz, as loud as the voice is at each moment), more of it as
  // a phrase trails off
  if (breathy > 0 && speech) {
    const hp = Math.exp(-2 * Math.PI * 1500 / rate); let a1 = 0, a2 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < out.length; i++) {
      const f = Math.min(F - 1, Math.floor(i / hopF)); if (!f0[f] && !ez[f]) { p1 = p2 = 0; continue; }
      const w = rnd() * 2 - 1; a1 = hp * (a1 + w - p1); p1 = w; a2 = hp * (a2 + a1 - p2); p2 = a1;   // (two high-passes)
      const g = f + 1 < F ? fr[f] + (fr[f + 1] - fr[f]) * (i / hopF - f) : fr[f];
      out[i] += a2 * g * breathy * (1 + 2 * ez[f]) * 1.7;
    }
  }
  const finish = y => {
    // the last syllable before each pause drawn out a little, as people do (lengthen 1: as said)
    if (lengthen > 1.01) {
      const zone = new Float32Array(F); for (const [e, w] of ends) for (let k = 0; k < 20; k++) if (e - k >= 0) zone[e - k] = Math.max(zone[e - k], (1 - k / 20) * (w > .9 ? 1 : .8));
      const at = i => zone[Math.min(F - 1, Math.floor(i / hopF))];
      y = warp(y, rate, i => 1 / (1 + (lengthen - 1) * at(i)));
    }
    // room tone: the faint hiss of a room under the voice, as a microphone hears it, instead of digital silence
    if (tone > 0 && speech) {
      const lp = Math.exp(-2 * Math.PI * 2500 / rate); let v = 0; const lv = speech * tone * 3.1;   // (tone: its loudness against the voice's)
      for (let i = 0; i < y.length; i++) { v = lp * v + (1 - lp) * (rnd() * 2 - 1); y[i] += v * lv; }
    }
    return y;
  };

  if (!(breath > 0) || !speech) return finish(out);
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
  const done = finish(out);
  if (first) return done;
  const len = Math.round(rate * (.3 + .08 * rnd())), gap = Math.round(rate * .07), pre = new Float32Array(len + gap + done.length);
  pre.set(breathe(len, rate, level, rnd)); pre.set(done, len + gap);
  if (tone > 0) { const lp = Math.exp(-2 * Math.PI * 2500 / rate); let v = 0; for (let i = 0; i < len + gap; i++) { v = lp * v + (1 - lp) * (rnd() * 2 - 1); pre[i] += v * speech * tone * 3.1; } }
  return pre;
}
