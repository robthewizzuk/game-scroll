// Plays Next Gen and AR games on WebGPU with frame generation on (src/kit/framegen.js), both ways
// (blend and ahead), and checks what reaches the screen: no errors, a made frame on the refreshes
// between real ones, and each made frame sitting between the real frames shown before and after it
// (closer to both than they are to each other: a frame that is broken or from the wrong time isn't).
// A frame made ahead is a guess, so where the game changes course (a drag stops) it only has to stay
// within the last real step of the frame it was made from.
// Uses SwiftShader's Vulkan driver, so it runs without a GPU; the headless screen is 60 Hz, so here
// the games draw 30 real frames a second and frame generation makes the other 30.
//   npm run build:bundled && node scripts/framegen-games.cjs [id ...] [--mode blend|ahead] [--pace after|first|early] [--shots dir] [--feed] [--jobs n] [--play s]
// Without ids it plays every Next Gen and AR game that draws on WebGPU. --jobs: browsers playing at
// once (default: half the CPUs; each SwiftShader uses several); --play: seconds of play per game (5); --pace: blend's
// pace for every game (HD.fgPace; early is 30 → 60's: the real frame's refresh shown first, its work sent after it).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
(async () => {
  const argv = process.argv.slice(2), take = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const shots = take('--shots'), only = take('--mode'), modes = only ? [only] : ['blend', 'ahead'], pace = take('--pace');
  const jobs = Math.max(1, +(take('--jobs') || Math.floor(os.cpus().length / 2))), play = 1000 * +(take('--play') || 5);
  // --feed: leave the refreshes between to the feed's own loop (only light games keep up on SwiftShader)
  const feedLoop = argv.includes('--feed'); if (feedLoop) argv.splice(argv.indexOf('--feed'), 1);
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const server = await (await import('vite')).preview({ preview: { port: 4186 } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  // one browser per job (each has its own GPU process, so they really run side by side)
  const open = async () => {
    const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(), w = { b, p, errs: [], offs: 0 };
    p.on('pageerror', e => w.errs.push(e.message));
    p.on('console', m => {
      const t = m.text();
      // (the kit turning frame generation off for a game whose refreshes between keep not coming: expected here, as SwiftShader is slow)
      if (/^Frame generation off/.test(t)) { w.offs++; return; }
      if ((m.type() === 'error' && !/^Failed to load resource/.test(t)) || /WebGPU did not start|WebGPU:/.test(t) || (m.type() === 'warning' && /frame generation/i.test(t))) w.errs.push(t);
    });
    await p.goto('http://localhost:4186/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(400);
    // a 3D game first: the 3D kit (and its WebGPU switch) loads with it
    await p.evaluate(() => __gs.only(__gs.GAMES.find(g => g.era === 'nextgen' || g.era === 'ar').id)); await p.waitForTimeout(1500);
    const ok = await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); return !!(await window.__gpu.ready()); });
    if (!ok) { console.log('FAIL WebGPU did not start in this browser'); process.exit(1); }
    // the lowest tier at a small size, so SwiftShader keeps up with the refreshes in between
    // (and real frames come seconds apart in the heaviest games here: not a pause, as it would be on a phone)
    // fresh aim off: it turns frames to where the newest touch points, and the random touches here jump
    // about, so frames wouldn't sit between their neighbours (scripts/framegen-test.cjs checks the turn itself)
    await p.evaluate(pace => { __hd.force = 0; __hd.scale = .45; __hd.direct = true; __hd.fgGap = 3000; __hd.aim = false; if (pace) __hd.fgPace = pace; }, pace);
    return w;
  };
  const first = await open();
  const ids = argv.length ? argv : await first.p.evaluate(() => __gs.GAMES.filter(g => (g.era === 'nextgen' || g.era === 'ar' || g.era === 'board') && g.frameGen !== false).map(g => g.id));
  const queue = ids.flatMap(id => modes.map(mode => ({ id, mode }))), stays = new Set();
  let failed = 0;
  const run = async (w, { id, mode }) => {
    const { p } = w;
    if (stays.has(id)) return;
    w.errs = []; w.offs = 0;
    await p.evaluate(m => { __hd.frameGen = m; __hd.info.framegen = false; __hd.info.backend = ''; }, mode);
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(600); await p.evaluate(() => __gs.start());
    // until it draws with frame generation on (SwiftShader takes seconds to compile the shaders), not a fixed wait
    await p.waitForFunction(m => __hd.info.framegen === m || (__hd.info.backend === 'webgl' && __hd.info.webgl), mode, { timeout: 30000, polling: 100 }).catch(() => {});
    const backend = await p.evaluate(() => __hd.info.backend);
    if (backend !== 'webgpu') { stays.add(id); console.log(`skip ${id.padEnd(16)} stays on WebGL (${await p.evaluate(() => __hd.info.webgl)})`); return; }
    // record what each refresh shows (small copies), while playing with random input
    await p.evaluate(slow => {
      const T = window.__fg = { seq: [], n: { frame: 0, between: 0, made: 0, real: 0 } };
      __hd.fgTap = (kind, cv, when) => {
        T.n[when]++; T.n[kind]++;
        // SwiftShader draws a real frame slower than the screen refreshes, so the feed never has a refresh
        // between to skip: run it straight after, as a phone would on the next refresh
        if (when === 'frame' && slow) setTimeout(() => __hd.between(), 0);
        if (T.seq.length >= 240) return;
        const c = document.createElement('canvas'); c.width = 96; c.height = Math.round(96 * cv.height / cv.width);
        c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
        // compared small, so the film grain (new every refresh) averages out and what's left is the picture
        const s = document.createElement('canvas'); s.width = 24; s.height = Math.round(24 * cv.height / cv.width);
        const g = s.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, s.width, s.height);
        T.seq.push({ kind, when, t: performance.now(), px: g.getImageData(0, 0, s.width, s.height).data, c });
      };
    }, !feedLoop);
    const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const t0 = Date.now();
    // heavy games draw a few real frames a second on SwiftShader: they play on (up to 3x) until a few frames were made
    while (Date.now() - t0 < play || (Date.now() - t0 < play * 3 && await p.evaluate(() => window.__fg.n.made < 3))) {
      if (await p.evaluate(() => __gs.active.state) !== 'playing') await p.evaluate(() => __gs.start());
      await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h); await p.mouse.down();
      await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 4 });
      await p.waitForTimeout(80 + Math.random() * 150); await p.mouse.up();
    }
    const res = await p.evaluate(want => {
      const T = window.__fg; __hd.fgTap = null;
      const d = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; return s / (a.length / 4); };
      // each made frame between two real ones in the order shown: how far it is from each, against how far they are apart
      const trips = [];
      for (let i = 1; i + 1 < T.seq.length; i++) {
        const [a, m, c] = [T.seq[i - 1], T.seq[i], T.seq[i + 1]];
        if (m.kind !== 'made' || a.kind !== 'real' || c.kind !== 'real') continue;
        const ac = d(a.px, c.px); if (ac < 2.5) continue;   // too little moved to tell at this size
        // (ahead) the real frame before the one it was made from: how far the last real step went
        let b = i - 2; while (b >= 0 && T.seq[b].kind !== 'real') b--;
        trips.push({ i, ac, am: d(a.px, m.px), mc: d(m.px, c.px), step: b >= 0 ? d(T.seq[b].px, a.px) : 0 });
      }
      // a made frame sits between its neighbours; one made ahead is a guess, so where the game changed
      // course it can't be, but it must never go further from the frame it came from than the last real step did
      const worse = trips.filter(t => Math.max(t.am, t.mc) > t.ac * 1.05 && !(want.ahead && t.am <= t.step * 1.05)).length;
      const ratio = trips.length ? trips.reduce((s, t) => s + Math.max(t.am, t.mc) / t.ac, 0) / trips.length : 0;
      // a strip of six refreshes from the busiest stretch, for looking at
      let strip = null;
      if (want.shots && trips.length) {
        const best = trips.reduce((a, t) => t.ac > a.ac ? t : a), s0 = Math.max(0, Math.min(T.seq.length - 6, best.i - 2)), fr = T.seq.slice(s0, s0 + 6);
        const w = fr[0].c.width, h = fr[0].c.height, cv = document.createElement('canvas'); cv.width = w * 6 * 2; cv.height = h * 2 + 16;
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
        fr.forEach((f, k) => { g.drawImage(f.c, k * w * 2, 16, w * 2, h * 2); g.fillStyle = f.kind === 'made' ? '#ff0' : '#fff'; g.font = '12px sans-serif'; g.fillText(f.kind, k * w * 2 + 4, 12); });
        strip = cv.toDataURL('image/png');
      }
      return { n: T.n, trips: trips.length, worse, ratio, info: __hd.info.framegen, strip };
    }, { shots: !!shots, ahead: mode === 'ahead' });
    const errs = w.errs, offs = w.offs;
    const bad = errs.length || !res.n.made || res.worse > Math.max(1, res.trips * .15) || res.info !== mode;
    if (bad) failed++;
    console.log(`${bad ? 'FAIL' : 'PASS'} ${id.padEnd(16)} ${mode.padEnd(5)}  ${res.n.frame} real refreshes, ${res.n.between} between (${res.n.made} made frames shown)` +
      `  made vs neighbours ${res.ratio.toFixed(2)} (under 1 is in between; ${res.worse}/${res.trips} not)${res.info !== mode ? `  framegen=${res.info}` : ''}${offs ? '  (too slow here for every refresh between)' : ''}${errs.length ? '\n   ' + [...new Set(errs)].slice(0, 6).join('\n   ') : ''}`);
    if (shots && res.strip) fs.writeFileSync(path.join(shots, `${id}.${mode}.png`), Buffer.from(res.strip.split(',')[1], 'base64'));
  };
  const workers = [first, ...await Promise.all(Array.from({ length: Math.min(jobs, queue.length) - 1 }, open))];
  await Promise.all(workers.map(async w => { for (let job; (job = queue.shift());) await run(w, job); }));
  await Promise.all(workers.map(w => w.b.close())); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
