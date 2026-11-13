// A real head of hair's strips (cards), as games draw hair close up: some hundreds of narrow strips lying over the sculpted hair, each
// carrying a picture of sixty-odd hairs whose edges and tips are see-through (human-paint.js paintCards), so the hair's outline, its
// hairline and the ends of long hair break up into strands instead of ending in the sculpted shape's clean edge. Each strip runs the way the
// hair is combed (out from the crown and down, or back into a bun), following the head: it is walked a few millimetres at a time over the
// sculpted hair, and where that ends (at the hairline, over an ear, round the bottom of long hair) its tips run on a little way, over the
// skin or into the air. Worked out with the head (human-shapes.js sculpt: off the main thread, and saved with it), in plain numbers; human.js
// colours it and puts it on the person's bones, and draws it close up only. Kit use only.
import { HC, ss } from './human-head.js';
import { CARD } from './human-paint.js';

const abs = Math.abs, mn = Math.min, mx = Math.max;
// where the hair is combed from: the crown (a little behind the top of the head), or the bun it is drawn back into
const CROWN = [HC[0], HC[1] + .1, HC[2] - .045], BUN = [HC[0], HC[1] + .03, HC[2] - .112];

// the slots of a head that are its skin's surface (human.js AS: drawn as skin); its hair is the slot 'hair'
const SKIN = new Set(['skin', 'lips', 'lid', 'lash', 'brow']), HAIRK = 1, SKINK = 2;
/**
 * The strips over a real face's sculpted hair (or null: too little hair). head: the head's piece (P, N in 16 bits, ao, slot, slots, n);
 * style: 'short' (a woman's: a bob), 'long' or 'bun'; fem: a woman's (a man's short back and sides are clipped close: human.js).
 * Returns { P (positions), N (normals, 16 bits: the sculpted hair's under each, so a strip is lit as that hair is), U (uv: u across the
 * strip, on one of the picture's kinds; v from its root, 0, to its tips, 1), at (the head's point under each, whose colour and bones it
 * takes), dim (how much darker than that colour, 8 bits, 200 the same), I (triangles), cards (how many), edge: { at, to, k } (the hair's
 * points near its edge, the skin's point nearest each and how far, 8 bits, its colour eases toward that one's: easeEdge) }.
 */
export function hairStrips(head, { style = 'short', fem = false } = {}) {
  const n = head.n, P = head.P, NN = head.N, cls = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const s = head.slots[head.slot[i]]; cls[i] = s === 'hair' ? HAIRK : SKIN.has(s) ? SKINK : 0; }
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // the head's surface points (its hair and its skin) by where they are, in cubes as big as the reach of a sample
  const G = .005, grid = new Map(), hair = [], hairAll = [], skinPts = [];
  // (cubes counted from the middle of the head, so a cube's number stays small, which a Map looks up fastest)
  const key = (i, j, k) => ((i + 256) * 512 + j + 256) * 512 + k + 256;
  // (one point in each cube of 1.6 mm is enough to say where the surface lies and which way it faces: the head has some to the millimetre)
  const seen = new Set(), F6 = .0016;
  for (let i = 0; i < n; i++) {
    const k = cls[i]; if (k !== HAIRK && k !== SKINK) continue; if (k === HAIRK) hairAll.push(i);
    const f = key(Math.floor((P[i * 3] - HC[0]) / F6), Math.floor((P[i * 3 + 1] - HC[1]) / F6), Math.floor((P[i * 3 + 2] - HC[2]) / F6)) * 2 + (k === HAIRK ? 1 : 0); if (seen.has(f)) continue; seen.add(f);
    const ci = Math.floor((P[i * 3] - HC[0]) / G), cj = Math.floor((P[i * 3 + 1] - HC[1]) / G), ck = Math.floor((P[i * 3 + 2] - HC[2]) / G), c = key(ci, cj, ck); let l = grid.get(c);
    if (!l) { grid.set(c, l = []); l.kinds = 0; l.at = [ci, cj, ck]; } l.push(i); l.kinds |= k;
    (k === HAIRK ? hair : skinPts).push(i);
  }
  if (hair.length < 60) return null;
  // (the cubes with hair, or skin, in or next to them: only there is the hair's edge, and only there is it looked for)
  const nearHair = new Set(), nearSkin = new Set();
  for (const l of grid.values()) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const q = key(l.at[0] + a, l.at[1] + b, l.at[2] + c); if (l.kinds & HAIRK) nearHair.add(q); if (l.kinds & SKINK) nearSkin.add(q);
  }
  const cellOf = i => key(Math.floor((P[i * 3] - HC[0]) / G), Math.floor((P[i * 3 + 1] - HC[1]) / G), Math.floor((P[i * 3 + 2] - HC[2]) / G));
  // the sculpted surface near a point: the points round it within G, weighted to the nearest; the point is laid onto the plane they make.
  // edge: the nearest point is skin, not hair (past the hairline). any: skin counts as surface too (tips lying on the skin). at: the nearest
  // hair point within G (-1: none)
  const S = { p: [0, 0, 0], n: [0, 0, 0], at: 0, edge: false };
  const sample = (x, y, z, any = false) => {
    S.at = -1; const ci = Math.floor((x - HC[0]) / G), cj = Math.floor((y - HC[1]) / G), ck = Math.floor((z - HC[2]) / G); let w = 0, ax = 0, ay = 0, az = 0, nx = 0, ny = 0, nz = 0, best = 1e9, bestHair = false, bh = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = grid.get(key(ci + a, cj + b, ck + c)); if (!l) continue;
      for (const i of l) {
        const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), isHair = cls[i] === HAIRK;
        if (d < best) { best = d; bestHair = isHair; }
        if (d >= G || !(isHair || any)) continue;
        const q = (1 - d / G) ** 2; w += q; ax += P[i * 3] * q; ay += P[i * 3 + 1] * q; az += P[i * 3 + 2] * q; nx += NN[i * 3] * q; ny += NN[i * 3 + 1] * q; nz += NN[i * 3 + 2] * q;
        if (isHair && d < bh) { bh = d; S.at = i; }
      }
    }
    if (w <= 0) return null;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; ax /= w; ay /= w; az /= w;
    const h = (x - ax) * nx + (y - ay) * ny + (z - az) * nz;
    S.p[0] = x - nx * h; S.p[1] = y - ny * h; S.p[2] = z - nz * h; S.n[0] = nx; S.n[1] = ny; S.n[2] = nz; S.edge = !bestHair; return S;
  };
  // the way the hair is combed at a point (along the surface): away from the crown and down, or into the bun
  const bob = fem && style === 'short', bun = style === 'bun', K = bun ? BUN : CROWN, A = [K[0] - HC[0], K[1] - HC[1], K[2] - HC[2]], al = Math.hypot(...A), droop = style === 'long' ? .8 : .35;
  A[0] /= al; A[1] /= al; A[2] /= al;
  const F = [0, 0, 0];
  const flow = (p, nv) => {
    const dx = p[0] - HC[0], dy = p[1] - HC[1], dz = p[2] - HC[2], r = Math.hypot(dx, dy, dz) || 1e-9, ca = (dx * A[0] + dy * A[1] + dz * A[2]) / r;
    let ex = dx / r * ca - A[0], ey = dy / r * ca - A[1], ez = dz / r * ca - A[2]; const e = Math.hypot(ex, ey, ez); if (e < 1e-6) return 0;
    ex /= e; ey /= e; ez /= e;
    if (bun) { F[0] = -ex; F[1] = -ey; F[2] = -ez; } else { F[0] = ex; F[1] = ey - droop; F[2] = ez; }
    const d = F[0] * nv[0] + F[1] * nv[1] + F[2] * nv[2]; F[0] -= d * nv[0]; F[1] -= d * nv[1]; F[2] -= d * nv[2];
    const fl = Math.hypot(F[0], F[1], F[2]); if (fl < 1e-6) return 0; F[0] /= fl; F[1] /= fl; F[2] /= fl; return e;
  };
  // facing out from the middle of the head (not the inside of long hair, where it turns in under itself)
  const outward = (p, nv, k = .15) => { const dx = p[0] - HC[0], dy = p[1] - HC[1] + .02, dz = p[2] - HC[2], r = Math.hypot(dx, dy, dz) || 1; return (dx * nv[0] + dy * nv[1] + dz * nv[2]) / r > k; };
  // a man's short back and sides (human.js clips them close): strips there are shorter
  const clipOf = p => fem ? 0 : ss(.035, -.03, p[1] - HC[1]) * (.75 + .25 * ss(-.02, -.06, p[2] - HC[2]));

  // ---- the roots: hair points picked at random, none nearer another than `space`
  const space = style === 'long' ? .0105 : .0115, roots = [], taken = new Map(), RG = space;
  const order = hair.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const nv = [0, 0, 0], pv = [0, 0, 0];
  for (const i of order) {
    pv[0] = P[i * 3]; pv[1] = P[i * 3 + 1]; pv[2] = P[i * 3 + 2]; nv[0] = NN[i * 3] / 32767; nv[1] = NN[i * 3 + 1] / 32767; nv[2] = NN[i * 3 + 2] / 32767;
    if (!outward(pv, nv, .3)) continue;
    if (bun ? Math.hypot(pv[0] - BUN[0], pv[1] - BUN[1], pv[2] - BUN[2]) < .04 : flow(pv, nv) < .12) continue;   // (at the crown itself there is no way to comb)
    const ci = Math.floor((pv[0] - HC[0]) / RG), cj = Math.floor((pv[1] - HC[1]) / RG), ck = Math.floor((pv[2] - HC[2]) / RG); let near = false;
    for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++) for (let c = -1; c <= 1 && !near; c++) {
      const l = taken.get(key(ci + a, cj + b, ck + c)); if (l) for (const q of l) if (Math.hypot(P[q * 3] - pv[0], P[q * 3 + 1] - pv[1], P[q * 3 + 2] - pv[2]) < space) { near = true; break; }
    }
    if (near) continue;
    const c = key(ci, cj, ck); let l = taken.get(c); if (!l) taken.set(c, l = []); l.push(i); roots.push(i);
  }

  // ---- each strip: walked from its root the way the hair is combed, over the sculpted hair
  const STEP = style === 'long' ? .007 : .005, cards = [];
  for (const i of roots) {
    const s0 = sample(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (!s0) continue;
    let p = s0.p.slice(), nrm = s0.n.slice(), at = s0.at < 0 ? i : s0.at; if (!flow(p, nrm)) continue;
    let dir = F.slice();
    const full = (style === 'long' ? .15 + .12 * rnd() : style === 'bun' ? .07 + .05 * rnd() : fem ? .08 + .05 * rnd() : .038 + .026 * rnd()) * (1 - 1.1 * clipOf(p));
    if (full < .012) continue;
    const spine = [{ p, n: nrm, at, tip: false }]; let len = 0;
    while (len < full) {
      const q = [p[0] + dir[0] * STEP, p[1] + dir[1] * STEP, p[2] + dir[2] * STEP], s = sample(q[0], q[1], q[2]);
      if (!s || s.edge || !outward(s.p, s.n) || (bun && Math.hypot(s.p[0] - BUN[0], s.p[1] - BUN[1], s.p[2] - BUN[2]) < .035)) {
        // past the end of the hair: the tips run on a little way, lying on the skin where there is skin, else on into the air (the ends of long
        // hair further, falling as they go)
        const air = !(s && s.edge) || bob, run = air && style === 'long' ? .015 + .03 * rnd() : mn(full - len, .006 + .01 * rnd()), steps = Math.max(1, Math.round(run / STEP));
        let tp = p;
        for (let k = 1; k <= steps; k++) {
          if (air) { dir = [dir[0], dir[1] - .25, dir[2]]; const dl = Math.hypot(...dir); dir = dir.map(v => v / dl); }
          tp = [tp[0] + dir[0] * STEP, tp[1] + dir[1] * STEP, tp[2] + dir[2] * STEP]; let tn = nrm; const sk = air ? null : sample(tp[0], tp[1], tp[2], true);
          if (sk && outward(sk.p, sk.n)) { tp = sk.p.slice(); tn = sk.n.slice(); }
          spine.push({ p: tp, n: tn, at, tip: true });
        }
        break;
      }
      p = s.p.slice(); nrm = s.n.slice(); if (s.at >= 0) at = s.at;
      if (flow(p, nrm)) { dir = [dir[0] * .55 + F[0] * .45, dir[1] * .55 + F[1] * .45, dir[2] * .55 + F[2] * .45]; }
      const d = dir[0] * nrm[0] + dir[1] * nrm[1] + dir[2] * nrm[2]; dir[0] -= d * nrm[0]; dir[1] -= d * nrm[1]; dir[2] -= d * nrm[2];
      const dl = Math.hypot(...dir) || 1; dir = dir.map(v => v / dl);
      spine.push({ p, n: nrm, at, tip: false }); len += STEP;
    }
    if (spine.length < 3) continue;
    cards.push({ spine, layer: rnd(), wide: (style === 'long' ? .015 : .012) * (.8 + .4 * rnd()), kind: Math.floor(rnd() * CARD.n), flip: rnd() < .5, shade: .96 + .08 * rnd(), full });
  }
  // ---- the hairline: short strips rooted on the skin just outside it, running in over the sculpted hair's edge, so the hair starts with a
  // few fine hairs and thickens, as it grows, in place of the edge of a cap. Their picture starts before its first hairs, on the skin
  // (a bob has no hairline round the face: it hangs beside it, standing off it)
  const edgeTaken = new Map(), EG = .005;
  if (bob) skinPts.length = 0;
  for (let i = skinPts.length - 1; i >= 0; i--) if (!nearHair.has(cellOf(skinPts[i]))) { skinPts[i] = skinPts[skinPts.length - 1]; skinPts.pop(); }
  for (let i = skinPts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = skinPts[i]; skinPts[i] = skinPts[j]; skinPts[j] = t; }
  for (const i of skinPts) {
    pv[0] = P[i * 3]; pv[1] = P[i * 3 + 1]; pv[2] = P[i * 3 + 2]; nv[0] = NN[i * 3] / 32767; nv[1] = NN[i * 3 + 1] / 32767; nv[2] = NN[i * 3 + 2] / 32767;
    if (!outward(pv, nv, .35)) continue;
    // (the hair near it: how near, and which way it lies)
    const ci = Math.floor((pv[0] - HC[0]) / G), cj = Math.floor((pv[1] - HC[1]) / G), ck = Math.floor((pv[2] - HC[2]) / G); let dh = 1e9, hi = -1, gx = 0, gy = 0, gz = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = grid.get(key(ci + a, cj + b, ck + c)); if (l) for (const q of l) {
        if (cls[q] !== HAIRK) continue; const dx = P[q * 3] - pv[0], dy = P[q * 3 + 1] - pv[1], dz = P[q * 3 + 2] - pv[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d >= G) continue;
        if (d < dh) { dh = d; hi = q; } const w = (1 - d / G) ** 2; gx += dx * w; gy += dy * w; gz += dz * w;
      }
    }
    if (dh < .0012 || dh > .0045) continue;
    const ei = Math.floor((pv[0] - HC[0]) / EG), ej = Math.floor((pv[1] - HC[1]) / EG), ek = Math.floor((pv[2] - HC[2]) / EG); let near = false;
    for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++) for (let c = -1; c <= 1 && !near; c++) {
      const l = edgeTaken.get(key(ei + a, ej + b, ek + c)); if (l) for (const q of l) if (Math.hypot(P[q * 3] - pv[0], P[q * 3 + 1] - pv[1], P[q * 3 + 2] - pv[2]) < EG) { near = true; break; }
    }
    if (near) continue;
    { const c = key(ei, ej, ek); let l = edgeTaken.get(c); if (!l) edgeTaken.set(c, l = []); l.push(i); }
    let dir = [gx, gy, gz]; { const d = dir[0] * nv[0] + dir[1] * nv[1] + dir[2] * nv[2]; dir = dir.map((v, k) => v - d * nv[k]); const dl = Math.hypot(...dir); if (dl < 1e-6) continue; dir = dir.map(v => v / dl); }
    let p = pv.slice(), nrm = nv.slice(), at = hi; const spine = [{ p, n: nrm, at, skin: true }], full = .012 + .012 * rnd();
    for (let len = 0; len < full; len += STEP * .8) {
      const q = [p[0] + dir[0] * STEP * .8, p[1] + dir[1] * STEP * .8, p[2] + dir[2] * STEP * .8], sa = sample(q[0], q[1], q[2], true); if (!sa) break;
      const onSkin = sa.edge, s = onSkin ? sa : sample(q[0], q[1], q[2]); if (!s || !outward(s.p, s.n)) break;
      p = s.p.slice(); nrm = s.n.slice(); if (s.at >= 0) at = s.at;
      const d = dir[0] * nrm[0] + dir[1] * nrm[1] + dir[2] * nrm[2]; dir = dir.map((v, k) => v - d * nrm[k]); const dl = Math.hypot(...dir) || 1; dir = dir.map(v => v / dl);
      spine.push({ p, n: nrm, at, skin: onSkin });
    }
    if (spine.length < 3 || spine.every(q => q.skin)) continue;
    cards.push({ spine, edge: true, layer: .4 + .6 * rnd(), wide: .008 + .003 * rnd(), kind: Math.floor(rnd() * CARD.n), flip: rnd() < .5, shade: .96 + .08 * rnd(), full });
  }
  if (!cards.length) return null;
  cards.sort((a, b) => a.layer - b.layer);   // (drawn from the innermost out: what is see-through is laid over what is under it)

  // ---- the strips' points: two across at each step, lifted off the sculpted hair by their layer
  const m = cards.reduce((a, c) => a + c.spine.length * 2, 0), tris = cards.reduce((a, c) => a + (c.spine.length - 1) * 2, 0);
  const Pp = new Float32Array(m * 3), Np = new Int16Array(m * 3), Up = new Float32Array(m * 2), At = new Uint32Array(m), Dm = new Uint8Array(m), Ip = m > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let v = 0, t = 0;
  for (const c of cards) {
    const L = c.spine.length, cum = [0]; for (let k = 1; k < L; k++) { const a = c.spine[k - 1].p, b = c.spine[k].p; cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
    // (the picture as long as the strip was meant to be, its tips at the strip's end: one cut short at the end of the hair shows the
    // picture's tips there, not all of it squeezed in. The root sinks into the sculpted hair, so where a strip starts never shows)
    const total = cum[L - 1] || 1, long = mx(total, c.full), u0 = (c.kind + (c.flip ? .985 : .015)) / CARD.n, u1 = (c.kind + (c.flip ? .015 : .985)) / CARD.n, lift = .0011 + .0026 * c.layer, dim = c.shade * (.93 + .07 * c.layer);
    for (let k = 0; k < L; k++) {
      const s = c.spine[k], a = c.spine[Math.max(0, k - 1)].p, b = c.spine[Math.min(L - 1, k + 1)].p, f = k / (L - 1);
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const [nx, ny, nz] = s.n; let sx = ty * nz - tz * ny, sy = tz * nx - tx * nz, sz = tx * ny - ty * nx; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;   // (across: the way along it, crossed with the normal)
      const h = c.edge ? (s.skin ? .0005 : lift) : s.tip ? mn(lift, .0008) : -.0016 + (lift + .0016) * ss(0, .014, cum[k]) * (1 - .25 * f), wd = c.wide * (1 - .3 * f) / 2, cx = s.p[0] + nx * h, cy = s.p[1] + ny * h, cz = s.p[2] + nz * h;
      for (let e = 0; e < 2; e++) {
        const sg = e ? 1 : -1, j = v + e;
        Pp[j * 3] = cx + sx * wd * sg; Pp[j * 3 + 1] = cy + sy * wd * sg; Pp[j * 3 + 2] = cz + sz * wd * sg;
        Np[j * 3] = Math.round(nx * 32767); Np[j * 3 + 1] = Math.round(ny * 32767); Np[j * 3 + 2] = Math.round(nz * 32767);
        Up[j * 2] = e ? u1 : u0; Up[j * 2 + 1] = c.edge ? -.15 + 1.15 * cum[k] / total : 1 - (total - cum[k]) / long;
        At[j] = s.at; Dm[j] = Math.round(200 * dim);
      }
      if (k < L - 1) { const l0 = v, r0 = v + 1, l1 = v + 2, r1 = v + 3; Ip[t++] = l0; Ip[t++] = r0; Ip[t++] = l1; Ip[t++] = r0; Ip[t++] = r1; Ip[t++] = l1; }
      v += 2;
    }
  }
  // ---- the hair's edge: each of its points within G of the skin, with the nearest skin point and how near (easeEdge)
  const ea = [], et = [], ek = [];
  for (const i of hairAll) {
    if (!nearSkin.has(cellOf(i))) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ci = Math.floor((x - HC[0]) / G), cj = Math.floor((y - HC[1]) / G), ck = Math.floor((z - HC[2]) / G); let best = G, bi = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = grid.get(key(ci + a, cj + b, ck + c)); if (l) for (const q of l) { if (cls[q] !== SKINK) continue; const d = Math.hypot(P[q * 3] - x, P[q * 3 + 1] - y, P[q * 3 + 2] - z); if (d < best) { best = d; bi = q; } }
    }
    if (bi >= 0) { ea.push(i); et.push(bi); ek.push(Math.round(255 * (1 - ss(0, G, best)))); }
  }
  return { P: Pp, N: Np, U: Up, at: At, dim: Dm, I: Ip, cards: cards.length, edge: { at: Uint32Array.from(ea), to: Uint32Array.from(et), k: Uint8Array.from(ek) } };
}

/**
 * The strips' (hairStrips) colours and bones for one person: off, where the head's points start in the person's lists; C, SI, SW, the
 * person's colours and bones (each strip's point takes the colour and the bones of the head's point under it). Returns { C, SI, SW }.
 */
export function stripsOn(st, { off, C, SI, SW }) {
  const m = st.at.length, Cp = new Float32Array(m * 3), Jp = new Uint16Array(m * 4), Wp = new Float32Array(m * 4);
  for (let j = 0; j < m; j++) {
    const a = off + st.at[j], d = st.dim[j] / 200;
    Cp[j * 3] = C[a * 3] * d; Cp[j * 3 + 1] = C[a * 3 + 1] * d; Cp[j * 3 + 2] = C[a * 3 + 2] * d;
    for (let q = 0; q < 4; q++) { Jp[j * 4 + q] = SI[a * 4 + q]; Wp[j * 4 + q] = SW[a * 4 + q]; }
  }
  return { C: Cp, SI: Jp, SW: Wp };
}

/** A real face's sculpted hair, its colour eased into the skin's over the last few millimetres in from the hairline, where the scalp shows between the hairs (C changed in place; after stripsOn, so the strips keep the hair's own colour). */
export function easeEdge(st, { off, C }) {
  const { at, to, k } = st.edge;
  for (let e = 0; e < at.length; e++) { const j = (off + at[e]) * 3, s = (off + to[e]) * 3, w = .55 * k[e] / 255; for (let q = 0; q < 3; q++) C[j + q] += (C[s + q] - C[j + q]) * w; }
}
