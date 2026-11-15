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
    inside = 'paint', paint = 'paint', capA = paint, capB = paint, crown = 1, panels = [] } = p;
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
  for (const d of panels) must.push(d.z0, d.z1);
  if (tub) must.push(tub[0], tub[0] + .012, tub[1] - .012, tub[1]);
  const Z = stations(0, L, step, must, .025), mid = i => (Z[i] + Z[i + 1]) / 2, rd = [0, 0, 0, .03, 0, .03, .045, .05, 0, 0];
  const sideGlass = z => glass && z > glass[0] && z < glass[1] && fCab(z) > .25 && !pillars.some(q => abs(z - q) < .035);
  const screen = z => cab && ((z > cab[0] + .03 && z < cab[1] - .03) || (z > cab[2] + .03 && z < cab[3] - .03));
  b.skin(Z.map(ring), {
    round: [...rd, ...rd.slice(1, 9).reverse()], capA, capB,
    slot: (i, j) => { const s = j <= 8 ? j : 17 - j, z = mid(i), slot = s <= 2 ? 'under' : s === 5 ? (sideGlass(z) ? 'glass' : paint) : s >= 7 ? (inTub(z) ? inside : screen(z) ? 'glass' : paint) : paint; return panelOf(panels, z, s, j <= 8 ? 1 : -1, slot); },
  });
  // how far out the side is at height y (along the side's own corners, from the sill up to the roof's edge)
  const sideAt = (z, y) => { const h = half(z); if (y <= h[3][1]) return h[3][0]; for (let j = 3; j < 7; j++) { const a = h[j], c = h[j + 1]; if (y <= c[1]) return c[1] > a[1] ? lerp(a[0], c[0], (y - a[1]) / (c[1] - a[1])) : c[0]; } return h[7][0]; };
  return { half, Z: z => at + z, deck: fDeck, floor: fFloor, wide: z => hw * fPlan(z), wheelX: z => hw * fPlan(z) * .965 - .03 - tw / 2, cabin: fCab, sideAt, panels };
}
// a door's share of a skin: the pieces of the side (from the sill to the roof's edge: s 3..6) between its shut lines go to
// a part of its own, named 'door|slot' while skinning and then taken out of the body by apart()
function panelOf(panels, z, s, side, slot) {
  if (!slot || s < 3 || s > 6) return slot;
  for (const d of panels) if (d.side === side && z > d.z0 && z < d.z1) return d.name + '|' + slot;
  return slot;
}
// what was skinned as 'door|slot' out of a shape and into each door's own (its own space is the vehicle's: the door is hung in place)
function apart(b, into) {
  for (const [key, l] of [...b.slots]) { const k = key.indexOf('|'); if (k < 0) continue; b.slots.delete(key); const name = key.slice(0, k); for (const g of l) (into[name] ||= new Shape()).put(key.slice(k + 1), g); }
  return into;
}

/**
 * A band laid along both sides from z0 to z1 (the shell's own z, nose 0) between heights y0 and y1 (numbers, or
 * functions of z), a few millimetres proud of the paint: a livery's stripe, a row of windows. gaps: [[za, zb], ...]
 * left bare (pillars between panes, a wheel arch), each side of each gap its own piece.
 */
export function band(b, sh, slot, z0, z1, y0, y1, { gaps = [], out = .004, step = .12, sides = [-1, 1] } = {}) {
  const Y0 = typeof y0 === 'function' ? y0 : () => y0, Y1 = typeof y1 === 'function' ? y1 : () => y1;
  const runs = []; let a = z0;
  for (const [ga, gb] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (gb <= a || ga >= z1) continue; if (ga > a + .01) runs.push([a, ga]); a = max(a, gb); }
  if (z1 > a + .01) runs.push([a, z1]);
  // (on a car whose doors open, each door's share of the band goes with the door)
  const hung = sh.hung, doorsOn = hung ? sh.panels : [];
  for (const s of sides) for (const [ra, rb] of runs.flatMap(([ra, rb]) => { const cut = [ra, ...doorsOn.filter(d => d.side === s).flatMap(d => [d.z0, d.z1]).filter(z => z > ra + .01 && z < rb - .01).sort((p, q) => p - q), rb]; return cut.slice(1).map((z, i) => [cut[i], z]); })) {
    const zm0 = (ra + rb) / 2, door = doorsOn.find(d => d.side === s && zm0 > d.z0 && zm0 < d.z1), into = door ? hung[door.name] ||= new Shape() : b;
    // (in strips one above another, broken where the side bends, so the band lies on it and not through it)
    const zm = (ra + rb) / 2, lo0 = Y0(zm), hi0 = Y1(zm), cuts = [0, ...sh.half(zm).slice(3, 8).map(p => (p[1] - lo0) / (hi0 - lo0)).filter(f => f > .02 && f < .98), 1].sort((p, q) => p - q);
    for (let k = 0; k < cuts.length - 1; k++) {
      const rows = stations(ra, rb, step).map(z => { const lo = Y0(z), hi = Y1(z), ya = lerp(lo, hi, cuts[k]), yb = lerp(lo, hi, cuts[k + 1]); return [[s * (sh.sideAt(z, yb) + out), yb, sh.Z(z)], [s * (sh.sideAt(z, ya) + out), ya, sh.Z(z)]]; });
      into.ribbon(slot, rows, [s, 0, 0]);
    }
  }
}
/**
 * A light bar across a roof (w wide at [x, y, z]): a dark base, two lenses that flash (beaconA left, beaconB
 * right), chrome ends. Returns the points the lamps light from (for the plan's beacons).
 */
export function lightBar(b, w, at, { d = .26, h = .1, tilt = 0 } = {}) {
  const [x, y, z] = at, lw = w / 2 - .06;
  b.box('dark', w, .05, d, [x, y + .025, z], [tilt, 0, 0], .02);
  for (const s of [-1, 1]) {
    b.box(s < 0 ? 'beaconA' : 'beaconB', lw, h, d - .04, [x + s * (lw / 2 + .02), y + .05 + h / 2, z], [tilt, 0, 0], .03);
    b.box('chrome', .03, h + .01, d - .02, [x + s * (w / 2 - .02), y + .05 + h / 2, z], [tilt, 0, 0], .01);
  }
  return [{ at: [x - w / 4, y + .05 + h / 2, z], slot: 'beaconA' }, { at: [x + w / 4, y + .05 + h / 2, z], slot: 'beaconB' }];
}

// what every road vehicle carries on its ends: bumpers, lamps, a grille, plates
function ends(b, sh, { L, clear, lamp = 'round', bumper = 'chrome', grille = true, lampY = .13, tail = [.2, .09], rear = true, bars = 4, lampR = .082, by = .26 }) {
  const { Z, deck, wide } = sh, w0 = wide(.02), w1 = wide(L - .02), y0 = deck(0), y1 = deck(L), k = lampR / .082;
  // (on a car whose doors open, its bumpers and their plates are parts too, so a crash can knock them loose: hung.bumperF, bumperR)
  const H = sh.hung && sh.panels?.length ? sh.hung : null, F = H && bumper ? H.bumperF = new Shape() : b, Bk = H && bumper ? H.bumperR = new Shape() : b;
  if (bumper) { F.box(bumper, w0 * 2 + .08, .11 * k, .13 * k, [0, clear + by, Z(-.005)], 0, .045); if (rear) Bk.box(bumper, w1 * 2 + .08, .11, .13, [0, clear + by + .01, Z(L + .005)], 0, .045); }
  F.box('plate', .4, .1, .012, [0, clear + by, Z(-.01 - .065 * k)]); if (rear) Bk.box('plate', .4, .1, .012, [0, clear + by + .01, Z(L + .075)]);
  if (H && bumper) { H.bumperAt = [[0, clear + by, Z(-.005)], [0, clear + by + .01, Z(L + .005)], w0 * 2 + .08, w1 * 2 + .08]; if (!rear) delete H.bumperR; }
  if (grille) { const gw = w0 * 2 - .62 * k, gh = .037 * bars, gy = y0 - lampY - .01 - (bars - 4) * .018; b.box('dark', gw, gh + .002, .03, [0, gy, Z(-.008)], 0, .01); for (let i = 0; i < bars; i++) b.box('chrome', gw - .02, .012, .012, [0, gy - gh / 2 + .019 + i * .037, Z(-.026)]); }
  for (const s of [-1, 1]) {
    const x = s * (w0 - .11 - lampR), y = y0 - lampY;
    if (lamp === 'round') { b.cyl('lamp', lampR, lampR, .05, [x, y, Z(-.012)], [PI / 2, 0, 0], 20); b.ring('chrome', lampR + .004, .012, [x, y, Z(-.036)], [0, 0, 0]); }
    else b.box('lamp', .24, .1, .05, [s * (w0 - .2), y, Z(-.008)], 0, .02);
    if (rear) b.box('tail', tail[0], tail[1], .04, [s * (w1 - tail[0] / 2 - .06), y1 - .13, Z(L + .004)], 0, .012);
  }
}
// the lines where doors shut, and their handles
function doors(b, sh, seams, handles = [], hung = {}) {
  const { half, Z, deck, wide, panels } = sh, on = (z, s) => { const d = panels.find(d => d.side === s && z > d.z0 && z < d.z1); return d ? hung[d.name] ||= new Shape() : b; };
  for (const z of seams) { const h = half(z), a = [lerp(h[3][0], h[4][0], .12), lerp(h[3][1], h[4][1], .12)], c = [lerp(h[4][0], h[5][0], .82), lerp(h[4][1], h[5][1], .82)];
    for (const s of [-1, 1]) { b.strip('dark', [s * (a[0] + .001), a[1], Z(z)], [s * (h[4][0] + .001), h[4][1], Z(z)], .008, .004).strip('dark', [s * (h[4][0] + .001), h[4][1], Z(z)], [s * (c[0] + .001), c[1], Z(z)], .008, .004); } }
  for (const z of handles) for (const s of [-1, 1]) on(z, s).box('chrome', .022, .024, .12, [s * (wide(z) * .997 + .006), deck(z) - .115, Z(z)], 0, .008);
}

// a shape's triangles turned to face the other way (inside out): the lining seen from within
function inward(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (const a of [p, n]) for (let i = 0; i < a.length; i += 9) for (let c = 0; c < 3; c++) { const t = a[i + 3 + c]; a[i + 3 + c] = a[i + 6 + c]; a[i + 6 + c] = t; }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}
/**
 * What is inside a closed car, for its see-through glass: a lining just inside the shell (door cards below the
 * glass, the pillars, a headliner under the roof, a wall at each end), a carpeted floor, a dashboard with its
 * dials and a screen, the wheel on its column, a console with a gear lever, seats with headrests (a bench at the
 * back when there is room; a van has a wall behind its two), a mirror. Slots: lining, liner, carpet, dash,
 * dials, seat. hip: the seat's height and its place along the car (the driver point's).
 */
function cabin(b, sh, c, style, hip, hung = {}) {
  const { half, Z, deck, wide, wheelX, cabin: fCab, panels } = sh, cab = c.cab, z0 = cab[0] + .02, z1 = cab[3] - .03;
  const glass = c.glass || [cab[0] + .12, cab[3] - .1], pillars = c.pillars || [];
  const sideGlass = z => z > glass[0] && z < glass[1] && fCab(z) > .25 && !pillars.some(q => abs(z - q) < .035);
  const screen = z => (z > cab[0] + .03 && z < cab[1] - .03) || (z > cab[2] + .03 && z < cab[3] - .03);
  // the lining: the shell's own sections drawn 5 cm in, facing inwards, open where the glass is
  const ring = z => {
    const h = half(z), y0 = h[0][1], y1 = h[9][1], cy = (y0 + y1) / 2, ky = max(.5, 1 - .1 / max(.2, y1 - y0)), kx = max(.5, 1 - .05 / max(.3, h[4][0]));
    const r = h.map(([x, y]) => [x * kx, cy + (y - cy) * ky, Z(z)]); for (let j = h.length - 2; j >= 1; j--) r.push([-r[j][0], r[j][1], Z(z)]); return r;
  };
  const must = [cab[1], cab[2], glass[0], glass[1], ...pillars.flatMap(q => [q - .035, q + .035]), cab[0] + .03, cab[1] - .03, cab[2] + .03, cab[3] - .03, ...panels.flatMap(d => [d.z0, d.z1].filter(z => z > z0 && z < z1))];
  const Zs = stations(z0, z1, .1, must, .02), mid = i => (Zs[i] + Zs[i + 1]) / 2, I = new Shape();
  // (the door cards below the glass go with their doors)
  I.skin(Zs.map(ring), { capA: 'lining', capB: 'lining', crease: .6,
    slot: (i, j) => { const s = j <= 8 ? j : 17 - j, z = mid(i), slot = s <= 2 ? null : s === 5 ? (sideGlass(z) ? null : 'lining') : s >= 7 ? (screen(z) ? null : 'liner') : s === 6 ? 'liner' : 'lining'; return s < 6 ? panelOf(panels, z, s, j <= 8 ? 1 : -1, slot) : slot; } });
  for (const [s, l] of I.slots) { const k = s.indexOf('|'); for (const g of l) (k < 0 ? b : hung[s.slice(0, k)] ||= new Shape()).put(k < 0 ? s : s.slice(k + 1), inward(g)); }
  // each door's edges, closing its skin to its card: front, back and along the sill (from the sill to the foot of the glass)
  for (const d of panels) {
    const D = hung[d.name] ||= new Shape(), at = z => { const h = half(z), r = ring(z); return [3, 4, 5].map(j => [[d.side * h[j][0], h[j][1], Z(z)], [d.side * r[j][0], r[j][1], Z(z)]]); };
    D.ribbon('paint', at(d.z0 + .003), [0, 0, -1]).ribbon('paint', at(d.z1 - .003), [0, 0, 1]);
    D.ribbon('paint', stations(d.z0 + .003, d.z1 - .003, .1).map(z => at(z)[0]), [0, -1, 0]);
  }
  // the floor, a little above the underside
  const fy = c.clear + .15, fw = min(wide(z0), wide(z1)) * 1.9 - .14;
  b.box('carpet', fw, .04, z1 - z0, [0, fy - .02, Z((z0 + z1) / 2)]);
  // the dashboard under the foot of the screen, its lip towards the seats, the dials in their hood, a screen in the middle
  const zd = cab[0], yd = deck(zd + .15) - .035, dw = wide(zd + .3) * 1.86 - .12, dd = .58, x = -.37;
  b.box('dash', dw, .3, dd, [0, yd - .15, Z(zd + dd / 2)], 0, .05).box('dash', dw - .04, .1, .14, [0, yd - .27, Z(zd + dd + .03)], [-.35, 0, 0], .03);
  b.box('dash', .38, .07, .16, [x, yd + .01, Z(zd + dd - .1)], [.1, 0, 0], .025);
  for (const dx of [-.075, .075]) b.cyl('dials', .052, .052, .012, [x + dx, yd - .045, Z(zd + dd + .004)], [PI / 2 - .25, 0, 0], 16);
  b.box('dials', .2, .12, .012, [0, yd - .1, Z(zd + dd + .006)], [-.2, 0, 0]);
  // the wheel on its column, before the driver's chest
  // (the wheel is a part of its own that turns as the car steers: hung.steering, on its pivot, tilted .42 back)
  const hy = hip[1], hz = hip[2] - Z(0), wz = hz - .5, wy = hy + .39, Wh = hung.steering = new Shape();
  Wh.ring('dash', .185, .017, [0, 0, 0], 0, PI * 2, 28).box('dash', .07, .06, .04, [0, 0, .015], 0, .015);
  for (const a of [PI / 2, PI * 7 / 6, PI * 11 / 6]) Wh.bar('dash', [0, 0, .01], [cos(a) * .18, sin(a) * .18, .01], .011, 5);
  hung.wheelAt = [x, wy, Z(wz)];
  b.bar('dash', [x, wy, Z(wz + .02)], [x, wy - .14, Z(zd + dd - .05)], .03, 8);
  // a console between the front seats, its lever
  const zc0 = zd + dd - .05, zc1 = hz + .05;
  if (zc1 > zc0 + .2) { b.box('dash', .2, .26, zc1 - zc0, [0, fy + .13, Z((zc0 + zc1) / 2)], 0, .04); b.bar('dash', [0, fy + .26, Z(zc0 + .2)], [0, fy + .4, Z(zc0 + .17)], .008, 5).ball('dash', .022, [0, fy + .41, Z(zc0 + .17)], [1, 1, 1], 8); }
  // the seats: a cushion with its front up a little, a back leaning back, a headrest; the roof says how tall
  const roof = c.H - .09, tall = clamp((roof - hy - .1) / .72, .62, 1);
  const seat = (sx, w, z, rest = true) => {
    b.box('seat', w, .13, .5, [sx, hy - .06, Z(z - .2)], [.08, 0, 0], .045);
    b.box('seat', w, .62 * tall, .12, [sx, hy + .27 * tall, Z(z + .1)], [.2, 0, 0], .05);
    if (rest) b.box('seat', min(.27, w * .55), .17, .1, [sx, hy + .64 * tall, Z(z + .1 + .64 * tall * .2)], [.2, 0, 0], .04);
  };
  for (const s of [-1, 1]) seat(s * .37, .5, hz);
  if (style === 'van') b.box('lining', wide(hz + .45) * 1.9 - .12, c.H - c.clear - .25, .04, [0, c.clear + .15 + (c.H - c.clear - .25) / 2, Z(hz + .45)]);
  else if (cab[2] - cab[1] > 1.1) {   // a bench behind, between the back wheels' arches
    const zr = hz + .88, bw = min(wide(zr) * .9 - .12, wheelX(c.front + c.base) - c.tw / 2 - .06) * 2;
    if (zr + .25 < cab[3]) { seat(0, bw, zr, false); for (const s of [-1, 1]) b.box('seat', .25, .16, .1, [s * bw * .3, hy + .64 * tall, Z(zr + .23)], [.2, 0, 0], .04); }
  }
  // the mirror under the top of the screen
  const ym = c.H - .14; b.box('dash', .23, .065, .03, [0, ym, Z(cab[1] + .1)], [.15, 0, 0], .012).bar('dash', [0, ym + .03, Z(cab[1] + .1)], [0, c.H - .07, Z(cab[1] + .14)], .008, 5);
}

const CARS = {
  saloon: { L: 4.55, W: 1.78, H: 1.45, base: 2.7, front: .9, r: .32, tw: .2, clear: .18, deck: [[0, .7], [.12, .77], [1.4, .95], [3.9, 1], [4.55, .96]], cab: [1.42, 2.1, 3.25, 4], pillars: [2.75], seams: [1.5, 2.75, 3.62], handles: [2.62, 3.5] },
  hatch: { L: 4.05, W: 1.74, H: 1.48, base: 2.55, front: .84, r: .31, tw: .195, clear: .17, deck: [[0, .71], [.12, .78], [1.27, .96], [3.9, 1.02], [4.05, 1]], cab: [1.29, 1.94, 3.4, 3.97], pillars: [2.6], seams: [1.38, 2.6, 3.36], handles: [2.47, 3.24] },
  estate: { L: 4.75, W: 1.8, H: 1.47, base: 2.78, front: .9, r: .32, tw: .2, clear: .18, deck: [[0, .7], [.12, .77], [1.4, .95], [4.6, 1], [4.75, .98]], cab: [1.42, 2.1, 4.28, 4.68], pillars: [2.75, 3.72], seams: [1.5, 2.75, 3.66], handles: [2.62, 3.54] },
  sports: { L: 4.35, W: 1.86, H: 1.25, base: 2.56, front: .9, r: .335, tw: .25, clear: .13, gap: .045, tumble: .17, deck: [[0, .56], [.3, .72], [.9, .84], [1.5, .87], [3.6, .93], [4.35, .86]], cab: [1.6, 2.38, 2.9, 3.9], seams: [1.7, 2.86], handles: [2.72], spoiler: true },
  van: { L: 4.95, W: 1.92, H: 1.98, base: 3.1, front: .92, r: .34, tw: .21, clear: .2, tumble: .07, deck: [[0, .8], [.15, .95], [.78, 1.14], [4.95, 1.17]], cab: [.8, 1.4, 4.9, 4.94], glass: [.95, 2.3], pillars: [], seams: [1.36, 2.3, 3.5], handles: [2.18, 2.42], slide: true, lamp: 'box' },
  pickup: { L: 5.25, W: 1.88, H: 1.78, base: 3.3, front: .94, r: .39, tw: .25, clear: .26, tumble: .1, lugs: 22, deck: [[0, 1], [.2, 1.1], [1.45, 1.22], [5.25, 1.27]], cab: [1.47, 2.02, 3, 3.12], tub: [3.22, 5.17, .9], seams: [1.56, 2.92], handles: [2.78], lamp: 'box' },
  jeep: { L: 3.45, W: 1.6, H: 1.05, base: 2.05, front: .64, r: .37, tw: .19, clear: .25, lugs: 20, soft: .025, deck: [[0, .96], [.05, 1.02], [1.3, 1.05], [1.42, 1.05], [1.52, .82], [2, .82], [2.12, 1.02], [3.45, 1.02]], tub: [1.3, 3.38, .42],
    plan: [[0, .93], [.15, .98], [.4, 1], [3.2, 1], [3.45, .97]], bumper: 'dark', grille: false, open: true },
};
// the cars that work for the city: a saloon in a police livery with a light bar and a push bar, a taxi with its sign, a
// high-roofed van as an ambulance (their colours, a band's in trim, are the kind's own: vehicles.js LOOKS)
CARS.police = { ...CARS.saloon, livery: 'police' };
CARS.taxi = { ...CARS.saloon, livery: 'taxi' };
CARS.ambulance = { ...CARS.van, H: 2.5, cab: [.8, 1.32, 4.9, 4.94], deck: [[0, .8], [.15, .95], [.78, 1.16], [4.95, 1.2]], livery: 'ambulance', seams: [1.36, 2.3, 4.2], handles: [2.18, 2.42] };
/** A car: saloon, hatch, estate, sports, van, pickup, jeep; police, taxi, ambulance. */
export function car(o = {}) {
  const style = CARS[o.style] ? o.style : 'saloon', c = CARS[style], b = new Shape(), L = c.L, zf = c.front, zr = c.front + c.base;
  // its doors, each a part on its hinge at its front edge (a van's back door slides): one a side for each handle, between the shut lines either side of it
  const panels = c.open || o.doors === false ? [] : (c.handles || []).flatMap((hz, k) => [-1, 1].map(side => ({ name: (k ? 'back' : 'door') + (side < 0 ? 'L' : 'R'), side, z0: c.seams[k], z1: c.seams[k + 1], slide: k > 0 && c.slide })));
  const sh = shell(b, { ...c, axles: [zf, zr], step: .09 / (o.detail || 1), panels }), { Z, deck, wide, wheelX, half } = sh, hung = sh.hung = apart(b, {});
  ends(b, sh, c); doors(b, sh, c.seams || [], c.handles || [], hung);
  const points = {}, spares = [], beacons = livery(b, sh, c, zf, zr);
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
  } else {   // (a long cabin's seats stay near the screen: a van's are not halfway down it)
    const hz = min(lerp(c.cab[1], c.cab[2], .3) + .25, c.cab[1] + .85);
    Object.assign(points, { driver: [-.37, c.clear + .32, Z(hz)], passenger: [.37, c.clear + .32, Z(hz)] });
    if ((c.handles || []).length > 1 && !c.slide && c.cab[2] - c.cab[1] > 1.1) for (const sd of [-1, 1]) points[sd < 0 ? 'backL' : 'backR'] = [sd * .37, c.clear + .32, Z(hz + .88)];   // (the bench behind, by the back doors)
    if (o.inside !== false) cabin(b, sh, c, style, points.driver, hung);
  }
  // the parts: the doors hung in place on their hinges (their shapes in the car's own space), the steering wheel on its column
  const parts = {}, doorList = [];
  for (const d of panels) {
    if (!hung[d.name]) continue;
    const h = half(d.z0 + .02), y = (h[3][1] + h[6][1]) / 2;
    parts[d.name] = { shape: hung[d.name], at: [d.side * (h[4][0] + .004), y, Z(d.z0)], inPlace: true };
    doorList.push({ name: d.name, side: d.side, slide: !!d.slide, length: d.z1 - d.z0, z: [Z(d.z0), Z(d.z1)] });
  }
  if (hung.steering) parts.steering = { shape: hung.steering, at: hung.wheelAt, rot: [-.42, 0, 0] };
  if (hung.bumperF) parts.bumperF = { shape: hung.bumperF, at: hung.bumperAt[0], inPlace: true };
  if (hung.bumperR) parts.bumperR = { shape: hung.bumperR, at: hung.bumperAt[1], inPlace: true };
  const wg = { r: c.r, w: c.tw, lugs: c.lugs || 0, seg: round(clamp(24 * (o.detail || 1), 12, 32)) }, wheels = [];
  for (const [z, steer] of [[zf, true], [zr, false]]) for (const s of [-1, 1]) wheels.push({ at: [s * wheelX(z), c.r, Z(z)], steer, geo: wg });
  for (const sp of spares) sp.geo = wg;
  Object.assign(points, { exhaust: [.42, c.clear + .04, Z(L + .05)], lampL: [-(wide(0) - .19), deck(0) - .13, Z(-.05)], lampR: [wide(0) - .19, deck(0) - .13, Z(-.05)], hitch: [0, c.clear + .2, Z(L + .08)] });
  const bx = b.bounds();
  beacons.forEach((q, i) => { points['beacon' + i] = q.at; });
  return { kind: 'car', style, parts, doors: doorList, inside: !c.open && o.inside !== false, screen: c.open ? null : [deck(c.cab[0] + .04) + .03, Z(c.cab[0] + .05)], body: b, wheels, spares, points, beacons, size: { length: bx.l, width: bx.w, height: bx.hi[1] }, wheelbase: c.base, track: wheelX(zf) * 2, radius: c.r, clear: c.clear, mid: (zf + zr) / 2 - L / 2 };
}
// a working car's livery and lamps (c.livery): bands along its sides in its trim colour, a light bar, a taxi's sign; returns its flashing lamps
function livery(b, sh, c, zf, zr) {
  const beacons = []; if (!c.livery) return beacons;
  const { Z, deck } = sh, L = c.L, Ra = c.r + (c.gap ?? .065) + .03, arches = [[zf - Ra, zf + Ra], [zr - Ra, zr + Ra]], roofZ = c.cab[1] + .38;
  if (c.livery === 'police') {
    band(b, sh, 'paint2', .1, L - .08, z => deck(z) - .33, z => deck(z) - .14, { gaps: arches });
    band(b, sh, 'plate', .1, L - .08, z => deck(z) - .355, z => deck(z) - .335, { gaps: arches });
    beacons.push(...lightBar(b, 1.18, [0, c.H - .012, Z(roofZ)]));
    b.box('dark', .95, .07, .07, [0, c.clear + .52, Z(-.2)], 0, .02).box('dark', .95, .07, .07, [0, c.clear + .3, Z(-.2)], 0, .02);   // (a push bar)
    for (const s of [-1, 1]) b.bar('dark', [s * .4, c.clear + .26, Z(-.2)], [s * .4, c.clear + .58, Z(-.2)], .03, 6).bar('dark', [s * .4, c.clear + .3, Z(-.2)], [s * .4, c.clear + .3, Z(.05)], .025, 6);
  } else if (c.livery === 'taxi') {
    b.box('dark', .52, .03, .16, [0, c.H - .005, Z(roofZ)], 0, .01).box('sign', .48, .14, .13, [0, c.H + .08, Z(roofZ)], 0, .04);
    band(b, sh, 'dark', .3, L - .3, z => deck(z) - .22, z => deck(z) - .16, { gaps: arches });
  } else if (c.livery === 'ambulance') {
    band(b, sh, 'paint2', .05, L - .05, z => deck(z) - .4, z => deck(z) - .16, { gaps: arches });
    band(b, sh, 'paint2', (c.glass?.[1] ?? c.cab[1]) + .08, L - .1, c.H - .42, c.H - .3);
    beacons.push(...lightBar(b, 1.3, [0, c.H - .01, Z(c.cab[1] + .2)]));
    for (const s of [-1, 1]) { b.box(s < 0 ? 'beaconA' : 'beaconB', .16, .12, .1, [s * (c.W / 2 - .14), c.H + .04, Z(L - .12)], 0, .03); beacons.push({ at: [s * (c.W / 2 - .14), c.H + .04, Z(L - .12)], slot: s < 0 ? 'beaconA' : 'beaconB' }); }
  }
  return beacons;
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
  // a fire engine's body: lockers behind roller shutters down each side, a deck on top with hose reels, and a ladder on a
  // turntable at the back that turns and lifts (parts turntable and ladder: aim(turn, lift)), resting forward over the cab
  fire(b, Z, z0, z1, y, W, o, more) {
    const hw = W / 2, h = 1.7, l = z1 - z0, zc = Z((z0 + z1) / 2), top = y + h;
    b.box('paint', W, h, l, [0, y + h / 2, zc], 0, .04);
    const lockers = 3, lw = (l - .3) / lockers;
    for (const s of [-1, 1]) for (let i = 0; i < lockers; i++) {
      const za = z0 + .15 + i * lw, zm = Z(za + lw / 2), sw = lw - .12, sh = h - .3;
      b.box('steel', .02, sh, sw, [s * (hw + .006), y + .15 + sh / 2, zm]);
      for (let k = 0; k < 15; k++) b.box('dark', .006, .008, sw - .02, [s * (hw + .018), y + .2 + k * (sh - .1) / 14, zm]);
      b.box('chrome', .03, .03, .22, [s * (hw + .03), y + .24, zm]);
    }
    b.box('paint2', W + .02, .14, l + .02, [0, y + h - .28, zc]);   // (a white band round the body)
    b.box('dark', W - .1, .05, l - .1, [0, top + .025, zc]);
    for (const s of [-1, 1]) { b.bar('chrome', [s * (hw - .05), top + .05, Z(z0 + .1)], [s * (hw - .05), top + .05, Z(z1 - .1)], .02, 6); for (let q = 0; q <= 6; q++) b.bar('chrome', [s * (hw - .05), top, Z(lerp(z0 + .1, z1 - .1, q / 6))], [s * (hw - .05), top + .3, Z(lerp(z0 + .1, z1 - .1, q / 6))], .015, 5); }
    for (const s of [-1, 1]) { b.cyl('dark', .32, .32, .22, [s * (hw - .35), top + .38, Z(z0 + .55)], [0, 0, PI / 2], 18); b.cyl('steel', .12, .12, .26, [s * (hw - .35), top + .38, Z(z0 + .55)], [0, 0, PI / 2], 12); }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.box('steel', .5, .04, .2, [s * (hw - .3), y - .1 - k * .2, Z(z1 - .1)]);   // (steps up the back)
    // the ladder: rails and rungs, eight metres, on a turntable over the back axles
    const T = new Shape(), Lad = new Shape(), ll = 6.6, lw2 = .44;
    T.cyl('steel', .55, .6, .22, [0, .11, 0], 0, 24).box('paint', .7, .32, .8, [0, .38, 0], 0, .06).box('dark', .2, .6, .2, [.45, .3, .2], 0, .03);
    for (const s of [-1, 1]) { Lad.box('steel', .05, .18, ll, [s * lw2 / 2, 0, -ll / 2 + .4]); Lad.box('chrome', .03, .03, ll, [s * lw2 / 2, .12, -ll / 2 + .4]); }
    for (let i = 0; i < 21; i++) Lad.bar('steel', [-lw2 / 2, .02, .2 - i * .3], [lw2 / 2, .02, .2 - i * .3], .016, 6);
    Lad.box('paint', .6, .25, .5, [0, -.05, .45], 0, .05);
    more.parts.turntable = { shape: T, at: [0, top + .05, Z(z1 - .9)] };
    more.parts.ladder = { shape: Lad, at: [0, .62, 0], on: 'turntable' };
    more.points.tip = { at: [0, .25, -ll + .5], on: 'ladder' }; more.points.hose = [hw, y + .3, Z(z1)];
    more.aim = { turn: 'turntable', lift: 'ladder', lo: 0, hi: 1.25 };
    for (const s of [-1, 1]) { b.box(s < 0 ? 'beaconA' : 'beaconB', .14, .14, .1, [s * (hw - .08), top + .07, Z(z1 - .05)], 0, .03); more.beacons.push({ at: [s * (hw - .08), top + .07, Z(z1 - .05)], slot: s < 0 ? 'beaconA' : 'beaconB' }); }
    return top + .7;
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
  const style = LOADS[o.style] ? o.style : 'flat', fire = style === 'fire', b = new Shape(), three = o.axles === 3 || (fire && o.axles !== 2), L = three ? 8.1 : 7.4, at = -L / 2, W = 2.3, r = .48, tw = .27, clear = .42, Lc = fire ? 3.25 : 2.45, zf = .8;
  // (a fire engine's cab seats its crew behind the driver: four doors, the glass broken by a pillar between them)
  const sh = shell(b, { L: Lc, W: W - .08, H: 2.5, clear, r, tw, at, tumble: .06, gap: .075, deck: [[0, 1.3], [.08, 1.42], [1.15, 1.55], [Lc, 1.58]], cab: fire ? [1.17, 1.44, 3.2, 3.24] : [1.17, 1.44, 2.4, 2.44], axles: [zf],
    plan: [[0, .88], [.2, .95], [.9, 1], [Lc, 1]], step: .09 / (o.detail || 1), lift: .1, ...(fire ? { pillars: [2.32], glass: [1.29, 3.12] } : {}) }), { Z, deck, wide, wheelX } = sh;
  ends(b, sh, { L: Lc, clear, bumper: 'dark', rear: false, bars: 9, lampR: .1, lampY: .2, by: .22 });
  doors(b, sh, fire ? [1.3, 2.28, 3.16] : [1.3, 2.28], fire ? [2.14, 3.02] : [2.14]);
  for (const s of [-1, 1]) {   // mirrors on arms, steps, the frame's rails
    b.bar('dark', [s * wide(1.3), 1.75, Z(1.34)], [s * (wide(1.3) + .2), 1.85, Z(1.3)], .012, 6).box('dark', .03, .3, .16, [s * (wide(1.3) + .21), 1.85, Z(1.3)], 0, .01);
    b.box('under', .2, .03, .45, [s * (wide(1.8) + .02), clear + .05, Z(1.8)]);
    b.box('under', .1, .26, L - .55, [s * .43, .87, Z(.35 + (L - .55) / 2)]);
  }
  for (let i = 0; i < 6; i++) b.box('under', .86, .1, .08, [0, .85, Z(lerp(.6, L - .3, i / 5))]);
  const y = 1.02, z0 = Lc + .12, z1 = L - .05, zr = three ? [5.35, 6.6] : [5.55], more = { parts: {}, points: {}, beacons: [] }, top = LOADS[style](b, Z, z0, z1, y, W + .1, o, more);
  if (fire) {   // its light bar, a white band along the cab, the crew's seats
    more.beacons.push(...lightBar(b, 1.6, [0, 2.49, Z(1.75)]));
    band(b, sh, 'paint2', .05, Lc - .03, z => deck(z) - .5, z => deck(z) - .36, { gaps: [[zf - r - .14, zf + r + .14]] });
    Object.assign(more.points, { crewL: [-.5, 1.22, Z(2.85)], crewR: [.5, 1.22, Z(2.85)] });
  }
  b.box('under', W + .1, .06, .1, [0, y - .03, Z(z0 + .05)]).box('under', W + .1, .06, .1, [0, y - .03, Z(z1 - .05)]);
  // a fuel tank, a stack, the back axles with their guards and lamps
  b.cyl('steel', .24, .24, .95, [.86, .72, Z(3.25)], [PI / 2, 0, 0], 16); for (const q of [-.3, .3]) b.ring('iron', .245, .012, [.86, .72, Z(3.25 + q)], [0, 0, 0], PI * 2, 16);
  b.box('under', .5, .4, .6, [-.84, .72, Z(3.2)], 0, .03);
  if (!fire) b.bar('iron', [-.95, .9, Z(Lc + .06)], [-.95, 2.75, Z(Lc + .06)], .05, 10).bar('iron', [-.95, 1.3, Z(Lc + .06)], [-.95, 2.1, Z(Lc + .06)], .085, 10);
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
  const points = { driver: [-.5, 1.22, Z(1.9)], passenger: [.5, 1.22, Z(1.9)], exhaust: fire ? [-.9, .5, Z(L - .3)] : [-.95, 2.78, Z(Lc + .06)], load: [0, y + .1, Z((z0 + z1) / 2)], hitch: [0, .7, Z(L)], lampL: [-(wide(0) - .21), deck(0) - .2, Z(-.05)], lampR: [wide(0) - .21, deck(0) - .2, Z(-.05)], ...more.points };
  more.beacons.forEach((q, i) => { points['beacon' + i] = q.at; });
  const bx = b.bounds(), parts = Object.keys(more.parts).length ? more.parts : undefined;
  return { kind: 'truck', style, screen: [deck(1.21) + .03, Z(1.22)], body: b, wheels, points, parts, beacons: more.beacons, ...(more.aim ? { aim: more.aim } : {}), size: { length: bx.l, width: bx.w, height: max(bx.hi[1], top) }, wheelbase: zr[0] - zf, track: wheelX(zf) * 2, radius: r, clear, mid: (zf + zr[0]) / 2 - L / 2 };
}

// buses: a box on four wheels (twin tyres behind), rows of windows, doors on the kerb side (side: 'left' puts them on the left)
const BUSES = {
  city: { L: 11.4, W: 2.5, H: 3.05, base: 5.9, front: 2.55, r: .5, clear: .3, rows: [[1.18, 2.62]], doors: [[.28, 1.42], [5.15, 6.3]], cool: true },
  double: { L: 10.6, W: 2.5, H: 4.35, base: 5.6, front: 2.4, r: .5, clear: .3, rows: [[1.12, 2.02], [2.56, 3.88]], doors: [[.28, 1.38]], between: [2.16, 2.42] },
  coach: { L: 12.2, W: 2.5, H: 3.55, base: 6.5, front: 2.75, r: .5, clear: .4, rows: [[1.9, 3.18]], doors: [[.32, 1.36]], bays: true },
};
/** A bus: city (one deck, two doors), double (two decks), coach (luggage under the floor). */
export function bus(o = {}) {
  const style = BUSES[o.style] ? o.style : 'city', c = BUSES[style], b = new Shape(), { L, W, H, r, clear } = c, zf = c.front, zr = c.front + c.base, tw = .3;
  const sh = shell(b, { L, W, H, clear, r, tw, gap: .07, tumble: .02, soft: .05, axles: [zf, zr], step: .14 / (o.detail || 1), lift: .03,
    deck: [[0, H - .32], [.06, H - .1], [.24, H], [L - .2, H], [L, H - .1]], plan: [[0, .955], [.12, .99], [.4, 1], [L - .3, 1], [L, .975]] }), { Z, wide, wheelX } = sh;
  const kerb = o.side === 'left' ? -1 : 1, doorGaps = c.doors.map(([a, z]) => [a - .02, z + .02]);
  // the windows: panes with pillars between, each row the length of the bus; on the kerb side broken for the doors
  for (const [y0, y1] of c.rows) {
    const pillars = [], n = Math.round((L - .9) / 1.22); for (let i = 1; i < n; i++) { const z = .45 + i * (L - .9) / n; pillars.push([z - .055, z + .055]); }
    band(b, sh, 'glass', .45, L - .45, y0, y1, { gaps: pillars, sides: [-kerb] });
    band(b, sh, 'glass', .45, L - .45, y0, y1, { gaps: [...pillars, ...(y0 < 2 ? doorGaps : [])], sides: [kerb] });
  }
  // the doors: tall glass in two leaves, down to the step
  for (const [a, z] of c.doors) { band(b, sh, 'glass', a + .04, z - .04, clear + .32, c.rows[0][1] - .02, { sides: [kerb], out: .006 }); band(b, sh, 'dark', (a + z) / 2 - .015, (a + z) / 2 + .015, clear + .32, c.rows[0][1] - .02, { sides: [kerb], out: .009, step: .03 }); }
  // its livery: a band in its trim colour (between the decks on a double, under the windows on the others), a skirt
  if (c.between) band(b, sh, 'paint2', .05, L - .05, c.between[0], c.between[1]);
  else band(b, sh, 'paint2', .05, L - .05, c.rows[0][0] - .3, c.rows[0][0] - .08, { gaps: doorGaps.map(g => kerb > 0 ? g : [0, 0]) });
  if (c.bays) for (const s of [-1, 1]) for (const zq of [zf + .9, (zf + zr) / 2, zr - .9]) b.box('dark', .01, .9, .012, [s * (wide(zq) + .004), clear + .7, Z(zq)]);
  // the front: its screen (two on a double), the sign over it, lamps, a bumper; the back: a window, tail lamps, a bumper
  const scr = c.between ? [[c.rows[0][0] - .1, c.rows[0][1] + .05], [c.rows[1][0], c.rows[1][1] - .05]] : [[1.0, H - .45]];
  for (const [y0, y1] of scr) b.box('glass', W - .26, y1 - y0, .02, [0, (y0 + y1) / 2, Z(-.006)], 0, .04);
  b.box('dark', W - .5, .26, .03, [0, H - .26, Z(-.008)], 0, .02).box('sign', W - .62, .18, .02, [0, H - .26, Z(-.022)], 0, .02);
  b.box('dark', W + .02, .3, .16, [0, clear + .28, Z(-.04)], 0, .05).box('dark', W + .02, .3, .16, [0, clear + .28, Z(L + .04)], 0, .05);
  for (const s of [-1, 1]) {
    b.box('lamp', .3, .14, .04, [s * (W / 2 - .3), clear + .62, Z(-.008)], 0, .03).box('lamp', .14, .1, .03, [s * (W / 2 - .58), clear + .62, Z(-.008)], 0, .02);
    b.box('tail', .16, .32, .04, [s * (W / 2 - .16), clear + .85, Z(L + .006)], 0, .02);
    // mirrors on arms that reach forward
    b.bar('dark', [s * (W / 2 - .05), H - .45, Z(.15)], [s * (W / 2 + .1), H - .35, Z(-.32)], .018, 6).box('dark', .05, .38, .2, [s * (W / 2 + .12), H - .62, Z(-.34)], 0, .02);
  }
  b.box('glass', W - .5, (c.between ? c.rows[1][1] - c.rows[1][0] : H - 1.6) - .1, .02, [0, c.between ? (c.rows[1][0] + c.rows[1][1]) / 2 : (1.4 + H - .35) / 2, Z(L + .006)], 0, .04);
  b.box('plate', .52, .11, .012, [0, clear + .5, Z(L + .01)]).box('plate', .52, .11, .012, [0, clear + .5, Z(-.13)]);
  if (c.cool) b.box('paint2', 1.4, .22, 2.4, [0, H + .1, Z(L * .42)], 0, .08);
  // the wheels: one tyre a side in front, twins behind
  const fw = { r, w: tw, rim: .6, hub: '#9a9fa4', nuts: 10, seg: round(clamp(24 * (o.detail || 1), 12, 32)) }, rw = { ...fw, w: .56, dual: true }, wheels = [];
  for (const s of [-1, 1]) wheels.push({ at: [s * wheelX(zf), r, Z(zf)], steer: true, geo: fw });
  for (const s of [-1, 1]) wheels.push({ at: [s * (W / 2 - .33), r, Z(zr)], geo: rw });
  const d0 = c.doors[0], points = { driver: [-kerb * .62, clear + .95, Z(1.15)], door: [kerb * (W / 2 + .45), 0, Z((d0[0] + d0[1]) / 2)], aisle: [0, clear + .45, Z(L / 2)], exhaust: [-kerb * .7, .3, Z(L + .05)], lampL: [-(W / 2 - .3), clear + .62, Z(-.05)], lampR: [W / 2 - .3, clear + .62, Z(-.05)], hitch: [0, clear + .2, Z(L + .1)] };
  c.doors.forEach(([a, z], i) => { points['door' + i] = [kerb * (W / 2 + .45), 0, Z((a + z) / 2)]; });
  const bx = b.bounds();
  return { kind: 'bus', style, screen: [1.0, Z(0)], body: b, wheels, points, size: { length: bx.l, width: bx.w, height: bx.hi[1] }, wheelbase: c.base, track: wheelX(zf) * 2, radius: r, clear, mid: (zf + zr) / 2 - L / 2 };
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

export const KINDS = { car: Object.keys(CARS), truck: Object.keys(LOADS), tank: ['medium', 'light', 'heavy'], bus: Object.keys(BUSES) };
export const MAKERS = { car, truck, tank, bus };
