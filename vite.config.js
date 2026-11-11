import { defineConfig, loadEnv } from 'vite';
import { readdirSync, readFileSync, existsSync, createReadStream, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { gsNeeds, sensorsOf } from './src/game-modules.js';

// virtual:bundled-games = the game modules built into the app.
// The real app streams every game from the game host (VITE_GAMES_URL in .env), so this is empty.
// Local dev and the test scripts run with --mode bundled (.env.bundled leaves VITE_GAMES_URL empty),
// and then every file in src/games/ is built in, so new games can be tried before they're published.
// It also exports `fresh`: for each game id, a function that loads the game's file again as a new
// module (its top-level memory starts empty), which is how the app loads a big 3D game without
// holding the feed still (src/main.js bootGame; the streamed app runs the downloaded file again). Each
// game sits behind a small module of its own that knows its address: in a build that is the game's
// chunk, on the dev server the game's file.
export function bundledGames(streamed) {
  const ID = 'virtual:bundled-games', RID = '\0' + ID, ONE = ID + '/', RONE = '\0' + ONE, dir = resolve('src/games');
  let serve = false;
  return {
    name: 'bundled-games',
    configResolved(c) { serve = c.command === 'serve'; },
    resolveId: id => id === ID ? RID : id.startsWith(ONE) ? '\0' + id : null,
    load(id) {
      if (id.startsWith(RONE)) {
        const f = id.slice(RONE.length);
        return `import d from ${JSON.stringify(resolve(dir, f))};\nexport default d;\nexport const url = ${serve ? `new URL(${JSON.stringify('/src/games/' + f)}, location.href).href` : 'import.meta.url'};`;
      }
      if (id !== RID) return null;
      if (streamed) return 'export default [];\nexport const fresh = {};';
      const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
      // gs's 3D and AI parts load on demand, so load them all before the games run (dev and tests only)
      // and add the sensors each one uses (worked out from its code, as the streamed build does)
      const uses = files.map(f => sensorsOf(gsNeeds(readFileSync(resolve(dir, f), 'utf8'))));
      return `import { loadParts } from ${JSON.stringify(resolve('src/gamescroll.js'))};\nawait loadParts();\n` +
        `const mods = await Promise.all([${files.map(f => `import(${JSON.stringify(ONE + f)})`).join(',')}]);\n` +
        `const uses = ${JSON.stringify(uses)};\n` +
        'export default mods.map((m, i) => { const d = m.default; if (d && uses[i].length && !d.uses) { try { d.uses = uses[i]; } catch (_) {} } return d; });\n' +
        'export const fresh = {};\n' +
        'for (const m of mods) if (m.default && m.default.id) fresh[m.default.id] = n => import(/* @vite-ignore */ m.url + (m.url.includes("?") ? "&" : "?") + "copy=" + n).then(x => x.default);';
    },
  };
}

// EZ-Tree (gs.models.tree) from its source, with its bark and leaf picture files swapped for ours drawn
// in code (src/kit/models/tree-textures.js): the app ships no image files, and its built copy carries
// 4 MB of them. 'ez-tree/lib' is its src/lib (the package only exports the built copy).
export function ezTreeInCode() {
  const lib = resolve('node_modules/@dgreenheck/ez-tree/src/lib');
  return {
    name: 'ez-tree-in-code', enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'ez-tree/lib') return resolve(lib, 'index.js');
      if (importer && importer.replace(/\\/g, '/').includes('@dgreenheck/ez-tree/src/lib') && /(^|\/)textures(\.js)?$/.test(id)) return resolve('src/kit/models/tree-textures.js');
      return null;
    },
  };
}

// The physics engine (Rapier) as real .wasm files. Its "-compat" packages carry the engine as text inside
// the JavaScript (base64: a third bigger than the engine itself, all of it read and turned back into
// bytes on the main thread before anything can start). The same packages also ship the engine as a
// .wasm file, byte for byte the same; here the built app is pointed at that file instead, so each of
// the four copies (2D and 3D, with and without SIMD) is a third smaller and the phone compiles it as it
// streams in, off the main thread. Build only: the dev server and the Node tests keep the packaged form.
export function rapierWasmFiles() {
  const PACK = /@dimforge[\\/]rapier(2d|3d)(?:-simd)?-compat[\\/]dist[\\/]rapier\.mjs$/, OPEN = '.toByteArray("AGFzbQ', CLOSE = '").buffer';
  return {
    name: 'rapier-wasm-files', apply: 'build', enforce: 'pre',
    transform(code, id) {
      const m = PACK.exec(id.split('?')[0]); if (!m) return null;
      const at = code.indexOf(OPEN), end = at < 0 ? -1 : code.indexOf(CLOSE, at);
      let from = at; while (from > 0 && /[\w$]/.test(code[from - 1])) from--;   // (the decoder's name, whatever the minifier called it)
      const file = resolve(id.split('?')[0], '..', `rapier_wasm${m[1]}_bg.wasm`);
      // only when the file really is the text's bytes (a package that changes shape keeps working as it was)
      const same = end > 0 && existsSync(file) && Buffer.from(code.slice(at + OPEN.length - 6, end), 'base64').equals(readFileSync(file));
      if (!same) { this.warn(`rapier-wasm-files: ${id} left as it is (no matching .wasm file)`); return null; }
      return { code: code.slice(0, from) + `new URL("./rapier_wasm${m[1]}_bg.wasm", import.meta.url)` + code.slice(end + CLOSE.length), map: null };
    },
  };
}

// Hot reload for game makers (npm run dev): saving a file in src/games/ swaps that game in place, on
// the same card, instead of reloading the whole app (src/main.js hotSwap). Kit and app files still
// reload the page as usual.
function hotGames() {
  const GAME = /[\\/]src[\\/]games[\\/]([a-z0-9-]+)\.js$/;
  return {
    name: 'hot-games',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      const m = GAME.exec(file);
      if (!m) return;
      server.ws.send({ type: 'custom', event: 'gs:game', data: { id: m[1], url: `/src/games/${m[1]}.js` } });
      return [];
    },
  };
}

// Build label for crash and stutter reports (src/perf.js): CI run number (the Android
// versionName is 1.0.<run>) plus the commit, e.g. "1.0.57 a1b2c3d".
function buildLabel() {
  let sha = '';
  try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) {}
  const run = process.env.GITHUB_RUN_NUMBER;
  return [run ? '1.0.' + run : 'local', sha].filter(Boolean).join(' ');
}

// Content Security Policy for the built app: the app, and every game running inside it, can only talk
// to the games host and our API. A game can't send anything to another server, load scripts from
// elsewhere or open frames. 'unsafe-eval' is needed because streamed games run via new Function
// (src/remote.js). Build only: the dev server needs its own websocket for live reload.
function csp(env) {
  const origin = u => { try { return new URL(u).origin; } catch (_) { return ''; } };
  const hosts = [env.VITE_GAMES_URL, env.VITE_HEARTS_URL].map(origin).filter(Boolean);
  // 'self' is the app itself: capacitor://localhost on iOS, https://localhost on Android.
  const self = "'self' capacitor://localhost";
  const policy = [
    `default-src ${self}`,
    `script-src ${self} 'unsafe-eval'`,
    `style-src ${self} 'unsafe-inline'`,
    `img-src ${self} data: blob:`,
    `font-src ${self} data:`,
    `media-src ${self} data: blob: mediastream:`,
    `connect-src ${[self, ...hosts].join(' ')}`,
    `worker-src ${self} blob:`,
    "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

// Face and hand tracking and sound files (gs.vision, gs.hear). The real app downloads them from the
// games host; dev and test builds without one serve ml-cache/ (filled by npm run ml) and ml-models/
// (the AI chip's models, kept in the repo) at ml/.
function mlFiles(streamed) {
  const dirs = [resolve('ml-cache'), resolve('ml-models')];
  return {
    name: 'ml-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/ml\/([\w.-]+)\/([\w.-]+)$/.exec((req.url || '').split('?')[0]);
        const f = m && dirs.map(d => resolve(d, m[1], m[2])).find(existsSync);
        if (!f) return next();
        res.setHeader('Content-Type', f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        createReadStream(f).pipe(res);
      });
    },
    closeBundle() { if (!streamed) for (const d of dirs) if (existsSync(d)) cpSync(d, resolve('dist/ml'), { recursive: true }); },
  };
}

// Relative base so the build works inside the Capacitor webview and on any static host.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    define: { __APP_BUILD__: JSON.stringify(buildLabel()) },
    plugins: [ezTreeInCode(), rapierWasmFiles(), bundledGames(!!env.VITE_GAMES_URL), hotGames(), mlFiles(!!env.VITE_GAMES_URL), csp(env)],
  };
});
