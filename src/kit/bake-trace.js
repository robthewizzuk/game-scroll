// Baked light's ray tracing (v.bakeLight({ ... }), bake-light.js): the level's still triangles in one tree, and rays sent
// through it on the CPU, in background workers (bake-worker.js), while the loading screen builds the shaders on the chip.
// No page needed: it runs in a worker, on the spot where there is none, or straight in Node (the kit test).
//
// The tree is three-mesh-bvh's (built once, with the surface area rule); the walk through it is our own, over its packed
// nodes and a flat list of triangles in the tree's order: three-mesh-bvh's own raycastFirst made about 0.3 M rays a second
// here, the flat walk several times that.
//
// What is worked out:
//   a probe   (a point in the air, for the light probe grid): rays all round it. Each one that gets away counts as sky; each
//             that hits something counts as that thing's colour lit by the sky over it and by the sun where the sun reaches
//             it (a second ray towards the sun). Kept as three's L2 spherical harmonics, in three parts the game's colours
//             multiply in later, so the sky's and the sun's colours can change without tracing again:
//               vis (9): the sky seen from here, per unit of the sky's light (C / pi for a hemisphere light of colour C)
//               sky (27, rgb): the sky's light bounced off what is round it, in the same unit
//               sun (27, rgb): the sun's light bounced off what is round it, per unit of the sun's (S / pi), for one sun direction
//             and how many of its rays hit the back of something (it is inside a wall or under the ground: left out).
//   a texel   (a point on a surface with a light map, Land's ground): rays over its half of the sky, weighted by how
//             squarely they arrive: how much of the sky it sees (0..1). Open ground stops after a few rays.
// Kit use only.
import { BufferGeometry, BufferAttribute } from 'three';
import { MeshBVH } from 'three-mesh-bvh/src/core/MeshBVH.js';
import { SAH } from 'three-mesh-bvh/src/core/Constants.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

export const bakeReady = MeshoptSimplifier.ready;
/** Floats a triangle in the flat list: a corner (3), its two edges (6), its look (a uint32: r, g, b, how solid, 8 bits each). */
export const TRI = 10;
import { PROBE } from './bake-grid.js';
export { PROBE, shIrradiance } from './bake-grid.js';
const SIMPLIFY_MIN = 300, FAR = 1e30;

/* ---------- the level: triangles in one tree ---------- */

// a piece's triangles simplified to about keep of them (cached by shape and range)
function simplified(shape, start, count, keep, cache) {
  const whole = shape.idx ? shape.idx.subarray(start, start + count) : null, n = count / 3;
  if (keep >= .95 || n < SIMPLIFY_MIN) return whole;
  const target = Math.max(12, Math.floor(n * keep)) * 3, key = `${start}:${count}:${target}`;
  let m = cache.get(shape); if (!m) cache.set(shape, m = new Map());
  if (m.has(key)) return m.get(key);
  let I = whole;
  if (!I) { I = new Uint32Array(count); for (let i = 0; i < count; i++) I[i] = start + i; }
  else if (!(I instanceof Uint32Array)) I = Uint32Array.from(I);
  let out = I;
  try {
    // (light forgives more than a reflection: a tenth of the piece's size off)
    [out] = MeshoptSimplifier.simplify(I, shape.pos, 3, target, .1);
    if (out.length > target * 1.5) { const [o2] = MeshoptSimplifier.simplifySloppy(I, shape.pos, 3, null, target, .2); if (o2.length >= 12 && o2.length < out.length) out = o2; }
  } catch (e) { out = I; }
  if (!out.length) out = I;
  m.set(key, out);
  return out;
}
const enc = v => Math.min(255, Math.max(0, Math.round(Math.sqrt(Math.max(0, v)) * 255)));   // (kept as its square root: more steps for the dark colours)
const dec = new Float32Array(256).map((_, i) => (i / 255) ** 2);

/**
 * The level as one tree.
 * shapes: [{ pos: Float32Array (x, y, z a corner), idx: Uint32Array | Uint16Array | null, col: Float32Array (r, g, b a corner) | null }]
 * items: [{ shape, start, count (its part of the index, or of the corners with no index), ms: [Float32Array(16)] where each copy
 *   stands (a set of copies has many), rgb: [r, g, b] linear, op: 0..1 how solid (leaf cards: about how much of them is leaf),
 *   tint: use the corners' colours, both: both its sides are fronts (a two-sided material) }]
 * budget: about how many triangles in all (big shapes are simplified to fit: a shape used many times counts that many times).
 * Returns { nodes: ArrayBuffer (three-mesh-bvh's packed tree), T: Float32Array (TRI a triangle, in the tree's order), n, box, was }.
 */
export function buildScene({ shapes, items, budget = 2.5e5 }) {
  const cache = new Map();
  for (const it of items) if (!Number.isFinite(it.count)) { const sh = shapes[it.shape]; it.start = 0; it.count = sh.idx ? sh.idx.length : sh.pos.length / 3; }
  let small = 0, big = 0;
  for (const it of items) { const n = it.count / 3 * it.ms.length; if (it.count / 3 < SIMPLIFY_MIN) small += n; else big += n; }
  const was = small + big, keep = was <= budget ? 1 : Math.min(1, Math.max(.03, (budget - small) / Math.max(1, big)));
  const parts = items.map(it => ({ it, sh: shapes[it.shape], idx: simplified(shapes[it.shape], it.start, it.count, keep, cache) }));
  let n = 0; for (const p of parts) n += (p.idx ? p.idx.length : p.it.count) / 3 * p.it.ms.length;
  n = Math.floor(n);
  if (!n) return { nodes: null, T: new Float32Array(0), n: 0, box: [0, 0, 0, 0, 0, 0], was };
  // every triangle with corners of its own (so the tree's sorted index says which triangle each was), where it stands
  const P = new Float32Array(n * 9), look = new Uint32Array(n), box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let t = 0;
  for (const { it, sh, idx } of parts) {
    const { pos, col } = sh, cnt = idx ? idx.length : it.count, first = idx ? 0 : it.start;
    // (the top byte: how solid in 7 bits, and whether both its sides are fronts)
    const op = ((Math.round(Math.min(1, Math.max(0, it.op ?? 1)) * 127) | (it.both ? 128 : 0)) << 24) >>> 0, base = (enc(it.rgb[0]) | enc(it.rgb[1]) << 8 | enc(it.rgb[2]) << 16 | op) >>> 0;
    for (const m of it.ms) {
      for (let i = 0; i < cnt; i += 3) {
        const o = t * 9;
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx[i + k] : first + i + k, x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
          const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14];
          P[o + k * 3] = X; P[o + k * 3 + 1] = Y; P[o + k * 3 + 2] = Z;
          if (X < box[0]) box[0] = X; if (Y < box[1]) box[1] = Y; if (Z < box[2]) box[2] = Z; if (X > box[3]) box[3] = X; if (Y > box[4]) box[4] = Y; if (Z > box[5]) box[5] = Z;
        }
        if (it.tint && col) {
          const a = idx ? idx[i] : first + i, b = idx ? idx[i + 1] : first + i + 1, c = idx ? idx[i + 2] : first + i + 2, s = it.rgb;
          const r = (col[a * 3] + col[b * 3] + col[c * 3]) / 3, g = (col[a * 3 + 1] + col[b * 3 + 1] + col[c * 3 + 1]) / 3, bl = (col[a * 3 + 2] + col[b * 3 + 2] + col[c * 3 + 2]) / 3;
          look[t] = (enc(s[0] * r) | enc(s[1] * g) << 8 | enc(s[2] * bl) << 16 | op) >>> 0;
        } else look[t] = base;
        t++;
      }
    }
  }
  const I = new Uint32Array(n * 3); for (let i = 0; i < I.length; i++) I[i] = i;
  const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(P, 3)); geo.setIndex(new BufferAttribute(I, 1));
  const bvh = new MeshBVH(geo, { strategy: SAH, targetLeafSize: 4, maxDepth: 40, setBoundingBox: false, indirect: false });
  const nodes = bvh._roots[0], T = new Float32Array(n * TRI), L = new Uint32Array(T.buffer), idx = geo.index.array;
  for (let k = 0; k < n; k++) {
    const src = idx[k * 3] / 3 | 0, s = src * 9, o = k * TRI;
    const ax = P[s], ay = P[s + 1], az = P[s + 2];
    T[o] = ax; T[o + 1] = ay; T[o + 2] = az;
    T[o + 3] = P[s + 3] - ax; T[o + 4] = P[s + 4] - ay; T[o + 5] = P[s + 5] - az;
    T[o + 6] = P[s + 6] - ax; T[o + 7] = P[s + 7] - ay; T[o + 8] = P[s + 8] - az;
    L[o + 9] = look[src];
  }
  return { nodes, T, n, box, was };
}
/** The buffers of a built level, to hand over. */
export const sceneBuffers = s => s.nodes ? [s.nodes, s.T.buffer] : [];

/* ---------- the walk ---------- */

/** Rays through a built level: first(...) the nearest hit, any(...) whether anything is in the way. */
export class Rays {
  constructor({ nodes, T }) {
    this.F = nodes ? new Float32Array(nodes) : new Float32Array(8); this.U = nodes ? new Uint32Array(nodes) : new Uint32Array(8); this.H = nodes ? new Uint16Array(nodes) : new Uint16Array(16);
    this.T = T; this.L = new Uint32Array(T.buffer, T.byteOffset, T.length); this.none = !nodes;
    this.stack = new Int32Array(256); this.tri = -1; this.back = false; this.salt = 1; this.cast = 0;
  }
  // the walk: the nearest hit closer than tmax (or, with any, the first found); the triangle in this.tri
  walk(ox, oy, oz, dx, dy, dz, tmax, any) {
    this.cast++; this.tri = -1; if (this.none) return FAR;
    const F = this.F, U = this.U, H = this.H, T = this.T, L = this.L, st = this.stack, salt = this.salt;
    const ix = 1 / (dx || 1e-30), iy = 1 / (dy || 1e-30), iz = 1 / (dz || 1e-30), neg = [dx < 0, dy < 0, dz < 0];
    let best = tmax, sp = 0; st[sp++] = 0;
    while (sp) {
      const n = st[--sp];
      // the node's box against the ray (the slab test)
      let t0 = (F[n] - ox) * ix, t1 = (F[n + 3] - ox) * ix; if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
      let u0 = (F[n + 1] - oy) * iy, u1 = (F[n + 4] - oy) * iy; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
      if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1;
      let w0 = (F[n + 2] - oz) * iz, w1 = (F[n + 5] - oz) * iz; if (w0 > w1) { const s = w0; w0 = w1; w1 = s; }
      if (w0 > t0) t0 = w0; if (w1 < t1) t1 = w1;
      if (t0 > t1 || t1 < 0 || t0 > best) continue;
      if (H[n * 2 + 15] === 0xFFFF) {
        const off = U[n + 6], cnt = H[n * 2 + 14];
        for (let k = off; k < off + cnt; k++) {
          const o = k * TRI, e1x = T[o + 3], e1y = T[o + 4], e1z = T[o + 5], e2x = T[o + 6], e2y = T[o + 7], e2z = T[o + 8];
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
          if (det > -1e-12 && det < 1e-12) continue;
          const inv = 1 / det, sx = ox - T[o], sy = oy - T[o + 1], sz = oz - T[o + 2], u = (sx * px + sy * py + sz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t <= 1e-4 || t >= best) continue;
          // a leaf card is only partly leaf: a ray goes through as often as it isn't (the same ray, the same answer)
          const top = L[o + 9] >>> 24, op = top & 127; if (op < 127 && (Math.imul(k ^ salt, 0x9E3779B1) >>> 25) >= op) continue;
          best = t; this.tri = k; this.back = det < 0 && top < 128;
          if (any) return t;
        }
      } else {
        // the near child last onto the stack, so it is looked at first
        const l = n + 8, r = n + U[n + 6] * 8;
        if (neg[U[n + 7]]) { st[sp++] = l; st[sp++] = r; } else { st[sp++] = r; st[sp++] = l; }
      }
    }
    return this.tri < 0 ? FAR : best;
  }
  first(ox, oy, oz, dx, dy, dz, tmax = FAR) { return this.walk(ox, oy, oz, dx, dy, dz, tmax, false); }
  any(ox, oy, oz, dx, dy, dz, tmax = FAR) { return this.walk(ox, oy, oz, dx, dy, dz, tmax, true) < FAR; }
  /** The last hit triangle's facing (unit, out of its front; a two-sided one's turned to face the ray: dir) into o. */
  normal(o, dx = 0, dy = 0, dz = 0) {
    const T = this.T, k = this.tri * TRI, ax = T[k + 3], ay = T[k + 4], az = T[k + 5], bx = T[k + 6], by = T[k + 7], bz = T[k + 8];
    let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx; let l = Math.hypot(x, y, z) || 1; if (x * dx + y * dy + z * dz > 0) l = -l; o[0] = x / l; o[1] = y / l; o[2] = z / l; return o;
  }
  /** The last hit triangle's colour (linear r, g, b) into o. */
  colour(o) { const c = this.L[this.tri * TRI + 9]; o[0] = dec[c & 255]; o[1] = dec[c >>> 8 & 255]; o[2] = dec[c >>> 16 & 255]; return o; }
}

/* ---------- spherical harmonics (three's order and constants) ---------- */
export function shBasis(x, y, z, b) {
  b[0] = .282095; b[1] = .488603 * y; b[2] = .488603 * z; b[3] = .488603 * x;
  b[4] = 1.092548 * x * y; b[5] = 1.092548 * y * z; b[6] = .315392 * (3 * z * z - 1); b[7] = 1.092548 * x * z; b[8] = .546274 * (x * x - y * y);
  return b;
}
// ray directions over the whole sphere (Fibonacci), turned a different way for each probe
const GOLD = Math.PI * (3 - Math.sqrt(5));
function sphere(n) { const d = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), a = i * GOLD; d[i * 3] = Math.cos(a) * r; d[i * 3 + 1] = y; d[i * 3 + 2] = Math.sin(a) * r; } return d; }
const SPHERES = new Map(), sphereOf = n => SPHERES.get(n) || (SPHERES.set(n, sphere(n)), SPHERES.get(n));
const hash = i => { let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15; h = Math.imul(h, 0x165667b1); return ((h ^ h >>> 13) >>> 0) / 4294967296; };
// a turn (a 3x3 matrix) from three numbers 0..1 (uniform over all turns: Arvo's)
function turn(a, b, c, m) {
  const th = a * 2 * Math.PI, ph = b * 2 * Math.PI, z = c * 2, r = Math.sqrt(z), vx = Math.sin(ph) * r, vy = Math.cos(ph) * r, vz = Math.sqrt(2 - z), st = Math.sin(th), ct = Math.cos(th);
  const sx = vx * ct - vy * st, sy = vx * st + vy * ct;
  m[0] = vx * sx - ct; m[1] = vx * sy - st; m[2] = vx * vz; m[3] = vy * sx + st; m[4] = vy * sy - ct; m[5] = vy * vz; m[6] = vz * sx; m[7] = vz * sy; m[8] = 1 - z;
  return m;
}

/**
 * Probes. job: { at: Float32Array (x, y, z a probe), first: the first probe's number (for its turn of the rays), rays,
 * reach: how far a ray looks (further counts as the sky), sun: [x, y, z] towards the sun (unit) or null, sunReach,
 * ground: [r, g, b] the colour of what a ray that gets away below the horizon would have met }.
 * Returns Float32Array(PROBE a probe).
 */
export function bakeProbes(rays, { at, first = 0, rays: N = 96, reach = 150, sun = null, sunReach = 300, ground = [.2, .2, .2] }) {
  const count = at.length / 3, out = new Float32Array(count * PROBE), D = sphereOf(N), R = new Float32Array(9), B = new Float32Array(9), nrm = [0, 0, 0], col = [0, 0, 0], w = 4 * Math.PI / N;
  const lx = sun?.[0] ?? 0, ly = sun?.[1] ?? 1, lz = sun?.[2] ?? 0, gs = sun ? Math.max(0, ly) : 0;
  for (let p = 0; p < count; p++) {
    const ox = at[p * 3], oy = at[p * 3 + 1], oz = at[p * 3 + 2], o = p * PROBE, id = first + p;
    turn(hash(id * 3 + 1), hash(id * 3 + 2), hash(id * 3 + 3), R);
    let back = 0;
    for (let i = 0; i < N; i++) {
      const a = D[i * 3], b = D[i * 3 + 1], c = D[i * 3 + 2], dx = R[0] * a + R[1] * b + R[2] * c, dy = R[3] * a + R[4] * b + R[5] * c, dz = R[6] * a + R[7] * b + R[8] * c;
      rays.salt = id * 131 + i;
      const t = rays.first(ox, oy, oz, dx, dy, dz, reach);
      shBasis(dx, dy, dz, B);
      let sr = 0, sg = 0, sb = 0, ur = 0, ug = 0, ub = 0, v = 0;
      if (t >= reach) {
        if (dy >= 0) v = 1;
        else { sr = ground[0]; sg = ground[1]; sb = ground[2]; ur = ground[0] * gs; ug = ground[1] * gs; ub = ground[2] * gs; }   // (below the horizon and out of reach: ground)
      } else if (rays.back) { back++; continue; }
      else {
        rays.normal(nrm, dx, dy, dz); rays.colour(col);
        const sky = .5 + .5 * nrm[1]; sr = col[0] * sky; sg = col[1] * sky; sb = col[2] * sky;
        const nl = sun ? nrm[0] * lx + nrm[1] * ly + nrm[2] * lz : 0;
        if (nl > 0) {
          const hx = ox + dx * t + nrm[0] * .02, hy = oy + dy * t + nrm[1] * .02, hz = oz + dz * t + nrm[2] * .02;
          rays.salt = id * 131 + i + 7919;
          if (!rays.any(hx, hy, hz, lx, ly, lz, sunReach)) { ur = col[0] * nl; ug = col[1] * nl; ub = col[2] * nl; }
        }
      }
      for (let k = 0; k < 9; k++) {
        const bw = B[k] * w;
        out[o + k] += v * bw;
        out[o + 9 + k] += sr * bw; out[o + 18 + k] += sg * bw; out[o + 27 + k] += sb * bw;
        out[o + 36 + k] += ur * bw; out[o + 45 + k] += ug * bw; out[o + 54 + k] += ub * bw;
      }
    }
    out[o + 63] = back / N;
  }
  return out;
}

/**
 * Texels of a light map. job: { pos: Float32Array (x, y, z a texel), nrm: the same for its facing, rays, reach }.
 * Returns Float32Array: how much of the sky each sees, weighted as light arrives (1 open, 0 shut in).
 */
export function bakeTexels(rays, { pos, nrm, rays: N = 24, reach = 40, first = 0 }) {
  const count = pos.length / 3, out = new Float32Array(count), FEW = Math.min(8, N);
  for (let p = 0; p < count; p++) {
    let nx = nrm[p * 3], ny = nrm[p * 3 + 1], nz = nrm[p * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    // a frame round the facing
    let ax = Math.abs(nx) < .9 ? 1 : 0, ay = ax ? 0 : 1, az = 0;
    let tx = ay * nz - az * ny, ty = az * nx - ax * nz, tz = ax * ny - ay * nx; const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const ox = pos[p * 3] + nx * .03, oy = pos[p * 3 + 1] + ny * .03, oz = pos[p * 3 + 2] + nz * .03, id = first + p, rot = hash(id) * 2 * Math.PI, jit = hash(id + 77);
    let open = 0, sent = 0;
    for (let i = 0; i < N; i++) {
      // cosine-weighted: the share that gets away is the light it sees
      // (spread from the first ray on, in height as well as round: open ground stops after FEW)
      const f = (i * .6180339887 + jit) % 1, r = Math.sqrt(f), a = i * GOLD + rot, u = r * Math.cos(a), v = r * Math.sin(a), w = Math.sqrt(Math.max(0, 1 - r * r));
      const dx = tx * u + bx * v + nx * w, dy = ty * u + by * v + ny * w, dz = tz * u + bz * v + nz * w;
      rays.salt = id * 97 + i; sent++;
      if (!rays.any(ox, oy, oz, dx, dy, dz, reach)) open++;
      if (sent === FEW && open === FEW) break;   // open ground: done
    }
    out[p] = open / sent;
  }
  return out;
}

/* ---------- light map texels from a mesh's UVs ---------- */
/**
 * Where each texel of a size x size light map lies on a mesh (its UVs, 0..1, laid out with no overlaps): pos, nrm (world),
 * at (the texel's place, row by row from v = 0). geo: { pos, nrm, uv, idx } plain arrays; m: Float32Array(16) its matrix.
 */
export function mapTexels({ pos, nrm, uv, idx }, m, size) {
  const n = idx ? idx.length : pos.length / 3, owner = new Int32Array(size * size).fill(-1), W = new Float32Array(size * size * 3);
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
    const ax = uv[a * 2] * size, ay = uv[a * 2 + 1] * size, bx = uv[b * 2] * size, by = uv[b * 2 + 1] * size, cx = uv[c * 2] * size, cy = uv[c * 2 + 1] * size;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + .5, py = y + .5, l0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d, l1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d, l2 = 1 - l0 - l1;
      const e = -.02; if (l0 < e || l1 < e || l2 < e) continue;
      const t = y * size + x; if (owner[t] >= 0 && Math.min(l0, l1, l2) < 0) continue;   // (a texel's middle inside a triangle wins over one only near its edge)
      owner[t] = i; W[t * 3] = l0; W[t * 3 + 1] = l1; W[t * 3 + 2] = l2;
    }
  }
  let k = 0; for (let t = 0; t < owner.length; t++) if (owner[t] >= 0) k++;
  const P = new Float32Array(k * 3), N = new Float32Array(k * 3), at = new Uint32Array(k);
  // normals turn by the inverse transpose
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], ii = m[10];
  const n0 = e * ii - f * h, n1 = f * g - d * ii, n2 = d * h - e * g, n3 = c * h - b * ii, n4 = a * ii - c * g, n5 = b * g - a * h, n6 = b * f - c * e, n7 = c * d - a * f, n8 = a * e - b * d, sg = a * n0 + b * n1 + c * n2 < 0 ? -1 : 1;
  k = 0;
  for (let t = 0; t < owner.length; t++) {
    const i = owner[t]; if (i < 0) continue;
    const A = idx ? idx[i] : i, B = idx ? idx[i + 1] : i + 1, C = idx ? idx[i + 2] : i + 2, w0 = W[t * 3], w1 = W[t * 3 + 1], w2 = W[t * 3 + 2];
    const x = pos[A * 3] * w0 + pos[B * 3] * w1 + pos[C * 3] * w2, y = pos[A * 3 + 1] * w0 + pos[B * 3 + 1] * w1 + pos[C * 3 + 1] * w2, z = pos[A * 3 + 2] * w0 + pos[B * 3 + 2] * w1 + pos[C * 3 + 2] * w2;
    P[k * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; P[k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; P[k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    let nx, ny, nz;
    if (nrm) { nx = nrm[A * 3] * w0 + nrm[B * 3] * w1 + nrm[C * 3] * w2; ny = nrm[A * 3 + 1] * w0 + nrm[B * 3 + 1] * w1 + nrm[C * 3 + 1] * w2; nz = nrm[A * 3 + 2] * w0 + nrm[B * 3 + 2] * w1 + nrm[C * 3 + 2] * w2; }
    else {
      const ux = pos[B * 3] - pos[A * 3], uy = pos[B * 3 + 1] - pos[A * 3 + 1], uz = pos[B * 3 + 2] - pos[A * 3 + 2], vx = pos[C * 3] - pos[A * 3], vy = pos[C * 3 + 1] - pos[A * 3 + 1], vz = pos[C * 3 + 2] - pos[A * 3 + 2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
    }
    const X = (n0 * nx + n3 * ny + n6 * nz) * sg, Y = (n1 * nx + n4 * ny + n7 * nz) * sg, Z = (n2 * nx + n5 * ny + n8 * nz) * sg, L = Math.hypot(X, Y, Z) || 1;
    N[k * 3] = X / L; N[k * 3 + 1] = Y / L; N[k * 3 + 2] = Z / L; at[k] = t; k++;
  }
  return { pos: P, nrm: N, at };
}
