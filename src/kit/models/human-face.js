// The live face of gs.models.human: blinks, eyes that dart and follow, brows and a mouth for expressions and speech.
// A sculpted head has no shapes to blend between. It is one skin on small bones of its own (human-head.js faceBones:
// each eye, each upper and lower lid, two to a brow, each cheek, each side of the nose, the corners of the mouth, each half of
// each lip, the jaw and the chin), and this turns what a game asks of a face (gs.characters.Face's set(), say(), mouth(),
// blink(); expressions; the 51 single movements face capture records) into where those bones are, and says how far each
// kind of line that comes with an expression shows (mesh.userData.gsWrinkle, for a real face's skin). By itself it blinks,
// keeps the eyes on a spot in the world while the head moves and lets them jump on now and then, lowers the lid
// as the eye looks down, and closes the eyes of someone lying on the ground. The rig steps it with the body
// (close up only: further off the face's bones stand in as the head), so there is nothing to call.
// Kit use only: games reach it as a person's `face`.
import { Matrix4, Vector3, Vector4 } from 'three';
import { Face } from '../skin.js';

/**
 * The face's single movements, face.set(name, 0..1): the set face capture records (Apple's ARKit names; all but the tongue's), which the
 * expressions are blended from. Left and Right are the person's own.
 */
export const MOVES = ['browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight',
  'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawOpen', 'jawRight', 'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight'];
/** What a person's face can be set to: face.set(name, 0..1). The first seven are gs.characters.Face's own; then expressions; then MOVES. */
export const LIVE_SHAPES = ['open', 'wide', 'round', 'smile', 'frown', 'surprise', 'blink', 'squint', 'sad', 'angry', 'wince', 'winkL', 'winkR', 'disgust', 'fear', 'contempt', ...MOVES];
const NE = 16;   // (how many named expressions come before MOVES)
const BONES = ['jaw', 'chin', 'eyeL', 'eyeR', 'lidL', 'lidR', 'browL', 'browR', 'browInL', 'browInR', 'cornerL', 'cornerR', 'lowLidL', 'lowLidR', 'cheekL', 'cheekR', 'noseL', 'noseR', 'lipUpL', 'lipUpR', 'lipLowL', 'lipLowR'];
const SIDES = [['L', 1, 11, 'Left'], ['R', -1, 12, 'Right']], M = Object.fromEntries(MOVES.map((m, i) => [m, i]));
// each expression as a blend of single movements (both sides alike unless named): [move, amount]; Left/Right left off for both
const BLEND = {
  smile: [['mouthSmile', 1], ['cheekSquint', .55], ['eyeSquint', .3]], frown: [['mouthFrown', 1], ['browDown', .3], ['mouthShrugLower', .3]],
  surprise: [['browInnerUp', 1], ['browOuterUp', 1], ['eyeWide', .6], ['jawOpen', .28]], squint: [['eyeSquint', 1], ['cheekSquint', .3], ['browDown', .3]],
  sad: [['browInnerUp', .8], ['mouthFrown', .7], ['mouthShrugLower', .4], ['eyeSquint', .15]], angry: [['browDown', 1], ['noseSneer', .35], ['eyeSquint', .38], ['mouthPress', .35]],
  disgust: [['noseSneer', 1], ['mouthUpperUp', .6], ['browDown', .45], ['cheekSquint', .35], ['mouthFrown', .3], ['eyeSquint', .25]],
  fear: [['browInnerUp', 1], ['browOuterUp', .45], ['eyeWide', 1], ['mouthStretch', .7], ['jawOpen', .12]],
  contempt: [['mouthSmileLeft', .55], ['mouthDimpleLeft', .6], ['eyeSquint', .1]],
  open: [['jawOpen', 1]], wide: [['mouthStretch', 1]], round: [['mouthPucker', 1], ['mouthFunnel', .45]],
};
const BLENDS = Object.entries(BLEND).map(([k, l]) => [LIVE_SHAPES.indexOf(k), l.flatMap(([m, a]) => m in M ? [[M[m], a]] : [[M[m + 'Left'], a], [M[m + 'Right'], a]])]);
const JAW = .075;                         // how far the jaw drops for a mouth wide open (radians: the lips 8 mm apart)
const YAW = .56, UP = .36, DOWN = .46;    // how far an eye turns: to either side, up, down (radians)
const _inv = new Matrix4(), _t = new Vector3(), _v = new Vector3(), MBP = /[mbp]/, FV = /[fv]/;
// a wince: the brows down, the nose screwed up, the cheeks up, the mouth stretched and the lip lifted (with the eyes shut, and the jaw a little open)
const WINCE = [['browDown', .75], ['noseSneer', .5], ['cheekSquint', .6], ['mouthStretch', .7], ['mouthUpperUp', .25]].flatMap(([m, a]) => [[M[m + 'Left'], a], [M[m + 'Right'], a]]);
const rnd = (a, b) => a + Math.random() * (b - a), cl = (v, a, b) => v < a ? a : v > b ? b : v, bell = () => Math.random() + Math.random() + Math.random() + Math.random() - 2;
const at = t => t.isObject3D ? t.getWorldPosition(_t) : Array.isArray(t) ? _t.set(t[0], t[1], t[2]) : _t.set(t.x, t.y, t.z);

export class LiveFace extends Face {
  /** person: the human() it is the face of; B: its bones; lid: how far its upper lids turn to close (the head's own measure). */
  constructor(person, B, { lid = .8, droop = 0 } = {}) {
    super({ morphTargetDictionary: Object.fromEntries(LIVE_SHAPES.map((s, i) => [s, i])), morphTargetInfluences: LIVE_SHAPES.map(() => 0) });
    this.mesh = person.mesh; this.person = person; this.bones = B; this.lid = lid;
    this.rest = {}; for (const k of BONES) this.rest[k] = B[k].position.clone();
    this.arm = [this.rest.cornerL.y - this.rest.jaw.y, this.rest.cornerL.z - this.rest.jaw.z];   // a corner of the mouth from the jaw's hinge
    /** true: awake whatever; false: eyes closed and still; null (as made): awake unless the head lies over, low down (a body on the ground). */
    this.awake = null;
    this.target = null; this.aim = null; this.dartT = 0; this.glance = false; this.eye = [0, 0, 0, 0];
    /** Kit use: how far ahead of the head the eyes look into a turn (radians, to the person's left +; gs.poses lead.js sets it each frame). */
    this.lead = 0;
    /** Where the eyes are turned, in the head's own terms (radians): yaw to the person's left, pitch down. */
    this.yaw = 0; this.pitch = 0;
    this.shut = 0; this.lie = 0; this.wn = 0; this.winceT = 0; this.winceA = 0; this.since = 9; this.rigged = false; this.val = LIVE_SHAPES.map(() => 0);
    /** false: the nostrils keep still (by themselves they widen a little on each breath in). */
    this.breathe = true;
    /** How big the eyeballs are drawn (human.js: a real face's a hair smaller than the lids round them). */
    this.eyeSize = 1;
    /** How far the upper lids hang at rest, a share of their whole closing (a real face's .14: over the top of the iris, as relaxed lids are; eyeWide lifts them). */
    this.droop = droop;
    this.A = new Float32Array(MOVES.length); this.talk.press = this.talk.tuck = 0; this.bt = Math.random() * 9; this.wr = new Vector4();
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
  still() { for (const k of BONES) { const b = this.bones[k]; b.position.copy(this.rest[k]); b.rotation.set(0, 0, 0); b.scale.setScalar(k === 'eyeL' || k === 'eyeR' ? this.eyeSize : 1); } return this; }
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
    const m = this.talk; let mo = 0, mw = 0, mr = 0, mp = 0, mf = 0;
    if (this.line) { const L = this.line; L.t += dt; while (L.i < L.v.length - 1 && L.v[L.i + 1].t <= L.t) L.i++; const a = L.v[L.i]; mo = a.open; mw = a.wide; mr = a.round; mp = MBP.test(a.ch) ? 1 : 0; mf = FV.test(a.ch) ? 1 : 0; if (L.t >= L.v.end) this.line = null; }
    else if (this.level != null) { mo = cl(this.level, 0, 1); mw = mo * .25; }
    const km = 1 - Math.exp(-30 * dt), ke = 1 - Math.exp(-this.speed * dt); m.open += (mo - m.open) * km; m.wide += (mw - m.wide) * km; m.round += (mr - m.round) * km; m.press += (mp - m.press) * km; m.tuck += (mf - m.tuck) * km;
    for (let i = 0; i < V.length; i++) { V[i] += ((W[LIVE_SHAPES[i]] ?? 0) - V[i]) * ke; I[i] = V[i]; }
    I[0] = cl(V[0] + m.open * .85, 0, 1.5); I[1] = cl(V[1] + m.wide, 0, 1.5); I[2] = cl(V[2] + m.round, 0, 1.5);   // (talking, a jaw moves less than it can)
    if (this.blinking > 0) { const q = 1 - this.blinking / .2, c = q < .28 ? q / .28 : 1 - (q - .28) / .72; I[6] = Math.max(I[6], c * c * (3 - 2 * c)); }
    // ---- the movements: each as set, with each expression's share of it, and the lips' shapes for m, b, p (pressed together) and f, v (the lower lip
    // under the teeth); a wince, on at once and off more slowly, screws the face up
    if (this.winceT > 0) { this.winceT -= dt; this.wn += (this.winceA - this.wn) * (1 - Math.exp(-dt * 35)); } else this.wn *= Math.exp(-dt * 7);
    const wi = Math.max(I[10], this.wn), A = this.A;
    for (let k = 0; k < A.length; k++) A[k] = I[NE + k];
    for (const [e, list] of BLENDS) { const a = I[e]; if (a > 0) for (const [k, w] of list) A[k] += a * w; }
    A[M.mouthPressLeft] += .7 * m.press; A[M.mouthPressRight] += .7 * m.press; A[M.mouthClose] += m.press; A[M.mouthRollLower] += .8 * m.tuck; A[M.mouthUpperUpLeft] += .15 * m.tuck; A[M.mouthUpperUpRight] += .15 * m.tuck;
    if (wi > 0) for (const [k, w] of WINCE) A[k] += wi * w;
    for (let k = 0; k < A.length; k++) A[k] = cl(A[k], 0, 1.5);
    const blink = I[6];
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
      this.dartT -= dt; let y = 0, p = 0, off = true; const ld = this.lead || 0;   // (ld: into a turn the eyes look about a spot that far round)
      if (this.aim) { const d = _v.copy(this.aim).transformDirection(_inv); y = Math.atan2(d.x, d.z); p = Math.atan2(-d.y, Math.hypot(d.x, d.z)); off = d.z < 0 || Math.abs(y - ld) > .3 || p > .26 || p < -.22; }
      const flick = !off && Math.abs(ld) > .06 && Math.abs(y - ld) > .1;   // a turn begun: the eyes go first, in one jump, to where it is going
      if (off || flick || this.dartT <= 0) {
        const glance = !off && !flick && !this.glance && Math.abs(ld) < .1 && Math.random() < .22;   // a glance aside, and back soon after
        const ny = ld + (flick ? Math.sign(ld) * rnd(0, .04) : off && this.aim ? -Math.sign(y - ld) * rnd(.02, .1) : glance ? (Math.random() < .5 ? -1 : 1) * rnd(.14, .3) : bell() * .06), np = glance ? bell() * .05 : .02 + bell() * .035;
        if (Math.abs(ny - y) + Math.abs(np - p) > .22 && this.blinkEvery > 0 && this.since > 1.2 && Math.random() < .5) { this.blink(); this.blinkT = Math.max(this.blinkT, this.blinkEvery * .4); }   // (eyes often blink as they jump far)
        this.aim = (this.aim || new Vector3()).set(Math.sin(ny) * Math.cos(np), -Math.sin(np), Math.cos(ny) * Math.cos(np)).transformDirection(B.head.matrixWorld);
        this.glance = glance; this.dartT = glance ? rnd(.35, .9) : rnd(.6, 3.2); y = ny; p = np;
      }
      yl = yr = y; pl = pr = p;
    }
    if (!asleep) { yl += .5 * (A[M.eyeLookOutLeft] - A[M.eyeLookInLeft]); yr += .5 * (A[M.eyeLookInRight] - A[M.eyeLookOutRight]); pl += .4 * (A[M.eyeLookDownLeft] - A[M.eyeLookUpLeft]); pr += .4 * (A[M.eyeLookDownRight] - A[M.eyeLookUpRight]); }
    const k = 1 - Math.exp(-dt * 40);
    e[0] += (cl(yl, -YAW, YAW) - e[0]) * k; e[1] += (cl(pl, -UP, DOWN) - e[1]) * k; e[2] += (cl(yr, -YAW, YAW) - e[2]) * k; e[3] += (cl(pr, -UP, DOWN) - e[3]) * k;
    B.eyeL.rotation.set(e[1], e[0], 0, 'YXZ'); B.eyeR.rotation.set(e[3], e[2], 0, 'YXZ'); B.eyeL.scale.setScalar(this.eyeSize); B.eyeR.scale.setScalar(this.eyeSize);
    this.yaw = (e[0] + e[2]) / 2; this.pitch = (e[1] + e[3]) / 2;
    // ---- the lids: a blink, eyes held shut; narrowed or widened by a look; and the lid follows the eye as it looks down or up
    const closed = Math.max(blink, this.shut, wi * .95);
    // ---- the jaw, and what it takes with it: the corners of the mouth come half way down with it (the lower lip and the chin ride on it)
    const jo = cl(A[M.jawOpen] + .1 * wi, 0, 1.25), th = JAW * jo, jy = -.5 * th * this.arm[1], jz = .5 * th * this.arm[0];
    B.jaw.rotation.x = th; B.jaw.position.set(R.jaw.x + .003 * (A[M.jawLeft] - A[M.jawRight]), R.jaw.y, R.jaw.z + .004 * A[M.jawForward]);
    const pucker = A[M.mouthPucker], funnel = A[M.mouthFunnel], shift = .004 * (A[M.mouthLeft] - A[M.mouthRight]), rollU = A[M.mouthRollUpper], rollL = A[M.mouthRollLower];
    const shrugU = A[M.mouthShrugUpper], shrugL = A[M.mouthShrugLower], close = A[M.mouthClose] * Math.min(1, jo), puff = A[M.cheekPuff], inUp = A[M.browInnerUp];
    this.bt += dt; const flare = this.line || !this.breathe ? 0 : .3 * Math.max(0, Math.sin(this.bt * 1.5));   // (the nostrils widen a little on each breath in)
    let r = R.chin; B.chin.position.set(r.x, r.y + .002 * shrugL, r.z + .0015 * shrugL);
    for (const [sd, sg, wink, Sd] of SIDES) {
      const g = n => A[M[n + Sd]], smile = g('mouthSmile'), frown = g('mouthFrown'), stretch = g('mouthStretch'), dimple = g('mouthDimple'), press = g('mouthPress'), upUp = g('mouthUpperUp'), lowDown = g('mouthLowerDown');
      const sneer = g('noseSneer'), chSq = g('cheekSquint'), eSq = g('eyeSquint'), eW = g('eyeWide'), bD = g('browDown'), bOU = g('browOuterUp');
      const c = Math.max(closed, I[wink], g('eyeBlink')), part = cl(this.droop * (1 - eW) + .3 * eSq - .28 * eW + .55 * e[sg > 0 ? 1 : 3] / this.lid, -.25, .7), lid = B['lid' + sd], turn = c + (1 - c) * part;
      lid.rotation.x = turn * this.lid; lid.scale.setScalar(1 + .03 * Math.max(0, turn));   // (closing, it lies a hair further out: over the lower lid's edge, not in it)
      // the lower lid: up (and out, along the eyeball, not into it) in a squint and as the cheek rises
      r = R['lowLid' + sd]; B['lowLid' + sd].position.set(r.x, r.y + .0018 * eSq + .0008 * chSq - .0005 * eW, r.z + .0024 * eSq + .0011 * chSq - .0003 * eW);   // (out as far as up: the ball's lower half leans out that steeply)
      // the corner of the mouth: out for a stretched mouth and a smile (up and back too), in and forward for a round one, down for a frown, back for a dimple
      r = R['corner' + sd];
      // (a full smile takes the corners about 9 mm up, out and back, as far as a real one's: at half that it read as a polite smirk)
      B['corner' + sd].position.set(r.x + sg * (.0034 * stretch + .0052 * smile - .0046 * pucker - .0025 * funnel - .0006 * frown + .0008 * dimple - .0008 * press) + shift,
        r.y + .006 * smile - .0038 * frown - .0012 * stretch + .0006 * dimple + jy, r.z - .003 * smile - .0012 * stretch + .003 * pucker + .002 * funnel - .0018 * dimple + jz);
      // the lips' halves: the upper up (a sneer), the lower down; pressed, rolled in, pushed up, pushed forward (a kiss, an O), and together over an open jaw
      r = R['lipUp' + sd];
      // (in a smile the lips stretch after the corners: the upper one up a little and back over the teeth, the lower one out and flatter)
      B['lipUp' + sd].position.set(r.x + sg * (.0016 * smile - .0022 * pucker - .0012 * funnel) + shift, r.y + .0032 * upUp + .0012 * shrugU + .0012 * sneer + .001 * smile - .0008 * press - .0012 * rollU + .001 * funnel - .0035 * close, r.z + .003 * pucker + .0025 * funnel - .002 * rollU + .0006 * shrugU - .0008 * smile);
      r = R['lipLow' + sd];
      B['lipLow' + sd].position.set(r.x + sg * (.0014 * smile - .0022 * pucker - .0012 * funnel) + shift, r.y - .0035 * lowDown + .0008 * press + .0015 * rollL + .002 * shrugL - .001 * funnel + .0035 * close, r.z + .003 * pucker + .0025 * funnel - .0025 * rollL + .0012 * shrugL);
      // the cheek's pad up and forward in a smile and a squint, out when puffed; the nose's wing up in a sneer, out on a breath
      // (as far forward as up: the pad rides up over the cheekbone and stands out, and skin near the eye that only rose went into the eyeball)
      r = R['cheek' + sd]; B['cheek' + sd].position.set(r.x + sg * (.004 * puff + .0006 * smile), r.y + .0026 * chSq + .001 * smile + .001 * sneer, r.z + .0028 * chSq + .0012 * smile + .0035 * puff);
      r = R['nose' + sd]; B['nose' + sd].position.set(r.x + sg * (.0006 * sneer + .0006 * flare), r.y + .0025 * sneer + .0006 * upUp, r.z - .0004 * sneer);
      // the brows: their arches up; the inner ends up in sorrow and fear, both down and together in anger and at a blow
      r = R['brow' + sd]; B['brow' + sd].position.set(r.x, r.y + .0045 * bOU - .0013 * bD + .0005 * inUp, r.z);
      r = R['browIn' + sd]; B['browIn' + sd].position.set(r.x - sg * (.0022 * bD + .0005 * inUp), r.y + .004 * inUp - .0032 * bD, r.z);
    }
    // ---- the lines the skin folds into as it moves (a real face's skin, on WebGPU: hd3d-gpu.js): the forehead's as the brows rise, between the brows
    // as they come down, at the eyes' outer corners in a smile or a squint, and from the nose to the mouth
    const both = n => (A[M[n + 'Left']] + A[M[n + 'Right']]) / 2, sn = both('noseSneer');
    this.wr.set(Math.min(1, Math.max(inUp, both('browOuterUp'))), Math.min(1, Math.max(both('browDown'), .7 * sn)), Math.min(1, Math.max(both('cheekSquint'), .7 * both('eyeSquint'))), Math.min(1, Math.max(both('mouthSmile'), sn, .8 * both('mouthUpperUp'))));
    if (this.mesh) this.mesh.userData.gsWrinkle = this.wr;
    return this;
  }
}
