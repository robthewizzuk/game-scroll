// Drives games directly (no real-time wait) through odd screen sizes and long random play, so code
// that only runs late in a round or near a level's ends gets exercised. Fails if any game throws.
// Usage: npm run build:bundled && node scripts/sweep.cjs [id ...] [--jobs n] [--full]   (default: all Console, Next Gen and AR games)
// The test browser draws 3D in software, where one Next Gen frame can take a third of a second, so
// Next Gen and AR games draw every 20th step at the odd sizes (at a small size: the same code, far
// fewer pixels) and every 10th at their own size; --full draws every 5th step at full size, as before.
// --jobs: browsers at once (default: half the CPUs).
// Example it catches: Suit Ops threw every frame once the chopper pad came into view.
const { chromium } = require('playwright');
const { jobs, pool } = require('./lib/pool.cjs');
(async () => {
  const argv = process.argv.slice(2), n = jobs(argv, 'heavy'), full = argv.includes('--full');
  if (full) argv.splice(argv.indexOf('--full'), 1);
  const { server, url } = await require('./lib/serve.cjs').preview();   // (a free port: checks run side by side)
  const open = async () => {
    const b = await chromium.launch();
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const w = { b, p, errs: [] }; p.on('pageerror', e => w.errs.push(e.message));
    await p.goto(url); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(400);
    return w;
  };
  let spare = await open();
  const ids = argv.length ? argv
    : await spare.p.evaluate(() => __gs.GAMES.filter(g => g.era === 'console' || g.era === 'nextgen' || g.era === 'ar' || g.era === 'board').map(g => g.id));
  let failed = 0;
  await pool(ids, n, async () => { const w = spare || await open(); spare = null; return w; }, async (w, id) => {
    const { p } = w, pageErrs = w.errs;
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
    // until its lazy parts are in (the app remakes the game then)
    // (up to a minute: a game that sculpts its people on first load takes far longer when browsers share a few cores)
    for (let i = 0; i < 600 && await p.evaluate(() => !__gs.active || __gs.active.loading); i++) await p.waitForTimeout(100);
    const res = await p.evaluate(async full => {
      const s = __gs.active, g = s.game, c = s.ctx;
      const hd = !full && window.__hd && (s.def.era === 'nextgen' || s.def.era === 'ar' || s.def.era === 'board');
      // tall and wide extremes put a level's start and end on screen at once
      const sizes = [[200, 1400], [480, 200], [160, 300], [s.w || 200, s.h || 300]];
      for (const [w, h] of sizes) {
        const own = w === sizes[3][0] && h === sizes[3][1], every = hd ? (own ? 10 : 20) : 5;
        if (hd) Object.assign(__hd, own ? { scale: null, upscale: true } : { scale: .3, upscale: false });
        try {
          g.resize && g.resize(w, h); g.reset();
          let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          for (let f = 0; f < 1500; f++) {
            if (f % 12 === 0) { const x = rnd() * w, y = rnd() * h; g.down && g.down(x, y); g.move && g.move(x, y - 40 * rnd(), true); }
            if (f % 12 === 6) g.up && g.up(rnd() * w, rnd() * h);
            g.update(1 / 30);
            if (f % every === 0) g.draw(c);
          }
        } catch (e) { if (hd) Object.assign(__hd, { scale: null, upscale: true }); return `${w}x${h}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`; }
      }
      if (hd) Object.assign(__hd, { scale: null, upscale: true });
      return null;
    }, full);
    if (res || pageErrs.length) { failed++; console.log(`FAIL ${id.padEnd(16)} ${res || pageErrs.join(' | ')}`); }
    else console.log(`PASS ${id}`);
    pageErrs.length = 0;
  }, w => w.b.close());
  server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
