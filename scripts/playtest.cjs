// AI playtester: a bot that tries to WIN each game (src/playtest.js), not just mash taps. It runs the
// game faster than real time and evolves a plan of taps, holds, drags and keys towards the goal, then
// reports whether it got there and after how much game time.
//
//   npm run build:bundled && node scripts/playtest.cjs [id ...] [--budget 20] [--jobs n] [--strict]
//
// Signals, not verdicts: a bot that can't win a word puzzle doesn't mean people can't. The PR check
// shows them as warnings, except "goal not reached" on thinking games (a tag with Puzzle, Word, Logic,
// Memory, Strategy...), which is only a note. It fails on errors, on a goal reached by doing nothing, and (--strict) on
// a goal the bot never reached.
const { chromium, devices } = require('playwright');
const { jobs, pool } = require('./lib/pool.cjs');
(async () => {
  const argv = process.argv.slice(2), n = jobs(argv), strict = argv.includes('--strict');
  const bi = argv.indexOf('--budget'), budget = bi >= 0 ? +argv[bi + 1] * 1000 : 20000;
  const ids0 = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--budget' && argv[i - 1] !== '--jobs');
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
  const rows = []; let failed = 0, spare = first;
  const gh = !!process.env.GITHUB_ACTIONS;
  await pool(ids, n, async () => { const w = spare || await open(); spare = null; return w; }, async (w, id) => {
    const { p } = w; w.errs = [];
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(300);
    // a game whose kit loads on first use (physics, 3D...) needs it in before the bot can play
    await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 }).catch(() => {});
    let rep;
    try { rep = await p.evaluate(([id, budget]) => __gs.playtest(id, { budget }), [id, budget]); }
    catch (e) { rep = { id, errors: [String(e.message || e).split('\n')[0]] }; }
    const errs = [...new Set([...(rep.errors || []), ...w.errs])];
    const flags = [];
    if (errs.length) flags.push('ERRORS');
    if (rep.idleWin) flags.push('goal-with-no-input');
    else if (rep.idleScore > 0) flags.push('scores-with-no-input');
    // thinking games (puzzles, words, memory...: the game's tag says so): the bot can't solve them, so
    // not reaching the goal is a note, not a warning
    const notes = [];
    if (rep.reached === false) (rep.thinking ? notes : flags).push(rep.thinking ? 'goal not reached (a thinking game: the bot can\'t solve these, so this means nothing)' : 'goal-not-reached');
    if (rep.reached && rep.goalAt < 5) flags.push('goal-in-under-5s');
    if (rep.randomWin) flags.push('random-taps-win');
    const bad = errs.length || rep.idleWin || (strict && rep.reached === false && !rep.thinking);
    if (bad) failed++;
    const line = `${bad ? 'FAIL' : flags.length ? 'WARN' : ' ok '} ${id.padEnd(16)} goal ${String(rep.goal).padStart(5)}  ${rep.reached ? `reached at ${rep.goalAt}s` : `best ${rep.best}`}`
      + `  (played to ${rep.playedTo}s; ${rep.evals} rounds tried)${flags.length ? '  ' + flags.join(', ') : ''}${notes.length ? '  note: ' + notes.join(', ') : ''}`;
    console.log(line); for (const e of errs) console.log('      ' + e);
    if (gh && flags.length) console.log(`::${bad ? 'error' : 'warning'} file=src/games/${id}.js::playtest bot: ${flags.join(', ')} (${rep.reached ? 'goal at ' + rep.goalAt + ' s' : 'best ' + rep.best + ' of ' + rep.goal})`);
    rows.push({ ...rep, flags: [...flags, ...notes.map(() => 'thinking game')] });
  });
  if (process.env.GITHUB_STEP_SUMMARY) require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### AI playtester\n\n| game | goal | reached | best | played to | flags |\n|---|---|---|---|---|---|\n${rows.map(r => `| ${r.id} | ${r.goal} | ${r.reached ? r.goalAt + ' s' : 'no'} | ${r.best ?? '-'} | ${r.playedTo ?? '-'} s | ${r.flags.join(', ')} |`).join('\n')}\n`);
  await server.close();
  console.log(failed ? `${failed} failed` : 'playtest ok');
  process.exit(failed ? 1 : 0);
})();
