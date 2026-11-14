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
import { BatchedMesh, BufferGeometry, BufferAttribute, DataTexture, RGBAFormat, FloatType, RedIntegerFormat, UnsignedIntType, Matrix4, Frustum, Vector3, Vector2, Mesh, SkinnedMesh, Sphere, Box3 } from 'three';
import { floatsOf } from './slim.js';

/** Tuning (the Next Gen view sets these; tests read stats). */
export const DETAIL = {
  /** Pixels of error allowed in the picture (the size the 3D is drawn at, before upscaling). */
  px: 1,
  /** The same in a shadow map, in its own pixels (shadows are filtered over a few). */
  shadowPx: 1.5,
  /** The camera whose picks are counted in stats (the view's own). */
  camera: null,
  /** That camera's occlusion culling for this frame (occlusion.js; the view sets it): clusters behind something are left out of its picture. */
  occ: null,
};
/**
 * What the last frame drew through cluster detail, for DETAIL.camera: meshes, clusters and runs (draws)
 * picked, triangles drawn, the triangles left out because they are behind something (hid), and the triangles
 * those meshes have in full; and for every camera of the frame (shadow maps too): picks made again (a
 * camera or mesh that moved) and the milliseconds they took.
 */
export const stats = { meshes: 0, clusters: 0, draws: 0, tris: 0, hid: 0, full: 0, picks: 0, ms: 0 };
/** Starts a frame's count (the view calls it before it draws). */
export function frame(camera) { DETAIL.camera = camera; stats.meshes = stats.clusters = stats.draws = stats.tris = stats.hid = stats.full = stats.picks = stats.ms = 0; }

const MAX_DRAWS = 16384;   // most runs one mesh can draw (the size of the shared id texture below)
const IDS_SIDE = 128, IDS = IDS_SIDE * IDS_SIDE;   // a set of copies' id texture: draws (WebGL) or numbers in blocks (WebGPU)

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
   * view. occ: the view's occlusion culling (occlusion.js), with we, the mesh's world matrix, and ws, its
   * scale: a group or a cluster hidden behind something is left out (this.hid: the triangles that saved).
   * grow: how much nearer than its place at rest any part may come (a posed limb), taken off every distance.
   * Returns how many; their numbers are in this.out, sorted.
   */
  pick(cx, cy, cz, k, near, ortho, planes, slack = 0, occ = null, we = null, ws = 1, grow = 0) {
    const { refined, gFirst, gCount, gSphere, gError, sphere, seen, open, stack, out, count } = this;
    let stamp = ++this.stamp; if (stamp > 4e9) { seen.fill(0); stamp = this.stamp = 1; }
    let sp = 0, n = 0, hid = 0;
    const e0 = occ ? we[0] : 0, e1 = occ ? we[1] : 0, e2 = occ ? we[2] : 0, e4 = occ ? we[4] : 0, e5 = occ ? we[5] : 0, e6 = occ ? we[6] : 0, e8 = occ ? we[8] : 0, e9 = occ ? we[9] : 0, e10 = occ ? we[10] : 0, e12 = occ ? we[12] : 0, e13 = occ ? we[13] : 0, e14 = occ ? we[14] : 0;
    for (let c = this.roots - 1; c >= 0; c--) stack[sp++] = c;
    while (sp) {
      const c = stack[--sp], g = refined[c];
      if (g >= 0) {
        if (seen[g] !== stamp) {   // (asked once: every coarse cluster made from a group gets the same answer)
          seen[g] = stamp;
          const s = g * 4, x = gSphere[s], y = gSphere[s + 1], z = gSphere[s + 2], r = gSphere[s + 3];
          let st = 0;   // 0: its coarser version will do, 1: open it (draw its members, or finer), 2: all of it is out of view
          if (planes) for (let p = 0; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -r - slack) { st = 2; break; }
          if (!st && occ && occ.hiddenSphere(e0 * x + e4 * y + e8 * z + e12, e1 * x + e5 * y + e9 * z + e13, e2 * x + e6 * y + e10 * z + e14, r * ws)) st = 3;   // (3: all of it is behind something)
          if (!st) {
            if (ortho) st = gError[g] * k > 1 ? 1 : 0;
            else { const dx = x - cx, dy = y - cy, dz = z - cz; let d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r - grow; if (d < near) d = near; st = gError[g] * k > d ? 1 : 0; }
          }
          open[g] = st;
          if (st === 1) for (let m = gFirst[g], e = m + gCount[g]; m < e; m++) stack[sp++] = m;
        }
        if (open[g]) { if (open[g] === 3) hid += count[c]; continue; }
      }
      if (planes || occ) {
        const s = c * 4, x = sphere[s], y = sphere[s + 1], z = sphere[s + 2], r = sphere[s + 3]; let off = false;
        if (planes) for (let p = 0; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -r - slack) { off = true; break; }
        if (off) continue;
        if (occ && occ.hiddenSphere(e0 * x + e4 * y + e8 * z + e12, e1 * x + e5 * y + e9 * z + e13, e2 * x + e6 * y + e10 * z + e14, r * ws)) { hid += count[c]; continue; }
      }
      out[n++] = c;
    }
    this.hid = hid / 3;
    if (n > 1) out.subarray(0, n).sort();
    return n;
  }
}

// one camera's draw list for one mesh: runs of the index list, as three's batched drawing wants them (starts in bytes)
class Runs {
  constructor() { this.starts = new Int32Array(64); this.counts = new Int32Array(64); this.inst = null; this.n = 0; this.key = new Float64Array(32).fill(NaN); this.stamp = 0; this.tris = 0; this.hid = 0; this.clusters = 0; this.px = 1080; this.shadow = false; this.was = [0, 0, 0, 0]; }
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
// (copies: the cluster index list and one triangle of nothing after it, which the padding draws draw: a draw of no
// points at all is a thing WebGPU warns of. A geometry of the twin's own)
function copiesGeometry(src, cl) {
  const g = new BufferGeometry(), I = new cl.index.constructor(cl.index.length + 3);
  I.set(cl.index); I[cl.index.length] = I[cl.index.length + 1] = I[cl.index.length + 2] = cl.index.length ? cl.index[0] : 0;
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.setIndex(new BufferAttribute(I, 1));
  if (!src.boundingSphere) src.computeBoundingSphere(); if (!src.boundingBox) src.computeBoundingBox();
  g.boundingSphere = src.boundingSphere.clone(); g.boundingBox = src.boundingBox.clone();
  g.name = (src.name || 'mesh') + ':detail copies'; g.userData.gsNothing = cl.index.length;
  return g;
}
function releaseGeometry(src) {
  const e = GEOS.get(src); if (!e || --e.users > 0) return;
  GEOS.delete(src);
  for (const k of Object.keys(e.g.attributes)) e.g.deleteAttribute(k);   // (the points are the source's: only the index list goes)
  e.g.dispose();
}

const M = new Matrix4(), INV = new Matrix4(), FR = new Frustum(), CP = new Vector3(), SZ = new Vector2(), RAY = new Mesh(), HITS = [];
const VP = new Matrix4(), WF = new Frustum(), CW = new Vector3(), WJ = new Matrix4(), SP = new Sphere(), SW = new Sphere();
// the height in pixels of what the renderer is drawing into now
const heightOf = r => { const t = r.getRenderTarget?.(); return t ? t.height : r.getDrawingBufferSize(SZ).y; };
// (a shadow map drawn a part at a time, hd3d.js shadowTiles: the light's camera looks at the part alone, and the part is picked as finely as the whole map would be, so the parts fit together)
const partOf = cam => (cam.view?.enabled ? cam.view.height / cam.view.fullHeight : 1);
let FRAME = 0;

/**
 * A mesh drawn in clusters: looks like `new Mesh(geometry, material)`, costs what shows. geometry: the
 * full mesh (its attributes are used as they are, and it answers raycasts); clusters: its Clusters
 * (clustersFor(geometry)). px: pixels of error allowed (default DETAIL.px).
 */
export class DetailMesh extends BatchedMesh {
  constructor(geometry, material, clusters, { px = null, copies = null } = {}) {
    super(1, 3, 3, material);   // (none of BatchedMesh's own storage is used: one copy, the clusters are ranges of one index list)
    this._matricesTexture.dispose(); this._indirectTexture.dispose();
    if (copies) this._copiesOf(copies);
    else { const sh = shared(); this._matricesTexture = sh.m; this._indirectTexture = sh.ids; this._previousMatricesTexture = sh.prev; }
    this.isDetailMesh = true;
    this.source = geometry; this.clusters = clusters; this.px = px; clusters.users = (clusters.users || 0) + 1;
    this.geometry = copies ? copiesGeometry(geometry, clusters) : clusterGeometry(geometry, clusters);
    this.boundingSphere = this.geometry.boundingSphere; this.boundingBox = this.geometry.boundingBox;
    this.perObjectFrustumCulled = false; this.sortObjects = false;
    if (copies) { this._mw = new Float64Array(16).fill(NaN); this.syncCopies(); }
    this._views = new Map(); this._shadow = false; this._last = null; this._frame = -1; this._counted = null;
  }

  // Copies (a three InstancedMesh drawn in clusters): each copy is picked for on its own, from where the camera is
  // in that copy's own space, so a near copy is drawn fine and a far one from a few clusters, and copies out of
  // view not at all. The batched shader reads a copy's matrix by the number of the draw: on WebGL that number is
  // the draw's place in the frame's list (gl_DrawID), written for each camera into the id texture before it
  // draws; on WebGPU it is the draw's first instance, which only counts up through a frame's draws, while its
  // texture is sent once for all the cameras of a frame. So on WebGPU each copy has a block of SLOT numbers of its
  // own (id texture: number i is copy i / SLOT, written once) and the draws are padded up to their copy's block.
  _copiesOf(src) {
    const n = Math.max(1, src.instanceMatrix.count), side = Math.max(4, Math.ceil(Math.sqrt(n * 4) / 4) * 4);
    this.copySrc = src; this.copyMax = n; this.slot = Math.max(1, Math.floor(IDS / n)); this.copyStamp = 0; this._imv = -1; this._icv = -1; this._n = -1;
    this._matricesTexture = new DataTexture(new Float32Array(side * side * 4), side, side, RGBAFormat, FloatType);
    this._previousMatricesTexture = null;   // (three makes it the first time motion is drawn, and keeps it a frame behind)
    this._indirectTexture = new DataTexture(new Uint32Array(IDS), IDS_SIDE, IDS_SIDE, RedIntegerFormat, UnsignedIntType);
    this._ids = 'slots'; this._slotIds();
    if (src.instanceColor) {
      const c = new Float32Array(side * side * 4); this._colorsTexture = new DataTexture(c, side, side, RGBAFormat, FloatType);
    }
    this.frustumCulled = false;   // (each copy is culled as it is picked)
  }
  _slotIds() { const a = this._indirectTexture.image.data, S = this.slot, last = this.copyMax - 1; for (let i = 0; i < a.length; i++) a[i] = Math.min(last, (i / S) | 0); this._indirectTexture.needsUpdate = true; this._ids = 'slots'; this._idsFor = null; }
  /** Takes in the copies' places (and colours) when the InstancedMesh's have changed (the view calls it each frame). */
  syncCopies() {
    const src = this.copySrc; if (!src) return false;
    const n = Math.min(src.count, this.copyMax), im = src.instanceMatrix, ic = src.instanceColor;
    let changed = false;
    if (im.version !== this._imv || n !== this._n) {
      const a = this._matricesTexture.image.data; a.set(im.array.subarray(0, n * 16));
      this._matricesTexture.needsUpdate = true; this._imv = im.version; this._n = n; changed = true;
      // (a sphere round every copy, to say how far a camera is from all of them)
      const bs = this.geometry.boundingSphere, U = this._all ||= new Sphere(); U.makeEmpty();
      for (let i = 0; i < n; i++) { M.fromArray(im.array, i * 16); SP.copy(bs).applyMatrix4(M); U.union(SP); }
    }
    if (ic && this._colorsTexture && (ic.version !== this._icv || changed)) {
      const c = this._colorsTexture.image.data, k = ic.itemSize; for (let i = 0; i < n; i++) { c[i * 4] = ic.array[i * k]; c[i * 4 + 1] = ic.array[i * k + 1]; c[i * 4 + 2] = ic.array[i * k + 2]; c[i * 4 + 3] = 1; }
      this._colorsTexture.needsUpdate = true; this._icv = ic.version;
    }
    const w = this.matrixWorld.elements, kept = this._mw; let moved = false;   // (the set moved as a whole)
    for (let i = 0; i < 16; i++) if (kept[i] !== w[i]) { kept[i] = w[i]; moved = true; }
    if (changed || moved) this.copyStamp++;
    return changed;
  }
  // the runs of every copy for a camera, each run with its copy (v.inst)
  _runsCopies(camera, v, k0, ortho, eps) {
    const cl = this.copySrc ? this.clusters : null, src = this.copySrc, n = this._n, im = src.instanceMatrix.array;
    const st = cl.start, ct = cl.count, ids = cl.out, bytes = cl.index.BYTES_PER_ELEMENT, bs = this.geometry.boundingSphere, S = this.slot;
    const occ = camera === DETAIL.camera && !v.shadow && !ortho && DETAIL.occ?.ready ? DETAIL.occ : null;
    VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    WF.setFromProjectionMatrix(VP, camera.coordinateSystem, camera.reversedDepth);
    CW.setFromMatrixPosition(camera.matrixWorld);
    if (!v.inst || v.inst.length < v.starts.length) v.inst = new Int32Array(v.starts.length);
    let runs = 0, tris = 0, hid = 0, clusters = 0;
    const room = need => { if (runs + need <= v.starts.length) return; let m = v.starts.length; while (m < runs + need) m *= 2; const a = new Int32Array(m), b = new Int32Array(m), c = new Int32Array(m); a.set(v.starts); b.set(v.counts); c.set(v.inst); v.starts = a; v.counts = b; v.inst = c; };
    for (let j = 0; j < n; j++) {
      WJ.multiplyMatrices(this.matrixWorld, M.fromArray(im, j * 16));
      SP.copy(bs).applyMatrix4(WJ); if (!WF.intersectsSphere(SP)) continue;   // (a copy out of view: none of it)
      const e = WJ.elements, s = Math.hypot(e[0], e[1], e[2]) || 1;
      CP.copy(CW).applyMatrix4(INV.copy(WJ).invert());
      FR.setFromProjectionMatrix(M.multiplyMatrices(VP, WJ), camera.coordinateSystem, camera.reversedDepth);
      const P = this._planes ||= new Float64Array(24); for (let i = 0; i < 6; i++) { const p = FR.planes[i]; P[i * 4] = p.normal.x; P[i * 4 + 1] = p.normal.y; P[i * 4 + 2] = p.normal.z; P[i * 4 + 3] = p.constant; }
      const reach = Math.hypot(CP.x - bs.center.x, CP.y - bs.center.y, CP.z - bs.center.z) + bs.radius;
      for (let kk = (ortho ? s : 1) * k0; ; kk /= 1.5) {   // (more runs than a copy's block holds: picked again a little coarser)
        const c = cl.pick(CP.x, CP.y, CP.z, kk, (camera.near || .1) / s, ortho, P, eps * reach, occ, e, s);
        let r = 0, t = 0, end = -1; const at = runs;
        room(Math.min(c, S) + 1);
        for (let i = 0; i < c; i++) {
          const id = ids[i], cnt = ct[id]; if (!cnt) continue;
          t += cnt;
          if (st[id] === end) { v.counts[at + r - 1] += cnt; end += cnt; continue; }
          if (r === S) { r++; break; }
          room(r + 2); v.starts[at + r] = st[id] * bytes; v.counts[at + r] = cnt; v.inst[at + r] = j; r++; end = st[id] + cnt;
        }
        if (r > S) continue;
        runs += r; tris += t; hid += cl.hid; clusters += c; break;
      }
    }
    v.n = runs; v.tris = tris / 3; v.hid = hid; v.clusters = clusters;
    v.stamp = (v.stamp || 0) + 1;
  }
  computeBoundingBox() {
    if (this.copySrc) { const a = this._all, b = this._box ||= new Box3(); b.min.copy(a.center).subScalar(a.radius); b.max.copy(a.center).addScalar(a.radius); this.boundingBox = b; return; }   // (round every copy)
    this.geometry.computeBoundingBox(); this.boundingBox = this.geometry.boundingBox;
  }
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
    const cl = this.clusters, pe = camera.projectionMatrix.elements, ortho = pe[15] !== 0, copies = !!this.copySrc;
    const e = this.matrixWorld.elements, s = copies ? 1 : Math.hypot(e[0], e[1], e[2]) || 1;
    const tau = (this.px ?? DETAIL.px) * (v.shadow ? DETAIL.shadowPx : 1), k = (ortho ? s : 1) * v.px * Math.abs(pe[5]) * .5 / tau;
    // (copies: the camera and its view in the world's numbers, and each copy's own worked out as it is picked)
    if (copies) { CP.setFromMatrixPosition(camera.matrixWorld); FR.setFromProjectionMatrix(M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth); }
    else {
      CP.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(INV.copy(this.matrixWorld).invert());
      FR.setFromProjectionMatrix(M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.matrixWorld), camera.coordinateSystem, camera.reversedDepth);
    }
    // The same camera in the same place: the old answer stands. A picture that is jittered a fraction of a
    // pixel each frame (the kit's anti-aliasing) moves the view's planes by that much, so planes within
    // two pixels of the ones last picked for count as the same, and the pick keeps that much beyond them.
    const K = v.key, bs = copies ? SW.copy(this._all).applyMatrix4(this.matrixWorld) : this.geometry.boundingSphere, reach = Math.hypot(CP.x - bs.center.x, CP.y - bs.center.y, CP.z - bs.center.z) + bs.radius, eps = 2 / v.px;
    // (the view's own picture leaves out what is behind something: picked again when that changes, which a still camera's does not)
    const occ = camera === DETAIL.camera && !v.shadow && !ortho && DETAIL.occ?.ready ? DETAIL.occ : null, ostamp = occ ? occ.stamp : -1;
    let same = K[0] === CP.x && K[1] === CP.y && K[2] === CP.z && K[3] === k && K[4] === (ortho ? 1 : 0) && K[29] === ostamp && (!copies || K[30] === this.copyStamp);
    for (let i = 0; i < 6 && same; i++) {
      const p = FR.planes[i], n = p.normal, o = 5 + i * 4, at = n.x * CP.x + n.y * CP.y + n.z * CP.z + p.constant;   // (at: how far the camera is from the plane, so a turn and a slide are told apart)
      if (!(Math.hypot(K[o] - n.x, K[o + 1] - n.y, K[o + 2] - n.z) + Math.abs(K[o] * CP.x + K[o + 1] * CP.y + K[o + 2] * CP.z + K[o + 3] - at) / reach <= eps)) same = false;
    }
    if (!same && copies) {
      const t0 = performance.now();
      K[0] = CP.x; K[1] = CP.y; K[2] = CP.z; K[3] = k; K[4] = ortho ? 1 : 0; K[29] = ostamp; K[30] = this.copyStamp;
      for (let i = 0; i < 6; i++) { const p = FR.planes[i], o = 5 + i * 4; K[o] = p.normal.x; K[o + 1] = p.normal.y; K[o + 2] = p.normal.z; K[o + 3] = p.constant; }
      this._runsCopies(camera, v, k, ortho, eps);
      stats.picks++; stats.ms += performance.now() - t0;
    } else if (!same) {
      const t0 = performance.now();
      K[0] = CP.x; K[1] = CP.y; K[2] = CP.z; K[3] = k; K[4] = ortho ? 1 : 0; K[29] = ostamp;
      for (let i = 0; i < 6; i++) { const p = FR.planes[i], o = 5 + i * 4; K[o] = p.normal.x; K[o + 1] = p.normal.y; K[o + 2] = p.normal.z; K[o + 3] = p.constant; }
      const st = cl.start, ct = cl.count, ids = cl.out, bytes = cl.index.BYTES_PER_ELEMENT, planes = K.subarray(5, 29), near = (camera.near || .1) / s, slack = eps * reach;
      // (more runs than a mesh may draw, which takes a mesh of millions of triangles seen whole and close: picked again a little coarser)
      for (let kk = k; ; kk /= 1.5) {
        const n = cl.pick(CP.x, CP.y, CP.z, kk, near, ortho, planes, slack, occ, e, s);
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
        v.n = runs; v.tris = tris / 3; v.hid = cl.hid; v.clusters = n; break;
      }
      stats.picks++; stats.ms += performance.now() - t0;
    }
    if (camera === DETAIL.camera && v !== this._counted) {   // (counted once a frame, as its biggest picture drew it)
      const c = this._frame === FRAME ? this._counted : null;
      if (!c || v.px > c.px) {
        if (c) { stats.clusters -= c.was[0]; stats.draws -= c.was[1]; stats.tris -= c.was[2]; stats.hid -= c.was[3]; } else { stats.meshes++; stats.full += cl.fullTris; }
        v.was[0] = v.clusters; v.was[1] = v.n; v.was[2] = v.tris; v.was[3] = v.hid;
        stats.clusters += v.clusters; stats.draws += v.n; stats.tris += v.tris; stats.hid += v.hid; this._frame = FRAME; this._counted = v;
      }
    } else if (camera === DETAIL.camera && this._frame !== FRAME) {
      this._frame = FRAME; stats.meshes++; stats.full += cl.fullTris; v.was[0] = v.clusters; v.was[1] = v.n; v.was[2] = v.tris; v.was[3] = v.hid; stats.clusters += v.clusters; stats.draws += v.n; stats.tris += v.tris; stats.hid += v.hid;
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
    let n = v.n;
    if (this.copySrc && drawFormat === 'merged') {
      // (each copy's runs from the start of its block of numbers: a draw of nothing, as many instances as it takes, pads up to it)
      if (this._ids !== 'slots') this._slotIds();
      const P = v.pad ||= { starts: new Int32Array(0), counts: new Int32Array(0), inst: new Int32Array(0), stamp: -1, n: 0, wire: null };
      if (P.stamp !== v.stamp || P.wire !== starts) {
        if (P.starts.length < v.n * 2 + 1) { const m = v.n * 2 + 64; P.starts = new Int32Array(m); P.counts = new Int32Array(m); P.inst = new Int32Array(m); }
        let m = 0, at = 0; const S = this.slot, nothing = this.geometry.userData.gsNothing * this.clusters.index.BYTES_PER_ELEMENT;
        for (let i = 0; i < v.n; i++) {
          const want = v.inst[i] * S; if (i === 0 || v.inst[i] !== v.inst[i - 1]) { if (want > at) { P.starts[m] = nothing; P.counts[m] = 3; P.inst[m] = want - at; m++; at = want; } }
          P.starts[m] = starts[i]; P.counts[m] = counts[i]; P.inst[m] = 1; m++; at++;
        }
        P.n = m; P.stamp = v.stamp; P.wire = starts;
      }
      this._mergedDrawStarts = P.starts; this._mergedDrawCounts = P.counts; this._mergedDrawInstanceCounts = P.inst; this._mergedDrawCount = n = P.n;
    } else if (drawFormat === 'merged') {
      if (ONES.length < v.n) ONES = new Int32Array(Math.max(v.n, ONES.length * 2)).fill(1);
      this._mergedDrawStarts = starts; this._mergedDrawCounts = counts; this._mergedDrawInstanceCounts = ONES; this._mergedDrawCount = v.n;
    } else {
      this._multiDrawStarts = starts; this._multiDrawCounts = counts;
      if (this.copySrc && (this._idsFor !== v || this._idsStamp !== v.stamp)) {   // (WebGL: this camera's copy of each draw, sent before it draws)
        const a = this._indirectTexture.image.data; n = Math.min(n, a.length); a.set(v.inst.subarray(0, n));
        this._indirectTexture.needsUpdate = true; this._ids = 'draws'; this._idsFor = v; this._idsStamp = v.stamp;
      }
    }
    this._multiDrawCount = n; this._multiDrawBytesPerElement = bytes; this._visibilityChanged = false;
    this._last = v;
  }
  // (WebGPU draws a shadow map through onBeforeShadow and then onBeforeRender, with the light's camera in both; WebGL through onBeforeShadow alone)
  onBeforeRender(renderer, scene, camera, geometry, material) {
    this._updateDrawParameters(camera, geometry, material, renderer.backend?.isWebGPUBackend === true ? 'merged' : 'multiDraw', heightOf(renderer) * (this._shadow ? partOf(camera) : 1), this._shadow);
  }
  onBeforeShadow(renderer, object, camera, shadowCamera, geometry, depthMaterial) {
    this._shadow = true;
    if (renderer.isWebGPURenderer !== true) this._updateDrawParameters(shadowCamera, geometry, depthMaterial, 'multiDraw', heightOf(renderer) * partOf(shadowCamera), true);
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
    if (this.copySrc) { for (const k of Object.keys(this.geometry.attributes)) this.geometry.deleteAttribute(k); this.geometry.dispose(); this._matricesTexture.dispose(); this._indirectTexture.dispose(); this._previousMatricesTexture?.dispose(); this._colorsTexture?.dispose(); this.copySrc = null; }
    else releaseGeometry(this.source); this.source = null; this._views.clear(); this.clusters.users--;
    this.dispatchEvent({ type: 'dispose' });
    return this;
  }
}

/* ---------- meshes on bones or with blend shapes: one cut, written into an index list of their own ---------- */
// A mesh posed on bones (a person, an animal) or moved by blend shapes has its points moved in the vertex shader
// (or by the chip's skinning pool, skin-gpu.js), not where its clusters were built. A cut through its clusters
// still holds for it: a patch is as fine as it must be by how far the camera is from the patch, and a posed arm
// is never more than an arm's length from where it was at rest. So the camera is put into the mesh's space at rest
// through the bone that carries most of it (the hips, the spine), every distance is taken as up to a quarter of
// the mesh's size nearer than it is (a limb swung out), and none of it is left out for being out of view (three
// culls the mesh as a whole). One cut serves the picture and every shadow map. It is written into an index list
// of the twin's own whenever it changes, so the twin is an ordinary SkinnedMesh (or Mesh) on the same bones,
// materials and blend shapes, and is skinned the ordinary way: on WebGL in its vertex shader, on WebGPU by the
// pool from the posed points of the mesh it stands in for (userData.gsPoseOf), posed once for all its parts.
const LEAD = new WeakMap();   // geometry -> the bone that carries most of its points
function leadBone(g) {
  let b = LEAD.get(g); if (b !== undefined) return b;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight; b = 0;
  if (si && sw) {
    const sum = new Float64Array(65536), n = si.count, step = Math.max(1, Math.floor(n / 20000)); let best = 0;
    for (let i = 0; i < n; i += step) for (let c = 0; c < 4; c++) { const k = si.getComponent(i, c), w = sw.getComponent(i, c); if (w > 0 && k < 65536) { sum[k] += w; if (sum[k] > best) { best = sum[k]; b = k; } } }
  }
  LEAD.set(g, b); return b;
}
const CUT_MOVE = .04, CUT_K = .03, CUT_GROW = .25;
/**
 * A twin that draws a mesh on bones or with blend shapes through a cut of its clusters (the view makes these:
 * hd3d.js autoDetail). src: the mesh; geometry: its geometry or one part of it (partsOf); material: what that
 * part draws with. Returns a SkinnedMesh or Mesh; cutUpdate() it each frame before it is drawn.
 */
export function cutTwin(src, geometry, material, clusters, { px = null } = {}) {
  const g = new BufferGeometry(), full = clusters.fullTris * 3;
  for (const k in geometry.attributes) g.setAttribute(k, geometry.attributes[k]);
  g.morphAttributes = geometry.morphAttributes; g.morphTargetsRelative = geometry.morphTargetsRelative;
  const ix = new BufferAttribute(new clusters.index.constructor(full), 1); ix.setUsage?.(35048);   // (DynamicDrawUsage: rewritten as the camera comes and goes)
  g.setIndex(ix); g.setDrawRange(0, 0);
  if (!geometry.boundingSphere) geometry.computeBoundingSphere(); if (!geometry.boundingBox) geometry.computeBoundingBox();
  g.boundingSphere = geometry.boundingSphere; g.boundingBox = geometry.boundingBox;
  g.userData.gsSource = geometry.userData.gsSource || geometry; g.name = (geometry.name || 'mesh') + ':cut';
  const t = src.isSkinnedMesh ? new SkinnedMesh(g, material) : new Mesh(g, material);
  if (src.isSkinnedMesh) { t.bindMode = src.bindMode; t.bind(src.skeleton, src.bindMatrix); }
  if (src.morphTargetInfluences) { t.morphTargetInfluences = src.morphTargetInfluences; t.morphTargetDictionary = src.morphTargetDictionary; }
  t.isCutMesh = true; t.frustumCulled = src.frustumCulled; t.userData.gsPoseOf = src; t.userData.noLod = true;   // (its triangles are the cut's: never a simpler copy of its own)
  t.cut = { src, cl: clusters, px, key: new Float64Array(5).fill(NaN), last: new Uint32Array(0), ln: -1, tris: 0, clusters: 0, frame: -1, full: clusters.fullTris };
  return t;
}
const BW = new Matrix4();
/** Picks the twin's cut for the view's camera (its picture px high) and sends it when it changed. */
export function cutUpdate(t, camera, px) {
  const C = t.cut, src = C.src, cl = C.cl, pe = camera.projectionMatrix.elements, ortho = pe[15] !== 0;
  // (culled by the mesh's own bounds, as the mesh would be: a posed mesh's are worked out once, from its pose then, in its own place)
  if (src.isSkinnedMesh && !src.boundingSphere) src.computeBoundingSphere();
  t.boundingSphere = src.boundingSphere || t.geometry.boundingSphere; t.frustumCulled = src.frustumCulled;
  // where the mesh's points at rest are in the world, through its lead bone (or its own place, with no bones)
  if (src.isSkinnedMesh && src.skeleton) {
    const sk = src.skeleton, b = Math.min(leadBone(t.geometry.userData.gsSource || t.geometry), sk.bones.length - 1), bone = sk.bones[b];
    if (t.skeleton !== sk || t.bindMatrix !== src.bindMatrix) { t.bindMode = src.bindMode; t.bind(sk, src.bindMatrix); }
    BW.multiplyMatrices(bone.matrixWorld, sk.boneInverses[b]).multiply(src.bindMatrix);
    if (src.bindMode === 'detached') BW.premultiply(INV.multiplyMatrices(src.matrixWorld, src.bindMatrixInverse));
  } else BW.copy(src.matrixWorld);
  const e = BW.elements, s = Math.hypot(e[0], e[1], e[2]) || 1, tau = (C.px ?? t.px ?? DETAIL.px);
  const k = (ortho ? s : 1) * px * Math.abs(pe[5]) * .5 / tau;
  CP.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(INV.copy(BW).invert());
  const bs = t.geometry.boundingSphere, d = Math.max(1e-6, Math.hypot(CP.x - bs.center.x, CP.y - bs.center.y, CP.z - bs.center.z)), K = C.key;
  // (picked again once the camera has come or gone a few hundredths of the way, or the picture's size changed)
  if (!(Math.hypot(CP.x - K[0], CP.y - K[1], CP.z - K[2]) < d * CUT_MOVE && Math.abs(k - K[3]) <= K[3] * CUT_K && K[4] === (ortho ? 1 : 0))) {
    const t0 = performance.now();
    K[0] = CP.x; K[1] = CP.y; K[2] = CP.z; K[3] = k; K[4] = ortho ? 1 : 0;
    const n = cl.pick(CP.x, CP.y, CP.z, k, (camera.near || .1) / s, ortho, null, 0, null, null, 1, src.isSkinnedMesh ? bs.radius * CUT_GROW : 0), out = cl.out;
    let same = n === C.ln; for (let i = 0; i < n && same; i++) if (C.last[i] !== out[i]) same = false;
    if (!same) {
      if (C.last.length < n) C.last = new Uint32Array(Math.max(n, C.last.length * 2));
      C.last.set(out.subarray(0, n)); C.ln = n;
      const ix = t.geometry.index, A = ix.array, I = cl.index, st = cl.start, ct = cl.count; let at = 0;
      for (let i = 0; i < n; i++) { const c = out[i], m = ct[c]; if (!m) continue; A.set(I.subarray(st[c], st[c] + m), at); at += m; }
      t.geometry.setDrawRange(0, at); ix.clearUpdateRanges?.(); ix.addUpdateRange(0, at); ix.needsUpdate = true;
      C.tris = at / 3; C.clusters = n; C.sent = (C.sent || 0) + 1;
    }
    stats.picks++; stats.ms += performance.now() - t0;
  }
  if (C.frame !== FRAME && camera === DETAIL.camera) { C.frame = FRAME; stats.meshes++; stats.full += C.full; stats.clusters += C.clusters; stats.draws++; stats.tris += C.tris; }
}
/** A new frame (the view calls it once before drawing): each mesh is counted once in stats. */
export function tick() { FRAME++; }
/** What the view's own picture drew of a twin in the frame just drawn (asked before tick()): [triangles, draws]. */
export const drawnOf = (m, out = [0, 0]) => {
  if (m.isCutMesh) { out[0] = m.cut.frame === FRAME ? m.cut.tris : 0; out[1] = m.cut.frame === FRAME ? 1 : 0; return out; }
  const c = m._frame === FRAME ? m._counted : null; out[0] = c ? c.was[2] : 0; out[1] = c ? c.was[1] : 0; return out;
};
/** Triangles the view's own picture drew of this mesh in the frame just drawn (asked before tick()). */
export const drawnTris = m => (m._frame === FRAME && m._counted ? m._counted.was[2] : 0);

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
  const fl = a instanceof Float32Array || a instanceof Float64Array || (typeof Float16Array !== 'undefined' && a instanceof Float16Array);
  for (let i = 0; i < n; i += step) { let x; if (u) x = u[i]; else if (fl) { F32[0] = a[i]; x = U32[0]; } else x = a[i]; h = Math.imul(h ^ x, 0x9E3779B1); h ^= h >>> 15; }
  return Math.imul(h ^ n, 0x85EBCA6B) >>> 0;
}
// the simplifier is told what else to keep true about a point besides its place: normals, UVs (by how much of the texture, not how many repeats), colours
const KEEP = [['normal', 3, .5], ['uv', 2, .5], ['color', 3, .25]];
function plain(at, size) { return at && !at.isInterleavedBufferAttribute && at.array instanceof Float32Array && at.itemSize >= size && at.array.length === at.count * at.itemSize; }
// (a normal, UV or colour list may be one the kit keeps in fewer bytes, slim.js: read as floats for the build)
function kept(at, size) { return at && !at.isInterleavedBufferAttribute && at.itemSize >= size && at.array.length === at.count * at.itemSize && (at.array instanceof Float32Array || at.normalized || (typeof Float16Array !== 'undefined' && at.array instanceof Float16Array)); }
const kindOf = at => (at.array instanceof Float32Array ? '' : at.array.constructor.name[0].toLowerCase() + at.array.BYTES_PER_ELEMENT);
/** Can this geometry be drawn in clusters? (plain float positions, triangles; blend shapes only for a cut twin, morphs true) */
export function canCluster(g, morphs = false) {
  const p = g?.attributes?.position;
  return !!p && plain(p, 3) && p.itemSize === 3 && (g.index ? g.index.count : p.count) % 3 === 0 && (morphs || !g.morphAttributes?.position) && p.count < 2 ** 31 / 4;
}
/** The key a geometry's build is kept under (worked out once for a geometry, and again when its points or triangles are marked changed). */
const KEYS = new WeakMap();
export function keyOf(g, o = {}) {
  const p = g.attributes.position, ver = p.version + (g.index ? g.index.version * 65537 : 0), keep = g.userData.gsKeep;
  const opt = (o.maxTris || 512) + '-' + (o.group || 8) + (o.sloppy === false ? '-n' : '') + (keep ? '-k' + keepKey(keep) : '') + (o.heads ? '-p' + keepKey(o.heads) : '') + (o.morphs ? '-m' : '');
  const c = KEYS.get(g); if (c && c.ver === ver && c.opt === opt) return c.key;
  let h = hashArray(p.array, 0x1234567), h2 = g.index ? hashArray(g.index.array, 0x7654321) : 1, sig = '';
  for (const [name, size] of KEEP) { const a = g.attributes[name]; if (kept(a, size)) { sig += name[0] + a.itemSize + kindOf(a); h2 = hashArray(a.array, h2); } }
  const key = [KEY_VERSION, p.count, g.index ? g.index.count : 0, sig, opt, h.toString(36), h2.toString(36)].join('-');
  KEYS.set(g, { ver, opt, key });
  return key;
}
// what a build needs from a geometry, as plain arrays (copied: the game keeps its own)
function inputOf(g, o = {}) {
  const p = g.attributes.position, nv = p.count, parts = [];
  let stride = 0; const weights = [];
  for (const [name, size, w] of KEEP) {
    const a = g.attributes[name]; if (!kept(a, size)) continue;
    let k = w; const arr = floatsOf(a);
    if (name === 'uv') { let lo = Infinity, hi = -Infinity; const st = Math.max(1, Math.floor(arr.length / 20000)); for (let i = 0; i < arr.length; i += st) { if (arr[i] < lo) lo = arr[i]; if (arr[i] > hi) hi = arr[i]; } k = w / Math.max(1, hi - lo); }
    parts.push({ array: arr, size: a.itemSize, use: size }); stride += size; for (let i = 0; i < size; i++) weights.push(k);
  }
  // A mesh on bones or with blend shapes is drawn moved, not as it is at rest: a straight tube on four bones loses
  // its rings for nothing at rest, and those rings are its bend once posed. So the simplifier is also told where
  // each point goes in two test poses (every bone turned half a radian about its own head, each about an axis of
  // its own; o.heads: the bones' heads at rest, three numbers each) and how far each blend shape moves it, in
  // metres like the mesh: a patch is only drawn coarser where it would hold its shape in those too.
  for (const d of moved(g, o)) { parts.push({ array: d, size: 3, use: 3 }); stride += 3; weights.push(1, 1, 1); }
  return { positions: p.array.slice(), index: g.index ? g.index.array.slice() : null, nv, parts, stride, weights, keep: g.userData.gsKeep ? g.userData.gsKeep.slice() : null };
}
// how far each point moves in the test poses and blend shapes (lists of x, y, z for each point)
function moved(g, o) {
  const out = [], P = g.attributes.position, n = P.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, H = o.heads;
  if (H && si && sw) {
    const nb = H.length / 3;
    for (const pose of [0, 1]) {
      // each bone's turn: Rodrigues' rotation about an axis of its own (the same every build)
      const R = new Float64Array(nb * 9);
      for (let b = 0; b < nb; b++) {
        let ax = Math.sin(b * 1.31 + pose * 2.1), ay = Math.cos(b * 2.07 + pose), az = Math.sin(b * .71 + 1 + pose * 3.3); const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
        const c = Math.cos(.5), sn = Math.sin(.5), t = 1 - c, k = b * 9;
        R[k] = t * ax * ax + c; R[k + 1] = t * ax * ay - sn * az; R[k + 2] = t * ax * az + sn * ay;
        R[k + 3] = t * ax * ay + sn * az; R[k + 4] = t * ay * ay + c; R[k + 5] = t * ay * az - sn * ax;
        R[k + 6] = t * ax * az - sn * ay; R[k + 7] = t * ay * az + sn * ax; R[k + 8] = t * az * az + c;
      }
      const d = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i); let dx = 0, dy = 0, dz = 0;
        for (let c = 0; c < 4; c++) {
          const w = sw.getComponent(i, c), b = si.getComponent(i, c); if (!(w > 0) || b >= nb) continue;
          const k = b * 9, hx = H[b * 3], hy = H[b * 3 + 1], hz = H[b * 3 + 2], px = x - hx, py = y - hy, pz = z - hz;
          dx += w * (R[k] * px + R[k + 1] * py + R[k + 2] * pz - px); dy += w * (R[k + 3] * px + R[k + 4] * py + R[k + 5] * pz - py); dz += w * (R[k + 6] * px + R[k + 7] * py + R[k + 8] * pz - pz);
        }
        d[i * 3] = dx; d[i * 3 + 1] = dy; d[i * 3 + 2] = dz;
      }
      out.push(d);
    }
  }
  if (o.morphs) for (const m of (g.morphAttributes.position || []).slice(0, 2)) {
    const d = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { d[i * 3] = m.getX(i) - (g.morphTargetsRelative ? 0 : P.getX(i)); d[i * 3 + 1] = m.getY(i) - (g.morphTargetsRelative ? 0 : P.getY(i)); d[i * 3 + 2] = m.getZ(i) - (g.morphTargetsRelative ? 0 : P.getZ(i)); }
    out.push(d);
  }
  return out;
}
/** The bones' heads at rest, in a skinned mesh's own space at rest (for clustersFor's heads). */
export function headsOf(o) {
  const inv = o.skeleton.boneInverses, h = new Float32Array(inv.length * 3);
  for (let i = 0; i < inv.length; i++) { M.copy(inv[i]).invert().premultiply(INV.copy(o.bindMatrix).invert()); h[i * 3] = M.elements[12]; h[i * 3 + 1] = M.elements[13]; h[i * 3 + 2] = M.elements[14]; }
  return h;
}
const KEEPS = new WeakMap();
const keepKey = a => { let k = KEEPS.get(a); if (k === undefined) KEEPS.set(a, k = hashArray(a, 0x2468ace).toString(36)); return k; };

/* ---------- a mesh in several materials: each material's triangles drawn by a twin of their own ---------- */
// A geometry's groups (one a material, three's way of drawing a mesh in several) as geometries of their own, the
// source's points shared and each with only its group's triangles. Each is built and drawn on its own, and the
// points its triangles share with the other groups (the seams, by place: a seam between two materials is often
// split into two points for their two sets of UVs) are kept where they are at every level (userData.gsKeep), so
// the parts meet with no crack between them however differently each is drawn. Null: not in parts (no groups, or
// one that covers it all). Kept for the geometry until its triangles change.
const PARTS = new WeakMap();
export function partsOf(g) {
  const gs = g.groups; if (!gs || gs.length < 2) return null;
  const ver = g.index ? g.index.version : -1, have = PARTS.get(g);
  if (have && have.ver === ver) return have.parts;
  const n = g.index ? g.index.count : g.attributes.position.count, I = g.index ? g.index.array : null, at = i => (I ? I[i] : i);
  const parts = [];
  for (const gr of gs) {
    const a = Math.max(0, gr.start), b = Math.min(n, gr.start + (gr.count === Infinity ? n : gr.count));
    if (b - a < 3) continue;
    const own = new (n > 65535 || g.attributes.position.count > 65535 ? Uint32Array : Uint16Array)(b - a);
    for (let i = a; i < b; i++) own[i - a] = at(i);
    // (the other groups' points: the builder finds by place which of them this part shares)
    const rest = new Uint32Array(n - (b - a)); let k = 0;
    for (let i = 0; i < a; i++) rest[k++] = at(i);
    for (let i = b; i < n; i++) rest[k++] = at(i);
    const pg = new BufferGeometry();
    for (const key in g.attributes) pg.setAttribute(key, g.attributes[key]);
    pg.morphAttributes = g.morphAttributes; pg.morphTargetsRelative = g.morphTargetsRelative;
    pg.setIndex(new BufferAttribute(own, 1));
    if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox();
    pg.boundingSphere = g.boundingSphere; pg.boundingBox = g.boundingBox;
    pg.userData.gsKeep = rest; pg.userData.gsSource = g; pg.name = (g.name || 'mesh') + ':part' + parts.length;
    parts.push({ g: pg, material: gr.materialIndex ?? 0, tris: (b - a) / 3 });
  }
  PARTS.set(g, { ver, parts });
  return parts;
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
        const input = inputOf(g, o), opts = { maxTris: o.maxTris || 512, group: o.group || 8, sloppy: o.sloppy !== false };
        const transfer = [input.positions.buffer, ...(input.index ? [input.index.buffer] : []), ...(input.keep ? [input.keep.buffer] : []), ...input.parts.map(a => a.array.buffer)];
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
