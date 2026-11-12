// The railway shapes of gs.models.vehicle('train'): a steam engine with rods that work, its tender, a diesel,
// goods wagons (van, open, flat, tanker) and a coach. Each stands on the rail tops (y = 0) with its middle at
// z = 0 and its nose along -z; `length` is over its buffers, so cars set that far apart are coupled.
// Kit use only.
import { Shape, stations, lerp } from './vehicle-parts.js';
import { LOADS } from './vehicle-shapes.js';

const { PI, sin, cos, abs, min, max, round } = Math;
const BUF = 1, FLOOR = 1.12;   // buffers' height, a wagon's floor

// what every car has at an end: a beam, two buffers, a hook
function buffers(b, z, s, w = 2.6, slot = 'under') {
  b.box(slot, w, .3, .14, [0, BUF, z - s * .07]);
  for (const x of [-.86, .86]) b.cyl('iron', .065, .075, .38, [x, BUF, z + s * .19], [PI / 2, 0, 0], 10).cyl('iron', .2, .2, .045, [x, BUF, z + s * .4], [PI / 2, 0, 0], 16);
  b.box('iron', .06, .14, .22, [0, BUF - .02, z + s * .1]);
}
// a goods wagon's frame on two axles: solebars, axle guards, springs, steps
function frame(b, l, axles, r) {
  for (const s of [-1, 1]) {
    b.box('under', .12, .26, l, [s * .98, FLOOR - .13, 0]);
    for (const z of axles) { b.box('iron', .05, .5, .5, [s * 1.02, r + .12, z], 0).box('iron', .16, .2, .26, [s * 1.06, r, z], 0, .03); for (const q of [-1, 1]) b.box('iron', .07, .04, .5, [s * 1.04, r + .34, z + q * .28], [q * .16, 0, 0]); }
    buffers(b, s * l / 2, s);
  }
  for (let i = 0; i < 5; i++) b.box('under', 1.9, .2, .1, [0, FLOOR - .12, lerp(-l / 2 + .3, l / 2 - .3, i / 4)]);
  b.box('under', .1, .2, l - .4, [0, FLOOR - .12, 0]);
}
// a roof over a body: a low arch from side to side
function roof(b, slot, w, y, rise, z0, z1, over = .08, n = 12) {
  const ring = z => { const r = []; for (let i = 0; i <= n; i++) { const t = i / n * PI, c = cos(t); r.push([(w / 2 + over) * c, y + rise * sin(t) ** .8, z]); } r.push([-(w / 2 + over) + .02, y - .03, z], [w / 2 + over - .02, y - .03, z]); return r; };
  b.skin([z0 - over, z1 + over].map(ring), { slot, capA: slot, capB: slot, crease: .5 });
}

const WAGONS = {
  // a covered van: planked sides in a steel frame, a sliding door, a roof
  van(b, l) {
    const w = 2.7, h = 2.25, y = FLOOR;
    b.box('wood', w, h, l, [0, y + h / 2, 0]);
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 6; i++) b.box('iron', .03, h, .07, [s * (w / 2 + .012), y + h / 2, lerp(-l / 2 + .04, l / 2 - .04, i / 6)]);
      b.box('wood', .05, h - .2, 1.7, [s * (w / 2 + .035), y + h / 2 - .02, 0]).box('iron', .03, .05, 3.6, [s * (w / 2 + .05), y + h - .06, .85]).box('iron', .03, .05, 3.6, [s * (w / 2 + .05), y + .06, .85]);
      for (const q of [-.78, .78]) b.box('iron', .03, h - .2, .06, [s * (w / 2 + .065), y + h / 2 - .02, q]);
      b.box('iron', w, .07, .03, [0, y + h * .5, s * (l / 2 + .012)]); for (const x of [-1, 0, 1]) b.box('iron', .07, h, .03, [x * (w / 2 - .04), y + h / 2, s * (l / 2 + .012)]);
    }
    roof(b, 'paint2', w, y + h, .3, -l / 2, l / 2);
    return y + h + .3;
  },
  // an open wagon: plank sides, a door each side, empty
  open(b, l) {
    const w = 2.7, h = 1.25, y = FLOOR, t = .07;
    b.box('wood', w, .08, l, [0, y + .04, 0]);
    for (const s of [-1, 1]) {
      b.box('wood', t, h, l, [s * (w / 2 - t / 2), y + h / 2, 0]).box('wood', w - t * 2, h, t, [0, y + h / 2, s * (l / 2 - t / 2)]);
      for (let i = 0; i <= 6; i++) b.box('iron', .03, h + .04, .07, [s * (w / 2 + .012), y + h / 2, lerp(-l / 2 + .04, l / 2 - .04, i / 6)]);
      b.box('iron', .035, .06, l, [s * (w / 2 + .014), y + h - .03, 0]);
      for (const x of [-1, 1]) b.box('iron', .07, h, .03, [x * (w / 2 - .04), y + h / 2, s * (l / 2 + .012)]);
    }
    return y + h;
  },
  // a flat wagon with stakes
  flat(b, l) {
    const w = 2.7, y = FLOOR;
    b.box('wood', w, .1, l, [0, y + .05, 0]);
    for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) b.box('iron', .07, .95, .07, [s * (w / 2 - .035), y + .5, lerp(-l / 2 + .5, l / 2 - .5, i / 5)]); b.box('iron', w, .12, .1, [0, y + .16, s * l * .3]); }
    return y + 1;
  },
  // a tank wagon
  tanker(b, l) { return LOADS.tanker(b, z => z, -l / 2 + .25, l / 2 - .25, FLOOR - .02, 2.5); },
};

// a two-axle bogie under a long car: frames, springs, its two wheelsets' boxes
function bogie(b, z, r, wb = 2.5) {
  for (const s of [-1, 1]) { b.box('under', .1, .22, wb + 1, [s * 1.0, r + .12, z], 0, .03); for (const q of [-1, 1]) b.box('iron', .16, .2, .28, [s * 1.07, r, z + q * wb / 2], 0, .03); b.box('iron', .12, .2, .5, [s * 1.02, r + .32, z]); }
  b.box('under', 2, .16, .5, [0, r + .2, z]);
  return [z - wb / 2, z + wb / 2];
}
// a long body skinned along its length: straight sides that tuck in below, a roof arched from side to side; win(z): is there glass here
function carBody(b, { w, y0, y1, rise, z0, z1, belt = [.42, .78], win = null, band = null, slot = 'paint', must = [], endA = slot, endB = slot }) {
  const hw = w / 2, h = y1 - y0, yb = y0 + h * belt[0], yc = y0 + h * belt[1], n = 6;
  const ring = z => { const r = [[0, y0], [hw - .1, y0], [hw, y0 + .22], [hw, yb], [hw - .012, yc], [hw - .05, y1]]; for (let i = 1; i <= n; i++) { const t = i / n * PI / 2; r.push([(hw - .05) * cos(t), y1 + rise * sin(t)]); }
    const out = r.map(([x, y]) => [x, y, z]); for (let j = r.length - 2; j >= 1; j--) out.push([-r[j][0], r[j][1], z]); return out; };
  const Z = stations(z0, z1, 1.2, must, .05), N = 6 + n, rd = [0, .05, .03, 0, 0, .06]; for (let i = 0; i < n; i++) rd.push(0);
  b.skin(Z.map(ring), { round: [...rd, ...rd.slice(1, N - 1).reverse()], capA: endA, capB: endB, crease: .6,
    slot: (i, j) => { const q = j < N ? j : 2 * N - 3 - j, z = (Z[i] + Z[i + 1]) / 2; return q <= 1 ? 'under' : q === 3 && win && win(z) ? 'glass' : q === 2 && band ? band : q >= 5 ? 'paint2' : slot; } });
  return { yb, yc, hw };
}

/** One railway car as a plan: steam, tender, diesel, van, open, flat, tanker, coach. */
export function railcar(type, o = {}) {
  const b = new Shape(), gauge = o.gauge || 1.435, sets = [], points = {}, parts = {}; let length = 9.1, rods = null;
  if (WAGONS[type]) {
    const l = length - 1.1, r = .46, ax = [-2.5, 2.5];
    frame(b, l, ax, r); WAGONS[type](b, l);
    sets.push({ geo: { r, gauge }, at: ax.map(z => [r, z]) }); points.load = [0, FLOOR + .1, 0];
  } else if (type === 'coach') {
    length = 18.2; const l = length - 1.1, r = .46, z0 = -l / 2, z1 = l / 2, bays = 9, door = 1.15, bay = (l - door * 2 - .5) / bays, wz = i => z0 + door + .25 + bay * (i + .5);
    const must = []; for (let i = 0; i < bays; i++) must.push(wz(i) - bay * .36, wz(i) + bay * .36); for (const s of [-1, 1]) must.push(s * (l / 2 - .4), s * (l / 2 - .85));
    const win = z => { for (let i = 0; i < bays; i++) if (abs(z - wz(i)) < bay * .36) return true; return abs(abs(z) - (l / 2 - .625)) < .225; };
    const body = carBody(b, { w: 2.82, y0: FLOOR - .05, y1: 3.45, rise: .42, z0, z1, win, must, endA: 'dark', endB: 'dark' });
    for (const s of [-1, 1]) { buffers(b, s * l / 2, s); b.box('under', 2.3, .5, 2.4, [0, FLOOR - .3, s * 1.6]); b.box('dark', 1.1, 2.1, .1, [0, FLOOR + 1.05, s * (l / 2 + .04)]);
      for (const q of [-1, 1]) { b.strip('dark', [q * (body.hw + .002), FLOOR + .15, s * (l / 2 - .28)], [q * (body.hw + .002), body.yc, s * (l / 2 - .28)], .01, .004).strip('dark', [q * (body.hw + .002), FLOOR + .15, s * (l / 2 - .97)], [q * (body.hw + .002), body.yc, s * (l / 2 - .97)], .01, .004).box('chrome', .02, .2, .03, [q * (body.hw + .012), body.yb - .1, s * (l / 2 - .9)]); } }
    for (let i = 0; i < 5; i++) b.cyl('paint2', .12, .16, .1, [0, 3.45 + .44, lerp(z0 + 2, z1 - 2, i / 4)], 0, 10);
    for (const s of [-1, 1]) for (const z of bogie(b, s * (l / 2 - 2.9), r)) (sets[0] ||= { geo: { r, gauge }, at: [] }).at.push([r, z]);
    points.door = [1.5, FLOOR, l / 2 - .62];
  } else if (type === 'diesel') {
    length = 14.2; const l = length - 1.1, r = .5, z0 = -l / 2, z1 = l / 2, cab = 1.9;
    const must = [z0 + .25, z0 + cab - .3, z1 - .25, z1 - cab + .3, z0 + cab + .5, z1 - cab - .5];
    const win = z => abs(abs(z) - (l / 2 - cab / 2 - .0)) < cab / 2 - .3;
    const body = carBody(b, { w: 2.8, y0: FLOOR + .05, y1: 3.5, rise: .32, z0, z1, belt: [.5, .82], win, band: 'paint2', must });
    for (const s of [-1, 1]) {
      buffers(b, s * l / 2, s, 2.7, 'paint2');
      for (const q of [-1, 1]) b.box('glass', .95, .62, .02, [q * .6, lerp(body.yb, body.yc, .5) + .02, s * (l / 2 + .006)], 0, .05).box('lamp', .16, .16, .04, [q * .95, FLOOR + .55, s * (l / 2 + .012)], 0, .03).box('tail', .1, .1, .03, [q * .95, FLOOR + .32, s * (l / 2 + .01)], 0, .02);
      b.cyl('lamp', .11, .11, .05, [0, 3.5 + .1, s * (l / 2 - .06)], [PI / 2, 0, 0], 14);
      for (const q of [-1, 1]) { for (let i = 0; i < 4; i++) b.box('dark', .012, .5, 1.3, [q * (body.hw + .003), lerp(body.yb, body.yc, .5), s * (.85 + i * 1.45) * .62 + s * .2]); b.strip('dark', [q * (body.hw + .002), FLOOR + .3, s * (l / 2 - cab + .22)], [q * (body.hw + .002), body.yc, s * (l / 2 - cab + .22)], .01, .004); }
    }
    for (const z of [-2.2, 0, 2.2]) b.cyl('dark', .5, .5, .06, [0, 3.5 + .31, z], 0, 18).ring('iron', .5, .03, [0, 3.5 + .34, z], [PI / 2, 0, 0]);
    b.box('under', 2.3, .6, 3.4, [0, FLOOR - .32, 0], 0, .08);
    for (const s of [-1, 1]) for (const z of bogie(b, s * (l / 2 - 2.6), r, 2.7)) (sets[0] ||= { geo: { r, gauge }, at: [] }).at.push([r, z]);
    Object.assign(points, { driver: [-.6, FLOOR + .5, -l / 2 + 1], lampL: [-.95, FLOOR + .55, -l / 2 - .05], lampR: [.95, FLOOR + .55, -l / 2 - .05], exhaust: [0, 3.9, 0] });
  } else if (type === 'tender') {
    length = 7; const l = length - .9, r = .5, w = 2.7, y = 1.3, h = 1.5, ax = [-1.8, 0, 1.8];
    b.box('under', 2.3, .3, l, [0, y - .15, 0]).box('paint', w, h, l - .1, [0, y + h / 2, 0], 0, .05);
    for (const s of [-1, 1]) { b.box('paint', .06, .32, l - .5, [s * (w / 2 - .01), y + h + .1, .1], [0, 0, -s * .35]); for (const z of ax) b.box('iron', .16, .2, .28, [s * 1.1, r, z], 0, .03).box('under', .08, .5, .5, [s * 1.04, r + .2, z]); b.box('under', .1, .2, l - .3, [s * 1.04, r + .46, 0]); }
    b.box('paint', w - .1, .32, .06, [0, y + h + .1, l / 2 - .2], [.35, 0, 0]);
    // coal, heaped
    const m = 9, rings = []; for (let i = 0; i <= m; i++) { const z = lerp(-l / 2 + .5, l / 2 - 1.5, i / m), ring = []; for (let j = 0; j <= 8; j++) { const x = lerp(-w / 2 + .12, w / 2 - .12, j / 8), e = sin(i / m * PI) ** .5 * sin(j / 8 * PI) ** .5; ring.push([x, y + h - .08 + e * (.34 + .1 * sin(i * 2.3 + j * 1.7) + .06 * cos(i * 5.1 - j * 3.3)), z]); } rings.push(ring); }
    b.skin(rings, { slot: 'coal', open: true, crease: .2 });
    buffers(b, l / 2, 1); b.box('under', 2.5, .26, .12, [0, BUF, -l / 2 - .02]).box('iron', .1, .08, .6, [0, BUF - .05, -l / 2 - .3]);
    sets.push({ geo: { r, gauge }, at: ax.map(z => [r, z]) }); points.coal = [0, y + h + .3, -.5];
  } else if (type === 'steam') {
    length = 11.2; const r = .66, cr = .3, plate = 1.5, by = 2.3, br = .8, zf = -length / 2 + .55, drv = [-1.9, -.4, 1.1, 2.6], cab0 = 2.3, cab1 = 4.4, zr = length / 2 - .1;
    // frames and the running plate, the buffer beam in the trim colour
    for (const s of [-1, 1]) { b.box('under', .07, .75, zr - zf - .3, [s * .56, 1.05, (zf + zr) / 2]); b.box('iron', .5, .05, cab0 - zf, [s * 1.1, plate, (zf + cab0) / 2]).box('iron', .04, .14, cab0 - zf, [s * 1.33, plate - .08, (zf + cab0) / 2]); }
    buffers(b, zf, -1, 2.7, 'beam'); b.box('under', 2.5, .28, .12, [0, BUF, zr]).box('iron', .1, .08, .5, [0, BUF - .05, zr + .2]);
    // the boiler: a smokebox with its door, the barrel in bands, a firebox between the last wheels
    b.cyl('iron', br + .04, br + .04, 1.35, [0, by, zf + 1.05], [PI / 2, 0, 0], 28).lathe('iron', [[0, .16], [.3, .15], [.6, .07], [br - .06, 0], [br + .04, 0]], [0, by, zf + .375], [-PI / 2, 0, 0], 24);
    b.box('steel', .04, .04, 1.1, [0, by, zf + .2], [0, 0, 0]).cyl('steel', .03, .03, .5, [0, by, zf + .19], [0, 0, PI / 2], 6).box('iron', .5, .3, .5, [0, by - br - .12, zf + 1.05]);
    b.cyl('paint', br, br, cab0 - zf - 1.7, [0, by, (zf + 1.7 + cab0) / 2], [PI / 2, 0, 0], 28);
    for (let i = 0; i < 5; i++) b.cyl('steel', br + .012, br + .012, .05, [0, by, lerp(zf + 1.78, cab0 - 1.35, i / 4)], [PI / 2, 0, 0], 28, true);
    b.box('paint', 1.72, 1.7, 1.5, [0, by - .1, cab0 - .7], 0, .12).box('iron', 1.5, .5, 1.4, [0, 1.25, cab0 - .7]);
    // chimney, domes, valves, a whistle, a lamp
    b.lathe('iron', [[br * .42, -.12], [.26, .05], [.2, .35], [.21, .62], [.27, .68], [.27, .72], [.17, .72], [.17, .4]], [0, by + br, zf + .9], 0, 18);
    b.lathe('brass', [[.4, -.1], [.36, .1], [.34, .3], [.26, .44], [.1, .5], [0, .51]], [0, by + br - .04, -1.2], 0, 18).lathe('paint', [[.34, -.1], [.3, .12], [.24, .3], [.1, .37], [0, .38]], [0, by + br - .04, -2.9], 0, 16);
    for (const x of [-.12, .12]) b.cyl('brass', .045, .06, .3, [x, by + br + .75, cab0 - .8], 0, 8); b.cyl('brass', .03, .03, .25, [.3, by + br + .78, cab0 - .25], 0, 8);
    b.box('iron', .22, .26, .2, [0, by + br + .2, zf + .32], 0, .03).cyl('lamp', .08, .08, .03, [0, by + br + .2, zf + .21], [PI / 2, 0, 0], 12);
    for (const s of [-1, 1]) {   // handrails, cylinders, slide bars, steps
      b.bar('steel', [s * (br + .07), by + .3, zf + 1.8], [s * (br + .07), by + .3, cab0], .016, 6);
      b.cyl('paint', .32, .32, 1, [s * 1.1, r + .1, drv[0] - 1.75], [PI / 2, 0, 0], 16).cyl('steel', .34, .34, .05, [s * 1.1, r + .1, drv[0] - 2.27], [PI / 2, 0, 0], 16).box('paint', .5, .5, .7, [s * .86, r + .5, drv[0] - 1.75]);
      b.box('steel', .05, .05, 1.25, [s * 1.1, r + .22, drv[0] - .7]).box('steel', .05, .05, 1.25, [s * 1.1, r - .02, drv[0] - .7]).bar('steel', [s * 1.1, r + .1, drv[0] - 1.25], [s * 1.1, r + .1, drv[0] - .35], .03, 8);
      b.box('iron', .3, .03, .3, [s * 1.2, .55, zf + .3]).box('iron', .3, .03, .3, [s * 1.25, .5, cab0 + 1.3]).box('iron', .3, .03, .3, [s * 1.25, .95, cab0 + 1.3]);
      for (const z of drv) b.box('iron', .5, .04, 1.2, [s * 1.1, r * 2 + .1, z], [0, 0, 0]);   // splashers over the wheels
    }
    // the cab: its front with two round windows, sides with a window, an arched roof, open at the back
    const cw = 2.76, cy = plate, ch = 3.42;
    b.box('paint', cw, ch - cy, .05, [0, (cy + ch) / 2, cab0 + .025]);
    for (const s of [-1, 1]) { b.box('paint', .05, ch - cy, cab1 - cab0 - .55, [s * (cw / 2 - .025), (cy + ch) / 2, (cab0 + cab1 - .55) / 2]).box('glass', .02, .55, .75, [s * (cw / 2 + .004), cy + 1.45, cab0 + .75], 0).cyl('glass', .2, .2, .02, [s * .9, cy + 1.55, cab0 - .004], [PI / 2, 0, 0], 16); b.box('paint', .05, .95, .55, [s * (cw / 2 - .025), cy + .47, cab1 - .28]); }
    roof(b, 'iron', cw, ch, .3, cab0 - .1, cab1 + .15, .1);
    b.box('dark', cw - .12, ch - cy - .1, .04, [0, (cy + ch) / 2, cab0 + .5]).box('wood', cw - .1, .06, cab1 - cab0, [0, cy + .03, (cab0 + cab1) / 2]);
    // wheels: a carrying pair in front, four coupled pairs; the rods that join them
    sets.push({ geo: { r, gauge, spokes: 14, weight: 1.1, crank: cr / r }, at: drv.map(z => [r, z]) }, { geo: { r: .42, gauge, spokes: 10 }, at: [[.42, drv[0] - 1.75]] });
    const C = new Shape(), M = new Shape(), ml = drv[1] - (drv[0] - .55), x = gauge / 2 + .235;
    for (const s of [-1, 1]) { C.box('steel', .045, .13, drv[3] - drv[0] + .26, [s * x, 0, (drv[0] + drv[3]) / 2], 0, .02); for (const z of drv) C.cyl('steel', .1, .1, .06, [s * x, 0, z], [0, 0, PI / 2], 10);
      M.box('steel', .04, .12, ml, [s * (x + .06), 0, -ml / 2], 0, .02).cyl('steel', .09, .09, .05, [s * (x + .06), 0, 0], [0, 0, PI / 2], 10); }
    parts.rods = { shape: C, at: [0, r, 0] }; parts.mainRods = { shape: M, at: [0, r, drv[1]] };
    rods = { r, cr, y: r, z: drv[1], l: ml };
    Object.assign(points, { smoke: [0, by + br + .75, zf + .9], steam: [1.1, r + .1, drv[0] - 2.4], whistle: [.3, by + br + .95, cab0 - .25], driver: [.7, plate + .1, cab0 + 1.2], fire: [0, plate + .3, cab0 + .6], lampL: [0, by + br + .2, zf + .15] });
  } else throw new Error(`gs.models.vehicle: no railway car '${type}'`);
  points.front = [0, BUF, -length / 2]; points.back = [0, BUF, length / 2];
  const zs = sets.flatMap(s => s.at.map(a => a[1]));
  const bx = b.bounds();
  return { kind: 'train', style: type, body: b, parts, wheels: [], sets, rods, points, size: { length, width: bx.w, height: bx.hi[1] }, length, reach: (max(...zs) - min(...zs)) / 2, radius: sets[0].geo.r };
}
export const RAIL = ['steam', 'diesel', 'tender', 'van', 'open', 'flat', 'tanker', 'coach'];
