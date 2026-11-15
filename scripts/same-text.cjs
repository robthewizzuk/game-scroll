// Shader text the same from launch to launch (gpu.js sameText). A phone's driver keeps the pipelines it made on disk,
// keyed by the shader's text, so a launch that writes a shader a little differently from the last (the same values
// in another order) builds it again from nothing. Each game is played in two fresh launches of the browser (no
// storage kept, the quality tier pinned so both pick the same shaders), with the same taps; every shader module three
// makes is noted, and the texts the second launch made are looked for among the first's.
// Usage: npm run build:bundled && node scripts/same-text.cjs [ids...] [--secs 20]
//   no ids: frost-line and long-shadow
// Exit 1 if fewer than 95% of the texts a game made in both launches' first moments (before play starts: the same
// scene in both) are word for word the same, or a page threw. After play starts the games' own randomness picks
// different things, so those are only counted.
const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const secs = +(opt('--secs') || 20), ids = args.filter(a => !a.startsWith('--')), list = ids.length ? ids : ['frost-line', 'long-shadow'];
  const server = await (await import('vite')).preview({ preview: { port: 4231 } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  let bad = 0;
  const once = async id => {
    const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
    try {
      const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
      await ctx.addInitScript(() => {
        window.__wgsl = [];
        const P = globalThis.GPUDevice && GPUDevice.prototype; if (!P) return;
        const f = P.createShaderModule;
        P.createShaderModule = function (d) { try { window.__wgsl.push({ t: performance.now(), code: d.code }); } catch (e) { /* noted or not, made */ } return f.call(this, d); };
      });
      const p = await ctx.newPage(), errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.goto('http://localhost:4231/'); await p.waitForFunction(() => window.__gs, null, { timeout: 120000 });
      await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); await window.__gpu.ready(); });
      await p.evaluate(() => { if (window.__hd) window.__hd.force = 1; });
      await p.evaluate(id => __gs.only(id), id);
      await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 300000 }).catch(() => {});
      await p.evaluate(() => __gs.play());
      await p.waitForFunction(() => __gs.active.state === 'playing' && !__gs.active.starting, null, { timeout: 300000, polling: 100 }).catch(() => {});
      const playAt = await p.evaluate(() => performance.now());
      const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
      let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const end = Date.now() + secs * 1000;
      while (Date.now() < end) {
        if (await p.evaluate(() => __gs.active.state !== 'playing' && !__gs.active.starting)) await p.evaluate(() => __gs.play()).catch(() => {});
        await p.mouse.move(r.x + rnd() * r.w, r.y + rnd() * r.h); await p.mouse.down();
        await p.mouse.move(r.x + rnd() * r.w, r.y + rnd() * r.h, { steps: 4 });
        await p.waitForTimeout(60 + rnd() * 200); await p.mouse.up(); await p.waitForTimeout(rnd() * 120);
      }
      const W = await p.evaluate(() => window.__wgsl);
      return { before: new Set(W.filter(w => w.t <= playAt).map(w => w.code)), all: new Set(W.map(w => w.code)), errs };
    } finally { await b.close(); }
  };
  for (const id of list) {
    const A = await once(id), B = await once(id);
    for (const [k, R] of [['first', A], ['second', B]]) if (R.errs.length) { bad++; console.log(`FAIL ${id}: the ${k} launch threw: ${R.errs.slice(0, 2).join(' | ')}`); }
    const same = [...B.before].filter(c => A.before.has(c)).length, n = Math.max(A.before.size, B.before.size);
    const ok = n > 0 && same >= n * .95; if (!ok) bad++;
    const all = [...B.all].filter(c => A.all.has(c)).length;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: before play, ${same} of ${n} shader texts the same in both launches (${A.before.size} and ${B.before.size} made); in all, ${all} of ${B.all.size} of the second's were made by the first too`);
  }
  await new Promise(r => server.httpServer.close(r));
  process.exit(bad ? 1 : 0);
})();
