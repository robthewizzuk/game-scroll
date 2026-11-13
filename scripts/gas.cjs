// Films gs.gas (scripts/gas/index.html): a row for each thing smoke and fire do (a camp fire, a room filling
// with smoke, an explosion, a chimney in the wind, smoke going round a ball, a blown torch, dust kicked up),
// a picture every so often along it, to judge by eye how it rises, curls, spreads and is lit; and it prints
// what the gas ran on, how many cells it had and what a frame of gas.update() cost.
//   node scripts/gas.cjs <out.png> [acts=camp,room,blast,wind,ball,torch,dust] [cols=6] [cell=300x380] [cells=20000] [klass=top|mid|low] [fps=30] [from= to=] [--webgpu]
// With --webgpu the gas runs on the graphics chip and is drawn as a lit volume (here on a software chip, so
// keep cells small: 20000 is the default); without, the JavaScript version drawn as soft puffs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: gas.cjs <out.png> [acts=camp,room,blast,wind,ball,torch,dust] [cols=6] [cell=300x380] [cells=20000] [klass=top] [fps=30] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4191);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 1200)); });
  await p.goto(`http://localhost:${port}/scripts/gas/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 1500000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
