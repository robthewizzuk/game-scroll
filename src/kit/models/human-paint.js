// The paint of a head of gs.models.human: what is too fine for the head's own points to carry. Brows made of hairs, the dark
// line of the lashes along each lid, lips with an edge to them. It is worked out here, in code, into one small picture for each
// look (no image files): the left half of the face from in front (the right half is its mirror), about a third of a millimetre
// a dot. The picture multiplies the skin's own colour, which stays in the points (so the same skin, the same shading in the
// creases, the same people far off), and each point of the head says where it is on the picture (faceUV: a second set of UVs).
// The shapes it paints are the ones the sculpting carves (human-head.js: eyeRim, browOf, mouthAt), so the colour lies where the
// shape is, and it rides the skin as the face moves. No three.js: plain numbers in, bytes out. Kit use only.
import { lumps } from './field.js';
import { HC, EYE, ES, eyeRim, browOf, mouthAt, lipLine, ss, bump } from './human-head.js';

const abs = Math.abs, mx = Math.max, mn = Math.min;
/**
 * The picture: w by h dots for the part of the face from its middle out to x1 and from y0 to y1 (metres, y from the line of the
 * eyes); z0: only what stands this far in front of the middle of the head is on it (the back of the head would land on the face);
 * plain: the value that leaves the skin as it is (under 1, so paint can lighten as well as darken: the material's colour is 1 / plain).
 */
export const FACE = { w: 256, h: 512, x1: .08, y0: -.125, y1: .045, z0: .048, plain: .8 };
/** Where a point of the head (the person's space) is on the picture: out = [u, v]. Whatever is not the front of the face lands on the picture's edge, which is plain. */
export function faceUV(x, y, z, out) {
  const u = (abs(x) + 6 * mx(0, FACE.z0 - (z - HC[2]))) / FACE.x1, v = (y - HC[1] - FACE.y0) / (FACE.y1 - FACE.y0);
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
export function browAt(x, hy, B, fem) {
  const [b0, b1, b2] = B, x0 = b0[0], x1 = b1[0], x2 = b2[0]; if (x < x0 - .004 || x > x2 + .003) return 0;
  // the middle line: the round through the three points
  const yc = b0[1] * (x - x1) * (x - x2) / ((x0 - x1) * (x0 - x2)) + b1[1] * (x - x0) * (x - x2) / ((x1 - x0) * (x1 - x2)) + b2[1] * (x - x0) * (x - x1) / ((x2 - x0) * (x2 - x1)), dy = hy - yc;
  const t = (x - x0) / (x2 - x0), full = fem ? .0019 : .0027, half = full * (1 - .72 * ss(.45, 1.02, t)) * ss(-.14, .04, t);
  if (abs(dy) > half * 1.6 + .0006) return 0;
  // the hairs: lines that lean out along the brow, more upright by the nose; each a little longer or shorter, darker or lighter than the next
  const lean = 1.5 - 1.25 * ss(0, .8, t), q = (x - dy / lean) * 3100, hair = lumps(q, 3.7, fem ? 9.1 : 2.3), fine = lumps(q * 2.3 + 11, 1.9, 5.5);
  const edge = half * (1 + .32 * hair + .12 * fine), k = ss(edge + .00035, edge - .00035, abs(dy) + (dy > 0 ? 0 : .12 * half));
  return k * (.95 + .05 * fine) * ss(1.06, .97, t);
}

/**
 * Paints the picture for a look: { face (the spec's: eyes, lips, soft), fem, stubble (0..1), skin, brow, lips, lash, mouth (each [r, g, b]
 * as light, not sRGB) }. Returns its bytes (RGBA, w * h * 4, the bottom row first), to be read as sRGB.
 */
export function paintFace(o) {
  const { w, h, x1, y0, y1, plain } = FACE, f = o.face, fem = !!o.fem, px = new Uint8Array(w * h * 4), S = o.skin;
  // each colour as a share of the skin's (what the skin's colour has to be multiplied by to become it), no lighter than the picture can say
  const of = c => [0, 1, 2].map(i => mn(1 / plain, c[i] / mx(1e-4, S[i]))), BR = of(o.brow), LP = of(o.lips), LA = of(o.lash), MO = of(o.mouth);
  const B = browOf(f.soft), rim = eyeRim(f.eyes), ex0 = rim.cx - rim.w, exw = 2 * rim.w, m3 = [0, 0, 0];
  const stub = o.stubble || 0, P = enc(plain); let r, g, b;
  const put = (C, k) => { r += (C[0] - r) * k; g += (C[1] - g) * k; b += (C[2] - b) * k; };
  for (let j = 0; j < h; j++) {
    const hy = y0 + (j + .5) / h * (y1 - y0);
    for (let i = 0; i < w; i++) {
      const x = (i + .5) / w * x1; let lip = 0; r = g = b = 1;
      // ---- brows
      if (hy > .008 && hy < .04) { const k = browAt(x, hy, B, fem); if (k > 0) put(BR, k * (fem ? .95 : .98)); }
      // ---- the lids: the lashes' line along the upper one (thicker towards its outer end, its edge the lashes' own ends), a fainter one under
      // the eye, a soft shade over the upper lid; inside the opening the upper lid's edge is dark, the lower one's pale, the corner by the nose pink
      if (abs(hy - EYE[1]) < .02 && x > ex0 - .004 && x < ex0 + exw + .006) {
        const q = rim(x, hy), d = q[0], up = q[1], a = (x - ex0) / exw, pink = d < .0004 ? ss(.0098 * ES, .0118 * ES, EYE[0] - x) : 0;
        if (up) {
          const wl = (fem ? .0021 : .0016) * (.55 + .95 * ss(0, 1, a)) * (1 + (fem ? .3 : .2) * lumps(a * 46, 4.1, 7.7)) * ss(-.04, .1, a);
          const line = d <= 0 ? 1 : ss(wl + .0003, wl - .0001, d), shade = ss(.0062, .001, d) * ss(-.1, .25, a) * ss(1.25, .9, a) * (fem ? .2 : .14);
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
          const v = hy - lipLine(x, f), k = ss(0, .55, lip) * (fem ? .92 : .86), sh = v > 0 ? .9 : 1 + .1 * bump(v, -.0042 * f.lips, .0022) * bump(x, 0, .012);
          put([LP[0] * sh, LP[1] * sh, LP[2] * sh], k);
        }
        if (line > .02) put(MO, mn(1, line * (fem ? .62 : .58)));
      }
      // ---- stubble: fine dots of shadow over the jaw, the chin and the upper lip (the points carry its even shade)
      if (stub > 0 && hy < -.04) {
        const k = ss(-.04, -.058, hy) * (1 - lip) * stub * mx(0, lumps(x * 3300, hy * 3300, 3.3)) * .3; if (k > 0) { r *= 1 - k; g *= 1 - k * .9; b *= 1 - k * .75; }
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
