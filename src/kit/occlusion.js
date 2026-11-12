// Occlusion culling for Next Gen views (hd3d.js): things fully hidden behind other things are skipped before
// the frame is drawn, on WebGL and WebGPU alike. One of two things fills the small depth picture they are
// tested against:
//
// The last frame's own depth (automatic, HD.occludeDepth). The chip keeps, for each block of the frame it just
// drew, the FARTHEST depth in it and how near the nearest is, and hands that small picture back a frame or
// two later (the views do this: hd3d.js). It says what was nearer than what from where the camera was THEN.
//   - The camera has not moved from there (it may have turned or zoomed): nothing can come out from behind
//     anything, so every block still says the truth and is simply put where it shows now.
//   - The camera has moved: only what is known to be one surface all over a block is kept (its nearest and
//     farthest agree, or its neighbours account for both: a floor seen at a slant). Blocks that touch and
//     whose depths meet make up a sheet, each sheet is put where it shows from the new place, and a texel of
//     the new picture counts only when it lies wholly inside one: the edge of a sheet, as far out as its depths
//     leave it unsure, takes out every texel it crosses. So what has just come out from behind a post, or
//     in at the side of the screen, has nothing in it and hides nothing, however thin the strip.
//   - A thing that has moved, changed shape or gone since the picture was drawn takes its old place out of
//     it at once (moved()), so what was behind it is drawn the same frame, not when the next picture is back.
//   - Things that change shape with nothing to say so (leaves and grass in the wind, which sway in their
//     shader; `soft`, set by the view: how fast they may move, metres a second, and `softBoxes`: where they
//     are): every picture is taken as news; a block that looks into one of those boxes is taken to have
//     drawn back by a whole texel all round since it was drawn, and hides nothing at all when anything in
//     it is so near that it could have gone further than that. The rest of the picture is as sure as ever:
//     a wall beside a tree hides what it hid. (What shows between two leaves that part by less than a
//     texel is the one thing this takes on trust: something wholly behind thick leaves can be a frame late
//     in a gap that opens in them.)
// Nothing has to be listed, and whatever is solid hides things: a hill, a house, a wall.
//
// Boxes the game lists (v.occluders), where there is no depth picture (yet): the boxes nearest the camera
// are drawn into the picture on the CPU (128 pixels across, 1/w per pixel, nearest wins).
//
// Either way the picture is then shrunk into a pyramid where each level keeps the FARTHEST depth of the
// four below it, and a thing is hidden when something nearer than its nearest point is there over every
// texel its bounds touch. This is the software way big engines do it (Intel's Masked Occlusion Culling,
// Frostbite, Umbra; the depth read back and moved to the new camera is CryEngine's and Unreal's, here made
// safe against what the move uncovers): there's no maintained JavaScript library, and WebGPU's hardware
// occlusion queries answer a frame late (things pop in) and don't exist on WebGL, so the two paths would
// differ. Being on the CPU, it gives the same answer on both. Results are only ever conservative, down to
// what one pixel of the frame can tell: when unsure, the thing is drawn.
// Kit use only.
import { Box3, Matrix4, Vector3, Vector4, Frustum, Sphere, WebGPUCoordinateSystem } from 'three';

const M = new Matrix4(), IM = new Matrix4(), BX = new Box3(), FR = new Frustum(), V4 = new Vector4(), S = new Sphere(), C = new Vector3(), A = new Matrix4();
const NEAR_W = .05;   // boxes are cut off this close in front of the camera
// the last frame's depth: frames a move is remembered for a picture still on its way back from the chip (one
// that takes longer is thrown away), and frames a picture counts for when none follows it
const EV_KEEP = 24, OLD = 60;
const FAR_Q = 16777215;   // a texel with nothing in it (the sky): the farthest depth, as its three bytes
// FLAT: a block whose nearest depth is within this share of its farthest may be one surface all over (it
// counts while the camera's move would shift its nearest and farthest less than a pixel apart: two things
// that close could still part by no more); LINE, NEARER: leeway for a slanted surface's blocks lying on a
// line and for its nearest being where the slope puts it; SLACK: texels the edge of a sheet may be out by,
// on top of what its depths say and the half pixel of the frame a depth can be out by; STILL: the camera
// counts as standing where the picture was drawn while nothing in it would shift by more than this many texels
const FLAT = .08, LINE = .005, NEARER = .004, SLACK = .02, STILL = .02;
const BIG_BOX = 48;   // a moved thing's old place over more blocks than this is checked block by block against the box itself
const CORNERS = Array.from({ length: 8 }, () => new Vector4());
// the 12 triangles of a box, as corner numbers (corner bit 0: x, bit 1: y, bit 2: z)
const TRIS = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];

/** The size of the depth picture for a view of this shape (width over height): about `texels` texels in all. */
export function pictureSize(aspect, texels = 2400) {
  const w = Math.max(16, Math.min(160, Math.round(Math.sqrt(texels * aspect))));
  return [w, Math.max(16, Math.min(160, Math.round(w / aspect)))];
}

/** A box from { x0, x1, y0, y1, z0, z1 } (city.occluders()), a Box3, or a mesh (its world box: only for solid, box-like meshes). */
export function toBox(o) {
  if (o?.isBox3) return o.clone();
  if (o?.isObject3D) { o.updateWorldMatrix(true, false); return new Box3().setFromObject(o); }
  return new Box3(new Vector3(o.x0, o.y0, o.z0), new Vector3(o.x1, o.y1, o.z1));
}

// Takes a thing's old place (a box in the world) out of a depth picture: the blocks over it that could have
// had any of it in them (the box's own reach from that frame's camera lies between their nearest and
// farthest). Ones wholly nearer are something in front of it, and stay; ones wholly farther are what
// showed past it. A box that covers many blocks (a whole set of copies, a lake) is also asked block by
// block whether what the block shows, from its nearest to its farthest along the line of sight, passes
// through the box at all: a wall standing in a wide, low box of traffic keeps what is above the cars.
// Returns how many went. With `mark` (a byte for each block) nothing is taken out: the blocks that look
// into the box are marked instead, each asked block by block (where leaves and grass sway).
function clearPlace(S, ev, o, mark = null) {
  const e = S.vpe; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wn = Infinity, wf = -Infinity, cut = false;
  for (let i = 0; i < 8; i++) {
    const x = ev[o + (i & 1 ? 3 : 0)], y = ev[o + (i & 2 ? 4 : 1)], z = ev[o + (i & 4 ? 5 : 2)], cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (cw < wn) wn = cw; if (cw > wf) wf = cw;
    if (cw < NEAR_W) { cut = true; continue; }
    const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * .5 + .5) * S.w, sy = (.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * .5) * S.h;
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  }
  if (wf < NEAR_W) return 0;   // behind that frame's camera
  if (cut) { x0 = y0 = 0; x1 = S.w; y1 = S.h; }   // (it reaches behind the camera: anywhere in the picture)
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1); x1 = Math.min(S.w - 1, Math.ceil(x1)); y1 = Math.min(S.h - 1, Math.ceil(y1));
  const lo = wn - .02 - Math.abs(wn) * .02, hi = wf + .02 + wf * .02, d = S.d, nr = S.nr, z2 = S.z; let n = 0;
  const big = !!mark || (x1 - x0 + 1) * (y1 - y0 + 1) > BIG_BOX, iv = big ? S.inv.elements : null, pad = big ? Math.hypot(1 / (S.fx * S.w), 1 / (S.fy * S.h)) * 1.05 : 0;
  const bx0 = ev[o], by0 = ev[o + 1], bz0 = ev[o + 2], bx1 = ev[o + 3], by1 = ev[o + 4], bz1 = ev[o + 5];
  for (let j = y0; j <= y1; j++) for (let i = x0, k = j * S.w + x0; i <= x1; i++, k++) {
    const v = d[k]; if (!(v >= lo && nr[k] <= hi)) continue;
    if (big) {
      // the middle of the block at its farthest and at its nearest, in the world, and how far the block reaches round that line
      const x = (i + .5) / S.w * 2 - 1, y = 1 - (j + .5) / S.h * 2, zf = z2[k], zn = nr[k] > 0 ? S.p14 / nr[k] - S.p10 : zf, r = v * pad + .02;
      const gx = iv[0] * x + iv[4] * y + iv[12], gy = iv[1] * x + iv[5] * y + iv[13], gz = iv[2] * x + iv[6] * y + iv[14], gw = iv[3] * x + iv[7] * y + iv[15];
      const fw = gw + iv[11] * zf, nw = gw + iv[11] * zn;
      if (fw === fw && nw === nw && fw !== 0 && nw !== 0) {
        const ax = (gx + iv[8] * zn) / nw, ay = (gy + iv[9] * zn) / nw, az = (gz + iv[10] * zn) / nw, cx = (gx + iv[8] * zf) / fw - ax, cy = (gy + iv[9] * zf) / fw - ay, cz = (gz + iv[10] * zf) / fw - az;
        // where along that line it is inside the box (made bigger by the block's reach), side by side
        let t0 = 0, t1 = 1;
        if (Math.abs(cx) < 1e-9) { if (ax < bx0 - r || ax > bx1 + r) continue; } else { const a = (bx0 - r - ax) / cx, b = (bx1 + r - ax) / cx; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
        if (Math.abs(cy) < 1e-9) { if (ay < by0 - r || ay > by1 + r) continue; } else { const a = (by0 - r - ay) / cy, b = (by1 + r - ay) / cy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
        if (Math.abs(cz) < 1e-9) { if (az < bz0 - r || az > bz1 + r) continue; } else { const a = (bz0 - r - az) / cz, b = (bz1 + r - az) / cz; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
        if (t0 > t1) continue;
      }
    }
    if (mark) { mark[k] = 1; n++; continue; }
    d[k] = 0; nr[k] = 0; z2[k] = NaN; n++;
  }
  if (n && !mark) { S.prep = false; S.holes = true; }   // (holes: something has been taken out of it, so the next picture has news even from the same camera)
  return n;
}

// What a depth picture's blocks are (once a picture, and again when a moved thing is taken out): which
// have anything in them (fill) and which are one surface all over (solid: 2 when the blocks round it show
// it to be, 1 when it is only flat enough to be taken for one).
function prepare(S) {
  const w = S.w, h = S.h, d = S.d, nr = S.nr, solid = S.solid, fill = S.fill;
  // how much nearer a slanted surface's nearest is than its farthest, as a share of the step from the block on one side to the block
  // on the other: half, were a block exactly its own pixels; it is up to a pixel more than that across (the frame's pixels do not
  // divide evenly into blocks), and `pad` more at either end
  const sl = .5 * (1 + (1 + 2 * (S.pad || 0)) / S.bp), px = .5 / S.bp;
  let near = Infinity;
  for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k++) {
    solid[k] = 0; fill[k] = 0;
    const D = d[k]; if (D === 0) continue;
    const N = nr[k]; fill[k] = 1; if (N < near) near = N;
    if (N >= D * (1 - FLAT)) solid[k] = 1;
    if (i === 0 || j === 0 || i === w - 1 || j === h - 1 || !(N > 0)) continue;
    // A surface, facing or seen at a slant. One over the depth goes evenly across a flat surface, so the
    // blocks either side of this one, above and below it and at its corners must lie on a line with it,
    // pair by pair; and its own nearest must be no nearer than that slope puts its near corner (or it is
    // something else, in front).
    const q = 1 / D, t = LINE * q, l = d[k - 1], r = d[k + 1], u = d[k - w], b = d[k + w], lu = d[k - w - 1], rb = d[k + w + 1], ru = d[k - w + 1], lb = d[k + w - 1];
    if (l === 0 || r === 0 || u === 0 || b === 0 || lu === 0 || rb === 0 || ru === 0 || lb === 0) continue;
    // (the frame's pixels do not divide evenly into blocks: a block may begin a pixel sooner or later than its place, so
    // each pair may be out of line by what the surface climbs in a pixel that way)
    const ql = 1 / l, qr = 1 / r, qu = 1 / u, qb = 1 / b, jx = Math.abs(qr - ql) * px, jy = Math.abs(qb - qu) * px;
    if (Math.abs(ql + qr - 2 * q) > t + jx || Math.abs(qu + qb - 2 * q) > t + jy || Math.abs(1 / lu + 1 / rb - 2 * q) > t + jx + jy || Math.abs(1 / ru + 1 / lb - 2 * q) > t + jx + jy) continue;
    if (1 / N <= q + (Math.abs(qr - ql) + Math.abs(qb - qu)) * sl + NEARER * q) solid[k] = 2;
  }
  S.near = near; S.prep = true; S.sheets = false;
}

// The sheets a depth picture's solid blocks make up (needed once the camera has moved from where it was
// drawn). Two blocks side by side are joined when their depths meet (link: 1 with the block to the right,
// 2 with the one below): a surface that runs on from one into the other is as deep where it leaves the
// one as where it enters the other, give or take a pixel's worth of its slope. Joined blocks are one sheet
// (lab: its number). And for every corner between blocks, when the solid blocks round it are of one sheet
// (cu: its number; -1: none; -2: more than one, worked out block by block): how far and how near the
// sheet can be there, as the depths the frame stored (czh, czl). It is no farther than the farthest of
// any of those blocks and no nearer than the nearest of any; for a flat surface at any slant the two agree.
function sheets(S) {
  const w = S.w, h = S.h, n = w * h, d = S.d, nr = S.nr, solid = S.solid, lab = S.lab, par = S.par, link = S.link, cu = S.cu, czh = S.czh, czl = S.czl, cdh = S.cdh, p10 = S.p10, p14 = S.p14;
  const G = 1.5 / Math.max(1, S.bp - 1), Q = 1.003;
  let next = 0;
  for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k++) {
    link[k] = 0;
    if (!solid[k]) { lab[k] = -1; continue; }
    const D = d[k], N = nr[k], R = D - N;
    let a = -1, b = -1;
    if (i > 0 && solid[k - 1]) { const m = k - 1, pad = (R + d[m] - nr[m]) * G; if (D * Q + pad >= nr[m] && d[m] * Q + pad >= N) { a = lab[m]; link[m] |= 1; } }
    if (j > 0 && solid[k - w]) { const m = k - w, pad = (R + d[m] - nr[m]) * G; if (D * Q + pad >= nr[m] && d[m] * Q + pad >= N) { b = lab[m]; link[m] |= 2; } }
    if (a < 0 && b < 0) { par[next] = next; lab[k] = next++; continue; }
    if (a >= 0 && b >= 0 && a !== b) {   // two sheets found to be one: the later number points at the earlier
      while (par[a] !== a) a = par[a]; while (par[b] !== b) b = par[b];
      if (a < b) par[b] = a; else { par[a] = b; a = b; }
    }
    lab[k] = a >= 0 ? a : b;
  }
  for (let t = 0; t < next; t++) par[t] = par[par[t]];
  for (let k = 0; k < n; k++) if (lab[k] >= 0) lab[k] = par[lab[k]];
  for (let cj = 0, c = 0; cj <= h; cj++) for (let ci = 0; ci <= w; ci++, c++) {
    let L = -1, lo = 0, hi = Infinity;
    // the four blocks round the corner (fewer at the picture's edge)
    const m0 = (cj - 1) * w + ci - 1, up = cj > 0, dn = cj < h, lf = ci > 0, rt = ci < w;
    if (up && lf && solid[m0]) { L = lab[m0]; lo = nr[m0]; hi = d[m0]; }
    if (up && rt && solid[m0 + 1]) { const m = m0 + 1; if (L === -1) L = lab[m]; else if (lab[m] !== L) L = -2; if (nr[m] > lo) lo = nr[m]; if (d[m] < hi) hi = d[m]; }
    if (dn && lf && solid[m0 + w]) { const m = m0 + w; if (L === -1) L = lab[m]; else if (lab[m] !== L) L = -2; if (nr[m] > lo) lo = nr[m]; if (d[m] < hi) hi = d[m]; }
    if (dn && rt && solid[m0 + w + 1]) { const m = m0 + w + 1; if (L === -1) L = lab[m]; else if (lab[m] !== L) L = -2; if (nr[m] > lo) lo = nr[m]; if (d[m] < hi) hi = d[m]; }
    cu[c] = L; if (L < 0) continue;
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    cdh[c] = hi; czh[c] = p14 / hi - p10; czl[c] = lo > hi * .9995 || !(lo > 0) ? czh[c] : p14 / lo - p10;
  }
  S.sheets = true;
}

export class Occlusion {
  /** w: depth picture width in pixels (height follows the view's shape); max: most boxes drawn per frame (nearest first). */
  constructor({ w = 128, max = 300, bias = .01 } = {}) {
    this.w = w; this.max = max; this.bias = bias; this.boxes = []; this.levels = [];
    this.ready = false; this.stats = { boxes: 0, tested: 0, hidden: 0, ms: 0, depth: false, age: 0, still: false };
    this.vp = new Matrix4(); this.e = this.vp.elements; this.fx = 1; this.fy = 1;
    // the last frame's depth: f counts frame() calls; src is the newest picture back from the chip; ev the
    // moves since (frame and the box's two corners each); stamp goes up whenever what hidden() would answer may have changed;
    // margin: texels a thing's bounds are widened by (boxes are drawn through texel centres; a depth picture's texels are sure all over)
    this.f = 0; this.src = null; this.ev = []; this.stamp = 0; this.who = null; this.last = new Float64Array(17).fill(NaN); this.dirty = true; this.margin = 1;
    // soft: set by the view each frame when something in view changes shape with nothing to say so (wind in its
    // shader): how fast it may move, metres a second (true: 1). softBoxes: where those things are, softN boxes
    // of six numbers each (least x, y, z, then greatest), or null for anywhere. softReach: tests, how far they
    // have gone, in metres
    this.soft = false; this.softReach = null; this.softBoxes = null; this.softN = 0;
  }
  set(list) { this.boxes = (list || []).map(toBox); this.ready = false; this.dirty = true; return this; }
  /**
   * The picture for this frame, as seen by camera (aspect = view width / height): the last frame's depth
   * moved to where the camera is now, when there is one, and the listed boxes when there is not. Call once
   * per frame before hidden(), after this frame's moved() calls.
   */
  frame(camera, aspect) {
    const t0 = performance.now(), f = ++this.f;
    let S = this.src; if (S && f - S.f > OLD) S = this.src = null;
    const w = S ? S.w : this.w, h = S ? S.h : Math.max(8, Math.min(256, Math.round(w / aspect)));
    let L0 = this.levels[0], fresh = false;
    if (!L0 || L0.w !== w || L0.h !== h) { this.levels = []; for (let lw = w, lh = h; ; lw = Math.ceil(lw / 2), lh = Math.ceil(lh / 2)) { this.levels.push({ w: lw, h: lh, d: new Float32Array(lw * lh) }); if (lw <= 4 && lh <= 4) break; } L0 = this.levels[0]; fresh = true; }
    camera.updateMatrixWorld(); M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const pe = camera.projectionMatrix.elements; this.fx = Math.abs(pe[0]); this.fy = Math.abs(pe[5]);
    // this frame's moves take their old places out of the depth picture
    let cleared = 0;
    const ev = this.ev;
    if (ev.length) {
      let keep = 0; while (keep < ev.length && ev[keep] < f - EV_KEEP) keep += 7;
      if (keep) ev.splice(0, keep);
      if (S) for (let i = ev.length - 7; i >= 0 && ev[i] === f; i -= 7) cleared += clearPlace(S, ev, i + 1);
    }
    // The same camera, the same picture's camera and nothing moved: the answers stand as they are (a new
    // picture drawn from the same place says the same, give or take things that have come since, and
    // those only hide more).
    // (not while something sways by itself: the older the picture, the less of it counts)
    const K = this.last, me = M.elements; let same = !fresh && !this.dirty && !cleared && !(this.soft && S) && K[16] === (S ? S.id : 0);
    for (let i = 0; i < 16 && same; i++) if (K[i] !== me[i]) same = false;
    this.stats.tested = this.stats.hidden = 0; this.stats.depth = !!S; this.stats.age = S ? f - S.f : 0;
    if (same) { this.stats.ms = performance.now() - t0; return this; }
    for (let i = 0; i < 16; i++) K[i] = me[i]; K[16] = S ? S.id : 0; this.dirty = false; this.stamp++;
    this.vp.copy(M);
    let n = 0;
    if (S) {
      this.margin = 0;
      if (this.soft) {   // the blocks that look into where leaves and grass sway
        const sf = S.sf && S.sf.length === S.w * S.h ? S.sf : (S.sf = new Uint8Array(S.w * S.h)), sb = this.softBoxes;
        if (!sb) sf.fill(1); else { sf.fill(0); for (let i = 0; i < this.softN; i++) clearPlace(S, sb, i * 6, sf); }
      }
      this.reproject(S, L0, camera.getWorldPosition(C));
    }
    else {
      this.margin = 1; L0.d.fill(0); FR.setFromProjectionMatrix(M, camera.coordinateSystem);
      const cp = camera.getWorldPosition(C), near = [];
      for (const b of this.boxes) if (FR.intersectsBox(b) && !b.containsPoint(cp)) near.push([b.distanceToPoint(cp), b]);   // (a box the camera is in hides nothing)
      near.sort((a, b) => a[0] - b[0]);
      n = Math.min(near.length, this.max);
      for (let i = 0; i < n; i++) this.drawBox(near[i][1], L0);
    }
    // the pyramid: each texel keeps the farthest (smallest 1/w) of the four below it
    for (let l = 1; l < this.levels.length; l++) {
      const A = this.levels[l - 1], B = this.levels[l];
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
        const x0 = x * 2, y0 = y * 2, x1 = Math.min(x0 + 1, A.w - 1), y1 = Math.min(y0 + 1, A.h - 1);
        B.d[y * B.w + x] = Math.min(A.d[y0 * A.w + x0], A.d[y0 * A.w + x1], A.d[y1 * A.w + x0], A.d[y1 * A.w + x1]);
      }
    }
    this.ready = true; this.stats.boxes = n; this.stats.ms = performance.now() - t0;
    return this;
  }
  /**
   * Tags the frame just set up (frame()) for the depth the view is about to draw (W x H pixels): keep it
   * with the read-back and hand both to depth(). gl: WebGL's depth (-1..1 before it is stored), not WebGPU's (0..1).
   */
  shot(camera, W = 0, H = 0) {
    const pe = camera.projectionMatrix.elements, p = camera.getWorldPosition(C);
    return { f: this.f, t: performance.now(), vp: this.vp.clone(), inv: this.vp.clone().invert(), ip: camera.projectionMatrixInverse.clone(), gl: camera.coordinateSystem !== WebGPUCoordinateSystem, persp: pe[15] === 0, p10: pe[10], p14: pe[14], x: p.x, y: p.y, z: p.z, W, H };
  }
  /**
   * A frame's depth, back from the chip: px holds w x h texels of four bytes. The first three are the
   * FARTHEST depth of the texel's block of the frame (0..1 as the depth buffer stores it, most significant
   * byte first, rounded up; all 255: nothing there). The fourth is how much nearer the block's nearest is:
   * 255 times the square root of the share of the farthest's distance it is short by, rounded up (0: the
   * block is all at one depth; the root keeps the small differences that matter). Top row first (flip:
   * bottom row first, as WebGL reads). tag: what shot() gave for that frame (tag.pad: pixels each block
   * was widened by all round when it was boiled down, 0 or 1).
   */
  depth(px, w, h, tag, flip = false) {
    if (!tag || !tag.persp || this.f - tag.f > EV_KEEP || (this.src && tag.f <= this.src.f)) return this;   // too old: the moves since are no longer kept
    const old = this.src, n = w * h, holed = !!old?.holes;
    const nc = (w + 1) * (h + 1), S = old && old.z.length === n ? old : { z: new Float32Array(n), d: new Float32Array(n), nr: new Float32Array(n), fill: new Uint8Array(n), solid: new Uint8Array(n), lab: new Int32Array(n), par: new Int32Array(n), link: new Uint8Array(n), cu: new Int32Array(nc), czh: new Float32Array(nc), czl: new Float32Array(nc), cdh: new Float32Array(nc) };
    // a picture drawn from where the last one was says the same thing: it keeps the last one's number, so a still camera's answers
    // stand. Not when a moved thing was taken out of the last one (this one may show what is there now), nor while something in
    // view changes shape by itself (soft: leaves in the wind), which only a picture can tell
    let sameCam = !!old && old.w === w && old.h === h; if (sameCam) { const a = old.vpe, b = tag.vp.elements; for (let i = 0; i < 16; i++) if (a[i] !== b[i]) { sameCam = false; break; } }
    S.w = w; S.h = h; S.f = tag.f; S.vp = tag.vp; S.inv = tag.inv; S.fx = Math.abs(tag.ip.elements[0]) ? 1 / Math.abs(tag.ip.elements[0]) : 1; S.fy = Math.abs(tag.ip.elements[5]) ? 1 / Math.abs(tag.ip.elements[5]) : 1;
    S.vpe = Float64Array.from(tag.vp.elements); S.id = sameCam && !holed && !this.soft ? old.id : (this.ids = (this.ids || 0) + 1);
    S.p10 = tag.p10; S.p14 = tag.p14; S.x = tag.x; S.y = tag.y; S.z0 = tag.z; S.prep = false; S.holes = false; S.t = tag.t ?? performance.now(); S.pad = tag.pad || 0;
    S.bp = tag.W > 0 && tag.H > 0 ? Math.max(1, Math.min(tag.W / w, tag.H / h)) : 8;   // the frame's pixels to a block
    const ip = tag.ip.elements, z = S.z, d = S.d, nr = S.nr, gl = tag.gl;
    for (let j = 0, k = 0; j < h; j++) {
      const y = 1 - (j + .5) / h * 2, row = (flip ? h - 1 - j : j) * w * 4;
      for (let i = 0; i < w; i++, k++) {
        const o = row + i * 4, q = px[o] * 65536 + px[o + 1] * 256 + px[o + 2];
        if (q >= FAR_Q) { z[k] = NaN; d[k] = 0; nr[k] = 0; continue; }
        const x = (i + .5) / w * 2 - 1, zn = gl ? q / FAR_Q * 2 - 1 : q / FAR_Q;
        z[k] = zn; d[k] = -(ip[2] * x + ip[6] * y + ip[10] * zn + ip[14]) / (ip[3] * x + ip[7] * y + ip[11] * zn + ip[15]);   // how far in front of that frame's camera
        const u = px[o + 3] / 255; nr[k] = d[k] * (1 - u * u);
      }
    }
    this.src = S;
    // what has moved since that frame was drawn is no longer where the picture has it
    const ev = this.ev; let cleared = 0;
    for (let i = 0; i < ev.length; i += 7) if (ev[i] > tag.f) cleared += clearPlace(S, ev, i + 1);
    if (cleared && sameCam) this.dirty = true;
    return this;
  }
  /**
   * A thing that has moved, changed shape or gone since the last frame() (the box it was in then, in the
   * world: its two opposite corners): it is no longer where the depth picture has it, so what the picture
   * shows of it stops hiding things from the next frame() on. Call between frames, before frame().
   */
  moved(x0, y0, z0, x1, y1, z1) { this.ev.push(this.f + 1, x0, y0, z0, x1, y1, z1); return this; }
  /** Drops the depth picture and the moves kept for it (the view has stopped taking pictures: asleep, or drawing some other way). */
  forget() { this.src = null; this.ev.length = 0; this.dirty = true; return this; }
  // The depth picture, put where it shows from this frame's camera (at cp). Each block that counts is a
  // four-cornered patch; its corners are moved, the texels whose middles it lands on are its sheet's, and
  // every texel it touches at all is no nearer than its farthest. Then every edge a sheet ends at (the
  // block beyond is not of it) takes out the texels it crosses that are that sheet's: what is left lies
  // wholly inside a sheet, and holds the farthest of all that shows in it.
  reproject(S, L, cp) {
    const w = L.w, h = L.h, n = w * h, w1 = w + 1, nc = w1 * (h + 1), z = S.z, dist = S.d, nr = S.nr, out = L.d;
    if (!S.prep) prepare(S);
    if (!this.who || this.who.length !== n) { this.who = new Int32Array(n); this.cv = new Float32Array(n); this.ok = new Uint8Array(n); this.cx = new Float32Array(nc); this.cy = new Float32Array(nc); this.lx = new Float32Array(nc); this.ly = new Float32Array(nc); }
    const who = this.who, cv = this.cv, ok = this.ok, CX = this.cx, CY = this.cy, LX = this.lx, LY = this.ly;
    // The very camera the picture was drawn with (it stands still, and things in front of it move): every block is
    // its own texel, as far as its farthest
    let very = true; { const p = S.vpe, q = this.e; for (let i = 0; i < 16; i++) if (p[i] !== q[i]) { very = false; break; } }
    // Something in view sways by itself (soft): a block that looks into where it is (sf) does not count with
    // anything nearer than this in it. That near, what swayed could have gone more than the one texel the
    // picture is drawn back by there.
    const sf = this.soft ? S.sf : null;
    const sn = this.soft ? (this.softReach ?? (this.soft === true ? 1 : +this.soft || 1) * Math.max(0, performance.now() - S.t) / 1000) * .5 * Math.max(w * this.fx, h * this.fy) : 0;
    if (very) {
      const fill = S.fill; this.stats.still = true;
      for (let k = 0; k < n; k++) out[k] = fill[k] && !(sf && sf[k] && nr[k] < sn) ? 1 / dist[k] : 0;
      if (sf) this.erode(out, w, h, sf);
      return;
    }
    out.fill(0); who.fill(-1);
    const so = sf ? (this.so && this.so.length === n ? this.so.fill(0) : (this.so = new Uint8Array(n))) : null;   // the texels a swaying block lands on
    // has the camera moved from where the picture was drawn, as far as anything in it can tell?
    const moved = Math.hypot(cp.x - S.x, cp.y - S.y, cp.z - S.z0), still = moved === 0 || moved * .5 * Math.max(w * this.fx, h * this.fy) <= STILL * S.near;
    this.stats.still = still;
    if (!still && !S.sheets) sheets(S);
    const sol = still ? S.fill : S.solid, lab = S.lab, cu = S.cu, czh = S.czh, czl = S.czl, cdh = S.cdh;
    const a = this.am = A.multiplyMatrices(this.vp, S.inv).elements;
    const a0 = a[0], a1 = a[1], a3 = a[3], a4 = a[4], a5 = a[5], a7 = a[7], a8 = a[8], a9 = a[9], a11 = a[11], a12 = a[12], a13 = a[13], a15 = a[15];
    const hw = w * .5, hh = h * .5, E = 1e-6, dmax = 1 / S.bp, par = moved * .5 * Math.max(w * this.fx, h * this.fy);   // (a pixel in texels; the most the move shifts a thing one metre off, in texels)
    // where each corner between blocks lands (a point as that frame's picture has it, x, y, depth and 1, comes out scaled by one over how far it was then)
    for (let cj = 0, c = 0; cj <= h; cj++) {
      const y = 1 - cj / h * 2, bx = a4 * y + a12, by = a5 * y + a13, bw = a7 * y + a15;
      for (let ci = 0; ci <= w; ci++, c++) {
        const x = ci / w * 2 - 1; let zn, dh;
        if (still) {   // (it lands in the same place whatever its depth: that of any block round it that has one)
          const bi = ci < w ? ci : w - 1, bj = cj < h ? cj : h - 1; let m = bj * w + bi;
          if (dist[m] === 0) { m = ci > 0 ? m - (ci < w ? 1 : 0) : m; if (dist[m] === 0 || ci === 0) { const m2 = cj > 0 && cj < h ? bj * w + bi - w : -1, m3 = m2 >= 0 && ci > 0 && ci < w ? m2 - 1 : -1; m = m2 >= 0 && dist[m2] !== 0 ? m2 : m3 >= 0 && dist[m3] !== 0 ? m3 : m; } }
          if (dist[m] === 0) { CX[c] = NaN; continue; }
          zn = z[m]; dh = nr[m] > 0 ? nr[m] : NEAR_W;
        } else { if (cu[c] < 0) { CX[c] = NaN; continue; } zn = czh[c]; dh = cdh[c]; }
        const cc = a3 * x + a11 * zn + bw;
        if (!(cc * dh >= NEAR_W)) { CX[c] = NaN; continue; }   // behind this frame's camera, or right up against it
        const s = 1 / cc; CX[c] = (a0 * x + a8 * zn + bx) * s * hw + hw; CY[c] = hh - (a1 * x + a9 * zn + by) * s * hh;
        if (still || czl[c] === zn) { LX[c] = CX[c]; LY[c] = CY[c]; continue; }
        const zl = czl[c], cl = a3 * x + a11 * zl + bw;
        if (!(cl > 1e-9)) { LX[c] = NaN; continue; }
        const sl = 1 / cl; LX[c] = (a0 * x + a8 * zl + bx) * sl * hw + hw; LY[c] = hh - (a1 * x + a9 * zl + by) * sl * hh;
      }
    }
    const T = this.t || (this.t = new Float64Array(4));
    for (let j = 0, k = 0; j < h; j++) {
      const ya = 1 - j / h * 2, yb = 1 - (j + 1) / h * 2, cy7 = a7 > 0 ? a7 * ya : a7 * yb;
      for (let i = 0; i < w; i++, k++) {
        const sk = sf !== null && sf[k] === 1;
        ok[k] = 0; if (!sol[k] || (sk && nr[k] < sn)) continue;
        if (!still && sol[k] === 1) {   // (only flat: its nearest and farthest may be two things, which the move may part by no more than a pixel)
          const N = nr[k], D = dist[k];
          if ((D - N) * par > N * D * dmax) {   // (they could, going by how far the camera went; now by where each lands)
            const x = (i + .5) / w * 2 - 1, y = 1 - (j + .5) / h * 2, zf = z[k], zn = S.p14 / N - S.p10, gx = a0 * x + a4 * y + a12, gy = a1 * x + a5 * y + a13, gw = a3 * x + a7 * y + a15;
            const wf = gw + a11 * zf, wn = gw + a11 * zn; if (!(wn > 1e-9 && wf > 1e-9)) continue;
            const ex = ((gx + a8 * zf) / wf - (gx + a8 * zn) / wn) * hw, ey = ((gy + a9 * zf) / wf - (gy + a9 * zn) / wn) * hh;
            if (ex * ex + ey * ey > dmax * dmax) continue;
          }
        }
        const c0 = j * w1 + i, c1 = c0 + 1, c3 = c0 + w1, c2 = c3 + 1;   // (round the block: its corners 0, 1, 2, 3 are up left, up right, down right, down left)
        let x0 = CX[c0], y0 = CY[c0], x1 = CX[c1], y1 = CY[c1], x2 = CX[c2], y2 = CY[c2], x3 = CX[c3], y3 = CY[c3];
        if (!still) {   // (a corner where two sheets meet: this block's own sheet's)
          if (cu[c0] === -2) { this.own(S, k, i, j); x0 = T[0]; y0 = T[1]; }
          if (cu[c1] === -2) { this.own(S, k, i + 1, j); x1 = T[0]; y1 = T[1]; }
          if (cu[c2] === -2) { this.own(S, k, i + 1, j + 1); x2 = T[0]; y2 = T[1]; }
          if (cu[c3] === -2) { this.own(S, k, i, j + 1); x3 = T[0]; y3 = T[1]; }
        }
        // (seen from behind, or edge on, or with a corner that could not be placed, it is not counted)
        if (!((x0 * y1 - x1 * y0) + (x1 * y2 - x2 * y1) + (x2 * y3 - x3 * y2) + (x3 * y0 - x0 * y3) > 1e-7)) continue;
        ok[k] = 1;
        let lx = x0 < x1 ? x0 : x1, hx = x0 < x1 ? x1 : x0, ly = y0 < y1 ? y0 : y1, hy = y0 < y1 ? y1 : y0;
        if (x2 < lx) lx = x2; else if (x2 > hx) hx = x2; if (x3 < lx) lx = x3; else if (x3 > hx) hx = x3;
        if (y2 < ly) ly = y2; else if (y2 > hy) hy = y2; if (y3 < ly) ly = y3; else if (y3 > hy) hy = y3;
        // every texel it touches is no nearer all over than this block's farthest; the texels whose middles it covers are its sheet's
        let tx0 = Math.floor(lx + 1e-4), tx1 = Math.ceil(hx - 1e-4) - 1, ty0 = Math.floor(ly + 1e-4), ty1 = Math.ceil(hy - 1e-4) - 1;
        if (tx0 < 0) tx0 = 0; if (tx1 > w - 1) tx1 = w - 1; if (ty0 < 0) ty0 = 0; if (ty1 > h - 1) ty1 = h - 1;
        if (tx0 > tx1 || ty0 > ty1) continue;
        // the farthest any of the block can be from this frame's camera
        const xa = i / w * 2 - 1, xb = (i + 1) / w * 2 - 1, cmax = a11 * z[k] + a15 + (a3 > 0 ? a3 * xb : a3 * xa) + cy7;
        const v = 1 / (cmax * dist[k]), me = still ? 0 : lab[k];
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0, t = ty * w + tx0; tx <= tx1; tx++, t++) {
          const was = out[t]; if (was === 0 || v < was) out[t] = v;
          if (sk) so[t] = 1;
          const px = tx + .5, py = ty + .5;
          if (px < lx || px > hx || py < ly || py > hy || (who[t] >= 0 && cv[t] <= v)) continue;
          if ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0) < -E || (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1) < -E || (x3 - x2) * (py - y2) - (y3 - y2) * (px - x2) < -E || (x0 - x3) * (py - y3) - (y0 - y3) * (px - x3) < -E) continue;
          cv[t] = v; who[t] = me;   // (two sheets over a texel's middle: the farther one's it is)
        }
      }
    }
    // the edges sheets end at, each as far out as its two ends can be
    // A depth is one pixel's middle: the surface may end up to half a pixel short of the block's edge. Seen
    // from the very same camera that is the next frame's pixel too, and an edge that lands on the line
    // between two texels leaves both whole.
    let same = still; if (same) { const p = S.vpe, q = this.e; for (let i = 0; i < 16; i++) if (p[i] !== q[i]) { same = false; break; } }
    const slack = same ? -1e-3 : .5 / S.bp + SLACK;
    const link = S.link;
    for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k++) {
      if (!ok[k]) continue;
      // (a side is an edge unless the block beyond it counts too and, once the camera has moved, is joined to this one)
      const me = still ? 0 : lab[k];
      if (i > 0 && j > 0 && i < w - 1 && j < h - 1 && ok[k - 1] && ok[k + 1] && ok[k - w] && ok[k + w] && (still || (link[k] === 3 && link[k - 1] & 1 && link[k - w] & 2))) continue;
      for (let s = 0; s < 4; s++) {
        // sides: up, right, down, left; the block beyond, and the side's two corners
        const m = s === 0 ? (j > 0 ? k - w : -1) : s === 1 ? (i < w - 1 ? k + 1 : -1) : s === 2 ? (j < h - 1 ? k + w : -1) : (i > 0 ? k - 1 : -1);
        if (m >= 0 && ok[m] && (still || (s === 0 ? link[m] & 2 : s === 1 ? link[k] & 1 : s === 2 ? link[k] & 2 : link[m] & 1))) continue;
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
        for (let e = 0; e < 2; e++) {
          const q = (s + e) & 3, ci = i + (q === 1 || q === 2 ? 1 : 0), cj = j + (q >> 1), c = cj * w1 + ci;
          let xh = CX[c], yh = CY[c], xl = LX[c], yl = LY[c];
          if (!still && cu[c] === -2) { this.own(S, k, ci, cj); xh = T[0]; yh = T[1]; xl = T[2]; yl = T[3]; }
          if (xl !== xl) { bx0 = by0 = -Infinity; bx1 = by1 = Infinity; break; }
          if (xh < bx0) bx0 = xh; if (xh > bx1) bx1 = xh; if (yh < by0) by0 = yh; if (yh > by1) by1 = yh;
          if (xl < bx0) bx0 = xl; if (xl > bx1) bx1 = xl; if (yl < by0) by0 = yl; if (yl > by1) by1 = yl;
        }
        const tx0 = Math.max(0, Math.floor(bx0 - slack)), tx1 = Math.min(w - 1, Math.ceil(bx1 + slack) - 1), ty0 = Math.max(0, Math.floor(by0 - slack)), ty1 = Math.min(h - 1, Math.ceil(by1 + slack) - 1);
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0, t = ty * w + tx0; tx <= tx1; tx++, t++) if (who[t] === me) who[t] = -1;
      }
    }
    for (let t = 0; t < n; t++) if (who[t] < 0) out[t] = 0;   // (no sheet over its middle, or a sheet's edge across it)
    if (so) this.erode(out, w, h, so);
  }
  // Something in view changes shape by itself (soft): each texel it shows in (fl) takes the farthest of
  // itself and the eight round it, so whatever hides things there may have drawn back by a whole texel
  // since the picture
  erode(out, w, h, fl) {
    const n = w * h, tmp = this.er && this.er.length === n ? this.er : (this.er = new Float32Array(n));
    tmp.set(out);
    for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k++) {
      if (!fl[k]) continue;
      let v = tmp[k]; if (v === 0) continue;
      const l = i > 0, r = i < w - 1;
      if (l && tmp[k - 1] < v) v = tmp[k - 1]; if (r && tmp[k + 1] < v) v = tmp[k + 1];
      if (j > 0) { const m = k - w; if (tmp[m] < v) v = tmp[m]; if (l && tmp[m - 1] < v) v = tmp[m - 1]; if (r && tmp[m + 1] < v) v = tmp[m + 1]; }
      if (j < h - 1) { const m = k + w; if (tmp[m] < v) v = tmp[m]; if (l && tmp[m - 1] < v) v = tmp[m - 1]; if (r && tmp[m + 1] < v) v = tmp[m + 1]; }
      out[k] = v;
    }
  }
  // Where the corner (ci, cj) of block k lands going by k's own sheet alone (a corner where two sheets
  // meet): into this.t, at its farthest (x, y) and at its nearest (x, y); NaN where it cannot be placed.
  own(S, k, ci, cj) {
    const w = S.w, h = S.h, d = S.d, nr = S.nr, solid = S.solid, lab = S.lab, L = lab[k], a = this.am, T = this.t;
    let lo = 0, hi = Infinity;
    for (let t = 0; t < 4; t++) {
      const bi = ci - 1 + (t & 1), bj = cj - 1 + (t >> 1); if (bi < 0 || bj < 0 || bi >= w || bj >= h) continue;
      const m = bj * w + bi; if (!solid[m] || lab[m] !== L) continue;
      if (nr[m] > lo) lo = nr[m]; if (d[m] < hi) hi = d[m];
    }
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    if (!(lo > 0) || lo > hi * .999) lo = hi;
    const x = ci / w * 2 - 1, y = 1 - cj / h * 2, hw = w * .5, hh = h * .5;
    for (let e = 0; e < 2; e++) {
      const dd = e ? lo : hi, zn = S.p14 / dd - S.p10, c = a[3] * x + a[7] * y + a[11] * zn + a[15];
      if (!(c * dd >= NEAR_W)) { T[e * 2] = T[e * 2 + 1] = NaN; continue; }
      T[e * 2] = (a[0] * x + a[4] * y + a[8] * zn + a[12]) / c * hw + hw; T[e * 2 + 1] = hh - (a[1] * x + a[5] * y + a[9] * zn + a[13]) / c * hh;
    }
  }
  drawBox(b, L) {
    const P = CORNERS;
    for (let i = 0; i < 8; i++) P[i].set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z, 1).applyMatrix4(this.vp);
    for (let t = 0; t < 36; t += 3) {
      // clip the triangle to the part in front of the camera (a wall you stand beside reaches behind you)
      let poly = [P[TRIS[t]], P[TRIS[t + 1]], P[TRIS[t + 2]]];
      if (poly.some(q => q.w < NEAR_W)) {
        const out = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], c = poly[(k + 1) % poly.length], ain = a.w >= NEAR_W, cin = c.w >= NEAR_W;
          if (ain) out.push(a);
          if (ain !== cin) { const f = (NEAR_W - a.w) / (c.w - a.w); out.push(new Vector4().lerpVectors(a, c, f)); }
        }
        if (out.length < 3) continue;
        poly = out;
      }
      const sp = poly.map(q => [(q.x / q.w * .5 + .5) * L.w, (.5 - q.y / q.w * .5) * L.h, 1 / q.w]);
      for (let k = 1; k + 1 < sp.length; k++) this.tri(sp[0], sp[k], sp[k + 1], L);
    }
  }
  tri(a, bb, c, L) {
    const w = L.w, h = L.h, d = L.d;
    const area = (bb[0] - a[0]) * (c[1] - a[1]) - (bb[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-6) return;
    const minX = Math.max(0, Math.floor(Math.min(a[0], bb[0], c[0]))), maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], bb[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], bb[1], c[1]))), maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], bb[1], c[1])));
    const ia = 1 / area;
    for (let y = minY; y <= maxY; y++) {
      const py = y + .5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + .5;
        const w0 = ((bb[0] - px) * (c[1] - py) - (bb[1] - py) * (c[0] - px)) * ia;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * ia;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * bb[2] + w2 * c[2], k = y * w + x;
        if (z > d[k]) d[k] = z;
      }
    }
  }
  /** True when a world sphere (centre, radius) is surely hidden in the last frame()'s picture. */
  hidden(center, radius) {
    BX.min.set(center.x - radius, center.y - radius, center.z - radius); BX.max.set(center.x + radius, center.y + radius, center.z + radius);
    return this.hiddenBox(BX);
  }
  // True when every texel of the picture in the rectangle (texels x0..x1, y0..y1) has something at least
  // `need` near (as 1/w) all over it. Exact, and quick: a wide rectangle is asked of the small levels of the
  // pyramid first, and only a block that fails and reaches outside the rectangle is opened up.
  covered(x0, y0, x1, y1, need) {
    const Ls = this.levels; let l = 0; while (l < Ls.length - 1 && Math.max(x1 - x0, y1 - y0) >> l > 2) l++;
    for (let y = y0 >> l, ye = y1 >> l; y <= ye; y++) for (let x = x0 >> l, xe = x1 >> l; x <= xe; x++) if (!this.cell(l, x, y, x0, y0, x1, y1, need)) return false;
    return true;
  }
  cell(l, x, y, x0, y0, x1, y1, need) {
    const L = this.levels[l]; if (L.d[y * L.w + x] >= need) return true;
    if (l === 0) return false;
    const L0 = this.levels[0], ax = x << l, ay = y << l;
    if (ax >= x0 && ay >= y0 && Math.min(ax + (1 << l), L0.w) - 1 <= x1 && Math.min(ay + (1 << l), L0.h) - 1 <= y1) return false;   // all of it is in the rectangle, and something in it is too far
    const B = this.levels[l - 1], s = l - 1;
    for (let cy = y * 2, ce = Math.min(cy + 1, B.h - 1); cy <= ce; cy++) {
      if (cy << s > y1 || ((cy + 1) << s) - 1 < y0) continue;
      for (let cx = x * 2, xe = Math.min(cx + 1, B.w - 1); cx <= xe; cx++) if (!(cx << s > x1 || ((cx + 1) << s) - 1 < x0) && !this.cell(s, cx, cy, x0, y0, x1, y1, need)) return false;
    }
    return true;
  }
  /** The same for a sphere given as numbers, quickly (cluster detail asks it for every part of a mesh): by the sphere itself, not its box. */
  hiddenSphere(x, y, z, r) {
    if (!this.ready) return false;
    this.stats.tested++;
    const e = this.e, L0 = this.levels[0], cw = e[3] * x + e[7] * y + e[11] * z + e[15], wn = cw - r;
    if (wn < 1e-2) return false;   // reaches behind the camera: drawn
    // its screen rectangle: no point of it is nearer than wn or more than r to the side of its middle
    const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw, ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw, k = r / wn, g = this.margin;
    const rx = k * (this.fx + Math.abs(nx)) * .5 * L0.w, ry = k * (this.fy + Math.abs(ny)) * .5 * L0.h, sx = (nx * .5 + .5) * L0.w, sy = (.5 - ny * .5) * L0.h;
    const x0 = Math.max(0, Math.floor(sx - rx) - g), y0 = Math.max(0, Math.floor(sy - ry) - g), x1 = Math.min(L0.w - 1, Math.ceil(sx + rx) - 1 + g), y1 = Math.min(L0.h - 1, Math.ceil(sy + ry) - 1 + g);
    if (x0 > x1 || y0 > y1) return false;   // off screen: the frustum test is someone else's job
    if (!this.covered(x0, y0, x1, y1, (1 / wn) * (1 + this.bias))) return false;
    this.stats.hidden++;
    return true;
  }
  /** True when a world box (Box3) is surely hidden in the last frame()'s picture. */
  hiddenBox(b) {
    if (!this.ready) return false;
    this.stats.tested++;
    const L0 = this.levels[0], vp = this.vp, g = this.margin;
    // its screen rectangle and nearest 1/w, from its eight corners
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wNear = Infinity;
    for (let i = 0; i < 8; i++) {
      V4.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z, 1).applyMatrix4(vp);
      if (V4.w < 1e-2) return false;   // reaches behind the camera: drawn
      const sx = (V4.x / V4.w * .5 + .5) * L0.w, sy = (.5 - V4.y / V4.w * .5) * L0.h;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy; if (V4.w < wNear) wNear = V4.w;
    }
    x0 = Math.max(0, Math.floor(x0) - g); y0 = Math.max(0, Math.floor(y0) - g); x1 = Math.min(L0.w - 1, Math.ceil(x1) - 1 + g); y1 = Math.min(L0.h - 1, Math.ceil(y1) - 1 + g);
    if (x0 > x1 || y0 > y1) return false;   // off screen: the frustum test is three's job
    if (!this.covered(x0, y0, x1, y1, (1 / wNear) * (1 + this.bias))) return false;   // (what's there must be at least this near)
    this.stats.hidden++;
    return true;
  }
  /** hiddenBox() for a box as six numbers in b from o on: its least x, y, z, then its greatest. */
  hiddenBounds(b, o = 0) {
    if (!this.ready) return false;
    this.stats.tested++;
    const L0 = this.levels[0], e = this.e, g = this.margin;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wNear = Infinity;
    for (let i = 0; i < 8; i++) {
      const x = b[o + (i & 1 ? 3 : 0)], y = b[o + (i & 2 ? 4 : 1)], z = b[o + (i & 4 ? 5 : 2)], cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (!(cw >= 1e-2)) return false;   // reaches behind the camera: drawn
      const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * .5 + .5) * L0.w, sy = (.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * .5) * L0.h;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy; if (cw < wNear) wNear = cw;
    }
    x0 = Math.max(0, Math.floor(x0) - g); y0 = Math.max(0, Math.floor(y0) - g); x1 = Math.min(L0.w - 1, Math.ceil(x1) - 1 + g); y1 = Math.min(L0.h - 1, Math.ceil(y1) - 1 + g);
    if (x0 > x1 || y0 > y1) return false;   // off screen: the frustum test is three's job
    if (!this.covered(x0, y0, x1, y1, (1 / wNear) * (1 + this.bias))) return false;
    this.stats.hidden++;
    return true;
  }
  /** moved() for a box as six numbers in b from o on. */
  movedBounds(b, o = 0) { this.ev.push(this.f + 1, b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5]); return this; }
  /** hidden() for a mesh, by its world bounding box (instanced and skinned meshes: their bounding sphere). */
  hiddenObject(o) {
    const g = o.geometry; if (!g) return false;
    if (o.isInstancedMesh || o.isSkinnedMesh) {   // (these keep their own bounds, round every instance or the posed body)
      if (o.boundingSphere === null) o.computeBoundingSphere();
      S.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); return this.hidden(S.center, S.radius);
    }
    if (!g.boundingBox) g.computeBoundingBox();
    return this.hiddenBox(BX.copy(g.boundingBox).applyMatrix4(o.matrixWorld));   // (a box fits wide, flat meshes far better than a sphere)
  }
  /** hidden() for instance i of an InstancedMesh2 (gs.props). */
  hiddenInstance(m, i) {
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    m.getMatrixAt(i, IM); S.copy(g.boundingSphere).applyMatrix4(IM).applyMatrix4(m.matrixWorld);
    return this.hidden(S.center, S.radius);
  }
}
