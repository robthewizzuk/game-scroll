// Spy and adventure gadgets: a grappling hook (fire at a point, reel in or swing), a zip line, and
// little hacking puzzles (rotate the wires, stop the lock on the mark, repeat the code). Thrown
// gadgets with an aim arc use gs.combat.arc and lob. The kit does the movement and the puzzle rules;
// your game draws the rope, the line and the puzzle.
//
//   const { Grapple, Zipline, Wires, Lock, Code } = gs.gadgets;
//   hook = new Grapple({ range: 14, reel: 12 });
//   on fire: hook.fire(hand, aimDir, ray)          // ray(from, dir, max) -> { point } (your own), or a gs.physics3d World3D; false if nothing in range
//   update(dt) { if (hook.attached) { const v = hook.update(dt, hero.pos, hero.vel, { reel: holding }); hero.setVel(v); } }
//   line = new Zipline(top, bottom); if (line.near(hero.pos)) line.ride(); line.update(dt) -> line.pos
//   puzzle = new Wires(5, 5, { seed }); tap a cell: puzzle.turn(c, r); puzzle.solved
//
// Positions and speeds are { x, y, z } (2D games leave out z; gravity then points along +y).

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const sub = (a, b) => V(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const len = a => Math.hypot(a.x, a.y, a.z || 0);
const scale = (a, k) => V(a.x * k, a.y * k, (a.z || 0) * k);
const add = (a, b) => V(a.x + b.x, a.y + b.y, (a.z || 0) + (b.z || 0));
const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
// v turned by the quaternion q
const turn = (v, q) => {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return V(ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x);
};

/**
 * A grappling hook. range: how far it reaches; reel: metres a second pulled in while reeling; swing:
 * true lets the hero swing on the rope (a pendulum constraint) when not reeling; flyTime: seconds the
 * hook takes to reach (it attaches after); mass: the hero's (kg), for what the rope does to loose things.
 * Fired at a gs.physics3d World3D, it hooks what it hits: the hook rides a body as it moves, and reeling in
 * a loose thing lighter than the hero pulls it to you (a crate off a ledge, a shield off a guard), while a
 * heavy one pulls you to it. hook.thing is what it holds (null for the level).
 */
export class Grapple {
  constructor({ range = 14, reel = 12, swing = true, flyTime = .12, min = 1, mass = 80 } = {}) { Object.assign(this, { range, reelSpeed: reel, swing, flyTime, min, mass }); this.attached = false; this.flying = 0; this.point = null; this.length = 0; this.thing = null; }
  /** Fires along dir. ray(from, dir, max) returns { point } or null, or ray is a World3D (not: your hero's body or mover there, which it passes through). True if it will hook something. */
  fire(from, dir, ray, not = null) {
    const world = typeof ray === 'function' ? null : ray, l = len(dir) || 1, d = scale(dir, 1 / l), hit = world ? world.ray(from, d, this.range, t => t !== not && !t.collider.isSensor()) : ray(from, d, this.range);
    if (!hit) { this.miss = { from, to: add(from, scale(d, this.range)) }; return false; }
    this.point = V(hit.point.x, hit.point.y, hit.point.z || 0); this.flying = this.flyTime; this.attached = false; this.length = len(sub(this.point, from)); this.miss = null;
    // on a body that moves: where on it, in its own turn, so the hook stays put on it
    const t = hit.thing; this.thing = null;
    if (t?.body?.translation && !t.fixed && !t.body.isFixed?.()) { const c = t.pos ?? t.body.translation(), q = t.body.rotation(); this.thing = t; this.local = turn(sub(this.point, c), { x: -q.x, y: -q.y, z: -q.z, w: q.w }); }
    return true;
  }
  release() { this.attached = false; this.flying = 0; this.point = null; this.thing = null; return this; }
  /**
   * Each frame while hooked: returns the hero's new velocity. reel: pull in now. gravity is applied
   * by your own physics; this keeps the rope from stretching and pulls when reeling.
   */
  update(dt, pos, vel, { reel = false } = {}) {
    const t = this.thing;
    if (t) { if (t.dead) { this.release(); return vel; } this.point = add(t.pos ?? t.body.translation(), turn(this.local, t.body.rotation())); }   // (the hook rides what it holds)
    if (this.flying > 0) { this.flying -= dt; if (this.flying <= 0) this.attached = true; return vel; }
    if (!this.attached) return vel;
    const to = sub(this.point, pos), d = len(to) || 1, n = scale(to, 1 / d);
    if (reel) { this.length = Math.max(this.min, this.length - this.reelSpeed * dt); }
    // a loose body takes its share of every pull (the lighter, the more), the hero the rest
    const m = t && !t.body.isKinematic?.() ? t.body.mass() : Infinity, mine = m === Infinity ? 1 : m / (m + this.mass), bv = t ? t.body.linvel() : V(), give = dv => { if (mine < 1) t.push(-dv.x * (1 - mine) / mine, -dv.y * (1 - mine) / mine, -dv.z * (1 - mine) / mine); };
    let v = { ...vel, z: vel.z || 0 };
    if (d > this.length) {
      // the rope is taut: take away speed going outwards and pull back to length
      const out = -dot(sub(v, bv), n); if (out > 0) { const dv = scale(n, out * mine); v = add(v, dv); give(scale(n, out * mine)); }
      const back = scale(n, (d - this.length) / Math.max(dt, 1e-3) * .5 * mine); v = add(v, back); give(back);
    }
    if (reel) { const pull = scale(n, Math.max(0, this.reelSpeed * .6 - dot(sub(v, bv), n)) * mine); v = add(v, pull); give(pull); }
    if (!this.swing && !reel) v = add(v, scale(n, Math.max(0, -dot(v, n))));
    if (d <= this.min + .05 && reel) this.arrived = true; else this.arrived = false;
    return v;
  }
}

/** A zip line from a (high) to b (low): ride() when near, then pos and speed follow the line; it lets go at the end. */
export class Zipline {
  constructor(a, b, { gravity = 20, drag = .15, grab = 1.2, hang = 1.1 } = {}) {
    Object.assign(this, { a: V(a.x, a.y, a.z || 0), b: V(b.x, b.y, b.z || 0), gravity, drag, grab, hang }); this.t = 0; this.speed = 0; this.riding = false;
    this.L = len(sub(this.b, this.a)); this.dir = scale(sub(this.b, this.a), 1 / this.L);
  }
  /** Closest point on the line to p, and how far: { t, point, d }. */
  closest(p) { const t = Math.max(0, Math.min(1, dot(sub(p, this.a), this.dir) / this.L)), q = add(this.a, scale(this.dir, t * this.L)); return { t, point: q, d: len(sub(p, q)) }; }
  /** Can a hero at p (hands height above feet) grab it? */
  near(p, handsUp = 1.8) { const c = this.closest(add(p, V(0, handsUp, 0))); return c.d < this.grab; }
  ride(p = null, speed = 0) { this.riding = true; this.t = p ? this.closest(p).t : 0; this.speed = Math.max(0, speed); this.done = false; return this; }
  update(dt) {
    if (!this.riding) return this;
    const slope = -this.dir.y;   // going down the line speeds you up
    this.speed += (this.gravity * slope - this.drag * this.speed) * dt; this.speed = Math.max(.5, this.speed);
    this.t += this.speed * dt / this.L;
    if (this.t >= 1) { this.t = 1; this.riding = false; this.done = true; }
    return this;
  }
  /** Hands on the line now, and the feet below them. */
  get hands() { return add(this.a, scale(this.dir, this.t * this.L)); }
  get pos() { const h = this.hands; return V(h.x, h.y - this.hang - .7, h.z); }
  /** Velocity to carry on with when you let go. */
  get vel() { return scale(this.dir, this.speed); }
}

const rnd = seed => { let s = (seed ?? Math.random() * 2 ** 31) | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/**
 * A wire puzzle: turn tiles until power flows from the source (top left) to every tile. Each cell has
 * links (bits: 1 up, 2 right, 4 down, 8 left). turn(c, r) rotates a tile; lit(c, r) says if power
 * reaches it; solved when all are lit.
 */
export class Wires {
  constructor(cols = 5, rows = 5, { seed } = {}) {
    this.cols = cols; this.rows = rows; const R = rnd(seed); this.cells = new Array(cols * rows).fill(0);
    // a random spanning tree is always solvable
    const seen = new Set([0]), stack = [0];
    while (stack.length) {
      const i = stack[stack.length - 1], c = i % cols, r = (i / cols) | 0;
      const opts = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]].filter(([dc, dr]) => c + dc >= 0 && r + dr >= 0 && c + dc < cols && r + dr < rows && !seen.has((r + dr) * cols + c + dc));
      if (!opts.length) { stack.pop(); continue; }
      const [dc, dr, a, b] = opts[(R() * opts.length) | 0], j = (r + dr) * cols + c + dc;
      this.cells[i] |= a; this.cells[j] |= b; seen.add(j); stack.push(j);
    }
    this.answer = this.cells.slice();
    for (let i = 0; i < this.cells.length; i++) { const n = (R() * 4) | 0; for (let k = 0; k < n; k++) this.cells[i] = rot(this.cells[i]); }
    if (this.solved) this.cells[1 % this.cells.length] = rot(this.cells[1 % this.cells.length]);
    this.moves = 0; this.update();
  }
  get(c, r) { return this.cells[r * this.cols + c]; }
  turn(c, r) { const i = r * this.cols + c; if (i < 0 || i >= this.cells.length) return this; this.cells[i] = rot(this.cells[i]); this.moves++; return this.update(); }
  update() {
    const on = new Set([0]), q = [0];
    while (q.length) {
      const i = q.shift(), c = i % this.cols, r = (i / this.cols) | 0, v = this.cells[i];
      for (const [bit, dc, dr, back] of [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]]) {
        if (!(v & bit)) continue; const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const j = nr * this.cols + nc; if (on.has(j) || !(this.cells[j] & back)) continue; on.add(j); q.push(j);
      }
    }
    this.on = on; return this;
  }
  lit(c, r) { return this.on.has(r * this.cols + c); }
  get solved() { return this.on?.size === this.cells.length; }
}
const rot = v => ((v << 1) | (v >> 3)) & 15;

/** A timing lock: a marker sweeps round; stop() when it is inside the gap. pins: how many in a row; each gets narrower and faster. */
export class Lock {
  constructor({ pins = 3, speed = 2.2, gap = .55, shrink = .8, seed } = {}) { this.R = rnd(seed); Object.assign(this, { pins, speed, gap0: gap, shrink }); this.reset(); }
  reset() { this.pin = 0; this.a = 0; this.dir = 1; this.failed = false; this.place(); return this; }
  place() { this.gap = this.gap0 * Math.pow(this.shrink, this.pin); this.at = this.R() * Math.PI * 2; this.spd = this.speed * (1 + this.pin * .25); }
  update(dt) { if (!this.solved && !this.failed) this.a = (this.a + this.dir * this.spd * dt + Math.PI * 2) % (Math.PI * 2); return this; }
  /** Stop now: true if inside the gap (next pin, or solved). */
  stop() {
    const off = Math.abs(Math.atan2(Math.sin(this.a - this.at), Math.cos(this.a - this.at)));
    if (off <= this.gap / 2) { this.pin++; this.dir = -this.dir; if (!this.solved) this.place(); return true; }
    this.failed = true; return false;
  }
  get solved() { return this.pin >= this.pins; }
}

/** Repeat the code: show(len) makes a sequence of `keys` symbols; press(k) checks each. */
export class Code {
  constructor({ keys = 4, start = 3, seed } = {}) { this.R = rnd(seed); this.keys = keys; this.seq = []; for (let i = 0; i < start; i++) this.seq.push((this.R() * keys) | 0); this.i = 0; this.failed = false; }
  /** Adds one more to the sequence (for "longer each round"). */
  grow() { this.seq.push((this.R() * this.keys) | 0); this.i = 0; return this; }
  press(k) { if (this.failed || this.done) return false; if (k !== this.seq[this.i]) { this.failed = true; return false; } this.i++; return true; }
  get done() { return this.i >= this.seq.length; }
  retry() { this.i = 0; this.failed = false; return this; }
}
