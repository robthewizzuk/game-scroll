// Loading without holding the feed still: how long each game's make() + first reset() keeps the main
// thread, in how many passes (src/kit/slices.js), and what went to the background workers (jobs.js).
// One fresh page per game, so nothing is warm: the first time a player meets the game.
// Usage: npm run build:bundled && node scripts/load-time.cjs [ids...] [--json file] [--vs file] [--passes]
//   no ids: every 3D game (Console, Next Gen, AR, Board)
//   --json file   save the numbers        --vs file   print the change against saved numbers
//   --passes      list each pass: its time, how much of it was the game's own code (run again every
//                 pass), how many heavy builds it did, and whether slicing was switched off (OFF)
// Env: CPU=4 slows the processor 4 times (like a mid-range phone); OUT=<folder> measures another build
// (one made before a change, say: it need not have slices.js at all).
// "worst" is the longest single run of make + reset: that is what a player scrolling past feels. The
// page opens on the game alone, on one card (?only=<id>), so the numbers are one card's and nothing
// else was made first. "ready" is from the start of the first pass until the card can be played;
// "longest task" is the page's longest main-thread task of any kind (the app starting up, the first
// frame drawn in software), there to compare runs. The headless browser has no graphics chip and the
// numbers move 10 to 20% between runs, so compare a run before a change with one after, not with a phone.
const { chromium, devices } = require('playwright');
const fs = require('fs');
(async () => {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const json = opt('--json'), vs = opt('--vs'), list = args.includes('--passes'), CPU = +(process.env.CPU || 1);
  let ids = args.filter(a => !a.startsWith('--'));
  const server = await (await import('vite')).preview({ preview: { port: 4189 }, ...(process.env.OUT ? { build: { outDir: require('path').resolve(process.env.OUT) } } : {}) });
  const b = await chromium.launch();
  const open = async (query = '') => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 }), p = await ctx.newPage();
    await p.addInitScript(() => {
      window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
      // when the one game asked for (?only=<id>) could first be played: noted in the page, as the test's own questions arrive late
      const id = (/[?&]only=([a-z0-9-]+)/.exec(location.search) || [])[1];
      if (id) { const iv = setInterval(() => { const a = window.__gs && window.__gs.active; if (a && a.def.id === id && (!a.loading || a.failed)) { window.__ready = performance.now(); clearInterval(iv); } }, 4); }
    });
    if (CPU > 1) await (await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await p.goto('http://localhost:4189/' + query); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 });
    return { ctx, p };
  };
  const first = await open();
  const sliced = await first.p.evaluate(() => !!__gs.passes);   // (a build from before slices.js is timed another way, below)
  if (!ids.length) ids = await first.p.evaluate(() => __gs.GAMES.filter(g => ['console', 'nextgen', 'ar', 'board'].includes(g.era)).map(g => g.id));
  await first.ctx.close();
  const rows = [];
  for (const id of ids) {
    // the feed starts on this game alone, on one card: nothing else is made beside it
    const { ctx, p } = await open(sliced ? '?only=' + id : '');
    try {
      if (!sliced) {
        // A build from before slices.js: time make() and the reset() after it on the first card that asks
        // (each card has its own api); the feed's other cards of the game get an empty stand-in. The six
        // games the page opened on were made first, so what they share with this one is already there.
        await p.waitForTimeout(300);
        await p.evaluate(id => {
          const def = __gs.GAMES.find(g => g.id === id), make = def.make, T = window.__runs = []; let card = null;
          def.make = api => {
            card ||= api; if (api !== card) return { reset() {}, update() {}, draw() {} };
            const t0 = performance.now(), run = { ms: 0, at: 0 }; T.push(run);
            try {
              const g = make(api), reset = g.reset.bind(g); let first = true;
              g.reset = () => { try { return reset(); } finally { if (first) { first = false; run.at = performance.now(); run.ms = run.at - t0; run.made = true; } } };
              return g;
            } catch (e) { run.at = performance.now(); run.ms = run.at - t0; throw e; }
          };
          __gs.only(id);
        }, id);
      }
      await p.waitForFunction(id => __gs.active && __gs.active.def.id === id && (!__gs.active.loading || __gs.active.failed), id, { timeout: 120000 });
      const r = await p.evaluate(id => ({ runs: __gs.passes ? __gs.passes.filter(x => x.id === id) : __runs, now: window.__ready || performance.now(), long: __long, failed: __gs.active.failed }), id);
      if (r.failed) throw new Error(r.failed);
      const last = r.runs[r.runs.length - 1] || {}, t0 = r.runs.length ? r.runs[0].at - r.runs[0].ms : r.now;
      rows.push({ id, makes: r.runs.length, total: Math.round(r.runs.reduce((a, x) => a + x.ms, 0)), worst: Math.round(Math.max(0, ...r.runs.map(x => x.ms))), ready: Math.round(r.now - t0), task: Math.round(Math.max(0, ...r.long)), jobs: last.waits || 0, off: r.runs.some(x => x.off),
        passes: r.runs.map(x => `${Math.round(x.ms)} ms` + (x.own == null ? '' : ` (the game's own code ${x.own.toFixed(1)}, built ${x.built}${x.waits ? ', ' + x.waits + ' with workers' : ''}${x.whole ? ', whole' : ''}${x.off ? ', OFF' : ''}${x.made ? ', made' : ''})`)) });
    } catch (e) { rows.push({ id, error: String(e.message || e).split('\n')[0].slice(0, 100) }); }
    await ctx.close();
  }
  await b.close(); server.httpServer.close();
  rows.sort((a, b) => (b.worst || 0) - (a.worst || 0));
  const old = vs ? Object.fromEntries(JSON.parse(fs.readFileSync(vs, 'utf8')).map(r => [r.id, r])) : null, was = (r, k) => old && old[r.id] && old[r.id][k] != null ? ` (was ${old[r.id][k]})` : '';
  console.log(`${rows.length} games${CPU > 1 ? `, ${CPU}x slower CPU` : ''}. worst: the longest single pass of make + reset on the main thread (ms); total: all its passes; ready: ms until the card can be played`);
  for (const r of rows) {
    if (r.error) { console.log(`${r.id.padEnd(20)} ERROR ${r.error}`); continue; }
    console.log(`${r.id.padEnd(20)} worst ${String(r.worst).padStart(5)}${was(r, 'worst')}  total ${String(r.total).padStart(5)}${was(r, 'total')}  passes ${String(r.makes).padStart(3)}  left with workers ${String(r.jobs).padStart(3)}  ready ${String(r.ready).padStart(5)}  longest task ${String(r.task).padStart(5)}${r.off ? '  (made in one go: its own code is the slow part)' : ''}`);
    if (list) for (const x of r.passes) console.log('    ' + x);
  }
  const ok = rows.filter(r => !r.error), sum = k => ok.reduce((a, r) => a + r[k], 0), over = n => ok.filter(r => r.worst > n).length;
  console.log(`all: total ${sum('total')} ms; games whose worst pass is over 100 ms: ${over(100)}, over 50 ms: ${over(50)}`);
  if (old) { const o = Object.values(old).filter(r => !r.error); console.log(`was: total ${o.reduce((a, r) => a + r.total, 0)} ms; over 100 ms: ${o.filter(r => r.worst > 100).length}, over 50 ms: ${o.filter(r => r.worst > 50).length}`); }
  if (json) fs.writeFileSync(json, JSON.stringify(rows.map(({ passes, ...r }) => r), null, 1));
  process.exit(rows.some(r => r.error) ? 1 : 0);
})();
