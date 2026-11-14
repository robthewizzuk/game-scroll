// Flowing liquids for play: rivers and streams along a path whose current carries things (fastest in
// the middle, slow at the banks, swirling round rocks), waterfalls where the path drops, whirlpools,
// and pools or rivers of lava, acid or deep water that hurt while you're in them. The kit answers
// "what is the liquid doing here?"; your game moves things and decides what hurting means.
// Works top-down in 2D (x, y) or on the ground of a 3D world (x, z, with y up): gs.outdoors River and
// Lava draw the 3D ones from the same streams.
//
//   const { Streams } = gs.flow; const { Path } = gs.paths;
//   reset() {
//     water = new Streams({ space: '3d' });
//     river = water.river(new Path([{ x: -40, y: 2, z: 0 }, { x: 0, y: 1, z: 10 }, { x: 40, y: -6, z: 0 }]), { width: 8, speed: 3 });
//     river.rock(30, 1.5, 1.2);                                 // a rock 30 m down, 1.5 m right of the middle
//     water.pool({ x: 10, z: -20 }, 6, { kind: 'lava', hurt: 25 });
//   }
//   update(dt) {
//     const here = water.carry(raft, dt);                       // moves raft.x / raft.z (and y in a fall)
//     hp -= water.hurt(hero, dt);                               // damage this frame
//     if (here.fall) feel.boom(...);                            // here: { in, kind, depth, speed, current, edge, fall, stream }
//   }

import { timed } from './prof.js';
import { Path } from './paths.js';

const KIND = { water: { hurt: 0, push: 1 }, lava: { hurt: 30, push: .15 }, acid: { hurt: 12, push: .8 }, mud: { hurt: 0, push: .3 }, deep: { hurt: 0, push: 1 } };
const NONE = Object.freeze({ in: false, kind: null, depth: 0, speed: 0, current: Object.freeze({ x: 0, y: 0, z: 0 }), edge: 1, fall: false, hurt: 0, stream: null });

class Stream {
  constructor(owner, path, { width = 6, speed = 2, depth = 1.5, kind = 'water', hurt = null, push = null, fall = 1.2 } = {}) {
    const k = KIND[kind] || KIND.water;
    Object.assign(this, { owner, path, width, speed, depth, kind, hurt: hurt ?? k.hurt, push: push ?? k.push, fallSlope: fall });
    this.rocks = []; this.kindOf = 'river';
    // a flat copy for finding where on the river a point is (heights come from the real path)
    this.flat = owner.d3 ? new Path(path.pts.map(p => ({ x: p.x, y: p.z ?? 0, z: 0 })), { loop: path.loop, kind: path.kind }) : path;
  }
  get length() { return this.path.length; }
  /** A rock at distance d along the river, side metres right of the middle (left if negative), radius r: the current bends round it and foams. */
  rock(d, side, r = 1) { const p = this.path.offset(d, side); this.rocks.push({ d, side, r, x: p.x, y: p.y, z: p.z ?? 0 }); return this; }
  /** Where the river's surface is at distance d (and side): { x, y, z }. */
  surface(d, side = 0) { return this.path.offset(d, side); }
  /** Whether distance d along the river is a waterfall (the path drops steeper than `fall`). */
  isFall(d) { if (!this.owner.d3) return false; const a = this.path.at(Math.max(0, d - .5)), b = this.path.at(Math.min(this.length, d + .5)); return (a.y - b.y) / Math.max(.01, Math.hypot(b.x - a.x, b.z - a.z)) > this.fallSlope; }
  sample(p) {
    const d3 = this.owner.d3, qx = p.x, qy = d3 ? p.z : p.y;
    const n = this.flat.nearest(qx, qy, 0), half = this.width / 2;
    if (n.dist > half) return null;
    const dd = d3 ? n.d * this.path.length / (this.flat.length || 1) : n.d, a = this.path.at(dd), fall = this.isFall(dd);
    // which side of the middle: positive on the right
    const sideSign = Math.sign((qx - n.x) * -(d3 ? a.dz : a.dy) + (qy - n.y) * a.dx) || 1, edge = n.dist / half;
    let sp = this.speed * (1 - edge * edge * .75) * (fall ? 2.2 : 1);
    let cx = a.dx * sp, cy = (d3 ? a.dy : 0) * sp, cz = (d3 ? a.dz : a.dy) * sp;
    if (d3 && !fall) { const h = Math.hypot(cx, cz) || 1; cx *= sp / h; cz *= sp / h; cy = 0; }   // along the ground, not into it
    let foam = fall ? 1 : 0;
    for (const r of this.rocks) {   // round a rock: flow past a cylinder (no flow into it)
      const rx = qx - r.x, ry = qy - (d3 ? r.z : r.y), d2 = rx * rx + ry * ry, R2 = r.r * r.r;
      if (d2 > R2 * 16) continue;
      if (d2 < R2) { cx = cz = cy = 0; foam = 1; break; }
      const ux = d3 ? cx : cx, uy = d3 ? cz : cz, k = R2 / d2, c2 = (rx * rx - ry * ry) / d2, s2 = 2 * rx * ry / d2;
      const nx = ux - k * (ux * c2 + uy * s2), ny = uy - k * (ux * s2 - uy * c2);
      cx = nx; cz = ny; foam = Math.max(foam, Math.min(1, k * 1.5));
    }
    const out = { in: true, kind: this.kind, depth: this.depth * (1 - edge * edge), speed: Math.hypot(cx, cy, cz), edge, fall, foam, hurt: this.hurt, stream: this, d: dd, side: sideSign * n.dist };
    out.current = d3 ? { x: cx, y: cy, z: cz } : { x: cx, y: cz, z: 0 };
    out.level = d3 ? a.y : 0;
    return out;
  }
}

class Pool {
  constructor(owner, at, r, { kind = 'water', hurt = null, depth = 1, push = null, spin = 0, pull = 0, w = null, h = null } = {}) {
    const k = KIND[kind] || KIND.water;
    Object.assign(this, { owner, at, r, kind, hurt: hurt ?? k.hurt, depth, push: push ?? k.push, spin, pull, w, h }); this.kindOf = spin || pull ? 'whirl' : 'pool';
  }
  sample(p) {
    const d3 = this.owner.d3, dx = p.x - this.at.x, dy = d3 ? p.z - (this.at.z ?? 0) : p.y - this.at.y;
    let edge;
    if (this.w != null) { const ex = Math.abs(dx) / (this.w / 2), ey = Math.abs(dy) / (this.h / 2); if (ex > 1 || ey > 1) return null; edge = Math.max(ex, ey); }
    else { const d = Math.hypot(dx, dy); if (d > this.r) return null; edge = d / this.r; }
    const d = Math.hypot(dx, dy) || 1, t = this.spin * (1 - edge * .5), pl = this.pull * (1 - edge);
    const cx = -dy / d * t - dx / d * pl, cy = dx / d * t - dy / d * pl;   // round and in
    return { in: true, kind: this.kind, depth: this.depth * (1 - edge * edge * .5), speed: Math.hypot(cx, cy), edge, fall: false, foam: Math.min(1, Math.abs(this.spin) * .1 * (1 - edge)), hurt: this.hurt, stream: this,
      current: d3 ? { x: cx, y: 0, z: cy } : { x: cx, y: cy, z: 0 }, level: d3 ? this.at.y ?? 0 : 0 };
  }
}

export class Streams {
  /** space: '2d' (top-down: x, y) or '3d' (ground x, z; y up). */
  constructor({ space = '2d' } = {}) { this.d3 = space === '3d'; this.list = []; this.inside = new Map(); this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** A river along a gs.paths Path. width, speed (m/s down the middle), depth, kind ('water' | 'lava' | 'acid' | 'mud' | 'deep'), hurt (per second), push (how much the current moves things), fall (the slope that counts as a waterfall). */
  river(path, o = {}) { const s = new Stream(this, path, o); this.list.push(s); return s; }
  /** A round pool at { x, y } (3D: { x, y, z }, y its surface) radius r, or a box with o.w and o.h. Same options as a river. */
  pool(at, r, o = {}) { const p = new Pool(this, at, r, o); this.list.push(p); return p; }
  /** A whirlpool: spin (m/s round at the middle; negative the other way) and pull (m/s in). */
  whirl(at, r, spin = 3, pull = 1, o = {}) { return this.pool(at, r, { ...o, spin, pull }); }
  remove(s) { this.list = this.list.filter(x => x !== s); return this; }
  /** What the liquid is doing at a point: { in, kind, depth, speed, current: { x, y, z }, edge (0 middle .. 1 bank), fall, foam, hurt, level (3D surface height), stream }. Later streams win where they overlap. */
  at(p) { for (let i = this.list.length - 1; i >= 0; i--) { const s = this.list[i].sample(p); if (s) return s; } return NONE; }
  /**
   * Moves obj (x, y or x, z) with the current this frame; drag 0..1 is how much it goes with it (a boat 1, a swimmer .5).
   * obj can also be a loose body in a physics world (a gs.physics3d World3D body, or a gs.physics 2D thing): the current
   * then drags its speed toward its own, so it still bumps into the banks, rocks and other things. Returns at(obj).
   */
  carry(obj, dt, { drag = 1 } = {}) {
    if (obj?.body?.linvel && !obj.body.isKinematic?.() && !obj.body.isFixed?.()) return this.drag(obj, dt, drag);
    const h = this.at(obj); if (!h.in) return h;
    const k = drag * h.stream.push * dt; obj.x += h.current.x * k;
    if (this.d3) { obj.z += h.current.z * k; if (h.fall) obj.y += h.current.y * k; } else obj.y += h.current.y * k;
    return h;
  }
  // a body in a physics world: its speed eased toward the current's (2 a second at drag 1), as a push so it still collides
  drag(t, dt, drag) {
    const flat = !!t.phys, p = flat ? { x: t.x, y: t.y } : t.pos, h = this.at(p); if (!h.in) return h;
    const k = Math.min(1, 2 * drag * dt), c = h.current, m = h.stream.push;
    if (flat) { if (this.d3) return h; t.push((c.x * m - t.vx) * k, (c.y * m - t.vy) * k); return h; }
    const v = t.vel; t.push((c.x * m - v.x) * k, h.fall ? (c.y * m - v.y) * k : 0, (c.z * m - v.z) * k);
    return h;
  }
  /** Damage this frame for obj from what it's in (hurt per second x dt), and fires 'enter' / 'leave' (obj, stream). */
  hurt(obj, dt) {
    const h = this.at(obj?.body?.linvel ? (obj.phys ? { x: obj.x, y: obj.y } : obj.pos) : obj), was = this.inside.get(obj) || null, now = h.in ? h.stream : null;
    if (was !== now) { if (was) this.emit('leave', obj, was); if (now) this.emit('enter', obj, now, h); if (now) this.inside.set(obj, now); else this.inside.delete(obj); }
    return h.in ? h.hurt * dt : 0;
  }
}

/**
 * Shallow water that floods: water poured, rained or let in spreads over the ground, runs downhill,
 * fills hollows and evens out (a grid of columns that pass water to their neighbours: the "virtual
 * pipes" method). size: metres a side, cells a side, x, z (or x, y in 2D): the middle, ground(x, z):
 * the ground height (a gs.outdoors Land's height works: (x, z) => land.height(x, z)), edges: 'wall'
 * (water stays in) or 'drain' (it runs off the sides). update(dt) runs it; depth, level, current and
 * wet answer where it is. gs.outdoors FloodWater draws it (and runs it on the graphics chip with WebGPU).
 */
export class Flood {
  constructor({ size = 40, cells = 64, x = 0, z = 0, y = null, ground = () => 0, edges = 'wall', damp = .995, rate = 60 } = {}) {
    const N = cells | 0; this.N = N; this.size = size; this.l = size / N; this.x0 = x - size / 2; this.z0 = (y ?? z) - size / 2;
    this.B = new Float32Array(N * N); this.D = new Float32Array(N * N); this.F = new Float32Array(N * N * 4);   // fluxes out: left, right, up (-z), down (+z)
    this.edges = edges; this.damp = damp; this.rate = rate; this.acc = 0; this.sources = []; this.rainRate = 0; this.gpu = null; this.t = 0;
    this.ground(ground);
  }
  /** Sets the ground again (after digging or building a dam): fn(x, z) => height. */
  ground(fn) { const { N, l } = this; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.B[j * N + i] = fn(this.x0 + (i + .5) * l, this.z0 + (j + .5) * l); if (this.gpu) this.gpu.dirty = true; return this; }
  cell(x, z) { const i = Math.floor((x - this.x0) / this.l), j = Math.floor((z - this.z0) / this.l); return i < 0 || j < 0 || i >= this.N || j >= this.N ? -1 : j * this.N + i; }
  /** A tap: rate cubic metres a second into a disc of radius r (a negative rate is a drain). Returns it; change .rate or remove(src). */
  pour(x, z, rate = 1, r = 1) { const s = { x, z, rate, r }; this.sources.push(s); return s; }
  /** A drain: takes up to rate cubic metres a second. */
  drain(x, z, rate = 1, r = 1) { return this.pour(x, z, -rate, r); }
  remove(s) { this.sources = this.sources.filter(o => o !== s); return this; }
  /** Rain: metres of water a second over everything (.002 is a downpour). */
  rain(rate) { this.rainRate = rate; return this; }
  /** Adds a volume of water at once (a burst dam, a bucket). */
  add(x, z, volume, r = 1) { this.spread(x, z, r, volume, true); if (this.gpu) this.gpu.dirty = true; return this; }
  spread(x, z, r, amount, once) {
    const { N, l, D } = this, cs = []; const rc = Math.max(r, l * .5);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const cx = this.x0 + (i + .5) * l, cz = this.z0 + (j + .5) * l; if ((cx - x) ** 2 + (cz - z) ** 2 <= rc * rc) cs.push(j * N + i); }
    if (!cs.length) { const k = this.cell(x, z); if (k >= 0) cs.push(k); }
    const per = amount / (cs.length * l * l); for (const k of cs) D[k] = Math.max(0, D[k] + per);
    return once;
  }
  /** Water depth at a point (0 when dry). */
  depth(x, z) { const k = this.cell(x, z); return k < 0 ? 0 : this.D[k]; }
  /** Whether a point is under water (deeper than `deep` metres). */
  wet(x, z, deep = .02) { return this.depth(x, z) > deep; }
  /** The water surface height at a point (the ground where it's dry). */
  level(x, z) { const k = this.cell(x, z); return k < 0 ? 0 : this.B[k] + this.D[k]; }
  /** Which way and how fast the water moves at a point: { x, z, speed } (m/s). */
  current(x, z) {
    const k = this.cell(x, z); if (k < 0) return { x: 0, z: 0, speed: 0 };
    const { N, F, l } = this, i = k % N, j = (k / N) | 0, d = Math.max(this.D[k], .01);
    const fx = (F[k * 4 + 1] - F[k * 4] + (i > 0 ? F[(k - 1) * 4 + 1] : 0) - (i < N - 1 ? F[(k + 1) * 4] : 0)) / 2;
    const fz = (F[k * 4 + 3] - F[k * 4 + 2] + (j > 0 ? F[(k - N) * 4 + 3] : 0) - (j < N - 1 ? F[(k + N) * 4 + 2] : 0)) / 2;
    const vx = fx / (l * d), vz = fz / (l * d); return { x: vx, z: vz, speed: Math.hypot(vx, vz) };
  }
  /** All the water there is, in cubic metres. */
  volume() { let v = 0; for (const d of this.D) v += d; return v * this.l * this.l; }
  /** Runs the water on (`rate` steps a second, however long the frame). On WebGPU with FloodWater the graphics chip does it. */
  update(dt) {
    this.acc = Math.min(this.acc + dt, .1); const h = 1 / this.rate;
    while (this.acc >= h) { this.acc -= h; if (this.gpu) this.gpu.steps++; else this.step(h); }
    return this;
  }
  /** One step of h seconds (on the CPU). */
  step(h) {
    const { N, B, D, F, l, damp } = this, A = l * l, g = 9.81, k = h * g * l, wall = this.edges === 'wall';   // (h A g / l with pipe area A = l^2)
    this.t += h;
    for (const s of this.sources) this.spread(s.x, s.z, s.r, s.rate * h);
    if (this.rainRate) for (let i = 0; i < D.length; i++) D[i] += this.rainRate * h;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = j * N + i, hc = B[c] + D[c], o = c * 4;
      // to the edge: a wall holds water in; a drain lets it out as if the ground beyond were far below
      const out = (n, f) => n < 0 ? (wall ? 0 : Math.max(0, f * damp + k * Math.max(D[c], 0))) : Math.max(0, f * damp + k * (hc - B[n] - D[n]));
      F[o] = out(i > 0 ? c - 1 : -1, F[o]); F[o + 1] = out(i < N - 1 ? c + 1 : -1, F[o + 1]);
      F[o + 2] = out(j > 0 ? c - N : -1, F[o + 2]); F[o + 3] = out(j < N - 1 ? c + N : -1, F[o + 3]);
      const sum = (F[o] + F[o + 1] + F[o + 2] + F[o + 3]) * h, have = D[c] * A;
      if (sum > have) { const s = sum > 0 ? have / sum : 0; F[o] *= s; F[o + 1] *= s; F[o + 2] *= s; F[o + 3] *= s; }
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = j * N + i, o = c * 4;
      const inflow = (i > 0 ? F[(c - 1) * 4 + 1] : 0) + (i < N - 1 ? F[(c + 1) * 4] : 0) + (j > 0 ? F[(c - N) * 4 + 3] : 0) + (j < N - 1 ? F[(c + N) * 4 + 2] : 0);
      D[c] = Math.max(0, D[c] + (inflow - F[o] - F[o + 1] - F[o + 2] - F[o + 3]) * h / A);
    }
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Flood.prototype, 'update', 'water flow');
