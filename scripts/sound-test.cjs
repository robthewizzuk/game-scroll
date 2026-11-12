// Checks the sound kit in a real browser: every ready-made sound and the limiter, the instrument sets,
// the music clock, and sound that knows the level. Usage: node scripts/sound-test.cjs [sounds|band|clock|level] [--list]   (--list prints each measurement)
const { chromium } = require('playwright');
(async () => {
  const argv = process.argv.slice(2), list = argv.includes('--list'), only = argv.filter(a => !a.startsWith('--'));
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4186 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let failed = 0;
  for (const part of ['sounds', 'band', 'clock', 'level']) {
    if (only.length && !only.includes(part)) continue;
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://localhost:4186/scripts/sound-test/?part=' + part);
    await p.waitForFunction(() => window.result, null, { timeout: 240000 }).catch(() => {});
    const r = await p.evaluate(() => window.result || ['FAIL no result']);
    console.log(`\n${part}`); console.log(r.filter(l => list || !l.startsWith('     ') || /limiter|loudness/.test(l)).join('\n'));
    if (errs.length) { console.log('page errors:\n  ' + errs.join('\n  ')); failed++; }
    failed += r.filter(l => l.startsWith('FAIL')).length;
    await p.close();
  }
  await b.close(); await server.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall sound checks passed'); process.exit(failed ? 1 : 0);
})();
