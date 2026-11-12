// The boats and planes of gs.models.vehicle. A boat floats with its waterline at y = 0 and its middle at z = 0;
// a plane's origin is on its body's centre line where its wings carry it. Noses along -z, +x the right side,
// metres; plain geometry by material slot (vehicle-parts.js), dressed by vehicles.js.
// Kit use only.
import { Shape, stations, lerp } from './vehicle-parts.js';

const { PI, sin, cos, sqrt, abs, min, max, sign } = Math;

/**
 * A boat's hull skinned from stem to stern: a bottom below the waterline, sides that rise to the gunwale (higher
 * at the bow: sheer), a rail, and inside either a deck or an open well (open: [from, to] along it, 0..1, with
 * its floor at `floor`). L, B, D (the gunwale above the water amidships), T (how deep it draws). tw: the
 * stern's width against the beam; hard: a chine and not a round bilge. Returns Z(u), half(u) (the gunwale's
 * half width), top(u) (its height), inner(u) (the well's half width at its floor).
 */
function hull(b, p) {
  const { L, B, D, T, sheer = .2, tw = .85, um = .45, hard = false, t = .05, open = null, floor = 0, camber = .04, side = 'paint', bottom = 'bottom', cap = 'paint2', inside = 'paint2', deck = 'paint2' } = p;
  const Z = u => -L / 2 + u * L, plan = u => u < um ? sin(PI / 2 * u / um) ** .75 : lerp(1, tw, ((u - um) / (1 - um)) ** 2);
  const half = u => max(.006, B / 2 * plan(u)), top = u => D + sheer * max(0, 1 - u / .55) ** 2 + sheer * .1 * max(0, (u - .8) / .2) ** 2;
  const keel = u => -T * min(1, u / .16) ** .6 * (1 - (hard ? .45 : .2) * max(0, (u - .65) / .35));
  const isOpen = u => open && u > open[0] && u < open[1];
  const outer = (u, y) => { const g = half(u), k = keel(u), xb = g * (hard ? .84 : .74), yb = k * (hard ? .3 : .5), xw = g * .94; return y >= 0 ? lerp(xw, g, min(1, y / top(u))) : y > yb ? lerp(xb, xw, (y - yb) / -yb) : xb * max(0, (y - k) / (yb - k || 1)); };
  const inner = u => max(.004, outer(u, floor) - t * 1.2);
  const sec = u => { const g = half(u), k = keel(u), G = top(u), o = isOpen(u); return [[0, k], [g * (hard ? .84 : .74), k * (hard ? .3 : .5)], [g * .94, 0], [g, G], [max(.003, g - t), G + .012], o ? [inner(u), floor] : [max(.002, g - t) * .5, G + .012 + camber * .75], [0, o ? floor : G + .012 + camber]]; };
  const ring = u => { const h = sec(u), out = h.map(([x, y]) => [x, y, Z(u)]); for (let j = h.length - 2; j >= 1; j--) out.push([-h[j][0], h[j][1], Z(u)]); return out; };
  const must = open ? [open[0], open[0] + .012 / L * 8, open[1] - .012 / L * 8, open[1]] : [];
  const U = [...stations(0, .3, .03, must.filter(u => u < .3), .008), ...stations(.3, 1, .07, must.filter(u => u >= .3), .008).slice(1)], rd = [0, hard ? .02 : .22, 0, .012, .012, 0, 0];
  b.skin(U.map(ring), { round: [...rd, ...rd.slice(1, 6).reverse()], capA: side, capB: side, crease: .7,
    slot: (i, j) => { const q = j <= 5 ? j : 11 - j, u = (U[i] + U[i + 1]) / 2; return q <= 1 ? bottom : q === 2 ? side : q === 3 ? cap : isOpen(u) ? inside : deck; } });
  return { Z, half, top, keel, inner, outer };
}
// a propeller's blades and the blur that stands in for them at speed, about z, at 0
function propeller(P, n, R, slot = 'prop', w = .16) {
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2; P.box(slot, R * w, R * .92, .03, [-sin(a) * R * .52, cos(a) * R * .52, 0], [0, 0, a], .012); }
  P.cyl('blur', R, R, .004, [0, 0, 0], [PI / 2, 0, 0], 28);
  return P;
}
// a small house on a deck: walls with a band of glass round it under a roof that overhangs
function house(b, w, l, h, at, { slot = 'paint2', roofSlot = 'paint', glass = [.52, .86], over = .12 } = {}) {
  const [x, y, z] = at, g0 = h * glass[0], g1 = h * glass[1];
  b.box(slot, w, h, l, [x, y + h / 2, z], 0, .03).box(roofSlot, w + over * 2, .06, l + over * 2, [x, y + h + .03, z], 0, .02);
  for (const s of [-1, 1]) { b.box('glass', .02, g1 - g0, l - .3, [x + s * (w / 2 + .004), y + (g0 + g1) / 2, z]).box('glass', w - .3, g1 - g0, .02, [x, y + (g0 + g1) / 2, z + s * (l / 2 + .004)]);
    for (const q of [-.5, 0, .5]) b.box(slot, .03, g1 - g0 + .02, .05, [x + s * (w / 2 + .012), y + (g0 + g1) / 2, z + q * (l - .3)]); for (const q of [-.5, 0, .5]) b.box(slot, .05, g1 - g0 + .02, .03, [x + q * (w - .3), y + (g0 + g1) / 2, z + s * (l / 2 + .012)]); }
}
// a rail on posts along a deck's edge, from u0 to u1
function railing(b, h, u0, u1, n, height = .9, inset = .1, slot = 'steel') {
  for (const s of [-1, 1]) { let last = null; for (let i = 0; i <= n; i++) { const u = lerp(u0, u1, i / n), p = [s * (h.half(u) - inset), h.top(u), h.Z(u)]; b.bar(slot, p, [p[0], p[1] + height, p[2]], .014, 5); if (last) { b.bar(slot, [last[0], last[1] + height, last[2]], [p[0], p[1] + height, p[2]], .012, 5).bar(slot, [last[0], last[1] + height * .5, last[2]], [p[0], p[1] + height * .5, p[2]], .009, 5); } last = p; } }
}

const BOATS = {
  // a rowing boat: painted outside, wood within, three thwarts, a pair of oars in their rowlocks
  rowboat(b, o, parts, points) {
    const L = 3.9, h = hull(b, { L, B: 1.5, D: .4, T: .13, sheer: .13, tw: .68, open: [.07, .94], floor: -.03, t: .035, cap: 'wood', inside: 'wood', deck: 'wood' });
    for (const u of [.24, .5, .76]) b.box('wood', h.half(u) * 2 - .06, .035, .26, [0, h.top(u) - .13, h.Z(u)], 0, .008);
    for (const s of [-1, 1]) {
      const u = .56, x = h.half(u) - .02, y = h.top(u) + .05, O = new Shape();
      b.bar('iron', [s * x, y - .06, h.Z(u)], [s * x, y + .03, h.Z(u)], .012, 6);
      O.bar('wood', [-s * .75, 0, 0], [s * 1.75, 0, 0], .022, 8).box('wood', .55, .02, .16, [s * 2, 0, 0], 0, .008);
      parts[s < 0 ? 'oarL' : 'oarR'] = { shape: O, at: [s * x, y, h.Z(u)], rot: [0, s * .3, -s * .22], order: 'YZX' };
    }
    Object.assign(points, { seat: [0, h.top(.5) - .1, h.Z(.5)], bow: [0, h.top(.03), h.Z(.03)], wake: [0, 0, L / 2] });
    return { T: .13 };
  },
  // a runabout: a foredeck, a screen, two seats in a well, an outboard motor that turns to steer
  motor(b, o, parts, points) {
    const L = 5.4, h = hull(b, { L, B: 2.1, D: .72, T: .28, sheer: .1, tw: .93, hard: true, open: [.44, .93], floor: .08, deck: 'paint2', inside: 'paint2', cap: 'paint' });
    const us = .44, w = h.half(us) - .12, y = h.top(us) + .05;
    for (const [x0, x1] of [[-w, -w * .34], [-w * .34, w * .34], [w * .34, w]]) { const mid = (x0 + x1) / 2, bend = abs(mid) > .1 ? sign(mid) * .32 : 0, zz = h.Z(us) - .05 + abs(mid) * .32; b.box('screen', (x1 - x0) / cos(bend) - .02, .42, .012, [mid, y + .2, zz], [.5, -bend, 0]); }
    b.bar('chrome', [-w, y + .38, h.Z(us) + .17], [-w * .34, y + .38, h.Z(us) + .06], .012, 6).bar('chrome', [-w * .34, y + .38, h.Z(us) + .06], [w * .34, y + .38, h.Z(us) + .06], .012, 6).bar('chrome', [w * .34, y + .38, h.Z(us) + .06], [w, y + .38, h.Z(us) + .17], .012, 6);
    for (const s of [-1, 1]) { b.box('seat', .5, .12, .5, [s * .45, .22, h.Z(.6)], 0, .04).box('seat', .5, .5, .1, [s * .45, .5, h.Z(.6) + .28], [.15, 0, 0], .04); }
    b.box('seat', 1.5, .14, .42, [0, .24, h.Z(.86)], 0, .04).ring('dark', .16, .014, [-.45, .7, h.Z(.5)], [-.6, 0, 0]).bar('dark', [-.45, .7, h.Z(.5)], [-.45, .55, h.Z(.47)], .014, 6);
    for (const s of [-1, 1]) b.bar('chrome', [s * (h.half(.12) - .1), h.top(.12) + .02, h.Z(.12)], [s * (h.half(.3) - .08), h.top(.3) + .02, h.Z(.3)], .012, 6);
    const M = new Shape(), P = new Shape();
    M.box('dark', .34, .4, .5, [0, .32, .16], 0, .09).box('paint', .345, .08, .505, [0, .28, .16]).box('dark', .1, .9, .18, [0, -.3, .16], 0, .03).box('dark', .05, .3, .3, [0, -.62, .2]).cyl('dark', .06, .04, .34, [0, -.6, .2], [PI / 2, 0, 0], 10).box('dark', .12, .14, .16, [0, .1, -.02]);
    propeller(P, 3, .16, 'steel', .5);
    parts.motor = { shape: M, at: [0, h.top(1) - .02, L / 2] }; parts.prop = { shape: P, at: [0, -.6, .4], on: 'motor' };
    Object.assign(points, { helm: [-.45, .28, h.Z(.6)], passenger: [.45, .28, h.Z(.6)], bow: [0, h.top(.05), h.Z(.05)], wake: [0, 0, L / 2 + .3] });
    return { T: .28, steer: 'motor' };
  },
  // a fishing boat: bulwarks round a wooden deck, a wheelhouse, a mast and boom, a winch, tyres over the side
  fishing(b, o, parts, points) {
    const L = 9.6, D = 1.25, fl = D - .5, h = hull(b, { L, B: 3.3, D, T: .85, sheer: .65, tw: .8, open: [.07, .955], floor: fl, t: .07, inside: 'wood', deck: 'wood', cap: 'paint2' });
    const hz = h.Z(.34);
    house(b, 2, 2.2, 2, [0, fl, hz]);
    b.box('wood', 1.5, .3, 1.6, [0, fl + .15, h.Z(.68)], 0, .02).box('paint2', 1.56, .05, 1.66, [0, fl + .32, h.Z(.68)]);
    b.bar('paint2', [0, fl, hz + 1.3], [0, fl + 5.2, hz + 1.3], .07, 8, .04).bar('paint2', [0, fl + 1.3, hz + 1.4], [0, fl + 3, h.Z(.82)], .045, 8, .03);
    for (const s of [-1, 1]) b.bar('iron', [0, fl + 5, hz + 1.3], [s * (h.half(.5) - .08), h.top(.5), h.Z(.5)], .006, 4); b.bar('iron', [0, fl + 5, hz + 1.3], [0, h.top(.02), h.Z(.02)], .006, 4).bar('iron', [0, fl + 4.6, hz + 1.3], [0, fl + 3, h.Z(.82)], .006, 4);
    b.cyl('iron', .2, .2, .7, [0, fl + .4, h.Z(.52)], [0, 0, PI / 2], 14); for (const s of [-1, 1]) b.box('iron', .06, .5, .3, [s * .4, fl + .25, h.Z(.52)]);
    b.cyl('iron', .09, .09, 1.1, [.6, fl + 2.5, hz + .7], 0, 10);
    for (const s of [-1, 1]) for (const u of [.3, .5, .7]) b.ring('rubber', .24, .09, [s * (h.half(u) + .08), h.top(u) - .5, h.Z(u)], [0, PI / 2, 0], PI * 2, 14);
    b.ring('beam', .22, .05, [1.03, fl + 1.2, hz - .5], [0, PI / 2, 0], PI * 2, 14).box('lamp', .1, .12, .1, [0, fl + 2.14, hz - 1]).box('tail', .08, .1, .08, [-1.05, fl + 1.9, hz - .9]);
    Object.assign(points, { helm: [0, fl, hz + .2], deck: [0, fl, h.Z(.6)], bow: [0, h.top(.04), h.Z(.04)], wake: [0, 0, L / 2], exhaust: [.6, fl + 3.1, hz + .7] });
    return { T: .85 };
  },
  // a patrol boat: a grey hull, a bridge with glass all round, a mast with a radar that turns, a gun forward, rails
  patrol(b, o, parts, points) {
    const L = 15, D = 1.75, h = hull(b, { L, B: 4.2, D, T: 1.05, sheer: .75, tw: .88, hard: true, camber: .07, cap: 'paint', deck: 'paint2' }), dk = u => h.top(u) + .05;
    const zb = h.Z(.47);
    b.box('paint', 3, 1.05, 5.4, [0, D + .55, zb + .5], 0, .05); house(b, 2.7, 2.6, 1.25, [0, D + 1.08, zb - .5], { slot: 'paint', roofSlot: 'paint', glass: [.36, .84] });
    b.box('paint', 1, .9, 1.5, [0, D + 1.5, zb + 2.1], [-.12, 0, 0], .2).box('dark', .8, .03, 1.2, [0, D + 1.97, zb + 2.16], [-.12, 0, 0]);
    const my = D + 2.4;
    for (const s of [-1, 1]) b.bar('paint', [s * .5, my, zb + .45], [0, my + 2.6, zb + .7], .04, 6, .025); b.bar('paint', [0, my, zb + 1.1], [0, my + 2.6, zb + .7], .04, 6, .025).bar('paint', [-.9, my + 1.7, zb + .68], [.9, my + 1.7, zb + .68], .02, 6).box('paint', .7, .05, .5, [0, my + 2.0, zb + .55]);
    b.bar('iron', [0, my + 2.6, zb + .7], [0, my + 3.6, zb + .7], .008, 4);
    railing(b, h, .04, .34, 9); railing(b, h, .68, .985, 8);
    for (const s of [-1, 1]) { b.cyl('paint2', .28, .28, 1.1, [s * 1.3, D + .45, h.Z(.78)], [PI / 2, 0, 0], 12); b.box('lamp', .08, .1, .08, [s * 1.4, D + 2.2, zb - 1.2]); }
    const R = new Shape(); R.box('paint2', 1.5, .12, .16, [0, .06, 0], 0, .03).cyl('paint', .06, .06, .16, [0, -.06, 0], 0, 8);
    parts.radar = { shape: R, at: [0, my + 2.2, zb + .55] };
    const Tt = new Shape(), G = new Shape();
    Tt.cyl('paint', .62, .7, .34, [0, .17, 0], 0, 18).box('paint', 1, .62, .9, [0, .62, .12], 0, .1);
    for (const s of [-1, 1]) G.bar('steel', [s * .14, 0, -.2], [s * .14, 0, -2.3], .045, 8, .035); G.box('paint', .5, .3, .4, [0, 0, -.25], 0, .05);
    parts.turret = { shape: Tt, at: [0, dk(.2), h.Z(.2)] }; parts.gun = { shape: G, at: [0, .64, -.3], on: 'turret' };
    Object.assign(points, { helm: [0, D + 1.1, zb - .5], muzzle: { at: [0, 0, -2.4], on: 'gun' }, bow: [0, dk(.03), h.Z(.03)], deck: [0, dk(.85), h.Z(.85)], wake: [0, 0, L / 2] });
    return { T: 1.05, gun: 2.4 };
  },
};
/** A boat: rowboat, motor, fishing, patrol. */
export function boat(o = {}) {
  const style = BOATS[o.style] ? o.style : 'rowboat', b = new Shape(), parts = {}, points = {}, m = BOATS[style](b, o, parts, points);
  const bx = b.bounds();
  return { kind: 'boat', style, body: b, parts, wheels: [], points, size: { length: bx.l, width: bx.w, height: bx.hi[1] }, draft: m.T, steer: m.steer || null, gun: m.gun || 0 };
}

// a wing, tailplane or fin: aerofoil sections from its root to its tip. root, tip: where the leading edge is at each;
// c0, c1: the chords; thick: how thick against the chord; up: which way its thickness lies ([0, 1, 0] for a wing)
const FOIL = [1, .72, .45, .25, .1, .025, 0];
function wing(b, slot, root, tip, c0, c1, thick = .12, up = [0, 1, 0], n = 5, capRoot = false) {
  const yt = x => 5 * thick * (.2969 * sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4), rings = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, k = i === n ? .55 : 1, c = lerp(c0, c1, s), p = [lerp(root[0], tip[0], s), lerp(root[1], tip[1], s), lerp(root[2], tip[2], s)], r = [];
    const put = (x, t) => r.push([p[0] + up[0] * t * c * k, p[1] + up[1] * t * c * k, p[2] + x * c]);
    for (const x of FOIL) put(x, yt(x) + .02 * sin(x * PI)); for (const x of FOIL.slice(1, -1).reverse()) put(x, -yt(x) * .8);
    rings.push(r);
  }
  b.skin(rings, { slot, capB: slot, capA: capRoot ? slot : null, crease: .9 });
}
// a body skinned along z: at each place its half width a, half heights above (bt) and below (bb) its centre line (c), how square (e: 1 an ellipse)
function body(b, Zs, f, slot, n = 20, caps = [null, null]) {
  const rings = Zs.map(z => { const { a, bt, bb, c = 0, e = 1 } = f(z), r = []; for (let i = 0; i < n; i++) { const t = (i + .5) / n * PI * 2, cs = cos(t), sn = sin(t); r.push([a * sign(cs) * abs(cs) ** e, c + (sn > 0 ? bt : bb) * sign(sn) * abs(sn) ** e, z]); } return r; });
  b.skin(rings, { slot: typeof slot === 'function' ? (i, j) => slot((Zs[i] + Zs[i + 1]) / 2, (j + 1) / n * PI * 2) : slot, capA: caps[0], capB: caps[1], crease: .8 });
}
// an undercarriage leg and its wheel
function leg(b, wheels, from, to, r, w = .14) { b.bar('steel', from, [to[0], to[1], to[2]], .035, 8); wheels.push({ at: to, geo: { r, w, rim: .5, hub: '#9a9ea2', nuts: 0, seg: 18 } }); }

const PLANES = {
  // a single-engined low-wing monoplane with a canopy and a tail wheel
  prop(b, o, parts, points, wheels) {
    const zN = -3.3, zT = 5.6, prof = z => { const u = (z - zN) / (zT - zN), k = u < .12 ? sqrt(u / .12) * .85 + .15 : u < .45 ? 1 : 1 - ((u - .45) / .55) ** 1.5 * .88, can = z > -.5 && z < 1.7 ? sin((z + .5) / 2.2 * PI) ** .6 * .42 : 0; return { a: .47 * k, bt: .56 * k + can, bb: .62 * k * (u > .45 ? .85 : 1), c: (u > .45 ? (u - .45) * .35 : 0) }; };
    body(b, stations(zN, zT, .28, [-.5, -.42, 1.62, 1.7, .55, .63]), prof, (z, t) => z > -.42 && z < 1.62 && !(z > .55 && z < .63) && t > PI * .14 && t < PI * .86 ? 'glass' : 'paint', 20, ['paint', 'paint']);
    b.lathe('paint2', [[0, -.5], [.14, -.34], [.24, -.12], [.27, 0]], [0, 0, zN], [PI / 2, 0, 0], 18);
    for (const s of [-1, 1]) {
      wing(b, 'paint', [s * .35, -.36, -1.1], [s * 5.5, .12, -.35], 2.4, 1.15, .13); wing(b, 'paint', [s * .1, .22, 4.25], [s * 1.9, .26, 4.5], 1.15, .65, .1);
      for (let i = 0; i < 6; i++) b.bar('iron', [s * .42, .12, -2.7 + i * .2], [s * .5, .08, -2.6 + i * .2], .03, 6);
      leg(b, wheels, [s * 1.7, -.3, -.3], [s * 1.7, -1.5, -.55], .33, .16); b.box('paint', .04, .7, .5, [s * 1.82, -.95, -.45]);
    }
    wing(b, 'paint', [0, .3, 3.9], [0, 1.75, 4.9], 1.6, .75, .1, [1, 0, 0]);
    leg(b, wheels, [0, -.1, 5], [0, -.62, 5.15], .13, .07);
    parts.prop = { shape: propeller(new Shape(), 3, 1.5), at: [0, 0, zN - .22] };
    Object.assign(points, { pilot: [0, -.2, .45], exhaust: [.5, .1, -1.5], guns: [1.9, -.1, -1.2], smoke: [0, 0, zT] });
    return { gear: 1.83, sit: .2, props: ['prop'] };
  },
  // a biplane: two wings on struts and wires, a radial engine, an open cockpit, wheels on an axle
  biplane(b, o, parts, points, wheels) {
    const zN = -2.2, zT = 4.9, prof = z => { const u = (z - zN) / (zT - zN), k = u < .06 ? .8 + u / .06 * .2 : u < .4 ? 1 : 1 - ((u - .4) / .6) ** 1.3 * .85; return { a: .43 * k, bt: .5 * k, bb: .55 * k, c: u > .4 ? (u - .4) * .3 : 0, e: .7 }; };
    body(b, stations(zN, zT, .3, [.28, .36, 1.02, 1.1]), prof, (z, t) => z > .36 && z < 1.02 && t > PI * .3 && t < PI * .7 ? 'dark' : 'paint', 20, ['iron', 'paint']);
    for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; b.cyl('iron', .085, .085, .36, [cos(a) * .42, sin(a) * .42, zN + .12], [0, 0, a - PI / 2], 8); } b.cyl('iron', .3, .3, .3, [0, 0, zN + .05], [PI / 2, 0, 0], 14);
    b.ring('seat', .33, .035, [0, .5, .69], [PI / 2, 0, 0], PI * 2, 14).box('screen', .5, .22, .012, [0, .62, .3], [.5, 0, 0]);
    for (const s of [-1, 1]) {
      wing(b, 'paint', [0, 1.3, -1.35], [s * 4.5, 1.42, -1.35], 1.55, 1.5, .11); wing(b, 'paint', [s * .3, -.42, -.85], [s * 4.1, -.26, -.85], 1.4, 1.35, .11);
      for (const z of [0, .85]) { b.bar('wood', [s * 2.9, -.3, -.7 + z], [s * 2.9, 1.36, -1.15 + z], .03, 6); b.bar('wood', [s * .4, .45, -.9 + z * 1.1], [s * .5, 1.3, -1.15 + z * .95], .025, 6); }
      b.bar('iron', [s * 2.9, -.3, -.3], [s * .5, 1.3, -.7], .006, 4).bar('iron', [s * 2.9, 1.36, -.75], [s * .42, -.4, -.3], .006, 4);
      b.bar('steel', [s * .4, -.5, -1.3], [s * .85, -1.3, -1.15], .03, 6).bar('steel', [s * .4, -.5, -.5], [s * .85, -1.3, -1.15], .03, 6);
      wheels.push({ at: [s * .95, -1.3, -1.15], geo: { r: .36, w: .12, rim: .78, hub: '#8a8f94', nuts: 0, seg: 20 } });
      wing(b, 'paint', [s * .08, .25, 3.95], [s * 1.5, .28, 4.1], .95, .7, .08);
    }
    b.bar('steel', [-.95, -1.3, -1.15], [.95, -1.3, -1.15], .03, 6).bar('wood', [0, -.2, 4.4], [0, -.62, 4.8], .03, 6);
    wing(b, 'paint', [0, .3, 3.9], [0, 1.4, 4.35], 1.15, .7, .08, [1, 0, 0]);
    parts.prop = { shape: propeller(new Shape(), 2, 1.25, 'wood', .14), at: [0, 0, zN - .16] };
    Object.assign(points, { pilot: [0, -.15, .7], exhaust: [.45, -.2, -1.5], smoke: [0, 0, zT] });
    return { gear: 1.66, sit: .21, props: ['prop'] };
  },
  // a twin-engined transport: a long body with a row of windows, an engine on each wing
  twin(b, o, parts, points, wheels) {
    const zN = -7.4, zT = 11.8, prof = z => { const u = (z - zN) / (zT - zN), k = u < .14 ? .25 + .75 * sin(u / .14 * PI / 2) ** .8 : u < .5 ? 1 : 1 - ((u - .5) / .5) ** 1.6 * .9; return { a: 1.15 * k, bt: 1.25 * k, bb: 1.2 * k, c: (u < .14 ? -(1 - u / .14) * .3 : 0) + (u > .5 ? (u - .5) * 1.3 : 0) }; };
    const wins = Array.from({ length: 8 }, (_, i) => -3.6 + i * 1.15), must = [-6.1, -5.3]; for (const z of wins) must.push(z - .22, z + .22);
    body(b, stations(zN, zT, .6, must, .1), prof, (z, t) => (z > -6.1 && z < -5.3 && t > PI * .22 && t < PI * .78) || (wins.some(q => abs(z - q) < .22) && (abs(t - PI * .11) < .12 || abs(t - PI * .89) < .12)) ? 'glass' : 'paint', 24, ['paint', 'paint']);
    for (const s of [-1, 1]) {
      wing(b, 'paint', [s * .9, -.75, -2.2], [s * 14, .45, -.3], 4.4, 1.5, .14, [0, 1, 0], 7); wing(b, 'paint', [s * .3, 1.2, 9], [s * 4.3, 1.35, 9.7], 2.3, 1.1, .1);
      const nx = s * 3.3, P = z => { const u = (z + 4.3) / 5.6, k = u < .1 ? sqrt(u / .1) * .6 + .4 : 1 - max(0, u - .25) ** 1.4 * .85; return { a: .68 * k, bt: .68 * k, bb: .78 * k, c: -.42 }; };
      const N = new Shape(); body(N, stations(-4.3, 1.3, .45).map(z => z), P, 'paint2', 16, ['iron', 'paint2']); for (const g of N.slots.get('paint2') || []) b.put('paint2', g.translate(nx, 0, 0)); for (const g of N.slots.get('iron') || []) b.put('iron', g.translate(nx, 0, 0));
      b.lathe('paint2', [[0, -.4], [.12, -.26], [.2, -.08], [.22, 0]], [nx, -.42, -4.3], [PI / 2, 0, 0], 14);
      leg(b, wheels, [nx, -.9, -2.6], [nx, -2.45, -2.9], .55, .24);
      parts[s < 0 ? 'propL' : 'propR'] = { shape: propeller(new Shape(), 3, 1.7), at: [nx, -.42, -4.48] };
    }
    wing(b, 'paint', [0, 1.3, 8.3], [0, 4.3, 10.4], 3.4, 1.4, .1, [1, 0, 0]);
    leg(b, wheels, [0, .4, 10.6], [0, -.2, 10.8], .2, .1);
    Object.assign(points, { pilot: [-.45, .1, -5.5], door: [-1.15, -.6, 5.2], cabin: [0, -.5, 0], smoke: [3.3, -.42, 1.3] });
    return { gear: 3, sit: .19, props: ['propL', 'propR'] };
  },
  // a jet fighter: a pointed nose, a bubble canopy, intakes, swept wings and tail, a nozzle
  jet(b, o, parts, points, wheels) {
    const zN = -7.2, zT = 6.6, prof = z => { const u = (z - zN) / (zT - zN), k = u < .3 ? (u / .3) ** .62 : u < .8 ? 1 : 1 - (u - .8) / .2 * .3, can = z > -4.4 && z < -1.6 ? sin((z + 4.4) / 2.8 * PI) ** .5 * .5 : 0; return { a: .72 * k * (u > .32 && u < .85 ? 1.25 : 1), bt: .62 * k + can, bb: .68 * k, e: u > .32 ? .75 : 1 }; };
    body(b, stations(zN, zT, .35, [-4.4, -4.3, -1.7, -1.6, -3, -2.92, -5.6]), prof, (z, t) => z < -5.6 ? 'paint2' : z > -4.3 && z < -1.7 && !(z > -3 && z < -2.92) && t > PI * .15 && t < PI * .85 ? 'glass' : 'paint', 20, ['paint2', 'dark']);
    b.cyl('iron', .52, .62, .7, [0, 0, zT + .3], [PI / 2, 0, 0], 18, true).cyl('dark', .5, .5, .02, [0, 0, zT + .1], [PI / 2, 0, 0], 18);
    for (const s of [-1, 1]) {
      b.box('paint', .5, .75, 2.6, [s * .98, -.08, -1.9], 0, .1).box('dark', .34, .6, .04, [s * 1, -.08, -3.2]);
      wing(b, 'paint', [s * .9, -.1, -.9], [s * 4.6, -.18, 2.4], 4.4, 1.2, .05); wing(b, 'paint', [s * .7, .0, 4.6], [s * 2.7, -.05, 6.3], 2.1, .8, .05);
      wing(b, 'paint', [s * .55, .5, 3.6], [s * 1.25, 2.6, 5.9], 2.6, .9, .05, [s * .94, -.33, 0]);
      b.bar('paint2', [s * 4.62, -.18, 2.2], [s * 4.62, -.18, 4.4], .07, 8, .05);
      leg(b, wheels, [s * 1.2, -.5, 1], [s * 1.5, -1.62, 1.1], .3, .16);
    }
    leg(b, wheels, [0, -.5, -4.7], [0, -1.7, -4.6], .22, .12);
    Object.assign(points, { pilot: [0, .1, -3.3], exhaust: [0, 0, zT + .7], guns: [.6, -.2, -5], smoke: [0, 0, zT + .7] });
    return { gear: 1.92, sit: 0, props: [] };
  },
};
/** A plane: prop, biplane, twin, jet. */
export function plane(o = {}) {
  const style = PLANES[o.style] ? o.style : 'prop', b = new Shape(), parts = {}, points = {}, wheels = [], m = PLANES[style](b, o, parts, points, wheels);
  const bx = b.bounds();
  return { kind: 'plane', style, body: b, parts, wheels, points, size: { length: bx.l, width: bx.w, height: bx.hi[1] + m.gear }, gear: m.gear, sit: m.sit, props: m.props, radius: wheels[0]?.geo.r || 0 };
}
export const CRAFT = { boat: Object.keys(BOATS), plane: Object.keys(PLANES) };
