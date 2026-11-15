// gs.town: towns that live. A world clock with days, dawn and dusk, waiting and sleeping; a village or a castle
// town laid out from a seed (roads that bend, a square, plots along the roads, an inn, a smithy, shops, homes, walls
// and gates); townsfolk with daily routines by that clock (they sleep at home, work, eat, drink at the inn, chat on the
// square and walk the roads between); shops that open and close, buy and sell; and monsters that come out at night.
// All of it plain data and rules, for a 2D or a 3D game: gs.city.Town builds the plan in a Next Gen view, and the
// game draws the folk (a gs.props.Crowd is driven by itself), the shop and the monsters as it likes.
//
//   const { Clock, plan, Folk, Shop, Night } = gs.town;
//   make() { clock = new Clock({ hour: 8, speed: 1 / 30 }); town = plan({ seed: 7, kind: 'castle', houses: 16 });
//            folk = new Folk(town, { clock }); night = new Night(town, { clock }); }
//   update(dt) { clock.update(dt); folk.update(dt); night.update(dt, hero); }
//   tapBed() { const r = folk.rest('dawn', hero); if (!r.ok) say(r.why); }      // sleep till dawn: refused with monsters near
//
// Kits find each other (links.js): a Clock drives the Sky the game made (sky.time follows the clock), and Folk, a
// Shop and Night find the Clock; Folk find the Night (people go home when monsters are about). Reputation is the
// rpg kit's (gs.rpg.Reputation): pass rep.price to a Shop's price and read rep.mood() for how folk meet the hero.

import { rng } from './math.js';
import { linksFor, linked } from './links.js';

const TAU = Math.PI * 2;
const wrap24 = h => ((h % 24) + 24) % 24;
/** Is hour h in [a, b) of a day, wrapping midnight (between(22, 6) is the night)? */
export const between = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);

/* ---------- the world clock ---------- */

/**
 * The world's time of day. hour (0..24, 8), day (1), speed: game hours a real second (1/30: a day in 12 minutes), dawn
 * (6) and dusk (20), sky (a gs.sky.Sky to drive; by default the Sky the game made: its time follows the clock), link.
 * update(dt) each frame. Read hour, day, time (hours since day 1 began), night (true between dusk and dawn), dark (0..1,
 * eased over an hour at dawn and dusk), part ('night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening').
 * wait(hours, { over }) passes time quickly (over: real seconds, 2.5; 0 at once): a promise, with waiting true while it
 * runs; sleep(hour) waits until the next time it is that hour ('dawn' and 'dusk' work). every(hour, fn) calls fn(day)
 * each day the clock passes that hour (also while waiting); it returns a function that stops it. pack() / unpack(d).
 */
export class Clock {
  constructor({ hour = 8, day = 1, speed = 1 / 30, dawn = 6, dusk = 20, sky, link } = {}) {
    this.time = (day - 1) * 24 + wrap24(hour); this.speed = speed; this.dawn = dawn; this.dusk = dusk;
    this.sky = sky; this.waiting = false; this.jumped = 0; this.events = []; this.skip = null;
    this.links = linksFor(null, link); this.links?.join('clock', this);
    this.drive();
  }
  get hour() { return wrap24(this.time); }
  set hour(h) { this.set(h); }
  get day() { return Math.floor(this.time / 24) + 1; }
  /** Sets the time of day (same day), or { hour, day }: nothing every() was waiting for fires. */
  set(h, day = this.day) { this.time = (day - 1) * 24 + wrap24(h); this.last = this.time; this.drive(); return this; }
  get night() { return !between(this.hour, this.dawn, this.dusk); }
  get dark() {
    const h = this.hour, up = Math.min(1, Math.max(0, h - this.dawn + .5)), down = Math.min(1, Math.max(0, h - this.dusk + .5));
    return between(h, this.dawn - .5, this.dusk - .5) ? 1 - up : between(h, this.dusk - .5, this.dusk + .5) ? down : 1;
  }
  get part() {
    const h = this.hour;
    return this.night ? 'night' : h < this.dawn + 1 ? 'dawn' : h < 11 ? 'morning' : h < 14 ? 'noon' : h < this.dusk - 2 ? 'afternoon' : 'evening';
  }
  /** Hours from now until the clock next shows hour h ('dawn' | 'dusk' | a number). */
  until(h) { const t = h === 'dawn' ? this.dawn : h === 'dusk' ? this.dusk : h; const d = wrap24(t - this.hour); return d < 1e-6 ? 24 : d; }
  /** Passes hours quickly: over real seconds (0: at once). A promise that settles when the time has passed. */
  wait(hours, { over = 2.5 } = {}) {
    if (!(hours > 0)) return Promise.resolve(this);
    this.skip?.done(this);
    return new Promise(done => {
      this.skip = { left: hours, rate: over > 0 ? hours / over : Infinity, done };
      this.waiting = true;
      if (over <= 0) this.update(0);
    });
  }
  /** Waits until the next time the clock shows hour h ('dawn' by default). */
  sleep(h = 'dawn', o) { return this.wait(this.until(h), o); }
  /** Calls fn(day) each day as the clock passes hour h; returns a function that stops it. */
  every(h, fn) { const e = { h: h === 'dawn' ? this.dawn : h === 'dusk' ? this.dusk : h, fn }; this.events.push(e); return () => { this.events = this.events.filter(x => x !== e); }; }
  update(dt) {
    const t0 = this.time; this.last = t0;
    if (this.skip) {
      const s = this.skip, step = Math.min(s.left, s.rate * dt || (s.rate === Infinity ? s.left : 0));
      this.time += step; s.left -= step;
      if (s.left <= 1e-9) { this.skip = null; this.waiting = false; this.fire(t0, this.time); this.jumped = this.time - t0; this.drive(); s.done(this); return this; }
    } else this.time += dt * this.speed;
    this.jumped = this.time - t0;
    this.fire(t0, this.time); this.drive();
    return this;
  }
  fire(a, b) {
    if (!this.events.length || b <= a) return;
    for (const e of this.events) for (let d = Math.floor((a - e.h) / 24) + 1; d * 24 + e.h <= b; d++) if (d * 24 + e.h > a) e.fn(d + 1);
  }
  drive() {
    const sky = this.sky === false ? null : this.sky || this.links?.one('sky');
    if (sky) { sky.speed = 0; sky.time = this.hour; }
  }
  pack() { return { t: Math.round(this.time * 1000) / 1000 }; }
  unpack(d) { if (d && typeof d.t === 'number') { this.time = d.t; this.last = d.t; this.drive(); } return this; }
}

/* ---------- the town's layout ---------- */

const ROLES = {
  // role: style, floors, size [w, d] range, how many in a town of n houses
  inn: { style: 'timberframe', floors: 2, w: [10, 12], d: [7, 8] },
  smithy: { style: 'cottage', floors: 1, w: [7, 8], d: [6, 6.5] },
  store: { style: 'timberframe', floors: 2, w: [7, 8.5], d: [6, 7] },
  bakery: { style: 'cottage', floors: 1, w: [6.5, 8], d: [5.5, 6.5] },
  hall: { style: 'stone', floors: 2, w: [11, 13], d: [8, 9] },
  home: { style: 'cottage', floors: 1, w: [6, 8.5], d: [5, 6.5] },
  house: { style: 'timberframe', floors: 2, w: [6.5, 8.5], d: [5.5, 7] },
  keep: { style: 'keep', floors: 4, w: [13, 15], d: [12, 14] },
  barracks: { style: 'stone', floors: 2, w: [12, 14], d: [6.5, 7.5] },
};
const NAMES = ['Ada', 'Bram', 'Cora', 'Dunn', 'Elsa', 'Finn', 'Greta', 'Hob', 'Ilse', 'Jory', 'Kesta', 'Lom', 'Mira', 'Ned', 'Orla', 'Pip', 'Quill', 'Rosa', 'Sten', 'Tilda', 'Ulf', 'Vera', 'Wim', 'Yara', 'Zeb', 'Alder', 'Bess', 'Corin', 'Dag', 'Edda', 'Fen', 'Gil'];
const INN = ['The Crooked Lantern', 'The Sleeping Goose', 'The Copper Kettle', 'The Brass Hare', 'The Last Candle', 'The Mossy Stag', 'The Tin Crown', 'The Wandering Pike'];
const TOWN = ['Ashcombe', 'Brindle Ford', 'Copperwick', 'Dunmere', 'Eldham', 'Fallowmoor', 'Greywater', 'Hollin', 'Ivybridge', 'Kettlemere', 'Lowmarsh', 'Mossgate', 'Northfold', 'Oakhollow', 'Pebbleby', 'Rookstead'];

const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0; return Math.hypot(px - ax - t * dx, pz - az - t * dz); };
const corners = (b, m = 0) => { const c = Math.cos(b.turn), s = Math.sin(b.turn), hw = b.w / 2 + m, hd = b.d / 2 + m; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [b.x + x * c + z * s, b.z - x * s + z * c]); };
// two turned rectangles overlap (separating axes)
function overlap(a, b, m) {
  const A = corners(a, m), B = corners(b, 0);
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % 4], nx = z1 - z0, nz = x0 - x1;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, z] of B) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}
// how close a rectangle comes to a polyline (its corners, edge middles and centre)
function nearRoad(b, road) {
  const C = corners(b), pts = [...C, [b.x, b.z], ...C.map((p, i) => [(p[0] + C[(i + 1) % 4][0]) / 2, (p[1] + C[(i + 1) % 4][1]) / 2])];
  let d = Infinity;
  for (const [x, z] of pts) for (let i = 1; i < road.points.length; i++) { const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i]; d = Math.min(d, segDist(x, z, ax, az, bx, bz)); }
  for (let i = 1; i < road.points.length; i++) {   // and the road's own points inside the rectangle
    const [px, pz] = road.points[i], c = Math.cos(b.turn), s = Math.sin(b.turn), lx = (px - b.x) * c - (pz - b.z) * s, lz = (px - b.x) * s + (pz - b.z) * c;
    if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return 0;
  }
  return d;
}
// a road that wanders a little: from a point, heading h, length L, a point every step
function wander(r, x, z, h, L, bend = .18, step = 7) {
  const pts = [[x, z]]; let a = h;
  for (let s = step; s <= L + 1e-6; s += step) { a += (r() - .5) * bend; x += Math.sin(a) * step; z += Math.cos(a) * step; pts.push([x, z]); }
  return pts;
}

/**
 * A town's layout from a seed, as plain data. kind: 'village' (cottages round a green, open to the fields) or 'castle'
 * (a walled town with a keep at the top of the main street and gates where it leaves); houses (how many buildings, 14);
 * seed; name (one is made up). Gives { name, seed, kind, radius, roads: [{ kind: 'main' | 'lane', points: [[x, z]...],
 * width }], square: { x, z, r }, buildings: [{ id, role ('inn' | 'smithy' | 'store' | 'bakery' | 'hall' | 'home' |
 * 'house' | 'keep' | 'barracks'), style (a gs.models.building style), floors, x, z, turn (radians: its door faces
 * (sin turn, cos turn)), w, d, door: { x, z } (in the wall), front: { x, z } (on the road outside), name, beds }],
 * props: [{ kind (a gs.models.prop), x, z, turn, at? }], walls: [{ kind: 'wall' | 'tower' | 'gate', x, z, turn,
 * length? }] (castle), gates: [{ x, z, turn }], lights: [{ x, y, z }] (torches by doors), fields: [{ x, z, w, d, turn }]
 * (village), edge: [{ x, z }] (where the wild begins: night comes in from there), wander: [{ x, z }] (spots to stroll
 * to), nodes / links (the walking graph). route(plan, from, to) finds a way along it.
 */
export function plan({ seed = 1, kind = 'village', houses = 14, name } = {}) {
  const r = rng(seed * 7919 + 13), castle = kind === 'castle';
  const R = 24 + houses * 1.7, heading = r() * TAU, roads = [], buildings = [], props = [], walls = [], gates = [], lights = [], fields = [];
  const square = { x: 0, z: 0, r: castle ? 9 : 11 };
  // the main road through the square; in a castle town it runs from the gate up to the keep
  const back = castle ? R + 10 : R + 18, ahead = castle ? R * .7 : R + 18;
  const main = [...wander(r, 0, 0, heading + Math.PI, back, .1).reverse(), ...wander(r, 0, 0, heading, ahead, .1).slice(1)];
  roads.push({ kind: 'main', points: main, width: castle ? 5 : 4.2 });
  // lanes off the main road and the square, bending as they go
  const nl = 2 + Math.floor(houses / 8) + (r() < .5 ? 1 : 0), inside = (x, z) => Math.hypot(x, z) < R + (castle ? 1 : 14);
  for (let i = 0; i < nl; i++) {
    const along = (i % 2 ? 1 : -1) * (r() * .45 + .05), at = Math.min(main.length - 2, Math.max(1, Math.round((main.length - 1) * (.5 + along * .8)))), [x, z] = main[at];
    const h = heading + (r() < .5 ? -1 : 1) * (Math.PI / 2 + (r() - .5) * .9), len = R * (.55 + r() * .45);
    const pts = wander(r, x, z, h, len, .3, 6).filter((p, j) => j === 0 || inside(...p));
    if (pts.length > 2) roads.push({ kind: 'lane', points: pts, width: 3, from: at });
  }
  // plots along the roads, nearest the square first: each faces its road, kept off every road and every other plot
  const want = [];
  if (castle) want.push('keep', 'barracks');
  want.push('inn', 'smithy', 'store', 'hall', 'bakery'); while (want.length < houses) want.push(r() < .55 ? 'home' : 'house');
  const cand = [];
  for (const road of roads) for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(L / 3.5));
    for (let k = 0; k < n; k++) {
      const t = (k + .5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, dir = Math.atan2(bx - ax, bz - az);
      for (const side of [-1, 1]) cand.push({ x, z, dir, side, road, d: Math.hypot(x, z) + r() * 6 });
    }
  }
  cand.sort((a, b) => a.d - b.d);
  const free = (b, m = 1.4) => {
    if (Math.hypot(b.x - square.x, b.z - square.z) < square.r + Math.max(b.w, b.d) / 2 + 1) return false;
    for (const o of buildings) if (overlap(b, o, m)) return false;
    for (const rd of roads) if (nearRoad(b, rd) < rd.width / 2 + .8) return false;
    return true;
  };
  const place = (role, at) => {
    const S = ROLES[role], w = S.w[0] + r() * (S.w[1] - S.w[0]), d = S.d[0] + r() * (S.d[1] - S.d[0]);
    const off = at.road.width / 2 + 1.6 + d / 2, nx = Math.cos(at.dir) * at.side, nz = -Math.sin(at.dir) * at.side;   // (to the road's side)
    const b = { role, style: S.style, floors: S.floors, w, d, x: at.x + nx * off, z: at.z + nz * off, turn: Math.atan2(-nx, -nz) };
    return free(b) ? b : null;
  };
  // the keep: at the top of the main street, facing down it
  let next = 0;
  const finish = (b) => {
    b.id = buildings.length; const fx = Math.sin(b.turn), fz = Math.cos(b.turn);
    b.door = { x: b.x + fx * b.d / 2, z: b.z + fz * b.d / 2 }; b.front = { x: b.x + fx * (b.d / 2 + 1.4), z: b.z + fz * (b.d / 2 + 1.4) };
    b.beds = b.role === 'inn' ? 6 : b.role === 'barracks' ? 8 : b.role === 'keep' ? 4 : b.role === 'home' || b.role === 'house' ? 2 + (b.floors > 1 ? 1 : 0) : b.role === 'hall' ? 0 : 1;
    b.name = b.role === 'inn' ? INN[Math.floor(r() * INN.length)] : null;
    buildings.push(b);
    if (b.role !== 'home' || r() < .4) { const s = r() < .5 ? -1 : 1, rx = Math.cos(b.turn) * s, rz = -Math.sin(b.turn) * s; lights.push({ x: b.door.x + rx * 1.1 + fx * .05, y: 2.1, z: b.door.z + rz * 1.1 + fz * .05, turn: b.turn, building: b.id }); }
    return b;
  };
  if (castle) {
    const [kx, kz] = main[main.length - 1], S = ROLES.keep, w = S.w[1], d = S.d[1], turn = heading + Math.PI;
    finish({ role: 'keep', style: S.style, floors: S.floors, w, d, x: kx + Math.sin(heading) * (d / 2 + 2), z: kz + Math.cos(heading) * (d / 2 + 2), turn });
    want.shift();
  }
  for (const at of cand) {
    if (next >= want.length) break;
    const role = want[next], b = place(role, at);
    if (b) { finish(b); next++; }
  }
  // the square: a well, market stalls round it, a bench or two; the smithy's anvil and hay; the inn's sign
  props.push({ kind: 'well', x: square.x, z: square.z, turn: heading });
  const ns = 3 + Math.floor(houses / 10);
  for (let i = 0; i < ns; i++) {
    const a = heading + Math.PI / 2 + (i - (ns - 1) / 2) * .62 + (i >= ns / 2 ? Math.PI : 0), rr = square.r - 2.2;
    props.push({ kind: 'stall', x: square.x + Math.sin(a) * rr, z: square.z + Math.cos(a) * rr, turn: a + Math.PI, stall: i });
  }
  for (const b of buildings) {
    const fx = Math.sin(b.turn), fz = Math.cos(b.turn), sx = Math.cos(b.turn), sz = -Math.sin(b.turn);
    if (b.role === 'smithy') { props.push({ kind: 'anvil', x: b.front.x + sx * 2, z: b.front.z + sz * 2 - fz * .2, turn: b.turn, at: b.id }); props.push({ kind: 'hay', x: b.x - sx * (b.w / 2 + 1.2), z: b.z - sz * (b.w / 2 + 1.2), turn: b.turn + .3, at: b.id }); }
    if (b.role === 'inn') props.push({ kind: 'signboard', x: b.door.x + sx * 1.6, y: 3.3, z: b.door.z + sz * 1.6, turn: b.turn, at: b.id });
    if (b.role === 'store' || b.role === 'bakery') props.push({ kind: 'barrel', x: b.front.x - sx * 1.6 - fx * .6, z: b.front.z - sz * 1.6 - fz * .6, turn: 0, at: b.id });
  }
  // walls round a castle town: a ring of straight stretches with towers between, a gate where the main road leaves
  let radius = 0; for (const b of buildings) radius = Math.max(radius, Math.hypot(b.x, b.z) + Math.max(b.w, b.d) / 2);
  radius = Math.max(radius + (castle ? 7 : 4), R * .8);
  if (castle) {
    const n = 10, ring = []; for (let i = 0; i < n; i++) { const a = heading + Math.PI + (i + .5) / n * TAU; ring.push([Math.sin(a) * radius, Math.cos(a) * radius]); }
    // the gate: on the side the road leaves by (the side whose middle faces back down the road)
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n], mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az), turn = Math.atan2(mx, mz);
      walls.push({ kind: 'tower', x: ax, z: az, turn });
      if (i === n - 1) {   // (the side straight behind the square: heading + PI is the middle of side n - 1)
        const gw = 3.4 + 2.4 + 2 * 4.2, part = (L - gw) / 2;
        gates.push({ x: mx, z: mz, turn });
        walls.push({ kind: 'gate', x: mx, z: mz, turn, width: 3.4 });
        for (const s of [-1, 1]) { const t = (gw / 2 + part / 2) / L * s; walls.push({ kind: 'wall', x: mx + (bx - ax) * t, z: mz + (bz - az) * t, turn, length: part - .6 }); }
      } else walls.push({ kind: 'wall', x: mx, z: mz, turn, length: L - 3.6 });
    }
  } else {
    // the fields round a village, beyond its last houses
    for (let i = 0; i < 4; i++) {
      const a = heading + Math.PI / 4 + i * Math.PI / 2 + (r() - .5) * .3, rr = radius + 14;
      fields.push({ x: Math.sin(a) * rr, z: Math.cos(a) * rr, w: 18 + r() * 8, d: 14 + r() * 6, turn: a });
    }
  }
  // where the wild begins (night comes in from here), and spots to wander to
  const edge = []; for (let i = 0; i < 12; i++) { const a = heading + i / 12 * TAU; edge.push({ x: Math.sin(a) * (radius + (castle ? 16 : 24)), z: Math.cos(a) * (radius + (castle ? 16 : 24)) }); }
  const wanderAt = [];
  for (let i = 0; i < 8; i++) { const a = r() * TAU, rr = square.r * (.3 + r() * .5); wanderAt.push({ x: square.x + Math.sin(a) * rr, z: square.z + Math.cos(a) * rr }); }
  for (const rd of roads) wanderAt.push({ x: rd.points[Math.floor(rd.points.length * .6)][0], z: rd.points[Math.floor(rd.points.length * .6)][1] });
  const P = { name: name || TOWN[Math.floor(r() * TOWN.length)], seed, kind, heading, radius, roads, square, buildings, props, walls, gates, lights, fields, edge, wander: wanderAt };
  graph(P);
  return P;
}

// the walking graph: the roads' points, the square's ring, each building's front, the fields and the edge, joined
function graph(P) {
  const nodes = [], links = [], add = (x, z, tag) => (nodes.push({ x, z, tag }), links.push([]), nodes.length - 1);
  const join = (a, b) => { if (a === b) return; const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); links[a].push([b, d]); links[b].push([a, d]); };
  const nearest = (x, z, skip = -1) => { let best = -1, bd = Infinity; for (let i = 0; i < nodes.length; i++) { if (i === skip || nodes[i].tag === 'door') continue; const d = Math.hypot(nodes[i].x - x, nodes[i].z - z); if (d < bd) { bd = d; best = i; } } return best; };
  const roadIds = [];
  for (const rd of P.roads) { let prev = -1; roadIds.push(rd.points.map(([x, z]) => { const i = add(x, z, 'road'); if (prev >= 0) join(prev, i); prev = i; return i; })); }
  // lanes join the main road where they leave it
  P.roads.forEach((rd, k) => { if (k) join(roadIds[k][0], nearest(rd.points[0][0], rd.points[0][1], roadIds[k][0])); });
  // the square: a ring round its middle, joined to the roads that pass
  const ring = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ring.push(add(P.square.x + Math.sin(a) * P.square.r * .65, P.square.z + Math.cos(a) * P.square.r * .65, 'square')); }
  ring.forEach((i, k) => { join(i, ring[(k + 1) % 8]); join(i, nearest(nodes[i].x, nodes[i].z, i)); });
  for (const b of P.buildings) { b.node = add(b.front.x, b.front.z, 'front'); join(b.node, nearestRoad(nodes, b.front.x, b.front.z)); b.doorNode = add(b.door.x, b.door.z, 'door'); join(b.doorNode, b.node); }
  for (const w of P.wander) { w.node = add(w.x, w.z, 'wander'); join(w.node, nearestRoad(nodes, w.x, w.z)); }
  // the ends of the roads lead out to the edge and the fields
  for (const e of P.edge) { e.node = add(e.x, e.z, 'edge'); join(e.node, nearestRoad(nodes, e.x, e.z)); }
  for (const f of P.fields) { f.node = add(f.x, f.z, 'field'); join(f.node, nearestRoad(nodes, f.x, f.z)); }
  P.nodes = nodes; P.links = links;
}
const nearestRoad = (nodes, x, z) => { let best = -1, bd = Infinity; for (let i = 0; i < nodes.length; i++) { const t = nodes[i].tag; if (t !== 'road' && t !== 'square') continue; const d = Math.hypot(nodes[i].x - x, nodes[i].z - z); if (d < bd) { bd = d; best = i; } } return best; };

/** A way through the town from one spot to another ({ x, z }), along its roads: [{ x, z }...] starting at from, ending at to. */
export function route(P, from, to) {
  const N = P.nodes, L = P.links, a = nearestRoad(N, from.x, from.z), b = nearestRoad(N, to.x, to.z);
  if (a < 0 || b < 0) return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
  const g = new Float64Array(N.length).fill(Infinity), came = new Int32Array(N.length).fill(-1), open = [a], shut = new Uint8Array(N.length); g[a] = 0;
  const h = i => Math.hypot(N[i].x - N[b].x, N[i].z - N[b].z);
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (g[open[i]] + h(open[i]) < g[open[bi]] + h(open[bi])) bi = i;
    const c = open.splice(bi, 1)[0]; if (c === b) break; shut[c] = 1;
    for (const [n, d] of L[c]) { if (shut[n] || N[n].tag === 'door') continue; const t = g[c] + d; if (t < g[n]) { g[n] = t; came[n] = c; if (!open.includes(n)) open.push(n); } }
  }
  const path = []; for (let c = b; c >= 0; c = came[c]) { path.unshift({ x: N[c].x, z: N[c].z }); if (c === a) break; }
  if (came[b] < 0 && a !== b) return [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
  // (the first road point is skipped when it lies behind: the walk starts towards the next one)
  if (path.length > 1 && Math.hypot(path[1].x - from.x, path[1].z - from.z) < Math.hypot(path[1].x - path[0].x, path[1].z - path[0].z)) path.shift();
  return [{ x: from.x, z: from.z }, ...path, { x: to.x, z: to.z }];
}

/* ---------- townsfolk ---------- */

/** The day of each kind of townsperson: [{ from, to, at, do }]. at: 'home' | 'work' | 'inn' | 'square' | 'wander' | 'field' | 'patrol' | 'gate' | a building id | { x, z }. */
export const ROUTINES = {
  smith: [{ from: 21.5, to: 5.5, at: 'home', do: 'sleep' }, { from: 5.5, to: 6.5, at: 'home', do: 'eat' }, { from: 6.5, to: 12, at: 'work', do: 'work' }, { from: 12, to: 13, at: 'inn', do: 'eat' }, { from: 13, to: 18, at: 'work', do: 'work' }, { from: 18, to: 21, at: 'inn', do: 'drink' }, { from: 21, to: 21.5, at: 'square', do: 'chat' }],
  keeper: [{ from: 22, to: 6.5, at: 'home', do: 'sleep' }, { from: 6.5, to: 7.5, at: 'home', do: 'eat' }, { from: 7.5, to: 18, at: 'work', do: 'work' }, { from: 18, to: 19.5, at: 'square', do: 'chat' }, { from: 19.5, to: 22, at: 'home', do: 'eat' }],
  baker: [{ from: 20, to: 4, at: 'home', do: 'sleep' }, { from: 4, to: 13, at: 'work', do: 'work' }, { from: 13, to: 15, at: 'square', do: 'work' }, { from: 15, to: 20, at: 'home', do: 'eat' }],
  innkeeper: [{ from: 1, to: 9, at: 'work', do: 'sleep' }, { from: 9, to: 1, at: 'work', do: 'work' }],
  farmer: [{ from: 21, to: 5, at: 'home', do: 'sleep' }, { from: 5, to: 6, at: 'home', do: 'eat' }, { from: 6, to: 12, at: 'field', do: 'work' }, { from: 12, to: 13, at: 'home', do: 'eat' }, { from: 13, to: 18, at: 'field', do: 'work' }, { from: 18, to: 21, at: 'inn', do: 'drink' }],
  guard: [{ from: 6, to: 14, at: 'patrol', do: 'patrol' }, { from: 14, to: 15, at: 'inn', do: 'eat' }, { from: 15, to: 18, at: 'gate', do: 'watch' }, { from: 18, to: 23, at: 'home', do: 'eat' }, { from: 23, to: 6, at: 'home', do: 'sleep' }],
  nightwatch: [{ from: 19, to: 6, at: 'patrol', do: 'patrol' }, { from: 6, to: 8, at: 'inn', do: 'eat' }, { from: 8, to: 19, at: 'home', do: 'sleep' }],
  elder: [{ from: 22, to: 7, at: 'home', do: 'sleep' }, { from: 7, to: 9, at: 'square', do: 'chat' }, { from: 9, to: 16, at: 'work', do: 'work' }, { from: 16, to: 19, at: 'wander', do: 'stroll' }, { from: 19, to: 22, at: 'inn', do: 'drink' }],
  idler: [{ from: 23, to: 8, at: 'home', do: 'sleep' }, { from: 8, to: 11, at: 'square', do: 'chat' }, { from: 11, to: 16, at: 'wander', do: 'stroll' }, { from: 16, to: 18, at: 'home', do: 'eat' }, { from: 18, to: 23, at: 'inn', do: 'drink' }],
};
const JOB_OF = { smithy: 'smith', store: 'keeper', bakery: 'baker', inn: 'innkeeper', hall: 'elder', keep: 'guard', barracks: 'guard' };
const pickSlot = (routine, h) => routine.find(s => between(h, s.from, s.to)) || routine[0];

/**
 * The people of a town plan, each living their day by the clock. count (one or two a home, 1 + homes * 1.6), clock (the
 * game's Clock, found by itself), seed, speed (walking metres a second, 1.3), crowd (a gs.props.Crowd: its members
 * are added and moved by themselves: walk while walking, idle otherwise, hidden while indoors; moves: { walk, idle,
 * sit, work } names of its moves; ground: (x, z) => the land's height under them), night (a Night: found by itself; with monsters about, everyone but the watch goes
 * home), routines (yours by job, as ROUTINES). people: [{ id, name, job, home, work (building ids), routine, x, z,
 * turn, moving, doing ('sleep' | 'eat' | 'work' | 'drink' | 'chat' | 'stroll' | 'patrol' | 'watch' | 'hide' | 'talk'),
 * inside (a building id or -1), slot, member (the Crowd's), data (yours) }]. update(dt) each frame (after the clock).
 * hold(person, seconds, face) stops one to talk (turned towards face: { x, z }); near(x, z, r), at(building), of(job);
 * settle() puts everyone where the clock says at once (done by itself after a wait). on('arrive' | 'slot', fn(person)).
 * rest(hours | 'dawn' | 'dusk', where) sleeps or waits: refused ({ ok: false, why: 'danger' }) with a monster within
 * 30 m of where, else { ok: true, done: promise }. pack() / unpack(d): who is held, nothing else (the clock is the rest).
 */
export class Folk {
  constructor(town, { count, clock, seed = 1, speed = 1.3, crowd = null, moves = {}, night, routines = {}, ground = null, link } = {}) {
    this.town = town; this.ground = ground; this.speed = speed; this.crowd = crowd; this.moves = { walk: 'walk', idle: 'idle', ...moves };
    this.routines = { ...ROUTINES, ...routines }; this.handlers = {};
    this.links = linksFor(null, link); this.givenClock = clock; this.givenNight = night;
    const r = rng(seed * 104729 + town.seed), B = town.buildings, homes = B.filter(b => b.role === 'home' || b.role === 'house');
    const n = count ?? Math.round(1 + homes.length * 1.6), people = [];
    // first a worker for every place of work, then the rest live at home and farm, stroll or keep watch
    const jobs = []; for (const b of B) if (JOB_OF[b.role]) jobs.push([JOB_OF[b.role], b.id]);
    if (town.kind === 'castle') jobs.push(['guard', B.find(b => b.role === 'barracks')?.id ?? -1], ['nightwatch', B.find(b => b.role === 'barracks')?.id ?? -1]);
    for (let i = 0; i < n; i++) {
      const [job, work] = jobs[i] || [town.kind === 'castle' ? (r() < .3 ? 'guard' : 'idler') : (r() < .55 ? 'farmer' : 'idler'), -1];
      const lives = job === 'innkeeper' ? work : job === 'guard' || job === 'nightwatch' ? (B.find(b => b.role === 'barracks')?.id ?? homes[i % Math.max(1, homes.length)]?.id ?? 0) : homes.length ? homes[i % homes.length].id : 0;
      const field = town.fields.length ? i % town.fields.length : -1;
      people.push({ id: i, name: NAMES[(i * 7 + (seed | 0)) % NAMES.length], job, home: lives, work, field, routine: this.routines[job], x: 0, z: 0, turn: 0, moving: false, doing: 'sleep', inside: -1, slot: null, path: null, step: 0, held: 0, face: null, spot: r(), member: null, data: {} });
    }
    this.people = people;
    if (crowd) for (const p of people) p.member = crowd.add({ x: 0, z: 0, kind: p.id % Math.max(1, crowd.kinds?.length || 1), move: this.moves.idle });
    this.settle();
  }
  get clock() { return linked(this.givenClock, this.links, 'clock'); }
  get night() { return linked(this.givenNight, this.links, 'night'); }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, p) { for (const f of this.handlers[ev] || []) f(p); }
  // where a slot of a person's day puts them: a spot, and whether that is indoors (a building id)
  place(p, s) {
    const T = this.town, B = T.buildings, at = s.at, k = p.spot, bld = id => { const b = B[id]; return b ? { x: b.x, z: b.z, inside: b.id, b } : null; };
    if (s.do === 'hide' || at === 'home') return bld(p.home) || { x: 0, z: 0, inside: -1 };
    if (typeof at === 'number') return bld(at) || { x: 0, z: 0, inside: -1 };
    if (at && typeof at === 'object') return { x: at.x, z: at.z, inside: -1 };
    if (at === 'inn') return bld(B.find(b => b.role === 'inn')?.id) || this.place(p, { at: 'square' });
    if (at === 'square') { const a = k * TAU, rr = T.square.r * (.35 + (k * 7.3 % 1) * .4); return { x: T.square.x + Math.sin(a) * rr, z: T.square.z + Math.cos(a) * rr, inside: -1 }; }
    if (at === 'field') { const f = T.fields[p.field]; return f ? { x: f.x + (k - .5) * f.w * .6, z: f.z + ((k * 3.7) % 1 - .5) * f.d * .6, inside: -1 } : this.place(p, { at: 'wander' }); }
    if (at === 'wander') { const w = T.wander[Math.floor((k * 13 + (this.clock?.day || 0)) % T.wander.length)]; return { x: w.x, z: w.z, inside: -1 }; }
    if (at === 'gate') { const g = T.gates[0]; if (!g) return this.place(p, { at: 'square' }); const fx = Math.sin(g.turn), fz = Math.cos(g.turn), s2 = k < .5 ? -1 : 1; return { x: g.x - fx * 4 + fz * 3 * s2, z: g.z - fz * 4 - fx * 3 * s2, inside: -1 }; }
    if (at === 'patrol') return this.patrolSpot(p);
    if (at === 'work') {
      const b = B[p.work]; if (!b) return this.place(p, { at: 'wander' });
      if (b.role === 'smithy') { const A = T.props.find(q => q.kind === 'anvil' && q.at === b.id); if (A) return { x: A.x - Math.sin(b.turn) * .9, z: A.z - Math.cos(b.turn) * .9, inside: -1, face: A }; }
      if (b.role === 'store' && s.do === 'work' && T.props.some(q => q.kind === 'stall')) { const st = T.props.filter(q => q.kind === 'stall')[p.id % T.props.filter(q => q.kind === 'stall').length]; return { x: st.x - Math.sin(st.turn) * 1.2, z: st.z - Math.cos(st.turn) * 1.2, inside: -1, face: { x: st.x + Math.sin(st.turn) * 3, z: st.z + Math.cos(st.turn) * 3 } }; }
      return bld(b.id);
    }
    return { x: p.x, z: p.z, inside: -1 };
  }
  // a guard's round: the square and the roads' ends, a spot a few minutes
  patrolSpot(p) {
    const T = this.town, pts = T.walls.length ? T.walls.filter(w => w.kind === 'tower').map(w => ({ x: w.x * .82, z: w.z * .82 })) : T.edge.map(e => ({ x: e.x * .7, z: e.z * .7 }));
    const h = this.clock?.time || 0, i = Math.floor(h * 4 + p.spot * pts.length) % pts.length;
    return { ...pts[i], inside: -1, patrol: i };
  }
  slotOf(p, h) {
    const N = this.night, scared = N && N.active && p.job !== 'nightwatch' && p.job !== 'guard';
    const s = pickSlot(p.routine, h);
    return scared && s.do !== 'sleep' ? { from: s.from, to: s.to, at: 'home', do: 'hide' } : s;
  }
  /** Everyone where the clock says, at once (after a wait or a load). */
  settle() {
    const h = this.clock?.hour ?? 12;
    for (const p of this.people) {
      const s = this.slotOf(p, h), at = this.place(p, s);
      p.slot = s; p.x = at.x; p.z = at.z; p.inside = at.inside ?? -1; p.doing = s.do; p.moving = false; p.path = null; p.target = at;
      if (at.face) p.turn = Math.atan2(at.face.x - p.x, at.face.z - p.z);
      this.draw(p, 0);
    }
    return this;
  }
  update(dt) {
    const C = this.clock; if (C && (C.waiting || C.jumped > .5)) { this.wasWaiting = true; return this.settle(); }
    if (this.wasWaiting) { this.wasWaiting = false; this.settle(); }
    const h = C?.hour ?? 12;
    for (const p of this.people) {
      if (p.held > 0) { p.held -= dt; p.doing = 'talk'; p.moving = false; if (p.face) p.turn = turnTo(p.turn, Math.atan2(p.face.x - p.x, p.face.z - p.z), dt * 5); this.draw(p, dt); if (p.held <= 0) { p.doing = p.slot.do; p.face = null; } continue; }
      const s = this.slotOf(p, h), changed = s.do !== p.slot?.do || s.at !== p.slot?.at || s.from !== p.slot?.from;
      const patrol = s.at === 'patrol' ? this.patrolSpot(p) : null;
      if (changed || (patrol && patrol.patrol !== p.target?.patrol)) {
        p.slot = s; const at = patrol || this.place(p, s); p.target = at;
        const from = p.inside >= 0 ? this.town.buildings[p.inside].front : p;
        if (p.inside >= 0 && at.inside === p.inside) { p.doing = s.do; this.emit('slot', p); continue; }
        if (p.inside >= 0) { p.x = from.x; p.z = from.z; p.inside = -1; }
        const end = at.inside >= 0 ? this.town.buildings[at.inside].front : at;
        p.path = route(this.town, p, end); p.step = 1; p.moving = true; p.doing = 'walk';
        this.emit('slot', p);
      }
      if (p.moving && p.path) {
        let go = this.speed * dt * (p.slot.do === 'hide' ? 1.8 : 1);
        while (go > 0 && p.step < p.path.length) {
          const q = p.path[p.step], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
          if (d <= go) { p.x = q.x; p.z = q.z; go -= d; p.step++; continue; }
          p.x += dx / d * go; p.z += dz / d * go; p.turn = turnTo(p.turn, Math.atan2(dx, dz), dt * 8); go = 0;
        }
        if (p.step >= p.path.length) {
          p.moving = false; p.path = null; const at = p.target;
          if (at.inside >= 0) { p.inside = at.inside; p.x = at.x; p.z = at.z; }
          if (at.face) p.turn = Math.atan2(at.face.x - p.x, at.face.z - p.z);
          p.doing = p.slot.do; this.emit('arrive', p);
        }
      }
      this.draw(p, dt);
    }
    return this;
  }
  draw(p, dt) {
    const m = p.member; if (!m) return;
    m.x = p.x; m.z = p.z; m.turn = p.turn; if (this.ground) m.y = this.ground(p.x, p.z); m.hide = p.inside >= 0;
    const mv = p.moving ? this.moves.walk : (p.doing === 'work' && this.moves.work) || ((p.doing === 'eat' || p.doing === 'drink') && this.moves.sit) || this.moves.idle;
    if (mv && m.move !== mv) m.move = mv;
  }
  /** Stops a person to talk for seconds, turned towards face ({ x, z }). */
  hold(p, seconds = 6, face = null) { p.held = seconds; p.face = face; p.moving = p.moving && false; return p; }
  near(x, z, r = 3) { return this.people.filter(p => p.inside < 0 && Math.hypot(p.x - x, p.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)); }
  at(building) { const id = typeof building === 'object' ? building.id : building; return this.people.filter(p => p.inside === id); }
  of(job) { return this.people.filter(p => p.job === job); }
  rest(hours = 'dawn', where = null) {
    const N = this.night, C = this.clock;
    if (!C) return { ok: false, why: 'no clock' };
    if (N && where && N.near(where.x, where.z, 30).length) return { ok: false, why: 'danger' };
    const h = typeof hours === 'number' ? hours : C.until(hours);
    return { ok: true, hours: h, done: C.wait(h) };
  }
  pack() { return { h: this.people.filter(p => p.held > 0).map(p => [p.id, Math.round(p.held)]) }; }
  unpack(d) { this.settle(); for (const [id, s] of d?.h || []) if (this.people[id]) this.people[id].held = s; return this; }
}
const turnTo = (a, b, k) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * Math.min(1, k); };

/* ---------- shops ---------- */

/**
 * A shop. stock: { id: { price, count, restock (how many it has again each morning: count) } }; hours: [open, close]
 * ([8, 18]; wraps midnight); clock (found by itself); keeper (a Folk person: shut while they are not at work, so a
 * shop shuts when its keeper hides from the night); money (what it can pay for what you sell, 300); buys (true: any
 * of the stock's ids; a list of ids; or a function (id) => base price for things it doesn't sell); sells: the share
 * of a price it pays when it buys (.5); price ((base, { id, selling }) => number: your own, such as rep.price).
 * open (now), priceOf(id, { selling }), buy(id, n, wallet, inventory) (wallet: { money }, changed; inventory: a
 * gs.items Inventory it goes into) and sell(id, n, wallet, inventory): { ok, cost or paid, why ('closed' | 'none' |
 * 'money' | 'full' | 'unwanted' | 'broke' | 'have') }. Restocks at the hour it opens each day. pack() / unpack(d).
 */
export class Shop {
  constructor({ name = 'Shop', stock = {}, hours = [8, 18], clock, keeper = null, money = 300, buys = true, sells = .5, price = null, link } = {}) {
    this.name = name; this.hours = hours; this.keeper = keeper; this.money = money; this.money0 = money; this.buys = buys; this.sells = sells; this.priceFn = price;
    this.stock = {}; for (const [id, s] of Object.entries(stock)) this.stock[id] = { price: s.price, count: s.count ?? 1, restock: s.restock ?? s.count ?? 1 };
    this.links = linksFor(null, link); this.givenClock = clock; this.day = null;
  }
  get clock() { return linked(this.givenClock, this.links, 'clock'); }
  get open() {
    const C = this.clock, h = C ? C.hour : 12;
    if (!between(h, this.hours[0], this.hours[1])) return false;
    const k = this.keeper; return !k || (k.doing === 'work' && !k.moving && k.held <= 0) || k.doing === 'talk';
  }
  base(id) { const s = this.stock[id]; if (s) return s.price; return typeof this.buys === 'function' ? this.buys(id) ?? null : null; }
  /** What one costs to buy here, or (selling: true) what the shop pays for one. */
  priceOf(id, { selling = false } = {}) {
    const b = this.base(id); if (b == null) return null;
    const p = this.priceFn ? this.priceFn(selling ? b * this.sells : b, { id, selling }) : selling ? b * this.sells : b;
    return Math.max(selling ? 0 : 1, Math.round(p));
  }
  restock() { for (const s of Object.values(this.stock)) s.count = Math.max(s.count, s.restock); this.money = Math.max(this.money, this.money0); return this; }
  tick() {
    const C = this.clock; if (!C) return;
    const d = C.time - this.hours[0] < 0 ? 0 : Math.floor((C.time - this.hours[0]) / 24);
    if (this.day == null) this.day = d; else if (d > this.day) { this.day = d; this.restock(); }
  }
  buy(id, n = 1, wallet = { money: Infinity }, inventory = null) {
    this.tick();
    if (!this.open) return { ok: false, why: 'closed' };
    const s = this.stock[id]; if (!s || s.count < n) return { ok: false, why: 'none' };
    const cost = this.priceOf(id) * n; if ((wallet.money ?? 0) < cost) return { ok: false, why: 'money', cost };
    if (inventory) { const over = inventory.add(id, n); if (over > 0) { inventory.take(id, n - over); return { ok: false, why: 'full', cost }; } }
    wallet.money -= cost; s.count -= n; this.money += cost;
    return { ok: true, cost };
  }
  sell(id, n = 1, wallet = { money: 0 }, inventory = null) {
    this.tick();
    if (!this.open) return { ok: false, why: 'closed' };
    if (!(this.buys === true ? id in this.stock : Array.isArray(this.buys) ? this.buys.includes(id) : typeof this.buys === 'function' ? this.base(id) != null : false)) return { ok: false, why: 'unwanted' };
    const paid = this.priceOf(id, { selling: true }) * n; if (this.money < paid) return { ok: false, why: 'broke', paid };
    if (inventory && !inventory.take(id, n)) return { ok: false, why: 'have' };
    wallet.money = (wallet.money ?? 0) + paid; this.money -= paid;
    (this.stock[id] ||= { price: this.base(id), count: 0, restock: 0 }).count += n;
    return { ok: true, paid };
  }
  pack() { return { m: this.money, d: this.day, s: Object.fromEntries(Object.entries(this.stock).map(([k, v]) => [k, v.count])) }; }
  unpack(d) { if (!d) return this; this.money = d.m ?? this.money; this.day = d.d ?? this.day; for (const [k, c] of Object.entries(d.s || {})) if (this.stock[k]) this.stock[k].count = c; else this.stock[k] = { price: this.base(k) ?? 1, count: c, restock: 0 }; return this; }
}

/* ---------- night monsters ---------- */

/**
 * Monsters that come in from the wild at night and go back at dawn. town: a plan; clock (found by itself); kinds
 * (['ghoul'], or [{ kind, weight, speed, sense }]); every (seconds between new ones, 8); max (most at once, 6); from /
 * to (the hours they come, the clock's dusk + 1 to its dawn); away (no closer than this to the hero to appear, 25 m);
 * light (metres round a torch or lit door that they won't step into, 3.5; false: they don't mind light); seed.
 * monsters: [{ id, kind, x, z, turn, state ('prowl' | 'hunt' | 'flee'), speed, sense, data (yours) }]. update(dt, hero
 * ({ x, z } or null)) moves them: they prowl the roads towards the square, hunt the hero inside sense metres and leave
 * at dawn (steer: false moves none: yours to move). active (true while any are about or it is their time), near(x, z,
 * r), kill(m), clear(). on('spawn' | 'gone', fn(m)). A game decides who is hurt.
 */
export class Night {
  constructor(town, { clock, kinds = ['ghoul'], every = 8, max = 6, from, to, away = 25, light = 3.5, seed = 1, steer = true, link } = {}) {
    this.town = town; this.kinds = kinds.map(k => typeof k === 'string' ? { kind: k, weight: 1 } : { weight: 1, ...k }); this.every = every; this.max = max;
    this.from = from; this.to = to; this.away = away; this.light = light; this.steer = steer; this.r = rng(seed * 31 + town.seed);
    this.monsters = []; this.wait = every * .5; this.n = 0; this.handlers = {};
    this.links = linksFor(null, link); this.links?.join('night', this); this.givenClock = clock;
  }
  get clock() { return linked(this.givenClock, this.links, 'clock'); }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, m) { for (const f of this.handlers[ev] || []) f(m); }
  get time() { const C = this.clock; if (!C) return false; return between(C.hour, this.from ?? C.dusk + 1, this.to ?? C.dawn); }
  get active() { return this.time || this.monsters.length > 0; }
  lit(x, z) { if (this.light === false) return false; for (const L of this.town.lights) if (Math.hypot(L.x - x, L.z - z) < this.light) return true; return false; }
  near(x, z, r = 10) { return this.monsters.filter(m => m.state !== 'flee' && Math.hypot(m.x - x, m.z - z) <= r); }
  kill(m) { const i = this.monsters.indexOf(m); if (i >= 0) { this.monsters.splice(i, 1); this.emit('gone', m); } return this; }
  clear() { this.monsters.length = 0; this.wait = this.every * .5; return this; }
  update(dt, hero = null) {
    const C = this.clock; if (!C) return this;
    if (C.waiting || C.jumped > .5) {   // time passed while the hero slept: what came in the night has gone again, or is about now
      if (!this.time) for (const m of [...this.monsters]) this.kill(m);
      return this;
    }
    if (this.time && this.monsters.length < this.max) {
      this.wait -= dt;
      if (this.wait <= 0) { this.wait = this.every * (.7 + this.r() * .6); this.spawn(hero); }
    }
    if (!this.steer) return this;
    for (const m of [...this.monsters]) {
      if (!this.time && m.state !== 'flee') { m.state = 'flee'; const e = nearestOf(this.town.edge, m); m.path = route(this.town, m, e); m.step = 1; }
      if (m.state !== 'flee' && hero && Math.hypot(hero.x - m.x, hero.z - m.z) < m.sense) { m.state = 'hunt'; m.path = null; }
      else if (m.state === 'hunt') { m.state = 'prowl'; m.path = null; }
      let tx, tz;
      if (m.state === 'hunt') { tx = hero.x; tz = hero.z; }
      else {
        if (!m.path || m.step >= m.path.length) {
          if (m.state === 'flee') { this.kill(m); continue; }
          const goal = this.r() < .5 ? this.town.square : this.town.wander[Math.floor(this.r() * this.town.wander.length)];
          m.path = route(this.town, m, goal); m.step = 1;
        }
        const q = m.path[m.step]; tx = q.x; tz = q.z;
        if (Math.hypot(tx - m.x, tz - m.z) < .6) { m.step++; continue; }
      }
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz); if (d < 1e-6) continue;
      const v = m.speed * (m.state === 'hunt' ? 1.35 : m.state === 'flee' ? 1.5 : 1) * dt, nx = m.x + dx / d * Math.min(v, d), nz = m.z + dz / d * Math.min(v, d);
      if (m.state !== 'flee' && this.lit(nx, nz) && !this.lit(m.x, m.z)) { m.turn = turnTo(m.turn, Math.atan2(-dx, -dz), dt * 3); m.path = null; continue; }   // (a torch keeps them off)
      m.x = nx; m.z = nz; m.turn = turnTo(m.turn, Math.atan2(dx, dz), dt * 6);
    }
    return this;
  }
  spawn(hero = null) {
    const E = this.town.edge.filter(e => !hero || Math.hypot(e.x - hero.x, e.z - hero.z) >= this.away);
    if (!E.length) return null;
    const e = E[Math.floor(this.r() * E.length)], tot = this.kinds.reduce((s, k) => s + k.weight, 0); let w = this.r() * tot, K = this.kinds[0];
    for (const k of this.kinds) { w -= k.weight; if (w <= 0) { K = k; break; } }
    const m = { id: this.n++, kind: K.kind, x: e.x, z: e.z, turn: Math.atan2(-e.x, -e.z), state: 'prowl', speed: K.speed ?? 1.6, sense: K.sense ?? 12, path: null, step: 0, data: {} };
    this.monsters.push(m); this.emit('spawn', m);
    return m;
  }
  pack() { return { m: this.monsters.map(m => [m.kind, Math.round(m.x * 10) / 10, Math.round(m.z * 10) / 10]) }; }
  unpack(d) { this.monsters.length = 0; for (const [kind, x, z] of d?.m || []) { const K = this.kinds.find(k => k.kind === kind) || this.kinds[0]; this.monsters.push({ id: this.n++, kind, x, z, turn: 0, state: 'prowl', speed: K.speed ?? 1.6, sense: K.sense ?? 12, path: null, step: 0, data: {} }); } return this; }
}
const nearestOf = (list, p) => list.reduce((a, b) => Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a, list[0]);
