// An effect's settings tuned by the computer: a black-box search (CMA-ES, Hansen's covariance matrix adaptation)
// over a cheap effect's numbers, each try scored against the ray traced reference in scripts/tune/ (the truth: a ray
// for every pixel, every frame added). Made to run for hours (overnight); it keeps its state after every round of
// tries and goes on from there with --resume.
//   node scripts/tune.cjs --effect regen [--scenes yard,polished] [--jobs 3] [--rounds 30] [--hours 1.8] [--out .tune]
//   node scripts/tune.cjs --effect regen --resume                go on with the last search (the state in --out)
//   node scripts/tune.cjs --effect regen --check [--scenes yard,polished,hall] [--settings '{"CONE_FULL":.2}' | --best]
//       the settings in the file against the search's best (or those given), scene by scene, with pictures (--shots dir)
// Effects: regen (Ray Regeneration's numbers, hd3d-gpu-trace.js regenSettings), ssr (three's screen-space reflections,
// the ones phones without ray tracing draw: hd3d-gpu-fx.js SSR_SETTINGS), fewer (Ray Regeneration from half the rays,
// for --check). Scenes: yard and polished (scripts/detail-test/regen.html's), hall (the engine test Hall: keep it out of
// the search, to see that what was found holds in a scene it never saw).
// A score is the sum over the scenes of the error against the truth (of 255, over the reflections) still, at a walk
// and at a sprint, half of each's specks (grain), and four times any still flicker over 0.6 of 255. Lower is better.
// Software WebGPU (SwiftShader) is slow and the numbers are the truth's to the frame, so tries are run --jobs at once,
// each in its own browser, and the truth is worked out once a scene and kept in --out/refs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }, has = k => argv.includes(k);
const EFFECT = arg('--effect', 'regen'), OUT = path.resolve(arg('--out', '.tune')), JOBS = +arg('--jobs', 3), HOURS = +arg('--hours', 1.8);
const W = +arg('--w', 300), H = +arg('--h', 400), POSES = +arg('--poses', 12), REFS = +arg('--refs', 48), PORT = +(process.env.PORT || 4390);

// the numbers searched: [name, least, most, kind] (log: searched by its logarithm; int: whole numbers)
const SPACES = {
  regen: [
    ['LOBE_KEEP', .8, 1], ['CONE_FULL', .12, .4], ['SHARE_WIDE', 1, 3.5], ['SHARE_TAIL', 0, .8], ['SHARE_THIN', .5, 1], ['HOLD_STRAIGHT', .3, 3, 'log'],
    ['STILL_KEEP', 8, 96, 'log int'], ['HIST_WIDE', .1, 1], ['HIST_FINE', 0, .4], ['USUAL', .02, .4, 'log'], ['KEEP_ROUGH', 40, 400, 'log int'],
    ['KEEP_SLIDE', .5, 4, 'log'], ['SLIDE_LEAST', 0, .4], ['FILL_KEEPS', .5, .98], ['HIST_TURN', .1, 1], ['HOLD_MOVING', .03, .6, 'log'],
  ],
  ssr: [['maxDistance', 2, 20, 'log'], ['thickness', .01, .3, 'log'], ['intensity', .2, 1.2], ['screenEdgeFade', 0, .5], ['maxLuminance', 1, 30, 'log']],
};
SPACES.fewer = SPACES.regen;
const SPACE = SPACES[EFFECT];
if (!SPACE) { console.log('--effect regen | ssr | fewer'); process.exit(1); }
const toU = (k, x) => { const [, lo, hi, kind = ''] = k; return kind.includes('log') ? Math.log(x / lo) / Math.log(hi / lo) : (x - lo) / (hi - lo); };
const fromU = (k, u) => { const [, lo, hi, kind = ''] = k, c = Math.min(1, Math.max(0, u)); let x = kind.includes('log') ? lo * Math.pow(hi / lo, c) : lo + (hi - lo) * c; if (kind.includes('int')) x = Math.round(x); else x = +x.toPrecision(3); return x; };
const settingsOf = u => Object.fromEntries(SPACE.map((k, i) => [k[0], fromU(k, u[i])]));
const outside = u => u.reduce((s, x) => s + (x < 0 ? x * x : x > 1 ? (x - 1) * (x - 1) : 0), 0);

// the score of one scene's numbers (see the top)
const sceneScore = r => r.still.error + r.walk.error + r.fast.error + .5 * (r.still.specks + r.walk.specks + r.fast.specks) + 4 * Math.max(0, r.still.flicker - .6);

/* ---------- CMA-ES (Hansen, "The CMA Evolution Strategy: A Tutorial", 2016): minimises f over R^n ---------- */
function eigen(A) {   // (Jacobi rotations: a symmetric matrix's eigenvalues d and eigenvectors, the columns of V)
  const n = A.length, a = A.map(r => r.slice()), V = a.map((r, i) => r.map((_, j) => +(i === j)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
      for (let k = 0; k < n; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
      for (let k = 0; k < n; k++) { const vp = V[k][p], vq = V[k][q]; V[k][p] = c * vp - s * vq; V[k][q] = s * vp + c * vq; }
    }
  }
  return { d: a.map((r, i) => Math.max(r[i], 1e-20)), V };
}
function gauss(rnd) { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
class CMA {
  constructor(m, sigma, lambda, seed = 1) {
    const n = this.n = m.length; this.m = m.slice(); this.sigma = sigma; this.gen = 0; this.seed = seed; this.draws = 0;
    this.lambda = lambda || 4 + Math.floor(3 * Math.log(n));
    this.C = m.map((_, i) => m.map((_, j) => +(i === j))); this.pc = Array(n).fill(0); this.ps = Array(n).fill(0);
  }
  params() {
    const n = this.n, lam = this.lambda, mu = Math.floor(lam / 2), w = Array.from({ length: mu }, (_, i) => Math.log(mu + .5) - Math.log(i + 1)), sw = w.reduce((a, b) => a + b, 0);
    const wn = w.map(x => x / sw), mueff = 1 / wn.reduce((a, b) => a + b * b, 0);
    const cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n), cs = (mueff + 2) / (n + mueff + 5), c1 = 2 / ((n + 1.3) ** 2 + mueff);
    const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff)), damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
    return { mu, w: wn, mueff, cc, cs, c1, cmu, damps, chiN: Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n)) };
  }
  ask() {
    const { d, V } = eigen(this.C), n = this.n, r = rng(this.seed * 7919 + this.gen * 104729 + 1);
    this.tries = Array.from({ length: this.lambda }, () => {
      const z = Array.from({ length: n }, () => gauss(r)), y = Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) y[i] += V[i][j] * Math.sqrt(d[j]) * z[j];
      return { y, x: this.m.map((mi, i) => mi + this.sigma * y[i]) };
    });
    return this.tries.map(t => t.x);
  }
  tell(f) {
    const n = this.n, P = this.params(), order = f.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map(e => e[1]), best = order.slice(0, P.mu).map(i => this.tries[i]);
    const yw = Array(n).fill(0); best.forEach((t, k) => { for (let i = 0; i < n; i++) yw[i] += P.w[k] * t.y[i]; });
    this.m = this.m.map((mi, i) => mi + this.sigma * yw[i]);
    const { d, V } = eigen(this.C), ci = Array(n).fill(0);   // (C^-1/2 yw)
    const t1 = Array(n).fill(0); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t1[j] += V[i][j] * yw[i];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ci[i] += V[i][j] * t1[j] / Math.sqrt(d[j]);
    const ks = Math.sqrt(P.cs * (2 - P.cs) * P.mueff); this.ps = this.ps.map((p, i) => (1 - P.cs) * p + ks * ci[i]);
    const psn = Math.sqrt(this.ps.reduce((a, b) => a + b * b, 0)), hsig = psn / Math.sqrt(1 - (1 - P.cs) ** (2 * (this.gen + 1))) / P.chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    const kc = Math.sqrt(P.cc * (2 - P.cc) * P.mueff); this.pc = this.pc.map((p, i) => (1 - P.cc) * p + hsig * kc * yw[i]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let rank = 0; best.forEach((t, k) => { rank += P.w[k] * t.y[i] * t.y[j]; });
      this.C[i][j] = (1 - P.c1 - P.cmu) * this.C[i][j] + P.c1 * (this.pc[i] * this.pc[j] + (1 - hsig) * P.cc * (2 - P.cc) * this.C[i][j]) + P.cmu * rank;
    }
    this.sigma *= Math.exp(P.cs / P.damps * (psn / P.chiN - 1)); this.sigma = Math.min(this.sigma, .6);
    this.gen++; this.tries = null;
  }
  save() { return { n: this.n, m: this.m, sigma: this.sigma, gen: this.gen, lambda: this.lambda, C: this.C, pc: this.pc, ps: this.ps, seed: this.seed }; }
  static load(s) { const c = new CMA(s.m, s.sigma, s.lambda, s.seed); Object.assign(c, s); return c; }
}

/* ---------- the browsers ---------- */
let server;
async function startServer() { const vite = await import('vite'); server = await vite.createServer({ server: { port: PORT, strictPort: true }, mode: 'bundled', logLevel: 'error' }); await server.listen(); }
async function browser() {
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  return chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
}
const refFile = scene => path.join(OUT, 'refs', `${scene}-${W}x${H}-p${POSES}-r${REFS}.json`);
async function openScene(b, scene) {
  const p = await b.newPage();
  p.on('pageerror', e => console.log(`  [${scene}] page error: ${e.message.slice(0, 300)}`));
  await p.goto(`http://localhost:${PORT}/scripts/tune/index.html?scene=${scene}&w=${W}&h=${H}&poses=${POSES}&refs=${REFS}`);
  await p.waitForFunction(() => window.tuneReady || window.tuneError, null, { timeout: 600000 });
  const err = await p.evaluate(() => window.tuneError); if (err) throw new Error(err);
  const f = refFile(scene), given = fs.existsSync(f) && !has('--fresh') ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  const r = await p.evaluate(g => window.prepare(g), given);
  if (r.refs) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(r.refs)); console.log(`  [${scene}] truth worked out in ${(r.ms / 1000).toFixed(0)} s (${(r.reflective * 100).toFixed(1)}% of the picture reflects)`); }
  return p;
}
// a worker: a browser with a page for each scene, made again every so many tries (the chip's memory of shaders grows)
class Worker {
  constructor(scenes) { this.scenes = scenes; this.used = 0; }
  async open() { this.b = await browser(); this.pages = {}; for (const s of this.scenes) this.pages[s] = await openScene(this.b, s); this.used = 0; }
  async close() { await this.b?.close().catch(() => {}); this.b = null; }
  async score(effect, settings, shots = false) {
    if (!this.b || this.used >= 16) { await this.close(); await this.open(); }
    this.used++;
    const parts = {};
    for (const s of this.scenes) {
      for (let tryN = 0; ; tryN++) {
        try { parts[s] = await this.pages[s].evaluate(a => window.score(a), { effect, settings, shots }); break; }
        catch (e) { if (tryN) throw e; console.log(`  [${s}] ${String(e.message).slice(0, 200)}: the browser made again`); await this.close(); await this.open(); }
      }
    }
    return parts;
  }
}
const total = parts => Object.values(parts).reduce((s, r) => s + sceneScore(r), 0);
const r3 = x => +x.toFixed(3);
const brief = parts => Object.fromEntries(Object.entries(parts).map(([s, r]) => [s, { still: r3(r.still.error), walk: r3(r.walk.error), fast: r3(r.fast.error), specks: r3((r.still.specks + r.walk.specks + r.fast.specks) / 3), flicker: r3(r.still.flicker), score: r3(sceneScore(r)) }]));

async function search() {
  const scenes = arg('--scenes', 'yard,polished').split(','), stateFile = path.join(OUT, `${EFFECT}.json`), logFile = path.join(OUT, `${EFFECT}-tries.jsonl`);
  fs.mkdirSync(OUT, { recursive: true });
  const ROUNDS = +arg('--rounds', 30), t0 = Date.now();
  let S = has('--resume') && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
  const workers = Array.from({ length: JOBS }, () => new Worker(scenes));
  // (the truth worked out once a scene, by the first worker, before the others open)
  await workers[0].open(); await Promise.all(workers.slice(1).map(w => w.open()));
  if (!S) {
    const start = await workers[0].score(EFFECT, null), defaults = (await workers[0].pages[scenes[0]].evaluate(async e => {
      if (e === 'ssr') { const m = await import('../../src/kit/hd3d-gpu-fx.js'); return { ...m.SSR_SETTINGS }; }
      const m = await import('../../src/kit/hd3d-gpu-trace.js'); return m.regenSettings();
    }, EFFECT));
    const u0 = SPACE.map(k => Math.min(.98, Math.max(.02, toU(k, defaults[k[0]]))));
    S = { effect: EFFECT, scenes, space: SPACE, defaults, base: { score: total(start), parts: brief(start) }, cma: new CMA(u0, +arg('--sigma', .18), +arg('--lambda', 0) || 0, +arg('--seed', 1)).save(), best: null, rounds: [] };
    S.best = { settings: defaults, score: S.base.score, parts: S.base.parts, round: -1 };
    console.log(`${EFFECT} as it is: ${r3(S.base.score)}`, JSON.stringify(S.base.parts));
    fs.writeFileSync(stateFile, JSON.stringify(S, null, 1));
  }
  const cma = CMA.load(S.cma);
  console.log(`searching ${SPACE.length} numbers, ${cma.lambda} tries a round, ${JOBS} at once, from round ${cma.gen}; best so far ${r3(S.best.score)} (as it is ${r3(S.base.score)})`);
  for (let g = 0; g < ROUNDS && (Date.now() - t0) / 36e5 < HOURS; g++) {
    const xs = cma.ask(), f = new Array(xs.length), r0 = Date.now();
    let next = 0;
    await Promise.all(workers.map(async w => {
      while (next < xs.length) {
        const i = next++, settings = settingsOf(xs[i]);
        let parts; try { parts = await w.score(EFFECT, settings); } catch (e) { console.log('  try failed:', String(e.message).slice(0, 200)); f[i] = S.base.score * 3; continue; }
        const sc = total(parts); f[i] = sc + S.base.score * 4 * outside(xs[i]);
        fs.appendFileSync(logFile, JSON.stringify({ round: cma.gen, settings, score: r3(sc), parts: brief(parts) }) + '\n');
        if (sc < S.best.score && !outside(xs[i])) { S.best = { settings, score: sc, parts: brief(parts), round: cma.gen }; }
      }
    }));
    const sorted = f.slice().sort((a, b) => a - b);
    cma.tell(f);
    S.rounds.push({ round: cma.gen - 1, best: r3(sorted[0]), median: r3(sorted[sorted.length >> 1]), sigma: r3(cma.sigma), s: Math.round((Date.now() - r0) / 1000) });
    S.cma = cma.save(); S.mean = settingsOf(cma.m);
    fs.writeFileSync(stateFile, JSON.stringify(S, null, 1));
    console.log(`round ${cma.gen - 1}: best ${r3(sorted[0])}, median ${r3(sorted[sorted.length >> 1])}, step ${r3(cma.sigma)}, ${Math.round((Date.now() - r0) / 1000)} s · best so far ${r3(S.best.score)} (${((1 - S.best.score / S.base.score) * 100).toFixed(1)}% under as it is)`);
    if (cma.sigma < .01) { console.log('the search has settled'); break; }
  }
  console.log('best:', JSON.stringify(S.best.settings), '\n', JSON.stringify(S.best.parts));
  console.log('the mean of the search:', JSON.stringify(S.mean));
  await Promise.all(workers.map(w => w.close()));
}

async function check() {
  const scenes = arg('--scenes', 'yard,polished,hall').split(','), stateFile = path.join(OUT, `${EFFECT === 'fewer' ? 'regen' : EFFECT}.json`), shots = arg('--shots');
  const given = arg('--settings') ? JSON.parse(arg('--settings')) : has('--mean') ? JSON.parse(fs.readFileSync(stateFile, 'utf8')).mean : JSON.parse(fs.readFileSync(stateFile, 'utf8')).best.settings;
  const w = new Worker(scenes); await w.open();
  const res = {};
  for (const [name, settings] of [['as it is', null], ['tuned', given]]) {
    res[name] = await w.score(EFFECT, settings, !!shots);
    console.log(`${name.padEnd(9)} ${r3(total(res[name]))}`); for (const [s, b] of Object.entries(brief(res[name]))) console.log(`   ${s.padEnd(9)} ${JSON.stringify(b)}`);
  }
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    for (const s of scenes) {
      const t = await w.pages[s].evaluate(() => window.truthShots());
      for (const [k, url] of Object.entries(t)) fs.writeFileSync(path.join(shots, `${EFFECT}-${s}-${k}-truth.png`), Buffer.from(url.split(',')[1], 'base64'));
      for (const [name, r] of Object.entries(res)) for (const [k, url] of Object.entries(r[s].shots)) fs.writeFileSync(path.join(shots, `${EFFECT}-${s}-${k}-${name === 'tuned' ? 'tuned' : 'before'}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  console.log('settings:', JSON.stringify(given));
  for (const s of scenes) { const a = sceneScore(res['as it is'][s]), b = sceneScore(res.tuned[s]); console.log(`${s.padEnd(9)} ${r3(a)} -> ${r3(b)} (${((b / a - 1) * 100).toFixed(1)}%)`); }
  await w.close();
}

(async () => {
  await startServer();
  try { await (has('--check') ? check() : search()); }
  catch (e) { console.log('FAIL', e.stack || e); process.exitCode = 1; }
  finally { await server.close(); }
})();
