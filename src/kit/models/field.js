// Distance fields for the things gs.models makes that are seen close: people, their clothes and kit,
// hero props. A list of soft shapes (balls, boxes, tapered limbs, lofted bodies, bands and patches
// laid on them) is melted together and turned into a mesh with surface nets (our own, below; no
// library needed), with normals from the field's own slope, the shape each point belongs to (for colours,
// materials and bones) and the shading of creases worked out from the field (ambient occlusion),
// so collars, belts, pockets and helmet rims sit in soft shadow without any texture.
// It measures only near the surface (blocks far from it are skipped) and only the shapes near each
// block, so a whole person at half a centimetre takes a fraction of a second.
// Kit use only: games reach it through gs.models.sculpt (with a cell size) and gs.models.human.
// (No three.js in here: people are sculpted in background workers, which load only this and the thinner.)
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

const sqrt = Math.sqrt, abs = Math.abs, mx = Math.max, mn = Math.min, PI = Math.PI;
const cl = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
/** Soft minimum and maximum (melting shapes together, carving them softly). */
export const smin = (a, b, k) => { if (k <= 0) return a < b ? a : b; const h = mx(k - abs(a - b), 0) / k; return mn(a, b) - h * h * k * .25; };
export const smax = (a, b, k) => -smin(-a, -b, k);

// a quick lumpy noise (-1..1) for cloth that isn't perfectly smooth
const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function lumps(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iy, iz), b = hash(ix + 1, iy, iz), c = hash(ix, iy + 1, iz), d = hash(ix + 1, iy + 1, iz);
  const e = hash(ix, iy, iz + 1), f = hash(ix + 1, iy, iz + 1), g = hash(ix, iy + 1, iz + 1), h = hash(ix + 1, iy + 1, iz + 1);
  const lo = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v, hi = e + (f - e) * u + (g - e) * v + (e - f - g + h) * u * v;
  return (lo + (hi - lo) * w) * 2 - 1;
}

/**
 * A body part drawn as slices up its height: rows [y, half width, half depth, z of the middle (0),
 * x of the middle (0), squareness (2 round .. 4 boxy), half depth behind the middle (the same as in
 * front), squareness behind (the same)], bottom to top, joined in smooth curves. The way a tailor or
 * a potter thinks: torsos, legs, sleeves, boots, helmets. With a depth of its own behind, a slice is
 * one shape in front of its widest line and another behind it: a chest and a back, a face and a skull.
 */
/** A smooth step from a to b (either way round), and a bump of width w about c. */
export const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

export class Loft {
  constructor(rows, n = 192) {
    const R = rows.map(r => [r[0], r[1], r[2], r[3] ?? 0, r[4] ?? 0, r[5] ?? 2, r[6] ?? r[2], r[7] ?? r[5] ?? 2]).sort((a, b) => a[0] - b[0]), m = R.length;
    this.y0 = R[0][0]; this.y1 = R[m - 1][0]; this.n = n; this.inv = (n - 1) / (this.y1 - this.y0);
    // a table of slices: half width, half depth in front, middle z, middle x, squareness in front (0..1), lean, half depth behind, squareness behind (0..1)
    const T = this.t = new Float32Array(n * 8), COL = [0, 1, 2, 3, 4, 6, 7];   // where a row's values 1..7 go
    // each value's slope at each row (Catmull-Rom, held back so a curve never overshoots its rows)
    const M = R.map((r, i) => r.map((_, c) => {
      if (!c) return 0;
      const a = R[mx(0, i - 1)], b = R[mn(m - 1, i + 1)]; let s = b[0] > a[0] ? (b[c] - a[c]) / (b[0] - a[0]) : 0;
      for (const j of [i - 1, i]) { if (j < 0 || j + 1 >= m) continue; const d = (R[j + 1][c] - R[j][c]) / (R[j + 1][0] - R[j][0] || 1e-9); if (d === 0 || s / d < 0) s = 0; else if (abs(s) > 3 * abs(d)) s = 3 * d; }
      return s;
    }));
    for (let i = 0, s = 0; i < n; i++) {
      const y = this.y0 + (this.y1 - this.y0) * i / (n - 1); while (s < m - 2 && y > R[s + 1][0]) s++;
      const a = R[s], b = R[s + 1], h = b[0] - a[0] || 1e-9, u = cl((y - a[0]) / h), u2 = u * u, u3 = u2 * u;
      for (let c = 1; c <= 7; c++) {
        let v = (2 * u3 - 3 * u2 + 1) * a[c] + (u3 - 2 * u2 + u) * h * M[s][c] + (-2 * u3 + 3 * u2) * b[c] + (u3 - u2) * h * M[s + 1][c];
        if (c <= 2 || c === 6) v = mx(v, 1e-4);
        T[i * 8 + COL[c - 1]] = c === 5 || c === 7 ? cl((v - 2) / 2) : v;   // squareness kept as 0 (round) .. 1 (boxy)
      }
    }
    // where the wall leans (a shoulder, a hat's crown) the measure is scaled so it stays a true distance
    const dy = (this.y1 - this.y0) / (n - 1) || 1e-9;
    for (let i = 0; i < n; i++) {
      const a = mx(0, i - 1) * 8, b = mn(n - 1, i + 1) * 8, h = (b - a) / 8 * dy;
      const sl = mx(abs(T[b] - T[a]), abs(T[b + 1] - T[a + 1]), abs(T[b + 6] - T[a + 6])) / h + sqrt((T[b + 2] - T[a + 2]) ** 2 + (T[b + 3] - T[a + 3]) ** 2) / h;
      T[i * 8 + 5] = 1 / sqrt(1 + sl * sl);
    }
    this.even = rows.every(r => r[6] == null);   // every slice the same behind as in front
    this.ra = 0; this.ru = 0;
    let zl = 1e9, zh = -1e9, xl = 1e9, xh = -1e9;
    for (let i = 0; i < n; i++) { const a = T[i * 8], cz = T[i * 8 + 2], cx = T[i * 8 + 3]; xl = mn(xl, cx - a); xh = mx(xh, cx + a); zl = mn(zl, cz - T[i * 8 + 6]); zh = mx(zh, cz + T[i * 8 + 1]); }
    this.lo = [xl, this.y0, zl]; this.hi = [xh, this.y1, zh];
    this.s = [0, 0, 0, 0, 0, 1, 0, 0];
  }
  /** The slice at height y: [half width, half depth in front, middle z, middle x, squareness 0..1, lean, half depth behind, squareness behind] (the same array each call). */
  sec(y) {
    const T = this.t, f = cl((y - this.y0) * this.inv, 0, this.n - 1.0001), i = f | 0, u = this.ru = f - i, a = this.ra = i * 8, s = this.s;
    for (let c = 0; c < 8; c++) s[c] = T[a + c] + (T[a + 8 + c] - T[a + c]) * u;
    return s;
  }
  /** How far outside the side wall of slice s (the one sec() last gave) the point is (negative inside), ignoring the ends. */
  wall(s, x, z) {
    const dz = z - s[2], back = dz < 0, bz = back ? s[6] : s[1], vx = (x - s[3]) / s[0], vz = dz / bz, sq = back ? s[7] : s[4], x2 = vx * vx, z2 = vz * vz; let q = sqrt(x2 + z2);
    if (sq > 0) q += (sqrt(sqrt(x2 * x2 + z2 * z2)) - q) * sq;
    if (this.even) return (q - 1) * mn(s[0], s[1]) * s[5];
    // a lopsided loft (a face: much deeper in front than behind, its widest line running back along a jaw) is measured
    // by its own slope at the point, across the slice and up it (from the table's rows either side), as a ball is:
    // one lean for a whole slice would call the chin's upright front as slanted as the jaw's corner beside it
    const g = sqrt(x2 / (s[0] * s[0]) + z2 / (bz * bz)); if (g < 1e-9) return -mn(s[0], bz);
    // (far from the wall that slope says little: there the lean counts for no more than a steep shoulder's would)
    // (the slope up the slice is taken across a whole step of the table, half from the step on each side: taken from one step alone
    // it jumps at every row, and anything laid a little off the wall, a rib, a hem, came out with a saw's edge)
    const T = this.t, a = this.ra, u = this.ru, gq = g / q, q1 = this.q(T, a, x, z), q2 = this.q(T, a + 8, x, z);
    const qy = (u < .5 ? (.5 - u) * (q1 - this.q(T, mx(a - 8, 0), x, z)) + (.5 + u) * (q2 - q1) : (1.5 - u) * (q2 - q1) + (u - .5) * (this.q(T, mn(a + 16, this.n * 8 - 8), x, z) - q2)) * this.inv;
    return (q - 1) / sqrt(gq * gq + mn(qy * qy, 6.25 * gq * gq));
  }
  // (the same measure across the table's slice at a)
  q(T, a, x, z) {
    const dz = z - T[a + 2], back = dz < 0, vx = (x - T[a + 3]) / T[a], vz = dz / (back ? T[a + 6] : T[a + 1]), sq = back ? T[a + 7] : T[a + 4], x2 = vx * vx, z2 = vz * vz; let q = sqrt(x2 + z2);
    if (sq > 0) q += (sqrt(sqrt(x2 * x2 + z2 * z2)) - q) * sq;
    return q;
  }
  side(x, y, z) { return this.wall(this.sec(y), x, z); }
  d(x, y, z) {
    const dr = this.wall(this.sec(y), x, z), dy = mx(this.y0 - y, y - this.y1);
    return dy <= 0 ? mx(dr, dy) : dr > 0 ? sqrt(dr * dr + dy * dy) : dy;
  }
  /** The point on the wall at angle th (0 is the front, +z; turning towards +x) and height y, pushed out by `out` metres. */
  at(th, y, out = 0) {
    const s = this.sec(y), sx = Math.sin(th), cz = Math.cos(th), back = cz < 0, vx = sx / s[0], vz = cz / (back ? s[6] : s[1]), sq = back ? s[7] : s[4], x2 = vx * vx, z2 = vz * vz; let q = sqrt(x2 + z2);
    if (sq > 0) q += (sqrt(sqrt(x2 * x2 + z2 * z2)) - q) * sq;
    return [s[3] + sx * (1 / q + out), y, s[2] + cz * (1 / q + out)];
  }
}

// a turn [x, y, z] (radians, x then y then z as three.js turns things) as the shape's own x, y, z axes
const rotOf = s => { const [rx, ry, rz] = s.rot || [0, 0, 0], a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz); return [c * e, a * f + b * e * d, b * f - a * e * d, -c * f, a * e - b * f * d, b * e + a * f * d, d, -b * c, a * c]; };
const box3 = (c, r) => ({ lo: [c[0] - r, c[1] - r, c[2] - r], hi: [c[0] + r, c[1] + r, c[2] + r] });

// each kind: (shape) => { d(x, y, z), lo, hi } in the sculpt's space
const KINDS = {
  // { ball: r | [rx, ry, rz], at, rot }
  ball(s) {
    const [ax, ay, az] = s.at || [0, 0, 0];
    if (typeof s.ball === 'number') { const r = s.ball; return { d: (x, y, z) => { x -= ax; y -= ay; z -= az; return sqrt(x * x + y * y + z * z) - r; }, ...box3([ax, ay, az], r) }; }
    const [rx, ry, rz] = s.ball, R = rotOf(s), small = mn(rx, ry, rz), ix = 1 / rx, iy = 1 / ry, iz = 1 / rz;
    return {
      d(x, y, z) {
        x -= ax; y -= ay; z -= az;
        const X = (R[0] * x + R[1] * y + R[2] * z) * ix, Y = (R[3] * x + R[4] * y + R[5] * z) * iy, Z = (R[6] * x + R[7] * y + R[8] * z) * iz;
        const k0 = sqrt(X * X + Y * Y + Z * Z), k1 = sqrt(X * X * ix * ix + Y * Y * iy * iy + Z * Z * iz * iz);
        return k1 < 1e-6 ? -small : k0 * (k0 - 1) / k1;
      }, ...box3([ax, ay, az], mx(rx, ry, rz)),
    };
  },
  // { box: [w, h, d], round, at, rot }
  box(s) {
    const [ax, ay, az] = s.at || [0, 0, 0], R = rotOf(s), r = s.round || 0, hx = s.box[0] / 2 - r, hy = s.box[1] / 2 - r, hz = s.box[2] / 2 - r;
    return {
      d(x, y, z) {
        x -= ax; y -= ay; z -= az;
        const qx = abs(R[0] * x + R[1] * y + R[2] * z) - hx, qy = abs(R[3] * x + R[4] * y + R[5] * z) - hy, qz = abs(R[6] * x + R[7] * y + R[8] * z) - hz;
        const ox = mx(qx, 0), oy = mx(qy, 0), oz = mx(qz, 0);
        return sqrt(ox * ox + oy * oy + oz * oz) + mn(mx(qx, qy, qz), 0) - r;
      }, ...box3([ax, ay, az], sqrt(s.box[0] ** 2 + s.box[1] ** 2 + s.box[2] ** 2) / 2),
    };
  },
  // { taper: [[x, y, z], [x, y, z]], r: [r at the first end, r at the second] | r }: a limb, a finger, a barrel
  taper(s) {
    const [a, b] = s.taper, [r1, r2] = [].concat(s.r ?? .05, s.r ?? .05), bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
    const l2 = bx * bx + by * by + bz * bz || 1e-12, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2, sg = Math.sign(rr), R = mx(r1, r2);
    return {
      d(x, y, z) {
        const px = x - a[0], py = y - a[1], pz = z - a[2], yy = px * bx + py * by + pz * bz, zz = yy - l2;
        const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2, k = sg * rr * rr * x2;
        if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
        if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
        return (sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
      },
      lo: [mn(a[0], b[0]) - R, mn(a[1], b[1]) - R, mn(a[2], b[2]) - R], hi: [mx(a[0], b[0]) + R, mx(a[1], b[1]) + R, mx(a[2], b[2]) + R],
    };
  },
  // { rod: [[x, y, z], [x, y, z]], r, round }: a cylinder with flat ends between two points
  rod(s) {
    const [a, b] = s.rod, r = s.r ?? .02, ro = s.round || 0, bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], L = sqrt(bx * bx + by * by + bz * bz) || 1e-9, ux = bx / L, uy = by / L, uz = bz / L;
    return {
      d(x, y, z) {
        const px = x - a[0], py = y - a[1], pz = z - a[2], t = px * ux + py * uy + pz * uz, qx = px - ux * t, qy = py - uy * t, qz = pz - uz * t;
        const dr = sqrt(qx * qx + qy * qy + qz * qz) - r + ro, dy = abs(t - L / 2) - L / 2 + ro;
        return mn(mx(dr, dy), 0) + sqrt(mx(dr, 0) ** 2 + mx(dy, 0) ** 2) - ro;
      },
      lo: [mn(a[0], b[0]) - r, mn(a[1], b[1]) - r, mn(a[2], b[2]) - r], hi: [mx(a[0], b[0]) + r, mx(a[1], b[1]) + r, mx(a[2], b[2]) + r],
    };
  },
  // { torus: [ring radius, tube radius], at, rot }: lying flat (round its own y)
  torus(s) {
    const [ax, ay, az] = s.at || [0, 0, 0], R = rotOf(s), [A, B] = s.torus;
    return {
      d(x, y, z) { x -= ax; y -= ay; z -= az; const X = R[0] * x + R[1] * y + R[2] * z, Y = R[3] * x + R[4] * y + R[5] * z, Z = R[6] * x + R[7] * y + R[8] * z, q = sqrt(X * X + Z * Z) - A; return sqrt(q * q + Y * Y) - B; },
      ...box3([ax, ay, az], A + B),
    };
  },
  // { field: (x, y, z) => metres outside (negative inside), lo, hi }: a shape measured by a function of its own (a face's opening for an eye, hair that thins to nothing at its edge)
  // (m, out: an outline of its own, as a band's or a patch's: m(x, y, z) is how far outside it a point is; what lies inside is this shape's, and its edge is made straight)
  // (along, loop: for a row of stitching round its outline, as a band's: see `stitch` below)
  field(s) { return s.m ? { d: s.field, m: s.m, out: s.out || 0, lo: s.lo.slice(), hi: s.hi.slice(), along: s.along || null, loop: s.loop || 0 } : { d: s.field, lo: s.lo.slice(), hi: s.hi.slice() }; },
  // { loft: Loft | rows, out }: a body part in slices (see Loft); out: grown by this much (a coat over a body)
  loft(s) {
    const L = s.loft instanceof Loft ? s.loft : new Loft(s.loft), o = s.out || 0;
    return { d: o ? (x, y, z) => L.d(x, y, z) - o : (x, y, z) => L.d(x, y, z), lo: L.lo.map(v => v - o), hi: L.hi.map(v => v + o), loft: L };
  },
  // { band: Loft, y: [from, to], out, th: [from, to] }: a ring round a loft (a belt, a cuff, a collar, a boot top); th: only part of the way round
  band(s) {
    const L = s.band instanceof Loft ? s.band : new Loft(s.band), o = s.out ?? .005, [ya, yb] = s.y, ym = (ya + yb) / 2, hh = (yb - ya) / 2, e = s.edge ?? mn(o, hh) * .8, th = s.th;
    const tm = th ? (th[0] + th[1]) / 2 : 0, tw = th ? (th[1] - th[0]) / 2 : 0, lo = [1e9, ya - e, 1e9], hi = [-1e9, yb + e, -1e9];
    for (let i = 0; i <= 8; i++) { const c = L.sec(ya + (yb - ya) * i / 8); lo[0] = mn(lo[0], c[3] - c[0] - o); hi[0] = mx(hi[0], c[3] + c[0] + o); lo[2] = mn(lo[2], c[2] - c[6] - o); hi[2] = mx(hi[2], c[2] + c[1] + o); }
    // m: how far outside the band's outline (along the wall) a point is
    const m = (x, y, z) => {
      let m = abs(y - ym) - hh;
      if (th) { const c = L.sec(y), a = Math.atan2(x - c[3], z - c[2]); let da = a - tm; da -= Math.round(da / (2 * PI)) * 2 * PI; m = mx(m, (abs(da) - tw) * sqrt(c[0] * c[1])); }
      return m;
    };
    // (along its edges, for a row of stitching: metres round from the back, once round being `loop`)
    const cm = L.sec(ym), loop = 2 * PI * sqrt(cm[0] * mx(cm[1], cm[6])), along = (x, y, z) => { const c = L.sec(y); return (Math.atan2(x - c[3], z - c[2]) + PI) / (2 * PI) * loop; };
    return { d: (x, y, z) => smax(L.wall(L.sec(y), x, z) - o, m(x, y, z), e), m, lo, hi, out: o, along, loop: th ? 0 : loop };
  },
  // { patch: Loft, at: [angle, y], size: [w, h], turn, round, out }: a flat piece laid on a loft's wall
  // (a pocket, a flap, a strap, a badge): w across, h up, turned by `turn`, standing `out` proud
  patch(s) {
    const L = s.patch instanceof Loft ? s.patch : new Loft(s.patch), [t0, y0] = s.at, hw = s.size[0] / 2, hh = s.size[1] / 2, o = s.out ?? .004, r = mn(s.round ?? .006, hw, hh), ct = Math.cos(s.turn || 0), st = Math.sin(s.turn || 0), e = s.edge ?? o * .9;
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], g = o + e + .012;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 10; j++) {
      const u = hw * (i / 2 - 1), v = hh * (j / 5 - 1), y = cl(y0 + u * st + v * ct, L.y0, L.y1), c = L.sec(y), p = L.at(t0 + (u * ct - v * st) / sqrt(c[0] * c[1]), y);
      for (let a = 0; a < 3; a++) { lo[a] = mn(lo[a], p[a] - g); hi[a] = mx(hi[a], p[a] + g); }
    }
    const local = (x, y, z, out) => { const sc = L.sec(y), a = Math.atan2(x - sc[3], z - sc[2]); let da = a - t0; da -= Math.round(da / (2 * PI)) * 2 * PI; const u0 = da * sqrt(sc[0] * sc[1]), v0 = y - y0; out[0] = u0 * ct + v0 * st; out[1] = -u0 * st + v0 * ct; return out; };
    const q = [0, 0], m = (x, y, z) => { local(x, y, z, q); const u = abs(q[0]) - hw + r, v = abs(q[1]) - hh + r; return sqrt(mx(u, 0) ** 2 + mx(v, 0) ** 2) + mn(mx(u, v), 0) - r; };
    // (round its outline, for a row of stitching: metres from the bottom left corner, along the bottom first; once round is `loop`.
    // Each side goes by the one it is nearest, so at a corner the two count the same)
    const loop = 4 * (hw + hh), along = (x, y, z) => {
      local(x, y, z, q); const u = cl(q[0], -hw, hw), v = cl(q[1], -hh, hh), du = hw - abs(u), dv = hh - abs(v);
      return dv <= du ? (v < 0 ? u + hw : 2 * hw + 2 * hh + hw - u) : (u > 0 ? 2 * hw + v + hh : 4 * hw + 2 * hh + hh - v);
    };
    return { d: (x, y, z) => smax(L.wall(L.sec(y), x, z) - o, m(x, y, z), e), m, lo, hi, out: o, along, loop };
  },
};
const kindOf = s => Object.keys(KINDS).find(k => s[k] !== undefined);

/**
 * Shapes made ready to measure. Each shape is one of the kinds above plus: blend (how softly it melts
 * in, metres), cut (carved away), mirror (true: also on the other side of x = 0), flip (true: only on the
 * other side), slot (which material and colour it is), bone, tag, ghost (true: not part of the mesh, but
 * it shades what it stands over: a helmet over a face), paint (true: not part of the mesh either: the surface
 * inside it takes its slot, a brow or a stripe painted on; over: only where the surface has that slot), lumpy ([size in metres, height]: uneven like cloth),
 * folds (fn(x, y, z) => extra height, for wrinkles; foldMax: the most it adds, .006), shell (hollow, this
 * thick), clip ([[nx, ny, nz], offset, soft], or a list of them: only the part where n.p > offset is kept),
 * space ({ at, rot }: the shape, lumps and folds and all, is given in a space of its own, turned by rot about `at`),
 * stitch (a band, a patch or a field with an outline: true lays a line along its outline for a row of stitching, see
 * mesh()'s `lines`; 'seam' for a seam there instead), seams (false: no line of `lines` runs over its surface).
 * Thin slivers (a slit, a seam) measure best as boxes or rods: a very flat ball is only roughly measured.
 */
export function ready(shapes, blend = .01) {
  return shapes.map((s, i) => {
    const k = kindOf(s); if (!k) throw new Error('gs.models: a shape needs one of ' + Object.keys(KINDS).join(', '));
    const c = KINDS[k](s), f = c.d, mir = !!s.mirror, flip = !!s.flip; let lo = c.lo.slice(), hi = c.hi.slice();
    let d = f, wob = 0;
    if (s.lumpy || s.folds) {
      const [size, h] = s.lumpy || [1, 0], q = 1 / size, folds = s.folds; wob = h + (folds ? s.foldMax ?? .006 : 0);
      d = (x, y, z) => { let v = f(x, y, z); if (v > -wob * 3 && v < wob * 4) { if (h) v -= h * lumps(x * q, y * q + 7.3, z * q); if (folds) v -= folds(x, y, z); } return v; };
      for (let a = 0; a < 3; a++) { lo[a] -= wob; hi[a] += wob; }
    }
    // space: the shape is given in a space of its own, turned by rot about the point `at` (an arm held out from the body)
    let sp = null;
    if (s.space) {
      const [px, py, pz] = s.space.at || [0, 0, 0], R = rotOf(s.space); sp = g => (x, y, z) => { x -= px; y -= py; z -= pz; return g(px + R[0] * x + R[1] * y + R[2] * z, py + R[3] * x + R[4] * y + R[5] * z, pz + R[6] * x + R[7] * y + R[8] * z); };
      const l2 = [1e9, 1e9, 1e9], h2 = [-1e9, -1e9, -1e9];
      for (let q = 0; q < 8; q++) { const x = (q & 1 ? hi : lo)[0] - px, y = (q & 2 ? hi : lo)[1] - py, z = (q & 4 ? hi : lo)[2] - pz, w = [px + R[0] * x + R[3] * y + R[6] * z, py + R[1] * x + R[4] * y + R[7] * z, pz + R[2] * x + R[5] * y + R[8] * z]; for (let a = 0; a < 3; a++) { l2[a] = mn(l2[a], w[a]); h2[a] = mx(h2[a], w[a]); } }
      lo = l2; hi = h2;
    }
    const side = g => mir ? (x, y, z) => g(x < 0 ? -x : x, y, z) : flip ? (x, y, z) => g(-x, y, z) : g;
    const wrap = d => {
      if (sp) d = sp(d);
      if (s.shell) { const e = d, t = s.shell / 2; d = (x, y, z) => abs(e(x, y, z) + t) - t; }
      for (const [[cx, cy, cz], off, soft = .004] of s.clip ? (Array.isArray(s.clip[0][0]) ? s.clip : [s.clip]) : []) { const e = d; d = (x, y, z) => smax(e(x, y, z), off - (cx * x + cy * y + cz * z), soft); }
      return side(d);
    };
    if (flip) { const a = lo[0]; lo[0] = -hi[0]; hi[0] = -a; }
    // bl, bh: the box to test against (a mirrored shape's is its own side's, met with |x|)
    const bl = lo.slice(), bh = hi.slice(); if (mir) { bl[0] = mx(lo[0], 0); const m = mx(abs(lo[0]), abs(hi[0])); lo[0] = -m; hi[0] = m; }
    const dd = wrap(d), m = c.m ? side(sp ? sp(c.m) : c.m) : null, along = c.m && c.along ? side(sp ? sp(c.along) : c.along) : null;
    return { i, m, out: c.out || 0, d: dd, d0: wob ? wrap(f) : dd, lo, hi, bl, bh, wob, k: s.blend ?? blend, cut: !!s.cut, ghost: !!s.ghost, paint: !!s.paint, slot: s.slot ?? null, bone: s.bone ?? null, tag: s.tag ?? null, mirror: mir, flip, src: s, loft: c.loft || null, along, loop: c.loop || 0 };
  });
}
// ---- a line on the surface made ready (mesh()'s `lines`): its measure is OFF outside its box, and a loop's count is a whole number of periods
// (REACH: how far either side of a line its picture can go, a little more than the 8 mm the picture is drawn across; a line's box is
// grown by as much, so a line inside its box is drawn whole, and one that runs out of it stops there. FAR: how far off a point still
// counts the stitches of its nearest line, though it is plain cloth: a triangle from a line out to plain cloth then counts them the same
// at every corner, and needs no twin, see human-shapes.js evenStitches)
const OFF = 1e3, REACH = .012, FAR = .03;
function lineOf(L, period, shape = null) {
  let m = L.m, al = L.along || ((x, y, z) => y);
  if (L.lo) { const lo = L.lo.map(v => v - FAR), hi = L.hi.map(v => v + FAR), m0 = m; m = (x, y, z) => x < lo[0] || y < lo[1] || z < lo[2] || x > hi[0] || y > hi[1] || z > hi[2] ? OFF : m0(x, y, z); }
  if (L.space) { const [px, py, pz] = L.space.at || [0, 0, 0], R = rotOf(L.space), to = g => (x, y, z) => { x -= px; y -= py; z -= pz; return g(px + R[0] * x + R[1] * y + R[2] * z, py + R[3] * x + R[4] * y + R[5] * z, pz + R[6] * x + R[7] * y + R[8] * z); }; m = to(m); al = to(al); }
  if (L.mirror) { const m0 = m, a0 = al; m = (x, y, z) => m0(x < 0 ? -x : x, y, z); al = (x, y, z) => a0(x < 0 ? -x : x, y, z); }
  if (shape) { const m0 = m; m = (x, y, z) => boxGap(shape, x, y, z) > FAR ? OFF : m0(x, y, z); }
  if (L.loop > 0) { const k = mx(1, Math.round(L.loop / period)) * period / L.loop, a0 = al; al = (x, y, z) => a0(x, y, z) * k; }
  // (in: inside its own box, grown by REACH, where its picture is drawn; outside that, out to FAR, it only counts stitches)
  const lo = L.lo && L.lo.map(v => v - REACH), hi = L.hi && L.hi.map(v => v + REACH);
  const inside = lo ? (x, y, z) => { if (L.mirror && x < 0) x = -x; if (L.space) { const [px, py, pz] = L.space.at || [0, 0, 0], R = rotOf(L.space), dx = x - px, dy = y - py, dz = z - pz; x = px + R[0] * dx + R[1] * dy + R[2] * dz; y = py + R[3] * dx + R[4] * dy + R[5] * dz; z = pz + R[6] * dx + R[7] * dy + R[8] * dz; } return x >= lo[0] && y >= lo[1] && z >= lo[2] && x <= hi[0] && y <= hi[1] && z <= hi[2]; } : shape ? (x, y, z) => boxGap(shape, x, y, z) <= REACH : () => true;
  return { m, along: al, inside, kind: L.kind | 0, slots: L.slots || null, own: L.own ?? -1 };
}
// at least this far from a shape's box (0 inside it)
const boxGap = (s, x, y, z) => {
  if (s.mirror && x < 0) x = -x;
  const a = mx(s.bl[0] - x, x - s.bh[0], 0), b = mx(s.bl[1] - y, y - s.bh[1], 0), c = mx(s.bl[2] - z, z - s.bh[2], 0);
  return a || b || c ? sqrt(a * a + b * b + c * c) : 0;
};
const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7], NONE = [];
// Surface nets over the near blocks of a measured grid F (nx by ny by nz points, `cell` apart from `lo`):
// one point in each cell the surface crosses, joined across the crossed edges. Returns points P, a quick
// normal for each from its cell's corners (Q) and triangles I, facing out of the solid (F < 0 inside).
function nets(F, nx, ny, nz, nearB, B, lo, cell) {
  const nxy = nx * ny, cnx = nx - 1, cny = ny - 1, cnxy = cnx * cny, idx = new Int32Array(cnxy * (nz - 1)), V = new Float64Array(8), lx = lo[0], ly = lo[1], lz = lo[2];
  let cap = 1 << 14, P = new Float32Array(cap * 3), Q = new Float32Array(cap * 3), cellOf = new Uint32Array(cap), maskOf = new Uint8Array(cap), n = 0;
  for (let q = 0; q < nearB.length; q += 3) for (let c = 0; c < B; c++) for (let b = 0; b < B; b++) for (let a = 0; a < B; a++) {
    const x = nearB[q] * B + a, y = nearB[q + 1] * B + b, z = nearB[q + 2] * B + c, p = x + nx * (y + ny * z);
    const v0 = F[p], v1 = F[p + 1], v2 = F[p + nx], v3 = F[p + nx + 1], v4 = F[p + nxy], v5 = F[p + nxy + 1], v6 = F[p + nxy + nx], v7 = F[p + nxy + nx + 1];
    const mask = (v0 < 0 ? 1 : 0) | (v1 < 0 ? 2 : 0) | (v2 < 0 ? 4 : 0) | (v3 < 0 ? 8 : 0) | (v4 < 0 ? 16 : 0) | (v5 < 0 ? 32 : 0) | (v6 < 0 ? 64 : 0) | (v7 < 0 ? 128 : 0);
    if (mask === 0 || mask === 255) continue;
    V[0] = v0; V[1] = v1; V[2] = v2; V[3] = v3; V[4] = v4; V[5] = v5; V[6] = v6; V[7] = v7;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 12; e++) {
      const i0 = EA[e], i1 = EB[e]; if (((mask >> i0) & 1) === ((mask >> i1) & 1)) continue;
      const t = V[i0] / (V[i0] - V[i1]), ax = i0 & 1, ay = (i0 >> 1) & 1, az = i0 >> 2;
      sx += ax + ((i1 & 1) - ax) * t; sy += ay + (((i1 >> 1) & 1) - ay) * t; sz += az + ((i1 >> 2) - az) * t; cnt++;
    }
    if (n === cap) { cap *= 2; let T = new Float32Array(cap * 3); T.set(P); P = T; T = new Float32Array(cap * 3); T.set(Q); Q = T; T = new Uint32Array(cap); T.set(cellOf); cellOf = T; T = new Uint8Array(cap); T.set(maskOf); maskOf = T; }
    P[n * 3] = lx + (x + sx / cnt) * cell; P[n * 3 + 1] = ly + (y + sy / cnt) * cell; P[n * 3 + 2] = lz + (z + sz / cnt) * cell;
    const qx = v1 + v3 + v5 + v7 - v0 - v2 - v4 - v6, qy = v2 + v3 + v6 + v7 - v0 - v1 - v4 - v5, qz = v4 + v5 + v6 + v7 - v0 - v1 - v2 - v3, ql = sqrt(qx * qx + qy * qy + qz * qz) || 1;
    Q[n * 3] = qx / ql; Q[n * 3 + 1] = qy / ql; Q[n * 3 + 2] = qz / ql;
    const m = x + cnx * (y + cny * z); cellOf[n] = m; maskOf[n] = mask; idx[m] = ++n;
  }
  const I = new Uint32Array(n * 9); let ni = 0;
  for (let v = 0; v < n; v++) {
    const m = cellOf[v], mask = maskOf[v], x = m % cnx, y = ((m / cnx) | 0) % cny, z = (m / cnxy) | 0, in0 = mask & 1;
    for (let ax = 0; ax < 3; ax++) {
      // the edge from this cell's first corner along x, y or z, and the three other cells round it
      let b, c, d;
      if (ax === 0) { if (((mask >> 1) & 1) === in0 || y === 0 || z === 0) continue; b = idx[m - cnx] - 1; c = idx[m - cnx - cnxy] - 1; d = idx[m - cnxy] - 1; }
      else if (ax === 1) { if (((mask >> 2) & 1) === in0 || x === 0 || z === 0) continue; b = idx[m - cnxy] - 1; c = idx[m - cnxy - 1] - 1; d = idx[m - 1] - 1; }
      else { if (((mask >> 4) & 1) === in0 || x === 0 || y === 0) continue; b = idx[m - 1] - 1; c = idx[m - 1 - cnx] - 1; d = idx[m - cnx] - 1; }
      if (b < 0 || c < 0 || d < 0) continue; if (!in0) { const t = b; b = d; d = t; }
      const a = v, ac = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2, bd = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
      if (ac <= bd) { I[ni++] = a; I[ni++] = b; I[ni++] = c; I[ni++] = a; I[ni++] = c; I[ni++] = d; } else { I[ni++] = a; I[ni++] = b; I[ni++] = d; I[ni++] = b; I[ni++] = c; I[ni++] = d; }
    }
  }
  return { P: P.subarray(0, n * 3), Q: Q.subarray(0, n * 3), I: I.subarray(0, ni), n };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The mesh of a list of shapes: { P, N, I, own, ao, n, shapes }: positions, normals, triangles, the
 * shape each point belongs to (an index into shapes) and how open each point is to the sky (1 open .. 0
 * deep in a crease). cell: metres per cell; blend: the shapes' own if they give none; ao: false to skip
 * the crease shading; reach: how far the crease shading looks (metres); keep (0..1) and error (metres):
 * thinned to this share of its triangles before the fine work is done (normals and creases are then
 * worked out only for the points that stay, so a thinned mesh is also a much quicker one).
 * Surface nets on a grid measured only near the surface: blocks of 4 cells far from every shape are
 * filled in from a coarse grid, and each block only measures the shapes that reach it.
 * lines: seams and rows of stitching on the surface, for a picture to draw (human-paint.js): [{ m(x, y, z) (how far
 * from the line, metres, one side negative), along(x, y, z) (metres along it), kind (0 a seam, 1 a row of stitching),
 * slots (only on the surface of these), lo, hi (the box it is in, in its own space), space, mirror, loop (a line that
 * goes right round: metres once round) }], and the outlines of shapes marked `stitch`. A row of points is laid along
 * each (the points beside it are slid onto it, and thinning keeps them), so however few triangles are left it is
 * drawn as one clean line. Gives back `line`: for each point [how far from the nearest line along the surface
 * (metres; 1 for plain cloth near one, which still counts its stitches; 1e3 with none within 3 cm), how far along it, its kind];
 * period: a loop's length is made a whole number
 * of these, so where its count starts again the picture carries on.
 */
export function mesh(shapes, { cell = .006, blend = .01, ao = true, reach = .1, keep = 1, error = .0015, bounds = null, lines = null, period = .0035 } = {}) {
  const t0 = now(), S = ready(shapes, blend), solid = S.filter(s => !s.ghost && !s.paint), ghosts = S.filter(s => s.ghost), paints = S.filter(s => s.paint);
  const LN = (lines || []).map(L => lineOf(L, period));
  for (const s of S) if (s.src.stitch && s.m && !s.ghost) LN.push(lineOf({ m: s.m, along: s.along || ((x, y, z) => y), kind: s.src.stitch === 'seam' ? 0 : 1, loop: s.loop, own: s.i }, period, s));
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  if (bounds) { for (let a = 0; a < 3; a++) { lo[a] = bounds[0][a]; hi[a] = bounds[1][a]; } }
  else for (const s of solid) { if (s.cut) continue; for (let a = 0; a < 3; a++) { lo[a] = mn(lo[a], s.lo[a] - s.k * .25); hi[a] = mx(hi[a], s.hi[a] + s.k * .25); } }
  const B = 4, bs = B * cell, pad = cell * 2, wob = solid.reduce((a, s) => mx(a, s.wob), 0);
  // The grid measures the shapes smooth (without their lumps and folds: those are pressed in afterwards, only
  // into the points that stay). skip: a block whose middle is further than this from any surface holds none;
  // thr: a shape further than this from a block can't shape the surface in it
  const skip = bs * .87 + cell * 1.75 + .002, thr = mx(.02, cell * 3);
  for (let a = 0; a < 3; a++) lo[a] -= pad;
  const nb = [0, 1, 2].map(a => mx(1, Math.ceil((hi[a] + pad - lo[a]) / bs))), [bx, by, bz] = nb, nx = bx * B + 1, ny = by * B + 1, nz = bz * B + 1, nxy = nx * ny, ic = 1 / cell;
  const measure = (l, x, y, z) => { let d = 1e9; for (let j = 0; j < l.length; j++) { const s = l[j], e = s.d(x, y, z); d = s.cut ? smax(d, -e, s.k) : smin(d, e, s.k); } return d; };
  const measure0 = (l, x, y, z) => { let d = 1e9; for (let j = 0; j < l.length; j++) { const s = l[j], e = s.d0(x, y, z); d = s.cut ? smax(d, -e, s.k) : smin(d, e, s.k); } return d; };
  // every shape, skipping those too far to matter (for the coarse grid)
  const all = (x, y, z) => { let d = 1e9; for (let j = 0; j < solid.length; j++) { const s = solid[j], g = boxGap(s, x, y, z); if (s.cut ? d + g >= s.k : g >= d + s.k) continue; const e = s.d0(x, y, z); d = s.cut ? smax(d, -e, s.k) : smin(d, e, s.k); } return d; };
  const gx1 = bx + 1, gy1 = by + 1, G = new Float32Array(gx1 * gy1 * (bz + 1));
  for (let k = 0, q = 0; k <= bz; k++) for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++, q++) G[q] = all(lo[0] + i * bs, lo[1] + j * bs, lo[2] + k * bs);
  // each block: the shapes that reach it, then every grid point measured (near a surface) or filled in (far)
  const lists = new Array(bx * by * bz), F = new Float32Array(nx * ny * nz), nearB = [];
  for (let k = 0, q = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++, q++) {
    const x0 = lo[0] + i * bs, y0 = lo[1] + j * bs, z0 = lo[2] + k * bs; let l = NONE;
    for (let n = 0; n < solid.length; n++) {
      const s = solid[n]; let ax0 = x0, ax1 = x0 + bs;
      if (s.mirror) { if (ax0 < 0 && ax1 > 0) { ax1 = mx(-ax0, ax1); ax0 = 0; } else if (ax1 <= 0) { const t = -ax1; ax1 = -ax0; ax0 = t; } }
      const a = mx(s.bl[0] - ax1, ax0 - s.bh[0], 0), b = mx(s.bl[1] - y0 - bs, y0 - s.bh[1], 0), c = mx(s.bl[2] - z0 - bs, z0 - s.bh[2], 0), t = thr + s.k;
      if (a * a + b * b + c * c < t * t) { if (l === NONE) l = []; l.push(s); }
    }
    lists[q] = l;
    const mid = l.length ? measure0(l, x0 + bs / 2, y0 + bs / 2, z0 + bs / 2) : 1e3, far = abs(mid) > skip;
    const ie = i === bx - 1 ? B : B - 1, je = j === by - 1 ? B : B - 1, ke = k === bz - 1 ? B : B - 1;
    if (!far) { nearB.push(i, j, k); for (let c = 0; c <= ke; c++) for (let b = 0; b <= je; b++) { let at = i * B + nx * (j * B + b + ny * (k * B + c)); for (let a = 0; a <= ie; a++, at++) F[at] = measure0(l, x0 + a * cell, y0 + b * cell, z0 + c * cell); } }
    else {
      const g = i + gx1 * (j + gy1 * k), g0 = G[g], g1 = G[g + 1], g2 = G[g + gx1], g3 = G[g + gx1 + 1], h = g + gx1 * gy1, g4 = G[h], g5 = G[h + 1], g6 = G[h + gx1], g7 = G[h + gx1 + 1];
      for (let c = 0; c <= ke; c++) { const w = c / B; for (let b = 0; b <= je; b++) { const v = b / B, p0 = g0 + (g2 - g0) * v + (g4 - g0 + (g6 - g4 - g2 + g0) * v) * w, p1 = g1 + (g3 - g1) * v + (g5 - g1 + (g7 - g5 - g3 + g1) * v) * w; let at = i * B + nx * (j * B + b + ny * (k * B + c)); for (let a = 0; a <= ie; a++, at++) F[at] = p0 + (p1 - p0) * a / B; } }
    }
  }
  const t1 = now();
  let { P, Q, I, n } = nets(F, nx, ny, nz, nearB, B, lo, cell); const ni = I.length;
  const t2 = now();
  // ---- whose surface each point is: the nearest shape's (a carved wall belongs to its carver only if it names a slot)
  const listAt = (x, y, z) => lists[cl(((x - lo[0]) / bs) | 0, 0, bx - 1) + bx * (cl(((y - lo[1]) / bs) | 0, 0, by - 1) + by * cl(((z - lo[2]) / bs) | 0, 0, bz - 1))];
  // (the shape the surface would move furthest without: melted shapes float a little off each of their own
  // surfaces, so "the nearest" would hand a brow or a lip a wide rim of the skin around it. Measured with the
  // bands and patches left out: beside a pocket's edge the surface is the pocket's own, so it would move without
  // none of the others, and the least nudge decided it: trousers a centimetre under a tunic's skirt took its pockets' edges)
  let own = new Int16Array(n), press = wob ? new Float32Array(n) : null; const E = new Float64Array(64);
  // A band or a patch (a belt, a pocket, a strap) owns what lies inside its outline where the surface is its
  // own; where two lie over each other, the one that stands proudest.
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], l = listAt(x, y, z), m = mn(l.length, 64); let d = 1e9, live = 0, last = -1, dec = -1, top = -1;
    for (let j = 0; j < m; j++) {
      const s = l[j], e = E[j] = boxGap(s, x, y, z) > s.k + .012 ? 1e3 : s.d0(x, y, z);
      if (s.m) { if (abs(e) < s.k + .004 && s.out >= top && s.m(x, y, z) < 0) { top = s.out; dec = j; } continue; }
      d = s.cut ? smax(d, -e, s.k) : smin(d, e, s.k);
      if (abs(e) < s.k + .012 && !(s.cut && s.slot == null)) { live++; last = j; }
    }
    let bj = dec >= 0 ? dec : last;
    if (dec < 0 && live > 1) {
      let best = -1;
      for (let c = 0; c < m; c++) {
        const sc = l[c]; if (sc.m || abs(E[c]) >= sc.k + .012 || (sc.cut && sc.slot == null)) continue;
        let r = 1e9; for (let j = 0; j < m; j++) { const s = l[j], e = E[j]; if (j === c || s.m) continue; r = s.cut ? smax(r, -e, s.k) : smin(r, e, s.k); }
        const v = abs(r - d); if (v > best) { best = v; bj = c; }
      }
    }
    const o = bj < 0 ? null : l[bj]; own[i] = o ? o.i : -1;
    for (let j = 0; j < paints.length; j++) { const s = paints[j]; if (boxGap(s, x, y, z) === 0 && s.d(x, y, z) < 0 && (!s.src.over || (o && o.slot === s.src.over))) own[i] = s.i; }
    if (press && o && o.wob) press[i] = (E[bj] - o.d(x, y, z)) / o.wob;   // how far its lumps and folds will move it (-1..1)
  }
  // ---- lines on the surface (seams, rows of stitching): where one passes between two points, the nearer is slid along the surface onto it
  // (before the outlines: where a line meets the edge of a pocket or a belt, that edge wins)
  // (a shape's own row of stitching is on that shape only, inside its outline; other lines on the surfaces of the slots they name, never over a
  // pocket or a strap)
  const lineOn = (L, o) => o >= 0 && (L.own >= 0 ? o === L.own : !S[o].m && S[o].src.seams !== false && (!L.slots || L.slots.includes(S[o].slot)));
  if (LN.length) {
    const M = new Float32Array(n), best = new Float32Array(n).fill(1), to = new Int16Array(n).fill(-1);
    for (let li = 0; li < LN.length; li++) {
      const L = LN[li]; for (let i = 0; i < n; i++) M[i] = lineOn(L, own[i]) ? L.m(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) : OFF;
      for (let t = 0; t < ni; t += 3) for (let e = 0; e < 3; e++) {
        const a = I[t + e], b = I[t + (e + 1) % 3], ma = M[a], mb = M[b]; if (abs(ma) >= OFF * .5 || abs(mb) >= OFF * .5 || (ma < 0) === (mb < 0)) continue;
        const v = abs(ma) <= abs(mb) ? a : b, mv = abs(M[v]); if (mv < cell * .75 && mv < best[v] && L.inside(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])) { best[v] = mv; to[v] = li; }
      }
    }
    const hh = cell * .5;
    for (let i = 0; i < n; i++) {
      if (to[i] < 0) continue; const m = LN[to[i]].m, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], m0 = m(x, y, z);
      let gx = (m(x + hh, y, z) - m(x - hh, y, z)) * ic, gy = (m(x, y + hh, z) - m(x, y - hh, z)) * ic, gz = (m(x, y, z + hh) - m(x, y, z - hh)) * ic;
      const qd = gx * Q[i * 3] + gy * Q[i * 3 + 1] + gz * Q[i * 3 + 2]; gx -= qd * Q[i * 3]; gy -= qd * Q[i * 3 + 1]; gz -= qd * Q[i * 3 + 2];
      const g2 = gx * gx + gy * gy + gz * gz; if (g2 < .1 || g2 > 50) continue;
      const st = -m0 / g2; P[i * 3] = x + gx * st; P[i * 3 + 1] = y + gy * st; P[i * 3 + 2] = z + gz * st;
    }
  }
  let ride = null;   // whose bones each point goes with, where that is not its own shape's (see below)
  // ---- the outlines of pockets, straps, belts and cuffs made straight: a point beside one is slid along the surface onto it
  // (points sit a cell apart, so an outline drawn by "which side is each point on" would be a saw's edge)
  if (S.some(s => s.m && !s.ghost)) {
    const cand = new Int16Array(n).fill(-1), hh = cell * .5, rank = o => o < 0 || !S[o].m ? -1 : S[o].out;
    for (let t = 0; t < ni; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2], oa = own[a], ob = own[b], oc = own[c]; if (oa === ob && ob === oc) continue;
      let o = oa, r = rank(oa); if (rank(ob) > r) { o = ob; r = rank(ob); } if (rank(oc) > r) { o = oc; r = rank(oc); }   // the proudest one's outline is the line between them
      if (r >= 0) { if (rank(cand[a]) < r) cand[a] = o; if (rank(cand[b]) < r) cand[b] = o; if (rank(cand[c]) < r) cand[c] = o; }
    }
    for (let i = 0; i < n; i++) {
      const o = cand[i]; if (o < 0) continue; const m = S[o].m, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], m0 = m(x, y, z); if (abs(m0) > cell * .75) continue;
      let gx = (m(x + hh, y, z) - m(x - hh, y, z)) * ic, gy = (m(x, y + hh, z) - m(x, y - hh, z)) * ic, gz = (m(x, y, z + hh) - m(x, y, z - hh)) * ic;
      const qd = gx * Q[i * 3] + gy * Q[i * 3 + 1] + gz * Q[i * 3 + 2]; gx -= qd * Q[i * 3]; gy -= qd * Q[i * 3 + 1]; gz -= qd * Q[i * 3 + 2];
      const g2 = gx * gx + gy * gy + gz * gz; if (g2 < .2 || g2 > 5) continue;
      const st = -m0 / g2; P[i * 3] = x + gx * st; P[i * 3 + 1] = y + gy * st; P[i * 3 + 2] = z + gz * st; own[i] = o;
    }
    // ... and the line kept sharp: a triangle outside an outline gets points of its own along it (in the same
    // place, but its own side's), so a strap's colour stops dead at its edge instead of fading across a triangle
    const twin = new Map(), add = [];
    for (let t = 0; t < ni; t += 3) {
      const oa = own[I[t]], ob = own[I[t + 1]], oc = own[I[t + 2]]; if (oa === ob && ob === oc) continue;
      let o = oa, r = rank(oa); if (rank(ob) < r) { o = ob; r = rank(ob); } if (rank(oc) < r) o = oc;   // the triangle is the lowest one's (what lies under, or the cloth)
      for (let e = 0; e < 3; e++) {
        const v = I[t + e], ov = own[v]; if (ov === o || ov < 0 || !S[ov].m) continue;
        const key = v * 1024 + (o + 1); let w = twin.get(key); if (w === undefined) { w = n + add.length / 2; add.push(v, o); twin.set(key, w); }
        I[t + e] = w;
      }
    }
    if (add.length) {
      const m = n + add.length / 2, P2 = new Float32Array(m * 3), Q2 = new Float32Array(m * 3), o2 = new Int16Array(m); P2.set(P.subarray(0, n * 3)); Q2.set(Q.subarray(0, n * 3)); o2.set(own);
      for (let i = 0; i < add.length; i += 2) { const j = n + i / 2, v = add[i]; for (let c = 0; c < 3; c++) { P2[j * 3 + c] = P[v * 3 + c]; Q2[j * 3 + c] = Q[v * 3 + c]; } o2[j] = add[i + 1]; }
      // (each goes with the bones of the point it was split from: the two sides of a seam move as one, or a hem would open when a joint bends)
      ride = new Int16Array(m); ride.set(own); for (let i = 0; i < add.length; i += 2) ride[n + i / 2] = own[add[i]];
      if (press) { const p2 = new Float32Array(m); p2.set(press); for (let i = 0; i < add.length; i += 2) p2[n + i / 2] = press[add[i]]; press = p2; }
      P = P2; Q = Q2; own = o2; n = m;
    }
  }
  const t2b = now();
  // ---- thinned first (edges between slots and the folds to come are kept), so the fine work is only done for the points that stay
  if (keep < 1 && canThin && ni > 36) {
    // (a point on a line is kept as an edge between slots is: the line stays where it is, however long the triangles along it)
    const W = LN.length ? 8 : 7, A = new Float32Array(n * W), ids = [];
    for (let i = 0; i < n; i++) {
      const sl = own[i] < 0 ? '' : S[own[i]].slot ?? ''; let k = ids.indexOf(sl); if (k < 0) k = ids.push(sl) - 1;
      A[i * W] = Q[i * 3]; A[i * W + 1] = Q[i * 3 + 1]; A[i * W + 2] = Q[i * 3 + 2]; A[i * W + 3] = ((k * 53) % 7) / 6; A[i * W + 4] = ((k * 29) % 5) / 4; A[i * W + 5] = ((k * 17) % 3) / 2; A[i * W + 6] = press ? press[i] : 0;
      if (W > 7) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; for (const L of LN) if (lineOn(L, own[i]) && abs(L.m(x, y, z)) < cell * .05 && L.inside(x, y, z)) { A[i * W + 7] = 1; break; } }
    }
    const J = thinBy(I, P, A, W, W > 7 ? [.5, .5, .5, .8, .8, .8, .35, .6] : [.5, .5, .5, .8, .8, .8, .35], keep, error), map = new Int32Array(n).fill(-1); let k = 0;
    for (let i = 0; i < J.length; i++) if (map[J[i]] < 0) map[J[i]] = k++;
    const P2 = new Float32Array(k * 3), Q2 = new Float32Array(k * 3), o2 = new Int16Array(k), r2 = ride && new Int16Array(k), I2 = new Uint32Array(J.length);
    for (let i = 0; i < n; i++) { const j = map[i]; if (j >= 0) { for (let c = 0; c < 3; c++) { P2[j * 3 + c] = P[i * 3 + c]; Q2[j * 3 + c] = Q[i * 3 + c]; } o2[j] = own[i]; if (ride) r2[j] = ride[i]; } }
    for (let i = 0; i < J.length; i++) I2[i] = map[J[i]];
    P = P2; Q = Q2; own = o2; ride = r2; I = I2; n = k;
  } else if (P.buffer.byteLength > n * 12) P = P.slice();
  const t3 = now();
  // ---- true normals (the field's own slope, at four corners of a tetrahedron) and crease shading for the points that stay
  const N = new Float32Array(n * 3), AO = new Float32Array(n).fill(1), h = cell * .5, mxx = nx - 1.001, mxy = ny - 1.001, mxz = nz - 1.001;
  const sample = (x, y, z) => {   // the measured grid, read between its points
    const fx = (x - lo[0]) * ic, fy = (y - lo[1]) * ic, fz = (z - lo[2]) * ic; if (fx < 0 || fy < 0 || fz < 0 || fx > mxx || fy > mxy || fz > mxz) return 1e3;
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, p = i + nx * (j + ny * k), q = p + nxy;
    const a = F[p] + (F[p + 1] - F[p]) * u, b = F[p + nx] + (F[p + nx + 1] - F[p + nx]) * u, c = F[q] + (F[q + 1] - F[q]) * u, e = F[q + nx] + (F[q + nx + 1] - F[q + nx]) * u, l0 = a + (b - a) * v;
    return l0 + (c + (e - c) * v - l0) * (fz - k);
  };
  for (let i = 0; i < n; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; const l = listAt(x, y, z);
    // pressed onto the true surface (lumps, folds and all): a step along the quick normal, then one along the true one
    { const f = cl(measure(l, x, y, z), -.015, .015); x -= f * Q[i * 3]; y -= f * Q[i * 3 + 1]; z -= f * Q[i * 3 + 2]; }
    const a = measure(l, x + h, y - h, z - h), b = measure(l, x - h, y - h, z + h), c = measure(l, x - h, y + h, z - h), e = measure(l, x + h, y + h, z + h);
    let gx = a - b - c + e, gy = -a - b + c + e, gz = -a + b - c + e; const gl = sqrt(gx * gx + gy * gy + gz * gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    if (gx * Q[i * 3] + gy * Q[i * 3 + 1] + gz * Q[i * 3 + 2] > .2) { const f = cl((a + b + c + e) * .25, -.004, .004); x -= f * gx; y -= f * gy; z -= f * gz; }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; N[i * 3] = gx; N[i * 3 + 1] = gy; N[i * 3 + 2] = gz;
    if (ao) {   // how much stands over this point, a few steps out along its normal (ghosts measured as they are)
      let occ = 0, w = 1, tot = 0;
      for (let s = 0; s < 5; s++) {
        const r = reach * (.06 + .235 * s), px = x + gx * r, py = y + gy * r, pz = z + gz * r; let v = sample(px, py, pz);
        for (let g = 0; g < ghosts.length; g++) { const G0 = ghosts[g]; if (boxGap(G0, px, py, pz) < v) v = mn(v, G0.d(px, py, pz)); }
        occ += mx(0, r - v) / r * w; tot += w; w *= .8;
      }
      AO[i] = 1 - cl(occ / tot);
    }
  }
  // ---- for each point: how far along the surface it is from the nearest line, how far along that, and its kind
  let line = null;
  if (LN.length) {
    line = new Float32Array(n * 3); const q = cell * .25, iq = 1 / (2 * q);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2]; let bd = OFF, bl = -1;
      for (let li = 0; li < LN.length; li++) {
        const L = LN[li]; if (!lineOn(L, own[i])) continue; const m0 = L.m(x, y, z); if (abs(m0) >= FAR) continue;
        if (abs(m0) > REACH * 1.25) { if (abs(m0) < bd) { bd = abs(m0); bl = li; } continue; }   // (plain cloth: near enough)
        // (measured across the surface: the line's measure over how steeply it rises along the surface)
        let gx = (L.m(x + q, y, z) - L.m(x - q, y, z)) * iq, gy = (L.m(x, y + q, z) - L.m(x, y - q, z)) * iq, gz = (L.m(x, y, z + q) - L.m(x, y, z - q)) * iq;
        if (abs(gx) > 1e2 || abs(gy) > 1e2 || abs(gz) > 1e2) continue;   // (at the edge of its box)
        const gd = gx * nx + gy * ny + gz * nz; gx -= gd * nx; gy -= gd * ny; gz -= gd * nz;
        const d = abs(m0) / mx(.3, sqrt(gx * gx + gy * gy + gz * gz)); if (d < bd) { bd = d; bl = li; }
      }
      // (d: how far from the line; beyond REACH, or past the end of the line's box, it is plain cloth that only counts its stitches)
      if (bl >= 0 && bd < FAR) { const L = LN[bl]; line[i * 3] = bd < REACH && L.inside(x, y, z) ? bd : 1; line[i * 3 + 1] = L.along(x, y, z); line[i * 3 + 2] = L.kind; }
      else line[i * 3] = OFF;
    }
  }
  return { P, N, I, own, ride: ride || own, ao: AO, n, shapes: S, at: sample, line, ms: [t1 - t0, t2 - t1, t2b - t2, t3 - t2b, now() - t3] };
}

/**
 * How thick the solid is behind a point of its surface (metres, `far` at most), for light that comes through thin
 * flesh (an ear): how far straight in until it comes out the other side. It only counts if it comes out into the
 * open, with `clear` metres of nothing beyond (the foot of an ear has the skull just behind it: no light gets round
 * there). A way in that never comes out (in from the rim of a sheet, along the sheet) is as thick as twice the
 * deepest it got: the rim of a sheet reads as thin as the sheet, a square edge as solid as what it is the edge of.
 * at(x, y, z): the solid's measure (under 0 inside; mesh() gives its own back as `at`); nx, ny, nz: the point's
 * normal; step: how far apart the measure is read (about a cell). Returns out: [how thick, how far it is open
 * beyond where the way in came out (metres, `look` at most; 0 where it never came out)].
 */
export function thickness(at, x, y, z, nx, ny, nz, step = .0015, far = .016, clear = .004, look = .08, out = [0, 0]) {
  // (it counts from where it is first inside: a read right at the surface can fall either side of it)
  let s = step, v0 = at(x - nx * s, y - ny * s, z - nz * s), inside = v0 < 0, deep = inside ? -v0 : 0;
  for (;;) {
    const s1 = s + step; if (s1 > far) break; const v1 = at(x - nx * s1, y - ny * s1, z - nz * s1);
    if (inside && v1 >= 0) {
      const t = s + step * v0 / (v0 - v1); let q = s1 + step; while (q < t + look && at(x - nx * q, y - ny * q, z - nz * q) >= 0) q += step;
      const open = mn(look, q - step - t); out[0] = open < clear ? far : t; out[1] = mx(0, open); return out;
    }
    if (v1 < 0) { inside = true; if (-v1 > deep) deep = -v1; }
    s = s1; v0 = v1;
  }
  out[0] = mn(far, 2 * deep); out[1] = 0; return out;
}

/** Resolves once thin() can work (the simplifier's wasm; the app waits for it while the 3D parts load). */
export const thinReady = MeshoptSimplifier.ready.then(() => true, () => false);
let canThin = false; thinReady.then(ok => { canThin = ok; });
/**
 * Fewer triangles for the same shape (meshoptimizer), keeping what you see: I (triangles) over points P
 * with normals N and colours C (each 3 per point). keep: the share of triangles to aim for; error: how
 * far the surface may move, in metres. Returns the new triangles (the points stay).
 */
export function thin(I, P, N, C, keep = .5, error = .002, lock = null) {
  if (!canThin || keep >= 1) return I;
  const n = P.length / 3, A = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { A[i * 6] = N[i * 3]; A[i * 6 + 1] = N[i * 3 + 1]; A[i * 6 + 2] = N[i * 3 + 2]; A[i * 6 + 3] = C[i * 3]; A[i * 6 + 4] = C[i * 3 + 1]; A[i * 6 + 5] = C[i * 3 + 2]; }
  return thinBy(I, P, A, 6, [.5, .5, .5, .8, .8, .8], keep, error, lock);
}
// the same with any values per point (A, `per` of them each, weighed by `weights`)
function thinBy(I, P, A, per, weights, keep, error, lock = null) {
  try {
    const target = mx(3, Math.floor(I.length * keep / 3) * 3);
    const [out] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, A, per, weights, lock, target, error, ['ErrorAbsolute']);
    return out;
  } catch (e) { return I; }
}

/** This file's workings as text (a saved sculpt made by an older version is thrown away: see human-shapes.js). */
export const stamp = () => [mesh, ready, nets, thinBy, thickness, Loft, ...Object.values(KINDS)].map(String).join('');
