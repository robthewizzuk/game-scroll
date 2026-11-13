// Soft things: cloth, ropes, jelly and simple water. Cloth, ropes and jelly are points joined by
// sticks (Verlet, the method most games use: steady, cheap and easy to tear); jelly keeps its
// area with a pressure push, so it wobbles back into shape. Liquid is little particles that push
// apart and pull together (double density relaxation, Clavet et al.), which pours, splashes and
// settles like water. The kit moves the points; your game draws them (filled shapes, lines, blobs).
// 2D by default (x, y; gravity down the screen); pass z for 3D cloth and ropes.
//
//   const { Soft, Liquid } = gs.soft;
//   reset() { soft = new Soft({ bounds: [0, 0, W, H] });
//             flag = soft.cloth(100, 80, 160, 100, 12, 8, { pin: 'left', tear: 3 });
//             blob = soft.jelly(180, 300, 40, 16);  soft.circle(180, 500, 60);   // a solid ball things land on
//   }
//   down(x, y) { held = soft.grab(x, y, 20); }  move(x, y) { held?.move(x, y); }  up() { held?.drop(); }
//   swipe: soft.cut(x0, y0, x1, y1);   update(dt) { soft.update(dt); }
//   draw: for (const s of soft.sticks) line(s.a, s.b); or flag.at(c, r), blob.points
//
// 3D cloth: soft = new Soft({ gravity: { x: 0, y: -9.8, z: 0 }, dims: 3 }); cloth(..., { plane: 'xy' }); soft.toGeometry(flag, mesh.geometry).
import { timed } from './prof.js';

export class Soft {
  /**
   * gravity: { x, y, z } (default 2D, 900 down the screen); iterations: stick passes a step (more =
   * stiffer); damping: 0..1 kept each step; bounds: [x0, y0, x1, y1] walls (2D); floor: a y the
   * points can't pass (3D: up is +y so it's a minimum); bounce off walls; friction on them.
   */
  constructor({ gravity = null, dims = 2, iterations = 8, damping = .995, bounds = null, floor = null, bounce = .3, friction = .9, step = 1 / 120 } = {}) {
    this.dims = dims; this.gravity = gravity || (dims === 3 ? { x: 0, y: -9.8, z: 0 } : { x: 0, y: 900, z: 0 });
    Object.assign(this, { iterations, damping, bounds, floor, bounce, friction, step });
    this.points = []; this.sticks = []; this.bodies = []; this.solids = []; this.acc = 0; this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** A point. pinned: held in place; mass: heavier points move less when pulled; r: its size for collisions. */
  point(x, y, z = 0, { pinned = false, mass = 1, r = 2 } = {}) {
    const p = { x, y, z, px: x, py: y, pz: z, pinned, inv: pinned ? 0 : 1 / mass, r }; this.points.push(p); return p;
  }
  /** A stick keeping two points apart. stiff: 0..1; len: rest length (default now); tear: breaks past this many times its length; slack: a rope (only pulls). */
  stick(a, b, { stiff = 1, len = null, tear = 0, slack = false } = {}) {
    const s = { a, b, len: len ?? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), stiff, tear, slack, broken: false }; this.sticks.push(s); return s;
  }
  /**
   * A sheet of cloth cols × rows points from x, y (w × h). pin: 'top' | 'left' | 'corners' | 'none' or
   * (c, r) => true; tear: how far a thread stretches before it rips (0 never); plane: 'xy' (2D, or
   * a hanging banner in 3D) or 'xz' (a flat sheet in 3D). Returns { points, sticks, cols, rows, at(c, r) }.
   */
  cloth(x, y, w, h, cols = 10, rows = 8, { pin = 'top', tear = 0, stiff = 1, z = 0, plane = 'xy', mass = 1 } = {}) {
    const pts = [], sts = [];
    const pinned = typeof pin === 'function' ? pin : (c, r) => (pin === 'top' && r === 0) || (pin === 'left' && c === 0) || (pin === 'corners' && r === 0 && (c === 0 || c === cols - 1));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) * w, v = r / (rows - 1) * h;
      pts.push(plane === 'xz' ? this.point(x + u, y, z + v, { pinned: pinned(c, r), mass }) : this.point(x + u, y + (this.dims === 3 ? -v : v), z, { pinned: pinned(c, r), mass }));
    }
    const at = (c, r) => pts[r * cols + c];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c < cols - 1) sts.push(this.stick(at(c, r), at(c + 1, r), { tear, stiff }));
      if (r < rows - 1) sts.push(this.stick(at(c, r), at(c, r + 1), { tear, stiff }));
    }
    const body = { kind: 'cloth', points: pts, sticks: sts, cols, rows, at }; this.bodies.push(body); return body;
  }
  /** A rope of n segments from a to b ({ x, y, z }). pinA / pinB hold its ends; tear as cloth. */
  rope(a, b, n = 12, { pinA = true, pinB = false, tear = 0, mass = 1, slack = true } = {}) {
    const pts = [], sts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(this.point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t, { pinned: (i === 0 && pinA) || (i === n && pinB), mass })); }
    for (let i = 0; i < n; i++) sts.push(this.stick(pts[i], pts[i + 1], { tear, slack }));
    const body = { kind: 'rope', points: pts, sticks: sts }; this.bodies.push(body); return body;
  }
  /**
   * A 2D jelly blob: a ring of n points round x, y (radius r) with cross braces and a pressure that
   * keeps its area. pressure: how firmly it springs back (1 keeps its size); stiff: how stiff the skin.
   */
  jelly(x, y, r, n = 16, { pressure = 1, stiff = .9, mass = 1 } = {}) {
    const pts = [], sts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(this.point(x + Math.cos(a) * r, y + Math.sin(a) * r, 0, { mass, r: Math.PI * r / n })); }
    for (let i = 0; i < n; i++) { sts.push(this.stick(pts[i], pts[(i + 1) % n], { stiff })); sts.push(this.stick(pts[i], pts[(i + Math.floor(n / 2)) % n], { stiff: .02 })); }
    const body = { kind: 'jelly', points: pts, sticks: sts, pressure, area: 0, rest: 0 };
    body.rest = Math.abs(area(pts)); body.area = body.rest; this.bodies.push(body); return body;
  }
  /** A solid circle points can't enter (move it yourself: it's yours, e.g. the player). */
  circle(x, y, r) { const s = { kind: 'circle', x, y, r }; this.solids.push(s); return s; }
  /** A solid box (x, y top-left, w × h). */
  box(x, y, w, h) { const s = { kind: 'box', x, y, w, h }; this.solids.push(s); return s; }
  remove(thing) { this.solids = this.solids.filter(s => s !== thing); if (thing.points) { const set = new Set(thing.points); this.points = this.points.filter(p => !set.has(p)); this.sticks = this.sticks.filter(s => !set.has(s.a) && !set.has(s.b)); this.bodies = this.bodies.filter(b => b !== thing); } return this; }
  /** The nearest point within reach of x, y (z) and a handle to drag it: { point, move(x, y, z), drop() }. */
  grab(x, y, reach = 20, z = 0) {
    let best = null, bd = reach;
    for (const p of this.points) { const d = Math.hypot(p.x - x, p.y - y, this.dims === 3 ? p.z - z : 0); if (d < bd) { bd = d; best = p; } }
    if (!best) return null;
    const p = best, was = p.pinned; p.pinned = true;
    return { point: p, move(nx, ny, nz = p.z) { p.x = nx; p.y = ny; p.z = nz; return this; }, drop() { p.pinned = was; p.px = p.x; p.py = p.y; p.pz = p.z; } };
  }
  /** Cuts every stick crossing the line from x0, y0 to x1, y1 (a swipe). Returns how many. */
  cut(x0, y0, x1, y1) {
    let n = 0;
    for (const s of this.sticks) if (!s.broken && cross(x0, y0, x1, y1, s.a.x, s.a.y, s.b.x, s.b.y)) { s.broken = true; n++; this.emit('cut', s); }
    if (n) this.sticks = this.sticks.filter(s => !s.broken);
    return n;
  }
  /** Pushes points away from p (x, y, z) within radius (a blast or a gust). */
  push(p, radius, strength) {
    for (const q of this.points) { if (q.pinned) continue; const dx = q.x - p.x, dy = q.y - p.y, dz = (q.z - (p.z || 0)) * (this.dims === 3 ? 1 : 0), d = Math.hypot(dx, dy, dz); if (d > radius || d < 1e-6) continue; const k = strength * (1 - d / radius) * this.step; q.px -= dx / d * k; q.py -= dy / d * k; q.pz -= dz / d * k; }
    return this;
  }
  /** A steady wind (added to gravity): { x, y, z }. */
  wind(w) { this.windV = w; return this; }
  update(dt) {
    this.acc = Math.min(this.acc + dt, this.step * 8);
    while (this.acc >= this.step) { this.tick(this.step); this.acc -= this.step; }
    return this;
  }
  tick(h) {
    const g = this.gravity, w = this.windV || { x: 0, y: 0, z: 0 }, d = this.damping, h2 = h * h, three = this.dims === 3;
    for (const p of this.points) {
      if (p.pinned) { p.px = p.x; p.py = p.y; p.pz = p.z; continue; }
      const vx = (p.x - p.px) * d, vy = (p.y - p.py) * d, vz = (p.z - p.pz) * d;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx + (g.x + w.x) * h2; p.y += vy + (g.y + w.y) * h2; if (three) p.z += vz + ((g.z || 0) + (w.z || 0)) * h2;
    }
    for (let it = 0; it < this.iterations; it++) {
      for (const s of this.sticks) {
        const a = s.a, b = s.b, dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1e-6;
        if (s.tear && l > s.len * s.tear) { s.broken = true; continue; }
        if (s.slack && l < s.len) continue;
        const wsum = a.inv + b.inv; if (!wsum) continue;
        const k = (l - s.len) / l * s.stiff / wsum;
        a.x += dx * k * a.inv; a.y += dy * k * a.inv; a.z += dz * k * a.inv; b.x -= dx * k * b.inv; b.y -= dy * k * b.inv; b.z -= dz * k * b.inv;
      }
      for (const body of this.bodies) if (body.kind === 'jelly') this.inflate(body);
      this.collide();
    }
    if (this.sticks.some(s => s.broken)) { const gone = this.sticks.filter(s => s.broken); this.sticks = this.sticks.filter(s => !s.broken); for (const b of this.bodies) b.sticks = b.sticks.filter(s => !s.broken); for (const s of gone) this.emit('tear', s); }
  }
  // jelly: push the ring's points out along their normals to keep its area
  inflate(b) {
    const pts = b.points, n = pts.length, A0 = area(pts), sgn = Math.sign(A0) || 1, A = Math.abs(A0); b.area = A;
    let perim = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; perim += Math.hypot(q.x - p.x, q.y - p.y); }
    const k = (b.rest * b.pressure - A) / (perim || 1) / this.iterations * 2 * sgn;
    for (let i = 0; i < n; i++) {
      const p = pts[(i + n - 1) % n], q = pts[(i + 1) % n], o = pts[i]; if (o.pinned) continue;
      const nx = q.y - p.y, ny = -(q.x - p.x), l = Math.hypot(nx, ny) || 1;   // outward for a counter-clockwise ring
      o.x += nx / l * k; o.y += ny / l * k;
    }
  }
  collide() {
    const B = this.bounds, three = this.dims === 3;
    for (const p of this.points) {
      if (p.pinned) continue;
      if (B && !three) {
        if (p.x < B[0] + p.r) { p.x = B[0] + p.r; p.px = p.x + (p.x - p.px) * this.bounce; p.py = p.y - (p.y - p.py) * this.friction; }
        if (p.x > B[2] - p.r) { p.x = B[2] - p.r; p.px = p.x + (p.x - p.px) * this.bounce; p.py = p.y - (p.y - p.py) * this.friction; }
        if (p.y < B[1] + p.r) { p.y = B[1] + p.r; p.py = p.y + (p.y - p.py) * this.bounce; }
        if (p.y > B[3] - p.r) { const vx = p.x - p.px; p.y = B[3] - p.r; p.py = p.y + (p.y - p.py) * this.bounce; p.px = p.x - vx * this.friction; }
      }
      if (this.floor != null && three && p.y < this.floor) { const vx = p.x - p.px, vz = p.z - p.pz; p.y = this.floor; p.py = p.y; p.px = p.x - vx * this.friction; p.pz = p.z - vz * this.friction; }
      for (const s of this.solids) {
        if (s.kind === 'circle') {
          const dx = p.x - s.x, dy = p.y - s.y, dz = three ? p.z - (s.z || 0) : 0, d = Math.hypot(dx, dy, dz), m = s.r + p.r;
          if (d < m && d > 1e-6) { p.x = s.x + dx / d * m; p.y = s.y + dy / d * m; if (three) p.z = (s.z || 0) + dz / d * m; }
        } else if (s.kind === 'box' && p.x > s.x - p.r && p.x < s.x + s.w + p.r && p.y > s.y - p.r && p.y < s.y + s.h + p.r) {
          const l = p.x - (s.x - p.r), r = s.x + s.w + p.r - p.x, t = p.y - (s.y - p.r), bt = s.y + s.h + p.r - p.y, m = Math.min(l, r, t, bt);
          if (m === l) p.x = s.x - p.r; else if (m === r) p.x = s.x + s.w + p.r; else if (m === t) { p.y = s.y - p.r; p.px = p.x - (p.x - p.px) * this.friction; } else p.y = s.y + s.h + p.r;
        }
      }
    }
  }
  /** Centre of a body (a jelly's middle, a cloth's middle). */
  centre(body) { let x = 0, y = 0, z = 0; for (const p of body.points) { x += p.x; y += p.y; z += p.z; } const n = body.points.length || 1; return { x: x / n, y: y / n, z: z / n }; }
  /** Writes a 3D cloth's points into a three.js geometry made with the same cols × rows (PlaneGeometry(w, h, cols - 1, rows - 1)). */
  toGeometry(body, geometry) {
    const a = geometry.attributes.position, arr = a.array;
    body.points.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
    a.needsUpdate = true; geometry.computeVertexNormals?.(); geometry.computeBoundingSphere?.(); return geometry;
  }
}
function area(pts) { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p.x * q.y - q.x * p.y; } return a / 2; }
function cross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (!d) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/**
 * Simple 2D water: particles that pour, splash and settle. r: how far each one feels its
 * neighbours (about 2-3 times the size you draw them); stiff / near: how hard they push apart;
 * viscosity: thickness (0 water .. 1 honey); bounds: [x0, y0, x1, y1]; max: most particles.
 */
export class Liquid {
  constructor({ r = 16, gravity = 600, stiff = .004, near = .01, rest = 10, viscosity = .1, bounds = [0, 0, 360, 640], max = 400, bounce = .3 } = {}) {
    Object.assign(this, { r, gravity, stiff, nearK: near, rest, viscosity, bounds, max, bounce }); this.list = []; this.solids = []; this.grid = new Map();
  }
  /** Adds a drop at x, y with speed vx, vy (px a second). */
  add(x, y, vx = 0, vy = 0) { if (this.list.length >= this.max) this.list.shift(); const p = { x, y, vx, vy, px: x, py: y }; this.list.push(p); return p; }
  /** A puff of n drops in a circle (a splash or a bucket). */
  pour(x, y, n = 20, spread = 10, vx = 0, vy = 0) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * spread; this.add(x + Math.cos(a) * d, y + Math.sin(a) * d, vx, vy); } return this; }
  circle(x, y, r) { const s = { kind: 'circle', x, y, r }; this.solids.push(s); return s; }
  box(x, y, w, h) { const s = { kind: 'box', x, y, w, h }; this.solids.push(s); return s; }
  /** Drops near a point (inside a cup, on a plant). */
  near(x, y, r) { return this.list.filter(p => Math.hypot(p.x - x, p.y - y) <= r); }
  count(test) { return test ? this.list.filter(test).length : this.list.length; }
  update(dt) {
    dt = Math.min(dt, 1 / 30); const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let i = 0; i < n; i++) this.tick(h);
    return this;
  }
  tick(h) {
    const L = this.list, r = this.r, g = this.grid; g.clear();
    for (const p of L) { p.vy += this.gravity * h; p.px = p.x; p.py = p.y; p.x += p.vx * h; p.y += p.vy * h; const k = ((p.x / r) | 0) + ',' + ((p.y / r) | 0); let c = g.get(k); if (!c) g.set(k, c = []); c.push(p); }
    // double density relaxation
    for (const p of L) {
      const cx = (p.x / r) | 0, cy = (p.y / r) | 0, nb = [];
      let dens = 0, dnear = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of g.get((cx + i) + ',' + (cy + j)) || []) {
        if (q === p) continue; const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d >= r || d < 1e-6) continue;
        const k = 1 - d / r; dens += k * k; dnear += k * k * k; nb.push([q, dx / d, dy / d, k]);
      }
      const P = this.stiff * (dens - this.rest * .1) * r * r, Pn = this.nearK * dnear * r * r;
      let ox = 0, oy = 0;
      for (const [q, nx, ny, k] of nb) {
        const D = (P * k + Pn * k * k) * h * h * 60 * 60 * .5; q.x += nx * D; q.y += ny * D; ox -= nx * D; oy -= ny * D;
        if (this.viscosity) { const u = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny; if (u > 0) { const I = h * k * this.viscosity * u * .5; p.vx -= nx * I; p.vy -= ny * I; q.vx += nx * I; q.vy += ny * I; } }
      }
      p.x += ox; p.y += oy;
    }
    const B = this.bounds, rr = r * .25;
    for (const p of L) {
      for (const s of this.solids) {
        if (s.kind === 'circle') { const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy), m = s.r + rr; if (d < m && d > 1e-6) { p.x = s.x + dx / d * m; p.y = s.y + dy / d * m; } }
        else if (p.x > s.x - rr && p.x < s.x + s.w + rr && p.y > s.y - rr && p.y < s.y + s.h + rr) { const l = p.x - s.x + rr, rt = s.x + s.w + rr - p.x, t = p.y - s.y + rr, bt = s.y + s.h + rr - p.y, m = Math.min(l, rt, t, bt); if (m === l) p.x = s.x - rr; else if (m === rt) p.x = s.x + s.w + rr; else if (m === t) p.y = s.y - rr; else p.y = s.y + s.h + rr; }
      }
      if (p.x < B[0] + rr) p.x = B[0] + rr; if (p.x > B[2] - rr) p.x = B[2] - rr; if (p.y < B[1] + rr) p.y = B[1] + rr; if (p.y > B[3] - rr) p.y = B[3] - rr;
      p.vx = (p.x - p.px) / h; p.vy = (p.y - p.py) / h;
    }
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Soft.prototype, 'update', 'soft things');
timed(Liquid.prototype, 'update', 'soft things');
