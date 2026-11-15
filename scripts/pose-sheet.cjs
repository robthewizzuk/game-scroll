// A sheet of poses (scripts/pose-sheet/index.html): one picture each, to judge new poses by eye on a person, a
// skinned person or a plain figure, from a few sides, with a wall or water or a car seat where the pose needs one.
//   node scripts/pose-sheet.cjs <out.png> poses=coverHighL,coverLowL+blindOver,swim@.3 [who=human|person|figure] [views=three,side] [cell=220x260] [prop=wall|low|water|seat] [--webgpu]
//   a cell is pose[+upper][@phase]: an upper-body pose over a whole-body one, held at a point of its cycle
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), gpu = argv.includes('--webgpu'), [out, ...q] = argv.filter(a => !a.startsWith('--'));
  if (!out) { console.log('usage: pose-sheet.cjs <out.png> poses=a,b+upper,c@.5 [who=human|person|figure] [views=three,side] [cell=220x260] [prop=wall|low|water|seat] [--webgpu]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4191);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 400)); });
  const page = (q.find(a => a.startsWith('page=')) || '').slice(5); await p.goto(`http://localhost:${port}/scripts/pose-sheet/${page ? page + '.html' : ''}?${gpu ? 'gpu&' : ''}${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 900000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out, '(' + res.backend + ')');
  process.exit(0);
})();
