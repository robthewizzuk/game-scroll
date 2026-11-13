// Cloth in the wind (gs.outdoors.Cloth): flags, banners, awnings and washing lines that the wind lifts, ripples and
// snaps, that sag under their own weight and settle when it drops. A piece is a sheet of points joined to their
// neighbours (along, across, corner to corner and two along, so it keeps its size, its shear and some stiffness),
// stepped a few small steps a frame (XPBD with substeps: Macklin et al. 2019, steady at any stiffness). The wind
// pushes each part of the sheet by how square it meets it, as air does a sail, and is never quite steady: gusts
// from a gs.outdoors Wind, and a flutter that runs along the cloth. On WebGPU the graphics chip runs every piece in
// one pass and draws it from there (cloth-gpu.js, finer sheets); elsewhere the same steps run here, coarser.
//
//   const { Cloth, Wind } = gs.outdoors;
//   make() { wind = new Wind({ x: 5, z: 2 }); cloth = new Cloth(view, { wind });
//            cloth.flag({ at: [0, 6, 0], size: [1.8, 1.2], colours: ['#c33', '#fff', '#36c'] });   // stripes from the pole out
//            cloth.awning({ at: [4, 2.6, -3], width: 3, depth: 1.4, colours: ['#2a6', '#eee'] });
//            cloth.banner({ from: [-3, 4, -2], to: [-1, 4, -2], drop: 2.2, colour: '#824' });
//            cloth.line({ from: [-6, 2, 2], to: [-1, 2.1, 3], items: 4 }); }
//   update(dt) { wind.update(dt); cloth.update(dt); }
//
// Everything is in metres. A piece's pins can ride a moving thing (flag.ride(boat)), and cloth.ball / cloth.capsule
// are solid things it drapes over and is pushed aside by.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { webgpu } from './gpu.js';
import { own } from './cleanup.js';
import { timed } from './prof.js';

const GRAV = -9.81, AIR = .6, SKIN = .12, GRIP = .6;
// (AIR: half the density of air: a sheet square to a wind of v metres a second is pushed AIR v² newtons a square metre. SKIN: what the wind
// along a cloth that flaps drags it by, against that: a flag's drag is about an eighth of a board's square on, which is what flies it)
const STEPS = 4;   // small steps a frame
// how stiff each kind of link is (XPBD compliance, m/N: 0 never gives) and how hard it holds
const LINK = { along: 0, shear: .5, bend: 1 };   // (cloth hardly stretches, but shears and folds easily: that's why a flag hangs in still air)
export const PIECES_MAX = 64;   // pieces the graphics chip's wind table holds

// a wind that is never quite steady: gusts, and a sideways wobble that runs downwind along the cloth (a flag's ripples run at about two
// thirds of the wind's speed). u: how far downwind the point is, y its height, sp the wind's speed. Shared with the graphics chip's version.
const FL = { k: 2.2, c0: 2.5, c1: 1.1, ky: 1.3, gust: .3, side: .28 };

class Piece {
  constructor(cloth, kind, cols, rows, place, { colour = '#c33', colours = null, across = false, weight = .15, pins = [], joins = [], stiff = 1, open = 1 } = {}) {
    Object.assign(this, { cloth, kind, cols, rows, weight, stiff, open });
    this.place = place; this.pinList = pins; this.joinList = joins; this.base = 0;
    this.colours = (colours || [colour]).map(c => new Color(c)); this.across = across;
    this.rider = null; this.local = null; this.wind = [0, 0, 0, 0];   // (x, y, z and its speed) this.gone = false;
  }
  /** The point at column i, row j: [x, y, z] (now). */
  at(i, j) { if (this.cloth.dirty) this.cloth.build(); const P = this.cloth.P, k = (this.base + j * this.cols + i) * 3; return [P[k], P[k + 1], P[k + 2]]; }
  /** Pins ride a moving thing (an Object3D: a boat, a car, a person): they keep their place on it. null: they stay where they are. */
  ride(thing) {
    this.rider = thing; this.local = null; if (this.cloth.dirty) this.cloth.build();
    if (thing) { thing.updateWorldMatrix(true, false); const inv = new Matrix4().copy(thing.matrixWorld).invert(), A = this.cloth.A; this.local = this.pinList.map(p => { const k = (this.base + p) * 3; return new Vector3(A[k], A[k + 1], A[k + 2]).applyMatrix4(inv); }); }
    return this;
  }
  /** Moves its pins by (dx, dy, dz) metres (the cloth follows). */
  move(dx, dy, dz) { if (this.cloth.dirty) this.cloth.build(); const A = this.cloth.A; for (const p of this.pinList) { const k = (this.base + p) * 3; A[k] += dx; A[k + 1] += dy; A[k + 2] += dz; } this.cloth.pinsMoved = true; return this; }
  /** Takes it away. */
  remove() { this.gone = true; this.cloth.pieces = this.cloth.pieces.filter(p => p !== this); this.cloth.dirty = true; }
}

export class Cloth {
  /**
   * view: an HDView (null: the numbers alone). wind: a gs.outdoors Wind, or { x, y, z } metres a second (a breeze of 3 by
   * default). fine: points across a metre (WebGPU 14, else 7). ground: a height (or (x, z) => height) the cloth lies on rather than going through.
   */
  constructor(view, { wind = null, fine = null, ground = null, rough = .85, steps = STEPS } = {}) {
    this.view = view; this.wind = wind; this.ground = ground; this.t = 0; this.steps = steps;
    this.big = !!webgpu() && typeof view?.envFor === 'function' && typeof webgpu().fx?.gpuCloth === 'function';
    this.fine = fine ?? (this.big ? 14 : 7);
    this.pieces = []; this.solids = []; this.dirty = true; this.pinsMoved = false;
    this.N = 0; this.P = new Float32Array(0);
    this.mat = new MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, side: DoubleSide });
    this.mesh = new Mesh(new BufferGeometry(), this.mat); this.mesh.castShadow = this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; this.mesh.name = 'cloth';
    Object.assign(this.mesh.userData, { noLod: true, detail: false, noOcclude: true });   // (its points move every frame: no simpler far copies, cluster detail or hiding behind things by stale bounds)
    this.twin = null; this.mode = 'cpu'; this.pending = 0;
    if (view) { (view.sims ||= []).push(this); (view.scene || view).add?.(this.mesh); }
    own(this);
  }
  // how many points along a length (at least 2)
  n(len, most = 40) { return Math.max(2, Math.min(most, Math.round(len * this.fine) + 1)); }
  add(p) { this.pieces.push(p); this.dirty = true; return p; }

  /**
   * A flag on a pole: at, the top of its edge on the pole; size [across, down] metres; dir: the way it flies out at rest (radians about up, 0 = +x).
   * colour, or colours: stripes (along it from the pole, or across: true, from the top down); weight: kilograms a square metre (.15: nylon; .4: canvas).
   */
  flag({ at = [0, 5, 0], size = [1.5, 1], dir = 0, ...o } = {}) {
    const [w, h] = size, c = this.n(w), r = this.n(h), dx = Math.cos(dir), dz = -Math.sin(dir);
    const pins = []; for (let j = 0; j < r; j++) pins.push(j * c);
    return this.add(new Piece(this, 'flag', c, r, (i, j) => [at[0] + dx * w * i / (c - 1), at[1] - h * j / (r - 1), at[2] + dz * w * i / (c - 1)], { ...o, pins }));
  }
  /** A banner hung from a rail: from, to (the rail's ends), drop (metres it hangs). Pinned all along the top; the bottom is free. */
  banner({ from = [0, 3, 0], to = [1, 3, 0], drop = 2, ...o } = {}) {
    const w = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]), c = this.n(w), r = this.n(drop), pins = []; for (let i = 0; i < c; i++) pins.push(i);
    return this.add(new Piece(this, 'banner', c, r, (i, j) => { const u = i / (c - 1); return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u - drop * j / (r - 1), from[2] + (to[2] - from[2]) * u]; }, { across: true, weight: .3, ...o, pins }));
  }
  /**
   * An awning over a door or a window: at, the middle of where it meets the wall; width; depth (how far out it comes); fall (how far its front
   * is below the wall's edge); dir: the way it comes out from the wall (radians about up, 0 = +z); valance: the strip that hangs from the front
   * (metres). Its frame holds it at the wall and along the front bar; between them it sags a little, and the valance flaps.
   */
  awning({ at = [0, 2.5, 0], width = 2.5, depth = 1.2, fall = .45, dir = 0, valance = .22, ...o } = {}) {
    const c = this.n(width), rd = this.n(Math.hypot(depth, fall)), rv = Math.max(2, this.n(valance, 8)), r = rd + rv - 1;
    const ox = Math.sin(dir), oz = Math.cos(dir), sx = Math.cos(dir), sz = -Math.sin(dir), pins = [];
    for (let i = 0; i < c; i++) pins.push(i, (rd - 1) * c + i);
    return this.add(new Piece(this, 'awning', c, r, (i, j) => {
      const s = (i / (c - 1) - .5) * width; let out, down;
      if (j < rd) { const u = j / (rd - 1); out = depth * u; down = fall * u; } else { out = depth; down = fall + valance * (j - rd + 1) / (rv - 1); }
      return [at[0] + sx * s + ox * out, at[1] - down, at[2] + sz * s + oz * out];
    }, { colours: o.colours || ['#2a7a4a', '#eeeae0'], weight: .4, ...o, pins }));
  }
  /**
   * A washing line between two posts: from, to; sag (metres it dips in the middle); items: how many things hang from it, or a list of
   * { at: 0..1 along it, size: [w, h], colour }. Each is pegged at its top corners and middle, and the line gives under them.
   */
  line({ from = [0, 2, 0], to = [3, 2, 0], sag = .12, items = 3, colour = '#ddd', ...o } = {}) {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]), c = this.n(len, 60);
    const rope = this.add(new Piece(this, 'rope', c, 1, i => { const u = i / (c - 1); return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u - 4 * sag * u * (1 - u), from[2] + (to[2] - from[2]) * u]; }, { colour, weight: .8, pins: [0, c - 1] }));
    rope.thin = .1;   // (a cord's weight: about 80 grams a metre)
    const list = typeof items === 'number' ? Array.from({ length: items }, (_, k) => ({ at: (k + .7) / (items + .4) })) : items, TONES = ['#f2f0ea', '#9cc0e0', '#e8b4a0', '#f0e2a0', '#b8d8b0'];
    const out = [rope];
    list.forEach((it, k) => {
      const [w, h] = it.size || [.55 + .2 * ((k * 7) % 3) / 2, .7 + .15 * ((k * 5) % 3) / 2], u0 = Math.max(.02, it.at - w / len / 2), u1 = Math.min(.98, it.at + w / len / 2);
      const cc = this.n(w), rr = this.n(h), top = u => { const y = from[1] + (to[1] - from[1]) * u - 4 * sag * u * (1 - u); return [from[0] + (to[0] - from[0]) * u, y, from[2] + (to[2] - from[2]) * u]; };
      const joins = [0, cc >> 1, cc - 1].map(i => [i, rope, Math.round((u0 + (u1 - u0) * i / (cc - 1)) * (c - 1))]);
      out.push(this.add(new Piece(this, 'sheet', cc, rr, (i, j) => { const p = top(u0 + (u1 - u0) * i / (cc - 1)); p[1] -= h * j / (rr - 1); return p; }, { colour: it.colour || TONES[k % TONES.length], weight: .2, joins, ...o })));
    });
    return out;
  }
  /**
   * A cloth of your own: cols x rows points at place(i, j) => [x, y, z]; pins: the points (j * cols + i) held where they start.
   * Every piece also takes open: how much of the wind reaches it (1; .3 in the lee of a wall; 0 indoors) and stiff (1; 2 for a stiffer cloth).
   */
  sheet({ cols = 8, rows = 8, place, pins = [], ...o } = {}) { return this.add(new Piece(this, 'sheet', cols, rows, place, { ...o, pins })); }
  /** A solid ball the cloth goes round: { x, y, z, r }; move it with set(x, y, z). */
  ball({ x = 0, y = 0, z = 0, r = .3 } = {}) { const s = { a: [x, y, z], b: [x, y, z], r, set(x, y, z) { this.a[0] = this.b[0] = x; this.a[1] = this.b[1] = y; this.a[2] = this.b[2] = z; return this; }, remove: () => { this.solids = this.solids.filter(q => q !== s); } }; this.solids.push(s); return s; }
  /** A solid rod with round ends from a to b, radius r (a leg, a post); set(a, b) moves it. */
  capsule({ a = [0, 0, 0], b = [0, 1, 0], r = .1 } = {}) { const s = { a: a.slice(), b: b.slice(), r, set(a, b) { this.a = a.slice(); this.b = b.slice(); return this; }, remove: () => { this.solids = this.solids.filter(q => q !== s); } }; this.solids.push(s); return s; }
  /** Takes every piece and solid away. */
  clear() { this.pieces = []; this.solids = []; this.dirty = true; return this; }

  // ---- the points and links of every piece, in one set (made again when pieces come or go)
  build() {
    this.dirty = false; this.version = (this.version || 0) + 1; let N = 0;
    // (pieces there before keep where their points are and how they're going; new ones start as made)
    const was = this.N ? { P: this.P, V: this.V, A: this.A, at: new Map(this.pieces.filter(p => p.built).map(p => [p, p.base])) } : null;
    for (const p of this.pieces) { p.base = N; N += p.cols * p.rows; }
    this.N = N; const P = this.P = new Float32Array(N * 3), Q = this.Q = new Float32Array(N * 3), A = this.A = new Float32Array(N * 3), W = this.W = new Float32Array(N), V = this.V = new Float32Array(N * 3);
    const F = this.F = new Float32Array(N * 3), AR = this.AR = new Float32Array(N), PI = this.PI = new Uint8Array(N), NB = this.NB = new Int32Array(N * 4).fill(-1);
    const TT = this.TT = new Int32Array(N).fill(-1), TR = this.TR = new Float32Array(N);
    const links = [], col = new Float32Array(N * 3), idx = [];
    this.pieces.forEach((p, pi) => {
      const { cols: c, rows: r, base: b } = p;
      for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) { const k = b + j * c + i, x = p.place(i, j); P.set(x, k * 3); Q.set(x, k * 3); A.set(x, k * 3); PI[k] = pi; }
      // (each point's share of the sheet, its weight from that, and its neighbours: left, right, up, down, for its facing)
      for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
        const k = b + j * c + i, d = (a, z) => Math.hypot(P[a * 3] - P[z * 3], P[a * 3 + 1] - P[z * 3 + 1], P[a * 3 + 2] - P[z * 3 + 2]);
        const du = c > 1 ? d(b + j * c + Math.max(0, i - 1), b + j * c + Math.min(c - 1, i + 1)) / (i > 0 && i < c - 1 ? 2 : 1) : 0, dv = r > 1 ? d(b + Math.max(0, j - 1) * c + i, b + Math.min(r - 1, j + 1) * c + i) / (j > 0 && j < r - 1 ? 2 : 1) : 0;
        const area = r > 1 ? du * dv : du * (p.thin || .01); AR[k] = area; W[k] = 1 / Math.max(1e-5, area * p.weight);
        NB[k * 4] = i > 0 ? k - 1 : k; NB[k * 4 + 1] = i < c - 1 ? k + 1 : k; NB[k * 4 + 2] = j > 0 ? k - c : k; NB[k * 4 + 3] = j < r - 1 ? k + c : k;
        const cs = p.colours, s = cs.length > 1 ? cs[Math.min(cs.length - 1, Math.floor((p.across ? j / r : i / c) * cs.length))] : cs[0];
        col[k * 3] = s.r; col[k * 3 + 1] = s.g; col[k * 3 + 2] = s.b;
      }
      for (const q of p.pinList) W[b + q] = 0;
      const L = (a, z, kind) => links.push(a, z, Math.hypot(P[a * 3] - P[z * 3], P[a * 3 + 1] - P[z * 3 + 1], P[a * 3 + 2] - P[z * 3 + 2]), LINK[kind] / p.stiff);
      for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
        const k = b + j * c + i;
        if (i < c - 1) L(k, k + 1, 'along'); if (j < r - 1) L(k, k + c, 'along');
        if (i < c - 1 && j < r - 1) { L(k, k + c + 1, 'shear'); L(k + 1, k + c, 'shear'); }
        if (i < c - 2) L(k, k + 2, 'bend'); if (j < r - 2) L(k, k + 2 * c, 'bend');
        if (r > 1 && i < c - 1 && j < r - 1) idx.push(k, k + c, k + 1, k + 1, k + c, k + c + 1);
      }
      for (const [i, q, at] of p.joinList) if (q.base != null && this.pieces.includes(q)) links.push(b + i, q.base + at, 0, 0);   // (pegged: held on the line)
      // each point's nearest hold (a pin, or a peg on a line) and how far from it it was made: it never goes further than that, so a cloth
      // that hangs doesn't stretch, however few the steps (long-range attachments: Kim, Chentanez and Müller 2012). Along a cord, how far round it.
      const holds = p.pinList.map(q => [b + q, b + q]);
      for (const [i, q, at] of p.joinList) if (q.base != null && this.pieces.includes(q)) holds.push([b + i, q.base + at]);
      if (holds.length) {
        const arc = new Float32Array(c * r); if (r === 1) for (let i = 1; i < c; i++) { const a3 = (b + i) * 3, z3 = a3 - 3; arc[i] = arc[i - 1] + Math.hypot(P[a3] - P[z3], P[a3 + 1] - P[z3 + 1], P[a3 + 2] - P[z3 + 2]); }
        for (let k = b; k < b + c * r; k++) {
          if (W[k] === 0) continue; let best = Infinity, to = -1;
          for (const [o, hd] of holds) { const d = r === 1 ? Math.abs(arc[k - b] - arc[o - b]) : Math.hypot(P[k * 3] - P[o * 3], P[k * 3 + 1] - P[o * 3 + 1], P[k * 3 + 2] - P[o * 3 + 2]); if (d < best) { best = d; to = hd; } }
          TT[k] = to; TR[k] = best * 1.01;
        }
      }
    });
    this.L = new Float32Array(links); this.lam = new Float32Array(links.length / 4);
    this.pins = []; this.pieces.forEach(p => { for (const q of p.pinList) this.pins.push(p.base + q); });
    if (was) for (const [p, o] of was.at) { const n = p.cols * p.rows * 3; for (const [to, from] of [[P, was.P], [V, was.V], [A, was.A]]) to.set(from.subarray(o * 3, o * 3 + n), p.base * 3); Q.set(P.subarray(p.base * 3, p.base * 3 + n), p.base * 3); }
    for (const p of this.pieces) p.built = true;
    // the mesh: one vertex a point, the sheets' triangles, and each rope drawn as a thin strip under its points
    const ropes = this.pieces.filter(p => p.rows === 1), extra = ropes.reduce((n, p) => n + p.cols, 0), g = new BufferGeometry();
    const pos = new Float32Array((N + extra) * 3), nor = new Float32Array((N + extra) * 3), cl = new Float32Array((N + extra) * 3); cl.set(col);
    let e = N; this.ropeAt = [];
    for (const p of ropes) { for (let i = 0; i < p.cols; i++) { this.ropeAt.push(p.base + i, e + i); cl.set(col.subarray((p.base + i) * 3, (p.base + i) * 3 + 3), (e + i) * 3); if (i < p.cols - 1) idx.push(p.base + i, e + i, p.base + i + 1, p.base + i + 1, e + i, e + i + 1); } e += p.cols; }
    g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage)); g.setAttribute('normal', new BufferAttribute(nor, 3).setUsage(DynamicDrawUsage)); g.setAttribute('color', new BufferAttribute(cl, 3));
    g.setIndex(idx); g.boundingSphere = null;
    this.mesh.geometry.dispose(); this.mesh.geometry = g;
    this.sync();
  }

  /** Each frame. */
  update(dt) {
    if (this.dirty) this.build();
    if (!(dt > 0) || !this.N) return this;
    dt = Math.min(dt, 1 / 20); this.t += dt;
    this.pinsNow();
    this.winds();
    if (this.mode === 'gpu') { this.pending += dt; return this; }
    this.step(dt);
    this.sync();
    return this;
  }
  // where pins that ride something are now
  pinsNow() {
    const A = this.A;
    for (const p of this.pieces) if (p.rider && p.local) { p.rider.updateWorldMatrix(true, false); const m = p.rider.matrixWorld; p.pinList.forEach((q, n) => { const v = _v.copy(p.local[n]).applyMatrix4(m), k = (p.base + q) * 3; A[k] = v.x; A[k + 1] = v.y; A[k + 2] = v.z; }); this.pinsMoved = true; }
  }
  // the wind at each piece now (a gust there)
  winds() {
    const w = this.wind; let wx = 3, wy = 0, wz = 0;
    if (w && typeof w.at !== 'function') { wx = w.x || 0; wy = w.y || 0; wz = w.z || 0; }
    for (const p of this.pieces) {
      if (w && typeof w.at === 'function') { const k = (p.base + (p.cols >> 1) + (p.rows >> 1) * p.cols) * 3, g = w.at(this.A[k] ?? 0, this.A[k + 2] ?? 0); p.wind[0] = g.x * p.open; p.wind[1] = 0; p.wind[2] = g.z * p.open; }
      else { p.wind[0] = wx * p.open; p.wind[1] = wy * p.open; p.wind[2] = wz * p.open; }
      p.wind[3] = Math.sqrt(p.wind[0] * p.wind[0] + p.wind[2] * p.wind[2]);
    }
  }
  // the steps (here, when the graphics chip isn't doing them)
  step(dt) {
    const { N, P, Q, A, W, V, F, AR, PI, NB, L, lam, TT, TR } = this, S = this.steps, h = dt / S, t = this.t, pieces = this.pieces, nl = L.length / 4;
    // the wind's push on each point: on its share of the sheet, by how square the wind (less the cloth's own going) meets it
    for (let k = 0; k < N; k++) {
      const k3 = k * 3, pc = pieces[PI[k]], wd = pc.wind, sp = wd[3], ax = wd[0] / (sp || 1), az = wd[2] / (sp || 1), u = P[k3] * ax + P[k3 + 2] * az;
      const ph = FL.k * u - t * (FL.c0 + FL.c1 * sp) + FL.ky * P[k3 + 1], g = 1 + FL.gust * Math.sin(ph * .7 + 1.7) * Math.sin(t * 1.3 + u * .4), sd = FL.side * Math.sin(ph) * sp;
      const rx = wd[0] * g - az * sd - V[k3], ry = wd[1] * g - V[k3 + 1], rz = wd[2] * g + ax * sd - V[k3 + 2], rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const a = NB[k * 4] * 3, b = NB[k * 4 + 1] * 3, c = NB[k * 4 + 2] * 3, d = NB[k * 4 + 3] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nn = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nn > 1e-9 && W[k] > 0) {
        nx /= nn; ny /= nn; nz /= nn; const vn = rx * nx + ry * ny + rz * nz, aw = AR[k] * W[k] * rl * AIR, s = vn * aw, st = SKIN * aw;
        F[k3] = s * nx + st * (rx - vn * nx); F[k3 + 1] = s * ny + st * (ry - vn * ny); F[k3 + 2] = s * nz + st * (rz - vn * nz);
      } else if (W[k] > 0) { const s = .06 * rl * AR[k] * W[k]; F[k3] = rx * s; F[k3 + 1] = ry * s; F[k3 + 2] = rz * s; }   // (a cord: a drag along the wind)
      else F[k3] = F[k3 + 1] = F[k3 + 2] = 0;
      // (no faster than 25 metres a second a second from the wind: a light corner in a gale)
      const fa = Math.sqrt(F[k3] * F[k3] + F[k3 + 1] * F[k3 + 1] + F[k3 + 2] * F[k3 + 2]); if (fa > 25) { F[k3] *= 25 / fa; F[k3 + 1] *= 25 / fa; F[k3 + 2] *= 25 / fa; }
    }
    const solids = this.solids, gr = this.ground, damp = Math.exp(-h * .6);
    for (let s = 0; s < S; s++) {
      for (let k = 0; k < N; k++) {
        const k3 = k * 3; Q[k3] = P[k3]; Q[k3 + 1] = P[k3 + 1]; Q[k3 + 2] = P[k3 + 2];
        if (W[k] === 0) { P[k3] = A[k3]; P[k3 + 1] = A[k3 + 1]; P[k3 + 2] = A[k3 + 2]; continue; }
        V[k3] = V[k3] * damp + F[k3] * h; V[k3 + 1] = V[k3 + 1] * damp + (GRAV + F[k3 + 1]) * h; V[k3 + 2] = V[k3 + 2] * damp + F[k3 + 2] * h;
        P[k3] += V[k3] * h; P[k3 + 1] += V[k3 + 1] * h; P[k3 + 2] += V[k3 + 2] * h;
      }
      lam.fill(0);
      for (let c = 0; c < nl; c++) {
        const c4 = c * 4, a = L[c4], b = L[c4 + 1], rest = L[c4 + 2], al = L[c4 + 3] / (h * h), wa = W[a], wb = W[b], ws = wa + wb; if (ws <= 0) continue;
        const a3 = a * 3, b3 = b * 3, dx = P[a3] - P[b3], dy = P[a3 + 1] - P[b3 + 1], dz = P[a3 + 2] - P[b3 + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz); if (l < 1e-9) continue;
        if (rest === 0 && al === 0) { const ka = wa / ws, kb = wb / ws; P[a3] -= dx * ka; P[a3 + 1] -= dy * ka; P[a3 + 2] -= dz * ka; P[b3] += dx * kb; P[b3 + 1] += dy * kb; P[b3 + 2] += dz * kb; continue; }
        const C = l - rest, dl = (-C - al * lam[c]) / (ws + al); lam[c] += dl; const sx = dx / l * dl, sy = dy / l * dl, sz = dz / l * dl;
        P[a3] += sx * wa; P[a3 + 1] += sy * wa; P[a3 + 2] += sz * wa; P[b3] -= sx * wb; P[b3 + 1] -= sy * wb; P[b3 + 2] -= sz * wb;
      }
      for (let k = 0; k < N; k++) {
        if (W[k] === 0) continue; const k3 = k * 3, to = TT[k];
        if (to >= 0) { const t3 = to * 3, dx = P[k3] - P[t3], dy = P[k3 + 1] - P[t3 + 1], dz = P[k3 + 2] - P[t3 + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz), r = TR[k]; if (l > r) { const s = r / l; P[k3] = P[t3] + dx * s; P[k3 + 1] = P[t3 + 1] + dy * s; P[k3 + 2] = P[t3 + 2] + dz * s; } }
        for (let q = 0; q < solids.length; q++) push(P, Q, k3, solids[q]);
        if (gr != null) { const g = typeof gr === 'function' ? gr(P[k3], P[k3 + 2]) : gr; if (P[k3 + 1] < g + .01) { P[k3 + 1] = g + .01; P[k3] -= (P[k3] - Q[k3]) * GRIP; P[k3 + 2] -= (P[k3 + 2] - Q[k3 + 2]) * GRIP; } }
        V[k3] = (P[k3] - Q[k3]) / h; V[k3 + 1] = (P[k3 + 1] - Q[k3 + 1]) / h; V[k3 + 2] = (P[k3 + 2] - Q[k3 + 2]) / h;
      }
    }
  }
  // the mesh from the points: places, and each point's facing from its neighbours
  sync() {
    const g = this.mesh.geometry, pos = g.attributes.position?.array, nor = g.attributes.normal?.array; if (!pos || !this.N) return;
    const { N, P, NB } = this; pos.set(P);
    for (let k = 0; k < N; k++) {
      const a = NB[k * 4] * 3, b = NB[k * 4 + 1] * 3, c = NB[k * 4 + 2] * 3, d = NB[k * 4 + 3] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
      let nx = uz * vy - uy * vz, ny = ux * vz - uz * vx, nz = uy * vx - ux * vy; const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
    const ra = this.ropeAt; for (let n = 0; n < ra.length; n += 2) { const s = ra[n] * 3, e = ra[n + 1] * 3; pos[e] = P[s]; pos[e + 1] = P[s + 1] - .012; pos[e + 2] = P[s + 2]; nor[s] = nor[e] = 0; nor[s + 1] = nor[e + 1] = 1; nor[s + 2] = nor[e + 2] = 0; }
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true; g.boundingSphere = null;
  }

  /* ----- the graphics chip takes over (hd3d.js calls this every frame the view draws) ----- */
  gpuStep(G) {
    if (G && G.fx?.gpuCloth && this.N) {
      if (this.twin?.r !== G.r || this.twin.version !== this.version) { this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = { r: G.r, ...G.fx.gpuCloth(this) }; }
      this.mode = 'gpu';
      if (this.mesh.parent && this.twin.mesh.parent !== this.mesh.parent) this.mesh.parent.add(this.twin.mesh);
      this.mesh.visible = false; this.twin.mesh.visible = true;
      const dt = this.pending; this.pending = 0; if (dt > 0) this.twin.step(G.r, dt, this.steps);
    } else if (this.mode === 'gpu') this.toCpu();
  }
  toCpu() { this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = null; this.mode = 'cpu'; this.mesh.visible = true; this.pending = 0; this.build(); }
  /** Frees what it holds (the card leaving the feed does this). */
  free() { this.dispose(); }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = null; const s = this.view?.sims, i = s ? s.indexOf(this) : -1; if (i >= 0) s.splice(i, 1); }
}
const _v = new Vector3();
// a point pushed out of a solid ball or capsule (a ball is a capsule from a point to itself), and held by GRIP of its sliding over it
// (cloth on a ball stays on it, as a sheet thrown over a chair does)
function push(P, Q, k3, s) {
  const ax = s.a[0], ay = s.a[1], az = s.a[2], bx = s.b[0] - ax, by = s.b[1] - ay, bz = s.b[2] - az, px = P[k3] - ax, py = P[k3 + 1] - ay, pz = P[k3 + 2] - az;
  const bb = bx * bx + by * by + bz * bz, t = bb > 1e-12 ? Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / bb)) : 0;
  const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t, d = Math.sqrt(dx * dx + dy * dy + dz * dz), r = s.r + .01;
  if (d < r && d > 1e-9) {
    const k = r / d - 1; P[k3] += dx * k; P[k3 + 1] += dy * k; P[k3 + 2] += dz * k;
    const nx = dx / d, ny = dy / d, nz = dz / d, mx = P[k3] - Q[k3], my = P[k3 + 1] - Q[k3 + 1], mz = P[k3 + 2] - Q[k3 + 2], mn = mx * nx + my * ny + mz * nz;
    P[k3] -= (mx - mn * nx) * GRIP; P[k3 + 1] -= (my - mn * ny) * GRIP; P[k3 + 2] -= (mz - mn * nz) * GRIP;
  }
}
export const CLOTH = { STEPS, LINK, AIR, SKIN, GRIP, FL };
// per-frame work, timed while the frame lab is open (prof.js)
timed(Cloth.prototype, 'update', 'cloth');
