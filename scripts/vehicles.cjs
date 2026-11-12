// Draws gs.models.vehicle to look over (scripts/vehicles/index.html): a row for each vehicle, a column for each
// camera (three quarters from the front, the side, three quarters from behind, from above, and one caught
// moving: wheels steered, turret turned, propellers spinning), and prints how many triangles and draws each
// is and how long it took to make.
//   node scripts/vehicles.cjs <out.png> [show=car:saloon,car:jeep,tank,...] [views=front,side,back,top,move] [cell=360x230] [finish=worn] [wear=1] [lit] [seed=3] [time=15] [zoom=2] [at=-3] [--webgpu]
//   a train: show=train:steam-van_6b3024-open_tarp-flat_crates-guard (wagons joined by -, a wagon's load and colour after _)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: vehicles.cjs <out.png> [show=car:saloon,car:jeep,tank,...] [views=front,side,back,top,move] [cell=360x230] [finish=worn] [wear=1] [lit] [seed=3] [time=15] [colour=#a22] [deflectors] [load=coal] [fuse] [dull] [zoom=2] [at=-3] [--webgpu]\n  a train: show=train:steam-van_6b3024-open_tarp-flat_crates-guard (a wagon, then _ its load and/or _ its colour)\n  fuse: a train that keeps to a straight line, in as few draws as it can be (fuse: true); dull: a working engine (polished: false)\n  zoom=2 at=-3: twice as close, looking 3 m toward its nose'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4192);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 400)); });
  await p.goto(`http://localhost:${port}/scripts/vehicles/?${gpu ? 'gpu&' : ''}${q.map(a => a.replace(/#/g, '%23')).join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
