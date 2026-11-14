// 3D physics for Console, Next Gen and AR games: real rigid bodies, collisions, ray casts and a
// character mover, from Rapier (rapier.rs, free, Apache-2.0). It works in the same units as your
// three.js scene (metres, y up), and keeps your meshes in step with their bodies.
//
//   const { World3D } = gs.physics3d;
//   reset() {
//     phys = new World3D({ gravity: -20 });               // make it in make() or reset(), like 2D physics
//     phys.ground(levelMesh);                             // solid, never moves: floors, walls, ramps (any mesh)
//     crate = phys.box(crateMesh, 1, 1, 1);               // a falling crate that tumbles; the mesh follows it
//     hero = phys.mover(heroMesh, { radius: .4, height: 1.8 });   // walks, climbs steps and slopes, can't go through walls
//   }
//   update(dt) {
//     hero.walk(stickX * 6, stickY * 6);                  // metres per second along x and z
//     if (tapped && hero.grounded) hero.jump(8);
//     phys.step(dt);                                      // moves everything and updates the meshes
//   }
//   phys.onHit((a, b, speed) => { if (speed > 4) gs.effects... });
//   const hit = phys.ray(from, dir, 50);                  // { thing, point, normal, distance, mesh } or null (mesh: the one hit, also inside a level made with ground())
//
// Like 2D physics the engine loads the first time a game needs it (the app waits for it).
//
// Far from the world's centre: Rapier works in 32-bit floats (about seven digits), so a body 20 km out is kept to
// about 2 mm and a stack of crates there jitters. The world keeps its bodies in Rapier about a centre of its own
// (world.at) that follows the view they are drawn in, which moves its own centre with the camera (src/kit/origin.js).
// Every place you give it or get from it is in the world's own numbers, so nothing changes for a game.

import { timed } from './prof.js';
import { lazy } from './lazy.js';
import { wasmSimd } from './simd.js';
import { Box3, Matrix4, Vector3 as V3, Quaternion } from 'three';
import { own } from './cleanup.js';
import { onBlend } from './tick.js';
import { rigDoll } from './ragdoll.js';
// The SIMD build where the phone has WebAssembly SIMD (faster: Neon on ARM phones), else the plain one.
// Same engine and API; only one of the two is ever downloaded.
const engine = lazy('The 3D physics engine', () => (wasmSimd() ? import('@dimforge/rapier3d-simd-compat') : import('@dimforge/rapier3d-compat')).then(async m => {
  const r = m.default?.init ? m.default : m;
  await r.init();
  return r;
}));
let R = null;
export const loadPhysics3D = () => engine.load().then(r => (R = r));
export const physics3DReady = () => engine.ready;

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const vec = v => Array.isArray(v) ? V(v[0], v[1], v[2]) : V(v?.x, v?.y, v?.z);
const ALL = 0xffff;

/** One body. pos and vel are plain { x, y, z }; set them with place() and setVel(). mesh follows it. */
class Body3 {
  constructor(world, body, collider, kind, mesh, tag) {
    this.world = world; this.body = body; this.collider = collider; this.kind = kind; this.mesh = mesh || null; this.tag = tag; this.dead = false;
    body.userData = this;
  }
  get pos() { return this.world.outer(this.body.translation()); }
  get vel() { return this.body.linvel(); }
  get spin() { return this.body.angvel(); }
  get speed() { const v = this.body.linvel(); return Math.hypot(v.x, v.y, v.z); }
  get fixed() { return this.body.isFixed(); }
  get sleeping() { return this.body.isSleeping(); }
  get mass() { return this.body.mass(); }
  place(x, y, z, quat) {
    const p = this.world.inner(typeof x === 'object' ? vec(x) : V(x, y, z)), q = typeof x === 'object' ? y : quat;
    if (this.body.isKinematic()) { this.body.setNextKinematicTranslation(p); if (q) this.body.setNextKinematicRotation(q); }
    else { this.body.setTranslation(p, true); if (q) this.body.setRotation(q, true); }
    return this;
  }
  setVel(x, y, z) { this.body.setLinvel(typeof x === 'object' ? vec(x) : V(x, y, z), true); return this; }
  setSpin(x, y, z) { this.body.setAngvel(typeof x === 'object' ? vec(x) : V(x, y, z), true); return this; }
  /** An instant change of speed in metres per second: push(0, 6, 0) is a hop. */
  push(x, y, z) { const m = this.body.mass(), v = typeof x === 'object' ? vec(x) : V(x, y, z); this.body.applyImpulse(V(v.x * m, v.y * m, v.z * m), true); return this; }
  /** Spins it up (radians per second about each axis). */
  twist(x, y, z) { const s = this.body.angvel(); this.body.setAngvel(V(s.x + x, s.y + y, s.z + z), true); return this; }
  touching() {
    const out = [];
    this.world.world.contactPairsWith(this.collider, c => { const t = c.parent()?.userData; if (t && t !== this) out.push(t); });
    return out;
  }
  remove() { this.world.remove(this); }
  sync() {
    if (!this.mesh) return;
    const p = this.body.translation(), q = this.body.rotation(), o = this.world.at;
    this.mesh.position.set(p.x + o.x, p.y, p.z + o.z); this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
}

/** A character that walks into walls without going through them, climbs steps and slopes and stays on the ground. */
class Mover {
  constructor(world, mesh, { radius = .4, height = 1.8, step = .35, slope = 50, gravity, at } = {}) {
    this.world = world; this.mesh = mesh || null; this.radius = radius; this.height = height;
    const p = at ? vec(at) : mesh ? vec(mesh.position) : V();
    this.half = Math.max(0, height / 2 - radius);   // mesh and `at` are the feet; the body is the middle
    const q = world.inner(p);
    this.body = world.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(q.x, q.y + height / 2, q.z));
    this.collider = world.world.createCollider(R.ColliderDesc.capsule(this.half, radius), this.body);
    this.body.userData = this; this.tag = 'mover'; this.kind = 'mover'; this.dead = false;
    this.ctl = world.world.createCharacterController(.02);
    this.ctl.enableAutostep(step, radius * .5, true);
    this.ctl.enableSnapToGround(step);
    this.ctl.setMaxSlopeClimbAngle(slope * Math.PI / 180);
    this.ctl.setApplyImpulsesToDynamicBodies(true);
    this.gravity = gravity ?? world.gravity.y;
    this.vx = 0; this.vy = 0; this.vz = 0; this.grounded = false; this.dx = 0; this.dz = 0;
    world.movers.push(this);
  }
  get pos() { return this.world.outer(this.body.translation()); }
  /** Walks at (vx, vz) metres per second this frame (call every update; 0, 0 stands still). */
  walk(vx, vz) { this.vx = vx; this.vz = vz; return this; }
  /** Jumps at `speed` metres per second (only does anything on the ground unless force is true). */
  jump(speed = 7, force = false) { if (this.grounded || force) { this.vy = speed; this.grounded = false; } return this; }
  /** Feet position. */
  get feet() { const p = this.body.translation(), o = this.world.at; return V(p.x + o.x, p.y - this.height / 2, p.z + o.z); }
  /** Moves it straight to (x, y, z), its feet. */
  place(x, y, z) { const p = this.world.inner(typeof x === 'object' ? vec(x) : V(x, y, z)); p.y += this.height / 2; this.body.setTranslation(p, true); this.body.setNextKinematicTranslation(p); this.vy = 0; return this; }
  move(dt) {
    this.vy += this.gravity * dt;
    if (this.grounded && this.vy < 0) this.vy = Math.max(this.vy, -2);
    const want = V(this.vx * dt, this.vy * dt, this.vz * dt);
    this.ctl.computeColliderMovement(this.collider, want, undefined, undefined, c => c !== this.collider && !c.isSensor());
    const m = this.ctl.computedMovement(), p = this.body.translation();
    this.grounded = this.ctl.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    if (want.y > 0 && m.y < want.y * .5) this.vy = 0;   // hit a ceiling
    this.dx = m.x; this.dz = m.z;
    this.body.setNextKinematicTranslation(V(p.x + m.x, p.y + m.y, p.z + m.z));
  }
  sync() {
    if (!this.mesh) return;
    const p = this.body.translation(), o = this.world.at; this.mesh.position.set(p.x + o.x, p.y - this.height / 2, p.z + o.z);
  }
  remove() { this.world.remove(this); }
}

/**
 * Something your own code moves (a kart, a boat, a drone, a plane, a lift that must not go through walls): a
 * kinematic body of its shape that slides along walls, pushes loose things out of its way and says what it ran
 * into. Rapier's character controller does the work, for any shape, so the arcade kits (gs.vehicles Kart, gs.craft
 * Boat, Hover and Plane) take a `world` and become part of it: rays and other bodies meet them, crates get shoved,
 * walls stop them. at: the middle of its underside (feet), like a Mover. lift: a gap under the shape (a car's
 * clearance: kerbs and ramps lower than it pass under the body, and your code finds the ground itself, as
 * gs.vehicles' Kart does with world.floorAt); with no lift it stands on the ground and climbs `step`s and `slope`s.
 */
class Rider {
  constructor(world, { box = null, ball = null, capsule = null, round = null, at, turn = 0, lift = 0, step = 0, slope = 40, snap = 0, mass = 200, push = true, tag = 'rider', sound } = {}) {
    this.world = world; this.mesh = null; this.kind = 'rider'; this.tag = tag; this.dead = false; this.owner = null;
    let desc;
    if (ball != null) { this.half = ball; desc = R.ColliderDesc.ball(ball); }
    else if (capsule) { const [r, h] = capsule; this.half = h / 2; desc = R.ColliderDesc.capsule(Math.max(0, h / 2 - r), r); }
    else {   // a box with rounded edges: a plain box catches on the seams of a flat floor and stops dead (measured: 44 of 60 frames)
      const [w, h, l] = box || [1, 1, 1], r = round ?? Math.min(.1, h * .25, w * .25, l * .25); this.half = h / 2;
      desc = R.ColliderDesc.roundCuboid(Math.max(.01, w / 2 - r), Math.max(.01, h / 2 - r), Math.max(.01, l / 2 - r), r);
    }
    this.lift = Math.max(GAP, lift);
    const p = world.inner(at ? vec(at) : V());
    this.body = world.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + this.half + this.lift, p.z).setRotation(yaw(turn)));
    this.collider = world.world.createCollider(desc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS).setFriction(.3), this.body);
    this.body.userData = this; if (sound) this.sound = sound;
    const c = this.ctl = world.world.createCharacterController(GAP);
    if (step > 0) c.enableAutostep(step, .1, false);
    if (snap > 0) c.enableSnapToGround(snap); this.snapping = snap;
    c.setMaxSlopeClimbAngle(slope * Math.PI / 180); c.setMinSlopeSlideAngle(Math.PI / 2);
    c.setApplyImpulsesToDynamicBodies(!!push); if (push) c.setCharacterMass(mass);
    this.from = this.body.translation(); this.to = null; this.q = yaw(turn);
    this.grounded = false; this.hits = []; this.moved = V(); this.vel = V();
    world.riders.push(this);
  }
  /** Its underside's middle (where you put its mesh), in the world's own numbers. */
  get pos() {
    const p = this.to || this.body.translation(), o = this.world.at, y = p.y - this.half - this.lift;
    // on the ground: the ground itself (Rapier lets a shape sink a few centimetres into a big flat floor; the mesh shouldn't)
    return V(p.x + o.x, this.grounded && this.floor != null && Math.abs(this.floor - y) < .15 ? this.floor : y, p.z + o.z);
  }
  /**
   * Moves it by (dx, dy, dz) metres as far as the world lets it, turned `turn` radians about y (or a quaternion
   * { x, y, z, w }). dt: the frame's seconds (how hard it shoves what it meets). After: pos (where it got to),
   * moved (how far it went), grounded (standing on something), hits ([{ thing, normal, point }]: what it ran
   * into this move, normal pointing out of the thing), wall (the first of those facing sideways). It goes there
   * over the next world.step(), smoothly. Hitting something fast is a World3D.onHit(rider, thing, speed) too.
   */
  slide(dx, dy, dz, turn = null, dt = 1 / 60) {
    if (this.dead) return this;
    if (!this.world.steps) this.world.queries();   // (a world made this frame: its floor is not yet where rays look)
    const W = this.world.world, t = this.body.translation(), from = this.to || t;
    if (this.grounded && this.snapping && dy < 0 && dy > -this.snapping) dy = 0;   // (on the ground, pressing down into it makes Rapier's slide stick: the snap keeps it down instead)
    if (turn != null) { this.q = typeof turn === 'number' ? yaw(turn) : turn; this.body.setRotation(this.q, false); }
    if (from !== t) this.body.setTranslation(from, false);   // (a second move in one frame starts where the first ended)
    const ts = W.timestep; W.timestep = Math.max(1 / 240, Math.min(dt, 1 / 15));
    this.ctl.computeColliderMovement(this.collider, V(dx, dy, dz), R.QueryFilterFlags.EXCLUDE_SENSORS);
    W.timestep = ts;
    const m = this.ctl.computedMovement(); this.grounded = this.ctl.computedGrounded();
    this.moved = V(m.x, m.y, m.z); const k = 1 / Math.max(1e-3, dt); this.vel = V(m.x * k, m.y * k, m.z * k);
    this.hits = [];
    for (let i = 0, n = this.ctl.numComputedCollisions(); i < n; i++) {
      const c = this.ctl.computedCollision(i); if (!c) continue;
      const thing = c.collider?.parent()?.userData || null, o = this.world.at;
      this.hits.push({ thing, normal: V(c.normal1.x, c.normal1.y, c.normal1.z), point: V(c.witness1.x + o.x, c.witness1.y, c.witness1.z + o.z) });
    }
    this.from = from; this.to = V(from.x + m.x, from.y + m.y, from.z + m.z);
    this.floor = this.grounded && this.lift <= GAP ? this.world.floorAt(this.to.x + this.world.at.x, this.to.y - this.half, this.to.z + this.world.at.z, .3, this) : null;
    const met = this.met ||= new Map();   // (what it is touching, and for how many frames it hasn't been: a contact that flickers as it slides along a wall is one hit)
    for (const [t, n] of met) if (n > 3) met.delete(t); else met.set(t, n + 1);
    for (const h of this.hits) {
      const t = h.thing; if (!t) continue;
      const was = met.has(t); met.set(t, 0); if (was) continue;
      const v = t.body && !t.fixed && t.vel ? t.vel : V(), n = h.normal, into = (dx * k - v.x) * -n.x + (dy * k - v.y) * -n.y + (dz * k - v.z) * -n.z;   // (as fast as it meant to go: what it got to was already cut short by the hit)
      this.world.met.push([this, t, Math.max(0, into), { at: h.point, normal: h.normal }]);
    }
    return this;
  }
  /** slide() to a point (its underside) as far as the world lets it. */
  move(x, y, z, turn = null, dt = 1 / 60) { const p = this.pos; return this.slide(x - p.x, y - p.y, z - p.z, turn, dt); }
  /** The first thing it ran into that faces more sideways than up (a wall, a crate, a kart), or null. */
  get wall() { for (const h of this.hits) if (Math.abs(h.normal.y) < .6) return h; return null; }
  /** Puts it straight at (x, y, z), its underside, turned `turn` (radians about y), with nothing in between. */
  place(x, y, z, turn = null) {
    if (typeof x === 'object') turn = y ?? null;
    const p = this.world.inner(typeof x === 'object' ? vec(x) : V(x, y, z)); p.y += this.half + this.lift;
    if (turn != null) { this.q = typeof turn === 'number' ? yaw(turn) : turn; this.body.setRotation(this.q, true); }
    this.body.setTranslation(p, true); this.body.setNextKinematicTranslation(p); this.from = p; this.to = null; this.vel = V(); this.grounded = false; return this;
  }
  // world.step(): a substep's share of the move, so what it meets is pushed at its real speed, not all in the first substep
  sub(i, n) {
    const a = this.from, b = this.to; if (!b) return;
    const k = (i + 1) / n; this.body.setNextKinematicTranslation(V(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k));
    this.body.setNextKinematicRotation(this.q);
  }
  stepped() { if (this.to) { this.from = this.to; this.to = null; } }
  remove() { this.world.remove(this); }
}
const GAP = .02;
// a collider description from a plain shape (World3D.shape, shapes): its own offset and turn in the body too
function shapeDesc(s) {
  const pts = h => h instanceof Float32Array ? h : new Float32Array(typeof h[0] === 'number' ? h : h.flatMap(p => [p.x, p.y, p.z]));
  const d = s.box ? R.ColliderDesc.cuboid(s.box[0] / 2, s.box[1] / 2, s.box[2] / 2)
    : s.ball != null ? R.ColliderDesc.ball(s.ball)
    : s.capsule ? R.ColliderDesc.capsule(Math.max(0, s.capsule[1] / 2 - s.capsule[0]), s.capsule[0])
    : s.hull ? R.ColliderDesc.convexHull(pts(s.hull)) : null;
  if (!d) throw new Error('shape() needs { box }, { ball }, { capsule } or { hull } (a hull with some volume)');
  if (s.off) { const f = vec(s.off); d.setTranslation(f.x || 0, f.y || 0, f.z || 0); }
  if (s.turn && typeof s.turn === 'object') d.setRotation(s.turn);
  return d;
}
const mulQ = (a, b) => ({ x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z });
const turnBy = (q, v) => { const u = mulQ(mulQ(q, { x: v.x || 0, y: v.y || 0, z: v.z || 0, w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w }); return V(u.x, u.y, u.z); };   // (the gap a mover or rider keeps from what it stands on)
const yaw = a => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

/**
 * A car with real suspension (Rapier's ray-cast vehicle): the chassis is a dynamic box that can roll
 * over, bounce off things and land jumps; four (or more) wheels are rays under it. drive() each frame.
 * wheels: meshes to spin and steer (optional, in the order front-left, front-right, back-left, back-right).
 */
class Vehicle3 {
  constructor(world, mesh, { w = 1.6, h = .5, l = 3, density = 1, wheels = [], radius = .38, rest = .35, travel = .3,
    stiffness = 30, damping = 4, grip = 2.5, power = 12, brakes = .3, steer = .5, at, tag = 'car', dents = true } = {}) {
    this.world = world; this.mesh = mesh || null; this.wheelMeshes = wheels; this.power = power; this.brakes = brakes; this.maxSteer = steer;
    this.chassis = world.box(mesh, w, h, l, { density, at, tag, drag: .1, spinDrag: .6 });
    this.ctl = world.world.createVehicleController(this.chassis.body);
    // a low centre of mass keeps it on its wheels in turns and under power (arcade, not a sim)
    const m = this.chassis.body.mass(); this.chassis.body.setAdditionalMassProperties(m, V(0, -h * 1.2, 0), V(m * l * l / 12, m * (w * w + l * l) / 12, m * w * w / 12), { x: 0, y: 0, z: 0, w: 1 }, true);
    this.ctl.indexUpAxis = 1; this.ctl.setIndexForwardAxis = 2;   // y up, the car's nose along -z (three.js forward); Rapier names this setter oddly
    const x = w / 2 - .05, y = -h / 2, z = l / 2 - radius * .9;
    for (const [px, pz] of [[-x, -z], [x, -z], [-x, z], [x, z]]) {
      this.ctl.addWheel(V(px, y, pz), V(0, -1, 0), V(-1, 0, 0), rest, radius);
      const i = this.ctl.numWheels() - 1;
      this.ctl.setWheelSuspensionStiffness(i, stiffness); this.ctl.setWheelSuspensionCompression(i, damping * .2); this.ctl.setWheelSuspensionRelaxation(i, damping * .25);
      this.ctl.setWheelMaxSuspensionTravel(i, travel); this.ctl.setWheelFrictionSlip(i, grip); this.ctl.setWheelSideFrictionStiffness(i, 1);
    }
    this.throttle = 0; this.steerNow = 0; this.braking = false; this.radius = radius;
    world.vehicles.push(this);
    // a gs.models vehicle dents, cracks its glass and breaks its lamps where it hits things by itself (dents: false: your own)
    if (dents && typeof mesh?.hit === 'function') world.onHit((a, b, speed, c) => {
      const other = a === this.chassis ? b : b === this.chassis ? a : null; if (!other || this.chassis.dead || speed < 3) return;
      if ((other.kind === 'floor' || other.tag === 'floor') && speed < 6) return;   // (a hard landing or a roll, not the road)
      const at = c?.at; if (at) mesh.hit(at, { power: Math.min(1.5, (speed - 2) / 12) });
    });
  }
  /** throttle -1..1, steer -1..1 (left is -1), brake true/false. Call every update. */
  drive(throttle = 0, steer = 0, brake = false) { this.throttle = throttle; this.steerTo = steer; this.braking = brake; return this; }
  /** Metres per second forward (negative going backwards). */
  get speed() { return -this.ctl.currentVehicleSpeed(); }
  /** True while any wheel touches the ground. */
  get grounded() { for (let i = 0; i < this.ctl.numWheels(); i++) if (this.ctl.wheelIsInContact(i)) return true; return false; }
  /** True when it's on its roof or side (offer a "flip back" button). */
  get upsideDown() { const q = this.chassis.body.rotation(); return 1 - 2 * (q.x * q.x + q.z * q.z) < .3; }
  /** Puts it back upright where it is, a little above the ground. */
  rightUp(lift = 1) { const p = this.chassis.pos; this.chassis.place(p.x, p.y + lift, p.z, { x: 0, y: 0, z: 0, w: 1 }); this.chassis.setVel(0, 0, 0).setSpin(0, 0, 0); return this; }
  step(h) {
    this.steerNow += ((this.steerTo || 0) * this.maxSteer - this.steerNow) * Math.min(1, h * 10);
    for (let i = 0; i < this.ctl.numWheels(); i++) {
      if (i < 2) this.ctl.setWheelSteering(i, -this.steerNow);
      this.ctl.setWheelEngineForce(i, -this.throttle * this.power * this.chassis.body.mass() / 4);   // power: metres per second² of push, all four wheels
      this.ctl.setWheelBrake(i, this.braking ? this.brakes * this.chassis.body.mass() : 0);
    }
    // sensors are left out by flag: asking each collider from inside this call (c.isSensor()) goes back into the engine while it
    // holds the colliders, which left sensors in and the world unable to be freed. The controller skips its own chassis by itself.
    this.ctl.updateVehicle(h, R.QueryFilterFlags.EXCLUDE_SENSORS);
  }
  sync() {
    this.wheelMeshes.forEach((m, i) => {
      if (!m || i >= this.ctl.numWheels()) return;
      const len = this.ctl.wheelSuspensionLength(i) ?? 0, cp = this.ctl.wheelChassisConnectionPointCs(i);
      m.position.set(cp.x, cp.y - len, cp.z);
      m.rotation.set(this.ctl.wheelRotation(i) ?? 0, i < 2 ? this.ctl.wheelSteering(i) ?? 0 : 0, 0, 'YXZ');
    });
  }
  remove() { if (this.ctl) { try { this.world.world.removeVehicleController(this.ctl); } catch (_) { /* gone */ } this.ctl = null; } this.world.vehicles = this.world.vehicles.filter(v => v !== this); this.chassis.remove(); }
}

export class World3D {
  /**
   * gravity: metres per second² (negative is down), or { x, y, z }. smooth: for games on a fixed
   * tick (`tick: 60`), meshes are drawn between the last two ticks so motion stays smooth on 90 and
   * 120 Hz screens (aim your camera in draw() from the meshes, not the bodies, so they agree).
   */
  constructor({ gravity = -20, smooth = false } = {}) {
    R = engine.get();
    this.R = R;
    this.gravity = typeof gravity === 'number' ? V(0, gravity, 0) : vec(gravity);
    this.world = new R.World(this.gravity);
    this.events = new R.EventQueue(true);
    own(this);   // freed when the card leaves the feed (src/kit/cleanup.js)
    this.bodies = []; this.movers = []; this.riders = []; this.met = []; this.hits = []; this.joints = []; this.vehicles = []; this.dolls = [];
    this.smooth = !!smooth && onBlend(this);
    /** Where Rapier's own centre is in the world (x and z, metres; y is always 0): see centre(). */
    this.at = V();
  }
  /** A place in the world's own numbers, as Rapier has it (about world.at). */
  inner(p) { const o = this.at; return o.x || o.z ? V(p.x - o.x, p.y, p.z - o.z) : V(p.x, p.y, p.z); }
  /** A place as Rapier has it, in the world's own numbers. */
  outer(p) { const o = this.at; return o.x || o.z ? V(p.x + o.x, p.y, p.z + o.z) : p; }
  /**
   * Keeps the bodies in Rapier about (x, z) from now on: Rapier's numbers are 32-bit, so a body far from the world's
   * centre is kept less finely than one near it (20 km out, to about 2 mm, and a stack there jitters). The world
   * does this by itself, following the centre of the view its bodies are drawn in (gs.hd's HD.origin); a game with
   * no view of its own can call it as its player goes far. Nothing moves in the world: every body, joint and ray
   * stays where it was, in the world's own numbers.
   */
  centre(x, z) {
    const o = this.at, dx = x - o.x, dz = z - o.z; if (!dx && !dz) return this;
    const W = this.world, keep = [], asleep = [];
    W.forEachRigidBody(b => {
      if (b.isSleeping()) asleep.push(b);
      const t = b.translation(), n = b.isKinematic() && b.nextTranslation();   // (where a lift was sent: read first, as setTranslation() sends it there too)
      b.setTranslation(V(t.x - dx, t.y, t.z - dz), false);
      if (n) keep.push([b, V(n.x - dx, n.y, n.z - dz)]);
    });
    for (const r of this.riders) for (const k of ['from', 'to']) if (r[k]) r[k] = V(r[k].x - dx, r[k].y, r[k].z - dz);   // (where a rider is going this frame)
    o.x = x; o.z = z;
    this.queries(keep, asleep);
    this.recentred = (this.recentred || 0) + 1;
    return this;
  }
  // Rapier finds things for rays and walking characters by boxes it only works out again as it steps: a step too short
  // to move anything puts them where the bodies now are (a kinematic body is held where it is for it, not sent flying).
  // Also for a world not stepped yet, whose first rider or mover would otherwise go through the floor it was made on.
  queries(keep = null, asleep = null) {
    const W = this.world;
    if (!keep) { keep = []; asleep = []; W.forEachRigidBody(b => { if (b.isSleeping()) asleep.push(b); const n = b.isKinematic() && b.nextTranslation(); if (n) keep.push([b, n]); }); }
    const ts = W.timestep; W.timestep = 1e-9; W.step(this.events); W.timestep = ts; this.events.drainCollisionEvents(() => {});
    for (const [b, n] of keep) b.setNextKinematicTranslation(n);
    for (const b of asleep) b.sleep();   // (that step wakes everything)
    this.steps = (this.steps || 0) + 1;
  }
  // the view the bodies are drawn in (its scene is where a body's mesh is), whose centre the world follows
  // (looked for now and then until found: a mesh is often added to the scene after its body is made)
  follow() {
    let v = this._view?.deref();
    if (!v && (this._look = (this._look || 0) + 1) % 30 === 1) {
      for (const t of this.movers.length ? [...this.movers, ...this.bodies] : this.bodies) {
        let m = t.mesh; if (!m) continue; while (m.parent) m = m.parent;
        if (m.gsView) { v = m.gsView; this._view = new WeakRef(v); break; }
      }
    }
    const c = v?.origin; if (c && (c.x !== this.at.x || c.z !== this.at.z)) this.centre(c.x, c.z);
  }
  /** (Fixed tick, smooth) puts each mesh between where its body was before the last step and now. */
  blend(a) {
    if (!this.smooth) return;
    for (const t of this.bodies) {
      const m = t.mesh, p = t._was, c = t._now; if (!m || !p || !c) continue;
      m.position.set(p.x + (c.x - p.x) * a, p.y + (c.y - p.y) * a, p.z + (c.z - p.z) * a);
      let { qx, qy, qz, qw } = c; if (p.qx * qx + p.qy * qy + p.qz * qz + p.qw * qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
      const x = p.qx + (qx - p.qx) * a, y = p.qy + (qy - p.qy) * a, z = p.qz + (qz - p.qz) * a, w = p.qw + (qw - p.qw) * a, n = Math.hypot(x, y, z, w) || 1;
      m.quaternion.set(x / n, y / n, z / n, w / n);
    }
    for (const t of this.movers) {
      const m = t.mesh, p = t._was, c = t._now; if (!m || !p || !c) continue;
      m.position.set(p.x + (c.x - p.x) * a, p.y + (c.y - p.y) * a - t.height / 2, p.z + (c.z - p.z) * a);
    }
  }
  /** Free the physics engine's memory for this world. The app does this when the card leaves the
   *  feed; a game can call it too, when it drops a world. Don't use the world afterwards. */
  free() {
    if (!this.world) return;
    try { this.events.free(); } catch (_) { /* already gone */ }
    for (const m of [...this.movers, ...this.riders]) if (m.ctl) try { this.world.removeCharacterController(m.ctl); } catch (_) { /* already gone */ }
    for (const v of this.vehicles) if (v.ctl) try { this.world.removeVehicleController(v.ctl); } catch (_) { /* already gone */ }
    this.world.free(); this.world = null;
  }
  make(mesh, desc, o, kind) {
    const D = o.fixed ? R.RigidBodyDesc.fixed() : o.moving ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    const p = this.inner(o.at ? vec(o.at) : mesh ? vec(mesh.position) : V());
    D.setTranslation(p.x, p.y, p.z).setLinearDamping(o.drag ?? 0).setAngularDamping(o.spinDrag ?? .05).setGravityScale(o.gravity ?? 1).setCcdEnabled(!!o.bullet);
    if (mesh?.quaternion) D.setRotation({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w });
    if (o.vel) { const v = vec(o.vel); D.setLinvel(v.x, v.y, v.z); }
    if (o.noSpin) D.lockRotations();
    const body = this.world.createRigidBody(D);
    desc.setDensity(o.density ?? 1).setFriction(o.friction ?? .5).setRestitution(o.bounce ?? .1).setSensor(!!o.sensor)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    if (o.group) { const bit = 1 << Math.max(0, Math.min(14, o.group)); desc.setCollisionGroups(((bit & ALL) << 16) | (ALL & ~bit)); }
    const collider = this.world.createCollider(desc, body);
    const b = new Body3(this, body, collider, kind, mesh, o.tag);
    if (o.sound) b.sound = o.sound;
    this.bodies.push(b); b.sync();
    return b;
  }
  /**
   * Options for every body: bounce, friction, density, fixed, moving (you place() it: lifts, doors),
   * sensor (reports hits, doesn't push: pickups, goals), bullet (fast), noSpin, drag, gravity
   * (multiplier), vel, group (1-14: same group never collide), at (start position if no mesh), tag, sound (what it
   * is made of, for gs.sound.Foley: 'wood', 'metal', 'stone'...; else read from its mesh).
   */
  ball(mesh, r = .5, o = {}) { return this.make(mesh, R.ColliderDesc.ball(r), o, 'ball'); }
  /** A box of full size w × h × d. */
  box(mesh, w = 1, h = 1, d = 1, o = {}) { return this.make(mesh, R.ColliderDesc.cuboid(w / 2, h / 2, d / 2), o, 'box'); }
  /** An upright capsule (pill): good for people and bottles. height includes the round ends. */
  capsule(mesh, radius = .4, height = 1.8, o = {}) { return this.make(mesh, R.ColliderDesc.capsule(Math.max(0, height / 2 - radius), radius), o, 'capsule'); }
  /** A dynamic body shaped like the mesh's outline (a convex hull of its points): rocks, gems, odd props. */
  hull(mesh, o = {}) {
    const { vertices } = meshData(mesh, false);
    const desc = R.ColliderDesc.convexHull(vertices); if (!desc) throw new Error('hull() needs a mesh with some volume');
    return this.make(mesh, desc, o, 'hull');
  }
  /**
   * A body of a plain shape: { box: [w, h, d] } | { ball: r } | { capsule: [r, h] } | { hull: points ([x, y, z, ...] or
   * [{ x, y, z }]) }, with off: { x, y, z } where the shape sits in the body and turn (a quaternion) how it is turned
   * there. The body starts where the mesh is (or o.at); options as for any body. For things whose look is not one
   * mesh: copies in gs.props, parts of a bigger model.
   */
  shape(mesh, spec, o = {}) { return this.make(mesh, shapeDesc(spec), o, spec.box ? 'box' : spec.ball != null ? 'ball' : spec.capsule ? 'capsule' : 'hull'); }
  /**
   * Many still shapes in one fixed body: a street's lamp posts, a forest's tree trunks, a yard of crates. list: shapes as for
   * shape(), each with at: { x, y, z } (where it is in the world), turn (radians about y, or a quaternion) and part (anything
   * of yours: ray() hits give it back as hit.part, and onHit / touching tell you the body). One body, so thousands cost
   * little. Returns it, with add(shape) (returns its part), drop(part) and set(part, at, turn) to change it later.
   */
  shapes(list = [], o = {}) {
    const p = this.inner(V()), body = this.world.createRigidBody((o.moving ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed()).setTranslation(p.x, p.y, p.z));
    const t = new Body3(this, body, null, 'shapes', null, o.tag ?? 'shapes'), by = new Map();
    if (o.sound) t.sound = o.sound;
    const place = (c, at, turn) => { const q = typeof turn === 'number' ? yaw(turn) : turn || { x: 0, y: 0, z: 0, w: 1 }, a = vec(at || V()), f = c.gsOff; const r = f ? turnBy(q, f) : V(); c.setTranslationWrtParent(V(a.x + r.x, a.y + r.y, a.z + r.z)); c.setRotationWrtParent(f?.turn ? mulQ(q, f.turn) : q); };
    t.add = s => {
      const d = shapeDesc({ ...s, off: null, turn: null }); if (!d) return null;
      d.setDensity(o.density ?? 1).setFriction(s.friction ?? o.friction ?? .5).setRestitution(s.bounce ?? o.bounce ?? .1).setSensor(!!(s.sensor ?? o.sensor)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      const c = this.world.createCollider(d, body), part = s.part ?? by.size;
      c.userData = part; c.gsOff = s.off ? { ...vec(s.off), turn: s.offTurn || null } : null; place(c, s.at, s.turn);
      by.set(part, c);
      if (t.gsStub) { this.world.removeCollider(t.gsStub, true); t.gsStub = null; t.collider = null; }
      t.collider ??= c; return part;
    };
    t.drop = part => {
      const c = by.get(part); if (!c) return t; by.delete(part);
      if (t.collider === c) { const n = by.values().next().value; if (n) t.collider = n; else if (!t.dead) { const d = R.ColliderDesc.ball(.01).setSensor(true).setTranslation(0, -1e4, 0); t.collider = t.gsStub = this.world.createCollider(d, body); } }
      if (!t.dead) this.world.removeCollider(c, true); return t;
    };
    t.set = (part, at, turn) => { const c = by.get(part); if (c) place(c, at, turn); return t; };
    t.parts = null; t.colliders = by;
    for (const s of list) t.add(s);
    if (!t.collider) { const d = R.ColliderDesc.ball(.01).setSensor(true).setTranslation(0, -1e4, 0); t.collider = t.gsStub = this.world.createCollider(d, body); }   // (one to be filtered and found by until a shape is added: far below)
    this.bodies.push(t);
    return t;
  }
  /** Makes a mesh (and everything inside it) solid and fixed: the level, floors, walls, ramps. */
  ground(mesh, o = {}) {
    mesh.updateMatrixWorld?.(true);
    const { vertices, indices, parts } = meshData(mesh, true, this.at);   // (its points about the world's centre in Rapier, so they keep their seven digits)
    if (!indices.length) return null;
    const g = this.make(null, R.ColliderDesc.trimesh(vertices, indices), { ...o, fixed: true, at: V(this.at.x, 0, this.at.z) }, 'ground');
    g.parts = parts; return g;   // (where each of its meshes lies: ray() says which one it hit)
  }
  /**
   * Solid ground from a grid of heights (a tile of land: much lighter than ground(mesh) for it). data holds
   * (cols + 1) × (rows + 1) heights, a row at a time: data[row * (cols + 1) + col] is the height at
   * x + col * width / cols, z + row * depth / rows.
   */
  heights({ data, cols, rows, x = 0, z = 0, width, depth = width }, o = {}) {
    const H = new Float32Array((rows + 1) * (cols + 1));
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) H[r + c * (rows + 1)] = data[r * (cols + 1) + c];   // (Rapier's: rows along z, a column at a time)
    return this.make(null, R.ColliderDesc.heightfield(rows, cols, H, { x: width, y: 1, z: depth }), { ...o, fixed: true, at: V(x + width / 2, 0, z + depth / 2) }, 'ground');
  }
  /** A flat floor at height y (endless, invisible). */
  floor(y = 0, o = {}) { return this.make(null, new R.ColliderDesc(new R.HalfSpace(V(0, 1, 0))), { ...o, fixed: true, at: V(0, y, 0) }, 'floor'); }   // (a true plane: a huge box let walkers and riders sink a few cm and stall)
  /** A character controller (see Mover above): radius, height, step (tallest step it climbs), slope (degrees), at. */
  mover(mesh, o = {}) { return new Mover(this, mesh, o); }
  /**
   * Something your own code moves, solid in the world (see Rider above): one of box: [w, h, l] (rounded a little at the
   * edges), ball: r, capsule: [r, h]; at (its underside), turn (radians about y), step (tallest kerb it climbs; 0 none),
   * slope (degrees it drives up), snap (metres it keeps down to the ground over bumps; 0 for things that fly or float),
   * mass (kg, how hard it shoves loose bodies), push (false: it doesn't), tag, sound. rider.slide(dx, dy, dz, turn, dt) each frame.
   */
  rider(o = {}) { return new Rider(this, o); }
  /**
   * The height of the first solid thing under (x, z) at or below y + reach (a floor, a crate's top, a ramp; a
   * bridge over you is left out), or null if nothing is there. not: a body, mover or rider to look through (yours).
   * So a World3D can be the `ground` of any kit that asks for one.
   */
  floorAt(x, y = 1e4, z = 0, reach = 1, not = null) {
    if (!this.steps) this.queries();
    const from = this.inner(V(x, y + reach, z)), hit = this.world.castRay(new R.Ray(from, V(0, -1, 0)), 1e4, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, not?.body);
    return hit ? from.y - hit.timeOfImpact : null;
  }
  /** A car with suspension (see Vehicle3 above): w, h, l chassis size, wheels (meshes, children of mesh), power, grip, steer, at. */
  vehicle(mesh, o = {}) { return new Vehicle3(this, mesh, o); }

  /* joints: a or b null = the fixed world; points are world positions */
  local(t, p) {
    const b = t ? t.body : this.ground0(); p = this.inner(vec(p));
    const q = b.rotation(), c = b.translation(), d = V(p.x - c.x, p.y - c.y, p.z - c.z);
    return rotate(d, { x: -q.x, y: -q.y, z: -q.z, w: q.w });
  }
  ground0() { return this._g ||= this.world.createRigidBody(R.RigidBodyDesc.fixed()); }
  joint(data, a, b) {
    const j = this.world.createImpulseJoint(data, a ? a.body : this.ground0(), b ? b.body : this.ground0(), true);
    const h = { joint: j, a, b, remove: () => { if (this.world.getImpulseJoint(j.handle)) this.world.removeImpulseJoint(j, true); this.joints = this.joints.filter(x => x !== h); } };
    this.joints.push(h); return h;
  }
  /** A hinge at point p turning about axis (default y: a door). min/max limit the swing (radians); motor spins it. */
  hinge(a, b, p, axis = V(0, 1, 0), o = {}) {
    const h = this.joint(R.JointData.revolute(this.local(a, p), this.local(b, p), vec(axis)), a, b);
    if (o.min != null || o.max != null) h.joint.setLimits(o.min ?? -Math.PI, o.max ?? Math.PI);
    if (o.motor != null) h.joint.configureMotorVelocity(o.motor, o.strength ?? 50);
    h.motor = (speed, strength = o.strength ?? 50) => h.joint.configureMotorVelocity(speed, strength);
    return h;
  }
  /** A ball-and-socket at p: things hang and swing any way (chains, wrecking balls, ragdoll joints). */
  pin(a, b, p) { return this.joint(R.JointData.spherical(this.local(a, p), this.local(b, p)), a, b); }
  /** Glues b to a where they are now. */
  weld(a, b) {
    const p = (b || a).pos, qa = a ? a.body.rotation() : { x: 0, y: 0, z: 0, w: 1 }, qb = b ? b.body.rotation() : { x: 0, y: 0, z: 0, w: 1 };
    return this.joint(R.JointData.fixed(this.local(a, p), qa, this.local(b, p), qb), a, b);
  }
  /** A spring between point pa on a and pb on b. stiffness: bounces per second; damping 0..1. */
  spring(a, b, pa, pb, { stiffness = 3, damping = .3, length } = {}) {
    const m = Math.max(.01, Math.min(a && !a.fixed ? a.mass : Infinity, b && !b.fixed ? b.mass : Infinity) || 1), w = 2 * Math.PI * stiffness;
    const A = vec(pa), B = vec(pb), rest = length ?? Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    return this.joint(R.JointData.spring(rest, m * w * w, 2 * m * damping * w, this.local(a, A), this.local(b, B)), a, b);
  }
  /** A leash: pa and pb can't get further apart than length. */
  leash(a, b, pa, pb, length) {
    const A = vec(pa), B = vec(pb);
    return this.joint(R.JointData.rope(length ?? Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z), this.local(a, A), this.local(b, B)), a, b);
  }

  remove(t) {
    if (!t || t.dead) return; t.dead = true;
    this.joints = this.joints.filter(j => j.a !== t && j.b !== t);
    this.world.removeRigidBody(t.body);
    this.bodies = this.bodies.filter(x => x !== t); this.movers = this.movers.filter(x => x !== t);
    if (t instanceof Rider) { this.riders = this.riders.filter(x => x !== t); try { this.world.removeCharacterController(t.ctl); } catch (_) { /* already gone */ } }
  }
  clear() { for (const d of [...this.dolls]) d.remove(); for (const t of [...this.bodies, ...this.movers, ...this.riders]) this.remove(t); }


  /**
   * Turns a character you built from parts into a ragdoll: it goes floppy and falls with real physics
   * (a knockout, a big hit). Your character stays your own meshes; they just stop being animated by you.
   *   const rag = phys.ragdoll(guard, { limbs: [head, armL, armR, legL, legR], push: [0, 2, -5] });
   * root is the character's Group (its own meshes make the body). Each limb turns at its own origin, so
   * put a limb's origin at its shoulder or hip (as you would to swing it). Leave out limbs to use every
   * child Group. Limbs can sit inside limbs (a forearm in an arm). The parts move into the scene.
   * rag.push(x, y, z) throws it (metres per second), rag.hit(part, x, y, z) hits one part,
   * rag.parts are the bodies, rag.remove() takes the physics away and leaves the parts where they lie.
   *
   * A character on gs.poses' skeleton (figure(), person(), gs.models.human(): anything with a .rig) needs no
   * limbs: phys.ragdoll(hero) joins its hips, chest, head, arms and legs with joints that turn only as far
   * as real ones (knees bend one way), and its bones follow, so a skinned person falls in one piece. Also
   * rag.part('head'), rag.hit('armL', x, y, z, at), rag.drive(pose, strength) (muscles: the joints pull
   * towards a pose), rag.relax() (limp again) and rag.still().
   */
  ragdoll(root, o = {}) {
    if (!o.limbs && root.rig?.parts?.hips) return rigDoll(this, root, o);
    const { limbs: limbs0, push, drag = .3, spinDrag = 1.5, group = 14, bounce = .05, friction = .8 } = o; let limbs = limbs0;
    let scene = root; while (scene.parent) scene = scene.parent;
    if (scene === root) throw new Error('ragdoll: add the character to the scene first');
    limbs = limbs || root.children.filter(c => !c.isMesh && c.children.length);
    const set = new Set(limbs), parentOf = new Map();
    for (const l of limbs) { let p = l.parent; while (p && p !== root && !set.has(p)) p = p.parent; parentOf.set(l, p && set.has(p) ? p : root); }
    root.updateMatrixWorld(true);
    const box = obj => {   // its own meshes (not other parts) in its own frame, world-sized
      const pos = new V3(), q = new Quaternion(), sc = new V3(); obj.matrixWorld.decompose(pos, q, sc);
      const inv = new Matrix4().compose(pos, q, new V3(1, 1, 1)).invert(), b = new Box3(), m = new Matrix4(), bb = new Box3();
      const walk = o => { if (o !== obj && set.has(o)) return; if (o.isMesh && o.geometry) { o.geometry.boundingBox || o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); b.union(bb); } for (const k of o.children) walk(k); };
      walk(obj); return b;
    };
    const boxes = new Map([root, ...limbs].map(o => [o, box(o)]));
    for (const o of [root, ...limbs]) if (o.parent !== scene) scene.attach(o);
    const bodyOf = new Map(), parts = [];
    for (const o of [root, ...limbs]) {
      const b = boxes.get(o), c = new V3(), h = new V3();
      let desc;
      if (b.isEmpty()) desc = R.ColliderDesc.ball(.08);
      else { b.getCenter(c); b.getSize(h).multiplyScalar(.5).max(new V3(.02, .02, .02)); desc = R.ColliderDesc.cuboid(h.x, h.y, h.z).setTranslation(c.x, c.y, c.z); }
      const t = this.make(o, desc, { drag, spinDrag, group, bounce, friction, tag: 'ragdoll' }, 'part');
      bodyOf.set(o, t); parts.push(t);
    }
    const joints = limbs.map(l => this.pin(bodyOf.get(parentOf.get(l)), bodyOf.get(l), l.position));
    const rag = {
      parts, joints, root: bodyOf.get(root),
      push: (x, y, z) => { for (const p of parts) p.push(x, y, z); return rag; },
      hit: (part, x, y, z) => { (bodyOf.get(part) || part).push(x, y, z); return rag; },
      remove: () => { for (const j of joints) j.remove(); for (const p of parts) this.remove(p); },
    };
    if (push) rag.push(...(Array.isArray(push) ? push : [push.x, push.y, push.z]));
    return rag;
  }

  /** First thing along a ray from `from` in direction `dir` (needn't be normalised), up to max metres. */
  ray(from, dir, max = 100, filter = t => !t.collider.isSensor()) {
    if (!this.steps) this.queries();   // (a world not stepped yet: what is in it is not yet where rays look)
    const o = vec(from), d = vec(dir), l = Math.hypot(d.x, d.y, d.z) || 1, n = V(d.x / l, d.y / l, d.z / l);
    const hit = this.world.castRayAndGetNormal(new R.Ray(this.inner(o), n), max, true, undefined, undefined, undefined, undefined,
      c => { const t = c.parent()?.userData; return !!t && filter(t); });
    if (!hit) return null;
    const s = hit.timeOfImpact, thing = hit.collider.parent()?.userData || null, point = V(o.x + n.x * s, o.y + n.y * s, o.z + n.z * s), part = hit.collider.userData ?? null;
    return { thing, point, normal: V(hit.normal.x, hit.normal.y, hit.normal.z), distance: s, part, get mesh() { return meshAt(thing, point); } };
  }
  /** Every body within radius of a point. */
  near(p, radius) {
    if (!this.steps) this.queries();
    const out = new Set(), c = this.inner(vec(p));
    this.world.intersectionsWithShape(c, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(radius), col => { const t = col.parent()?.userData; if (t) out.add(t); return true; });
    return [...out];
  }
  /** Throws everything near p outward (metres per second at the centre). */
  blast(p, radius, strength = 10) {
    const c = vec(p);
    for (const t of this.near(c, radius)) {
      if (!(t instanceof Body3) || t.fixed || t.body.isKinematic()) continue;
      const q = t.pos, dx = q.x - c.x, dy = q.y - c.y + .3, dz = q.z - c.z, d = Math.hypot(dx, dy, dz) || 1, k = strength * Math.max(0, 1 - d / radius);
      if (k > 0) t.push(dx / d * k, dy / d * k, dz / d * k);
    }
  }
  /**
   * fn(a, b, speed, contact) when two things start touching; speed is how fast they met (m/s); contact.at is where (a
   * point in the world, worked out when asked) and contact.normal the way from a to b. Safe to remove things in it.
   */
  onHit(fn) { this.hits.push(fn); return this; }
  /** Where two touching colliders meet now: { at, normal } (or null): the deepest of their contact points. */
  contact(c1, c2) {
    let out = null, deep = Infinity;
    this.world.contactPair(c1, c2, (m, flipped) => {
      const n = m.normal(), k = flipped ? -1 : 1;
      for (let i = 0; i < m.numSolverContacts(); i++) { const d = m.solverContactDist(i); if (d < deep) { deep = d; const p = m.solverContactPoint(i); out = { at: this.outer(p), normal: V(n.x * k, n.y * k, n.z * k) }; } }
    });
    return out;
  }

  step(dt) {
    if (!(dt > 0)) return;
    this.steps = (this.steps || 0) + 1;
    this.follow();
    dt = Math.min(dt, 1 / 15);
    const n = Math.max(1, Math.ceil(dt * 60 - .01)), h = dt / n;
    const before = new Map();
    if (this.hits.length) { for (const t of this.bodies) if (!t.fixed) before.set(t, t.body.linvel()); for (const r of this.riders) before.set(r, r.vel); }
    const started = [];
    if (this.smooth) for (const t of [...this.bodies, ...this.movers]) if (t.mesh) t._was = pose(t.body, this.at, t._was);
    this.world.timestep = h;
    for (let i = 0; i < n; i++) {
      for (const m of this.movers) m.move(h);
      for (const r of this.riders) r.sub(i, n);
      for (const v of this.vehicles) v.step(h);
      for (const d of this.dolls) d.muscles?.();
      this.world.step(this.events);
      this.events.drainCollisionEvents((h1, h2, on) => { if (on) started.push([h1, h2]); });
    }
    for (const r of this.riders) r.stepped();
    for (const t of this.bodies) t.sync();
    for (const d of this.dolls) d.sync();
    for (const m of this.movers) m.sync();
    for (const v of this.vehicles) v.sync();
    if (this.smooth) for (const t of [...this.bodies, ...this.movers]) if (t.mesh) t._now = pose(t.body, this.at, t._now);
    for (const [a, b, speed, c] of this.met.splice(0)) if (!a.dead && !b.dead) for (const fn of this.hits) fn(a, b, speed, c);   // (riders' own: see Rider.slide)
    for (const [h1, h2] of started) {
      const c1 = this.world.getCollider(h1), c2 = this.world.getCollider(h2); if (!c1 || !c2) continue;
      const a = c1.parent()?.userData, b = c2.parent()?.userData; if (!a || !b || a.dead || b.dead) continue;
      const va = before.get(a) || V(), vb = before.get(b) || V();
      const speed = Math.hypot(vb.x - va.x, vb.y - va.y, vb.z - va.z);
      let got = 0, c = null; const W = this, contact = { get at() { if (!got++) c = W.contact(c1, c2); return c?.at ?? null; }, get normal() { if (!got++) c = W.contact(c1, c2); return c?.normal ?? null; }, part: c1.userData ?? c2.userData ?? null };
      for (const fn of this.hits) fn(a, b, speed, contact);
    }
    for (const t of [...this.bodies]) if (!t.fixed && Math.abs(t.pos.y) > 1e4) this.remove(t);
  }
}

function pose(body, at, o = {}) {   // where a body is now (in the world's own numbers), kept for smooth drawing between ticks
  const p = body.translation(), q = body.rotation();
  o.x = p.x + at.x; o.y = p.y; o.z = p.z + at.z; o.qx = q.x; o.qy = q.y; o.qz = q.z; o.qw = q.w; return o;
}

function rotate(v, q) {   // v rotated by quaternion q
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return V(ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x);
}

// Every triangle of a mesh and its children, in world space (or the mesh's own space for hulls).
// the mesh a ray hit: a level made solid with ground() keeps where each of its meshes lies, and the smallest that
// holds the point is the one (Rapier's own triangle numbers are not those of the meshes)
function meshAt(t, p) {
  if (!t) return null;
  const P = t.parts; if (!P) return t.mesh || null;
  let best = null, least = Infinity; const e = .02;
  for (const q of P) { const b = q.box; if (p.x < b[0] - e || p.y < b[1] - e || p.z < b[2] - e || p.x > b[3] + e || p.y > b[4] + e || p.z > b[5] + e) continue; const v = (b[3] - b[0] + e) * (b[4] - b[1] + e) * (b[5] - b[2] + e); if (v < least) { least = v; best = q.mesh; } }
  return best;
}
function meshData(root, world, off = null) {
  const verts = [], idx = [], parts = [];
  root.updateMatrixWorld?.(true);
  const inv = world ? null : root.matrixWorld?.clone?.().invert();
  root.traverse?.(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position, base = verts.length / 3, m = o.matrixWorld.clone();
    if (inv) m.premultiply(inv);
    const e = m.elements, box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      verts.push(off ? X - off.x : X, Y, off ? Z - off.z : Z);
      if (X < box[0]) box[0] = X; if (Y < box[1]) box[1] = Y; if (Z < box[2]) box[2] = Z; if (X > box[3]) box[3] = X; if (Y > box[4]) box[4] = Y; if (Z > box[5]) box[5] = Z;
    }
    const index = o.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(base + i);
    parts.push({ box, mesh: o });
  });
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx), parts };
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(World3D.prototype, 'step', 'physics 3D');
