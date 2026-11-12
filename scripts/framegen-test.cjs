// Checks WebGPU frame generation (src/kit/framegen.js) against the truth: a test scene is drawn at three
// real moments, the frames in between (or past the newest) are made, and each is scored against the
// scene really drawn then. Error is the mean difference out of 255 and broken is the share of pixels off
// by more than 40 (a visible break); both should beat showing the last frame again. Uses SwiftShader's
// Vulkan driver, so it runs without a GPU (ms is software time, a rough guide only).
//   node scripts/framegen-test.cjs [--scale 1.5] [--mode ahead] [--steps 3] [--hard] [--shots dir]
// --hard runs the hard cases instead: a see-through ball, glowing sparks (plain, and ones that say how
// they move), smoke and SGSR 2's camera jitter. --steps 3 makes two frames between each pair (40 fps on 120 Hz).
// --kinds shadow,scroll,cut: what the game's motion doesn't describe (the optical flow's cases) and a cut.
// --kinds copies: things drawn as gs.props copies, changing detail level at the newest real frame.
//   node scripts/framegen-test.cjs --check [--save]
// The quality check the PR check runs when frame generation's code changes: every suite below, each
// scene no worse than scripts/framegen-test/baseline.json (and better than repeating a frame). --save
// writes the baseline after a change that is meant to move the numbers (say why in the PR).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const HARD = 'glass,sparks,sparks-moving,smoke,jitter', FLOW = 'shadow,scroll,cut';
const SUITES = {
  blend: '&kinds=still,strafe,turn,pan,curve,aim', ahead: '&mode=ahead',
  hard: `&kinds=${HARD}`, 'hard-ahead': `&kinds=${HARD}&mode=ahead`,
  thirds: '&steps=3', 'thirds-ahead': '&steps=3&mode=ahead',
  upscaled: '&scale=1.5', 'upscaled-hard': `&scale=1.5&kinds=${HARD}`,
  flow: `&kinds=${FLOW}`, 'flow-ahead': `&kinds=${FLOW}&mode=ahead`, 'flow-upscaled': `&scale=1.5&kinds=${FLOW}`,
  // the last frame's picture handed in instead of copied (how the app feeds it): the same numbers as blend's
  handed: '&kinds=strafe,pan,curve&handed',
  // and with the made frame kept in 8 bits (what the app does when the screen is not HDR): within a hundredth of handed's
  eight: '&kinds=strafe,pan,curve&handed&eight',
  // gs.props copies on WebGPU (hd3d-gpu.js gpuProps), every one in the middle distance changing detail
  // level at the newest real frame: a copy's motion must be its own, whatever place in the list it takes
  copies: '&kinds=copies', 'copies-ahead': '&kinds=copies&mode=ahead',
};
const BASELINE = path.join(__dirname, 'framegen-test', 'baseline.json');
// how much worse than the baseline a scene may score before the check fails (SwiftShader gives the same
// numbers run to run on one machine; this leaves room for another CPU's rounding)
const slack = (now, was) => now > was * 1.1 + .1;

(async () => {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const check = argv.includes('--check'), save = argv.includes('--save'), shots = opt('--shots');
  let runs;
  if (check || save) runs = Object.entries(SUITES);
  else {
    const kinds = argv.includes('--hard') ? HARD : opt('--kinds') || 'still,strafe,turn,pan,curve';
    runs = [['run', `&scale=${opt('--scale') || '1'}&mode=${opt('--mode') || 'blend'}&steps=${opt('--steps') || '2'}&kinds=${kinds}${shots ? '&shots' : ''}${opt('--query') || ''}`]];
  }
  const vite = await import('vite');
  const port = 4187 + Math.floor(Math.random() * 50);
  const server = await vite.createServer({ server: { port, strictPort: false }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const url = server.resolvedUrls.local[0];
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const saved = {};
  let bad = 0;
  for (const [name, q] of runs) {
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto(`${url}scripts/framegen-test/?${q.replace(/^&/, '')}`);
    await p.waitForFunction(() => window.result, null, { timeout: 600000 }).catch(() => {});
    const res = await p.evaluate(() => window.result || { error: 'no result' });
    await p.close();
    if (res.error) { console.log('FAIL', name, res.error, errs.join('\n')); bad++; continue; }
    console.log(`${runs.length > 1 ? name + ': ' : ''}${res.mode}, drawn at 1/${res.scale} size, made at t = ${res.times.join(', ')}; error out of 255 and broken % (lower is better)`);
    saved[name] = {};
    for (const [k, s] of Object.entries(res.scenes)) {
      const f = s.framegen, rp = s.repeat, was = base[name]?.[k];
      saved[name][k] = f;
      let why = '';
      // made frames must be closer to the truth than repeating a frame, with fewer visible breaks
      // (a cut can at best show a real frame: the one due, never a mix of two scenes)
      const keep = k === 'still' || k === 'cut';
      if (!keep && (f.error >= rp.error || f.broken >= rp.broken)) why = 'not better than repeating a frame';
      if (k === 'still' && f.error > rp.error + .5) why = 'a still scene changed';
      if (k === 'cut' && (f.error > rp.error + .5 || f.broken > rp.broken + .5)) why = 'a cut mixed two scenes';
      if (check && !save && was && (slack(f.error, was.error) || slack(f.broken, was.broken))) why = `worse than the baseline (${was.error} / ${was.broken}%)`;
      if (why) bad++;
      console.log(`  ${k.padEnd(13)} framegen ${String(f.error).padStart(5)} / ${String(f.broken).padStart(5)}%   repeat ${String(rp.error).padStart(5)} / ${String(rp.broken).padStart(5)}%` + (s.mix ? `   mix ${String(s.mix.error).padStart(5)} / ${String(s.mix.broken).padStart(5)}%` : '') + `   ${s.ms} ms` + (why ? `   FAIL: ${why}` : ''));
    }
    if (errs.length) console.log('  console:\n    ' + [...new Set(errs)].slice(0, 12).join('\n    '));
    if (shots) { fs.mkdirSync(shots, { recursive: true }); for (const [k, u] of Object.entries(res.shots)) fs.writeFileSync(path.join(shots, k + '.png'), Buffer.from(u.split(',')[1], 'base64')); console.log('shots in', shots); }
  }
  await b.close(); await server.close();
  if (save && !bad) {
    // one line a scene, so a change to the baseline reads well in a diff
    const txt = '{\n' + Object.entries(saved).map(([n, sc]) => `  ${JSON.stringify(n)}: {\n` + Object.entries(sc).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n  }').join(',\n') + '\n}\n';
    fs.writeFileSync(BASELINE, txt); console.log('baseline saved to', path.relative(process.cwd(), BASELINE));
  }
  console.log(bad ? `FAIL ${bad} scene(s)` : 'ok');
  process.exit(bad ? 1 : 0);
})();
