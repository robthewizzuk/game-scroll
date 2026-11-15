// Draws gs.city.Town (scripts/town/index.html) to look over: a column for each camera (in the square, down the main
// street, at a cottage, at the inn, at the gate, high over the town, and a map with the townsfolk where their day has
// them), a row for each hour, and prints what each costs.
//   node scripts/town.cjs <out.png> [views=square,street,cottage,inn,gate,high,map] [times=10,21.5] [cell=480x360] [seed=7] [kind=village|castle] [houses=16] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: town.cjs <out.png> [views=square,street,cottage,inn,gate,high,map] [times=10,21.5] [cell=480x360] [seed=7] [kind=village|castle] [houses=16] [--webgpu]'); process.exit(1); }
  const vite = await import('vite'), port = +(process.env.PORT || 4196);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 600)); });
  await p.goto(`http://localhost:${port}/scripts/town/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
