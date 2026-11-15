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
import { DataTexture, DataUtils, RGBAFormat, HalfFloatType, NearestFilter, Matrix4, Vector2, Vector3, Vector4, Color, StorageBufferAttribute, StructTypeNode, Node, NodeMaterial, QuadMesh, RendererUtils, RenderTarget } from 'three/webgpu';
import {
  storage, uniform, uniformArray, uv, rtt, Fn, vec2, vec3, vec4, float, int, ivec2, mix, max, min, abs, dot, reflect, normalize, length, clamp, exp, pow, sqrt, floor, sin, cos,
  If, Loop, Break, select, smoothstep, texture, getViewPosition, interleavedGradientNoise, screenCoordinate, pmremTexture, DFGLUT, perspectiveDepthToViewZ, roughness, specularColorBlended,
  NodeUpdateType, passTexture, context, property, outputStruct, cross, fract,
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
// Ray Regeneration: smoother than ROUGH_SHARP a surface is a mirror (one direction); LOBE_KEEP: the share of a rough
// surface's cone of directions that rays are sent into (all but its far tail, whose few rays are mostly bright
// specks; with only the middle half, reflections came out too strong: half the light comes from outside it);
// REGEN_TAPS: this frame's rays round a pixel that count for it
const ROUGH_SHARP = .07;
let LOBE_KEEP = .95;
// A surface only a little rougher than a mirror (ROUGH_SHARP to CONE_FULL: a polished floor) has a narrow cone: a
// few pixels' blur, with no room in it for the many rays that smoothing scattered ones takes, and its history is
// short while the camera moves. Scattered, its rays came out as grain round every bright thing reflected (first
// seen on a phone, whose chip put a floor polished to exactly ROUGH_SHARP on the rough side of it; a software
// renderer puts it on the mirror's). So its rays go nearly straight, as a mirror's (the share of the cone they are
// scattered over, coneOf, grows from none at ROUGH_SHARP to all of it at CONE_FULL), and the blur they leave out is
// made by sharing them between pixels over the blur's shape. SHARE_WIDE: the round they are mostly shared over, in
// the radius rays are shared over elsewhere: it holds the middle of the cone, about three rays in five; SHARE_TAIL:
// how much each of REGEN_TAIL's four rays from further out counts (their radii in that same radius): the rest of
// the cone, the wide faint glow round a bright thing in a polished floor. The two are the cone's own shape: a round
// with all the weight in it, however wide, is a soft-edged smudge, not a sharp middle in a faint wide glow;
// SHARE_THIN: how much narrower across the line of sight than the angle it is seen at alone makes it;
// HOLD_STRAIGHT: how far from this frame's shared rays the history may be there, in their own spread (they are
// not noise: what the history holds outside them is what was there before the camera moved);
// STILL_KEEP: the least frames' worth any rough surface keeps while nothing moves (a mirror keeps six: its rays are
// exact; here each frame's are another few of the blur, and six of them shimmer)
let CONE_FULL = .22, SHARE_WIDE = 1.9, SHARE_TAIL = .3, SHARE_THIN = .85, HOLD_STRAIGHT = 1, STILL_KEEP = 32;
const REGEN_TAIL = [[2.6, 0], [3.1, 2.4], [4, 4.8], [5.6, 7.2]].map(([r, a]) => [r * Math.cos(a), r * Math.sin(a)]);
const coneOf = (rough, U) => mix(smoothstep(ROUGH_SHARP, CONE_FULL, rough), float(1), U.ref);   // (the tests' reference: the whole cone)
const REGEN_TAPS = [[0, 0], [1, 0], [0, 1], [1, 1]];
// A rough surface's history. HIST_WIDE, HIST_FINE: how far to either side it is read as well, as a share of the
// surface's blur (while little is known, once the frames have filled in); USUAL: how fast the running
// average that tells stale history moves a frame; KEEP_ROUGH: the most frames' worth kept; KEEP_SLIDE: while the
// camera moves, how far the kept reflection may have slid in all, in blurs of the surface (see where it is used),
// and SLIDE_LEAST: the share of the reflection's whole slide that counts even where it reflects one thing only;
// FILL_KEEPS: how much less a pixel takes from the pixels round it once its own frames have filled in;
// HIST_TURN: the furthest to either side the history is read on a curved surface, as the share of its blur's
// angle that the surface may turn by on the way; HOLD_MOVING: how far outside this frame's rays the history may
// be while the picture moves fast
let HIST_WIDE = .5, HIST_FINE = .1, USUAL = .1, KEEP_ROUGH = 160, KEEP_SLIDE = 1.5, SLIDE_LEAST = .1, FILL_KEEPS = .85, HIST_TURN = .3, HOLD_MOVING = .15;
/**
 * Ray Regeneration's settings above (none of them changes the tests' reference), for scripts/tune.cjs: its search
 * against the reference sets others (o: any of them by name) for the next build of the effects chain. Returns the
 * ones in use. Not on gs: games don't reach it.
 */
export function regenSettings(o) {
  if (o) {
    ({ LOBE_KEEP = LOBE_KEEP, CONE_FULL = CONE_FULL, SHARE_WIDE = SHARE_WIDE, SHARE_TAIL = SHARE_TAIL, SHARE_THIN = SHARE_THIN, HOLD_STRAIGHT = HOLD_STRAIGHT, STILL_KEEP = STILL_KEEP,
      HIST_WIDE = HIST_WIDE, HIST_FINE = HIST_FINE, USUAL = USUAL, KEEP_ROUGH = KEEP_ROUGH, KEEP_SLIDE = KEEP_SLIDE, SLIDE_LEAST = SLIDE_LEAST, FILL_KEEPS = FILL_KEEPS, HIST_TURN = HIST_TURN, HOLD_MOVING = HOLD_MOVING } = o);
  }
  return { LOBE_KEEP, CONE_FULL, SHARE_WIDE, SHARE_TAIL, SHARE_THIN, HOLD_STRAIGHT, STILL_KEEP, HIST_WIDE, HIST_FINE, USUAL, KEEP_ROUGH, KEEP_SLIDE, SLIDE_LEAST, FILL_KEEPS, HIST_TURN, HOLD_MOVING };
}
const REGEN_DISC = Array.from({ length: 4 }, (_, i) => { const r = Math.sqrt((i + .5) / 4), a = i * 2.399963; return [r * Math.cos(a), r * Math.sin(a)]; });
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
    // Ray Regeneration (regenStage below): where this frame's rays start inside their pixels (rj, in the rays' pixels),
    // the turns of their noise, last frame's camera without the upscaler's jitter (prevVP, its inverse, where it stood),
    // this frame's jitter (jn, as a part of the picture) and its change since last frame (jd, the same way: the motion
    // picture includes it), a cut (1), the tests' reference (1)
    rj: uniform(new Vector2()), turn: uniform(new Vector2()), prevVP: uniform(new Matrix4()), prevInv: uniform(new Matrix4()), prevCam: uniform(new Vector3()),
    jn: uniform(new Vector2()), jd: uniform(new Vector2()), cut: uniform(1), ref: uniform(0), size: uniform(new Vector2(1, 1)),
  };
  const regen = !!ch.trRegen && !tr.show;
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
      const q = uv(), ndc = vec2(q.x.mul(2).sub(1), q.y.oneMinus().mul(2).sub(1)), b = U.invProj.mul(vec4(ndc, .5, 1));
      const rd = normalize(U.camWorld.mul(vec4(b.xyz.div(b.w), 0)).xyz).toVar(), ro = U.camPos;   // (the way to a point of this pixel: the same whichever way depth runs)
      const H = S.hit(ro.add(ORG), rd, L.far).toVar(), hn = H.element(int(0)), hl = H.element(int(1)), out = vec3(.02, .04, .1).toVar();
      If(H.element(int(2)).w.greaterThan(.5), () => { out.assign(shade(ro.add(rd.mul(hn.w)), hn.xyz, hl.xyz, hl.w, rd)); });
      return vec4(out, 1);
    })(), 1, 1, HALF);
  }
  // half size: a ray from each shiny pixel. rgb what it found, a how far along (-1: nothing: the sky; 0: no ray)
  const rays = ch.trH = rtt(Fn(() => {
    // (regenerated: each ray starts at another place inside its pixel every frame, so over a few frames every pixel
    // of the picture has had a ray of its own)
    const q = regen ? clamp(uv().add(U.rj.div(U.half)), 0, 1).toVar() : uv(), r4 = R.sample(q), out = vec4(0).toVar(), f0 = abs(r4.rgb), smooth = abs(r4.a);
    If(f0.r.add(f0.g).add(f0.b).greaterThan(1e-3).and(smooth.greaterThan(1 + 1 / 64 - ROUGH_MAX)), () => {
      const vp = getViewPosition(q, dT.sample(q).r, U.invProj).toVar(), nv = normalize(nT.sample(q)).toVar();
      const wp = U.camWorld.mul(vec4(vp, 1)).xyz.toVar(), nw = normalize(U.camWorld.mul(vec4(nv, 0)).xyz).toVar();
      const vdir = normalize(wp.sub(U.camPos)).toVar(), rd = normalize(reflect(vdir, nw)).toVar(), lift = max(float(.004), length(vp).mul(.0025)), ro = wp.add(nw.mul(lift)).toVar();
      if (regen) {
        // a rough surface reflects a cone of directions, not one: each frame's ray takes one of them (the facets the
        // camera can see, by how many face each way: Heitz's sampling of GGX's visible normals), and the frames
        // together are the blurred reflection, sharp where the reflected thing touches the surface and softer the
        // further off it is, with no blurring of the picture (a surface only a little rougher than a mirror: over
        // a part of its cone only, see CONE_FULL)
        const rough = clamp(float(1 + 1 / 64).sub(smooth), 0, 1);
        If(rough.greaterThan(ROUGH_SHARP), () => {
          const al = rough.mul(rough).mul(coneOf(rough, U)), n1 = interleavedGradientNoise(screenCoordinate.xy), n2 = interleavedGradientNoise(screenCoordinate.xy.add(vec2(31.7, 17.3)));
          // (the tail of the cone left out: the few rays far off the mirror direction are most of the noise)
          const u1 = fract(n1.add(U.turn.x)).mul(mix(float(1), float(LOBE_KEEP), U.ref.oneMinus())), u2 = fract(n2.add(U.turn.y));
          const tx = normalize(cross(select(abs(nw.y).lessThan(.99), vec3(0, 1, 0), vec3(1, 0, 0)), nw)).toVar(), ty = cross(nw, tx).toVar(), v = vdir.negate();
          const vh = normalize(vec3(al.mul(dot(v, tx)), al.mul(dot(v, ty)), dot(v, nw))).toVar(), l2 = vh.x.mul(vh.x).add(vh.y.mul(vh.y));
          const t1 = select(l2.greaterThan(1e-8), vec3(vh.y.negate(), vh.x, 0).div(sqrt(max(l2, 1e-8))), vec3(1, 0, 0)).toVar(), t2 = cross(vh, t1);
          const rr = sqrt(u1), ph = u2.mul(6.2831853), a1 = rr.mul(cos(ph)).toVar(), sv = vh.z.add(1).mul(.5), a2 = mix(sqrt(max(float(1).sub(a1.mul(a1)), 0)), rr.mul(sin(ph)), sv).toVar();
          const nh = t1.mul(a1).add(t2.mul(a2)).add(vh.mul(sqrt(max(float(1).sub(a1.mul(a1)).sub(a2.mul(a2)), 0)))).toVar();
          const ne = normalize(vec3(al.mul(nh.x), al.mul(nh.y), max(nh.z, 1e-4))), hw = normalize(tx.mul(ne.x).add(ty.mul(ne.y)).add(nw.mul(ne.z)));
          const d2 = reflect(vdir, hw);
          // (a direction into the surface: the mirror's)
          If(dot(d2, nw).greaterThan(.02), () => { rd.assign(normalize(d2)); });
        });
      }
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
  if (regen) return regenStage(ch, { U, L, dT, nT, R, C, rays, zAt, envAt, vel: ch.trRegen.vel || null });
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
/* ---------- Ray Regeneration ---------- */
// Our own take on what AMD calls Ray Regeneration and Nvidia Ray Reconstruction: a few noisy rays a frame made into
// a clean, full-size traced picture. Theirs is a trained network on a desktop card; this is the same job done the
// way the big engines' denoisers did it before (ReBLUR, SVGF) and the way GSSR upscales, in one pass at the
// picture's size:
//   - the rays (at a part of the picture's size, as before) start at another place inside their pixels every
//     frame, and a rough surface's ray takes one direction of its cone a frame;
//   - each pixel keeps the reflection it has gathered (its history) and finds it again where that REFLECTION was
//     last frame: not where the surface was, but where the thing seen in it was, which moves across a mirror as if
//     it stood behind it, as far behind as the ray went. A rough surface's reflection is that mirror picture blurred
//     and moves the same way (found by the surface's own move it leaves a ghost of the thing stuck to the floor);
//     how far its rays went is kept per point of the surface from frame to frame, since each ray goes another way.
//     The history counts only if the surface seen there then lies in this pixel's plane (not something that stood
//     in front) and is as rough as this one, and, where the picture moves, if what it reflected stood about as far
//     behind it as what this pixel reflects now (at the edge of a thing in a mirror the one side's history is not
//     the other's);
//   - this frame's rays round the pixel are weighed by how near they started to it and whether they are on its
//     surface (a rough surface takes four more from round it, and up to sixteen where it knows little yet: over
//     the shape its blur has on the picture, long toward the camera on a floor, and only rays that started within
//     the cone's width at what they found), and blended with the history by how much each knows: a ray that
//     started on this very pixel counts for most;
//   - history gone stale is let go. A mirror's is held to the range this frame's rays span (they are exact there),
//     and counts for less where it had to be pulled back while the picture moves.
//     A rough surface's rays are a noisy few, so its history is read at two more places a frame (smoothing it over
//     the pixels round it, within the surface's own blur, and hardly at all across a surface that curves) and is
//     dropped only when this frame's rays are further from it than they usually are there. It is kept as what the
//     rays found, with the share of them that found anything: the sky the rest leave is each pixel's own (each
//     point of a ball faces its own part of it), and is taken off as the history is read.
//     While the camera moves it keeps only as many frames as the things in the reflection take to part from the
//     sky behind them by its own blur.
//   - a surface only a little rougher than a mirror (a polished floor) is between the two: its rays go nearly
//     straight and are shared between pixels over the shape of its blur (see CONE_FULL), and its history is a mirror's.
// So a mirror comes out at the picture's full size from rays at a quarter of its pixels (no steps along reflected
// edges), a rough surface's blur is the real one, and the rays can be fewer still for the same picture.
// What is kept per pixel, in two sets taking turns: the picture with its reflections, what the rays found there
// (the sky left out) with how much it knows, and four numbers about it (how far the surface was, how near what it
// reflects, how far a frame's rays usually are from the history, the share of them that found anything): 24 bytes
// a pixel of the picture each (the pass as it was: 8 in all).
// HD.regen = false: the pass as it was.
const RQ = new QuadMesh();
let RRS;
class Regen extends Node {
  static get type() { return 'GsRegen'; }
  constructor(deps, make) {
    super('vec4');
    this.updateBeforeType = NodeUpdateType.FRAME; this.deps = deps; this.make = make;
    // two taking turns: [0] the scene with its reflections, [1] the reflection kept (rgb) and how much it knows (a), [2] how far the surface is (r), how near what it reflects (g: one over how far), how far a frame's rays usually are from the history, squared (b), and to which side they have been of late (a): to tell history that has gone stale
    const mk = () => { const t = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, count: 3 }); t.textures[0].name = 'Regen out'; t.textures[1].name = 'Regen history'; t.textures[2].name = 'Regen distance'; t.gsPart = 'reflections'; return t; };
    this.rt = [mk(), mk()]; this.cur = 0;
    this.histN = texture(this.rt[1].textures[1]); this.distN = texture(this.rt[1].textures[2]);
    this.out = passTexture(this, this.rt[0].textures[0]);
    this.mat = new NodeMaterial(); this.mat.name = 'Regen';
    this.fresh = true; this.cutNow = true; this.f = 0; this.lastVP = new Matrix4(); this.lastCam = new Vector3();
  }
  get renderTarget() { return this.rt[0]; }
  setSize(w, h) { if (this.rt[0].width !== w || this.rt[0].height !== h) { for (const t of this.rt) t.setSize(w, h); this.fresh = true; } }
  updateBefore(frame) {
    const r = frame.renderer, into = this.rt[this.cur], from = this.rt[1 - this.cur];
    this.histN.value = from.textures[1]; this.distN.value = from.textures[2]; this.out.value = into.textures[0];
    RRS = RendererUtils.resetRendererState(r, RRS);
    try { r.setRenderTarget(into); RQ.material = this.mat; RQ.name = 'Regen'; RQ.render(r); } finally { RendererUtils.restoreRendererState(r, RRS); }
    this.cur = 1 - this.cur; this.cutNow = false;
  }
  setup(builder) {
    // (what this reads is drawn first: the scene's pass, the rays)
    for (const d of this.deps) d?.build(builder);
    this.mat.contextNode = context(builder.getSharedContext());
    const o0 = property('vec4'), o1 = property('vec4'), o2 = property('vec4');
    this.mat.colorNode = this.make(this, o0, o1, o2); this.mat.outputNode = outputStruct(o0, o1, o2); this.mat.needsUpdate = true;
    return this.out;
  }
  dispose() { super.dispose(); for (const t of this.rt) t.dispose(); this.mat.dispose(); }
}
function regenStage(ch, { U, L, dT, nT, R, C, rays, zAt, envAt, vel }) {
  const G = ch.trG = new Regen([dT, nT, R, C, rays, vel], (G, o0, o1, o2) => Fn(() => {
    const q = uv(), c = C.sample(q), r4 = R.sample(q), out = vec3(c.rgb).toVar(), f0 = abs(r4.rgb), smooth = abs(r4.a);
    const keep = vec4(0).toVar(), far = float(0).toVar(), near = float(0).toVar(), fast = float(0).toVar(), found = float(0).toVar();
    If(f0.r.add(f0.g).add(f0.b).greaterThan(1e-3).and(smooth.greaterThan(1 + 1 / 64 - ROUGH_MAX)), () => {
      const rough = clamp(float(1 + 1 / 64).sub(smooth), 0, 1).toVar(), isRough = rough.greaterThan(ROUGH_SHARP), soft = smoothstep(ROUGH_SHARP, .4, rough).toVar(), noisy = smoothstep(ROUGH_SHARP, CONE_FULL, rough).toVar();
      // (spread: the share of a rough surface's blur that its rays, sent nearly straight, leave to be made here (see CONE_FULL); wide: how much further its rays are shared for that)
      const cone = coneOf(rough, U), spread = sqrt(max(float(1).sub(cone.mul(cone)), 0)).mul(select(isRough, float(1), float(0))).mul(U.ref.oneMinus()).toVar(), wide = mix(float(1), float(SHARE_WIDE), spread).toVar();
      const vp = getViewPosition(q, dT.sample(q).r, U.invProj).toVar(), zc = vp.z, nv = normalize(nT.sample(q)).toVar(), vd = normalize(vp).negate(), nov = clamp(dot(nv, vd), 0, 1);
      const wp = U.camWorld.mul(vec4(vp, 1)).xyz.toVar(), nw = normalize(U.camWorld.mul(vec4(nv, 0)).xyz).toVar(), len = length(vp).toVar();
      // how fast the surface turns here, a pixel of the picture on (the normal one pixel right and one down against
      // this one, the lesser of the two: across an edge the normal jumps, along it not), and as a curve: one over
      // its radius. A ball's reflections are not a flat floor's: they sit just behind it, and each point of it faces
      // its own way
      const turn = min(length(normalize(nT.sample(q.add(vec2(float(1).div(U.size.x), 0)))).sub(nv)), length(normalize(nT.sample(q.add(vec2(0, float(1).div(U.size.y))))).sub(nv))).toVar();
      const full = U.size.y.div(U.half.y), curve = turn.mul(U.focal).mul(full).div(len).toVar(), al = rough.mul(rough).toVar();
      // the shape of a rough surface's blur on the picture: seen at a low angle, as a floor mostly is, it is long
      // toward the camera and narrow across (a pole's reflection is a streak, not a smudge): across is the way
      // the surface runs at right angles to the line of sight, and the blur is narrower that way by the cosine of
      // the angle the surface is seen at. What is shared between pixels is shared over that shape (flat(): an
      // offset on the picture squeezed across)
      const Bv = cross(nv.xyz, vd), bl = length(Bv.xy), across = select(bl.greaterThan(1e-3), vec2(Bv.x, Bv.y.negate()).div(max(bl, 1e-3)), vec2(1, 0)).toVar(), thin = mix(float(1), clamp(nov, .2, 1).mul(mix(float(1), float(SHARE_THIN), spread)), max(soft, spread)).toVar();
      const fl = float(1).toVar(), flat = o => o.sub(across.mul(dot(o, across).mul(fl.oneMinus())));
      // what the material drew there already: its surroundings along the mirror direction (as three.js reads them)
      const rv = normalize(mix(reflect(vd.negate(), nv), nv, rough.mul(rough).mul(rough).mul(rough))), own = r4.r.add(r4.g).add(r4.b).lessThan(0);
      const sky = select(own, vec3(0), envAt(normalize(U.camWorld.mul(vec4(rv, 0)).xyz), rough)).toVar();
      // this frame's rays round the pixel: each by how near to this pixel's middle it started (sharply for a mirror: the
      // ray that started here is this pixel's own; widely for a rough surface: its neighbours' rays are more of its
      // cone) and whether it is on this pixel's surface. A ray that found a thing counts as that thing less the sky
      // drawn there; one that found nothing leaves the sky. And the range they span, for the history
      const top = ivec2(U.half).sub(1), hp = q.mul(U.half).sub(.5).sub(U.rj).toVar(), b = ivec2(floor(hp.add(1e-3))).toVar();
      const ps = U.prevVP.mul(vec4(wp, 1)).toVar(), sq = ps.xy.div(max(abs(ps.w), 1e-6)).mul(vec2(.5, -.5)).add(.5).add(U.jn).toVar();
      const un = float(0).toVar(), had = float(0).toVar(), fn = float(0).toVar();
      If(isRough, () => {
        const k = G.distN.sample(sq);
        If(sq.x.greaterThanEqual(0).and(sq.x.lessThanEqual(1)).and(sq.y.greaterThanEqual(0)).and(sq.y.lessThanEqual(1)).and(ps.w.greaterThan(0)).and(U.cut.lessThan(.5))
          .and(abs(k.r.sub(length(wp.sub(U.prevCam)))).lessThan(len.mul(.03).add(.05))), () => { un.assign(k.g); fn.assign(k.a); had.assign(1); });
      });
      const kk = mix(float(8), float(1.2), soft).toVar();
      const sum = vec3(0).toVar(), ws = float(0).toVar(), m1 = vec3(0).toVar(), m2 = vec3(0).toVar(), wb = float(0).toVar(), tn = float(-1).toVar(), wt = float(0).toVar(), us = float(0).toVar(), lo = vec3(1e4).toVar(), hi = vec3(-1e4).toVar(), fw = float(0).toVar();
      // (how far this pixel's own ray went, as the share of the blur it leaves: see reach below)
      const ownA = rays.load(clamp(ivec2(floor(hp.add(.5))), ivec2(0), top)).a, ownReach = select(spread.greaterThan(.02).and(ownA.greaterThan(0)), ownA.div(ownA.add(len)), float(1)).toVar();
      const tap = (px, w0, out = 1) => {
        const p = clamp(px, ivec2(0), top), s = rays.load(p), tq = vec2(p).add(.5).add(U.rj).div(U.half).toVar(), z = zAt(tq);
        // (on this pixel's surface: as deep as it, or as deep as its plane is at the ray's own pixel. A floor seen at a
        // low angle gets deeper fast toward the camera, the way its blur is longest, and held to this pixel's depth
        // alone its rays were shared over a strip across the picture, not over the blur)
        const tb = U.invProj.mul(vec4(tq.x.mul(2).sub(1), tq.y.oneMinus().mul(2).sub(1), .5, 1)), tr = tb.xyz.div(tb.w), tdn = dot(nv, tr), zp = select(abs(tdn).greaterThan(1e-6), tr.z.mul(dot(nv, vp)).div(tdn), zc);
        const on = max(float(1).sub(min(abs(z.sub(zc)), abs(z.sub(zp))).div(abs(zc).mul(.04).add(.03))), 0).mul(select(s.a.equal(0), float(0), float(1))).toVar();
        // (a ray from another pixel is one of this pixel's cone only if it started within the cone's width at the
        // thing it found: a thing found close by, as a pole's foot by the floor in front of it, is seen from there
        // alone, and shared further it spreads into a halo beside its reflection. Where the rays go straight and the
        // sharing is the blur, that holds both ways: this pixel's own ray having found a thing close by, its cone is
        // as narrow there, and a ray from further off than that is not one of it either. out: REGEN_TAIL's rays,
        // which are from that much further out by design)
        const reach = rough.mul(rough).mul(1.3).mul(wide).mul(U.focal).mul(min(select(s.a.greaterThan(0), s.a.div(s.a.add(len)), float(1)), ownReach)).mul(out);
        const mine = float(1).sub(smoothstep(max(reach, .7), max(reach, .7).mul(1.5).add(.3), length(vec2(p).sub(hp).add(across.mul(dot(vec2(p).sub(hp), across).mul(thin.reciprocal().sub(1)))))));
        const val = select(s.a.greaterThan(0), s.rgb.sub(sky), vec3(0)).toVar(), w = w0.mul(on).mul(mix(float(1), mine, max(soft, spread))).toVar();
        sum.addAssign(val.mul(w)); ws.addAssign(w); fw.addAssign(select(s.a.greaterThan(0), w, float(0))); m1.addAssign(val.mul(on)); m2.addAssign(val.mul(val).mul(on)); wb.addAssign(on);
        // (how near the things found are: one over how far each ray went, nothing found counting as endlessly far)
        us.addAssign(select(s.a.greaterThan(0), w.div(max(s.a, 1e-3)), float(0)));
        If(w.greaterThan(wt), () => { wt.assign(w); tn.assign(s.a); });
        If(on.greaterThan(.05), () => { lo.assign(min(lo, val)); hi.assign(max(hi, val)); });
      };
      // the four nearest (the tests' reference: each pixel's own ray alone)
      for (const [x, y] of REGEN_TAPS) { const d = vec2(b.add(ivec2(x, y))).sub(hp), d2 = dot(d, d); tap(b.add(ivec2(x, y)), exp(d2.mul(kk).negate()).mul(select(d2.lessThan(.01), float(1), U.ref.oneMinus()))); }
      // how far behind the surface the reflected thing stands. A mirror: as far as the nearest ray went. A rough
      // surface: each of its rays went another way and found another thing, so one frame's say little; the nearness
      // they found is kept from frame to frame with the surface (read back where this point of it was) and this
      // frame's added to it
      const uc = us.div(max(ws, 1e-5)), u1 = mix(uc, mix(un, uc, .2), had);
      const tm = min(select(isRough, float(1).div(max(u1, 1e-4)), select(tn.greaterThan(0), tn, L.far)), L.far).toVar();
      // where the reflection was last frame: the thing seen in a mirror moves over it as if it stood behind it, as far
      // behind as the ray went (nothing found: very far, so only the camera's turn moves it). A rough surface's
      // reflection is that mirror picture blurred, so it moves the same way, a little less far behind the rougher it
      // is (its blur leans toward the surface's facing)
      const dom = float(1).sub(rough).mul(sqrt(float(1).sub(rough)).add(rough));
      // (a rough surface's history is what its rays found, the sky left out: it is found again by how far off the
      // things found are, not by a mix of them and the sky behind, which is right for neither: by this frame's
      // rays that found something, and where none did by what is kept. The share of the rays that found anything is
      // kept with the nearness, per point of the surface)
      const sc = fw.div(max(ws, 1e-5)), s1 = mix(sc, mix(fn, sc, .2), had).toVar(), tf = select(isRough, min(select(fw.greaterThan(1e-4), fw.div(max(us, 1e-6)), select(s1.greaterThan(.01), s1.div(max(u1, 1e-4)), L.far)), L.far), tm).toVar();
      // (in a curved mirror it stands nearer: a ball's picture of the world lies within half its radius behind it)
      const te = tf.mul(dom).div(tf.mul(dom).mul(curve).mul(2).add(1)), pv = wp.add(normalize(wp.sub(U.camPos)).mul(te));
      const pc = U.prevVP.mul(vec4(pv, 1)).toVar(), pq = pc.xy.div(max(abs(pc.w), 1e-6)).mul(vec2(.5, -.5)).add(.5).add(U.jn).toVar();
      // (how far that is from where the surface itself was, in the rays' pixels: how much rests on how far the rays went)
      const par = length(pq.sub(sq).mul(U.half));
      // (and how far from it the place of a thing endlessly far off is: the most that two things in one reflection
      // can part by in a frame; in a curved mirror that is not far behind it either)
      const pf = U.prevVP.mul(vec4(wp.add(normalize(wp.sub(U.camPos)).mul(L.far.div(L.far.mul(curve).mul(2).add(1)))), 1)), parFar = length(pf.xy.div(max(abs(pf.w), 1e-6)).mul(vec2(.5, -.5)).add(.5).add(U.jn).sub(sq).mul(U.half)).toVar();
      // (a thing that moves by itself, where the scene draws its motion: its own move on top of the camera's)
      if (vel) {
        const cam = q.sub(sq), mv = vel.sample(q).xy.mul(vec2(.5, -.5)).sub(U.jd).sub(cam).toVar();
        If(length(mv.mul(U.half)).greaterThan(.35), () => { pq.subAssign(mv); });
      }
      // what was reflected then stood about as far behind the surface as what is reflected here now (at the edge of
      // a thing in a mirror the one side's history is not the other's): only where the picture moves (with nothing
      // moving the history is this pixel's own, and at an edge in a mirror its rays find the one side and the other
      // in turn, which is what smooths the edge)
      const cn = select(isRough, u1, float(1).div(tm)).toVar(), went = length(pq.sub(q).mul(U.half)).toVar(), moved = clamp(went.mul(2), 0, 1).toVar();
      // the history at a place p of last frame's picture, and how much it counts: nothing unless that place was on
      // the picture and what was seen there then lies in this pixel's plane and is as rough as this pixel (across
      // the line between a polished floor and a dull one the one's reflection is not the other's; read from this
      // frame's picture, where that point of the surface is now)
      const past = p => {
        // (kept: what the rays found, with the share of them that found anything. Against this pixel's own sky that
        // is the reflection less the sky, whichever point of the surface gathered it: on a ball each point has its
        // own sky, and one point's "less the sky" read at the next would move the sky's highlights about)
        const k = G.distN.sample(p).toVar(), h4 = G.histN.sample(p), h = vec4(h4.rgb.sub(sky.mul(k.a)), h4.a).toVar(), hl = k.r;
        const nd = vec2(p.x.sub(U.jn.x).mul(2).sub(1), float(1).sub(p.y.sub(U.jn.y).mul(2))), fp = U.prevInv.mul(vec4(nd, 1, 1)), pp = U.prevCam.add(normalize(fp.xyz.div(fp.w).sub(U.prevCam)).mul(hl));
        const pn = U.proj.mul(U.view.mul(vec4(pp, 1))), there = pn.xy.div(max(abs(pn.w), 1e-6)).mul(vec2(.5, -.5)).add(.5);
        const ok = p.x.greaterThanEqual(0).and(p.x.lessThanEqual(1)).and(p.y.greaterThanEqual(0)).and(p.y.lessThanEqual(1)).and(pc.w.greaterThan(0)).and(hl.greaterThan(0))
          .and(abs(dot(pp.sub(wp), nw)).lessThan(len.mul(.02).add(.03))).and(U.cut.lessThan(.5))
          .and(abs(float(1 + 1 / 64).sub(abs(R.sample(there).a)).sub(rough)).lessThan(.06));
        const same = float(1).sub(smoothstep(mix(float(.25), float(.42), soft), mix(float(.6), float(.84), soft), abs(k.g.sub(cn)).div(max(max(k.g, cn), 1e-3))));
        // (not on the roughest surfaces: their rays went all ways, and how near what a few of them found is says little)
        return { h, k, w: select(ok, h.a.mul(mix(float(1), same, moved.mul(smoothstep(.3, .45, rough).oneMinus()))), float(0)).toVar() };
      };
      const P0 = past(pq), hs = P0.h.rgb.mul(P0.w).toVar(), hw = P0.w.toVar(), hn = float(1).toVar(), fs = P0.k.a.mul(P0.w).toVar();
      // (a rough surface with nothing to be had there, as beside the line where a floor's polish changes, where the
      // reflection came from the other side of it: what this point of the surface itself showed last frame, for half.
      // Its blur hides how far the reflection has slid over it since)
      If(isRough.and(P0.w.lessThanEqual(0)).and(U.ref.lessThan(.5)), () => { const T = past(sq); hs.assign(T.h.rgb.mul(T.w).mul(.5)); hw.assign(T.w.mul(.5)); fs.assign(T.k.a.mul(T.w).mul(.5)); });
      // (how many frames' worth is known here)
      const known = P0.w.div(max(ws, 1)).toVar(), fill = smoothstep(16, 64, known).toVar();
      fl.assign(mix(float(1), thin, max(smoothstep(2, 12, known), spread)));   // (while little is known: over the whole round of the blur, for more rays; not where the sharing is the blur)
      // a rough surface: one frame's rays are a noisy few of its cone, and so is what a handful of frames gathered.
      // The history is read at two more places, either side of the pixel and turned another way each frame, so
      // from frame to frame it is smoothed over the pixels round it (never wider than a part of the blur the
      // surface has at the reflected thing's distance: wide while little is known, a tenth of it once the frames
      // have filled in)
      const lobe = rough.mul(rough).mul(1.3).mul(wide).mul(tm.div(tm.add(len))).mul(U.focal).toVar();   // (the blur's radius in the rays' pixels)
      If(isRough.and(U.ref.lessThan(.5)), () => {
        const rh = clamp(lobe.mul(U.size.y.div(U.half.y)).mul(mix(float(HIST_WIDE), float(HIST_FINE), clamp(known.div(12), 0, 1))), 0, min(float(12), al.mul(HIST_TURN).div(max(turn, 1e-4)))).mul(max(noisy, spread)).mul(fill.mul(FILL_KEEPS).oneMinus());
        const a2 = interleavedGradientNoise(screenCoordinate.xy.add(vec2(11.3, 5.7))).add(U.turn.y).mul(6.2832), dv = flat(vec2(cos(a2), sin(a2)).mul(rh)).div(U.size).toVar();
        for (const sd of [1, -1]) { const T = past(pq.add(dv.mul(sd))); hs.addAssign(T.h.rgb.mul(T.w).mul(.5)); hw.addAssign(T.w.mul(.5)); hn.addAssign(.5); fs.addAssign(T.k.a.mul(T.w).mul(.5)); }
      });
      const hrgb = hs.div(max(hw, 1e-5)).toVar(), wh = hw.div(hn).toVar(), fh = fs.div(max(hw, 1e-5)).toVar();
      // and more of this frame's rays from round the pixel, over a circle as wide as its blur is at the reflected
      // thing's distance while little is gathered (just uncovered, a cut) and narrower as the frames fill in (their
      // rays' own spread is the blur then), turned another way each frame; twice as many while little is known.
      // (Where the rays go nearly straight this sharing is the blur: as wide and as strong whatever is gathered)
      If(isRough.and(U.ref.lessThan(.5)), () => {
        const rad = clamp(lobe.mul(mix(mix(float(1), float(.45), clamp(wh.div(8), 0, 1)), float(1), spread)), min(mix(float(1.5), float(.75), fill), max(lobe, .3)), 14).min(max(al.div(max(turn.mul(full), 1e-4)), .5)).toVar(), dw = mix(mix(float(.5), float(.5 * (1 - FILL_KEEPS)), fill), float(.5), spread).toVar(), ang = interleavedGradientNoise(screenCoordinate.xy).add(U.turn.x).mul(6.2832), cs = cos(ang).toVar(), sn = sin(ang).toVar();
        for (const [x, y] of REGEN_DISC) tap(ivec2(floor(hp.add(.5).add(flat(vec2(cs.mul(x).sub(sn.mul(y)), sn.mul(x).add(cs.mul(y))).mul(rad))))), dw);
        // (and from further out, for the wide faint part of the cone: see SHARE_TAIL)
        If(spread.greaterThan(.02), () => { for (const [x, y] of REGEN_TAIL) tap(ivec2(floor(hp.add(.5).add(flat(vec2(cs.mul(x).sub(sn.mul(y)), sn.mul(x).add(cs.mul(y))).mul(min(lobe.div(wide), 4.3)))))), spread.mul(SHARE_TAIL), 3); });
        If(known.lessThan(6), () => {
          for (const [x, y] of REGEN_DISC) tap(ivec2(floor(hp.add(.5).add(flat(vec2(sn.mul(x).add(cs.mul(y)), sn.mul(y).sub(cs.mul(x))).mul(rad.mul(.7)))))), float(.5));
          // (and as many again where there is nothing yet: a place just uncovered)
          If(known.lessThan(1.5), () => {
            const c2 = cs.mul(.7071).sub(sn.mul(.7071)).toVar(), s2 = sn.mul(.7071).add(cs.mul(.7071)).toVar();
            for (const [x, y] of REGEN_DISC) { tap(ivec2(floor(hp.add(.5).add(flat(vec2(c2.mul(x).sub(s2.mul(y)), s2.mul(x).add(c2.mul(y))).mul(rad.mul(.85)))))), float(.5)); tap(ivec2(floor(hp.add(.5).add(flat(vec2(s2.mul(x).add(c2.mul(y)), s2.mul(y).sub(c2.mul(x))).mul(rad.mul(.5)))))), float(.5)); }
          });
        });
      });
      const ua = us.div(max(ws, 1e-5));
      near.assign(select(isRough, mix(ua, mix(un, ua, .2), had), float(1).div(tm)));
      const cur = sum.div(max(ws, 1e-5)).toVar(), mean = m1.div(max(wb, 1e-5)), dev = sqrt(max(m2.div(max(wb, 1e-5)).sub(mean.mul(mean)), 0));
      // history gone stale (a thing that moved in the reflection, a place found wrongly). A mirror's is held to the
      // range this frame's rays span: they are exact there, and what changed doesn't linger. A rough surface's rays
      // are a noisy few of the cone, most of them finding the sky and now and then one a thing: held to their range,
      // what the frames gathered would be thrown away whenever a frame's rays all missed, and come back as specks.
      // So there the question is whether this frame's rays are further from the history than they usually are: how
      // far they usually are is kept from frame to frame (the square of it, a slow average), and how much this
      // frame's rays disagree among themselves counts too (one of them finding a bright thing is no news). A thing
      // that leaves a reflection where every ray found it is known in one frame; a haze of few hits is left alone
      const LUM = vec3(.25, .5, .25), lc = dot(cur, LUM), lh = dot(hrgb, LUM), had0 = hw.greaterThan(0);
      const se = dot(dev, LUM).mul(sqrt(max(wb.mul(.5), 1)).reciprocal()).toVar(), off2 = lc.sub(lh).mul(lc.sub(lh));
      const usual = select(P0.w.greaterThan(0), P0.k.b, se.mul(se).mul(4).add(lc.mul(lc).mul(.02)).add(4e-4)).toVar();
      const band = sqrt(usual).mul(2).add(se.mul(2.5)).add(abs(lh).mul(.1)).add(.03), stale = smoothstep(band, band.mul(2), abs(lc.sub(lh)));
      // (no test of whether the rays fall to the same side of the history for a few frames running: where a few
      // rays in many find a small bright thing they do just that between one find and the next, and the history
      // thrown away there came back as bright flecks, for next to nothing gained where a thing had really gone)
      const drop = stale.mul(noisy).mul(U.ref.oneMinus()).toVar();
      wh.mulAssign(drop.oneMinus());
      // (what is usual is not raised by a frame far outside it, or stale history would come to look usual)
      fast.assign(select(had0, mix(usual, min(off2, band.mul(band)), USUAL), usual));
      // (where the rays go straight and are shared for the blur: held as well to this frame's shared rays, give or take their spread: HOLD_STRAIGHT)
      const box = dev.mul(mix(float(1.5), float(3), soft)).add(mix(float(.004), float(.02), noisy)).add(abs(mean).mul(.03)).add(noisy.mul(noisy).mul(noisy).mul(mix(float(8), float(HOLD_MOVING), clamp(went.mul(.5), 0, 1)))).add(U.ref.mul(1e4)), edge = mix(float(.004), float(.02), noisy).add(abs(mean).mul(.03)), tight = dev.mul(HOLD_STRAIGHT).add(edge), hc = mix(clamp(hrgb, max(min(lo, mean).sub(edge), mix(vec3(-1e4), cur.sub(tight), spread)), min(max(hi, mean).add(edge), mix(vec3(1e4), cur.add(tight), spread))), clamp(hrgb, mean.sub(box), mean.add(box)), max(noisy, U.ref)).toVar();
      wh.mulAssign(float(1).sub(smoothstep(edge, edge.mul(4), dot(abs(hrgb.sub(hc)), LUM)).mul(moved).mul(noisy.oneMinus()).mul(U.ref.oneMinus())));
      // the two blended by how much each knows. How much is kept of a rough surface's history while the camera
      // moves: what it reflects is at many distances at once (a thing near it, the sky), and each slides over it at
      // its own rate, so history found by one distance carries the rest along: a near thing's reflection trails
      // behind it, too strong. From frame to frame they part by no more than the reflection's place is from the
      // surface's own (par), and by less where little is mixed (below), so the frames kept are as many as it takes
      // that to add up to the surface's blur there (KEEP_SLIDE of them): a slide inside the blur doesn't show.
      // Still, everything is kept
      // (and on a curved surface what a point of it reflects changes as the camera moves, as no flat picture behind it
      // does: there as many frames as it takes the surface to turn, over the reflection's slide, by its own blur; a
      // mirror ball keeps next to none while the camera moves)
      const bend = went.mul(turn).mul(full).div(max(al, .01).mul(KEEP_SLIDE));
      // (how far apart: what the surface reflects is things found, at about one distance, and the sky behind them,
      // which part by as far as an endlessly far thing's place is from the things' (parFar, less the nearer to far
      // off the things are). Where it is all the one or all the other nothing parts from anything and the frames
      // can be kept, but for a little: the things found are not all at one distance either)
      const share = mix(fh, fw.div(max(ws, 1e-5)), select(hw.greaterThan(0), float(.2), float(1))), tHit = share.div(max(u1, 1e-4)), apart = sqrt(share.mul(share.oneMinus())).mul(len.div(tHit.add(len)));
      // (a mirror's six frames; a rough surface's while nothing moves: more, see STILL_KEEP)
      const keepM = mix(float(6), float(STILL_KEEP), select(isRough, float(1), float(0)).mul(smoothstep(.02, .1, went).oneMinus())).toVar(), most = mix(mix(keepM.div(bend.mul(keepM).add(1)), float(KEEP_ROUGH).div(min(par, parFar.mul(apart).add(par.mul(SLIDE_LEAST))).mul(KEEP_ROUGH / KEEP_SLIDE).div(lobe.add(1)).add(bend.mul(KEEP_ROUGH)).add(went.mul(.2)).add(1)), soft), float(1e4), U.ref), a = select(ws.add(wh).greaterThan(1e-4), ws.div(max(ws.add(wh), 1e-4)), float(1));
      const d = mix(hc, cur, select(ws.greaterThan(1e-5), a, float(0))).toVar(), fd = mix(fh, fw.div(max(ws, 1e-5)), select(ws.greaterThan(1e-5), a, float(0)));
      keep.assign(vec4(d.add(sky.mul(fd)), min(wh.add(ws), most))); far.assign(len); found.assign(fd);
      const fab = DFGLUT({ roughness: rough, dotNV: nov }), W = f0.mul(fab.x).add(fab.y);
      const fade = smoothstep(ROUGH_MAX, ROUGH_FADE, rough).mul(select(own, float(.6), float(1)));
      out.addAssign(W.mul(d).mul(fade));
    });
    o0.assign(vec4(max(out, 0), c.a)); o1.assign(keep); o2.assign(vec4(far, near, fast, found));
    return float(0);
  })());
  ch.trT = G; return G.out;
}

/** This frame's sizes and camera for the stage (w x h: the scene's picture; scale: the rays' share of it). */
const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
const VPN = new Matrix4();
/**
 * This frame's sizes and camera for the stage (w x h: the scene's picture; scale: the rays' share of it).
 * Ray Regeneration also takes more: cut (nothing from earlier frames belongs to this one), f (the upscaler's frame,
 * sgsr2.js SgsrFrame, while it has its jitter on the camera; or nothing), ref (the tests' reference: a ray for every pixel
 * of the picture, every frame added to the ones before with no end).
 */
export function traceFrame(ch, w, h, scale, { cut = false, f = null, ref = false } = {}) {
  if (!ch.trT) return;
  ch.trT.renderTarget.gsPart = 'reflections'; if (ch.trH) ch.trH.renderTarget.gsPart = 'reflections';   // (hd3d.js gpuTime: the chip's time by pass)
  const G = ch.trG; if (G && ref) scale = 1;
  const U = ch.trU, cam = ch.cam, hw = Math.max(4, Math.round(w * scale)), hh = Math.max(4, Math.round(h * scale));
  ch.trT.setSize(w, h); ch.trH?.setSize(hw, hh); U.half.value.set(hw, hh); U.size.value.set(w, h);
  U.invProj.value.copy(cam.projectionMatrixInverse); U.proj.value.copy(cam.projectionMatrix); U.camWorld.value.copy(cam.matrixWorld); U.view.value.copy(cam.matrixWorld).invert();
  cam.getWorldPosition(U.camPos.value); U.nf.value.set(cam.near, cam.far); U.focal.value = cam.projectionMatrix.elements[5] * hh / 2;
  if (G) {
    // the camera without the upscaler's jitter, this frame and last (the history is read on the pixel grid: a still
    // picture is then read where it was written, not a fraction of a pixel off and softer every frame)
    VPN.multiplyMatrices(f ? f.saved : cam.projectionMatrix, cam.matrixWorldInverse);
    const key = `${hw}x${hh}|${ref}`, fresh = cut || G.fresh || key !== G.key; G.key = key; G.fresh = false;
    U.prevVP.value.copy(fresh ? VPN : G.lastVP); U.prevCam.value.copy(fresh ? U.camPos.value : G.lastCam); U.prevInv.value.copy(U.prevVP.value).invert();
    G.lastVP.copy(VPN); G.lastCam.copy(U.camPos.value);
    // (a cut holds until the pass has been drawn with it: the frame it was asked on may not be drawn at all, as when
    // a picture it reads has just changed size, and the history must not outlive it)
    if (fresh) G.cutNow = true;
    U.cut.value = G.cutNow ? 1 : 0; U.ref.value = ref ? 1 : 0; G.f = G.cutNow ? 0 : G.f + 1;
    if (f) U.jn.value.set(f.jitter.x / w, f.jitter.y / h); else U.jn.value.set(0, 0);
    if (f && f.jd && !fresh) U.jd.value.set(f.jd[0] * .5, -f.jd[1] * .5); else U.jd.value.set(0, 0);
    // where the rays start inside their pixels: over the scene's pixels each covers, another every frame (at half size
    // the four in turn; else points of a Halton sequence); none with a ray for every pixel
    const n = G.f, per = w / hw;
    if (per < 1.05) U.rj.value.set(0, 0);
    else if (Math.abs(per - 2) < .05) { const k = [[-.25, -.25], [.25, .25], [.25, -.25], [-.25, .25]][n % 4]; U.rj.value.set(k[0], k[1]); }
    else U.rj.value.set(halton(n % 8 + 1, 2) - .5, halton(n % 8 + 1, 3) - .5);
    U.turn.value.set(n * .6180339887 % 1, n * .7548776662 % 1);
  }
  const e = ch.scene.environment; if (e) for (const n of ch.trEnvs || []) if (n.value !== e) n.value = e;
}
export function traceDispose(ch) { ch.trH?.renderTarget?.dispose(); if (ch.trG) ch.trG.dispose(); else ch.trT?.renderTarget?.dispose(); ch.trH = ch.trT = ch.trG = ch.trU = ch.trEnvs = null; }
