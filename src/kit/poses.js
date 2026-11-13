// Poses for 3D characters made in code: a jointed figure (or your own parts hooked up as joints), a
// library of poses (idle, walk, run, sprint, crouch, aim, jump, fall, land, hang, shimmy, climb,
// swing, cover, punch, takedown, downed, wave, sit...) and smooth blending between them, with an
// upper-body layer so a hero can aim while running. Walk and run cycles follow how far the
// character really moved, so feet don't slide. Your game picks the pose each frame.
//
//   const { Rig, figure } = gs.poses;
//   reset() {
//     hero = figure({ body: '#3a6ea5', skin: '#f1c27d', legs: '#2b2b38', mat: c => toon(c) });   // a Group with .rig
//     view.add(hero);
//   }
//   update(dt) {
//     hero.rig.play(onGround ? (speed > 4 ? 'run' : speed > .2 ? 'walk' : 'idle') : vy > 0 ? 'jump' : 'fall');
//     hero.rig.upper(aiming ? 'aim' : null);                    // arms and chest only, over the legs
//     hero.rig.update(dt, { speed, aim: pitch });              // speed: metres a second (drives the steps)
//   }
//   Blend spaces (blend trees): rig.blend({ idle: 0, walk: 1.4, run: 4, sprint: 7 }, speed) mixes the two
//   poses either side of the value, every cycle in step; rig.blend2({ idle: [0, 0], walk: [0, 1], back: [0, -1],
//   strafeL: [-1, 0], strafeR: [1, 0] }, x, y) mixes by a 2D value (strafing). play() goes back to one pose.
//   Feet on uneven ground (foot IK): rig.plant((x, z) => groundHeight, character) after rig.update().
//   A smooth skinned person with a face and lip sync: person() (src/kit/skin.js), the same Rig.
//   Your own model: new Rig({ hips, spine, head, armL, foreL, armR, foreR, legL, shinL, legR, shinR }) with
//   each part a Group whose origin is its joint (shoulder, elbow, hip, knee...), arms and legs hanging down.
//
// The figure faces +z (the way Object3D.lookAt turns things). Angles are radians.

import { timed } from './prof.js';
import { Bone, BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { reach } from './characters.js';
import { Stride } from './stride.js';
import { Follow } from './follow.js';
export { person, Face, shapes, visemes, FACE_SHAPES } from './skin.js';

const JOINTS = ['hips', 'spine', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'];
// a full skeleton (gs.models.human's) has joints between those: the rig works most of them out by itself (fill())
const FULL = [...JOINTS, 'waist', 'neck', 'collarL', 'collarR', 'twistL', 'twistR', 'toeL', 'toeR'];
const FILLED = new Set(['waist', 'neck', 'collarL', 'collarR', 'twistL', 'twistR']), TOES = new Set(['toeL', 'toeR']);   // (set by fill(); and the two that are mostly at rest)
const UPPER = new Set(['spine', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'collarL', 'collarR']);
const S = Math.sin, TAU = Math.PI * 2, SPACES = new WeakMap();
const HINGES = [['shinL', 1], ['shinR', 1], ['foreL', -1], ['foreR', -1]];   // joints that bend one way only: a knee (+x), an elbow (-x)
const _q = new Quaternion(), _q2 = new Quaternion(), _v = new Vector3(), Z3 = [0, 0, 0];
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// A share of a turn q, into out: `sw` of its bend and `tw` of its twist about the bone's own length (y).
function shareOf(q, sw, tw, out) {
  let x = q.x, y = q.y, z = q.z, w = q.w; if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const tl = Math.hypot(y, w), ty = tl > 1e-9 ? y / tl : 0, t0 = tl > 1e-9 ? w / tl : 1;   // the twist (0, ty, 0, t0); what is left is the bend
  const bx = x * t0 + z * ty, bz = z * t0 - x * ty, bl = Math.hypot(bx, bz), hb = Math.atan2(bl, tl) * sw, k = bl > 1e-9 ? Math.sin(hb) / bl : 0, ax = bx * k, az = bz * k, aw = Math.cos(hb);
  const ht = Math.atan2(ty, t0) * tw, by = Math.sin(ht), bw = Math.cos(ht);
  return out.set(ax * bw - az * by, aw * by, az * bw + ax * by, aw * bw);
}

/**
 * A joint in between (gs.models.human's shoulders, elbows, hips and knees): a bone at a joint's own place that takes
 * half of that joint's turn, by itself, every time the skeleton is worked out, whoever turned the joint (a pose, a
 * hand brought onto a rifle, a ragdoll, a game's own code). Skin shared between only the two bones either side of
 * a joint pinches in as it bends, the more the further it bends; skin that goes round the joint with this bone
 * keeps its girth, and what lies either side of it has only half the bend to bridge. `out`: where the outside of
 * the bend is, from the joint (metres, in the bone's own space): the bone moves that way as the joint closes, all
 * of it once the joint is folded right over (the point of an elbow and a kneecap stand out of a bent limb).
 * Kit use: nothing poses these, and a pose never names them.
 */
export class Between extends Bone {
  constructor() { super(); this.of = null; this.out = null; this.home = null; }
  updateMatrix() {
    const of = this.of;
    if (of) {
      const q = of.quaternion, s = q.w < 0 ? -1 : 1, w = q.w * s + 1, l = 1 / Math.hypot(q.x, q.y, q.z, w), o = this.out;
      this.quaternion.set(q.x * s * l, q.y * s * l, q.z * s * l, w * l);   // (half a turn q is q + 1, made a turn again)
      if (o) { const k = 1 - q.w * q.w; _v.set(o[0] * k, o[1] * k, o[2] * k).applyQuaternion(this.quaternion); this.position.copy(this.home).add(_v); }
    }
    super.updateMatrix();
  }
}

// A pose: { joint: [rx, ry, rz] } plus drop (hips lower, in body heights) and shift ([x, y, z]: the hips
// moved, in metres on a 1.8 m figure). Forward swing of an arm or leg is negative x; knees bend positive
// x; elbows bend negative x; a foot's toes point down with positive x. Hands and feet (handL, footL...)
// are joints too where the figure has them.
const P = (o, drop = 0) => ({ j: o, drop });
const cyc = (fn, rate) => ({ cycle: fn, rate });   // rate: cycles per metre
export const POSES = {
  idle: cyc(p => P({ spine: [.03 + S(p * TAU) * .015, 0, 0], armL: [0, 0, -.08], armR: [0, 0, .08], foreL: [-.15, 0, 0], foreR: [-.15, 0, 0] }), 0),
  walk: cyc(p => { const s = S(p * TAU); return P({ spine: [.05, 0, 0], legL: [-.45 * s, 0, 0], legR: [.45 * s, 0, 0], shinL: [Math.max(0, .7 * S(p * TAU + 1.2)), 0, 0], shinR: [Math.max(0, -.7 * S(p * TAU + 1.2)), 0, 0], armL: [.4 * s, 0, -.06], armR: [-.4 * s, 0, .06], foreL: [-.3, 0, 0], foreR: [-.3, 0, 0] }, .015 * Math.abs(S(p * TAU * 2))); }, .55),
  run: cyc(p => { const s = S(p * TAU); return P({ spine: [.22, 0, 0], head: [-.12, 0, 0], legL: [-.9 * s - .1, 0, 0], legR: [.9 * s - .1, 0, 0], shinL: [.3 + Math.max(0, 1.3 * S(p * TAU + 1.4)), 0, 0], shinR: [.3 + Math.max(0, -1.3 * S(p * TAU + 1.4)), 0, 0], armL: [.8 * s, 0, -.1], armR: [-.8 * s, 0, .1], foreL: [-1.3, 0, 0], foreR: [-1.3, 0, 0] }, .04 + .03 * S(p * TAU * 2)); }, .32),
  sprint: cyc(p => { const s = S(p * TAU); return P({ spine: [.38, 0, 0], head: [-.25, 0, 0], legL: [-1.1 * s - .2, 0, 0], legR: [1.1 * s - .2, 0, 0], shinL: [.4 + Math.max(0, 1.6 * S(p * TAU + 1.4)), 0, 0], shinR: [.4 + Math.max(0, -1.6 * S(p * TAU + 1.4)), 0, 0], armL: [1 * s, 0, -.1], armR: [-1 * s, 0, .1], foreL: [-1.5, 0, 0], foreR: [-1.5, 0, 0] }, .06); }, .26),
  back: cyc(p => POSES.walk.cycle(1 - p), .55),   // walking backwards: the walk run in reverse
  strafeL: cyc(p => { const s = S(p * TAU); return P({ spine: [.05, 0, .04], legL: [-.1, 0, -.12 - .3 * Math.max(0, s)], legR: [-.1, 0, -.12 + .3 * Math.max(0, -s)], shinL: [.2 + .5 * Math.max(0, s), 0, 0], shinR: [.2 + .5 * Math.max(0, -s), 0, 0], armL: [0, 0, -.12], armR: [0, 0, .12], foreL: [-.3, 0, 0], foreR: [-.3, 0, 0] }, .02); }, .7),
  strafeR: cyc(p => { const s = S(p * TAU); return P({ spine: [.05, 0, -.04], legL: [-.1, 0, .12 - .3 * Math.max(0, -s)], legR: [-.1, 0, .12 + .3 * Math.max(0, s)], shinL: [.2 + .5 * Math.max(0, -s), 0, 0], shinR: [.2 + .5 * Math.max(0, s), 0, 0], armL: [0, 0, -.12], armR: [0, 0, .12], foreL: [-.3, 0, 0], foreR: [-.3, 0, 0] }, .02); }, .7),
  crouch: cyc(p => P({ spine: [.35, 0, 0], head: [-.3, 0, 0], legL: [-1.2, 0, -.1], legR: [-1.0, 0, .1], shinL: [1.9, 0, 0], shinR: [1.7, 0, 0], armL: [-.4, 0, -.1], armR: [-.4, 0, .1], foreL: [-.9, 0, 0], foreR: [-.9, 0, 0] }, .3 + S(p * TAU) * .005), 0),
  sneak: cyc(p => { const s = S(p * TAU); return P({ spine: [.4, 0, 0], head: [-.35, 0, 0], legL: [-1.0 - .35 * s, 0, 0], legR: [-1.0 + .35 * s, 0, 0], shinL: [1.6 + .3 * Math.max(0, S(p * TAU + 1.2)), 0, 0], shinR: [1.6 + .3 * Math.max(0, -S(p * TAU + 1.2)), 0, 0], armL: [-.3 + .2 * s, 0, -.1], armR: [-.3 - .2 * s, 0, .1], foreL: [-1, 0, 0], foreR: [-1, 0, 0] }, .26); }, .7),
  aim: cyc(() => P({ spine: [.05, .25, 0], head: [0, -.2, 0], armR: [-1.45, -.15, .1], foreR: [-.15, 0, 0], armL: [-1.35, .55, -.1], foreL: [-.55, 0, 0] }), 0),
  jump: cyc(() => P({ spine: [-.05, 0, 0], legL: [-.9, 0, 0], shinL: [1.3, 0, 0], legR: [.1, 0, 0], shinR: [.4, 0, 0], armL: [-2.5, 0, -.3], armR: [-2.5, 0, .3], foreL: [-.2, 0, 0], foreR: [-.2, 0, 0] }), 0),
  fall: cyc(p => P({ spine: [.1, 0, 0], legL: [-.4, 0, -.15], legR: [-.1, 0, .15], shinL: [.7, 0, 0], shinR: [.5, 0, 0], armL: [-.4 + S(p * TAU) * .3, 0, -1.2], armR: [-.4 - S(p * TAU) * .3, 0, 1.2], foreL: [-.4, 0, 0], foreR: [-.4, 0, 0] }), 0),
  land: cyc(() => P({ spine: [.45, 0, 0], legL: [-1, 0, -.1], legR: [-1, 0, .1], shinL: [1.6, 0, 0], shinR: [1.6, 0, 0], armL: [-.6, 0, -.5], armR: [-.6, 0, .5] }, .22), 0),
  hang: cyc(p => P({ spine: [-.05, 0, 0], armL: [-3.0, 0, -.25], armR: [-3.0, 0, .25], foreL: [-.15, 0, 0], foreR: [-.15, 0, 0], legL: [-.1 + S(p * TAU) * .05, 0, 0], legR: [.05 - S(p * TAU) * .05, 0, 0], shinL: [.3, 0, 0], shinR: [.2, 0, 0] }), 0),
  shimmy: cyc(p => { const s = S(p * TAU); return P({ armL: [-3.0, 0, -.25 - .25 * Math.max(0, s)], armR: [-3.0, 0, .25 + .25 * Math.max(0, -s)], foreL: [-.2, 0, 0], foreR: [-.2, 0, 0], legL: [0, 0, -.15 * s], legR: [0, 0, -.15 * s], shinL: [.3, 0, 0], shinR: [.3, 0, 0] }); }, 1.2),
  climb: cyc(() => P({ spine: [.8, 0, 0], head: [-.4, 0, 0], armL: [-1.2, 0, -.2], armR: [-1.2, 0, .2], foreL: [-1.6, 0, 0], foreR: [-1.6, 0, 0], legL: [-1.5, 0, 0], shinL: [2, 0, 0], legR: [-.2, 0, 0], shinR: [.6, 0, 0] }), 0),
  swing: cyc(p => P({ armL: [-3.0, 0, -.1], armR: [-3.0, 0, .1], foreL: [0, 0, 0], foreR: [0, 0, 0], legL: [-.5 + S(p * TAU) * .2, 0, 0], legR: [-.3 + S(p * TAU) * .2, 0, 0], shinL: [.6, 0, 0], shinR: [.4, 0, 0] }), 0),
  cover: cyc(p => P({ spine: [.3, 0, -.12], head: [-.2, .4, 0], legL: [-1.1, 0, -.15], legR: [-.8, 0, .15], shinL: [1.8, 0, 0], shinR: [1.5, 0, 0], armL: [-.7, 0, -.2], armR: [-1.1, -.3, .3], foreL: [-1.2, 0, 0], foreR: [-.6, 0, 0] }, .28 + S(p * TAU) * .004), 0),
  punch: cyc(() => P({ spine: [.15, -.35, 0], armR: [-1.55, -.1, .05], foreR: [-.05, 0, 0], armL: [-.6, .3, -.2], foreL: [-1.9, 0, 0], legL: [-.4, 0, 0], shinL: [.3, 0, 0], legR: [.2, 0, 0] }, .04), 0),
  takedown: cyc(() => P({ spine: [.5, 0, 0], head: [-.3, 0, 0], armL: [-1.4, .5, -.2], armR: [-1.6, -.4, .2], foreL: [-1.6, 0, 0], foreR: [-1.3, 0, 0], legL: [-.8, 0, 0], shinL: [1.0, 0, 0], legR: [.3, 0, 0], shinR: [.5, 0, 0] }, .12), 0),
  downed: cyc(p => P({ hips: [-1.35, 0, 0], spine: [.3, 0, 0], head: [.4, 0, 0], armL: [-.3, 0, -.6], armR: [-1.6 + S(p * TAU) * .1, 0, .3], foreL: [-1, 0, 0], foreR: [-.4, 0, 0], legL: [.2, 0, -.1], legR: [-.4, 0, .2], shinL: [.3, 0, 0], shinR: [.9, 0, 0] }, .78), 0),
  wave: cyc(p => P({ armR: [0, 0, 2.6], foreR: [0, 0, .5 + S(p * TAU) * .5], armL: [0, 0, -.08], foreL: [-.15, 0, 0] }), 0),
  sit: cyc(() => P({ spine: [-.05, 0, 0], legL: [-1.57, 0, -.08], legR: [-1.57, 0, .08], shinL: [1.57, 0, 0], shinR: [1.57, 0, 0], armL: [-.4, 0, -.1], armR: [-.4, 0, .1], foreL: [-.6, 0, 0], foreR: [-.6, 0, 0] }, .42), 0),
};
const TIMED = { idle: .25, aim: 0, wave: .8, hang: .35, swing: .3, cover: .2, downed: .25, fall: 2 };

// ---- smooth curves and key poses
// A curve through [when, value] points that never swings past a point (so a knee can't bend backwards
// between two keys). loop: the end joins the start (when runs 0..1). Otherwise it eases out of the first
// point and into the last.
function spline(pts, loop = false) {
  if (pts.every(q => q[1] === pts[0][1])) { const v = pts[0][1]; return () => v; }
  let P = pts.slice().sort((a, b) => a[0] - b[0]);
  if (loop) { const n = P.length; P = [[P[n - 2 < 0 ? 0 : n - 2][0] - 1, P[n - 2 < 0 ? 0 : n - 2][1]], [P[n - 1][0] - 1, P[n - 1][1]], ...P, [P[0][0] + 1, P[0][1]], [P[1 % n][0] + 1, P[1 % n][1]]]; }
  const n = P.length, T = P.map(q => q[0]), V = P.map(q => q[1]), M = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h0 = T[i] - T[i - 1], h1 = T[i + 1] - T[i]; if (h0 <= 0 || h1 <= 0) continue;
    const d0 = (V[i] - V[i - 1]) / h0, d1 = (V[i + 1] - V[i]) / h1;
    if (d0 * d1 > 0) { const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; M[i] = (w1 + w2) / (w1 / d0 + w2 / d1); }
  }
  return x => {
    if (loop) x -= Math.floor(x);
    if (x <= T[0]) return V[0]; if (x >= T[n - 1]) return V[n - 1];
    let i = 0; while (T[i + 1] < x) i++;
    const h = T[i + 1] - T[i], t = (x - T[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * V[i] + (t3 - 2 * t2 + t) * h * M[i] + (-2 * t3 + 3 * t2) * V[i + 1] + (t3 - t2) * h * M[i + 1];
  };
}
/**
 * A pose that moves through key poses, for rig.add(): keys([[0, { spine: [.2, 0, 0] }], [.4, { spine: [.6, 0, 0],
 * armL: [-1, 0, 0], drop: .1 }], [1, { ... }]]). Each key is [when (0..1), { joint: [x, y, z], drop, shift }]; a key
 * names only what changes (a joint it leaves out stays where the key before left it). Joints glide through
 * the keys on smooth curves that never overshoot. loop: true joins the end to the start (a cycle).
 *   rig.add('vault', keys([...]), { time: 1.2, once: true }); rig.play('vault');   // by the clock, then holds
 *   rig.add('climb', keys([...], { loop: true })); rig.play('climb', { at: rungs % 1 });   // driven by the game
 */
export function keys(list, { loop = false } = {}) {
  const Z = [0, 0, 0], K = [], held = {}; let drop = 0, shift = Z;
  for (const [t, p] of list.slice().sort((a, b) => a[0] - b[0])) {
    const src = p.j || p; for (const k in src) if (k !== 'drop' && k !== 'shift' && k !== 'j') held[k] = src[k];
    if (p.drop != null) drop = p.drop; if (p.shift) shift = p.shift;
    K.push({ t, j: { ...held }, drop, shift });
  }
  const names = Object.keys(held), ch = names.map(n => [0, 1, 2].map(i => spline(K.map(k => [k.t, (k.j[n] || Z)[i]]), loop)));
  const dr = spline(K.map(k => [k.t, k.drop]), loop), moved = K.some(k => k.shift !== Z), sh = moved ? [0, 1, 2].map(i => spline(K.map(k => [k.t, k.shift[i]]), loop)) : null;
  return ph => {
    const j = {}; for (let n = 0; n < names.length; n++) j[names[n]] = [ch[n][0](ph), ch[n][1](ph), ch[n][2](ph)];
    return { j, drop: dr(ph), shift: sh ? [sh[0](ph), sh[1](ph), sh[2](ph)] : undefined };
  };
}
const table = (f, n = 72) => { const T = new Float32Array(n + 1); for (let i = 0; i <= n; i++) T[i] = f(i / n); return p => { const x = (p - Math.floor(p)) * n, i = x | 0; return T[i] + (T[i + 1] - T[i]) * (x - i); }; };

// ---- lifelike gaits: how a person really walks and runs, from a few numbers
// A gait is drawn by where the feet go, and the legs are bent to put them there (so a planted foot
// never slides): one leg's cycle starts as its heel strikes the ground `reach` metres ahead of the hips (0),
// the ground carries the foot back under the body for the `stance` share of the cycle (`stride` metres
// to a whole cycle), it pushes off from the toes and swings forward, lifted `lift`, to strike again (1).
// The other leg is half a cycle behind. foot: the way the foot points through the cycle (0 flat, positive
// toes down): it lands on the heel, lies flat, rolls onto the ball. The pelvis turns with the leading leg
// (yaw) and dips on the swinging side (list), the shoulders turn the other way (twist), the arms swing
// against the legs, and the body rises and falls twice a stride (drop, bob, bobAt). In a run the knee
// drives the foot through high (carry, carryAt) and the legs fling less far out behind and in front (trail, pull).
const LEG = [.435, .435, .955, .085, .06, .13, .094];   // thigh, shin, the hip joint's height, the ankle's, heel and ball from the ankle, the hip joint out from the middle
function gait(g) {
  const { stride, stance, reach, lift = .1, liftAt = .5, carry = 0, carryAt = .72, pull = 1, trail = 1, yaw = 0, list = 0, lean = 0, twist = 1, arm = 0, armMid = 0, elbow = .3, elbowSwing = 0, armIn = 0, armOut = 0, drop = 0, bob = 0, bobAt = 0, side = 0, nod = 0, crouch = 0, head = .7, wrist = .7 } = g;
  const [L1, L2, HJ, AH, HEEL, BALL, HX] = LEG, footW = spline(g.foot, true);
  // the ankle of a foot whose heel would lie at heelZ, pointing th: it stands on its heel (toes up) or on the ball of the foot (heel up)
  const plant = (heelZ, th) => th <= 0 ? [heelZ + HEEL * Math.cos(th) + AH * Math.sin(th), AH * Math.cos(th) - HEEL * Math.sin(th)] : [heelZ + HEEL + BALL - BALL * Math.cos(th) + AH * Math.sin(th), AH * Math.cos(th) + BALL * Math.sin(th)];
  const off = plant(reach - stride * stance, footW(stance)), on = plant(reach, footW(0)), m = -stride * (1 - stance);
  const ankle = ph => {
    ph -= Math.floor(ph);
    if (ph < stance) return plant(reach - stride * ph, footW(ph));
    const u = (ph - stance) / (1 - stance), u2 = u * u, u3 = u2 * u, e = u2 * (3 - 2 * u), c0 = 2 * carryAt - 1, kd = carry && u > c0 ? S(Math.PI * (u - c0) / (1 - c0)) : 0;
    // (the lift peaks liftAt of the way through the swing; a runner's foot then comes through high under a driven knee,
    // carry; it leaves the ground and reaches it again moving back with it, or a share of that, trail and pull: less
    // of a leg flung out behind and of a reach out in front)
    return [(2 * u3 - 3 * u2 + 1) * off[0] + (u3 - 2 * u2 + u) * m * trail + (3 * u2 - 2 * u3) * on[0] + (u3 - u2) * m * pull, off[1] + (on[1] - off[1]) * e + lift * S(Math.PI * Math.pow(u, Math.log(.5) / Math.log(liftAt))) + carry * kd * kd];
  };
  // the leg bent to reach it: the thigh's and the knee's angles through the cycle, worked out once
  const leg = k => table(p => {
    const a = p * TAU, [z, y] = ankle(p), hipY = HJ - (drop + bob * Math.cos(2 * a - bobAt)) * 1.8 + HX * list * S(a + .6), hipZ = HX * yaw * Math.cos(a);
    const dz = z - hipZ, dy = hipY - y, d = Math.min(L1 + L2 - .003, Math.hypot(dz, dy)), al = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)), kn = Math.PI - Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
    return k ? kn : -(Math.atan2(dz, dy) + al);
  });
  const thigh = leg(0), knee = leg(1), foot = table(footW);
  // the toes lie flat while the heel comes up off them, and straighten once the foot is in the air
  const toe = table(p => Math.min(1.1, Math.max(0, footW(p))) * (p < stance ? 1 : 1 - sstep(0, .3, (p - stance) / (1 - stance))));
  return p => {
    const a = p * TAU, c = Math.cos(a), hy = -yaw * c, hz = list * S(a + .6), pr = p + .5;
    const tl = thigh(p), tr = thigh(pr), kl = knee(p), kr = knee(pr), sw = Math.cos(a + .25);   // the arms trail the legs a touch
    return { j: {
      hips: [crouch, hy, hz],
      spine: [lean, -hy * (1 + twist), -hz * .8],
      head: [-(lean + crouch) * head + nod * S(a * 2), hy * twist * .8, -hz * .2],
      legL: [tl - crouch, -hy, -hz], shinL: [kl, 0, 0], footL: [Math.max(-.7, Math.min(1.2, foot(p) - tl - kl)), 0, 0], toeL: [-toe(p), 0, 0],
      legR: [tr - crouch, -hy, -hz], shinR: [kr, 0, 0], footR: [Math.max(-.7, Math.min(1.2, foot(pr) - tr - kr)), 0, 0], toeR: [-toe(pr), 0, 0],
      armL: [armMid + arm * sw, -armIn, armOut], foreL: [-(elbow - elbowSwing * sw), -wrist * .5, 0], handL: [-.12, -wrist * .5, 0],
      armR: [armMid - arm * sw, armIn, -armOut], foreR: [-(elbow + elbowSwing * sw), wrist * .5, 0], handR: [-.12, wrist * .5, 0],
    }, drop: drop + bob * Math.cos(2 * a - bobAt), shift: side ? [side * S(a + .6), 0, 0] : undefined };
  };
}
// standing easy: breathing, the weight on one leg and then the other, a look about
const idleLife = p => {
  const a = p * TAU, br = S(a * 3), w = S(a), look = S(a + 1.1) * .5 + S(a * 2 + .4) * .5;
  return { j: {
    hips: [0, .04 * w, .035 * w], spine: [.03 + .012 * br, -.03 * w, -.03 * w], head: [-.02 - .008 * br, .16 * look, -.01 * w],
    // (the toes a little out; the arms hang a little out from the shoulders, so the hands lie beside the thighs and not in them)
    legL: [-.03 - .04 * Math.max(0, -w), .1, -.035 * w + .03], shinL: [.06 + .16 * Math.max(0, -w), 0, 0], footL: [-.03 - .12 * Math.max(0, -w), 0, 0],
    legR: [-.03 - .04 * Math.max(0, w), -.1, -.035 * w - .03], shinR: [.06 + .16 * Math.max(0, w), 0, 0], footR: [-.03 - .12 * Math.max(0, w), 0, 0],
    armL: [.03 + .01 * br, 0, .065], armR: [.03 + .01 * br, 0, -.065], foreL: [-.24, -.35, 0], foreR: [-.24, .35, 0], handL: [-.15, -.35, 0], handR: [-.15, .35, 0],
  }, drop: .004 + .003 * Math.abs(w), shift: [.022 * w, 0, 0] };
};
/**
 * Lifelike motion for a figure with feet and hands (gs.models.human people move with it): idle, walk, jog,
 * run, sprint and sneak with a turning pelvis, shoulders that counter it, arms that swing from the
 * shoulder and feet that land on the heel and push off from the toes. For your own rig:
 * new Rig(parts, { poses: LIFELIKE, weight: 1 }). Speeds they suit (m/s): walk 1.4, jog 3.4, run 5.6, sprint 7.5,
 * sneak 1: rig.blend({ idle: 0, walk: 1.4, jog: 3.4, run: 5.6 }, speed) moves between them in step.
 */
const gaitOf = g => ({ ...cyc(gait(g), 1 / g.stride), stance: g.stance, ground: true });   // (ground: the feet stand on the ground, so they can be kept where they are put down: stride.js)
export const LIFELIKE = {
  idle: { cycle: idleLife, rate: 0, time: 9, ground: true },
  walk: gaitOf({ stride: 1.36, stance: .62, reach: .3, lift: .075, liftAt: .4,
    foot: [[0, -.3], [.1, 0], [.42, 0], [.52, .3], [.62, .8], [.72, .5], [.84, -.05], [.94, -.3]],
    yaw: .075, list: .05, lean: .045, twist: 1, arm: .36, armMid: .02, elbow: .26, elbowSwing: .13, armOut: .045, drop: .015, bob: .012, bobAt: 0, side: .02, nod: .01 }),
  jog: gaitOf({ stride: 2.35, stance: .36, reach: .2, lift: .15, liftAt: .35, carry: .03, pull: .6, trail: .6,
    foot: [[0, -.1], [.07, .03], [.23, .05], [.36, .95], [.48, 1], [.7, .4], [.9, -.08]],
    yaw: .1, list: .05, lean: .17, twist: 1.15, arm: .42, armMid: .16, elbow: 1.5, elbowSwing: .25, armIn: .1, armOut: .1, drop: .04, bob: .018, bobAt: 2.3, nod: .012 }),
  // (a runner's foot is on the ground for under a metre: a longer reach than the leg has is a leg flung out straight)
  run: gaitOf({ stride: 3.4, stance: .25, reach: .19, lift: .28, liftAt: .3, carry: .06, pull: .5, trail: .45,
    foot: [[0, 0], [.05, .05], [.16, .1], [.25, 1], [.36, 1.2], [.65, .45], [.9, 0]],
    yaw: .13, list: .055, lean: .24, twist: 1.2, arm: .55, armMid: .25, elbow: 1.65, elbowSwing: .3, armIn: .12, armOut: .12, drop: .03, bob: .02, bobAt: 1.9, nod: .015 }),
  sprint: gaitOf({ stride: 4.3, stance: .21, reach: .2, lift: .34, liftAt: .28, carry: .1, pull: .45, trail: .45,
    foot: [[0, .15], [.05, .15], [.14, .2], [.21, 1.05], [.36, 1.2], [.65, .5], [.9, .15]],
    yaw: .15, list: .06, lean: .36, twist: 1.25, arm: .8, armMid: .2, elbow: 1.7, elbowSwing: .35, armIn: .12, armOut: .13, drop: .034, bob: .022, bobAt: 1.8, nod: .016 }),
  sneak: gaitOf({ stride: 1.0, stance: .66, reach: .26, lift: .09, liftAt: .45,
    foot: [[0, .05], [.1, 0], [.5, 0], [.58, .35], [.66, .7], [.78, .4], [.9, .12]],
    yaw: .06, list: .04, lean: .34, crouch: .1, twist: .8, arm: .16, armMid: -.25, elbow: 1.0, elbowSwing: .08, armOut: .08, drop: .17, bob: .006, bobAt: 0, side: .02, head: .8 }),
};

// how much of a pose stands on the ground (for the feet that keep their place: stride.js), added up over the layers and a blend
const GROUND = { g: 0, gw: 0, st: 0, len: 0, ph: 0, best: 0 };
const grounded = (d, w, phase) => { if (!d?.ground || w <= 0) return; const G = GROUND; G.g += w; if (d.rate) { G.gw += w; G.st += w * (d.stance ?? .6); G.len += w / d.rate; if (w > G.best) { G.best = w; G.ph = phase; } } };
/**
 * Joints hooked up to a character. parts: { hips, spine, head, armL, foreL, armR, foreR, legL, shinL,
 * legR, shinR } (any can be left out). fade: seconds to blend to a new pose. height: of the figure,
 * for how far the hips drop when crouching. joints: the names the poses turn, for a skeleton with other
 * joints than a person's (a creature's wings, tail and four legs: gs.models.creature). A pose may also say
 * how fast it runs when it doesn't follow the ground: { cycle, rate: 0, per: cycles a second }.
 * body: the object the game moves and turns (the character itself). With it, steps are really taken: in poses
 * that stand on the ground (the lifelike walks and runs and standing easy; your own with rig.add(name, fn,
 * { ground: true })) a foot stays where it was put down while the body goes on over it, footfalls follow the
 * way the body really goes, and a person turned or shifted while standing steps round to stand under himself
 * again (stride.js). rig.steps = false turns that off; rig.stride.feet[0 | 1].landed is true on the update a
 * foot touches down (left, right).
 * momentum: true: a new move begins at once and takes up what the body was doing, where other rigs cross-fade
 * (carried(), below). follow: true (with body): what the body carries goes on a moment and settles when the
 * game starts, stops, turns or drops it (follow.js); rig.follow.amount = 0 turns that off.
 */
export class Rig {
  constructor(parts, { fade = .18, height = 1.8, poses = {}, weight = 0, size = 1, full = false, joints = full ? FULL : JOINTS, body = null, momentum = false, follow = false } = {}) {
    this.parts = parts; this.fade = fade; this.height = height; this.poses = { ...POSES, ...poses }; this.weight = weight; this.size = size; this.done = false;
    this.base = new Map(); for (const k of joints) if (parts[k]) this.base.set(k, [parts[k].rotation.x, parts[k].rotation.y, parts[k].rotation.z]);
    // a full skeleton: the joints in between, which fill() works out (the waist under the rib cage, the neck under the head, each a
    // share of the bend and of the twist; a collar bone to each arm; the turn along each forearm)
    if (full) {
      const chain = (lo, up, sw, tw) => parts[lo] && parts[up]?.parent === parts[lo] ? { lo: parts[lo], up: parts[up], sw, tw, c: new Vector3(...(parts[up].userData.pivot || Z3)), at: parts[up].position.clone() } : null;
      this.chains = [chain('waist', 'spine', .5, .25), chain('neck', 'head', .5, .45)].filter(Boolean);
      this.girdle = [['L', 1], ['R', -1]].map(([sd, s]) => parts['collar' + sd] && parts['arm' + sd]?.parent === parts['collar' + sd] ? { c: parts['collar' + sd], a: parts['arm' + sd], s, name: 'collar' + sd } : null).filter(Boolean);
      this.rolls = ['L', 'R'].map(sd => parts['twist' + sd] && parts['hand' + sd] ? { t: parts['twist' + sd], h: parts['hand' + sd] } : null).filter(Boolean);
      this.still = new Set(); this.fine = true;   // (fine = false: seen from further off, where the turn of a forearm and the toes show nothing and are left alone)
    }
    this.hip0 = parts.hips ? parts.hips.position.y : 0; this.hipX = parts.hips ? parts.hips.position.x : 0; this.hipZ = parts.hips ? parts.hips.position.z : 0;
    this.layers = [{ name: 'idle', w: 1, phase: 0 }]; this.top = null; this.topW = 0; this.phase = 0; this.state = 'idle'; this.cur = {};
    this.stride = body ? new Stride(this, body) : null; this.steps = true;
    this.momentum = momentum; this.mom = null; this.cutT = null;
    this.follow = body && follow ? new Follow(this, body) : null;
  }
  /**
   * Blends to a pose by name. at: where in the pose (0..1) it stands, for a pose the game drives itself
   * (a climb in step with the rungs, an action in step with a cutscene): call each frame with the new
   * value. from: where it starts (a crowd out of step). again: true starts a pose over that is already playing.
   */
  play(name, { fade = this.fade, at = null, from = null, again = false } = {}) {
    const blending = this.blendOn; this.blendOn = false;
    const top = this.layers[this.layers.length - 1];
    if (name === this.state && !again) { if (at != null) { top.phase = at; top.pin = true; } return this; }
    this.state = name; this.fadeT = fade; this.done = false;
    // (a move begun with no fade is a cut: nothing is carried over it, whatever is asked for before the next update; out of a blend of walks it takes the rig's own fade at least, as it always did)
    if (this.momentum) this.cutT = this.cutT === 0 || !(fade > 0) ? 0 : blending ? Math.max(fade, this.fade) : fade;
    this.layers.push({ name, w: 0, phase: at ?? from ?? (this.poses[name]?.once || again ? 0 : this.phase), pin: at != null });
    return this;
  }
  /** How a pose moves on: { rate: cycles a metre (walks and runs; 0 for the rest), per: cycles a second (0: it stands still), once }. null: no such pose. */
  pace(name) { const d = this.poses[name]; return d ? { rate: d.rate || 0, per: d.rate ? 0 : d.time ? 1 / d.time : d.per ?? TIMED[name] ?? .2, once: !!d.once } : null; }
  /** An upper-body pose over the legs (aim, wave, punch), or null to let go. */
  upper(name) { if (name) this.top = name; this.topOn = !!name; return this; }
  /**
   * Adds your own pose: rig.add('dance', p => ({ j: { armL: [...] }, drop: 0 }), cyclesPerMetre). For a
   * pose that runs by the clock give { time: seconds, once: true } instead of a rate: once plays it
   * through and holds its end (rig.done turns true), without it the pose repeats. keys() makes the function
   * from key poses. ground: true for a pose that stands on its feet on the ground (they are then kept where
   * they are put down); a walk of your own also says the share of a stride a foot is down, stance: .6.
   */
  add(name, fn, rate = 0) {
    const d = this.poses[name] = cyc(typeof fn === 'function' ? fn : () => fn, typeof rate === 'number' ? rate : rate.rate || 0);
    if (typeof rate === 'object') { d.time = rate.time; d.once = !!rate.once; if (rate.ground) { d.ground = true; d.stance = rate.stance; } }
    return this;
  }
  /** A 1D blend space: { pose: value }; mixes the two poses either side of v (speed, say), in step. Call each frame. */
  blend(space, v) {
    let e = SPACES.get(space); if (!e) SPACES.set(space, e = Object.entries(space).sort((a, b) => a[1] - b[1]));   // (sorted once a space: this runs every frame for every figure)
    const w = this.bw = {};
    if (!e.length) return this;
    if (v <= e[0][1]) w[e[0][0]] = 1; else if (v >= e[e.length - 1][1]) w[e[e.length - 1][0]] = 1;
    else for (let i = 0; i < e.length - 1; i++) if (v >= e[i][1] && v <= e[i + 1][1]) { const t = (v - e[i][1]) / Math.max(1e-6, e[i + 1][1] - e[i][1]); w[e[i][0]] = 1 - t; w[e[i + 1][0]] = (w[e[i + 1][0]] || 0) + t; break; }
    return this.startBlend();
  }
  /** A 2D blend space: { pose: [x, y] }; mixes the poses nearest (x, y) (move direction: strafe, back...). */
  blend2(space, x, y) {
    const w = this.bw = {}; let sum = 0;
    for (const [n, [px, py]] of Object.entries(space)) {
      const d2 = (x - px) ** 2 + (y - py) ** 2; if (d2 < 1e-6) { for (const k in w) delete w[k]; w[n] = 1; sum = 1; break; }
      sum += w[n] = 1 / (d2 * d2);
    }
    for (const k in w) w[k] /= sum;
    return this.startBlend();
  }
  startBlend() {
    if (!this.blendOn) { this.blendOn = true; this.blendPhase ??= this.phase; this.blendClock ??= this.phase; if (this.momentum) this.cutT = this.cutT === 0 ? 0 : this.fade; }
    this.state = 'blend'; return this;
  }
  /**
   * Something that hangs from the body and swings as it moves (a pack, a bag at the hip, a slung rifle): thing is
   * an Object3D on one of the joints. { pivot: the point it hangs from in its parent's space, swing: radians for
   * each metre a second a second (.02 a bag on a strap, .004 a pack), bounce: metres up and down, stiff, damp,
   * most, away: [x, y, z] the way out from the body there, apply: false to only work it out }. Returns
   * { x, z, y }: the swing about its pivot now (radians forward-and-back and side to side, metres up and down).
   */
  hang(thing, o) { return (this.follow ||= new Follow(this, null)).hang(thing, o); }
  /**
   * Feet on the ground (foot IK), after update(): ground(x, z) is the floor height there; body the
   * character (its y is where flat ground is). The hips drop for the lower foot and the other knee bends.
   */
  plant(ground, body, { most = .45 } = {}) {
    const P = this.parts; if (!P.hips || !P.legL || !P.shinL || !P.legR || !P.shinR) return this;
    body.updateMatrixWorld(true);
    const legs = [[P.legL, P.shinL, this.feet?.[0]], [P.legR, P.shinR, this.feet?.[1]]];
    const tip = (shin, end) => end ? end.getWorldPosition(new Vector3()) : shin.localToWorld(new Vector3(0, -(shin.userData.ikLength ?? .43), 0));
    const base = body.getWorldPosition(new Vector3()).y, sc = body.getWorldScale(new Vector3()).y;
    const off = legs.map(([, s, e]) => { const t = tip(s, e); return Math.max(-most * sc, Math.min(most * sc, (ground(t.x, t.z) ?? base) - base)); });
    const drop = Math.max(0, -Math.min(off[0], off[1]));
    this.plantDrop = (this.plantDrop ?? drop) + (drop - (this.plantDrop ?? drop)) * Math.min(1, (this.lastDt || .016) * 14);
    const ps = P.hips.parent.getWorldScale(new Vector3()).y || 1;
    P.hips.position.y -= this.plantDrop / ps; P.hips.updateMatrixWorld(true);
    const fwd = new Vector3(0, 0, 1).transformDirection(body.matrixWorld);
    legs.forEach(([l, s, e], i) => {
      const t = tip(s, e).add(new Vector3(0, off[i] + this.plantDrop, 0)), knee = s.getWorldPosition(new Vector3()).addScaledVector(fwd, 1);
      reach(l, s, t, { pole: knee, end: e, length: e ? undefined : s.userData.ikLength ?? .43 });
    });
    return this;
  }
  sample(name, phase) { const def = this.poses[name]; if (!def) return { j: {}, drop: 0 }; return def.cycle(phase); }
  /** speed: metres a second (the walk and run cycles follow it); aim: up/down aim (radians) for the upper layer. */
  update(dt, { speed = 0, aim = 0, turn = 0 } = {}) {
    this.lastDt = dt;
    // a blend space: its walks and runs share one phase. The stride of a mix is the mix of the strides, and a pose that
    // stands still has none: mixed with standing, a walk takes shorter steps at its own beat (its feet slid when it
    // took longer ones more slowly, as the mix of the rates had it). Poses that go by the clock keep their own time
    // in the mix (blendClock), so standing easy does not hurry a walk along, nor a walk it.
    const inst = this.momentum;   // with momentum a new move begins at once, and what the body was doing is carried over into it (carried(), below)
    this.blendK = inst ? (this.blendOn ? 1 : 0) : Math.max(0, Math.min(1, (this.blendK || 0) + (this.blendOn ? 1 : -1) * dt / Math.max(.01, this.fade)));
    if (this.blendK > 0 && this.bw) {
      let len = 0, timed = 0, tw = 0;
      for (const n in this.bw) { const def = this.poses[n], w = this.bw[n]; if (!def) continue; if (def.rate) len += w / def.rate; else { timed += (def.time ? 1 / def.time : def.per ?? TIMED[n] ?? .2) * w; tw += w; } }
      const beat = len > 0 ? Math.max(-2.6, Math.min(2.6, speed / (len * this.size))) : 0;   // (strides a second: never faster than legs go)
      this.blendClock = ((this.blendClock ?? this.blendPhase ?? 0) + (tw > 0 ? timed / tw : 0) * dt) % 1;
      this.blendPhase = len > 0 ? ((((this.blendPhase ?? 0) + beat * dt) % 1) + 1) % 1 : this.blendClock;
    } else if (!this.blendOn) this.blendPhase = this.blendClock = null;
    // advance phases: cycles by distance, still poses by time
    for (const l of this.layers) {
      const def = this.poses[l.name]; if (!def || l.pin) continue;
      const step = def.rate ? speed * def.rate / this.size * dt : def.time ? dt / def.time : (def.per ?? TIMED[l.name] ?? .2) * dt;
      l.phase = def.once ? Math.min(1, l.phase + step) : (l.phase + step) % 1;
    }
    const k = !inst && this.fadeT > 0 ? Math.min(1, dt / this.fadeT) : 1;
    const last = this.layers[this.layers.length - 1]; last.w = Math.min(1, last.w + k);
    this.done = !!this.poses[last.name]?.once && last.phase >= 1;
    let rest = 1 - last.w; for (let i = this.layers.length - 2; i >= 0; i--) { this.layers[i].w = Math.min(this.layers[i].w, rest); rest -= this.layers[i].w; }
    this.layers = this.layers.filter((l, i) => l.w > .001 || i === this.layers.length - 1);
    this.topW += ((this.topOn ? 1 : 0) - this.topW) * Math.min(1, dt / Math.max(.01, this.fade));
    // mix the layers
    const out = {}, shift = [0, 0, 0]; let drop = 0;
    for (const l of this.layers) {
      const s = this.sample(l.name, l.phase); drop += (s.drop || 0) * l.w;
      if (s.shift) { shift[0] += s.shift[0] * l.w; shift[1] += s.shift[1] * l.w; shift[2] += s.shift[2] * l.w; }
      for (const j in s.j) { const a = s.j[j], o = out[j] ||= [0, 0, 0]; o[0] += a[0] * l.w; o[1] += a[1] * l.w; o[2] += a[2] * l.w; }
    }
    if (this.blendK > 0 && this.bw) {   // over the layers, the blend space by how far it has faded in
      const k2 = this.blendK, mixd = {}; let bd = 0;
      const bs = [0, 0, 0];
      for (const n in this.bw) {
        const w = this.bw[n], s = this.sample(n, (this.poses[n]?.rate ? this.blendPhase : this.blendClock) ?? 0); bd += (s.drop || 0) * w;
        if (s.shift) { bs[0] += s.shift[0] * w; bs[1] += s.shift[1] * w; bs[2] += s.shift[2] * w; }
        for (const j in s.j) { const a = s.j[j], o = mixd[j] ||= [0, 0, 0]; o[0] += a[0] * w; o[1] += a[1] * w; o[2] += a[2] * w; }
      }
      for (const j of this.base.keys()) { const a = mixd[j]; if (!a && !out[j]) continue; const o = out[j] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] += ((a ? a[i] : 0) - o[i]) * k2; }
      drop += (bd - drop) * k2; for (let i = 0; i < 3; i++) shift[i] += (bs[i] - shift[i]) * k2;
      if (this.blendOn && k2 >= 1) {   // the layers underneath: just its strongest pose, in step with it (what a later play() fades from)
        let top = 'idle', tw = -1; for (const n in this.bw) if (this.bw[n] > tw) { tw = this.bw[n]; top = n; }
        const l = this.layers[0], ph = (this.poses[top]?.rate ? this.blendPhase : this.blendClock) ?? 0; if (this.layers.length !== 1 || l.name !== top) this.layers = [{ name: top, w: 1, phase: ph }]; else l.phase = ph;
      }
    }
    if (inst) drop = this.carried(dt, out, drop, shift); else this.cutT = null;
    if (this.top && this.topW > .001) {
      const s = this.sample(this.top, this.phase), tw = inst ? this.topW * this.topW * (3 - 2 * this.topW) : this.topW;   // (with momentum it comes in and goes out gently; topW itself still counts evenly, for a game that reads it)
      for (const j of UPPER) { const a = s.j[j] || [0, 0, 0], o = out[j] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] += (a[i] - o[i]) * tw; }
      if (this.top === 'aim') { (out.armR ||= [0, 0, 0])[0] -= aim * tw; (out.armL ||= [0, 0, 0])[0] -= aim * tw; (out.head ||= [0, 0, 0])[0] -= aim * .5 * tw; }
      if (!this.topOn && this.topW < .01) this.top = null;
    }
    if (this.weight) this.sway(dt, speed, turn, out);
    else if (turn) (out.spine ||= [0, 0, 0])[2] -= turn * .1;
    if (this.follow?.body) { if (this.near === false) this.follow.on = false; else this.follow.pose(dt, out); }   // follow-through: what the body carries goes on a moment and settles
    this.phase = last.phase;
    if (!this.chains) for (const [j, b] of this.base) { const a = out[j] || Z3, p = this.parts[j]; p.rotation.set(b[0] + a[0], b[1] + a[1], b[2] + a[2]); }
    else for (const [j, b] of this.base) {   // (a full skeleton: fill() sets the joints in between, and toes at rest are left there)
      if (FILLED.has(j) || !this.fine && TOES.has(j)) continue; const a = out[j];
      if (!a && TOES.has(j)) { if (this.still.has(j)) continue; this.still.add(j); } else if (a) this.still.delete(j);
      const p = this.parts[j]; if (a) p.rotation.set(b[0] + a[0], b[1] + a[1], b[2] + a[2]); else p.rotation.set(b[0], b[1], b[2]);
    }
    if (this.parts.hips) { const k = this.height / 1.8; this.parts.hips.position.set(this.hipX + shift[0] * k, this.hip0 - drop * this.height + shift[1] * k, this.hipZ + shift[2] * k); }
    this.cur = out; if (this.chains) this.fill(out);
    if (this.stride) {   // steps that are really taken: how much of the pose stands on the ground, how much of it walks, and where in its stride it is
      if (!this.steps || this.near === false) this.stride.off();
      else {
        const k2 = this.blendK > 0 && this.bw ? this.blendK : 0, G = GROUND; G.g = G.gw = G.st = G.len = G.ph = G.best = 0;
        for (const l of this.layers) if (!l.pin) grounded(this.poses[l.name], l.w * (1 - k2), l.phase);
        if (k2) for (const n in this.bw) grounded(this.poses[n], this.bw[n] * k2, this.blendPhase ?? 0);
        this.stride.apply(dt, speed, G.g, G.gw, G.gw ? G.st / G.gw : 1, G.ph, G.len > 0 ? Math.min(2.6, Math.abs(speed) / (G.len * this.size)) : 0);
      }
    }
    if (this.follow?.things.length) { if (this.fine === false) this.follow.still(); else this.follow.swing(dt); }   // (what hangs swings close up only)
    if (this.face && this.fine !== false) this.face.step(dt, true);   // a live face (gs.models.human's): blinks, eyes, brows and mouth, close up only
    if (this.hands && this.fine !== false) this.hands.step(dt, speed);   // hands that hold (gs.models.human's): fingers round what they hold, relaxed otherwise, close up only
    return this;
  }
  // Momentum between moves. A new move begins at once, and what the body was doing is carried over into it: how far each
  // joint was from where the new move has it, and how fast it was turning, die away smoothly (in about the fade asked
  // for; three springs in a row, so neither the speed nor the push changes at a stroke). So a move starts with the
  // speed the body had, a limb in mid swing swings on a little and comes back, and a person is never half in one
  // pose and half in another, as a cross-fade has them.
  carried(dt, out, drop, shift) {
    let M = this.mom;
    if (!M) {
      const names = [...this.base.keys()], N = names.length * 3 + 4, F = () => new Float32Array(N);
      M = this.mom = { names, N, raw: F(), was: F(), x: F(), v: F(), a: F(), prev: F(), vel: F(), has: false, live: false, fix: false, y: 30, hinges: HINGES.map(([j, sg]) => [j, sg, names.indexOf(j) * 3]).filter(h => h[2] >= 0) };
    }
    const { names, N, raw, was, x, v, a, prev, vel } = M, e = N - 4;
    for (let i = 0, o = 0; o < e; i++, o += 3) { const r = out[names[i]]; if (r) { raw[o] = r[0]; raw[o + 1] = r[1]; raw[o + 2] = r[2]; } else raw[o] = raw[o + 1] = raw[o + 2] = 0; }
    raw[e] = drop; raw[e + 1] = shift[0]; raw[e + 2] = shift[1]; raw[e + 3] = shift[2];
    if (this.cutT != null) {
      const T = this.cutT; this.cutT = null;
      if (!M.has || !(T > 0)) { x.fill(0); v.fill(0); a.fill(0); M.live = M.fix = false; if (!(T > 0)) M.has = false; }   // (no fade: a cut, and nothing of before it is remembered)
      else { for (let i = 0; i < N; i++) { x[i] = prev[i] + vel[i] * dt - raw[i]; v[i] = vel[i]; a[i] = 0; } was.set(raw); M.y = 4.5 / T; M.live = M.fix = true; }
    } else if (M.live && dt > 0) {
      if (M.fix) {   // the new move's own speed, known one update on: what is carried is the body's speed less that
        for (let i = 0; i < N; i++) { const lim = i < e ? 10 : 3; v[i] = Math.max(-lim, Math.min(lim, v[i] - (raw[i] - was[i]) / dt)); }
        M.fix = false;
      }
      const y = M.y, E = Math.exp(-y * dt), y2 = y * y; let most = 0;
      for (let i = 0; i < N; i++) {
        const x0 = x[i], c1 = v[i] + y * x0, c2 = (a[i] + 2 * y * v[i] + y2 * x0) / 2, p = x0 + c1 * dt + c2 * dt * dt, dp = c1 + 2 * c2 * dt;
        x[i] = p * E; v[i] = (dp - y * p) * E; a[i] = (2 * c2 - 2 * y * dp + y2 * p) * E;
        if (i >= e && x[i] * x0 < 0) x[i] = v[i] = a[i] = 0;   // (the hips come to their new height and stop there: they do not dip through the floor and come back)
        const m = Math.abs(x[i]) + Math.abs(v[i]) * .05; if (m > most) most = m;
      }
      if (most < 2e-4) { x.fill(0); v.fill(0); a.fill(0); M.live = false; }
    }
    if (M.live) {
      for (let i = 0, o = 0; o < e; i++, o += 3) { if (!x[o] && !x[o + 1] && !x[o + 2]) continue; const r = out[names[i]] ||= [0, 0, 0]; r[0] += x[o]; r[1] += x[o + 1]; r[2] += x[o + 2]; }
      drop += x[e]; shift[0] += x[e + 1]; shift[1] += x[e + 2]; shift[2] += x[e + 3];
      // (a knee or an elbow carried past straight would bend the wrong way: it stops at straight, or where the move itself has it)
      for (const [j, sg, o] of M.hinges) { const r = out[j]; if (!r) continue; const lim = sg > 0 ? Math.min(raw[o], 0) : Math.max(raw[o], 0); if (sg > 0 ? r[0] < lim : r[0] > lim) r[0] = lim; }
    }
    if (dt > 0) {   // where each joint is now and how fast it is turning, for the next move to take up
      const live = M.live;
      if (M.has) for (let i = 0; i < N; i++) { const s = live ? raw[i] + x[i] : raw[i]; vel[i] = (s - prev[i]) / dt; prev[i] = s; }
      else { for (let i = 0; i < N; i++) prev[i] = live ? raw[i] + x[i] : raw[i]; vel.fill(0); M.has = true; }
    }
    return drop;
  }
  /**
   * A full skeleton's joints in between, brought into line with the ones poses turn: the waist takes its share
   * of the rib cage's turn (the back bends as a curve), the neck its share of the head's, each collar bone goes
   * up and forward with its arm, and the forearm's skin turns with the hand. update() does this itself; call it
   * after turning joints yourself (an arm bent to reach something), as human.hold() and touch() do. Nothing
   * that rides the old joints moves: the rib cage, the head and the arms end up turned exactly as they were.
   * pose: only when every joint has just been set straight from a pose's values ({ joint: [x, y, z] }: those), which
   * are then read as the pose meant them (the rib cage's turn on the hips, an arm's on the rib cage, a shrug for a collar bone).
   */
  fill(pose = null) {
    if (!this.chains) return this;
    const fresh = !!pose;
    for (const k of this.chains) {
      const up = k.up.quaternion, lo = k.lo.quaternion;
      if (fresh) _q.copy(up); else _q.copy(lo).multiply(up);   // the whole turn, as the pose gave it
      shareOf(_q, k.sw, k.tw, lo); up.copy(_q2.copy(lo).invert().multiply(_q));
      _v.copy(k.c).applyQuaternion(up); k.up.position.set(k.at.x + k.c.x - _v.x, k.at.y + k.c.y - _v.y, k.at.z + k.c.z - _v.z);   // (it turns about a point above its own place)
    }
    for (const g of this.girdle) {
      const a = g.a.quaternion, r = g.c.rotation, b = this.base.get(g.name) || Z3;
      if (fresh) { _q.copy(a); g.x = pose[g.name] || Z3; } else _q.copy(g.c.quaternion).multiply(a);   // the arm's turn in the rib cage's own terms (x: a shrug the pose asked for itself)
      const x = g.x || Z3;
      _v.set(0, -1, 0).applyQuaternion(_q);              // the way the upper arm points: the shoulder rises as it goes up past the level, and goes forward and back with it
      const e = Math.acos(Math.max(-1, Math.min(1, -_v.y))), lift = .42 * sstep(.5, 2.7, e), fwd = (_v.z > 0 ? .25 : .2) * _v.z;
      r.set(b[0] + x[0], b[1] + x[1] - g.s * fwd, b[2] + x[2] + g.s * lift);
      a.copy(_q2.copy(g.c.quaternion).invert().multiply(_q));
    }
    if (this.fine) for (const r of this.rolls) { const q = r.h.quaternion, s = q.w < 0 ? -1 : 1; r.t.rotation.set(0, 1.4 * Math.atan2(q.y * s, q.w * s), 0); }   // (seven tenths of the hand's turn about the forearm's length)
    return this;
  }
  // A body with weight (the weight option): it leans into a change of speed and rocks back as it stops,
  // banks into a turn, and the head stays level through it. Two springs, so it settles rather than snaps.
  sway(dt, speed, turn, out) {
    const w = this.weight, q = this.sw ||= { v: speed, lean: 0, leanV: 0, bank: 0, bankV: 0 };
    const acc = dt > 0 ? (speed - q.v) / dt : 0; q.v = speed;
    const tl = Math.max(-.3, Math.min(.3, acc * .03)) * w, tb = Math.max(-.28, Math.min(.28, -turn * .07 * Math.min(1, speed / 2.5))) * w;
    const n = Math.max(1, Math.ceil(dt / .012)), h = dt / n;
    for (let i = 0; i < n; i++) {
      q.leanV += ((tl - q.lean) * 60 - q.leanV * 9) * h; q.lean += q.leanV * h;
      q.bankV += ((tb - q.bank) * 90 - q.bankV * 13) * h; q.bank += q.bankV * h;
    }
    const hips = out.hips ||= [0, 0, 0], spine = out.spine ||= [0, 0, 0], head = out.head ||= [0, 0, 0];
    hips[0] += q.lean * .35; spine[0] += q.lean * .65; head[0] -= q.lean * .6;
    hips[2] += q.bank * .6; spine[2] += q.bank * .4; head[2] -= q.bank * .7;
    for (const [leg, sd] of [['legL', 1], ['legR', -1]]) { const l = out[leg] ||= [0, 0, 0]; l[0] -= q.lean * .35; l[2] -= q.bank * .6; }   // the feet stay where they are
    return this;
  }
}

/**
 * A ready jointed figure (about 1.8 m, feet at y = 0, facing +z) built from capsules and boxes, with
 * a .rig. Colours: body, skin, legs, shoes, hair (null for none); mat(colour) makes the materials
 * (toon() for Console, pbr() for Next Gen); scale for bigger or smaller people.
 */
export function figure({ body = '#3a6ea5', skin = '#f1c27d', legs = '#2b2b38', shoes = '#1a1a1a', hair = '#3b2a1a', mat = c => new MeshStandardMaterial({ color: c, roughness: .7 }), scale = 1, shadows = true } = {}) {
  const part = (geo, col, x = 0, y = 0, z = 0) => { const m = new Mesh(geo, mat(col)); m.position.set(x, y, z); m.castShadow = shadows; return m; };
  const joint = (x, y, z, ...kids) => { const g = new Group(); g.position.set(x, y, z); for (const k of kids) g.add(k); return g; };
  const limb = (r, l) => new CapsuleGeometry(r, l, 4, 8);
  // lower leg and foot hang from the knee; thigh from the hip
  const shin = side => joint(0, -.42, 0, part(limb(.065, .32), legs, 0, -.2, 0), part(new BoxGeometry(.12, .07, .24), shoes, 0, -.43, .05));
  const leg = side => { const s = shin(side), g = joint(side * .1, 0, 0, part(limb(.08, .3), legs, 0, -.21, 0), s); g.userData.shin = s; return g; };
  const fore = () => joint(0, -.3, 0, part(limb(.05, .22), skin, 0, -.15, 0), part(new SphereGeometry(.055, 8, 6), skin, 0, -.32, 0));
  const arm = side => { const f = fore(), g = joint(side * .22, .3, 0, part(limb(.06, .22), body, 0, -.14, 0), f); g.userData.fore = f; return g; };
  const head = joint(0, .42, 0, part(new SphereGeometry(.13, 12, 10), skin, 0, .12, 0));
  if (hair) head.add(part(new SphereGeometry(.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * .5), hair, 0, .14, -.01));
  const armL = arm(1), armR = arm(-1), legL = leg(1), legR = leg(-1);
  const spine = joint(0, .05, 0, part(limb(.17, .26), body, 0, .22, 0), head, armL, armR);
  const hips = joint(0, .97, 0, part(new BoxGeometry(.3, .16, .18), legs, 0, -.02, 0), spine, legL, legR);
  const root = new Group(); root.add(hips); root.scale.setScalar(scale);
  root.rig = new Rig({ hips, spine, head, armL, foreL: armL.userData.fore, armR, foreR: armR.userData.fore, legL, shinL: legL.userData.shin, legR, shinR: legR.userData.shin }, { height: 1.8 });
  return root;
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Rig.prototype, 'update', 'poses');
