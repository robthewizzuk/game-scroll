// Makes training frames for GSSR's learned blend (src/kit/gssr-net.js): scripts/gssr-train/index.html draws
// seeded scenes at twice the size (the reference) and through GSSR on WebGPU (software, like
// upscale-compare.cjs), and this writes each frame's sampled pixels to <out>/s<seed>.f32 (40 float32s a pixel:
// see the page). scripts/gssr-train.py then fits the network to them.
//   node scripts/gssr-train.cjs --out dir [--seeds 0-29] [--jobs 2] [--net weights.json] [--frames 24] [--tier 0]
//   --net: draw with that network (the next round of training learns from the history it makes)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const out = opt('--out'); if (!out) { console.log('usage: node scripts/gssr-train.cjs --out dir [--seeds 0-29] [--jobs 2] [--net weights.json]'); process.exit(2); }
  const [a, b] = opt('--seeds', '0-29').split('-').map(Number), jobs = +opt('--jobs', 2), netFile = opt('--net');
  const net = netFile ? JSON.parse(fs.readFileSync(netFile, 'utf8')) : null;
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'format.json'), JSON.stringify({ nf: 40, nin: 17 }));   // (floats a sample, the page's NF, and the network's inputs: frames before the extra inputs had 32 and 12)
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4236 + Math.floor(Math.random() * 50), strictPort: false, hmr: false }, mode: 'bundled', logLevel: 'error' }); await server.listen();   // (no reloads mid-run)
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  // seeds split between a few browsers
  const all = []; for (let s = a; s <= b; s++) all.push(s);
  const parts = Array.from({ length: Math.min(jobs, all.length) }, (_, j) => all.filter((_, i) => i % jobs === j));
  let bad = 0;
  await Promise.all(parts.map(async seeds => {
    for (const seed of seeds) {
      const br = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
      const p = await br.newPage(), errs = [];
      p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); else if (m.text().startsWith('seed ')) console.log(m.text()); });
      const file = path.join(out, `s${seed}.f32`); fs.rmSync(file, { force: true });
      await p.exposeFunction('gssrSave', (name, b64) => { fs.appendFileSync(path.join(out, name + '.f32'), Buffer.from(b64, 'base64')); });
      if (net) await p.addInitScript(n => { window.__gssrNet = n; }, net);
      await p.goto(`${server.resolvedUrls.local[0]}scripts/gssr-train/?seeds=${seed}-${seed}&frames=${opt('--frames', 24)}&tier=${opt('--tier', 0)}&per=${opt('--per', 5000)}`);
      await p.waitForFunction(() => window.result, null, { timeout: 1800000 });
      const res = await p.evaluate(() => window.result);
      if (res.error || errs.length) { bad++; console.log(`FAIL seed ${seed}:`, res.error || errs.slice(0, 5).join('\n')); }
      else if (res.outErr > 1.5) { bad++; console.log(`FAIL seed ${seed}: the probe's picture is ${res.outErr.toFixed(2)}/255 from the canvas (the samples don't line up)`); }
      await br.close();
    }
  }));
  await server.close(); process.exit(bad ? 1 : 0);
})();
