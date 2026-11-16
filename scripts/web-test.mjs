// The web version (npm run build:web, src/web.js, published to GitHub Pages) the way a visitor's browser
// opens it: games streamed from a games host, the app under a sub-path like GitHub Pages. Checks that
//   - Next Gen and AR games are never in the feed and their files never downloaded; the feed menu still
//     lists them, and picking one, or opening a link to one of the games, says to get the app, with links;
//   - a board game plays in 3D, with no AR note on its card and no AR chip in its round;
//   - a Phone game plays as usual, and Settings has no AR test.
//   node scripts/web-test.mjs [--keep]      (about a minute; builds what it needs)
//   --app builds the ordinary app instead, to see the checks fail where the web version differs.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const argv = process.argv.slice(2), KEEP = argv.includes('--keep'), APP_BUILD = argv.includes('--app');
const ROOT = resolve(import.meta.dirname, '..'), tmp = mkdtempSync(join(tmpdir(), 'gs-web-'));
const GAMES = join(tmp, 'games-host'), APP = join(tmp, 'app');
const HOST = 'http://127.0.0.1:4198', SITE = 'http://127.0.0.1:4197/game-scroll/';
const NEXTGEN = 'frost-line', BOARD = 'tower-four', PHONE = 'ant-trail';
execFileSync('node', ['scripts/build-games.mjs', GAMES], { cwd: ROOT, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--outDir', APP, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_WEB: APP_BUILD ? '' : '1', VITE_GAMES_URL: HOST, VITE_CATALOGUE_KEY: '', VITE_HEARTS_URL: '' } });

const inside = (root, url) => {
  const f = resolve(root, '.' + decodeURIComponent(url.split('?')[0]));
  return f.startsWith(root + sep) && existsSync(f) && statSync(f).isFile() ? f : null;
};
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', wasm: 'application/wasm' };
const fetched = [];   // game files the page asked the games host for
const serve = (root, port, cors, under = '/') => createServer((req, res) => {
  const url = req.url.startsWith(under) ? '/' + req.url.slice(under.length) : null;
  if (cors && url && url.startsWith('/games/')) fetched.push(url.slice(7).split('.')[0]);
  const f = url && inside(root, url.split('?')[0] === '/' ? '/index.html' : url);
  res.writeHead(f ? 200 : 404, { ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}), 'Content-Type': (f && TYPES[f.split('.').pop()]) || 'application/octet-stream' });
  res.end(f ? readFileSync(f) : '');
}).listen(port, '127.0.0.1');
const host = serve(GAMES, 4198, true), app = serve(APP, 4197, false, '/game-scroll/');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function visit(id) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 });
  // every text drawn on a 2D canvas (the board kit's AR chip is drawn there)
  await ctx.addInitScript(() => {
    const said = window.__drawn = new Set(), f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { said.add(String(t)); return f.call(this, t, ...a); };
  });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  fetched.length = 0;
  await p.goto(SITE + (id ? '?g=' + id : ''));
  await p.waitForFunction(() => window.__gs && __gs.active, null, { timeout: 60000 });
  return { ctx, p, errs };
}
const card = p => p.evaluate(() => {
  const s = __gs.active, o = s.el.querySelector('.overlay');
  return { id: s.def.id, state: s.state, loading: !!s.loading, text: o.textContent };
});
const APP_ONLY = new Set(JSON.parse(readFileSync(join(GAMES, 'manifest.json'), 'utf8')).games.filter(g => ['nextgen', 'ar'].includes(g.meta.era)).map(g => g.id));
const feedIds = p => p.evaluate(() => [...document.querySelectorAll('#feed .slide')].map(e => e._s?.def.id));
// the "get the app" box: open, with download links to the apps
async function getApp(p, bad, what) {
  const r = await p.evaluate(() => { const d = document.querySelector('dialog.get-dlg'); return d && d.open ? { text: d.textContent, links: [...d.querySelectorAll('a')].map(a => a.href) } : null; });
  if (!r) { bad.push(`${what}: no "get the app" box`); return; }
  if (!/Get the app/.test(r.text)) bad.push(`${what}: the box doesn't say to get the app ("${r.text.slice(0, 100)}")`);
  if (r.links.length < 4 || !r.links.every(l => l.startsWith('https://github.com/robthewizzuk/game-scroll/'))) bad.push(`${what}: download links ${r.links.join(', ') || 'none'}`);
  if (!r.links[0]?.includes('android-latest')) bad.push(`${what}: an Android phone is not offered the Android app first`);
  await p.evaluate(() => document.querySelector('dialog.get-dlg')?.close());
}

const tests = {
  async 'Next Gen and AR games are never in the feed, and never downloaded'() {
    const v = await visit(''), bad = [], seen = new Set();
    for (let i = 0; i < 25; i++) {
      for (const id of await feedIds(v.p)) seen.add(id);
      await v.p.evaluate(() => __gs.active.el.querySelector('.nextbtn').click());
      await sleep(700);
    }
    for (const id of await feedIds(v.p)) seen.add(id);
    const shown = [...seen].filter(id => APP_ONLY.has(id)), got = [...new Set(fetched)].filter(id => APP_ONLY.has(id));
    if (seen.size < 8) bad.push(`only ${seen.size} games came by in the feed`);
    if (shown.length) bad.push('in the feed: ' + shown.join(', '));
    if (got.length) bad.push('downloaded: ' + got.join(', '));
    bad.push(...v.errs.map(e => 'page error: ' + e));
    await v.ctx.close(); return bad;
  },
  async 'the feed menu lists Next Gen and AR, and picking one says to get the app'() {
    const v = await visit(''), bad = [];
    for (const f of ['nextgen', 'ar']) {
      await v.p.click('#feed-btn');
      const note = await v.p.locator(`#feed-menu [data-f=${f}] small`).textContent();
      if (!/the app/i.test(note)) bad.push(`the ${f} choice doesn't say it is in the app ("${note}")`);
      await v.p.click(`#feed-menu [data-f=${f}]`);
      await sleep(300);
      await getApp(v.p, bad, f);
      const label = await v.p.locator('#feed-label').textContent();
      if (label !== 'For you') bad.push(`picking ${f} changed the feed to "${label}"`);
    }
    const shown = (await feedIds(v.p)).filter(id => APP_ONLY.has(id));
    if (shown.length) bad.push('in the feed: ' + shown.join(', '));
    bad.push(...v.errs.map(e => 'page error: ' + e));
    await v.ctx.close(); return bad;
  },
  async 'a link to a Next Gen game says to get the app, and the feed carries on'() {
    const v = await visit(NEXTGEN), bad = [];
    await sleep(1500);
    await getApp(v.p, bad, 'a link to ' + NEXTGEN);
    const ids = await feedIds(v.p);
    if (!ids.length) bad.push('the feed is empty');
    if (ids.some(id => APP_ONLY.has(id))) bad.push('in the feed: ' + ids.filter(id => APP_ONLY.has(id)).join(', '));
    if (fetched.includes(NEXTGEN)) bad.push('its game file was downloaded');
    bad.push(...v.errs.map(e => 'page error: ' + e));
    await v.ctx.close(); return bad;
  },
  async 'a board game plays in 3D with no AR'() {
    const v = await visit(BOARD), bad = [];
    await v.p.waitForFunction(id => __gs.active.def.id === id, BOARD, { timeout: 30000 }).catch(() => bad.push('the shared board game is not the card on screen'));
    const c = await card(v.p);
    if (/\bAR\b|own room/.test(c.text)) bad.push(`its card mentions AR ("${c.text.slice(0, 160)}")`);
    const made = await v.p.waitForFunction(() => !__gs.active.loading, null, { timeout: 120000 }).then(() => true, () => { bad.push('still loading after two minutes'); return false; });
    if (made) {
      // Play, as a player taps it: a board card makes its game only then, under the loading screen
      await v.p.evaluate(() => __gs.active.el.querySelector('.overlay button.play').click());
      await v.p.waitForFunction(() => __gs.active.state === 'playing', null, { timeout: 180000 }).catch(() => bad.push('Play did not start it'));
      await sleep(4000);
      const drawn = await v.p.evaluate(() => [...window.__drawn]);
      if (drawn.includes('AR')) bad.push('the AR chip is drawn in its round');
    }
    bad.push(...v.errs.map(e => 'page error: ' + e));
    await v.ctx.close(); return bad;
  },
  async 'a Phone game plays, and Settings has no AR test'() {
    const v = await visit(PHONE), bad = [];
    await v.p.waitForFunction(id => __gs.active.def.id === id, PHONE, { timeout: 30000 });
    await v.p.waitForFunction(() => !__gs.active.loading, null, { timeout: 30000 });
    await v.p.locator('#feed .slide').first().locator('.overlay button.play').click({ force: true });
    await v.p.waitForFunction(() => __gs.active.state === 'playing', null, { timeout: 20000 }).catch(() => bad.push('Play did not start it'));
    await v.p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /settings/i.test(b.getAttribute('aria-label') || '')); b?.click(); });
    await sleep(500);
    const settings = await v.p.evaluate(() => document.body.textContent);
    if (!/Frame rate/.test(settings)) bad.push('Settings did not open');
    else if (/AR test/.test(settings)) bad.push('Settings has the AR test');
    bad.push(...v.errs.map(e => 'page error: ' + e));
    await v.ctx.close(); return bad;
  },
};

let failed = 0;
for (const [name, t] of Object.entries(tests)) {
  let bad;
  try { bad = await t(); } catch (e) { bad = [String(e.message || e).split('\n')[0]]; }
  console.log(`${bad.length ? '✗' : '✓'} ${name}${bad.length ? '\n    ' + bad.join('\n    ') : ''}`);
  if (bad.length) failed++;
}
await browser.close(); host.close(); app.close();
if (!KEEP) rmSync(tmp, { recursive: true, force: true }); else console.log('kept', tmp);
console.log(failed ? `web version: ${failed} check(s) failed` : 'web version: all checks passed');
process.exit(failed ? 1 : 0);
