// Where the engine's own code time goes in one run of an engine test scene (src/detail-scenes.js):
// scripts/detail-test/probe.html flies the run while this takes a CPU profile of the page, then lists
// the functions by their own time and by the time spent under them, in milliseconds a frame.
//   node scripts/scene-probe.cjs [--webgpu] [--q "scene=square&mode=on&size=1&frames=120"] [--top 30] [--under name] [--long 60] [--prep]
//   node scripts/scene-probe.cjs --q "scene=village&mode=on" --count 1,2,3 [--height 1434]   (no flight: what cluster detail would draw in a picture that high)
// The software renderer here says nothing about a phone's chip; JavaScript time by function is what to read.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const q = arg('--q') || '', top = +(arg('--top') || 30), under = arg('--under');
  const vite = await import('vite');
  const port = +(process.env.PORT || 4188), server = await vite.createServer({ server: { port, hmr: false, watch: null }, mode: 'bundled', logLevel: 'error' }); await server.listen();   // (files are not watched: an edit while a run is on would load the page again)
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); else if (m.text().startsWith('GRID')) console.log(m.text().slice(0, 4000)); });
  await p.goto(`http://localhost:${port}/scripts/detail-test/probe.html?${gpu ? 'gpu&' : ''}${q}`);
  await p.waitForFunction(() => window.ready || window.result, null, { timeout: 600000 });
  const prep = await p.evaluate(() => window.prep());
  console.log('scene', JSON.stringify(prep));
  if (argv.includes('--prep')) for (const e of await p.evaluate(() => window.prepEvents || [])) console.log('  prep:', e.slice(0, 400));
  if (arg('--count')) { console.log('cluster detail along the flight, by the pixels of error allowed:', JSON.stringify(await p.evaluate(([pxs, h]) => window.count(pxs, h), [arg('--count').split(',').map(Number), +(arg('--height') || 1434)]))); await b.close(); await server.close(); process.exit(0); }
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  const run = await p.evaluate(() => window.fly());
  const { profile } = await cdp.send('Profiler.stop');
  console.log('run  ', JSON.stringify(run));
  if (argv.includes('--long')) { const long = await p.evaluate(() => window.long); console.log(`\nframes that took long or made something (${long.length}):`); for (const f of long.slice(0, +(arg('--long') || 60) || 60)) console.log(' ', JSON.stringify(f).slice(0, 700)); }
  const frames = +(new URLSearchParams(q).get('frames') || 120);
  // the profile: each sample's stack, a function's own time and the time under it (once a sample, however deep it calls itself)
  const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const name = n => { const f = n.callFrame, file = (f.url || '').split('/').pop().split('?')[0]; return `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`; };
  const self = new Map(), incl = new Map(); let total = 0;
  profile.samples.forEach((id, i) => {
    const dt = (profile.timeDeltas[i] || 0) / 1000; total += dt;
    const seen = new Set(); let n = byId.get(id), first = true;
    while (n) { const k = name(n); if (first) { self.set(k, (self.get(k) || 0) + dt); first = false; } if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } n = byId.get(parent.get(n.id)); }
  });
  const show = (m, title, filter) => { console.log(`\n${title} (ms a frame, of ${frames} frames)`); [...m].filter(([k]) => !filter || filter(k)).sort((a, b) => b[1] - a[1]).slice(0, top).forEach(([k, v]) => console.log((v / frames).toFixed(3).padStart(9), k)); };
  const idle = k => /^\((idle|program|garbage collector)\)/.test(k);
  console.log(`\nprofile: ${(total / frames).toFixed(2)} ms a frame in all; idle ${((self.get('(idle) :1') || 0) / frames).toFixed(2)}, program ${((self.get('(program) :1') || 0) / frames).toFixed(2)}, gc ${((self.get('(garbage collector) :1') || 0) / frames).toFixed(2)}`);
  show(self, 'own time', k => !idle(k));
  show(incl, 'time under', k => !idle(k) && !/^\(root\)/.test(k));
  if (under) {
    // what is called from one function: the own time of everything under it
    const sub = new Map();
    profile.samples.forEach((id, i) => {
      const dt = (profile.timeDeltas[i] || 0) / 1000; let n = byId.get(id), inside = false; const leaf = name(byId.get(id));
      while (n) { if (name(n).startsWith(under + ' ')) { inside = true; break; } n = byId.get(parent.get(n.id)); }
      if (inside) sub.set(leaf, (sub.get(leaf) || 0) + dt);
    });
    show(sub, `own time under ${under}`);
  }
  if (errs.length) console.log('\npage errors:\n' + [...new Set(errs)].join('\n'));
  await b.close(); await server.close(); process.exit(0);
})();
