// Films gs.destruction.Structure (scripts/structure/index.html): a row for each thing done to a building (a
// shell at its foot, a corner knocked out, a bomb on the roof, rifle fire, a wrecking ball, a big bomb, each
// corner in turn), a picture every so often along it, to judge how it comes apart by eye; and it prints how
// many pieces broke, fell and landed, what still stands and what a frame cost.
//   node scripts/structure.cjs <out.png> [style=brick|plaster|concrete|stone|timber] [acts=shell,corner,big] [size=8x6x2] [cols=8] [cell=260x220] [phys=0] [view=three|front|side|back|top|in] [dust=0] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: structure.cjs <out.png> [style=brick|plaster|concrete|stone|timber] [acts=shell,corner,big] [size=8x6x2] [cols=8] [cell=260x220] [phys=0] [view=three|front|side|back|top|in] [dust=0] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4188);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 400)); });
  await p.goto(`http://localhost:${port}/scripts/structure/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
