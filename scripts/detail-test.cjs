// Cluster detail (src/kit/detail.js, a Nanite-style level of detail) in the browser: scripts/detail-test/
// draws a dense scene whole and through the view's automatic cluster detail, and this checks the two
// pictures match, that far fewer triangles were drawn, and that the twins follow their meshes.
//   node scripts/detail-test.cjs [--webgpu] [--shots dir] [--q "n=600&tier=3"]
//   node scripts/detail-test.cjs --bench [--webgpu] [--q "size=1&frames=40"]   a dense valley flown through with it off and on: triangles, draws and picking time a frame
//   node scripts/detail-test.cjs --page relief [--webgpu] [--shots dir]      real surface detail (gs.models.relief): a roof, a brick house and a trunk, flat against relief
//   node scripts/detail-test.cjs --page copies [--webgpu] [--shots dir]      detail levels for copies (gs.props): rocks and posts whole against levels, a hidden and a moved copy, what is sent to the chip
//   node scripts/detail-test.cjs --page copies --bench [--webgpu] --q "forest=20000"   a forest flown over with levels off and on (&cpucull: WebGPU without GPU culling, as under frame generation)
//   node scripts/detail-test.cjs --page crowd [--webgpu] [--shots dir]       crowds (gs.props.Crowd): people and a dog posed by their own skeletons against the same as members of a crowd, then a field of 300
//   node scripts/detail-test.cjs --page crowd --bench [--webgpu] --q "n=300"   300 with a skeleton each against 300 in a crowd: draws, triangles, posing and drawing time a frame
//   node scripts/detail-test.cjs --page slim [--webgpu] [--shots dir]        smaller meshes (src/kit/slim.js): people, a furred dog, a fused train, a relief wall and a crowd as plain floats against kept small
//   node scripts/detail-test.cjs --page traced --webgpu [--shots dir]        ray traced reflections (v.reflect() on WebGPU): a floor and a chrome ball that show what is above the screen and behind the camera, a moved thing, copies found on the screen, against screen-space reflections
//   node scripts/detail-test.cjs --page traced --bench --webgpu --q "size=.3"   the engine test scenes' hall with no reflections, screen-space ones and ray traced: what each draws, and what the traced copy holds
//   node scripts/detail-test.cjs --page origin [--webgpu] [--shots dir]      the world's centre moving with the camera (src/kit/origin.js): each engine test scene drawn about the world's own centre and about one far off, which must match
//   node scripts/detail-test.cjs --page spread --webgpu [--shots dir]        heavy effects spread over frames (HD.spread): a room with ambient occlusion, volumetric light and bounce light, every sample against spread, held still, moving, a crate sliding and after cuts
//   node scripts/detail-test.cjs --page sky [--webgpu] [--shots dir]         the sky on WebGPU (HD.atmosphere, HD.clouds): Hillaire's air and marched clouds against the sky before, at noon, late afternoon and sunset; cloud shadows, settling, turning, cuts
//   node scripts/detail-test.cjs --page lens [--webgpu] [--shots dir]        a camera like a real lens (v.lens): blur from the f-stop against the circle of confusion, bokeh discs and blades, near spill, autofocus, pulls, exposure in stops
//   node scripts/detail-test.cjs --page fades [--webgpu] [--shots dir]       detail levels that fade (lod-fade.js): a person and a dog half way through a change, its end against a plain switch, turned round; on WebGPU copies stepping back, picked on the CPU and on the chip
//   node scripts/detail-test.cjs --page aoback --webgpu [--shots dir]       ambient occlusion on the light that bounces only (HD.aoBack): a sunlit and a shaded corner against the occlusion on the whole picture, cuts, a moving camera, no new shaders when the chain is built anew
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const shots = arg('--shots'), bench = argv.includes('--bench'), q = (bench ? 'bench&' : '') + (arg('--q') || ''), page = arg('--page');
  const vite = await import('vite');
  const port = +(process.env.PORT || 4187), server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = [], warns = new Set(); p.on('pageerror', e => { if (e.message !== 'bench done') errs.push(e.message); }); p.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && !/GPU stall due to ReadPixels/.test(m.text())) warns.add(m.text().slice(0, 400)); });
  await p.goto(`http://localhost:${port}/scripts/detail-test/${page ? page + '.html' : ''}?${gpu ? 'gpu&' : ''}${q}`);
  await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  for (const w of warns) console.log('console:', w);
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  if (shots) { fs.mkdirSync(shots, { recursive: true }); for (const [k, url] of Object.entries(res.out)) fs.writeFileSync(path.join(shots, (gpu ? 'gpu-' : 'gl-') + (page ? page + '-' : '') + k + '.png'), Buffer.from(url.split(',')[1], 'base64')); }
  for (const [k, i] of Object.entries(res.info)) console.log(k.padEnd(12), JSON.stringify(i));
  let bad = 0; for (const c of res.checks) { if (!c.ok) bad++; console.log(c.ok ? '  ok  ' : '  FAIL', c.name, c.note ? '(' + c.note + ')' : ''); }
  if (bench) process.exit(0);
  console.log(bad ? `detail-test${page ? ' ' + page : ''}: ${bad} of ${res.checks.length} checks failed` : `detail-test${page ? ' ' + page : ''}: ${res.checks.length} checks passed (${gpu ? 'WebGPU' : 'WebGL'})`);
  process.exit(bad ? 1 : 0);
})();
