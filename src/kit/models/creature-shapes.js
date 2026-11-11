// The shapes gs.models.creature is sculpted from, and the choosing of them from a seed: a creature is
// one piece, a list of soft shapes (field.js: slices of a body, tapered limbs, balls, flat wings and
// fins) melted into one surface, meshed, given its bones and thinned to three levels of detail by the
// people builder's own finish() (human-shapes.js).
// planOf() turns what a game asked for (a kind, an animal it is like, a seed) into a plan: plain
// numbers and words, the same for the same seed on every phone. build() turns a plan into bones,
// shapes and what the walking needs to know (which legs, how long, which wings). Every creature is
// sculpted about one unit long, whatever size it will be, so a mouse and a horse get the same care.
// Nothing in here needs three.js or the page: it runs in a background worker (creature-worker.js).
// Kit use only: games reach it as gs.models.creature.
import { ready, smin, stamp, thinReady } from './field.js';
import { finish, ss, hashOf } from './human-shapes.js';
export { thinReady };

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, mx = Math.max, mn = Math.min, hyp = Math.hypot;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = hyp(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dist = (a, b) => hyp(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flipX = p => [-p[0], p[1], p[2]];
const right = n => n && n.endsWith('L') ? n.slice(0, -1) + 'R' : n;
// the turn [x, y, z] (as field.js shapes take it) of a thing whose own x and y axes are X and Y
const eul = (X, Y) => { const Z = cross(X, Y); return abs(Z[0]) > .999999 ? [Math.atan2(Y[2], Y[1]), Math.asin(mx(-1, mn(1, Z[0]))), 0] : [Math.atan2(-Z[1], Z[2]), Math.asin(Z[0]), Math.atan2(-Y[0], X[0])]; };
// a frame: a point and its own x and y axes (z = x cross y); p(x, y, z) is a point in it, rot its turn
const fr = (o, X, Y) => { X = unit(X); const k = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; Y = unit(add(Y, X, -k)); const Z = cross(X, Y); return { o, X, Y, Z, rot: eul(X, Y), p: (x, y, z) => [o[0] + X[0] * x + Y[0] * y + Z[0] * z, o[1] + X[1] * x + Y[1] * y + Z[1] * z, o[2] + X[2] * x + Y[2] * y + Z[2] * z] }; };
// a body drawn as slices along a frame's y axis: rows [along y, half width (x), half depth (z), middle z, middle x, squareness]
const tube = (F, rows, more) => ({ loft: rows.map(r => [F.o[1] + r[0], r[1], r[2], F.o[2] + (r[3] || 0), F.o[0] + (r[4] || 0), r[5] ?? 2]), space: { at: F.o, rot: F.rot }, ...more });
// the seed's dice (mulberry32): the same numbers for the same seed everywhere
export const dice = seed => { let a = (seed >>> 0) || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

// ================================================================= what a creature is put together with
function kit() {
  const S = [], bones = [], chains = [], eye = { P: [], N: [], K: [], I: [], src: [], ao: .8 };
  const K = {
    S, bones, chains, eye,
    bone(name, parent, at) { bones.push({ name, parent, at: at.slice() }); return name; },
    // a run of bones, for weights: names[i] holds the stretch pts[i]..pts[i + 1]; par: what the first hangs from; soft: how far a joint's bend spreads
    chain(names, pts, par = null, soft = .06) { chains.push({ names, pts, par, soft, len: names.map((_, i) => dist(pts[i], pts[i + 1]) || 1e-6) }); return chains.length - 1; },
    // a shape: w is the bone it rides (a name) or the run of bones it bends with (from chain())
    add(w, slot, s) { const q = { slot, w, ...s }; S.push(q); return q; },
    // a limb: a bone at each joint, its weights and a taper for each stretch (on both sides when mirror)
    limb(names, pts, radii, par, o = {}) {
      const { slot = 'hide', soft = .05, blend = .02, mirror = true, lumpy } = o, nm = names.map(n => mirror ? n + 'L' : n);
      nm.forEach((n, i) => { K.bone(n, i ? nm[i - 1] : par, pts[i]); if (mirror) K.bone(right(n), i ? right(nm[i - 1]) : right(par), flipX(pts[i])); });
      const c = K.chain(nm, pts, par, soft);
      for (let i = 0; i < names.length; i++) K.add(c, Array.isArray(slot) ? slot[i] : slot, { taper: [pts[i], pts[i + 1]], r: [radii[i], radii[i + 1]], mirror, blend, lumpy: Array.isArray(slot) && i ? undefined : lumpy });
      return c;
    },
  };
  return K;
}
// the bones of each point: a shape on one bone follows it; a shape on a run of bones bends at the joints
// (half and half at a joint, wholly its own bone `soft` away), and joins what the run hangs from at its root
const weigh = chains => (x, y, z, src) => {
  const flip = src.mirror && x < 0, sd = n => flip ? right(n) : n, w = src.w;
  if (typeof w === 'string') return [[sd(w), 1]];
  const c = chains[w], P = c.pts, n = c.names.length; if (flip) x = -x;
  let best = 1e9, bi = 0, bu = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz || 1e-9;
    const raw = ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2, u = raw < 0 ? 0 : raw > 1 ? 1 : raw, ex = a[0] + dx * u - x, ey = a[1] + dy * u - y, ez = a[2] + dz * u - z, d2 = ex * ex + ey * ey + ez * ez;
    if (d2 < best) { best = d2; bi = i; bu = i === 0 && c.par && raw < 0 ? raw : u; }
  }
  const L = c.len[bi], s = c.soft;
  if (bu < 0) { const k = .5 + .5 * ss(0, s, -bu * L); return [[sd(c.par), k], [sd(c.names[0]), 1 - k]]; }
  const w0 = bi > 0 || c.par ? .5 * (1 - ss(0, s, bu * L)) : 0, w1 = bi < n - 1 ? .5 * (1 - ss(0, s, (1 - bu) * L)) : 0, out = [[sd(c.names[bi]), 1 - w0 - w1]];
  if (w0) out.push([sd(bi > 0 ? c.names[bi - 1] : c.par), w0]); if (w1) out.push([sd(c.names[bi + 1]), w1]);
  return out;
};
// an eye, made as it is (crisp at any cell size): pupil, iris, a dark rim and the rest, in rings round the way it looks.
// pupil: 'round' | 'slit' (a cat's, a snake's) | 'bar' (a goat's, a horse's)
function eyeball(E, c, dir, up, r, pupil = 'round', src = { w: 'head' }, n = 12) {
  const X = unit(cross(up, dir)), Y = cross(dir, X), base = E.P.length / 3, [ax, ay] = pupil === 'slit' ? [.36, 1.75] : pupil === 'bar' ? [1.8, .5] : [1, 1], P0 = 18;
  const rings = [[0, 0], [P0, 0], [P0, 1], [47, 1], [47, 2], [55, 2], [55, 3], [86, 3], [118, 3]];
  for (const [deg, k] of rings) for (let i = 0; i < n; i++) {
    const t = i / n * PI * 2, a = (deg === P0 ? deg / hyp(cos(t) / ax, sin(t) / ay) : deg) * PI / 180, x = sin(a) * cos(t), y = sin(a) * sin(t), z = cos(a);
    const d = [X[0] * x + Y[0] * y + dir[0] * z, X[1] * x + Y[1] * y + dir[1] * z, X[2] * x + Y[2] * y + dir[2] * z];
    E.P.push(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r); E.N.push(d[0], d[1], d[2]); E.K.push('eye' + k); E.src.push(src);
  }
  for (let q = 0; q < rings.length - 1; q++) { if (rings[q][0] === rings[q + 1][0]) continue; for (let i = 0; i < n; i++) { const a = base + q * n + i, b = base + q * n + (i + 1) % n, d = a + n, e = b + n; E.I.push(a, e, b, a, d, e); } }
}
// where an eye of radius r sits: from c along dir until it is sunk `sink` of its radius into these shapes
function seat(shapes, c, dir, r, sink = .6) {
  const R = ready(shapes.filter(s => !s.cut), .02), d = q => { let v = 1e9; for (const s of R) v = smin(v, s.d(q[0], q[1], q[2]), s.k); return v; };
  let q = c; for (let i = 0; i < 40; i++) { const v = d(q) + r * sink; if (abs(v) < 4e-4) break; q = add(q, dir, -v * .85); }
  return q;
}
// the eyes of a head: F the head's frame (x right, y up, z forward), list the head's own shapes, hd its size.
// n: 1 (one in the middle), 2, 3 (a third on the brow) or 4 (a smaller pair above); side: 0 looking forward .. 1 sideways
function eyesOn(K, F, list, hd, { n = 2, size = 1, side = .5, pupil = 'round', up = .25, fwd = .75, bone = 'head' } = {}) {
  const r = hd * .2 * size, src = { w: bone };
  const one = (sx, uy, fz, rr, sd) => { const dir = unit(add(add([F.X[0] * sx * (.25 + .75 * sd), F.X[1] * sx * (.25 + .75 * sd), F.X[2] * sx * (.25 + .75 * sd)], F.Z, 1 - sd * .85), F.Y, .18)); eyeball(K.eye, seat(list, F.p(sx * hd * (.42 + .38 * sd), hd * uy, hd * (fz - .4 * sd)), dir, rr), dir, F.Y, rr, pupil, src); };
  if (n === 1 || n === 3) one(0, n === 1 ? up : up + .5, fwd + .2, n === 1 ? r * 1.7 : r * .8, 0);
  if (n >= 2) { one(1, up, fwd, r, side); one(-1, up, fwd, r, side); }
  if (n >= 4) { one(1, up + .42, fwd - .12, r * .62, side * .8); one(-1, up + .42, fwd - .12, r * .62, side * .8); }
}
// horns on a head, at o in its frame: 'nubs' | 'curved' (a bull's) | 'long' (swept back) | 'antlers'
function horns(K, F, hd, kind, s, bone = 'head') {
  if (!kind || kind === 'none') return;
  const o = [hd * .4, hd * .78, -hd * .08], at = (x, y, z) => F.p(o[0] + x * s, o[1] + y * s, o[2] + z * s), H = (a, b, r) => K.add(bone, 'hard', { taper: [a, b], r, mirror: true, blend: .006 });
  if (kind === 'nubs') H(at(0, -.01, 0), at(.012, .055, 0), [.022, .012]);
  else if (kind === 'curved') { const a = at(0, -.01, 0), b = at(.085, .03, .005), c = at(.125, .1, .03), d = at(.11, .17, .06); H(a, b, [.026, .022]); H(b, c, [.022, .016]); H(c, d, [.016, .007]); }
  else if (kind === 'long') { const a = at(0, -.01, 0), b = at(.02, .1, -.06), c = at(.045, .17, -.15), d = at(.05, .2, -.25); H(a, b, [.026, .021]); H(b, c, [.021, .015]); H(c, d, [.015, .007]); }
  else if (kind === 'antlers') {
    const a = at(0, -.01, 0), b = at(.045, .1, -.05), c = at(.1, .2, -.06), d = at(.13, .3, -.01); H(a, b, [.02, .017]); H(b, c, [.017, .014]); H(c, d, [.014, .008]);
    H(b, at(.03, .16, .07), [.014, .007]); H(c, at(.1, .27, .09), [.013, .007]); H(c, at(.19, .25, -.09), [.012, .007]);
  }
}
// a tail (or a neck, a feeler): points from base, each stretch turned `curl` more than the last (a0: up from straight back)
const run = (base, n, L, a0, curl) => { const pts = [base]; for (let i = 0; i < n; i++) { const a = a0 + curl * i; pts.push(add(pts[i], [0, sin(a), -cos(a)], L / n)); } return pts; };
/**
 * A flat wing (or fin) out to the left from root: rows [share of the span, half chord, half thickness, up, forward]
 * laid along `out` (the way the span runs) with its chord along `chord`; bones named names (+ 'L' / 'R') at the
 * root and at each share in cuts; par: what it hangs from. Returns its run of bones.
 */
function wing(K, { root, span, rows, par, slot = 'wing', names = ['wing', 'wingmid', 'wingtip'], cuts = [.36, .68], out = [1, 0, 0], chord = [0, 0, 1], blend = .008, soft = .05 }) {
  const F = fr(root, chord, out), at = t => add(root, F.Y, span * t), pts = [root, ...cuts.slice(0, names.length - 1).map(at), at(1)], nm = names.map(n => n + 'L');
  nm.forEach((n, i) => { K.bone(n, i ? nm[i - 1] : par, pts[i]); K.bone(right(n), i ? right(nm[i - 1]) : right(par), flipX(pts[i])); });
  const c = K.chain(nm, pts, par, soft);
  K.add(c, slot, tube(F, rows.map(r => [r[0] * span, r[1], mx(.0085, r[2]), r[3] || 0, r[4] || 0, r[5] ?? 2]), { mirror: true, blend }));
  return { c, F, pts };
}

// ================================================================= four legs
const QUAD = { H: .62, long: 1, gw: 1, gh: 1, sq: 2.3, tuck: .35, rump: 1, arch: 0, neck: .24, neckA: .8, neckR: .075, neckB: 1.6, head: .1, headA: .3, snout: .15, snoutR: .048, cheek: 0, nose: 'ball', ear: 'point', earS: 1, eyeSide: .45, eyeS: 1, pupil: 'round', eyes: 2,
  tail: 'thin', tailL: .45, tailA: .3, tailCurl: .2, leg: 1, thigh: 1, wrist: .16, hock: .42, foot: 'paw', sprawl: 0, crouch: 0, horns: 'none', hornS: 1, mane: 0, spikes: 0, wings: 0, teeth: 0, tusks: 0, coat: 'fur' };
function quad(p) {
  const K = kit(), { gw, gh, H } = p, lr = .046 * p.leg, sp = p.sprawl, kc = p.crouch, th = p.thigh, lg = p.long;
  const ROWS = [[-.53, .035, .045], [-.47, .115, .125], [-.3, .15, .165], [-.02, .135, .15 * (1 - .3 * p.tuck)], [.22, .155, .19], [.42, .125, .165], [.52, .045, .06]];
  const wh = zz => { const z = zz / lg; let i = 0; while (i < ROWS.length - 2 && z > ROWS[i + 1][0]) i++; const a = ROWS[i], b = ROWS[i + 1], t = mx(0, mn(1, (z - a[0]) / (b[0] - a[0]))); return [(a[1] + (b[1] - a[1]) * t) * gw, (a[2] + (b[2] - a[2]) * t) * gh]; };
  const top = z => H * (p.rump + (1 - p.rump) * ss(-.45, .3, z / lg) + p.arch * mx(0, 1 - (z / lg / .5) ** 2)), mid = z => top(z) - wh(z)[1];
  const fur = p.coat === 'fur' ? [.03, .0035] : p.coat === 'scales' ? [.016, .0022] : undefined;
  // ---- the body in slices from rump to chest, the neck, the head
  const Jm = [0, mid(-.02 * lg), -.02 * lg], Jn = [0, top(.4 * lg) - wh(.4 * lg)[1] * .7, .38 * lg], nd = [0, sin(p.neckA), cos(p.neckA)], Jh = add(Jn, nd, p.neck);
  const HEAD = fr(Jh, [1, 0, 0], [0, cos(p.headA), sin(p.headA)]), hd = p.head, sn = p.snout, sr = p.snoutR, tip = HEAD.p(0, -hd * .3, hd * .75 + sn);
  K.bone('hips', null, [0, mid(-.3 * lg), -.3 * lg]); K.bone('spine', 'hips', Jm); K.bone('neck', 'spine', Jn); K.bone('head', 'neck', Jh);
  const body = K.chain(['hips', 'spine', 'neck', 'head'], [[0, mid(-.5 * lg), -.56 * lg], Jm, Jn, Jh, tip], null, .16);
  K.add(body, 'hide', tube(fr([0, 0, 0], [1, 0, 0], [0, 0, 1]), ROWS.map(r => [r[0] * lg, r[1] * gw, r[2] * gh, -(top(r[0] * lg) - r[2] * gh), 0, p.sq]), { blend: 0, lumpy: fur }));
  K.add(body, 'hide', { taper: [add(Jn, nd, -.09), add(Jh, nd, .02)], r: [mn(wh(.4 * lg)[1] * .95, p.neckR * p.neckB), p.neckR], blend: .05, lumpy: fur });
  const list = [], hs = (slot, s, w = 'head') => { list.push(K.add(w, slot, s)); };
  hs('hide', { ball: [hd * .92, hd * .88, hd * 1.05], at: HEAD.p(0, 0, hd * .3), rot: HEAD.rot, blend: .03, lumpy: fur });
  hs('hide', { taper: [HEAD.p(0, -hd * .2, hd * .7), tip], r: [mn(hd * .8, sr * 1.3), sr], blend: .04 });
  if (p.cheek) hs('hide', { ball: hd * .46 * p.cheek, at: HEAD.p(hd * .52, -hd * .3, hd * .45), mirror: true, blend: .04, lumpy: fur });
  K.bone('jaw', 'head', HEAD.p(0, -hd * .45, hd * .2));
  K.add('jaw', 'hide', { taper: [HEAD.p(0, -hd * .55, hd * .35), HEAD.p(0, -hd * .3 - sr * .8, hd * .75 + sn * .9)], r: [sr * .8, sr * .62], blend: .006 });
  if (p.nose === 'disc') K.add('head', 'nose', { rod: [HEAD.p(0, -hd * .3, hd * .75 + sn - .01), HEAD.p(0, -hd * .3, hd * .75 + sn + .022)], r: sr * 1.05, round: .008, blend: .004 });
  else if (p.nose !== 'none') K.add('head', 'nose', { ball: sr * .44, at: HEAD.p(0, -hd * .3 + sr * .42, hd * .75 + sn + sr * .45), blend: .006 });
  eyesOn(K, HEAD, K.S.slice(), hd, { n: p.eyes, size: p.eyeS, side: p.eyeSide, pupil: p.pupil });
  // ---- ears, horns, teeth
  const es = p.earS * hd, ear = (base, Y, X, size) => K.add('head', 'hide', { ball: [mx(.014, size[0]), size[1], mx(.013, size[2])], at: add(base, unit(Y), size[1] * .8), rot: fr(base, X, Y).rot, mirror: true, blend: .012 });
  if (p.ear === 'point') ear(HEAD.p(hd * .55, hd * .62, -hd * .1), add(add(HEAD.Y, HEAD.X, .35), HEAD.Z, -.1), HEAD.X, [es * .3, es * .58, es * .15]);
  else if (p.ear === 'round') ear(HEAD.p(hd * .62, hd * .55, -hd * .05), add(HEAD.Y, HEAD.X, .5), HEAD.X, [es * .42, es * .42, es * .15]);
  else if (p.ear === 'long') ear(HEAD.p(hd * .4, hd * .7, -hd * .15), add(add(HEAD.Y, HEAD.X, .12), HEAD.Z, -.3), HEAD.X, [es * .27, es * 1.25, es * .14]);
  else if (p.ear === 'flop') ear(HEAD.p(hd * .8, hd * .5, -hd * .1), add(add([0, 0, 0], HEAD.X, .75), HEAD.Y, -.65), HEAD.Z, [es * .34, es * .62, es * .15]);
  horns(K, HEAD, hd, p.horns, p.hornS);
  if (p.tusks) K.add('jaw', 'hard', { taper: [HEAD.p(sr * .75, -hd * .3 - sr * .5, hd * .75 + sn * .55), HEAD.p(sr * 1.15, -hd * .3 + sr * 1.4 * p.tusks, hd * .75 + sn * .7)], r: [.016, .007], mirror: true, blend: .004 });
  for (let i = 0; i < p.teeth; i++) { const t = (i + .5) / p.teeth, z = hd * .75 + sn * (.25 + .7 * t), x = (mn(hd * .8, sr * 1.3) * (1 - t) + sr * t) * .82; K.add('head', 'hard', { taper: [HEAD.p(x, -hd * .28 - sr * .55, z), HEAD.p(x * 1.02, -hd * .28 - sr * .55 - .034, z)], r: [.0125, .006], mirror: true, blend: .003 }); }
  // ---- legs: shoulder or hip, elbow or knee, wrist or hock, foot
  const zf = .3 * lg, zh = -.3 * lg, [wf, hf] = wh(zf), [wr, hr] = wh(zh), xs = wf * .62, xh = wr * .62, ybf = top(zf) - 2 * hf, ybr = top(zh) - 2 * hr;
  const S = [xs, mid(zf), zf + .03], E = mix([xs, ybf + .03, zf - .03], [wf + .11, mid(zf) + .01, zf - .04], sp), W = mix([xs, mx(lr * 1.9, (ybf + .03) * p.wrist), zf + .005], [wf + .15, lr * 1.9, zf + .05], sp), T = mix([xs, lr, zf + .02], [wf + .16, lr, zf + .08], sp);
  K.limb(['legF', 'shinF', 'footF'], [S, E, W, T], [lr * 2.2 * th, lr * 1.35 * (1 + (th - 1) * .5), lr * .98, lr], 'spine', { blend: .03, lumpy: fur });
  const Pj = [xh, mid(zh) + hr * .1, zh], ko = xh * 1.3 + .03;
  const Kn = mix(mix([xh, ybr + .03, zh + .1], [ko, .1, zh + .2], kc), [wr + .1, mid(zh), zh + .07], sp), An = mix(mix([xh, mx(lr * 1.9, (ybr + .03) * p.hock), zh - .11], [ko, lr * 1.1, zh - .06], kc), [wr + .15, lr * 1.9, zh - .05], sp), Tn = mix(mix([xh, lr, zh - .03], [ko, lr, zh + .15], kc), [wr + .16, lr, zh], sp);
  K.limb(['legH', 'shinH', 'footH'], [Pj, Kn, An, Tn], [lr * 2.7 * th, lr * 1.5 * (1 + (th - 1) * .6), lr * .92, lr], 'hips', { blend: .035, lumpy: fur });
  for (const [name, c] of [['footFL', T], ['footHL', Tn]]) {
    if (p.foot === 'hoof') K.add(name, 'hoof', { rod: [[c[0], 0, c[2]], [c[0], lr * 1.8, c[2]]], r: lr * 1.22, round: .008, mirror: true, blend: .004 });
    else {
      K.add(name, 'hide', { ball: [lr * 1.3, lr * .9, lr * 1.75], at: [c[0], lr * .88, c[2] + lr * .55], mirror: true, blend: .02 });
      if (p.foot === 'claw') for (const i of [-1, 0, 1]) K.add(name, 'claw', { taper: [[c[0] + i * lr * .7, lr * .75, c[2] + lr * 1.9], [c[0] + i * lr * .9, .013, c[2] + lr * 1.9 + mn(.05, lr * 1.1)]], r: [.0155, .007], mirror: true, blend: .004 });
    }
  }
  // ---- the tail: 'thin' | 'thick' (a lizard's) | 'bushy' | 'hair' (a horse's) | 'stub' | 'curl'
  const Tb = [0, top(-.47 * lg) - wh(-.47 * lg)[1] * .6, -.49 * lg], tails = [];
  if (p.tail === 'stub' || p.tail === 'curl') {
    K.bone('tail1', 'hips', Tb); tails.push('tail1');
    if (p.tail === 'stub') K.add('tail1', 'hide', { ball: .045 * mx(.6, p.tailL * 2), at: add(Tb, [0, .02, -.035]), blend: .02, lumpy: fur });
    else K.add('tail1', 'hide', { torus: [.032, .0125], at: add(Tb, [0, .03, -.05]), rot: [0, 0, PI / 2], blend: .01 });
  } else {
    const n = p.tail === 'thick' ? 4 : 3, pts = run(Tb, n, p.tailL, p.tailA, p.tailCurl), names = pts.slice(0, -1).map((_, i) => 'tail' + (i + 1)), base = wh(-.47 * lg)[1];
    const R = p.tail === 'thick' ? [base * .8, base * .55, base * .34, base * .18, .014] : p.tail === 'bushy' ? [.04, .075, .07, .028] : p.tail === 'hair' ? [.035, .05, .045, .02] : [.03, .023, .017, .0125];
    names.forEach((nm, i) => K.bone(nm, i ? names[i - 1] : 'hips', pts[i])); tails.push(...names);
    const c = K.chain(names, pts, 'hips', .07);
    for (let i = 0; i < n; i++) K.add(c, p.tail === 'hair' ? 'mane' : 'hide', { taper: [pts[i], pts[i + 1]], r: [R[i], R[i + 1]], blend: p.tail === 'thick' ? .05 : .025, lumpy: p.tail === 'bushy' || p.tail === 'hair' ? [.03, .008] : fur });
    if (p.spikes) for (let i = 0; i < n * 2; i++) { const t = (i + .5) / (n * 2), q = mix(pts[0], pts[n], t), r = R[0] + (R[n] - R[0]) * t, s = .05 * p.spikes * (1 - t * .6); K.add(c, 'hard', { taper: [add(q, [0, r * .7, 0]), add(q, [0, r + s, -s * .4])], r: [mx(.013, s * .3), .006], blend: .004 }); }
  }
  // ---- along the back: a mane, spikes; wings
  if (p.mane) for (let i = 0; i < 6; i++) { const q = mix(add(Jn, [0, wh(.4 * lg)[1] * .6, -.06]), add(Jh, [0, hd * .7, -hd * .2]), i / 5); K.add(body, 'mane', { ball: [.022, .05 * p.mane, .05], at: add(q, nd, 0), blend: .02, lumpy: [.03, .008] }); }
  if (p.spikes) for (let i = 0; i < 8; i++) { const z = (.36 - i * .115) * lg, s = .06 * p.spikes * (.7 + .3 * sin(i * 1.3 + 1)); K.add(body, 'hard', { taper: [[0, top(z) - .015, z], [0, top(z) + s, z - s * .35]], r: [mx(.014, s * .32), .006], blend: .004 }); }
  let wings = null;
  if (p.wings) wings = batWings(K, [wf * .55, top(.16 * lg) - .03, .16 * lg], .95 * p.wings, 'spine');
  const legs = [['F', 1, S, 'spine'], ['F', -1, S, 'spine'], ['H', 1, Pj, 'hips'], ['H', -1, Pj, 'hips']].map(([q, side, j]) => ({ up: 'leg' + q + (side > 0 ? 'L' : 'R'), lo: 'shin' + q + (side > 0 ? 'L' : 'R'), ft: 'foot' + q + (side > 0 ? 'L' : 'R'), side, L: j[1], hind: q === 'H', out: sp > .5, bend: q === 'H' ? [0, 1, -.75] : [-.2, -.4, 1.5] }));
  return { K, meta: { gait: 'quad', H: mid(-.3 * lg), W: wh(-.3 * lg)[0], span: tip[2] + .53 * lg, coat: p.coat, legs, tail: tails, spine: ['spine'], neck: ['neck'], head: 'head', jaw: 'jaw', wings, wingSpan: .95 * p.wings, order: wings ? Object.fromEntries(wings.flat().map(n => [n, 'ZYX'])) : null, hop: kc > .5, reach: mn(1.5, p.neckA + Math.asin(mn(1, Jn[1] / (p.neck + hd * 1.5 + sn))) * .8), cell: p.wings ? .0088 : .007 } };
}
// a pair of skin wings (a dragon's, an imp's): an arm along the front edge and a web in scallops behind it
function batWings(K, root, span, par) {
  const w = wing(K, { root, span, par, rows: [[-.04, .05, .014, 0, -.02], [.12, .15, .011, .01, -.1], [.3, .2, .01, .02, -.15], [.45, .15, .009, .02, -.12], [.6, .2, .009, .02, -.17], [.75, .12, .009, .01, -.14], [.88, .13, .009, 0, -.17], [1, .02, .009, 0, -.1]] });
  K.add(w.c, 'hide', { taper: [root, add(w.pts[1], [0, .02, .03])], r: [.04, .028], mirror: true, blend: .02 });
  K.add(w.c, 'hide', { taper: [add(w.pts[1], [0, .02, .03]), add(w.pts[3], [0, 0, -.06])], r: [.028, .012], mirror: true, blend: .015 });
  return [['wingL', 'wingmidL', 'wingtipL'], ['wingR', 'wingmidR', 'wingtipR']];
}

// ================================================================= birds
const BIRD = { H: .3, up: .25, bl: .5, bw: .13, bh: .14, neck: .1, neckA: 1, neckR: .05, head: .085, beak: 'cone', beakL: .09, beakR: 1, eyeS: 1, eyeSide: .85, pupil: 'round', tail: .25, tailW: .1, tailA: -.1,
  wing: .55, chord: .17, leg: 1, shank: .5, foot: 'toes', comb: 0, crest: 0, tufts: 0, hop: 0, coat: 'feathers' };
function bird(p) {
  const K = kit(), a = p.up * 1.25, fwd = [0, sin(a), cos(a)], bup = [0, cos(a), -sin(a)], { bl, bw, bh, H } = p, back = .45 - .22 * p.up, fl = [.028, .0045];
  const hipJ = [0, H, 0], B = fr(hipJ, [1, 0, 0], fwd), along = (t, u = 0) => add(add(hipJ, fwd, t * bl), bup, u);
  const Js = along(.14), Jn = along(1 - back - .12, bh * .3), nd = [0, sin(p.neckA), cos(p.neckA)], Jh = add(Jn, nd, p.neck + p.head * .5);
  K.bone('hips', null, hipJ); K.bone('spine', 'hips', Js); K.bone('neck', 'spine', Jn); K.bone('head', 'neck', Jh);
  const HEAD = fr(Jh, [1, 0, 0], [0, 1, 0]), hd = p.head, bL = p.beakL, br = hd * .36 * p.beakR, z0 = hd * .85, tipB = HEAD.p(0, -hd * .12, z0 + bL);
  const body = K.chain(['hips', 'spine', 'neck', 'head'], [along(-back), Js, Jn, Jh, tipB], null, .12);
  K.add(body, 'hide', tube(B, [[-back * bl, .02, .025], [(-back + .14) * bl, bw * .62, bh * .55, bh * .05], [(-back + .4) * bl, bw, bh * .95, bh * .12], [(1 - back - .3) * bl, bw * .97, bh, bh * .1], [(1 - back - .1) * bl, bw * .7, bh * .75], [(1 - back) * bl, .035, .04]], { blend: 0, lumpy: fl }));
  K.add(body, 'hide', { taper: [add(Jn, nd, -.06), Jh], r: [mn(bh * .8, p.neckR * 1.7), p.neckR], blend: .045, lumpy: fl });
  K.add('head', 'hide', { ball: [hd * .95, hd * .92, hd * 1.05], at: HEAD.p(0, 0, hd * .15), blend: .03, lumpy: fl });
  // ---- the beak: 'cone' | 'flat' (a duck's) | 'hook' (a hawk's, an owl's) | 'long' (a heron's); its lower half opens (bones.jaw)
  const bk = (w, sh) => K.add(w, 'beak', sh);
  K.bone('jaw', 'head', HEAD.p(0, -hd * .25, hd * .55));
  if (p.beak === 'flat') { bk('head', { ball: [br * 1.25, mx(.012, br * .42), bL * .62], at: HEAD.p(0, -hd * .12, z0 + bL * .42), blend: .006 }); bk('jaw', { ball: [br * 1.1, mx(.011, br * .3), bL * .55], at: HEAD.p(0, -hd * .12 - br * .5, z0 + bL * .38), blend: .004 }); }
  else if (p.beak === 'hook') {
    const m = HEAD.p(0, -hd * .1, z0 + bL * .62); bk('head', { taper: [HEAD.p(0, -hd * .02, z0 - hd * .25), m], r: [br, br * .62], blend: .006 }); bk('head', { taper: [m, HEAD.p(0, -hd * .1 - bL * .55, z0 + bL * .8)], r: [br * .62, .0085], blend: .012 });
    bk('jaw', { taper: [HEAD.p(0, -hd * .32, z0 - hd * .25), HEAD.p(0, -hd * .3, z0 + bL * .45)], r: [br * .6, br * .32], blend: .004 });
  } else { bk('head', { taper: [HEAD.p(0, -hd * .05, z0 - hd * .3), tipB], r: [br, p.beak === 'long' ? .011 : .009], blend: .006 }); bk('jaw', { taper: [HEAD.p(0, -hd * .05 - br * .75, z0 - hd * .3), HEAD.p(0, -hd * .14 - br * .1, z0 + bL * .9)], r: [br * .7, .0085], blend: .004 }); }
  if (p.comb) { for (let i = 0; i < 3; i++) K.add('head', 'comb', { ball: [mx(.013, hd * .13), hd * .3, hd * .26], at: HEAD.p(0, hd * (.95 - .07 * i * i), hd * (.42 - i * .36)), blend: .012 }); K.add('jaw', 'comb', { ball: [mx(.013, hd * .13), hd * .32, hd * .15], at: HEAD.p(0, -hd * .78, hd * .62), blend: .01 }); }
  if (p.crest) K.add('head', 'hide', { taper: [HEAD.p(0, hd * .6, -hd * .05), HEAD.p(0, hd * (1 + .8 * p.crest), -hd * .95)], r: [hd * .42, .013], blend: .02, lumpy: fl });
  if (p.tufts) K.add('head', 'hide', { taper: [HEAD.p(hd * .5, hd * .55, 0), HEAD.p(hd * .8, hd * (.95 + .4 * p.tufts), -hd * .12)], r: [hd * .26, .012], mirror: true, blend: .02 });
  eyesOn(K, HEAD, K.S.slice(), hd, { size: p.eyeS, side: p.eyeSide, pupil: p.pupil, up: .12, fwd: .68 });
  // ---- the tail: a fan of feathers
  const Tb = along(-back + .07, bh * .12), tA = p.tailA - a * .6, td = [0, sin(tA), -cos(tA)];
  K.bone('tail1', 'hips', Tb);
  if (p.tail > 0) K.add('tail1', 'wing', tube(fr(Tb, [1, 0, 0], td), [[-.05, p.tailW * .4, .015], [p.tail * .5, p.tailW * .75, .012], [p.tail * .9, p.tailW, .0095], [p.tail, p.tailW * .75, .009]].map(r => [...r, 0, 0, 3]), { blend: .02 }));
  // ---- wings, made spread (folded is a pose): shoulder, wrist and tip
  const c = p.chord, w = wing(K, { root: add(along(1 - back - .3, bh * .45), [bw * .7, 0, 0]), span: p.wing, par: 'spine', chord: fwd, out: [1, 0, 0], blend: .015,
    rows: [[-.06, c * .4, .017, 0, -c * .2], [.12, c * .52, .015, 0, -c * .25], [.36, c * .55, .012, 0, -c * .3], [.62, c * .47, .011, 0, -c * .42], [.85, c * .3, .0095, 0, -c * .62], [1, c * .08, .009, 0, -c * .85]] });
  // ---- legs: a feathered drumstick, a bare shank, toes
  const lr = .017 * p.leg, hx = bw * .5, f = p.foot === 'talons' ? 1.25 : 1, hipP = [hx, H - bh * .3, 0], ank = [hx, mx(lr * 3.5, (H - bh * .8) * p.shank + .012), -.03 - H * .06], toe = [hx, lr * 1.05, .012];
  K.limb(['leg', 'shin', 'foot'], [hipP, ank, toe, [hx, .0095, .012 + .075 * f]], [lr * 2.7, lr * 1.05, lr * .95, .0085], 'hips', { slot: ['hide', 'shank', 'shank'], blend: .012, soft: .03, lumpy: fl });
  for (const [dx, dz] of [[-.042, .06], [.042, .06], [0, -.045]]) K.add('footL', 'shank', { taper: [toe, [hx + dx * f, .0095, .012 + dz * f]], r: [lr * .9, .0085], mirror: true, blend: .008 });
  if (p.foot === 'web') K.add('footL', 'shank', { ball: [.05, .0095, .042], at: [hx, .0095, .012 + .04], mirror: true, blend: .006 });
  const legs = [1, -1].map(side => ({ up: side > 0 ? 'legL' : 'legR', lo: side > 0 ? 'shinL' : 'shinR', ft: side > 0 ? 'footL' : 'footR', side, L: H, hind: true, bend: [.5, -1.2, .8] }));
  const wings = [['wingL', 'wingmidL', 'wingtipL'], ['wingR', 'wingmidR', 'wingtipR']];
  return { K, meta: { gait: 'bird', H, W: bw, span: mx(dist(add(Tb, td, p.tail), tipB), dist(add(Tb, td, p.tail), add(Jh, [0, hd, 0]))), trail: H > .45, coat: p.coat, legs, tail: ['tail1'], spine: ['spine'], neck: ['neck'], head: 'head', jaw: 'jaw', wings, wingSpan: p.wing, up: a, hop: p.hop > .5,
    order: Object.fromEntries(wings.flat().map(n => [n, 'ZYX'])), reach: mn(1.4, .5 + H * 1.5), cell: .006 } };
}

// ================================================================= fish
const FISH = { bh: .15, bw: .065, peak: .1, snout: .5, dorsal: 'fin', dorsalH: .12, tailF: 'fork', tailS: 1, pect: 1, anal: 1, mouth: .5, low: 0, teeth: 0, eyeS: 1, lure: 0, spikes: 0, coat: 'scales' };
function fish(p) {
  const K = kit(), { bh, bw } = p, pk = p.peak, sn = 1 - p.snout, lerp = (a, b, t) => a + (b - a) * t;
  // slices from the tail's root (z = -.42) to the nose (z = .5): [z, share of the width, share of the height]
  const ROWS = [[-.42, .12, .2], [lerp(-.42, pk, .45), .52, .55], [lerp(-.42, pk, .8), .9, .92], [pk, 1, 1], [lerp(pk, .5, .5), .82 + .1 * sn, .85 + .1 * sn], [lerp(pk, .5, .82), .5 + .3 * sn, .5 + .35 * sn], [.5, .07 + .3 * sn, .07 + .35 * sn]];
  const at = z => { let i = 0; while (i < ROWS.length - 2 && z > ROWS[i + 1][0]) i++; const a = ROWS[i], b = ROWS[i + 1], t = mx(0, mn(1, (z - a[0]) / (b[0] - a[0]))); return [lerp(a[1], b[1], t) * bw, lerp(a[2], b[2], t) * bh]; };
  K.bone('hips', null, [0, 0, 0]); K.bone('spine', 'hips', [0, 0, .12]); K.bone('head', 'spine', [0, 0, .28]); K.bone('tail1', 'hips', [0, 0, -.12]); K.bone('tail2', 'tail1', [0, 0, -.24]); K.bone('tail3', 'tail2', [0, 0, -.36]);
  const body = K.chain(['tail3', 'tail2', 'tail1', 'hips', 'spine', 'head'], [-.56, -.36, -.24, -.12, .12, .28, .5].map(z => [0, 0, z]), null, .09), sc = p.coat === 'scales' ? [.02, .002] : undefined;
  K.add(body, 'hide', tube(fr([0, 0, 0], [1, 0, 0], [0, 0, 1]), ROWS.map(r => [r[0], mx(.012, r[1] * bw), mx(.014, r[2] * bh), 0, 0, 2]), { blend: 0, lumpy: sc }));
  const fin = (w, o, X, Y, rows, more) => K.add(w, 'fin', tube(fr(o, X, Y), rows.map(r => [r[0], r[1], mx(.0085, r[2]), 0, r[3] || 0, 2.6]), { blend: .012, ...more }));
  // ---- the fin on the back: 'fin' | 'shark' | 'sail' | 'ridge' (an eel's) | 'none'; one underneath
  const h = p.dorsalH, dz = pk - .06, top = z => at(z)[1] * .82;
  if (p.dorsal === 'fin') fin(body, [0, top(dz), dz], [0, 0, 1], [0, 1, 0], [[-.04, .12, .013], [h * .55, .09, .011, -.035], [h, .04, .009, -.085]]);
  else if (p.dorsal === 'shark') fin(body, [0, top(dz), dz], [0, 0, 1], [0, 1, 0], [[-.04, .1, .015], [h * .5, .06, .012, -.04], [h, .014, .009, -.1]]);
  else if (p.dorsal === 'sail') fin(body, [0, top(dz - .05), dz - .05], [0, 0, 1], [0, 1, 0], [[-.04, .24, .012], [h * .6, .22, .01, -.02], [h, .14, .009, -.06]]);
  else if (p.dorsal === 'ridge') { fin(body, [0, top(-.1), -.1], [0, 0, 1], [0, 1, 0], [[-.03, .4, .011], [h, .36, .009, -.02]]); fin(body, [0, -top(-.2), -.2], [0, 0, 1], [0, -1, 0], [[-.03, .3, .011], [h, .27, .009, -.02]]); }
  if (p.anal && p.dorsal !== 'ridge') fin(body, [0, -top(-.2), -.2], [0, 0, 1], [0, -1, 0], [[-.03, .055, .012], [.075 * p.anal, .022, .009, -.045]]);
  // ---- the tail fin: 'fork' | 'fan' | 'shark' (the top lobe longer) | 'point' (none: the body runs out)
  const T = p.tailS, lobe = (dy, len, c) => { const d = unit([0, dy, -1]); fin('tail3', [0, 0, -.41], [0, d[2] < 0 ? -d[2] * Math.sign(dy) : 0, d[1] * Math.sign(dy)], d, [[-.04, .034, .013], [len * .35, c, .011], [len * .75, c * .7, .0095], [len, .012, .009]]); };
  if (p.tailF === 'fork') { lobe(.75, .24 * T, .05); lobe(-.75, .24 * T, .05); }
  else if (p.tailF === 'shark') { lobe(1, .3 * T, .05); lobe(-.8, .17 * T, .04); }
  else if (p.tailF === 'fan') fin('tail3', [0, 0, -.41], [0, 1, 0], [0, 0, -1], [[-.04, .04, .013], [.08 * T, .1 * T, .011], [.17 * T, .13 * T, .0095], [.21 * T, .115 * T, .009]]);
  // ---- the fins at its sides (bones.finL, finR)
  const pz = mn(.3, pk + .12);
  if (p.pect) wing(K, { root: [at(pz)[0] * .9, -at(pz)[1] * .35, pz], span: .14 * p.pect, par: 'spine', slot: 'fin', names: ['fin'], cuts: [], out: unit([.72, -.42, -.55]), chord: unit([.35, -.1, .6]), blend: .012, rows: [[-.12, .028, .011], [.45, .048, .0095, 0, -.012], [1, .016, .009, 0, -.04]] });
  // ---- the mouth (carved in), teeth, eyes, a lure, spikes
  const my = -bh * (.1 + .32 * p.low) * (.4 + .6 * sn + .6 * p.low), mw = mx(.02, at(.44)[0] * .95 * mn(1.3, p.mouth * 1.4)), md = .03 + .07 * p.mouth, mh = mn(.01 + .018 * p.mouth, at(.44)[1] * .4), mz = .5 - md * (p.low ? .9 : .35), nt = mn(p.teeth, Math.floor(mw * .7 / .028));
  K.add('head', 'mouth', { ball: [mw, mh, md], at: [0, my, mz], cut: true, blend: .006 });
  for (let i = 0; i < nt; i++) { const x = mw * (.2 + .68 * (i + .5) / nt), z = mz + md * .55 * Math.sqrt(mx(0, 1 - (x / mw) ** 2)); K.add('head', 'hard', { taper: [[x, my + mh + .004, z], [x, my + mh - .034, z + .003]], r: [.0125, .0065], mirror: true, blend: .003 }); }
  const hd = mx(.07, mn(.14, at(.33)[1] * .75)), HEAD = fr([0, at(.33)[1] * .28, .3], [1, 0, 0], [0, 1, 0]);
  eyesOn(K, HEAD, K.S.filter(q => !q.cut), hd, { size: p.eyeS, side: .97, up: .1, fwd: .55 });
  if (p.lure) { const a = [0, at(.3)[1] * .8, .3], b = [0, at(.3)[1] + .14, .42], c = [0, at(.3)[1] + .1, .56]; K.add('head', 'hide', { taper: [a, b], r: [.016, .012], blend: .01 }); K.add('head', 'hide', { taper: [b, c], r: [.012, .0105], blend: .008 }); K.add('head', 'lure', { ball: .034 * p.lure, at: c, blend: .004 }); }
  if (p.spikes) for (let i = 0; i < 46; i++) {   // all over, evenly (a spiral round a ball)
    const y = 1 - (i + .5) / 23, r = Math.sqrt(mx(0, 1 - y * y)), th = i * 2.39996, n = [cos(th) * r, y, sin(th) * r], z = pk + n[2] * .3, w = at(z);
    if (n[2] > .8 || n[2] < -.75) continue;
    const q = [n[0] * w[0] * .96, n[1] * w[1] * .96, z], o = unit([n[0] / mx(.02, w[0]), n[1] / mx(.02, w[1]), n[2] * .6]); K.add(body, 'hard', { taper: [q, add(q, o, .05 * p.spikes)], r: [.0145, .0065], blend: .006 });
  }
  return { K, meta: { gait: 'fish', H: mx(bh, .08), W: bw, span: p.tailF === 'point' ? 1.06 : .91 + .2 * T, coat: p.coat, legs: [], tail: ['tail1', 'tail2', 'tail3'], spine: ['spine'], head: 'head', fins: p.pect ? ['finL', 'finR'] : [], cell: .0062 } };
}

// ================================================================= insects (and spiders)
const INSECT = { H: .15, head: .075, tw: .085, th: .075, tl: .11, aw: .11, ah: .1, al: .2, abA: 0, waist: 1, legs: 6, legL: .32, legR: 1, ant: .2, wings: 'none', wingL: .42, wingW: .1, shell: 0, mand: 0, eyeS: 1.5, eyes: 2, eyeSide: .8, sting: 0, fuzz: 0, coat: 'shell' };
function insect(p) {
  const K = kit(), { H, tw, th, tl, aw, ah, al } = p, hd = p.head, fz = p.fuzz ? [.02, .006 * p.fuzz] : undefined, wb = .012 + .035 * p.waist;
  const hz = tl + hd * .75, az = -tl * .85 - al * .9, ay = H + sin(p.abA) * al * .6;
  K.bone('hips', null, [0, H, 0]); K.bone('head', 'hips', [0, H, tl * .8]); K.bone('tail1', 'hips', [0, H, -tl * .8]);
  K.add('hips', 'hide', { ball: [tw, th, tl], at: [0, H, 0], blend: wb, lumpy: fz });
  K.add('head', 'hide', { ball: [hd * 1.05, hd * .9, hd], at: [0, H - hd * .1, hz], blend: wb });
  K.add('tail1', 'hide', { ball: [aw, ah, al], at: [0, ay, az], rot: [-p.abA, 0, 0], blend: wb, lumpy: fz });
  const HEAD = fr([0, H - hd * .1, hz - hd * .1], [1, 0, 0], [0, 1, 0]);
  eyesOn(K, HEAD, K.S.slice(), hd, { n: p.eyes, size: p.eyeS, side: p.eyeSide, up: .22, fwd: .62 });
  if (p.mand) K.add('head', 'claw', { taper: [[hd * .45, H - hd * .45, hz + hd * .7], [hd * .22, H - hd * .55, hz + hd * (.9 + .9 * p.mand)]], r: [.02, .0085], mirror: true, blend: .006 });
  if (p.ant) { const a = [hd * .4, H + hd * .6, hz + hd * .4], b = add(a, [.05, p.ant * .32, p.ant * .5]), c = add(b, [.05, -p.ant * .06, p.ant * .6]); K.limb(['ant'], [a, b], [.0125, .0105], 'head', { slot: 'shank', blend: .005 }); K.add('antL', 'shank', { taper: [b, c], r: [.0105, .0085], mirror: true, blend: .005 }); }
  if (p.sting) K.add('tail1', 'claw', { taper: [[0, ay, az - al * .9], [0, ay - .01, az - al - .05 * p.sting]], r: [.018, .0075], blend: .008 });
  if (p.shell) K.add('tail1', 'shell', { ball: [aw * 1.08, ah * 1.06, al * 1.06], at: [0, ay + .004, az + .01], rot: [-p.abA, 0, 0], clip: [[0, 1, 0], ay - ah * .25, .01], blend: .004 });
  // ---- legs out to the sides: three pairs (four for a spider), each a thigh up and out and a shin down to the ground
  const n = p.legs >> 1, lr = .019 * p.legR, legs = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : .5, ang = .95 - 1.9 * t, d = [cos(ang), 0, sin(ang)], hip = [tw * .78 * cos(ang * .6), H - th * .35, tl * (.62 - 1.24 * t)], L = p.legL * (i === n - 1 || i === 0 ? 1.08 : 1);
    const knee = add(add(hip, d, L * .42), [0, mx(.03, L * .32), 0]), foot = [hip[0] + d[0] * L, lr * .55, hip[2] + d[2] * L];
    K.limb(['leg' + (i + 1), 'shin' + (i + 1)], [hip, knee, foot], [lr, lr * .8, mx(.0085, lr * .5)], 'hips', { slot: 'shank', soft: .03, blend: .008 });
    for (const side of [1, -1]) legs.push({ up: 'leg' + (i + 1) + (side > 0 ? 'L' : 'R'), lo: 'shin' + (i + 1) + (side > 0 ? 'L' : 'R'), side, L: L * .5, out: true, ph: ((i + (side > 0 ? 0 : 1)) % 2) * .5 });
  }
  // ---- wings: 'veil' (clear: a bee's, a fly's) | 'veil2' (two pairs: a dragonfly's) | 'broad' (a butterfly's) | 'none'
  const wings = [], W = p.wingL, c = p.wingW, wr = [tw * .45, H + th * .78, tl * .15];
  if (p.wings === 'veil' || p.wings === 'veil2') {
    const rows = [[-.04, c * .25, .009], [.3, c * .8, .009, 0, -c * .1], [.7, c, .009, 0, -c * .25], [1, c * .35, .009, 0, -c * .4]];
    wing(K, { root: wr, span: W, par: 'hips', slot: 'veil', names: ['wing'], cuts: [], out: unit([1, .1, p.wings === 'veil2' ? .12 : -.2]), chord: [0, 0, 1], blend: .004, rows }); wings.push(['wingL'], ['wingR']);
    if (p.wings === 'veil2') { wing(K, { root: add(wr, [0, 0, -tl * .55]), span: W * .95, par: 'hips', slot: 'veil', names: ['wing2'], cuts: [], out: unit([1, .1, -.22]), chord: [0, 0, 1], blend: .004, rows }); wings.push(['wing2L'], ['wing2R']); }
  } else if (p.wings === 'broad') {
    const w = wing(K, { root: wr, span: W, par: 'hips', slot: 'wing', names: ['wing'], cuts: [], out: unit([1, .05, .35]), chord: [0, 0, 1], blend: .006, rows: [[-.04, c * .3, .0095], [.35, c * 1.1, .009, 0, -c * .5], [.75, c * 1.5, .009, 0, -c * .9], [1, c * .8, .009, 0, -c * .6]] });
    K.add(w.c, 'wing', tube(fr(add(wr, [0, 0, -tl * .4]), [0, 0, 1], unit([1, .05, -.75])), [[-.04, c * .3, .0095], [W * .3, c * 1.1, .009, 0, c * .2], [W * .62, c * 1.25, .009, 0, c * .3], [W * .8, c * .5, .009, 0, c * .2]].map(r => [...r.slice(0, 3), 0, r[4] || 0, 2]), { mirror: true, blend: .006 }));
    wings.push(['wingL'], ['wingR']);
  }
  return { K, meta: { gait: 'insect', H, W: mx(aw, tw), span: hz + hd - (az - al), coat: p.coat, legs, tail: ['tail1'], spine: [], head: 'head', feelers: p.ant ? ['antL', 'antR'] : [], wings: wings.length ? wings : null, wingSpan: W, wingRest: p.wings === 'broad' ? 'up' : 'back',
    order: Object.fromEntries(wings.flat().map(q => [q, 'ZYX'])), cell: .006 } };
}

// ================================================================= monsters that stand up (an ogre, an imp): a person's joints, so a person's poses fit
const BIPED = { H: 1, hipH: .46, sw: .2, cw: .15, cd: .12, belly: .1, hunch: .15, neck: .04, head: .11, jawS: 1, snout: 0, arm: .44, armR: .05, hand: 1.3, leg: 1, legR: .065, foot: 1.2, ear: 'point', earS: 1, eyes: 2, eyeS: 1, pupil: 'round', horns: 'none', hornS: 1, tusks: 0, teeth: 0, tail: 0, wings: 0, spikes: 0, coat: 'skin' };
function biped(p) {
  const K = kit(), { H, sw, cw, cd } = p, hy = H * p.hipH, sy = H * (1 - .17) - p.head, lr = p.legR, ar = p.armR, lump = p.coat === 'fur' ? [.03, .0035] : [.05, .003];
  const Jc = [0, hy + (sy - hy) * .45, 0], Jn = [0, sy + .02, p.hunch * .1], nd = unit([0, 1, p.hunch * .9]), Jh = add(Jn, nd, p.neck + p.head * .55), hd = p.head;
  K.bone('hips', null, [0, hy, 0]); K.bone('spine', 'hips', Jc); K.bone('head', 'spine', Jn);
  const body = K.chain(['hips', 'spine', 'head'], [[0, hy - .08, 0], Jc, Jn, add(Jh, nd, hd)], null, .12);
  // the trunk in slices from the hips up to the shoulders: [y, half width, half depth, z of the middle]
  const B = fr([0, 0, 0], [1, 0, 0], [0, 1, 0]), yy = t => hy - .07 + (sy + .05 - hy + .07) * t;
  K.add(body, 'hide', tube(B, [[yy(0), cw * .7, cd * .75, 0], [yy(.2), cw * 1.02 + p.belly * .3, cd + p.belly * .5, -p.belly * .45], [yy(.45), cw + p.belly * .35, cd + p.belly * .7, -p.belly * .7], [yy(.72), sw * .86, cd * 1.08, -p.belly * .15 - p.hunch * .03], [yy(.92), sw * .9, cd * .9, -p.hunch * .08], [yy(1), sw * .5, cd * .55, -p.hunch * .1]].map(r => [r[0], r[1], r[2], -r[3], 0, 2.4]), { blend: 0, lumpy: lump }));
  K.add(body, 'hide', { taper: [add(Jn, nd, -.05), Jh], r: [mn(sw * .5, hd * .8), hd * .62], blend: .05 });
  const HEAD = fr(Jh, [1, 0, 0], [0, 1, 0]);
  K.add('head', 'hide', { ball: [hd * .92, hd, hd * .98], at: HEAD.p(0, hd * .1, hd * .1), blend: .03, lumpy: lump });
  if (p.snout) K.add('head', 'hide', { taper: [HEAD.p(0, -hd * .25, hd * .5), HEAD.p(0, -hd * .32, hd * (.9 + p.snout))], r: [hd * .55, hd * .36], blend: .04 });
  K.bone('jaw', 'head', HEAD.p(0, -hd * .35, hd * .1));
  K.add('jaw', 'hide', { ball: [hd * .72 * p.jawS, hd * .42, hd * (.7 + p.snout * .5)], at: HEAD.p(0, -hd * .62, hd * (.3 + p.snout * .45)), blend: .012 });
  K.add('head', 'nose', { ball: [hd * .22, hd * .18, hd * .2], at: HEAD.p(0, -hd * .12, hd * (1.02 + p.snout)), blend: .012 });
  eyesOn(K, HEAD, K.S.slice(), hd, { n: p.eyes, size: p.eyeS, side: .12, pupil: p.pupil, up: .18, fwd: .8 });
  if (p.ear === 'point') K.add('head', 'hide', { ball: [hd * .5 * p.earS, hd * .2, mx(.014, hd * .1)], at: HEAD.p(hd * (.95 + .3 * p.earS), hd * .25, -hd * .05), rot: [0, 0, .35], mirror: true, blend: .014 });
  else if (p.ear === 'round') K.add('head', 'hide', { ball: [mx(.014, hd * .12), hd * .3 * p.earS, hd * .22 * p.earS], at: HEAD.p(hd * .95, hd * .1, -hd * .05), mirror: true, blend: .012 });
  horns(K, HEAD, hd, p.horns, p.hornS);
  if (p.tusks) K.add('jaw', 'hard', { taper: [HEAD.p(hd * .42, -hd * .55, hd * (.78 + p.snout * .8)), HEAD.p(hd * .52, -hd * .55 + hd * .42 * p.tusks, hd * (.92 + p.snout * .8))], r: [.018, .0075], mirror: true, blend: .004 });
  for (let i = 0; i < p.teeth; i++) { const x = hd * (.12 + .5 * i / mx(1, p.teeth - 1)); K.add('head', 'hard', { taper: [HEAD.p(x, -hd * .36, hd * (.88 + p.snout)), HEAD.p(x, -hd * .36 - .03, hd * (.88 + p.snout))], r: [.0125, .0065], mirror: true, blend: .003 }); }
  // ---- arms (hanging, a little out) and legs
  const S0 = [sw, sy, -p.hunch * .05], al = p.arm * H, E = add(S0, [al * .2, -al * .45, 0]), Wr = add(E, [al * .13, -al * .43, .03]), Hn = add(Wr, [al * .02, -al * .1 * p.hand, .01]);
  K.limb(['arm', 'fore', 'hand'], [S0, E, Wr, Hn], [ar * 1.5, ar * 1.15, ar * .8, ar * .8 * p.hand], 'spine', { blend: .03, lumpy: lump });
  K.add('handL', 'hide', { ball: [ar * .95 * p.hand, ar * 1.25 * p.hand, ar * .75 * p.hand], at: add(Wr, [0, -al * .08 * p.hand, .012]), mirror: true, blend: .02 });
  for (const i of [-1, 0, 1]) K.add('handL', p.coat === 'skin' ? 'hide' : 'claw', { taper: [add(Wr, [i * ar * .5 * p.hand, -al * .12 * p.hand, .015]), add(Wr, [i * ar * .7 * p.hand, -al * .12 * p.hand - ar * 1.5 * p.hand, .03])], r: [mx(.0125, ar * .32 * p.hand), .009], mirror: true, blend: .008 });
  const hx = cw * .62, Hp = [hx, hy, 0], Kn = [hx * 1.05, hy * .52, .025], An = [hx * 1.05, lr * 1.1, -.01], To = [hx * 1.1, lr * .7, .09 * p.foot];
  K.limb(['leg', 'shin', 'foot'], [Hp, Kn, An, To], [lr * 1.7 * p.leg, lr * 1.15 * p.leg, lr * .85, lr * .75], 'hips', { blend: .03, lumpy: lump });
  K.add('footL', 'hide', { ball: [lr * 1.05, lr * .7, lr * 1.1 + .05 * p.foot], at: [hx * 1.08, lr * .7, .03 * p.foot + .01], mirror: true, blend: .02 });
  if (p.coat !== 'skin') for (const i of [-1, 0, 1]) K.add('footL', 'claw', { taper: [[hx * 1.08 + i * lr * .6, lr * .6, .07 * p.foot + lr * .6], [hx * 1.08 + i * lr * .8, .012, .07 * p.foot + lr * .6 + .04]], r: [.0145, .007], mirror: true, blend: .004 });
  // ---- a tail, wings, spikes down the back
  const tails = [];
  if (p.tail) { const pts = run([0, hy + .02, -cd * .7], 3, p.tail * H, .2, .28), names = ['tail1', 'tail2', 'tail3']; names.forEach((nm, i) => K.bone(nm, i ? names[i - 1] : 'hips', pts[i])); tails.push(...names); const c = K.chain(names, pts, 'hips', .06); for (let i = 0; i < 3; i++) K.add(c, 'hide', { taper: [pts[i], pts[i + 1]], r: [[.04, .028, .019, .0125][i], [.04, .028, .019, .0125][i + 1]], blend: .025 }); K.add('tail3', 'hard', { ball: [.03, .0125, .04], at: add(pts[3], [0, 0, -.02]), blend: .008 }); }
  let wings = null;
  if (p.wings) wings = batWings(K, [sw * .45, sy - .04, -cd * .85], .9 * p.wings * H, 'spine');
  if (p.spikes) for (let i = 0; i < 5; i++) { const y = sy - i * (sy - hy) * .2, s = .05 * p.spikes; K.add(body, 'hard', { taper: [[0, y, -cd * .8], [0, y + s * .3, -cd * .8 - s]], r: [mx(.014, s * .32), .0065], blend: .004 }); }
  const legs = [1, -1].map(side => ({ up: side > 0 ? 'legL' : 'legR', lo: side > 0 ? 'shinL' : 'shinR', ft: side > 0 ? 'footL' : 'footR', side, L: hy, hind: true }));
  return { K, meta: { gait: 'biped', H: Jh[1] + hd * 1.1, hipY: hy, W: cd + p.belly * .5, span: Jh[1] + hd * 1.1, tall: true, coat: p.coat, legs, tail: tails, spine: ['spine'], head: 'head', jaw: 'jaw', wings, wingSpan: .9 * p.wings * H, order: wings ? Object.fromEntries(wings.flat().map(q => [q, 'ZYX'])) : null, cell: .0075 } };
}

// ================================================================= a blob (a slime, a jelly): a mound with eyes and a mouth
const BLOB = { r: .5, h: .8, eyes: 2, eyeS: 1, mouth: 1, horns: 'none', drips: 1, spikes: 0, coat: 'slick' };
function blob(p) {
  const K = kit(), r = p.r, top = r * 2 * p.h * .9;
  K.bone('hips', null, [0, 0, 0]); K.bone('spine', 'hips', [0, top * .38, 0]); K.bone('head', 'spine', [0, top * .7, 0]);
  const body = K.chain(['hips', 'spine', 'head'], [[0, 0, 0], [0, top * .38, 0], [0, top * .7, 0], [0, top * 1.05, 0]], null, .16);
  K.add(body, 'hide', { ball: [r, r * p.h, r], at: [0, r * p.h * .8, 0], clip: [[0, 1, 0], 0, .012], blend: 0, lumpy: [.3, .02] });
  K.add(body, 'hide', { ball: [r * 1.12, r * .2, r * 1.12], at: [0, r * .1, 0], clip: [[0, 1, 0], 0, .012], blend: .12 });
  for (let i = 0; i < 5 * p.drips; i++) { const a = i * 2.4 + .7, d = r * (1.02 + .1 * sin(i * 1.7)); K.add('hips', 'hide', { ball: [r * .2, r * .09, r * .2], at: [cos(a) * d, r * .05, sin(a) * d], clip: [[0, 1, 0], 0, .012], blend: .09 }); }
  const HEAD = fr([0, top * .6, r * .45], [1, 0, 0], [0, 1, 0]), hd = r * .5;
  K.add('spine', 'mouth', { ball: [r * .3 * p.mouth, r * .075 * p.mouth, r * .3], at: [0, top * .38, r * .86], cut: true, blend: .02 });
  eyesOn(K, HEAD, K.S.filter(q => !q.cut), hd, { n: p.eyes, size: p.eyeS * 1.15, side: .1, up: .2, fwd: .9, bone: 'head' });
  horns(K, fr([0, top * .78, 0], [1, 0, 0], [0, 1, 0]), hd, p.horns, 1.2);
  if (p.spikes) for (let i = 0; i < 7; i++) { const a = -.9 + i * .3, y = r * p.h * .8 + cos(a) * r * p.h * .97, z = -sin(a) * r * .97 - .02; K.add(body, 'hard', { taper: [[0, y, z], [0, y + cos(a) * .09 * p.spikes, z - sin(a) * .09 * p.spikes - .02]], r: [.03, .008], blend: .01 }); }
  return { K, meta: { gait: 'blob', H: top, W: r, span: r * 2.2, coat: p.coat, legs: [], tail: [], spine: ['spine'], head: 'head', cell: .0085 } };
}

// ================================================================= a serpent (a snake, a wyrm): one long run of bones, a head with jaws
const SERPENT = { r: .045, head: .065, snout: .09, hood: 0, horns: 'none', hornS: 1, fangs: 1, eyeS: 1, pupil: 'slit', spikes: 0, crest: 0, rattle: 0, coat: 'scales' };
function serpent(p) {
  const K = kit(), r = p.r, N = 9, zs = Array.from({ length: N + 1 }, (_, i) => -.5 + i * (.86 / N)), rad = z => r * (.25 + .75 * ss(-.5, -.15, z)) * (1 - .25 * ss(.2, .36, z)) * (1 + p.hood * 1.3 * ss(.12, .22, z) * (1 - ss(.26, .34, z)));
  // bones from the tail's tip to the neck: tail5 .. tail1, hips (a third of the way along), spine, spine2, neck; then the head
  const names = ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine', 'spine2', 'neck'], par = { hips: null, tail1: 'hips', tail2: 'tail1', tail3: 'tail2', tail4: 'tail3', tail5: 'tail4', spine: 'hips', spine2: 'spine', neck: 'spine2' };
  const at = i => [0, r, zs[i]], piv = n => { const i = names.indexOf(n); return i < 5 ? at(i + 1) : at(i); };
  for (const n of ['hips', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'spine', 'spine2', 'neck']) K.bone(n, par[n], piv(n));
  const Jh = [0, r, .36], HEAD = fr(Jh, [1, 0, 0], [0, 1, 0]), hd = p.head, sn = p.snout;
  K.bone('head', 'neck', Jh);
  const body = K.chain([...names, 'head'], [...zs.map((_, i) => at(i)), [0, r, .36 + hd + sn]], null, .05), sc = [.018, .002];
  K.add(body, 'hide', tube(fr([0, r, 0], [1, 0, 0], [0, 0, 1]), [-.5, -.42, -.3, -.15, 0, .12, .2, .26, .31, .37].map(z => [z, mx(.012, rad(z) * (1 + p.hood * ss(.12, .22, z) * (1 - ss(.26, .34, z)))), mx(.012, r * (.25 + .75 * ss(-.5, -.15, z)) * (1 - .25 * ss(.2, .36, z))), 0, 0, 2.2]), { blend: 0, lumpy: sc }));
  K.add('head', 'hide', { ball: [hd * .85, hd * .62, hd], at: HEAD.p(0, hd * .1, hd * .5), blend: .03, lumpy: sc });
  K.add('head', 'hide', { taper: [HEAD.p(0, hd * .08, hd), HEAD.p(0, 0, hd * 1.1 + sn)], r: [hd * .6, hd * .36], blend: .03 });
  K.bone('jaw', 'head', HEAD.p(0, -hd * .2, hd * .2));
  K.add('jaw', 'hide', { taper: [HEAD.p(0, -hd * .38, hd * .35), HEAD.p(0, -hd * .3, hd * 1.05 + sn * .9)], r: [hd * .5, hd * .26], blend: .008 });
  eyesOn(K, HEAD, K.S.slice(), hd, { size: p.eyeS, side: .8, pupil: p.pupil, up: .4, fwd: .95 });
  if (p.fangs) K.add('head', 'hard', { taper: [HEAD.p(hd * .26, -hd * .12, hd * 1 + sn * .8), HEAD.p(hd * .26, -hd * .12 - .032 * p.fangs, hd * 1 + sn * .74)], r: [.0125, .0065], mirror: true, blend: .003 });
  horns(K, HEAD, hd, p.horns, p.hornS);
  if (p.crest) for (let i = 0; i < 5; i++) K.add('head', 'fin', { ball: [.011, hd * (.5 - .07 * i) * p.crest, hd * .22], at: HEAD.p(0, hd * (.75 - .05 * i), hd * (.6 - i * .32)), blend: .01 });
  if (p.spikes) for (let i = 0; i < 12; i++) { const z = .26 - i * .06, s = .05 * p.spikes * (1 - i * .05); K.add(body, 'hard', { taper: [[0, r + rad(z) * .8, z], [0, r + rad(z) + s, z - s * .5]], r: [mx(.013, s * .3), .0065], blend: .004 }); }
  if (p.rattle) for (let i = 0; i < 3; i++) K.add('tail5', 'hard', { ball: .02 - i * .003, at: [0, r, -.5 - i * .026], blend: .004 });
  return { K, meta: { gait: 'serpent', H: r, W: r, span: .86 + hd + sn, coat: p.coat, legs: [], tail: ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'], spine: ['spine', 'spine2'], neck: ['neck'], head: 'head', jaw: 'jaw', cell: .0045 } };
}

// ================================================================= what a plan is
// the makers: what each is given unless told otherwise, and the making
const GENS = { quad: [QUAD, quad], bird: [BIRD, bird], fish: [FISH, fish], insect: [INSECT, insect], biped: [BIPED, biped], blob: [BLOB, blob], serpent: [SERPENT, serpent] };
/** The kinds of creature. */
export const CREATURE_KINDS = ['quad', 'bird', 'fish', 'insect', 'monster'];
// how far the seed moves each measure of a kind (a share of it, either way)
const JIT = { quad: { H: .07, long: .06, gw: .1, gh: .08, neck: .15, neckA: .08, head: .07, snout: .15, earS: .15, tailL: .2, leg: .1, eyeS: .1 },
  bird: { H: .08, up: .1, bl: .06, bw: .08, bh: .08, neck: .12, head: .06, beakL: .15, tail: .15, wing: .08, eyeS: .08 },
  fish: { bh: .12, bw: .12, peak: .3, dorsalH: .2, tailS: .15, pect: .2, eyeS: .1 }, insect: { head: .08, tw: .08, aw: .12, al: .12, legL: .1, ant: .2, wingL: .08, eyeS: .1 },
  biped: { sw: .08, cw: .08, belly: .25, hunch: .3, head: .08, arm: .07, hand: .1, legR: .1, earS: .2, eyeS: .1 }, blob: { r: .08, h: .12, eyeS: .15, mouth: .2 }, serpent: { r: .12, head: .08, snout: .15, eyeS: .1 } };
const any = (...v) => ({ any: v });
// Each animal: its kind, how long it is (metres; how tall, for one that stands up), what differs from the
// kind's usual shape (any(): the seed picks one), its coats ([colour, belly, accent]), patterns and eyes
const LIKES = {
  dog: { kind: 'quad', size: .85, p: { head: .108, snout: .13, snoutR: .038, eyeSide: .3, ear: any('flop', 'point'), tail: any('thin', 'bushy'), tailA: .55, tailCurl: .25 }, coats: [['#9a7248', '#dcc8a4', '#3d2e22'], ['#2f2b29', '#5d5046', '#b98a55'], ['#d9c9a8', '#f2ecdf', '#8f6f4c'], ['#7c7f85', '#cfcfcf', '#34363a']], patterns: ['plain', 'socks', 'patches', 'back'], eyes: ['#5a3a1c', '#3a2a18'] },
  cat: { kind: 'quad', size: .46, p: { H: .5, arch: .04, gw: .85, gh: .85, tuck: .2, neck: .13, neckA: .6, head: .098, snout: .05, snoutR: .04, cheek: 1, ear: 'point', eyeSide: .22, eyeS: 1.3, pupil: 'slit', tail: 'thin', tailL: .75, tailA: .15, tailCurl: .4, leg: .9 }, coats: [['#c9823c', '#f0dcc0', '#8a4a1c'], ['#77797d', '#c9c9c9', '#3f4144'], ['#2a2726', '#3a3634', '#55504c'], ['#e8dcc8', '#f5f0e6', '#6a4a34']], patterns: ['stripes', 'plain', 'patches', 'socks'], eyes: ['#9db33a', '#d9a520', '#5aa0c8'] },
  horse: { kind: 'quad', size: 2.3, p: { H: .96, gw: 1.02, tuck: .15, gh: 1.22, neck: .42, neckA: .85, neckR: .064, neckB: 2.3, head: .095, headA: .95, snout: .25, snoutR: .05, ear: 'point', earS: .95, eyeSide: .95, eyeS: 1.25, pupil: 'bar', tail: 'hair', tailL: .62, tailA: -1.15, tailCurl: -.1, leg: .8, thigh: 1.55, wrist: .48, hock: .52, foot: 'hoof', mane: 1, coat: 'skin' }, coats: [['#7a4a26', '#8a5830', '#1c1612'], ['#b9763c', '#c98a50', '#e8d8b8'], ['#b8b6b0', '#d8d6d0', '#5a5a5c'], ['#2c2826', '#3a3432', '#141210']], patterns: ['plain', 'socks', 'patches'], eyes: ['#2a1c12'] },
  deer: { kind: 'quad', size: 1.5, p: { H: .86, gw: .8, gh: .85, tuck: .3, neck: .34, neckA: 1.0, neckR: .06, head: .078, headA: .55, snout: .14, snoutR: .038, ear: 'point', earS: 1.35, eyeSide: .9, eyeS: 1.15, tail: 'stub', tailL: .4, leg: .62, thigh: 1.35, wrist: .48, hock: .52, foot: 'hoof', horns: any('antlers', 'none', 'antlers') }, coats: [['#a9743e', '#efe2c8', '#f4ecd8'], ['#8c6a48', '#e4d8c0', '#f0e8d6']], patterns: ['plain', 'spots'], eyes: ['#2a1c12'] },
  cow: { kind: 'quad', size: 2.2, p: { H: .8, gw: 1.3, gh: 1.25, sq: 2.9, tuck: 0, neck: .2, neckA: .25, neckR: .1, head: .1, headA: .75, snout: .17, snoutR: .066, ear: 'flop', eyeSide: .9, pupil: 'bar', tail: 'thin', tailL: .62, tailA: -1.4, tailCurl: 0, leg: .92, thigh: 1.35, wrist: .45, hock: .52, foot: 'hoof', horns: any('curved', 'nubs', 'none'), coat: 'skin' }, coats: [['#efe9df', '#f4efe6', '#23201e'], ['#8a5a34', '#b08458', '#efe6d6'], ['#3a2e28', '#4a3c34', '#2a2220']], patterns: ['patches', 'plain'], eyes: ['#2a1c12'] },
  pig: { kind: 'quad', size: 1.2, look: { nose: '#d48a86' }, p: { H: .57, long: .92, arch: .04, gw: 1.25, gh: 1.2, sq: 2.5, tuck: 0, neck: .12, neckA: .15, neckR: .12, head: .112, headA: .32, snout: .13, snoutR: .055, nose: 'disc', ear: 'flop', earS: 1.5, eyeS: .8, tail: 'curl', leg: 1.05, wrist: .32, hock: .46, foot: 'hoof', coat: 'skin' }, coats: [['#e9a9a0', '#f2c4bc', '#3a2c2a'], ['#c98a7c', '#e0aa9c', '#2c2220'], ['#5a4038', '#6e5048', '#e8b0a4']], patterns: ['plain', 'patches', 'spots'], eyes: ['#2a1c12'] },
  bear: { kind: 'quad', size: 1.9, p: { H: .66, long: .95, arch: .06, gw: 1.3, gh: 1.25, tuck: .05, neck: .14, neckA: .35, neckR: .13, head: .13, headA: .3, snout: .12, snoutR: .056, cheek: .7, ear: 'round', earS: .75, eyeSide: .3, eyeS: .9, tail: 'stub', tailL: .3, leg: 1.6, wrist: .14, hock: .32, foot: 'claw' }, coats: [['#6a4628', '#7a5634', '#c9a878'], ['#2a2422', '#342c2a', '#8a6a48'], ['#ece8de', '#f4f0e8', '#d8d0bc']], patterns: ['plain'], eyes: ['#1c1410'] },
  rabbit: { kind: 'quad', size: .4, p: { H: .4, long: .6, arch: .2, gw: 1.15, gh: .95, tuck: 0, rump: 1.12, neck: .1, neckA: .75, neckR: .075, head: .1, headA: .25, snout: .06, snoutR: .045, cheek: .85, ear: 'long', eyeSide: .95, eyeS: 1.25, tail: 'stub', tailL: .4, leg: .9, crouch: 1 }, coats: [['#9a8468', '#e8e0d0', '#f2ece0'], ['#eeeae2', '#f6f3ee', '#c8bca8'], ['#5a5048', '#8a8078', '#d8d0c4']], patterns: ['plain', 'patches', 'socks'], eyes: ['#2a1c12', '#7a2a2a'] },
  mouse: { kind: 'quad', size: .09, p: { H: .26, long: .7, arch: .22, gw: 1.1, gh: .62, tuck: 0, rump: 1.1, neck: .07, neckA: .3, neckR: .08, head: .1, headA: .2, snout: .1, snoutR: .03, ear: 'round', earS: 1.5, eyeSide: .7, eyeS: 1.15, tail: 'thin', tailL: .95, tailA: -.12, tailCurl: .08, leg: .7, crouch: .7 }, coats: [['#8a8280', '#d8d2cc', '#e8b8b0'], ['#8a6a4a', '#e0d4c0', '#e8b8b0'], ['#efece8', '#f6f4f0', '#e8b8b0']], patterns: ['plain'], eyes: ['#141010'] },
  lizard: { kind: 'quad', size: .32, p: { H: .2, long: 1.1, gw: .85, gh: .44, sq: 2.6, tuck: 0, neck: .12, neckA: .12, neckR: .06, head: .075, headA: .1, snout: .13, snoutR: .042, nose: 'none', ear: 'none', eyeSide: .8, pupil: 'slit', tail: 'thick', tailL: 1.0, tailA: -.1, tailCurl: 0, leg: .8, sprawl: 1, foot: 'claw', spikes: any(0, 0, .5), coat: 'scales' }, coats: [['#5a8a3c', '#c8d8a0', '#2e4a20'], ['#a8905c', '#e0d4b0', '#5a4a2c'], ['#3c7a78', '#c0dcd0', '#d8a03c']], patterns: ['spots', 'stripes', 'plain', 'back'], eyes: ['#d9a520', '#c85a20'] },
  songbird: { kind: 'bird', size: .16, p: { H: .2, up: .38, hop: 1, bw: .14, bh: .15, neck: .04, head: .09, beakL: .06, beakR: .8, tail: .3, tailW: .07, wing: .5, crest: any(0, 0, 0, 1) }, coats: [['#7a5a3c', '#d9702c', '#4a3a2c'], ['#4a78b8', '#e8d24a', '#2c3a5a'], ['#c8281e', '#d8463a', '#3a2622'], ['#d8b82c', '#f0e08a', '#2c2a26']], patterns: ['plain', 'hood', 'tips'], eyes: ['#141010'], look: { beak: '#3a3430', legs: '#6a5a4c' } },
  crow: { kind: 'bird', size: .48, p: { H: .27, up: .28, neck: .06, head: .088, beakL: .13, beakR: 1.25, tail: .3, wing: .62, chord: .19 }, coats: [['#1c1c20', '#26262c', '#101014'], ['#2a2a2e', '#8a8a8e', '#141416']], patterns: ['plain'], eyes: ['#1a1410', '#c8ccd0'], look: { beak: '#18181a', legs: '#1c1c1e' } },
  duck: { kind: 'bird', size: .58, p: { H: .19, up: .1, bl: .56, bw: .15, bh: .145, neck: .13, neckA: 1.25, neckR: .042, head: .075, beak: 'flat', beakL: .1, beakR: 1.1, foot: 'web', tail: .1, tailA: .4, wing: .5, shank: .7 }, coats: [['#8a7a66', '#d8d0c0', '#1e5a3c', '#6e6050'], ['#f0ece2', '#f6f3ec', '#e8e2d6'], ['#6a4a34', '#a88a68', '#3a5a7a', '#54402e']], patterns: ['hood', 'plain', 'hood'], eyes: ['#1a1410'], look: { beak: '#e0a020', legs: '#e07a20' } },
  hawk: { kind: 'bird', size: .55, p: { H: .27, up: .6, neck: .04, head: .08, beak: 'hook', beakL: .065, beakR: 1.05, eyeS: 1.15, eyeSide: .55, wing: .8, chord: .21, tail: .3, tailW: .09, foot: 'talons', leg: 1.2 }, coats: [['#6a4a30', '#e8dcc4', '#3a2a1e'], ['#5a5a60', '#e4e4e0', '#2a2a30'], ['#8a5a34', '#f0e6d0', '#f4f0e6']], patterns: ['spots', 'back', 'hood'], eyes: ['#d9a520', '#c85a20'], look: { beak: '#2c2a28', legs: '#d8b02c' } },
  owl: { kind: 'bird', size: .4, p: { H: .2, up: .86, bl: .44, bw: .17, bh: .16, neck: .01, head: .13, beak: 'hook', beakL: .04, beakR: .7, eyeS: 1.7, eyeSide: .1, tufts: any(1, 0), wing: .64, chord: .23, tail: .15, foot: 'talons', leg: 1.2 }, coats: [['#7a5a3a', '#d8c4a0', '#3a2a1c'], ['#8a8a88', '#dcdcd6', '#3a3a3c'], ['#f0eee8', '#f6f5f0', '#5a5450']], patterns: ['spots'], eyes: ['#e0a81c', '#d87a1c'], look: { beak: '#3a3430', legs: '#c8b89a' } },
  chicken: { kind: 'bird', size: .42, p: { H: .26, up: .42, bw: .155, bh: .16, neck: .09, neckA: 1.35, neckR: .045, head: .068, beakL: .05, comb: 1, tail: .2, tailA: 1.0, tailW: .07, wing: .34, chord: .17, leg: 1.15 }, coats: [['#f0ece2', '#f6f3ec', '#e4dccc'], ['#9a5226', '#c88a54', '#2a2a26'], ['#2a2826', '#4a4642', '#161514']], patterns: ['plain', 'tips'], eyes: ['#c85a20'], look: { beak: '#e0b040', legs: '#e0b040', comb: '#c8281e' } },
  heron: { kind: 'bird', size: 1, p: { H: .6, up: .5, bl: .42, bw: .1, bh: .11, neck: .38, neckA: 1.25, neckR: .028, head: .055, beak: 'long', beakL: .2, beakR: .9, wing: .72, chord: .2, tail: .12, shank: .58, leg: .95, crest: any(.6, 0) }, coats: [['#8a96a4', '#e4e8ec', '#2a3440', '#5a6676'], ['#f2f0ea', '#f8f6f2', '#e6e2d8']], patterns: ['plain', 'tips'], eyes: ['#e0c020'], look: { beak: '#d8a430', legs: '#6a6a54' } },
  fish: { kind: 'fish', size: .3, p: { dorsal: any('fin', 'sail', 'fin'), tailF: any('fork', 'fan') }, coats: [['#e07a1c', '#f4d8a8', '#f0ece4', '#e89a3c'], ['#5a86a8', '#dce6ea', '#2c4660', '#86a8c0'], ['#8a9a3c', '#e8e6b8', '#3a4a1c', '#c8a83c'], ['#c83a3a', '#f0c8b8', '#f4f0e8', '#e06a4a']], patterns: ['plain', 'stripes', 'spots', 'patches', 'back'], eyes: ['#e8d8a0', '#d0d8dc'], look: { white: '#e8e4d8' } },
  shark: { kind: 'fish', size: 2.4, p: { bh: .1, bw: .085, peak: .14, snout: 1, dorsal: 'shark', dorsalH: .19, tailF: 'shark', pect: 2, anal: .6, mouth: .95, low: 1, teeth: 7, eyeS: .55, coat: 'slick' }, coats: [['#6a7684', '#e8ecec', '#4a5460', '#5a6674'], ['#4a6a86', '#e4ecf0', '#2c4a64', '#40607c'], ['#8a8676', '#ecebe2', '#5a5648', '#7a7666']], patterns: ['plain', 'back'], eyes: ['#141416'] },
  eel: { kind: 'fish', size: 1.1, p: { bh: .045, bw: .04, peak: .25, snout: .6, dorsal: 'ridge', dorsalH: .035, tailF: 'point', pect: .55, mouth: .7, eyeS: .7, coat: 'slick' }, coats: [['#5a6a3a', '#c8c89a', '#2c3a1c', '#4a5a30'], ['#3a3a44', '#8a8a90', '#c8a83c', '#30303a'], ['#8a5a34', '#e0c8a0', '#3a2414', '#74482a']], patterns: ['plain', 'spots', 'bands'], eyes: ['#d8c060'] },
  puffer: { kind: 'fish', size: .25, p: { bh: .27, bw: .26, peak: .08, snout: .25, dorsal: 'none', tailF: 'fan', tailS: .65, pect: .8, anal: 0, mouth: .35, spikes: 1, eyeS: 1.5 }, coats: [['#d8b83c', '#f4ecc8', '#6a5420', '#e0c860'], ['#b89a6a', '#f0e8d4', '#5a4428', '#c8aa7a'], ['#6a9aa0', '#e4f0ec', '#2c4a50', '#86b0b4']], patterns: ['spots', 'back', 'plain'], eyes: ['#3a6a8a', '#8a6a2a'], look: { white: '#e8e4d8' } },
  angler: { kind: 'fish', size: .6, p: { bh: .23, bw: .17, peak: .22, snout: .05, dorsal: 'none', tailF: 'fan', tailS: .8, pect: .9, mouth: 1.7, teeth: 6, lure: 1, eyeS: .55, coat: 'slick' }, coats: [['#3a2c2a', '#5a4a44', '#1c1414', '#4a3a36'], ['#2a3038', '#4a525c', '#14181c', '#3a424c'], ['#5a2a24', '#7a4a40', '#2a1410', '#6a3a32']], patterns: ['plain', 'spots'], eyes: ['#c8d8dc'], look: { lure: '#d8f8b0' } },
  beetle: { kind: 'insect', size: .03, p: { H: .13, head: .065, tw: .1, th: .075, tl: .1, aw: .14, ah: .1, al: .2, waist: 1.6, legL: .18, legR: 1.25, ant: .13, shell: 1, mand: any(.6, 1.4, 0), eyeS: 1 }, coats: [['#1c1c20', '#2a2a2e', '#2a5a3a'], ['#3a2418', '#4a3020', '#7a2a1c'], ['#1a2a4a', '#24304a', '#b8862c']], patterns: ['plain'], eyes: ['#0c0c0e'], look: { legs: '#141416' } },
  ladybird: { kind: 'insect', size: .008, p: { H: .12, head: .055, tw: .1, th: .07, tl: .08, aw: .17, ah: .13, al: .19, waist: 2, legL: .15, ant: .08, shell: 1, eyeS: .9 }, coats: [['#1a1a1c', '#2a2a2c', '#d0281c'], ['#1a1a1c', '#2a2a2c', '#e08a1c'], ['#1a1a1c', '#2a2a2c', '#e0c81c']], patterns: ['plain'], eyes: ['#0c0c0e'], look: { legs: '#141416', marks: 'spots' } },
  ant: { kind: 'insect', size: .012, p: { H: .15, head: .085, tw: .06, th: .06, tl: .12, aw: .095, ah: .09, al: .17, abA: -.15, waist: 0, legL: .3, legR: .85, ant: .24, mand: .7, eyeS: .9 }, coats: [['#1e1a18', '#2a2420', '#3a2a22'], ['#8a2e1a', '#a84a2c', '#5a1c10'], ['#5a3a1c', '#7a5a34', '#3a2410']], patterns: ['plain'], eyes: ['#0c0c0e'] },
  bee: { kind: 'insect', size: .016, p: { H: .16, head: .075, tw: .095, th: .09, tl: .1, aw: .11, ah: .105, al: .19, abA: -.2, waist: .6, legL: .2, ant: .12, wings: 'veil', wingL: .38, wingW: .1, sting: 1, fuzz: 1 }, coats: [['#e0a81c', '#e8c860', '#1c1814'], ['#d88a1c', '#e8b858', '#2a1c14']], patterns: ['bands'], eyes: ['#0c0c0e'], look: { legs: '#1c1814' } },
  butterfly: { kind: 'insect', size: .035, p: { H: .14, head: .055, tw: .05, th: .05, tl: .1, aw: .045, ah: .045, al: .24, waist: .4, legL: .22, legR: .7, ant: .26, wings: 'broad', wingL: .62, wingW: .15, eyeS: 1.2 }, coats: [['#2a2420', '#3a342c', '#1c1814', '#e0781c'], ['#2a2a34', '#3a3a44', '#1c1c24', '#3a78d8'], ['#3a3428', '#4a4434', '#2a241c', '#e8d83c'], ['#2a2428', '#3a3438', '#1c181c', '#d83a6a']], patterns: ['plain'], eyes: ['#0c0c0e'], look: { marks: 'edge' } },
  dragonfly: { kind: 'insect', size: .075, p: { H: .15, head: .075, tw: .065, th: .07, tl: .11, aw: .032, ah: .032, al: .34, waist: .5, legL: .24, legR: .7, ant: 0, wings: 'veil2', wingL: .56, wingW: .085, eyeS: 2.3, eyeSide: .55 }, coats: [['#2a7a8a', '#8ac8c8', '#1c3a44'], ['#c83a2a', '#e89a7a', '#5a1c14'], ['#3a8a3a', '#a8d88a', '#1c441c']], patterns: ['bands', 'plain'], eyes: ['#3a8a5a', '#8a3a2a'] },
  spider: { kind: 'insect', size: .05, p: { H: .14, head: .08, tw: .1, th: .07, tl: .09, aw: .15, ah: .13, al: .19, abA: .25, waist: .5, legs: 8, legL: .46, legR: .9, ant: 0, mand: .5, eyes: 4, eyeS: .7, eyeSide: .3, fuzz: any(0, 1) }, coats: [['#2a2422', '#3a3430', '#8a2a1c'], ['#5a4634', '#7a6650', '#2a2018'], ['#1c1c1e', '#2a2a2c', '#c8a01c']], patterns: ['plain', 'spots', 'bands'], eyes: ['#141012'] },
  dragon: { kind: 'monster', gen: 'quad', size: 4.5, p: { H: .6, long: 1, gw: 1.05, gh: 1, tuck: .2, neck: .4, neckA: .75, neckR: .07, neckB: 2, head: .1, headA: .35, snout: .2, snoutR: .055, nose: 'none', ear: 'none', eyeSide: .6, eyeS: 1.1, pupil: 'slit', tail: 'thick', tailL: 1.05, tailA: -.05, tailCurl: .06, leg: 1.15, thigh: 1.3, wrist: .2, hock: .4, foot: 'claw', horns: any('long', 'curved', 'antlers'), hornS: 1.2, spikes: 1, wings: 1, teeth: 4, coat: 'scales' }, coats: [['#8a2a1c', '#d8a860', '#3a1410', '#6a2018'], ['#2a6a3a', '#c8d890', '#143a1c', '#1c5a34'], ['#2c3a5a', '#a8b8c8', '#141c30', '#22304e'], ['#3a3a3e', '#8a8a8e', '#1c1c20', '#2c2c30']], patterns: ['plain', 'back', 'spots'], eyes: ['#e0a81c', '#d83a1c', '#8ad83a'] },
  beast: { kind: 'monster', gen: 'quad', size: 2.4, p: { H: .66, long: .95, arch: .1, gw: 1.3, gh: 1.25, tuck: .25, rump: .86, neck: .14, neckA: .3, neckR: .13, head: .135, headA: .3, snout: .15, snoutR: .07, cheek: .6, ear: 'point', earS: .8, eyeSide: .3, eyeS: .75, eyes: any(4, 3, 2), pupil: 'slit', tail: any('thin', 'stub', 'bushy'), tailL: .5, leg: 1.5, thigh: 1.25, wrist: .16, hock: .36, foot: 'claw', horns: any('curved', 'long', 'nubs'), hornS: 1.25, mane: 1.2, spikes: any(.8, 0), tusks: 1.3, teeth: 3 }, coats: [['#4a3a44', '#7a6a70', '#1c1418'], ['#5a3a24', '#8a6a4a', '#241810'], ['#3a4a44', '#7a8a80', '#141c18'], ['#6a2a2a', '#9a6a5a', '#2a1010']], patterns: ['back', 'stripes', 'plain', 'spots'], eyes: ['#e03a1c', '#e0c81c', '#7ae03a'] },
  ogre: { kind: 'monster', gen: 'biped', size: 2.6, p: { hipH: .42, sw: .24, cw: .19, cd: .15, belly: .16, hunch: .3, head: .115, jawS: 1.25, arm: .5, armR: .062, hand: 1.5, leg: 1.1, legR: .078, foot: 1.4, ear: 'point', earS: .8, eyes: any(2, 1, 2), eyeS: 1, horns: any('none', 'nubs', 'curved'), tusks: 1.1 }, coats: [['#6a8a4a', '#9ab07a', '#3a4a24'], ['#8a7a6a', '#b0a494', '#4a4034'], ['#5a7a8a', '#8aa4b0', '#2c3c48'], ['#9a6a4a', '#c09a7a', '#4a3020']], patterns: ['plain', 'spots'], eyes: ['#e0c81c', '#c8281c'] },
  imp: { kind: 'monster', gen: 'biped', size: .7, p: { hipH: .44, sw: .15, cw: .11, cd: .09, belly: .05, hunch: .2, head: .15, jawS: .85, arm: .46, armR: .034, hand: 1.3, leg: .9, legR: .045, foot: 1.2, ear: 'point', earS: 1.9, eyeS: 1.5, pupil: 'slit', horns: any('nubs', 'curved', 'long'), hornS: .8, teeth: 2, tail: .5, wings: any(.9, .9, 0), coat: 'scales' }, coats: [['#a82a2a', '#d87a5a', '#4a1010', '#7a1c1c'], ['#5a3a8a', '#9a7ab8', '#24143a', '#42286a'], ['#2a7a6a', '#7ab8a0', '#103a30', '#1c5a4e']], patterns: ['plain', 'back'], eyes: ['#e8d81c', '#7ae03a'] },
  blob: { kind: 'monster', gen: 'blob', size: .8, p: { eyes: any(2, 1, 3), horns: any('none', 'none', 'nubs'), spikes: any(0, 0, 1) }, coats: [['#4ab84a', '#8ae07a', '#1c6a2a'], ['#3a8ad8', '#7ab8f0', '#1c4a8a'], ['#c84ab8', '#e88ad8', '#7a1c6a'], ['#d8a02a', '#f0c86a', '#8a5a10']], patterns: ['plain', 'spots'], eyes: ['#141416', '#c8281c'], look: { white: '#f0f0ea' } },
  serpent: { kind: 'monster', gen: 'serpent', size: 3, p: { hood: any(0, 1, 0), horns: any('none', 'long', 'nubs'), spikes: any(0, 1, 0), crest: any(0, 0, 1), rattle: any(0, 1, 0, 0) }, coats: [['#5a7a2a', '#d8d08a', '#2a3a10'], ['#8a5a2a', '#e0c89a', '#3a2410'], ['#2a5a6a', '#a8d0c8', '#102a34'], ['#7a2a3a', '#d8a09a', '#3a1018']], patterns: ['bands', 'spots', 'back', 'plain'], eyes: ['#e0c81c', '#d8501c'] },
};
/** The animals a creature can be like, and the kind of each. */
export const CREATURE_LIKES = Object.fromEntries(Object.entries(LIKES).map(([k, v]) => [k, v.kind]));
// a colour moved a little: hue by dh (of a whole turn), lightness by dl
function shade(hex, dh, dl) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, hi = mx(r, g, b), lo = mn(r, g, b), d = hi - lo; let h = 0, l = (hi + lo) / 2; const s = d ? d / (1 - abs(2 * l - 1)) : 0;
  if (d) h = hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = ((h / 6 + dh) % 1 + 1) % 1; l = mx(.03, mn(.97, l + dl));
  const a = s * mn(l, 1 - l), f = k => { const q = (k + h * 12) % 12; return Math.round((l - a * mx(-1, mn(q - 3, 9 - q, 1))) * 255); };
  return '#' + ((1 << 24) | (f(0) << 16) | (f(8) << 8) | f(4)).toString(16).slice(1);
}
/**
 * What to make, from what a game asked for: { kind, like, seed, p (the shape: what differs from the kind's
 * usual one), detail, size (metres), look (colours and pattern), key (names the sculpt) }. No seed: the animal
 * as the book shows it; a seed: its own build, coat and size, the same on every phone. kind alone: the seed
 * picks which of that kind; neither: any creature at all.
 */
export function planOf(o = {}) {
  const seeded = o.seed != null, r = dice(seeded ? Math.imul(o.seed | 0, 2654435761) + 12345 : 1), pick = l => l[seeded ? mn(l.length - 1, Math.floor(r() * l.length)) : 0];
  if (o.like != null && !Object.hasOwn(LIKES, o.like)) throw new Error(`gs.models.creature: nothing called '${o.like}' (one of ${Object.keys(LIKES).join(', ')})`);
  if (o.kind != null && !CREATURE_KINDS.includes(o.kind)) throw new Error(`gs.models.creature: no kind called '${o.kind}' (one of ${CREATURE_KINDS.join(', ')})`);
  const pool = Object.keys(LIKES).filter(k => !o.kind || LIKES[k].kind === o.kind), drawn = pick(pool), like = o.like ?? drawn, A = LIKES[like], kind = A.kind, gen = A.gen || kind, p = {};
  for (const [k, v] of Object.entries(A.p)) p[k] = v && v.any ? pick(v.any) : v;
  for (const [k, amt] of Object.entries(JIT[gen] || {})) { const j = seeded ? (r() * 2 - 1) * amt : 0, base = p[k] ?? GENS[gen][0][k]; if (j && typeof base === 'number' && base) p[k] = Math.round(base * (1 + j) * 1000) / 1000; }
  const coat = pick(A.coats), pat = pick(A.patterns), eyes = pick(A.eyes || ['#2a1c12']), big = seeded ? .88 + r() * .24 : 1, dh = seeded ? (r() - .5) * .03 : 0, dl = seeded ? (r() - .5) * .07 : 0, ps = seeded ? Math.floor(r() * 997) : 0;
  if (o.build) for (const [k, v] of Object.entries(o.build)) if (Object.hasOwn(GENS[gen][0], k) && (typeof v === 'number' || typeof v === 'string')) p[k] = v;
  const look = { colour: o.colour ?? o.color ?? shade(coat[0], dh, dl), belly: o.belly ?? shade(coat[1], dh, dl * .5), accent: o.accent ?? shade(coat[2], dh, dl), pattern: o.pattern ?? pat, eyes: o.eyes ?? eyes, ps };
  for (const k of ['horn', 'hoof', 'claw', 'beak', 'legs', 'comb', 'mane', 'wing', 'fin', 'nose', 'shell', 'lure', 'white', 'marks']) { const v = o[k] ?? (k === (kind === 'fish' ? 'fin' : 'wing') && coat[3] ? shade(coat[3], dh, dl) : A.look?.[k]); if (typeof v === 'string') look[k] = v; }
  const detail = mx(.5, mn(2, +o.detail || 1));
  return { kind, gen, like, seed: o.seed ?? null, p, detail, size: +o.size > 0 ? +o.size : Math.round(A.size * big * 1000) / 1000, look, key: JSON.stringify([gen, p, detail]) };
}

/**
 * A plan's bones ([{ name, parent, at }]), shapes, runs of bones, eyes and what moving it needs to know
 * ({ gait, H, legs, wings, tail... }), all in the sculpt's own units (about one long).
 */
export function build(plan) {
  const k = GENS[plan.gen]; if (!k) throw new Error(`gs.models.creature: no maker called '${plan.gen}'`);
  const { K, meta } = k[1]({ ...k[0], ...plan.p });
  return { bones: K.bones, shapes: K.S, chains: K.chains, eye: K.eye, meta };
}
/** Sculpts a creature from its plan: a finished piece (see human-shapes.js finish) with the bones of every point. */
export function sculpt(plan) {
  const b = build(plan), cell = b.meta.cell / (plan.detail || 1);
  return finish(b.shapes, { cell, bones: weigh(b.chains), keep: [.1, .032, .0075], err: [.002, .008, .03], reach: .1, blend: .02, extra: b.eye.P.length ? b.eye : null });
}
export { hashOf };
/** A number for all of the above as it stands: a saved sculpt made by other workings is not used. */
export const VERSION = hashOf(stamp() + [finish, kit, weigh, eyeball, seat, eyesOn, horns, run, wing, batWings, build, sculpt, ...Object.values(GENS).map(k => JSON.stringify(k[0]) + k[1])].map(String).join(''));
