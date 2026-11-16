// Makes the desktop app's voice file (src/kit/talk-files.js) from Kyutai's own Pocket TTS 7M files:
//   node scripts/talk-pack.mjs [outDir]          (default ml-cache/: writes <outDir>/<TALK_VERSION>/<TALK_FILE>)
//   node scripts/talk-pack.mjs --from <dir>      reads model.safetensors, tokenizer.json and embeddings/ from a folder
//                                                instead of downloading them (Hugging Face, at the pinned revision)
// scripts/fetch-ml.mjs runs it too, so the games workflow uploads the file with the face tracking files. The file
// comes out the same every time; its SHA-256 must match TALK_SHA256 (the app checks it too), or this stops.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TALK_VERSION, TALK_FILE, TALK_SHA256, TALK_SOURCE, TALK_VOICES, TALK_ABOUT } from '../src/kit/talk-files.js';
import { pack } from '../src/kit/talk-pack.js';
import { makeTTS } from '../src/kit/pocket-tts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** { name: Float32Array with .shape } from a safetensors file (32-bit floats; whole numbers as plain numbers). */
export function safetensors(buf) {
  const b = Buffer.from(buf), n = Number(b.readBigUInt64LE(0)), head = JSON.parse(b.subarray(8, 8 + n).toString()), base = 8 + n, out = {};
  for (const [k, v] of Object.entries(head)) {
    if (k === '__metadata__') continue;
    const [a, z] = v.data_offsets, raw = b.buffer.slice(b.byteOffset + base + a, b.byteOffset + base + z);
    const t = v.dtype === 'F32' ? new Float32Array(raw) : v.dtype === 'I64' ? Float32Array.from(new BigInt64Array(raw), Number) : null;
    if (!t) throw new Error(`talk-pack: ${k} is ${v.dtype}`);
    t.shape = v.shape; out[k] = t;
  }
  return out;
}

/** Kyutai's files: from a folder, or downloaded at the pinned revision. */
async function source(from) {
  const read = async rel => {
    if (from) return readFileSync(join(from, rel));
    const url = `https://huggingface.co/${TALK_SOURCE.repo}/resolve/${TALK_SOURCE.revision}/${TALK_SOURCE.dir}/${rel}`;
    for (let i = 0; ; i++) {
      try { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
      catch (e) { if (i >= 3) throw e; await new Promise(res => setTimeout(res, 2000 * (i + 1))); }
    }
  };
  const weights = safetensors(await read('model.safetensors'));
  const tok = JSON.parse((await read('tokenizer.json')).toString());
  const voices = [];
  for (const v of TALK_VOICES) voices.push({ ...v, file: safetensors(await read(`embeddings/${v.name}.safetensors`)) });
  return { weights, tok, voices };
}

/** The file's bytes, from Kyutai's files. */
export async function build(from = null) {
  const { weights, tok, voices } = await source(from);
  // only what speaking needs: the engine says which weights it reads (the voice-cloning encoder stays out)
  const used = new Set(), pieces = tok.model.vocab.map(x => x[0]), scores = tok.model.vocab.map(x => x[1]);
  makeTTS({ get: n => { used.add(n); return weights[n]; }, pieces, scores, voices: {} }, { plain: true });
  const tensors = {};
  for (const n of [...used].sort()) { if (!weights[n]) throw new Error(`talk-pack: no ${n}`); tensors[n] = weights[n]; }
  if (tok.model?.type !== 'Unigram' || !tok.model.byte_fallback) throw new Error('talk-pack: the word pieces are not the kind the engine reads');
  const cast = voices.map(({ name, kind, hz, lang, credit, file }) => {
    const k = [], v = []; let pos = 0;
    for (let l = 0; ; l++) {
      const c = file[`transformer.layers.${l}.self_attn/cache`]; if (!c) break;
      const L = c.shape[2], at = file[`transformer.layers.${l}.self_attn/offset`]?.[0] ?? L, n = L * c.shape[3] * c.shape[4];
      if (c.shape[3] * c.shape[4] !== 128 || c.shape[0] !== 2) throw new Error(`talk-pack: ${name} is not a 7M voice`);
      pos = Math.min(L, at);
      k.push(c.subarray(0, pos * 128)); v.push(c.subarray(n, n + pos * 128));
    }
    return { name, kind, lang, credit: `${credit}; voice state from Kyutai TTS voices`, hz, pos, k, v };
  });
  return pack({ tensors, pieces, scores, voices: cast, about: TALK_ABOUT });
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Writes <dir>/<TALK_VERSION>/<TALK_FILE> unless it is there already with the right hash. */
export async function writeTo(dir, from = null, { check = true } = {}) {
  const out = join(dir, TALK_VERSION), dest = join(out, TALK_FILE);
  if (existsSync(dest) && sha256(readFileSync(dest)) === TALK_SHA256) { console.log('have', TALK_FILE); return dest; }
  const bytes = await build(from), hash = sha256(bytes);
  if (check && hash !== TALK_SHA256) throw new Error(`talk-pack: ${TALK_FILE} came out as ${hash}, not TALK_SHA256 ${TALK_SHA256} (src/kit/talk-files.js). Changed on purpose? Bump TALK_VERSION and set the hash.`);
  mkdirSync(out, { recursive: true }); writeFileSync(dest, bytes);
  console.log('made', TALK_FILE, (bytes.length / 1e6).toFixed(1), 'MB', hash);
  return dest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--from');
  const from = at >= 0 ? args.splice(at, 2)[1] : null, check = !args.includes('--new');
  const dir = resolve(args.find(a => !a.startsWith('--')) || join(ROOT, 'ml-cache'));
  await writeTo(dir, from, { check });
}
