// A new kind of thing appearing mid-round: does the frame it appears in stop while its shader builds?
// Draws scripts/shader-hold/ with shaders built in the background (v.holdNew, the default) and in the
// frame (HD.hold = false), on WebGL or WebGPU, and prints how long that frame took and how many frames
// the thing waited. On WebGPU it also fails if a pipeline of the scene's own is made in the middle of a frame
// once the first frames are over (a thing switched on, the camera turning to what was behind it, the new thing
// once it shows). Usage: node scripts/shader-hold.cjs [--webgpu]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const gpu = process.argv.includes('--webgpu');
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4187, hmr: false, watch: null }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let bad = 0;
  for (const hold of [1, 0]) {
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(`http://localhost:4187/scripts/shader-hold/?hold=${hold}${gpu ? '&gpu' : ''}`); await p.waitForFunction(() => window.result, null, { timeout: 300000 });
    const r = await p.evaluate(() => window.result);
    if (r.error || errs.length) { console.log('FAIL', r.error || errs.join('\n')); bad++; await p.close(); continue; }
    let ok = hold ? r.heldAtFirst === 1 && r.stillHeld === 0 : r.heldAtFirst === 0;
    // WebGPU, built in the background: nothing of the scene's own is built in the middle of a frame after the first ones
    const none = !r.gpu || !hold || (r.late.length === 0 && r.newInFrame.length === 0);
    // ... nor is a shader's text written in one: the builds wrote it, under the key the frame looks it up by
    const kept = !r.gpu || !hold || (r.earlyText.length === 0 && r.lateText.length === 0 && r.newText.length === 0 && r.secondText.length === 0 && r.readyText.length === 3);
    if (!ok || !none || !kept) bad++;
    if (r.gpu) console.log(`${kept ? 'ok  ' : 'FAIL'} ${r.backend} ${hold ? 'built in the background' : 'built in the frame     '}: shader text written in the middle of a frame: ${r.earlyText.length} for the scene's things after the first frame (${r.earlyText.join(', ') || 'none'}), ${r.lateText.length} for things switched on or turned to (${r.lateText.join(', ') || 'none'}), ${r.newText.length} for the new thing (${r.newText.join(', ') || 'none'}), ${r.secondText.length} in a second view's frames after its first (${r.secondText.join(', ') || 'none'}); getting it ready wrote ${r.readyText.length} of its 3`);
    if (r.gpu) console.log(`${none ? 'ok  ' : 'FAIL'} ${r.backend} ${hold ? 'built in the background' : 'built in the frame     '}: pipelines made in the middle of a frame: ${r.late.length} for things switched on or turned to (${r.late.join(', ') || 'none'}; those frames ${r.shownMs.toFixed(0)} and ${r.turnedMs.toFixed(0)} ms, ${r.shownHeld} held), ${r.newInFrame.length} for the new thing (${r.newInFrame.join(', ') || 'none'}); shadow maps' own: ${r.lateShadow + r.newShadow}; the rest of the scene took ${r.aheadFrames} frames`);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.backend} ${hold ? 'built in the background' : 'built in the frame     '}: the frame it appears in ${r.first.toFixed(0)} ms, waited ${r.shownAfter} frames (${r.waitMs.toFixed(0)} ms), frames after ${r.after.toFixed(0)} ms`);
    await p.close();
  }
  await b.close(); await server.close();
  process.exit(bad ? 1 : 0);
})();
