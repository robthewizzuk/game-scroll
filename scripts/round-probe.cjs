// What a 3D game asks of the graphics chip in the middle of a round: shader text written, pipelines and
// shader modules made in a frame, textures uploaded (and how big), textures and buffers made, data sent
// each frame. Any of them in the middle of play is a frame that can stall on a phone. It starts the round
// the real way (Play, through the loading screen), then plays it with random input and lists the frames
// that did such work and what it was for.
//   node scripts/round-probe.cjs [ids...] [--secs 15] [--jobs 2] [--json out.json] [--quiet] [--console text]
//   --console text: also print the page's console lines that start with text (a console.log of your own while you look)
//   no ids: every Next Gen game (Console games too: name them). WebGPU only (the WebGL renderer is the kit's own, out of reach here).
// It runs the dev server, so the stacks name the kit's and the game's functions. The software renderer says
// nothing about how long the chip takes: read counts and main-thread time. An upload that takes long here is
// the main thread waiting on the chip's process: a canvas drawn on the chip has to be fetched from it.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { jobs, pool } = require('./lib/pool.cjs');
(async () => {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
  const secs = +opt('--secs', 15), out = opt('--json'), quiet = argv.includes('--quiet'), say = opt('--console');
  const n = jobs(argv, 'heavy'), ids0 = argv.filter(a => !a.startsWith('--'));
  const port = +(process.env.PORT || 4213);
  const vite = await import('vite');   // (the dev server: real names in the stacks)
  const server = await vite.createServer({ mode: 'bundled', server: { port, hmr: false, watch: null }, logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const open = async () => {
    const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(), w = { b, p, errs: [] };
    p.on('pageerror', e => w.errs.push(e.message));
    if (say) p.on('console', m => { const t = m.text(); if (t.startsWith(say)) console.log('  page: ' + t); });
    await p.goto(`http://localhost:${port}/`); await p.waitForFunction(() => window.__gs, null, { timeout: 120000 }); await p.waitForTimeout(300);
    await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); await window.__gpu.ready(); });
    return w;
  };
  const first = await open();
  const ids = ids0.length ? ids0 : await first.p.evaluate(() => __gs.GAMES.filter(g => g.era === 'nextgen').map(g => g.id));
  const all = {}; let spare = first;
  await pool(ids, n, async () => { const w = spare || await open(); spare = null; return w; }, async (w, id) => {
    const { p } = w; w.errs = [];
    try {
      await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
      await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 120000 }).catch(() => {});
      const t0 = Date.now();
      await p.evaluate(() => __gs.play());
      await p.waitForFunction(() => __gs.active.state === 'playing' && !__gs.active.starting, null, { timeout: 120000, polling: 100 }).catch(() => {});
      const ready = (Date.now() - t0) / 1000;
      await p.evaluate(TAP);
      const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
      const end = Date.now() + secs * 1000; let rounds = 0;
      while (Date.now() < end) {
        if (await p.evaluate(() => __gs.active.state !== 'playing' && !__gs.active.starting)) { await p.evaluate(() => __gs.play()).catch(() => {}); rounds++; }
        await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h); await p.mouse.down();
        await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 4 });
        await p.waitForTimeout(60 + Math.random() * 200); await p.mouse.up(); await p.waitForTimeout(Math.random() * 120);
      }
      const res = await p.evaluate(() => window.__rp.stop());
      res.ready = ready; res.rounds = rounds; res.errs = [...new Set(w.errs)].slice(0, 3);
      all[id] = res;
      print(id, res, quiet);
    } catch (e) { console.log(`${id}: skipped (${e.message.split('\n')[0]})`); }
  }, w => w.b.close());
  await server.close();
  if (out) fs.writeFileSync(out, JSON.stringify(all, null, 1));
  process.exit(0);
})();

function print(id, r, quiet) {
  const t = r.totals, per = k => (t[k] / r.secs).toFixed(1);
  console.log(`\n${id} (${r.backend}): ready in ${r.ready.toFixed(1)} s, ${r.frames} frames in ${r.secs.toFixed(0)} s, gap median ${r.med.toFixed(0)} ms, ${r.over2} frames over twice that`);
  console.log(`  in play, a second: shader text ${per('text')} (${(t.textMs / r.secs).toFixed(1)} ms), pipelines made in a frame ${per('pipe')}, shader modules ${per('module')}, compute pipelines ${per('compute')}, texture uploads ${per('upload')} (${(t.uploadBytes / r.secs / 1048576).toFixed(2)} MB, ${(t.uploadMs / r.secs).toFixed(1)} ms), textures made ${per('texMade')}, buffers made ${per('bufMade')} (${(t.bufBytes / r.secs / 1048576).toFixed(2)} MB), buffer writes ${(t.writeBytes / r.secs / 1048576).toFixed(2)} MB`);
  if (r.errs.length) console.log('  ERRORS: ' + r.errs.join(' | '));
  for (const x of r.slow || []) console.log(`  slow upload ${x.ms.toFixed(0)} ms: ${x.tex}\n      ${x.stack}`);
  if (quiet) return;
  const what = {};
  for (const f of r.work) for (const e of f.ev) { const k = e.k + ' ' + e.what; (what[k] ||= { n: 0, ms: 0, frames: new Set() }).n++; what[k].ms += e.ms || 0; what[k].frames.add(f.i); }
  const top = Object.entries(what).sort((a, b) => b[1].ms - a[1].ms || b[1].n - a[1].n).slice(0, 14);
  if (top.length) console.log('  what (times, main-thread ms, frames):\n' + top.map(([k, v]) => `    ${String(v.n).padStart(4)} x ${v.ms.toFixed(1).padStart(7)} ms in ${String(v.frames.size).padStart(3)} frames  ${k}`).join('\n'));
}

// In the page: taps on the chip's device, and three's shader text and texture uploads
const TAP = async () => {
  const view = window.__hdView; const now = () => performance.now();
  const R = { t0: now(), frames: [], ev: [], slow: [] };
  // where in the kit or the game it was asked for (the first few lines of ours on the stack)
  const from = () => { Error.stackTraceLimit = 60; const l = (new Error().stack || '').split('\n').filter(x => x.includes('/src/') && !x.includes('/node_modules/')).slice(1, 4); return l.map(x => x.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\/(src\/)?/, '').replace(/\?[^:)]*/, '').replace(/:\d+\)?$/, '').replace(/\)$/, '')).join(' < '); };
  const note = (k, what, ms, big) => R.ev.push({ t: now(), k, what: big ? what + '  @ ' + from() : what, ms });
  const undo = [];
  const wrap = (o, k, fn) => { if (!o || typeof o[k] !== 'function') return; const f = o[k]; o[k] = function (...a) { return fn.call(this, f, a); }; undo.push(() => { o[k] = f; }); };
  const label = ro => { const o = ro?.object, m = ro?.material || o?.material, g = o?.geometry; return o ? `${o.name || o.type}${o.isInstancedMesh ? '(x' + o.count + ')' : ''} ${m?.name || m?.type || ''}${g ? ' ' + (g.type || '') : ''} in ${o.parent?.name || o.parent?.type || '-'}${ro.scene?.name?.startsWith?.('Shadow') || ro.camera?.isOrthographicCamera && ro.context?.depthTexture && !ro.context?.textures?.length ? ' [shadow]' : ''} ctx=${ro.context?.stateKey || ''}` : ''; };
  // the shared WebGPU renderer (the WebGL one is the kit's own: not reachable from here); a Console game draws
  // with a renderer of its own on the same device (gpu.js consoleGPU), whose shader text and render objects are its own
  let r = view && (view._gpuChain?.r || view._gpuBakeChain?.r) || null;
  if (__gs.active?.def?.era === 'console') r = (await import('/src/kit/gpu.js')).consoleGPU()?.r || r;
  if (!r && window.__gpu) r = (await window.__gpu.ready())?.r || null;
  const totals = { text: 0, textMs: 0, pipe: 0, module: 0, compute: 0, upload: 0, uploadBytes: 0, uploadMs: 0, texMade: 0, bufMade: 0, bufBytes: 0, writeBytes: 0 };
  if (r && r.backend?.device) {
    const dev = r.backend.device, q = dev.queue;
    wrap(dev, 'createShaderModule', (f, a) => { totals.module++; note('shader module', a[0]?.label || '', 0); return f.apply(dev, a); });
    wrap(dev, 'createRenderPipeline', (f, a) => { const t = now(), x = f.apply(dev, a); totals.pipe++; note('pipeline in frame', a[0]?.label || '', now() - t, true); return x; });
    wrap(dev, 'createComputePipeline', (f, a) => { const t = now(), x = f.apply(dev, a); totals.compute++; note('compute pipeline in frame', a[0]?.label || '', now() - t, true); return x; });
    wrap(dev, 'createTexture', (f, a) => { const s = a[0]?.size, w = s?.width ?? s?.[0], h = s?.height ?? s?.[1] ?? 1; totals.texMade++; if (w * h >= 256 * 256) note('texture made', `${w}x${h} ${a[0]?.format}`, 0, true); return f.apply(dev, a); });
    wrap(dev, 'createBuffer', (f, a) => { totals.bufMade++; totals.bufBytes += a[0]?.size || 0; if ((a[0]?.size || 0) >= 1 << 18) note('buffer made', `${((a[0].size) / 1048576).toFixed(2)} MB`, 0); return f.apply(dev, a); });
    wrap(q, 'writeBuffer', (f, a) => { totals.writeBytes += a[4] ?? (a[2]?.byteLength ?? 0) - (a[3] || 0); return f.apply(q, a); });
    wrap(q, 'writeTexture', (f, a) => { const s = a[3], w = s?.width ?? s?.[0], h = s?.height ?? s?.[1] ?? 1; totals.uploadBytes += w * h * 4; return f.apply(q, a); });
    wrap(q, 'copyExternalImageToTexture', (f, a) => { const s = a[2], w = s?.width ?? s?.[0], h = s?.height ?? s?.[1] ?? 1; totals.uploadBytes += w * h * 4; return f.apply(q, a); });
    // three's own: which texture is being sent up, and how long the send took on the main thread
    const be = r.backend;
    wrap(be, 'updateTexture', (f, a) => { const t = now(), x = f.apply(be, a), tx = a[0], im = tx?.image; totals.upload++; totals.uploadMs += now() - t; if (now() - t > 30) { Error.stackTraceLimit = 40; R.slow.push({ ms: now() - t, tex: `${tx?.name || ''} ${tx?.constructor?.name} ${im?.width}x${im?.height} ${im?.constructor?.name} v${tx?.version} pack=${tx?.userData?.gsPack || ''} flipY=${tx?.flipY} mips=${tx?.generateMipmaps}`, stack: (new Error().stack || '').split('\n').slice(2, 26).map(l => l.trim().replace(/\(?https?:\/\/[^/]+\//, '(').replace(/\?[^:)]*/, '')).join('\n      ') }); } note('texture upload', `${tx?.name || tx?.constructor?.name || ''} ${im?.width || '?'}x${im?.height || '?'}${tx?.userData?.gsPack ? ' (packed later)' : ''}`, now() - t, (im?.width || 0) * (im?.height || 0) >= 4096); return x; });
    // shader text: three's node builder writing a new shader (main-thread work)
    const N = r._nodes, cache = N?.nodeBuilderCache;
    if (N?.getForRender && cache && typeof cache.size === 'number') wrap(N, 'getForRender', (f, a) => { const n = cache.size, t = now(), x = f.apply(N, a), ms = now() - t; if (cache.size > n) { totals.text++; totals.textMs += ms; note('shader text', label(a[0]), ms, true); } return x; });
  }
  let on = true; const tick = t => { if (!on) return; R.frames.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  window.__rp = { stop() {
    on = false; for (const u of undo) u();
    const fr = R.frames, gaps = fr.slice(1).map((t, i) => t - fr[i]), med = [...gaps].sort((a, b) => a - b)[gaps.length >> 1] || 0;
    // events by the frame they happened in (between two frame starts)
    const work = []; let j = 0;
    for (let i = 0; i + 1 < fr.length; i++) { const ev = []; while (j < R.ev.length && R.ev[j].t < fr[i + 1]) { if (R.ev[j].t >= fr[i]) ev.push(R.ev[j]); j++; } if (ev.length) work.push({ i, gap: gaps[i], ev }); }
    const secs = (now() - R.t0) / 1000;
    return { slow: R.slow.slice(0, 4), backend: r?.backend?.device ? 'webgpu' : 'webgl', secs, frames: fr.length, med, over2: gaps.filter(g => g > 2 * med).length, totals, work };
  } };
};
