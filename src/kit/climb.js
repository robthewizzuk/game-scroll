// Climbing and traversal for 3D adventure games: grab ledges, shimmy along them, pull up and over,
// drop, leap to the next handhold in the direction you push, and swing on ropes. Ledges come from a
// gs.level3d level by themselves (the top edges of walls and raised floors), or you add your own.
// The kit says where the hero is and what they're doing; your game draws the poses (gs.poses has
// hang, shimmy and climb poses) and moves them with its own walker when they're on their feet.
//
//   const { Ledges, Climber, Rope } = gs.climb;
//   reset() {
//     ledges = Ledges.fromLevel(level);                               // or new Ledges().add(a, b, normal)
//     climb = new Climber(ledges, { height: 1.8 });
//   }
//   update(dt) {
//     if (climb.state === 'free') {                                    // on foot: your mover walks and jumps
//       hero.walk(...); if (climb.grab(hero.feet, hero.vy)) hero.stop();   // grabs a ledge in reach while jumping or falling
//     } else {
//       climb.update(dt, { x: stick.x, y: -stick.y, jump: jumpTapped });  // shimmy, climb up, drop, leap
//       hero.place(climb.pos);                                         // feet position
//       if (climb.state === 'free') hero.jump(climb.launch);           // let go: carry the speed on
//     }
//   }
//   climb.state: 'free' | 'hang' | 'shimmy' | 'up' | 'leap' | 'swing'; climb.facing (yaw towards the wall)
//
// Units are metres with y up, like the 3D styles. A ledge's normal points out from the wall.
// In the water: Swimmer (swim.js) wades, swims, dives with a breath and climbs out onto the bank.

export { Swimmer } from './swim.js';

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const lerp = (a, b, t) => a + (b - a) * t;
const L = (a, b, t) => V(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

/** The ledges (handholds) in a level: straight edges from a to b, with the way out from the wall. */
export class Ledges {
  constructor() { this.list = []; }
  /** Adds a ledge from a to b ({ x, y, z }); normal { x, z } points away from the wall. */
  add(a, b, normal, o = {}) { const len = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6; this.list.push({ a: V(a.x, a.y, a.z), b: V(b.x, b.y, b.z), n: { x: normal.x, z: normal.z }, len, ...o }); return this; }
  /**
   * Ledges along every top edge of a gs.level3d level that drops at least `min` metres to the open
   * side (walls, low walls and raised floors), joined along each run.
   */
  static fromLevel(level, { min = .9 } = {}) {
    const out = new Ledges(), s = level.size, x0 = level.x0, z0 = level.z0, top = (c, r) => level.top(level.ch(c, r));
    // one short edge per cell side that drops by min or more (or over a hole), then joined into runs
    const edges = [];
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      const h = top(c, r); if (h == null || h <= 0) continue;
      for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const o = top(c + dc, r + dr); if (o != null && h - o < min) continue;
        if (c + dc < 0 || r + dr < 0 || c + dc >= level.cols || r + dr >= level.rows) continue;
        const cx = x0 + (c + .5) * s + dc * s / 2, cz = z0 + (r + .5) * s + dr * s / 2;
        const a = V(cx - Math.abs(dr) * s / 2, h, cz - Math.abs(dc) * s / 2), b = V(cx + Math.abs(dr) * s / 2, h, cz + Math.abs(dc) * s / 2);
        edges.push({ a, b, n: { x: dc, z: dr } });
      }
    }
    const key = e => `${e.n.x},${e.n.z},${e.a.y},${e.n.x ? e.a.x : e.a.z}`;
    const groups = new Map(); for (const e of edges) { const k = key(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    for (const list of groups.values()) {
      const along = list[0].n.x ? 'z' : 'x'; list.sort((p, q) => p.a[along] - q.a[along]);
      let cur = null;
      for (const e of list) {
        if (cur && Math.abs(cur.b[along] - e.a[along]) < 1e-6) cur.b = e.b;
        else { if (cur) out.add(cur.a, cur.b, cur.n); cur = { a: e.a, b: e.b, n: e.n }; }
      }
      if (cur) out.add(cur.a, cur.b, cur.n);
    }
    return out;
  }
  /** The nearest point on a ledge: { ledge, t (0..1 along it), p, d (distance) }. */
  closest(p, filter = () => true) {
    let best = null;
    for (const l of this.list) {
      if (!filter(l)) continue;
      const ax = l.b.x - l.a.x, az = l.b.z - l.a.z, t = Math.max(0, Math.min(1, ((p.x - l.a.x) * ax + (p.z - l.a.z) * az) / (l.len * l.len)));
      const q = L(l.a, l.b, t), d = Math.hypot(p.x - q.x, (p.y - q.y) * .7, p.z - q.z);
      if (!best || d < best.d) best = { ledge: l, t, p: q, d };
    }
    return best;
  }
}

/**
 * Climbs on Ledges. height: the hero's height; reach: how far hands reach to grab; shimmy: metres a
 * second along a ledge; leap: furthest jump between handholds; upTime: seconds to pull up and over.
 */
export class Climber {
  constructor(ledges, { height = 1.8, reach = .6, shimmy = 1.4, leap = 2.6, upTime = .55, leapTime = .45, out = .35 } = {}) {
    Object.assign(this, { ledges, height, reach, shimmySpeed: shimmy, leapReach: leap, upTime, leapTime, out });
    this.state = 'free'; this.pos = V(); this.launch = 0; this.facing = 0; this.ledge = null; this.t = 0; this.k = 0; this.cool = 0; this.rope = null; this.events = [];
  }
  /** Where the feet hang below a point on a ledge. */
  hangAt(l, t) { const p = L(l.a, l.b, t); return V(p.x + l.n.x * this.out, p.y - this.height * 1.02, p.z + l.n.z * this.out); }
  /** Try to grab a ledge from on foot (feet position, vertical speed). True if it took hold. */
  grab(feet, vy = -1) {
    if (this.state !== 'free' || this.cool > 0) return false;
    const hands = V(feet.x, feet.y + this.height, feet.z), c = this.ledges.closest(hands);
    if (!c || c.d > this.reach || hands.y > c.p.y + .45 || hands.y < c.p.y - this.reach) return false;
    if (vy > 2) return false;   // only while falling or near the top of a jump
    this.hang(c.ledge, c.t); this.events.push('grab'); return true;
  }
  hang(l, t) { this.state = 'hang'; this.ledge = l; this.t = t; this.pos = this.hangAt(l, t); this.facing = Math.atan2(l.n.x, l.n.z) + Math.PI; }
  /** input: x sideways (-1..1, right is +), y up (+) / down (-), jump (tapped this frame). */
  update(dt, input = {}) {
    this.events.length = 0; this.cool = Math.max(0, this.cool - dt);
    const { x = 0, y = 0, jump = false } = input;
    if (this.state === 'hang' || this.state === 'shimmy') {
      const l = this.ledge;
      if (jump) return this.leapOrKick(x, y);
      if (y > .6) { this.state = 'up'; this.k = 0; this.from = this.pos; const p = L(l.a, l.b, this.t); this.to = V(p.x - l.n.x * .45, p.y, p.z - l.n.z * .45); this.events.push('up'); return this; }
      if (y < -.6) return this.letGo(0);
      if (Math.abs(x) > .2) {
        // the wall's right-hand direction as the hero faces it
        const rx = -l.n.z, rz = l.n.x, ax = (l.b.x - l.a.x) / l.len, az = (l.b.z - l.a.z) / l.len, sign = Math.sign(rx * ax + rz * az) || 1;
        let t = this.t + sign * x * this.shimmySpeed * dt / l.len;
        if (t < 0 || t > 1) {
          const end = t < 0 ? l.a : l.b, next = this.ledges.closest(end, o => o !== l);
          if (next && next.d < .35 && Math.abs(next.p.y - end.y) < .1) { this.ledge = next.ledge; this.t = next.t; this.events.push('corner'); }
          else t = Math.max(0, Math.min(1, t));
        }
        if (this.ledge === l) this.t = t;
        this.state = 'shimmy';
      } else this.state = 'hang';
      this.pos = this.hangAt(this.ledge, this.t); this.facing = Math.atan2(this.ledge.n.x, this.ledge.n.z) + Math.PI;
    } else if (this.state === 'up') {
      this.k = Math.min(1, this.k + dt / this.upTime);
      const e = this.k < .6 ? this.k / .6 : 1;   // up first, then over
      this.pos = V(lerp(this.from.x, this.to.x, this.k), lerp(this.from.y, this.to.y, e), lerp(this.from.z, this.to.z, this.k));
      if (this.k >= 1) { this.state = 'free'; this.launch = 0; this.cool = .3; this.events.push('stand'); }
    } else if (this.state === 'leap') {
      this.k = Math.min(1, this.k + dt / this.leapTime);
      const p = L(this.from, this.to, this.k); p.y += Math.sin(this.k * Math.PI) * .6; this.pos = p;
      if (this.k >= 1) { this.hang(this.target.ledge, this.target.t); this.events.push('catch'); }
    } else if (this.state === 'swing') {
      this.rope.update(dt, x); this.pos = this.rope.feet(this.height);
      if (jump) { const v = this.rope.release(); this.state = 'free'; this.launch = Math.max(3, v.y + 4); this.fling = v; this.cool = .4; this.rope = null; this.events.push('release'); }
    }
    return this;
  }
  /** Jump while hanging: to the best handhold the way you push, or off the wall. */
  leapOrKick(x, y) {
    const l = this.ledge, here = L(l.a, l.b, this.t), rx = -l.n.z, rz = l.n.x;
    const want = V(rx * x, y, rz * x), wl = Math.hypot(want.x, want.y, want.z);
    let best = null, bs = -Infinity;
    if (wl > .3) for (const o of this.ledges.list) {
      const c = this.ledges.closest(V(here.x + want.x / wl * this.leapReach * .6, here.y + want.y / wl * this.leapReach * .6, here.z + want.z / wl * this.leapReach * .6), q => q === o);
      if (!c || (o === l && Math.abs(c.t - this.t) * l.len < .5)) continue;
      const d = V(c.p.x - here.x, c.p.y - here.y, c.p.z - here.z), dl = Math.hypot(d.x, d.y, d.z);
      if (dl > this.leapReach || dl < .4) continue;
      const score = (d.x * want.x + d.y * want.y + d.z * want.z) / (dl * wl) - dl * .1;
      if (score > .5 && score > bs) { bs = score; best = c; }
    }
    if (best) { this.state = 'leap'; this.k = 0; this.from = this.pos; this.target = best; this.to = this.hangAt(best.ledge, best.t); this.events.push('leap'); return this; }
    return this.letGo(5, true);
  }
  letGo(up = 0, kick = false) {
    const l = this.ledge; this.state = 'free'; this.launch = up; this.cool = .35;
    this.fling = kick ? V(l.n.x * 3, up, l.n.z * 3) : V(0, 0, 0);
    if (kick) this.pos = V(this.pos.x + l.n.x * .2, this.pos.y, this.pos.z + l.n.z * .2);
    this.events.push(kick ? 'kick' : 'drop'); this.ledge = null; return this;
  }
  /** Catch a rope (from on foot, mid-jump): rope is a Rope. */
  swing(rope, vel = V()) { this.state = 'swing'; this.rope = rope; rope.catch(this.pos, vel, this.height); this.events.push('rope'); return this; }
}

/**
 * A rope hanging from anchor that you swing on: a pendulum in the plane you caught it in. Push
 * (input -1..1) along the swing to pump higher. release() gives your velocity to carry on with.
 */
export class Rope {
  constructor(anchor, length = 4, { gravity = 20, pump = 2.5, damping = .05 } = {}) { Object.assign(this, { anchor: V(anchor.x, anchor.y, anchor.z), length, gravity, pump, damping }); this.a = 0; this.w = 0; this.dir = { x: 1, z: 0 }; }
  catch(feet, vel, height = 1.8) {
    const hx = feet.x - this.anchor.x, hz = feet.z - this.anchor.z, h = Math.hypot(hx, hz);
    const vh = Math.hypot(vel.x, vel.z);
    this.dir = h > .05 ? { x: hx / h, z: hz / h } : vh > .1 ? { x: vel.x / vh, z: vel.z / vh } : { x: 1, z: 0 };
    const hands = feet.y + height * .9; this.length = Math.max(1, Math.min(this.length, Math.hypot(h, this.anchor.y - hands)));
    this.a = Math.atan2(h, this.anchor.y - hands); this.w = ((vel.x * this.dir.x + vel.z * this.dir.z) || 0) / this.length;
  }
  update(dt, push = 0) {
    this.w += (-this.gravity / this.length * Math.sin(this.a) + push * this.pump * Math.cos(this.a) / this.length) * dt;
    this.w *= 1 - this.damping * dt; this.a += this.w * dt; this.a = Math.max(-1.4, Math.min(1.4, this.a));
    return this;
  }
  /** Where the hands are now. */
  get hands() { const s = Math.sin(this.a) * this.length; return V(this.anchor.x + this.dir.x * s, this.anchor.y - Math.cos(this.a) * this.length, this.anchor.z + this.dir.z * s); }
  feet(height = 1.8) { const h = this.hands; return V(h.x, h.y - height * .9, h.z); }
  release() { const v = this.w * this.length; return V(this.dir.x * v * Math.cos(this.a), v * Math.sin(this.a), this.dir.z * v * Math.cos(this.a)); }
}
