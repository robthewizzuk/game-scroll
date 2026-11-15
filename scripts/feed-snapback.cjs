// Feed "jumps back": flicks down the feed with a finger, like a phone, and watches every frame for the feed
// moving back up by itself (no finger on it) after a swipe, or a swipe that lands back where it started.
// Usage: npm run build:bundled && node scripts/feed-snapback.cjs [swipes] [--filter nextgen] [--cpu 4]
// Env: GAP=ms between swipes (900), V=1 lists each swipe, DIRECT=1 shows 3D the way the phone apps do,
// RESIZE=ms a resize that long after each flick (BARS=px: a real one, the screen that much shorter and back),
// DIST / MS: the flick's length (300 px) and time (110 ms).
const { chromium } = require('playwright');
(async () => {
  const args = process.argv.slice(2), N = +args.find(a => /^\d+$/.test(a)) || 20;
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const filter = opt('--filter'), CPU = +(opt('--cpu') || 1), GAP = +(process.env.GAP || 900);
  const server = await (await import('vite')).preview({ preview: { port: 4189 } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  if (process.env.DIRECT) await p.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await p.addInitScript(() => {
    window.__fingers = 0; window.__log = [];
    window.__ev = []; window.__lt = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
    for (const k of ['touchstart', 'touchmove', 'touchend']) addEventListener(k, e => window.__ev.push([k, e.timeStamp, performance.now(), e.touches[0]?.clientY | 0]), { capture: true, passive: true });
    addEventListener('touchstart', e => { window.__fingers = e.touches.length; }, true);
    addEventListener('touchend', e => { window.__fingers = e.touches.length; }, true);
    addEventListener('touchcancel', e => { window.__fingers = e.touches.length; }, true);
    // where the feed is, in cards: each card gets a number the first time it's seen (new cards join at the end), so
    // cards taken away above (old ones tidied away) don't count as the feed moving
    const ser = new WeakMap(); let next = 0;
    // 3D work while the feed is moving: the shared 3D canvas going onto a card (its first live frame)
    window.__mounts = [];
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeName === 'CANVAS' && n.classList.contains('hd-layer')) window.__mounts.push(performance.now()); }).observe(document, { subtree: true, childList: true });
    window.__scrolls = []; addEventListener('scroll', () => window.__scrolls.push(performance.now()), { capture: true, passive: true });
    window.__where = () => {
      const f = document.getElementById('feed'); if (!f) return null;
      const ft = f.getBoundingClientRect().top, h = f.clientHeight; let best = null, bd = 1e9;
      for (const el of f.children) { if (!el.classList.contains('slide')) continue; if (!ser.has(el)) ser.set(el, next++); const d = el.getBoundingClientRect().top - ft; if (Math.abs(d) < Math.abs(bd)) { bd = d; best = el; } }
      return best ? { at: ser.get(best) - bd / h, h } : null;
    };
    const tick = () => { const w = window.__where(); if (w) window.__log.push([performance.now(), w.at, 1, window.__fingers, window.__gs?.active ? window.__gs.active.def.id : null]); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  p.on('pageerror', e => console.log('page error:', e.message));
  await p.goto('http://localhost:4189/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  if (filter) { await p.evaluate(f => { const o = document.querySelector(`[data-f="${f}"]`); o && o.click(); }, filter); await p.waitForTimeout(3000); }
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const card = () => p.evaluate(() => ({ at: window.__where().at, id: window.__gs?.active?.def.id }));
  await p.evaluate(() => { window.__log.length = 0; });
  const T = (type, y, timestamp) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 360, y }], timestamp });
  const rows = [];
  for (let i = 0; i < N; i++) {
    const before = await card(), t0 = await p.evaluate(() => performance.now());
    // a flick up the caption area: about 100 ms, 400 px, then let go (scroll snap does the rest)
    // (each touch carries its own time, so the flick's speed is the same however slowly the test's messages get there)
    { const t = Date.now() / 1000, D = +(process.env.DIST || 300), MS = +(process.env.MS || 110); await T('touchStart', 740, t); for (let k = 1; k <= 6; k++) await T('touchMove', 740 - D * k / 6, t + MS / 6000 * k); await T('touchEnd', 0, t + MS / 1000 + .008); }
    // RESIZE=ms: the window says it was resized that long after the finger lets go (a fold, system bars, the top bar moving)
    // BARS=px: the screen really changes size by that much instead, back and forth (system bars that take room)
    if (process.env.RESIZE) { await p.waitForTimeout(+process.env.RESIZE); if (process.env.BARS) await p.setViewportSize({ width: 390, height: 844 - (i % 2 ? 0 : +process.env.BARS) }); else await p.evaluate(() => dispatchEvent(new Event('resize'))); }
    await p.waitForTimeout(GAP + (i % 3) * 150);
    const after = await card(), t1 = await p.evaluate(() => performance.now());
    rows.push({ i, from: before, to: after, t0, t1 });
    if (process.env.V) console.log(`swipe ${i}: ${before.at.toFixed(2)} ${before.id} -> ${after.at.toFixed(2)} ${after.id}`);
  }
  const log = await p.evaluate(() => window.__log), ev = await p.evaluate(() => window.__ev), lt = await p.evaluate(() => window.__lt);
  // jump back: with no finger down, the feed moves up (towards earlier cards) by more than a fifth of a card after
  // having been further on, within one swipe's window
  let backs = 0, stuck = 0, half = 0;
  for (const r of rows) {
    const L = log.filter(x => x[0] >= r.t0 && x[0] <= r.t1);
    let far = -1e9;
    for (const [t, y, h, f] of L) {
      if (y > far) far = y;
      if (!f && far - y > h * .2) { backs++; console.log(`swipe ${r.i}: JUMPED BACK ${((far - y) / h).toFixed(2)} cards at +${(t - r.t0).toFixed(0)} ms (${r.from.id} -> ${r.to.id})`);
        if (process.env.V) { console.log('   frames', L.map(x => `+${(x[0] - r.t0).toFixed(0)}:${((x[1] - L[0][1]) / h).toFixed(2)}${x[3] ? 'f' : ''}`).join(' ')); console.log('   touches', ev.filter(e => e[1] >= r.t0 - 50 && e[1] <= r.t1).map(e => `${e[0].slice(5)} t+${(e[1] - r.t0).toFixed(0)} got+${(e[2] - r.t0).toFixed(0)} y${e[3]}`).join(', ')); console.log('   long tasks', lt.filter(([s0, d]) => s0 + d >= r.t0 && s0 <= r.t1).map(([s0, d]) => `+${(s0 - r.t0).toFixed(0)} ${d.toFixed(0)}ms`).join(', ')); }
        break; }
    }
    if (Math.round(r.to.at) <= Math.round(r.from.at)) { stuck++; console.log(`swipe ${r.i}: did not move on (${r.from.at.toFixed(2)} -> ${r.to.at.toFixed(2)}, ${r.from.id})`); }
    if (Math.abs(r.to.at - Math.round(r.to.at)) > .02) { half++; console.log(`swipe ${r.i}: left between cards at ${r.to.at.toFixed(2)}`);
      if (process.env.V) { const L2 = log.filter(x => x[0] >= r.t0 && x[0] <= r.t1 + 1500); console.log('   frames', L2.map(x => `+${(x[0] - r.t0).toFixed(0)}:${(x[1] / x[2]).toFixed(2)}${x[3] ? 'f' : ''}`).join(' ')); console.log('   long tasks', lt.filter(([s0, d]) => s0 + d >= r.t0 && s0 <= r.t1 + 1500).map(([s0, d]) => `+${(s0 - r.t0).toFixed(0)} ${d.toFixed(0)}ms`).join(', ')); } }
  }
  console.log(`${N} swipes${filter ? ' (' + filter + ')' : ''}, CPU ${CPU}x: ${backs} jumped back, ${stuck} did not move on, ${half} left between cards`);
  // feed work that ran while the feed was moving (a finger on it, or within 150 ms of it scrolling): 3D cards'
  // first live frames and loading passes of cards being made (by when each began)
  const { mounts, passes, scrolls } = await p.evaluate(() => ({ mounts: window.__mounts, passes: (window.__gs.passes || []).map(x => [x.at - x.ms, x.ms]), scrolls: window.__scrolls }));
  const t0 = rows[0].t0, tEnd = rows[rows.length - 1].t1;
  const moving = t => log.some(x => x[3] && Math.abs(x[0] - t) < 20) || scrolls.some(s0 => t >= s0 && t - s0 < 150);
  const inRun = t => t >= t0 && t <= tEnd;
  const m = mounts.filter(inRun), ps = passes.filter(([t]) => inRun(t));
  const mm = m.filter(moving), pm = ps.filter(([t]) => moving(t));
  if (process.env.V) for (const [t, ms] of pm) { const sc = scrolls.filter(s0 => s0 <= t).pop(); const f = log.filter(x => x[0] <= t).pop(); console.log(`    pass at +${(t - t0).toFixed(0)} (${ms.toFixed(0)} ms): last scroll ${sc ? (t - sc).toFixed(0) : '?'} ms before, finger ${f ? f[3] : '?'}`); }
  console.log(`  3D canvas put on a card: ${m.length}, ${mm.length} while moving; loading passes: ${ps.length} (${ps.reduce((a, x) => a + x[1], 0).toFixed(0)} ms), ${pm.length} while moving (${pm.reduce((a, x) => a + x[1], 0).toFixed(0)} ms)`);
  await b.close(); server.httpServer.close(); process.exit(0);
})();
