// Films gs.outdoors.Water being disturbed (scripts/water/index.html): a row for each thing that happens to
// the water (a pebble, a rock, a ball dropped in, a boat, a swimmer, rain, a beach, someone wading in, the
// camera going under), a picture every so often along it, to judge its rings, wakes, foam, spray, shore and
// the look from under it by eye; and it prints what a frame of water.update() cost.
//   node scripts/water.cjs <out.png> [acts=pebble,rock,drop,boat,swim,rain,shore,wade,under] [cols=8] [cell=300x210] [cells=128] [reach=24] [waves=.6] [time=14] [from= to=] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: water.cjs <out.png> [acts=pebble,rock,drop,boat,swim,rain,shore,wade,under] [cols=8] [cell=300x210] [cells=128] [reach=24] [waves=.6] [time=14] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4189);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 400)); });
  await p.goto(`http://localhost:${port}/scripts/water/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
