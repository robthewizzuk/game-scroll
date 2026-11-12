// Shadows in tiles: the book-keeping (hd3d.js shadowLights draws by it; no graphics here).
//
// A sun's shadow map is cut into 16 x 16 tiles, and the tiles are fixed to the world: sun().follow()
// and fit() move the sun a whole tile at a time, so as the camera walks the map's picture only slides
// across by whole tiles, and a row or column of new ones comes in at the edge. Each tile remembers
// what it was drawn from, as two numbers: the sum of a number for every still thing whose shadow can
// fall in it, and the same for the things that move (the numbers shadowLights makes: they change when
// a thing moves, turns, changes shape, comes or goes). A frame then does only what changed:
//   a tile whose still sum changed, or that has just come in: the still things in that part of the
//     map are drawn again and the part is copied to the kept copy of the map;
//   a tile whose moving sum changed: its part of the kept copy is put back, and the moving things
//     are drawn over the parts put back.
// So a walk through a still town draws no shadows at all between tile steps, a cart crossing the
// square redraws the few tiles it crosses, and a door that opens redraws its own tile, not the map.
// (Unreal's virtual shadow maps keep cached pages the same way; this is one fixed map, not a sparse
// virtual one, which is what three's own shadow lookups can read without a patched shader.)

/** Tiles along each side of a shadow map. */
export const TILES = 16;
const DRAWS = 4, COPIES = 24;   // the most parts drawn again, and put back, in one frame before they are joined up
const FULL = .6;                // this much of the map to draw again: the whole map is drawn instead

// A set of tiles (1 or 0 each, T x T) as a few rectangles [x, y, w, h] in tiles, into out; cap: with more than
// this many, one rectangle round them all. Returns the tiles covered. (mark: scratch of the same size)
export function tileRects(set, T, out, cap, mark) {
  out.length = 0; mark.fill(0);
  let x0 = T, y0 = T, x1 = -1, y1 = -1, n = 0;
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const k = j * T + i; if (!set[k] || mark[k]) continue;
    let w = 1; while (i + w < T && set[k + w] && !mark[k + w]) w++;
    let h = 1;
    grow: for (; j + h < T; h++) for (let a = 0; a < w; a++) { const q = (j + h) * T + i + a; if (!set[q] || mark[q]) break grow; }
    for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) mark[(j + b) * T + i + a] = 1;
    out.push([i, j, w, h]); n += w * h;
    if (i < x0) x0 = i; if (j < y0) y0 = j; if (i + w - 1 > x1) x1 = i + w - 1; if (j + h - 1 > y1) y1 = j + h - 1;
  }
  if (out.length > cap) { out.length = 0; out.push([x0, y0, x1 - x0 + 1, y1 - y0 + 1]); n = (x1 - x0 + 1) * (y1 - y0 + 1); }
  return n;
}

export class ShadowTiles {
  constructor(T = TILES) {
    const n = T * T; this.T = T;
    this.S = new Float64Array(n); this.M = new Float64Array(n);                        // this frame: the still and the moving sum of each tile
    this.cS = new Float64Array(n).fill(NaN); this.mM = new Float64Array(n).fill(NaN);   // what the kept copy's tile, and the map's, were drawn from
    this.redo = new Uint8Array(n); this.rest = new Uint8Array(n); this.mark = new Uint8Array(n); this.tmp = new Float64Array(n);
    this.key = new Float64Array(11).fill(NaN);   // the light the tiles belong to: its two sideways directions, tile size, depth range, map size
    this.gx0 = 0; this.gy0 = 0; this.ix = 0; this.iy = 0; this.oz = 0;   // where the tile lines were set, tiles moved since, the light's depth
    this.valid = false; this.pending = false; this.fresh = true; this.moved = null; this.movers = 0;
    this.ux = this.uy = this.uz = this.u0 = this.vx = this.vy = this.vz = this.v0 = this.ru = this.rv = this.pad = 0;
    /** What to do this frame (finish()): rectangles are [x, y, w, h] in tiles, x to the light's right and y up. */
    this.plan = { any: false, reset: true, shift: null, redo: [], back: [], movers: null, tiles: 0, put: 0 };
  }
  /**
   * The light as it is this frame. e: its shadow camera's world matrix (16 numbers); left..top, near, far:
   * the camera's box; N: the map's size in texels; deep: the kept copy can be moved in depth as well as
   * sideways. Says whether the tiles carry over from the last frame.
   */
  begin(e, left, right, bottom, top, near, far, N, deep) {
    const T = this.T, K = this.key, twx = (right - left) / T, twy = (top - bottom) / T;
    if (this.pending) { this.valid = false; this.pending = false; }   // (planned and never drawn: the map was drawn some other way)
    const ox = e[12] * e[0] + e[13] * e[1] + e[14] * e[2], oy = e[12] * e[4] + e[13] * e[5] + e[14] * e[6], oz = e[12] * e[8] + e[13] * e[9] + e[14] * e[10];
    const gx = (ox + left) / twx, gy = (oy + bottom) / twy;   // the map's low corner, in tiles
    let same = this.valid && N === K[10] && near === K[8] && far === K[9] && Math.abs(twx - K[6]) <= 1e-9 * twx && Math.abs(twy - K[7]) <= 1e-9 * twy;
    for (let i = 0; i < 6 && same; i++) if (Math.abs(K[i] - e[i < 3 ? i : i + 1]) > 1e-9) same = false;
    let dx = 0, dy = 0, dz = 0;
    if (same) {
      // moved by whole tiles since the lines were set? (anything else: a new set of tiles)
      const fx = gx - this.gx0, fy = gy - this.gy0, jx = Math.round(fx), jy = Math.round(fy);
      dx = jx - this.ix; dy = jy - this.iy; dz = oz - this.oz;
      if (Math.abs(dz) < 1e-7) dz = 0;
      if (Math.abs(fx - jx) > 1e-4 || Math.abs(fy - jy) > 1e-4 || Math.abs(dx) >= T || Math.abs(dy) >= T || (dz && !deep)) same = false;
      else { this.ix = jx; this.iy = jy; }
    }
    this.fresh = !same; this.moved = null; this.oz = oz;
    if (!same) {
      for (let i = 0; i < 6; i++) K[i] = e[i < 3 ? i : i + 1];
      K[6] = twx; K[7] = twy; K[8] = near; K[9] = far; K[10] = N;
      this.gx0 = gx; this.gy0 = gy; this.ix = 0; this.iy = 0;
      this.cS.fill(NaN); this.mM.fill(NaN);
    } else if (dx || dy || dz) {
      if (dx || dy) { this.slide(this.cS, dx, dy); this.slide(this.mM, dx, dy); }
      const px = N / T; this.moved = [dx * px, dy * px, dz / (far - near)];
    }
    // a point of the world, in tiles from the map's low corner
    this.ux = e[0] / twx; this.uy = e[1] / twx; this.uz = e[2] / twx; this.u0 = gx;
    this.vx = e[4] / twy; this.vy = e[5] / twy; this.vz = e[6] / twy; this.v0 = gy;
    this.ru = 1 / twx; this.rv = 1 / twy; this.pad = 1.5 * T / N;   // (a texel and a half round a thing's bounds: where its edge can still draw)
    this.S.fill(0); this.M.fill(0); this.movers = 0;
    return same;
  }
  // the tiles' numbers moved with the map: what was at tile (i + dx, j + dy) is now at (i, j), and what comes in has none
  slide(A, dx, dy) {
    const T = this.T, B = this.tmp; B.set(A);
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { const a = i + dx, b = j + dy; A[j * T + i] = a >= 0 && a < T && b >= 0 && b < T ? B[b * T + a] : NaN; }
  }
  /** A thing whose shadow this light draws: its number h, and a ball (x, y, z, rad) it is inside. */
  add(still, h, x, y, z, rad) {
    const T = this.T, u = x * this.ux + y * this.uy + z * this.uz - this.u0, v = x * this.vx + y * this.vy + z * this.vz - this.v0, ru = rad * this.ru + this.pad, rv = rad * this.rv + this.pad;
    let i0 = Math.floor(u - ru), i1 = Math.floor(u + ru), j0 = Math.floor(v - rv), j1 = Math.floor(v + rv);
    if (!still) this.movers++;
    if (i1 < 0 || j1 < 0 || i0 >= T || j0 >= T || !(i0 <= i1 && j0 <= j1)) return;
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0; if (i1 >= T) i1 = T - 1; if (j1 >= T) j1 = T - 1;
    const A = still ? this.S : this.M;
    for (let j = j0; j <= j1; j++) for (let k = j * T + i0, end = j * T + i1; k <= end; k++) A[k] += h;
  }
  /** A thing that could be anywhere in the map (copies, things placed on the chip). */
  addAll(still, h) { const A = still ? this.S : this.M; for (let k = 0; k < A.length; k++) A[k] += h; if (!still) this.movers++; }
  /**
   * The frame's plan, once every thing is in. fresh: draw the whole map again whatever the sums say
   * (the first time, a change the sums can't see). The plan's `any` says whether there is anything to do.
   */
  finish(fresh) {
    const { T, S, M, cS, mM, redo, rest, plan } = this, n = T * T, reset = fresh || this.fresh || !this.valid, moved = this.moved;
    plan.reset = reset; plan.shift = null; plan.redo.length = 0; plan.back.length = 0; plan.movers = null; plan.tiles = 0; plan.put = 0;
    if (reset) { plan.any = true; plan.tiles = n; this.pending = true; return plan; }
    let nr = 0, ns = 0;
    for (let k = 0; k < n; k++) { const a = !(cS[k] === S[k]), b = a || !(mM[k] === M[k]); redo[k] = a ? 1 : 0; rest[k] = b ? 1 : 0; if (a) nr++; if (b) ns++; }
    plan.any = !!moved || ns > 0;
    if (!plan.any) return plan;
    this.pending = true;
    if (nr > FULL * n) { plan.reset = true; plan.tiles = n; return plan; }
    plan.shift = moved;
    if (nr) {
      // the parts to draw again (joined up, they take in tiles that had not changed: those are put right as well)
      plan.tiles = tileRects(redo, T, plan.redo, DRAWS, this.mark);
      if (plan.tiles > FULL * n) { plan.reset = true; plan.shift = null; plan.redo.length = 0; plan.tiles = n; return plan; }
      for (const q of plan.redo) for (let j = q[1]; j < q[1] + q[3]; j++) for (let i = q[0]; i < q[0] + q[2]; i++) { const k = j * T + i; if (!redo[k]) { redo[k] = 1; } rest[k] = 1; }
    }
    // the parts of the kept copy to put back before the moving things are drawn (a map that slid was put back whole)
    if (moved) { if (this.movers) plan.movers = [0, 0, T, T]; return plan; }
    let x0 = T, y0 = T, x1 = -1, y1 = -1;
    for (let k = 0; k < n; k++) {
      if (!rest[k]) continue;
      const i = k % T, j = (k - i) / T; if (i < x0) x0 = i; if (j < y0) y0 = j; if (i > x1) x1 = i; if (j > y1) y1 = j;
      if (redo[k]) rest[k] = 0;   // (drawn again: the map has it already)
    }
    plan.put = tileRects(rest, T, plan.back, COPIES, this.mark);
    if (this.movers && x1 >= 0) plan.movers = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
    return plan;
  }
  /** For tests (HD.shadowCheck): the kept copy put back whole and the moving things drawn over it, which is what the map should hold already. */
  putBack() {
    const p = this.plan, T = this.T;
    p.any = true; p.reset = false; p.shift = null; p.redo.length = 0; p.back.length = 0; p.back.push([0, 0, T, T]); p.movers = this.movers ? [0, 0, T, T] : null; p.tiles = 0; p.put = T * T;
    this.pending = true; return p;
  }
  /** The plan was carried out: the map and the kept copy now hold this frame's things. */
  commit() { this.cS.set(this.S); this.mM.set(this.M); this.valid = true; this.pending = false; }
  /** The map was drawn some other way: the tiles start again. */
  drop() { this.valid = false; this.pending = false; }
}
