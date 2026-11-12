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
// Not for: multi-material meshes (an indirect draw is one draw), occlusion culling (CPU only).
// Kit use only (hd3d-gpu.js gpuProps).
import { InstancedMesh, BufferGeometry, Frustum, Matrix4, Vector3, Vector4, StorageInstancedBufferAttribute, IndirectStorageBufferAttribute } from 'three/webgpu';
import { Fn, If, storage, uniform, uniformArray, instanceIndex, vec3, vec4, float, uint, int, dot, max, length, Loop, atomicAdd, atomicStore } from 'three/tsl';

const MAX_SHADOW = 4;   // shadow views tested (sun cascades and lamps); more lights: their copies off screen don't cast
const MAX_LEVELS = 8;   // detail levels a set may have (a kind's own, or the ones hd3d.js autoCopies makes: at most six)
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
  let sends = 0, cap = 0, src = null, col = null, meshes = [], draw = null, nodes = null, sent = -1, dirty = true;
  // the game moving, hiding or recolouring a copy sends the copies again (the library's own setters)
  const undo = [];
  for (const k of ['setMatrixAt', 'updateInstances', 'setVisibilityAt', 'setActiveAt', 'setColorAt', 'addInstances', 'removeInstances', 'clearInstances', 'resizeBuffers']) {
    const own = Object.prototype.hasOwnProperty.call(im, k), was = im[k];
    if (typeof was !== 'function') continue;
    im[k] = function (...a) { dirty = true; return was.apply(this, a); };
    undo.push(() => { if (own) im[k] = was; else delete im[k]; });
  }
  const U = { n: uniform(0, 'uint'), ns: uniform(0, 'int'), cam: uniform(new Vector3()), wm: uniform(new Matrix4()), r0: uniform(1),
    dist: uniformArray(Array.from({ length: MAX_LEVELS }, () => 1e30)), planes: uniformArray(Array.from({ length: 6 * (1 + MAX_SHADOW) }, () => new Vector4())) };
  const build = () => {
    for (const m of meshes) { m.removeFromParent(); m.dispose(); }
    cap = Math.max(64, im._capacity || im._instancesArrayCount || 64);
    src = new StorageInstancedBufferAttribute(cap * 16, 1);   // every copy's matrix (w of the last column 0: hidden)
    col = im.colorsTexture ? new StorageInstancedBufferAttribute(cap * 4, 1) : null;
    const di = new Uint32Array(L * 5);
    draw = new IndirectStorageBufferAttribute(di, 1);
    meshes = levels.map(({ obj }, i) => {
      const s = obj.geometry, g = new BufferGeometry();
      for (const k in s.attributes) if (k !== 'instanceIndex') g.setAttribute(k, s.attributes[k]);
      g.setIndex(s.index);
      if (!s.boundingSphere) s.computeBoundingSphere(); g.boundingSphere = s.boundingSphere;
      di[i * 5] = s.index ? s.index.count : s.attributes.position.count;   // [count, copies, first, base, first copy]
      g.setIndirect(draw, i * 20);
      const m = new InstancedMesh(g, obj.material, cap);
      m.instanceMatrix = new StorageInstancedBufferAttribute(cap, 16);
      // three's "last frame" copies are this frame's (see the top): the list is packed afresh each frame
      m.instanceMatrix.clone = function () { return this; };
      if (col) { m.instanceColor = new StorageInstancedBufferAttribute(cap, 3); m.instanceColor.clone = function () { return this; }; }
      m.count = cap; m.frustumCulled = false;
      m.castShadow = im.castShadow; m.receiveShadow = im.receiveShadow;
      m.userData.gsTwin = im; m.name = (im.name || 'props') + ':gpu' + i;
      group.add(m); return m;
    });
    const S = storage(src, 'vec4', cap * 4).toReadOnly(), C = col && storage(col, 'vec4', cap).toReadOnly(), D = storage(draw, 'uint', L * 5).toAtomic();
    const out = meshes.map(m => storage(m.instanceMatrix, 'vec4', cap * 4)), outC = col ? meshes.map(m => storage(m.instanceColor, 'vec3', cap)) : null;
    const reset = Fn(() => { for (let i = 0; i < L; i++) atomicStore(D.element(i * 5 + 1), uint(0)); })().compute(1);
    const cull = Fn(() => {
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
          If(seen, () => {
            const d = p.sub(U.cam), d2 = dot(d, d);
            let lv = int(0);
            for (let k = 1; k < L; k++) lv = lv.add(int(d2.greaterThanEqual(U.dist.element(k))));
            for (let k = 0; k < L; k++) {
              If(lv.equal(k), () => {
                const s = atomicAdd(D.element(k * 5 + 1), uint(1)), o = s.mul(4), O = out[k];
                O.element(o).assign(c0); O.element(o.add(1)).assign(c1); O.element(o.add(2)).assign(c2); O.element(o.add(3)).assign(vec4(c3.xyz, 1));
                if (outC) outC[k].element(s).assign(C.element(i).xyz);
              });
            }
          });
        });
      });
    })().compute(cap, [64]);
    nodes = { reset, cull };
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
    sends: () => sends,
    /** Draws the copies in view of cam (and of shadowCams) this frame. */
    sync(r, cam, shadowCams) {
      if (!cap || (im._capacity || 0) > cap) build();
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
      r.compute(nodes.reset); r.compute(nodes.cull);
      return n;
    },
    dispose() { for (const m of meshes) { m.removeFromParent(); m.dispose(); } meshes = []; for (const u of undo) u(); undo.length = 0; },
  };
}
