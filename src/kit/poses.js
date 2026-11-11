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

import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { reach } from './characters.js';
export { person, Face, shapes, visemes, FACE_SHAPES } from './skin.js';

const JOINTS = ['hips', 'spine', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'];
const UPPER = new Set(['spine', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR']);
const S = Math.sin, TAU = Math.PI * 2, SPACES = new WeakMap();

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
// against the legs, and the body rises and falls twice a stride (drop, bob, bobAt).
const LEG = [.435, .435, .955, .085, .06, .13, .094];   // thigh, shin, the hip joint's height, the ankle's, heel and ball from the ankle, the hip joint out from the middle
function gait(g) {
  const { stride, stance, reach, lift = .1, liftAt = .5, yaw = 0, list = 0, lean = 0, twist = 1, arm = 0, armMid = 0, elbow = .3, elbowSwing = 0, armIn = 0, armOut = 0, drop = 0, bob = 0, bobAt = 0, side = 0, nod = 0, crouch = 0, head = .7, wrist = .7 } = g;
  const [L1, L2, HJ, AH, HEEL, BALL, HX] = LEG, footW = spline(g.foot, true);
  // the ankle of a foot whose heel would lie at heelZ, pointing th: it stands on its heel (toes up) or on the ball of the foot (heel up)
  const plant = (heelZ, th) => th <= 0 ? [heelZ + HEEL * Math.cos(th) + AH * Math.sin(th), AH * Math.cos(th) - HEEL * Math.sin(th)] : [heelZ + HEEL + BALL - BALL * Math.cos(th) + AH * Math.sin(th), AH * Math.cos(th) + BALL * Math.sin(th)];
  const off = plant(reach - stride * stance, footW(stance)), on = plant(reach, footW(0)), m = -stride * (1 - stance);
  const ankle = ph => {
    ph -= Math.floor(ph);
    if (ph < stance) return plant(reach - stride * ph, footW(ph));
    const u = (ph - stance) / (1 - stance), u2 = u * u, u3 = u2 * u, e = u2 * (3 - 2 * u);
    return [(2 * u3 - 3 * u2 + 1) * off[0] + (u3 - 2 * u2 + u) * m + (3 * u2 - 2 * u3) * on[0] + (u3 - u2) * m, off[1] + (on[1] - off[1]) * e + lift * S(Math.PI * Math.pow(u, Math.log(.5) / Math.log(liftAt)))];   // (the lift peaks liftAt of the way through the swing)
  };
  // the leg bent to reach it: the thigh's and the knee's angles through the cycle, worked out once
  const leg = k => table(p => {
    const a = p * TAU, [z, y] = ankle(p), hipY = HJ - (drop + bob * Math.cos(2 * a - bobAt)) * 1.8 + HX * list * S(a + .6), hipZ = HX * yaw * Math.cos(a);
    const dz = z - hipZ, dy = hipY - y, d = Math.min(L1 + L2 - .003, Math.hypot(dz, dy)), al = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)), kn = Math.PI - Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
    return k ? kn : -(Math.atan2(dz, dy) + al);
  });
  const thigh = leg(0), knee = leg(1), foot = table(footW);
  return p => {
    const a = p * TAU, c = Math.cos(a), hy = -yaw * c, hz = list * S(a + .6), pr = p + .5;
    const tl = thigh(p), tr = thigh(pr), kl = knee(p), kr = knee(pr), sw = Math.cos(a + .25);   // the arms trail the legs a touch
    return { j: {
      hips: [crouch, hy, hz],
      spine: [lean, -hy * (1 + twist), -hz * .8],
      head: [-(lean + crouch) * head + nod * S(a * 2), hy * twist * .8, -hz * .2],
      legL: [tl - crouch, -hy, -hz], shinL: [kl, 0, 0], footL: [Math.max(-.7, Math.min(1.2, foot(p) - tl - kl)), 0, 0],
      legR: [tr - crouch, -hy, -hz], shinR: [kr, 0, 0], footR: [Math.max(-.7, Math.min(1.2, foot(pr) - tr - kr)), 0, 0],
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
    legL: [-.03 - .04 * Math.max(0, -w), -.06, -.035 * w + .03], shinL: [.06 + .16 * Math.max(0, -w), 0, 0], footL: [-.03 - .12 * Math.max(0, -w), 0, 0],
    legR: [-.03 - .04 * Math.max(0, w), .06, -.035 * w - .03], shinR: [.06 + .16 * Math.max(0, w), 0, 0], footR: [-.03 - .12 * Math.max(0, w), 0, 0],
    armL: [.03 + .01 * br, 0, -.04], armR: [.03 + .01 * br, 0, .04], foreL: [-.22, -.35, 0], foreR: [-.22, .35, 0], handL: [-.15, -.35, 0], handR: [-.15, .35, 0],
  }, drop: .004 + .003 * Math.abs(w), shift: [.022 * w, 0, 0] };
};
/**
 * Lifelike motion for a figure with feet and hands (gs.models.human people move with it): idle, walk, jog,
 * run, sprint and sneak with a turning pelvis, shoulders that counter it, arms that swing from the
 * shoulder and feet that land on the heel and push off from the toes. For your own rig:
 * new Rig(parts, { poses: LIFELIKE, weight: 1 }). Speeds they suit (m/s): walk 1.4, jog 3.4, run 5.6, sprint 7.5,
 * sneak 1: rig.blend({ idle: 0, walk: 1.4, jog: 3.4, run: 5.6 }, speed) moves between them in step.
 */
const gaitOf = g => cyc(gait(g), 1 / g.stride);
export const LIFELIKE = {
  idle: { cycle: idleLife, rate: 0, time: 9 },
  walk: gaitOf({ stride: 1.36, stance: .62, reach: .3, lift: .075, liftAt: .4,
    foot: [[0, -.3], [.1, 0], [.42, 0], [.52, .3], [.62, .8], [.72, .5], [.84, -.05], [.94, -.3]],
    yaw: .075, list: .05, lean: .045, twist: 1, arm: .36, armMid: .02, elbow: .26, elbowSwing: .13, armOut: -.03, drop: .015, bob: .012, bobAt: 0, side: .02, nod: .01 }),
  jog: gaitOf({ stride: 2.35, stance: .4, reach: .3, lift: .2, liftAt: .35,
    foot: [[0, -.1], [.07, .03], [.25, .05], [.4, .95], [.52, 1], [.72, .4], [.9, -.08]],
    yaw: .1, list: .05, lean: .17, twist: 1.15, arm: .5, armMid: .06, elbow: 1.4, elbowSwing: .2, armIn: .1, armOut: .1, drop: .045, bob: .018, bobAt: 2.3, nod: .012 }),
  run: gaitOf({ stride: 3.5, stance: .31, reach: .34, lift: .36, liftAt: .3,
    foot: [[0, 0], [.06, .05], [.2, .1], [.31, 1], [.45, 1.15], [.7, .45], [.9, 0]],
    yaw: .13, list: .055, lean: .24, twist: 1.2, arm: .68, armMid: .1, elbow: 1.5, elbowSwing: .25, armIn: .12, armOut: .12, drop: .05, bob: .022, bobAt: 1.9, nod: .015 }),
  sprint: gaitOf({ stride: 4.3, stance: .26, reach: .36, lift: .46, liftAt: .28,
    foot: [[0, .15], [.06, .15], [.18, .2], [.26, 1.05], [.45, 1.2], [.7, .5], [.9, .15]],
    yaw: .15, list: .06, lean: .36, twist: 1.25, arm: .9, armMid: .08, elbow: 1.6, elbowSwing: .3, armIn: .12, armOut: .13, drop: .055, bob: .024, bobAt: 1.8, nod: .016 }),
  sneak: gaitOf({ stride: 1.0, stance: .66, reach: .26, lift: .09, liftAt: .45,
    foot: [[0, .05], [.1, 0], [.5, 0], [.58, .35], [.66, .7], [.78, .4], [.9, .12]],
    yaw: .06, list: .04, lean: .34, crouch: .1, twist: .8, arm: .16, armMid: -.25, elbow: 1.0, elbowSwing: .08, armOut: .08, drop: .17, bob: .006, bobAt: 0, side: .02, head: .8 }),
};

/**
 * Joints hooked up to a character. parts: { hips, spine, head, armL, foreL, armR, foreR, legL, shinL,
 * legR, shinR } (any can be left out). fade: seconds to blend to a new pose. height: of the figure,
 * for how far the hips drop when crouching. joints: the names the poses turn, for a skeleton with other
 * joints than a person's (a creature's wings, tail and four legs: gs.models.creature). A pose may also say
 * how fast it runs when it doesn't follow the ground: { cycle, rate: 0, per: cycles a second }.
 */
export class Rig {
  constructor(parts, { fade = .18, height = 1.8, poses = {}, weight = 0, size = 1, joints = JOINTS } = {}) {
    this.parts = parts; this.fade = fade; this.height = height; this.poses = { ...POSES, ...poses }; this.weight = weight; this.size = size; this.done = false;
    this.base = new Map(); for (const k of joints) if (parts[k]) this.base.set(k, [parts[k].rotation.x, parts[k].rotation.y, parts[k].rotation.z]);
    this.hip0 = parts.hips ? parts.hips.position.y : 0; this.hipX = parts.hips ? parts.hips.position.x : 0; this.hipZ = parts.hips ? parts.hips.position.z : 0;
    this.layers = [{ name: 'idle', w: 1, phase: 0 }]; this.top = null; this.topW = 0; this.phase = 0; this.state = 'idle'; this.cur = {};
  }
  /**
   * Blends to a pose by name. at: where in the pose (0..1) it stands, for a pose the game drives itself
   * (a climb in step with the rungs, an action in step with a cutscene): call each frame with the new
   * value. from: where it starts (a crowd out of step). again: true starts a pose over that is already playing.
   */
  play(name, { fade = this.fade, at = null, from = null, again = false } = {}) {
    this.blendOn = false;
    const top = this.layers[this.layers.length - 1];
    if (name === this.state && !again) { if (at != null) { top.phase = at; top.pin = true; } return this; }
    this.state = name; this.fadeT = fade; this.done = false;
    this.layers.push({ name, w: 0, phase: at ?? from ?? (this.poses[name]?.once || again ? 0 : this.phase), pin: at != null });
    return this;
  }
  /** An upper-body pose over the legs (aim, wave, punch), or null to let go. */
  upper(name) { if (name) this.top = name; this.topOn = !!name; return this; }
  /**
   * Adds your own pose: rig.add('dance', p => ({ j: { armL: [...] }, drop: 0 }), cyclesPerMetre). For a
   * pose that runs by the clock give { time: seconds, once: true } instead of a rate: once plays it
   * through and holds its end (rig.done turns true), without it the pose repeats. keys() makes the function
   * from key poses.
   */
  add(name, fn, rate = 0) {
    const d = this.poses[name] = cyc(typeof fn === 'function' ? fn : () => fn, typeof rate === 'number' ? rate : rate.rate || 0);
    if (typeof rate === 'object') { d.time = rate.time; d.once = !!rate.once; }
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
    if (!this.blendOn) { this.blendOn = true; this.blendPhase ??= this.phase; }
    this.state = 'blend'; return this;
  }
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
    // a blend space: every pose in it shares one phase, moving at the mix of their rates
    this.blendK = Math.max(0, Math.min(1, (this.blendK || 0) + (this.blendOn ? 1 : -1) * dt / Math.max(.01, this.fade)));
    if (this.blendK > 0 && this.bw) {
      let rate = 0, timed = 0;
      for (const n in this.bw) { const def = this.poses[n], w = this.bw[n]; if (!def) continue; if (def.rate) rate += def.rate * w; else timed += (def.time ? 1 / def.time : def.per ?? TIMED[n] ?? .2) * w; }
      this.blendPhase = ((this.blendPhase ?? 0) + speed * rate / this.size * dt + timed * dt) % 1;
    } else if (!this.blendOn) this.blendPhase = null;
    // advance phases: cycles by distance, still poses by time
    for (const l of this.layers) {
      const def = this.poses[l.name]; if (!def || l.pin) continue;
      const step = def.rate ? speed * def.rate / this.size * dt : def.time ? dt / def.time : (def.per ?? TIMED[l.name] ?? .2) * dt;
      l.phase = def.once ? Math.min(1, l.phase + step) : (l.phase + step) % 1;
    }
    const k = this.fadeT > 0 ? Math.min(1, dt / this.fadeT) : 1;
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
        const w = this.bw[n], s = this.sample(n, this.blendPhase ?? 0); bd += (s.drop || 0) * w;
        if (s.shift) { bs[0] += s.shift[0] * w; bs[1] += s.shift[1] * w; bs[2] += s.shift[2] * w; }
        for (const j in s.j) { const a = s.j[j], o = mixd[j] ||= [0, 0, 0]; o[0] += a[0] * w; o[1] += a[1] * w; o[2] += a[2] * w; }
      }
      for (const j of this.base.keys()) { const a = mixd[j]; if (!a && !out[j]) continue; const o = out[j] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] += ((a ? a[i] : 0) - o[i]) * k2; }
      drop += (bd - drop) * k2; for (let i = 0; i < 3; i++) shift[i] += (bs[i] - shift[i]) * k2;
      if (this.blendOn && k2 >= 1) {   // the layers underneath: just its strongest pose, in step with it (what a later play() fades from)
        let top = 'idle', tw = -1; for (const n in this.bw) if (this.bw[n] > tw) { tw = this.bw[n]; top = n; }
        const l = this.layers[0]; if (this.layers.length !== 1 || l.name !== top) this.layers = [{ name: top, w: 1, phase: this.blendPhase ?? 0 }]; else l.phase = this.blendPhase ?? 0;
      }
    }
    if (this.top && this.topW > .001) {
      const s = this.sample(this.top, this.phase);
      for (const j of UPPER) { const a = s.j[j] || [0, 0, 0], o = out[j] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] += (a[i] - o[i]) * this.topW; }
      if (this.top === 'aim') { (out.armR ||= [0, 0, 0])[0] -= aim * this.topW; (out.armL ||= [0, 0, 0])[0] -= aim * this.topW; (out.head ||= [0, 0, 0])[0] -= aim * .5 * this.topW; }
      if (!this.topOn && this.topW < .01) this.top = null;
    }
    if (this.weight) this.sway(dt, speed, turn, out);
    else if (turn) (out.spine ||= [0, 0, 0])[2] -= turn * .1;
    this.phase = last.phase;
    for (const [j, b] of this.base) { const a = out[j] || [0, 0, 0], p = this.parts[j]; p.rotation.set(b[0] + a[0], b[1] + a[1], b[2] + a[2]); }
    if (this.parts.hips) { const k = this.height / 1.8; this.parts.hips.position.set(this.hipX + shift[0] * k, this.hip0 - drop * this.height + shift[1] * k, this.hipZ + shift[2] * k); }
    this.cur = out; return this;
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
