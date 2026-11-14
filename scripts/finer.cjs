// Finer sun shadows (scripts/finer/index.html, sunmask-gpu.js, sunmask.js): each scene twice, with the sun's shadow
// maps alone and with the sun mask (contact shadows close up, far shadows over a map of heights, capsule shadows for
// a crowd), to judge by eye, and what each costs (render time on this machine's software chip, the mask's CPU time,
// the sun map's triangles and draws a frame).
//   node scripts/finer.cjs <out.png> [acts=contact,face,far,crowd] [cell=360x300] [tier=3] [frames=8] [people=120] [--webgpu]
//   node scripts/finer.cjs <out.png> scene=shade [at=3,8,13,18] [size=.4] [--webgpu]   (the phone test tour's engine test scene, along its walk)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: finer.cjs <out.png> [acts=contact,face,far,crowd] [cell=360x300] [tier=3] [frames=8] [people=120] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4194);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 1500)); });
  await p.goto(`http://localhost:${port}/scripts/finer/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
