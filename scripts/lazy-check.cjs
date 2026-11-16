// Lazy tricks: can a game be won without playing it? Plays each game once with each of the tricks a
// player who doesn't want to play tries first (src/playtest.js lazy): doing nothing, holding a finger on
// the middle, mashing one spot (the middle, low down, high up), drawing circles, and swiping back and forth.
// Much faster than real time, with a seeded Math.random, like the playtest bot.
//
//   npm run build:bundled && node scripts/lazy-check.cjs [id ...] [--jobs n] [--json]
//
// Fails a game that a trick wins (reaches the goal), or that scores while left alone. A trick that gets
// past half the goal is a warning: a player will find it. Rhythm and aiming games where blind input
// shouldn't score at all pass easily; a game that pays for any touch doesn't. (scripts/check.mjs runs it.)
const { chromium, devices } = require('playwright');
const { jobs, pool } = require('./lib/pool.cjs');
(async () => {
  const argv = process.argv.slice(2), n = jobs(argv), json = argv.includes('--json');
  const ids0 = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--jobs');
  const { server, url } = await require('./lib/serve.cjs').preview();   // (a free port: checks run side by side)
  const open = async () => {
    const b = await chromium.launch();
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(), w = { b, p, errs: [] };
    p.on('pageerror', e => w.errs.push(e.message));
    await p.goto(url); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(400);
    return w;
  };
  const first = await open();
  const ids = ids0.length ? ids0 : await first.p.evaluate(() => __gs.GAMES.map(g => g.id));
  const rows = []; let failed = 0, warned = 0, spare = first;
  const gh = !!process.env.GITHUB_ACTIONS;
  await pool(ids, n, async () => { const w = spare || await open(); spare = null; return w; }, async (w, id) => {
    const { p } = w; w.errs = [];
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(300);
    await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 }).catch(() => {});
    let rep;
    try { rep = await p.evaluate(id => __gs.playtest(id, { lazy: true }), id); }
    catch (e) { rep = { id, tricks: [], errors: [String(e.message || e).split('\n')[0]] }; }
    const errs = [...new Set([...(rep.errors || []), ...w.errs])];
    const wins = rep.tricks.filter(t => t.win), idle = rep.tricks.find(t => t.trick === 'idle');
    const near = rep.tricks.filter(t => !t.win && t.trick !== 'idle' && t.share >= .5);
    const fails = [...wins.map(t => `${t.trick} wins (goal at ${t.goalAt} s)`), ...(idle && !idle.win && idle.best > 0 ? [`scores ${idle.best} with no input`] : []), ...(errs.length ? ['errors'] : [])];
    const warns = near.map(t => `${t.trick} gets ${Math.round(t.share * 100)}% of the goal`);
    if (fails.length) failed++; else if (warns.length) warned++;
    const best = rep.tricks.length ? rep.tricks.reduce((a, b) => (b.share > a.share ? b : a)) : null;
    if (!json) {
      console.log(`${fails.length ? 'FAIL' : warns.length ? 'WARN' : ' ok '} ${id.padEnd(16)} goal ${String(rep.goal).padStart(5)}  ${fails.concat(warns).join(', ') || (best ? `best trick: ${best.trick}, ${best.best} (${Math.round(best.share * 100)}%)` : '')}`);
      for (const e of errs) console.log('      ' + e);
    }
    if (gh && (fails.length || warns.length)) console.log(`::${fails.length ? 'error' : 'warning'} file=src/games/${id}.js::lazy tricks: ${fails.concat(warns).join(', ')}`);
    rows.push({ ...rep, errors: errs, fails, warns });
  });
  await server.close();
  if (json) console.log('LAZY_JSON ' + JSON.stringify(rows));
  else console.log(failed ? `${failed} failed${warned ? `, ${warned} with warnings` : ''}` : warned ? `lazy tricks ok, ${warned} with warnings` : 'lazy tricks ok');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
