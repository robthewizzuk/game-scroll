// Baked light (v.bakeLight({ ... })): the light of a level's still scenery, worked out by the phone itself the first time
// the game is played, kept on the phone, and only looked up after that.
//
// Consoles ship baked light as pictures made on the developer's computers. Game Scroll ships no pictures (each game is one
// file), so the phone bakes it: the first time a level is drawn, background workers send rays through a copy of its still
// triangles (bake-trace.js) while the loading screen builds the shaders on the graphics chip, and the result is kept in the
// app's own storage (IndexedDB), tile by tile, under what the tile's scenery was. Next time a tile whose scenery is the same
// is read back instead.
//
// What it gives:
//   light probes  a 3D grid of them over the level (three's LightProbeGrid, so every lit material reads it the standard way
//                 on WebGL and WebGPU, people and vehicles too as they move about): the sky's light as seen from each spot
//                 (less of it under a roof, in a doorway, under trees) and the sun's light bounced off what is round it
//                 (a sunlit wall lights the shade beside it). Kept in parts the game's own colours multiply in each frame,
//                 so the time of day changes them for nothing; only the sun's direction is traced again when it has moved.
//                 The view's hemisphere light (amb) stays as it is: three adds a grid's light to the rest and never lets
//                 the sum go below nothing, so the grid can only add. It holds the bounced light (the sky's and the
//                 sun's), and the light maps take away the sky where it is hidden.
//   light maps    for big meshes with their own UVs (Land's ground): how much of the sky each texel sees, in the
//                 material's aoMap (which darkens the hemisphere light and the grid's): the dark foot of a wall, a
//                 hollow, under a boulder.
// Both only where the graphics chip lets a material read more than 16 pictures (on WebGPU the kit's busiest materials
// already read 16, and one past the limit isn't drawn at all; on WebGL the probes go in whatever the limit).
// Live light stays live: the sun and its shadows, lamps, flashes, and anything moving. Things that move are left out of the
// bake (a mesh that moves while the level is watched is taken out, and the tiles round it baked again, a slice at a time).
//
// Where the live traced bounce grid (v.liveBounce = 'traced') runs, this grid stays out of the scene (that one carries the
// same bounce, live, and each grid is one more picture every lit material reads); the light maps stay.
// Kit use only (hd3d.js's bakeLight makes it, and calls before() before each picture it draws, hide() when it is off).
import { Data3DTexture, DataTexture, RGBAFormat, RedFormat, HalfFloatType, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping, Box3, Vector3, Matrix4, BackSide, DataUtils } from 'three';
import { LightProbeGridWebGL } from 'three/examples/jsm/lighting/LightProbeGridWebGL.js';
import { waitsOn, getready } from './getready.js';
import { colourOf } from './trace-scene.js';
import { eachShown } from './scene-list.js';
import { PROBE, gridOver, probePlaces, fillIn, combine, atlasSize, packAtlas } from './bake-grid.js';
// (the tracer itself runs in the workers; here only where there are none: loaded then)
const tracer = () => import('./bake-trace.js');

/** Bumped when what a bake works out changes: every kept bake is made again. */
export const BAKE_VERSION = 1;
// TILE: probes a side of a tile (all heights); SLICE: probes a job; TSLICE: texels a job; WAIT: how long the loading screen
// waits for a first bake (ms); SETTLE: how long the scenery may keep changing before the bake starts anyway (ms)
const TILE = 8, SLICE = 160, TSLICE = 6000, WAIT = 5000, SETTLE = 1500, SUN_TURN = Math.cos(4 * Math.PI / 180), FADE = 1.2;
const M4 = new Matrix4(), M5 = new Matrix4(), V = new Vector3(), BOX = new Box3();
/** What the bakes did (tests, the frame lab). */
export const bakeStats = { traced: 0, read: 0, probes: 0, texels: 0, ms: 0, failed: 0, last: null };

/* ---------- storage: IndexedDB, a record a tile (bake-store.js; read and written in a worker where there is one) ---------- */
import * as store from './bake-store.js';
export { clearBakes } from './bake-store.js';

/* ---------- the workers ---------- */
const CORES = () => Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 1));
class Crew {
  constructor() { this.ws = []; this.wait = new Map(); this.seq = 0; this.off = typeof Worker !== 'function'; this.rest = 0; this.local = null; }
  start() {
    clearTimeout(this.rest);
    while (!this.off && this.ws.length < CORES()) {
      try {
        const w = new Worker(new URL('./bake-worker.js', import.meta.url), { type: 'module' }); w.n = 0;
        w.onmessage = e => { const q = this.wait.get(e.data.id); this.wait.delete(e.data.id); w.n--; if (q) { if (e.data.error === undefined) q.res(e.data.r); else q.rej(new Error(e.data.error)); } this.idle(); };
        w.onerror = () => { this.off = true; for (const [id, q] of this.wait) if (q.w === w) { this.wait.delete(id); q.rej(new Error('worker')); } };
        this.ws.push(w);
      } catch (e) { this.off = true; }
    }
  }
  idle() { if (!this.wait.size) { clearTimeout(this.rest); this.rest = setTimeout(() => this.stop(), 6000); } }
  stop() { for (const w of this.ws) w.terminate(); this.ws = []; for (const q of this.wait.values()) q.rej(new Error('stopped')); this.wait.clear(); this.local = null; }
  post(w, kind, data, transfer = []) {
    const id = ++this.seq; w.n++;
    return new Promise((res, rej) => { this.wait.set(id, { res, rej, w }); try { w.postMessage({ id, kind, data }, transfer); } catch (e) { this.wait.delete(id); w.n--; rej(e); } });
  }
  /** The workers, started and their code loaded (before there is work: while the level settles). */
  warm() { this.start(); for (const w of this.ws) if (!w.warm) { w.warm = true; this.post(w, 'hello', {}).catch(() => {}); } }
  /** The level: one worker builds it, and the others are given a copy of what it built (each keeps its own). */
  async scene(key, job) {
    this.start();
    if (this.off || !this.ws.length) return tracer().then(async T => { await T.bakeReady; this.local = { key, rays: new T.Rays(T.buildScene(job)), T }; });
    const [w0, ...rest] = this.ws, s = await this.post(w0, 'scene', { key, job });
    await Promise.all(rest.map(w => this.post(w, 'have', { key, scene: { nodes: s.nodes, T: s.T } })));
  }
  /** The store: read and written by the first worker (its answers don't wait behind the main thread's frames). */
  read(keys) { if (!keys.length) return Promise.resolve(new Map()); this.start(); return this.off || !this.ws.length ? store.readTiles(keys) : this.post(this.ws[0], 'read', { keys }).catch(() => new Map()); }
  write(recs) { if (!recs.length) return; this.start(); if (this.off || !this.ws.length) store.writeTiles(recs); else this.post(this.ws[0], 'write', { recs }).catch(() => {}); }
  /** A job for whichever worker has least on. */
  run(kind, data) {
    if (this.off || !this.ws.length) return this.here(kind, data);
    const w = this.ws.reduce((a, b) => (b.n < a.n ? b : a));
    return this.post(w, kind, data);
  }
  // no workers: on the spot (tests in Node, a phone that won't start one)
  async here(kind, data) {
    const T = await tracer(), { aoBytes } = await import('./bake-grid.js'); await T.bakeReady; await new Promise(r => setTimeout(r, 0));
    if (kind === 'map') return T.mapTexels(data.geo, data.m, data.size);
    const rays = this.local?.key === data.key ? this.local.rays : null; if (!rays) throw new Error('no level');
    if (kind === 'probes') return T.bakeProbes(rays, data);
    return aoBytes(T.bakeTexels(rays, data));
  }
}
const CREW = new Crew();

/* ---------- reading the scenery ---------- */
const fnv = (h, x) => Math.imul(h ^ (x | 0), 16777619) >>> 0;
const mixF = (h, f, q = 1000) => fnv(h, Math.round(f * q));
const mats = o => { const m = o.userData.gsGlMat || o.material; return Array.isArray(m) ? m : [m]; };
// a material that takes and stops light; a cut-out (leaves) only partly
function lookOf(m) {
  if (!m || m.visible === false || m.transparent || m.colorWrite === false || m.depthWrite === false || m.wireframe || m.side === BackSide) return null;
  if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial)) return null;
  const op = m.alphaTest > 0 || m.alphaHash ? alphaOf(m.map) : 1;
  // key: what the game set (not the picture's average colour: a picture painted with random streaks averages a little
  // differently each time the game is loaded, and the kept bake should still be found)
  const im = m.map?.image, key = fnv(fnv(fnv(fnv(2166136261, m.color ? m.color.getHex() : 0), (m.vertexColors ? 1 : 0) | (m.side === 2 ? 2 : 0) | (m.map ? 4 : 0)), im ? (im.width | 0) * 4099 + (im.height | 0) : 0), Math.round(op * 8));
  return { rgb: colourOf(m), op, tint: !!m.vertexColors, both: m.side === 2, key };
}
// how much of a cut-out's picture is solid (once a picture; a half where it can't be read)
const ALPHA = new WeakMap(); let pad = null;
function alphaOf(tex) {
  const im = tex?.image; if (!im) return .5;
  const had = ALPHA.get(tex); if (had && had.v === tex.version) return had.a;
  let a = .5;
  try {
    if (im.data && im.width) { const d = im.data, ch = d.length / (im.width * im.height) | 0; if (ch === 4) { let s = 0, n = 0, k = d instanceof Uint8Array || d instanceof Uint8ClampedArray ? 1 / 255 : 1; for (let i = 3; i < d.length; i += 4 * 61) { s += d[i] * k; n++; } a = s / n; } }
    else if (typeof document !== 'undefined' && (im.width || im.videoWidth)) {
      pad ||= Object.assign(document.createElement('canvas'), { width: 16, height: 16 }).getContext('2d', { willReadFrequently: true });
      pad.clearRect(0, 0, 16, 16); pad.drawImage(im, 0, 0, 16, 16); const d = pad.getImageData(0, 0, 16, 16).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; a = s / 255 / 256;
    }
  } catch (e) { a = .5; }
  a = Math.min(1, Math.max(.05, a)); ALPHA.set(tex, { v: tex.version, a });
  return a;
}
// a shape's numbers (plain floats), and a hash of them (once a geometry and version)
const SHAPES = new WeakMap();
function floats(at, n) {
  if (!at) return null;
  if (!at.isInterleavedBufferAttribute && !at.normalized && at.array instanceof Float32Array && at.itemSize === n && at.array.length === at.count * n) return at.array;
  const out = new Float32Array(at.count * n); for (let i = 0; i < at.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = c < at.itemSize ? at.getComponent(i, c) : 0;
  return out;
}
function shapeOf(g) {
  const p = g.attributes.position, ver = p.version + (g.index ? g.index.version : 0) * 7919, had = SHAPES.get(g);
  if (had && had.ver === ver) return had;
  const pos = floats(p, 3), idx = g.index ? g.index.array : null, col = g.attributes.color ? floats(g.attributes.color, 3) : null;
  let h = fnv(fnv(2166136261, p.count), idx ? idx.length : 0);
  for (let i = 0, st = Math.max(1, (p.count / 24) | 0); i < p.count; i += st) h = mixF(mixF(mixF(h, pos[i * 3]), pos[i * 3 + 1]), pos[i * 3 + 2]);
  g.boundingSphere || g.computeBoundingSphere(); g.boundingBox || g.computeBoundingBox();
  const s = { ver, pos, idx, col, h, r: g.boundingSphere.radius, c: g.boundingSphere.center.clone(), box: g.boundingBox.clone() };
  SHAPES.set(g, s);
  return s;
}
const maxScale = e => Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
// under the camera (a gun in hand), or part of something that moves (a vehicle: userData.moves on any of its parents)
function underCam(o, cam) { for (let p = o.parent; p; p = p.parent) if (p === cam || p.isCamera || p.userData.moves || p.userData.noBake) return true; return false; }
// the camera's layer, and the view's own for a mesh merged into a batch, drawn by its cluster-detail twin or waiting for its
// shader (hd3d.js BATCH_LAYER, HOLD_LAYER): all of them still the scenery (the batch and the twins themselves are not read)
const DRAWN = 1 | 1 << 26 | 1 << 29;
/**
 * What goes in the bake: a still mesh that stops light, big enough to matter (the same test for reading the scenery and for
 * telling whether it changed, so a thing left out can't keep starting bakes). Returns its geometry, or null.
 */
function inBake(o, cam, movers) {
  if (!o.isMesh || o.isSkinnedMesh || o.isBatchedMesh || o.isInstancedMesh2 || o.isDetailMesh || o.isCutMesh || o.morphTargetInfluences?.length) return null;
  const ud = o.userData; if (ud.gsTwin || ud.decal || ud.noBake || ud.moves || ud.gsBaked || o.name === 'gs-batch' || o.name === 'gs-detail' || !(o.layers.mask & DRAWN) || movers.has(o) || underCam(o, cam)) return null;
  const g = ud.gsLod?.base || o.geometry; if (!g?.attributes?.position || g.attributes.position.count < 3) return null;
  if (o.isInstancedMesh && o.count < 1) return null;
  if (!mats(o).some(lookOf)) return null;
  // tiny things (grass blades, pebbles) make no light worth the rays
  const sh = shapeOf(g); let sc = maxScale(o.matrixWorld.elements);
  if (o.isInstancedMesh) { o.getMatrixAt(0, M5); sc *= maxScale(M5.elements); }
  return sh.r * sc < .3 ? null : g;
}

/* ---------- the bake ---------- */
const BAKES = new Set();
waitsOn(() => {
  const now = performance.now(); let hard = 0;
  for (const b of BAKES) {
    if (b.firstDone || b.failed || b.hidden || !(now - (b.v.drawnAt || 0) < 1000)) continue;
    if (getready.warming) { b.askedAt ||= now; if (now - b.askedAt < b.wait) hard++; }
  }
  return hard ? { hard, soft: 0, what: 'Light' } : null;
});

export class LightBake {
  /**
   * v: the HDView. o: { box (a Box3, { min: [x, y, z], max } or an Object3D: where the probes go, the play area), spacing
   * (metres between probes: a number or [x, y, z]; 8), most (probes at most, 6000), maps ([meshes] to give light maps: big
   * still meshes with UVs laid out with no overlaps, like Land's ground), mapSize (512), rays (a probe's, 96), texelRays (24),
   * reach (how far a probe's rays look, 150 m), texelReach (40 m), bounce (how strong the bounced light is, 1), wait (ms the
   * loading screen waits for a first bake, 5000) }.
   */
  constructor(v, o = {}, pics) {
    this.v = v; this.o = o;
    this.box = boxOf(o.box);
    this.grid = gridOver({ min: this.box.min.toArray(), max: this.box.max.toArray() }, o.spacing ?? 8, o.most ?? 6000);
    this.rays = o.rays ?? 96; this.texelRays = o.texelRays ?? 24; this.reach = o.reach ?? 150; this.texelReach = o.texelReach ?? 40; this.bounce = o.bounce ?? 1;
    this.wait = o.wait ?? WAIT; this.mapSize = o.mapSize ?? 512;
    this.grids = [];   // [{ g: gridOver, data: Float32Array(PROBE a probe), have: Uint8Array, shown, target, tex: Data3DTexture, objs: { gl, gpu }, tiles: [...] }]
    this.maps = [];    // [{ mesh, mat, tex: DataTexture, size }]
    this.movers = new WeakSet(); this.mats = new WeakMap();
    // the things seen to move here before (kept on the phone with the bake): left out from the start next time, so the bake
    // made under the loading screen (where nothing moves yet) is the one that holds once they do
    this.known = new Set(); this.knownP = null; this.knownDirty = false;
    let lh = fnv(2166136261, BAKE_VERSION); for (const a of [this.grid.min, this.grid.max, this.grid.res]) for (const x of a) lh = mixF(lh, x, 100);
    this.level = 'm|' + lh.toString(36);
    this.state = 'new'; this.firstDone = false; this.failed = false; this.busy = false; this.k = 0; this.t = 0; this.dirty = true; this.version = 0;
    this.settleFrom = 0; this.lastPrint = 0; this.lastScan = 0; this.sunAt = null; this.sunQ = ''; this.combineAt = -1e9; this.combineKey = '';
    if (!(pics != null && !(pics > 16))) for (const mesh of [o.maps || []].flat()) this.addMap(mesh);
    this.addGrid(this.grid, 1);
    BAKES.add(this);
  }
  addMap(mesh) {
    const m = mesh?.material; if (!mesh?.isMesh || Array.isArray(m) || !m?.isMeshStandardMaterial && !m?.isMeshLambertMaterial && !m?.isMeshPhongMaterial) return;
    if (!mesh.geometry.attributes.uv) return;
    if (m.aoMap && !m.aoMap.userData?.gsBake) return;   // (one of its own: left alone)
    const size = this.mapSize, data = new Uint8Array(size * size).fill(255);
    const tex = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
    tex.minFilter = LinearMipmapLinearFilter; tex.magFilter = LinearFilter; tex.wrapS = tex.wrapT = ClampToEdgeWrapping; tex.generateMipmaps = true; tex.flipY = false; tex.channel = 0;
    tex.userData.gsBake = true; tex.needsUpdate = true;
    // (set now, before the material's shader is made: on the first frame; only its numbers change after)
    m.aoMap = tex; m.aoMapIntensity = 0; m.needsUpdate = true;
    this.maps.push({ mesh, mat: m, tex, size, tiles: null, texels: null });
  }
  addGrid(g, priority) {
    const [w, h, d] = atlasSize(g), tex = new Data3DTexture(new Uint16Array(w * h * d * 4), w, h, d);
    tex.format = RGBAFormat; tex.type = HalfFloatType; tex.minFilter = tex.magFilter = LinearFilter; tex.wrapS = tex.wrapT = tex.wrapR = ClampToEdgeWrapping; tex.generateMipmaps = false; tex.unpackAlignment = 1; tex.needsUpdate = true;
    const data = new Float32Array(g.count * PROBE); for (let p = 0; p < g.count; p++) data[p * PROBE + 63] = -1;
    const G = { g, data, have: new Uint8Array(g.count), sunHave: new Uint8Array(g.count), shown: new Float32Array(g.count * 27), from: null, tex, objs: {}, priority, tiles: [] };
    this.grids.push(G);
    return G;
  }
  // the grid's object for the renderer drawing (WebGL or WebGPU take different classes), with this bake's picture in it
  gridObj(G, gpu, kind) {
    let o = G.objs[kind];
    if (!o) {
      const g = G.g, C = gpu ? gpu.fx.LightProbeGrid : LightProbeGridWebGL;
      o = new C(g.size[0], g.size[1], g.size[2], ...g.res);
      o.position.set(g.min[0] + g.size[0] / 2, g.min[1] + g.size[1] / 2, g.min[2] + g.size[2] / 2); o.updateBoundingBox();
      o._renderTarget?.dispose?.(); o.texture = G.tex; o.priority = 0; o.name = 'gs-baked-light'; o.userData.gsBaked = true;
      G.objs[kind] = o;
    }
    return o;
  }

  /** Before a picture of the view is drawn (hd3d.js render, in the world's own numbers). drawn: the game's own frame (not a card picture). */
  before(gpu, drawn, pics) {
    const v = this.v, S = v.scene, now = performance.now(), kind = gpu ? 'gpu' : 'gl';
    this.hidden = false;
    // Only where a material may read more than 16 pictures (pics: the chip's limit a shader stage). On WebGPU the grid is one
    // more picture for every lit material and a light map one more for its own, and the kit's busiest (a surface with
    // relief, read by lamps, decals, far shadows, the sky's light...) already reads 16: one past the limit and it isn't
    // drawn at all. So on a chip that allows only 16 (WebGPU on some phones, software drawing) nothing is baked or shown;
    // WebGL's lights read fewer pictures, so there the grid stays and only the light maps need the room.
    if (gpu && !(pics > 16)) { this.hide(); return; }
    if (this.maps.length && pics != null && !(pics > 16)) this.dropMaps();   // (WebGL's limit isn't known before its first frame)
    // played: the workers start (their code loads while the level settles) and the store opens
    if (this.state === 'new' && drawn) { this.state = 'settle'; this.settleFrom = now; CREW.warm(); this.knownP = CREW.read([this.level]).then(m => { for (const x of m.get(this.level)?.list || []) this.known.add(x); }, () => {}); }
    // the grid, in the scene while it is drawn; not where a live traced bounce grid runs (v.liveBounce = 'traced': it wins
    // where it is, and each grid is one more picture every lit material reads)
    const live = !!(v._tb?.run && !v._tb.run.failed);
    for (const G of this.grids) { const o = this.gridObj(G, gpu, kind); if (live) o.removeFromParent(); else if (o.parent !== S) S.add(o); for (const [k, x] of Object.entries(G.objs)) if (k !== kind) x.removeFromParent(); }
    // this frame's colours: the hemisphere light's (sky, ground) and the sun's
    const hemi = v.hemi;
    const C = hemi ? [hemi.color.r * hemi.intensity, hemi.color.g * hemi.intensity, hemi.color.b * hemi.intensity] : [0, 0, 0];
    const G0 = hemi ? [hemi.groundColor.r * hemi.intensity, hemi.groundColor.g * hemi.intensity, hemi.groundColor.b * hemi.intensity] : [0, 0, 0];
    const sun = v.sun?.isDirectionalLight && v.sun.visible ? v.sun : null, Sc = sun ? [sun.color.r * sun.intensity, sun.color.g * sun.intensity, sun.color.b * sun.intensity] : [0, 0, 0];
    if (drawn) this.step(now, sun);
    this.show(now, C, G0, Sc);
  }
  /** Not shown this frame (HD.baked = false: comparisons, the frame lab): the grids out, the light maps off. */
  dropMaps() { for (const M of this.maps) { if (M.mat.aoMap === M.tex) { M.mat.aoMap = null; M.mat.needsUpdate = true; } M.tex.dispose(); } this.maps = []; }
  hide() { this.hidden = true; for (const G of this.grids) for (const o of Object.values(G.objs)) o.removeFromParent(); for (const M of this.maps) M.mat.aoMapIntensity = 0; }

  /* --- the work: settle, read what is kept, trace the rest, keep it --- */
  step(now, sun) {
    if (this.failed) return;
    if (this.state === 'settle') {
      // wait for the scenery to stop changing (a level made a little each frame), then start
      if (now - this.lastScan < 120) return;
      this.lastScan = now;
      const sig = this.signature();
      if (sig === this.lastSig || now - this.settleFrom > SETTLE) { this.state = 'run'; this.begin(sun); }
      this.lastSig = sig;
      return;
    }
    if (this.busy) return;
    // the sun has moved: its part again
    if (sun && this.sunAt) { const d = sunDir(this.v, V); if (d.dot(this.sunAt) < SUN_TURN) { this.begin(sun, { sunOnly: true }); return; } }
    // the scenery changed (something moved, came or went): those tiles again
    if (now - this.lastScan > 1500) { this.lastScan = now; const sig = this.signature(); if (sig !== this.lastSig) { this.lastSig = sig; this.begin(sun, { changed: true }); } }
  }
  // a quick hash of what is in the scenery and where (to tell whether it changed): a sum of each thing's own, so the order
  // they are listed in doesn't count. A thing whose own changed since the last look has moved: it moves (out of the bake).
  signature() {
    let h = 0; const cam = this.v.cam, last = this.sigOf ||= new WeakMap();
    eachShown(this.v.scene, o => {
      const g = inBake(o, cam, this.movers); if (!g) return;
      const e = o.matrixWorld.elements; let k = mixF(mixF(mixF(fnv(2166136261, o.id), e[12], 100), e[13], 100), e[14], 100);
      if (o.isInstancedMesh) { k = fnv(k, o.count); const a = o.instanceMatrix.array; for (let i = 12; i < Math.min(a.length, o.count * 16); i += 16 * 7) k = mixF(k, a[i] + a[i + 2], 100); }
      k = fnv(k, g.attributes.position.version);
      const was = last.get(o); last.set(o, k);
      if (was !== undefined && was !== k) { this.moved(o, g); return; }
      h = (h + k) >>> 0;
    });
    return h;
  }
  // a mesh's pieces (a piece a material) and a hash of its shape and looks (not where it stands: what it is)
  looks(o, g) {
    const ms0 = mats(o), looks = ms0.map(lookOf), sh = shapeOf(g), groups = [];
    const total = g.index ? g.index.count : g.attributes.position.count, dr = g.drawRange, lo = Math.max(0, dr.start), hi = Math.min(total, dr.start + dr.count);
    const part = (look, start, count) => { const a = Math.max(lo, start); count = Math.floor((Math.min(hi, start + count) - a) / 3) * 3; if (look && count >= 3) groups.push({ start: a, count, ...look }); };
    if (ms0.length > 1 || g.groups.length > 1) for (const gr of g.groups) part(looks[gr.materialIndex ?? 0] || looks[0], gr.start, gr.count); else part(looks[0], 0, total);
    let hh = sh.h; for (const gr of groups) hh = fnv(fnv(fnv(hh, gr.start), gr.count), gr.key);
    return { groups, hh };
  }
  // o moved: out of the bake from now on, and remembered (by what it is) for the next time the level is played
  moved(o, g) {
    this.movers.add(o);
    const { hh } = this.looks(o, g); if (!this.known.has(hh)) { this.known.add(hh); this.knownDirty = true; }
  }
  // the scenery as lists: items (a shape, a look, where its copies stand) with a hash and a box each
  collect() {
    const v = this.v, S = v.scene, items = [], last = this.lastMats || new WeakMap(), seen = new WeakMap();
    S.updateMatrixWorld();
    eachShown(S, o => {
      const g = inBake(o, v.cam, this.movers); if (!g) return;
      const sh = shapeOf(g), { groups, hh } = this.looks(o, g); if (!groups.length) return;
      if (this.known.has(hh)) { this.movers.add(o); return; }
      // copies: each one's place
      const ms = [];
      if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M5); ms.push(Float32Array.from(M4.multiplyMatrices(o.matrixWorld, M5).elements)); } }
      else ms.push(Float32Array.from(o.matrixWorld.elements));
      // something that moved since it was last read moves: out of the bake for good (its tiles are baked again without it)
      const was = last.get(o), key = ms.length + ':' + ms[0].join(',');
      if (was !== undefined && was !== key && !o.isInstancedMesh) { this.moved(o, g); return; }
      seen.set(o, key);
      const hs = [], boxes = [];
      for (const m of ms) {
        let h = hh; for (let i = 0; i < 16; i++) if (i % 4 !== 3) h = mixF(h, m[i], 100);
        hs.push(h);
        BOX.copy(sh.box).applyMatrix4(M4.fromArray(m)); boxes.push([BOX.min.x, BOX.min.y, BOX.min.z, BOX.max.x, BOX.max.y, BOX.max.z]);
      }
      items.push({ o, g, sh, groups, ms, hs, boxes });
    });
    this.lastMats = seen;
    return items;
  }
  // tiles: their probes, their hash (of the scenery within reach of them), and what is kept for them
  tilesOf(G, items) {
    const g = G.g, [nx, ny, nz] = g.res, tx = Math.ceil(nx / TILE), tz = Math.ceil(nz / TILE), n = tx * tz, sums = new Uint32Array(n);
    const w = TILE * g.step[0], d = TILE * g.step[2], R = this.reach;
    for (const it of items) for (let c = 0; c < it.boxes.length; c++) {
      const b = it.boxes[c], x0 = Math.max(0, Math.floor((b[0] - R - g.min[0]) / w)), x1 = Math.min(tx - 1, Math.floor((b[3] + R - g.min[0]) / w)), z0 = Math.max(0, Math.floor((b[2] - R - g.min[2]) / d)), z1 = Math.min(tz - 1, Math.floor((b[5] + R - g.min[2]) / d));
      if (b[4] < g.min[1] - R || b[1] > g.max[1] + R) continue;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) sums[x + z * tx] = (sums[x + z * tx] + it.hs[c]) >>> 0;
    }
    let base = fnv(fnv(fnv(2166136261, BAKE_VERSION), this.rays), Math.round(this.reach));
    for (const a of [g.min, g.max, g.res]) for (const x of a) base = mixF(base, x, 100);
    const tiles = [];
    for (let z = 0; z < tz; z++) for (let x = 0; x < tx; x++) {
      const probes = [];
      for (let iz = z * TILE; iz < Math.min(nz, (z + 1) * TILE); iz++) for (let iy = 0; iy < ny; iy++) for (let ix = x * TILE; ix < Math.min(nx, (x + 1) * TILE); ix++) probes.push(ix + nx * (iy + ny * iz));
      const h = fnv(fnv(fnv(base, x), z), sums[x + z * tx]);
      tiles.push({ x, z, probes, hash: 'N' + h.toString(36), rect: [g.min[0] + x * w, g.min[2] + z * d, g.min[0] + (x + 1) * w, g.min[2] + (z + 1) * d] });
    }
    return tiles;
  }
  // a job's lists of the scenery (shapes once each, a piece a material, every copy's place)
  job(items) {
    const shapes = [], at = new Map(), list = [];
    for (const it of items) {
      let s = at.get(it.sh); if (s === undefined) { s = shapes.length; at.set(it.sh, s); shapes.push({ pos: it.sh.pos, idx: it.sh.idx, col: it.sh.col }); }
      for (const gr of it.groups) list.push({ shape: s, start: gr.start, count: gr.count, ms: it.ms, rgb: gr.rgb, op: gr.op, tint: gr.tint, both: gr.both });
    }
    return { shapes, items: list, budget: this.o.budget ?? 2.5e5 };
  }

  async begin(sun, { sunOnly = false, changed = false } = {}) {
    if (this.busy) return; this.busy = true;
    const t0 = performance.now(), want = sunDir(this.v, new Vector3()), q = quantSun(want), sunQ = q.key;
    try {
      if (this.knownP) { await this.knownP; this.knownP = null; }
      const items = sunOnly && this.items ? this.items : this.collect(); this.items = items;
      const took = this.took = { collect: performance.now() - t0 };
      // what each tile is now, and what of it is kept on the phone or already here
      const plan = [];
      for (let i = 0; i < this.grids.length; i++) {
        const G = this.grids[i], tiles = this.tilesOf(G, items);
        for (const t of tiles) { const old = G.tiles.find(o => o.x === t.x && o.z === t.z); t.geoOk = !!(old && old.hash === t.hash && old.geoOk); t.sunOk = !!(t.geoOk && old.sunQ === sunQ); }
        G.tiles = tiles;
        for (const t of tiles) plan.push({ G, t });
      }
      const near = this.grids[this.grids.length - 1];
      const mapPlan = this.maps.map((M, mi) => ({ M, mi, hash: mapHash(M, items) }));
      const keys = [];
      for (const { t } of plan) { if (!t.geoOk) keys.push('g|' + t.hash); if (!t.sunOk) keys.push('s|' + t.hash + '|' + sunQ); }
      for (const mp of mapPlan) for (const t of near.tiles) if (mp.M.hashes?.[t.x + ',' + t.z] !== mp.hash + t.hash) keys.push('x|' + mp.hash + '|' + t.hash);
      let t1 = performance.now(); const kept = await CREW.read(keys); took.read = performance.now() - t1;
      // read back: put in place
      const traceProbes = [];
      for (const { G, t } of plan) {
        if (!t.geoOk) { const r = kept.get('g|' + t.hash); if (r) { putGeo(G, t.probes, r.probes); t.geoOk = true; bakeStats.read++; } }
        if (!t.sunOk) { const r = t.geoOk && kept.get('s|' + t.hash + '|' + sunQ); if (r) { putSun(G, t.probes, r.probes); t.sunOk = true; bakeStats.read++; } }
        t.sunQ = sunQ;
        if (!t.geoOk || !t.sunOk) traceProbes.push({ G, t });
      }
      const traceTexels = [];
      for (const mp of mapPlan) {
        mp.M.hashes ||= {};
        for (const t of near.tiles) {
          const k = t.x + ',' + t.z; if (mp.M.hashes[k] === mp.hash + t.hash) continue;
          const r = kept.get('x|' + mp.hash + '|' + t.hash);
          if (r) { putTexels(mp.M, r.at, r.ao); mp.M.hashes[k] = mp.hash + t.hash; mp.M.dirty = true; bakeStats.read++; }
          else traceTexels.push({ mp, t, k });
        }
      }
      if (traceProbes.length || traceTexels.length) await this.trace(items, traceProbes, traceTexels, q, sunQ);
      for (const G of this.grids) { fillIn(G.g, G.data); G.fresh = true; }
      this.sunAt = q.dir.clone(); this.sunQ = sunQ; this.version++;
      took.total = performance.now() - t0; bakeStats.ms += took.total; bakeStats.last = took;
      if (this.knownDirty) { this.knownDirty = false; CREW.write([[this.level, { list: [...this.known] }]]); }
      if (!this.firstDone) { this.firstDone = true; this.k = getready.warming || kept.size && !traceProbes.length && !traceTexels.length ? 1 : this.k; }   // (under the loading screen, or read back: no fade)
    } catch (e) {
      if (!this.firstDone) { this.failed = true; bakeStats.failed++; console.warn('baked light: not baked', e, e?.stack); }
    } finally { this.busy = false; }
  }
  // the rays: the level to the workers, probes a slice at a time, then the light maps' texels against the finished probes
  async trace(items, probes, texels, q, sunQ) {
    const key = 'L' + (++LEVELS), took = this.took; let t1 = performance.now();
    await CREW.scene(key, this.job(items)); took.scene = performance.now() - t1; t1 = performance.now();
    const sun = q.dir.toArray(), jobs = [], recs = [];
    for (const { G, t } of probes) {
      for (let i = 0; i < t.probes.length; i += SLICE) {
        const list = t.probes.slice(i, i + SLICE);
        jobs.push(CREW.run('probes', { key, at: probePlaces(G.g, list), first: list[0] + G.priority * 1e6, rays: this.rays, reach: this.reach, sun, sunReach: this.reach * 2 }).then(r => {
          const n = list.length;
          for (let j = 0; j < n; j++) { const p = list[j], o = p * PROBE; if (!t.geoOk) for (let k = 0; k < 36; k++) G.data[o + k] = r[j * PROBE + k]; for (let k = 36; k < 63; k++) G.data[o + k] = r[j * PROBE + k]; if (!t.geoOk) G.data[o + 63] = r[j * PROBE + 63]; }
          bakeStats.probes += n;
        }));
      }
    }
    await Promise.all(jobs); took.probes = performance.now() - t1; t1 = performance.now();
    for (const { G, t } of probes) {
      if (!t.geoOk) recs.push(['g|' + t.hash, { probes: pickHalf(G.data, t.probes, 0, 36, true) }]);
      recs.push(['s|' + t.hash + '|' + sunQ, { probes: pickHalf(G.data, t.probes, 36, 63, false) }]);
      t.geoOk = t.sunOk = true;
    }
    // the light maps: how much sky each texel sees
    if (texels.length) {
      const near = this.grids[this.grids.length - 1];
      const tj = [];
      for (const M of new Set(texels.map(x => x.mp.M))) if (!M.texels) M.texels = await CREW.run('map', { geo: geoOf(M.mesh), m: Float32Array.from(M.mesh.matrixWorld.elements), size: M.size });
      // each texel's tile, once a map (only where the grid is: its tiles are what is kept)
      for (const M of new Set(texels.map(x => x.mp.M))) if (!M.byTile) {
        M.byTile = new Map(); const T = M.texels;
        const g = near.g, w = TILE * g.step[0], d = TILE * g.step[2], tx = Math.ceil(g.res[0] / TILE), tz = Math.ceil(g.res[2] / TILE);
        for (let i = 0; i < T.at.length; i++) {
          const x = T.pos[i * 3], z = T.pos[i * 3 + 2]; if (x < g.min[0] || z < g.min[2] || x > g.max[0] || z > g.max[2]) continue;
          const k = Math.min(tx - 1, (x - g.min[0]) / w | 0) + ',' + Math.min(tz - 1, (z - g.min[2]) / d | 0); let l = M.byTile.get(k); l || M.byTile.set(k, l = []); l.push(i);
        }
      }
      for (const { mp, t, k } of texels) {
        const M = mp.M, T = M.texels, sel = M.byTile.get(k) || [];
        const at = Uint32Array.from(sel, i => T.at[i]), ao = new Uint8Array(sel.length), parts = [];
        for (let s = 0; s < sel.length; s += TSLICE) {
          const part = sel.slice(s, s + TSLICE), pos = new Float32Array(part.length * 3), nrm = new Float32Array(part.length * 3);
          part.forEach((i, j) => { pos.set(T.pos.subarray(i * 3, i * 3 + 3), j * 3); nrm.set(T.nrm.subarray(i * 3, i * 3 + 3), j * 3); });
          parts.push(CREW.run('texels', { key, pos, nrm, rays: this.texelRays, reach: this.texelReach, first: part[0] }).then(r => { ao.set(r, s); bakeStats.texels += r.length; }));
        }
        tj.push(Promise.all(parts).then(() => { putTexels(M, at, ao); M.hashes[k] = mp.hash + t.hash; M.dirty = true; recs.push(['x|' + mp.hash + '|' + t.hash, { at, ao }]); }));
      }
      await Promise.all(tj); took.texels = performance.now() - t1;
    }
    bakeStats.traced++;
    CREW.write(recs);
  }

  /* --- showing it: the parts put together with this frame's colours, faded in --- */
  // The grid holds the bounced light (the sky's and the sun's, off what is round each probe), added to the hemisphere light,
  // which stays: three clamps a grid's sum at nothing, so a grid can't take light away (the light maps do that).
  show(now, C, G0, S) {
    const dt = Math.min(.1, (now - (this.t || now)) / 1000); this.t = now;
    if (this.firstDone && this.k < 1) this.k = Math.min(1, this.k + dt / FADE);
    const key = C.map(x => Math.round(x * 200)) + '|' + S.map(x => Math.round(x * 100)) + '|' + this.version;
    const moving = this.firstDone && this.k < 1 && now - this.combineAt > 100, fresh = this.grids.some(G => G.fresh);   // (a fade in steps a tenth of a second apart: each is a few ms)
    if (key === this.combineKey && !moving && !fresh) { this.mapsShow(now); return; }
    if (!moving && !fresh && now - this.combineAt < 250 && this.combineKey) { this.mapsShow(now); return; }
    this.combineKey = key; this.combineAt = now;
    for (const G of this.grids) {
      const n = G.g.count, sh = G.shown, k = this.k;
      if (this.firstDone) {
        const t = G.target = combine(G.data, n, C, S, { openSky: false, bounce: this.bounce }, G.target);
        for (let i = 0; i < n * 27; i++) sh[i] = t[i] * k;
      } else sh.fill(0);
      G.fresh = false;
      packAtlas(G.g, sh, G.tex.image.data); G.tex.needsUpdate = true;
    }
    this.mapsShow(now);
  }
  mapsShow(now) {
    for (const M of this.maps) {
      const want = this.firstDone ? this.k : 0;
      if (M.mat.aoMapIntensity !== want) M.mat.aoMapIntensity = want;
      if (M.dirty && now - (M.upAt || 0) > 250) { M.dirty = false; M.upAt = now; M.tex.needsUpdate = true; }
    }
  }
  /** Bake again (after the level changed in a way that can't be seen: a material's colour, say). */
  rebake() { for (const G of this.grids) for (const t of G.tiles) t.geoOk = t.sunOk = false; for (const M of this.maps) M.hashes = {}; this.lastSig = null; this.lastScan = 0; return this; }
  /** Takes it all away: the grids, the light maps, the kept results stay on the phone. */
  remove() {
    BAKES.delete(this);
    for (const G of this.grids) { for (const o of Object.values(G.objs)) { o.removeFromParent(); o.texture = null; o.dispose?.(); } G.tex.dispose(); }
    this.dropMaps();
    this.grids = []; this.failed = true;
    if (this.v._baked === this) this.v._baked = null;
  }
  /** How far the first bake has got: { done, probes, texels, failed }. */
  get progress() { return { done: this.firstDone, failed: this.failed, probes: bakeStats.probes, texels: bakeStats.texels }; }
}
let LEVELS = 0;

/* ---------- helpers ---------- */
function boxOf(b) {
  if (!b) return new Box3(new Vector3(-50, -5, -50), new Vector3(50, 30, 50));
  if (b.isBox3) return b.clone();
  if (b.isObject3D) { b.updateWorldMatrix(true, true); return new Box3().setFromObject(b); }
  return new Box3(new Vector3(...b.min), new Vector3(...b.max));
}
function sunDir(v, out) { if (v.sunDir) return v.sunDir(out).normalize(); return out.set(0, 1, 0); }
// the sun's direction in steps of about two degrees (the kept bakes are found again by it, and baked for it)
function quantSun(d) {
  const st = Math.PI / 90, el = Math.round(Math.asin(Math.max(-1, Math.min(1, d.y))) / st), az = Math.round(Math.atan2(d.z, d.x) / st);
  const e = el * st, a = az * st, dir = new Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
  return { key: el + ',' + az, dir };
}
function mapHash(M, items) {
  const it = items.find(i => i.o === M.mesh); let h = fnv(it ? it.hs[0] : shapeOf(M.mesh.geometry).h, M.size);
  h = fnv(fnv(h, BAKE_VERSION), Math.round(M.mesh.geometry.attributes.uv.version));
  return 'M' + h.toString(36);
}
function geoOf(mesh) {
  const g = mesh.geometry;
  return { pos: Float32Array.from(floats(g.attributes.position, 3)), nrm: g.attributes.normal ? Float32Array.from(floats(g.attributes.normal, 3)) : null, uv: Float32Array.from(floats(g.attributes.uv, 2)), idx: g.index ? Uint32Array.from(g.index.array) : null };
}
function pickHalf(data, list, from, to, back) {
  const w = to - from + (back ? 1 : 0), o = new Uint16Array(list.length * w);
  list.forEach((p, j) => { for (let i = from; i < to; i++) o[j * w + i - from] = DataUtils.toHalfFloat(data[p * PROBE + i]); if (back) o[j * w + w - 1] = DataUtils.toHalfFloat(data[p * PROBE + 63]); });
  return o;
}
function putGeo(G, list, h) { const w = 37; list.forEach((p, j) => { for (let i = 0; i < 36; i++) G.data[p * PROBE + i] = DataUtils.fromHalfFloat(h[j * w + i]); G.data[p * PROBE + 63] = DataUtils.fromHalfFloat(h[j * w + 36]); }); }
function putSun(G, list, h) { const w = 27; list.forEach((p, j) => { for (let i = 0; i < 27; i++) G.data[p * PROBE + 36 + i] = DataUtils.fromHalfFloat(h[j * w + i]); }); }
function putTexels(M, at, ao) { const d = M.tex.image.data; for (let i = 0; i < at.length; i++) d[at[i]] = ao[i]; }
