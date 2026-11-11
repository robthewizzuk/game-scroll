// Gets the face, hand and body tracking, object spotting and sound recognition files (gs.vision, gs.hear; MediaPipe, Apache-2.0) ready to serve:
//   node scripts/fetch-ml.mjs [outDir]      (default: ml-cache/, which the dev server serves at /ml/)
// Writes <outDir>/<ML_VERSION>/: the MediaPipe wasm (from node_modules) and the models (from
// Google's model storage). The games workflow uploads them to assets.game-scroll.com/ml/ once, and
// the app downloads them from there the first time a face or hands game is played. The small
// loader script stays inside the app (the app may only run scripts that ship with it).
import { mkdirSync, copyFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ML_VERSION, ML_FILES } from '../src/kit/vision-files.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(resolve(process.argv[2] || join(ROOT, 'ml-cache')), ML_VERSION);
mkdirSync(out, { recursive: true });
for (const f of ML_FILES) {
  const dest = join(out, f.name);
  if (existsSync(dest) && statSync(dest).size > 1000) { console.log('have', f.name); continue; }
  if (f.from) { copyFileSync(join(ROOT, f.from), dest); console.log('copied', f.name); continue; }
  const r = await fetch(f.url); if (!r.ok) throw new Error(`${f.url}: ${r.status}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer())); console.log('downloaded', f.name);
}
