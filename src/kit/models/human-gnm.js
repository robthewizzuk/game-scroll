// Real faces from GNM Head (Google, Apache 2.0: github.com/google/GNM), a model of the human head learned from a large set of 3D scans:
// a face of look 'real' with f.gnm takes its whole shape from one of its heads (the skull, the brow, the eyes' sockets and lids, the nose,
// the lips, the chin, the ears), melted into our own neck, hair and hats in the sculpting as one more distance field (field.js), so
// everything built on the head's mesh (its paint, its folds, its live face, its bones, its hair) works on it as on any head.
// The numbers (scripts/face-lab/gnm-pack.py): human-gnm-marks.js, small, says where a head of each sex and background lies among the 32
// ways heads differ most, and gives the outlines a face is built along (the eyes' openings and middles, where the lips meet, their red,
// the wings of the nose); human-gnm-data.js, 2.9 MB, the whole skin, is loaded only to sculpt one (gnmReady()).
import { K, STEPS, CLASSES, MARKS, P0, PW, HASH } from './human-gnm-marks.js';
export { HASH as GNM_HASH };
const sqrt = Math.sqrt, mn = Math.min, mx = Math.max, abs = Math.abs, fl = Math.floor;

// the nearest point of triangle abc to p (Ericson), into out [x, y, z, which part: 0 its face, 1 ab, 2 bc, 3 ca, 4 a, 5 b, 6 c]
function closest(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; out[3] = 4; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; out[3] = 5; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; out[3] = 1; return; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; out[3] = 6; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; out[3] = 3; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); out[3] = 2; return; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w; out[3] = 0;
}

/**
 * A closed triangle mesh (V: flat positions, I: triangles wound outwards) as a distance field: exact on a fine grid within `band` of its
 * surface, a coarse grid further out (each node the distance to the nearest surface point any of its neighbours knew of; its side, that
 * of the region of such nodes it is in), and outside
 * the mesh's box grown by `pad`, the distance to that box. The sign: which side of the nearest part of the surface a point is (its face,
 * edge or corner, by its normal weighted by angle, which is right however sharp a fold is). keep(x, y, z): only the triangles with a
 * corner it keeps. Returns { d(x, y, z), lo, hi }.
 */
export function meshField(V, I, { cell = .001, band = .002, coarse = .004, pad = .03, keep = null } = {}) {
  const nv = V.length / 3; let nt = I.length / 3;
  if (keep) { const J = []; for (let t = 0; t < nt; t++) { const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]; if (keep(V[a * 3], V[a * 3 + 1], V[a * 3 + 2]) || keep(V[b * 3], V[b * 3 + 1], V[b * 3 + 2]) || keep(V[c * 3], V[c * 3 + 1], V[c * 3 + 2])) J.push(a, b, c); } I = J; nt = J.length / 3; }
  const FN = new Float64Array(nt * 3), VN = new Float64Array(nv * 3), EN = new Map(), ek = (a, b) => a < b ? a * nv + b : b * nv + a, TE = new Float64Array(nt * 9);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ux = V[b * 3] - V[a * 3], uy = V[b * 3 + 1] - V[a * 3 + 1], uz = V[b * 3 + 2] - V[a * 3 + 2], vx = V[c * 3] - V[a * 3], vy = V[c * 3 + 1] - V[a * 3 + 1], vz = V[c * 3 + 2] - V[a * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
    FN[t * 3] = nx; FN[t * 3 + 1] = ny; FN[t * 3 + 2] = nz;
    const vs = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const p = vs[k], q = vs[(k + 1) % 3], r = vs[(k + 2) % 3];
      for (let e = 0; e < 3; e++) { lo[e] = mn(lo[e], V[p * 3 + e]); hi[e] = mx(hi[e], V[p * 3 + e]); }
      const e1x = V[q * 3] - V[p * 3], e1y = V[q * 3 + 1] - V[p * 3 + 1], e1z = V[q * 3 + 2] - V[p * 3 + 2], e2x = V[r * 3] - V[p * 3], e2y = V[r * 3 + 1] - V[p * 3 + 1], e2z = V[r * 3 + 2] - V[p * 3 + 2];
      const ang = Math.acos(mx(-1, mn(1, (e1x * e2x + e1y * e2y + e1z * e2z) / (sqrt(e1x * e1x + e1y * e1y + e1z * e1z) * sqrt(e2x * e2x + e2y * e2y + e2z * e2z) || 1))));
      VN[p * 3] += ang * nx; VN[p * 3 + 1] += ang * ny; VN[p * 3 + 2] += ang * nz;
      const key = ek(p, q), en = EN.get(key); if (en) { en[0] += nx; en[1] += ny; en[2] += nz; } else EN.set(key, [nx, ny, nz]);
    }
  }
  for (let a = 0; a < 3; a++) { lo[a] -= pad; hi[a] += pad; }
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const e = EN.get(ek(I[t * 3 + k], I[t * 3 + (k + 1) % 3])); TE[t * 9 + k * 3] = e[0]; TE[t * 9 + k * 3 + 1] = e[1]; TE[t * 9 + k * 3 + 2] = e[2]; }   // (each triangle's edges' normals: ab, bc, ca)
  const out = [0, 0, 0, 0];
  const sd = (t, px, py, pz) => {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    closest(px, py, pz, V[a * 3], V[a * 3 + 1], V[a * 3 + 2], V[b * 3], V[b * 3 + 1], V[b * 3 + 2], V[c * 3], V[c * 3 + 1], V[c * 3 + 2], out);
    const dx = px - out[0], dy = py - out[1], dz = pz - out[2], d = sqrt(dx * dx + dy * dy + dz * dz), f = out[3];
    let nx, ny, nz;
    if (f === 0) { nx = FN[t * 3]; ny = FN[t * 3 + 1]; nz = FN[t * 3 + 2]; }
    else if (f <= 3) { const e = t * 9 + (f - 1) * 3; nx = TE[e]; ny = TE[e + 1]; nz = TE[e + 2]; }
    else { const v = f === 4 ? a : f === 5 ? b : c; nx = VN[v * 3]; ny = VN[v * 3 + 1]; nz = VN[v * 3 + 2]; }
    return dx * nx + dy * ny + dz * nz < 0 ? -d : d;
  };
  const ib = [0, 0, 0], ie = [0, 0, 0];
  const span = (t, g, n, r) => { for (let a = 0; a < 3; a++) { const v0 = V[I[t * 3] * 3 + a], v1 = V[I[t * 3 + 1] * 3 + a], v2 = V[I[t * 3 + 2] * 3 + a]; ib[a] = mx(0, Math.ceil((mn(v0, v1, v2) - r - lo[a]) / g)); ie[a] = mn(n[a] - 1, fl((mx(v0, v1, v2) + r - lo[a]) / g)); } };
  // ---- the coarse grid
  const C = coarse, cn = [0, 1, 2].map(a => Math.ceil((hi[a] - lo[a]) / C) + 1), [cx, cy, cz] = cn, cxy = cx * cy, NC = cxy * cz;
  const CD = new Float32Array(NC).fill(1e9), CP = new Float32Array(NC * 3), CS = new Int8Array(NC);
  for (let t = 0; t < nt; t++) {
    span(t, C, cn, 1.5 * C);
    for (let k = ib[2]; k <= ie[2]; k++) for (let j = ib[1]; j <= ie[1]; j++) for (let i = ib[0]; i <= ie[0]; i++) {
      const q = i + cx * j + cxy * k, d = sd(t, lo[0] + i * C, lo[1] + j * C, lo[2] + k * C);
      if (abs(d) < CD[q]) { CD[q] = abs(d); CS[q] = d < 0 ? -1 : 1; CP[q * 3] = out[0]; CP[q * 3 + 1] = out[1]; CP[q * 3 + 2] = out[2]; }
    }
  }
  // (which side the nodes further out are on: each region of them that the near ones wall off is outside if it reaches the edge of the grid,
  // else on the side most of the near nodes round it are. Handed on from node to node with the distances, a side went wrong where the
  // surface folds, as round an ear: a pocket of 'inside' stood out of the neck, and a bubble of 'outside' stood in the mouth)
  { const Q = new Int32Array(NC), seen = new Uint8Array(NC);
    for (let q0 = 0; q0 < NC; q0++) {
      if (seen[q0] || CD[q0] < 1e8) continue;
      let head = 0, tail = 0, edge = false, vote = 0; Q[tail++] = q0; seen[q0] = 1;
      while (head < tail) {
        const q = Q[head++], i = q % cx, j = ((q - i) / cx) % cy, k = (q - i - cx * j) / cxy;
        if (!i || !j || !k || i === cx - 1 || j === cy - 1 || k === cz - 1) edge = true;
        for (let o = 0; o < 6; o++) {
          const a = i + (o === 0) - (o === 1), b = j + (o === 2) - (o === 3), c = k + (o === 4) - (o === 5); if (a < 0 || b < 0 || c < 0 || a >= cx || b >= cy || c >= cz) continue;
          const r = a + cx * b + cxy * c; if (CD[r] < 1e8) { vote += CS[r]; continue; }
          if (!seen[r]) { seen[r] = 1; Q[tail++] = r; }
        }
      }
      const s = edge || vote >= 0 ? 1 : -1; for (let n = 0; n < tail; n++) CS[Q[n]] = s;
    }
  }
  // (carried outwards in a sweep over the grid forwards, from the 13 neighbours already passed, then one backwards)
  const OFF = []; for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (k < 0 || (k === 0 && (j < 0 || (j === 0 && i < 0)))) OFF.push(i, j, k);
  for (let pass = 0; pass < 2; pass++) {
    const s = pass % 2 ? -1 : 1;
    for (let k0 = 0; k0 < cz; k0++) { const k = s > 0 ? k0 : cz - 1 - k0, pz = lo[2] + k * C;
      for (let j0 = 0; j0 < cy; j0++) { const j = s > 0 ? j0 : cy - 1 - j0, py = lo[1] + j * C;
        for (let i0 = 0; i0 < cx; i0++) {
          const i = s > 0 ? i0 : cx - 1 - i0, q = i + cx * j + cxy * k, px = lo[0] + i * C; let best = CD[q], from = -1;
          for (let o = 0; o < 39; o += 3) {
            const a = i + s * OFF[o], b = j + s * OFF[o + 1], c = k + s * OFF[o + 2]; if (a < 0 || b < 0 || c < 0 || a >= cx || b >= cy || c >= cz) continue;
            const r = a + cx * b + cxy * c; if (CD[r] >= 1e8) continue;
            const dx = px - CP[r * 3], dy = py - CP[r * 3 + 1], dz = pz - CP[r * 3 + 2], d = dx * dx + dy * dy + dz * dz;
            if (d < best * best - 1e-12) { best = sqrt(d); from = r; }
          }
          if (from >= 0) { CD[q] = best; CP[q * 3] = CP[from * 3]; CP[q * 3 + 1] = CP[from * 3 + 1]; CP[q * 3 + 2] = CP[from * 3 + 2]; }
        }
      }
    }
  }
  const CG = new Float32Array(NC); for (let q = 0; q < NC; q++) CG[q] = CD[q] * CS[q];
  // ---- the fine grid: in bricks of 8 nodes a side, only near the surface
  const h = cell, fn = [0, 1, 2].map(a => Math.ceil((hi[a] - lo[a]) / h) + 1), bn = fn.map(n => Math.ceil(n / 8));
  const table = new Int32Array(bn[0] * bn[1] * bn[2]).fill(-1); let pool = new Float32Array(512 * 2048).fill(1e9), used = 0;
  for (let t = 0; t < nt; t++) {
    span(t, h, fn, band);
    const a0 = I[t * 3] * 3, nx = FN[t * 3], ny = FN[t * 3 + 1], nz = FN[t * 3 + 2];
    for (let k = ib[2]; k <= ie[2]; k++) for (let j = ib[1]; j <= ie[1]; j++) {
      const py = lo[1] + j * h, pz = lo[2] + k * h, rest = (py - V[a0 + 1]) * ny + (pz - V[a0 + 2]) * nz;
      for (let i = ib[0]; i <= ie[0]; i++) {
        const px = lo[0] + i * h, pl = (px - V[a0]) * nx + rest; if (pl > band || pl < -band) continue;   // (only nodes near its plane)
        const d = sd(t, px, py, pz); if (d > band || d < -band) continue;
        const b = (i >> 3) + bn[0] * ((j >> 3) + bn[1] * (k >> 3)); let s = table[b];
        if (s < 0) { if ((used + 1) * 512 > pool.length) { const np = new Float32Array(pool.length * 2).fill(1e9); np.set(pool); pool = np; } s = table[b] = used++; }
        const at = s * 512 + (i & 7) + 8 * (j & 7) + 64 * (k & 7); if (abs(d) < abs(pool[at])) pool[at] = d;
      }
    }
  }
  const P = pool, T = table, b0 = bn[0], b1 = bn[1];
  const node = (i, j, k) => { const s = T[(i >> 3) + b0 * ((j >> 3) + b1 * (k >> 3))]; return s < 0 ? 1e9 : P[s * 512 + (i & 7) + 8 * (j & 7) + 64 * (k & 7)]; };
  const icd = 1 / C, ih = 1 / h, lim = band + C * 1.75;
  const d = (x, y, z) => {
    let fx = (x - lo[0]) * icd, fy = (y - lo[1]) * icd, fz = (z - lo[2]) * icd;
    if (fx < 0 || fy < 0 || fz < 0 || fx > cx - 1.001 || fy > cy - 1.001 || fz > cz - 1.001) {
      const ox = mx(lo[0] - x, 0, x - hi[0]), oy = mx(lo[1] - y, 0, y - hi[1]), oz = mx(lo[2] - z, 0, z - hi[2]); return sqrt(ox * ox + oy * oy + oz * oz) + pad * .9;
    }
    let i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k;
    const p = i + cx * j + cxy * k, q = p + cxy;
    const a = CG[p] + (CG[p + 1] - CG[p]) * u, b = CG[p + cx] + (CG[p + cx + 1] - CG[p + cx]) * u, c = CG[q] + (CG[q + 1] - CG[q]) * u, e = CG[q + cx] + (CG[q + cx + 1] - CG[q + cx]) * u, l0 = a + (b - a) * v;
    const cd = l0 + (c + (e - c) * v - l0) * w;
    if (cd > lim || cd < -lim) return cd;
    fx = (x - lo[0]) * ih; fy = (y - lo[1]) * ih; fz = (z - lo[2]) * ih; i = fx | 0; j = fy | 0; k = fz | 0; u = fx - i; v = fy - j; w = fz - k;
    const n0 = node(i, j, k), n1 = node(i + 1, j, k), n2 = node(i, j + 1, k), n3 = node(i + 1, j + 1, k), n4 = node(i, j, k + 1), n5 = node(i + 1, j, k + 1), n6 = node(i, j + 1, k + 1), n7 = node(i + 1, j + 1, k + 1);
    if (n0 > 1e8 || n1 > 1e8 || n2 > 1e8 || n3 > 1e8 || n4 > 1e8 || n5 > 1e8 || n6 > 1e8 || n7 > 1e8) return cd;
    const A = n0 + (n1 - n0) * u, B = n2 + (n3 - n2) * u, Cc = n4 + (n5 - n4) * u, E = n6 + (n7 - n6) * u, L = A + (B - A) * v;
    return L + (Cc + (E - Cc) * v - L) * w;
  };
  return { d, lo, hi };
}

// ================================================================= the numbers
const bytes = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
let CL = null, PM = null;
const classes = () => {
  if (CL) return CL; CL = {};
  for (const [name, [m, l]] of Object.entries(CLASSES)) { const L = new Float64Array(K * K); let q = 0; for (let r = 0; r < K; r++) for (let c = 0; c <= r; c++) L[r * K + c] = l[q++]; CL[name] = { m, L }; }
  return CL;
};
/** The kinds of head: 'f:' or 'm:' and a heritage (human-fit.js KIN). */
export const GNM_KINDS = Object.keys(CLASSES);
/**
 * A head of this sex (fem) and heritage (kin: { european: .7, african: .3 }; none: the middle of all four), drawn with rnd (a function
 * 0..1; none: the middle of its kind): where it lies among the ways heads differ (K numbers, a spread of 1 each overall).
 * vary: how far from the middle of its kind it may be drawn (1: as far as real heads are).
 */
export function gnmDraw(fem, kin = null, rnd = null, vary = .9) {
  const C = classes(), W = kin && Object.keys(kin).length ? kin : { european: .25, african: .25, 'east-asian': .25, 'middle-eastern': .25 };
  const z = new Float64Array(K);
  if (rnd) for (let i = 0; i < K; i += 2) { const u = Math.max(1e-9, rnd()), v = rnd(), r = Math.sqrt(-2 * Math.log(u)) * vary; z[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < K) z[i + 1] = r * Math.sin(2 * Math.PI * v); }
  const c = new Array(K).fill(0); let tot = 0;
  for (const [k, w] of Object.entries(W)) {
    const cl = C[(fem ? 'f:' : 'm:') + k]; if (!cl || !(w > 0)) continue; tot += w;
    for (let r = 0; r < K; r++) { let v = cl.m[r]; for (let q = 0; q <= r; q++) v += cl.L[r * K + q] * z[q]; c[r] += w * v; }
  }
  return c.map(v => Math.round(v / (tot || 1) * 1e3) / 1e3);
}

// ---- the outlines of a head c, in the head's own space (from the middle of the head, as human-head.js's EYE and MOUTH are), its eyes' middle at eyeAt
const pm = () => PM ||= new Int16Array(bytes(PW));
function marksOf(c) {
  const W = pm(), n = P0.length, P = Float64Array.from(P0);
  for (let k = 0; k < K; k++) { const ck = c[k] * STEPS[k]; if (!ck) continue; const o = k * n; for (let i = 0; i < n; i++) P[i] += ck * W[o + i]; }
  return P;
}
const lerp = (a, b, t) => a + (b - a) * t;
// (where an outline of points [x, y] crosses x = at: each crossing's y)
const crossings = (pts, at) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[0] - at) * (b[0] - at) <= 0 && a[0] !== b[0]) out.push(lerp(a[1], b[1], (at - a[0]) / (b[0] - a[0]))); } return out; };
const U = [0, .2, .4, .6, .8, .92, 1];   // (along half the mouth, from its middle to its corner)
/**
 * What the rest of a face needs of a GNM head c, with its eyes' middle at eyeAt ([0, y, z] from the middle of the head): both sides made
 * the same (the left's and the right's mirrored, averaged):
 *   eye: the middle of the left eyeball [x, y, z] (ours, life size: a little in front of GNM's, which is bigger);
 *   rim: the left eye's opening as two arcs (human-head.js eyeRim): the middle of the line between its corners (cx, cy: x, y from the middle
 *     of the head), half that line's length (w), its slope (ang, radians, the outer corner up), how far the upper lid's edge and the lower's
 *     stand off it at most (hu, hl);
 *   lip: half the mouth's width (half), and at U along that half from the middle, where the lips meet (line), the top of the upper lip's
 *     red (up) and the bottom of the lower's (dn), y from the middle of the head;
 *   nose: the outside of the left wing of the nose [x, y, z].
 */
export function gnmMarks(c, eyeAt) {
  const P = marksOf(c), M = MARKS, pt = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const eL = pt(M.eyes[0]), eR = pt(M.eyes[1]), mid = [(eL[0] + eR[0]) / 2, (eL[1] + eR[1]) / 2, (eL[2] + eR[2]) / 2];
  const at = p => [p[0] - mid[0] + eyeAt[0], p[1] - mid[1] + eyeAt[1], p[2] - mid[2] + eyeAt[2]];   // (into the head's space)
  const r5 = v => Math.round(v * 1e5) / 1e5, R5 = a => a.map(r5);
  const eye = [(eL[0] - eR[0]) / 2, eyeAt[1] + (eL[1] + eR[1]) / 2 - mid[1], eyeAt[2] + (eL[2] + eR[2]) / 2 - mid[2]];
  // the eye's opening: each side's outline seen from in front (the right one mirrored), its corners, then each lid's furthest from the line between them
  const rims = [M.eyeL.map(i => at(pt(i))), M.eyeR.map(i => { const p = at(pt(i)); return [-p[0], p[1], p[2]]; })].map(L => {
    let a = L[0], b = L[0]; for (const p of L) { if (p[0] < a[0]) a = p; if (p[0] > b[0]) b = p; }
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]), w = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    let hu = 0, hl = 0; for (const p of L) { const v = ca * (p[1] - cy) - sa * (p[0] - cx); hu = Math.max(hu, v); hl = Math.max(hl, -v); }
    return [cx, cy, w, ang, hu, hl];
  });
  const rv = rims[0].map((v, i) => (v + rims[1][i]) / 2), rim = { cx: r5(rv[0]), cy: r5(rv[1]), w: r5(rv[2]), ang: Math.round(rv[3] * 1e4) / 1e4, hu: r5(rv[4]), hl: r5(rv[5]) };
  // the mouth: its corners, where the lips meet (between the two edges of the slit the inner edges of the lips leave), their red
  const mouth = M.mouth.map(i => at(pt(i))), half = (Math.max(...mouth.map(p => p[0])) - Math.min(...mouth.map(p => p[0]))) / 2;
  const fold = L => { const o = []; for (const p of L) o.push([Math.abs(p[0]), p[1]]); return o.sort((a, b) => a[0] - b[0]); };
  const along = (L, x, pick) => { let best = null; for (let i = 0; i + 1 < L.length; i++) if (L[i][0] <= x && L[i + 1][0] >= x) { const y = lerp(L[i][1], L[i + 1][1], (x - L[i][0]) / (L[i + 1][0] - L[i][0] || 1)); best = best == null ? y : pick(best, y); } return best ?? L[x < L[0][0] ? 0 : L.length - 1][1]; };
  const up = fold(M.upper.map(i => at(pt(i)))), dn = fold(M.lower.map(i => at(pt(i)))), m2 = mouth.map(p => [p[0], p[1]]);
  const line = U.map(u => { const ys = [...crossings(m2, u * half * .999), ...crossings(m2, -u * half * .999)]; return ys.length ? ys.reduce((a, b) => a + b) / ys.length : mouth.reduce((a, p) => a + p[1], 0) / mouth.length; });
  const lip = { half: r5(half), line: R5(line), up: R5(U.map((u, i) => Math.max(line[i], along(up, u * half, Math.max)))), dn: R5(U.map((u, i) => Math.min(line[i], along(dn, u * half, Math.min)))) };
  // the wing of the nose: its outermost point (either side)
  let nose = null; for (const i of M.nose) { const p = at(pt(i)); p[0] = Math.abs(p[0]); if (!nose || p[0] > nose[0]) nose = p; }
  // (our eyeball is life size, GNM's a bigger ball: ours in front as far as GNM's front is, so the lids lie on it as they do on GNM's)
  eye[2] += .0145 - .0122;
  return { eye: R5(eye), rim, lip, nose: R5(nose) };
}

// ================================================================= the whole head
let DATA = null, loadP = null;
/** Loads the whole skin's numbers (once): a promise; true once they are in. */
export const gnmReady = () => DATA ? Promise.resolve(true) : loadP ||= import('./human-gnm-data.js').then(m => {
  const mean = new Int16Array(bytes(m.MEAN)), ways = new Int16Array(bytes(m.WAYS)), n3 = m.N * 3, P = new Float64Array(n3);
  for (let i = 0; i < n3; i++) P[i] = mean[i] * 1e-5 + m.MID[i % 3];
  DATA = { N: m.N, P, ways, steps: m.STEPS, tris: new Uint16Array(bytes(m.TRIS)), mouth: m.MOUTH, neck: m.NECK }; return true;
});
export const gnmLoaded = () => !!DATA;

const FIELDS = new Map();
/**
 * The GNM head of a face f (f.gnm: { c, ... } from gnmFace) as a shape for the sculpting: { d (x, y, z) => metres outside, lo, hi, cut } in
 * the person's space, its eyes' middle at at ([x, y, z]: where the head puts it); cut(x, y, z): how far above the line where our neck takes
 * over (from under the chin back to the nape). gnmReady() first.
 */
export function gnmHead(f, at) {
  if (!DATA) throw new Error('GNM heads not loaded (gnmReady)');
  const c = f.gnm.c, key = c.join() + ':' + at.join(); let G = FIELDS.get(key); if (G) return G;
  const { N, P: P0, ways, steps, tris, mouth, neck } = DATA, n3 = N * 3, V = new Float64Array(n3 + 3);
  V.set(P0); for (let k = 0; k < K; k++) { const ck = c[k] * steps[k]; if (!ck) continue; const o = k * n3; for (let i = 0; i < n3; i++) V[i] += ck * ways[o + i]; }
  // the mouth closed: each point of the lips' rows where they meet halfway to the point across from it (worked out from where they all
  // were, so each pair meets at the same place), so they meet in a crease; the two rows a tenth of a millimetre either side of it, the
  // upper over the lower, so the ladder of triangles across the slit between them faces out (the field wants a skin that never folds
  // through itself: GNM's lips run on into each other)
  const W = Float64Array.from(V);
  for (let q = 0; q < mouth.length; q += 5) { const v = mouth[q] * 3, a = mouth[q + 1] * 3, b = mouth[q + 2] * 3, t = mouth[q + 3]; for (let e = 0; e < 3; e++) V[v + e] = (W[v + e] + W[a + e] + (W[b + e] - W[a + e]) * t) / 2; V[v + 1] += mouth[q + 4] * 1e-4; }
  // its eyes' middles (with the outlines' numbers) where the head puts them
  const E = marksOf(c), eL = MARKS.eyes[0] * 3, eR = MARKS.eyes[1] * 3, tx = at[0] - (E[eL] + E[eR]) / 2, ty = at[1] - (E[eL + 1] + E[eR + 1]) / 2, tz = at[2] - (E[eL + 2] + E[eR + 2]) / 2;
  // the open end under the neck closed (a fan from the middle of it: the field wants a skin with no way through it, and the neck is cut off
  // well above it)
  for (const i of neck) for (let e = 0; e < 3; e++) V[n3 + e] += V[i * 3 + e] / neck.length;
  for (let i = 0; i < n3 + 3; i += 3) { V[i] += tx; V[i + 1] += ty; V[i + 2] += tz; }
  const I = new Uint32Array(tris.length + neck.length * 3); I.set(tris);
  for (let i = 0, o = tris.length; i < neck.length; i++, o += 3) { I[o] = neck[i]; I[o + 1] = neck[(i + 1) % neck.length]; I[o + 2] = N; }
  const cut = (x, y, z) => y - at[1] + .135 + .333 * (z - at[2]);
  const F = meshField(V, I);
  G = { d: F.d, lo: F.lo, hi: F.hi, cut };
  if (FIELDS.size > 4) FIELDS.delete(FIELDS.keys().next().value);
  FIELDS.set(key, G); return G;
}
