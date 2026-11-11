// The number work of gs.models.sculpt (sculpt.js): shapes in, a mesh's plain arrays out (positions,
// normals, uvs, colours, faces), with surface nets (the isosurface library). Nothing from the page,
// so it runs on the main thread and in a background worker (job-worker.js) alike.
// Kit use only.
import { Euler, Matrix4, Quaternion, Vector3, Color } from 'three';
import { surfaceNets } from 'isosurface';

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z), len2 = (x, y) => Math.sqrt(x * x + y * y);
// signed distance (negative inside) for each kind, in the shape's own space
const KINDS = {
  ball: (s, x, y, z) => len3(x, y, z) - s.ball,
  box: (s, x, y, z) => {
    const r = s.round || 0, qx = Math.abs(x) - s.box[0] / 2 + r, qy = Math.abs(y) - s.box[1] / 2 + r, qz = Math.abs(z) - s.box[2] / 2 + r;
    return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  },
  cylinder: (s, x, y, z) => {   // [radius, height], upright
    const r = s.round || 0, dx = len2(x, z) - s.cylinder[0] + r, dy = Math.abs(y) - s.cylinder[1] / 2 + r;
    return Math.min(Math.max(dx, dy), 0) + len2(Math.max(dx, 0), Math.max(dy, 0)) - r;
  },
  torus: (s, x, y, z) => len2(len2(x, z) - s.torus[0], y) - s.torus[1],   // [ring radius, tube radius], lying flat
  cone: (s, x, y, z) => {   // [base radius, height], point up, base at y = 0
    const [R, h] = s.cone, q = len2(x, z), k = h / len3(R, h, 0), side = (q * h + (y - h) * R) / len2(R, h);
    void k; return Math.max(side, -y, y - h);
  },
  capsule: (s, x, y, z) => {   // { capsule: [[x, y, z], [x, y, z]], r }: in the sculpt's space
    const [a, b] = s.capsule, bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2];
    const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz || 1)));
    return len3(px - bx * t, py - by * t, pz - bz * t) - (s.r ?? .1);
  },
};
const kindOf = s => Object.keys(KINDS).find(k => s[k] !== undefined);
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// how far each shape reaches (for the box the mesh is made in)
function reach(s) {
  const k = kindOf(s), sc = s.scale ? Math.max(...[].concat(s.scale)) : 1;
  if (k === 'capsule') return { c: s.capsule[0].map((v, i) => (v + s.capsule[1][i]) / 2), r: len3(...s.capsule[0].map((v, i) => v - s.capsule[1][i])) / 2 + (s.r ?? .1) };
  const r = k === 'ball' ? s.ball : k === 'box' ? len3(...s.box) / 2 : k === 'cylinder' ? len2(s.cylinder[0], s.cylinder[1] / 2) : k === 'torus' ? s.torus[0] + s.torus[1] : len2(s.cone[0], s.cone[1]);
  return { c: s.at || [0, 0, 0], r: r * sc + (k === 'cone' ? 0 : 0) };
}

// what the skipping test needs: the shape's middle, its reach before stretching, and how it's stretched
// (a stretched shape's distance is measured in its smallest stretch, so the bound is too). A cone's
// distance is only a bound itself, so it is never skipped.
function skipping(s) {
  const sc = s.scale === undefined ? [1] : [].concat(s.scale), sMin = Math.min(...sc), sMax = Math.max(...sc);
  if (kindOf(s) === 'cone') return { c: [0, 0, 0], r0: Infinity, sMin: 1, sMax: 1 };
  const { c, r } = reach(s); return { c, r0: r / sMax, sMin, sMax };
}

/** One shape ready to measure: its distance function with its place, turn and stretch worked in. */
function prepare(s, blend) {
  const k = kindOf(s); if (!k) throw new Error('gs.models.sculpt: a shape needs one of ' + Object.keys(KINDS).join(', '));
  const f = KINDS[k], at = k === 'capsule' ? [0, 0, 0] : s.at || [0, 0, 0], sc = s.scale === undefined ? [1, 1, 1] : [].concat(s.scale).length === 1 ? [s.scale, s.scale, s.scale] : s.scale;
  const inv = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...(s.rot || [0, 0, 0]))), new Vector3(1, 1, 1)).invert().elements;
  const smin3 = Math.min(...sc), p = new Vector3();
  return {
    ...skipping(s), cut: !!s.cut, k: s.blend ?? blend, colour: s.colour ?? s.color ? new Color(s.colour ?? s.color) : null,
    d(x, y, z) {
      p.set(x, y, z); const e = inv, X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      return f(s, X / sc[0], Y / sc[1], Z / sc[2]) * smin3;
    },
  };
}

/**
 * The mesh for shapes (as gs.models.sculpt takes them) as plain arrays: { P (positions), N (normals),
 * U (uvs), C (colours, or null), I (faces) }.
 */
export function sculptArrays(shapes, { blend = .08, res = 48, bounds = null, colour = '#ffffff', color } = {}) {
  let field, parts = null;
  if (typeof shapes === 'function') {
    if (!bounds) throw new Error('gs.models.sculpt: a distance function needs bounds: [[x, y, z], [x, y, z]]');
    field = shapes;
  } else {
    parts = shapes.map(s => prepare(s, blend));
    field = (x, y, z) => {
      let d = 1e9;
      for (const s of parts) {
        // a shape too far away to change the answer is skipped (its distance is at least how far its
        // bounding ball is): exactly the same field, measured far fewer times
        const far = (len3(x - s.c[0], y - s.c[1], z - s.c[2]) / s.sMax - s.r0) * s.sMin;
        if (s.cut ? far >= s.k - d : far >= d + s.k) continue;
        const e = s.d(x, y, z); d = s.cut ? smax(d, -e, s.k) : smin(d, e, s.k);
      }
      return d;
    };
    if (!bounds) {
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const s of shapes) { if (s.cut) continue; const { c, r } = reach(s); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i] - r); hi[i] = Math.max(hi[i], c[i] + r); } }
      bounds = [lo, hi];
    }
  }
  // the grid: a little bigger than the shapes (so the surface closes), cells square
  const size = Math.max(...[0, 1, 2].map(i => bounds[1][i] - bounds[0][i])), cell = size / Math.max(8, Math.min(128, res)), pad = cell * 2 + blend * .25 + .002;   // (melting in grows a shape by at most a quarter of its blend)
  const lo = bounds[0].map(v => v - pad), dims = [0, 1, 2].map(i => Math.ceil((bounds[1][i] + pad - lo[i]) / cell) + 1);
  // measured once per grid point (surface nets asks for each corner of each cell: 8 times as many)
  const [nx, ny] = dims, F = new Float32Array(dims[0] * dims[1] * dims[2]);
  for (let k = 0, i = 0; k < dims[2]; k++) for (let j = 0; j < ny; j++) for (let a = 0; a < nx; a++, i++) F[i] = field(lo[0] + a * cell, lo[1] + j * cell, lo[2] + k * cell);
  const hiB = lo.map((v, i) => v + dims[i] * cell);
  const ic = 1 / cell, [l0, l1, l2] = lo, nxy = nx * ny;
  const { positions, cells } = surfaceNets(dims, (x, y, z) => F[(((x - l0) * ic + .5) | 0) + nx * (((y - l1) * ic + .5) | 0) + nxy * (((z - l2) * ic + .5) | 0)], [lo, hiB]);
  // positions, normals from the field's slope (smooth and true), uvs by box projection in metres, colours
  const n = positions.length, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), h = cell * .5;
  const anyCol = parts?.some(s => s.colour), C = anyCol ? new Float32Array(n * 3) : null, base = new Color(colour ?? color), tmp = new Color();
  for (let i = 0; i < n; i++) {
    const [x, y, z] = positions[i]; P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    let gx = field(x + h, y, z) - field(x - h, y, z), gy = field(x, y + h, z) - field(x, y - h, z), gz = field(x, y, z + h) - field(x, y, z - h);
    const l = len3(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l; N[i * 3] = gx; N[i * 3 + 1] = gy; N[i * 3 + 2] = gz;
    const ax = Math.abs(gx), ay = Math.abs(gy), az = Math.abs(gz);
    [U[i * 2], U[i * 2 + 1]] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    if (C) {   // the nearest shapes' colours, melted over their blend
      // (a carved shape paints the walls of its hole only if it has a colour; each pair melts over the
      // smaller of their two blends, as the shape itself does)
      let best = 1e9, bi = 0; const ds = parts.map((s, j) => { const e = Math.abs(s.d(x, y, z)); if ((!s.cut || s.colour) && e < best) { best = e; bi = j; } return e; });
      let r = 0, g = 0, b = 0, w = 0;
      parts.forEach((s, j) => { if (s.cut && !s.colour) return; const t = 1 - (ds[j] - best) / (Math.min(s.k, parts[bi].k) + cell * .5); if (t <= 0) return; const c = s.colour || base; r += c.r * t; g += c.g * t; b += c.b * t; w += t; });
      tmp.setRGB(w ? r / w : base.r, w ? g / w : base.g, w ? b / w : base.b); C[i * 3] = tmp.r; C[i * 3 + 1] = tmp.g; C[i * 3 + 2] = tmp.b;
    }
  }
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(cells.length * 3);
  // faces turned to face out (the field's slope says which way is out)
  let flip = 0;
  for (let t = 0; t < Math.min(cells.length, 64); t++) {
    const [a, b, c] = cells[t], ab = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), ac = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]);
    const fx = ab[1] * ac[2] - ab[2] * ac[1], fy = ab[2] * ac[0] - ab[0] * ac[2], fz = ab[0] * ac[1] - ab[1] * ac[0];
    flip += fx * N[a * 3] + fy * N[a * 3 + 1] + fz * N[a * 3 + 2] < 0 ? 1 : -1;
  }
  cells.forEach(([a, b, c], t) => { idx[t * 3] = a; idx[t * 3 + 1] = flip > 0 ? c : b; idx[t * 3 + 2] = flip > 0 ? b : c; });
  return { P, N, U, C, I: idx };
}
