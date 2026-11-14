// What a frame asks of WebGPU, counted: passes (what each draws into, in which format, and whether it loads,
// clears, keeps or throws away each picture), submits, buffer and texture uploads, bind groups made, draws.
// It flies one engine test scene (scripts/detail-test/probe.html, as scene-probe.cjs does) with every WebGPU
// call counted in the page. Counts are the same on any chip, so the software renderer here can say them;
// what they cost on a phone is for the frame lab.
//   node scripts/gpu-calls.cjs [--q "scene=town&mode=on&frames=40&tier=2"] [--passes] [--uploads] [--json file]
//   npm run build:bundled && node scripts/gpu-calls.cjs --game <id> [--seconds 3] [--wait 6] [--tier 0..3]   (a real game, Console ones too, tapped at random)
//   --passes: every pass of the last frame, in order (--who: and the kit code that asked for it)   --uploads: the buffers written most, by label
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

// runs in the page before anything else: wraps the WebGPU classes' methods
function tapPage() {
  const S = window.__gpuCalls = { on: false, frames: 0, n: {}, bytes: {}, passes: [], last: [], uploads: new Map(), binds: new Map(), reset() { this.frames = 0; this.n = {}; this.bytes = {}; this.uploads = new Map(); this.binds = new Map(); this.passes = []; this.last = []; } };
  const add = (k, v = 1) => { if (S.on) S.n[k] = (S.n[k] || 0) + v; }, bytes = (k, v) => { if (S.on) S.bytes[k] = (S.bytes[k] || 0) + v; };
  const wrap = (C, names, fn) => { if (!C) return; for (const k of names) { const f = C.prototype[k]; if (typeof f !== 'function') continue; C.prototype[k] = function (...a) { const out = f.apply(this, a); try { fn(k, a, this, out); } catch (_) { /* counting must never break the page */ } return out; }; } };
  const G = window;
  // who asked for a pass: the first few callers that are not three's own (file:line of the kit's code)
  const who = force => { if (!force && (!S.on || !S.who)) return ''; const st = String(new Error().stack).split('\n').slice(3).map(l => (/at (?:async )?(\S+) \(.*\/([^/?]+)(?:\?[^:]*)?:(\d+):\d+\)/.exec(l) || /at ()().*\/([^/?]+)(?:\?[^:]*)?:(\d+):\d+/.exec(l) || []).slice(1)).filter(a => a.length && !/three|chunk-|node_modules/.test(a[1] || a[2] || '')); return st.slice(0, force ? 7 : 4).map(a => `${a[0] || ''}@${a[1] || a[2]}:${a[2] && a[1] ? a[2] : ''}`).join(' < '); };
  wrap(G.GPUTexture, ['createView'], (k, a, tex, view) => { view.__tex = tex; add('createView'); });
  const pic = v => { const t = v?.__tex || v; return t && t.format ? `${t.width}x${t.height} ${t.format}${t.sampleCount > 1 ? ' x' + t.sampleCount : ''}` : '?'; };
  wrap(G.GPUCommandEncoder, ['beginRenderPass'], (k, [d], enc, pass) => {
    add('renderPass');
    const p = { kind: 'render', label: d.label || enc.label || '', colour: (d.colorAttachments || []).filter(Boolean).map(c => `${pic(c.view)} ${c.loadOp}/${c.storeOp}${c.resolveTarget ? ' resolve' : ''}`), depth: d.depthStencilAttachment ? `${pic(d.depthStencilAttachment.view)} ${d.depthStencilAttachment.depthLoadOp || '-'}/${d.depthStencilAttachment.depthStoreOp || '-'}` : '', draws: 0, bundles: 0, ts: !!d.timestampWrites, who: who() };
    for (const c of d.colorAttachments || []) if (c) { add('colour ' + c.loadOp + '/' + c.storeOp); const t = c.view?.__tex; if (t && S.on) { const bpp = /32float/.test(t.format) ? (/^rgba/.test(t.format) ? 16 : /^rg/.test(t.format) ? 8 : 4) : /16float|16unorm/.test(t.format) ? (/^rgba/.test(t.format) ? 8 : /^rg/.test(t.format) ? 4 : 2) : /^r8/.test(t.format) ? 1 : /^rg8/.test(t.format) ? 2 : 4; bytes('written ' + t.format, t.width * t.height * bpp * (t.sampleCount || 1)); if (c.loadOp === 'load') bytes('loaded', t.width * t.height * bpp * (t.sampleCount || 1)); } }
    if (d.depthStencilAttachment) add('depth ' + (d.depthStencilAttachment.depthLoadOp || '-') + '/' + (d.depthStencilAttachment.depthStoreOp || '-'));
    pass.__p = p; if (S.on) S.passes.push(p);
  });
  wrap(G.GPUCommandEncoder, ['beginComputePass'], (k, [d], enc, pass) => { add('computePass'); const p = { kind: 'compute', label: d?.label || enc.label || '', dispatches: 0 }; pass.__p = p; if (S.on) S.passes.push(p); });
  wrap(G.GPUCommandEncoder, ['copyTextureToTexture', 'copyBufferToBuffer', 'copyTextureToBuffer', 'copyBufferToTexture', 'resolveQuerySet', 'finish'], k => add(k));
  wrap(G.GPURenderPassEncoder, ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect'], (k, a, pass) => { add(k); add('draws'); if (pass.__p) pass.__p.draws++; });
  wrap(G.GPURenderPassEncoder, ['executeBundles'], (k, [list], pass) => { add('executeBundles'); add('bundles run', list?.length || 0); if (pass.__p) pass.__p.bundles += list?.length || 0; });
  wrap(G.GPURenderPassEncoder, ['setPipeline', 'setBindGroup', 'setVertexBuffer', 'setIndexBuffer', 'setViewport', 'setScissorRect', 'setStencilReference', 'setBlendConstant'], k => add('pass.' + k));
  wrap(G.GPURenderBundleEncoder, ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect'], k => add('bundle record ' + k));
  wrap(G.GPUComputePassEncoder, ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect'], (k, a, pass) => { add('dispatch'); if (pass.__p) pass.__p.dispatches++; });
  wrap(G.GPUComputePassEncoder, ['setPipeline', 'setBindGroup'], k => add('compute.' + k));
  wrap(G.GPUQueue, ['submit'], (k, [list]) => { add('submit'); add('command buffers', list?.length || 0); });
  wrap(G.GPUQueue, ['writeBuffer'], (k, [buf, off, data, dOff, size]) => {
    add('writeBuffer'); const el = data.BYTES_PER_ELEMENT || 1, n = size != null ? size * el : (data.byteLength - (dOff || 0) * el); bytes('writeBuffer', n);
    if (S.on) { const key = (buf.label || '(no label)').replace(/\d+/g, '#') + ' [' + buf.size + ']'; const u = S.uploads.get(key) || { n: 0, bytes: 0 }; u.n++; u.bytes += n; S.uploads.set(key, u); }
  });
  wrap(G.GPUQueue, ['writeTexture', 'copyExternalImageToTexture'], k => add(k));
  wrap(G.GPUDevice, ['createBindGroup'], (k, [d], dev) => { S.dev = dev; add('createBindGroup'); if (S.on) { const key = (d.label || '(no label)').replace(/\d+/g, '#'); S.binds.set(key, (S.binds.get(key) || 0) + 1); } });
  wrap(G.GPUDevice, ['createBuffer', 'createTexture', 'createSampler', 'createShaderModule', 'createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync', 'createCommandEncoder', 'createRenderBundleEncoder', 'createQuerySet', 'createBindGroupLayout', 'createPipelineLayout'], k => add(k));
  // big buffers and textures, whenever they are made (getting ready too): what, how big, and who asked
  S.big = [];
  wrap(G.GPUDevice, ['createBuffer'], (k, [d]) => { if (d.size >= 48 << 20) S.big.push(`buffer ${(d.size / 1048576).toFixed(0)} MB ${d.label || ''} <- ${String(new Error().stack).split('\n').slice(3, 22).map(l => l.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\/(?:.*\/)?([^/?]+)[^:]*:(\d+):\d+\)?/, '$1:$2')).join(' < ')}`); });
  wrap(G.GPUBuffer, ['mapAsync', 'getMappedRange', 'unmap', 'destroy'], k => add('buffer.' + k));
  wrap(G.GPUTexture, ['destroy'], () => add('texture.destroy'));
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = fn => raf(t => { if (S.on && S.passes.length) { S.frames++; S.last = S.passes; S.passes = []; } return fn(t); });   // (a frame: a refresh in which something was drawn)
}

(async () => {
  const argv = process.argv.slice(2), arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const q = arg('--q') || 'scene=town&mode=on&frames=40', game = arg('--game'), seconds = +(arg('--seconds') || 3);
  const vite = await import('vite');
  const port = +(process.env.PORT || 4196);
  const server = game ? await vite.preview({ preview: { port } }) : await vite.createServer({ server: { port, hmr: false, watch: null }, mode: 'bundled', logLevel: 'error' }); if (!game) await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const p = game ? await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })).newPage() : await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await p.addInitScript(tapPage);
  let run, out;
  const read = () => p.evaluate(() => { const S = window.__gpuCalls; S.on = false; const d = (window.__probeGpu || window.__gpu?.now?.())?.r?.backend?.device || S.dev; const H = d?.gsHold?.stats; return { hold: H ? { on: H.on, sent: H.sent - (S.sent0 || 0), held: H.held - (S.held0 || 0), why: H.why, names: H.names } : null, big: S.big, frames: S.frames, n: S.n, bytes: S.bytes, last: S.last, uploads: [...S.uploads], binds: [...S.binds], features: d ? [...d.features] : [], limits: d ? { maxColorAttachmentBytesPerSample: d.limits.maxColorAttachmentBytesPerSample, maxStorageBuffersPerShaderStage: d.limits.maxStorageBuffersPerShaderStage, maxSampledTexturesPerShaderStage: d.limits.maxSampledTexturesPerShaderStage, maxStorageBufferBindingSize: d.limits.maxStorageBufferBindingSize, maxBufferSize: d.limits.maxBufferSize } : null, format: navigator.gpu.getPreferredCanvasFormat() }; });
  if (game) {
    // a real game, played with no input for a few seconds (npm run build:bundled first)
    await p.goto(`http://localhost:${port}/`); await p.waitForFunction(() => window.__gs, null, { timeout: 30000 }); await p.waitForTimeout(400);
    await p.evaluate(id => __gs.only(id), game); await p.waitForTimeout(1500);
    if (arg('--tier') != null) await p.evaluate(t => { window.__hd.force = t; }, +arg('--tier'));
    const ok = await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); const G = await window.__gpu.ready(); await window.__toon?.ready(); return !!G; });
    await p.waitForTimeout(500);
    if (!ok) { console.log('FAIL WebGPU did not start in this browser'); process.exit(1); }
    await p.evaluate(id => __gs.only(id), game); await p.waitForTimeout(800); await p.evaluate(() => __gs.start()); await p.waitForTimeout(+(arg('--wait') || 6) * 1000);
    if (await p.evaluate(() => __gs.active.state) !== 'playing') { await p.evaluate(() => __gs.start()); await p.waitForTimeout(1500); }
    // taps at random while it counts (a game that waits for the first touch draws nothing new until then)
    const box = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const play = async ms => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(() => __gs.active.state) !== 'playing') await p.evaluate(() => __gs.start()); await p.mouse.move(box.x + Math.random() * box.w, box.y + Math.random() * box.h); await p.mouse.down(); await p.mouse.move(box.x + Math.random() * box.w, box.y + Math.random() * box.h, { steps: 3 }); await p.waitForTimeout(60 + Math.random() * 120); await p.mouse.up(); } };
    await play(1500);
    await p.evaluate(w => { const S = window.__gpuCalls; S.reset(); S.on = true; S.who = w; const H = ((window.__probeGpu || window.__gpu?.now?.())?.r?.backend?.device || S.dev)?.gsHold?.stats; if (H) { H.trace = true; H.why = {}; H.names = {}; S.sent0 = H.sent; S.held0 = H.held; } }, argv.includes('--who'));
    await play(seconds * 1000);
    if (process.env.DEBUG_CALLS) console.log('debug', JSON.stringify(await p.evaluate(() => ({ on: window.__gpuCalls.on, keys: Object.keys(window.__gpuCalls.n).length, frames: window.__gpuCalls.frames, passes: window.__gpuCalls.passes.length, state: __gs.active.state, id: __gs.active.def?.id, t: performance.now() }))));
    out = await read();
    run = await p.evaluate(() => ({ state: __gs.active.state, toon: window.__toon ? window.__toon.backend + ' ' + window.__toon.why : '', backend: window.__hd?.info.backend, why: window.__hd?.info.webgl || '', cpuMed: window.__hd?.info.cpu, tris: window.__hd?.info.tris, calls: window.__hd?.info.calls, rw: window.__hd?.info.rw, rh: window.__hd?.info.rh }));
    console.log('game ', game);
  } else {
    await p.goto(`http://localhost:${port}/scripts/detail-test/probe.html?gpu&${q}`);
    await p.waitForFunction(() => window.ready || window.result, null, { timeout: 600000 });
    const prep = await p.evaluate(() => window.prep());
    console.log('scene', JSON.stringify(prep));
    await p.evaluate(w => { const S = window.__gpuCalls; S.reset(); S.on = true; S.who = w; const H = ((window.__probeGpu || window.__gpu?.now?.())?.r?.backend?.device || S.dev)?.gsHold?.stats; if (H) { H.trace = true; H.why = {}; H.names = {}; S.sent0 = H.sent; S.held0 = H.held; } }, argv.includes('--who'));
    run = await p.evaluate(() => window.fly());
    out = await read();
  }
  console.log('run  ', JSON.stringify({ state: run.state, toon: run.toon, backend: run.backend, why: run.why, cpuMed: run.cpuMed, tris: run.tris, calls: run.calls, rw: run.rw, rh: run.rh }));
  const f = out.frames || 1, per = v => (v / f).toFixed(v / f >= 100 ? 0 : v / f >= 10 ? 1 : 2);
  console.log(`\na frame (mean of ${f}):`);
  for (const [k, v] of Object.entries(out.n).sort((a, c) => c[1] - a[1])) console.log(String(per(v)).padStart(9), k);
  console.log('\nbytes a frame:');
  for (const [k, v] of Object.entries(out.bytes).sort((a, c) => c[1] - a[1])) console.log(String((v / f / 1024).toFixed(1) + ' KB').padStart(12), k);
  if (argv.includes('--passes')) { console.log(`\nthe last frame's passes (${out.last.length}):`); out.last.forEach((s, i) => console.log(String(i).padStart(3), s.kind === 'compute' ? `compute  ${s.label}  dispatches ${s.dispatches}` : `render   ${s.label}  draws ${s.draws}${s.bundles ? ' bundles ' + s.bundles : ''}${s.who ? '   <- ' + s.who : ''}\n       ${s.colour.join('\n       ')}${s.depth ? '\n       depth ' + s.depth : ''}`)); }
  if (argv.includes('--uploads')) { console.log('\nbuffers written most (count, KB a frame, label [size]):'); for (const [k, u] of out.uploads.sort((a, c) => c[1].n - a[1].n).slice(0, 40)) console.log(String(per(u.n)).padStart(9), String((u.bytes / f / 1024).toFixed(2)).padStart(9), k); console.log('\nbind groups made most:'); for (const [k, n] of out.binds.sort((a, c) => c[1] - a[1]).slice(0, 20)) console.log(String(per(n)).padStart(9), k); }
  // one submit a frame (src/kit/submit.js): what asked for each early send, and for which buffer or picture
  if (out.hold) { console.log(`\nsubmits held and sent together (${out.hold.on ? 'on' : 'off'}): ${per(out.hold.sent)} sends a frame, ${per(out.hold.held)} command buffers a frame went with others; sent for:`); for (const [k, v] of Object.entries(out.hold.why).sort((a, c) => c[1] - a[1])) console.log(String(per(v)).padStart(9), k); if (argv.includes('--why')) for (const [k, v] of Object.entries(out.hold.names).sort((a, c) => c[1] - a[1]).slice(0, 40)) console.log(String(per(v)).padStart(9), '  ' + k); }
  if (out.big.length) { console.log('\nbig buffers made (48 MB and over):'); for (const l of out.big) console.log('  ' + l); }
  console.log('\ncanvas format the browser prefers:', out.format, '\nlimits:', JSON.stringify(out.limits), '\nfeatures:', out.features.sort().join(', '));
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ q, run, ...out }, null, 1));
  if (errs.length) console.log('\npage errors:\n' + [...new Set(errs)].slice(0, 12).join('\n'));
  await b.close(); await (server.close ? server.close() : new Promise(ok => server.httpServer.close(ok))); process.exit(0);
})();
