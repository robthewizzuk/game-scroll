// Living characters for 3D games: heads that turn to look at things, legs and arms that reach
// (two-bone IK), feet that plant on the ground and step as the body moves, and springy hit
// reactions. They work on the characters you build yourself from parts (groups with their origins at
// the joints). Your game still decides how a character looks and moves; these fill in the motion.
// Ragdolls (going floppy when knocked out) are in gs.physics3d: phys.ragdoll(character). People who react
// physically (flinch, stumble, brace, fall, get up) are gs.characters.Reactions, in reactions.js.
//
//   const { lookAt, reach, Steps, Wobble } = gs.characters;
//   update(dt) {
//     lookAt(guard.head, hero.position, dt, { max: 1.1, speed: 8 });      // turns towards it, within limits
//     lookAt(guard.head, null, dt);                                       // back to facing forwards
//     reach(arm, forearm, doorHandle.position);                           // the hand goes to the handle
//     steps.update(dt, hero);                                             // feet plant and step as hero moves
//     reach(thighL, shinL, steps.feet[0].pos); reach(thighR, shinR, steps.feet[1].pos);
//     hitWobble.update(dt); guard.body.rotation.x = hitWobble.value * .5;  // after hitWobble.hit(1)
//   }
//   steps = new Steps({ feet: [[-.15, 0], [.15, 0]], stride: .45, lift: .12, ground: (x, z) => 0 });
//
// Directions: a character faces +z with y up (yaw is rotation.y). Limbs hang along their own -y:
// build an arm so its origin is the shoulder and it points down its local -y, the forearm's origin is
// the elbow, and so on. reach() then bends them like a real joint.

// Faces: blend shapes eased together, blinking and lip sync to gs.sound.say (Face, shapes, visemes: src/kit/skin.js).
//   face = new Face(mesh); face.say('Hello!'); face.set('smile', 1); face.update(dt);

import { Vector3, Quaternion, Euler } from 'three';
export { Face, shapes, visemes, FACE_SHAPES } from './skin.js';

const _v = new Vector3(), _w = new Vector3(), _q = new Quaternion(), _q2 = new Quaternion(), _e = new Euler(0, 0, 0, 'YXZ');

/**
 * Turns obj (a head, a turret, an eye) to look at target (a Vector3 or Object3D; null = straight
 * ahead) a little more each frame. max: how far it can turn (radians); speed: how fast it gets there.
 */
export function lookAt(obj, target, dt, { max = 1.2, up = .7, speed = 8 } = {}) {
  const rest = obj.userData.restQ ||= obj.quaternion.clone();
  let goal = rest;
  if (target) {
    const p = target.isObject3D ? target.getWorldPosition(_w) : _w.copy(target);
    obj.parent.updateMatrixWorld(true); obj.parent.worldToLocal(p);   // target in the parent's space
    _v.subVectors(p, obj.position).applyQuaternion(_q2.copy(rest).invert());   // ... and in the rest pose
    const yaw = Math.max(-max, Math.min(max, Math.atan2(_v.x, _v.z))), pitch = Math.max(-up, Math.min(up, Math.atan2(-_v.y, Math.hypot(_v.x, _v.z))));
    goal = _q.copy(rest).multiply(_q2.setFromEuler(_e.set(pitch, yaw, 0)));
  }
  obj.quaternion.slerp(goal, dt == null ? 1 : 1 - Math.exp(-speed * dt));
  return obj;
}

const tipOf = (lower, o) => o.end ? o.end.getWorldPosition(new Vector3()) : lower.localToWorld(new Vector3(0, -(o.length ?? lower.userData.ikLength ?? guessLength(lower)), 0));
function guessLength(lower) {   // the furthest point down the limb's -y
  let l = 0; lower.updateMatrixWorld(true);
  lower.traverse(o => { if (o.isMesh && o.geometry) { o.geometry.boundingBox || o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; for (const y of [b.min.y, b.max.y]) { const p = lower.worldToLocal(o.localToWorld(new Vector3(0, y, 0))); l = Math.max(l, -p.y); } } });
  return lower.userData.ikLength = l || .5;
}
function aimBone(bone, from, to) {   // rotates bone (in world terms) so the direction from → its child points along to
  bone.updateMatrixWorld(true);
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  const world = bone.getWorldQuaternion(new Quaternion()), parent = bone.parent.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(parent.invert().multiply(_q.multiply(world)));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone reach (IK): bends upper (a thigh or upper arm) and lower (shin or forearm) so the tip
 * touches target. pole: a point the knee or elbow should point towards (default: the way it bends
 * now). length: the lower bone's length if it can't be measured from its meshes; end: an Object3D at
 * the tip (a hand or foot). Returns true if the target was in reach.
 */
export function reach(upper, lower, target, o = {}) {
  upper.updateMatrixWorld(true);
  const A = upper.getWorldPosition(new Vector3()), B = lower.getWorldPosition(new Vector3()), C = tipOf(lower, o), T = target.isObject3D ? target.getWorldPosition(new Vector3()) : new Vector3().copy(target);
  const L1 = A.distanceTo(B), L2 = B.distanceTo(C), dir = new Vector3().subVectors(T, A); let d = dir.length();
  const inReach = d <= L1 + L2;
  d = Math.max(Math.abs(L1 - L2) + 1e-4, Math.min(L1 + L2 - 1e-4, d)); dir.normalize();
  const P = o.pole ? (o.pole.isObject3D ? o.pole.getWorldPosition(new Vector3()) : new Vector3().copy(o.pole)) : B.clone().add(new Vector3(0, 0, .001));
  const bend = new Vector3().subVectors(P, A); bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(dir, -dir.z);
  bend.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const K = A.clone().addScaledVector(dir, a).addScaledVector(bend, h), tipT = A.clone().addScaledVector(dir, d);
  aimBone(upper, new Vector3().subVectors(B, A), new Vector3().subVectors(K, A));
  const B2 = lower.getWorldPosition(new Vector3()), C2 = tipOf(lower, o);
  aimBone(lower, new Vector3().subVectors(C2, B2), new Vector3().subVectors(tipT, B2));
  return inReach;
}

/**
 * Feet that stay planted on the ground and step when the body has moved too far from them, one foot
 * at a time. feet: their resting spots beside the body as [x, z] (x to the side, z forwards).
 * ground(x, z) gives the floor height there (default: the body's height). Each frame read
 * steps.feet[i].pos (world point for the foot), .lifting (0..1 while in the air) and .landed (true
 * the frame it touches down: a footstep sound).
 */
export class Steps {
  constructor({ feet = [[-.15, 0], [.15, 0]], stride = .45, lift = .12, time = .22, lead = .3, ground = null } = {}) {
    Object.assign(this, { stride, lift, time, lead, ground });
    this.feet = feet.map(([x, z]) => ({ x, z, pos: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, lifting: 0, landed: false }));
    this.started = false; this.last = new Vector3(); this.vel = new Vector3(); this.next = 0;
  }
  home(body, f, out) {
    const p = body.position, yaw = body.yaw ?? body.rotation?.y ?? 0, s = Math.sin(yaw), c = Math.cos(yaw);
    out.set(p.x + f.x * c + f.z * s + this.vel.x * this.lead, 0, p.z - f.x * s + f.z * c + this.vel.z * this.lead);
    out.y = this.ground ? this.ground(out.x, out.z) : p.y;
    return out;
  }
  update(dt, body) {
    const p = body.position;
    if (this.started && dt > 0) this.vel.subVectors(p, this.last).divideScalar(dt).setY(0);
    this.last.copy(p);
    if (!this.started) { for (const f of this.feet) this.home(body, f, f.pos); this.started = true; }
    const moving = this.feet.some(f => f.t < 1);
    for (const f of this.feet) {
      f.landed = false;
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / this.time);
        f.pos.lerpVectors(f.from, f.to, f.t); f.lifting = Math.sin(f.t * Math.PI); f.pos.y += f.lifting * this.lift;
        if (f.t >= 1) { f.landed = true; f.lifting = 0; f.pos.copy(f.to); }
      }
    }
    if (!moving) {   // nobody in the air: the foot furthest from home steps (feet take turns)
      let worst = null, wd = 0;
      for (const [i, f] of this.feet.entries()) { const d = this.home(body, f, _v).distanceTo(f.pos); if (d > wd + (i === this.next ? .01 : 0)) { wd = d; worst = f; } }
      if (worst && wd > this.stride) { worst.from.copy(worst.pos); this.home(body, worst, worst.to); worst.t = 0; this.next = (this.feet.indexOf(worst) + 1) % this.feet.length; }
    }
    return this;
  }
}

/** A springy value for hit reactions and squash: hit(amount) knocks it, it wobbles back to 0. */
export class Wobble {
  constructor({ stiffness = 140, damping = 9 } = {}) { this.k = stiffness; this.c = damping; this.value = 0; this.vel = 0; }
  hit(amount = 1) { this.vel += amount * Math.sqrt(this.k); return this; }
  update(dt) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.vel += (-this.k * this.value - this.c * this.vel) * h; this.value += this.vel * h; }
    return this;
  }
}

