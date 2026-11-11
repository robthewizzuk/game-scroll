// gs.city: a made-up 3D city from a seed, for Next Gen (and Console) games. Streets, blocks and
// buildings with lit windows, shops, roof tanks and fire escapes, pavements with trees and lamps,
// traffic that keeps to its lanes and stops at the lights, people who walk the pavements and cross
// at the corners, and the hum of it all. The same seed always makes the same city.
//
//   const { City } = gs.city;
//   reset() {
//     if (!city) city = new City(view, { seed: 42, blocks: 6, style: 'downtown', traffic: 1, people: 1 });
//     city.reset();                                           // cars and people back to the start
//   }
//   update(dt) { city.avoid(player, 1.2); city.update(dt, player); }   // cars brake for the player
//   city.night = .8 (or { sky } from gs.sky: it follows sky.night)
//
// The kit gives answers; the game sets the rules and draws its own HUD:
//   city.collide(p, r)        pushes a walker or car out of buildings (true if it touched one)
//   city.ray(from, dir, far)  the first building along a ray: { point, normal, dist, building }
//   city.route(a, b)          a driving route along the roads: { points, path (gs.paths Path), length }
//   city.spot('door' | 'rooftop' | 'corner' | 'street' | 'pavement' | 'park', { near, min, max, rnd })
//   city.buildingAt(x, z), city.ground(x, z), city.road(x, z) (the nearest lane: { x, z, heading })
//   city.cars.list / near(p, r) / hit(p, r) / bump(car)       the traffic
//   city.people.list / near(p, r) / hit(p, r) / scare(p, r) / knock(person, dx, dz)
//   city.walls() (meshes for gs.camera's walls), city.solid(world3d) (buildings in gs.physics3d)
//   city.plan (the layout as plain data, for a minimap of your own) and city.drawMap(c, ...)
//
// Phones: buildings are merged into a few meshes per chunk and built a few at a time, nearest first;
// trees, lamps and roof things are gs.props (culled, simpler far away); cars and people are instanced
// and only live within a radius of the player, and how many follows the phone's speed. Stock three.js
// materials and canvas textures only, so it draws the same on WebGL and WebGPU.
//
// The facade colours, window sizes and lit-window numbers, and the idea of streaming detail round the
// player, come from Slop New York by Mr.doob (MIT, github.com/mrdoob/slop-newyork); the city here is
// made up, with no map data.

import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DynamicDrawUsage, Group,
  IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, LinearMipmapLinearFilter, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, NoColorSpace, Object3D, PlaneGeometry, Quaternion, RepeatWrapping,
  SRGBColorSpace, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, makeNoise } from './math.js';
import { Props, simplify, simplifyReady } from './props.js';
import { Path } from './paths.js';
import { tree } from './outdoors.js';
import { phoneClass } from './speed.js';
import { sendUsed } from './gpu.js';
import { bed, tone, Ears } from './sound.js';
import { pause, built } from './slices.js';

/* ---------- looks ---------- */

/**
 * Facades: wall, trim and glass colours, window width and storey height (metres), how many windows
 * are lit at night (lit) and how warm their light is (warm 0 = cool white, 1 = lamp orange). kind:
 * 'punched' (windows in a wall), 'curtain' (all glass in a frame), 'house' (siding, few windows),
 * 'shed' (warehouse: high strip windows).
 */
export const FACADES = {
  stone: { kind: 'punched', wall: '#d8cdb8', trim: '#9e937f', glass: '#1a2836', win: 2.6, floor: 3.7, lit: .54, warm: .8 },
  brick: { kind: 'punched', wall: '#a45a45', trim: '#cab9a0', glass: '#16222e', win: 2.4, floor: 3.5, lit: .56, warm: .86, bricks: true },
  plaster: { kind: 'punched', wall: '#e3d3ae', trim: '#f4ecdc', glass: '#1c2630', win: 2.5, floor: 3.3, lit: .6, warm: .9 },
  concrete: { kind: 'punched', wall: '#9c9a92', trim: '#7d7b74', glass: '#1b232b', win: 2.2, floor: 3.4, lit: .5, warm: .6 },
  glass: { kind: 'curtain', glass: '#1a3a52', trim: '#3b4c5b', win: 2.7, floor: 3.9, lit: .6, warm: .52, metal: .55 },
  dark: { kind: 'curtain', glass: '#242220', trim: '#3c3631', win: 2.5, floor: 3.8, lit: .64, warm: .72, metal: .5 },
  silver: { kind: 'curtain', glass: '#264664', trim: '#b0bcc8', win: 2.9, floor: 4.1, lit: .58, warm: .48, metal: .6 },
  house: { kind: 'house', wall: '#e8e2d4', trim: '#ffffff', glass: '#22303a', win: 3.4, floor: 2.9, lit: .45, warm: .92 },
  shed: { kind: 'shed', wall: '#7c5444', trim: '#5e4136', glass: '#1d2328', win: 4, floor: 5, lit: .35, warm: .7, bricks: true },
};

/**
 * City styles. block: [min, max] block size (m); street / avenue: road widths (avenues every
 * `every` roads, with two lanes each way); floors: [min, max] storeys; tall: storeys at the busiest
 * middle (core: how strongly the middle rises); facades: how often each is picked; shops: chance a
 * building has shops on the ground floor; parks / plazas: chance a block is one; trees: per pavement
 * spot; houses: detached houses with gardens and roofs; water: 'south' puts a harbour on that side.
 */
export const STYLES = {
  downtown: { block: [62, 92], street: 11, avenue: 17, every: 3, floors: [4, 12], tall: 42, core: 1, gap: .1, shops: .75, parks: .06, plazas: .05, trees: .45,
    facades: { stone: 2, brick: 2, glass: 3, dark: 2, silver: 1.2 }, setbacks: .6, tanks: .4, fire: .25, ground: '#3b3d40', pavement: '#a8a49c' },
  oldtown: { block: [48, 70], street: 9, avenue: 13, every: 4, floors: [3, 6], tall: 8, core: .5, gap: .05, shops: .85, parks: .08, plazas: .08, trees: .6,
    facades: { brick: 4, plaster: 3, stone: 2 }, setbacks: 0, tanks: .5, fire: .45, ground: '#3e3c3a', pavement: '#b4aa98' },
  harbour: { block: [60, 96], street: 11, avenue: 15, every: 3, floors: [1, 4], tall: 7, core: .4, gap: .3, shops: .3, parks: .04, plazas: .04, trees: .3,
    facades: { shed: 4, brick: 2, concrete: 2 }, setbacks: 0, tanks: .25, fire: .2, water: 'south', ground: '#3a3c3e', pavement: '#9d9a93' },
  suburb: { block: [56, 80], street: 9, avenue: 12, every: 5, floors: [1, 2], tall: 2, core: 0, gap: 1, shops: .04, parks: .12, plazas: 0, trees: 1.2, houses: true,
    facades: { house: 1 }, setbacks: 0, tanks: 0, fire: 0, ground: '#404244', pavement: '#b8b3a8' },
};
const HOUSE_COLOURS = ['#e8e2d4', '#d9e4ea', '#efe1c4', '#dcd0e2', '#e6d3c8', '#cfdccb', '#f2efe6'];
const CAR_COLOURS = ['#e8e8ea', '#202226', '#8a9096', '#5c6670', '#a42a24', '#22408a', '#2e5e48', '#d8cfc0', '#3c3c44', '#7a1e30', '#c46a20', '#4b7fa8'];
const SHIRTS = ['#d44a3c', '#3d6fb6', '#e8c33a', '#3e9a64', '#ececec', '#2a2a30', '#a05ab8', '#e27a2e', '#6fb7c8', '#c8a07a'];
const PANTS = ['#2a3242', '#3a3a3a', '#5a4a38', '#24324f', '#6a6a70', '#1d1d22'];
const SKIN = ['#f1c9a5', '#d9a47a', '#b9805a', '#8d5a3c', '#6a4028', '#f5d6bc'];

const LANE = 3.2, KERB = .15;

/* ---------- the layout (plain data, no three.js) ---------- */

const pickWeighted = (R, w) => { let t = 0; for (const k in w) t += w[k]; let x = R() * t; for (const k in w) { x -= w[k]; if (x <= 0) return k; } return Object.keys(w)[0]; };

/**
 * The plan of a city: roads, junctions, blocks, buildings and spots, as plain numbers (no three.js),
 * so a game can draw a map or work out a route without the 3D. blocks: a number or [nx, nz];
 * block: [min, max] size; style: a name in STYLES or your own style object (missing keys from
 * downtown); side: 'right' (drive on the right) or 'left'.
 */
export function layout({ seed = 1, blocks = 6, style = 'downtown', side = 'right', ...over } = {}) {
  const S = { ...STYLES.downtown, ...(typeof style === 'string' ? STYLES[style] || {} : style), ...over };
  const R = rng(seed), noise = makeNoise(seed * 7 + 3);
  const [nx, nz] = Array.isArray(blocks) ? blocks : [blocks, blocks];
  const widths = n => Array.from({ length: n + 1 }, (_, i) => i % S.every === 0 || i === n ? S.avenue : S.street);
  const wx = widths(nx), wz = widths(nz);
  const sizes = n => Array.from({ length: n }, () => S.block[0] + R() * (S.block[1] - S.block[0]));
  const bx = sizes(nx), bz = sizes(nz);
  const lines = (w, b) => { const o = [0]; for (let i = 0; i < b.length; i++) o.push(o[i] + w[i] / 2 + b[i] + w[i + 1] / 2); const mid = o.at(-1) / 2; return o.map(v => v - mid); };
  const xs = lines(wx, bx), zs = lines(wz, bz);
  const plan = { seed, style: S, side, nx, nz, xs, zs, wx, wz, blocks: [], buildings: [], nodes: [], edges: [], trees: [], lamps: [], benches: [], spots: { door: [], rooftop: [], corner: [], park: [] } };
  plan.bounds = { x0: xs[0] - wx[0] / 2, x1: xs[nx] + wx[nx] / 2, z0: zs[0] - wz[0] / 2, z1: zs[nz] + wz[nz] / 2 };
  const span = Math.max(plan.bounds.x1 - plan.bounds.x0, plan.bounds.z1 - plan.bounds.z0);
  // the busy middle: tall buildings gather round it (a little off-centre, so cities differ)
  const core = { x: (R() - .5) * span * .25, z: (R() - .5) * span * .25 };
  const coreAt = (x, z) => { const d = Math.hypot(x - core.x, z - core.z) / (span * .55); return Math.max(0, Math.min(1, (1 - d) * (.85 + .3 * noise(x * .004, z * .004)))) ** 1.6 * S.core; };

  // junctions and the roads between them (one directed edge each way)
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) plan.nodes.push({ id: i * (nz + 1) + j, i, j, x: xs[i], z: zs[j], hx: wx[i] / 2, hz: wz[j] / 2, out: [], phase: (i * 3.1 + j * 1.7) % 25 });
  const node = (i, j) => plan.nodes[i * (nz + 1) + j];
  const link = (a, b, width) => {
    for (const [p, q] of [[a, b], [b, a]]) {
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
      const e = { id: plan.edges.length, a: p.id, b: q.id, len, dx: dx / len, dz: dz / len, axis: dx ? 'x' : 'z', lanes: width >= 15 ? 2 : 1, width, speed: width >= 15 ? 13 : 10 };
      plan.edges.push(e); p.out.push(e.id);
    }
  };
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    if (i < nx) link(node(i, j), node(i + 1, j), wz[j]);
    if (j < nz) link(node(i, j), node(i, j + 1), wx[i]);
  }
  for (const n of plan.nodes) n.signal = n.out.length >= 3;

  // blocks: parks and plazas here and there, buildings round the edge of the rest
  const sw = S.houses ? 2.6 : 3.2;   // pavement width
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const b = { id: plan.blocks.length, i, j, x0: xs[i] + wx[i] / 2, x1: xs[i + 1] - wx[i + 1] / 2, z0: zs[j] + wz[j] / 2, z1: zs[j + 1] - wz[j + 1] / 2, sw, kind: 'build' };
    const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1, r = R();
    if (!edge && r < S.parks) b.kind = 'park'; else if (r < S.parks + S.plazas && !S.houses) b.kind = 'plaza';
    plan.blocks.push(b);
  }
  // a city always gets at least one park (people need somewhere to sit)
  if (!plan.blocks.some(b => b.kind === 'park') && plan.blocks.length > 4) { const inner = plan.blocks.filter(b => b.i > 0 && b.j > 0 && b.i < nx - 1 && b.j < nz - 1); (inner.length ? R.pick(inner) : plan.blocks[0]).kind = 'park'; }

  const fNames = Object.keys(S.facades);
  for (const b of plan.blocks) {
    const ix0 = b.x0 + sw, ix1 = b.x1 - sw, iz0 = b.z0 + sw, iz1 = b.z1 - sw, w = ix1 - ix0, d = iz1 - iz0;
    // pavement trees and lamps, along each side, a little in from the kerb
    const sides = [[b.x0 + .9, b.z0 + .9, b.x1 - .9, b.z0 + .9, 0], [b.x1 - .9, b.z0 + .9, b.x1 - .9, b.z1 - .9, 1], [b.x1 - .9, b.z1 - .9, b.x0 + .9, b.z1 - .9, 2], [b.x0 + .9, b.z1 - .9, b.x0 + .9, b.z0 + .9, 3]];
    for (const [x0, z0, x1, z1, k] of sides) {
      const L = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 7; s < L - 7; s += 9 + R() * 5) if (R() < S.trees * (b.kind === 'park' ? 1.6 : 1)) plan.trees.push({ x: x0 + (x1 - x0) * s / L, z: z0 + (z1 - z0) * s / L, s: .8 + R() * .5, kind: R() < .7 ? 'round' : 'pine' });
      if ((k + b.i + b.j) % 2 === 0) for (let s = 12; s < L - 6; s += 26) plan.lamps.push({ x: x0 + (x1 - x0) * s / L, z: z0 + (z1 - z0) * s / L, face: [Math.PI / 2, 0, -Math.PI / 2, Math.PI][k] });
    }
    for (const [x, z] of [[b.x0 + sw / 2, b.z0 + sw / 2], [b.x1 - sw / 2, b.z0 + sw / 2], [b.x1 - sw / 2, b.z1 - sw / 2], [b.x0 + sw / 2, b.z1 - sw / 2]]) plan.spots.corner.push({ x, y: KERB, z, block: b.id });
    if (b.kind === 'park') {
      const n = Math.round(w * d / 140);
      for (let k = 0; k < n; k++) plan.trees.push({ x: ix0 + 3 + R() * (w - 6), z: iz0 + 3 + R() * (d - 6), s: .9 + R() * .8, kind: R() < .6 ? 'round' : 'pine' });
      for (let k = 0; k < 6; k++) plan.spots.park.push({ x: ix0 + 4 + R() * (w - 8), y: KERB, z: iz0 + 4 + R() * (d - 8), block: b.id });
      for (let k = 0; k < 4; k++) plan.benches.push({ x: ix0 + 2 + R() * (w - 4), z: iz0 + 2 + R() * (d - 4), rot: R() * Math.PI });
      continue;
    }
    if (b.kind === 'plaza') {
      for (let k = 0; k < 4; k++) plan.benches.push({ x: ix0 + 3 + R() * (w - 6), z: iz0 + 3 + R() * (d - 6), rot: (R() * 4 | 0) * Math.PI / 2 });
      plan.spots.park.push({ x: (ix0 + ix1) / 2, y: KERB, z: (iz0 + iz1) / 2, block: b.id });
      continue;
    }
    // lots round the edge of the block, each facing its street (corners go with the north and south sides)
    const depth = S.houses ? Math.min(24, d / 2) : Math.min(30, d / 2, w / 2), lots = [];
    const split = (len, min, max) => { const out = []; let s = 0; while (len - s > max) { const f = min + R() * (max - min); out.push([s, s + f]); s += f; } if (len - s >= min * .6 || !out.length) out.push([s, len]); else out[out.length - 1][1] = len; return out; };
    const [fmin, fmax] = S.houses ? [15, 21] : [10, 26];
    for (const [a, c] of split(w, fmin, fmax)) { lots.push({ x0: ix0 + a, x1: ix0 + c, z0: iz0, z1: iz0 + depth, face: 0 }); lots.push({ x0: ix0 + a, x1: ix0 + c, z0: iz1 - depth, z1: iz1, face: 2 }); }
    if (d - 2 * depth > fmin * .7) for (const [a, c] of split(d - 2 * depth, fmin, fmax)) { lots.push({ x0: ix1 - depth, x1: ix1, z0: iz0 + depth + a, z1: iz0 + depth + c, face: 1 }); lots.push({ x0: ix0, x1: ix0 + depth, z0: iz0 + depth + a, z1: iz0 + depth + c, face: 3 }); }
    for (const lot of lots) {
      const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2, c = coreAt(cx, cz);
      const g = S.gap * R();
      let { x0, x1, z0, z1 } = lot;
      if (S.houses) {   // set back from the pavement with a garden, gaps either side
        const along = lot.face % 2 === 0, fw = along ? x1 - x0 : z1 - z0, inset = 1.6 + R() * 1.2;
        const keep = Math.min(fw - 2 * inset, 9 + R() * 4), off = (fw - keep) / 2, deep = 7.5 + R() * 3;
        if (along) { x0 += off; x1 = x0 + keep; if (lot.face === 0) { z0 += 4.5; z1 = z0 + deep; } else { z1 -= 4.5; z0 = z1 - deep; } }
        else { z0 += off; z1 = z0 + keep; if (lot.face === 1) { x1 -= 4.5; x0 = x1 - deep; } else { x0 += 4.5; x1 = x0 + deep; } }
      } else { x0 += g; x1 -= g; z0 += g; z1 -= g; }
      if (x1 - x0 < 4 || z1 - z0 < 4) continue;
      let f = S.houses ? 'house' : pickWeighted(R, S.facades);
      let floors = Math.round(S.floors[0] + R() * (S.floors[1] - S.floors[0]));
      floors = Math.max(floors, Math.round(floors + (S.tall - floors) * c * (.55 + R() * .45)));
      if (floors > 14 && FACADES[f].kind === 'punched' && R() < .65) f = R.pick(fNames.filter(n => FACADES[n].kind === 'curtain')) || f;
      const F = FACADES[f], shops = !S.houses && R() < S.shops, g0 = shops ? 4.6 : 0;
      const top = KERB + g0 + floors * F.floor;
      // tall towers step back as they rise
      const parts = [{ x0, x1, z0, z1, y0: KERB, y1: top }];
      if (top > 55 && R() < S.setbacks) {
        parts[0].y1 = KERB + g0 + Math.round(floors * (.3 + R() * .15)) * F.floor;
        let p = parts[0];
        for (let k = 0; k < 3 && p.y1 < top - 8; k++) {
          const s = Math.min(p.x1 - p.x0, p.z1 - p.z0) * (.1 + R() * .08), y1 = k === 2 ? top : Math.min(top, p.y1 + (top - parts[0].y1) * (.4 + R() * .3));
          p = { x0: p.x0 + s, x1: p.x1 - s, z0: p.z0 + s, z1: p.z1 - s, y0: p.y1, y1: k === 2 || y1 > top - 8 ? top : y1 };
          if (p.x1 - p.x0 < 6 || p.z1 - p.z0 < 6) break;
          parts.push(p);
        }
        parts[parts.length - 1].y1 = top;
      }
      const roofTop = parts.at(-1);
      const bld = { id: plan.buildings.length, block: b.id, facade: f, floors, shops, face: lot.face, x0, x1, z0, z1, h: top, parts,
        colour: S.houses ? R.pick(HOUSE_COLOURS) : null, roof: S.houses ? (R() < .8 ? 'gable' : 'flat') : 'flat', u: R() * 8 | 0, v: R() * 8 | 0, bits: [] };
      // on the roof: water tanks on older blocks, boxes of machinery, a mast on the tallest
      if (!S.houses) {
        const rw = roofTop.x1 - roofTop.x0, rd = roofTop.z1 - roofTop.z0, rx = (roofTop.x0 + roofTop.x1) / 2, rz = (roofTop.z0 + roofTop.z1) / 2;
        if (F.kind === 'punched' && top < 60 && R() < S.tanks) bld.bits.push({ kind: 'tank', x: rx + (R() - .5) * rw * .5, y: top, z: rz + (R() - .5) * rd * .5, s: .8 + R() * .4 });
        for (let k = R() * 3 | 0; k-- > 0;) bld.bits.push({ kind: 'hvac', x: rx + (R() - .5) * rw * .6, y: top, z: rz + (R() - .5) * rd * .6, s: .7 + R() * .8 });
        if (top > 90 && R() < .6) bld.bits.push({ kind: 'mast', x: rx, y: top, z: rz, s: 1 + top / 150 });
        if (F.kind === 'punched' && floors >= 3 && floors <= 9 && R() < S.fire) bld.fire = true;
      }
      plan.buildings.push(bld);
      plan.spots.rooftop.push({ x: (roofTop.x0 + roofTop.x1) / 2, y: top + (bld.roof === 'gable' ? 0 : .05), z: (roofTop.z0 + roofTop.z1) / 2, building: bld.id });
      // the front door, on the pavement in front of the building
      const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][lot.face], fx = n[0] ? (n[0] > 0 ? x1 : x0) : (x0 + x1) / 2, fz = n[1] ? (n[1] > 0 ? z1 : z0) : (z0 + z1) / 2;
      const out = S.houses ? 0 : 1.2, door = { x: fx + n[0] * out, y: KERB, z: fz + n[1] * out, nx: n[0], nz: n[1], building: bld.id };
      if (S.houses) { door.x = n[0] ? (n[0] > 0 ? b.x1 - sw / 2 : b.x0 + sw / 2) : fx; door.z = n[1] ? (n[1] > 0 ? b.z1 - sw / 2 : b.z0 + sw / 2) : fz; }
      bld.door = door; plan.spots.door.push(door);
    }
  }
  if (S.water === 'south') plan.water = { z: plan.bounds.z1 };
  return plan;
}

/* ---------- textures, made in code once and shared by every city ---------- */

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const texOf = (cv, srgb = true) => { const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = 4; t.minFilter = LinearMipmapLinearFilter; return t; };
const shade = (hex, k) => { const c = new Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
const mixHex = (a, b, t) => '#' + new Color(a).lerp(new Color(b), t).getHexString();
const TEX = new Map(), MATS = new Map();
const CELLS = 8;   // a facade texture holds 8 x 8 windows; buildings start at different ones so the lit pattern doesn't repeat
const texSize = () => phoneClass() === 'low' ? 256 : 512;

// A facade: colour (with glass and frames), light (lit windows at night) and roughness (glass is smooth).
function facadeTex(name) {
  if (TEX.has(name)) return TEX.get(name);
  pause('Textures');
  const F = FACADES[name], S = texSize(), c = S / CELLS, R = rng(name.length * 977 + name.charCodeAt(0));
  const col = canvas(S, S), em = canvas(S, S), ro = canvas(S, S), g = col.getContext('2d'), e = em.getContext('2d'), r = ro.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const wallCol = F.kind === 'curtain' ? F.trim : F.wall;
  g.fillStyle = wallCol; g.fillRect(0, 0, S, S); r.fillStyle = '#e6e6e6'; r.fillRect(0, 0, S, S);
  if (F.bricks) { g.globalAlpha = .18; g.fillStyle = shade(F.wall, .6); for (let y = 0; y < S; y += 3) { g.fillRect(0, y, S, 1); for (let x = (y / 3 % 2) * 4; x < S; x += 8) g.fillRect(x, y, 1, 3); } g.globalAlpha = 1; }
  if (F.kind === 'house') { g.globalAlpha = .22; g.fillStyle = '#000'; for (let y = 0; y < S; y += 4) g.fillRect(0, y, S, 1); g.globalAlpha = 1; }
  for (let i = 0; i < 400; i++) { g.globalAlpha = R() * .08; g.fillStyle = R() < .5 ? '#000' : '#fff'; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); } g.globalAlpha = 1;
  const warm = F.warm;
  for (let cy = 0; cy < CELLS; cy++) for (let cx = 0; cx < CELLS; cx++) {
    const x = cx * c, y = (CELLS - 1 - cy) * c;   // canvas y runs down; v (floors) runs up
    let wx, wy, ww, wh;
    if (F.kind === 'curtain') { wx = x + c * .04; ww = c * .92; wy = y + c * .04; wh = c * .74; }
    else if (F.kind === 'shed') { wx = x + c * .1; ww = c * .8; wy = y + c * .1; wh = c * .22; if ((cx + cy) % 3 === 1) continue; }
    else if (F.kind === 'house') { if ((cx * 7 + cy * 3) % 5 > 2) continue; wx = x + c * .3; ww = c * .4; wy = y + c * .25; wh = c * .5; }
    else { wx = x + c * .24; ww = c * .52; wy = y + c * .2; wh = c * .58; }
    // the glass reflects a little sky at the top; some windows have blinds down
    const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, shade(F.glass, 1.9)); gr.addColorStop(1, F.glass);
    g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
    const blind = R() < .3 ? R() * .7 : 0;
    if (blind) { g.fillStyle = mixHex(F.trim || '#ccc', '#d8d0c0', .5); g.globalAlpha = .7; g.fillRect(wx, wy, ww, wh * blind); g.globalAlpha = 1; }
    if (F.kind === 'punched' || F.kind === 'house') { g.fillStyle = F.trim; g.fillRect(wx - c * .04, wy + wh, ww + c * .08, c * .05); g.fillRect(wx - c * .02, wy - c * .04, ww + c * .04, c * .04); g.fillStyle = shade(F.glass, .7); g.fillRect(wx + ww / 2 - .5, wy, 1, wh); }
    r.fillStyle = '#1e1e1e'; r.fillRect(wx, wy, ww, wh);
    if (R() < F.lit) {
      const lw = mixHex('#cfe0ff', '#ffc77a', Math.min(1, warm + (R() - .5) * .4)), k = .45 + R() * .55;
      e.fillStyle = shade(lw, k); e.fillRect(wx, wy + wh * blind, ww, wh * (1 - blind));
      if (blind) { e.fillStyle = shade(lw, k * .4); e.fillRect(wx, wy, ww, wh * blind); }
    }
  }
  if (F.kind === 'curtain') { g.fillStyle = shade(F.trim, .8); for (let i = 0; i < CELLS; i++) g.fillRect(0, i * c + c * .78, S, c * .26); }
  const t = { map: texOf(col), light: texOf(em), rough: texOf(ro, false) };
  TEX.set(name, t); built(); return t;
}
// Shop fronts: big lit windows under a sign band, one bay every 5 m.
function shopTex() {
  if (TEX.has('shop')) return TEX.get('shop');
  pause('Textures');
  const S = texSize(), h = S / 4, bays = 4, c = S / bays, R = rng(4242);
  const col = canvas(S, h), em = canvas(S, h), ro = canvas(S, h), g = col.getContext('2d'), e = em.getContext('2d'), r = ro.getContext('2d');
  g.fillStyle = '#2c2a28'; g.fillRect(0, 0, S, h); e.fillStyle = '#000'; e.fillRect(0, 0, S, h); r.fillStyle = '#d0d0d0'; r.fillRect(0, 0, S, h);
  const signs = ['#c8322a', '#1f6aa8', '#2e8a4a', '#d8a020', '#7a3a9a', '#e06a2a', '#20a0a0', '#e8e0d0'];
  for (let i = 0; i < bays; i++) {
    const x = i * c, sc = R.pick(signs);
    g.fillStyle = sc; g.fillRect(x + c * .03, h * .06, c * .94, h * .2);
    e.fillStyle = shade(sc, .8); e.fillRect(x + c * .03, h * .06, c * .94, h * .2);
    g.fillStyle = '#fff'; g.globalAlpha = .85; for (let k = 0; k < 5; k++) g.fillRect(x + c * (.2 + k * .12), h * .12, c * .08, h * .08); g.globalAlpha = 1;
    const gr = g.createLinearGradient(0, h * .32, 0, h); gr.addColorStop(0, '#5a6a78'); gr.addColorStop(1, '#1a2026');
    g.fillStyle = gr; g.fillRect(x + c * .06, h * .32, c * .88, h * .66);
    g.fillStyle = '#121212'; g.fillRect(x + c * .5 - 1, h * .32, 2, h * .66);
    r.fillStyle = '#202020'; r.fillRect(x + c * .06, h * .32, c * .88, h * .66);
    e.fillStyle = mixHex('#ffd9a0', '#fff4e0', R()); e.globalAlpha = .55 + R() * .4; e.fillRect(x + c * .06, h * .32, c * .88, h * .66); e.globalAlpha = 1;
  }
  const t = { map: texOf(col), light: texOf(em), rough: texOf(ro, false) };
  TEX.set('shop', t); built(); return t;
}
// Tiling ground textures: asphalt, paving slabs, grass, gravel roofs, roof tiles.
function groundTex(kind, base) {
  const key = kind + base; if (TEX.has(key)) return TEX.get(key);
  pause('Textures');
  const S = 256, cv = canvas(S, S), g = cv.getContext('2d'), R = rng(kind.length * 31 + 7);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const dots = (n, col, a, size) => { for (let i = 0; i < n; i++) { g.globalAlpha = R() * a; g.fillStyle = col; g.fillRect(R() * S, R() * S, R() * size + .5, R() * size + .5); } g.globalAlpha = 1; };
  if (kind === 'asphalt') { dots(3000, '#000', .35, 2); dots(1500, '#fff', .12, 1.5); g.globalAlpha = .12; g.fillStyle = '#000'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(R() * S, R() * S, 10 + R() * 30, 6 + R() * 18, R() * 3, 0, 7); g.fill(); } g.globalAlpha = 1; }
  else if (kind === 'paving') { dots(1200, '#000', .15, 2); g.fillStyle = shade(base, .72); for (let i = 0; i <= S; i += S / 4) { g.fillRect(i - 1, 0, 2, S); g.fillRect(0, i - 1, S, 2); } }
  else if (kind === 'grass') { for (let i = 0; i < 5000; i++) { g.globalAlpha = .25; g.fillStyle = R() < .5 ? shade(base, .7 + R() * .2) : shade(base, 1.15 + R() * .2); g.fillRect(R() * S, R() * S, 1, 2 + R() * 3); } g.globalAlpha = 1; }
  else if (kind === 'gravel') dots(5000, R() < .5 ? '#000' : '#fff', .25, 2);
  else if (kind === 'tiles') { g.fillStyle = shade(base, .7); for (let y = 0; y < S; y += 16) { g.fillRect(0, y, S, 2); for (let x = (y / 16 % 2) * 12; x < S; x += 24) g.fillRect(x, y, 2, 16); } dots(800, '#000', .15, 2); }
  const t = texOf(cv); TEX.set(key, t); built(); return t;
}
// a speck for compiling materials up front (the attributes chunk meshes have: position, normal, uv, colour)
let warmGeo = null;
const WARM_GEO = () => warmGeo ||= (() => { const q = new Quads(); q.box(0, 0, 0, .01, .01, .01, { r: 1, g: 1, b: 1 }, 1); return q.geometry(); })();
// the material a chunk mesh of kind k uses (k: 'f:<facade>', 'shop', 'roof', 'tiles', 'plain', 'metal', 'pave', 'plaza', 'grass')
const chunkMat = (k, S) => k.startsWith('f:') ? facadeMat(k.slice(2)) : k === 'shop' ? shopMat() : k === 'roof' ? roofMat() : k === 'tiles' ? tileMat() : k === 'plain' ? plainMat() : k === 'metal' ? metalMat()
  : k === 'pave' ? pavingMat(S.pavement) : k === 'plaza' ? pavingMat(shade(S.pavement, .85)) : grassMat();
function mat(key, make) { if (!MATS.has(key)) MATS.set(key, make()); return MATS.get(key); }
const facadeMat = name => mat('f:' + name, () => { const T = facadeTex(name), F = FACADES[name];
  return new MeshStandardMaterial({ map: T.map, emissiveMap: T.light, emissive: new Color('#ffffff'), emissiveIntensity: 0, roughnessMap: T.rough, roughness: 1, metalness: F.metal || .05, vertexColors: name === 'house' }); });
const shopMat = () => mat('shop', () => { const T = shopTex(); return new MeshStandardMaterial({ map: T.map, emissiveMap: T.light, emissive: new Color('#ffffff'), emissiveIntensity: .25, roughnessMap: T.rough, roughness: 1, metalness: .1 }); });
const plainMat = () => mat('plain', () => new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .85, metalness: 0 }));
const metalMat = () => mat('metal', () => new MeshStandardMaterial({ color: '#2a2c2e', roughness: .55, metalness: .7 }));
const roofMat = () => mat('roof', () => new MeshStandardMaterial({ map: groundTex('gravel', '#66625c'), roughness: .95 }));
const tileMat = () => mat('tiles', () => new MeshStandardMaterial({ map: groundTex('tiles', '#8a4a3a'), roughness: .8, vertexColors: true }));
const pavingMat = col => mat('pave' + col, () => new MeshStandardMaterial({ map: groundTex('paving', col), roughness: .9 }));
const grassMat = () => mat('grass', () => new MeshStandardMaterial({ map: groundTex('grass', '#4f7a3a'), roughness: 1 }));
const asphaltMat = col => mat('asph' + col, () => new MeshStandardMaterial({ map: groundTex('asphalt', col), roughness: .85 }));
const paintMat = () => mat('paint', () => new MeshStandardMaterial({ vertexColors: true, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const waterMat = () => mat('water', () => new MeshStandardMaterial({ color: '#1b3a4c', roughness: .06, metalness: .2 }));

/* ---------- geometry made from many quads, one buffer per material ---------- */

class Quads {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  // a, b, c, d: corners in order round the face (counter-clockwise seen from the front)
  quad(a, b, c, d, uv = [0, 0, 1, 0, 1, 1, 0, 1], col = null) {
    const k = this.p.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); }
    this.u.push(...uv);
    if (col) for (let j = 0; j < 4; j++) this.c.push(col.r, col.g, col.b);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  tri(a, b, c, uv = [0, 0, 1, 0, .5, 1], col = null) {
    const k = this.p.length / 3, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    for (const q of [a, b, c]) { this.p.push(...q); this.n.push(nx / l, ny / l, nz / l); }
    this.u.push(...uv); if (col) for (let j = 0; j < 3; j++) this.c.push(col.r, col.g, col.b);
    this.i.push(k, k + 1, k + 2);
  }
  // the four walls of a box from y0 to y1; uvOf(side, length, y0, y1) gives the uvs of each wall
  walls(x0, z0, x1, z1, y0, y1, uvOf, col = null) {
    const sides = [[[x1, z0], [x0, z0]], [[x1, z1], [x1, z0]], [[x0, z1], [x1, z1]], [[x0, z0], [x0, z1]]];
    sides.forEach(([[ax, az], [bx, bz]], s) => this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], uvOf ? uvOf(s, Math.hypot(bx - ax, bz - az), y0, y1) : undefined, col));
  }
  top(x0, z0, x1, z1, y, uvScale = 0, col = null) {
    const s = uvScale; this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], s ? [x0 / s, -z1 / s, x1 / s, -z1 / s, x1 / s, -z0 / s, x0 / s, -z0 / s] : undefined, col);
  }
  box(x0, y0, z0, x1, y1, z1, col = null, uvScale = 0) { this.walls(x0, z0, x1, z1, y0, y1, uvScale ? (s, L, a, b) => [0, a / uvScale, L / uvScale, a / uvScale, L / uvScale, b / uvScale, 0, b / uvScale] : null, col); this.top(x0, z0, x1, z1, y1, uvScale, col); }
  get empty() { return !this.i.length; }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.u), 2));
    if (this.c.length) g.setAttribute('color', new BufferAttribute(new Float32Array(this.c), 3));
    const n = this.p.length / 3; g.setIndex(new BufferAttribute(n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const C = hex => new Color(hex);

// One building into the chunk's buffers (by material). d: the detail buffers (shops' awnings,
// cornices, fire escapes), hidden far away.
function buildBuilding(b, Q, D) {
  const F = FACADES[b.facade], fq = Q('f:' + b.facade), g0 = b.shops ? 4.6 : 0, base = KERB + g0;
  const tint = b.colour ? C(b.colour) : null;
  const facadeUV = (part, s, L, y0, y1) => {
    const n = Math.max(1, Math.round(L / F.win)), u0 = (b.u + s * 3) / CELLS, v0 = b.v / CELLS;
    return [u0, v0 + (y0 - base) / F.floor / CELLS, u0 + n / CELLS, v0 + (y0 - base) / F.floor / CELLS, u0 + n / CELLS, v0 + (y1 - base) / F.floor / CELLS, u0, v0 + (y1 - base) / F.floor / CELLS];
  };
  b.parts.forEach((p, k) => {
    const y0 = k === 0 ? base : p.y0;
    fq.walls(p.x0, p.z0, p.x1, p.z1, y0, p.y1, (s, L, a, c) => facadeUV(p, s, L, a, c), tint);
    if (k > 0) Q('roof').top(b.parts[k - 1].x0, b.parts[k - 1].z0, b.parts[k - 1].x1, b.parts[k - 1].z1, p.y0 + .02, 6);   // the ledge each step leaves
  });
  const p0 = b.parts[0], top = b.parts.at(-1);
  if (b.shops) {
    const sq = Q('shop'), u = (b.u % 4) / 4;
    sq.walls(p0.x0, p0.z0, p0.x1, p0.z1, KERB, base, (s, L) => { const n = Math.max(1, Math.round(L / 5)); return [u, 0, u + n / 4, 0, u + n / 4, 1, u, 1]; });
    // awnings over some shop fronts on the street side
    const R = rng(b.id * 131 + 5), dq = D('plain'), n = [[0, -1], [1, 0], [0, 1], [-1, 0]][b.face];
    const along = b.face % 2 === 0, len = along ? p0.x1 - p0.x0 : p0.z1 - p0.z0, bays = Math.max(1, Math.round(len / 5)), bw = len / bays;
    for (let i = 0; i < bays; i++) {
      if (R() > .45) continue;
      const col = C(R.pick(['#a83228', '#2a5a8a', '#2e6a44', '#c89a2a', '#5a3a6a', '#d8d0c0'])), a = (along ? p0.x0 : p0.z0) + i * bw + .3, c = a + bw - .6;
      const fx = n[0] ? (n[0] > 0 ? p0.x1 : p0.x0) : 0, fz = n[1] ? (n[1] > 0 ? p0.z1 : p0.z0) : 0, y1 = base - .3, y0 = base - 1.3, out = 1.4;
      const P = (t, o, y) => along ? [t, y, fz + n[1] * o] : [fx + n[0] * o, y, t];
      const [q0, q1] = (b.face === 0 || b.face === 1) ? [c, a] : [a, c];
      dq.quad(P(q0, 0, y1), P(q1, 0, y1), P(q1, out, y0), P(q0, out, y0), undefined, col);
      dq.quad(P(q1, 0, y1), P(q0, 0, y1), P(q0, out, y0), P(q1, out, y0), undefined, col);   // and its underside
    }
  }
  // the roof: flat (gravel) or a pitched roof of tiles over the house
  if (b.roof === 'gable') {
    const tq = Q('tiles'), pq = Q('plain'), o = .45, w = top.x1 - top.x0, d = top.z1 - top.z0, y = top.y1, col = C(b.colour || '#ddd'), rc = C(['#ffffff', '#9aa0a8', '#c8b8a0'][b.id % 3]);
    if (w >= d) {
      const zm = (top.z0 + top.z1) / 2, rh = d * .38, x0 = top.x0 - o, x1 = top.x1 + o, z0 = top.z0 - o, z1 = top.z1 + o;
      tq.quad([x0, y, z1], [x1, y, z1], [x1, y + rh, zm], [x0, y + rh, zm], [0, 0, w / 3, 0, w / 3, d / 5, 0, d / 5], rc);
      tq.quad([x1, y, z0], [x0, y, z0], [x0, y + rh, zm], [x1, y + rh, zm], [0, 0, w / 3, 0, w / 3, d / 5, 0, d / 5], rc);
      pq.tri([top.x0, y, top.z0], [top.x0, y, top.z1], [top.x0, y + rh, zm], undefined, col); pq.tri([top.x1, y, top.z1], [top.x1, y, top.z0], [top.x1, y + rh, zm], undefined, col);
    } else {
      const xm = (top.x0 + top.x1) / 2, rh = w * .38, x0 = top.x0 - o, x1 = top.x1 + o, z0 = top.z0 - o, z1 = top.z1 + o;
      tq.quad([x1, y, z1], [x1, y, z0], [xm, y + rh, z0], [xm, y + rh, z1], [0, 0, d / 3, 0, d / 3, w / 5, 0, w / 5], rc);
      tq.quad([x0, y, z0], [x0, y, z1], [xm, y + rh, z1], [xm, y + rh, z0], [0, 0, d / 3, 0, d / 3, w / 5, 0, w / 5], rc);
      pq.tri([top.x1, y, top.z0], [top.x0, y, top.z0], [xm, y + rh, top.z0], undefined, col); pq.tri([top.x0, y, top.z1], [top.x1, y, top.z1], [xm, y + rh, top.z1], undefined, col);
    }
  } else {
    Q('roof').top(top.x0, top.z0, top.x1, top.z1, top.y1, 6);
    // a parapet or cornice round the top
    const pq = D('plain'), o = F.kind === 'punched' ? .35 : .08, col = C(F.trim).multiplyScalar(.72), h = F.kind === 'punched' ? .7 : .9;
    const X0 = top.x0 - o, Z0 = top.z0 - o, X1 = top.x1 + o, Z1 = top.z1 + o, th = .35, y0 = top.y1 - h + .3, y1 = top.y1 + .3;
    pq.walls(X0, Z0, X1, Z1, y0, y1, null, col);
    // its inside faces and its top: a ring round the roof, not a lid over it
    const ix0 = top.x0 + th, iz0 = top.z0 + th, ix1 = top.x1 - th, iz1 = top.z1 - th;
    pq.quad([ix0, top.y1, iz0], [ix1, top.y1, iz0], [ix1, y1, iz0], [ix0, y1, iz0], undefined, col); pq.quad([ix1, top.y1, iz0], [ix1, top.y1, iz1], [ix1, y1, iz1], [ix1, y1, iz0], undefined, col);
    pq.quad([ix1, top.y1, iz1], [ix0, top.y1, iz1], [ix0, y1, iz1], [ix1, y1, iz1], undefined, col); pq.quad([ix0, top.y1, iz1], [ix0, top.y1, iz0], [ix0, y1, iz0], [ix0, y1, iz1], undefined, col);
    pq.top(X0, Z0, X1, iz0, y1, 0, col); pq.top(X0, iz1, X1, Z1, y1, 0, col); pq.top(X0, iz0, ix0, iz1, y1, 0, col); pq.top(ix1, iz0, X1, iz1, y1, 0, col);
  }
  // fire escapes: black iron landings and ladders down the street side
  if (b.fire) {
    const mq = D('metal'), n = [[0, -1], [1, 0], [0, 1], [-1, 0]][b.face], along = b.face % 2 === 0;
    const len = along ? p0.x1 - p0.x0 : p0.z1 - p0.z0, mid = along ? (p0.x0 + p0.x1) / 2 : (p0.z0 + p0.z1) / 2, half = Math.min(4, len / 2 - 1);
    const wall = n[0] ? (n[0] > 0 ? p0.x1 : p0.x0) : (n[1] > 0 ? p0.z1 : p0.z0), sgn = n[0] || n[1];
    const box = (t0, t1, o0, o1, y0, y1) => { const a = wall + sgn * o0, c = wall + sgn * o1; along ? mq.box(t0, y0, Math.min(a, c), t1, y1, Math.max(a, c)) : mq.box(Math.min(a, c), y0, t0, Math.max(a, c), y1, t1); };
    for (let f = 1; f < b.floors; f++) {
      const y = base + f * F.floor - .2;
      box(mid - half, mid + half, .02, 1.2, y, y + .08);              // the landing
      box(mid - half, mid + half, 1.15, 1.2, y + .08, y + 1);         // its rail
      box(mid - half, mid + half, 1.15, 1.2, y + .5, y + .55);
      box(mid - half + .6, mid - half + .7, .4, .9, y - F.floor + .3, y);   // the ladder down
    }
  }
}

// The road paint: centre lines, lane lines, kerb lines, zebra crossings and stop lines.
function buildPaint(plan) {
  const q = new Quads(), W = C('#e4e2da'), Y = C('#e0b22e'), y = .012, sideK = plan.side === 'left' ? -1 : 1;
  const strip = (x0, z0, x1, z1, col) => q.top(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y, 0, col);
  const dashed = (alongX, c, a, b, w, col, on = 3, off = 6) => { for (let s = a + 1; s < b - 1; s += on + off) { const e = Math.min(b - 1, s + on); alongX ? strip(s, c - w / 2, e, c + w / 2, col) : strip(c - w / 2, s, c + w / 2, e, col); } };
  for (const e of plan.edges) {
    const A = plan.nodes[e.a], B = plan.nodes[e.b]; if (e.dx < 0 || e.dz < 0) continue;   // each road once
    const alongX = e.axis === 'x', c = alongX ? A.z : A.x, a = alongX ? A.x + A.hx : A.z + A.hz, b = alongX ? B.x - B.hx : B.z - B.hz, half = e.width / 2;
    if (b - a < 4) continue;
    if (e.lanes === 2) { for (const o of [-.16, .16]) alongX ? strip(a, c + o - .06, b, c + o + .06, Y) : strip(c + o - .06, a, c + o + .06, b, Y); for (const o of [-LANE - .2, LANE + .2]) dashed(alongX, c + o, a, b, .12, W); }
    else dashed(alongX, c, a, b, .12, Y, 3, 4);
    for (const o of [-half + .45, half - .45]) alongX ? strip(a, c + o - .06, b, c + o + .06, W) : strip(c + o - .06, a, c + o + .06, b, W);
    // zebra crossings at both ends, and the stop line just before each, on the side cars arrive on
    for (const [end, dir] of [[a, 1], [b, -1]]) {
      for (let s = -half + .8; s < half - .8; s += 1.1) alongX ? strip(end + dir * .4, c + s, end + dir * 3.2, c + s + .55, W) : strip(c + s, end + dir * .4, c + s + .55, end + dir * 3.2, W);
      // cars driving towards this end travel in -dir; their side of the road is to their right
      const tdx = alongX ? -dir : 0, tdz = alongX ? 0 : -dir, rx = -tdz * sideK, rz = tdx * sideK, sl = end + dir * 3.6;
      const o0 = .2, o1 = half - .3;
      alongX ? strip(sl, c + rz * o0, sl + dir * .45, c + rz * o1, W) : strip(c + rx * o0, sl, c + rx * o1, sl + dir * .45, W);
    }
  }
  return q;
}

// Shapes for the street furniture and roof things (vertex-coloured, so one material draws them all).
function coloured(geo, hex) { const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new Float32Array(n * 3), col = C(hex); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } g.setAttribute('color', new BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g; }
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const SHAPES = {
  lamp: () => mergeGeometries([coloured(at(new CylinderGeometry(.07, .1, 6, 6), 0, 3, 0), '#3a3e42'), coloured(at(new BoxGeometry(1.4, .08, .08), .7, 5.95, 0), '#3a3e42'), coloured(at(new BoxGeometry(.5, .14, .3), 1.35, 5.86, 0), '#2a2c2e')]),
  lamphead: () => at(new BoxGeometry(.42, .05, .24), 1.35, 5.77, 0),
  tank: () => mergeGeometries([...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => coloured(at(new BoxGeometry(.18, 2.2, .18), x * 1.1, 1.1, z * 1.1), '#3a2e26')),
    coloured(at(new CylinderGeometry(1.6, 1.6, 3, 12), 0, 3.7, 0), '#7a5a40'), coloured(at(new CylinderGeometry(.1, 1.75, 1.1, 12), 0, 5.75, 0), '#4a3a30')]),
  hvac: () => mergeGeometries([coloured(at(new BoxGeometry(2.2, 1.2, 1.6), 0, .6, 0), '#9a9c9e'), coloured(at(new CylinderGeometry(.55, .55, .1, 10), .45, 1.25, 0), '#3a3c3e')]),
  mast: () => mergeGeometries([coloured(at(new CylinderGeometry(.12, .3, 14, 6), 0, 7, 0), '#c8ccd0'), coloured(at(new BoxGeometry(.5, .5, .5), 0, 14.2, 0), '#c02020')]),
  bench: () => mergeGeometries([coloured(at(new BoxGeometry(1.8, .08, .5), 0, .45, 0), '#7a5634'), coloured(at(new BoxGeometry(1.8, .45, .07), 0, .72, -.24), '#7a5634'),
    coloured(at(new BoxGeometry(.08, .45, .5), -.8, .22, 0), '#2a2c2e'), coloured(at(new BoxGeometry(.08, .45, .5), .8, .22, 0), '#2a2c2e')]),
  signal: () => mergeGeometries([coloured(at(new CylinderGeometry(.08, .1, 4.4, 6), 0, 2.2, 0), '#2e3236'), coloured(at(new BoxGeometry(.38, 1.1, .34), 0, 4.5, 0), '#1e2022')]),
  hydrant: () => mergeGeometries([coloured(at(new CylinderGeometry(.16, .2, .6, 8), 0, .3, 0), '#c0302a'), coloured(at(new SphereGeometry(.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, .6, 0), '#c0302a')]),
};

// The furniture's shapes and their simpler far-away copies are made once and kept (each city draws its
// own copies of them): the simpler copies are most of the work.
const FURNITURE = {
  tree: [() => tree({ kind: 'round', height: 6.5, leaves: '#4c7a3c', trunk: '#5a4632' }), [70, 160]],
  pine: [() => tree({ kind: 'pine', height: 7, leaves: '#3a6a3e', trunk: '#5a4632' }), [70, 160]],
  lamp: [SHAPES.lamp, [60]], lamphead: [SHAPES.lamphead, []], tank: [SHAPES.tank, [90]], hvac: [SHAPES.hvac, [90]],
  mast: [SHAPES.mast, []], bench: [SHAPES.bench, [50]], signal: [SHAPES.signal, [80]], hydrant: [SHAPES.hydrant, []],
};
const KEEP = [.45, .15], SHAPED = new Map();
let canKeep = false; simplifyReady.then(() => { canKeep = true; });   // (before the simplifier is in, a "simpler" copy isn't: not one to keep)
function shaped(name) {
  let k = SHAPED.get(name);
  if (!k) { pause('Models'); const [make, lod] = FURNITURE[name], geo = make(); k = { geo, lod: lod.map((d, i) => [d, simplify(geo, KEEP[i])]) }; if (canKeep) SHAPED.set(name, k); built(); }
  return k;
}
// a kind of prop from a kept shape: its own copies of the shape and the far-away ones
const furniture = (props, name, material, o) => { const k = shaped(name); return props.kind(name, k.geo.clone(), material, { ...o, lod: k.lod.map(([d, g]) => [d, g.clone()]) }); };

/* ---------- traffic ---------- */

const CAR_LEN = 4.4;
const carGeo = () => mergeGeometries([coloured(at(new BoxGeometry(1.8, .62, 4.4), 0, .55, 0), '#ffffff'), coloured(at(new BoxGeometry(1.56, .55, 2.1), 0, 1.13, -.25), '#2a3038'),
  ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => coloured(at(new BoxGeometry(.28, .58, .62), x * .82, .29, z * 1.38), '#141414'))]);
const vanGeo = () => mergeGeometries([coloured(at(new BoxGeometry(1.9, 1.75, 4.6), 0, 1.12, -.1), '#ffffff'), coloured(at(new BoxGeometry(1.92, .62, .7), 0, 1.6, 1.86), '#2a3038'),
  ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => coloured(at(new BoxGeometry(.28, .6, .66), x * .86, .3, z * 1.45), '#141414'))]);
const lightGeo = z => mergeGeometries([at(new BoxGeometry(.36, .18, .06), -.62, .64, z), at(new BoxGeometry(.36, .18, .06), .62, .64, z)]);
const _m = new Matrix4(), _none = new Matrix4(), _q = new Quaternion(), _s = new Vector3(1, 1, 1), _p = new Vector3(), _up = new Vector3(0, 1, 0), _c = new Color();

/** The cars of a city: they keep to their lanes, stop at red lights and for whatever the game asks them to avoid. */
class Traffic {
  constructor(city, count) {
    this.city = city; this.plan = city.plan; this.max = count; this.list = []; this.avoid = []; this.R = rng(city.seed * 13 + 1); this.radius = 190;
    const P = this.plan; this.sideK = P.side === 'left' ? -1 : 1;
    const paint = mat('carpaint', () => new MeshStandardMaterial({ vertexColors: true, roughness: .32, metalness: .45 }));
    const lit = () => new MeshBasicMaterial({ vertexColors: false, toneMapped: false, color: '#ffffff' });
    this.meshes = {};
    for (const [k, geo] of [['car', carGeo()], ['van', vanGeo()]]) {
      const m = new InstancedMesh(geo, paint, Math.max(1, count)); m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.instanceMatrix.setUsage(DynamicDrawUsage); m.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3); this.meshes[k] = m; city.group.add(m);
    }
    this.head = new InstancedMesh(lightGeo(2.21), lit(), Math.max(1, count)); this.tail = new InstancedMesh(lightGeo(-2.32), lit(), Math.max(1, count));
    this.head.material.color.set('#fff3d6'); this.tail.material.color.set('#ff2c1c');
    for (const m of [this.head, this.tail]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(DynamicDrawUsage); m.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3).fill(1), 3); city.group.add(m); }
  }
  hAt(n, axis) { return axis === 'x' ? n.hx : n.hz; }
  ends(e) { const P = this.plan; return [this.hAt(P.nodes[e.a], e.axis), e.len - this.hAt(P.nodes[e.b], e.axis)]; }
  lanePos(e, k, s, out = {}) { const A = this.plan.nodes[e.a], off = ((k + .5) * LANE + .2) * this.sideK; out.x = A.x + e.dx * s - e.dz * off; out.z = A.z + e.dz * s + e.dx * off; return out; }
  reset(focus) {
    this.list.length = 0; this.R = rng(this.city.seed * 13 + 1);
    for (let i = 0; i < this.max; i++) { const c = this.spawn(focus, 0); if (c) this.list.push(c); }
    this.draw(0);
  }
  spawn(focus, min) {
    const P = this.plan, R = this.R;
    for (let tries = 0; tries < 80; tries++) {
      const e = P.edges[R() * P.edges.length | 0], A = P.nodes[e.a], mx = A.x + e.dx * e.len / 2, mz = A.z + e.dz * e.len / 2, d = Math.hypot(mx - focus.x, mz - focus.z);
      if (d > this.radius || d < min || (!min && R() > Math.exp(-d / 90))) continue;   // busiest round the player
      const [s0, s1] = this.ends(e); if (s1 - s0 < 14) continue;
      const k = R() * e.lanes | 0, s = s0 + 3 + R() * (s1 - s0 - 10);
      if (this.list.some(c => c.edge === e && c.lane === k && !c.turn && Math.abs(c.s - s) < 9)) continue;
      const r = R(), kind = r < .14 ? 'van' : 'car', taxi = kind === 'car' && r > .82;
      const car = { id: this.nextId = (this.nextId || 0) + 1, kind, taxi, colour: taxi ? '#f2c21b' : R.pick(CAR_COLOURS), edge: e, lane: k, s, v: e.speed * .6, vmax: e.speed * (.8 + R() * .3),
        x: 0, z: 0, heading: 0, braking: false, turn: null, plan: null, blocked: 0, stun: 0, honked: 0 };
      this.place(car); return car;
    }
    return null;
  }
  place(c) { if (c.turn) return; const p = this.lanePos(c.edge, c.lane, c.s); c.x = p.x; c.z = p.z; c.heading = Math.atan2(c.edge.dx, c.edge.dz); }
  // where this car goes at the next junction (straight on more often than turning; never back unless it must)
  choose(c) {
    const P = this.plan, B = P.nodes[c.edge.b], R = this.R, opts = [];
    for (const id of B.out) { const e = P.edges[id]; if (e.b === c.edge.a) continue; const cross = c.edge.dx * e.dz - c.edge.dz * e.dx; opts.push([e, cross === 0 ? 3 : 1, cross]); }
    if (!opts.length) { const back = B.out.map(id => P.edges[id]).find(e => e.b === c.edge.a); return { e: back, k: 0 }; }
    let t = opts.reduce((a, o) => a + o[1], 0) * R();
    for (const [e, w, cross] of opts) if ((t -= w) <= 0) {
      // turning towards the kerb side: the outside lane; across the traffic: the inside lane
      const kerb = cross * this.sideK < 0, k = cross === 0 ? Math.min(c.lane, e.lanes - 1) : kerb ? e.lanes - 1 : 0;
      return { e, k };
    }
    return { e: opts[0][0], k: 0 };
  }
  update(dt, focus, t) {
    const P = this.plan, city = this.city, buckets = new Map();
    for (const c of this.list) if (!c.turn) { const k = c.edge.id * 4 + c.lane; let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(c); }
    for (const b of buckets.values()) { b.sort((a, c) => c.s - a.s); b.forEach((c, i) => { c._b = b; c._i = i; }); }
    let noisy = 0;
    for (const c of this.list) {
      let target = c.stun > 0 ? 0 : c.vmax, blocked = false;
      if (c.stun > 0) c.stun -= dt;
      if (!c.turn) {
        const e = c.edge, [, s1] = this.ends(e), b = c._b, i = c._i;
        const follow = gap => { target = Math.min(target, Math.max(0, (gap - 2) * 1.1)); };
        if (i > 0) follow(b[i - 1].s - c.s - CAR_LEN);
        else if (c.ahead && (c.ahead.turn || c.ahead.edge !== e)) follow(Math.hypot(c.ahead.x - c.x, c.ahead.z - c.z) - CAR_LEN - 1);
        const stop = s1 - 3.6 - CAR_LEN / 2, toStop = stop - c.s;
        if (toStop < 40) {
          c.plan ||= this.choose(c);
          const st = city.signal(P.nodes[e.b], e.axis, t);
          if (st !== 'g' && toStop > -.5 && !(st === 'a' && toStop < c.v * c.v / 12 * .6)) follow(toStop + 2);
          // don't drive into the junction when the road out is backed up
          const nb = buckets.get(c.plan.e.id * 4 + c.plan.k), last = nb?.at(-1), [n0] = this.ends(c.plan.e);
          if (last && last.s < n0 + CAR_LEN + 2.5 && toStop > -.5) follow(toStop + 2);
        }
        for (const o of this.avoid) {
          const rx = o.x - c.x, rz = o.z - c.z, fx = Math.sin(c.heading), fz = Math.cos(c.heading), along = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx);
          if (along > 0 && along < 24 && lat < 1.3 + o.r) { follow(along - CAR_LEN / 2 - o.r); blocked = true; }
        }
      }
      c.blocked = blocked ? c.blocked + dt : 0;
      if (c.blocked > 2.2 && c.honked <= 0) { city.honk(c); c.honked = 4 + this.R() * 4; }
      c.honked -= dt;
      const dv = target - c.v; c.braking = dv < -.5 || (c.v < .3 && target < .3);
      c.v = Math.max(0, c.v + Math.max(-10 * dt, Math.min(3.6 * dt, dv)));
      if (c.v > 1) noisy += c.v;
      if (!c.turn) {
        c.s += c.v * dt;
        const [, s1] = this.ends(c.edge);
        if (c.s >= s1) {
          const nx = c.plan || this.choose(c), [n0] = this.ends(nx.e), p0 = this.lanePos(c.edge, c.lane, s1), p2 = this.lanePos(nx.e, nx.k, n0);
          const straight = Math.abs(c.edge.dx * nx.e.dz - c.edge.dz * nx.e.dx) < .5 && c.edge.dx * nx.e.dx + c.edge.dz * nx.e.dz > 0;
          const p1 = straight ? { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 } : c.edge.axis === 'x' ? { x: p2.x, z: p0.z } : { x: p0.x, z: p2.z };
          let len = 0, q = p0; for (let k = 1; k <= 8; k++) { const r = bez(p0, p1, p2, k / 8); len += Math.hypot(r.x - q.x, r.z - q.z); q = r; }
          c.turn = { p0, p1, p2, len: Math.max(1, len), u: (c.s - s1) / Math.max(1, len), next: nx };
          for (const o of this.list) if (o.ahead === c) o.ahead = null;
          c.ahead = null;
          if (c._b[c._i + 1]) c._b[c._i + 1].ahead = c;
          c.plan = null;
        }
      } else {
        const T = c.turn; T.u += c.v * dt / T.len;
        if (T.u >= 1) { c.edge = T.next.e; c.lane = T.next.k; c.s = this.ends(c.edge)[0] + (T.u - 1) * T.len; c.turn = null; }
        else { const p = bez(T.p0, T.p1, T.p2, T.u), d = bezD(T.p0, T.p1, T.p2, T.u); c.x = p.x; c.z = p.z; c.heading = Math.atan2(d.x, d.z); }
      }
      this.place(c);
      // gone too far from the player: comes back somewhere nearer, out of sight
      if (Math.hypot(c.x - focus.x, c.z - focus.z) > this.radius + 20) { const n = this.spawn(focus, this.radius * .45); if (n) { Object.assign(c, n, { id: c.id, ahead: null }); for (const o of this.list) if (o.ahead === c) o.ahead = null; } }
    }
    this.avoid.length = 0;
    this.noise = noisy;
  }
  draw(night) {
    // each car keeps its own slot (its place in the list) in both the car and the van mesh, drawn as
    // nothing in the one it isn't: three works out motion (frame generation, SGSR 2) from what each slot
    // held last frame, so packing the cars of a kind together gave every car after one that came back
    // as the other kind its neighbour's motion
    const n = this.list.length;
    this.list.forEach((c, i) => {
      _q.setFromAxisAngle(_up, c.heading); _m.compose(_p.set(c.x, 0, c.z), _q, _s);
      for (const k in this.meshes) {
        const m = this.meshes[k];
        if (k === c.kind) { m.setMatrixAt(i, _m); m.setColorAt(i, _c.set(c.colour)); } else m.setMatrixAt(i, _none.makeScale(0, 0, 0).setPosition(c.x, 0, c.z));
      }
      this.head.setMatrixAt(i, _m); this.tail.setMatrixAt(i, _m);
      this.tail.setColorAt(i, _c.setScalar(c.braking ? 2.4 : 1));
    });
    for (const k in this.meshes) { const m = this.meshes[k]; m.count = n; sendUsed(m.instanceMatrix, n); sendUsed(m.instanceColor, n); }   // (only the cars in use go up)
    for (const m of [this.head, this.tail]) { m.count = this.list.length; sendUsed(m.instanceMatrix, m.count); sendUsed(m.instanceColor, m.count); }
    // vans use the car's light spots (close enough at this size)
    this.head.material.color.set('#fff3d6').multiplyScalar(.35 + night * 3.2); this.tail.material.color.set('#ff2c1c').multiplyScalar(.5 + night * 1.6);
  }
  near(p, r) { const pz = p.z ?? p.y; return this.list.filter(c => Math.hypot(c.x - p.x, c.z - pz) <= r).sort((a, b) => Math.hypot(a.x - p.x, a.z - pz) - Math.hypot(b.x - p.x, b.z - pz)); }
  /** The first car whose body overlaps a circle at p of radius r (or null). */
  hit(p, r = .5) {
    const pz = p.z ?? p.y;
    for (const c of this.list) {
      const rx = p.x - c.x, rz = pz - c.z; if (rx * rx + rz * rz > 16 + r * r * 4 + 8 * r) continue;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading), along = rx * fx + rz * fz, lat = rx * fz - rz * fx, hl = c.kind === 'van' ? 2.4 : 2.2;
      const dx = Math.max(Math.abs(lat) - .92, 0), dz = Math.max(Math.abs(along) - hl, 0);
      if (dx * dx + dz * dz <= r * r) return c;
    }
    return null;
  }
  /** Knocks a car to a stop for a moment (after a crash). */
  bump(c, seconds = 1.6) { c.v = 0; c.stun = seconds; return c; }
}
const bez = (a, b, c, t) => { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, z: u * u * a.z + 2 * u * t * b.z + t * t * c.z }; };
const bezD = (a, b, c, t) => ({ x: 2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x), z: 2 * (1 - t) * (b.z - a.z) + 2 * t * (c.z - b.z) });

/* ---------- people ---------- */

const torsoGeo = () => mergeGeometries([coloured(at(new BoxGeometry(.46, .62, .26), 0, 1.2, 0), '#ffffff'), coloured(at(new BoxGeometry(.12, .56, .14), -.3, 1.18, 0), '#ffffff'), coloured(at(new BoxGeometry(.12, .56, .14), .3, 1.18, 0), '#ffffff')]);
const headGeo = () => coloured(at(new IcosahedronGeometry(.13, 1), 0, 1.66, 0), '#ffffff');
const legGeo = () => coloured(at(new BoxGeometry(.16, .86, .18), 0, -.43, 0), '#ffffff');   // hangs from the hip, so it swings

/** The people of a city: they walk round the pavements, wait for the green man and cross at the corners. */
class People {
  constructor(city, count) {
    this.city = city; this.plan = city.plan; this.max = count; this.list = []; this.R = rng(city.seed * 17 + 3); this.radius = 100;
    const skin = mat('people', () => new MeshStandardMaterial({ vertexColors: true, roughness: .8 }));
    const n = Math.max(1, count), mk = (g, k) => { const m = new InstancedMesh(g, skin, n * k); m.count = 0; m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(DynamicDrawUsage); m.instanceColor = new InstancedBufferAttribute(new Float32Array(n * k * 3), 3); city.group.add(m); return m; };
    this.torso = mk(torsoGeo(), 1); this.head = mk(headGeo(), 1); this.legs = mk(legGeo(), 2);
  }
  ring(b) { const i = b.sw / 2; return [[b.x0 + i, b.z0 + i], [b.x1 - i, b.z0 + i], [b.x1 - i, b.z1 - i], [b.x0 + i, b.z1 - i]]; }
  perim(b) { return 2 * (b.x1 - b.x0 - b.sw) + 2 * (b.z1 - b.z0 - b.sw); }
  // the point s metres round a block's pavement (from its north-west corner, clockwise seen from above), and which corner is next
  at(b, s, out = {}) {
    const r = this.ring(b), w = r[1][0] - r[0][0], d = r[2][1] - r[1][1], L = 2 * (w + d); s = ((s % L) + L) % L;
    const seg = s < w ? 0 : s < w + d ? 1 : s < 2 * w + d ? 2 : 3, base = [0, w, w + d, 2 * w + d][seg], len = seg % 2 ? d : w, a = r[seg], c = r[(seg + 1) % 4], f = (s - base) / len;
    out.x = a[0] + (c[0] - a[0]) * f; out.z = a[1] + (c[1] - a[1]) * f; out.seg = seg; out.toCorner = len - (s - base); out.L = L; out.cs = [0, w, w + d, 2 * w + d];
    return out;
  }
  reset(focus) { this.list.length = 0; this.R = rng(this.city.seed * 17 + 3); for (let i = 0; i < this.max; i++) { const p = this.spawn(focus, 0); if (p) this.list.push(p); } this.draw(); }
  spawn(focus, min) {
    const R = this.R, B = this.plan.blocks;
    for (let tries = 0; tries < 80; tries++) {
      const b = B[R() * B.length | 0], s = R() * this.perim(b), p = this.at(b, s);
      const d = Math.hypot(p.x - focus.x, p.z - focus.z); if (d > this.radius || d < min || (!min && R() > Math.exp(-d / 50))) continue;
      return { id: this.nextId = (this.nextId || 0) + 1, block: b, s, dir: R() < .5 ? 1 : -1, side: (R() - .5) * 1.4, speed: 1.1 + R() * .5, x: p.x, z: p.z, heading: 0,
        shirt: R.pick(SHIRTS), pants: R.pick(PANTS), skin: R.pick(SKIN), h: .92 + R() * .16, phase: R() * 6, wait: 0, cross: null, panic: 0, down: 0, fall: 0, fx: 0, fz: 0 };
    }
    return null;
  }
  update(dt, focus, t) {
    const city = this.city, P = this.plan;
    for (const p of this.list) {
      if (p.down > 0) {   // knocked over: lies there a moment, then gets up and hurries off
        p.down -= dt; p.fall = Math.min(1, p.fall + dt * 5); if (p.down <= 0) { p.panic = 3; }
        continue;
      }
      p.fall = Math.max(0, p.fall - dt * 3);
      const run = p.panic > 0 ? 2.8 : 1; p.panic = Math.max(0, p.panic - dt);
      const v = p.speed * run;
      if (p.cross) {   // crossing the road on the zebra
        const c = p.cross; c.u += v * dt / c.len; const u = Math.min(1, c.u);
        const nx = c.ax + (c.bx - c.ax) * u, nz = c.az + (c.bz - c.az) * u; p.heading = Math.atan2(nx - p.x, nz - p.z) || p.heading; p.x = nx; p.z = nz;
        if (c.u >= 1) { p.block = c.to; p.s = c.s; p.cross = null; }
      } else if (p.wait > 0) {
        p.wait -= dt;
        const c = p.waitFor, n = P.nodes[c.node];
        if (city.signal(n, c.axis, t) === 'g' && city.signalLeft(n, c.axis, t) > 4) { p.wait = 0; p.cross = c.go; }
        else if (p.wait <= 0) p.waitFor = null;
      } else {
        const before = this.at(p.block, p.s); p.s += v * dt * p.dir; const q = this.at(p.block, p.s);
        // came to a corner: now and then cross to the next block, when the lights say so
        if (q.seg !== before.seg && p.panic <= 0 && this.R() < .45) {
          const corner = p.dir > 0 ? q.seg : before.seg, go = this.crossing(p.block, corner, p.dir);
          if (go) { p.s = before.cs[corner]; const pos = this.at(p.block, p.s); p.x = pos.x; p.z = pos.z; const n = P.nodes[go.node];
            if (city.signal(n, go.axis, t) === 'g' && city.signalLeft(n, go.axis, t) > 4) p.cross = go.go; else { p.wait = 18; p.waitFor = go; } continue; }
        }
        const sx = q.seg % 2 === 0 ? 0 : (q.seg === 1 ? 1 : -1), sz = q.seg % 2 === 1 ? 0 : (q.seg === 0 ? -1 : 1);   // out towards the road
        const nx = q.x + sx * p.side * .5, nz = q.z + sz * p.side * .5;
        p.heading = Math.atan2(nx - p.x, nz - p.z) || p.heading; p.x = nx; p.z = nz;
      }
      p.phase += v * dt * 4.4;
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > this.radius + 15) { const n = this.spawn(focus, this.radius * .5); if (n) Object.assign(p, n, { id: p.id }); }
    }
  }
  // the zebra crossing straight on from this block's corner (0 NW, 1 NE, 2 SE, 3 SW) for someone walking
  // round it in dir (1: clockwise seen from above), to the block across the road
  crossing(b, corner, dir) {
    const P = this.plan, alongX = dir > 0 ? corner % 2 === 1 : corner % 2 === 0;
    const east = corner === 1 || corner === 2, south = corner === 2 || corner === 3;
    const ni = alongX ? b.i + (east ? 1 : -1) : b.i, nj = alongX ? b.j : b.j + (south ? 1 : -1);
    if (ni < 0 || nj < 0 || ni >= P.nx || nj >= P.nz) return null;
    const nb = P.blocks[ni * P.nz + nj], arrive = alongX ? [1, 0, 3, 2][corner] : [3, 2, 1, 0][corner];
    const r = this.ring(b)[corner], r2 = this.ring(nb)[arrive], node = (b.i + (east ? 1 : 0)) * (P.nz + 1) + b.j + (south ? 1 : 0);
    return { node, axis: alongX ? 'x' : 'z', go: { ax: r[0], az: r[1], bx: r2[0], bz: r2[1], len: Math.hypot(r2[0] - r[0], r2[1] - r[1]), u: 0, to: nb, s: this.at(nb, 0).cs[arrive] } };
  }
  draw() {
    const T = this.torso, Hd = this.head, L = this.legs, e = this._e ||= new Object3D(), leg = this._leg ||= new Object3D();
    this.list.forEach((p, i) => {
      const bob = Math.abs(Math.sin(p.phase)) * .05 * (p.down > 0 ? 0 : 1), sc = p.h;
      e.position.set(p.x, bob, p.z); e.rotation.set(0, p.heading, 0); e.scale.setScalar(sc);
      if (p.fall > 0) { e.rotateX(p.fall * Math.PI / 2 * .95); e.position.y += p.fall * .1; }
      e.updateMatrix(); T.setMatrixAt(i, e.matrix); Hd.setMatrixAt(i, e.matrix);
      T.setColorAt(i, _c.set(p.shirt)); Hd.setColorAt(i, _c.set(p.skin));
      const swing = p.down > 0 || p.wait > 0 ? 0 : Math.sin(p.phase) * .55;
      for (const k of [0, 1]) {
        leg.position.set((k ? .12 : -.12), .88, 0); leg.rotation.set(k ? swing : -swing, 0, 0);
        leg.updateMatrix(); _m.multiplyMatrices(e.matrix, leg.matrix); L.setMatrixAt(i * 2 + k, _m); L.setColorAt(i * 2 + k, _c.set(p.pants));
      }
    });
    for (const [m, k] of [[T, 1], [Hd, 1], [L, 2]]) { m.count = this.list.length * k; sendUsed(m.instanceMatrix, m.count); sendUsed(m.instanceColor, m.count); }
  }
  near(p, r) { const pz = p.z ?? p.y; return this.list.filter(q => Math.hypot(q.x - p.x, q.z - pz) <= r).sort((a, b) => Math.hypot(a.x - p.x, a.z - pz) - Math.hypot(b.x - p.x, b.z - pz)); }
  /** The first person standing within r of p (or null; people lying down don't count). */
  hit(p, r = .5) { const pz = p.z ?? p.y; for (const q of this.list) if (q.down <= 0 && Math.hypot(q.x - p.x, q.z - pz) < r + .3) return q; return null; }
  /** Everyone within r of p runs (for t seconds): an alarm, a crash, a big noise. */
  scare(p, r = 15, t = 4) { for (const q of this.near(p, r)) { q.panic = t; q.wait = 0; q.waitFor = null; const away = (Math.sin(q.heading) * (q.x - p.x) + Math.cos(q.heading) * (q.z - (p.z ?? p.y))); if (away < 0 && !q.cross) q.dir = -q.dir; } return this; }
  /** Knocks someone over (they fall the way of dx, dz, lie a moment and hurry off): cartoon bumps, no harm done. */
  knock(q, dx = 0, dz = 1, seconds = 2.2) { if (!q || q.down > 0) return q; q.down = seconds; q.heading = Math.atan2(dx, dz); q.cross = null; q.wait = 0; return q; }
}

/* ---------- the city ---------- */

const CYCLE = 26, GREEN = 10, AMBER = 2.5, HALF = 13;
const TIER = { top: 1, mid: .65, low: .4 };

export class City {
  /**
   * view: a gs.hd HDView (or gs.toon View: anything with .scene and .cam). seed, blocks, style and
   * side as for layout(); traffic / people: how busy (1 = normal; scaled down on slower phones);
   * night: 0..1 (or sky: a gs.sky Sky to follow); lamps: real lights from the nearest street lamps at
   * night; sound: the city's hum, horns and birds; at: where the player starts (built first);
   * detail: metres within which awnings, cornices and fire escapes show.
   */
  constructor(view, { seed = 1, blocks = 6, style = 'downtown', side = 'right', traffic = 1, people = 1, night = 0, sky = null, lamps = true, sound = true, at = null, detail = 260, occlude = true, ...over } = {}) {
    this.view = view; this.seed = seed; this.sky = sky; this.lampsOn = lamps; this.soundOn = sound; this.detail = detail;
    this.plan = layout({ seed, blocks, style, side, ...over }); const P = this.plan, S = P.style;
    // What a city keeps from one making to the next comes first: its textures and materials, and the
    // street furniture's shapes. While a card loads, a pass of make() can be stopped between these and
    // the next pass has them already (slices.js); the rest is this city's own and is made in one go.
    const kinds = new Set(['pave', 'plaza', 'grass', 'plain', 'metal', 'roof', 'tiles', 'shop']); for (const b of P.buildings) kinds.add('f:' + b.facade);
    for (const k of kinds) chunkMat(k, S);
    groundTex('grass', '#4f7a3a'); asphaltMat(S.ground);
    for (const name in FURNITURE) shaped(name);
    if (occlude) view.occluders?.(this.occluders());   // what's behind the buildings isn't drawn (occlude: false to draw it all)
    this.group = new Group(); this.group.name = 'city'; view.scene.add(this.group);
    this.t = 0; this._night = -1; this.night = night;
    const scale = TIER[phoneClass()] ?? .65;
    // the ground: asphalt under the city, grass (or the harbour) round it
    // (the grass is a frame round the asphalt, not a sheet under it, so the two never fight over the same pixels)
    const B = P.bounds, m = 40, gx0 = B.x0 - m, gx1 = B.x1 + m, gz0 = B.z0 - m, gz1 = B.z1 + m, far = 3000;
    const fieldTex = groundTex('grass', '#4f7a3a').clone(); fieldTex.repeat.set(.1, .1); fieldTex.needsUpdate = true;
    const field = new Quads(); for (const [a, b, c, d] of [[gx0 - far, gz0 - far, gx1 + far, gz0], ...(P.water ? [] : [[gx0 - far, gz1, gx1 + far, gz1 + far]]), [gx0 - far, gz0, gx0, gz1 + (P.water ? far : 0)], [gx1, gz0, gx1 + far, gz1 + (P.water ? far : 0)]]) field.top(a, b, c, d, 0, 1);
    const ground = new Mesh(field.geometry(), new MeshStandardMaterial({ map: fieldTex, roughness: 1 })); ground.receiveShadow = true; this.group.add(ground); this.field = ground;
    const road = new Mesh(new PlaneGeometry(gx1 - gx0, gz1 - gz0), asphaltMat(S.ground).clone()); road.rotation.x = -Math.PI / 2; road.position.set((gx0 + gx1) / 2, 0, (gz0 + gz1) / 2); road.receiveShadow = true;
    road.material.map = road.material.map.clone(); road.material.map.repeat.set((gx1 - gx0) / 10, (gz1 - gz0) / 10); road.material.map.needsUpdate = true; this.group.add(road); this.asphalt = road;
    if (P.water) {
      const q = new Quads(); q.box(B.x0 - m, -2, B.z1 + 2, B.x1 + m, KERB, B.z1 + 10, null, 4);
      const quay = new Mesh(q.geometry(), pavingMat(S.pavement)); quay.receiveShadow = true; this.group.add(quay);
      const water = new Mesh(new PlaneGeometry(6000, 3000), waterMat()); water.rotation.x = -Math.PI / 2; water.position.set(0, -.6, B.z1 + 10 + 1500); this.group.add(water);
      view.reflect?.(water); this.water = water;
    }
    const paint = new Mesh(buildPaint(P).geometry(), paintMat()); paint.receiveShadow = true; this.group.add(paint);
    // chunks of 2 x 2 blocks, built a few at a time, nearest first
    const cs = P.nx * P.nz > 9 ? 2 : 1; this.chunks = new Map();
    for (const b of P.blocks) {
      const k = (b.i / cs | 0) + ',' + (b.j / cs | 0); let c = this.chunks.get(k);
      if (!c) this.chunks.set(k, c = { key: k, blocks: [], x: 0, z: 0, group: null, detail: null });
      c.blocks.push(b);
    }
    for (const c of this.chunks.values()) { c.x = c.blocks.reduce((a, b) => a + (b.x0 + b.x1) / 2, 0) / c.blocks.length; c.z = c.blocks.reduce((a, b) => a + (b.z0 + b.z1) / 2, 0) / c.blocks.length; }
    // where buildings are, for collisions and rays: a grid of 32 m cells
    this.cell = 32; this.grid = new Map();
    for (const b of P.buildings) for (let gx = Math.floor(b.x0 / 32); gx <= Math.floor(b.x1 / 32); gx++) for (let gz = Math.floor(b.z0 / 32); gz <= Math.floor(b.z1 / 32); gz++) { const k = gx + ',' + gz; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(b); }
    this.props = this.furnish();
    this.signals = this.makeSignals();
    this.cars = new Traffic(this, Math.round(70 * traffic * scale * Math.min(1.6, P.nx * P.nz / 36 + .4)));
    this.people = new People(this, Math.round(110 * people * scale));
    this.start = at || this.spot('pavement', { rnd: rng(seed + 9) }) || { x: 0, z: 0 };
    for (const c of [...this.chunks.values()].filter(c => Math.hypot(c.x - this.start.x, c.z - this.start.z) < 200)) this.build(c);
    // The far chunks are built as you get near them, and their materials (a facade first seen there)
    // would compile then, mid-round: a stutter. One tiny hidden mesh per material the plan can use lets
    // the view compile them all with the rest before play (HDView.warm / prepare draw hidden things too).
    this.warmers = new Group(); this.warmers.name = 'city shaders';
    for (const k of kinds) { const m = new Mesh(WARM_GEO(), chunkMat(k, P.style)); m.castShadow = m.receiveShadow = true; m.visible = false; m.frustumCulled = false; this.warmers.add(m); }
    this.group.add(this.warmers);
    this.ears = null; this.hum = null;
    this.applyNight(); this.reset();
  }
  /** Cars and people back to the start (call from your game's reset()). */
  reset(focus = this.start) { this.t = 0; this.cars.reset(focus); this.people.reset(focus); this.signalTick(); return this; }

  /** The street furniture and roof things, as gs.props (culled, and simpler far away). */
  furnish() {
    const P = this.plan, props = new Props(this.group, { renderer: this.view.renderer || null }), pm = plainMat();
    furniture(props, 'tree', pm, { capacity: 512 });
    furniture(props, 'pine', pm, { capacity: 256 });
    furniture(props, 'lamp', pm, { capacity: 256 });
    this.lampGlow = new MeshStandardMaterial({ color: '#fff4dc', emissive: new Color('#ffd49a'), emissiveIntensity: 0, roughness: .4 });
    furniture(props, 'lamphead', this.lampGlow, { shadows: false, capacity: 256 });
    furniture(props, 'tank', pm, { capacity: 128 });
    furniture(props, 'hvac', pm, { capacity: 256 });
    furniture(props, 'mast', pm, { capacity: 32 });
    furniture(props, 'bench', pm, { capacity: 64 });
    furniture(props, 'signal', pm, { capacity: 256 });
    furniture(props, 'hydrant', pm, { shadows: false, capacity: 128 });
    for (const t of P.trees) props.add(t.kind === 'pine' ? 'pine' : 'tree', t.x, KERB, t.z, { rot: t.x * 1.7, scale: t.s });
    this.lampSpots = [];
    for (const l of P.lamps) { props.add('lamp', l.x, KERB, l.z, { rot: l.face }); props.add('lamphead', l.x, KERB, l.z, { rot: l.face }); this.lampSpots.push({ x: l.x + Math.cos(l.face) * 1.35, y: KERB + 5.6, z: l.z - Math.sin(l.face) * 1.35, col: '#ffd8a8', i: 0 }); }
    for (const b of P.buildings) for (const bit of b.bits) props.add(bit.kind, bit.x, bit.y, bit.z, { rot: bit.x, scale: bit.s });
    for (const b of P.benches) props.add('bench', b.x, KERB, b.z, { rot: b.rot });
    const R = rng(this.seed * 3 + 11);
    for (const b of P.blocks) if (b.kind === 'build' && R() < .5) props.add('hydrant', b.x0 + 1.2, KERB, b.z0 + 2 + R() * (b.z1 - b.z0 - 4));
    props.done();
    return props;
  }
  // a traffic light on each corner, facing the cars that arrive there
  makeSignals() {
    const P = this.plan, list = [], sideK = P.side === 'left' ? -1 : 1;
    for (const n of P.nodes) if (n.signal) for (const id of P.edges.filter(e => e.b === n.id).map(e => e.id)) {
      const e = P.edges[id], h = e.axis === 'x' ? n.hx : n.hz, rx = -e.dz * sideK, rz = e.dx * sideK, w = e.width / 2 + .7;
      const x = n.x - e.dx * (h + .6) + rx * w, z = n.z - e.dz * (h + .6) + rz * w;
      this.props.add('signal', x, KERB, z, { rot: Math.atan2(-e.dx, -e.dz) + Math.PI / 2 });
      list.push({ node: n, axis: e.axis, x: x - e.dx * .2, y: KERB + 4.55, z: z - e.dz * .2, state: '' });
    }
    const m = new InstancedMesh(new SphereGeometry(.17, 8, 6), new MeshBasicMaterial({ toneMapped: false }), Math.max(1, list.length));
    m.count = list.length; m.frustumCulled = false; m.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, list.length) * 3), 3);
    list.forEach((s, i) => { _m.makeTranslation(s.x, s.y, s.z); m.setMatrixAt(i, _m); });
    this.group.add(m); this.signalMesh = m;
    return list;
  }
  /** A junction's light for traffic along axis ('x' or 'z') at time t: 'g', 'a' (amber) or 'r'. Junctions without lights are always 'g'. */
  signal(n, axis, t = this.t) {
    if (!n.signal) return 'g';
    let u = (t + n.phase) % CYCLE; if (axis === 'z') u = (u + HALF) % CYCLE;
    return u < GREEN ? 'g' : u < GREEN + AMBER ? 'a' : 'r';
  }
  /** Seconds of green left (0 if not green). */
  signalLeft(n, axis, t = this.t) { if (!n.signal) return 99; let u = (t + n.phase) % CYCLE; if (axis === 'z') u = (u + HALF) % CYCLE; return u < GREEN ? GREEN - u : 0; }
  signalTick() {
    const m = this.signalMesh, k = .8 + this.night * 2.4; let changed = false;
    this.signals.forEach((s, i) => { const st = this.signal(s.node, s.axis); if (st !== s.state || this._sk !== k) { s.state = st; m.setColorAt(i, _c.set(st === 'g' ? '#30ff70' : st === 'a' ? '#ffb020' : '#ff2a1a').multiplyScalar(k)); changed = true; } });
    this._sk = k; if (changed) m.instanceColor.needsUpdate = true;
  }

  /** How dark it is, 0 (day) to 1 (night): windows, shop signs, street lamps and car lights come on. */
  get night() { return this._night; }
  set night(k) {
    k = Math.max(0, Math.min(1, k)); if (Math.abs(k - this._night) < .01) return; this._night = k; this.applyNight();
  }
  applyNight() {
    const k = Math.max(0, this._night);
    for (const name of Object.keys(FACADES)) { const m = MATS.get('f:' + name); if (m) m.emissiveIntensity = k * 1.0; }
    const s = MATS.get('shop'); if (s) s.emissiveIntensity = .3 + k * 1.6;
    if (this.lampGlow) this.lampGlow.emissiveIntensity = k * 5;
  }

  // one chunk's meshes: pavements, parks, buildings (one mesh per material) and the near-only details
  build(c) {
    if (c.group) return;
    const P = this.plan, S = P.style, bufs = new Map(), det = new Map();
    const Q = k => { if (!bufs.has(k)) bufs.set(k, new Quads()); return bufs.get(k); }, D = k => { if (!det.has(k)) det.set(k, new Quads()); return det.get(k); };
    for (const b of c.blocks) {
      Q('pave').box(b.x0, -.2, b.z0, b.x1, KERB, b.z1, null, 4);
      const inner = b.kind === 'park' || S.houses ? 'grass' : b.kind === 'plaza' ? 'plaza' : null;
      if (inner) Q(inner).top(b.x0 + b.sw, b.z0 + b.sw, b.x1 - b.sw, b.z1 - b.sw, KERB + .01, 4);
    }
    for (const bl of P.buildings) if (c.blocks.some(b => b.id === bl.block)) buildBuilding(bl, Q, D);
    const matOf = k => chunkMat(k, S);
    const g = new Group(), d = new Group(); g.name = 'chunk ' + c.key;
    for (const [k, q] of bufs) if (!q.empty) { const m = new Mesh(q.geometry(), matOf(k)); m.castShadow = k !== 'pave' && k !== 'grass' && k !== 'plaza'; m.receiveShadow = true; m.userData.city = k; g.add(m); }
    for (const [k, q] of det) if (!q.empty) { const m = new Mesh(q.geometry(), matOf(k)); m.castShadow = true; m.receiveShadow = true; d.add(m); }
    g.add(d); this.group.add(g); c.group = g; c.detail = d;
    this.applyNight(); this.view.shadowsDirty?.(); this.view.patchAir?.(true);
  }
  /** Builds every chunk now (screenshots, small cities, a loading screen of your own). */
  warm() { for (const c of this.chunks.values()) this.build(c); return this; }

  /**
   * Once a frame. focus: where the player is ({ x, z } or a Vector3; default the camera). Builds
   * the chunks coming into view, moves the traffic and people, works the lights and the sound.
   */
  update(dt, focus = this.view.cam.position) {
    const f = { x: focus.x, z: focus.z ?? focus.y }; this.t += dt; this.focus = f;
    if (this.sky) this.night = this.sky.night ?? 0;
    // build what's coming into range: nearest first, within about 4 ms a frame
    const t0 = performance.now(), want = this.allBuilt ? [] : [...this.chunks.values()].filter(c => !c.group).sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z));
    for (const c of want) { this.build(c); if (performance.now() - t0 > 2.5) break; }
    if (!want.length) this.allBuilt = true;
    for (const c of this.chunks.values()) if (c.detail) c.detail.visible = Math.hypot(c.x - f.x, c.z - f.z) < this.detail;
    this.cars.update(dt, f, this.t); this.people.update(dt, f, this.t);
    this.cars.draw(this.night); this.people.draw(); this.signalTick();
    if (this.lampsOn && this.view.placeLamps && this.night > .05) {
      if (!this.view.lamps?.length) this.view.lampLights(26);
      const near = this.lampSpots.filter(s => Math.abs(s.x - f.x) < 70 && Math.abs(s.z - f.z) < 70);
      for (const s of near) s.i = this.night * 9;
      this.view.placeLamps(near, f.x, 2, f.z, this.t);
    } else if (this.view.lamps?.length) for (const l of this.view.lamps) l.intensity = 0;
    if (this.soundOn) this.listen(dt, f);
    return this;
  }
  /** Cars brake for this (the player, a fallen tree...) for one frame: { x, z } and how wide it is (r). */
  avoid(p, r = 1) { this.cars.avoid.push({ x: p.x, z: p.z ?? p.y, r }); return this; }

  /* sound: a hum that swells with the traffic, horns from cars stuck behind something, birds in the parks by day */
  listen(dt, f) {
    if (!this.hum) { this.hum = bed({ vol: .02, from: 380, q: .5, gusts: .3 }); this.ears = new Ears({ ref: 6, max: 140, hrtf: false }); this.birdT = 2; this.sirenT = 40 + this.cars.R() * 60; }
    const cam = this.view.cam; this.ears.place(cam.position, cam.getWorldDirection(_p));
    const busy = Math.min(1, (this.cars.noise || 0) / 300);
    this.hum.set({ vol: .012 + busy * .03 * (1 - this.night * .4), from: 260 + busy * 260 }, 1);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 1.5 + this.cars.R() * 4;
      const park = this.plan.spots.park.find(s => Math.hypot(s.x - f.x, s.z - f.z) < 60) || this.plan.trees.find(s => Math.hypot(s.x - f.x, s.z - f.z) < 25);
      if (park && this.night < .5) { const h = 2600 + this.cars.R() * 1600; for (let k = 0; k < 3; k++) this.ears.tone(h + k * 180, { x: park.x, y: 6, z: park.z }, { len: .05, wave: 'sine', vol: .015, slide: 400, at: k * .09 }); }
    }
    this.sirenT -= dt;
    if (this.sirenT <= 0) {   // somewhere off in the city, a siren comes and goes
      this.sirenT = 60 + this.cars.R() * 90; const a = this.cars.R() * Math.PI * 2, p = { x: f.x + Math.cos(a) * 180, y: 3, z: f.z + Math.sin(a) * 180 };
      for (let k = 0; k < 8; k++) this.ears.tone(k % 2 ? 760 : 960, p, { len: .45, wave: 'triangle', vol: .02, at: k * .46 });
    }
  }
  honk(c) { if (!this.ears) return; const p = { x: c.x, y: 1, z: c.z }; this.ears.tone(c.kind === 'van' ? 330 : 415, p, { len: .32, wave: 'sawtooth', vol: .03 }); this.ears.tone(c.kind === 'van' ? 392 : 494, p, { len: .32, wave: 'sawtooth', vol: .02 }); }

  /* ---------- answers for the game ---------- */

  near(x, z, r = 0) {
    const out = new Set(), c = this.cell;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++) for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) for (const b of this.grid.get(gx + ',' + gz) || []) out.add(b);
    return out;
  }
  /** The building standing at x, z (or null). */
  buildingAt(x, z) { for (const b of this.near(x, z)) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b; return null; }
  /** Height of the ground at x, z: 0 on the road, the kerb height on pavements, parks and plazas, a roof's top on a building. */
  ground(x, z) {
    const b = this.buildingAt(x, z); if (b) return b.h;
    for (const k of this.plan.blocks) if (x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1) return KERB;
    return 0;
  }
  /**
   * Pushes a circle (p: { x, z } or a Vector3 using x and z; radius r) out of the buildings, at
   * height y (things above a roof pass over it). Changes p; returns the building it touched, or null.
   */
  collide(p, r = .4, y = 0) {
    const pz = p.z ?? p.y, key = p.z != null ? 'z' : 'y'; let hit = null, px = p.x, qz = pz;
    for (let pass = 0; pass < 3; pass++) { let moved = false; for (const b of this.near(px, qz, r)) for (const part of b.parts) {
      if (y >= part.y1 || y < part.y0 - 2) continue;
      const cx = Math.max(part.x0, Math.min(px, part.x1)), cz = Math.max(part.z0, Math.min(qz, part.z1)), dx = px - cx, dz = qz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2); px = cx + dx / d * r; qz = cz + dz / d * r; }
      else { const o = [px - part.x0, part.x1 - px, qz - part.z0, part.z1 - qz], m = Math.min(...o), i = o.indexOf(m); if (i === 0) px = part.x0 - r; else if (i === 1) px = part.x1 + r; else if (i === 2) qz = part.z0 - r; else qz = part.z1 + r; }
      hit = b; moved = true;
    } if (!moved) break; }
    p.x = px; p[key] = qz; return hit;
  }
  /** The first building along a ray (from and dir: { x, y, z }; dir need not be unit length): { point, normal, dist, building } or null. */
  ray(from, dir, far = 300) {
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / l, y: dir.y / l, z: dir.z / l }, seen = new Set(); let best = null;
    for (let t = 0; t <= far + this.cell; t += this.cell * .5) {
      const x = from.x + d.x * t, z = from.z + d.z * t;
      for (const b of this.near(x, z, this.cell * .5)) {
        if (seen.has(b)) continue; seen.add(b);
        for (const part of b.parts) {
          let t0 = 0, t1 = far, n = null;
          for (const [o, v, lo, hi, nn] of [[from.x, d.x, part.x0, part.x1, 'x'], [from.y, d.y, part.y0 - .2, part.y1, 'y'], [from.z, d.z, part.z0, part.z1, 'z']]) {
            if (Math.abs(v) < 1e-9) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
            let a = (lo - o) / v, c = (hi - o) / v, s = -1; if (a > c) { [a, c] = [c, a]; s = 1; }
            if (a > t0) { t0 = a; n = { x: 0, y: 0, z: 0, [nn]: s }; } t1 = Math.min(t1, c); if (t0 > t1) { t0 = Infinity; break; }
          }
          if (t0 < Infinity && t0 >= 0 && (!best || t0 < best.dist)) best = { dist: t0, point: { x: from.x + d.x * t0, y: from.y + d.y * t0, z: from.z + d.z * t0 }, normal: n || { x: 0, y: 1, z: 0 }, building: b };
        }
      }
      if (best && best.dist < t) break;
    }
    return best;
  }
  /** The nearest point in a driving lane to x, z: { x, z, heading, edge, lane }. */
  road(x, z) {
    const T = this.cars; let best = null;
    for (const e of this.plan.edges) {
      const A = this.plan.nodes[e.a], [s0, s1] = T.ends(e), s = Math.max(s0, Math.min(s1, (x - A.x) * e.dx + (z - A.z) * e.dz));
      for (let k = 0; k < e.lanes; k++) { const p = T.lanePos(e, k, s), d = Math.hypot(p.x - x, p.z - z); if (!best || d < best.d) best = { d, x: p.x, z: p.z, heading: Math.atan2(e.dx, e.dz), edge: e, lane: k, s }; }
    }
    return best;
  }
  /**
   * A driving route from a to b along the roads, keeping to the driving side: { points: [[x, z]...],
   * path (a gs.paths Path, so a Follower can drive it, or path.nearest() tells how far along you
   * are), length, nodes }.
   */
  route(a, b) {
    const P = this.plan, az = a.z ?? a.y, bz = b.z ?? b.y, near = (x, z) => P.nodes.reduce((m, n) => Math.hypot(n.x - x, n.z - z) < Math.hypot(m.x - x, m.z - z) ? n : m);
    const ra = this.road(a.x, az), rb = this.road(b.x, bz), start = P.nodes[ra.edge.b], goal = P.nodes[rb.edge.a];
    // A* over the junctions
    const g = new Map([[start.id, 0]]), from = new Map(), open = [start.id], h = n => Math.abs(n.x - goal.x) + Math.abs(n.z - goal.z);
    while (open.length) {
      open.sort((p, q) => g.get(q) + h(P.nodes[q]) - g.get(p) - h(P.nodes[p])); const cur = open.pop();
      if (cur === goal.id) break;
      for (const id of P.nodes[cur].out) { const e = P.edges[id], ng = g.get(cur) + e.len; if (ng < (g.get(e.b) ?? Infinity)) { g.set(e.b, ng); from.set(e.b, cur); if (!open.includes(e.b)) open.push(e.b); } }
    }
    const ids = [goal.id]; while (ids[0] !== start.id && from.has(ids[0])) ids.unshift(from.get(ids[0]));
    const nodes = ids.map(i => P.nodes[i]), pts = [[ra.x, ra.z]];
    const sideK = P.side === 'left' ? -1 : 1, off = LANE * .5 + .2;
    // each corner moved onto the driving side of both roads it joins
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], prev = i ? nodes[i - 1] : { x: ra.x - Math.sin(ra.heading), z: ra.z - Math.cos(ra.heading) }, next = nodes[i + 1] || { x: rb.x, z: rb.z };
      const d1 = norm(n.x - prev.x, n.z - prev.z), d2 = norm(next.x - n.x, next.z - n.z);
      const r1 = { x: -d1.z * sideK, z: d1.x * sideK }, r2 = { x: -d2.z * sideK, z: d2.x * sideK };
      pts.push([n.x + (r1.x + r2.x) * off, n.z + (r1.z + r2.z) * off]);
    }
    pts.push([rb.x, rb.z]);
    const path = new Path(pts.map(([x, z]) => ({ x, y: 0, z })), { kind: 'line' });
    return { points: pts, path, length: path.length ?? pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0), nodes };
  }
  /**
   * A place in the city to use: 'door' (on the pavement outside a building, facing it: nx, nz),
   * 'rooftop' (the middle of a roof), 'corner' (a street corner), 'street' (in a lane, with heading),
   * 'pavement', 'park'. near / min / max: keep it a distance from a point; rnd: your own random
   * (gs.math.rng) to pick the same ones each time.
   */
  spot(kind = 'pavement', { near = null, min = 0, max = Infinity, rnd = Math.random } = {}) {
    const P = this.plan, ok = s => !near || ((d => d >= min && d <= max)(Math.hypot(s.x - near.x, s.z - (near.z ?? near.y))));
    let list;
    if (kind === 'street') { for (let i = 0; i < 40; i++) { const e = P.edges[rnd() * P.edges.length | 0], [s0, s1] = this.cars.ends(e), k = rnd() * e.lanes | 0, p = this.cars.lanePos(e, k, s0 + rnd() * (s1 - s0)); const s = { ...p, y: 0, heading: Math.atan2(e.dx, e.dz), edge: e, lane: k }; if (ok(s)) return s; } return null; }
    if (kind === 'pavement') { for (let i = 0; i < 40; i++) { const b = P.blocks[rnd() * P.blocks.length | 0], p = this.people.at(b, rnd() * this.people.perim(b)), s = { x: p.x, y: KERB, z: p.z, block: b.id }; if (ok(s)) return s; } return null; }
    list = (P.spots[kind] || []).filter(ok);
    return list.length ? list[rnd() * list.length | 0] : null;
  }
  /**
   * The buildings as boxes { x0, x1, z0, z1, y0, y1 } (world metres), for occlusion culling: what
   * sits fully behind them needn't be drawn. near / r: only the boxes within r metres of a point.
   */
  occluders(near = null, r = Infinity) {
    const out = [];
    for (const b of this.plan.buildings) {
      if (near && Math.hypot((b.x0 + b.x1) / 2 - near.x, (b.z0 + b.z1) / 2 - (near.z ?? near.y)) > r) continue;
      for (const p of b.parts) out.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, y0: p.y0, y1: p.y1 });
    }
    return out;
  }
  /** The building meshes built so far (for gs.camera's walls, or your own rays with three.js). */
  walls() { const out = []; for (const c of this.chunks.values()) if (c.group) for (const m of c.group.children) if (m.isMesh && m.userData.city && m.userData.city !== 'pave') out.push(m); return out; }
  /** Makes the buildings and kerbs solid in a gs.physics3d World3D (boxes, cheap to collide with). */
  solid(world) {
    const q = new Quads();
    for (const b of this.plan.buildings) for (const p of b.parts) q.box(p.x0, p.y0 - .2, p.z0, p.x1, p.y1, p.z1);
    for (const b of this.plan.blocks) q.box(b.x0, -.3, b.z0, b.x1, KERB, b.z1);
    const m = new Mesh(q.geometry()); world.ground(m); world.floor?.(0);
    return this;
  }
  /**
   * A quick top-down map on a 2D canvas: c, the box to draw in (x, y, w, h), at (the middle, in the
   * city: { x, z }), range (metres from the middle to the edge), turn (radians, e.g. the player's
   * heading so up is ahead), colours { road, block, park, building, water }. Draw your own markers on top
   * with mapPoint(). A helper only: draw your own map from city.plan if you like.
   */
  drawMap(c, x, y, w, h, { at = this.focus || this.start, range = 150, turn = 0, colours = {} } = {}) {
    const col = { road: '#2a2d33', block: '#5a5c60', park: '#3f6a3a', building: '#8a8e96', water: '#1d3c52', ...colours }, s = Math.min(w, h) / 2 / range;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = col.road; c.fillRect(x, y, w, h);
    c.translate(x + w / 2, y + h / 2); c.rotate(-turn); c.scale(s, s); c.translate(-at.x, -(at.z ?? at.y));
    // the streets don't change: drawn once into a picture (hundreds of rectangles), then only that is
    // moved and turned each frame (the Fold's frame lab showed the game's own CPU time going over the beat)
    const m = this.mapPicture(col);
    c.drawImage(m.cv, m.x0, m.z0, m.w, m.h);
    c.restore();
    this._map = { x, y, w, h, at, s, turn };
  }
  // the whole plan as a picture for drawMap, about 2 pixels a metre (made again if the colours change)
  mapPicture(col) {
    const key = JSON.stringify(col); if (this._mapPic?.key === key) return this._mapPic;
    const P = this.plan, M = 400; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const b of P.blocks) { x0 = Math.min(x0, b.x0); z0 = Math.min(z0, b.z0); x1 = Math.max(x1, b.x1); z1 = Math.max(z1, b.z1); }
    if (!(x1 > x0)) { x0 = z0 = -100; x1 = z1 = 100; }
    x0 -= M; z0 -= M; x1 += M; z1 += M;
    const k = Math.min(2, 2048 / Math.max(x1 - x0, z1 - z0)), cv = canvas(Math.ceil((x1 - x0) * k), Math.ceil((z1 - z0) * k)), c = cv.getContext('2d');
    c.fillStyle = col.road; c.fillRect(0, 0, cv.width, cv.height); c.scale(k, k); c.translate(-x0, -z0);
    if (P.water) { c.fillStyle = col.water; c.fillRect(x0, P.water.z + 10, x1 - x0, Math.max(0, z1 - P.water.z - 10)); }
    for (const b of P.blocks) { c.fillStyle = b.kind === 'park' ? col.park : col.block; c.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); }
    c.fillStyle = col.building;
    for (const b of P.buildings) c.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    return this._mapPic = { key, cv, x0, z0, w: cv.width / k, h: cv.height / k };
  }
  /** Where a city point lands on the last drawMap(): [x, y] on the canvas (may be outside the box). */
  mapPoint(p) {
    const m = this._map; if (!m) return [0, 0];
    const dx = (p.x - m.at.x) * m.s, dz = ((p.z ?? p.y) - (m.at.z ?? m.at.y)) * m.s, cs = Math.cos(-m.turn), sn = Math.sin(-m.turn);
    return [m.x + m.w / 2 + dx * cs - dz * sn, m.y + m.h / 2 + dx * sn + dz * cs];
  }
  /** Takes the city out of the scene and frees its meshes (the shared textures stay for the next city). */
  dispose() {
    this.hum?.stop(); this.hum = null; this.props.clear(); this.group.removeFromParent();
    this.group.traverse(o => { if (o.isMesh || o.isInstancedMesh) o.geometry?.dispose(); });
    if (this.view.lamps) for (const l of this.view.lamps) l.intensity = 0;
  }
}
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
