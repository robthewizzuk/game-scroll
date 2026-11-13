// The paint of a head of gs.models.human: what is too fine for the head's own points to carry. Brows made of hairs, the dark
// line of the lashes along each lid, lips with an edge to them. It is worked out here, in code, into one small picture for each
// look (no image files): the left half of the face from in front (the right half is its mirror), about a third of a millimetre
// a dot. The picture multiplies the skin's own colour, which stays in the points (so the same skin, the same shading in the
// creases, the same people far off), and each point of the head says where it is on the picture (faceUV: a second set of UVs).
// The shapes it paints are the ones the sculpting carves (human-head.js: eyeRim, browOf, mouthAt), so the colour lies where the
// shape is, and it rides the skin as the face moves. No three.js: plain numbers in, bytes out. Kit use only.
import { lumps } from './field.js';
import { HC, EYE, esOf, rimOf, browOf, mouthAt, lipLine, beardArea, ss, bump } from './human-head.js';

const abs = Math.abs, mx = Math.max, mn = Math.min;
/**
 * The picture: w by h dots for the part of the face from its middle out to x1 and from y0 to y1 (metres, y from the line of the
 * eyes); z0: only what stands this far in front of the middle of the head is on it (the back of the head would land on the face);
 * plain: the value that leaves the skin as it is (under 1, so paint can lighten as well as darken: the material's colour is 1 / plain).
 */
export const FACE = { w: 256, h: 512, x1: .08, y0: -.125, y1: .045, z0: .048, plain: .8 };
/** A real face's picture (f.real) reaches higher, to take in the lines across the forehead (its rows a little taller: .4 mm). */
export const FACE_REAL = { ...FACE, y1: .085 };
/** Where a point of the head (the person's space) is on the picture (L: FACE, or FACE_REAL for a real face): out = [u, v]. Whatever is not the front of the face lands on the picture's edge, which is plain. */
export function faceUV(x, y, z, out, L = FACE) {
  const u = (abs(x) + 6 * mx(0, L.z0 - (z - HC[2]))) / L.x1, v = (y - HC[1] - L.y0) / (L.y1 - L.y0);
  out[0] = u < 0 ? 0 : u > 1 ? 1 : u; out[1] = v < 0 ? 0 : v > 1 ? 1 : v; return out;
}
// sRGB bytes from light (the picture is read as sRGB). Looked up: a power for every dot was most of the time a picture took. ENC is
// the byte at each of 4096 steps of light (never more than one byte apart), STEP the light at which each byte begins, so the answer is exact
const ENC = new Uint8Array(4097), STEP = new Float64Array(257);
for (let i = 0; i <= 4096; i++) { const v = i / 4096; ENC[i] = Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055)); }
for (let b = 0; b <= 256; b++) { const s = (b - .5) / 255; STEP[b] = b === 0 ? -1 : b === 256 ? 2 : s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4); }
const enc = v => { if (v <= 0) return 0; if (v >= 1) return 255; const b = ENC[(v * 4096) | 0]; return v >= STEP[b + 1] ? b + 1 : b; };

/**
 * How much of a brow is at a point (x from the middle of the face, hy from the eyes): 0..1. B: browOf()'s three points; fem: a woman's (finer,
 * with more of an arch to its edge). A band along the round through the three points, blunt at its inner end and running to a point at its
 * tail, made of hairs: they stand up at the inner end and lie along the brow towards the tail, and the band's edges are their ends.
 */
export function browAt(x, hy, B, fem, real = false) {
  const [b0, b1, b2] = B, x0 = b0[0], x1 = b1[0], x2 = b2[0]; if (x < x0 - .004 || x > x2 + .003) return 0;
  // the middle line: the round through the three points
  const yc = b0[1] * (x - x1) * (x - x2) / ((x0 - x1) * (x0 - x2)) + b1[1] * (x - x0) * (x - x2) / ((x1 - x0) * (x1 - x2)) + b2[1] * (x - x0) * (x - x1) / ((x2 - x0) * (x2 - x1)), dy = hy - yc;
  const t = (x - x0) / (x2 - x0), full = real ? (fem ? .0025 : .0036) : fem ? .0019 : .0027, half = full * (1 - .72 * ss(.45, 1.02, t)) * ss(-.14, .04, t);
  if (abs(dy) > half * 1.6 + .0006) return 0;
  // the hairs: lines that lean out along the brow, more upright by the nose; each a little longer or shorter, darker or lighter than the next
  const lean = 1.5 - 1.25 * ss(0, .8, t), q = (x - dy / lean) * 3100, hair = lumps(q, 3.7, fem ? 9.1 : 2.3), fine = lumps(q * 2.3 + 11, 1.9, 5.5);
  const edge = half * (1 + .32 * hair + .12 * fine), k = ss(edge + .00035, edge - .00035, abs(dy) + (dy > 0 ? 0 : .12 * half));
  return k * (.95 + .05 * fine) * ss(1.06, .97, t);
}

// a hash of whole numbers, 0..1 (the same on every phone)
const hash = (a, b, c) => { let q = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; q = (q ^ (q >>> 13)) * 1274126177 | 0; return ((q ^ (q >>> 16)) >>> 0) / 4294967296; };
// how far a point is from a line from (x0, y0) to (x1, y1), and how far along it (0..1): out
const seg = (x, y, x0, y0, x1, y1, out) => {
  const ex = x1 - x0, ey = y1 - y0, t = mx(0, mn(1, ((x - x0) * ex + (y - y0) * ey) / (ex * ex + ey * ey)));
  out[0] = Math.hypot(x - x0 - ex * t, y - y0 - ey * t); out[1] = t; return out;
};
const S2 = [0, 0];
/**
 * The fine lines of a real face f ({ age, soft, lips, aseed }) at a point (x from the middle, hy from the eyes; rim: rimOf(f)): how deep a
 * line is there, 0..1 (a full one about a fifth of a millimetre). They come with age, each kind in its own time: across the forehead from
 * the late twenties, between the brows from the late thirties (less on a woman), crow's feet fanning from the outer corner of each eye
 * from the mid thirties, under the lower lids from forty, and the fine upright lines over the upper lip from fifty. Each wavers and
 * breaks off here and there, and no two faces have them the same (aseed).
 */
export function linesAt(x, hy, f, rim) {
  const age = f.age ?? 30, fem = (f.soft || 0) > .5, ph = (f.aseed || 0) * 3.7; let d = 0;
  // across the forehead: four rows over the brows, the middle two deepest
  const af = ss(27, 62, age);
  if (af > 0 && hy > .03 && hy < .08 && x < .05) for (let k = 0; k < 4; k++) {
    const yk = .036 + .0095 * k + .0013 * Math.sin(x * 95 + k * 1.7 + ph) + .0005 * lumps(x * 300 + k * 5.3, k * 3.1, ph), w = .0006 + .00025 * af;
    const v = bump(hy - yk, 0, w); if (v < .01) continue;
    d = mx(d, v * af * (k === 1 || k === 2 ? 1 : .7) * ss(-.25, .35, lumps(x * 80 + k * 7.1 + ph, k * 2.3, 1.7)) * ss(.046 + .002 * k, .03, x));
  }
  // between the brows: one upright line each side, leaning out towards the top
  const ag = ss(37, 72, age) * (fem ? .5 : 1);
  if (ag > 0 && hy > .008 && hy < .034 && x < .016) { const x0 = .0062 + .0012 * Math.sin(ph), xl = x0 + (hy - .008) * .14; d = mx(d, ag * .8 * bump(x - xl, 0, .0006) * ss(.008, .013, hy) * ss(.034, .026, hy)); }
  // crow's feet: four lines fanning out from the outer corner of the eye, the lowest running down over the cheekbone
  const ac = ss(33, 66, age), ox = rim.cx + rim.w + .0015, oy = -.0008;
  if (ac > 0 && x > ox - .002 && x < ox + .02 && abs(hy - oy) < .016) for (const [a, l] of [[-.6, .011], [-.22, .013], [.14, .012], [.5, .009]]) {
    const ang = a + .08 * Math.sin(ph + a * 5), L = l * (.8 + .4 * ac), x0 = ox + .0035 * Math.cos(ang), y0 = oy + .0035 * Math.sin(ang);
    seg(x, hy, x0, y0, ox + (.0035 + L) * Math.cos(ang), oy + (.0035 + L) * Math.sin(ang), S2);
    d = mx(d, ac * .75 * bump(S2[0], 0, .00055 + .00025 * ac) * ss(0, .15, S2[1]) * ss(1, .5, S2[1]) * ss(-.3, .3, lumps(S2[1] * 6 + a * 9, ph, 1.3)));
  }
  // under the lower lids: two fine arcs, lower and longer the older
  const au = ss(40, 76, age);
  if (au > 0 && hy < -.008 && hy > -.026 && x > .018 && x < .054) for (let k = 0; k < 2; k++) {
    const yk = -.0118 - .0032 * k - .0015 * au + .0048 * ((x - .034) / .016) ** 2; d = mx(d, au * (.6 - .2 * k) * bump(hy - yk, 0, .0005) * bump(x, .034, .011 + .003 * k));
  }
  // over the upper lip: fine upright lines from its edge towards the nose
  const al = ss(50, 82, age) * (fem ? 1 : .55);
  if (al > 0 && x < .02 && hy > -.064 && hy < -.045) {
    const top = lipLine(x, f) + .0078 * (f.lips || 1) * (1 - .6 * ss(.008, .02, x)), i = Math.floor(x / .0034), xi = (i + .5 + .5 * (hash(i, 7, ph | 0) - .5)) * .0034, len = .004 + .004 * hash(i, 9, ph | 0);
    d = mx(d, al * .5 * hash(i, 5, ph | 0) * bump(x - xi, 0, .0004) * ss(top, top + .001, hy) * ss(top + len, top + len * .5, hy));
  }
  return mn(1, d);
}
/** How oily a real face's skin is at a point (0..1): the middle of the forehead, down the nose, the chin, and the lips. */
export function oilAt(x, hy, lip) {
  return mx(.85 * ss(.034, .014, x) * ss(.015, .032, hy), .9 * ss(.017, .008, x) * ss(-.052, -.042, hy) * ss(.03, .016, hy), .6 * ss(.016, .006, x) * ss(-.098, -.108, hy), .7 * lip);
}
/**
 * The fine detail of a real face (o as for paintFace) as a picture of two numbers a dot, laid on as the paint is (FACE_REAL): how high the skin
 * is there (1 its own surface, lower in a line: linesAt), and how oily (oilAt). WebGPU bends the light by the first and makes the skin
 * shinier by the second (hd3d-gpu.js sss twin); WebGL shows the lines in the paint alone. Returns its bytes (RG, w * h * 2, the bottom row first).
 */
export function paintDetail(o) {
  const { w, h, x1, y0, y1 } = FACE_REAL, f = o.face, rim = rimOf(f), px = new Uint8Array(w * h * 2), m3 = [0, 0, 0];
  for (let j = 0; j < h; j++) {
    const hy = y0 + (j + .5) / h * (y1 - y0);
    for (let i = 0; i < w; i++) {
      const x = (i + .5) / w * x1, lip = hy < -.045 && hy > -.092 && x < .034 ? mouthAt(x, hy, f, m3)[1] : 0, at = (j * w + i) * 2;
      px[at] = Math.round(255 * (1 - linesAt(x, hy, f, rim))); px[at + 1] = Math.round(255 * oilAt(x, hy, lip));
    }
  }
  for (let i = 0; i < w; i++) { px[i * 2] = px[((h - 1) * w + i) * 2] = 255; px[i * 2 + 1] = px[((h - 1) * w + i) * 2 + 1] = 0; }   // (the edges, where everything off the face lands: plain)
  for (let j = 0; j < h; j++) { px[(j * w + w - 1) * 2] = 255; px[(j * w + w - 1) * 2 + 1] = 0; }
  return px;
}

/**
 * Paints the picture for a look: { face (the spec's: eyes, lips, soft), fem, stubble (0..1), skin, brow, lips, lash, mouth (each [r, g, b]
 * as light, not sRGB) }. Returns its bytes (RGBA, w * h * 4, the bottom row first), to be read as sRGB.
 */
export function paintFace(o) {
  const { w, h, x1, y0, y1, plain } = o.face.real ? FACE_REAL : FACE, f = o.face, fem = !!o.fem, px = new Uint8Array(w * h * 4), S = o.skin;
  // each colour as a share of the skin's (what the skin's colour has to be multiplied by to become it), no lighter than the picture can say
  const of = c => [0, 1, 2].map(i => mn(1 / plain, c[i] / mx(1e-4, S[i]))), BR = of(o.brow), LP = of(o.lips), LA = of(o.lash), MO = of(o.mouth);
  const B = browOf(f.soft), rim = rimOf(f), ES = esOf(f), ex0 = rim.cx - rim.w, exw = 2 * rim.w, m3 = [0, 0, 0];
  const stub = o.stubble || 0, P = enc(plain), R = !!f.real; let r, g, b;
  // (a real beard or moustache, o.beard { beard, moustache, colour }: the skin under its single hairs (human-head.js eyeParts) the colour of the
  // hairs lying close over it and their roots, in fine strokes down the face, so what shows between the hairs is more beard, not bare skin)
  const BD = R && o.beard ? { face: f, beard: o.beard.beard || 0, moustache: !!o.beard.moustache } : null, BC = BD ? of(o.beard.colour) : null, B2 = [0, 0];
  // (a real face's skin is never one colour: faint blotches of warmer and cooler, freckles on fair skin that has them (f.freckles), a few
  // moles, brown spots with age, a little shadow of colour under the eyes, and its fine lines (linesAt) a shade darker in their depths)
  const ph = (f.aseed || 0) * 3.7, seed = Math.floor((f.aseed || 0) * 100), lum = .3 * S[0] + .59 * S[1] + .11 * S[2], fair = ss(.18, .5, lum), dark = 1 - ss(.04, .16, lum);
  const frk = R ? (f.freckles || 0) * fair : 0, spots = R ? ss(55, 82, f.age ?? 30) * (1 - .6 * dark) : 0;
  const moles = R ? Array.from({ length: Math.floor(hash(seed, 3, 1) * 3.6) }, (_, k) => [.012 + .055 * hash(seed, k, 11), -.1 + .12 * hash(seed, k, 12), .0006 + .0006 * hash(seed, k, 13)]) : [];
  // (a real face's paint is quieter: finer, fainter brows with skin between the hairs (the hairs over them are strands), a thin even line along the lashes (their roots: the lashes are
  // strands, human-head.js eyeParts), lips nearer the skin's own colour)
  const put = (C, k) => { r += (C[0] - r) * k; g += (C[1] - g) * k; b += (C[2] - b) * k; };
  for (let j = 0; j < h; j++) {
    const hy = y0 + (j + .5) / h * (y1 - y0);
    for (let i = 0; i < w; i++) {
      const x = (i + .5) / w * x1; let lip = 0; r = g = b = 1;
      // ---- brows
      if (hy > .008 && hy < .04) { const k = browAt(x, hy, B, fem, R); if (k > 0) put(BR, k * (R ? (fem ? .72 : .8) * (.75 + .25 * lumps(x * 5200, hy * 900, 1.3)) : fem ? .95 : .98)); }
      // ---- the lids: the lashes' line along the upper one (thicker towards its outer end, its edge the lashes' own ends), a fainter one under
      // the eye, a soft shade over the upper lid; inside the opening the upper lid's edge is dark, the lower one's pale, the corner by the nose pink
      if (abs(hy - EYE[1]) < .02 && x > ex0 - .004 && x < ex0 + exw + .006) {
        const q = rim(x, hy), d = q[0], up = q[1], a = (x - ex0) / exw, pink = d < .0004 ? ss(.0098 * ES, .0118 * ES, EYE[0] - x) : 0;
        if (up) {
          const wl = (fem ? .0021 : .0016) * (R ? .45 : 1) * (.55 + .95 * ss(0, 1, a)) * (1 + (fem ? .3 : .2) * (R ? .3 : 1) * lumps(a * 46, 4.1, 7.7)) * ss(-.04, .1, a);
          const line = d <= 0 ? 1 : ss(wl + .0003, wl - .0001, d), shade = ss(.0062, .001, d) * ss(-.1, .25, a) * ss(1.25, .9, a) * (fem ? .2 : .14) * (R ? .6 : 1);
          put(LA, mx(line * (fem ? .96 : .92), shade) * (1 - pink));
        } else {
          const line = d <= 0 ? ss(-.0009, -.0001, d) * .2 : ss(.0007, .0001, d) * ss(.15, .5, a) * (fem ? .45 : .28);
          if (d <= 0) { r *= 1 + .03 * (1 - pink); g *= 1 - .07 * (1 - pink); b *= 1 - .06 * (1 - pink); }   // (the wet edge of the lower lid)
          put(LA, line * (1 - pink));
        }
        if (pink > 0) { r *= 1 + .06 * pink; g *= 1 - .22 * pink; b *= 1 - .2 * pink; }
      }
      // ---- lips: their colour where the sculpting stands them out (the upper one a shade darker: it faces down; a little light along the
      // round of the lower one), and the dark line between them
      if (hy < -.045 && hy > -.092 && x < .034) {
        const m = mouthAt(x, hy, f, m3), line = m[2]; lip = m[1];
        if (lip > 0) {
          const v = hy - lipLine(x, f), k = ss(0, .55, lip) * (R ? (fem ? .92 : .88) : fem ? .92 : .86), sh = v > 0 ? .9 : 1 + .1 * bump(v, -.0042 * f.lips, .0022) * bump(x, 0, .012);
          put([LP[0] * sh, LP[1] * sh, LP[2] * sh], k);
        }
        if (line > .02) put(MO, mn(1, line * (fem ? .62 : .58) * (R ? .8 : 1)));
      }
      // ---- stubble: fine dots of shadow over the jaw, the chin and the upper lip (the points carry its even shade)
      // (over the same ground as the points' shadow: up the cheek towards the sideburn; each dot the end of a hair, darker than the shade)
      const btop = -.042 + .045 * ss(.035, .07, x);
      if (stub > 0 && hy < btop) {
        const k = ss(btop, btop - .014, hy) * (1 - lip) * mn(1, stub * 1.4) * mx(0, lumps(x * 3300, hy * 3300, 3.3)) * .55; if (k > 0) { r *= 1 - k; g *= 1 - k * .92; b *= 1 - k * .8; }
      }
      if (R) {
        // ---- the colour of a real skin, part by part, as the head scan a real face is fitted to has it (human-fit.js; measured as the red
        // against the green of each part beside the forehead's, its light left out): the lids and between the brows reddest (thin skin), the
        // nose, under the eyes, the cheeks, round the mouth and the chin a little, the ears warmer; less of it the darker the skin
        let fl = 0;
        if (hy > -.004 && hy < .022 && x > ex0 - .004 && x < ex0 + exw + .006) { const q = rim(x, hy), a = (x - ex0) / exw; if (q[1]) fl += 1.5 * ss(-.0002, .0009, q[0]) * ss(.011, .0045, q[0]) * ss(-.12, .12, a) * ss(1.2, .95, a); }
        fl += 1.5 * bump(x, .0165, .0035) * bump(hy, -.0005, .004);   // (the inner corners)
        fl += 1.25 * ss(.022, .011, x) * ss(.006, -.006, hy) * ss(-.051, -.043, hy) + 1.25 * ss(.014, .006, x) * bump(hy, .013, .006);   // (the nose; between the brows)
        fl += .6 * bump(hy, -.0155, .006) * bump(x, .033, .012) + .8 * ss(.024, .034, x) * ss(.07, .058, x) * ss(-.064, -.048, hy) * ss(-.002, -.014, hy);   // (under the eyes; the cheeks)
        fl += .7 * ss(.03, .02, x) * ss(-.062, -.046, hy) * ss(-.04, -.046, hy) * (1 - lip) + .5 * ss(.022, .012, x) * ss(-.112, -.1, hy) * ss(-.08, -.09, hy) + .25 * ss(.05, .06, x) * ss(-.01, .005, hy) * ss(.035, .02, hy);   // (round the mouth, the chin, the temples)
        const ear = ss(.062, .068, x) * ss(-.05, -.04, hy) * ss(.025, .015, hy); fl += .75 * ear;
        fl = mn(fl, 2.6) * (1 - .55 * dark); if (fl > 0) { r *= 1 + .06 * fl; g *= 1 - .07 * fl; b *= 1 - .05 * fl - .06 * ear * (1 - dark); }
        // (and on a grown man the shadow of a shaven beard over the jaw, the chin and the upper lip: a little greyer and bluer, as on the scan)
        const sh = fem ? 0 : ss(15, 24, f.age ?? 30) * ss(btop, btop - .012, hy) * (1 - lip) * .07 * (1 - .7 * dark); if (sh > 0) { r *= 1 - sh * 1.3; g *= 1 - sh; b *= 1 - sh * .4; }
        if (BD) { beardArea(BD, x, hy, .095 - 6 * x * x, B2); const kb = B2[0], km = B2[1]; if (kb + km > .01) put(BC, mn(.8, mx(kb ** 1.4 * mn(1, .4 + BD.beard) * .72, km ** 1.4 * .62) * (.6 + .4 * lumps(x * 2600, hy * 420, 3.3)) * ss(x1, x1 - .012, x))); }   // (fading out before the picture's edge: the skin's own colouring carries it on)
        const ln = linesAt(x, hy, f, rim); if (ln > 0) { const k = .1 * ln; r *= 1 - k * .9; g *= 1 - k; b *= 1 - k * .95; }
        const bl = lumps(x * 55 + ph, hy * 55, 1.1) * .022, bl2 = lumps(x * 140 + 4, hy * 140 + ph, 2.3) * .012; r *= 1 + bl + bl2; g *= 1 + bl * .6 + bl2; b *= 1 + bl * .3 + bl2 * .8;
        const ue = bump(hy, -.0135, .0055) * bump(x, .034, .011) * (.05 + .05 * ss(30, 70, f.age ?? 30)); if (ue > 0) { r *= 1 - ue * .8; g *= 1 - ue; b *= 1 - ue * .7; }
        if (frk > 0) {   // freckles: on the cheeks and over the nose most, a few on the forehead
          const zone = mx(bump(hy, -.022, .016) * ss(.07, .05, x), .5 * ss(.05, .025, hy) * ss(.035, .055, hy) * ss(.05, .03, x)), C = .0021, ci = Math.floor(x / C), cj = Math.floor(hy / C) + 400, h1 = hash(ci, cj, seed);
          if (h1 < frk * zone * .8) { const fx = (ci + .2 + .6 * hash(ci, cj, seed + 1)) * C, fy = (cj - 400 + .2 + .6 * hash(ci, cj, seed + 2)) * C, rr = .00028 + .00038 * hash(ci, cj, seed + 3), k = ss(rr, rr * .45, Math.hypot(x - fx, hy - fy)) * (.1 + .1 * hash(ci, cj, seed + 4));
            if (k > 0) { r *= 1 - k * .7; g *= 1 - k; b *= 1 - k * 1.25; } }
        }
        if (spots > 0) {   // brown spots with age: soft, a few millimetres across, on the forehead, the temples and the cheeks
          const C = .011, ci = Math.floor(x / C), cj = Math.floor(hy / C) + 40, h1 = hash(ci, cj, seed + 7);
          if (h1 < .4 * spots && (hy > .015 || x > .035)) { const fx = (ci + .25 + .5 * hash(ci, cj, seed + 8)) * C, fy = (cj - 40 + .25 + .5 * hash(ci, cj, seed + 9)) * C, rr = .0018 + .0024 * hash(ci, cj, seed + 10), k = ss(rr, rr * .3, Math.hypot(x - fx, hy - fy)) * .07 * spots;
            if (k > 0) { r *= 1 - k * .6; g *= 1 - k; b *= 1 - k * 1.4; } }
        }
        for (const [mx0, my0, mr] of moles) { const d = Math.hypot(x - mx0, hy - my0); if (d < mr * 1.5) { const k = ss(mr, mr * .5, d) * .42; r *= 1 - k * .8; g *= 1 - k; b *= 1 - k * 1.1; } }
      }
      const at = (j * w + i) * 4; px[at + 3] = 255;
      if (r === 1 && g === 1 && b === 1) px[at] = px[at + 1] = px[at + 2] = P;   // (most of a face is its skin's own colour)
      else { px[at] = enc(r * plain); px[at + 1] = enc(g * plain); px[at + 2] = enc(b * plain); }
    }
  }
  // the edges that points off the face land on (the outer side, the top and the bottom) are plain
  const flat = (i, j) => { const at = (j * w + i) * 4; px[at] = px[at + 1] = px[at + 2] = P; };
  for (let i = 0; i < w; i++) { flat(i, 0); flat(i, h - 1); } for (let j = 0; j < h; j++) flat(w - 1, j);
  return px;
}

/** The picture of combed hair: w by h dots; round: how many times it is laid round a head; plain: the value that leaves the hair's own colour as it is. */
export const HAIR = { w: 256, h: 4, round: 8, plain: .82 };

/**
 * The fine work of an iris, for a real face's eyes (one picture for everybody: each eye is turned its own way on it, human.js): w by w dots
 * of the iris seen from in front, its edge (the limbus) at `edge` of the picture's half width and plain beyond (the white is laid there), the
 * pupil's edge at `pupil` of the iris's radius. Shares of the eye's own colours, as light (plain: the value that leaves them be): fine fibres
 * running out from the pupil, a darker ruff round it, the collarette (a wavy ring a little way out, warmer and lighter, as most eyes have),
 * crypts (dark pits) between it and the edge, rings of furrows near the edge, and the edge itself a shade darker. Returns RGBA bytes.
 */
export const IRIS = { w: 256, plain: .7, edge: .98, pupil: .36 };
export function paintIris() {
  const { w, plain, edge, pupil } = IRIS, px = new Uint8Array(w * w * 4), P = Math.round(255 * plain), byte = v => mn(255, mx(0, Math.round(255 * plain * v)));
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const x = (i + .5) / w * 2 - 1, y = (j + .5) / w * 2 - 1, rho = Math.hypot(x, y) / edge, at = (j * w + i) * 4; px[at + 3] = 255;
    if (rho >= 1) { px[at] = px[at + 1] = px[at + 2] = P; continue; }
    const th = Math.atan2(y, x), c = Math.cos(th), sn = Math.sin(th), q = (rho - pupil) / (1 - pupil);   // (q: 0 at the pupil's edge .. 1 at the limbus)
    let v = 1 + .2 * lumps(30 * c, 30 * sn, rho * 2.5) + .12 * lumps(70 * c + 3, 70 * sn, rho * 5) + .06 * lumps(140 * c, 140 * sn + 7, rho * 9);   // fibres
    v *= 1 - .3 * bump(q, .05, .06);   // the ruff round the pupil
    const cq = .3 + .045 * Math.sin(th * 7 + 1.3) + .03 * lumps(6 * c, 6 * sn, 4.4), col = bump(q, cq, .045);
    v *= 1 + .22 * col;
    const crypt = ss(.3, .62, lumps(11 * c + 2, 11 * sn, q * 5 + 9)) * bump(q, .58, .2); v *= 1 - .38 * crypt;   // crypts
    v *= (1 - .08 * bump(q, .78, .012) * ss(-.2, .4, lumps(5 * c, 5 * sn, 2))) * (1 - .08 * bump(q, .88, .01));   // furrows
    v *= 1 - .18 * ss(.86, 1, q);   // the edge
    const warm = ss(.55, .2, q) * .7 + .3 * col;   // (warmer about the pupil and along the collarette)
    px[at] = byte(v * (1 + .1 * warm)); px[at + 1] = byte(v * (1 + .01 * warm)); px[at + 2] = byte(v * (1 - .14 * warm));
  }
  return px;
}
/**
 * Paints combed hair: strands side by side in locks (they run up the picture, so it is laid on with its width across them: round the head,
 * so the strands run out from the crown and down its sides and its back). It tiles. Returns { colour (RGBA bytes, to be read as sRGB: it multiplies the hair's
 * own colour), normal (RGBA bytes: the round of the locks and the strands, a normal map) }.
 */
export function paintHair() {
  const { w, h, plain } = HAIR, H = new Float32Array(w), colour = new Uint8Array(w * h * 4), normal = new Uint8Array(w * h * 4);
  // (how high the hair stands across the picture: locks, strands in them, single hairs; measured round a circle, so the two edges meet)
  for (let i = 0; i < w; i++) { const a = i / w * Math.PI * 2, c = Math.cos(a), q = Math.sin(a); H[i] = .5 * lumps(c * 1.4, q * 1.4, 3.3) + .32 * lumps(c * 4.6, q * 4.6, 7.1) + .18 * lumps(c * 13, q * 13, 1.7); }
  for (let i = 0; i < w; i++) {
    const d = (H[(i + 1) % w] - H[(i + w - 1) % w]) * .5, nx = mx(-.85, mn(.85, -d * 9)), nz = Math.sqrt(1 - nx * nx), k = enc(plain * (1 + .26 * H[i]));
    for (let j = 0; j < h; j++) { const at = (j * w + i) * 4; colour[at] = colour[at + 1] = colour[at + 2] = k; colour[at + 3] = 255; normal[at] = Math.round(127.5 + 127.5 * nx); normal[at + 1] = 128; normal[at + 2] = Math.round(127.5 + 127.5 * nz); normal[at + 3] = 255; }
  }
  return { colour, normal };
}

/**
 * Seams and rows of stitching on clothes and leather: one small picture for all of them, laid on by each point's second set of UVs
 * from the lines the sculpting lays on the surface (field.js mesh() `lines`; human-shapes.js says where they run). Across the picture
 * (u) is how far a point is from its line: a seam's from the left edge (u 0 on the line, .5 a distance D off, plain), a row of stitching's
 * from the right (u 1 on the line). Between the two, far from every line, it is plain, so a triangle running from near the one kind to
 * near the other crosses nothing on the way. Down it (v) is one stitch, repeating along the line every L metres. A seam is a fine
 * groove with a row of stitches either side of it; stitching is a row either side of an edge (a pocket's, a belt's: the outer row
 * runs down the edge's own side). The thread is the cloth's own colour, lighter (on leather: much lighter, a pale thread).
 * plain: the value that leaves the cloth as it is (the material's colour is 1 / plain, so thread can be lighter than the cloth).
 */
export const SEAM = { w: 64, h: 16, D: .008, L: .0035 };
/** Where a point is on the seam picture: out = [u, v]. d: metres from its line (8 mm or more: plain; 1e3: no line near), along: metres, kind: 0 a seam, 1 stitching. */
export function seamUV(d, along, kind, out) {
  if (!(d < 100)) { out[0] = .5; out[1] = 0; return out; }   // (none near: d is 1e3)
  const f = mn(1, d / SEAM.D) * .5; out[0] = kind ? 1 - f : f; out[1] = along / SEAM.L; return out;
}
/**
 * The picture (sRGB bytes), its smaller copies, and its plain value. leather: a pale thread, pulled deep into it.
 * The smaller copies are made here, not by the graphics chip: each is the stitches evened out along the line, but read across
 * it at the middle of each dot, never averaged across. Averaged, a far seam's dots took in the plain cloth and the other kind of
 * line, and the cloth either side of every seam turned grey; read like this, plain stays plain at any size.
 */
export function paintSeams(leather = false) {
  const { w, h, D } = SEAM, plain = leather ? .45 : .65, px = new Uint8Array(w * h * 4), mm = 1000 * D * 2, K = new Float32Array(w * h);
  const thread = leather ? 1.75 : 1.16, deep = leather ? .5 : .3;
  // a row of stitches r millimetres off the line: d (mm) across, s (0..1) along one stitch. Each stitch is a short length of thread lying on
  // the surface, round on top, between two holes it is pulled into
  const row = (d, s, r) => {
    const a = 1 - ss(.16, .36, abs(d - r)), on = ss(.04, .14, s) * ss(.94, .84, s), top = Math.sin(Math.PI * mn(1, mx(0, (s - .04) / .9)));
    const hole = (1 - ss(.1, .32, abs(d - r))) * (bump(s, 0, .07) + bump(s, 1, .07));
    return [a * on, (.86 + .2 * top), hole];
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = (i + .5) / w, seam = u < .5, d = (seam ? u : 1 - u) * mm, s = (j + .5) / h; let k = 1;
    if (seam) {
      // (wide enough to be seen a few paces off, where a dot of the screen is a few millimetres of cloth: a seam drawn only as fine as it
      // really is went with the first smaller copy of the picture)
      k *= 1 - (leather ? .55 : .5) * (1 - ss(.25, 1.1, d));   // the groove where the two pieces meet
      k *= 1 - .1 * (1 - ss(1, 3, d));                          // its shade on the cloth either side
      k *= 1 + .07 * bump(d, 3.2, 1.1);                         // the cloth folded under it, a little raised either side
      k *= 1 + .025 * Math.sin(s * Math.PI * 2) * (1 - ss(1, 3.6, d));   // puckered a little at every stitch
    } else k *= 1 - .16 * (1 - ss(.15, .7, d));                // the edge itself
    const r = seam ? 4.2 : 2.4, [a, lit, hole] = row(d, s, r);
    k = k * (1 - a) + a * thread * lit; k *= 1 - deep * hole; K[j * w + i] = k;
    const at = (j * w + i) * 4, b = enc(plain * k); px[at] = px[at + 1] = px[at + 2] = b; px[at + 3] = 255;
  }
  const mips = [{ data: px, width: w, height: h }];
  for (let lw = w >> 1, lh = h >> 1; lw >= 1 || lh >= 1; lw >>= 1, lh >>= 1) {
    const W2 = mx(1, lw), H2 = mx(1, lh), q = new Uint8Array(W2 * H2 * 4), rows = h / H2;
    for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
      // (the four smallest are plain: they are read only where a triangle's corners count stitches from far apart places, and plain cloth
      // there came out a shade lighter or darker in a saw's teeth)
      const c = mn(w - 1, Math.floor((i + .5) / W2 * w)); let k = 0; for (let y = j * rows; y < (j + 1) * rows; y++) k += K[y * w + c];
      const at = (j * W2 + i) * 4, b = enc(plain * (W2 > 4 ? k / rows : 1)); q[at] = q[at + 1] = q[at + 2] = b; q[at + 3] = 255;
    }
    mips.push({ data: q, width: W2, height: H2 });
    if (W2 === 1 && H2 === 1) break;
  }
  return { px, mips, plain };
}
