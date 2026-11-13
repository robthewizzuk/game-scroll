// Opens the web app from a shared game link (?g=<id>, what "Play in your browser" on a
// play.game-scroll.com page opens) the way a visitor's browser does: games streamed from a games
// host, over a slow or quick connection, on a first visit or with an old catalogue saved from an
// earlier one. The shared game must be the first card, be the one being played when Play is tapped,
// and a link to a game that has been taken down must still land in the feed.
//   node scripts/share-link.mjs [id] [--cpu 6] [--only=text] [--keep]      (about 40 s; no build needed first)
//   --cpu n slows the browser n times, like a busy test machine: the checks must not depend on speed.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const argv = process.argv.slice(2), CPU = argv.includes('--cpu') ? +argv.splice(argv.indexOf('--cpu'), 2)[1] || 1 : 1;
const ID = argv.find(a => !a.startsWith('--')) || 'ant-trail';
const ROOT = resolve(import.meta.dirname, '..'), tmp = mkdtempSync(join(tmpdir(), 'gs-share-'));
const GAMES = join(tmp, 'games-host'), APP = join(tmp, 'app');
const HOST = 'http://127.0.0.1:4196', SITE = 'http://127.0.0.1:4195/game-scroll/';   // a sub-path, like GitHub Pages
execFileSync('node', ['scripts/build-games.mjs', GAMES], { cwd: ROOT, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--outDir', APP, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_GAMES_URL: HOST, VITE_CATALOGUE_KEY: '', VITE_HEARTS_URL: '' } });

const inside = (root, url) => {
  const f = resolve(root, '.' + decodeURIComponent(url.split('?')[0]));
  return f.startsWith(root + sep) && existsSync(f) && statSync(f).isFile() ? f : null;
};
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', wasm: 'application/wasm' };
const serve = (root, port, cors, under = '/') => createServer((req, res) => {
  const url = req.url.startsWith(under) ? '/' + req.url.slice(under.length) : null;
  const f = url && inside(root, url.split('?')[0] === '/' ? '/index.html' : url);
  res.writeHead(f ? 200 : 404, { ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}), 'Content-Type': (f && TYPES[f.split('.').pop()]) || 'application/octet-stream' });
  res.end(f ? readFileSync(f) : '');
}).listen(port, '127.0.0.1');
const host = serve(GAMES, 4196, true), app = serve(APP, 4195, false, '/game-scroll/');

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// One visitor: their own browser storage, and their own connection to the games host.
//   net.catalogue / net.game / net.shared: ms before the catalogue, a game file, the shared game's file arrives
//   net.hold: the shared game's file doesn't arrive until v.release() (so a check never races the clock)
//   net.without: an id the catalogue doesn't list (and is older);  net.broken: the shared game's file is a 404
//   v.others: how many other games' files have been sent
async function visitor() {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const v = { ctx, net: {}, errs: [], others: 0 };
  const held = new Promise(r => { v.release = r; });
  await ctx.route(HOST + '/**', async route => {
    const path = new URL(route.request().url()).pathname, n = v.net;
    const mine = path.startsWith(`/games/${ID}.`);
    try {
      if (path === '/manifest.json') {
        await sleep(n.catalogue || 0);
        if (!n.without) return await route.continue();
        const r = await route.fetch(), m = await r.json();
        m.games = m.games.filter(g => g.id !== n.without); m.built = (+m.built || 0) - 60000;
        return await route.fulfill({ response: r, json: m });
      }
      await sleep(mine && n.shared != null ? n.shared : n.game || 0);
      if (mine && n.hold) await held;
      if (mine && n.broken) return await route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
      await route.continue();
      if (!mine) v.others++;
    } catch (_) { /* the page closed while a file was on its way */ }
  });
  // every note the page shows, as it shows it: a note fades after 3.5 s, and a busy test machine can be
  // slower than that between the note and the look at it
  await ctx.addInitScript(() => {
    const said = window.__toasts = [];
    new MutationObserver(() => {
      const t = document.querySelector('.qa-toast.on')?.textContent;
      if (t && t !== said.at(-1)) said.push(t);
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  });
  v.p = await ctx.newPage();
  v.p.on('pageerror', e => v.errs.push(e.message));
  if (CPU > 1) await (await ctx.newCDPSession(v.p)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
  return v;
}
const feedUp = p => p.waitForFunction(() => window.__gs && __gs.active && !document.querySelector('#feed .feed-msg'), null, { timeout: 60000 });
const until = async (ok, ms) => { const t = Date.now(); while (!ok() && Date.now() - t < ms) await sleep(50); };
const cardCount = p => p.evaluate(() => document.querySelectorAll('#feed .slide').length);
const playing = (p, id) => p.waitForFunction(id => __gs.active && __gs.active.state === 'playing' && (!id || __gs.active.def.id === id), id || '', { timeout: 20000 });
// A card whose game is still being made says "Loading…" and takes no notice of Play (a 3D game is made a
// little each frame), and which game a feed puts first is drawn at random: wait for it before tapping Play.
const made = async p => {
  try { await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 }); }
  catch (_) { throw new Error(`${(await look(p)).active} was still loading after a minute`); }
};
const look = p => p.evaluate(() => {
  const feed = document.getElementById('feed'), cards = [...feed.querySelectorAll('.slide')], top = feed.getBoundingClientRect().top;
  const shown = cards.find(c => Math.abs(c.getBoundingClientRect().top - top) < 40), toast = document.querySelector('.qa-toast.on');
  return { active: __gs.active ? __gs.active.def.id : null, title: __gs.active ? __gs.active.def.title : null, state: __gs.active ? __gs.active.state : null,
    shown: shown ? shown.getAttribute('aria-label') : null, at: cards.indexOf(shown), first: cards[0] ? cards[0].getAttribute('aria-label') : null,
    cards: cards.map(c => c.getAttribute('aria-label')), toast: toast ? toast.textContent : '', toasts: (window.__toasts || []).join(' | '), query: location.search };
});
const TITLE = JSON.parse(readFileSync(join(GAMES, 'manifest.json'), 'utf8')).games.find(g => g.id === ID)?.meta?.title;
if (!TITLE) { console.error(`No game "${ID}" in src/games/`); process.exit(1); }

// The shared game is the first card (or, in a feed already in use, the card on screen), the current
// one, not there a second time further down, and Play starts it.
// (force: the Play button pulses, so the test browser would wait for ever for it to hold still)
async function landed(v, { first = true } = {}) {
  const r = await look(v.p), bad = [];
  if (r.active !== ID) bad.push(`the current game is ${r.active}, not ${ID}`);
  if (r.shown !== TITLE) bad.push(`"${r.shown}" is on screen, not "${TITLE}"`);
  if (first && r.first !== TITLE) bad.push(`the first card is "${r.first}"`);
  const copies = r.cards.slice(Math.max(0, r.at)).filter(t => t === TITLE).length;
  if (!bad.length && copies !== 1) bad.push(`"${TITLE}" is in the feed ${copies} times from the card on screen down`);
  if (r.query.includes('g=')) bad.push('?g= is still in the address (a reload would jump back)');
  if (!bad.length) await made(v.p).catch(e => bad.push(e.message));
  if (!bad.length) {
    await v.p.locator('#feed .slide').nth(r.at).locator('.overlay button.play').click({ force: true, timeout: 10000 }).catch(e => bad.push('no Play button to tap: ' + String(e.message).split('\n')[0]));
    await playing(v.p, ID).catch(() => bad.push('Play did not start the shared game'));
  }
  return bad;
}

const tests = {
  async 'first visit: the shared game arrives before the others'(v) {
    v.net = { game: 400, shared: 20 };
    await v.p.goto(SITE + '?g=' + ID); await feedUp(v.p);
    return landed(v);
  },
  async 'first visit: the shared game arrives after the others'(v) {
    v.net = { game: 40, hold: true };
    await v.p.goto(SITE + '?g=' + ID);
    await until(() => v.others >= 5, 20000); await sleep(600 * CPU);   // the others are in: the feed waits rather than showing one of them first
    const early = await cardCount(v.p);
    v.release(); await feedUp(v.p);
    return [...(v.others < 5 ? ['the other games never downloaded'] : []), ...(early ? [`${early} other cards showed before the shared game arrived`] : []), ...await landed(v)];
  },
  async 'return visit: everything already on the phone (a page that loads at once)'(v) {
    await v.p.goto(SITE); await feedUp(v.p); await sleep(800);
    await v.p.goto(SITE + '?g=' + ID); await feedUp(v.p); await sleep(700);
    return landed(v);
  },
  async 'return visit: the saved catalogue is older than the game, and the fresh one is slow'(v) {
    v.net = { without: ID };
    await v.p.goto(SITE); await feedUp(v.p); await sleep(500);
    v.net = { catalogue: 1500, game: 60 };
    await v.p.goto(SITE + '?g=' + ID); await feedUp(v.p);
    return landed(v);
  },
  async 'a resize after it opens (fold, rotate, address bar) keeps the shared game'(v) {
    v.net = { game: 100 };
    await v.p.goto(SITE + '?g=' + ID); await feedUp(v.p);
    await v.p.setViewportSize({ width: 700, height: 800 }); await sleep(900);
    return landed(v);
  },
  async 'a link to a game that has been taken down opens the feed and says so'(v) {
    v.net = { without: ID, game: 60 };
    await v.p.goto(SITE + '?g=' + ID);
    await v.p.waitForFunction(() => window.__toasts?.length, null, { timeout: 15000 }).catch(() => {});
    const said = (await look(v.p)).toasts;   // (every note shown: it fades after a few seconds)
    await feedUp(v.p);
    const r = await look(v.p), bad = [];
    if (!r.active || !r.cards.length) bad.push('the feed is empty');
    if (r.cards.includes(TITLE)) bad.push('the game that was taken down is in the feed');
    if (!/isn’t in Game Scroll any more/.test(said)) bad.push(`no note that the game has gone (the note says "${said}")`);
    if (r.query.includes('g=')) bad.push('?g= is still in the address');
    return bad;
  },
  async 'a shared game that will not download opens the feed and says so'(v) {
    v.net = { broken: true, game: 60 };
    await v.p.goto(SITE + '?g=' + ID);
    await v.p.waitForFunction(() => window.__toasts?.length, null, { timeout: 15000 }).catch(() => {});
    const said = (await look(v.p)).toasts;
    await feedUp(v.p);
    const r = await look(v.p), bad = [];
    if (!r.active || !r.cards.length) bad.push('the feed is empty');
    if (!/Couldn’t load/.test(said)) bad.push(`no note that it could not load (the note says "${said}")`);
    return bad;
  },
  async 'a very slow shared game stops holding the feed up, then takes first place'(v) {
    v.net = { game: 40, hold: true };
    await v.p.goto(SITE + '?g=' + ID);
    await v.p.waitForFunction(() => window.__gs && document.querySelector('#feed .feed-msg'), null, { timeout: 30000 });
    await sleep(7000);
    const bad = [];
    if (await cardCount(v.p)) bad.push('the feed did not wait for the shared game');
    await feedUp(v.p);   // 10 s in: the usual games
    if ((await look(v.p)).active === ID) bad.push('the shared game was there before its file arrived');
    v.release();
    await v.p.waitForFunction(id => __gs.active && __gs.active.def.id === id, ID, { timeout: 20000 }).catch(() => {});
    return [...bad, ...await landed(v)];
  },
  async 'a very slow shared game does not interrupt a round already being played'(v) {
    v.net = { game: 40, hold: true };
    await v.p.goto(SITE + '?g=' + ID);
    await feedUp(v.p);   // 10 s in: the usual games
    await made(v.p);
    await v.p.locator('#feed .slide').first().locator('.overlay button.play').click({ force: true });
    await playing(v.p);
    const round = (await look(v.p)).active;
    v.release();
    await v.p.waitForFunction(() => document.querySelector('.qa-toast.on'), null, { timeout: 20000 }).catch(() => {});
    const r = await look(v.p), bad = [];
    if (r.active !== round || r.state !== 'playing' && r.state !== 'over') bad.push(`the round of ${round} was interrupted (now ${r.active}, ${r.state})`);
    if (r.cards[1] !== TITLE) bad.push(`the shared game is not the next card (the cards are ${r.cards.slice(0, 3).join(', ')})`);
    if (r.cards.filter(t => t === TITLE).length !== 1) bad.push(`"${TITLE}" is in the feed ${r.cards.filter(t => t === TITLE).length} times`);
    if (!/is ready/.test(r.toast)) bad.push(`no note that the shared game is next (the note says "${r.toast}")`);
    return bad;
  },
  async 'a link opened while the app is in use goes to the shared game, even just after a resize'(v) {
    await v.p.goto(SITE); await feedUp(v.p);
    await sleep(700);   // (the page was resized as it loaded, and for half a second after that the feed ignores a swipe's news)
    await v.p.locator('#feed .slide').first().locator('.nextbtn').click({ force: true });
    await v.p.waitForFunction(() => document.getElementById('feed').scrollTop > 100 && __gs.active && __gs.active.el !== document.querySelector('#feed .slide'), null, { timeout: 20000 });
    await sleep(600);
    await v.p.setViewportSize({ width: 400, height: 820 }); await sleep(120);   // scroll news is ignored for a moment now
    await v.p.evaluate(id => __gs.shared(id), ID);
    await v.p.waitForFunction(id => __gs.active && __gs.active.def.id === id, ID, { timeout: 20000 }).catch(() => {});
    await sleep(700);
    return landed(v, { first: false });
  },
  async 'a link to a game that is already waiting further down the feed moves it up (no second copy)'(v) {
    await v.p.goto(SITE); await feedUp(v.p);
    await v.p.waitForFunction(() => document.querySelectorAll('#feed .slide').length >= 4, null, { timeout: 30000 });
    // whichever game is three cards down: a link to it arrives
    const below = await v.p.evaluate(() => { const c = document.querySelectorAll('#feed .slide')[3].getAttribute('aria-label'); return __gs.GAMES.find(g => g.title === c).id; });
    await made(v.p);
    await v.p.locator('#feed .slide').first().locator('.overlay button.play').click({ force: true });
    await playing(v.p);
    await v.p.evaluate(id => __gs.shared(id), below);
    await v.p.waitForFunction(id => __gs.active && __gs.active.def.id === id, below, { timeout: 20000 }).catch(() => {});
    await sleep(500);
    const r = await look(v.p), title = r.title, n = r.cards.filter(t => t === title).length, bad = [];
    if (r.active !== below) bad.push(`the current game is ${r.active}, not ${below}`);
    if (r.shown !== title || r.at !== 1) bad.push(`"${r.shown}" is on screen at card ${r.at + 1}, not "${title}" at card 2`);
    if (n !== 1) bad.push(`"${title}" is in the feed ${n} times`);
    return bad;
  },
};

const only = argv.find(a => a.startsWith('--only='))?.slice(7);
let failed = 0;
const run = async name => {
  const v = await visitor();
  let bad;
  try { bad = await tests[name](v); } catch (e) { bad = [String(e.message).split('\n')[0]]; }
  bad.push(...v.errs.map(e => 'page error: ' + e));
  await v.ctx.close();
  if (bad.length) failed++;
  console.log(`${bad.length ? 'FAIL' : 'PASS'} ${name}${bad.map(b => '\n   ' + b).join('')}`);
};
const names = Object.keys(tests).filter(n => !only || n.includes(only));
// the two that wait out the 10 s hold run beside the rest
const slow = names.filter(n => n.startsWith('a very slow')), quick = names.filter(n => !slow.includes(n));
await Promise.all([...slow.map(run), (async () => { for (const n of quick) await run(n); })()]);
await browser.close(); host.close(); app.close();
if (!argv.includes('--keep')) rmSync(tmp, { recursive: true, force: true });
console.log(`${names.length - failed}/${names.length} shared-link checks passed (shared game: ${ID})`);
process.exit(failed ? 1 : 0);
