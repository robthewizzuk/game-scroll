// Compares the upscalers on a fixed Next Gen scene: plain stretch, SGSR 1 and SGSR 2, each drawn at
// 1/scale size and upscaled, scored against the same frames drawn at twice the size and scaled down
// (ref). error: mean difference out of 255 over the last 8 frames, lower is closer. flicker: change
// from frame to frame over them; ref's own is what the motion itself changes, so with nothing moving
// lower is steadier, and in motion more than ref is crawl and less is blur. ms: time per frame in
// this software-rendered browser, a rough guide to cost only. Also SGSR 2 at full size as
// anti-aliasing (aa) against the plain full-size picture (native), with nothing moving, the camera
// moving, and a box moving. Each SGSR 2 run is drawn twice: with our changes to Qualcomm's shader and
// without (-plain), and the run fails if ours come out worse.
// Last, the same with the ground and three walls in tiling textures: on WebGPU SGSR 2 reads textures as
// the screen's size would (hd3d-gpu.js sharpMips), drawn here with that and without (-soft), and the run
// fails unless the sharper textures come out clearly closer to the reference.
// No film grain is drawn here (it is most of the error otherwise, and SGSR 2 averaging it away looks
// like a better picture); --grain .035 puts the app's back.
//   node scripts/upscale-compare.cjs [--scale 1.5] [--webgpu] [--tier 0..3] [--warm 80] [--modes plain,sgsr2] [--grain .035] [--scenes textured] [--mip -.5] [--shots dir]
//   --tier: the quality tier (2 and 3 have MSAA); --warm: frames with nothing moving before each run;
//   --scenes: only the runs whose names start so; --mip: that many mip levels more (negative: sharper) on
//   top of the usual sharper textures
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const scale = opt('--scale') || '1.5', shots = opt('--shots');
  const vite = await import('vite');
  const port = 4186 + Math.floor(Math.random() * 50);
  const server = await vite.createServer({ server: { port, strictPort: false }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const gpu = argv.includes('--webgpu'), icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${server.resolvedUrls.local[0]}scripts/upscale-compare/?scale=${scale}${shots ? '&shots' : ''}${gpu ? '&gpu' : ''}${['tier', 'warm', 'modes', 'grain', 'mip', 'scenes'].map(k => opt('--' + k) ? `&${k}=${opt('--' + k)}` : '').join('')}`);
  await p.waitForFunction(() => window.result, null, { timeout: 900000 });   // (the PR check's runner is about half as fast as this machine)
  const res = await p.evaluate(() => window.result);
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  console.log(`drawn at 1/${res.scale} size and upscaled; error and flicker out of 255 (lower is better)`);
  for (const [name, r] of Object.entries(res.scenes)) {
    console.log(name);
    const n = v => String(v ?? '').padStart(5);
    for (const [m, s] of Object.entries(r)) console.log(`  ${m.padEnd(11)} error ${n(s.error)}  flicker ${n(s.flicker)}  thin ${n(s.thin)} / ${n(s.thinFlicker)}${s.moving != null ? `  moving ${n(s.moving)}` : ''}  ${s.ms} ms${s.waited ? `  (${s.waited} frames for its shaders)` : ''}  (${s.used || 'stretch'} on ${s.backend})`);
  }
  if (shots) { fs.mkdirSync(shots, { recursive: true }); for (const [k, u] of Object.entries(res.shots)) fs.writeFileSync(path.join(shots, k + '.png'), Buffer.from(u.split(',')[1], 'base64')); console.log('shots in', shots); }
  // What must hold: the upscalers really ran; SGSR 2 is no further from the reference than a plain stretch;
  // and our changes to SGSR 2 are no worse than the shader as it was: in error everywhere, and
  // in flicker where the camera is still (there it is shimmer; with the camera moving a sharper picture
  // changes more from frame to frame, as the reference does). A little slack: the two are a jitter step apart.
  // SGSR 2 at full size against the plain picture is printed, not checked.
  const bad = [];
  for (const [name, r] of Object.entries(res.scenes)) {
    if (r.sgsr2 && r.sgsr2.used !== 'sgsr2') bad.push(`${name}: SGSR 2 did not run`);
    if (r.sgsr1 && r.sgsr1.used !== 'sgsr1') bad.push(`${name}: SGSR 1 did not run`);
    if (r.sgsr2 && r.plain && r.sgsr2.error > r.plain.error * 1.05) bad.push(`${name}: SGSR 2 (${r.sgsr2.error}) is further from the reference than a plain stretch (${r.plain.error})`);
    for (const [ours, was] of [['sgsr2', 'sgsr2-plain'], ['aa', 'aa-plain']]) {
      const a = r[ours], b = r[was]; if (!a || !b) continue;
      // (a moving light, printed and not checked: a settled pixel's history counts for more, so the light's change
      // there takes a frame or two longer to show, about 3% more error than the shader as it was: a known trade)
      if (a.error > b.error * 1.03 + .03 && !name.startsWith('lamp')) bad.push(`${name}: ${ours} error ${a.error} is worse than the shader as it was (${b.error})`);
      if (r.ref.flicker < .3 && a.flicker > b.flicker * 1.05 + .02) bad.push(`${name}: ${ours} flicker ${a.flicker} is worse than the shader as it was (${b.flicker})`);
    }
    // sharper textures under SGSR 2 (WebGPU) really are closer to the reference than the textures as drawn
    // (by a clear step: they were 11% closer or more when this was written, so a three.js update that
    // quietly stops them being read sharper fails here)
    if (r.sgsr2 && r['sgsr2-soft'] && r.sgsr2.error > r['sgsr2-soft'].error * .95) bad.push(`${name}: SGSR 2 with sharper textures (${r.sgsr2.error}) is not clearly closer to the reference than without (${r['sgsr2-soft'].error})`);
  }
  for (const m of bad) console.log('FAIL', m);
  await b.close(); await server.close(); process.exit(bad.length ? 1 : 0);
})();
