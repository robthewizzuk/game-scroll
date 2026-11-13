// Where the shared code's time, garbage and hitches go, across many games at once: plays each game with
// random input under a CPU profile and an allocation sampler, then adds up, over all the games played,
// the time and memory of each engine function (src/kit, src/*.js and libraries; the games' own code is
// listed apart) and the long stretches of busy main thread ("hitches") with the engine function under them.
// A kit function that is a little slow in fifty games matters more than one game's own slow code.
//   node scripts/kit-hot.cjs [id ...] [--era 2d|pocket|console|nextgen|ar|board|3d|all] [--secs 5] [--jobs 3]
//                            [--json out.json] [--vs base.json] [--top 40] [--hitch 34] [--gpu]
// It runs the dev server (real names and lines), so no build is needed. Code time only: the software
// renderer here says nothing about a phone's graphics chip.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { jobs, pool } = require('./lib/pool.cjs');
(async () => {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
  const secs = +opt('--secs', 5), out = opt('--json'), vs = opt('--vs'), top = +opt('--top', 40), era = opt('--era', '2d'), hitchMs = +opt('--hitch', 34);
  const gpu = argv.includes('--gpu'), n = jobs(argv, era === '2d' || era === 'pocket' ? 'light' : 'heavy');
  const ids0 = argv.filter(a => !a.startsWith('--'));
  const port = +(process.env.PORT || 4211);
  const vite = await import('vite');
  const server = await vite.createServer({ mode: 'bundled', server: { port, hmr: false, watch: null }, logLevel: 'error' });
  await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const open = async () => {
    const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-precise-memory-info'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), w = { b, p, cdp, errs: [] };
    p.on('pageerror', e => w.errs.push(e.message));
    await p.goto(`http://localhost:${port}/`); await p.waitForFunction(() => window.__gs, null, { timeout: 180000 }); await p.waitForTimeout(400);
    if (gpu) await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); await window.__gpu.ready(); });
    return w;
  };
  const first = await open();
  const ERAS = { '2d': g => !g.retro, pocket: g => g.retro && ['advance', 'color', undefined].includes(g.era), console: g => g.era === 'console', nextgen: g => g.era === 'nextgen', ar: g => g.era === 'ar', board: g => g.era === 'board', '3d': g => ['console', 'nextgen', 'ar', 'board'].includes(g.era), all: () => true };
  const ids = ids0.length ? ids0 : await first.p.evaluate(src => { const f = new Function('return ' + src)(); return __gs.GAMES.filter(f).map(g => g.id); }, ERAS[era].toString());
  console.log(`${ids.length} games, ${secs} s each, ${n} at once`);
  const per = {};
  let spare = first;
  await pool(ids, n, async () => { const w = spare || await open(); spare = null; return w; }, async (w, id) => {
    const { p, cdp } = w; w.errs = [];
    try {
      await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
      await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 90000 }).catch(() => {});
      await p.evaluate(() => __gs.start()); await p.waitForTimeout(700);
      const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
      await p.evaluate(() => { const T = window.__hot = { gaps: [], last: 0 }; const tick = t => { if (window.__hot !== T) return; if (T.last) T.gaps.push(t - T.last); T.last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await cdp.send('Profiler.start');
      const t0 = Date.now(); let rounds = 0;
      while (Date.now() - t0 < secs * 1000) {
        if (await p.evaluate(() => __gs.active.state !== 'playing')) { await p.evaluate(() => __gs.start()).catch(() => {}); rounds++; }
        const x = r.x + Math.random() * r.w, y = r.y + Math.random() * r.h;
        await p.mouse.move(x, y); await p.mouse.down();
        await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 4 });
        await p.waitForTimeout(40 + Math.random() * 160); await p.mouse.up(); await p.waitForTimeout(Math.random() * 100);
      }
      const wall = (Date.now() - t0) / 1000;
      const prof = (await cdp.send('Profiler.stop')).profile;
      const al = (await cdp.send('HeapProfiler.stopSampling')).profile;
      const gaps = await p.evaluate(() => { const g = window.__hot.gaps; window.__hot = null; return g; });
      per[id] = { wall, rounds, ...cpu(prof, hitchMs), alloc: allocs(al), gaps: gapStats(gaps), errs: [...new Set(w.errs)].slice(0, 3) };
      const g = per[id];
      console.log(`${id.padEnd(18)} busy ${(100 * g.busy / g.span).toFixed(0).padStart(3)}%  engine ${(g.engMs / wall).toFixed(0).padStart(4)} ms/s  game ${(g.gameMs / wall).toFixed(0).padStart(4)} ms/s  gc ${(g.gcMs / wall).toFixed(0).padStart(3)} ms/s  alloc ${(g.alloc.total / 1048576 / wall).toFixed(2)} MB/s  hitches ${g.hitches.length}  frames>50ms ${g.gaps.over50}${g.errs.length ? '  ERR ' + g.errs[0].slice(0, 80) : ''}`);
    } catch (e) { console.log(`${id.padEnd(18)} skipped: ${e.message.split('\n')[0]}`); }
  }, w => w.b.close());
  await server.close();
  report(per, top, vs && JSON.parse(fs.readFileSync(vs, 'utf8')));
  if (out) fs.writeFileSync(out, JSON.stringify(per));
  process.exit(0);
})();

// which part of the code a profile frame belongs to
function where(f) {
  const url = (f.url || '').replace(/\?.*$/, ''), at = url.indexOf('/src/'), nm = url.lastIndexOf('/node_modules/');
  if (at >= 0) { const file = url.slice(at + 1); return { file, kind: file.startsWith('src/games/') ? 'game' : 'engine' }; }
  if (nm >= 0) return { file: url.slice(nm + 14).replace(/^\.vite\/deps\//, ''), kind: 'engine' };
  if (f.functionName === '(garbage collector)') return { file: '(gc)', kind: 'gc' };
  if (f.functionName === '(idle)') return { file: '(idle)', kind: 'idle' };
  return { file: '(browser)', kind: 'browser' };
}
const key = f => `${f.functionName || '(anonymous)'} ${where(f).file}:${f.lineNumber + 1}`;

function cpu(profile, hitchMs) {
  const byId = new Map(profile.nodes.map(x => [x.id, x])), parent = new Map();
  for (const x of profile.nodes) for (const c of x.children || []) parent.set(c, x.id);
  const self = {}, incl = {}, dt = profile.timeDeltas;
  let busy = 0, span = 0, engMs = 0, gameMs = 0, gcMs = 0;
  const stackOf = id => { const s = []; for (let q = id; q != null; q = parent.get(q)) s.push(byId.get(q)); return s; };
  const hitches = []; let run = null;
  const endRun = () => { if (run && run.ms >= hitchMs) { const best = Object.entries(run.incl).filter(([k]) => !/^(frame|\(anonymous\)) src\/main\.js/.test(k) && !k.includes('(root)') && !k.startsWith('(program)')).sort((a, b) => b[1] - a[1]); const own = Object.entries(run.self).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => [k, v / 1000]); hitches.push({ ms: run.ms, under: best.slice(0, 6).map(([k, v]) => [k, v / 1000]), own }); } run = null; };
  profile.samples.forEach((sid, i) => {
    const t = (dt[i + 1] ?? dt[i] ?? 0) / 1; span += t;
    const x = byId.get(sid); if (!x) return;
    const w = where(x.callFrame);
    if (w.kind === 'idle') { endRun(); return; }
    busy += t; if (w.kind === 'gc') gcMs += t; else if (w.kind === 'game') gameMs += t; else if (w.kind === 'engine') engMs += t;
    const k = key(x.callFrame); self[k] = (self[k] || 0) + t;
    const seen = new Set();
    for (const y of stackOf(sid)) { if (!y || where(y.callFrame).kind === 'browser' && y.callFrame.functionName !== '(garbage collector)') continue; const kk = key(y.callFrame); if (seen.has(kk)) continue; seen.add(kk); incl[kk] = (incl[kk] || 0) + t; }
    if (!run) run = { ms: 0, incl: {}, self: {} };
    run.ms += t / 1000; run.self[k] = (run.self[k] || 0) + t;
    for (const kk of seen) run.incl[kk] = (run.incl[kk] || 0) + t;
  });
  endRun();
  const ms = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / 1000]));
  return { busy: busy / 1000, span: span / 1000, engMs: engMs / 1000, gameMs: gameMs / 1000, gcMs: gcMs / 1000, self: ms(self), incl: ms(incl), hitches };
}
function allocs(profile) {
  const by = {}; let total = 0;
  const walk = x => { const own = x.selfSize || 0; total += own; if (own) { const k = key(x.callFrame); by[k] = (by[k] || 0) + own; } for (const c of x.children || []) walk(c); };
  walk(profile.head);
  return { total, by };
}
function gapStats(g) {
  const s = [...g].sort((a, b) => a - b), q = f => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0;
  return { n: g.length, p50: q(.5), p99: q(.99), max: s.length ? s[s.length - 1] : 0, over50: g.filter(x => x > 50).length };
}

function report(per, top, base) {
  const ids = Object.keys(per); if (!ids.length) return;
  const sum = (field, filter) => { const t = {}, games = {}; for (const id of ids) { const g = per[id], src = field === 'alloc' ? g.alloc.by : g[field]; for (const [k, v] of Object.entries(src)) { if (filter && !filter(k)) continue; const vv = field === 'alloc' ? v / 1024 / g.wall : v / g.wall; t[k] = (t[k] || 0) + vv; (games[k] ||= []).push([id, vv]); } } return [t, games]; };
  const eng = k => !k.includes(' src/games/') && !/^\((program|idle|root|garbage collector)\)/.test(k) && !k.includes('(browser)');
  const show = (title, [t, games], unit, fmt = v => v.toFixed(1)) => {
    console.log(`\n${title}`);
    for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, top)) {
      const gs = games[k].sort((a, b) => b[1] - a[1]);
      const was = base ? baseOf(base, title, k) : null;
      console.log(`${fmt(v).padStart(8)} ${unit}  ${String(gs.length).padStart(3)} games  ${k}${was != null ? `  (was ${fmt(was)})` : ''}   most: ${gs.slice(0, 3).map(([i, x]) => `${i} ${fmt(x)}`).join(', ')}`);
    }
  };
  const tot = f => ids.reduce((a, id) => a + f(per[id]) / per[id].wall, 0);
  console.log(`\nAll ${ids.length} games, per second of play, added up: engine ${tot(g => g.engMs).toFixed(0)} ms, games' own ${tot(g => g.gameMs).toFixed(0)} ms, GC ${tot(g => g.gcMs).toFixed(0)} ms, allocated ${(tot(g => g.alloc.total) / 1048576).toFixed(1)} MB`);
  show('Engine functions by own time (ms a second of play, summed over games)', sum('self', eng), 'ms/s', v => v.toFixed(2));
  show('Engine functions by time under them (ms/s)', sum('incl', k => eng(k) && !/^(frame|paint|runTicks) src\/main\.js/.test(k)), 'ms/s', v => v.toFixed(2));
  show('Engine functions by memory allocated (KB a second of play, summed over games)', sum('alloc', eng), 'KB/s', v => v.toFixed(0));
  show('Games\' own code by memory allocated (KB/s)', sum('alloc', k => k.includes(' src/games/')), 'KB/s', v => v.toFixed(0));
  // hitches: long busy stretches, by the engine function with the most time under it
  const H = {};
  for (const id of ids) for (const h of per[id].hitches) { const e = h.under.find(([k]) => eng(k)) || h.under[0]; const k = e ? e[0] : '(unknown)'; (H[k] ||= []).push([id, h.ms, h.own.map(o => o[0]).join(' | ')]); }
  console.log(`\nHitches (busy stretches of ${'34'}+ ms) by the engine function under them`);
  for (const [k, l] of Object.entries(H).sort((a, b) => b[1].length - a[1].length).slice(0, top)) console.log(`${String(l.length).padStart(4)} x  ${k}   e.g. ${l.slice(0, 3).map(([i, ms, own]) => `${i} ${ms.toFixed(0)} ms [${own}]`).join('; ')}`);
}
function baseOf(base, title, k) {
  let v = 0, any = false;
  for (const g of Object.values(base)) { const src = title.includes('memory') ? g.alloc.by : title.includes('under') ? g.incl : g.self; if (src[k] != null) { any = true; v += title.includes('memory') ? src[k] / 1024 / g.wall : src[k] / g.wall; } }
  return any ? v : 0;
}
