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
//
// In a gs.physics3d World3D a kart is solid (new Kart({ world, size: [w, h, l] })): it drives on whatever is solid
// there (ramps, bridges, crates; no ground function needed), slides along walls and bounces off them when it hits
// hard, shoves loose crates and cones out of its way, bumps other karts, and rays and onHit see it. kart.crash is
// what it ran into this frame ({ thing, normal, point, speed }) for a sound or a shake; kart.rider is its body.
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

/**
 * A top-down car on a flat 2D world. x, y, angle; update(dt, input); vx, vy is its real motion. world: a gs.physics
 * Physics with no gravity (a top-down one) to drive in, solid: it slides along walls and bounces off them when it hits
 * hard, shoves cones, crates and barrels, bumps other cars, and car.crash is what it ran into this frame ({ thing, nx,
 * ny, speed }); size: [length, width] in game units; car.thing is its body.
 */
export class Car extends Wheels {
  constructor({ x = 0, y = 0, angle = 0, world = null, size = [34, 18], mass = 900, ...o } = {}) {
    super(o); this.x = x; this.y = y; this.angle = angle; this.vx = 0; this.vy = 0; this.crash = null;
    if (world) { this.world = world; this.w = size[0]; this.h = size[1]; this.mass = mass; }
  }
  update(dt, input = {}) {
    const surface = input.surface ?? 1;
    this.angle += this.drive(dt, input);
    // the car points one way and moves another; grip pulls the motion round to where it points
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    const tvx = fx * this.speed, tvy = fy * this.speed;
    const g = (this.drifting ? this.driftGrip : this.grip) * surface, k = 1 - Math.exp(-g * dt);
    this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k;
    this.slide = Math.abs(-fy * this.vx + fx * this.vy);   // sideways speed: skid marks, tyre squeal
    if (this.world) return this.drivePhys(dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    return this;
  }
  // in a physics world: as far as it lets it go; a hard hit bounces it off, a glancing one slides it along
  drivePhys(dt) {
    const x0 = this.x, y0 = this.y, h = this.world.move(this, this.vx * dt, this.vy * dt, { angle: this.angle, mass: this.mass });
    const want = Math.hypot(this.vx, this.vy), ax = (this.x - x0) / dt, ay = (this.y - y0) / dt, got = Math.hypot(ax, ay);
    this.held = want > 1 && got < want * .5 ? (this.held || 0) + 1 : 0;
    if (this.held > 4) { this.vx = ax; this.vy = ay; this.speed = Math.sign(this.speed) * Math.min(Math.abs(this.speed), got + this.accel * dt); }   // (held up for a while: something too heavy to shove, or shoved against a wall; a cone only checks it for a frame)
    this.crash = null; let worst = null, into = 0;
    for (const k of h.hits) { const t = k.thing, loose = t && !t.fixed && !t.body.isKinematic() && t.mass < this.mass * 2; if (loose) continue; const v = -(this.vx * k.nx + this.vy * k.ny); if (v > into) { into = v; worst = k; } }
    if (worst) {
      this.crash = { thing: worst.thing, nx: worst.nx, ny: worst.ny, speed: into };
      if (into > this.top * .3) this.bump(worst.nx, worst.ny, { keep: .35 });
      else { this.vx += worst.nx * into; this.vy += worst.ny * into; this.speed *= 1 - Math.min(.5, into / this.top); }
    }
    return this;
  }
  /** Hit something: bounce back a little and lose speed. nx, ny: the wall's normal if you know it. */
  bump(nx, ny, { keep = .3 } = {}) {
    if (nx == null) { if (!this.world) { this.x -= this.vx * .03; this.y -= this.vy * .03; } this.vx *= -keep; this.vy *= -keep; }
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
  /**
   * x, y, z, heading; gravity; hop (jump speed). world: a gs.physics3d World3D to drive in, solid (see above), with
   * size: [width, height, length] of its body (metres), clear: the gap under its body (a kerb or a ramp's lip lower
   * than this is driven up, anything taller is a wall) and fall: the height below which it has fallen off (-20).
   */
  constructor({ x = 0, y = 0, z = 0, heading = 0, gravity = 30, hop = 4, world = null, size = [1.3, .7, 2], clear = .25, fall = -20, ...o } = {}) {
    super({ top: 22, accel: 26, brakes: 50, turn: 2.4, ...o });
    Object.assign(this, { x, y, z, heading, gravity, hopSpeed: hop, vx: 0, vy: 0, vz: 0, onGround: true, lean: 0, pitch: 0, airTime: 0, landed: false, fell: false, fallY: fall, crash: null });
    if (world) {
      this.world = world; this.clear = clear; this.len = size[2];
      this.rider = world.rider({ box: [size[0], Math.max(.1, size[1] - clear), size[2]], lift: clear, at: { x, y, z }, turn: heading, slope: 0, mass: 250, tag: 'kart' });
      this.rider.owner = this; this.at = [x, y, z];
    }
  }
  hop() { if (this.onGround) { this.vy = this.hopSpeed; this.onGround = false; } return this; }
  /** Puts it at (x, y, z) facing heading, at a standstill (a respawn, a new lap from the grid). */
  moveTo(x, y, z, heading = this.heading) {
    Object.assign(this, { x, y, z, heading, vx: 0, vy: 0, vz: 0, speed: 0, onGround: true, airTime: 0 });
    if (this.rider) { this.rider.place(x, y, z, heading); this.at = [x, y, z]; }
    return this;
  }
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
    if (this.rider) return this.ride(dt, turn, ground, fx, fz);
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
  // in a World3D: its body rides `clear` metres up, so kerbs, ramps and small things go under it and it finds the ground
  // itself with rays under its middle and its two axles (as a car's suspension does); what stands taller stops it
  ride(dt, turn, ground, fx, fz) {
    const r = this.rider, W = this.world, a = this.at, c = this.clear, h = this.len / 2 * .8;
    if (a && (a[0] !== this.x || a[1] !== this.y || a[2] !== this.z)) r.place(this.x, this.y, this.z, this.heading);   // (your game moved it itself)
    this.landed = false; this.fell = false; this.crash = null;
    const floor = (x, z, y) => {   // the highest ground under the kart at (x, z), reaching up to its clearance
      let best = null;
      for (const k of [0, h, -h]) { const g = ground ? ground(x + fx * k, z + fz * k) : W.floorAt(x + fx * k, y, z + fz * k, c, r); if (g != null && g <= y + c * .98 && (best == null || g > best)) best = g; }
      return best;
    };
    // where it means to go, on the ground there
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt, ny = this.y;
    const vy0 = this.vy - this.gravity * dt;
    const f0 = floor(nx, nz, this.y), want = this.y + vy0 * dt;
    ny = f0 != null && want <= f0 + .001 && vy0 <= 0 ? f0 : f0 != null && this.onGround && want - f0 < .3 && vy0 <= 0 ? f0 : want;
    r.move(nx, ny, nz, this.heading, dt);
    const p = r.pos; nx = p.x; nz = p.z;
    const wall = r.wall;
    if (wall) {   // ran into something: slide along it, or bounce off when it was head on and hard
      const n = wall.normal, l = Math.hypot(n.x, n.z) || 1, ux = n.x / l, uz = n.z / l, into = -(this.vx * ux + this.vz * uz);
      if (into > .2) {
        this.crash = { thing: wall.thing, normal: n, point: wall.point, speed: into };
        if (into > this.top * .3) this.bump(ux, uz, { keep: .35 });
        else { this.vx += ux * into; this.vz += uz * into; this.speed *= 1 - .7 * into / Math.max(into, Math.abs(this.speed)); }
      }
    }
    // up and down where it got to (as without a world, with the world's own ground)
    const fl = nx === this.x + this.vx * dt && nz === this.z + this.vz * dt ? f0 : floor(nx, nz, this.y);
    this.x = nx; this.z = nz; this.vy = vy0; this.y = Math.max(ny, Math.min(p.y, ny));
    if (fl != null && this.y <= fl + .001 && this.vy <= 0) {
      if (!this.onGround) { this.landed = true; this.impact = -this.vy; }
      this.y = fl; this.vy = 0; this.onGround = true; this.airTime = 0;
    } else if (fl != null && this.onGround && this.y - fl < .3 && this.vy <= 0) { this.y = fl; this.vy = 0; }   // stick to small dips
    else {
      if (this.vy > 0 && p.y < ny - .05) this.vy = 0;   // a roof over it
      this.onGround = false; this.airTime += dt; if (this.y < this.fallY) this.fell = true;
    }
    this.at = [this.x, this.y, this.z];
    // looks
    const lk = 1 - Math.exp(-10 * dt);
    this.lean += ((this.drifting ? -this.driftDir * .25 : -turn / Math.max(dt, 1e-4) * .05) - this.lean) * lk;
    if (this.onGround) {
      const a1 = ground ? ground(this.x + fx, this.z + fz) : W.floorAt(this.x + fx, this.y, this.z + fz, c, r), b1 = ground ? ground(this.x - fx, this.z - fz) : W.floorAt(this.x - fx, this.y, this.z - fz, c, r);
      if (a1 != null && b1 != null) this.pitch += (Math.atan2(a1 - b1, 2) - this.pitch) * lk;
    } else this.pitch += (clamp(this.vy * .03, -.4, .4) - this.pitch) * lk;
    return this;
  }
  bump(nx, nz, { keep = .3 } = {}) {
    if (nx == null) { if (!this.rider) { this.x -= this.vx * .03; this.z -= this.vz * .03; } this.vx *= -keep; this.vz *= -keep; }
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
