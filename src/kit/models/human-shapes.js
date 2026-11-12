// The shapes gs.models.human is sculpted from, and the sculpting itself: a person is a few pieces (the
// trunk in its clothes, a hand, the head, a hat, a pack, a maker's own kit), each a list of soft shapes
// (field.js) melted into one surface, meshed, given its bones and thinned to three levels of detail.
// Nothing in here needs three.js or the page: it runs in background workers (human-worker.js), so a
// game never stops while its people are made, and what it makes is plain numbers that can be saved.
// Kit use only: games reach it as gs.models.human.
import { Loft, mesh as meshOf, thin, lumps, stamp, thinReady } from './field.js';
export { thinReady };

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs;
export const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

// ---- the skeleton: the bones gs.poses' Rig moves, at a grown person's proportions (1.8 m, feet at y = 0,
// facing +z, the left side at +x), arms and legs hanging straight down
export const BONES = ['hips', 'spine', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'];
export const PARENT = { spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', handL: 'foreL', armR: 'spine', foreR: 'armR', handR: 'foreR', legL: 'hips', shinL: 'legL', footL: 'shinL', legR: 'hips', shinR: 'legR', footR: 'shinR' };
export const AT = {
  hips: [0, 1.0, 0], spine: [0, 1.1, 0], head: [0, 1.525, -.012],
  armL: [.188, 1.44, -.012], foreL: [.2, 1.165, -.01], handL: [.2, .895, .004],
  legL: [.094, .955, 0], shinL: [.097, .52, 0], footL: [.097, .085, -.006],
};
for (const k of Object.keys(AT)) if (k.endsWith('L')) AT[k.slice(0, -1) + 'R'] = [-AT[k][0], AT[k][1], AT[k][2]];
export const HC = [0, 1.69, .008];   // the middle of the head
const Hd = (x, y, z) => [x, HC[1] + y, HC[2] + z];
export const other = b => b.endsWith('L') ? b.slice(0, -1) + 'R' : b.endsWith('R') ? b.slice(0, -1) + 'L' : b;
// The arms are sculpted and bound held a little out from the body (so a sleeve never melts into a hip);
// the rig's own poses bring them down. ARMSP: that space, for the left arm's shapes (drawn hanging straight down).
export const ARM = .27, ARMSP = { at: AT.armL, rot: [0, 0, ARM] }, CA = cos(ARM), SA = sin(ARM);
// a point on the left side (x >= 0) back in the arm's own space (hanging straight down)
const armLocal = (x, y, z) => { const dx = x - AT.armL[0], dy = y - AT.armL[1]; return [AT.armL[0] + CA * dx + SA * dy, AT.armL[1] - SA * dx + CA * dy, z]; };
// small hard things that sit on a surface (buttons, studs): low domes made as they are, crisp at any cell size.
// out: { P, N, K, I, src }; c: where; n: which way it faces; r, h: radius and height; src: what it rides (for its bones)
function stud(out, c, n, r, h, slot, src) {
  const [nx, ny, nz] = n, ax = abs(ny) > .9 ? [1, 0, 0] : [0, 1, 0], base = out.P.length / 3, M = 8;
  let ux = ax[1] * nz - ax[2] * ny, uy = ax[2] * nx - ax[0] * nz, uz = ax[0] * ny - ax[1] * nx; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  for (const [rr, hh, nt] of [[1, -1, 1], [1, .35, .8], [.7, .85, .4]]) for (let i = 0; i < M; i++) {
    const a = i / M * PI * 2, dx = ux * cos(a) + vx * sin(a), dy = uy * cos(a) + vy * sin(a), dz = uz * cos(a) + vz * sin(a);
    out.P.push(c[0] + dx * r * rr + nx * h * hh, c[1] + dy * r * rr + ny * h * hh, c[2] + dz * r * rr + nz * h * hh);
    const ex = dx * nt + nx * (1 - nt), ey = dy * nt + ny * (1 - nt), ez = dz * nt + nz * (1 - nt), el = Math.hypot(ex, ey, ez); out.N.push(ex / el, ey / el, ez / el); out.K.push(slot); out.src.push(src);
  }
  out.P.push(c[0] + nx * h, c[1] + ny * h, c[2] + nz * h); out.N.push(nx, ny, nz); out.K.push(slot); out.src.push(src);
  for (let q = 0; q < 2; q++) for (let i = 0; i < M; i++) { const a = base + q * M + i, b = base + q * M + (i + 1) % M, d = a + M, e = b + M; out.I.push(a, b, e, a, e, d); }
  for (let i = 0; i < M; i++) out.I.push(base + 2 * M + i, base + 2 * M + (i + 1) % M, base + 3 * M);
}
const studs = () => ({ P: [], N: [], K: [], I: [], src: [], ao: .92 });

// ================================================================= the shapes
// Every list below is one piece: melted into one surface, meshed and thinned on its own, so pieces can
// be shared between people (two soldiers in the same cut of tunic share it, whatever its colours).

// a pocket, a strap or a belt laid on a body part wears that part's own lumps and folds, so it lies on the cloth and not through it
const on = (base, s) => ({ lumpy: base.lumpy, folds: base.folds, foldMax: base.foldMax, blend: .004, ...s });

// how loose each kind of top hangs, the torso's slices from the waist to the neck, and a sleeve's from cuff to shoulder
const easeOf = kind => kind === 'smock' ? .014 : kind === 'shirt' ? -.004 : .003;
function torsoOf(b, kind) {
  const W = b.waist, C = b.chest, SH = b.shoulders, ease = easeOf(kind);
  return new Loft([
    [.99, .15 * W + ease, .106 * W + ease, 0, 0, 2.3], [1.08, .147 * W + ease, .106 * W + ease, .002, 0, 2.3],
    [1.17, .156 * C + ease, .113 * C + ease, .006, 0, 2.4], [1.27, .166 * C + ease, .123 * C + ease, .011 + b.bust * .014, 0, 2.4],
    [1.35, .166 * SH + ease * .5, .122 * C + ease, .008 + b.bust * .006, 0, 2.4], [1.43, .176 * SH, .102 * C, 0, 0, 2.3],
    // the shoulders: one even slope from the side of the neck out over the top of the arm, whose cap is only the roundness beyond it (a shelf with a corner reads as a box)
    [1.455, .179 * SH, .092, -.006, 0, 2.2], [1.468, .172 * SH, .086, -.008, 0, 2.1], [1.478, .158 * SH, .082, -.01, 0, 2.1], [1.488, .14 * SH, .077, -.011, 0, 2.1], [1.499, .104 + .014 * SH, .071, -.012, 0, 2], [1.511, .093, .066, -.012], [1.525, .072, .061, -.012], [1.545, .058, .056, -.012],
  ]);
}
const sleeveRows = LM => [[.892, .036 * LM, .038 * LM, .004, .2], [.93, .0385 * LM, .04 * LM, .004, .2], [1.02, .0445 * LM, .046 * LM, 0, .2], [1.1, .0475 * LM, .049 * LM, -.006, .2], [1.165, .0455 * LM, .049 * LM, -.01, .1985],
  [1.27, .0475 * LM, .053 * LM, -.012, .194], [1.36, .0505 * LM, .056 * LM, -.012, .19], [1.42, .05 * LM, .056 * LM, -.012, .188], [1.45, .04 * LM, .05 * LM, -.012, .186]];   // narrower above the elbow than at the shoulder's cap, as an arm is

/**
 * The left arm in its sleeve, shoulder to cuff. A piece of its own, not melted into the trunk: it turns in the
 * shoulder the way a doll's does, round a ball that stays inside the body, so however far an arm is raised
 * nothing stretches or tears at the armpit (one skin there turned inside out once the arm passed the chest).
 */
function arm(a) {
  const { build: b, top } = a, LM = b.limbs, S = [], short = top.sleeves === 'short', rows = sleeveRows(LM);
  const sleeve = new Loft(short ? rows.filter(r => r[0] > 1.2).concat([[1.21, .053 * LM, .055 * LM, -.012, .199]]) : rows);
  const elbow = (x, y, z) => { const th = Math.atan2(x - .2, z + .01), w = lumps(x * 11, y * 15, z * 11); return .0022 * bump(y, 1.17, .06) * sin(y * 190 + th * 1.6 + 3.2 * w) * (.65 + .35 * cos(th)) + .002 * bump(y, 1.39, .05) * sin(th * 6 + y * 30 + 3 * w); };
  const SL = { loft: sleeve, slot: 'top', space: ARMSP, lumpy: [.06, .0026], folds: elbow, foldMax: .004, blend: 0 }, onA = s => on(SL, { space: ARMSP, ...s }); S.push(SL);
  S.push(onA({ ball: [.062 * LM, .058, .062 * LM], at: [.18, 1.404, -.012], slot: 'top', blend: .02 }));   // the cap of the shoulder, round the joint: its top lies just under the trunk's slope, so the line of the shoulder runs over it and down the arm
  if (short) S.push({ loft: rows.filter(r => r[0] < 1.24).map(r => [r[0], r[1] * .86, r[2] * .86, r[3], r[4]]), slot: 'skin', space: ARMSP, blend: .006 });
  else S.push(onA({ band: sleeve, y: [.892, .945], out: .003, slot: top.cuffs ? 'trim' : 'top', edge: .002 }), { ball: .031, at: [.2, .884, .004], space: ARMSP, cut: true, blend: .004 });   // a cuff, open at the wrist
  if (top.band) S.push(onA({ band: sleeve, y: [1.29, 1.355], out: .0036, slot: 'band', edge: .002 }));   // an armband
  S.push({ loft: torsoOf(b, top.kind), ghost: true });   // the body beside it, for the shade under the arm
  return S;
}
function armBones(x, y, z) { const [, ly] = armLocal(abs(x), y, z), t = ss(1.115, 1.215, ly); return [['foreL', 1 - t], ['armL', t]]; }

/** The trunk: torso, hips, legs and feet, in what they wear (the arms are pieces of their own). */
function trunk(a) {
  const { build: b, top, legs, feet, belt, web } = a, S = [], kind = top.kind, W = b.waist, HP = b.hips, LM = b.limbs;
  const ease = easeOf(kind), skirted = kind === 'tunic' || kind === 'smock';
  const torso = torsoOf(b, kind), X = studs();
  // gathers where the belt pulls the cloth in, a little slack under the chest
  const gather = (x, y, z) => { const th = Math.atan2(x, z); return .003 * ss(1.22, 1.1, y) * ss(1.0, 1.06, y) * sin(th * 13 + 4 * lumps(x * 11, y * 4, z * 11)) + .0025 * bump(y, 1.21, .03) * lumps(x * 22, y * 30, z * 22); };
  const T = { loft: torso, slot: 'top', part: 'torso', lumpy: [.07, .0028], folds: belt ? gather : null, blend: 0 }; S.push(T);
  let K = T, skirtL = null;   // what hangs at the hips lies on: the tunic's skirt, or the trunk itself
  if (skirted) {
    const len = kind === 'smock' ? .74 : .8, fl = kind === 'smock' ? 1.04 : 1;
    const skirt = new Loft([[len, .196 * HP * fl, .134 * HP * fl, -.004, 0, 2.3], [len + .03, .197 * HP * fl, .135 * HP * fl, -.004, 0, 2.3], [.95, .182 * HP, .126 * HP, -.002, 0, 2.3], [1.02, .152 * W + ease, .1085 * W + ease, 0, 0, 2.3], [1.075, .147 * W + ease, .106 * W + ease, .002, 0, 2.3]]);
    const flute = (x, y, z) => { const th = Math.atan2(x, z); return .0035 * ss(1.04, .9, y) * sin(th * 9 + 3 * lumps(x * 7, 1, z * 7)); };
    K = { loft: skirt, slot: 'top', part: 'skirt', lumpy: [.08, .003], folds: flute, blend: .012 }; S.push(K);
    S.push({ loft: [[len - .03, .178 * HP * fl, .118 * HP * fl, -.004, 0, 2.3], [len + .012, .176 * HP * fl, .116 * HP * fl, -.004, 0, 2.3]], cut: true, blend: .012 });   // the hem turns in underneath
    skirtL = skirt;
    if (top.pockets >= 4) for (const s of [1, -1]) {
      S.push(on(K, { patch: skirt, at: [s * .66, .915], size: [.128, .14], round: .016, out: .0042, slot: 'top', part: 'skirt' }), on(K, { patch: skirt, at: [s * .66, .978], size: [.134, .046], round: .012, out: .0078, slot: 'top', part: 'skirt' }));
      if (top.buttons) stud(X, skirt.at(s * .66, .972, .0078), [sin(s * .66), 0, cos(s * .66)], .0075, .0035, 'button', { part: 'skirt' });
    }
  } else if (kind === 'blouse') S.push(on(T, { band: torso, y: [1.0, 1.07], out: .0075, slot: 'top', part: 'torso', edge: .006 }));   // the waistband the blouse gathers into
  // the seat and legs
  S.push({ ball: [.17 * HP, .1, .112 * HP], at: [0, .935, -.004], slot: 'legs', part: 'hips', blend: .02 });
  const fl = legs.kind === 'breeches' ? 1.16 : 1, tall = feet.kind === 'tall', gait = feet.kind === 'gaiters', tuck = tall || gait;
  const low = tall ? [[.4, .05 * LM, .054 * LM, -.008, .097], [.47, .056 * LM, .06 * LM, -.004, .097]] : gait ? [[.29, .054 * LM, .06 * LM, -.013, .097], [.38, .06 * LM, .066 * LM, -.012, .097], [.47, .058 * LM, .062 * LM, -.004, .097]] : [[.075, .052 * LM, .056 * LM, -.01, .097], [.2, .054 * LM, .058 * LM, -.012, .097], [.38, .06 * LM, .066 * LM, -.012, .097], [.47, .058 * LM, .062 * LM, -.004, .097]];
  const leg = new Loft([...low, [.53, .062 * LM, .067 * LM, .004, .097], [.62, .074 * LM * fl, .08 * LM, .002, .097], [.74, .088 * LM * fl, .094 * LM, 0, .096], [.86, .094 * LM * fl, .1 * LM, -.002, .094], [.95, .088, .098, -.004, .09], [1.0, .07, .085, -.004, .088]]);
  const knee = (x, y, z) => { const th = Math.atan2(abs(x) - .097, z), w = lumps(x * 9, y * 13, z * 9); return .0026 * bump(y, .535, .06) * sin(y * 170 + th * 1.4 + 3 * w) * (.6 - .4 * cos(th)) + (tuck ? .004 * bump(y, .49, .035) * sin(th * 7 + 3 * w) : .0026 * bump(y, .13, .06) * sin(y * 150 + th * 2 + 3 * w)); };
  S.push({ loft: leg, slot: 'legs', part: 'leg', mirror: true, lumpy: [.07, .003], folds: knee, blend: .012 });
  if (tuck) S.push({ ball: [.071 * LM, .042, .075 * LM], at: [.097, tall ? .486 : .348, -.004], slot: 'legs', part: 'leg', mirror: true, lumpy: [.03, .004], blend: .028 });   // the trouser leg bloused over the boot top
  // boots or shoes
  const topY = tall ? .452 : gait ? .2 : feet.kind === 'boots' ? .19 : .1;
  const shaft = tall ? [[.045, .044, .05, 0, .098], [.09, .04, .047, -.008, .098], [.16, .044, .051, -.014, .098], [.3, .057, .063, -.018, .098], [.4, .058, .062, -.012, .098], [topY, .062, .066, -.008, .098]]
    : [[.045, .044, .05, 0, .098], [.09, .041, .048, -.008, .098], [.14, .043, .05, -.012, .098], [topY, .046, .052, -.013, .098]];
  const crease = (x, y, z) => .002 * bump(y, .135, .04) * sin(y * 240 + z * 40 + 3 * lumps(x * 20, y * 9, z * 20));
  S.push({ loft: shaft, slot: 'boots', part: 'boot', mirror: true, folds: tall || feet.kind === 'boots' ? crease : null, foldMax: .002, blend: .01 });
  const foot = [[[.098, .046, -.036], [.1, .04, .07]], [[.1, .04, .07], [.103, .032, .148]]], fr = [[.043, .041], [.041, .031]];
  foot.forEach((t, i) => S.push({ taper: t, r: fr[i], slot: 'boots', part: 'foot', mirror: true, blend: .02 }, { taper: t, r: fr[i].map(r => r + .0045), clip: [[0, -1, 0], -.02, .002], slot: 'sole', part: 'foot', mirror: true, blend: .004 }));
  S.push({ box: [.08, .03, .082], round: .01, at: [.098, .012, -.045], slot: 'sole', part: 'foot', mirror: true, blend: .004 });   // the heel
  if (gait) { const g = new Loft([[.105, .05, .058, -.008, .098], [.2, .053, .058, -.013, .098], [.3, .06 * LM, .066 * LM, -.014, .097], [.335, .062 * LM, .067 * LM, -.012, .097]]); S.push({ loft: g, slot: 'kit', part: 'boot', mirror: true, lumpy: [.03, .002], blend: .006 }, { band: g, y: [.14, .158], out: .004, slot: 'strap', part: 'boot', mirror: true }, { band: g, y: [.27, .288], out: .004, slot: 'strap', part: 'boot', mirror: true }); }
  S.push({ box: [1.2, .3, 1.2], at: [0, -.15, 0], cut: true, blend: 0 });   // soles flat on the ground
  // ---- the top's details
  if (top.collar !== false) {
    // a collar stands higher at the back of the neck than at the throat
    const col = new Loft([[1.486, .077, .074, -.012], [1.52, .069, .068, -.012], [1.556, .0655, .0645, -.011], [1.592, .064, .063, -.012]]);
    S.push({ loft: col, clip: [[0, -1, -.2326], -1.5686, .003], slot: top.collar ? 'trim' : 'top', part: 'torso', blend: .006 }, { loft: [[1.532, .0545, .054, -.011], [1.63, .0555, .055, -.011]], cut: true, blend: .003 });
    if (kind !== 'smock') S.push({ box: [.03, .07, .05], at: [0, 1.56, .06], rot: [0, 0, PI / 4], cut: true, blend: .004 });   // open at the throat
    if (top.tabs) for (const s of [1, -1]) S.push({ patch: col, at: [s * .5, 1.522], size: [.04, .024], round: .004, out: .0022, slot: 'tab', part: 'torso' });
  }
  if (top.buttons && kind !== 'smock') {
    S.push(on(T, { patch: torso, at: [0, 1.285], size: [.038, .4], round: .004, out: .003, slot: 'top', part: 'torso' }));
    for (const y of [1.125, 1.205, 1.285, 1.365, 1.445]) stud(X, torso.at(0, y, .003), [0, 0, 1], .0085, .004, 'button', { part: 'torso' });
  }
  if (top.pockets >= 2) for (const s of [1, -1]) {
    S.push(on(T, { patch: torso, at: [s * .46, 1.3], size: [.094, .104], round: .014, out: .0038, slot: 'top', part: 'torso' }), on(T, { patch: torso, at: [s * .46, 1.3], size: [.02, .1], round: .003, out: .0065, slot: 'top', part: 'torso' }),
      on(T, { patch: torso, at: [s * .46, 1.35], size: [.1, .042], round: .012, out: .0072, slot: 'top', part: 'torso' }));
    if (top.buttons) stud(X, torso.at(s * .46, 1.343, .0072), [sin(s * .46), 0, cos(s * .46)], .007, .0035, 'button', { part: 'torso' });
  }
  if (top.straps) for (const s of [1, -1]) S.push({ box: [.085, .007, .044], round: .003, at: [s * .127, 1.495, -.012], rot: [0, 0, -s * .52], slot: top.strapColour ? 'trim' : 'top', part: 'torso', blend: .002 }); if (top.straps && top.buttons) for (const s of [1, -1]) stud(X, [s * .098, 1.5135, -.012], [s * .5, .87, 0], .0065, .003, 'button', { part: 'torso' });
  // ---- belt, straps and pouches
  if (belt) {
    S.push(on(T, { band: torso, y: [1.03, 1.084], out: .0068, slot: 'belt', part: 'torso', edge: .003 }));
    S.push({ box: [.054, .046, .012], round: .004, at: torso.at(0, 1.057, .009), slot: 'buckle', part: 'torso', blend: .001 });
  }
  if (web) {
    if (web.y) {
      // a strap over each shoulder: the cloth grown a little and cut to a strip between two planes, so it lies on the body all the way over (a straight bar stood off it at both ends)
      const strip = (n, off, more) => on(T, { loft: torso, out: .0088, clip: [[n, off - .015, .003], [n.map(v => -v), -off - .015, .003], ...more], slot: 'strap', part: 'torso', mirror: true });
      S.push(strip([-.9921, .1252, 0], .08885, [[[0, 0, 1], -.012, .003], [[0, 1, 0], 1.06, .003]]));   // up the front from the belt and onto the shoulder
      S.push(strip([-.8962, .4437, 0], .5768, [[[0, 0, -1], .012, .003], [[1, 0, 0], 0, .002]]));       // down the back to the middle
      S.push(on(T, { patch: torso, at: [PI, 1.18], size: [.03, .2], round: .004, out: .0088, slot: 'strap', part: 'torso' }), { torus: [.014, .0045], at: torso.at(PI, 1.275, .006), rot: [PI / 2, 0, 0], slot: 'buckle', part: 'torso', blend: .001 });
    }
    if (web.cross) S.push(on(T, { patch: torso, at: [.05, 1.27], size: [.032, .52], turn: .62, round: .004, out: .0088, slot: 'strap', part: 'torso' }), on(T, { patch: torso, at: [PI - .05, 1.27], size: [.032, .52], turn: -.62, round: .004, out: .0088, slot: 'strap', part: 'torso' }));
    const big = web.kind === 'big';
    for (let i = 0; i < (web.pouches || 0); i++) for (const s of [1, -1]) {
      const th = s * (big ? .5 : .3 + i * .31), w = big ? .09 : .041, h = big ? .15 : .085, dp = big ? .06 : .03, p = torso.at(th, big ? 1.0 : 1.035, dp / 2 + .004);
      S.push({ box: [w, h, dp], round: .009, at: p, rot: [.06, th, 0], slot: 'pouch', part: 'gear', bone: 'hips', blend: .003 }, { box: [w * 1.04, h * .36, dp * 1.06], round: .008, at: [p[0], p[1] + h * .32, p[2]], rot: [.06, th, 0], slot: 'pouch', part: 'gear', bone: 'hips', blend: .002 });
      if (big) break;
    }
  }
  const ex = a.extras, sk = skirtL || torso;
  if (ex.bag) { const th = -(PI - .8), p = sk.at(th, .93, .036); S.push({ box: [.2, .2, .075], round: .028, at: p, rot: [0, th, 0], slot: 'kit', part: 'gear', bone: 'hips', lumpy: [.04, .004], blend: .006 }, { box: [.205, .085, .08], round: .025, at: [p[0], p[1] + .062, p[2]], rot: [0, th, 0], slot: 'kit', part: 'gear', bone: 'hips', blend: .003 }); }
  if (ex.canteen) { const th = PI - .75, p = sk.at(th, .95, .032); S.push({ ball: [.056, .078, .037], at: p, rot: [0, th, 0], slot: 'flask', part: 'gear', bone: 'hips', blend: .004 }, { rod: [[p[0], p[1] + .07, p[2]], [p[0], p[1] + .098, p[2]]], r: .017, round: .004, slot: 'steel', part: 'gear', bone: 'hips', blend: .002 }); }
  if (ex.holster) { const th = ex.holster === 'left' ? .95 : -.95, p = sk.at(th, .985, .022); S.push({ box: [.075, .14, .04], round: .014, at: p, rot: [.1, th, .1], slot: 'holster', part: 'gear', bone: 'hips', blend: .004 }, { box: [.078, .05, .044], round: .012, at: [p[0], p[1] + .05, p[2]], rot: [.1, th, .1], slot: 'holster', part: 'gear', bone: 'hips', blend: .002 }); }
  if (ex.scarf) S.push({ torus: [.06, .026], at: [0, 1.535, -.008], rot: [-.22, 0, 0], slot: 'scarf', part: 'torso', lumpy: [.025, .006], blend: .012 }, { ball: [.034, .05, .02], at: [.012, 1.49, .068], rot: [.25, 0, .15], slot: 'scarf', part: 'torso', lumpy: [.025, .005], blend: .016 });   // wound round the neck, an end tucked in at the throat
  // what stands over the trunk and shades it: the neck and head, and the arms
  S.push({ taper: [[0, 1.5, -.014], Hd(0, -.07, -.01)], r: [.06, .054], ghost: true }, { ball: [.08, .1, .1], at: Hd(0, 0, -.004), ghost: true }, { loft: sleeveRows(LM), mirror: true, space: ARMSP, ghost: true });
  S.extra = X.I.length ? X : null;
  return S;
}
// the trunk's bones: the waist bends between hips and spine, a tunic's skirt half follows the thighs, knees and ankles bend
function trunkBones(x, y, z, s) {
  if (s.bone) return [[s.bone, 1]];
  const sd = x >= 0 ? 'L' : 'R', part = s.part;
  if (part === 'torso') { const w = ss(1.04, 1.17, y); return [['hips', 1 - w], ['spine', w]]; }
  if (part === 'skirt') { const k = ss(1.03, .82, y) * .62, l = ss(-.05, .05, x); return [['hips', 1 - k], ['legL', k * l], ['legR', k * (1 - l)]]; }
  if (part === 'leg') { if (abs(x) < .02 && y > .8) return [['hips', 1]]; const t = ss(.47, .57, y), up = ss(.84, 1.0, y) * .85; return [['shin' + sd, 1 - t], ['leg' + sd, t * (1 - up)], ['hips', t * up]]; }
  if (part === 'boot') { const f = 1 - ss(.07, .15, y); return [['foot' + sd, f], ['shin' + sd, 1 - f]]; }
  if (part === 'foot') return [['foot' + sd, 1]];
  return [['hips', 1]];
}

/** The left hand, fingers a little curled (grip: closed round a rifle's stock). */
function hand(a) {
  const S = [], [wx, wy, wz] = AT.handL, k = a.limbs * .97 + .03, grip = a.grip ? 1 : 0, sl = a.gloves ? 'glove' : 'skin';
  S.push({ taper: [[wx, wy + .03, wz], [wx, wy - .012, wz]], r: [.027 * k, .029 * k], slot: sl, blend: 0 });
  S.push({ box: [.027 * k, .092 * k, .08 * k], round: .0115, at: [wx - .002, wy - .058 * k, wz + .003], rot: [0, 0, -.06], slot: sl, blend: .012 });
  S.push({ ball: [.013, .03, .022], at: [wx - .012, wy - .045 * k, wz + .03], slot: sl, blend: .012 });   // the ball of the thumb
  const fz = [.03, .0105, -.009, -.0275], fl = [.95, 1.02, .95, .77], fy = [-.1, -.104, -.101, -.094];
  for (let i = 0; i < 4; i++) {
    let px = wx - .003, py = wy + fy[i] * k, pz = wz + .003 + fz[i] * k, an = .18 + grip * .75; const L = [.04, .026, .021], R = [.0092, .0082, .0074, .0066], cu = [.32 + grip * .75, .42 + grip * .55];
    S.push({ ball: .0102 * k, at: [px + .0035, py + .004, pz], slot: sl, blend: .008 });   // knuckle
    for (let j = 0; j < 3; j++) {
      const l = L[j] * fl[i] * k, qx = px - sin(an) * l, qy = py - cos(an) * l;
      S.push({ taper: [[px, py, pz], [qx, qy, pz]], r: [R[j] * k, R[j + 1] * k], slot: sl, blend: .0035 });
      px = qx; py = qy; if (j < 2) an += cu[j];
    }
  }
  // the thumb: out from the heel of the hand, forward and across the palm
  { const t0 = [wx - .008, wy - .036 * k, wz + .034 * k], dx = -.3 - grip * .5, dy = -.72, dz = .62 - grip * .3, l = Math.hypot(dx, dy, dz), m = [t0[0] + dx / l * .036 * k, t0[1] + dy / l * .036 * k, t0[2] + dz / l * .036 * k], e = [m[0] + (dx - .25) / l * .03 * k, m[1] + (dy - .1) / l * .03 * k, m[2] + (dz - .3) / l * .03 * k];
    S.push({ taper: [t0, m], r: [.0118 * k, .0098 * k], slot: sl, blend: .008 }, { taper: [m, e], r: [.0098 * k, .0082 * k], slot: sl, blend: .004 }); }
  S.push({ taper: [[wx, wy + .2, wz], [wx, wy + .012, wz]], r: [.045, .037], ghost: true });   // the cuff over the wrist
  return S;
}

export const EYE = [.032, 0, .07];   // the middle of the left eye, from the middle of the head
// the left brow: inner end, arch, tail (on the lower edge of the brow ridge, close over the eye: high on the forehead they look startled); how far the mouth's line dips to its corners (a slope)
export const BROW = [[.0115, .0195, .093], [.031, .0232, .089], [.0525, .0195, .0745]], MOUTH_DIP = .07;
/** The head and neck: a face sculpted from the skull out. f: jaw, chin, brow, nose, lips, cheeks, eyes (1 = average), soft (0 a man's .. 1 a woman's). */
function head(a) {
  const f = a.face, S = [], A = s => S.push({ slot: 'skin', ...s }), so = f.soft, J = f.jaw, nk = a.neck, y0 = HC[1], z0 = HC[2];
  // the face in slices from the chin up (flatter in front than a ball), the skull over and behind it
  A({ loft: [[y0 - .117, .016 * f.chin, .02, z0 + .062], [y0 - .106, .027 * f.chin, .034, z0 + .052, 0, 2.2], [y0 - .088, .037 * J, .05, z0 + .037, 0, 2.3], [y0 - .066, .0455 * J, .065, z0 + .024, 0, 2.4], [y0 - .04, .0545, .077, z0 + .012, 0, 2.5],
    [y0 - .015, .063, .087, z0 + .002, 0, 2.5], [y0 + .005, .0675, .0935, z0 - .006, 0, 2.4], [y0 + .03, .0715, .098, z0 - .01, 0, 2.3], [y0 + .056, .0725, .0965, z0 - .0135, 0, 2.2], [y0 + .08, .064, .083, z0 - .014], [y0 + .1, .046, .059, z0 - .014], [y0 + .112, .022, .028, z0 - .014]], blend: 0 });
  A({ ball: [.0755, .09, .097], at: Hd(0, .026, -.014), blend: .008 });
  A({ taper: [Hd(.012, .0215, .0865), Hd(.05, .024, .068)], r: [.0092 * f.brow, .007 * f.brow], mirror: true, blend: .016 });   // brow ridge
  A({ ball: .0105 * f.brow, at: Hd(0, .017, .0855), blend: .018 });
  A({ ball: [.017, .012, .013], at: Hd(.05, -.01, .049), mirror: true, blend: .03 * f.cheeks });                             // cheekbones
  A({ ball: [.017, .024, .014], at: Hd(.043, -.044, .044), rot: [0, .5, .1], mirror: true, blend: .034 });                   // the flesh of the cheek under them
  A({ ball: [.0205, .0125, .013], at: Hd(EYE[0] + .001, .002, .0875), mirror: true, cut: true, blend: .011 });               // eye sockets
  S.push({ ball: .0138, at: Hd(...EYE), mirror: true, slot: 'lid', blend: .006 });                                           // the lids, a shell over each eye
  S.push({ ball: [.0146 * f.eyes, .0038 * f.eyes, .012], at: Hd(EYE[0], -.0009, .084), rot: [0, 0, .07], mirror: true, cut: true, slot: 'lash', blend: .0012 });   // ... opened: the upper lid over the top of the iris, the lower one at its foot (white showing under the iris is a stare)
  A({ taper: [Hd(0, .008, .0885), Hd(0, -.028, .1075)], r: [.0052 - .0008 * so, .0072 * f.nose], blend: .009 });                          // nose: the bridge, widening into the tip (a ball on a thin stem is a clown's)
  A({ ball: [.0074 * f.nose, .0064 * f.nose, .0078 * f.nose], at: Hd(0, -.0335, .1105), blend: .01 });                       // tip
  A({ ball: [.0056 * f.nose, .005, .0075], at: Hd(.0118, -.0385, .0955), mirror: true, blend: .011 });                       // wings, tucked in beside it
  A({ ball: [.0036, .003, .005], at: Hd(.007, -.0465, .101), mirror: true, cut: true, blend: .003 });                        // nostrils
  A({ ball: [.026 - .004 * so, .02 - .002 * so, .018 - .002 * so], at: Hd(0, -.066, .073), blend: .018 });                                                       // the muzzle the lips sit on
  S.push({ ball: [.0245 - .0035 * so, .0044 * f.lips, .0085], at: Hd(0, -.0622, .0915 - .002 * so), slot: 'lips', blend: .004 }, { ball: [.021 - .002 * so, .0058 * f.lips, .009], at: Hd(0, -.073, .09 - .002 * so), slot: 'lips', blend: .004 });   // (a woman's: not so wide)
  S.push({ box: [.0235 - .0035 * so, .0022, .02], round: .001, at: Hd(.0113 - .0017 * so, -.0668 - MOUTH_DIP * .0113, .1015), rot: [0, 0, -MOUTH_DIP], mirror: true, cut: true, blend: .002 });   // the line between them, a touch lower at the corners than the middle (human.js colours the lips and the line)
  A({ ball: [.0195 * f.chin, .0155 * f.chin, .0155], at: Hd(0, -.099, .078), blend: .018 });                                 // chin
  A({ taper: [Hd(.043 * J, -.072, -.004), Hd(.017, -.108, .056)], r: [.009 - .0015 * so, .01 - .002 * so], mirror: true, blend: .02 });             // jaw line
  A({ ball: [.0055, .031, .0165], at: Hd(.0775, -.004, -.012), rot: [0, -.38, -.1], mirror: true, blend: .007 });            // ears
  A({ ball: [.0035, .015, .0085], at: Hd(.0835, -.002, -.0085), rot: [0, -.38, -.1], mirror: true, cut: true, blend: .004 });
  A({ taper: [Hd(0, -.08, -.022), [0, 1.488, -.016]], r: [.052 * nk, .059 * nk], blend: .03 });                              // neck (as wide as the jaw: a thinner one is a stalk the head sits on)
  if (so < .5) A({ ball: .0095, at: Hd(0, -.15, .028), blend: .02 });
  A({ taper: [Hd(.06, -.048, -.034), [.022, 1.5, .034]], r: [.012, .013], mirror: true, blend: .022 });
  // hair, cut along a line from the top of the forehead to the nape
  const hs = a.hair, hair = s => S.push({ slot: 'hair', lumpy: [.011, .0026], ...s });
  if (hs && hs !== 'bald') {
    const th = a.hat ? 0 : so > .5 ? .0085 : .0045, sx = so > .5 && !a.hat ? .46 : .28;   // cropped close under a hat, fuller without; a woman's comes lower at the temples, over the tops of her ears
    hair({ ball: [.0805 + th, .0945 + th, .1015 + th], at: Hd(0, .026, -.014), mirror: true, clip: [[sx, .757, -.59], (y0 + (so > .5 ? .056 : .07)) * .757 - (z0 + .078) * .59 + (sx - .28) * .03, .006], blend: .003 });   // lower at the temples than over the brow
    if (hs === 'bun') hair({ ball: .042, at: Hd(0, .03, -.112), blend: .012 });
    if (hs === 'long') hair({ ball: [.085, .12, .06], at: Hd(0, -.07, -.075), blend: .02 });
  }
  // brows painted on the ridge; a moustache stands a little proud
  const bw = 1 - .32 * so;   // a woman's are finer
  S.push({ taper: [Hd(...BROW[0]), Hd(...BROW[1])], r: [.0046 * bw, .0042 * bw], mirror: true, slot: 'brow', paint: true }, { taper: [Hd(...BROW[1]), Hd(...BROW[2])], r: [.0042 * bw, .003 * bw], mirror: true, slot: 'brow', paint: true });
  if (a.moustache) S.push({ ball: [.019, .0045, .0065], at: Hd(.011, -.0535, .0965), rot: [0, .3, -.18], mirror: true, slot: 'brow', lumpy: [.004, .001], blend: .002 });
  // the hat stands over the face: a brim's shadow on the brow
  const hat = a.hat && listed(HATS, a.hat.kind);
  for (const g of (hat && hat(a.hat).ghost) || []) S.push({ ...g, ghost: true, slot: null });
  return S;
}
// an eye: white, iris, pupil in clean rings (looking along +z)
function eyeball(c, r, n = 14) {
  const rings = [[0, 0], [9.5, 0], [9.5, 1], [28.5, 1], [28.5, 2], [31.5, 2], [31.5, 3], [62, 3], [98, 3]], P = [], N = [], K = [], I = [];
  for (const [deg, k] of rings) for (let i = 0; i < n; i++) { const a = deg * PI / 180, t = i / n * PI * 2, x = sin(a) * cos(t), y = sin(a) * sin(t), z = cos(a); P.push(c[0] + x * r, c[1] + y * r, c[2] + z * r); N.push(x, y, z); K.push(k); }
  for (let q = 0; q < rings.length - 1; q++) { if (rings[q][0] === rings[q + 1][0]) continue; for (let i = 0; i < n; i++) { const a = q * n + i, b = q * n + (i + 1) % n, d = a + n, e = b + n; I.push(a, e, b, a, d, e); } }
  return { P, N, K, I };
}

// ---- hats (their own bone, so one can fly off): shapes in the head's space, and what they shade
// (hats and packs are lists looked up by kind, never an object's own names: a kind comes from a game, and reaches the sculptor as text)
const HATS = new Map(Object.entries({
  // a steel helmet: a deep shell, lower at the back than the brow, flared round the sides and nape, a short peak, a low comb on top
  helmet(o) {
    const n = [0, .964, -.265], off = HC[1] * .964 - HC[2] * .265 + .004, dome = { ball: [.099, .127, .123], at: Hd(0, .012, -.011), clip: [n, off, .003] };
    const S = [{ ...dome, slot: 'helm', blend: 0 },
      { ball: [.109, .1, .135], at: Hd(0, -.006, -.016), clip: [[n, off, .003], [[0, -.964, .265], -(off + .026), .01], [[0, 0, -1], -(HC[2] + .05), .014]], slot: 'helm', blend: .014 },
      { ball: [.076, .008, .04], at: Hd(0, .0385, .094), rot: [.22, 0, 0], clip: [[0, 0, 1], HC[2] + .07, .004], slot: 'helm', blend: .008 }];
    if (o.ridge) S.push({ ball: [.0048, .1312, .098], at: Hd(0, .012, -.016), clip: [[0, 1, 0], HC[1] + .09, .004], slot: 'helm', blend: .008 });   // the comb
    S.push({ ball: [.0905, .118, .1145], at: Hd(0, .008, -.011), cut: true, blend: .003 });   // hollow
    if (o.strap) S.push({ taper: [Hd(.092, .004, -.012), Hd(.066, -.08, .02)], r: .0032, mirror: true, slot: 'strap', blend: .002 }, { taper: [Hd(.066, -.08, .02), Hd(0, -.1215, .056)], r: .0032, mirror: true, slot: 'strap', blend: .002 });
    return { S, ghost: [dome] };
  },
  // a peaked cap: a band, a crown that stands up and out, a stiff peak
  cap(o) {
    const y = HC[1], z = HC[2], crown = new Loft([[y + .042, .083, .1035, z - .012], [y + .08, .084, .1045, z - .012], [y + .1, .095, .116, z - .01], [y + .122, .106, .128, z - .004, 0, 2.5], [y + .136, .104, .126, z - .004, 0, 2.5], [y + .142, .09, .11, z - .004]]);
    const S = [{ loft: crown, slot: 'hat', lumpy: [.05, .002], blend: 0 }, { band: crown, y: [y + .043, y + .08], out: .0025, slot: 'hatband', edge: .002 }, { band: crown, y: [y + .046, y + .052], out: .0052, th: [-.95, .95], slot: 'badge', edge: .001 },
      { ball: [.078, .0055, .05], at: Hd(0, .047, .1), rot: [.5, 0, 0], clip: [[0, 0, 1], z + .074, .003], slot: 'visor', blend: .003 }, { ball: [.01, .013, .0045], at: Hd(0, .096, .1075), slot: 'badge', blend: .001 }];
    S.push({ ball: [.079, .096, .099], at: Hd(0, .02, -.014), cut: true, blend: .003 });
    return { S, ghost: [{ ball: [.078, .0055, .05], at: Hd(0, .047, .1), rot: [.5, 0, 0] }, { loft: crown }] };
  },
  // a beret: pulled down to one side over a leather band
  beret(o) {
    const S = [{ ball: [.108, .034, .112], at: Hd(.016, .094, -.012), rot: [.06, 0, -.2], slot: 'hat', lumpy: [.05, .003], blend: 0 }, { ball: [.085, .05, .1], at: Hd(0, .072, -.014), slot: 'hat', blend: .03 },
      { torus: [.0815, .0075], at: Hd(0, .058, -.014), rot: [.1, 0, 0], slot: 'strap', blend: .003 }, { ball: [.009, .011, .004], at: Hd(.03, .083, .086), slot: 'badge', blend: .001 }];
    S.push({ ball: [.079, .096, .0985], at: Hd(0, .02, -.014), cut: true, blend: .003 });
    return { S, ghost: [{ ball: [.108, .034, .112], at: Hd(.016, .094, -.012), rot: [.06, 0, -.2] }] };
  },
  // a knitted cap
  wool(o) {
    const S = [{ ball: [.083, .082, .103], at: Hd(0, .05, -.014), slot: 'hat', lumpy: [.012, .002], clip: [[0, .98, -.2], (HC[1] + .03) * .98 + .014 * .2, .004], blend: 0 }, { torus: [.083, .011], at: Hd(0, .04, -.014), rot: [.2, 0, 0], slot: 'hat', blend: .006 }];
    S.push({ ball: [.079, .096, .0985], at: Hd(0, .02, -.014), cut: true, blend: .003 });
    return { S, ghost: [{ ball: [.086, .082, .106], at: Hd(0, .05, -.014) }] };
  },
  // a hood of loose cloth, open at the face, gathered at the neck
  hood(o) {
    const S = [{ ball: [.094, .112, .116], at: Hd(0, .016, -.02), slot: 'hat', lumpy: [.04, .005], blend: 0 }, { ball: [.085, .06, .08], at: Hd(0, -.1, -.03), slot: 'hat', lumpy: [.03, .005], blend: .04 },
      { torus: [.07, .02], at: Hd(0, -.118, -.01), rot: [-.12, 0, 0], slot: 'hat', lumpy: [.02, .004], blend: .02 }];
    S.push({ ball: [.068, .094, .075], at: Hd(0, -.012, .062), cut: true, blend: .014 }, { ball: [.081, .1, .101], at: Hd(0, .016, -.012), cut: true, blend: .004 }, { taper: [Hd(0, -.07, -.02), Hd(0, -.2, -.03)], r: .063, cut: true, blend: .004 });
    return { S, ghost: [{ ball: [.094, .112, .116], at: Hd(0, .016, -.02), shell: .012, clip: [[0, .3, -1], -(HC[2] + .03) + HC[1] * .3, .01] }] };
  },
}));

// ---- things carried on the back (each on its own bone under the spine, so a game can hide it)
const PACKS = new Map(Object.entries({
  pack: () => [{ box: [.29, .33, .13], round: .04, at: [0, 1.3, -.19], rot: [.05, 0, 0], slot: 'kit', lumpy: [.05, .005], blend: 0 }, { box: [.3, .12, .14], round: .04, at: [0, 1.41, -.19], rot: [.05, 0, 0], slot: 'kit', blend: .004 },
    { rod: [[-.16, 1.49, -.19], [.16, 1.49, -.19]], r: .05, round: .03, slot: 'roll', lumpy: [.03, .004], blend: .004 }, ...[1, -1].map(s => ({ box: [.03, .26, .012], round: .004, at: [s * .08, 1.33, -.122], slot: 'strap', blend: .002 }))],
  radio: () => [{ box: [.3, .36, .14], round: .012, at: [0, 1.3, -.2], rot: [.04, 0, 0], slot: 'case', blend: 0 }, { box: [.26, .06, .1], round: .01, at: [0, 1.49, -.2], slot: 'case', blend: .002 },
    { rod: [[.1, 1.47, -.24], [.1, 2.35, -.27]], r: .0045, slot: 'steel', blend: 0 }, { rod: [[-.06, 1.5, -.16], [-.06, 1.53, -.16]], r: .02, round: .004, slot: 'steel', blend: .001 }, { rod: [[.02, 1.5, -.16], [.02, 1.525, -.16]], r: .014, round: .004, slot: 'steel', blend: .001 },
    ...[1, -1].map(s => ({ box: [.034, .3, .012], round: .004, at: [s * .1, 1.31, -.125], slot: 'strap', blend: .002 }))],
  roll: () => [{ rod: [[-.17, 1.4, -.15], [.17, 1.4, -.15]], r: .06, round: .035, slot: 'roll', lumpy: [.03, .005], blend: 0 }, ...[1, -1].map(s => ({ torus: [.062, .006], at: [s * .09, 1.4, -.15], rot: [0, 0, PI / 2], slot: 'strap', blend: .002 }))],
}));

// ================================================================= pieces: meshed, weighted, thinned
// a pretend colour per slot (so thinning keeps the edges between a belt and a tunic where they are)
const fake = i => [((i * 53) % 7) / 6, ((i * 29) % 5) / 4, ((i * 17) % 3) / 2];
/**
 * Shapes into a finished piece: points (P) with normals (N, 16-bit), crease shading (ao, 8-bit), the slot
 * and bones of each (SI, SW 8-bit), and three sets of triangles (I: close, middle, far), all plain arrays.
 * bones(x, y, z, shape) => [[bone, weight]...].
 */
export function finish(shapes, { cell, bones, keep = [.3, .07, .012], err = [.0012, .006, .03], reach = .09, blend = .008, extra = null }) {
  const m = meshOf(shapes, { cell, blend, reach, keep: keep[0], error: err[0] });
  let { P, N, I } = m; const n0 = m.n, slots = [], names = [];
  let slot = new Uint8Array(n0), ao = m.ao, SI = new Uint8Array(n0 * 4), SW = new Float32Array(n0 * 4);
  const idOf = (list, v) => { let i = list.indexOf(v); if (i < 0) { i = list.length; list.push(v); } return i; };
  for (let i = 0; i < n0; i++) {
    const s = m.shapes[m.own[i]] || m.shapes[0], x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    slot[i] = idOf(slots, s.slot || 'skin');
    const w = bones(x, y, z, s.src).filter(q => q[1] > .002).sort((a, b) => b[1] - a[1]).slice(0, 4), sum = w.reduce((a, q) => a + q[1], 0) || 1;
    w.forEach(([b, v], k) => { SI[i * 4 + k] = idOf(names, s.mirror && x < 0 && s.src.bone ? other(b) : b); SW[i * 4 + k] = v / sum; });
  }
  // extra hard-edged parts (eyes, buttons) joined on: { P, N, K (slot per point, by name), I, src (what each rides, for its bones) }
  if (extra) {
    const add = extra.P.length / 3, nn = n0 + add, grow = (A, per) => { const B = new A.constructor(nn * per); B.set(A.subarray(0, n0 * per)); return B; };
    P = grow(P, 3); N = grow(N, 3); slot = grow(slot, 1); ao = grow(ao, 1); SI = grow(SI, 4); SW = grow(SW, 4);
    for (let i = 0; i < add; i++) { const j = n0 + i; for (let c = 0; c < 3; c++) { P[j * 3 + c] = extra.P[i * 3 + c]; N[j * 3 + c] = extra.N[i * 3 + c]; } slot[j] = idOf(slots, extra.K[i]); ao[j] = extra.ao ?? 1; const x = P[j * 3], y = P[j * 3 + 1], z = P[j * 3 + 2], w = bones(x, y, z, extra.src ? extra.src[i] : {}).filter(q => q[1] > .002).sort((a, b) => b[1] - a[1]).slice(0, 4), sum = w.reduce((a, q) => a + q[1], 0) || 1; w.forEach(([b, v], k) => { SI[j * 4 + k] = idOf(names, b); SW[j * 4 + k] = v / sum; }); }
    const J = new Uint32Array(I.length + extra.I.length); J.set(I); for (let i = 0; i < extra.I.length; i++) J[I.length + i] = extra.I[i] + n0; I = J;
  }
  // the middle and far sets of triangles, thinned from the close one (the points are shared)
  const n = P.length / 3, C = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const c = fake(slot[i]); C[i * 3] = c[0] * .6 + ao[i] * .4; C[i * 3 + 1] = c[1] * .6 + ao[i] * .4; C[i * 3 + 2] = c[2]; }
  const I1 = thin(I, P, N, C, keep[1] / keep[0], err[1]), I2 = thin(I1, P, N, C, keep[2] / keep[1], err[2]);
  // packed small: it is kept in memory, sent between threads and saved
  const Nq = new Int16Array(n * 3), aq = new Uint8Array(n), Wq = new Uint8Array(n * 4), tri = J => n <= 65535 ? Uint16Array.from(J) : Uint32Array.from(J);
  for (let i = 0; i < n * 3; i++) Nq[i] = Math.round(N[i] * 32767);
  for (let i = 0; i < n; i++) aq[i] = Math.round(Math.max(0, Math.min(1, ao[i])) * 255);
  for (let i = 0; i < n * 4; i++) Wq[i] = Math.round(SW[i] * 255);
  return { n, P: P.byteOffset || P.buffer.byteLength !== P.byteLength ? P.slice() : P, N: Nq, slot, ao: aq, SI, SW: Wq, I: [tri(I), tri(I1), tri(I2)], slots, names };
}
/** The same piece on the other side: x turned over, triangles turned round, left bones for right. */
export function mirrored(p) {
  const P = p.P.slice(), N = p.N.slice(); for (let i = 0; i < p.n; i++) { P[i * 3] = -P[i * 3]; N[i * 3] = -N[i * 3]; }
  const flip = J => { const o = J.slice(); for (let i = 0; i < o.length; i += 3) { const t = o[i + 1]; o[i + 1] = o[i + 2]; o[i + 2] = t; } return o; };
  return { ...p, P, N, I: p.I.map(flip), names: p.names.map(other) };
}
/** A piece sculpted hanging straight down (a hand, a thing held) turned out with the arm, as the skeleton is bound (sgn: 1 left, -1 right). */
export function turned(p, sgn) {
  const P = p.P.slice(), N = p.N.slice(), px = sgn * AT.armL[0], py = AT.armL[1], c = CA, sn = sgn * SA;
  for (let i = 0; i < p.n; i++) { const dx = P[i * 3] - px, dy = P[i * 3 + 1] - py, nx = N[i * 3], ny = N[i * 3 + 1]; P[i * 3] = px + c * dx - sn * dy; P[i * 3 + 1] = py + sn * dx + c * dy; N[i * 3] = Math.round(c * nx - sn * ny); N[i * 3 + 1] = Math.round(sn * nx + c * ny); }
  return { ...p, P, N };
}

// ================================================================= what to sculpt for a person
const bit = v => v ? 1 : 0;
const plain = v => v == null || (typeof v !== 'object' && typeof v !== 'function') || (Array.isArray(v) ? v.every(plain) : typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain));
/**
 * The pieces a person (a spec from human.js) is made of: [{ kind, a, key }]. `a` holds only what shapes the
 * piece (never a colour), so people in the same cut of clothes share it; key names it (memory, saved copies).
 * local: it can't be sent to a worker (a maker's own shapes with functions in them).
 */
export function jobsFor(sp) {
  const { top, web, extras: ex, hat } = sp, J = [];
  const add = (kind, a, more) => J.push({ kind, a, key: kind + JSON.stringify(a, (k, v) => typeof v === 'function' ? String(v) : v), ...more });
  add('trunk', { build: sp.build, top: { kind: top.kind, pockets: top.pockets | 0, buttons: bit(top.buttons), collar: top.collar === false ? false : bit(top.collar), tabs: bit(top.tabs), straps: bit(top.straps), strapColour: bit(top.strapColour) },
    legs: { kind: sp.legs.kind }, feet: { kind: sp.feet.kind }, belt: bit(sp.belt), web: web ? { y: bit(web.y), cross: bit(web.cross), pouches: web.pouches | 0, kind: web.kind || '' } : 0,
    extras: { bag: bit(ex.bag), canteen: bit(ex.canteen), holster: ex.holster === 'left' ? 'left' : bit(ex.holster), scarf: bit(ex.scarf) } });
  // the arms: one sculpted and turned over for the other, unless the left wears an armband (side: which it is for)
  const armA = band => ({ build: sp.build, top: { kind: top.kind, sleeves: top.sleeves, cuffs: bit(top.cuffs), band } });
  add('arm', armA(bit(top.band)), { side: top.band ? 'L' : 'LR' }); if (top.band) add('arm', armA(0), { side: 'R' });
  add('hand', { limbs: sp.build.limbs, grip: bit(sp.hands === 'grip'), gloves: bit(sp.gloves) });
  const hatA = hat && HATS.has(hat.kind) ? { kind: hat.kind, ridge: bit(hat.ridge !== false), strap: bit(hat.strap !== false) } : null;
  add('head', { face: sp.face, neck: sp.build.neck, hair: sp.hair ? sp.hairStyle : 'bald', moustache: bit(sp.moustache), hat: hatA });
  if (hatA) add('hat', hatA);
  if (sp.pack && PACKS.has(sp.pack.kind)) add('pack', { kind: sp.pack.kind });
  for (const g of sp.gear) add('gear', { shapes: g.shapes, cell: g.cell || .004, keep: g.keep || [.3, .06, .012], err: g.err || null, blend: g.blend ?? .004 }, { g, local: !plain(g.shapes) });
  return J;
}
const whole = () => [['$', 1]];
// the maker of a hat or pack by its kind: one from the list (and a function, checked before anything calls it), or null
function listed(list, kind) { const f = list.get(kind); if (typeof f === 'function') return f; return null; }
/** Sculpts one piece (a job from jobsFor). The slow part: a tenth of a second for a hand, a second or two for a trunk on a phone. */
export function sculpt({ kind, a }) {
  if (kind === 'trunk') { const S = trunk(a); return finish(S, { cell: .006, bones: trunkBones, extra: S.extra }); }
  if (kind === 'arm') return finish(arm(a), { cell: .006, bones: armBones });
  if (kind === 'hand') return finish(hand(a), { cell: .0032, bones: () => [['handL', 1]], keep: [.2, .035, .006], err: [.0006, .004, .02], blend: .004 });
  if (kind === 'head') {
    const eye = { P: [], N: [], K: [], I: [], ao: .78 };
    for (const s of [1, -1]) { const e = eyeball(Hd(s * EYE[0], EYE[1], EYE[2]), .0122), base = eye.P.length / 3; eye.P.push(...e.P); eye.N.push(...e.N); eye.K.push(...e.K.map(k => 'eye' + k)); eye.I.push(...e.I.map(i => i + base)); }
    return finish(head(a), { cell: .003, bones: (x, y) => { const h = ss(1.5, 1.585, y); return [['spine', 1 - h], ['head', h]]; }, keep: [.34, .05, .008], err: [.0005, .004, .02], reach: .07, blend: .01, extra: eye });
  }
  if (kind === 'hat' || kind === 'pack') {
    const make = listed(kind === 'hat' ? HATS : PACKS, a.kind); if (!make) throw new Error(`gs.models.human: no ${kind} called '${a.kind}'`);
    return kind === 'hat' ? finish(make(a).S, { cell: .004, bones: whole, keep: [.3, .06, .012], blend: .006 }) : finish(make(), { cell: .006, bones: whole, keep: [.25, .06, .012], blend: .006 });
  }
  return finish(a.shapes, { cell: a.cell, bones: whole, keep: a.keep, err: a.err || undefined, blend: a.blend });
}
// a number for all of the above as it stands: saved pieces made by other workings are not used
const cyrb = s => { let a = 0xdeadbeef, b = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); } a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909); return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36); };
export const hashOf = cyrb;
export const VERSION = cyrb(stamp() + [trunk, trunkBones, torsoOf, sleeveRows, arm, armBones, hand, head, eyeball, stud, finish, sculpt, ...HATS.values(), ...PACKS.values(), BROW, MOUTH_DIP].map(String).join(''));
