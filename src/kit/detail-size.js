// Drawing each picture only as big as its detail needs (Next Gen on WebGPU; hd3d.js draw3d, hd3d-gpu.js detailNode).
//
// How small the 3D can be drawn before the final picture loses something depends on the picture, not on the
// phone: a misty valley, a dusk street, a face close up or a scope's blur have little fine detail, and a sunny
// town of roof tiles has a lot. Measured on 18 frames of our games (/mnt/project-files/gpu-ideas/picture-detail.py):
// drawn at half size each way, the loss ran from 27 dB (the valley) to 50 dB (a scope close up); to hold 36 dB
// they needed anything from half size to full size, and drawing each at its own size took about half the pixels
// of one size that suits them all.
//
// The frame says what it needs from itself, as a picture's spectrum does: most pictures lose detail octave by
// octave by about the same ratio (a power law). The chip measures the two finest octaves of the 3D as drawn,
// in 4 x 4 blocks on a sparse grid (e1: how far each pixel sits from its 2 x 2 block's average; e2: how far
// those averages sit from the 4 x 4's), every few frames. Their ratio says how much detail each octave above
// the drawn one would have held, so how much the final picture misses at the drawn size, and at what size it
// would miss just the target. Tried on the 18 frames from a start of .85 of the final size: the size picked
// landed each between 34 and 40 dB for a 36 dB target, with 63% of the pixels of the .85 they started at
// (/mnt/project-files/gpu-ideas/picture-detail-controller.py).
//
// It only ever takes pixels away from the size the quality steps chose (they still decide how much the phone
// can draw), never below DS.least of it or below hd3d.js's floor, and moves slowly (a few percent every few
// frames, at once only to grow back when the picture gains detail). DS.on false: off (tests, before/after).
//
// Where it fails: a picture whose finest octave holds as much as the one below (e1 / e2 near or over 1: a brick or
// tile pattern at the pixel's own size, the engine's village scene at 1.19) is not falling off by any power law, and
// the estimate there was 5 to 6 dB too kind (the village: 40.5 dB foretold at .85, 34.1 lost; the 18 frames' worst
// besides was 3.4 too kind, the misty valley). So such a picture keeps the quality steps' size (DS.flat: the ratio
// over which it does), and the target is 38 dB, two above the 36 the 18 frames were tried at, for the error that is
// left (/mnt/project-files/gpu-ideas/picture-detail-gate.txt).

/**
 * Settings and what it last decided: on, target (dB the final picture keeps), least (smallest share of each side),
 * flat (the octave ratio over which the picture keeps its size), every (frames between measures), k (the share of each side the picture wants), use (the share drawn: k in steps of
 * a tenth, rounded up, so the pictures behind the 3D are made again only now and then), db (the last estimate at the
 * drawn size).
 */
export const DS = { on: true, target: 38, flat: .92, least: .6, every: 12, k: 1, use: 1, db: 0, e1: 0, e2: 0, at: 0 };
const CAL = .415;   // the estimate's scale, fitted on the 18 frames (their loss against the energy it predicts)

// the octave ratio, kept where the maths holds (finer octaves hold less than coarser ones, but not nothing)
const ratio = (e1, e2) => Math.min(.999, Math.max(1e-3, e1 / Math.max(e2, 1e-12)));

/**
 * The detail the final picture misses when the 3D is drawn 2^-n2 of its size each way, from e1 and e2 measured
 * on a drawing 2^-n of its size (pure: tests). In the measure's own units (squared brightness).
 */
export function missing(e1, e2, n, n2) {
  if (!(e1 > 0) || n2 <= 0) return 0;
  const s = ratio(e1, e2);
  return e1 * s ** n * (s ** -n2 - 1) / -Math.log(s);
}
/** The loss in dB at 2^-n2 of the final size, from a measure at 2^-n (pure). */
export function lossDb(e1, e2, n, n2) { const m = missing(e1, e2, n, n2) * CAL; return m > 0 ? 10 * Math.log10(1 / m) : 99; }
/**
 * The share of the final picture's size each way (0..1) at which it would miss just `db` dB, from e1 and e2
 * measured on a drawing `r` of the final size each way (pure: tests). 1 where even full size misses more.
 */
export function sizeFor(e1, e2, r, db = DS.target) {
  if (!(e1 > 0) || !(r > 0)) return r > 0 ? Math.min(1, r) : 1;
  if (e1 > e2 * DS.flat) return 1;   // (detail that doesn't fall off: no power law to go by)
  const s = ratio(e1, e2), n = Math.log2(1 / Math.min(1, r)), want = 10 ** (-db / 10) / CAL;
  const n2 = Math.log(1 + want * -Math.log(s) / (e1 * s ** n)) / -Math.log(s);
  return Math.min(1, 2 ** -n2);
}

/**
 * A new measure from the chip: e1, e2 (means over the blocks), r: the drawn size's share of the final one when it
 * was measured. Moves DS.k (the share of each side of the size the quality steps chose) toward what the picture
 * needs: down a few percent a measure, up at once. full: the share the quality steps chose (their pw / fw).
 */
export function measured(e1, e2, r, full) {
  DS.e1 = e1; DS.e2 = e2; DS.at++;
  if (!DS.on || !(full > 0)) { DS.k = DS.use = 1; return 1; }
  DS.db = lossDb(e1, e2, Math.log2(1 / r), Math.log2(1 / r));
  const want = Math.min(1, Math.max(DS.least, sizeFor(e1, e2, r) / full));
  DS.k = want > DS.k ? want : Math.max(want, DS.k * .96);
  if (DS.k > .98) DS.k = 1;
  // (drawn in steps of a tenth: down once the wish has passed the next step, up at once once it is clearly over
  // the one drawn, not on every flicker of a few hundredths)
  const step = Math.min(1, Math.ceil(DS.k * 10 - 1e-6) / 10);
  if (step < DS.use || DS.k > DS.use + .03) DS.use = step;
  return DS.use;
}
/** Back to the quality steps' own size (a new game, WebGL). */
export function resetSize() { DS.k = DS.use = 1; DS.db = 0; }
/** The meter's picture (hd3d-gpu.js detailMeter: RGBA bytes, e1 and e2 as 16-bit logs) as the means [e1, e2] (pure: tests). */
export function fromPixels(px) {
  let a = 0, b = 0, n = 0;
  const e = (hi, lo) => { const c = (hi + lo / 255) / 255; return c > 0 ? 2 ** (c * 32 - 32) : 0; };
  for (let i = 0; i + 3 < px.length; i += 4) { a += e(px[i], px[i + 1]); b += e(px[i + 2], px[i + 3]); n++; }
  return n ? [a / n, b / n] : [0, 0];
}
