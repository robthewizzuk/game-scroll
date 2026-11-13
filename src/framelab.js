// Frame lab: Digital Foundry-style analysis of how games run on a real phone, to find what nobody has
// noticed yet. Turn it on from the QA panel (tap the GAME SCROLL logo › Frame lab), with F3 or ?lab in a
// dev build, or __gs.lab() in the console; it stays on across restarts until its ✕. Loaded only when on.
//
// Live, over the game:
//   - a frame-time graph of every picture put on the screen (green real, magenta made by frame
//     generation, red a stutter, grey not in play), with the expected beat, and a strip of every screen
//     refresh above it (what each one showed, red where the phone skipped one)
//   - average fps, 1% and 0.1% lows (the 99th and 99.9th percentile frame time), frame pacing (how many
//     pictures came on the beat), stutters
//   - the 3D's real resolution and what it is upscaled to (SGSR 1 or 2), quality tier, backend, frame
//     generation and its cost, draw calls, CPU time of update / draw / 3D, GPU time where the 3D kit
//     measures it
//   - heat (Android thermal status and headroom, iPhone thermal state), battery, and a CPU speed probe (a
//     fixed bit of work timed every 2 s: it slows when the phone throttles its clocks)
//   - CPU by part of the engine (src/kit/prof.js): physics, poses, crowds, AI, sound, the 3D frame's own
//     pieces (occlusion, shadows, drawing...), and the game's own code as what is left of its update and draw
//   - memory (src/kit/memory.js): the memory guard's level (fine, tight, low, critical) and, on Android, the
//     phone's free memory against the line where it starts closing apps
//   - hitch causes: each stutter is checked for shaders built, textures uploaded, a garbage collection
//     (the heap dropped), a long script (the browser's long animation frame entries name the file and
//     function), a quality, resolution or effect size change (effects step down by their cost: hd3d.js
//     FXS), a fold / resize, the game's own CPU time, GPU time
//
// Tools:
//   Rec       records up to 60 s, then Report shares a self-contained HTML report (graphs, hitch list,
//             pictures) and Copy puts a text summary on the clipboard for pasting into chat
//   Freeze    stops the game's clock but keeps drawing (pictures settle; nothing moves)
//   Tint      tints the card magenta on every made frame (frame generation), so you see which are made
//   A/B       on a frozen frame: SGSR off vs on, SGSR 1 vs 2, WebGL vs WebGPU, full vs half resolution,
//             low vs ultra tier. Shows both in a viewer with wipe, side by side, difference and flip, zoom
//             up to 16x with nearest-pixel scaling, and adds them to the report
//   Shimmer   on a frozen frame: 16 pictures in a row, heat map of the pixels that still change
//             (temporal instability: shimmering edges, upscaler or anti-aliasing jitter)
//   FG check  while playing on WebGPU: grabs real, made, real triples and maps the made pixels that
//             match neither real frame nearby (ghosting, smears, holes behind moving things)
//
// Kit-free and game-free: it reads what the feed (src/main.js), the 3D kit (HD.info) and the phone
// (src/kit/power.js) already know, plus browser APIs. Timing comes from requestAnimationFrame, which on
// Android and iPhone runs on the screen's beat; the browser doesn't say when a picture actually lit up.
import { Capacitor } from '@capacitor/core';
import { speed, screenHz, fpsFor, phoneClass, frameGenStatus } from './kit/speed.js';
import { power } from './kit/power.js';
import { memory, LEVELS as MEM, forceMemory } from './kit/memory.js';
import { screen } from './kit/screenrate.js';
import { webgpu, gpuPick, setGpuPick, prepareGPU, gpuName, glStats } from './kit/gpu.js';
import { BUILD } from './perf.js';
import { store } from './util.js';
import { PROF, take } from './kit/prof.js';

const KEY = 'gs_lab', N = 8192, WIN = 4000, REC_MAX = 60000, PAUSE_GAP = 250;
const is3D = d => d && (d.era === 'nextgen' || d.era === 'ar' || d.era === 'board');
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const file = u => String(u || '').split(/[?#]/)[0].split('/').pop() || '';

/* ---------- what each refresh showed ---------- */
// kind: 0 nothing new, 1 a real frame, 2 a made frame (frame generation)
const T = new Float64Array(N), K = new Uint8Array(N), PLAY = new Uint8Array(N), EXP = new Float32Array(N);
let head = 0, count = 0, lastPresent = 0, lastTick = 0;
const events = [];        // { t, k: 'S'|'X'|'G'|'L'|'Q'|'F'|'C'|'H', text, ms }
const loafs = [];         // long animation frames from the browser
let rec = null;           // recording: { t0, rows: {...columns}, events, samples, shots }
const shots = [];         // pictures for the report: { kind, title, notes, images: [{ label, url }] }

// counters read each refresh to find what happened in between
const C = { progs: -1, tex: -1, heap: 0, tier: null, res: null, rw: 0, id: '', state: '', resizeAt: -1e9, hiddenAt: -1e9, gpuProgs: -1 };
let pend = [];            // causes collected since the last picture

let HD = null, hdLoading = null;
const loadHD = () => hdLoading ||= import('./kit/hd3d.js').then(m => { HD = m.HD; }).catch(() => {});

/* ---------- phone readings every 2 s ---------- */
const PROBE = new Float64Array(2048); let probeBest = Infinity;
// three short runs, the fastest counts (another thread taking the core for a moment shouldn't read as throttling)
function probe() {
  let ms = Infinity;
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now(); let a = 0;
    for (let k = 0; k < 96; k++) for (let i = 0; i < 2048; i++) a += Math.sqrt(PROBE[i] + i * k + 1);
    PROBE[kk = (kk + 1) & 2047] = a * 1e-12; ms = Math.min(ms, Math.max(.05, performance.now() - t0));
  }
  probeBest = Math.min(probeBest, ms); return probeBest / ms;
}
let kk = 0;
const samples = [];       // { t, cpu, heat, thermal, headroom, level, charging, saving, heap, hz, mem, free, line }
function sample() {
  const now = performance.now(), cpu = probe();
  const s = { t: now, cpu: r2(cpu), heat: power.heat, thermal: power.thermal ?? null, headroom: power.headroom ?? null, level: r2(power.level), charging: power.charging, saving: power.saving, heap: heapMB(), hz: screenHz(), mem: memory.level, free: memory.avail > 0 ? Math.round(memory.avail / 1048576) : null, line: memory.threshold > 0 ? Math.round(memory.threshold / 1048576) : null };
  samples.push(s); if (samples.length > 300) samples.shift();
  if (rec) rec.samples.push(s);
}
const heapMB = () => performance.memory ? r1(performance.memory.usedJSHeapSize / 1048576) : null;

/* ---------- long animation frames (which script held the frame) ---------- */
function observe() {
  const add = list => { for (const e of list.getEntries()) { loafs.push(e); if (loafs.length > 60) loafs.shift(); } };
  try { const o = new PerformanceObserver(add); o.observe({ type: 'long-animation-frame', buffered: false }); return o; }
  catch (_) { try { const o = new PerformanceObserver(add); o.observe({ type: 'longtask', buffered: false }); return o; } catch (_) { return null; } }
}
function loafAt(t0, t1) {
  let best = null;
  for (const e of loafs) if (e.startTime + e.duration >= t0 - 4 && e.startTime <= t1 && (!best || e.duration > best.duration)) best = e;
  if (!best) return '';
  const sc = (best.scripts || []).slice().sort((a, b) => b.duration - a.duration)[0];
  if (sc) return `script ${file(sc.sourceURL) || sc.invokerType || '?'}${sc.sourceFunctionName ? ' ' + sc.sourceFunctionName : ''} (${Math.round(sc.duration)} ms)`;
  const lay = best.styleAndLayoutStart && best.renderStart ? best.startTime + best.duration - best.styleAndLayoutStart : 0;
  return lay > 20 ? `layout (${Math.round(lay)} ms)` : `long task (${Math.round(best.duration)} ms)`;
}

function event(k, text, t = performance.now(), ms = 0) {
  const e = { t, k, text, ms: r1(ms) }; events.push(e); if (events.length > 400) events.shift();
  if (rec) rec.events.push(e);
}

/* ---------- counters ---------- */
// the effects the 3D kit draws smaller by their cost (hd3d.js FXS), in words: 'bloom 70%, ao 50%' ('' when none)
const fxText = () => Object.entries(HD?.fx || {}).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ');
function counters(s) {
  const G = webgpu(), d = s?.def;
  let progs = glStats.programs, tex = glStats.r?.info?.memory?.textures ?? 0;
  if (G && HD?.info.backend === 'webgpu' && is3D(d)) { progs += G.r.info?.memory?.programs ?? 0; tex += G.r.info?.memory?.textures ?? 0; }
  if (C.progs >= 0 && progs > C.progs) { const n = progs - C.progs; pend.push(`shaders built (${n})`); event('S', `${n} shader${n > 1 ? 's' : ''} built`); }
  if (C.tex >= 0 && tex > C.tex + 0) { const n = tex - C.tex; pend.push(`textures uploaded (${n})`); if (n >= 2) event('X', `${n} textures uploaded`); }
  C.progs = progs; C.tex = tex;
  const h = performance.memory?.usedJSHeapSize || 0;
  if (C.heap && h < C.heap - 1.5 * 1048576) { const mb = (C.heap - h) / 1048576; pend.push(`garbage collected (${mb.toFixed(1)} MB)`); event('G', `heap fell ${mb.toFixed(1)} MB (garbage collection)`); }
  C.heap = h;
  if (HD && is3D(d)) {
    const tier = HD.name, res = HD.res, rw = HD.info.rw || 0, fx = fxText();
    if (C.fx != null && fx !== C.fx) { pend.push(`effect drawn smaller or back (${fx || 'all full'})`); event('Q', `effects: ${fx || 'all at full size'}`); }
    C.fx = fx;
    if (C.tier != null && tier !== C.tier) { pend.push(`quality tier change (${C.tier} → ${tier})`); event('Q', `quality tier ${C.tier} → ${tier}`); }
    if (C.res != null && res !== C.res) { pend.push(`resolution step change (${Math.round(C.res * 100)}% → ${Math.round(res * 100)}%)`); event('Q', `resolution step ${Math.round(C.res * 100)}% → ${Math.round(res * 100)}%`); }
    C.tier = tier; C.res = res; C.rw = rw;
  } else { C.tier = C.res = C.fx = null; }
  const id = d?.id || '', st = s?.state || '';
  if (C.id && id !== C.id) { pend.push('card changed'); event('C', `card → ${id || 'none'}`); C.tier = C.res = C.fx = null; }
  else if (C.state && st !== C.state && st === 'playing') { pend.push('round started'); event('C', 'round started'); }
  C.id = id; C.state = st;
}

/* ---------- the hooks the feed calls (src/main.js frame()) ---------- */
// Each refresh: kind 'frame' (a real frame was drawn), 'between' (frame generation's refresh between), or
// 'idle' (nothing new). shownKind is what frame generation said it put up this refresh.
let shownKind = null, tint = false, tintEl = null, tintRect = 0;
function tick(now, s, how, upd = 0, drw = 0) {
  const rf = 1000 / screenHz();
  let k = how === 'idle' ? 0 : how === 'between' ? (shownKind ? 2 : 0) : (shownKind === 'made' ? 2 : 1);
  if (how === 'between' && shownKind === 'real') k = 1;
  shownKind = null;
  const playing = !!s && s.state === 'playing' && !s.paused;
  lastTick = now;
  if (how !== 'idle' || k) counters(s);
  const fg = HD && is3D(s?.def) && HD.info.framegen;
  const exp = !s ? rf : fg ? rf : Math.max(rf, 1000 / fpsFor(s.def));
  const i = head; T[i] = now; K[i] = k; PLAY[i] = playing ? 1 : 0; EXP[i] = exp; head = (head + 1) % N; if (count < N) count++;
  if (rec) {
    const R = rec.rows; R.t.push(r2(now - rec.t0)); R.k.push(k); R.p.push(PLAY[i]);
    if (k === 1) { R.upd.push(r2(upd)); R.drw.push(r2(drw)); R.cpu3d.push(HD && is3D(s?.def) ? r2(HD.info.cpu) : 0); R.fg.push(fg ? r2(HD.info.fgMs) : 0); R.gpu.push(HD?.info.gpuMs != null ? r2(HD.info.gpuMs) : null); R.ft.push(R.t.length - 1); }
    if (now - rec.t0 > REC_MAX) stopRec();
  }
  if (k) {
    const iv = lastPresent ? now - lastPresent : 0;
    if (playing && iv > 0 && iv < PAUSE_GAP && iv >= exp * 1.5 && iv - exp >= rf * .9) hitch(now, iv, exp, s, upd, drw);
    lastPresent = now; pend = [];
    if (k === 1) { last.upd = last.upd * .9 + upd * .1; last.drw = last.drw * .9 + drw * .1; }
  }
  parts(k, upd, drw, playing);
  if (tint && tintEl) paintTint(s, k, now);
  if (frozenWait && k) frozenWait();
  if (fgArm && k) fgArm(k, s);
}
const last = { upd: 0, drw: 0 };
// CPU by part (prof.js): what each part took since the last real frame, the game's own code being what is
// left of update() and draw(). Live: a running average a frame; recorded: the sum and the worst frame.
const SYS = new Map(), carry = {}; let carryIn = 0;
const GAME = 'game\u2019s own code';
function parts(k, upd, drw, playing) {
  carryIn += take(carry);
  if (k !== 1 || upd + drw <= 0) return;
  carry[GAME] = Math.max(0, upd + drw - carryIn);
  for (const [n, v] of SYS) if (!(n in carry)) SYS.set(n, v * .95);
  for (const n in carry) SYS.set(n, (SYS.get(n) ?? carry[n]) * .95 + carry[n] * .05);
  for (const [n, v] of SYS) if (v < .002 && !(n in carry)) SYS.delete(n);
  if (rec && playing) {
    const S = rec.sys; rec.sysN++;
    for (const n in carry) { const e = S[n] ||= { sum: 0, max: 0 }; e.sum += carry[n]; e.max = Math.max(e.max, carry[n]); }
  }
  for (const n in carry) delete carry[n];
  carryIn = 0;
}
// the biggest parts, as "physics 3D 1.2 · poses 0.8 · ..." (ms a frame)
function partsText(list, n = 7) {
  return list.filter(([, v]) => v >= .05).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v.toFixed(v < 1 ? 2 : 1)}`).join(' · ');
}
function hitch(now, iv, exp, s, upd, drw) {
  const why = pend.slice();
  if (now - C.resizeAt < 600) why.push('fold / resize');
  if (now - C.hiddenAt < 1500) why.push('app came back to the front');
  const lf = loafAt(now - iv, now); if (lf) why.push(lf);
  if (upd + drw > exp) why.push(`game CPU over the beat (update ${r1(upd)} + draw ${r1(drw)} ms)`);
  // (the GPU's time is for a real frame and the frames made after it: with frame generation, that many refreshes)
  const gpu = HD?.info.gpuMs; if (gpu != null && gpu > exp * (HD.info.framegen ? HD.info.fgSteps || 2 : 1)) why.push(`GPU over the beat (${r1(gpu)} ms)`);
  if (!why.length) why.push(HD && is3D(s?.def) ? 'no cause seen (GPU / driver / system?)' : 'no cause seen (system?)');
  event('H', why.join(', '), now, iv);
}
function paintTint(s, k, now) {
  if (!s) { tintEl.style.opacity = 0; return; }
  if (now - tintRect > 500) {
    tintRect = now; const r = s.canvas.getBoundingClientRect();
    Object.assign(tintEl.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }
  if (k) tintEl.style.opacity = k === 2 ? 1 : 0;
}

/* ---------- numbers over a stretch of refreshes ---------- */
// From the rows of [t, kind, playing, expected]: average fps, lows, pacing, stutters, refresh counts.
export function measure(rows, hz) {
  const rf = 1000 / hz, iv = [], ex = []; let prev = 0, made = 0, real = 0, skipped = 0, lastT = 0;
  for (const [t, k, p, e] of rows) {
    if (lastT && p && t - lastT > 1.6 * rf && t - lastT < PAUSE_GAP) skipped += Math.round((t - lastT) / rf) - 1;
    lastT = t;
    if (!k) continue;
    if (prev && p && t - prev < PAUSE_GAP) { iv.push(t - prev); ex.push(e); }
    prev = t; if (p) k === 2 ? made++ : real++;
  }
  if (iv.length < 10) return null;
  const sum = iv.reduce((a, b) => a + b, 0), s = iv.slice().sort((a, b) => a - b);
  const pc = q => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  let on = 0, stut = 0; const hist = [0, 0, 0, 0, 0];
  for (let i = 0; i < iv.length; i++) {
    if (Math.abs(iv[i] - ex[i]) <= .4 * rf) on++;
    if (iv[i] >= ex[i] * 1.5 && iv[i] - ex[i] >= rf * .9) stut++;
    hist[Math.min(4, Math.max(0, Math.round(iv[i] / rf) - 1))]++;
  }
  return {
    frames: iv.length, secs: sum / 1000, fps: iv.length / (sum / 1000), low1: 1000 / pc(.99), low01: iv.length >= 500 ? 1000 / pc(.999) : null,
    worst: s[s.length - 1], pacing: on / iv.length, stutters: stut, made, real, skipped, hist, exp: ex.reduce((a, b) => a + b, 0) / ex.length,
  };
}
function windowRows(ms) {
  const now = T[(head - 1 + N) % N], out = [];
  for (let n = Math.min(count, N), i = (head - n + N) % N; n > 0; n--, i = (i + 1) % N) if (now - T[i] <= ms) out.push([T[i], K[i], PLAY[i], EXP[i]]);
  return out;
}

/* ---------- recording ---------- */
function startRec(s) {
  rec = { t0: performance.now(), at: new Date().toISOString(), game: s?.def?.id || '', title: s?.def?.title || '', rows: { t: [], k: [], p: [], upd: [], drw: [], cpu3d: [], fg: [], gpu: [], ft: [] }, events: [], samples: [], cfg: [], sys: {}, sysN: 0 };
  rec.cfg.push(config(s)); sample();
}
function stopRec() {
  if (!rec) return; rec.t1 = performance.now(); rec.cfg.push(config(UI.s)); lastRec = rec; rec = null;
  UI.render?.(); UI.flash?.('Recorded. Report shares it, Copy puts a summary on the clipboard.');
}
let lastRec = null;
// expected beat per row isn't kept in the recording: use the config's (fg on: every refresh; off: the game's rate)
function recRows(R) {
  const rf = 1000 / (R.cfg[0]?.hz || screenHz()), c = R.cfg[0] || {}, e = c.fg ? rf : Math.max(rf, 1000 / (c.fps || 60));
  return R.rows.t.map((t, i) => [t, R.rows.k[i], R.rows.p[i], e]);
}

/* ---------- what's on: one line per setting ---------- */
function config(s) {
  const d = s?.def, hd = HD && is3D(d), i = hd ? HD.info : null;
  return {
    game: d?.id || '', era: d?.era || (d?.retro ? 'pocket' : 'phone'), hz: screenHz(), fps: d ? Math.round(fpsFor(d)) : 0, cls: phoneClass(), gpu: gpuName(),
    backend: hd ? i.backend : d?.era === 'console' ? 'webgl' : '2d', tier: hd ? HD.name : null, res: hd ? HD.res : null,
    rw: hd ? i.rw : s?.canvas?.width, rh: hd ? i.rh : s?.canvas?.height, ow: hd ? i.ow : s?.canvas?.width, oh: hd ? i.oh : s?.canvas?.height,
    upscaler: hd ? i.upscaled || 'off' : null, fx: hd ? fxText() : '', fg: hd ? i.framegen || false : false, fgWhy: d && hd ? frameGenStatus(d) : '', lite: !!s?.lite,
    rates: screen.rates.join('/'), asked: screen.want, lifted: screen.lifted,
    view: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, form: Math.min(innerWidth, innerHeight) >= 600 ? 'wide' : 'phone',
  };
}

/* ---------- pictures ---------- */
// The card as it is on the screen this moment: every canvas and video in the card's screen (the 3D layer,
// the camera behind AR, the card's own canvas on top), at most maxSide pixels on its longer side.
// Must run in the same frame as the drawing (the hooks above), before the browser clears the 3D canvas.
function grab(s, maxSide = 1600) {
  const base = s.canvas, br = base.getBoundingClientRect(), par = base.parentNode || base;
  const k = Math.min(devicePixelRatio, maxSide / Math.max(1, br.width, br.height));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(br.width * k)); cv.height = Math.max(1, Math.round(br.height * k));
  const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  for (const el of par.querySelectorAll('canvas,video')) {
    if (el.closest('.fl, .fl-view')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none') continue;
    try { c.drawImage(el, (r.left - br.left) * k, (r.top - br.top) * k, r.width * k, r.height * k); } catch (_) { /* a video with no frame yet */ }
  }
  return cv;
}
function shrink(src, maxSide) {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height)), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(src.width * k)); cv.height = Math.max(1, Math.round(src.height * k));
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); return cv;
}
const pixels = cv => cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);
const toURL = cv => { try { return cv.toDataURL('image/png'); } catch (_) { return ''; } };

// a heat map (0..1 per pixel) as a see-through picture: clear where 0, yellow to red as it rises
function heatCanvas(w, h, v) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), im = c.createImageData(w, h), d = im.data;
  for (let i = 0; i < v.length; i++) { const x = Math.min(1, v[i]); if (x <= 0) continue; d[i * 4] = 255; d[i * 4 + 1] = Math.round(230 * (1 - x)); d[i * 4 + 2] = 0; d[i * 4 + 3] = Math.round(90 + 165 * x); }
  c.putImageData(im, 0, 0); return cv;
}
// where flagged pixels gather: the 4 busiest cells of a 12 x 12 grid, as boxes for the viewer
function hotspots(w, h, v, thr) {
  const G = 12, cells = new Float32Array(G * G);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (v[y * w + x] > thr) cells[Math.floor(y * G / h) * G + Math.floor(x * G / w)]++;
  const area = (w / G) * (h / G);
  return [...cells].map((n, i) => ({ n, i })).filter(c => c.n / area > .02).sort((a, b) => b.n - a.n).slice(0, 4)
    .map(({ n, i }) => ({ x: (i % G) / G, y: Math.floor(i / G) / G, w: 1 / G, h: 1 / G, share: n / area }));
}

/* ---------- freeze and wait ---------- */
let frozen = false, frozenWait = null;
const waitFrames = (n, minMs = 0) => new Promise(res => {
  const t0 = performance.now();
  frozenWait = () => { if (--n <= 0 && performance.now() - t0 >= minMs) { frozenWait = null; res(); } };
  setTimeout(() => { if (frozenWait) { frozenWait = null; res(); } }, Math.max(4000, minMs + 3000));
});
// the next picture put on screen, grabbed in its own frame
const nextGrab = (maxSide) => new Promise(res => {
  const t0 = performance.now();
  const f = () => { const s = UI.s; if (s) { frozenWait = null; res(grab(s, maxSide)); } };
  frozenWait = f; setTimeout(() => { if (frozenWait === f) { frozenWait = null; res(UI.s ? grab(UI.s, maxSide) : null); } }, 3000 + (performance.now() - t0));
});

/* ---------- A/B on a frozen frame ---------- */
const PAIRS = {
  sgsr: { title: 'Upscaler off vs on', a: 'SGSR off (stretched)', b: 'SGSR on', set: on => { HD.upscale = on; } },
  sgsr12: { title: 'SGSR 1 vs SGSR 2', a: 'SGSR 1', b: 'SGSR 2', set: on => { HD.upscaler = on ? 'sgsr2' : 'sgsr1'; } },
  sgsrTune: { title: 'SGSR 2 as it was vs tuned', a: 'SGSR 2 as Qualcomm has it', b: 'SGSR 2 with our changes', set: on => { HD.sgsrTune = on; } },
  mip: { title: 'Textures as drawn vs sharpened', a: 'textures read for the small picture', b: 'textures read for the screen', set: on => { HD.mipBias = on ? null : false; }, needs: () => HD.info.backend === 'webgpu' && HD.info.upscaled === 'sgsr2' && HD.info.rw < HD.info.ow, no: 'Textures are sharpened only while SGSR 2 upscales on WebGPU, so there is nothing to compare.' },
  backend: { title: 'WebGL vs WebGPU', a: 'WebGL', b: 'WebGPU', set: async on => { setGpuPick(on ? 'webgpu' : 'webgl'); if (on) await prepareGPU(); }, needs: () => !!webgpu() || gpuPick() === 'webgl' },
  res: { title: 'Half vs full resolution', a: '50% of the 3D size', b: 'the tier\'s own size', set: on => { HD.scale = on ? null : HD.info.rw && HD.info.ow ? .5 * HD.info.rw / HD.info.ow : .5; } },
  tier: { title: 'Low vs ultra tier', a: 'low', b: 'ultra', set: on => { HD.force = on ? 3 : 0; } },
};
async function runAB(key) {
  const s = UI.s, P = PAIRS[key]; if (!s || !HD || !is3D(s.def)) return UI.flash('A/B needs a Next Gen or AR game on screen.');
  if (P.needs && !P.needs()) return UI.flash(P.no || 'This phone has no WebGPU, so there is nothing to compare.');
  const keep = { upscale: HD.upscale, upscaler: HD.upscaler, scale: HD.scale, force: HD.force, tune: HD.sgsrTune, mip: HD.mipBias, pick: gpuPick() }, was = frozen;
  setFrozen(true); UI.busy(`A/B: ${P.title}…`);
  try {
    const shotsAB = [];
    for (const on of [false, true]) {
      await P.set(on); await waitFrames(45, 900);
      const cv = await nextGrab(1600); if (!cv) throw new Error('no picture');
      shotsAB.push({ label: on ? P.b : P.a, cv, info: config(s) });
    }
    const notes = shotsAB.map(x => `${x.label}: ${x.info.backend} ${x.info.tier} 3D ${x.info.rw}x${x.info.rh} -> ${x.info.ow}x${x.info.oh} ${x.info.upscaler}`);
    const shot = { kind: 'ab', title: P.title, game: s.def.id, notes, images: shotsAB.map(x => ({ label: x.label, cv: x.cv })) };
    shots.push(shot); viewer(shot);
  } catch (e) { UI.flash('A/B did not finish: ' + (e?.message || e)); }
  finally {
    HD.upscale = keep.upscale; HD.upscaler = keep.upscaler; HD.scale = keep.scale; HD.force = keep.force; HD.sgsrTune = keep.tune; HD.mipBias = keep.mip; if (gpuPick() !== keep.pick) setGpuPick(keep.pick);
    setFrozen(was); UI.busy('');
  }
}

/* ---------- shimmer: what still changes on a frozen frame ---------- */
async function runShimmer() {
  const s = UI.s; if (!s || s.state !== 'playing') return UI.flash('Start a round first: shimmer is checked on a frozen frame of play.');
  const was = frozen; setFrozen(true); UI.busy('Shimmer: settling…');
  try {
    // 16 pictures of the frozen frame: how far each pixel's brightness swings across them
    const measure = async () => {
      const L = []; let w = 0, h = 0, first = null;
      for (let n = 0; n < 16; n++) {
        const cv = await nextGrab(900); if (!cv) break;
        if (!first) first = cv;
        const d = pixels(cv).data; w = cv.width; h = cv.height; const l = new Uint8Array(w * h);
        for (let i = 0; i < l.length; i++) l[i] = (d[i * 4] * 54 + d[i * 4 + 1] * 183 + d[i * 4 + 2] * 19) >> 8;
        L.push(l);
      }
      if (L.length < 4) throw new Error('too few pictures');
      const v = new Float32Array(w * h); let flagged = 0;
      for (let i = 0; i < v.length; i++) {
        let lo = 255, hi = 0; for (const l of L) { const x = l[i]; if (x < lo) lo = x; if (x > hi) hi = x; }
        const r = hi - lo; v[i] = r < 10 ? 0 : (r - 10) / 50; if (r >= 16) flagged++;
      }
      return { w, h, v, first, n: L.length, share: flagged / v.length };
    };
    await waitFrames(30, 600); UI.busy('Shimmer: 16 pictures…');
    const { w, h, v, first, n, share } = await measure(), still = HD?.info.still;
    // SGSR 2: the same frame again as Qualcomm's shader has it, to see what our changes to it do
    // here (not while the 3D shows a still frame again: nothing is being redrawn to compare)
    let plain = null;
    if (HD && !still && HD.info.upscaled === 'sgsr2' && HD.sgsrTune !== false) {
      UI.busy('Shimmer: again with SGSR 2 as it was…');
      const keep = HD.still; HD.sgsrTune = false; HD.still = false;
      try { await waitFrames(45, 900); plain = (await measure()).share; } finally { HD.sgsrTune = true; HD.still = keep; }
    }
    const shot = {
      kind: 'shimmer', title: 'Shimmer on a frozen frame', game: s.def.id, heat: { cv: heatCanvas(w, h, v), boxes: hotspots(w, h, v, .1) },
      notes: [`${(share * 100).toFixed(2)}% of pixels change by 16+ levels across ${n} pictures while nothing moves${still ? ' (the 3D kit was showing a still frame again, so the 3D itself was not redrawn)' : ''}`,
        ...(plain != null ? [`${(plain * 100).toFixed(2)}% with SGSR 2 as Qualcomm has it (without our changes to it)`] : []),
        `${config(s).upscaler ? 'upscaler ' + config(s).upscaler + ', ' : ''}${config(s).backend}`],
      images: [{ label: 'frame', cv: first }],
    };
    shots.push(shot); viewer(shot);
  } catch (e) { UI.flash('Shimmer did not finish: ' + (e?.message || e)); }
  finally { setFrozen(was); UI.busy(''); }
}

/* ---------- frame generation check ---------- */
// Grabs real, made, real in a row (the 3D canvas only, small, copied on the graphics chip; read back
// only at the end so the check itself doesn't make frame generation miss refreshes), a few times
// half a second apart. Each made pixel should be a nearby pixel of one of the two real frames moved
// along: where it is far from all of them (5 x 5 around it in both), it's flagged.
let fgArm = null;
async function runFG() {
  const s = UI.s; if (!s || !HD || !is3D(s.def)) return UI.flash('FG check needs a Next Gen or AR game.');
  if (s.state !== 'playing') return UI.flash('Start a round and keep moving: the check needs motion.');
  if (HD.info.backend !== 'webgpu') return UI.flash('Frame generation runs on WebGPU only, and this game is on WebGL.');
  const forced = !HD.info.framegen && HD.frameGen == null; if (forced) HD.frameGen = 'blend';
  setFrozen(false); UI.busy('FG check: keep moving…');
  const trip = [], prevTap = HD.fgTap; let cur = [], lastT = 0, done;
  const finish = new Promise(r => { done = r; });
  HD.fgTap = (kind, canvas, when) => {
    try { prevTap?.(kind, canvas, when); } catch (_) {}
    const now = performance.now();
    if (!cur.length && (kind !== 'real' || now - lastT < 450)) return;
    cur.push({ kind, cv: shrink(canvas, 640) });
    if (cur.length >= 2 && kind === 'real') {
      if (cur.length >= 3 && cur.slice(1, -1).every(x => x.kind === 'made')) { trip.push(cur); lastT = now; }
      cur = [];
      if (trip.length >= 6) done();
    } else if (cur.length > 6) cur = [];
  };
  setTimeout(() => done(), 8000);
  await finish; HD.fgTap = prevTap; if (forced) HD.frameGen = null;
  if (!trip.length) { UI.busy(''); return UI.flash('No made frames came through. Is frame generation on (Settings › Frame generation) and the screen faster than the game?'); }
  UI.busy('FG check: comparing…'); await new Promise(r => setTimeout(r, 30));
  let worst = null; const scores = [];
  for (const t of trip) {
    const A = pixels(t[0].cv), B = pixels(t[t.length - 1].cv), w = A.width, h = A.height;
    for (const m of t.slice(1, -1)) {
      const M = pixels(m.cv), v = new Float32Array(w * h); let bad = 0, mov = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, mr = M.data[i], mg = M.data[i + 1], mb = M.data[i + 2];
        if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 30) mov++;
        let best = 1e9;
        for (let dy = -2; dy <= 2 && best > 20; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const j = (yy * w + xx) * 4;
            const a = Math.abs(A.data[j] - mr) + Math.abs(A.data[j + 1] - mg) + Math.abs(A.data[j + 2] - mb);
            const b = Math.abs(B.data[j] - mr) + Math.abs(B.data[j + 1] - mg) + Math.abs(B.data[j + 2] - mb);
            const c = a < b ? a : b; if (c < best) best = c; } }
        const e = best / 3; v[y * w + x] = e < 14 ? 0 : (e - 14) / 40; if (e >= 20) bad++;
      }
      const sc = { share: bad / v.length, moving: mov / v.length, w, h, v, t, m };
      scores.push(sc.share); if (!worst || sc.share > worst.share) worst = sc;
    }
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const shot = {
    kind: 'fg', title: 'Frame generation check', game: s.def.id,
    heat: { cv: heatCanvas(worst.w, worst.h, worst.v), boxes: hotspots(worst.w, worst.h, worst.v, .15), on: 1 },
    notes: [`${scores.length} made frames checked: on average ${(avg * 100).toFixed(2)}% of pixels match neither real frame nearby; worst ${(worst.share * 100).toFixed(2)}% (shown, ${(worst.moving * 100).toFixed(0)}% of the picture moving)`,
      `frame generation ${HD.info.framegen || (forced ? 'blend (turned on for the check)' : 'off')}, ${HD.info.fgMs ? r1(HD.info.fgMs) + ' ms a made frame' : ''}`],
    images: [{ label: 'real before', cv: worst.t[0].cv }, { label: 'made', cv: worst.m.cv }, { label: 'real after', cv: worst.t[worst.t.length - 1].cv }],
  };
  shots.push(shot); UI.busy(''); viewer(shot);
}

function setFrozen(v) { frozen = !!v; UI.render?.(); }

/* ---------- the viewer: wipe, side by side, difference, flip, heat, zoom ---------- */
function viewer(shot) {
  const imgs = shot.images.filter(x => x.cv), two = imgs.length >= 2;
  const modes = [two && 'wipe', 'side', two && 'diff', 'flip', shot.heat && 'heat'].filter(Boolean);
  let mode = shot.heat ? 'heat' : two ? 'wipe' : 'side', zoom = 1, cx = .5, cy = .5, split = .5, flip = 0, heatOn = shot.heat?.on ?? 0;
  const el = document.createElement('div'); el.className = 'fl-view';
  el.innerHTML = `<div class="fl-vbar"><b>${shot.title}</b><span class="fl-vmodes">${modes.map(m => `<button data-m="${m}">${{ wipe: 'Wipe', side: 'Side by side', diff: 'Difference', flip: 'Flip', heat: 'Flags' }[m]}</button>`).join('')}</span>
    <span class="fl-vzoom">${[1, 2, 4, 8, 16].map(z => `<button data-z="${z}">${z}×</button>`).join('')}</span><button data-a="x">✕</button></div>
    <canvas></canvas><input class="fl-split" type="range" min="0" max="1000" value="500" aria-label="Wipe position"><div class="fl-vnotes"></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), c = cv.getContext('2d'), sl = el.querySelector('.fl-split'), notes = el.querySelector('.fl-vnotes');
  notes.textContent = (shot.notes || []).join('\n') + '\nDrag to move, pinch or the buttons to zoom.' + (shot.heat ? ' Flags: yellow to red where pixels are flagged; boxes mark where they gather.' : '');
  let diffCv = null;
  const diff = () => {
    if (diffCv) return diffCv;
    const A = pixels(imgs[0].cv), B = pixels(shrinkTo(imgs[1].cv, imgs[0].cv.width, imgs[0].cv.height)), w = A.width, h = A.height;
    diffCv = document.createElement('canvas'); diffCv.width = w; diffCv.height = h; const dc = diffCv.getContext('2d'), im = dc.createImageData(w, h);
    for (let i = 0; i < A.data.length; i += 4) { const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3; const v = Math.min(255, d * 4); im.data[i] = v; im.data[i + 1] = v * .6; im.data[i + 3] = 255; }
    dc.putImageData(im, 0, 0); return diffCv;
  };
  const fitBox = (iw, ih, bw, bh) => { const k = Math.min(bw / iw, bh / ih); return { k, w: iw * k, h: ih * k }; };
  // draws picture p into the box (bx, by, bw, bh) at the current zoom and centre
  const put = (p, bx, by, bw, bh, clipX0 = 0, clipX1 = 1) => {
    const f = fitBox(p.width, p.height, bw, bh), k = f.k * zoom, vw = bw / k, vh = bh / k;
    let sx = cx * p.width - vw / 2, sy = cy * p.height - vh / 2;
    c.save(); c.beginPath(); c.rect(bx + bw * clipX0, by, bw * (clipX1 - clipX0), bh); c.clip();
    c.imageSmoothingEnabled = zoom < 2;
    c.drawImage(p, sx, sy, vw, vh, bx, by, bw, bh);
    c.restore(); return { sx, sy, k };
  };
  const draw = () => {
    const dpr = devicePixelRatio, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
    // every panel shows the same part of the picture: one picture's box, or several side by side
    const lab = (t, x, y) => { c.font = '600 12px ui-monospace,monospace'; const w = c.measureText(t).width + 10; c.fillStyle = '#000b'; c.fillRect(x, y, w, 18); c.fillStyle = '#fff'; c.fillText(t, x + 5, y + 13); };
    const ar = imgs[0].cv.width / imgs[0].cv.height;
    if (mode === 'side') {
      const n = imgs.length; let best = null;
      for (let cols = 1; cols <= n; cols++) { const rows = Math.ceil(n / cols), bw = W / cols, bh = H / rows, f = fitBox(ar, 1, bw, bh); if (!best || f.w > best.f.w) best = { cols, rows, bw, bh, f }; }
      imgs.forEach((im, i) => { const x = (i % best.cols) * best.bw, y = Math.floor(i / best.cols) * best.bh; put(im.cv, x + 1, y + 1, best.bw - 2, best.bh - 2); lab(im.label, x + 6, y + 6); });
      return;
    }
    const p = mode === 'diff' ? diff() : mode === 'flip' ? imgs[flip % imgs.length].cv : imgs[shot.heat && imgs.length === 3 ? 1 : 0].cv;
    const g = put(p, 0, 0, W, H, 0, mode === 'wipe' ? split : 1);
    if (mode === 'wipe') { put(imgs[1].cv, 0, 0, W, H, split, 1); c.fillStyle = '#fff'; c.fillRect(W * split - 1, 0, 2, H); lab(imgs[0].label, 6, 6); const t = imgs[1].label; c.font = '600 12px ui-monospace,monospace'; lab(t, W - c.measureText(t).width - 16, 6); }
    else if (mode === 'diff') lab(`difference ×4: ${imgs[0].label} vs ${imgs[1].label}`, 6, 6);
    else if (mode === 'flip') lab(`${imgs[flip % imgs.length].label} (tap to flip)`, 6, 6);
    else lab(imgs[shot.heat && imgs.length === 3 ? 1 : 0].label + (heatOn ? ' + flags' : '') + ' (tap: flags on / off)', 6, 6);
    if (shot.heat && (mode === 'heat' && heatOn)) {
      const h = shot.heat.cv, sk = p.width / h.width;
      c.save(); c.imageSmoothingEnabled = false; c.globalAlpha = .85;
      const f = fitBox(p.width, p.height, W, H), k = f.k * zoom; c.drawImage(h, g.sx / sk, g.sy / sk, W / k / sk, H / k / sk, 0, 0, W, H); c.restore();
      c.strokeStyle = '#0ff'; c.lineWidth = 2;
      for (const b of shot.heat.boxes) c.strokeRect((b.x * p.width - g.sx) * k, (b.y * p.height - g.sy) * k, b.w * p.width * k, b.h * p.height * k);
    }
  };
  const sync = () => { el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === mode)); el.querySelectorAll('[data-z]').forEach(b => b.classList.toggle('on', +b.dataset.z === zoom)); sl.style.display = mode === 'wipe' ? '' : 'none'; draw(); };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) mode = b.dataset.m; else if (b.dataset.z) { zoom = +b.dataset.z; if (zoom === 1) cx = cy = .5; } else if (b.dataset.a === 'x') { close(); return; }
    sync();
  });
  sl.oninput = () => { split = sl.value / 1000; draw(); };
  // drag pans, two fingers pinch, a tap flips (flip mode) or turns the flags on and off (heat)
  const pts = new Map(); let moved = 0, pinch0 = 0, zoom0 = 1;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoom; } });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const p0 = pts.get(e.pointerId), dx = e.clientX - p0[0], dy = e.clientY - p0[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom = Math.max(1, Math.min(32, zoom0 * d / Math.max(1, pinch0))); moved = 99; draw(); return; }
    moved += Math.abs(dx) + Math.abs(dy); const p = imgs[0].cv, f = fitBox(p.width, p.height, cv.clientWidth, cv.clientHeight), k = f.k * zoom;
    cx = Math.max(0, Math.min(1, cx - dx / k / p.width)); cy = Math.max(0, Math.min(1, cy - dy / k / p.height)); draw();
  });
  const up = e => { pts.delete(e.pointerId); if (moved < 6 && !pts.size) { if (mode === 'flip') flip++; else if (mode === 'heat') heatOn = heatOn ? 0 : 1; draw(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => pts.delete(e.pointerId));
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(1, Math.min(32, zoom * (e.deltaY < 0 ? 1.25 : .8))); draw(); }, { passive: false });
  const onResize = () => draw(); addEventListener('resize', onResize);
  const close = () => { removeEventListener('resize', onResize); el.remove(); };
  UI.closeViewer = close;
  requestAnimationFrame(sync);
}
function shrinkTo(src, w, h) { if (src.width === w && src.height === h) return src; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(src, 0, 0, w, h); return cv; }

/* ---------- report ---------- */
export function summary(R = lastRec) {
  if (!R) return 'Frame lab: nothing recorded yet (Rec, play, Rec again).';
  const m = measure(recRows(R), R.cfg[0]?.hz || 60), c = R.cfg[0] || {}, c1 = R.cfg[R.cfg.length - 1] || c, secs = ((R.t1 || performance.now()) - R.t0) / 1000;
  const hit = R.events.filter(e => e.k === 'H'), groups = {};
  for (const h of hit) for (const why of h.text.split(', ')) { const k = why.replace(/\s*\([^)]*\d[^)]*\)/g, '').trim(); (groups[k] ||= { n: 0, worst: 0 }).n++; groups[k].worst = Math.max(groups[k].worst, h.ms); }
  const S = R.samples, s0 = S[0], s1 = S[S.length - 1];
  const lines = [
    `Frame lab · ${R.title || R.game} · ${phoneLabel()} · build ${BUILD} · ${secs.toFixed(0)} s · ${c.view} (${c.form})`,
    c.tier ? `${c.backend} · ${c.tier} · 3D ${c.rw}x${c.rh} → ${c.ow}x${c.oh} (${c.ow ? Math.round(100 * c.rw / c.ow) : '?'}%) · upscaler ${c.upscaler} · frame gen ${c.fg || 'off'}${c.fx ? ` · effects smaller: ${c.fx}` : ''}${c1.tier !== c.tier || c1.rw !== c.rw || c1.fx !== c.fx ? ` · ended ${c1.tier} 3D ${c1.rw}x${c1.rh}${c1.fx ? ` (smaller: ${c1.fx})` : ''}` : ''}` : `${c.backend} · canvas ${c.rw}x${c.rh}${c.lite ? ' (eased)' : ''}`,
    `screen ${c.hz} Hz${c.rates ? ` (offers ${c.rates}, asked ${c.asked || 'none'})` : ''} · game ${c.fps} fps · phone class ${c.cls} · ${c.gpu || 'gpu ?'}`,
    m ? `avg ${m.fps.toFixed(1)} fps · 1% low ${m.low1.toFixed(0)} · 0.1% low ${m.low01 ? m.low01.toFixed(0) : '–'} · worst ${m.worst.toFixed(0)} ms · pacing ${(m.pacing * 100).toFixed(0)}% on the beat · ${m.stutters} stutters (${(m.stutters / Math.max(1, m.secs)).toFixed(2)}/s) · ${m.skipped} refreshes skipped${m.made ? ` · ${m.made} made + ${m.real} real` : ''}` : 'not enough frames in play',
    cpuLine(R),
    sysLine(R),
    memLine(S),
    hit.length ? 'Hitch causes: ' + Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, g]) => `${g.n}× ${k} (worst ${g.worst.toFixed(0)} ms)`).join('; ') : 'No hitches.',
    s0 && s1 ? `Heat ${['cool', 'warm', 'hot'][s0.heat]} → ${['cool', 'warm', 'hot'][s1.heat]}${s1.headroom != null && s1.headroom >= 0 ? ` (headroom ${s1.headroom.toFixed(2)})` : ''} · CPU speed ${Math.round(s0.cpu * 100)}% → ${Math.round(s1.cpu * 100)}% · battery ${Math.round(s0.level * 100)}% → ${Math.round(s1.level * 100)}%${s1.charging ? ' charging' : ''}${s1.heap ? ` · heap ${s1.heap} MB` : ''}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
// CPU per real frame while playing, middle and 95th percentile: the game's update(), its draw() (which
// includes the 3D kit's work on the CPU), the 3D render on its own, frame generation, GPU where known
function cpuLine(R) {
  const r = R.rows, pick = col => r.ft.map((ti, j) => r.p[ti] ? col[j] : null).filter(v => v != null).sort((a, b) => a - b);
  const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : 0;
  const part = (name, col) => { const a = pick(col); return a.length && q(a, .95) > 0 ? `${name} ${q(a, .5).toFixed(1)}/${q(a, .95).toFixed(1)}` : ''; };
  const parts = [part('update', r.upd), part('draw', r.drw), part('3D', r.cpu3d), part('frame gen', r.fg), part('GPU', r.gpu)].filter(Boolean);
  return parts.length ? `CPU per frame in ms (middle/95%): ${parts.join(' · ')}` : '';
}
// The memory guard (src/kit/memory.js) over the recording: its level at the start and end and the worst,
// and the phone's free memory against the line where it starts closing apps (Android)
const gb = mb => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
function memLine(S) {
  const s0 = S[0], s1 = S[S.length - 1]; if (!s0 || !s1 || s1.mem == null) return '';
  const worst = Math.max(...S.map(s => s.mem || 0)), low = S.reduce((a, s) => s.free != null && (a == null || s.free < a) ? s.free : a, null);
  return `Memory ${MEM[s0.mem]} → ${MEM[s1.mem]}${worst > s1.mem ? ` (worst ${MEM[worst]})` : ''}${s1.free != null ? ` · free ${gb(s1.free)}, least ${gb(low)} (apps close below ${gb(s1.line)})` : ''}${worst && memory.why ? ` · ${memory.why}` : ''}`;
}
// CPU by part over the recording: the average a frame and the worst frame, biggest first
function sysLine(R) {
  const S = R.sys, n = R.sysN; if (!S || !n) return '';
  const l = Object.entries(S).map(([k, e]) => [k, e.sum / n, e.max]).filter(([, a]) => a >= .05).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return l.length ? `CPU by part in ms a frame (average/worst): ${l.map(([k, a, m]) => `${k} ${a.toFixed(a < 1 ? 2 : 1)}/${m.toFixed(1)}`).join(' · ')}` : '';
}
let model = '';
(async () => { try { const { Device } = await import('@capacitor/device'); const d = await Device.getInfo(); model = `${d.manufacturer || ''} ${d.model || ''}`.trim(); } catch (_) {} })();
const phoneLabel = () => model || (navigator.userAgentData?.platform || navigator.platform || 'browser');

function reportData(R = lastRec) {
  const all = shots.map(s => ({ kind: s.kind, title: s.title, game: s.game, notes: s.notes, images: s.images.filter(i => i.cv).map(i => ({ label: i.label, url: toURL(i.cv) })), heat: s.heat ? { url: toURL(s.heat.cv), boxes: s.heat.boxes } : null }));
  return {
    made: new Date().toISOString(), build: BUILD, phone: phoneLabel(), platform: Capacitor.getPlatform(), ua: navigator.userAgent, summary: summary(R),
    rec: R ? { game: R.game, title: R.title, at: R.at, secs: ((R.t1 || performance.now()) - R.t0) / 1000, cfg: R.cfg, rows: R.rows, sys: R.sys, sysN: R.sysN, events: R.events, samples: R.samples.map(s => ({ ...s, t: r2(s.t - R.t0) })), stats: measure(recRows(R), R.cfg[0]?.hz || 60) } : null,
    shots: all,
  };
}
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function reportHTML(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frame lab report</title>
<style>:root{color-scheme:dark;--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--line:#30363d}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;padding:16px;max-width:1100px;margin:auto}
pre{white-space:pre-wrap;background:#161b22;border:1px solid var(--line);border-radius:8px;padding:12px;font:12px/1.5 ui-monospace,Menlo,monospace}canvas{width:100%;display:block;background:#161b22;border:1px solid var(--line);border-radius:8px;margin:6px 0 16px}
h1{font-size:20px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%;font:12px ui-monospace,monospace}td,th{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
.ab{position:relative;overflow:hidden;border-radius:8px;border:1px solid var(--line)}.ab img{display:block;width:100%;image-rendering:pixelated}.ab .b{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}.ab input{width:100%}
.row{display:flex;gap:8px;flex-wrap:wrap}.row figure{flex:1 1 240px;margin:0}.row img{width:100%;image-rendering:pixelated;border-radius:6px}figcaption{color:var(--mut);font-size:12px}.k{color:var(--mut)}</style></head><body>
<h1>Frame lab report</h1><pre id="sum"></pre><div id="charts"></div><div id="hitches"></div><div id="shots"></div>
<script>const D=${json};
const $=(h)=>{const d=document.createElement('div');d.innerHTML=h;return d};document.getElementById('sum').textContent=D.summary+'\\n\\n'+D.phone+' · '+D.platform+' · '+D.made;
const C={real:'#4ade80',made:'#e879f9',bad:'#f87171',grey:'#64748b',line:'#30363d',mut:'#8b949e',cpu:'#60a5fa',fg:'#e879f9',gpu:'#fbbf24'};
function chart(title,h,draw){const w=document.getElementById('charts');w.appendChild($('<h2>'+title+'</h2>'));const c=document.createElement('canvas');w.appendChild(c);const W=c.clientWidth,dpr=devicePixelRatio;c.width=W*dpr;c.height=h*dpr;c.style.height=h+'px';const x=c.getContext('2d');x.scale(dpr,dpr);x.font='11px ui-monospace,monospace';draw(x,W,h)}
const R=D.rec;if(R){const r=R.rows,n=r.t.length,T=r.t[n-1]||1,cfg=R.cfg[0]||{},rf=1000/(cfg.hz||60),E=cfg.fg?rf:Math.max(rf,1000/(cfg.fps||60));
const pres=[];let prev=0;for(let i=0;i<n;i++){if(!r.k[i])continue;if(prev&&r.t[i]-prev<250)pres.push([r.t[i],r.t[i]-prev,r.k[i],r.p[i]]);prev=r.t[i]}
const ev=R.events,col={S:'#fb923c',X:'#a78bfa',G:'#facc15',L:'#f87171',Q:'#38bdf8',F:'#fff',C:'#94a3b8',H:'#f87171'};
const axes=(x,W,h,top,lab)=>{x.strokeStyle=C.line;x.fillStyle=C.mut;for(const [v,t] of lab){const y=h-20-(v/top)*(h-36);x.beginPath();x.moveTo(36,y);x.lineTo(W,y);x.stroke();x.fillText(t,2,y+4)}for(let s=0;s<=T/1000;s+=Math.max(1,Math.ceil(T/1000/10))){const xx=36+(s*1000/T)*(W-40);x.fillText(s+'s',xx,h-4)}};
const X=(t,W)=>36+(t/T)*(W-40);
chart('Frame time (every picture shown)',220,(x,W,h)=>{const top=Math.max(E*3,50);axes(x,W,h,top,[[E,E.toFixed(1)],[E*2,(E*2).toFixed(1)],[top,top.toFixed(0)+'ms']]);for(const [t,iv,k,p] of pres){const y=h-20-Math.min(1,iv/top)*(h-36);x.fillStyle=!p?C.grey:iv>=E*1.5&&iv-E>=rf*.9?C.bad:k===2?C.made:C.real;x.fillRect(X(t,W),y,1.2,h-20-y)}for(const e of ev){x.fillStyle=col[e.k]||'#fff';x.fillRect(X(e.t-0,W),4,2,8)}x.fillStyle=C.mut;x.fillText('green real · magenta made · red stutter · ticks: orange shader, purple textures, yellow GC, blue quality, grey card',40,14)});
chart('Frame rate (1 s windows) and 1% low',180,(x,W,h)=>{const top=(cfg.hz||60)*1.1;axes(x,W,h,top,[[30,'30'],[60,'60'],[cfg.hz||60,String(cfg.hz||60)]]);const pts=[],low=[];for(let s=0;s<T;s+=500){const w=pres.filter(p=>p[0]>s&&p[0]<=s+1000&&p[3]);if(w.length<3)continue;const sum=w.reduce((a,b)=>a+b[1],0),sorted=w.map(p=>p[1]).sort((a,b)=>a-b);pts.push([s+500,w.length/(sum/1000)]);low.push([s+500,1000/sorted[Math.floor(.99*(sorted.length-1))]])}for(const [arr,c] of [[pts,C.real],[low,C.bad]]){x.strokeStyle=c;x.lineWidth=1.5;x.beginPath();arr.forEach(([t,v],i)=>{const y=h-20-(v/top)*(h-36);i?x.lineTo(X(t,W),y):x.moveTo(X(t,W),y)});x.stroke()}x.fillStyle=C.mut;x.fillText('green fps · red 1% low',40,14)});
chart('CPU time per real frame',180,(x,W,h)=>{const top=Math.max(E*1.5,10);axes(x,W,h,top,[[E,'budget '+E.toFixed(1)],[top,top.toFixed(0)+'ms']]);for(let j=0;j<r.ft.length;j++){const t=r.t[r.ft[j]];let y0=h-20;for(const [v,c] of [[r.upd[j],'#22d3ee'],[r.drw[j],C.cpu],[r.fg[j],C.fg]]){const hh=Math.min(1,(v||0)/top)*(h-36);x.fillStyle=c;x.fillRect(X(t,W),y0-hh,1.2,hh);y0-=hh}if(r.gpu[j]!=null){x.fillStyle=C.gpu;x.fillRect(X(t,W),h-20-Math.min(1,r.gpu[j]/top)*(h-36),2,2)}}x.fillStyle=C.mut;x.fillText('cyan update · blue draw (incl. 3D) · magenta frame gen · yellow dots GPU',40,14)});
const S=R.samples;if(S.length>1)chart('Phone: CPU speed, heat, battery',160,(x,W,h)=>{axes(x,W,h,1,[[.5,'50%'],[1,'100%']]);for(const [f,c] of [[s=>s.cpu,'#22d3ee'],[s=>s.heat/2,'#f87171'],[s=>s.headroom!=null&&s.headroom>=0?Math.min(1,s.headroom):null,'#fb923c'],[s=>s.level,'#4ade80'],[s=>s.mem!=null?s.mem/3:null,'#a78bfa']]){x.strokeStyle=c;x.lineWidth=1.5;x.beginPath();let st=0;for(const s of S){const v=f(s);if(v==null)continue;const y=h-20-v*(h-36);st++?x.lineTo(X(s.t,W),y):x.moveTo(X(s.t,W),y)}x.stroke()}x.fillStyle=C.mut;x.fillText('cyan CPU speed probe · red heat (0 cool, 1 hot) · orange thermal headroom · green battery · violet memory (0 fine, 1 critical)',40,14)});
chart('Frame times in screen refreshes',120,(x,W,h)=>{const hist=R.stats?R.stats.hist:[0,0,0,0,0],tot=hist.reduce((a,b)=>a+b,0)||1;hist.forEach((v,i)=>{const bw=(W-40)/5,bh=(v/tot)*(h-36);x.fillStyle=i?C.bad:C.real;x.fillRect(40+i*bw+4,h-20-bh,bw-8,bh);x.fillStyle=C.mut;x.fillText((i+1)+(i===4?'+':'')+' refresh'+(i?'es':'')+' '+(100*v/tot).toFixed(1)+'%',44+i*bw,h-4)})});
const hs=ev.filter(e=>e.k==='H');const t=document.getElementById('hitches');t.appendChild($('<h2>Hitches ('+hs.length+') and events</h2>'));t.appendChild($('<table><tr><th>at</th><th>ms</th><th>what</th></tr>'+ev.map(e=>'<tr><td>'+(e.t/1000).toFixed(2)+'s</td><td>'+(e.ms||'')+'</td><td><span style="color:'+(col[e.k]||'#fff')+'">'+e.k+'</span> '+e.text.replace(/</g,'&lt;')+'</td></tr>').join('')+'</table>'));
t.appendChild($('<h2>Settings</h2><pre>'+JSON.stringify(R.cfg,null,1).replace(/</g,'&lt;')+'</pre>'))}
const sh=document.getElementById('shots');if(D.shots.length)sh.appendChild($('<h2>Pictures</h2>'));
for(const s of D.shots){sh.appendChild($('<h2>'+s.title+' · '+s.game+'</h2><p class="k">'+(s.notes||[]).join('<br>').replace(/</g,'&lt;')+'</p>'));
if(s.kind==='ab'&&s.images.length===2){const d=$('<div class="ab"><img src="'+s.images[0].url+'"><img class="b" src="'+s.images[1].url+'"></div><input type="range" min="0" max="100" value="50"><p class="k">left: '+s.images[0].label+' · right: '+s.images[1].label+'</p>');sh.appendChild(d);const b=d.querySelector('.b'),i=d.querySelector('input');i.oninput=()=>b.style.clipPath='inset(0 0 0 '+i.value+'%)'}
else{const row=$('<div class="row">'+s.images.map(i=>'<figure><img src="'+i.url+'"><figcaption>'+i.label+'</figcaption></figure>').join('')+(s.heat?'<figure><img src="'+s.heat.url+'" style="background:#000"><figcaption>flagged pixels</figcaption></figure>':'')+'</div>');sh.appendChild(row)}}
<\/script></body></html>`;
}
async function shareReport() {
  const data = reportData(); if (!data.rec && !data.shots.length) return UI.flash('Nothing to report yet: Rec, or take an A/B, Shimmer or FG check first.');
  UI.busy('Making the report…'); await new Promise(r => setTimeout(r, 20));
  const html = reportHTML(data), name = `framelab-${(data.rec?.game || data.shots[0]?.game || 'app')}-${data.made.slice(0, 19).replace(/[:T]/g, '-')}.html`;
  try {
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { uri } = await Filesystem.writeFile({ path: name, data: html, directory: Directory.Cache, encoding: Encoding.UTF8 });
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Frame lab report', text: data.summary, files: [uri], dialogTitle: 'Share the frame lab report' });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
    UI.flash(`Report made (${(html.length / 1048576).toFixed(1)} MB).`);
  } catch (e) { if (!/cancel/i.test(String(e?.message || e))) UI.flash('Report not shared: ' + (e?.message || e)); }
  finally { UI.busy(''); }
  return html.length;
}
async function copySummary() {
  const txt = summary() + (shots.length ? '\n' + shots.map(s => `${s.title} (${s.game}): ${(s.notes || [])[0] || ''}`).join('\n') : '');
  try { await navigator.clipboard.writeText(txt); UI.flash('Summary copied: paste it into chat.'); } catch (_) { prompt('Copy the summary:', txt); }
  return txt;
}

/* ---------- the panel ---------- */
const UI = { s: null, el: null };
const CSS = `.fl{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 4px);z-index:10000;width:min(calc(100vw - 8px),560px);box-sizing:border-box;background:#05080dE6;color:#dfe;border:1px solid #fff2;border-radius:10px;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:4px 6px 6px;touch-action:none;user-select:none;-webkit-user-select:none}
.fl.bottom{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 4px)}.fl-top{display:flex;align-items:center;gap:6px}.fl-top b{color:#e879f9;letter-spacing:.06em}.fl-sum{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#fff}
.fl button{font:600 11px ui-monospace,Menlo,monospace;color:#eef;background:#ffffff14;border:1px solid #fff3;border-radius:6px;padding:5px 7px;min-height:28px}.fl button.on{background:#e879f9;color:#000;border-color:#e879f9}.fl button.rec.on{background:#ef4444;border-color:#ef4444;color:#fff}
.fl canvas{display:block;width:100%;height:64px;margin-top:3px}.fl pre{margin:2px 0 3px;white-space:pre-wrap;word-break:break-word;font-size:10.5px;line-height:1.3}.fl.short pre{display:none}.fl-btns{display:flex;flex-wrap:nowrap;gap:4px;overflow-x:auto;scrollbar-width:none}.fl-btns button{flex:none}.fl.min canvas,.fl.min pre,.fl.min .fl-btns,.fl.min .fl-menu{display:none}
.fl-menu{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.fl-menu[hidden]{display:none}.fl-msg{color:#fde68a;min-height:0}.fl-msg:empty{display:none}
.fl-tint{position:fixed;pointer-events:none;z-index:9999;background:#ff00ff38;opacity:0;outline:3px solid #ff00ff}
.fl-view{position:fixed;inset:0;z-index:10001;background:#111;display:flex;flex-direction:column;color:#eee;font:12px/1.4 ui-monospace,Menlo,monospace;padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0)}
.fl-vbar{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px}.fl-vbar b{margin-right:6px}.fl-vbar button{font:600 12px ui-monospace,monospace;color:#eee;background:#ffffff14;border:1px solid #fff3;border-radius:6px;padding:6px 8px}.fl-vbar button.on{background:#e879f9;color:#000}
.fl-vbar [data-a=x]{margin-left:auto}.fl-view canvas{flex:1;min-height:0;width:100%;touch-action:none}.fl-split{margin:4px 10px}.fl-vnotes{padding:6px 10px 10px;white-space:pre-wrap;color:#aab}`;

function panel() {
  if (UI.el) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); UI.style = st;
  const el = document.createElement('div'); el.className = 'fl' + (store.get(KEY + '_pos', '') === 'bottom' ? ' bottom' : '') + (store.get(KEY + '_short', false) ? ' short' : '');
  el.innerHTML = `<div class="fl-top"><b>FRAME LAB</b><span class="fl-sum"></span><button data-a="txt" aria-label="Show or hide the numbers">i</button><button data-a="min" aria-label="Fold the panel">–</button><button data-a="pos" aria-label="Move the panel">⇅</button><button data-a="close" aria-label="Turn the frame lab off">✕</button></div>
    <canvas></canvas><pre></pre><div class="fl-msg"></div>
    <div class="fl-btns"><button data-a="rec" class="rec">● Rec</button><button data-a="freeze">Freeze</button><button data-a="tint">Tint</button><button data-a="ab">A/B</button><button data-a="shimmer">Shimmer</button><button data-a="fg">FG check</button><button data-a="report">Report</button><button data-a="copy">Copy</button></div>
    <div class="fl-menu" hidden>${Object.entries(PAIRS).map(([k, p]) => `<button data-ab="${k}">${p.title}</button>`).join('')}</div>`;
  document.body.appendChild(el); UI.el = el;
  tintEl = document.createElement('div'); tintEl.className = 'fl-tint'; document.body.appendChild(tintEl);
  UI.g = el.querySelector('canvas'); UI.txt = el.querySelector('pre'); UI.sum = el.querySelector('.fl-sum'); UI.msg = el.querySelector('.fl-msg'); UI.menu = el.querySelector('.fl-menu');
  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ab) { UI.menu.hidden = true; runAB(b.dataset.ab); return; }
    switch (b.dataset.a) {
      case 'min': el.classList.toggle('min'); break;
      case 'txt': el.classList.toggle('short'); store.set(KEY + '_short', el.classList.contains('short')); break;
      case 'pos': el.classList.toggle('bottom'); store.set(KEY + '_pos', el.classList.contains('bottom') ? 'bottom' : ''); break;
      case 'close': closeLab(); return;
      case 'rec': rec ? stopRec() : startRec(UI.s); break;
      case 'freeze': setFrozen(!frozen); break;
      case 'tint': tint = !tint; if (!tint) tintEl.style.opacity = 0; tintRect = 0; break;
      case 'ab': UI.menu.hidden = !UI.menu.hidden; break;
      case 'shimmer': runShimmer(); break;
      case 'fg': runFG(); break;
      case 'report': shareReport(); break;
      case 'copy': copySummary(); break;
    }
    UI.render();
  });
  let msgT = 0;
  UI.flash = m => { if (!UI.el) return m; UI.msg.textContent = m; clearTimeout(msgT); msgT = setTimeout(() => { if (!UI.busyNow && UI.msg) UI.msg.textContent = ''; }, 6000); return m; };
  UI.busy = m => { UI.busyNow = !!m; if (UI.el) UI.msg.textContent = m; };
  UI.render = () => {
    const q = a => el.querySelector(`[data-a="${a}"]`);
    q('rec').classList.toggle('on', !!rec); q('rec').textContent = rec ? `■ ${((performance.now() - rec.t0) / 1000).toFixed(0)}s` : '● Rec';
    q('txt').classList.toggle('on', !el.classList.contains('short')); q('freeze').classList.toggle('on', frozen); q('tint').classList.toggle('on', tint); q('ab').classList.toggle('on', !UI.menu.hidden);
  };
  UI.render();
}

function drawGraph(now) {
  const cv = UI.g, dpr = devicePixelRatio, W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const rf = 1000 / screenHz(), t0 = now - WIN, X = t => (t - t0) / WIN * W, strip = 7, top = strip + 3;
  let E = rf; for (let n = Math.min(count, 4), i = (head - 1 + N) % N; n > 0; n--, i = (i - 1 + N) % N) E = Math.max(E, EXP[i]);
  const max = Math.max(50, E * 3), Y = ms => H - Math.min(1, ms / max) * (H - top - 2);
  c.strokeStyle = '#ffffff22'; c.lineWidth = 1;
  for (const v of [E, E * 2]) { c.beginPath(); c.setLineDash(v === E ? [4, 3] : [1, 3]); c.moveTo(0, Y(v)); c.lineTo(W, Y(v)); c.stroke(); }
  c.setLineDash([]); c.fillStyle = '#9ab'; c.fillText(`${E.toFixed(1)} ms`, 2, Y(E) - 2); c.fillText(`${max.toFixed(0)}`, 2, top + 8);
  let prevP = 0, prevT = 0;
  for (let n = Math.min(count, N), i = (head - n + N) % N; n > 0; n--, i = (i + 1) % N) {
    const t = T[i]; if (t < t0 - 200) { if (K[i]) prevP = t; prevT = t; continue; }
    const x = X(t), k = K[i];
    // the refresh strip: what each refresh showed, red where one was skipped
    if (prevT && t - prevT > 1.6 * rf && t - prevT < PAUSE_GAP) { c.fillStyle = '#ef4444'; c.fillRect(X(prevT + rf), 0, Math.max(1.5, X(t) - X(prevT + rf)), strip); }
    c.fillStyle = k === 2 ? '#e879f9' : k === 1 ? '#4ade80' : '#334155'; c.fillRect(x, 0, Math.max(1, rf / WIN * W - .3), strip);
    prevT = t;
    if (!k) continue;
    if (prevP && t - prevP < PAUSE_GAP) {
      const iv = t - prevP, e = EXP[i], st = iv >= e * 1.5 && iv - e >= rf * .9;
      c.fillStyle = !PLAY[i] ? '#64748b' : st ? '#ef4444' : k === 2 ? '#e879f9' : '#4ade80';
      const y = Y(iv); c.fillRect(x - 1, y, Math.max(1.5, iv / WIN * W - .5), H - y);
    }
    prevP = t;
  }
  const col = { S: '#fb923c', X: '#a78bfa', G: '#facc15', L: '#f87171', Q: '#38bdf8', F: '#fff', C: '#94a3b8', H: null };
  c.font = '9px ui-monospace,monospace';
  for (const e of events) { if (e.t < t0 || !col[e.k]) continue; c.fillStyle = col[e.k]; c.fillText(e.k, X(e.t) - 2, top + 9); }
}

function text(now) {
  const s = UI.s, d = s?.def, m = measure(windowRows(5000), screenHz()), cfg = config(s), hd = HD && is3D(d), i = hd ? HD.info : null, smp = samples[samples.length - 1];
  const lastH = [...events].reverse().find(e => e.k === 'H');
  const fpsTxt = m ? `${m.fps.toFixed(0)} fps · 1% ${m.low1.toFixed(0)} · 0.1% ${m.low01 ? m.low01.toFixed(0) : '–'} · pacing ${(m.pacing * 100).toFixed(0)}% · ${m.stutters} stutter${m.stutters === 1 ? '' : 's'}/5 s${m.skipped ? ` · ${m.skipped} skipped` : ''}` : 'waiting for play…';
  UI.sum.textContent = (frozen ? 'FROZEN · ' : '') + fpsTxt;
  const L = [];
  L.push(`${d ? d.id : 'no card'}${s ? ' ' + s.state : ''} · screen ${cfg.hz} Hz${screen.rates.length ? ` (offers ${cfg.rates}, asked ${screen.want || 'none'})` : ''}${screen.lifted ? ' 60 Hz cap off' : ''} · game ${cfg.fps} fps · ${cfg.view}`);
  if (hd) {
    const pct = i.ow ? Math.round(100 * i.rw / i.ow) : 0;
    L.push(`${i.backend} ${cfg.tier} (step ${Math.round(HD.res * 100)}%) · 3D ${i.rw}×${i.rh} → ${i.ow}×${i.oh} ${pct}% · ${i.upscaled || 'no upscaler'}${cfg.fx ? ` · smaller: ${cfg.fx}` : ''}`);
    L.push(`FG ${i.framegen ? `${i.framegen} ×${i.fgSteps} ${r1(i.fgMs)} ms` : 'off'} · ${frameGenStatus(d) || ''}`.slice(0, 120));
    L.push(`CPU upd ${r2(last.upd)} draw ${r2(last.drw)} 3D ${r2(i.cpu)} ms · GPU ${i.gpuMs != null ? r2(i.gpuMs) + ' ms' + (i.gpuCompute > .05 ? ` (${r2(i.gpuCompute)} compute)` : '') : 'n/a'} · ${i.calls} calls ${(i.tris / 1000).toFixed(0)}k tris${i.still ? ' · still' : ''}`);
  } else if (s) {
    L.push(`${cfg.backend} canvas ${s.canvas.width}×${s.canvas.height}${s.lite ? ' (eased: phone fell behind)' : ''} · CPU upd ${r2(last.upd)} draw ${r2(last.drw)} ms`);
  }
  if (SYS.size) L.push(`CPU by part (ms a frame): ${partsText([...SYS])}`);
  if (smp) L.push(`heat ${['cool', 'warm', 'hot'][smp.heat] || '?'}${smp.headroom != null && smp.headroom >= 0 ? ` hr ${smp.headroom.toFixed(2)}` : ''}${smp.saving ? ' saving' : ''} · CPU speed ${Math.round(smp.cpu * 100)}% · battery ${Math.round(smp.level * 100)}%${smp.charging ? '+' : ''}${smp.heap ? ` · heap ${smp.heap} MB` : ''} · memory ${MEM[smp.mem] || '?'}${smp.free != null ? ` ${gb(smp.free)} free` : ''}`);
  if (lastH) L.push(`last hitch ${Math.round(lastH.ms)} ms ${((now - lastH.t) / 1000).toFixed(0)} s ago: ${lastH.text}`);
  UI.txt.textContent = L.join('\n');
  if (rec) UI.render();
}

/* ---------- on and off ---------- */
let raf = 0, sampler = 0, obs = null, lastText = 0, lastGraph = 0;
function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!UI.el || UI.el.classList.contains('min') && now - lastText < 500) return;
  if (now - lastGraph > 66) { lastGraph = now; try { if (!UI.el.classList.contains('min')) drawGraph(now); } catch (e) { console.warn('[framelab]', e); } }
  if (now - lastText > 250) { lastText = now; try { text(now); } catch (e) { console.warn('[framelab]', e); } }
}
const onResize = () => { C.resizeAt = performance.now(); event('F', `resize to ${innerWidth}x${innerHeight}`); };
const onVis = () => { if (document.visibilityState === 'visible') C.hiddenAt = performance.now(); };
let api = null;
/** Turns the lab on. ctx.active() is the card on screen; returns the hooks the feed calls. */
export function openLab(ctx = {}) {
  if (api) return api;
  store.set(KEY, true); PROF.on = true; take(); panel(); obs = observe(); sampler = setInterval(sample, 2000); setTimeout(sample, 300);
  addEventListener('resize', onResize); document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(loop);
  api = {
    /** every refresh, from src/main.js frame() */
    tick(now, s, how, upd, drw) { UI.s = s; if (s && is3D(s.def) && !HD) loadHD(); tick(now, s, how, upd, drw); },
    /** frame generation's hook says what each refresh shows */
    get frozen() { return frozen; },
    close: closeLab, summary, copy: copySummary, report: shareReport, data: reportData, html: () => reportHTML(reportData()),
    rec: v => { if (v === false) stopRec(); else startRec(UI.s); },
    /** CPU by part right now ({ name: ms a frame }); trace(true) also puts each part on Chrome DevTools' timeline */
    parts: () => Object.fromEntries(SYS), trace: v => { PROF.trace = v !== false; },
    /** the memory guard as it stands; memory(2) acts as if memory were low (null: back to the phone's readings) */
    memory: level => { if (level !== undefined) forceMemory(level); return { ...memory }; },
    freeze: setFrozen, ab: runAB, shimmer: runShimmer, fg: runFG, shots, events, measure,
    onClose: ctx.onClose,
  };
  // frame generation tells us whether each refresh showed a real or a made frame (its fgTap hook, kept for tests too)
  loadHD().then(() => {
    if (!HD || !api) return; const prev = HD.fgTap;
    if (prev?.gsLab) return;
    const tap = (kind, cv, when) => { shownKind = kind; prev?.(kind, cv, when); }; tap.gsLab = true; tap.prev = prev; HD.fgTap = tap;
  });
  return api;
}
function closeLab() {
  if (!api) return; store.set(KEY, false); if (rec) stopRec(); setFrozen(false); PROF.on = PROF.trace = false; take(); SYS.clear();
  cancelAnimationFrame(raf); clearInterval(sampler); obs?.disconnect(); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis);
  UI.closeViewer?.(); UI.el?.remove(); UI.style?.remove(); tintEl?.remove(); UI.el = null; tintEl = null;
  if (HD?.fgTap?.gsLab) HD.fgTap = HD.fgTap.prev || null;
  const cb = api.onClose; api = null; cb?.();
}
export const labWanted = () => !!store.get(KEY, false);
