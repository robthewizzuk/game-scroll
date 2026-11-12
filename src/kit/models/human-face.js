// The live face of gs.models.human: blinks, eyes that dart and follow, brows and a mouth for expressions and speech.
// A sculpted head has no shapes to blend between. It is one skin on a few small bones of its own (human-head.js:
// each eye, each upper lid, two to a brow, the jaw, the corners of the mouth), and this turns what a game asks of
// a face (gs.characters.Face's set(), say(), mouth(), blink()) into where those bones are. By itself it blinks,
// keeps the eyes on a spot in the world while the head moves and lets them jump on now and then, lowers the lid
// as the eye looks down, and closes the eyes of someone lying on the ground. The rig steps it with the body
// (close up only: further off the face's bones stand in as the head), so there is nothing to call.
// Kit use only: games reach it as a person's `face`.
import { Matrix4, Vector3 } from 'three';
import { Face } from '../skin.js';

/** What a person's face can be set to: face.set(name, 0..1). The first seven are gs.characters.Face's own. */
export const LIVE_SHAPES = ['open', 'wide', 'round', 'smile', 'frown', 'surprise', 'blink', 'squint', 'sad', 'angry', 'wince', 'winkL', 'winkR'];
const BONES = ['jaw', 'eyeL', 'eyeR', 'lidL', 'lidR', 'browL', 'browR', 'browInL', 'browInR', 'cornerL', 'cornerR'], SIDES = [['L', 1, 11], ['R', -1, 12]];
const JAW = .075;                         // how far the jaw drops for a mouth wide open (radians: the lips 8 mm apart)
const YAW = .56, UP = .36, DOWN = .46;    // how far an eye turns: to either side, up, down (radians)
const _inv = new Matrix4(), _t = new Vector3(), _v = new Vector3();
const rnd = (a, b) => a + Math.random() * (b - a), cl = (v, a, b) => v < a ? a : v > b ? b : v, bell = () => Math.random() + Math.random() + Math.random() + Math.random() - 2;
const at = t => t.isObject3D ? t.getWorldPosition(_t) : Array.isArray(t) ? _t.set(t[0], t[1], t[2]) : _t.set(t.x, t.y, t.z);

export class LiveFace extends Face {
  /** person: the human() it is the face of; B: its bones; lid: how far its upper lids turn to close (the head's own measure). */
  constructor(person, B, { lid = .8 } = {}) {
    super({ morphTargetDictionary: Object.fromEntries(LIVE_SHAPES.map((s, i) => [s, i])), morphTargetInfluences: LIVE_SHAPES.map(() => 0) });
    this.mesh = person.mesh; this.person = person; this.bones = B; this.lid = lid;
    this.rest = {}; for (const k of BONES) this.rest[k] = B[k].position.clone();
    this.arm = [this.rest.cornerL.y - this.rest.jaw.y, this.rest.cornerL.z - this.rest.jaw.z];   // a corner of the mouth from the jaw's hinge
    /** true: awake whatever; false: eyes closed and still; null (as made): awake unless the head lies over, low down (a body on the ground). */
    this.awake = null;
    this.target = null; this.aim = null; this.dartT = 0; this.glance = false; this.eye = [0, 0, 0, 0];
    /** Where the eyes are turned, in the head's own terms (radians): yaw to the person's left, pitch down. */
    this.yaw = 0; this.pitch = 0;
    this.shut = 0; this.lie = 0; this.wn = 0; this.winceT = 0; this.winceA = 0; this.since = 9; this.rigged = false; this.val = LIVE_SHAPES.map(() => 0);
  }
  /** One blink now: shut in a twentieth of a second, open again in a little longer. */
  blink() { this.blinking = .2; this.since = 0; return this; }
  /**
   * The eyes onto something: a point in the world ([x, y, z] or { x, y, z }), an Object3D (followed as it moves), or null to
   * let them wander again. They turn as far as eyes do (about 30 degrees to either side): turning the head is the game's.
   */
  look(target) { this.target = target || null; if (!target) this.aim = null; return this; }
  /** Eyes screwed shut and the mouth pulled back for a moment, as at a blow (gs.characters.Reactions does it by itself). */
  wince(amount = 1, seconds = .3) { this.winceA = Math.max(0, Math.min(1, amount)); this.winceT = seconds; return this; }
  /** Kit use: every bone of the face back where it rests (eyes ahead and open, the mouth shut), as a crowd's bake wants it. */
  still() { for (const k of BONES) { const b = this.bones[k]; b.position.copy(this.rest[k]); b.rotation.set(0, 0, 0); b.scale.setScalar(1); } return this; }
  /** Nothing to call for a person whose rig is updated (rig.update() steps the face with the body); one that only stands there is stepped by this. */
  update(dt) { return this.rigged ? this : this.step(dt); }
  // one step: every shape eased to where it is wanted (with the blinks, and the mouth of a line being spoken), then the bones put where those shapes have them
  step(dt, byRig = false) {
    if (byRig) this.rigged = true;
    const B = this.bones, R = this.rest, I = this.inf, V = this.val, W = this.want;
    // ---- asleep? When told so, or when the head lies over and low: a body on the ground (never one that crouches or bends)
    const hm = B.head.matrixWorld.elements, s = Math.hypot(hm[4], hm[5], hm[6]) || 1, lying = hm[5] / s < .42 && (hm[13] - this.person.matrixWorld.elements[13]) / s < .62;
    this.lie = lying ? Math.min(.4, this.lie + dt) : Math.max(0, this.lie - dt * 2);
    const asleep = this.awake === false || (this.awake == null && this.lie >= .35);
    this.shut += ((asleep ? 1 : 0) - this.shut) * (1 - Math.exp(-dt * (asleep ? 7 : 12)));
    // ---- the shapes: blinks by themselves (now and then two close together), the mouth from a line of speech or a level, the rest as set
    if (this.blinkEvery > 0 && !asleep && (this.blinkT -= dt) <= 0) { this.blink(); this.blinkT = Math.random() < .12 ? .3 : this.blinkEvery * (.55 + Math.random() * .9); }
    this.blinking = Math.max(0, this.blinking - dt); this.since += dt;
    const m = this.talk; let mo = 0, mw = 0, mr = 0;
    if (this.line) { const L = this.line; L.t += dt; while (L.i < L.v.length - 1 && L.v[L.i + 1].t <= L.t) L.i++; const a = L.v[L.i]; mo = a.open; mw = a.wide; mr = a.round; if (L.t >= L.v.end) this.line = null; }
    else if (this.level != null) { mo = cl(this.level, 0, 1); mw = mo * .25; }
    const km = 1 - Math.exp(-30 * dt), ke = 1 - Math.exp(-this.speed * dt); m.open += (mo - m.open) * km; m.wide += (mw - m.wide) * km; m.round += (mr - m.round) * km;
    for (let i = 0; i < V.length; i++) { V[i] += ((W[LIVE_SHAPES[i]] ?? 0) - V[i]) * ke; I[i] = V[i]; }
    I[0] = cl(V[0] + m.open * .85, 0, 1.5); I[1] = cl(V[1] + m.wide, 0, 1.5); I[2] = cl(V[2] + m.round, 0, 1.5);   // (talking, a jaw moves less than it can)
    if (this.blinking > 0) { const q = 1 - this.blinking / .2, c = q < .28 ? q / .28 : 1 - (q - .28) / .72; I[6] = Math.max(I[6], c * c * (3 - 2 * c)); }
    const [open, wide, round, smile, frown, surprise, blink, squint, sad, angry, winceS] = I;
    // ---- the eyes: on a point, or ahead: holding a spot in the world while the head moves (as eyes do), and jumping to a new one
    // now and then, or when the head has turned too far from the old one (then to a little ahead of the turn)
    const e = this.eye, tgt = asleep ? null : this.target; let yl, pl, yr, pr;
    _inv.copy(B.head.matrixWorld).invert();
    if (asleep) { yl = yr = 0; pl = pr = .1; this.aim = null; }
    else if (tgt) {
      at(tgt).applyMatrix4(_inv); this.aim = null;
      let d = _v.subVectors(_t, R.eyeL); yl = Math.atan2(d.x, Math.max(1e-4, d.z)); pl = Math.atan2(-d.y, Math.hypot(d.x, Math.max(1e-4, d.z)));
      d = _v.subVectors(_t, R.eyeR); yr = Math.atan2(d.x, Math.max(1e-4, d.z)); pr = Math.atan2(-d.y, Math.hypot(d.x, Math.max(1e-4, d.z)));
    } else {
      this.dartT -= dt; let y = 0, p = 0, off = true;
      if (this.aim) { const d = _v.copy(this.aim).transformDirection(_inv); y = Math.atan2(d.x, d.z); p = Math.atan2(-d.y, Math.hypot(d.x, d.z)); off = d.z < 0 || Math.abs(y) > .3 || p > .26 || p < -.22; }
      if (off || this.dartT <= 0) {
        const glance = !off && !this.glance && Math.random() < .22;   // a glance aside, and back soon after
        const ny = off && this.aim ? -Math.sign(y) * rnd(.02, .1) : glance ? (Math.random() < .5 ? -1 : 1) * rnd(.14, .3) : bell() * .06, np = glance ? bell() * .05 : .02 + bell() * .035;
        if (Math.abs(ny - y) + Math.abs(np - p) > .22 && this.blinkEvery > 0 && this.since > 1.2 && Math.random() < .5) { this.blink(); this.blinkT = Math.max(this.blinkT, this.blinkEvery * .4); }   // (eyes often blink as they jump far)
        this.aim = (this.aim || new Vector3()).set(Math.sin(ny) * Math.cos(np), -Math.sin(np), Math.cos(ny) * Math.cos(np)).transformDirection(B.head.matrixWorld);
        this.glance = glance; this.dartT = glance ? rnd(.35, .9) : rnd(.6, 3.2); y = ny; p = np;
      }
      yl = yr = y; pl = pr = p;
    }
    const k = 1 - Math.exp(-dt * 40);
    e[0] += (cl(yl, -YAW, YAW) - e[0]) * k; e[1] += (cl(pl, -UP, DOWN) - e[1]) * k; e[2] += (cl(yr, -YAW, YAW) - e[2]) * k; e[3] += (cl(pr, -UP, DOWN) - e[3]) * k;
    B.eyeL.rotation.set(e[1], e[0], 0, 'YXZ'); B.eyeR.rotation.set(e[3], e[2], 0, 'YXZ');
    this.yaw = (e[0] + e[2]) / 2; this.pitch = (e[1] + e[3]) / 2;
    // ---- a wince: on at once, off more slowly
    if (this.winceT > 0) { this.winceT -= dt; this.wn += (this.winceA - this.wn) * (1 - Math.exp(-dt * 35)); } else this.wn *= Math.exp(-dt * 7);
    const wi = Math.max(winceS, this.wn);
    // ---- the lids: a blink, eyes held shut; narrowed or widened by a look; and the lid follows the eye as it looks down or up
    const closed = Math.max(blink, this.shut, wi * .95), part = cl(.42 * squint + .13 * smile + .16 * angry - .17 * surprise + .55 * this.pitch / this.lid, -.25, .7);
    // ---- the jaw, and what it takes with it: the corners of the mouth come half way down with it
    const th = JAW * cl(open + .28 * surprise + .1 * wi, 0, 1.25), jy = -.5 * th * this.arm[1], jz = .5 * th * this.arm[0];
    B.jaw.rotation.x = th;
    for (const [sd, sg, wink] of SIDES) {
      const c = Math.max(closed, I[wink]), lid = B['lid' + sd], turn = c + (1 - c) * part;
      lid.rotation.x = turn * this.lid; lid.scale.setScalar(1 + .03 * Math.max(0, turn));   // (closing, it lies a hair further out: over the lower lid's edge, not in it)
      // the corner of the mouth: out for a wide mouth and a smile (up and back too), in and forward for a round one, down for a frown
      let r = R['corner' + sd];
      B['corner' + sd].position.set(r.x + sg * (.0034 * wide + .0038 * smile - .0046 * round + .0028 * wi - .0006 * frown), r.y + .0042 * smile - .0038 * frown - .0026 * sad + .001 * wi + jy, r.z - .0022 * smile - .0012 * wide + .003 * round - .001 * wi + jz);
      // the brows: both ends up in surprise; the inner ends down and together in anger and at a blow, up in sorrow
      r = R['brow' + sd]; B['brow' + sd].position.set(r.x, r.y + .0045 * surprise - .0012 * angry - .001 * squint - .0015 * wi + .0008 * sad, r.z);
      r = R['browIn' + sd]; B['browIn' + sd].position.set(r.x - sg * (.0022 * angry + .0012 * wi + .0008 * sad), r.y + .004 * surprise - .0032 * angry + .0035 * sad - .0015 * squint - .0025 * wi - .001 * frown, r.z);
    }
    return this;
  }
}
