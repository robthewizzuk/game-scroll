// Follow-through. A body is not one stiff piece. When it starts, stops, turns or lands, what is carried on it goes on
// a moment longer and then settles: the arms swing on as a walker pulls up, the head nods, the rib cage and the
// head come round a little after the hips in a quick turn, the shoulders give on a landing, and a pack, a bag or a
// slung rifle bounces and swings. A drawn walk has none of that, because the loop knows nothing of what the game
// does with the body. Here each loose part is a spring pushed by how the body really moves (measured from the
// `body` the game moves, so nothing is asked of the game), added over whatever pose is playing.
//   - the body's own parts (arms, forearms, head, rib cage, shoulders) take the push of the whole body: its
//     change of speed forward, sideways and up, and the change of its turning;
//   - things that hang (rig.hang(thing, { pivot, swing, bounce })) take the push of the very point they hang from,
//     so they also bounce to the steps of a walk or a run, which the body's own parts already have drawn in.
// The Rig calls this by itself for a rig made with `body` and `follow` (gs.models.human is). rig.follow.amount = 0
// turns it off, 2 doubles it. A body moved from one place to another at a stroke gives no push.

import { Euler, Quaternion, Vector3 } from 'three';

const TAU = Math.PI * 2, wrap = a => a - Math.round(a / TAU) * TAU, lim = (v, m) => v < -m ? -m : v > m ? m : v;
const _p = new Vector3(), _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _c = new Vector3(), _q = new Quaternion(), _e = new Euler();
// each spring: how stiff, how damped, how far it goes for each unit of push (radians for a metre a second a second,
// or for a radian a second a second of turning), and the most it may go
//                 stiff damp  gain  most
const ARM_F = 0,  ARM_T = 1,  ARM_S = 2,  HEAD_F = 3, HEAD_Y = 4, CHEST_Y = 5, HEAD_S = 6, SHRUG = 7;
const SPRINGS = [
  [70, 8, .025, .15],    // both arms swing back as the body gets going and forward as it pulls up (no further than a person's own braking throws them: a game stops a runner far harder than legs can)
  [70, 8, .008, .2],     // one arm forward and one back as the body is spun
  [80, 9, .014, .16],    // both arms to one side as the body is pushed to the other
  [130, 13, .005, .12],  // the head tips back, or nods
  [110, 12, .004, .15],  // the head comes round after the body
  [90, 11, .004, .12],   // and so does the rib cage on the hips
  [130, 13, .004, .1],   // the head tips to the side
  [140, 12, .005, .1],   // the shoulders give when the body is stopped from falling (and the elbows with them)
];

export class Follow {
  constructor(rig, body) {
    this.rig = rig; this.body = body; this.amount = 1; this.on = false;
    this.px = this.py = this.pz = this.yaw = 0; this.v = [0, 0, 0]; this.a = [0, 0, 0]; this.w = 0; this.al = 0;   // where the body is, its speed, its change of speed, its turning and the change of that
    this.th = new Float32Array(SPRINGS.length); this.om = new Float32Array(SPRINGS.length); this.push = new Float32Array(SPRINGS.length); this.live = false; this.skip = 0;
    this.things = [];
  }
  /** Stills everything (a new round; a person put somewhere else). */
  reset() { this.on = false; this.th.fill(0); this.om.fill(0); this.live = false; this.still(); }
  /**
   * The body's own parts, over the pose (out: { joint: [x, y, z] } as the rig mixed it), before the joints are set.
   */
  pose(dt, out) {
    const A = this.amount, body = this.body;
    body.updateWorldMatrix(true, false);
    const e = body.matrixWorld.elements, px = e[12], py = e[13], pz = e[14], yaw = Math.atan2(e[8], e[10]), sc = Math.hypot(e[4], e[5], e[6]) || 1;
    let af = 0, as = 0, au = 0, al = 0;
    if (this.on && dt > 0) {
      const dx = px - this.px, dy = py - this.py, dz = pz - this.pz, dyaw = wrap(yaw - this.yaw);
      if (Math.hypot(dx, dy, dz) > Math.max(.6, 14 * dt) * sc || Math.abs(dyaw) > Math.max(.9, 20 * dt)) { this.v[0] = this.v[1] = this.v[2] = this.a[0] = this.a[1] = this.a[2] = this.w = this.al = 0; this.skip = 2; }   // moved at a stroke: no push (and none from the first move after it)
      else {
        const k1 = this.skip ? 1 : 1 - Math.exp(-dt * 30), k2 = 1 - Math.exp(-dt * 20), v = this.v, a = this.a, q = 1 / (dt * sc);
        for (let i = 0; i < 3; i++) { const was = v[i]; v[i] += ((i ? i > 1 ? dz : dy : dx) * q - v[i]) * k1; a[i] += ((this.skip ? 0 : (v[i] - was) / dt) - a[i]) * k2; }
        const ww = this.w; this.w += (dyaw / dt - this.w) * k1; this.al += ((this.skip ? 0 : (this.w - ww) / dt) - this.al) * k2;
        if (this.skip) this.skip--;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        af = lim(a[0] * s + a[2] * c, 14); as = lim(a[0] * c - a[2] * s, 14); au = lim(a[1], 14); al = lim(this.al, 40);
      }
    } else if (!this.on) { this.v[0] = this.v[1] = this.v[2] = this.a[0] = this.a[1] = this.a[2] = this.w = this.al = 0; this.skip = 2; }
    this.px = px; this.py = py; this.pz = pz; this.yaw = yaw; this.on = true;
    if (!(A > 0)) { if (this.live) { this.th.fill(0); this.om.fill(0); this.live = false; } return; }
    const th = this.th, om = this.om;
    if (dt > 0) {
      // what pushes each spring (the way it goes is the way the part is left behind)
      const push = this.push; push[0] = af; push[1] = al; push[2] = as; push[3] = -af; push[4] = push[5] = -al; push[6] = as; push[7] = au;
      const quiet = !this.live && Math.abs(af) + Math.abs(as) + Math.abs(au) + Math.abs(al) * .2 < .02;
      if (!quiet) {
        const n = Math.max(1, Math.ceil(dt / .011)), h = dt / n; let most = 0;
        for (let i = 0; i < SPRINGS.length; i++) {
          const S = SPRINGS[i], k = S[0], c = S[1], m = S[3], to = S[2] * push[i]; let x = th[i], w = om[i];
          for (let q = 0; q < n; q++) { w += ((to - x) * k - w * c) * h; x += w * h; }
          if (x > m) { x = m; if (w > 0) w = 0; } else if (x < -m) { x = -m; if (w < 0) w = 0; }
          th[i] = x; om[i] = w; most = Math.max(most, Math.abs(x) + Math.abs(w) * .05);
        }
        this.live = most > 1e-4; if (!this.live) { th.fill(0); om.fill(0); }
      }
    }
    if (!this.live) return;
    const J = j => out[j] ||= [0, 0, 0], P = this.rig.parts;
    const f = th[ARM_F] * A, t = th[ARM_T] * A, sd = th[ARM_S] * A, sh = th[SHRUG] * A;
    // an arm the pose already has swung the way it is pushed goes less far, so a push never makes a reach of a
    // swing: thrown forward it adds nothing to an arm the pose has 20 degrees forward (it shows as that arm coming
    // down late), left behind nothing at 40; it swings out freely, but only a little in against the body
    const room = (r, d) => d * r > 0 ? Math.max(0, 1 - Math.abs(r) / (d < 0 ? .35 : .7)) : 1;
    let dl = f - t, dr = f + t;
    if (P.armL) { const a = J('armL'); dl *= room(a[0], dl); a[0] += dl; a[2] -= Math.min(.05, sd); }
    if (P.armR) { const a = J('armR'); dr *= room(a[0], dr); a[0] += dr; a[2] -= Math.max(-.05, sd); }
    // the forearm goes on further than the arm: it straightens a little as the arm is left behind, and bends as the arm is thrown forward (an elbow never bends back)
    if (P.foreL) { const a = J('foreL'); a[0] = Math.min(Math.max(a[0], 0), a[0] + dl * .5 - Math.abs(sh) * .6); }
    if (P.foreR) { const a = J('foreR'); a[0] = Math.min(Math.max(a[0], 0), a[0] + dr * .5 - Math.abs(sh) * .6); }
    if (P.head) { const a = J('head'); a[0] += th[HEAD_F] * A; a[1] += th[HEAD_Y] * A; a[2] += th[HEAD_S] * A; }
    if (P.spine) J('spine')[1] += th[CHEST_Y] * A;
    if (P.collarL) J('collarL')[2] -= sh;
    if (P.collarR) J('collarR')[2] += sh;
  }
  /**
   * Something that hangs from the body and swings as it moves. thing: an Object3D (a bone of the person's kit, or
   * your own mesh on a bone). pivot: the point it hangs from, in its parent's space ([x, y, z]; default: its own
   * place). swing: radians it swings for each metre a second a second its pivot is pushed (.02 a bag on a strap,
   * .004 a pack held by two); bounce: metres it lags up and down (.0012 a pack); stiff, damp: its spring; most:
   * the furthest it swings (radians); away: [x, y, z] the way out from the body where it hangs, in its parent's
   * space (a pack on the back: [0, 0, -1]): it swings out and along the body but not into it. apply: false leaves the thing alone and only works out the swing, for a
   * thing you place yourself each frame: read x, z (radians about its pivot, forward-and-back and side to side)
   * and y (metres) from what this returns. The thing's place and turn as they are now are its rest.
   */
  hang(thing, { pivot = null, swing = .02, bounce = 0, stiff = 120, damp = 10, most = .3, away = null, apply = true } = {}) {
    const n = away ? Math.hypot(away[0], away[2]) || 1 : 1;
    const h = { thing, pivot: pivot ? new Vector3(...pivot) : thing.position.clone(), swing, bounce, stiff, damp, most, apply, nx: away ? away[0] / n : 0, nz: away ? away[2] / n : 0, wall: !!away,
      rest: thing.position.clone(), q0: thing.quaternion.clone(), x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, p: new Vector3(), v: new Vector3(), a: new Vector3(), has: false, skip: 0 };
    this.things.push(h); return h;
  }
  /** Lets go of a thing hung with hang() (and puts it back as it was). */
  drop(h) { const i = this.things.indexOf(h); if (i >= 0) { this.things.splice(i, 1); h.x = h.z = h.y = 0; if (h.apply) this.put(h); } }
  // the thing turned about the point it hangs from (about its parent's x and z), and moved up or down
  put(h) {
    const t = h.thing, c = h.pivot;
    _q.setFromEuler(_e.set(h.x, 0, h.z)); t.quaternion.copy(_q).multiply(h.q0);
    t.position.copy(h.rest).sub(c).applyQuaternion(_q).add(c); t.position.y += h.y;
  }
  /** Everything that hangs put back as it was (people seen from too far off for it to show). */
  still() { for (const h of this.things) { if (h.apply && (h.x || h.z || h.y)) { h.x = h.z = h.y = 0; this.put(h); } h.x = h.z = h.y = h.vx = h.vz = h.vy = 0; h.has = false; } }
  /** The things that hang, after the pose is set and the feet are placed. */
  swing(dt) {
    const A = this.amount;
    for (const h of this.things) {
      const par = h.thing.parent; if (!par) continue;
      par.updateWorldMatrix(true, false);
      const e = par.matrixWorld.elements; _p.copy(h.pivot).applyMatrix4(par.matrixWorld);
      const sc = Math.hypot(e[4], e[5], e[6]) || 1;
      if (!h.has || !(dt > 0) || _p.distanceTo(h.p) > Math.max(.6, 14 * dt) * sc) { if (dt > 0 || !h.has) { h.p.copy(_p); h.v.set(0, 0, 0); h.a.set(0, 0, 0); h.has = true; h.skip = 2; } if (h.apply && (h.x || h.z || h.y)) this.put(h); continue; }
      const k1 = h.skip ? 1 : 1 - Math.exp(-dt * 40), k2 = 1 - Math.exp(-dt * 25);
      _c.copy(_p).sub(h.p).multiplyScalar(1 / dt / sc); h.p.copy(_p);
      const vx = h.v.x, vy = h.v.y, vz = h.v.z; h.v.lerp(_c, k1);
      if (h.skip) { h.skip--; _c.set(0, 0, 0); } else _c.set((h.v.x - vx) / dt, (h.v.y - vy) / dt, (h.v.z - vz) / dt);
      h.a.lerp(_c, k2);
      // the push along the parent's own axes
      _x.set(e[0], e[1], e[2]).normalize(); _y.set(e[4], e[5], e[6]).normalize(); _z.set(e[8], e[9], e[10]).normalize();
      const ax = lim(h.a.dot(_x), 20), ay = lim(h.a.dot(_y), 20), az = lim(h.a.dot(_z), 20);
      const quiet = !h.x && !h.z && !h.y && !h.vx && !h.vz && !h.vy && Math.abs(ax) + Math.abs(ay) + Math.abs(az) < .03;
      if (quiet || !(A > 0)) { if (!(A > 0) && (h.x || h.z || h.y)) { h.x = h.z = h.y = h.vx = h.vz = h.vy = 0; if (h.apply) this.put(h); } continue; }
      const n = Math.max(1, Math.ceil(dt / .011)), s = dt / n, k = h.stiff, c = h.damp, tx = h.swing * az * A, tz = -h.swing * ax * A, ty = -h.bounce * ay * A;
      for (let q = 0; q < n; q++) {
        h.vx += ((tx - h.x) * k - h.vx * c) * s; h.x += h.vx * s;
        h.vz += ((tz - h.z) * k - h.vz * c) * s; h.z += h.vz * s;
        h.vy += ((ty - h.y) * k - h.vy * c) * s; h.y += h.vy * s;
      }
      const m = h.most; if (h.x > m) { h.x = m; h.vx = Math.min(0, h.vx); } else if (h.x < -m) { h.x = -m; h.vx = Math.max(0, h.vx); }
      if (h.z > m) { h.z = m; h.vz = Math.min(0, h.vz); } else if (h.z < -m) { h.z = -m; h.vz = Math.max(0, h.vz); }
      if (h.wall) {   // its lower end goes (z, -x) for these turns: no further into the body than a hair
        const d = h.z * h.nx - h.x * h.nz + .012; if (d < 0) { h.z -= h.nx * d; h.x += h.nz * d; const w = h.vz * h.nx - h.vx * h.nz; if (w < 0) { h.vz -= h.nx * w; h.vx += h.nz * w; } }
      }
      if (Math.abs(h.x) + Math.abs(h.z) + Math.abs(h.y) * 10 + (Math.abs(h.vx) + Math.abs(h.vz) + Math.abs(h.vy) * 10) * .05 < 1e-4) h.x = h.z = h.y = h.vx = h.vz = h.vy = 0;
      if (h.apply) this.put(h);
    }
  }
}
