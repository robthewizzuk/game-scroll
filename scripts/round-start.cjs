// How a 3D round starts: Play on each Next Gen, AR and Board game goes through the app's loading screen
// (getReady in src/main.js, src/kit/getready.js), and this says how long that took and what the round's
// first frames were like once it lifted.
// Usage: npm run build:bundled && node scripts/round-start.cjs [ids...] [--webgpu] [--now] [--jobs n] [--strict]
//   no ids: every Next Gen, AR and Board game
//   --webgpu   draw with WebGPU (in software: slow, and its frame times jump about)
//   --now      the old way, for comparison: the round starts the instant Play is pressed (__gs.start())
//   --jobs n   browsers at once (default 2; more is quicker, and makes the frame times noisier)
//   --strict   exit 1 if a round never started, started with things hidden, or a game threw
// Env: CPU=4 slows the processor 4 times (like a mid-range phone).
// For each game: "ready" is Play to the round starting; "under cover" the frames drawn behind the loading
// screen, the longest of them, and the most things that were hidden there waiting for a shader; then the
// round itself: its usual gap between frames and its first five. The verdict is
//   ok          the round started with everything in, and its first frames were like the rest
//   HIDDEN n    n things were still hidden (their shaders not built) in the round's first three frames
//   LONG a,b    first frames more than 2.2 times the usual one: something was still built as the round started
//   NEVER       the round did not start
// "(later n)" is not a fault: things the game made later in the round were hidden for a moment while
// theirs built, which is what keeps a round smooth. The headless browser draws in software, so read the
// numbers against each other (with and without --now), not against a phone.
const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; }, flag = n => { const i = args.indexOf(n); if (i >= 0) args.splice(i, 1); return i >= 0; };
  const gpu = flag('--webgpu'), old = flag('--now'), strict = flag('--strict'), jobs = +(opt('--jobs') || 2), CPU = +(process.env.CPU || 1);
  const server = await (await import('vite')).preview({ preview: { port: 4196 } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const open = async () => {
    const b = await chromium.launch(gpu ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } } : {});
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 }), p = await ctx.newPage(), w = { b, p, errs: [] };
    p.on('pageerror', e => w.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) w.errs.push(m.text()); });
    await p.goto('http://localhost:4196/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 });
    if (CPU > 1) await (await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
    return w;
  };
  const first = await open();
  const eras = await first.p.evaluate(() => Object.fromEntries(__gs.GAMES.map(g => [g.id, g.era])));
  const ids = args.filter(a => !a.startsWith('--')), queue = ids.length ? ids.slice() : Object.keys(eras).filter(id => ['nextgen', 'ar', 'board'].includes(eras[id]));
  const total = queue.length; let bad = 0;
  const run = async w => {
    for (let id; (id = queue.shift());) {
      const { p } = w; w.errs = [];
      try {
        await p.evaluate(id => __gs.only(id, true), id); await p.waitForTimeout(300);
        if (gpu && !w.gpu) { w.gpu = await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); return !!(await window.__gpu.ready()); }); await p.evaluate(id => __gs.only(id, true), id); }
        await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 300000 });
        await p.waitForTimeout(2500);   // the card's own first pictures, as a player who reads the hint has had
        await p.evaluate(old => {
          const L = window.__L = { t0: performance.now(), began: 0, gaps: [], held: [], warm: [], heldWarm: 0, what: '' }; let last = 0, n = 0;
          const f = t => {
            if (n++ > 3000 || L.stop) return; requestAnimationFrame(f);
            const s = __gs.active, h = window.__hdView?.held?.size | 0;
            if (s.state === 'playing') { if (!L.began) L.began = t - L.t0; else L.gaps.push(Math.round(t - last)); L.held.push(h); }
            else if (s.starting) { if (last) L.warm.push(Math.round(t - last)); L.heldWarm = Math.max(L.heldWarm, h); L.what = s.starting.what || L.what; }
            last = t;
          };
          requestAnimationFrame(f);
          if (old) __gs.start(); else __gs.play();
        }, old);
        await p.waitForFunction(() => __L.began > 0, null, { timeout: 60000 }).catch(() => {});
        await p.waitForTimeout(4000);
        const L = await p.evaluate(() => { __L.stop = true; return { ...__L, back: window.__hd?.info.backend || '', state: __gs.active.state }; });
        const g = L.gaps.slice().sort((a, b) => a - b), med = g[g.length >> 1] || 0, held = Math.max(0, ...L.held.slice(0, 3)), later = Math.max(0, ...L.held.slice(3, 40));
        const long = L.gaps.slice(0, 6).filter(x => x > Math.max(60, med * 2.2));
        const verdict = !L.began ? 'NEVER' : held ? `HIDDEN ${held}` : long.length ? `LONG ${long.join(',')}` : 'ok';
        if (!L.began || held || w.errs.length) bad++;
        console.log(`${verdict === 'ok' ? 'ok  ' : 'LOOK'} ${id.padEnd(18)} ${String(eras[id]).padEnd(8)} ${String(L.back).padEnd(6)} ready ${String(Math.round(L.began)).padStart(6)} ms · under cover ${String(L.warm.length).padStart(3)} frames, longest ${String(Math.max(0, ...L.warm)).padStart(5)} ms, hidden ${String(L.heldWarm).padStart(3)}${L.what ? ' (' + L.what + ')' : ''} · round: usual ${med} ms, first ${L.gaps.slice(0, 5).join(' ')} · ${verdict}${later ? ` (later ${later})` : ''}${w.errs.length ? '\n     ! ' + w.errs[0].slice(0, 200) : ''}`);
      } catch (e) { bad++; console.log(`FAIL ${id} ${String(e.message).split('\n')[0]}`); }
    }
    await w.b.close();
  };
  const ws = [first]; for (let i = 1; i < Math.min(jobs, total); i++) ws.push(await open());
  await Promise.all(ws.map(run));
  server.httpServer.close();
  console.log(`\n${total} game${total === 1 ? '' : 's'}${old ? ', started the old way (no loading screen)' : ''}${bad ? `: ${bad} to look at` : ''}`);
  process.exit(strict && bad ? 1 : 0);
})();
