// Real surface detail, the building half (gs.models.relief; relief.js asks, this does the number work).
//
// A wall's bricks, a roof's tiles and a trunk's bark are usually a flat surface with a picture of bumps
// on it (a normal map; a height picture read by the parallax shader). Here the height picture is made
// into real geometry: the mesh's triangles are split where the height changes (and left big where it
// doesn't), each new point is pushed in along the surface by how low the picture is there, and what
// is left flatter than the tolerance is thinned out again (the flat face of a brick ends up a few
// triangles, the mortar round it a strip of small ones). Nothing is pushed out: the highest parts
// stay where the flat surface was, so the mesh still fits where it was put.
//
// The splitting is longest-edge bisection (Rivara): a triangle that needs more detail is cut across
// its longest edge, and a triangle with a cut edge that isn't its longest is cut across its longest
// first. That keeps triangles from getting thinner as they get smaller, however uneven the detail.
//
// Three things keep the result closed wherever the mesh was closed:
//  - an edge is split by what the edge is (its two ends' places), never by which triangle is asking,
//    so the triangles on an edge always split it at the same places, also across a seam in the UVs
//    or a hard edge, where each side has points of its own;
//  - a point of one triangle lying part-way along another's edge (boxes set side by side) is put
//    into that edge first (mend);
//  - points in one place move together: by the one push that suits every face meeting there (each
//    face wants to move along its own normal by its own height: least squares), so the corner of a
//    brick wall is where its two recessed faces meet, and the hidden faces between two boxes don't
//    pull the visible ones back.
// Normals and UVs are kept as the flat surface had them, so the normal map goes on shading exactly as
// before at every distance; the geometry adds the outline, the parallax and the shadows.
//
// No three.js here: it runs in a worker (detail-worker.js) or straight in Node (the kit test).
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

/** Resolves once buildRelief() can run. */
export const reliefReady = MeshoptSimplifier.ready;

// How far past its triangle budget a surface is split before it is thinned back down to the budget. Splitting to
// four times it, a brick wall at the cap took 3.6 s here (most of it thinning 600,000 triangles); to twice it, 1.4 s
// for a height error an eighth bigger (7.8 mm against 6.9, a 3 cm deep wall). A surface that is all there under its
// budget (most roofs and trunks) is split and thinned exactly as before. (Rob's Fold, 2026-11-13: the village's 60
// surfaces took 38.5 s to build, and the phone was hot through the runs after it.)
const SPLIT = 2;
const KEYS = 67108864;   // (2^26: two point numbers in one map key)
const key = (a, b) => a < b ? a * KEYS + b : b * KEYS + a;

/** Reads a height picture (one byte a pixel, 255 = raised) the way the texture is laid on: repeat, offset, wrapped, smooth between pixels. */
export function heightReader({ data, size, repeat = [1, 1], offset = [0, 0], flipY = true }) {
  const ru = repeat[0], rv = repeat[1], ou = offset[0], ov = offset[1], k = 1 / 255;
  return (u, v) => {
    let x = u * ru + ou, y = v * rv + ov; x -= Math.floor(x); y -= Math.floor(y);
    if (flipY) y = 1 - y;
    x = x * size - .5; y = y * size - .5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const xa = (x0 + size) % size, xb = (x0 + 1) % size, ya = ((y0 + size) % size) * size, yb = ((y0 + 1) % size) * size;
    const a = data[ya + xa], b = data[ya + xb], c = data[yb + xa], d = data[yb + xb];
    return ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy) * k;
  };
}

// the picture smoothed over wx by wy of its pixels (wrapped): a step narrower than the smallest triangle
// becomes a slope the triangles can follow, instead of a ragged edge
function soften(data, size, wx, wy) {
  let a = Float32Array.from(data);
  const pass = (w, across) => {
    w = Math.min(w, (size >> 1) - 1) | 1; if (w < 3) return;
    const b = new Float32Array(size * size), h = w >> 1, inv = 1 / w, wrap = i => ((i % size) + size) % size;
    for (let line = 0; line < size; line++) {
      const at = across ? i => line * size + wrap(i) : i => wrap(i) * size + line;
      let sum = 0; for (let i = -h; i <= h; i++) sum += a[at(i)];
      for (let i = 0; i < size; i++) { b[at(i)] = sum * inv; sum += a[at(i + h + 1)] - a[at(i - h)]; }
    }
    a = b;
  };
  pass(wx, true); pass(wy, false);
  return a;
}

// points in one place (within eps) get one number (the first of them), and exactly its place
function weld(V, S, nv, eps, x0, y0, z0) {
  const pid = new Int32Array(nv), cells = new Map(), cw = eps * 2, B = 131072;
  for (let i = 0; i < nv; i++) {
    const o = i * S, x = V[o], y = V[o + 1], z = V[o + 2];
    const cx = (x - x0) / cw, cy = (y - y0) / cw, cz = (z - z0) / cw, ix = Math.floor(cx), iy = Math.floor(cy), iz = Math.floor(cz);
    // the cells within eps of it: its own, and the next one along each axis it is nearer the edge of
    const ax = cx - ix < .5 ? ix - 1 : ix + 1, ay = cy - iy < .5 ? iy - 1 : iy + 1, az = cz - iz < .5 ? iz - 1 : iz + 1;
    let found = -1;
    for (let q = 0; q < 8 && found < 0; q++) {
      const list = cells.get((((q & 1 ? ax : ix) % B) * B + ((q & 2 ? ay : iy) % B)) * B + ((q & 4 ? az : iz) % B)); if (!list) continue;
      for (const j of list) { const p = j * S, dx = V[p] - x, dy = V[p + 1] - y, dz = V[p + 2] - z; if (dx * dx + dy * dy + dz * dz <= eps * eps) { found = j; break; } }
    }
    if (found < 0) { const k = ((ix % B) * B + (iy % B)) * B + (iz % B), l = cells.get(k); if (l) l.push(i); else cells.set(k, [i]); pid[i] = i; }
    else { pid[i] = found; const p = found * S; V[o] = V[p]; V[o + 1] = V[p + 1]; V[o + 2] = V[p + 2]; }
  }
  return pid;
}

/**
 * The relief of a mesh.
 * positions, normals (three numbers a point), uvs (two), index (three points a triangle, or null), extra:
 * [{ array, size }] other numbers of each point to carry along (colours, a second UV set); height: what
 * heightReader() takes; o: depth (how far the lowest parts go in, in the mesh's units; or depthTiles: in
 * widths of one tile of the picture, as the parallax depth is given), fine (the smallest detail made: no
 * edge is split below it, and the picture is smoothed to it; default half the depth), coarse (no edge stays
 * longer than this), error (how far the surface may be from the height picture), maxTris (the most
 * triangles returned; split up to four times that on the way), mid (the height that stays put: 1, nothing
 * is pushed out), mend (put points lying on other triangles' edges into them first: on for meshes under
 * 60,000 triangles), thin (false: keep every triangle the splitting made).
 * Returns { positions, normals, uvs, extra: [arrays], index, tris, points, split (triangles before thinning),
 * full (false: the budget cut the splitting short), rounds, error (what thinning cost, in the mesh's units),
 * depth and fine as used }.
 */
export function buildRelief({ positions, normals, uvs, index = null, extra = [], height }, o = {}) {
  const nv0 = positions.length / 3, mid = o.mid ?? 1, maxTris = o.maxTris ?? 150000, most = maxTris * (o.thin === false ? 1 : SPLIT);
  // every number of a point side by side: place, normal, UV, then the extras
  let S = 8; for (const e of extra) S += e.size;
  const nt0 = index ? index.length / 3 : nv0 / 3;
  let cap = Math.max(nv0 * 2, 1024), V = new Float32Array(cap * S), nv = nv0;
  for (let i = 0; i < nv0; i++) {
    const p = i * S; V[p] = positions[i * 3]; V[p + 1] = positions[i * 3 + 1]; V[p + 2] = positions[i * 3 + 2];
    V[p + 3] = normals[i * 3]; V[p + 4] = normals[i * 3 + 1]; V[p + 5] = normals[i * 3 + 2]; V[p + 6] = uvs[i * 2]; V[p + 7] = uvs[i * 2 + 1];
    let at = 8; for (const e of extra) { for (let k = 0; k < e.size; k++) V[p + at + k] = e.array[i * e.size + k]; at += e.size; }
  }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < nv0; i++) { const p = i * S; x0 = Math.min(x0, V[p]); x1 = Math.max(x1, V[p]); y0 = Math.min(y0, V[p + 1]); y1 = Math.max(y1, V[p + 1]); z0 = Math.min(z0, V[p + 2]); z1 = Math.max(z1, V[p + 2]); }
  const diag = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1, eps = diag * 2e-6;
  let pid = weld(V, S, nv, eps, x0, y0, z0), dup = new Uint8Array(cap), Hv = new Float32Array(cap);
  for (let i = 0; i < nv; i++) if (pid[i] !== i) dup[pid[i]] = 1;
  { const big = new Int32Array(cap); big.set(pid); pid = big; }
  // triangles: three points (T), their three edges (E: edge k runs from point k to the next), and whether one is settled (needs no more detail)
  let T = new Uint32Array(Math.max(nt0 * 3, 3072)), E = null, done = null, nt = 0;
  const tri = (a, b, c) => { if (nt * 3 + 3 > T.length) { const t2 = new Uint32Array(T.length * 2); t2.set(T); T = t2; } T[nt * 3] = a; T[nt * 3 + 1] = b; T[nt * 3 + 2] = c; nt++; };
  let area = 0, areaUV = 0;
  for (let t = 0; t < nt0; t++) {
    const a = index ? index[t * 3] : t * 3, b = index ? index[t * 3 + 1] : t * 3 + 1, c = index ? index[t * 3 + 2] : t * 3 + 2;
    if (pid[a] === pid[b] || pid[b] === pid[c] || pid[c] === pid[a]) continue;   // (a triangle with no area is left out)
    tri(a, b, c);
    const p = a * S, q = b * S, r = c * S, ux = V[q] - V[p], uy = V[q + 1] - V[p + 1], uz = V[q + 2] - V[p + 2], vx = V[r] - V[p], vy = V[r + 1] - V[p + 1], vz = V[r + 2] - V[p + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    areaUV += Math.abs((V[q + 6] - V[p + 6]) * (V[r + 7] - V[p + 7]) - (V[q + 7] - V[p + 7]) * (V[r + 6] - V[p + 6]));
  }
  // how big the picture lies on the mesh: one tile's width and one pixel's, in the mesh's units
  const rep = height.repeat || [1, 1], ru = Math.abs(rep[0]) || 1, rv = Math.abs(rep[1]) || 1, perUV = areaUV > 0 ? Math.sqrt(area / areaUV) : 1;
  const tile = perUV / Math.sqrt(ru * rv), pixel = tile / height.size;
  const depth = o.depth ?? (o.depthTiles != null ? o.depthTiles * tile : .03);
  const fine = Math.max(1e-7, o.fine ?? depth * .5, pixel * 1.5), coarse = Math.max(fine, o.coarse ?? fine * 16), tol = o.error ?? depth * .1;
  const H = heightReader({ ...height, data: o.soft === false ? height.data : soften(height.data, height.size, Math.round(fine * ru * height.size / perUV), Math.round(fine * rv * height.size / perUV)) });
  for (let i = 0; i < nv; i++) Hv[i] = H(V[i * S + 6], V[i * S + 7]);
  const room = () => {
    if (nv < cap) return;
    cap *= 2;
    const v2 = new Float32Array(cap * S); v2.set(V); V = v2;
    const p2 = new Int32Array(cap); p2.set(pid); pid = p2;
    const u2 = new Uint8Array(cap); u2.set(dup); dup = u2;
    const h2 = new Float32Array(cap); h2.set(Hv); Hv = h2;
  };
  const d2 = (a, b) => { const p = a * S, q = b * S, dx = V[p] - V[q], dy = V[p + 1] - V[q + 1], dz = V[p + 2] - V[q + 2]; return dx * dx + dy * dy + dz * dz; };
  // a new point part-way from u to v (k = .5: the middle)
  const between = (u, v, k) => {
    room(); const m = nv++, p = m * S, a = u * S, b = v * S;
    for (let i = 0; i < S; i++) V[p + i] = V[a + i] + (V[b + i] - V[a + i]) * k;
    Hv[m] = H(V[p + 6], V[p + 7]);
    return m;
  };

  if (o.mend ?? nt <= 60000) mend();

  // ---- edges, numbered: an edge is its two ends' places, shared by every triangle on it
  let ecap = Math.max(1024, nt * 2), ne = 0;
  let eLo = new Int32Array(ecap), eKid = new Int32Array(ecap), eMid = new Int32Array(ecap), eMa = new Int32Array(ecap), eMb = new Int32Array(ecap), eCut = new Int32Array(ecap), eNo = new Uint8Array(ecap), eLen = new Float32Array(ecap);
  const edge = (pa, pb) => {
    if (ne === ecap) {
      ecap *= 2;
      for (const a of [eLo, eKid, eMid, eMa, eMb, eCut]) { const b = new Int32Array(ecap); b.set(a); if (a === eLo) eLo = b; else if (a === eKid) eKid = b; else if (a === eMid) eMid = b; else if (a === eMa) eMa = b; else if (a === eMb) eMb = b; else eCut = b; }
      const n2 = new Uint8Array(ecap); n2.set(eNo); eNo = n2; const l2 = new Float32Array(ecap); l2.set(eLen); eLen = l2;
    }
    eLo[ne] = pa < pb ? pa : pb; eKid[ne] = -1; eMid[ne] = -1; eCut[ne] = -1; eNo[ne] = 0;
    return ne++;
  };
  { const ids = new Map(), at = (u, v) => { const k = key(pid[u], pid[v]); let e = ids.get(k); if (e === undefined) ids.set(k, e = edge(pid[u], pid[v])); return e; };
    E = new Uint32Array(T.length); done = new Uint8Array(T.length / 3);
    for (let t = 0; t < nt; t++) { const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2]; E[t * 3] = at(a, b); E[t * 3 + 1] = at(b, c); E[t * 3 + 2] = at(c, a); } }

  // ---- split, a round at a time
  const fine2 = fine * fine, coarse2 = coarse * coarse, hTol = depth > 0 ? tol / depth : Infinity;
  let full = true, rounds = 0, cuts = [];
  // does this edge need a point in its middle? (too long, or the height along it isn't a straight line)
  const wants = (e, u, v, l2) => {
    if (eNo[e] && !(dup[pid[u]] | dup[pid[v]])) return 0;   // (asked before: the same answer, unless a seam's two sides read the picture in different places)
    let r = 0;
    if (l2 > coarse2) r = 1;
    else if (l2 > fine2) {
      const n = Math.min(15, Math.ceil(Math.sqrt(l2 / fine2) * 2) - 1), a = u * S, b = v * S, ua = V[a + 6], va = V[a + 7], du = V[b + 6] - ua, dv = V[b + 7] - va, ha = Hv[u], dh = Hv[v] - ha;
      for (let i = 1; i <= n; i++) { const t = i / (n + 1); if (Math.abs(H(ua + du * t, va + dv * t) - ha - dh * t) > hTol) { r = 1; break; } }
    }
    if (!r) eNo[e] = 1;
    return r;
  };
  const cut = (e, l2) => { if (eCut[e] !== rounds) { eCut[e] = rounds; eLen[e] = l2; cuts.push(e); } };
  // a triangle with a cut edge is cut across its longest edge too (as good as longest: a cut edge within a hair of it counts)
  const close = () => {
    for (let again = true; again;) {
      again = false;
      for (let t = 0; t < nt; t++) {
        const e0 = E[t * 3], e1 = E[t * 3 + 1], e2 = E[t * 3 + 2], f0 = eCut[e0] === rounds, f1 = eCut[e1] === rounds, f2 = eCut[e2] === rounds;
        if (!(f0 || f1 || f2) || (f0 && f1 && f2)) continue;
        const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2], lab = d2(a, b), lbc = d2(b, c), lca = d2(c, a), near = Math.max(lab, lbc, lca) * .999999;
        if ((f0 && lab >= near) || (f1 && lbc >= near) || (f2 && lca >= near)) continue;
        if (lab >= lbc && lab >= lca) cut(e0, lab); else if (lbc >= lca) cut(e1, lbc); else cut(e2, lca);
        again = true;
      }
    }
  };
  // the point in the middle of edge e for a triangle whose ends of it are u and v (a seam: each side has its own, in one place)
  let seam = null;
  const middle = (e, u, v) => {
    const lo = u < v ? u : v, hi = u < v ? v : u;
    if (eMid[e] >= 0) {
      if (eMa[e] === lo && eMb[e] === hi) return eMid[e];
      const k = key(lo, hi); let m = seam.get(k);
      if (m === undefined) { m = between(u, v, .5); const c = eMid[e], p = m * S, q = c * S; V[p] = V[q]; V[p + 1] = V[q + 1]; V[p + 2] = V[q + 2]; pid[m] = c; dup[c] = 1; seam.set(k, m); }
      return m;
    }
    const m = between(u, v, .5); pid[m] = m; eMid[e] = m; eMa[e] = lo; eMb[e] = hi;
    const pl = eLo[e], ph = pid[u] === pl ? pid[v] : pid[u], k0 = edge(pl, m); edge(m, ph); eKid[e] = k0;   // its two halves: the lower-numbered end's first
    return m;
  };
  const half = (e, u) => pid[u] === eLo[e] ? eKid[e] : eKid[e] + 1;   // the half of a cut edge that ends at u
  for (; rounds < 48; rounds++) {
    cuts = [];
    for (let t = 0; t < nt; t++) {
      if (done[t]) continue;
      const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2], lab = d2(a, b), lbc = d2(b, c), lca = d2(c, a), lmax = Math.max(lab, lbc, lca);
      let need = wants(E[t * 3], a, b, lab) | wants(E[t * 3 + 1], b, c, lbc) | wants(E[t * 3 + 2], c, a, lca);
      if (!need && lmax > fine2 * 2.25) {
        // a bump or a groove wholly inside a triangle whose edges all look straight
        const pa = a * S, pb = b * S, pc = c * S;
        for (let q = 0; q < 4 && !need; q++) {
          const wa = q === 0 ? 1 / 3 : q === 1 ? 2 / 3 : 1 / 6, wb = q === 0 ? 1 / 3 : q === 2 ? 2 / 3 : 1 / 6, wc = 1 - wa - wb;
          if (Math.abs(H(V[pa + 6] * wa + V[pb + 6] * wb + V[pc + 6] * wc, V[pa + 7] * wa + V[pb + 7] * wb + V[pc + 7] * wc) - Hv[a] * wa - Hv[b] * wb - Hv[c] * wc) > hTol) need = 1;
        }
      }
      if (!need) { done[t] = 1; continue; }
      if (lab >= lbc && lab >= lca) cut(E[t * 3], lab); else if (lbc >= lca) cut(E[t * 3 + 1], lbc); else cut(E[t * 3 + 2], lca);
    }
    if (!cuts.length) break;
    close();
    // the triangle budget (each cut adds about two): over it, only the longest edges are cut, and this is the last round
    const left = Math.floor((most - nt) / 2);
    if (cuts.length > left) {
      full = false;
      if (left <= 0) break;
      const all = cuts.sort((i, j) => eLen[j] - eLen[i]);
      for (let i = left; i < all.length; i++) eCut[all[i]] = -1;
      cuts = all.slice(0, left); close();
    }
    const oT = T, oE = E, oD = done, n0 = nt; let size = n0;   // (counted, not guessed: an edge between two boxes has four triangles on it)
    for (let t = 0; t < n0; t++) size += (eCut[oE[t * 3]] === rounds) + (eCut[oE[t * 3 + 1]] === rounds) + (eCut[oE[t * 3 + 2]] === rounds);
    T = new Uint32Array(size * 3); E = new Uint32Array(size * 3); done = new Uint8Array(size); nt = 0; seam = new Map();
    const put = (a, b, c, e0, e1, e2) => { const p = nt * 3; T[p] = a; T[p + 1] = b; T[p + 2] = c; E[p] = e0; E[p + 1] = e1; E[p + 2] = e2; nt++; };
    for (let t = 0; t < n0; t++) {
      let a = oT[t * 3], b = oT[t * 3 + 1], c = oT[t * 3 + 2], e0 = oE[t * 3], e1 = oE[t * 3 + 1], e2 = oE[t * 3 + 2];
      let f0 = eCut[e0] === rounds, f1 = eCut[e1] === rounds, f2 = eCut[e2] === rounds;
      if (!(f0 || f1 || f2)) { done[nt] = oD[t]; put(a, b, c, e0, e1, e2); continue; }
      // turned so its longest cut edge is a-b
      const l0 = f0 ? d2(a, b) : -1, l1 = f1 ? d2(b, c) : -1, l2 = f2 ? d2(c, a) : -1;
      if (l1 > l0 && l1 >= l2) { let x = a; a = b; b = c; c = x; x = e0; e0 = e1; e1 = e2; e2 = x; x = f0; f0 = f1; f1 = f2; f2 = x; }
      else if (l2 > l0 && l2 > l1) { let x = c; c = b; b = a; a = x; x = e2; e2 = e1; e1 = e0; e0 = x; x = f2; f2 = f1; f1 = f0; f0 = x; }
      const m = middle(e0, a, b), ea = half(e0, a), eb = half(e0, b), en = edge(pid[m], pid[c]);
      if (f2) { const m2 = middle(e2, c, a), n2 = edge(pid[m], pid[m2]); put(a, m, m2, ea, n2, half(e2, a)); put(m2, m, c, n2, en, half(e2, c)); }
      else put(a, m, c, ea, en, e2);
      if (f1) { const m1 = middle(e1, b, c), n1 = edge(pid[m], pid[m1]); put(m, b, m1, eb, half(e1, b), n1); put(m, m1, c, n1, half(e1, c), en); }
      else put(m, b, c, eb, e1, en);
    }
    if (!full) { rounds++; break; }
  }
  const split = nt;

  // ---- push: the one move for each place that suits every face meeting there
  const N = new Float64Array(nv * 9), cnt = new Uint16Array(nv);   // (per place: n n' summed (6), n d summed (3))
  for (let i = 0; i < nv; i++) {
    const p = i * S; let nx = V[p + 3], ny = V[p + 4], nz = V[p + 5]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    V[p + 3] = nx; V[p + 4] = ny; V[p + 5] = nz;
    const d = (Hv[i] - mid) * depth, q = pid[i] * 9;
    N[q] += nx * nx; N[q + 1] += nx * ny; N[q + 2] += nx * nz; N[q + 3] += ny * ny; N[q + 4] += ny * nz; N[q + 5] += nz * nz;
    N[q + 6] += nx * d; N[q + 7] += ny * d; N[q + 8] += nz * d;
    if (cnt[pid[i]] < 65535) cnt[pid[i]]++;
  }
  let out = new Float32Array(nv * 3); const lim = depth * Math.max(mid, 1 - mid) * 1.5;
  for (let i = 0; i < nv; i++) {
    const c = pid[i], q = c * 9, p = i * S; let dx = N[q + 6], dy = N[q + 7], dz = N[q + 8];
    if (cnt[c] > 1) {
      // (N + k I) D = b, a little k so directions no face speaks for stay still
      const k = .03 * cnt[c], a = N[q] + k, b = N[q + 1], cc = N[q + 2], e = N[q + 3] + k, f = N[q + 4], g = N[q + 5] + k;
      const A = e * g - f * f, B = cc * f - b * g, C = b * f - cc * e, det = a * A + b * B + cc * C;
      if (Math.abs(det) > 1e-12) {
        const x = (A * dx + B * dy + C * dz) / det, y = (B * dx + (a * g - cc * cc) * dy + (b * cc - a * f) * dz) / det, z = (C * dx + (b * cc - a * f) * dy + (a * e - b * b) * dz) / det;
        dx = x; dy = y; dz = z;
      } else { dx /= cnt[c]; dy /= cnt[c]; dz /= cnt[c]; }
      const l = Math.hypot(dx, dy, dz); if (l > lim) { const s = lim / l; dx *= s; dy *= s; dz *= s; }
    }
    out[i * 3] = V[p] + dx; out[i * 3 + 1] = V[p + 1] + dy; out[i * 3 + 2] = V[p + 2] + dz;
  }

  // ---- thin: where the surface came out flatter than the tolerance, fewer triangles (meshoptimizer's
  // simplifier, which keeps points in one place together and only takes points away, never moves them)
  let idx = T.subarray(0, nt * 3), err = 0, keep = null;
  if (o.thin !== false && nt > 0) {
    const A = S - 3, attrs = new Float32Array(nv * A), w = [.5, .5, .5];
    for (let i = 0; i < nv; i++) for (let k = 0; k < A; k++) attrs[i * A + k] = V[i * S + 3 + k];
    let ulo = Infinity, uhi = -Infinity; for (let i = 0; i < nv; i++) { const u = V[i * S + 6]; if (u < ulo) ulo = u; if (u > uhi) uhi = u; }
    const wu = .5 / Math.max(1, uhi - ulo); w.push(wu, wu); for (let k = 5; k < A; k++) w.push(.25);
    let [i2, e2] = MeshoptSimplifier.simplifyWithAttributes(idx, out, 3, attrs, A, w, null, 0, tol, ['ErrorAbsolute']);
    // still over the budget: thinned on from there, not again from the start (the first pass's answer is within the
    // tolerance of it, and is a fraction of its size: a capped wall's second pass went from 0.74 s to 0.26 s)
    if (i2.length > maxTris * 3) { const [i3, e3] = MeshoptSimplifier.simplifyWithAttributes(i2, out, 3, attrs, A, w, null, maxTris * 3, 3e38, ['ErrorAbsolute']); i2 = i3; e2 += e3; }
    idx = i2; err = e2;
    // only the points still used are kept
    keep = new Int32Array(nv).fill(-1); let n = 0;
    for (let i = 0; i < idx.length; i++) { const v = idx[i]; if (keep[v] < 0) keep[v] = n++; idx[i] = keep[v]; }
    const p2 = new Float32Array(n * 3); for (let i = 0; i < nv; i++) { const j = keep[i]; if (j >= 0) { p2[j * 3] = out[i * 3]; p2[j * 3 + 1] = out[i * 3 + 1]; p2[j * 3 + 2] = out[i * 3 + 2]; } }
    out = p2; nt = idx.length / 3;
  }
  const n = keep ? out.length / 3 : nv, nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), ex = extra.map(e => new Float32Array(n * e.size));
  for (let i = 0; i < nv; i++) {
    const j = keep ? keep[i] : i; if (j < 0) continue;
    const p = i * S; nor[j * 3] = V[p + 3]; nor[j * 3 + 1] = V[p + 4]; nor[j * 3 + 2] = V[p + 5]; uv[j * 2] = V[p + 6]; uv[j * 2 + 1] = V[p + 7];
    let at = 8; for (let q = 0; q < extra.length; q++) { const s = extra[q].size, a = ex[q]; for (let k = 0; k < s; k++) a[j * s + k] = V[p + at + k]; at += s; }
  }
  return { positions: out, normals: nor, uvs: uv, extra: ex, index: keep ? idx : idx.slice(), tris: nt, points: n, split, full, rounds, error: err, depth, fine };

  // ---- mend: a point lying part-way along another triangle's edge is put into that edge
  function mend() {
    // the places, in a grid of cells about one place big
    const places = []; for (let i = 0; i < nv; i++) if (pid[i] === i) places.push(i);
    const cs = Math.max(diag / Math.max(4, Math.sqrt(places.length)), eps * 8), B = 2097152, grid = new Map();
    const cell = (x, y, z) => (Math.floor((x - x0) / cs + 1) * B + Math.floor((y - y0) / cs + 1)) * B + Math.floor((z - z0) / cs + 1);
    for (const i of places) { const p = i * S, k = cell(V[p], V[p + 1], V[p + 2]), l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); }
    const seen = new Set(), onEdge = new Map();   // onEdge: edge key -> [{ t (from the lower-numbered end), p }]
    const look = (u, v) => {
      const k = key(u, v); if (seen.has(k)) return; seen.add(k);
      const lo = Math.min(u, v), hi = Math.max(u, v), a = lo * S, b = hi * S, ex = V[b] - V[a], ey = V[b + 1] - V[a + 1], ez = V[b + 2] - V[a + 2], l2 = ex * ex + ey * ey + ez * ez;
      if (l2 <= eps * eps * 16) return;
      let found = null;
      const test = list => {
        for (const p of list) {
          if (p === lo || p === hi) continue;
          const q = p * S, px = V[q] - V[a], py = V[q + 1] - V[a + 1], pz = V[q + 2] - V[a + 2], t = (px * ex + py * ey + pz * ez) / l2;
          if (t < 0 || t > 1 || t * t * l2 <= eps * eps * 4 || (1 - t) * (1 - t) * l2 <= eps * eps * 4) continue;
          const rx = px - ex * t, ry = py - ey * t, rz = pz - ez * t;
          if (rx * rx + ry * ry + rz * rz > eps * eps) continue;
          (found ||= new Map()).set(p, t);
        }
      };
      // the cells the edge passes through (its box when that is small, else stepped along it)
      const ax = Math.min(V[a], V[b]) - eps, bx = Math.max(V[a], V[b]) + eps, ay = Math.min(V[a + 1], V[b + 1]) - eps, by = Math.max(V[a + 1], V[b + 1]) + eps, az = Math.min(V[a + 2], V[b + 2]) - eps, bz = Math.max(V[a + 2], V[b + 2]) + eps;
      const i0 = Math.floor((ax - x0) / cs), i1 = Math.floor((bx - x0) / cs), j0 = Math.floor((ay - y0) / cs), j1 = Math.floor((by - y0) / cs), k0 = Math.floor((az - z0) / cs), k1 = Math.floor((bz - z0) / cs);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) <= 64) {
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let kk = k0; kk <= k1; kk++) { const l = grid.get(((i + 1) * B + j + 1) * B + kk + 1); if (l) test(l); }
      } else {
        const n = Math.ceil(Math.sqrt(l2) / cs * 4); let last = -1;
        for (let s = 0; s <= n; s++) {
          const t = s / n, x = V[a] + ex * t, y = V[a + 1] + ey * t, z = V[a + 2] + ez * t;
          for (let q = 0; q < 8; q++) { const c = cell(x + (q & 1 ? eps : -eps), y + (q & 2 ? eps : -eps), z + (q & 4 ? eps : -eps)); if (c === last) continue; last = c; const l = grid.get(c); if (l) test(l); }
        }
      }
      if (found) onEdge.set(k, [...found].map(([p, t]) => ({ p, t })).sort((m, n) => m.t - n.t));
    };
    for (let t = 0; t < nt; t++) { const a = pid[T[t * 3]], b = pid[T[t * 3 + 1]], c = pid[T[t * 3 + 2]]; look(a, b); look(b, c); look(c, a); }
    if (!onEdge.size) return;
    // each triangle with such an edge becomes a fan from the corner across it; the pieces are looked at again (their other edges)
    const made = new Map(), todo = Array.from(T.subarray(0, nt * 3)); nt = 0;
    while (todo.length) {
      const c = todo.pop(), b = todo.pop(), a = todo.pop();
      let u = a, v = b, w = c, pts = onEdge.get(key(pid[a], pid[b]));
      if (!pts) { pts = onEdge.get(key(pid[b], pid[c])); u = b; v = c; w = a; }
      if (!pts) { pts = onEdge.get(key(pid[c], pid[a])); u = c; v = a; w = b; }
      if (!pts) { tri(a, b, c); continue; }
      const fwd = pid[u] < pid[v]; let prev = u;
      for (let i = 0; i < pts.length; i++) {
        const { p, t } = pts[fwd ? i : pts.length - 1 - i], mk = key(u, v) + ':' + p;
        let m = made.get(mk);
        if (m === undefined) { m = between(u, v, fwd ? t : 1 - t); const q = m * S, s = p * S; V[q] = V[s]; V[q + 1] = V[s + 1]; V[q + 2] = V[s + 2]; pid[m] = p; dup[p] = 1; made.set(mk, m); }
        todo.push(prev, m, w); prev = m;
      }
      todo.push(prev, v, w);
    }
  }
}

/**
 * A relief with its cluster tables (what the worker saves and sends back): r is buildRelief()'s answer for
 * `input`, buildFrom is detail-build.js's. The relief's own triangle list is left out: the clusters' finest
 * level is the same triangles. The flat mesh itself is put on top as the coarsest level of all (its points
 * after the relief's), so a house far away costs the triangles it always did.
 */
export function reliefClusters(r, input, buildFrom, o) {
  const extra = input.extra || [];
  const parts = [{ array: r.normals, size: 3, use: 3 }, { array: r.uvs, size: 2, use: 2 }], weights = [.5, .5, .5];
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < r.uvs.length; i += 2) { if (r.uvs[i] < lo) lo = r.uvs[i]; if (r.uvs[i] > hi) hi = r.uvs[i]; }
  const wu = .5 / Math.max(1, hi - lo); weights.push(wu, wu);
  let stride = 5;
  extra.forEach((e, i) => { if (e.name === 'color' && e.size >= 3) { parts.push({ array: r.extra[i], size: e.size, use: 3 }); weights.push(.25, .25, .25); stride += 3; } });
  // However a patch of relief is simplified, while each triangle keeps to one flat face of the mesh (its
  // three points have that face's normal, and lie in the layer pushed into it) it is never further from
  // the full relief than the layer is thick: the cluster builder is told, so a wall far away is drawn as
  // flat as it was, however many levels of detail lie between.
  const nrm = r.normals, pos = r.positions, layer = r.depth, slack = layer * 2 + 1e-9;
  const inLayer = (tris, ids) => {
    for (let t = 0; t < tris.length; t += 3) {
      const a = ids[tris[t]] * 3, b = ids[tris[t + 1]] * 3, c = ids[tris[t + 2]] * 3, x = nrm[a], y = nrm[a + 1], z = nrm[a + 2];
      if (x * nrm[b] + y * nrm[b + 1] + z * nrm[b + 2] < .99999 || x * nrm[c] + y * nrm[c + 1] + z * nrm[c + 2] < .99999) return false;
      if (Math.abs(x * (pos[b] - pos[a]) + y * (pos[b + 1] - pos[a + 1]) + z * (pos[b + 2] - pos[a + 2])) > slack || Math.abs(x * (pos[c] - pos[a]) + y * (pos[c + 1] - pos[a + 1]) + z * (pos[c + 2] - pos[a + 2])) > slack) return false;
    }
    return true;
  };
  const d = buildFrom({ positions: r.positions, index: r.index, nv: r.points, parts, stride, weights }, { ...o, layer, inLayer });
  // ---- the flat mesh as the coarsest level: one cluster of all its triangles, and one group of everything
  // that was coarsest until now, wrong by no more than the layer is thick (known, not measured: so it
  // stands however badly the levels between simplified, as a house made of loose boxes does)
  const np = r.points, nb = input.positions.length / 3, n = np + nb, bi = input.index, nbi = bi ? bi.length : nb;
  const join = (a, b, size) => { const out = new Float32Array(n * size); out.set(a.subarray(0, np * size)); out.set(b.subarray(0, nb * size), np * size); return out; };
  const positions = join(r.positions, input.positions, 3), normals = join(r.normals, input.normals, 3), uvs = join(r.uvs, input.uvs, 2), ex = r.extra.map((a, i) => join(a, extra[i].array, extra[i].size));
  const index = n > 65535 ? new Uint32Array(d.index.length + nbi) : new Uint16Array(d.index.length + nbi); index.set(d.index);
  for (let i = 0; i < nbi; i++) index[d.index.length + i] = np + (bi ? bi[i] : i);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n * 3; i += 3) { const x = positions[i], y = positions[i + 1], z = positions[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2; let rad = 0;
  for (let i = 0; i < n * 3; i += 3) rad = Math.max(rad, Math.hypot(positions[i] - cx, positions[i + 1] - cy, positions[i + 2] - cz));
  const nc = d.start.length, ng = d.gFirst.length, all = [cx, cy, cz, rad];
  const start = new Uint32Array(nc + 1), count = new Uint32Array(nc + 1), refined = new Int32Array(nc + 1), sphere = new Float32Array(nc * 4 + 4);
  start.set(d.start, 1); count.set(d.count, 1); refined.set(d.refined, 1); sphere.set(d.sphere, 4);
  start[0] = d.index.length; count[0] = nbi; refined[0] = ng; sphere.set(all, 0);
  const gFirst = new Uint32Array(ng + 1), gCount = new Uint32Array(ng + 1), gSphere = new Float32Array(ng * 4 + 4), gError = new Float32Array(ng + 1);
  for (let g = 0; g < ng; g++) gFirst[g] = d.gFirst[g] + 1;
  gCount.set(d.gCount); gSphere.set(d.gSphere); gError.set(d.gError);
  gFirst[ng] = 1; gCount[ng] = d.roots; gSphere.set(all, ng * 4); gError[ng] = layer;
  Object.assign(d, { index, start, count, refined, sphere, gFirst, gCount, gSphere, gError, roots: 1, levels: d.levels + 1, tris: [...d.tris, nbi / 3] });
  d.relief = { positions, normals, uvs, extra: ex, names: extra.map(e => e.name), sizes: extra.map(e => e.size), tris: r.tris, points: n, split: r.split, full: r.full, error: r.error, depth: r.depth, fine: r.fine };
  return d;
}
/** Every typed array in a relief (to hand it to another thread without a copy). */
export const reliefBuffers = r => [r.positions, r.normals, r.uvs, ...r.extra].map(a => a.buffer);
