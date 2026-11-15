// gs.models.weapon(kind): weapons made in code for a Next Gen game, with no model files. Guns (a pistol, a revolver,
// a compact sub-machine gun, a pump shotgun, a rifle, a bolt-action rifle with a scope, a shoulder launcher), a grenade,
// and things to swing (a bat, a length of pipe, a wrench, a baton). They are our own designs, not copies of real
// makes. Each is a Group of a few meshes (one per material, so a few draws) in its own space: the right hand's grip at
// the origin, the muzzle (or the business end) towards -z, its top up, its right side +x; and named points on it:
//   points.grip     where the right hand holds it (the trigger hand)
//   points.fore     where the left hand goes (a gun's fore-end, a bat's handle lower down); null for one hand
//   points.muzzle   where shots leave (guns), the end that hits (things swung)
//   points.eject    where a spent case comes out (guns that throw them)
//   points.sight    the line the eye looks along when aiming
//   points.stock    where the butt sits in the shoulder (long guns)
// userData.weapon: { kind, hands: 1 | 2, long (sits in the shoulder), length (metres), melee (swung) }.
// weapon.wield(person) (gs.models.human, gs.poses person or figure) then puts it in their hands each frame.
// Kit use only: games reach it as gs.models.weapon.
import { Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3, Matrix4, Euler } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Build, boxUV, rngOf } from './props.js';
import { material } from './materials.js';
import { reach } from '../characters.js';

const Z = Math.PI / 2;
// the materials, shared by every weapon that asks for the same look
const LOOKS = {
  steel: ['metal', { colour: '#4a4d52' }], dark: ['metal', { colour: '#26282b' }], blued: ['metal', { colour: '#2d3240' }], bright: ['metal', { colour: '#a8adb2' }],
  poly: ['paint', { colour: '#2a2b2d', under: '#2a2b2d' }], green: ['paint', { colour: '#4a5536', under: '#3a4229' }], tan: ['paint', { colour: '#9c8a68', under: '#6e624a' }],
  wood: ['wood', { colour: '#8a5a32' }], walnut: ['wood', { colour: '#6a3f22' }], ash: ['wood', { colour: '#c7a274' }],
  grip: ['leather', { colour: '#1d1c1b' }], tape: ['fabric', { colour: '#2c2c30' }], brass: ['metal', { colour: '#b8913a' }], red: ['paint', { colour: '#a8322a', under: '#a8322a' }],
  glass: ['metal', { colour: '#0c1016' }],
};
const shared = new Map();
// (where there is no page to paint the materials' pictures on, a worker or a test: plain ones in their colours)
const matOf = (look, finish) => {
  const [name, o] = LOOKS[look], key = look + (finish || ''), opt = { ...o, ...(finish && look === 'poly' ? { colour: finish, under: finish } : {}) };
  if (!shared.has(key)) shared.set(key, typeof document === 'undefined' ? new MeshStandardMaterial({ color: opt.colour, metalness: name === 'metal' ? .9 : 0, roughness: .5, name: look }) : material(name, opt));
  return shared.get(key);
};

// each weapon: what it is, and how to build it into b (slots are LOOKS), its points, and the rng for small differences
const KINDS = {
  pistol: { hands: 2, make(b, r) {
    b.box('steel', .03, .034, .19, [0, .046, -.04], 0, .004);                                  // the slide
    for (let i = 0; i < 6; i++) b.box('dark', .031, .022, .003, [0, .047, .03 + i * .007]);   // its grip lines
    b.box('poly', .028, .022, .15, [0, .02, -.045], 0, .003);                                  // the frame
    b.box('poly', .03, .105, .044, [0, -.035, .02], [-.22, 0, 0], .006);                       // the grip, raked back
    b.box('grip', .032, .06, .036, [0, -.035, .022], [-.22, 0, 0], .004);
    b.ring('poly', .018, .0028, [0, .002, -.03], [0, Z, 0], Math.PI);                          // the trigger guard
    b.box('dark', .004, .016, .006, [0, .002, -.022], [.3, 0, 0]);                             // the trigger
    b.cyl('dark', .0052, .0052, .012, [0, .046, -.137], [Z, 0, 0], 12);                        // the muzzle
    b.box('dark', .006, .006, .008, [0, .066, -.125]).box('dark', .02, .006, .008, [0, .066, .045]);   // sights
    return { grip: [0, -.03, .018], fore: [-.02, -.045, .012], muzzle: [0, .046, -.145], eject: [.017, .052, -.02], sight: [0, .072, .05], length: .2 };
  } },
  revolver: { hands: 2, make(b) {
    b.cyl('blued', .0085, .0085, .14, [0, .045, -.11], [Z, 0, 0], 14); b.box('blued', .012, .012, .14, [0, .058, -.11], 0, .002);   // barrel and its rib
    b.cyl('blued', .02, .02, .042, [0, .036, -.02], [Z, 0, 0], 6);                             // the cylinder (six flats)
    b.box('blued', .026, .05, .08, [0, .035, .012], 0, .004).box('blued', .008, .014, .012, [0, .068, .05], [.6, 0, 0]);   // frame, hammer
    b.box('walnut', .03, .095, .04, [0, -.03, .035], [-.35, 0, 0], .01);
    b.ring('blued', .016, .0026, [0, .006, -.0], [0, Z, 0], Math.PI); b.box('dark', .004, .015, .005, [0, .006, .004], [.35, 0, 0]);
    return { grip: [0, -.025, .03], fore: [-.02, -.04, .025], muzzle: [0, .045, -.18], eject: null, sight: [0, .07, .05], length: .24 };
  } },
  smg: { hands: 2, long: true, make(b, r) {
    b.box('poly', .042, .062, .27, [0, .03, -.06], 0, .006);                                   // the receiver
    b.box('dark', .03, .012, .22, [0, .067, -.07], 0, .002);                                   // a rail on top
    b.cyl('dark', .009, .009, .1, [0, .036, -.24], [Z, 0, 0], 12); b.cyl('dark', .014, .012, .03, [0, .036, -.3], [Z, 0, 0], 12);   // barrel, muzzle
    b.box('poly', .032, .1, .042, [0, -.04, .02], [-.18, 0, 0], .006);                         // the grip
    b.box('dark', .026, .15, .03, [0, -.06, -.07], [.08, 0, 0], .003);                         // the magazine, ahead of the grip
    b.box('poly', .03, .08, .034, [0, -.03, -.16], [-.1, 0, 0], .006);                         // the fore grip
    b.ring('poly', .018, .003, [0, -.004, -.005], [0, Z, 0], Math.PI);
    b.box('dark', .012, .012, .2, [0, .02, .17], 0, .002).box('dark', .012, .05, .012, [0, .0, .27]).box('poly', .02, .07, .03, [0, .0, .285], 0, .005);   // folding wire stock
    b.box('dark', .008, .014, .01, [0, .08, -.17]).box('dark', .02, .016, .012, [0, .08, .03]);
    return { grip: [0, -.035, .02], fore: [0, -.04, -.16], muzzle: [0, .036, -.32], eject: [.024, .05, -.04], sight: [0, .09, .06], stock: [0, .0, .29], length: .62 };
  } },
  shotgun: { hands: 2, long: true, make(b) {
    b.cyl('blued', .011, .011, .5, [0, .045, -.42], [Z, 0, 0], 14);                           // barrel
    b.cyl('blued', .01, .01, .4, [0, .02, -.38], [Z, 0, 0], 12);                               // the tube under it
    b.box('blued', .036, .055, .2, [0, .035, -.08], 0, .006);                                  // receiver
    b.cyl('walnut', .022, .022, .17, [0, .022, -.3], [Z, 0, 0], 16);                           // the pump
    for (let i = 0; i < 6; i++) b.ring('walnut', .022, .0025, [0, .022, -.23 - i * .025], [0, 0, 0]);
    b.box('walnut', .034, .06, .1, [0, -.0, .06], [.25, 0, 0], .012);                          // the wrist
    b.box('walnut', .038, .13, .28, [0, -.035, .24], [.1, 0, 0], .014);                        // the stock
    b.box('grip', .042, .14, .015, [0, -.045, .385], [.1, 0, 0], .005);                        // butt pad
    b.ring('blued', .02, .0028, [0, -.0, -.02], [0, Z, 0], Math.PI); b.box('dark', .004, .016, .006, [0, -.002, -.018], [.3, 0, 0]);
    b.ball('bright', .004, [0, .059, -.66]);
    return { grip: [0, -.01, .04], fore: [0, .0, -.3], muzzle: [0, .045, -.67], eject: [.02, .05, -.08], sight: [0, .065, .02], stock: [0, -.03, .39], length: 1.06 };
  } },
  rifle: { hands: 2, long: true, make(b, r) {
    b.box('green', .044, .07, .3, [0, .038, -.06], 0, .006);                                   // receiver
    b.box('dark', .03, .012, .32, [0, .08, -.08], 0, .002);                                    // top rail
    b.box('green', .05, .058, .24, [0, .04, -.33], 0, .01);                                    // handguard
    for (let i = 0; i < 5; i++) b.box('dark', .052, .02, .012, [0, .04, -.25 - i * .04]);     // its vents
    b.cyl('dark', .0095, .0095, .2, [0, .045, -.54], [Z, 0, 0], 12); b.cyl('dark', .015, .013, .045, [0, .045, -.65], [Z, 0, 0], 8);   // barrel, flash hider
    b.box('dark', .028, .16, .05, [0, -.06, -.11], [.2, 0, 0], .006);                          // a curved magazine (two tilted parts)
    b.box('dark', .028, .06, .045, [0, -.14, -.085], [.42, 0, 0], .006);
    b.box('poly', .032, .1, .04, [0, -.04, .03], [-.25, 0, 0], .006);                          // grip
    b.ring('green', .018, .003, [0, -.002, -.01], [0, Z, 0], Math.PI);
    b.box('green', .036, .055, .14, [0, .03, .14], 0, .008);                                   // the stock's tube
    b.box('green', .04, .13, .07, [0, .0, .25], [.05, 0, 0], .012); b.box('grip', .042, .13, .012, [0, .0, .29], [.05, 0, 0], .004);
    b.box('dark', .016, .03, .02, [0, .1, -.38]).box('dark', .022, .03, .025, [0, .1, .02]);  // sights
    return { grip: [0, -.035, .03], fore: [0, .01, -.3], muzzle: [0, .045, -.675], eject: [.025, .05, -.05], sight: [0, .115, .08], stock: [0, .0, .3], length: .98 };
  } },
  sniper: { hands: 2, long: true, make(b) {
    b.cyl('blued', .011, .0085, .62, [0, .03, -.45], [Z, 0, 0], 14);                           // barrel
    b.cyl('blued', .0175, .0175, .19, [0, .03, -.04], [Z, 0, 0], 14);                          // receiver
    b.cyl('blued', .005, .005, .05, [.036, .02, .0], [0, 0, Z + .45], 8); b.ball('blued', .01, [.058, .008, 0]);   // bolt handle
    b.box('walnut', .036, .06, .5, [0, -.005, -.17], 0, .012);                                 // fore-end and wrist
    b.box('walnut', .04, .13, .26, [0, -.04, .22], [.12, 0, 0], .014); b.box('grip', .044, .14, .014, [0, -.05, .355], [.12, 0, 0], .005);
    b.ring('blued', .02, .0028, [0, -.03, .02], [0, Z, 0], Math.PI);
    // the scope on its rings
    b.cyl('dark', .0127, .0127, .27, [0, .084, -.03], [Z, 0, 0], 16); b.cyl('dark', .0195, .0127, .06, [0, .084, -.19], [Z, 0, 0], 16); b.cyl('dark', .0195, .0195, .03, [0, .084, -.235], [Z, 0, 0], 16);
    b.cyl('dark', .017, .0127, .045, [0, .084, .122], [Z, 0, 0], 16); for (const z of [.05, -.105]) b.box('dark', .016, .04, .014, [0, .058, z]);
    b.cyl('glass', .0165, .0165, .003, [0, .084, -.25], [Z, 0, 0], 16);
    return { grip: [0, -.04, .05], fore: [0, -.015, -.26], muzzle: [0, .03, -.76], eject: [.02, .04, -.02], sight: [0, .084, .16], stock: [0, -.04, .36], length: 1.12 };
  } },
  launcher: { hands: 2, long: true, holds: { aim: { at: [.03, .07, .0], f: [0, 0, 1], u: [0, 1, 0], body: true, by: 'stock' }, hip: { at: [.03, .07, .0], f: [0, -.12, 1], u: [0, 1, 0], body: true, by: 'stock' } }, make(b) {
    b.cyl('green', .045, .045, .95, [0, .06, -.1], [Z, 0, 0], 20);                            // the tube
    b.cyl('dark', .05, .05, .06, [0, .06, -.56], [Z, 0, 0], 20); b.cyl('dark', .05, .05, .05, [0, .06, .36], [Z, 0, 0], 20);   // its ends
    b.box('poly', .03, .1, .04, [0, -.03, 0], [-.2, 0, 0], .006).box('poly', .03, .09, .04, [0, -.025, -.24], [-.1, 0, 0], .006);   // two grips
    b.box('dark', .03, .06, .07, [-.06, .11, -.12], 0, .005).box('glass', .022, .03, .002, [-.06, .12, -.084]);   // the sight, on its left
    b.box('grip', .1, .02, .2, [0, .01, .12], 0, .006);                                        // shoulder rest
    return { grip: [0, -.03, 0], fore: [0, -.025, -.24], muzzle: [0, .06, -.6], eject: null, sight: [-.06, .12, -.04], stock: [0, .015, .1], length: 1.0 };
  } },
  grenade: { hands: 1, holds: { aim: { at: [-.02, .14, -.16], f: [0, .3, 1], u: [0, 1, 0], body: true }, hip: { at: [.1, -.25, .3], f: [0, .3, 1], u: [0, 1, 0], body: true },
    ready: { at: [-.06, .2, .28], f: [0, 0, 1], u: [0, 1, 0] } }, make(b) {
    b.lathe('green', [[0, -.045], [.022, -.042], [.032, -.025], [.034, 0], [.03, .022], [.018, .035], [0, .036]]);
    for (let i = 0; i < 4; i++) b.ring('green', .033 - Math.abs(i - 1.5) * .002, .0018, [0, -.022 + i * .014, 0], [Z, 0, 0]);
    b.cyl('steel', .011, .011, .018, [0, .045, 0], 0, 12); b.box('steel', .012, .006, .07, [0, .05, .03], [.35, 0, 0]);   // the fuse and its lever
    b.ring('bright', .013, .0017, [-.016, .05, -.006], [0, 0, Z]);                             // the ring
    return { grip: [0, 0, 0], fore: null, muzzle: [0, 0, 0], eject: null, sight: [0, 0, 0], length: .1 };
  } },
  bat: { hands: 2, melee: true, make(b) {
    b.lathe('ash', [[0, 0], [.022, 0], [.024, .012], [.014, .03], [.015, .3], [.022, .45], [.032, .6], [.035, .78], [.031, .83], [0, .835]], [0, -.07, 0], 20);
    b.cyl('tape', .0158, .0152, .2, [0, .05, 0], 0, 14);
    return { grip: [0, 0, 0], fore: [0, -.075, 0], muzzle: [0, .7, 0], eject: null, sight: [0, 0, 0], length: .84, upright: true };
  } },
  pipe: { hands: 2, melee: true, make(b) {
    b.cyl('steel', .017, .017, .74, [0, .27, 0], 0, 14); b.cyl('dark', .022, .022, .06, [0, .64, 0], 0, 8);   // the pipe and a fitting on its end
    b.cyl('tape', .0185, .0185, .14, [0, .0, 0], 0, 14);
    return { grip: [0, 0, 0], fore: [0, -.06, 0], muzzle: [0, .6, 0], eject: null, sight: [0, 0, 0], length: .74, upright: true };
  } },
  wrench: { hands: 1, melee: true, make(b) {
    b.box('bright', .014, .38, .03, [0, .12, 0], 0, .005);
    b.box('bright', .022, .05, .07, [0, .33, -.01], 0, .006).box('bright', .022, .05, .02, [0, .37, .02], 0, .004);   // the jaws
    b.cyl('red', .018, .018, .12, [0, -.02, 0], 0, 12);
    return { grip: [0, 0, 0], fore: null, muzzle: [0, .34, 0], eject: null, sight: [0, 0, 0], length: .42, upright: true };
  } },
  baton: { hands: 1, melee: true, make(b) {
    b.cyl('poly', .016, .014, .6, [0, .2, 0], 0, 14); b.cyl('grip', .018, .018, .16, [0, -.0, 0], 0, 14); b.ball('poly', .019, [0, -.09, 0]);
    b.cyl('poly', .011, .011, .11, [.0, .02, -.055], [Z, 0, 0], 10);                          // the side handle
    return { grip: [0, 0, 0], fore: null, muzzle: [0, .48, 0], eject: null, sight: [0, 0, 0], length: .6, upright: true };
  } },
};
/** The weapons there are. */
export const WEAPON_KINDS = Object.keys(KINDS);

const made = new Map();
/**
 * A weapon made in code: kind 'pistol' | 'revolver' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'launcher' | 'grenade' |
 * 'bat' | 'pipe' | 'wrench' | 'baton'. Options: finish (the colour of its polymer parts), seed. The same weapon asked
 * for again shares its shapes and materials. Returns a Group with points (see the top) and wield(person).
 */
export function weapon(kind = 'pistol', { finish = null, seed = 0, shadows = true } = {}) {
  const K = KINDS[kind]; if (!K) throw new Error(`gs.models.weapon: no weapon '${kind}' (try ${WEAPON_KINDS.join(', ')})`);
  const key = JSON.stringify([kind, finish, seed]);
  let m = made.get(key);
  if (!m) {
    const b = new Build(), pts = K.make(b, rngOf(seed + 1)), parts = [];
    for (const [slot, geos] of b.slots) { const g = boxUV(mergeGeometries(geos, false), .25); for (const x of geos) x.dispose(); parts.push({ geo: g, mat: matOf(slot, finish), slot }); }
    made.set(key, m = { parts, pts });
  }
  const out = new Group(); out.name = 'weapon:' + kind;
  for (const p of m.parts) { const mesh = new Mesh(p.geo, p.mat); mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.name = p.slot; out.add(mesh); }
  out.points = {};
  for (const name of ['grip', 'fore', 'muzzle', 'eject', 'sight', 'stock']) {
    const at = m.pts[name]; if (!at) { out.points[name] = null; continue; }
    const o = new Object3D(); o.name = name; o.position.set(...at); out.add(o); out.points[name] = o;
  }
  out.userData.weapon = { kind, hands: K.hands, long: !!K.long, melee: !!K.melee, length: m.pts.length, upright: !!m.pts.upright };
  out.wield = person => new Wield(person, out);
  return out;
}

// ---------------------------------------------------------------- held in the hands

// where a weapon sits for each way of holding it. Up to aim and at the hip (body: true) it is placed in the body's own
// space (z forward, its left +x, y up) from the right shoulder, so it points where the body faces whatever the chest
// is doing, and the up and down aim (pitch) and the turn at the waist (yaw) swing it about the shoulder; held ready,
// low or slung it goes with the chest (the spine bone: z forward, the person's left +x). at: where its point `by`
// goes (the grip, the right hand, unless said: a long gun's stock sits in the shoulder to aim); f: the way it points
// (its muzzle, or a thing swung: its business end); u: its top; one: only the right hand on it.
const H = (at, f, u = [0, 1, 0], o = {}) => ({ at, f, u, ...o });
const HOLDS = {
  long: { aim: H([.06, -.035, .03], [0, 0, 1], [0, 1, 0], { body: true, by: 'stock' }), hip: H([.07, -.22, .02], [0, .05, 1], [0, 1, 0], { body: true, by: 'stock' }),
    ready: H([-.06, .2, .3], [.3, -.55, .78]), slung: H([-.16, .27, -.15], [.03, .995, -.1], [0, 0, -1], { one: true }), low: H([-.18, -.02, .16], [.15, -.95, .25], [0, 1, 0], { one: true }) },
  short: { aim: H([.15, -.05, .5], [0, .02, 1], [0, 1, 0], { body: true }), hip: H([.08, -.32, .32], [0, 0, 1], [0, 1, 0], { body: true }),
    ready: H([-.02, .16, .32], [.1, -.6, .8]), slung: H([-.17, -.08, .02], [0, -1, .05], [-1, 0, 0], { one: true }), low: H([-.2, -.04, .12], [.05, -.97, .2], [0, 1, 0], { one: true }) },
  swing: { aim: H([-.04, .16, .32], [.15, .7, .6], [0, 0, 1]), ready: H([-.13, .26, .18], [-.2, .78, -.55], [0, 0, 1]), hip: H([-.08, .08, .3], [.1, .35, .9], [0, 1, 0]),
    slung: H([-.2, -.1, .02], [0, -1, .05], [0, 0, 1], { one: true }), low: H([-.21, -.06, .08], [0, -1, .2], [0, 0, 1], { one: true }) },
};
const _m = new Matrix4(), _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _q = new Quaternion(), _q2 = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _e = new Euler();
// the weapon's turn for a hold: its muzzle (-z), or for a thing swung its length (+y), along f, its top towards u
const holdQ = (h, upright, out) => {
  if (upright) { _y.set(...h.f).normalize(); _z.set(...h.u); _x.crossVectors(_y, _z).normalize(); _z.crossVectors(_x, _y); }
  else { _z.set(-h.f[0], -h.f[1], -h.f[2]).normalize(); _x.set(...h.u).cross(_z).normalize(); _y.crossVectors(_z, _x); }
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
};

/**
 * A weapon in someone's hands (weapon.wield(person)): each frame after rig.update(), update(dt, { how, pitch, yaw }) puts
 * it where that way of holding has it (eased from the last: how 'aim' | 'ready' | 'hip' | 'low' | 'slung', or 'none' to
 * put it away: it is hidden) and the hands onto it, both for a two-handed one (gs.models.human: hold(), with the fingers
 * closed round it; a plain figure: its arms bent to reach). Up to aim and at the hip it points where the body faces,
 * turned about the right shoulder by pitch (up and down, radians, up +) and yaw (the turn at the waist, left +). Then
 * muzzle (a point in the world) and dir (the way it points; a thing swung: along its length) are where shots leave.
 */
export class Wield {
  constructor(person, gun) {
    this.person = person; this.gun = gun; this.info = gun.userData.weapon; this.how = 'ready'; this.k = 1; this.from = null; this.ease = .18;
    this.spine = person.rig?.parts?.spine || person; this.spine.add(gun);
    this.table = { ...(this.info.melee ? HOLDS.swing : this.info.long ? HOLDS.long : HOLDS.short), ...KINDS[this.info.kind].holds };
    this.muzzle = new Vector3(); this.dir = new Vector3(0, 0, -1); this.place(this.table.ready, 0, 0);
  }
  // the weapon where hold h has it, in the chest's space (it hangs from the spine bone)
  place(h, pitch, yaw) {
    const g = this.gun, by = (h.by && g.points[h.by] || g.points.grip).position;
    holdQ(h, this.info.upright, g.quaternion);
    if (!h.body) { g.position.set(...h.at).sub(_x.copy(by).applyQuaternion(g.quaternion)); return; }
    // in the body's space: about the right shoulder, turned by the aim, then carried into the chest's
    const P = this.person, R = P.rig?.parts, sh = R?.armR;
    P.updateMatrixWorld(true);
    _e.set(-pitch, yaw, 0, 'YXZ'); _q2.setFromEuler(_e);
    g.quaternion.premultiply(_q2);
    _p.set(...h.at).applyQuaternion(_q2);
    if (sh) _p.add(P.worldToLocal(sh.getWorldPosition(_s))); else _p.y += 1.42;
    _p.sub(_x.copy(by).applyQuaternion(g.quaternion));
    // body space to the spine's
    P.localToWorld(_p); this.spine.worldToLocal(_p); g.position.copy(_p);
    g.quaternion.premultiply(P.getWorldQuaternion(_q2)).premultiply(this.spine.getWorldQuaternion(_q).invert());
  }
  /** Puts it away (how 'none'), slings it, holds it ready, at the hip, low, or up to aim; after rig.update(). */
  update(dt, { how = this.how, pitch = 0, yaw = 0, hands = true } = {}) {
    const g = this.gun;
    if (how !== this.how) { this.from = { p: g.position.clone(), q: g.quaternion.clone() }; this.how = how; this.k = 0; }
    g.visible = how !== 'none'; if (how === 'none') return this;
    this.k = Math.min(1, this.k + dt / this.ease);
    const h = this.table[how] || this.table.ready;
    this.place(h, pitch, yaw);
    if (this.from && this.k < 1) { const s = this.k * this.k * (3 - 2 * this.k); g.position.lerpVectors(this.from.p, g.position, s); g.quaternion.slerpQuaternions(this.from.q, g.quaternion, s); }
    g.updateMatrixWorld(true);
    if (hands && how !== 'slung') this.hands(h.one);
    g.points.muzzle.getWorldPosition(this.muzzle);
    this.dir.set(0, this.info.upright ? 1 : 0, this.info.upright ? 0 : -1).transformDirection(g.matrixWorld);
    return this;
  }
  hands(one = false) {
    const P = this.person, g = this.gun, gp = g.points.grip.position, fp = g.points.fore?.position;
    const right = [gp.x, gp.y, gp.z], left = fp && !one && this.info.hands === 2 ? [fp.x, fp.y, fp.z] : null;
    if (typeof P.hold === 'function') { P.hold(g, right, left); return; }
    // a plain figure or person: bend the arms to reach (their hands' ends at the grip and the fore-end)
    const R = P.rig?.parts; if (!R) return;
    P.updateMatrixWorld(true);
    for (const [sd, pt] of [['R', right], ['L', left]]) {
      if (!pt || !R['arm' + sd] || !R['fore' + sd]) continue;
      const t = new Vector3(...pt).applyMatrix4(g.matrixWorld), pole = new Vector3(sd === 'R' ? -.5 : .5, -.4, -.3).applyMatrix4(R.spine.matrixWorld);
      reach(R['arm' + sd], R['fore' + sd], t, { pole, end: R['hand' + sd] || undefined });
    }
  }
  /** Lets go: takes it off the person. */
  drop() { this.spine.remove(this.gun); return this.gun; }
}
