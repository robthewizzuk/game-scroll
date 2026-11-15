// Draws gs.dungeon.Dungeon (scripts/dungeon/index.html) to look over: a column for each camera (the way in, a door, the
// lever room, the gate, a chest, a trap, the secret wall, from above with the ceiling off, and the map), a row for
// before (all shut) and after (opened, pulled, looted, found, a trap fired), and prints what each costs.
//   node scripts/dungeon.cjs <out.png> [views=start,door,lever,gate,chest,trap,secret,top,map] [cell=480x360] [seed=3] [size=40x30] [--webgpu]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: dungeon.cjs <out.png> [views=start,door,lever,gate,chest,trap,secret,top,map] [cell=480x360] [seed=3] [size=40x30] [--webgpu]'); process.exit(1); }
  const vite = await import('vite'), port = +(process.env.PORT || 4197);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 600)); });
  await p.goto(`http://localhost:${port}/scripts/dungeon/?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
