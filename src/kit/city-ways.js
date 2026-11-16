// gs.city Metro's ways between its districts: the land they cross (hills, and a river down the widest gap), how high
// each road runs over it (cuttings and embankments where the land is near, bridges over the river and the valleys,
// tunnels through the hills), a highway round the whole city with a slip road down to each district it can reach,
// and the cars on all of them. The districts themselves stay flat (a City is built on level ground); the hills rise
// from the land round them.
//
// Kit use only: city-metro.js makes one (Metro options hills, river, highway) and answers through it.
//
// How the roads are laid: each road's height follows the land under it, smoothed and held to a gradient a car can
// climb (7 % on the roads between districts, 5 % on the highway), and pinned to the district's level where it meets
// one. Where that leaves the road well above the land it is a bridge (a deck on piers); well under it, a tunnel (walls,
// a roof and lamps inside, a concrete portal at each end standing in a cutting); otherwise the land is cut or filled to
// meet it, with a level verge either side. The highway runs on piers over level land, 6.5 m up, so its slip roads climb.

import { BufferAttribute, BufferGeometry, BoxGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Quads, asphaltMat, paintMat, groundTex, LANE } from './city.js';
import { CITY_CARS, Fleet } from './city-cars.js';
import { WATER_Y, SEA_BED, planWater } from './city-coast.js';
import { makeNoise, rng } from './math.js';

export const CELL = 6;          // the land's grid near the city, metres
const INNER = 340;              // how far past the districts that grid (and the hills) reach
const VERGE = 7, BANK = 22;     // a road's level verge past its edge, and the bank beyond it down (or up) to the land
const RW = 16;                  // the river's half width
const PORTAL = [10, 12];        // a tunnel portal's box: from 10 m before the tunnel to 12 m into it
const portalW = r => r.width / 2 + VERGE + 4.5;
const ELEV = 6.5;               // the highway's height over level land
const ROOF = 6.2;               // a tunnel's height inside
const DIG = .6;                 // how far under the hills the roads keep (of the land's smoothed height): the tallest go through in tunnels
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const grow = (r, m) => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const distToRect = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
export const RING = { name: 'highway', ring: true };   // the far end of a slip road (as a district is the end of a road between two)

const concreteMat = () => shared('concrete', () => new MeshStandardMaterial({ color: '#a7a399', roughness: .92, side: DoubleSide }));
const lampMat = () => shared('tunnel lamp', () => new MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false }));
const waterMat = () => shared('ways water', () => new MeshStandardMaterial({ color: '#1b3a4c', roughness: .06, metalness: .2 }));
const MATS = new Map();
function shared(k, make) { if (!MATS.has(k)) MATS.set(k, make()); return MATS.get(k); }

export class Ways {
  /** metro: the Metro (its districts, bounds, connectors). hills 0..1, river, highway: as Metro's options. */
  constructor(metro, { seed = 1, hills = .5, river = null, highway = true, traffic = 1, fleet = false, meshes = true, grass = '#4f7a3a', waters = null } = {}) {
    this.m = metro; this.amp = 60 * Math.max(0, hills); this.N = makeNoise(seed * 7 + 3); this.R = rng(seed * 19 + 11);
    const D = metro.districts;
    this.inner = grow(metro.bounds, INNER);
    this.holes = D.map(d => grow(d.rect, 40));
    // the sea: past each harbour on the south edge (shown while its district isn't made: the district's own water is), or a bay and the open sea (always shown)
    this.seas = waters ? waters.map(w => ({ ...w, keep: true })) : D.filter(d => d.harbour).map(d => { const cx = (d.rect.x0 + d.rect.x1) / 2; return { x0: cx - 3000, x1: cx + 3000, z0: d.rect.z1 + 10, z1: d.rect.z1 + 3010 }; });
    this.grass = grass;
    this.river = river || null;
    this.group = new Group(); this.group.name = 'metro ways'; metro.group?.add(this.group);
    this.solids = new Group(); this.solids.name = 'metro ways solid'; this.group.add(this.solids);   // (what World3D makes solid: land, decks, parapets, tunnel walls)
    // the roads: those between districts (Metro made them), then the highway and its slip roads
    this.ring = highway ? this.makeRing() : null;
    if (this.ring) this.profile(this.ring, { lift: ELEV, grade: .05, loop: true });
    for (const r of metro.connectors) this.profile(r, { grade: .07 });
    this.ramps = this.ring ? this.makeRamps() : [];
    for (const r of this.ramps) this.profile(r, { grade: .065, ends: [0, this.ringY(r.ringS)] });
    this.roads = [...metro.connectors, ...this.ramps, ...(this.ring ? [this.ring] : [])];
    this.index();
    // the land, then the roads on it
    this.flat = !this.amp && !this.river && !this.ring;
    this.heights();
    if (!meshes) { this.water = []; return; }   // (the plan alone: heights and routes, no three.js)
    this.land = this.makeLand();
    this.meshes = this.roads.map(r => this.makeRoad(r));
    this.water = this.makeWater();
    this.walls = this.makeWalls();
    // the cars on them
    const laneLen = this.roads.reduce((s, r) => s + r.len * r.lanes * 2, 0);
    this.traffic = traffic > 0 ? new WayTraffic(this, Math.min(56, Math.round(laneLen / 75 * traffic)), { fleet, style: D[0].style }) : null;
  }

  /* ---------- the land ---------- */
  /** The hills alone (no river, no roads): 0 at the districts, rising over 200 m from them, gone again at the land's edge. */
  hills(x, z) {
    if (!this.amp) return 0;
    let d = Infinity; for (const h of this.holes) d = Math.min(d, distToRect(h, x, z)); for (const s of this.seas) d = Math.min(d, distToRect(s, x, z) + 40);
    const I = this.inner, e = Math.min(x - I.x0, I.x1 - x, z - I.z0, I.z1 - z), f = smooth(20, 210, d) * smooth(10, 120, e);
    if (f <= 0) return 0;
    const N = this.N, n = .5 + .5 * (N(x * .0022, z * .0022) * .62 + N(x * .0061 + 9.1, z * .0061 - 3.3) * .27 + N(x * .017 - 5, z * .017 + 4) * .11);
    return this.amp * Math.pow(Math.max(0, n), 1.7) * f;
  }
  /** How far x, z is from the river's middle (Infinity with none). */
  riverD(x, z) {
    const r = this.river; if (!r) return Infinity;
    const [u, v] = r.axis === 'z' ? [z, x] : [x, z];
    if (u < r.from || u > r.to) return Infinity;
    return Math.abs(v - this.riverC(u));
  }
  // how deep the river runs at u along it, 0..1: it rises out of the land at its far end (and at both, with no sea)
  riverE(x, z) { const r = this.river, u = r.axis === 'z' ? z : x; return smooth(r.from, r.from + 160, u) * (r.sea ? 1 : smooth(r.to, r.to - 160, u)); }
  riverC(u) { const r = this.river; return r.c + r.amp * this.N(u * .0032, 7.7) + r.amp * .3 * this.N(u * .011, -2.1); }
  /** The natural land at x, z: the hills, the river's bed cut into them, the sea bed. */
  natural(x, z) {
    let h = this.hills(x, z);
    const d = this.riverD(x, z); if (d < RW + 22) { const k = (1 - smooth(RW - 2, RW + 22, d)) * this.riverE(x, z); h += (-3.2 - h) * k; }
    for (const s of this.seas) if (inRect(s, x, z)) h = Math.min(h, -3);
    return h;
  }
  // the grid of heights near the city: the natural land, cut and filled to meet the roads, raised over the tunnels
  heights() {
    const I = this.inner, nx = Math.ceil((I.x1 - I.x0) / CELL), nz = Math.ceil((I.z1 - I.z0) / CELL);
    this.grid = { x0: I.x0, z0: I.z0, nx, nz };
    const H = this.H = new Float32Array((nx + 1) * (nz + 1)), at = (i, j) => j * (nx + 1) + i;
    if (!this.flat) {
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[at(i, j)] = this.natural(I.x0 + i * CELL, I.z0 + j * CELL);
      // each road's verge and banks (where it runs on the land), then the land over its tunnels
      const W = new Float32Array(H.length), T = new Float32Array(H.length);
      // (across the road only, a strip each point: a bank never runs on past the end of a stretch on the land, into a river or a valley under a bridge)
      let fx = 0, fz = 0, half = 3.2;
      const stamp = (x, z, r, y, fn) => {
        const R = r.width / 2 + VERGE + BANK, i0 = Math.max(0, Math.floor((x - R - I.x0) / CELL)), i1 = Math.min(nx, Math.ceil((x + R - I.x0) / CELL)), j0 = Math.max(0, Math.floor((z - R - I.z0) / CELL)), j1 = Math.min(nz, Math.ceil((z + R - I.z0) / CELL));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = I.x0 + i * CELL - x, dz = I.z0 + j * CELL - z; if (Math.abs(dx * fx + dz * fz) <= half) fn(at(i, j), Math.abs(dx * -fz + dz * fx), R); }
      };
      const dirAt = (r, k) => { const a = r.points[Math.max(0, k - 1)], b = r.points[Math.min(r.points.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; fx = (b[0] - a[0]) / l; fz = (b[1] - a[1]) / l; half = Math.max(3.2, l / 4 + .6); };   // (half of the way to each neighbour, and a little over)
      for (const r of this.roads) for (let k = 0; k < r.points.length; k++) {
        const [x, z] = r.points[k], y = r.y[k], kind = r.kind[k], half = r.width / 2; dirAt(r, k);
        if (kind === 2) stamp(x, z, r, y, (v, d) => { if (d < half + VERGE) H[v] = Math.max(H[v], y + ROOF + 1); });
        else if (kind === 0 || kind === 3) stamp(x, z, r, y, (v, d) => { const w = 1 - smooth(half + VERGE, half + VERGE + BANK, d); if (w > W[v]) { W[v] = w; T[v] = y - .08; } });
      }
      for (let v = 0; v < H.length; v++) if (W[v] > 0) H[v] += (T[v] - H[v]) * W[v];
      for (const r of this.roads) for (let k = 0; k < r.points.length; k++) if (r.kind[k] === 1) {   // (nothing a bank raised comes up through a bridge's deck)
        const [x, z] = r.points[k], y = r.y[k]; dirAt(r, k); stamp(x, z, r, y, (v, d) => { if (d < r.width / 2 + 1) H[v] = Math.min(H[v], y - 1.2); });
      }
      for (const r of this.roads) for (let k = 0; k < r.points.length; k++) if (r.kind[k] === 2) {   // (a tunnel's cover again: a bank of the cutting before it may have dug into it)
        const [x, z] = r.points[k], y = r.y[k]; dirAt(r, k); stamp(x, z, r, y, (v, d) => { if (d < r.width / 2 + VERGE) H[v] = Math.max(H[v], y + ROOF + 1); });
      }
    }
    // just under the districts' own ground where it meets theirs
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = I.x0 + i * CELL, z = I.z0 + j * CELL; if (this.holes.some(h => distToRect(h, x, z) < 1)) H[at(i, j)] = Math.min(H[at(i, j)], -.04); }
    // the cells: none inside a district, on the sea, or round a tunnel's mouth (its portal stands there)
    const skip = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = I.x0 + (i + .5) * CELL, z = I.z0 + (j + .5) * CELL;
      if (this.holes.some(h => inRect(h, x, z)) || this.seas.some(s => inRect(s, x, z))) skip[j * nx + i] = 1;
    }
    // (where the land jumps from the cutting's floor up over the tunnel: inside its portal's box, which hides the hole)
    for (const r of this.roads) for (const t of r.tunnels) for (const [c, dir] of [[t.s0, 1], [t.s1, -1]]) {
      const a = this.at(r, c), fx = a.dx * dir, fz = a.dz * dir, lat = portalW(r) - 4.3, R = lat + 12;
      const i0 = Math.max(0, Math.floor((a.x - R - I.x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((a.x + R - I.x0) / CELL)), j0 = Math.max(0, Math.floor((a.z - R - I.z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((a.z + R - I.z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = I.x0 + (i + .5) * CELL - a.x, dz = I.z0 + (j + .5) * CELL - a.z, lo = dx * fx + dz * fz, la = Math.abs(dx * -fz + dz * fx);
        if (lo > -PORTAL[0] + 4.3 && lo < PORTAL[1] - 4.3 && la < lat) skip[j * nx + i] = 1;
      }
    }
    this.skip = skip;
  }
  makeLand() {
    const I = this.inner, { nx, nz } = this.grid, H = this.H, skip = this.skip, at = (i, j) => j * (nx + 1) + i;
    // the mesh: the grid where it is wanted (shared corners, smooth normals), and level grass from its edge out to the far land
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const v = at(i, j), x = I.x0 + i * CELL, z = I.z0 + j * CELL; pos[v * 3] = x; pos[v * 3 + 1] = H[v]; pos[v * 3 + 2] = z; uv[v * 2] = x; uv[v * 2 + 1] = -z; }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (!skip[j * nx + i]) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); idx.push(a, d, c, a, c, b); }
    const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(pos, 3)); geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setIndex(pos.length / 3 > 65535 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1)); geo.computeVertexNormals();
    const out = new Quads(), F = grow(this.m.bounds, 3040), holes = [I, ...this.seas];
    const cut = (lo, hi, k0, k1) => [...new Set([lo, hi, ...holes.flatMap(h => [h[k0], h[k1]])].map(v => Math.max(lo, Math.min(hi, v))))].sort((a, b) => a - b);
    const xs = cut(F.x0, F.x1, 'x0', 'x1'), zs = cut(F.z0, F.z1, 'z0', 'z1');
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) { const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2; if (!holes.some(h => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) out.top(xs[i], zs[j], xs[i + 1], zs[j + 1], 0, 1); }
    const tex = groundTex('grass', this.grass).clone(); tex.repeat.set(.1, .1); tex.needsUpdate = true;
    const mat = new MeshStandardMaterial({ map: tex, roughness: 1 });
    const near = new Mesh(geo, mat); near.name = 'metro land'; near.receiveShadow = true; near.castShadow = !this.flat; this.solids.add(near);
    const far = new Mesh(out.geometry(), mat); far.name = 'metro far land'; far.receiveShadow = true; this.group.add(far);
    this.m.paint?.add(near, 'grass', { base: this.grass }); this.m.paint?.add(far, 'grass', { base: this.grass });
    return { near, far, mat, tex };
  }
  /** The land's height at x, z, as its mesh has it (cut, filled and raised for the roads); 0 outside the grid. */
  landAt(x, z) {
    const G = this.grid, fx = (x - G.x0) / CELL, fz = (z - G.z0) / CELL;
    if (fx < 0 || fz < 0 || fx >= G.nx || fz >= G.nz) return 0;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, n = G.nx + 1, H = this.H;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i + 1], d = H[(j + 1) * n + i];
    return u > v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;   // (the two triangles the mesh splits each cell into)
  }
  // the river's water (and the sea's, while the harbour is not made)
  makeWater() {
    const out = [], R = this.river, I = this.inner;
    if (R) {
      const q = new Quads(), y = -.6;
      for (let u = R.from; u < R.to; u += 8) {
        const c0 = this.riverC(u), c1 = this.riverC(u + 8), w = RW + 18;   // (its edges under the banks)
        if (R.axis === 'z') q.q12(c0 - w, y, u, c1 - w, y, u + 8, c1 + w, y, u + 8, c0 + w, y, u);   // (facing up)
        else q.q12(u, y, c0 + w, u + 8, y, c1 + w, u + 8, y, c1 - w, u, y, c0 - w);
      }
      const m = new Mesh(q.geometry(), waterMat()); m.name = 'metro river'; m.receiveShadow = true; this.group.add(m); this.m.view.reflect?.(m); out.push(m);
    }
    for (const s of this.seas) {
      const m = new Mesh(new PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0), waterMat()); m.rotation.x = -Math.PI / 2; m.position.set((s.x0 + s.x1) / 2, -.62, (s.z0 + s.z1) / 2);
      m.name = 'metro sea'; m.receiveShadow = true; this.group.add(m); this.m.view.reflect?.(m); m.userData.sea = !s.keep; out.push(m);
    }
    void I; return out;
  }
  // a sea wall wherever a district's ground (not its own shore) meets the sea or the bay: concrete from the street down to the bed
  makeWalls() {
    const q = new Quads(), col = new Color('#9c978c'), STEP = 8;
    for (const d of this.m.districts) {
      const h = grow(d.rect, 40), W = planWater(d.plan), dry = (x, z) => W.bed(x, z) == null;
      for (const [ax, az, bx, bz, nx, nz] of [[h.x0, h.z0, h.x1, h.z0, 0, -1], [h.x1, h.z0, h.x1, h.z1, 1, 0], [h.x1, h.z1, h.x0, h.z1, 0, 1], [h.x0, h.z1, h.x0, h.z0, -1, 0]]) {
        const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / STEP);
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
          if (!this.seas.some(s => inRect(s, mx + nx, mz + nz)) || !dry(mx - nx, mz - nz)) continue;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          q.q12(x1, .02, z1, x0, .02, z0, x0, SEA_BED - .2, z0, x1, SEA_BED - .2, z1, undefined, col);   // (facing out, nx nz)
          q.q12(x0, .02, z0, x1, .02, z1, x1, .02 - .001, z1, x0, .02 - .001, z0, undefined, col);
        }
      }
    }
    if (q.empty) return null;
    const m = new Mesh(q.geometry(), new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .9 })); m.name = 'metro sea walls'; m.receiveShadow = true; this.solids.add(m);
    return m;
  }
  /** The water between the districts as numbers: the surface over the river, the bay and the sea (null: not this land's to say). */
  waterAt(x, z) {
    const sea = this.seas.some(s => inRect(s, x, z)), river = !sea && this.riverD(x, z) < RW + 22;
    if (!sea && !river) return null;
    return this.bedAt(x, z) < WATER_Y - .02 ? WATER_Y : -Infinity;
  }
  /** The ground under the river and the sea (the land's mesh where it reaches, else the natural land). */
  bedAt(x, z) { const G = this.grid; return x > G.x0 && z > G.z0 && x < G.x0 + G.nx * CELL && z < G.z0 + G.nz * CELL && !this.seas.some(s => inRect(s, x, z)) ? this.landAt(x, z) : this.natural(x, z); }

  /* ---------- the roads' heights ---------- */
  // y at each point of road r: the land under it smoothed, held to `grade`, pinned to `ends` where it meets a district or
  // the highway; then which stretches are on the land (0), bridges (1), tunnels (2)
  profile(r, { lift = 0, grade = .07, ends = [0, 0], loop = false }) {
    const P = r.points, n = P.length, S = r.at, base = new Float32Array(n), clear = new Float32Array(n), y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, z] = P[i], d = this.riverD(x, z);
      base[i] = Math.max(this.hills(x, z), lift);
      clear[i] = Math.max(d < RW + 26 ? 4.6 * (1 - smooth(RW + 4, RW + 26, d)) : 0, this.seas.some(s => inRect(s, x, z)) ? lift || 4.6 : 0);   // (over the water: room under the deck)
    }
    // smoothed over about 50 m each way
    const m = loop ? n - 1 : n, step = r.len / Math.max(1, n - 1), K = Math.max(1, Math.round(50 / step));
    for (let i = 0; i < m; i++) { let sum = 0, c = 0; for (let k = -K; k <= K; k++) { let j = i + k; if (loop) j = ((j % m) + m) % m; else if (j < 0 || j >= n) continue; sum += base[j]; c++; } const avg = sum / c; y[i] = Math.max(avg * DIG, lift * (1 - smooth(5, 14, avg)), clear[i]); }   // (on piers over level land; into cuttings and tunnels in the hills)
    if (loop) y[n - 1] = y[0];
    else for (let i = 0; i < n; i++) {   // (pinned at each end, and never further from an end's height than the gradient allows from there)
      const a = smooth(0, 90, S[i]), b = smooth(0, 90, r.len - S[i]); y[i] = ends[0] + (y[i] - ends[0]) * a; y[i] = ends[1] + (y[i] - ends[1]) * b;
      const g0 = grade * S[i], g1 = grade * (r.len - S[i]); y[i] = Math.max(ends[0] - g0, ends[1] - g1, Math.min(ends[0] + g0, ends[1] + g1, y[i]));
    }
    // no steeper than grade: forward and back (twice round a loop)
    for (let pass = 0; pass < (loop ? 2 : 1); pass++) {
      for (let i = 1; i < n; i++) { const g = grade * (S[i] - S[i - 1]); y[i] = Math.max(y[i - 1] - g, Math.min(y[i - 1] + g, y[i])); }
      for (let i = n - 2; i >= 0; i--) { const g = grade * (S[i + 1] - S[i]); y[i] = Math.max(y[i + 1] - g, Math.min(y[i + 1] + g, y[i])); }
    }
    if (!loop) { y[0] = ends[0]; y[n - 1] = ends[1]; }
    r.y = y;
    // what each stretch is: 0 on the land, 1 a bridge, 2 a tunnel (3: on the land, the cutting before a tunnel)
    const kind = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const [x, z] = P[i], L = this.natural(x, z); kind[i] = y[i] - L > 2.5 ? 1 : L - y[i] > ROOF + 1.5 ? 2 : 0; }
    // short stretches join what is round them; nothing but land near a district
    const runs = () => { const out = []; let a = 0; for (let i = 1; i <= n; i++) if (i === n || kind[i] !== kind[a]) { out.push([a, i - 1, kind[a]]); a = i; } return out; };
    for (const [a, b, k] of runs()) { const L = S[b] - S[a]; if ((k === 1 && L < 12) || (k === 2 && L < 40)) kind.fill(0, a, b + 1); }
    if (!loop) for (let i = 0; i < n; i++) if ((S[i] < 30 || r.len - S[i] < 30) && !(r.ramp && r.len - S[i] < 30)) kind[i] = 0;
    r.kind = kind; r.bridges = []; r.tunnels = [];
    for (const [a, b, k] of runs()) { if (k === 1) r.bridges.push({ s0: S[a], s1: S[b] }); if (k === 2) { r.tunnels.push({ s0: S[a], s1: S[b] }); for (let i = a; i <= b; i++) kind[i] = 2; } }
    // the cutting before each tunnel's mouth (the land is dug to the road there: kind 3, on the land)
    for (const t of r.tunnels) for (let i = 0; i < n; i++) if (kind[i] === 0 && (Math.abs(S[i] - t.s0) < 12 || Math.abs(S[i] - t.s1) < 12)) kind[i] = 3;
  }
  /** The highway's height s metres round it. */
  ringY(s) { return this.at(this.ring, s).y; }
  /** A point s metres along road r: { x, y, z, dx, dz, kind } (dx, dz its direction). */
  at(r, s, out = {}) {
    const S = r.at, P = r.points; s = r.loop ? ((s % r.len) + r.len) % r.len : Math.max(0, Math.min(r.len, s));
    let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const f = (s - S[lo]) / ((S[hi] - S[lo]) || 1), dx = P[hi][0] - P[lo][0], dz = P[hi][1] - P[lo][1], l = Math.hypot(dx, dz) || 1;
    out.x = P[lo][0] + dx * f; out.z = P[lo][1] + dz * f; out.dx = dx / l; out.dz = dz / l;
    out.y = r.y ? r.y[lo] + (r.y[hi] - r.y[lo]) * f : 0; out.kind = r.kind ? r.kind[f < .5 ? lo : hi] : 0; out.grade = r.y ? (r.y[hi] - r.y[lo]) / ((S[hi] - S[lo]) || 1) : 0;
    return out;
  }

  /* ---------- the highway and its slip roads ---------- */
  // round the whole city, 100 m out, its corners rounded
  makeRing() {
    // (round the mainland: on a bay the waterfront and the island stay open to the water, and are reached by their own roads)
    const D = this.m.waters ? this.m.districts.filter(d => !d.harbour) : [], U = D.length ? D.reduce((u, d) => ({ x0: Math.min(u.x0, d.rect.x0), x1: Math.max(u.x1, d.rect.x1), z0: Math.min(u.z0, d.rect.z0), z1: Math.max(u.z1, d.rect.z1) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }) : this.m.bounds;
    const B = grow(U, 100), rad = 150, pts = [];
    const corner = (cx, cz, a0) => { for (let k = 1; k < 48; k++) { const a = a0 + k / 48 * Math.PI / 2; pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]); } };
    const line = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 5)); for (let k = 0; k < n; k++) pts.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]); };
    line(B.x0 + rad, B.z0, B.x1 - rad, B.z0); corner(B.x1 - rad, B.z0 + rad, -Math.PI / 2);
    line(B.x1, B.z0 + rad, B.x1, B.z1 - rad); corner(B.x1 - rad, B.z1 - rad, 0);
    line(B.x1 - rad, B.z1, B.x0 + rad, B.z1); corner(B.x0 + rad, B.z1 - rad, Math.PI / 2);
    line(B.x0, B.z1 - rad, B.x0, B.z0 + rad); corner(B.x0 + rad, B.z0 + rad, Math.PI);
    pts.push([...pts[0]]);
    const at = [0]; for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { id: 'highway', name: 'highway', ring: true, loop: true, a: RING, b: RING, points: pts, at, len: at.at(-1), width: 21, lanes: 2, speed: 25, median: true, rect: B };
  }
  // a slip road from an outer junction of each district out to the highway, joining it on the side nearest the district
  // in the direction its cars then drive (keeping to the driving side), where one fits without crossing anything
  makeRamps() {
    const ring = this.ring, out = [], side = this.m.side === 'left' ? -1 : 1, B = ring.rect, used = new Set(this.m.connectors.flatMap(r => [r.from, r.to]));
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, tmp = {};
    for (const d of this.m.districts) {
      if (d.rect.x0 < B.x0 || d.rect.x1 > B.x1 || d.rect.z0 < B.z0 || d.rect.z1 > B.z1) continue;   // (outside the ring: on a bay)
      const P = d.plan, sides = [['n', d.rect.z0 - B.z0], ['s', B.z1 - d.rect.z1], ['w', d.rect.x0 - B.x0], ['e', B.x1 - d.rect.x1]].sort((a, b) => a[1] - b[1]);
      for (const [sd, gap] of sides) {
        if (gap > 420) continue;
        const o = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] }[sd];
        const nodes = P.nodes.filter(n => (sd === 'e' ? n.i === P.nx : sd === 'w' ? n.i === 0 : sd === 's' ? n.j === P.nz : n.j === 0) && !used.has(n));
        if (!nodes.length) continue;
        const mid = nodes.slice().sort((a, b) => (o[0] ? Math.abs(a.z - (d.rect.z0 + d.rect.z1) / 2) - Math.abs(b.z - (d.rect.z0 + d.rect.z1) / 2) : Math.abs(a.x - (d.rect.x0 + d.rect.x1) / 2) - Math.abs(b.x - (d.rect.x0 + d.rect.x1) / 2)));
        for (const p of mid.slice(0, 3)) {
          const h = o[0] ? p.hx : p.hz, P0 = [p.x + o[0] * h, p.z + o[1] * h], hit = [P0[0] + o[0] * gap, P0[1] + o[1] * gap];
          // where the highway is straight out from the junction, and which way along it keeps the district on the right
          let best = -1, bd = Infinity; ring.points.forEach(([x, z], i) => { const dd = Math.hypot(x - hit[0], z - hit[1]); if (dd < bd) { bd = dd; best = i; } });
          const t0 = this.at(ring, ring.at[best], tmp), inward = (-t0.dz * (cx - t0.x) + t0.dx * (cz - t0.z)) * side > 0 ? 1 : -1;
          const sQ = ring.at[best] + inward * 170, Q0 = this.at(ring, sQ), tq = [Q0.dx * inward, Q0.dz * inward];
          const offIn = ring.width / 2 + 5.5 - 1, nIn = [-tq[1] * side, tq[0] * side];   // (the right of the way it joins: toward the district)
          const Q = [Q0.x + nIn[0] * offIn, Q0.z + nIn[1] * offIn];
          const k1 = gap * .55, k2 = 80, P1 = [P0[0] + o[0] * k1, P0[1] + o[1] * k1], P2 = [Q[0] - tq[0] * k2, Q[1] - tq[1] * k2];
          const L = Math.hypot(Q[0] - P0[0], Q[1] - P0[1]) + gap, nn = Math.max(10, Math.ceil(L / 4)), pts = [[p.x, p.z]];
          for (let i = 0; i <= nn; i++) { const t = i / nn, u = 1 - t; pts.push([u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * Q[0], u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * Q[1]]); }
          // it fits: clear of the other districts, the roads between districts, the river and the slip roads already made
          const clear = pts.every(([x, z], i) => i < 3 || (!this.m.districts.some(e => e !== d && distToRect(e.rect, x, z) < 20) && distToRect(d.rect, x, z) > -1 && this.riverD(x, z) > RW + 8
            && !this.m.connectors.some(c => c.points.some(([a, b]) => Math.hypot(a - x, b - z) < c.width / 2 + 9)) && !out.some(c => c.points.some(([a, b]) => Math.hypot(a - x, b - z) < 30))));
          if (!clear) continue;
          const at = [0]; for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
          out.push({ id: 'ramp ' + d.name, name: d.name + ' slip road', ramp: true, a: d, b: RING, from: p, to: { x: Q[0], z: Q[1] }, points: pts, at, len: at.at(-1), width: 11, lanes: 1, speed: 15,
            ringS: ((sQ % ring.len) + ring.len) % ring.len, join: inward, gapSide: 1 });
          used.add(p); break;
        }
        if (out.at(-1)?.a === d) break;
      }
    }
    return out;
  }

  /* ---------- finding the roads ---------- */
  index() {
    const B = this.buckets = new Map(), key = (i, j) => i * 73856 + j;
    this.roads.forEach((r, ri) => { for (let k = 1; k < r.points.length; k++) { const [x, z] = r.points[k]; const kk = key(Math.floor(x / 24), Math.floor(z / 24)); if (!B.has(kk)) B.set(kk, []); B.get(kk).push(ri, k); } });
    this.key = key;
  }
  /** The nearest road point to x, z within `reach` metres: { d, road, s, x, z, y, lateral } (lateral: + to the right of +s), or null. */
  near(x, z, reach = 30, filter = null) {
    let best = null; const n = Math.ceil(reach / 24), bi = Math.floor(x / 24), bj = Math.floor(z / 24);
    for (let i = bi - n; i <= bi + n; i++) for (let j = bj - n; j <= bj + n; j++) {
      const L = this.buckets.get(this.key(i, j)); if (!L) continue;
      for (let q = 0; q < L.length; q += 2) {
        const r = this.roads[L[q]], k = L[q + 1]; if (filter && !filter(r)) continue;
        const [ax, az] = r.points[k - 1], [bx, bz] = r.points[k], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
        if (d < reach && (!best || d < best.d)) { const l = Math.sqrt(l2); best = { d, road: r, s: r.at[k - 1] + t * l, x: px, z: pz, y: r.y[k - 1] + (r.y[k] - r.y[k - 1]) * t, lateral: ((x - ax) * -dz + (z - az) * dx) / l }; }
      }
    }
    return best;
  }
  /** What stands under x, z below height y: the road there (if it is under y + 1.5) or the land. */
  surface(x, z, y = Infinity) {
    let best = null;
    const n = this.near(x, z, 14);
    if (n && n.d < n.road.width / 2 + .4 && n.y <= y + 1.5) best = n.y + .05;
    const L = this.landAt(x, z);
    if (L <= y + 1.5 && (best == null || L > best)) best = Math.max(L, best ?? -Infinity);
    return best ?? Math.min(L, n ? n.y : L);
  }
  /** Keeps p (a circle of radius r at height y) on a bridge or in a tunnel it is on: the parapets and the tunnel walls. */
  collide(p, r = .4, y = 0) {
    const key = p.z != null ? 'z' : 'y', n = this.near(p.x, p[key], 20); if (!n) return null;
    const R = n.road, k = this.at(R, n.s), half = R.width / 2 - .3 - r;
    if ((k.kind !== 1 && k.kind !== 2) || Math.abs(y - n.y) > 3 || Math.abs(n.lateral) <= half || Math.abs(n.lateral) > R.width / 2 + 1.5) return null;
    if (this.gap(R, n.s, n.lateral)) return null;
    const push = (Math.abs(n.lateral) - half) * Math.sign(n.lateral); p.x -= -k.dz * push; p[key] -= k.dx * push;
    return R;
  }
  // a gap in the parapet where a slip road joins the highway (on the slip road's side) or along the slip road's last stretch
  gap(R, s, lateral) {
    const side = this.m.side === 'left' ? -1 : 1;
    if (R.ramp) return R.len - s < 90 && lateral * side < 0;   // (the highway is on its left there, keeping right)
    if (R.ring) for (const q of this.ramps) { let ds = (s - q.ringS) * q.join; ds = ((ds % R.len) + R.len * 1.5) % R.len - R.len / 2; if (ds > -95 && ds < 5 && lateral * q.join * side > 0) return true; }
    return false;
  }

  /* ---------- the roads' meshes ---------- */
  makeRoad(r) {
    const S = (r.a?.plan || this.m.districts[0].plan).style, deck = new Quads(), lines = new Quads(), con = new Quads(), lamps = new Quads(), P = r.points, h = r.width / 2, n = P.length;
    const white = new Color('#e6e2d6'), yellow = new Color('#e0b43a'), side = this.m.side === 'left' ? -1 : 1;
    const nrm = i => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
    const N = P.map((_, i) => nrm(i)), Y = i => r.y[i] + .05;
    const strip = (i, off0, off1, y0a, y0b, y1a, y1b, q, uv, col) => {   // a quad between points i-1 and i from lateral off0 to off1 (y: at i-1 and i, each side); off0 > off1 faces up
      const [ax, az] = P[i - 1], [bx, bz] = P[i], na = N[i - 1], nb = N[i];
      q.q12(ax + na[0] * off0, y0a, az + na[1] * off0, bx + nb[0] * off0, y0b, bz + nb[1] * off0, bx + nb[0] * off1, y1b, bz + nb[1] * off1, ax + na[0] * off1, y1a, az + na[1] * off1, uv, col);
    };
    const wall = (i, off, y0a, y0b, y1a, y1b, q, facing) => facing > 0 ? strip(i, off, off, y0a, y0b, y1a, y1b, q) : strip(i, off, off, y1a, y1b, y0a, y0b, q);
    for (let i = 1; i < n; i++) {
      const ya = Y(i - 1), yb = Y(i), s0 = r.at[i - 1], s1 = r.at[i], kind = r.kind[i - 1] === r.kind[i] ? r.kind[i] : Math.max(r.kind[i - 1] === 3 ? 0 : r.kind[i - 1], r.kind[i] === 3 ? 0 : r.kind[i]);
      strip(i, h, -h, ya, yb, ya, yb, deck, [r.width / 10, s0 / 10, r.width / 10, s1 / 10, 0, s1 / 10, 0, s0 / 10]);
      // the lines: a lane line on the highway's each side of its barrier, the middle of the roads between districts, both edges
      const lp = (off, w, col) => strip(i, off + w, off - w, ya + .01, yb + .01, ya + .01, yb + .01, lines, undefined, col);
      if (r.median) { if ((s0 / 4.5 | 0) % 3 === 0) { lp(-(LANE + .5), .07, white); lp(LANE + .5, .07, white); } }
      else if (r.lanes > 1) { lp(-.12, .06, yellow); lp(.12, .06, yellow); } else if ((s0 / 4.5 | 0) % 2 === 0) lp(0, .06, white);
      lp(-h + .35, .07, white); lp(h - .35, .07, white);
      // the highway's barrier down the middle
      if (r.median) { strip(i, .3, -.3, ya + .8, yb + .8, ya + .8, yb + .8, con); wall(i, -.3, ya, yb, ya + .8, yb + .8, con, -1); wall(i, .3, ya, yb, ya + .8, yb + .8, con, 1); }
      // a bridge: the deck's underside and edges, a parapet each side (open where a slip road joins)
      if (kind === 1 || kind === 2) {
        for (const sd of [-1, 1]) {
          if (!this.gap(r, (s0 + s1) / 2, sd * h)) { strip(i, Math.max(sd * h, sd * (h - .35)), Math.min(sd * h, sd * (h - .35)), ya + 1, yb + 1, ya + 1, yb + 1, con); wall(i, sd * (h - .35), ya, yb, ya + 1, yb + 1, con, -sd); wall(i, sd * h, ya - .9, yb - .9, ya + 1, yb + 1, con, sd); }
          else if (kind === 1) wall(i, sd * h, ya - .9, yb - .9, ya, yb, con, sd);
        }
        if (kind === 1) strip(i, -h, h, ya - .9, yb - .9, ya - .9, yb - .9, con);   // (facing down)
      }
      // a tunnel: its walls and roof inside, a lamp every 12 m
      if (kind === 2) {
        for (const sd of [-1, 1]) wall(i, sd * (h + .01), ya + 1, yb + 1, ya + ROOF, yb + ROOF, con, -sd);
        strip(i, -h, h, ya + ROOF, yb + ROOF, ya + ROOF, yb + ROOF, con);
        if ((s0 / 12 | 0) !== (s1 / 12 | 0)) strip(i, -.4, .4, ya + ROOF - .05, yb + ROOF - .05, ya + ROOF - .05, yb + ROOF - .05, lamps);
      }
    }
    // the piers under each bridge, every 26 m (none in the river, nor on a road beneath)
    for (const b of r.bridges) for (let s = b.s0 + 13; s < b.s1 - 6; s += 26) {
      const p = this.at(r, s), L = this.natural(p.x, p.z), top = p.y + .05 - .9;
      if (this.riverD(p.x, p.z) < RW + 3 || top - L < 1) continue;
      const under = this.near(p.x, p.z, 18, q => q !== r); if (under && under.d < under.road.width / 2 + 2.5 && under.y < p.y - 2) continue;
      const pier = (ox, w) => { const x = p.x - p.dz * ox, z = p.z + p.dx * ox; con.box(x - w, L - 1, z - w, x + w, top, z + w); };
      if (r.width > 15) { pier(-r.width / 4, .9); pier(r.width / 4, .9); } else pier(0, .75);
      const c0 = [p.x - p.dz * (h - .5), p.z + p.dx * (h - .5)], c1 = [p.x + p.dz * (h - .5), p.z - p.dx * (h - .5)];   // (a cross beam under the deck)
      con.q12(c0[0] - p.dx * .7, top - 1, c0[1] - p.dz * .7, c1[0] - p.dx * .7, top - 1, c1[1] - p.dz * .7, c1[0] - p.dx * .7, top, c1[1] - p.dz * .7, c0[0] - p.dx * .7, top, c0[1] - p.dz * .7);
      con.q12(c1[0] + p.dx * .7, top - 1, c1[1] + p.dz * .7, c0[0] + p.dx * .7, top - 1, c0[1] + p.dz * .7, c0[0] + p.dx * .7, top, c0[1] + p.dz * .7, c1[0] + p.dx * .7, top, c1[1] + p.dz * .7);
    }
    // a portal at each end of each tunnel: a concrete box standing in the cutting, the road going in through its face
    for (const t of r.tunnels) for (const [c, dir] of [[t.s0, 1], [t.s1, -1]]) {
      const m0 = this.at(r, c), a = this.at(r, c - dir * PORTAL[0]), b = this.at(r, c + dir * PORTAL[1]), w = portalW(r), y0 = Math.min(a.y, b.y) - 1;
      let top = Math.max(a.y, b.y) + ROOF + 1.2;
      for (let s = -PORTAL[0]; s <= PORTAL[1]; s += 3) for (const o of [-w, -w / 2, 0, w / 2, w]) { const q = this.at(r, c + dir * s); top = Math.max(top, this.landAt(q.x - q.dz * o, q.z + q.dx * o) + .6); }
      const fx = m0.dx * dir, fz = m0.dz * dir, rx = -fz, rz = fx, ax = m0.x - fx * PORTAL[0], az = m0.z - fz * PORTAL[0];   // (into the tunnel, and to its right)
      const A = (o, s, y) => [ax + rx * o + fx * s, y, az + rz * o + fz * s], L = PORTAL[0] + PORTAL[1];
      const quad = (p0, p1, p2, p3) => con.quad(p0, p1, p2, p3);
      const yr = a.y + .05;
      quad(A(-w, 0, y0), A(-h - .5, 0, y0), A(-h - .5, 0, top), A(-w, 0, top));         // the face: left of the opening,
      quad(A(h + .5, 0, y0), A(w, 0, y0), A(w, 0, top), A(h + .5, 0, top));              // right of it,
      quad(A(-h - .5, 0, yr + ROOF), A(h + .5, 0, yr + ROOF), A(h + .5, 0, top), A(-h - .5, 0, top));   // over it
      quad(A(-w, L, top), A(-w, 0, top), A(w, 0, top), A(w, L, top));                    // its roof
      quad(A(-w, L, y0), A(-w, 0, y0), A(-w, 0, top), A(-w, L, top));                    // its sides
      quad(A(w, 0, y0), A(w, L, y0), A(w, L, top), A(w, 0, top));
      // inside the box, until the tunnel's own walls begin: the walls and roof of the mouth
      quad(A(-h - .5, 0, yr), A(-h - .5, L, yr), A(-h - .5, L, yr + ROOF), A(-h - .5, 0, yr + ROOF));
      quad(A(h + .5, L, yr), A(h + .5, 0, yr), A(h + .5, 0, yr + ROOF), A(h + .5, L, yr + ROOF));
      quad(A(-h - .5, 0, yr + ROOF), A(-h - .5, L, yr + ROOF), A(h + .5, L, yr + ROOF), A(h + .5, 0, yr + ROOF));
    }
    const out = new Group(); out.name = 'metro road ' + r.id;
    const mk = (q, mat, name, solid = true) => { if (!q.p.length) return null; const m = new Mesh(q.geometry(), mat); m.name = name; m.receiveShadow = true; m.castShadow = name !== 'lines'; (solid ? this.solids : out).add(m); return m; };
    const dm = mk(deck, asphaltMat(S.ground), 'deck'), lm = mk(lines, paintMat(), 'lines', false), cm = mk(con, concreteMat(), 'concrete'), tl = mk(lamps, lampMat(), 'tunnel lamps', false);
    if (tl) tl.castShadow = false;
    this.group.add(out);
    if (dm) this.m.paint?.add(dm, 'asphalt', { base: S.ground });
    r.mesh = dm; r.meshes = [dm, lm, cm, tl].filter(Boolean);
    return r.meshes;
  }

  /* ---------- for Metro ---------- */
  /** Whether the harbour's own water now shows (so the land's sea hides). */
  seaShown(on) { for (const m of this.water) if (m.userData.sea) m.visible = on; }
  update(dt, f, night, avoid, sirens) { this.traffic?.update(dt, f, night, avoid, sirens); }
  dispose() {
    this.traffic?.dispose();
    this.group.traverse(o => { if (o.isMesh) { this.m.paint?.remove(o); o.geometry.dispose(); } });
    this.land.tex.dispose(); this.land.mat.dispose(); this.group.removeFromParent();
  }
}

/* ---------- cars on the ways between districts ---------- */
// Each keeps its lane at its own pace behind the car ahead, comes out of a district onto a road between, climbs a slip
// road onto the highway (easing across into its lane), goes round, leaves by another slip road, and goes into a
// district at the far end (and comes out of another, somewhere out of sight).
export class WayTraffic {
  constructor(ways, count, { fleet = false, style = 'downtown' } = {}) {
    this.w = ways; this.list = []; this.R = rng(ways.m.seed * 5 + 3); this.max = count;
    this.side = ways.m.side === 'left' ? -1 : 1;
    this.fleet = fleet ? new Fleet(ways.group, CITY_CARS[style] || CITY_CARS.downtown, count, { near: 4, reach: 34 }) : null;
    if (!this.fleet) {
      const g = new BoxGeometry(1.8, 1.35, 4.3); g.translate(0, .82, 0);
      this.boxes = new InstancedMesh(g, new MeshStandardMaterial({ roughness: .4, metalness: .3 }), Math.max(1, count)); this.boxes.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3).fill(1), 3);
      this.boxes.instanceMatrix.setUsage(DynamicDrawUsage); this.boxes.castShadow = this.boxes.receiveShadow = true; this.boxes.frustumCulled = false; this.boxes.name = 'way cars'; ways.group.add(this.boxes);
    }
    // a pair of glowing lamps front and back on every car (the far ones too: a highway at night is a stream of them)
    const lg = (z, w) => { const g = new BoxGeometry(w, .16, .08); g.translate(0, .72, z); return g; };
    this.head = new InstancedMesh(lg(2.16, 1.45), new MeshBasicMaterial({ color: '#fff3d6', toneMapped: false }), Math.max(1, count));
    this.tail = new InstancedMesh(lg(-2.18, 1.5), new MeshBasicMaterial({ color: '#ff2c1c', toneMapped: false }), Math.max(1, count));
    for (const m of [this.head, this.tail]) { m.instanceMatrix.setUsage(DynamicDrawUsage); m.frustumCulled = false; m.name = 'way car lamps'; ways.group.add(m); }
    this.reset();
  }
  // roads weighted by their length and lanes
  pickRoad() { const W = this.w.roads, tot = W.reduce((s, r) => s + r.len * r.lanes, 0); let k = this.R() * tot; for (const r of W) { k -= r.len * r.lanes; if (k <= 0) return r; } return W[0]; }
  reset(focus = null) {
    this.list.length = 0;
    const COL = ['#c8ccd2', '#20242a', '#8a1d1d', '#e9e6df', '#33507a', '#5f646b', '#7a6a4a', '#2e5a3c'];
    for (let i = 0; i < this.max; i++) {
      const r = this.pickRoad(), c = { r, back: this.R() < .5, k: this.R() * r.lanes | 0, u: this.R() * r.len, v: r.speed * .8, pace: .82 + this.R() * .3, mx: 0, mz: 0, my: 0,
        x: 0, y: 0, z: 0, heading: 0, pitch: 0, colour: new Color(COL[this.R() * COL.length | 0]), style: 0, braking: false, odo: 0, id: 9000 + i, way: true, wid: 1.8, len: 4.3, yieldT: 0, pull: 0 };
      if (this.fleet) { c.style = this.fleet.pick(this.R); const k = this.fleet.kits[c.style]; c.wid = k.width; c.len = k.length; }
      this.place(c); this.list.push(c);
    }
    this.fleet?.assign(this.list);
    void focus;
  }
  s(c) { return c.back ? c.r.len - c.u : c.u; }
  place(c) {
    const r = c.r, s = this.s(c), p = this.w.at(r, s, this._p ||= {}), off = ((c.k + .5) * LANE + (r.median ? .9 : .2) + c.pull * 1.5) * this.side * (c.back ? -1 : 1);   // (pull: over to the kerb for a siren)
    const dx = c.back ? -p.dx : p.dx, dz = c.back ? -p.dz : p.dz;
    c.x = p.x - p.dz * off + c.mx; c.z = p.z + p.dx * off + c.mz; c.y = p.y + .05 + c.my;
    c.heading = Math.atan2(dx, dz); c.pitch = Math.atan(p.grade * (c.back ? -1 : 1));
  }
  // onto another road, easing across from where it was over the next few seconds
  move(c, r, back, u, k = 0) {
    const ox = c.x, oy = c.y, oz = c.z; c.r = r; c.back = back; c.u = u; c.k = Math.min(k, r.lanes - 1); c.mx = c.mz = c.my = 0; this.place(c);
    c.mx = ox - c.x; c.mz = oz - c.z; c.my = oy - c.y; this.place(c);
  }
  // out of sight: from a district end of a road somewhere far from the player
  respawn(c, f) {
    this.fleet?.drop(c);
    for (let tries = 0; tries < 30; tries++) {
      const r = this.pickRoad(); if (r.ring) continue;
      const fromB = !r.ramp && this.R() < .5, e = fromB ? r.to : r.from;
      if (f && Math.hypot(e.x - f.x, e.z - f.z) < 170) continue;
      c.r = r; c.back = fromB; c.u = 0; c.k = this.R() * r.lanes | 0; c.v = r.speed * .6; c.mx = c.mz = c.my = 0; c.yieldT = c.pull = 0; this.place(c); return;
    }
    c.u = 0; c.mx = c.mz = c.my = 0; this.place(c);
  }
  /**
   * Once a frame: f (the player), avoid (what is in the road: they brake for it), sirens (police cars and the like with
   * their sirens on: a car with one coming up behind it pulls over to the kerb side and stops until it has gone by).
   */
  update(dt, f, night = 0, avoid = [], sirens = []) {
    const W = this.w, ring = W.ring, groups = this._g ||= new Map(); groups.clear();
    for (const c of this.list) { const key = c.r.id + (c.back ? '<' : '>') + c.k; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(c); }
    for (const g of groups.values()) g.sort((a, b) => a.u - b.u);
    for (const g of groups.values()) for (let i = 0; i < g.length; i++) {
      const c = g[i], r = c.r; let gap = Infinity;
      if (i + 1 < g.length) gap = g[i + 1].u - c.u; else if (r.loop && g.length > 1) gap = g[0].u + r.len - c.u;
      let want = r.speed * c.pace;
      if (gap < Infinity) want = Math.min(want, Math.max(0, (gap - 8) * .9));
      // brake for the player (or anything a game asks) in its lane ahead
      const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
      for (const a of avoid) { if (a.y != null && Math.abs(a.y - c.y) > 4) continue; const dx = a.x - c.x, dz = a.z - c.z, ahead = dx * sh + dz * ch, lat = Math.abs(dx * ch - dz * sh); if (ahead > 0 && ahead < 30 && lat < 1.6 + a.r) want = Math.min(want, Math.max(0, (ahead - 6) * .7)); }
      // a siren coming up behind (on this road, going its way): over to the kerb side, and stop there until it has passed
      if (c.yieldT > 0) c.yieldT -= dt;
      for (const q of sirens) {
        const dx = q.x - c.x, dz = q.z - c.z; if (dx * dx + dz * dz > 2500 || Math.abs((q.y || 0) - c.y) > 4) continue;
        const along = dx * sh + dz * ch; if (along < -2 && along > -48 && Math.cos(q.heading - c.heading) > .5) { if (c.yieldT <= 0) this.yields = (this.yields || 0) + 1; c.yieldT = 1.4; }
      }
      if (c.yieldT > 0) want = Math.min(want, c.pull > .85 ? 0 : 4);
      c.pull += Math.max(-dt * .8, Math.min(dt * .8, (c.yieldT > 0 ? 1 : 0) - c.pull));
      c.braking = want < c.v - .5;
      c.v += Math.max(-9 * dt, Math.min(3.5 * dt, want - c.v));
      const before = this.s(c);
      c.u += c.v * dt; c.odo += c.v * dt;
      const k = Math.exp(-c.v * dt / 22); c.mx *= k; c.mz *= k; c.my *= k;
      if (r.loop) {
        c.u = ((c.u % r.len) + r.len) % r.len;
        // off at a slip road (one whose cars join going the other way: those leave from this side)
        const after = this.s(c), dir = c.back ? -1 : 1;
        for (const q of W.ramps) if (q.join !== dir) { const a = (before - q.ringS) * dir, b = (after - q.ringS) * dir; const wrap = x => ((x % r.len) + r.len * 1.5) % r.len - r.len / 2; if (wrap(a) < 0 && wrap(b) >= 0 && this.R() < .35) { this.move(c, q, true, 0, 0); break; } }
      } else if (c.u >= r.len) {
        const end = c.back ? r.a : r.b;
        if (end === RING && ring) this.move(c, ring, r.join < 0, r.join < 0 ? ring.len - r.ringS : r.ringS, 1);
        else this.respawn(c, f);
      }
      this.place(c);
    }
    this.draw(dt, night, f);
  }
  draw(dt, night, f) {
    const m = this._m ||= new Matrix4(), q = this._q ||= new Quaternion(), e = this._e ||= new Euler(0, 0, 0, 'YXZ'), p = this._v ||= new Vector3(), one = this._one ||= new Vector3(1, 1, 1);
    this.list.forEach((c, i) => {
      e.set(-c.pitch, c.heading, 0); q.setFromEuler(e); m.compose(p.set(c.x, c.y, c.z), q, one);   // (these face +z: a climb lifts the nose)
      this.head.setMatrixAt(i, m); this.tail.setMatrixAt(i, m);
      if (this.boxes) { this.boxes.setMatrixAt(i, m); this.boxes.setColorAt(i, c.colour); }
    });
    for (const M of [this.head, this.tail, this.boxes]) if (M) { M.count = this.list.length; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; }
    this.head.material.color.setScalar(.25 + night * .75); this.tail.material.color.setRGB(.35 + night * .65, .05, .03);
    if (this.fleet) { this.fleet.focus = f; this.fleet.draw(this.list, night, dt); }
  }
  /** Takes a car off the road (taken by the game, or crashed into the hands of the big city's own traffic): it comes back out of sight elsewhere, as a new car. */
  takeOut(c, f) { this.respawn(c, f); c.v = c.r.speed * .6; c.colour.set(['#c8ccd2', '#20242a', '#8a1d1d', '#e9e6df', '#33507a', '#5f646b'][this.R() * 6 | 0]); c.id += 1000; return this; }
  /** Headlights of the cars drawn whole, for the lamps (as City's). */
  headlamps(night, out) { return this.fleet?.close.size ? this.fleet.headlamps(night, out) : (out.length = 0, out); }
  dispose() { this.fleet?.dispose(); for (const M of [this.head, this.tail, this.boxes]) if (M) { M.removeFromParent(); M.dispose(); M.geometry.dispose(); } }
}
