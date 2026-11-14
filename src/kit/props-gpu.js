// GPU culling for gs.props on WebGPU (HD.gpuCull): the graphics chip picks the copies in view, not the CPU.
// hd3d-gpu.js gpuProps fills each detail level's InstancedMesh on the CPU every frame (a frustum test per
// copy). For a world with thousands of copies this does the same on the chip instead: a compute pass tests
// every copy against the view (and the lights' shadow views, so a copy off screen still casts into it),
// picks its detail level by distance, and packs the ones that pass into that level's list, which is drawn
// with an indirect draw whose copy count the pass wrote. The CPU only sends the copies again when the game
// moves, hides or recolours one.
// The packed lists change order every frame, so three's motion for each copy (frame generation, SGSR 2,
// motion blur) is taken from the same list ("last frame" = this frame): right for still things, which is
// what gs.props are; hd3d.js keeps the CPU lists (stable slots) while frame generation runs.
// A copy changing detail level fades (lod-fade.js), as on the CPU's lists: the pass keeps each copy's state from
// frame to frame (the level it shows, the one it is leaving, how far along), and while it fades writes it into
// both levels' lists of fading copies (their own indirect draws, drawn with the dithered twins) with its share.
// A copy coming into view takes its level at once. Until the twins are built (ready, hd3d.js), a change pops.
// Not for: multi-material meshes (an indirect draw is one draw), occlusion culling (CPU only).
// Kit use only (hd3d-gpu.js gpuProps).
import { InstancedMesh, BufferGeometry, Frustum, Matrix4, Vector3, Vector4, StorageInstancedBufferAttribute, IndirectStorageBufferAttribute } from 'three/webgpu';
import { Fn, If, storage, uniform, uniformArray, instanceIndex, vec2, vec3, vec4, float, uint, int, dot, max, min, length, Loop, atomicAdd, atomicStore, atomicMin } from 'three/tsl';
import { FADE } from './lod-fade.js';

const MAX_SHADOW = 4;   // shadow views tested (sun cascades and lamps); more lights: their copies off screen don't cast
const MAX_LEVELS = 8;   // detail levels a set may have (a kind's own, or the ones hd3d.js autoCopies makes: at most six)
const FADE_COPIES = 2048;   // room in each level's list of copies changing level (more at once: the rest change at once)
const F = new Frustum(), PM = new Matrix4(), PV = new Vector3();

/** Can these props draw with GPU culling? (one material per level; WebGPU compute) */
export function gpuCullFits(levels) {
  return levels.length <= MAX_LEVELS && levels.every(({ obj }) => !Array.isArray(obj.material));   // (groups only split a draw for a list of materials)
}

/**
 * GPU-culled twins of an InstancedMesh2's detail levels. levels: [{ obj, dist (squared) }].
 * Returns { group meshes, sync(r, cam, shadowCams) -> copies sent, dispose }.
 */
export function gpuCull(im, levels, group) {
  const L = levels.length;
  let sends = 0, cap = 0, src = null, col = null, meshes = [], fades = [], draw = null, nodes = null, sent = -1, dirty = true, fcap = 0, state = null, slots = null, fadeAt = 0;
  // the game moving, hiding or recolouring a copy sends the copies again (the library's own setters)
  const undo = [];
  for (const k of ['setMatrixAt', 'updateInstances', 'setVisibilityAt', 'setActiveAt', 'setColorAt', 'addInstances', 'removeInstances', 'clearInstances', 'resizeBuffers']) {
    const own = Object.prototype.hasOwnProperty.call(im, k), was = im[k];
    if (typeof was !== 'function') continue;
    im[k] = function (...a) { dirty = true; return was.apply(this, a); };
    undo.push(() => { if (own) im[k] = was; else delete im[k]; });
  }
  const U = { n: uniform(0, 'uint'), ns: uniform(0, 'int'), cam: uniform(new Vector3()), wm: uniform(new Matrix4()), r0: uniform(1), fade: uniform(0), step: uniform(0),
    dist: uniformArray(Array.from({ length: MAX_LEVELS }, () => 1e30)), planes: uniformArray(Array.from({ length: 6 * (1 + MAX_SHADOW) }, () => new Vector4())) };
  const build = () => {
    for (const m of [...meshes, ...fades]) { m.removeFromParent(); m.dispose(); }
    cap = Math.max(64, im._capacity || im._instancesArrayCount || 64); fcap = Math.min(cap, FADE_COPIES);
    src = new StorageInstancedBufferAttribute(cap * 16, 1);   // every copy's matrix (w of the last column 0: hidden)
    col = im.colorsTexture ? new StorageInstancedBufferAttribute(cap * 4, 1) : null;
    state = new StorageInstancedBufferAttribute(cap * 4, 1);   // each copy: the level it shows, the one it is leaving, how far (1: settled), seen last frame
    slots = new StorageInstancedBufferAttribute(cap * 2, 1);   // and while it changes level, its places in the two levels' fading lists
    const di = new Uint32Array(L * 2 * 5);   // each level's list, then each level's list of copies changing level
    draw = new IndirectStorageBufferAttribute(di, 1);
    const twin = (obj, i, n, fade) => {
      const s = obj.geometry, g = new BufferGeometry();
      for (const k in s.attributes) if (k !== 'instanceIndex') g.setAttribute(k, s.attributes[k]);
      g.setIndex(s.index);
      if (!s.boundingSphere) s.computeBoundingSphere(); g.boundingSphere = s.boundingSphere;
      di[i * 5] = s.index ? s.index.count : s.attributes.position.count;   // [count, copies, first, base, first copy]
      g.setIndirect(draw, i * 20);
      if (fade) { const a = new StorageInstancedBufferAttribute(n, 2); g.setAttribute('gsFade', a); }
      const m = new InstancedMesh(g, obj.material, n);
      m.instanceMatrix = new StorageInstancedBufferAttribute(n, 16);
      // three's "last frame" copies are this frame's (see the top): the list is packed afresh each frame
      m.instanceMatrix.clone = function () { return this; };
      if (col) { m.instanceColor = new StorageInstancedBufferAttribute(n, 3); m.instanceColor.clone = function () { return this; }; }
      m.count = n; m.frustumCulled = false;
      m.castShadow = im.castShadow; m.receiveShadow = im.receiveShadow;
      m.userData.gsTwin = im; m.name = (im.name || 'props') + (fade ? ':gpufade' : ':gpu') + (i % L);
      // (a list of fading copies draws only with its dithered twin, once that is built: holdNew and the shaders built ahead leave it alone)
      if (fade) { m.userData.noHold = true; m.userData.gsFadeCopies = true; m.visible = false; }
      group.add(m); return m;
    };
    meshes = levels.map(({ obj }, i) => twin(obj, i, cap, false));
    fades = levels.map(({ obj }, i) => twin(obj, L + i, fcap, true));
    // In passes, each within the eight storage buffers a phone's compute stage may have: first each copy's level and
    // fade (and its places in the fading lists), then for each level its list, then its list of copies changing level
    const S = storage(src, 'vec4', cap * 4).toReadOnly(), C = col && storage(col, 'vec4', cap).toReadOnly(), D = storage(draw, 'uint', L * 2 * 5).toAtomic();
    const ST = storage(state, 'vec4', cap), STr = storage(state, 'vec4', cap).toReadOnly(), SL = storage(slots, 'vec2', cap), SLr = storage(slots, 'vec2', cap).toReadOnly();
    const reset = Fn(() => { for (let i = 0; i < L * 2; i++) atomicStore(D.element(i * 5 + 1), uint(0)); })().compute(1);
    // (a fading list that ran out of room: its count back to what it holds)
    const clampF = Fn(() => { for (let i = L; i < L * 2; i++) atomicMin(D.element(i * 5 + 1), uint(fcap)); })().compute(1);
    const pick = Fn(() => {
      const i = instanceIndex;
      If(i.lessThan(U.n), () => {
        const b = i.mul(4), c0 = S.element(b), c1 = S.element(b.add(1)), c2 = S.element(b.add(2)), c3 = S.element(b.add(3));
        If(c3.w.greaterThan(.5), () => {
          const p = U.wm.mul(vec4(c3.xyz, 1)).xyz, rad = U.r0.mul(max(length(c0.xyz), max(length(c1.xyz), length(c2.xyz)))).add(8);   // (+8 m: things just out of view still cast their shadows in)
          const inside = (k0) => { let ok = dot(U.planes.element(k0).xyz, p).add(U.planes.element(k0).w).greaterThanEqual(rad.negate()); for (let k = 1; k < 6; k++) ok = ok.and(dot(U.planes.element(k0 + k).xyz, p).add(U.planes.element(k0 + k).w).greaterThanEqual(rad.negate())); return ok; };
          const seen = inside(0).toVar();
          Loop({ start: int(0), end: U.ns, type: 'int' }, ({ i: j }) => {
            If(seen.not(), () => {
              const k0 = j.add(1).mul(6);
              let ok = dot(U.planes.element(k0).xyz, p).add(U.planes.element(k0).w).greaterThanEqual(rad.negate());
              for (let k = 1; k < 6; k++) ok = ok.and(dot(U.planes.element(k0.add(k)).xyz, p).add(U.planes.element(k0.add(k)).w).greaterThanEqual(rad.negate()));
              seen.assign(ok);
            });
          });
          const st = ST.element(i).toVar(), sl = vec2(-1, -1).toVar();
          If(seen, () => {
            const d = p.sub(U.cam), d2 = dot(d, d);
            let lv = int(0);
            for (let k = 1; k < L; k++) lv = lv.add(int(d2.greaterThanEqual(U.dist.element(k))));
            const lf = float(lv);
            // the copy's fade: x the level it shows, y the one it is leaving, z how far along (1: settled), w seen (last frame, then this one)
            If(U.fade.lessThan(.5).or(st.w.lessThan(.5)), () => { st.assign(vec4(lf, lf, 1, 1)); })
              .ElseIf(st.z.greaterThanEqual(1), () => { If(st.x.notEqual(lf), () => { st.assign(vec4(lf, st.x, 0, 1)); }); })
              .ElseIf(lf.equal(st.y), () => { st.assign(vec4(lf, st.x, float(1).sub(st.z), 1)); })   // (back where it came from: the fade turns round)
              .ElseIf(lf.notEqual(st.x), () => { st.assign(vec4(lf, st.x, 0, 1)); });
            If(st.z.lessThan(1), () => { st.z.assign(min(st.z.add(U.step), 1)); });
            // changing level: a place in each level's fading list. No room in either: it changes at once (its places there drawn as nothing)
            If(st.z.lessThan(1), () => {
              const a = atomicAdd(D.element(int(st.y).add(L).mul(5).add(1)), uint(1)).toVar(), c = atomicAdd(D.element(int(st.x).add(L).mul(5).add(1)), uint(1)).toVar();
              sl.assign(vec2(float(a), float(c)));
              If(a.greaterThanEqual(uint(fcap)).or(c.greaterThanEqual(uint(fcap))), () => { st.z.assign(1); });
            });
          }).Else(() => { st.w.assign(0); });
          ST.element(i).assign(st); SL.element(i).assign(sl);
        }).Else(() => { ST.element(i).w.assign(0); SL.element(i).assign(vec2(-1, -1)); });
      });
    })().compute(cap, [64]);
    const put = (i, O, OC, s, none = null) => {
      const b = i.mul(4), o = s.mul(4), c3 = S.element(b.add(3)), z = vec4(0, 0, 0, 0);
      const pick3 = k => none ? none.select(z, S.element(b.add(k))) : S.element(b.add(k));
      O.element(o).assign(pick3(0)); O.element(o.add(1)).assign(pick3(1)); O.element(o.add(2)).assign(pick3(2)); O.element(o.add(3)).assign(vec4(c3.xyz, 1));
      if (OC) OC.element(s).assign(C.element(i).xyz);
    };
    // each level's list: the copies seen there and settled
    const lists = meshes.map((m, k) => {
      const O = storage(m.instanceMatrix, 'vec4', cap * 4), OC = col ? storage(m.instanceColor, 'vec3', cap) : null;
      return Fn(() => {
        const i = instanceIndex;
        If(i.lessThan(U.n), () => {
          const st = STr.element(i);
          If(st.w.greaterThan(.5).and(st.z.greaterThanEqual(1)).and(int(st.x).equal(k)), () => { put(i, O, OC, atomicAdd(D.element(k * 5 + 1), uint(1)).toVar()); });
        });
      })().compute(cap, [64]);
    });
    // each level's list of copies changing level: the one it leaves (share going), the one it takes (coming), each where pick gave it
    const fading = fades.map((m, k) => {
      const O = storage(m.instanceMatrix, 'vec4', fcap * 4), OC = col ? storage(m.instanceColor, 'vec3', fcap) : null, FV = storage(m.geometry.attributes.gsFade, 'vec2', fcap);
      return Fn(() => {
        const i = instanceIndex;
        If(i.lessThan(U.n), () => {
          const st = STr.element(i), sl = SLr.element(i), none = st.z.greaterThanEqual(1);
          If(st.w.greaterThan(.5), () => {
            for (const [lvl, at, sign] of [[st.y, sl.x, -1], [st.x, sl.y, 1]]) {
              If(int(lvl).equal(k).and(at.greaterThanEqual(0)).and(at.lessThan(fcap)), () => { const s = uint(at).toVar(); put(i, O, OC, s, none); FV.element(s).assign(vec2(st.z, sign)); });
            }
          });
        });
      })().compute(fcap > 0 ? cap : 1, [64]);
    });
    nodes = { reset, pick, clampF, lists, fading };
    dirty = true;
  };
  const send = n => {
    const D = im.matricesTexture?._data, Cc = im.colorsTexture?._data, A = src.array;
    for (let i = 0; i < n; i++) {
      const o = i * 16; for (let j = 0; j < 16; j++) A[o + j] = D[o + j];
      A[o + 15] = im.getActiveAndVisibilityAt(i) ? 1 : 0;
      if (col && Cc) { const c = i * 4; col.array[c] = Cc[c]; col.array[c + 1] = Cc[c + 1]; col.array[c + 2] = Cc[c + 2]; col.array[c + 3] = 1; }
    }
    src.needsUpdate = true; if (col) col.needsUpdate = true; dirty = false; sent = n; sends++;
  };
  return {
    get meshes() { return meshes; },
    /** The lists of copies changing level (drawn with their dithered twins while fades are on, else hidden). */
    get fades() { return fades; },
    sends: () => sends,
    /** Draws the copies in view of cam (and of shadowCams) this frame. ready(mesh): are a fading list's dithered shaders built. */
    sync(r, cam, shadowCams, ready = null) {
      if (!cap || (im._capacity || 0) > cap) build();
      const now = performance.now(), dt = Math.min(.1, Math.max(0, (now - fadeAt) / 1000)); fadeAt = now;
      const on = !!(FADE.on && ready && L > 1 && fades.every(m => ready(m)));
      U.fade.value = on ? 1 : 0; U.step.value = dt / Math.max(.01, FADE.s);
      for (const m of fades) m.visible = on;
      const n = Math.min(cap, im._instancesArrayCount || 0);
      if (!im.matricesTexture?._data || !n) { U.n.value = 0; } else if (dirty || n !== sent) send(n);
      U.n.value = n ? n : 0;
      cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); F.setFromProjectionMatrix(PM, cam.coordinateSystem);
      const P = U.planes.array; for (let k = 0; k < 6; k++) P[k].set(F.planes[k].normal.x, F.planes[k].normal.y, F.planes[k].normal.z, F.planes[k].constant);
      const ns = im.castShadow && shadowCams ? Math.min(MAX_SHADOW, shadowCams.length) : 0;
      for (let j = 0; j < ns; j++) {
        const c = shadowCams[j]; F.setFromProjectionMatrix(PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), c.coordinateSystem);
        for (let k = 0; k < 6; k++) P[6 * (j + 1) + k].set(F.planes[k].normal.x, F.planes[k].normal.y, F.planes[k].normal.z, F.planes[k].constant);
      }
      U.ns.value = ns; U.cam.value.copy(cam.getWorldPosition(PV)); U.wm.value.copy(im.matrixWorld);
      U.r0.value = levels[0].obj.geometry.boundingSphere?.radius ?? 1;
      for (let k = 0; k < MAX_LEVELS; k++) U.dist.array[k] = k < L ? (k ? levels[k].dist : 0) : 1e30;
      r.compute(nodes.reset); r.compute(nodes.pick); if (on) r.compute(nodes.clampF); r.compute(nodes.lists); if (on) r.compute(nodes.fading);
      return n;
    },
    dispose() { for (const m of [...meshes, ...fades]) { m.removeFromParent(); m.dispose(); } meshes = []; fades = []; for (const u of undo) u(); undo.length = 0; },
  };
}
