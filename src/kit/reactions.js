// People who react physically: a character on gs.poses' skeleton (figure(), person(), gs.models.human())
// that flinches where it is hit, keeps its balance with real recovery steps when shoved, throws its
// arms out against a wall it is about to run into or the ground it is falling towards, goes down as a
// jointed ragdoll when it cannot save itself, and gets up again from its front or its back.
//
//   const { Reactions } = gs.characters;
//   react = new Reactions(hero, { world: phys, mover });        // world: falls are real physics (gs.physics3d); without it they are acted
//   update(dt) {
//     if (!react.busy) { ...steer hero as usual... }
//     hero.rig.update(dt, { speed }); react.update(dt);         // after the rig, every frame
//   }
//   react.hit([0, 0, -2.5], bullet.point);     // a change of speed (metres a second) at a point: flinch, stagger or fall, by how hard
//   react.blast(bomb.position, 9, 6);          // thrown by an explosion
//   react.trip();  react.fall([1, 0, 0], { limp: true });  react.brace(grenade.position);  react.getUp();
//   react.state   'steady' | 'stagger' | 'falling' | 'down' | 'rising';   react.stepped / landed / rose: true for one frame (sounds)
//
// How it keeps its balance: the body is a weight on legs. A push sets the weight moving; where it would
// come to rest (its speed over the pendulum's rate ahead of it) is the capture point. While that lies
// between the feet the body only sways; outside them a foot steps to it, as people do; out of a step's
// reach, or with no ground to step on, the body falls. Kit use: games reach it through gs.characters.

import { Quaternion, Vector3 } from 'three';
import { reach } from './characters.js';
import { keys } from './poses.js';
import { caster } from './acoustics.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), TAU = Math.PI * 2;
const pair = v => Array.isArray(v) ? v : [v, v];
const vec = v => Array.isArray(v) ? { x: v[0] || 0, y: v[1] || 0, z: v[2] || 0 } : { x: v?.x || 0, y: v?.y || 0, z: v?.z || 0 };
const _v = new Vector3(), _w = new Vector3(), _a = new Vector3(), _q = new Quaternion(), _q2 = new Quaternion();

// A pose given by how each part lies in the world seen from the side (radians from standing: the trunk
// leaning forward +, a limb swung forward -), which is the easy way to think about a body on the ground.
// T trunk, C chest, H head, A upper arms, F forearms, Th thighs, Sh shins (a number, or [left, right]);
// out: the arms out to the side; y: how high the hips are (metres); z: how far forward they have moved.
function side({ T = 0, C = T, H = C, A = C, F = A, Th = T, Sh = Th, out = 0, y = 1, z = 0, more = null }) {
  const [aL, aR] = pair(A), [fL, fR] = pair(F), [tL, tR] = pair(Th), [sL, sR] = pair(Sh), [oL, oR] = pair(out);
  const j = {
    hips: [T, 0, 0], spine: [C - T, 0, 0], head: [H - C, 0, 0],
    armL: [aL - C, 0, oL], foreL: [Math.min(0, fL - aL), 0, 0], armR: [aR - C, 0, -oR], foreR: [Math.min(0, fR - aR), 0, 0],
    legL: [tL - T, 0, 0], shinL: [Math.max(0, sL - tL), 0, 0], legR: [tR - T, 0, 0], shinR: [Math.max(0, sR - tR), 0, 0],
    footL: [0, 0, 0], footR: [0, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0],
  };
  if (more) for (const k in more) j[k] = [j[k][0] + more[k][0], j[k][1] + more[k][1], j[k][2] + more[k][2]];
  return { ...j, drop: (1 - y) / 1.8, shift: [0, 0, z] };
}
const PRONE = { T: 1.52, C: 1.5, H: 1.2, A: 1.5, F: 1.5, Th: 1.55, Sh: 1.6, out: .45, y: .13, more: { head: [0, .6, 0], footL: [.9, 0, 0], footR: [.9, 0, 0] } };
const SUPINE = { T: -1.52, C: -1.5, H: -1.45, A: -1.45, F: -1.5, Th: -1.5, Sh: -1.45, out: .5, y: .13, more: { footL: [-.5, 0, 0], footR: [-.5, 0, 0] } };
// getting up: from the front (push up, back onto the knees, a foot forward, stand) and from the back (sit up, tuck a leg, over onto a knee, stand)
const CLIPS = {
  upFront: { time: 2.5, keys: [
    [0, side(PRONE)],
    [.2, side({ T: 1.5, C: 1.42, H: 1.0, A: 2.3, F: .05, Th: 1.55, Sh: 1.6, out: .25, y: .13, more: { footL: [.4, 0, 0], footR: [.4, 0, 0] } })],
    [.4, side({ T: 1.2, C: 1.0, H: .55, A: .95, F: -.1, Th: 1.4, Sh: 1.62, out: .12, y: .17, z: -.03, more: { footL: [-.3, 0, 0], footR: [-.3, 0, 0] } })],
    [.56, side({ T: .95, C: .8, H: .35, A: -.15, F: -.2, Th: .2, Sh: 1.6, y: .48, z: -.38, more: { footL: [-.3, 0, 0], footR: [-.3, 0, 0] } })],
    [.7, side({ T: .3, C: .22, H: .1, A: .1, F: -.35, Th: .06, Sh: 1.6, y: .5, z: -.42, more: { footL: [-.3, 0, 0], footR: [-.3, 0, 0] } })],
    [.82, side({ T: .34, C: .3, H: .05, A: [-.85, .2], F: [-1.3, -.2], Th: [-1.45, .1], Sh: [.02, 1.6], y: .5, z: -.42, more: { footR: [-.3, 0, 0] } })],
    [.92, side({ T: .5, C: .4, H: .1, A: [-.5, .3], F: [-1.0, -.2], Th: [-.95, .3], Sh: [.45, 1.0], y: .74, z: -.2, more: { footR: [.5, 0, 0] } })],
    [1, side({ y: 1, z: -.04 })],
  ] },
  upBack: { time: 2.7, keys: [
    [0, side(SUPINE)],
    [.18, side({ T: -1.25, C: -1.0, H: -.6, A: -.5, F: -1.6, Th: -2.25, Sh: -.75, out: .3, y: .13 })],
    [.36, side({ T: -.4, C: -.12, H: .05, A: .55, F: .25, Th: -2.3, Sh: -.75, out: .2, y: .13 })],
    [.52, side({ T: .2, C: .3, H: .15, A: -.9, F: -1.5, Th: [-2.35, -1.75], Sh: [-.55, .9], out: .1, y: .15, z: .04 })],
    [.68, side({ T: .5, C: .45, H: .1, A: [-.9, -.4], F: [-1.4, -.9], Th: [-1.62, -.35], Sh: [.5, 1.55], y: .45, z: .36, more: { footR: [-.3, 0, 0] } })],
    [.8, side({ T: .36, C: .3, H: .05, A: [-.85, .2], F: [-1.3, -.2], Th: [-1.45, .1], Sh: [.02, 1.6], y: .5, z: .4, more: { footR: [-.3, 0, 0] } })],
    [.91, side({ T: .5, C: .4, H: .1, A: [-.5, .3], F: [-1.0, -.2], Th: [-.95, .3], Sh: [.45, 1.0], y: .74, z: .62, more: { footR: [.5, 0, 0] } })],
    [1, side({ y: 1, z: .78 })],
  ] },
  // falls acted out, for a game with no physics world: over the toes onto the hands, or back onto the seat and over
  fallFront: { time: .95, keys: [
    [0, side({})],
    [.38, side({ T: .42, C: .5, H: .2, A: -1.3, F: -1.9, Th: .36, Sh: .55, out: .15, y: .93, z: .38 })],
    [.7, side({ T: 1.05, C: 1.12, H: .7, A: -.9, F: -1.3, Th: .98, Sh: 1.25, out: .2, y: .5, z: .86 })],
    [.87, side({ T: 1.42, C: 1.36, H: .95, A: .9, F: -.5, Th: 1.45, Sh: 1.62, out: .4, y: .17, z: 1.0 })],
    [1, side({ ...PRONE, z: 1.03 })],
  ] },
  fallBack: { time: 1.05, keys: [
    [0, side({})],
    [.34, side({ T: -.32, C: -.12, H: .25, A: .85, F: .55, Th: -.62, Sh: -.2, out: .25, y: .82, z: -.36 })],
    [.62, side({ T: -.55, C: -.25, H: .2, A: 1.0, F: .7, Th: -1.95, Sh: -.85, out: .3, y: .24, z: -.74 })],
    [.84, side({ T: -1.25, C: -1.1, H: -.7, A: -.5, F: -.9, Th: -2.2, Sh: -1.2, out: .7, y: .14, z: -.8 })],
    [1, side({ ...SUPINE, z: -.82 })],
  ] },
};
const clipOf = n => { const c = CLIPS[n]; c.fn ||= keys(c.keys); return c; };
// arms and head set to save themselves as the body goes down (the ragdoll's muscles pull towards this): forward, back, to the side
const SAVE = {
  front: { armL: [-1.25, 0, .3], armR: [-1.25, 0, -.3], foreL: [-.6, 0, 0], foreR: [-.6, 0, 0], head: [-.4, 0, 0], spine: [.15, 0, 0], legL: [-.35, 0, 0], legR: [-.5, 0, 0], shinL: [.6, 0, 0], shinR: [.8, 0, 0] },
  back: { armL: [.75, 0, .5], armR: [.75, 0, -.5], foreL: [-.35, 0, 0], foreR: [-.35, 0, 0], head: [.5, 0, 0], spine: [.4, 0, 0], legL: [-.7, 0, 0], legR: [-.6, 0, 0], shinL: [.9, 0, 0], shinR: [.8, 0, 0] },
  left: { armL: [-.3, 0, 1.3], armR: [-.5, 0, .2], foreL: [-.5, 0, 0], foreR: [-1.2, 0, 0], head: [0, 0, .3], spine: [.1, 0, .2], legL: [-.3, 0, .3], legR: [-.5, 0, 0], shinL: [.5, 0, 0], shinR: [.8, 0, 0] },
};
SAVE.right = Object.fromEntries(Object.entries(SAVE.left).map(([k, v]) => [k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k, [v[0], -v[1], -v[2]]]));
// arms up over the face against something coming (brace()): turned a little from it, head down
// how a body that is awake lies once it has landed (held only weakly: nothing left folded right up or in the air)
const LIE = { armL: [0, 0, .55], armR: [0, 0, -.55], foreL: [-.5, 0, 0], foreR: [-.5, 0, 0], legL: [-.1, 0, .08], legR: [-.1, 0, -.08], shinL: [.15, 0, 0], shinR: [.15, 0, 0] };
const GUARD = { spine: [.3, 0, 0], head: [.35, 0, 0], armL: [-1.75, -.5, .15], armR: [-1.9, .5, -.15], foreL: [-1.9, 0, 0], foreR: [-1.8, 0, 0], legL: [-.25, 0, 0], legR: [-.3, 0, 0], shinL: [.5, 0, 0], shinR: [.55, 0, 0] };
// springs for the parts a blow sets moving: [stiffness, damping]
const SPRING = { hips: [90, 11], spine: [120, 11], head: [150, 12], armL: [55, 7], armR: [55, 7], legL: [120, 13], legR: [120, 13], shinL: [130, 13], shinR: [130, 13] };

/**
 * body: the character (a Group with .rig, facing +z, turned by rotation.y). Options: world (a gs.physics3d
 * World3D: falls become a jointed ragdoll; without it they are acted), mover (the World3D mover that walks
 * it: staggering then respects walls, and it is put back where the body gets up), ground ((x, z) => floor
 * height: uneven floors and edges to fall off; -Infinity for a pit), level (what it can run into: a World3D, a City, a function...
 * as gs.sound.Ears takes; default the world), steady (how hard it is to knock over: 1 a person, 2 a brute,
 * .5 someone already hurt), rest (seconds it lies before getting up by itself; Infinity: only when told),
 * walls (false: no bracing against walls).
 */
export class Reactions {
  constructor(body, { rig = body.rig, world = null, mover = null, ground = null, level = world, steady = 1, rest = 1.4, walls = true } = {}) {
    if (!rig?.parts?.hips) throw new Error('Reactions: the character needs a gs.poses rig (figure(), person(), gs.models.human())');
    Object.assign(this, { body, rig, world, mover, ground, steady, rest, walls });
    this.cast = level ? caster(level) : null;
    this.state = 'steady'; this.stepped = this.landed = this.rose = false; this.impact = 0; this.limp = false;
    this.spr = {}; for (const n in SPRING) if (rig.parts[n]) this.spr[n] = { o: [0, 0, 0], v: [0, 0, 0] };
    this.c = { x: 0, z: 0 }; this.cv = { x: 0, z: 0 }; this.u = { x: 0, z: 0 }; this.last = null;   // the weight's offset and speed over the feet; the speed the body was carried at
    this.feet = [0, 1].map(i => ({ side: i ? -1 : 1, pos: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, T: .2, q: [new Quaternion(), new Quaternion(), new Quaternion()] }));
    this.ik = 0; this.sink = 0; this.dip = 0; this.dipV = 0; this.guard = 0; this.guardT = 0; this.guardTurn = 0; this.wall = 0; this.wallAt = new Vector3();
    this.doll = null; this.clip = null; this.held = null; this.own = 0; this.t = 0;
    this.footEnds = rig.feet || [rig.parts.footL, rig.parts.footR];
  }
  /** true while the character is not the game's to steer (staggering, falling, down or getting up). */
  get busy() { return this.state !== 'steady'; }
  /** true while it lies on the ground. */
  get down() { return this.state === 'down'; }
  get scale() { return this.body.getWorldScale(_v).y || 1; }
  floor(x, z) { return this.ground ? (this.ground(x, z) ?? this.body.position.y) : this.body.position.y; }
  // a world direction in the body's own terms (x to its left, z the way it faces)
  local(x, z) { const a = this.body.rotation.y, c = Math.cos(a), s = Math.sin(a); return [x * c - z * s, x * s + z * c]; }

  /**
   * A blow: push is the change of speed it would give the body (metres a second, a world direction: [x, y, z]
   * or { x, y, z }); at is where it lands (a world point; default the chest). Light blows only make the part
   * that was hit give; harder ones set the body staggering; harder still knock it down. A blow to the legs
   * buckles them; one that lands while it is falling or down pushes the ragdoll.
   */
  hit(push, at = null) {
    const p = vec(push), s = this.scale, b = this.body.position, power = Math.hypot(p.x, p.y, p.z); if (!(power > 0)) return this;
    if (this.doll) { const a = at ? vec(at) : null, part = a ? this.nearest(a) : 'spine'; this.doll.hit(part, p.x, p.y, p.z, a); return this; }
    if (this.state === 'falling' || this.state === 'down' || this.state === 'rising') return this;
    const a = at ? vec(at) : { x: b.x, y: b.y + 1.25 * s, z: b.z }, h = (a.y - b.y) / s, [lx, lz] = this.local(p.x, p.z), [ax] = this.local(a.x - b.x, a.z - b.z);
    const S = this.spr, kick = (n, x, y, z) => { const q = S[n]; if (q) { q.v[0] += x; q.v[1] += y; q.v[2] += z; } };
    const k = 2.6 / Math.sqrt(this.steady), off = clamp(ax / s, -.3, .3);
    if (h > 1.45) { kick('head', lz * k * 2.2, -lz * off * k * 6, -lx * k * 2.2); kick('spine', lz * k * .7, 0, -lx * k * .7); }
    else if (h > .78) {
      const arm = Math.abs(off) > .17 ? (off > 0 ? 'armL' : 'armR') : null;
      kick('spine', lz * k * 1.5, -lz * off * k * 9, -lx * k * 1.5); kick('head', -lz * k * .9, 0, lx * k * .9); kick('hips', lz * k * .5, -lz * off * k * 3, -lx * k * .5);
      if (arm) kick(arm, -lz * k * 2.5, 0, -lx * k * 2.5);
    } else {
      const sd = off >= 0 ? 'L' : 'R';
      kick('shin' + sd, power * k * 1.6, 0, 0); kick('leg' + sd, -power * k * .8, 0, 0); kick('hips', lz * k * .4, 0, -lx * k * .4); this.dipV += power * .12;
    }
    // the whole body: a blow high up topples more than one at the waist; one at the legs takes them from under it
    const lever = h > .78 ? clamp(h / 1.15, .6, 1.35) : .75, m = lever / this.steady;
    this.cv.x += p.x * m; this.cv.z += p.z * m;
    // (what goDown takes is the speed of the whole body: what it was carried at and what the blow added)
    const u = this.u;
    if (h <= .78 && power * m > 1.5) this.goDown({ x: u.x * .85 + p.x * .4, y: 0, z: u.z * .85 + p.z * .4 }, { at: a, push: p });
    else if (p.y * m > 2.2 || power * m > 3.4) this.goDown({ x: u.x + p.x * m, y: p.y * m, z: u.z + p.z * m }, { at: a, push: p });
    return this;
  }
  /** Thrown by an explosion at `point`: strength is metres a second at the centre, falling to nothing at `radius`. */
  blast(point, strength = 8, radius = 6) {
    const c = vec(point), b = this.body.position, s = this.scale, dx = b.x - c.x, dy = b.y + s - c.y, dz = b.z - c.z, d = Math.hypot(dx, dy, dz) || 1, k = strength * Math.max(0, 1 - d / radius);
    if (k > 0) this.hit([dx / d * k, (dy / d + .35) * k, dz / d * k], { x: b.x - dx / d * .2, y: b.y + 1.15 * s, z: b.z - dz / d * .2 });
    return this;
  }
  /** The legs caught on something: it stumbles forward, and goes down if it was moving fast. dir: a world direction (default: the way it is going). */
  trip(dir = null) {
    if (this.state !== 'steady' && this.state !== 'stagger') return this;
    const u = this.u, d = dir ? vec(dir) : u, l = Math.hypot(d.x, d.z), sp = Math.hypot(u.x, u.z);
    const f = l > .01 ? { x: d.x / l, z: d.z / l } : { x: Math.sin(this.body.rotation.y), z: Math.cos(this.body.rotation.y) }, b = this.body.position;
    // at a run the feet stop and the rest of it keeps going; slower, it is a stumble it can step out of
    if (sp > 2.6 * Math.sqrt(this.steady)) return this.goDown({ x: u.x * .8 + f.x * .4, y: 0, z: u.z * .8 + f.z * .4 });
    return this.hit([f.x * (1 + sp * .45), 0, f.z * (1 + sp * .45)], { x: b.x, y: b.y + 1.5 * this.scale, z: b.z });
  }
  /** Goes down now: push is the speed it is thrown at (metres a second). limp: it has nobody in it (knocked out, shot) and stays down. */
  fall(push = null, { limp = false } = {}) {
    const u = this.u, going = Math.hypot(u.x, u.z) > 1;   // (with no push: on the way it was going, or back off its heels from a stand)
    const p = push ? vec(push) : going ? { x: 0, y: 0, z: 0 } : { x: -Math.sin(this.body.rotation.y) * 1.2, y: 0, z: -Math.cos(this.body.rotation.y) * 1.2 };
    if (this.doll) { this.doll.push(p.x, p.y, p.z); if (limp) { this.limp = true; this.saving = false; this.doll.relax(); } return this; }
    if (this.state === 'falling' || this.state === 'down') { this.limp ||= limp; return this; }
    return this.goDown({ x: u.x + p.x, y: p.y || 0, z: u.z + p.z }, { limp });
  }
  /** Arms up against something coming from `from` (a world point), for `seconds`. */
  brace(from = null, seconds = .8) {
    this.guardT = seconds;
    if (from) { const f = vec(from), b = this.body.position, [lx] = this.local(f.x - b.x, f.z - b.z); this.guardTurn = clamp(-lx, -1, 1) * .45; } else this.guardTurn = 0;
    return this;
  }
  /** Gets up, when it is down and not limp (it does so by itself after `rest` seconds). revive: true brings a limp body round first. */
  getUp({ revive = false } = {}) {
    if (this.state !== 'down' || (this.limp && !revive)) return this;
    this.limp = false; return this.rise();
  }
  /** Stands it up at once where it is, steady and unhurt (a new round, a respawn). */
  reset() {
    if (this.doll) { this.doll.remove(); this.doll = null; }
    if (this.state !== 'steady') { this.body.updateMatrixWorld(true); this.rig.parts.hips.position.set(this.rig.hipX, this.rig.hip0, this.rig.hipZ); }
    this.setMover(true); if (this.rig.stride) this.rig.stride.hold = false;
    this.state = 'steady'; this.limp = false; this.clip = this.held = null; this.own = 0; this.ik = 0; this.sink = 0; this.c.x = this.c.z = this.cv.x = this.cv.z = this.u.x = this.u.z = 0; this.last = null;
    for (const n in this.spr) { this.spr[n].o.fill(0); this.spr[n].v.fill(0); }
    return this;
  }

  // ---- each frame
  /** Call each frame after rig.update(dt). */
  update(dt) {
    this.stepped = this.landed = this.rose = false;
    if (!(dt > 0)) return this;
    dt = Math.min(dt, .05); this.t += dt;
    const b = this.body.position, st = this.state;
    if (st === 'steady' || st === 'stagger') {
      // the speed the game is carrying it at (what a shove is added to)
      if (st === 'steady') { if (this.last) { const k = Math.min(1, dt * 12), vx = (b.x - this.last.x) / dt, vz = (b.z - this.last.z) / dt; if (Math.hypot(vx, vz) < 30) { this.u.x += (vx - this.u.x) * k; this.u.z += (vz - this.u.z) * k; } } (this.last ||= { x: 0, z: 0 }).x = b.x; this.last.z = b.z; }
      if (st === 'steady') this.sway(dt); else this.stagger(dt);
      if (this.state === 'steady' || this.state === 'stagger') { this.flinch(dt); this.arms(dt); if (this.ik > 0) this.legs(dt); }
    }
    if (this.state === 'falling' || this.state === 'down') this.lie(dt);
    else if (this.state === 'rising') this.play(dt);
    if (this.own > 0 && this.held && this.state === 'steady') { this.mix(this.held, this.own); this.own = Math.max(0, this.own - dt / .3); if (!this.own) this.held = null; }
    this.rig.fill?.();   // (a full skeleton: the joints in between follow what was turned above, a ragdoll's bodies included)
    if (this.rig.stride) this.rig.stride.hold = this.state !== 'steady';   // (off its balance, the feet are placed here: the rig lets go of them)
    return this;
  }
  // standing its ground: the weight sways over the feet and comes back; past the edge of the feet it has to step
  sway(dt) {
    const c = this.c, v = this.cv, w = 3.13 / Math.sqrt(this.scale), n = Math.max(1, Math.ceil(dt / .012)), h = dt / n;
    for (let i = 0; i < n; i++) { v.x += (-70 * c.x - 11 * v.x) * h; v.z += (-70 * c.z - 11 * v.z) * h; c.x += v.x * h; c.z += v.z * h; }
    if (Math.hypot(c.x + v.x / w, c.z + v.z / w) > .13 * this.steady * this.scale) this.startStagger();
    else this.lean(c.x, c.z, 1.1);
    this.ik = Math.max(0, this.ik - dt / .2);
  }
  // the lean of the trunk for a weight this far off its feet (and the hips carried with it)
  lean(x, z, k) {
    const [lx, lz] = this.local(x, z), P = this.rig.parts, s = this.scale, t = clamp(lz / s * k, -.6, .6), r = clamp(lx / s * k, -.6, .6);
    P.hips.rotation.x += t * .55; P.hips.rotation.z -= r * .55;
    if (P.spine) { P.spine.rotation.x -= t * .2; P.spine.rotation.z += r * .2; }
    if (P.head) { P.head.rotation.x -= t * .3; P.head.rotation.z += r * .3; }
    // (standing: the hips go with the weight and the legs lean back to keep the feet where they are)
    if (this.state === 'steady') { P.hips.position.x += lx / s; P.hips.position.z += lz / s; for (const n of ['legL', 'legR']) if (P[n]) { P[n].rotation.x += lz / s * 1.1 - t * .55; P[n].rotation.z += r * .55 - lx / s * 1.1; } }
  }
  startStagger() {
    this.state = 'stagger'; this.steps = 0; this.leaving = false; this.body.updateMatrixWorld(true);
    const b = this.body.position, s = this.scale, yaw = this.body.rotation.y, lx = Math.cos(yaw), lz = -Math.sin(yaw);
    this.feet.forEach((f, i) => {
      const e = this.footEnds[i];
      if (e) e.getWorldPosition(f.pos); else f.pos.set(b.x + lx * f.side * .1 * s, 0, b.z + lz * f.side * .1 * s);
      f.pos.y = this.floor(f.pos.x, f.pos.z); f.t = 1;
    });
    // the weight starts where the sway had carried it, moving as it was
    this.com = { x: b.x + this.c.x, z: b.z + this.c.z }; this.c.x = this.c.z = 0;
    if (this.mover) this.moverAt = { x: b.x, z: b.z };
  }
  // out of balance: step to where the weight is going, or fall
  stagger(dt) {
    const s = this.scale, w = 3.13 / Math.sqrt(s), v = this.cv, u = this.u, com = this.com, b = this.body.position, F = this.feet;
    if (this.mover) {   // what the walls let through last frame
      const ax = (b.x - this.moverAt.x) / dt, az = (b.z - this.moverAt.z) / dt, wx = this.want?.x ?? ax, wz = this.want?.z ?? az;
      if (Math.hypot(wx - ax, wz - az) > .4) { v.x = ax - u.x; v.z = az - u.z; }
      com.x = b.x; com.z = b.z;
    }
    const cpx = com.x + v.x / w, cpz = com.z + v.z / w, down = F.filter(f => f.t >= 1);
    // the nearest the feet can put their pressure to the capture point
    let sx, sz;
    if (down.length === 2) { const a = down[0].pos, c = down[1].pos, dx = c.x - a.x, dz = c.z - a.z, t = clamp(((cpx - a.x) * dx + (cpz - a.z) * dz) / Math.max(1e-6, dx * dx + dz * dz), 0, 1); sx = a.x + dx * t; sz = a.z + dz * t; }
    else { const a = (down[0] || F[0]).pos; sx = a.x; sz = a.z; }
    let ox = cpx - sx, oz = cpz - sz; const od = Math.hypot(ox, oz), pad = .075 * s, outside = od - pad;
    if (od > pad) { ox *= pad / od; oz *= pad / od; } sx += ox; sz += oz;
    const n = Math.max(1, Math.ceil(dt / .012)), h = dt / n, loss = Math.exp(-.7 * h), slow = Math.exp(-2.4 * h);
    for (let i = 0; i < n; i++) { v.x = (v.x + w * w * (com.x - sx) * h) * loss; v.z = (v.z + w * w * (com.z - sz) * h) * loss; u.x *= slow; u.z *= slow; com.x += (v.x + u.x) * h; com.z += (v.z + u.z) * h; }
    const sp = Math.hypot(v.x, v.z), lean = Math.hypot(com.x - sx, com.z - sz);
    if (lean > .5 * s * Math.sqrt(this.steady)) return this.goDown({ x: v.x + u.x, y: 0, z: v.z + u.z });
    // feet in the air
    for (const f of F) if (f.t < 1) {
      f.t = Math.min(1, f.t + dt / f.T); const e = f.t * f.t * (3 - 2 * f.t);
      f.pos.lerpVectors(f.from, f.to, e); f.pos.y += Math.sin(Math.PI * f.t) * f.lift;
      if (f.t >= 1) { f.pos.copy(f.to); this.stepped = true; }
    }
    if (down.length === 2 && !this.leaving) {
      const yaw = this.body.rotation.y, lx = Math.cos(yaw), lz = -Math.sin(yaw);
      if (outside > .03 * s) {
        // a step to catch it: the foot furthest from where the weight is going, put a little past that point
        const f = Math.hypot(F[0].pos.x - cpx, F[0].pos.z - cpz) > Math.hypot(F[1].pos.x - cpx, F[1].pos.z - cpz) ? F[0] : F[1], o = f === F[0] ? F[1] : F[0];
        const d = sp > .01 ? { x: v.x / sp, z: v.z / sp } : { x: 0, z: 0 }, over = (.05 + .1 * Math.min(2, sp)) * s;
        let tx = cpx + d.x * over + lx * f.side * .06 * s, tz = cpz + d.z * over + lz * f.side * .06 * s;
        const rx = tx - o.pos.x, rz = tz - o.pos.z, r = Math.hypot(rx, rz), most = .82 * s;
        if (r > most) { tx = o.pos.x + rx / r * most; tz = o.pos.z + rz / r * most; }
        const gy = this.floor(tx, tz), short = Math.hypot(cpx - tx, cpz - tz);
        if (++this.steps > 7 || short > .4 * s * this.steady || gy < b.y - .45 * s) return this.goDown({ x: v.x + u.x, y: 0, z: v.z + u.z });
        f.from.copy(f.pos); f.to.set(tx, gy, tz); f.t = 0; f.T = .15 + .09 * Math.min(1, r / most); f.lift = (.05 + .07 * Math.min(1, r / most)) * s;
      } else if (sp < .5) {
        // balance kept: the feet come back under the body one at a time, then it is the game's again
        let worst = null, wd = .15 * s;
        for (const f of F) { const hx = com.x + lx * f.side * .1 * s, hz = com.z + lz * f.side * .1 * s, d = Math.hypot(f.pos.x - hx, f.pos.z - hz); if (d > wd) { wd = d; worst = f; f.hx = hx; f.hz = hz; } }
        if (worst) { worst.from.copy(worst.pos); worst.to.set(worst.hx, this.floor(worst.hx, worst.hz), worst.hz); worst.t = 0; worst.T = .24; worst.lift = .06 * s; }
        else if (sp < .14 && Math.hypot(u.x, u.z) < .4) this.leaving = true;
      }
    }
    // the body goes with the weight
    if (this.mover) { this.want = { x: v.x + u.x, z: v.z + u.z }; this.mover.walk(this.want.x, this.want.z); this.moverAt.x = b.x; this.moverAt.z = b.z; }
    else {
      let mx = com.x - b.x, mz = com.z - b.z; const md = Math.hypot(mx, mz);
      if (this.cast && md > 1e-4) {   // a wall stops it
        const free = this.cast({ x: b.x, y: b.y + s, z: b.z }, { x: mx / md, y: 0, z: mz / md }, md + .32 * s) - .32 * s;
        if (free < md) { const k = Math.max(0, free) / md; mx *= k; mz *= k; com.x = b.x + mx; com.z = b.z + mz; const into = (v.x * mx + v.z * mz) / md; if (into > 0) { v.x -= mx / md * into * 1.2; v.z -= mz / md * into * 1.2; } u.x = u.z = 0; }
      }
      b.x += mx; b.z += mz;
    }
    if (this.ground) b.y += (this.floor(b.x, b.z) - b.y) * Math.min(1, dt * 10);
    this.lean(com.x - sx, com.z - sz, .8);
    const P = this.rig.parts, fl = Math.min(1.1, sp * .55);   // arms out for balance
    if (P.armL) P.armL.rotation.z += fl * this.ik; if (P.armR) P.armR.rotation.z -= fl * this.ik;
    if (this.leaving) { this.ik = Math.max(0, this.ik - dt / .22); if (this.ik <= 0) { this.state = 'steady'; this.sink = 0; this.c.x = this.c.z = 0; v.x = v.z = 0; this.last = null; this.want = null; if (this.mover) this.mover.walk(0, 0); } }
    else this.ik = Math.min(1, this.ik + dt / .07);
  }
  // legs bent to keep each foot where it stands, the hips sunk as far as that takes
  legs(dt) {
    const P = this.rig.parts, body = this.body, s = this.scale, k = this.ik; if (!P.legL || !P.shinL || !P.legR || !P.shinR) return;
    const L = [[P.legL, P.shinL, this.footEnds[0]], [P.legR, P.shinR, this.footEnds[1]]], up = this.footEnds[0] ? .088 * s : .1 * s;
    for (let i = 0; i < 2; i++) { const [l, sh, e] = L[i], q = this.feet[i].q; q[0].copy(l.quaternion); q[1].copy(sh.quaternion); if (e) q[2].copy(e.quaternion); }
    body.updateMatrixWorld(true);
    let need = 0;
    for (let i = 0; i < 2; i++) {
      const [l, sh, e] = L[i], f = this.feet[i], hip = l.getWorldPosition(_v), len = (sh.position.length() + (e ? e.position.length() : sh.userData.ikLength ?? .43)) * s * .985;
      const dx = Math.hypot(f.pos.x - hip.x, f.pos.z - hip.z), ty = f.pos.y + up;
      need = Math.max(need, dx < len ? (hip.y - ty) - Math.sqrt(len * len - dx * dx) : hip.y - ty - .2 * s);
    }
    this.sink += (Math.max(0, need) - this.sink) * Math.min(1, dt * 18);
    P.hips.position.y -= this.sink * k / s; body.updateMatrixWorld(true);
    const fwd = _w.set(0, 0, 1).transformDirection(body.matrixWorld).clone();
    for (let i = 0; i < 2; i++) {
      const [l, sh, e] = L[i], f = this.feet[i], q = f.q;
      _a.copy(f.pos); _a.y += up;
      reach(l, sh, _a, { pole: sh.getWorldPosition(_v).addScaledVector(fwd, 1), end: e || undefined, length: e ? undefined : sh.userData.ikLength ?? .43 });
      if (e) { sh.updateWorldMatrix(true, false); sh.getWorldQuaternion(_q).invert().multiply(body.getWorldQuaternion(_q2)); e.quaternion.copy(_q); if (f.t < 1) e.rotateX(Math.sin(Math.PI * f.t) * .35); }
      if (k < 1) { l.quaternion.slerpQuaternions(q[0], _q.copy(l.quaternion), k); sh.quaternion.slerpQuaternions(q[1], _q.copy(sh.quaternion), k); if (e) e.quaternion.slerpQuaternions(q[2], _q.copy(e.quaternion), k); }
    }
  }
  // the parts a blow set moving swing and settle; the knees give under one to the legs
  flinch(dt) {
    const P = this.rig.parts, n = Math.max(1, Math.ceil(dt / .01)), h = dt / n;
    for (const name in this.spr) {
      const q = this.spr[name], [K, C] = SPRING[name], o = q.o, v = q.v;
      if (Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]) + Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) < 1e-4) continue;
      for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { v[a] += (-K * o[a] - C * v[a]) * h; o[a] = clamp(o[a] + v[a] * h, -1.1, 1.1); }
      const r = P[name].rotation; r.x += name.startsWith('shin') ? Math.max(0, o[0]) : o[0]; r.y += o[1]; r.z += o[2];
    }
    if (this.dip || this.dipV) { for (let i = 0; i < n; i++) { this.dipV += (-90 * this.dip - 12 * this.dipV) * h; this.dip += this.dipV * h; } if (Math.abs(this.dip) + Math.abs(this.dipV) < 1e-4) this.dip = this.dipV = 0; P.hips.position.y -= Math.max(0, this.dip); }
  }
  // arms: up over the face (brace()), and out against a wall the body is about to meet
  arms(dt) {
    const P = this.rig.parts, s = this.scale, b = this.body.position;
    this.guardT -= dt; this.guard += ((this.guardT > 0 ? 1 : 0) - this.guard) * Math.min(1, dt * (this.guardT > 0 ? 16 : 6));
    if (this.guard > .003) {
      const g = this.guard;
      for (const n in GUARD) { const p = P[n]; if (!p) continue; const a = GUARD[n], base = this.rig.base.get(n), r = p.rotation; r.x += (base[0] + a[0] - r.x) * g; r.y += (base[1] + a[1] + (n === 'spine' ? this.guardTurn : 0) - r.y) * g; r.z += (base[2] + a[2] - r.z) * g; }
      P.hips.position.y -= .07 * g;
    }
    let want = 0;
    if (this.walls && this.cast && P.armL && P.foreL && P.armR && P.foreR) {
      const vx = this.u.x + this.cv.x, vz = this.u.z + this.cv.z, sp = Math.hypot(vx, vz);
      if (sp > 1.1) {
        const d = { x: vx / sp, y: 0, z: vz / sp }, from = { x: b.x, y: b.y + 1.28 * s, z: b.z }, look = (.5 + sp * .26) * s, free = this.cast(from, d, look);
        if (free < look) {
          want = 1; this.wallAt.set(from.x + d.x * free, from.y, from.z + d.z * free); this.wallDir = d;
          if (free < .42 * s && sp > 2.3 && this.t - (this.bumped ?? -9) > .7) { this.bumped = this.t; this.u.x = this.u.z = 0; this.hit([-d.x * sp * .55, 0, -d.z * sp * .55], { x: from.x + d.x * .2, y: from.y, z: from.z + d.z * .2 }); }
        }
      }
    }
    this.wall += (want - this.wall) * Math.min(1, dt * (want ? 14 : 5));
    if (this.wall > .01 && this.wallDir) {
      const d = this.wallDir, k = this.wall; this.body.updateMatrixWorld(true);
      for (const [arm, fore, hand, sd] of [[P.armL, P.foreL, P.handL, 1], [P.armR, P.foreR, P.handR, -1]]) {
        const q0 = _q.copy(arm.quaternion).clone(), q1 = fore.quaternion.clone();
        _a.set(this.wallAt.x - d.x * .04 * s + d.z * sd * .17 * s, this.wallAt.y + .06 * s, this.wallAt.z - d.z * .04 * s - d.x * sd * .17 * s);
        const el = arm.getWorldPosition(_v).clone(); el.y -= .5 * s; el.x += d.z * sd * .4 * s; el.z -= d.x * sd * .4 * s;
        reach(arm, fore, _a, { pole: el, end: hand || undefined, length: hand ? undefined : fore.userData.ikLength ?? .3 });
        if (k < 1) { arm.quaternion.slerpQuaternions(q0, _q2.copy(arm.quaternion), k); fore.quaternion.slerpQuaternions(q1, _q2.copy(fore.quaternion), k); }
      }
    }
  }

  // ---- going down, lying there, getting up
  nearest(a) {   // the rig part a world point is nearest to
    let best = 'spine', bd = Infinity; const P = this.rig.parts;
    for (const n of ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR']) { if (!P[n]) continue; P[n].getWorldPosition(_v); _w.set(0, n === 'head' ? .14 : n === 'spine' ? .2 : n === 'hips' ? 0 : -.2, 0).applyQuaternion(P[n].getWorldQuaternion(_q)).multiplyScalar(this.scale); const d = Math.hypot(_v.x + _w.x - a.x, _v.y + _w.y - a.y, _v.z + _w.z - a.z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  // The mover that walks it stands aside while it is not on its feet (nothing bumps into an empty capsule, and
  // it lets go of the character, which the ragdoll is placing), and is put back where the body gets up.
  setMover(on) {
    const m = this.mover; if (!m) return;
    try { m.collider?.setEnabled?.(on); } catch { /* gone */ }
    if (!on) { if (this.held0 === undefined) { this.held0 = m.mesh; m.mesh = null; } return; }
    if (this.held0 !== undefined) { m.mesh = this.held0; this.held0 = undefined; }
    m.walk(0, 0); m.place(this.body.position.x, this.body.position.y, this.body.position.z);
  }
  goDown(v, { limp = false, at = null, push = null } = {}) {
    const body = this.body, b = body.position, s = this.scale, sp = Math.hypot(v.x, v.z), u = this.u;
    this.state = 'falling'; this.limp = limp; this.fallT = 0; this.stillT = 0; this.vy0 = 0; this.vyT = 0; this.ik = 0; this.downT = 0; this.landedOnce = false; this.want = null;
    this.setMover(false);
    const d = sp > .05 ? { x: v.x / sp, z: v.z / sp } : { x: -Math.sin(body.rotation.y), z: -Math.cos(body.rotation.y) }, [lx, lz] = this.local(d.x, d.z);
    if (this.world?.ragdoll) {
      const doll = this.doll = this.world.ragdoll(body, { rig: this.rig });
      // v is the speed of its middle. A slow fall topples about the feet; a faster one carries the feet along as well
      // (they drag behind); thrown bodily, it turns less than it flies
      const thrown = clamp((sp - 3.5) / 3.5, 0, 1), hc = 1.0 * s, turn = clamp(sp / hc, .9, 3.2) * (1 - thrown * .5), mid = Math.max(sp, turn * hc), py = this.floor(b.x, b.z);
      for (const p of doll.parts) {
        const q = p.pos, k = mid + turn * (q.y - py - hc), along = (q.x - b.x) * d.x + (q.z - b.z) * d.z;
        p.setVel(d.x * k, (v.y || 0) + sp * .12 * thrown - turn * along, d.z * k);
      }
      if (at && push) doll.hit(this.nearest(at), push.x * .6, push.y * .6, push.z * .6, at);
      // with nobody in it the legs fold first (a body falling like a plank is one held stiff)
      if (limp) { const fx = Math.sin(body.rotation.y), fz = Math.cos(body.rotation.y); for (const n of ['shinL', 'shinR']) doll.bodies[n]?.push(fx * 1.4, -.3, fz * 1.4); for (const n of ['hips', 'spine', 'head']) doll.bodies[n]?.push(-fx * .3, -.9, -fz * .3); }
      if (!limp) {
        const save = {}, wf = Math.max(0, lz), wb = Math.max(0, -lz), wl = Math.max(0, lx), wr = Math.max(0, -lx), sum = wf + wb + wl + wr || 1;
        for (const [k, set] of [[wf, SAVE.front], [wb, SAVE.back], [wl, SAVE.left], [wr, SAVE.right]]) if (k > 0) for (const n in set) { const o = save[n] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] += set[n][i] * k / sum; }
        doll.drive(save, .55); this.saving = true;
      }
    } else {
      // acted: forwards over the toes or back onto the seat, whichever is nearer, turning that way as it goes
      const front = lz >= 0, yaw = Math.atan2(front ? d.x : -d.x, front ? d.z : -d.z);
      this.turn = { from: body.rotation.y, by: ((yaw - body.rotation.y + Math.PI * 3) % TAU) - Math.PI };
      this.start(front ? 'fallFront' : 'fallBack', .16, clamp(1.25 - sp * .12, .7, 1.15));
      const k = Math.min(1, 6 / (sp || 1)); this.slide = { x: v.x * k, z: v.z * k };   // (and it goes on the way it was going, less and less)
    }
    this.c.x = this.c.z = this.cv.x = this.cv.z = 0; u.x = u.z = 0; this.last = null;
    return this;
  }
  // a pose kept as it is now: every joint's turn, and where the hips are
  grab() { const q = {}, P = this.rig.parts; for (const n of this.rig.base.keys()) q[n] = P[n].quaternion.clone(); return { q, hip: P.hips.position.clone() }; }
  mix(held, k) { const P = this.rig.parts; for (const n in held.q) P[n].quaternion.slerp(held.q[n], k); P.hips.position.lerp(held.hip, k); }
  put(pose) {
    const rig = this.rig, P = rig.parts, k = rig.height / 1.8;
    for (const [n, base] of rig.base) { const a = pose.j[n] || [0, 0, 0]; P[n].rotation.set(base[0] + a[0], base[1] + a[1], base[2] + a[2]); }
    rig.fill?.(pose.j);   // (a full skeleton: its waist, neck and collar bones, from the joints the pose names)
    const sh = pose.shift || [0, 0, 0]; P.hips.position.set(rig.hipX + sh[0] * k, rig.hip0 - (pose.drop || 0) * rig.height + sh[1] * k, rig.hipZ + sh[2] * k);
  }
  start(name, fade = .4, rate = 1) { this.held = this.grab(); this.clip = { ...clipOf(name), name, t: 0, fade, in: 1, rate }; }
  // an acted move: the clip's pose over the game's, eased in from how the body was
  play(dt) {
    const c = this.clip; if (!c) return true;
    c.t = Math.min(1, c.t + dt * c.rate / c.time); c.in = Math.max(0, c.in - dt / c.fade);
    this.put(c.fn(c.t));
    if (c.in > 0 && this.held) this.mix(this.held, c.in * c.in * (3 - 2 * c.in));
    if (this.turn) { const e = Math.min(1, c.t / .4); this.body.rotation.y = this.turn.from + this.turn.by * e * e * (3 - 2 * e); }
    if (c.t < 1) return false;
    if (this.state === 'rising') {   // on its feet: the body moves to where the hips have come to, and the game has it back
      const P = this.rig.parts, body = this.body, sh = c.fn(1).shift || [0, 0, 0], a = body.rotation.y, s = this.scale;
      body.position.x += (sh[0] * Math.cos(a) + sh[2] * Math.sin(a)) * s; body.position.z += (-sh[0] * Math.sin(a) + sh[2] * Math.cos(a)) * s;
      P.hips.position.set(this.rig.hipX, P.hips.position.y, this.rig.hipZ);
      this.held = this.grab(); this.own = 1; this.clip = null; this.state = 'steady'; this.rose = true; this.setMover(true);
    }
    return true;
  }
  // falling and lying: the ragdoll (or the acted fall), the thud, and when it has lain long enough, up again
  lie(dt) {
    const doll = this.doll;
    this.fallT += dt;
    if (doll) {
      doll.sync();
      const sp = doll.bodies.spine || doll.root, vy = sp.vel.y;   // (the chest was dropping and has been stopped: nothing but the ground does that)
      if (vy < this.vy0 || this.fallT - this.vyT > .2) { this.vy0 = vy; this.vyT = this.fallT; }   // (its fastest drop in the last fifth of a second: arms that break the fall stop it over several frames)
      if (!this.landedOnce && this.vy0 < -1.3 && vy > this.vy0 * .35) { this.landedOnce = this.landed = true; this.impact = -this.vy0; this.landT = this.fallT; }
      if (this.saving && (this.limp || (this.landedOnce && this.fallT - this.landT > .25) || this.fallT > 1.6)) { this.saving = false; if (this.limp) doll.relax(); else doll.drive(LIE, .2); }
      if (this.state === 'falling') {
        this.stillT = doll.still(.3) ? this.stillT + dt : 0;
        if (this.stillT > .3 || this.fallT > 5) { this.state = 'down'; this.downT = 0; if (!this.landedOnce) { this.landedOnce = this.landed = true; this.impact = 1; } }
      }
    } else if (this.state === 'falling') {
      const was = this.clip?.t ?? 1; const done = this.play(dt), sl = this.slide;
      if (sl) { const b = this.body.position, k = Math.exp(-3.5 * dt); b.x += sl.x * dt; b.z += sl.z * dt; sl.x *= k; sl.z *= k; if (this.ground) b.y = this.floor(b.x, b.z); }
      if (!this.landedOnce && was < .86 && (this.clip?.t ?? 1) >= .86) { this.landedOnce = this.landed = true; this.impact = 3; }
      if (done) {   // lying where it fell: the body moves under the hips
        const c = this.clip, sh = c.fn(1).shift || [0, 0, 0], body = this.body, a = body.rotation.y, s = this.scale, P = this.rig.parts;
        body.position.x += (sh[0] * Math.cos(a) + sh[2] * Math.sin(a)) * s; body.position.z += (-sh[0] * Math.sin(a) + sh[2] * Math.cos(a)) * s;
        P.hips.position.x = this.rig.hipX; P.hips.position.z = this.rig.hipZ;
        this.lying = this.grab(); this.prone = c.name === 'fallFront'; this.clip = null; this.turn = null; this.state = 'down'; this.downT = 0;
      }
    } else if (this.lying) this.mix(this.lying, 1);
    if (this.state === 'down') {
      this.downT += dt;
      if (this.limp) { if (doll && this.downT > 3 && doll.still(.15)) { this.prone = this.settle(); this.lying = this.grab(); } }   // (a body that will lie there needs no physics)
      else if (this.downT >= this.rest) this.rise();
    }
  }
  // The ragdoll is done with: the character is put on the ground under its hips, turned the way a person
  // getting up from there would face, with its bones left exactly as they lie. Says whether it lies face down.
  settle() {
    const body = this.body, P = this.rig.parts, s = this.scale;
    body.updateMatrixWorld(true);
    const hp = P.hips.getWorldPosition(new Vector3()), hq = P.hips.getWorldQuaternion(new Quaternion()), chest = (P.spine || P.hips);
    const face = _v.set(0, 0, 1).applyQuaternion(chest.getWorldQuaternion(_q)), hd = (P.head || chest).getWorldPosition(_w), prone = face.y < 0;
    let dx = hd.x - hp.x, dz = hd.z - hp.z; if (Math.hypot(dx, dz) < .05) { dx = Math.sin(body.rotation.y); dz = Math.cos(body.rotation.y); }
    this.doll.remove(); this.doll = null;
    body.rotation.y = prone ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
    let gy = this.ground ? this.floor(hp.x, hp.z) : null;
    if (gy == null || !Number.isFinite(gy)) { const hit = this.world?.ray?.({ x: hp.x, y: hp.y + .3 * s, z: hp.z }, { x: 0, y: -1, z: 0 }, 3 * s); gy = hit ? hit.point.y : hp.y - .13 * s; }
    _a.set(hp.x, gy, hp.z); if (body.parent) body.parent.worldToLocal(_a); body.position.copy(_a); body.updateMatrixWorld(true);
    const par = P.hips.parent; P.hips.position.copy(par.worldToLocal(hp)); P.hips.quaternion.copy(par.getWorldQuaternion(_q).invert().multiply(hq));
    return prone;
  }
  rise() {
    let prone = this.prone;
    if (this.doll) prone = this.settle(); else if (this.lying) this.mix(this.lying, 1);
    this.lying = null; this.state = 'rising'; this.turn = null;
    this.start(prone ? 'upFront' : 'upBack', .5);
    return this;
  }
}
