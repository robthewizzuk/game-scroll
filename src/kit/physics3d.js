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
 * A car with real suspension (Rapier's ray-cast vehicle): the chassis is a dynamic box that can roll
 * over, bounce off things and land jumps; four (or more) wheels are rays under it. drive() each frame.
 * wheels: meshes to spin and steer (optional, in the order front-left, front-right, back-left, back-right).
 */
class Vehicle3 {
  constructor(world, mesh, { w = 1.6, h = .5, l = 3, density = 1, wheels = [], radius = .38, rest = .35, travel = .3,
    stiffness = 30, damping = 4, grip = 2.5, power = 12, brakes = .3, steer = .5, at, tag = 'car' } = {}) {
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
    this.bodies = []; this.movers = []; this.hits = []; this.joints = []; this.vehicles = []; this.dolls = [];
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
    o.x = x; o.z = z;
    // Rapier finds things for rays and walking characters by boxes it only works out again as it steps: a step too short
    // to move anything puts them where the bodies now are (a kinematic body is held where it is for it, not sent flying)
    const ts = W.timestep; W.timestep = 1e-9; W.step(this.events); W.timestep = ts; this.events.drainCollisionEvents(() => {});
    for (const [b, n] of keep) b.setNextKinematicTranslation(n);
    for (const b of asleep) b.sleep();   // (that step wakes everything)
    this.recentred = (this.recentred || 0) + 1;
    return this;
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
    for (const m of this.movers) if (m.ctl) try { this.world.removeCharacterController(m.ctl); } catch (_) { /* already gone */ }
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
  floor(y = 0, o = {}) { return this.make(null, R.ColliderDesc.cuboid(1000, .5, 1000), { ...o, fixed: true, at: V(0, y - .5, 0) }, 'floor'); }
  /** A character controller (see Mover above): radius, height, step (tallest step it climbs), slope (degrees), at. */
  mover(mesh, o = {}) { return new Mover(this, mesh, o); }
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
  }
  clear() { for (const d of [...this.dolls]) d.remove(); for (const t of [...this.bodies, ...this.movers]) this.remove(t); }


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
    const o = vec(from), d = vec(dir), l = Math.hypot(d.x, d.y, d.z) || 1, n = V(d.x / l, d.y / l, d.z / l);
    const hit = this.world.castRayAndGetNormal(new R.Ray(this.inner(o), n), max, true, undefined, undefined, undefined, undefined,
      c => { const t = c.parent()?.userData; return !!t && filter(t); });
    if (!hit) return null;
    const s = hit.timeOfImpact, thing = hit.collider.parent()?.userData || null, point = V(o.x + n.x * s, o.y + n.y * s, o.z + n.z * s);
    return { thing, point, normal: V(hit.normal.x, hit.normal.y, hit.normal.z), distance: s, get mesh() { return meshAt(thing, point); } };
  }
  /** Every body within radius of a point. */
  near(p, radius) {
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
  /** fn(a, b, speed) when two things start touching; speed is how fast they met (m/s). Safe to remove things in it. */
  onHit(fn) { this.hits.push(fn); return this; }

  step(dt) {
    if (!(dt > 0)) return;
    this.follow();
    dt = Math.min(dt, 1 / 15);
    const n = Math.max(1, Math.ceil(dt * 60 - .01)), h = dt / n;
    const before = new Map();
    if (this.hits.length) for (const t of this.bodies) if (!t.fixed) before.set(t, t.body.linvel());
    const started = [];
    if (this.smooth) for (const t of [...this.bodies, ...this.movers]) if (t.mesh) t._was = pose(t.body, this.at, t._was);
    this.world.timestep = h;
    for (let i = 0; i < n; i++) {
      for (const m of this.movers) m.move(h);
      for (const v of this.vehicles) v.step(h);
      for (const d of this.dolls) d.muscles?.();
      this.world.step(this.events);
      this.events.drainCollisionEvents((h1, h2, on) => { if (on) started.push([h1, h2]); });
    }
    for (const t of this.bodies) t.sync();
    for (const d of this.dolls) d.sync();
    for (const m of this.movers) m.sync();
    for (const v of this.vehicles) v.sync();
    if (this.smooth) for (const t of [...this.bodies, ...this.movers]) if (t.mesh) t._now = pose(t.body, this.at, t._now);
    for (const [h1, h2] of started) {
      const c1 = this.world.getCollider(h1), c2 = this.world.getCollider(h2); if (!c1 || !c2) continue;
      const a = c1.parent()?.userData, b = c2.parent()?.userData; if (!a || !b || a.dead || b.dead) continue;
      const va = before.get(a) || V(), vb = before.get(b) || V();
      const speed = Math.hypot(vb.x - va.x, vb.y - va.y, vb.z - va.z);
      for (const fn of this.hits) fn(a, b, speed);
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
