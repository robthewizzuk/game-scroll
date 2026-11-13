// Arcade vehicles that feel good without a physics engine: a top-down car that grips, slides and
// drifts, and a 3D kart that steers, hops, drifts for a boost and follows the ground. Your game gives
// the input and draws the car; the kit does speed, grip and turning. For real suspension and bodies
// tumbling over, World3D.vehicle() in gs.physics3d uses Rapier's ray-cast vehicle.
//
//   const { Car, Kart } = gs.vehicles;
//   reset() { car = new Car({ x: 180, y: 500, angle: -Math.PI / 2, top: 260 }); }
//   update(dt) {
//     car.update(dt, { throttle: gas ? 1 : 0, steer: stick.x, brake: brakeBtn.isDown, drift: held });
//     if (map.solidAt(car.x, car.y)) car.bump();                       // hit a wall: bounce back
//     if (car.drifting) skid(car.x, car.y);  if (car.boosted) feel.powerup(car.x, car.y);
//   }
//   draw(c) { c.save(); c.translate(car.x, car.y); c.rotate(car.angle); drawCar(c); c.restore(); }
//
// Angles are radians, 0 pointing along +x (Car) or -z (Kart, the way a three.js camera looks).
// Speeds are your game's units per second. Every option can be changed later (car.top = 320 for a
// power-up). surface: 0..1 grip under the wheels each frame (1 road, .4 grass, .1 ice).
import { timed } from './prof.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const toward = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

class Wheels {
  constructor(o) {
    Object.assign(this, {
      top: 220, reverse: .4, accel: 260, brakes: 520, roll: .6, turn: 2.6, grip: 8, driftGrip: 1.6,
      boostAfter: .7, boost: 1.35, boostTime: .9, minTurnSpeed: .15,
    }, o);
    this.speed = 0; this.slide = 0; this.drifting = false; this.driftDir = 0; this.driftTime = 0; this.boostLeft = 0;
    this.boosted = false; this.charge = 0;
  }
  /** Fraction of top speed, 0..1 (for engine sound and wind lines). */
  get pace() { return Math.min(1, Math.abs(this.speed) / this.top); }
  /** Starts a boost now (a pad on the track, a power-up). */
  kick(seconds = this.boostTime) { this.boostLeft = Math.max(this.boostLeft, seconds); this.boosted = true; return this; }
  /** Works out speed, steering and drift for one frame; returns the turn this frame (radians). */
  drive(dt, { throttle = 0, steer = 0, brake = false, drift = false, surface = 1 } = {}) {
    this.boosted = false;
    steer = clamp(steer, -1, 1); throttle = clamp(throttle, -1, 1);
    const boosting = this.boostLeft > 0; if (boosting) this.boostLeft -= dt;
    const top = this.top * (boosting ? this.boost : 1) * (.55 + .45 * surface);
    // speed
    if (brake && this.speed > 0) this.speed = toward(this.speed, 0, this.brakes * dt);
    else if (throttle > 0) this.speed = this.speed < 0 ? toward(this.speed, 0, this.brakes * dt) : toward(this.speed, top * throttle, this.accel * (boosting ? 2 : 1) * dt);
    else if (throttle < 0) this.speed = this.speed > 0 ? toward(this.speed, 0, this.brakes * dt) : toward(this.speed, -this.top * this.reverse, this.accel * .6 * dt);
    else this.speed = toward(this.speed, 0, this.top * this.roll * dt);
    if (this.speed > top) this.speed = toward(this.speed, top, this.accel * 1.5 * dt);
    // drift: hold drift while turning at speed; let go after long enough for a boost
    const fast = this.speed > this.top * .4;
    if (drift && fast && !this.drifting && Math.abs(steer) > .3) { this.drifting = true; this.driftDir = Math.sign(steer); this.driftTime = 0; }
    if (this.drifting && (!drift || !fast)) {
      this.charge = this.driftTime;
      if (this.driftTime >= this.boostAfter && !drift && fast) this.kick();
      this.drifting = false; this.driftDir = 0;
    }
    if (this.drifting) this.driftTime += dt;
    // turning: weaker when slow, wider while drifting with steer adjusting the arc
    const s = Math.abs(this.speed) / this.top, turnable = clamp(s / this.minTurnSpeed, 0, 1) * (1 - s * .25);
    const amount = this.drifting ? this.driftDir * (.65 + .45 * steer * this.driftDir) : steer;
    return amount * this.turn * turnable * Math.sign(this.speed || 1) * dt;
  }
}

/** A top-down car on a flat 2D world. x, y, angle; update(dt, input); vx, vy is its real motion. */
export class Car extends Wheels {
  constructor({ x = 0, y = 0, angle = 0, ...o } = {}) { super(o); this.x = x; this.y = y; this.angle = angle; this.vx = 0; this.vy = 0; }
  update(dt, input = {}) {
    const surface = input.surface ?? 1;
    this.angle += this.drive(dt, input);
    // the car points one way and moves another; grip pulls the motion round to where it points
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    const tvx = fx * this.speed, tvy = fy * this.speed;
    const g = (this.drifting ? this.driftGrip : this.grip) * surface, k = 1 - Math.exp(-g * dt);
    this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k;
    this.slide = Math.abs(-fy * this.vx + fx * this.vy);   // sideways speed: skid marks, tyre squeal
    this.x += this.vx * dt; this.y += this.vy * dt;
    return this;
  }
  /** Hit something: bounce back a little and lose speed. nx, ny: the wall's normal if you know it. */
  bump(nx, ny, { keep = .3 } = {}) {
    if (nx == null) { this.x -= this.vx * .03; this.y -= this.vy * .03; this.vx *= -keep; this.vy *= -keep; }
    else { const d = this.vx * nx + this.vy * ny; if (d < 0) { this.vx -= (1 + keep) * d * nx; this.vy -= (1 + keep) * d * ny; } }
    this.speed *= keep; return this;
  }
  /** Where a point on the car is in the world (forward, right in car units). For lights, exhaust, wheels. */
  point(forward, right = 0) { const c = Math.cos(this.angle), s = Math.sin(this.angle); return { x: this.x + c * forward - s * right, y: this.y + s * forward + c * right }; }
}

/**
 * A kart in 3D (x, y, z with y up). heading turns about y. ground(x, z) gives the floor height there
 * (a number, or null for a hole); without it the floor is y = 0. hop() jumps; holding drift as you
 * land from a hop starts a drift. lean and pitch tilt the model for show.
 */
export class Kart extends Wheels {
  constructor({ x = 0, y = 0, z = 0, heading = 0, gravity = 30, hop = 4, ...o } = {}) {
    super({ top: 22, accel: 26, brakes: 50, turn: 2.4, ...o });
    Object.assign(this, { x, y, z, heading, gravity, hopSpeed: hop, vx: 0, vy: 0, vz: 0, onGround: true, lean: 0, pitch: 0, airTime: 0, landed: false, fell: false });
  }
  hop() { if (this.onGround) { this.vy = this.hopSpeed; this.onGround = false; } return this; }
  update(dt, input = {}, ground = null) {
    const surface = input.surface ?? 1;
    const turn = this.drive(dt, this.onGround ? input : { ...input, throttle: 0, brake: false });
    this.heading += turn * (this.onGround ? 1 : .5);
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    if (this.onGround) {
      const g = (this.drifting ? this.driftGrip : this.grip) * surface, k = 1 - Math.exp(-g * dt);
      this.vx += (fx * this.speed - this.vx) * k; this.vz += (fz * this.speed - this.vz) * k;
    }
    this.slide = Math.abs(fz * this.vx - fx * this.vz);
    this.x += this.vx * dt; this.z += this.vz * dt;
    // up and down
    const floor = ground ? ground(this.x, this.z) : 0;
    this.landed = false; this.fell = false;
    this.vy -= this.gravity * dt; this.y += this.vy * dt;
    if (floor != null && this.y <= floor + .001 && this.vy <= 0) {
      if (!this.onGround) { this.landed = true; this.impact = -this.vy; }
      this.y = floor; this.vy = 0; this.onGround = true; this.airTime = 0;
    } else if (floor != null && this.onGround && this.y - floor < .3 && this.vy <= 0) { this.y = floor; this.vy = 0; }   // stick to small dips
    else { this.onGround = false; this.airTime += dt; if (floor == null && this.y < -20) this.fell = true; }
    // looks
    const lk = 1 - Math.exp(-10 * dt);
    this.lean += ((this.drifting ? -this.driftDir * .25 : -turn / Math.max(dt, 1e-4) * .05) - this.lean) * lk;
    if (ground && this.onGround) { const a = ground(this.x + fx, this.z + fz), b = ground(this.x - fx, this.z - fz); if (a != null && b != null) this.pitch += (Math.atan2(a - b, 2) - this.pitch) * lk; }
    else this.pitch += (clamp(this.vy * .03, -.4, .4) - this.pitch) * lk;
    return this;
  }
  bump(nx, nz, { keep = .3 } = {}) {
    if (nx == null) { this.x -= this.vx * .03; this.z -= this.vz * .03; this.vx *= -keep; this.vz *= -keep; }
    else { const d = this.vx * nx + this.vz * nz; if (d < 0) { this.vx -= (1 + keep) * d * nx; this.vz -= (1 + keep) * d * nz; } }
    this.speed *= keep; return this;
  }
  /** Copies position and turn to a three.js object (heading, then pitch and lean). */
  place(obj) { obj.position.set(this.x, this.y, this.z); obj.rotation.set(this.pitch, this.heading, this.lean, 'YXZ'); return this; }
}

/**
 * Laps and places on a loop of checkpoints [[x, y], ...] (2D) or [[x, z], ...] (Kart). Call
 * race.update(racer) each frame for each racer ({ x, y } or { x, z }); racer.lap, racer.progress
 * (laps as a float), race.places() gives racers in order. A racer must pass every checkpoint in order.
 */
export class Laps {
  constructor(points, { radius = 40, laps = 3 } = {}) { this.points = points; this.radius = radius; this.laps = laps; this.racers = []; }
  join(r) { r.lap = 0; r.next = 1 % this.points.length; r.done = false; r.progress = 0; this.racers.push(r); return r; }
  update(r) {
    if (!('next' in r)) this.join(r);
    const P = this.points, ry = r.z ?? r.y, [px, py] = P[r.next];
    if (Math.hypot(r.x - px, ry - py) < this.radius) {
      if (r.next === 0) { r.lap++; r.newLap = true; if (r.lap >= this.laps) r.done = true; }
      r.next = (r.next + 1) % P.length;
    } else r.newLap = false;
    const prev = P[(r.next - 1 + P.length) % P.length], segLen = Math.hypot(px - prev[0], py - prev[1]) || 1;
    const along = clamp(((r.x - prev[0]) * (px - prev[0]) + (ry - prev[1]) * (py - prev[1])) / segLen / segLen, 0, 1);
    const seg = (r.next - 1 + P.length) % P.length;
    r.progress = r.lap + (seg + along) / P.length;
    return r;
  }
  /** Racers in race order, leader first. */
  places() { return this.racers.slice().sort((a, b) => b.progress - a.progress); }
  /** Where the racer should aim next (for computer drivers): { x, y } and the angle to it from (x, y). */
  aim(r, ahead = 0) { const p = this.points[(r.next + ahead) % this.points.length]; return { x: p[0], y: p[1], angle: Math.atan2(p[1] - (r.z ?? r.y), p[0] - r.x) }; }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Car.prototype, 'update', 'vehicles');
timed(Kart.prototype, 'update', 'vehicles');
