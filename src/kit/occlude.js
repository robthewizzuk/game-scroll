// The Next Gen view's side of occlusion culling (hd3d.js). occlusion.js holds the small depth picture and
// answers "is this hidden?"; this is what a view does round it each frame:
//  - track: walks what the camera draws and notes what each thing does to the depth picture (solid,
//    swaying in its shader, see-through), tells the picture about everything that has moved, changed
//    shape or gone since the last frame (its old place stops hiding things at once) and where the
//    swaying things are (the picture is less sure there), and lists what could be hidden;
//  - test: asks the picture about each of those. An answer stands while neither the picture nor the thing
//    has changed, so a still camera in a still scene asks nothing;
//  - hide and show: what is hidden leaves the camera's layer for the main draw alone. Raycasts, shadows,
//    reflections, bakes and bounce light look from somewhere else, or at another time, and find
//    everything where it was;
//  - copies (gs.props): a set is asked about copy by copy when small, in cells of a grid when big;
//  - the meter (WebGL here, hd3d-gpu.js depthMeter on WebGPU): the chip boils the frame's depth down to
//    the small picture and it is read back without waiting for it;
//  - sleep: a view where hiding saves less than it costs stops doing any of this, and looks again later.
// Kit use only.
import { LessDepth, LessEqualDepth, NormalBlending, Object3D, ShaderMaterial, WebGLRenderTarget, NearestFilter, Vector2 } from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { Occlusion, pictureSize } from './occlusion.js';
import { DETAIL, stats as detailStats } from './detail.js';

/** The layer hidden things move to for the main draw: the view's camera does not draw it, shadow cameras do. */
export const OCC_LAYER = 30, OCC_BIT = 1 << OCC_LAYER;
const OBR = Object3D.prototype.onBeforeRender, OAR = Object3D.prototype.onAfterRender;
// SOFT_SPEED: how fast leaves and grass may sway, metres a second (looks.js: a tall tree's top in a gale is
// under half of this); SWAY_PAD: how far they may be outside their mesh's own box, metres
const SOFT_SPEED = 1.5, SWAY_PAD = .5;
// TRIAL: frames hiding is tried for before it is judged; NAP..NAP_MAX: frames it then sleeps when it saved
// too little (longer each time); WORTH: triangles a frame it must save, and as a share of the frame's;
// WAKE: a view with fewer triangles and draws than this is never tried; NO_PICTURE: frames, and milliseconds,
// with no depth picture back from the chip before it gives up for a long while
const TRIAL = 45, NAP = 90, NAP_MAX = 600, WORTH_TRIS = 2000, WORTH_SHARE = .02, WAKE_TRIS = 20000, WAKE_CALLS = 120, NO_PICTURE = 40, NO_PICTURE_MS = 1000;
// What hiding is worth against what it costs, in milliseconds a frame. On a Galaxy Z Fold 8 (2026-11-12, the
// engine test scenes' town) it left out a quarter of the town's triangles, 27,739 a frame in 21 draws, for
// 1.28 ms of its own code, and neither the chip's time nor the frame rate got any better: a phone's chip is
// held up by pixels far more than by triangles, and a thing behind a house costs it no pixels either way.
// TRI_MS: what a triangle left out saves the chip (the same phone took 6.9 ms less for 740,000 fewer triangles
// through cluster detail, and 2.1 ms less for 255,000 fewer in its shadow maps); DRAW_MS: what a draw left out
// saves the code; METER_MS: what boiling the frame's depth down and reading it back costs the chip; PAY: how
// much more than its cost it must save before it is kept on.
const TRI_MS = 9e-6, DRAW_MS = .012, METER_MS = .4, PAY = 1.25;
/** Does hiding pay? tris, draws: what it left out a frame; ms: what its own code took a frame. */
export function occludePays(tris, draws, ms) { return tris * TRI_MS + draws * DRAW_MS > (ms + METER_MS) * PAY; }
// PER_COPY: an instanced mesh of up to this many copies is checked copy by copy when it changes, and
// MOVED_MAX: more copies than this moving at once count as the whole of it; CELL_COPIES: a gs.props set of
// more copies than this is asked about in cells
const PER_COPY = 1024, MOVED_MAX = 64, CELL_COPIES = 256, EVERYWHERE = 1e9;
// SOFT_MAX: swaying things whose boxes are told to the picture one by one (any more share the last one's box)
const SOFT_MAX = 48;

/* ---------- what a thing does to the depth picture ---------- */
// A material: 0 writes no depth (it neither hides nor shows in the picture); 1 solid; 2 solid, and swaying
// in its shader (leaves, grass); 3 writes depth but is seen through, so it must never hide anything; 4 its
// own shader puts its points where it likes, so not even its box is known
function matKind(m) {
  if (!m || m.visible === false || m.depthWrite === false) return 0;
  const L = m.userData?.gsLooks; let sway = false;
  if (L) for (let i = 0; i < L.length; i++) if (L[i] === 'leaves' || L[i] === 'meadow') sway = true;
  // (on WebGPU the kit's swaying looks move their leaves and blades through positionNode: a known, small move)
  if (m.isShaderMaterial || (m.positionNode && !sway) || m.vertexNode || m.depthNode || m.displacementMap) return 4;
  if (m.transparent || m.alphaHash || m.alphaToCoverage || m.transmission > 0 || m.depthTest === false || (m.depthFunc !== LessEqualDepth && m.depthFunc !== LessDepth)
    || m.wireframe || m.colorWrite === false || m.blending !== NormalBlending) return 3;
  return sway ? 2 : 1;
}
// A thing, by its materials (the WebGL ones: a WebGPU twin says the same in other words) and what it is:
// lines, points and sprites that write depth are seen past, and so is anything that changes shape
// (skinned, morphing, moved on the chip)
function objKind(o) {
  const ms = o.userData.gsGlMat || o.material; let k = 0;
  if (Array.isArray(ms)) { for (let i = 0; i < ms.length; i++) { const q = matKind(ms[i]); if (q > k) k = q; } } else k = matKind(ms);
  if (k && k < 3 && (!o.isMesh || o.isSkinnedMesh || o.morphTargetInfluences || o.userData.gsMoved !== undefined)) k = 3;
  return k;
}
const plain = m => !m || (m.depthTest !== false && (m.depthFunc === LessEqualDepth || m.depthFunc === LessDepth));
// Can it be hidden at all? A mesh three culls by its bounds, drawn with the usual depth test (one drawn
// over everything, or only where it is behind something, must be drawn), with no hooks of a game's own
function testable(o) {
  if (!o.isMesh || !o.frustumCulled || o.userData.noOcclude) return false;
  if ((o.onBeforeRender !== OBR || o.onAfterRender !== OAR) && !o.isBatchedMesh) return false;
  const ms = o.userData.gsGlMat || o.material;
  if (Array.isArray(ms)) { for (let i = 0; i < ms.length; i++) if (!plain(ms[i])) return false; return true; }
  return plain(ms);
}

/* ---------- where a thing is: its box in the world, six numbers ---------- */
const scaleOf = e => Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
function grow(b, x, y, z, r) {
  if (x - r < b[0]) b[0] = x - r; if (y - r < b[1]) b[1] = y - r; if (z - r < b[2]) b[2] = z - r;
  if (x + r > b[3]) b[3] = x + r; if (y + r > b[4]) b[4] = y + r; if (z + r > b[5]) b[5] = z + r;
}
const none = b => { b[0] = b[1] = b[2] = Infinity; b[3] = b[4] = b[5] = -Infinity; };
const padBox = (b, p) => { b[0] -= p; b[1] -= p; b[2] -= p; b[3] += p; b[4] += p; b[5] += p; };
// a local box (min, max) under a world matrix
function boxUnder(b, bb, e) {
  none(b);
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? bb.max.x : bb.min.x, y = i & 2 ? bb.max.y : bb.min.y, z = i & 4 ? bb.max.z : bb.min.z;
    grow(b, e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], 0);
  }
}
// One thing's box into b. 1: known; 0: nobody knows where it draws; 2: it has nothing to draw.
function boundsOf(o, b, kind) {
  const ub = o.userData.gsBounds;   // (a kit part that knows better: gs.fluid's box)
  if (ub) { for (let i = 0; i < 6; i++) b[i] = ub[i]; padBox(b, .5); return 1; }
  const g = o.geometry; if (!g) return 2;
  if (o.isSkinnedMesh && o.skeleton) {
    // a posed body: round its bones, and as much again as a quarter of the body's own size for the flesh on them
    const bones = o.skeleton.bones; if (!bones.length) return 0;
    none(b); for (let i = 0; i < bones.length; i++) { const e = bones[i].matrixWorld.elements; grow(b, e[12], e[13], e[14], 0); }
    if (!g.boundingSphere) g.computeBoundingSphere();
    padBox(b, .1 + .3 * (g.boundingSphere?.radius || 1) * scaleOf(o.matrixWorld.elements));
    return 1;
  }
  if (o.userData.gsMoved !== undefined) return 0;   // placed on the chip
  if (kind === 4 && !o.frustumCulled) return 0;   // (its maker says its box is not where it draws)
  if (o.isBatchedMesh && !o.isDetailMesh) { o.computeBoundingBox(); if (!o.boundingBox || o.boundingBox.isEmpty()) return 2; boxUnder(b, o.boundingBox, o.matrixWorld.elements); return 1; }
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox; if (!bb || !(bb.min.x <= bb.max.x)) return 2;
  boxUnder(b, bb, o.matrixWorld.elements);
  if (kind === 2) padBox(b, SWAY_PAD);
  else if (kind === 4) { const m = o.userData.gsGlMat || o.material, d = Array.isArray(m) ? 0 : Math.abs(m.displacementScale || 0) + Math.abs(m.displacementBias || 0); padBox(b, m.displacementMap ? d + .05 : 1 + .25 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2])); }
  else if (!o.frustumCulled && kind === 3) padBox(b, 2);
  return 1;
}
// the box of copy i of a list of matrices (16 numbers each), under the world matrix e, for a shape whose bounding sphere is (cx, cy, cz, r)
function copySphere(D, i, e, ws, cx, cy, cz, r, out) {
  const o = i * 16, x = D[o] * cx + D[o + 4] * cy + D[o + 8] * cz + D[o + 12], y = D[o + 1] * cx + D[o + 5] * cy + D[o + 9] * cz + D[o + 13], z = D[o + 2] * cx + D[o + 6] * cy + D[o + 10] * cz + D[o + 14];
  const s = Math.sqrt(Math.max(D[o] * D[o] + D[o + 1] * D[o + 1] + D[o + 2] * D[o + 2], D[o + 4] * D[o + 4] + D[o + 5] * D[o + 5] + D[o + 6] * D[o + 6], D[o + 8] * D[o + 8] + D[o + 9] * D[o + 9] + D[o + 10] * D[o + 10]));
  out[0] = e[0] * x + e[4] * y + e[8] * z + e[12]; out[1] = e[1] * x + e[5] * y + e[9] * z + e[13]; out[2] = e[2] * x + e[6] * y + e[10] * z + e[14]; out[3] = r * s * ws;
}
const SP = new Float64Array(4), B6 = new Float64Array(6);

/* ---------- the record kept for each thing ---------- */
class Rec {
  constructor() {
    this.f = 0; this.m = new Float64Array(16).fill(NaN); this.b = new Float64Array(6); this.known = 0;
    this.g = null; this.pv = -1; this.dc = -1; this.iv = -1; this.n = 0; this.kind = 0; this.ch = false;
    this.hid = false; this.st = -1; this.inst = null; this.cells = null; this.set = null; this.sf = 0;
  }
}
// has its world matrix changed? (and keeps the new one)
function movedOf(r, e) { const m = r.m; let ch = false; for (let i = 0; i < 16; i++) if (m[i] !== e[i]) { m[i] = e[i]; ch = true; } return ch; }
const gone = (oc, r) => { if (r.kind > 0) { if (r.known === 1) oc.movedBounds(r.b); else if (r.known === 0) oc.moved(-EVERYWHERE, -EVERYWHERE, -EVERYWHERE, EVERYWHERE, EVERYWHERE, EVERYWHERE); } };

// one mesh (or line, points, sprite)
function trackOne(o, r, oc, kind, fresh) {
  const g = o.geometry, pv = g?.attributes.position?.version ?? -1, dr = g?.drawRange, dc = dr ? dr.start * 7 + (dr.count === Infinity ? -1 : dr.count) : 0;
  let ch = movedOf(r, o.matrixWorld.elements) || fresh;
  if (g !== r.g || pv !== r.pv || dc !== r.dc || o.isSkinnedMesh || kind !== r.kind) { ch = true; r.g = g; r.pv = pv; r.dc = dc; }
  // (a see-through thing is taken out of every picture, where it stands: nothing else says it is one)
  if (!fresh && (ch || kind >= 3 || r.kind >= 3)) gone(oc, r);
  if (ch) r.known = boundsOf(o, r.b, kind);
  r.ch = ch;
}
// three's own InstancedMesh: the copies that moved, one by one when there are few
function trackCopies(o, r, oc, kind, fresh) {
  const g = o.geometry, n = o.count, D = o.instanceMatrix.array, iv = o.instanceMatrix.version * 8191 + n, e = o.matrixWorld.elements;
  let ch = movedOf(r, e) || fresh; if (g !== r.g) { ch = true; r.g = g; }
  const lists = iv !== r.iv, few = n <= PER_COPY && r.n <= PER_COPY && r.inst && !ch && kind < 3 && r.kind < 3;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const c = g.boundingSphere.center, rad = g.boundingSphere.radius, ws = scaleOf(e);
  if (!fresh && r.kind > 0) {
    if (!few) { if (ch || lists || kind >= 3 || r.kind >= 3) gone(oc, r); }
    else if (lists) {
      const was = r.inst, m = Math.max(n, r.n); let k = 0;
      for (let i = 0; i < r.n && k <= MOVED_MAX; i++) { if (i >= n) { k++; continue; } const q = i * 16; for (let j = 0; j < 16; j++) if (was[q + j] !== D[q + j]) { k++; break; } }
      if (k > MOVED_MAX) gone(oc, r);
      else for (let i = 0; i < m && i < r.n; i++) {
        const q = i * 16; let diff = i >= n; for (let j = 0; j < 16 && !diff; j++) if (was[q + j] !== D[q + j]) diff = true;
        if (!diff) continue;
        copySphere(was, i, e, ws, c.x, c.y, c.z, rad, SP); oc.moved(SP[0] - SP[3], SP[1] - SP[3], SP[2] - SP[3], SP[0] + SP[3], SP[1] + SP[3], SP[2] + SP[3]);
      }
    }
  }
  if (ch || lists) {
    none(r.b); for (let i = 0; i < n; i++) { copySphere(D, i, e, ws, c.x, c.y, c.z, rad, SP); grow(r.b, SP[0], SP[1], SP[2], SP[3]); }
    r.known = n > 0 ? 1 : 2; if (kind === 2 && n) padBox(r.b, SWAY_PAD);
    if (n <= PER_COPY) { if (!r.inst || r.inst.length < n * 16) r.inst = new Float32Array(Math.max(16, n) * 16); r.inst.set(D.subarray(0, n * 16)); } else r.inst = null;
    r.iv = iv; r.n = n;
  }
  r.ch = ch || lists;
}
// A gs.props set (InstancedMesh2): where each copy is and how far it reaches, and the cells it is asked
// about in. Up to CELL_COPIES copies are a cell each; more share the cells of a grid laid over the set.
function buildCells(set, r, kind) {
  const D = set.matricesTexture?._data, n = D ? Math.min(set._instancesArrayCount || 0, D.length >> 4) : 0, g = set.geometry, e = set.matrixWorld.elements, ws = scaleOf(e);
  if (!g.boundingSphere) g.computeBoundingSphere();
  const c = g.boundingSphere.center, rad = g.boundingSphere.radius, pad = kind === 2 ? SWAY_PAD : 0;
  const C = r.cells ||= { n: 0, sph: new Float32Array(0), of: new Uint16Array(0), box: new Float64Array(0), hid: new Uint8Array(0), cells: 0, stamp: -1, G: 0, x0: 0, z0: 0, kx: 0, kz: 0, hidN: 0, tris: 0, oc: null, cam: null, on: false, fn: null };
  if (C.sph.length < n * 4) { C.sph = new Float32Array(Math.ceil(n * 1.25) * 4); C.of = new Uint16Array(Math.ceil(n * 1.25)); }
  const sph = C.sph, b = r.b; none(b);
  for (let i = 0; i < n; i++) { copySphere(D, i, e, ws, c.x, c.y, c.z, rad + pad, SP); const q = i * 4; sph[q] = SP[0]; sph[q + 1] = SP[1]; sph[q + 2] = SP[2]; sph[q + 3] = SP[3]; grow(b, SP[0], SP[1], SP[2], SP[3]); }
  const G = n <= CELL_COPIES ? 0 : Math.min(64, Math.max(2, Math.ceil(Math.sqrt(n / 12)))), cells = G ? G * G : n;
  if (C.box.length < cells * 6) { C.box = new Float64Array(cells * 6); C.hid = new Uint8Array(cells); }
  C.n = n; C.cells = cells; C.G = G; C.stamp = -1; C.x0 = b[0]; C.z0 = b[2]; C.kx = G / Math.max(1e-6, b[3] - b[0]); C.kz = G / Math.max(1e-6, b[5] - b[2]);
  C.tris = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
  const box = C.box; for (let k = 0; k < cells * 6; k += 6) { box[k] = box[k + 1] = box[k + 2] = Infinity; box[k + 3] = box[k + 4] = box[k + 5] = -Infinity; }
  for (let i = 0; i < n; i++) placeCopy(C, i);
  r.known = n > 0 ? 1 : 2; r.n = n;
}
function placeCopy(C, i) {
  const q = i * 4, sph = C.sph, x = sph[q], y = sph[q + 1], z = sph[q + 2], rr = sph[q + 3], G = C.G;
  const cell = G ? Math.min(G - 1, Math.max(0, Math.floor((x - C.x0) * C.kx))) + Math.min(G - 1, Math.max(0, Math.floor((z - C.z0) * C.kz))) * G : i;
  C.of[i] = cell; const k = cell * 6, box = C.box;
  if (x - rr < box[k]) box[k] = x - rr; if (y - rr < box[k + 1]) box[k + 1] = y - rr; if (z - rr < box[k + 2]) box[k + 2] = z - rr;
  if (x + rr > box[k + 3]) box[k + 3] = x + rr; if (y + rr > box[k + 4]) box[k + 4] = y + rr; if (z + rr > box[k + 5]) box[k + 5] = z + rr;
}
/** Is copy i of a set hidden? (C: the set's cells; a cell is asked about once for each picture.) */
function copyHidden(C, i) {
  const oc = C.oc; if (!oc || i >= C.n) return false;
  if (C.stamp !== oc.stamp) { C.hid.fill(0, 0, C.cells); C.stamp = oc.stamp; }
  const c = C.of[i]; let h = C.hid[c]; if (!h) h = C.hid[c] = oc.hiddenBounds(C.box, c * 6) ? 2 : 1;
  if (h !== 2) return false;
  C.hidN++; return true;
}
// a set: props.js notes the copies that are moved, hidden or shown (watched()), so one copy moving costs one copy's work
function trackSet(set, r, oc, kind, fresh) {
  const n = set._instancesArrayCount || 0, iv = (set.userData.gsChanged || 0) * 131 + (set.matricesTexture?.version || 0) * 17 + n, e = set.matrixWorld.elements;
  let ch = movedOf(r, e) || fresh; if (set.geometry !== r.g) { ch = true; r.g = set.geometry; }
  const w = set.userData.occWatch, lists = iv !== r.iv, few = lists && !ch && w && !w.all && n === r.n && kind < 3 && r.kind < 3 && r.cells;
  if (!fresh && r.kind > 0) {
    if (few) { const old = w.old, ws = scaleOf(e); for (let i = 0; i < old.length; i += 4) { const x = old[i], y = old[i + 1], z = old[i + 2], rr = old[i + 3] * ws + (kind === 2 ? SWAY_PAD : 0), X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; oc.moved(X - rr, Y - rr, Z - rr, X + rr, Y + rr, Z + rr); } }
    else if (ch || lists || kind >= 3 || r.kind >= 3) gone(oc, r);
  }
  if (few) {
    // the copies that changed take their new places (a cell and the set's box only ever grow until the set is gone through again)
    const D = set.matricesTexture._data, g = set.geometry, c = g.boundingSphere.center, ws = scaleOf(e), C = r.cells, pad = kind === 2 ? SWAY_PAD : 0;
    for (const i of w.ids) { if (i >= C.n) continue; copySphere(D, i, e, ws, c.x, c.y, c.z, g.boundingSphere.radius + pad, SP); const q = i * 4; C.sph[q] = SP[0]; C.sph[q + 1] = SP[1]; C.sph[q + 2] = SP[2]; C.sph[q + 3] = SP[3]; placeCopy(C, i); grow(r.b, SP[0], SP[1], SP[2], SP[3]); }
    C.stamp = -1;
  } else if (ch || lists || !r.cells) buildCells(set, r, kind);
  if (w) { w.ids.length = 0; w.old.length = 0; w.all = false; } else set.userData.occWatch = { ids: [], old: [], all: false };
  r.iv = iv; r.ch = ch || lists; r.set = set;
}

/* ---------- a frame ---------- */
const trisOf = o => { if (o.isDetailMesh) return o._last?.tris || 0; const g = o.geometry; if (!g) return 0; const n = g.index ? g.index.count : g.attributes.position?.count || 0, dr = g.drawRange; return Math.min(n, dr.count === Infinity ? n : dr.count) / 3 * (o.isInstancedMesh ? o.count : 1); };
function newState() { return { recs: new Map(), list: [], hide: [], sets: [], f: 0, gen: 0, awake: false, nap: 0, napLen: NAP, n: 0, saved: 0, draws: 0, cost: 0, pays: null, blind: 0, blindT: 0, ms: 0, hidden: 0, tris: 0, copies: 0, soft: false, softB: new Float64Array(SOFT_MAX * 6), softN: 0, softAll: false }; }
// a thing that sways in its shader: its box is where the picture is less sure (k0: what it was taken for when its box was made)
function swaying(A, r, f, k0) {
  if (r.sf === f) return; r.sf = f;
  if (r.known === 0) { A.softAll = true; return; }
  if (r.known !== 1) return;
  const b = r.b, p = k0 === 2 ? 0 : SWAY_PAD, B = A.softB;
  if (A.softN < SOFT_MAX) { const o = A.softN++ * 6; B[o] = b[0] - p; B[o + 1] = b[1] - p; B[o + 2] = b[2] - p; B[o + 3] = b[3] + p; B[o + 4] = b[4] + p; B[o + 5] = b[5] + p; return; }
  const o = (SOFT_MAX - 1) * 6;
  for (let i = 0; i < 3; i++) { if (b[i] - p < B[o + i]) B[o + i] = b[i] - p; if (b[i + 3] + p > B[o + i + 3]) B[o + i + 3] = b[i + 3] + p; }
}
function drop(view, A) {
  for (const r of A.recs.values()) if (r.set) { delete r.set.userData.occWatch; if (r.cells) { r.cells.oc = null; r.cells.on = false; } }
  A.recs.clear(); A.list.length = A.hide.length = A.sets.length = 0;
}
function sleep(view, A, oc, len) {
  A.awake = false; A.nap = len; A.gen++; A.n = A.saved = A.draws = A.cost = A.blind = 0;
  oc?.forget();
  if (!oc?.boxes.length) drop(view, A);
}

/**
 * The view's occlusion culling for this frame, before it draws. o: { on: any hiding at all; depth: the last
 * frame's depth may be used (not AR, not a card's picture); other: another view has drawn since this one;
 * W, H: the frame's size in pixels; tris, calls: what the last frame drew; sleep: false never sleeps (tests);
 * world: false when the scene's world matrices are already this frame's;
 * texels: the depth picture's size }. Leaves view.occAuto.hide as the list to hide (hideNow()) and gives
 * what to take this frame's depth picture with ({ tag, w, h, gen }), or null for none.
 */
export function occludeFrame(view, cam, o) {
  const A = view.occAuto ||= newState(), t0 = performance.now(), job = occludeWork(view, cam, o, A);
  A.ms = performance.now() - t0;
  if (A.awake) A.cost += A.ms;
  return job;
}
function occludeWork(view, cam, o, A) {
  A.hide.length = 0; A.sets.length = 0; A.hidden = A.tris = 0;
  let oc = view.occlusion;
  const listed = !!oc?.boxes.length;
  if (!o.on || !(cam.layers.mask & 1)) { if (A.awake) sleep(view, A, oc, 0); if (A.recs.size) drop(view, A); DETAIL.occ = null; return null; }
  if (o.other && A.awake) { oc?.forget(); if (!listed) drop(view, A); A.gen++; A.n = A.saved = A.draws = A.cost = A.blind = 0; }   // (what it knew is from before the other view drew)
  // awake or asleep: tried when the view is big enough for hiding to be worth a millisecond, slept when it was not
  if (!o.depth) { if (A.awake) sleep(view, A, oc, 0); }
  else if (!A.awake) {
    if (o.sleep === false || (A.nap-- <= 0 && (o.tris >= WAKE_TRIS || o.calls >= WAKE_CALLS))) { A.awake = true; A.n = A.saved = A.draws = A.cost = A.blind = 0; } else if (A.nap < 0) A.nap = 30;
  }
  if (!A.awake && !listed) { if (A.recs.size) drop(view, A); DETAIL.occ = null; return null; }
  oc = view.occlusion ||= new Occlusion();
  // what the camera draws: what has moved, who sways, what could be hidden
  const f = ++A.f, recs = A.recs, list = A.list; list.length = 0; let soft = false, copies = 0; A.softN = 0; A.softAll = false;
  if (o.world !== false) view.scene.updateMatrixWorld();
  view.scene.traverseVisible(ob => {
    if (ob.isLight) { if (ob.shadow) ob.shadow.camera.layers.enable(OCC_LAYER); return; }
    if (!(ob.isMesh || ob.isPoints || ob.isLine || ob.isSprite) || !(ob.layers.mask & 1) || ob._parentLOD) return;
    const set = ob.isInstancedMesh2 ? ob : ob.userData.gsTwin?.isInstancedMesh2 ? ob.userData.gsTwin : null;
    const kind = objKind(ob), can = !set && testable(ob);
    if (!kind && !can && !set) return;
    const key = set || ob; let r = recs.get(key);
    if (r && r.f === f) { if (kind === 2) { soft = true; swaying(A, r, f, r.kind); } if (kind > r.kind) r.kind = kind; return; }   // (a set's other detail levels)
    const fresh = !r; if (fresh) recs.set(key, r = new Rec());
    r.f = f;
    if (set) {
      trackSet(set, r, oc, kind, fresh);
      const C = r.cells; C.oc = oc; C.cam = cam; copies += C.hidN * C.tris * .3; C.hidN = 0; A.sets.push(C);
      // WebGL: the set draws itself, copy by copy as its own culling lets each into view
      if (ob === set && !set.occWrapped) { const own = set.onFrustumEnter; set.occWrapped = true; set.onFrustumEnter = function (i, camera, ...a) { const Q = set.userData.occCells; return !(Q && Q.on && camera === Q.cam && copyHidden(Q, i)) && (!own || own.call(this, i, camera, ...a)); }; }
      set.userData.occCells = C;
    } else if (ob.isInstancedMesh) trackCopies(ob, r, oc, kind, fresh);
    else trackOne(ob, r, oc, kind, fresh);
    r.kind = kind; if (kind === 2) { soft = true; swaying(A, r, f, 2); }
    if (can && r.known === 1) list.push(ob, r);
  });
  // what was drawn last frame and is not now (gone, switched off, held back, merged) is no longer where the picture has it
  for (const [key, r] of recs) if (r.f !== f) { gone(oc, r); if (r.set) { delete r.set.userData.occWatch; r.set.userData.occCells = null; } recs.delete(key); }
  A.soft = soft; oc.soft = soft ? SOFT_SPEED : false; oc.softBoxes = A.softAll ? null : A.softB; oc.softN = A.softN;
  oc.frame(cam, o.W / o.H);
  const stamp = oc.stamp, hide = A.hide; let tris = 0;
  for (let i = 0; i < list.length; i += 2) {
    const ob = list[i], r = list[i + 1];
    if (r.st !== stamp || r.ch) { r.hid = oc.hiddenBounds(r.b); r.st = stamp; }
    if (r.hid) { hide.push(ob); tris += trisOf(ob); }
  }
  A.hidden = hide.length; A.tris = tris; A.copies = copies;
  DETAIL.occ = oc;
  if (!A.awake) return null;
  // is it paying? (what it hid of meshes, of copies and inside cluster detail's meshes, a frame, against what finding that cost)
  if (oc.stats.depth) { A.n++; A.saved += tris + copies + (detailStats.hid || 0); A.draws += hide.length; A.blind = 0; } else if (++A.blind === 1) A.blindT = performance.now(); else if (A.blind > NO_PICTURE && o.sleep !== false && performance.now() - A.blindT > NO_PICTURE_MS) { sleep(view, A, oc, NAP_MAX); if (!listed) { DETAIL.occ = null; hide.length = 0; } return null; }
  if (A.n >= TRIAL) {
    const mean = A.saved / A.n, pays = A.pays = mean >= Math.max(WORTH_TRIS, WORTH_SHARE * (o.tris || 0)) && occludePays(mean, A.draws / A.n, A.cost / A.n); A.n = A.saved = A.draws = A.cost = 0;
    if (o.sleep !== false && !pays) { const len = A.napLen; A.napLen = Math.min(NAP_MAX, Math.round(len * 2.5)); sleep(view, A, oc, len); if (!listed) { DETAIL.occ = null; hide.length = 0; } return null; }
    A.napLen = NAP;
  }
  const [w, h] = pictureSize(o.W / o.H, o.texels || 2400);
  return { tag: oc.shot(cam, o.W, o.H), w, h, gen: A.gen, A, oc };
}
/** Just before the main draw: what is hidden leaves the camera's layer, and the sets' copies are asked about. */
export function hideNow(view) {
  const A = view.occAuto; if (!A) return;
  const hid = view.occHid ||= new Map(), hide = A.hide;
  for (let i = 0; i < hide.length; i++) { const o = hide[i], m = o.layers.mask; if (m & 1) { hid.set(o, m); o.layers.mask = (m & ~1) | OCC_BIT; } }
  for (const C of A.sets) C.on = true;
}
/** Straight after it: everything back on the camera's layer. */
export function showAll(view) {
  const hid = view.occHid; if (hid?.size) { for (const [o, m] of hid) o.layers.mask = m; hid.clear(); }
  const A = view.occAuto; if (A) for (const C of A.sets) C.on = false;
}
/** A set's copies, for the WebGPU twins (hd3d-gpu.js gpuProps.sync): a function of the copy's number, or null. */
export function copiesHidden(view, set) {
  const C = view.occAuto && set.userData.occCells; if (!C || !C.oc?.ready) return null;
  return C.fn ||= i => copyHidden(C, i);
}
/** A depth picture back from the chip (job: what occludeFrame() gave). */
export function depthBack(job, px, flip) { const A = job.A; if (A.gen === job.gen && A.awake) { const t0 = performance.now(); job.tag.pad = job.pad | 0; job.oc.depth(px, job.w, job.h, job.tag, flip); A.cost += performance.now() - t0; } }
/** The view stops drawing (or its things go to another view): nothing stays hidden or watched. */
export function occludeDrop(view) { showAll(view); const A = view.occAuto; if (A) { drop(view, A); A.awake = false; A.gen++; A.nap = 0; } view.occlusion?.forget(); }

/* ---------- the meter, WebGL ---------- */
// Each texel of the small picture: the FARTHEST depth of its block of the frame as three bytes (rounded up),
// and how much nearer the block's nearest is as a fourth (occlusion.js depth() says how). pad: pixels a
// block is widened by all round, 1 when the frame is drawn a fraction of a pixel off (the kit's
// anti-aliasing) or with several samples a pixel. pk: the projection's two depth numbers.
const METER = `precision highp float; precision highp sampler2D;
  uniform sampler2D tDepth; uniform vec2 blk, pk; uniform int pad;
  void main() {
    ivec2 size = textureSize(tDepth, 0), t = ivec2(gl_FragCoord.xy);
    ivec2 lo = max(ivec2(floor(vec2(t) * blk)) - pad, ivec2(0)), hi = min(ivec2(ceil(vec2(t + 1) * blk)) - 1 + pad, size - 1);
    float far = 0., near = 1.;
    for (int y = lo.y; y <= hi.y; y++) for (int x = lo.x; x <= hi.x; x++) { float d = texelFetch(tDepth, ivec2(x, y), 0).r; far = max(far, d); near = min(near, d); }
    bool none = far >= 1.;
    float q = none ? 16777215. : min(16777214., ceil(far * 16777215.) + 1.);
    float D = pk.y / (far * 2. - 1. + pk.x), N = pk.y / (near * 2. - 1. + pk.x);
    float a = none ? 0. : min(255., ceil(255. * sqrt(max(0., 1. - N / D))));
    float b0 = floor(q / 65536.), rem = q - b0 * 65536., b1 = floor(rem / 256.);
    gl_FragColor = vec4(b0, b1, rem - b1 * 256., a) / 255.;
  }`;
/**
 * A pass for the WebGL chain, straight after the scene is drawn: set .job (what occludeFrame() gave, and
 * pad) before the chain runs. The picture is read into a buffer on the chip and collected by poll() on a
 * later frame, when the chip has got to it: nothing waits.
 */
export class DepthMeter extends Pass {
  constructor() {
    super(); this.needsSwap = false; this.job = null; this.rt = null; this.gl = null; this.slots = [];
    this.mat = new ShaderMaterial({
      uniforms: { tDepth: { value: null }, blk: { value: new Vector2(1, 1) }, pk: { value: new Vector2() }, pad: { value: 0 } },
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: METER, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  render(renderer, writeBuffer, readBuffer) {
    const job = this.job; this.job = null;
    const gl = renderer.getContext(); if (!job || !readBuffer.depthTexture || gl.isContextLost()) return;
    if (gl !== this.gl) { this.gl = gl; this.slots.length = 0; }
    let s = null; for (const q of this.slots) if (!q.busy) { s = q; break; }
    if (!s) { if (this.slots.length >= 3) return; this.slots.push(s = { buf: null, size: 0, px: null, sync: null, busy: false, ready: false, job: null }); }   // (three on their way: this frame goes without)
    const { w, h } = job, n = w * h * 4;
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) { this.rt?.dispose(); this.rt = new WebGLRenderTarget(w, h, { depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false }); }
    const u = this.mat.uniforms; u.tDepth.value = readBuffer.depthTexture; u.blk.value.set(readBuffer.width / w, readBuffer.height / h); u.pk.value.set(job.tag.p10, job.tag.p14); u.pad.value = job.pad | 0;
    renderer.setRenderTarget(this.rt); this.quad.render(renderer);
    try {
      renderer.state.bindFramebuffer(gl.FRAMEBUFFER, renderer.properties.get(this.rt).__webglFramebuffer);
      if (s.size !== n) { if (s.buf) gl.deleteBuffer(s.buf); s.buf = gl.createBuffer(); s.size = n; s.px = new Uint8Array(n); }
      // (its store is asked for afresh each time: written to again as it stands, Chrome throws away the copy it keeps to hand the bytes back quickly, and says so on every frame)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.buf); gl.bufferData(gl.PIXEL_PACK_BUFFER, n, gl.STREAM_READ);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      s.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); s.busy = true; s.job = job;
    } catch (e) { s.busy = false; }
    finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); }
  }
  /** Collects the pictures the chip has finished (oldest first). Call once a frame, before occludeFrame(). */
  poll() {
    const gl = this.gl; if (!gl || !this.slots.length) return;
    if (gl.isContextLost()) { this.slots.length = 0; return; }
    let any = false;
    for (const s of this.slots) {
      if (!s.busy || s.ready) continue;
      let st; try { st = gl.clientWaitSync(s.sync, 0, 0); } catch (e) { st = gl.WAIT_FAILED; }
      if (st === gl.TIMEOUT_EXPIRED) continue;
      if (st !== gl.WAIT_FAILED) { try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.buf); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, s.px); s.ready = true; any = true; } catch (e) { /* this one is lost */ } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } }
      gl.deleteSync(s.sync); s.sync = null; if (!s.ready) { s.busy = false; s.job = null; }
    }
    if (!any) return;
    const done = this.slots.filter(s => s.ready).sort((a, b) => a.job.tag.f - b.job.tag.f);
    for (const s of done) { depthBack(s.job, s.px, true); s.ready = false; s.busy = false; s.job = null; }   // (WebGL reads its rows from the bottom)
  }
}
