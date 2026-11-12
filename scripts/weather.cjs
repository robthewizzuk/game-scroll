// Films gs.sky.Weather changing a place (scripts/weather/index.html): one story of weather (rain comes on, it
// dries, snow settles, it melts) over a house with a porch and an open door, a lean-to, a yard, trees and a
// pond, a row for each camera, to judge the wet ground, the puddles, the snow and the dry floor indoors by eye;
// and it prints what a frame of weather.update() cost and the most pictures any one material reads at once.
//   node scripts/weather.cjs <out.png> [views=yard,porch,in,roof,top,pond] [cols=8] [cell=300x210] [story=rain,dry,snow,melt] [secs=8] [phys] [cover=0] [hold=snow:.9] [time=14] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: weather.cjs <out.png> [views=yard,porch,in,roof,top,pond] [cols=8] [cell=300x210] [story=rain,dry,snow,melt] [secs=8] [phys] [cover=0] [hold=snow:.9] [time=14] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4191);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 400)); });
  await p.goto(`http://localhost:${port}/scripts/weather/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
