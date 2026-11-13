// Bullet patterns for shoot-'em-ups: thousands of bullets in flat arrays (no object per bullet, so no
// stutter from the garbage collector), patterns that fire rings, spreads, spirals and aimed bursts,
// bullets that speed up, curve, wave or turn to home in, a hit test with grazing (a near miss scores),
// and clearing the screen into points. Your game draws them (bullets.each) and keeps the rules.
//
//   const { Bullets, Emitter } = gs.bullets;
//   reset() {
//     shots = new Bullets({ max: 2000, w: W, h: H });
//     boss = new Emitter(shots, { every: .12, rotate: .21 }).ring(12, 90);        // a turning flower
//     aim = new Emitter(shots, { every: 1.2 }).spread(5, .6, 140, () => player);  // five at the player
//   }
//   update(dt) {
//     boss.update(dt, bx, by); aim.update(dt, bx, by); shots.update(dt);
//     const h = shots.hit(player.x, player.y, 3, 14);     // hit radius 3, graze radius 14
//     if (h.grazed) score += h.grazed; if (h.hit) api.over();
//   }
//   draw(c) { shots.each((x, y, kind) => { c.fillStyle = COLOURS[kind]; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); }); }
//
// A bullet: x, y, speed, angle, plus accel (speed per second), turn (radians per second), wave (side to
// side: [size, rate]), home (turn towards a target, radians per second), kind (a number for your own
// look and size), life (seconds).
import { timed } from './prof.js';

export class Bullets {
  /** max: most bullets at once; w, h: the play area (bullets leaving it, plus margin, are dropped). */
  constructor({ max = 2000, w = 360, h = 640, margin = 24 } = {}) {
    this.max = max; this.w = w; this.h = h; this.margin = margin; this.n = 0;
    const F = () => new Float32Array(max);
    Object.assign(this, { x: F(), y: F(), sp: F(), an: F(), acc: F(), turn: F(), wsz: F(), wrt: F(), home: F(), age: F(), life: F(), kind: new Uint8Array(max), grazed: new Uint8Array(max) });
    this.target = null;
  }
  /** Fires one bullet. o: { accel, turn, wave: [size, rate], home, kind, life, min, maxSpeed }. Returns its index or -1 when full. */
  fire(x, y, speed, angle, o = {}) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.sp[i] = speed; this.an[i] = angle; this.acc[i] = o.accel || 0; this.turn[i] = o.turn || 0;
    this.wsz[i] = o.wave?.[0] || 0; this.wrt[i] = o.wave?.[1] || 0; this.home[i] = o.home || 0; this.age[i] = 0; this.life[i] = o.life || 0;
    this.kind[i] = o.kind || 0; this.grazed[i] = 0;
    return i;
  }
  /** Removes bullet i (the last one moves into its place). */
  kill(i) { const j = --this.n; if (i === j) return; for (const k of ['x', 'y', 'sp', 'an', 'acc', 'turn', 'wsz', 'wrt', 'home', 'age', 'life', 'kind', 'grazed']) this[k][i] = this[k][j]; }
  /** Moves every bullet; target ({ x, y }) for homing ones. */
  update(dt, target = this.target) {
    const m = this.margin;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.home[i] && target) {
        const want = Math.atan2(target.y - this.y[i], target.x - this.x[i]); let d = want - this.an[i];
        d = Math.atan2(Math.sin(d), Math.cos(d)); const t = this.home[i] * dt; this.an[i] += Math.max(-t, Math.min(t, d));
      }
      this.an[i] += this.turn[i] * dt; this.sp[i] = Math.max(0, this.sp[i] + this.acc[i] * dt);
      let a = this.an[i]; if (this.wsz[i]) a += Math.sin(this.age[i] * this.wrt[i]) * this.wsz[i];
      this.x[i] += Math.cos(a) * this.sp[i] * dt; this.y[i] += Math.sin(a) * this.sp[i] * dt;
      if ((this.life[i] && this.age[i] >= this.life[i]) || this.x[i] < -m || this.y[i] < -m || this.x[i] > this.w + m || this.y[i] > this.h + m) this.kill(i);
    }
  }
  /** Calls fn(x, y, kind, angle, i) for each bullet (to draw it). */
  each(fn) { for (let i = 0; i < this.n; i++) fn(this.x[i], this.y[i], this.kind[i], this.an[i], i); }
  /**
   * Hit test against a circle (the player's small heart): { hit: index or -1, grazed: how many came
   * within graze for the first time }. The bullet that hits is removed. size(kind): a bullet's radius.
   */
  hit(x, y, r = 3, graze = 0, size = () => 4) {
    let hit = -1, grazed = 0;
    for (let i = this.n - 1; i >= 0; i--) {
      const dx = this.x[i] - x, dy = this.y[i] - y, d2 = dx * dx + dy * dy, br = size(this.kind[i]);
      if (d2 <= (r + br) ** 2) { hit = i; break; }
      if (graze && !this.grazed[i] && d2 <= (graze + br) ** 2) { this.grazed[i] = 1; grazed++; }
    }
    const out = { hit, grazed, x: hit >= 0 ? this.x[hit] : 0, y: hit >= 0 ? this.y[hit] : 0 };
    if (hit >= 0) this.kill(hit);
    return out;
  }
  /** Removes bullets in a circle (a bomb), or all of them; fn(x, y, kind) for each (turn them into points). Returns how many. */
  clear(fn = null, x = 0, y = 0, r = Infinity) {
    let k = 0;
    for (let i = this.n - 1; i >= 0; i--) { if ((this.x[i] - x) ** 2 + (this.y[i] - y) ** 2 > r * r) continue; fn?.(this.x[i], this.y[i], this.kind[i]); this.kill(i); k++; }
    return k;
  }
  get count() { return this.n; }
}

/**
 * A pattern fired again and again from where you say (update(dt, x, y)). Chain the shapes: ring,
 * spread, spiral and burst add to one volley. every: seconds between volleys; rotate: radians the
 * whole pattern turns each volley; times: how many volleys (Infinity); delay: seconds before the first.
 */
export class Emitter {
  constructor(bullets, { every = .5, rotate = 0, times = Infinity, delay = 0, o = {} } = {}) {
    Object.assign(this, { bullets, every, rotate, times, o }); this.parts = []; this.t = -delay; this.fired = 0; this.spin = 0; this.on = true;
  }
  /** n bullets evenly round a circle. o: bullet options (accel, turn, wave, home, kind, life). */
  ring(n, speed, o = {}) { this.parts.push((x, y, base) => { for (let i = 0; i < n; i++) this.bullets.fire(x, y, speed, base + i / n * Math.PI * 2, { ...this.o, ...o }); }); return this; }
  /** n bullets across an arc (radians) centred on aim: a number (angle), or a function giving { x, y } to aim at (the player). */
  spread(n, arc, speed, aim = Math.PI / 2, o = {}) {
    this.parts.push((x, y, base) => {
      const a0 = this.aimAt(aim, x, y) + base;
      for (let i = 0; i < n; i++) this.bullets.fire(x, y, speed, n > 1 ? a0 - arc / 2 + arc * i / (n - 1) : a0, { ...this.o, ...o });
    });
    return this;
  }
  /** arms bullets each volley, the pattern turning by step radians each time (with rotate, a spiral). */
  spiral(arms, speed, step = .25, o = {}) { let a = 0; this.parts.push((x, y, base) => { for (let i = 0; i < arms; i++) this.bullets.fire(x, y, speed, base + a + i / arms * Math.PI * 2, { ...this.o, ...o }); a += step; }); return this; }
  /** n bullets in a line at the target, each a little slower (a stream that arrives together as a burst). */
  burst(n, speed, aim, slow = .08, o = {}) { this.parts.push((x, y, base) => { const a = this.aimAt(aim, x, y) + base; for (let i = 0; i < n; i++) this.bullets.fire(x, y, speed * (1 - i * slow), a, { ...this.o, ...o }); }); return this; }
  /** Your own volley: fn(bullets, x, y, angle, volley number). */
  custom(fn) { this.parts.push((x, y, base) => fn(this.bullets, x, y, base, this.fired)); return this; }
  aimAt(aim, x, y) { if (typeof aim === 'number') return aim; const t = typeof aim === 'function' ? aim() : aim; return t ? Math.atan2(t.y - y, t.x - x) : Math.PI / 2; }
  /** Fires the volleys due. Returns how many it fired. */
  update(dt, x, y) {
    if (!this.on || this.fired >= this.times) return 0;
    this.t += dt; let k = 0;
    while (this.t >= 0 && this.fired < this.times) {
      for (const p of this.parts) p(x, y, this.spin);
      this.spin += this.rotate; this.fired++; this.t -= this.every; k++;
    }
    return k;
  }
  get done() { return this.fired >= this.times; }
  reset() { this.t = 0; this.fired = 0; this.spin = 0; return this; }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Bullets.prototype, 'update', 'bullets');
