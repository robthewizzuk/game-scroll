// Makes the app's voice file (src/kit/talk-files.js) from Kyutai's own Pocket TTS files (the 7M, and the 100M's decoder):
//   node scripts/talk-pack.mjs [outDir]          (default ml-cache/: writes <outDir>/<TALK_VERSION>/<TALK_FILE>)
//   node scripts/talk-pack.mjs --from <dir>      reads model.safetensors, tokenizer.json and embeddings/ from a folder
//                                                instead of downloading them (Hugging Face, at the pinned revision)
//   --from-big <dir>                             the 100M model's folder, for its decoder (TALK_SOURCE.decoderDir;
//                                                downloaded, only the decoder's part of its 219 MB file is fetched)
//   --from-base <dir>                            the 7M before its reward tuning (TALK_SOURCE.baseDir), whose step to
//                                                the tuned 7M is taken TALK_SOURCE.nudge times (nudged() below)
// Each voice is packed as what Kyutai's voice-cloning model heard of its speaker, calm and in four acted moods
// (scripts/talk-voices/prompt.py writes them to scripts/talk-voices/prompts/<name>.safetensors from the recordings in
// sources.json, and checks each against the voice as Kyutai ships it); a voice with no recording to hear (daan) is
// packed as Kyutai ships it. Voices marked own: true in talk-files.js are not Kyutai's: the model heard them from a
// licensed recording (scripts/talk-voices/clone.py chose them).
// scripts/fetch-ml.mjs runs it too, so the games workflow uploads the file with the face tracking files. The file
// comes out the same every time; its SHA-256 must match TALK_SHA256 (the app checks it too), or this stops.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TALK_VERSION, TALK_FILE, TALK_SHA256, TALK_SOURCE, TALK_VOICES, TALK_ABOUT } from '../src/kit/talk-files.js';
import { pack } from '../src/kit/talk-pack.js';
import { makeTTS, MIMI_BIG } from '../src/kit/pocket-tts.js';

const MOODS = ['calm', 'angry', 'happy', 'scared', 'sad'];   // (the order they are packed in)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** { name: Float32Array with .shape } from a safetensors file (32-bit or bfloat16 floats; whole numbers as plain numbers). */
export function safetensors(buf) {
  const b = Buffer.from(buf), n = Number(b.readBigUInt64LE(0)), head = JSON.parse(b.subarray(8, 8 + n).toString()), base = 8 + n, out = {};
  for (const [k, v] of Object.entries(head)) {
    if (k === '__metadata__') continue;
    const [a, z] = v.data_offsets, raw = b.buffer.slice(b.byteOffset + base + a, b.byteOffset + base + z);
    const t = v.dtype === 'F32' ? new Float32Array(raw) : v.dtype === 'I64' ? Float32Array.from(new BigInt64Array(raw), Number)
      : v.dtype === 'BF16' ? new Float32Array(Uint32Array.from(new Uint16Array(raw), h => h << 16).buffer)
      : v.dtype === 'F16' ? Float32Array.from(new Uint16Array(raw), half) : null;
    if (!t) throw new Error(`talk-pack: ${k} is ${v.dtype}`);
    t.shape = v.shape; out[k] = t;
  }
  return out;
}

/** A 16-bit float as a number. */
function half(h) {
  const e = (h >> 10) & 31, m = h & 1023, s = h & 32768 ? -1 : 1;
  return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
}

const urlOf = (dir, rel) => `https://huggingface.co/${TALK_SOURCE.repo}/resolve/${TALK_SOURCE.revision}/${dir}/${rel}`;
async function download(url, range = null) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, range ? { headers: { Range: `bytes=${range[0]}-${range[1] - 1}` } } : {});
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (range && b.length !== range[1] - range[0]) throw new Error(`${url}: ${b.length} bytes, not ${range[1] - range[0]}`);
      return b;
    } catch (e) { if (i >= 3) throw e; await new Promise(res => setTimeout(res, 2000 * (i + 1))); }
  }
}

/** Kyutai's files: from a folder, or downloaded at the pinned revision. */
async function source(from) {
  const read = async rel => from ? readFileSync(join(from, rel)) : download(urlOf(TALK_SOURCE.dir, rel));
  const weights = safetensors(await read('model.safetensors'));
  const tok = JSON.parse((await read('tokenizer.json')).toString());
  const voices = [];
  for (const v of TALK_VOICES) {
    const heard = join(ROOT, 'scripts/talk-voices/prompts', `${v.name}.safetensors`);
    voices.push(existsSync(heard) ? { ...v, heard: safetensors(readFileSync(heard)) } : { ...v, file: safetensors(await read(`embeddings/${v.name}.safetensors`)) });
  }
  return { weights, tok, voices };
}

/**
 * The tuned 7M's weights taken `a` times as far from the 7M before its tuning: before + a (tuned - before), for each
 * weight the tuning changed. A voice's prompt is the recording through the speaker projection, so it moves with it:
 * rows + (P' - P) lat, with lat = P+ rows (P is 224 x 32; what of a row P can't make, rounding, is kept as it is). Its first row is the marker the
 * model puts before a voice (bos_before_voice), nudged with the rest.
 */
export function nudged(tuned, before, a) {
  const out = {};
  for (const [k, w] of Object.entries(tuned)) {
    const b = before[k];
    if (a === 1 || !k.startsWith('flow_lm.') || !b || b.length !== w.length) { out[k] = w; continue; }
    const x = new Float32Array(w.length); for (let i = 0; i < w.length; i++) x[i] = w[i] + (a - 1) * (w[i] - b[i]);
    x.shape = w.shape; out[k] = x;
  }
  const P = tuned['flow_lm.speaker_proj_weight'], Q = out['flow_lm.speaker_proj_weight'], n = 224, r = 32;
  // P+ = (P'P)^-1 P' (in doubles), then M = Q P+ (224 x 224): what a prompt row becomes
  const G = new Float64Array(r * r), I = new Float64Array(r * r);
  for (let i = 0; i < r; i++) { I[i * r + i] = 1; for (let j = 0; j < r; j++) { let s = 0; for (let t = 0; t < n; t++) s += P[t * r + i] * P[t * r + j]; G[i * r + j] = s; } }
  for (let c = 0; c < r; c++) {   // Gauss-Jordan (G is symmetric and well conditioned)
    const p = G[c * r + c];
    for (let j = 0; j < r; j++) { G[c * r + j] /= p; I[c * r + j] /= p; }
    for (let i = 0; i < r; i++) if (i !== c) { const f = G[i * r + c]; if (f) for (let j = 0; j < r; j++) { G[i * r + j] -= f * G[c * r + j]; I[i * r + j] -= f * I[c * r + j]; } }
  }
  const Pp = new Float64Array(r * n);
  for (let i = 0; i < r; i++) for (let t = 0; t < n; t++) { let s = 0; for (let j = 0; j < r; j++) s += I[i * r + j] * P[t * r + j]; Pp[i * n + t] = s; }
  const bos = tuned['flow_lm.bos_before_voice'];
  const prompt = rows => {
    if (a === 1) return rows;
    const T = rows.length / n, y = new Float32Array(rows.length), lat = new Float64Array(r);
    for (let t = 0; t < T; t++) {
      if (t === 0 && bos.every((b, u) => Math.abs(rows[u] - b) < 1e-3)) { y.set(out['flow_lm.bos_before_voice'], 0); continue; }   // (the voice starts with the model's own marker)
      for (let i = 0; i < r; i++) { let s = 0; for (let u = 0; u < n; u++) s += Pp[i * n + u] * rows[t * n + u]; lat[i] = s; }
      for (let u = 0; u < n; u++) { let s = 0; for (let i = 0; i < r; i++) s += (Q[u * r + i] - P[u * r + i]) * lat[i]; y[t * n + u] = rows[t * n + u] + s; }
    }
    y.shape = rows.shape; return y;
  };
  return { weights: out, prompt };
}

/** The file's bytes, from Kyutai's files. */
export async function build(from = null, fromBig = null, fromBase = null) {
  const { weights: tuned, tok, voices } = await source(from), big = await decoderWeights(fromBig);
  const before = safetensors(fromBase ? readFileSync(join(fromBase, 'model.safetensors')) : await download(urlOf(TALK_SOURCE.baseDir, 'model.safetensors')));
  const { weights: w7, prompt } = nudged(tuned, before, TALK_SOURCE.nudge);
  const weights = n => n.startsWith('mimi.') ? big[n] : w7[n];
  // only what speaking needs: the engine says which weights it reads (the voice-cloning encoder and the 7M's own
  // decoder stay out)
  const used = new Set(), pieces = tok.model.vocab.map(x => x[0]), scores = tok.model.vocab.map(x => x[1]);
  makeTTS({ get: n => { used.add(n); return weights(n); }, pieces, scores, voices: {}, mimi: MIMI_BIG }, { plain: true });
  const tensors = {};
  for (const n of [...used].sort()) { if (!weights(n)) throw new Error(`talk-pack: no ${n}`); tensors[n] = weights(n); }
  if (tok.model?.type !== 'Unigram' || !tok.model.byte_fallback) throw new Error('talk-pack: the word pieces are not the kind the engine reads');
  const cast = voices.map(({ name, kind, hz, lang, credit, own, file, heard }) => {
    const by = own ? 'Kyutai\'s voice-cloning model' : 'Kyutai TTS voices';
    if (heard) {
      for (const m of MOODS) if (!heard[m] || heard[m].shape[1] !== 224) throw new Error(`talk-pack: ${name} has no ${m} prompt`);
      return { name, kind, lang, hz, credit: `${credit}; voice from ${by}, moods acted as measured from CREMA-D`, prompts: Object.fromEntries(MOODS.map(m => [m, prompt(heard[m])])) };
    }
    const k = [], v = []; let pos = 0;
    for (let l = 0; ; l++) {
      const c = file[`transformer.layers.${l}.self_attn/cache`]; if (!c) break;
      const L = c.shape[2], at = file[`transformer.layers.${l}.self_attn/offset`]?.[0] ?? L, n = L * c.shape[3] * c.shape[4];
      if (c.shape[3] * c.shape[4] !== 128 || c.shape[0] !== 2) throw new Error(`talk-pack: ${name} is not a 7M voice`);
      pos = Math.min(L, at);
      k.push(c.subarray(0, pos * 128)); v.push(c.subarray(n, n + pos * 128));
    }
    return { name, kind, lang, credit: `${credit}; voice state from ${by}`, hz, pos, k, v };
  });
  return pack({ tensors, pieces, scores, voices: cast, about: TALK_ABOUT, mimi: MIMI_BIG });
}

/**
 * The 100M model's decoder weights (mimi.*): from a folder, or downloaded at the pinned revision. Its file is 219 MB, so
 * a download fetches the header, then only the decoder's part of it.
 */
export async function decoderWeights(from = null) {
  const want = n => /^mimi\.(decoder|decoder_transformer|quantizer\.output_proj|upsample)\./.test(n);
  if (from) return safetensors(readFileSync(join(from, 'model.safetensors')));
  const url = urlOf(TALK_SOURCE.decoderDir, 'model.safetensors'), n = Number((await download(url, [0, 8])).readBigUInt64LE(0));
  const head = JSON.parse((await download(url, [8, 8 + n])).toString()), names = Object.keys(head).filter(want);
  const lo = Math.min(...names.map(k => head[k].data_offsets[0])), hi = Math.max(...names.map(k => head[k].data_offsets[1]));
  const part = await download(url, [8 + n + lo, 8 + n + hi]), json = Buffer.from(JSON.stringify(Object.fromEntries(names.map(k => [k, { ...head[k], data_offsets: head[k].data_offsets.map(o => o - lo) }]))));
  const small = Buffer.alloc(8 + json.length + part.length);   // a safetensors file of only those
  small.writeBigUInt64LE(BigInt(json.length), 0); json.copy(small, 8); part.copy(small, 8 + json.length);
  return safetensors(small);
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function made(dir, version, file, want, make, check) {
  const out = join(dir, version), dest = join(out, file);
  if (existsSync(dest) && sha256(readFileSync(dest)) === want) { console.log('have', file); return dest; }
  const bytes = await make(), hash = sha256(bytes);
  if (check && hash !== want) throw new Error(`talk-pack: ${file} came out as ${hash}, not ${want} (src/kit/talk-files.js). Changed on purpose? Bump its version and set the hash.`);
  mkdirSync(out, { recursive: true }); writeFileSync(dest, bytes);
  console.log('made', file, (bytes.length / 1e6).toFixed(1), 'MB', hash);
  return dest;
}
/** Writes <dir>/<TALK_VERSION>/<TALK_FILE> unless it is there already with the right hash. */
export const writeTo = (dir, from = null, { check = true, fromBig = null, fromBase = null } = {}) => made(dir, TALK_VERSION, TALK_FILE, TALK_SHA256, () => build(from, fromBig, fromBase), check);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = name => { const at = args.indexOf(name); return at >= 0 ? args.splice(at, 2)[1] : null; };
  const from = opt('--from'), fromBig = opt('--from-big'), fromBase = opt('--from-base'), check = !args.includes('--new');
  const dir = resolve(args.find(a => !a.startsWith('--')) || join(ROOT, 'ml-cache'));
  await writeTo(dir, from, { check, fromBig, fromBase });
}
