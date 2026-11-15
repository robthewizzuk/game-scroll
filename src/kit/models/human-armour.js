// Armour for gs.models.human, sculpted in code like the rest of a person (no model files): plate, mail-free leather and
// a brigandine's riveted cloth, in pieces that each ride one bone of the person, rigid as the real thing is, laid over
// the clothes with a finger's gap. Each piece is sculpted on its own (a job of human-shapes.js jobsFor, kind 'armour'),
// shared between people of the same build and saved like the rest, and gets a bone of its own in the person, so a game
// can take a piece off or put another on at once (person.armour.wear), with nothing sculpted or built while it plays.
// In person space as the rest is: 1.8 m, feet at y = 0, facing +z, the left side at +x, the arms held a little out
// (human-shapes.js ARM). The left of a pair is made and the right is the same flipped. Kit use only; runs in workers.
//
// How the real pieces go (a 15th-century harness, our own cut): a breastplate rounded out over the chest with a ridge
// down its middle, a back plate under it, the two ending at the waist in a fauld of three overlapping strips that flare
// over the hips, tassets hanging from it over the thighs; pauldrons of curved strips over each shoulder; a tube on the
// upper arm, a cop over the elbow with a fan on its outside, a tube down the forearm; gauntlets with flared cuffs and
// a plate over the back of the hand; cuisses over the front of the thighs, a cop on each knee with a wing, greaves
// round the shins shaped to the calf, sabatons of strips over the feet. Leather is thicker, its edges rounded and
// stitched, with straps and a few rivets; a brigandine is cloth over small plates, rows of rivet heads showing.
import { Loft } from './field.js';
import { torsoOf, sleeveRows, legRows, hoseRows, lowRows, over, FOOT } from './human-body.js';

const PI = Math.PI, sin = Math.sin, cos = Math.cos;
// the arm's own space (human-shapes.js armSpace with no shift: the person moves a piece on an arm in or out with its shoulders)
const ARM = .27, ARMAT = [.188, 1.44, -.012], AS = { at: ARMAT, rot: [0, 0, ARM] };
// small hard domes laid on a surface (rivet heads, buckles' pins): made as they are, crisp at any size (human-shapes.js stud)
function stud(out, c, n, r, h, slot) {
  const [nx, ny, nz] = n, ax = Math.abs(ny) > .9 ? [1, 0, 0] : [0, 1, 0], base = out.P.length / 3, M = 8;
  let ux = ax[1] * nz - ax[2] * ny, uy = ax[2] * nx - ax[0] * nz, uz = ax[0] * ny - ax[1] * nx; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  for (const [rr, hh, nt] of [[1, -1, 1], [1, .35, .8], [.7, .85, .4]]) for (let i = 0; i < M; i++) {
    const a = i / M * PI * 2, dx = ux * cos(a) + vx * sin(a), dy = uy * cos(a) + vy * sin(a), dz = uz * cos(a) + vz * sin(a);
    out.P.push(c[0] + dx * r * rr + nx * h * hh, c[1] + dy * r * rr + ny * h * hh, c[2] + dz * r * rr + nz * h * hh);
    const ex = dx * nt + nx * (1 - nt), ey = dy * nt + ny * (1 - nt), ez = dz * nt + nz * (1 - nt), el = Math.hypot(ex, ey, ez); out.N.push(ex / el, ey / el, ez / el); out.K.push(slot); out.src.push({});
  }
  out.P.push(c[0] + nx * h, c[1] + ny * h, c[2] + nz * h); out.N.push(nx, ny, nz); out.K.push(slot); out.src.push({});
  for (let q = 0; q < 2; q++) for (let i = 0; i < M; i++) { const a = base + q * M + i, b = base + q * M + (i + 1) % M, d = a + M, e = b + M; out.I.push(a, b, e, a, e, d); }
  for (let i = 0; i < M; i++) out.I.push(base + 2 * M + i, base + 2 * M + (i + 1) % M, base + 3 * M);
}
const studs = () => ({ P: [], N: [], K: [], I: [], src: [], ao: .9 });
// a point on a loft's wall (and which way it faces there, roughly: out from the loft's middle), in the arm's space turned back to the person's
const turnArm = (p, flipX = 1) => { const x = p[0] - ARMAT[0], y = p[1] - ARMAT[1], c = cos(ARM), s = sin(ARM); return [(ARMAT[0] + c * x - s * y) * flipX, ARMAT[1] + s * x + c * y, p[2]]; };
const outOf = (L, th, y) => { const s = L.sec(y), n = [sin(th) / s[0], 0, cos(th) / (cos(th) < 0 ? s[6] : s[1])], l = Math.hypot(...n); return n.map(v => v / l); };
// rows grown out from a loft's own, as a plate stands over what is under it (gaps: [y, how far out] pairs, eased between)
const shellRows = (L, ys) => ys.map(([y, out, at]) => over(L, y, out, at ?? y));
// the build's own measures for each piece, so a big man's breastplate is a big man's
const torsoFor = a => torsoOf(a.build, a.top || 'shirt');
const armLoft = (a, e) => new Loft(sleeveRows(a.build.limbs, e, a.build.muscle));
const legLoft = (a, e) => { const R = legRows(a.build, a.legs === 'breeches' ? 1.16 : 1, lowRows(a.build, a.feet || 'boots')); return new Loft((a.legs === 'hose' ? hoseRows(R) : R).map(r => { r = r.slice(); r[1] += e; r[2] += e; r[6] += e; return r; })); };
// a loft's slice grown by different amounts across, in front and behind (a breastplate rounds out in front more than at the sides)
const grow = (L, y, w, f, b) => { const s = L.sec(y); return [y, s[0] + w, s[1] + f, s[2], s[3], 2 + 2 * s[4], s[6] + b, 2 + 2 * s[7]]; };
// a strip (a lame): a band round a loft between two heights, standing `out` proud, `th` only part of the way round; its lower edge
// rolled a little further out, as each strip laps over the one under it
const lame = (L, y0, y1, out, slot, more = {}) => ({ band: L, y: [y0, y1], out, edge: .003, slot, blend: .002, ...more });

// ---- the pieces: (a) => shapes, a = { build, top, feet, side ('L' | 'R'), kind } (shapes for the left side; the right is flipped)
const PIECES = {
  // the breastplate and back plate, from the waist to the neck, open round the arms and the neck
  cuirass(a) {
    const T = torsoFor(a), leather = a.kind === 'leather', brig = a.kind === 'brigandine', g = leather ? .014 : .018;
    // over the chest the plate stands clear and bridges the hollows (rounded out: no cleavage, no dip at the waist)
    // (plate: rounded well out over the chest and in to the waist, as a globe; leather and cloth lie closer)
    const f = leather || brig ? .45 : 1, C = new Loft([grow(T, 1.03, g - .004, g + .004 + .008 * f, g), grow(T, 1.075, g - .002, g + .01 + .016 * f, g), grow(T, 1.13, g, g + .012 + .026 * f, g), grow(T, 1.2, g, g + .01 + .03 * f, g),
      grow(T, 1.28, g, g + .006 + .026 * f, g), grow(T, 1.35, g - .002, g + .004 + .014 * f, g), ...shellRows(T, [[1.41, g - .003], [1.44, g - .004], [1.4605, g - .006], [1.4752, g - .007], [1.4959, g - .008]])]);
    const slot = leather ? 'hide' : brig ? 'padding' : 'plate', th = leather ? .009 : brig ? .008 : .006;
    const S = [{ loft: C, shell: th, clip: [[[0, 1, 0], 1.025, .002], [[0, -1, 0], -1.49, .004]], slot, blend: 0 }];
    // open round the neck and the arms (the arm held out: the opening a cone round it from the shoulder down)
    S.push({ ball: [.093, .07, .085], at: [0, 1.51, -.012], cut: true, blend: .006 });
    const dn = [sin(ARM), -cos(ARM), 0];
    S.push({ taper: [[.2, 1.5, -.012], [.2 + dn[0] * .2, 1.5 + dn[1] * .2, -.012]], r: [.088, .052], mirror: true, cut: true, blend: .012 });
    const X = studs();
    if (!leather && !brig) {
      // the ridge down its middle, faint at the waist, and a rolled edge round the neck and the arms
      S.push({ taper: [C.at(0, 1.07, -.002), C.at(0, 1.42, -.002)], r: [.004, .0055], clip: [[0, 0, 1], .02, .004], slot, blend: .012 });
      S.push({ torus: [.094, .0048], at: [0, 1.488, -.004], rot: [-.22, 0, 0], clip: [[0, 0, 1], -.03, .004], slot, blend: .004 });
    } else if (leather) {
      // boiled leather: rounded edges, stitched round, buckled at the sides
      S.push(lame(C, 1.025, 1.045, .0025, 'hide', { stitch: true }));
      for (const y of [1.12, 1.24]) { const p = C.at(PI / 2, y, .003); S.push({ box: [.012, .026, .07], round: .003, at: p, slot: 'strap', mirror: true, blend: .002 }); stud(X, [p[0] + .007, p[1], p[2] + .02], [1, 0, 0], .006, .003, 'rivet'); }
    } else {
      // a brigandine: cloth over small plates, the heads of their rivets in rows, and a strip of plate down the front
      for (let r = 0; r < 6; r++) for (let k = -5; k <= 5; k++) {
        const y = 1.08 + r * .06, t = k * .2 + (r % 2) * .1; if (Math.abs(t) > 1.05) continue;
        const p = C.at(t, y, .001); stud(X, p, outOf(C, t, y), .0042, .0026, 'rivet');
        const pb = C.at(PI + t * .9, y, .001); stud(X, pb, outOf(C, PI + t * .9, y), .0042, .0026, 'rivet');
      }
    }
    S.extra = X.P.length ? X : null;
    return S;
  },
  // the fauld: strips at the waist that flare over the hips (on the hips, so it goes with them as he bends)
  fauld(a) {
    const T = torsoFor(a), leather = a.kind === 'leather', slot = leather ? 'hide' : a.kind === 'brigandine' ? 'padding' : 'plate', g = .028;
    const F = new Loft([over(T, .88, g + .045, .88), over(T, .94, g + .03), over(T, 1.0, g + .014), over(T, 1.05, g + .006)]), S = [];
    const n = leather ? 2 : 4, h = leather ? .05 : .038;
    for (let i = 0; i < n; i++) { const y1 = 1.05 - i * (h - .007), y0 = y1 - h; S.push(lame(F, y0, y1, .002 + i * .003, slot, { shell: .006, blend: 0, stitch: leather })); }
    // (open at the sides behind the hips, so a leg can come up)
    return S;
  },
  // a tasset: a plate over the front of the thigh, hanging from the fauld (on the thigh's bone, so it goes with the leg)
  tasset(a) {
    const L = legLoft(a, .03), slot = a.kind === 'leather' ? 'hide' : 'plate', S = [];
    for (let i = 0; i < 3; i++) { const y1 = .92 - i * .05, y0 = y1 - .058; S.push(lame(L, y0, y1, .012 + i * .003, slot, { th: [-.75, 1.0], shell: .006, blend: 0 })); }
    return S;
  },
  // a pauldron: curved strips over the shoulder, the top one domed over the joint, each lower one lapping out over the next
  pauldron(a) {
    const leather = a.kind === 'leather', slot = leather ? 'hide' : 'plate', LM = a.build.limbs, d = 1 + .12 * ((a.build.muscle ?? .45) - .45), S = [];
    // (the top plate a dome over the joint that reaches in over the top of the shoulder, front and back)
    const cap = [.088 * LM * d, .074, .094 * LM * d], c = [.178, 1.425, -.012];
    S.push({ ball: cap, at: c, space: AS, shell: leather ? .008 : .006, clip: [[[0, 1, 0], 1.37, .004], [[1, 0, 0], .1, .01]], slot, blend: 0 });
    const L = armLoft(a, .026), n = leather ? 1 : 4;
    for (let i = 0; i < n; i++) { const y1 = 1.385 - i * .032, y0 = y1 - .04; S.push(lame(L, y0, y1, .008 + i * .003, slot, { th: [-1.2, 3.2], space: AS, shell: .006, blend: 0, stitch: leather })); }
    if (!leather) S.push({ ball: [.035, .035, .006], at: [.176, 1.27, .095], rot: [-.3, .3, 0], slot, blend: .004 });   // (a round plate over the front of the armpit)
    return S;
  },
  // the upper arm's tube (on the upper arm)
  rerebrace(a) { const L = armLoft(a, .016), slot = a.kind === 'leather' ? 'hide' : 'plate'; return [lame(L, 1.2, 1.29, .002, slot, { space: AS, shell: .006, blend: 0 })]; },
  // the elbow's cop and the fan on its outside (on the joint in between, which takes half the elbow's turn)
  couter(a) {
    const LM = a.build.limbs, slot = 'plate';
    return [{ ball: [.054 * LM, .06, .052 * LM], at: [.2, 1.165, -.022], space: AS, shell: .006, clip: [[[0, 0, -1], -.004, .006]], slot, blend: 0 },
      { ball: [.012, .05, .045], at: [.255, 1.168, -.02], rot: [0, 0, .1], space: AS, slot, blend: .006 }, { ball: .012, at: [.2, 1.16, -.07], space: AS, slot, blend: .008 }];
  },
  // the forearm's tube, out over the wrist (on the forearm); leather: a laced bracer
  vambrace(a) {
    const leather = a.kind === 'leather', L = armLoft(a, leather ? .009 : .014), slot = leather ? 'hide' : 'plate';
    const S = [lame(L, leather ? .94 : .93, leather ? 1.08 : 1.12, .002, slot, { space: AS, shell: leather ? .007 : .006, blend: 0 })];
    if (leather) for (const y of [.97, 1.0, 1.03, 1.06]) S.push({ box: [.006, .004, .03], round: .002, at: [.2, y, .047], space: AS, slot: 'strap', blend: .001 });
    return S;
  },
  // a gauntlet's flared cuff over the wrist (on the forearm) ...
  cuff(a) {
    const L = new Loft([[.86, .052, .056, -.004, .2], [.9, .046, .05, -.004, .2], [.94, .041, .045, -.001, .2]]), slot = a.kind === 'leather' ? 'hide' : 'plate';
    return [{ loft: L, shell: .006, clip: [[[0, 1, 0], .865, .002], [[0, -1, 0], -.938, .002]], space: AS, slot, blend: 0 }];
  },
  // ... and the plates over the back of the hand (on the hand)
  backhand(a) {
    const LM = a.build.limbs, slot = 'plate';
    return [{ ball: [.042 * LM, .048, .032], at: [.208, .835, -.004], space: AS, shell: .005, clip: [[[1, 0, 0], .205, .006]], slot, blend: 0 },
      { ball: [.04 * LM, .022, .03], at: [.212, .79, 0], space: AS, shell: .005, clip: [[[1, 0, 0], .208, .006]], slot, blend: 0 }];
  },
  // a cuisse: plate over the front and outside of the thigh (on the thigh)
  cuisse(a) { const L = legLoft(a, .012), slot = a.kind === 'leather' ? 'hide' : 'plate'; return [lame(L, .6, .86, .003, slot, { th: [-1.0, 1.9], shell: .006, blend: 0 })]; },
  // the knee's cop and its wing on the outside (on the joint in between)
  poleyn(a) {
    const LM = a.build.limbs, slot = 'plate';
    return [{ ball: [.068 * LM, .072, .05], at: [.098, .535, .045], shell: .006, clip: [[[0, 0, 1], .045, .006]], slot, blend: 0 },
      { ball: [.055, .05, .012], at: [.15, .535, .03], rot: [0, -1.1, 0], slot, blend: .006 }];
  },
  // a greave: round the shin and shaped to the calf (on the shin); leather: a guard over the front, strapped behind
  greave(a) {
    // (shaped to the calf, narrow at the ankle: a shin's own measures, or what it wears there if that is bigger)
    const leather = a.kind === 'leather', LM = a.build.limbs, under = legLoft(a, 0), e = leather ? .007 : .009, slot = leather ? 'hide' : 'plate';
    const own = [[.1, .044, .05, -.06, -.006], [.2, .046, .049, -.074, -.012], [.3, .058, .053, -.09, -.016], [.38, .062, .057, -.092, -.016], [.47, .066, .066, -.088, -.01], [.52, .072, .076, -.088, -.006]];
    const L = new Loft(own.map(([y, w, zf, zb, zc]) => { const u = under.sec(y), c = Math.max(zc, u[2] - .004); return [y, Math.max(w * LM, u[0]) + e, Math.max(zf * LM + zc, u[2] + u[1]) - c + e, c, .098, 2.1, c - Math.min(zb * LM + zc, u[2] - u[6]) + e, 2.1]; }));
    const S = [lame(L, .12, .49, .002, slot, { th: leather ? [-1.3, 1.3] : undefined, shell: leather ? .008 : .006, blend: 0 })];
    if (leather) for (const y of [.24, .4]) S.push(lame(L, y, y + .022, .004, 'strap', { th: [1.2, 5.1], blend: .002 }));
    return S;
  },
  // a sabaton: strips over the top of the foot (on the foot)
  sabaton(a) {
    const S = [], grown = (f, by) => f.ball ? { ...f, ball: f.ball.map(r => r + by) } : { ...f, r: f.r.map(r => r + by) };
    for (let i = 0; i < 3; i++) S.push({ ...grown(FOOT[1], .01 + i * .0025), clip: [[[0, 1, 0], .03, .004], [[0, 0, 1], -.015 + i * .028, .002], [[0, 0, -1], .015 - (i + 1) * .028 - .004, .002]], shell: .005, slot: 'plate', blend: 0 });
    return S;
  },
  // ... and its cap over the toes, drawn out to a blunt point (on the toes)
  toecap(a) {
    const grown = (f, by) => ({ ...f, ball: f.ball.map(r => r + by) });
    return [{ ...grown(FOOT[2], .012), clip: [[[0, 1, 0], .026, .004], [[0, 0, 1], .075, .002]], shell: .005, slot: 'plate', blend: 0 }, { ...grown(FOOT[3], .012), clip: [[0, 1, 0], .022, .004], shell: .005, slot: 'plate', blend: .01 },
      { taper: [[.103, .04, .16], [.104, .034, .215]], r: [.03, .006], slot: 'plate', blend: .02 }];
  },
};
// what each part of the body wears, by kind: [the piece, the bone it rides]
const SLOTS = {
  chest: { plate: [['cuirass', 'spine'], ['fauld', 'hips']], leather: [['cuirass', 'spine'], ['fauld', 'hips']], brigandine: [['cuirass', 'spine'], ['fauld', 'hips']] },
  shoulders: { plate: [['pauldron', 'arm']], leather: [['pauldron', 'arm']] },
  arms: { plate: [['rerebrace', 'arm'], ['couter', 'elbow'], ['vambrace', 'fore']], leather: [['vambrace', 'fore']] },
  hands: { plate: [['cuff', 'fore'], ['backhand', 'hand']], leather: [['cuff', 'fore']] },
  thighs: { plate: [['tasset', 'leg'], ['cuisse', 'leg'], ['poleyn', 'knee']], leather: [['tasset', 'leg']] },
  shins: { plate: [['greave', 'shin']], leather: [['greave', 'shin']] },
  feet: { plate: [['sabaton', 'foot'], ['toecap', 'toe']] },
};
const COLOURS = new Set(['colour', 'leather', 'cloth', 'rivets', 'hat', 'top']);
const PAIRED = new Set(['arm', 'elbow', 'fore', 'hand', 'leg', 'knee', 'shin', 'foot', 'toe']);
export const ARMOUR = { slots: Object.fromEntries(Object.entries(SLOTS).map(([k, v]) => [k, Object.keys(v)])) };
/**
 * What an outfit's armour asks for, as pieces to sculpt: [{ slot, kind, piece, bone, side, worn }]. armour: { chest: 'plate' | ['plate', 'leather'], ... }:
 * a kind, or a list of kinds to have ready (the first is worn). Throws on a slot or kind there is none of.
 */
export function armourPieces(armour) {
  const out = [];
  for (const [slot, want] of Object.entries(armour || {})) {
    if (want == null || want === false || COLOURS.has(slot)) continue;
    const S = SLOTS[slot]; if (!S) throw new Error(`gs.models.human: no armour for '${slot}' (${Object.keys(SLOTS).join(', ')})`);
    const kinds = [].concat(want);
    kinds.forEach((kind, i) => {
      const list = S[kind]; if (!list) throw new Error(`gs.models.human: no ${slot} armour called '${kind}' (${Object.keys(S).join(', ')})`);
      for (const [piece, bone] of list) for (const side of PAIRED.has(bone) ? ['L', 'R'] : ['']) out.push({ slot, kind, piece, bone: bone + side, side: side || 'L', worn: i === 0 });
    });
  }
  return out;
}
/** Sculpts a piece's shapes (human-shapes.js sculpt, kind 'armour'): the left's, or the right's flipped. */
export function armourShapes(a) {
  const make = PIECES[a.piece]; if (!make) throw new Error(`gs.models.human: no armour piece '${a.piece}'`);
  const S = make(a);
  if (a.side === 'R') {
    const F = S.map(s => s.mirror ? s : { ...s, flip: true });
    if (S.extra) { const X = S.extra, P = X.P.slice(), N = X.N.slice(); for (let i = 0; i < P.length; i += 3) { P[i] = -P[i]; N[i] = -N[i]; } const I = X.I.slice(); for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } F.extra = { ...X, P, N, I }; }
    return F;
  }
  return S;
}
export const ARMOUR_STAMP = [stud, turnArm, outOf, shellRows, torsoFor, armLoft, legLoft, grow, lame, ...Object.values(PIECES)].map(String).join('') + JSON.stringify([SLOTS, ARM, ARMAT]);
