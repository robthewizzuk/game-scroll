// People skinned once a frame on the graphics chip (WebGPU): Rob's pick 2 of the WebGPU engines review.
//
// three.js skins a mesh on bones in its vertex shader, so every pass that draws it skins every point again: the
// picture, each shadow map and each part of one, and (where motion is written) the pose of the frame before as well.
// In the engine test square (300 people, a skeleton each) the sun's shadow maps alone took 5.4 ms of the Fold's chip
// a frame, most of it posing the same points again. Unity's WebGPU skinning and Bevy do as this does: one compute
// pass a frame poses every point of every person in view (or in a shadow's view) into one list, and every pass that
// draws them reads its points and normals from there. The frame before's points are kept beside them (each mesh has
// two halves and takes turns), so the motion picture costs no second posing either.
//
// How it is laid out. A kind's points at rest (place, normal, four bones and weights) are sent once and shared by its
// twins: 32 bytes a point. Each mesh in the pool has its own two halves of posed points, 16 bytes a point each (the
// place as floats, the normal as two 16-bit numbers on an octahedron). Each frame the CPU sends the bone matrices of
// the skeletons in view, a small table a mesh (where its points are, its bones, its bind matrices) and which mesh each
// group of 64 points belongs to; then one dispatch poses them all. A mesh shared out to shaders reads its points by
// vertex number from where its half starts (a number a mesh, three's own per-object uniforms).
//
// What it takes: meshes on bones (three's SkinnedMesh) with no blend shapes and no tangents (those are skinned in the
// vertex shader as before: fur's shells, a face of blend shapes), on WebGPU where vertex shaders may read storage
// lists. WebGL (and WebGPU without that) skin in the vertex shader as before. HD.gpuSkin = false turns it off.
// Kit use only (hd3d-gpu.js installs it, hd3d.js drawGPU runs it).
import { StorageBufferAttribute, Frustum, Matrix4, Sphere, Vector3, NodeMaterial, VelocityNode } from 'three/webgpu';
import { Fn, If, storage, uniform, instanceIndex, vertexIndex, uint, float, vec2, vec3, vec4, uvec4, mat3, mat4, abs, max, select, length, normalize,
  uintBitsToFloat, floatBitsToUint, unpackSnorm2x16, packSnorm2x16, unpackUnorm2x16, positionLocal, normalLocal, positionPrevious } from 'three/tsl';
import { floats } from './slim.js';

const WG = 64;           // points a group (the compute shader's workgroup)
const MESH = 10;         // vec4s a mesh in the table: (rest, points, first group, this half), (bones, other half to fill, 0, 0), bind, bind inverse
const KEEP = 240;        // frames a mesh may go unseen before its posed points are let go
const MARGIN = 2;        // metres round a mesh's bounding sphere when deciding whether a camera or shadow sees it

// ---------------------------------------------------------------- spans of a list (first fit, joined when freed)
class Spans {
  constructor(n) { this.n = n; this.free = n ? [[0, n]] : []; }
  take(k) {
    const F = this.free;
    for (let i = 0; i < F.length; i++) { const f = F[i]; if (f[1] >= k) { const at = f[0]; f[0] += k; f[1] -= k; if (!f[1]) F.splice(i, 1); return at; } }
    return -1;
  }
  give(at, k) {
    const F = this.free; let i = 0; while (i < F.length && F[i][0] < at) i++;
    F.splice(i, 0, [at, k]);
    if (i + 1 < F.length && F[i][0] + F[i][1] === F[i + 1][0]) { F[i][1] += F[i + 1][1]; F.splice(i + 1, 1); }
    if (i > 0 && F[i - 1][0] + F[i - 1][1] === F[i][0]) { F[i - 1][1] += F[i][1]; F.splice(i, 1); }
  }
  grow(n) { if (n > this.n) { this.give(this.n, n - this.n); this.n = n; } }
}

// ---------------------------------------------------------------- normals on an octahedron, two 16-bit numbers
const sgn = x => select(x.greaterThanEqual(0), float(1), float(-1));
const octEncode = n => {
  const a = n.div(abs(n.x).add(abs(n.y)).add(abs(n.z)));
  return select(a.z.lessThan(0), vec2(float(1).sub(abs(a.y)).mul(sgn(a.x)), float(1).sub(abs(a.x)).mul(sgn(a.y))), a.xy);
};
const octDecode = e => {
  const z = float(1).sub(abs(e.x)).sub(abs(e.y)), t = max(z.negate(), 0);
  return normalize(vec3(e.x.sub(sgn(e.x).mul(t)), e.y.sub(sgn(e.y).mul(t)), z));
};
// the same in JavaScript, packed as WGSL's pack2x16snorm packs (x in the low 16 bits)
const q16 = v => Math.round(Math.max(-1, Math.min(1, v)) * 32767) & 0xffff;
function octPack(x, y, z) {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; let a = x / s, b = y / s;
  if (z < 0) { const a0 = a; a = (1 - Math.abs(b)) * (a0 >= 0 ? 1 : -1); b = (1 - Math.abs(a0)) * (b >= 0 ? 1 : -1); }
  return (q16(a) | q16(b) << 16) >>> 0;
}

/** Can this mesh be posed in the pool? (on bones, no blend shapes, no tangents, its places as floats) */
export function skinFits(o) {
  if (!o.isSkinnedMesh || !o.skeleton || o.isInstancedMesh) return false;
  const g = o.geometry, A = g?.attributes;
  if (!A?.position || !A.skinIndex || !A.skinWeight || A.tangent || A.position.itemSize !== 3 || g.userData.gsGrid) return false;
  for (const k in g.morphAttributes) if (g.morphAttributes[k]?.length) return false;
  return !o.morphTargetInfluences?.length && A.position.count > 0 && o.skeleton.bones.length <= 65535;
}

const POOLS = new WeakMap();
/** The pool of a renderer (null where it can't: WebGL, or WebGPU whose vertex shaders can't read storage lists). */
export function skinPool(r) {
  if (POOLS.has(r)) return POOLS.get(r);
  const d = r.backend?.device, lim = d?.limits;
  const ok = r.backend?.isWebGPUBackend && d && !r.backend.compatibilityMode && (lim.maxStorageBuffersInVertexStage ?? lim.maxStorageBuffersPerShaderStage) >= 2;
  const P = ok ? new SkinPool(r) : null; POOLS.set(r, P);
  return P;
}

// what a mesh in the pool keeps: its geometry's rest points, its two halves, the frame it was last posed, which half is this frame's
class Entry { constructor(o, rest, fr) { this.o = o; this.rest = rest; this.out = -1; this.n = rest.n; this.half = 0; this.seen = -2; this.used = fr; } }

const F = new Frustum(), PM = new Matrix4(), S = new Sphere(), V = new Vector3();

class SkinPool {
  constructor(r) {
    this.r = r; this.frame = 0; this.on = true;
    this.meshes = new Map();        // mesh -> Entry
    this.rests = new Map();         // geometry -> { at, n, users, v (position version) }
    this.restSpans = new Spans(0); this.outSpans = new Spans(0);
    this.R = null; this.O = null;   // rest points (2 x uvec4 a point) and posed points (uvec4 a point), StorageBufferAttributes
    this.B = new StorageBufferAttribute(new Float32Array(16 * 256), 4);      // bone matrices, four vec4 columns each
    this.T = new StorageBufferAttribute(new Float32Array(4 * MESH * 64), 4); // the table, a mesh a row
    this.G = new StorageBufferAttribute(new Uint32Array(1024), 1);          // the mesh of each group of 64 points
    this.groups = uniform(0, 'uint');
    this.info = { meshes: 0, posed: 0, points: 0, bones: 0, kinds: 0, poolMB: 0 };
    this.growRest(1 << 16); this.growOut(1 << 17);
    this.reads = null; this.kernel = null;
    // (a cluster detail twin, detail.js cutTwin, reads the points of the mesh it stands in for: posed once for all its parts)
    this.cur = uniform(0, 'uint').onObjectUpdate(({ object }) => { const e = this.meshes.get(object.userData.gsPoseOf || object); return e && e.out >= 0 ? e.out + e.half * e.n : 0; });
    this.prev = uniform(0, 'uint').onObjectUpdate(({ object }) => { const e = this.meshes.get(object.userData.gsPoseOf || object); return e && e.out >= 0 ? e.out + (1 - e.half) * e.n : 0; });
  }
  // ------------------------------------------------------------ lists that grow (their contents carried over on the CPU side)
  growRest(n) {
    const old = this.R, a = new Uint32Array(n * 8); if (old) a.set(old.array);
    this.R = new StorageBufferAttribute(a, 4); this.restSpans.grow(n); this.restF = new Float32Array(a.buffer);
    if (this.rN) this.rN.value = this.R;
  }
  growOut(n) {
    // (the posed points live only on the chip: a bigger list starts empty, so every mesh is posed into both its halves again)
    this.O = new StorageBufferAttribute(new Uint32Array(n * 4), 4); this.outSpans.grow(n);
    if (this.oW) { this.oW.value = this.O; this.oR.value = this.O; }
    for (const e of this.meshes.values()) e.seen = -2;
  }
  fit(attr, n, items) { if (attr.array.length >= n * items) return attr; let m = attr.array.length / items; while (m < n) m *= 2; return new StorageBufferAttribute(new attr.array.constructor(m * items), attr.itemSize); }
  // ------------------------------------------------------------ a geometry's rest points, once for all its twins
  restOf(g) {
    let R = this.rests.get(g);
    const P = g.attributes.position;
    if (R && R.v === P.version) return R;
    const n = P.count;
    if (!R) {
      let at = this.restSpans.take(n);
      while (at < 0) { this.growRest(Math.max(this.restSpans.n * 2, this.restSpans.n + n)); at = this.restSpans.take(n); }
      R = { at, n, users: 0, v: -1 }; this.rests.set(g, R);
      const gone = () => { g.removeEventListener('dispose', gone); this.dropRest(g); };
      g.addEventListener('dispose', gone);
    }
    this.pack(g, R);
    return R;
  }
  pack(g, R) {
    const A = g.attributes, n = R.n, U = this.R.array, Fv = this.restF, o0 = R.at * 8;
    const p = floats(A.position), nr = A.normal ? floats(A.normal) : null, si = A.skinIndex, sw = A.skinWeight;
    // (slim.js keeps bones and weights as one list of bytes, or of 16-bit numbers, read at two offsets: read straight from it)
    const one = si.isInterleavedBufferAttribute && sw.isInterleavedBufferAttribute && si.data === sw.data && si.data.stride === 8 && si.offset === 0 && sw.offset === 4 && sw.normalized;
    const ia = one ? si.data.array : floats(si), wa = one ? ia : floats(sw), wk = one ? (ia instanceof Uint8Array ? 257 : ia instanceof Uint16Array ? 1 : 0) : 0;
    const raw = one && wk > 0;
    for (let i = 0; i < n; i++) {
      const o = o0 + i * 8, b = raw ? i * 8 : i * 4;
      Fv[o] = p[i * 3]; Fv[o + 1] = p[i * 3 + 1]; Fv[o + 2] = p[i * 3 + 2];
      U[o + 3] = nr ? octPack(nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]) : octPack(0, 1, 0);
      let w0, w1, w2, w3;
      if (raw) { w0 = wa[b + 4] * wk; w1 = wa[b + 5] * wk; w2 = wa[b + 6] * wk; w3 = wa[b + 7] * wk; }
      else { w0 = Math.round(Math.max(0, Math.min(1, wa[b])) * 65535); w1 = Math.round(Math.max(0, Math.min(1, wa[b + 1])) * 65535); w2 = Math.round(Math.max(0, Math.min(1, wa[b + 2])) * 65535); w3 = Math.round(Math.max(0, Math.min(1, wa[b + 3])) * 65535); }
      U[o + 4] = (ia[b] | ia[b + 1] << 16) >>> 0; U[o + 5] = (ia[b + 2] | ia[b + 3] << 16) >>> 0;
      U[o + 6] = (w0 | w1 << 16) >>> 0; U[o + 7] = (w2 | w3 << 16) >>> 0;
    }
    R.v = A.position.version;
    this.R.addUpdateRange(o0, n * 8); this.R.needsUpdate = true;
  }
  dropRest(g) { const R = this.rests.get(g); if (!R) return; this.rests.delete(g); this.restSpans.give(R.at, R.n); for (const e of [...this.meshes.values()]) if (e.rest === R) this.drop(e.o); }
  drop(o) { const e = this.meshes.get(o); if (!e) return; this.meshes.delete(o); if (e.out >= 0) this.outSpans.give(e.out, e.n * 2); e.out = -1; this.marked(o); }
  // a mesh came into the pool or left it: its materials are marked changed, so three compares its shaders' key again
  marked(o) { const m = o.material; for (const x of Array.isArray(m) ? m : [m]) if (x) x.needsUpdate = true; }
  // a mesh's two halves, emptied (all its points at its middle: nothing drawn) until it is first posed
  place(e) {
    let at = this.outSpans.take(e.n * 2);
    while (at < 0) { this.growOut(Math.max(this.outSpans.n * 2, this.outSpans.n + e.n * 2)); at = this.outSpans.take(e.n * 2); }
    e.out = at; e.seen = -2; this.O.addUpdateRange(at * 4, e.n * 8); this.O.needsUpdate = true;
  }
  // ------------------------------------------------------------ the shaders
  build() {
    const R = this.rN = storage(this.R, 'uvec4').toReadOnly(), B = this.bN = storage(this.B, 'vec4').toReadOnly(), T = this.tN = storage(this.T, 'vec4').toReadOnly(), G = this.gN = storage(this.G, 'uint').toReadOnly();
    const O = this.oW = storage(this.O, 'uvec4');
    this.oR = storage(this.O, 'uvec4').toReadOnly();
    const U = this;
    this.kernel = Fn(() => {
      const t = instanceIndex, g = t.shiftRight(6), lane = t.bitAnd(WG - 1);
      If(g.lessThan(U.groups), () => {
        const b = G.element(g).mul(MESH).toVar(), m0 = T.element(b).toVar(), m1 = T.element(b.add(1)).toVar();
        const n = uint(m0.y), v = g.sub(uint(m0.z)).mul(WG).add(lane).toVar();
        If(v.lessThan(n), () => {
          const r = uint(m0.x).add(v).mul(2), r0 = R.element(r).toVar(), r1 = R.element(r.add(1)).toVar(), bones = uint(m1.x);
          const bone = i => { const k = bones.add(i).mul(4); return mat4(B.element(k), B.element(k.add(1)), B.element(k.add(2)), B.element(k.add(3))); };
          const w01 = unpackUnorm2x16(r1.z), w23 = unpackUnorm2x16(r1.w);
          const S = bone(r1.x.bitAnd(0xffff)).mul(w01.x).add(bone(r1.x.shiftRight(16)).mul(w01.y)).add(bone(r1.y.bitAnd(0xffff)).mul(w23.x)).add(bone(r1.y.shiftRight(16)).mul(w23.y));
          const bind = mat4(T.element(b.add(2)), T.element(b.add(3)), T.element(b.add(4)), T.element(b.add(5)));
          const inv = mat4(T.element(b.add(6)), T.element(b.add(7)), T.element(b.add(8)), T.element(b.add(9)));
          // as three's skinning node: bind inverse x (the bones, by weight) x bind, for the place and (as a 3 x 3) the normal
          const M = inv.mul(S).mul(bind).toVar();
          const q = M.mul(vec4(uintBitsToFloat(r0.x), uintBitsToFloat(r0.y), uintBitsToFloat(r0.z), 1)).toVar();
          const nr = octDecode(unpackSnorm2x16(r0.w)), nm = mat3(M).mul(nr).toVar(), l = length(nm);
          // (a bone scaled to nothing, kit that is put away: the normal it would give is none, so the rest one stands)
          const nn = select(l.greaterThan(1e-12), nm.div(l), nr);
          const out = uvec4(floatBitsToUint(q.x), floatBitsToUint(q.y), floatBitsToUint(q.z), packSnorm2x16(octEncode(nn))).toVar();
          const here = uint(m0.w), other = uint(m1.y);
          O.element(here.add(v)).assign(out);
          If(other.notEqual(here), () => { O.element(other.add(v)).assign(out); });   // (a mesh new to the pool, or seen again: last frame's pose is this one)
        });
      });
    })().computeKernel([WG]);
  }
  /** The vertex stage of a mesh in the pool: its points and normal from this frame's half, last frame's from the other. */
  vertex(builder) {
    if (!this.kernel) this.build();
    const o = this.oR.element(this.cur.add(vertexIndex));
    positionLocal.assign(vec3(uintBitsToFloat(o.x), uintBitsToFloat(o.y), uintBitsToFloat(o.z)));
    if (builder.hasGeometryAttribute('normal')) normalLocal.assign(octDecode(unpackSnorm2x16(o.w)));
    if (builder.needsPreviousData()) { const p = this.oR.element(this.prev.add(vertexIndex)); positionPrevious.assign(vec3(uintBitsToFloat(p.x), uintBitsToFloat(p.y), uintBitsToFloat(p.z))); }
  }
  // ------------------------------------------------------------ each frame
  /**
   * Takes into the pool the meshes on bones the scene shows that fit (before anything of this frame is drawn or built,
   * so their shaders are made reading the pool from the start). each: scene-list.js eachShown for the scene.
   */
  list(scene, each) {
    if (!this.on) return;
    if (!this.keyed) this.keyed = keyed(this.r);
    const L = this.shown ||= []; L.length = 0;
    each(scene, o => { if (o.isSkinnedMesh && !o.userData.gsPoseOf) L.push(o); });   // (twins standing in for a mesh are posed through it: has())
    for (const o of L) {
      let e = this.meshes.get(o);
      if (e && e.o.geometry && this.rests.get(o.geometry) !== e.rest) { this.drop(o); e = null; }   // (it was given another geometry)
      if (!e) {
        if (!skinFits(o)) continue;
        e = new Entry(o, this.restOf(o.geometry), this.frame); this.meshes.set(o, e); this.place(e);
        this.marked(o);
      } else if (e.rest.v !== o.geometry.attributes.position.version) this.pack(o.geometry, e.rest);
    }
  }
  /**
   * Poses this frame's meshes: those the scene shows that the camera or a shadow-casting light's camera could see
   * (their bounding spheres, a little bigger), into this frame's half of each. cams: the shadow cameras.
   */
  run(cam, cams) {
    if (!this.on || !this.shown) return 0;
    const fr = ++this.frame, I = this.info;
    // the views: the camera's, and each shadow's (a point light's map looks every way: by its reach)
    const views = this.views ||= []; let nv = 0;
    const view = c => {
      c.updateMatrixWorld(); PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
      const f = views[nv] ||= new Frustum(); f.setFromProjectionMatrix(PM, c.coordinateSystem); nv++;
    };
    view(cam);
    const balls = this.balls ||= []; let nb = 0;
    for (const c of cams) {
      if (c.gsPoint || c.parent?.isPointLight) { const b = balls[nb] ||= new Sphere(); c.getWorldPosition(b.center); b.radius = c.far; nb++; } else view(c);
    }
    const seen = e => {
      const o = e.o; if (!o.frustumCulled) return true;
      const bs = o.boundingSphere || o.geometry.boundingSphere; if (!bs) return true;
      S.copy(bs).applyMatrix4(o.matrixWorld); S.radius += MARGIN;
      for (let i = 0; i < nv; i++) if (views[i].intersectsSphere(S)) return true;
      for (let i = 0; i < nb; i++) if (balls[i].intersectsSphere(S)) return true;
      return false;
    };
    // this frame's meshes: their bones, their rows in the table and their groups of points
    const todo = this.todo ||= []; todo.length = 0;
    let bones = 0, groups = 0;
    const skels = this.skels ||= new Map(); skels.clear();
    for (const o of this.shown) {
      const e = this.meshes.get(o); if (!e || !seen(e)) continue;
      if (e.out < 0) this.place(e);
      const sk = o.skeleton; if (!skels.has(sk)) { skels.set(sk, bones); bones += sk.bones.length; }
      todo.push(e); groups += Math.ceil(e.n / WG);
    }
    // the lists big enough
    const B = this.fit(this.B, bones, 16), T = this.fit(this.T, todo.length, 4 * MESH), G = this.fit(this.G, groups, 1);
    if (B !== this.B) { this.B = B; if (this.bN) this.bN.value = B; }
    if (T !== this.T) { this.T = T; if (this.tN) this.tN.value = T; }
    if (G !== this.G) { this.G = G; if (this.gN) this.gN.value = G; }
    // bones: each skeleton once, by its own update (bone x its inverse at rest; a person's far skeleton has one of its own),
    // written straight into the list: the skeleton's own matrices are left as they were, for three, which still poses in
    // the vertex shader whatever is not in the pool on the same bones (fur's shells) and, on the first frame it draws them
    // each frame, keeps them as last frame's for its motion picture before working them out again
    const BA = B.array;
    for (const [sk, at] of skels) { const own = sk.boneMatrices; sk.boneMatrices = BA.subarray(at * 16, (at + sk.bones.length) * 16); try { sk.update(); } finally { sk.boneMatrices = own; } }
    const TA = T.array, GA = G.array; let g = 0;
    for (let i = 0; i < todo.length; i++) {
      const e = todo[i], o = e.o, k = i * MESH * 4, fresh = e.seen !== fr - 1;
      e.half = 1 - e.half; e.seen = fr; e.used = fr;
      const here = e.out + e.half * e.n, other = fresh ? e.out + (1 - e.half) * e.n : here, ng = Math.ceil(e.n / WG);
      TA[k] = e.rest.at; TA[k + 1] = e.n; TA[k + 2] = g; TA[k + 3] = here;
      TA[k + 4] = skels.get(o.skeleton); TA[k + 5] = other; TA[k + 6] = 0; TA[k + 7] = 0;
      TA.set(o.bindMatrix.elements, k + 8); TA.set(o.bindMatrixInverse.elements, k + 24);
      GA.fill(i, g, g + ng); g += ng;
    }
    // meshes not posed for a while leave the pool (one shown again comes back in, before it is drawn)
    if (fr % 60 === 0) for (const e of [...this.meshes.values()]) if (fr - e.used > KEEP) this.drop(e.o);
    I.meshes = this.meshes.size; I.posed = todo.length; I.bones = bones; I.kinds = this.rests.size;
    I.points = 0; for (const e of todo) I.points += e.n;
    I.poolMB = +((this.R.array.byteLength + this.O.array.byteLength) / 1048576).toFixed(1);
    if (!todo.length) return 0;
    if (!this.kernel) this.build();
    B.addUpdateRange(0, bones * 16); B.needsUpdate = true;
    T.addUpdateRange(0, todo.length * MESH * 4); T.needsUpdate = true;
    G.addUpdateRange(0, groups); G.needsUpdate = true;
    this.groups.value = groups;
    const list = this.list1 ||= [this.kernel]; list.gsPart = 'skinning';
    this.r.compute(list, groups * WG);
    return todo.length;
  }
  /** Turns the pool on or off (tests, the engine test scenes): the meshes' shaders are made again either way. */
  set(on) {
    on = !!on; if (on === this.on) return;
    this.on = on;
    if (!on) { for (const o of [...this.meshes.keys()]) this.drop(o); this.shown = null; }   // (each marked: three makes their own shaders again)
  }
  has(o) { return this.on && this.meshes.has(o.userData?.gsPoseOf || o); }
}

// A shader made for a mesh in the pool is not the one for the same mesh posed in its vertex shader: three keeps a mesh's
// shaders, and shares them between meshes, by a key made of its material, its geometry's lists and its number of bones,
// which are the same either way. So whether a mesh is in its renderer's pool goes into that key (three's RenderObject is
// not exported: its prototype is reached through the first one made after this). A material whose meshes come into the
// pool or leave it is marked changed, and three then compares the key again and makes the shaders that fit.
let keyedProto = null;
function keyed(r) {
  const O = r._objects; if (!O) return false; if (O.gsSkinKey) return true; O.gsSkinKey = true;
  const patch = ro => {
    if (keyedProto) return;
    keyedProto = Object.getPrototypeOf(ro);
    const base = keyedProto.getCacheKey;
    keyedProto.getCacheKey = function () { const k = base.call(this); return POOLS.get(this.renderer)?.has(this.object) ? 'skin:' + k : k; };   // (three's key is a sum of hashes past 2^53: a string, not k + a little)
  };
  const first = O._renderObjects?.values().next().value; if (first) patch(first);
  const make = O.createRenderObject;
  O.createRenderObject = function (...a) {
    const ro = make.apply(this, a);
    if (!keyedProto) { patch(ro); ro.initialCacheKey = ro.getCacheKey(); }   // (made before the key knew of the pool)
    return ro;
  };
  return true;
}

// The vertex stage: a mesh in its renderer's pool takes its points from there, and three's own skinning is left out (the
// pool did it). Everything after (a material's own positionNode, displacement) builds on the posed points as before.
const setup = NodeMaterial.prototype.setupPosition;
if (!setup.gsSkin) {
  NodeMaterial.prototype.setupPosition = function (builder) {
    const o = builder.object, P = o?.isSkinnedMesh && POOLS.get(builder.renderer);
    if (!P || !P.has(o)) return setup.call(this, builder);
    P.vertex(builder);
    o.isSkinnedMesh = false;   // (three's own skinning step: the pool did it)
    try { return setup.call(this, builder); } finally { o.isSkinnedMesh = true; }
  };
  NodeMaterial.prototype.setupPosition.gsSkin = true;
}

// Motion (frame generation, SGSR 2, motion blur) of a thing that moved as a whole. three keeps where each thing was
// a frame ago by the draw, not by the frame: a mesh of several materials (a person: skin, eyes, teeth, clothes) is
// several draws, and every draw after the first took "a frame ago" to be where it is now. three's own skinning
// leans on that by chance: it poses the frame before's points with the bones of then but against where the mesh is
// now (its points are its bones' places in the world, moved into the mesh's own space), so its first draw said a
// person who moved 30 cm moved 60, and the rest said 30. The pool keeps the frame before's points in the mesh's
// space of then, so it wants where the mesh was a frame ago, for every draw: here each thing's matrix is kept by the
// frame. A mesh posed by three's own skinning (attached to its bones, so its points of then are in its space of now)
// is given its matrix of now, which with the bones of then is where it was: right for all its draws.
const vnUpdate = VelocityNode.prototype.update;
if (!vnUpdate.gsByFrame) {
  const was = new WeakMap();
  VelocityNode.prototype.update = function (frame) {
    vnUpdate.call(this, frame);
    const { object: o, frameId } = frame;
    let d = was.get(o);
    if (!d) was.set(o, d = { f: frameId, prev: o.matrixWorld.clone(), now: o.matrixWorld.clone() });
    else if (d.f !== frameId) { d.f = frameId; d.prev.copy(d.now); d.now.copy(o.matrixWorld); }
    const own = o.isSkinnedMesh && o.bindMode !== 'detached' && !POOLS.get(frame.renderer)?.has(o);
    this.previousModelWorldMatrix.value.copy(own ? o.matrixWorld : d.prev);
  };
  VelocityNode.prototype.update.gsByFrame = true;
}

