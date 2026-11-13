// gs.city close up: what a street is dressed with, and depth on the fronts of its buildings.
//
// Buildings: ledges along each storey of the old stone and brick blocks (string courses at the sills),
// fins between the bays of the glass towers and ledges on the dark ones, balconies on the plaster and
// concrete blocks, sills under a house's windows, air-con boxes under some windows, shopfronts with
// pilasters between the bays, a fascia over them and a sign for each shop with its own made-up name (lit
// at night), and on the flat roofs stair huts, vents and dishes. Streets: kerb stones, drains in the
// gutters, worn road paint, a name sign on a post at each corner (made-up names), bins by the doors,
// bollards round the squares, parking signs, wires strung across the old town's streets and along the
// suburb's poles, and parked cars along the kerbs where a road is wide enough (city-cars.js).
//
// Everything here is plain geometry in the chunk's own buffers (shown within the city's `detail` metres)
// or gs.props (culled and simpler far away), in the city's few materials; the signs are one picture made in
// code. It all comes from the city's seed, with random numbers of its own, so a city's layout is the same
// with it or without it (City option dress: false, and parked: false for no parked cars).
// Kit use only: city.js calls these.
import { BoxGeometry, BufferAttribute, CanvasTexture, Color, CylinderGeometry, LinearMipmapLinearFilter, SphereGeometry, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './math.js';
import { font } from './fontlib.js';
import { phoneClass } from './speed.js';
import { pause, built } from './slices.js';

const KERB = .15, LANE = 3.2;   // (as city.js)
const C = hex => new Color(hex);
const shade = (hex, k) => C(hex).multiplyScalar(k);
const NORMAL = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* ---------- made-up names, and the one picture every sign is cut from ---------- */

/** Shop names and street names: made up, so no real place or business. */
export const SHOP_NAMES = ['Brindle Bakery', 'Corvo Coffee', 'Quill & Page', 'Juniper Flowers', 'Otterly Noodles', 'Saffron Deli', 'Tallow Hardware', 'Wren Cycles',
  'Pebble Laundry', 'Nimbus Records', 'Hollis Barber', 'Fennick Pharmacy', 'Larkspur Market', 'Copperpot Pizza', 'Bramble Tea Room', 'Marlow Optician'];
export const STREET_NAMES = ['Larkspur St', 'Quarry Rd', 'Mill Lane', 'Harrow St', 'Cobble Row', 'Linden St', 'Foundry Rd', 'Kestrel St', 'Orchard Way', 'Tanner St',
  'Weaver Lane', 'Chapel St', 'Marten Rd', 'Saddler St', 'Thistle Row', 'Sparrow St',
  'Juniper Ave', 'Ferris Ave', 'Ash Ave', 'Copper Ave', 'Brook Ave', 'Hollow Ave', 'Pike Ave', 'Rowan Ave', 'Gable Ave', 'Fern Ave', 'Alder Ave', 'Cinder Ave',
  'Heron Ave', 'Moss Ave', 'Lantern Ave', 'Barrow Ave'];
const SIGN_COLOURS = [['#b8322a', '#fff6e8'], ['#1f5c96', '#ffffff'], ['#2a6a44', '#f4ecd0'], ['#1c1c1e', '#ffcf4a'], ['#e8e0cc', '#2a2420'], ['#6a2a5a', '#ffe0f0'],
  ['#c8862a', '#2a1a10'], ['#14303a', '#6ef0e0']];
// where each name is in the picture: shop signs in 2 x 8 cells over the top three quarters, street names in 4 x 8 under them
const SHOP_H = 96 / 1024, INSET = .003;
export function shopUV(i) { const x = (i % 2) * .5, y = (i >> 1) * SHOP_H; return [x + INSET, 1 - y - SHOP_H + INSET, x + .5 - INSET, 1 - y - INSET]; }
export function streetUV(i) { const x = (i % 4) * .25, y = .75 + (i >> 2) / 32; return [x + INSET, 1 - y - 1 / 32 + INSET, x + .25 - INSET, 1 - y - INSET]; }

let ATLAS = null;
/** The signs' picture (colour) and its glow at night (light): made once. */
export function signAtlas() {
  if (ATLAS) return ATLAS;
  pause('Textures');
  const S = phoneClass() === 'low' ? 512 : 1024, L = S / 2, k = S / 1024;
  const col = document.createElement('canvas'), em = document.createElement('canvas'); col.width = col.height = S; em.width = em.height = L;
  const g = col.getContext('2d'), e = em.getContext('2d');
  g.fillStyle = '#202224'; g.fillRect(0, 0, S, S); e.fillStyle = '#000'; e.fillRect(0, 0, L, L);
  const fit = (text, w, size, weight) => { g.font = font('Rubik', size, weight); const m = g.measureText(text).width; return m > w ? size * w / m : size; };
  SHOP_NAMES.forEach((name, i) => {
    const x = (i % 2) * S / 2, y = (i >> 1) * SHOP_H * S, w = S / 2, h = SHOP_H * S, [bg, fg] = SIGN_COLOURS[i % SIGN_COLOURS.length], neon = i % 4 === 3, caps = i % 3 !== 1;
    const text = caps ? name.toUpperCase() : name, weight = i % 2 ? 700 : 500;
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = fg; g.globalAlpha = .55; g.lineWidth = 3 * k; g.strokeRect(x + 8 * k, y + 8 * k, w - 16 * k, h - 16 * k); g.globalAlpha = 1;
    const size = fit(text, w * .84, 50 * k, weight);
    g.font = font('Rubik', size, weight); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2 + 2 * k);
    // at night: a lit box glows all over (its letters brightest), a neon sign only in its letters
    e.save(); e.scale(.5, .5);
    if (!neon) { e.fillStyle = bg; e.globalAlpha = .55; e.fillRect(x, y, w, h); e.globalAlpha = 1; }
    e.font = g.font; e.fillStyle = fg; e.textAlign = 'center'; e.textBaseline = 'middle'; e.fillText(text, x + w / 2, y + h / 2 + 2 * k);
    e.restore();
  });
  STREET_NAMES.forEach((name, i) => {
    const x = (i % 4) * S / 4, y = S * .75 + (i >> 2) * S / 32, w = S / 4, h = S / 32, bg = i < 16 ? '#1d5a3a' : '#1f3f78';
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = '#f2f2ee'; g.lineWidth = 1.5 * k; g.strokeRect(x + 2.5 * k, y + 2.5 * k, w - 5 * k, h - 5 * k);
    const text = name.toUpperCase(), size = fit(text, w * .86, 19 * k, 700);
    g.font = font('Rubik', size, 700); g.fillStyle = '#f6f6f2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2 + k);
  });
  const tex = (cv, srgb) => { const t = new CanvasTexture(cv); t.colorSpace = srgb ? SRGBColorSpace : t.colorSpace; t.anisotropy = 8; t.minFilter = LinearMipmapLinearFilter; return t; };
  ATLAS = { map: tex(col, true), light: tex(em, true) };
  built();
  return ATLAS;
}

/* ---------- shapes for the street's props (vertex-coloured, so one material draws them all) ---------- */

function coloured(geo, hex) { const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new Float32Array(n * 3), col = C(hex); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } g.setAttribute('color', new BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g; }
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const rotX = (g, a) => { g.rotateX(a); return g; };
/** The street's and the roofs' props: make() and the distances its simpler copies take over (city.js FURNITURE). */
export const DRESS_SHAPES = {
  // a name-sign post (the blades are the chunk's, so each corner shows its own streets)
  post: [() => mergeGeometries([coloured(at(new CylinderGeometry(.04, .045, 3.2, 6), 0, 1.6, 0), '#3a4046'), coloured(at(new SphereGeometry(.06, 6, 4), 0, 3.22, 0), '#3a4046')]), [60]],
  bin: [() => mergeGeometries([coloured(at(new CylinderGeometry(.27, .24, .86, 10), 0, .43, 0), '#2c4636'), coloured(at(new CylinderGeometry(.29, .29, .08, 10), 0, .9, 0), '#22362a'),
    coloured(at(new CylinderGeometry(.18, .18, .02, 10), 0, .95, 0), '#141414')]), [40]],
  bollard: [() => mergeGeometries([coloured(at(new CylinderGeometry(.1, .11, .9, 8), 0, .45, 0), '#2e3032'), coloured(at(new SphereGeometry(.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, .9, 0), '#2e3032'),
    coloured(at(new CylinderGeometry(.106, .106, .06, 8), 0, .74, 0), '#c8b070')]), [40]],
  psign: [() => mergeGeometries([coloured(at(new CylinderGeometry(.035, .04, 2.6, 6), 0, 1.3, 0), '#8a8e92'), coloured(at(new BoxGeometry(.42, .55, .03), 0, 2.35, .05), '#1f4a9a'),
    coloured(at(new BoxGeometry(.2, .3, .035), 0, 2.36, .05), '#f2f2f2'), coloured(at(new BoxGeometry(.32, .14, .033), 0, 2.0, .05), '#f2f2f2')]), [50]],
  upole: [() => mergeGeometries([coloured(at(new CylinderGeometry(.11, .15, 8.2, 7), 0, 4.1, 0), '#6a5444'), coloured(at(new BoxGeometry(1.9, .1, .12), 0, 7.6, 0), '#5a4a3c'),
    ...[-.8, 0, .8].map(x => coloured(at(new CylinderGeometry(.035, .035, .14, 5), x, 7.72, 0), '#d8d8d0')), coloured(at(new CylinderGeometry(.22, .22, .7, 8), .26, 6.6, 0), '#7c8084')]), [90]],
  // an air-con box hung under a window: its back on the wall (z = 0), its fan facing out (+z)
  ac: [() => mergeGeometries([coloured(at(new BoxGeometry(.82, .56, .42), 0, 0, .23), '#d6d6d0'), coloured(at(rotX(new CylinderGeometry(.19, .19, .02, 12), Math.PI / 2), .14, 0, .445), '#4a4c4e'),
    coloured(at(new BoxGeometry(.9, .05, .5), 0, -.31, .25), '#5a5c5e')]), [45]],
  // a stair hut on a flat roof, its door on +z
  hut: [() => mergeGeometries([coloured(at(new BoxGeometry(2.8, 2.7, 3.2), 0, 1.35, 0), '#8c8880'), coloured(at(new BoxGeometry(3.0, .16, 3.4), 0, 2.78, 0), '#5c5a56'),
    coloured(at(new BoxGeometry(.95, 2.05, .06), -.6, 1.03, 1.61), '#4a3a30')]), [120]],
  vent: [() => mergeGeometries([coloured(at(new CylinderGeometry(.16, .16, .9, 8), 0, .45, 0), '#9a9c9e'), coloured(at(new CylinderGeometry(.04, .32, .22, 8), 0, 1.0, 0), '#8a8c8e')]), [70]],
  dish: [() => mergeGeometries([coloured(at(new CylinderGeometry(.04, .04, 1.1, 6), 0, .55, 0), '#7a7c7e'),
    coloured(at(rotX(new SphereGeometry(.55, 12, 5, 0, Math.PI * 2, 0, .9), -2.1), 0, 1.15, .08), '#e6e6e2')]), [80]],
};

/* ---------- the fronts of the buildings ---------- */

// a wall of a building part: from a to b round it, its outward normal (nx, nz) and length
function side(p, s) {
  const ends = [[p.x1, p.z0, p.x0, p.z0], [p.x1, p.z1, p.x1, p.z0], [p.x0, p.z1, p.x1, p.z1], [p.x0, p.z0, p.x0, p.z1]][s], [nx, nz] = NORMAL[s];
  const [ax, az, bx, bz] = ends, L = Math.hypot(bx - ax, bz - az);
  return { ax, az, dx: (bx - ax) / L, dz: (bz - az) / L, nx, nz, L };
}
// a box against a wall: t along it, o out from it, y up (an axis-lined box: the city's walls are)
function wbox(q, w, t0, t1, o0, o1, y0, y1, col, under = true) {
  const x0 = w.ax + w.dx * t0 + w.nx * o0, z0 = w.az + w.dz * t0 + w.nz * o0, x1 = w.ax + w.dx * t1 + w.nx * o1, z1 = w.az + w.dz * t1 + w.nz * o1;
  q.slab(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), col, under);
}
// a flat picture on a wall's face, o out from it: uv [u0, v0, u1, v1]
function wquad(q, w, t0, t1, o, y0, y1, uv) {
  const P = (t, y) => [w.ax + w.dx * t + w.nx * o, y, w.az + w.dz * t + w.nz * o];
  q.quad(P(t0, y0), P(t1, y0), P(t1, y1), P(t0, y1), [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]]);
}
// a ledge round a whole part (its four sides, its top and its underside, not a lid over the part)
function ring(q, p, o, y0, y1, col) {
  const X0 = p.x0 - o, Z0 = p.z0 - o, X1 = p.x1 + o, Z1 = p.z1 + o;
  q.walls(X0, Z0, X1, Z1, y0, y1, null, col);
  for (const [a, b, c, d] of [[X0, Z0, X1, p.z0], [X0, p.z1, X1, Z1], [X0, p.z0, p.x0, p.z1], [p.x1, p.z0, X1, p.z1]]) { q.top(a, b, c, d, y1, 0, col); q.under(a, b, c, d, y0, col); }
}

/**
 * Depth on one building's front (into its chunk's near-only buffers D) and the things hung on it or
 * standing on its roof (into bits, for city.js's props). F: its facade; base: where its storeys start.
 * (Run twice with the same random numbers: for the bits when the city is made, for the geometry when
 * the building's chunk is.)
 */
export function dressBuilding(b, F, D, base, CELLS, bits = null) {
  const R = rng(b.id * 7919 + 17), pq = D('plain'), mq = D('metal'), Ff = F.floor, trim = shade(F.trim || '#888', .92), p0 = b.parts[0];
  const storeys = (p, y0) => { const out = []; for (let f = 0; ; f++) { const y = base + f * Ff; if (y + Ff > p.y1 + .01) break; if (y >= y0 - .01) out.push([f, y]); } return out; };
  b.parts.forEach((p, k) => {
    const y0 = k === 0 ? base : p.y0;
    if (F.kind === 'punched' && b.facade !== 'concrete') {
      // a stone ledge along every storey at its sills
      for (const [, y] of storeys(p, y0)) ring(pq, p, .09, y + Ff * .145, y + Ff * .215, trim);
    } else if (F.kind === 'curtain' && b.facade !== 'dark') {
      // fins between the bays, the height of the part
      for (let s = 0; s < 4; s++) { const w = side(p, s), n = Math.max(1, Math.round(w.L / F.win)); for (let i = 1; i < n; i++) { const t = i * w.L / n; wbox(pq, w, t - .06, t + .06, 0, .32, y0, p.y1, trim, false); } }
    } else if (b.facade === 'dark') {
      for (const [, y] of storeys(p, y0)) ring(pq, p, .16, y + Ff * .17, y + Ff * .22, trim);
    }
  });
  // sills under a house's windows (where its picture has one: facadeTex leaves some cells blank)
  if (F.kind === 'house') for (let s = 0; s < 4; s++) {
    const w = side(p0, s), n = Math.max(1, Math.round(w.L / F.win)), bw = w.L / n;
    for (const [f, y] of storeys(p0, base)) for (let i = 0; i < n; i++) {
      const cx = (b.u + s * 3 + i) % CELLS, cy = (b.v + f) % CELLS; if ((cx * 7 + cy * 3) % 5 > 2) continue;
      wbox(pq, w, (i + .27) * bw, (i + .73) * bw, 0, .13, y + Ff * .2, y + Ff * .25, C('#f2f0ea'));
    }
  }
  // balconies up the street side of a plaster or concrete block
  if ((b.facade === 'plaster' || b.facade === 'concrete') && b.floors >= 3 && R() < .65 && !b.fire) {
    const w = side(p0, b.face), n = Math.max(1, Math.round(w.L / F.win)), bw = w.L / n, every = R() < .5 ? 1 : 2, from = R() * every | 0, deep = b.facade === 'concrete' ? 1.15 : .55;
    const slabCol = shade(F.wall, .9), rail = shade(F.wall, .82);
    for (const [f, y] of storeys(p0, base)) {
      if (f === 0) continue;
      for (let i = from; i < n; i += every) {
        const t0 = (i + .1) * bw, t1 = (i + .9) * bw;
        wbox(pq, w, t0, t1, 0, deep, y - .06, y + .1, slabCol);
        if (b.facade === 'concrete') { wbox(pq, w, t0, t1, deep - .08, deep, y + .1, y + 1.05, rail); for (const t of [t0, t1 - .06]) wbox(pq, w, t, t + .06, 0, deep - .08, y + .1, y + 1.05, rail); }
        else { wbox(mq, w, t0, t1, deep - .03, deep, y + 1, y + 1.04, null); for (let t = t0; t <= t1 + 1e-3; t += .12) wbox(mq, w, t, t + .018, deep - .03, deep - .01, y + .1, y + 1, null, false); }   // (iron: the metal buffer has no colours)
      }
    }
  }
  // air-con boxes under some windows (not on glass towers or houses), and things on a flat roof
  if (F.kind === 'punched') for (let s = 0; s < 4; s++) {
    const w = side(p0, s), n = Math.max(1, Math.round(w.L / F.win)), bw = w.L / n;
    for (const [f, y] of storeys(p0, base)) {
      if (f === 0 || f > 9) continue;
      for (let i = 0; i < n; i++) if (R() < .07) { const t = (i + .5) * bw; bits?.push({ kind: 'ac', x: w.ax + w.dx * t + w.nx * .02, y: y + Ff * .07, z: w.az + w.dz * t + w.nz * .02, s: 1, rot: Math.atan2(w.nx, w.nz) }); }
    }
  }
  const top = b.parts.at(-1);
  if (b.roof !== 'gable' && F.kind !== 'house') {
    const rw = top.x1 - top.x0, rd = top.z1 - top.z0, inset = 1.8;
    const spot = () => ({ x: top.x0 + inset + R() * Math.max(0, rw - 2 * inset), z: top.z0 + inset + R() * Math.max(0, rd - 2 * inset) });
    if (rw * rd > 70 && R() < .8) { const p = spot(); bits?.push({ kind: 'hut', x: p.x, y: top.y1, z: p.z, s: 1, rot: (R() * 4 | 0) * Math.PI / 2 }); }
    for (let k = 1 + R() * 3 | 0; k-- > 0;) { const p = spot(); bits?.push({ kind: 'vent', x: p.x, y: top.y1, z: p.z, s: .8 + R() * .5, rot: 0 }); }
    if (R() < .35) { const p = spot(); bits?.push({ kind: 'dish', x: p.x, y: top.y1, z: p.z, s: .8 + R() * .4, rot: R() * Math.PI * 2 }); }
  }
}

const NOQ = { slab() {}, quad() {}, walls() {}, top() {}, under() {} };
/**
 * The things a building's dressing hangs on it or stands on its roof, into b.bits, and which of its sides face
 * a street, into b.streets (a corner building has two): when the city is made. block: the building's block.
 */
export function dressBits(b, F, base, CELLS, block) {
  dressBuilding(b, F, () => NOQ, base, CELLS, b.bits);
  const p = b.parts[0], w = block.sw, near = (a, c) => Math.abs(a - c) < 1.2;
  b.streets = [near(p.z0, block.z0 + w), near(p.x1, block.x1 - w), near(p.z1, block.z1 - w), near(p.x0, block.x0 + w)].map((on, s) => on ? s : -1).filter(s => s >= 0);
  if (!b.streets.length) b.streets = [b.face];
}

/**
 * A shopfront's depth on its street sides: pilasters between the bays, a fascia over them and a sign for
 * each shop (one or two bays) with its own name. Its awnings go under the fascia (city.js).
 */
export function dressShops(b, D, base, g0) {
  const R = rng(b.id * 104729 + 3), pq = D('plain'), sq = D('signs');
  const fascia = R.pick(['#2a2826', '#1e2a34', '#3a2a22', '#2c3a30', '#e2dcd0', '#5a1e1e']), pil = C(R.pick(['#8a847a', '#2a2a2c', '#b8ae9c', '#4a4440']));
  for (const s of b.streets || [b.face]) shopfront(b.parts[0], s, R, pq, sq, base, C(fascia), pil);
}
function shopfront(p0, s, R, pq, sq, base, fascia, pil) {
  const w = side(p0, s), n = Math.max(1, Math.round(w.L / 5)), bw = w.L / n;
  wbox(pq, w, -.05, w.L + .05, 0, .2, base - 1.08, base - .08, fascia);
  for (let i = 0; i <= n; i++) { const t = Math.max(.02, Math.min(w.L - .02, i * bw)); wbox(pq, w, t - .17, t + .17, 0, .13, KERB, base - 1.08, pil, false); }
  for (let i = 0; i < n;) {
    const span = i + 1 < n && R() < .45 ? 2 : 1, t0 = i * bw, t1 = (i + span) * bw, sw = Math.min(4.3, (t1 - t0) * .82), sh = Math.min(.8, sw / 5.33), c = (t0 + t1) / 2;   // (a sign as wide for its height as its picture)
    wquad(sq, w, c - sw / 2, c + sw / 2, .205, base - .58 - sh / 2, base - .58 + sh / 2, shopUV(R() * SHOP_NAMES.length | 0));
    i += span;
  }
}

/* ---------- the streets ---------- */

/**
 * Where the street's things go (plain data, from the plan and the city's seed): kerb parking along the
 * roads wide enough for it (and in front of the suburb's houses), name signs at the corners, bins,
 * bollards, parking signs, utility poles and wires. kits: the parked cars' styles (city-cars.js carKit),
 * or none for no parked cars; buildingAt(x, z): the city's; busy: how many cars park, 0..1.
 */
export function dressPlan(plan, seed, { kits = null, buildingAt, style = 'downtown', busy = 1 }) {
  const R = rng(seed * 6007 + 41), S = plan.style, out = { parked: [], posts: [], blades: [], bins: [], bollards: [], psigns: [], poles: [], wires: [], drains: [] };
  const P = plan, sideK = P.side === 'left' ? -1 : 1, fill = ({ downtown: .38, oldtown: .5, harbour: .3, suburb: .45 }[style] ?? .4) * busy;   // (fewer on slower phones)
  const COLOURS = ['#e8e8ea', '#202226', '#8a9096', '#5c6670', '#a42a24', '#22408a', '#2e5e48', '#d8cfc0', '#3c3c44', '#7a1e30', '#c46a20', '#4b7fa8', '#9a8a70'];
  const doors = P.spots.door;
  const pickKit = () => { const n = kits.length, r = R(); return Math.min(n - 1, Math.floor(r * r * n * 1.15)); };
  const park = (x, z, heading, k, y = 0) => out.parked.push({ x, y, z, heading, style: k, colour: R.pick(COLOURS), len: kits[k].length, wid: kits[k].width });
  for (const e of P.edges) {
    const A = P.nodes[e.a], B = P.nodes[e.b]; if (e.dx < 0 || e.dz < 0) continue;   // each road once
    const alongX = e.axis === 'x', c = alongX ? A.z : A.x, a = alongX ? A.x + A.hx : A.z + A.hz, b = alongX ? B.x - B.hx : B.z - B.hz, half = e.width / 2;
    if (b - a < 20) continue;
    const at = (s, o) => alongX ? [s, c + o] : [c + o, s];
    for (const sgn of [-1, 1]) {
      // drains in the gutter
      for (let s = a + 9 + R() * 6; s < b - 8; s += 22 + R() * 10) { const [x, z] = at(s, sgn * (half - .32)); out.drains.push({ x, z, alongX }); }
      // the cars on this side drive this way (the side of the road they keep to is on their right, or left)
      const dir = sgn * sideK, hx = alongX ? dir : 0, hz = alongX ? 0 : dir, heading = Math.atan2(hx, hz), outer = (e.lanes - .5) * LANE + .2 + 1.0;
      const room = half - .25 - outer;
      if (kits && room >= 2.1 && !S.houses) {
        for (let s = a + 9; s < b - 9;) {
          const k = pickKit(), len = kits[k].length, o = half - .22 - kits[k].width / 2;
          if (s + len > b - 9) break;
          // (never across a front door: a game's delivery or pick-up there stays in reach of the road)
          if (R() < fill) { const [x, z] = at(s + len / 2, sgn * o); if (!doors.some(d => Math.hypot(d.x - x, d.z - z) < 5.6)) park(x, z, heading, k); }
          s += len + 1.1 + R() * 1.4;
        }
        // a parking sign every so often on the pavement beside them
        for (let s = a + 14; s < b - 10; s += 34) { const [x, z] = at(s, sgn * (half + .45)); out.psigns.push({ x, z, rot: Math.atan2(-hx, -hz) }); }   // (facing the cars that come along)
      }
      // the suburb's poles and wires, along one side of each road
      if (S.houses && sgn === 1) {
        const pts = []; for (let s = a + 4; s < b - 3; s += 28 + R() * 6) { const [x, z] = at(s, sgn * (half + .55)); out.poles.push({ x, z, rot: alongX ? Math.PI / 2 : 0 }); pts.push([x, z]); }
        for (let i = 1; i < pts.length; i++) for (const o of [-.8, 0, .8]) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i]; out.wires.push([x0 + (alongX ? 0 : o), 7.74, z0 + (alongX ? o : 0), x1 + (alongX ? 0 : o), 7.74, z1 + (alongX ? o : 0), .45]); }
      }
    }
    // the old town's and the harbour's wires across a street, from wall to wall
    if ((style === 'oldtown' || style === 'harbour') && e.lanes === 1) {
      const wallOff = half + (plan.blocks[0]?.sw ?? 3.2);
      for (let s = a + 10 + R() * 8; s < b - 8; s += 16 + R() * 12) {
        const [x0, z0] = at(s, -wallOff - .2), [x1, z1] = at(s + (R() - .5) * 3, wallOff + .2);
        if (!buildingAt(x0 + (alongX ? 0 : -.6), z0 + (alongX ? -.6 : 0)) || !buildingAt(x1 + (alongX ? 0 : .6), z1 + (alongX ? .6 : 0))) continue;
        const y = 6.2 + R() * 2.4; out.wires.push([x0, y, z0, x1, y + (R() - .5) * .8, z1, .35 + R() * .3]);
      }
    }
  }
  // in front of the suburb's houses, a car on the drive now and then
  if (kits && S.houses) for (const bl of P.buildings) {
    if (R() > fill) continue;
    const n = NORMAL[bl.face], along = bl.face % 2 === 0, k = pickKit(), fx = n[0] ? (n[0] > 0 ? bl.x1 : bl.x0) : (bl.x0 + bl.x1) / 2, fz = n[1] ? (n[1] > 0 ? bl.z1 : bl.z0) : (bl.z0 + bl.z1) / 2;
    const o = 2.2, x = fx + n[0] * o + (along ? (R() - .5) * 3 : 0), z = fz + n[1] * o + (along ? 0 : (R() - .5) * 3);
    park(x, z, along ? (R() < .5 ? Math.PI / 2 : -Math.PI / 2) : (R() < .5 ? 0 : Math.PI), k, KERB);
  }
  // a name sign on the corner of each block where two roads meet, bins by some doors and corners, bollards round squares
  const xName = j => (j * 5 + seed * 3) % 16, zName = i => 16 + (i * 7 + seed) % 16;
  for (const bk of P.blocks) {
    const x = bk.x0 + .45, z = bk.z0 + .45;
    out.posts.push({ x, z }); out.blades.push({ x, z, x1: xName(bk.j), z1: zName(bk.i) });
    if (bk.kind === 'plaza') {
      const ring = [[bk.x0 + .7, bk.z0 + .7, bk.x1 - .7, bk.z0 + .7], [bk.x1 - .7, bk.z0 + .7, bk.x1 - .7, bk.z1 - .7], [bk.x1 - .7, bk.z1 - .7, bk.x0 + .7, bk.z1 - .7], [bk.x0 + .7, bk.z1 - .7, bk.x0 + .7, bk.z0 + .7]];
      for (const [x0, z0, x1, z1] of ring) { const L = Math.hypot(x1 - x0, z1 - z0); for (let s = 3; s < L - 2; s += 2.6) out.bollards.push({ x: x0 + (x1 - x0) * s / L, z: z0 + (z1 - z0) * s / L }); }
    }
    if (bk.kind !== 'park' && R() < .5) { const cx = R() < .5 ? bk.x0 + 1.5 : bk.x1 - 1.5, cz = R() < .5 ? bk.z0 + 1.5 : bk.z1 - 1.5; out.bins.push({ x: cx, z: cz, rot: R() * 6 }); }
  }
  if (!S.houses) for (const bl of P.buildings) if (R() < .3 && bl.door) {
    const n = NORMAL[bl.face], along = bl.face % 2 === 0, off = (R() < .5 ? -1 : 1) * (1.6 + R()), back = .55 - 1.2;   // (the door spot is 1.2 m out from the wall)
    out.bins.push({ x: bl.door.x + n[0] * back + (along ? off : 0), z: bl.door.z + n[1] * back + (along ? 0 : off), rot: R() * 6 });
  }
  return out;
}

/** Kerb stones round a block's pavement (into its chunk's buffers): a lighter edge on top and down the face to the road. */
export function kerbs(q, b) {
  const col = C('#b6b2aa'), face = C('#a29e96'), w = .26, y = KERB + .006, o = .012;
  for (const [a, c, d, e] of [[b.x0, b.z0, b.x1, b.z0 + w], [b.x0, b.z1 - w, b.x1, b.z1], [b.x0, b.z0 + w, b.x0 + w, b.z1 - w], [b.x1 - w, b.z0 + w, b.x1, b.z1 - w]]) q.top(a, c, d, e, y, 0, col);
  q.walls(b.x0 - o, b.z0 - o, b.x1 + o, b.z1 + o, -.02, y, null, face);
}

/** A corner's name blades on their post (into the chunk's sign buffer): one along each road, readable from both sides. */
export function blades(q, s) {
  const y0 = 2.82, h = .2, L = 1.0, t = .018, x = s.x, z = s.z;
  const face = (a, b, c, d, uv) => q.quad(a, b, c, d, [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]]);   // (a to b runs left to right, seen from the front)
  let uv = streetUV(s.x1);   // along x, naming the road on the block's z0 side
  face([x + L, y0, z - t], [x, y0, z - t], [x, y0 + h, z - t], [x + L, y0 + h, z - t], uv);
  face([x, y0, z + t], [x + L, y0, z + t], [x + L, y0 + h, z + t], [x, y0 + h, z + t], uv);
  uv = streetUV(s.z1);       // along z, naming the road on its x0 side, a little lower
  const y1 = y0 - .24;
  face([x - t, y1, z], [x - t, y1, z + L], [x - t, y1 + h, z + L], [x - t, y1 + h, z], uv);
  face([x + t, y1, z + L], [x + t, y1, z], [x + t, y1 + h, z], [x + t, y1 + h, z + L], uv);
}

/** Wires as thin crossed ribbons that sag between their ends: [x0, y0, z0, x1, y1, z1, sag] each. */
export function wires(q, list) {
  const col = C('#1a1a1c'), r = .022, N = 8;
  for (const [x0, y0, z0, x1, y1, z1, sag] of list) {
    const P = u => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - sag * 4 * u * (1 - u), z0 + (z1 - z0) * u];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, sx = -dz / l * r, sz = dx / l * r;
    for (let i = 0; i < N; i++) {
      const a = P(i / N), b = P((i + 1) / N);
      q.quad([a[0] - sx, a[1], a[2] - sz], [b[0] - sx, b[1], b[2] - sz], [b[0] + sx, b[1], b[2] + sz], [a[0] + sx, a[1], a[2] + sz], undefined, col);   // flat, seen from below
      q.quad([a[0], a[1] - r, a[2]], [b[0], b[1] - r, b[2]], [b[0], b[1] + r, b[2]], [a[0], a[1] + r, a[2]], undefined, col);                             // upright, seen from the side
    }
  }
}

/** A drain in the gutter (into the road paint's buffer): a frame, a dark grate and its bars. */
export function drain(q, d, y) {
  const fr = C('#55534e'), dk = C('#121212'), bar = C('#3a3a38'), [hw, hl] = d.alongX ? [.26, .46] : [.46, .26];
  q.top(d.x - hw - .06, d.z - hl - .06, d.x + hw + .06, d.z + hl + .06, y, 0, fr);
  q.top(d.x - hw, d.z - hl, d.x + hw, d.z + hl, y + .001, 0, dk);
  for (let k = -2; k <= 2; k++) d.alongX ? q.top(d.x - hw, d.z + k * .16 - .025, d.x + hw, d.z + k * .16 + .025, y + .002, 0, bar) : q.top(d.x + k * .16 - .025, d.z - hl, d.x + k * .16 + .025, d.z + hl, y + .002, 0, bar);
}
