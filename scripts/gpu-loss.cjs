// A lost graphics chip in the middle of a round (src/kit/gpu.js lostGPU, src/main.js mendStep): the WebGPU device goes
// away while a 3D round is played, and the app must pause the round, make a new device, draw the round again on it
// under a cover, give "Carry on" back, and report it (src/perf.js, kind 'gpu').
// Usage: npm run build:bundled && node scripts/gpu-loss.cjs [ids...] [--how cdp|destroy] [--times n] [--when round|gate|feed] [--shots dir]
//   no ids: two Next Gen games and a Console one
//   --how cdp       (default) the browser's GPU process is crashed (Chrome DevTools' Browser.crashGpuProcess): a real
//                   loss, reason 'unknown', and every WebGL and 2D canvas on the page loses its context too
//   --how destroy   the device is destroyed from the page (window.__gpu.lose()): the app takes it for a loss
//   --times n       lose it n times in the round, each once the round is back. The fourth loss in a session is drawn
//                   with WebGL from then on, as a chip that keeps failing should be; with --how cdp, Chrome itself refuses
//                   the page any 3D after its graphics process has crashed twice on it ('none': the pause screen says to
//                   restart the app; the Mac and Windows app turns that rule off)
//   --when gate     lost while the round gets ready under the loading screen instead: it must start, on WebGPU
//   --when feed     lost while the card waits in the feed: Play afterwards must start the round on WebGPU
//   --shots dir     the round's picture before and after, side by side, as dir/<id>.png
// For each game: how long the new device and the round's shaders took ("back in"), what drew after ("webgpu"), the
// picture after against the one before (mean difference per channel, out of 255; the game moves on, so a few tens is
// usual; a black or blank picture is 100+), the report the app kept, and any page error.
// Errors three logs at the moment of a loss (its timing reads in flight on the lost device, and with 'none' the WebGL
// renderer it could not make) are expected and counted apart.
// Exit 1 if the first loss did not come back on WebGPU, a picture came back blank, no report was kept, or a page threw.
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; }, flag = n => { const i = args.indexOf(n); if (i >= 0) args.splice(i, 1); return i >= 0; };
  const how = opt('--how') || 'cdp', when = opt('--when') || 'round', times = Math.max(1, +(opt('--times') || 1)), shots = opt('--shots');
  const ids = args.filter(a => !a.startsWith('--')), list = ids.length ? ids : ['gravity-grip', 'frost-line', 'bumper-bowl'];
  const server = await (await import('vite')).preview({ preview: { port: 4197 } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  let bad = 0;
  for (const id of list) {
    const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 }), p = await ctx.newPage(), errs = [], warns = [];
    p.on('pageerror', e => errs.push(e.message));
    const AT_LOSS = /Error resolving queries|A WebGL context could not be created|Error creating WebGL context/;
    let known = 0;
    p.on('console', m => { const t = m.text(); if (m.type() === 'error' && AT_LOSS.test(t)) known++; else if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errs.push(t); else if (/WebGPU|device lost|context lost/i.test(t)) warns.push(t); });
    const cdp = await b.newBrowserCDPSession();
    const lose = () => how === 'cdp' ? cdp.send('Browser.crashGpuProcess') : p.evaluate(() => window.__gpu.lose());
    try {
      await p.goto('http://localhost:4197/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 });
      await p.evaluate(id => __gs.only(id, true), id); await p.waitForTimeout(300);
      const gpu = await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); return !!(await window.__gpu.ready()); });
      if (!gpu) throw new Error('no WebGPU in this browser');
      await p.evaluate(id => __gs.only(id, true), id);
      await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 300000 });
      await p.waitForTimeout(1500);
      if (when !== 'round') {
        // lost before the round: in the feed, or under the loading screen
        if (when === 'feed') { await lose(); await p.waitForTimeout(2000); }
        await p.evaluate(() => __gs.play());
        if (when === 'gate') { await p.waitForFunction(() => __gs.active.starting && __gs.active.starting.phase !== 'load', null, { timeout: 60000 }); await lose(); }
        await p.waitForFunction(() => __gs.active.state === 'playing' && !__gs.active.starting, null, { timeout: 120000 });
        await p.waitForTimeout(2500);
        const r = await p.evaluate(() => ({ back: window.__hd?.info.backend || window.__toon?.backend, L: window.__gpu.losses(), paused: __gs.active.paused, rep: __gs.perf.waiting.errors.filter(e => e.kind === 'gpu') }));
        const fail = r.back !== 'webgpu' || r.L.last?.backend !== 'webgpu' || r.paused || !r.rep.length || errs.length;
        if (fail) bad++;
        console.log(`${fail ? 'BAD ' : 'ok  '} ${id.padEnd(16)} lost ${when === 'feed' ? 'in the feed' : 'under the loading screen'}: back in ${((r.L.last?.ms || 0) / 1000).toFixed(1)} s on ${r.L.last?.backend}, the round started${r.paused ? ' PAUSED' : ''} and drew with ${r.back} · report: ${r.rep.map(e => `"${e.msg}"`).join(', ') || 'NONE'}${known ? ` · ${known} error${known === 1 ? '' : 's'} logged by three at the loss` : ''}`);
        for (const e of errs.slice(0, 4)) console.log('     ! ' + e.slice(0, 220));
        await b.close(); continue;
      }
      await p.evaluate(() => __gs.play());
      await p.waitForFunction(() => __gs.active.state === 'playing' && !__gs.active.starting, null, { timeout: 120000 });
      await p.waitForTimeout(2500);
      const era = await p.evaluate(() => __gs.active.def.era);
      // the card's picture, and a 48 x 64 copy of it to compare (the card may change size: full screen, the pause screen)
      const pic = () => p.evaluate(() => { const c = __gs.active.canvas, s = document.createElement('canvas'); s.width = 48; s.height = 64; const x = s.getContext('2d'); x.drawImage(c, 0, 0, 48, 64); const d = x.getImageData(0, 0, 48, 64).data, o = []; for (let i = 0; i < d.length; i += 4) o.push(d[i], d[i + 1], d[i + 2]); return { w: c.width, h: c.height, px: o, url: c.toDataURL('image/png') }; });
      const before = await pic();
      const out = [];
      for (let k = 0; k < times; k++) {
        const t0 = Date.now();
        await lose();
        // paused at once, under the cover, with no carrying on until it is drawn again
        await p.waitForFunction(() => __gs.active.paused && __gs.active.pauseWhy === 'gpu', null, { timeout: 10000 });
        const held = await p.evaluate(() => !!__gs.active.mend && !!document.querySelector('.pause-ov.load-ov button[disabled]'));
        await p.waitForFunction(() => !__gs.active.mend, null, { timeout: 120000 });
        const ms = Date.now() - t0, L = await p.evaluate(() => window.__gpu.losses());
        // carry on: the button, as a player taps it
        await p.evaluate(() => document.querySelector('.pause-ov button.play').click());
        await p.waitForFunction(() => !__gs.active.paused, null, { timeout: 5000 });
        await p.waitForTimeout(2500);
        const back = L.last?.backend === 'none' ? 'none' : await p.evaluate(era => era === 'console' ? window.__toon?.backend || '?' : window.__hd?.info.backend, era);
        const note = await p.evaluate(() => document.querySelector('.pause-ov .ov-what')?.textContent || '').catch(() => '');
        out.push({ ms, held, L, back, note });
        if (back === 'none') break;   // (no 3D left to lose)
      }
      const after = await pic();
      let diff = 0, lit = 0; for (let i = 0; i < before.px.length; i++) { diff += Math.abs(before.px[i] - after.px[i]); }
      for (let i = 0; i < after.px.length; i += 3) lit += after.px[i] + after.px[i + 1] + after.px[i + 2] > 30 ? 1 : 0;
      const last = out[out.length - 1];
      diff /= before.px.length; const blank = last.back !== 'none' && lit < after.px.length / 3 * .05;
      const rep = await p.evaluate(() => __gs.perf.waiting.errors.filter(e => e.kind === 'gpu'));
      // the first loss comes back on WebGPU; later ones on whatever the browser still gives, drawn with that
      const okBack = out[0].L.last?.backend === 'webgpu' && out.every(o => o.back === o.L.last?.backend || era === 'console' && o.back === 'webgpu') && (last.back !== 'none' || /Restart the app/.test(last.note));
      const fail = !okBack || blank || !rep.length || errs.length || out.some(o => !o.held);
      if (fail) bad++;
      console.log(`${fail ? 'BAD ' : 'ok  '} ${id.padEnd(16)} ${String(era).padEnd(8)} ${out.map(o => `back in ${(o.ms / 1000).toFixed(1)} s on ${o.L.last?.backend || '?'} (${o.L.last?.reason}), drew with ${o.back}${o.held ? '' : ', NOT HELD'}${o.back === 'none' ? ` ("${o.note}")` : ''}`).join('; ')} · picture after vs before ${diff.toFixed(0)}${blank ? ' BLANK' : ''}${before.w !== after.w ? ` (card ${before.w}x${before.h} then ${after.w}x${after.h})` : ''} · report: ${rep.map(e => `${e.n}x "${e.msg}" at "${e.place}"`).join(', ') || 'NONE'}${known ? ` · ${known} error${known === 1 ? '' : 's'} logged by three at the loss` : ''}`);
      for (const e of errs.slice(0, 4)) console.log('     ! ' + e.slice(0, 220));
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        const page = await (await b.newContext({ viewport: { width: before.w + after.w + 40, height: Math.max(before.h, after.h) + 60 } })).newPage();
        await page.setContent(`<body style="margin:0;background:#222;display:flex;gap:8px;padding:8px"><figure style="flex:none;margin:0;color:#fff;font:14px sans-serif"><img src="${before.url}" width=${before.w}><figcaption>before the loss</figcaption></figure><figure style="flex:none;margin:0;color:#fff;font:14px sans-serif"><img src="${after.url}" width=${after.w}><figcaption>after, on the new device</figcaption></figure></body>`);
        await page.screenshot({ path: path.join(shots, id + '.png'), fullPage: true }); await page.close();
      }
    } catch (e) { bad++; console.log(`FAIL ${id} ${String(e.message).split('\n')[0]}`); for (const x of errs.slice(0, 4)) console.log('     ! ' + x.slice(0, 220)); for (const x of warns.slice(0, 3)) console.log('     ~ ' + x.slice(0, 220)); }
    await b.close();
  }
  server.httpServer.close();
  console.log(`\n${list.length} game${list.length === 1 ? '' : 's'}, the device lost by ${how === 'cdp' ? 'crashing the GPU process' : 'destroying it'}${bad ? `: ${bad} to look at` : ': all came back'}`);
  process.exit(bad ? 1 : 0);
})();
