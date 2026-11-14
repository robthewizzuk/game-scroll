// One place that talks to the graphics chip: its name, whether it has WebGPU, the shared WebGPU
// renderer, and frame copies and pixel reads that work on both. Classic Console (toon3d.js), Next Gen and
// AR (hd3d.js) and the speed check (speed.js) all come here, so the move to WebGPU (docs/webgpu-move.md)
// changes this file instead of every kit. On any device that offers WebGPU, prepareGPU() makes the one
// WebGPURenderer that Next Gen and AR views draw with when everything in them has a WebGPU version
// (hd3d.js), and prepareConsoleGPU() the one Classic Console views draw with (toon3d.js); renderer.js
// makes the WebGL ones, used everywhere else.
// No three.js here (the app loads it only with the first 3D game): three's WebGPU build is a dynamic import.
// Not for games: they get 3D through gs.toon, gs.hd and gs.ar.
import { installPack } from './pack.js';
import { watchDevice } from './pipes.js';
import { STEER } from './steering.js';

/** 'webgl' or 'webgpu' for a renderer from makeRenderer or webgpu(). */
export const backend = r => r?.gsBackend || 'webgl';
/** WebGL shader programs built so far this session, and the WebGL renderer that last drew (renderer.js keeps both; the frame lab reads them). */
export const glStats = { programs: 0, r: null };

let chip = null;
/** The graphics chip's name, read once from a throwaway context ('' if unknown). */
export function gpuName() {
  if (chip != null) return chip;
  chip = '';
  try {
    const cv = document.createElement('canvas'), g = cv.getContext('webgl2') || cv.getContext('webgl');
    if (g) {
      const e = g.getExtension('WEBGL_debug_renderer_info');
      chip = String((e && g.getParameter(e.UNMASKED_RENDERER_WEBGL)) || g.getParameter(g.RENDERER) || '');
      g.getExtension('WEBGL_lose_context')?.loseContext();   // give the context straight back
    }
  } catch (_) { /* no WebGL: stays '' */ }
  return chip;
}

/** A graphics chip's name without the browser's wrapping: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 ...)" is "NVIDIA GeForce RTX 4070". */
export function chipLabel(name) {
  const s = String(name || ''), m = /^ANGLE \([^,]*, (?:ANGLE Metal Renderer: )?(.+?)(?: \(0x[0-9a-f]+\))?(?: Direct3D1\d.*| OpenGL.*| vs_\d.*)?(?:, [^,]*)?\)$/i.exec(s);
  return (m ? m[1] : s).trim().slice(0, 40);
}

let gpuAsked = null;
/** Resolves true if this device offers WebGPU (asked once). */
export function hasWebGPU() {
  return gpuAsked ||= (async () => {
    try { return !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter()); } catch (_) { return false; }
  })();
}

/**
 * Copies the renderer's last frame into a 2D canvas: drawImage(renderer canvas, sx, sy, sw, sh, dx, dy,
 * dw, dh). Call it straight after rendering, in the same task: neither WebGL (without
 * preserveDrawingBuffer) nor WebGPU keeps the picture after that.
 */
export function copyFrame(r, c, sx, sy, sw, sh, dx, dy, dw, dh) {
  c.drawImage(r.domElement, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Reads pixels from a render target. Always a promise, as it is on WebGPU; on WebGL it uses three's
 * async read where there is one (no stall), else the plain read.
 */
export function readPixels(r, target, x, y, w, h, buf = new Uint8Array(w * h * 4)) {
  if (r.readRenderTargetPixelsAsync) return r.readRenderTargetPixelsAsync(target, x, y, w, h, buf).then(() => buf);
  r.readRenderTargetPixels(target, x, y, w, h, buf);
  return Promise.resolve(buf);
}

/**
 * Marks only the first n items of a buffer attribute (instance matrices, particle positions...) to go up to
 * the graphics chip, not the whole array: a list sized for thousands that holds a few hundred this frame
 * sent all of it every frame (6,000 trees: 100 ms of the frame on WebGPU). Nothing goes up when n is 0.
 */
export function sendUsed(a, n) {
  if (!a || n <= 0) return;
  a.clearUpdateRanges(); a.addUpdateRange(0, Math.min(a.array.length, n * a.itemSize)); a.needsUpdate = true;
}

/* ---------- WebGPU: always, where the device has it ---------- */
// Rob (2026-11-09): no setting; 3D games use WebGPU whenever the device supports it and WebGL otherwise.
// setGpuPick stays for tests and the look-compare / gpu-games scripts (they draw each backend in turn);
// it isn't saved.
let pick = 'webgpu';
/** 'webgpu' (the default: used where the device has it) or 'webgl' (tests only). */
export const gpuPick = () => pick;
/** Tests only: draw with WebGL ('webgl') or WebGPU where there is one ('webgpu'). */
export function setGpuPick(v) { pick = v === 'webgl' ? 'webgl' : 'webgpu'; if (pick === 'webgpu') prepareGPU(); }

let gpu = null, gpuLoad = null;
/**
 * Gets WebGPU ready if the device has it: loads three's WebGPU build and the
 * Next Gen WebGPU effects (hd3d-gpu.js), and makes the shared WebGPURenderer. Never rejects; resolves
 * to the same thing webgpu() returns. The app calls it while loading the 3D parts.
 */
export function prepareGPU() {
  if (pick !== 'webgpu' || LOSS.n > LOSS.most) return Promise.resolve(null);   // (lost too often this session: WebGL)
  return gpuLoad ||= (async () => {
    try {
      // (the phone and driver steering list may keep this device on WebGL: src/steer.js, read at start; waited for at most a second)
      await Promise.race([STEER.ready, new Promise(ok => setTimeout(ok, 1200))]);
      if (pick === 'webgpu' && STEER.webgpu === false) { console.info('WebGPU: off on this device (steering list: ' + STEER.rules.join(', ') + ')'); return null; }
      if (!await hasWebGPU()) { console.warn('WebGPU: no adapter'); return null; }
      const [W, fx] = await Promise.all([import('three/webgpu'), import('./hd3d-gpu.js')]);
      const canvas = document.createElement('canvas');
      // trackTimestamp: three times each pass on the GPU where the phone allows it (hd3d.js reads it as HD.info.gpuMs)
      // HDR screens: a half-float canvas in extended range, so highlights can go brighter than paper white
      // (hd3d-gpu.js GpuChain); everywhere else the usual 8-bit canvas
      const hdr = hdrScreen();
      // room for the scene pass's extra pictures (motion, the see-through mask, normals, bounce light,
      // reflections: 8 bytes a pixel each): WebGPU promises 32 bytes a pixel and most chips allow 64 or
      // more, which has to be asked for. Asked of the adapter three will pick (the same options); if the
      // device won't start with it, once more without
      // Pictures one shader may read: WebGPU promises 16, and a close-up person's skin on the high tier reads
      // 17 with its shadows (on the test machine's chip, which allows 16, the pipeline was refused and the skin
      // not drawn); many chips allow more, which has to be asked for: as many as the chip has, up to 32
      let room = 32, pics = 16;
      try { const lim = (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' }))?.limits; room = Math.min(64, lim?.maxColorAttachmentBytesPerSample || 32); pics = Math.min(32, lim?.maxSampledTexturesPerShaderStage || 16); } catch (_) { /* stays 32 */ }
      const make = async (cv, bytes) => {
        const limits = { ...(bytes > 32 ? { maxColorAttachmentBytesPerSample: bytes } : {}), ...(pics > 16 ? { maxSampledTexturesPerShaderStage: pics } : {}) };
        const r = new W.WebGPURenderer({ canvas: cv, alpha: true, antialias: false, powerPreference: 'high-performance', trackTimestamp: true, ...(hdr ? { outputType: W.HalfFloatType } : {}), ...(Object.keys(limits).length ? { requiredLimits: limits } : {}) });
        await r.init(); return r;
      };
      let r = null;
      try { r = await make(canvas, room); } catch (e) { if (room <= 32 && pics <= 16) throw e; }
      if ((room > 32 || pics > 16) && !r?.backend?.isWebGPUBackend) { r?.dispose(); pics = 16; r = await make(document.createElement('canvas'), 32); }
      r.gsPixelBytes = r.backend?.device?.limits?.maxColorAttachmentBytesPerSample || 32;
      r.gsHdr = hdr && (r.backend?.context?.getConfiguration?.()?.toneMapping?.mode ?? 'extended') === 'extended';
      if (!r.backend?.isWebGPUBackend) { console.warn('WebGPU: three fell back to WebGL 2'); r.dispose(); return null; }   // three fell back to WebGL 2: keep our own WebGL path
      r.gsBackend = 'webgpu';
      watchDevice(r.backend.device, W.REVISION);   // (pipelines a round makes are noted, and made ahead next time: pipes.js)
      fx.manyLights(r);
      fx.listWalk(r);   // (three's walk of the scene for each render, over the scene's list: scene-list.js)
      freeUnbuilt(r);
      await fx.halfCheck(r);   // half precision in the kit's own passes, where the chip has it and compiles them (half.js)
      fx.sharpMips(r);   // textures read for the screen's size when SGSR 2 upscales
      fx.aoInShading(r);   // ambient occlusion on the light that bounces only, in each thing's own shading (hd3d-gpu.js)
      installPack(r);   // code-made textures packed into the chip's compressed formats (spark.js)
      // the graphics chip went away (its driver restarted, the browser's GPU process crashed): three is told it is
      // lost (it stops drawing on it) and lostGPU() makes a new one (said here, not by three's own handler, which
      // logs an error)
      r.onDeviceLost = () => { r._isDeviceLost = true; };
      const dev = r.backend.device;
      dev?.lost?.then(info => lostGPU(r, info));
      return gpu = { r, W, fx, dev, at: LOSS.n };
    } catch (e) { console.warn('WebGPU did not start:', e); gpuLoad = null; return null; }
  })();
}
// A geometry freed (geometry.dispose()) has three free what each of its render objects sent to the chip, and
// three asks a render object for that by building its shader. One whose shader was still being built in the
// background (hd3d.js compileGPU: a new thing held back, a level part let go of before it showed) was built
// there and then, between frames, for the screen with no extra outputs, and three kept that build for the
// render object and under its key: the picture the scene is drawn into has two or more outputs, so the next
// thing of that look got a pipeline WebGPU refuses ("Color target has no corresponding fragment stage output")
// and was not drawn: people's eyes and clothes, after a scene that freed its people. A render object not built
// yet has sent nothing to the chip: there is nothing of it to free.
function freeUnbuilt(r) {
  const G = r._geometries, free = G?.deleteNodeAttributes;
  if (typeof free !== 'function') return;
  G.deleteNodeAttributes = function (ro) { if (ro.attributes == null && !ro._nodeBuilderState) return; return free.call(this, ro); };
}
// HDR output: on screens that report a high dynamic range, unless a test turned it off or on (setHdr)
let hdrPick = null;
/** Tests: true or false to pick HDR output before WebGPU starts; null (default): the screen decides. */
export function setHdr(v) { hdrPick = v; }
function hdrScreen() { try { return hdrPick ?? (STEER.hdr !== false && typeof matchMedia === 'function' && matchMedia('(dynamic-range: high)').matches); } catch (_) { return false; } }
/** The ready WebGPU setup { r (WebGPURenderer), W (three/webgpu), fx (hd3d-gpu.js) }, or null (not supported, not ready, or WebGL forced for a test). */
export const webgpu = () => pick === 'webgpu' ? gpu : null;

/* ---------- a lost graphics chip ---------- */
// WebGPU can lose its device at any moment: the phone's graphics driver restarts after a fault or a timeout, the
// browser's GPU process crashes, the system takes the chip back. Everything made on it is gone: three stops
// drawing (r._isDeviceLost), and a view kept on it would show its last picture for ever. So (as PlayCanvas and
// Babylon.js do) a new device and renderer are made at once (LOSS.wait later, so a GPU process that is starting
// again has room), and everything is sent to the new chip again: the 3D kits keep every renderer's things apart
// (each view's chain, twins, pictures and shaders say which renderer they were made for), so the next frame on the new
// renderer makes them anew. A view draws nothing while the new device is on its way (gpuMending), and its shaders are built
// anew under a cover (the app pauses a round being played: src/main.js). After LOSS.most losses in one session,
// or if no device comes back, 3D draws with WebGL from then on, as on a phone with no WebGPU. Each loss is
// reported (src/perf.js: kind 'gpu', with the chip and whether it came back).
// Not a loss: a device the app destroys itself (reason 'destroyed'), except for the test lever loseGPU().
const LOSS = { n: 0, last: null, mending: null, wait: 300, most: 3, test: false, quietTill: 0 };
// What was in flight on the lost device fails as it settles: three's error scopes (a pipeline made in the frame the
// device went: "Instance dropped in popErrorScope", left unhandled), buffer reads ("unmapped before mapping was
// resolved"). Those are the loss itself, already told once (src/perf.js): they are not script errors, so they are
// stopped here, from the loss until a few seconds after the new device came (src/perf.js leaves out what is stopped).
const LOST_ERR = /Instance dropped|Device (was )?(destroyed|lost)|unmapped before mapping|external Instance reference|device is lost/i;
if (typeof addEventListener === 'function') addEventListener('unhandledrejection', e => {
  if (performance.now() > LOSS.quietTill && !LOSS.mending) return;
  const r = e.reason, msg = String(r?.message ?? r ?? '');
  if (LOST_ERR.test(msg)) e.preventDefault();
});
const lossFns = new Set();
/**
 * Hear about lost graphics chips: fn({ kind: 'lost', reason, message, n, canvases (the lost renderers' own) }) at once, then
 * fn({ kind: 'back', backend, ms, n }): backend 'webgpu' (a new device), 'webgl' (none came back: 3D draws with WebGL from
 * now on) or 'none' (the browser now refuses this page any 3D, as Chrome does after its graphics process has crashed a few
 * times on it: until the app starts again). Gives a function that stops it.
 */
export function onGpuLoss(fn) { lossFns.add(fn); return () => lossFns.delete(fn); }
const tell = e => { for (const f of [...lossFns]) try { f(e); } catch (err) { console.warn('GPU loss listener', err); } };
/** While a new WebGPU device is being made after a loss: a promise of the new setup (or null: WebGL from now on); else null. */
export const gpuMending = () => LOSS.mending;
/** The losses this session: { n, last: { reason, message, at (ms since the page opened), backend, ms } | null, mending }. */
export const gpuLosses = () => ({ n: LOSS.n, last: LOSS.last && { ...LOSS.last }, mending: !!LOSS.mending });
/** Tests: lose the shared WebGPU device now, as a driver restart would (the app carries on, makes a new one and reports it). False if there is none. */
export function loseGPU() { const d = gpu?.dev; if (!d) return false; LOSS.test = true; d.destroy(); return true; }
// whether a WebGL 2 context can be had now (a throwaway one, given straight back)
function canWebGL() {
  try { const g = document.createElement('canvas').getContext('webgl2'); if (!g) return false; g.getExtension('WEBGL_lose_context')?.loseContext(); return true; } catch (_) { return false; }
}
function lostGPU(r, info) {
  if (gpu?.r !== r) return;   // (one already given up: a test that switched to WebGL, a fallback at start)
  if (info?.reason === 'destroyed' && !LOSS.test) return;
  LOSS.test = false;
  const reason = info?.reason === 'destroyed' ? 'test' : String(info?.reason || 'unknown'), message = String(info?.message || '').slice(0, 120);
  const hadCon = !!con, canvases = [r.domElement, con?.r.domElement].filter(Boolean);
  gpu = null; con = null; conLoad = null; conTried = false; gpuLoad = null; if (computeShared) { compute = null; computeShared = false; }
  LOSS.n++; const n = LOSS.n, t0 = performance.now(); LOSS.quietTill = t0 + 5000;
  LOSS.last = { reason, message, at: Math.round(t0), backend: '', ms: 0 };
  console.warn(`WebGPU device lost (${reason}): ${message || 'no message'}; ${n > LOSS.most ? 'drawing with WebGL from now on' : 'making a new one'}`);
  tell({ kind: 'lost', reason, message, n, canvases });
  const mend = LOSS.mending = (async () => {
    if (n > LOSS.most) return null;
    await new Promise(ok => setTimeout(ok, LOSS.wait));
    const G = await prepareGPU();
    if (G && hadCon) await prepareConsoleGPU();
    return G;
  })().catch(() => null).then(G => {
    if (LOSS.mending === mend) LOSS.mending = null;
    const ms = Math.round(performance.now() - t0), backend = G ? 'webgpu' : canWebGL() ? 'webgl' : 'none';
    if (LOSS.n === n) Object.assign(LOSS.last, { backend, ms });
    LOSS.quietTill = Math.max(LOSS.quietTill, performance.now() + 3000);
    if (!G) console.warn(backend === 'webgl' ? 'WebGPU did not come back: 3D draws with WebGL' : 'WebGPU did not come back, and the browser refuses WebGL too: no 3D until the app starts again');
    tell({ kind: 'back', backend, ms, n });
    return G;
  });
}

/* ---------- Classic Console on WebGPU ---------- */
// Console games get a renderer of their own on the same device: a plain 8-bit canvas (no HDR) that draws
// in the screen's colours the way the WebGL Console renderer does (toon3d-gpu.js), and whose size and
// settings never fight the Next Gen renderer's. Made the first time a Console game asks (toon3d.js View).
let con = null, conLoad = null, conTried = false;
/** Gets the Console WebGPU renderer ready (once). Never rejects; resolves to what consoleGPU() returns. */
export function prepareConsoleGPU() {
  if (pick !== 'webgpu') return Promise.resolve(null);
  return conLoad ||= (async () => {
    try {
      const G = await prepareGPU(); if (!G) return null;
      const fx = await import('./toon3d-gpu.js');
      const r = new G.W.WebGPURenderer({ canvas: document.createElement('canvas'), device: G.r.backend.device, alpha: false, antialias: false });
      await r.init();
      if (!r.backend?.isWebGPUBackend || gpu !== G) { r.dispose(); return null; }
      r.gsBackend = 'webgpu'; r.onDeviceLost = () => { r._isDeviceLost = true; }; freeUnbuilt(r); fx.setup(r); G.fx.listWalk(r);   // (its device is the Next Gen one's: lostGPU says when it goes)
      return con = { r, W: G.W, fx };
    } catch (e) { console.warn('Console WebGPU did not start:', e); return null; } finally { conTried = true; }
  })();
}
/** The ready Console WebGPU setup { r, W, fx (toon3d-gpu.js) }, or null (no WebGPU, not ready, or WebGL forced for a test). */
export const consoleGPU = () => pick === 'webgpu' ? con : null;
/** A promise to wait for if the Console WebGPU renderer could be had but hasn't been tried yet, else null. */
export const consoleWait = () => (webgpu() && !conTried ? prepareConsoleGPU() : null);

/* ---------- compute only (no drawing): gs.ai Swarm and other number crunching ---------- */
let compute = null, computeShared = false;   // (shared: the 3D renderer's device, so lost with it: lostGPU)
/**
 * A WebGPU device for compute shaders, or null where there's no WebGPU. Shares the 3D renderer's
 * device when WebGPU drawing is already running, else asks for its own (once). Never rejects. Callers keep a CPU
 * version for when this is null or the device is lost.
 */
export function computeDevice() {
  return compute ||= (async () => {
    try {
      const shared = webgpu()?.r?.backend?.device;   // already made for 3D: share it (never load three for this)
      if (shared) { computeShared = true; return shared; }
      if (!await hasWebGPU()) return null;
      const a = await navigator.gpu.requestAdapter(), d = a && await a.requestDevice();
      if (!d) return null;
      d.lost?.then(() => { compute = null; });
      return d;
    } catch (_) { compute = null; return null; }
  })();
}
