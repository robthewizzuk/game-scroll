// Plays gs.city's traffic, police and street life (scripts/city-chase/index.html): a car driven round the city with
// stars on it, the police after it, the traffic pulling over and swerving, a crash, people doing things, a full person
// knocked over, a roadblock; a picture of each and the numbers.
//   node scripts/city-chase.cjs <out.png> [shots=chase,yield,crash,life,knock,block] [cell=480x360] [seed=7] [time=17.5] [phys=0] [secs=24] [old] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: city-chase.cjs <out.png> [shots=chase,yield,crash,life,knock,block] [cell=480x360] [seed=7] [time=17.5] [phys=0] [secs=24] [old] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4196);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 600)); });
  await p.goto(`http://localhost:${port}/scripts/city-chase/?${gpu ? 'gpu&' : ''}${q.map(a => a.replace(/#/g, '%23')).join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
