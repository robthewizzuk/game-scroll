// The eyes and the head go first. A person who turns looks where they are turning before they get there: the eyes
// flick round first, the head follows a moment later, then the rib cage, and the hips and feet come round last. On a
// curve they look into it, at about where they will be in half a second. A drawn walk knows nothing of where the game
// is taking the body, and the follow-through (follow.js) leaves the head behind as the body turns, which is right for a
// body that is spun by a shove and backwards for a turn it means to make. Here the turn is read ahead:
//   - the game may say where the person means to go (rig.update(dt, { toward })): a point in the world { x, z }, or a
//     heading (radians, as the body's rotation.y). The gaze then goes there first, before the body has begun to turn;
//   - otherwise it is read from how the body is turning: going on at its rate for up to three quarters of a second, but never past where a
//     turn that is slowing down will end (its rate squared over how fast the rate falls), so the head does not swing past
//     the way the body will face.
// The eyes jump (a person's eyes move in quick jumps, then hold still on a spot in the world while the head catches up:
// gs.models.human's face does that, given how far ahead to look, face.lead); the head takes about two thirds of the
// turn and the rib cage a fifth, each on a spring, the head quicker. Nothing while aiming (the aim holds the head), off
// balance (stride.hold, set by gs.characters.Reactions), or seen from far off; little while the face is set on something.
// The Rig calls this by itself for a rig made with `body` and `follow` (gs.models.human is); rig.lead.amount = 0 turns it off.

const TAU = Math.PI * 2, wrap = a => a - Math.round(a / TAU) * TAU, lim = (v, m) => v < -m ? -m : v > m ? m : v;
const AHEAD = .75;                    // seconds of turning the gaze looks ahead on a gentle curve (less the quicker the turn: AHEAD / (1 + .35 |rate|))
const GAZE = 1.25;                    // the furthest the gaze goes from the way the body faces (radians), eyes, head and rib cage together
const HEAD = .55, CHEST = .2;         // the head's share of the gaze (on the body), the rib cage's (on the hips)
const KH = 16, KC = 9;                // how quick the head and the rib cage are (each a spring that does not overshoot, rad/s)

export class Lead {
  constructor(rig, body) {
    this.rig = rig; this.body = body;
    /** 0 off, 1 as a person does it, more to make it plainer. */
    this.amount = 1;
    this.on = false; this.yaw = 0; this.w = 0; this.al = 0; this.skip = 0;
    /** Where the gaze is now, from the way the body faces (radians, to its left +); the head's and the rib cage's share of it. */
    this.gaze = 0; this.head = 0; this.chest = 0; this.hv = 0; this.cv = 0;
  }
  /** Stills it (a new round; a person put somewhere else). */
  reset() { this.on = false; this.w = this.al = this.gaze = this.head = this.chest = this.hv = this.cv = 0; if (this.rig.face) this.rig.face.lead = 0; }
  /** Over the pose (out: { joint: [x, y, z] } as the rig mixed it), before the joints are set. toward: where the person means to go, or null. */
  pose(dt, out, toward = null) {
    const rig = this.rig, body = this.body, face = rig.face;
    if (rig.near === false || !(this.amount > 0)) { if (this.on || this.head || this.chest) this.reset(); return; }
    body.updateWorldMatrix(true, false);
    const e = body.matrixWorld.elements, yaw = Math.atan2(e[8], e[10]);
    // how the body turns (a snap round to face another way is not a turn)
    if (this.on && dt > 0) {
      const d = wrap(yaw - this.yaw);
      if (Math.abs(d) > Math.max(.9, 20 * dt)) { this.w = this.al = 0; this.skip = 2; }
      else { const w0 = this.w; this.w += (d / dt - this.w) * (this.skip ? 1 : 1 - Math.exp(-dt * 25)); this.al += ((this.skip ? 0 : (this.w - w0) / dt) - this.al) * (1 - Math.exp(-dt * 12)); if (this.skip) this.skip--; }
    } else if (!this.on) { this.w = this.al = 0; this.skip = 2; }
    this.yaw = yaw; this.on = true;
    // where the gaze goes
    let g;
    if (toward != null) {
      const ty = typeof toward === 'number' ? toward : Math.abs(toward.x - e[12]) + Math.abs(toward.z - e[14]) > .05 ? Math.atan2(toward.x - e[12], toward.z - e[14]) : yaw;
      g = lim(wrap(ty - yaw), GAZE);
    } else {
      const w = this.w, aw = Math.abs(w); let ahead = aw * AHEAD / (1 + .35 * aw);   // (on a curve the eyes look a good way along it; in a quick turn, to where it will end)
      if (this.al * w < 0) ahead = Math.min(ahead, w * w / Math.max(.05, Math.abs(this.al)) * .8);   // (a turn that is slowing down: no further than where it will end)
      g = aw < .05 ? 0 : Math.sign(w) * Math.min(GAZE, ahead);
    }
    // (held by an aim, off balance, or a face set on something: little or none of it)
    const k = this.amount * (1 - (rig.topW || 0)) * (rig.stride?.hold ? 0 : 1) * (face?.target ? .3 : 1);
    g *= k; this.gaze = g;
    // the head and the rib cage, each on a spring that comes round without overshooting
    if (dt > 0) {
      const n = Math.max(1, Math.ceil(dt / .011)), h = dt / n, th = g * HEAD, tc = g * CHEST;
      for (let i = 0; i < n; i++) {
        this.hv += (KH * KH * (th - this.head) - 2 * KH * this.hv) * h; this.head += this.hv * h;
        this.cv += (KC * KC * (tc - this.chest) - 2 * KC * this.cv) * h; this.chest += this.cv * h;
      }
    }
    if (Math.abs(this.head) + Math.abs(this.chest) + Math.abs(this.hv) * .05 > 1e-5) {
      (out.spine ||= [0, 0, 0])[1] += this.chest;
      (out.head ||= [0, 0, 0])[1] += this.head - this.chest;   // (the head turns on the rib cage: what the rib cage has turned is part of it)
    } else this.head = this.chest = this.hv = this.cv = 0;
    // the eyes: how far ahead of where the head points the gaze is (the face jumps them there and holds them while the head comes round)
    if (face) face.lead = lim(g - this.head, .5);
  }
}
