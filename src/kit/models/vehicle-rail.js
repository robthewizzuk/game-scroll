// The railway shapes of gs.models.vehicle('train'): a steam engine with rods that work, its tender, a diesel,
// goods wagons (van, open, flat, tanker, a guard's van) and a coach. Each stands on the rail tops (y = 0) with
// its middle at z = 0 and its nose along -z; `length` is over its buffers, so cars set that far apart are coupled.
// The goods train (the engine's pipes, pump, lamps and smoke deflectors, wagons on leaf springs, loads under
// canvas, crates and drums, the guard's van) began as Long Shadow's supply train.
// Kit use only.
import { Shape, stations, lerp } from './vehicle-parts.js';

const { PI, sin, cos, abs, min, max, round, sqrt, hypot } = Math;
const BUF = 1, FLOOR = 1.12;   // buffers' height, a wagon's floor

// what every car has at an end: a beam, two buffers, a hook
function buffers(b, z, s, w = 2.6, slot = 'under') {
  b.box(slot, w, .3, .14, [0, BUF, z - s * .07]);
  for (const x of [-.86, .86]) b.cyl('iron', .065, .075, .38, [x, BUF, z + s * .19], [PI / 2, 0, 0], 10).cyl('iron', .2, .2, .045, [x, BUF, z + s * .4], [PI / 2, 0, 0], 16);
  b.box('iron', .06, .14, .22, [0, BUF - .02, z + s * .1]);
}
// a leaf spring over an axle box: four leaves, the longest on top
function spring(b, x, y, z, long = 1.2) { for (let i = 0; i < 4; i++) b.box('iron', .075, .03, long - i * .22, [x, y + (3 - i) * .032, z]); }
// a goods wagon's frame on two axles: solebars, axle boxes on leaf springs between their guards, a brake lever, buffers
function frame(b, l, axles, r) {
  for (const s of [-1, 1]) {
    b.box('under', .12, .26, l, [s * .98, FLOOR - .13, 0]);
    for (const z of axles) {
      b.box('iron', .16, .22, .26, [s * 1.06, r, z], 0, .03); spring(b, s * 1.06, r + .15, z);
      for (const q of [-1, 1]) b.strip('iron', [s * 1.01, FLOOR - .26, z + q * .38], [s * 1.01, r - .1, z + q * .1], .06, .02).box('iron', .05, .1, .08, [s * 1.06, FLOOR - .3, z + q * .58]);
    }
    buffers(b, s * l / 2, s);
  }
  b.strip('iron', [1.1, .5, axles[1] - 2.2], [1.1, .8, axles[1]], .05, .02).box('iron', .04, .34, .2, [1.07, .76, axles[1] - 2.2]);   // the brake lever and its guide
  for (let i = 0; i < 5; i++) b.box('under', 1.9, .2, .1, [0, FLOOR - .12, lerp(-l / 2 + .3, l / 2 - .3, i / 4)]);
  b.box('under', .1, .2, l - .4, [0, FLOOR - .12, 0]);
}
// a roof over a body: a low arch from side to side
function roof(b, slot, w, y, rise, z0, z1, over = .08, n = 12) {
  const ring = z => { const r = []; for (let i = 0; i <= n; i++) { const t = i / n * PI, c = cos(t); r.push([(w / 2 + over) * c, y + rise * sin(t) ** .8, z]); } r.push([-(w / 2 + over) + .02, y - .03, z], [w / 2 + over - .02, y - .03, z]); return r; };
  b.skin([z0 - over, z1 + over].map(ring), { slot, capA: slot, capB: slot, crease: .5 });
}

// a smooth lumpiness, -1..1
const lump = (a, c, seed) => .6 * sin(a * 1.7 + seed) * cos(c * 2.3 + seed * 1.3) + .4 * sin(a * 3.1 - c * 1.9 + seed * 2.1);
// lumpy canvas pulled over a load: from z0 to z1, hw to each side, its edges at y and its middle `rise` higher
function tarp(b, z0, z1, hw, y, rise, seed = 3, slot = 'canvas') {
  const n = 16, m = 8, rings = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, z = lerp(z0, z1, u), ring = [];
    for (let j = 0; j <= m; j++) { const v = j / m, e = min(1, min(u, 1 - u) * 7, min(v, 1 - v) * 5), x = hw * (2 * v - 1) * (1 + (1 - e) * .06); ring.push([x, y + e * rise * (.72 + .28 * sin(u * 9 + seed)) + lump(z * 1.2, x * 1.6, seed) * .16 * e, z]); }
    rings.push(ring);
  }
  b.skin(rings, { slot, open: true, crease: .5 });
}
// a heap of lumps (coal in a tender or a wagon): a fine sheet with sharp folds, so every piece of it is a lump's face
const jit = (i, j) => { const s = sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
function heap(b, slot, z0, z1, hw, y, rise = .34) {
  const n = max(6, round((z1 - z0) / .2)), m = max(6, round(hw / .1)), rings = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, z = lerp(z0, z1, u), ring = [];
    for (let j = 0; j <= m; j++) { const v = j / m, e = min(1, min(u, 1 - u) * 5, min(v, 1 - v) * 4), x = lerp(-hw, hw, v); ring.push([x, y + e * (rise * (.72 + .28 * sin(u * 3.1 + 1)) + lump(z * 1.9, x * 2.1, 5) * .08 + (jit(i, j) - .5) * .12), z]); }
    rings.push(ring);
  }
  b.skin(rings, { slot, open: true, crease: .2 });
}
// a crate with its battens, an oil drum with its ribs
function crate(b, x, y, z, w, h, d, turn = 0) { b.box('wood', w, h, d, [x, y + h / 2, z], [0, turn, 0]); for (const e of [-1, 1]) b.box('wood', w + .04, .09, d + .04, [x, y + h / 2 + e * (h / 2 - .09), z], [0, turn, 0]); }
function drum(b, x, y, z, slot = 'drum') { b.cyl(slot, .29, .29, .9, [x, y + .45, z], 0, 14); for (const q of [.3, .6]) b.cyl(slot, .302, .302, .03, [x, y + q, z], 0, 14, true); }

const WAGONS = {
  // a covered van: planked sides in a steel frame, a sliding door, a roof
  van(b, l) {
    const w = 2.7, h = 2.25, y = FLOOR;
    b.box('boards', w, h, l, [0, y + h / 2, 0]);
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 6; i++) b.box('iron', .03, h, .07, [s * (w / 2 + .012), y + h / 2, lerp(-l / 2 + .04, l / 2 - .04, i / 6)]);
      b.box('boards', .05, h - .2, 1.7, [s * (w / 2 + .035), y + h / 2 - .02, 0]).box('iron', .03, .05, 3.6, [s * (w / 2 + .05), y + h - .06, .85]).box('iron', .03, .05, 3.6, [s * (w / 2 + .05), y + .06, .85]);
      for (const q of [-.78, .78]) b.box('iron', .03, h - .2, .06, [s * (w / 2 + .065), y + h / 2 - .02, q]);
      // a brace across the door and one each side of it, the door's handle
      b.strip('iron', [s * (w / 2 + .072), y + .16, -.7], [s * (w / 2 + .072), y + h - .3, .7], .07, .02).box('steel', .04, .3, .04, [s * (w / 2 + .09), y + h * .42, -.62]);
      for (const q of [-1, 1]) b.strip('iron', [s * (w / 2 + .03), y + .08, q * 1.05], [s * (w / 2 + .03), y + h - .08, q * (l / 2 - .1)], .07, .02);
      b.box('iron', w, .07, .03, [0, y + h * .5, s * (l / 2 + .012)]); for (const x of [-1, 0, 1]) b.box('iron', .07, h, .03, [x * (w / 2 - .04), y + h / 2, s * (l / 2 + .012)]);
    }
    roof(b, 'tar', w, y + h, .3, -l / 2, l / 2);
    return y + h + .3;
  },
  // a guard's van: a cabin with a look-out each side and a stove, an open end behind with its rail, two red lamps
  guard(b, l, o, points) {
    const w = 2.7, h = 2.25, y = FLOOR, ver = 1.75, zc = l / 2 - ver, lc = l - ver;
    b.box('boards', w, h, lc, [0, y + h / 2, -ver / 2]).box('wood', w - .1, .08, ver, [0, y + .04, zc + ver / 2]);
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 5; i++) b.box('iron', .03, h, .07, [s * (w / 2 + .012), y + h / 2, lerp(-l / 2 + .04, zc - .04, i / 5)]);
      b.box('boards', .3, 1, .9, [s * (w / 2 + .14), y + 1.5, zc - 1.5], 0, .04);                                                  // the look-out
      for (const q of [-1, 1]) b.box('glass', .16, .5, .02, [s * (w / 2 + .17), y + 1.6, zc - 1.5 + q * .456]);
      b.box('glass', .02, .5, .6, [s * (w / 2 + .012), y + 1.5, zc - 3.9]);
      b.box('boards', .06, 1, ver, [s * (w / 2 - .03), y + .5, zc + ver / 2]).box('iron', .07, h, .07, [s * (w / 2 - .035), y + h / 2, l / 2 - .035]);   // the open end: a low side, a post up to the roof
      b.bar('steel', [s * (w / 2 - .03), y + 1.02, zc], [s * (w / 2 - .03), y + 1.02, l / 2], .02, 6);
      b.cyl('iron', .09, .09, .2, [s * 1, y + .5, l / 2 + .1], [PI / 2, 0, 0], 10).cyl('tail', .07, .07, .02, [s * 1, y + .5, l / 2 + .208], [PI / 2, 0, 0], 12);
    }
    b.box('boards', w, 1, .06, [0, y + .5, l / 2 - .03]).box('dark', .72, 1.8, .03, [0, y + .93, zc + .016]);
    roof(b, 'tar', w, y + h, .3, -l / 2, l / 2);
    b.cyl('iron', .07, .07, .6, [.5, y + h + .5, -l / 2 + 1.6], 0, 8).cyl('iron', .05, .12, .1, [.5, y + h + .84, -l / 2 + 1.6], 0, 8);   // the stove's pipe
    points.veranda = [0, y + .08, zc + ver / 2]; points.tail = [0, y + .5, l / 2 + .22];
    return y + h + .3;
  },
  // an open wagon: plank sides, a door each side, empty
  open(b, l, o) {
    const w = 2.7, h = 1.25, y = FLOOR, t = .07;
    b.box('wood', w, .08, l, [0, y + .04, 0]);
    for (const s of [-1, 1]) {
      b.box('boards', t, h, l, [s * (w / 2 - t / 2), y + h / 2, 0]).box('boards', w - t * 2, h, t, [0, y + h / 2, s * (l / 2 - t / 2)]);
      for (let i = 0; i <= 6; i++) b.box('iron', .03, h + .04, .07, [s * (w / 2 + .012), y + h / 2, lerp(-l / 2 + .04, l / 2 - .04, i / 6)]);
      b.box('iron', .035, .06, l, [s * (w / 2 + .014), y + h - .03, 0]);
      for (const x of [-1, 1]) b.box('iron', .07, h, .03, [x * (w / 2 - .04), y + h / 2, s * (l / 2 + .012)]);
    }
    if (o.load === 'tarp') { tarp(b, -l / 2 + .1, l / 2 - .1, w / 2 - t - .01, y + h - .06, .62, 3 + (o.seed | 0)); return y + h + .6; }
    if (o.load === 'coal') heap(b, 'coal', -l / 2 + .1, l / 2 - .1, w / 2 - t - .01, y + h - .25, .4);
    return y + h;
  },
  // a flat wagon with stakes
  flat(b, l, o) {
    const w = 2.7, y = FLOOR, top = y + .1;
    b.box('wood', w, .1, l, [0, y + .05, 0]);
    for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) b.box('iron', .07, .95, .07, [s * (w / 2 - .035), y + .5, lerp(-l / 2 + .5, l / 2 - .5, i / 5)]); if (!o.load) b.box('iron', w, .12, .1, [0, y + .16, s * l * .3]); }
    if (o.load !== 'crates') return y + 1;
    // crates strapped down at the front, drums in the middle, something under canvas behind
    crate(b, -.5, top, -2.5, 1.3, 1.1, 1.5, .05); crate(b, .72, top, -2.6, .9, .8, 1.2, -.08); crate(b, .1, top, -1.05, 1.9, 1.3, 1.1); crate(b, -.45, top + 1.1, -2.55, 1, .6, 1, .2);
    for (const [x, z, red] of [[-.75, .4], [-.1, .4], [.55, .4, 1], [-.42, 1.05], [.24, 1.05]]) drum(b, x, top, z, red ? 'beam' : 'drum');
    tarp(b, 1.4, 3.8, 1.05, top, 1.15, 8 + (o.seed | 0));
    return top + 1.9;
  },
  // a tank wagon
  // a tank wagon: a round tank in hoops on two saddles, a filler dome and a board to stand on along its top, a ladder up one side
  tanker(b, l, o, points) {
    const r = 1.02, cy = FLOOR + .16 + r, z0 = -l / 2 + .62, z1 = l / 2 - .62, n = 26, rings = [];
    for (const z of stations(z0, z1, .6, [z0 + .04, z0 + .12, z0 + .24, z1 - .04, z1 - .12, z1 - .24])) {
      const e = min(z - z0, z1 - z), k = e < .34 ? sqrt(max(.03, 1 - (1 - e / .34) ** 2)) : 1, ring = [];
      for (let i = 0; i < n; i++) { const t = i / n * PI * 2; ring.push([r * k * cos(t), cy + r * k * sin(t), z]); }
      rings.push(ring);
    }
    b.skin(rings, { slot: 'paint2', capA: 'paint2', capB: 'paint2', crease: 1 });
    for (const q of [-.37, -.125, .125, .37]) b.cyl('iron', r + .015, r + .015, .07, [0, cy, q * (z1 - z0)], [PI / 2, 0, 0], n, true);
    for (const q of [-.37, .37]) b.box('under', 2.05, .5, .34, [0, FLOOR + .22, q * (z1 - z0)]);
    b.cyl('paint2', .42, .42, .3, [0, cy + r + .1, 0], 0, 16).ball('iron', .42, [0, cy + r + .25, 0], [1, .3, 1]).box('wood', .5, .04, 3.2, [0, cy + r + .045, 0]);
    const up = [[1.09, FLOOR + .1], [1.09, cy + .1], [.82, cy + .72], [.3, cy + r + .04]]; let run = .15;   // the ladder: up the side, then over the shoulder
    for (let i = 0; i < 3; i++) {
      const [xa, ya] = up[i], [xb, yb] = up[i + 1], d = hypot(xb - xa, yb - ya);
      for (const z of [.5, .95]) b.bar('iron', [xa, ya, z], [xb, yb, z], .022, 6);
      for (; run < d; run += .3) { const x = lerp(xa, xb, run / d), y = lerp(ya, yb, run / d); b.bar('iron', [x, y, .5], [x, y, .95], .018, 6); }
      run -= d;
    }
    points.filler = [0, cy + r + .4, 0];
    return cy + r + .38;
  },
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

/** One railway car as a plan: steam, tender, diesel, van, open, flat, tanker, guard, coach. o: gauge, load, deflectors, seed. */
export function railcar(type, o = {}) {
  const b = new Shape(), gauge = o.gauge || 1.435, sets = [], points = {}, parts = {}; let length = 9.1, rods = null;
  if (WAGONS[type]) {
    const l = length - 1.1, r = .46, ax = [-2.5, 2.5];
    frame(b, l, ax, r); const top = WAGONS[type](b, l, o, points);
    sets.push({ geo: { r, gauge, spokes: 9 }, at: ax.map(z => [r, z]) }); points.load = [0, FLOOR + .1, 0];
    if (type === 'van' || type === 'guard') points.roof = [0, top, 0];   // (the top of its roof, in the middle: someone riding it)
  } else if (type === 'coach') {
    length = 18.2; const l = length - 1.1, r = .46, z0 = -l / 2, z1 = l / 2, bays = 9, door = 1.15, bay = (l - door * 2 - .5) / bays, wz = i => z0 + door + .25 + bay * (i + .5);
    const must = []; for (let i = 0; i < bays; i++) must.push(wz(i) - bay * .36, wz(i) + bay * .36); for (const s of [-1, 1]) must.push(s * (l / 2 - .4), s * (l / 2 - .85));
    const win = z => { for (let i = 0; i < bays; i++) if (abs(z - wz(i)) < bay * .36) return true; return abs(abs(z) - (l / 2 - .625)) < .225; };
    const body = carBody(b, { w: 2.82, y0: FLOOR - .05, y1: 3.45, rise: .42, z0, z1, win, must, endA: 'dark', endB: 'dark' });
    for (const s of [-1, 1]) { buffers(b, s * l / 2, s); b.box('under', 2.3, .5, 2.4, [0, FLOOR - .3, s * 1.6]); b.box('dark', 1.1, 2.1, .1, [0, FLOOR + 1.05, s * (l / 2 + .04)]);
      for (const q of [-1, 1]) { b.strip('dark', [q * (body.hw + .002), FLOOR + .15, s * (l / 2 - .28)], [q * (body.hw + .002), body.yc, s * (l / 2 - .28)], .01, .004).strip('dark', [q * (body.hw + .002), FLOOR + .15, s * (l / 2 - .97)], [q * (body.hw + .002), body.yc, s * (l / 2 - .97)], .01, .004).box('chrome', .02, .2, .03, [q * (body.hw + .012), body.yb - .1, s * (l / 2 - .9)]); } }
    for (let i = 0; i < 5; i++) b.cyl('paint2', .12, .16, .1, [0, 3.45 + .44, lerp(z0 + 2, z1 - 2, i / 4)], 0, 10);
    for (const s of [-1, 1]) for (const z of bogie(b, s * (l / 2 - 2.9), r)) (sets[0] ||= { geo: { r, gauge }, at: [] }).at.push([r, z]);
    points.door = [1.5, FLOOR, l / 2 - .62]; points.roof = [0, 3.45 + .42, 0];
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
    b.box('under', 2.3, .3, l, [0, y - .15, 0]).box('plates', w, h, l - .1, [0, y + h / 2, 0], 0, .05);
    for (const s of [-1, 1]) {
      b.box('plates', .06, .32, l - .5, [s * (w / 2 - .01), y + h + .1, .1], [0, 0, -s * .35]);                // the coping, flared out
      for (const z of ax) { b.box('iron', .16, .2, .28, [s * 1.1, r, z], 0, .03).box('under', .08, .5, .5, [s * 1.04, r + .2, z]); spring(b, s * 1.11, r + .15, z, 1.05); }
      b.box('under', .1, .2, l - .3, [s * 1.04, r + .46, 0]);
      b.bar('steel', [s * .45 - .62, BUF + .15, l / 2 - .02], [s * .45 - .62, y + h + .12, l / 2 - .02], .02, 6);   // a ladder up the back
    }
    for (let q = BUF + .35; q < y + h; q += .3) b.bar('steel', [-1.07, q, l / 2 - .02], [-.17, q, l / 2 - .02], .016, 6);
    b.box('plates', w - .1, .32, .06, [0, y + h + .1, l / 2 - .2], [.35, 0, 0]);
    b.cyl('iron', .3, .3, .16, [0, y + h + .08, l / 2 - 1], 0, 14).cyl('iron', .32, .32, .03, [0, y + h + .175, l / 2 - 1], 0, 14).box('brass', .2, .04, .03, [0, y + h + .21, l / 2 - 1]);   // the water filler
    heap(b, 'coal', -l / 2 + .5, l / 2 - 1.5, w / 2 - .12, y + h - .08);
    buffers(b, l / 2, 1); b.box('under', 2.5, .26, .12, [0, BUF, -l / 2 - .02]).box('iron', .1, .08, .6, [0, BUF - .05, -l / 2 - .3]);
    sets.push({ geo: { r, gauge, spokes: 9 }, at: ax.map(z => [r, z]) }); points.coal = [0, y + h + .3, -.5];
  } else if (type === 'steam') {
    length = 11.2; const r = .66, cr = .3, plate = 1.5, by = 2.3, br = .8, zf = -length / 2 + .55, drv = [-1.9, -.4, 1.1, 2.6], cab0 = 2.3, cab1 = 4.4, zr = length / 2 - .1;
    // frames and the running plate, the buffer beam in the trim colour
    for (const s of [-1, 1]) { b.box('under', .07, .75, zr - zf - .3, [s * .56, 1.05, (zf + zr) / 2]); b.box('iron', .5, .05, cab0 - zf, [s * 1.1, plate, (zf + cab0) / 2]).box('iron', .04, .14, cab0 - zf, [s * 1.33, plate - .08, (zf + cab0) / 2]); }
    buffers(b, zf, -1, 2.7, 'beam'); b.box('under', 2.5, .28, .12, [0, BUF, zr]).box('iron', .1, .08, .5, [0, BUF - .05, zr + .2]);
    b.box('iron', 1.7, .05, .95, [0, plate, zf + .45]);                                                             // the platform in front of the smokebox
    for (const x of [-.8, .8]) b.cyl('iron', .12, .12, .2, [x, BUF + .48, zf - .02], [PI / 2, 0, 0], 10).cyl('lamp', .09, .09, .02, [x, BUF + .48, zf - .128], [PI / 2, 0, 0], 12).box('iron', .06, .16, .06, [x, BUF + .31, zf - .02]);   // a lamp over each buffer
    // the boiler: a smokebox with its door, the barrel in bands, a firebox between the last wheels
    b.cyl('iron', br + .04, br + .04, 1.35, [0, by, zf + 1.05], [PI / 2, 0, 0], 28).lathe('iron', [[0, .16], [.3, .15], [.6, .07], [br - .06, 0], [br + .04, 0]], [0, by, zf + .375], [-PI / 2, 0, 0], 24);
    b.box('steel', .04, .04, 1.1, [0, by, zf + .2], [0, 0, 0]).cyl('steel', .03, .03, .5, [0, by, zf + .19], [0, 0, PI / 2], 6).box('iron', 1.3, .5, 1.2, [0, by - br - .2, zf + 1.05]);
    for (const q of [-.27, .27]) b.box('iron', 1.3, .05, .03, [.08, by + q, zf + .3]);                                // the door's hinge straps
    b.cyl('paint', br, br, cab0 - zf - 1.7, [0, by, (zf + 1.7 + cab0) / 2], [PI / 2, 0, 0], 28);
    for (let i = 0; i < 5; i++) b.cyl('steel', br + .012, br + .012, .05, [0, by, lerp(zf + 1.78, cab0 - 1.35, i / 4)], [PI / 2, 0, 0], 28, true);
    b.box('paint', 1.72, 1.7, 1.5, [0, by - .1, cab0 - .7], 0, .12).box('iron', 1.5, .5, 1.4, [0, 1.25, cab0 - .7]);
    // chimney, domes, valves, a whistle, a lamp
    b.lathe('iron', [[br * .42, -.12], [.26, .05], [.2, .35], [.21, .62], [.27, .68], [.27, .72], [.17, .72], [.17, .4]], [0, by + br, zf + .9], 0, 18);
    b.cyl('copper', .278, .278, .05, [0, by + br + .695, zf + .9], 0, 18, true);                                      // the chimney's copper cap
    b.lathe('brass', [[.4, -.1], [.36, .1], [.34, .3], [.26, .44], [.1, .5], [0, .51]], [0, by + br - .04, -1.2], 0, 18).lathe('paint', [[.34, -.1], [.3, .12], [.24, .3], [.1, .37], [0, .38]], [0, by + br - .04, -2.9], 0, 16);
    for (const x of [-.12, .12]) b.cyl('brass', .045, .06, .3, [x, by + br + .75, cab0 - .8], 0, 8); b.cyl('brass', .03, .03, .25, [.3, by + br + .78, cab0 - .25], 0, 8);
    b.box('iron', .22, .26, .2, [0, by + br + .2, zf + .32], 0, .03).cyl('lamp', .08, .08, .03, [0, by + br + .2, zf + .21], [PI / 2, 0, 0], 12);
    for (const s of [-1, 1]) {   // handrails on their knobs, steam pipes, cylinders, slide bars, steps
      b.bar('steel', [s * (br + .07), by + .3, zf + 1.8], [s * (br + .07), by + .3, cab0], .016, 6);
      for (let z = zf + 2.2; z < cab0 - .2; z += 1.3) b.cyl('steel', .026, .026, .1, [s * (br + .03), by + .3, z], [0, 0, PI / 2], 6);
      b.bar('paint', [s * .72, by + .15, zf + 1.25], [s * 1.02, r + .66, drv[0] - 1.72], .1, 10).cyl('paint', .19, .19, .95, [s * 1.1, r + .58, drv[0] - 1.75], [PI / 2, 0, 0], 12);   // the steam pipe down to the valve chest
      if (o.deflectors) {   // smoke deflectors each side of the smokebox, on their stays
        b.box('plates', .035, 1.8, 1.5, [s * 1.33, plate + .92, zf + .95]);
        for (const q of [.25, 1.55]) b.bar('iron', [s * 1.32, plate + q, zf + .95], [s * (q > 1 ? .8 : .86), plate + q, zf + .95], .02, 6);
      }
      b.cyl('paint', .32, .32, 1, [s * 1.1, r + .1, drv[0] - 1.75], [PI / 2, 0, 0], 16).cyl('steel', .34, .34, .05, [s * 1.1, r + .1, drv[0] - 2.27], [PI / 2, 0, 0], 16).box('paint', .5, .5, .7, [s * .86, r + .5, drv[0] - 1.75]);
      b.box('steel', .05, .05, 1.25, [s * 1.1, r + .22, drv[0] - .7]).box('steel', .05, .05, 1.25, [s * 1.1, r - .02, drv[0] - .7]).bar('steel', [s * 1.1, r + .1, drv[0] - 1.25], [s * 1.1, r + .1, drv[0] - .35], .03, 8);
      b.box('iron', .3, .03, .3, [s * 1.2, .55, zf + .3]).box('iron', .3, .03, .3, [s * 1.25, .5, cab0 + 1.3]).box('iron', .3, .03, .3, [s * 1.25, .95, cab0 + 1.3]);
      b.box('iron', .04, BUF - .5, .04, [s * 1.2, (BUF + .5) / 2 - .03, zf + .17]); for (const q of [-.14, .14]) b.box('iron', .025, plate - .48, .04, [s * 1.385, (plate + .48) / 2, cab0 + 1.3 + q]);   // (what the steps hang from)
      for (const z of drv) b.box('iron', .5, .04, 1.2, [s * 1.1, r * 2 + .1, z], [0, 0, 0]);   // splashers over the wheels
    }
    // an air tank under the running plate on one side, the pump on the other, and the copper pipes between them and the cab
    b.cyl('paint', .17, .17, 1.5, [1.24, plate - .36, (drv[1] + drv[2]) / 2], [PI / 2, 0, 0], 12).cyl('paint', .13, .13, .7, [-1.14, plate + .38, zf + 2.3], 0, 10).cyl('brass', .09, .09, .16, [-1.14, plate + .8, zf + 2.3], 0, 8);
    b.bar('copper', [-1.14, plate + .1, zf + 2.3], [-1.3, plate + .16, cab0], .028, 6).bar('copper', [1.3, plate + .16, (drv[1] + drv[2]) / 2 - .6], [1.3, plate + .16, cab0], .028, 6);
    // the cab: its front with two round windows, sides with a window, an arched roof with a vent, open at the back
    const cw = 2.76, cy = plate, ch = 3.42;
    b.box('plates', cw, ch - cy, .05, [0, (cy + ch) / 2, cab0 + .025]);
    for (const s of [-1, 1]) {
      b.box('plates', .05, ch - cy, cab1 - cab0 - .55, [s * (cw / 2 - .025), (cy + ch) / 2, (cab0 + cab1 - .55) / 2]).box('glass', .02, .55, .75, [s * (cw / 2 + .004), cy + 1.45, cab0 + .75], 0).cyl('glass', .2, .2, .02, [s * .9, cy + 1.55, cab0 - .004], [PI / 2, 0, 0], 16);
      b.box('plates', .05, .95, .55, [s * (cw / 2 - .025), cy + .47, cab1 - .28]).bar('steel', [s * (cw / 2 + .01), cy + .1, cab1 + .02], [s * (cw / 2 + .01), cy + 1.5, cab1 + .02], .022, 6);
    }
    roof(b, 'iron', cw, ch, .3, cab0 - .1, cab1 + .15, .1);
    b.box('iron', .9, .05, .7, [0, ch + .32, (cab0 + cab1) / 2]).box('iron', 2.2, .04, .7, [0, cy + .05, cab1 + .3]);   // the roof's vent; the plate across to the tender
    b.box('dark', cw - .12, ch - cy - .1, .04, [0, (cy + ch) / 2, cab0 + .5]).box('wood', cw - .1, .06, cab1 - cab0, [0, cy + .03, (cab0 + cab1) / 2]);
    b.cyl('fire', .2, .2, .03, [0, cy + .55, cab0 + .53], [PI / 2, 0, 0], 14);                                       // the fire, through its door
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
export const RAIL = ['steam', 'diesel', 'tender', 'van', 'open', 'flat', 'tanker', 'guard', 'coach'];
