// gs.city's police and the wanted level: crimes that are seen or phoned in, stars, police cars that come with
// sirens and lights, chase, cut you off, ram and set up roadblocks, officers on foot, a search when they lose
// sight of you, and being caught or getting away. The tactics are a Tiny Brain (gs.brains): each police car is a
// mind of one brain (a Wave: every car an experiment), taught at first by the rules below, that learns which
// tactic made a chase exciting for this player and holds the player's escape rate near the brain's target; a
// Predict learns which way this player turns at junctions in a chase, so cars cut off and roadblocks go where they
// will be. Everything original: made-up police, no real force's name or livery.
//
//   const { City, Wanted } = gs.city;
//   make()   { city = new City(view, {...}); law = new Wanted(city, api); law.on('busted', () => api.over()); }
//            (or a big city: new Wanted(metro, api), a gs.city Metro: the police come from any district or along the roads
//            between, chase across them and round the highway, and set up roadblocks on those roads too)
//   reset()  { city.reset(); law.reset(); }
//   update(dt) {
//     city.avoid(me, 1.2); city.update(dt, me);
//     law.update(dt, { x, z, heading, v, car: true, body: kart.body });   // the player: where, which way, how fast, in a car or not
//     if (hitSomeone) law.crime('hit', me);                             // what the player did ('crash', 'hit', 'theft', 'cop', 'shots', 'fight', 'speeding')
//   }
//   A car the player takes (city.cars.take(car, { by: me.body })) is a theft, or a crime against the police for a police car,
//   by itself (its 'carjack' event); a police car taken is no longer theirs.
//   law.stars (0..5), law.seen, law.search ({ x, z, r }: where they are looking), law.left (seconds until you are clear),
//   law.busting (0..1: how close to being caught), law.units ([{ car, officers, tactic }]: to draw on a map)
//
// From two stars its officers are armed (a gs.tactics Squad with a Tiny Brains coach), from three a helicopter comes,
// and on the water police launches do (city-force.js): law.on('shot', s => ...) says when they fire at the player,
// law.shoot(from, dir, { damage }) is the player shooting back, law.heli and law.boats are out, law.brains are its minds.
//
// The kit gives answers; the game draws the stars and decides what being caught means.

import { Brain, Wave, Predict } from './brains.js';
import { human } from './models/human.js';
import { Reactions } from './reactions.js';
import { addMoves } from './city-life.js';
import { phoneClass } from './speed.js';
import { Force, shootAt } from './city-force.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** How bad each crime is, in heat (a star at 1, 4, 9, 16 and 26). */
export const CRIMES = { speeding: .6, crash: 1, wreck: 1.6, theft: 2.5, fight: 2, hit: 3, cop: 5, shots: 5 };
const STARS = [1, 4, 9, 16, 26];
/** What a police car can do: chase (pursue from behind), ram (only at 3 stars or more, at a car), cutoff (to where you are turning next), block (a roadblock ahead, 4 stars), hang (follow back). */
export const TACTICS = ['chase', 'ram', 'cutoff', 'block', 'hang'];
// the officers: a man and a woman in a made-up uniform
const COPS = [
  { seed: 51, outfit: { top: { kind: 'shirt', colour: '#25385e', collar: '#1b2a48', pockets: 2, buttons: '#c9b46a' }, legs: { colour: '#1a2030' }, feet: { kind: 'boots', colour: '#121212' }, hat: { kind: 'cap', colour: '#1a2440' }, belt: { colour: '#141414' } }, strands: false },
  { seed: 52, sex: 'f', hairStyle: 'bun', outfit: { top: { kind: 'shirt', colour: '#25385e', collar: '#1b2a48', pockets: 2, buttons: '#c9b46a' }, legs: { colour: '#1a2030' }, feet: { kind: 'boots', colour: '#121212' }, hat: { kind: 'cap', colour: '#1a2440' }, belt: { colour: '#141414' } }, strands: false },
];

export class Wanted {
  /**
   * city: a gs.city City, or a Metro (a big city of districts); api: the game's (the brains keep what they learn in its brain slot). Options: max (most
   * stars, 5), cars (most police cars at once; by the phone's speed), officers (true: officers get out on foot,
   * Next Gen views), brains (true: the tactics learn; false: the rules alone), sight (metres a police car sees by day, 70),
   * armed (officers carry guns from two stars, true), air (a helicopter from three stars, true), water (police launches
   * when the player is on the water, true): city-force.js.
   */
  constructor(city, api = null, { max = 5, cars = null, officers = !!city.view.placeLamps, brains = true, sight = 70, armed = true, air = true, water = true } = {}) {
    this.city = city; this.api = api; this.max = max; this.sight = sight;
    this.maxCars = cars ?? { top: 6, mid: 5, low: 3 }[phoneClass()] ?? 5;
    this.handlers = {};
    this.brain = brains ? new Brain(api, { name: 'police', inputs: 7, actions: TACTICS, hidden: [10], target: .5, teacher: see => this.teach(see), rules: (see, a) => this.allow(see, a), limits: { react: .5, perSecond: 1.2, minNoise: .05 } }) : null;
    this.wave = this.brain ? new Wave(this.brain) : null;
    this.turns = brains ? new Predict(api, { name: 'police-turns', moves: ['left', 'straight', 'right'] }) : null;
    // officers are full people (a few at most, near the player): sculpted first, as for any human()
    this.cops = null;
    if (officers) { human.need(COPS); this.cops = COPS.map(o => { const h = human(o); addMoves(h.rig); return h; }); }
    city.cars.lightBars();   // (made now, so their shaders are built with the rest)
    this.units = []; this.officers = [];
    this.force = new Force(this, { armed, air, water, brains });   // (armed officers, the helicopter, the boats)
    this.reset();
  }
  /** Resolves when the officers are sculpted (tools and tests; a game's make() is made again by the app once they are). */
  static ready() { return human.ready(COPS); }
  /** Back to no stars, no police (call in your game's reset(), after city.reset()). */
  reset() {
    for (const u of this.units.splice(0)) this.dismiss(u, true);
    for (const o of this.officers.splice(0)) o.body.removeFromParent();
    this.force?.reset();
    Object.assign(this, { heat: 0, stars: 0, know: 0, seen: false, lost: 0, left: 0, lastSeen: null, search: null, busting: 0, chaseT: 0, spawnT: 0, lookT: 0, edge: null, speedT: 0, tipT: 0, calls: [], t: 0, wasStars: 0 });
    return this;
  }
  /** Listen: 'stars' (stars, was), 'seen', 'lost', 'busted', 'escaped', 'call' (a witness phoned: { at, about }), 'block' (a roadblock is up: unit). */
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, ...a) { for (const f of this.handlers[name] || []) f(...a); }
  /** The skill the police play at, 0..1: the brain's own dial (it follows this player's escape rate). */
  get skill() { return this.brain ? this.brain.skill : .5; }
  /** Seconds lost from sight that clear the stars at this level. */
  get escapeTime() { return (7 + 4.5 * this.stars) * (.7 + .6 * this.skill); }

  /**
   * The player did something (at: where; o.weight to weigh it yourself). Seen by a police car or officer: it counts
   * at once and they know where you are. Seen only by people in the street: someone phones it in (a few seconds
   * later, if they aren't stopped), and the police search where it happened. Seen by nobody: nothing.
   * Returns 'police', 'reported' or 'unseen'.
   */
  crime(kind, at, o = {}) {
    const w = o.weight ?? CRIMES[kind] ?? 1, az = at.z ?? at.y, p = { x: at.x, z: az };
    if (this.policeSee(p)) { this.addHeat(w, p, true); return 'police'; }
    const who = this.city.people.witness(p, 32).filter(q => !q.calling && !q.cop);
    if (!who.length) return 'unseen';
    this.city.people.report(who[0], p, { kind, weight: w });
    return 'reported';
  }
  /** Straight to a number of stars (a mission's start, a cheat); 0 clears them. */
  set(stars) { this.heat = stars ? STARS[clamp(stars, 1, 5) - 1] : 0; this.restar(); if (!stars) this.clearAll(); else this.know = 8; return this; }
  addHeat(w, at, seen) {
    this.heat += w; this.restar();
    if (seen) { this.seenNow(at); }
    else if (!this.seen) { this.search = { x: at.x, z: at.z, r: 25 }; this.lastSeen ||= { x: at.x, z: at.z, vx: 0, vz: 0 }; }
  }
  restar() {
    let n = 0; for (const s of STARS) if (this.heat >= s) n++;
    n = Math.min(n, this.max);
    if (n !== this.stars) { const was = this.stars; this.stars = n; if (n > was && !was) this.chaseT = 0; if (n > was && this.seen) this.know = 5 + 5 * this.skill; this.emit('stars', n, was); }
  }
  seenNow(at) {
    if (!this.seen) { this.emit('seen', at); this.seenAt = this.t; }
    this.seen = true; this.lost = 0; this.search = null;
    this.lastSeen = { x: at.x, z: at.z, vx: at.vx || 0, vz: at.vz || 0 };
  }

  /**
   * Once a frame, after city.update(): player = { x, z, heading, v (m/s), car (true when driving), body (the
   * player's World3D body, so crashes and knocks it causes count by themselves) }.
   */
  update(dt, player) {
    const city = this.city, me = this.me ||= {};   // (one object, kept: the police cars chase it)
    Object.assign(me, { x: player.x, z: player.z ?? player.y, heading: player.heading ?? 0, v: player.v ?? 0, car: player.car !== false && player.car != null, body: player.body ?? null });
    me.vx = Math.sin(me.heading) * me.v; me.vz = Math.cos(me.heading) * me.v;
    this.t += dt;
    // what the player did that the city saw happen (with player.body given): crashes into cars, people knocked down
    for (const e of city.events || []) {
      if (e.kind === 'call' && e.about) { this.calls.push(e); this.emit('call', e); if (this.stars || e.about.weight) this.addHeat(e.about.weight || 0, e.at, false); if (e.about.tip) this.tip(e.at); continue; }
      const mine = e.by && ((me.body && e.by === me.body) || e.by === player || (typeof player.car === 'object' && e.by === player.car));
      // a car taken (cars.take): the player's, unless the game said someone else took it
      if (e.kind === 'carjack') { if (!e.by || mine) this.crime(e.police ? 'cop' : 'theft', e.at); continue; }
      if (!mine) continue;
      if (e.kind === 'crash' && (e.power || 0) > 3) this.crime(e.car?.police ? 'cop' : 'crash', e.at);
      else if (e.kind === 'knock') this.crime(e.person?.cop ? 'cop' : 'hit', e.at);
      else if (e.kind === 'wreck') this.crime('wreck', e.at);
    }
    // speeding past a police car
    if (me.car && me.v > 24 && (this.speedT -= dt) <= 0 && this.policeSee(me, 40)) { this.speedT = 10; this.crime('speeding', me); }
    if (this.stars) this.chaseT += dt;
    // seen?
    if ((this.lookT -= dt) <= 0) {
      this.lookT = .2;
      const was = this.seen; this.seen = this.stars > 0 && this.policeSee(me);
      if (this.seen) this.seenNow(me);
      else if (was) { this.emit('lost', this.lastSeen); for (const u of this.units) if (this.t - (this.seenAt || 0) < 4) u.mind?.feel(-.3); }
      // now and then someone in the street spots you and phones it in
      if (this.stars && !this.seen && (this.tipT -= .2) <= 0) {
        this.tipT = 3 + Math.random() * 3;
        const who = city.people.witness(me, 18).filter(q => !q.calling && !q.cop && !q.act);
        if (who.length) city.people.report(who[0], me, { tip: true, weight: 0 });
      }
    }
    if (this.stars) {
      if (!this.seen && this.know > 0) {   // (just called in: the radio says where the player is, for a few seconds)
        this.know -= dt; this.lastSeen = { x: me.x, z: me.z, vx: me.vx, vz: me.vz }; this.search = null; this.left = this.escapeTime;
      } else if (!this.seen) {
        this.lost += dt;
        const L = this.lastSeen || me, r = 18 + 4.5 * this.lost;
        // they guess on along the way you were going
        this.search = { x: L.x + clamp(L.vx * 2.5, -40, 40), z: L.z + clamp(L.vz * 2.5, -40, 40), r };
        this.left = Math.max(0, this.escapeTime - this.lost);
        if (this.lost > this.escapeTime) this.escape();
      } else this.left = this.escapeTime;
    } else this.left = 0;
    this.learnTurns();
    this.dispatch(dt);
    for (const u of [...this.units]) this.drive(u, dt);
    this.foot(dt);
    this.force?.update(dt, player);
    this.arrest(dt);
    this.sirens(dt);
    this.wasStars = this.stars;
  }
  // a tip-off: where you were just seen (but no one with a badge has seen you yet)
  tip(at) { if (this.seen || !this.stars) return; this.lastSeen = { x: at.x, z: at.z ?? at.y, vx: 0, vz: 0 }; this.lost = Math.min(this.lost, this.escapeTime * .4); }
  // can police see a point (a car's driver, or an officer on foot), within r?
  policeSee(p, r = null) {
    const city = this.city, night = city.night || 0, pz = p.z ?? p.y;
    for (const u of this.units) {
      const c = u.car, R = r ?? this.sight * (1 - .35 * night) * (.8 + .4 * this.skill), dx = p.x - c.x, dz = pz - c.z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      if (d > 8 && Math.cos(Math.atan2(dx, dz) - c.heading) < -.35) continue;   // (not right behind it)
      if (d < 4 || !city.ray({ x: c.x, y: 1.3, z: c.z }, { x: dx, y: 0, z: dz }, d)) return true;
    }
    for (const o of this.officers) { const dx = p.x - o.x, dz = pz - o.z, d = Math.hypot(dx, dz); if (d < 35 && (d < 3 || !city.ray({ x: o.x, y: 1.6, z: o.z }, { x: dx, y: -.4, z: dz }, d))) return true; }
    if (this.force?.sees(p)) return true;   // (the helicopter over you, a boat on the water)
    return false;
  }
  // which way the player turns at junctions (in a car, while wanted): a Predict of left / straight / right
  learnTurns() {
    const me = this.me; if (!me.car || !this.stars) { this.edge = null; this.way = null; return; }
    const r = this.city.road(me.x, me.z, me.v > 2 ? me.heading : null); if (!r || r.d > 7) return;
    const e = r.edge;
    if (!e) { this.edge = null; this.way = r.road ? r : null; return; }   // (on a road between a big city's districts, or its highway: no junction to guess)
    this.way = null;
    if (this.edge && e !== this.edge && this.edge.b === e.a && this.planOf(this.edge) === this.planOf(e)) {
      const a = this.edge, cross = a.dx * e.dz - a.dz * e.dx, turn = Math.abs(cross) < .5 ? 'straight' : cross * this.city.cars.sideK > 0 ? 'left' : 'right';
      this.turns?.see(turn);
    }
    this.edge = e;
  }
  // which plan a road edge is of (a big city's districts each have their own)
  planOf(e) { return this.city.planOf?.(e) || this.city.plan; }
  // the road out of the player's next junction they are likely to take, and a point a way along it (on a road between a big
  // city's districts: a point d metres on along it)
  ahead(d = 30) {
    const e = this.edge;
    if (!e) {
      const w = this.way; if (!w?.road) return null;
      const R = w.road, s = w.back ? w.s - d : w.s + d, loop = R.loop || R.ring, sf = loop ? ((s % R.len) + R.len) % R.len : s;
      if (!loop && (sf < 8 || sf > R.len - 8)) return null;
      const p = this.city.lanePos(R, 0, w.back ? R.len - sf : sf, w.back, {});
      return { x: p.x, z: p.z, y: p.y, heading: Math.atan2(p.dx, p.dz), road: R, s: sf, back: w.back, turn: 'straight' };
    }
    const T = this.city.cars, P = this.planOf(e), B = P.nodes[e.b], guess = this.turns?.guess?.() || 'straight';
    let best = null;
    for (const id of B.out) {
      const f = P.edges[id]; if (f.b === e.a) continue;
      const cross = e.dx * f.dz - e.dz * f.dx, turn = Math.abs(cross) < .5 ? 'straight' : cross * T.sideK > 0 ? 'left' : 'right';
      if (!best || turn === guess) best = { e: f, turn };
    }
    if (!best) return null;
    const [s0, s1] = T.ends(best.e), s = Math.min(s1 - 2, s0 + d), p = T.lanePos(best.e, 0, s);
    return { x: p.x, z: p.z, heading: Math.atan2(best.e.dx, best.e.dz), edge: best.e, turn: best.turn, node: B };
  }

  /* ---------- the cars ---------- */

  // police cars come (out of sight, a way off) until there are enough for the stars; they go when the stars do
  dispatch(dt) {
    const T = this.city.cars;
    for (const u of [...this.units]) if (!(T.has ? T.has(u.car) : T.list.includes(u.car))) { this.units.splice(this.units.indexOf(u), 1); this.dismiss(u, true); }   // (taken by the player, or gone)
    const want = this.stars ? Math.min(this.maxCars, this.stars + (this.skill > .65 ? 1 : 0)) : 0, chasing = this.units.filter(u => !u.roadblock);
    this.roadblock(dt);
    if (chasing.length < want && (this.spawnT -= dt) <= 0) {
      this.spawnT = (2.5 + 3 * (1 - this.skill)) / Math.max(1, this.stars * .6);
      const at = this.seen ? this.me : this.search || this.me, spot = this.spawnSpot(at);
      if (spot) {
        const car = T.add(spot.edge ? { edge: spot.edge, lane: spot.lane, s: spot.s, police: true, keep: true } : { x: spot.x, z: spot.z, y: spot.y, heading: spot.heading, police: true, keep: true });
        if (car) { car.siren = true; const u = { car, tactic: 'chase', mind: this.wave?.mind() || null, thinkT: 0, felt: 0, officers: [], home: null, t: 0 }; this.units.push(u); }
      }
    }
    while (chasing.length > want) {   // the stars came down: the furthest go home
      const f = chasing.sort((a, b) => dist(b.car, this.me) - dist(a.car, this.me)).shift();
      this.units.splice(this.units.indexOf(f), 1); this.dismiss(f);
    }
  }
  // at 4 stars: a roadblock on the road out of the junction ahead, the one Predict guesses this player will take,
  // two cars parked nose to tail across both sides of it. Driven through or left behind, they join the chase.
  roadblock(dt) {
    const T = this.city.cars, me = this.me, up = this.units.filter(u => u.roadblock);
    for (const u of up) {
      const c = u.car, passed = dist(c, me) > 30 && dot(me, c) < 0;
      if (passed || dist(c, me) > 260 || u.t > 40 || this.stars < 4) {
        u.roadblock = false; u.blocked = false; u.blockAt = null; u.goal = null; u.tactic = 'chase';
        if (passed && dist(c, me) < 45) u.mind?.feel(.8);   // (the player got through it: a close one)
      }
    }
    if ((this.blockT = (this.blockT ?? 4) - dt) > 0 || this.stars < 4 || !(this.seen || this.know > 0) || !me.car || me.v < 5 || up.some(u => u.roadblock)) return;
    this.blockT = 14 - 6 * this.skill;
    const a = this.ahead(26); if (!a) return;
    const d = dist(a, me); if (d < 45 || d > 220) return;
    // nose to tail across the whole road, centred on its middle line (a highway: across the player's side of its barrier)
    let cx = a.x, cz = a.z, cy = a.y || 0, px = Math.cos(a.heading), pz = -Math.sin(a.heading), n, back = null;
    if (a.edge) {
      back = T.back(a.edge); const k0 = T.lanePos(a.edge, 0, T.across(a.edge, a.x, a.z, {}).s);
      if (back) { const q = T.across(back, a.x, a.z, {}), p = T.lanePos(back, 0, q.s); cx = (k0.x + p.x) / 2; cz = (k0.z + p.z) / 2; const l = Math.hypot(k0.x - p.x, k0.z - p.z) || 1; px = (k0.x - p.x) / l; pz = (k0.z - p.z) / l; }
      n = a.edge.lanes > 1 ? 3 : 2;
    } else {
      const R = a.road, p = R.median ? this.city.lanePos(R, (R.lanes - 1) / 2, a.back ? R.len - a.s : a.s, a.back, {}) : this.city.along(R, a.s, {});
      cx = p.x; cz = p.z; cy = p.y; n = R.median ? R.lanes : R.lanes > 1 ? 3 : 2;
    }
    const face = Math.atan2(px, pz), made = [];
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 4.7, x = cx + px * o, z = cz + pz * o, e = a.edge ? (o >= 0 || !back ? a.edge : back) : null;
      const car = T.add(e ? { edge: e, lane: 0, s: T.across(e, x, z, {}).s, police: true, keep: true } : { x, z, y: cy, heading: face, police: true, keep: true }); if (!car) break;
      T.chase(car, { x, z }, { how: 'block', face, top: 0, siren: true });
      Object.assign(car, { x, z, heading: face, v: 0 }); car.chase.parked = true;
      const u = { car, tactic: 'block', roadblock: true, blocked: true, blockAt: { ...a, x, z }, mind: null, thinkT: 0, felt: 0, officers: [], home: null, t: 0 };
      this.units.push(u); made.push(u);
    }
    if (made.length) { this.blocks = (this.blocks || 0) + 1; this.emit('block', made[0]); }
  }
  // a lane out of sight of the player, 70-150 m off
  spawnSpot(at) {
    const city = this.city;
    for (let i = 0; i < 12; i++) {
      const s = city.spot('street', { near: at, min: 70, max: 150 }); if (!s) continue;   // (a big city's: in any made district, or on a road between)
      const dx = s.x - this.me.x, dz = s.z - this.me.z, d = Math.hypot(dx, dz);
      if (i < 6 && this.me.v > 4 && (dx * Math.sin(this.me.heading) + dz * Math.cos(this.me.heading)) / d < .3) continue;   // (ahead of a moving player first: they come to meet you)
      if (i < 9 && !city.ray({ x: this.me.x, y: 1.4, z: this.me.z }, { x: dx, y: 0, z: dz }, d)) continue;   // (one it would be seen arriving at: another)
      if (!s.edge) return { x: s.x, z: s.z, y: s.y, heading: s.heading };
      const [s0, s1] = city.cars.ends(s.edge), q = city.cars.across(s.edge, s.x, s.z, {});
      return { edge: s.edge, lane: s.lane, s: clamp(q.s, s0 + 2, s1 - 2) };
    }
    return null;
  }
  dismiss(u, now = false) {
    const T = this.city.cars; u.mind?.done();
    for (const o of u.officers) { const i = this.officers.indexOf(o); if (i >= 0) this.officers.splice(i, 1); o.body.removeFromParent(); }
    u.officers.length = 0;
    if (now || !(T.has ? T.has(u.car) : T.list.includes(u.car))) { T.remove(u.car); return; }
    u.car.siren = false; u.car.keep = false; T.release(u.car);   // (back into the traffic: it is sent elsewhere when far, as any car)
  }
  // a police car each frame: its tactic (the brain's, a few times a second), and driving it
  drive(u, dt) {
    const c = u.car, T = this.city.cars, me = this.me; u.t += dt;
    if (c.mode === 'loose' || c.mode === 'wreck') { if (c.mode === 'wreck') { this.units.splice(this.units.indexOf(u), 1); u.mind?.done(); this.city.people.fromCar?.(c); c.keep = false; c.police = c.siren = false; } return; }
    if (u.officers.some(o => !o.inCar)) { if (c.mode === 'chase') c.chase.top = 0; return; }   // (waiting for its officers)
    if (u.roadblock) { c.siren = true; if (c.chase) { c.chase.top = 0; c.chase.parked = true; } return; }   // (parked across the road)
    if (!u.mind && this.wave && u.thinkT <= 0) u.mind = this.wave.mind();
    const d = dist(c, me);
    if ((u.thinkT -= dt) <= 0) {
      u.thinkT = .5 + Math.random() * .3;
      const see = this.sees(u, d);
      const was = u.tactic;
      if (u.mind) { u.mind.act(see, .6); u.tactic = u.mind.action || 'chase'; } else u.tactic = this.allow(see, this.teach(see));
      u.thinkAt = this.t;
      if (u.tactic !== was && was === 'block') { u.blockAt = null; u.blocked = false; }
    }
    // close to the player at speed: an exciting moment, for the minds that made it
    if (this.seen && d < 12 && me.v > 8 && (u.felt -= dt) <= 0) { u.felt = 2; u.mind?.feel(.6); }
    if (!this.stars) return;
    const top = (21 + 9 * this.skill) * (this.seen ? 1 : .75);
    let how = 'pursue', keep = me.v < 2 ? 4.6 : 6.5, tg = this.seen || this.know > 0 || d < 25 ? me : this.searchPoint(u), face;
    if (this.seen && me.car) {
      if (u.tactic === 'ram') how = 'ram';
      else if (u.tactic === 'hang') keep = 22;
      else if (u.tactic === 'cutoff' || u.tactic === 'block') {
        // where: on the road out of the player's next junction they are likely to take (fixed when it decided)
        if (!u.goal || u.goalT !== u.thinkAt) { u.goal = u.tactic === 'block' && u.blockAt ? u.blockAt : this.ahead(u.tactic === 'block' ? 28 : 24); u.goalT = u.thinkAt; }
        const a = u.goal;
        if (a && dist(a, me) > (u.blocked ? 0 : 18) && dist(a, c) < dist(me, a) * 2.2 + (u.blocked ? 99 : 0)) {
          if (u.tactic === 'block') { u.blockAt = a; face = a.heading + Math.PI / 2; how = 'block'; tg = a; if (c.chase?.parked && !u.blocked) { u.blocked = true; this.emit('block', u); } }
          else { how = 'go'; tg = a; }
        } else { u.blockAt = null; u.blocked = false; u.goal = null; }
        // the player got past the roadblock at speed: a near escape
        if (u.blocked && dist(c, me) < 10 && me.v > 10 && (u.felt -= dt) <= 0) { u.felt = 3; u.mind?.feel(1); }
        if (u.blocked && dist(c, me) > 30 && dot(me, c) < 0) { u.blockAt = null; u.blocked = false; u.goal = null; u.tactic = 'chase'; how = 'pursue'; tg = me; }
      }
    } else if (!this.seen && this.know <= 0 && d >= 25) how = 'go';
    if (c.mode !== 'chase' || c.chase.how !== how || c.chase.target !== tg) T.chase(c, tg, { how, top, keep, face, siren: true });
    c.chase.top = top; c.chase.keep = keep; if (face != null) c.chase.face = face; c.siren = true;
  }
  // what a police car's brain sees: [distance, ahead of the player, player's speed, stars, its rank by distance, how sure the turn guess is, seen]
  sees(u, d) {
    const me = this.me, c = u.car, ux = c.x - me.x, uz = c.z - me.z, l = Math.hypot(ux, uz) || 1;
    const ahead = (ux * Math.sin(me.heading) + uz * Math.cos(me.heading)) / l;
    const rank = this.units.filter(o => dist(o.car, me) < d).length;
    return [clamp(d / 100, 0, 1.5), ahead, clamp(me.v / 30, 0, 1.5), this.stars / 5, rank / 4, this.turns?.sure ?? 0, this.seen ? 1 : -1];
  }
  // the rules a police car starts from (the brain copies them, then learns)
  teach(see) {
    const d = see[0] * 100, ahead = see[1], speed = see[2] * 30, stars = see[3] * 5, rank = see[4] * 4, sure = see[5];
    if (d > 70 || see[6] < 0) return 'chase';
    if (stars >= 4 && ahead > .55 && d > 40 && rank >= 1) return 'block';
    if (sure > .45 && rank >= 1 && ahead > .2 && d > 25) return 'cutoff';
    if (stars >= 3 && d < 18 && speed > 7) return 'ram';
    if (rank >= 2 && d < 30) return 'hang';
    return 'chase';
  }
  // what a police car may never do: ram below 3 stars or someone on foot, block below 4
  allow(see, a) {
    const stars = see[3] * 5;
    if (a === 'ram' && (stars < 3 || !this.me?.car)) return 'chase';
    if (a === 'block' && stars < 4) return stars >= 2 ? 'cutoff' : 'chase';
    return a;
  }
  // where a police car looks when the player is out of sight: points in the search circle, a new one when it gets there
  searchPoint(u) {
    const S = this.search || this.lastSeen || this.me;
    if (!u.look || dist(u.car, u.look) < 12 || dist(u.look, S) > (S.r || 30)) {
      const a = Math.random() * Math.PI * 2, r = (S.r || 20) * Math.sqrt(Math.random()), p = this.city.road(S.x + Math.cos(a) * r, (S.z ?? S.y) + Math.sin(a) * r);
      u.look = p ? { x: p.x, z: p.z } : { x: S.x, z: S.z ?? S.y };
    }
    return u.look;
  }

  /* ---------- officers on foot ---------- */

  // a police car that has stopped near a player who is slow or on foot lets its officers out; they run to the
  // player, and back to the car when the player gets away from it
  foot(dt) {
    const me = this.me, city = this.city;
    for (const u of this.units) {
      const c = u.car, d = dist(c, me);
      if (this.cops && !u.officers.length && this.stars && Math.abs(c.v) < 1 && d < 16 && (me.v < 3 || !me.car)) {
        const n = this.stars >= 2 ? 2 : 1;
        for (let i = 0; i < n; i++) { const o = this.officer(c, i); if (o) { u.officers.push(o); this.officers.push(o); } }
      }
      for (const o of u.officers) {
        if (this.force?.takes(o, u, dt)) continue;   // (armed: the squad moves them, city-force.js)
        const back = !this.stars || (me.car && me.v > 6 && dist(me, c) > 22) || dist(me, c) > 45;
        o.inCar = false;
        if (o.react.busy) { o.x = o.body.position.x; o.z = o.body.position.z; o.react.update(dt); continue; }
        const tx = back ? c.x : me.x, tz = back ? c.z : me.z, dx = tx - o.x, dz = tz - o.z, dd = Math.hypot(dx, dz);
        const stop = back ? 1.6 : 1.3, sp = dd > stop ? (dd > 6 ? 4.6 : 2.2) : 0;
        if (back && dd < 2) { o.gone = true; continue; }
        const p = { x: o.x + (dd > 0 ? dx / dd : 0) * sp * dt, z: o.z + (dd > 0 ? dz / dd : 0) * sp * dt };
        city.collide(p, .3, .2);
        o.speed += (Math.hypot(p.x - o.x, p.z - o.z) / Math.max(dt, 1e-4) - o.speed) * Math.min(1, dt * 8);
        o.x = p.x; o.z = p.z; o.heading = dd > .2 ? Math.atan2(dx, dz) : o.heading;
        const B = o.body; o.y = city.ground(o.x, o.z, (o.y || 0) + 1) || 0; B.position.set(o.x, o.y, o.z); B.rotation.y += wrap(o.heading - B.rotation.y) * Math.min(1, dt * 8);
        if (!back && dd < 2.2) { if (o.move !== 'wave') { B.rig.play('wave'); o.move = 'wave'; } }   // (an arm out: "stop there")
        else { o.move = null; B.rig.blend({ idle: 0, walk: 1.4, run: 4 }, o.speed); }
        B.rig.update(dt, { speed: o.speed, toward: { x: tx, z: tz } }); o.react.update(dt);
        if (B.face && (o.lookT = (o.lookT || 0) - dt) <= 0) { o.lookT = .5; B.face.look(dd < 8 && !back ? { x: me.x, y: 1.5, z: me.z } : null); }
        // a car driven into them
        if (me.car && me.v > 3 && Math.hypot(me.x - o.x, me.z - o.z) < 1.4) { o.react.hit([me.vx * .5, .5, me.vz * .5], { x: o.x, y: 1, z: o.z }); this.crime('cop', o); }
      }
      if (u.officers.length && u.officers.every(o => o.gone)) { for (const o of u.officers) { o.body.removeFromParent(); this.officers.splice(this.officers.indexOf(o), 1); } u.officers.length = 0; }
    }
  }
  // an officer out of a police car's door (a full person, with Reactions)
  officer(c, i) {
    const src = this.cops[(c.id + i) % this.cops.length]; if (!src) return null;
    const body = src.twin(); addMoves(body.rig); this.city.group.add(body);
    body.lod = 1;
    body.userData.noFade = true;
    if (body.rig) body.rig.steps = false;
    if (body.breath) body.breath.on = false;
    if (body.idle) body.idle.on = false;
    if (body.rig?.follow) body.rig.follow.amount = 0;
    const sk = this.city.cars.sideK, h = c.heading, side = i ? -1 : 1, lx = Math.cos(h) * sk * side, lz = -Math.sin(h) * sk * side, w = c.wid / 2 + .45;
    const x = c.x + lx * w, z = c.z + lz * w, y = c.y || 0; body.position.set(x, y, z); body.rotation.y = h;
    const o = { body, react: new Reactions(body, { steady: 1.3 }), x, y, z, heading: h, speed: 0, inCar: false, gone: false, move: null, cop: true, unit: c };
    return this.force ? this.force.arm(o) : o;
  }

  /* ---------- guns, the helicopter and the boats (city-force.js) ---------- */

  /**
   * The player's shot (from: the muzzle, dir: the way it goes, in the world) against the police who are out: an
   * officer (a head shot hurts twice), the helicopter or a boat. What it hits is hurt and it is a crime against the
   * police ('cop'). Returns { kind: 'officer' | 'helicopter' | 'boat', target, point, d, head } or null.
   */
  shoot(from, dir, { damage = 22, range = 120 } = {}) { return this.force ? shootAt(this.force, from, dir, { damage, range }) : null; }
  /** Hurts an officer by the game's own rules (a blast, a punch): damage, where (at) and from where it came. */
  hitOfficer(o, damage, at = null, from = null) { this.force?.hurt(o, damage, at, from); return this; }
  /** The police helicopter while it is out ({ model, craft (a gs.craft Hover), tactic, down }), or null. */
  get heli() { return this.force?.heli || null; }
  /** The police launches out on the water ([{ model, craft (a gs.craft Boat), tactic, down }]). */
  get boats() { return this.force?.boats || []; }
  /** Its Tiny Brains, to look at, save or forget: cars (the police cars' tactics), turns (which way this player turns), support (the helicopter's and boats'), squad (the armed officers' coach). */
  get brains() { return { cars: this.brain, turns: this.turns, support: this.force?.brain || null, squad: this.force?.coach || null }; }

  /* ---------- caught, or away ---------- */

  arrest(dt) {
    const me = this.me; let close = false;
    if (this.stars) {
      for (const u of this.units) if (dist(u.car, me) < 7.5 && Math.abs(u.car.v) < 2 && me.v < 1.2) close = true;
      for (const o of this.officers) if (!o.react.busy && Math.hypot(o.x - me.x, o.z - me.z) < 1.9 && me.v < 2) close = true;
    }
    this.busting = clamp(this.busting + (close ? dt / (me.car ? 2.6 : 1.6) : -dt / 2), 0, 1);
    if (this.busting >= 1) {
      if (this.chaseT < 12) for (const u of this.units) u.mind?.feel(-.6);   // (too quick: no fun)
      this.brain?.result(false);
      this.emit('busted', { x: me.x, z: me.z, stars: this.stars });
      this.clearAll();
    }
  }
  escape() {
    this.brain?.result(true);
    this.emit('escaped', { stars: this.stars, after: this.chaseT });
    this.clearAll();
  }
  clearAll() {
    this.heat = 0; this.restar(); this.seen = false; this.know = 0; this.lost = 0; this.search = null; this.lastSeen = null; this.busting = 0; this.chaseT = 0; this.left = 0;
    for (const u of this.units.splice(0)) this.dismiss(u);
    this.force?.clear();
  }

  /* ---------- sirens and lights ---------- */

  sirens(dt) {
    const city = this.city, me = this.me, v = city.view, night = city.night || 0;
    const loud = this.units.filter(u => u.car.siren).sort((a, b) => dist(a.car, me) - dist(b.car, me)).slice(0, 2);
    for (const u of loud) {
      const c = u.car, p = { x: c.x, y: 1.5, z: c.z };
      if ((u.wail = (u.wail || Math.random() * .5) - dt) <= 0) { u.wail = .48; u.hi = !u.hi; city.ears?.tone(u.hi ? 960 : 740, p, { len: .46, wave: 'triangle', vol: .035, slide: u.hi ? -160 : 180 }); }
      if (v.flash && (u.blink = (u.blink || 0) - dt) <= 0) { u.blink = .21; u.red = !u.red; v.flash(c.x, 1.9, c.z, { col: u.red ? '#ff3030' : '#3060ff', i: 5 + 26 * night, reach: 10, life: .17 }); }
    }
  }
}
Wanted.looks = COPS;
const dist = (a, b) => Math.hypot(a.x - b.x, (a.z ?? a.y) - (b.z ?? b.y));
const dot = (me, c) => (c.x - me.x) * Math.sin(me.heading) + (c.z - me.z) * Math.cos(me.heading);
