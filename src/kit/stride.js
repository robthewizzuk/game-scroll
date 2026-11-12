// Steps that are really taken. A walk is drawn as a loop of joint angles, which is right only while the body goes
// straight ahead at the speed the loop was drawn for. The game moves the body as it likes: it turns, starts, stops,
// goes a little faster or slower than the loop, and on every one of those the feet slid over the ground (a person
// turning on the spot was a statue on a turntable). Here the feet belong to the ground:
//   - a foot that is down stays where it was put down, and the leg is bent again to keep it there while the body
//     goes on over it: it rolls from its heel onto its ball as the walk has it, and whichever of the two it stands
//     on does not move, nor does the foot turn on the ground when the body turns;
//   - a foot in the air goes from where it left the ground to where the walk would put it down under the body as
//     the body is by then, so the footfalls follow a curve, a turn, or a body pushed off its line;
//   - standing, a person whose body is turned or shifted steps a foot at a time to stand under it again, the
//     weight going over the other foot meanwhile, and the hips stay a little over the feet and sink into a wide stance.
// The Rig calls this by itself for poses that stand on the ground (the lifelike walks and runs, and standing easy;
// rig.add(name, fn, { ground: true, stance }) for your own), when it was made with the `body` the game moves
// (gs.models.human is). rig.steps = false turns it off. It does nothing while the body is carried along standing
// (on a lorry, a lift), or walks on the spot (a figure shown in a menu), and far-off people are left alone.

import { Matrix4, Quaternion, Vector3 } from 'three';

const TAU = Math.PI * 2, sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t), wrap = a => a - Math.round(a / TAU) * TAU;
const _A = new Vector3(), _K = new Vector3(), _F = new Vector3(), _d = new Vector3(), _b = new Vector3(), _n = new Vector3(), _k2 = new Vector3(), _t2 = new Vector3(), _u = new Vector3(), _s = new Vector3();
const _qp = new Quaternion(), _qu = new Quaternion(), _ql = new Quaternion(), _qe = new Quaternion(), _r = new Quaternion(), _r2 = new Quaternion(), _qi = new Quaternion(), _m = new Matrix4();
const UP = new Vector3(0, 1, 0), _h = new Vector3(), _c = new Vector3();
const STEP = .13, TURN = .42;   // standing: how far (metres on a 1.8 m person) or how far round (radians) a foot may be from its place before it steps

export class Stride {
  constructor(rig, body) {
    const P = rig.parts;
    this.rig = rig; this.body = body; this.on = false; this.a = 0;
    const k = (rig.height || 1.8) / 1.8; this.heel = [0, -.085 * k, -.06 * k]; this.ball = [0, -.085 * k, .13 * k];   // the two points of its sole a foot stands on, from its ankle
    this.legs = [['legL', 'shinL', 'footL'], ['legR', 'shinR', 'footR']].map(([u, l, e]) => P[u] && P[l] && P[e] ? { up: P[u], lo: P[l], end: P[e], F: new Vector3(), T: new Vector3(), Q: new Quaternion(), down: true, landed: false, sw: 0, on: 0, Cx: 0, Cz: 0, hx: 0, hz: 0, bx: 0, bz: 0, fy: 0, yaw0: 0, dyaw: 0, dy0: 0, ox: 0, oz: 0, u0: 0, hop: 0, t: 0, dur: .25, lift: 0, fx: 0, fz: 0, need: 0, len: 1 } : null);
    this.ok = !!(P.hips && this.legs[0] && this.legs[1]);
    this.px = this.pz = this.yaw = this.vx = this.vz = this.w = 0; this.ox = this.oz = this.sink = 0; this.rest = 0; this.cool = 0; this.last = 1; this.hold = false; this.fresh = 0; this.go = false; this.turned = 0;
  }
  /** The feet as they are now: [{ down, landed (true on the update it touches the ground: a footstep) }, ...], left then right. */
  get feet() { return this.legs; }
  // put down where it is: on its ball if the toes point down, else on its heel (a flat foot stands on its heel)
  lock(f, yaw) { f.down = true; f.sw = 0; f.on = f.fy < -.004 ? 1 : 0; f.Cx = f.T.x + (f.on ? f.bx : f.hx); f.Cz = f.T.z + (f.on ? f.bz : f.hz); f.yaw0 = yaw; f.dyaw = 0; }
  // lifted for the walk's own swing from wherever it stood: it makes up the difference on its way, and is lifted a little more the more it has to make up
  // (a foot left behind as a walk slows would otherwise be dragged home along the ground)
  swing(f, u, sc) { f.down = false; f.sw = 1; f.u0 = Math.min(.9, Math.max(0, u)); f.ox = f.T.x - f.F.x; f.oz = f.T.z - f.F.z; f.dy0 = f.dyaw; f.hop = Math.min(.05 * sc, .25 * Math.hypot(f.ox, f.oz)); }
  // picked up, to be put down where the pose has it by the time it lands (dur seconds on); the further it has to go the higher it is lifted
  step(f, dur, sc) { f.down = false; f.sw = 2; f.fx = f.T.x; f.fz = f.T.z; f.t = 0; f.dur = dur; f.lift = (.03 + .05 * Math.min(1, Math.hypot(f.T.x - f.F.x, f.T.z - f.F.z) / sc / .4)) * sc; f.dy0 = f.dyaw; }
  /** Lets go of the feet at once (what rig.steps = false does). */
  off() { this.on = false; this.a = 0; }
  reset(yaw) { for (const f of this.legs) { f.T.copy(f.F); this.lock(f, yaw); f.landed = false; } this.ox = this.oz = this.sink = 0; this.rest = 0; }
  /**
   * After the pose has been set. speed: what the walk was given (metres a second); g: how much of the pose stands
   * on the ground (0..1); gw: how much of it is a walk or a run; st: the share of a stride a foot is down; ph: where
   * in the stride the left foot is; beat: strides a second.
   */
  apply(dt, speed, g, gw, st, ph, beat) {
    if (!this.ok || (g <= 0 && (this.a <= 0 || !(dt > 0)))) return this.off();   // (nothing stands on the ground: no work at all)
    const L = this.legs, body = this.body;
    L[0].end.updateWorldMatrix(true, false); L[1].end.updateWorldMatrix(true, false);
    const e = body.matrixWorld.elements, px = e[12], pz = e[14], yaw = Math.atan2(e[8], e[10]), sc = Math.hypot(e[4], e[5], e[6]) || 1, c = Math.cos(yaw), s = Math.sin(yaw);
    _qp.setFromRotationMatrix(_m.extractRotation(L[0].up.parent.matrixWorld));
    for (const f of L) {   // each ankle as posed, and where the heel and the ball of that foot lie from it
      const m = f.end.matrixWorld.elements; f.F.set(m[12], m[13], m[14]); f.landed = false;
      f.Q.multiplyQuaternions(_qp, f.up.quaternion).multiply(f.lo.quaternion).multiply(f.end.quaternion);
      _h.fromArray(this.heel).applyQuaternion(f.Q); _c.fromArray(this.ball).applyQuaternion(f.Q);
      f.hx = _h.x * sc; f.hz = _h.z * sc; f.bx = _c.x * sc; f.bz = _c.z * sc; f.fy = _c.y - _h.y;   // (fy: under 0 with the toes pointing down)
    }
    // how the body really moves (a jump from one place to another is not a move)
    // (the way it faces is counted on without wrapping, so a foot left a whole turn behind is never taken for one a little ahead)
    const dyaw = this.on ? wrap(yaw - this.yaw) : 0, turned = this.turned + dyaw;
    const jump = !this.on || Math.hypot(px - this.px, pz - this.pz) > Math.max(.6, 14 * dt) * sc || Math.abs(dyaw) > Math.max(.9, 20 * dt);   // (nor is a snap round to face another way a turn)
    this.turned = turned;
    if (jump) { this.vx = this.vz = this.w = 0; this.reset(turned); this.on = true; this.fresh = 2; }
    else if (dt > 0) { const k = this.fresh ? 1 : 1 - Math.exp(-dt * 20); this.vx += ((px - this.px) / dt - this.vx) * k; this.vz += ((pz - this.pz) / dt - this.vz) * k; this.w += (dyaw / dt - this.w) * k; }
    this.px = px; this.pz = pz; this.yaw = yaw;
    const v = Math.hypot(this.vx, this.vz), pace = Math.abs(speed), gait = gw > .05 && pace > .05, back = speed < 0;   // (back: the walk is run backwards, for a person backing away)
    // walking: only while the body really goes along at something like the walk's own speed (a walk on the spot is left as drawn, and so is a
    // walk along a moving deck); standing: not while it is carried. (Between the two edges it stays as it was, so it never half holds a foot.)
    if (gait) { if (v > .5 * pace && v < 1.8 * pace + .4 * sc) this.go = true; else if (v < .15 * pace || v > 2.2 * pace + .6 * sc) this.go = false; }
    else if (v < .5 * sc) this.go = true; else if (v > .9 * sc) this.go = false;
    const want = this.hold || !this.go ? 0 : g;
    // (it comes in and goes out softly, but not on a person who has just appeared: the feet are where the pose has them, and the first move tells how the body goes)
    if (this.fresh) { this.a = want; if (dt > 0) this.fresh--; } else if (dt > 0) this.a += (want - this.a) * (1 - Math.exp(-dt * 10));
    if (this.hold || (this.a < .002 && want <= 0)) { this.a = 0; this.reset(turned); return; }
    // a foot in the air comes down a little off the walk's own place when the body does not go as the walk was drawn: half a stance's worth of the difference
    let shx = 0, shz = 0;
    if (gait) { const half = Math.min(.7, st / Math.max(.3, beat)) * .4; shx = (this.vx - s * speed) * half; shz = (this.vz - c * speed) * half; const l = Math.hypot(shx, shz), most = .4 * sc; if (l > most) { shx *= most / l; shz *= most / l; } }
    for (let i = 0; i < 2; i++) {
      const f = L[i], fr = ph + i * .5 - Math.floor(ph + i * .5), wantDown = !gait || fr < st, u = !gait ? 0 : back ? (1 - fr) / (1 - st) : (fr - st) / (1 - st);
      if (f.down) {
        if (!wantDown) this.swing(f, u, sc);
        else {
          // it keeps the way it pointed when it was put down (as far as an ankle turns), and the point it stands on stays where it is
          f.dyaw = Math.max(-.8, Math.min(.8, f.yaw0 - turned)); const cy = Math.cos(f.dyaw), sy = Math.sin(f.dyaw);
          const hx = f.hx * cy + f.hz * sy, hz = f.hz * cy - f.hx * sy, bx = f.bx * cy + f.bz * sy, bz = f.bz * cy - f.bx * sy;
          if (f.on ? f.fy > .004 : f.fy < -.004) { const k = f.on ? -1 : 1; f.Cx += (bx - hx) * k; f.Cz += (bz - hz) * k; f.on = 1 - f.on; }   // it rolls from its heel onto its ball (or back)
          f.T.set(f.Cx - (f.on ? bx : hx), f.F.y, f.Cz - (f.on ? bz : hz));
        }
      }
      if (!f.down && f.sw === 1) {
        if (!gait) this.step(f, .18, sc);   // the walk has stopped with this foot in the air: it is set down as a step
        else if (wantDown) { f.T.set(f.F.x + shx, f.F.y, f.F.z + shz); this.lock(f, turned); f.landed = true; }
        else { const pr = Math.max(0, Math.min(1, (u - f.u0) / (1 - f.u0))), k = 1 - sm(pr); f.T.set(f.F.x + f.ox * k + shx * (1 - k), f.F.y + f.hop * Math.sin(Math.PI * pr), f.F.z + f.oz * k + shz * (1 - k)); f.dyaw = f.dy0 * k; }
      }
      if (!f.down && f.sw === 2) {
        if (gait && !wantDown) this.swing(f, u, sc);   // (a walk begins with this foot already in the air)
        else {
          f.t += dt / f.dur;
          if (f.t >= 1) { f.T.copy(f.F); this.lock(f, turned); f.landed = true; this.cool = .06; }
          else { const k = sm(f.t); f.T.set(f.fx + (f.F.x - f.fx) * k, f.F.y + f.lift * Math.sin(Math.PI * f.t), f.fz + (f.F.z - f.fz) * k); f.dyaw = f.dy0 * (1 - k); }
        }
      }
    }
    // standing: a foot too far from its place, or turned too far from the way the body faces, steps (one at a time; sooner once the body has come to rest)
    if (!gait && dt > 0) {
      this.rest = v < .08 * sc && Math.abs(this.w) < .15 ? this.rest + dt : 0; this.cool -= dt;
      if (L[0].down && L[1].down && this.cool <= 0) {
        const lim = this.rest > .5 ? .55 : 1; let pick = -1, worst = 1;
        for (let i = 0; i < 2; i++) { const f = L[i], q = Math.max(Math.hypot(f.T.x - f.F.x, f.T.z - f.F.z) / (STEP * sc), Math.abs(f.dyaw) / TURN) / lim * (i === this.last ? .9 : 1); if (q > worst) { worst = q; pick = i; } }
        if (pick >= 0) { const f = L[pick]; this.step(f, .2 + .22 * Math.min(1, Math.hypot(f.T.x - f.F.x, f.T.z - f.F.z) / sc / .5), sc); this.last = pick; }
      }
    }
    // the hips: standing they stay half way over the feet, and go over the foot that bears the weight while the other steps
    let ox = 0, oz = 0;
    if (!gait) {
      let n = 0; for (const f of L) if (f.down) { ox += f.T.x - f.F.x; oz += f.T.z - f.F.z; n++; }
      if (n) { ox *= .5 / n; oz *= .5 / n; }
      const h = this.rig.parts.hips.matrixWorld.elements;
      for (let i = 0; i < 2; i++) { const f = L[i], o = L[1 - i]; if (f.sw === 2 && !f.down && o.down) { const k = .22 * Math.sin(Math.PI * Math.min(1, f.t)); ox += (o.T.x - h[12]) * k; oz += (o.T.z - h[14]) * k; } }
      const l = Math.hypot(ox, oz), most = .08 * sc; if (l > most) { ox *= most / l; oz *= most / l; }
    }
    if (dt > 0) { const k = 1 - Math.exp(-dt * 9); this.ox += (ox - this.ox) * k; this.oz += (oz - this.oz) * k; }
    const a = this.a, hx = this.ox * a, hz = this.oz * a;
    // ... and sink when a leg cannot reach its foot (a wide stance); what is still out of reach drags the foot along
    let need = 0;
    for (const f of L) {
      const m = f.up.matrixWorld.elements, k = f.lo.matrixWorld.elements;
      // (how far the leg reaches: a hair short of straight, so the knee never snaps, but never less than the pose itself has it)
      const len = Math.max((Math.hypot(k[12] - m[12], k[13] - m[13], k[14] - m[14]) + f.F.distanceTo(_K.set(k[12], k[13], k[14]))) * .998, Math.hypot(f.F.x - m[12], f.F.y - m[13], f.F.z - m[14]));
      const tx = f.F.x + (f.T.x - f.F.x) * a - m[12] - hx, tz = f.F.z + (f.T.z - f.F.z) * a - m[14] - hz, h2 = tx * tx + tz * tz, vy = m[13] - (f.F.y + (f.T.y - f.F.y) * a);
      f.len = len; f.need = h2 < len * len ? vy - Math.sqrt(len * len - h2) : 1;
      // walking, a foot the body has left too far behind (a start from standing, a shove) is picked up and put in its place, as a person shuffles a foot up
      if (gait && dt > 0 && f.down && f.need > .04 * sc) this.step(f, .16, sc);
      if (f.down) need = Math.max(need, f.need);   // (a foot in the air needs no room made for it: the leg straightens and it comes up)
    }
    need = Math.max(0, Math.min(.12 * sc, need));
    this.sink += (need - this.sink) * (dt > 0 ? 1 - Math.exp(-dt * (need > this.sink ? 40 : 6)) : 0);
    const hips = this.rig.parts.hips;
    hips.position.x += (hx * c - hz * s) / sc; hips.position.z += (hx * s + hz * c) / sc; hips.position.y -= this.sink / sc;
    for (const f of L) {
      const m = f.up.matrixWorld.elements, k = f.lo.matrixWorld.elements;
      _A.set(m[12] + hx, m[13] - this.sink, m[14] + hz); _K.set(k[12] + hx, k[13] - this.sink, k[14] + hz); _F.set(f.F.x + hx, f.F.y - this.sink, f.F.z + hz);
      let tx = f.F.x + (f.T.x - f.F.x) * a, ty = f.F.y + (f.T.y - f.F.y) * a, tz = f.F.z + (f.T.z - f.F.z) * a;
      // (judged with the hips as far down as they are going, not as far as they have got: the knee straightens for the moment between, which lifts the foot a hair where drawing it in would slide it a long way)
      const dy = ty - m[13] + need, far = Math.hypot(tx - _A.x, dy, tz - _A.z);
      if (f.down && far > f.len) {   // out of reach: the foot is drawn in under the hip, and where it was put down goes with it
        const q = 1 - Math.sqrt(Math.max(0, f.len * f.len - dy * dy)) / Math.max(1e-6, Math.hypot(tx - _A.x, tz - _A.z)), ex = (tx - _A.x) * q, ez = (tz - _A.z) * q;
        if (q > 0) { tx -= ex; tz -= ez; f.T.x -= ex; f.T.z -= ez; f.Cx -= ex; f.Cz -= ez; }
      }
      if (Math.abs(tx - _F.x) + Math.abs(ty - _F.y) + Math.abs(tz - _F.z) + Math.abs(f.dyaw * a) < 2e-4) continue;   // as posed: nothing to bend
      this.bend(f, tx, ty, tz, f.dyaw * a, s, c);
    }
  }
  // the leg bent again to put its ankle at (tx, ty, tz); the foot lies as the pose laid it, turned by yaw
  bend(f, tx, ty, tz, yaw, fx, fz) {
    const L1 = _A.distanceTo(_K), L2 = _K.distanceTo(_F);
    _d.set(tx - _A.x, ty - _A.y, tz - _A.z); let D = _d.length(); if (D < 1e-6 || L1 < 1e-6 || L2 < 1e-6) return;
    _d.multiplyScalar(1 / D); D = Math.max(Math.abs(L1 - L2) + 1e-4, Math.min((L1 + L2) * .9995, D));
    // the knee points where the pose had it, carried round with the leg as the leg is turned to its new line (a straight leg bends the way the body faces)
    _u.subVectors(_F, _A); const Dp = _u.length(); if (Dp < 1e-6) return; _u.multiplyScalar(1 / Dp);
    _b.subVectors(_K, _A).addScaledVector(_u, -_b.dot(_u)); _n.set(fx, 0, fz).addScaledVector(_u, -_n.dot(_u)); _b.addScaledVector(_n, .03 * L1);
    _b.applyQuaternion(_r.setFromUnitVectors(_u, _d)).addScaledVector(_d, -_b.dot(_d)); if (_b.lengthSq() < 1e-12) return; _b.normalize();
    const a1 = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a1 * a1));
    _k2.copy(_A).addScaledVector(_d, a1).addScaledVector(_b, h); _t2.copy(_A).addScaledVector(_d, D);
    _qu.multiplyQuaternions(_qp, f.up.quaternion); _ql.multiplyQuaternions(_qu, f.lo.quaternion); _qe.copy(f.Q);   // how each lies in the world as posed
    _u.subVectors(_K, _A).normalize(); _s.subVectors(_k2, _A).normalize(); _r.setFromUnitVectors(_u, _s);
    _u.subVectors(_F, _K).normalize().applyQuaternion(_r); _s.subVectors(_t2, _k2).normalize(); _r2.setFromUnitVectors(_u, _s);
    _qu.premultiply(_r); _ql.premultiply(_r).premultiply(_r2);
    if (yaw) _qe.premultiply(_r.setFromAxisAngle(UP, yaw));
    f.up.quaternion.copy(_qi.copy(_qp).invert()).multiply(_qu);
    f.lo.quaternion.copy(_qi.copy(_qu).invert()).multiply(_ql);
    f.end.quaternion.copy(_qi.copy(_ql).invert()).multiply(_qe);
  }
}
