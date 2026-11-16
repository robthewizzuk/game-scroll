// Plays every game (or the ids given as args) with random input on a phone-sized screen
// and fails if any game throws. Usage: npm run build:bundled && node scripts/smoke.cjs [id ...] [--jobs n]
// --jobs: browsers playing at once (default: one per CPU, up to 6; JOBS=n does the same). With several at once the app can take longer to start, so it waits up to 60 s for it.
const { chromium, devices } = require('playwright');
const { jobs, pool } = require('./lib/pool.cjs');
(async () => {
  const argv = process.argv.slice(2), n = jobs(argv);
  const { server, url } = await require('./lib/serve.cjs').preview();   // (a free port: checks run side by side)
  // one browser per worker: each has its own GPU process, so 3D games really draw side by side
  const open = async () => {
    const b = await chromium.launch();
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(), w = { b, p, errs: [] };
    p.on('pageerror', e => w.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) w.errs.push(m.text()); });   // the app's own API calls (scores, hearts) can fail offline: not the game's fault
    await p.goto(url); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(400);
    return w;
  };
  const first = await open();
  // a test machine without a colour emoji font draws emoji as empty boxes (phones are fine)
  const emoji = await first.p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d'); g.font = '20px sans-serif'; g.textBaseline = 'top'; g.fillText('\u{1F34E}', 0, 0); const d = g.getImageData(0, 0, 24, 24).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && Math.abs(d[i] - d[i + 1]) > 40) return true; return false; });
  if (!emoji) console.log('note: this browser has no colour emoji font, so emoji draw as boxes here (they are fine on phones). Fix: sudo apt-get install fonts-noto-color-emoji');
  const ids = argv.length ? argv : await first.p.evaluate(() => __gs.GAMES.map(g => g.id));
  let failed = 0;
  // Every game must pay credits for a win, so every game needs a goal score.
  const noGoal = await first.p.evaluate(ids => __gs.GAMES.filter(g => ids.includes(g.id) && !(g.goal > 0)).map(g => g.id), ids);
  for (const id of noGoal) console.log(`FAIL ${id.padEnd(14)} has no \`goal\` (the score that counts as a win)`);
  failed += noGoal.length;
  let spare = first;
  await pool(ids, n, async () => { const w = spare || await open(); spare = null; return w; }, async (w, id) => {
    const { p } = w; w.errs = [];
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
    // until it has loaded (a game that builds a lot on first load would otherwise spend the whole test on "Loading…", played by nobody)
    await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 }).catch(() => {});
    const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    let rounds = 0, maxScore = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const st = await p.evaluate(() => __gs.active.state);
      if (st !== 'playing') { await p.evaluate(() => __gs.start()); rounds++; }
      const x = r.x + Math.random() * r.w, y = r.y + Math.random() * r.h;
      await p.mouse.move(x, y); await p.mouse.down();
      await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 3 });
      await p.waitForTimeout(Math.random() * 120); await p.mouse.up();
      maxScore = Math.max(maxScore, await p.evaluate(() => __gs.active.score));
    }
    const errs = w.errs, ok = errs.length === 0; if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id.padEnd(14)} rounds=${rounds} best=${maxScore}${ok ? '' : '\n   ' + errs.join('\n   ')}`);
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${id}.png` });
  }, w => w.b.close());
  server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
