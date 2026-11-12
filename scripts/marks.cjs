// Films gs.outdoors.Marks (scripts/marks/index.html): a field of sand, grass and bare earth with two people, a
// dog and a jeep going round it, through one story of weather (snow lying, fresh snow falling, rain, dry), a row
// for each camera, to judge the prints, the tracks and the parted grass by eye; and it prints what a frame of
// marks.update() cost, how many marks are kept and how many tiles of them are drawn.
//   node scripts/marks.cjs <out.png> [views=mud,sand,grass,lawn,top,low,close,wide] [cols=6] [cell=420x300] [story=snow,fresh,rain,wet,dry] [secs=8] [hold=snow:.9] [who=people,dog,jeep,tank] [off] [cellsize=.025] [reach=10] [prof] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: marks.cjs <out.png> [views=mud,sand,grass,lawn,top,low,close,wide] [cols=6] [cell=420x300] [story=snow,fresh,rain,wet,dry] [secs=8] [hold=snow:.9] [who=people,dog,jeep,tank] [off] [cellsize=.025] [reach=10] [prof] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4193);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 400)); });
  await p.goto(`http://localhost:${port}/scripts/marks/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
