// GSSR's learned blend: a small network that decides, pixel by pixel, how much of the history GSSR (our tuned
// SGSR 2: hd3d-gpu.js sgsr2Gpu, sgsr2.js) keeps. The idea DLSS and FSR 4 are built on, in our own form and size:
// they let a trained network weigh the history in place of hand-written rules; here a few hundred numbers do
// it inside GSSR's own shader, on the graphics chip, on every phone (Rob's pick, 2026-11-14).
//
// The hand-written rules still run first and the network corrects them (a residual): with every weight 0 the
// picture is the hand-written GSSR's to within 1%. HD.gssrNet = false is the hand-written GSSR as it was.
//
// Per pixel it reads seventeen numbers the upscale pass already has (the same in both shaders, in this order):
//   x0  how far the pixel moved since last frame: log2(1 + output pixels) / 4
//   x1  the depth clip (an edge in depth: the history may be of something else)
//   x2  the Lanczos weight of the new samples (how well this frame's jittered pixels cover this one)
//   x3  how settled the pixel is (the history's alpha: S2_HOLD's count)
//   x4  how see-through it is (sparks, smoke, glass: the reactive mask)
//   x5  the colour box's spread s, as s / (s + .03): flat or detailed
//   x6  how far the history lies outside the colour box, against the spread, as r / (1 + r)
//   x7  how far the history is from the new frame's colour, against the spread, as r / (1 + r)
//   x8  brightness of the new frame's colour
//   x9  the upscale less 1 (0 at full size, 1 at twice)
//   x10 the hand-written new-frame weight (0..1)
//   x11 the hand-written history weight outside the box where nothing moved (minLerp)
//   x12 how far the new frame's colour is from the colour box's centre, against the spread, signed: r / (1 + |r|)
//   x13 the same for the history
//   x14 how far this pixel's centre is from the nearest small pixel's, squared (in small pixels)
//   x15 the five small pixels' brightness range against the spread, r / (1 + r): one stands out (a thin thing)
//   x16 how much the hand-written pass holds the history here for a lock or a flicker (FSR 3.1's: lockc)
// and gives three: z0, added to the hand-written new-frame weight in logit space; z1, the same for how much
// of the history to keep as it is where it lies outside the colour box (the hand-written rule keeps none of it
// while moving: it clamps); and z2, how far to move the new frame's colour towards the colour box's centre
// (smoother; -.5..1, below 0 away from it: sharper). A network with two outputs leaves the colour as it is.
//
// Trained on the engine's own pictures: scripts/gssr-train.cjs draws seeded scenes at twice the size (the
// reference) and through GSSR, with the numbers above for each pixel, and scripts/gssr-train.py fits the
// weights to bring the result closer to the reference, then writes them here. The scene upscale-compare.cjs
// scores is never trained on. See docs/nextgen-3d.md, "GSSR".

/** The trained weights (written by scripts/gssr-train.py): layers of { w: [out][in], b: [out] }, ReLU between. */
export const GSSR_NET = {"layers":[{"w":[[0.95938,0.643007,1.61817,6.83835,3.57399e-215,-0.411916,-5.36232,-1.56682,-0.67354,0.916928,-10.8767,4.77164,0.0561042,-0.993637,-1.59154,1.199,2.81629],[0.0898275,1.23853,7.25849,-2.1611,-1.66311e-183,1.78437,2.43098,2.27491,1.79415,-0.516197,-0.466916,0.5512,4.64976,-3.51298,0.356052,-2.17236,1.73258],[-5.44311,-0.426275,-0.132868,6.8442,-1.4003e-216,0.116915,-0.492957,0.196682,-0.338215,0.28891,0.366123,5.26501,-0.102417,0.266718,-0.167409,-0.40509,1.43772],[-0.296735,1.1781,5.51823,-0.57797,-9.53467e-215,1.10888,1.28945,-3.43641,-2.63957,-0.831938,0.993759,-0.884644,1.49745,-1.17098,0.0666792,2.62116,-0.968556],[0.109085,0.912468,6.35549,-12.4323,-6.83835e-215,-2.03676,1.11323,-0.780793,2.74046,-0.54983,-1.24237,-11.7375,0.677193,-0.619192,0.321518,-2.41752,-12.9441],[-0.388018,-0.389894,1.65151,0.472292,-2.54119e-215,-1.00069,-2.2265,0.366279,0.253301,-0.868441,0.255001,2.58495,0.978176,2.21426,-1.40775,6.09529,-0.661685],[3.16663,0.314236,-1.66629,7.6339,3.58367e-213,-1.39235,2.89971,1.82024,-0.0406054,0.121518,-1.39313,-6.06916,-0.254162,-0.360085,-0.144075,-4.23615,-16.2702],[1.03884,4.25396,-14.4642,0.691954,-4.36939e-214,1.33098,1.38396,-0.354082,1.39255,0.717399,0.152356,-3.411,-1.32946,1.1779,-0.657496,1.51815,-12.624],[0.161298,0.338058,-3.20621,-9.60395,5.69722e-214,0.306318,-0.353706,1.68696,5.17404,-0.364544,-0.734961,-6.02792,-2.27344,-0.938537,-1.15128,4.51644,-2.34045],[-0.403487,-1.35501,-21.4734,-1.93085,-2.68433e-215,-2.04296,0.441432,0.254245,-0.0116523,0.537571,-11.1043,-2.39274,-0.65693,1.13915,0.0716505,-1.96814,1.15854],[0.221759,-1.50526,-2.10276,-2.62456,3.62744e-213,0.287555,-1.76664,1.58297,-2.60593,6.46714,0.839205,-3.0071,0.175824,0.885418,-0.809877,-0.869117,1.70478],[0.714644,1.64043,-22.7081,-0.967931,1.64118e-190,2.8695,0.74436,3.45535,0.0206672,0.371788,4.5617,-0.592978,0.0981215,0.532786,0.690542,0.385573,-0.705311],[-1.25352,-0.907383,-1.86473,-6.8572,3.21873e-215,-1.06665,1.13229,-1.7269,1.03522,-2.15984,-0.0384408,-3.77047,-1.94075,1.19156,-0.154234,-1.74614,-12.2807],[-0.380049,-1.65695,-12.2863,2.73761,-2.38457e-212,-1.06961,0.968605,-1.82017,-4.81222,-0.474804,-0.274313,-5.98428,0.549936,0.264765,-1.4839,2.74009,1.83352],[0.000682347,-0.994238,15.4697,-0.344072,4.07007e-192,-0.674458,-4.23228,0.0927011,-1.34934,1.15837,1.64318,-2.9246,-0.265792,-1.49543,0.921073,0.893598,-4.12783],[0.944292,0.317928,-2.30428,3.24701,-6.72407e-209,-2.31924,-5.1007,0.344091,-0.685517,1.66463,-1.12732,-2.92105,1.68304,-5.83701,-0.412983,-0.186774,-3.95042]],"b":[1.74285,-2.05814,0.915459,1.91606,1.82096,-1.66818,0.685916,-2.02765,-4.38516,3.72379,-1.41367,-2.73563,3.77004,4.07518,0.253238,0.645708]},{"w":[[-0.335004,-0.113991,0.468311,0.0358626,0.896231,-0.612639,-0.346714,0.407585,-0.305552,0.433475,0.025386,-0.0974357,-0.02559,0.529272,-0.718415,0.724384],[0.528276,0.293093,-3.16303,-0.136027,-0.260852,0.400774,0.997441,0.379408,-0.322103,0.630179,-1.04684,-0.398435,0.273551,-0.519284,0.607702,0.344139],[0.605944,-0.455341,-1.05721,0.569678,0.406599,-0.249286,0.268025,-0.662376,-0.310652,-0.697928,-1.2778,0.537079,-0.679674,-1.01753,-0.457502,0.371925],[-0.353271,-1.03686,-0.623929,0.48975,0.388148,-0.0133915,0.257015,-0.0883424,0.550791,0.467849,0.107838,0.346698,-0.163595,0.772211,-0.657802,0.0436456],[-0.0849702,-0.475589,-4.40391,-0.359519,0.0902238,0.80235,0.819414,0.579469,-0.878591,0.655486,-0.117089,-0.426157,0.846702,-0.283219,0.0615354,0.682579],[0.530548,0.201858,-2.64901,-1.11139,0.818781,0.726263,-0.186478,-0.0475454,0.237014,0.323559,0.46343,-0.210704,-0.050547,0.108116,0.497241,-0.806818],[0.23512,0.433629,-0.228148,-0.250977,0.407322,0.603276,-0.0313255,0.375163,-0.0602396,0.841804,0.0193766,0.439178,-0.636509,-0.410856,-0.114645,0.310758],[0.0465807,-0.595724,-0.240122,0.513992,0.551026,0.375129,-0.210287,-0.555342,0.44321,0.282657,-0.357467,0.331917,-0.58895,0.0801659,0.118454,0.472355],[-1.1857,-0.0811518,0.838337,-0.340929,0.854125,0.0335106,-0.135383,-0.226523,-0.678723,0.408194,0.352027,-0.435463,0.804039,-0.231336,0.415304,-0.36408],[-0.0309515,-0.140927,-1.68807,-0.0166312,0.389969,-0.347073,0.0208467,0.0954906,0.546844,-0.51189,0.312513,-0.205223,1.34392,-0.518841,0.0696383,0.296709],[1.07041,0.247562,-4.05448,0.00731897,-1.45502,0.12213,0.936871,0.514073,0.00273854,0.330293,-0.706586,-0.220635,0.600023,0.388176,0.722203,-0.335894],[0.115917,-0.339031,-2.34919,-0.184292,-0.963639,-0.432085,0.303714,-0.442919,1.07357,1.09011,0.141406,0.391692,-0.752581,-0.0748512,0.308571,1.12307]],"b":[0.197435,-0.01237,1.13495,-0.363602,0.400147,0.581275,-0.212139,0.0116574,0.0548546,0.652161,-0.116808,0.224477]},{"w":[[-0.227956,0.863813,-1.44909,-0.694097,1.34892,0.636746,0.0730858,-0.359325,-0.308164,-0.0408106,0.732568,0.129538],[1.96859,-0.838806,2.31673,-0.010539,-0.0206921,-2.19597,-0.347298,0.5969,-1.57822,1.00801,-1.15124,1.23957],[0.129877,-0.0781531,0.442,0.13596,0.182831,0.138802,0.188418,0.155067,0.395743,-0.334535,0.0203605,0.150615]],"b":[-0.0132129,0.822236,-0.290136]}],"trained":{"samples":6909902,"seeds":60,"hidden":[16,12],"hand":1.618,"net":1.569}};

export const NET_IN = 17, NET_OUT = 3;

/** The network to draw with: HD.gssrNet false is none; an object is that network (training); else the trained one. */
export function netFor(flag) {
  if (flag === false) return null;
  const n = flag && typeof flag === 'object' ? flag : GSSR_NET;
  if (!n?.layers?.length) return null;
  n.id ||= hashOf(n);
  return n;
}
function hashOf(n) {
  let h = 2166136261 >>> 0; const s = JSON.stringify(n.layers);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

const num = (v, glsl) => { let t = (+v).toPrecision(6); if (!/[.e]/.test(t)) t += '.0'; return glsl ? t : t; };
/**
 * The network as shader text, from inputs x0..x16 to z0, z1 and z2 (clamped to -10..10). wgsl: inside a half.js
 * halfFn (hf numbers); glsl: plain floats.
 */
export function netText(n, lang) {
  const glsl = lang === 'glsl', T = glsl ? 'float' : null;
  const lit = v => glsl ? num(v, true) : `hf(${num(v)})`, zero = glsl ? '0.0' : 'hf(0.0)';
  let ins = Array.from({ length: NET_IN }, (_, i) => 'x' + i), out = [];
  n.layers.forEach((L, li) => {
    const last = li === n.layers.length - 1, names = L.b.map((_, j) => last ? 'z' + j : `n${li}_${j}`);
    L.b.forEach((b, j) => {
      let e = lit(b);
      // (a weight that is all but 0 is left out: no number too small for half or full precision)
      L.w[j].forEach((w, i) => { if (Math.abs(w) > 1e-7) e += ` + ${ins[i]} * ${lit(w)}`; });
      e = last ? `clamp(${e}, ${lit(-10)}, ${lit(10)})` : `max(${e}, ${zero})`;
      out.push(glsl ? `  ${T} ${names[j]} = ${e};` : `  let ${names[j]} = ${e};`);
    });
    ins = names;
  });
  for (let j = n.layers.at(-1).b.length; j < NET_OUT; j++) out.push(glsl ? `  float z${j} = 0.0;` : `  let z${j} = ${zero};`);   // (outputs it hasn't: no change)
  return out.join('\n');
}
