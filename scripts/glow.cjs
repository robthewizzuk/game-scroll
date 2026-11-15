// Glowing 2D light (scripts/glow/index.html; look2d Lights with glow: true, src/kit/glow2d.js): each scene drawn with
// the canvas lights (left) and with glow (right), to judge by eye, and what a frame of each cost on this machine's
// software chip (a phone's chip is far faster at this).
//   node scripts/glow.cjs <out.png> [acts=dungeon,neon,cone,pixel,cam] [frames=30]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, ...q] = process.argv.slice(2);
  if (!out) { console.log('usage: glow.cjs <out.png> [acts=dungeon,neon,cone,pixel,cam] [frames=30]'); process.exit(2); }
  const vite = await import('vite'), port = +(process.env.PORT || 4197);
  const server = await vite.createServer({ server: { port }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || process.env.ALLWARN) console.log('page:', m.text().slice(0, 1500)); });
  await p.goto(`http://localhost:${port}/scripts/glow/?${q.join('&')}`); await p.waitForFunction(() => window.result, null, { timeout: 600000 });
  const res = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.sheet.split(',')[1], 'base64'));
  for (const l of res.info) console.log(l);
  console.log('saved', out);
  process.exit(0);
})();
