// Rock for a gs.outdoors Land (land.rocks()): cliffs with ledges and overhangs where the land is steep, caves
// and hollows cut through it, and rock of your own shape (an arch, a shelf, a pillar) melted into it.
//
// A Land is a height map: one height for each spot, so it cannot fold over itself. The rock is a second
// surface, made here from a density (solid below zero) that is measured on a grid of small cells and turned
// into triangles with surface nets (our own, below). The density is the land's own surface pushed outwards:
//
//   d(p) = (p.y - land height) * how flat the land is there  -  E(p)
//
// E is how far the rock stands out of the ground: beds of harder and softer stone (each bed leans out
// towards its top, so a hard bed overhangs the soft one under it), joints that run down the face, lumps;
// all of it only where the land is steep. Where nothing stands out, E is a little under zero, so the rock
// lies just under the ground and is not drawn: rock comes out of the ground along a line the depth buffer
// finds, the way a real outcrop does, and nothing has to be stitched to the height map.
// Shapes of your own are melted in (a smooth union), and cuts are taken out last (caves, hollows). Where a
// cut comes through the ground the land's own squares are left out there (holes), and the ground round the
// hole is given a rim of rock, so the hole's square edge is always under rock.
//
// Beside the triangles it answers what a game asks: for each small column of the world, the spans of
// height that are solid (the ground, a ledge over it, a cave's roof), so "what am I standing on" and
// "what is over me" are a look-up (RockMap).
// Plain numbers only (no three.js, nothing from the page): it runs in a background worker while a card
// loads (job-worker.js) and on the main thread alike. Kit use only: games reach it as land.rocks().

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { if (k <= 0) return a < b ? a : b; const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };

/* ---------- noise (the same numbers on every phone and in the worker) ---------- */
const hash = (x, y, z, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// smooth lumps 0..1
function vn3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iy, iz, s), b = hash(ix + 1, iy, iz, s), c = hash(ix, iy + 1, iz, s), d = hash(ix + 1, iy + 1, iz, s);
  const e = hash(ix, iy, iz + 1, s), f = hash(ix + 1, iy, iz + 1, s), g = hash(ix, iy + 1, iz + 1, s), h = hash(ix + 1, iy + 1, iz + 1, s);
  const lo = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v, hi = e + (f - e) * u + (g - e) * v + (e - f - g + h) * u * v;
  return lo + (hi - lo) * w;
}
function vn2(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  const a = hash(ix, 0, iz, s), b = hash(ix + 1, 0, iz, s), c = hash(ix, 0, iz + 1, s), d = hash(ix + 1, 0, iz + 1, s);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
// three sizes of lump added up, -1..1
const fbm3 = (x, y, z, s) => (vn3(x, y, z, s) + .5 * vn3(x * 2.03, y * 2.03, z * 2.03, s + 1) + .25 * vn3(x * 4.1, y * 4.1, z * 4.1, s + 2)) * (2 / 1.75) - 1;

/* ---------- the land under it ---------- */
// grid: { z: Float32Array of (segments + 1)² heights, row by row (a row runs along x; rows go towards +z),
// size, segments, cut: each square is two triangles cut from its far left corner to its near right one (a
// three.js plane) }. at(x, z, out): out.h the height exactly as the land is drawn, out.ny how flat (1 flat ..
// 0 a wall), smooth between grid points.
export function ground(grid) {
  const { z: Z, size: S, segments: n, cut = true } = grid, w = n + 1, s = S / n, NY = new Float32Array(w * w);
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
    const c0 = Math.max(0, c - 1), c1 = Math.min(n, c + 1), r0 = Math.max(0, r - 1), r1 = Math.min(n, r + 1);
    const dx = (Z[r * w + c1] - Z[r * w + c0]) / ((c1 - c0) * s), dz = (Z[r1 * w + c] - Z[r0 * w + c]) / ((r1 - r0) * s);
    NY[r * w + c] = 1 / Math.hypot(dx, 1, dz);
  }
  return {
    S, n, s, w, Z, NY,
    at(x, z, out) {
      const fc = (x + S / 2) / s, fr = (z + S / 2) / s, c = clamp(Math.floor(fc), 0, n - 1), r = clamp(Math.floor(fr), 0, n - 1), u = clamp(fc - c, 0, 1), v = clamp(fr - r, 0, 1);
      const a = r * w + c, b = a + w, d = a + 1, e = b + 1;
      let wa, wb, wd, we;
      if (!cut) { wa = (1 - u) * (1 - v); wd = u * (1 - v); wb = (1 - u) * v; we = u * v; }
      else if (u + v <= 1) { wa = 1 - u - v; wd = u; wb = v; we = 0; } else { wa = 0; we = u + v - 1; wb = 1 - u; wd = 1 - v; }
      out.h = Z[a] * wa + Z[b] * wb + Z[d] * wd + Z[e] * we;
      out.ny = (NY[a] * (1 - u) + NY[d] * u) * (1 - v) + (NY[b] * (1 - u) + NY[e] * u) * v;
      return out;
    },
  };
}

/* ---------- shapes of your own, and cuts ---------- */
// Each becomes { sdf(x, y, z): metres to its surface (under zero inside), lo, hi: the box it can reach, rough,
// blend, cut, pts: a cave's path }. World metres; turn: about the upright (0 faces +z, as everywhere in the kit).
function shape(sh, cut) {
  const at = sh.at || [0, 0, 0], turn = sh.turn || 0, cs = Math.cos(turn), sn = Math.sin(turn), rough = sh.rough ?? (sh.path ? .35 : .3), blend = sh.blend ?? .6;
  const local = (x, z) => [(x - at[0]) * cs - (z - at[2]) * sn, (x - at[0]) * sn + (z - at[2]) * cs];
  let sdf, lo, hi, pts = null;
  const turned = (hx, y0, y1, hz) => { const ex = Math.abs(hx * cs) + Math.abs(hz * sn), ez = Math.abs(hx * sn) + Math.abs(hz * cs); lo = [at[0] - ex, at[1] + y0, at[2] - ez]; hi = [at[0] + ex, at[1] + y1, at[2] + ez]; };
  if (sh.path) {   // a tube along a path: [[x, y, z, radius?], ...]
    pts = sh.path.map(p => [p[0], p[1], p[2], p[3] ?? sh.radius ?? 2.5]);
    if (pts.length === 1) pts.push(pts[0].slice());
    const segs = pts.slice(0, -1).map((a, i) => { const b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; return [a[0], a[1], a[2], dx, dy, dz, 1 / Math.max(1e-9, dx * dx + dy * dy + dz * dz), a[3], b[3] - a[3]]; });
    const squash = sh.squash ?? .85;   // (a cave is a little lower than it is wide)
    sdf = (x, y, z) => {
      let best = 1e9;
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i], px = x - g[0], py = y - g[1], pz = z - g[2], t = clamp((px * g[3] + py * g[4] + pz * g[5]) * g[6], 0, 1);
        const qx = px - g[3] * t, qy = (py - g[4] * t) / squash, qz = pz - g[5] * t, d = Math.sqrt(qx * qx + qy * qy + qz * qz) - (g[7] + g[8] * t);
        if (d < best) best = d;
      }
      return best;
    };
    lo = [1e9, 1e9, 1e9]; hi = [-1e9, -1e9, -1e9];
    for (const p of pts) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a] - p[3]); hi[a] = Math.max(hi[a], p[a] + p[3]); }
  } else if (sh.ball) {
    const r = sh.ball; sdf = (x, y, z) => Math.hypot(x - at[0], y - at[1], z - at[2]) - r; lo = at.map(v => v - r); hi = at.map(v => v + r);
  } else if (sh.box) {   // [wide, high, deep], its middle at `at`
    const [bw, bh, bd] = sh.box, r = Math.min(sh.round ?? .4, bw / 2, bh / 2, bd / 2);
    sdf = (x, y, z) => { const [lx, lz] = local(x, z), qx = Math.abs(lx) - bw / 2 + r, qy = Math.abs(y - at[1]) - bh / 2 + r, qz = Math.abs(lz) - bd / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; };
    turned(bw / 2, -bh / 2, bh / 2, bd / 2);
  } else if (sh.arch) {   // [span, rise, thick, deep]: an arch standing on `at`, its feet `span` apart along its own x
    const [span, rise, thick = 2, deep = thick] = sh.arch, R = span / 2, k = R / Math.max(.1, rise);
    sdf = (x, y, z) => { const [lx, lz] = local(x, z), ring = Math.hypot(lx, (y - at[1]) * k) - R, qa = Math.abs(ring) - thick / 2, qb = Math.abs(lz) - deep / 2; return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0); };
    turned(R + thick / 2, -rise - thick, rise + thick, deep / 2);
  } else throw new Error('land.rocks(): a shape needs a ball, a box, an arch or a path');
  const pad = rough + (cut ? 0 : blend) + .3;
  return { sdf, lo: lo.map(v => v - pad), hi: hi.map(v => v + pad), rough, blend, cut, pts, n: sh.seed ?? 0 };
}

const SINK = .1;   // where no rock stands out, it lies this far under the ground (metres)
const DEFAULTS = { steep: .42, depth: 1, beds: 1.8, ledge: 1.1, lip: .7, rough: .45, cracks: .5 };

/**
 * The density and everything round it. o: { cell, seed, cliffs: { steep, depth, beds, ledge, lip, rough,
 * cracks, area: [x0, z0, x1, z1] } | true | false, shapes: [...], caves: [{ path, radius, rough }] }.
 */
export function field(grid, o = {}) {
  const G = ground(grid), seed = (o.seed ?? 1) | 0, cell = o.cell ?? .4;
  const K = { ...DEFAULTS, ...(o.cliffs && o.cliffs !== true ? o.cliffs : {}) }, cliffs = !(o.cliffs === false || o.cliffs == null);
  const T = Math.max(cell * 3.5, K.beds), area = K.area || null;
  const adds = (o.shapes || []).filter(s => !s.cut).map((s, i) => shape({ seed: i, ...s }, false));
  const cuts = [...(o.shapes || []).filter(s => s.cut), ...(o.caves || [])].map(s => shape(s, true));
  const Bmax = K.depth * (.35 + K.ledge + K.lip + K.rough * 1.3);
  const dipx = (hash(seed, 1, 0, 5) - .5) * .1, dipz = (hash(seed, 2, 0, 5) - .5) * .1;
  const jit = k => (hash(k, 7, 0, seed) - .5) * .6;
  const bedOut = (k, f) => K.ledge * (.08 + .92 * Math.pow(hash(k, 11, 0, seed), 1.3)) + K.lip * f * f * (.3 + .7 * hash(k, 13, 0, seed));
  // the bed of stone at a height: B.k which one, B.v how far it stands out there (a bed's top and the next one's
  // bottom meet half way, over a tenth of a bed: no step is finer than the cells)
  const B = { k: 0, v: 0 };
  function bed(u) {
    const k0 = Math.floor(u); let k = k0;
    if (u < k0 + jit(k0)) k = k0 - 1; else if (u >= k0 + 1 + jit(k0 + 1)) k = k0 + 1;
    const lo = k + jit(k), hi = k + 1 + jit(k + 1), f = clamp((u - lo) / (hi - lo), 0, 1);
    let bv = bedOut(k, f);
    if (f > .88) bv += (bedOut(k + 1, 0) - bedOut(k, 1)) * .5 * sm(.88, 1, f); else if (f < .12) bv += (bedOut(k - 1, 1) - bedOut(k, 0)) * .5 * sm(.12, 0, f);
    B.k = k; B.v = bv; return B;
  }
  // joints: a set of upright cracks a few metres apart, running their own way in each bed, so a face breaks into blocks
  function joint(x, z, k) {
    if (!(K.cracks > 0)) return 0;
    const a = hash(k, 17, 0, seed) * Math.PI, sp = 2.4 + 2.2 * hash(k, 19, 0, seed), u = (x * Math.cos(a) + z * Math.sin(a)) / sp + hash(k, 21, 0, seed) + .12 * (vn2(x * .3, z * .3, seed + 30) - .5);
    return K.cracks * sm(.42, .08, Math.abs(u - Math.floor(u) - .5) * sp);
  }

  // where a cut comes through the ground: the land's own squares to leave out (their numbers, row * segments + column)
  const C0 = { adds: [], cuts: [] };
  const holes = (() => {
    const out = [], n = G.n, s = G.s;
    for (let r = 0; r < n && cuts.length; r++) for (let c = 0; c < n; c++) {
      const x0 = -G.S / 2 + c * s, z0 = -G.S / 2 + r * s; let near = false;
      for (const k of cuts) if (x0 + s >= k.lo[0] && x0 <= k.hi[0] && z0 + s >= k.lo[2] && z0 <= k.hi[2]) { near = true; break; }
      if (!near) continue;
      let open = false;
      for (let j = 0; j <= 6 && !open; j++) for (let i = 0; i <= 6 && !open; i++) {
        const x = x0 + s * i / 6, z = z0 + s * j / 6; G.at(x, z, C0); const y = C0.h;
        for (const k of cuts) if (y >= k.lo[1] && y <= k.hi[1] && k.sdf(x, y, z) + k.rough * fbm3(x * .37, y * .37, z * .37, seed + 60) < .2) { open = true; break; }
      }
      if (open) out.push(r * n + c);
    }
    return Uint32Array.from(out);
  })();
  // A rim of rock round every hole: inside a missing square and for a stride beyond it the rock stands out of the
  // ground, so the hole's square edge is always under rock, however steep the land is there.
  const gone = holes.length ? new Uint8Array(G.n * G.n) : null; if (gone) for (const q of holes) gone[q] = 1;
  const RIM = .7, RIMW = 1.4, rr = Math.ceil(RIMW / G.s);
  function rimAt(x, z) {
    const n = G.n, s = G.s, hs = G.S / 2, c0 = Math.floor((x + hs) / s), r0 = Math.floor((z + hs) / s); let best = RIMW;
    for (let r = Math.max(0, r0 - rr); r <= Math.min(n - 1, r0 + rr); r++) for (let c = Math.max(0, c0 - rr); c <= Math.min(n - 1, c0 + rr); c++) {
      if (!gone[r * n + c]) continue;
      const qx = -hs + c * s, qz = -hs + r * s, dx = Math.max(qx - x, 0, x - qx - s), dz = Math.max(qz - z, 0, z - qz - s), d = Math.hypot(dx, dz); if (d < best) best = d;
    }
    return best < RIMW ? RIM * sm(RIMW, .25, best) : 0;
  }

  // one column of the world: C.h, C.ny, C.cos, C.A (how much of a cliff 0..1), C.wy (the beds' dip here), C.rim,
  // C.cap (no cliff rock stands higher than the land behind it), C.adds / C.cuts (the shapes that can reach it),
  // C.ya..C.yb (the heights where anything but plain ground can be)
  const H = {};
  function col(x, z, C) {
    G.at(x, z, C); C.cos = clamp(C.ny, .3, 1); C.x = x; C.z = z;
    let A = 0;
    if (cliffs) {
      A = sm(K.steep - .1, K.steep + .06, 1 - C.ny);
      if (A > 0 && area) A *= sm(0, 3, Math.min(x - area[0], area[2] - x, z - area[1], area[3] - z));
    }
    C.A = A; C.wy = (vn2(x * .021, z * .021, seed + 3) - .5) * 5 + dipx * x + dipz * z;
    let ya = 1e9, yb = -1e9; C.na = 0; C.nc = 0;
    for (let i = 0; i < adds.length; i++) { const s = adds[i]; if (x >= s.lo[0] && x <= s.hi[0] && z >= s.lo[2] && z <= s.hi[2]) { C.adds[C.na++] = s; if (s.lo[1] < ya) ya = s.lo[1]; if (s.hi[1] > yb) yb = s.hi[1]; } }
    for (let i = 0; i < cuts.length; i++) { const s = cuts[i]; if (x >= s.lo[0] && x <= s.hi[0] && z >= s.lo[2] && z <= s.hi[2]) { C.cuts[C.nc++] = s; if (s.lo[1] < ya) ya = s.lo[1]; if (s.hi[1] > yb) yb = s.hi[1]; } }
    const rim = C.rim = gone ? rimAt(x, z) : 0;
    C.cap = 1e9;
    if (A > 0) {   // the highest the land gets within a few strides: the top of a cliff is level with the ground behind it
      let cap = C.h;
      for (let a = 0; a < 8; a++) { const dx = Math.cos(a * .7854), dz = Math.sin(a * .7854); G.at(x + dx * 1.6, z + dz * 1.6, H); if (H.h > cap) cap = H.h; G.at(x + dx * 3.4, z + dz * 3.4, H); if (H.h > cap) cap = H.h; }
      C.cap = cap + .1;
    }
    if (A > 0 || rim > 0) { ya = Math.min(ya, C.h - 1); yb = Math.max(yb, Math.min(C.cap, C.h + (A * Bmax + rim) / C.cos) + 1); }
    C.ya = ya; C.yb = yb; C.active = yb > ya;
    return C;
  }
  const newCol = () => ({ adds: [], cuts: [], na: 0, nc: 0 });

  // the density at one point of a column: out.d (what is drawn), out.t (what is solid: the ground itself too),
  // out.e (how far the rock stands out of the ground here), out.kind (0 rock that comes out of the ground, 1 a
  // cave's wall, 2 a shape of your own), out.tint (its bed)
  function at(x, y, z, C, out) {
    const g = (y - C.h) * C.cos; let E = C.rim - SINK, tint = .5, kind = 0, bv = -1;
    if (C.A > 0) {
      const b = bed((y + C.wy) / T); bv = b.v;
      const r = K.rough * (fbm3(x * .29, y * .29, z * .29, seed + 20) + .3 * (vn3(x * 1.3, y * 1.3, z * 1.3, seed + 24) * 2 - 1));
      E += C.A * K.depth * Math.max(0, .3 + bv + r - joint(x, z, b.k)); tint = hash(b.k, 23, 0, seed);
    }
    let d = g - E;
    if (y - C.cap > d) d = y - C.cap;
    for (let i = 0; i < C.na; i++) {
      const s = C.adds[i]; if (y < s.lo[1] || y > s.hi[1]) continue;
      let v = s.sdf(x, y, z); if (v > d + s.blend + s.rough * 2 + 1) continue;
      // (a shape of your own is the same stone: lumps, and beds that stand out a little)
      const b = bed((y + C.wy) / T);
      v -= s.rough * (fbm3(x * .33, y * .33, z * .33, seed + 40 + s.n) + .35 * (vn3(x * 1.2, y * 1.2, z * 1.2, seed + 44 + s.n) * 2 - 1)) + s.rough * .9 * (b.v / (K.ledge + K.lip + 1e-6) - .4) - s.rough * joint(x, z, b.k + 7 * s.n);
      if (v < d + s.blend) { if (v < d) { kind = 2; tint = hash(b.k, 23, s.n, seed); } d = smin(d, v, s.blend); }
    }
    let t = Math.min(g, d);
    for (let i = 0; i < C.nc; i++) { const s = C.cuts[i]; if (y < s.lo[1] || y > s.hi[1]) continue; const c = -(s.sdf(x, y, z) + s.rough * fbm3(x * .37, y * .37, z * .37, seed + 60)); if (c > d) { d = c; kind = 1; } if (c > t) t = c; }
    out.d = d; out.t = t; out.e = E; out.kind = kind; out.tint = tint;
    return out;
  }
  // the same from nothing (a point anywhere): for normals and the like
  const C1 = newCol(), O1 = {};
  const dens = (x, y, z) => at(x, y, z, col(x, z, C1), O1).d;
  return { G, cell, seed, K, T, adds, cuts, col, at, dens, newCol, holes };
}

/* ---------- triangles ---------- */
const CHUNK = 32;   // cells a side in one piece of rock
// colours arrive as [r, g, b] in three.js's own working colours (linear)
const mix3 = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

/**
 * Everything land.rocks() needs, as plain arrays. grid as for ground() (and tint: Float32Array of the land's
 * own colours, three numbers a grid point, or null). o as for field(), and colours: { rock, dark, top, floor }
 * ([r, g, b] each; top null: the land's own colour there). Returns { pieces: [{ x0, z0, y0, n, ny, P, N, C, I,
 * off, spans }], holes, cell, stats }.
 */
export function rockArrays(grid, o = {}) {
  const t0 = Date.now(), F = field(grid, o), { G, cell, seed } = F, S = G.S, half = S / 2, side = CHUNK * cell, nch = Math.ceil(S / side);
  const col = { rock: [.26, .24, .2], dark: [.1, .095, .085], top: null, floor: [.085, .07, .05], ...(o.colours || {}) }, tintGrid = grid.tint || null;
  const pieces = [], stats = { cells: 0, tris: 0, verts: 0, hidden: 0, pieces: 0, ms: 0 };
  const n = CHUNK, ns = n + 2, cols = Array.from({ length: ns * ns }, () => F.newCol());
  const O = {}, O2 = {}, CC = F.newCol(), tmp = [0, 0, 0], gc = [0, 0, 0];
  // the land's own colour at a spot (or the top colour given)
  const landTint = (x, z, out) => {
    if (col.top) { out[0] = col.top[0]; out[1] = col.top[1]; out[2] = col.top[2]; return out; }
    if (!tintGrid) { out[0] = .13; out[1] = .17; out[2] = .06; return out; }
    const fc = clamp((x + half) / G.s, 0, G.n - 1e-6), fr = clamp((z + half) / G.s, 0, G.n - 1e-6), c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r, a = (r * G.w + c) * 3, b = a + G.w * 3;
    for (let k = 0; k < 3; k++) out[k] = (tintGrid[a + k] * (1 - u) + tintGrid[a + 3 + k] * u) * (1 - v) + (tintGrid[b + k] * (1 - u) + tintGrid[b + 3 + k] * u) * v;
    return out;
  };
  // how far down a cave a point is: metres along the cave from where it is open to the sky (0 outside any cave)
  const depths = F.cuts.filter(s => s.pts).map(s => caveDepths(s, G));
  for (let cz = 0; cz < nch; cz++) for (let cx = 0; cx < nch; cx++) {
    const x0 = -half + cx * side, z0 = -half + cz * side;
    // the columns of this piece (one more all round, so pieces meet), and whether any of it is more than plain ground
    let ya = 1e9, yb = -1e9, any = false;
    for (let k = 0; k < ns; k++) for (let i = 0; i < ns; i++) {
      const C = F.col(x0 + (i - 1) * cell, z0 + (k - 1) * cell, cols[k * ns + i]);
      if (C.active) { any = true; if (C.ya < ya) ya = C.ya; if (C.yb > yb) yb = C.yb; }
    }
    if (!any) continue;
    const y0 = Math.floor((ya - cell * 2) / cell) * cell, ny = Math.ceil((yb + cell * 2 - y0) / cell), nys = ny + 1, D = new Float32Array(ns * ns * nys);
    // measure: plain ground wherever nothing else can be, the whole density only between a column's own heights
    const off = new Int32Array((n + 1) * (n + 1)).fill(-1), spans = [];
    for (let k = 0; k < ns; k++) for (let i = 0; i < ns; i++) {
      const C = cols[k * ns + i], x = C.x, z = C.z, base = (k * ns + i) * nys, keep = i >= 1 && k >= 1 && C.active;
      const ja = C.active ? Math.max(0, Math.floor((C.ya - y0) / cell)) : nys, jb = C.active ? Math.min(nys - 1, Math.ceil((C.yb - y0) / cell)) : -1;
      let prev = 0, start = -Infinity, solid = true; if (keep) off[(k - 1) * (n + 1) + i - 1] = spans.length;
      for (let j = 0; j < nys; j++) {
        const y = y0 + j * cell; let d, t;
        if (j >= ja && j <= jb) { F.at(x, y, z, C, O); d = O.d; t = O.t; stats.cells++; } else { t = (y - C.h) * C.cos; d = t + SINK - C.rim; }
        D[base + j] = d;
        if (keep) {   // the spans of height that are solid here
          if (j > 0 && (t < 0) !== solid) { const yc = y - cell + cell * prev / (prev - t); if (solid) spans.push(start, yc); else start = yc; solid = !solid; }
          prev = t;
        }
      }
      if (keep) { if (solid) spans.push(start, y0 + ny * cell); spans.push(NaN); }   // (NaN ends a column's list)
    }
    // surface nets: a point in every cell the surface passes through, in the middle of where it crosses the cell's edges
    const vid = new Int32Array((ns - 1) * (ns - 1) * ny).fill(-1), P = [], cw = ns - 1;
    for (let k = 0; k < cw; k++) for (let i = 0; i < cw; i++) {
      const b00 = (k * ns + i) * nys, b10 = b00 + nys, b01 = b00 + ns * nys, b11 = b01 + nys;
      for (let j = 0; j < ny; j++) {
        const d0 = D[b00 + j], d1 = D[b10 + j], d2 = D[b01 + j], d3 = D[b11 + j], d4 = D[b00 + j + 1], d5 = D[b10 + j + 1], d6 = D[b01 + j + 1], d7 = D[b11 + j + 1];
        const m = (d0 < 0) + (d1 < 0) + (d2 < 0) + (d3 < 0) + (d4 < 0) + (d5 < 0) + (d6 < 0) + (d7 < 0); if (m === 0 || m === 8) continue;
        let sx = 0, sy = 0, sz = 0, c = 0;
        // the twelve edges: four along x, four along z, four along y (x, y, z of a crossing in cells)
        if ((d0 < 0) !== (d1 < 0)) { sx += d0 / (d0 - d1); c++; } if ((d2 < 0) !== (d3 < 0)) { sx += d2 / (d2 - d3); sz += 1; c++; }
        if ((d4 < 0) !== (d5 < 0)) { sx += d4 / (d4 - d5); sy += 1; c++; } if ((d6 < 0) !== (d7 < 0)) { sx += d6 / (d6 - d7); sy += 1; sz += 1; c++; }
        if ((d0 < 0) !== (d2 < 0)) { sz += d0 / (d0 - d2); c++; } if ((d1 < 0) !== (d3 < 0)) { sz += d1 / (d1 - d3); sx += 1; c++; }
        if ((d4 < 0) !== (d6 < 0)) { sz += d4 / (d4 - d6); sy += 1; c++; } if ((d5 < 0) !== (d7 < 0)) { sz += d5 / (d5 - d7); sx += 1; sy += 1; c++; }
        if ((d0 < 0) !== (d4 < 0)) { sy += d0 / (d0 - d4); c++; } if ((d1 < 0) !== (d5 < 0)) { sy += d1 / (d1 - d5); sx += 1; c++; }
        if ((d2 < 0) !== (d6 < 0)) { sy += d2 / (d2 - d6); sz += 1; c++; } if ((d3 < 0) !== (d7 < 0)) { sy += d3 / (d3 - d7); sx += 1; sz += 1; c++; }
        vid[(k * cw + i) * ny + j] = P.length / 3;
        P.push(x0 + (i - 1 + sx / c) * cell, y0 + (j + sy / c) * cell, z0 + (k - 1 + sz / c) * cell);
      }
    }
    // faces: one square for each grid edge the surface crosses, between the four cells round that edge. Each
    // edge belongs to one piece (the piece its lower end is in), so neighbouring pieces meet without a gap.
    const Q = [];   // four point numbers a square, wound so that it faces out of the rock
    const V = (i, j, k) => vid[(k * cw + i) * ny + j];
    for (let k = 1; k <= n; k++) for (let i = 1; i <= n; i++) {
      const b = (k * ns + i) * nys;
      for (let j = 1; j < ny; j++) {
        const d = D[b + j], s = d < 0;
        if (s !== (D[b + nys + j] < 0)) { const a = V(i, j - 1, k - 1), b2 = V(i, j, k - 1), c = V(i, j, k), e = V(i, j - 1, k); if (s) Q.push(a, b2, c, e); else Q.push(e, c, b2, a); }           // along x
        if (s !== (D[b + j + 1] < 0)) { const a = V(i - 1, j, k - 1), b2 = V(i - 1, j, k), c = V(i, j, k), e = V(i, j, k - 1); if (s) Q.push(a, b2, c, e); else Q.push(e, c, b2, a); }                 // along y
        if (s !== (D[b + ns * nys + j] < 0)) { const a = V(i - 1, j - 1, k), b2 = V(i, j - 1, k), c = V(i, j, k), e = V(i - 1, j, k); if (s) Q.push(a, b2, c, e); else Q.push(e, c, b2, a); }           // along z
      }
    }
    if (!Q.length) { if (spans.length) pieces.push({ x0, z0, y0, n, ny, P: new Float32Array(0), N: new Float32Array(0), C: new Float32Array(0), I: new Uint32Array(0), off, spans: Float32Array.from(spans) }); continue; }
    // what each point is: hidden under the ground (not drawn), a cave's wall, or rock in the open
    const nv = P.length / 3, hid = new Uint8Array(nv), isCut = new Uint8Array(nv), EV = new Float32Array(nv), TV = new Float32Array(nv), used = new Uint8Array(nv);
    for (let q = 0; q < Q.length; q++) used[Q[q]] = 1;
    for (let v = 0; v < nv; v++) {
      if (!used[v]) { hid[v] = 1; continue; }
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; F.at(x, y, z, F.col(x, z, CC), O);
      EV[v] = O.e; TV[v] = O.tint; isCut[v] = O.kind; hid[v] = O.kind === 0 && O.e < -.03 ? 1 : 0;
    }
    const map = new Int32Array(nv).fill(-1), I = []; let kept = 0;
    const tri = (a, b, c) => { if (hid[a] && hid[b] && hid[c]) { stats.hidden++; return; } for (const v of [a, b, c]) { if (map[v] < 0) map[v] = kept++; } I.push(map[a], map[b], map[c]); };
    for (let q = 0; q < Q.length; q += 4) { const a = Q[q], b = Q[q + 1], c = Q[q + 2], e = Q[q + 3]; if (a < 0 || b < 0 || c < 0 || e < 0) continue; tri(a, b, c); tri(a, c, e); }
    if (!I.length) { if (spans.length) pieces.push({ x0, z0, y0, n, ny, P: new Float32Array(0), N: new Float32Array(0), C: new Float32Array(0), I: new Uint32Array(0), off, spans: Float32Array.from(spans) }); continue; }
    // the points that are drawn: where they are, which way they face (from the density itself, finer than the
    // cells: a bed's edge is lit crisply), and their colour
    const PP = new Float32Array(kept * 3), NN = new Float32Array(kept * 3), CO = new Float32Array(kept * 3), e = .1;
    for (let v = 0; v < nv; v++) {
      const m = map[v]; if (m < 0) continue;
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const a = F.dens(x + e, y - e, z - e), b = F.dens(x - e, y - e, z + e), c = F.dens(x - e, y + e, z - e), d = F.dens(x + e, y + e, z + e);
      let nx = a - b - c + d, nyy = -a - b + c + d, nz = -a + b - c + d; const l = Math.hypot(nx, nyy, nz) || 1; nx /= l; nyy /= l; nz /= l;
      PP[m * 3] = x; PP[m * 3 + 1] = y; PP[m * 3 + 2] = z; NN[m * 3] = nx; NN[m * 3 + 1] = nyy; NN[m * 3 + 2] = nz;
      // creases are darker: how open it is a little way out from the face
      const o1 = F.dens(x + nx * .45, y + nyy * .45, z + nz * .45), o2 = F.dens(x + nx * 1.3, y + nyy * 1.3 + .2, z + nz * 1.3);
      let shade = .4 + .6 * clamp(Math.min(o1 / .45, o2 / 1.3), 0, 1);
      // down a cave it is darker still
      let deep = 0; for (const dp of depths) deep = Math.max(deep, dp(x, y, z)); const dark = Math.exp(-deep / 6);
      shade *= .14 + .86 * dark;
      // each bed its own shade of the stone, grain, the streaks that run down a face, and a little warmer here, cooler there
      const grain = .82 + .36 * vn3(x * 2.3, y * 2.3, z * 2.3, seed + 70), sk = vn2(x * 1.9 + y * .07, z * 1.9, seed + 71), streak = .72 + .28 * sm(.15, .6, sk), warm = vn3(x * .11, y * .2, z * .11, seed + 73) - .5;
      mix3(col.dark, col.rock, clamp(.08 + .95 * TV[v] + .35 * (vn3(x * .5, y * .9, z * .5, seed + 72) - .5), 0, 1), tmp);
      tmp[0] *= grain * streak * (1 + .16 * warm); tmp[1] *= grain * streak; tmp[2] *= grain * streak * (1 - .2 * warm);
      // the ground's own colour where the rock comes out of it and on its flat tops (grass on a ledge); a cave's floor is earth
      let gm;
      if (isCut[v] === 1) { gm = sm(.55, .85, nyy); mix3(tmp, col.floor, gm, tmp); }
      else { gm = Math.max(isCut[v] ? 0 : sm(.1, -.02, EV[v]), sm(.72, .93, nyy) * (isCut[v] ? .75 : .9)); if (gm > 0) mix3(tmp, landTint(x, z, gc), gm, tmp); }
      CO[m * 3] = tmp[0] * shade; CO[m * 3 + 1] = tmp[1] * shade; CO[m * 3 + 2] = tmp[2] * shade;
    }
    pieces.push({ x0, z0, y0, n, ny, P: PP, N: NN, C: CO, I: kept > 65535 ? Uint32Array.from(I) : Uint16Array.from(I), off, spans: Float32Array.from(spans) });
    stats.tris += I.length / 3; stats.verts += kept; stats.pieces++;
  }
  stats.ms = Date.now() - t0;
  return { pieces, holes: F.holes, cell, side, nch, stats };
}

// For a cave: (x, y, z) => how many metres along it that point is from open sky (0 when it is not in the cave).
function caveDepths(s, G) {
  const pts = s.pts, sam = [], H = {};
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.max(1, Math.ceil(len / .75));
    for (let j = i ? 1 : 0; j <= m; j++) { const t = j / m; sam.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]); }
  }
  // open: the cave's own middle is out of the ground there, or its roof is thinner than nothing
  const n = sam.length, dep = new Float32Array(n).fill(1e9);
  for (let i = 0; i < n; i++) { const p = sam[i]; G.at(p[0], p[2], H); if (p[1] + p[3] * .6 > H.h) dep[i] = 0; }
  for (let i = 1; i < n; i++) dep[i] = Math.min(dep[i], dep[i - 1] + Math.hypot(sam[i][0] - sam[i - 1][0], sam[i][1] - sam[i - 1][1], sam[i][2] - sam[i - 1][2]));
  for (let i = n - 2; i >= 0; i--) dep[i] = Math.min(dep[i], dep[i + 1] + Math.hypot(sam[i][0] - sam[i + 1][0], sam[i][1] - sam[i + 1][1], sam[i][2] - sam[i + 1][2]));
  for (let i = 0; i < n; i++) if (dep[i] > 60) dep[i] = 60;
  return (x, y, z) => {
    if (x < s.lo[0] || x > s.hi[0] || y < s.lo[1] || y > s.hi[1] || z < s.lo[2] || z > s.hi[2]) return 0;
    let best = 1e9, bi = -1;
    for (let i = 0; i < n; i++) { const p = sam[i], d = (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2 - p[3] * p[3]; if (d < best) { best = d; bi = i; } }
    const p = sam[bi], r = p[3] * 1.5 + s.rough + .5;
    return (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2 < r * r ? dep[bi] : 0;
  };
}

/* ---------- what a game asks ---------- */
/**
 * The spans of solid height in every column the rock changed, from rockArrays()'s pieces. land(x, z): the
 * height map's own height. top(x, z), floor(x, y, z, reach), roof(x, y, z), inside(x, y, z), ray(from, dir, max).
 */
export class RockMap {
  constructor(arrays, grid, o = {}, land = null) {
    const { pieces, cell, side, nch } = arrays; this.cell = cell; this.side = side; this.nch = nch; this.half = grid.size / 2;
    if (land) this.land = land;   // (the land's own way of answering its height, so plain ground is the same with rock and without)
    this.at = new Array(nch * nch).fill(null);
    for (const p of pieces) if (p.spans.length) this.at[Math.round((p.z0 + this.half) / side) * nch + Math.round((p.x0 + this.half) / side)] = p;
    this.G = ground(grid); this.H = {}; this.L = [0, 0, 0, 0];
    const F = field(grid, o); this.depths = F.cuts.filter(s => s.pts).map(s => caveDepths(s, this.G));
  }
  land(x, z) { return this.G.at(x, z, this.H).h; }
  // the column nearest x, z: where its spans start in piece.spans (or -1: plain ground there), into this.p / this.q
  column(x, z) {
    const s = this.side, cx = Math.floor((x + this.half) / s), cz = Math.floor((z + this.half) / s);
    if (cx < 0 || cz < 0 || cx >= this.nch || cz >= this.nch) { this.p = null; return -1; }
    const p = this.at[cz * this.nch + cx]; this.p = p; if (!p) return -1;
    const i = clamp(Math.round((x - p.x0) / this.cell), 0, p.n), k = clamp(Math.round((z - p.z0) / this.cell), 0, p.n);
    return p.off[k * (p.n + 1) + i];
  }
  /** Does the rock change anything at x, z (is it more than the height map there)? */
  changed(x, z) { return this.column(x, z) >= 0; }
  // the top of the highest solid span of a column
  topOf(p, q) { const S = p.spans; let t = -Infinity; for (let i = q; S[i] === S[i]; i += 2) t = S[i + 1]; return t; }
  // the top of the highest span that starts at or under y + reach (what you would stand on); else the lowest there is
  floorOf(p, q, y) { const S = p.spans; let t = S[q + 1]; for (let i = q + 2; S[i] === S[i]; i += 2) { if (S[i + 1] <= y) t = S[i + 1]; else { if (S[i] <= y) t = S[i + 1]; break; } } return t; }
  // one of the four columns round a spot, for blending: its answer and where it is
  // (j: which of the four; this.L[j] is left holding the land's own height there)
  corner(p, i, k, y, floor, j) {
    const q = p.off[k * (p.n + 1) + i], l = this.L[j] = this.land(p.x0 + i * this.cell, p.z0 + k * this.cell);
    return q < 0 ? l : floor ? this.floorOf(p, q, y) : this.topOf(p, q);
  }
  blend(x, z, y, floor) {
    const s = this.side, cx = Math.floor((x + this.half) / s), cz = Math.floor((z + this.half) / s);
    const p = cx < 0 || cz < 0 || cx >= this.nch || cz >= this.nch ? null : this.at[cz * this.nch + cx];
    if (!p) return this.land(x, z);
    const fx = clamp((x - p.x0) / this.cell, 0, p.n - 1e-6), fz = clamp((z - p.z0) / this.cell, 0, p.n - 1e-6), i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k, O = p.off, w = p.n + 1;
    if (O[k * w + i] < 0 && O[k * w + i + 1] < 0 && O[(k + 1) * w + i] < 0 && O[(k + 1) * w + i + 1] < 0) return this.land(x, z);   // (plain ground all round: the land's own answer, exactly)
    const a = this.corner(p, i, k, y, floor, 0), b = this.corner(p, i + 1, k, y, floor, 1), c = this.corner(p, i, k + 1, y, floor, 2), d = this.corner(p, i + 1, k + 1, y, floor, 3), L = this.L;
    const j = u < .5 ? (v < .5 ? 0 : 2) : (v < .5 ? 1 : 3), near = j === 0 ? a : j === 1 ? b : j === 2 ? c : d;
    // Blended between the four where they are one surface; at a ledge's edge, the nearest one's. Where that is
    // the land or rock close over it, the answer is told as so far over the land's own height at those columns
    // and given over the land's own height here: so where the land itself is what is stood on it is the land's
    // triangles to the millimetre, however steep, and rock rises out of it without a step. (A cave's floor, far
    // under the land, is left as the columns have it.)
    if (Math.abs(a - near) < .9 && Math.abs(b - near) < .9 && Math.abs(c - near) < .9 && Math.abs(d - near) < .9) {
      const f = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v, base = (L[0] * (1 - u) + L[1] * u) * (1 - v) + (L[2] * (1 - u) + L[3] * u) * v, e = Math.abs(f - base);
      return e < 1.5 ? f + (this.land(x, z) - base) * (1 - sm(.5, 1.5, e)) : f;
    }
    return Math.abs(near - L[j]) < .05 ? this.land(x, z) + near - L[j] : near;
  }
  /** The highest solid thing at x, z: the ground, or the rock over it. */
  top(x, z) { return this.blend(x, z, 0, false); }
  /** What a thing at height y stands on at x, z: the highest ground or rock at or under y + reach. */
  floor(x, y, z, reach = .6) { return this.blend(x, z, y + reach, true); }
  /** The underside of what is over a point (Infinity: open sky). */
  roof(x, y, z) {
    const q = this.column(x, z); if (q < 0) { const h = this.land(x, z); return y < h ? y : Infinity; }
    const S = this.p.spans; for (let i = q; S[i] === S[i]; i += 2) { if (y < S[i + 1]) return y >= S[i] ? y : S[i]; }
    return Infinity;
  }
  /** Is this point inside the ground or the rock? */
  inside(x, y, z) {
    const q = this.column(x, z); if (q < 0) return y < this.land(x, z);
    const S = this.p.spans; for (let i = q; S[i] === S[i]; i += 2) if (y >= S[i] && y < S[i + 1]) return true;
    return false;
  }
  /** Metres from `from` along the unit direction `dir` to the first solid thing, or Infinity within max. */
  ray(from, dir, max = 100) {
    if (Math.abs(dir.x) < 1e-6 && Math.abs(dir.z) < 1e-6) {   // straight up or down: one column
      const q = this.column(from.x, from.z), y = from.y;
      if (q < 0) { const h = this.land(from.x, from.z); return y < h ? 0 : dir.y < 0 && y - h <= max ? y - h : Infinity; }
      const S = this.p.spans; let best = Infinity;
      for (let i = q; S[i] === S[i]; i += 2) { if (y >= S[i] && y < S[i + 1]) return 0; if (dir.y < 0 && S[i + 1] <= y) best = y - S[i + 1]; else if (dir.y > 0 && S[i] > y) { best = S[i] - y; break; } }
      return best <= max ? best : Infinity;
    }
    const step = this.cell * .75; let t = 0, was = 0;
    if (this.inside(from.x, from.y, from.z)) return 0;
    while (t < max) {
      t = Math.min(max, t + step);
      if (this.inside(from.x + dir.x * t, from.y + dir.y * t, from.z + dir.z * t)) {
        let lo = was, hi = t; for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (this.inside(from.x + dir.x * m, from.y + dir.y * m, from.z + dir.z * m)) hi = m; else lo = m; }
        return hi;
      }
      was = t;
    }
    return Infinity;
  }
  /** How much of the sky's light reaches a point: 1 in the open, down to about .1 deep in a cave. */
  sky(x, y, z) {
    let deep = 0; for (const d of this.depths) deep = Math.max(deep, d(x, y, z));
    if (deep > 0) return .1 + .9 * Math.exp(-deep / 6);
    return this.roof(x, y + .1, z) < Infinity ? .7 : 1;
  }
}
