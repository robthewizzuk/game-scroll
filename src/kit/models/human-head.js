// The head and neck of gs.models.human: a face sculpted from the skull out, at a grown person's measures.
// Its own space is the person's (metres, feet at y = 0, facing +z, the left side at +x); the numbers below are
// from the middle of the head (HC): y up from the line of the eyes, z forward. The measures are the ones a
// portrait sculptor works to: the eyes half way up the head, the face as wide as five eyes, the foot of the
// nose half way from the eyes to the chin, the mouth a third of the way from the nose to the chin, the ears
// from the brow to the foot of the nose, the jaw's corners under the ears and nearly as wide as the cheekbones.
// Like the rest of the sculpting it needs no three.js and runs in background workers. Kit use only.
import { Loft, ready, smin, smax, lumps, ss, bump } from './field.js';
import { row as slice, shoulderRows, neckRows, neckOpening } from './human-body.js';
export { ss, bump };

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, mx = Math.max, hyp = Math.hypot, pow = Math.pow;
export const HC = [0, 1.69, .008];   // the middle of the head
export const Hd = (x, y, z) => [x, HC[1] + y, HC[2] + z];
export const EYE = [.032, 0, .07];   // the middle of the left eye, from the middle of the head
// how far the mouth's line dips to its corners (a slope: much of one and it scowls), and how far its very ends turn up again
export const MOUTH_DIP = .02, MOUTH_UP = .0007;
/**
 * The left brow of a face (soft: 0 a man's .. 1 a woman's): [inner end, arch, tail] (each [x, y from the eyes, z]),
 * on the lower edge of the brow ridge, close over the eye (high on the forehead they look startled), the tail
 * no higher than the inner end (a brow that climbs to its tail scowls). A woman's stands a little higher and arches more.
 */
export const browOf = soft => [[.013, .0205 + .0012 * soft, .0925], [.0325 + .0015 * soft, .0238 + .0022 * soft, .0885], [.0535, .0186 + .001 * soft, .0735]];
// the line between the lips (y from the eyes) and half its length; the inner corner of the left eye (where the lids meet by the nose: pink, not white)
export const MOUTH = { y: -.0672, half: .0255 }, CORNER = [EYE[0] - .0138, -.0012];

// a slice of the face: y from the eyes, half width, the front and the back of it (z), where it is widest (z), how square in front and behind
const row = (y, w, zf, zb, zc, pf = 2.2, pb = 2) => [HC[1] + y, w, zf - zc, HC[2] + zc, 0, pf, zc - zb, pb];
// how far outside a ball with three radii a point is (from the ball's middle)
const ball3 = (x, y, z, rx, ry, rz) => { const X = x / rx, Y = y / ry, Z = z / rz, k0 = hyp(X, Y, Z), k1 = hyp(X / rx, Y / ry, Z / rz); return k1 < 1e-6 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1; };

/**
 * The opening between the lids of the left eye, as a shape to carve away: an almond (two arcs that meet in
 * a point at each corner, the outer corner a little higher than the inner), carved straight back past the
 * front of the eyeball, which stands in it (lids carved only as deep as they are thick would be thinner than
 * the sculpting's grid, and come out ragged); its floor comes up to the skin at the corners, where the eyeball
 * does not reach: by the nose there is a little pink flesh. open: 1 as wide as an eye is at rest.
 */
export function eyeOpening(open) {
  const ex = EYE[0], ey = HC[1] + EYE[1], ez = HC[2] + EYE[2], rim = eyeRim(open), w = rim.w, cx = rim.cx;
  const field = (x, y, z) => mx(rim(x, y - HC[1])[0], ez + .0035 + .75 * mx(0, ex - .01 - x) + .5 * mx(0, x - ex - .01) - z);
  return { field, lo: [cx - w - .003, ey - .009, ez], hi: [cx + w + .003, ey + .01, ez + .03] };
}
/**
 * The outline of the left eye's opening, seen from in front: a function (x, y from the eyes) => [how far outside
 * the opening the point is (metres; negative inside), 1 over the upper lid's edge or 0 under the lower one's].
 * The sculpting carves by it and the painting draws the line of the lashes along it. (The same array each call.)
 */
export function eyeRim(open) {
  const w = .0143, cx = EYE[0] - .001, ct = cos(.075), st = sin(.075), o = [0, 0];
  const hu = .0034 * open, hl = .0046 * open, R1 = (w * w + hu * hu) / (2 * hu), c1 = hu - R1, R2 = (w * w + hl * hl) / (2 * hl), c2 = R2 - hl;
  const rim = (x, hy) => { const dx = x - cx, dy = hy - EYE[1], u = ct * dx + st * dy, v = ct * dy - st * dx, a = hyp(u, v - c1) - R1, b = hyp(u, v - c2) - R2; o[0] = mx(a, b); o[1] = a > b ? 1 : 0; return o; };
  rim.w = w; rim.cx = cx; return rim;
}

const M3 = [0, 0, 0];
/**
 * The lips at a point of the face (x, and y from the eyes), for a face f ({ lips, soft }): [how far they stand
 * out of the round of the mouth (metres; a dip under the nose and at each corner is negative), how much of the
 * lips' colour (0..1), how much of the dark line between them (0..1)]. The sculpting and the painting both ask
 * this, so the colour lies where the shape is. The upper lip is a bow that thins to the corners; the lower
 * is fuller and shorter. (The same array each call unless given one.)
 */
export function mouthAt(x, hy, f, out = M3) {
  const so = f.soft, LP = f.lips, half = MOUTH.half - .002 * so, u = abs(x), e = u / half, v = hy - (MOUTH.y - MOUTH_DIP * u + MOUTH_UP * ss(.7, 1.1, e));
  let rise = 0, lip = 0;
  if (e < 1.4 && v < .014 && v > -.016) {
    const T = e < 1 ? pow(1 - e * e, .6) : 0, Tl = e < 1 ? pow(1 - pow(e, 2.4), .7) : 0;
    // (each lip rises from the line between them in a round, not a crease: a crease that small would mesh as a row of teeth)
    if (v >= 0) { const H = .0072 * LP * T * (1 - .16 * bump(u, 0, .0035)); if (H > 1e-5) { const t = v / H; if (t < 1) rise = .0026 * (.5 + .5 * T) * ss(0, .45, t) * ss(1, .55, t); lip = ss(1.1, .78, t); } }
    else { const H = .0094 * LP * Tl; if (H > 1e-5) { const t = -v / H; if (t < 1) rise = .0032 * (.5 + .5 * Tl) * ss(0, .42, t) * ss(1, .52, t); lip = ss(1.1, .78, t); } }
    lip *= ss(1, .9, e);
    rise -= .001 * bump(u, half + .0012, .0028) * bump(v, 0, .0035);   // a dimple at each corner
  }
  if (hy > -.064 && hy < -.045) rise -= .0008 * bump(x, 0, .0028) * ss(-.046, -.051, hy) * ss(-.0635, -.0595, hy);   // the dip from the nose to the bow of the lip
  out[0] = rise; out[1] = lip; out[2] = e < 1.4 ? bump(v, 0, .002) * ss(1, .78, e) : 0;
  return out;
}

// the mouth: the round of the teeth under the skin, with the lips standing out of it
function mouthShape(f) {
  const so = f.soft, cy = HC[1] - .0645, cz = HC[2] + .071, rx = .027 - .003 * so, ry = .0185 - .0015 * so, rz = .024, o = [0, 0, 0];
  return {
    field(x, y, z) { const d = ball3(x, y - cy, z - cz, rx, ry, rz); return z < cz || d < -.008 || d > .012 ? d : d - mouthAt(x, y - HC[1], f, o)[0]; },
    lo: [-rx - .003, cy - ry - .003, cz - rz], hi: [rx + .003, cy + ry + .003, cz + rz + .004],
  };
}

// the edge of the hair: how high it is (from the eyes) at each angle round the head (degrees from straight ahead):
// across the forehead, back at the temples, down in front of the ear (a man's sideburn), over the ear, down behind it, across the nape
const LINE_M = [[0, .072], [24, .076], [42, .072], [52, .06], [59, .042], [65, .028], [70, .018], [73.5, -.008], [81, -.008], [84.5, .015], [90, .021], [100, .022], [107, .016], [113, -.01], [122, -.044], [135, -.06], [180, -.064]];
const LINE_F = [[0, .068], [22, .07], [40, .064], [54, .044], [64, .02], [72, .002], [80, -.006], [100, .002], [108, -.03], [118, -.066], [135, -.082], [180, -.086]];
const lineAt = (L, deg) => { let i = 0; while (i < L.length - 2 && deg > L[i + 1][0]) i++; const a = L[i], b = L[i + 1]; return a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, (deg - a[0]) / (b[0] - a[0]))); };
/**
 * Hair that grows out of the head: the head's own shape (base: how far outside it a point is) made thicker
 * by the hair's length inside the hairline, thinning to nothing at it (under the skin beyond it), combed in
 * streaks from the forehead back and down the sides. th: [length on top, at the sides]; fem: a woman's hairline.
 */
function hairShape(base, th, fem) {
  const L = fem ? LINE_F : LINE_M, z0 = HC[2] - .0125, y0 = HC[1];   // (angles are taken round a line up through the ears' fronts)
  return {
    field(x, y, z) {
      const d = base(x, y, z); if (d > .03 || d < -.02) return d + .004;
      // (well outside the hairline there is none of it at all: just under the skin it would fill the openings carved for the eyes)
      const hy = y - y0, zr = z - z0, ax = abs(x), deg = Math.atan2(ax, zr) * 180 / PI, up = hy - lineAt(L, deg), m = ss(-.002, .011 + .014 * ss(62, 40, deg) + (fem ? .016 * ss(95, 115, deg) : 0), up);
      if (m <= 0) return d + .004 + .05 * ss(-.004, -.016, up);
      const top = ss(.05, .09, hy), streak = top * lumps(x * 190, 2.5, z * 14) * .0011 + (1 - top) * lumps(deg * .58, y * 16, 7.5) * .0006;
      return d - (th[1] + (th[0] - th[1]) * top + streak) * m + .004 * (1 - m);
    },
    lo: [-.092, y0 - .08, HC[2] - .125], hi: [.092, y0 + .135, HC[2] + .1],
  };
}
// A woman's short hair: a bob. A round of hair standing off the skull, cut to the jaw beside the face and shorter at the nape, open at the face
// in an arch that leans to one side (a fringe swept across the brow), with a parting on the other. One shape, opening and all: a cut
// of its own would have taken the face with it.
function bobShape() {
  const c = Hd(0, .03, -.01), ca = cos(.26), sa = sin(.26);
  return {
    field(x, y, z) {
      const py = y - c[1], d = smax(ball3(x - c[0], py < 0 ? py * .5 : py, z - c[2], .0935, .1, .11), HC[1] - .073 - .2 * (z - HC[2]) - y, .012), ex = x - .01, ey = y - (HC[1] - .042);   // (below its widest it hangs nearly straight down)
      return smax(d, -ball3(ca * ex + sa * ey, ca * ey - sa * ex, z - (HC[2] + .092), .063, .098, .078), .007);
    },
    // combed from the parting: streaks from front to back on top, down the sides and the back
    folds(x, y, z) {
      const hy = y - HC[1], top = ss(.06, .1, hy), deg = Math.atan2(abs(x), z - HC[2] + .0125) * 180 / PI;
      return top * lumps(x * 150, 2.5, z * 12) * .0016 + (1 - top) * lumps(deg * .5, y * 9, 7.5) * .0018 - .003 * bump(x, .027, .0045) * ss(-.03, .03, z - HC[2]) * ss(.07, .1, hy);
    },
    foldMax: .004, lo: [-.1, HC[1] - .1, HC[2] - .13], hi: [.1, HC[1] + .14, HC[2] + .11],
  };
}

/**
 * The head and neck. a: { face: { jaw, chin, brow, nose, lips, cheeks, eyes (1 = average), soft (0 a man's .. 1 a woman's) },
 * neck, hair ('short' | 'bun' | 'long' | 'bald'), moustache, hat, foot }; ghosts: what a hat shades (shapes).
 * foot: under a round-necked top, how broad the shoulders are (a build's `shoulders`): the skin then runs on
 * down from the neck over its foot (the sweep of muscle up from each shoulder, the collar bones, the pit of the
 * throat between them) to a little way under the top's edge, all one skin with the face. (As two pieces, a neck
 * standing in a trunk's own skin, the two met in a line round the neck with the light falling differently on
 * either side of it.) 0: the neck stands in a collar, and ends inside the trunk.
 */
export function head(a, ghosts = []) {
  const f = a.face, S = [], A = s => S.push({ slot: 'skin', ...s }), so = f.soft, J = f.jaw, CH = f.chin, BR = f.brow, NS = f.nose, CK = f.cheeks, nk = a.neck;
  // ---- the mass of it: the face in slices from under the chin to the forehead, widest at the cheekbones, the jaw's
  // corners under the ears (each slice ends at the back of the jaw: behind it is the neck), and the skull, a ball over
  // and behind it (the slices end inside the ball: the top of the forehead and the crown are the ball's own round)
  const CJ = (CH + J) / 2, sq = .3 * so;   // (a woman's jaw is rounder across)
  const face = new Loft([
    row(-.1195, .0105 * CH, .074, .052, .064), row(-.114, .021 * CH, .0815, .034, .058, 2.4 - sq), row(-.107, .0315 * CJ, .0855, .016, .046, 2.6 - sq), row(-.097, .0435 * J, .0865, -.003, .028, 2.6 - sq),
    row(-.086, .054 * J, .0855, -.017, .012, 2.5 - sq), row(-.076, .0575 * (.15 + .85 * J), .0835, -.022, .006, 2.4 - sq), row(-.066, .06 * (.4 + .6 * J), .082, -.026, .005, 2.3 - sq / 2),
    row(-.046, .064 * (.7 + .3 * J) + .003 * (CK - 1) * 10, .084, -.034, .006, 2.25 + .1 * so), row(-.02, .0675, .0865, -.042, .008, 2.25 + .1 * so), row(0, .069, .088, -.05, .006, 2.3),
    row(.022, .0705, .0905, -.06, 0, 2.35), row(.045, .0725, .0915, -.08, -.01, 2.3), row(.068, .066, .081, -.09, -.014, 2.2), row(.084, .05, .062, -.08, -.014),
  ]);
  // the neck: as deep as it is wide and nearly as wide as the jaw, standing behind it (its front a hand's width back from the chin), wider at its foot
  const neck = new Loft(neckRows(nk));
  const base = [{ loft: face, blend: 0 }, { ball: [.0755, .09, .1], at: Hd(0, .026, -.006), blend: .008 }, { loft: neck, blend: .014 }];
  for (const s of base) A(s);
  if (a.foot) {
    // the top of the trunk as the trunk has it (a hair lower: cloth lies on it, and lower still by the top's edge, where the skin goes in under the
    // cloth), as far as a little beyond the opening of the top, where it ends under the cloth. Above where its slope runs into the neck it is cut off flat, inside the neck, so its pull on the neck's skin dies away evenly up
    // the neck (left to end where the trunk's own does, just inside that skin, it left a line round the neck: a loft's measure is not smooth across
    // its last slice, which is why one more slice is put on top here, out of the way).
    const top = new Loft([...shoulderRows(a.foot, nk, -.0004), slice(1.59, .046 * nk - .026, .0106, -.0574, -.022, 2, 2)]);
    A({ field: (x, y, z) => { const e = neckOpening(x, y, z); return smax(mx(top.d(x, y, z) + .0022 * ss(-.006, -.001, e), e - .005), y - 1.546, .012); }, lo: [-.1, 1.44, -.105], hi: [.1, 1.56, .105], blend: .028 });
    A({ taper: [[.017, 1.4795, .0445], [.064, 1.487, .037]], r: [.0071, .0056], mirror: true, blend: .014 }); A({ ball: [.014, .008, .006], at: [0, 1.487, .057], cut: true, blend: .018 });
  }
  A({ taper: [Hd(.012, .0215, .0855), Hd(.05, .024, .067)], r: [.0092 * BR, .007 * BR], mirror: true, blend: .016 });   // brow ridge
  A({ ball: .0092 * BR, at: Hd(0, .0195, .083), blend: .014 });
  A({ ball: [.014, .0105, .011], at: Hd(.047, -.016, .0575), mirror: true, blend: .026 });                               // cheekbones
  // ---- eyes: a socket under the brow, the lids a shell over the eyeball that fills it, a fold of skin over the upper lid, and the opening between the lids
  A({ ball: [.0195, .0165, .0115], at: Hd(EYE[0] - .0002, .0035, .09), mirror: true, cut: true, blend: .012 });
  S.push({ ball: [.0158, .0138, .0138], at: Hd(EYE[0] - .0008, 0, EYE[2]), mirror: true, slot: 'lid', blend: .006 });
  A({ taper: [Hd(EYE[0] - .0135, .0088, .0745), Hd(EYE[0] + .001, .0128, .0752)], r: [.003, .0036], mirror: true, blend: .003 });
  A({ taper: [Hd(EYE[0] + .001, .0128, .0752), Hd(EYE[0] + .0155, .0088, .0685)], r: [.0036, .003], mirror: true, blend: .003 });
  S.push({ ...eyeOpening(f.eyes), mirror: true, cut: true, slot: 'lash', blend: .0022 });
  // ---- nose: a wedge standing out of the face from between the eyes (the bridge, with its flanks), the tip, the wings beside it, the nostrils under them
  A({ taper: [Hd(0, .004, .0815), Hd(0, -.026, .1055)], r: [.0054 - .0008 * so, .0074 * NS], blend: .008 });
  A({ ball: [.0125 * NS, .0235, .0095], at: Hd(0, -.0165, .0872), rot: [-.56, 0, 0], blend: .011 });
  A({ ball: [.0088 * NS, .0078 * NS, .0085 * NS], at: Hd(0, -.0345, .108), blend: .008 });
  A({ ball: [.0068 * NS, .0062, .0082], at: Hd(.0108 * NS, -.0395, .097), mirror: true, blend: .007 });
  A({ taper: [Hd(0, -.0385, .1105), Hd(0, -.0428, .0925)], r: [.0034, .004], blend: .005 });
  A({ ball: [.0042, .0034, .0062], at: Hd(.0064, -.0452, .1005), rot: [.5, 0, .2], mirror: true, cut: true, blend: .003 });
  // ---- mouth: the lips on the round of the teeth; the chin under it
  A({ ...mouthShape(f), blend: .013 });
  A({ ball: [.0175 * CH, .0125 * CH, .012], at: Hd(0, -.1025, .0745 - .0015 * so), blend: .01 });
  // ---- ears: a shell held out a little from the head behind the jaw, wide at the top and narrow at the lobe, its rim rolled, a bowl in the middle
  { const at = Hd(.07, -.012, -.006), sp = { at, rot: [0, -.3, -.1] }, E = (s, more) => A({ ...s, space: sp, mirror: true, ...more }), P = (x, y, z) => [at[0] + x, at[1] + y, at[2] + z];
    E({ ball: [.0038, .027, .0155], at: P(.004, .003, -.012), blend: .006 }); E({ ball: [.004, .007, .0075], at: P(.003, -.0225, -.008), blend: .006 });
    E({ torus: [.0165, .0026], at: P(.0052, .008, -.012), rot: [0, 0, PI / 2], blend: .0035 });
    E({ taper: [P(.0066, .018, -.0145), P(.0066, -.006, -.017)], r: .0026, blend: .003 }); E({ ball: [.0028, .004, .003], at: P(.0035, -.004, .002), blend: .003 });
    E({ ball: [.0035, .0085, .0065], at: P(.0078, .0005, -.0075), cut: true, blend: .004 }); }
  // ---- neck: the two cords from behind the jaw's corners (they start inside the neck there) to the breastbone, a man's Adam's apple
  A({ taper: [Hd(.047 * nk, -.045, -.034), [.02 * nk, 1.5, .03]], r: [.0105 * (1 - .3 * so), .012 * (1 - .3 * so)], mirror: true, blend: .02 + .01 * so });
  if (so < .5) A({ ball: .009, at: [0, 1.553, .031], blend: .018 });
  // ---- hair: cropped close under a hat, a man's short back and sides, a woman's lower at the temples (over the tops of her ears) and at the nape:
  // tied back in a bun, long down her back, or short in a bob that stands off it
  const hs = a.hair, fem = so > .5;
  if (hs && hs !== 'bald') {
    const B = ready(base), skull = (x, y, z) => { let d = 1e9; for (const s of B) d = smin(d, s.d(x, y, z), s.k); return d; };
    const bob = fem && hs === 'short' && !a.hat, th = a.hat ? [.0028, .0028] : !fem ? [.0066, .004] : hs === 'long' ? [.0105, .0095] : [.0055, .005];
    S.push({ ...hairShape(skull, th, fem), slot: 'hair', blend: .003 });
    if (bob) {
      // (its edge is an outline of its own: the line where the surface stops being the bob's and becomes the face's, made straight)
      const U = ready(S.filter(s => !s.paint && !s.ghost)), b = bobShape(), near = (s, x, y, z) => x > s.lo[0] - .02 && x < s.hi[0] + .02 && y > s.lo[1] - .02 && y < s.hi[1] + .02 && z > s.lo[2] - .02 && z < s.hi[2] + .02;
      const under = (x, y, z) => { let d = 1e9; for (const s of U) if (near(s, x, y, z)) d = s.cut ? smax(d, -s.d(x, y, z), s.k) : smin(d, s.d(x, y, z), s.k); return d; };
      S.push({ ...b, m: (x, y, z) => b.field(x, y, z) - under(x, y, z), out: .002, slot: 'hair', blend: .004 });
    }
    if (hs === 'bun') S.push({ ball: .034, at: Hd(0, .034, -.108), slot: 'hair', lumpy: [.011, .0022], blend: .012 });
    if (hs === 'long') S.push({ ball: [.085, .12, .06], at: Hd(0, -.07, -.075), slot: 'hair', lumpy: [.011, .0026], blend: .02 });
  }
  // brows painted on the ridge; a moustache stands a little proud
  const bw = 1 - .3 * so, BROW = browOf(so);   // a woman's are finer
  S.push({ taper: [Hd(...BROW[0]), Hd(...BROW[1])], r: [.0036 * bw, .0034 * bw], mirror: true, slot: 'brow', paint: true }, { taper: [Hd(...BROW[1]), Hd(...BROW[2])], r: [.0034 * bw, .0021 * bw], mirror: true, slot: 'brow', paint: true });
  if (a.moustache) S.push({ ball: [.019, .0045, .0055], at: Hd(.011, -.0552, .0885), rot: [0, .3, -.18], mirror: true, slot: 'brow', lumpy: [.004, .001], blend: .002 });
  // the hat stands over the face: a brim's shadow on the brow
  for (const g of ghosts) S.push({ ...g, ghost: true, slot: null });
  return S;
}
// (the text of all that shapes a head, for the sculpting's version stamp)
export const HEAD_STAMP = [row, ball3, eyeOpening, eyeRim, mouthAt, mouthShape, lineAt, hairShape, bobShape, browOf, head].map(String).join('') + JSON.stringify([HC, EYE, MOUTH, MOUTH_DIP, MOUTH_UP, CORNER, LINE_M, LINE_F]);
