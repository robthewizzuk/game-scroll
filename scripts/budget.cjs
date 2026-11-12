// Speed budget: plays each game with random taps on a slowed-down CPU (about a mid-range phone) and
// fails a game whose frames take too long or whose memory keeps growing. When a game is over budget
// it names the functions that took the most time, with their file and line.
// Usage: node scripts/budget.cjs [id ...]   (no ids: every game). Runs the dev server, so the
// names and lines it reports are the real ones from your file.
//
// It times the game's own update() and draw() (for 3D games only update(): a headless browser draws
// 3D in software, far slower than a phone's GPU, so that time would say nothing about phones).
//
// Noise floor: shared CI machines vary, so the same code can land either side of the line. A game
// that is only a little over (up to NEAR x the budget) is played twice more: it fails when the
// middle of the three runs is still over, and the report gives the spread so you can tell a real
// slowdown from a noisy machine. Further over than that fails at once.
const { chromium, devices } = require('playwright');

const CPU_SLOWDOWN = 4;          // CI machines are several times faster than a mid-range phone
const FRAME_MS = 1000 / 60;
const BUDGET = {                 // per frame, on the slowed CPU, 95th percentile (the slow frames)
  frame: 0.75 * FRAME_MS,        // update + draw: leave a quarter of the frame for the app and the browser
  update3d: 0.5 * FRAME_MS,      // 3D games: game logic and physics only
  growMB: 40,                    // JavaScript memory still held after a minute of play (a leak)
};
const SECONDS = 12;
// A 3D game is drawn in software here, eight or nine pictures in those seconds on a test machine and fewer
// on a busy one, so how many updates get timed says how fast the machine draws, not whether the game
// started: it is played on (LONGEST seconds at most) until there are FEW of them to judge.
const FEW = 30, LONGEST = 40;
const NEAR = 1.5, RUNS = 3;

const p95 = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * .95))]; };

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ mode: 'bundled', server: { port: 4186, hmr: false }, logLevel: 'error' }); await server.listen();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  await p.goto('http://localhost:4186/'); await p.waitForFunction(() => window.__gs, null, { timeout: 180000 }); await p.waitForTimeout(400);
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : await p.evaluate(() => __gs.GAMES.map(g => g.id));
  await cdp.send('Profiler.enable'); await cdp.send('HeapProfiler.enable');
  let failed = 0;
  // one 12-second play of a game: its p95 frame time, memory growth and profile
  async function measure(id) {
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(300);
    // (up to a minute: a game with sculpted people makes them on its first load, before anything can be timed)
    for (let i = 0; i < 240 && await p.evaluate(() => !__gs.active || __gs.active.loading); i++) await p.waitForTimeout(250);
    const is3d = await p.evaluate(() => ['console', 'nextgen', 'ar', 'board'].includes(__gs.active?.def.era));
    await p.evaluate(() => __gs.start()); await p.waitForTimeout(200);
    // time the game's own update() and draw(); the game object is remade if a kit loads, so wrap again then
    await p.evaluate(() => {
      const T = window.__budget = { u: [], d: [] };
      const wrap = () => {
        const g = __gs.active.game; if (!g || g.__timed) return; g.__timed = true;
        for (const [k, l] of [['update', T.u], ['draw', T.d]]) { const f = g[k]; if (typeof f !== 'function') continue; g[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { l.push(performance.now() - t); } }; }
      };
      wrap(); T.iv = setInterval(wrap, 200);
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
    await cdp.send('HeapProfiler.collectGarbage');
    const heap0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    const box = await p.evaluate(() => { const r = __gs.active.canvas.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const t0 = Date.now(), end = t0 + SECONDS * 1000, last = t0 + LONGEST * 1000;
    const short = () => p.evaluate(n => __budget.u.length < n, FEW + 5);   // (the first five updates are not counted)
    while (Date.now() < end || Date.now() < last && await short()) {
      if (await p.evaluate(() => __gs.active.state !== 'playing')) { await p.evaluate(() => __gs.start()).catch(() => {}); }
      const x = box[0] + Math.random() * box[2], y = box[1] + Math.random() * box[3];
      await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(40 + Math.random() * 120); await p.mouse.up();
      await p.waitForTimeout(80 + Math.random() * 200);
    }
    const secs = (Date.now() - t0) / 1000;
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('HeapProfiler.collectGarbage');
    const heap1 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    const T = await p.evaluate(() => { clearInterval(__budget.iv); const t = window.__budget; return { u: t.u.slice(5), d: t.d.slice(5) }; });
    const frames = T.u.map((u, i) => u + (is3d ? 0 : (T.d[i] || 0)));
    return { ms: p95(frames), grow: (heap1 - heap0) / 1048576, n: T.u.length, secs, profile, is3d };
  }
  for (const id of ids) {
    const runs = [await measure(id)], { is3d } = runs[0];
    const limit = is3d ? BUDGET.update3d : BUDGET.frame;
    // a near miss: play it again, and judge the middle run
    if (runs[0].ms > limit && runs[0].ms <= limit * NEAR && runs[0].grow <= BUDGET.growMB && runs[0].n >= FEW)
      while (runs.length < RUNS) runs.push(await measure(id));
    const byMs = [...runs].sort((a, b) => a.ms - b.ms), mid = byMs[byMs.length >> 1];
    const { ms, grow, n, secs, profile } = mid, spread = byMs[byMs.length - 1].ms - byMs[0].ms;
    const slow = ms > limit, leak = grow > BUDGET.growMB, few = n < FEW;
    const ok = !slow && !leak && !few;
    if (!ok) failed++;
    const again = runs.length > 1 ? `  (middle of ${runs.length} runs: ${runs.map(r => r.ms.toFixed(1)).join(', ')} ms, spread ${spread.toFixed(1)})` : '';
    const line = `${ok ? 'PASS' : 'FAIL'} ${id.padEnd(16)} ${is3d ? 'update' : 'frame '} p95 ${ms.toFixed(1)} ms (budget ${limit.toFixed(1)})  memory +${grow.toFixed(1)} MB  frames ${n}${again}`;
    console.log(line);
    if (slow) console.log(`   over budget by ${(ms - limit).toFixed(1)} ms${runs.length > 1 ? `, runs spread ${spread.toFixed(1)} ms` : ''}`);
    if (few) console.log('   too few frames played to measure (did the game start?)');
    if (leak) console.log(`   memory grew ${grow.toFixed(0)} MB in ${secs.toFixed(0)} s: something is kept every frame or round (arrays that only grow, listeners added in reset()...)`);
    if (slow) for (const t of hot(profile)) console.log('   ' + t);
  }
  console.log(failed ? `${failed} over budget` : 'all within budget');
  await b.close(); await server.close();
  process.exit(failed ? 1 : 0);
})();

// The functions with the most time of their own, for the game file and the kit (not the browser).
function hot(profile) {
  const self = new Map(), dt = profile.timeDeltas, total = dt.reduce((s, x) => s + x, 0) || 1;
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  profile.samples.forEach((sid, i) => { const n = byId.get(sid); if (n) self.set(n, (self.get(n) || 0) + (dt[i] || 0)); });
  const sum = new Map();
  for (const [n, t] of self) {
    const f = n.callFrame, url = (f.url || '').replace(/\?.*$/, ''), at = url.indexOf('/src/');
    if (at < 0) continue;   // the browser, Vite or a library
    const file = url.slice(at + 1);
    const k = `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
    sum.set(k, (sum.get(k) || 0) + t);
  }
  const top = [...sum].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return top.length ? ['slowest parts:', ...top.map(([k, t]) => `  ${(100 * t / total).toFixed(0).padStart(3)}%  ${k}`)] : ['(no game code in the profile: the time is in the browser or a library)'];
}
