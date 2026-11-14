// Smoke and fire that flow (gs.gas): a gas simulation in a box of your world. Smoke rises, curls, spreads
// under a ceiling, pours round solid things and is carried off by the wind; fire burns its fuel into heat
// and soot, and an explosion throws a fireball that rolls up into a mushroom. On phones with WebGPU the
// whole gas runs on the graphics chip in hundreds of thousands of cells and is drawn as a lit volume
// (src/kit/gas-gpu.js); everywhere else the same maths runs here in a much coarser grid, drawn as soft
// puffs that ride the flow. The method is the "stable fluids" one (Stam 1999, as Fedkiw's smoke and GPU
// Gems 3 chapter 30 use it): a grid of cells carries speed, smoke, heat and fuel; each step everything is
// carried along the flow, heat lifts, swirls are kept alive, and the flow is made to neither pile up nor
// thin out (a pressure solve), which is what makes it roll and curl like real smoke.
//
//   const { Gas } = gs.gas;
//   function setup() {                                                          // once, with the scene
//     gas = new Gas(view, { box: [-4, 0, -4, 4, 6, 4], kind: 'fire' });         // where the smoke can go
//     camp = gas.fire({ x: 0, y: .2, z: 0, size: 1 });                          // a fire that keeps burning
//     rock = gas.ball({ x: 0, y: 2.5, z: 0, r: .8 });                           // the smoke goes round it
//   }
//   reset() { gas.clear(); }
//   update(dt) { camp.on = lit; gas.wind.x = 1.5; gas.update(dt);
//                if (gas.smokeAt(px, py + 1.6, pz) > .4) cough(); }
//
// Everything is in your world's units: places, sizes and speeds (units a second). The kit picks how many
// cells the phone can run (gas.cells). Questions are answered from the gas: smokeAt(), heatAt(), flowAt(),
// sees() (how much can be seen through the smoke between two points), smokeIn(box), glow (where its fire
// is and how big). On WebGPU the answers are a few frames old and four cells coarse.
// Kit use: view is an HDView (Next Gen, Board); in a Console or AR view it runs the smaller version.
import { timed } from './prof.js';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, NormalBlending, PointLight, Quaternion, Vector3 } from 'three';
import { webgpu } from './gpu.js';
import { phoneClass } from './speed.js';
import { own } from './cleanup.js';

// The gas works in cells and steps: a place is counted in cells from the grid's corner, a speed in cells a
// step. SOURCES: fires, smoke makers, fans and bursts at work in one step; SOLIDS: moving solid things.
// Heat: WARM is the warmest smoke without fire (a smoke maker's heat of 1); fuel burns where the heat is over
// IGNITE; HEAT: how much heat a unit of fuel burns into; BURNS_AT: the heat a flame burns at (burning makes
// the gas no hotter than this); FLAME: heat from which the gas glows as flame; QUENCH: how fast gas hotter
// than that cools back to it once its fuel is gone (the share a second, on top of the kind's own cooling).
// The MAX numbers cap a cell; VMAX: the fastest the gas goes (cells a step). SHARP: how much of the smoke's
// blur each step is put right (see advect): all of it (1) made smoke out of nothing along every edge, none
// (0) lost it in fast flows; at .6 a plume keeps about the smoke it has. NEAR: how much of its speed towards
// a wall a cell beside the wall keeps (see project).
export const SOURCES = 16, SOLIDS = 8, WARM = .4, IGNITE = .3, HEAT = 2.2, BURNS_AT = 1.25, FLAME = .45, QUENCH = 7, SMOKE_MAX = 4, HEAT_MAX = 2, FUEL_MAX = 2, VMAX = 6, SHARP = .6, NEAR = .35;
// (bits of a cell's neighbours, two a side in the order -x +x -y +y -z +z: 0 gas, 1 a wall or solid thing, 2 open air beyond the box; SOLID: the cell itself is solid)
export const SOLID = 0x1000;
// Cells by the phone's class. On the graphics chip a phone gets far fewer than a desktop's (desk): Rob's Fold (Adreno 840,
// the fastest phone chip there is, 2026-11-13) took about 10 ms of its chip a step for 297,360 cells, two steps a frame
// once it fell to 24 frames a second; 110,000 is about 3.5 ms a step there.
const BUDGET = { gpu: { desk: 300000, top: 110000, mid: 50000, low: 30000 }, cpu: { top: 12000, mid: 8000, low: 5000 } };
const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const RATE = { gpu: 60, cpu: 30 }, JACOBI = { gpu: 24, cpu: 10 };
const PUFFS = { top: 700, mid: 480, low: 300 }, MARCH = { top: 56, mid: 44, low: 32 };   // puffs drawn (the smaller version); steps a pixel's ray takes through the gas (WebGPU)
// While the graphics chip takes longer than the game's frame (its own timestamps, WebGPU), the gas on it does less: the
// pressure gets fewer rounds (down to JACOBI_LOW), each pixel's ray fewer steps (down to MARCH_LOW of them), and a frame
// takes at most one step, so steps that fell behind are let go (the smoke runs a little slow, where catching up made the
// frame slower still: two or three steps a frame at 24 a second). Each comes back as the chip has room again.
const JACOBI_LOW = 12, MARCH_LOW = .65;

/**
 * Ready-made gases. colour: the smoke; colour2: a second smoke colour (a source's `tint` 0..1 blends to it);
 * flame: three colours, from a flame's cool edge to its core; lift: how hard heat rises (units a second
 * squared for a unit of heat); weight: how hard the smoke itself sinks; fade: the share of smoke lost a
 * second; cool: the share of heat lost a second; thick: how much a unit of smoke hides in a unit of length;
 * soot: smoke made by a unit of burnt fuel; burn: the share of fuel burnt a second; curl: how lively the
 * swirls are (0..1); glow: how bright flame is.
 */
export const KINDS = {
  smoke: { colour: '#b4b6b9', colour2: '#f2f2f2', lift: 14, weight: 0, fade: .04, cool: .15, thick: 2.2 },
  fire: { colour: '#6a655f', colour2: '#b9b9b9', lift: 9, weight: 0, fade: .15, cool: .4, thick: 2.6, soot: .6 },
  steam: { colour: '#eef2f5', colour2: '#ffffff', lift: 12, weight: 0, fade: .55, cool: .4, thick: 1.6 },
  dust: { colour: '#b39b72', colour2: '#d8c9a8', lift: 3, weight: 1.2, fade: .3, cool: 2, thick: 2 },
  toxic: { colour: '#86c540', colour2: '#d6f06a', lift: 2, weight: 2.5, fade: .05, cool: 1.5, thick: 2 },
  magic: { colour: '#40307a', colour2: '#8a6cff', flame: ['#3b1a9a', '#7c4dff', '#d6f2ff'], lift: 9, weight: 0, fade: .4, cool: .8, thick: 1.5, soot: .25 },
};
const BASE = { flame: ['#c21a05', '#ff7a12', '#ffe9a8'], soot: .5, burn: 8, curl: .35, glow: 1 };

/**
 * Test switches (hidden from games): klass forces the phone's class and force the number of cells (both versions);
 * twin: the JavaScript version takes its steps as the graphics chip does (as often, with as many rounds of
 * pressure), to hold the two against each other; backend and cells say what the last gas to step ran on.
 */
export const GAS = { klass: null, force: 0, twin: false, backend: '', cells: 0 };
if (typeof window !== 'undefined' && navigator.webdriver) window.__gas = GAS;
const budget = big => { const c0 = GAS.klass || phoneClass(), c = big && c0 === 'top' && !PHONE && !GAS.klass ? 'desk' : c0, k = big ? 'gpu' : 'cpu', r = big || GAS.twin ? 'gpu' : 'cpu'; return { cells: GAS.force || BUDGET[k][c] || BUDGET[k].low, rate: RATE[r], jacobi: JACOBI[r], puffs: PUFFS[c] || PUFFS.low, march: MARCH[c] || MARCH.low }; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// its own dice (mulberry32): the same seed makes the same gas every time
const dice = seed => { seed >>>= 0; return () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/* ---------- solid things in the gas ---------- */
const _q = new Quaternion(), _m = new Matrix4(), _v3 = new Vector3(), _s3 = new Vector3();
/** A solid thing in the gas (gas.ball, gas.box, gas.tube). Move it with set(); the gas feels how fast it goes. */
class Solid {
  // T: 0 a ball (r), 1 a box (w, h, d), 2 a tube standing on y (r, h)
  constructor(gas, T, o) {
    this.gas = gas; this.T = T; this.x = o.x || 0; this.y = o.y || 0; this.z = o.z || 0; this.q = new Quaternion(); if (o.turn) this.q.copy(o.turn);
    this.size = T === 0 ? [o.r ?? .5, 0, 0] : T === 1 ? [(o.w ?? 1) / 2, (o.h ?? 1) / 2, (o.d ?? 1) / 2] : [o.r ?? .5, (o.h ?? 1) / 2, 0];
    this.follow = o.follow || null; this.v = [0, 0, 0]; this.w = [0, 0, 0]; this.pq = new Quaternion();
    if (this.follow) this.track();
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pq.copy(this.q);
  }
  /** Puts it somewhere (and turns it: a three.js Quaternion). Call it each frame for a thing that moves. */
  set(x, y, z, turn = null) { this.x = x; this.y = y; this.z = z; if (turn) this.q.copy(turn); return this; }
  // follow: a three.js object, or a body in a gs.physics3d World3D (a box, a rider, a kart's or a boat's .rider): it keeps to its middle
  track() {
    const f = this.follow, b = f.body?.translation ? f.body : null;
    if (b) { const p = f.world?.outer ? f.world.outer(b.translation()) : b.translation(), r = b.rotation(); this.x = p.x; this.y = p.y; this.z = p.z; this.q.set(r.x, r.y, r.z, r.w); return; }
    f.updateWorldMatrix?.(true, false); _m.copy(f.matrixWorld).decompose(_v3, this.q, _s3); this.x = _v3.x; this.y = _v3.y; this.z = _v3.z;
  }
  // how it moved since the last update: its speed (units a second) and its spin (radians a second, round world axes); true if it moved at all
  moved(dt) {
    if (this.follow) this.track();
    const k = dt > 1e-6 ? 1 / dt : 0, was = this.v[0] || this.v[1] || this.v[2] || this.w[0] || this.w[1] || this.w[2];
    this.v[0] = (this.x - this.px) * k; this.v[1] = (this.y - this.py) * k; this.v[2] = (this.z - this.pz) * k;
    _q.copy(this.pq).invert().premultiply(this.q);
    const s = Math.hypot(_q.x, _q.y, _q.z), a = s > 1e-7 ? 2 * Math.atan2(s, _q.w) : 0, a2 = a > Math.PI ? a - 2 * Math.PI : a, f = s > 1e-7 ? a2 / s * k : 0;
    this.w[0] = _q.x * f; this.w[1] = _q.y * f; this.w[2] = _q.z * f;
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pq.copy(this.q);
    return !!(was || this.v[0] || this.v[1] || this.v[2] || this.w[0] || this.w[1] || this.w[2]);
  }
  // this solid in cells and steps, for a sim (and for the graphics chip: gas-gpu.js reads the same fields)
  pack(S, out = this.packed ||= { m: new Float32Array(9) }) {
    const h = S.h, [a, b, c] = this.size;
    out.T = this.T; out.cx = (this.x - S.ox) / h; out.cy = (this.y - S.oy) / h; out.cz = (this.z - S.oz) / h; out.ax = a / h; out.ay = b / h; out.az = c / h;
    // the turn that takes world axes to the solid's own (rows: its axes in the world)
    const q = this.q, x = q.x, y = q.y, z = q.z, w = q.w, m = out.m;
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
    m[3] = 2 * (x * y - z * w); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z + x * w);
    m[6] = 2 * (x * z + y * w); m[7] = 2 * (y * z - x * w); m[8] = 1 - 2 * (x * x + y * y);
    const kv = S.dt / h; out.vx = this.v[0] * kv; out.vy = this.v[1] * kv; out.vz = this.v[2] * kv;
    out.wx = this.w[0] * S.dt; out.wy = this.w[1] * S.dt; out.wz = this.w[2] * S.dt;
    out.R = Math.hypot(out.ax, out.ay, out.az) + .5;
    return out;
  }
  remove() { const l = this.gas.solids, i = l.indexOf(this); if (i >= 0) { l.splice(i, 1); this.gas.marks = true; } }
}
// is a point (from a packed solid's middle, in cells) inside it?
function inside(s, ex, ey, ez) {
  const m = s.m, px = m[0] * ex + m[1] * ey + m[2] * ez, py = m[3] * ex + m[4] * ey + m[5] * ez, pz = m[6] * ex + m[7] * ey + m[8] * ez;
  if (s.T === 0) return px * px + py * py + pz * pz < s.ax * s.ax;
  if (s.T === 1) return Math.abs(px) < s.ax && Math.abs(py) < s.ay && Math.abs(pz) < s.az;
  return px * px + pz * pz < s.ax * s.ax && Math.abs(py) < s.ay;
}

/* ---------- the gas at one size: its grid ---------- */
// Each cell keeps four numbers in each of these: U its speed (x, y, z) and whether it is gas (1; a solid
// cell holds nothing: 0); S its smoke, heat, fuel and tinted smoke (the share of its smoke that is the
// second colour); U2, S2 and S3 the same while a step works them out; O the speed of the solid thing in it,
// and whether there is one; W its swirl (x, y, z) and how strong. P is its pressure, D how much the flow
// piles up in it, B what its six neighbours are (SOLID above), M whether the world is solid there.
class Sim {
  // lean: the graphics chip runs this size (gas-gpu.js): only the world's shape and the answers are kept here
  constructor(G, N, rate, lean = false) {
    const [x0, y0, z0, x1, y1, z1] = G.bounds, sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    let h = Math.min(Math.cbrt(sx * sy * sz / N), Math.min(sx, sy, sz) / 4), nx, ny = Math.max(4, Math.round(sy / h)) + 1, nz;
    // (the floor and the top are exactly the box's; never more cells than asked for)
    do { ny--; h = sy / ny; nx = Math.max(4, Math.round(sx / h)); nz = Math.max(4, Math.round(sz / h)); } while (nx * ny * nz > N && ny > 4);
    Object.assign(this, { G, h, nx, ny, nz, cells: nx * ny * nz, lean, dt: 1 / rate, steps: 0, stamp: 0 });
    this.ox = x0 + (sx - nx * h) / 2; this.oy = y0; this.oz = z0 + (sz - nz * h) / 2;
    this.kv = h / this.dt;   // cells a step to units a second
    this.M = new Uint8Array(this.cells); this.shape();
    if (!lean) this.alloc();
  }
  alloc() {
    const n = this.cells;
    this.U = new Float32Array(n * 4); this.S = new Float32Array(n * 4); this.U2 = new Float32Array(n * 4); this.S2 = new Float32Array(n * 4); this.S3 = new Float32Array(n * 4);
    this.O = new Float32Array(n * 4); this.W = new Float32Array(n * 4); this.P = new Float32Array(n); this.P2 = new Float32Array(n); this.D = new Float32Array(n); this.B = new Uint16Array(n);
    this.smoky = new Int32Array(n); this.hot = new Int32Array(n); this.nSmoky = this.nHot = 0;
    this.lean = false;
  }
  // where the world is solid (gas.ground, gas.solid), a cell at a time
  shape() {
    const { nx, ny, nz, h, M } = this, gf = this.G.groundFn, sf = this.G.solidFn; M.fill(0);
    if (gf || sf) for (let k = 0, c = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
      const x = this.ox + (i + .5) * h, y = this.oy + (j + .5) * h, z = this.oz + (k + .5) * h;
      if ((gf && y < gf(x, z)) || (sf && sf(x, y, z))) M[c] = 1;
    }
    this.shaped = (this.shaped || 0) + 1; this.G.marks = true;
  }
  /** Which cells are solid and how fast the solid there moves (O), and what each cell's six neighbours are (B). */
  mark() {
    const { nx, ny, nz, O, M, B, U } = this, G = this.G, solids = G.packed, ns = Math.min(solids.length, SOLIDS), cl = G.closed, nxy = nx * ny;
    for (let k = 0, c = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
      const a = c * 4; let s = M[c], vx = 0, vy = 0, vz = 0;
      for (let q = 0; q < ns && !s; q++) {
        const so = solids[q], ex = i + .5 - so.cx, ey = j + .5 - so.cy, ez = k + .5 - so.cz; if (ex * ex + ey * ey + ez * ez > so.R * so.R || !inside(so, ex, ey, ez)) continue;
        s = 1; vx = so.vx + so.wy * ez - so.wz * ey; vy = so.vy + so.wz * ex - so.wx * ez; vz = so.vz + so.wx * ey - so.wy * ex;
      }
      O[a] = vx; O[a + 1] = vy; O[a + 2] = vz; O[a + 3] = s;
      if (U) { if (s) U[a] = U[a + 1] = U[a + 2] = U[a + 3] = 0; else U[a + 3] = 1; }   // (the flow's fourth number: 1 where there is gas, 0 in a solid cell, which holds nothing)
    }
    const code = (edge, shut, n) => edge ? (shut ? 1 : 2) : O[n * 4 + 3] ? 1 : 0;
    for (let k = 0, c = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
      B[c] = (O[c * 4 + 3] ? SOLID : 0) | code(i === 0, cl[0], c - 1) | code(i === nx - 1, cl[1], c + 1) << 2 | code(j === 0, cl[2], c - nx) << 4 | code(j === ny - 1, cl[3], c + nx) << 6 | code(k === 0, cl[4], c - nxy) << 8 | code(k === nz - 1, cl[5], c + nxy) << 10;
    }
  }
  // this step's numbers, from the gas's settings (the graphics chip reads the same ones: gas-gpu.js)
  numbers() {
    const G = this.G, dt = this.dt, h = this.h, ka = dt * dt / h, kv = dt / h, w = G.wind;
    this.keepS = Math.exp(-G.fade * dt); this.keepH = Math.exp(-G.cool * dt); this.keepF = Math.exp(-QUENCH * dt); this.burnK = 1 - Math.exp(-G.burn * dt); this.soot = G.soot;
    this.lift = G.lift * ka; this.weight = G.weight * ka; this.eps = Math.min(.12, G.curl * 20 * dt);   // (a step's push at most this: more and a plume is flung about)
    this.wx = w.x * kv; this.wy = w.y * kv; this.wz = w.z * kv; this.windK = w.x || w.y || w.z ? 1 - Math.exp(-.5 * dt) : 0;
  }
  /** One step, here on the CPU. src: this step's sources (Gas.sources()); iters: how many rounds the pressure gets. */
  step(src, iters) {
    if (this.G.marks) { this.mark(); this.G.marks = false; }
    this.numbers(); this.advect(src); this.curl(); this.confine(); this.diverge(src); this.pressure(iters); this.project();
    this.steps++; this.stamp++;
  }
  // Everything is carried along the flow: each cell takes what was upstream of it a step ago (blended from
  // the eight cells there). That alone blurs smoke away in a few steps, so the smoke, heat and fuel are then
  // put right (MacCormack's way): what was carried is carried back again, and some of what that changed is
  // given back (SHARP), never past the least and most of the cells it came from. Then: smoke thins, heat cools, fuel
  // burns to heat and soot, heat lifts, the wind leans on it; then the sources.
  advect(src) {
    const { nx, ny, nz, U, S, U2, S2, S3, B, O, keepS, keepH, keepF, burnK, soot, lift, weight, windK, wx, wy, wz } = this, cl = this.G.closed, nxy = nx * ny;
    const X1 = nx - 1.001, Y1 = ny - 1.001, Z1 = nz - 1.001, ex = 4, ey = nx * 4, ez = nxy * 4;
    let c = 0, ns = 0, nh = 0; const smoky = this.smoky, hot = this.hot;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
      const a = c * 4;
      if (B[c] & SOLID) { U2[a] = U2[a + 1] = U2[a + 2] = U2[a + 3] = 0; S2[a] = S2[a + 1] = S2[a + 2] = S2[a + 3] = 0; continue; }
      const px = i + .5 - U[a], py = j + .5 - U[a + 1], pz = k + .5 - U[a + 2];
      const fx = clamp(px - .5, 0, X1), fy = clamp(py - .5, 0, Y1), fz = clamp(pz - .5, 0, Z1), i0 = fx | 0, j0 = fy | 0, k0 = fz | 0, tx = fx - i0, ty = fy - j0, tz = fz - k0;
      const b = ((k0 * ny + j0) * nx + i0) * 4, sx = 1 - tx, sy = 1 - ty, sz = 1 - tz;
      const w0 = sx * sy * sz, w1 = tx * sy * sz, w2 = sx * ty * sz, w3 = tx * ty * sz, w4 = sx * sy * tz, w5 = tx * sy * tz, w6 = sx * ty * tz, w7 = tx * ty * tz;
      const b1 = b + ex, b2 = b + ey, b3 = b2 + ex, b4 = b + ez, b5 = b4 + ex, b6 = b4 + ey, b7 = b6 + ex;
      // (solid cells hold nothing and are left out of the blend: what is beside a solid thing is not thinned or slowed by it)
      let g = w0 * U[b + 3] + w1 * U[b1 + 3] + w2 * U[b2 + 3] + w3 * U[b3 + 3] + w4 * U[b4 + 3] + w5 * U[b5 + 3] + w6 * U[b6 + 3] + w7 * U[b7 + 3]; g = g > .999 ? 1 : g > .02 ? 1 / g : 0;
      U2[a] = (w0 * U[b] + w1 * U[b1] + w2 * U[b2] + w3 * U[b3] + w4 * U[b4] + w5 * U[b5] + w6 * U[b6] + w7 * U[b7]) * g;
      U2[a + 1] = (w0 * U[b + 1] + w1 * U[b1 + 1] + w2 * U[b2 + 1] + w3 * U[b3 + 1] + w4 * U[b4 + 1] + w5 * U[b5 + 1] + w6 * U[b6 + 1] + w7 * U[b7 + 1]) * g;
      U2[a + 2] = (w0 * U[b + 2] + w1 * U[b1 + 2] + w2 * U[b2 + 2] + w3 * U[b3 + 2] + w4 * U[b4 + 2] + w5 * U[b5 + 2] + w6 * U[b6 + 2] + w7 * U[b7 + 2]) * g; U2[a + 3] = 1;
      // (from beyond an open side comes clean air)
      if ((px < 0 && !cl[0]) || (px > nx && !cl[1]) || (py < 0 && !cl[2]) || (py > ny && !cl[3]) || (pz < 0 && !cl[4]) || (pz > nz && !cl[5])) { S2[a] = S2[a + 1] = S2[a + 2] = S2[a + 3] = 0; continue; }
      S2[a] = (w0 * S[b] + w1 * S[b1] + w2 * S[b2] + w3 * S[b3] + w4 * S[b4] + w5 * S[b5] + w6 * S[b6] + w7 * S[b7]) * g;
      S2[a + 1] = (w0 * S[b + 1] + w1 * S[b1 + 1] + w2 * S[b2 + 1] + w3 * S[b3 + 1] + w4 * S[b4 + 1] + w5 * S[b5 + 1] + w6 * S[b6 + 1] + w7 * S[b7 + 1]) * g;
      S2[a + 2] = (w0 * S[b + 2] + w1 * S[b1 + 2] + w2 * S[b2 + 2] + w3 * S[b3 + 2] + w4 * S[b4 + 2] + w5 * S[b5 + 2] + w6 * S[b6 + 2] + w7 * S[b7 + 2]) * g;
      S2[a + 3] = (w0 * S[b + 3] + w1 * S[b1 + 3] + w2 * S[b2 + 3] + w3 * S[b3 + 3] + w4 * S[b4 + 3] + w5 * S[b5 + 3] + w6 * S[b6 + 3] + w7 * S[b7 + 3]) * g;
    }
    c = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
      const a = c * 4;
      if (B[c] & SOLID) { S3[a] = S3[a + 1] = S3[a + 2] = S3[a + 3] = 0; continue; }
      let sm = S2[a], he = S2[a + 1], fu = S2[a + 2], ti = S2[a + 3];
      // (clear air stays as it is: most of the box)
      if (sm + he + fu + S[a] + S[a + 1] + S[a + 2] > 1e-4) {
        const ux = U[a], uy = U[a + 1], uz = U[a + 2], px = i + .5 - ux, py = j + .5 - uy, pz = k + .5 - uz;
        if (!((px < 0 && !cl[0]) || (px > nx && !cl[1]) || (py < 0 && !cl[2]) || (py > ny && !cl[3]) || (pz < 0 && !cl[4]) || (pz > nz && !cl[5]))) {
          // the eight cells it came from, and the eight it is carried back from
          const bx = clamp(px - .5, 0, X1) | 0, by = clamp(py - .5, 0, Y1) | 0, bz = clamp(pz - .5, 0, Z1) | 0, b = ((bz * ny + by) * nx + bx) * 4;
          const fx = clamp(i + ux, 0, X1), fy = clamp(j + uy, 0, Y1), fz = clamp(k + uz, 0, Z1), i0 = fx | 0, j0 = fy | 0, k0 = fz | 0, tx = fx - i0, ty = fy - j0, tz = fz - k0;
          const f = ((k0 * ny + j0) * nx + i0) * 4, sx = 1 - tx, sy = 1 - ty, sz = 1 - tz;
          const w0 = sx * sy * sz, w1 = tx * sy * sz, w2 = sx * ty * sz, w3 = tx * ty * sz, w4 = sx * sy * tz, w5 = tx * sy * tz, w6 = sx * ty * tz, w7 = tx * ty * tz;
          let gk = w0 * U2[f + 3] + w1 * U2[f + ex + 3] + w2 * U2[f + ey + 3] + w3 * U2[f + ey + ex + 3] + w4 * U2[f + ez + 3] + w5 * U2[f + ez + ex + 3] + w6 * U2[f + ez + ey + 3] + w7 * U2[f + ez + ey + ex + 3]; gk = gk > .999 ? 1 : gk > .02 ? 1 / gk : 0;
          if (gk) for (let q = 0; q < 4; q++) {
            const g = f + q, back = (w0 * S2[g] + w1 * S2[g + ex] + w2 * S2[g + ey] + w3 * S2[g + ey + ex] + w4 * S2[g + ez] + w5 * S2[g + ez + ex] + w6 * S2[g + ez + ey] + w7 * S2[g + ez + ey + ex]) * gk;
            const d = b + q, v0 = S[d], v1 = S[d + ex], v2 = S[d + ey], v3 = S[d + ey + ex], v4 = S[d + ez], v5 = S[d + ez + ex], v6 = S[d + ez + ey], v7 = S[d + ez + ey + ex];
            const lo = Math.min(v0, v1, v2, v3, v4, v5, v6, v7), hi = Math.max(v0, v1, v2, v3, v4, v5, v6, v7), v = clamp(S2[a + q] + SHARP * .5 * (S[a + q] - back), lo, hi);
            if (q === 0) sm = v; else if (q === 1) he = v; else if (q === 2) fu = v; else ti = Math.min(v, sm);
          }
        }
        sm *= keepS; he *= keepH; fu *= keepS; ti *= keepS;
        if (he > FLAME) he = FLAME + (he - FLAME) * keepF;
        if (he > IGNITE && fu > 0) { const burn = fu * burnK; fu -= burn; he = Math.max(he, Math.min(BURNS_AT, he + burn * HEAT)); sm = Math.min(SMOKE_MAX, sm + burn * soot); }
      }
      // (heat lifts the cell above and the cell below a little too, and smoke weighs on them: a layer one cell thin
      // would otherwise move only every other row of cells, and be left behind by the air it should rise through)
      const b = B[c], dn = (b >> 4 & 3) === 0 ? a - ey : a, up = (b >> 6 & 3) === 0 ? a + ey : a;
      let ux = U2[a], uy = U2[a + 1] + lift * (.5 * he + .25 * (S2[dn + 1] + S2[up + 1])) - weight * (.5 * sm + .25 * (S2[dn] + S2[up])), uz = U2[a + 2];
      if (windK) { ux += (wx - ux) * windK; uy += (wy - uy) * windK; uz += (wz - uz) * windK; }
      const sp = Math.sqrt(ux * ux + uy * uy + uz * uz); if (sp > VMAX) { const f = VMAX / sp; ux *= f; uy *= f; uz *= f; }
      U2[a] = ux; U2[a + 1] = uy; U2[a + 2] = uz; S3[a] = sm; S3[a + 1] = he; S3[a + 2] = fu; S3[a + 3] = ti;
    }
    // the sources: smoke, heat and fuel in a ball each, and the flow there leant towards their own
    for (let q = 0; q < src.n; q++) {
      const s = src.rows[q], r2 = s.r * s.r;
      const i0 = Math.max(0, Math.floor(s.x - s.r)), i1 = Math.min(nx - 1, Math.floor(s.x + s.r)), j0 = Math.max(0, Math.floor(s.y - s.r)), j1 = Math.min(ny - 1, Math.floor(s.y + s.r)), k0 = Math.max(0, Math.floor(s.z - s.r)), k1 = Math.min(nz - 1, Math.floor(s.z + s.r));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = i + .5 - s.x, dy = j + .5 - s.y, dz = k + .5 - s.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 >= r2) continue;
        const cc = (k * ny + j) * nx + i, a = cc * 4; if (B[cc] & SOLID) continue;
        // (a source tops the gas up towards its own smoke, heat and fuel, most at its middle; it never takes any away)
        const w = 1 - d2 / r2, g = Math.min(1, w * s.grip), more = Math.max(0, s.smoke * w - S3[a]) * s.gain;
        S3[a] += more; S3[a + 3] = Math.min(S3[a], S3[a + 3] + more * s.tint);
        S3[a + 1] += Math.max(0, s.heat * w - S3[a + 1]) * s.gain; S3[a + 2] += Math.max(0, s.fuel * w - S3[a + 2]) * s.gain;
        U2[a] += (s.vx - U2[a]) * g; U2[a + 1] += (s.vy - U2[a + 1]) * g; U2[a + 2] += (s.vz - U2[a + 2]) * g;
      }
    }
    // where there is smoke and where there is flame, for the puffs
    for (let cc = 0, n = this.cells; cc < n; cc++) { const a = cc * 4; if (S3[a] > .04) smoky[ns++] = cc; if (S3[a + 1] > FLAME + .08) hot[nh++] = cc; }
    this.nSmoky = ns; this.nHot = nh;
  }
  // how the flow swirls round each cell
  curl() {
    if (!(this.eps > 0)) return;
    const { nx, ny, nz, U2: U, W, B } = this, nxy = nx * ny;
    for (let k = 0, c = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
      const a = c * 4, b = B[c]; if (b & SOLID) { W[a] = W[a + 1] = W[a + 2] = W[a + 3] = 0; continue; }
      // (a neighbour that is not gas counts as the cell itself: a wall is slid along, and makes no swirl of its own)
      const l = (b & 3 ? c : c - 1) * 4, r = (b >> 2 & 3 ? c : c + 1) * 4, d = (b >> 4 & 3 ? c : c - nx) * 4, u = (b >> 6 & 3 ? c : c + nx) * 4, n = (b >> 8 & 3 ? c : c - nxy) * 4, f = (b >> 10 & 3 ? c : c + nxy) * 4;
      const x = .5 * ((U[u + 2] - U[d + 2]) - (U[f + 1] - U[n + 1])), y = .5 * ((U[f] - U[n]) - (U[r + 2] - U[l + 2])), z = .5 * ((U[r + 1] - U[l + 1]) - (U[u] - U[d]));
      W[a] = x; W[a + 1] = y; W[a + 2] = z; W[a + 3] = Math.sqrt(x * x + y * y + z * z);
    }
  }
  // swirls are kept alive: the flow is pushed round where it swirls most (the grid would otherwise smooth them
  // away). Only where there is gas to see: in clear air the push fed on its own small errors until the air raced.
  confine() {
    const { nx, ny, nz, U, S, U2, S3, W, B, eps } = this, nxy = nx * ny;
    S.set(S3);
    if (!(eps > 0)) { U.set(U2); return; }
    for (let k = 0, c = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) {
      const a = c * 4;
      const on = Math.min(1, (S3[a] + S3[a + 1]) * 4);
      U[a + 3] = U2[a + 3]; if (B[c] & SOLID || !(on > 0)) { U[a] = U2[a]; U[a + 1] = U2[a + 1]; U[a + 2] = U2[a + 2]; continue; }
      const b = B[c], l = (b & 3 ? c : c - 1) * 4 + 3, r = (b >> 2 & 3 ? c : c + 1) * 4 + 3, d = (b >> 4 & 3 ? c : c - nx) * 4 + 3, u = (b >> 6 & 3 ? c : c + nx) * 4 + 3, n = (b >> 8 & 3 ? c : c - nxy) * 4 + 3, f = (b >> 10 & 3 ? c : c + nxy) * 4 + 3;
      const gx = .5 * (W[r] - W[l]), gy = .5 * (W[u] - W[d]), gz = .5 * (W[f] - W[n]), q = eps * on / (Math.sqrt(gx * gx + gy * gy + gz * gz) + 1e-5), wx = W[a], wy = W[a + 1], wz = W[a + 2];
      U[a] = U2[a] + q * (gy * wz - gz * wy); U[a + 1] = U2[a + 1] + q * (gz * wx - gx * wz); U[a + 2] = U2[a + 2] + q * (gx * wy - gy * wx);
    }
  }
  // how much the flow piles up in each cell (a burst wants it to: that is its blast)
  diverge(src) {
    const { nx, ny, nz, U, O, B, D } = this, nxy = nx * ny;
    for (let c = 0, n = this.cells; c < n; c++) {
      const b = B[c]; if (b & SOLID) { D[c] = 0; continue; }
      const a = c * 4;
      // each neighbour's speed towards or away: the gas's, a solid thing's own, or (open air) this cell's
      const xl = b & 3, xr = b >> 2 & 3, yl = b >> 4 & 3, yr = b >> 6 & 3, zl = b >> 8 & 3, zr = b >> 10 & 3;
      const ul = xl === 0 ? U[a - 4] : xl === 2 ? U[a] : c % nx ? O[a - 4] : 0, ur = xr === 0 ? U[a + 4] : xr === 2 ? U[a] : (c + 1) % nx ? O[a + 4] : 0;
      const vl = yl === 0 ? U[a - nx * 4 + 1] : yl === 2 ? U[a + 1] : c % nxy >= nx ? O[a - nx * 4 + 1] : 0, vr = yr === 0 ? U[a + nx * 4 + 1] : yr === 2 ? U[a + 1] : c % nxy < nxy - nx ? O[a + nx * 4 + 1] : 0;
      const wl = zl === 0 ? U[a - nxy * 4 + 2] : zl === 2 ? U[a + 2] : c >= nxy ? O[a - nxy * 4 + 2] : 0, wr = zr === 0 ? U[a + nxy * 4 + 2] : zr === 2 ? U[a + 2] : c < n - nxy ? O[a + nxy * 4 + 2] : 0;
      D[c] = .5 * (ur - ul + vr - vl + wr - wl);
    }
    for (let q = 0; q < src.n; q++) {
      const s = src.rows[q]; if (!s.div) continue;
      const r2 = s.r * s.r, i0 = Math.max(0, Math.floor(s.x - s.r)), i1 = Math.min(nx - 1, Math.floor(s.x + s.r)), j0 = Math.max(0, Math.floor(s.y - s.r)), j1 = Math.min(ny - 1, Math.floor(s.y + s.r)), k0 = Math.max(0, Math.floor(s.z - s.r)), k1 = Math.min(nz - 1, Math.floor(s.z + s.r));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = i + .5 - s.x, dy = j + .5 - s.y, dz = k + .5 - s.z, d2 = dx * dx + dy * dy + dz * dz, cc = (k * ny + j) * nx + i;
        if (d2 < r2 && !(B[cc] & SOLID)) D[cc] -= s.div * (1 - d2 / r2);
      }
    }
  }
  // the pressure that would even the flow out, a round at a time, each cell from its six neighbours (it starts from the last step's)
  pressure(iters) {
    const { nx, ny, D, B } = this, nxy = nx * ny, n = this.cells;
    let P = this.P, Q = this.P2;
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < n; c++) {
        const b = B[c];
        if (b === 0) { Q[c] = (P[c - 1] + P[c + 1] + P[c - nx] + P[c + nx] + P[c - nxy] + P[c + nxy] - D[c]) / 6; continue; }
        if (b & SOLID) { Q[c] = 0; continue; }
        const p = P[c], xl = b & 3, xr = b >> 2 & 3, yl = b >> 4 & 3, yr = b >> 6 & 3, zl = b >> 8 & 3, zr = b >> 10 & 3;
        Q[c] = ((xl === 0 ? P[c - 1] : xl === 1 ? p : 0) + (xr === 0 ? P[c + 1] : xr === 1 ? p : 0) + (yl === 0 ? P[c - nx] : yl === 1 ? p : 0) + (yr === 0 ? P[c + nx] : yr === 1 ? p : 0) + (zl === 0 ? P[c - nxy] : zl === 1 ? p : 0) + (zr === 0 ? P[c + nxy] : zr === 1 ? p : 0) - D[c]) / 6;
      }
      const t = P; P = Q; Q = t;
    }
    this.P = P; this.P2 = Q;
  }
  // the flow gives way to the pressure, and never goes into a wall or a solid thing
  project() {
    const { nx, ny, U, O, P, B } = this, nxy = nx * ny, n = this.cells;
    for (let c = 0; c < n; c++) {
      const b = B[c]; if (b & SOLID) continue;
      const a = c * 4;
      if (b === 0) { U[a] -= .5 * (P[c + 1] - P[c - 1]); U[a + 1] -= .5 * (P[c + nx] - P[c - nx]); U[a + 2] -= .5 * (P[c + nxy] - P[c - nxy]); continue; }
      const p = P[c], xl = b & 3, xr = b >> 2 & 3, yl = b >> 4 & 3, yr = b >> 6 & 3, zl = b >> 8 & 3, zr = b >> 10 & 3;
      let ux = U[a] - .5 * ((xr === 0 ? P[c + 1] : xr === 1 ? p : 0) - (xl === 0 ? P[c - 1] : xl === 1 ? p : 0));
      let uy = U[a + 1] - .5 * ((yr === 0 ? P[c + nx] : yr === 1 ? p : 0) - (yl === 0 ? P[c - nx] : yl === 1 ? p : 0));
      let uz = U[a + 2] - .5 * ((zr === 0 ? P[c + nxy] : zr === 1 ? p : 0) - (zl === 0 ? P[c - nxy] : zl === 1 ? p : 0));
      // Walls: which way is away from the walls this cell touches (a cell in the corner of a stair of cells gets a
      // slanted way, so gas can slide along a round thing's stair as along the thing itself), and of its speed
      // towards them it keeps only NEAR (the wall is at the cell's far side, not its middle: gas has to be able
      // to come right up to it). Between two walls it is held to their speed.
      let ax = 0, ay = 0, az = 0, wx = 0, wy = 0, wz = 0;
      if (xl === 1) { ax = 1; wx = c % nx ? O[a - 4] : 0; } if (xr === 1) { const w = (c + 1) % nx ? O[a + 4] : 0; if (ax) { ax = 0; ux = wx = (wx + w) * .5; } else { ax = -1; wx = w; } }
      if (yl === 1) { ay = 1; wy = c % nxy >= nx ? O[a - nx * 4 + 1] : 0; } if (yr === 1) { const w = c % nxy < nxy - nx ? O[a + nx * 4 + 1] : 0; if (ay) { ay = 0; uy = wy = (wy + w) * .5; } else { ay = -1; wy = w; } }
      if (zl === 1) { az = 1; wz = c >= nxy ? O[a - nxy * 4 + 2] : 0; } if (zr === 1) { const w = c < n - nxy ? O[a + nxy * 4 + 2] : 0; if (az) { az = 0; uz = wz = (wz + w) * .5; } else { az = -1; wz = w; } }
      const m = ax * ax + ay * ay + az * az;
      if (m) { const vn = (ux - wx) * ax + (uy - wy) * ay + (uz - wz) * az; if (vn < 0) { const f = (1 - NEAR) * vn / m; ux -= f * ax; uy -= f * ay; uz -= f * az; } }
      U[a] = ux; U[a + 1] = uy; U[a + 2] = uz;
    }
  }
  clear() { if (!this.lean) { for (const k of ['U', 'S', 'U2', 'S2', 'S3', 'W', 'P', 'P2', 'D']) this[k].fill(0); this.nSmoky = this.nHot = 0; this.G.marks = true; } this.steps = 0; this.stamp++; }
}

// A field of the gas to ask questions of: the grid itself here, a coarser copy from the graphics chip (gas-gpu.js)
// four numbers a cell at (x, y, z) in the field's cells, blended from the eight cells round it, into out
function sample(A, f, x, y, z, out) {
  const fx = clamp(x - .5, 0, f.nx - 1.001), fy = clamp(y - .5, 0, f.ny - 1.001), fz = clamp(z - .5, 0, f.nz - 1.001), i = fx | 0, j = fy | 0, k = fz | 0, tx = fx - i, ty = fy - j, tz = fz - k;
  const b = ((k * f.ny + j) * f.nx + i) * 4, ex = 4, ey = f.nx * 4, ez = f.nx * f.ny * 4;
  for (let q = 0; q < 4; q++) {
    const a = b + q, lo = (A[a] * (1 - tx) + A[a + ex] * tx) * (1 - ty) + (A[a + ey] * (1 - tx) + A[a + ey + ex] * tx) * ty, hi = (A[a + ez] * (1 - tx) + A[a + ez + ex] * tx) * (1 - ty) + (A[a + ez + ey] * (1 - tx) + A[a + ez + ey + ex] * tx) * ty;
    out[q] = lo + (hi - lo) * tz;
  }
  return out;
}
const T4 = [0, 0, 0, 0], T5 = [0, 0, 0, 0], KA = new Color(), KB = new Color();

/** How bright and what colour flame is at a heat (into out, [r, g, b]): nothing under FLAME, the look's three flame colours from its cool edge to its core. */
export function flameAt(heat, L, out) {
  const k = clamp((heat - FLAME) / .3, 0, 1), on = k * k * (3 - 2 * k) * (.3 + heat * heat) * L.glow, a = clamp((heat - .5) / .35, 0, 1), b = clamp((heat - .85) / .5, 0, 1), f = L.flame;
  for (let q = 0; q < 3; q++) { const c0 = q === 0 ? f[0].r : q === 1 ? f[0].g : f[0].b, c1 = q === 0 ? f[1].r : q === 1 ? f[1].g : f[1].b, c2 = q === 0 ? f[2].r : q === 1 ? f[2].g : f[2].b, m = c0 + (c1 - c0) * a; out[q] = (m + (c2 - m) * b) * on; }
  return out;
}

/* ---------- the smaller version's look: soft puffs that ride the flow ---------- */
// A puff is born where there is smoke (or flame), drifts with the gas, and is as dense as the smoke where it
// is now: together they show the gas the grid holds, with far more detail than the grid's own cells.
let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const n = 64, d = new Uint8Array(n * n * 4), rnd = dice(11), lump = []; for (let i = 0; i < 9; i++) lump.push([rnd() * 2 - 1, rnd() * 2 - 1, .25 + rnd() * .3]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + .5) / n * 2 - 1, v = (y + .5) / n * 2 - 1, r = Math.hypot(u, v);
    // a soft ball, with a few softer lumps on it so a puff isn't a disc
    let a = Math.max(0, 1 - r * r) ** 1.5 * .8; for (const [lx, ly, lr] of lump) a += Math.max(0, 1 - Math.hypot(u - lx * .45, v - ly * .45) / lr) * .12;
    a *= Math.max(0, Math.min(1, (1 - r) * 4));
    const o = (y * n + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(Math.min(1, a) * 255);
  }
  puffTex = new DataTexture(d, n, n); puffTex.magFilter = puffTex.minFilter = LinearFilter; puffTex.needsUpdate = true;
  return puffTex;
}
const STRIDE = 8;   // a puff: its place (cells), age and life (seconds), size (cells), turn, kind (0 smoke, 1 flame)
class Puffs {
  constructor(gas, cap) {
    this.gas = gas; this.cap = cap; this.P = new Float32Array(cap * STRIDE); this.n = 0; this.rnd = dice((gas.seed ^ 0x9e3779b9) >>> 0);
    const mk = add => {
      const g = new BufferGeometry(), uv = new Float32Array(cap * 8), idx = new Uint16Array(cap * 6);
      for (let i = 0; i < cap; i++) { uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
      const pos = new BufferAttribute(new Float32Array(cap * 12), 3), col = new BufferAttribute(new Float32Array(cap * 16), 4); pos.setUsage(DynamicDrawUsage); col.setUsage(DynamicDrawUsage);
      g.setAttribute('position', pos); g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setAttribute('color', col); g.setIndex(new BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
      const m = new Mesh(g, new MeshBasicMaterial({ map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: !add, blending: add ? AdditiveBlending : NormalBlending }));
      m.frustumCulled = false; m.renderOrder = add ? 6 : 5; m.userData.gsNoInk = true; m.userData.noAO = true; m.userData.gsBounds = gas.bounds; m.visible = false;
      return m;
    };
    this.soft = mk(false); this.glow = mk(true);
    // the camera the puffs were last drawn with: they face it, and the far ones are drawn first (not a camera that
    // looks for something else: a reflection's, or a map drawn from above; a Console view's own camera can be a flat one)
    this.right = new Vector3(1, 0, 0); this.up = new Vector3(0, 1, 0); this.eye = new Vector3(0, 0, 10); this.fwd = new Vector3(0, 0, -1);
    this.soft.onBeforeRender = (r, s, cam) => { if (cam.parent?.type === 'CubeCamera' || (cam.isOrthographicCamera && cam !== gas.view?.cam)) return; const e = cam.matrixWorld.elements; this.right.set(e[0], e[1], e[2]).normalize(); this.up.set(e[4], e[5], e[6]).normalize(); this.fwd.set(-e[8], -e[9], -e[10]).normalize(); this.eye.set(e[12], e[13], e[14]); };
    this.order = []; this.key = new Float32Array(cap);
  }
  // a step of the gas: the puffs drift with it, old ones go, new ones are born where the gas is
  step(S) {
    const P = this.P, rnd = this.rnd, dt = S.dt, U = S.U, G = this.gas;
    let n = 0, smokeN = 0, flameN = 0;
    for (let i = 0; i < this.n; i++) {
      const j = i * STRIDE, age = P[j + 3] + dt; if (age >= P[j + 4]) continue;
      sample(U, S, P[j], P[j + 1], P[j + 2], T4);
      const g = T4[3] > .999 ? 1 : T4[3] > .02 ? 1 / T4[3] : 0, x = P[j] + T4[0] * g, y = P[j + 1] + T4[1] * g, z = P[j + 2] + T4[2] * g;   // (solid cells left out of the blend, as in advect)
      if (x < 0 || y < 0 || z < 0 || x > S.nx || y > S.ny || z > S.nz) continue;
      const o = n * STRIDE; if (o !== j) P.copyWithin(o, j, j + STRIDE);
      P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = age; if (P[o + 7]) flameN++; else smokeN++; n++;
    }
    this.n = n;
    const born = (list, count, kind, want, life0, life1, size0, size1) => {
      for (let q = 0; q < want && this.n < this.cap && count > 0; q++) {
        const c = list[(rnd() * count) | 0], i = c % S.nx, jy = ((c / S.nx) | 0) % S.ny, k = (c / (S.nx * S.ny)) | 0, o = this.n++ * STRIDE;
        P[o] = i + rnd(); P[o + 1] = jy + rnd(); P[o + 2] = k + rnd(); P[o + 3] = 0; P[o + 4] = life0 + rnd() * (life1 - life0); P[o + 5] = size0 + rnd() * (size1 - size0); P[o + 6] = rnd() * 6.2832; P[o + 7] = kind;
      }
    };
    // as many puffs as the smoky cells need (a few each), born at the rate that keeps that many alive
    const capF = Math.round(this.cap * .35), capS = this.cap - capF;
    const wantS = Math.min(capS, Math.ceil(S.nSmoky * .9)), wantF = Math.min(capF, Math.ceil(S.nHot * 5));
    born(S.smoky, S.nSmoky, 0, Math.min(Math.max(0, wantS - smokeN), Math.ceil(wantS * dt / 2.2 * 1.6) + 1), 1.8, 3.2, 1.7 * G.size, 2.8 * G.size);
    born(S.hot, S.nHot, 1, Math.min(Math.max(0, wantF - flameN), Math.ceil(wantF * dt / .32 * 1.6) + 1), .22, .45, 1.3 * G.size, 2.1 * G.size);
  }
  // the puffs into the two meshes: smoke lit by the sun and the sky (darker where smoke lies above it), flame glowing
  draw(S, Lf) {
    const P = this.P, G = this.gas, L = G.look, h = S.h, rx = this.right, up = this.up, order = this.order, key = this.key;
    order.length = 0;
    for (let i = 0; i < this.n; i++) { const j = i * STRIDE; key[i] = (S.ox + P[j] * h - this.eye.x) * this.fwd.x + (S.oy + P[j + 1] * h - this.eye.y) * this.fwd.y + (S.oz + P[j + 2] * h - this.eye.z) * this.fwd.z; order.push(i); }
    order.sort((a, b) => key[b] - key[a]);
    const sp = this.soft.geometry.attributes.position.array, sc = this.soft.geometry.attributes.color.array, gp = this.glow.geometry.attributes.position.array, gc = this.glow.geometry.attributes.color.array;
    let ns = 0, ng = 0; const od = L.thick * h;
    for (const i of order) {
      const j = i * STRIDE, x = P[j], y = P[j + 1], z = P[j + 2], f = P[j + 3] / P[j + 4], flame = P[j + 7] > 0;
      sample(S.S, S, x, y, z, T4);
      const ease = Math.min(1, f * 5) * Math.min(1, (1 - f) * 2.5);
      let r, g, b, a, size;
      if (flame) {
        flameAt(T4[1], L, T5); const k = ease * .5; r = T5[0] * k; g = T5[1] * k; b = T5[2] * k; a = 1; size = P[j + 5] * (1 - f * .45);
        if (r + g + b < .01) continue;
      } else {
        a = Math.min(.55, T4[0] * 1.2) * ease; if (a < .012) continue;
        // smoke above this puff shades it (three looks up its column)
        const above = sample(S.S, S, x + Lf.gx * 1.5, y + Lf.gy * 1.5, z + Lf.gz * 1.5, T5)[0] + sample(S.S, S, x + Lf.gx * 3.5, y + Lf.gy * 3.5, z + Lf.gz * 3.5, T5)[0] * 1.5 + sample(S.S, S, x + Lf.gx * 6.5, y + Lf.gy * 6.5, z + Lf.gz * 6.5, T5)[0] * 2.5;
        const vis = Math.exp(-above * od * .8), t = T4[0] > 1e-4 ? clamp(T4[3] / T4[0], 0, 1) : 0, lit = .3 + .7 * vis;
        flameAt(T4[1], L, T5);   // (smoke just over a flame is lit by it)
        KA.copy(L.colour).lerp(L.colour2, t);
        r = KA.r * (Lf.sun.r * vis + Lf.sky.r * lit) + T5[0] * .12; g = KA.g * (Lf.sun.g * vis + Lf.sky.g * lit) + T5[1] * .12; b = KA.b * (Lf.sun.b * vis + Lf.sky.b * lit) + T5[2] * .12;
        size = P[j + 5] * (.75 + f * .9);
      }
      const hs = size * h * .5, cs = Math.cos(P[j + 6]) * hs, sn = Math.sin(P[j + 6]) * hs, wx = S.ox + x * h, wy = S.oy + y * h, wz = S.oz + z * h;
      const ax = rx.x * cs + up.x * sn, ay = rx.y * cs + up.y * sn, az = rx.z * cs + up.z * sn, bx = up.x * cs - rx.x * sn, by = up.y * cs - rx.y * sn, bz = up.z * cs - rx.z * sn;
      const pos = flame ? gp : sp, col = flame ? gc : sc, v = (flame ? ng : ns) * 12, c = (flame ? ng : ns) * 16;
      pos[v] = wx - ax - bx; pos[v + 1] = wy - ay - by; pos[v + 2] = wz - az - bz; pos[v + 3] = wx + ax - bx; pos[v + 4] = wy + ay - by; pos[v + 5] = wz + az - bz;
      pos[v + 6] = wx + ax + bx; pos[v + 7] = wy + ay + by; pos[v + 8] = wz + az + bz; pos[v + 9] = wx - ax + bx; pos[v + 10] = wy - ay + by; pos[v + 11] = wz - az + bz;
      for (let q = 0; q < 16; q += 4) { col[c + q] = r; col[c + q + 1] = g; col[c + q + 2] = b; col[c + q + 3] = a; }
      if (flame) ng++; else ns++;
    }
    for (const [m, n] of [[this.soft, ns], [this.glow, ng]]) {
      const g = m.geometry; g.setDrawRange(0, n * 6); m.visible = n > 0 && G.draws;
      for (const [at, per] of [[g.attributes.position, 12], [g.attributes.color, 16]]) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(per, n * per)); at.needsUpdate = true; }
    }
    this.shown = ns + ng;
  }
  clear() { this.n = 0; this.soft.visible = this.glow.visible = false; this.soft.geometry.setDrawRange(0, 0); this.glow.geometry.setDrawRange(0, 0); }
  dispose() { for (const m of [this.soft, this.glow]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } }
}

/**
 * Smoke and fire in a box of your world. box: [x0, y0, z0, x1, y1, z1], where the gas can go: a floor, and
 * open air on every other side (smoke that leaves is gone); open: false: walls and a ceiling too (a room that
 * fills with smoke). kind: 'smoke', 'fire', 'steam', 'dust', 'toxic' or 'magic' (gs.gas.KINDS), and any of a
 * kind's numbers and colours as your own (colour, colour2, flame, lift, weight, fade, cool, thick, soot, burn,
 * curl, glow). wind: { x, y, z } in units a second (change gas.wind any time). cells: fewer cells than the
 * phone would run by itself (Gas.max() is its number). size: how big the smaller version's puffs are drawn
 * (1). lamp: true (or { strength, distance }): a light that follows the fire and flickers with it. draw:
 * false: nothing is drawn (ask it questions and draw your own). seed: a number for its dice.
 */
export class Gas {
  /** The most cells this phone runs well (on the graphics chip where it can). */
  static max() { return budget(!!webgpu()).cells; }
  constructor(view, o = {}) {
    const kind = { ...BASE, ...KINDS.smoke, ...(KINDS[o.kind] || {}), ...o };
    this.view = view; this.bounds = (o.box || [-3, 0, -3, 3, 5, 3]).slice(); this.open = o.open !== false;
    this.closed = this.open ? [0, 0, 1, 0, 0, 0] : [1, 1, 1, 1, 1, 1];
    for (const k of ['lift', 'weight', 'fade', 'cool', 'soot', 'burn', 'curl']) this[k] = +kind[k] || 0;
    this.look = { colour: new Color(kind.colour), colour2: new Color(kind.colour2), flame: kind.flame.map(c => new Color(c)), thick: kind.thick, glow: kind.glow, sun: 1, sky: 1 };
    const w = o.wind || {}; this.wind = { x: w.x || 0, y: w.y || 0, z: w.z || 0 };
    this.size = o.size || 1; this.draws = o.draw !== false; this.seed = (o.seed ?? 1) >>> 0; this.rnd = dice(this.seed);
    this.solids = []; this.packed = []; this.makers = []; this.queue = []; this.groundFn = null; this.solidFn = null; this.marks = true;
    this.src = { n: 0, rows: Array.from({ length: SOURCES }, () => ({ x: 0, y: 0, z: 0, r: 1, smoke: 0, heat: 0, fuel: 0, tint: 0, vx: 0, vy: 0, vz: 0, grip: 0, div: 0, gain: 0 })) };
    // sized for the graphics chip when the view will draw there (hd3d.js runs a view's sims: gpuStep)
    this.gpuOk = o.gpu !== false; this.want = o.cells || Infinity;
    this.big = this.wantGpu() && typeof webgpu().fx.gpuGas === 'function';
    const b = budget(this.big);
    this.sim = new Sim(this, Math.min(this.want, b.cells), b.rate, this.big); this.iters = b.jacobi; this.steps = b.march;
    this.mode = this.big ? 'wait' : 'cpu'; this.waited = 0; this.pending = 0; this.acc = 0; this.t = 0; this.twin = null; this.field = null; this.fresh = true;
    this.load = 0; this.jacobi = b.jacobi; this.march = b.march;   // (load: 0 the chip has room .. 1 it is over the game's frame: see JACOBI_LOW)
    this.puffs = new Puffs(this, b.puffs);
    this.glowAt = { x: 0, y: 0, z: 0, power: 0, stamp: -1 };
    if (view) { (view.sims ||= []).push(this); const sc = view.scene || view; sc.add?.(this.puffs.soft); sc.add?.(this.puffs.glow); }
    if (o.lamp) { const l = o.lamp === true ? {} : o.lamp; this.lamp = new PointLight(this.look.flame[1], 0, l.distance ?? 10, 1.6); this.lampK = l.strength ?? 1; (view?.scene || view)?.add?.(this.lamp); }
    own(this);   // what it holds on the graphics chip is freed when the card leaves the feed (src/kit/cleanup.js)
  }
  free() { this.dispose(); }
  /** 'gpu' when the gas runs on the graphics chip, else 'cpu'. */
  get backend() { return this.mode === 'cpu' ? 'cpu' : 'gpu'; }
  /** How many cells the gas has, and how wide one is (world units). */
  get cells() { return this.sim.cells; }
  get cell() { return this.sim.h; }

  /* ----- putting gas in ----- */
  maker(m) { m.remove = () => { const i = this.makers.indexOf(m); if (i >= 0) this.makers.splice(i, 1); }; m.ph = [this.rnd() * 6.28, this.rnd() * 6.28, this.rnd() * 6.28, this.rnd() * 6.28]; this.makers.push(m); return m; }
  /**
   * A fire that keeps burning at x, y, z: size (how wide its base is, 1), power (how fierce, 1), and dir and
   * speed if it is blown (a torch, a jet). Returns it: change its x, y, z, size, power and on any time;
   * fire.remove() takes it away.
   */
  fire(o = {}) { return this.maker({ kind: 'fire', x: 0, y: 0, z: 0, size: 1, power: 1, dir: [0, 1, 0], speed: null, tint: 0, on: true, ...o }); }
  /**
   * Smoke that keeps coming from x, y, z: size (how wide, 1), rate (how much, 1), heat (how warm it is, 0..1: 0
   * hangs where it is, .5 drifts up, 1 climbs fast), dir and speed (it leaves upwards at .6 units a second),
   * tint (0..1 towards the gas's second colour). Returns it, as fire() does.
   */
  smoke(o = {}) { return this.maker({ kind: 'smoke', x: 0, y: 0, z: 0, size: 1, rate: 1, heat: .5, dir: [0, 1, 0], speed: .6, tint: 0, on: true, ...o }); }
  /** A fan (or someone blowing): the gas in a ball `size` wide at x, y, z is pushed along dir at speed. Returns it, as fire() does. */
  fan(o = {}) { return this.maker({ kind: 'fan', x: 0, y: 0, z: 0, size: 1, dir: [1, 0, 0], speed: 3, on: true, ...o }); }
  /**
   * An explosion at x, y, z, `size` units wide: fire (how much of it burns, 1; 0 for none), smoke (how much
   * smoke it throws, .6), force (how hard it blasts the gas outwards, 1), tint. With no fire and no force it
   * is a puff (see puff()).
   */
  burst(x, y, z, { size = 1, fire = 1, smoke = .6, force = 1, tint = 0, heat = null } = {}) { this.queue.push({ x, y, z, size, fire, smoke, force, tint, heat }); return this; }
  /** A cloud of smoke at x, y, z all at once (dust kicked up, a smoke bomb): size, amount (1), heat (0: it hangs), tint. */
  puff(x, y, z, { size = 1, amount = 1, heat = 0, tint = 0 } = {}) { return this.burst(x, y, z, { size, fire: 0, smoke: amount, force: 0, tint, heat }); }
  /** Takes all the smoke, heat and movement away (fires and smoke makers stay). */
  clear() { this.sim.clear(); this.queue.length = 0; this.pending = 0; this.acc = 0; this.t = 0; this.fresh = true; this.puffs.clear(); if (this.field) { this.field.S.fill(0); this.field.U.fill(0); } this.glowAt.stamp = -1; if (this.lamp) this.lamp.intensity = 0; return this; }

  /* ----- solid things and the world ----- */
  // (SOLIDS moving solid things at most: more are left out)
  solid_(T, o) { const s = new Solid(this, T, o); if (this.solids.length < SOLIDS) { this.solids.push(s); this.marks = true; } return s; }
  /** A solid ball the gas goes round: { x, y, z, r }. follow: a three.js object, or a World3D body, it keeps to. */
  ball(o = {}) { return this.solid_(0, o); }
  /** A solid box: { x, y, z, w, h, d, turn (a Quaternion) }. */
  box(o = {}) { return this.solid_(1, o); }
  /** A solid post standing on its end: { x, y, z, r, h, turn }. */
  tube(o = {}) { return this.solid_(2, o); }
  /** The ground under the gas: a function (x, z) => y. Call it again when the ground changes; null takes it away. */
  ground(fn) { this.groundFn = fn || null; this.sim.shape(); return this; }
  /** The still parts of your world: a function (x, y, z) => true where it is solid (walls, a doorway's frame, a chimney). Call it again when the world changes. */
  solid(fn) { this.solidFn = fn || null; this.sim.shape(); return this; }

  /* ----- each frame ----- */
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    const S = this.sim;
    let moved = false; for (const s of this.solids) if (s.moved(dt)) moved = true;
    if (moved || this.marks) { this.packed.length = this.solids.length; for (let i = 0; i < this.solids.length; i++) this.packed[i] = this.solids[i].pack(S); this.marks = true; }
    this.acc = Math.min(this.acc + dt, S.dt * 2.5);
    const n = Math.floor(this.acc / S.dt); this.acc -= n * S.dt;
    if (this.mode === 'cpu') {
      for (let i = 0; i < n; i++) { S.step(this.sources(i === 0), this.iters); this.t += S.dt; if (this.draws) this.puffs.step(S); }
      GAS.backend = 'cpu'; GAS.cells = S.cells;
      if (this.draws) this.puffs.draw(S, this.light());
      this.lampStep(dt);
      return this;
    }
    this.pending = Math.min(this.pending + n, 4);
    // sized for the graphics chip, but the view never drew there: the smaller version takes over
    if (this.mode === 'wait' && ++this.waited > 30) this.toCpu();
    this.lampStep(dt);
    return this;
  }
  /**
   * This step's sources, in cells and steps (the graphics chip reads the same rows): the fires, smoke makers
   * and fans that are on, then (first: the first step of a frame) the bursts that were asked for.
   */
  sources(first = true) {
    const S = this.sim, h = S.h, dt = S.dt, kv = dt / h, rows = this.src.rows, t = this.t, rnd = this.rnd; let n = 0;
    // a row: a ball (never under 1.3 cells) the gas is topped up in, towards the row's smoke, heat and fuel, at the row's gain a step
    const row = (x, y, z, rWorld, gain = 1 - Math.exp(-40 * dt)) => { const s = rows[n++], r = rWorld / h; s.x = (x - S.ox) / h; s.y = (y - S.oy) / h; s.z = (z - S.oz) / h; s.r = Math.max(r, 1.3); s.gain = gain; s.smoke = s.heat = s.fuel = s.tint = s.vx = s.vy = s.vz = s.grip = s.div = 0; return s; };
    const aim = (s, d, sp, grip) => { const dl = Math.hypot(d[0], d[1], d[2]) || 1; s.vx = d[0] / dl * sp * kv; s.vy = d[1] / dl * sp * kv; s.vz = d[2] / dl * sp * kv; s.grip = grip; };
    for (const m of this.makers) {
      if (!m.on || n >= SOURCES) continue;
      const p = m.ph, rw = m.size * (m.kind === 'fan' ? .5 : .35);
      if (m.kind === 'fire') {
        // a fire wanders a little over its base and flickers; a source smaller than its ball holds less fuel (by this much, a
        // small blown flame is about as much fire in a coarse grid as in a fine one: measured)
        const s = row(m.x + Math.sin(t * 7.3 + p[0]) * rw * .3, m.y, m.z + Math.cos(t * 5.9 + p[1]) * rw * .3, rw), k = Math.min(1, rw / h / s.r) ** 1.5 * m.power * (1 + .25 * Math.sin(t * 11 + p[2]) + .15 * Math.sin(t * 23 + p[3]));
        s.fuel = Math.min(FUEL_MAX, 1.3 * k); s.heat = Math.min(1, Math.max(.6, k)); s.tint = m.tint; aim(s, m.dir, m.speed ?? 1.2 * Math.sqrt(m.size), m.speed == null ? .25 : .6);
      } else if (m.kind === 'smoke') {
        const s = row(m.x + Math.sin(t * 3.1 + p[0]) * rw * .2, m.y, m.z + Math.cos(t * 2.3 + p[1]) * rw * .2, rw), k = Math.min(1, rw / h / s.r) ** 2;
        s.smoke = Math.min(SMOKE_MAX, 1.6 * m.rate * k); s.heat = Math.min(1, Math.max(0, m.heat)) * WARM; s.tint = m.tint; aim(s, m.dir, m.speed, .3);
      } else aim(row(m.x, m.y, m.z, rw), m.dir, m.speed, .6);
    }
    if (first) while (this.queue.length && n < SOURCES) {
      // a burst is all there in one step: its smoke and fuel in a ball, already alight, and the flow told to spread from it;
      // three lumps on it (where the dice put them) so no two are alike and none is a perfect ball
      const b = this.queue.shift(), R = b.size * .5, s = row(b.x, b.y, b.z, R, 1), k = Math.min(1, R / h / s.r) ** 2, hot = b.fire > 0 ? Math.min(HEAT_MAX, 1.1 + .4 * b.fire) : Math.min(1, Math.max(0, b.heat ?? 0)) * WARM;
      s.smoke = Math.min(SMOKE_MAX, 1.6 * b.smoke * k); s.fuel = Math.min(FUEL_MAX, 1.5 * b.fire * k); s.heat = hot; s.tint = b.tint;
      s.div = b.force * 7.5 * 6 * kv / s.r * k;   // (the gas leaves the ball at about 6 units a second for a force of 1)
      for (let q = 0; q < 3 && n < SOURCES; q++) {
        const a = rnd() * 6.2832, up = rnd() * 1.4 - .4, c = Math.sqrt(1 - Math.min(1, up * up)), dx = Math.cos(a) * c, dz = Math.sin(a) * c, far = R * (.45 + rnd() * .3);
        const l = row(b.x + dx * far, b.y + up * far, b.z + dz * far, R * (.4 + rnd() * .25), 1), f = .7 + rnd() * .5;
        l.smoke = s.smoke * f; l.fuel = s.fuel * f; l.heat = hot; l.tint = b.tint; aim(l, [dx, up, dz], b.force * (2 + rnd() * 3), .7);
      }
    }
    this.src.n = n; return this.src;
  }
  // the light the gas is lit by: the view's sun and sky, as a lit matt thing would be (and which way the sun is, in cells)
  light() {
    const L = this.lightAt ||= { sun: new Color(), sky: new Color(), dir: new Vector3(0, 1, 0), gx: 0, gy: 1, gz: 0 }, v = this.view, s = v?.sun, k = 1 / Math.PI;
    if (s?.isDirectionalLight && s.visible !== false) { L.sun.copy(s.color).multiplyScalar(s.intensity * k * this.look.sun); L.dir.copy(s.position).sub(s.target.position).normalize(); if (!(L.dir.lengthSq() > .5)) L.dir.set(0, 1, 0); }
    else { L.sun.setRGB(0, 0, 0); L.dir.set(0, 1, 0); }
    const he = v?.hemi;
    // (the sky's light from all round, half way to grey: smoke under a blue sky is grey, not blue)
    if (he) { const c = he.color, g = (c.r + c.g + c.b) / 3, m = (he.intensity * k * 2.2 + (v.envI || 0) * .5) * this.look.sky; L.sky.setRGB((c.r + g) * .5 * m, (c.g + g) * .5 * m, (c.b + g) * .5 * m); } else L.sky.setRGB(.5, .5, .5).multiplyScalar(this.look.sky);
    L.gx = L.dir.x; L.gy = L.dir.y; L.gz = L.dir.z;
    return L;
  }
  lampStep(dt) {
    const l = this.lamp; if (!l) return;
    const g = this.glow, want = Math.min(14, Math.sqrt(g.power) * 4) * this.lampK * (.9 + .2 * Math.sin(this.t * 17) * Math.sin(this.t * 7.1));
    l.intensity += (want - l.intensity) * Math.min(1, dt * 12); l.color.copy(this.look.flame[1]);
    if (g.power > 0) { const k = Math.min(1, dt * 8); l.position.x += (g.x - l.position.x) * k; l.position.y += (g.y - l.position.y) * k; l.position.z += (g.z - l.position.z) * k; }
  }

  /* ----- questions ----- */
  // the field the answers come from: the grid itself, or the coarser copy last read back from the graphics chip
  get ans() { return this.mode === 'cpu' ? this.sim : this.field || (this.field = emptyField(this.sim)); }
  at(x, y, z) { const f = this.ans; return sample(f.S, f, (x - f.ox) / f.h, (y - f.oy) / f.h, (z - f.oz) / f.h, T4); }
  inBox(x, y, z) { const b = this.bounds; return x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5]; }
  /** How thick the smoke is at a place: 0 clear air, about 1 thick smoke. */
  smokeAt(x, y, z) { return this.inBox(x, y, z) ? this.at(x, y, z)[0] : 0; }
  /** How hot the gas is at a place: 0 cool, up to .4 warm smoke, over .45 flame, 1 and more the heart of a fire. */
  heatAt(x, y, z) { return this.inBox(x, y, z) ? this.at(x, y, z)[1] : 0; }
  /** Which way and how fast the gas moves at a place (units a second), into out ({ x, y, z }). */
  flowAt(x, y, z, out = {}) {
    const f = this.ans; if (!this.inBox(x, y, z)) { out.x = out.y = out.z = 0; return out; }
    sample(f.U, f, (x - f.ox) / f.h, (y - f.oy) / f.h, (z - f.oz) / f.h, T4); out.x = T4[0] * f.kv; out.y = T4[1] * f.kv; out.z = T4[2] * f.kv; return out;
  }
  /** How much can be seen through the smoke from one point to another: 1 clear, 0 nothing. */
  sees(ax, ay, az, bx, by, bz) {
    const f = this.ans, len = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(1, Math.min(96, Math.ceil(len / (f.h * .7)))); let sum = 0;
    for (let i = 0; i < n; i++) { const t = (i + .5) / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t; if (this.inBox(x, y, z)) sum += sample(f.S, f, (x - f.ox) / f.h, (y - f.oy) / f.h, (z - f.oz) / f.h, T4)[0]; }
    return Math.exp(-sum * len / n * this.look.thick);
  }
  /** How smoky a box of the world is, [x0, y0, z0, x1, y1, z1] (the whole gas if you don't say): the smoke in it, evened out over it. */
  smokeIn(b = this.bounds) {
    const f = this.ans, lo = (v, o, n) => clamp(Math.floor((v - o) / f.h), 0, n - 1), i0 = lo(b[0], f.ox, f.nx), i1 = lo(b[3], f.ox, f.nx), j0 = lo(b[1], f.oy, f.ny), j1 = lo(b[4], f.oy, f.ny), k0 = lo(b[2], f.oz, f.nz), k1 = lo(b[5], f.oz, f.nz);
    let sum = 0; for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) sum += f.S[((k * f.ny + j) * f.nx + i) * 4];
    return sum / ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1));
  }
  /** Where the gas's fire is and how much of it there is: { x, y, z, power } (power 0: nothing burning). For a light of your own. */
  get glow() {
    const f = this.ans, g = this.glowAt; if (g.stamp === f.stamp) return g;
    let sx = 0, sy = 0, sz = 0, sw = 0; const A = f.S, { nx, ny } = f;
    // (the graphics chip's coarse copy keeps how much of each of its cells is flame: gas-gpu.js)
    const own = f === this.sim, F = f.U;
    for (let c = 0, n = nx * ny * f.nz; c < n; c++) { const w = own ? A[c * 4 + 1] - FLAME : F[c * 4 + 3]; if (w <= 0) continue; sx += (c % nx + .5) * w; sy += (((c / nx) | 0) % ny + .5) * w; sz += (((c / (nx * ny)) | 0) + .5) * w; sw += w; }
    g.stamp = f.stamp; g.power = sw * f.h * f.h * f.h * 8;
    if (sw > 0) { g.x = f.ox + sx / sw * f.h; g.y = f.oy + sy / sw * f.h; g.z = f.oz + sz / sw * f.h; }
    return g;
  }

  /* ----- the graphics chip takes over (hd3d.js gpuSwap calls this every frame the view draws) ----- */
  // chip: the graphics chip's time for the last frames (ms, null where it is not told); budget: the game's frame (ms)
  gpuStep(G, chip = null, budget = 0) {
    if (G && (!G.fx.gpuGas || !this.wantGpu())) G = null;
    if (G) {
      if (this.mode === 'cpu') this.resize(true);
      if (this.twin?.r !== G.r || this.twin.sim !== this.sim) { this.twin?.dispose(); this.twin = { r: G.r, sim: this.sim, ...G.fx.gpuGas(this) }; this.fresh = true; }
      this.mode = 'gpu'; this.puffs.clear();
      this.twin.show(this.draws);
      // less work while the chip is over the frame (JACOBI_LOW), eased in a few frames and out over a second or so
      // (not while a test holds the gas against its JavaScript twin, GAS.twin: the two must take the same steps)
      const over = chip > 0 && budget > 0 && !GAS.twin ? chip / budget : 0;
      if (over > 1.05) this.load = Math.min(1, this.load + .1); else if (over < .85) this.load = Math.max(0, this.load - .02);
      this.iters = 2 * Math.round((this.jacobi - (this.jacobi - JACOBI_LOW) * this.load) / 2);
      this.steps = Math.round(this.march * (1 - (1 - MARCH_LOW) * this.load));
      this.twin.step(G.r, over > 1 ? Math.min(1, this.pending) : this.pending); this.pending = 0;
    } else if (this.mode !== 'cpu') this.toCpu();
  }
  // (an AR view has no chain of screen passes for the volume to be drawn in: the smaller version there)
  wantGpu() { const v = this.view; return !!webgpu() && this.gpuOk && typeof v?.envFor === 'function' && !v.clearBg; }
  toCpu() { this.twin?.dispose(); this.twin = null; this.resize(false); }
  // the same gas at another size: the new grid takes what the old one (or its coarse copy) had there
  resize(big) {
    const old = this.ans, had = old.steps > 0 || old.stamp > 0, b = budget(big); this.big = big; this.iters = this.jacobi = b.jacobi; this.steps = this.march = b.march;
    const S = this.sim = new Sim(this, Math.min(this.want, b.cells), b.rate, big);
    if (had && big) { S.S = new Float32Array(S.cells * 4); S.U = new Float32Array(S.cells * 4); }   // (sent up to the graphics chip, then let go: gas-gpu.js)
    if (had && old.S) for (let k = 0, c = 0; k < S.nz; k++) for (let j = 0; j < S.ny; j++) for (let i = 0; i < S.nx; i++, c++) {
      const x = (S.ox + (i + .5) * S.h - old.ox) / old.h, y = (S.oy + (j + .5) * S.h - old.oy) / old.h, z = (S.oz + (k + .5) * S.h - old.oz) / old.h, a = c * 4;
      sample(old.S, old, x, y, z, T4); S.S[a] = T4[0]; S.S[a + 1] = T4[1]; S.S[a + 2] = T4[2]; S.S[a + 3] = T4[3];
      sample(old.U, old, x, y, z, T4); const kq = old.kv / S.kv; S.U[a] = T4[0] * kq; S.U[a + 1] = T4[1] * kq; S.U[a + 2] = T4[2] * kq;
    }
    S.steps = old.steps || 0; S.stamp = (old.stamp || 0) + 1;
    this.mode = big ? 'gpu' : 'cpu'; this.pending = 0; this.acc = 0; this.field = null; this.marks = true; this.fresh = true;
    this.packed.length = this.solids.length; for (let i = 0; i < this.solids.length; i++) this.packed[i] = this.solids[i].pack(S);
    if (!big) this.puffs.clear();
  }
  // the gas copied back from the graphics chip, four cells to one (gas-gpu.js), for the questions
  read(field) { if (this.mode !== 'gpu') return; field.stamp = (this.field?.stamp || 0) + 1; this.field = field; }
  /** Takes the gas out of the view and frees what it holds. */
  dispose() {
    this.puffs.dispose(); this.twin?.dispose(); this.twin = null; this.lamp?.removeFromParent();
    const s = this.view?.sims, i = s ? s.indexOf(this) : -1; if (i >= 0) s.splice(i, 1);
  }
}
// a field with nothing in it yet (the graphics chip hasn't answered): four cells of the grid to one
function emptyField(S) {
  const nx = Math.ceil(S.nx / 4), ny = Math.ceil(S.ny / 4), nz = Math.ceil(S.nz / 4), n = nx * ny * nz;
  return { nx, ny, nz, h: S.h * 4, ox: S.ox, oy: S.oy, oz: S.oz, kv: S.kv, S: new Float32Array(n * 4), U: new Float32Array(n * 4), steps: 0, stamp: 0 };
}
export { emptyField, sample };

// per-frame work, timed while the frame lab is open (prof.js)
timed(Gas.prototype, 'update', 'smoke and fire');
