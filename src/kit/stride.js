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
//     weight going over the other foot meanwhile, and the hips stay a little over the feet and sink into a wide stance;
//     turning quickly it opens with the foot on the side it turns to (the other would cross in front of it), and steps quicker;
//   - a leg the pose puts down on its knee (a kneel) is not stood on: it comes round with the body on its knee;
//   - the pose itself changing from one way of standing to another (standing easy to a kneel, a kneel to a crouch)
//     moves the feet as it draws them: they are not left behind to be stepped up a foot at a time afterwards;
//   - setting off from standing, the foot that bears less of the weight (or the one on the side it turns to) steps
//     first, after a moment in which the weight goes over the other, and the first step is a short one;
//   - coming to a stop, the body is a weight that will come to rest a little ahead (at the rate it is slowing): the
//     foot in the air comes down there as a braking step, where it will stand at rest, and the other is brought up
//     beside it straight after, so a walker stops in two steps and stands square, not with a shuffle a moment later;
//   - turning hard, a foot is put down already turned some way into the turn, so it is not wrung round under the body.
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
const STAND = [[.105, .01], [-.105, .01]];   // where each foot stands at rest, from the body (to its left, ahead; metres on a 1.8 m person) until it has been seen standing
const G = 9.81, HIPS = .95;   // the body as a weight on legs (for where it would come to rest): gravity, and how high the weight rides

export class Stride {
  constructor(rig, body) {
    const P = rig.parts;
    this.rig = rig; this.body = body; this.on = false; this.a = 0;
    const k = (rig.height || 1.8) / 1.8; this.heel = [0, -.085 * k, -.06 * k]; this.ball = [0, -.085 * k, .13 * k];   // the two points of its sole a foot stands on, from its ankle
    this.legs = [['legL', 'shinL', 'footL'], ['legR', 'shinR', 'footR']].map(([u, l, e]) => P[u] && P[l] && P[e] ? { up: P[u], lo: P[l], end: P[e], F: new Vector3(), T: new Vector3(), Q: new Quaternion(), down: true, landed: false, sw: 0, on: 0, Cx: 0, Cz: 0, hx: 0, hz: 0, bx: 0, bz: 0, fy: 0, yaw0: 0, dyaw: 0, dy0: 0, ox: 0, oz: 0, u0: 0, hop: 0, t: 0, dur: .25, lift: 0, fx: 0, fz: 0, need: 0, len: 1, lx: 0, lz: 0, dl: 0, df: 0, kd: 0, okl: 0, okf: 0, goal: null } : null);
    this.ok = !!(P.hips && this.legs[0] && this.legs[1]);
    this.px = this.pz = this.yaw = this.vx = this.vz = this.w = 0; this.ox = this.oz = this.sink = 0; this.rest = 0; this.cool = 0; this.last = 1; this.hold = false; this.fresh = 0; this.go = false; this.turned = 0; this.walked = 0; this.chg = 0;
    this.vf = 0; this.ac = 0; this.sp = 0; this.ap = 0; this.sk = 0; this.rx = 0; this.rz = 0; this.cp = 0; this.after = 9; this.was = false; this.stand = STAND.map(a => a.slice());
    /** false: no planned starts, stops and turning steps (the walk as drawn decides where the feet come down, as before). */
    this.plan = true;
  }
  /** The feet as they are now: [{ down, landed (true on the update it touches the ground: a footstep) }, ...], left then right. */
  get feet() { return this.legs; }
  // put down where it is: on its ball if the toes point down, else on its heel (a flat foot stands on its heel)
  // (dy: put down turned that far from the way the body faces, into a turn)
  lock(f, yaw, dy = 0) { f.down = true; f.sw = 0; f.on = f.fy < -.004 ? 1 : 0; const c = Math.cos(dy), s = Math.sin(dy), ox = f.on ? f.bx : f.hx, oz = f.on ? f.bz : f.hz; f.Cx = f.T.x + ox * c + oz * s; f.Cz = f.T.z + oz * c - ox * s; f.yaw0 = yaw + dy; f.dyaw = dy; }
  // lifted for the walk's own swing from wherever it stood: it makes up the difference on its way, and is lifted a little more the more it has to make up
  // (a foot left behind as a walk slows would otherwise be dragged home along the ground)
  swing(f, u, sc) { f.down = false; f.sw = 1; f.u0 = Math.min(.9, Math.max(0, u)); f.ox = f.T.x - f.F.x; f.oz = f.T.z - f.F.z; f.dy0 = f.dyaw; f.hop = Math.min(.05 * sc, .25 * Math.hypot(f.ox, f.oz)); }
  // picked up, to be put down where the pose has it by the time it lands (dur seconds on); the further it has to go the higher it is lifted
  // (to: [x, z] where to put it down, in place of where the pose has it)
  step(f, dur, sc, to = null) { f.down = false; f.sw = 2; f.fx = f.T.x; f.fz = f.T.z; f.t = 0; f.dur = dur; f.goal = to; f.lift = (.03 + .05 * Math.min(1, Math.hypot(f.T.x - (to ? to[0] : f.F.x), f.T.z - (to ? to[1] : f.F.z)) / sc / .4)) * sc; f.dy0 = f.dyaw; }
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
      // a knee the pose puts down on the ground (a kneel): that leg is not stood on, it turns with the body on its knee
      const k = f.lo.matrixWorld.elements; f.kd = sm((.15 * sc - (k[13] - e[13])) / (.06 * sc));
    }
    // how the body really moves (a jump from one place to another is not a move)
    // (the way it faces is counted on without wrapping, so a foot left a whole turn behind is never taken for one a little ahead)
    const dyaw = this.on ? wrap(yaw - this.yaw) : 0, turned = this.turned + dyaw;
    const jump = !this.on || Math.hypot(px - this.px, pz - this.pz) > Math.max(.6, 14 * dt) * sc || Math.abs(dyaw) > Math.max(.9, 20 * dt);   // (nor is a snap round to face another way a turn)
    this.turned = turned;
    if (jump) { this.vx = this.vz = this.w = 0; this.reset(turned); this.on = true; this.fresh = 2; }
    else if (dt > 0) { const k = this.fresh ? 1 : 1 - Math.exp(-dt * 20); this.vx += ((px - this.px) / dt - this.vx) * k; this.vz += ((pz - this.pz) / dt - this.vz) * k; this.w += (dyaw / dt - this.w) * k; }
    this.px = px; this.pz = pz; this.yaw = yaw;
    // the body's speed along the way it faces, and how fast that changes (for starts and stops)
    const vf = this.vx * s + this.vz * c;
    if (jump || this.fresh) { this.vf = vf; this.ac = this.ap = 0; this.sp = speed; } else if (dt > 0) { this.ac += ((vf - this.vf) / dt - this.ac) * (1 - Math.exp(-dt * 10)); this.vf = vf; this.ap += ((speed - this.sp) / dt - this.ap) * (1 - Math.exp(-dt * 25)); this.sp = speed; }
    // where each foot is drawn, seen from the body (it moves there only when the pose itself changes)
    const lat = f => ((f.F.x - px) * c - (f.F.z - pz) * s) / sc, fwd = f => ((f.F.x - px) * s + (f.F.z - pz) * c) / sc;
    const v = Math.hypot(this.vx, this.vz), pace = Math.abs(speed), gait = gw > .05 && pace > .05, back = speed < 0;   // (back: the walk is run backwards, for a person backing away)
    // the pose itself changing from one way of standing to another (standing easy to a kneel, a kneel to a crouch): the feet go where it
    // draws them as it goes, not left behind to be stepped up a foot at a time afterwards. (Not as a walk stops: a foot the walk
    // leaves out of place is stepped home. Nor for a pose's own slow sway: the feet stay put.)
    this.walked = gait || gw > .05 ? 0 : this.walked + dt;
    let r = 0; for (const f of L) { const nl = lat(f), nf = fwd(f); f.dl = nl - f.lx; f.df = nf - f.lz; f.lx = nl; f.lz = nf; if (dt > 0) r = Math.max(r, Math.hypot(f.dl, f.df) / dt); }
    this.chg = jump || !(dt > 0) ? 0 : Math.max(r, this.chg * Math.exp(-dt * 6));   // (how fast the pose moves its feet, held a moment: a change eases in and out)
    const kc = jump || gait || this.walked < .5 ? 0 : sm((this.chg - .15) / .2);
    if (kc > 0) for (const f of L) if (f.down) { const wx = (f.dl * c + f.df * s) * sc * kc, wz = (f.df * c - f.dl * s) * sc * kc; f.Cx += wx; f.Cz += wz; f.T.x += wx; f.T.z += wz; }
    // walking: only while the body really goes along at something like the walk's own speed (a walk on the spot is left as drawn, and so is a
    // walk along a moving deck); standing: not while it is carried. (Between the two edges it stays as it was, so it never half holds a foot.)
    if (gait) { if (v > .5 * pace && v < 1.8 * pace + .4 * sc) this.go = true; else if (v < .15 * pace || v > 2.2 * pace + .6 * sc) this.go = false; }
    else if (v < .5 * sc) this.go = true; else if (v > .9 * sc) this.go = false;
    const want = this.hold || !this.go ? 0 : g;
    // setting off from standing (the walk has just begun, both feet down)
    const start = this.plan && gait && !this.was && !back && !jump && !this.fresh && L[0].down && L[1].down; this.was = gait;
    if (gait) for (const f of L) f.okl = f.okf = 0;
    // coming to a stop: the body is a weight on legs, and at the rate it is slowing it comes to rest a little ahead (rx, rz). A person
    // stopping puts the foot in the air down there, where it will stand at rest, as a braking step, and brings the other up beside it;
    // stopped harder than legs could (a game can stop a body dead), the braking foot reaches a little further, toward where a weight
    // going at that speed would have to be caught (its capture point: speed over the rate of a pendulum as long as the legs, cp)
    // (the speed the game gives says it sooner than the body's own, which is measured over a few updates: that one, while the two agree)
    const vg = Math.max(0, vf), dec = -(Math.abs(Math.abs(speed) - vg) < .3 + .3 * vg ? Math.min(this.ac, this.ap) : this.ac), stopping = this.plan && gait && !back && vg > .05 && dec > .8 && vg * vg / (2 * dec) < 1.1 * sc;
    if (stopping) { const d = Math.min(.6 * sc, vg * vg / (2 * dec)), cp = vg / Math.sqrt(G / (HIPS * sc)); this.rx = px + s * d; this.rz = pz + c * d; this.cp = Math.max(0, Math.min(.06 * sc, (cp - d) * .3)); this.after = 0; }
    else if (dt > 0) { this.after += dt; if (!gait && this.after < 1) { this.rx = px; this.rz = pz; } }   // (stopped: it has come to rest here)
    if (dt > 0) this.sk += ((stopping ? 1 : 0) - this.sk) * (1 - Math.exp(-dt * 14));
    const rest = (i, ahead) => { const st = this.stand[i], l = st[0] * sc, w = st[1] * sc + ahead; return [this.rx + l * c + w * s, this.rz - l * s + w * c]; };
    // where a foot is put down to stop: where it stands at rest; but where the other foot is already down near its own, level with that one (a person stops square)
    const place = i => { const o = L[1 - i], P = rest(1 - i, this.cp); if (o.down && Math.hypot(o.T.x - P[0], o.T.z - P[1]) < .14 * sc) { const l = this.stand[i][0] * sc, w = (o.T.x - this.rx) * s + (o.T.z - this.rz) * c - (this.stand[1 - i][1] - this.stand[i][1]) * sc; return [this.rx + l * c + w * s, this.rz - l * s + w * c]; } return rest(i, this.cp); };
    // (it comes in and goes out softly, but not on a person who has just appeared: the feet are where the pose has them, and the first move tells how the body goes)
    if (this.fresh) { this.a = want; if (dt > 0) this.fresh--; } else if (dt > 0) this.a += (want - this.a) * (1 - Math.exp(-dt * 10));
    if (this.hold || (this.a < .002 && want <= 0)) { this.a = 0; this.reset(turned); return; }
    // a foot in the air comes down a little off the walk's own place when the body does not go as the walk was drawn: half a stance's worth of the difference
    let shx = 0, shz = 0;
    if (gait) { const half = Math.min(.7, st / Math.max(.3, beat)) * .4; shx = (this.vx - s * speed) * half; shz = (this.vz - c * speed) * half; const l = Math.hypot(shx, shz), most = .4 * sc; if (l > most) { shx *= most / l; shz *= most / l; } }
    // turning hard, a foot comes down already turned into the turn, by about half of how far the body will turn while it stands on it
    // (it is wrung round less under the body: a step turn)
    const lead = this.plan && gait ? Math.max(-.5, Math.min(.5, this.w * st / Math.max(.3, beat) * .45)) : 0;
    // setting off: the foot that bears less of the weight (the one further from under the hips; one already behind; or, turning, the one on
    // the side it turns to) steps first, after a moment in which the weight goes over the other: the walk is begun just before that foot leaves the ground
    let phase = ph;
    if (start) {
      const h = this.rig.parts.hips.matrixWorld.elements, hl = (h[12] - px) * c - (h[14] - pz) * s, tl = f => (f.T.x - px) * c - (f.T.z - pz) * s, tf = f => (f.T.x - px) * s + (f.T.z - pz) * c;
      let p = Math.abs(tl(L[0]) - hl) > Math.abs(tl(L[1]) - hl) ? 0 : 1; const d = tf(L[0]) - tf(L[1]);
      if (Math.abs(d) > .06 * sc) p = d < 0 ? 0 : 1; if (Math.abs(this.w) > .6) p = this.w > 0 ? 0 : 1;
      phase = ((st - .08 - .5 * p) % 1 + 1) % 1;
      const R = this.rig; if (R.blendOn && R.bw) R.blendPhase = phase; else { const l = R.layers[R.layers.length - 1]; if (l && R.poses[l.name]?.rate && !l.pin) l.phase = phase; }
    }
    for (let i = 0; i < 2; i++) {
      const f = L[i], fr = phase + i * .5 - Math.floor(phase + i * .5), wantDown = !gait || fr < st, u = !gait ? 0 : back ? (1 - fr) / (1 - st) : (fr - st) / (1 - st);
      // where a foot in the air is to come down: as the walk has it (a little off that when the body does not go as drawn); stopping, where it will stand at rest
      let ex = f.F.x + shx, ez = f.F.z + shz;
      if (this.sk > 1e-3 && gait && !f.down) {
        let [bx, bz] = place(i);
        // (no more than a little further than the walk itself would put it, which is about as far as a leg reaches from where the body will be when
        // it comes down: a runner who has further to go to stop takes more braking steps)
        const ahead = (bx - ex) * s + (bz - ez) * c, most = .1 * sc;
        if (ahead > most) { bx -= s * (ahead - most); bz -= c * (ahead - most); }
        ex += (bx - ex) * this.sk; ez += (bz - ez) * this.sk;
      }
      if (f.down) {
        if (!wantDown) this.swing(f, u, sc);
        else {
          // it keeps the way it pointed when it was put down (as far as an ankle turns), and the point it stands on stays where it is
          if (!gait && f.kd > .5 && dt > 0) { const k = 1 - Math.exp(-dt * 14); f.yaw0 += (turned - f.yaw0) * k; f.Cx += (f.F.x + (f.on ? f.bx : f.hx) - f.Cx) * k; f.Cz += (f.F.z + (f.on ? f.bz : f.hz) - f.Cz) * k; }   // (on its knee: it comes round with the body)
          f.dyaw = Math.max(-.8, Math.min(.8, f.yaw0 - turned)); const cy = Math.cos(f.dyaw), sy = Math.sin(f.dyaw);
          const hx = f.hx * cy + f.hz * sy, hz = f.hz * cy - f.hx * sy, bx = f.bx * cy + f.bz * sy, bz = f.bz * cy - f.bx * sy;
          if (f.on ? f.fy > .004 : f.fy < -.004) { const k = f.on ? -1 : 1; f.Cx += (bx - hx) * k; f.Cz += (bz - hz) * k; f.on = 1 - f.on; }   // it rolls from its heel onto its ball (or back)
          const tx = f.Cx - (f.on ? bx : hx), tz = f.Cz - (f.on ? bz : hz);
          if (kc > 0) { f.T.x += (tx - f.T.x) * (1 - kc); f.T.z += (tz - f.T.z) * (1 - kc); f.T.y = f.F.y; f.Cx = f.T.x + (f.on ? bx : hx); f.Cz = f.T.z + (f.on ? bz : hz); }   // (the ankle goes as the pose draws it, however the foot turns under it)
          else f.T.set(tx, f.F.y, tz);
        }
      }
      if (!f.down && f.sw === 1) {
        if (!gait) { const to = this.plan && this.after < .4 ? place(i) : null; this.step(f, to ? .17 + .1 * Math.min(1, Math.hypot(f.T.x - to[0], f.T.z - to[1]) / sc / .4) : .18, sc, to); }   // the walk has stopped with this foot in the air: it is set down as a step (stopping, where it stands at rest)
        else if (wantDown) { f.T.set(ex, f.F.y, ez); this.lock(f, turned, lead); f.landed = true; }
        else { const pr = Math.max(0, Math.min(1, (u - f.u0) / (1 - f.u0))), k = 1 - sm(pr); f.T.set(f.F.x + f.ox * k + (ex - f.F.x) * (1 - k), f.F.y + (f.hop + .03 * sc * this.sk) * Math.sin(Math.PI * pr), f.F.z + f.oz * k + (ez - f.F.z) * (1 - k)); f.dyaw = f.dy0 * k + lead * (1 - k); }
      }
      if (!f.down && f.sw === 2) {
        if (gait && !wantDown) this.swing(f, u, sc);   // (a walk begins with this foot already in the air)
        else {
          f.t += dt / f.dur;
          const gx = f.goal ? f.goal[0] : f.F.x, gz = f.goal ? f.goal[1] : f.F.z;
          if (f.t >= 1) { f.T.set(gx, f.F.y, gz); this.lock(f, turned); f.landed = true; this.cool = .06; }
          else { const k = sm(f.t); f.T.set(f.fx + (gx - f.fx) * k, f.F.y + f.lift * Math.sin(Math.PI * f.t), f.fz + (gz - f.fz) * k); f.dyaw = f.dy0 * (1 - k); }
        }
      }
    }
    // standing: a foot too far from its place, or turned too far from the way the body faces, steps (one at a time; sooner once the body has come to rest)
    if (!gait && dt > 0) {
      this.rest = v < .08 * sc && Math.abs(this.w) < .15 ? this.rest + dt : 0; this.cool -= dt;
      // (where the feet stand at rest, as the pose draws them, for the next stop to put them there)
      if (this.rest > .4 && kc === 0 && gw <= 0 && g > .99 && L[0].down && L[1].down) for (let i = 0; i < 2; i++) { const f = L[i], l = lat(f), w = fwd(f); if (f.kd < .5 && Math.abs(l) > .04 && Math.abs(l) < .3 && Math.abs(w) < .2) { const k = 1 - Math.exp(-dt * 2), a = this.stand[i]; a[0] += (l - a[0]) * k; a[1] += (w - a[1]) * k; } }
      // turning quickly: the foot on the side it turns to steps first (the other would have to cross in front of it), steps are quicker,
      // and the second may lift as the first comes down
      const spin = Math.abs(this.w), open = this.w > 0 ? 0 : 1, quick = 1 + .25 * Math.max(0, spin - 1.5), up = L[0].down ? L[1].down ? null : L[1] : L[0];
      // just stopped: a foot not yet where it stands at rest is brought up there at once (square beside the other, a little ahead after a hard
      // stop); and then the stance it stopped in is its own, so it is not stepped up again a moment later to stand exactly as drawn
      let planned = false;
      if (this.plan && this.after < 1.2 && !up && kc < .5) {
        if (this.cool <= 0 && this.after < 1) {
          const P = [place(0), place(1)], d = L.map((f, i) => Math.hypot(f.T.x - P[i][0], f.T.z - P[i][1]));
          let pick = -1, worst = .07 * sc; for (let i = 0; i < 2; i++) if (L[i].kd < .5 && d[i] > worst && (pick < 0 || d[i] > d[pick])) { worst = d[i]; pick = i; }
          if (pick >= 0) { this.step(L[pick], .2 + .16 * Math.min(1, worst / sc / .4), sc, P[pick]); this.last = pick; planned = true; }
        }
        if (!planned) for (const f of L) { const dx = f.T.x - f.F.x, dz = f.T.z - f.F.z, l = (dx * c - dz * s) / sc, w = (dx * s + dz * c) / sc, m = Math.hypot(l, w), k = m > .12 ? .12 / m : 1; f.okl = l * k; f.okf = w * k; }
      }
      if (!planned && this.cool <= 0 && kc < .5 && (!up || (up.sw === 2 && up.t > .65 && spin > 2.5 && L[0].down !== L[1].down))) {
        const lim = this.rest > .5 ? .55 : 1; let pick = -1, worst = up ? 1.4 : 1;
        for (let i = 0; i < 2; i++) { const f = L[i]; if (!f.down || f.kd > .5) continue; const q = Math.max(Math.hypot(f.T.x - f.F.x - (f.okl * c + f.okf * s) * sc, f.T.z - f.F.z - (f.okf * c - f.okl * s) * sc) / (STEP * sc), Math.abs(f.dyaw) / TURN) / lim * (i === this.last ? .9 : 1) * (spin > 1 ? i === open ? 1.25 : .8 : 1); if (q > worst) { worst = q; pick = i; } }
        if (pick >= 0) { const f = L[pick]; f.okl = f.okf = 0; this.step(f, Math.max(.12, (.2 + .22 * Math.min(1, Math.hypot(f.T.x - f.F.x, f.T.z - f.F.z) / sc / .5)) / quick), sc); this.last = pick; }
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
      if (gait && dt > 0 && f.down && f.need > (.04 + .07 * this.sk) * sc) this.step(f, .16, sc);   // (stopping, the hips may sink further over a braking step: the knees give)
      if (f.down && !(f.kd > .5 && !gait)) need = Math.max(need, f.need);   // (a foot in the air needs no room made for it: the leg straightens and it comes up; nor one the pose has on its knee)
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
