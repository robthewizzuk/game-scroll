// Still scenery drawn from render bundles (WebGPU; HD.bundle, on by default).
// For each thing it draws, three's WebGPU renderer works out every frame which shader, which buffers and which
// uniforms it needs and records the draw: about 30 microseconds a thing on the build machine (the town of the
// engine test scenes: 5.2 of its 8 ms of code a frame). A render bundle is a list of draws recorded once and
// replayed by the graphics chip; replaying a thing costs three only its uniform check, about a tenth of that.
// What a level holds is mostly still (walls, roofs, rocks, crates, lamp posts), so: a thing that has kept still
// for about a second joins the bundle of its area (CELL metres square, or one of its own if it is bigger than
// that); each area is culled as a whole (its things are not culled one by one, so a cell is kept small) and
// replayed. Each frame every thing in a bundle is checked against how it was when it joined: the moment it
// moves, hides, changes material, geometry or its triangles drawn, or leaves the scene, it goes back to
// drawing itself and its area is recorded again without it, so a game never has to know. One that changed
// waits longer each time before it joins again. Materials keep working as before (a colour changed, a uniform
// that moves with time): three checks each replayed thing's uniforms as it would its own draw.
// Babylon.js's snapshot rendering and three's BundleGroup do the same for a whole scene the game marks; here it
// is per area and by itself. WebGL draws as before (static batching, hd3d.js, does this job there).
//   Not in a bundle: see-through things, things drawn in an order of their own (renderOrder, a group's),
//   things that don't write or test depth, skinned, morphing, instanced and batched meshes, the kit's twins
//   and simpler copies, objects with onBeforeRender, frustumCulled = false, and userData.noBundle.
//   Draw order: bundles are drawn after the sky (anything that doesn't test depth, or asked to go first) and
//   before the rest, so what is drawn over walls without writing depth (decals) and see-through things
//   still land on top of them.
import { Object3D, Sphere, Vector3 } from 'three';

/** scene -> its still things (what the scene list's walk reads: scene-list.js) */
export const STILL = new WeakMap();
export const stillStats = { cells: 0, things: 0, joined: 0, left: 0, records: 0, replays: 0, stale: 0, why: {} };
const OBR = Object3D.prototype.onBeforeRender, OAR = Object3D.prototype.onAfterRender;
// CELL: an area's size in metres; WAIT: how long a thing keeps still before it joins (ms); SCAN: things looked at a
// frame for joining (a big level's are gone through over several frames); MAX: things in one bundle
const CELL = 16, WAIT = 1000, STEPS = 4, SCAN = 600, MAX = 160;
const SKIP = { bits: 0 };   // layer bits a thing may carry besides the first and still be in a bundle (the view's shadow bits)

// (a material that can go in a bundle: drawn in the opaque pass in the ordinary way, testing and writing depth)
const okMat = m => !!m && !m.transparent && m.depthWrite !== false && m.depthTest !== false && !(m.transmission > 0) && !m.clippingPlanes?.length;
function okThing(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isInstancedMesh2 || o.isBatchedMesh || o.isSkinnedMesh || o.isDetailMesh || o.morphTargetInfluences) return false;
  const ud = o.userData; if (ud.noBundle || ud.gsTwin || ud.gsLod) return false;
  if ((o.layers.mask & ~SKIP.bits) !== 1 || !o.frustumCulled || o.renderOrder !== 0 || o.onBeforeRender !== OBR || o.onAfterRender !== OAR) return false;
  const g = o.geometry; if (!g?.attributes?.position || g.morphAttributes?.position || g.isInstancedBufferGeometry) return false;
  const m = o.material;
  if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) if (m[i] && !okMat(m[i])) return false; return m.length > 0; }
  return okMat(m);
}
// shown, and every parent up to the scene shown and in no group drawn in an order of its own
function shownIn(o, scene) {
  if (!o.visible) return false;
  for (let p = o.parent; p; p = p.parent) { if (p === scene) return true; if (!p.visible || (p.isGroup && p.renderOrder !== 0)) return false; }
  return false;
}
const matVersion = m => { if (!Array.isArray(m)) return m.version + (m.visible ? 0 : .5); let v = 0; for (let i = 0; i < m.length; i++) v += (m[i]?.version ?? 0) * (i + 1) + (m[i]?.visible ? 0 : .5); return v; };
// How a thing is now (in the scene's own numbers: the drawing's centre moving along, origin.js, is not the thing moving)
function take(o, s, se) {
  const e = o.matrixWorld.elements, M = s.m;
  for (let i = 0; i < 16; i++) M[i] = e[i]; M[12] -= se[12]; M[13] -= se[13]; M[14] -= se[14];
  const g = o.geometry, at = g.attributes;
  s.mat = o.material; s.mv = matVersion(o.material); s.geo = g; s.idx = g.index; s.pos = at.position; s.na = 0;
  for (const k in at) s.at[s.na++] = at[k];
  s.ds = g.drawRange.start; s.dc = g.drawRange.count; s.gn = g.groups.length; s.cs = o.castShadow; s.rs = o.receiveShadow; s.mask = o.layers.mask;
}
function same(o, s, se) {
  if (o.material !== s.mat || o.geometry !== s.geo || o.castShadow !== s.cs || o.receiveShadow !== s.rs || ((o.layers.mask ^ s.mask) & ~SKIP.bits)) return false;
  const g = s.geo; if (g.index !== s.idx || g.drawRange.start !== s.ds || g.drawRange.count !== s.dc || g.groups.length !== s.gn || matVersion(o.material) !== s.mv) return false;
  const at = g.attributes; let n = 0;
  for (const k in at) { if (n >= s.na || at[k] !== s.at[n]) return false; n++; }
  if (n !== s.na) return false;
  const e = o.matrixWorld.elements, M = s.m;
  for (let i = 0; i < 12; i++) if (e[i] !== M[i]) return false;
  return Math.abs(e[12] - se[12] - M[12]) < 1e-7 && Math.abs(e[13] - se[13] - M[13]) < 1e-7 && Math.abs(e[14] - se[14] - M[14]) < 1e-7 && e[15] === M[15];
}
// (why a thing left its bundle, for the counts tests and the frame lab read)
function whyLeft(o, s, se, scene, inScene) {
  if (!inScene) return 'gone'; if (!shownIn(o, scene)) return 'hidden';
  // (what changed first: a new material puts the thing on the kit's hold layer while its shader builds, which is the kind check's)
  if (o.material !== s.mat || matVersion(o.material) !== s.mv) return 'material';
  if (o.geometry !== s.geo || o.geometry.drawRange.start !== s.ds || o.geometry.drawRange.count !== s.dc) return 'geometry';
  if (!okThing(o)) return 'kind';
  if (((o.layers.mask ^ s.mask) & ~SKIP.bits)) return 'layers';
  if (o.castShadow !== s.cs || o.receiveShadow !== s.rs) return 'shadows';
  return 'moved';
}
const snapOf = () => ({ m: new Float64Array(16), mat: null, mv: 0, geo: null, idx: null, pos: null, at: [], na: 0, ds: 0, dc: 0, gn: 0, cs: false, rs: false, mask: 0, n: 0, t: 0, left: 0, cell: null, i: -1, S: null });

const SP = new Sphere(), V = new Vector3();
function cellFor(S, o, s) {
  const g = o.geometry, bs = g.boundingSphere || (g.computeBoundingSphere(), g.boundingSphere), M = s.m;
  if (!bs || !Number.isFinite(bs.radius)) return null;
  // the thing's ball in the scene's own numbers
  V.copy(bs.center).applyMatrix4({ elements: M }); const sc = Math.sqrt(Math.max(M[0] * M[0] + M[1] * M[1] + M[2] * M[2], M[4] * M[4] + M[5] * M[5] + M[6] * M[6], M[8] * M[8] + M[9] * M[9] + M[10] * M[10]));
  const r = bs.radius * sc;
  let key = r > CELL ? 'o' + o.id : Math.floor(V.x / CELL) + ',' + Math.floor(V.z / CELL), c = S.cells.get(key), k = 0;
  while (c && c.things.length >= MAX) c = S.cells.get(key + '#' + ++k);
  if (k) key += '#' + k;
  if (!c) { c = { key, S, things: [], sphere: new Sphere(V.clone(), 0), v: 1, empty: true, lists: new WeakMap() }; c.grp = { isBundleGroup: true, static: false, version: 1, gsCell: c }; S.cells.set(key, c); S.list.push(c); }
  if (c.empty) { c.sphere.center.copy(V); c.sphere.radius = r; c.empty = false; } else c.sphere.union(SP.set(V, r));
  return c;
}
function join(S, o, s) {
  const c = cellFor(S, o, s); if (!c) { s.n = -1e9; return; }
  s.cell = c; s.i = c.things.length; s.S = S; c.things.push(o); c.v++; o.gsStill = s; stillStats.joined++;
}
function leave(o, s, strike) {
  const c = s.cell, T = c.things, last = T.pop();
  if (last !== o) { T[s.i] = last; last.gsStill.i = s.i; }
  c.v++; s.cell = null; s.i = -1; s.S = null; o.gsStill = null; stillStats.left++;
  if (!T.length) c.empty = true;
  // (a thing that changed waits longer each time before it tries again: 1, 2, 4... up to 32 seconds more; a mover
  // never keeps still long enough to join, and one that changes now and then, a close-up material, comes back)
  if (strike) { s.left++; s.n = -STEPS * Math.min(32, 2 ** (s.left - 1)); }
}

/**
 * Once a frame, after the frame's world matrices and before anything is drawn (hd3d.js drawGPU): things in a
 * bundle that changed go back to drawing themselves, and a share of the scene's other things is looked at for
 * joining. things: the scene's list (scene-list.js thingsOf); bits: layer bits a still thing may carry besides
 * the first (the view's shadow bits, which it sets each frame).
 */
export function stillFrame(scene, things, now, bits = 0) {
  let S = STILL.get(scene);
  if (!S) STILL.set(scene, S = { scene, cells: new Map(), list: [], snaps: new WeakMap(), cursor: 0, pause: false });
  SKIP.bits = bits;
  const se = scene.matrixWorld.elements;
  // what changed since it joined goes back to drawing itself
  let n = 0;
  for (let ci = 0; ci < S.list.length; ci++) {
    const T = S.list[ci].things;
    for (let i = T.length - 1; i >= 0; i--) {
      const o = T[i], s = o.gsStill;
      if (shownIn(o, scene) && same(o, s, se) && okThing(o)) { n++; continue; }
      let inScene = false; for (let p = o.parent; p; p = p.parent) if (p === scene) { inScene = true; break; }
      const w = whyLeft(o, s, se, scene, inScene); stillStats.why[w] = (stillStats.why[w] || 0) + 1;
      leave(o, s, inScene);
      if (!inScene) S.snaps.delete(o);
    }
  }
  // empty areas are dropped now and then (their bundles go with them)
  if (S.list.length > 32 && S.list.some(c => c.empty)) { S.list = S.list.filter(c => !c.empty || (S.cells.delete(c.key), false)); }
  // a share of the rest: kept still for WAIT ms (STEPS looks at least WAIT / STEPS apart), it joins its area
  const L = things, N = L.length, step = WAIT / STEPS;
  for (let k = 0, m = Math.min(N, SCAN); k < m; k++) {
    const o = L[S.cursor++ % N];
    if (o.gsStill || !okThing(o) || !shownIn(o, scene)) continue;
    let s = S.snaps.get(o);
    if (!s) { S.snaps.set(o, s = snapOf()); take(o, s, se); s.t = now; continue; }
    if (!same(o, s, se)) { take(o, s, se); s.n = Math.min(s.n, 0); s.t = now; continue; }
    if (now - s.t < step) continue;
    s.t = now; if (++s.n >= STEPS) { join(S, o, s); n++; }
  }
  if (S.cursor > 1e9) S.cursor = 0;
  stillStats.things = n; stillStats.cells = S.list.reduce((a, c) => a + (c.things.length ? 1 : 0), 0);
  return S;
}
/** Every thing back to drawing itself (HD.bundle off, the view let go of, view.release()). */
export function stillOff(scene) {
  const S = STILL.get(scene); if (!S) return;
  for (const c of S.list) for (const o of c.things) o.gsStill = null;
  STILL.delete(scene); stillStats.things = stillStats.cells = 0;
}
/** For one draw (tests, the frame lab): draw everything one by one, as if nothing were in a bundle. */
export function stillPause(scene, on) { const S = STILL.get(scene); if (S) S.pause = !!on; }

/* ---------- the drawing side: scene-list.js's walk, and the renderer ---------- */

const W = new Sphere();
/**
 * From the scene list's walk (scene-list.js ListPipeline.project), after its own things: each area with things
 * in it that the camera sees is handed to three as a render bundle. Returns whether any was.
 */
const SEEN = [];
const nearFirst = (a, b) => a.gsD - b.gsD;
export function pushCells(pipe, S, scene, camera, list, clip) {
  const se = scene.matrixWorld.elements, F = pipe._frustum, ce = camera.matrixWorld.elements, cm = camera.layers.mask;
  let any = false; SEEN.length = 0;
  for (let ci = 0; ci < S.list.length; ci++) {
    const c = S.list[ci], T = c.things; if (!T.length) continue;
    W.center.set(c.sphere.center.x + se[12], c.sphere.center.y + se[13], c.sphere.center.z + se[14]); W.radius = c.sphere.radius;
    if (!F.intersectsSphere(W)) continue;
    // (an area whose every thing the camera doesn't see this frame, all hidden behind others by occlusion
    // (occlude.js hideNow takes off their first layer for the frame), is left out whole; one partly hidden is
    // drawn whole, its hidden things too: one replayed bundle costs less than drawing the rest one by one)
    let shown = false; for (let i = 0; i < T.length; i++) if (T[i].layers.mask & cm) { shown = true; break; }
    if (!shown) continue;
    const dx = W.center.x - ce[12], dy = W.center.y - ce[13], dz = W.center.z - ce[14];
    c.gsD = dx * dx + dy * dy + dz * dz; SEEN.push(c);
  }
  // (nearest areas first: what they cover further back fails the depth test before its shading runs)
  if (SEEN.length > 1) SEEN.sort(nearFirst);
  for (let ci = 0; ci < SEEN.length; ci++) {
    const c = SEEN[ci];
    c.grp.version = c.v;
    let L = c.lists.get(camera);
    if (!L) { c.lists.set(camera, L = { opaque: [], transparent: [], transparentDoublePass: [], items: [], v: -1, clip: null, entry: null, n: 0, tris: 0 }); L.entry = { bundleGroup: c.grp, camera, renderList: L }; }
    if (L.v !== c.v || L.clip !== clip) fill(L, c, clip);
    if (!L.opaque.length) continue;
    list.pushBundle(L.entry); any = true;
  }
  SEEN.length = 0;
  return any;
}
const byMat = (a, b) => a.material.id - b.material.id || a.geometry.id - b.geometry.id;
function fill(L, c, clip) {
  const O = L.opaque, I = L.items; let k = 0; O.length = 0;
  const put = (o, g, m, gr) => { const it = I[k] ||= { id: 0, object: null, geometry: null, material: null, groupOrder: 0, renderOrder: 0, z: 0, group: null, clippingContext: null }; k++; it.id = o.id; it.object = o; it.geometry = g; it.material = m; it.group = gr; it.clippingContext = clip; O.push(it); };
  for (const o of c.things) {
    const m = o.material, g = o.geometry;
    if (Array.isArray(m)) { for (const gr of g.groups) { const gm = m[gr.materialIndex]; if (gm && gm.visible) put(o, g, gm, gr); } }
    else if (m.visible) put(o, g, m, null);
  }
  for (let i = k; i < I.length; i++) { const it = I[i]; it.object = it.geometry = it.material = it.group = it.clippingContext = null; }
  O.sort(byMat);   // (the same shaders one after another: fewer changes of pipeline in the bundle)
  // (what a replay draws, for the frame's counts: three counts only what it records)
  let tris = 0;
  for (let i = 0; i < k; i++) { const it = O[i], g = it.geometry, n = g.index ? g.index.count : g.attributes.position.count, gr = it.group, dr = g.drawRange; let a = Math.max(0, dr.start), e = Math.min(n, dr.start + dr.count); if (gr) { a = Math.max(a, gr.start); e = Math.min(e, gr.start + gr.count); } tris += Math.max(0, e - a) / 3; }
  L.v = c.v; L.clip = clip; L.n = k; L.tris = Math.round(tris);
}

// what the bundles' recorded draws can hold that may be made anew: a group of bindings made again (a texture
// that grew, a buffer replaced) counts up its own number, and a texture destroyed counts up one for all
let TEX = 0;
const BG_SEEN = new Set();
/**
 * The renderer's side, once per WebGPU renderer (hd3d-gpu.js listWalk): a bundle replayed draws what was there
 * when it was recorded, so it is recorded again when the scene's lights, environment or fog change shaders, when
 * a group of bindings it holds was made anew, or when a texture was destroyed; its draws are counted as drawn;
 * and the bundles are drawn after the sky and before the rest of the opaque things (three's own draws them last,
 * after see-through things too).
 */
export function stillRenderer(r) {
  if (r.gsStill || !r.backend?.beginBundle) return;
  r.gsStill = true;
  const B = r.backend, ub = B.updateBindings, del = B.deleteBindGroupData, dt = B.destroyTexture;
  B.updateBindings = function (bindGroup) { bindGroup.gsE = (bindGroup.gsE || 0) + 1; return ub.apply(this, arguments); };
  if (del) B.deleteBindGroupData = function (bindGroup) { bindGroup.gsE = (bindGroup.gsE || 0) + 1; return del.apply(this, arguments); };
  B.destroyTexture = function () { TEX++; return dt.apply(this, arguments); };
  const rb = r._renderBundle;
  r._renderBundle = function (bundle, sceneRef, lightsNode) {
    const g = bundle.bundleGroup; if (!g.gsCell) return rb.call(this, bundle, sceneRef, lightsNode);
    const ctx = this._currentRenderContext, RB = this._bundles.get(g, bundle.camera, ctx), d = this.backend.get(RB), cd = this.backend.get(ctx);
    // (the scene's own part of every shader's key: its lights, environment and fog, and the renderer's context node)
    const key = this._nodes.getCacheKey(sceneRef, lightsNode) + '|' + this.contextNode.id + ':' + this.contextNode.version;
    if (d.gsKey !== key) { d.gsKey = key; d.version = null; }
    if (d.version !== null && stale(d)) { d.version = null; stillStats.stale++; }
    const I = this.info.render, n0 = cd.renderBundles.length;
    // (three's walk empties the list of what a bundle draws before it is recorded: the cells' walk is ours, so here)
    const fresh = () => { if (d.renderObjects) d.renderObjects.length = 0; else d.renderObjects = []; };
    let rec = this._bundleNeedsUpdate(g, d);
    if (rec) fresh();
    rb.call(this, bundle, sceneRef, lightsNode);
    // (replayed, but a group of bindings was made anew while its uniforms were brought up to date: recorded again now)
    if (!rec && stale(d)) { cd.renderBundles.length = n0; d.version = null; stillStats.stale++; rec = true; fresh(); rb.call(this, bundle, sceneRef, lightsNode); }
    if (rec) {
      stillStats.records++;
      d.gsTex = TEX;
      BG_SEEN.clear(); for (const ro of d.renderObjects || []) for (const bg of ro.getBindings()) BG_SEEN.add(bg);
      const G = d.gsBG = [...BG_SEEN], E = d.gsBGE = new Array(G.length); for (let i = 0; i < G.length; i++) E[i] = G[i].gsE || 0;
      BG_SEEN.clear();
    } else { stillStats.replays++; const L = bundle.renderList; I.drawCalls += L.n; I.triangles += L.tris; }
  };
  const stale = d => {
    if (d.gsTex !== TEX) return true;
    const G = d.gsBG, E = d.gsBGE; if (!G) return true;
    for (let i = 0; i < G.length; i++) if ((G[i].gsE || 0) !== E[i]) return true;
    return false;
  };
  // the bundles waiting in this render pass drawn now (and the pass's own state, which a bundle resets, forgotten)
  const flush = rr => {
    const ctx = rr._currentRenderContext; if (!ctx) return;
    const cd = rr.backend.get(ctx), list = cd.renderBundles;
    if (!list?.length || cd._currentPass || !cd.currentPass?.executeBundles) return;   // (none, or a bundle being recorded)
    cd.currentPass.executeBundles(list); list.length = 0;
    cd.currentSets = { attributes: {}, bindingGroups: [], pipeline: null, index: null };
  };
  const ro = r._renderObjects;
  r._renderObjects = function (list, camera, scene, lightsNode, passId) {
    if (list.gsCells !== true) return ro.call(this, list, camera, scene, lightsNode, passId);
    list.gsCells = false;
    // first what goes before the still things: what doesn't test depth (a background) and what asked to go first
    let k = 0;
    while (k < list.length) { const it = list[k]; if (!(it.material.depthTest === false || it.groupOrder < 0 || it.renderOrder < 0)) break; k++; }
    if (k) ro.call(this, list.slice(0, k), camera, scene, lightsNode, passId);
    flush(this);
    return ro.call(this, k ? list.slice(k) : list, camera, scene, lightsNode, passId);
  };
  const rt = r._renderTransparents;
  r._renderTransparents = function () { flush(this); return rt.apply(this, arguments); };
}
