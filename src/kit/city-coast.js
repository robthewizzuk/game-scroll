// gs.city's coasts and climates: where a city meets the water and what grows in its streets.
//   - climates: which trees line the streets and fill the parks (temperate: round trees and pines; tropical: palms and
//     bushes; wetland: bald cypresses, reeds round the ponds), and the colour of the grass and land round it
//   - shores, on the side a style's `water` names ('south', 'east', 'north' or 'west'): 'quay' (a harbour's stone edge,
//     deep water at once), 'beach' (a promenade, then dry sand with parasols, loungers and a lifeguard tower, sloping
//     into the surf: walk, drive or wade in), 'marina' (a quay with wooden piers and finger jetties out into the water,
//     each slip between them a place for a boat: plan.spots.slip, with the jetty beside it in plan.spots.dock)
//   - ponds: blocks of shallow water in a park ring (wetland styles), with reeds and cypresses round them
//   - the water itself as numbers (CityWater): height(x, z) is the surface over water and -Infinity on dry land, bed(x, z)
//     the ground under it, so gs.climb Swimmer, gs.craft Boat and Floater, gs.sky Weather, shots and blasts all find it
//     through the game's links (links.js). With { sea } it is drawn as a gs.outdoors Sea (waves, surf on the beach, wet
//     sand, see-through shallows on WebGPU) instead of plain flat water.
// All of the plan is plain numbers (layout() calls it), so a minimap, a route or a test needs no 3D.
//
// Kit use only: games reach it through gs.city City / Metro (style, climate, sea) and city.water / metro.water.

import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, ConeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { linksFor } from './links.js';

export const WATER_Y = -.6;     // the open water's surface: a harbour, a river, the sea (the land and streets stand at 0)
export const POND_Y = -.2;      // a pond's surface (its bank is the park at the kerb's height)
export const POND_BED = -1.15;  // a pond's floor: about waist deep
export const SEA_BED = -3;      // the bed past a quay or a beach
const KERB = .15;

/**
 * What grows where: street (pavement trees) and park (parks and round ponds) are weights of each kind of tree, grass the
 * colour of the grass and the land round the city, hills how hilly a Metro's land is when not given.
 */
export const CLIMATES = {
  temperate: { street: { round: 7, pine: 3 }, park: { round: 6, pine: 4 }, grass: '#4f7a3a', hills: .5 },
  tropical: { street: { palm: 8, round: 2 }, park: { palm: 5, bush: 3, round: 2 }, grass: '#6f8a3a', hills: .1 },
  wetland: { street: { cypress: 4, round: 4, bush: 2 }, park: { cypress: 6, bush: 3, round: 1 }, grass: '#5e6a36', hills: 0 },
};
/** The pastel walls of a seaside art-deco street. */
export const DECO = ['#f6d4d2', '#b8efe8', '#fae3b4', '#e4c6f5', '#f8f4ec', '#cdeccf', '#ffd9bd', '#c9def7'];
/** Neon at night along their parapets. */
export const NEON = ['#ff4fa8', '#36f0ff', '#b46bff', '#4dffa0', '#ffd23f', '#ff7a3d'];
export const climateOf = S => CLIMATES[S.climate] || CLIMATES.temperate;

// the four sides a city's water can be on: n (out of the city), and whether the shore runs along x
const SIDES = { south: [0, 1], north: [0, -1], east: [1, 0], west: [-1, 0] };
export const sideName = w => w === true ? 'south' : SIDES[w] ? w : null;

/**
 * The frame of a city's shore: u metres out from the city's edge on that side, a along it. edge: the outer roads' edge;
 * a0..a1: the shore's length (the city and its 40 m margin either side). at(u, a) -> [x, z].
 */
export function shoreFrame(B, side, margin = 40) {
  const [nx, nz] = SIDES[side] || SIDES.south, alongX = nx === 0;
  const edge = nz > 0 ? B.z1 : nz < 0 ? -B.z0 : nx > 0 ? B.x1 : -B.x0;
  return {
    side, nx, nz, alongX, edge, a0: (alongX ? B.x0 : B.z0) - margin, a1: (alongX ? B.x1 : B.z1) + margin,
    u: (x, z) => nx * x + nz * z - edge,
    a: (x, z) => alongX ? x : z,
    at: (u, a) => alongX ? [a, (edge + u) * nz] : [(edge + u) * nx, a],
    heading: Math.atan2(nx, nz),   // (facing out to the water, as a person's rotation.y)
  };
}

// the ground's height u metres out over each kind of shore (null: the city's own ground)
const QUAY = { from: 2, to: 10 };                    // the quay's stone edge, then deep water
const BEACH = { prom: [2, 8], dry: 30, slope: 18 };  // the promenade; dry sand to u = 30 falling .1 to 0; then 1 in 18 into the sea
export function shoreHeight(kind, u) {
  if (u < 2) return null;
  if (kind === 'beach') {
    if (u < BEACH.prom[1]) return KERB;
    if (u < BEACH.dry) return .1 - .1 * (u - BEACH.prom[1]) / (BEACH.dry - BEACH.prom[1]);
    return Math.max(SEA_BED, -(u - BEACH.dry) / BEACH.slope);
  }
  return u < QUAY.to ? KERB : SEA_BED;
}
/** Where the water starts over a shore (u metres out: what's past it under WATER_Y is wet). */
export const waterFrom = kind => kind === 'beach' ? BEACH.dry - WATER_Y * BEACH.slope : QUAY.to;
/** How far out the shore's own ground reaches (past it: the sea bed). */
export const shoreReach = kind => kind === 'beach' ? BEACH.dry - SEA_BED * BEACH.slope : QUAY.to;

const pick = (R, w) => { let t = 0; for (const k in w) t += w[k]; let x = R() * t; for (const k in w) { x -= w[k]; if (x <= 0) return k; } return Object.keys(w)[0]; };
/** A tree kind for a pavement (where 'street') or a park, from the style's own kinds or its climate's. */
export const treeKind = (S, R, where = 'street') => pick(R, (where === 'park' ? S.parkKinds : S.kinds) || climateOf(S)[where]);

/**
 * The shore of a plan with water (layout() calls it last): plan.water { side, kind, z (south) or x (east)... }, and the
 * beach's furniture, the marina's piers, slips and docks, all as plain numbers.
 */
export function shorePlan(plan, S, R) {
  const side = sideName(S.water); if (!side) return;
  const kind = S.shore || 'quay', F = shoreFrame(plan.bounds, side), B = plan.bounds;
  plan.water = { side, kind, edge: F.edge, from: waterFrom(kind), ...(side === 'south' ? { z: B.z1 } : side === 'north' ? { z: B.z0 } : side === 'east' ? { x: B.x1 } : { x: B.x0 }) };
  const at = (u, a) => { const [x, z] = F.at(u, a); return { x, z }; };
  plan.spots.shore = [];
  for (let a = F.a0 + 20; a < F.a1 - 20; a += 30) { const p = at(waterFrom(kind) + .5, a); plan.spots.shore.push({ x: p.x, y: WATER_Y, z: p.z, heading: F.heading }); }
  if (kind === 'beach') {
    // palms along the promenade; then on the sand parasols each with a lounger or two, towels, and a lifeguard tower now and then
    const beach = plan.beach = { parasols: [], loungers: [], towers: [], towels: [] }; plan.spots.beach = [];
    for (let a = F.a0 + 6; a < F.a1 - 6; a += 11 + R() * 3) { const p = at(BEACH.prom[0] + 1.2, a); plan.trees.push({ x: p.x, z: p.z, s: .85 + R() * .35, kind: 'palm', y: KERB }); }
    for (let a = F.a0 + 70; a < F.a1 - 20; a += 120 + R() * 40) { const p = at(BEACH.dry - 3, a); beach.towers.push({ x: p.x, z: p.z, rot: F.heading, y: shoreHeight('beach', BEACH.dry - 3) }); }
    for (let a = F.a0 + 10; a < F.a1 - 10; a += 6 + R() * 6) {
      if (R() < .35 || beach.towers.some(t => Math.abs(F.a(t.x, t.z) - a) < 10)) continue;
      const u = 12 + R() * 13, p = at(u, a), y = shoreHeight('beach', u), colour = ['#e8483a', '#f2c230', '#2a8fd8', '#f4f0e8', '#2ab08a', '#f07ab0'][R() * 6 | 0];
      beach.parasols.push({ x: p.x, z: p.z, y, rot: R() * 6.28, colour, tilt: (R() - .5) * .25 });
      const n = 1 + (R() < .5 ? 1 : 0);
      for (let k = 0; k < n; k++) { const q = at(u - 1.1, a + (k - (n - 1) / 2) * 1.1); beach.loungers.push({ x: q.x, z: q.z, y: shoreHeight('beach', u - 1.1), rot: F.heading + Math.PI, colour: R() < .5 ? '#f4f0e8' : colour }); }
      if (R() < .5) { const q = at(u + 1.6, a + 1.2), y2 = shoreHeight('beach', u + 1.6); beach.towels.push({ x: q.x, z: q.z, y: y2, rot: F.heading + (R() - .5) * .6, colour: ['#e05050', '#3a7ad8', '#f0d040', '#50b070', '#f08cc0'][R() * 5 | 0] }); plan.spots.beach.push({ x: q.x, y: y2 + .02, z: q.z, heading: F.heading }); }
    }
  } else if (kind === 'marina') {
    // a pier out from the quay every 44 m or so; finger jetties off both sides of it, a slip for a boat between each two
    const marina = plan.marina = { piers: [], fingers: [] }; plan.spots.slip = []; plan.spots.dock = [];
    const deck = KERB, out = 38, pw = 3, fw = 1.2, fl = 9, gap = 5.2;
    for (let a = F.a0 + 30; a < F.a1 - 30; a += 44 + R() * 8) {
      const pier = { a, u0: QUAY.to - .5, u1: QUAY.to + out, w: pw, y: deck, id: marina.piers.length }; marina.piers.push(pier);
      for (let u = QUAY.to + 4; u + fw < pier.u1 - 2; u += gap + fw) for (const s of [-1, 1]) {
        marina.fingers.push({ a: a + s * (pw / 2 + fl / 2), u: u + fw / 2, len: fl, w: fw, y: deck, pier: pier.id });
        // the slip after this finger (between it and the next): a boat lies along the finger, bow to the pier; its dock is the finger's middle
        const su = u + fw + gap / 2; if (su + gap / 2 > pier.u1 - 1) continue;
        const sp = at(su, a + s * (pw / 2 + fl / 2)), dk = at(u + fw / 2, a + s * (pw / 2 + fl / 2)), dir = Math.atan2(F.alongX ? -s : 0, F.alongX ? 0 : -s);
        plan.spots.slip.push({ x: sp.x, y: WATER_Y, z: sp.z, heading: dir, len: fl, width: gap - .6, pier: pier.id });
        plan.spots.dock.push({ x: dk.x, y: deck, z: dk.z, heading: F.heading, slip: plan.spots.slip.length - 1, pier: pier.id });
      }
    }
  }
}

/** A pond's water in a block of wetland (layout() marks the block kind 'pond' and gives it b.pond). */
export function pondOf(b) { const i = b.sw + 10; return { x0: b.x0 + i, x1: b.x1 - i, z0: b.z0 + i, z1: b.z1 - i }; }

/**
 * The water of a plan as plain numbers: height(x, z) its surface (-Infinity where there is none) and bed(x, z) the ground
 * under it (null where this plan has nothing to say: its streets, and past the ends of its shore, which are the land round
 * it: a City's field, a Metro's land and sea). reach: how far out its water goes (3000 m).
 */
export function planWater(plan, { reach = 3000 } = {}) {
  const W = plan.water, F = W ? shoreFrame(plan.bounds, W.side) : null, kind = W?.kind || 'quay', from = W ? waterFrom(kind) : Infinity;
  const ponds = plan.blocks.filter(b => b.pond).map(b => b.pond);
  const inPond = (x, z) => { for (const p of ponds) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true; return false; };
  // (the shore's band: past the edge, out to reach, along its length; null elsewhere: not this plan's to say)
  const band = (x, z) => { if (!F) return -1; const u = F.u(x, z); if (u < 0 || u > reach) return -1; const a = F.a(x, z); return a < F.a0 || a > F.a1 ? -1 : u; };
  return {
    height(x, z) {
      if (ponds.length && inPond(x, z)) return POND_Y;
      const u = band(x, z); return u < 0 ? null : u < from ? -Infinity : WATER_Y;
    },
    bed(x, z) {
      if (ponds.length && inPond(x, z)) return POND_BED;
      const u = band(x, z); return u < 0 ? null : shoreHeight(kind, u) ?? 0;
    },
  };
}

/**
 * The water of a City or a Metro as one thing to find (links.js 'water'): height(x, z) the surface over water and
 * -Infinity on dry land, bed(x, z) the ground under it, normal() up (it is calm). Swimmers, boats, floating things, the
 * rain and splashes find it. With a gs.outdoors Sea drawn for it (sea), the surface there is the sea's (its swell and surf)
 * and ripples, splashes, rain and watched things are the sea's.
 */
export class CityWater {
  constructor(sources, { view = null, link = true, sea = null } = {}) {
    this.sources = sources; this.sea = sea; this.level = WATER_Y; this._rain = 0;
    this.links = linksFor(view, link); this.links?.join('water', this);
  }
  // (each source answers where it knows, null elsewhere: the first that knows wins, so a district's beach is sand
  // even where the bay round it starts)
  /** The surface over x, z, or -Infinity on dry land. */
  height(x, z) {
    let y = -Infinity; for (const s of this.sources) { const h = s.height(x, z); if (h != null) { y = h; break; } }
    if (y === WATER_Y && this.sea) return this.sea.height(x, z);
    return y;
  }
  /** The ground under the water at x, z (where there is no water: the city's ground, 0). */
  bed(x, z) { for (const s of this.sources) { const v = s.bed(x, z); if (v != null) return v; } return 0; }
  /** Whether x, z is over water. */
  wet(x, z) { return this.height(x, z) > -Infinity; }
  normal(x, z) { return this.sea && this.height(x, z) > -Infinity ? this.sea.normal(x, z) : { x: 0, y: 1, z: 0 }; }
  // a Sea drawn for it does the rest: ripples, splashes, things watched, the rain on it
  get rip() { return this.sea?.rip || null; }
  get splashes() { return this.sea?.splashes || null; }
  get rain() { return this._rain; }
  set rain(k) { this._rain = k; if (this.sea) this.sea.rain = k; }
  splash(x, z, o) { this.sea?.splash(x, z, o); return this; }
  watch(thing, o) { return this.sea ? this.sea.watch(thing, o) : { wet: false, remove() {} }; }
  ripples(o) { this.sea?.ripples(o); return this; }
  dispose() { this.links?.leave(this); }
}

/* ---------- the beach's things, the marina's piers, ponds (three.js) ---------- */

const C = hex => new Color(hex);
function coloured(geo, hex) { const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new Float32Array(n * 3), col = C(hex); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } g.setAttribute('color', new BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g; }
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
/** The beach's props (city.js FURNITURE): make() and the distances their simpler copies take over. White where each copy is coloured. */
export const COAST_SHAPES = {
  // a parasol: a pole and a white canopy (coloured copy by copy), its foot at 0
  parasol: [() => mergeGeometries([coloured(at(new CylinderGeometry(.03, .03, 2.3, 5), 0, 1.15, 0), '#e8e4dc'), coloured(at(new ConeGeometry(1.25, .45, 10, 1, true), 0, 2.2, 0), '#ffffff'),
    coloured(at(new ConeGeometry(1.25, .02, 10, 1), 0, 1.97, 0).rotateX(Math.PI).translate(0, 3.94, 0), '#ffffff')]), []],
  // a lounger, its head end at -z
  lounger: [() => mergeGeometries([coloured(at(new BoxGeometry(.66, .06, 1.25), 0, .3, .25), '#ffffff'), coloured(at(new BoxGeometry(.66, .06, .62).rotateX(-.75), 0, .52, -.55), '#ffffff'),
    ...[[-.28, .7], [.28, .7], [-.28, -.3], [.28, -.3]].map(([x, z]) => coloured(at(new BoxGeometry(.04, .3, .04), x, .15, z), '#c8ccd0'))]), []],
  // a towel on the sand
  towel: [() => coloured(at(new BoxGeometry(.85, .015, 1.7), 0, .008, 0), '#ffffff'), []],
  // a lifeguard's hut on stilts with a ramp up to it, facing +z (the sea)
  tower: [() => mergeGeometries([
    ...[[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].map(([x, z]) => coloured(at(new BoxGeometry(.16, 2.4, .16), x, 1.2, z), '#f4f2ec')),
    coloured(at(new BoxGeometry(2.7, .14, 2.7), 0, 2.45, 0), '#d8d2c4'), coloured(at(new BoxGeometry(2.3, 1.7, 2.1), 0, 3.37, -.15), '#ffd23a'),
    coloured(at(new BoxGeometry(1.7, .7, .05), 0, 3.45, .92), '#2a3a48'), coloured(at(new BoxGeometry(.9, .45, .05), 0, 3.2, -1.21), '#2a3a48'),
    coloured(at(new BoxGeometry(2.6, .14, 2.5), 0, 4.3, -.15), '#e83a3a'), coloured(at(new BoxGeometry(2.7, .1, .1), 0, 2.95, 1.3), '#f4f2ec'),
    coloured(at(new BoxGeometry(.9, .08, 4.2).rotateX(-.55), 0, 1.2, -3.2), '#d8d2c4'),
    coloured(at(new CylinderGeometry(.03, .03, 2, 5), .9, 5.3, -.9), '#e8e8e8'), coloured(at(new BoxGeometry(.5, .32, .02), 1.16, 6.1, -.9), '#e8483a')]), [90]],
};

const WOOD = C('#8a6c4c'), PILE = C('#5a4a3a'), SAND = '#e2cfa0', SANDWET = C('#b9a273'), STONE = C('#a8a294'), BANK = C('#6a5a3a');

/**
 * The meshes' buffers for a plan's shore and ponds (beside the city's own chunk buffers): Q(kind) gives the Quads of a
 * material kind ('sand', 'plain', 'pave', 'grass'). sand: the beach from the promenade down under the water; plain: the
 * quay's sea wall, the marina's decks and piles; ponds: their banks.
 */
export function buildShore(plan, Q, { margin = 40 } = {}) {
  const W = plan.water, out = { meshes: [] };
  if (W) {
    const F = shoreFrame(plan.bounds, W.side, margin), kind = W.kind, P = (u, a, y) => { const [x, z] = F.at(u, a); return [x, y, z]; };
    const up = (q, a, b, c, d, uv, col) => { const n = cross(a, b, d); if (n[1] < 0) q.quad(d, c, b, a, uv && [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]], col); else q.quad(a, b, c, d, uv, col); };
    const face = (q, a, b, c, d, want, col) => { const n = cross(a, b, d); if (n[0] * want[0] + n[2] * want[2] < 0) q.quad(d, c, b, a, undefined, col); else q.quad(a, b, c, d, undefined, col); };
    const into = [-F.nx, 0, -F.nz];
    if (kind === 'beach') {
      // the promenade (paving, its sea wall a step down to the sand), then the sand in strips down the slope
      const pq = Q('pave'), sq = Q('sand');
      const [u0, u1] = BEACH.prom;
      up(pq, P(u0, F.a0, KERB), P(u0, F.a1, KERB), P(u1, F.a1, KERB), P(u1, F.a0, KERB), uvAt(F, u0, u1, F.a0, F.a1, 4));
      face(pq, P(u1, F.a0, KERB), P(u1, F.a1, KERB), P(u1, F.a1, .05), P(u1, F.a0, .05), [F.nx, 0, F.nz]);
      const us = [u1, 12, 18, 24, BEACH.dry, BEACH.dry + 6, BEACH.dry + 12, BEACH.dry + 20, BEACH.dry + 32, BEACH.dry + 46, shoreReach('beach'), shoreReach('beach') + 30];
      const yOf = u => u === u1 ? .05 : u > shoreReach('beach') ? SEA_BED : shoreHeight('beach', u);
      for (let i = 0; i + 1 < us.length; i++) { const a = us[i], b = us[i + 1]; up(sq, P(a, F.a0, yOf(a)), P(a, F.a1, yOf(a)), P(b, F.a1, yOf(b)), P(b, F.a0, yOf(b)), uvAt(F, a, b, F.a0, F.a1, 6), wetCol(yOf(a), yOf(b))); }
      // the ends of the beach: banks down to the sea bed, so its sides aren't open
      for (const [ae, s] of [[F.a0, -1], [F.a1, 1]]) for (let i = 0; i + 1 < us.length; i++) {
        const a = us[i], b = us[i + 1]; face(sq, P(a, ae, yOf(a)), P(b, ae, yOf(b)), P(b, ae, SEA_BED - .2), P(a, ae, SEA_BED - .2), F.alongX ? [s, 0, 0] : [0, 0, s], SANDWET);
      }
      face(pq, P(u0, F.a0, KERB), P(u1, F.a0, KERB), P(u1, F.a0, -.3), P(u0, F.a0, -.3), F.alongX ? [-1, 0, 0] : [0, 0, -1]);
      face(pq, P(u0, F.a1, KERB), P(u1, F.a1, KERB), P(u1, F.a1, -.3), P(u0, F.a1, -.3), F.alongX ? [1, 0, 0] : [0, 0, 1]);
    } else {
      // the quay: stone from the city's edge out to its sea wall, the wall down under the water to the bed
      const pq = Q('pave'), wq = Q('plain');
      up(pq, P(QUAY.from, F.a0, KERB), P(QUAY.from, F.a1, KERB), P(QUAY.to, F.a1, KERB), P(QUAY.to, F.a0, KERB), uvAt(F, QUAY.from, QUAY.to, F.a0, F.a1, 4));
      face(wq, P(QUAY.to, F.a0, KERB), P(QUAY.to, F.a1, KERB), P(QUAY.to, F.a1, SEA_BED), P(QUAY.to, F.a0, SEA_BED), [F.nx, 0, F.nz], STONE);
      for (const [ae, s] of [[F.a0, -1], [F.a1, 1]]) face(wq, P(QUAY.from, ae, KERB), P(QUAY.to, ae, KERB), P(QUAY.to, ae, SEA_BED), P(QUAY.from, ae, SEA_BED), F.alongX ? [s, 0, 0] : [0, 0, s], STONE);
      // a kerb of dark stone along the top of the wall, and bollards' worth of iron rings every 12 m (piles at the marina)
      const kq = Q('plain');
      box(kq, F, QUAY.to - .35, QUAY.to, F.a0, F.a1, KERB, KERB + .12, C('#6c6a64'));
      if (kind === 'marina' && plan.marina) {
        for (const p of plan.marina.piers) {
          box(wq, F, p.u0, p.u1, p.a - p.w / 2, p.a + p.w / 2, p.y - .22, p.y, WOOD);
          for (let u = p.u0 + 3; u < p.u1; u += 4) for (const s of [-1, 1]) box(wq, F, u - .15, u + .15, p.a + s * (p.w / 2 - .1) - .15, p.a + s * (p.w / 2 - .1) + .15, SEA_BED, p.y + .45, PILE);
        }
        for (const f of plan.marina.fingers) {
          box(wq, F, f.u - f.w / 2, f.u + f.w / 2, f.a - f.len / 2, f.a + f.len / 2, f.y - .18, f.y, WOOD);
          const tip = f.a + Math.sign(f.a - plan.marina.piers[f.pier].a) * (f.len / 2 - .2);
          box(wq, F, f.u - .14, f.u + .14, tip - .14, tip + .14, SEA_BED, f.y + .5, PILE);
        }
      }
    }
  }
  // ponds: a bank of mud from the park's grass down to the pond's floor, and the floor
  for (const b of plan.blocks) if (b.pond) {
    const p = b.pond, q = Q('bank'), i = 1.6, y0 = KERB + .01;
    const ring = [[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]], inner = [[p.x0 + i, p.z0 + i], [p.x1 - i, p.z0 + i], [p.x1 - i, p.z1 - i], [p.x0 + i, p.z1 - i]];
    for (let k = 0; k < 4; k++) { const a = ring[k], c = ring[(k + 1) % 4], d = inner[(k + 1) % 4], e = inner[k]; const pts = [[a[0], y0, a[1]], [c[0], y0, c[1]], [d[0], POND_BED, d[1]], [e[0], POND_BED, e[1]]]; const n = cross(pts[0], pts[1], pts[3]); if (n[1] < 0) q.quad(pts[3], pts[2], pts[1], pts[0], undefined, BANK); else q.quad(pts[0], pts[1], pts[2], pts[3], undefined, BANK); }
    q.top(p.x0 + i, p.z0 + i, p.x1 - i, p.z1 - i, POND_BED, 0, BANK);
  }
  return out;
}
const cross = (a, b, d) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
const uvAt = (F, u0, u1, a0, a1, s) => { const p = (u, a) => { const [x, z] = F.at(u, a); return [x / s, -z / s]; }; return [...p(u0, a0), ...p(u0, a1), ...p(u1, a1), ...p(u1, a0)]; };
const wetCol = (ya, yb) => { const k = Math.max(0, Math.min(1, (.05 - Math.min(ya, yb)) / .7)); return new Color('#ffffff').lerp(SANDWET.clone().multiplyScalar(1 / new Color(SAND).r), k * .55); };
// a box in the shore's frame: u0..u1 out, a0..a1 along, y0..y1 up
function box(q, F, u0, u1, a0, a1, y0, y1, col) {
  const [x0, z0] = F.at(u0, a0), [x1, z1] = F.at(u1, a1);
  q.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), col);
}
export const SAND_COLOUR = SAND;

/**
 * The ground of a plan's shore and ponds for gs.physics3d (the meshes' shapes without their looks): the promenade or quay,
 * the marina's decks and piles, a pond's banks and floor into hard; the beach's sand into soft. bed: metres of sea bed past
 * the shore (0 for none: a Metro's own sea bed is its land's).
 */
export function shoreSolid(plan, hard, soft, { margin = 40, bed = 3000 } = {}) {
  buildShore(plan, k => k === 'sand' ? soft : hard, { margin });
  const W = plan.water;
  if (W && bed > 0) {
    const F = shoreFrame(plan.bounds, W.side, margin), u0 = shoreReach(W.kind) + (W.kind === 'beach' ? 30 : 0);
    const [x0, z0] = F.at(u0, F.a0), [x1, z1] = F.at(u0 + bed, F.a1);
    (W.kind === 'beach' ? soft : hard).top(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), SEA_BED);
  }
}
