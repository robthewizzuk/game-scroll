// A gun held in first person that moves like a real one: springs for each way it can move (pushed back, rising, twisting
// and rolling with a shot, lagging behind a turn of the head, swaying with each step, dipping as you land, lowered to
// run, raised to the eye to aim), all worked out in closed form so they are the same at 30 fps and 120. It drives the
// model the game made (gs.models.weapon, or a Group of its own) in front of the camera, and keeps it the same size on
// screen while the camera zooms (an aim's narrower FOV does not swell the gun).
//
//   const { CameraRig, GunRig } = gs.camera;
//   reset() {
//     rig = new CameraRig(v, { mode: 'first' });
//     held = new GunRig(v, gs.models.weapon('rifle'), { kind: 'rifle' });   // finds the rig: its turns, steps, jumps and landings
//   }
//   update(dt) {
//     held.aiming = aimHeld; held.sprinting = running;   // (also tells the rig: its FOV narrows to aim, widens to run)
//     rig.update(dt, me); held.update(dt);
//     if (arms.fire(...).length) ...                     // a gs.combat Loadout made in make()/reset() kicks it by itself
//   }
//   by hand: held.fire() (a shot, the kind's kick), held.land(speed), held.draw() (brought up), held.reload(seconds)
//
// Options: kind (whose kick: 'pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'sniper', 'launcher'; or kick: your own
// numbers, see KICK), hip and ads ([x, y, z] in front of the eye: where it is held, and where it is when aiming: its
// sight on the middle of the screen), sway, bob, inertia (1 = as made; 0 = none), fov (the FOV it was posed at: the
// camera's when made), keepSize (true), soften (true: a Next Gen view's edges go soft as it aims, v.aiming), rig (a
// gs.camera CameraRig; found by itself; false for none).
import { Group, MathUtils } from 'three';
import { prefs } from './prefs.js';
import { linksFor } from './links.js';

const TAU = Math.PI * 2;

/**
 * A spring that settles on its target the same way however long the frames are (worked out exactly, not stepped):
 * freq in Hz (how quick), damp (1: no overshoot; below: a bounce). x is where it is, v how fast it moves; push(v) gives
 * it a shove.
 */
export class Spring {
  constructor({ freq = 4, damp = 1, x = 0, target = 0 } = {}) { this.freq = freq; this.damp = damp; this.x = x; this.v = 0; this.target = target; }
  push(v) { this.v += v; return this; }
  set(x) { this.x = x; this.v = 0; return this; }
  update(dt, target = this.target) {
    this.target = target;
    const w = this.freq * TAU, z = this.damp, x0 = this.x - target, v0 = this.v;
    if (!(dt > 0) || (!x0 && !v0)) return this.x;
    if (z < .999) {
      const a = z * w, wd = w * Math.sqrt(1 - z * z), e = Math.exp(-a * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
      this.x = target + e * (x0 * c + (v0 + a * x0) / wd * s);
      this.v = e * (v0 * c - (a * v0 + w * w * x0) / wd * s);
    } else {   // (critically damped: over-damped springs are treated as critical, which is what anyone wants of them)
      const e = Math.exp(-w * dt), b = v0 + w * x0;
      this.x = target + (x0 + b * dt) * e; this.v = (v0 - b * w * dt) * e;
    }
    if (Math.abs(this.x - target) < 1e-6 && Math.abs(this.v) < 1e-5) { this.x = target; this.v = 0; }
    return this.x;
  }
  /** The shove that makes a spring at rest reach about `peak` away. */
  shove(peak) { const z = Math.min(.999, this.damp), w = this.freq * TAU, wd = w * Math.sqrt(1 - z * z), tp = Math.atan2(wd, z * w) / wd; return this.push(peak * w / (Math.exp(-z * w * tp) * Math.sin(wd * tp) * w / wd)); }
}

/**
 * Each kind's shot, in what it does to the gun at the hip: back (metres it is pushed back), rise (radians it tips up),
 * twist (radians either way at random), roll (radians either way), up (metres it lifts), and view (radians the eye is
 * punched up: it comes back down by itself, the aim stays the gun's own). Aiming takes a little under half of it.
 */
export const KICK = {
  pistol: { back: .042, rise: .15, twist: .028, roll: .05, up: .012, view: .011 },
  revolver: { back: .058, rise: .29, twist: .036, roll: .075, up: .02, view: .024 },
  smg: { back: .021, rise: .05, twist: .024, roll: .028, up: .006, view: .005 },
  rifle: { back: .03, rise: .07, twist: .02, roll: .034, up: .008, view: .008 },
  shotgun: { back: .082, rise: .21, twist: .036, roll: .065, up: .02, view: .028 },
  sniper: { back: .088, rise: .19, twist: .018, roll: .045, up: .02, view: .032 },
  launcher: { back: .1, rise: .09, twist: .018, roll: .028, up: .028, view: .028 },
};
// where each is held, in front of the eye (metres: right, up, forward is -z), and with its sight on the middle to aim
const HOLD = {
  pistol: { hip: [.13, -.14, -.3], ads: [0, -.062, -.24] },
  revolver: { hip: [.13, -.14, -.31], ads: [0, -.064, -.25] },
  launcher: { hip: [.2, -.2, -.3], ads: [.06, -.12, -.24] },
};
const HOLD_LONG = { hip: [.15, -.16, -.34], ads: [0, -.072, -.22] };
// how far the sight is in front of the eye when aiming (metres): arms out for a handgun, close behind a scope
const RELIEF = { pistol: .3, revolver: .3, sniper: .09, launcher: .1 };

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _q = { yaw: 0, pitch: 0 };

export class GunRig {
  constructor(view, model = null, { kind = 'rifle', kick = null, hip = null, ads = null, sway = 1, bob = 1, inertia = 1, fov = null, keepSize = true, soften = true, rig = null, link } = {}) {
    this.view = view; this.kind = kind; this.kickOf = kick; this.sway = sway; this.bob = bob; this.inertia = inertia; this.keepSize = keepSize; this.soften = soften;
    this.hipGiven = hip; this.adsGiven = ads; this.pose(kind);
    this.root = new Group(); this.root.name = 'gun rig';
    const cam = this.cam; if (cam) cam.add(this.root);
    this.model = null; if (model) this.hold(model);
    this.fov0 = fov ?? cam?.fov ?? 60;
    this.links = linksFor(view?.isCamera ? null : view, link); this.links?.join('gunrig', this);
    this.rigGiven = rig;
    this.aiming = false; this.sprinting = false; this.loadout = null;
    // poses: aim and run are eased in by springs of their own (aim quick and straight, run a touch slower)
    this.aimK = new Spring({ freq: 3.4, damp: 1 }); this.runK = new Spring({ freq: 2.2, damp: 1 }); this.reloadK = new Spring({ freq: 2.6, damp: .9 });
    // a shot: back and lift snap and settle with a small bounce; the tip up and the twist are slower
    this.kz = new Spring({ freq: 7.5, damp: .55 }); this.ku = new Spring({ freq: 6.5, damp: .6 });
    this.kp = new Spring({ freq: 5, damp: .62 }); this.ky = new Spring({ freq: 5.5, damp: .6 }); this.kr = new Spring({ freq: 4.2, damp: .5 });
    // the gun lagging the head's turns, the body's moves and the landings
    this.sx = new Spring({ freq: 2.6, damp: .62 }); this.sy = new Spring({ freq: 2.6, damp: .62 });
    this.air = new Spring({ freq: 3, damp: .75 }); this.dip = new Spring({ freq: 3.2, damp: .55 }); this.up = new Spring({ freq: 3.4, damp: .7 });
    this.t = 0; this.phase = 0; this.last = null; this.lastPos = null; this.vel = { x: 0, y: 0, z: 0 }; this.lastVy = 0; this.reloadLeft = 0; this.reloadTime = 1;
  }
  get cam() { const v = this.view; return v?.isCamera ? v : v?.cam || null; }
  get rig() { return this.rigGiven === false ? null : this.rigGiven || this.links?.one('rig') || null; }
  /** Puts a model in the hands (the one before is taken out and returned). */
  hold(model, kind = null) {
    const old = this.model; if (old) this.root.remove(old);
    this.model = model; if (model) { this.root.add(model); model.traverse?.(m => { if (m.isMesh) m.castShadow = false; }); }
    if (kind && kind !== this.kind) { this.kind = kind; this.draw(); }
    this.pose(this.kind);
    return old;
  }
  // where it is held: the kind's hip pose, and aiming with the model's own sight (gs.models.weapon's points.sight) on
  // the middle of the screen, a little in front of the eye
  pose(kind) {
    const H = HOLD[kind] || HOLD_LONG, s = this.model?.points?.sight?.position, rel = RELIEF[kind] ?? .15;
    this.hip = this.hipGiven || H.hip;
    this.ads = this.adsGiven || (s ? [-s.x, -s.y, -(s.z + rel)] : H.ads);
  }
  /** A shot: the kind's kick (strength 1; kind: another kind's), and the eye's punch on the rig. */
  fire(strength = 1, kind = null) {
    const K = (kind ? KICK[kind] : null) || this.kickOf || KICK[this.kind] || KICK.rifle, a = this.aimK.x, s = strength * (1 - .55 * a), r = strength * (1 - .62 * a), m = prefs.motion;
    const side = Math.random() < .5 ? -1 : 1;
    this.kz.shove(K.back * s); this.ku.shove(K.up * s);
    this.kp.shove(K.rise * r * (.9 + Math.random() * .2)); this.ky.shove(K.twist * r * (Math.random() * 2 - 1)); this.kr.shove(K.roll * r * side);
    this.rig?.recoil?.(K.view * strength * (1 - .4 * a) * m, (Math.random() - .5) * K.view * .5 * m);
    return this;
  }
  /** Landing from a fall at `speed` m/s (found by itself from the camera's fall; call it for your own). */
  land(speed = 4) { this.dip.shove(-Math.min(.07, speed * .009) * prefs.motion); return this; }
  /** Brought up (a draw or a switch): it comes up from below. */
  draw() { this.up.set(-.22); this.kp.set(-.5); this.kp.v = 0; return this; }
  /** A reload of `secs` seconds: tipped over and lowered for it (a gs.combat Loadout tells it by itself). */
  reload(secs = 1.5) { this.reloadLeft = this.reloadTime = Math.max(.3, secs); return this; }
  update(dt) {
    const cam = this.cam; if (!cam || !(dt > 0)) return this;
    this.t += dt; dt = Math.min(dt, .1);
    const R = this.rig, m = prefs.motion;
    if (R && 'aiming' in R) { R.aiming = this.aiming; R.sprinting = this.sprinting && !this.aiming; }
    // the head's turn and the body's move this frame: from the rig, else read off the camera
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10];
    _q.yaw = Math.atan2(fx, fz); _q.pitch = Math.asin(MathUtils.clamp(fy, -1, 1));
    let dYaw = 0, dPitch = 0;
    if (this.last) { dYaw = wrap(_q.yaw - this.last.yaw); dPitch = _q.pitch - this.last.pitch; } else this.last = { yaw: 0, pitch: 0 };
    this.last.yaw = _q.yaw; this.last.pitch = _q.pitch;
    let vx, vy, vz;
    if (R?.vel) { vx = R.vel.x; vy = R.vel.y; vz = R.vel.z; } else {
      const L = this.lastPos;
      if (L) { vx = (e[12] - L.x) / dt; vy = (e[13] - L.y) / dt; vz = (e[14] - L.z) / dt; } else { vx = vy = vz = 0; this.lastPos = { x: 0, y: 0, z: 0 }; }
      this.lastPos.x = e[12]; this.lastPos.y = e[13]; this.lastPos.z = e[14]; const k = 1 - Math.exp(-dt * 12); this.vel.x += (vx - this.vel.x) * k; this.vel.y += (vy - this.vel.y) * k; this.vel.z += (vz - this.vel.z) * k; ({ x: vx, y: vy, z: vz } = this.vel);
    }
    // in the camera's flat frame: forward and to the right
    const cy = Math.cos(_q.yaw), sy = Math.sin(_q.yaw), fwd = vx * sy + vz * cy, right = vz * sy - vx * cy, speed = Math.hypot(vx, vz);
    const grounded = R?.grounded ?? Math.abs(vy) < 1.2;
    if (R && 'landed' in R) { if (R.landed) this.land(R.landed); } else if (this.lastVy < -3.5 && vy > -1) this.land(-this.lastVy);
    this.lastVy = vy;
    // the poses eased in
    if (this.reloadLeft > 0) this.reloadLeft -= dt;
    const aim = this.aimK.update(dt, this.aiming ? 1 : 0), run = this.runK.update(dt, this.sprinting && !this.aiming && this.reloadLeft <= 0 ? 1 : 0);
    const rl = this.reloadK.update(dt, this.reloadLeft > .12 ? 1 : 0);
    const V = this.view; if (this.soften && V && !V.isCamera && typeof V.hit === 'function') V.aiming = aim > .002 ? aim : 0;   // (an HDView softens the edges as it aims)
    const loose = (1 - .85 * aim) * m;   // how much the gun is free to move about (held to the eye: hardly)
    // lagging behind the head (inertia): a turn leaves the gun behind for a moment
    const lag = this.inertia * loose;
    const ix = this.sx.update(dt, MathUtils.clamp(dYaw / dt * .055, -.45, .45) * lag), iy = this.sy.update(dt, MathUtils.clamp(-dPitch / dt * .055, -.45, .45) * lag);
    // steps: the gun swings side to side once a stride and dips at each footfall (the rig's step when it has one)
    const moving = grounded ? Math.min(1, speed / 4.2) : 0;
    if (R && R.step != null) this.phase = R.step; else this.phase += speed * dt * (Math.PI / .78);
    const b = this.bob * loose * moving * (1 + .7 * run), ph = this.phase;
    const bx = Math.sin(ph) * .011 * b, by = -Math.abs(Math.sin(ph)) * .013 * b, broll = Math.sin(ph) * .018 * b;
    // breathing at rest, and a slow drift
    const br = this.sway * (1 - .7 * aim) * m, idleY = Math.sin(this.t * 1.35) * .0022 * br, idleX = Math.sin(this.t * .63) * .0014 * br, idleR = Math.sin(this.t * .9 + 1) * .006 * br;
    // the body's moves: strafing tilts it, walking forward pulls it back a touch, a jump drops it and a fall lifts it
    const tilt = MathUtils.clamp(-right * .011, -.07, .07) * loose, pull = MathUtils.clamp(fwd * .0035, -.012, .012) * loose;
    const airY = this.air.update(dt, grounded ? 0 : MathUtils.clamp(-vy * .006, -.035, .035) * loose);
    const dip = this.dip.update(dt, 0), up = this.up.update(dt, 0);
    // the kick
    const kz = this.kz.update(dt, 0), ku = this.ku.update(dt, 0), kp = this.kp.update(dt, 0), ky = this.ky.update(dt, 0), kr = this.kr.update(dt, 0);
    // put it together: the hip and aim poses, the run pose (lowered, turned in), the reload (tipped over, lowered)
    const H = this.hip, A = this.ads;
    let x = H[0] + (A[0] - H[0]) * aim, y = H[1] + (A[1] - H[1]) * aim, z = H[2] + (A[2] - H[2]) * aim;
    x += -.035 * run + .02 * rl; y += -.045 * run - .05 * rl; z += .03 * run + .03 * rl;
    x += bx + idleX + ix * .045; y += by + idleY + iy * .045 + airY + dip + up + ku; z += kz + pull;
    let rx = kp + iy * .35 - .32 * run - .3 * rl + idleY * 1.5 + dip * 1.2, ryy = ky - ix * .35 + .42 * run + .12 * rl, rz = kr + broll + tilt + idleR + .3 * run + .7 * rl + ix * .2;
    // keep its size on screen at any FOV: its x and y as the view widens or narrows
    const f = this.keepSize && cam.isPerspectiveCamera ? Math.tan(MathUtils.degToRad(cam.fov) / 2) / Math.tan(MathUtils.degToRad(this.fov0) / 2) : 1;
    this.root.position.set(x * f, y * f, z);
    this.root.rotation.set(rx, ryy, rz, 'YXZ');
    this.root.scale.set(f, f, 1);
    return this;
  }
  dispose() { this.root.parent?.remove(this.root); this.links?.leave(this); }
}
