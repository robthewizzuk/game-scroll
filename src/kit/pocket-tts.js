// Pocket TTS 7M (Kyutai, CC BY 4.0) in plain JavaScript: text in, 24 kHz speech out, made a frame at a time.
// The engine's own voice where a computer has none worth hearing (src/kit/talk.js runs it in a worker; kit use only).
//
// The model, as Kyutai's pocket-tts (Python, MIT) runs it, here for the english_7m_refl_2026-10 weights only:
//   text -> SentencePiece pieces (4000, a low-rank lookup table) -> a causal transformer (8 layers, 224 wide, 8 query
//   heads over 2 key/value heads) that starts from a voice (its key/value cache after hearing the speaker) -> each
//   step a one-shot head turns the transformer's output and some noise into the next 32-number latent (12.5 a
//   second) -> Mimi's decoder (an upsampling convolution, a 12-layer transformer at 200 a second and SEANet's
//   convolutions) turns latents into sound. Every part keeps its state, so sound comes out as each latent is made.
// Given the same noise its sound matched Kyutai's own when it was written (within 0.00005 a sample at first, drifting to
// at most 0.02 late in a line as float sums in another order add up; the same words when transcribed). scripts/talk-test.mjs
// checks every voice still speaks, at its pitch, the same way for the same seed.
//
//   const tts = makeTTS(pack)            pack: unpack() of the voice file (talk-pack.js)
//   const line = tts.line('Hello there.', 'anna', { temp, rnd })   // one sentence or several
//   for (let chunk; (chunk = line.next()); ) play(chunk)                   // Float32Array pieces of speech, then null

import { gemm } from './gemm.js';

const SR = 24000, FRAME = 1920;   // samples a second, and for each latent (24000 / 12.5)
const SQRT1_2PI = Math.sqrt(2 / Math.PI);

/* ---------- small maths in the heap (offsets count floats; a weight offset of 0 is none) ---------- */
function norm(X, F, n, x, y, w, b, eps) {
  let mu = 0; for (let i = 0; i < n; i++) mu += X[x + i]; mu /= n;
  let v = 0; for (let i = 0; i < n; i++) { const d = X[x + i] - mu; v += d * d; } v /= n;
  const k = 1 / Math.sqrt(v + eps);
  for (let i = 0; i < n; i++) F[y + i] = (X[x + i] - mu) * k * (w ? F[w + i] : 1) + (b ? F[b + i] : 0);
}
// gelu and elu's curve from tables (a tenth of the time of tanh and expm1, within 0.000002 of them)
const table = (lo, hi, n, f) => { const t = new Float64Array(n + 2), k = n / (hi - lo); for (let i = 0; i <= n + 1; i++) t[i] = f(lo + i / k); return { t, lo, k }; };
const GT = table(-6, 6, 8192, x => .5 * x * (1 + Math.tanh(SQRT1_2PI * (x + .044715 * x * x * x)))), ET = table(-16, 0, 8192, Math.expm1);
const gelu = x => { if (x >= 6) return x; if (x <= -6) return 0; const u = (x + 6) * GT.k, i = u | 0, a = GT.t[i]; return a + (u - i) * (GT.t[i + 1] - a); };
const expm1 = x => { if (x <= -16) return -1; const u = (x + 16) * ET.k, i = u | 0, a = ET.t[i]; return a + (u - i) * (ET.t[i + 1] - a); };
const silu = x => x / (1 + Math.exp(-x));

/* ---------- the tokenizer: SentencePiece unigram, as the model's tokenizer.json runs it ---------- */
export function makeTokenizer(pieces, scores) {
  const id = new Map(), byte = new Map();
  let maxLen = 1, minScore = 0;
  pieces.forEach((p, i) => {
    const b = /^<0x([0-9A-F]{2})>$/.exec(p);
    if (b) byte.set(parseInt(b[1], 16), i);
    else if (i > 3) { id.set(p, i); maxLen = Math.max(maxLen, [...p].length); }
    if (scores[i] < minScore) minScore = scores[i];
  });
  const unk = minScore - 10, bytes = new TextEncoder();
  const word = (w, out) => {   // best split of one word (it starts with ▁): Viterbi over the pieces
    const ch = [...w], n = ch.length, best = new Float64Array(n + 1).fill(-Infinity), from = new Int32Array(n + 1), tok = new Int32Array(n + 1).fill(-1);
    best[0] = 0;
    for (let i = 0; i < n; i++) {
      if (best[i] === -Infinity) continue;
      let s = '';
      for (let j = i; j < n && j - i < maxLen; j++) {
        s += ch[j];
        const t = id.get(s);
        if (t !== undefined && best[i] + scores[t] > best[j + 1]) { best[j + 1] = best[i] + scores[t]; from[j + 1] = i; tok[j + 1] = t; }
      }
      // a character no piece starts with: unknown, said as its bytes
      if (!id.has(ch[i]) && best[i] + unk > best[i + 1]) { best[i + 1] = best[i] + unk; from[i + 1] = i; tok[i + 1] = 0; }
    }
    const rev = [];
    for (let i = n; i > 0; i = from[i]) {
      if (tok[i] > 0) rev.push(tok[i]);
      else for (const b of [...bytes.encode(ch.slice(from[i], i).join(''))].reverse()) rev.push(byte.get(b) ?? 0);
    }
    for (let k = rev.length - 1; k >= 0; k--) out.push(rev[k]);
  };
  const encode = text => {
    let s = String(text).replace(/ /g, '▁');
    if (!s.startsWith('▁')) s = '▁' + s;
    const out = [];
    for (const w of s.split(/(?=▁)/)) if (w) word(w, out);
    return out;
  };
  const decode = ids => {
    const out = []; let buf = [];
    const flush = () => { if (buf.length) { out.push(new TextDecoder().decode(new Uint8Array(buf))); buf = []; } };
    for (const t of ids) { const p = pieces[t] || ''; const m = /^<0x([0-9A-F]{2})>$/.exec(p); if (m) buf.push(parseInt(m[1], 16)); else { flush(); out.push(p); } }
    flush();
    return out.join('').replace(/▁/g, ' ').replace(/^ /, '');
  };
  return { encode, decode };
}

/* ---------- the text, as pocket-tts prepares it (models/text_chunking.py) ---------- */
const REPLACE = { '–': ',', '—': ',', '’': "'", '‘': "'" };
const TERMINAL = '.!?…', WEAK = ',;:-–—', CLOSERS = '"\'”’)]»';
export function prepareText(text) {
  let t = String(text).trim();
  t = t.replace(/[–—’‘]/g, c => REPLACE[c]).split(/\s+/).filter(Boolean).join(' ');
  t = t.replace(/([.!?…])\s*[,;:]/g, '$1');
  if (!t) return null;
  t = t.replace(/[\n\r]/g, ' ').replace(/ {2}/g, ' ');
  const words = t.split(/\s+/).filter(Boolean).length;
  if (t[0] !== t[0].toUpperCase()) t = t[0].toUpperCase() + t.slice(1);
  let core = t; while (core && (CLOSERS + ' ').includes(core[core.length - 1])) core = core.slice(0, -1);
  if (core && !TERMINAL.includes(core[core.length - 1])) {
    if (WEAK.includes(core[core.length - 1])) { let c = core; while (c && (WEAK + ' ').includes(c[c.length - 1])) c = c.slice(0, -1); t = c + '.' + t.slice(core.length).trim(); }
    else t += '.';
  }
  return { text: t, after: (words <= 4 ? 3 : 1) + 2 };
}
/** Splits a long line into the sentence groups the model makes one at a time (at most `max` pieces each). */
export function chunks(tok, text, max = 50) {
  const p = prepareText(text); if (!p) return [];
  const ids = tok.encode(p.text.trim());
  const ends = new Set(tok.encode('.!...?').slice(1)), soft = new Set(tok.encode(',;:').slice(1));
  const bounds = (list, set, decimals) => {
    const at = [0]; let was = false;
    for (let i = 0; i < list.length; i++) {
      if (set.has(list[i])) { was = true; continue; }
      if (was) {
        const pre = decimals ? tok.decode(list.slice(0, i)) : '', post = decimals ? tok.decode(list.slice(i)) : '';
        if (decimals && pre.length >= 2 && pre[pre.length - 1] === '.' && /\d/.test(pre[pre.length - 2]) && /^\d/.test(post)) { was = false; continue; }
        at.push(i);
      }
      was = false;
    }
    at.push(list.length);
    return at;
  };
  const segs = (list, at) => at.slice(0, -1).map((a, i) => [at[i + 1] - a, tok.decode(list.slice(a, at[i + 1]))]);
  const refined = [];
  for (const [n, s] of segs(ids, bounds(ids, ends, true))) {
    if (n <= max) { refined.push([n, s]); continue; }
    const sub = tok.encode(s.trim()), parts = segs(sub, bounds(sub, soft, false));
    if (parts.length > 1) refined.push(...parts); else refined.push([n, s]);
  }
  const out = []; let cur = '', cn = 0;
  for (const [n, s] of refined) {
    if (!cur) { cur = s; cn = n; continue; }
    if (cn + n > max) { out.push(cur.trim()); cur = s; cn = n; } else { cur += ' ' + s; cn += n; }
  }
  if (cur) out.push(cur.trim());
  return out;
}

/* ---------- the numbers live in one WebAssembly memory, where gemm (src/kit/gemm.js) sums them ---------- */
function heap(floats) {
  const memory = new WebAssembly.Memory({ initial: Math.ceil(floats * 4 / 65536) + 1 });
  const F = new Float32Array(memory.buffer);
  let top = 16;   // (0 is "no bias")
  const alloc = n => { const at = top; top += (n + 3) & ~3; if (top > F.length) throw new Error('voice: out of memory'); return at; };
  const put = a => { const at = alloc(a.length); F.set(a, at); return at; };
  const zalloc = n => { const at = alloc(n); F.fill(0, at, at + n); return at; };   // (memory is used again line after line: a state starts at nought)
  return { F, memory, alloc, zalloc, put, mark: () => top, reset: m => { top = m; } };
}

/* ---------- a streaming transformer layer stack (the flow LM's and Mimi's) ---------- */
function stack(H, mm, W, pre, { layers, d, heads, kvHeads, headDim, ff, context = 0, scale = false, maxPeriod = 10000, maxT = 16, maxCap = 2048, lo = 0, hi = layers }) {
  const { F } = H, L = [];
  layers = hi - lo;   // (only layers lo..hi-1: a stack can be cut in two, a part for each core)
  for (let l = lo; l < hi; l++) {
    const p = `${pre}.layers.${l}.`, w = n => H.put(W(p + n));
    L.push({ inW: w('self_attn.in_proj.weight'), outW: w('self_attn.out_proj.weight'), n1w: w('norm1.weight'), n1b: w('norm1.bias'),
      n2w: w('norm2.weight'), n2b: w('norm2.bias'), l1: w('linear1.weight'), l2: w('linear2.weight'),
      s1: scale ? w('layer_scale_1.scale') : 0, s2: scale ? w('layer_scale_2.scale') : 0 });
  }
  const qd = heads * headDim, kvd = kvHeads * headDim, pw = qd + 2 * kvd, rep = heads / kvHeads, half = headDim / 2;
  const freqs = new Float32Array(half); for (let i = 0; i < half; i++) freqs[i] = Math.exp(i * (-Math.log(maxPeriod) * 2 / headDim));
  const hB = H.alloc(maxT * d), pB = H.alloc(maxT * pw), aB = H.alloc(maxT * qd), uB = H.alloc(maxT * d), mB = H.alloc(maxT * ff);
  const scB = H.alloc(maxT * maxCap);   // attention scores: made once, before the per-line memory
  const kScale = 1 / Math.sqrt(headDim);
  const ln = (x, y, w, b, T) => { for (let t = 0; t < T; t++) norm(F, F, d, x + t * d, y + t * d, w, b, 1e-5); };
  const rope = (o, n, pos) => {
    for (let i = 0; i < half; i++) {
      const a = pos * freqs[i], c = Math.cos(a), s = Math.sin(a);
      for (let hh = 0; hh < n; hh++) { const k = o + hh * headDim + 2 * i, r = F[k], im = F[k + 1]; F[k] = r * c - im * s; F[k + 1] = r * s + im * c; }
    }
  };
  /** Key/value caches for every layer in this heap (cap positions; a ring of them where attention looks back `context`), from a voice or empty. */
  const cache = (cap, from = null) => {
    const k = [], v = [];
    for (let l = 0; l < layers; l++) {
      k.push(H.alloc(cap * kvd)); v.push(H.alloc(cap * kvd));
      if (from) { F.set(from.k[l], k[l]); F.set(from.v[l], v[l]); }
    }
    if (cap > maxCap) throw new Error('voice: line too long');
    return { pos: from ? from.pos : 0, cap, k, v, ring: !!context };
  };
  /** T positions (rows of d numbers at x, in the heap) through every layer, in place. */
  const run = (x, T, C) => {
    const pos0 = C.pos;
    if (!C.ring && pos0 + T > C.cap) throw new Error('voice: line too long');
    for (let l = 0; l < layers; l++) {
      const P = L[l], K = C.k[l], V = C.v[l];
      ln(x, hB, P.n1w, P.n1b, T);
      mm(hB, d, P.inW, d, pB, pw, T, pw, d, 0);
      for (let t = 0; t < T; t++) {
        const pos = pos0 + t, row = pB + t * pw, slot = (C.ring ? pos % C.cap : pos) * kvd;
        rope(row, heads, pos); rope(row + qd, kvHeads, pos);
        F.copyWithin(K + slot, row + qd, row + qd + kvd); F.copyWithin(V + slot, row + qd + kvd, row + pw);
      }
      // scores: every row's query against every key any row can see, one sum for each head (a ring wraps round: two)
      const span0 = context ? Math.max(0, pos0 - context + 1) : 0, span = pos0 + T - span0;
      for (let hh = 0; hh < heads; hh++) {
        const kh = (hh / rep) | 0, q = pB + hh * headDim;
        if (!C.ring) mm(q, pw, K + span0 * kvd + kh * headDim, kvd, scB, span, T, span, headDim, 0);
        else {
          const s0 = span0 % C.cap, n0 = Math.min(span, C.cap - s0);
          mm(q, pw, K + s0 * kvd + kh * headDim, kvd, scB, span, T, n0, headDim, 0);
          if (span > n0) mm(q, pw, K + kh * headDim, kvd, scB + n0, span, T, span - n0, headDim, 0);
        }
        for (let t = 0; t < T; t++) {
          const pos = pos0 + t, first = context ? Math.max(0, pos - context + 1) : 0, n = pos - first + 1, sc = scB + t * span + first - span0, o = aB + t * qd + hh * headDim;
          let mx = -Infinity;
          for (let j = 0; j < n; j++) { const s = F[sc + j] * kScale; F[sc + j] = s; if (s > mx) mx = s; }
          let sum = 0; for (let j = 0; j < n; j++) { const e = Math.exp(F[sc + j] - mx); F[sc + j] = e; sum += e; }
          for (let j = 0; j < n; j++) F[sc + j] /= sum;
          if (!C.ring) mm.wsum(sc, n, V + first * kvd + kh * headDim, kvd, o, headDim, 0);
          else {
            const s0 = first % C.cap, n0 = Math.min(n, C.cap - s0);
            mm.wsum(sc, n0, V + s0 * kvd + kh * headDim, kvd, o, headDim, 0);
            if (n > n0) mm.wsum(sc + n0, n - n0, V + kh * headDim, kvd, o, headDim, 1);
          }
        }
      }
      mm(aB, qd, P.outW, qd, uB, d, T, d, qd, 0);
      if (P.s1) for (let t = 0; t < T; t++) for (let i = 0; i < d; i++) F[x + t * d + i] += F[P.s1 + i] * F[uB + t * d + i];
      else for (let i = 0; i < T * d; i++) F[x + i] += F[uB + i];
      ln(x, hB, P.n2w, P.n2b, T);
      mm(hB, d, P.l1, d, mB, ff, T, ff, d, 0);
      for (let i = 0; i < T * ff; i++) F[mB + i] = gelu(F[mB + i]);
      mm(mB, ff, P.l2, ff, uB, d, T, d, ff, 0);
      if (P.s2) for (let t = 0; t < T; t++) for (let i = 0; i < d; i++) F[x + t * d + i] += F[P.s2 + i] * F[uB + t * d + i];
      else for (let i = 0; i < T * d; i++) F[x + i] += F[uB + i];
    }
    C.pos += T;
  };
  return { run, cache };
}

/* ---------- streaming convolutions (Mimi's decoder), time-major: row t holds every channel ---------- */
// conv: torch weight [out, in, k], stride 1; reordered to [out][k][in] so row t's window is one run of the input.
function conv(H, mm, w, b, cin, cout, k) {
  const { F } = H, r = new Float32Array(cout * k * cin);
  for (let o = 0; o < cout; o++) for (let c = 0; c < cin; c++) for (let j = 0; j < k; j++) r[(o * k + j) * cin + c] = w[(o * cin + c) * k + j];
  const W = H.put(r), B = H.put(b), keep = k - 1;
  return {
    state: () => keep ? H.zalloc(keep * cin) : 0,      // the last k-1 rows it saw (zeros at the start)
    run(st, x, T) {
      const buf = H.alloc((keep + T) * cin), y = H.alloc(T * cout);
      if (keep) F.copyWithin(buf, st, st + keep * cin);
      F.copyWithin(buf + keep * cin, x, x + T * cin);
      mm(buf, cin, W, k * cin, y, cout, T, cout, k * cin, B);
      if (keep) F.copyWithin(st, buf + T * cin, buf + (T + keep) * cin);
      return y;
    },
  };
}
// transposed conv with k = 2s: output row t*s + r = x[t]·W[:, :, r] + x[t-1]·W[:, :, r+s]; one sum for each r.
function convT(H, mm, w, b, cin, cout, k, s) {
  const { F } = H, Bs = [];
  for (let r = 0; r < s; r++) {
    const m = new Float32Array(cout * 2 * cin);
    for (let o = 0; o < cout; o++) for (let c = 0; c < cin; c++) { m[o * 2 * cin + c] = w[(c * cout + o) * k + r + s]; m[o * 2 * cin + cin + c] = w[(c * cout + o) * k + r]; }
    Bs.push(H.put(m));
  }
  const B = H.put(b);
  return {
    state: () => H.zalloc(cin),                         // the last row it saw (zeros at the start)
    run(st, x, T) {
      const buf = H.alloc((1 + T) * cin), y = H.alloc(T * s * cout);
      F.copyWithin(buf, st, st + cin); F.copyWithin(buf + cin, x, x + T * cin);
      for (let r = 0; r < s; r++) mm(buf, cin, Bs[r], 2 * cin, y + r * cout, s * cout, T, cout, 2 * cin, B);
      F.copyWithin(st, buf + T * cin, buf + (T + 1) * cin);
      return y;
    },
  };
}

/* ---------- the model in two halves, each with its own memory, so each can have a core of its own ---------- */
const D = 224, Z = 64, LAT = 32, FD = 192;
const weightsOf = pack => n => { const t = pack.get(n); if (!t) throw new Error('voice: no ' + n); return t; };

/**
 * The first half: text and a voice in, latents out (32 numbers each, 12.5 a second). pack: as makeTTS.
 * line(text, voice, opts).next() -> Float32Array(32) or null at the end; line.first is true when that latent starts
 * a new part of the text (Mimi starts again from silence there).
 */
export function makeFlow(pack, { plain = false } = {}) {
  const W = weightsOf(pack), tok = makeTokenizer(pack.pieces, pack.scores);
  const H = heap(8.8e6), { F } = H, mm = gemm(H.memory, { plain });
  const P = n => H.put(W(n));
  const lm = stack(H, mm, W, 'flow_lm.transformer', { layers: 8, d: D, heads: 8, kvHeads: 2, headDim: 64, ff: 224, maxT: 64 });
  const embed = W('flow_lm.conditioner.embed.weight'), embProj = P('flow_lm.conditioner.proj.weight');
  const inLin = P('flow_lm.input_linear.weight'), bos = W('flow_lm.bos_emb'), onw = P('flow_lm.out_norm.weight'), onb = P('flow_lm.out_norm.bias');
  const zProj = P('flow_lm.z_proj.weight'), eosW = W('flow_lm.out_eos.weight'), eosB = W('flow_lm.out_eos.bias');
  const FN = 'flow_lm.flow_net.', blocks = [0, 1, 2, 3].map(i => ({
    ada: P(`${FN}res_blocks.${i}.adaLN_modulation.1.weight`), adab: P(`${FN}res_blocks.${i}.adaLN_modulation.1.bias`), lnw: P(`${FN}res_blocks.${i}.in_ln.weight`), lnb: P(`${FN}res_blocks.${i}.in_ln.bias`),
    m0: P(`${FN}res_blocks.${i}.mlp.0.weight`), m0b: P(`${FN}res_blocks.${i}.mlp.0.bias`), m2: P(`${FN}res_blocks.${i}.mlp.2.weight`), m2b: P(`${FN}res_blocks.${i}.mlp.2.bias`) }));
  const fin = { ada: P(FN + 'final_layer.adaLN_modulation.1.weight'), adab: P(FN + 'final_layer.adaLN_modulation.1.bias'), w: P(FN + 'final_layer.linear.weight'), b: P(FN + 'final_layer.linear.bias') };
  const fIn = P(FN + 'input_proj.weight'), fInB = P(FN + 'input_proj.bias'), fC = P(FN + 'cond_embed.weight'), fCB = P(FN + 'cond_embed.bias');
  // fixed scratch for one step of the flow LM and its head
  const xB = H.alloc(64 * D), hB = H.alloc(D), zB = H.alloc(Z), sB = H.alloc(FD), yB = H.alloc(FD), aB = H.alloc(FD), modB = H.alloc(3 * FD), tB = H.alloc(FD), mB = H.alloc(FD), nB = H.alloc(LAT), lB = H.alloc(LAT), eB = H.alloc(64);
  const base = H.mark();   // everything above here is made again for each part of a line

  const lin = (w, x, y, n, m, b = 0) => mm(x, n, w, n, y, m, 1, m, n, b);
  // the flow head: the transformer's output (z) and noise (at nB) in, the next latent (at lB) out
  const head = () => {
    lin(fIn, nB, aB, LAT, FD, fInB); lin(fC, zB, yB, Z, FD, fCB);
    for (let i = 0; i < FD; i++) F[sB + i] = silu(F[yB + i]);
    for (const Bk of blocks) {
      lin(Bk.ada, sB, modB, FD, 3 * FD, Bk.adab);
      norm(F, F, FD, aB, tB, Bk.lnw, Bk.lnb, 1e-6);
      for (let i = 0; i < FD; i++) F[tB + i] = F[tB + i] * (1 + F[modB + FD + i]) + F[modB + i];
      lin(Bk.m0, tB, mB, FD, FD, Bk.m0b); for (let i = 0; i < FD; i++) F[mB + i] = silu(F[mB + i]);
      lin(Bk.m2, mB, tB, FD, FD, Bk.m2b);
      for (let i = 0; i < FD; i++) F[aB + i] += F[modB + 2 * FD + i] * F[tB + i];
    }
    lin(fin.ada, sB, modB, FD, 2 * FD, fin.adab);
    norm(F, F, FD, aB, tB, 0, 0, 1e-6);
    for (let i = 0; i < FD; i++) F[tB + i] = F[tB + i] * (1 + F[modB + FD + i]) + F[modB + i];
    lin(fin.w, tB, lB, FD, LAT, fin.b);
  };

  const voices = pack.voices;
  const gauss = rnd => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  let busy = null;

  /** One line in a voice (one at a time: a new one ends the last). Options as makeTTS's line(). */
  function line(text, voice, { temp = .3, rnd = Math.random, noise = null, eos = -1, lively = 0 } = {}) {
    // lively: each latent moved away from the part's average so far (1 + 0.6 lively times as far): a wider pitch range,
    // the words as clear (temperature, by contrast, changes the intonation hardly at all in this model). Only what Mimi
    // hears: the flow goes on from the latent it made.
    const wide = 1 + .6 * Math.max(0, Math.min(1, +lively || 0)), avg = new Float64Array(LAT);
    if (busy) busy.stop();
    const V = voices[voice] || voices[Object.keys(voices)[0]];
    const parts = chunks(tok, text);
    let pi = -1, cur = null, stopped = false;
    const draw = () => { if (noise) F.set(noise(), nB); else { const sd = Math.sqrt(temp); for (let i = 0; i < LAT; i++) F[nB + i] = gauss(rnd) * sd; } };
    const start = () => {
      H.reset(base);
      const p = prepareText(parts[pi]), ids = tok.encode(p.text);
      const maxLen = Math.ceil((ids.length / 3 + 2) * 12.5);
      const C = lm.cache(V.pos + ids.length + maxLen + 2, V);
      for (let at = 0; at < ids.length; at += 64) {   // the text, up to 64 pieces at a time
        const T = Math.min(64, ids.length - at);
        for (let t = 0; t < T; t++) { F.set(embed.subarray(ids[at + t] * 64, ids[at + t] * 64 + 64), eB); lin(embProj, eB, xB + t * D, 64, D); }
        lm.run(xB, T, C);
      }
      draw();   // (Kyutai's code makes a latent after the text too, and throws it away: the same noise follows)
      F.set(bos, lB);
      return { C, maxLen, after: p.after, step: 0, eosAt: -1 };
    };
    const next = () => {
      while (!stopped) {
        if (!cur) { if (++pi >= parts.length) { busy = null; return null; } cur = start(); me.first = true; avg.fill(0); }
        const s = cur;
        if (s.step >= s.maxLen) { cur = null; continue; }
        lin(inLin, lB, xB, LAT, D);
        lm.run(xB, 1, s.C);
        norm(F, F, D, xB, hB, onw, onb, 1e-5);
        lin(zProj, hB, zB, D, Z);
        let e = eosB[0]; for (let i = 0; i < Z; i++) e += eosW[i] * F[zB + i];
        if (e > eos && s.eosAt < 0 && s.step >= 6) s.eosAt = s.step;
        if (s.eosAt >= 0 && s.step >= s.eosAt + s.after) { cur = null; continue; }
        draw(); head();
        if (s.step++) me.first = false;
        const out = F.slice(lB, lB + LAT);
        if (wide !== 1) for (let i = 0; i < LAT; i++) { avg[i] += (out[i] - avg[i]) / s.step; out[i] = avg[i] + wide * (out[i] - avg[i]); }
        return out;
      }
      return null;
    };
    const me = { next, first: true, stop: () => { stopped = true; if (busy === me) busy = null; }, parts };
    busy = me;
    return me;
  }
  return { line, tokenizer: tok, voices: Object.keys(voices), simd: mm.simd };
}

/**
 * The second half: Mimi's decoder, latents in, sound out (1920 samples at 24 kHz for each). pack: as makeTTS.
 *   const S = mimi.start()                          a fresh decoder (one at a time: it starts again from silence)
 *   mimi.frame(S, latent [, out]) -> Float32Array    that latent's 80 ms of sound
 * It can be cut in two for two cores (part 'front' and part 'back', each in its own worker): the front runs the
 * first `split` of its 12 transformer layers, the back the rest and the convolutions to sound:
 *   front.front(S, latent) -> Float32Array(16 x 128)    back.back(S, that) -> Float32Array(1920)
 */
export const SPLIT = 8;   // (measured: the flow LM and 8 layers take as long as 4 layers and the convolutions)
export function makeMimi(pack, { plain = false, part = 'all', split = SPLIT } = {}) {
  const W = weightsOf(pack), front = part !== 'back', back = part !== 'front';
  const H = heap(part === 'all' ? 4e6 : part === 'front' ? 1.6e6 : 3e6), { F } = H, mm = gemm(H.memory, { plain });
  const P = n => H.put(W(n));
  const T = 16, D2 = 128, at = { layers: 12, d: D2, heads: 4, kvHeads: 4, headDim: 32, ff: 384, context: 50, scale: true, maxCap: 80 };
  const mtA = front ? stack(H, mm, W, 'mimi.decoder_transformer.transformer', { ...at, lo: 0, hi: part === 'all' ? 12 : split }) : null;
  const mtB = part === 'back' ? stack(H, mm, W, 'mimi.decoder_transformer.transformer', { ...at, lo: split, hi: 12 }) : null;
  let mean, std, quant, upW, c0, t2, r3a, r3b, t5, r6a, r6b, t8, r9a, r9b, c11, nB, qB;
  if (front) {
    mean = W('flow_lm.emb_mean'); std = W('flow_lm.emb_std');
    quant = P('mimi.quantizer.output_proj.weight'); upW = W('mimi.upsample.convtr.convtr.weight');
    nB = H.alloc(LAT); qB = H.alloc(D2);
  }
  if (back) {
    const dw = (i, p = 'conv') => [W(`mimi.decoder.model.${i}.${p}.weight`), W(`mimi.decoder.model.${i}.${p}.bias`)];
    c0 = conv(H, mm, ...dw(0), 128, 256, 3);
    t2 = convT(H, mm, ...dw(2, 'convtr'), 256, 128, 12, 6); r3a = conv(H, mm, ...dw('3.block.1'), 128, 64, 3); r3b = conv(H, mm, ...dw('3.block.3'), 64, 128, 1);
    t5 = convT(H, mm, ...dw(5, 'convtr'), 128, 64, 10, 5); r6a = conv(H, mm, ...dw('6.block.1'), 64, 32, 3); r6b = conv(H, mm, ...dw('6.block.3'), 32, 64, 1);
    t8 = convT(H, mm, ...dw(8, 'convtr'), 64, 32, 8, 4); r9a = conv(H, mm, ...dw('9.block.1'), 32, 16, 3); r9b = conv(H, mm, ...dw('9.block.3'), 16, 32, 1);
    c11 = conv(H, mm, ...dw(11), 32, 1, 3);
  }
  const seqB = H.alloc(T * D2);
  const base = H.mark();

  const lin = (w, x, y, n, m) => mm(x, n, w, n, y, m, 1, m, n, 0);
  // (a ring of 80 keys: 50 looked back + 16 written at once, so it never overwrites a key still wanted)
  const start = () => {
    H.reset(base);
    return { A: mtA && mtA.cache(80), B: mtB && mtB.cache(80), up: front ? H.zalloc(D2) : 0,
      s: back ? [c0, t2, r3a, r3b, t5, r6a, r6b, t8, r9a, r9b, c11].map(c => c.state()) : null };
  };
  const eluTo = (x, n) => { const y = H.alloc(n); for (let i = 0; i < n; i++) { const v = F[x + i]; F[y + i] = v > 0 ? v : expm1(v); } return y; };
  const res = (a, sa, b, sb, v, T, ch) => { const h = b.run(sb, eluTo(a.run(sa, eluTo(v, T * ch), T), T * ch / 2), T); for (let i = 0; i < T * ch; i++) F[h + i] += F[v + i]; return h; };
  // a latent to 16 rows at 200 a second, through the front's transformer layers (left at seqB)
  const toRows = (S, lat) => {
    for (let i = 0; i < LAT; i++) F[nB + i] = lat[i] * std[i] + mean[i];
    lin(quant, nB, qB, LAT, D2);
    for (let r = 0; r < T; r++) for (let c = 0; c < D2; c++) F[seqB + r * D2 + c] = F[qB + c] * upW[c * 32 + r] + F[S.up + c] * upW[c * 32 + r + 16];
    F.copyWithin(S.up, qB, qB + D2);
    mtA.run(seqB, T, S.A);
  };
  // the rows at seqB to sound
  const toSound = (S, out) => {
    const mark = H.mark();
    if (mtB) mtB.run(seqB, T, S.B);
    const s = S.s;
    let v = c0.run(s[0], seqB, T);
    v = t2.run(s[1], eluTo(v, T * 256), T); v = res(r3a, s[2], r3b, s[3], v, T * 6, 128);
    v = t5.run(s[4], eluTo(v, T * 6 * 128), T * 6); v = res(r6a, s[5], r6b, s[6], v, T * 30, 64);
    v = t8.run(s[7], eluTo(v, T * 30 * 64), T * 30); v = res(r9a, s[8], r9b, s[9], v, T * 120, 32);
    v = c11.run(s[10], eluTo(v, T * 120 * 32), T * 120);
    out.set(F.subarray(v, v + FRAME));
    H.reset(mark);
    return out;
  };
  return {
    start, rate: SR, samples: FRAME, simd: mm.simd,
    frame: part === 'all' ? (S, lat, out = new Float32Array(FRAME)) => { toRows(S, lat); return toSound(S, out); } : null,
    front: part === 'front' ? (S, lat) => { toRows(S, lat); return F.slice(seqB, seqB + T * D2); } : null,
    back: part === 'back' ? (S, rows, out = new Float32Array(FRAME)) => { F.set(rows, seqB); return toSound(S, out); } : null,
  };
}

/** Numbers from 0 to 1 that come out the same from the same seed (a line said the same way each time). */
export function seeded(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- the whole model on one thread ---------- */
/** pack: { get(name) -> Float32Array, pieces, scores, voices: { name: { pos, k: [per layer], v } } }; plain: no WebAssembly SIMD (tests). */
export function makeTTS(pack, { plain = false } = {}) {
  const flow = makeFlow(pack, { plain }), mimi = makeMimi(pack, { plain });
  /**
   * One line in a voice: { next() -> Float32Array of 1920 samples (24 kHz, 80 ms) or null at the end, stop() }.
   * One line at a time (a new one ends the last). temp: how varied (Kyutai's 0.3), rnd: () => 0..1 for the noise,
   * noise: () => Float32Array(32) to use instead (tests).
   */
  function line(text, voice, opts = {}) {
    const l = flow.line(text, voice, opts);
    let S = null;
    const next = () => {
      const lat = l.next(); if (!lat) return null;
      const first = l.first || !S;
      if (first) S = mimi.start();
      const out = mimi.frame(S, lat);
      if (first) for (let i = 0; i < 120; i++) out[i] *= i / 119;   // (each part fades in)
      return out;
    };
    return { next, stop: l.stop, parts: l.parts };
  }
  return { line, flow, mimi, tokenizer: flow.tokenizer, voices: flow.voices, rate: SR, frame: FRAME, simd: flow.simd };
}
