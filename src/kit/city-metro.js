// gs.city Metro: one big city of districts side by side (a downtown, an old town, a harbour, suburbs...), joined by roads
// across the land between them. Only the districts near the player are real cities (gs.city City, with their traffic,
// people, rooms and lamps); each is made a step at a time over several frames as the player comes near, so no frame
// waits for a whole district, and let go once the player is well past it. Every district not made stands as its
// buildings in plain boxes with lit windows (city-far.js Standins), so the skyline is always whole, and past them all
// the city goes on to the horizon (city-far.js Skyline) as one city does.
//
//   const metro = new Metro(view, { seed: 7, districts: ['downtown', 'oldtown', 'suburb', 'harbour'], far: true });
//   update(dt) { metro.avoid(player, 1.2); metro.update(dt, player); }
//   metro.route(a, b)       a driving route across districts and the roads between them, as City.route()
//   metro.districtAt(x, z)  which district a point is in (or null on the roads between)
//   metro.city              the district the player is in, made (a City), or null between them
//
// The districts share one crowd of people, one ground painter and one set of lamps, so a district made late costs
// only its own streets and buildings: the 0.5 s a city takes to make is mostly its people being shaped.

import { Group, Mesh } from 'three';
import { City, layout, routeOn, roadOn, farColours, cityCrowd, cityFolkNeed, FACADES, STYLES, LANE, KERB, TIER, Quads } from './city.js';
import { Skyline, Standins } from './city-far.js';
import { Ways, RING } from './city-ways.js';
import { CITY_CARS, carKit, parkKit } from './city-cars.js';
import { GroundPaint } from './ground-paint.js';
import { linksFor } from './links.js';
import { Path } from './paths.js';
import { CLIMATES, CityWater, planWater, shoreReach, WATER_Y, SEA_BED } from './city-coast.js';
import { Sea } from './sea.js';
import { rng } from './math.js';
import { phoneClass } from './speed.js';

const ORDER = ['downtown', 'oldtown', 'suburb', 'harbour', 'oldtown', 'suburb', 'downtown', 'suburb'];
const SIZE = { downtown: 6, oldtown: 5, harbour: [5, 3], suburb: 5, beach: [3, 6], marina: [4, 3], glades: 5 };
const MARGIN = 40;     // each district's own asphalt reaches this far past its outer roads (as a City's does)
const LAND = 3040;     // the land round the whole city, from its outer edge (where the far skyline's land begins)

/** The districts as given: a number, a list of style names, or of { style, blocks, seed, name }. */
function districtList(d) {
  const list = typeof d === 'number' ? ORDER.slice(0, Math.max(1, d)).concat(Array.from({ length: Math.max(0, d - ORDER.length) }, (_, i) => ORDER[i % ORDER.length])) : d;
  return list.map((x, i) => {
    const { style = 'downtown', blocks, seed, name, ...extra } = typeof x === 'string' ? { style: x } : x;
    return { style, blocks: blocks ?? SIZE[style] ?? 5, seed, extra, name: name || style + (list.slice(0, i).some(y => (y.style || y) === style) ? ' ' + (i + 1) : '') };
  });
}
const rectOf = P => ({ x0: P.bounds.x0, x1: P.bounds.x1, z0: P.bounds.z0, z1: P.bounds.z1 });
const grow = (r, m) => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const distToRect = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/**
 * Where the districts of a big city go, as plain numbers (no view): { districts: [{ name, style, plan, rect, harbour }], bounds, R }.
 * The first is the middle; each next one beside one already placed (east, west or north) as near the middle as it fits with
 * `between` metres of land between; harbours along the south edge with the sea past them.
 */
export function metroPlan({ seed = 1, districts = 4, between = [120, 240], side = 'right', river = true, coast = 'south', bay = 420, climate = null, ...over } = {}) {
  // the districts' plans, placed side by side (layout() is plain numbers: all of them now, made into cities later)
  const R = rng(seed * 41 + 5), list = districtList(districts), placed = [], gapAt = () => between[0] + R() * (between[1] - between[0]);
  const styled = Object.fromEntries(Object.entries(over).filter(([k]) => k in STYLES.downtown || k === 'houses' || k === 'water' || k === 'kinds' || k === 'parkKinds'));   // (style numbers: tall, parks... for layout)
  // (a district's climate: its own, else its style's, else the whole city's)
  const climateOf = d => d.extra.climate ?? (STYLES[d.style] || {}).climate ?? climate;
  const plan = (d, i, centre, more = {}) => { const c = climateOf(d); return layout({ seed: d.seed ?? seed * 31 + i * 7 + 1, blocks: d.blocks, style: d.style, side, centre, ...styled, ...(c ? { climate: c } : {}), ...d.extra, ...more }); };
  // (what the district is made with later, as its plan was: its climate, and the side its water is on in a bay)
  const extraOf = (d, more = {}) => { const c = climateOf(d); return { ...(c ? { climate: c } : {}), ...d.extra, ...more }; };
  const wet = d => !!(d.extra.water ?? (STYLES[d.style] || {}).water);
  const land = list.filter(d => !wet(d)), sea = coast === 'bay' ? [] : list.filter(wet);
  // a river down the gap between the middle district and the next (a wide gap: room for its banks and the bridges' ramps)
  let flow = null; const BAND = 125;
  const inBand = r => flow && (flow.axis === 'z' ? r.x1 > flow.c - BAND && r.x0 < flow.c + BAND : r.z1 > flow.c - BAND && r.z0 < flow.c + BAND);
  for (const d of land) {
    const i = list.indexOf(d), P0 = plan(d, i, null), w = P0.bounds.x1 - P0.bounds.x0, h = P0.bounds.z1 - P0.bounds.z0;
    let best = null;
    if (!placed.length) best = [0, 0];
    else {
      // beside one already placed (east, west or north of it: the south edge is the sea's), the nearest the middle that is free
      const g = river && placed.length === 1 && land.length > 1 ? 330 : gapAt();
      for (const o of placed) for (const [sx, sz] of [[1, 0], [-1, 0], [0, -1]]) for (const slide of [0, -.3, .3]) {
        const cx = sx ? (sx > 0 ? o.rect.x1 + g + w / 2 : o.rect.x0 - g - w / 2) : (o.rect.x0 + o.rect.x1) / 2 + slide * w;
        const cz = sz ? o.rect.z0 - g - h / 2 : (o.rect.z0 + o.rect.z1) / 2 + slide * h;
        const r = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - h / 2, z1: cz + h / 2 };
        if (placed.some(p => overlaps(grow(r, g / 2 - 1), grow(p.rect, g / 2 - 1))) || inBand(r)) continue;
        const score = Math.hypot(cx, cz) * (1 + R() * .15);
        if (!best || score < best[2]) best = [cx, cz, score, sx ? (sx > 0 ? o.rect.x1 + g / 2 : o.rect.x0 - g / 2) : o.rect.z0 - g / 2, sx ? 'z' : 'x'];
      }
      if (!best) { const far = placed.reduce((m, p) => Math.max(m, p.rect.x1), -Infinity) + g + w / 2; best = [far + (inBand({ x0: far - w / 2, x1: far + w / 2, z0: -h / 2, z1: h / 2 }) ? 2 * BAND : 0), 0, 0]; }
    }
    const P = plan(d, i, [best[0], best[1]]);
    placed.push({ ...d, index: i, plan: P, rect: rectOf(P), extra: extraOf(d) });
    if (river && placed.length === 2 && best[4]) flow = { axis: best[4], c: best[3], amp: 40 };
  }
  // the harbours along the south edge, the first under the middle district, the sea past them
  for (const d of sea) {
    const i = list.indexOf(d), P0 = plan(d, i, null), w = P0.bounds.x1 - P0.bounds.x0, h = P0.bounds.z1 - P0.bounds.z0, g = gapAt();
    const south = placed.reduce((m, p) => Math.max(m, p.rect.z1), -Infinity), last = placed.filter(p => p.harbour).at(-1);
    let cx = last ? last.rect.x1 + g + w / 2 : 0; const cz = last ? (last.rect.z0 + last.rect.z1) / 2 : (placed.length ? south + g + h / 2 : 0);
    if (inBand({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - h / 2, z1: cz + h / 2 })) cx = flow.c > cx ? flow.c - BAND - w / 2 : flow.c + BAND + w / 2;   // (clear of the river's mouth)
    const P = plan(d, i, [cx, cz]);
    placed.push({ ...d, index: i, plan: P, rect: rectOf(P), harbour: true, extra: extraOf(d) });
  }
  // a bay (coast: 'bay'): the waterfront districts (a marina, a harbour) along the mainland's east side facing it, and the
  // beaches out on an island across it, facing the open sea to the east; roads across the water are causeways
  let waters = null;
  if (coast === 'bay') {
    const M = placed.reduce((u, d) => ({ x0: Math.min(u.x0, d.rect.x0), x1: Math.max(u.x1, d.rect.x1), z0: Math.min(u.z0, d.rect.z0), z1: Math.max(u.z1, d.rect.z1) }), { x0: 0, x1: 0, z0: 0, z1: 0 });
    const front = list.filter(d => wet(d) && (d.extra.shore ?? (STYLES[d.style] || {}).shore) !== 'beach'), island = list.filter(d => wet(d) && !front.includes(d));
    const stack = (ds, x0, mid, gap, more) => {
      const P0 = ds.map(d => plan(d, list.indexOf(d), null, more)), H = P0.reduce((s, P) => s + P.bounds.z1 - P.bounds.z0, 0) + gap * Math.max(0, ds.length - 1);
      let z = mid - H / 2;
      ds.forEach((d, k) => { const P = P0[k], w = P.bounds.x1 - P.bounds.x0, h = P.bounds.z1 - P.bounds.z0, Q = plan(d, list.indexOf(d), [x0 + w / 2, z + h / 2], more); placed.push({ ...d, index: list.indexOf(d), plan: Q, rect: rectOf(Q), harbour: true, extra: extraOf(d, more) }); z += h + gap; });
    };
    const fx = M.x1 + (front.length ? 250 + R() * 60 : 0);   // (room for the highway between)
    if (front.length) stack(front, fx, (M.z0 + M.z1) / 2, 140, { water: 'east' });
    const E = placed.reduce((m, d) => Math.max(m, d.rect.x1), -Infinity);
    if (island.length) stack(island, E + bay, (M.z0 + M.z1) / 2, 160, { water: 'east' });
    const isl = placed.filter(d => island.some(i => i.name === d.name)), I = isl.length ? isl.reduce((u, d) => ({ x0: Math.min(u.x0, d.rect.x0), x1: Math.max(u.x1, d.rect.x1), z0: Math.min(u.z0, d.rect.z0), z1: Math.max(u.z1, d.rect.z1) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }) : null;
    const fronts = placed.filter(d => front.some(f => f.name === d.name)), F0 = fronts.length ? Math.max(...fronts.map(d => d.rect.x1)) + 2 : M.x1 + 120;
    // the bay (from the waterfront to the island, opening to the sea south and north of it), and the open sea past the island
    const ix0 = I ? I.x0 - 40 : F0 + bay, ix1 = I ? I.x1 + 2 : ix0;
    waters = [{ x0: F0, x1: ix0, z0: M.z0 - 3000, z1: M.z1 + 3000, name: 'bay' }, { x0: ix1, x1: ix1 + 3000, z0: M.z0 - 3000, z1: M.z1 + 3000, name: 'sea' }];
    if (I) waters.push({ x0: ix0, x1: ix1, z0: I.z1 + 40, z1: M.z1 + 3000, name: 'sea' }, { x0: ix0, x1: ix1, z0: M.z0 - 3000, z1: I.z0 - 40, name: 'sea' });
  }
  const list2 = placed.sort((a, b) => a.index - b.index).map(d => ({ name: d.name, style: d.style, plan: d.plan, rect: d.rect, harbour: !!d.harbour, city: null, making: null, stand: null, extra: d.extra }));
  const bounds = list2.reduce((u, d) => ({ x0: Math.min(u.x0, d.rect.x0), x1: Math.max(u.x1, d.rect.x1), z0: Math.min(u.z0, d.rect.z0), z1: Math.max(u.z1, d.rect.z1) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
  if (flow) { const I = grow(bounds, 340); flow.sea = flow.axis === 'z' && list2.some(d => d.harbour); flow.from = flow.axis === 'z' ? I.z0 + 40 : I.x0 + 40; flow.to = flow.axis === 'z' ? (flow.sea ? bounds.z1 + 200 : I.z1 - 40) : I.x1 - 40; }
  return { districts: list2, bounds, R, river: flow, waters };
}

export class Metro {
  /**
   * view: a gs.hd HDView (or any view a City takes). districts: how many (4), or a list of styles ('downtown', 'oldtown',
   * 'harbour', 'suburb') or of { style, blocks, seed, name }; the first is the middle, the others placed round it with land
   * between (between: [least, most] metres, [120, 240]), a harbour always on the south edge with the sea past it.
   * live: metres from a district within which it is made, a step at a time over the frames (380); budget: ms a frame
   * spent making one (3). keep: as City's (each district lets its blocks go behind the player). far: the city to the
   * horizon past all the districts, as City's. at: where the player starts (that district is made at once). hills: how
   * hilly the land between and round the districts is, 0..1 (.5; the districts stay level); river: a river down the gap
   * between the first two districts, with bridges over it (true); highway: a highway round the whole city on piers, with
   * a slip road to each district it can reach (true); the roads between are cut, filled, bridged and tunnelled to fit. The other
   * options (traffic, people, night, sky, lamps, sound, side, rooms, dress, parked, walls, detail...) go to every district.
   */
  constructor(view, { seed = 1, districts = 4, between = [120, 240], side = 'right', at = null, live = 380, budget = 3, keep = 600, far = false, night = null, sky = null,
    lamps = true, sound = true, traffic = 1, people = 1, paint = !!view.placeLamps, crowd = !!view.placeLamps, link = true, hills = null, river = true, highway = true, climate = null, coast = 'south', bay = 420, sea = false, ...over } = {}) {
    this.view = view; this.seed = seed; this.live = live; this.budget = budget; this.t = 0;
    this.links = linksFor(view, link); this.links?.join('city', this);
    this.sky = sky || null; this.seeksSky = sky == null && night == null && !!this.links; this._night = night ?? 0;
    this.lampsOn = lamps; this.soundOn = sound; this.side = side;
    this.group = new Group(); this.group.name = 'metro'; view.scene.add(this.group);
    // the districts' plans, placed side by side (plain numbers: all of them now, made into cities later)
    const M = metroPlan({ seed, districts, between, side, river, coast, bay, climate, ...over }), U = this.bounds = M.bounds; this.districts = M.districts;
    const CL = CLIMATES[climate] || CLIMATES.temperate; hills ??= CL.hills; this.waters = M.waters; this.climate = climate || 'temperate';
    // what each district is made with: the options given, and the parts they share (people, the ground painter, lamps)
    if (crowd && people > 0) cityFolkNeed();
    // every district's cars are shaped now, with the first (a new style of car takes a tenth of a second: not in the middle of a drive)
    if ((over.fleet ?? !!view.placeLamps) && traffic > 0) for (const st of new Set(this.districts.map(d => d.style))) (CITY_CARS[st] || CITY_CARS.downtown).forEach((s, i) => { carKit(s); if (i < 3 && (over.parked ?? !!view.placeLamps)) parkKit(s); });   // (the three commonest park: City)
    this.crowd = crowd && people > 0 ? cityCrowd(view) : null;
    this.paint = paint ? new GroundPaint(view) : null;
    this.make = { side, traffic, people, keep, lamps: lamps ? 'shared' : false, sound: false, occlude: false, field: false, far: false, link: false, night: this._night, crowd: this.crowd || false, paint: this.paint || false, ...(climate ? { climate } : {}), ...over, shared: true };
    view.occluders?.(this.occluders());
    // the roads between the districts, then the land under everything that is not a district or the sea
    this.connectors = this.connect();
    this.ways = new Ways(this, { seed, hills, river: M.river, highway, traffic, fleet: (over.fleet ?? !!view.placeLamps) && traffic > 0, grass: CL.grass, waters: M.waters });
    // the water of the whole city as one thing to find: each district's shore and ponds first, then the river, bay and sea
    // between (links.js 'water': swimmers, boats, floating things, rain and splashes); a gs.outdoors Sea drawn for it with sea
    const ws = this.ways;
    this.wet = !!(M.river || M.waters || this.districts.some(d => d.plan.water || d.plan.blocks.some(b => b.pond)));
    this.water = this.wet ? new CityWater([...this.districts.map(d => planWater(d.plan, { reach: shoreReach(d.plan.water?.kind) + 30 })), { height: (x, z) => ws.waterAt(x, z), bed: (x, z) => ws.waterAt(x, z) == null ? null : ws.bedAt(x, z) }], { view, link }) : null;
    if (this.water && sea) {
      const seaOpts = typeof sea === 'object' ? sea : {};
      this.sea = new Sea({ level: WATER_Y, waves: .5, far: 4000, ...seaOpts, bed: (x, z) => this.water.bed(x, z), view, link: false });
      this.group.add(this.sea.mesh); if (this.sea.wetMesh) this.group.add(this.sea.wetMesh);
      for (const m of ws.water) m.visible = false; ws.seaShown = () => {};
      this.water.sea = this.sea;
    }
    this.ring = this.ways.ring; this.ramps = this.ways.ramps;
    // each district stands as boxes until it is made
    for (const d of this.districts) {
      const chunks = new Map([[d.name, { key: d.name, blocks: d.plan.blocks }]]);
      d.stand = new Standins(this.group, d.plan, chunks, { colourOf: b => b.colour || FACADES[b.facade].wall || FACADES[b.facade].glass });
      d.stand.night = this._night;
    }
    const S0 = this.districts[0].plan.style, scale = TIER[phoneClass()] ?? .65;
    this.far = far ? new Skyline(view, { bounds: U, seed }, { seed, colours: farColours(S0), street: S0.ground, reach: far === true ? 6000 : +far, floors: S0.floors, tall: S0.tall, water: this.districts.some(d => d.harbour), scale, ground: LAND }) : null;
    // the district the player starts in is made now (under the loading screen); the rest as the player comes near
    const first = (at && this.districtAt(at.x, at.z ?? at.y, MARGIN)) || this.districts[0];
    this.makeNow(first, at);
    this.start = at || first.city.start;
    this.focus = { x: this.start.x, z: this.start.z ?? this.start.y };
    // the traffic and people of every made district, as City's cars and people
    const m = this;
    const W = () => m.ways.traffic?.list || [], wayNear = (p, r) => W().filter(c => Math.hypot(c.x - p.x, c.z - (p.z ?? p.y)) < r + 2.2 && Math.abs(c.y - (p.y != null && p.z != null ? p.y : c.y)) < 3);
    this.cars = { hit: (p, r) => m.first(c => c.cars.hit(p, r)) || wayNear(p, r)[0] || null, near: (p, r) => m.cities.flatMap(c => c.cars.near(p, r)).concat(wayNear(p, r)),
      bump: car => { for (const c of m.cities) if (c.cars.list.includes(car)) c.cars.bump(car); if (W().includes(car)) car.v = 0; }, get list() { return m.cities.flatMap(c => c.cars.list).concat(W()); } };
    this.people = { hit: (p, r) => m.first(c => c.people.hit(p, r)), near: (p, r) => m.cities.flatMap(c => c.people.near(p, r)), scare: (p, r, t) => { for (const c of m.cities) c.people.scare(p, r, t); return m.people; },
      knock: (q, dx, dz, t) => { for (const c of m.cities) if (c.people.list.includes(q)) c.people.knock(q, dx, dz, t); return q; }, get list() { return m.cities.flatMap(c => c.people.list); } };
  }
  /** The districts made now (Cities). */
  get cities() { return this.districts.filter(d => d.city).map(d => d.city); }
  /** The made district the player is in, or null on the roads between. */
  get city() { const d = this.districtAt(this.focus.x, this.focus.z, MARGIN); return d?.city || null; }
  first(fn) { for (const c of this.cities) { const r = fn(c); if (r) return r; } return null; }
  /** The district at x, z (within `margin` metres of its outer roads), or null. */
  districtAt(x, z, margin = 0) { for (const d of this.districts) if (distToRect(d.rect, x, z) <= margin) return d; return null; }
  /** Resolves when everything the districts are made from is in, as City.ready(). */
  static ready(o) { return City.ready(o); }

  /* ---------- making and letting go of districts ---------- */
  cityOptions(d, at) { return { ...this.make, ...d.extra, seed: d.plan.seed, blocks: [d.plan.nx, d.plan.nz], style: d.style, centre: d.plan.centre, night: this._night, at: at ? { x: at.x, z: at.z ?? at.y } : null }; }
  makeNow(d, at) { const it = City.over(this.view, this.cityOptions(d, at)); let r; while (!(r = it.next()).done); this.made(d, r.value); }
  made(d, city) {
    d.city = city; d.making = null; d.stand.group.visible = false; city.water = this.water;
    if (city.waterMesh && (this.sea || this.waters)) city.waterMesh.visible = false;   // (the metro's sea, or its bay, is drawn whole)
    if (d.harbour && !this.waters) this.ways.seaShown(false);
    if (this.world) city.solid(this.world, { ...this.solidOpts, floor: false });
    this.view.shadowsDirty?.();
  }
  letGo(d) {
    d.city.dispose(); d.city = null; d.stand.group.visible = true; this.view.shadowsDirty?.();
    if (d.harbour && !this.waters && !this.districts.some(e => e.harbour && e.city)) this.ways.seaShown(true);
    if (this.view.lamps) for (const l of this.view.lamps) l.intensity = 0;
  }
  // one district made a step at a time (the nearest wanted first), and one let go a frame once the player is well past it
  stream(f) {
    const t0 = performance.now();
    if (!this.making) {
      let want = null, wd = Infinity;
      for (const d of this.districts) { const dd = distToRect(d.rect, f.x, f.z); if (!d.city && dd < this.live && dd < wd) { want = d; wd = dd; } }
      if (want) { const r = want.rect, at = { x: Math.max(r.x0, Math.min(r.x1, f.x)), z: Math.max(r.z0, Math.min(r.z1, f.z)) }; this.making = want; want.making = City.over(this.view, this.cityOptions(want, at)); }
    }
    if (this.making) {
      const d = this.making;
      for (;;) { const r = d.making.next(); if (r.done) { this.made(d, r.value); this.making = null; break; } if (performance.now() - t0 > this.budget) break; }
    }
    for (const d of this.districts) if (d.city && d !== this.making && distToRect(d.rect, f.x, f.z) > this.live * 1.3 + 100) { this.letGo(d); break; }
  }

  /** Makes now every district the player at `at` would want (from a game's reset(), under the loading screen), so none is made a step at a time in the first seconds. */
  prepare(at = this.focus) {
    const x = at.x, z = at.z ?? at.y; this.focus = { x, z };
    if (this.making && distToRect(this.making.rect, x, z) < this.live) { const d = this.making; let r; while (!(r = d.making.next()).done); this.made(d, r.value); this.making = null; }
    for (const d of this.districts) if (!d.city && d !== this.making && distToRect(d.rect, x, z) < this.live) { const r = d.rect; this.makeNow(d, { x: Math.max(r.x0, Math.min(r.x1, x)), z: Math.max(r.z0, Math.min(r.z1, z)) }); }
    return this;
  }
  /** How dark it is, 0..1, for every district (or follows sky). */
  get night() { return this._night; }
  set night(k) { if (!this.following) this.seeksSky = false; this._night = Math.max(0, Math.min(1, k)); }

  /** Cars and people back round the start (call from your game's reset()). */
  reset(focus = this.start) { this.t = 0; for (const c of this.cities) c.reset(focus); return this; }

  /** Once a frame, as City's: makes the districts coming near and lets go of those left behind, then moves each made one. */
  update(dt, focus = this.view.cam.position) {
    const f = { x: focus.x, z: focus.z ?? focus.y }; this.t += dt; this.focus = f;
    const sky = this.sky || (this.seeksSky ? this.links?.one('sky') : null);
    if (sky) { this.following = true; this.night = sky.night ?? 0; this.following = false; }
    this.stream(f);
    const here = this.districtAt(f.x, f.z, 60);
    for (const d of this.districts) {
      d.stand.night = this._night;
      const c = d.city; if (!c) continue;
      if (Math.abs(c.night - this._night) >= .01) c.night = this._night;
      c.soundOn = this.soundOn && d === here;
      c.update(dt, f);
    }
    this.ways.update(dt, f, this._night, this._avoid || []); if (this._avoid) this._avoid.length = 0;
    // one set of lamps for all of them: the nearest street lamps and headlights of whichever districts are made
    const v = this.view;
    if (this.lampsOn && v.placeLamps && (this._night > .05 || this.indoor?.length)) {
      if (!v.lamps?.length) v.lampLights(26);
      const all = this._lamps ||= []; all.length = 0;
      for (const l of this.indoor || []) all.push(l);   // (the lamps of a room behind a door, by day too: gs.city Interiors)
      for (const c of this.cities) for (const l of c._lamps || []) all.push(l);
      for (const l of this.ways.traffic?.headlamps(this._night, this._hl ||= []) || []) all.push(l);
      v.placeLamps(all, f.x, 2, f.z, this.t);
    } else if (v.lamps?.length) for (const l of v.lamps) l.intensity = 0;
    this.crowd?.update(dt);
    this.paint?.update(v.cam.position);
    this.far?.update(this._night);
    return this;
  }

  /* ---------- the roads between districts ---------- */
  // which districts face each other across the land, and a road between the two outer junctions most nearly in line
  connect() {
    const D = this.districts, out = [], joined = new Set(), group = D.map((_, i) => i), top = i => group[i] === i ? i : (group[i] = top(group[i]));
    const outer = (d, side) => d.plan.nodes.filter(n => side === 'e' ? n.i === d.plan.nx : side === 'w' ? n.i === 0 : side === 's' ? n.j === d.plan.nz : n.j === 0);
    const dirOf = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] }, back = { e: 'w', w: 'e', s: 'n', n: 's' };
    const add = (a, b, sa) => {
      const sb = back[sa], A = outer(a, sa), B = outer(b, sb); let best = null;
      for (const p of A) for (const q of B) { const lateral = sa === 'e' || sa === 'w' ? Math.abs(p.z - q.z) : Math.abs(p.x - q.x), s = lateral + .25 * Math.hypot(p.x - q.x, p.z - q.z); if (!best || s < best[2]) best = [p, q, s]; }
      if (!best) return;
      const [p, q] = best, wa = sa === 'e' || sa === 'w' ? a.plan.wz[p.j] : a.plan.wx[p.i], wb = sb === 'e' || sb === 'w' ? b.plan.wz[q.j] : b.plan.wx[q.i];
      out.push(this.road3(a, p, dirOf[sa], b, q, dirOf[sb], Math.max(wa, wb), out.length)); group[top(D.indexOf(a))] = top(D.indexOf(b)); joined.add(a.name + '|' + b.name);
    };
    for (const a of D) for (const b of D) {
      if (a === b) continue;
      const zo = Math.min(a.rect.z1, b.rect.z1) - Math.max(a.rect.z0, b.rect.z0), xo = Math.min(a.rect.x1, b.rect.x1) - Math.max(a.rect.x0, b.rect.x0);
      if (b.rect.x0 > a.rect.x1 && zo > 60 && b.rect.x0 - a.rect.x1 < 600) add(a, b, 'e');
      if (b.rect.z0 > a.rect.z1 && xo > 60 && b.rect.z0 - a.rect.z1 < 600) add(a, b, 's');
    }
    // any left on their own: joined to the nearest of the rest, on the sides facing most nearly
    for (let guard = 0; guard < D.length; guard++) {
      const lone = D.findIndex((_, i) => top(i) !== top(0)); if (lone < 0) break;
      const a = D[lone]; let best = null;
      for (const b of D) if (top(D.indexOf(b)) === top(0)) { const dx = (b.rect.x0 + b.rect.x1 - a.rect.x0 - a.rect.x1) / 2, dz = (b.rect.z0 + b.rect.z1 - a.rect.z0 - a.rect.z1) / 2, d = Math.hypot(dx, dz); if (!best || d < best[1]) best = [b, d, Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n')]; }
      add(a, best[0], best[2]);
    }
    return out;
  }
  // a road from junction p of district a (leaving along out a) to junction q of b: a curve sampled every few metres
  road3(a, p, oa, b, q, ob, width, id) {
    const L = Math.hypot(q.x - p.x, q.z - p.z), k = L * .42, ha = oa[0] ? p.hx : p.hz, hb = ob[0] ? q.hx : q.hz;
    const P0 = [p.x + oa[0] * ha, p.z + oa[1] * ha], P3 = [q.x + ob[0] * hb, q.z + ob[1] * hb], P1 = [P0[0] + oa[0] * k, P0[1] + oa[1] * k], P2 = [P3[0] + ob[0] * k, P3[1] + ob[1] * k];
    const n = Math.max(8, Math.ceil(L / 4)), pts = [[p.x, p.z]];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t, x = u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0], z = u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1]; pts.push([x, z]); }
    pts.push([q.x, q.z]);
    const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { id, a, b, from: p, to: q, points: pts, at: s, len: s.at(-1), width, lanes: width >= 15 ? 2 : 1, speed: width >= 15 ? 18 : 14 };
  }
  /** A point s metres along a road between districts, a slip road or the highway (from its first end): { x, y, z, dx, dz, kind, grade } (dx, dz its direction; kind 0 on the land, 1 a bridge, 2 a tunnel). */
  along(r, s, out = {}) { return this.ways.at(r, s, out); }
  /** The middle of lane k of a road between districts (or the highway, or a slip road), s metres along it, driving from its first end (back: from its second). */
  lanePos(r, k, s, back = false, out = {}) {
    const p = this.along(r, back ? r.len - s : s, out), off = ((k + .5) * LANE + (r.median ? .9 : .2)) * (this.side === 'left' ? -1 : 1) * (back ? -1 : 1);
    out.x = p.x - p.dz * off; out.z = p.z + p.dx * off; if (back) { out.dx = -p.dx; out.dz = -p.dz; out.grade = -p.grade; } return out;
  }
  // the nearest point on a road between districts, a slip road or the highway: { d, road, s, x, y, z }
  onRoad(x, z, reach = 400) { return this.ways.near(x, z, reach); }
  /** The nearest point in a driving lane, in a district or on the roads between: as City.road(), plus road (between districts) or district, and y. */
  road(x, z) {
    const d = this.districtAt(x, z, MARGIN), c = this.onRoad(x, z);
    if (d && (!c || distToRect(d.rect, x, z) <= 0 || c.d > 8)) { const r = roadOn(d.plan, x, z); r.district = d; r.y = 0; return r; }
    if (!c) return null;
    const R = c.road, right = c.lateral > 0 === (this.side !== 'left'), k = R.lanes > 1 && Math.abs(c.lateral) > LANE + 1 ? 1 : 0, q = this.lanePos(R, k, right ? c.s : R.len - c.s, !right);
    return { d: Math.hypot(q.x - x, q.z - z), x: q.x, y: q.y, z: q.z, heading: Math.atan2(q.dx, q.dz), road: R, lane: k, s: c.s, back: !right };
  }
  /**
   * A driving route from a to b across the districts, the roads between them and the highway, keeping to the driving
   * side: as City.route() ({ points, path, length }), plus legs: [{ district | road, from, to }] in order (road can be the highway).
   */
  route(a, b) {
    const ax = a.x, az = a.z ?? a.y, bx = b.x, bz = b.z ?? b.y, ring = this.ring, RL = ring?.len || 1;
    const ringD = (s0, s1) => { const d = Math.abs(s1 - s0) % RL; return Math.min(d, RL - d); };
    const where = (x, z) => { const d = this.districtAt(x, z, MARGIN), c = this.onRoad(x, z); return d && (!c || c.d > 10 || distToRect(d.rect, x, z) <= 0) ? { district: d, x, z } : c ? { road: c.road, s: c.s, x, z } : { district: this.districtAt(x, z, Infinity) || this.nearestDistrict(x, z), x, z }; };
    const A = where(ax, az), B = where(bx, bz);
    // the ends of every road: a district's junction, or beside the highway; the shortest way through them (distance within a district guessed as city blocks)
    const ports = [];
    for (const r of [...this.connectors, ...this.ramps]) ports.push({ road: r, end: 0, d: r.a, n: r.from, s: 0 }, { road: r, end: 1, d: r.b, n: r.to, s: r.len, ringS: r.ringS });
    const man = (n, x, z) => Math.abs(n.x - x) + Math.abs(n.z - z), onRing = q => q.d === RING;
    const N = ports.length, SRC = N, DST = N + 1, dist = new Array(N + 2).fill(Infinity), prev = new Array(N + 2).fill(-1), done = new Array(N + 2).fill(false);
    const toDst = (p, out) => {   // (from a port to b)
      if (B.district && B.district === p.d) out.push([DST, man(p.n, bx, bz)]);
      if (B.road === p.road && !p.road.ring) out.push([DST, Math.abs(p.s - B.s)]);
      if (B.road === ring && ring && onRing(p)) out.push([DST, ringD(p.ringS, B.s)]);
    };
    const nbrs = i => {
      const out = [];
      if (i === SRC) {
        for (let j = 0; j < N; j++) {
          const q = ports[j];
          if (A.district && q.d === A.district) out.push([j, man(q.n, ax, az)]);
          else if (A.road && !A.road.ring && q.road === A.road) out.push([j, Math.abs(q.s - A.s)]);
          else if (A.road === ring && ring && onRing(q)) out.push([j, ringD(A.s, q.ringS)]);
        }
        if (A.district && B.district === A.district) out.push([DST, Math.abs(ax - bx) + Math.abs(az - bz)]);
        if (A.road && B.road === A.road) out.push([DST, A.road.ring ? ringD(A.s, B.s) : Math.abs(A.s - B.s)]);
        return out;
      }
      const p = ports[i];
      out.push([ports.findIndex(o => o.road === p.road && o.end !== p.end), p.road.len]);
      for (let j = 0; j < N; j++) if (j !== i && ports[j].d === p.d) out.push([j, onRing(p) ? ringD(p.ringS, ports[j].ringS) : man(ports[j].n, p.n.x, p.n.z)]);
      toDst(p, out);
      return out;
    };
    dist[SRC] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < N + 2; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === DST) break; done[u] = true;
      for (const [v, w] of nbrs(u)) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    if (prev[DST] < 0) return null;
    const chain = [SRC]; for (let i = DST; i >= 0 && i !== SRC; i = prev[i]) chain.splice(1, 0, i);
    // the legs between each pair of stops: along a road, round the highway, or through a district by its own streets
    const pts = [], legs = [], push = list => { for (const p of list) { const l = pts.at(-1); if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > .5) pts.push(p); } };
    const roadLeg = (r, s0, s1) => {
      const back = s1 < s0, list = [];
      for (let s = s0; back ? s > s1 : s < s1; s += back ? -6 : 6) { const p = this.lanePos(r, 0, back ? r.len - s : s, back); list.push([p.x, p.z]); }
      const p = this.lanePos(r, 0, back ? r.len - s1 : s1, back); list.push([p.x, p.z]); push(list); legs.push({ road: r, from: s0, to: s1 });
    };
    const ringLeg = (s0, s1) => {
      let d = ((s1 - s0) % RL + RL) % RL; const dir = d <= RL / 2 ? 1 : -1; if (dir < 0) d = RL - d;
      const list = [], back = dir < 0;
      for (let t = 0; t < d; t += 8) { const s = s0 + dir * t, p = this.lanePos(ring, 1, back ? RL - s : s, back); list.push([p.x, p.z]); }
      const p = this.lanePos(ring, 1, back ? RL - s1 : s1, back); list.push([p.x, p.z]); push(list); legs.push({ road: ring, from: s0, to: s1 });
    };
    const stop = i => i === SRC ? { ...A, at: { x: ax, z: az } } : i === DST ? { ...B, at: { x: bx, z: bz } } : { port: ports[i], d: ports[i].d, road: ports[i].road, s: ports[i].s, ringS: ports[i].ringS, at: ports[i].n };
    for (let k = 0; k + 1 < chain.length; k++) {
      const u = stop(chain[k]), v = stop(chain[k + 1]);
      if (u.road && v.road === u.road && !u.road.ring) roadLeg(u.road, u.s, v.s);
      else if (ring && (u.d === RING || u.road === ring) && (v.d === RING || v.road === ring)) ringLeg(u.road === ring ? u.s : u.ringS, v.road === ring ? v.s : v.ringS);
      else {
        const d = (u.d && u.d !== RING ? u.d : null) || u.district || (v.d && v.d !== RING ? v.d : null) || v.district;
        const r = routeOn(d.plan, u.at, v.at); push(r.points); legs.push({ district: d, from: u.at, to: v.at });
      }
    }
    const path = new Path(pts.map(([x, z]) => ({ x, y: 0, z })), { kind: 'line' });
    return { points: pts, path, length: path.length ?? 0, legs };
  }
  nearestDistrict(x, z) { return this.districts.reduce((m, d) => distToRect(d.rect, x, z) < distToRect(m.rect, x, z) ? d : m); }

  /* ---------- answers for the game, from whichever district is there ---------- */
  /** Cars brake for this for one frame (in every made district). */
  avoid(p, r = 1) { for (const c of this.cities) c.avoid(p, r); (this._avoid ||= []).push({ x: p.x, z: p.z ?? p.y, r }); return this; }
  /** The building at x, z (made or not), or null. */
  buildingAt(x, z) { const d = this.districtAt(x, z, 0); if (!d) return null; if (d.city) return d.city.buildingAt(x, z); for (const b of d.plan.buildings) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b; return null; }
  /** Height of the ground at x, z, as City.ground(); between districts the road or the land there (under height y, when given: under a bridge, the land; in a tunnel, the road). */
  ground(x, z, y = Infinity) {
    const d = this.districtAt(x, z, 0); if (!d) return this.ways.surface(x, z, y); if (d.city) return d.city.ground(x, z);
    const b = this.buildingAt(x, z); if (b) return b.h; for (const k of d.plan.blocks) if (x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1) return KERB; return 0;
  }
  /** The height of the road at x, z (the deck on a bridge, the road in a tunnel; the land off the roads): for things drawn on the road, such as Gps's way. */
  roadY(x, z) { if (this.districtAt(x, z, 0)) return 0; const n = this.ways.near(x, z, 14); return n && n.d < n.road.width / 2 + .5 ? n.y + .05 : this.ways.landAt(x, z); }
  /** As City.collide(): out of the buildings and parked cars of the district there (made or not: its buildings). */
  collide(p, r = .4, y = 0) {
    const z = p.z ?? p.y, d = this.districtAt(p.x, z, r + 2); if (!d) return this.ways.collide(p, r, y);
    if (d.city) return d.city.collide(p, r, y);
    const key = p.z != null ? 'z' : 'y'; let hit = null;
    for (const b of d.plan.buildings) for (const part of b.parts) {
      if (y >= part.y1) continue;
      const cx = Math.max(part.x0, Math.min(p.x, part.x1)), cz = Math.max(part.z0, Math.min(p[key], part.z1)), dx = p.x - cx, dz = p[key] - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-9) continue; const l = Math.sqrt(d2); p.x = cx + dx / l * r; p[key] = cz + dz / l * r; hit = b;
    }
    return hit;
  }
  /** The first building along a ray in any made district: as City.ray(). */
  ray(from, dir, far = 300) { let best = null; for (const c of this.cities) { const h = c.ray(from, dir, far); if (h && (!best || h.dist < best.dist)) best = h; } return best; }
  /** A place to use, as City.spot(), in the district `in` (a name, or the one the player is in). */
  spot(kind = 'pavement', { in: name = null, ...o } = {}) { const d = name ? this.districts.find(x => x.name === name || x.style === name) : this.districtAt(this.focus.x, this.focus.z, MARGIN); const c = d?.city || this.cities[0]; return c ? c.spot(kind, o) : null; }
  /** Every district's buildings as boxes, for occlusion culling (as City.occluders()). */
  occluders(near = null, r = Infinity) {
    const out = [];
    for (const d of this.districts) for (const b of d.plan.buildings) {
      if (near && Math.hypot((b.x0 + b.x1) / 2 - near.x, (b.z0 + b.z1) / 2 - (near.z ?? near.y)) > r) continue;
      for (const p of b.parts) out.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, y0: p.y0, y1: p.y1 });
    }
    return out;
  }
  /** The building meshes of the made districts (for gs.camera's walls). */
  walls() { return this.cities.flatMap(c => c.walls()); }
  /**
   * Solid in a gs.physics3d World3D, as City.solid(): the ground everywhere, and each made district's buildings, kerbs,
   * furniture, parked cars and nearest traffic and people (a district made later is made solid as it is made, and its
   * bodies go when it is let go). Options as City.solid's.
   */
  solid(world, opts = {}) {
    this.world = world; this.solidOpts = opts;
    // the ground: a plane at 0 for a city with no water; with water (a river, a bay, a harbour, ponds), the ground itself (the
    // districts' streets, the land and the sea's bed) so whoever goes off a quay or down a beach is in the water (gs.climb Swimmer, gs.craft Boat)
    if (!this.wet) this.floorBody ||= world.floor?.(0);
    else if (!this.floorBody && world.ground) {
      const g = new Quads(), tile = (x0, z0, x1, z1, y) => { const n = Math.ceil((x1 - x0) / 400), k = Math.ceil((z1 - z0) / 400); for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) g.top(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * j / k, x0 + (x1 - x0) * (i + 1) / n, z0 + (z1 - z0) * (j + 1) / k, y); };
      for (const d of this.districts) { const r = d.rect, sd = d.plan.water?.side; tile(r.x0 - (sd === 'west' ? 2 : 40), r.z0 - (sd === 'north' ? 2 : 40), r.x1 + (sd === 'east' ? 2 : 40), r.z1 + (sd === 'south' ? 2 : 40), 0); }
      for (const s of this.ways.seas) tile(s.x0, s.z0, s.x1, s.z1, SEA_BED);
      this.floorBody = [world.ground(new Mesh(g.geometry()), { sound: 'stone' }), world.ground(this.ways.land.far, { sound: 'stone' })];
      if (this.ways.flat) this.floorBody.push(world.ground(this.ways.land.near, { sound: 'stone' }));
    }
    if (!this.ways.flat) this.waysBody ||= world.ground(this.ways.solids);   // (the hills, the roads' decks, parapets, piers and tunnels)
    for (const c of this.cities) c.solid(world, { ...opts, floor: false });
    return this;
  }
  /** A top-down map of every district and the roads between, as City.drawMap(). */
  drawMap(c, x, y, w, h, { at = this.focus || this.start, range = 150, turn = 0, colours = {} } = {}) {
    const col = { road: '#2a2d33', block: '#5a5c60', park: '#3f6a3a', building: '#8a8e96', water: '#1d3c52', land: '#46603c', highway: '#3a3f48', ...colours }, s = Math.min(w, h) / 2 / range;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = col.land; c.fillRect(x, y, w, h);
    c.translate(x + w / 2, y + h / 2); c.rotate(-turn); c.scale(s, s); c.translate(-at.x, -(at.z ?? at.y));
    const m = this.mapPicture(col); c.drawImage(m.cv, m.x0, m.z0, m.w, m.h);
    c.restore();
    this._map = { x, y, w, h, at, s, turn };
  }
  mapPicture(col) {
    const key = JSON.stringify(col); if (this._mapPic?.key === key) return this._mapPic;
    const U = grow(this.bounds, 400), k = Math.min(1.5, 3072 / Math.max(U.x1 - U.x0, U.z1 - U.z0));
    const cv = document.createElement('canvas'); cv.width = Math.ceil((U.x1 - U.x0) * k); cv.height = Math.ceil((U.z1 - U.z0) * k);
    const g = cv.getContext('2d'); g.fillStyle = col.land; g.fillRect(0, 0, cv.width, cv.height); g.scale(k, k); g.translate(-U.x0, -U.z0);
    g.fillStyle = col.water;
    if (this.waters) for (const w of this.waters) g.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);   // (the bay and the sea round the island)
    else for (const d of this.districts) if (d.harbour) g.fillRect(U.x0, d.rect.z1 + 10, U.x1 - U.x0, U.z1 - d.rect.z1);
    const R = this.ways.river;
    if (R) { g.fillStyle = col.water; for (let u = R.from; u < R.to; u += 6) { const c = this.ways.riverC(u); if (R.axis === 'z') g.fillRect(c - 16, u, 32, 7); else g.fillRect(u, c - 16, 7, 32); } }
    for (const d of this.districts) { const r = grow(d.rect, 0); g.fillStyle = col.road; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.ways.roads) {
      const line = () => { g.beginPath(); r.points.forEach(([px, pz], i) => i ? g.lineTo(px, pz) : g.moveTo(px, pz)); g.stroke(); };
      if (r.ring) { g.strokeStyle = col.edge || '#1a1c20'; g.lineWidth = r.width + 6; line(); }   // (the highway a little bolder)
      g.strokeStyle = r.ring ? col.highway || '#3a3f48' : col.road; g.lineWidth = r.width; line();
    }
    for (const d of this.districts) {
      for (const b of d.plan.blocks) { g.fillStyle = b.kind === 'park' || b.pond ? col.park : col.block; g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); if (b.pond) { g.fillStyle = col.water; g.fillRect(b.pond.x0, b.pond.z0, b.pond.x1 - b.pond.x0, b.pond.z1 - b.pond.z0); } }
      g.fillStyle = col.building; for (const b of d.plan.buildings) g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    }
    return this._mapPic = { key, cv, x0: U.x0, z0: U.z0, w: cv.width / k, h: cv.height / k };
  }
  /** Where a point lands on the last drawMap(): [x, y]. */
  mapPoint(p) {
    const m = this._map; if (!m) return [0, 0];
    const dx = (p.x - m.at.x) * m.s, dz = ((p.z ?? p.y) - (m.at.z ?? m.at.y)) * m.s, cs = Math.cos(-m.turn), sn = Math.sin(-m.turn);
    return [m.x + m.w / 2 + dx * cs - dz * sn, m.y + m.h / 2 + dx * sn + dz * cs];
  }
  /** Takes the whole city out of the scene and frees it. */
  dispose() {
    for (const d of this.districts) { if (d.city) d.city.dispose(); d.city = null; d.making = null; d.stand.dispose(); }
    this.making = null; for (const b of [this.floorBody].flat()) b?.remove?.(); this.floorBody = null; this.water?.dispose(); this.sea?.dispose(); this.waysBody?.remove?.(); this.waysBody = null;
    this.ways.dispose();
    this.paint?.dispose(); this.crowd?.dispose(); this.far?.dispose(); this.group.removeFromParent();
    if (this.view.lamps) for (const l of this.view.lamps) l.intensity = 0;
  }
}
