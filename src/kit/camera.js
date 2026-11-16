// Camera rigs for 3D games (Console, Next Gen, AR's non-camera scenes): chase, over the shoulder,
// first person, top down, side on, orbit and on rails. The rig only moves the camera; what the game
// looks like is still up to you. It keeps the camera out of walls, blends smoothly when you switch
// rigs, and does shake and FOV kicks.
//
//   const { CameraRig } = gs.camera;
//   reset() { rig = new CameraRig(v, { mode: 'chase', distance: 6, height: 2.2, walls: [level] }); }
//   update(dt) {
//     rig.yaw += dragX * .01; rig.pitch += dragY * .01;   // look around (orbit, shoulder and first person)
//     rig.update(dt, hero);                              // hero: any Object3D, or { position, yaw }
//   }
//   rig.to('shoulder', .4);   // blend to another rig over .4 s ('chase', 'shoulder', 'first', 'top', 'side', 'orbit', 'rail', 'fixed')
//   rig.shake(.5);  rig.kick(8, .25);   // trauma shake; FOV +8 degrees for .25 s (a boost or a big hit)
//   rig.recoil(.02);                      // a shot punches the view up .02 rad; it holds a moment and comes back
//   rig.aiming = true; rig.sprinting = run; // the FOV narrows to aim (fovAim) and widens to run (fovSprint)
//
// First person feels like a body: the eye bobs with each step (rig.step is the stride's phase), leans into a strafe,
// dips as you land from a fall (found by itself, or rig.land(speed)), and its shake turns the view rather than moving
// the eye. bob, roll, landDip: 0 for none (1 as made); all softer with Reduce motion. gs.camera.GunRig moves a held gun
// with all of it.
//
// v is your View or HDView (or a camera). Settings, all changeable later as rig.set({...}):
//   distance, height (above the target), side (shoulder offset, + = right), look (height of the
//   point looked at), lag (seconds to catch up; 0 = locked on), lead (look ahead by speed), fov,
//   walls (meshes the camera can't go through, or a gs.physics3d World3D: its still things, asked with one quick
//   ray; with none given, the physics world the game made is used; walls: false for none), pitchMin/pitchMax, rail (a THREE.Curve for 'rail':
//   the camera rides it, staying level with the target's progress), at / aim (for 'fixed'), fovAim (degrees when
//   aiming: .72 of the usual), fovSprint (degrees added running: 6), recoilKeep (how much of a recoil() stays in the
//   aim: 0), recoilBack (how quick the rest comes back: 7), recoilHold (seconds it holds first: .08).
// The rig follows the target's facing (yaw, or its rotation.y) in chase and shoulder. rig.yaw and
// rig.pitch are the player's own look offsets on top. rig.forward() and rig.right() give the
// flat directions the camera faces, to make "stick up = away from camera" movement.

import { Vector3, Raycaster, MathUtils } from 'three';
import { prefs } from './prefs.js';
import { linksFor } from './links.js';
import { Spring } from './gunrig.js';

const MODES = {
  chase: { distance: 6, height: 2.2, side: 0, look: 1.2, lag: .18, follows: true },
  shoulder: { distance: 2.6, height: 1.6, side: .7, look: 1.5, lag: .06, follows: true },
  first: { distance: 0, height: 1.65, side: 0, look: 1.65, lag: 0, follows: true, bob: 1, roll: 1, landDip: 1 },
  top: { distance: .01, height: 14, side: 0, look: 0, lag: .2, follows: false },
  side: { distance: 12, height: 1.5, side: 0, look: 1, lag: .15, follows: false },
  orbit: { distance: 8, height: 0, side: 0, look: 1, lag: .1, follows: false },
  rail: { distance: 0, height: 0, side: 0, look: 1.2, lag: .25, follows: false },
  fixed: { distance: 0, height: 0, side: 0, look: 0, lag: .3, follows: false },
};

// what a camera stops at in a physics world: the ground, floors and other still things (not a crate, a person or a sensor)
const STILL = t => !t.collider?.isSensor?.() && (t.kind === 'ground' || t.kind === 'floor' || t.fixed === true || (t.body?.isFixed?.() ?? false));
const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _d = new Vector3(), _up = new Vector3(0, 1, 0), _ray = new Raycaster();

export { GunRig, Spring, KICK } from './gunrig.js';

export class CameraRig {
  constructor(view, { mode = 'chase', ...o } = {}) {
    this.view = view; this.yaw = 0; this.pitch = 0; this.trauma = 0; this.kickFov = 0; this.kickLeft = 0; this.kickTime = 0; this.t = 0;
    this.pos = new Vector3(); this.aim = new Vector3(); this.from = null; this.blend = 0; this.blendTime = 0; this.started = false;
    this.opts = { pitchMin: -1.2, pitchMax: 1.2, walls: null, margin: .25, lead: 0, fov: null, fovAim: null, fovSprint: 6, recoilKeep: 0, recoilBack: 7, recoilHold: .08, ...o };
    // the body's feel: recoil the view keeps for a moment, aim and run FOV, steps, the lean into a strafe, the dip of a landing
    this.recP = 0; this.recY = 0; this.recHold = 0; this.aiming = false; this.sprinting = false; this.aimK = 0; this.runK = 0;
    this.step = 0; this.roll = 0; this.landed = 0; this.grounded = true; this.lastVy = 0; this.dip = new Spring({ freq: 2.6, damp: .6 });
    this.links = linksFor(view?.isCamera ? null : view, o.link); this.links?.join('rig', this);   // (links.js)
    this.mode = mode; this.cfg = { ...MODES[mode], ...o };
    this.targetYaw = 0; this.lastTarget = new Vector3(); this.vel = new Vector3(); this.yawSeen = 0; this.pitchSeen = 0;
    // frame generation's fresh aim: a Next Gen view turns its made frames by the look the finger has
    // already changed (unless the game set its own with view.aimNow)
    if (view?.aimNow && !view.aimFn) view.aimNow(cam => this.fresh(cam));
  }
  get cam() { return this.view?.isCamera ? this.view : this.view.cam; }
  set(o) { Object.assign(this.opts, o); Object.assign(this.cfg, o); return this; }
  /** Switches rig, blending from where the camera is now over sec seconds. */
  to(mode, sec = .5, o = {}) {
    if (!MODES[mode]) throw new Error(`No camera rig called "${mode}"`);
    this.from = { pos: this.pos.clone(), aim: this.aim.clone() }; this.blend = 0; this.blendTime = Math.max(.001, sec);
    this.mode = mode; this.cfg = { ...MODES[mode], ...this.pick(this.opts), ...o };
    return this;
  }
  pick(o) { const keep = {}; for (const k of ['walls', 'margin', 'lead', 'rail', 'at', 'pitchMin', 'pitchMax']) if (o[k] !== undefined) keep[k] = o[k]; return keep; }
  shake(amount = .4) { this.trauma = Math.min(1, this.trauma + amount * prefs.motion); return this; }   // softer with Reduce motion
  kick(deg = 6, sec = .3) { this.kickFov = deg * prefs.motion; this.kickLeft = this.kickTime = sec; return this; }
  /**
   * A shot's recoil: the view is punched up by `pitch` radians (and `yaw` sideways); keep of it stays in rig.pitch and
   * rig.yaw (the aim climbs), the rest holds for recoilHold seconds and then comes back.
   */
  recoil(pitch = .015, yaw = 0, { keep = this.opts.recoilKeep } = {}) {
    this.pitch += pitch * keep; this.yaw -= yaw * keep;
    this.recP += pitch * (1 - keep); this.recY += yaw * (1 - keep); this.recHold = this.opts.recoilHold; return this;
  }
  /** A landing from a fall at `speed` m/s: the eye dips and comes back up (found by itself in first person). */
  land(speed = 5) { this.landed = speed; this.dip.shove(-Math.min(.2, speed * .024) * (this.cfg.landDip ?? 0) * prefs.motion); return this; }
  forward(out = new Vector3()) { const c = this.cam; c.getWorldDirection(out); out.y = 0; return out.lengthSq() ? out.normalize() : out.set(0, 0, -1); }
  right(out = new Vector3()) { this.forward(out); return out.set(-out.z, 0, out.x); }
  /** Where the rig wants to be, without lag or walls. */
  ideal(target, pos, aim) {
    const c = this.cfg, tp = target.position || target, ty = this.targetYaw;
    const yaw = (c.follows ? ty : 0) + this.yaw, pitch = this.pitch;
    switch (this.mode) {
      case 'first': {
        pos.set(tp.x, tp.y + c.height, tp.z);
        aim.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).add(pos); return;
      }
      case 'top': pos.set(tp.x, tp.y + c.height, tp.z + c.distance); aim.set(tp.x, tp.y + c.look, tp.z); return;
      case 'side': pos.set(tp.x, tp.y + c.height, tp.z + c.distance); aim.set(tp.x, tp.y + c.look, tp.z); return;
      case 'rail': {
        const curve = c.rail; if (!curve) { pos.set(tp.x, tp.y + 3, tp.z + 6); aim.set(tp.x, tp.y + c.look, tp.z); return; }
        const u = this.railT(curve, tp); curve.getPointAt(u, pos); aim.set(tp.x, tp.y + c.look, tp.z); return;
      }
      case 'fixed': { const at = c.at || [0, 5, 10]; pos.set(at[0] ?? at.x, at[1] ?? at.y, at[2] ?? at.z); aim.set(tp.x, tp.y + c.look, tp.z); return; }
      default: {   // chase, shoulder, orbit: behind the target (yaw 0 = looking along +z)
        const d = c.distance, p = MathUtils.clamp(pitch + (this.mode === 'orbit' ? .35 : 0), this.opts.pitchMin, this.opts.pitchMax);
        aim.set(tp.x, tp.y + c.look, tp.z);
        // shoulder: shift sideways (right of the target as the camera sees it)
        const sx = Math.cos(yaw) * -c.side, sz = Math.sin(yaw) * c.side;
        aim.x += sx; aim.z += sz;
        pos.set(aim.x - Math.sin(yaw) * Math.cos(p) * d, aim.y + Math.sin(p) * d + (c.height - c.look), aim.z - Math.cos(yaw) * Math.cos(p) * d);
        if (this.opts.lead) { aim.addScaledVector(this.vel, this.opts.lead); }
      }
    }
  }
  railT(curve, tp) {   // the point of the curve nearest the target (coarse search, then refine)
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 40; i++) { curve.getPointAt(i / 40, _c); const d = _c.distanceToSquared(tp); if (d < bd) { bd = d; best = i / 40; } }
    for (let s = 1 / 80; s > 1e-4; s /= 2) for (const u of [best - s, best + s]) { if (u < 0 || u > 1) continue; curve.getPointAt(u, _c); const d = _c.distanceToSquared(tp); if (d < bd) { bd = d; best = u; } }
    return best;
  }
  /** Pulls the camera in front of any wall between the aim point and it. */
  unblock(aim, pos) {
    const walls = this.cfg.walls ?? this.opts.walls, world = walls?.ray ? walls : walls == null ? this.links?.one('world') : null;
    if (!world?.world && !walls?.length) return;
    _d.subVectors(pos, aim); const d = _d.length(); if (d < 1e-3) return;
    _d.divideScalar(d);
    // a physics world: the first still thing on the way (one ray in its tree, not every triangle of the level's meshes)
    const hit = world?.world ? world.ray(aim, _d, d, STILL) : (_ray.set(aim, _d), _ray.far = d, _ray.intersectObjects(walls, true)[0]);
    if (hit) pos.copy(aim).addScaledVector(_d, Math.max(.1, hit.distance - (this.opts.margin ?? .25)));
  }
  // Fresh aim (frame generation, hd3d.js aimNow): the camera turned by however much rig.yaw and
  // rig.pitch changed since update() (a game that turns them as the finger moves gets made frames that
  // follow the finger at the screen's rate). A turn only: in chase and orbit the camera's swing round the
  // target is left to the next real frame.
  fresh(cam) {
    if (!this.started) return;
    const dy = this.yaw - this.yawSeen, dp = MathUtils.clamp(this.pitch, this.opts.pitchMin, this.opts.pitchMax) - this.pitchSeen;
    if (dy) cam.rotateOnWorldAxis(_up, dy);
    if (dp) cam.rotateX(dp);
  }
  update(dt, target) {
    this.t += dt;
    const cam = this.cam, tp = target.position || target;
    // facing: target.yaw, or its rotation.y
    const ty = target.yaw ?? target.rotation?.y ?? 0;
    if (!this.started) this.targetYaw = ty;
    else { let d = ty - this.targetYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.targetYaw += d * (this.cfg.lag ? 1 - Math.exp(-dt / Math.max(.02, this.cfg.lag * 1.5)) : 1); }
    if (this.started && dt > 0) this.vel.subVectors(tp, this.lastTarget).divideScalar(dt); this.lastTarget.copy(tp);
    // on the ground, steps and landings
    const vy = this.vel.y, h = Math.hypot(this.vel.x, this.vel.z);
    this.grounded = target.grounded ?? target.onGround ?? Math.abs(vy) < 1.5; this.landed = 0;
    if (this.started && this.lastVy < -3.5 && vy > -1) this.land(-this.lastVy);
    this.lastVy = vy;
    if (this.grounded) this.step += h * dt * (Math.PI / .78);
    this.pitch = MathUtils.clamp(this.pitch, this.opts.pitchMin, this.opts.pitchMax);
    this.ideal(target, _a, _b);
    this.unblock(_b, _a);
    const k = !this.started || !this.cfg.lag ? 1 : 1 - Math.exp(-dt / this.cfg.lag);
    this.pos.lerp(_a, k); this.aim.lerp(_b, !this.started || this.mode === 'first' ? 1 : Math.min(1, k * 1.6));
    if (this.mode === 'first') { this.pos.copy(_a); this.aim.copy(_b); }
    this.started = true;
    _a.copy(this.pos); _b.copy(this.aim);
    if (this.from) {   // blending from the previous rig
      this.blend += dt / this.blendTime; const s = MathUtils.smootherstep(Math.min(1, this.blend), 0, 1);
      _a.lerpVectors(this.from.pos, this.pos, s); _b.lerpVectors(this.from.aim, this.aim, s);
      if (this.blend >= 1) this.from = null;
    }
    // first person: the eye bobs with the stride (twice up and down, once side to side), dips on landing, leans into a strafe
    const first = this.mode === 'first', m = prefs.motion;
    this.aimK += ((this.aiming ? 1 : 0) - this.aimK) * (1 - Math.exp(-dt * 12));
    this.runK += ((this.sprinting && !this.aiming && h > 1 ? 1 : 0) - this.runK) * (1 - Math.exp(-dt * 5));
    const dip = this.dip.update(dt, 0);
    let rollTo = 0, sx = 0, sy = 0, sr = 0;
    if (first) {
      const yaw = this.targetYaw + this.yaw, rx = -Math.cos(yaw), rz = Math.sin(yaw), side = this.vel.x * rx + this.vel.z * rz;
      const b = (this.cfg.bob ?? 0) * m * (this.grounded ? Math.min(1, h / 4.2) : 0) * (1 - .75 * this.aimK) * (1 + .4 * this.runK);
      const up = -Math.abs(Math.sin(this.step)) * .026 * b, across = Math.sin(this.step) * .012 * b;
      _a.x += rx * across; _a.z += rz * across; _a.y += up + dip; _b.y += up + dip;
      rollTo = MathUtils.clamp(-side * .0085, -.045, .045) * (this.cfg.roll ?? 0) * m;
    }
    this.roll += (rollTo - this.roll) * (1 - Math.exp(-dt * 7));
    // shake: trauma squared, smooth noise-ish wobble (in first person the view turns rather than the eye moving)
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * .35, t = this.t * 30;
      sx = (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * .5 * s; sy = (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.1)) * .5 * s;
      if (first) { sr = Math.sin(t * .9 + 4) * s * .05; sx *= .1; sy *= .1; } else { _a.x += sx; _a.y += sy; sx = sy = 0; }
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
    }
    // the recoil the view keeps for a moment, then gives back
    if (this.recHold > 0) this.recHold -= dt;
    else if (this.recP || this.recY) { const k = Math.exp(-dt * this.opts.recoilBack); this.recP *= k; this.recY *= k; if (Math.abs(this.recP) + Math.abs(this.recY) < 1e-5) this.recP = this.recY = 0; }
    cam.position.copy(_a); cam.lookAt(_b);
    if (this.recY || sx) cam.rotateOnWorldAxis(_up, -this.recY + sx);
    if (this.recP || sy) cam.rotateX(this.recP + sy);
    if (this.roll || sr) cam.rotateZ(this.roll + sr);
    this.yawSeen = this.yaw; this.pitchSeen = this.pitch;
    if (cam.isPerspectiveCamera) {
      const base = this.cfg.fov ?? this.opts.fov ?? (this.baseFov ??= cam.fov);
      let f = base + (this.opts.fovSprint ?? 0) * this.runK * m;
      f += ((this.opts.fovAim ?? base * .72) - f) * this.aimK;
      if (this.kickLeft > 0) { this.kickLeft -= dt; f += this.kickFov * Math.sin(Math.max(0, this.kickLeft) / this.kickTime * Math.PI * .5); }
      if (Math.abs(cam.fov - f) > .01) { cam.fov = f; cam.updateProjectionMatrix(); }
    }
    return this;
  }
}
