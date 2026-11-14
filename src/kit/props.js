// Bigger levels on phones. Thousands of the same thing (trees, crates, rocks, lamps, grass tufts)
// drawn as one InstancedMesh2 (from @three.ez/instanced-mesh): only the ones on screen are drawn
// (a BVH makes that check fast), far ones swap to simpler shapes (made for you with three's
// SimplifyModifier) and cheaper shadows. Areas hide rooms you can't see from where the camera is,
// and Chunks build an endless or very big world around the player and drop what is far away.
//
//   const { Props, Areas, Chunks, simplify } = gs.props;
//   reset() {
//     props = new Props(view.scene, { renderer: view.renderer });
//     props.kind('tree', treeGeo, toon('#3a6'), { lod: [25, 60] });       // two simpler shapes past 25 m and 60 m
//     props.scatter('tree', 400, { x0: -100, z0: -100, x1: 100, z1: 100, gap: 3, seed: 7, scale: [.8, 1.4], y: (x, z) => ground(x, z) });
//     props.done();                                                      // builds the BVH once everything is placed
//   }
//   areas: areas.add('hall', hallGroup, box).add('vault', vaultGroup, box).link('hall', 'vault'); update: areas.update(camera.position)
//   perCopy(instancedMesh): a finished InstancedMesh of still things (towers, trees, rocks) skips the copies off screen
//   chunks: new Chunks(view.scene, { size: 40, radius: 2, make: (cx, cz) => buildChunk(cx, cz) }); update: chunks.update(player.pos)
//
// Detail levels by themselves: a kind with no `lod` of its own gets levels made in the background by the
// Next Gen, AR and Board views once it is big enough to matter (hd3d.js autoCopies), each copy drawn at the
// simplest level whose error doesn't show where it stands; `lod: 'auto'` asks for that whatever its size,
// `lod: false` keeps every copy whole.

import { timed } from './prof.js';
import { sceneEdited } from './scene-list.js';
import { Vector3, Box3, Color, Matrix4, Quaternion } from 'three';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';

// meshoptimizer's simplifier (what three's SimplifyModifier uses; its modify() became async in three
// 0.186, so it's called directly here). Its wasm starts at once; the app waits for it with the 3D parts.
let canSimplify = false;
/** Resolves once simplify() can work (gamescroll.js waits for it while loading the 3D parts). */
export const simplifyReady = MeshoptSimplifier.ready.then(() => { canSimplify = true; }, () => {});

// A set of copies says when one of them is moved, hidden or shown (userData.gsChanged, a count that goes
// up): the Next Gen view keeps the shadows of still things from frame to frame (hd3d.js shadowLights), and
// nothing else about the set changes when one copy does.
// A view that hides what is behind other things (occlude.js) also wants to know which copy, and where it was:
// userData.occWatch = { ids, old (x, y, z and reach of each, in the set's own space), all } while one is watching.
function watched(m) {
  for (const k of ['setMatrixAt', 'setVisibilityAt', 'setActiveAt', 'setActiveAndVisibilityAt', 'updateInstances', 'updateInstancesPosition']) {
    const own = m[k]; if (typeof own !== 'function') continue;
    const one = !k.startsWith('update');
    m[k] = function (a, b, c) {
      this.userData.gsChanged = (this.userData.gsChanged || 0) + 1;
      const w = this.userData.occWatch; if (w && !w.all) noteCopy(this, w, one ? a : -1);
      return own.call(this, a, b, c);
    };
  }
  return m;
}
function noteCopy(m, w, id) {
  const D = m.matricesTexture?._data, g = m.geometry;
  if (!(id >= 0) || w.ids.length >= 64 || !D || !g || id * 16 + 15 >= D.length) { w.all = true; return; }
  if (!g.boundingSphere) g.computeBoundingSphere();
  const c = g.boundingSphere.center, o = id * 16;
  const s = Math.sqrt(Math.max(D[o] * D[o] + D[o + 1] * D[o + 1] + D[o + 2] * D[o + 2], D[o + 4] * D[o + 4] + D[o + 5] * D[o + 5] + D[o + 6] * D[o + 6], D[o + 8] * D[o + 8] + D[o + 9] * D[o + 9] + D[o + 10] * D[o + 10]));
  w.ids.push(id); w.old.push(D[o] * c.x + D[o + 4] * c.y + D[o + 8] * c.z + D[o + 12], D[o + 1] * c.x + D[o + 5] * c.y + D[o + 9] * c.z + D[o + 13], D[o + 2] * c.x + D[o + 6] * c.y + D[o + 10] * c.z + D[o + 14], g.boundingSphere.radius * s);
}

/** A simpler copy of a geometry with about `keep` (0..1) of its points. */
export function simplify(geometry, keep = .5) {
  let g = geometry.clone(); g.deleteAttribute?.('uv2');
  if (!g.index) g = mergeVertices(g);
  const pos = g.attributes.position, n = pos.count, k = Math.max(.02, Math.min(1, keep));
  if (k >= 1 || !canSimplify) return g;
  try {
    const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
    const idx = new Uint32Array(g.index.array), target = Math.max(3, Math.floor(idx.length * k / 3) * 3);
    const [out] = MeshoptSimplifier.simplify(idx, p, 3, target, 1, ['LockBorder']);
    g.setIndex(Array.from(out)); g.computeVertexNormals();   // (unused points stay in the arrays; only the triangles go)
    return g;
  } catch (_) { return g; }
}

/**
 * A finished InstancedMesh of still things (towers, trees, rocks, track pieces) turned into an InstancedMesh2
 * with the same copies, look and settings, put in its place: each copy is then checked on its own, so the
 * ones off screen (and, with v.occluders, behind walls) aren't drawn, and shadows still come from the ones
 * that cast into view. Call it once the matrices (and colours) are set; returns the new mesh. Copies that
 * move every frame: keep a plain InstancedMesh.
 */
const PM4 = new Matrix4(), PC = new Color(), PV = new Vector3(), PQ = new Quaternion(), PS = new Vector3(), CM4 = new Matrix4();
// one loose copy as World3D sees a mesh: the body moves it (sync sets position, then quaternion), and the copy's own
// matrix is written only when it really moved (a sleeping crate leaves the set's shadows alone)
class Copy {
  constructor(set, id, p, q, s) {
    this.set = set; this.id = id; this.scale = s.clone(); this.position = p.clone(); this.quaternion = q.clone(); this.last = null;
    this.quaternion._onChange(() => this.write());
  }
  write() {
    const p = this.position, q = this.quaternion, l = this.last, e = 1e-5;
    if (l && Math.abs(l[0] - p.x) < e && Math.abs(l[1] - p.y) < e && Math.abs(l[2] - p.z) < e && Math.abs(l[3] - q.x) < e && Math.abs(l[4] - q.y) < e && Math.abs(l[5] - q.z) < e && Math.abs(l[6] - q.w) < e) return;
    this.last = [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
    if (this.set.getActiveAt && !this.set.getActiveAt(this.id)) return;   // (removed meanwhile)
    this.set.setMatrixAt(this.id, CM4.compose(p, q, this.scale));
  }
}
export function perCopy(im, { renderer = null } = {}) {
  const n = im.count, m = watched(new InstancedMesh2(im.geometry, im.material, { capacity: Math.max(1, n), renderer: renderer || undefined }));
  for (const k of ['name', 'castShadow', 'receiveShadow', 'renderOrder', 'visible']) m[k] = im[k];
  m.layers.mask = im.layers.mask; Object.assign(m.userData, im.userData);
  m.position.copy(im.position); m.quaternion.copy(im.quaternion); m.scale.copy(im.scale);
  if (n) m.addInstances(n);
  for (let i = 0; i < n; i++) { im.getMatrixAt(i, PM4); m.setMatrixAt(i, PM4); if (im.instanceColor) { im.getColorAt(i, PC); m.setColorAt(i, PC); } }
  m.computeBVH();
  const par = im.parent; if (par) { par.children[par.children.indexOf(im)] = m; m.parent = par; im.parent = null; sceneEdited(par); }
  return m;
}

/** Frees the perCopy() / Props meshes under root (and their WebGPU twins) once it's thrown away (a rebuilt level). */
export function freeCopies(root) {
  const list = []; root?.traverse(o => { if (o.isInstancedMesh2) list.push(o); });   // (listed first: taking the twins out while walking skips things)
  for (const o of list) { o.userData.gpuTwin?.dispose?.(); o.userData.gpuTwin?.group.removeFromParent(); o.userData.gpuTwin = null; o.dispose?.(); }
}

const rng = seed => { let s = (seed ?? Math.random() * 2 ** 31) | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/** Many copies of a few kinds of thing, each kind drawn in one go. */
export class Props {
  /** scene: where they go; renderer: your view's renderer (lets the library use a faster index); shadows: cast shadows by default. */
  constructor(scene, { renderer = null, shadows = true } = {}) { this.scene = scene; this.renderer = renderer; this.shadows = shadows; this.kinds = new Map(); }
  /**
   * A kind of prop. lod: distances where simpler shapes take over (made by simplify(), keeping
   * `keep` of the detail at each step), or [[distance, geometry, material?], ...] for your own (a
   * material of its own for that level, e.g. gs.outdoors impostor() cards), or 'auto': levels made in the
   * background with distances worked out so the change can't be seen (the views do this by themselves
   * for a big enough kind with no lod; false: never). shadowFar: past this the shadow uses the simplest
   * shape; capacity: how many to expect (it grows if needed).
   */
  kind(name, geometry, material, { lod = [], keep = [.45, .15], shadows = this.shadows, shadowFar = 40, capacity = 256 } = {}) {
    const m = watched(new InstancedMesh2(geometry, material, { capacity, renderer: this.renderer || undefined }));
    m.castShadow = shadows; m.receiveShadow = true; m.name = 'props:' + name;
    if (lod === 'auto') { m.userData.detail = true; lod = []; } else if (lod === false) { m.userData.detail = false; lod = []; }
    if (lod.length) {
      m.setFirstLODDistance(0);
      lod.forEach((d, i) => { const [dist, geo, mat] = Array.isArray(d) ? d : [d, simplify(geometry, keep[i] ?? keep.at(-1) / (i + 1))]; m.addLOD(geo, mat || material, dist); });
    }
    // far shadows from the simplest level drawn with the kind's own material (a level with a material of
    // its own, like impostor cards, is cut out from another picture)
    if (shadows && lod.length) { const own = m.LODinfo.render.levels.filter(l => l.object.material === material).at(-1); if (own) m.addShadowLOD(own.object.geometry, shadowFar); }
    this.scene.add(m);
    this.kinds.set(name, { mesh: m, items: [] });
    return m;
  }
  mesh(name) { return this.kinds.get(name)?.mesh || null; }
  /** Adds one. rot: turn about y (radians) or { x, y, z }; scale: a number or { x, y, z }; color: a CSS colour. Returns its id. */
  add(name, x, y, z, { rot = 0, scale = 1, color = null } = {}) {
    const k = this.kinds.get(name); if (!k) throw new Error(`No prop kind "${name}": call kind() first`);
    let id = -1;
    k.mesh.addInstances(1, (o, i) => {
      id = i; o.position.set(x, y, z);
      if (typeof rot === 'number') o.rotateY(rot); else { o.rotateY(rot.y || 0); o.rotateX(rot.x || 0); o.rotateZ(rot.z || 0); }
      if (typeof scale === 'number') o.scale.setScalar(scale); else o.scale.set(scale.x, scale.y, scale.z);
    });
    if (color) k.mesh.setColorAt(id, new Color(color));
    k.items[id] = { x, y, z };
    return id;
  }
  /** Moves one (fine now and then; for things moving every frame use plain meshes). */
  move(name, id, x, y, z) {
    // (the one copy's own matrix: the library's updateInstances() starts every copy again from no turn and no scale)
    const k = this.kinds.get(name), m = k.mesh;
    m.getMatrixAt(id, PM4); PM4.setPosition(x, y, z); m.setMatrixAt(id, PM4);
    k.items[id] = { x, y, z };
    const S = k.solid; if (S) { const b = S.loose?.get(id); if (b) b.place(x, y, z); else if (S.body) { PM4.decompose(PV, PQ, PS); S.body.set(id, PV, S.upright ? null : PQ.clone()); } }
    return this;
  }
  remove(name, id) {
    const k = this.kinds.get(name); if (!k) return this; k.mesh.removeInstances(id); delete k.items[id];
    const S = k.solid; if (S) { const b = S.loose?.get(id); if (b) { b.remove(); S.loose.delete(id); } else S.body?.drop(id); }
    return this;
  }
  /**
   * Makes the copies of a kind solid in a gs.physics3d World3D (call after placing them; copies added later need solid()
   * again). shape: 'box' (each copy's bounds: crates, rocks, cars), 'trunk' (an upright pole up its middle, r thick:
   * trees, lamp posts, bollards; r 15% of its width by default), 'ball' or 'hull' (its outline: rocks, barrels).
   * Still copies are one fixed body (thousands cost little; a ray's hit.part is { props, kind, id }). loose: true makes each
   * copy a body of its own that falls, tumbles and gets knocked over (density; it draws where its body is by itself;
   * best for tens, not thousands). Returns the body (still) or a Map of id to body (loose).
   */
  solid(world, name, { shape = 'box', r = null, loose = false, density = 1, tag = name, sound, friction, bounce } = {}) {
    const k = this.kinds.get(name); if (!k) throw new Error(`No prop kind "${name}": call kind() first`);
    this.unsolid(name);
    const g = k.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox, size = bb.getSize(new Vector3()), mid = bb.getCenter(new Vector3());
    let pts = null;
    if (shape === 'hull') { const a = g.attributes.position, step = Math.max(1, Math.floor(a.count / 400)); pts = []; for (let i = 0; i < a.count; i += step) pts.push(new Vector3(a.getX(i), a.getY(i), a.getZ(i))); }
    // the shape of one copy, about its own origin, and where its middle sits (off)
    const spec = (sc) => {
      if (shape === 'trunk') { const rr = (r ?? Math.min(size.x, size.z) * .15) * Math.max(sc.x, sc.z), h = size.y * sc.y; return { capsule: [rr, Math.max(h, rr * 2)], off: { x: 0, y: mid.y * sc.y, z: 0 }, upright: true }; }
      if (shape === 'ball') return { ball: g.boundingSphere ? g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z) : size.length() / 2 * Math.max(sc.x, sc.y, sc.z), off: { x: mid.x * sc.x, y: mid.y * sc.y, z: mid.z * sc.z } };
      if (shape === 'hull') return { hull: pts.map(p => ({ x: p.x * sc.x, y: p.y * sc.y, z: p.z * sc.z })), off: null };
      return { box: [Math.max(.01, size.x * sc.x), Math.max(.01, size.y * sc.y), Math.max(.01, size.z * sc.z)], off: { x: mid.x * sc.x, y: mid.y * sc.y, z: mid.z * sc.z } };
    };
    const o = { tag, sound, friction, bounce, density };
    if (!loose) {
      const list = [];
      k.items.forEach((it, id) => { if (!it) return; k.mesh.getMatrixAt(id, PM4); PM4.decompose(PV, PQ, PS); const s = spec(PS); list.push({ ...s, at: PV.clone(), turn: s.upright ? null : PQ.clone(), part: id }); });
      const body = world.shapes(list, o);
      // (hit.part: the copy, and whose)
      for (const [id, c] of body.colliders) if (id !== null) c.userData = { props: this, kind: name, id };
      k.solid = { world, body, upright: shape === 'trunk' };
      return body;
    }
    const map = new Map();
    k.items.forEach((it, id) => {
      if (!it) return; k.mesh.getMatrixAt(id, PM4); PM4.decompose(PV, PQ, PS);
      const s = spec(PS), stand = new Copy(k.mesh, id, PV, PQ, PS);
      const b = world.shape(stand, { ...s, off: s.off }, o); b.part = { props: this, kind: name, id }; map.set(id, b);
    });
    k.solid = { world, loose: map };
    return map;
  }
  /** Takes a kind's copies out of the physics world again (they stay drawn). */
  unsolid(name) { const k = this.kinds.get(name), S = k?.solid; if (!S) return this; if (S.body) S.body.remove(); for (const b of S.loose?.values() || []) b.remove(); k.solid = null; return this; }
  hide(name, id, hidden = true) { this.kinds.get(name)?.mesh.setVisibilityAt(id, !hidden); return this; }
  /**
   * Scatters count of a kind over an area { x0, z0, x1, z1 } (or a function () => { x, z } for odd
   * shapes): gap keeps them apart, y(x, z) sets the height (the ground), keepOut(x, z) true skips a
   * spot (roads, buildings), scale: [min, max]. Returns the ids.
   */
  scatter(name, count, area, { gap = 0, seed, y = () => 0, keepOut = null, scale = [1, 1], spin = true } = {}) {
    const R = rng(seed), ids = [], placed = [], cell = gap > 0 ? gap : 1, grid = new Map();
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    for (let tries = 0; ids.length < count && tries < count * 20; tries++) {
      const p = typeof area === 'function' ? area(R) : { x: area.x0 + R() * (area.x1 - area.x0), z: area.z0 + R() * (area.z1 - area.z0) };
      if (keepOut?.(p.x, p.z)) continue;
      if (gap > 0) {
        let ok = true; const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
        for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) for (const q of grid.get((cx + i) + ',' + (cz + j)) || []) if (Math.hypot(q.x - p.x, q.z - p.z) < gap) { ok = false; break; }
        if (!ok) continue;
        const k = key(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
      }
      placed.push(p);
      ids.push(this.add(name, p.x, y(p.x, p.z), p.z, { rot: spin ? R() * Math.PI * 2 : 0, scale: scale[0] + R() * (scale[1] - scale[0]) }));
    }
    return ids;
  }
  /** Call once everything is placed: builds the BVH so culling is fast. */
  done({ margin = 0 } = {}) { for (const k of this.kinds.values()) k.mesh.computeBVH({ margin }); return this; }
  /** Props of a kind within r of a point (for pick-ups, collisions, "search the crate"): [{ id, x, y, z, d }]. */
  near(name, p, r) {
    const k = this.kinds.get(name), out = []; if (!k) return out; const pz = p.z ?? p.y;
    k.items.forEach((q, id) => { if (!q) return; const d = Math.hypot(q.x - p.x, q.z - pz); if (d <= r) out.push({ id, ...q, d }); });
    return out.sort((a, b) => a.d - b.d);
  }
  /** How many of a kind (or of all). */
  count(name = null) { if (name) return this.kinds.get(name)?.mesh.instancesCount || 0; let n = 0; for (const k of this.kinds.values()) n += k.mesh.instancesCount; return n; }
  clear() { for (const [name, k] of this.kinds) { this.unsolid(name); k.mesh.removeFromParent(); k.mesh.dispose?.(); } this.kinds.clear(); return this; }
}

/**
 * Rooms and zones that hide what can't be seen. add(name, object, box) gives an area its scene
 * objects and its bounds ({ min, max } or a Box3; leave out to use the object's own bounds);
 * link(a, b) says you can see from one into the other (a door or window). update(cameraPos) shows
 * the area the camera is in, the ones linked to it (depth steps deep) and hides the rest.
 */
export class Areas {
  constructor({ depth = 1 } = {}) { this.list = new Map(); this.depth = depth; this.current = null; }
  add(name, object, box = null) {
    const b = box ? (box.isBox3 ? box.clone() : new Box3(new Vector3(box.min.x, box.min.y, box.min.z), new Vector3(box.max.x, box.max.y, box.max.z))) : new Box3().setFromObject(object);
    this.list.set(name, { name, object, box: b, links: new Set() }); return this;
  }
  link(a, b) { this.list.get(a)?.links.add(b); this.list.get(b)?.links.add(a); return this; }
  /** Which area a point is in (or null). */
  at(p) { const v = new Vector3(p.x, p.y, p.z); for (const a of this.list.values()) if (a.box.containsPoint(v)) return a.name; return null; }
  update(p) {
    const here = this.at(p) ?? this.current; if (!here) return this;
    this.current = here;
    const show = new Set([here]); let edge = [here];
    for (let d = 0; d < this.depth; d++) { const nx = []; for (const n of edge) for (const l of this.list.get(n).links) if (!show.has(l)) { show.add(l); nx.push(l); } edge = nx; }
    for (const a of this.list.values()) a.object.visible = show.has(a.name);
    return this;
  }
  /** Names of the areas shown now. */
  get shown() { return [...this.list.values()].filter(a => a.object.visible).map(a => a.name); }
}

/**
 * A big world in square chunks around the player: make(cx, cz) builds one (an Object3D, or null
 * for empty) when it comes within radius chunks, and it's removed and freed when it goes beyond
 * radius + 1. Use the chunk numbers as a seed so the same place always looks the same.
 */
export class Chunks {
  constructor(scene, { size = 40, radius = 2, make, drop = null, perFrame = 1 } = {}) { Object.assign(this, { scene, size, radius, make, drop, perFrame }); this.live = new Map(); this.queue = []; }
  key(cx, cz) { return cx + ',' + cz; }
  update(p) {
    const pz = p.z ?? p.y, cx = Math.floor(p.x / this.size), cz = Math.floor(pz / this.size), r = this.radius;
    for (const [k, c] of this.live) if (Math.abs(c.cx - cx) > r + 1 || Math.abs(c.cz - cz) > r + 1) this.free(k, c);
    const want = [];
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const k = this.key(cx + i, cz + j); if (!this.live.has(k)) want.push({ cx: cx + i, cz: cz + j, k, d: i * i + j * j }); }
    want.sort((a, b) => a.d - b.d);
    for (const w of want.slice(0, this.perFrame)) {   // a few a frame so there's no hitch
      const o = this.make(w.cx, w.cz) || null; if (o) { o.position.x += w.cx * this.size; o.position.z += w.cz * this.size; this.scene.add(o); }
      this.live.set(w.k, { cx: w.cx, cz: w.cz, object: o });
    }
    return this;
  }
  free(k, c) {
    this.live.delete(k); if (!c.object) return;
    this.drop?.(c.object, c.cx, c.cz); c.object.removeFromParent();
    c.object.traverse(o => { o.geometry?.dispose(); });
  }
  /** Is the chunk under p built yet? */
  ready(p) { return this.live.has(this.key(Math.floor(p.x / this.size), Math.floor((p.z ?? p.y) / this.size))); }
  clear() { for (const [k, c] of [...this.live]) this.free(k, c); return this; }
  get count() { return this.live.size; }
}

// hundreds of animated people or animals in a few draws: crowd.js
export { Crowd } from './crowd.js';

// per-frame work, timed while the frame lab is open (prof.js)
timed(Chunks.prototype, 'update', 'props');
timed(Areas.prototype, 'update', 'props');
