// The shape tools gs.models.vehicle builds with: bodies skinned over cross-sections (a car's shell, a hull, a
// fuselage, a wing), bars between two points, wheels, and the loop a tank's track runs round. Plain three.js
// geometry and numbers, no materials and nothing of the page, so the shapes can be made and tested anywhere.
// Kit use only.
import { BufferGeometry, BufferAttribute, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, LatheGeometry, Matrix4, Euler, Quaternion, Vector3, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const M = new Matrix4(), Q = new Quaternion(), E = new Euler(), S = new Vector3(), T = new Vector3(), UP = new Vector3(0, 1, 0), D = new Vector3();
const { PI, sin, cos, sqrt, abs, min, max, hypot, atan2, floor, round } = Math;
export const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v, smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** A line through knots [[x, y], ...] (x rising) as a function of x; soft: its corners rounded over that distance each side. */
export function line(knots, soft = 0) {
  const f = x => {
    if (x <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) if (x <= knots[i][0]) { const a = knots[i - 1], b = knots[i]; return b[0] === a[0] ? b[1] : lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); }
    return knots[knots.length - 1][1];
  };
  return soft > 0 ? x => (f(x - soft) + f(x - soft / 2) * 2 + f(x) * 2 + f(x + soft / 2) * 2 + f(x + soft)) / 8 : f;
}
/** Places along a length to cut a body at: about every `step`, and exactly at each of `at` (the edges of windows, arches...). */
export function stations(from, to, step, at = [], gap = .02) {
  const must = [from, to, ...at.filter(z => z > from && z < to)].sort((a, b) => a - b).filter((z, i, l) => i === 0 || z - l[i - 1] > 1e-5);
  const out = must.slice(), n = max(1, round((to - from) / step));
  for (let i = 1; i < n; i++) { const z = lerp(from, to, i / n); if (!must.some(q => abs(q - z) < gap)) out.push(z); }
  return out.sort((a, b) => a - b);
}

function flip(g) {   // (a mirrored shape: its triangles turned to face out again)
  for (const k of Object.keys(g.attributes)) { const at = g.attributes[k], a = at.array, n = at.itemSize; for (let i = 0; i < a.length; i += n * 3) for (let c = 0; c < n; c++) { const t = a[i + n + c]; a[i + n + c] = a[i + n * 2 + c]; a[i + n * 2 + c] = t; } }
}
const geoOf = (pos, nor) => { const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3)); return g; };

/** A thing under construction: shapes added per material slot (as gs.models.prop's Build), with the vehicle tools. */
export class Shape {
  constructor() { this.slots = new Map(); }
  put(slot, g) { let l = this.slots.get(slot); if (!l) this.slots.set(slot, l = []); l.push(g); return this; }
  /** Any geometry, placed. A scale with one side negative mirrors it (the left of a pair). */
  add(slot, geo, at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(), sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    M.compose(T.set(...at), Q.setFromEuler(E.set(...(rot || [0, 0, 0]))), S.set(...sc)); g.applyMatrix4(M);
    if (sc[0] * sc[1] * sc[2] < 0) flip(g);
    return this.put(slot, g);
  }
  box(slot, w, h, d, at, rot, r = 0) { return this.add(slot, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, min(r, w / 2, h / 2, d / 2) * .999) : new BoxGeometry(w, h, d), at, rot); }
  cyl(slot, rt, rb, h, at, rot, seg = 16, open = false) { return this.add(slot, new CylinderGeometry(rt, rb, h, seg, 1, open), at, rot); }
  ring(slot, r, tube, at, rot = [PI / 2, 0, 0], arc = PI * 2, seg = 24) { return this.add(slot, new TorusGeometry(r, tube, 6, seg, arc), at, rot); }
  lathe(slot, pts, at, rot, seg = 20) { return this.add(slot, new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg), at, rot); }
  ball(slot, r, at, scale, seg = 16) { return this.add(slot, new SphereGeometry(r, seg, max(6, seg * .6 | 0)), at, [0, 0, 0], scale); }
  /** A round bar from a to b (r2: its radius at b). */
  bar(slot, a, b, r, seg = 8, r2 = r) {
    D.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const l = D.length(); if (l < 1e-6) return this;
    const g = new CylinderGeometry(r2, r, l, seg).toNonIndexed(); g.deleteAttribute('uv');
    M.compose(T.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), Q.setFromUnitVectors(UP, D.multiplyScalar(1 / l)), S.set(1, 1, 1)); g.applyMatrix4(M);
    return this.put(slot, g);
  }
  /** A flat strip from a to b, `w` wide across `side` (a direction) and `t` thick: seams, straps, planks at an angle. */
  strip(slot, a, b, w, t, side = [0, 0, 1]) {
    D.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const l = D.length(); if (l < 1e-6) return this;
    const y = D.clone().multiplyScalar(1 / l), z = new Vector3(...side).addScaledVector(y, -y.dot(new Vector3(...side))).normalize(), x = new Vector3().crossVectors(y, z);
    const g = new BoxGeometry(t, l, w).toNonIndexed(); g.deleteAttribute('uv');
    M.makeBasis(x, y, z).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); g.applyMatrix4(M);
    return this.put(slot, g);
  }
  /**
   * A skin over cross-sections. rings: [[[x, y, z], ...], ...], each a closed loop of the same number of points, in
   * order along the body. slot: one name, or (i, j) => the slot of the piece between ring i and i + 1 and point j
   * and j + 1 (null: a hole). round: a radius for each point of a ring (0: a sharp corner), which turns each point
   * into a small arc. crease (radians): edges sharper than this stay sharp, the rest shade smooth. capA, capB:
   * slots that close the first and last ring. open: the rings are lines, not loops (a panel).
   */
  skin(rings, { slot = 'paint', round: rad = null, crease = .75, capA = null, capB = null, open = false } = {}) {
    const m = rings.length, n0 = rings[0].length, rd = j => !rad || (open && (j === 0 || j === n0 - 1)) ? 0 : typeof rad === 'number' ? rad : rad[j] || 0;
    // (a rounded point becomes three: the piece before its middle goes with the side before it, the piece after with the side after)
    const seg = []; for (let j = 0; j < n0; j++) { if (rd(j) > 0) seg.push((j + n0 - 1) % n0, j, j); else seg.push(j); }
    const n = seg.length, R = rad ? rings.map(r => arcs(r, rd)) : rings;
    const slotOf = typeof slot === 'function' ? slot : () => slot, cols = open ? n - 1 : n, cosC = cos(crease);
    // each piece's normal (times its size), and which way is out: away from the middle of the body
    const N = new Float32Array((m - 1) * cols * 3), C = [0, 0, 0]; let cnt = 0;
    for (const r of R) for (const p of r) { C[0] += p[0]; C[1] += p[1]; C[2] += p[2]; cnt++; }
    C[0] /= cnt; C[1] /= cnt; C[2] /= cnt;
    let out = 0;
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < cols; j++) {
      const a = R[i][j], b = R[i][(j + 1) % n], c = R[i + 1][(j + 1) % n], d = R[i + 1][j], k = (i * cols + j) * 3;
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
      out += nx * ((a[0] + c[0]) / 2 - C[0]) + ny * ((a[1] + c[1]) / 2 - C[1]) + nz * ((a[2] + c[2]) / 2 - C[2]);
    }
    const sg = out < 0 ? -1 : 1, L = new Float32Array((m - 1) * cols);
    for (let q = 0; q < L.length; q++) { const k = q * 3; N[k] *= sg; N[k + 1] *= sg; N[k + 2] *= sg; L[q] = hypot(N[k], N[k + 1], N[k + 2]); }
    const acc = new Map(), tmp = [0, 0, 0];
    // a corner's normal: its piece's own, with the neighbours round that point that are not past the crease
    const corner = (i, j, vi, vj) => {
      const k0 = (i * cols + j) * 3, l0 = L[i * cols + j]; let x = 0, y = 0, z = 0;
      for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) {
        const qi = vi + di; let qj = vj + dj; if (qi < 0 || qi >= m - 1) continue;
        if (open) { if (qj < 0 || qj >= cols) continue; } else qj = (qj + cols) % cols;
        const q = qi * cols + qj, l = L[q]; if (l < 1e-12) continue;
        if ((N[q * 3] * N[k0] + N[q * 3 + 1] * N[k0 + 1] + N[q * 3 + 2] * N[k0 + 2]) >= cosC * l * l0) { x += N[q * 3]; y += N[q * 3 + 1]; z += N[q * 3 + 2]; }
      }
      const l = hypot(x, y, z) || 1; tmp[0] = x / l; tmp[1] = y / l; tmp[2] = z / l; return tmp;
    };
    const tri = (o, p, np) => { o.pos.push(p[0], p[1], p[2]); o.nor.push(np[0], np[1], np[2]); };
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < cols; j++) {
      if (L[i * cols + j] < 1e-12) continue;
      const s = slotOf(i, seg[j]); if (!s) continue;
      let o = acc.get(s); if (!o) acc.set(s, o = { pos: [], nor: [] });
      const j1 = (j + 1) % n, a = R[i][j], b = R[i][j1], c = R[i + 1][j1], d = R[i + 1][j];
      const na = corner(i, j, i, j).slice(), nb = corner(i, j, i, j + 1).slice(), nc = corner(i, j, i + 1, j + 1).slice(), nd = corner(i, j, i + 1, j).slice();
      const same = (p, q) => abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) < 1e-9;
      const put = (p, q, r, np, nq, nr) => { if (same(p, q) || same(q, r) || same(p, r)) return; if (sg > 0) { tri(o, p, np); tri(o, q, nq); tri(o, r, nr); } else { tri(o, p, np); tri(o, r, nr); tri(o, q, nq); } };
      put(a, b, c, na, nb, nc); put(a, c, d, na, nc, nd);
    }
    // the ends, closed with a fan from their middle
    for (const [s, r, other] of [[capA, R[0], R[1]], [capB, R[m - 1], R[m - 2]]]) {
      if (!s) continue;
      let o = acc.get(s); if (!o) acc.set(s, o = { pos: [], nor: [] });
      const c = [0, 0, 0], c2 = [0, 0, 0], nn = [0, 0, 0];
      for (const p of r) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; } for (const p of other) { c2[0] += p[0] / n; c2[1] += p[1] / n; c2[2] += p[2] / n; }
      for (let j = 0; j < n; j++) { const p = r[j], q = r[(j + 1) % n]; nn[0] += (p[1] - q[1]) * (p[2] + q[2]); nn[1] += (p[2] - q[2]) * (p[0] + q[0]); nn[2] += (p[0] - q[0]) * (p[1] + q[1]); }
      const l = hypot(...nn) || 1; nn[0] /= l; nn[1] /= l; nn[2] /= l;
      const away = nn[0] * (c[0] - c2[0]) + nn[1] * (c[1] - c2[1]) + nn[2] * (c[2] - c2[2]) >= 0; if (!away) { nn[0] = -nn[0]; nn[1] = -nn[1]; nn[2] = -nn[2]; }
      for (let j = 0; j < n; j++) { const p = r[j], q = r[(j + 1) % n]; if (abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) < 1e-9) continue; tri(o, c, nn); if (away) { tri(o, p, nn); tri(o, q, nn); } else { tri(o, q, nn); tri(o, p, nn); } }
    }
    for (const [s, o] of acc) if (o.pos.length) this.put(s, geoOf(o.pos, o.nor));
    return this;
  }
  /** How many triangles it holds so far. */
  /** The box round everything in it: `{ lo: [x, y, z], hi, w, h, l }`. */
  bounds() {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const l of this.slots.values()) for (const g of l) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { const v = a[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; } }
    return { lo, hi, w: hi[0] - lo[0], h: hi[1] - lo[1], l: hi[2] - lo[2] };
  }
  get tris() { let t = 0; for (const l of this.slots.values()) for (const g of l) t += g.attributes.position.count / 3; return t; }
  /** Each slot as one geometry (position and normal). */
  merged() { const out = new Map(); for (const [s, l] of this.slots) { out.set(s, l.length === 1 ? l[0] : mergeGeometries(l, false)); if (l.length > 1) for (const g of l) g.dispose(); } return out; }
}

// a ring with its rounded points each turned into a small arc of three: where it starts to turn, its middle, where it ends
function arcs(ring, rd) {
  const n = ring.length, out = [];
  for (let j = 0; j < n; j++) {
    const p = ring[j], r = rd(j); if (!(r > 0)) { out.push(p); continue; }
    const a = ring[(j + n - 1) % n], b = ring[(j + 1) % n], la = hypot(a[0] - p[0], a[1] - p[1], a[2] - p[2]), lb = hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]);
    if (la < 1e-9 || lb < 1e-9) { out.push(p, p, p); continue; }
    const ka = min(r, la * .45) / la, kb = min(r, lb * .45) / lb;
    const A = [lerp(p[0], a[0], ka), lerp(p[1], a[1], ka), lerp(p[2], a[2], ka)], B = [lerp(p[0], b[0], kb), lerp(p[1], b[1], kb), lerp(p[2], b[2], kb)];
    out.push(A, [A[0] * .25 + p[0] * .5 + B[0] * .25, A[1] * .25 + p[1] * .5 + B[1] * .25, A[2] * .25 + p[2] * .5 + B[2] * .25], B);
  }
  return out;
}

const paint = (g, col, shade = null) => {   // a colour for every corner (shade: (x, y, z) => how bright)
  const P = g.attributes.position, c = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const k = shade ? shade(P.getX(i), P.getY(i), P.getZ(i)) : 1; c[i * 3] = col[0] * k; c[i * 3 + 1] = col[1] * k; c[i * 3 + 2] = col[2] * k; }
  g.setAttribute('color', new BufferAttribute(c, 3)); return g;
};
const plain = g => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k); return o; };
const hex = c => { const v = parseInt(c.slice(1), 16), f = x => { const s = x / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }; return [f(v >> 16 & 255), f(v >> 8 & 255), f(v & 255)]; };   // (vertex colours are linear)

/**
 * A road wheel, its axle along x and its outer face towards +x, its middle at 0: a tyre and a dished hub with
 * nuts, coloured corner by corner (one material, one draw). r: radius; w: width; rim: the hub's share of the
 * radius; lugs: blocks of tread round it (0: a road tyre); dual: two tyres side by side (a lorry's back axle);
 * tyre, hub: colours.
 */
export function wheelGeo({ r = .32, w = .2, rim = .62, lugs = 0, dual = false, nuts = 5, tyre = '#151617', hub = '#b9bdc1', seg = 24 } = {}) {
  const rr = r * rim, t = r - rr, parts = [], tc = hex(tyre), hc = hex(hub);
  const lathe = (pts, s = seg) => plain(new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), s));
  const one = (hw, at) => lathe([[rr, -hw * .9], [rr + t * .4, -hw], [r - t * .22, -hw * .93], [r, -hw * .66], [r, hw * .66], [r - t * .22, hw * .93], [rr + t * .4, hw], [rr, hw * .9]]).translate(0, at, 0);
  const hw = w / 2;
  if (dual) { parts.push(paint(one(hw * .46, -hw * .52), tc), paint(one(hw * .46, hw * .52), tc)); } else parts.push(paint(one(hw, 0), tc));
  // the hub: a lip, a dish, a cap; darker in the dish (brake dust, shadow)
  const face = dual ? hw * .98 : hw * .9;
  parts.push(paint(lathe([[0, -hw * .5], [rr, -hw * .88], [rr, face], [rr * .93, face * .98], [rr * .86, face * .6], [rr * .5, face * .5], [rr * .3, face * .78], [rr * .2, face * .86], [0, face * .88]]), hc, (x, y, z) => { const q = hypot(x, z) / rr; return y < 0 ? .25 : q > .88 ? 1 : q > .4 ? .6 + q * .25 : .95; }));
  for (let i = 0; i < nuts; i++) { const a = i / nuts * PI * 2; parts.push(paint(plain(new CylinderGeometry(rr * .045, rr * .045, hw * .12, 6)).translate(cos(a) * rr * .4, face * .58, sin(a) * rr * .4), hc, () => .8)); }
  for (let i = 0; i < lugs; i++) {
    const a = i / lugs * PI * 2, side = i % 2 ? 1 : -1, g = plain(new BoxGeometry(t * .22, hw * 1.05, 2 * PI * r / lugs * .55));
    g.rotateX(side * .35).translate(r + t * .02, side * hw * .5, 0).rotateY(a); parts.push(paint(g, tc, () => .9));
  }
  const g = mergeGeometries(parts, false); for (const p of parts) p.dispose();
  return g.rotateZ(-PI / 2);
}

/**
 * A railway wheelset: two flanged steel wheels on an axle, along x, its middle at 0 (the rail tops are r below).
 * gauge: between the rails' inner faces (1.435); spokes: a spoked wheel (a steam engine's) with that many;
 * dull: only the flange and the tread beside it, which the rail keeps bright, show steel; the tyre's face is as dark as the wheel (a working engine's).
 */
export function wheelsetGeo({ r = .46, gauge = 1.435, spokes = 0, axle = true, colour = '#2a2b2d', rimColour = '#8f9498', weight = 0, crank: weightAt = .5, seg = 28, dull = false } = {}) {
  const parts = [], c = hex(colour), rc = hex(rimColour), wt = .13;
  for (const sx of [-1, 1]) {
    const sub = [], lathe = pts => plain(new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg));
    // (in the lathe y runs outwards from the flange at 0 to the wheel's outer face at wt)
    const tyre = lathe([[r * .86, .012], [r + .028, 0], [r + .03, .03], [r + .004, .036], [r - .002, wt], [r * .86, wt - .008]]);
    sub.push(paint(tyre, rc, dull ? (x, y, z) => hypot(x, z) > r - .01 && y < wt - .005 ? .8 : .1 : (x, y, z) => hypot(x, z) > r - .01 ? 1 : .45));
    if (spokes) {
      sub.push(paint(lathe([[0, -.01], [r * .2, -.01], [r * .2, wt + .03], [r * .09, wt + .045], [0, wt + .045]]), c));
      for (let i = 0; i < spokes; i++) { const a = (i + .5) / spokes * PI * 2, g = plain(new BoxGeometry(r * .7, wt * .5, r * .075)); g.translate(r * .53, wt * .5, 0).rotateY(a); sub.push(paint(g, c)); }
      if (weight) {   // the weight opposite the crank pin (which is towards +z)
        const g = plain(new CylinderGeometry(r * .86, r * .86, wt * .7, 12, 1, false, PI - weight / 2, weight)), P = g.attributes.position;
        for (let i = 0; i < P.count; i++) if (hypot(P.getX(i), P.getZ(i)) < 1e-6) P.setZ(i, -r * .5);
        g.translate(0, wt * .5, 0); sub.push(paint(g, c));
        sub.push(paint(plain(new CylinderGeometry(r * .07, r * .07, .1, 10)).translate(0, wt + .07, r * weightAt), rc, () => dull ? .3 : .6));   // the crank pin
      }
    } else sub.push(paint(lathe([[0, -.01], [r * .86, .012], [r * .86, wt - .008], [r * .3, wt * .55], [r * .16, wt + .02], [0, wt + .02]]), c, (x, y, z) => .7 + .3 * hypot(x, z) / r));
    const one = mergeGeometries(sub, false); for (const s of sub) s.dispose();
    // the flange's inner face at half the gauge, the wheel outside it
    one.rotateZ(-PI / 2).translate(gauge / 2 - .002, 0, 0); if (sx < 0) { one.scale(-1, 1, 1); flip(one); }
    parts.push(one);
  }
  if (axle) parts.push(paint(plain(new CylinderGeometry(.075, .075, gauge + .1, 10)).rotateZ(PI / 2), c, () => .8));
  const g = mergeGeometries(parts, false); for (const p of parts) p.dispose();
  return g;
}

/**
 * The loop a belt takes round wheels seen from the side: circles [[z, y, r], ...] in the order it passes them,
 * turning the same way round each. Returns { length, at(s, out) } where at() gives the point [z, y] and the
 * direction [dz, dy] at s metres round the loop (any s: it wraps).
 */
export function belt(circles, step = .02) {
  const n = circles.length, tan = [];
  for (let i = 0; i < n; i++) {
    const a = circles[i], b = circles[(i + 1) % n], dz = b[0] - a[0], dy = b[1] - a[1], l = hypot(dz, dy), uz = dz / l, uy = dy / l, s = (a[2] - b[2]) / l, c = sqrt(max(0, 1 - s * s));
    const ez = s * uz + c * uy, ey = s * uy - c * uz;   // the side of the line the wheels' rims touch (to the right of the way it runs)
    tan.push({ from: [a[0] + a[2] * ez, a[1] + a[2] * ey], to: [b[0] + b[2] * ez, b[1] + b[2] * ey], ang: atan2(ey, ez) });
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = tan[i], nx = tan[(i + 1) % n], b = circles[(i + 1) % n];
    pts.push(t.from, t.to);
    let da = nx.ang - t.ang; while (da < 0) da += PI * 2; while (da >= PI * 2) da -= PI * 2;   // round the wheel, the way the belt turns
    const k = max(1, Math.ceil(da * b[2] / step));
    for (let q = 1; q < k; q++) { const a = t.ang + da * q / k; pts.push([b[0] + b[2] * cos(a), b[1] + b[2] * sin(a)]); }
  }
  // evenly spaced along its length
  const cum = [0]; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; cum.push(cum[i] + hypot(q[0] - p[0], q[1] - p[1])); }
  const length = cum[pts.length], m = Math.ceil(length / step), Z = new Float32Array(m + 1), Y = new Float32Array(m + 1);
  for (let k = 0, i = 0; k <= m; k++) { const s = k / m * length; while (i < pts.length - 1 && cum[i + 1] < s) i++; const p = pts[i], q = pts[(i + 1) % pts.length], f = cum[i + 1] > cum[i] ? (s - cum[i]) / (cum[i + 1] - cum[i]) : 0; Z[k] = lerp(p[0], q[0], f); Y[k] = lerp(p[1], q[1], f); }
  return {
    length,
    at(s, out = { z: 0, y: 0, dz: 0, dy: 1 }) {
      const u = ((s % length) + length) % length / length * m, k = min(m - 1, floor(u)), f = u - k, dz = Z[k + 1] - Z[k], dy = Y[k + 1] - Y[k], l = hypot(dz, dy) || 1;
      out.z = Z[k] + dz * f; out.y = Y[k] + dy * f; out.dz = dz / l; out.dy = dy / l; return out;
    },
  };
}
