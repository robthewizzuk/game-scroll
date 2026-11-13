#!/usr/bin/env node
// Head fit: a real-look head beside a real head scan, shape only, to see where it differs.
//
//   node scripts/head-fit.mjs out.png [age=35] [fat=.5] [fem] [look=clean] [heritage=african] [scan=gnm/m-black-0]
//
// The scan is the one the face lab's &ref uses (scripts/face-lab/ref/LeePerrySmith.glb, CC BY 3.0, never committed: fetch it from
// raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/LeePerrySmith/). It is laid over our head by the points down the
// middle of the face that any two faces have (the root of the nose, its tip, under it, where the lips meet, the point of the chin), scaled
// and tilted to fit them best, so what differs after that is shape: the proportions, the depths, the widths.
//
// The sheet: both heads in plain plaster from the front, the side and three quarters; the two outlines over each other (front, side and
// slices across the head at eight heights); the difference in depth from the front and the side in colour (red: ours stands out further,
// blue: ours is sunk in), in millimetres; and a table of measures. Also writes out.json with the numbers.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2), out = args.find(a => a.endsWith('.png')) || 'head-fit.png';
const opt = Object.fromEntries(args.filter(a => a.includes('=')).map(a => a.split('=')));
for (const a of args) if (!a.includes('=') && !a.endsWith('.png')) opt[a] = 1;   // (bare words are switches: fem)
// scan=gnm/f-black-0 measures against another head in scripts/face-lab/ref/ (gnm/: GNM Head's, written by scripts/face-lab/gnm-heads.py),
// and with solve=1 writes the fit to table=<file>.json, or with kin=f:african into that entry of human-fit.js FIT_KIN, rather than FIT_DATA.
// A woman's head (fem) is fitted with no fit on it, as a man's is: each sex's own fit is the whole of it (see human-head.js head)
const SCAN = path.join(ROOT, 'scripts/face-lab/ref', (opt.scan || 'LeePerrySmith').replace(/\.glb$/, '') + '.glb');
if (!fs.existsSync(SCAN)) { console.error('no scan at ' + SCAN + ' (see the top of this file)'); process.exit(1); }

const S = await import(path.join(ROOT, 'src/kit/models/human-shapes.js'));
const { HC, EYE } = await import(path.join(ROOT, 'src/kit/models/human-head.js'));

// ---- our head, as a person of these options has it (bald, no hat), in metres about the middle of the head
function headArgs(o = {}) {
  const fem = 'fem' in o, real = (o.look || 'real') === 'real';
  const base = { jaw: fem ? .94 : 1, chin: fem ? .9 : 1, brow: fem ? .62 : .82, nose: fem ? .86 : 1, lips: fem ? 1.12 : 1, cheeks: 1, eyes: fem ? 1.08 : 1, soft: fem ? 1 : 0 };
  const face = real ? { ...base, real: 1, es: 1, age: +(o.age ?? 35), fat: +(o.fat ?? .5), asym: 0, aseed: 0, lips: base.lips * 1.12, noseW: 1, bridge: 1, tip: 0, tilt: 0, lidFold: .35, faceW: 1, ears: 1, ...(o.heritage ? { kin: { [o.heritage]: 1 } } : {}) } : base;
  return { face, neck: 1, hair: 'bald', moustache: 0, hat: null, foot: 0, ...(o.fit === 'off' || 'solve' in o ? { fit: false } : {}) };
}
export function ours(o = {}) {
  const p = S.sculpt({ kind: 'head', a: headArgs(o) });
  const P = new Float32Array(p.n * 3); for (let i = 0; i < p.n; i++) { P[i * 3] = p.P[i * 3] - HC[0]; P[i * 3 + 1] = p.P[i * 3 + 1] - HC[1]; P[i * 3 + 2] = p.P[i * 3 + 2] - HC[2]; }
  return { P, I: p.I[0], n: p.n };
}

// ---- the scan, as it is in its file
function glb(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
  const acc = i => { const a = J.accessors[i], v = J.bufferViews[a.bufferView], off = (v.byteOffset || 0) + (a.byteOffset || 0), n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const T = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType]; return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * T.BYTES_PER_ELEMENT)); };
  const pr = J.meshes[0].primitives[0]; return { P: Float32Array.from(acc(pr.attributes.POSITION)), I: Uint32Array.from(acc(pr.indices)), n: J.accessors[pr.attributes.POSITION].count, UV: pr.attributes.TEXCOORD_0 != null ? Float32Array.from(acc(pr.attributes.TEXCOORD_0)) : null, extras: J.extras || {} };
}

// ---- the middle line of a head: where a plane x = 0 cuts it, as points (y, z)
function midline(m, x0 = 0) {
  const pts = [], P = m.P, I = m.I;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3] - x0, P[i * 3 + 1], P[i * 3 + 2]]), hit = [];
    for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; if ((a[0] < 0) !== (b[0] < 0)) { const u = a[0] / (a[0] - b[0]); hit.push([a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]); } }
    if (hit.length === 2) for (let k = 0; k <= 8; k++) pts.push([hit[0][0] + (hit[1][0] - hit[0][0]) * k / 8, hit[0][1] + (hit[1][1] - hit[0][1]) * k / 8]);
  }
  return pts;
}
// the front of it: the furthest forward z at each height (bins of `step`), from the top down
function front(pts, step) {
  let lo = Infinity, hi = -Infinity; for (const [y] of pts) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const n = Math.ceil((hi - lo) / step) + 1, z = new Float64Array(n).fill(-Infinity);
  for (const [y, zz] of pts) { const i = Math.round((y - lo) / step); if (zz > z[i]) z[i] = zz; }
  for (let i = 0; i < n; i++) if (!isFinite(z[i])) z[i] = z[i - 1] ?? z[i + 1];
  const sm = Float64Array.from(z, (_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) if (z[i + k] != null && isFinite(z[i + k])) { s += z[i + k]; c++; } return s / c; });
  return { lo, step, n, z: sm, y: i => lo + i * step };
}
// the points down the middle of the face: glabella (between the brows), nasion (the root of the nose), pronasale (its tip), subnasale (under it),
// labrale superius and inferius (the lips), stomion (where they meet), sublabiale (the hollow under the lower lip), pogonion (the point of the
// chin). k: metres to the head's own units. Each is the furthest forward or furthest back in a window below the one before, as on a real face
function marks(F, k = 1) {
  const { z } = F, at = i => [F.y(i), z[i]], idx = y => Math.max(0, Math.min(F.n - 1, Math.round((y - F.lo) / F.step)));
  let prn = 0; for (let i = 0; i < F.n; i++) if (z[i] > z[prn]) prn = i;
  const Y = i => F.y(i), pick = (y0, y1, most) => { let a = idx(Math.min(y0, y1)), b = idx(Math.max(y0, y1)), best = a; for (let i = a; i <= b; i++) if (most ? z[i] > z[best] : z[i] < z[best]) best = i; return best; };
  const g = pick(Y(prn) + .025 * k, Y(prn) + .07 * k, true), n = pick(Y(prn) + .01 * k, Y(g), false);
  const sn = pick(Y(prn) - .03 * k, Y(prn) - .005 * k, false), ls = pick(Y(sn) - .025 * k, Y(sn) - .004 * k, true), sto = pick(Y(ls) - .012 * k, Y(ls) - .002 * k, false);
  const li = pick(Y(sto) - .016 * k, Y(sto) - .002 * k, true), sl = pick(Y(li) - .02 * k, Y(li) - .003 * k, false), pg = pick(Y(sl) - .025 * k, Y(sl) - .003 * k, true);
  return { g: at(g), n: at(n), prn: at(prn), sn: at(sn), ls: at(ls), sto: at(sto), li: at(li), sl: at(sl), pg: at(pg) };
}
// the scale, tilt and shift (in y, z) that lay points q over points p best (Procrustes)
function fit2(q, p) {
  const N = q.length, mq = [0, 0], mp = [0, 0]; for (let i = 0; i < N; i++) { mq[0] += q[i][0] / N; mq[1] += q[i][1] / N; mp[0] += p[i][0] / N; mp[1] += p[i][1] / N; }
  let a = 0, b = 0, qq = 0; for (let i = 0; i < N; i++) { const x = q[i][0] - mq[0], y = q[i][1] - mq[1], u = p[i][0] - mp[0], v = p[i][1] - mp[1]; a += x * u + y * v; b += x * v - y * u; qq += x * x + y * y; }
  const th = Math.atan2(b, a), s = Math.hypot(a, b) / qq, c = Math.cos(th), sn = Math.sin(th);
  return { s, th, map: ([y, z]) => { const x = y - mq[0], w = z - mq[1]; return [mp[0] + s * (c * x - sn * w), mp[1] + s * (sn * x + c * w)]; } };
}

// ---- a head seen along one axis: the nearest surface's depth at each cell (orthographic, `res` metres a cell)
// view: 'front' (u = x, v = y, depth = z), 'side' (u = -z, v = y, depth = x: the head's left side), 'top' (u = x, v = -z, depth = y), 'quarter' (turned 35° to its left)
function depth(m, view, box, res) {
  const [u0, u1, v0, v1] = box, W = Math.round((u1 - u0) / res), H = Math.round((v1 - v0) / res), D = new Float32Array(W * H).fill(-Infinity), P = m.P, I = m.I;
  const ca = Math.cos(35 * Math.PI / 180), sa = Math.sin(35 * Math.PI / 180);
  const pr = (i, o) => { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (view === 'front') { o[0] = x; o[1] = y; o[2] = z; } else if (view === 'side') { o[0] = -z; o[1] = y; o[2] = x; } else if (view === 'top') { o[0] = x; o[1] = -z; o[2] = y; }
    else { o[0] = x * ca - z * sa; o[1] = y; o[2] = x * sa + z * ca; } };
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (let t = 0; t < I.length; t += 3) {
    pr(I[t], a); pr(I[t + 1], b); pr(I[t + 2], c);
    const ax = (a[0] - u0) / res, ay = (v1 - a[1]) / res, bx = (b[0] - u0) / res, by = (v1 - b[1]) / res, cx = (c[0] - u0) / res, cy = (v1 - c[1]) / res;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + .5, py = y + .5, w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area, w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const d = w0 * a[2] + w1 * b[2] + w2 * c[2], j = y * W + x; if (d > D[j]) D[j] = d;
    }
  }
  return { W, H, D, res, box };
}
// plaster: the depth lit from above left and in front
function plaster(M, tint = [1, 1, 1]) {
  const { W, H, D, res } = M, px = new Uint8Array(W * H * 4), L = [-.35, .45, .82], ll = Math.hypot(...L);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = y * W + x, d = D[j]; if (!isFinite(d)) { px.set([236, 236, 232, 255], j * 4); continue; }
    const g = (dx, dy) => { const k = D[(y + dy) * W + x + dx]; return isFinite(k) ? k : d; };
    const nx = -(g(1, 0) - g(-1, 0)) / (2 * res), ny = (g(0, 1) - g(0, -1)) / (2 * res), nl = Math.hypot(nx, ny, 1);
    const l = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / (nl * ll)), v = 40 + 200 * l;
    px.set([v * tint[0], v * tint[1], v * tint[2], 255], j * 4);
  }
  return { W, H, px };
}
// the difference: ours less the scan's, red where ours stands out, blue where it is sunk (full colour at `full` metres), over our plaster
function diff(A, B, full = .008) {
  const { W, H } = A, base = plaster(A), px = base.px, st = { n: 0, sum: 0, abs: 0 };
  for (let j = 0; j < W * H; j++) {
    const a = A.D[j], b = B.D[j]; if (!isFinite(a) || !isFinite(b)) { if (isFinite(a)) { px[j * 4] = px[j * 4] * .6 + 102; px[j * 4 + 1] *= .6; px[j * 4 + 2] = px[j * 4 + 2] * .6 + 60; } continue; }
    const e = a - b, k = Math.max(-1, Math.min(1, e / full)), v = (px[j * 4] / 255) * .55 + .45;
    const c = k > 0 ? [1, 1 - k * .85, 1 - k * .9] : [1 + k * .9, 1 + k * .6, 1];
    // a line every 2 mm
    const ring = Math.abs(((e * 1000 / 2) % 1 + 1) % 1 - .5) > .46 ? .7 : 1;
    px[j * 4] = 255 * c[0] * v * ring; px[j * 4 + 1] = 255 * c[1] * v * ring; px[j * 4 + 2] = 255 * c[2] * v * ring;
    st.n++; st.sum += e; st.abs += Math.abs(e);
  }
  return { W, H, px, mean: st.sum / st.n, mad: st.abs / st.n };
}
// a slice across a head at height y: points (x, z)
function slice(m, y0) {
  const pts = [], P = m.P, I = m.I;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3], P[i * 3 + 1] - y0, P[i * 3 + 2]]), hit = [];
    for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; if ((a[1] < 0) !== (b[1] < 0)) { const u = a[1] / (a[1] - b[1]); hit.push([a[0] + (b[0] - a[0]) * u, a[2] + (b[2] - a[2]) * u]); } }
    if (hit.length === 2) pts.push(hit);
  }
  return pts;
}
// the outline of a depth picture: its edge cells
function outline(M) { const { W, H, D } = M, o = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const j = y * W + x; if (isFinite(D[j]) && (!isFinite(D[j - 1]) || !isFinite(D[j + 1]) || !isFinite(D[j - W]) || !isFinite(D[j + W]))) o.push([x, y]); } return o; }

// ---- a PNG of RGBA bytes, as a data: URL
function png({ W, H, px }) {
  const raw = Buffer.alloc((W * 4 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const hd = Buffer.alloc(13); hd.writeUInt32BE(W, 0); hd.writeUInt32BE(H, 4); hd[8] = 8; hd[9] = 6;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

// ================================================================= main
const A = ours(opt), B = glb(SCAN);
// ---- the scan laid over ours. By the parts of a head the fit does not move, or not much: the eyes and the ears (the fit leaves them be,
// so the skin round them must meet them where they are) and the skull (its crown and the back of it), always against our head as it is
// without the fit (fit=off), so the scan lies in the same place however the fit changes the face. (Laid by the face's own marks, or the
// whole head, it tipped and shrank as the face changed, and a fit worked out against one lie was measured against another.)
// similar(q, p, w): the scale, turn and shift that best take points q onto p (Horn's quaternions), weighted
function similar(q, p, w = q.map(() => 1)) {
  const N = q.length, W2 = w.reduce((s2, t) => s2 + t, 0), mq = [0, 0, 0], mp = [0, 0, 0]; for (let i = 0; i < N; i++) for (let a = 0; a < 3; a++) { mq[a] += w[i] * q[i][a] / W2; mp[a] += w[i] * p[i][a] / W2; }
  const Sm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let qq = 0;
  for (let i = 0; i < N; i++) { const a = q[i].map((v, k) => v - mq[k]), b = p[i].map((v, k) => v - mp[k]); qq += w[i] * (a[0] ** 2 + a[1] ** 2 + a[2] ** 2); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) Sm[r][c] += w[i] * a[r] * b[c]; }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = Sm;
  const Nm = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  let v = [1, 0, 0, 0]; const sh = 10 * (Math.abs(xx) + Math.abs(yy) + Math.abs(zz)) + 1e-12;
  for (let k = 0; k < 400; k++) { const t = Nm.map((r, i) => r.reduce((s2, c, j) => s2 + c * v[j], 0) + sh * v[i]), l = Math.hypot(...t); v = t.map(u => u / l); }
  const [w0, x, y, z] = v, R = [[w0 * w0 + x * x - y * y - z * z, 2 * (x * y - w0 * z), 2 * (x * z + w0 * y)], [2 * (x * y + w0 * z), w0 * w0 - x * x + y * y - z * z, 2 * (y * z - w0 * x)], [2 * (x * z - w0 * y), 2 * (y * z + w0 * x), w0 * w0 - x * x - y * y + z * z]];
  let num = 0; for (let i = 0; i < N; i++) { const a = q[i].map((t, k) => t - mq[k]), b = p[i].map((t, k) => t - mp[k]), ra = R.map(r => r[0] * a[0] + r[1] * a[1] + r[2] * a[2]); num += w[i] * (ra[0] * b[0] + ra[1] * b[1] + ra[2] * b[2]); }
  const s = num / qq, map = ([a0, a1, a2]) => { const a = [a0 - mq[0], a1 - mq[1], a2 - mq[2]]; return [0, 1, 2].map(r => mp[r] + s * (R[r][0] * a[0] + R[r][1] * a[1] + R[r][2] * a[2])); };
  return { s, R, map, pitch: Math.atan2(R[2][1], R[1][1]) * 180 / Math.PI };
}
const moveAll = (m, f) => { for (let i = 0; i < m.n; i++) { const r = f([m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]]); m.P[i * 3] = r[0]; m.P[i * 3 + 1] = r[1]; m.P[i * 3 + 2] = r[2]; } };
// the marks: each eye's front (ours: the front of the eyeball, its lid shut over it; the scan's: its shut lid, the furthest forward
// in a window round the eye), the crown (the top), the back of the head (furthest back down its middle, about the eyes' height
// and above), and each ear (the middle of what stands out from the side of the head round it)
const EYE_R = .0122 * 1.1 + .0012;
function skullMarks(m, eyes = null, unit = 1) {
  const P = m.P, out = {}; let top = 0, back = -1;
  for (let i = 0; i < m.n; i++) if (P[i * 3 + 1] > P[top * 3 + 1]) top = i;
  out.crown = [P[top * 3], P[top * 3 + 1], P[top * 3 + 2]];
  const ey = eyes ? (eyes[0][1] + eyes[1][1]) / 2 : 0, ex = eyes ? (eyes[0][0] + eyes[1][0]) / 2 : 0;
  for (let i = 0; i < m.n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (Math.abs(x - ex) < .006 * unit && y > ey - .005 * unit && y < ey + .07 * unit && (back < 0 || z < P[back * 3 + 2])) back = i; }
  out.back = [P[back * 3], P[back * 3 + 1], P[back * 3 + 2]];
  return out;
}
function earMarks(m, eyes) {
  // (in our frame, both heads alike: points beyond the side of the skull, behind the eye and level with it to two fingers below)
  const P = m.P, s = [[0, 0, 0, 0], [0, 0, 0, 0]], ex = (eyes[0][0] + eyes[1][0]) / 2;
  for (let i = 0; i < m.n; i++) { const x = P[i * 3] - ex, y = P[i * 3 + 1], z = P[i * 3 + 2]; if (Math.abs(x) < .064 || y < -.05 || y > .02 || z < -.035 || z > .025) continue; const k = x > 0 ? 0 : 1; s[k][0] += x + ex; s[k][1] += y; s[k][2] += z; s[k][3]++; }
  return s.map(([a, b, c, n]) => [a / n, b / n, c / n]);
}
const A0 = 'solve' in opt || opt.fit === 'off' ? A : ours({ ...opt, fit: 'off' });
const oursEyes = [[EYE[0], EYE[1], EYE[2] + EYE_R], [-EYE[0], EYE[1], EYE[2] + EYE_R]], oursSkull = skullMarks(A0), oursEars = earMarks(A0, oursEyes);
// the scan's eyes, in its own units: shut lids furthest forward in a window about where they are in its file (looked up once)
// (the top of the lid's bulge: the furthest forward on the surface, smoothed, in a window that keeps clear of the nose beside it and the brow over it)
const lidOf = (m, cx, cy, h) => { const res = h / 40, M = depth(m, 'front', [cx - h, cx + h, cy - h * .6, cy + h * .6], res), { W, H, D } = M; let best = -Infinity, at = null;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { let s2 = 0, n = 0; for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) { const d = D[(y + v) * W + x + u]; if (isFinite(d)) { s2 += d; n++; } } if (n === 25 && s2 / n > best) { best = s2 / n; at = [cx - h + (x + .5) * res, cy + h * .6 - (y + .5) * res, best]; } }
  return at; };
// (a head whose file says where its eyes are, as gnm-heads.py's do, needs no looking)
let scanEyes = B.extras.eyes ? B.extras.eyes.map(e => [...e]) : [lidOf(B, .48, 1.63, .2), lidOf(B, -.75, 1.63, .2)];
console.log('the scan\'s eyes (its own units)', JSON.stringify(scanEyes.map(e => e.map(t => +t.toFixed(3)))));
// first by the eyes and the skull (the scan's units are its own), then again with the ears too, found the same way in both once the scan lies in our frame
const KEYS3 = ['crown', 'back'], keysOf = (eyes, sk, ears) => [...eyes, ...KEYS3.map(k => sk[k]), ...(ears || [])];
let fitS = similar(keysOf(scanEyes, skullMarks(B, scanEyes, B.extras.unit ?? 20)), keysOf(oursEyes, oursSkull), [3, 3, 1, 1]);
moveAll(B, fitS.map); scanEyes = scanEyes.map(fitS.map);
let total = fitS.s;
for (let pass = 0; pass < 3; pass++) {
  const q = keysOf(scanEyes, skullMarks(B, scanEyes), earMarks(B, scanEyes)), p = keysOf(oursEyes, oursSkull, oursEars);
  fitS = similar(q, p, [3, 3, 1, 1, 1, 1]); moveAll(B, fitS.map); scanEyes = scanEyes.map(fitS.map); total *= fitS.s;
}
const alignErr = (() => { const q = keysOf(scanEyes, skullMarks(B, scanEyes), earMarks(B, scanEyes)), p = keysOf(oursEyes, oursSkull, oursEars), names = ['eye L', 'eye R', 'crown', 'back', 'ear L', 'ear R'];
  return Object.fromEntries(names.map((n, i) => [n, q[i].map((t, k) => +((t - p[i][k]) * 1000).toFixed(1))])); })();
const T = { s: total, th: 0 }, icp = { s: total, rms: 0, region: 'eyes, ears, skull', marks: alignErr };
console.log('laid over ours by eyes, ears and skull: mark differences (mm, x y z)', JSON.stringify(alignErr));
const FA = front(midline(A), .0005), mA = marks(FA), KEYS = ['n', 'prn', 'sn', 'sto', 'pg'];
const mB2 = marks(front(midline(B), .0005));

// ---- colour=out.json: the scan's points as they lie over ours (metres about the middle of our head) with where each is on its colour picture,
// for measuring the colour of a real face's skin part by part (scripts/face-lab/skin-colour.py reads it with the picture)
if (opt.colour) { fs.writeFileSync(opt.colour, JSON.stringify({ P: Array.from(B.P, v => +v.toFixed(5)), UV: Array.from(B.UV || [], v => +v.toFixed(5)), I: Array.from(B.I) })); console.log('wrote the scan\'s points and colour places to ' + opt.colour); }

// ---- solve=1: work out the fit (human-fit.js): how far to move our head's skin, smoothly, to lie on the scan's, and write it into that file
if ('solve' in opt) {
  const { head } = await import(path.join(ROOT, 'src/kit/models/human-head.js'));
  const { ready, smin, smax, ss } = await import(path.join(ROOT, 'src/kit/models/field.js'));
  const FM = await import(path.join(ROOT, 'src/kit/models/human-fit.js'));
  const [na, ne] = FM.FIT_N, MAX = FM.FIT_MAX, a = headArgs(opt);
  const fieldOf = tbl => { const L = ready(head({ ...a, fit: tbl || false }), .01).filter(q => !q.ghost && !q.paint);
    return (x, y, z) => { let d = 1e9; for (let j = 0; j < L.length; j++) { const q = L[j], e = q.d(x, y, z); d = q.cut ? smax(d, -e, q.k) : smin(d, e, q.k); } return d; }; };
  // the scan's points the fit is to reach: the whole head but where it is not let move (round the eyes: the scan's are shut; the ears; down the neck)
  // (and only the outermost by each direction from the table's middle: not the insides of the nostrils, the ears or a fold, which the table can't reach)
  // (nor the front of the throat under the chin: the neck is the body's, and a scan whose jaw sits lower than ours pulled the throat in under a
  // chin it dropped, which left a lump there; with no point there the throat follows the chin by the table's smoothness)
  // (seen from outside: a ray from the point straight out from the table's middle meets no more of the scan: not the inside of its mouth
  // or nostrils, an ear's folds, a crease)
  const C = FM.FIT_C, BIN = Math.PI / 60, dirOf = (x, y, z) => [Math.atan2(x, z - C[1]), Math.atan2(y - C[0], Math.hypot(x, z - C[1]))], tb = new Map(), key = (a2, e) => a2 + ',' + e;
  for (let t = 0; t < B.I.length; t += 3) { let a0 = 9, a1 = -9, e0 = 9, e1 = -9; const vs = [B.I[t], B.I[t + 1], B.I[t + 2]];
    for (const v of vs) { const [a2, e] = dirOf(B.P[v * 3], B.P[v * 3 + 1], B.P[v * 3 + 2]); a0 = Math.min(a0, a2); a1 = Math.max(a1, a2); e0 = Math.min(e0, e); e1 = Math.max(e1, e); }
    if (a1 - a0 > Math.PI) continue;   // (one straight behind, across the seam of the turn: never in front of a point we keep)
    for (let i = Math.floor(a0 / BIN); i <= Math.floor(a1 / BIN); i++) for (let j = Math.floor(e0 / BIN); j <= Math.floor(e1 / BIN); j++) (tb.get(key(i, j)) || tb.set(key(i, j), []).get(key(i, j))).push(t); }
  const hidden = i => { const o = [B.P[i * 3], B.P[i * 3 + 1], B.P[i * 3 + 2]], d0 = [o[0], o[1] - C[0], o[2] - C[1]], l = Math.hypot(...d0), d = d0.map(v => v / l), [a2, e] = dirOf(...o);
    for (const t of tb.get(key(Math.floor(a2 / BIN), Math.floor(e / BIN))) || []) { const ia = B.I[t], ib = B.I[t + 1], ic = B.I[t + 2]; if (ia === i || ib === i || ic === i) continue;
      const A2 = [B.P[ia * 3], B.P[ia * 3 + 1], B.P[ia * 3 + 2]], e1 = [B.P[ib * 3] - A2[0], B.P[ib * 3 + 1] - A2[1], B.P[ib * 3 + 2] - A2[2]], e2 = [B.P[ic * 3] - A2[0], B.P[ic * 3 + 1] - A2[1], B.P[ic * 3 + 2] - A2[2]];
      const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]; if (Math.abs(det) < 1e-12) continue;
      const sv = [o[0] - A2[0], o[1] - A2[1], o[2] - A2[2]], u = (sv[0] * h[0] + sv[1] * h[1] + sv[2] * h[2]) / det; if (u < 0 || u > 1) continue;
      const q = [sv[1] * e1[2] - sv[2] * e1[1], sv[2] * e1[0] - sv[0] * e1[2], sv[0] * e1[1] - sv[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (v < 0 || u + v > 1) continue;
      if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > .002) return true; }
    return false; };
  const pts = []; let seen = 0; for (let i = 0; i < B.n; i++) { const x = Math.abs(B.P[i * 3]), y = B.P[i * 3 + 1], z = B.P[i * 3 + 2]; if (y > .14 || y < -.135 || FM.fitWeight(x, y, z) < .5 || FM.fitPlace(x, y, z)[2] < .05 || (y < -.105 && z < .05 && x < .045)) continue; seen++; if (!hidden(i)) pts.push([x, y, z]); }
  console.log('scan points', seen, 'seen from outside', pts.length);
  // Least squares, a few times over (the head's measure is not quite straight in how far the skin moves): the table's heights such that,
  // read at each scan point the way fitAt reads them, they move our skin onto it, while (lam) neighbouring heights differ as little as
  // they can, so the move changes slowly across the head and inside it (where no point holds it, it eases off to nothing: the inside of
  // the head is never pushed out through the skin), and (kap) heights no point needs stay at nothing. A point the skin is far from
  // (more than 6 mm) counts for less, so a few the shapes can't reach (a fold the scan has and ours hasn't) don't pull the rest.
  const NC = na * ne, T = new Float32Array(NC), lam = +(opt.lam ?? 3), kap = +(opt.kap ?? .02), WA = [0, 0, 0, 0], WE = [0, 0, 0, 0];
  const crw = (t, w) => { const t2 = t * t, t3 = t2 * t; w[0] = -.5 * t3 + t2 - .5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + .5 * t; w[3] = .5 * t3 - .5 * t2; };
  // each point's cells and how much of each it reads (as fitAt: by its direction, times fitWeight and the fade near the middle)
  const rowsOf = pts.map(([x, y, z]) => { const [ga, ge, r] = FM.fitPlace(x, y, z), m = new Map(), fw = FM.fitWeight(x, y, z) * ss(.025, .05, r);
    const ia = Math.floor(ga), ie = Math.floor(ge); crw(ga - ia, WA); crw(ge - ie, WE);
    for (let b = 0; b < 4; b++) for (let a2 = 0; a2 < 4; a2++) { const at = FM.fitCell(ia - 1 + a2, ie - 1 + b); m.set(at, (m.get(at) || 0) + WA[a2] * WE[b] * fw); }
    return m; }).map(m => ({ c: Int32Array.from(m.keys()), w: Float64Array.from(m.values()) }));
  // (neighbours: along a row the cells are nearer each other the nearer the top or the bottom, so they are held closer there)
  const edges = [], ew = []; for (let j = 0; j < ne; j++) { const c = Math.max(.1, Math.cos((j * FM.FIT_STEP) - Math.PI / 2)); for (let i = 0; i < na; i++) { const at = j * na + i; if (i + 1 < na) { edges.push(at, at + 1); ew.push(lam / c); } if (j + 1 < ne) { edges.push(at, at + na); ew.push(lam * c); } } }
  const read = (R, t) => { let v = 0; for (let q = 0; q < R.c.length; q++) v += R.w[q] * t[R.c[q]]; return v; };
  for (let it = 0; it < +(opt.iters || 6); it++) {
    const F = fieldOf(it ? T : null), r = pts.map(([x, y, z]) => F(x, y + HC[1], z + HC[2]));
    let e2 = 0; r.forEach(v => { e2 += Math.min(v * v, .02 * .02); });
    console.log('fit pass', it, 'points', pts.length, 'rms mm', (Math.sqrt(e2 / pts.length) * 1000).toFixed(2), 'beyond 10 mm out', r.filter(v => v > .01).length, 'in', r.filter(v => v < -.01).length);
    if ('trace' in opt) { const box = { 'jaw side': p2 => p2[0] > .035 && p2[0] < .06 && p2[1] < -.06 && p2[1] > -.1 && p2[2] > 0, 'upper lip': p2 => p2[0] < .02 && p2[1] < -.048 && p2[1] > -.06 && p2[2] > .05, 'mouth side': p2 => p2[0] > .02 && p2[0] < .035 && p2[1] < -.05 && p2[1] > -.075 && p2[2] > .04 };
      { const far = new Map(); r.forEach((v, i) => { if (Math.abs(v) > .008) { const k = [0, 1, 2].map(a2 => Math.round(pts[i][a2] * 50) * 20).join(',') + (v > 0 ? ' out' : ' in'); far.set(k, (far.get(k) || 0) + 1); } }); console.log('    far (mm x,y,z by 2 cm):', JSON.stringify([...far].sort((a2, b2) => b2[1] - a2[1]).slice(0, 12))); }
      console.log('   ', Object.entries(box).map(([k, f2]) => { const v = r.filter((_, i) => f2(pts[i])); return k + ' ' + v.length + ' mean ' + (v.reduce((a2, b2) => a2 + b2, 0) / v.length * 1000).toFixed(1); }).join(', ')); }
    // the targets: what each point's reading should come to (its reading now plus how far the skin is from it), and how much it counts
    const tgt = pts.map((_, i) => read(rowsOf[i], T) + Math.max(-.012, Math.min(.012, r[i]))), wt = r.map(v => 1 / (1 + (v / .006) ** 2));
    // (A t = b by conjugate gradients, from the table as it is)
    const Av = (v, out) => { out.fill(0); for (let i = 0; i < pts.length; i++) { const R = rowsOf[i], s2 = read(R, v) * wt[i]; for (let q = 0; q < R.c.length; q++) out[R.c[q]] += R.w[q] * s2; }
      for (let e = 0; e < edges.length; e += 2) { const a2 = edges[e], b2 = edges[e + 1], d = ew[e / 2] * (v[a2] - v[b2]); out[a2] += d; out[b2] -= d; } for (let c = 0; c < NC; c++) out[c] += kap * v[c]; return out; };
    const b = new Float64Array(NC); for (let i = 0; i < pts.length; i++) { const R = rowsOf[i]; for (let q = 0; q < R.c.length; q++) b[R.c[q]] += R.w[q] * tgt[i] * wt[i]; }
    const x = Float64Array.from(T), rr = new Float64Array(NC), Ap = new Float64Array(NC); Av(x, Ap); for (let c = 0; c < NC; c++) rr[c] = b[c] - Ap[c];
    const pp = Float64Array.from(rr); let rs = rr.reduce((s2, v) => s2 + v * v, 0);
    for (let k = 0; k < 400 && rs > 1e-20; k++) { Av(pp, Ap); let pAp = 0; for (let c = 0; c < NC; c++) pAp += pp[c] * Ap[c]; const al = rs / pAp; for (let c = 0; c < NC; c++) { x[c] += al * pp[c]; rr[c] -= al * Ap[c]; } const rn = rr.reduce((s2, v) => s2 + v * v, 0); for (let c = 0; c < NC; c++) pp[c] = rr[c] + rn / rs * pp[c]; rs = rn; }
    for (let c = 0; c < NC; c++) T[c] = Math.max(-MAX, Math.min(MAX, x[c]));
  }
  { let lo2 = 0, hi2 = 0; for (const t of T) { lo2 = Math.min(lo2, t); hi2 = Math.max(hi2, t); } console.log('the table: from', (lo2 * 1000).toFixed(1), 'to', (hi2 * 1000).toFixed(1), 'mm'); }
  { const F = fieldOf(T), r = pts.map(([x, y, z]) => F(x, y + HC[1], z + HC[2])); let e2 = 0, c = 0; r.forEach(v => { if (Math.abs(v) < .02) { e2 += v * v; c++; } }); console.log('fitted: rms mm', (Math.sqrt(e2 / c) * 1000).toFixed(2)); }
  const bytes = Buffer.from(Array.from(T, v => (Math.round(v / MAX * 127) + 256) % 256));
  if (opt.table) { fs.writeFileSync(opt.table, JSON.stringify({ scan: opt.scan || 'LeePerrySmith', fem: 'fem' in opt, data: bytes.toString('base64') })); console.log('wrote the table to', opt.table); process.exit(0); }
  const file = path.join(ROOT, 'src/kit/models/human-fit.js'), src = fs.readFileSync(file, 'utf8');
  // kin=f:african (with scan=gnm/f-black-0 fem): the fit of that sex and heritage (FIT_KIN), not the scan's
  if (opt.kin) { const re = new RegExp(`'${opt.kin}': '[^']*'`); if (!re.test(src)) { console.error('no ' + opt.kin + ' in FIT_KIN'); process.exit(1); }
    fs.writeFileSync(file, src.replace(re, `'${opt.kin}': '${bytes.toString('base64')}'`)); console.log('wrote', opt.kin, 'into', file); process.exit(0); }
  fs.writeFileSync(file, src.replace(/export const FIT_DATA = '[^']*';/, `export const FIT_DATA = '${bytes.toString('base64')}';`));
  let big = 0; for (const v of T) big = Math.max(big, Math.abs(v)); console.log('wrote', file, bytes.length, 'points, largest move mm', (big * 1000).toFixed(1));
  process.exit(0);
}
if ('profile' in opt) { const a = front(midline(A), .001), b = front(midline(B), .001); for (let y = .09; y >= -.13; y -= .002) { const za = a.z[Math.round((y - a.lo) / a.step)], zb = b.z[Math.round((y - b.lo) / b.step)]; console.log((y * 1000).toFixed(0).padStart(5), (za * 1000).toFixed(1).padStart(7), (zb * 1000).toFixed(1).padStart(7), ((za - zb) * 1000).toFixed(1).padStart(6)); } }
const lmErr = KEYS.map(k => Math.hypot(mA[k][0] - mB2[k][0], mA[k][1] - mB2[k][1]) * 1000);

const R = .0005, boxF = [-.11, .11, -.2, .14], boxS = [-.14, .16, -.2, .14], boxT = [-.11, .11, -.15, .14];
// part=nose|mouth|jaw|eyes|brow: that part close, both heads from the front, the side, three quarters and below, in plaster
const PARTS = { nose: [.035, -.065, .015, .07, .125], mouth: [.045, -.11, -.035, .05, .115], jaw: [.085, -.16, -.03, -.06, .11], eyes: [.07, -.03, .035, .03, .11], brow: [.08, -.01, .09, .02, .11] };
if (opt.part) {
  const [hw, y0, y1, z0, z1] = PARTS[opt.part], r = .00012 * (hw / .035), bF = [-hw, hw, y0, y1], bS = [-z1, -z0, y0, y1], bB = [-hw, hw, -z1, -z0];
  const zc = (z0 + z1) / 2, sa = Math.sin(35 * Math.PI / 180), ca = Math.cos(35 * Math.PI / 180), bQ = [-hw + zc * sa * 0 - zc * sa, hw - zc * sa, y0, y1];
  // (from below: only what is between the part's own heights, so the lips and the chin under a nose do not hide it)
  const under = m => { const keep = []; for (let t = 0; t < m.I.length; t += 3) { const yy = (m.P[m.I[t] * 3 + 1] + m.P[m.I[t + 1] * 3 + 1] + m.P[m.I[t + 2] * 3 + 1]) / 3; if (yy > y0 + .3 * (y1 - y0) && yy < y1) keep.push(m.I[t], m.I[t + 1], m.I[t + 2]); } return { n: m.n, I: keep, P: Float32Array.from(m.P, (t, i) => i % 3 === 1 ? -t : t) }; };
  const shots = [['front', bF], ['side', bS], ['quarter', bQ], ['below', bB]].map(([v, b]) => [v, [A, B].map(m => plaster(v === 'below' ? depth(under(m), 'top', b, r) : depth(m, v, b, r)))]);
  const html = `<!doctype html><body style="margin:0;background:#fafaf7;font:600 15px system-ui"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px">${shots.map(([v, ps]) => ps.map((p2, k) => `<div><div>${k ? 'Scan' : 'Ours'}, ${v}</div><img style="width:100%" src="${png(p2)}"></div>`).join('')).join('')}</div>`;
  const { chromium } = require('playwright'), br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1800, height: 900 } });
  await pg.setContent(html); await pg.waitForLoadState('load'); await pg.screenshot({ path: out, fullPage: true }); await br.close(); console.log('saved', out); process.exit(0);
}
const F = [depth(A, 'front', boxF, R), depth(B, 'front', boxF, R)], Sd = [depth(A, 'side', boxS, R), depth(B, 'side', boxS, R)], Q = [depth(A, 'quarter', boxF, R), depth(B, 'quarter', boxF, R)];
const dF = diff(F[0], F[1]), dS = diff(Sd[0], Sd[1]);
// eyering=1: ours less the scan's from in front (mm), on rings round the left eye (by angle from straight out to the side, going up)
if ('eyering' in opt) { const at = (M, x, y) => { const i = Math.round((x - M.box[0]) / M.res - .5), j = Math.round((M.box[3] - y) / M.res - .5); return M.D[j * M.W + i]; };
  console.log('ring mm  ' + [0, 45, 90, 135, 180, 225, 270, 315].map(a2 => String(a2).padStart(6)).join(''));
  for (const rr of [.014, .017, .02, .024, .028, .033, .04]) console.log(String(rr * 1000).padStart(7) + '  ' + [0, 45, 90, 135, 180, 225, 270, 315].map(a2 => { const x = EYE[0] + rr * Math.cos(a2 * Math.PI / 180), y = EYE[1] + rr * Math.sin(a2 * Math.PI / 180); return ((at(F[0], x, y) - at(F[1], x, y)) * 1000).toFixed(1).padStart(6); }).join('')); }
// the difference by part of the head (mm, ours less the scan's: + ours stands further out), from the front (z) and the side (x)
const REG = { front: { forehead: [0, .035, .03, .07], brow: [.012, .05, .012, .03], 'nose ridge': [0, .008, -.03, 0], cheeks: [.025, .055, -.045, -.012], temples: [.05, .066, 0, .04], 'upper lip': [0, .02, -.06, -.048], 'mouth sides': [.02, .035, -.075, -.05], chin: [0, .02, -.105, -.075], 'jaw sides': [.035, .055, -.1, -.06], neck: [0, .04, -.15, -.12] },
  side: { 'cheek side': [-.05, 0, -.05, 0], 'temple side': [-.05, 0, 0, .05], 'jaw angle': [-.02, .03, -.1, -.06], 'under ear': [-.03, .02, -.12, -.09], 'back of head': [.05, .12, -.02, .08] } };
const regionStats = (A2, B2, boxes, side) => Object.fromEntries(Object.entries(boxes).map(([k, [a0, a1, y0, y1]]) => { let s2 = 0, c = 0;
  for (let j = 0; j < A2.H; j++) for (let i = 0; i < A2.W; i++) { const u = A2.box[0] + (i + .5) * A2.res, v = A2.box[3] - (j + .5) * A2.res, uu = side ? u : Math.abs(u); if (uu < a0 || uu > a1 || v < y0 || v > y1) continue; const d1 = A2.D[j * A2.W + i], d2 = B2.D[j * A2.W + i]; if (isFinite(d1) && isFinite(d2)) { s2 += d1 - d2; c++; } }
  return [k, c ? +(s2 / c * 1000).toFixed(1) : null]; }));
const LEVELS = [.06, .035, .015, 0, -.02, -.045, -.065, -.09, -.12];
const cuts = LEVELS.map(y => [slice(A, y), slice(B, y)]);

// measures (mm), both heads
const span = (m, y, zmin) => { let w = 0; for (const [p, q] of slice(m, y)) for (const [x, z] of [p, q]) if (z > zmin) w = Math.max(w, Math.abs(x)); return w * 2000; };
const maxOver = (m, y0, y1, zmin) => { let w = 0; for (let y = y0; y <= y1; y += .002) w = Math.max(w, span(m, y, zmin)); return w; };
const measures = m => {
  const M = marks(front(midline(m), .0005)), d = (a, b) => Math.abs(M[a][0] - M[b][0]) * 1000;
  return {
    'nose root to tip (n-prn)': d('n', 'prn'), 'nose root to under it (n-sn)': d('n', 'sn'), 'under the nose to lips meeting (sn-sto)': d('sn', 'sto'), 'lips meeting to chin point (sto-pg)': d('sto', 'pg'),
    'nose sticks out (prn - sn, depth)': (M.prn[1] - M.sn[1]) * 1000, 'chin point ahead of the lip hollow': (M.pg[1] - M.sl[1]) * 1000, 'nose root behind the tip': (M.prn[1] - M.n[1]) * 1000,
    'forehead width (y +45)': span(m, .045, .02), 'brow width (y +18)': span(m, .018, 0), 'cheekbone width (widest, y -40..0, in front of ears)': maxOver(m, -.04, 0, .015),
    'jaw width (widest, y -95..-70)': maxOver(m, -.095, -.07, -.03), 'mouth level width (y -65)': span(m, -.065, 0), 'head breadth (widest above ears)': maxOver(m, .02, .09, -.2),
    'head length (front to back, brow level)': (() => { let a = -1, b = 1; for (const [p, q] of slice(m, .02)) for (const [x, z] of [p, q]) if (Math.abs(x) < .01) { a = Math.max(a, z); b = Math.min(b, z); } return (a - b) * 1000; })(),
    'crown above the eyes': (() => { let t = -1; for (let i = 0; i < m.n; i++) t = Math.max(t, m.P[i * 3 + 1]); return t * 1000; })(),
    'neck width (y -150)': span(m, -.15, -.2), 'neck depth (y -150)': (() => { let a = -1, b = 1; for (const [p, q] of slice(m, -.15)) for (const [x, z] of [p, q]) if (Math.abs(x) < .01) { a = Math.max(a, z); b = Math.min(b, z); } return (a - b) * 1000; })(),
  };
};
const MA = measures(A), MB = measures(B);
const regions = { front: regionStats(F[0], F[1], REG.front, false), side: regionStats(Sd[0], Sd[1], REG.side, true) };
const result = { icp, regions, scale: T.s, tilt: T.th * 180 / Math.PI, landmarkError: Object.fromEntries(KEYS.map((k, i) => [k, +lmErr[i].toFixed(1)])), front: { meanMm: dF.mean * 1000, absMm: dF.mad * 1000 }, side: { meanMm: dS.mean * 1000, absMm: dS.mad * 1000 },
  measures: Object.fromEntries(Object.keys(MA).map(k => [k, { ours: +MA[k].toFixed(1), scan: +MB[k].toFixed(1), diff: +(MA[k] - MB[k]).toFixed(1) }])), marksOurs: mA, marksScan: mB2 };
fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(result, null, 1));

// ---- the sheet, drawn in a browser page
const px = (M, x) => (x - M.box[0]) / M.res, py = (M, y) => (M.box[3] - y) / M.res;
const outl = M => outline(M).map(([x, y]) => [x, y]);
const page = {
  plaster: { front: [png(plaster(F[0])), png(plaster(F[1]))], side: [png(plaster(Sd[0])), png(plaster(Sd[1]))], quarter: [png(plaster(Q[0])), png(plaster(Q[1]))] },
  diff: { front: png(dF), side: png(dS) }, outlines: { front: [outl(F[0]), outl(F[1])], side: [outl(Sd[0]), outl(Sd[1])] },
  sizes: { front: [F[0].W, F[0].H], side: [Sd[0].W, Sd[0].H] },
  cuts: cuts.map(([a, b], i) => ({ y: LEVELS[i], a: a.map(s => s.map(([x, z]) => [x, z])), b: b.map(s => s.map(([x, z]) => [x, z])) })),
  marks: { ours: Object.fromEntries(Object.entries(mA).map(([k, [y, z]]) => [k, [px(Sd[0], -z), py(Sd[0], y)]])), scan: Object.fromEntries(Object.entries(mB2).map(([k, [y, z]]) => [k, [px(Sd[0], -z), py(Sd[0], y)]])) },
  result,
};
const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fafaf7;font:13px system-ui;color:#222"><canvas id=c></canvas><script>
const D = ${JSON.stringify(page)};
const c = document.getElementById('c'), g = c.getContext('2d'), CW = 1800, CH = 1500; c.width = CW; c.height = CH; g.fillStyle = '#fafaf7'; g.fillRect(0, 0, CW, CH);
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
const label = (t, x, y, s = 14, col = '#222', b = 600) => { g.font = b + ' ' + s + 'px system-ui'; g.fillStyle = col; g.fillText(t, x, y); };
(async () => {
  const sc = .62, row1 = 30;
  const imgs = [[D.plaster.front[0], 'Ours, front'], [D.plaster.front[1], 'Scan, front'], [D.plaster.side[0], 'Ours, side'], [D.plaster.side[1], 'Scan, side'], [D.plaster.quarter[0], 'Ours, three quarters'], [D.plaster.quarter[1], 'Scan, three quarters']];
  let x = 10;
  for (const [s, t] of imgs) { const i = await load(s); g.drawImage(i, x, row1, i.width * sc, i.height * sc); label(t, x + 6, row1 - 8); x += i.width * sc + 8; }
  // outlines over each other
  const y2 = row1 + 680 * sc + 40, OA = '#d0601c', OB = '#1c86c8';
  const dots = (pts, ox, oy, s, col) => { g.fillStyle = col; for (const [a, b] of pts) g.fillRect(ox + a * s, oy + b * s, 1.4, 1.4); };
  label('Outlines: ours (orange), scan (blue)', 10, y2 - 8); const s2 = .62;
  dots(D.outlines.front[1], 10, y2, s2, OB); dots(D.outlines.front[0], 10, y2, s2, OA);
  dots(D.outlines.side[1], 160, y2, s2, OB); dots(D.outlines.side[0], 160, y2, s2, OA);
  for (const [k, [a, b]] of Object.entries(D.marks.ours)) { g.fillStyle = OA; g.beginPath(); g.arc(160 + a * s2, y2 + b * s2, 2.5, 0, 7); g.fill(); }
  for (const [k, [a, b]] of Object.entries(D.marks.scan)) { g.strokeStyle = OB; g.beginPath(); g.arc(160 + a * s2, y2 + b * s2, 4, 0, 7); g.stroke(); }
  // the difference
  const y3 = y2; let x3 = 360;
  for (const [s, t] of [[D.diff.front, 'Depth difference, front (red: ours further out, blue: sunk in; a line every 2 mm, full colour at 8 mm)'], [D.diff.side, 'Depth difference, side']]) { const i = await load(s); g.drawImage(i, x3, y3, i.width * .75, i.height * .75); label(t, x3, y3 - 8, 12); x3 += i.width * .75 + 12; }
  // slices
  const y4 = y3 + 680 * .75 + 40; label('Slices across the head, seen from above (front up): ours orange, scan blue', 10, y4 - 10);
  D.cuts.forEach((cu, k) => { const ox = 10 + k * 195 + 95, oy = y4 + 150, s = 760;
    g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(ox - 90, oy); g.lineTo(ox + 90, oy); g.moveTo(ox, oy - 140); g.lineTo(ox, oy + 120); g.stroke();
    for (const [segs, col] of [[cu.b, OB], [cu.a, OA]]) { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); for (const [[x1, z1], [x2, z2]] of segs) { g.moveTo(ox + x1 * s, oy - z1 * s); g.lineTo(ox + x2 * s, oy - z2 * s); } g.stroke(); }
    label('y ' + (cu.y * 1000).toFixed(0) + ' mm', ox - 30, oy + 140, 12, '#444', 500); });
  // the table
  const y5 = y4 + 330, R = D.result; label('Measures (mm). Scan scaled by ' + R.scale.toFixed(4) + ', tilted ' + R.tilt.toFixed(1) + '°, to lay its marks down the face over ours (left over, mm: ' + Object.entries(R.landmarkError).map(([k, v]) => k + ' ' + v).join(', ') + ')', 10, y5, 13);
  label('Front depth: ours is on average ' + R.front.meanMm.toFixed(1) + ' mm ' + (R.front.meanMm > 0 ? 'out' : 'in') + ', ' + R.front.absMm.toFixed(1) + ' mm off; side: ' + R.side.meanMm.toFixed(1) + ' mm, ' + R.side.absMm.toFixed(1) + ' mm off', 10, y5 + 20, 13, '#444', 500);
  const ks = Object.keys(R.measures); ks.forEach((k, i) => { const m = R.measures[k], col = i < 9 ? 0 : 1, ry = y5 + 50 + (i % 9) * 19, rx = 10 + col * 880;
    label(k, rx, ry, 13, '#333', 500); label(m.ours.toFixed(1), rx + 520, ry, 13, OA); label(m.scan.toFixed(1), rx + 600, ry, 13, OB); label((m.diff > 0 ? '+' : '') + m.diff.toFixed(1), rx + 680, ry, 13, Math.abs(m.diff) > 4 ? '#c00' : '#333'); });
  document.title = 'done';
})();
</script>`;
const { chromium } = require('playwright');
const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1800, height: 1500 } });
await pg.setContent(html); await pg.waitForFunction(() => document.title === 'done', null, { timeout: 60000 });
await pg.screenshot({ path: out, clip: { x: 0, y: 0, width: 1800, height: 1500 } }); await br.close();
console.log('by part (mm, + ours further out):', JSON.stringify(regions));
console.log(JSON.stringify({ icp, scale: result.scale, tilt: result.tilt, landmarkError: result.landmarkError, front: result.front, side: result.side }, null, 0));
for (const [k, m] of Object.entries(result.measures)) console.log(k.padEnd(52), String(m.ours).padStart(7), String(m.scan).padStart(7), String(m.diff).padStart(7));
console.log('saved', out);
