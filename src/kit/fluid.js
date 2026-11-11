// Real 3D liquids (gs.fluid): a particle fluid you can pour, splash and fill things with. Drops fall,
// pile up, slosh, run round solid things and settle level, in a box of your world. On phones with
// WebGPU the whole fluid runs on the graphics chip (tens of thousands of drops; src/kit/fluid-gpu.js);
// everywhere else the same maths runs here with fewer, bigger drops. The method is MLS-MPM (Hu et al.
// 2018): drops carry the liquid, a grid of cells works out how it pushes, and nothing ever searches for
// a drop's neighbours, which is what makes it this fast.
//
//   const { Fluid } = gs.fluid;
//   function setup() {                                                                      // once, with the scene
//     fluid = new Fluid(view, { box: [-2, 0, -2, 2, 3, 2], volume: 4, kind: 'water' });   // a 4 x 3 x 4 room for 4 cubic units of water
//     tap = fluid.pour({ x: 0, y: 2.5, z: 0, rate: .6, speed: 2 });                         // a stream straight down
//     cup = fluid.tube({ x: 1, y: .4, z: 0, r: .4, h: .8, hollow: .05 });                   // an open cup the water fills
//     ball = fluid.ball({ r: .3 });                                                         // a solid ball to push the water about
//   }
//   reset() { fluid.clear(); fluid.fill({ y1: .3 }); }                                      // each round: empty it, and start with the floor wet
//   update(dt) { tap.on = pressed; ball.set(px, py, pz); fluid.update(dt);
//                if (fluid.amount(cup.inside()) > .25) api.win(); }
//
// Everything is in your world's units: places, sizes, speeds (units a second) and amounts (units cubed).
// The kit picks how many drops the phone can run (fluid.max) and sizes them so `volume` fits; when the
// fluid is full (fluid.full) taps stop until some drains away. Questions are answered from the drops:
// amount(box), level(x, z), wet(x, y, z). On WebGPU the answers are a few frames old.
// Kit use: view is an HDView (Next Gen, AR, Board); in a Console view it runs the smaller version.
import { Color, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Quaternion, Matrix4, Vector3, DynamicDrawUsage } from 'three';
import { webgpu, sendUsed } from './gpu.js';
import { phoneClass } from './speed.js';
import { own } from './cleanup.js';

// The fluid works in cells and steps: a place is counted in cells from the grid's corner, a speed in
// cells a step. RHO drops fill a cell at rest; K is how hard squeezed liquid pushes back (as stiff as a
// step allows: sound crosses about .6 of a cell a step); G0 is gravity in cells a step squared, which
// fixes the length of a step for a cell's size; VMAX is the fastest a drop may go.
export const RHO = 4, K = .4, G0 = .012, VMAX = 1, LO = 3, WALL = 2, SOLIDS = 8, SINKS = 4, PUSHES = 4;
const BUDGET = { gpu: { top: 40000, mid: 20000, low: 10000 }, cpu: { top: 2000, mid: 1200, low: 600 } };
const SUBSTEPS = { gpu: { top: 4, mid: 3, low: 2 }, cpu: { top: 2, mid: 2, low: 2 } };
const SPACING = Math.cbrt(1 / RHO);   // between drops at rest, in cells
/** The room a drop's drag works over, for how much liquid is round it (rho, drops a cell): a drop's own room in full liquid, less where it is thin. */
export const thin = rho => Math.min(1 / rho, rho / (RHO * RHO));
export const IN = .02;   // a drop's middle is kept this far inside the walls and outside solid things
// A drop is drawn RAD wide (cells, its radius) and rests about .3 of a cell from where the liquid ends, so
// the liquid ends SKIN short of every wall and solid thing: the drops then touch them and don't poke through.
// REACH: a drop this near a solid thing has a twin in the mirror (the reach of a drop's weights).
export const RAD = .55, SKIN = .25, REACH = 1.5;
// A drop works out how squeezed it is from the liquid in the cells round it. Next to a wall or a solid
// thing some of that room has no liquid in it, so the drop reads too low and the liquid packs down
// against it (a thin layer lost a third of its depth, and drops piled up on the walls).
// The box's walls are mirrors: what the drops give the cells beyond a wall is handed back to the cells
// this side of it, turned round, as if the same liquid lay beyond the wall and leaned back. The liquid
// then feels a wall exactly as it feels more of itself, and never moves through it.
// Solid things and the ground aren't on the grid's lines (they're round, or turned), so there each drop
// near one has a twin, as far inside the thing as the drop is outside, moving as the drop's reflection:
// the twin gives the grid its weight and its push like a real drop, and then goes. On a flat face that
// is the same mirror; on a curve it is close.

/** Ready-made liquids: colour, foam (the colour of spray and fast water), thick (0 water .. 1 honey), rough, glow. */
export const KINDS = {
  water: { colour: '#2a7fd4', foam: '#c4dcf0', thick: 0, rough: .08, glow: 0 },
  lava: { colour: '#ff5a14', foam: '#ffd76a', thick: .7, rough: .6, glow: .6 },
  slime: { colour: '#5ecb3a', foam: '#b4e68c', thick: .45, rough: .25, glow: 0 },
  honey: { colour: '#e39a1c', foam: '#f2c873', thick: 1, rough: .15, glow: 0 },
};
/** How thick a liquid is, as the fluid counts it (thick 0..1), and how much it resists being squeezed fast for that thickness. */
// (twice the first plus the second has to stay under about 2.3, or a step overshoots and the liquid blows up)
export const viscosity = thick => .08 + Math.max(0, Math.min(1, thick)) * .52;
export const bulk = mu => Math.min(1, 1.9 - 2 * mu);

/* ---------- solid shapes: how far a point is from one, and which way is out ---------- */
// sdf() leaves its answer here: the distance (negative inside) and the way out
let sd = 0, snx = 0, sny = 0, snz = 0;
// Sim.near() leaves its answer here: how far the nearest solid's skin is, the way out, and how fast that spot moves
let bd = 0, bnx = 0, bny = 0, bnz = 0, bux = 0, buy = 0, buz = 0;
const twinV = [0, 0, 0];
// T: 0 a ball (ax its radius), 1 a box (ax, ay, az half its sides), 2 a tube standing on y (ax its radius, ay half its height)
function sdf(T, px, py, pz, ax, ay, az) {
  if (T === 0) { const l = Math.hypot(px, py, pz) || 1e-9; sd = l - ax; snx = px / l; sny = py / l; snz = pz / l; return; }
  if (T === 1) {
    const qx = Math.abs(px) - ax, qy = Math.abs(py) - ay, qz = Math.abs(pz) - az;
    snx = sny = snz = 0;
    if (qx <= 0 && qy <= 0 && qz <= 0) {
      if (qx >= qy && qx >= qz) { sd = qx; snx = px < 0 ? -1 : 1; } else if (qy >= qz) { sd = qy; sny = py < 0 ? -1 : 1; } else { sd = qz; snz = pz < 0 ? -1 : 1; }
    } else {
      const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0, l = Math.hypot(mx, my, mz);
      sd = l; snx = (px < 0 ? -mx : mx) / l; sny = (py < 0 ? -my : my) / l; snz = (pz < 0 ? -mz : mz) / l;
    }
    return;
  }
  const lr = Math.hypot(px, pz) || 1e-9, qr = lr - ax, qy = Math.abs(py) - ay;
  if (qr <= 0 && qy <= 0) {
    if (qr >= qy) { sd = qr; snx = px / lr; sny = 0; snz = pz / lr; } else { sd = qy; snx = 0; sny = py < 0 ? -1 : 1; snz = 0; }
  } else {
    const mr = qr > 0 ? qr : 0, my = qy > 0 ? qy : 0, l = Math.hypot(mr, my);
    sd = l; snx = px / lr * mr / l; sny = (py < 0 ? -my : my) / l; snz = pz / lr * mr / l;
  }
}
// a packed solid (Solid.pack) at a point, all in cells: sd and the way out in world axes. A hollow one
// is its outside with the room inside it taken away (and, for an open one, the way in at the top)
function solidAt(s, x, y, z) {
  const dx = x - s.cx, dy = y - s.cy, dz = z - s.cz, m = s.m;
  const px = m[0] * dx + m[1] * dy + m[2] * dz, py = m[3] * dx + m[4] * dy + m[5] * dz, pz = m[6] * dx + m[7] * dy + m[8] * dz;
  sdf(s.T, px, py, pz, s.ax, s.ay, s.az);
  if (s.hol) {
    const d1 = sd, ax = snx, ay = sny, az = snz;
    sdf(s.T, px, py - s.io, pz, s.ix, s.iy, s.iz);
    if (s.cut - py < sd) { sd = s.cut - py; snx = 0; sny = -1; snz = 0; }   // (an open one: all that is above its rim is room too)
    if (-sd > d1) { sd = -sd; snx = -snx; sny = -sny; snz = -snz; } else { sd = d1; snx = ax; sny = ay; snz = az; }
  }
  const lx = snx, ly = sny, lz = snz;
  snx = m[0] * lx + m[3] * ly + m[6] * lz; sny = m[1] * lx + m[4] * ly + m[7] * lz; snz = m[2] * lx + m[5] * ly + m[8] * lz;
}
// how far inside a hollow solid's room a point is (negative inside), and its height in the solid's own axes (in snx)
function roomAt(s, x, y, z) {
  const dx = x - s.cx, dy = y - s.cy, dz = z - s.cz, m = s.m;
  const px = m[0] * dx + m[1] * dy + m[2] * dz, py = m[3] * dx + m[4] * dy + m[5] * dz, pz = m[6] * dx + m[7] * dy + m[8] * dz;
  sdf(s.T, px, py - s.io, pz, s.ix, s.iy, s.iz); if (py > s.top) sd = Math.max(sd, py - s.top);
  snx = py;
}

const _q = new Quaternion(), _m = new Matrix4(), _v3 = new Vector3(), _s3 = new Vector3();
/** A solid thing in the liquid (fluid.ball, fluid.box, fluid.tube). Move it with set(); the liquid feels how fast it goes. */
class Solid {
  constructor(fluid, T, o) {
    this.fluid = fluid; this.T = T; this.x = o.x || 0; this.y = o.y || 0; this.z = o.z || 0; this.q = new Quaternion();
    if (o.turn) this.q.copy(o.turn);
    this.size = T === 0 ? [o.r ?? .5, 0, 0] : T === 1 ? [(o.w ?? 1) / 2, (o.h ?? 1) / 2, (o.d ?? 1) / 2] : [o.r ?? .5, (o.h ?? 1) / 2, 0];
    this.hollow = +o.hollow || 0; this.open = o.open ?? true; this.follow = o.follow || null;
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pq = this.q.clone(); this.v = [0, 0, 0]; this.w = [0, 0, 0];
    if (this.follow) this.track();
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pq.copy(this.q);
  }
  /** Puts it somewhere (and turns it: a three.js Quaternion). Call it each frame for a thing that moves. */
  set(x, y, z, turn = null) { this.x = x; this.y = y; this.z = z; if (turn) this.q.copy(turn); return this; }
  track() { const f = this.follow; f.updateWorldMatrix?.(true, false); _m.copy(f.matrixWorld).decompose(_v3, this.q, _s3); this.x = _v3.x; this.y = _v3.y; this.z = _v3.z; }
  // how it moved since the last update: its speed (units a second) and its spin (radians a second, round world axes)
  moved(dt) {
    if (this.follow) this.track();
    const k = dt > 1e-6 ? 1 / dt : 0;
    this.v[0] = (this.x - this.px) * k; this.v[1] = (this.y - this.py) * k; this.v[2] = (this.z - this.pz) * k;
    _q.copy(this.pq).invert().premultiply(this.q);   // the turn since last time
    const s = Math.hypot(_q.x, _q.y, _q.z), a = s > 1e-7 ? 2 * Math.atan2(s, _q.w) : 0, a2 = a > Math.PI ? a - 2 * Math.PI : a, f = s > 1e-7 ? a2 / s * k : 0;
    this.w[0] = _q.x * f; this.w[1] = _q.y * f; this.w[2] = _q.z * f;
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pq.copy(this.q);
  }
  // this solid in cells and steps, for a sim (and for the graphics chip: fluid-gpu.js reads the same fields)
  pack(S, out = this.packed ||= { m: new Float32Array(9) }) {
    const h = S.h, [a, b, c] = this.size, t = this.hollow / h, grow = this.hollow ? Math.max(0, WALL - t) : 0, T = this.T;
    out.T = T; out.cx = (this.x - S.ox) / h; out.cy = (this.y - S.oy) / h; out.cz = (this.z - S.oz) / h;
    out.ax = a / h + grow; out.ay = b / h + (T ? grow : 0); out.az = c / h + (T === 1 ? grow : 0);
    out.hol = this.hollow > 0; out.cut = 1e9; out.io = 0; out.ix = a / h - t; out.iy = b / h - t; out.iz = c / h - t; out.top = 1e9;
    if (out.hol) {
      if (T === 0) { out.top = out.cut = this.open ? a / h * .35 : 1e9; }
      else if (this.open) { out.iy = b / h - t / 2 + grow / 2 + 1; out.io = t / 2 + grow / 2 + 1; out.top = out.cut = b / h; }   // the room runs up out of the top, and nothing of the thing stands above its rim
    }
    // the turn that takes world axes to the solid's own (rows: its axes in the world)
    const q = this.q, x = q.x, y = q.y, z = q.z, w = q.w, m = out.m;
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
    m[3] = 2 * (x * y - z * w); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z + x * w);
    m[6] = 2 * (x * z + y * w); m[7] = 2 * (y * z - x * w); m[8] = 1 - 2 * (x * x + y * y);
    const kv = S.dt / h; out.vx = this.v[0] * kv; out.vy = this.v[1] * kv; out.vz = this.v[2] * kv;
    out.wx = this.w[0] * S.dt; out.wy = this.w[1] * S.dt; out.wz = this.w[2] * S.dt;
    out.R = Math.hypot(out.ax, out.ay, out.az) + 1.5;
    return out;
  }
  /** A box round the room inside a hollow solid, [x0, y0, z0, x1, y1, z1], for fluid.amount() (right while it stands upright). */
  inside() {
    const [a, b, c] = this.size, t = this.hollow, T = this.T, rx = a - t, rz = T === 1 ? c - t : rx, lo = T === 0 ? -a + t : -b + t, hi = T === 0 ? (this.open ? a * .35 : a - t) : this.open ? b : b - t;
    return [this.x - rx, this.y + lo, this.z - rz, this.x + rx, this.y + hi, this.z + rz];
  }
  /** Fills a hollow solid's room with liquid at rest, up to this much of its height (0..1). Returns how much went in. */
  fill(part = 1) {
    const F = this.fluid, S = F.sim, s = this.pack(S), [a, b] = this.size, T = this.T, t = this.hollow / S.h;
    const lo = (T === 0 ? -a : -b) / S.h + t, hi = T === 0 ? (this.open ? a * .35 / S.h : a / S.h - t) : this.open ? b / S.h : b / S.h - t, top = lo + (hi - lo) * Math.max(0, Math.min(1, part));
    return F.lattice(s.cx - s.R, s.cy - s.R, s.cz - s.R, s.cx + s.R, s.cy + s.R, s.cz + s.R, (x, y, z) => { roomAt(s, x, y, z); return sd < -SKIN - .15 && snx <= top; });
  }
  remove() { const l = this.fluid.solids, i = l.indexOf(this); if (i >= 0) l.splice(i, 1); }
}

/* ---------- the fluid at one size: its grid and its drops ---------- */
class Sim {
  constructor(F, N) {
    const [x0, y0, z0, x1, y1, z1] = F.bounds, sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    let h = Math.min(Math.cbrt(F.volume / N * RHO), Math.min(sx, sy, sz) / 4);
    const most = F.big ? 1.5e6 : 2e5, cells = h => (Math.round(sx / h) + 6) * (Math.round(sy / h) + 6) * (Math.round(sz / h) + 6);
    while (cells(h) > most) h *= 1.06;
    // the walls stand on the lines between cells (they are mirrors: step()), SKIN inside the box's faces, so
    // the liquid's room is a whole number of cells each way: from the floor to the top exactly, the sides
    // within a quarter of a cell of the box's
    const fit = s => Math.max(4, Math.round(s / h - 2 * SKIN));
    h = sy / (fit(sy) + 2 * SKIN);
    const mx = fit(sx), my = fit(sy), mz = fit(sz);
    this.F = F; this.N = N; this.h = h; this.nx = mx + 2 * LO; this.ny = my + 2 * LO; this.nz = mz + 2 * LO;
    this.cells = this.nx * this.ny * this.nz;
    this.ox = x0 + (sx - mx * h) / 2 - LO * h; this.oy = y0 + SKIN * h - LO * h; this.oz = z0 + (sz - mz * h) / 2 - LO * h;
    this.lo = [LO, LO, LO]; this.hi = [LO + mx, LO + my, LO + mz];   // the walls, in cells
    const g = Math.hypot(F.gravity.x, F.gravity.y, F.gravity.z);
    this.dt = Math.min(1 / 60, Math.max(1 / (60 * F.substeps), g > 1e-6 ? Math.sqrt(G0 * h / g) : 1));   // one step, in seconds
    this.drop = h * h * h / RHO;   // how much liquid one drop is
    this.foam0 = g > 1e-6 ? .5 * Math.sqrt(g * sy) * this.dt / h : 1e9;   // fast enough to foam (cells a step): half the speed of a fall from the top of the box
    this.P = new Float32Array(N * 4); this.V = new Float32Array(N * 4); this.C = new Float32Array(N * 12); this.D = new Float32Array(N * 4);
    this.live = new Uint8Array(N); this.born = new Int32Array(N); this.free = new Int32Array(N); for (let i = 0; i < N; i++) this.free[i] = N - 1 - i;
    this.nfree = N; this.alive = 0; this.top = 0; this.steps = 0; this.stamp = 0;
    this.G = null; this.T = null; this.H = null; this.occ = null; this.occAt = -1;
    this.ground(F.groundFn);
  }
  // the ground's height under each column of cells (in cells), or null
  ground(fn) {
    if (!fn) { this.H = null; return; }
    const { nx, nz, h } = this, H = this.H = new Float32Array(nx * nz);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) H[k * nx + i] = (fn(this.ox + (i + .5) * h, this.oz + (k + .5) * h) - this.oy) / h;
  }
  // the ground at a place (cells): its height in sd's place... returns height, slope in snx, snz
  groundAt(x, z) {
    const { nx, nz, H } = this, fx = Math.min(nx - 1.001, Math.max(0, x - .5)), fz = Math.min(nz - 1.001, Math.max(0, z - .5)), i = fx | 0, k = fz | 0, u = fx - i, w = fz - k, a = k * nx + i;
    const h00 = H[a], h10 = H[a + 1], h01 = H[a + nx], h11 = H[a + nx + 1];
    snx = (h10 - h00) * (1 - w) + (h11 - h01) * w; snz = (h01 - h00) * (1 - u) + (h11 - h10) * u;
    return h00 * (1 - u) * (1 - w) + h10 * u * (1 - w) + h01 * (1 - u) * w + h11 * u * w;
  }
  /** A new drop (cells and cells a step). Returns its slot, or -1 when the fluid is full. */
  add(x, y, z, vx, vy, vz) {
    if (!this.nfree) return -1;
    const lo = this.lo, hi = this.hi;
    if (x < lo[0] + IN || x > hi[0] - IN || y < lo[1] + IN || y > hi[1] - IN || z < lo[2] + IN || z > hi[2] - IN) { if (this.F.open) return -1; x = Math.min(hi[0] - IN, Math.max(lo[0] + IN, x)); y = Math.min(hi[1] - IN, Math.max(lo[1] + IN, y)); z = Math.min(hi[2] - IN, Math.max(lo[2] + IN, z)); }
    const s = this.free[--this.nfree], a = s * 4, sp = Math.hypot(vx, vy, vz), k = sp > VMAX ? VMAX / sp : 1;
    this.P[a] = x; this.P[a + 1] = y; this.P[a + 2] = z; this.P[a + 3] = 1;
    this.V[a] = vx * k; this.V[a + 1] = vy * k; this.V[a + 2] = vz * k; this.V[a + 3] = 0;
    this.C.fill(0, s * 12, s * 12 + 12); this.D[a] = this.D[a + 1] = this.D[a + 2] = 0; this.D[a + 3] = 1;
    this.live[s] = 1; this.born[s] = this.steps; this.alive++; if (s >= this.top) this.top = s + 1;
    return s;
  }
  kill(s) { if (!this.live[s]) return; this.live[s] = 0; this.P[s * 4 + 3] = 0; this.free[this.nfree++] = s; this.alive--; }
  clear() { const N = this.N; this.live.fill(0); for (let i = 0; i < N; i++) { this.free[i] = N - 1 - i; this.P[i * 4 + 3] = 0; } this.nfree = N; this.alive = 0; this.top = 0; this.stamp++; }

  // the cell this side of the walls that mirrors cell i (i itself when it is inside); this.flip: which of x, y, z turned round (bits 1, 2, 4)
  mirror(i) {
    const { nx, ny, hi } = this, c = i >> 2, ix = c % nx, iy = ((c / nx) | 0) % ny, iz = (c / (nx * ny)) | 0;
    const jx = ix < LO ? 2 * LO - 1 - ix : ix >= hi[0] ? 2 * hi[0] - 1 - ix : ix, jy = iy < LO ? 2 * LO - 1 - iy : iy >= hi[1] ? 2 * hi[1] - 1 - iy : iy, jz = iz < LO ? 2 * LO - 1 - iz : iz >= hi[2] ? 2 * hi[2] - 1 - iz : iz;
    this.flip = (jx !== ix ? 1 : 0) | (jy !== iy ? 2 : 0) | (jz !== iz ? 4 : 0);
    return ((jz * ny + jy) * nx + jx) * 4;
  }
  // hands what the cells beyond each wall hold to their mirror cells, an axis at a time (so corners come right); mass too, or only the pushes
  fold(nt, mass) {
    const { G, T, nx, ny, hi } = this, nxy = nx * ny;
    for (let ax = 0; ax < 3; ax++) {
      const st = ax === 0 ? 1 : ax === 1 ? nx : nxy, top = hi[ax], n0 = nt;
      for (let k = 0; k < n0; k++) {
        const i = T[k], c = i >> 2, q = ax === 0 ? c % nx : ax === 1 ? ((c / nx) | 0) % ny : (c / nxy) | 0;
        const j = q < LO ? 2 * LO - 1 - q : q >= top ? 2 * top - 1 - q : -1; if (j < 0) continue;
        const t = i + (j - q) * st * 4;
        if (mass) { if (G[t + 3] === 0) T[nt++] = t; G[t + 3] += G[i + 3]; }
        G[t] += ax === 0 ? -G[i] : G[i]; G[t + 1] += ax === 1 ? -G[i + 1] : G[i + 1]; G[t + 2] += ax === 2 ? -G[i + 2] : G[i + 2];
      }
    }
    return nt;
  }
  // the nearest solid thing or ground within REACH of a place: true if there is one, with how far its skin
  // is in bd, the way out of it in bnx, bny, bnz and how fast that spot of it moves in bux, buy, buz
  near(x, y, z) {
    const solids = this.F.packed; bd = REACH;
    for (let j = 0; j < solids.length; j++) {
      const s = solids[j], ex = x - s.cx, ey = y - s.cy, ez = z - s.cz; if (ex * ex + ey * ey + ez * ez > s.R * s.R) continue;
      solidAt(s, x, y, z); const d = sd - SKIN; if (d >= bd) continue;
      bd = d; bnx = snx; bny = sny; bnz = snz; bux = s.vx + s.wy * ez - s.wz * ey; buy = s.vy + s.wz * ex - s.wx * ez; buz = s.vz + s.wx * ey - s.wy * ex;
    }
    if (this.H) { const gh = this.groundAt(x, z), l = Math.hypot(snx, 1, snz), d = (y - gh) / l - SKIN; if (d < bd) { bd = d; bnx = -snx / l; bny = 1 / l; bnz = -snz / l; bux = buy = buz = 0; } }
    return bd < REACH;
  }
  /** One step, here on the CPU. */
  step() {
    const F = this.F, { nx, ny, P, V, C, D, lo, hi } = this, nxy = nx * ny, top = this.top;
    const G = this.G ||= new Float32Array(this.cells * 4), T = this.T ||= new Int32Array(this.cells), M = this.M ||= new Float32Array(this.N * 4);
    const mu = F.mu, zeta = bulk(mu), open = F.open, hx = hi[0], hy = hi[1], hz = hi[2], bounds = !!this.H || F.packed.length > 0;
    let nt = 0;
    // drops to grid: each drop's weight and push go to the 27 cells round it. A drop beside a solid thing or
    // the ground has a twin in the mirror, just inside it (M: where), which gives its cells the same, turned round
    for (let p = 0; p < top; p++) {
      const a = p * 4; if (P[a + 3] <= 0) continue;
      let x = P[a], y = P[a + 1], z = P[a + 2], vx = V[a], vy = V[a + 1], vz = V[a + 2];
      const c = p * 12;
      let c00 = C[c], c01 = C[c + 1], c02 = C[c + 2], c10 = C[c + 4], c11 = C[c + 5], c12 = C[c + 6], c20 = C[c + 8], c21 = C[c + 9], c22 = C[c + 10];
      let twin = 0;
      if (bounds && this.near(x, y, z)) {
        const d = bd > 0 ? bd : 0, rn = (vx - bux) * bnx + (vy - buy) * bny + (vz - buz) * bnz;
        M[a] = x - 2 * d * bnx; M[a + 1] = y - 2 * d * bny; M[a + 2] = z - 2 * d * bnz;
        twin = M[a] > 1.5 && M[a + 1] > 1.5 && M[a + 2] > 1.5 && M[a] < nx - 1.5 && M[a + 1] < ny - 1.5 && M[a + 2] < this.nz - 1.5 ? 1 : 0;
        twinV[0] = vx - 2 * rn * bnx; twinV[1] = vy - 2 * rn * bny; twinV[2] = vz - 2 * rn * bnz;
      }
      M[a + 3] = twin;
      for (let pass = 0; pass <= twin; pass++) {
        if (pass) { x = M[a]; y = M[a + 1]; z = M[a + 2]; vx = twinV[0]; vy = twinV[1]; vz = twinV[2]; c00 = c01 = c02 = c10 = c11 = c12 = c20 = c21 = c22 = 0; }
        const cx = x | 0, cy = y | 0, cz = z | 0, dx = x - cx - .5, dy = y - cy - .5, dz = z - cz - .5;
        const wx0 = .5 * (.5 - dx) * (.5 - dx), wx1 = .75 - dx * dx, wx2 = .5 * (.5 + dx) * (.5 + dx);
        const wy0 = .5 * (.5 - dy) * (.5 - dy), wy1 = .75 - dy * dy, wy2 = .5 * (.5 + dy) * (.5 + dy);
        const wz0 = .5 * (.5 - dz) * (.5 - dz), wz1 = .75 - dz * dz, wz2 = .5 * (.5 + dz) * (.5 + dz);
        for (let gz = 0; gz < 3; gz++) {
          const wz = gz === 0 ? wz0 : gz === 1 ? wz1 : wz2, rz = gz - 1 - dz, bz = (cz + gz - 1) * nxy;
          for (let gy = 0; gy < 3; gy++) {
            const wyz = wz * (gy === 0 ? wy0 : gy === 1 ? wy1 : wy2), ry = gy - 1 - dy, by = bz + (cy + gy - 1) * nx + cx - 1;
            for (let gx = 0; gx < 3; gx++) {
              const w = wyz * (gx === 0 ? wx0 : gx === 1 ? wx1 : wx2); if (w <= 0) continue;
              const rx = gx - 1 - dx, i = (by + gx) * 4;
              if (G[i + 3] === 0) T[nt++] = i;
              G[i] += w * (vx + c00 * rx + c01 * ry + c02 * rz); G[i + 1] += w * (vy + c10 * rx + c11 * ry + c12 * rz); G[i + 2] += w * (vz + c20 * rx + c21 * ry + c22 * rz); G[i + 3] += w;
            }
          }
        }
      }
    }
    // the walls as mirrors: what went to the cells beyond a wall comes back to the cells this side of it,
    // turned round; then each cell beyond a wall weighs what its mirror cell does (and pushes nothing yet)
    if (!open) {
      nt = this.fold(nt, true);
      for (let k = 0; k < nt; k++) {
        const i = T[k], t = this.mirror(i);
        if (t !== i) { G[i] = G[i + 1] = G[i + 2] = 0; G[i + 3] = G[t + 3]; }
      }
    }
    // how squeezed each drop is, and the push that gives its cells (and, for the look, which way the liquid's skin faces)
    for (let p = 0; p < top; p++) {
      const a = p * 4; if (P[a + 3] <= 0) continue;
      let x = P[a], y = P[a + 1], z = P[a + 2], cx = x | 0, cy = y | 0, cz = z | 0, dx = x - cx - .5, dy = y - cy - .5, dz = z - cz - .5;
      let wx0 = .5 * (.5 - dx) * (.5 - dx), wx1 = .75 - dx * dx, wx2 = .5 * (.5 + dx) * (.5 + dx);
      let wy0 = .5 * (.5 - dy) * (.5 - dy), wy1 = .75 - dy * dy, wy2 = .5 * (.5 + dy) * (.5 + dy);
      let wz0 = .5 * (.5 - dz) * (.5 - dz), wz1 = .75 - dz * dz, wz2 = .5 * (.5 + dz) * (.5 + dz);
      let rho = 0, gx_ = 0, gy_ = 0, gz_ = 0;
      for (let gz = 0; gz < 3; gz++) {
        const wz = gz === 0 ? wz0 : gz === 1 ? wz1 : wz2, ez = gz === 0 ? dz - .5 : gz === 1 ? -2 * dz : dz + .5, bz = (cz + gz - 1) * nxy;
        for (let gy = 0; gy < 3; gy++) {
          const wy = gy === 0 ? wy0 : gy === 1 ? wy1 : wy2, ey = gy === 0 ? dy - .5 : gy === 1 ? -2 * dy : dy + .5, by = bz + (cy + gy - 1) * nx + cx - 1;
          for (let gx = 0; gx < 3; gx++) {
            const wx = gx === 0 ? wx0 : gx === 1 ? wx1 : wx2, ex = gx === 0 ? dx - .5 : gx === 1 ? -2 * dx : dx + .5, m = G[(by + gx) * 4 + 3];
            rho += m * wx * wy * wz; gx_ += m * ex * wy * wz; gy_ += m * wx * ey * wz; gz_ += m * wx * wy * ez;
          }
        }
      }
      D[a] = -gx_ / RHO; D[a + 1] = -gy_ / RHO; D[a + 2] = -gz_ / RHO; D[a + 3] = rho / RHO;
      // the push: squeezed liquid pushes out (kp), and liquid that shears or is squeezed fast drags (kv). A lone
      // drop or a thin sheet has little weight in its cells, so its drag is scaled down with it (thin(): a
      // drag sized for full cells threw lone drops about)
      const q = Math.min(rho / RHO, 3), q2 = q * q, c = p * 12, kp = 4 / rho * Math.max(0, K * (q2 * q2 - 1)), kv = -4 * thin(rho);
      const sq = kv * zeta * (C[c] + C[c + 5] + C[c + 10]) + kp;   // (being squeezed or stretched fast is resisted, which stills the liquid's ringing)
      let t00 = kv * 2 * mu * C[c] + sq, t11 = kv * 2 * mu * C[c + 5] + sq, t22 = kv * 2 * mu * C[c + 10] + sq;
      let t01 = kv * mu * (C[c + 1] + C[c + 4]), t02 = kv * mu * (C[c + 2] + C[c + 8]), t12 = kv * mu * (C[c + 6] + C[c + 9]);
      const twin = M[a + 3];
      for (let pass = 0; pass <= twin; pass++) {
        if (pass) {   // the twin in the mirror pushes as hard as its drop
          x = M[a]; y = M[a + 1]; z = M[a + 2]; cx = x | 0; cy = y | 0; cz = z | 0; dx = x - cx - .5; dy = y - cy - .5; dz = z - cz - .5;
          wx0 = .5 * (.5 - dx) * (.5 - dx); wx1 = .75 - dx * dx; wx2 = .5 * (.5 + dx) * (.5 + dx);
          wy0 = .5 * (.5 - dy) * (.5 - dy); wy1 = .75 - dy * dy; wy2 = .5 * (.5 + dy) * (.5 + dy);
          wz0 = .5 * (.5 - dz) * (.5 - dz); wz1 = .75 - dz * dz; wz2 = .5 * (.5 + dz) * (.5 + dz);
          t00 = t11 = t22 = kp; t01 = t02 = t12 = 0;
        }
        for (let gz = 0; gz < 3; gz++) {
          const wz = gz === 0 ? wz0 : gz === 1 ? wz1 : wz2, rz = gz - 1 - dz, bz = (cz + gz - 1) * nxy;
          for (let gy = 0; gy < 3; gy++) {
            const wyz = wz * (gy === 0 ? wy0 : gy === 1 ? wy1 : wy2), ry = gy - 1 - dy, by = bz + (cy + gy - 1) * nx + cx - 1;
            for (let gx = 0; gx < 3; gx++) {
              const w = wyz * (gx === 0 ? wx0 : gx === 1 ? wx1 : wx2), rx = gx - 1 - dx, i = (by + gx) * 4;
              G[i] += w * (t00 * rx + t01 * ry + t02 * rz); G[i + 1] += w * (t01 * rx + t11 * ry + t12 * rz); G[i + 2] += w * (t02 * rx + t12 * ry + t22 * rz);
            }
          }
        }
      }
    }
    if (!open) this.fold(nt, false);   // the pushes given to cells beyond a wall come back too
    // the grid: each cell's speed, gravity, blasts; a cell inside a solid thing never moves further into it
    const kg = this.dt * this.dt / this.h, gvx = F.gravity.x * kg, gvy = F.gravity.y * kg, gvz = F.gravity.z * kg, pushes = F.blasts, np = pushes.length;
    for (let k = 0; k < nt; k++) {
      const i = T[k], m = G[i + 3], c = i >> 2, ix = c % nx, iy = ((c / nx) | 0) % ny, iz = (c / nxy) | 0, x = ix + .5, y = iy + .5, z = iz + .5;
      if (!open && (ix < LO || ix >= hx || iy < LO || iy >= hy || iz < LO || iz >= hz)) continue;   // beyond a wall: below
      let vx = G[i] / m + gvx, vy = G[i + 1] / m + gvy, vz = G[i + 2] / m + gvz;
      for (let j = 0; j < np; j++) {
        const b = pushes[j], ex = x - b.x, ey = y - b.y, ez = z - b.z, l = Math.hypot(ex, ey, ez);
        if (l < b.r) { const f = b.s * (1 - l / b.r) / (l || 1); vx += ex * f; vy += ey * f + b.up * (1 - l / b.r); vz += ez * f; }
      }
      if (bounds && this.near(x, y, z) && bd < 0) {
        let qx = vx - bux, qy = vy - buy, qz = vz - buz; const vn = qx * bnx + qy * bny + qz * bnz;
        if (vn < 0) { qx -= vn * bnx; qy -= vn * bny; qz -= vn * bnz; }
        vx = bux + qx; vy = buy + qy; vz = buz + qz;
      }
      G[i] = vx; G[i + 1] = vy; G[i + 2] = vz;
    }
    // the cells beyond a wall move as their mirror cells do, turned round
    if (!open) for (let k = 0; k < nt; k++) {
      const i = T[k], t = this.mirror(i); if (t === i) continue;
      const f = this.flip; G[i] = f & 1 ? -G[t] : G[t]; G[i + 1] = f & 2 ? -G[t + 1] : G[t + 1]; G[i + 2] = f & 4 ? -G[t + 2] : G[t + 2];
    }
    // grid to drops: each drop takes its cells' speed (and how it shears), moves, and is kept out of solid things
    const sinks = F.drains, nk = sinks.length;
    for (let p = 0; p < top; p++) {
      const a = p * 4; if (P[a + 3] <= 0) continue;
      let x = P[a], y = P[a + 1], z = P[a + 2];
      const cx = x | 0, cy = y | 0, cz = z | 0, dx = x - cx - .5, dy = y - cy - .5, dz = z - cz - .5;
      const wx0 = .5 * (.5 - dx) * (.5 - dx), wx1 = .75 - dx * dx, wx2 = .5 * (.5 + dx) * (.5 + dx);
      const wy0 = .5 * (.5 - dy) * (.5 - dy), wy1 = .75 - dy * dy, wy2 = .5 * (.5 + dy) * (.5 + dy);
      const wz0 = .5 * (.5 - dz) * (.5 - dz), wz1 = .75 - dz * dz, wz2 = .5 * (.5 + dz) * (.5 + dz);
      let vx = 0, vy = 0, vz = 0, b00 = 0, b01 = 0, b02 = 0, b10 = 0, b11 = 0, b12 = 0, b20 = 0, b21 = 0, b22 = 0;
      for (let gz = 0; gz < 3; gz++) {
        const wz = gz === 0 ? wz0 : gz === 1 ? wz1 : wz2, rz = gz - 1 - dz, bz = (cz + gz - 1) * nxy;
        for (let gy = 0; gy < 3; gy++) {
          const wyz = wz * (gy === 0 ? wy0 : gy === 1 ? wy1 : wy2), ry = gy - 1 - dy, by = bz + (cy + gy - 1) * nx + cx - 1;
          for (let gx = 0; gx < 3; gx++) {
            const w = wyz * (gx === 0 ? wx0 : gx === 1 ? wx1 : wx2), rx = gx - 1 - dx, i = (by + gx) * 4;
            const ux = G[i] * w, uy = G[i + 1] * w, uz = G[i + 2] * w;
            vx += ux; vy += uy; vz += uz;
            b00 += ux * rx; b01 += ux * ry; b02 += ux * rz; b10 += uy * rx; b11 += uy * ry; b12 += uy * rz; b20 += uz * rx; b21 += uz * ry; b22 += uz * rz;
          }
        }
      }
      const c = p * 12;
      C[c] = b00 * 4; C[c + 1] = b01 * 4; C[c + 2] = b02 * 4; C[c + 4] = b10 * 4; C[c + 5] = b11 * 4; C[c + 6] = b12 * 4; C[c + 8] = b20 * 4; C[c + 9] = b21 * 4; C[c + 10] = b22 * 4;
      const sp = Math.hypot(vx, vy, vz); if (!(sp <= VMAX)) { const f = sp > VMAX ? VMAX / sp : 0; vx = vx * f || 0; vy = vy * f || 0; vz = vz * f || 0; if (!f) C.fill(0, c, c + 12); }   // (never faster than a cell a step; a broken number stops dead)
      x += vx; y += vy; z += vz;
      let dead = 0;
      // (the mirrors already stop the liquid at solid things and walls: these only catch what gets through, a fast thing sweeping into the liquid most of all)
      if (bounds && this.near(x, y, z) && bd < IN) {
        const out = IN - bd; x += bnx * out; y += bny * out; z += bnz * out;
        const vn = (vx - bux) * bnx + (vy - buy) * bny + (vz - buz) * bnz; if (vn < 0) { vx -= vn * bnx; vy -= vn * bny; vz -= vn * bnz; }
      }
      if (open) { if (x < lo[0] || x > hx || y < lo[1] || y > hy || z < lo[2] || z > hz) dead = 1; }
      else {
        if (x < LO + IN) { x = LO + IN; if (vx < 0) vx = 0; } else if (x > hx - IN) { x = hx - IN; if (vx > 0) vx = 0; }
        if (y < LO + IN) { y = LO + IN; if (vy < 0) vy = 0; } else if (y > hy - IN) { y = hy - IN; if (vy > 0) vy = 0; }
        if (z < LO + IN) { z = LO + IN; if (vz < 0) vz = 0; } else if (z > hz - IN) { z = hz - IN; if (vz > 0) vz = 0; }
      }
      for (let j = 0; j < nk && !dead; j++) { const s = sinks[j], ex = x - s.gx, ey = y - s.gy, ez = z - s.gz; if (ex * ex + ey * ey + ez * ez < s.gr * s.gr) { dead = 1; s.took(this.drop); } }
      if (dead) { this.kill(p); continue; }
      P[a] = x; P[a + 1] = y; P[a + 2] = z; V[a] = vx; V[a + 1] = vy; V[a + 2] = vz;
    }
    for (let k = 0; k < nt; k++) { const i = T[k]; G[i] = G[i + 1] = G[i + 2] = G[i + 3] = 0; }
    while (this.top > 0 && !this.live[this.top - 1]) this.top--;
    this.steps++; this.stamp++;
  }
  // how many drops are in each cell (for level() and wet()), counted when first asked after the drops moved
  counts() {
    if (this.occAt === this.stamp && this.occ) return this.occ;
    const o = this.occ ||= new Uint8Array(this.cells), { P, nx, ny, nz } = this, nxy = nx * ny; o.fill(0);
    for (let p = 0, n = this.N; p < n; p++) {
      const a = p * 4; if (P[a + 3] <= 0) continue;
      const x = P[a] | 0, y = P[a + 1] | 0, z = P[a + 2] | 0; if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      const i = z * nxy + y * nx + x; if (o[i] < 255) o[i]++;
    }
    this.occAt = this.stamp; return o;
  }
}

/** Test switches (hidden from games): klass forces the phone's class and force the number of drops (both versions); backend and drops say what the last fluid to step ran on. */
export const FLUID = { klass: null, force: 0, backend: '', drops: 0 };
if (typeof window !== 'undefined' && navigator.webdriver) window.__fluid = FLUID;
const budget = big => { const c = FLUID.klass || phoneClass(); return { drops: FLUID.force || BUDGET[big ? 'gpu' : 'cpu'][c] || BUDGET.cpu.low, substeps: SUBSTEPS[big ? 'gpu' : 'cpu'][c] || 2 }; };

/**
 * A liquid in a box of your world. box: [x0, y0, z0, x1, y1, z1], where it can go (walls all round; open:
 * true: a floor and no walls, and drops that leave the box vanish). volume: the most liquid it has to hold, in units cubed (a
 * quarter of the box if you don't say): the drops are sized so that much fits. kind: 'water', 'lava',
 * 'slime' or 'honey', or your own colour, foam (a colour, or false), thick (0 water .. 1 honey), rough
 * and glow. gravity: units a second squared (9.8), or { x, y, z } (change fluid.gravity any time: tilt
 * the world). drops: fewer drops than the phone would run by itself (Fluid.max() is its number). size: how
 * big each drop is drawn (1). seed: a number for its dice (the same seed pours and splashes the same way).
 */
export class Fluid {
  /** The most drops this phone runs well (on the graphics chip where it can). */
  static max() { return budget(!!webgpu()).drops; }
  constructor(view, o = {}) {
    const kind = { ...KINDS.water, ...(KINDS[o.kind] || {}), ...o };
    this.view = view; this.bounds = (o.box || [-2, 0, -2, 2, 3, 2]).slice(); this.open = !!o.open;
    const [x0, y0, z0, x1, y1, z1] = this.bounds;
    this.volume = o.volume || (x1 - x0) * (y1 - y0) * (z1 - z0) / 4;
    const g = o.gravity ?? 9.8; this.gravity = typeof g === 'number' ? { x: 0, y: -g, z: 0 } : { x: g.x || 0, y: g.y || 0, z: g.z || 0 };
    this.mu = viscosity(kind.thick); this.size = o.size || 1; this.shadows = o.shadows !== false;
    this.look = { colour: new Color(kind.colour), foam: kind.foam === false ? null : new Color(kind.foam), rough: kind.rough, glow: kind.glow };
    this.solids = []; this.packed = []; this.taps = []; this.drains = []; this.blasts = [];
    this.groundFn = this.open ? () => y0 : null;   // (an open box keeps its floor, as ground: the liquid runs off the edges)
    // its own dice (mulberry32), so the same game makes the same liquid every time: seed changes them
    let seed = (o.seed ?? 1) >>> 0; this.rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // sized for the graphics chip when the view will draw there (hd3d.js runs a view's sims: gpuStep)
    this.big = !!webgpu() && typeof view?.envFor === 'function' && o.gpu !== false && typeof webgpu().fx.gpuFluid === 'function';
    this.gpuOk = o.gpu !== false; this.want = o.drops || Infinity;
    const b = budget(this.big); this.substeps = b.substeps;
    this.sim = new Sim(this, Math.min(this.want, b.drops));
    this.mode = this.big ? 'wait' : 'cpu'; this.waited = 0; this.pending = 0; this.acc = 0; this.cpuOwns = true; this.staged = [];
    this.twin = null; this.mesh = this.cpuMesh(); this.mesh.visible = false;
    if (view) { (view.sims ||= []).push(this); (view.scene || view).add?.(this.mesh); }
    own(this);   // its drops on the graphics chip are freed when the card leaves the feed (src/kit/cleanup.js)
  }
  free() { this.dispose(); }
  /** 'gpu' when the fluid runs on the graphics chip, else 'cpu'. */
  get backend() { return this.mode === 'cpu' ? 'cpu' : 'gpu'; }
  /** Drops in the fluid now, and the most it can have. */
  get count() { return this.sim.alive; }
  get max() { return this.sim.N; }
  /** How much liquid one drop is, and how wide a drop is (world units). */
  get drop() { return this.sim.drop; }
  get dropSize() { return this.sim.h * SPACING; }
  /** How much more liquid fits before the fluid is full (then taps stop until some drains away). */
  get room() { return this.sim.nfree * this.sim.drop; }
  get full() { return this.sim.nfree === 0; }

  /* ----- putting liquid in ----- */
  // a drop, in world units; false when the fluid is full
  spawn(x, y, z, vx = 0, vy = 0, vz = 0) {
    const S = this.sim, kv = S.dt / S.h, s = S.add((x - S.ox) / S.h, (y - S.oy) / S.h, (z - S.oz) / S.h, vx * kv, vy * kv, vz * kv);
    if (s < 0) return false;
    if (!this.cpuOwns) this.staged.push(s);   // the graphics chip has the drops: this one goes up with the next step
    return true;
  }
  /**
   * A tap: a stream from x, y, z going dir ([x, y, z], down if you don't say) at speed (units a second),
   * rate units cubed a second. spread: how ragged (0..1). r: the nozzle's radius (as wide as the stream
   * needs if you don't say; narrower sprays). Returns the tap: change its x, y, z, dir, rate, speed and
   * on any time; tap.remove() takes it away.
   */
  pour(o = {}) {
    const tap = { x: 0, y: 0, z: 0, dir: [0, -1, 0], rate: .5, speed: 2, spread: .05, r: null, on: true, acc: 0, ...o, remove: () => { const i = this.taps.indexOf(tap); if (i >= 0) this.taps.splice(i, 1); } };
    this.taps.push(tap); return tap;
  }
  /** A burst of liquid at x, y, z: amount (units cubed), thrown outwards at speed and upwards at up (units a second). Returns how much went in. */
  splash(x, y, z, { amount = this.sim.drop * 60, speed = 2, up = 1 } = {}) {
    const S = this.sim, n = Math.min(S.nfree, Math.round(amount / S.drop)), r = Math.cbrt(n / RHO * .75 / Math.PI) * S.h;
    let k = 0;
    const rnd = this.rnd;
    for (let i = 0; i < n; i++) {
      let ax, ay, az, l; do { ax = rnd() * 2 - 1; ay = rnd() * 2 - 1; az = rnd() * 2 - 1; l = ax * ax + ay * ay + az * az; } while (l > 1 || l < 1e-4);
      const q = Math.sqrt(l); if (this.spawn(x + ax * r, y + ay * r, z + az * r, ax / q * speed * (.5 + .5 * q), ay / q * speed * (.5 + .5 * q) + up, az / q * speed * (.5 + .5 * q))) k++;
    }
    return k * S.drop;
  }
  /**
   * Liquid at rest in a block: { x0, y0, z0, x1, y1, z1 } (any you leave out is the box's own side, so
   * fill({ y1: 1 }) floods the whole floor a unit deep). Solid things and the ground are left dry.
   * Returns how much went in (less than the block when the fluid fills up).
   */
  fill(b = {}) {
    const S = this.sim, B = this.bounds, g = (v, i, o) => ((v ?? B[i]) - o) / S.h;
    return this.lattice(Math.max(S.lo[0], g(b.x0, 0, S.ox)), Math.max(S.lo[1], g(b.y0, 1, S.oy)), Math.max(S.lo[2], g(b.z0, 2, S.oz)), Math.min(S.hi[0], g(b.x1, 3, S.ox)), Math.min(S.hi[1], g(b.y1, 4, S.oy)), Math.min(S.hi[2], g(b.z1, 5, S.oz)), null);
  }
  // drops at rest on a jittered lattice through a block (cells), bottom first, where ok() says and nothing solid is
  lattice(x0, y0, z0, x1, y1, z1, ok) {
    const S = this.sim, rnd = this.rnd; this.pack();
    x0 = Math.max(x0, S.lo[0]); y0 = Math.max(y0, S.lo[1]); z0 = Math.max(z0, S.lo[2]); x1 = Math.min(x1, S.hi[0]); y1 = Math.min(y1, S.hi[1]); z1 = Math.min(z1, S.hi[2]);
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return 0;
    // as many drops each way as fill the block at rest, spread evenly from side to side
    const kx = Math.max(1, Math.round((x1 - x0) / SPACING)), ky = Math.max(1, Math.round((y1 - y0) / SPACING)), kz = Math.max(1, Math.round((z1 - z0) / SPACING));
    const ex = (x1 - x0) / kx, ey = (y1 - y0) / ky, ez = (z1 - z0) / kz;
    let n = 0;
    for (let b = 0; b < ky; b++) for (let c = 0; c < kz; c++) for (let a = 0; a < kx; a++) {
      const px = x0 + (a + .5 + (rnd() - .5) * .3) * ex, py = y0 + (b + .5 + (rnd() - .5) * .3) * ey, pz = z0 + (c + .5 + (rnd() - .5) * .3) * ez;
      if (ok && !ok(px, py, pz)) continue;
      if (!ok && S.near(px, py, pz) && bd < .15) continue;
      if (!S.nfree) return n * S.drop;
      const slot = S.add(px, py, pz, 0, 0, 0); if (slot < 0) continue;
      if (!this.cpuOwns) this.staged.push(slot); n++;
    }
    return n * S.drop;
  }
  /** Takes all the liquid away. */
  clear() { this.sim.clear(); this.staged.length = 0; this.cpuOwns = true; for (const t of this.taps) t.acc = 0; return this; }

  /* ----- solid things, the ground, drains and blasts ----- */
  // (the graphics chip takes SOLIDS solids, SINKS drains and PUSHES blasts a frame: more are left out)
  solid(T, o) { const s = new Solid(this, T, o); if (this.solids.length < SOLIDS) this.solids.push(s); return s; }
  /** A solid ball: { x, y, z, r }. hollow: a wall this thick with room inside (open: a bowl; open: false a sealed globe). */
  ball(o = {}) { return this.solid(0, o); }
  /** A solid box: { x, y, z, w, h, d, turn (a Quaternion) }. hollow: a tank with walls this thick, open at the top (open: false: sealed). */
  box(o = {}) { return this.solid(1, o); }
  /** A solid post standing on its end: { x, y, z, r, h, turn }. hollow: a cup with walls this thick, open at the top. */
  tube(o = {}) { return this.solid(2, o); }
  /** The ground under the liquid: a function (x, z) => y. Call it again when the ground changes; null takes it away (an open box then has no floor). */
  ground(fn) { this.groundFn = fn || null; this.sim.ground(this.groundFn); this.groundNew = true; return this; }
  /** A drain: drops that reach the ball at x, y, z (radius r) go. Returns it: its amount is how much it has swallowed; remove() takes it away. */
  drain(o = {}) {
    const d = { x: 0, y: 0, z: 0, r: .3, amount: 0, ...o, took: v => { d.amount += v; }, remove: () => { const i = this.drains.indexOf(d); if (i >= 0) this.drains.splice(i, 1); } };
    if (this.drains.length < SINKS) this.drains.push(d);
    return d;
  }
  /** A blast: liquid within radius of x, y, z is thrown outwards at up to strength (units a second), and upwards at up. */
  push(x, y, z, { radius = 1, strength = 3, up = 0 } = {}) { if (this.blasts.length < PUSHES) this.blasts.push({ wx: x, wy: y, wz: z, wr: radius, ws: strength, wu: up }); return this; }
  // the solids, drains and blasts in cells and steps, for the sim as it is now
  pack() {
    const S = this.sim, h = S.h; this.packed.length = this.solids.length;
    for (let i = 0; i < this.solids.length; i++) this.packed[i] = this.solids[i].pack(S);
    for (const d of this.drains) { d.gx = (d.x - S.ox) / h; d.gy = (d.y - S.oy) / h; d.gz = (d.z - S.oz) / h; d.gr = d.r / h; }
    return this.packed;
  }

  /* ----- each frame ----- */
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    const S = this.sim;
    for (const s of this.solids) s.moved(dt);
    this.pack();
    for (const t of this.taps) this.runTap(t, dt);
    this.acc = Math.min(this.acc + dt, S.dt * (this.substeps + 1));
    let n = Math.floor(this.acc / S.dt); this.acc -= n * S.dt;
    if (n > 0) for (const b of this.blasts) { const k = S.dt / S.h / n; b.x = (b.wx - S.ox) / S.h; b.y = (b.wy - S.oy) / S.h; b.z = (b.wz - S.oz) / S.h; b.r = b.wr / S.h; b.s = b.ws * k; b.up = b.wu * k; }
    if (this.mode === 'cpu') { for (let i = 0; i < n; i++) S.step(); if (n) this.blasts.length = 0; this.sync(); return this; }
    this.pending = Math.min(this.pending + n, this.substeps * 3);
    // sized for the graphics chip, but the view never drew there: the smaller version takes over
    if (this.mode === 'wait' && ++this.waited > 30) this.toCpu();
    return this;
  }
  runTap(t, dt) {
    if (!t.on || !(t.rate > 0)) { t.acc = 0; return; }
    const S = this.sim; t.acc += t.rate * dt / S.drop;
    let n = Math.min(Math.floor(t.acc), 600); t.acc -= Math.floor(t.acc); if (!n) return;
    const d = t.dir, l = Math.hypot(d[0], d[1], d[2]) || 1, dx = d[0] / l, dy = d[1] / l, dz = d[2] / l;
    // two directions across the stream
    let ax = Math.abs(dy) < .9 ? 0 : 1, ay = Math.abs(dy) < .9 ? 1 : 0, az = 0;
    let bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax; const bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
    ax = by * dz - bz * dy; ay = bz * dx - bx * dz; az = bx * dy - by * dx;
    const sp = Math.max(t.speed, .01), r = t.r ?? Math.max(Math.sqrt(t.rate / (Math.PI * sp)), S.h * .35), back = sp * dt, rnd = this.rnd;
    while (n-- > 0) {
      const a = rnd() * 6.2832, q = Math.sqrt(rnd()) * r, u = Math.cos(a) * q, w = Math.sin(a) * q, e = rnd() * back, k = t.spread * sp;
      const jx = (rnd() - .5) * k, jy = (rnd() - .5) * k, jz = (rnd() - .5) * k;
      if (!this.spawn(t.x + ax * u + bx * w - dx * e, t.y + ay * u + by * w - dy * e, t.z + az * u + bz * w - dz * e, dx * sp + jx, dy * sp + jy, dz * sp + jz)) { t.acc = 0; break; }
    }
  }

  /* ----- questions ----- */
  /** How much liquid there is (units cubed), in the whole fluid or in a box [x0, y0, z0, x1, y1, z1]. */
  amount(b = null) {
    const S = this.sim; if (!b) return S.alive * S.drop;
    const P = S.P, h = S.h, x0 = (b[0] - S.ox) / h, y0 = (b[1] - S.oy) / h, z0 = (b[2] - S.oz) / h, x1 = (b[3] - S.ox) / h, y1 = (b[4] - S.oy) / h, z1 = (b[5] - S.oz) / h;
    let n = 0;
    for (let p = 0, N = S.N; p < N; p++) { const a = p * 4; if (P[a + 3] > 0 && P[a] >= x0 && P[a] <= x1 && P[a + 1] >= y0 && P[a + 1] <= y1 && P[a + 2] >= z0 && P[a + 2] <= z1) n++; }
    return n * S.drop;
  }
  /** The height of the liquid's top at x, z (world y), or null where it's dry. Stray drops in the air don't count. */
  level(x, z) {
    const S = this.sim, o = S.counts(), { nx, ny, nz } = S, i = Math.floor((x - S.ox) / S.h), k = Math.floor((z - S.oz) / S.h);
    if (i < 0 || k < 0 || i >= nx || k >= nz) return null;
    // the nine columns round the place, from the top down: the first layer a third full is the top
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), k0 = Math.max(0, k - 1), k1 = Math.min(nz - 1, k + 1), full = (i1 - i0 + 1) * (k1 - k0 + 1) * RHO;
    for (let j = ny - 1; j >= 0; j--) {
      let c = 0; for (let b = k0; b <= k1; b++) for (let a = i0; a <= i1; a++) c += o[(b * ny + j) * nx + a];
      if (c >= full * .33) return S.oy + (j + Math.min(1, c / full)) * S.h;
    }
    return null;
  }
  /** How wet a place is: 0 dry .. 1 under the liquid. */
  wet(x, y, z) {
    const S = this.sim, i = Math.floor((x - S.ox) / S.h), j = Math.floor((y - S.oy) / S.h), k = Math.floor((z - S.oz) / S.h);
    if (i < 0 || j < 0 || k < 0 || i >= S.nx || j >= S.ny || k >= S.nz) return 0;
    return Math.min(1, S.counts()[(k * S.ny + j) * S.nx + i] / RHO);
  }

  /* ----- drawing: the smaller version is little balls, one a drop ----- */
  cpuMesh() {
    const L = this.look, m = new MeshStandardMaterial({ color: L.foam ? '#ffffff' : L.colour, roughness: L.rough, metalness: 0 });   // (with foam each ball has its own colour: sync())
    if (L.glow) { m.emissive = L.colour.clone(); m.emissiveIntensity = L.glow; }
    const mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), m, Math.min(this.want, budget(false).drops));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = this.shadows;
    return mesh;
  }
  // the balls follow the drops (and whiten where the liquid is thin or fast, when there's foam)
  sync() {
    const S = this.sim, M = this.mesh, A = M.instanceMatrix.array, P = S.P, V = S.V, D = S.D, h = S.h, r = h * .62 * this.size, cap = A.length / 16, L = this.look;
    let n = 0, col = null;
    if (L.foam) { if (!M.instanceColor) M.setColorAt(0, L.colour); col = M.instanceColor.array; }
    for (let p = 0; p < S.top && n < cap; p++) {
      const a = p * 4; if (P[a + 3] <= 0) continue;
      const k = n * 16; A.fill(0, k, k + 16); A[k] = A[k + 5] = A[k + 10] = r; A[k + 15] = 1;
      A[k + 12] = S.ox + P[a] * h; A[k + 13] = S.oy + P[a + 1] * h; A[k + 14] = S.oz + P[a + 2] * h;
      if (col) { const f = foamOf(D[a + 3], Math.hypot(V[a], V[a + 1], V[a + 2]), S.foam0), c = n * 3; col[c] = L.colour.r + (L.foam.r - L.colour.r) * f; col[c + 1] = L.colour.g + (L.foam.g - L.colour.g) * f; col[c + 2] = L.colour.b + (L.foam.b - L.colour.b) * f; }
      n++;
    }
    M.count = n; M.visible = n > 0; sendUsed(M.instanceMatrix, n); if (col) sendUsed(M.instanceColor, n);
  }

  /* ----- the graphics chip takes over (hd3d.js gpuSwap calls this every frame the view draws) ----- */
  gpuStep(G) {
    if (G && this.mode !== 'cpu' && !G.fx.gpuFluid) G = null;
    if (G && (this.mode !== 'cpu' || this.wantGpu())) {
      if (this.mode === 'cpu') this.resize(true);
      if (this.twin?.r !== G.r || this.twin.sim !== this.sim) {
        this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = { r: G.r, sim: this.sim, ...G.fx.gpuFluid(this) };
        if (!this.cpuOwns) { this.sim.V.fill(0); this.sim.C.fill(0); this.cpuOwns = true; }   // (a new renderer: the drops as last copied back, at rest)
      }
      this.mode = 'gpu'; this.mesh.visible = false;
      if (this.mesh.parent && this.twin.mesh.parent !== this.mesh.parent) this.mesh.parent.add(this.twin.mesh);
      const n = this.pending; this.twin.step(G.r, n); this.pending = 0; if (n) this.blasts.length = 0;
    } else if (this.mode !== 'cpu') this.toCpu();
  }
  wantGpu() { return !!webgpu() && this.gpuOk; }
  toCpu() {
    this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = null;
    this.mode = 'cpu'; this.resize(false); this.pending = 0; this.sync();
  }
  // the same liquid at another size: each old drop's liquid goes to new drops where it was
  resize(big) {
    const old = this.sim, b = budget(big); this.big = big; this.substeps = b.substeps;
    const S = this.sim = new Sim(this, Math.min(this.want, b.drops)), kp = old.h / S.h, kv = (old.h / old.dt) * (S.dt / S.h), j = Math.cbrt(old.drop) / S.h;
    let carry = 0; const rnd = this.rnd;
    for (let p = 0; p < old.N; p++) {
      const a = p * 4; if (old.P[a + 3] <= 0) continue;
      carry += old.drop / S.drop;
      const x = (old.ox - S.ox) / S.h + old.P[a] * kp, y = (old.oy - S.oy) / S.h + old.P[a + 1] * kp, z = (old.oz - S.oz) / S.h + old.P[a + 2] * kp;
      const fresh = this.cpuOwns ? kv : 0;   // (speeds on the graphics chip aren't copied back: those drops start still)
      while (carry >= 1) { carry--; S.add(x + (rnd() - .5) * j, y + (rnd() - .5) * j, z + (rnd() - .5) * j, old.V[a] * fresh, old.V[a + 1] * fresh, old.V[a + 2] * fresh); }
    }
    this.cpuOwns = true; this.staged.length = 0; this.acc = 0;
  }
  // drops copied back from the graphics chip (fluid-gpu.js): which have gone (down a drain, out of an open box), for the questions
  read(P, at) {
    const S = this.sim; if (this.cpuOwns || this.mode !== 'gpu') return;
    const Q = S.P;
    for (let p = 0, N = S.N; p < N; p++) {
      const a = p * 4;
      if (!S.live[p]) { Q[a + 3] = 0; continue; }
      if (S.born[p] >= at) continue;   // made after this copy was asked for
      const w = P[a + 3]; Q[a] = P[a]; Q[a + 1] = P[a + 1]; Q[a + 2] = P[a + 2];
      if (w <= 0) { const k = Math.round(-w) - 1; if (k >= 0 && this.drains[k]) this.drains[k].took(S.drop); S.kill(p); }
    }
    S.stamp++;
  }
  /** Takes the fluid out of the view and frees what it holds. */
  dispose() {
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose();
    this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = null;
    const s = this.view?.sims, i = s ? s.indexOf(this) : -1; if (i >= 0) s.splice(i, 1);
  }
}
/** How foamy a drop looks: thin liquid (spray, the edge of a splash) and fast liquid whiten. q: how full its cells are (1 at rest); speed and f0 (where foam starts) in cells a step. */
export const foamOf = (q, speed, f0) => Math.min(.85, Math.max(0, (.4 - q) / .3) + Math.max(0, (speed - f0) / (1.4 * f0)));
