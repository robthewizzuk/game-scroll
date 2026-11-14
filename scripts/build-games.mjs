// Builds every game in src/games/ as its own small, stand-alone file that the app can download
// and run, so games can be added or fixed without shipping a new app.
//
// Each game is bundled with rolldown into CommonJS. Imports of the app's shared code (src/util.js,
// src/sfx.js, src/kit/*.js ...) are left out and become require('gs:<path>'), which the app
// answers with its own copy (src/remote.js). Sound, haptics and the wallet are shared state, so a
// downloaded game must use the app's instances, not its own.
//
// Output (CLI):  node scripts/build-games.mjs [outDir=dist-games]
//   <outDir>/manifest.json            catalogue: id, file, hash, the shared exports each game needs, and its metadata;
//                                     plus "app": what store/app-update.json says about the app itself (the oldest
//                                     Android version that may carry on: src/update.js updates older copies from Play)
//   <outDir>/games/<id>.<hash>.js     one file per game; the name changes whenever the code does
//
// vite.config.js calls buildGames() too, so the app knows the hash of the copy it ships with and
// only downloads a game when the published one differs.
import { rolldown } from 'rolldown';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GAME_MODULES, API_FEATURES, LOCATION_LEVELS, gsNeeds, hasAll, sensorsOf } from '../src/game-modules.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src'), GAMES = join(SRC, 'games');
const posix = p => p.split(sep).join('/');

// Shared app module? Anything under src/ that is not a game file.
function kitKey(abs) {
  if (!abs.startsWith(SRC + sep) || abs.startsWith(GAMES + sep)) return null;
  return posix(relative(SRC, abs));
}

async function buildOne(file) {
  const needs = {};
  const bundle = await rolldown({
    input: join(GAMES, file),
    logLevel: 'silent',
    plugins: [{
      name: 'gs-kit',
      resolveId(src, importer) {
        if (!importer || !src.startsWith('.')) return null;
        const key = kitKey(resolve(dirname(importer), src));
        if (key && !GAME_MODULES.includes(key)) throw new Error(`src/games/${file} imports src/${key}, which games may not use (allowed: ${GAME_MODULES.join(', ')})`);
        return key ? { id: 'gs:' + key, external: true } : null;
      },
    }],
  });
  const { output } = await bundle.generate({ format: 'cjs', exports: 'named', minify: true });
  await bundle.close();
  const chunk = output.find(o => o.type === 'chunk');
  // Which shared exports the game uses, read from its own import lines, so an older app can tell a
  // game that needs newer shared code and keep its bundled copy instead.
  const src = readFileSync(join(GAMES, file), 'utf8');
  for (const m of src.matchAll(/\bimport\s+([^'"]*?)\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const key = kitKey(resolve(GAMES, m[2]));
    if (!key) continue;
    if (!/^gs$/.test(m[1].trim())) throw new Error(`src/games/${file}: import gs from '../gamescroll.js' (got: import ${m[1].trim()} from '${m[2]}')`);
  }
  const used = gsNeeds(src);
  if (used.length) needs['gamescroll.js'] = used;
  const gs = await loadGs();
  const missing = used.filter(n => !hasAll(gs, [n]));
  if (missing.length) throw new Error(`src/games/${file} uses ${missing.map(n => 'gs.' + n).join(', ')}, which gamescroll.js doesn't have`);
  // Newer api features (api.save ...): older apps without them skip the game instead of crashing.
  const feats = API_FEATURES.filter(f => new RegExp(`\\bapi\\s*\\.\\s*${f}\\b`).test(src));
  if (feats.length) needs['@api'] = feats;
  // Location must be declared (location: 'coarse' | 'precise'), so the feed can say so before Play.
  if (feats.some(f => /location/i.test(f)) && !new RegExp(`\\blocation\\s*:\\s*['"](${LOCATION_LEVELS.join('|')})['"]`).test(src))
    throw new Error(`src/games/${file} uses api.location but doesn't declare it: add location: 'coarse' (or 'precise') to the game definition`);
  // An AR game must wait while the kit finds or lines up the floor (v.calibrating) and pass touches to
  // the kit first (v.input): without that the floor panels can't be tapped and the round runs behind them.
  if (/\bARView\b/.test(src) && !(/\.calibrating\b/.test(src) && /\.input\s*(\?\.)?\s*\(/.test(src)))
    throw new Error(`src/games/${file} is an AR game that doesn't wait for the floor step: skip update() while v.calibrating, and send down/move/up through v.input(...) first (docs/ar-3d.md, "Writing an AR game")`);
  return { code: chunk.code, needs, uses: sensorsOf(used) };
}

// Everything in a game definition except functions (make, etc.) is plain data the feed needs
// before the game's code is downloaded: title, hint, era, sizes, shop, trophies...
function metaOf(def) {
  return JSON.parse(JSON.stringify(def, (k, v) => typeof v === 'function' ? undefined : v));
}

let shimmed = false;
function shim() {
  if (shimmed) return;   // game modules only touch the browser inside make(), but kit modules may peek at window on import
  shimmed = true;
  globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {};
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
}
// gs itself, to check games only use parts of it that exist. A failure here is loud: every game needs it.
let gsP = null;
const loadGs = () => gsP ||= (shim(), import(pathToFileURL(join(SRC, 'gamescroll.js')).href).then(async m => { await m.loadParts(); return m.default; }));
async function readMeta(file) {
  shim();
  try { return metaOf((await import(pathToFileURL(join(GAMES, file)).href)).default || {}); }
  catch { return null; }
}

/** Build all games. withMeta reads each game's definition (slower, needs a node-friendly import). */
export async function buildGames({ withMeta = false } = {}) {
  const files = readdirSync(GAMES).filter(f => f.endsWith('.js')).sort();
  const games = [];
  for (const file of files) {
    const id = file.replace(/\.js$/, '');
    const { code, needs, uses } = await buildOne(file);
    const sha256 = createHash('sha256').update(code).digest('hex'), hash = sha256.slice(0, 12);
    // hash (short) names the file; sha256 (full) is what the app checks, via the signed catalogue.
    const g = { id, hash, sha256, file: `games/${id}.${hash}.js`, bytes: Buffer.byteLength(code), needs, code };
    if (withMeta) {
      const meta = await readMeta(file);
      if (!meta || !meta.id) continue;        // helper files that are not games
      if (meta.id !== id) throw new Error(`src/games/${file} has id '${meta.id}'; the file name must match the id`);
      if (meta.location !== undefined && !LOCATION_LEVELS.includes(meta.location)) throw new Error(`src/games/${file}: location must be one of ${LOCATION_LEVELS.join(', ')}`);
      if (uses.length) meta.uses = uses;   // sensors, worked out from the code (not declared by the game)
      g.meta = meta;
    }
    games.push(g);
  }
  return games;
}

/** store/app-update.json: { android: { min } }. min is a version code (Play Console lists them, and each
 *  Google Play workflow run's summary says its own); copies older than it get Play's full-screen update.
 *  Checked here so a typo can't publish a catalogue that stops every phone. */
export function appUpdate() {
  let j;
  try { j = JSON.parse(readFileSync(join(ROOT, 'store', 'app-update.json'), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw new Error('store/app-update.json: ' + e.message); }
  const min = j?.android?.min ?? 0;
  if (!Number.isInteger(min) || min < 0 || min > 2100000000) throw new Error(`store/app-update.json: android.min must be a whole version code (0 = none), not ${JSON.stringify(min)}`);
  return min ? { android: { min } } : {};
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.argv[2] || join(ROOT, 'dist-games'));
  rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'games'), { recursive: true });
  const games = await buildGames({ withMeta: true });
  for (const g of games) writeFileSync(join(out, g.file), g.code);
  const manifest = { v: 1, built: Date.now(), app: appUpdate(), games: games.map(({ code, ...g }) => g) };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
  const kb = games.reduce((a, g) => a + g.bytes, 0) / 1024;
  console.log(`${games.length} games, ${kb.toFixed(0)} KB total, largest ${Math.max(...games.map(g => g.bytes)) / 1024 | 0} KB -> ${posix(relative(ROOT, out))}`);
}
