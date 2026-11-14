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
//
// v is your View or HDView (or a camera). Settings, all changeable later as rig.set({...}):
//   distance, height (above the target), side (shoulder offset, + = right), look (height of the
//   point looked at), lag (seconds to catch up; 0 = locked on), lead (look ahead by speed), fov,
//   walls (meshes the camera can't go through, or a gs.physics3d World3D: its still things, asked with one quick
//   ray; with none given, the physics world the game made is used; walls: false for none), pitchMin/pitchMax, rail (a THREE.Curve for 'rail':
//   the camera rides it, staying level with the target's progress), at / aim (for 'fixed').
// The rig follows the target's facing (yaw, or its rotation.y) in chase and shoulder. rig.yaw and
// rig.pitch are the player's own look offsets on top. rig.forward() and rig.right() give the
// flat directions the camera faces, to make "stick up = away from camera" movement.

import { Vector3, Raycaster, MathUtils } from 'three';
import { prefs } from './prefs.js';
import { linksFor } from './links.js';

const MODES = {
  chase: { distance: 6, height: 2.2, side: 0, look: 1.2, lag: .18, follows: true },
  shoulder: { distance: 2.6, height: 1.6, side: .7, look: 1.5, lag: .06, follows: true },
  first: { distance: 0, height: 1.65, side: 0, look: 1.65, lag: 0, follows: true },
  top: { distance: .01, height: 14, side: 0, look: 0, lag: .2, follows: false },
  side: { distance: 12, height: 1.5, side: 0, look: 1, lag: .15, follows: false },
  orbit: { distance: 8, height: 0, side: 0, look: 1, lag: .1, follows: false },
  rail: { distance: 0, height: 0, side: 0, look: 1.2, lag: .25, follows: false },
  fixed: { distance: 0, height: 0, side: 0, look: 0, lag: .3, follows: false },
};

// what a camera stops at in a physics world: the ground, floors and other still things (not a crate, a person or a sensor)
const STILL = t => !t.collider?.isSensor?.() && (t.kind === 'ground' || t.kind === 'floor' || t.fixed === true || (t.body?.isFixed?.() ?? false));
const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _d = new Vector3(), _up = new Vector3(0, 1, 0), _ray = new Raycaster();

export class CameraRig {
  constructor(view, { mode = 'chase', ...o } = {}) {
    this.view = view; this.yaw = 0; this.pitch = 0; this.trauma = 0; this.kickFov = 0; this.kickLeft = 0; this.kickTime = 0; this.t = 0;
    this.pos = new Vector3(); this.aim = new Vector3(); this.from = null; this.blend = 0; this.blendTime = 0; this.started = false;
    this.opts = { pitchMin: -1.2, pitchMax: 1.2, walls: null, margin: .25, lead: 0, fov: null, ...o };
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
    // shake: trauma squared, smooth noise-ish wobble
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * .35, t = this.t * 30;
      _a.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * .5 * s; _a.y += (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.1)) * .5 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
    }
    cam.position.copy(_a); cam.lookAt(_b);
    this.yawSeen = this.yaw; this.pitchSeen = this.pitch;
    if (cam.isPerspectiveCamera) {
      const base = this.cfg.fov ?? this.opts.fov ?? (this.baseFov ??= cam.fov);
      let f = base;
      if (this.kickLeft > 0) { this.kickLeft -= dt; f += this.kickFov * Math.sin(Math.max(0, this.kickLeft) / this.kickTime * Math.PI * .5); }
      if (Math.abs(cam.fov - f) > .01) { cam.fov = f; cam.updateProjectionMatrix(); }
    }
    return this;
  }
}
