// gs.city Metro's cars and people as one, as a City's are: metro.cars and metro.people answer what city.cars and
// city.people do (so gs.city Wanted, Gps, Interiors and a game work the same in one city or in a big city of districts).
//
// The cars of a big city are in three places: each made district's own traffic (a City's Traffic: they keep to its
// lanes), the cars on the roads between the districts and the highway (city-ways.js WayTraffic), and the big city's own
// cars that go anywhere: police cars and anything chasing or chased, which must cross from district to district, over
// the bridges and round the highway, and must not go with a district when it is let go behind the player. Those drive
// as a district's chasing cars do (city-drive.js chaseCar), along the big city's routes (Metro.route), at the height of
// the road they are on, and are seen by every district's traffic, which pulls over for their sirens and swerves round
// them; when one is let go (released, or a crash it drives away from) it joins the lanes of the district it is in, or
// drives on along the road it is on and goes once out of sight.
//
// A district's car that is told to chase (cars.chase) comes over to the big city's own; a car on the roads between that
// is crashed into (cars.crash, or hit hard by a body in the World3D) too, so it can slide, spin and be a wreck there.
// After metro.solid(world) the nearest of the cars between the districts and of the big city's own are bodies in the
// World3D that move with them (as each district's nearest are), so the player's car meets them.

import { City, Traffic, edgeEnds, lanePosOn, cityDriver, POLICE_PAINT, LANE } from './city.js';
import { CITY_CARS } from './city-cars.js';
import { chaseCar, looseCar, meet } from './city-drive.js';
import { vehicle } from './models/vehicles.js';
import { Path } from './paths.js';

const NONE = Object.freeze([]), WAY = Object.freeze({ id: 'way', speed: 18, lanes: 1, len: 0, width: 8 });   // (the "edge" of a car made on a road between districts: it has none)
const dist = (a, b) => Math.hypot(a.x - b.x, (a.z ?? a.y) - (b.z ?? b.y));
const byDist = p => (a, b) => dist(a, p) - dist(b, p);
// (no way along the roads: straight there)
const straight = (a, b) => ({ path: new Path([{ x: a.x, y: 0, z: a.z ?? a.y }, { x: b.x, y: 0, z: b.z ?? b.y }], { kind: 'line' }) });

/** Where x, z is on edge e of plan P: s along, k lanes across and m metres from the middle (as Traffic.across). */
export function acrossOn(P, e, x, z, out = {}) {
  const A = P.nodes[e.a], rx = x - A.x, rz = z - A.z, k = P.side === 'left' ? -1 : 1;
  out.s = rx * e.dx + rz * e.dz; out.m = (-rx * e.dz + rz * e.dx) * k; out.k = (out.m - .2) / LANE - .5; return out;
}

// the big city's own cars: a Traffic whose city is the whole big city (made when first wanted: city.js and this file load each other)
let Roam = null;
function roamClass() {
  return Roam ||= class RoamTraffic extends Traffic {
    constructor(metro, plans, { fleet = false, cap = 12 } = {}) {
      const styles = [...new Set(['saloon', 'hatch', ...metro.districts.flatMap(d => CITY_CARS[d.style] || CITY_CARS.downtown)])];
      const T = { cur: null };
      const city = {
        metro, seed: metro.seed * 17 + 5, group: metro.group, plan: { bounds: metro.bounds, side: metro.side, nodes: [], edges: [] },
        opts: { fleet, styles, style: metro.districts[0].style },
        get people() { return metro.people; }, get t() { return metro.t; }, get focus() { return metro.focus; }, get start() { return metro.start; }, get night() { return metro.night; },
        get bodies() { return metro.cars?.phys?.bodies || null; },
        ray: (from, dir, far) => metro.ray(from, dir, far),
        // (within one made district, its own route: it starts in the lane going the car's way)
        route: (a, b) => { const d = metro.districtAt(a.x, a.z ?? a.y, 0); return (d?.city && d === metro.districtAt(b.x, b.z ?? b.y, 0) ? d.city.route(a, b) : metro.route(a, b)) || straight(a, b); },
        road: (x, z, h) => metro.road(x, z, h),
        collide: (p, r, y) => metro.collide(p, r, y ?? (T.cur?.y || 0)),
        ground: (x, z) => metro.ground(x, z),
        event: e => metro.event(e), honk: c => metro.honk(c), signal: () => 'g', signalLeft: () => 0,
      };
      super(city, Math.max(0, cap - 8)); this.max = 0; this.plans = plans; this.cur = T;
      this.LANE = LANE;
    }
    planOf(e) { return e ? this.plans.get(e) || null : null; }
    ends(e) { const P = this.planOf(e); return P ? edgeEnds(P, e) : [0, e?.len || 0]; }
    lanePos(e, k, s, out = {}) { const P = this.planOf(e); return P ? lanePosOn(P, e, k, s, out) : out; }
    across(e, x, z, out = {}) { const P = this.planOf(e); if (P) return acrossOn(P, e, x, z, out); out.s = out.m = out.k = 0; return out; }
    back(e) { const P = this.planOf(e); if (!P) return null; if (e.back === undefined) e.back = P.edges.find(f => f.a === e.b && f.b === e.a) || null; return e.back; }
    place(c) { if (c.mode === 'lane' && !c.turn && this.planOf(c.edge)) super.place(c); }
    spawn() { return null; }
    reset() { for (const c of [...this.list]) this.remove(c); }
    /** A car of the big city's own: at x, z (y, heading: as the road there has them) or on a district's edge, lane, s. */
    add(o = {}) {
      if (this.list.length >= this.cap) return null;
      const m = this.city.metro; let e = o.edge || null, k = o.lane ?? 0, s = o.s, at = null;
      if (!e) {
        const x = o.x, z = o.z ?? o.y, r = m.road(x, z, o.heading ?? null);
        at = { x, z, y: o.y ?? (r && r.d < 6 ? r.y : null) ?? m.carY(x, z, 0), heading: o.heading ?? r?.heading ?? 0 };
        e = r?.edge || null; k = r?.lane ?? 0; s = r?.s ?? 0;
      }
      const F = this.fleet, style = F ? o.style ?? Math.max(0, F.styles.indexOf(o.police ? 'saloon' : 'hatch')) : 0;
      const c = this.made(e || WAY, k, s ?? this.ends(e)[0] + 2, null, { ...o, style, colour: o.colour ?? (o.police ? POLICE_PAINT : undefined) });
      if (at) Object.assign(c, at);
      if (o.police) { c.vmax = 30; this.lightBars(); }
      if (F && !F.slotFor(c)) return null;
      this.list.push(c); return c;
    }
    // (cars of the big city's own drive off the lanes only: a district's lanes are its own traffic's)
    update(dt, focus, t = 0) {
      const m = this.city.metro; let noisy = 0;
      // what they steer round besides each other: the cars of the districts and of the roads between (city-drive.js chaseCar)
      const O = this.others ||= []; O.length = 0; for (const c of m.cities) for (const x of c.cars.list) O.push(x); for (const x of m.cars.ways) O.push(x);
      for (let i = this.list.length - 1; i >= 0; i--) {
        const c = this.list[i]; if (!c) continue;
        if (c.stun > 0) c.stun -= dt;
        this.cur.cur = c;
        if (c.mode === 'loose') { looseCar(this, c, dt); if (!c.body && c.mode === 'loose') c.y = m.carY(c.x, c.z, c.y || 0); }
        else if (c.mode === 'wreck') { c.v = 0; c.braking = (t * 1.6 | 0) % 2 === 0; }
        else if (c.mode === 'chase') {
          chaseCar(this, c, dt); c.y = m.carY(c.x, c.z, c.y || 0); if (Math.abs(c.v) > 1) noisy += Math.abs(c.v);
          const C = c.chase; if (C?.leave && dist(c, C.target) < 14) this.join(c);   // (driving on out of the way: on again, or into a district's lanes)
        } else this.join(c);
        if (!this.list.includes(c)) continue;
        if (!c.keep && dist(c, focus) > 240 && !(c.mode === 'chase' && c.siren)) this.remove(c);   // (out of sight: gone)
      }
      this.cur.cur = null;
      meet(this, dt);
      this.noise = noisy;
    }
    // back to the roads: into the lanes of the district it is in, else on along the road it is on (and gone once far off)
    join(c) {
      const m = this.city.metro, d = m.districtAt(c.x, c.z, 0), T = d?.city?.cars;
      if (T && m.cars.move(c, this, T)) { T.join(c); return; }
      c.siren = false;
      const r = m.road(c.x, c.z, c.heading), go = { x: c.x + Math.sin(c.heading) * 90, z: c.z + Math.cos(c.heading) * 90 };
      if (r?.road) { const R = r.road, s = r.back ? r.s - 90 : r.s + 90, p = m.lanePos(R, r.lane, r.back ? R.len - Math.max(1, Math.min(R.len - 1, s)) : Math.max(1, Math.min(R.len - 1, s)), r.back); go.x = p.x; go.z = p.z; }
      c.mode = 'chase'; c.keep = false; c.chase = { target: go, how: 'go', top: 15, keep: 7, t: 0, leave: true };
    }
  };
}

/** metro.cars: every car of the big city as one traffic (see the top). Kit use: Metro makes it. */
export class MetroCars {
  constructor(metro, { fleet = false, cap = 12 } = {}) {
    this.m = metro; this.sideK = metro.side === 'left' ? -1 : 1; this.LANE = LANE;
    this.plans = new WeakMap(); for (const d of metro.districts) this.learn(d.plan);
    const R = roamClass(); this.roam = new R(metro, this.plans, { fleet, cap });
    this._list = []; this._sirens = [];
  }
  get ways() { return this.m.ways?.traffic?.list || NONE; }
  /** Every car: each made district's, the big city's own, and those on the roads between (one list, filled anew each time: read it, don't keep it). */
  get list() {
    const out = this._list; out.length = 0;
    for (const c of this.m.cities) for (const x of c.cars.list) out.push(x);
    for (const x of this.roam.list) out.push(x);
    for (const x of this.ways) out.push(x);
    return out;
  }
  /** Whether car c is still one of the big city's (not taken, not removed). */
  has(c) { return !!c && (this.roam.list.includes(c) || this.ways.includes(c) || this.m.cities.some(x => x.cars.list.includes(c))); }
  /** The traffic a car is in: a district's Traffic, the big city's own, 'ways' (a road between districts), or null. */
  owner(c) {
    if (!c) return null; if (c.way) return this.ways.includes(c) ? 'ways' : null;
    if (this.roam.list.includes(c)) return this.roam;
    for (const x of this.m.cities) if (x.cars.list.includes(c)) return x.cars;
    return null;
  }
  /** Knows a plan's road edges (each district's plan, and its City's own once made). */
  learn(P) { for (const e of P.edges) this.plans.set(e, P); return this; }
  /** Which district plan a road edge is of (edges of different districts share their numbers). */
  planOf(e) { return this.plans.get(e) || null; }
  get stats() { const s = { laneChanges: 0, swerves: 0, overtakes: 0, yields: this.m.ways?.traffic?.yields || 0, crashes: 0, wrecks: 0, dodges: 0 }; for (const T of [this.roam, ...this.m.cities.map(c => c.cars)]) for (const k in s) s[k] += T.stats[k] || 0; return s; }
  get fleet() { return this.roam.fleet; }

  /* ---------- the lanes of the districts' roads, whichever district (as a Traffic's) ---------- */
  ends(e) { return this.roam.ends(e); }
  lanePos(e, k, s, out = {}) { return this.roam.lanePos(e, k, s, out); }
  across(e, x, z, out = {}) { return this.roam.across(e, x, z, out); }
  back(e) { return this.roam.back(e); }

  /* ---------- cars ---------- */
  /** Police cars' light bars (made now: Wanted does, so their shaders are built before play). */
  lightBars() { return this.roam.lightBars(); }
  /**
   * A car of the game's own, as city.cars.add(): police (a light bar) or keep (never sent elsewhere) cars are the big
   * city's own, which drive anywhere and stay when a district is let go; others join the traffic of the district at x, z
   * (or the edge's). x, z can be on a road between districts (y, heading: the road's there).
   */
  add(o = {}) {
    if (o.police || o.keep) return this.roam.add(o);
    const P = o.edge ? this.planOf(o.edge) : null, d = P ? this.m.districts.find(x => x.plan === P) : this.m.districtAt(o.x, o.z ?? o.y, 0);
    return d?.city ? d.city.cars.add(o) : this.roam.add(o);
  }
  remove(c) { const T = this.owner(c); if (T === 'ways') this.m.ways.traffic.takeOut(c, this.m.focus); else T?.remove(c); return this; }
  release(c) { const T = this.owner(c); if (T && T !== 'ways') T.release(c); return c; }
  /** As city.cars.chase(): the car comes over to the big city's own first, so it can follow its target anywhere. */
  chase(c, target, o = {}) { const k = this.adopt(c); if (!k) return c; return this.roam.chase(k, target, o); }
  /** As city.cars.crash(): a car on a road between districts comes over to the big city's own to slide and spin. */
  crash(c, push, o = {}) {
    const T = this.owner(c);
    if (T === 'ways') { const k = this.fromWay(c); return k ? this.roam.crash(k, push, o) : c; }
    return T ? T.crash(c, push, o) : c;
  }
  bump(c, seconds) { const T = this.owner(c); if (T === 'ways') c.v = 0; else T?.bump(c, seconds); return c; }
  /** As city.cars.near(): o.parked for the parked cars of the districts too; o.police false leaves out the police. */
  near(p, r, o = {}) {
    const out = [], pz = p.z ?? p.y;
    for (const c of this.m.cities) for (const x of c.cars.near(p, r, o)) out.push(x);
    if (o.moving !== false) {
      for (const x of this.roam.list) if ((o.police !== false || !x.police) && Math.hypot(x.x - p.x, x.z - pz) <= r) out.push(x);
      for (const x of this.ways) if (Math.hypot(x.x - p.x, x.z - pz) <= r && (p.y == null || p.z == null || Math.abs(x.y - p.y) < 3)) out.push(x);
    }
    return out.sort(byDist({ x: p.x, z: pz }));
  }
  overlaps(c, x, z, r = .5) { return Traffic.prototype.overlaps.call(this, c, x, z, r); }
  hit(p, r = .5) {
    for (const c of this.m.cities) { const h = c.cars.hit(p, r); if (h) return h; }
    const h = this.roam.hit(p, r); if (h) return h;
    const pz = p.z ?? p.y; for (const c of this.ways) if (Math.abs(c.x - p.x) + Math.abs(c.z - pz) < 8 && this.overlaps(c, p.x, pz, r) && (p.y == null || p.z == null || Math.abs(c.y - p.y) < 3)) return c;
    return null;
  }
  /**
   * As city.cars.take(): any car of near() (in a district's traffic, the big city's own, on a road between districts, parked
   * along a district's kerb, a police car) as a gs.models vehicle where it was, the game's from then on; a 'carjack' event.
   */
  take(c, o = {}) {
    if (c?.parked) { for (const x of this.m.cities) if (x.parked.includes(c)) return x.unpark(c, o); return null; }
    const T = this.owner(c); if (!T) return null;
    if (T !== 'ways') return T.take(c, o);
    const W = this.m.ways.traffic, car = W.fleet ? W.fleet.real(c) : vehicle('car', { style: 'saloon', colour: '#' + c.colour.getHexString() });
    car.position.set(c.x, c.y, c.z); car.rotation.y = c.heading + Math.PI; this.m.group.add(car); car.updateMatrixWorld(true);
    if (o.driver !== false && car.putIn) { const who = cityDriver(c.id); this.m.group.add(who); car.putIn(who, 'driver'); }
    const at = { x: c.x, z: c.z }; this.m.event({ kind: 'carjack', at, car: c, vehicle: car, by: o.by ?? null, police: false, parked: false });
    W.takeOut(c, this.m.focus);
    return car;
  }

  /* ---------- moving cars between the traffics ---------- */
  /** A car into the big city's own (from a district's traffic, or a new one in place of one on the roads between); returns it, or null when there is no room. */
  adopt(c) {
    const T = this.owner(c); if (T === this.roam) return c; if (!T) return null;
    if (T === 'ways') return this.fromWay(c);
    return this.move(c, T, this.roam) ? c : null;
  }
  /** Moves car c from traffic `from` to traffic `to` (its look kept: the same style by name), or false when `to` has no room. */
  move(c, from, to) {
    if (to.list.length >= to.cap) return false;
    const name = from.fleet ? from.fleet.styles[c.style] : c.kind === 'van' ? 'van' : 'saloon', was = { style: c.style, slot: c.slot };
    let st = to.fleet ? to.fleet.styles.indexOf(name) : 0; if (st < 0) st = Math.max(0, to.fleet.styles.indexOf('saloon'));
    c.style = st;
    if (to.fleet && !to.fleet.slotFor(c)) { c.style = was.style; c.slot = was.slot; return false; }
    const now = { style: c.style, slot: c.slot }; c.style = was.style; c.slot = was.slot; from.fleet?.freeSlot(c); c.style = now.style; c.slot = now.slot;
    const i = from.list.indexOf(c); if (i >= 0) from.list.splice(i, 1);
    for (const o of from.list) if (o.ahead === c) o.ahead = null;
    if (c.body) { from.loose--; to.loose++; }
    c.ahead = null; c.kind = to.fleet ? (to.fleet.kits[c.style].style === 'van' ? 'van' : 'car') : c.kind;
    to.list.push(c); return true;
  }
  /** A car on a road between districts made one of the big city's own, there and going as it was (it comes back elsewhere as a new car). */
  fromWay(w) {
    const W = this.m.ways.traffic, name = W.fleet ? W.fleet.styles[w.style] : 'saloon', F = this.roam.fleet;
    const c = this.roam.add({ x: w.x, z: w.z, y: w.y, heading: w.heading, style: F ? Math.max(0, F.styles.indexOf(name)) : undefined, colour: '#' + w.colour.getHexString() });
    if (!c) return null;
    c.v = w.v; c.vx = Math.sin(w.heading) * w.v; c.vz = Math.cos(w.heading) * w.v; c.mode = 'chase'; c.chase = { target: { x: w.x + Math.sin(w.heading) * 60, z: w.z + Math.cos(w.heading) * 60 }, how: 'go', top: w.v, keep: 7, t: 0, leave: true };
    W.takeOut(w, this.m.focus);
    return c;
  }

  /* ---------- each frame ---------- */
  update(dt, f, t) {
    const R = this.roam, m = this.m;
    R.update(dt, f, t);
    for (const c of m.cities) meet(R, dt, c.cars);
    // the cars between the districts brake for those of the big city's own in their way, and pull over for their sirens
    const S = this._sirens; S.length = 0;
    for (const c of R.list) {
      if (c.siren) S.push(c);
      if (c.mode !== 'lane') { const h = c.hz ||= { x: 0, z: 0, r: 1, car: c }; h.x = c.x; h.z = c.z; h.y = c.y || 0; h.r = 1.2; (m._avoid ||= []).push(h); }
    }
    if (this.phys) this.sync();
    R.draw(m.night, dt);
    return this;
  }
  /** The sirens on the big city's own cars now (for the cars on the roads between). */
  get sirens() { return this._sirens; }

  /* ---------- solid in a World3D ---------- */
  // the nearest cars between the districts and of the big city's own, as moving boxes (each district does its own: City.solid)
  solid(world, { cars = 8, within = 70 } = {}) {
    if (this.phys?.bodies.world === world) return this;
    this.unsolid();
    const me = this, P = this.phys = {
      focus: null, cars: { list: [], crash: (c, push, o) => me.crash(c, push, o), bump: (c, s) => me.bump(c, s) }, people: { list: [], knock() {} },
      bodies: { world, within, cars: [], people: [], ncars: cars, npeople: 0 }, ground: () => 0, event: e => me.m.event(e),
    };
    world.onHit(this._onHit = (a, b, speed) => City.prototype.solidHit.call(P, a, b, speed));
    return this;
  }
  sync() {
    const P = this.phys, L = P.cars.list; L.length = 0; P.focus = this.m.focus;
    for (const c of this.roam.list) L.push(c);
    for (const c of this.ways) L.push(c);
    City.prototype.solidSync.call(P);
  }
  unsolid() {
    const P = this.phys; if (!P) return this;
    const hits = P.bodies.world.hits, h = hits ? hits.indexOf(this._onHit) : -1; if (h >= 0) hits.splice(h, 1);
    for (const b of P.bodies.cars) b.remove?.(); this.phys = null; return this;
  }
  dispose() { this.unsolid(); this.roam.reset(); this.roam.fleet?.dispose(); }
}

/** metro.people: the people of every made district as one (as a City's). Kit use: Metro makes it. */
export class MetroPeople {
  constructor(metro) { this.m = metro; this._list = []; }
  /** Every made district's people (one list, filled anew each time: read it, don't keep it). */
  get list() { const out = this._list; out.length = 0; for (const c of this.m.cities) for (const q of c.people.list) out.push(q); return out; }
  /** The crowd the districts share (their drivers at the wheel come from it too). */
  get crowd() { return this.m.crowd; }
  owner(q) { for (const c of this.m.cities) if (c.people.list.includes(q)) return c.people; return null; }
  hit(p, r) { for (const c of this.m.cities) { const h = c.people.hit(p, r); if (h) return h; } return null; }
  near(p, r) { const out = []; for (const c of this.m.cities) for (const q of c.people.near(p, r)) out.push(q); return out.sort(byDist({ x: p.x, z: p.z ?? p.y })); }
  scare(p, r, t) { for (const c of this.m.cities) c.people.scare(p, r, t); return this; }
  cower(p, r) { for (const c of this.m.cities) c.people.cower(p, r); return this; }
  knock(q, dx, dz, t, o) { this.owner(q)?.knock(q, dx, dz, t, o); return q; }
  /** Who can see a point, in every made district, nearest first. */
  witness(at, r = 30) { const out = []; for (const c of this.m.cities) for (const q of c.people.witness(at, r)) out.push(q); return out.sort(byDist({ x: at.x, z: at.z ?? at.y })); }
  report(q, at, about = null) { return this.owner(q)?.report(q, at, about) ?? q; }
  /** The driver gets out of a car (in the district it is in) and calls it in; null between districts. */
  fromCar(car) { const d = this.m.districtAt(car.x, car.z, 0); return d?.city ? d.city.people.fromCar(car) : null; }
  join(x, z) { const d = this.m.districtAt(x, z, 0); return d?.city ? d.city.people.join(x, z) : null; }
  promote(q) { return this.owner(q)?.promote(q) ?? null; }
  demote(q) { this.owner(q)?.demote(q); return this; }
}
