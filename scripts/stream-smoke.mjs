// Plays every game (or the ids given) the way the store apps run them: streamed from a games host and
// run by src/remote.js (strict mode, with the names in SHADOWED hidden), not built into the app as in
// scripts/smoke.cjs. Fails if any game won't load or throws.  Usage: node scripts/stream-smoke.mjs [id ...] [--jobs n]
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const { jobs, pool } = require('./lib/pool.cjs');
const argv = process.argv.slice(2), n = jobs(argv);
const ROOT = resolve(import.meta.dirname, '..'), tmp = mkdtempSync(join(tmpdir(), 'gs-stream-'));
const GAMES = join(tmp, 'games-host'), APP = join(tmp, 'app');

const inside = (root, url) => {
  const f = resolve(root, '.' + decodeURIComponent(url.split('?')[0]));
  return f.startsWith(root + sep) && existsSync(f) && statSync(f).isFile() ? f : null;
};
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', wasm: 'application/wasm' };
const serve = (root, port, cors) => createServer((req, res) => {
  const f = inside(root, req.url === '/' ? '/index.html' : req.url);
  res.writeHead(f ? 200 : 404, { ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}), 'Content-Type': (f && TYPES[f.split('.').pop()]) || 'application/octet-stream' });
  res.end(f ? readFileSync(f) : '');
}).listen(port, '127.0.0.1');
// on ports the system picks (free ones), so two runs side by side, in other worktrees too, don't load each
// other's games: the app is built knowing where its games host is
const host = serve(GAMES, 0, true), app = serve(APP, 0, false);
await Promise.all([host, app].map(s => new Promise(r => s.listening ? r() : s.once('listening', r))));
const HOST = 'http://127.0.0.1:' + host.address().port, APP_URL = 'http://127.0.0.1:' + app.address().port + '/';
execFileSync('node', ['scripts/build-games.mjs', GAMES], { cwd: ROOT, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--outDir', APP, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_GAMES_URL: HOST, VITE_CATALOGUE_KEY: '', VITE_HEARTS_URL: '' } });

// one browser per worker (each with its own GPU process)
const open = async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })).newPage();
  const w = { b, p, errs: [] };
  p.on('pageerror', e => w.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) w.errs.push(m.text()); if (m.type() === 'warning' && /^\[games\]/.test(m.text())) w.errs.push(m.text()); });
  await p.goto(APP_URL); await p.waitForFunction(() => window.__gs && __gs.GAMES.length, null, { timeout: 60000 });
  return w;
};
let spare = await open();
const ids = argv.length ? argv : await spare.p.evaluate(() => __gs.GAMES.map(g => g.id));
let failed = 0;
const LOAD_MS = 90000;
await pool(ids, n, async () => { const w = spare || await open(); spare = null; return w; }, async (w, id) => {
  const { p } = w; w.errs = []; const errs = w.errs;
  try {
  const loaded = await p.evaluate(id => __gs.remote.load(id).then(d => !!d), id);
  if (!loaded) { failed++; console.log(`FAIL ${id.padEnd(14)} didn't load\n   ${errs.join('\n   ')}`); return; }
  await p.evaluate(id => __gs.only(id), id);
  // (a game that builds a lot the first time it loads, such as sculpted people, takes a few seconds alone and
  // far longer when several browsers share a test machine's few cores: it gets the time the other tests give)
  await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: LOAD_MS }).catch(() => errs.push(`still loading after ${LOAD_MS / 1000} s`));
  const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    if (await p.evaluate(() => __gs.active.state) !== 'playing') await p.evaluate(() => __gs.start());
    await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h); await p.mouse.down();
    await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 3 });
    await p.waitForTimeout(Math.random() * 120); await p.mouse.up();
  }
  } catch (e) { errs.push(String(e.message).split('\n')[0]); }
  if (errs.length) failed++;
  console.log(`${errs.length ? 'FAIL' : 'PASS'} ${id}${errs.length ? '\n   ' + errs.join('\n   ') : ''}`);
}, w => w.b.close());
host.close(); app.close();
console.log(`${ids.length - failed}/${ids.length} games ran streamed`);
process.exit(failed ? 1 : 0);
