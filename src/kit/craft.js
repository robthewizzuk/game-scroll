// Planes, boats and things that fly or float. Arcade handling worked out in plain maths (no physics
// engine needed): a Plane with lift, stalls, banked turns, landing and crashing; a Boat that rides
// the waves of gs.outdoors.Water (or any water with height and normal); a Hover craft for drones and
// helicopters; and Floater, buoyancy for any gs.physics3d body so crates, barrels and rafts bob on
// waves. Noses point along -z, like three.js cameras. Your game draws the craft from pos and quat.
//
//   const { Plane, Boat, Hover, Floater } = gs.craft;
//   plane = new Plane({ at: { x: 0, y: 40, z: 0 }, speed: 30, ground: (x, z) => land.height(x, z) });
//   update(dt) { plane.update(dt, { throttle, pitch: stick.y, roll: stick.x }); mesh.position.copy(plane.pos); mesh.quaternion.copy(plane.quat); }
//   boat = new Boat(sea, { at: { x: 0, z: 0 } }); boat.update(dt, { throttle: 1, steer });
//   crate = world.box(mesh, 1, 1, 1); floats = new Floater(crate, sea, { size: [1, 1, 1] }); update: floats.update(dt) before world.step(dt)
//
// Touch tip: `assist` (0..1) levels the wings and nose when the stick is let go, so thumbs can fly.

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
// quaternion helpers (x, y, z, w)
const qmul = (a, b) => ({ x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z });
const qnorm = q => { const l = Math.hypot(q.x, q.y, q.z, q.w) || 1; return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; };
const qaxis = (ax, ay, az, a) => { const s = Math.sin(a / 2); return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(a / 2) }; };
const rot = (v, q) => {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return V(ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x);
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const yawQ = a => qaxis(0, 1, 0, a);

/**
 * A plane. power: thrust (m/s² at full throttle); lift: how much the wings carry; stall: speed
 * below which the wings let go (m/s); turn: pitch, roll and yaw rates (rad/s); assist: 0..1 auto
 * levelling for touch; ground(x, z): the ground height (null for none); gear: wheel height above it.
 * Events this frame in events[]: 'stall', 'land', 'touch', 'crash', 'takeoff'.
 */
export class Plane {
  constructor({ at = V(0, 30, 0), heading = 0, speed = 30, power = 14, lift = 1, drag = .0016, stall = 16, top = 70, turn = [1.2, 2.2, .5], assist = .6,
    grip = 2.5, gravity = 9.8, ground = null, gear = 1, crashSpeed = 7 } = {}) {
    Object.assign(this, { power, liftK: lift, drag, stallSpeed: stall, top, turn, assist, grip, gravity, ground, gear, crashSpeed });
    this.pos = V(at.x, at.y, at.z); this.quat = yawQ(-heading); this.vel = rot(V(0, 0, -speed), this.quat);
    this.throttle = .6; this.stalled = false; this.onGround = !!ground && at.y <= ground(at.x, at.z) + gear + .01; this.crashed = false; this.events = [];
  }
  get forward() { return rot(V(0, 0, -1), this.quat); }
  get up() { return rot(V(0, 1, 0), this.quat); }
  get right() { return rot(V(1, 0, 0), this.quat); }
  get speed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z); }
  /** Height above the ground (or above y = 0 without ground). */
  get altitude() { return this.pos.y - (this.ground ? this.ground(this.pos.x, this.pos.z) : 0); }
  /** Heading (radians, 0 = -z), pitch (nose up +) and bank (right wing down +). */
  get heading() { const f = this.forward; return Math.atan2(f.x, -f.z); }
  get pitch() { return Math.asin(clamp(this.forward.y, -1, 1)); }
  get bank() { const r = this.right; return -Math.asin(clamp(r.y, -1, 1)); }
  /** Stick input: throttle 0..1 (or leave out to keep it), pitch -1..1 (+ nose up), roll -1..1 (+ right), yaw -1..1, brake. */
  update(dt, { throttle = this.throttle, pitch = 0, roll = 0, yaw = 0, brake = false } = {}) {
    this.events.length = 0; if (this.crashed) return this;
    this.throttle = clamp(throttle, 0, 1);
    const sp = this.speed, auth = clamp(sp / (this.stallSpeed * 1.5), .15, 1);   // controls go soft when slow
    // auto-levelling when the stick is let go
    let p = pitch, r = roll;
    if (this.assist > 0 && !this.onGround) { if (Math.abs(roll) < .1) r = clamp(-this.bank * 1.5, -1, 1) * this.assist; if (Math.abs(pitch) < .1) p = clamp(-this.pitch * 2, -1, 1) * this.assist * .5; }
    const [tp, tr, ty] = this.turn;
    let q = this.quat;
    q = qmul(q, qaxis(1, 0, 0, p * tp * auth * dt));                 // pitch about the wing axis
    q = qmul(q, qaxis(0, 0, 1, -r * tr * auth * dt));                // roll about the nose
    q = qmul(q, qaxis(0, 1, 0, -yaw * ty * auth * dt));              // rudder
    if (!this.onGround) q = qmul(yawQ(-Math.sin(this.bank) * 1.1 * auth * dt), q);   // banked turn: tilted wings pull the nose round
    this.quat = qnorm(q);
    const f = this.forward, u = this.up, v = this.vel;
    // forces
    const along = dot(v, f), aoa = Math.atan2(-dot(v, u), Math.max(1, along));
    const stalled = !this.onGround && (along < this.stallSpeed || Math.abs(aoa) > .35);
    if (stalled && !this.stalled && !this.onGround) this.events.push('stall'); this.stalled = stalled && !this.onGround;
    const liftAcc = (stalled ? .25 : 1) * this.liftK * this.gravity * Math.min(1, (along * along) / (this.stallSpeed * this.stallSpeed * 1.6)) * (1 + Math.max(0, p) * .8);   // pulling back pulls g
    const thrust = this.throttle * this.power, dragA = this.drag * sp * sp + (brake && this.onGround ? 6 : 0);
    // lift acts at right angles to the motion, so it turns the plane's path but never adds speed
    let L = u; if (sp > .5) { const vh = V(v.x / sp, v.y / sp, v.z / sp), d = dot(u, vh), lx = u.x - vh.x * d, ly = u.y - vh.y * d, lz = u.z - vh.z * d, ll = Math.hypot(lx, ly, lz) || 1; L = V(lx / ll, ly / ll, lz / ll); }
    const a = V(f.x * thrust + L.x * liftAcc, f.y * thrust + L.y * liftAcc - this.gravity, f.z * thrust + L.z * liftAcc);
    if (sp > .01) { a.x -= v.x / sp * dragA; a.y -= v.y / sp * dragA; a.z -= v.z / sp * dragA; }
    v.x += a.x * dt; v.y += a.y * dt; v.z += a.z * dt;
    // arcade grip: no sliding sideways, and the path bends toward the nose (wings act like fins)
    if (!stalled) {
      const rt = this.right, sd = dot(v, rt), k = Math.min(1, this.grip * dt); v.x -= rt.x * sd * k; v.y -= rt.y * sd * k; v.z -= rt.z * sd * k;
      const ud = dot(v, u); v.x -= u.x * ud * k * .5; v.y -= u.y * ud * k * .5; v.z -= u.z * ud * k * .5;
    }
    const s2 = Math.hypot(v.x, v.y, v.z); if (s2 > this.top) { v.x *= this.top / s2; v.y *= this.top / s2; v.z *= this.top / s2; }
    this.pos.x += v.x * dt; this.pos.y += v.y * dt; this.pos.z += v.z * dt;
    // the ground
    const gy = (this.ground ? this.ground(this.pos.x, this.pos.z) : -Infinity) + this.gear;
    if (this.pos.y <= gy) {
      const level = Math.abs(this.bank) < .35 && this.pitch > -.2, soft = -v.y < this.crashSpeed;
      if (!level || !soft) { this.crashed = true; this.events.push('crash'); this.pos.y = gy; return this; }
      if (!this.onGround) this.events.push(this.speed > this.stallSpeed * .5 ? 'land' : 'touch');
      this.onGround = true; this.pos.y = gy; if (v.y < 0) v.y = 0;
      const fl = Math.hypot(f.x, f.z) || 1; this.quat = qnorm(qmul(yawQ(-Math.atan2(f.x / fl, -f.z / fl)), qaxis(1, 0, 0, Math.max(0, this.pitch))));
      const roll2 = (brake ? .97 : .998) ** (dt * 60); v.x *= roll2; v.z *= roll2;
    } else if (this.onGround && this.pos.y > gy + .3) { this.onGround = false; this.events.push('takeoff'); }
    return this;
  }
  /** Back in the air at a point, flying level. */
  reset(at, heading = 0, speed = 30) { this.pos = V(at.x, at.y, at.z); this.quat = yawQ(-heading); this.vel = rot(V(0, 0, -speed), this.quat); this.crashed = false; this.onGround = false; this.stalled = false; return this; }
}

/**
 * A boat on water (anything with height(x, z) and normal(x, z), like gs.outdoors.Water). power:
 * push (m/s²); top: top speed; turn: rudder strength; drift: how much it slides sideways (0..1);
 * length / width: hull size for how it pitches and rolls on the waves.
 */
export class Boat {
  constructor(water, { at = V(), heading = 0, power = 8, top = 16, turn = 1.4, drift = .25, drag = .6, length = 4, width = 1.8, draft = .2 } = {}) {
    Object.assign(this, { water, power, top, turnK: turn, drift, dragK: drag, length, width, draft });
    this.x = at.x; this.z = at.z; this.y = water.height(at.x, at.z); this.heading = heading; this.vx = 0; this.vz = 0; this.spin = 0; this.quat = yawQ(-heading); this.wake = []; this.air = 0;
  }
  get pos() { return V(this.x, this.y, this.z); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get forward() { return V(Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  /** throttle -1..1, steer -1..1 (+ right). */
  update(dt, { throttle = 0, steer = 0 } = {}) {
    const f = this.forward, r = V(-f.z, 0, f.x), w = this.water;
    const along = this.vx * f.x + this.vz * f.z, side = this.vx * r.x + this.vz * r.z;
    let na = along + throttle * this.power * dt * (throttle < 0 ? .5 : 1); na *= 1 - this.dragK * .1 * dt; na = clamp(na, -this.top * .4, this.top);
    const ns = side * Math.max(0, 1 - (1 - this.drift) * 6 * dt);
    this.vx = f.x * na + r.x * ns; this.vz = f.z * na + r.z * ns;
    this.spin += (steer * this.turnK * clamp(Math.abs(along) / 4, 0, 1) * Math.sign(along || 1) - this.spin) * Math.min(1, dt * 4);
    this.heading += this.spin * dt; this.x += this.vx * dt; this.z += this.vz * dt;
    // ride the waves: height from the middle, pitch and roll from bow, stern and sides
    const L = this.length / 2, W = this.width / 2, f2 = this.forward, r2 = V(-f2.z, 0, f2.x);
    const hb = w.height(this.x + f2.x * L, this.z + f2.z * L), hs = w.height(this.x - f2.x * L, this.z - f2.z * L), hr = w.height(this.x + r2.x * W, this.z + r2.z * W), hl = w.height(this.x - r2.x * W, this.z - r2.z * W);
    const target = (hb + hs + hr + hl) / 4 - this.draft;
    if (this.y > target + .05) { this.air += dt; this.y = Math.max(target, this.y - 9.8 * this.air * dt); } else { this.air = 0; this.y += (target - this.y) * Math.min(1, dt * 8); }
    const pitch = Math.atan2(hb - hs, this.length), roll = Math.atan2(hl - hr, this.width);
    this.quat = qnorm(qmul(qmul(yawQ(-this.heading), qaxis(1, 0, 0, pitch)), qaxis(0, 0, 1, roll)));
    // wake points behind the stern for your game to draw
    if (this.speed > 1) { this.wake.push({ x: this.x - f2.x * L, z: this.z - f2.z * L, life: 1.5 }); if (this.wake.length > 60) this.wake.shift(); }
    for (const p of this.wake) p.life -= dt; this.wake = this.wake.filter(p => p.life > 0);
    return this;
  }
}

/**
 * A hovering craft: helicopter, drone or jetpack. lift: throttle up/down; tilt the stick to fly
 * that way; yaw to turn. ground(x, z) for landing. Speeds are m/s.
 */
export class Hover {
  constructor({ at = V(0, 2, 0), heading = 0, climb = 6, speed = 14, accel = 6, turn = 1.8, tilt = .35, gravity = 9.8, ground = null } = {}) {
    Object.assign(this, { climb, top: speed, accel, turnK: turn, tiltMax: tilt, gravity, ground });
    this.pos = V(at.x, at.y, at.z); this.vel = V(); this.heading = heading; this.quat = yawQ(-heading); this.onGround = false; this.tiltX = 0; this.tiltZ = 0;
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  /** x, y: stick (-1..1; y + forward), up: -1..1 climb or sink, yaw: -1..1. */
  update(dt, { x = 0, y = 0, up = 0, yaw = 0 } = {}) {
    this.heading += yaw * this.turnK * dt;
    const s = Math.sin(this.heading), c = Math.cos(this.heading), wx = (x * c + y * s) * this.top, wz = (x * s - y * c) * this.top, k = Math.min(1, this.accel * dt / this.top * 2);
    this.vel.x += (wx - this.vel.x) * k; this.vel.z += (wz - this.vel.z) * k; this.vel.y += (up * this.climb - this.vel.y) * Math.min(1, dt * 3);
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
    const gy = this.ground ? this.ground(this.pos.x, this.pos.z) : 0;
    this.onGround = this.pos.y <= gy; if (this.onGround) { this.pos.y = gy; this.vel.y = Math.max(0, this.vel.y); }
    // lean into the way it's going
    this.tiltX += (y * this.tiltMax - this.tiltX) * Math.min(1, dt * 5); this.tiltZ += (-x * this.tiltMax - this.tiltZ) * Math.min(1, dt * 5);
    this.quat = qnorm(qmul(qmul(yawQ(-this.heading), qaxis(1, 0, 0, -this.tiltX)), qaxis(0, 0, 1, this.tiltZ)));
    return this;
  }
}

/**
 * Buoyancy for a gs.physics3d body: points around it that push up when under water and drag in it.
 * size: [w, h, d] of the body (8 corner points), or points: your own local points; float: how
 * strongly it floats (1 = half under, 2 = rides high); drag: water drag; gravity: the world's pull
 * (read from the body's World3D if left out).
 */
export class Floater {
  constructor(body, water, { size = [1, 1, 1], points = null, float = 1.2, drag = 1.5, spinDrag = 1, gravity = null } = {}) {
    const [w, h, d] = size;
    this.pull = gravity ?? Math.abs(body.world?.gravity?.y ?? 9.8);
    this.points = points || [-1, 1].flatMap(sx => [-1, 1].flatMap(sy => [-1, 1].map(sz => V(sx * w / 2, sy * h / 2, sz * d / 2))));
    Object.assign(this, { body, water, float, drag, spinDrag, h }); this.under = 0;
  }
  /** Call before world.step(dt). under: 0..1 of the points under water. */
  update(dt) {
    const b = this.body.body; if (!b) return this;
    const m = b.mass(), p = b.translation(), q = b.rotation(), v = b.linvel(), g = this.pull * this.float * 2 / this.points.length, at = this.body.world?.at || V(0, 0, 0);
    let n = 0;
    for (const lp of this.points) {
      const o = rot(lp, q), wp = V(p.x + o.x, p.y + o.y, p.z + o.z), depth = this.water.height(wp.x + at.x, wp.z + at.z) - wp.y;   // (wp: where Rapier has it, about the world's own centre in it: physics3d.js centre())
      if (depth <= 0) continue; n++;
      const k = Math.min(1, depth / Math.max(.1, this.h));
      b.applyImpulseAtPoint({ x: 0, y: g * k * m * dt, z: 0 }, wp, true);
    }
    this.under = n / this.points.length;
    if (n) {
      const k = this.drag * this.under * m * dt; b.applyImpulse({ x: -v.x * k, y: -v.y * k, z: -v.z * k }, true);
      const s = b.angvel(), ks = Math.max(0, 1 - this.spinDrag * this.under * dt); b.setAngvel({ x: s.x * ks, y: s.y * ks, z: s.z * ks }, true);
    }
    return this;
  }
}
