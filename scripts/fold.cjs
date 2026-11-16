// Simulates folding/unfolding mid-game on Galaxy Z Fold 8 and iPhone Duo screen sizes (CSS px, approx.)
// and checks the running game survives and stays on screen. Usage: npm run build:bundled && node scripts/fold.cjs [id ...] [--jobs n]
const { chromium } = require('playwright');
const { jobs, pool } = require('./lib/pool.cjs');
const SIZES = {
  'fold8-cover': { width: 374, height: 591 }, 'fold8-inner': { width: 549, height: 735 },
  'duo-cover': { width: 466, height: 678 }, 'duo-inner': { width: 890, height: 626 },
};
const FLOWS = [['fold8-cover', 'fold8-inner', 'fold8-cover'], ['duo-cover', 'duo-inner', 'duo-cover']];
(async () => {
  const { server, url } = await require('./lib/serve.cjs').preview();   // (a free port: checks run side by side)
  const argv = process.argv.slice(2), n = jobs(argv, 'heavy'); let failed = 0;   // (fewer at once: it waits on layout timing, and 3D games share the CPUs)
  const ids = argv.length ? argv : ['stack', 'cave', 'slice', 'gold-digger'];
  await pool(ids.flatMap(id => FLOWS.map(flow => [id, flow])), n, () => chromium.launch(), async (b, [id, flow]) => {
    const ctx = await b.newContext({ viewport: SIZES[flow[0]], hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(300);
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(200);
    // a game whose kit loads on first use (physics, 3D...) can't start until it's in
    await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 }).catch(() => {});
    await p.evaluate(() => __gs.start());
    const probs = [];
    for (const step of flow.slice(1)) {
      await p.setViewportSize(SIZES[step]); await p.waitForTimeout(400);
      // Software-rendered 3D games can take a few slow frames before the refit lands, so give the
      // layout up to 5 s to settle; a game that never fits still fails.
      const probe = () => p.evaluate(() => { const s = __gs.active, c = s.canvas.getBoundingClientRect(); return { id: s.def.id, state: s.state, top: c.top, bottom: c.bottom, left: c.left, right: c.right, vw: innerWidth, vh: innerHeight }; });
      const off = r => r.top < 0 || r.left < 0 || r.bottom > r.vh + 1 || r.right > r.vw + 1;
      let r = await probe();
      for (let t = 0; t < 20 && off(r); t++) { await p.waitForTimeout(250); r = await probe(); }
      if (r.id !== id) probs.push(`${step}: switched to ${r.id}`);
      if (r.state === 'ready') probs.push(`${step}: game was reset`);
      if (off(r)) probs.push(`${step}: canvas off screen ${JSON.stringify(r)}`);
      if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${id}-${step}.png` });
    }
    const ok = !probs.length && !errs.length; if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${flow.join(' > ')}${ok ? '' : '\n   ' + [...probs, ...errs].join('\n   ')}`);
    await ctx.close();
  }, b => b.close());
  server.httpServer.close(); process.exit(failed ? 1 : 0);
})();
