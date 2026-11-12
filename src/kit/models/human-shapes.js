// The shapes gs.models.human is sculpted from, and the sculpting itself: a person is a few pieces (the
// trunk in its clothes, a hand, the head, a hat, a pack, a maker's own kit), each a list of soft shapes
// (field.js) melted into one surface, meshed, given its bones and thinned to three levels of detail.
// Nothing in here needs three.js or the page: it runs in background workers (human-worker.js), so a
// game never stops while its people are made, and what it makes is plain numbers that can be saved.
// Kit use only: games reach it as gs.models.human.
import { Loft, mesh as meshOf, thin, ready, smin, lumps, stamp, thinReady } from './field.js';
export { thinReady };
import { head as headOf, mouthAt, eyeRim, browOf, ss, bump, HC, Hd, EYE, CORNER, HEAD_STAMP } from './human-head.js';
import { row, easeOf, torsoOf, shoulderOf, torsoForms, sleeveRows, capOf, seatOf, seatRounds, legRows, lowRows, shaftRows, gaiterRows, neckRows, neckOpening, over, FOOT, BODY_STAMP } from './human-body.js';
export { ss, bump, HC, EYE, CORNER, mouthAt, eyeRim, browOf };

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs;

// ---- the skeleton: the bones gs.poses' Rig moves, at a grown person's proportions (1.8 m, feet at y = 0,
// facing +z, the left side at +x), arms and legs hanging straight down.
// Fifteen of them are the ones poses name (hips, spine, head, arms, forearms, hands, legs, shins, feet): each
// keeps its place and its meaning (a pose's `spine` is the whole turn of the rib cage on the hips, `head` the
// head's on the chest), and things ride them as they always did. Between them are joints the rig works out by
// itself (Rig.fill): the waist under the rib cage (which turns about PIVOT.spine, a hand's width higher, so a
// back bends as a curve and not at a hinge), the neck under the head (which turns where the skull sits on it),
// a collar bone to each shoulder, the turn along each forearm. Then the toes, and the fingers (fingerBones()).
export const BONES = ['hips', 'waist', 'spine', 'neck', 'head', 'collarL', 'armL', 'foreL', 'twistL', 'handL', 'collarR', 'armR', 'foreR', 'twistR', 'handR', 'legL', 'shinL', 'footL', 'toeL', 'legR', 'shinR', 'footR', 'toeR'];
export const PARENT = { waist: 'hips', spine: 'waist', neck: 'spine', head: 'neck', collarL: 'spine', armL: 'collarL', foreL: 'armL', twistL: 'foreL', handL: 'foreL', collarR: 'spine', armR: 'collarR', foreR: 'armR', twistR: 'foreR', handR: 'foreR',
  legL: 'hips', shinL: 'legL', footL: 'shinL', toeL: 'footL', legR: 'hips', shinR: 'legR', footR: 'shinR', toeR: 'footR' };
export const AT = {
  hips: [0, 1.0, 0], waist: [0, 1.1, 0], spine: [0, 1.1, 0], neck: [0, 1.525, -.012], head: [0, 1.525, -.012],
  collarL: [.022, 1.462, .03], armL: [.188, 1.44, -.012], foreL: [.2, 1.165, -.01], twistL: [.2, 1.03, -.003], handL: [.2, .895, .004],
  legL: [.094, .955, 0], shinL: [.097, .52, 0], footL: [.097, .085, -.006], toeL: [.1, .028, .12],
};
for (const k of Object.keys(AT)) if (k.endsWith('L')) AT[k.slice(0, -1) + 'R'] = [-AT[k][0], AT[k][1], AT[k][2]];
// where the rib cage and the head turn about, from their bones' own places (the bones stay where they were: a game's hit areas, a slung rifle and a hat hang on them)
export const PIVOT = { spine: [0, .17, 0], head: [0, .13, .004] };
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

// the greater of two measures, rounded where they meet (a strip of cloth: as thick as it stands, as wide as its outline)
const soft = (a, b, k) => Math.max(a, b) + .5 * Math.max(0, k - abs(a - b)) ** 2 / k;
// a pocket, a strap or a belt laid on a body part wears that part's own lumps and folds, so it lies on the cloth and not through it
const on = (base, s) => ({ lumpy: base.lumpy, folds: base.folds, foldMax: base.foldMax, blend: .004, ...s });

/**
 * The left arm in its sleeve, shoulder to cuff. A piece of its own, not melted into the trunk: it turns in the
 * shoulder the way a doll's does, round a ball that stays inside the body, so however far an arm is raised
 * nothing stretches or tears at the armpit (one skin there turned inside out once the arm passed the chest).
 */
function arm(a) {
  const { build: b, top } = a, LM = b.limbs, S = [], short = top.sleeves === 'short', e = easeOf(top.kind), rows = sleeveRows(LM, e), hem = rows.find(r => r[0] > 1.25);
  const sleeve = new Loft(short ? rows.filter(r => r[0] > 1.25).concat([[1.215, hem[1] + .003, hem[2] + .003, hem[3], .198, hem[5], hem[6] + .003, hem[7]]]) : rows);   // (a short one ends above the elbow, a little wider than the arm in it)
  const elbow = (x, y, z) => { const th = Math.atan2(x - .2, z + .01), w = lumps(x * 11, y * 15, z * 11); return .0016 * bump(y, 1.17, .06) * sin(y * 190 + th * 2.4 + 3.6 * w) * (.65 + .35 * cos(th)) + .002 * bump(y, 1.39, .05) * sin(th * 6 + y * 30 + 3 * w); };
  const SL = { loft: sleeve, slot: 'top', space: ARMSP, lumpy: [.06, .0018], folds: elbow, foldMax: .004, blend: 0 }, onA = s => on(SL, { space: ARMSP, ...s }); S.push(SL);
  S.push(onA({ ...capOf(LM, e), slot: 'top', blend: .014 }));
  if (short) S.push({ loft: sleeveRows(LM, -.0035).filter(r => r[0] < 1.3), slot: 'skin', space: ARMSP, blend: .006 });
  else S.push(onA({ band: sleeve, y: [.892, .945], out: .003, slot: top.cuffs ? 'trim' : 'top', edge: .002 }), { ball: .0305, at: [.2, .884, .004], space: ARMSP, cut: true, blend: .004 });   // a cuff, open at the wrist
  if (top.band) S.push(onA({ band: sleeve, y: [1.29, 1.355], out: .0036, slot: 'band', edge: .002 }));   // an armband
  S.push({ loft: torsoOf(b, top.kind), ghost: true });   // the body beside it, for the shade under the arm
  return S;
}
// the arm's bones: the elbow bends between arm and forearm; down the forearm the cloth and skin turn with the hand a little more at every step (twistL), as a forearm does
function armBones(x, y, z) { const [, ly] = armLocal(abs(x), y, z), t = ss(1.115, 1.215, ly), w = ss(1.09, .93, ly); return [['foreL', (1 - t) * (1 - w)], ['twistL', (1 - t) * w], ['armL', t]]; }

/** The trunk: torso, hips, legs and feet, in what they wear (the arms are pieces of their own). */
function trunk(a) {
  const { build: b, top, legs, feet, belt, web } = a, S = [], kind = top.kind, HP = b.hips, LM = b.limbs, nk = b.neck ?? 1;
  const ease = easeOf(kind), skirted = kind === 'tunic' || kind === 'smock';
  const torso = torsoOf(b, kind), X = studs(), forms = torsoForms(b);
  // gathers where the belt pulls the cloth in, a little slack under the chest
  const gather = (x, y, z) => { const th = Math.atan2(x, z); return .003 * ss(1.22, 1.1, y) * ss(1.0, 1.06, y) * sin(th * 13 + 4 * lumps(x * 11, y * 4, z * 11)) + .0025 * bump(y, 1.21, .03) * lumps(x * 22, y * 30, z * 22); };
  // (the cloth's own unevenness fades out at the neck, where skin lies close over it: lower down under a round neck, whose edge lies on the skin)
  const even = top.collar === false ? 1.47 : 1.5, wear = (x, y, z) => forms(x, y, z) + .002 * lumps(x / .07, y / .07 + 7.3, z / .07) * ss(even, even - .05, y) + (belt ? gather(x, y, z) : 0);
  const T = { loft: torso, slot: 'top', part: 'torso', folds: wear, foldMax: .011, blend: 0 }; S.push(T);
  S.push({ ...shoulderOf(b.shoulders, ease * .45), mirror: true, slot: 'top', part: 'torso', blend: .025 });   // the round of each shoulder, under the arm's cap
  let K = T, skirtL = null;   // what hangs at the hips lies on: the tunic's skirt, or the trunk itself
  if (skirted) {
    const len = kind === 'smock' ? .74 : .8, fl = kind === 'smock' ? 1.04 : 1;
    // (it hangs from the belt out over the seat and then straight down)
    const skirt = new Loft([row(len, .204 * HP * fl, .122 * fl, -.16 * HP * fl, -.014, 2.3, 2.5), row(len + .03, .204 * HP * fl, .122 * fl, -.16 * HP * fl, -.014, 2.3, 2.5), row(.92, .198 * HP, .114, -.157 * HP, -.014, 2.3, 2.5), row(.97, .19 * HP, .112, -.147 * HP, -.012, 2.3, 2.5), over(torso, 1.03, .0015), over(torso, 1.075, .0005)]);
    const flute = (x, y, z) => { const th = Math.atan2(x, z); return .0035 * ss(1.04, .9, y) * sin(th * 9 + 3 * lumps(x * 7, 1, z * 7)); };
    K = { loft: skirt, slot: 'top', part: 'skirt', lumpy: [.08, .003], folds: flute, blend: .012 }; S.push(K);
    // the hem: a narrow turned edge, so the skirt ends in one straight line; what is under that line is in its shade, and takes the colour of the legs
    // (not hollowed out underneath: cloth this close to the thighs leaves a gap thinner than the mesh can show, and it came out ragged)
    const under = [len - .06, .24 * HP * fl, .16 * fl, -.2 * HP * fl, -.014, 2.3, 2.5];
    S.push(on(K, { band: skirt, y: [len + .003, len + .02], out: .0012, slot: 'top', part: 'skirt', edge: .001 }), { loft: [row(...under), row(len + .0035, ...under.slice(1))], paint: true, over: 'top', slot: 'legs', part: 'skirt' });
    skirtL = skirt;
    if (top.pockets >= 4) for (const s of [1, -1]) {
      S.push(on(K, { patch: skirt, at: [s * .66, .915], size: [.128, .14], round: .016, out: .0042, slot: 'top', part: 'skirt' }), on(K, { patch: skirt, at: [s * .66, .978], size: [.134, .046], round: .012, out: .0078, slot: 'top', part: 'skirt' }));
      if (top.buttons) stud(X, skirt.at(s * .66, .972, .0078), [sin(s * .66), 0, cos(s * .66)], .0075, .0035, 'button', { part: 'skirt' });
    }
  } else if (kind === 'blouse') S.push(on(T, { band: torso, y: [1.0, 1.07], out: .0075, slot: 'top', part: 'torso', edge: .006 }));   // the waistband the blouse gathers into
  // the seat and legs
  const seat = seatOf(b, torso, skirted);
  S.push({ loft: seat, slot: 'legs', part: 'hips', blend: .005 }, { ...seatRounds(b), mirror: true, slot: 'legs', part: 'hips', blend: .03 });
  if (!skirted && kind !== 'blouse') S.push({ band: torso, y: [1.0, 1.056], out: .0042, slot: 'legs', part: 'hips', edge: .0025 });   // the waistband, over a shirt tucked in
  const fl = legs.kind === 'breeches' ? 1.16 : 1, tall = feet.kind === 'tall', gait = feet.kind === 'gaiters', tuck = tall || gait;
  const leg = new Loft(legRows(b, fl, lowRows(b, feet.kind)));
  const knee = (x, y, z) => { const th = Math.atan2(abs(x) - .097, z), w = lumps(x * 9, y * 13, z * 9); return .0012 * bump(y, .535, .06) * sin(y * 170 + th * 2.2 + 3.6 * w) * (.6 - .4 * cos(th)) + (tuck ? .004 * bump(y, .49, .035) * sin(th * 7 + 3 * w) : .0028 * bump(y, .112, .024) * ss(-.3, .7, cos(th)) + .0012 * bump(y, .17, .05) * sin(y * 150 + th * 2.6 + 3.6 * w)); };
  const LG = { loft: leg, slot: 'legs', part: 'leg', mirror: true, lumpy: [.07, .0022], folds: knee, blend: .018 }; S.push(LG);
  if (tuck) S.push({ ball: [.071 * LM, .038, .075 * LM], at: [.097, tall ? .491 : .374, -.012], slot: 'legs', part: 'leg', mirror: true, lumpy: [.03, .004], blend: .028 });   // the trouser leg bloused over the boot top (down to its rim, not over it)
  // boots or shoes
  const topY = tall ? .452 : gait ? .2 : feet.kind === 'boots' ? .19 : .1;
  const crease = (x, y, z) => .002 * bump(y, .135, .04) * sin(y * 240 + z * 40 + 3 * lumps(x * 20, y * 9, z * 20));
  const shaft = new Loft(shaftRows(feet.kind, topY)), above = (y0, y1) => [row(y0, .1, .1, -.12, -.012, 2.1, 2.1, .098), row(y1, .1, .1, -.12, -.012, 2.1, 2.1, .098)];
  S.push({ loft: shaft, slot: 'boots', part: 'boot', mirror: true, folds: tall || feet.kind === 'boots' ? crease : null, foldMax: .002, blend: .01 });
  // a trouser leg worn over the boot ends in a hem with a straight edge (what is under that line is in its shade, and takes the boot's colour)
  if (!tuck) S.push(on(LG, { band: leg, y: [.0785, .096], out: .0012, slot: 'legs', part: 'leg', mirror: true, edge: .001 }), { loft: above(.02, .079), paint: true, over: 'legs', slot: 'boots', part: 'leg', mirror: true });
  // (a tall boot's top is a rim with a straight edge; the cloth bloused over it starts at that line)
  if (tall) S.push({ band: shaft, y: [topY - .017, topY - .003], out: .0012, slot: 'boots', part: 'boot', mirror: true, edge: .001 }, { loft: above(topY - .0025, topY + .06), paint: true, over: 'boots', slot: 'legs', part: 'leg', mirror: true });
  const grown = (f, by) => f.ball ? { ...f, ball: f.ball.map(r => r + by) } : { ...f, r: f.r.map(r => r + by) };
  for (const f of FOOT) S.push({ ...f, slot: 'boots', part: 'foot', mirror: true, blend: .014 }, { ...grown(f, .0045), clip: [[0, -1, 0], -.02, .002], slot: 'sole', part: 'foot', mirror: true, blend: .004 });
  S.push({ box: [.076, .03, .08], round: .01, at: [.098, .012, -.042], slot: 'sole', part: 'foot', mirror: true, blend: .004 });   // the heel
  if (gait) {
    // gaiters: canvas laced round the ankle, two straps, and a straight edge top and bottom (the cloth above and the boot below start at those lines)
    const g = new Loft(gaiterRows(LM)), G = { loft: g, slot: 'kit', part: 'boot', mirror: true, lumpy: [.03, .002], blend: .006 }, edge = (y0, y1) => on(G, { band: g, y: [y0, y1], out: .0012, slot: 'kit', part: 'boot', mirror: true, edge: .001 });
    S.push(G, on(G, { band: g, y: [.14, .158], out: .004, slot: 'strap', part: 'boot', mirror: true }), on(G, { band: g, y: [.27, .288], out: .004, slot: 'strap', part: 'boot', mirror: true }));
    S.push(edge(.318, .332), { loft: above(.3325, .4), paint: true, over: 'kit', slot: 'legs', part: 'leg', mirror: true }, edge(.108, .122), { loft: above(.06, .1075), paint: true, over: 'kit', slot: 'boots', part: 'boot', mirror: true });
  }
  S.push({ box: [1.2, .3, 1.2], at: [0, -.15, 0], cut: true, blend: 0 });   // soles flat on the ground
  // ---- the top's details
  if (top.collar !== false) {
    // the collar itself is a piece of its own (collar(), below): here, only its shade on the shoulders it stands on
    S.push({ loft: collarRows(nk), clip: RIM, ghost: true });
  } else {
    // a round neck, open to the pit of the throat. The skin in the opening is the head's own (human-head.js, `foot`): the foot of the neck, the
    // collar bones, the pit between them, all one skin with the face. Here the cloth lies on the same forms (the sweep up from each shoulder to the
    // neck, the collar bones under it) and ends in an edge with an outline of its own, as a belt has, so it comes out as one clean line. Inside
    // that line the trunk dips away under the head's skin, within a few millimetres. The dip keeps the cloth's colour: what little shows of it
    // is its side, which reads as the thickness of the hem (painted as skin it was a pale rim along the neckline). The head's skin lies a little
    // lower just there, or it would cover the points slid onto the line from inside it, which lie in the dip, and the edge had notches.
    // It dips: it is not cut away. The opening is an egg-shaped space, and a hollow that shape left a sliver of cloth at the nape, where the
    // egg's wall runs nearly along the back, and a knife's edge everywhere else: both thinner than the sculpting's grid, and they came out as
    // teeth. (The skin of the opening was the trunk's once, all of it: where the head's neck stood in it the two met in a line that ran in
    // scallops round the neck's cords, with the light falling differently on either side.)
    const foot = new Loft(neckRows(nk).slice(0, 3)), bone = { taper: [[.017, 1.4795, .0445], [.064, 1.487, .037]], r: [.0075, .006], mirror: true, slot: 'top', part: 'torso', blend: .014 }, boneD = ready([bone])[0].d;
    const body = (x, y, z) => smin(smin(torso.d(x, y, z), foot.d(x, y, z), .028), boneD(x, y, z), .014), m = (x, y, z) => abs(neckOpening(x, y, z) - .0065) - .0065;
    S.push({ loft: foot, slot: 'top', part: 'torso', blend: .028 }, bone);
    S.push({ field: (x, y, z) => { const e = neckOpening(x, y, z); return e >= 0 ? 1 : -body(x, y, z) - .012 * ss(0, .01, -e); }, lo: [-.1, 1.45, -.105], hi: [.1, 1.64, .1], cut: true, blend: 0 });   // (deeper than the pit of the throat)
    S.push(on(T, { field: (x, y, z) => soft(body(x, y, z) - .0012, m(x, y, z), .002), m, out: .0012, lo: [-.11, 1.45, -.11], hi: [.11, 1.56, .09], slot: 'top', part: 'torso', blend: .002 }));
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
    // a strap over a shoulder: the cloth grown a little and cut to a strip between two planes, so it lies on the body all the way over (a straight bar stood off it at both ends)
    // (with an outline of its own, as a belt has, so its edges come out straight and its colour stops dead at them)
    const strip = (n, off, more, both = true) => {
      const planes = [[n, off - .015], [n.map(v => -v), -off - .015], ...more], m = (x, y, z) => { let v = -1; for (const [[a, b, c], o] of planes) v = Math.max(v, o - (a * x + b * y + c * z)); return v; };
      return on(T, { field: (x, y, z) => soft(torso.d(x, y, z) - .0084, m(x, y, z) + .0015, .005), m, out: .0084, lo: [both ? 0 : -.2, 1.04, -.17], hi: [both ? .17 : .2, 1.57, .16], slot: 'strap', part: 'torso', mirror: both, blend: .003 });
    };
    if (web.y) {
      S.push(strip([-.9921, .1252, 0], .08885, [[[0, 0, 1], -.012], [[0, 1, 0], 1.06]]));   // up the front from the belt and onto the shoulder
      S.push(strip([-.8962, .4437, 0], .5768, [[[0, 0, -1], .012], [[1, 0, 0], 0]]));       // down the back to the middle
      S.push(on(T, { patch: torso, at: [PI, 1.18], size: [.03, .2], round: .004, out: .0088, slot: 'strap', part: 'torso' }), { torus: [.014, .0045], at: torso.at(PI, 1.275, .006), rot: [PI / 2, 0, 0], slot: 'buckle', part: 'torso', blend: .001 });
    }
    // a cross strap: from the belt at the left hip up over the right shoulder and down the back to the belt again, all in one plane
    // (two patches turned on the slant had edges like a saw's: their outline ran across the grid, and down a wall too steep to slide points along)
    if (web.cross) S.push(strip([.878, .479, 0], .6307, [[[0, 1, 0], 1.058]], false));
    const big = web.kind === 'big';
    for (let i = 0; i < (web.pouches || 0); i++) for (const s of [1, -1]) {
      const th = s * (big ? .5 : .3 + i * .31), w = big ? .09 : .041, h = big ? .15 : .085, dp = big ? .06 : .03, p = torso.at(th, big ? 1.0 : 1.035, dp / 2 + .004);
      S.push({ box: [w, h, dp], round: .009, at: p, rot: [.06, th, 0], slot: 'pouch', part: 'gear', bone: 'hips', blend: .003 }, { box: [w * 1.04, h * .36, dp * 1.06], round: .008, at: [p[0], p[1] + h * .32, p[2]], rot: [.06, th, 0], slot: 'pouch', part: 'gear', bone: 'hips', blend: .002 });
      if (big) break;
    }
  }
  const ex = a.extras, sk = skirtL || seat;
  // what hangs from the belt goes with a bone of its own, so it can swing (S.hang: where each hangs from, which way is out from the body there, and how loosely: see follow.js)
  const hang = S.hang = {}, hung = (name, th, at, o) => { hang[name] = { at, away: [sin(th), 0, cos(th)], ...o }; return name; };
  if (ex.bag) { const th = -(PI - .8), p = sk.at(th, .93, .036), b = hung('bag', th, [p[0] * .9, p[1] + .1, p[2] * .9], { swing: .03, bounce: .0008, stiff: 110, damp: 9, most: .14 }); S.push({ box: [.2, .2, .075], round: .028, at: p, rot: [0, th, 0], slot: 'kit', part: 'gear', bone: b, lumpy: [.04, .004], blend: .006 }, { box: [.205, .085, .08], round: .025, at: [p[0], p[1] + .062, p[2]], rot: [0, th, 0], slot: 'kit', part: 'gear', bone: b, blend: .003 }); }
  if (ex.canteen) { const th = PI - .75, p = sk.at(th, .95, .032), b = hung('flask', th, [p[0] * .92, p[1] + .1, p[2] * .92], { swing: .036, bounce: .0006, stiff: 120, damp: 9, most: .16 }); S.push({ ball: [.056, .078, .037], at: p, rot: [0, th, 0], slot: 'flask', part: 'gear', bone: b, blend: .004 }, { rod: [[p[0], p[1] + .07, p[2]], [p[0], p[1] + .098, p[2]]], r: .017, round: .004, slot: 'steel', part: 'gear', bone: b, blend: .002 }); }
  if (ex.holster) { const th = ex.holster === 'left' ? .95 : -.95, p = sk.at(th, .985, .022), b = hung('holster', th, [p[0] * .94, p[1] + .07, p[2] * .94], { swing: .012, stiff: 160, damp: 12, most: .06 }); S.push({ box: [.075, .14, .04], round: .014, at: p, rot: [.1, th, .1], slot: 'holster', part: 'gear', bone: b, blend: .004 }, { box: [.078, .05, .044], round: .012, at: [p[0], p[1] + .05, p[2]], rot: [.1, th, .1], slot: 'holster', part: 'gear', bone: b, blend: .002 }); }
  // what stands over the trunk and shades it: the neck and head, and the arms
  S.push({ loft: [[1.5, .0605 * nk, .0595, -.018], [1.555, .0565 * nk, .056, -.02], [1.6, .0535 * nk, .052, -.022], [1.64, .051 * nk, .051, -.03]], ghost: true }, { ball: [.0755, .09, .1], at: Hd(0, .026, -.006), ghost: true }, { loft: sleeveRows(LM, ease), mirror: true, space: ARMSP, ghost: true });
  S.extra = X.I.length ? X : null;
  return S;
}
// the trunk's bones (for one build): the back bends at the waist and again under the ribs, the top of each shoulder rides its collar bone, a tunic's skirt half follows the thighs, knees, ankles and toes bend
const trunkBones = a => { const jx = AT.armL[0] + .176 * (a.build.shoulders - 1); return (x, y, z, s) => {
  if (s.bone) return [[s.bone, 1]];
  const sd = x >= 0 ? 'L' : 'R', part = s.part;
  // (the round of a shoulder goes half with the arm: it lifts with an arm held out, and folds away under one raised overhead instead of standing beside it)
  if (part === 'torso') { const ax = abs(x), w = ss(1.04, 1.17, y), u = ss(1.19, 1.35, y), c = ss(.05, .17, ax) * ss(1.33, 1.45, y), ar = .55 * ss(jx - .012, jx + .04, ax) * ss(1.365, 1.4, y), k = 1 - ar; return [['hips', (1 - w) * k], ['waist', w * (1 - u) * k], ['spine', u * (1 - c) * k], ['collar' + sd, u * c * k], ['arm' + sd, ar]]; }
  if (part === 'skirt') { const k = ss(1.03, .82, y) * .62, l = ss(-.05, .05, x); return [['hips', 1 - k], ['legL', k * l], ['legR', k * (1 - l)]]; }
  // (the seat and the top of a thigh go with the leg by the same measure, whichever shape a point is on: the round of the seat stretches after a thigh swung forward)
  if (part === 'leg' || part === 'hips') { const t = part === 'leg' ? ss(.47, .57, y) : 1, g = y > .8 ? ss(.99, .85, y) * ss(.015, .07, abs(x)) : 1; return [['shin' + sd, 1 - t], ['leg' + sd, t * g], ['hips', t * (1 - g)]]; }
  if (part === 'boot') { const f = 1 - ss(.07, .15, y); return [['foot' + sd, f], ['shin' + sd, 1 - f]]; }
  if (part === 'foot') { const t = ss(.105, .135, z); return [['foot' + sd, 1 - t], ['toe' + sd, t]]; }
  return [['hips', 1]];
}; };

// ---- what is worn round the neck
// a collar's slices, from inside the shoulders to its rim: round the neck's own (human-body.js; nk: how thick the neck is). Its foot turns in to the
// neck, as a collar does along the seam it hangs from: one that stood straight down into the shoulders came out of the back again a hand lower
const collarRows = nk => [[1.47, .0637 * nk - .004, .0573, -.018], [1.498, .0607 * nk + .003, .0627, -.018], [1.52, .0595 * nk + .012, .071, -.018], [1.556, .0565 * nk + .0102, .0662, -.02], [1.592, .054 * nk + .01, .063, -.0215]];
const RIM = [[0, -1, -.2326], -1.5686, .003];   // a collar stands higher at the back of the neck than at the throat
// a turn of a scarf: a band of cloth in a ring round the neck (n: which way the ring faces; t, h: half as thick and half as tall as it lies; as wide
// as the neck, which is narrower than it is deep in a slight person), with creases that run along it
const turnOf = (c, n, R, t, h, nk, seed) => {
  const l = Math.hypot(...n), nx = n[0] / l, ny = n[1] / l, nz = n[2] / l, sx = (.0565 * nk + .006) / .0635;
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2], u = px * nx + py * ny + pz * nz, q = Math.hypot((px - u * nx) / sx, py - u * ny, pz - u * nz) - R;
    return (Math.hypot(q / t, u / h) - 1 - .11 * sin(3 * Math.atan2(u / h, q / t) + seed + 5 * lumps(x * 14, y * 14 + seed, z * 14))) * t;
  };
};
/**
 * What is worn round the neck: a collar, the tabs on it, a scarf wound inside it. A piece of its own, sculpted twice as finely as the trunk
 * it stands on: a collar's rim, the notch at its throat and a scarf's turns are smaller than the trunk's grid, and came out ragged in it.
 * It goes down into the shoulders and moves with them (the trunk's bones), so the line where the two meet stays closed however the back bends.
 */
function collar(a) {
  const { build: b, top } = a, nk = b.neck ?? 1, S = [], torso = torsoOf(b, top.kind), neck = neckRows(nk), low = top.collar === false;
  // a scarf: wound twice round the neck, the turns crossing at the throat. Inside a collar it stands a finger over the rim, sloping as the rim
  // does, and comes out of it within the rim's own thickness (lapped over the collar's outside, the line between the two wandered); without
  // one it lies on the shoulders
  const y = low ? 1.54 : 1.5685, R = low ? .066 : .056, t = low ? .0125 : .0075, h = low ? .017 : .018, tip = low ? .1 : .2326;
  const turns = a.scarf ? [turnOf([0, y, -.018], [.1, 1, tip], R, t, h, nk, 1.3), turnOf([0, y + .005, -.018], [-.09, 1, tip - .05], R - .002, t, h * .9, nk, 4.1)] : [];
  if (!low) {
    const col = new Loft(collarRows(nk)), C = { loft: col, clip: RIM, slot: top.collar ? 'trim' : 'top', part: 'torso', blend: 0 }, gap = .0035;
    // (the line between the collar and a scarf is an outline of the collar's: where the surface stops being the one and becomes the other)
    if (a.scarf) { const cd = ready([C])[0].d; S.push({ field: cd, m: (x, y, z) => cd(x, y, z) - Math.min(turns[0](x, y, z), turns[1](x, y, z)), out: .001, lo: col.lo, hi: col.hi, slot: C.slot, part: 'torso', blend: 0 }); }
    else S.push(C);
    if (top.tabs) for (const s of [1, -1]) S.push({ patch: col, at: [s * .5, 1.532], size: [.038, .02], round: .004, out: .002, slot: 'tab', part: 'torso' });
    S.push({ loft: neck.map(([y, w, d, c]) => [y, w + gap, d + gap, c]), cut: true, blend: .002 });   // room for the neck
    // open at the throat: a notch in the rim where its two ends meet, and the line of the join below it (closed up to the rim over a scarf)
    const vy = a.scarf ? 1.6 : 1.541;
    S.push({ field: (x, y, z) => Math.max(y < vy ? abs(x) - .0022 - col.d(x, y, z) : abs(x) - .0012 - .42 * (y - vy), .03 - z), lo: [-.02, 1.47, .03], hi: [.02, 1.6, .1], cut: true, blend: .0015 });
  }
  for (const f of turns) S.push({ field: f, lo: [-.1, 1.5, -.12], hi: [.1, 1.63, .08], slot: 'scarf', part: 'torso', lumpy: [.011, .001], blend: .003 });
  S.push({ field: (x, y, z) => torso.d(x, y, z) + .008, lo: [-.13, 1.43, -.14], hi: [.13, 1.57, .12], cut: true, blend: .002 });   // (no deeper into the shoulders than it needs to be)
  // what stands by it and shades it: the shoulders, the neck, the head
  S.push({ loft: torso, ghost: true }, { loft: neck, ghost: true }, { ball: [.0755, .09, .1], at: Hd(0, .026, -.006), ghost: true });
  return S;
}

// ---- hands: every finger in three joints, the thumb in two
export const FINGERS = ['index', 'middle', 'ring', 'little'];
/**
 * Where a left hand's joints are, hanging straight down: { index, middle, ring, little: [knuckle, joint, joint, tip],
 * thumb: [root, joint, tip] } (each [x, y, z]), bend: how far each finger joint is sculpted bent already
 * (radians: knuckle, then the two joints), and the way the thumb closes (turn: an axis). a: { limbs, grip }.
 */
export function handPlan(a) {
  const [wx, wy, wz] = AT.handL, k = a.limbs * .97 + .03, grip = a.grip ? 1 : 0, P = { k, grip, bend: [.18 + grip * .75, .32 + grip * .75, .42 + grip * .55] };
  const fz = [.03, .0105, -.009, -.0275], fl = [.95, 1.02, .95, .77], fy = [-.1, -.104, -.101, -.094], L = [.04, .026, .021];
  FINGERS.forEach((name, i) => {
    let px = wx - .003, py = wy + fy[i] * k, an = P.bend[0]; const pz = wz + .003 + fz[i] * k, J = [[px, py, pz]];
    for (let j = 0; j < 3; j++) { const l = L[j] * fl[i] * k; px -= sin(an) * l; py -= cos(an) * l; J.push([px, py, pz]); if (j < 2) an += P.bend[j + 1]; }
    P[name] = J;
  });
  // the thumb: out from the heel of the hand, forward and across the palm
  const t0 = [wx - .008, wy - .036 * k, wz + .034 * k], dx = -.3 - grip * .5, dy = -.72, dz = .62 - grip * .3, l = Math.hypot(dx, dy, dz), m = [t0[0] + dx / l * .036 * k, t0[1] + dy / l * .036 * k, t0[2] + dz / l * .036 * k], e = [m[0] + (dx - .25) / l * .03 * k, m[1] + (dy - .1) / l * .03 * k, m[2] + (dz - .3) / l * .03 * k];
  P.thumb = [t0, m, e];
  // it closes over the fingers: turned from the way it points towards a line across the palm
  const c = [-.78, -.6, -.18], ax = [dy * c[2] - dz * c[1], dz * c[0] - dx * c[2], dx * c[1] - dy * c[0]], al = Math.hypot(...ax); P.turn = ax.map(v => v / al);
  return P;
}
/** The finger bones of a left hand: [[name, parent, [x, y, z]]...], hanging straight down as AT is (index1L at the knuckle .. index3L, thumb1L, thumb2L). */
export function fingerBones(a) { const P = handPlan(a), out = []; for (const f of [...FINGERS, 'thumb']) for (let j = 0; j < P[f].length - 1; j++) out.push([f + (j + 1) + 'L', j ? f + j + 'L' : 'handL', P[f][j]]); return out; }
/** The left hand, fingers a little curled (grip: closed round a rifle's stock). */
function hand(a) {
  const S = [], [wx, wy, wz] = AT.handL, P = handPlan(a), k = P.k, sl = a.gloves ? 'glove' : 'skin';
  S.push({ taper: [[wx, wy + .03, wz], [wx, wy - .012, wz]], r: [.027 * k, .029 * k], slot: sl, blend: 0 });
  S.push({ box: [.027 * k, .092 * k, .08 * k], round: .0115, at: [wx - .002, wy - .058 * k, wz + .003], rot: [0, 0, -.06], slot: sl, blend: .012 });
  S.push({ ball: [.013, .03, .022], at: [wx - .012, wy - .045 * k, wz + .03], slot: sl, blend: .012 });   // the ball of the thumb
  const R = [.0092, .0082, .0074, .0066];
  for (const f of FINGERS) {
    const J = P[f];
    S.push({ ball: .0102 * k, at: [J[0][0] + .0035, J[0][1] + .004, J[0][2]], slot: sl, blend: .008 });   // knuckle
    for (let j = 0; j < 3; j++) S.push({ taper: [J[j], J[j + 1]], r: [R[j] * k, R[j + 1] * k], slot: sl, blend: .0035, fin: f, seg: j });
  }
  S.push({ taper: [P.thumb[0], P.thumb[1]], r: [.0118 * k, .0098 * k], slot: sl, blend: .008, fin: 'thumb', seg: 0 }, { taper: [P.thumb[1], P.thumb[2]], r: [.0098 * k, .0082 * k], slot: sl, blend: .004, fin: 'thumb', seg: 1 });
  S.push({ taper: [[wx, wy + .2, wz], [wx, wy + .012, wz]], r: [.045, .037], ghost: true });   // the cuff over the wrist
  return S;
}
// a hand's bones: each length of a finger on its own bone, shared half and half with the next one at the joint between them
function handBones(a) {
  const P = handPlan(a), H = .0065;
  return (x, y, z, s) => {
    const J = s && s.fin ? P[s.fin] : null; if (!J) return [['handL', 1]];
    const j = s.seg, A = J[j], B = J[j + 1], dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.hypot(dx, dy, dz), t = ((x - A[0]) * dx + (y - A[1]) * dy + (z - A[2]) * dz) / len;
    const last = j === J.length - 2, prev = 1 - ss(-H, H, t), next = last ? 0 : ss(len - H, len + H, t), name = q => q < 0 ? 'handL' : s.fin + (q + 1) + 'L';
    return [[name(j - 1), prev], [name(j), Math.max(0, 1 - prev - next)], [name(j + 1), next]];
  };
}

// the head's bones: the foot of the neck stays in the collar, the neck bends, and the head (the jaw and all above a line
// from under the chin up to the nape) sits on top of it. The skin round the foot of the neck (under a round-necked top) goes
// with the trunk, as the cloth beside it does (trunkBones): less with the neck the further out from it, and a little with each collar bone.
function headBones(x, y, z) {
  const low = ss(1.56, 1.53, y), n = ss(1.5, 1.565, y) * (1 - low * ss(.066, .088, Math.hypot(x, z + .018))), top = 1.625 - .7 * Math.max(0, z + .01), h = ss(top - .055, top, y), c = low * ss(.05, .17, abs(x));
  return [['spine', (1 - n) * (1 - c)], [x >= 0 ? 'collarL' : 'collarR', (1 - n) * c], ['neck', n * (1 - h)], ['head', n * h]];
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
// the room in a hat for the head: the skull's own round (human-head.js) and a little more, for hair cropped close
const HOLLOW = { ball: [.079, .0935, .1035], at: Hd(0, .026, -.006), cut: true, blend: .003 };
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
    const y = HC[1], z = HC[2], crown = new Loft([[y + .042, .083, .1065, z - .0065], [y + .08, .084, .1075, z - .0065], [y + .1, .095, .119, z - .0045], [y + .122, .106, .131, z + .0015, 0, 2.5], [y + .136, .104, .129, z + .0015, 0, 2.5], [y + .142, .09, .113, z + .0015]]);
    const S = [{ loft: crown, slot: 'hat', lumpy: [.05, .002], blend: 0 }, { band: crown, y: [y + .043, y + .08], out: .0025, slot: 'hatband', edge: .002 }, { band: crown, y: [y + .046, y + .052], out: .0052, th: [-.95, .95], slot: 'badge', edge: .001 },
      { ball: [.078, .0055, .05], at: Hd(0, .047, .106), rot: [.5, 0, 0], clip: [[0, 0, 1], z + .08, .003], slot: 'visor', blend: .003 }, { ball: [.01, .013, .0045], at: Hd(0, .096, .114), slot: 'badge', blend: .001 }];
    S.push(HOLLOW);
    return { S, ghost: [{ ball: [.078, .0055, .05], at: Hd(0, .047, .106), rot: [.5, 0, 0] }, { loft: crown }] };
  },
  // a beret: pulled down to one side over a leather band
  beret(o) {
    const nb = [0, .995, .0998], ob = nb[1] * (HC[1] + .058) + nb[2] * (HC[2] - .006);   // the band: a ring round the skull, a little higher at the back
    const S = [{ ball: [.108, .034, .112], at: Hd(.016, .094, -.004), rot: [.06, 0, -.2], slot: 'hat', lumpy: [.05, .003], blend: 0 }, { ball: [.085, .05, .105], at: Hd(0, .072, -.006), slot: 'hat', blend: .03 },
      { ball: [.0865, .1005, .1105], at: Hd(0, .026, -.006), clip: [[nb, ob - .008, .002], [[0, -nb[1], -nb[2]], -(ob + .008), .002]], slot: 'strap', blend: .003 }, { ball: [.009, .011, .004], at: Hd(.03, .083, .095), slot: 'badge', blend: .001 }];
    S.push(HOLLOW);
    return { S, ghost: [{ ball: [.108, .034, .112], at: Hd(.016, .094, -.004), rot: [.06, 0, -.2] }] };
  },
  // a knitted cap
  wool(o) {
    // (pulled down over the skull, lower behind than on the brow, its edge turned up in a cuff)
    const n = [0, .98, -.2], off = (HC[1] + .03) * .98 + .014 * .2, cap = { ball: [.0845, .1035, .109], at: Hd(0, .029, -.006), clip: [n, off, .004] };
    const S = [{ ...cap, slot: 'hat', lumpy: [.012, .002], blend: 0 }, { ball: [.088, .107, .1125], at: Hd(0, .029, -.006), clip: [[n, off, .003], [[0, -.98, .2], -(off + .026), .003]], slot: 'hat', lumpy: [.012, .0015], blend: .002 }];
    S.push(HOLLOW);
    return { S, ghost: [cap] };
  },
  // a hood of loose cloth, open at the face, gathered at the neck
  hood(o) {
    const S = [{ ball: [.094, .112, .118], at: Hd(0, .016, -.013), slot: 'hat', lumpy: [.04, .005], blend: 0 }, { ball: [.085, .06, .08], at: Hd(0, -.1, -.03), slot: 'hat', lumpy: [.03, .005], blend: .04 },
      { torus: [.07, .02], at: Hd(0, -.118, -.01), rot: [-.12, 0, 0], slot: 'hat', lumpy: [.02, .004], blend: .02 }];
    S.push({ ball: [.068, .094, .075], at: Hd(0, -.012, .062), cut: true, blend: .014 }, { ball: [.081, .1, .105], at: Hd(0, .02, -.006), cut: true, blend: .004 }, { taper: [Hd(0, -.07, -.02), Hd(0, -.2, -.03)], r: .063, cut: true, blend: .004 });
    return { S, ghost: [{ ball: [.094, .112, .118], at: Hd(0, .016, -.013), shell: .012, clip: [[0, .3, -1], -(HC[2] + .03) + HC[1] * .3, .01] }] };
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
    const s = m.shapes[m.own[i]] || m.shapes[0], r = m.shapes[m.ride[i]] || s, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    slot[i] = idOf(slots, s.slot || 'skin');   // (its colour is its own shape's; its bones are those of the shape it goes with: the other side of a seam, for a point split along one)
    const w = bones(x, y, z, r.src).filter(q => q[1] > .002).sort((a, b) => b[1] - a[1]).slice(0, 4), sum = w.reduce((a, q) => a + q[1], 0) || 1;
    w.forEach(([b, v], k) => { SI[i * 4 + k] = idOf(names, r.mirror && x < 0 && r.src.bone ? other(b) : b); SW[i * 4 + k] = v / sum; });
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
  add('trunk', { build: sp.build, top: { kind: top.kind, pockets: top.pockets | 0, buttons: bit(top.buttons), collar: top.collar !== false, straps: bit(top.straps), strapColour: bit(top.strapColour) },
    legs: { kind: sp.legs.kind }, feet: { kind: sp.feet.kind }, belt: bit(sp.belt), web: web ? { y: bit(web.y), cross: bit(web.cross), pouches: web.pouches | 0, kind: web.kind || '' } : 0,
    extras: { bag: bit(ex.bag), canteen: bit(ex.canteen), holster: ex.holster === 'left' ? 'left' : bit(ex.holster) } });
  // the arms: one sculpted and turned over for the other, unless the left wears an armband (side: which it is for)
  const armA = band => ({ build: sp.build, top: { kind: top.kind, sleeves: top.sleeves, cuffs: bit(top.cuffs), band } });
  add('arm', armA(bit(top.band)), { side: top.band ? 'L' : 'LR' }); if (top.band) add('arm', armA(0), { side: 'R' });
  add('hand', { limbs: sp.build.limbs, grip: bit(sp.hands === 'grip'), gloves: bit(sp.gloves) });
  const hatA = hat && HATS.has(hat.kind) ? { kind: hat.kind, ridge: bit(hat.ridge !== false), strap: bit(hat.strap !== false) } : null;
  add('head', { face: sp.face, neck: sp.build.neck, hair: sp.hair ? sp.hairStyle : 'bald', moustache: bit(sp.moustache), hat: hatA, foot: top.collar === false ? sp.build.shoulders : 0 });
  if (hatA) add('hat', hatA);
  if (sp.pack && PACKS.has(sp.pack.kind)) add('pack', { kind: sp.pack.kind });
  for (const g of sp.gear) add('gear', { shapes: g.shapes, cell: g.cell || .004, keep: g.keep || [.3, .06, .012], err: g.err || null, blend: g.blend ?? .004 }, { g, local: !plain(g.shapes) });
  // what is worn round the neck: a collar (every top but a round-necked one has one), a scarf
  if (top.collar !== false || ex.scarf) add('collar', { build: sp.build, top: { kind: top.kind, collar: top.collar === false ? false : bit(top.collar), tabs: bit(top.tabs) }, scarf: bit(ex.scarf) });
  return J;
}
const whole = () => [['$', 1]];
// the maker of a hat or pack by its kind: one from the list (and a function, checked before anything calls it), or null
function listed(list, kind) { const f = list.get(kind); if (typeof f === 'function') return f; return null; }
/** Sculpts one piece (a job from jobsFor). The slow part: a tenth of a second for a hand, a second or two for a trunk on a phone. */
export function sculpt({ kind, a }) {
  if (kind === 'trunk') { const S = trunk(a), p = finish(S, { cell: .006, bones: trunkBones(a), extra: S.extra }); p.hang = S.hang; return p; }
  if (kind === 'arm') return finish(arm(a), { cell: .006, bones: armBones });
  if (kind === 'collar') return finish(collar(a), { cell: .003, bones: trunkBones(a), keep: [.15, .04, .01], err: [.001, .004, .02], blend: .004 });
  if (kind === 'hand') return finish(hand(a), { cell: .0032, bones: handBones(a), keep: [.2, .035, .006], err: [.0006, .004, .02], blend: .004 });
  if (kind === 'head') {
    const eye = { P: [], N: [], K: [], I: [], ao: .78 };
    for (const s of [1, -1]) { const e = eyeball(Hd(s * EYE[0], EYE[1], EYE[2]), .0122), base = eye.P.length / 3; eye.P.push(...e.P); eye.N.push(...e.N); eye.K.push(...e.K.map(k => 'eye' + k)); eye.I.push(...e.I.map(i => i + base)); }
    const hat = a.hat && listed(HATS, a.hat.kind);   // the hat stands over the face: a brim's shadow on the brow
    return finish(headOf(a, (hat && hat(a.hat).ghost) || []), { cell: .002, bones: headBones, keep: [.16, .023, .0036], err: [.0004, .004, .02], reach: .07, blend: .01, extra: eye });
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
export const VERSION = cyrb(stamp() + [trunk, trunkBones, collar, collarRows, turnOf, RIM, BODY_STAMP, arm, armBones, handPlan, hand, handBones, HEAD_STAMP, headBones, eyeball, stud, finish, sculpt, HOLLOW, ...HATS.values(), ...PACKS.values()].map(v => typeof v === 'function' ? String(v) : JSON.stringify(v)).join(''));
