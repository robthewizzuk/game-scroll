// Makes the app's WebGL renderers (Classic Console, Next Gen and AR), in one place so the WebGPU move
// (docs/webgpu-move.md) changes one file. The WebGPU renderer is gpu.js prepareGPU(). Kit use only.
import { WebGLRenderer } from 'three';
import { glStats, CUT_LAST, isCut } from './gpu.js';

const KEEP_MAX = 800;   // shader programs kept for the session (each is a few KB on the graphics chip)

// three's WebGL opaque order (by material, then nearest first) with cut-outs after solid things (gpu.js CUT_LAST)
function cutLastGL(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (CUT_LAST.on) { const ca = isCut(a.material), cb = isCut(b.material); if (ca !== cb) return ca ? 1 : -1; }
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.materialVariant !== b.materialVariant) return (a.materialVariant || 0) - (b.materialVariant || 0);
  if (a.z !== b.z) return a.z - b.z;
  return a.id - b.id;
}

/** Makes a three.js renderer on a new canvas (options as WebGLRenderer's), or throws if this device can't. */
export function makeRenderer(o = {}) {
  const canvas = o.canvas || document.createElement('canvas');
  const r = new WebGLRenderer({ powerPreference: 'high-performance', ...o, canvas });
  r.gsBackend = 'webgl'; r.setOpaqueSort(cutLastGL);   // (cut-outs after solid things: gpu.js CUT_LAST)
  // Built shaders stay for the whole session. three.js deletes a shader program as soon as no material
  // uses it (a decal, a particle burst or a sky that was disposed), so the next one like it was built
  // again, mid-round: a stutter. Each program gets one extra use here, so it's never deleted and the
  // next material that needs it finds it ready. (After the app restarts, the phone's own shader cache
  // supplies them quickly, as long as their code is the same, which it is.) Capped, in case a game
  // makes endless one-off shaders.
  const render = r.render.bind(r); let seen = 0, kept = 0;
  r.render = (scene, cam) => {
    render(scene, cam); glStats.r = r;
    const list = r.info.programs; if (!list || list.length === seen) return;
    if (list.length > seen) glStats.programs += list.length - seen;   // (kept programs are never deleted, so growth = shaders built)
    seen = list.length; for (const p of list) if (!p.gsKept && kept < KEEP_MAX) { p.gsKept = true; p.usedTimes++; kept++; }
  };
  // keep the page alive if the phone takes the graphics context away (the kits make it again)
  canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  return r;
}
