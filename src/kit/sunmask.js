// Finer sun shadows (WebGPU: sunmask-gpu.js draws them, hd3d.js decides when): the bookkeeping that needs no graphics
// chip, kept here so the kit's tests can run it.
//
// - Capsules: people in a crowd too far off to be worth drawing into the sun's shadow map each throw the shadow of a
//   rounded post (an animal's lies along it). Each frame the capsules go into the squares of a grid that their
//   shadows fall across, so a pixel tests only the few whose shadows can reach it.
// - The map of heights: the level seen from above (the top of every shadow caster), in square tiles round the
//   camera, for shadows past the sun's own map. The map wraps round (a place's tile always sits at the same spot of
//   the picture), so when the camera moves on only the tiles that come in are drawn, one a frame, after the rest.
// Kit use only.

/** Most capsules a frame, the grid's squares a side, and capsules a square. */
export const CAPS = 256, GRID = 48, PER = 8;

/**
 * Bins capsules into the squares their shadows fall across. list: [ax, ay, az, bx, by, bz, r] each (the ends of the
 * middle line and the radius), nearest the camera first (only the first CAPS count); L: the way to the sun, length 1;
 * caps: Float32Array(CAPS * 8) filled with them (two RGBA texels each: a.xyz r, b.xyz 0); grid: Float32Array(GRID *
 * GRID * 8) filled with each square's capsules (index + 1, 0 for none; two RGBA texels a square, rows along z);
 * reach: the longest shadow in metres (a low sun); at: the drawing's centre (origin.js: the capsules are in the world,
 * the frame is drawn about it), or null. Returns the grid's corner and square size, and how many capsules there are
 * and how many were left out of a full square.
 */
export function binCapsules(list, L, caps, grid, reach = 40, at = null) {
  const n = Math.min(CAPS, list.length), ly = Math.max(.05, L[1]), out = { n, x0: 0, z0: 0, cell: 1, full: 0 };
  grid.fill(0); if (!n) return out;
  const ox = at ? at.x : 0, oy = at ? at.y : 0, oz = at ? at.z : 0;
  const fp = new Float32Array(n * 4);   // each shadow's box on the ground: x0, z0, x1, z1
  let X0 = Infinity, Z0 = Infinity, X1 = -Infinity, Z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const w = list[i], r = w[6], o = i * 8;
    const c = [w[0] - ox, w[1] - oy, w[2] - oz, w[3] - ox, w[4] - oy, w[5] - oz], y0 = Math.min(c[1], c[4]) - r;
    caps[o] = c[0]; caps[o + 1] = c[1]; caps[o + 2] = c[2]; caps[o + 3] = r; caps[o + 4] = c[3]; caps[o + 5] = c[4]; caps[o + 6] = c[5]; caps[o + 7] = 0;
    // its ends, and where their shadows meet the ground under it (no further than reach)
    const ka = Math.min(reach, (c[1] - y0) / ly), kb = Math.min(reach, (c[4] - y0) / ly), pen = r + .035 * Math.max(ka, kb) + .1;
    const xs = [c[0], c[3], c[0] - L[0] * ka, c[3] - L[0] * kb], zs = [c[2], c[5], c[2] - L[2] * ka, c[5] - L[2] * kb];
    const a = Math.min(...xs) - pen, b = Math.min(...zs) - pen, e = Math.max(...xs) + pen, f = Math.max(...zs) + pen;
    fp[i * 4] = a; fp[i * 4 + 1] = b; fp[i * 4 + 2] = e; fp[i * 4 + 3] = f;
    if (a < X0) X0 = a; if (b < Z0) Z0 = b; if (e > X1) X1 = e; if (f > Z1) Z1 = f;
  }
  const cell = Math.max(.75, Math.max(X1 - X0, Z1 - Z0) / GRID), count = new Uint8Array(GRID * GRID);
  out.x0 = X0; out.z0 = Z0; out.cell = cell;
  for (let i = 0; i < n; i++) {
    const ix0 = Math.max(0, Math.floor((fp[i * 4] - X0) / cell)), iz0 = Math.max(0, Math.floor((fp[i * 4 + 1] - Z0) / cell));
    const ix1 = Math.min(GRID - 1, Math.floor((fp[i * 4 + 2] - X0) / cell)), iz1 = Math.min(GRID - 1, Math.floor((fp[i * 4 + 3] - Z0) / cell));
    for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) {
      const s = z * GRID + x; if (count[s] >= PER) { out.full++; continue; }
      grid[s * 8 + count[s]++] = i + 1;
    }
  }
  return out;
}

/**
 * The capsule a figure's shadow is thrown by: a rounded post as tall as it stands, or, for something longer than it
 * is tall (an animal on four legs), one lying along the way it faces. h: how tall; d: how long front to back (both
 * at size 1); x, y, z: where its feet are; turn: which way it faces (as rotation.y); s: its size. Writes out (7 numbers).
 */
export function figureCapsule(h, d, x, y, z, turn, s, out) {
  if (h >= d * 1.2) {
    const r = Math.min(.5, Math.max(.08, h * .12)) * s;
    out[0] = x; out[1] = y + r; out[2] = z; out[3] = x; out[4] = y + Math.max(r, h * s - r); out[5] = z; out[6] = r;
  } else {
    const r = Math.max(.06, h * .35) * s, half = Math.max(0, d * s / 2 - r), fx = Math.sin(turn) * half, fz = Math.cos(turn) * half, cy = y + h * .55 * s;
    out[0] = x - fx; out[1] = cy; out[2] = z - fz; out[3] = x + fx; out[4] = cy; out[5] = z + fz; out[6] = r;
  }
  return out;
}

/** How dark a capsule makes a point (0: none .. 1: in its full shadow); the same sums as sunmask-gpu.js, for tests. */
export function capsuleShade(px, py, pz, L, c) {
  const dx = c[3] - c[0], dy = c[4] - c[1], dz = c[5] - c[2], r = c[6], C = Math.max(1e-8, dx * dx + dy * dy + dz * dz);
  const wx = px - c[0], wy = py - c[1], wz = pz - c[2], B = L[0] * dx + L[1] * dy + L[2] * dz, Dd = L[0] * wx + L[1] * wy + L[2] * wz, E = dx * wx + dy * wy + dz * wz;
  const cl = x => Math.min(1, Math.max(0, x));
  // (none on its own body, which its own side shades: a point within a little of its radius from its middle line)
  const s0 = cl(E / C), own = Math.hypot(wx - dx * s0, wy - dy * s0, wz - dz * s0);
  if (own < r * 1.2) return 0;
  // the nearest the ray to the sun comes to the middle line: the two lines' nearest points, kept to the line's ends
  let s = cl((E - B * Dd) / Math.max(C - B * B, 1e-6)); const t = Math.max(0, B * s - Dd); s = cl((E + B * t) / C);
  const d = Math.hypot(wx + L[0] * t - dx * s, wy + L[1] * t - dy * s, wz + L[2] * t - dz * s);
  const pen = r * .3 + t * .035, sm = (a, b, x) => { const k = cl((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  return 1 - sm(r - pen * .5, r + pen, d);
}

/**
 * Which tiles of the map of heights round the camera are due. size: metres the map covers; px: its texels a side;
 * tiles: tiles a side. at(x, z) moves the window (in whole tiles) to keep (x, z) near its middle and gives the tiles
 * that came in (each to be cleared at once and drawn first); next() gives the next tile to draw, or null.
 */
export class HeightTiles {
  constructor(size = 512, px = 512, tiles = 4) {
    this.size = size; this.px = px; this.tiles = tiles; this.tile = size / tiles; this.tpx = px / tiles;
    this.cx = NaN; this.cz = NaN;   // the window's corner, in tiles
    this.queue = []; this.turn = 0; this.drawn = new Set();
  }
  /** The window's middle, in metres. */
  get mid() { return [(this.cx + this.tiles / 2) * this.tile, (this.cz + this.tiles / 2) * this.tile]; }
  // the tile at world tile (tx, tz): its world box and where it sits in the picture (texels, rows from the top: z grows down)
  slot(tx, tz) {
    const n = this.tiles, T = this.tile, m = k => ((k % n) + n) % n;
    return { tx, tz, x0: tx * T, z0: tz * T, x1: (tx + 1) * T, z1: (tz + 1) * T, sx: m(tx) * this.tpx, sy: m(tz) * this.tpx, key: tx + ',' + tz };
  }
  at(x, z) {
    const n = this.tiles, T = this.tile, cx = Math.round(x / T - n / 2), cz = Math.round(z / T - n / 2), came = [];
    // (a step is taken only once the camera is over half a tile past the middle, so standing on an edge doesn't step back and forth)
    if (this.cx === this.cx && Math.abs(x / T - n / 2 - this.cx) < .75 && Math.abs(z / T - n / 2 - this.cz) < .75) return came;
    const was = new Set(); if (this.cx === this.cx) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) was.add((this.cx + i) + ',' + (this.cz + j));
    this.cx = cx; this.cz = cz;
    const keep = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const s = this.slot(cx + i, cz + j); if (was.has(s.key)) keep.push(s); else { came.push(s); this.drawn.delete(s.key); } }
    // the ones that came in first, then the rest, by turns (and nothing kept of tiles gone out)
    this.queue = came.concat(keep); this.turn = 0;
    for (const k of this.drawn) if (!this.queue.some(s => s.key === k)) this.drawn.delete(k);
    return came;
  }
  /** The next tile to draw (those not yet drawn first, then each again in turn, for what changed in the level). */
  next() {
    if (!this.queue.length) return null;
    const i = this.queue.findIndex(s => !this.drawn.has(s.key)), s = i >= 0 ? this.queue[i] : this.queue[this.turn++ % this.queue.length];
    this.drawn.add(s.key); return s;
  }
  /** Every tile in the window has been drawn since it came in. */
  get ready() { return this.queue.length > 0 && this.queue.every(s => this.drawn.has(s.key)); }
  /** Forgets everything drawn (the level changed a lot, or the world's centre moved). */
  reset() { this.cx = this.cz = NaN; this.queue = []; this.drawn.clear(); this.turn = 0; }
}
