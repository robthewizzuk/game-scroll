// Speed budget: plays each game with random taps on a slowed-down CPU (about a mid-range phone) and
// fails a game whose frames take too long or whose memory keeps growing. When a game is over budget
// it names the functions that took the most time, with their file and line.
// Usage: node scripts/budget.cjs [id ...] [--json]   (no ids: every game; npm run speed <id> is the same).
// Runs the dev server, so the names and lines it reports are the real ones from your file.
//
// The speed report (every game, pass or fail): how much of the budget is left, the slowest frames
// (p99 and hitches), the lines of the game's own file that take the most time, the garbage it makes a
// second and the lines that make it (garbage is what makes a phone stop for a collection: hitches),
// memory growth, how long the card took to be ready, and for 3D games the draw calls, triangles and
// shaders a frame (counts, the same on a phone as here) against what low, mid and top phones take,
// with shaders built after the round started. Those are warnings with a fix each: only the frame time,
// a leak and a game that doesn't start fail. --json prints the report (the line after "SPEED_JSON").
// --lab <file>: the same advice from a frame lab recording on a phone (its Report file or Copy text; - reads stdin).
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
// What a game should keep under (warnings, not failures). Garbage: MB made a second on the slowed CPU's play.
// 3D, a frame: draw calls and triangles that a phone of each class keeps at 60 fps with the kit's effects on
// (estimates from the engine's own scenes and the usual guidance for phone chips; Console games draw simply,
// so they get the low phone's), and no shader built once the round is going (each one is a hitch on a phone).
const { PHONES, GARBAGE_MB_S, ADVICE, fromLab } = require('./lib/speed-advice.cjs');
const JSONOUT = process.argv.includes('--json');

// --lab <file>: advice from a frame lab recording made on a phone (its Report file or Copy summary; - reads stdin)
const LAB = process.argv.indexOf('--lab');
if (LAB > 0) {
  const fs = require('fs'), f = process.argv[LAB + 1];
  if (!f) { console.error('usage: node scripts/budget.cjs --lab <report.html | summary.txt | ->'); process.exit(2); }
  const r = fromLab(fs.readFileSync(f === '-' ? 0 : f, 'utf8'));
  if (JSONOUT) console.log(JSON.stringify(r));
  else {
    console.log(r.title || 'Frame lab recording');
    for (const l of r.facts) console.log('   ' + l);
    for (const w of r.warnings) console.log(`   WARN ${w.what}: ${w.text}`);
    if (!r.warnings.length) console.log('   nothing to fix in this recording');
  }
  process.exit(0);
}

const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const p95 = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * .95))]; };

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ mode: 'bundled', server: { port: 4186, hmr: false }, logLevel: 'error' }); await server.listen();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  await p.goto('http://localhost:4186/'); await p.waitForFunction(() => window.__gs, null, { timeout: 180000 }); await p.waitForTimeout(400);
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const ids = args.length ? args : await p.evaluate(() => __gs.GAMES.map(g => g.id));
  await cdp.send('Profiler.enable'); await cdp.send('HeapProfiler.enable');
  let failed = 0;
  // one 12-second play of a game: its p95 frame time, memory growth and profile
  async function measure(id) {
    const tLoad = Date.now();
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(300);
    // (up to a minute: a game with sculpted people makes them on its first load, before anything can be timed)
    for (let i = 0; i < 240 && await p.evaluate(() => !__gs.active || __gs.active.loading); i++) await p.waitForTimeout(250);
    const readyS = (Date.now() - tLoad) / 1000;
    const is3d = await p.evaluate(() => ['console', 'nextgen', 'ar', 'board'].includes(__gs.active?.def.era));
    await p.evaluate(() => __gs.start()); await p.waitForTimeout(200);
    // time the game's own update() and draw(); the game object is remade if a kit loads, so wrap again then
    await p.evaluate(() => {
      const T = window.__budget = { u: [], d: [], g: [] };
      const wrap = () => {
        const g = __gs.active.game; if (!g || g.__timed) return; g.__timed = true;
        for (const [k, l] of [['update', T.u], ['draw', T.d]]) { const f = g[k]; if (typeof f !== 'function') continue; g[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { l.push(performance.now() - t); } }; }
      };
      wrap(); T.iv = setInterval(wrap, 200);
      // the 3D's counts a frame (draw calls, triangles, shaders built so far), every quarter second
      T.gv = setInterval(() => { const g = __gs.gl3d?.(); if (g) T.g.push({ ...g, t: performance.now() }); if (!T.names0 && performance.now() - T.t0 > 1500) T.names0 = __gs.shaders?.(); }, 250);
      T.t0 = performance.now();
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
    await cdp.send('HeapProfiler.collectGarbage');
    const heap0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    // every allocation, sampled, also the ones already collected: the garbage a game makes and where
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }).catch(() => {});
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
    const heapProf = (await cdp.send('HeapProfiler.stopSampling').catch(() => null))?.profile;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('HeapProfiler.collectGarbage');
    const heap1 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    const T = await p.evaluate(() => { clearInterval(__budget.iv); clearInterval(__budget.gv); const t = window.__budget;
      // the shaders built after the first 1.5 s, by name (WebGL's list; three names them by material)
      const now = __gs.shaders?.() || [], left = [...(t.names0 || now)], newer = [];
      for (const n of now) { const i = left.indexOf(n); if (i >= 0) left.splice(i, 1); else newer.push(n); }
      return { u: t.u.slice(5), d: t.d.slice(5), g: t.g.map(x => ({ ...x, t: x.t - t.t0 })), newer }; });
    const frames = T.u.map((u, i) => u + (is3d ? 0 : (T.d[i] || 0)));
    const era = await p.evaluate(() => __gs.active?.def.era || (__gs.active?.def.retro ? 'pocket' : 'phone'));
    return { ms: p95(frames), p99: pct(frames, .99), frames, grow: (heap1 - heap0) / 1048576, n: T.u.length, secs, profile, heapProf, is3d, era, g: T.g, newShaders: T.newer, readyS };
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
    const rep = report(id, mid, limit, { ok, slow, leak, few });
    for (const l of rep.lines) console.log('   ' + l);
    if (JSONOUT) console.log('SPEED_JSON ' + JSON.stringify(rep.data));
  }
  console.log(failed ? `${failed} over budget` : 'all within budget');
  await b.close(); await server.close();
  process.exit(failed ? 1 : 0);
})();

// The speed report for one game's run: lines to print (advice included) and the same as data.
function report(id, r, limit, verdict) {
  const lines = [], warn = [], own = `src/games/${id}.js`;
  // each warning: what, the fact, the fix, and the line of the game to start at (when one is known)
  const W = (list, what, fact, fix, line) => list.push({ what, fact, fix, line, text: `${fact}. ${fix}` });
  const hitchMs = Math.max(2 * limit, FRAME_MS);
  const hitches = r.frames.filter(f => f > hitchMs).length;
  const left = Math.max(0, 1 - r.ms / limit);
  lines.push(`headroom: p95 ${r.ms.toFixed(1)} of ${limit.toFixed(1)} ms (${Math.round(left * 100)}% left), p99 ${r.p99.toFixed(1)} ms, ${hitches} slow frame${hitches === 1 ? '' : 's'} over ${hitchMs.toFixed(0)} ms in ${r.n}; card ready in ${r.readyS.toFixed(1)} s`);
  if (hitches > Math.max(2, r.n * .02)) W(warn, 'hitches', `${hitches} frames took over ${hitchMs.toFixed(0)} ms`, ADVICE.hitches + ' The slowest lines are where to look.', hotLines(r.profile, own)[0]?.line);
  const lines_ = hotLines(r.profile, own);
  if (lines_.length) lines.push(`slowest lines in ${own}: ` + lines_.map(h => `:${h.line} ${h.pct}%${h.fn ? ' (' + h.fn + ')' : ''}`).join(', '));
  const g = garbage(r.heapProf, own, r.secs);
  if (g) {
    const name = t => `${t.fn ? t.fn + '()' : 'the function'} at :${t.line}`;
    lines.push(`garbage: ${g.mbs.toFixed(1)} MB a second, ${Math.round(g.share * 100)}% from the game's own calls${g.top.length ? `; most in ${g.top.map(t => `${name(t)} ${t.pct}%`).join(', ')}` : ''}`);
    if (g.mbs * g.share > GARBAGE_MB_S) W(warn, 'garbage', `the game's calls make ${(g.mbs * g.share).toFixed(1)} MB of garbage a second (aim under ${GARBAGE_MB_S})${g.top.length ? ', most in ' + g.top.map(t => `${t.fn ? t.fn + '() at ' : ''}${own}:${t.line}`).join(', ') : ''}`, ADVICE.garbage, g.top[0]?.line);
  }
  lines.push(`memory: ${r.grow >= 0 ? '+' : ''}${r.grow.toFixed(1)} MB over ${r.secs.toFixed(0)} s of play`);
  let d3 = null;
  if (r.is3d && r.g.length) {
    const play = r.g.filter(x => x.calls > 0), avg = k => play.reduce((s, x) => s + x[k], 0) / (play.length || 1), max = k => Math.max(0, ...play.map(x => x[k]));
    const after = r.g.filter(x => x.t > 1500), built = after.length ? after[after.length - 1].programs - after[0].programs : 0;
    d3 = { calls: Math.round(avg('calls')), callsMax: max('calls'), tris: Math.round(avg('tris')), trisMax: max('tris'), programs: r.g[r.g.length - 1].programs, builtInPlay: built, textures: r.g[r.g.length - 1].textures, geometries: r.g[r.g.length - 1].geometries };
    const fits = Object.entries(PHONES).filter(([, b]) => d3.callsMax <= b.calls && d3.trisMax <= b.tris).map(([k]) => k);
    lines.push(`3D a frame: ${d3.calls} draw calls (most ${d3.callsMax}), ${Math.round(d3.tris / 1000)}k triangles (most ${Math.round(d3.trisMax / 1000)}k); ${d3.programs} shaders, ${d3.textures} pictures, ${d3.geometries} meshes; fits ${fits.length ? fits.join(', ') + ' phones' : 'no phone class'} (low ${PHONES.low.calls} / ${PHONES.low.tris / 1000}k, mid ${PHONES.mid.calls} / ${PHONES.mid.tris / 1000}k, top ${PHONES.top.calls} / ${PHONES.top.tris / 1000}k)`);
    const want = r.era === 'console' ? 'low' : 'mid', b = PHONES[want];
    if (d3.callsMax > b.calls) W(warn, 'draw calls', `${d3.callsMax} draw calls in a frame, over the ${want} phone's ${b.calls}`, ADVICE.calls);
    if (d3.trisMax > b.tris) W(warn, 'triangles', `${Math.round(d3.trisMax / 1000)}k triangles in a frame, over the ${want} phone's ${b.tris / 1000}k`, ADVICE.tris);
    const names = [...new Set(r.newShaders || [])].slice(0, 4);
    if (built > 0) W(warn, 'shaders in play', `${built} shader${built > 1 ? 's were' : ' was'} built after the round started${names.length ? ' (' + names.join(', ') + ')' : ''}`, ADVICE.shaders);
  }
  const fails = [];
  if (verdict.slow) W(fails, 'over budget', `the slow frames take ${r.ms.toFixed(1)} ms, over the ${limit.toFixed(1)} ms budget${lines_.length ? ', most at ' + lines_.slice(0, 3).map(h => `${own}:${h.line}${h.fn ? ' (' + h.fn + ')' : ''}`).join(', ') : ''}`, ADVICE.slow, lines_[0]?.line);
  if (verdict.leak) W(fails, 'memory grows', `memory grew ${r.grow.toFixed(0)} MB in ${r.secs.toFixed(0)} s`, ADVICE.leak);
  if (verdict.few) W(fails, 'too few frames', `only ${r.n} frames were played`, 'Did the game start? Run node scripts/smoke.cjs ' + id + ' to see.');
  for (const w of warn) lines.push(`WARN ${w.what}: ${w.text}`);
  return { lines, data: { id, ok: verdict.ok, slow: verdict.slow, leak: verdict.leak, few: verdict.few, ms: +r.ms.toFixed(2), budget: +limit.toFixed(2), left: +left.toFixed(2), p99: +r.p99.toFixed(2), hitches, frames: r.n, readyS: +r.readyS.toFixed(1), growMB: +r.grow.toFixed(1), garbageMBs: g ? +g.mbs.toFixed(2) : null, garbageOwn: g ? +g.share.toFixed(2) : null, garbageAt: g?.top || [], slowLines: lines_, d3, fails, warnings: warn } };
}
// The lines of the game's own file with the most samples (V8's line ticks), as a share of all the game file's time.
function hotLines(profile, own) {
  const by = new Map(); let total = 0;
  for (const n of profile.nodes) {
    const url = (n.callFrame.url || '').replace(/\?.*$/, '');
    if (!url.endsWith('/' + own)) continue;
    for (const t of n.positionTicks || []) { by.set(t.line, { n: (by.get(t.line)?.n || 0) + t.ticks, fn: n.callFrame.functionName }); total += t.ticks; }
  }
  return [...by].sort((a, b) => b[1].n - a[1].n).slice(0, 4).filter(([, v]) => v.n / (total || 1) >= .05).map(([line, v]) => ({ line, pct: Math.round(100 * v.n / total), fn: v.fn || undefined }));
}
// Garbage from the sampling heap profile (collected objects included): MB a second, and where in the game file.
function garbage(hp, own, secs) {
  if (!hp?.head) return null;
  let all = 0; const mine = new Map();
  // each allocation counts for the innermost function of the game's own file on its stack (a kit call the game
  // made counts for the game's line that called it)
  const walk = (n, inMine) => {
    const f = n.callFrame, url = (f.url || '').replace(/\?.*$/, '');
    const here = url.endsWith('/' + own) ? { line: f.lineNumber + 1, fn: f.functionName || '' } : inMine;
    const size = (n.selfSize || 0); all += size;
    if (here) { const k = here.line + ' ' + here.fn, m = mine.get(k) || { ...here, size: 0 }; m.size += size; mine.set(k, m); }
    for (const c of n.children || []) walk(c, here);
  };
  walk(hp.head, null);
  const ownAll = [...mine.values()].reduce((s, x) => s + x.size, 0);
  // (V8 gives the line a function starts on, so this names functions, not single lines)
  return { mbs: all / 1048576 / Math.max(1, secs), share: all ? ownAll / all : 0,
    top: [...mine.values()].sort((a, b) => b.size - a.size).slice(0, 3).filter(m => m.size / (ownAll || 1) >= .1).map(m => ({ line: m.line, fn: m.fn, pct: Math.round(100 * m.size / ownAll) })) };
}

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
