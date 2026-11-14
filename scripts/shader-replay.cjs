// Shaders a round built in play, made ahead the next time (src/kit/pipes.js). Each game is played twice, in two
// launches of the browser on the same profile, as a phone keeps the app's storage between launches. The first
// round notes the pipelines it made in play; the second time, those are made while the card is on screen and
// under the loading screen, and three's own asks for them in the round are found at once.
// Usage: npm run build:bundled && node scripts/shader-replay.cjs [ids...] [--secs 20] [--keep dir]
//   no ids: a few Next Gen games and a Console one that make pipelines in play
//   --keep dir: the browser profile to use (and leave), else a fresh one in the system's temp folder
// For each game and run: the pipelines first made in play (and, the second time, how many of those were made
// ahead), the frames that made one (only frames that made one in the frame itself: three's own, not the kit's
// background builds) and the longest of them, and what was read and made ahead. The software renderer's pipelines
// take far longer than a phone's, so read the counts and the gap between the two runs, not the milliseconds.
// Exit 1 if a game noted pipelines in its first run and the second made none of them ahead, or a page threw.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
(async () => {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const secs = +(opt('--secs') || 20), keep = opt('--keep'), runs = Math.max(2, +(opt('--runs') || 3));
  const ids = args.filter(a => !a.startsWith('--')), list = ids.length ? ids : ['bunker-breakout', 'gravity-grip', 'paint-run'];
  const server = await (await import('vite')).preview({ preview: { port: 4196 } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  let bad = 0;
  // the same taps both times (the games' own randomness still differs)
  const taps = seed => { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; };
  const run = async (dir, id, k) => {
    const ctx = await chromium.launchPersistentContext(dir, {
      args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd },
      viewport: { width: 390, height: 664 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const p = ctx.pages()[0] || await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource|Error resolving queries/.test(m.text())) errs.push(m.text()); });
    try {
      await p.goto('http://localhost:4196/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 });
      await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); await window.__gpu.ready(); });
      await p.evaluate(id => __gs.only(id, true), id);
      await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 300000 });
      await p.waitForTimeout(1000);
      const before = await p.evaluate(() => __gs.pipes.stats());
      // frames, and the pipelines three makes in the frame itself (the kit's background ones are made between frames)
      await p.evaluate(() => {
        const L = window.__sr = { frames: [], made: [], on: false, t0: 0 };
        const d = __gs.active && window.__gpu && (window.__hdView?._gpuChain?.r?.backend?.device);
        const tick = t => { if (L.on) L.frames.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
        L.watch = dev => { if (!dev || dev.__sr) return; dev.__sr = true; for (const k of ['createRenderPipeline', 'createComputePipeline']) { const f = dev[k]; dev[k] = function (desc) { if (L.on) L.made.push(performance.now()); return f.call(dev, desc); }; } };
        L.watch(d);
      });
      const t0 = Date.now();
      await p.evaluate(() => __gs.play());
      await p.waitForFunction(() => __gs.active.state === 'playing' && !__gs.active.starting, null, { timeout: 120000, polling: 100 });
      const ready = (Date.now() - t0) / 1000;
      await p.evaluate(async () => { const gpu = await window.__gpu.ready(); window.__sr.watch(gpu?.r?.backend?.device); window.__sr.on = true; });
      const box = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
      const rnd = taps(7), end = Date.now() + secs * 1000;
      while (Date.now() < end) {
        if (await p.evaluate(() => __gs.active.state !== 'playing' && !__gs.active.starting)) {
          await p.evaluate(() => __gs.play()).catch(() => {});
          await p.waitForFunction(() => __gs.active.state === 'playing' && !__gs.active.starting, null, { timeout: 60000, polling: 100 }).catch(() => {});
        }
        await p.mouse.move(box.x + rnd() * box.w, box.y + rnd() * box.h); await p.mouse.down();
        await p.mouse.move(box.x + rnd() * box.w, box.y + rnd() * box.h, { steps: 4 });
        await p.waitForTimeout(60 + rnd() * 200); await p.mouse.up(); await p.waitForTimeout(rnd() * 120);
      }
      const L = await p.evaluate(() => { const L = window.__sr; L.on = false; return { frames: L.frames, made: L.made }; });
      const st = await p.evaluate(() => __gs.pipes.stats()), notes = await p.evaluate(id => __gs.pipes.notes(id), id);
      await p.evaluate(() => __gs.pipes.save());
      // the frames that made a pipeline in them, and their gaps
      const gaps = [];
      for (let i = 0; i + 1 < L.frames.length; i++) if (L.made.some(t => t >= L.frames[i] && t < L.frames[i + 1])) gaps.push(L.frames[i + 1] - L.frames[i]);
      const usual = L.frames.length > 2 ? L.frames.slice(1).map((t, i) => t - L.frames[i]).sort((a, b) => a - b)[L.frames.length >> 1] : 0;
      return { ready, before, st, notes, inFrame: L.made.length, frames: gaps.length, worst: Math.max(0, ...gaps), usual, errs };
    } finally { await ctx.close(); }
  };
  for (const id of list) {
    const dir = keep ? path.join(keep, id) : fs.mkdtempSync(path.join(os.tmpdir(), 'gs-pipes-'));
    try {
      const R = []; for (let k = 1; k <= runs; k++) R.push(await run(dir, id, k));
      const a = R[R.length - 2], b = R[R.length - 1];
      if (process.env.DUMP) fs.writeFileSync(path.join(process.env.DUMP, id + '.json'), JSON.stringify(R.map(r => r.notes), null, 1));
      const line = (n, r) => `   run ${n}: ready in ${r.ready.toFixed(1)} s · in play: ${r.st.midRound} pipelines first made${n > 1 ? `, ${r.st.midRoundReady} of them made ahead` : ''}, ${r.inFrame} made in the frame (${r.frames} frames, longest ${r.worst.toFixed(0)} ms; usual ${r.usual.toFixed(0)} ms) · noted ${r.st.noted}${n > 1 ? ` · read back ${r.before.games.find(g => g.id === id)?.pipes ?? 0}, made ahead ${r.st.ready} of ${r.st.primed}${r.st.failed ? `, ${r.st.failed} FAILED` : ''}, three asked for ${r.st.hits}` : ''}`;
      const noted = a.st.noted, fail = (noted > 0 && !(b.st.ready > 0)) || a.errs.length || b.errs.length;
      if (fail) bad++;
      console.log(`${fail ? 'BAD ' : 'ok  '} ${id}`);
      R.forEach((r, i) => console.log(line(i + 1, r)));
      for (const e of [...new Set(R.flatMap(r => r.errs))].slice(0, 4)) console.log('     ! ' + e.slice(0, 220));
    } catch (e) { bad++; console.log(`FAIL ${id} ${String(e.message).split('\n')[0]}`); }
    if (!keep) fs.rmSync(dir, { recursive: true, force: true });
  }
  server.httpServer.close();
  console.log(`\n${list.length} game${list.length === 1 ? '' : 's'}${bad ? `: ${bad} to look at` : ': each made ahead what its first round made in play'}`);
  process.exit(bad ? 1 : 0);
})();
