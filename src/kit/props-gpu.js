// GPU culling for gs.props on WebGPU (HD.gpuCull): the graphics chip picks the copies in view, not the CPU.
// hd3d-gpu.js gpuProps fills each detail level's InstancedMesh on the CPU every frame (a frustum test per
// copy). For a world with thousands of copies this does the same on the chip instead: a compute pass tests
// every copy against the view (and the lights' shadow views, so a copy off screen still casts into it),
// picks its detail level by distance, and packs the ones that pass into that level's list, which is drawn
// with an indirect draw whose copy count the pass wrote. The CPU only sends the copies again when the game
// moves, hides or recolours one.
//
// Occlusion culling on the chip: when the view's occlusion culling is on (occlude.js; the depth pyramid
// of occlusion.js, the last frame's depth moved to this frame's camera), the same pass also asks the
// pyramid whether each copy in view is wholly behind something nearer, the way Occlusion.hiddenSphere()
// does on the CPU (one level of the pyramid, the finest where the copy covers at most eight texels each
// way: a little less sure than the CPU's, which opens up the texels that fail, never wrong), and leaves the hidden ones out of what the camera draws.
// Each level's list has two parts: first the copies the camera draws, then the ones only the shadows
// need (hidden from the camera, or just off screen, but in a light's view). The camera draws the first
// part (its own indirect draw: [count, copies, ...] for the camera, then the same for everything); every
// other view of the scene (the shadow maps, a lamp's slot, a reflection's camera) draws both, so a copy
// hidden behind a wall still casts its shadow past the wall's end. The pyramid is sent to the chip once
// for all sets, when it changes (sendPyramid).
// How much it hid comes back from the chip every few frames (hiddenTris), so occlude.js can tell whether
// keeping occlusion culling awake pays.
//
// Subgroups (subgroups.js; HD.subgroups): where the chip has them, a subgroup's threads take their places in
// a list with one add between them instead of one each.
//
// The packed lists change order every frame, so three's motion for each copy (frame generation, SGSR 2,
// motion blur) is taken from the same list ("last frame" = this frame): right for still things, which is
// what gs.props are; hd3d.js keeps the CPU lists (stable slots) while frame generation runs.
// Not for: multi-material meshes (an indirect draw is one draw).
// Kit use only (hd3d-gpu.js gpuProps).
import { InstancedMesh, BufferGeometry, Frustum, Matrix4, Vector3, Vector4, DataTexture, RedFormat, FloatType, NearestFilter, StorageInstancedBufferAttribute, IndirectStorageBufferAttribute } from 'three/webgpu';
import { Fn, If, storage, uniform, uniformArray, instanceIndex, vec4, float, uint, int, ivec2, dot, max, min, abs, floor, ceil, length, Loop, Break, atomicStore, atomicLoad, select, texture } from 'three/tsl';
import { whole, claim, addUp, subgroupsWanted } from './subgroups.js';

const MAX_SHADOW = 4;   // shadow views tested (sun cascades and lamps); for more lights, copies near the view are kept for all of them
const MAX_LEVELS = 8;   // detail levels a set may have (a kind's own, or the ones hd3d.js autoCopies makes: at most six)
const PYR_LEVELS = 12;  // levels of the depth pyramid the chip can be asked about (a picture of 160 x 256 texels has 8)
const STAT_EVERY = 12;  // frames between reading back how many copies were hidden
const F = new Frustum(), PM = new Matrix4(), PV = new Vector3();
// A pass may bind at most 8 storage buffers (WebGPU's own limit; three asks for no more): the copies, the draws
// (which also hold what was hidden and which copies only the shadows draw), the colours, and a list and colours
// for each level. The pyramid is a texture.
const MAX_BUFFERS = 8;

/** Can these props draw with GPU culling? (one material per level, few enough levels for the pass's buffers; WebGPU compute) colors: the copies have colours of their own */
export function gpuCullFits(levels, colors = false) {
  const c = colors ? 1 : 0;
  return levels.length <= MAX_LEVELS && 2 + c + levels.length * (1 + c) <= MAX_BUFFERS && levels.every(({ obj }) => !Array.isArray(obj.material));   // (groups only split a draw for a list of materials)
}

/* ---------- the depth pyramid on the chip, one for all sets ---------- */
// tex: the pyramid's texels, its levels one under another (level l from row lv[l].z, lv[l].x by lv[l].y texels);
// the rest as Occlusion.hiddenSphere() reads them. oc, stamp: what was sent last (Occlusion.stamp goes up
// whenever its answers may have changed); gen: a new texture (a picture of another size), so every set's
// pass is made again with it.
let PYR = null;
function pyramid() {
  return PYR ||= { tex: null, w: 0, h: 0, oc: null, stamp: -1, gen: 0,
    U: { vp: uniform(new Matrix4()), f: uniform(new Vector4()), lv: uniformArray(Array.from({ length: PYR_LEVELS }, () => new Vector4())), nl: uniform(0, 'int') } };
}
// sends oc's pyramid if it isn't on the chip yet; false when it can't be asked (too many levels: drawn whole)
function sendPyramid(oc) {
  const P = pyramid(), Ls = oc.levels;
  if (Ls.length > PYR_LEVELS || !Ls.length) return false;
  if (P.oc === oc && P.stamp === oc.stamp && P.tex) return true;
  let h = 0; for (const L of Ls) h += L.h;
  const w = Ls[0].w;
  if (!P.tex || P.w !== w || P.h !== h) {
    P.tex?.dispose();
    P.tex = new DataTexture(new Float32Array(w * h), w, h, RedFormat, FloatType);
    P.tex.minFilter = P.tex.magFilter = NearestFilter; P.tex.generateMipmaps = false; P.tex.flipY = false;
    P.w = w; P.h = h; P.gen++;
  }
  const A = P.tex.image.data, lv = P.U.lv.array; let row = 0;
  for (let l = 0; l < Ls.length; l++) { const L = Ls[l]; for (let y = 0; y < L.h; y++) A.set(L.d.subarray(y * L.w, (y + 1) * L.w), (row + y) * w); lv[l].set(L.w, L.h, row, 0); row += L.h; }
  P.tex.needsUpdate = true;
  P.U.vp.value.copy(oc.vp); P.U.f.value.set(oc.fx, oc.fy, oc.margin, oc.bias); P.U.nl.value = Ls.length;
  P.oc = oc; P.stamp = oc.stamp;
  return true;
}
// (a stand-in until the first picture: a set's pass is made before occlusion has one)
let NO_PYR = null;
const pyrTex = () => pyramid().tex || (NO_PYR ||= Object.assign(new DataTexture(new Float32Array(1), 1, 1, RedFormat, FloatType), { minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false, needsUpdate: true }));

/**
 * GPU-culled twins of an InstancedMesh2's detail levels. levels: [{ obj, dist (squared) }]; pad: how far
 * the copies may reach outside their meshes' bounds in their shaders (leaves in the wind), metres, or
 * null when nobody knows (then they are never hidden by occlusion).
 * Returns { meshes, sync(r, cam, shadowCams, oc) -> copies sent, counts(r), hiddenTris, dispose }.
 */
export function gpuCull(im, levels, group, pad = 0) {
  const L = levels.length;
  let sends = 0, cap = 0, src = null, col = null, meshes = [], draw = null, nodes = null, sent = -1, dirty = true, key = '';
  let mainCam = null, statF = 0, statBusy = false, hiddenTris = 0, lastHidden = null;
  // the game moving, hiding or recolouring a copy sends the copies again (the library's own setters)
  const undo = [];
  for (const k of ['setMatrixAt', 'updateInstances', 'setVisibilityAt', 'setActiveAt', 'setColorAt', 'addInstances', 'removeInstances', 'clearInstances', 'resizeBuffers']) {
    const own = Object.prototype.hasOwnProperty.call(im, k), was = im[k];
    if (typeof was !== 'function') continue;
    im[k] = function (...a) { dirty = true; return was.apply(this, a); };
    undo.push(() => { if (own) im[k] = was; else delete im[k]; });
  }
  // ns: shadow views tested; extra: more lights than that; occ: ask the pyramid; bc, r0: the meshes' ball (all levels) in a copy's own space; ws: the set's scale
  const U = { n: uniform(0, 'uint'), ns: uniform(0, 'int'), extra: uniform(0, 'int'), occ: uniform(0, 'int'), cam: uniform(new Vector3()), wm: uniform(new Matrix4()), ws: uniform(1),
    bc: uniform(new Vector3()), r0: uniform(1), pad: uniform(0),
    dist: uniformArray(Array.from({ length: MAX_LEVELS }, () => 1e30)), planes: uniformArray(Array.from({ length: 6 * (1 + MAX_SHADOW) }, () => new Vector4())) };
  const ball = () => {   // (a simpler level's own ball may reach a little further than the first's)
    const s0 = levels[0].obj.geometry; if (!s0.boundingSphere) s0.computeBoundingSphere();
    let r = s0.boundingSphere.radius; const c = s0.boundingSphere.center;
    for (let k = 1; k < L; k++) { const g = levels[k].obj.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); r = Math.max(r, g.boundingSphere.center.distanceTo(c) + g.boundingSphere.radius); }
    U.bc.value.copy(c); U.r0.value = r;
  };
  const build = r => {
    for (const m of meshes) { m.removeFromParent(); m.dispose(); }
    const sg = subgroupsWanted(r), P = pyramid();
    key = (sg ? 's' : 'p') + P.gen + (P.tex ? '' : '-');
    cap = Math.max(64, im._capacity || im._instancesArrayCount || 64);
    src = new StorageInstancedBufferAttribute(cap * 16, 1);   // every copy's matrix (w of the last column 0: hidden)
    col = im.colorsTexture ? new StorageInstancedBufferAttribute(cap * 4, 1) : null;
    // the draws: for each level [count, copies, first, base, first copy] for the camera, then for everything; then
    // the copies each level's occlusion test hid; then each copy: its level + 1 when only the shadows draw it
    const HID = L * 10, FLAG = HID + L, di = new Uint32Array(FLAG + cap);
    draw = new IndirectStorageBufferAttribute(di, 1);
    meshes = levels.map(({ obj }, i) => {
      const s = obj.geometry, g = new BufferGeometry();
      for (const k in s.attributes) if (k !== 'instanceIndex') g.setAttribute(k, s.attributes[k]);
      g.setIndex(s.index);
      if (!s.boundingSphere) s.computeBoundingSphere(); g.boundingSphere = s.boundingSphere;
      di[i * 10] = di[i * 10 + 5] = s.index ? s.index.count : s.attributes.position.count;   // [count, copies, first, base, first copy] for the camera, then for everything
      g.setIndirect(draw, i * 40);
      const m = new InstancedMesh(g, obj.material, cap);
      m.instanceMatrix = new StorageInstancedBufferAttribute(cap, 16);
      // three's "last frame" copies are this frame's (see the top): the list is packed afresh each frame
      m.instanceMatrix.clone = function () { return this; };
      if (col) { m.instanceColor = new StorageInstancedBufferAttribute(cap, 3); m.instanceColor.clone = function () { return this; }; }
      m.count = cap; m.frustumCulled = false;
      m.castShadow = im.castShadow; m.receiveShadow = im.receiveShadow;
      // the camera draws the copies it sees; anything else that draws the scene, the copies the shadows need too
      m.onBeforeRender = (rr, sc, camera, geo) => { geo.indirectOffset = camera === mainCam ? i * 40 : i * 40 + 20; };
      m.userData.gsTwin = im; m.name = (im.name || 'props') + ':gpu' + i;
      group.add(m); return m;
    });
    const S = storage(src, 'vec4', cap * 4).toReadOnly(), C = col && storage(col, 'vec4', cap).toReadOnly(), D = storage(draw, 'uint', FLAG + cap).toAtomic();
    const Pz = texture(pyrTex()), PU = P.U;
    const out = meshes.map(m => storage(m.instanceMatrix, 'vec4', cap * 4)), outC = col ? meshes.map(m => storage(m.instanceColor, 'vec3', cap)) : null;
    const reset = Fn(() => { for (let k = 0; k < L; k++) { atomicStore(D.element(k * 10 + 1), uint(0)); atomicStore(D.element(k * 10 + 6), uint(0)); atomicStore(D.element(HID + k), uint(0)); } })().compute(1);
    // the copies only the shadows draw go after the ones the camera draws
    const mid = Fn(() => { for (let k = 0; k < L; k++) atomicStore(D.element(k * 10 + 6), atomicLoad(D.element(k * 10 + 1))); })().compute(1);
    const inside = (k0, p, rad) => { let ok = dot(U.planes.element(k0).xyz, p).add(U.planes.element(k0).w).greaterThanEqual(rad.negate()); for (let k = 1; k < 6; k++) ok = ok.and(dot(U.planes.element(k0.add ? k0.add(k) : k0 + k).xyz, p).add(U.planes.element(k0.add ? k0.add(k) : k0 + k).w).greaterThanEqual(rad.negate())); return ok; };
    // Occlusion.hiddenSphere() on the chip: the ball's rectangle on the picture and nearest 1/w, then every
    // texel of one level over it (the finest where it covers at most eight texels each way) at least that near
    const hidden = (pc, rad) => {
      const res = int(0).toVar();
      const q = PU.vp.mul(vec4(pc, 1)), cw = q.w, wn = cw.sub(rad);
      If(wn.greaterThanEqual(1e-2), () => {   // (reaching behind the camera: drawn)
        const L0 = PU.lv.element(0), W0 = L0.x, H0 = L0.y, g = PU.f.z;
        const nx = q.x.div(cw), ny = q.y.div(cw), k = rad.div(wn);
        const rx = k.mul(PU.f.x.add(abs(nx))).mul(.5).mul(W0), ry = k.mul(PU.f.y.add(abs(ny))).mul(.5).mul(H0), sx = nx.mul(.5).add(.5).mul(W0), sy = float(.5).sub(ny.mul(.5)).mul(H0);
        const x0 = max(int(0), int(floor(sx.sub(rx))).sub(int(g))).toVar(), y0 = max(int(0), int(floor(sy.sub(ry))).sub(int(g))).toVar();
        const x1 = min(int(W0).sub(1), int(ceil(sx.add(rx))).sub(1).add(int(g))).toVar(), y1 = min(int(H0).sub(1), int(ceil(sy.add(ry))).sub(1).add(int(g))).toVar();
        If(x0.lessThanEqual(x1).and(y0.lessThanEqual(y1)), () => {   // (off the picture: the frustum test's business)
          const need = float(1).div(wn).mul(float(1).add(PU.f.w)), span = max(x1.sub(x0), y1.sub(y0)), l = int(0).toVar();
          Loop({ start: int(0), end: PU.nl.sub(1), type: 'int', name: 'pl' }, () => { If(span.shiftRight(l).lessThanEqual(6), () => { Break(); }); l.addAssign(1); });
          const Lv = PU.lv.element(l), row = int(Lv.z), all = int(1).toVar();
          Loop({ start: y0.shiftRight(l), end: y1.shiftRight(l).add(1), type: 'int', name: 'py' }, ({ py }) => {
            Loop({ start: x0.shiftRight(l), end: x1.shiftRight(l).add(1), type: 'int', name: 'px' }, ({ px }) => {
              If(Pz.load(ivec2(px, row.add(py))).x.lessThan(need), () => { all.assign(0); Break(); });
            });
            If(all.equal(0), () => { Break(); });
          });
          res.assign(all);
        });
      });
      return res.equal(1);
    };
    const cull = Fn(() => {
      whole(sg);
      const i = instanceIndex, lvC = int(-1).toVar(), lvS = int(-1).toVar(), lvH = int(-1).toVar();
      const c0 = vec4(0).toVar(), c1 = vec4(0).toVar(), c2 = vec4(0).toVar(), c3 = vec4(0).toVar();
      If(i.lessThan(U.n), () => {
        const b = i.mul(4); c0.assign(S.element(b)); c1.assign(S.element(b.add(1))); c2.assign(S.element(b.add(2))); c3.assign(S.element(b.add(3)));
        If(c3.w.greaterThan(.5), () => {
          const sc = max(length(c0.xyz), max(length(c1.xyz), length(c2.xyz))).mul(U.ws);
          const p = U.wm.mul(vec4(c3.xyz, 1)).xyz.toVar(), far = U.r0.mul(sc).add(8);   // (the copy's own place, as the library's levels go by; +8 m: things just out of view still cast their shadows in)
          const pc = U.wm.mul(vec4(c0.xyz.mul(U.bc.x).add(c1.xyz.mul(U.bc.y)).add(c2.xyz.mul(U.bc.z)).add(c3.xyz), 1)).xyz.toVar(), rad = U.r0.mul(sc).add(U.pad).toVar();
          const seen = inside(0, pc, rad.add(.5)).toVar(), cast = int(0).toVar();   // (+.5 m: the picture's jitter, a sub-pixel turn of the view after this)
          Loop({ start: int(0), end: U.ns, type: 'int', name: 'sj' }, ({ sj }) => {
            If(cast.equal(0), () => { If(inside(sj.add(1).mul(6), p, far), () => { cast.assign(1); }); });
          });
          If(U.extra.equal(1).and(cast.equal(0)), () => { If(inside(0, p, far), () => { cast.assign(1); }); });   // (lights past the ones tested: what is near the view is kept for them)
          If(seen.or(cast.equal(1)), () => {
            const d = p.sub(U.cam), d2 = dot(d, d);
            let lv = int(0);
            for (let k = 1; k < L; k++) lv = lv.add(int(d2.greaterThanEqual(U.dist.element(k))));
            const lvv = lv.toVar();
            If(seen, () => { If(U.occ.equal(1).and(hidden(pc, rad)), () => { lvH.assign(lvv); }).Else(() => { lvC.assign(lvv); }); });
            If(lvC.lessThan(0).and(cast.equal(1)), () => { lvS.assign(lvv); });
          });
        });
      });
      // (every thread from here: subgroups.js)
      for (let k = 0; k < L; k++) {
        const s = claim(D.element(k * 10 + 1), lvC.equal(k), sg);
        If(lvC.equal(k), () => {
          const o = s.mul(4), O = out[k];
          O.element(o).assign(c0); O.element(o.add(1)).assign(c1); O.element(o.add(2)).assign(c2); O.element(o.add(3)).assign(vec4(c3.xyz, 1));
          if (outC) outC[k].element(s).assign(C.element(i).xyz);
        });
        addUp(D.element(HID + k), select(lvH.equal(k), uint(1), uint(0)), sg);
      }
      If(i.lessThan(U.n), () => { atomicStore(D.element(i.add(FLAG)), uint(lvS.add(1))); });
    })().compute(cap, [64]);
    // the copies only the shadows draw, after the camera's
    const shadows = Fn(() => {
      whole(sg);
      const i = instanceIndex, f = int(0).toVar();
      If(i.lessThan(U.n), () => { f.assign(int(atomicLoad(D.element(i.add(FLAG))))); });
      for (let k = 0; k < L; k++) {
        const s = claim(D.element(k * 10 + 6), f.equal(k + 1), sg);
        If(f.equal(k + 1), () => {
          const b = i.mul(4), o = s.mul(4), O = out[k];
          O.element(o).assign(S.element(b)); O.element(o.add(1)).assign(S.element(b.add(1))); O.element(o.add(2)).assign(S.element(b.add(2))); O.element(o.add(3)).assign(vec4(S.element(b.add(3)).xyz, 1));
          if (outC) outC[k].element(s).assign(C.element(i).xyz);
        });
      }
    })().compute(cap, [64]);
    nodes = { reset, cull, mid, shadows };
    dirty = true; lastHidden = null;
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
  // how many copies each level hid, now and then (occlude.js weighs it against what occlusion costs)
  const readHidden = r => {
    if (statBusy || ++statF < STAT_EVERY) return; statF = 0; statBusy = true;
    const at = draw;
    r.getArrayBufferAsync(at).then(buf => {
      if (at !== draw) return;
      const h = new Uint32Array(buf, L * 10 * 4, L); let t = 0;
      for (let k = 0; k < L; k++) { const g = levels[k].obj.geometry; t += h[k] * (g.index ? g.index.count : g.attributes.position.count) / 3; }
      hiddenTris = t; lastHidden = Array.from(h);
    }).catch(() => {}).finally(() => { statBusy = false; });
  };
  return {
    get meshes() { return meshes; },
    sends: () => sends,
    /** Triangles the chip's occlusion test left out a frame, as last read back (0 while occlusion is off). */
    get hiddenTris() { return U.occ.value ? hiddenTris : 0; },
    /** Draws the copies in view of cam (and of shadowCams) this frame; oc: the view's Occlusion, when its culling is on. */
    sync(r, cam, shadowCams, oc = null) {
      const occ = !!(oc?.ready && pad !== null && sendPyramid(oc)), Y = pyramid();
      if (!cap || (im._capacity || 0) > cap || key !== (subgroupsWanted(r) ? 's' : 'p') + Y.gen + (Y.tex ? '' : '-')) build(r);
      const n = Math.min(cap, im._instancesArrayCount || 0);
      if (!im.matricesTexture?._data || !n) { U.n.value = 0; } else if (dirty || n !== sent) send(n);
      U.n.value = n ? n : 0;
      mainCam = cam;
      cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); F.setFromProjectionMatrix(PM, cam.coordinateSystem);
      const P = U.planes.array; for (let k = 0; k < 6; k++) P[k].set(F.planes[k].normal.x, F.planes[k].normal.y, F.planes[k].normal.z, F.planes[k].constant);
      const all = im.castShadow && shadowCams ? shadowCams.length : 0, ns = Math.min(MAX_SHADOW, all);
      for (let j = 0; j < ns; j++) {
        const c = shadowCams[j]; F.setFromProjectionMatrix(PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), c.coordinateSystem);
        for (let k = 0; k < 6; k++) P[6 * (j + 1) + k].set(F.planes[k].normal.x, F.planes[k].normal.y, F.planes[k].normal.z, F.planes[k].constant);
      }
      U.ns.value = ns; U.extra.value = all > ns ? 1 : 0; U.cam.value.copy(cam.getWorldPosition(PV)); U.wm.value.copy(im.matrixWorld);
      const e = im.matrixWorld.elements; U.ws.value = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
      ball(); U.pad.value = pad ?? 8;   // (a shader that moves the copies by who knows how much: the old 8 m round them)
      for (let k = 0; k < MAX_LEVELS; k++) U.dist.array[k] = k < L ? (k ? levels[k].dist : 0) : 1e30;
      U.occ.value = occ ? 1 : 0;
      r.compute(nodes.reset); r.compute(nodes.cull); r.compute(nodes.mid);
      if (all) r.compute(nodes.shadows);
      if (occ) readHidden(r);
      return n;
    },
    /** Tests: { cam, all, hidden } copies by level, read back from the chip (the last frame's). */
    async counts(r) {
      const d = new Uint32Array(await r.getArrayBufferAsync(draw));
      return { cam: levels.map((_, k) => d[k * 10 + 1]), all: levels.map((_, k) => d[k * 10 + 6]), hidden: levels.map((_, k) => d[L * 10 + k]) };
    },
    get lastHidden() { return lastHidden; },
    dispose() { for (const m of meshes) { m.removeFromParent(); m.dispose(); } meshes = []; for (const u of undo) u(); undo.length = 0; },
  };
}
