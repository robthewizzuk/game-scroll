// A jointed ragdoll for a character on gs.poses' skeleton: figure(), person(), gs.models.human(), or your
// own Rig. Eleven bodies (hips, chest, head, upper and lower arms and legs) joined where the joints are,
// each joint turning only as far as a real one does (a knee bends one way, a head can't spin round), so
// a fall looks like a person falling and not a sack. The character stays one skinned mesh: its bones
// follow the bodies. Joints can be driven towards a pose (doll.drive()) so a falling body throws its
// arms out to save itself; doll.relax() lets it go limp.
// Kit use: games reach it as phys.ragdoll(character) (gs.physics3d) and through gs.characters.Reactions.

import { Euler, Quaternion, Vector3 } from 'three';

const PARENT = { spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', armR: 'spine', foreR: 'armR', legL: 'hips', shinL: 'legL', legR: 'hips', shinR: 'legR' };
const ORDER = ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'];
// How far each joint turns from rest, about its parent's x (forward and back), y (twist) and z (out to the
// side): [least, most] in radians, with the rig's signs (a limb forward is -x, a knee bends +x, an elbow -x,
// a left limb out to its side +z). The left side: the right mirrors y and z.
export const JOINT_LIMITS = {
  spine: [[-.3, .8], [-.45, .45], [-.3, .3]],
  head: [[-.5, .6], [-.8, .8], [-.35, .35]],
  armL: [[-3, .9], [-.7, .7], [-.45, 1.6]],
  foreL: [[-2.2, 0]],     // (one row: a hinge about x, like an elbow or a knee)
  legL: [[-1.9, .6], [-.5, .5], [-.3, .8]],
  shinL: [[0, 2.3]],
};
const limitsOf = name => {
  if (JOINT_LIMITS[name]) return JOINT_LIMITS[name];
  const l = JOINT_LIMITS[name.slice(0, -1) + 'L']; if (!l) return null;
  return l.length === 1 ? l : [l[0], [-l[1][1], -l[1][0]], [-l[2][1], -l[2][0]]];
};
// each part's thickness on a 1.8 m person (metres), and how long the end ones are where nothing says
const THICK = { armL: .05, armR: .05, foreL: .042, foreR: .042, legL: .075, legR: .075, shinL: .055, shinR: .055 };
// What hangs on each joint, against what the engine reckons with (its motors count the two bodies a joint
// holds and no more: a shoulder moves the forearm as well, the waist everything above it).
const LOAD = { spine: 8, head: 3, arm: 10, fore: 3, leg: 10, shin: 3 };
// The bodies of the arms sit turned this far forward of their bones (about x, upper arm and forearm alike):
// a shoulder goes from behind the back to straight overhead, and the engine reads a joint's turn from the
// middle of that range, where it cannot wrap round on itself.
const TURN = { arm: 1.05, fore: 1.05 };
const X = new Vector3(1, 0, 0);
const _p = new Vector3(), _q = new Quaternion(), _q2 = new Quaternion(), _s = new Vector3(), _e = new Euler();
const half = (q, i) => 2 * Math.asin(Math.max(-1, Math.min(1, i === 0 ? q.x : i === 1 ? q.y : q.z)));   // the engine's own measure of a joint's turn about one axis (what its limits are set in)

/**
 * world: a gs.physics3d World3D; root: the character (a Group with .rig, in the scene). o: push (metres a
 * second for the whole body), vel (the speed it already has), drag, spinDrag, group (1-14: its own parts
 * never collide), bounce, friction, stiff (how much the joints resist turning: 0 loose .. 1 stiff).
 */
export function rigDoll(world, root, { push, vel, drag = .05, spinDrag = .6, group = 14, bounce = .02, friction = .9, stiff = .35, rig = root.rig } = {}) {
  const R = world.R, parts = rig.parts;
  if (!parts.hips) throw new Error('ragdoll: the rig needs a hips part');
  root.updateMatrixWorld(true);
  const s = root.getWorldScale(_s).y || 1, v0 = vel ? (Array.isArray(vel) ? { x: vel[0], y: vel[1], z: vel[2] } : vel) : null;
  const names = ORDER.filter(n => parts[n] && (n === 'hips' || parts[PARENT[n]]));
  const kid = (n, c) => parts[c] && parts[c].parent === parts[n] ? parts[c].position : null;   // where the next joint is, in this part's own space
  const proxy = {}, body = {}, list = [];
  for (const n of names) {
    const part = parts[n], at = part.getWorldPosition(new Vector3()), q = part.getWorldQuaternion(new Quaternion()), turn = TURN[n.slice(0, -1)] || 0;
    const off = turn ? new Quaternion().setFromAxisAngle(X, turn) : null, back = off && off.clone().invert();
    let desc, long = 0;
    if (n === 'hips') desc = R.ColliderDesc.cuboid(.16 * s, .085 * s, .1 * s).setTranslation(0, -.02 * s, 0);
    else if (n === 'spine') { const up = (kid(n, 'head')?.y ?? .42) * s; desc = R.ColliderDesc.cuboid(.17 * s, up / 2, .105 * s).setTranslation(0, up / 2, 0); }
    else if (n === 'head') desc = R.ColliderDesc.ball(.105 * s).setTranslation(0, .15 * s, .01 * s);
    else {
      const next = n.startsWith('arm') ? kid(n, 'fore' + n.slice(-1)) : n.startsWith('leg') ? kid(n, 'shin' + n.slice(-1)) : null, r = THICK[n] * s;
      const len = next ? next.length() * s : ((part.userData.ikLength ?? (n.startsWith('fore') ? .28 : .44)) + (n.startsWith('fore') ? .07 : .05)) * s;   // (a forearm with its hand, a shin with its heel)
      _p.set(next ? next.x * s / 2 : 0, -len / 2, next ? next.z * s / 2 : 0); if (back) _p.applyQuaternion(back);
      desc = R.ColliderDesc.capsule(Math.max(.01, len / 2 - r), r).setTranslation(_p.x, _p.y, _p.z); long = len;
      if (back) desc.setRotation({ x: back.x, y: back.y, z: back.z, w: back.w });
    }
    if (off) q.multiply(off);
    const px = proxy[n] = { position: at, quaternion: q, off, back, bone: new Quaternion(), turn };
    const b = body[n] = world.make(px, desc, { drag, spinDrag, group, bounce, friction, tag: 'ragdoll', vel: v0 || undefined }, 'part');
    b.body.setAdditionalSolverIterations?.(4);   // (joints that hold through a hard landing, for these bodies only)
    // a thin limb is far too easy to spin about its own length (a bent forearm on the end of it then swings it
    // about at will, past its limits): as hard to turn that way as any other
    if (long) { const I = b.body.mass() * long * long * .1; b.body.setAdditionalMassProperties(0, { x: 0, y: 0, z: 0 }, { x: I, y: I, z: I }, { x: 0, y: 0, z: 0, w: 1 }, true); }
    b.part = n; list.push(b);
  }
  // joints, each with its limits (widened to hold the pose it starts in, so nothing snaps)
  const joints = [];
  for (const n of names) {
    if (n === 'hips') continue;
    const a = body[PARENT[n]], b = body[n], at = proxy[n].position, lim = limitsOf(n), hinge = lim?.length === 1;
    const h = world.joint(hinge ? R.JointData.revolute(world.local(a, at), world.local(b, at), { x: 1, y: 0, z: 0 }) : R.JointData.spherical(world.local(a, at), world.local(b, at)), a, b);
    const raw = h.joint.rawSet;
    if (raw?.jointSetLimits && lim) {
      const rel = _q.copy(proxy[PARENT[n]].quaternion).invert().multiply(proxy[n].quaternion); if (rel.w < 0) rel.set(-rel.x, -rel.y, -rel.z, -rel.w);
      const by = proxy[n].turn - proxy[PARENT[n]].turn;   // (limits are from the bone's rest; the engine sees the bodies)
      for (let i = 0; i < lim.length; i++) { const now = half(rel, i), d = i ? 0 : by; raw.jointSetLimits(h.joint.handle, 3 + i, Math.min(lim[i][0] + d, now - .04), Math.max(lim[i][1] + d, now + .04)); }
    }
    h.name = n; h.hinge = hinge; h.load = LOAD[n.replace(/[LR]$/, '')] || 3; joints.push(h);
  }
  const base = rig.base, hipUp = (rig.hip0 ?? parts.hips.position.y) * s, slack = 2.5 + 30 * stiff * stiff, REST = [0, 0, 0];
  const doll = {
    parts: list, joints, root: body.hips, bodies: body, limp: true,
    /** The body of a part by name ('head', 'spine', 'armL'...). */
    part: n => body[n] || null,
    /** Throws the whole body (metres a second). */
    push(x, y, z) { for (const p of list) p.push(x, y, z); return doll; },
    /** Hits one part (a name or a body) with a change of speed, at a world point if given (so it spins as well). */
    hit(part, x, y, z, at) {
      const b = typeof part === 'string' ? body[part] : part?.body ? part : body[Object.keys(parts).find(k => parts[k] === part)]; if (!b) return doll;
      if (at) { const m = b.mass; b.body.applyImpulseAtPoint({ x: x * m, y: y * m, z: z * m }, { x: at.x, y: at.y, z: at.z }, true); } else b.push(x, y, z);
      return doll;
    },
    /**
     * Muscles: drives the joints towards a pose ({ joint: [x, y, z] }, the rig's angles from rest; a joint left
     * out goes to rest). strength: 0 limp .. 1 as firm as someone holding a pose. Call again as the pose changes.
     */
    drive(pose = {}, strength = .5) {
      doll.limp = !(strength > 0); doll.strength = Math.max(0, strength);
      for (const h of joints) {
        const a = pose[h.name] || REST, b = base.get(h.name) || REST;
        const w = (h.want ||= new Quaternion()).setFromEuler(_e.set(b[0] + a[0], b[1] + a[1], b[2] + a[2], parts[h.name].rotation.order)), pa = proxy[PARENT[h.name]], pb = proxy[h.name];
        if (pb.off) w.multiply(pb.off); if (pa.back) w.premultiply(pa.back);   // (in the bodies' terms)
        // limp: only the give of a joint with no muscle behind it
        if (doll.limp) for (let i = 0; i < (h.hinge ? 1 : 3); i++) h.joint.rawSet?.jointConfigureMotorVelocity?.(h.joint.handle, 3 + i, 0, slack * h.load * .2);
      }
      return doll;
    },
    // The muscles at work (the world calls this before each step): each joint is turned towards its pose at a
    // speed that falls away as it gets there. (The engine's own position motors read a ball joint one axis at a
    // time, and wander off a pose that is far from rest; a speed about the parent's axes has no such trouble.)
    muscles() {
      const k = doll.strength; if (!(k > 0)) return;
      const rate = 4 + 14 * k, hold = 4 + 40 * k;
      for (const h of joints) {
        const raw = h.joint.rawSet, A = body[PARENT[h.name]].body, B = body[h.name].body; if (!raw?.jointConfigureMotorVelocity || (A.isSleeping() && B.isSleeping())) continue;
        const qa = A.rotation(), qb = B.rotation();
        _q.set(qa.x, qa.y, qa.z, qa.w).invert().multiply(_q2.set(qb.x, qb.y, qb.z, qb.w));   // how it is turned now, in its parent's terms
        _q2.copy(h.want).multiply(_q.invert()); if (_q2.w < 0) _q2.set(-_q2.x, -_q2.y, -_q2.z, -_q2.w);   // the turn still to make
        const sn = Math.hypot(_q2.x, _q2.y, _q2.z), ang = 2 * Math.atan2(sn, _q2.w), v = sn > 1e-6 ? Math.min(ang * rate, 9) / sn : 0;
        const firm = hold * h.load;
        if (h.hinge) raw.jointConfigureMotorVelocity(h.joint.handle, 3, _q2.x * v, firm);
        else { raw.jointConfigureMotorVelocity(h.joint.handle, 3, _q2.x * v, firm); raw.jointConfigureMotorVelocity(h.joint.handle, 4, _q2.y * v, firm); raw.jointConfigureMotorVelocity(h.joint.handle, 5, _q2.z * v, firm); }
      }
    },
    /** Lets go: the joints only resist a little, like a body with nobody in it. */
    relax() { return doll.drive({}, 0); },
    /** Puts the character's bones where the bodies are (the world does this after each step). */
    sync() {
      const hp = proxy.hips.position;
      // the character itself goes along under the hips, so its bounds stay round the body
      _p.set(hp.x, hp.y - hipUp, hp.z); if (root.parent) root.parent.worldToLocal(_p); root.position.copy(_p); root.updateMatrix();
      if (root.parent) root.matrixWorld.multiplyMatrices(root.parent.matrixWorld, root.matrix); else root.matrixWorld.copy(root.matrix);
      for (const n of names) {
        const part = parts[n], par = part.parent, px = proxy[n], bone = px.bone.copy(px.quaternion); if (px.back) bone.multiply(px.back);
        if (n === 'hips') {
          if (par !== root) par.updateWorldMatrix(true, false);
          part.position.copy(par.worldToLocal(_p.copy(px.position))); par.getWorldQuaternion(_q2);
        } else if (par === parts[PARENT[n]]) _q2.copy(proxy[PARENT[n]].bone); else par.getWorldQuaternion(_q2);
        part.quaternion.copy(_q2.invert().multiply(bone));
        part.updateMatrix(); part.matrixWorld.multiplyMatrices(par.matrixWorld, part.matrix);
      }
      return doll;
    },
    /** true once it lies still (every part slower than `speed` metres a second). */
    still(speed = .25) { for (const p of list) if (p.speed > speed && !p.sleeping) return false; return true; },
    /** Takes the physics away and leaves the character as it lies. */
    remove() {
      for (const j of joints) j.remove(); for (const p of list) world.remove(p);
      const i = world.dolls.indexOf(doll); if (i >= 0) world.dolls.splice(i, 1); doll.gone = true;
    },
  };
  doll.drive({}, 0);
  (world.dolls ||= []).push(doll);
  if (push) doll.push(...(Array.isArray(push) ? push : [push.x, push.y, push.z]));
  return doll;
}
