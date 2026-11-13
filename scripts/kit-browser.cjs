// Checks the game kits that need a real browser (WebGL, audio, wasm): npm run kit-browser.
// Needs the face, hand and sound recognition files (npm run ml): it fetches them first when they are missing.
const { chromium } = require('playwright');
const { existsSync, statSync } = require('node:fs'), { join } = require('node:path'), { execFileSync } = require('node:child_process');
(async () => {
  const { ML_VERSION, ML_FILES } = await import('../src/kit/vision-files.js'), dir = join(__dirname, '..', 'ml-cache', ML_VERSION);
  if (ML_FILES.some(f => !existsSync(join(dir, f.name)) || statSync(join(dir, f.name)).size < 1000)) {
    console.log("the models' files are missing: fetching them (npm run ml)");
    try { execFileSync(process.execPath, [join(__dirname, 'fetch-ml.mjs')], { stdio: 'inherit' }); }
    catch (e) { console.log("couldn't fetch them, so the model checks are left out: " + e.message); }
  }
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4181 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-webgpu'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:4181/scripts/kit-browser/' + (process.env.KIT_QUERY || ''));
  await p.waitForFunction(() => window.result, null, { timeout: 400000 }).catch(() => {});
  const r = await p.evaluate(() => window.result || ['FAIL no result']);
  console.log(r.join('\n')); if (errs.length) console.log('page errors:\n  ' + errs.join('\n  '));
  await b.close(); await server.close();
  process.exit(r.some(l => l.startsWith('FAIL')) ? 1 : 0);
})();
