// The voice file (src/kit/talk-files.js): Pocket TTS 7M's weights, its word pieces and the voices, in one small
// file of 8-bit numbers. scripts/talk-pack.mjs writes it from Kyutai's own files; src/kit/talk.js reads it.
// Kit use only.
//
// Layout: 'GSVOICE1', a u32 (little end) header length, the header (JSON), then the numbers, each run starting on
// 16 bytes. A weight is 'f32' (small ones: norms, biases) or 'i8' with one f32 scale a row (row = its first axis);
// a voice is its key/value cache after hearing the speaker (8 layers x keys and values x positions x 128),
// 8-bit with a scale for each 128.

const MAGIC = 'GSVOICE1';
const align = n => (n + 15) & ~15;

/** Rows of 8-bit numbers and a scale for each: { q: Int8Array, s: Float32Array }. */
function quantise(a, rows) {
  const n = a.length / rows, q = new Int8Array(a.length), s = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let m = 0; for (let i = r * n; i < (r + 1) * n; i++) m = Math.max(m, Math.abs(a[i]));
    const k = m / 127 || 1; s[r] = k;
    for (let i = r * n; i < (r + 1) * n; i++) q[i] = Math.max(-127, Math.min(127, Math.round(a[i] / k)));
  }
  return { q, s };
}

/**
 * Writes the file: tensors { name: Float32Array with .shape }, pieces, scores, voices [{ name, kind, hz, lang, credit,
 * pos, k: [8 layers of Float32Array], v }], about (shown in credits); mimi: the shape of the decoder where it is not
 * the 7M's own (a file of only Kyutai's 100M decoder: pocket-tts.js MIMI_BIG). Small tensors stay 32-bit.
 */
export function pack({ tensors, pieces = [], scores = [], voices = [], about, mimi }) {
  const blobs = [], header = { about, tensors: {}, pieces, scores, voices: [], ...(mimi ? { mimi } : {}) };
  let at = 0;
  const add = view => { const b = new Uint8Array(view.buffer, view.byteOffset, view.byteLength); const o = at; blobs.push([o, b]); at = align(at + b.length); return o; };
  for (const name of Object.keys(tensors).sort()) {
    const t = tensors[name], shape = t.shape || [t.length];
    if (t.length < 1024 || shape.length < 2) header.tensors[name] = { shape, type: 'f32', at: add(Float32Array.from(t)) };
    else { const { q, s } = quantise(t, shape[0]); header.tensors[name] = { shape, type: 'i8', at: add(q), scales: add(s) }; }
  }
  for (const v of voices) {
    const rows = v.k.length * 2 * v.pos, all = new Float32Array(rows * 128);
    v.k.forEach((k, l) => { all.set(k.subarray(0, v.pos * 128), (2 * l) * v.pos * 128); all.set(v.v[l].subarray(0, v.pos * 128), (2 * l + 1) * v.pos * 128); });
    const { q, s } = quantise(all, rows);
    header.voices.push({ name: v.name, kind: v.kind, hz: v.hz, lang: v.lang, credit: v.credit, pos: v.pos, layers: v.k.length, at: add(q), scales: add(s) });
  }
  const head = new TextEncoder().encode(JSON.stringify(header)), start = align(12 + head.length);
  const out = new Uint8Array(start + at);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(8, head.length, true);
  out.set(head, 12);
  for (const [o, b] of blobs) out.set(b, start + o);
  return out;
}

/** Reads the file: { get(name) -> Float32Array, pieces, scores, voices: { name: { pos, k, v } }, cast: [{ name, kind, hz, lang, credit }], about, mimi }. */
export function unpack(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (new TextDecoder().decode(u8.subarray(0, 8)) !== MAGIC) throw new Error('voice: not a voice file');
  const n = new DataView(u8.buffer, u8.byteOffset).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + n))), start = align(12 + n);
  const buf = u8.buffer, base = u8.byteOffset + start;
  const f32 = (o, len) => new Float32Array(buf.slice(base + o, base + o + len * 4));
  const deq = (o, so, rows, len) => {
    const q = new Int8Array(buf, base + o, len), s = f32(so, rows), per = len / rows, out = new Float32Array(len);
    for (let r = 0; r < rows; r++) { const k = s[r]; for (let i = r * per; i < (r + 1) * per; i++) out[i] = q[i] * k; }
    return out;
  };
  const cache = new Map();
  const get = name => {
    if (cache.has(name)) return cache.get(name);
    const t = header.tensors[name]; if (!t) return null;
    const len = t.shape.reduce((a, b) => a * b, 1);
    const a = t.type === 'f32' ? f32(t.at, len) : deq(t.at, t.scales, t.shape[0], len);
    cache.set(name, a);
    return a;
  };
  const voices = {};
  for (const v of header.voices) {
    let all = null; const k = [], vv = [], per = v.pos * 128;
    const load = () => { all ||= deq(v.at, v.scales, v.layers * 2 * v.pos, v.layers * 2 * per); };
    voices[v.name] = {
      pos: v.pos,
      get k() { load(); if (!k.length) for (let l = 0; l < v.layers; l++) { k.push(all.subarray(2 * l * per, (2 * l + 1) * per)); vv.push(all.subarray((2 * l + 1) * per, (2 * l + 2) * per)); } return k; },
      get v() { void this.k; return vv; },
    };
  }
  return { get, pieces: header.pieces, scores: header.scores, voices, cast: header.voices.map(({ name, kind, hz, lang, credit }) => ({ name, kind, hz, lang, credit })), about: header.about, mimi: header.mimi || null };
}
