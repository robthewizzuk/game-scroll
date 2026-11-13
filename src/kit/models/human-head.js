// The head and neck of gs.models.human: a face sculpted from the skull out, at a grown person's measures.
// Its own space is the person's (metres, feet at y = 0, facing +z, the left side at +x); the numbers below are
// from the middle of the head (HC): y up from the line of the eyes, z forward. The measures are the ones a
// portrait sculptor works to: the eyes half way up the head, the face as wide as five eyes, the foot of the
// nose half way from the eyes to the chin, the mouth a third of the way from the nose to the chin, the ears
// from the eyes to the foot of the nose, the jaw's corners under the ears and nearly as wide as the cheekbones.
// Like the rest of the sculpting it needs no three.js and runs in background workers. Kit use only.
import { Loft, ready, smin, smax, lumps, ss, bump } from './field.js';
import { fitAt, FIT_MAX, FIT_DATA, FIT_KIN, kinTable } from './human-fit.js';
import { row as slice, shoulderRows, neckRows, neckOpening } from './human-body.js';
import { gnmHead, gnmMarks, meshField, GNM_HASH } from './human-gnm.js';
export { ss, bump };

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, mx = Math.max, hyp = Math.hypot, pow = Math.pow;
export const HC = [0, 1.69, .008];   // the middle of the head
export const Hd = (x, y, z) => [x, HC[1] + y, HC[2] + z];
// The face is a little simpler and friendlier than life, the way a good character model is, because a head this plain with every measure
// true to life looks like a mask. The eyes are a tenth bigger (ES: every measure of an eye, its lids and its socket is multiplied by it)
// and open taller, with their irises; the chin is shorter and the jaw narrows to it; the brow ridge, the sockets and the nose are softer.
// What is too fine to sculpt (brows, lashes, the lips' colour) is painted: human-paint.js.
export const ES = 1.1;
/** A face's own eye scale: a real face (f.real) has eyes at life size; the clean, friendlier face's are a tenth bigger (ES). */
export const esOf = f => f?.es ?? ES;
export const EYE = [.0335, 0, .071];   // the middle of the left eye, from the middle of the head
/** The middle of a face's left eye (from the middle of the head): a GNM face's own (human-gnm.js gnmMarks), else EYE. */
export const eyeOf = f => f?.gnm?.eye || EYE;
// how far the mouth's line dips to its corners (a slope: much of one and it scowls), and how far its very ends turn up again
export const MOUTH_DIP = .02, MOUTH_UP = .0007;
/**
 * The left brow of a face (soft: 0 a man's .. 1 a woman's): [inner end, arch, tail] (each [x, y from the eyes, z]),
 * on the lower edge of the brow ridge, close over the eye (high on the forehead they look startled), the tail
 * no higher than the inner end (a brow that climbs to its tail scowls). A woman's stands a little higher and arches more.
 */
// (f: a GNM face's brows lie over its own eyes, as much nearer the middle as they are)
export const browOf = (soft, f = null) => { const k = f?.gnm ? f.gnm.eye[0] / EYE[0] : 1; return [[.0135 * k, .0214 + .0012 * soft, .0925], [(.036 + .0015 * soft) * k, .0248 + .0022 * soft, .0885], [.0555 * k, .0208 + .001 * soft, .0725]]; };
/** The wing of a face's left nostril, seen from in front ([x, y from the eyes]): a GNM face's own, else where the clean and real faces' lie. */
export const noseOf = f => f?.gnm ? [f.gnm.nose[0] - .0065, f.gnm.nose[1]] : [.0108, -.039];
// the line between the lips (y from the eyes) and half its length; the inner corner of the left eye (where the lids meet by the nose: pink, not white)
export const MOUTH = { y: -.0655, half: .0235 }, CORNER = [EYE[0] - .0138 * ES, -.0012 * ES];
/** Half the width of a face's mouth: a real face's is as wide as a real mouth (about the distance between the pupils, 5.4 cm on a man,
 * 5 on a woman, measured faces' averages); the clean face's is smaller. */
export const mouthHalf = f => f.gnm ? f.gnm.lip.half : (MOUTH.half - .002 * (f.soft || 0)) * (f.real ? 1.15 : 1);
// (a GNM face's mouth, human-gnm.js gnmMarks: where its lips meet and the edges of their red, measured at U along half the mouth: v at x)
const LIP_U = [0, .2, .4, .6, .8, .92, 1];
const lipAt = (g, k, x) => { const L = g.lip[k], e = Math.min(1, abs(x) / g.lip.half); let i = 0; while (i < LIP_U.length - 2 && e > LIP_U[i + 1]) i++; return L[i] + (L[i + 1] - L[i]) * (e - LIP_U[i]) / (LIP_U[i + 1] - LIP_U[i]); };
/** Where a face's lips meet in the middle (y from the eyes). */
export const mouthY = f => f?.gnm ? f.gnm.lip.line[0] : MOUTH.y;

// a slice of the face: y from the eyes, half width, the front and the back of it (z), where it is widest (z), how square in front and behind
const slice0 = (y, w, zf, zb, zc, pf = 2.2, pb = 2) => [HC[1] + y, w, zf - zc, HC[2] + zc, 0, pf, zc - zb, pb];
// how far outside a ball with three radii a point is (from the ball's middle)
const ball3 = (x, y, z, rx, ry, rz) => { const X = x / rx, Y = y / ry, Z = z / rz, k0 = hyp(X, Y, Z), k1 = hyp(X / rx, Y / ry, Z / rz); return k1 < 1e-6 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1; };

/**
 * The opening between the lids of the left eye, as a shape to carve away: an almond (two arcs that meet in
 * a point at each corner, the outer corner a little higher than the inner), carved straight back past the
 * front of the eyeball, which stands in it (lids carved only as deep as they are thick would be thinner than
 * the sculpting's grid, and come out ragged); its floor comes up to the skin at the corners, where the eyeball
 * does not reach: by the nose there is a little pink flesh. open: 1 as wide as an eye is at rest.
 */
export function eyeOpening(open, es = ES, tilt = 0, real = false, g = null) {
  const E = g?.eye || EYE, ex = E[0], ey = HC[1] + E[1], ez = HC[2] + E[2], rim = eyeRim(open, es, tilt, real, g), w = rim.w, cx = rim.cx;
  const ni = real ? .0145 : .01, field = (x, y, z) => mx(rim(x, y - HC[1])[0], ez + .0035 * es + .75 * mx(0, ex - ni * es - x) + .5 * mx(0, x - ex - .01 * es) - z);
  const R = g?.rim, ry0 = R ? HC[1] + R.cy - mx(R.hu, R.hl) * open - .003 - abs(tilt + R.ang) * w : ey - .009 * es - abs(tilt) * w, ry1 = R ? HC[1] + R.cy + mx(R.hu, R.hl) * open + .003 + abs(tilt + R.ang) * w : ey + .01 * es + abs(tilt) * w;
  return { field, lo: [cx - w - .003, ry0, ez], hi: [cx + w + .003, ry1, ez + .03 * es] };
}
/**
 * The outline of the left eye's opening, seen from in front: a function (x, y from the eyes) => [how far outside
 * the opening the point is (metres; negative inside), 1 over the upper lid's edge or 0 under the lower one's].
 * The sculpting carves by it and the painting draws the line of the lashes along it. (The same array each call.)
 */
// (a real face's opening is as long as a real eye's, 3 cm from corner to corner, measured faces' averages, its inner corner close by the
// nose: 3.3 cm between the two; the clean face's is shorter, and further from the nose. And lower: at rest a real upper lid covers the top
// of the iris; open as wide as the clean face's, a real one stared)
// g: a GNM face's own (f.gnm, human-gnm.js gnmMarks): its opening as GNM's head has it, the corners where they are and each lid as far
// from the line between them (open and tilt as for any face).
export function eyeRim(open, es = ES, tilt = 0, real = false, g = null) {
  const ES = es, R = g?.rim, w = R ? R.w : (real ? .0152 : .0143) * ES, cx = R ? R.cx : EYE[0] - (real ? .0022 : .001) * ES, cy = R ? R.cy : EYE[1], an = (R ? R.ang : .075) + tilt, ct = cos(an), st = sin(an), o = [0, 0];
  const hu = (R ? R.hu : (real ? .0037 : .0044) * ES) * open, hl = (R ? R.hl : (real ? .0048 : .0052) * ES) * open, R1 = (w * w + hu * hu) / (2 * hu), c1 = hu - R1, R2 = (w * w + hl * hl) / (2 * hl), c2 = R2 - hl;
  const rim = (x, hy) => { const dx = x - cx, dy = hy - cy, u = ct * dx + st * dy, v = ct * dy - st * dx, a = hyp(u, v - c1) - R1, b = hyp(u, v - c2) - R2; o[0] = mx(a, b); o[1] = a > b ? 1 : 0; return o; };
  // how much of the upper lid a point is (0..1): all of it along the lid's edge and a little way up, none of it a finger's width above; less towards
  // the corners, where the lids meet and nothing moves. T: for strips across the eye from its inner corner out, the share of the lid's whole turn
  // that brings its edge down onto the lower lid's there (lidPlan() measures it on the mesh; without it, by how tall the opening was drawn)
  rim.lid = (x, hy, T) => {
    const dx = x - cx, dy = hy - cy, u = ct * dx + st * dy, v = ct * dy - st * dx; if (abs(u) >= w) return 0;
    const a = hyp(u, v - c1) - R1; if (a <= -.0016 * ES || a >= .0105 * ES) return 0;
    let lat;
    if (T) { const q = (u / w * .5 + .5) * T.length - .5, i = Math.floor(q), t = q - i, A = i < 0 ? 0 : T[i], B = i + 1 >= T.length ? 0 : T[i + 1]; lat = i < 0 ? A + (B - A) * (t * 2 - 1) : i + 1 >= T.length ? A * (1 - t * 2) : A + (B - A) * t; }
    else lat = (c1 + Math.sqrt(R1 * R1 - u * u) - c2 + Math.sqrt(R2 * R2 - u * u)) / (hu + hl);
    return mx(0, lat) * ss(-.0016 * ES, -.0004 * ES, a) * ss(.0105 * ES, .0012 * ES, a);
  };
  // (for lidPlan: how far across the opening a point is, -1 at the inner corner .. 1 at the outer; how far outside the upper edge, and the lower)
  rim.at = (x, hy, out) => { const dx = x - cx, dy = hy - cy, u = ct * dx + st * dy, v = ct * dy - st * dx; out[0] = u / w; out[1] = hyp(u, v - c1) - R1; out[2] = hyp(u, v - c2) - R2; return out; };
  // (a point on the upper lid's edge (upper) or the lower's, t: -1 at the inner corner .. 1 at the outer: [x, y from the eyes])
  rim.edge = (t, upper, out) => { const u = t * w, v = upper ? c1 + Math.sqrt(R1 * R1 - u * u) : c2 - Math.sqrt(R2 * R2 - u * u); out[0] = cx + ct * u - st * v; out[1] = cy + st * u + ct * v; return out; };
  rim.w = w; rim.cx = cx; return rim;
}
/** The outline of a face's left eye opening (eyeRim) as that face has it: its size, how open, how tilted. */
export const rimOf = f => eyeRim(f.eyes, esOf(f), f.tilt || 0, !!f.real, f.gnm);

const M3 = [0, 0, 0];
/**
 * The lips at a point of the face (x, and y from the eyes), for a face f ({ lips, soft }): [how far they stand
 * out of the round of the mouth (metres; a dip under the nose and at each corner is negative), how much of the
 * lips' colour (0..1), how much of the dark line between them (0..1)]. The sculpting and the painting both ask
 * this, so the colour lies where the shape is. The upper lip is a bow that thins to the corners; the lower
 * is fuller and shorter. (The same array each call unless given one.)
 */
export function mouthAt(x, hy, f, out = M3) {
  if (f.gnm) {   // (a GNM face: its lips' red as its head has it, from where they meet to its edges; its shape is the head's own)
    const g = f.gnm, e = abs(x) / g.lip.half, line = lipAt(g, 'line', x), v = hy - line; let lip = 0;
    if (e < 1.05 && v < .014 && v > -.016) {
      if (v >= 0) { const H = lipAt(g, 'up', x) - line; if (H > 2e-4) lip = ss(1.05, .93, v / H); }
      else { const H = line - lipAt(g, 'dn', x); if (H > 2e-4) lip = ss(1.05, .92, -v / H); }
      lip *= ss(1, .9, e);
    }
    // (the line between them fine and dark: GNM's lips meet in a crease too shallow for the sculpting's grid to shade, so it is in the paint;
    // on to the corners, where the lips' meeting runs back into the cheek)
    out[0] = 0; out[1] = lip; out[2] = e < 1.4 ? (.85 * bump(v, 0, .0008) + .3 * bump(v, 0, .002)) * ss(1.08, .85, e) : 0;
    return out;
  }
  const so = f.soft, LP = f.lips, half = mouthHalf(f), u = abs(x), e = u / half, v = hy - (MOUTH.y - MOUTH_DIP * u / (f.real ? 1.15 : 1) + MOUTH_UP * ss(.7, 1.1, e));
  let rise = 0, lip = 0;
  if (e < 1.4 && v < .014 && v > -.016) {
    const T = e < 1 ? pow(1 - pow(e, 1.25), .85) : 0, Tl = e < 1 ? pow(1 - e * e, .85) : 0;   // (the upper lip runs to a point at each corner; the lower is a fuller round)
    // (each lip rises from the line between them in a round, not a crease: a crease that small would mesh as a row of teeth; and towards the
    // corners, where a lip is thinner than the sculpting's grid can carry, it lies flat and is paint alone)
    // (a real upper lip's bow: a dip in the middle and a peak each side of it; and each lip's border stands a hair proud of the skin round it,
    // the line a real lip is drawn by: a soft colour fading out over the last fifth of a lip had read as a smudge of lipstick)
    const bow = f.real ? 1 - .26 * bump(u, 0, .0026) + .07 * bump(u, .0054, .0026) : 1 - .2 * bump(u, 0, .0036), edge = f.real ? .00028 : 0;
    if (v >= 0) { const H = .0078 * LP * T * bow; if (H > 1e-5) { const t = v / H; if (t < 1.25) rise = .0019 * (.5 + .5 * T) * ss(.002, .0055, H) * ss(0, .36, t) * ss(1.25, .4, t) + edge * T * bump(t, .97, .12); lip = f.real ? ss(1.05, .93, t) : ss(1.1, .78, t); } }
    else { const H = .0094 * LP * Tl; if (H > 1e-5) { const t = -v / H; if (t < 1.25) rise = .0028 * (.5 + .5 * Tl) * ss(.002, .0055, H) * ss(0, .4, t) * ss(1.25, .45, t) + edge * .8 * Tl * bump(t, .97, .14); lip = f.real ? ss(1.05, .92, t) : ss(1.1, .78, t); } }
    lip *= ss(1, .9, e);
    rise -= .0006 * bump(u, half + .0015, .004) * bump(v, 0, .005);   // a dimple at each corner
  }
  if (hy > MOUTH.y + .0032 && hy < MOUTH.y + .0222) rise -= .0008 * bump(x, 0, .0028) * ss(MOUTH.y + .0212, MOUTH.y + .0162, hy) * ss(MOUTH.y + .0037, MOUTH.y + .0077, hy);   // the dip from the nose to the bow of the lip
  out[0] = rise; out[1] = lip; out[2] = e < 1.4 ? bump(v, 0, .0015) * ss(1, .78, e) : 0;
  return out;
}

// the mouth: the round of the teeth under the skin, with the lips standing out of it
function mouthShape(f) {
  const so = f.soft, cy = HC[1] + MOUTH.y + .0027, cz = HC[2] + .0695, rx = (.0255 - .003 * so) * (f.real ? 1.1 : 1), ry = .0185 - .0015 * so, rz = .024, o = [0, 0, 0];
  return {
    field(x, y, z) { const d = ball3(x, y - cy, z - cz, rx, ry, rz); return z < cz || d < -.008 || d > .012 ? d : d - mouthAt(x, y - HC[1], f, o)[0]; },
    lo: [-rx - .003, cy - ry - .003, cz - rz], hi: [rx + .003, cy + ry + .003, cz + rz + .004],
  };
}

// ================================================================= a live face
// The bones a face moves on, and how much of the head's skin goes with each. They only show close up: further off each stands in as the head.
export const JAW = [-.014, .002], LID_R = .0138 * ES;   // where the jaw turns (y from the eyes, z: a little in front of the ears); how far the lids lie from the middle of the eye
/** The line between the lips at x (y from the eyes), for a face f. */
export const lipLine = (x, f) => { if (f.gnm) return lipAt(f.gnm, 'line', x); const u = abs(x); return MOUTH.y - MOUTH_DIP * u / (f.real ? 1.15 : 1) + MOUTH_UP * ss(.7, 1.1, u / mouthHalf(f)); };
/**
 * How far the upper lid of each eye turns about the middle of the eye to close, measured on the head's own mesh (m: field.js's): the opening as it
 * is meshed is a little taller than it was drawn (its edges are rounded, and thinned). In strips across the eye, the lowest the upper lid's skin
 * comes and the highest the lower lid's does, as angles about the eye's middle: the lid's edge has to turn through the difference (and a little
 * more, so the two overlap). Returns { turn (radians: the most, about the middle of the eye), L, R: for each strip from the inner corner out, the share of it }.
 */
export function lidPlan(m, f) {
  const rim = rimOf(f), ES = esOf(f), EY = eyeOf(f), K = 10, o = [0, 0, 0], out = { turn: 0 };
  const up = { L: new Float32Array(K).fill(9), R: new Float32Array(K).fill(9) }, lo = { L: new Float32Array(K).fill(-9), R: new Float32Array(K).fill(-9) };
  for (let i = 0; i < m.n; i++) {
    const x = m.P[i * 3], ax = abs(x), hy = m.P[i * 3 + 1] - HC[1], dy = hy - EY[1], dz = m.P[i * 3 + 2] - HC[2] - EY[2];
    if (dz < .008 * ES || abs(dy) > .012 * ES || abs(ax - rim.cx) >= rim.w || hyp(ax - EY[0], dy, dz) < .0124 * ES) continue;   // (inside the eyeball it is never seen)
    rim.at(ax, hy, o); const k = Math.min(K - 1, Math.floor((o[0] * .5 + .5) * K)), an = Math.atan2(dy, dz), sd = x >= 0 ? 'L' : 'R';
    if (o[1] > o[2]) { if (o[1] > -.0006 && o[1] < .004 * ES) up[sd][k] = Math.min(up[sd][k], an); } else if (o[2] > -.0006 && o[2] < .004 * ES) lo[sd][k] = Math.max(lo[sd][k], an);
  }
  for (const sd of ['L', 'R']) {
    const need = new Float32Array(K), have = [];
    for (let k = 0; k < K; k++) if (up[sd][k] < 8 && lo[sd][k] > -8) { need[k] = mx(0, up[sd][k] - lo[sd][k]); have.push(k); }
    // a strip with no point of either lid in it takes its neighbours' (nothing at the corners themselves); then evened out along the lid
    for (let k = 0; k < K; k++) if (!have.includes(k)) { const a = have.filter(j => j < k).pop(), b = have.find(j => j > k), va = a === undefined ? 0 : need[a], vb = b === undefined ? 0 : need[b], ka = a === undefined ? -1 : a, kb = b === undefined ? K : b; need[k] = va + (vb - va) * (k - ka) / (kb - ka); }
    const sm = need.map((v, k) => .25 * (k ? need[k - 1] : v * .5) + .5 * v + .25 * (k < K - 1 ? need[k + 1] : v * .5));
    for (let k = 0; k < K; k++) { sm[k] += .05 * Math.min(1, sm[k] / .2); out.turn = mx(out.turn, sm[k]); }
    out[sd] = sm;
  }
  for (const sd of ['L', 'R']) for (let k = 0; k < K; k++) out[sd][k] /= out.turn || 1;
  return out;
}
/**
 * The bones of a face f: [[name, parent, [x, y, z]]...] in the person's space. The eyes (each turns about its middle), the upper lids (in the same
 * place: a lid closes round the eyeball), the brows (one bone at the arch, one at the inner end), the corners of the mouth, the jaw (at its hinge);
 * and for the movements a face makes (human-face.js), the lower lids, the cheeks (the pad of fat over each cheekbone), the wings of the nose, each
 * half of the upper lip and of the lower, and the chin (the lower lip's halves and the chin ride on the jaw).
 */
export function faceBones(f) {
  const half = mouthHalf(f), B = browOf(f.soft, f), L0 = lipLine(0, f), E = eyeOf(f), NO = noseOf(f), out = [['jaw', 'head', Hd(0, JAW[0], JAW[1])], ['chin', 'jaw', Hd(0, L0 - .033, .08)]];
  for (const [sd, s] of [['L', 1], ['R', -1]]) out.push(['eye' + sd, 'head', Hd(s * E[0], E[1], E[2])], ['lid' + sd, 'head', Hd(s * E[0], E[1], E[2])],
    ['brow' + sd, 'head', Hd(s * B[1][0], B[1][1], B[1][2])], ['browIn' + sd, 'head', Hd(s * B[0][0], B[0][1], B[0][2])], ['corner' + sd, 'head', Hd(s * half, lipLine(half, f), .078)],
    ['lowLid' + sd, 'head', Hd(s * E[0], E[1] - .011, .078)], ['cheek' + sd, 'head', Hd(s * .041, -.024, .072)], ['nose' + sd, 'head', Hd(s * (NO[0] + .0032), NO[1] - .003, .092)],
    ['lipUp' + sd, 'head', Hd(s * half * .42, L0 + .007, .088)], ['lipLow' + sd, 'jaw', Hd(s * half * .42, L0 - .008, .086)]);
  return out;
}
/** The face's own bones by name, as faceBones(f) has them (the small bones a face moves on: close up only). */
export const FACE_BONES = /^((eye|lid|brow|browIn|corner|lowLid|cheek|nose|lipUp|lipLow)[LR]|jaw|chin)$/;
const NONE = []; let RIM = null, RIMO = '';
/**
 * How much of the head's own weight a point of a face f gives to each of the face's bones: [[bone, share]...] (what is left stays the head's).
 * side: for a point on the line between the lips, which lip it is the edge of (1 the upper, -1 the lower: partLips() cuts the skin along that line,
 * with points of its own for each lip); 0 anywhere else. lids: lidPlan()'s, once the head is meshed.
 * The upper lid closes round the eye. The skin along each brow goes with it, less a finger's width above and below. All below the line between the lips
 * goes with the jaw (the lower lip, the chin, less of the cheeks, nothing by the ears, where a jaw only turns); beside the mouth the step across the line
 * becomes a slope, so the cut closes at each corner. The corners take most of the skin about them, both lips' ends alike.
 * For the face's movements: the lower lid's edge and the skin just under it; the pad over each cheekbone; the wings of the nose and the skin beside
 * them; each lip from the line between them to the nose and to the crease above the chin, shared by its two halves in the middle and given over to
 * the corners at its ends; and the chin. What goes with the jaw goes with the lower lip's halves and the chin as much (they ride on the jaw).
 */
export function faceShare(x, y, z, f, side = 0, lids = null) {
  const hy = y - HC[1], hz = z - HC[2], ax = abs(x), sd = x >= 0 ? 'L' : 'R', od = sd === 'L' ? 'R' : 'L';
  if (hy > .055 || hy < -.15 || ax > .08 || hz < -.04) return NONE;
  if (hy > -.02 && hz < .045) return NONE;
  const out = [], ES = esOf(f);
  let lid = 0, low = 0;
  if (hy > -.02) {
    if (hy < .02 * ES && hz > .058) {
      const key = f.eyes + ':' + ES + ':' + (f.tilt || 0) + ':' + !!f.real + ':' + (f.gnm ? JSON.stringify(f.gnm.rim) : ''); if (RIMO !== key) { RIM = rimOf(f); RIMO = key; } lid = RIM.lid(ax, hy, lids && lids[sd]); if (lid > 0) out.push(['lid' + sd, lid]);
      // the lower lid: its edge and the skin a little way down from it, less toward the corners, where the lids meet and nothing moves
      if (hy < .004 * ES) { const o = RIM.at(ax, hy, RO); if (o[2] >= o[1] && abs(o[0]) < 1) low = .9 * ss(-.0016, -.0004, o[2]) * ss(.009 * ES, .0015 * ES, o[2]) * ss(1, .55, abs(o[0])) * (1 - lid); if (low > 0) out.push(['lowLid' + sd, low]); }
    }
    if (hy > .004) {
      const [b0, b1, b2] = browOf(f.soft, f), q = ax < b1[0] ? [b0, b1] : [b1, b2], t = mx(0, Math.min(1, (ax - q[0][0]) / (q[1][0] - q[0][0])));
      const k = ss(.017, .006, hyp(ax < b0[0] ? b0[0] - ax : ax > b2[0] ? ax - b2[0] : 0, hy - (q[0][1] + (q[1][1] - q[0][1]) * t))) * ss(.045, .06, hz) * (1 - lid);
      if (k > 0) {
        // (between the brows the skin is shared by both inner ends; the tail of a brow moves less than its arch)
        const inner = ss(b1[0] - .004, b0[0] + .002, ax), own = .5 + .5 * ss(0, .006, ax);
        if (inner > 0) { out.push(['browIn' + sd, k * inner * own]); if (own < 1) out.push(['browIn' + od, k * inner * (1 - own)]); }
        if (inner < 1) out.push(['brow' + sd, k * (1 - inner) * (1 - .45 * ss(b1[0], b2[0], ax))]);
      }
    }
  }
  // the cheek's pad, under the lower lid's own skin and clear of the nose; the wing of the nose and the skin beside it
  if (hy < .004 && hy > -.06 && hz > .045) {
    // (none of it over the eyeball: skin that lies on the ball and rose with the cheek straight up rose into the ball, which showed through it)
    const ch = .75 * ss(.027, .007, hyp(ax - .041, (hy + .024) * 1.25)) * ss(.05, .066, hz) * ss(.011, .019, ax) * ss(.017 * ES, .026 * ES, hyp(ax - eyeOf(f)[0], hy - eyeOf(f)[1])) * (1 - lid) * (1 - low);
    if (ch > .002) out.push(['cheek' + sd, ch]);
    const NO = noseOf(f), ns = .85 * ss(.011, .003, hyp(ax - NO[0] - .005, (hy - NO[1] + .004) * 1.15)) * ss(.06, .075, hz);
    if (ns > .002) out.push(['nose' + sd, ns]);
  }
  if (hy <= -.02) {
    const half = mouthHalf(f), e = ax / half, v = hy - lipLine(x, f);
    const corner = hy > -.1 ? .85 * ss(.016, .004, hyp(ax - half, v)) * ss(.04, .06, hz) : 0;
    // across the line: a step inside the mouth's length (h: 1), a slope beside it (h: 0) that is wider the further out
    const h = ss(.9, .72, e), band = mx(.001, 1.4 * (ax - (half - .006))), up = .5 - .5 * h;
    const across = side > 0 ? up : side < 0 ? 1 - up : v > 0 ? up * ss(band, 0, v) : 1 - up * ss(-band, 0, v);
    const zb = -.035 + .055 * ss(-.067, -.12, hy), jaw = across * ss(zb, zb + .03, hz) * ss(-.025, -.05, hy) * (1 - corner);
    if (corner > 0) out.push(['corner' + sd, corner]);
    // the lips' halves: the upper lip from the line up to the nose, the lower down to the crease above the chin; shared in the middle
    const own = .5 + .5 * ss(0, .007, ax), ends = ss(half * 1.1, half * .6, ax) * (1 - corner) * ss(.06, .075, hz), upper = side > 0 || (!side && v >= 0);
    const lu = upper ? .9 * ss(.019, .009, v) * ends : 0, ll = !upper ? .9 * ss(-.018, -.009, v) * ends : 0;
    if (lu > .002) { out.push(['lipUp' + sd, lu * own]); if (own < 1) out.push(['lipUp' + od, lu * (1 - own)]); }
    // (what goes with the jaw: the lower lip's halves and the chin take theirs out of it, and carry the jaw's move with their own)
    const cn = .8 * ss(.021, .007, hyp(x / 1.35, hy - lipLine(0, f) + .033)) * ss(.06, .075, hz) * (1 - ll);
    let j = jaw;
    if (ll > .002 && j > 0) { out.push(['lipLow' + sd, j * ll * own]); if (own < 1) out.push(['lipLow' + od, j * ll * (1 - own)]); j *= 1 - ll; }
    if (cn > .002 && j > 0) { out.push(['chin', j * cn]); j *= 1 - cn; }
    if (j > 0) out.push(['jaw', j]);
  }
  let sum = 0; for (const q of out) sum += q[1];
  if (sum > 1) for (const q of out) q[1] /= sum;
  return out;
}
const RO = [0, 0, 0];

/**
 * The skin parted along the line between the lips, so that a mouth can open. Every triangle of a head's mesh (m: field.js's, already thinned)
 * that the line crosses is cut along it, and each point on the line becomes two, one the edge of each lip, which then go with different bones
 * (faceShare's `side`). Closed, the two lie on each other and nothing shows. The cut runs a little beyond each corner, where both edges move alike.
 * Returns the mesh with those points and triangles, side (for each point: 1, -1 or 0) and line: the points along the cut from the person's right
 * to their left, [upper lip's, lower lip's] each.
 */
export function partLips(m, f) {
  const n0 = m.n, half = mouthHalf(f), lim = half * 1.08, SNAP = .00025, I = m.I, MY = mouthY(f);
  const P = Array.from(m.P.subarray(0, n0 * 3)), N = Array.from(m.N.subarray(0, n0 * 3)), ao = Array.from(m.ao.subarray(0, n0)), own = Array.from(m.own.subarray(0, n0)), ride = Array.from(m.ride.subarray(0, n0));
  // st: 1 above the line, 2 below it, 3 on it (a point within a hair of the line is put on it), 0 not by the mouth; v: how far above the line
  const v = new Float32Array(n0), st = new Uint8Array(n0), line = [];
  for (let i = 0; i < n0; i++) {
    const x = P[i * 3], hy = P[i * 3 + 1] - HC[1]; if (P[i * 3 + 2] - HC[2] < .05 || abs(hy - MY) > .03) continue;
    const d = hy - lipLine(x, f); v[i] = d; if (abs(x) > lim) continue;
    if (abs(d) < SNAP && abs(x) <= half) { st[i] = 3; P[i * 3 + 1] -= d; v[i] = 0; line.push(i); } else st[i] = d > 0 ? 1 : 2;
  }
  let n = n0; const twin = new Map(), cross = new Map(), on = i => i >= n0 || st[i] === 3;
  // a point on the line is the upper lip's; low(): the one in the same place that is the lower lip's
  const low = i => { let j = twin.get(i); if (j === undefined) { for (let c = 0; c < 3; c++) { P.push(P[i * 3 + c]); N.push(N[i * 3 + c]); } ao.push(ao[i]); own.push(own[i]); ride.push(ride[i]); twin.set(i, j = n++); } return j; };
  // where the line crosses an edge (one point for both triangles that share the edge)
  const crossing = (a, b) => {
    const key = a < b ? a * n0 + b : b * n0 + a; let j = cross.get(key); if (j !== undefined) return j;
    const t = v[a] / (v[a] - v[b]), q = t < .5 ? a : b, nx = N[a * 3] + (N[b * 3] - N[a * 3]) * t, ny = N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * t, nz = N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * t, nl = hyp(nx, ny, nz) || 1;
    const x = P[a * 3] + (P[b * 3] - P[a * 3]) * t;
    P.push(x, HC[1] + lipLine(x, f), P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t); N.push(nx / nl, ny / nl, nz / nl); ao.push(ao[a] + (ao[b] - ao[a]) * t); own.push(own[q]); ride.push(ride[q]);
    cross.set(key, j = n++); line.push(j); return j;
  };
  const out = [], cut = (a, b) => st[a] * st[b] === 2;   // (an edge from above the line to below it)
  // a triangle on one side of the line (s: 1 above, -1 below): its points on the line are that lip's
  const put = (a, b, c, s) => { out.push(s < 0 && on(a) ? low(a) : a, s < 0 && on(b) ? low(b) : b, s < 0 && on(c) ? low(c) : c); };
  for (let t = 0; t < I.length; t += 3) {
    let a = I[t], b = I[t + 1], c = I[t + 2]; const sa = st[a], sb = st[b], sc = st[c];
    if (!(sa | sb | sc)) { out.push(a, b, c); continue; }
    const e0 = cut(a, b), e1 = cut(b, c), e2 = cut(c, a), k = e0 + e1 + e2;
    if (!k) { if (sa !== 3 && sb !== 3 && sc !== 3) out.push(a, b, c); else put(a, b, c, v[a] + v[b] + v[c] > 0 ? 1 : -1); continue; }
    if (k === 2) {
      // one corner by itself on its side (a): that corner's part, and the other two's
      if (e0 && e1) { const q = a; a = b; b = c; c = q; } else if (e1 && e2) { const q = c; c = b; b = a; a = q; }
      const s = st[a] === 1 ? 1 : -1, X = crossing(a, b), Y = crossing(a, c); put(a, X, Y, s); put(X, b, c, -s); put(X, c, Y, -s); continue;
    }
    // one edge crossed (a to b): the third corner is on the line, or beyond the end of the cut
    if (e1) { const q = a; a = b; b = c; c = q; } else if (e2) { const q = c; c = b; b = a; a = q; }
    const s = st[a] === 1 ? 1 : -1, X = crossing(a, b); put(a, X, c, s); put(X, b, c, -s);
  }
  const side = new Int8Array(n), pairs = [];
  for (const i of line) { side[i] = 1; const j = twin.get(i); if (j !== undefined) { side[j] = -1; pairs.push([i, j]); } }
  pairs.sort((p, q) => P[p[0] * 3] - P[q[0] * 3]);
  return { P: Float32Array.from(P), N: Float32Array.from(N), I: Uint32Array.from(out), own: Int16Array.from(own), ride: Int16Array.from(ride), ao: Float32Array.from(ao), n, shapes: m.shapes, side, line: pairs };
}

/**
 * What shows in an open mouth: the teeth (the upper ones go with the head, the lower with the jaw) in front of a dark pocket behind the lips, whose
 * rim is the lips' own edges and which goes with them, so no gap ever opens between a lip and what is behind it. An extra part for the head's piece
 * (finish()'s), drawn close up only. m: partLips()'s.
 */
export function mouthInside(m, f) {
  const half = mouthHalf(f), MP = m.P, L = m.line.filter(p => abs(MP[p[0] * 3]) <= half * .9); if (L.length < 4) return null;
  const P = [], N = [], K = [], I = [], src = [], ao = [];
  const add = (x, y, z, nx, ny, nz, slot, s, shade) => { P.push(x, y, z); N.push(nx, ny, nz); K.push(slot); src.push(s); ao.push(shade); return P.length / 3 - 1; };
  const at = (i, c) => i < 0 ? MP[(-1 - i) * 3 + c] : P[i * 3 + c];   // (a point of the head's own is named -1 - its number)
  // a triangle that faces the way (dx, dy, dz) does
  const tri = (a, b, c, dx, dy, dz) => {
    const ux = at(b, 0) - at(a, 0), uy = at(b, 1) - at(a, 1), uz = at(b, 2) - at(a, 2), wx = at(c, 0) - at(a, 0), wy = at(c, 1) - at(a, 1), wz = at(c, 2) - at(a, 2);
    if ((uy * wz - uz * wy) * dx + (uz * wx - ux * wz) * dy + (ux * wy - uy * wx) * dz < 0) I.push(a, c, b); else I.push(a, b, c);
  };
  // ---- the pocket: at each point along the lips a loop from the upper lip's edge back over the roof of the mouth, down its back and forward over
  // the tongue to the lower lip's edge (each part of it goes with the lip's edge it starts from); nothing of it at either end, where it closes
  const x0 = -MP[L[0][0] * 3], x1 = MP[L[L.length - 1][0] * 3];
  const loops = L.map(([u, l], k) => {
    const x = MP[u * 3], y = MP[u * 3 + 1], z = MP[u * 3 + 2], g = k === 0 || k === L.length - 1 ? 0 : Math.sqrt(mx(0, 1 - pow(x < 0 ? -x / x0 : x / x1, 2.5)));
    const up = { like: [x, y, z, 1] }, dn = { like: [x, y, z, -1] };
    return { c: [x * (1 - .2 * g), y, z - .013 * g], r: [-1 - u, add(x * (1 - .05 * g), y + .0015 * g, z - .0045 * g, 0, -.9, .44, 'mouth', up, .5), add(x * (1 - .2 * g), y + .006 * g, z - .014 * g, 0, -.9, .44, 'mouth', up, .25),
      add(x * (1 - .4 * g), y + .004 * g, z - .03 * g, 0, 0, 1, 'mouth', up, .1), add(x * (1 - .4 * g), y - .005 * g, z - .03 * g, 0, 0, 1, 'mouth', dn, .1),
      add(x * (1 - .2 * g), y - .007 * g, z - .014 * g, 0, .9, .44, 'tongue', dn, .42), add(x * (1 - .05 * g), y - .0015 * g, z - .0045 * g, 0, .9, .44, 'mouth', dn, .5), -1 - l] };
  });
  for (let k = 0; k < loops.length - 1; k++) for (let j = 0; j < 7; j++) {
    const A = loops[k], B = loops[k + 1], a = A.r[j], b = A.r[j + 1], c = B.r[j + 1], d = B.r[j], face = (p, q, r) => {
      const mxx = (at(p, 0) + at(q, 0) + at(r, 0)) / 3, my = (at(p, 1) + at(q, 1) + at(r, 1)) / 3, mz = (at(p, 2) + at(q, 2) + at(r, 2)) / 3;
      tri(p, q, r, (A.c[0] + B.c[0]) / 2 - mxx, (A.c[1] + B.c[1]) / 2 - my, (A.c[2] + B.c[2]) / 2 - mz);   // (it is seen from inside)
    };
    face(a, b, c); face(a, c, d);
  }
  // ---- the teeth: two rows that follow the round of the lips, a little way behind them (the upper ones show a little under the upper lip's edge;
  // the lower ones stand behind them, as teeth close, their tops just under the lower lip's edge: seen from above, hidden from level), six each,
  // a shade darker where two meet
  const zAt = x => { let i = 0; while (i < L.length - 2 && MP[L[i + 1][0] * 3] < x) i++; const a = L[i][0], b = L[i + 1][0], t = mx(0, Math.min(1, (x - MP[a * 3]) / (MP[b * 3] - MP[a * 3] || 1))); return MP[a * 3 + 2] + (MP[b * 3 + 2] - MP[a * 3 + 2]) * t; };
  const xt = half - .007, UP = { bone: 'head' }, DN = { bone: 'jaw' }, rows = [[], [], [], [], [], []];
  for (let j = 0; j <= 12; j++) {
    const x = (j - 6) / 6 * xt, q = (x / xt) ** 2, y = HC[1] + lipLine(x, f), z = zAt(x) - .0035 - .0025 * q, sh = j % 2 ? 1 : .62, nx = x / xt * .45, nl = hyp(nx, 1);
    rows[0].push(add(x, y + .0065, z - .0008, nx / nl, 0, 1 / nl, 'teeth', UP, .62 * sh)); rows[1].push(add(x, y - .0006, z, nx / nl, 0, 1 / nl, 'teeth', UP, .86 * sh)); rows[2].push(add(x, y - .0002, z - .0028, 0, -1, 0, 'teeth', UP, .5 * sh));
    rows[3].push(add(x, y - .0016, z - .0053, 0, 1, 0, 'teeth', DN, .5 * sh)); rows[4].push(add(x, y - .0012, z - .0025, nx / nl, 0, 1 / nl, 'teeth', DN, .74 * sh)); rows[5].push(add(x, y - .0085, z - .0037, nx / nl, 0, 1 / nl, 'teeth', DN, .5 * sh));
  }
  for (let j = 0; j < 12; j++) for (const [r, dy] of [[0, 0], [1, -1], [3, 1], [4, 0]]) {
    const a = rows[r][j], b = rows[r + 1][j], c = rows[r + 1][j + 1], d = rows[r][j + 1]; tri(a, b, c, 0, dy, dy ? 0 : 1); tri(a, c, d, 0, dy, dy ? 0 : 1);
  }
  return { P, N, K, I, src, ao, close: true };
}

// Where a real face's beard and moustache grow (sp: { face, beard, moustache }; x; hy, hz from the middle of the head): [beard, moustache], each 0..1, soft at its edges
// as real ones are (more and fewer hairs over a centimetre or so, never a line). The beard's line on the cheek runs from beside the nose
// down past the corner of the mouth and up across the cheek to the sideburn by the ear; its neckline from under the jaw's corner to a
// finger above the Adam's apple; none behind the front of the ear. The moustache: the whole upper lip, from under the nose down over
// the lip's edge, out a little past the corners, and on down over most of the upper lip itself, as a real one hangs over it (only the lower
// lip shows clearly under a full moustache). Both grow right up to the lips, all round: a band of bare skin round the mouth inside a dark
// beard, and the whole of both lips showing, reads as a painted mask, not a beard.
export function beardArea(sp, x, hy, hz, out) {
  const ax = Math.abs(x), sf = sp.face.soft || 0, fl = sp.face.lips || 1, mw = mouthHalf(sp.face) / (MOUTH.half - .002 * sf);
  const e = .003 * lumps(x * 260, hy * 260 + 3.1, hz * 260) + .0013 * lumps(x * 800 + 5.3, hy * 800, hz * 800 + 1.7);
  // (the lips: an oval over each; a GNM face's over its own lips' red)
  const g = sp.face.gnm, MY = mouthY(sp.face), L = g?.lip, lip = g ? Math.min(Math.hypot(x / (L.half * .97), (hy - (L.line[0] + L.up[0]) / 2) / mx(.002, (L.up[0] - L.line[0]) / 2 + .0005)), Math.hypot(x / (L.half * .83), (hy - (L.line[0] + L.dn[0]) / 2) / mx(.002, (L.line[0] - L.dn[0]) / 2 + .0005)))
    : Math.min(Math.hypot(x / ((.0228 - .0035 * sf) * mw), (hy - MOUTH.y - .005) / (.0048 * fl)), Math.hypot(x / ((.0195 - .002 * sf) * mw), (hy - MOUTH.y + .0058) / (.0062 * fl)));
  const lipOff = hy > MY ? ss(.94, 1.04, lip) : ss(.97, 1.1, lip);
  const top = -.0485 - .0055 * ss(.012, .03, ax) + .034 * ss(.035, .075, ax) + .014 * ss(.068, .078, ax) + e, dn = ((hz + .04) * .045 + (hy + .085) * .075) / .0875 + .6 * e;
  const ang = Math.atan2(ax, hz) * 180 / Math.PI, back = 80 + 8 * ss(-.045, -.075, hy);
  out[0] = sp.beard ? ss(top + .004, top - .004 - .014 * ss(.02, .05, ax), hy) * ss(-.008, .01, dn) * ss(back, back - 12, ang) * lipOff : 0;
  const over = lipLine(x, sp.face) + .0022 + .0012 * ss(.012, .026, ax) + .4 * e;   // (how far down over the upper lip it hangs: to a couple of millimetres above where the lips meet)
  const mh = mouthHalf(sp.face);   // (out to the corners of the mouth and a little round them, no further: past them a moustache by itself had left a stray tuft on the cheek)
  out[1] = sp.moustache || sp.beard ? ss(top + .002, top - .006, hy) * ss(mh * 1.2, mh * .98, ax - .2 * e) * ss(over - .0012, over + .0012, hy) * (sp.moustache ? 1 : ss(0, .3, sp.beard)) : 0;
  return out;
}
/**
 * A real face's eyes close up, as parts joined onto the head's mesh (m: field.js's, its lips parted; the close set of triangles only):
 * - the lashes: each a thin strand of three sides from the front edge of a lid (found on the mesh), in clumps of two or three as lashes lie.
 *   The upper ones are longer in the middle and towards the outer corner, short by the nose; they reach forward and curl up and out, and ride
 *   the upper lid as it does (each goes with the skin at its root). The lower ones are fewer, shorter and point down. Fewer and shorter with
 *   age, a little longer on a woman.
 * - in the inner corner of each eye, the small pink mound there (the caruncle).
 * - the moustache (hair.moustache, or a beard's, hair.beard 0..1.5): its hairs one by one over the upper lip.
 * The lash lines painted along the lids (human-paint.js) are their roots. f: the face. Returns a list of parts.
 */
export function eyeParts(m, f, hair = {}) {
  const LASH_N = [0, .29, .96];   // (the way a lash's lid faces, about: forward and a little up)
  const rim = rimOf(f), es = esOf(f), so = f.soft || 0, age = mx(0, Math.min(1, ((f.age ?? 30) - 30) / 50)), MP = m.P, o = [0, 0, 0], e = [0, 0];
  let seed = Math.floor((f.aseed || 0) * 977) + 13; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // the head's points round the eyes (of the left one: x is mirrored), to find each lid's front edge on
  const EY = eyeOf(f), near = []; for (let i = 0; i < m.n; i++) { const ax = abs(MP[i * 3]), hy = MP[i * 3 + 1] - HC[1], hz = MP[i * 3 + 2] - HC[2]; if (abs(hy - EY[1]) < .013 * es && abs(ax - EY[0]) < .022 * es && hz > EY[2] - .004) near.push(i); }
  // the frontmost point of the skin within reach of (x, y from the eyes) on the left side, that is on the lid asked for (upper: 1, lower: 2,
  // inside the opening: 0); its z (from the head's middle), or NaN
  const front = (x, hy, which, reach) => {
    let best = NaN;
    for (const i of near) {
      const ax = abs(MP[i * 3]), py = MP[i * 3 + 1] - HC[1], dz = MP[i * 3 + 2] - HC[2]; if ((ax - x) ** 2 + (py - hy) ** 2 > reach * reach) continue;
      rim.at(ax, py, o); const ok = which === 0 ? mx(o[1], o[2]) < -.0004 : which === 1 ? o[1] > -.0002 && o[1] < .0007 && o[1] >= o[2] : o[2] > -.0002 && o[2] < .0007 && o[2] > o[1];
      if (ok && !(dz <= best)) best = dz;
    }
    return best;
  };
  const parts = [];
  for (const s of [1, -1]) {
    const P = [], N = [], K = [], I = [], src = [], ao = [];
    // a strand: from root r (metres, the person's space), its way d and the way it curls c (unit), length L, curl k, thickness at the root r0;
    // sn: the way the skin at its root faces, which its own round is lit by in part (sw 0..1): a hair a fraction of a millimetre across lets
    // the light through and scatters it, so it is lit nearly as the skin it lies on is. Lit as a solid little rod of three sides, two of them
    // turned from the light, a fair brow or beard had read as black specks
    const strand = (r, d, c, L, k, r0, like, slot = 'lashes', shade = 1, sn = null, sw = 0) => {
      const T = [0, 0, 0], S = [0, 0, 0], B = [0, 0, 0], base = P.length / 3;
      for (const t of [0, .3, .65, 1]) {
        for (let q = 0; q < 3; q++) T[q] = d[q] + 2 * k * t * c[q]; let l = hyp(T[0], T[1], T[2]); for (let q = 0; q < 3; q++) T[q] /= l;
        const ref = abs(T[1]) < .9 ? [0, 1, 0] : [1, 0, 0]; S[0] = T[1] * ref[2] - T[2] * ref[1]; S[1] = T[2] * ref[0] - T[0] * ref[2]; S[2] = T[0] * ref[1] - T[1] * ref[0]; l = hyp(S[0], S[1], S[2]); for (let q = 0; q < 3; q++) S[q] /= l;
        B[0] = T[1] * S[2] - T[2] * S[1]; B[1] = T[2] * S[0] - T[0] * S[2]; B[2] = T[0] * S[1] - T[1] * S[0];
        const rr = r0 * (1 - .85 * t);
        for (let v = 0; v < 3; v++) {
          const an = v * PI * 2 / 3, nx = S[0] * cos(an) + B[0] * sin(an), ny = S[1] * cos(an) + B[1] * sin(an), nz = S[2] * cos(an) + B[2] * sin(an);
          P.push(r[0] + L * (t * d[0] + k * t * t * c[0]) + rr * nx, r[1] + L * (t * d[1] + k * t * t * c[1]) + rr * ny, r[2] + L * (t * d[2] + k * t * t * c[2]) + rr * nz);
          if (sn) { const a = nx * (1 - sw) + sn[0] * sw, b = ny * (1 - sw) + sn[1] * sw, g = nz * (1 - sw) + sn[2] * sw, l = hyp(a, b, g) || 1; N.push(a / l, b / l, g / l); } else N.push(nx, ny, nz);
          K.push(slot); src.push(like); ao.push((slot === 'lashes' ? .5 + .5 * t : .72 + .28 * t) * shade);   // (darker at the root, a brow's or a beard's hairs less so: lit through, their roots dark had dotted a brow with black)
        }
      }
      for (let j = 0; j < 3; j++) for (let v = 0; v < 3; v++) { const a = base + j * 3 + v, b = base + j * 3 + (v + 1) % 3; I.push(a, b, b + 3, a, b + 3, a + 3); }
    };
    const unit = v => { const l = hyp(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    for (const upper of [true, false]) {
      const n = Math.round((upper ? 84 : 16) * (1 - .3 * age)), t0 = upper ? -.9 : -.5, t1 = upper ? .97 : .9;
      // (each clump's own way, which its three or so lashes lean towards, and each lash a little its own way and length)
      const clump = []; for (let c = 0; c <= n / 3.2 + 1; c++) clump.push([(rnd() - .5) * .34, (rnd() - .5) * .3]);
      for (let i = 0; i < n; i++) {
        const t = t0 + (t1 - t0) * (i + .8 * rnd()) / n, c0 = clump[Math.floor(i / 3.2)], cl = [c0[0] + (rnd() - .5) * .08, c0[1] + (rnd() - .5) * .08];
        rim.edge(t, upper, e); const z = front(e[0], e[1], upper ? 1 : 2, .0012 * es); if (!(z === z)) continue;
        const root = [s * e[0], HC[1] + e[1], HC[2] + z - .00015], like = { like: [root[0], root[1], root[2], 0] };
        if (upper) {
          const bell = ss(-1, -.25, t) * ss(1.05, .55, t), L = es * (.0032 + .0042 * bell) * (1 + .12 * so) * (1 - .25 * age) * (.7 + .5 * rnd());
          strand(root, unit([s * (.1 + .45 * t + cl[0]), -.38 + cl[1], 1]), unit([0, 1, -.3]), L, .95, .00008 * es, like, 'lashes', 1, LASH_N, .3);
        } else {
          const bell = ss(-.6, 0, t) * ss(1, .6, t), L = es * (.0009 + .0011 * bell) * (1 + .1 * so) * (1 - .25 * age) * (.7 + .5 * rnd());
          strand(root, unit([s * (.1 + .3 * t + cl[0]), -.7 + cl[1], 1]), [0, -1, 0], L, .3, .000045 * es, like, 'lashes', 1, LASH_N, .3);
        }
      }
    }
    // the brow: its hairs one by one in the brow's band (as the paint's, human-paint.js browAt), close over the skin: standing up
    // at the inner end, lying out along the brow toward its tail, the last few turning down; longest over the arch. The paint
    // keeps a fainter brow under them, the skin's own colour where the hairs are few
    { const B = browOf(so), fem = so > .5, x0 = B[0][0], x1 = B[1][0], x2 = B[2][0], full = fem ? .0025 : .0036, nb = Math.round((fem ? 540 : 760) * (1 - .2 * age));   // (as tall and as thick as a real brow: a thinner band of fewer hairs read as a pencil line; and many fine hairs, not a few thick ones)
      const yc = x => B[0][1] * (x - x1) * (x - x2) / ((x0 - x1) * (x0 - x2)) + B[1][1] * (x - x0) * (x - x2) / ((x1 - x0) * (x1 - x2)) + B[2][1] * (x - x0) * (x - x1) / ((x2 - x0) * (x2 - x1));
      const skin = []; for (let i = 0; i < m.n; i++) { const ax = abs(MP[i * 3]), hy = MP[i * 3 + 1] - HC[1]; if (ax > x0 - .008 && ax < x2 + .006 && hy > .006 && hy < .045 && MP[i * 3 + 2] - HC[2] > .03 && m.N[i * 3 + 2] > .2) skin.push(i); }
      for (let i = 0, tries = 0; i < nb && tries < nb * 20; tries++) {
        const t = rnd() * 1.06 - .04, x = x0 + (x2 - x0) * t, half = full * (1 - .72 * ss(.45, 1.02, t)) * ss(-.14, .04, t), dy = (rnd() * 2 - 1) * half * 1.15, hy = yc(x) + dy;
        if (!(half > 0) || rnd() > ss(1.2, .6, abs(dy) / half) * ss(1.06, .95, t)) continue;
        // (the skin there: its depth and the way it faces, from the head's points round it, the nearer the more)
        let w = 0, z = 0; const n = [0, 0, 0];
        for (const j of skin) { const d2 = (abs(MP[j * 3]) - x) ** 2 + (MP[j * 3 + 1] - HC[1] - hy) ** 2; if (d2 > 6.25e-6) continue; const q = 1 / (d2 + 1e-7); w += q; z += q * (MP[j * 3 + 2] - HC[2]); n[0] += q * m.N[j * 3] * (MP[j * 3] < 0 ? -1 : 1); n[1] += q * m.N[j * 3 + 1]; n[2] += q * m.N[j * 3 + 2]; }
        if (!w) continue; i++;
        const nn = unit(n), root = [s * x, HC[1] + hy, HC[2] + z / w - nn[2] * .00015], like = { like: [root[0], root[1], root[2], 0] }, N3 = [s * nn[0], nn[1], nn[2]];
        // (the way it lies, on the brow's face: up at the inner end, out along it over the arch, down a little at the tail; each its own a little)
        const way = [s * (.25 + 1.1 * ss(0, .4, t)), 1.05 - 1.05 * ss(.05, .55, t) - .35 * ss(.65, 1, t) + (rnd() - .5) * .35 - dy / half * .15, 0], along = way[0] * N3[0] + way[1] * N3[1];
        const d = unit([way[0] - along * N3[0] + .32 * N3[0], way[1] - along * N3[1] + .32 * N3[1], -along * N3[2] + .32 * N3[2]]);
        const L = (.0042 + .0034 * ss(0, .35, t) * ss(1, .6, t)) * (fem ? .8 : 1) * (.75 + .5 * rnd());
        strand(root, d, [-N3[0], -N3[1], -N3[2]], L, .3, .00007 * (fem ? .85 : 1), like, 'browhair', .8 + .35 * rnd(), N3, .6);
      }
    }
    // the caruncle: a small pink mound in the inner corner, between the lids' edges, lying on the round of the eye (which turns under it)
    // (a real eye's inner corner lies beyond the round of the eyeball, on the floor of the opening there)
    // (a GNM face's: further into its corner, which comes to a point, smaller and lying back in it, under the lids' edges)
    { const G = !!f.gnm, t = G ? -.86 : -.76, a = rim.edge(t, true, [0, 0]), b = rim.edge(t, false, [0, 0]), x = (a[0] + b[0]) / 2, hy = (a[1] + b[1]) / 2, r = .0122 * es, d2 = (x - EY[0]) ** 2 + (hy - EY[1]) ** 2;
      if (d2 < r * r || f.real) {
        const c = [s * x, HC[1] + hy, HC[2] + EY[2] + mx(Math.sqrt(mx(0, r * r - d2)), f.real ? .0035 * es + .75 * mx(0, EY[0] - .0145 * es - x) : 0) + (G ? -.0005 : .0001)], R = G ? [.0008 * es, .0011 * es, .0005 * es] : [.001 * es, .0014 * es, .0007 * es], like = { like: [c[0], c[1], c[2], 0] }, base = P.length / 3, U = 8, V = 6;
        for (let j = 0; j <= V; j++) for (let i = 0; i < U; i++) {
          const th = j / V * PI, ph = i / U * PI * 2, nx = sin(th) * cos(ph), ny = cos(th), nz = sin(th) * sin(ph), nn = hyp(nx / R[0], ny / R[1], nz / R[2]);
          P.push(c[0] + R[0] * nx, c[1] + R[1] * ny, c[2] + R[2] * nz); N.push(nx / R[0] / nn, ny / R[1] / nn, nz / R[2] / nn); K.push('caruncle'); src.push(like); ao.push(.6 + .3 * mx(0, nz));
        }
        for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { const a0 = base + j * U + i, b0 = base + j * U + (i + 1) % U; I.push(a0, b0, b0 + U, a0, b0 + U, a0 + U); }
      }
    }
    // the moustache: its hairs one by one over the whole upper lip, from under the nose down to the red of the lip, as a real one grows:
    // down in the middle, fanning out and down toward the corners, lying over the lip and arching out over its edge to a couple of millimetres
    // above where the lips meet; fewer toward its edges, so it thins out there and does not end in a line (a coat of fur over the lip had
    // read as a solid block). Each goes with the skin at its root.
    const slotOf = m.slots && m.slot ? i => m.slots[m.slot[i]] : () => 'skin';
    if (hair.moustache || hair.beard > 0) {
      const full = hair.moustache ? 1 : Math.min(1, hair.beard * 1.4), mh = mouthHalf(f), nm = Math.round(900 * (.5 + .5 * full) * (1 - .2 * age));
      const top = ax => -.0482 + .0022 * bump(ax, .0175, .0045) - .0075 * ss(.02, .031, ax), bot = ax => lipLine(ax, f) + .0042, q3 = [0, 0, 0];
      const skin = [];
      for (let i = 0; i < m.n; i++) { const ax = abs(MP[i * 3]), hy = MP[i * 3 + 1] - HC[1]; if (ax < mh * 1.3 && hy > -.078 && hy < -.04 && MP[i * 3 + 2] - HC[2] > .05 && m.N[i * 3 + 2] > .2 && slotOf(i) === 'skin') skin.push(i); }
      for (let i = 0, tries = 0; i < nm && tries < nm * 30; tries++) {
        const x = rnd() * mh * 1.15, t0 = top(x), b0 = bot(x), hy = b0 + (t0 - b0) * rnd(); if (t0 <= b0) continue;
        if (rnd() > ss(t0 + .0008, t0 - .0028, hy) * ss(mh * 1.15, mh * .78, x) * (.75 + .25 * full) || mouthAt(x, hy, f, q3)[1] > .02) continue;
        let w = 0, z = 0; const n = [0, 0, 0];
        for (const j of skin) { const d2 = (abs(MP[j * 3]) - x) ** 2 + (MP[j * 3 + 1] - HC[1] - hy) ** 2; if (d2 > 4e-6) continue; const q = 1 / (d2 + 1e-7); w += q; z += q * (MP[j * 3 + 2] - HC[2]); n[0] += q * m.N[j * 3] * (MP[j * 3] < 0 ? -1 : 1); n[1] += q * m.N[j * 3 + 1]; n[2] += q * m.N[j * 3 + 2]; }
        if (!w) continue; i++;
        const nn = unit(n), N3 = [s * nn[0], nn[1], nn[2]], root = [s * x, HC[1] + hy, HC[2] + z / w - nn[2] * .0002], like = { like: [root[0], root[1], root[2], 0] };
        // (down, and out the further from the middle; lifted off the skin, and curling back down over the lip)
        const way = [s * (.1 + .95 * ss(.002, .027, x) + (rnd() - .5) * .3), -1, 0], along = way[0] * N3[0] + way[1] * N3[1];
        const d = unit([way[0] - along * N3[0] + .24 * N3[0], way[1] - along * N3[1] + .24 * N3[1], -along * N3[2] + .24 * N3[2]]);
        // (as long as reaches down to a couple of millimetres above where the lips meet, its curl and all)
        const c = [-.8 * N3[0], -.6 - .8 * N3[1], -.8 * N3[2]], fall = -(d[1] + .45 * c[1]), drop = hy - lipLine(x, f) - .0022;
        const L = Math.min((.0095 + .003 * ss(0, .02, x)) * (.7 + .3 * full) * (.75 + .5 * rnd()), drop / mx(.3, fall)); if (L < .0015) continue;
        strand(root, d, c, L, .45, .00008, like, 'beardhair', .7 + .4 * rnd(), N3, .55);
      }
    }
    // the beard: single hairs too, where a real one grows (beardArea), fewer and shorter toward its edges and its neckline, growing down the
    // face and the jaw, forward off the chin and back under it toward the throat, lying over the skin and curling in to it (a coat of fur
    // alone had read as felt). The coat under them is shorter, to fill in between.
    if (hair.beard > 0) {
      const sp = { face: f, beard: hair.beard, moustache: !!hair.moustache }, B2 = [0, 0], nb = Math.round(2900 * Math.min(1, .35 + hair.beard) * (1 - .15 * age)), roots = [];
      for (let i = 0; i < m.n; i++) { const x = MP[i * 3] * s, hy = MP[i * 3 + 1] - HC[1], hz = MP[i * 3 + 2] - HC[2]; if (x < -.004 || hy > -.01 || hy < -.17 || slotOf(i) !== 'skin') continue; const kb = beardArea(sp, x, hy, hz, B2)[0]; if (kb > .03) roots.push(i, kb); }
      for (let i = 0, tries = 0; i < nb && tries < nb * 20 && roots.length; tries++) {
        const r = Math.floor(rnd() * roots.length / 2) * 2, j = roots[r], kb = roots[r + 1]; if (rnd() > kb ** 1.5) continue; i++;
        const nn = [m.N[j * 3], m.N[j * 3 + 1], m.N[j * 3 + 2]], hy = MP[j * 3 + 1] - HC[1], hz = MP[j * 3 + 2] - HC[2];   // (the skin's own way out: these roots are the mesh's own points on this side, not the left side's turned, so nothing to mirror; turned, the hairs on the right of the jaw had leant into the skin)
        const jit = [(rnd() - .5) * .002, (rnd() - .5) * .002, (rnd() - .5) * .002], jn = jit[0] * nn[0] + jit[1] * nn[1] + jit[2] * nn[2];
        const root = [MP[j * 3] + jit[0] - jn * nn[0] - nn[0] * .0002, MP[j * 3 + 1] + jit[1] - jn * nn[1] - nn[1] * .0002, MP[j * 3 + 2] + jit[2] - jn * nn[2] - nn[2] * .0002], like = { like: [root[0], root[1], root[2], 0] };
        const under = ss(-.25, -.65, nn[1]), way = [nn[0] * .2 + (rnd() - .5) * .35, -1 + .7 * under, -.9 * under + .15 * (1 - under)], along = way[0] * nn[0] + way[1] * nn[1] + way[2] * nn[2];
        const d = unit([way[0] - along * nn[0] + .22 * nn[0], way[1] - along * nn[1] + .22 * nn[1], way[2] - along * nn[2] + .22 * nn[2]]);
        const neck = .35 + .65 * ss(-.004, .03, ((hz + .04) * .045 + (hy + .085) * .075) / .0875), L = (.004 + .011 * hair.beard) * (.4 + .6 * kb) * neck * (.7 + .6 * rnd());
        strand(root, d, [-.8 * nn[0], -.5 - .8 * nn[1], -.8 * nn[2]], L, .4, .0001, like, 'beardhair', .65 + .45 * rnd(), nn, .55);
      }
    }
    parts.push({ P, N, K, I, src, ao, close: true });
  }
  return parts;
}

// the edge of the hair: how high it is (from the eyes) at each angle round the head (degrees from straight ahead): level across
// the forehead to a corner at each temple, down in front of the ear (a sideburn), over the ear, down behind it, across the nape
const LINE_M = [[0, .071], [20, .074], [33, .074], [39, .07], [43, .061], [47, .048], [52, .036], [57, .026], [61, .016], [64, .005], [65.5, -.006], [67, -.011], [79.5, -.011], [81.5, -.002], [84, .008], [88, .0135], [100, .0145], [107, .008], [112, -.012], [119, -.036], [128, -.054], [140, -.062], [180, -.064]];
const LINE_F = [[0, .068], [22, .07], [36, .068], [42, .06], [48, .046], [56, .03], [64, .016], [70, .002], [73, -.01], [79, -.012], [81, -.004], [84, .008], [88, .0135], [100, .0145], [106, .006], [110, -.03], [118, -.066], [135, -.082], [180, -.086]];
const lineAt = (L, deg) => { let i = 0; while (i < L.length - 2 && deg > L[i + 1][0]) i++; const a = L[i], b = L[i + 1]; return a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, (deg - a[0]) / (b[0] - a[0]))); };
// How far outside a hairline a point of the head is (metres, measured round the head and up it; negative inside, and no further
// than 3 cm either way): the hair's outline. The line's corners are rounded (its height is taken over a few degrees either side).
const outside = L => {
  const z0 = HC[2] - .0125, y0 = HC[1], R = .074 * PI / 180, STEP = 1.5, n = 120, Q = [];   // (angles are taken round a line up through the ears' fronts; a degree round the head is about 1.3 mm)
  for (let i = 0; i <= n; i++) { let h = 0, w = 0; for (let k = -3; k <= 3; k++) { const q = 1 - abs(k) / 4, dg = i * STEP + k * .8; h += q * lineAt(L, dg < 0 ? -dg : dg > 180 ? 360 - dg : dg); w += q; } Q.push([i * STEP * R, h / w]); }
  return (x, y, z) => {
    const deg = Math.atan2(abs(x), z - z0) * 180 / PI, h = y - y0, s = deg * R, j = Math.min(n - 1, Math.floor(deg / STEP)), i0 = mx(0, j - 16), i1 = Math.min(n, j + 17); let best = 9e-4;
    for (let i = i0; i < i1; i++) {
      const a = Q[i], b = Q[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], t = mx(0, Math.min(1, ((s - a[0]) * ex + (h - a[1]) * ey) / (ex * ex + ey * ey))), dx = s - a[0] - ex * t, dy = h - a[1] - ey * t, q = dx * dx + dy * dy;
      if (q < best) best = q;
    }
    const a = Q[j], b = Q[j + 1]; return h > a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0]) ? -Math.sqrt(best) : Math.sqrt(best);
  };
};
/**
 * Hair that grows out of the head: one clean shape, as a character model's is. The head's own shape (base: how far outside it
 * a point is) made thicker by the hair's length inside the hairline, which is an outline of its own (the mesh has an edge along
 * it and the hair's colour stops dead there: a coat that thinned away to nothing had an edge like a saw's). It stands up from
 * the skin in a step at the hairline, less than its full length, and is combed in locks from the forehead back and down the
 * sides. th: [length on top, at the sides]; fem: a woman's hairline. At the hairline it stands at least 3 mm (short hair all of its length).
 */
function hairShape(base, th, fem, soft = false) {
  const L = fem ? LINE_F : LINE_M, z0 = HC[2] - .0125, y0 = HC[1], m = outside(L);
  return {
    field(x, y, z) {
      const d = base(x, y, z); if (d > .04 || d < -.02) return d + .004;
      const e = m(x, y, z); if (e > .012) return mx(e, d + .004);   // (well outside the hairline there is none of it at all)
      // (it lengthens evenly from the ears to the crown: all of the change in a short way up made a ledge round the head. The locks run
      // out from the crown on top and down the sides and the back, as the strands painted on it do: human.js)
      // (soft: a real face's, whose hair has strips over it, human-hair.js: it thins out to nothing at the hairline, as hair does, with no
      // ledge for the strips to stand on; else it ends a few millimetres thick, the edge of a clean sculpted shape)
      const hy = y - y0, top = ss(-.01, .1, hy), tk = ss(.05, .09, hy), deg = Math.atan2(abs(x), z - z0) * 180 / PI, inn = ss(0, soft ? -.025 : -.02, e);
      const lock = (tk * (lumps(deg * .4, 3.1, 5.5) * .0019 + lumps(deg * .14, 6.1, 2.2) * .0015) * ss(.012, .045, hyp(x, z - z0)) + (1 - tk) * lumps(deg * .45, y * 12, 7.5) * .0011);
      const T0 = (th[1] + (th[0] - th[1]) * top) * (1 - .4 * ss(-.02, -.06, hy)), T = T0 * inn + (soft ? .0006 : mx(.45 * T0, Math.min(T0, .0032))) * (1 - inn) + lock * (.3 + .7 * inn) * Math.min(1, th[0] / .008);
      return smax(d - T, e, .0035);
    },
    m, lo: [-.1, y0 - .095, HC[2] - .13], hi: [.1, y0 + .14, HC[2] + .112],
  };
}
// A woman's long hair: a fall of it down the back of the head and the neck to between the shoulders, combed straight down
function longShape() {
  const c = Hd(0, -.07, -.075);
  return {
    field: (x, y, z) => ball3(x - c[0], y - c[1], z - c[2], .085, .12, .06),
    folds(x, y, z) { const deg = Math.atan2(abs(x), z - HC[2] + .0125) * 180 / PI; return lumps(deg * .5, y * 5, 7.5) * .0022 + lumps(deg * .17, y * 3, 2.5) * .0012; },
    foldMax: .0035, lo: [c[0] - .088, c[1] - .123, c[2] - .063], hi: [c[0] + .088, c[1] + .123, c[2] + .063],
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

// a shape's sizes times k (an ear grown bigger: its balls, rings and limbs; where it is is the caller's)
const scaled = (s, k) => s.ball ? { ball: typeof s.ball === 'number' ? s.ball * k : s.ball.map(v => v * k) } : s.torus ? { torus: s.torus.map(v => v * k) } : s.r ? { r: typeof s.r === 'number' ? s.r * k : s.r.map(v => v * k) } : {};
// ================================================================= a real face (f.real)
// A real face is not one smooth round: it has the folds and hollows that come with how its flesh lies over the bone, and
// they change with age and weight. They are pressed into the skin of every shape of the face alike (field.js folds: a height to
// add, negative for a groove), so where shapes melt together the groove runs on across them unbroken.
export const RELIEF = .006;   // the most any of them adds or takes away (metres)
/**
 * The grooves and swellings of a real face f ({ age (years), fat (0 thin .. 1 heavy), soft, nose, noseW, asym (0..1), aseed }): a function (x, y, z) => height
 * (metres, the person's space). Always: the fold from the wing of the nose to beside the corner of the mouth, the trough under the eye with a
 * little swell of the lower lid over it, the groove under the lower lip, the crease round the wing of the nose. With age: all of those deeper,
 * the lines down from the corners of the mouth, hollows at the temples and under the cheekbones, the cords of an old neck. Thin faces are
 * hollower, heavy ones fuller and smoother. And the two sides never quite the same (asym: how uneven, aseed: where).
 */
export function reliefOf(f) {
  const a = ss(24, 78, f.age ?? 30), fp = ((f.fat ?? .5) - .5) * 2, so = f.soft || 0, NS = f.nose || 1, NW = f.noseW || 1, thin = mx(0, -fp), heavy = mx(0, fp);
  // a line seen from in front (x, y from the eyes): out = [how far from it, how far along it (0..1), which side (+: away from the face's middle)]
  const o = [0, 0, 0], seg = (ax, hy, x0, y0, x1, y1) => {
    const ex = x1 - x0, ey = y1 - y0, t = mx(0, Math.min(1, ((ax - x0) * ex + (hy - y0) * ey) / (ex * ex + ey * ey))), dx = ax - x0 - ex * t, dy = hy - y0 - ey * t;
    o[0] = hyp(dx, dy); o[1] = t; o[2] = dx * -ey + dy * ex > 0 ? -1 : 1; return o;
  };
  const DN = .00035 + .0014 * a + .0005 * heavy - .00015 * so, DT = .00025 + .0011 * a + .0005 * thin, BAG = .0002 + .0009 * a + .0002 * heavy, DM = .0006 + .0005 * a;
  const g = f.gnm, wx = g ? noseOf(f)[0] : .0108 * NS * NW, wy = g ? noseOf(f)[1] : -.039, WR = .0074 * NS, MY = mouthY(f), EY = eyeOf(f), ex = EY[0] - EYE[0];   // the wing of the nose (the mouth, the eyes)
  const AS = (f.asym || 0) * .0011, ph = (f.aseed || 0) * 7.3;   // (how uneven its two sides are, and where its unevenness falls)
  const sx = g ? g.lip.half - .027 : 0, sy = g ? g.lip.line[6] + .0655 : 0;   // (a GNM face's corners of the mouth from where a real face of ours has them: the folds by them go with them)
  return (x, y, z) => {
    const ax = abs(x), hy = y - HC[1], hz = z - HC[2]; let h = 0;
    if (hy > .07 || hy < -.2) return 0;
    if (hz > .04 && hy > -.1 && hy < -.005) {
      // the fold from the nose to the mouth, with the cheek standing over it (the side away from the middle)
      seg(ax, hy, wx + .0068 * NS * NW, wy + .006, .0305 + .002 * a + sx, -.074 - .004 * a + sy);
      if (o[0] < .012) { const t = o[1], g = ss(0, .12, t) * ss(1, .78, t) * ss(.05, .065, hz); h -= DN * bump(o[0], 0, .0034) * g; if (o[2] > 0) h += DN * .35 * bump(o[0], .005, .005) * g; }
      // the trough under the eye, from by the nose down and out, a little swell between it and the lower lid
      seg(ax, hy, .0185 + ex, -.0115, .043 + ex, -.0255);
      if (o[0] < .012) { const t = o[1], g = ss(0, .15, t) * ss(1, .7, t) * ss(.055, .068, hz); h -= DT * bump(o[0], 0, .003) * g; if (o[2] < 0 || hy > -.012) h += BAG * bump(o[0], .0042, .0034) * g; }
      // the crease round the wing of the nose (on the side of it facing the cheek and above)
      { const dx = ax - wx, dy = hy - wy, r = hyp(dx, dy), ang = Math.atan2(dy, dx); if (r < WR + .006 && r > WR - .004 && hz > .08) h -= .0007 * bump(r, WR, .0016) * ss(-1.2, -.6, ang) * ss(2.6, 2.1, ang); }
    }
    if (hz > .04 && hy < -.07 && hy > -.11) {
      // the groove under the lower lip (curving up at its ends), and with age the lines down from the corners of the mouth
      const yc = MY - .0168 + .009 * (ax / .022) ** 2; h -= DM * bump(hy, yc, .0028) * ss(.026 + sx, .016 + sx, ax);
      if (a > 0) { seg(ax, hy, .0262 + sx, -.072 + sy, .031 + sx, -.099 + sy); if (o[0] < .014) { const g = ss(0, .15, o[1]) * ss(1, .75, o[1]); h -= .0011 * a * bump(o[0], 0, .0028) * g; if (o[2] > 0) h += .0007 * (a + .5 * heavy) * bump(o[0], .0065, .0055) * ss(.3, .7, o[1]); } }
    }
    // hollows: the temples, and under the cheekbones (thin and old faces)
    if (ax > .04) {
      const tq = hyp(ax - .066, hy - .03, hz - .022); if (tq < .03) h -= (.0013 * a + .0012 * thin) * bump(tq, 0, .016);
      const cq = hyp(ax - .052, hy + .05, hz - .05); if (cq < .03) h -= (.001 * a + .0018 * thin) * bump(cq, 0, .015);
    }
    // no face is the same both sides: broad soft swells and dips (a cheek a little fuller, one side of the jaw or the mouth a little
    // lower), different on the left and the right, none round the eyes (a lid that isn't even reads as a droop)
    if (AS) { const e = hyp(ax - EY[0], hy - EY[1], hz - EY[2]); if (e > .016) h += AS * lumps(x * 21 + ph, y * 21 + ph * .7, z * 21 + 3.1) * ss(.016, .03, e); }
    // the cords down the front of an old neck
    if (a > 0 && hy < -.12 && hz > .0 && ax < .05) h += .0011 * a * bump(ax, .019, .006) * ss(-.125, -.14, hy) * ss(-.2, -.17, hy);
    return mx(-RELIEF, Math.min(RELIEF, h));
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
  const f = a.face, S = [], so = f.soft, J = f.jaw, CH = f.chin, BR = f.brow, NS = f.nose, CK = f.cheeks, nk = a.neck;
  // a real face (f.real): its folds pressed into every shape of its skin, and its age and weight in its mass (see reliefOf)
  const real = !!f.real, es = esOf(f), age = real ? ss(24, 78, f.age ?? 30) : 0, fp = real ? ((f.fat ?? .5) - .5) * 2 : 0, FW = real ? f.faceW ?? 1 : 1, NW = real ? f.noseW ?? 1 : 1;
  const BG = real ? (f.bridge ?? 1) - 1 : 0, TIP = real ? f.tip ?? 0 : 0, EAR = real ? f.ears ?? 1 : 1, LF = real ? f.lidFold ?? .3 : 0;
  // (and its whole shape brought to lie where a real head's does: the fit to a real head scan, human-fit.js, grown into every shape of its skin
  // before it is meshed (field.js grow); a woman's face has half of it, the rest of her shape being her own; a.fit: false leaves it out, a.fit a
  // table to use in its place, the whole of it. A face with a heritage (f.kin, human.js realFace) has the fit of its own sex and heritage instead,
  // the whole of it too (each of those was worked out on that sex's own head with no fit on it: scripts/head-fit.mjs solve=1)
  // (a face from GNM Head, f.gnm: its whole shape from that, human-gnm.js; our neck, hair and hats round it)
  const G = real && f.gnm ? gnmHead(f, Hd(0, EYE[1], EYE[2])) : null;
  const kin = real && a.fit !== false && !(a.fit && typeof a.fit === 'object') && f.kin ? kinTable(so > .5, f.kin) : null, own = kin || (a.fit && typeof a.fit === 'object' ? a.fit : null);
  const relief = real ? reliefOf(f) : null, fk = real && !G && a.fit !== false ? own ? 1 : 1 - .5 * so : 0;   // (a GNM head: its own shape, unfitted; the folds of age along its own outlines)
  const grow = fk ? (x, y, z) => fk * fitAt(x, y - HC[1], z - HC[2], own) : null, grown = s => grow ? { ...s, grow, growMax: FIT_MAX } : s, fitted = s => grown(relief ? { ...s, folds: relief, foldMax: RELIEF } : s);
  const A = s => S.push(s.cut ? { slot: 'skin', ...s } : fitted({ slot: 'skin', ...s }));
  // (a real face's width: wider or narrower below the brow, fuller low down when heavy, and with age the flesh of the jaw hanging a little at its corners)
  // (and fuller round the mouth, squarer in front there: narrowing fast below the cheeks it had a muzzle)
  // (and the jaw as broad as a real one: the clean face's narrows to a V, and its cheeks, standing out over that, cast a shelf of shade in a high sun)
  const row = real ? (y, w, zf, zb, zc, pf = 2.2, pb = 2) => slice0(y, w * (y < .03 ? FW : 1) * (1 + .06 * fp * ss(-.035, -.085, y)) + .012 * (1 - .3 * so) * bump(y, -.09, .022) * ss(-.112, -.094, y) + .004 * (1 - .5 * so) * bump(y, -.104, .008) + .0009 * age * bump(y, -.086, .016) + .0014 * mx(0, fp) * bump(y, -.095, .02), zf, zb, zc, pf + .6 * bump(y, -.056, .026) - .45 * bump(y, -.004, .03), pb) : slice0;
  // ---- the mass of it: the face in slices from under the chin to the forehead, widest at the cheekbones, the jaw's
  // corners under the ears (each slice ends at the back of the jaw: behind it is the neck), and the skull, a ball over
  // and behind it (the slices end inside the ball: the top of the forehead and the crown are the ball's own round)
  const CJ = (CH + J) / 2, sq = .15 * so;   // (a woman's jaw is rounder across)
  // (fuller or leaner cheeks: on a real face over the cheek's height, not one slice: one slice alone stood out as a ridge from the corner of
  // the mouth to the ear, or sank in as a groove)
  const CKd = .03 * (CK - 1), CKw = real ? [.3, .55, .3] : [0, 1, 0];
  const face = new Loft([
    row(-.1085, .0105 * CH, .0745, .054, .064), row(-.1045, .0195 * CH, .081, .04, .06, 2.15 - sq), row(-.0985, .027 * CJ, .0845, .026, .052, 2.15 - sq), row(-.0905, .035 * J, .0855, .01, .038, 2.15 - sq),
    row(-.0805, .043 * J, .085, -.006, .022, 2.1 - sq), row(-.07, .0495 * (.15 + .85 * J), .0835, -.016, .01, 2.1 - sq), row(-.058, .0568 * (.4 + .6 * J) + CKd * CKw[0], .0825, -.024, .006, 2.1 - sq / 2),
    row(-.043, .0622 * (.7 + .3 * J) + CKd * CKw[1], .084, -.034, .006, 2.15 - sq / 3), row(-.02, .066 + CKd * CKw[2], .0865, -.042, .008, 2.2), row(0, .0685, .088, -.05, .006, 2.3),
    row(.022, .0705, .0905, -.06, 0, 2.35), row(.045, .0725, .0915, -.08, -.01, 2.3), row(.068, .066, .081, -.09, -.014, 2.2), row(.084, .05, .062, -.08, -.014),
  ]);
  // the neck: as deep as it is wide and nearly as wide as the jaw, standing behind it (its front a hand's width back from the chin), wider at its foot
  const neck = new Loft(neckRows(nk));
  const base = G ? [{ field: (x, y, z) => smax(G.d(x, y, z), -G.cut(x, y, z), .012), lo: G.lo, hi: G.hi, blend: 0 }, { loft: neck, blend: .014 }]
    : [{ loft: face, blend: 0 }, { ball: [.0755, .09, .1], at: Hd(0, .026, -.006), blend: .008 }, { loft: neck, blend: .014 }];
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
  if (!G) {
  const BRr = BR * (real ? 1.12 : 1);   // (a real brow ridge stands out more over the eyes: they are set in under it)
  A({ taper: [Hd(.0125, .0225, .083 + (real ? .0025 : 0)), Hd(.052, .025, .0655 + (real ? .002 : 0))], r: [.0086 * BRr, .0066 * BRr], mirror: true, blend: .02 });   // brow ridge
  A({ ball: .0078 * BR, at: Hd(0, .0205, .0812), blend: .018 });
  A({ ball: [.0115, .015, .012], at: Hd(.046, -.021, .056), mirror: true, blend: real ? .018 : .03 });                                  // cheekbones (a round cheek: a shelf of bone with a hollow under it is a gaunt face)
  // ---- eyes: a socket under the brow, the lids a shell over the eyeball that fills it, a fold of skin over the upper lid, and the opening between the lids
  const ES = es, E = (dx, dy, dz) => Hd(EYE[0] + dx * ES, EYE[1] + dy * ES, EYE[2] + dz * ES);   // (a place by the left eye, as far from its middle as on a life-size one)
  S.push(grown({ ball: [.019 * ES, .016 * ES, .0115 * ES], at: E(-.0002, .0035, .0222), mirror: true, cut: true, slot: 'skin', blend: .018 }));   // (the socket: moved with the skin round it)
  S.push({ ball: [(real ? .0151 : .0158) * ES, .0138 * ES, .0138 * ES], at: E(real ? -.0015 : -.0008, real ? .0006 : 0, real ? -.0008 : 0), mirror: true, slot: 'lid', blend: .006,   // (a real face's a little up and back: its lower lid no bag)
    ...(grow ? { grow: (x, y, z) => mx(0, grow(x, y, z)), growMax: FIT_MAX } : {}) });   // (and fuller where the fit fills the skin out over it, but never drawn back off the eyeball)
  // (a real face's upper lid full from the fold up to the brow, as a real head's is: with the hollow there that the clean face has, a real one's
  // eyes looked sunk in their sockets, ringed in shade)
  if (real) A({ ball: [.0145 * ES, .0068 * ES, .0075 * ES], at: E(-.0045, .0155, .0052), mirror: true, blend: .012 });
  // (the fold of skin over the upper lid: on a real face lower and fuller the more hooded the eye is, down to a lid with no crease showing)
  const fy = -.0013 * LF - .0006 * age, fz = .0007 * LF, fr = 1 + .3 * LF;
  A({ taper: [E(-.0135, .0088 + fy, .0045 + fz), E(.001, .0128 + fy, .0052 + fz)], r: [.0032 * fr, .0039 * fr], mirror: true, blend: .003 });
  A({ taper: [E(.001, .0128 + fy, .0052 + fz), E(.0145, .0088 + fy * 1.3, -.0045 + fz)], r: [.0039 * fr, .0028 * fr], mirror: true, blend: .003 });
  S.push({ ...eyeOpening(f.eyes, es, f.tilt || 0, real, f.gnm), mirror: true, cut: true, slot: 'lash', blend: .0022 });
  // ---- nose: a wedge standing out of the face from between the eyes (the bridge, with its flanks), the tip, the wings beside it, the nostrils under them
  // (a real nose: its bridge higher or lower, its tip up or down, wider or narrower across the wings)
  // (a real nose is longer, its tip lower, only a little above where it meets the lip, so its nostrils open downward, out of sight from in front, and
  // its bridge starts deeper between the eyes: the clean face's snub nose, its tip high over the lip, showed its nostrils from in front)
  const ty = .0022 * TIP - .0012 * age - (real ? .001 : 0), tz = .0012 * TIP + .0008 * age - (real ? .0005 : 0), dn = real ? 1 : 0;
  if (!real) {
    A({ taper: [Hd(0, .004, .081 + .004 * BG - .0028 * dn), Hd(0, -.026 - .003 * dn, .1025 + .005 * BG)], r: [.0054 - .0008 * so - .0006 * dn, .0074 * NS], blend: .013 });
    A({ ball: [.014 * NS * (.6 + .4 * NW), .0235, .0095], at: Hd(0, -.0165 - .002 * dn, .086 + .003 * BG), rot: [-.56, 0, 0], blend: .016 });
    A({ ball: [.0092 * NS * (.75 + .25 * NW), (real ? .0072 : .0082) * NS, .0085 * NS], at: Hd(0, -.034 + ty, .1048 + tz), blend: .009 });
    A({ ball: [.0068 * NS * NW, .0062, .0082], at: Hd(.0108 * NS * NW, -.039 + ty * .4 - .0012 * dn, .0948 - .001 * dn), mirror: true, blend: .008 });
    A({ taper: [Hd(0, -.038 + ty, .1075 + tz), Hd(0, -.0423 + ty * .3, .091)], r: [.0034, .004], blend: .005 });
    A({ ball: real ? [.0046 * NW, .0035, .0066] : [.0042, .0034, .0062], at: Hd(.0064 * (real ? .5 + .5 * NW : 1), -.0447 + ty * .3 - .0012 * dn, .098 - .0025 * dn), rot: [.5, 0, .2], mirror: true, cut: true, blend: .003 });
  } else {
    // a real nose, measured against a real head scan (scripts/head-fit.mjs): a narrow, straight ridge from between the eyes to the tip, its sides
    // falling steeply to the cheeks (a ball of flesh under the bridge had made it a broad soft wedge); a tip of two domes; wings that stand out
    // from the face with a crease round them (in the face's folds, reliefOf); the nostrils on its underside, out of sight from in front; the
    // column between them running back to the lip at a little more than a right angle
    // (not moved by the fit: the nose is measured against the scan in its own shapes, finer than the fit's table can follow, which ate into its wings)
    const nw = NS * (.75 + .25 * NW), rz = 0, A = s => S.push({ slot: 'skin', ...s, ...(relief && !s.cut ? { folds: relief, foldMax: RELIEF } : {}) });
    A({ loft: new Loft([slice0(.008, .0085 * nw, .0925 + .004 * BG, .07, .076), slice0(-.004, .0066 * nw, .0975 + .005 * BG + rz, .072, .08), slice0(-.016, .0063 * nw, .1035 + .005 * BG + rz, .074, .083),
      slice0(-.027, .007 * nw, .1095 + .004 * BG + tz, .074, .086), slice0(-.036, .0068 * nw, .1035 + .002 * BG + tz, .074, .088)]), blend: .009 });
    A({ ball: [.0094 * nw, .0068 * NS, .0082 * NS], at: Hd(0, -.0338 + ty, .1054 + tz), blend: .008 });
    A({ ball: [.0042 * nw, .0047 * NS, .0045 * NS], at: Hd(.0033 * nw, -.0335 + ty, .1088 + tz), mirror: true, blend: .004 });
    A({ ball: [.0052 * NS * NW, .0054, .0066], at: Hd(.0104 * NS * NW, -.0408 + ty * .4, .0935), rot: [.25, -.3, .35], mirror: true, blend: .008 });
    A({ taper: [Hd(0, -.039 + ty, .1072 + tz), Hd(0, -.0462 + ty * .3, .0935)], r: [.0033, .0038], blend: .005 });
    A({ ball: [.0027 * NW, .0021, .0048], at: Hd(.0052 * (.5 + .5 * NW), -.0458 + ty * .3, .0975), rot: [-.2, -.22, 0], mirror: true, cut: true, blend: .003 });
  }
  // ---- mouth: the lips on the round of the teeth; the chin under it
  A({ ...mouthShape(f), blend: .013 });
  A({ ball: [.0165 * CH, .0115 * CH, .0115], at: Hd(0, -.0935 - .0015 * age, .075 - .0015 * so), blend: .01 });
  if (real) {
    // the flesh of a real face: the round of each cheek under the eye (fuller young and heavy, lower with age). (A heavy face's fuller
    // lower cheeks and jaw are in its slices, above: balls of flesh along the jaw or under the chin left ledges and lumps)
    const ck = .82 + .3 * ((f.fat ?? .5)) - .2 * age;
    A({ ball: [.0165 * ck, .016 * ck, .0075 * ck], at: Hd(.0335, -.028 - .005 * age, .0635 - .002 * age), mirror: true, blend: .02 });   // (soft-edged: a rounder one left a ledge under it, nose to ear)
  }
  // ---- ears: a shell held out a little from the head behind the jaw, wide at the top and narrow at the lobe, its rim rolled, a bowl in the middle
  // (flesh: thin enough for light to come through, where it stands clear of the skull: human-shapes.js finish())
  { const at = Hd(.0695, -.014 - .004 * (EAR - 1) - (real ? .003 : 0), real ? -.004 : -.008), sp = { at, rot: [0, -.2, -.08] }, E = (s, more) => A({ ...s, ...(EAR !== 1 ? scaled(s, EAR) : {}), space: sp, mirror: true, flesh: true, ...more }), P = (x, y, z) => [at[0] + x * EAR, at[1] + y * EAR, at[2] + z * EAR];
    E({ ball: [.0034, .0225, .013], at: P(.0035, .002, -.0105), blend: .006 }); E({ ball: [.0034, .006, .006], at: P(.0026, -.019, -.007), blend: .006 });
    E({ torus: [.014, .0022], at: P(.0045, .0065, -.0105), rot: [0, 0, PI / 2], blend: .0035 });
    E({ taper: [P(.0056, .015, -.0125), P(.0056, -.005, -.0145)], r: .0022, blend: .003 }); E({ ball: [.0024, .0034, .0026], at: P(.003, -.0035, .0015), blend: .003 });
    E({ ball: [.003, .0072, .0055], at: P(.0066, .0005, -.0065), cut: true, blend: .004 }); }
  }
  // ---- neck: the two cords from behind the jaw's corners (they start inside the neck there) to the breastbone, a man's Adam's apple
  A({ taper: [Hd(.047 * nk, -.045, -.034), [.02 * nk, 1.5, .03]], r: [.0105 * (1 - .3 * so), .012 * (1 - .3 * so)], mirror: true, blend: .02 + .01 * so });
  if (so < .5) A({ ball: .009, at: [0, 1.553, .031], blend: .018 });
  // ---- hair: cropped close under a hat, a man's short back and sides, a woman's lower at the temples and at the nape:
  // tied back in a bun, long down her back, or short in a bob that stands off it
  const hs = a.hair, fem = so > .5;
  if (hs && hs !== 'bald') {
    // (what it grows out of: the head's mass, and over the top of the head the skull's ball alone: the slices of the face end there, and a
    // centimetre off them their measure jumps where they end, which stood in the hair as a ledge round the head)
    const B = ready(real ? base.map(fitted) : base), all = (x, y, z) => { let d = 1e9; for (const s of B) d = smin(d, s.d(x, y, z), s.k); return d; }, crown = B[G ? 0 : 1].d;
    const skull = (x, y, z) => { const w = ss(.035, .06, y - HC[1]); return w <= 0 ? all(x, y, z) : w >= 1 ? crown(x, y, z) : crown(x, y, z) * w + all(x, y, z) * (1 - w); };
    const bob = fem && hs === 'short' && !a.hat, th = a.hat ? [.003, .003] : !fem ? [.0105, .006] : hs === 'long' ? [.012, .011] : [.007, .006];
    if (!bob) S.push({ ...hairShape(skull, th, fem, real && !a.hat), out: .0015, slot: 'hair', blend: .003 });
    if (bob || hs === 'long') {
      // (its edge is an outline of its own: the line where the surface stops being the bob's and becomes the face's, made straight)
      const U = ready(S.filter(s => !s.paint && !s.ghost)), b = bob ? bobShape() : longShape(), near = (s, x, y, z) => x > s.lo[0] - .02 && x < s.hi[0] + .02 && y > s.lo[1] - .02 && y < s.hi[1] + .02 && z > s.lo[2] - .02 && z < s.hi[2] + .02;
      const under = (x, y, z) => { let d = 1e9; for (const s of U) if (near(s, x, y, z)) d = s.cut ? smax(d, -s.d(x, y, z), s.k) : smin(d, s.d(x, y, z), s.k); return d; };
      S.push({ ...b, m: (x, y, z) => b.field(x, y, z) - under(x, y, z), out: .002, slot: 'hair', blend: bob ? .004 : .012 });
    }
    if (hs === 'bun') S.push({ ball: .034, at: Hd(0, .034, -.108), slot: 'hair', lumpy: [.011, .0022], blend: .012 });
  }
  // (the brows are in the face's paint: human-paint.js) a moustache stands a little proud
  if (a.moustache && !a.face?.real) S.push({ ball: [.0175, .0045, .0055], at: Hd(.0102, MOUTH.y + .012, .0872), rot: [0, .3, -.18], mirror: true, slot: 'brow', lumpy: [.004, .001], blend: .002 });
  // the hat stands over the face: a brim's shadow on the brow
  for (const g of ghosts) S.push({ ...g, ghost: true, slot: null });
  return S;
}
// (the text of all that shapes a head, for the sculpting's version stamp)
export const HEAD_STAMP = FIT_DATA + JSON.stringify(FIT_KIN) + GNM_HASH + [gnmHead, meshField, gnmMarks, eyeOf, mouthY, noseOf, lipAt, kinTable, mouthHalf, beardArea, fitAt, slice0, reliefOf, scaled, esOf, rimOf, ball3, eyeOpening, eyeRim, mouthAt, mouthShape, lineAt, outside, hairShape, longShape, bobShape, browOf, head, lipLine, lidPlan, faceBones, faceShare, partLips, mouthInside, eyeParts].map(String).join('') + JSON.stringify([LIP_U, ES, RELIEF, HC, EYE, MOUTH, MOUTH_DIP, MOUTH_UP, CORNER, LINE_M, LINE_F, JAW, LID_R]);
