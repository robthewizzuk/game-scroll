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
// A rival: new Driver(api, { skill: .7 }) in make(), then them.update(dt, rival.drive(dt, them, race)) each frame;
// rival.watch(dt, me, race) has it take the player's best lap as its line when that is quicker than its own.
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
import { linksFor, linked } from './links.js';
import { brainSlot } from './brains.js';

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
  constructor({ x = 0, y = 0, angle = 0, world = null, size = [34, 18], mass = 900, link = true, ...o } = {}) {
    super(o); world = linked(world, linksFor(null, link), 'world2d');   // (links.js: with none given, the 2D physics world the game made, made before the car; false: none)
    this.x = x; this.y = y; this.angle = angle; this.vx = 0; this.vy = 0; this.crash = null;
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
  constructor({ x = 0, y = 0, z = 0, heading = 0, gravity = 30, hop = 4, world = null, size = [1.3, .7, 2], clear = .25, fall = -20, link = true, ...o } = {}) {
    super({ top: 22, accel: 26, brakes: 50, turn: 2.4, ...o }); world = linked(world, linksFor(null, link), 'world');   // (links.js: with none given, the World3D the game made, made before the kart; false: none)
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

// ---------------------------------------------------------------- a ready-made driver

// What each checkpoint of a course asks of a car: which side is the inside of the bend, how far the course turns there
// (0: straight on) and how far it is to the next.
const bends = new WeakMap();
function bendsOf(race) {
  let g = bends.get(race); if (g && g.n === race.points.length) return g.list;
  const P = race.points, n = P.length, list = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const ux = a[0] - b[0], uy = a[1] - b[1], ul = Math.hypot(ux, uy) || 1, wx = c[0] - b[0], wy = c[1] - b[1], wl = Math.hypot(wx, wy) || 1;
    let nx = ux / ul + wx / wl, ny = uy / ul + wy / wl; const nl = Math.hypot(nx, ny);
    if (nl > 1e-6) { nx /= nl; ny /= nl; } else nx = ny = 0;
    list.push({ nx, ny, turn: Math.acos(clamp(-(ux * wx + uy * wy) / ul / wl, -1, 1)), len: wl });
  }
  bends.set(race, { n, list }); return list;
}
// The fastest a car can go round an arc of this radius (from how it turns: less at speed), with a little in hand for the slide.
const speedFor = (car, radius) => { const rt = radius * car.turn * .85; return Math.min(car.top, rt / (1 + .25 * rt / car.top)); };
const LINE = 64, KEPT = 2048;   // the points of a learned line, evenly spaced round the lap; the most samples kept of a lap as it is driven

// A lap as it was driven (m samples of x, y, speed) as LINE points evenly spaced along it, the end joined to the start.
function evenly(s, m) {
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) { const j = (i + 1) % m; cum[i + 1] = cum[i] + Math.hypot(s[j * 3] - s[i * 3], s[j * 3 + 1] - s[i * 3 + 1]); }
  const len = cum[m]; if (m < 8 || !(len > 0)) return null;
  const x = new Float32Array(LINE), y = new Float32Array(LINE), v = new Float32Array(LINE);
  for (let k = 0, i = 0; k < LINE; k++) {
    const d = len * k / LINE; while (i < m - 1 && cum[i + 1] < d) i++;
    const j = (i + 1) % m, t = (d - cum[i]) / (cum[i + 1] - cum[i] || 1);
    x[k] = s[i * 3] + (s[j * 3] - s[i * 3]) * t; y[k] = s[i * 3 + 1] + (s[j * 3 + 1] - s[i * 3 + 1]) * t; v[k] = s[i * 3 + 2] + (s[j * 3 + 2] - s[i * 3 + 2]) * t;
  }
  return { x, y, v };
}
// a line ready to drive: how far apart its points are
function lined(L) { let len = 0; for (let i = 0; i < LINE; i++) { const j = (i + 1) % LINE; len += Math.hypot(L.x[j] - L.x[i], L.y[j] - L.y[i]); } L.step = len / LINE || 1; return L; }

/**
 * A computer driver for a Car or a Kart on a Laps course. drive(dt, car, race) gives the input for the car's
 * update: { throttle, steer, brake, drift }. It works its speeds out from the car's own numbers (how it turns at
 * speed, how hard it brakes) and the course's bends: the inside of each checkpoint, as fast as the bend allows,
 * braking in time. Shown the player's car each frame (watch), it keeps their best lap, where they were and how fast
 * all the way round, and drives that line itself when it is quicker than its own way round. One Driver for each
 * rival car. It does not drift, and it knows nothing of walls or other cars but to back off when held up.
 */
export class Driver {
  /**
   * name: its save's name ('driver': one per course); skill: 0..1 (its pace, how close it cuts the bends and how
   * steady its hands are; a number, or a gs.brains.Dial that follows the player); learn: false for one that never
   * takes the player's line; rng.
   */
  constructor(api, opts = {}) {
    if (api && !api.brains && !api.score && arguments.length < 2) { opts = api; api = null; }
    this.name = String(opts.name || 'driver'); this.skill = opts.skill ?? .7; this.rnd = opts.rng || Math.random;
    this.learn = opts.learn !== false; this.slot = this.learn && opts.save !== false ? brainSlot(api, this.name) : null;
    this.line = null;      // the player's best lap: { time, n, x, y, v } round the course
    this.own = Infinity;   // its own best lap by the course's bends alone
    this.runs = new WeakMap(); this.wob = 0; this.using = false;
    if (this.slot) { try { this.unpack(this.slot.load()); } catch (_) {} }
  }
  // a car's place on the course: x, y (a kart's z), which way it points, and the sign its steering turns it by
  static at(car) {
    const kart = car.heading !== undefined && car.z !== undefined;
    const p = kart ? { x: car.x, y: car.z, fx: -Math.sin(car.heading), fy: -Math.cos(car.heading), sign: -1 } : { x: car.x, y: car.y, fx: Math.cos(car.angle), fy: Math.sin(car.angle), sign: 1 };
    // which way it is really going (a car slides wide of where it points): what it steers by, once it is moving
    const vx = car.vx || 0, vy = (kart ? car.vz : car.vy) || 0, v = Math.hypot(vx, vy), m = clamp(v / (car.top * .15) - 1, 0, 1) * (vx * p.fx + vy * p.fy > 0 ? 1 : 0);
    const gx = p.fx + (vx / (v || 1) - p.fx) * m, gy = p.fy + (vy / (v || 1) - p.fy) * m, gl = Math.hypot(gx, gy) || 1; p.gx = gx / gl; p.gy = gy / gl;
    return p;
  }
  // one car's lap as it is driven: where it was and how fast, and how long it has taken
  run(car) { let r = this.runs.get(car); if (!r) this.runs.set(car, r = { lap: car.lap | 0, t: 0, whole: false, s: new Float32Array(KEPT * 3), m: 0, every: 1, tick: 0, q: -1, frames: 0, led: 0 }); return r; }
  // steps a car's lap clock and notes where it is; on a new lap gives the lap just driven (null for a part lap)
  clock(dt, car, race) {
    if (!('next' in car)) race.join(car);
    const r = this.run(car), p = Driver.at(car); let lap = null;
    if ((car.lap | 0) !== r.lap) {
      const even = r.whole ? evenly(r.s, r.m) : null;
      if (even) lap = { time: r.t, frames: r.frames, led: r.led, ...even };
      r.lap = car.lap | 0; r.t = 0; r.whole = true; r.m = 0; r.every = 1; r.tick = 0; r.frames = 0; r.led = 0;
    }
    r.t += dt;
    if (r.tick++ % r.every === 0) {
      if (r.m === KEPT) { for (let i = 0; i < KEPT / 2; i++) { r.s[i * 3] = r.s[i * 6]; r.s[i * 3 + 1] = r.s[i * 6 + 1]; r.s[i * 3 + 2] = r.s[i * 6 + 2]; } r.m = KEPT / 2; r.every *= 2; }   // a long lap: every other one
      r.s[r.m * 3] = p.x; r.s[r.m * 3 + 1] = p.y; r.s[r.m * 3 + 2] = Math.abs(car.speed); r.m++;
    }
    return lap;
  }
  /**
   * Each frame, with the player's car (after race.update(car)): it keeps their best lap. True on the frame it takes
   * a new one. A lap counts from the second time across the line (the first starts from a standstill).
   */
  watch(dt, car, race) {
    if (!this.learn) return false;
    const lap = this.clock(dt, car, race); if (!lap || (this.line && lap.time >= this.line.time)) return false;
    this.line = lined({ time: lap.time, n: race.points.length, x: lap.x, y: lap.y, v: lap.v });
    this.save(); return true;
  }
  /** The player's best lap it holds, in seconds (Infinity: none), and its own best by the bends alone. */
  get best() { return { theirs: this.line ? this.line.time : Infinity, own: this.own }; }
  // is this line a lap of this course? (it passes every checkpoint; a save from another course does not) Also where
  // it passes each one: how far along the line, how far from the checkpoint's middle and which way that is.
  fits(L, race) {
    if (L.race === race) return L.ok;
    const P = race.points; let ok = L.n === P.length; L.cps = [];
    for (let i = 0; ok && i < P.length; i++) {
      const [cx, cy] = P[i]; let at = 0, d = Infinity, bx = 0, by = 0;
      for (let a = 0; a < LINE; a++) {
        const b = (a + 1) % LINE, dx = L.x[b] - L.x[a], dy = L.y[b] - L.y[a], t = clamp(((cx - L.x[a]) * dx + (cy - L.y[a]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const x = L.x[a] + dx * t, y = L.y[a] + dy * t, far = Math.hypot(x - cx, y - cy); if (far < d) { d = far; at = a + t; bx = x; by = y; }
      }
      ok = d <= race.radius * 1.1; L.cps.push({ at, d, ux: (cx - bx) / (d || 1), uy: (cy - by) / (d || 1) });
    }
    L.race = race; L.ok = ok; return ok;
  }
  // where a car is along the line (0..LINE), near where it was last frame; r.off is how far from the line it is
  place(L, r, p) {
    const look = (from, count) => {
      let best = -1, bd = Infinity;
      for (let c = 0; c < count; c++) {
        const a = ((from + c) % LINE + LINE) % LINE, b = (a + 1) % LINE, dx = L.x[b] - L.x[a], dy = L.y[b] - L.y[a];
        const t = clamp(((p.x - L.x[a]) * dx + (p.y - L.y[a]) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(L.x[a] + dx * t - p.x, L.y[a] + dy * t - p.y);
        if (d < bd) { bd = d; best = a + t; }
      }
      r.q = best; r.off = bd;
    };
    if (r.q >= 0 && r.on === L) look(Math.floor(r.q) - 1, 5);
    if (!(r.q >= 0) || r.on !== L || r.off > L.step * 2) look(0, LINE);
    r.on = L; return r.q;
  }
  /**
   * The input for its car this frame: car.update(dt, driver.drive(dt, car, race)), then race.update(car).
   * A Car or a Kart; the race is the Laps both cars are in.
   */
  drive(dt, car, race) {
    const lap = this.clock(dt, car, race), r = this.run(car);
    if (lap) {   // a lap of its own: by the bends, its own time; on the player's line, whether that was any quicker
      if (lap.led < lap.frames * .1) { if (lap.time < this.own) { this.own = lap.time; if (this.line) this.save(); } }
      else if (this.line && lap.time >= this.own && (this.line.slow = (this.line.slow | 0) + (lap.led > lap.frames * .9 ? 2 : 1)) >= 2) this.line.poor = true;
    }
    const k = clamp(isFinite(+this.skill) ? +this.skill : 1, 0, 1), P = race.points, n = P.length, G = bendsOf(race), R = race.radius, p = Driver.at(car);
    const i = car.next, c = G[i], cut = .2 + .5 * k, toNext = Math.hypot(P[i][0] - p.x, P[i][1] - p.y), pace = .72 + .28 * k, sp = Math.abs(car.speed);
    // the player's line, when it is quicker than its own way round (it needs a lap of its own to compare with) and while it is still on it
    const L = this.line && !this.line.poor && this.own < Infinity && this.line.time < this.own && this.fits(this.line, race) ? this.line : null;
    if (r.at !== i) { r.at = i; r.near = toNext; r.missed = false; } else r.near = Math.min(r.near, toNext);
    if (toNext > r.near + R * 1.5) r.missed = true;   // (driving away from the next checkpoint, it has missed it: back for the checkpoint itself)
    this.using = !!L && !r.missed;
    if (this.using) { this.place(L, r, p); if (r.off > Math.max(R * 2, L.step * 2)) this.using = false; }
    r.frames++; if (this.using) r.led++;
    let tx, ty, allowed;
    if (this.using) {
      // a point on the line ahead of it to steer for, at the speed the player had there (lower skill: slower through the slow parts), braking in time
      const at = q => { const a = Math.floor(q) % LINE, b = (a + 1) % LINE, t = q - Math.floor(q); return [L.x[a] + (L.x[b] - L.x[a]) * t, L.y[a] + (L.y[b] - L.y[a]) * t, L.v[a] + (L.v[b] - L.v[a]) * t]; };
      const mine = v => Math.max(v * pace, car.top - (car.top - v) / pace), there = at(r.q + (R * .5 + sp * .3) / L.step);
      // (a line that only clips the next checkpoint's circle leaves no room to follow it: it aims further in there, the more so the less steady its hands)
      const cp = L.cps[i]; let o = r.q + (R * .5 + sp * .3) / L.step - cp.at; o -= Math.round(o / LINE) * LINE;
      const pull = Math.abs(o) < 3.5 ? Math.max(0, cp.d - R * (.3 + .4 * k)) * (.5 + .5 * Math.cos(Math.PI * o / 3.5)) : 0;
      tx = there[0] + cp.ux * pull; ty = there[1] + cp.uy * pull; allowed = mine(at(r.q + sp * .1 / L.step)[2]) * 1.02;
      for (let j = 1; j <= 8; j++) { const a = Math.floor(r.q) + j, v = mine(L.v[a % LINE]); allowed = Math.min(allowed, Math.sqrt(v * v + 2 * car.brakes * .95 * (a - r.q) * L.step)); }
    } else {
      // the inside of the next checkpoint, as fast as its bend allows, braking in time for it and for the one after
      tx = P[i][0] + c.nx * R * cut; ty = P[i][1] + c.ny * R * cut;
      const d = Math.hypot(tx - p.x, ty - p.y), room = R * (.8 + .5 * k), stop = 2 * car.brakes * .8;
      const vc = speedFor(car, room / Math.max(.02, 1 / Math.cos(c.turn / 2) - 1)), c2 = G[(i + 1) % n], v2 = speedFor(car, room / Math.max(.02, 1 / Math.cos(c2.turn / 2) - 1));
      allowed = Math.min(Math.sqrt(vc * vc + stop * Math.max(0, d - R * .5)), Math.sqrt(v2 * v2 + stop * Math.max(0, d + c.len - R))) * pace;
    }
    // steer for it; when it can't turn onto it from here at this speed, slow until it can
    const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy) || 1, err = Math.atan2(p.gx * dy - p.gy * dx, p.gx * dx + p.gy * dy);
    if (Math.abs(err) > .2) allowed = Math.min(allowed, speedFor(car, dist / (2 * Math.max(.05, Math.abs(Math.sin(err))))) * pace);
    allowed = Math.max(car.top * .12, allowed);
    this.wob = this.wob * .92 + (this.rnd() - .5) * (1 - k) * .5;   // unsteady hands
    const steer = clamp(err * 3 + this.wob, -1, 1) * p.sign;
    // held up (a wall, another car): after a second of going nowhere it backs off, turned the other way
    if (sp > car.top * .3) r.moved = true;
    r.held = r.moved && sp < car.top * .05 && !(r.back > 0) ? (r.held || 0) + dt : 0;
    if (r.held > 1) { r.back = .7; r.held = 0; r.moved = false; }
    if (r.back > 0) { r.back -= dt; return { throttle: -1, brake: false, steer: -steer, drift: false }; }
    return { throttle: car.speed < allowed ? 1 : 0, brake: car.speed > allowed * 1.05, steer, drift: false };
  }
  /** The end of a race: did the player win? Tells a Dial given as its skill. */
  result(playerWon) { if (this.skill && typeof this.skill.result === 'function') this.skill.result(playerWon); return this; }
  /** Forgets the player's line (and its own lap time). */
  forget() { this.line = null; this.own = Infinity; this.save(); return this; }
  // the line as short text: the lap time, then each point as letters (where it was within the lap's bounds, and how fast)
  save() {
    if (!this.slot) return;
    try {
      const L = this.line; if (!L) { this.slot.save(''); return; }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, v1 = 1;
      for (let i = 0; i < LINE; i++) { x0 = Math.min(x0, L.x[i]); x1 = Math.max(x1, L.x[i]); y0 = Math.min(y0, L.y[i]); y1 = Math.max(y1, L.y[i]); v1 = Math.max(v1, L.v[i]); }
      const q = (a, lo, hi) => { let s = ''; for (let i = 0; i < LINE; i++) { const t = Math.round(clamp((a[i] - lo) / (hi - lo || 1), 0, 1) * 4095); s += B64[t >> 6] + B64[t & 63]; } return s; };
      this.slot.save(JSON.stringify({ v: 2, t: +L.time.toFixed(3), n: L.n, o: isFinite(this.own) ? +this.own.toFixed(3) : 0, b: [x0, x1, y0, y1, v1].map(z => +z.toFixed(2)), x: q(L.x, x0, x1), y: q(L.y, y0, y1), s: q(L.v, 0, v1) }));
    } catch (_) {}
  }
  unpack(text) {
    if (!text) return; const d = JSON.parse(text); if (!d || d.v !== 2 || !Array.isArray(d.b) || d.b.length !== 5) return;
    const [x0, x1, y0, y1, v1] = d.b.map(Number), u = (s, lo, hi) => { if (typeof s !== 'string' || s.length !== LINE * 2) return null; const a = new Float32Array(LINE); for (let i = 0; i < LINE; i++) { const t = B64.indexOf(s[i * 2]) * 64 + B64.indexOf(s[i * 2 + 1]); if (!(t >= 0)) return null; a[i] = lo + t / 4095 * (hi - lo); } return a; };
    const x = u(d.x, x0, x1), y = u(d.y, y0, y1), v = u(d.s, 0, v1);
    if (x && y && v && d.t > 0 && [x0, x1, y0, y1, v1].every(isFinite)) { this.line = lined({ time: +d.t, n: d.n | 0, x, y, v }); if (d.o > 0) this.own = +d.o; }
  }
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// per-frame work, timed while the frame lab is open (prof.js)
timed(Car.prototype, 'update', 'vehicles');
timed(Kart.prototype, 'update', 'vehicles');
