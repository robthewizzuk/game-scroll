// No frame of a view waits for a shader (src/kit/nowait.js), on WebGPU. Draws scripts/no-wait/ twice: with the
// deferral (the default) and without (three builds in the frame), the kit's own builds ahead off in both, and
// checks that with it:
//  - no shader text is written and no pipeline made at once in a frame, for a thing added and a thing switched on;
//  - a light added (every lit shader new at once) is built in its frame as three does: the scene never goes;
//  - each of them still shows (a few frames later), and no pipeline is refused (a build for the wrong picture);
//  - once everything is built the picture is the one drawn without it;
//  - a thing put off and thrown away before its turn leaves no error behind (the page's errors fail it).
// Without it the same steps must write shader text in their frames (or the page shows nothing).
// Usage: node scripts/no-wait.cjs
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const vite = await import('vite');
  const port = 4189;
  const server = await vite.createServer({ server: { port, hmr: false, watch: null }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const run = async nw => {
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(`http://localhost:${port}/scripts/no-wait/?nw=${nw}`); await p.waitForFunction(() => window.result, null, { timeout: 600000 });
    const r = await p.evaluate(() => window.result); r.errs = errs; await p.close(); return r;
  };
  let bad = 0;
  const say = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); };
  const on = await run(1), off = await run(0);
  for (const r of [on, off]) if (r.error || r.errs.length) say(false, `${r.nw ? 'with' : 'without'} it: ${r.error || r.errs.slice(0, 3).join(' | ')}`);
  if (!on.error && !off.error) {
    for (const k of Object.keys(on.phases)) {
      const a = on.phases[k], z = off.phases[k];
      if (k === 'a light added') { say(a.shownAt === 0, `${k}: built in its frame as three does (a change of lights is every lit shader at once): the ground still drawn in that frame (${a.shownAt}), ${a.text.length} shader texts in it (without: ${z.text.length})`); console.log(`     ${k}: longest frame ${a.worst.toFixed(0)} ms with it, ${z.worst.toFixed(0)} ms without`); continue; }
      say(a.text.length === 0 && a.pipes.length === 0, `${k}: in the frames, with it: shader text ${a.text.length}, pipelines made at once ${a.pipes.length} (${[...a.text, ...a.pipes].slice(0, 4).join(', ') || 'none'}); without: ${z.text.length} and ${z.pipes.length}`);
      if (a.shownAt !== undefined && k !== 'a light added') say(a.shownAt >= 0, `${k}: shows ${a.shownAt} frames after (without it: ${z.shownAt}); longest frame ${a.worst.toFixed(0)} ms with it, ${z.worst.toFixed(0)} ms without`);
      else console.log(`     ${k}: longest frame ${a.worst.toFixed(0)} ms with it, ${z.worst.toFixed(0)} ms without, settled in ${a.frames} frames (${z.frames} without)`);
    }
    say(off.phases['new thing'].text.length > 0, `without it, the new thing's shader text is written in its frame (${off.phases['new thing'].text.length}): the page tests something`);
    say(on.refused.length === 0, `pipelines the chip refused: ${on.refused.length} (${on.refused.slice(0, 3).join(', ') || 'none'})`);
    let d = 0, big = 0; for (let i = 0; i < on.pix.length; i++) { const e = Math.abs(on.pix[i] - off.pix[i]); d += e; if (e > 24) big++; }
    say(big < on.pix.length * .005, `the picture once all is built, against without it: mean difference ${(d / on.pix.length).toFixed(2)}, ${big} of ${on.pix.length} values more than 24 apart`);
    console.log(`     put off: ${on.stats.texts} shader texts and ${on.stats.pipes} pipelines, ${on.stats.built} built, ${on.stats.failed} failed, ${on.stats.dropped} dropped; first frames ${on.startFrames} (longest ${on.firstWorst.toFixed(0)} ms) with it, ${off.startFrames} (${off.firstWorst.toFixed(0)} ms) without`);
    console.log(`     last put off: ${on.stats.names.join('; ')}`);
  }
  await b.close(); await server.close();
  process.exit(bad ? 1 : 0);
})();
