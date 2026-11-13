// Pictures of a gs.outdoors Sea (scripts/sea/index.html): a beach with the surf running up it, the open sea out to the
// horizon and a boat riding the swell, a row for each camera and a column for each moment, to judge the water by eye;
// and it prints what a frame of sea.update() cost and how well the boat's heights match the water drawn under it.
//   node scripts/sea.cjs <out.png> [views=beach,surf,top,open,boat,far] [cols=4] [every=1.5] [cell=420x300] [wind=7] [dir=1.2] [time=15] [rain] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: sea.cjs <out.png> [views=beach,surf,top,open,boat,far] [cols=4] [every=1.5] [cell=420x300] [wind=7] [dir=1.2] [time=15] [rain] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4195);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 400)); });
  await p.goto(`http://localhost:${port}/scripts/sea/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
