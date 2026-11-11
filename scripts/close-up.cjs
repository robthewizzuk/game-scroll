// The close-up look of gs.models.material() on WebGPU (hd3d-gpu.js recipeTwin, hd3d.js swapTwins): a floor
// the camera stands on must go on being drawn while its close-up shader is built and when it comes in, its
// far end must be as steady as the painted textures and look the same as them, and a panel held up to the
// camera must be sharper than them with its pattern in the same place. Draws scripts/close-up/ on WebGPU
// (SwiftShader's Vulkan driver here) three ways: materials on by the mesh's UVs, scattered, and laid on by
// position. Usage: node scripts/close-up.cjs [--shots <dir>] [--recipe planks] [--only uvs|scatter|solid] [--series]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf('--' + n); return i < 0 ? null : argv[i + 1]; };
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4188 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  // (sharper: how much more fine detail the close-up look must show on the panel. Scattered, four moved tiles
  // lie over each other, which blurs both looks. By position it isn't compared: there the baked look bends
  // its normals by the height picture's own texels, and that speckle counts as detail)
  const WAYS = [['uvs', 'on by the UVs', '', 1.5], ['scatter', 'scattered', '&scatter', 1.1], ['solid', 'laid on by position', '&solid=.75', 0]].filter(w => !opt('only') || w[0] === opt('only'));
  const f = n => n.toFixed(2), dir = opt('shots');
  let bad = 0;
  for (const [key, name, q, sharper] of WAYS) {
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(`http://localhost:4188/scripts/close-up/?${opt('recipe') ? 'recipe=' + opt('recipe') : ''}${q}`); await p.waitForFunction(() => window.result, null, { timeout: 300000 });
    const r = await p.evaluate(() => window.result);
    await p.close();
    console.log(`materials ${name}:`);
    if (r.error || errs.length) { console.log('FAIL', r.error || errs.join('\n')); bad++; continue; }
    if (dir) { fs.mkdirSync(dir, { recursive: true }); for (const k of ['near', 'baked']) fs.writeFileSync(path.join(dir, `close-up-${key}-${k}.png`), Buffer.from(r[k].split(',')[1], 'base64')); }
    if (argv.includes('--series')) console.log(r.series);
    const checks = [
      [r.backend === 'webgpu' && r.isNear && r.isFar, `drawn on ${r.backend}; the close-up look came in at frames ${r.at.join(', ')} (floor, post, panel) and went again with HD.closeUp = false`],
      [r.held === 0, `nothing waited hidden while the close-up shaders were built (most hidden in a frame: ${r.held})`],
      [r.off < r.first * .02, `the floor and the sky above it kept their brightness from the first frame to the close-up look: ${f(r.first)} out of 255, furthest from it ${f(r.off)} over ${r.frames} frames`],
      [r.farFlickNear < r.farFlickBaked * 1.25 + .15, `the far end of the floor is as steady as the painted textures when the picture moves by part of a pixel: ${f(r.farFlickNear)} against ${f(r.farFlickBaked)} out of 255`],
      [r.farApart < .5, `the far end of the floor looks the same as the painted textures: ${f(r.farApart)} out of 255 apart`],
      ...(sharper ? [[r.panelDetailNear > r.panelDetailBaked * sharper, `the panel at the camera is sharper than the painted textures: fine detail ${f(r.panelDetailNear)} against ${f(r.panelDetailBaked)}`]] : []),
      [r.panelAlike > .88, `the panel has every brick where the painted textures have it: ${f(r.panelAlike)} alike once both are blurred (1 is the same; upside down it is .82 or less)`],
    ];
    for (const [ok, text] of checks) { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${text}`); }
    console.log(`  (the frame a close-up look came in took ${r.slow.toFixed(0)} ms at most; a usual frame ${r.usual.toFixed(0)} ms)`);
  }
  await b.close(); await server.close();
  process.exit(bad ? 1 : 0);
})();
