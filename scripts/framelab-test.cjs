// Checks the frame lab (src/framelab.js): turns it on, plays a 2D game and a Next Gen game (on WebGPU where
// the test browser has it), records, runs A/B, Shimmer, FG check and Half check, folds and unfolds (Galaxy Z Fold 8
// sizes) and makes the report. Fails on any page error or a tool that doesn't produce its result.
//   npm run build:bundled && node scripts/framelab-test.cjs [--shots dir] [--report file.html] [2d-id] [3d-id]
// Timings here are software 3D and mean nothing; this checks that the tools work, not how fast games are.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SIZES = { cover: { width: 374, height: 591 }, inner: { width: 549, height: 735 } };
(async () => {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const shots = opt('--shots'), reportFile = opt('--report'); if (shots) fs.mkdirSync(shots, { recursive: true });
  const [id2d = 'stack', id3d = 'bunker-breakout'] = argv;
  const server = await (await import('vite')).preview({ preview: { port: 4187 } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const ctx = await b.newContext({ viewport: SIZES.cover, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(), errs = [], fails = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/\[framelab\]/.test(m.text())) errs.push(m.text()); });
  const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
  const shot = async name => { if (!shots) return; const t = Date.now(); await p.screenshot({ path: path.join(shots, name + '.png'), timeout: 120000 }).catch(e => console.log('   (no screenshot ' + name + ': ' + e.message.split('\n')[0] + ')')); if (Date.now() - t > 5000) console.log(`   (screenshot ${name} took ${Date.now() - t} ms)`); };
  const play = async ms => {
    const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await p.evaluate(() => __gs.active.state) !== 'playing') await p.evaluate(() => __gs.start());
      const x = r.x + r.w * (.2 + .6 * Math.random()), y = r.y + r.h * (.45 + .45 * Math.random());
      await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 40 * (Math.random() - .5), y + 40 * (Math.random() - .5), { steps: 3 });
      await p.waitForTimeout(80 + Math.random() * 120); await p.mouse.up();
    }
  };
  await p.goto('http://localhost:4187/?lab'); await p.waitForFunction(() => window.__gs, null, { timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('.fl'), null, { timeout: 10000 }).catch(() => {});
  check(await p.evaluate(() => !!document.querySelector('.fl')), 'lab opens from ?lab');

  // 2D: record a few seconds of play
  await p.evaluate(id => __gs.only(id), id2d); await p.waitForTimeout(500);
  const lab = () => p.evaluate(() => __gs.lab(true));
  await lab(); await p.evaluate(() => __gs.start());
  await p.evaluate(async () => (await __gs.lab(true)).rec(true));
  await play(3500);
  // a freeze (the page held for 400 ms in play): counted on its own, as the frame rate leaves gaps that long out
  // (in play: a round that ended while it was played counts no hitches)
  const inPlay = async () => { if (await p.evaluate(() => __gs.active.state) !== 'playing') { await p.evaluate(() => __gs.start()); await p.waitForTimeout(400); } };
  await inPlay();
  await p.evaluate(() => { const t = performance.now(); while (performance.now() - t < 400); }); await p.waitForTimeout(400);
  await inPlay();
  // a frame whose own draw() takes 300 ms: the gap after it is put down to the game's CPU, not "no cause seen"
  // (the gap that ends at a refresh was made by the frame before it)
  await p.evaluate(() => { const g = __gs.active.game, d = g.draw; let once = true; g.draw = function (...a) { if (once) { once = false; const t = performance.now(); while (performance.now() - t < 300); } return d.apply(this, a); }; });
  await p.waitForTimeout(600);
  { const ev = await p.evaluate(async () => (await __gs.lab(true)).events.filter(e => e.k === 'H' && e.ms >= 250).map(e => e.text));
    check(ev.some(t => /game CPU over the beat \(update [\d.]+ \+ draw (\d+)/.test(t) && +/draw (\d+)/.exec(t)[1] >= 250), `${id2d}: a 300 ms draw() is named as the cause of the gap after it (${ev.join(' | ') || 'no hitch'})`); }
  const sum2 = await p.evaluate(async () => { const L = await __gs.lab(true); L.rec(false); return L.summary(); });
  { const fz = /(\d+) freezes? of 250 ms or more \(worst (\d+) ms/.exec(sum2); check(fz && +fz[1] >= 1 && +fz[2] >= 300, `${id2d}: a 400 ms freeze in play is counted`); }
  console.log('   ' + sum2.split('\n').join('\n   '));
  check(/avg [\d.]+ fps/.test(sum2), `${id2d}: recording measures fps, lows and pacing`);
  check(await p.evaluate(() => /fps/.test(document.querySelector('.fl-sum').textContent)), `${id2d}: live numbers in the panel`);
  await shot('2d-cover');

  // fold open mid-round: the panel stays on screen and the resize shows up as an event
  await p.setViewportSize(SIZES.inner); await p.waitForTimeout(900);
  const box = await p.evaluate(() => { const r = document.querySelector('.fl').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
  check(box.l >= 0 && box.r <= box.vw + 1 && box.t >= 0 && box.b <= box.vh, `panel on screen unfolded (${Math.round(box.r - box.l)}x${Math.round(box.b - box.t)} of ${box.vw}x${box.vh})`);
  check(await p.evaluate(async () => (await __gs.lab(true)).events.some(e => e.k === 'F')), 'fold logged as an event');
  await shot('2d-inner');
  await p.setViewportSize(SIZES.cover); await p.waitForTimeout(600);

  // Next Gen on WebGPU where there is one
  await p.evaluate(id => __gs.only(id), id3d);
  await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 });
  const gpu = await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); return !!(await window.__gpu.ready()); });
  await p.evaluate(() => { __hd.fgGap = 5000; __gs.start(); }); await p.waitForTimeout(1500);
  await p.evaluate(async () => (await __gs.lab(true)).rec(true));
  await play(4000);
  const info = await p.evaluate(() => ({ ...__hd.info }));
  check(info.rw > 0 && info.ow > 0, `${id3d}: resolution counter (3D ${info.rw}x${info.rh} -> ${info.ow}x${info.oh}, ${info.backend}${gpu ? '' : ', no WebGPU here'})`);
  const txt = await p.evaluate(() => document.querySelector('.fl pre').textContent);
  check(/3D \d+×\d+ → \d+×\d+/.test(txt), `${id3d}: panel shows the 3D size`);
  await shot('3d-cover');

  const ab = async key => {
    const n0 = await p.evaluate(async () => (await __gs.lab(true)).shots.length);
    await p.evaluate(async k => (await __gs.lab(true)).ab(k), key);
    const n1 = await p.evaluate(async () => (await __gs.lab(true)).shots.length);
    const open = await p.evaluate(() => !!document.querySelector('.fl-view'));
    check(n1 === n0 + 1 && open, `A/B ${key}: two pictures, viewer open`);
    if (open && key === 'sgsr') {
      for (const m of ['wipe', 'side', 'diff', 'flip']) { await p.click(`.fl-view [data-m="${m}"]`); await p.waitForTimeout(150); if (m === 'side') { await p.click('.fl-view [data-z="8"]'); await shot('ab-side-8x'); } }
      await p.click('.fl-view [data-z="1"]'); await p.click('.fl-view [data-m="wipe"]'); await shot('ab-wipe');
    }
    await p.evaluate(() => document.querySelector('.fl-view [data-a="x"]')?.click());
  };
  await ab('sgsr');
  await ab('res');
  await ab('sgsrTune');   // SGSR 2 as Qualcomm has it against ours
  if (gpu) {   // textures as drawn against sharpened under SGSR 2 (WebGPU): only while it upscales, so draw smaller for it
    await p.evaluate(() => { __hd.scale = .67; }); await play(1500);
    await ab('mip');
    await p.evaluate(() => { __hd.scale = null; }); await play(600);
  }
  if (gpu) await ab('backend');
  const restored = await p.evaluate(() => ({ up: __hd.upscale, sc: __hd.scale, f: __hd.force, tune: __hd.sgsrTune, mip: __hd.mipBias }));
  check(restored.up === true && restored.sc == null && restored.f == null && restored.tune === true && restored.mip == null, 'A/B puts the settings back');

  // effects that step down by their own cost (hd3d.js FXS): drawn smaller with no shader built again, shown in the panel and the events
  if (gpu && info.backend === 'webgpu') {
    await p.evaluate(() => { __hd.force = 3; }); await play(2500);   // (ultra: ambient occlusion and bloom on)
    let parts = [];
    for (let i = 0; i < 8 && !parts.includes('ao'); i++) { await play(1000); parts = await p.evaluate(() => Object.keys(__hd.info.gpuParts || {})); }
    check(parts.includes('ao') && parts.includes('bloom'), `the chip's time comes back by effect: ${parts.join(', ')}`);
    const n0 = await p.evaluate(async () => (await __gs.lab(true)).events.length);
    await p.evaluate(() => { __hd.fxStep('ao', 2); __hd.fxStep('bloom', 1); }); await play(1500);
    const fx = await p.evaluate(async n0 => ({ fx: __hd.fx, txt: document.querySelector('.fl pre').textContent, ev: (await __gs.lab(true)).events.slice(n0).filter(e => e.k === 'Q' || e.k === 'S').map(e => e.text) }), n0);
    check(fx.fx.ao === .5 && fx.fx.bloom === .7 && /smaller: ao 50%, bloom 70%/.test(fx.txt), 'effects drawn smaller show in the panel: ' + JSON.stringify(fx.fx));
    check(fx.ev.some(t => /effects: ao 50%/.test(t)) && !fx.ev.some(t => /shader/.test(t)), 'and as an event, with no shader built for it: ' + fx.ev.join('; '));
    await p.evaluate(() => { __hd.fxStep('ao', 0); __hd.fxStep('bloom', 0); __hd.force = null; }); await play(800);
    // short of memory: the first resolution step at once, mid-round (and the lab says so)
    await p.evaluate(async () => (await __gs.lab(true)).memory(2)); await play(1200);
    const m = await p.evaluate(() => ({ res: __hd.res, txt: document.querySelector('.fl pre').textContent }));
    check(m.res <= .85 && /memory low/.test(m.txt), `short of memory: the 3D drops a resolution step (${m.res}) and the panel says memory low`);
    await p.evaluate(async () => (await __gs.lab(true)).memory(null));
  }

  await p.evaluate(async () => (await __gs.lab(true)).shimmer());
  const sh = await p.evaluate(async () => { const L = await __gs.lab(true); const s = L.shots[L.shots.length - 1]; return s && s.kind === 'shimmer' ? s.notes.slice(0, -1).join('; ') : ''; });
  check(!!sh && await p.evaluate(() => __hd.sgsrTune === true), 'shimmer scan: ' + sh); await shot('shimmer');
  await p.evaluate(() => document.querySelector('.fl-view [data-a="x"]')?.click());

  if (gpu && info.backend === 'webgpu') {
    // the test browser is too slow to have refreshes between frames: run them by hand, as framegen-games.cjs does
    await p.evaluate(() => { __hd.direct = true; __hd.scale = .45; __hd.aim = false; const prev = __hd.fgTap; __hd.fgTap = (k, cv, w) => { prev?.(k, cv, w); if (w === 'frame') setTimeout(() => __hd.between(), 0); }; });
    await p.evaluate(() => { window.__fgDone = false; __gs.lab(true).then(L => L.fg()).then(m => { window.__fgMsg = m; }, e => { window.__fgMsg = 'Error ' + e; }).finally(() => { window.__fgDone = true; }); });
    for (let i = 0; i < 12 && !await p.evaluate(() => window.__fgDone); i++) await play(1500);
    await p.waitForFunction(() => window.__fgDone, null, { timeout: 60000 });
    const fg = await p.evaluate(async () => { const L = await __gs.lab(true); const s = L.shots[L.shots.length - 1]; return s && s.kind === 'fg' ? s.notes[0] : String(window.__fgMsg); });
    console.log('   FG check: ' + fg);
    check(!/did not|Error/.test(fg), 'FG check runs');
    if (/made frames checked/.test(fg)) await shot('fg-check');
    await p.evaluate(() => { document.querySelector('.fl-view [data-a="x"]')?.click(); __hd.direct = false; __hd.scale = null; __hd.aim = true; });
  } else console.log('SKIP FG check (no WebGPU in this browser)');

  if (gpu && info.backend === 'webgpu') {
    // half precision (src/kit/half.js): this browser's WebGPU has none, so it says so; pretending it had (drawn in full)
    // tries the switch, the chain built again each way and the Half check's report
    const no = await p.evaluate(() => __hd.info.half);
    check(/no half/.test(no), 'half precision: this chip has none and says so: ' + no);
    await p.evaluate(() => { __hd.halfPretend = true; }); await play(800);
    await p.evaluate(async () => (await __gs.lab(true)).half());
    const hc = await p.evaluate(async () => { const L = await __gs.lab(true); const s = L.shots[L.shots.length - 1]; return { notes: s && s.kind === 'half' ? s.notes : [], half: __hd.half, info: __hd.info.half }; });
    console.log('   Half check: ' + hc.notes.join(' | '));
    check(/chip time a frame: full [\d.]+ ms, half [\d.]+ ms/.test(hc.notes[0] || '') && hc.notes.some(n => /^  \w[\w ]*: full/.test(n)) && hc.half === true && /^half/.test(hc.info), 'Half check times full and half by pass and puts the switch back');
    if (hc.notes.length) await shot('half-check');
    await p.evaluate(() => { document.querySelector('.fl-view [data-a="x"]')?.click(); __hd.halfPretend = false; });
    // effects spread over frames (src/kit/hd3d-gpu-spread.js): the Spread check times every sample against spread and puts the switch back
    const spread = await p.evaluate(() => __hd.info.spread);
    if (spread) {
      await p.evaluate(async () => (await __gs.lab(true)).spread());
      const sc = await p.evaluate(async () => { const L = await __gs.lab(true); const s = L.shots[L.shots.length - 1]; return { notes: s && s.kind === 'spread' ? s.notes : [], on: __hd.spread, info: __hd.info.spread }; });
      console.log('   Spread check: ' + sc.notes.join(' | '));
      check(/chip time a frame: every sample [\d.]+ ms, spread [\d.]+ ms/.test(sc.notes[0] || '') && sc.notes.some(n => /^  \w[\w ]*: every sample/.test(n)) && sc.on === true && !!sc.info, 'Spread check times every sample and spread by pass and puts the switch back');
      if (sc.notes.length) await shot('spread-check');
      await p.evaluate(() => { document.querySelector('.fl-view [data-a="x"]')?.click(); });
    } else console.log('SKIP Spread check (nothing spread in this game at this tier: ' + JSON.stringify(spread) + ')');
    // the sky's marched clouds (src/kit/hd3d-gpu-sky.js): the Clouds check times painted against marched and puts the switch back
    const sky = await p.evaluate(() => __hd.info.sky);
    if (/clouds/.test(sky || '')) {
      await p.evaluate(async () => (await __gs.lab(true)).clouds());
      const cc = await p.evaluate(async () => { const L = await __gs.lab(true); const s = L.shots[L.shots.length - 1]; return { notes: s && s.kind === 'clouds' ? s.notes : [], on: __hd.clouds }; });
      console.log('   Clouds check: ' + cc.notes.join(' | '));
      check(/chip time a frame: painted [\d.]+ ms, marched [\d.]+ ms/.test(cc.notes[0] || '') && cc.on === true, 'Clouds check times painted and marched clouds and puts the switch back');
      if (cc.notes.length) await shot('clouds-check');
      await p.evaluate(() => { document.querySelector('.fl-view [data-a="x"]')?.click(); });
    } else console.log('SKIP Clouds check (no marched clouds in this game at this tier: ' + JSON.stringify(sky) + ')');
  }

  await p.evaluate(async () => (await __gs.lab(true)).rec(false));
  const sum3 = await p.evaluate(async () => (await __gs.lab(true)).summary());
  console.log('   ' + sum3.split('\n').join('\n   '));
  check(/avg [\d.]+ fps/.test(sum3), `${id3d}: recording summary`);
  check(/\nQuality steps: (no window of frames counted|\d+ windows \(\d+ slow, \d+ ok, \d+ fast\))/.test(sum3), `${id3d}: the quality steps' windows and what they did are in the summary`);
  const html = await p.evaluate(async () => (await __gs.lab(true)).html());
  check(html.length > 5000 && html.includes('Frame lab report'), `report made (${(html.length / 1048576).toFixed(2)} MB)`);
  if (reportFile) fs.writeFileSync(reportFile, html);
  // the report page itself draws without errors
  const rp = await ctx.newPage(), rerr = []; rp.on('pageerror', e => rerr.push(e.message));
  await rp.setContent(html); await rp.waitForTimeout(400); check(!rerr.length && await rp.evaluate(() => document.querySelectorAll('canvas').length >= 4), 'report page draws its charts' + (rerr.length ? ': ' + rerr.join('; ') : ''));
  if (shots) await rp.screenshot({ path: path.join(shots, 'report.png'), fullPage: true }); await rp.close();

  await p.evaluate(async () => (await __gs.lab(true)).close());
  check(await p.evaluate(() => !document.querySelector('.fl') && !document.querySelector('.fl-tint')), 'lab closes cleanly');
  check(!errs.length, 'no page errors' + (errs.length ? ':\n   ' + errs.join('\n   ') : ''));
  await b.close(); server.httpServer.close();
  console.log(fails.length ? `${fails.length} failed` : 'all passed'); process.exit(fails.length ? 1 : 0);
})();
