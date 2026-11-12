// The body of gs.models.human under its clothes: the trunk, the seat, a leg, a foot and an arm in slices, at a
// grown person's measures (1.8 m tall, feet at y = 0, facing +z, the left side at +x; the bones are in
// human-shapes.js and none of them moves for this). The measures are the ones a figure sculptor works to:
// seen from the side a body is an S (the chest forward of the hollow of the back, the seat behind it, the calf
// behind the knee), seen from the front the shoulders slope from the neck, the trunk narrows from the armpits
// to the waist and widens again to the hips, and every limb tapers to its joints. Cloth hangs from the widest
// places and bridges the hollows. Like the rest of the sculpting it needs no three.js and runs in background
// workers. Kit use only.
import { Loft, ss, bump } from './field.js';

const abs = Math.abs;
// a slice: height, half width, its front and its back (z), where it is widest (z), how square in front and behind (2 round .. 4 boxy), its middle (x)
export const row = (y, w, zf, zb, zc, pf = 2.2, pb = pf, xc = 0) => [y, w, zf - zc, zc, xc, pf, zc - zb, pb];
// a loft's own slice at a height, grown a little, as a row for another loft (a waistband over a shirt)
export const over = (L, y, out, at = y) => { const s = L.sec(y); return [at, s[0] + out, s[1] + out, s[2], s[3], 2 + 2 * s[4], s[6] + out, 2 + 2 * s[7]]; };

// how thick and loose each kind of top is over a shirt, and how far it bridges the hollow of the back
export const easeOf = kind => kind === 'smock' ? .016 : kind === 'shirt' ? 0 : .007;
const hangOf = kind => kind === 'smock' ? .016 : kind === 'shirt' ? .003 : .009;

/**
 * The trunk in its top, from below the belt to the neck. b: the build ({ shoulders, chest, waist, hips, bust, neck }: 1 a man's).
 * The widest place is the shoulders, at the joints; the chest is deepest at the nipples and the back at the
 * shoulder blades, a little higher; the waist is the narrowest place and the back is hollow there; the top of
 * the shoulders slopes from the side of the neck down to the joint, and the arm's cap carries the line on.
 */
export function torsoOf(b, kind) {
  const W = b.waist, C = b.chest, SH = b.shoulders, HP = b.hips, bu = b.bust, nk = b.neck ?? 1, e = easeOf(kind), h = hangOf(kind), M = (W + C) / 2;
  return new Loft([
    row(.985, .162 * HP + e, .098 * W + e, -.120 * HP - e, -.008, 2.3, 2.5),
    row(1.03, .150 * W + e, .101 * W + e, -.102 * W - e - h * .5, 0, 2.3, 2.4),
    row(1.075, .1425 * W + e, .103 * W + e, -.088 * W - e - h, .004, 2.25, 2.3),                       // the waist
    row(1.12, .142 * M + e, .104 * M + e, -.085 * M - e - h, .006, 2.25, 2.3),
    row(1.17, .146 * C + e, .106 * C + e, -.090 * C - e - h * .6, .006, 2.3, 2.4),
    row(1.23, .153 * C + e, .111 * C + e + bu * .005, -.100 * C - e - h * .2, .004, 2.4, 2.5),
    row(1.30, .159 * C + e, .118 * C + e + bu * .016, -.109 * C - e, .002, 2.45, 2.6),              // the chest
    row(1.36, .163 * (C + SH) / 2 + e * .7, .113 * C + e + bu * .008, -.115 * C - e, -.004, 2.4, 2.6),   // under the arms; the shoulder blades behind
    row(1.41, .173 * SH + e * .3, .098 * C + e * .6, -.113 - e * .6, -.009, 2.3, 2.5),
    ...shoulderRows(SH, nk, e * .45),
  ]);
}
/**
 * The top of the trunk: one even slope from the side of the neck down and out over the shoulder joint, where it
 * ends just above the arm's cap, so the line of the shoulder carries over into the arm with no notch between them
 * (the end itself is round and lies inside the cap). Narrow or broad shoulders bring the end in or out with the
 * joints. out: grown by this much (cloth's ease).
 */
export function shoulderRows(SH, nk, out = 0) {
  const s = .176 * (SH - 1);
  return [
    row(1.44, .188 + s + out, .083 + out, -.105 - out, -.012, 2.2, 2.4), row(1.452, .1925 + s + out, .076 + out, -.102 - out, -.013, 2.15, 2.3), row(1.4605, .193 + s + out, .071 + out, -.0995 - out, -.0135, 2.1, 2.2),
    row(1.4665, .189 + s + out, .067 + out, -.097 - out, -.014, 2.1, 2.2), row(1.4707, .18 + s * .95 + out, .064 + out, -.095 - out, -.0145, 2.1, 2.2), row(1.4752, .17 + s * .9 + out, .061 + out, -.093 - out, -.015, 2.1, 2.2),
    row(1.4832, .152 + s * .75 + out, .056 + out, -.089 - out, -.016, 2.1, 2.2), row(1.4959, .124 + s * .5 + out, .05 + out, -.084 - out, -.017, 2.1, 2.1), row(1.508, .097 + s * .25 + out, .046 + out, -.08 - out, -.017, 2, 2),
    row(1.525, .076 + out, .044 + out, -.076 - out, -.017, 2, 2), row(1.56, .046 * nk + out, .026 + out, -.066 - out, -.02, 2, 2),   // (its top ends inside the neck)
  ];
}
/**
 * The round of the shoulder that stays on the trunk: the arm's cap lies a few millimetres outside it while the arm
 * hangs (so chest and back run up to the sleeve with only a seam between, no deep groove), and when the arm is
 * raised it is what is left of the shoulder under it. The left one; out as for shoulderRows().
 */
export const shoulderOf = (SH, out = 0) => ({ ball: [.049 + out, .04 + out, .052 + out], at: [.187 + .176 * (SH - 1), 1.42, -.013] });
/**
 * What a trunk's cloth shows of the body under it, as a height to add (metres; a fold function): the furrow of
 * the spine between the muscles of the back, the shoulder blades, the two sides of a chest and the dip between them.
 */
export function torsoForms(b) {
  const m = 1 - .8 * Math.min(1, b.bust);
  return (x, y, z) => {
    const ax = abs(x);
    if (z < 0) return -.0034 * bump(x, 0, .017) * ss(1.06, 1.14, y) * ss(1.47, 1.39, y) + .0036 * bump(ax, .088, .05) * bump(y, 1.39, .055) * ss(0, .03, -z);
    return m * (.003 * bump(ax, .078, .05) * bump(y, 1.318, .04) * ss(0, .03, z) - .0022 * bump(x, 0, .016) * bump(y, 1.325, .05)) - .0016 * bump(x, 0, .014) * ss(1.24, 1.2, y) * ss(1.09, 1.13, y);
  };
}

/**
 * A sleeve's slices, cuff to shoulder (the left arm, hanging straight down). LM: how thick the limbs are (1 a man's); e: the cloth over a shirt's.
 * An arm is deeper than it is wide above the elbow (the muscles lie in front and behind), the point of the elbow
 * stands out behind, the forearm is fullest a hand's width below the elbow and tapers to the wrist.
 */
export function sleeveRows(LM, e = 0) {
  const k = LM, c = e * .8;   // (a jacket's sleeve tapers less than the arm in it)
  return [
    row(.892, .0345 * k + c, .04 * k + c, -.032 * k - c, .004, 2.1, 2.1, .2), row(.93, .0355 * k + c, .0405 * k + c, -.0325 * k - c, .004, 2.1, 2.1, .2),
    row(.99, .0375 * k + e, .042 * k + e, -.037 * k - e, .002, 2.1, 2.1, .2), row(1.06, .042 * k + e, .042 * k + e, -.047 * k - e, -.004, 2.1, 2.1, .2),
    row(1.115, .044 * k + e, .0405 * k + e, -.0525 * k - e, -.007, 2.1, 2.1, .2),                    // the fullest of the forearm
    row(1.165, .0425 * k + e, .033 * k + e, -.059 * k - e, -.01, 2.1, 2.1, .1985),                     // the elbow
    row(1.21, .0445 * k + e, .0355 * k + e, -.0605 * k - e, -.012, 2.15, 2.15, .1975), row(1.27, .0475 * k + e, .0405 * k + e, -.0625 * k - e, -.012, 2.2, 2.2, .194),
    row(1.34, .0505 * k + e * .85, .0415 * k + e * .85, -.0665 * k - e * .85, -.012, 2.2, 2.2, .19), row(1.385, .0495 * k + e * .6, .0395 * k + e * .6, -.0655 * k - e * .6, -.012, 2.05, 2.05, .1875),   // into the shoulder's muscle (the cap rounds it over: capOf)
  ];
}
// the cap of the shoulder, round the joint: the sleeve's own top slice rounded over, its top at the end of the trunk's slope, so the line of the shoulder runs over it and down the arm
export const capOf = (LM, e = 0) => ({ ball: [.056 * LM + e * .7, .06 + e * .45, .0595 * LM + e * .7], at: [.187, 1.403, -.013] });

/**
 * The seat in its trousers, from where the legs part up to the waistband, which lies on the top. The hips are
 * widest at the top of the thighs; the seat stands out behind, in two rounds (seatRounds); the front is nearly flat.
 * under: worn under a tunic's skirt.
 */
export function seatOf(b, torso, under = false) {
  const HP = b.hips, up = under ? -.004 : .003;   // (under a tunic's skirt the trousers' top stays inside the cloth, or it showed as a dark line below the belt)
  return new Loft([
    row(.79, .06, .04, -.062, -.01, 2.2, 2.2), row(.812, .125 * HP, .07, -.097 * HP, -.01, 2.3, 2.3),   // (rounded underneath, between the legs)
    row(.835, .166 * HP, .086, -.114 * HP, -.01, 2.4, 2.4), row(.88, .1765 * HP, .092, -.126 * HP, -.012, 2.4, 2.5), row(.92, .178 * HP, .096, -.129 * HP, -.012, 2.4, 2.6),
    row(.96, .172 * HP, .099, -.124 * HP, -.01, 2.35, 2.6), over(torso, 1.0, under ? -.002 : .007), over(torso, 1.03, up), over(torso, 1.046, up),
  ]);
}
export const seatRounds = b => ({ ball: [.08 * b.hips, .088, .07 * b.hips], at: [.086 * b.hips, .912, -.07 * b.hips] });

/**
 * A trouser leg's slices from the knee up (the left leg), then `low`: the slices below the knee for what is
 * worn on the feet (lowRows). Trousers hang from the seat and the front of the thigh, break at the knee and
 * fall to the shoe; pressed flat, a leg is deeper seen from the side than it is wide. fl: breeches' flare.
 */
export function legRows(b, fl, low) {
  const LM = b.limbs, TH = (LM + b.hips) / 2;
  return [...low,
    row(.53, .0735 * LM, .079 * LM, -.086 * LM, -.002, 2.2, 2.2, .097),                                  // the knee
    row(.62, .08 * TH * fl, .087 * TH, -.098 * TH, -.004, 2.25, 2.25, .0965), row(.74, .088 * TH * fl, .097 * TH, -.112 * TH, -.006, 2.3, 2.3, .0955),
    row(.84, .0935 * TH * fl, .1 * TH, -.124 * TH, -.01, 2.3, 2.3, .094), row(.93, .085, .088, -.118, -.012, 2.3, 2.4, .088), row(1.0, .07, .08, -.1, -.008, 2.2, 2.2, .086)];
}
export function lowRows(b, kind) {
  const LM = b.limbs;
  if (kind === 'tall') return [row(.4, .046 * LM, .038 * LM, -.064 * LM, -.012, 2.1, 2.1, .0975), row(.452, .049 * LM, .044 * LM, -.067 * LM, -.01, 2.1, 2.1, .0975), row(.478, .0615 * LM, .063 * LM, -.08 * LM, -.007, 2.2, 2.2, .097)];   // (inside the boot below its rim)   // into a tall boot
  if (kind === 'gaiters') return [row(.29, .052 * LM, .046 * LM, -.078 * LM, -.016, 2.1, 2.1, .0975), row(.38, .0585 * LM, .052 * LM, -.086 * LM, -.014, 2.1, 2.1, .0975), row(.47, .065 * LM, .066 * LM, -.085 * LM, -.008, 2.2, 2.2, .097)];
  return [row(.075, .063 * LM, .067 * LM, -.077 * LM, -.005, 2.2, 2.2, .098), row(.2, .0635 * LM, .061 * LM, -.081 * LM, -.01, 2.2, 2.2, .098),
    row(.36, .0665 * LM, .062 * LM, -.087 * LM, -.013, 2.2, 2.2, .0975), row(.47, .0705 * LM, .071 * LM, -.086 * LM, -.008, 2.2, 2.2, .097)];
}
/** A boot's shaft, or a shoe's top, round the ankle and up the calf (which stands out behind, a third of the way down from the knee). */
export function shaftRows(kind, topY) {
  const foot = [row(.045, .041, .048, -.05, 0, 2.1, 2.1, .098), row(.09, .0385, .038, -.052, -.006, 2.1, 2.1, .098)];
  if (kind === 'tall') return [...foot, row(.16, .042, .039, -.063, -.011, 2.1, 2.1, .098), row(.3, .0535, .0445, -.081, -.017, 2.1, 2.1, .098), row(.37, .056, .047, -.082, -.017, 2.1, 2.1, .098), row(topY, .058, .054, -.073, -.01, 2.1, 2.1, .098)];
  const top = Math.max(topY, .14);
  return [...foot, row(top - .04, .04, .038, -.057, -.009, 2.1, 2.1, .098), row(top, .0445, .04, -.064, -.012, 2.1, 2.1, .098)];
}
/** A gaiter round the calf, over the boot's top. */
export const gaiterRows = LM => [row(.105, .0475, .047, -.062, -.008, 2.1, 2.1, .098), row(.2, .05, .0445, -.071, -.013, 2.1, 2.1, .098), row(.3, .0585 * LM, .05 * LM, -.086 * LM, -.017, 2.1, 2.1, .0975), row(.335, .0605 * LM, .054 * LM, -.087 * LM, -.016, 2.1, 2.1, .0975)];
/** The left foot in its boot: narrow at the heel, widest at the ball, a rounded cap over the toes, lower there than at the instep. */
export const FOOT = [
  { ball: [.037, .046, .05], at: [.098, .05, -.034] },
  { taper: [[.098, .062, -.01], [.1005, .044, .075]], r: [.036, .033] },
  { ball: [.0455, .031, .058], at: [.1015, .036, .1], rot: [0, .06, 0] },
  { ball: [.039, .028, .045], at: [.103, .033, .152], rot: [0, .06, 0] },
];
// everything above as it stands, for the number that names saved pieces
export const BODY_STAMP = [row, over, easeOf, hangOf, torsoOf, shoulderRows, shoulderOf, torsoForms, sleeveRows, capOf, seatOf, seatRounds, legRows, lowRows, shaftRows, gaiterRows].map(String).join('') + JSON.stringify(FOOT);
