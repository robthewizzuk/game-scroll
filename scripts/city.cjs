// Draws gs.city to look over (scripts/city/index.html): a column for each camera (on a pavement down the street,
// close to a facade, at a shop front, at a corner, over the roofs, far out to the horizon), a row for each time of
// day, and prints the draws and triangles of each.
//   node scripts/city.cjs <out.png> [views=street,close,shop,corner,ground,road,high,far] [times=18.3,21.5] [cell=480x360] [seed=7] [style=downtown] [blocks=6] [old] [off=rooms,dress,fleet,crowd,parked,paint] [far=1500] [--webgpu]
//   old: the city as it was before the close-up work (boxes with painted windows, two-box cars, block people)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: city.cjs <out.png> [views=street,close,shop,corner,ground,road,high,far] [times=18.3,21.5] [cell=480x360] [seed=7] [style=downtown] [blocks=6] [old] [off=rooms,dress,fleet,crowd,parked,paint] [far=1500] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4194);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 600)); });
  await p.goto(`http://localhost:${port}/scripts/city/?${gpu ? 'gpu&' : ''}${q.map(a => a.replace(/#/g, '%23')).join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
