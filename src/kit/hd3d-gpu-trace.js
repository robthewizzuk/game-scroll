// Ray traced reflections (v.reflect() on WebGPU, the best phones): each shiny pixel sends a ray into a
// simplified copy of the level kept on the graphics chip, so a floor shows what is behind the camera, off
// the screen's edge or hidden behind something else, which reflections worked out from the screen can't.
// (A phone's ray tracing hardware can't be reached from WebGPU, so the rays are traced in our own
// shader: the tree is three-mesh-bvh's and so is the shader code that walks it.)
//
// The copy: the level's still things in one block of triangles with one tree over them, each moving
// shape in a block of its own, and a small tree over the blocks that is made again whenever something
// moves (trace-scene.js picks them, trace-build.js makes the blocks in a worker). A corner keeps where
// it is, which way it faces and its look: a colour and a place in a table of the materials that glow.
//
// A frame, at half size: a ray from each shiny pixel along its reflection. What it hits is coloured
// from the picture itself where the camera can see that spot too (so it has its real material, light
// and shadow), and otherwise lit simply: the sun through a shadow ray, the sky's light, the nearest
// lamps, its own glow. Things the copy leaves out (people and animals, sets of copies, see-through
// things) are found by a short march over the screen, as screen-space reflections find them. Then, at
// full size, the result is laid over the picture: softened by how rough the surface is and how far
// the reflected thing is, weighed as the material weighs its surroundings, and put in the place of
// the sky's reflection there (a wall hides the sky; it doesn't shine through it).
// Kit use only (hd3d-gpu.js's GpuChain builds the stage; hd3d.js decides when).
import { DataTexture, DataUtils, RGBAFormat, HalfFloatType, NearestFilter, Matrix4, Vector2, Vector3, Vector4, Color, StorageBufferAttribute, StructTypeNode } from 'three/webgpu';
import {
  storage, uniform, uniformArray, uv, rtt, Fn, vec2, vec3, vec4, float, int, ivec2, mix, max, min, abs, dot, reflect, normalize, length, clamp, exp, pow, sqrt, floor, sin, cos,
  If, Loop, Break, select, smoothstep, texture, getViewPosition, interleavedGradientNoise, screenCoordinate, pmremTexture, DFGLUT, perspectiveDepthToViewZ, roughness, specularColorBlended,
} from 'three/tsl';
// (the library's own files, not its webgpu index: that pulls in its compute classes, which nothing here uses)
import { rayStruct, rayIntersectionResultStruct, bvhNodeStruct, transformStruct } from 'three-mesh-bvh/src/webgpu/tsl/structs.js';
import { wgslTagFn } from 'three-mesh-bvh/src/webgpu/nodes/WGSLTagFnNode.js';
import { BVH_STACK_DEPTH } from 'three-mesh-bvh/src/webgpu/tsl/constants.js';
import { getShapecastFn } from 'three-mesh-bvh/src/webgpu/shapecastFns/getShapecastFn.js';
import { getRaycastFirstHitFn } from 'three-mesh-bvh/src/webgpu/shapecastFns/getRaycastFirstHitFn.js';
import { getRaycastAnyHitFn } from 'three-mesh-bvh/src/webgpu/shapecastFns/getRaycastAnyHitFn.js';
import { TraceLevel, glowOf, ownMatrix } from './trace-scene.js';
import { ORIGIN } from './origin.js';
// the copy rays are sent through is in the world's own numbers (trace-scene.js ownMatrix); rays start where the drawing has them, about its centre
const ORG = uniform(ORIGIN);
import { buildBlock, traceReady, VERT, BLOCK_DEPTH } from './trace-build.js';
import { runTrace, canRunTrace } from './jobs.js';

// TLAS: nodes kept at the head of the node list for the tree over the blocks; SLOTS: places (the still
// block's, then the moving things'); TF: words a place (two matrices and whether it shows)
const TLAS = 320, SLOTS = 129, TF = 36, LAMPS = 8, STEPS = 12, BOXES = 4, SCAN = 20, GAP = 1500, FAR_BOX = 3e30;
const ROUGH_MAX = .65, ROUGH_FADE = .45;   // rougher than this a surface shows no reflection worth a ray
// (the walk's stack: the tree over the blocks is at most 9 deep, a block's BLOCK_DEPTH)
BVH_STACK_DEPTH.value = Math.min(BVH_STACK_DEPTH.value, BLOCK_DEPTH + 12);
const CORNER = new StructTypeNode({ position: 'vec4f', normal: 'vec4f' }, 'bvh_GeometryStruct');
const HALF = { depthBuffer: false, type: HalfFloatType };
const M = new Matrix4(), V3 = new Vector3(), GLOW = [0, 0, 0], BX = Array.from({ length: BOXES }, () => [0, 0, 0, 0, 0, 0]);

const same = (a, e) => { for (let i = 0; i < 16; i++) if (Math.abs(a[i] - e[i]) > 1e-6) return false; return true; };
const shown = (o, scene) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; };
const runBlock = job => (canRunTrace() ? runTrace(job).catch(() => traceReady.then(() => buildBlock(job))) : traceReady.then(() => buildBlock(job)));

/** A scene's traced level on one renderer: its lists on the graphics chip, kept up to date frame by frame. */
export class Tracer {
  /** twins(fn): calls fn(mesh, twin) for each mesh the renderer draws through a stand-in (cluster detail). */
  constructor(r, scene, { bits = 1, budget = 3e5, twins = null } = {}) {
    Object.assign(this, { r, scene, twins });
    this.level = new TraceLevel({ bits, budget });
    this.gen = 0; this.show = false; this.failed = false; this.busy = false; this.dead = false; this.n = 0; this.builtAt = -1e9; this.gap = GAP; this.trial = 0; this.fullAt = -9; this.moved = true;
    this.S = null; this.A = null; this.F = null; this.cap = { nodes: 0, index: 0, verts: 0 };
    this.still = null; this.shapes = new Map(); this.inst = []; this.leaves = []; this.loose = []; this.looseAll = true;
    this.info = { tris: 0, was: 0, things: 0, movers: 0, other: 0, left: 0, ms: 0, builds: 0, busy: false, mb: 0, lists: 0 };
    // the glow table as a strip of pixels, and what lights a hit (hd3d.js traceLights)
    this.pal = new DataTexture(new Uint16Array(256 * 4), 256, 1, RGBAFormat, HalfFloatType); this.pal.minFilter = this.pal.magFilter = NearestFilter; this.pal.needsUpdate = true;
    const v4 = (n = LAMPS) => uniformArray(Array.from({ length: n }, () => new Vector4()), 'vec4');
    this.U = {
      // (nb, bMin, bMax: the boxes round what the level leaves out; a ray looks along the screen only where it crosses one)
      far: uniform(120), nb: uniform(0), bMin: v4(BOXES), bMax: v4(BOXES), sunDir: uniform(new Vector3(0, 1, 0)), sunCol: uniform(new Color(0, 0, 0)), sky: uniform(new Color(0, 0, 0)), ground: uniform(new Color(0, 0, 0)),
      envI: uniform(1), fogCol: uniform(new Color(0, 0, 0)), fogK: uniform(0), nl: uniform(0), lPos: v4(), lCol: v4(), lDir: v4(), lCone: v4(),
    };
  }
  get ready() { return !!this.S && !this.failed; }
  // room on the chip for this many nodes, corner numbers and corners (made again, bigger, when it runs out)
  alloc(nodes, index, verts) {
    const c = this.cap; if (this.S && nodes <= c.nodes && index <= c.index && verts <= c.verts) return false;
    const grow = (need, had, least) => Math.max(least, need > had ? Math.ceil(need * 1.3) : had);
    c.nodes = grow(nodes, c.nodes, TLAS + 64); c.index = grow(index, c.index, 192); c.verts = grow(verts, c.verts, 64);
    const mk = (words, item) => new StorageBufferAttribute(new Uint32Array(words), item);
    const A = this.A = { nodes: mk(c.nodes * 16, 1), tf: mk(SLOTS * TF, 1), index: mk(c.index, 1), attrs: mk(c.verts * VERT, VERT) };
    this.F = { nodes: new Float32Array(A.nodes.array.buffer), tf: new Float32Array(A.tf.array.buffer), attrs: new Float32Array(A.attrs.array.buffer) };
    M.identity(); this.F.tf.set(M.elements, 0); this.F.tf.set(M.elements, 16); A.tf.array[32] = 1;   // the still block stands where it was made
    const st = {
      nodes: storage(A.nodes, bvhNodeStruct).toReadOnly().setName('bvh_nodes'), transforms: storage(A.tf, transformStruct).toReadOnly().setName('bvh_transforms'),
      index: storage(A.index, 'uint').toReadOnly().setName('bvh_index'), attributes: storage(A.attrs, CORNER).toReadOnly().setName('bvh_attributes'),
    };
    // three-mesh-bvh's walk through the two trees, reading these lists
    const like = { storage: st, getShapecastFn(o) { return getShapecastFn(this, o); } }, first = getRaycastFirstHitFn(like), any = getRaycastAnyHitFn(like);
    // what a ray hit: its facing and how far, its colour and its place in the glow table (all nothing on a miss)
    const hit = wgslTagFn/* wgsl */`
      fn gsTraceHit( ro: vec3f, rd: vec3f, far: f32 ) -> mat4x4f {
        var ray: ${ rayStruct };
        ray.origin = ro; ray.direction = rd; ray.maxDist = far;
        var hit: ${ rayIntersectionResultStruct };
        let did = ${ first }( ray, &hit );
        if ( !did ) { return mat4x4f( vec4f( 0.0 ), vec4f( 0.0 ), vec4f( 0.0 ), vec4f( 0.0 ) ); }
        let a = ${ st.attributes }[ hit.indices.x ].normal;
        let b = ${ st.attributes }[ hit.indices.y ].normal;
        let c = ${ st.attributes }[ hit.indices.z ].normal;
        let w = hit.barycoord;
        let toLocal = ${ st.transforms }[ hit.objectIndex ].inverseMatrixWorld;
        var n = ( transpose( toLocal ) * vec4f( a.xyz * w.x + b.xyz * w.y + c.xyz * w.z, 0.0 ) ).xyz;
        if ( dot( n, n ) < 1e-8 ) { n = hit.normal; }
        n = normalize( n );
        if ( dot( n, rd ) > 0.0 ) { n = -n; }
        let la = u32( a.w ); let lb = u32( b.w ); let lc = u32( c.w );
        let ca = vec3f( f32( la & 31u ) / 31.0, f32( ( la >> 5u ) & 63u ) / 63.0, f32( ( la >> 11u ) & 31u ) / 31.0 );
        let cb = vec3f( f32( lb & 31u ) / 31.0, f32( ( lb >> 5u ) & 63u ) / 63.0, f32( ( lb >> 11u ) & 31u ) / 31.0 );
        let cc = vec3f( f32( lc & 31u ) / 31.0, f32( ( lc >> 5u ) & 63u ) / 63.0, f32( ( lc >> 11u ) & 31u ) / 31.0 );
        let col = ca * w.x + cb * w.y + cc * w.z;
        return mat4x4f( vec4f( n, hit.dist ), vec4f( col * col, f32( la >> 16u ) ), vec4f( hit.normal, 1.0 ), vec4f( 0.0 ) );
      }
    `;
    // is the way to a light clear? (1: yes)
    const clear = wgslTagFn/* wgsl */`
      fn gsTraceClear( ro: vec3f, rd: vec3f, far: f32 ) -> f32 {
        var ray: ${ rayStruct };
        ray.origin = ro; ray.direction = rd; ray.maxDist = far;
        if ( ${ any }( ray ) ) { return 0.0; }
        return 1.0;
      }
    `;
    this.S = { ...st, hit, clear };
    this.gen++; this.trial = 6; this.info.lists = this.gen; this.info.mb = +((A.nodes.array.byteLength + A.index.array.byteLength + A.attrs.array.byteLength) / 1048576).toFixed(1);
    return true;
  }
  /**
   * Once a frame, before the view is drawn (its matrices up to date). lights(list): what lights a hit
   * (hd3d.js traceLights), from the scene's lights. Returns whether the level can be traced this frame.
   */
  frame(now, lights) {
    if (this.failed || this.dead) return false;
    const lv = this.level, f = this.n++;
    try {
      if (f === 0 || f % (lv.n < 4 ? 6 : SCAN) === 0) { lv.scan(this.scene); this.marks(); this.info.other = lv.other; }
      if (!this.S) {
        // room for what the first look found, as much of it as the budgets let in (a tree has four or five nodes to ten triangles)
        let st = 0, sv = 0, mt = 0, mv = 0;
        for (const r of lv.recs.values()) { const g = r.g, t = (g.index ? g.index.count : g.attributes.position.count) / 3, c = g.attributes.position.count; if (r.moving) { mt += t; mv += c; } else { st += t; sv += c; } }
        const ks = Math.min(1, lv.budget * 1.05 / Math.max(1, st)), km = Math.min(1, lv.moverTris / Math.max(1, mt)), tris = st * ks + mt * km;
        this.alloc(TLAS + Math.ceil(tris * .5) + 64, Math.ceil(tris) * 3, Math.ceil(sv * ks + mv * km)); this.full();
      }
      if (!this.busy) {
        // (a level whose still things keep changing is made again less and less often: 1.5 s apart, then 3, 6... 24)
        const still = lv.dirtyStill && lv.calm >= 1 && now - this.builtAt >= (this.info.builds ? this.gap : 0);
        if (still) this.gap = now - this.builtAt < this.gap * 4 ? Math.min(this.gap * 2, GAP * 16) : GAP;
        if (still || lv.dirtyMovers) this.go(still);
      }
      this.movers(); this.boxes(); this.glows(); this.lights(lights(lv.lights)); this.info.busy = this.busy || lv.dirtyStill || lv.dirtyMovers;
    } catch (e) { this.fail(e); return false; }
    return true;
  }
  /**
   * The first frames after the chip's lists are made: the chain draws them inside this, and a shader the
   * chip's driver won't take stops the tracing (the view goes back to screen-space reflections).
   */
  tried(draw) {
    const dev = this.trial > 0 ? this.r.backend?.device : null; if (!dev?.pushErrorScope) return draw();
    this.trial--; dev.pushErrorScope('validation');
    try { return draw(); } finally { dev.popErrorScope().then(e => { if (e && !this.dead && !this.failed) this.fail(e); }, () => {}); }
  }
  fail(e) { this.failed = true; console.warn('[gs] ray traced reflections stopped: ' + (e?.message || e)); for (const r of this.level.recs.values()) r.o.userData.gsTraced = false; }
  // the stand-ins the renderer draws for some meshes take their mesh's mark; and what in the scene the
  // level doesn't hold (rays look for those along the screen): a short list, or looseAll when there are many
  marks() {
    this.twins?.((o, t) => { if (t) t.userData.gsTraced = o.userData.gsTraced === true; });
    const lv = this.level, L = this.loose; L.length = 0; this.looseAll = lv.other > lv.others.length;
    for (const o of lv.others) L.push(o);
    for (const r of lv.recs.values()) if (!r.at) { if (L.length >= 64) { this.looseAll = true; break; } L.push(r.o); }
  }
  // boxes round what the level leaves out, where it is this frame (things near each other share one)
  boxes() {
    const U = this.U; let n = 0;
    if (this.looseAll) { BX[0][0] = BX[0][1] = BX[0][2] = -1e9; BX[0][3] = BX[0][4] = BX[0][5] = 1e9; n = 1; }
    else for (const o of this.loose) {
      if (!shown(o, this.scene)) continue;
      let sp = o.isInstancedMesh ? o.boundingSphere : null;
      if (!sp) { if (o.isInstancedMesh && o.computeBoundingSphere) { o.computeBoundingSphere(); sp = o.boundingSphere; } else { const g = o.geometry; if (!g) continue; if (!g.boundingSphere) g.computeBoundingSphere(); sp = g.boundingSphere; } }
      if (!sp || !(sp.radius >= 0)) continue;
      const e = o.matrixWorld.elements, sc = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
      V3.copy(sp.center).applyMatrix4(o.matrixWorld); const r = sp.radius * sc * (o.isSkinnedMesh ? 1.4 : 1.05) + .05;   // (a skinned thing's sphere is its rest pose's: room for its limbs)
      // into a box it touches, else a new one, else the nearest
      let at = -1, bd = Infinity;
      for (let i = 0; i < n; i++) { const b = BX[i], dx = Math.max(b[0] - V3.x, 0, V3.x - b[3]), dy = Math.max(b[1] - V3.y, 0, V3.y - b[4]), dz = Math.max(b[2] - V3.z, 0, V3.z - b[5]), d = Math.hypot(dx, dy, dz) - r; if (d < bd) { bd = d; at = i; } }
      if (at < 0 || (bd > 0 && n < BOXES)) { const b = BX[n++]; b[0] = V3.x - r; b[1] = V3.y - r; b[2] = V3.z - r; b[3] = V3.x + r; b[4] = V3.y + r; b[5] = V3.z + r; }
      else { const b = BX[at]; b[0] = Math.min(b[0], V3.x - r); b[1] = Math.min(b[1], V3.y - r); b[2] = Math.min(b[2], V3.z - r); b[3] = Math.max(b[3], V3.x + r); b[4] = Math.max(b[4], V3.y + r); b[5] = Math.max(b[5], V3.z + r); }
    }
    U.nb.value = n;
    for (let i = 0; i < n; i++) { const b = BX[i]; U.bMin.array[i].set(b[0], b[1], b[2], 0); U.bMax.array[i].set(b[3], b[4], b[5], 0); }
  }
  // the blocks made again, in the background, for what the last look found changed
  go(still) {
    const plan = this.level.build({ still, have: k => this.shapes.has(k) }), t0 = performance.now(), jobs = [];
    if (plan.still) jobs.push(plan.still);
    for (const s of plan.movers) if (s.job) jobs.push(s.job);
    if (!jobs.length) { this.install(plan, plan.still === null ? { tris: 0, left: [] } : undefined); return; }
    this.busy = true;
    Promise.all(jobs.map(runBlock)).then(res => {
      if (this.dead || this.failed) return;
      let i = 0; const st = plan.still ? res[i++] : plan.still === null ? { tris: 0, left: [] } : undefined;
      for (const s of plan.movers) if (s.job) s.block = res[i++];
      this.install(plan, st); this.info.ms = Math.round(performance.now() - t0); this.info.builds++; if (st) this.builtAt = performance.now();
    }).catch(e => { if (!this.dead) this.fail(e); }).finally(() => { this.busy = false; });
  }
  // the new blocks onto the chip's lists: the still block first (it stays where it is when it wasn't made
  // again), then each moving shape's, and the moving things given their places
  install(plan, st) {
    const lv = this.level, shapes = new Map();
    for (const s of plan.movers) { const b = s.block || this.shapes.get(s.key); if (b?.tris) shapes.set(s.key, b); }
    this.shapes = shapes;
    const still = st === undefined ? this.still : st.tris ? { nodes: st.nodes.length / 16, tris: st.tris, verts: st.verts, box: st.box, was: st.was } : null;
    let nn = TLAS + (still?.nodes || 0), ni = (still?.tris || 0) * 3, nv = still?.verts || 0, mt = 0, mw = 0;
    for (const b of shapes.values()) { nn += b.nodes.length / 16; ni += b.index.length; nv += b.verts; mt += b.tris; mw += b.was; }
    const old = this.A, oldF = this.F;
    const grew = this.alloc(nn, ni, nv), A = this.A, F = this.F;
    if (st === undefined) {
      if (grew && still) { A.nodes.array.set(old.nodes.array.subarray(TLAS * 16, (TLAS + still.nodes) * 16), TLAS * 16); A.index.array.set(old.index.array.subarray(0, still.tris * 3)); F.attrs.set(oldF.attrs.subarray(0, still.verts * VERT)); }
    } else if (st.tris) { A.nodes.array.set(st.nodes, TLAS * 16); A.index.array.set(st.index); F.attrs.set(st.attrs); }
    if (grew && old) for (const k in old) old[k].dispose();
    this.still = still;
    let on = TLAS + (still?.nodes || 0), oi = (still?.tris || 0) * 3, ov = still?.verts || 0;
    for (const b of shapes.values()) {
      // a block's leaves count triangles from its own first, its triangles corners from its own first: moved to where it now lies
      const N = A.nodes.array, at = on * 16, tri = oi / 3; N.set(b.nodes, at);
      for (let w = at; w < at + b.nodes.length; w += 16) if (N[w + 13] >>> 16 === 0xFFFF) N[w + 12] += tri;
      const I = A.index.array, src = b.index; for (let i = 0; i < src.length; i++) I[oi + i] = src[i] + ov;
      F.attrs.set(b.attrs, ov * VERT);
      b.node = on; on += b.nodes.length / 16; oi += src.length; ov += b.verts;
    }
    // the moving things' places
    this.inst = []; let slot = 1;
    for (const s of plan.movers) { const b = shapes.get(s.key); for (const r of s.recs) { if (b && slot < SLOTS) this.inst.push(r.at = { r, o: r.o, b, node: 0, slot: slot++, m: new Float64Array(16), vis: -1, box: [0, 0, 0, 0, 0, 0] }); else r.at = null; } }
    // which meshes the level now holds (the rest are found on the screen)
    if (st !== undefined) { const out = new Set((st.left || []).map(k => plan.owners[k])); for (const r of plan.owners) r.at = out.has(r) ? null : 'still'; this.info.left = out.size; }
    for (const r of plan.left) r.at = null;
    for (const r of lv.recs.values()) r.o.userData.gsTraced = !!r.at;
    this.marks(); this.full(); this.moved = true;
    Object.assign(this.info, { tris: (still?.tris || 0) + mt, was: (still?.was || 0) + mw, things: lv.recs.size, movers: this.inst.length });
  }
  // everything on the chip's lists is sent again
  full() { const A = this.A; for (const k of ['nodes', 'index', 'attrs', 'tf']) { A[k].clearUpdateRanges(); A[k].needsUpdate = true; } this.fullAt = this.n; }
  // the moving things: where each stands now, and the tree over the blocks made again when one has moved
  movers() {
    let moved = this.moved; this.moved = false;
    const F = this.F.tf, U = this.A.tf.array;
    for (const it of this.inst) {
      const o = it.o, e = ownMatrix(o.matrixWorld.elements), vis = shown(o, this.scene) ? 1 : 0;
      if (vis === it.vis && (!vis || same(it.m, e))) continue;
      it.m.set(e); moved = true;
      const at = it.slot * TF; M.fromArray(e); const det = M.determinant();
      it.vis = vis; it.node = it.b.node;
      F.set(e, at); M.invert(); F.set(M.elements, at + 16); U[at + 32] = vis && Math.abs(det) > 1e-12 ? 1 : 0;
      // its box in the world
      const b = it.b.box, cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2, hx = (b[3] - b[0]) / 2, hy = (b[4] - b[1]) / 2, hz = (b[5] - b[2]) / 2, B = it.box;
      for (let a = 0; a < 3; a++) {
        const c = e[a] * cx + e[4 + a] * cy + e[8 + a] * cz + e[12 + a], h = Math.abs(e[a]) * hx + Math.abs(e[4 + a]) * hy + Math.abs(e[8 + a]) * hz;
        B[a] = c - h; B[a + 3] = c + h;
      }
    }
    if (!moved) return;
    this.A.tf.needsUpdate = true; this.tlas();
  }
  // the tree over the blocks, written at the head of the node list in the library's packed form: a node
  // holds its two children's boxes; a leaf says which block's tree to go on into, and by which place
  tlas() {
    const L = this.leaves; L.length = 0;
    if (this.still) L.push({ box: this.still.box, node: TLAS, slot: 0 });
    for (const it of this.inst) if (it.vis && this.A.tf.array[it.slot * TF + 32]) L.push(it);
    const U = this.A.nodes.array, F = this.F.nodes; let n = 0;
    const none = at => { F[at] = F[at + 1] = F[at + 2] = FAR_BOX; F[at + 3] = F[at + 4] = F[at + 5] = FAR_BOX; };   // (a box no ray reaches)
    const bounds = (lo, hi, at) => {
      let a = Infinity, b = Infinity, c = Infinity, d = -Infinity, e = -Infinity, f = -Infinity;
      for (let i = lo; i < hi; i++) { const x = L[i].box; if (x[0] < a) a = x[0]; if (x[1] < b) b = x[1]; if (x[2] < c) c = x[2]; if (x[3] > d) d = x[3]; if (x[4] > e) e = x[4]; if (x[5] > f) f = x[5]; }
      F[at] = a; F[at + 1] = b; F[at + 2] = c; F[at + 3] = d; F[at + 4] = e; F[at + 5] = f;
    };
    const leaf = x => { const w = n++ * 16; U[w + 12] = x.node; U[w + 13] = (0xFF000000 | x.slot) >>> 0; };
    const node = (lo, hi) => {
      if (hi - lo === 1) { leaf(L[lo]); return; }
      const i = n++, w = i * 16;
      // split across the longest side of the boxes' middles, the lower half first
      let ax = 0, best = -1;
      for (let a = 0; a < 3; a++) { let mn = Infinity, mx = -Infinity; for (let k = lo; k < hi; k++) { const c = L[k].box[a] + L[k].box[a + 3]; if (c < mn) mn = c; if (c > mx) mx = c; } if (mx - mn > best) { best = mx - mn; ax = a; } }
      const part = L.slice(lo, hi).sort((p, q) => (p.box[ax] + p.box[ax + 3]) - (q.box[ax] + q.box[ax + 3])); for (let k = lo; k < hi; k++) L[k] = part[k - lo];
      const mid = (lo + hi) >> 1;
      bounds(lo, mid, w); bounds(mid, hi, w + 6);
      node(lo, mid); const right = n; node(mid, hi);
      U[w + 12] = right - i; U[w + 13] = ax;
    };
    if (L.length < 2) {
      // none or one: a root whose other side is nowhere
      n = 1; none(0); none(6); U[12] = 1; U[13] = 0;
      if (L.length) { bounds(0, 1, 0); leaf(L[0]); } else { U[16 + 12] = 0; U[16 + 13] = 0; none(16); none(22); n = 2; }
    } else node(0, L.length);
    const A = this.A.nodes;
    // (while everything is on its way to the chip, the tree goes with it; afterwards only the tree is sent)
    if (this.n - this.fullAt > 2) A.addUpdateRange(0, n * 16); else { A.clearUpdateRanges(); this.fullAt = Math.max(this.fullAt, this.n - 1); }
    A.needsUpdate = true;
  }
  // the glow table: each glowing material's light as it is now
  glows() {
    const g = this.level.glows, d = this.pal.image.data; let ch = false;
    for (let i = 1; i < g.length; i++) {
      const c = glowOf(g[i], GLOW);
      for (let k = 0; k < 3; k++) { const h = DataUtils.toHalfFloat(c ? Math.min(c[k], 6e4) : 0); if (d[i * 4 + k] !== h) { d[i * 4 + k] = h; ch = true; } }
    }
    if (ch) this.pal.needsUpdate = true;
  }
  lights(m) {
    const U = this.U; if (!m) return;
    U.far.value = m.far;
    U.sunDir.value.copy(m.sunDir); U.sunCol.value.copy(m.sunCol); U.sky.value.copy(m.sky); U.ground.value.copy(m.ground); U.envI.value = m.envI;
    U.fogCol.value.copy(m.fogCol); U.fogK.value = m.fogK; U.nl.value = m.lamps.length;
    for (let i = 0; i < m.lamps.length; i++) { const l = m.lamps[i]; U.lPos.array[i].copy(l.p); U.lCol.array[i].copy(l.c); U.lDir.array[i].copy(l.d); U.lCone.array[i].copy(l.k); }
  }
  dispose() {
    this.dead = true;
    if (this.A) for (const k in this.A) this.A[k].dispose();
    this.pal.dispose(); this.A = this.S = this.F = null;
    for (const r of this.level.recs.values()) r.o.userData.gsTraced = false;
    this.marks();
  }
}

/* ---------- the scene pass's extra picture ---------- */
// What each pixel's surface reflects: rgb its mirror colour (nothing unless the game marked the thing shiny;
// negative for a material with surroundings of its own, v.room()), alpha how smooth it is (1/64 and up),
// negative where the thing drawn is not in the traced level (rays find those on the screen instead).
const SHINY = uniform(0).onObjectUpdate(({ object }) => (object?.userData?.gsReflect ? 1 : 0));
const HELD = uniform(-1).onObjectUpdate(({ object }) => (object?.userData?.gsTraced === true || object?.userData?.noTrace ? 1 : -1));   // (a thing kept out of reflections, noTrace, is not looked for on the screen either)
/** The extra picture's value for a material (name the picture gsRefl). */
export function tracedMRT(m) {
  if (!m.isMeshStandardMaterial && !m.isMeshStandardNodeMaterial) return vec4(0, 0, 0, HELD);
  return vec4(specularColorBlended.mul(SHINY).mul(m.envNode ? -1 : 1), float(1 + 1 / 64).sub(clamp(roughness, 0, 1)).mul(HELD));
}

/* ---------- the stage in the chain ---------- */
const VOGEL = Array.from({ length: 6 }, (_, i) => { const r = Math.sqrt((i + .5) / 6), a = i * 2.399963; return [r * Math.cos(a), r * Math.sin(a)]; });
/** The scene's colour with the traced reflections laid over it (a picture node). tr: the view's Tracer. */
export function traceStage(ch, sp, colT, tr) {
  const U = ch.trU = {
    invProj: uniform(new Matrix4()), proj: uniform(new Matrix4()), camWorld: uniform(new Matrix4()), view: uniform(new Matrix4()), camPos: uniform(new Vector3()),
    half: uniform(new Vector2(1, 1)), nf: uniform(new Vector2(.05, 120)), focal: uniform(1),
  };
  const L = tr.U, S = tr.S, dT = sp.getTextureNode('depth'), nT = ch.nrmN, R = sp.getTextureNode('gsRefl'), C = colT;
  const pal = texture(tr.pal);
  const zAt = q => perspectiveDepthToViewZ(dT.sample(q).r, U.nf.x, U.nf.y);   // (negative in front of the camera)
  const toUV = pv => { const c = U.proj.mul(vec4(pv, 1)), n = c.xy.div(c.w); return vec2(n.x.mul(.5).add(.5), n.y.mul(-.5).add(.5)); };
  const off = q => q.x.lessThan(0).or(q.x.greaterThan(1)).or(q.y.lessThan(0)).or(q.y.greaterThan(1));
  const envAt = (dir, rough) => { const n = pmremTexture(ch.scene.environment, dir, rough); (ch.trEnvs ||= []).push(n); return n.rgb.mul(L.envI); };
  // a hit the camera can't see, lit simply: the sun (through a shadow ray), the sky's light, the nearest lamps, its own glow;
  // polished metal shows the sky and room around it in its colour instead (look: its place in the glow table, +128 for metal)
  const shade = (P, n, alb, look, rd) => {
    const metal = look.greaterThan(127.5), glow = look.sub(select(metal, float(128), float(0)));
    const lit = vec3(0).toVar();
    const ndl = max(dot(n, L.sunDir), 0);
    If(ndl.mul(L.sunCol.r.add(L.sunCol.g).add(L.sunCol.b)).greaterThan(1e-3), () => { lit.addAssign(L.sunCol.mul(ndl.mul(S.clear(P.add(n.mul(.03)).add(ORG), L.sunDir, L.far)))); });
    lit.addAssign(mix(L.ground, L.sky, n.y.mul(.5).add(.5)));
    Loop({ start: 0, end: LAMPS }, ({ i }) => {
      If(float(i).greaterThanEqual(L.nl), () => { Break(); });
      const lp = L.lPos.element(i), lc = L.lCol.element(i), ld = L.lDir.element(i), k = L.lCone.element(i);
      const v = lp.xyz.sub(P), dd = max(dot(v, v), 1e-4), dl = sqrt(dd), dir = v.div(dl), nl = max(dot(n, dir), 0);
      // three's falloff: 1 / d^decay, fading to nothing at the lamp's range; a spot's cone
      const cut = select(lp.w.greaterThan(0), pow(clamp(float(1).sub(pow(dl.div(max(lp.w, 1e-3)), 4)), 0, 1), 2), float(1));
      const cone = select(k.z.greaterThan(.5), smoothstep(k.x, k.y, dot(dir.negate(), ld.xyz)), float(1));
      lit.addAssign(lc.xyz.mul(nl.mul(cut).mul(cone).div(max(pow(dl, lc.w), .01))));
    });
    const col = alb.mul(select(metal, envAt(reflect(rd, n), float(.3)), lit.mul(1 / Math.PI).add(envAt(n, float(1))))).add(pal.load(ivec2(int(glow.add(.5)), int(0))).rgb).toVar();
    // the scene's fog, by how far the spot is from the camera
    const fd = length(P.sub(U.camPos)).mul(L.fogK);
    return mix(L.fogCol, col, exp(fd.mul(fd).negate()));
  };
  // tests (HD.traceShow): the traced level itself, as rays from the camera find it, lit as a hit the camera can't see is
  if (tr.show) {
    ch.trH = null;
    return ch.trT = rtt(Fn(() => {
      const q = uv(), ndc = vec2(q.x.mul(2).sub(1), q.y.oneMinus().mul(2).sub(1)), a = U.invProj.mul(vec4(ndc, 0, 1)), b = U.invProj.mul(vec4(ndc, 1, 1));
      const rd = normalize(U.camWorld.mul(vec4(b.xyz.div(b.w).sub(a.xyz.div(a.w)), 0)).xyz).toVar(), ro = U.camPos;
      const H = S.hit(ro.add(ORG), rd, L.far).toVar(), hn = H.element(int(0)), hl = H.element(int(1)), out = vec3(.02, .04, .1).toVar();
      If(H.element(int(2)).w.greaterThan(.5), () => { out.assign(shade(ro.add(rd.mul(hn.w)), hn.xyz, hl.xyz, hl.w, rd)); });
      return vec4(out, 1);
    })(), 1, 1, HALF);
  }
  // half size: a ray from each shiny pixel. rgb what it found, a how far along (-1: nothing: the sky; 0: no ray)
  const rays = ch.trH = rtt(Fn(() => {
    const q = uv(), r4 = R.sample(q), out = vec4(0).toVar(), f0 = abs(r4.rgb), smooth = abs(r4.a);
    If(f0.r.add(f0.g).add(f0.b).greaterThan(1e-3).and(smooth.greaterThan(1 + 1 / 64 - ROUGH_MAX)), () => {
      const vp = getViewPosition(q, dT.sample(q).r, U.invProj).toVar(), nv = normalize(nT.sample(q)).toVar();
      const wp = U.camWorld.mul(vec4(vp, 1)).xyz.toVar(), nw = normalize(U.camWorld.mul(vec4(nv, 0)).xyz).toVar();
      const rd = normalize(reflect(normalize(wp.sub(U.camPos)), nw)).toVar(), lift = max(float(.004), length(vp).mul(.0025)), ro = wp.add(nw.mul(lift)).toVar();
      const H = S.hit(ro.add(ORG), rd, L.far).toVar(), hn = H.element(int(0)), hl = H.element(int(1)), did = H.element(int(2)).w.greaterThan(.5);
      const t = select(did, hn.w, L.far).toVar(), col = vec3(0).toVar(), got = float(0).toVar();
      // what the level leaves out (people, copies, see-through things): where the ray crosses a box round some
      // of it, a short march over the screen, as screen-space reflections find things
      If(L.nb.greaterThan(.5), () => {
        const inv = vec3(1).div(select(abs(rd).lessThan(1e-6), vec3(1e-6), rd)), s0 = float(1e9).toVar(), s1 = float(-1).toVar();
        Loop({ start: 0, end: BOXES }, ({ i }) => {
          If(float(i).greaterThanEqual(L.nb), () => { Break(); });
          const a = L.bMin.element(i).xyz.sub(ro).mul(inv), b = L.bMax.element(i).xyz.sub(ro).mul(inv), lo = min(a, b), hi = max(a, b);
          const en = max(max(lo.x, lo.y), max(lo.z, 0)), ex = min(min(hi.x, hi.y), hi.z);
          If(ex.greaterThan(en), () => { s0.assign(min(s0, en)); s1.assign(max(s1, ex)); });
        });
        const rv = U.view.mul(vec4(rd, 0)).xyz.toVar(), p0 = vp.add(nv.mul(lift)).toVar();
        // (no further than what the ray hit, 40 m, or the camera's own plane)
        s1.assign(min(min(s1, min(t, 40)), select(rv.z.greaterThan(1e-4), U.nf.x.negate().sub(p0.z).div(rv.z), float(1e9))));
        If(s1.greaterThan(s0), () => {
          const ds = s1.sub(s0).div(STEPS), jit = interleavedGradientNoise(screenCoordinate.xy), thick = max(float(.15), ds.mul(1.5));
          Loop({ start: 0, end: STEPS }, ({ i }) => {
            const s = s0.add(ds.mul(float(i).add(jit))).toVar(), p = p0.add(rv.mul(s)), suv = toUV(p).toVar();
            If(off(suv), () => { Break(); });
            const dz = zAt(suv).sub(p.z);   // more than nothing: the ray has gone behind what the camera sees there
            If(dz.greaterThan(.02).and(dz.lessThan(thick)), () => {
              If(R.sample(suv).a.lessThan(0), () => {
                // back toward the step before, to the thing's front
                const lo = s.sub(ds).toVar(), hi = s.toVar();
                Loop({ start: 0, end: 3 }, () => { const mid = lo.add(hi).mul(.5), pm = p0.add(rv.mul(mid)); If(zAt(toUV(pm)).greaterThan(pm.z), () => { hi.assign(mid); }).Else(() => { lo.assign(mid); }); });
                const fuv = toUV(p0.add(rv.mul(hi)));
                If(R.sample(fuv).a.lessThan(0), () => { suv.assign(fuv); s.assign(hi); });
                col.assign(C.sample(suv).rgb); got.assign(1); t.assign(max(s, 1e-3)); Break();
              });
            });
          });
        });
      });
      If(got.lessThan(.5).and(did), () => {
        const P = ro.add(rd.mul(t)).toVar(), pv = U.view.mul(vec4(P, 1)).xyz.toVar(), s = toUV(pv).toVar();
        // the spot is on screen and nothing stands in front of it there: its colour is in the picture already
        const seen = off(s).not().and(pv.z.lessThan(0)).and(abs(zAt(s).sub(pv.z)).lessThan(abs(pv.z).mul(.02).add(.04)));
        const w = select(seen, smoothstep(0, .04, min(min(s.x, s.y), min(s.x.oneMinus(), s.y.oneMinus()))), float(0)).toVar();
        const own = vec3(0).toVar();
        If(w.lessThan(.999), () => { own.assign(shade(P, hn.xyz, hl.xyz, hl.w, rd)); });
        col.assign(mix(own, C.sample(s).rgb, w)); got.assign(1);
      });
      out.assign(vec4(col, select(got.greaterThan(.5), max(t, 1e-3), float(-1))));
    });
    return out;
  })(), 1, 1, HALF);
  // full size: the rays' picture laid over the scene's
  return ch.trT = rtt(Fn(() => {
    const q = uv(), c = C.sample(q), r4 = R.sample(q), out = vec3(c.rgb).toVar(), f0 = abs(r4.rgb), smooth = abs(r4.a);
    If(f0.r.add(f0.g).add(f0.b).greaterThan(1e-3).and(smooth.greaterThan(1 + 1 / 64 - ROUGH_MAX)), () => {
      const rough = clamp(float(1 + 1 / 64).sub(smooth), 0, 1), zc = zAt(q);
      const vp = getViewPosition(q, dT.sample(q).r, U.invProj), nv = normalize(nT.sample(q)), vd = normalize(vp).negate(), nov = clamp(dot(nv, vd), 0, 1);
      const acc = vec3(0).toVar(), cov = float(0).toVar(), ws = float(0).toVar(), top = ivec2(U.half).sub(1);
      // a traced pixel counts by how near its surface is to this one's (a ray from the wall behind says nothing about the floor)
      const tap = (px, w0) => {
        const p = clamp(px, ivec2(0), top), s = rays.load(p), z = zAt(vec2(p).add(.5).div(U.half));
        const w = w0.mul(max(float(1).sub(abs(z.sub(zc)).div(abs(zc).mul(.04).add(.03))), .002)).mul(select(s.a.equal(0), float(0), float(1)));
        acc.addAssign(s.rgb.mul(w.mul(select(s.a.greaterThan(0), float(1), float(0))))); cov.addAssign(w.mul(select(s.a.greaterThan(0), float(1), float(0)))); ws.addAssign(w);
      };
      // the four nearest
      const hp = q.mul(U.half).sub(.5), b = floor(hp), fr = hp.sub(b), bi = ivec2(b);
      tap(bi, fr.x.oneMinus().mul(fr.y.oneMinus())); tap(bi.add(ivec2(1, 0)), fr.x.mul(fr.y.oneMinus())); tap(bi.add(ivec2(0, 1)), fr.x.oneMinus().mul(fr.y)); tap(bi.add(ivec2(1, 1)), fr.x.mul(fr.y));
      // a rough surface: more from around, over a circle as wide as its blur is at the reflected thing's distance
      If(rough.greaterThan(.07), () => {
        const tn = rays.load(clamp(ivec2(hp.add(.5)), ivec2(0), top)).a, th = select(tn.greaterThan(0), tn, L.far), dist = length(vp);
        const rad = clamp(rough.mul(rough).mul(1.3).mul(th.div(th.add(dist))).mul(U.focal), 1, 14), ang = interleavedGradientNoise(screenCoordinate.xy).mul(6.2832), cs = cos(ang), sn = sin(ang);
        for (const [x, y] of VOGEL) tap(ivec2(floor(hp.add(.5).add(vec2(cs.mul(x).sub(sn.mul(y)), sn.mul(x).add(cs.mul(y))).mul(rad)))), float(.6));
      });
      const k = float(1).div(max(ws, 1e-4)), fab = DFGLUT({ roughness: rough, dotNV: nov }), W = f0.mul(fab.x).add(fab.y);
      // what the material drew there already: its surroundings along the mirror direction (as three.js reads them)
      const rv = normalize(mix(reflect(vd.negate(), nv), nv, rough.mul(rough).mul(rough).mul(rough))), own = r4.r.add(r4.g).add(r4.b).lessThan(0);
      const sky = select(own, vec3(0), envAt(normalize(U.camWorld.mul(vec4(rv, 0)).xyz), rough));
      const fade = smoothstep(ROUGH_MAX, ROUGH_FADE, rough).mul(select(own, float(.6), float(1)));
      out.addAssign(W.mul(acc.mul(k).sub(sky.mul(cov.mul(k)))).mul(fade));
    });
    return vec4(max(out, 0), c.a);
  })(), 1, 1, HALF);
}
/** This frame's sizes and camera for the stage (w x h: the scene's picture; scale: the rays' share of it). */
export function traceFrame(ch, w, h, scale) {
  if (!ch.trT) return;
  ch.trT.renderTarget.gsPart = 'reflections'; if (ch.trH) ch.trH.renderTarget.gsPart = 'reflections';   // (hd3d.js gpuTime: the chip's time by pass)
  const U = ch.trU, cam = ch.cam, hw = Math.max(4, Math.round(w * scale)), hh = Math.max(4, Math.round(h * scale));
  ch.trT.setSize(w, h); ch.trH?.setSize(hw, hh); U.half.value.set(hw, hh);
  U.invProj.value.copy(cam.projectionMatrixInverse); U.proj.value.copy(cam.projectionMatrix); U.camWorld.value.copy(cam.matrixWorld); U.view.value.copy(cam.matrixWorld).invert();
  cam.getWorldPosition(U.camPos.value); U.nf.value.set(cam.near, cam.far); U.focal.value = cam.projectionMatrix.elements[5] * hh / 2;
  const e = ch.scene.environment; if (e) for (const n of ch.trEnvs || []) if (n.value !== e) n.value = e;
}
export function traceDispose(ch) { ch.trH?.renderTarget?.dispose(); ch.trT?.renderTarget?.dispose(); ch.trH = ch.trT = ch.trU = ch.trEnvs = null; }
