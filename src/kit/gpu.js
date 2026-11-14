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
  if (pick !== 'webgpu') return Promise.resolve(null);
  return gpuLoad ||= (async () => {
    try {
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
      let room = 32;
      try { room = Math.min(64, (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' }))?.limits?.maxColorAttachmentBytesPerSample || 32); } catch (_) { /* stays 32 */ }
      const make = async (cv, bytes) => {
        const r = new W.WebGPURenderer({ canvas: cv, alpha: true, antialias: false, powerPreference: 'high-performance', trackTimestamp: true, ...(hdr ? { outputType: W.HalfFloatType } : {}), ...(bytes > 32 ? { requiredLimits: { maxColorAttachmentBytesPerSample: bytes } } : {}) });
        await r.init(); return r;
      };
      let r = null;
      try { r = await make(canvas, room); } catch (e) { if (room <= 32) throw e; }
      if (room > 32 && !r?.backend?.isWebGPUBackend) { r?.dispose(); r = await make(document.createElement('canvas'), 32); }
      r.gsPixelBytes = r.backend?.device?.limits?.maxColorAttachmentBytesPerSample || 32;
      r.gsHdr = hdr && (r.backend?.context?.getConfiguration?.()?.toneMapping?.mode ?? 'extended') === 'extended';
      if (!r.backend?.isWebGPUBackend) { console.warn('WebGPU: three fell back to WebGL 2'); r.dispose(); return null; }   // three fell back to WebGL 2: keep our own WebGL path
      r.gsBackend = 'webgpu';
      fx.manyLights(r);
      fx.listWalk(r);   // (three's walk of the scene for each render, over the scene's list: scene-list.js)
      freeUnbuilt(r);
      await fx.halfCheck(r);   // half precision in the kit's own passes, where the chip has it and compiles them (half.js)
      fx.sharpMips(r);   // textures read for the screen's size when SGSR 2 upscales
      fx.aoInShading(r);   // ambient occlusion on the light that bounces only, in each thing's own shading (hd3d-gpu.js)
      installPack(r);   // code-made textures packed into the chip's compressed formats (spark.js)
      r.backend.device?.lost?.then(info => { console.warn('WebGPU device lost:', info?.reason, info?.message); if (gpu?.r === r) { gpu = null; con = null; conLoad = null; conTried = false; } gpuLoad = null; });   // the GPU went away: back to WebGL
      return gpu = { r, W, fx };
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
function hdrScreen() { try { return hdrPick ?? (typeof matchMedia === 'function' && matchMedia('(dynamic-range: high)').matches); } catch (_) { return false; } }
/** The ready WebGPU setup { r (WebGPURenderer), W (three/webgpu), fx (hd3d-gpu.js) }, or null (not supported, not ready, or WebGL forced for a test). */
export const webgpu = () => pick === 'webgpu' ? gpu : null;

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
      r.gsBackend = 'webgpu'; freeUnbuilt(r); fx.setup(r); G.fx.listWalk(r);
      return con = { r, W: G.W, fx };
    } catch (e) { console.warn('Console WebGPU did not start:', e); return null; } finally { conTried = true; }
  })();
}
/** The ready Console WebGPU setup { r, W, fx (toon3d-gpu.js) }, or null (no WebGPU, not ready, or WebGL forced for a test). */
export const consoleGPU = () => pick === 'webgpu' ? con : null;
/** A promise to wait for if the Console WebGPU renderer could be had but hasn't been tried yet, else null. */
export const consoleWait = () => (webgpu() && !conTried ? prepareConsoleGPU() : null);

/* ---------- compute only (no drawing): gs.ai Swarm and other number crunching ---------- */
let compute = null;
/**
 * A WebGPU device for compute shaders, or null where there's no WebGPU. Shares the 3D renderer's
 * device when WebGPU drawing is already running, else asks for its own (once). Never rejects. Callers keep a CPU
 * version for when this is null or the device is lost.
 */
export function computeDevice() {
  return compute ||= (async () => {
    try {
      const shared = webgpu()?.r?.backend?.device;   // already made for 3D: share it (never load three for this)
      if (shared) return shared;
      if (!await hasWebGPU()) return null;
      const a = await navigator.gpu.requestAdapter(), d = a && await a.requestDevice();
      if (!d) return null;
      d.lost?.then(() => { compute = null; });
      return d;
    } catch (_) { compute = null; return null; }
  })();
}
