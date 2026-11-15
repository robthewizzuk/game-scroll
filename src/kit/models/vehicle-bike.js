// The motorbikes of gs.models.vehicle: a road bike, a sports bike under its fairing, a scooter and a dirt bike. Its
// middle is between its axles on the ground (y = 0), nose along -z, +x its right side, metres. The front wheel turns
// with the forks (part fork, on the raked steering head: what turns about it turns as a real front end does), the rest
// is one shape; vehicles.js leans the whole bike into a turn about the line its tyres touch the road along.
// Plain geometry by material slot (vehicle-parts.js), dressed by vehicles.js. Kit use only.
import { Shape } from './vehicle-parts.js';

const { PI, atan2, hypot, max } = Math;

// each style's measures: wheelbase, wheel radii and widths, the steering head [y, z] (its top), the seat's height and
// where it starts and ends along the bike, the bars (half their width, how high above the head, how far back), lugs (a
// knobbly tyre), and what it wears
const BIKES = {
  road: { hub: '#9a9fa4', base: 1.44, rf: .31, rr: .31, wf: .12, wr: .17, head: [.98, -.46], seat: [.84, -.02, .52], bars: [.36, .14, .14], tank: true, lugs: 0 },
  sport: { base: 1.4, rf: .3, rr: .31, wf: .12, wr: .19, head: [.92, -.47], seat: [.86, .02, .5], bars: [.3, -.02, .1], tank: true, fairing: true, lugs: 0 },
  scooter: { hub: '#b4b8bb', base: 1.3, rf: .23, rr: .23, wf: .11, wr: .12, head: [.92, -.5], seat: [.8, .02, .58], bars: [.33, .16, .08], step: true, lugs: 0 },
  dirt: { base: 1.48, rf: .36, rr: .34, wf: .09, wr: .13, head: [1.12, -.42], seat: [.95, -.12, .6], bars: [.4, .16, .1], tank: true, high: true, lugs: 26 },
};

/** A motorbike: road, sport, scooter, dirt. */
export function bike(o = {}) {
  const style = BIKES[o.style] ? o.style : 'road', c = BIKES[style], b = new Shape(), F = new Shape();
  const zf = -c.base / 2, zr = c.base / 2, [hy, hz] = c.head, [sy, s0, s1] = c.seat;
  // the forks' line: from the steering head down to the front axle, raked back
  const rake = atan2(hz - zf, hy - c.rf), Lf = hypot(hz - zf, hy - c.rf);
  // (the fork part's own space: its y up the forks, its origin at the head; what is drawn on it here is turned by -rake to stand level)
  const lvl = [-rake, 0, 0];
  const fx = c.step ? .07 : .095;
  for (const s of c.step ? [1] : [-1, 1]) { F.bar('chrome', [s * fx, .02, 0], [s * fx, -Lf * .55, 0], c.high ? .026 : .022, 8); F.bar('steel', [s * fx, -Lf * .55, 0], [s * fx, -Lf + .02, 0], c.high ? .034 : .03, 8); }
  F.box('steel', fx * 2 + .08, .05, .1, [0, -.02, 0], 0, .015).box('steel', fx * 2 + .06, .04, .09, [0, -.16, 0], 0, .012);
  // the bars: across, swept back to the grips, which sit level whatever the rake
  const [bw, bh, bb] = c.bars, gy = bh * Math.cos(rake) + bb * Math.sin(rake), gz = bb * Math.cos(rake) - bh * Math.sin(rake);
  F.bar('dark', [0, .04, 0], [0, gy, gz * .3], .018, 6).bar('dark', [-bw * .6, gy, gz * .4], [bw * .6, gy, gz * .4], .013, 6);
  for (const s of [-1, 1]) { F.bar('dark', [s * bw * .6, gy, gz * .4], [s * bw * .92, gy - .01, gz], .013, 6).bar('rubber', [s * bw * .92, gy - .01, gz], [s * (bw + .05), gy - .015, gz + .01], .019, 8); F.bar('dark', [s * bw * .7, gy, gz * .5], [s * bw * .75, gy + .17, gz * .5 + .02], .006, 4).box('chrome', .09, .055, .02, [s * bw * .76, gy + .2, gz * .5 + .03], lvl, .012); F.box('dark', .06, .02, .14, [s * bw * .82, gy + .02, gz * .7 - .05], lvl, .008); }
  F.cyl('dials', .055, .055, .03, [0, gy * .7, gz * .3 - .02], [PI / 2 - rake - .5, 0, 0], 16);
  // its lamp, its mudguard over the wheel
  if (!c.fairing) {
    const ly = c.step ? .02 : -.17, lz = c.step ? -.09 : -.13;
    if (c.high) F.box('paint', .22, .26, .04, [0, ly + .04, lz - .02], [-rake + .1, 0, 0], .03).cyl('lamp', .045, .045, .03, [0, ly + .06, lz - .05], [PI / 2 - rake, 0, 0], 14);
    else F.cyl('dark', .095, .085, .1, [0, ly, lz], [PI / 2 - rake, 0, 0], 18).cyl('lamp', .082, .082, .012, [0, ly - .045 * Math.sin(rake), lz - .052], [PI / 2 - rake, 0, 0], 18).ring('chrome', .086, .01, [0, ly - .045 * Math.sin(rake), lz - .054], lvl, PI * 2, 18);
  }
  const fend = (S, slot, at, r, w, from, to, rot = [0, 0, 0]) => { for (let i = 0; i < 7; i++) { const a = from + (to - from) * (i + .5) / 7, l = (to - from) / 7 * r * 1.08; S.box(slot, w, .012, l, [at[0], at[1] + Math.cos(a) * r, at[2] - Math.sin(a) * r], [-a + rot[0], 0, 0], .004); } };
  // (in the fork's own space, so turned back by the rake; a dirt bike's stands high off its wheel)
  fend(F, 'paint', [0, -Lf, 0], c.rf + (c.high ? .17 : .05), c.wf + (c.high ? .07 : .05), (c.high ? -.55 : -.9) + rake, (c.high ? .6 : .9) + rake);
  // the frame: from the head back along under the tank to where the swing arm hangs, and down in front of the engine
  const pivot = [.11, c.rr + .14, .1], eng = [0, c.rr + .12, -.12];
  b.cyl('steel', .045, .045, .2, [0, hy - .06, hz + .03], [-rake, 0, 0], 12);
  if (!c.step) {   // (a scooter's frame is under its body)
    for (const s of [-1, 1]) { b.bar('iron', [s * .04, hy - .04, hz + .05], [s * .12, sy - .1, s0 + .1], .02, 8).bar('iron', [s * .12, sy - .1, s0 + .1], [s * pivot[0], pivot[1], pivot[2]], .02, 8).bar('iron', [s * .1, sy - .08, s0 + .1], [s * .08, sy - .05, s1 - .05], .015, 6); }
    b.bar('iron', [0, hy - .12, hz + .04], [0, eng[1] - .06, eng[2] - .16], .022, 8);
  }
  // the swing arm and the shock, the rear wheel's mudguard, the tail lamp and plate
  for (const s of [-1, 1]) b.bar('iron', [s * pivot[0], pivot[1], pivot[2]], [s * (c.wr / 2 + .04), c.rr, zr], .022, 8);
  b.bar('chrome', [.09, pivot[1] + .03, zr - .2], [.1, sy - .06, s0 + .35], .022, 8).bar('paint2', [.09, pivot[1] + .1, zr - .17], [.1, sy - .12, s0 + .33], .032, 8);
  fend(b, c.high ? 'paint' : 'dark', [0, c.rr, zr], c.rr + .04, c.wr + .05, -.2, c.high ? .7 : .95);
  const ty = sy + (c.high ? .05 : .02), tz = s1 + .06;
  b.box('tail', .12, .045, .04, [0, ty - .1, tz + .02], [.25, 0, 0], .012).box('plate', .2, .13, .01, [0, ty - .25, tz + .05], [.35, 0, 0]);
  // the engine: a crankcase, its cylinder with fins, covers that catch the light; no engine to see under a scooter's body
  if (!c.step) {
    b.box('steel', .26, .26, .36, [eng[0], eng[1], eng[2] + .04], 0, .04).box('dark', .2, .12, .28, [0, eng[1] - .17, eng[2] + .04], 0, .03);
    for (let i = 0; i < 6; i++) b.box('steel', c.high ? .2 : .3, .014, .2, [0, eng[1] + .16 + i * .032, eng[2] - .06 + i * .015], [.3, 0, 0], .005);
    for (const s of [-1, 1]) b.cyl('steel', .075, .08, .03, [s * .14, eng[1] - .03, eng[2] + .1], [0, 0, PI / 2], 16);
  }
  // the exhaust: down from the cylinder, along under the right side, a silencer to the back
  const ex = c.high ? [[.06, eng[1] + .25, eng[2] - .12], [.13, eng[1] + .3, eng[2] + .25], [.15, sy - .05, s1 - .25]] : [[.06, eng[1] + .1, eng[2] - .2], [.12, eng[1] - .14, eng[2] - .05], [.15, eng[1] - .1, s0 + .25]];
  if (c.step) ex.splice(0, 3, [.1, c.rr + .02, zr - .45], [.13, c.rr + .02, zr - .3], [.15, c.rr + .06, zr - .1]);
  b.bar('chrome', ex[0], ex[1], .022, 8).bar('chrome', ex[1], ex[2], .024, 8);
  const sx = ex[2], tip = [sx[0] + .01, sx[1] + (c.high ? .03 : .08), sx[2] + (c.step ? .25 : .38)];
  b.bar('chrome', sx, tip, c.step ? .04 : .05, 12, c.step ? .045 : .056).cyl('dark', .03, .03, .02, [tip[0], tip[1], tip[2] + .01], [PI / 2 - .2, 0, 0], 10);
  // the tank, the seat, the tail under it; side panels
  if (c.tank) {
    b.ball('paint', .2, [0, hy - .04 - (c.high ? .02 : 0), hz + .38], [c.high ? .78 : .86, c.high ? .62 : .72, 1.45], 18);
    b.box('chrome', .07, .02, .06, [0, hy + .1 - (c.high ? .02 : 0), hz + .42], 0, .01);
  }
  b.box('seat', c.high ? .2 : .29, .09, s1 - s0, [0, sy, (s0 + s1) / 2], [-.04, 0, 0], .045);
  b.box('paint', c.high ? .18 : .24, .14, .34, [0, sy - .04, s1 - .02], [-.18, 0, 0], .05);
  b.box('paint2', .25, .18, .26, [0, sy - .17, (s0 + s1) / 2 - .05], 0, .04);
  for (const s of [-1, 1]) b.bar('dark', [s * .12, pivot[1] - .02, pivot[2] - .06], [s * .23, pivot[1] - .03, pivot[2] - .06], .012, 6).bar('rubber', [s * .19, pivot[1] - .03, pivot[2] - .06], [s * .25, pivot[1] - .03, pivot[2] - .06], .017, 6);   // (foot pegs)
  if (c.step) {   // a scooter: a shield before the knees, a floor to put the feet on, a body round the engine and back wheel
    b.box('paint', .42, .62, .1, [0, .62, hz + .17], [-.32, 0, 0], .06).box('paint', .34, .07, .52, [0, .33, -.1], 0, .03).box('dark', .3, .02, .48, [0, .37, -.1]);
    b.box('paint', .38, .36, .64, [0, sy - .2, s0 + .32], 0, .16).box('paint', .18, .22, .3, [0, sy - .36, s0 + .1], 0, .06);
    F.box('paint', .5, .14, .16, [0, gy - .03, gz * .3], lvl, .05).cyl('lamp', .05, .05, .02, [0, gy - .02, gz * .3 - .08], [PI / 2 - rake, 0, 0], 14);
  }
  if (c.fairing) {   // a sports bike: a nose on the frame before the head with its lamps and a screen, sides down round the engine, a belly pan
    const nz = hz - .2, ny = hy - .1;
    b.box('paint', .34, .3, .36, [0, ny, nz], [.45, 0, 0], .1).box('paint', .3, .2, .2, [0, ny - .18, nz - .02], [.1, 0, 0], .08);
    b.box('screen', .28, .012, .28, [0, ny + .2, nz + .05], [-.62, 0, 0], .03);
    for (const s of [-1, 1]) b.box('lamp', .1, .05, .03, [s * .075, ny - .02, nz - .2], [.45, s * .3, 0], .015);
    for (const s of [-1, 1]) b.box('paint', .04, .3, .56, [s * .17, eng[1] + .16, eng[2] - .12], [.28, s * .14, 0], .03).box('paint2', .042, .05, .42, [s * .175, eng[1] + .06, eng[2] - .08], [.28, s * .14, 0], .01);
    b.box('paint2', .32, .1, .5, [0, eng[1] - .22, eng[2] + .02], [.06, 0, 0], .04);
  }
  if (c.high) F.box('plate', .22, .2, .012, [0, .03, -.12], [-rake + .15, 0, 0], .02);   // (a dirt bike's number board)
  const wheels = [
    { at: [0, -Lf, 0], on: 'fork', geo: { r: c.rf, w: c.wf, rim: c.lugs ? .72 : .66, lugs: c.lugs, hub: c.hub || '#2a2b2e', nuts: 0, seg: 28 } },
    { at: [0, c.rr, zr], geo: { r: c.rr, w: c.wr, rim: c.lugs ? .7 : .64, lugs: c.lugs, hub: c.hub || '#2a2b2e', nuts: 0, seg: 28 } },
  ];
  const points = { rider: [0, sy + .02, (s0 + s1) / 2 - .06], pillion: [0, sy + .05, s1 - .12], pegL: [-.23, pivot[1] - .03, pivot[2] - .06], pegR: [.23, pivot[1] - .03, pivot[2] - .06],
    barL: { at: [-(bw + .02), gy - .015, gz + .01], on: 'fork' }, barR: { at: [bw + .02, gy - .015, gz + .01], on: 'fork' }, lampL: { at: [0, -.17, -.2], on: 'fork' }, exhaust: tip, stand: [-.2, 0, -.05] };
  const bx = b.bounds();
  return { kind: 'bike', style, body: b, wheels, points, parts: { fork: { shape: F, at: [0, hy, hz], rot: [rake, 0, 0] } }, steer: 'fork', lean: true, screen: null,
    size: { length: c.base + c.rf + c.rr + .2, width: max(bx.w, bw * 2 + .1), height: max(bx.hi[1], hy + gy) }, wheelbase: c.base, track: 0, radius: c.rr, clear: c.rr * .4, mid: 0, rake };
}
export const BIKE_KINDS = Object.keys(BIKES);
