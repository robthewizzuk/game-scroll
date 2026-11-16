// Checks the Mac and Windows app (desktop/, Electron; guide docs/desktop.md).
//
//   npm run build:bundled && node scripts/desktop-test.cjs
//       The app as it is being worked on (desktop/main.cjs with desktop/node_modules' Electron) over the test
//       build in dist/ (every game built in): the app's address, what the page can reach, the computer's speed
//       class and frame rate, a 2D game and a Next Gen game played, gamescroll:// links, links out, and
//       that the page can't leave the app or read its files. (Linux: run it under xvfb-run.) On Linux it then opens it as a
//       ROG Ally X in Steam's games mode: full screen, drawn bigger, its class, and the feed, Settings and a touch game
//       played with a controller alone (--no-handheld: not that).
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
    const went = new Set(opened);
    ok(went.has('https://example.com/a') && went.has('https://example.com/b') && wins === 1 && at === 'https://localhost', 'links out open in the browser, the window stays', JSON.stringify(opened));
    // the speed settings main.cjs gives Chromium: JavaScript's young space (a sweep about once a second, not several, for a 3D
    // game's ~700 KB of short-lived things a frame), and shaders without WebGPU's bounds checks (a read past an array's end
    // isn't clamped to its last element); and the heat and battery reading the engine steps down by (src/kit/power.js)
    const tune = await p.evaluate(async () => {
      const gc = await new Promise(res => {
        if (!performance.memory) return res(null);
        let last = performance.memory.usedJSHeapSize, drops = 0, keep = null; const t0 = performance.now();
        const f = now => { for (let i = 0; i < 7000; i++) keep = { x: i, y: [i, i + 1, i + 2] }; const u = performance.memory.usedJSHeapSize; if (u < last - 1e6) drops++; last = u; if (now - t0 < 5000) requestAnimationFrame(f); else res(+(drops / 5).toFixed(1)); };
        requestAnimationFrame(f);
      });
      let oob = null;
      try {
        const a = await navigator.gpu?.requestAdapter(), d = a && await a.requestDevice();
        if (d) {
          const B = GPUBufferUsage, src = d.createBuffer({ size: 256, usage: B.STORAGE | B.COPY_DST }), out = d.createBuffer({ size: 16, usage: B.STORAGE | B.COPY_SRC }), rd = d.createBuffer({ size: 16, usage: B.MAP_READ | B.COPY_DST }), k = d.createBuffer({ size: 16, usage: B.UNIFORM | B.COPY_DST });
          d.queue.writeBuffer(src, 0, new Uint32Array(64).map((_, i) => i)); d.queue.writeBuffer(k, 0, new Uint32Array([10, 0, 0, 0]));
          const m = d.createShaderModule({ code: '@group(0) @binding(0) var<storage, read> a: array<u32>; @group(0) @binding(1) var<storage, read_write> o: array<u32>; @group(0) @binding(2) var<uniform> k: vec4u; @compute @workgroup_size(1) fn main() { o[0] = a[k.x]; }' });
          const pl = d.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main' } });
          const bg = d.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: src, offset: 0, size: 16 } }, { binding: 1, resource: { buffer: out } }, { binding: 2, resource: { buffer: k } }] });
          const e = d.createCommandEncoder(), c = e.beginComputePass(); c.setPipeline(pl); c.setBindGroup(0, bg); c.dispatchWorkgroups(1); c.end(); e.copyBufferToBuffer(out, 0, rd, 0, 16); d.queue.submit([e.finish()]);
          await rd.mapAsync(GPUMapMode.READ); oob = new Uint32Array(rd.getMappedRange())[0]; d.destroy();
        }
      } catch (err) { oob = 'error ' + err.message; }
      return { gc, oob, power: await gsDesktop.power() };
    });
    ok(tune.gc != null && tune.gc < 2, 'JavaScript\'s young space is a computer\'s size (few sweeps of short-lived things)', `${tune.gc} a second`);
    ok(tune.oob === null || tune.oob === 10, 'shaders run without WebGPU\'s bounds checks', tune.oob === null ? 'no WebGPU here' : `index 10 of 4 read ${tune.oob}`);
    ok(tune.power && typeof tune.power.thermal === 'string' && typeof tune.power.battery === 'boolean', 'the app says the computer\'s heat and battery', JSON.stringify(tune.power));
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

// A games handheld in Steam's games mode (a ROG Ally X stood in for: GS_HANDHELD, desktop/device.cjs), played with a
// controller alone (one made up in the page: navigator.getGamepads). Linux only (the handheld facts are Linux's).
async function handheld() {
  const exe = require(path.join(DESK, 'node_modules/electron'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-hand-'));
  const app = await _electron.launch({
    executablePath: exe, args: ['--no-sandbox', DESK],
    env: { ...process.env, GS_WEB: path.join(ROOT, 'dist'), GS_USER_DATA: data, GS_HANDHELD: 'ROG Ally X RC72LA_RC72LA', GS_HANDHELD_VENDOR: 'ASUSTeK COMPUTER INC.', GS_HANDHELD_CPU: 'AMD Ryzen Z1 Extreme w/ Radeon 780M Graphics', SDL_GAMECONTROLLER_IGNORE_DEVICES: '0x0b05/0x1b4c' },
  });
  try {
    const p = await app.firstWindow(), errs = watch(p);
    await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(800);
    const { zoomFor } = require(path.join(DESK, 'device.cjs'));
    const scr = await app.evaluate(({ screen, BrowserWindow }) => ({ h: screen.getPrimaryDisplay().size.height, full: BrowserWindow.getAllWindows()[0].isFullScreen() }));
    const f = await p.evaluate(() => ({ dev: gsDesktop.device, dpr: devicePixelRatio, ih: innerHeight, info: __gs.desk() }));
    ok(f.dev && f.dev.handheld && f.dev.handheld.id === 'rog-ally-x' && f.dev.console, 'a ROG Ally X is known as a handheld in console mode', JSON.stringify(f.dev && f.dev.handheld));
    ok(scr.full, 'console mode opens full screen');
    ok(Math.abs(f.dpr - zoomFor(scr.h)) < .01, 'and draws the app bigger to read from a hand\'s length', `zoom ${f.dpr} on a ${scr.h} px screen, ${f.ih} px tall to the page`);
    // (its class is the model's, 'top', unless it draws in software, as the test machine does: then 'low')
    ok(f.info.handheld === 'top' && !f.info.pc && (f.info.klass === 'low' || f.info.klass === 'top' && f.info.auto3d === 60), 'it plays 3D games as a top phone does (its class from the model, 60 a second)', `handheld ${f.info.handheld}, class ${f.info.klass}, 3D ${f.info.auto3d} fps, 2D ${f.info.auto2d} fps`);
    // a made-up controller: buttons by the standard layout's numbers, and the pad Steam stands in for (left out)
    await p.evaluate(() => {
      const mk = (i, id) => ({ index: i, id, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
      window.__pad = mk(0, 'Microsoft X-Box 360 pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)');
      window.__real = mk(1, 'ASUS ROG Ally X (STANDARD GAMEPAD Vendor: 0b05 Product: 1b4c)');
      navigator.getGamepads = () => [window.__pad, window.__real];
      dispatchEvent(new Event('gamepadconnected'));
    });
    const B = { a: 0, b: 1, x: 2, y: 3, l: 4, r: 5, select: 8, start: 9, ls: 10, up: 12, down: 13, left: 14, right: 15 };
    // press on both pads, as a handheld's own buttons and Steam's stand-in both would: it must count once
    const press = async (n, ms = 90) => { for (const g of ['__pad', '__real']) await p.evaluate(([g, i]) => { window[g].buttons[i] = { pressed: true, value: 1 }; }, [g, B[n]]); await p.waitForTimeout(ms); for (const g of ['__pad', '__real']) await p.evaluate(([g, i]) => { window[g].buttons[i] = { pressed: false, value: 0 }; }, [g, B[n]]); await p.waitForTimeout(160); };
    const id = () => p.evaluate(() => __gs.active && __gs.active.def.id);
    await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 30000 });
    // (the feed may still be making the next card: a press then does nothing, as a key's does, so up to three)
    const first = await id();
    for (let i = 0; i < 3 && await id() === first; i++) { await press('down'); await p.waitForFunction(was => __gs.active && __gs.active.def.id !== was, first, { timeout: 5000 }).catch(() => {}); }
    const second = await id();
    ok(second && second !== first, 'the d-pad moves through the feed', `${first} → ${second}`);
    await press('up'); await p.waitForFunction(was => __gs.active && __gs.active.def.id === was, first, { timeout: 8000 }).catch(() => {});
    ok(await id() === first, 'one press is one game, though two pads report it', await id());
    const liked = () => p.evaluate(() => __gs.active.el.querySelector('.like').getAttribute('aria-pressed'));
    const l0 = await liked(); await press('y');
    ok(await liked() !== l0, 'Y hearts the game');
    await press('y');
    // the top bar and the game's buttons: View, then → to Settings, A opens it, ↓ moves inside it, B closes it
    await press('select');
    const inBar = await p.evaluate(() => !!document.activeElement && (!!document.activeElement.closest('.top') || !!document.activeElement.closest('.slide')) && document.documentElement.classList.contains('pad-ui'));
    ok(inBar, 'View goes to the top bar, with the focus ring');
    for (let i = 0; i < 8 && !(await p.evaluate(() => document.activeElement?.id === 'settings')); i++) await press('right');
    await press('a'); await p.waitForTimeout(300);
    const open = await p.evaluate(() => !!document.querySelector('dialog.settings[open]'));
    ok(open, 'A opens Settings from there');
    const at0 = await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 60));
    await press('down'); await press('down');
    const at1 = await p.evaluate(() => ({ html: document.activeElement?.outerHTML.slice(0, 60), inside: !!document.activeElement?.closest('dialog.settings') }));
    ok(at1.inside && at1.html !== at0, '↓ moves between its buttons', `${at0} → ${at1.html}`);
    const ctl = await p.evaluate(() => !!document.querySelector('dialog.settings .set-pad') && !!document.querySelector('dialog.settings .set-quit'));
    ok(ctl, 'Settings says which button does what, and has Quit');
    await press('b'); await p.waitForTimeout(300);
    ok(!(await p.evaluate(() => !!document.querySelector('dialog[open]'))), 'B closes it');
    await press('b');
    // a game played by touch gets a pointer: the stick moves it, A is the finger
    await p.evaluate(() => __gs.only('fly-swatter', true)); await p.waitForTimeout(400);
    await p.waitForFunction(() => __gs.active && __gs.active.def.id === 'fly-swatter' && !__gs.active.loading, null, { timeout: 30000 });
    await press('a'); await p.waitForTimeout(600);
    const taps = await p.evaluate(() => { const g = __gs.active.game, log = window.__taps = []; for (const k of ['down', 'move', 'up']) { const f = g[k]; if (f) g[k] = (...a) => { log.push([k, Math.round(a[0]), Math.round(a[1]), a[a.length - 1]]); return f.apply(g, a); }; } return __gs.active.state; });
    await p.evaluate(() => { window.__pad.axes[0] = 1; }); await p.waitForTimeout(400); await p.evaluate(() => { window.__pad.axes[0] = 0; });
    await press('a', 120);
    const t = await p.evaluate(() => ({ taps: window.__taps, cur: !!document.querySelector('.pad-cursor:not([hidden])'), w: __gs.active.w, hasUp: !!__gs.active.game.up }));
    const down = t.taps.find(x => x[0] === 'down'), up = t.taps.find(x => x[0] === 'up');
    ok(taps === 'playing' && down && (up || !t.hasUp) && down[1] > t.w / 2 && t.cur, 'a touch game gets a pointer: the stick moves it and A taps', JSON.stringify(t.taps.slice(-4)));
    ok(!errs.length, 'no page errors', errs.join(' | '));
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT.replace(/(\.png)?$/, '-handheld.png') });
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

(appAt ? packaged() : dev().then(() => process.platform === 'linux' && !argv.includes('--no-handheld') ? handheld() : null)).catch(e => { console.error(e); failed++; }).finally(() => { console.log(failed ? `${failed} check(s) failed` : 'all desktop checks passed'); process.exit(failed ? 1 : 0); });
