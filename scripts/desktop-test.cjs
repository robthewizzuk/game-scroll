// Checks the Mac and Windows app (desktop/, Electron; guide docs/desktop.md).
//
//   npm run build:bundled && node scripts/desktop-test.cjs
//       The app as it is being worked on (desktop/main.cjs with desktop/node_modules' Electron) over the test
//       build in dist/ (every game built in): the app's address, what the page can reach, the computer's speed
//       class and frame rate, a 2D game and a Next Gen game played, gamescroll:// links, links out, and
//       that the page can't leave the app or read its files. (Linux: run it under xvfb-run.)
//   node scripts/desktop-test.cjs --app "<the built app's program>"
//       A packaged app (CI, after electron-builder; games stream from the games host, as players get them):
//       it opens on its own address, streams the catalogue and a game, and its page has no errors.
//       e.g. desktop/release/mac-arm64/Game Scroll.app/Contents/MacOS/Game Scroll,
//            desktop/release/win-unpacked/Game Scroll.exe, desktop/release/linux-unpacked/game-scroll-desktop
// About a minute either way. Exit code 1 on any failure.
const { _electron, chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..'), DESK = path.join(ROOT, 'desktop');
const argv = process.argv.slice(2), appAt = argv.includes('--app') ? argv[argv.indexOf('--app') + 1] : null;
let failed = 0;
const ok = (cond, what, more = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${what}${more ? ' (' + more + ')' : ''}`); if (!cond) failed++; };
const watch = p => { const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(m.text()); }); return errs; };

async function dev() {
  if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('no dist/: run npm run build:bundled first');
  const exe = require(path.join(DESK, 'node_modules/electron'));   // (the path to its Electron)
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-desk-'));
  const app = await _electron.launch({
    executablePath: exe, args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), DESK],
    env: { ...process.env, GS_WEB: path.join(ROOT, 'dist'), GS_USER_DATA: data },
  });
  try {
    const p = await app.firstWindow(), errs = watch(p);
    await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(800);
    const f = await p.evaluate(() => ({ origin: location.origin, secure: isSecureContext, desk: window.gsDesktop ? { os: gsDesktop.os, version: gsDesktop.version, open: typeof gsDesktop.onOpenUrl } : null, node: typeof require + typeof process + typeof module, info: __gs.desk() }));
    ok(f.origin === 'https://localhost' && f.secure, 'the app runs at https://localhost, a secure page (the Android app\'s address)', f.origin);
    ok(f.desk && ['mac', 'windows', 'linux'].includes(f.desk.os) && /^\d+\.\d+\.\d+$/.test(f.desk.version) && f.desk.open === 'function', 'window.gsDesktop says which computer and version', JSON.stringify(f.desk));
    ok(f.node === 'undefinedundefinedundefined', 'nothing of Node reaches the page');
    ok(f.info.desktop && ['top', 'mid', 'low'].includes(f.info.klass), 'the engine knows it is on a computer', `class ${f.info.klass}, ${f.info.hz} Hz, 2D ${f.info.auto2d} fps, 3D ${f.info.auto3d} fps`);
    ok(f.info.auto2d === f.info.hz, '2D games run at the screen\'s own rate');
    // the app's files, and nothing else of the computer's
    const files = await p.evaluate(async () => {
      const st = async u => { try { return (await fetch(u)).status; } catch (e) { return 'refused'; } };
      return { page: await st('/index.html'), up: await st('/%2e%2e/main.cjs'), up2: await st('/..%2fpackage.json'), none: await st('/no-such-file.js'), wasm: (await fetch([...performance.getEntriesByType('resource')].map(r => r.name).find(n => n.endsWith('.wasm')) || '/index.html')).headers.get('content-type') };
    });
    ok(files.page === 200 && files.none === 404, 'the app\'s own files are served, a missing one is a 404');
    ok(files.up !== 200 && files.up2 !== 200, 'files outside the app can\'t be read', `${files.up} ${files.up2}`);
    // links out of the app go to the browser; the window never leaves the app
    await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async u => { global.__opened.push(u); }; });
    await p.evaluate(() => { window.open('https://example.com/a'); });
    await p.evaluate(() => { const a = document.createElement('a'); a.href = 'https://example.com/b'; document.body.append(a); a.click(); a.remove(); });
    await p.waitForTimeout(600);
    const opened = await app.evaluate(() => global.__opened), wins = app.windows().length, at = await p.evaluate(() => location.origin);
    ok(opened.includes('https://example.com/a') && opened.includes('https://example.com/b') && wins === 1 && at === 'https://localhost', 'links out open in the browser, the window stays', JSON.stringify(opened));
    // a 2D game, played with the mouse
    await p.evaluate(() => __gs.only('sky-drifter', true)); await p.waitForTimeout(400);
    await p.waitForFunction(() => __gs.active && __gs.active.def.id === 'sky-drifter' && !__gs.active.loading, null, { timeout: 30000 });
    await p.evaluate(() => __gs.start());
    const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    for (let i = 0; i < 12; i++) { await p.mouse.move(r.x + r.w * (.2 + .6 * Math.random()), r.y + r.h * (.3 + .5 * Math.random())); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up(); }
    ok((await p.evaluate(() => __gs.active.state)) !== 'ready' && !errs.length, 'a 2D game plays with the mouse', errs.join(' | '));
    // a Next Gen game draws
    errs.length = 0;
    await p.evaluate(() => __gs.only('bunker-breakout', true));
    await p.waitForFunction(() => __gs.active && __gs.active.def.id === 'bunker-breakout' && !__gs.active.loading, null, { timeout: 90000 });
    await p.evaluate(() => __gs.start()); await p.waitForTimeout(3000);
    const hd = await p.evaluate(async () => { const H = (await __gs.gs()).default.hd.HD; return { name: H.name, rw: H.info.rw, rh: H.info.rh, gpu: __gs.desk().gpu }; }).catch(e => ({ err: e.message }));
    ok(hd.rw > 0 && !errs.length, 'a Next Gen game draws', `${hd.err || ''}${hd.name} tier, ${hd.rw} x ${hd.rh} on ${hd.gpu ? 'WebGPU' : 'WebGL'}${errs.length ? ': ' + errs.join(' | ') : ''}`);
    // gamescroll:// links (the share page's "Open in Game Scroll"): one while running...
    await app.evaluate(({ app }) => { app.emit('open-url', { preventDefault() {} }, 'gamescroll://game/sky-drifter'); });
    const linked = await p.waitForFunction(() => __gs.active && __gs.active.def.id === 'sky-drifter', null, { timeout: 20000 }).then(() => true, () => false);
    ok(linked, 'a gamescroll:// link opens that game');
    // the window's size and place are kept for next time
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 760 }));
    await p.waitForTimeout(900);
    let kept = null; try { kept = JSON.parse(fs.readFileSync(path.join(data, 'window.json'), 'utf8')); } catch (_) { /* not written */ }
    ok(kept && kept.bounds && kept.bounds.width === 1000, 'the window\'s size is kept for next time', JSON.stringify(kept && kept.bounds));
  } finally { await app.close().catch(() => {}); fs.rmSync(data, { recursive: true, force: true }); }
}

async function packaged() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(appAt, [`--remote-debugging-port=${port}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  let b = null;
  try {
    for (let i = 0; i < 60 && !b; i++) { await new Promise(r => setTimeout(r, 1000)); b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null); }
    ok(!!b, 'the built app starts', b ? '' : out.slice(-2000));
    if (!b) return;
    let p = null;
    for (let i = 0; i < 30 && !p; i++) { p = b.contexts().flatMap(c => c.pages()).find(x => x.url().startsWith('https://localhost')); if (!p) await new Promise(r => setTimeout(r, 1000)); }
    ok(!!p, 'its window opens the app at https://localhost', b.contexts().flatMap(c => c.pages()).map(x => x.url()).join(', '));
    if (!p) return;
    const errs = watch(p);
    await p.reload(); await p.waitForLoadState('load');
    // the catalogue and the first game come from the games host (the streamed app, as players get it)
    const card = await p.waitForFunction(() => document.querySelectorAll('.slide').length > 0 && !!document.querySelector('.slide canvas'), null, { timeout: 60000 }).then(() => true, () => false);
    await p.waitForTimeout(4000);
    const f = await p.evaluate(async () => {
      let gpu = null; try { const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }); gpu = a ? `${a.info?.vendor || '?'} ${a.info?.architecture || ''} ${a.info?.description || ''}`.trim() : 'none'; } catch (e) { gpu = 'error ' + e.message; }
      return { origin: location.origin, desk: window.gsDesktop ? `${gsDesktop.os} ${gsDesktop.version} (Electron ${gsDesktop.electron}, Chrome ${gsDesktop.chrome})` : null, title: document.querySelector('.slide .title, .slide h2, .g-title')?.textContent || document.title, cards: document.querySelectorAll('.slide').length, gpu };
    });
    ok(f.origin === 'https://localhost' && !!f.desk, 'the page is the app, with window.gsDesktop', f.desk || 'no gsDesktop');
    ok(card, 'the feed streams in its games from the games host', `${f.cards} cards`);
    console.log(`     WebGPU adapter: ${f.gpu}`);
    ok(!errs.length, 'no page errors', errs.join(' | '));
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  } finally { if (b) await b.close().catch(() => {}); proc.kill(); }
}

(appAt ? packaged() : dev()).catch(e => { console.error(e); failed++; }).finally(() => { console.log(failed ? `${failed} check(s) failed` : 'all desktop checks passed'); process.exit(failed ? 1 : 0); });
