// The shapes of gs.models.vehicle: cars, lorries, tanks, trains, boats and planes, each worked out from a few
// measures (how long, how wide, where the axles sit, where the glass starts) into a plan: what keeps still by
// material slot, the parts that turn (wheels, a turret, a propeller), and the named points on it (the driver's
// seat, the muzzle, the exhaust). Noses point along -z, as gs.vehicles, gs.craft and World3D.vehicle drive
// things; +x is its right side; metres. Plain geometry (vehicle-parts.js), no materials: vehicles.js dresses it.
// Kit use only.
import { Shape, line, stations, lerp, clamp, smooth, belt } from './vehicle-parts.js';

const { PI, sin, cos, sqrt, abs, min, max, hypot, round } = Math;

/**
 * A road vehicle's shell skinned from its nose (z = 0 here, `at` in the vehicle) to its tail (z = L): an underside
 * with wheel wells, sides that swell to the widest point and tuck in to the shoulder, a bonnet, a cabin with
 * glass where `cab` = [screen foot, roof start, roof end, back window foot] says, or an open tub. deck: the
 * shoulder's height along it ([[z, y], ...]); axles: where the arches are cut; glass: the side windows' reach;
 * pillars: where the side glass is broken by one. Returns what the trim needs: half(z) (the half section's
 * corners), Z(z) (to the vehicle's z), deck(z), wide(z).
 */
export function shell(b, p) {
  const { L, W, H = 0, clear, r, tw, deck, cab = null, tub = null, axles = [], soft = .06, step = .09, tumble = .13, at = -p.L / 2, gap = .065,
    plan = [[0, .9], [.3, .975], [.7, 1], [L - .7, 1], [L - .25, .97], [L, .9]], glass = cab ? [cab[0] + .12, cab[3] - .1] : null, pillars = [], lift = .05,
    inside = 'paint', paint = 'paint', capA = paint, capB = paint, crown = 1 } = p;
  const hw = W / 2, Ra = r + gap;
  const fDeck = line(deck, soft), fPlan = line(plan, .12), fFloor = line([[0, clear + lift], [.35, clear], [L - .4, clear], [L, clear + lift * 1.2]], .1);
  const fCab = cab ? line([[cab[0], 0], [cab[1], 1], [cab[2], 1], [cab[3], 0]], .035) : () => 0;
  const arch = z => { for (const a of axles) { const d = abs(z - a); if (d < Ra) return r + sqrt(Ra * Ra - d * d); } return 0; };
  const inTub = z => tub && z > tub[0] && z < tub[1];
  const half = z => {
    const w = hw * fPlan(z), fl = fFloor(z), dk = fDeck(z), c = fCab(z), top = dk + c * (H - dk), ar = arch(z), ws = w * .965, xin = max(.2, ws - .03 - tw - .06);
    const x6 = lerp(w * .975, w * (1 - tumble), c), y6 = lerp(dk - .012, top - .075, c), x7 = x6 - lerp(.035, .06, c), y7 = lerp(dk, top - .018, c), cr = (.015 + .025 * c) * crown, t = inTub(z);
    return [[0, fl], [xin, fl], [xin, max(fl, ar)], [ws, max(fl + .03, ar)], [w, min(max(fl + (dk - fl) * .45, ar + .05), dk - .07)], [w * .992, dk - .04], [x6, y6], [x7, y7],
      t ? [ar > tub[2] ? xin - .02 : x7 - .03, tub[2]] : [x7 * .5, y7 + cr * .8], [0, t ? tub[2] : y7 + cr]];
  };
  const ring = z => { const h = half(z), out = h.map(([x, y]) => [x, y, at + z]); for (let j = h.length - 2; j >= 1; j--) out.push([-h[j][0], h[j][1], at + z]); return out; };
  const must = [];
  for (const a of axles) { must.push(a - Ra, a + Ra, a - Ra + .004, a + Ra - .004); for (let k = 1; k < 10; k++) must.push(a + Ra * cos(k * PI / 10)); }
  if (cab) must.push(cab[0], cab[0] + .03, cab[1] - .03, cab[1], cab[2], cab[2] + .03, cab[3] - .03, cab[3]);
  if (glass) must.push(glass[0], glass[1]);
  for (const q of pillars) must.push(q - .035, q + .035);
  if (tub) must.push(tub[0], tub[0] + .012, tub[1] - .012, tub[1]);
  const Z = stations(0, L, step, must, .025), mid = i => (Z[i] + Z[i + 1]) / 2, rd = [0, 0, 0, .03, 0, .03, .045, .05, 0, 0];
  const sideGlass = z => glass && z > glass[0] && z < glass[1] && fCab(z) > .25 && !pillars.some(q => abs(z - q) < .035);
  const screen = z => cab && ((z > cab[0] + .03 && z < cab[1] - .03) || (z > cab[2] + .03 && z < cab[3] - .03));
  b.skin(Z.map(ring), {
    round: [...rd, ...rd.slice(1, 9).reverse()], capA, capB,
    slot: (i, j) => { const s = j <= 8 ? j : 17 - j, z = mid(i); return s <= 2 ? 'under' : s === 5 ? (sideGlass(z) ? 'glass' : paint) : s >= 7 ? (inTub(z) ? inside : screen(z) ? 'glass' : paint) : paint; },
  });
  return { half, Z: z => at + z, deck: fDeck, floor: fFloor, wide: z => hw * fPlan(z), wheelX: z => hw * fPlan(z) * .965 - .03 - tw / 2, cabin: fCab };
}

// what every road vehicle carries on its ends: bumpers, lamps, a grille, plates
function ends(b, sh, { L, clear, lamp = 'round', bumper = 'chrome', grille = true, lampY = .13, tail = [.2, .09], rear = true, bars = 4, lampR = .082, by = .26 }) {
  const { Z, deck, wide } = sh, w0 = wide(.02), w1 = wide(L - .02), y0 = deck(0), y1 = deck(L), k = lampR / .082;
  if (bumper) { b.box(bumper, w0 * 2 + .08, .11 * k, .13 * k, [0, clear + by, Z(-.005)], 0, .045); if (rear) b.box(bumper, w1 * 2 + .08, .11, .13, [0, clear + by + .01, Z(L + .005)], 0, .045); }
  b.box('plate', .4, .1, .012, [0, clear + by, Z(-.01 - .065 * k)]); if (rear) b.box('plate', .4, .1, .012, [0, clear + by + .01, Z(L + .075)]);
  if (grille) { const gw = w0 * 2 - .62 * k, gh = .037 * bars, gy = y0 - lampY - .01 - (bars - 4) * .018; b.box('dark', gw, gh + .002, .03, [0, gy, Z(-.008)], 0, .01); for (let i = 0; i < bars; i++) b.box('chrome', gw - .02, .012, .012, [0, gy - gh / 2 + .019 + i * .037, Z(-.026)]); }
  for (const s of [-1, 1]) {
    const x = s * (w0 - .11 - lampR), y = y0 - lampY;
    if (lamp === 'round') { b.cyl('lamp', lampR, lampR, .05, [x, y, Z(-.012)], [PI / 2, 0, 0], 20); b.ring('chrome', lampR + .004, .012, [x, y, Z(-.036)], [0, 0, 0]); }
    else b.box('lamp', .24, .1, .05, [s * (w0 - .2), y, Z(-.008)], 0, .02);
    if (rear) b.box('tail', tail[0], tail[1], .04, [s * (w1 - tail[0] / 2 - .06), y1 - .13, Z(L + .004)], 0, .012);
  }
}
// the lines where doors shut, and their handles
function doors(b, sh, seams, handles = []) {
  const { half, Z, deck, wide } = sh;
  for (const z of seams) { const h = half(z), a = [lerp(h[3][0], h[4][0], .12), lerp(h[3][1], h[4][1], .12)], c = [lerp(h[4][0], h[5][0], .82), lerp(h[4][1], h[5][1], .82)];
    for (const s of [-1, 1]) { b.strip('dark', [s * (a[0] + .001), a[1], Z(z)], [s * (h[4][0] + .001), h[4][1], Z(z)], .008, .004).strip('dark', [s * (h[4][0] + .001), h[4][1], Z(z)], [s * (c[0] + .001), c[1], Z(z)], .008, .004); } }
  for (const z of handles) for (const s of [-1, 1]) b.box('chrome', .022, .024, .12, [s * (wide(z) * .997 + .006), deck(z) - .115, Z(z)], 0, .008);
}

const CARS = {
  saloon: { L: 4.55, W: 1.78, H: 1.45, base: 2.7, front: .9, r: .32, tw: .2, clear: .18, deck: [[0, .7], [.12, .77], [1.4, .95], [3.9, 1], [4.55, .96]], cab: [1.42, 2.1, 3.25, 4], pillars: [2.75], seams: [1.5, 2.75, 3.62], handles: [2.62, 3.5] },
  hatch: { L: 4.05, W: 1.74, H: 1.48, base: 2.55, front: .84, r: .31, tw: .195, clear: .17, deck: [[0, .71], [.12, .78], [1.27, .96], [3.9, 1.02], [4.05, 1]], cab: [1.29, 1.94, 3.4, 3.97], pillars: [2.6], seams: [1.38, 2.6, 3.36], handles: [2.47, 3.24] },
  estate: { L: 4.75, W: 1.8, H: 1.47, base: 2.78, front: .9, r: .32, tw: .2, clear: .18, deck: [[0, .7], [.12, .77], [1.4, .95], [4.6, 1], [4.75, .98]], cab: [1.42, 2.1, 4.28, 4.68], pillars: [2.75, 3.72], seams: [1.5, 2.75, 3.66], handles: [2.62, 3.54] },
  sports: { L: 4.35, W: 1.86, H: 1.25, base: 2.56, front: .9, r: .335, tw: .25, clear: .13, gap: .045, tumble: .17, deck: [[0, .56], [.3, .72], [.9, .84], [1.5, .87], [3.6, .93], [4.35, .86]], cab: [1.6, 2.38, 2.9, 3.9], seams: [1.7, 2.86], handles: [2.72], spoiler: true },
  van: { L: 4.95, W: 1.92, H: 1.98, base: 3.1, front: .92, r: .34, tw: .21, clear: .2, tumble: .07, deck: [[0, .8], [.15, .95], [.78, 1.14], [4.95, 1.17]], cab: [.8, 1.4, 4.9, 4.94], glass: [.95, 2.3], pillars: [], seams: [1.36, 2.3, 3.5], handles: [2.18, 2.42], lamp: 'box' },
  pickup: { L: 5.25, W: 1.88, H: 1.78, base: 3.3, front: .94, r: .39, tw: .25, clear: .26, tumble: .1, lugs: 22, deck: [[0, 1], [.2, 1.1], [1.45, 1.22], [5.25, 1.27]], cab: [1.47, 2.02, 3, 3.12], tub: [3.22, 5.17, .9], seams: [1.56, 2.92], handles: [2.78], lamp: 'box' },
  jeep: { L: 3.45, W: 1.6, H: 1.05, base: 2.05, front: .64, r: .37, tw: .19, clear: .25, lugs: 20, soft: .025, deck: [[0, .96], [.05, 1.02], [1.3, 1.05], [1.42, 1.05], [1.52, .82], [2, .82], [2.12, 1.02], [3.45, 1.02]], tub: [1.3, 3.38, .42],
    plan: [[0, .93], [.15, .98], [.4, 1], [3.2, 1], [3.45, .97]], bumper: 'dark', grille: false, open: true },
};
/** A car: saloon, hatch, estate, sports, van, pickup, jeep. */
export function car(o = {}) {
  const style = CARS[o.style] ? o.style : 'saloon', c = CARS[style], b = new Shape(), L = c.L, zf = c.front, zr = c.front + c.base;
  const sh = shell(b, { ...c, axles: [zf, zr], step: .09 / (o.detail || 1) }), { Z, deck, wide, wheelX } = sh;
  ends(b, sh, c); doors(b, sh, c.seams || [], c.handles || []);
  const points = {}, spares = [];
  if (!c.open) {   // mirrors at the foot of the screen, an exhaust
    for (const s of [-1, 1]) { const z = c.cab[0] + .2, x = wide(z); b.box('paint', .16, .1, .06, [s * (x + .1), deck(z) + .07, Z(z)], [0, s * .25, 0], .025).box('dark', .08, .03, .03, [s * (x + .03), deck(z) + .04, Z(z)]); }
    b.bar('chrome', [.42, c.clear + .04, Z(L - .3)], [.42, c.clear + .04, Z(L + .04)], .026);
  }
  if (c.spoiler) { const y = deck(L - .12) + .13; b.box('paint', c.W * .84, .022, .2, [0, y, Z(L - .16)], [-.12, 0, 0], .01); for (const s of [-1, 1]) b.box('paint', .03, .13, .12, [s * c.W * .3, y - .06, Z(L - .14)]); }
  if (c.open) {   // a jeep: a flat screen in a frame, seats, a wheel to steer with, a hoop, a spare
    const zs = 1.3, y0 = 1.05, y1 = 1.68, lean = .2, zt = zs + lean, w = c.W / 2 - .06;
    b.box('screen', w * 2 - .06, hypot(y1 - y0, lean) - .06, .012, [0, (y0 + y1) / 2, Z((zs + zt) / 2)], [atan(lean, y1 - y0), 0, 0]);
    for (const s of [-1, 1]) b.bar('paint', [s * w, y0 - .04, Z(zs)], [s * w, y1, Z(zt)], .022, 6);
    b.bar('paint', [-w, y1, Z(zt)], [w, y1, Z(zt)], .022, 6).bar('paint', [-w, y0 + .02, Z(zs + .006)], [w, y0 + .02, Z(zs + .006)], .022, 6);
    for (const s of [-1, 1]) { b.box('seat', .46, .1, .46, [s * .36, .56, Z(1.95)], 0, .03).box('seat', .46, .5, .09, [s * .36, .83, Z(2.2)], [.14, 0, 0], .03); }
    b.box('seat', 1.1, .1, .4, [0, .6, Z(2.95)], 0, .03).box('seat', 1.1, .42, .08, [0, .86, Z(3.18)], [.1, 0, 0], .03);
    b.ring('dark', .17, .014, [-.36, .98, Z(1.62)], [-.5, 0, 0]).bar('dark', [-.36, .98, Z(1.62)], [-.36, .78, Z(1.36)], .014, 6);
    for (const s of [-1, 1]) b.bar('dark', [s * (w - .02), 1, Z(2.42)], [s * (w - .02), 1.6, Z(2.5)], .024, 6); b.bar('dark', [-(w - .02), 1.6, Z(2.5)], [w - .02, 1.6, Z(2.5)], .024, 6);
    for (let i = 0; i < 7; i++) b.box('dark', .035, .26, .02, [(i - 3) * .075, .8, Z(-.004)]);
    spares.push({ at: [.28, .86, Z(L + .12)], rot: [0, PI / 2, 0] });
    Object.assign(points, { driver: [-.36, .61, Z(1.98)], passenger: [.36, .61, Z(1.98)] });
  } else Object.assign(points, { driver: [-.37, c.clear + .32, Z(lerp(c.cab[1], c.cab[2], .3) + .25)], passenger: [.37, c.clear + .32, Z(lerp(c.cab[1], c.cab[2], .3) + .25)] });
  const wg = { r: c.r, w: c.tw, lugs: c.lugs || 0, seg: round(clamp(24 * (o.detail || 1), 12, 32)) }, wheels = [];
  for (const [z, steer] of [[zf, true], [zr, false]]) for (const s of [-1, 1]) wheels.push({ at: [s * wheelX(z), c.r, Z(z)], steer, geo: wg });
  for (const sp of spares) sp.geo = wg;
  Object.assign(points, { exhaust: [.42, c.clear + .04, Z(L + .05)], lampL: [-(wide(0) - .19), deck(0) - .13, Z(-.05)], lampR: [wide(0) - .19, deck(0) - .13, Z(-.05)], hitch: [0, c.clear + .2, Z(L + .08)] });
  const bx = b.bounds();
  return { kind: 'car', style, body: b, wheels, spares, points, size: { length: bx.l, width: bx.w, height: bx.hi[1] }, wheelbase: c.base, track: wheelX(zf) * 2, radius: c.r, clear: c.clear, mid: (zf + zr) / 2 - L / 2 };
}
const atan = (a, b) => Math.atan2(a, b);

// a lorry's loads: what stands on its frame behind the cab, from z0 to z1 at height y (the frame's top)
export const LOADS = {
  // a flat bed of planks with boards round it
  flat(b, Z, z0, z1, y, W, o) {
    const l = z1 - z0, zc = Z((z0 + z1) / 2), hw = W / 2, bh = o.boards ?? .45;
    b.box('wood', W, .09, l, [0, y + .045, zc]);
    for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) b.box('wood', .035, bh / 3 - .012, l - .02, [s * (hw - .018), y + .09 + (i + .5) * bh / 3, zc]); for (let q = 0; q <= 3; q++) b.box('iron', .02, bh + .06, .06, [s * (hw + .004), y + .09 + bh / 2, Z(lerp(z0 + .08, z1 - .08, q / 3))]); }
    for (let i = 0; i < 3; i++) b.box('wood', W - .04, bh / 3 - .012, .035, [0, y + .09 + (i + .5) * bh / 3, Z(z1 - .018)]);
    b.box('wood', W, bh + .35, .05, [0, y + .09 + (bh + .35) / 2, Z(z0 + .025)]);
    return y + .09 + bh + .35;
  },
  // the same under a canvas tilt on hoops: it sags a little between them
  canvas(b, Z, z0, z1, y, W, o) {
    LOADS.flat(b, Z, z0, z1, y, W, { boards: .5 });
    const hw = W / 2 + .02, y0 = y + .55, h = 1.45, n = 14, hoop = (z1 - z0 - .1) / round((z1 - z0) / 1.1), rings = [];
    for (const z of stations(z0 + .03, z1 - .03, hoop / 6)) {
      const sag = 1 - .028 * abs(sin((z - z0 - .05) / hoop * PI)), r = [];
      for (let i = 0; i <= n; i++) { const t = i / n * PI, c = cos(t), q = sin(t); r.push([hw * Math.sign(c) * abs(c) ** .45 * (1 - (1 - sag) * q), y0 + h * q ** .55 * sag, Z(z)]); }
      r.push([-hw + .02, y0, Z(z)], [hw - .02, y0, Z(z)]); rings.push(r);
    }
    b.skin(rings, { slot: (i, j) => j >= n ? null : 'canvas', capA: 'canvas', capB: 'canvas', crease: .9 });
    return y0 + h;
  },
  // a box body with doors at the back
  box(b, Z, z0, z1, y, W) {
    const hw = W / 2 + .04, h = 2.25, ring = z => [[-hw, y + .02, Z(z)], [hw, y + .02, Z(z)], [hw, y + h, Z(z)], [-hw, y + h, Z(z)]];
    b.skin(stations(z0, z1, .6).map(ring), { slot: 'paint2', round: .05, capA: 'paint2', capB: 'paint2' });
    b.box('dark', .008, h - .16, .004, [0, y + h / 2, Z(z1 + .002)]); for (const s of [-1, 1]) { b.box('chrome', .03, .5, .02, [s * .12, y + h * .45, Z(z1 + .01)]); for (const q of [.2, .8]) b.box('iron', .08, .03, .02, [s * (hw - .08), y + h * q, Z(z1 + .01)]); }
    for (const q of [.25, .75]) for (const s of [-1, 1]) b.box('paint2', .02, h - .1, .05, [s * (hw + .008), y + h / 2, Z(lerp(z0, z1, q))]);
    return y + h;
  },
  // a tank on saddles, with a walkway and hatches on top
  tanker(b, Z, z0, z1, y, W) {
    const rx = W / 2 - .02, ry = .82, cy = y + ry + .12, l = z1 - z0, rings = [], n = 20;
    for (const z of stations(z0 + .05, z1 - .05, .25, [z0 + .09, z0 + .16, z0 + .3, z1 - .09, z1 - .16, z1 - .3])) {
      const e = min(z - z0 - .05, z1 - .05 - z), k = e < .32 ? sqrt(max(.02, 1 - (1 - e / .32) ** 2)) : 1, r = [];
      for (let i = 0; i < n; i++) { const t = i / n * PI * 2; r.push([rx * k * cos(t), cy + ry * k * sin(t), Z(z)]); }
      rings.push(r);
    }
    b.skin(rings, { slot: 'paint2', capA: 'paint2', capB: 'paint2', crease: 1 });
    for (const q of [.14, .5, .86]) { b.box('under', W * .8, .14, .16, [0, y + .07, Z(lerp(z0, z1, q))]); b.cyl('steel', .16, .16, .09, [0, cy + ry + .03, Z(lerp(z0, z1, q))], 0, 14); }
    b.box('iron', .5, .025, l - .7, [0, cy + ry + .012, Z((z0 + z1) / 2)]);
    for (const s of [-1, 1]) { b.bar('iron', [s * .16, y, Z(z1 + .06)], [s * .16, cy + ry, Z(z1 - .12)], .014, 6); b.box('steel', .1, .1, l - .6, [s * (rx - .12), y + .08, Z((z0 + z1) / 2)]); }
    for (let i = 0; i < 6; i++) b.bar('iron', [-.16, y + .12 + i * .28, Z(z1 + .06 - i * .033)], [.16, y + .12 + i * .28, Z(z1 + .06 - i * .033)], .011, 6);
    return cy + ry + .08;
  },
};
/** A lorry: a cab with a bonnet on a frame, carrying a flat bed, a canvas tilt, a box or a tank; axles: 2 or 3. */
export function truck(o = {}) {
  const style = LOADS[o.style] ? o.style : 'flat', b = new Shape(), three = o.axles === 3, L = three ? 8.1 : 7.4, at = -L / 2, W = 2.3, r = .48, tw = .27, clear = .42, Lc = 2.45, zf = .8;
  const sh = shell(b, { L: Lc, W: W - .08, H: 2.5, clear, r, tw, at, tumble: .06, gap: .075, deck: [[0, 1.3], [.08, 1.42], [1.15, 1.55], [Lc, 1.58]], cab: [1.17, 1.44, 2.4, 2.44], axles: [zf],
    plan: [[0, .88], [.2, .95], [.9, 1], [Lc, 1]], step: .09 / (o.detail || 1), lift: .1 }), { Z, deck, wide, wheelX } = sh;
  ends(b, sh, { L: Lc, clear, bumper: 'dark', rear: false, bars: 9, lampR: .1, lampY: .2, by: .22 });
  doors(b, sh, [1.3, 2.28], [2.14]);
  for (const s of [-1, 1]) {   // mirrors on arms, steps, the frame's rails
    b.bar('dark', [s * wide(1.3), 1.75, Z(1.34)], [s * (wide(1.3) + .2), 1.85, Z(1.3)], .012, 6).box('dark', .03, .3, .16, [s * (wide(1.3) + .21), 1.85, Z(1.3)], 0, .01);
    b.box('under', .2, .03, .45, [s * (wide(1.8) + .02), clear + .05, Z(1.8)]);
    b.box('under', .1, .26, L - .55, [s * .43, .87, Z(.35 + (L - .55) / 2)]);
  }
  for (let i = 0; i < 6; i++) b.box('under', .86, .1, .08, [0, .85, Z(lerp(.6, L - .3, i / 5))]);
  const y = 1.02, z0 = Lc + .12, z1 = L - .05, zr = three ? [5.35, 6.6] : [5.55], top = LOADS[style](b, Z, z0, z1, y, W + .1, o);
  b.box('under', W + .1, .06, .1, [0, y - .03, Z(z0 + .05)]).box('under', W + .1, .06, .1, [0, y - .03, Z(z1 - .05)]);
  // a fuel tank, a stack, the back axles with their guards and lamps
  b.cyl('steel', .24, .24, .95, [.86, .72, Z(3.25)], [PI / 2, 0, 0], 16); for (const q of [-.3, .3]) b.ring('iron', .245, .012, [.86, .72, Z(3.25 + q)], [0, 0, 0], PI * 2, 16);
  b.box('under', .5, .4, .6, [-.84, .72, Z(3.2)], 0, .03);
  b.bar('iron', [-.95, .9, Z(Lc + .06)], [-.95, 2.75, Z(Lc + .06)], .05, 10).bar('iron', [-.95, 1.3, Z(Lc + .06)], [-.95, 2.1, Z(Lc + .06)], .085, 10);
  const wheels = [], fw = { r, w: tw, rim: .58, lugs: o.offroad ? 22 : 0, hub: '#8f9499', nuts: 8, seg: round(clamp(24 * (o.detail || 1), 12, 32)) }, rw = { ...fw, w: .58, dual: true };
  for (const s of [-1, 1]) wheels.push({ at: [s * wheelX(zf), r, Z(zf)], steer: true, geo: fw });
  for (const z of zr) {
    for (const s of [-1, 1]) { wheels.push({ at: [s * (W / 2 - .27), r, Z(z)], geo: rw });
      b.box('under', .64, .03, .62, [s * (W / 2 - .27), 2 * r + .035, Z(z)]); for (const q of [-1, 1]) b.box('under', .64, .03, .4, [s * (W / 2 - .27), 2 * r - .095, Z(z + q * .46)], [q * .75, 0, 0]); }
    b.bar('under', [-W / 2 + .5, r, Z(z)], [W / 2 - .5, r, Z(z)], .07, 8).ball('under', .2, [0, r, Z(z)], [1, 1, 1.1], 10);
  }
  b.bar('under', [-.6, r, Z(zf)], [.6, r, Z(zf)], .05, 8);
  for (const s of [-1, 1]) b.box('tail', .14, .1, .04, [s * (W / 2 - .2), y - .14, Z(L - .02)], 0, .01);
  b.box('plate', .4, .1, .012, [.4, y - .14, Z(L - .02)]).box('under', W, .1, .08, [0, .58, Z(L - .06)]);
  const points = { driver: [-.5, 1.22, Z(1.9)], passenger: [.5, 1.22, Z(1.9)], exhaust: [-.95, 2.78, Z(Lc + .06)], load: [0, y + .1, Z((z0 + z1) / 2)], hitch: [0, .7, Z(L)], lampL: [-(wide(0) - .21), deck(0) - .2, Z(-.05)], lampR: [wide(0) - .21, deck(0) - .2, Z(-.05)] };
  const bx = b.bounds();
  return { kind: 'truck', style, body: b, wheels, points, size: { length: bx.l, width: bx.w, height: bx.hi[1] }, wheelbase: zr[0] - zf, track: wheelX(zf) * 2, radius: r, clear, mid: (zf + zr[0]) / 2 - L / 2 };
}

const TANKS = {
  light: { L: 4.6, W: 2.4, top: 1.32, tw: .32, n: 4, rw: .31, tr: .74, th: .5, gun: [2.1, .036], e: .75 },
  medium: { L: 5.9, W: 2.95, top: 1.5, tw: .44, n: 5, rw: .345, tr: .96, th: .62, gun: [3.3, .05], e: .7 },
  heavy: { L: 6.9, W: 3.55, top: 1.7, tw: .62, n: 6, rw: .39, tr: 1.16, th: .76, gun: [4.7, .066], e: .4 },
};
/** A tank: light, medium, heavy. Its hull between two tracks, a turret that turns, a gun that lifts. */
export function tank(o = {}) {
  const style = TANKS[o.style] ? o.style : 'medium', c = TANKS[style], b = new Shape(), { L, W, top, tw, n, rw, tr, th } = c, at = -L / 2, Z = z => at + z, tk = .05, hw = W / 2;
  // the track's run, seen from the side: round the idler at the back, forward along the top, round the sprocket, back along the ground
  const yw = rw + tk, sp = [.52, rw * 2.02 + tk, rw * .92], id = [L - .52, rw * 1.85 + tk, rw * .82], z1 = .52 + rw * 1.75, z2 = L - .52 - rw * 1.6, road = Array.from({ length: n }, (_, i) => lerp(z1, z2, i / (n - 1)));
  const run = belt([[id[0], id[1], id[2] + tk / 2], [sp[0], sp[1], sp[2] + tk / 2], [road[0], yw, rw + tk / 2], [road[n - 1], yw, rw + tk / 2]]);
  const ys = sp[1] + sp[2] + tk + .07, xi = hw - tw - .07, clr = rw * 1.25, ny = top * .62;
  const yb = line([[0, ny - .05], [.6, clr], [L - .5, clr], [L, clr + .34]], .04), yt = line([[0, ny + .05], [.98, top], [L - 1, top], [L, top - .2]], .04);
  const ring = z => { const t = yt(z), q = smooth(0, .22, t - ys), xo = lerp(xi, hw - .02, q), y1 = min(ys, t - .02); const h = [[0, yb(z)], [xi, yb(z)], [xi, y1], [xo, y1 + .001], [xo, t - .03], [xo - .03, t], [0, t]]; const r = h.map(([x, y]) => [x, y, Z(z)]); for (let j = h.length - 2; j >= 1; j--) r.push([-h[j][0], h[j][1], Z(z)]); return r; };
  b.skin(stations(0, L, .2, [.6, .98, L - 1, L - .5]).map(ring), { capA: 'paint', capB: 'paint', crease: .5 });
  // on the hull: hatches, a lamp, hooks, engine grilles, exhausts, boxes on the guards, rollers under the top run
  const zc = L * .47;
  for (const s of [-1, 1]) {
    b.box('iron', .1, .12, .1, [s * (xi - .2), ny - .02, Z(.0)], [.5, 0, 0]).cyl('iron', .06, .06, .5, [s * (xi - .05), top - .06, Z(L - .2)], [PI / 2 - .25, 0, 0], 10);
    b.box('paint', tw * .7, .2, .7, [s * (hw - tw * .45), top + .1, Z(L * .62 + s * .3)], 0, .02).box('dark', xi * .62, .012, .7, [s * xi * .5, top + .004, Z(L - 1.5)]);
    for (let i = 0; i < 3; i++) b.cyl('iron', .11, .11, tw * .5, [s * (hw - tw / 2 - .03), sp[1] + sp[2] - .11 - .02 * i, Z(lerp(road[0] + .4, road[n - 1] - .2, i / 2))], [0, 0, PI / 2], 10);
  }
  b.cyl('paint', .27, .27, .03, [-xi * .45, lerp(ny, top, .78) + .03, Z(.8)], [-atan(top - ny, .98) + PI / 2 - PI / 2, 0, 0], 16);
  b.cyl('lamp', .075, .075, .08, [xi * .7, lerp(ny, top, .55) + .1, Z(.5)], [PI / 2, 0, 0], 12).box('iron', .2, .02, .12, [xi * .7, lerp(ny, top, .55) + .19, Z(.5)]);
  for (let i = 0; i < 4; i++) b.box('iron', tw * .8, .03, .13, [-.15 + i * .001, lerp(ny, top, .32 + i * .11) + .03, Z(.98 * (.32 + i * .11))], [-atan(top - ny, .98), 0, 0]);
  b.ring('paint', tr * .96, .05, [0, top + .02, Z(zc)]);
  // the turret: rounder at the front, a bustle behind; its gun on a mantlet
  const T = new Shape(), bf = tr * 1.02, bb = tr * (c.e < .5 ? 1.5 : 1.3), m = 28, e = c.e;
  const loop = (k, y) => Array.from({ length: m }, (_, i) => { const t = i / m * PI * 2, cs = cos(t), sn = sin(t); return [tr * k * Math.sign(cs) * abs(cs) ** e, y, (sn > 0 ? bb : bf) * k * Math.sign(sn) * abs(sn) ** e]; });
  T.skin([loop(.9, .02), loop(1, th * .22), loop(.97, th * .72), loop(.86, th * .96), loop(.8, th)], { capB: 'paint', capA: 'paint', crease: .6 });
  T.cyl('paint', .28, .3, .17, [tr * .42, th + .085, tr * .22], 0, 14).cyl('iron', .22, .22, .03, [tr * .42, th + .18, tr * .22], 0, 14).cyl('paint', .22, .22, .02, [-tr * .42, th + .01, tr * .2], 0, 14);
  T.box('paint', tr * 1.5, th * .5, .34, [0, th * .5, bb + .12], 0, .03).bar('iron', [-tr * .62, th, bb * .7], [-tr * .62, th + 1.7, bb * .74], .008, 5);
  T.bar('iron', [tr * .42, th + .2, tr * .22 - .25], [tr * .42, th + .3, tr * .22 - .95], .016, 6).box('iron', .05, .1, .22, [tr * .42, th + .22, tr * .22 - .2]);
  const G = new Shape(), [gl, cal] = c.gun, gy = th * .46;
  G.box('paint', tr * .78, th * .58, .36, [0, 0, -.06], 0, .08).bar('steel', [0, 0, -.1], [0, 0, -gl], cal * 1.7, 12, cal * 1.3).cyl('steel', cal * 2.3, cal * 2.3, .28, [0, 0, -gl + .06], [PI / 2, 0, 0], 12).cyl('steel', cal * 2, cal * 2, .4, [0, 0, -gl * .55], [PI / 2, 0, 0], 12);
  G.cyl('dark', cal * .95, cal * .95, .02, [0, 0, -gl - .082], [PI / 2, 0, 0], 10).bar('iron', [tr * .26, .04, -.2], [tr * .26, .04, -.75], .014, 6);
  const wheels = [];
  for (const z of road) wheels.push({ z: Z(z), y: yw, r: rw }); wheels.push({ z: Z(sp[0]), y: sp[1], r: sp[2] }, { z: Z(id[0]), y: id[1], r: id[2] });
  return { kind: 'tank', style, body: b, wheels: [],
    parts: { turret: { shape: T, at: [0, top + .02, Z(zc)] }, gun: { shape: G, at: [0, gy, -bf * .96], on: 'turret' } },
    tracks: { run, at, x: hw - tw / 2 - .03, pitch: .15, link: { w: tw, t: tk }, wheels, wheel: { r: rw, w: tw * .78, rim: .86, nuts: 8, seg: 20 } },
    points: { muzzle: { at: [0, 0, -gl - .1], on: 'gun' }, commander: { at: [tr * .42, th + .2, tr * .22], on: 'turret' }, driver: [-xi * .45, top, Z(.95)], exhaust: [0, top + .1, Z(L - .1)] },
    size: { length: L, width: W, height: top + th + .2 }, radius: rw, gun: gl };
}

export const KINDS = { car: Object.keys(CARS), truck: Object.keys(LOADS), tank: ['medium', 'light', 'heavy'] };
export const MAKERS = { car, truck, tank };
