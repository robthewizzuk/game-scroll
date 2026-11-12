// Cluster detail: meshes as dense as you like, drawn only as fine as the screen can show.
// (The idea behind Unreal's Nanite, in the part of it a phone's web view can do.)
//
// A big mesh costs the same to draw whether it fills the screen or is a speck on a far hill, and one LOD
// for the whole mesh can't help a thing that is both near and far at once (a hillside, a long wall, a town).
// Here the mesh is cut into small clusters with coarser copies of each patch (detail-build.js, in a
// worker), and every frame, for every camera that draws it (the picture, each light's shadow map), each
// patch is drawn from the coarsest clusters whose error is under a pixel there: fine at your feet, a few
// triangles on the horizon, and nothing for the parts out of view. Patches of different fineness meet
// without cracks, and because the change is under a pixel there is no pop.
//
// Full Nanite needs mesh shaders or a compute rasteriser, which a web view doesn't have. This draws with
// ordinary indexed draws through three.js's own multi-range drawing (BatchedMesh's path: one
// multi-draw call on WebGL, a run of drawIndexed calls on WebGPU), so every standard material, shadows,
// motion vectors (frame generation, SGSR 2) and the kit's looks work on it unchanged. All the levels use
// the mesh's own points, so it adds an index list about twice the mesh's own and nothing else.
//
// Games don't use this file: a Next Gen, AR or Board view finds its big still meshes and draws them this
// way by itself (hd3d.js autoDetail; `v.detail(mesh, { px })` tunes one, `mesh.userData.noDetail` opts out).
//
//   const cl = await clustersFor(geometry);                 // the tables, built once for a geometry's content
//   const m = new DetailMesh(geometry, material, cl);       // draws like a Mesh of that geometry
import { BatchedMesh, BufferGeometry, BufferAttribute, DataTexture, RGBAFormat, FloatType, RedIntegerFormat, UnsignedIntType, Matrix4, Frustum, Vector3, Vector2, Mesh } from 'three';

/** Tuning (the Next Gen view sets these; tests read stats). */
export const DETAIL = {
  /** Pixels of error allowed in the picture (the size the 3D is drawn at, before upscaling). */
  px: 1,
  /** The same in a shadow map, in its own pixels (shadows are filtered over a few). */
  shadowPx: 1.5,
  /** The camera whose picks are counted in stats (the view's own). */
  camera: null,
};
/**
 * What the last frame drew through cluster detail, for DETAIL.camera: meshes, clusters and runs (draws)
 * picked, triangles drawn, and the triangles those meshes have in full; and for every camera of the frame
 * (shadow maps too): picks made again (a camera or mesh that moved) and the milliseconds they took.
 */
export const stats = { meshes: 0, clusters: 0, draws: 0, tris: 0, full: 0, picks: 0, ms: 0 };
/** Starts a frame's count (the view calls it before it draws). */
export function frame(camera) { DETAIL.camera = camera; stats.meshes = stats.clusters = stats.draws = stats.tris = stats.full = stats.picks = stats.ms = 0; }

const MAX_DRAWS = 16384;   // most runs one mesh can draw (the size of the shared id texture below)

/** A mesh's cluster tables (detail-build.js buildClusters), with the per-frame pick. Shared by every mesh drawn from them. */
export class Clusters {
  constructor(d) {
    Object.assign(this, d);
    this.n = d.start.length; this.groups = d.gFirst.length; this.fullTris = d.tris[0];
    let c = 0; for (let i = 0; i < d.roots; i++) c += d.count[i]; this.coarseTris = c / 3;   // the fewest triangles it can be drawn with
    this.seen = new Uint32Array(this.groups); this.open = new Uint8Array(this.groups); this.stamp = 0;
    this.stack = new Uint32Array(this.n); this.out = new Uint32Array(this.n);
    this.bytes = d.index.byteLength + this.n * 32 + this.groups * 28;
  }
  /**
   * The clusters to draw from a camera at (cx, cy, cz) in the mesh's own space. k: how many times its
   * error a group's distance must be before its coarser version will do (pixels a unit covers at one
   * unit's distance, over the pixels of error allowed); ortho: no distance in it (k is then pixels a unit
   * covers anywhere); near: distances are never taken as less; planes: the view's six planes (x, y, z, w
   * each, pointing in), or null to leave out nothing; slack: how far outside a plane still counts as in
   * view. Returns how many; their numbers are in this.out, sorted.
   */
  pick(cx, cy, cz, k, near, ortho, planes, slack = 0) {
    const { refined, gFirst, gCount, gSphere, gError, sphere, seen, open, stack, out } = this;
    let stamp = ++this.stamp; if (stamp > 4e9) { seen.fill(0); stamp = this.stamp = 1; }
    let sp = 0, n = 0;
    for (let c = this.roots - 1; c >= 0; c--) stack[sp++] = c;
    while (sp) {
      const c = stack[--sp], g = refined[c];
      if (g >= 0) {
        if (seen[g] !== stamp) {   // (asked once: every coarse cluster made from a group gets the same answer)
          seen[g] = stamp;
          const s = g * 4, x = gSphere[s], y = gSphere[s + 1], z = gSphere[s + 2], r = gSphere[s + 3];
          let st = 0;   // 0: its coarser version will do, 1: open it (draw its members, or finer), 2: all of it is out of view
          if (planes) for (let p = 0; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -r - slack) { st = 2; break; }
          if (!st) {
            if (ortho) st = gError[g] * k > 1 ? 1 : 0;
            else { const dx = x - cx, dy = y - cy, dz = z - cz; let d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r; if (d < near) d = near; st = gError[g] * k > d ? 1 : 0; }
          }
          open[g] = st;
          if (st === 1) for (let m = gFirst[g], e = m + gCount[g]; m < e; m++) stack[sp++] = m;
        }
        if (open[g]) continue;
      }
      if (planes) {
        const s = c * 4, x = sphere[s], y = sphere[s + 1], z = sphere[s + 2], r = sphere[s + 3]; let hid = false;
        for (let p = 0; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -r - slack) { hid = true; break; }
        if (hid) continue;
      }
      out[n++] = c;
    }
    if (n > 1) out.subarray(0, n).sort();
    return n;
  }
}

// one camera's draw list for one mesh: runs of the index list, as three's batched drawing wants them (starts in bytes)
class Runs {
  constructor() { this.starts = new Int32Array(64); this.counts = new Int32Array(64); this.n = 0; this.key = new Float64Array(32).fill(NaN); this.tris = 0; this.clusters = 0; this.px = 1080; this.shadow = false; this.was = [0, 0, 0]; }
}

// Every DetailMesh is one copy, in its own place, so they all share one identity matrix and one list of
// zeros where a BatchedMesh keeps a matrix and an id for each of its copies. Shared, three.js also builds
// the batched shader once for a material, not once for every mesh.
let SH = null;
function shared() {
  if (SH) return SH;
  const one = () => { const a = new Float32Array(64); a[0] = a[5] = a[10] = a[15] = 1; const t = new DataTexture(a, 4, 4, RGBAFormat, FloatType); t.needsUpdate = true; return t; };
  const ids = new DataTexture(new Uint32Array(128 * 128), 128, 128, RedIntegerFormat, UnsignedIntType); ids.needsUpdate = true;
  const m = one(), prev = one(); prev.version = m.version;
  return SH = { m, prev, ids };
}
let ONES = new Int32Array(256).fill(1);

// the geometry a DetailMesh draws: the source's own points and the cluster index list (one for each source geometry)
const GEOS = new WeakMap();
function clusterGeometry(src, cl) {
  let e = GEOS.get(src);
  if (e && e.cl === cl) { e.users++; return e.g; }
  const g = new BufferGeometry();
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.setIndex(new BufferAttribute(cl.index, 1));
  if (!src.boundingSphere) src.computeBoundingSphere(); if (!src.boundingBox) src.computeBoundingBox();
  g.boundingSphere = src.boundingSphere.clone(); g.boundingBox = src.boundingBox.clone();
  g.name = (src.name || 'mesh') + ':detail';
  GEOS.set(src, e = { g, cl, users: 1 });
  return g;
}
function releaseGeometry(src) {
  const e = GEOS.get(src); if (!e || --e.users > 0) return;
  GEOS.delete(src);
  for (const k of Object.keys(e.g.attributes)) e.g.deleteAttribute(k);   // (the points are the source's: only the index list goes)
  e.g.dispose();
}

const M = new Matrix4(), INV = new Matrix4(), FR = new Frustum(), CP = new Vector3(), SZ = new Vector2(), RAY = new Mesh(), HITS = [];
// the height in pixels of what the renderer is drawing into now
const heightOf = r => { const t = r.getRenderTarget?.(); return t ? t.height : r.getDrawingBufferSize(SZ).y; };
let FRAME = 0;

/**
 * A mesh drawn in clusters: looks like `new Mesh(geometry, material)`, costs what shows. geometry: the
 * full mesh (its attributes are used as they are, and it answers raycasts); clusters: its Clusters
 * (clustersFor(geometry)). px: pixels of error allowed (default DETAIL.px).
 */
export class DetailMesh extends BatchedMesh {
  constructor(geometry, material, clusters, { px = null } = {}) {
    super(1, 3, 3, material);   // (none of BatchedMesh's own storage is used: one copy, the clusters are ranges of one index list)
    const sh = shared();
    this._matricesTexture.dispose(); this._indirectTexture.dispose();
    this._matricesTexture = sh.m; this._indirectTexture = sh.ids; this._previousMatricesTexture = sh.prev;
    this.isDetailMesh = true;
    this.source = geometry; this.clusters = clusters; this.px = px; clusters.users = (clusters.users || 0) + 1;
    this.geometry = clusterGeometry(geometry, clusters);
    this.boundingSphere = this.geometry.boundingSphere; this.boundingBox = this.geometry.boundingBox;
    this.perObjectFrustumCulled = false; this.sortObjects = false;
    this._views = new Map(); this._shadow = false; this._last = null; this._frame = -1; this._counted = null;
  }
  computeBoundingBox() { this.geometry.computeBoundingBox(); this.boundingBox = this.geometry.boundingBox; }
  computeBoundingSphere() { this.geometry.computeBoundingSphere(); this.boundingSphere = this.geometry.boundingSphere; }
  /** Triangles in the full mesh. */
  get fullTris() { return this.clusters.fullTris; }
  // the runs for a camera: picked again only when the camera, the mesh or the picture's size has changed.
  // px: the height of what is being drawn into and shadow: a shadow map, when the caller knows (the hooks
  // below); three's own batch node asks without knowing, and gets what that camera drew into last
  _runs(camera, px, shadow) {
    // (a camera can draw the scene more than once a frame at different sizes, as the kit's half-size depth pass does: each size keeps its own answer)
    let list = this._views.get(camera), v = null;
    if (!list) { if (this._views.size > 24) this._views.clear(); this._views.set(camera, list = []); }
    if (px == null) v = list[0];
    else for (let i = 0; i < list.length; i++) if (list[i].px === px && list[i].shadow === shadow) { v = list[i]; list[i] = list[0]; list[0] = v; break; }
    if (!v) { v = list.length > 2 ? list.pop() : new Runs(); v.key.fill(NaN); v.px = px ?? 1080; v.shadow = shadow; list.unshift(v); }
    const cl = this.clusters, pe = camera.projectionMatrix.elements, ortho = pe[15] !== 0;
    const e = this.matrixWorld.elements, s = Math.hypot(e[0], e[1], e[2]) || 1;
    const tau = (this.px ?? DETAIL.px) * (v.shadow ? DETAIL.shadowPx : 1), k = (ortho ? s : 1) * v.px * Math.abs(pe[5]) * .5 / tau;
    CP.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(INV.copy(this.matrixWorld).invert());
    FR.setFromProjectionMatrix(M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.matrixWorld), camera.coordinateSystem, camera.reversedDepth);
    // The same camera in the same place: the old answer stands. A picture that is jittered a fraction of a
    // pixel each frame (the kit's anti-aliasing) moves the view's planes by that much, so planes within
    // two pixels of the ones last picked for count as the same, and the pick keeps that much beyond them.
    const K = v.key, bs = this.geometry.boundingSphere, reach = Math.hypot(CP.x - bs.center.x, CP.y - bs.center.y, CP.z - bs.center.z) + bs.radius, eps = 2 / v.px;
    let same = K[0] === CP.x && K[1] === CP.y && K[2] === CP.z && K[3] === k && K[4] === (ortho ? 1 : 0);
    for (let i = 0; i < 6 && same; i++) {
      const p = FR.planes[i], n = p.normal, o = 5 + i * 4, at = n.x * CP.x + n.y * CP.y + n.z * CP.z + p.constant;   // (at: how far the camera is from the plane, so a turn and a slide are told apart)
      if (!(Math.hypot(K[o] - n.x, K[o + 1] - n.y, K[o + 2] - n.z) + Math.abs(K[o] * CP.x + K[o + 1] * CP.y + K[o + 2] * CP.z + K[o + 3] - at) / reach <= eps)) same = false;
    }
    if (!same) {
      const t0 = performance.now();
      K[0] = CP.x; K[1] = CP.y; K[2] = CP.z; K[3] = k; K[4] = ortho ? 1 : 0;
      for (let i = 0; i < 6; i++) { const p = FR.planes[i], o = 5 + i * 4; K[o] = p.normal.x; K[o + 1] = p.normal.y; K[o + 2] = p.normal.z; K[o + 3] = p.constant; }
      const st = cl.start, ct = cl.count, ids = cl.out, bytes = cl.index.BYTES_PER_ELEMENT, planes = K.subarray(5, 29), near = (camera.near || .1) / s, slack = eps * reach;
      // (more runs than a mesh may draw, which takes a mesh of millions of triangles seen whole and close: picked again a little coarser)
      for (let kk = k; ; kk /= 1.5) {
        const n = cl.pick(CP.x, CP.y, CP.z, kk, near, ortho, planes, slack);
        let runs = 0, tris = 0, end = -1;
        for (let i = 0; i < n && runs <= MAX_DRAWS; i++) {
          const c = ids[i], cnt = ct[c]; if (!cnt) continue;
          tris += cnt;
          if (st[c] === end) { v.counts[runs - 1] += cnt; end += cnt; continue; }   // carries straight on from the last one: the same draw
          if (runs === MAX_DRAWS) { runs++; break; }
          if (runs === v.starts.length) { const a = new Int32Array(runs * 2), b = new Int32Array(runs * 2); a.set(v.starts); b.set(v.counts); v.starts = a; v.counts = b; }
          v.starts[runs] = st[c] * bytes; v.counts[runs] = cnt; runs++; end = st[c] + cnt;
        }
        if (runs > MAX_DRAWS) continue;
        v.n = runs; v.tris = tris / 3; v.clusters = n; break;
      }
      stats.picks++; stats.ms += performance.now() - t0;
    }
    if (camera === DETAIL.camera && v !== this._counted) {   // (counted once a frame, as its biggest picture drew it)
      const c = this._frame === FRAME ? this._counted : null;
      if (!c || v.px > c.px) {
        if (c) { stats.clusters -= c.was[0]; stats.draws -= c.was[1]; stats.tris -= c.was[2]; } else { stats.meshes++; stats.full += cl.fullTris; }
        v.was[0] = v.clusters; v.was[1] = v.n; v.was[2] = v.tris;
        stats.clusters += v.clusters; stats.draws += v.n; stats.tris += v.tris; this._frame = FRAME; this._counted = v;
      }
    } else if (camera === DETAIL.camera && this._frame !== FRAME) {
      this._frame = FRAME; stats.meshes++; stats.full += cl.fullTris; v.was[0] = v.clusters; v.was[1] = v.n; v.was[2] = v.tris; stats.clusters += v.clusters; stats.draws += v.n; stats.tris += v.tris;
    }
    return v;
  }
  // Hands three.js the runs to draw. Called from the hooks below before every draw. three's batch node
  // calls it too (WebGPU), but only when it thinks the mesh changed, which a moving camera is not: so
  // the hooks are what keep it right, and the node's call (px unknown) repeats the camera's last answer.
  _updateDrawParameters(camera, geometry, material, drawFormat = 'multiDraw', px = null, shadow = false) {
    const v = this._runs(camera, px, shadow);
    let starts = v.starts, counts = v.counts, bytes = this.clusters.index.BYTES_PER_ELEMENT;
    if (material?.wireframe) {   // (three draws wireframe from a line list of its own: two indices for each one here)
      const wb = geometry.attributes.position.count > 65535 ? 4 : 2, w = v.wire ||= { starts: new Int32Array(0), counts: new Int32Array(0) };
      if (w.starts.length < v.n) { w.starts = new Int32Array(v.starts.length); w.counts = new Int32Array(v.starts.length); }
      for (let i = 0; i < v.n; i++) { w.starts[i] = starts[i] / bytes * 2 * wb; w.counts[i] = counts[i] * 2; }
      starts = w.starts; counts = w.counts; bytes = wb;
    }
    if (drawFormat === 'merged') {
      if (ONES.length < v.n) ONES = new Int32Array(Math.max(v.n, ONES.length * 2)).fill(1);
      this._mergedDrawStarts = starts; this._mergedDrawCounts = counts; this._mergedDrawInstanceCounts = ONES; this._mergedDrawCount = v.n;
    } else { this._multiDrawStarts = starts; this._multiDrawCounts = counts; }
    this._multiDrawCount = v.n; this._multiDrawBytesPerElement = bytes; this._visibilityChanged = false;
    this._last = v;
  }
  // (WebGPU draws a shadow map through onBeforeShadow and then onBeforeRender, with the light's camera in both; WebGL through onBeforeShadow alone)
  onBeforeRender(renderer, scene, camera, geometry, material) {
    this._updateDrawParameters(camera, geometry, material, renderer.backend?.isWebGPUBackend === true ? 'merged' : 'multiDraw', heightOf(renderer), this._shadow);
  }
  onBeforeShadow(renderer, object, camera, shadowCamera, geometry, depthMaterial) {
    this._shadow = true;
    if (renderer.isWebGPURenderer !== true) this._updateDrawParameters(shadowCamera, geometry, depthMaterial, 'multiDraw', heightOf(renderer), true);
  }
  onAfterShadow() { this._shadow = false; }
  /** Rays are tested against the full mesh. */
  raycast(raycaster, intersects) {
    RAY.geometry = this.source; RAY.material = this.material; RAY.matrixWorld = this.matrixWorld; HITS.length = 0;
    Mesh.prototype.raycast.call(RAY, raycaster, HITS);
    for (const h of HITS) { h.object = this; intersects.push(h); }
    HITS.length = 0;
  }
  copy() { throw new Error('A DetailMesh is made, not copied: new DetailMesh(geometry, material, clusters)'); }
  /** Lets go of its index list on the graphics chip (the source geometry and the material are yours). */
  dispose() {
    if (!this.source) return this;
    releaseGeometry(this.source); this.source = null; this._views.clear(); this.clusters.users--;
    this.dispatchEvent({ type: 'dispose' });
    return this;
  }
}
/** A new frame (the view calls it once before drawing): each mesh is counted once in stats. */
export function tick() { FRAME++; }

/* ---------- building: in a worker, kept by the mesh's content ---------- */
// A build is found again by what the mesh is (its numbers), not which object it is, so a level made
// again each round, or the same model made twice, costs nothing after the first. Big meshes are read at
// every few numbers (a mesh of a million points would take a frame to read in full); the answer is only
// index lists into the mesh's own points, so a mesh changed between the numbers read would be drawn from
// its old clusters, a little off in fineness but still whole.
const KEY_VERSION = 1, READ = 600000;
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
function hashArray(a, h) {
  const n = a.length, step = Math.max(1, Math.floor(n / READ));
  const u = a.BYTES_PER_ELEMENT === 4 && a.byteOffset % 4 === 0 ? new Uint32Array(a.buffer, a.byteOffset, n) : null;
  for (let i = 0; i < n; i += step) { let x; if (u) x = u[i]; else if (a instanceof Float32Array || a instanceof Float64Array) { F32[0] = a[i]; x = U32[0]; } else x = a[i]; h = Math.imul(h ^ x, 0x9E3779B1); h ^= h >>> 15; }
  return Math.imul(h ^ n, 0x85EBCA6B) >>> 0;
}
// the simplifier is told what else to keep true about a point besides its place: normals, UVs (by how much of the texture, not how many repeats), colours
const KEEP = [['normal', 3, .5], ['uv', 2, .5], ['color', 3, .25]];
function plain(at, size) { return at && !at.isInterleavedBufferAttribute && at.array instanceof Float32Array && at.itemSize >= size && at.array.length === at.count * at.itemSize; }
/** Can this geometry be drawn in clusters? (plain float positions, triangles) */
export function canCluster(g) {
  const p = g?.attributes?.position;
  return !!p && plain(p, 3) && p.itemSize === 3 && (g.index ? g.index.count : p.count) % 3 === 0 && !g.morphAttributes?.position && p.count < 2 ** 31 / 4;
}
/** The key a geometry's build is kept under (worked out once for a geometry, and again when its points or triangles are marked changed). */
const KEYS = new WeakMap();
export function keyOf(g, o = {}) {
  const p = g.attributes.position, ver = p.version + (g.index ? g.index.version * 65537 : 0), opt = (o.maxTris || 512) + '-' + (o.group || 8);
  const c = KEYS.get(g); if (c && c.ver === ver && c.opt === opt) return c.key;
  let h = hashArray(p.array, 0x1234567), h2 = g.index ? hashArray(g.index.array, 0x7654321) : 1, sig = '';
  for (const [name, size] of KEEP) { const a = g.attributes[name]; if (plain(a, size)) { sig += name[0] + a.itemSize; h2 = hashArray(a.array, h2); } }
  const key = [KEY_VERSION, p.count, g.index ? g.index.count : 0, sig, opt, h.toString(36), h2.toString(36)].join('-');
  KEYS.set(g, { ver, opt, key });
  return key;
}
// what a build needs from a geometry, as plain arrays (copied: the game keeps its own)
function inputOf(g) {
  const p = g.attributes.position, nv = p.count, parts = [];
  let stride = 0; const weights = [];
  for (const [name, size, w] of KEEP) {
    const a = g.attributes[name]; if (!plain(a, size)) continue;
    let k = w;
    if (name === 'uv') { let lo = Infinity, hi = -Infinity; const arr = a.array, st = Math.max(1, Math.floor(arr.length / 20000)); for (let i = 0; i < arr.length; i += st) { if (arr[i] < lo) lo = arr[i]; if (arr[i] > hi) hi = arr[i]; } k = w / Math.max(1, hi - lo); }
    parts.push({ array: a.array.slice(), size: a.itemSize, use: size }); stride += size; for (let i = 0; i < size; i++) weights.push(k);
  }
  return { positions: p.array.slice(), index: g.index ? g.index.array.slice() : null, nv, parts, stride, weights };
}

const mem = new Map();        // key -> { cl, t }: builds in memory, the ones not in use dropped oldest first past MEM bytes
const asked = new Map();      // key -> promise
const MEM = 96 * 1048576;
let clock = 0, worker = null, workerOff = typeof Worker !== 'function', seq = 0;
const waiting = new Map();
function theWorker() {
  if (worker || workerOff) return worker;
  try {
    worker = new Worker(new URL('./detail-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const q = waiting.get(e.data.id); waiting.delete(e.data.id); if (q) e.data.error === undefined ? q.res(e.data.r) : q.rej(new Error(e.data.error)); };
    // a worker that won't start, or dies: what it was asked, and everything after, is built here instead
    worker.onerror = () => { workerOff = true; worker = null; for (const q of waiting.values()) q.rej(new Error('worker')); waiting.clear(); };
  } catch (e) { workerOff = true; worker = null; }
  return worker;
}
const ask = (msg, transfer = []) => new Promise((res, rej) => { const w = theWorker(); if (!w) { rej(new Error('worker')); return; } const id = ++seq; waiting.set(id, { res, rej }); w.postMessage({ id, ...msg }, transfer); });
/** Asks the detail worker for a job (kit use: relief.js); rejects when there is no worker. */
export const work = (msg, transfer) => ask(msg, transfer);
/** Is there a worker to ask? (false in Node, and after one failed to start) */
export const canWork = () => !workerOff;
// no workers here (or Node): built on the spot
async function buildHere(input, o) { const B = await import('./detail-build.js'); await B.buildReady; return B.buildFrom(input, o); }
function tidy() {
  let sum = 0; for (const e of mem.values()) sum += e.cl.bytes;
  if (sum <= MEM) return;
  for (const [k, e] of [...mem].sort((a, b) => a[1].t - b[1].t)) { if (sum <= MEM) break; if (e.cl.users > 0) continue; mem.delete(k); sum -= e.cl.bytes; }
}
/** The build in memory for this geometry, or null (never waits). */
export function clustersNow(g, o = {}) { const e = mem.get(keyOf(g, o)); if (!e) return null; e.t = ++clock; return e.cl; }
/**
 * A geometry's Clusters: from memory, the saved copy (IndexedDB, read in the worker), or built now in the
 * worker (about four seconds for a million triangles on a desktop, once for a mesh's content). Rejects
 * if it can't be built (the mesh then just draws whole). Outside a browser (tests) it is built on the spot.
 */
export function clustersFor(g, o = {}) {
  const key = keyOf(g, o), have = mem.get(key);
  if (have) { have.t = ++clock; return Promise.resolve(have.cl); }
  let p = asked.get(key);
  if (!p) {
    p = (async () => {
      let d = null;
      if (!workerOff) d = await ask({ op: 'get', key }).catch(() => null);
      if (!d) {
        const input = inputOf(g), opts = { maxTris: o.maxTris || 512, group: o.group || 8 };
        const transfer = [input.positions.buffer, ...(input.index ? [input.index.buffer] : []), ...input.parts.map(a => a.array.buffer)];
        // (with no worker in a browser it is not built at all: the seconds it takes would freeze the game)
        if (!workerOff) d = await ask({ op: 'build', key, input, opts }, transfer);
        else if (typeof document === 'undefined') d = await buildHere(input, opts);
        else throw new Error('no worker to build in');
      }
      const cl = new Clusters(d); cl.key = key; cl.users = 0;
      mem.set(key, { cl, t: ++clock }); tidy();
      return cl;
    })().finally(() => asked.delete(key));
    asked.set(key, p);
  }
  return p;
}
/** Forgets the builds kept in memory and the saved ones (tests, Settings › clear cache). */
export async function clearBuilds() { mem.clear(); lmem.clear(); if (!workerOff) await ask({ op: 'clear' }).catch(() => {}); }

/* ---------- whole levels, for meshes drawn as many copies ---------- */
// A thing drawn as many copies (a gs.props kind) is small on screen for most of them, and each copy is
// near or far as a whole, so a copy gets a whole level, not a cut through clusters: the mesh simplified
// a few times over (detail-build.js buildLevels), each time with its measured error, and hd3d.js
// autoCopies draws each copy at the simplest level whose error doesn't show at its distance. Built and
// kept the same way as clusters: by the mesh's content, in the worker, saved for the next launch.
const lmem = new Map(), lasked = new Map();
/**
 * A geometry's whole detail levels: { levels (how many, 0: it won't simplify), index, start, count, error },
 * level i being index[start[i] .. start[i] + count[i]) with error[i] in the mesh's units. Rejects if they
 * can't be built (no worker in a browser).
 */
export function levelsFor(g) {
  const key = 'L-' + keyOf(g), have = lmem.get(key);
  if (have) return Promise.resolve(have);
  let p = lasked.get(key);
  if (!p) {
    p = (async () => {
      let d = null;
      if (!workerOff) d = await ask({ op: 'get', key }).catch(() => null);
      if (!d) {
        const input = inputOf(g), transfer = [input.positions.buffer, ...(input.index ? [input.index.buffer] : []), ...input.parts.map(a => a.array.buffer)];
        if (!workerOff) d = await ask({ op: 'levels', key, input, opts: {} }, transfer);
        else if (typeof document === 'undefined') { const B = await import('./detail-build.js'); await B.buildReady; d = B.levelsFrom(input, {}); }
        else throw new Error('no worker to build in');
      }
      d.key = key;
      if (lmem.size >= 256) lmem.delete(lmem.keys().next().value);
      lmem.set(key, d);
      return d;
    })().finally(() => lasked.delete(key));
    lasked.set(key, p);
  }
  return p;
}
/** Level i of a geometry's levels as a geometry of its own: the source's points, that level's triangles. */
export function levelGeometry(src, lv, i) {
  const g = new BufferGeometry();
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.setIndex(new BufferAttribute(lv.index.subarray(lv.start[i], lv.start[i] + lv.count[i]), 1));
  if (!src.boundingSphere) src.computeBoundingSphere(); if (!src.boundingBox) src.computeBoundingBox();
  g.boundingSphere = src.boundingSphere.clone(); g.boundingBox = src.boundingBox.clone();
  g.name = (src.name || 'mesh') + ':level' + (i + 1);
  return g;
}
