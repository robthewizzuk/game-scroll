// gs.city's police when it gets serious (a Wanted makes one; kit file). Two stars and the officers who get out of their
// cars carry pistols (shotguns and SMGs at four), and fight as a gs.tactics Squad: some keep you pinned down from
// cover while others move up or go round the side, coached by a Tiny Brain (corrections) that keeps what it is told
// on the phone. Each officer has gs.combat Health and gs.characters Reactions: hit, they flinch, stagger or go down
// (knocked out, never killed on screen). Three stars bring a police helicopter on a gs.craft Hover (solid in the game's
// Rapier World3D): it keeps you seen while there is open sky over you and lights you with a searchlight at night. Out
// on the water, police launches on gs.craft Boats come after you with their lights going, and their crews shoot at
// three stars. How the helicopter and the boats close in (over you, ahead of you, wide, or a boat ramming yours) is a
// Tiny Brain too (a Wave: each one a mind), taught by the rules below and learning, as the police cars' does, which
// way of chasing made it exciting for this player.
//
// The kit fires and says so; the game decides what a hit does to the player:
//   law.on('shot', s => { if (s.hit) me.health.hurt(s.damage, { from: s.from }); });   // s: { by, from, to, dir, hit, damage, kind }
//   const h = law.shoot(muzzle, aimDir, { damage: 22 });   // the player's shot: the officer, helicopter or boat it hit, hurt; or null
//   law.officers / law.heli / law.boats (to draw on a map); events 'heli', 'boat', 'officer down', 'heli down', 'boat down'
import { Vector3, Mesh, ConeGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide, BufferAttribute } from 'three';
import { Brain, Wave, Coach } from './brains.js';
import { Squad } from './tactics.js';
import { Health } from './combat.js';
import { arm, weaponSound } from './arsenal.js';
import { weapon } from './models/weapons.js';
import { vehicle } from './models/vehicles.js';
import { Hover, Boat } from './craft.js';
import { Swimmer } from './swim.js';
import { linksFor } from './links.js';
import { phoneClass } from './speed.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a, b) => Math.hypot(a.x - b.x, (a.z ?? a.y) - (b.z ?? b.y));
/** How the helicopter and the boats close in: close (over you, on your tail), ahead (where you are going), wide (circling, a way off), ram (a boat, three stars or more). */
export const SUPPORT = ['close', 'ahead', 'wide', 'ram'];
const V1 = new Vector3();

export class Force {
  /**
   * law: the Wanted. Options: armed (officers carry guns from two stars, true), air (the helicopter from three stars,
   * true), water (police launches on the water, true), brains (as the Wanted's), crew (people at the helicopter's
   * controls and the boats' wheels: Next Gen views on all but the slowest phones).
   */
  constructor(law, { armed = true, air = true, water = true, brains = true, crew = null } = {}) {
    this.law = law; this.city = law.city; this.view = law.city.view; this.links = linksFor(this.view);
    this.armed = armed; this.air = air; this.water = water;
    const api = law.api, full = !!law.cops;
    this.crew = crew ?? (full && phoneClass() !== 'low');
    this.brain = brains ? new Brain(api, { name: 'police-support', inputs: 7, actions: SUPPORT, hidden: [8], target: .5, teacher: see => this.teach(see), rules: (see, a) => this.allow(see, a), limits: { react: .6, perSecond: 1, minNoise: .05 } }) : null;
    this.wave = this.brain ? new Wave(this.brain) : null;
    this.coach = brains ? new Coach(api, { name: 'police-squad' }) : null;
    law.on('escaped', () => this.brain?.result(true)); law.on('busted', () => this.brain?.result(false));
    this.waterOf = new Swimmer({ sounds: false });   // (only to read the water: every Water, Sea or water link the game made, as a swimmer finds it)
    // what they bring is made now, under the loading screen, so its shaders are built with the rest
    const scene = this.view.scene, warm = o => { o.visible = false; scene?.add(o); return o; };
    this.guns = full && armed ? { pistol: warm(weapon('pistol')), shotgun: warm(weapon('shotgun')), smg: warm(weapon('smg')) } : null;
    this.heliModel = full && air ? warm(vehicle('helicopter', { style: 'police', lit: true })) : null;
    this.boatModels = full && water ? [warm(vehicle('boat', { style: 'police', lit: true })), warm(vehicle('boat', { style: 'police', lit: true, seed: 1 }))] : null;
    // the searchlight: a beam to see in the night air and a lamp for the city's lamp pool (it never comes or goes: a light that did would rebuild shaders)
    this.beam = null; this.lamp = { x: 0, y: 0, z: 0, dir: [0, -1, 0], angle: .2, soft: .55, reach: 80, col: '#f2f0ff', i: 0, shadow: false };
    if (this.heliModel) {
      // a cone that fades from the lamp to the ground (vertex colours: added light, so dark is none)
      const g = new ConeGeometry(1, 1, 20, 8, true); g.translate(0, -.5, 0);
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const f = Math.pow(1 + pos.getY(i), 1.6); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f; }
      g.setAttribute('color', new BufferAttribute(col, 3));
      this.beam = warm(new Mesh(g, new MeshBasicMaterial({ color: '#fff6e2', vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })));
      this.beam.name = 'searchlight beam'; this.beam.castShadow = this.beam.receiveShadow = false; this.beam.userData.noTrace = true; this.beam.frustumCulled = false;
    }
    this.reset();
  }
  reset() {
    this.heli && this.dropHeli(true);
    for (const b of this.boats || []) this.dropBoat(b, true);
    Object.assign(this, { heli: null, boats: [], squad: null, squadOf: null, heliT: 0, boatT: 0, dryT: 0, t: 0, wet: false });
    this.light(null);
    return this;
  }
  get world() { return this.links?.one('world') || null; }

  /* ---------- each frame (the Wanted calls this after its own officers) ---------- */

  update(dt, player) {
    const law = this.law, me = law.me; this.t += dt;
    me.y = player.y ?? this.city.ground?.(me.x, me.z, (me.y ?? 0) + 1) ?? 0;
    const w = this.waterOf.waterAt(me.x, me.z, me.y);
    this.wet = w.y > -Infinity && (player.boat || player.swim || me.y < w.y + 1.2);
    this.dryT = this.wet ? 0 : this.dryT + dt;
    this.squadStep(dt);
    this.helicopter(dt);
    this.launches(dt);
  }
  /** Can the helicopter or a boat see p? (the Wanted asks, as it does its cars and officers) */
  sees(p) {
    const city = this.city, pz = p.z ?? p.y, py = (p.y != null && p.z != null ? p.y : this.law.me?.y || 0) + 1;
    const H = this.heli;
    if (H && !H.down && H.arrived) { const q = H.craft.pos, d = Math.hypot(p.x - q.x, pz - q.z); if (d < 150 && !city.ray({ x: p.x, y: py, z: pz }, { x: q.x - p.x, y: q.y - py, z: q.z - pz }, Math.hypot(d, q.y - py) - 2)) return true; }
    for (const b of this.boats) { if (b.down) continue; const q = b.craft, d = Math.hypot(p.x - q.x, pz - q.z); if (d < 90 && (d < 6 || !city.ray({ x: q.x, y: q.y + 2, z: q.z }, { x: p.x - q.x, y: 0, z: pz - q.z }, d))) return true; }
    return false;
  }
  clear() { if (this.heli) this.heli.leave = true; for (const b of this.boats) b.leave = true; }

  /* ---------- officers with guns ---------- */

  /** Gives an officer (just out of a car) a gun when the stars call for it: health, a weapon in both hands, a place in the squad. */
  arm(o) {
    if (!this.armed || o.gun || this.law.stars < 2) return o;
    const kind = this.law.stars >= 4 ? (o.unit.id % 2 ? 'smg' : 'shotgun') : 'pistol';
    o.health = new Health({ max: 80 + 10 * this.law.stars, downed: true, bleed: 9999 });
    o.gun = arm(kind); o.kind = kind; o.armed = true; o.aim = 0; o.fireT = .8 + Math.random(); o.burst = 0;
    if (this.guns) { const m = weapon(kind); o.wield = m.wield(o.body); }
    Object.defineProperties(o, { y: { get: () => o.body.position.y, set: v => { o.body.position.y = v; }, configurable: true }, hp: { get: () => o.health.hp, configurable: true }, maxHp: { get: () => o.health.max, configurable: true }, alive: { get: () => !o.health.down && !o.health.dead, configurable: true } });
    o.order = { do: 'hold', role: 'idle' };
    this.squadOf = null;   // (the squad is made again with them in it)
    return o;
  }
  // the squad of armed officers on their feet (made again when that changes)
  members() { return this.law.officers.filter(o => o.armed && !o.gone); }
  squadStep(dt) {
    const law = this.law, list = this.members();
    for (const o of law.officers) if (!o.armed && law.stars >= 2 && !o.gone && !o.react.busy) this.arm(o);   // (the stars went up while they were out)
    if (!list.length) { this.squad = null; this.squadOf = null; return; }
    const key = list.map(o => o.id ??= ++Force.ids).join();
    if (key !== this.squadOf) { this.squad = new Squad(list, { range: 26, grenades: 0, aggression: .35 + .1 * law.stars, think: .7, coach: this.coach || null }); this.squadOf = key; }
    const me = law.me, target = { x: me.x, y: me.y || 0, z: me.z };
    this.squad.update(dt, target);
    for (const o of list) {
      o.health.update(dt); o.gun.update(dt);
      if (!o.alive && !o.out) { o.out = true; this.squad.hurt(o); law.emit('officer down', o); }
    }
  }
  /** The Wanted's foot() asks this first for each officer: true when the squad moves this one this frame (armed, the player close). */
  takes(o, u, dt) {
    if (!o.armed) return false;
    const law = this.law, me = law.me, city = this.city, c = u.car;
    if (!o.alive) { o.x = o.body.position.x; o.z = o.body.position.z; o.react.update(dt); o.wield?.update(dt, { how: 'none' }); return true; }
    if (!law.stars || (me.car && me.v > 6 && dist(me, c) > 22) || dist(me, c) > 60) { o.wield?.update(dt, { how: 'low' }); o.aim = 0; return false; }   // (back to the car, as an unarmed one does)
    o.inCar = false;
    if (o.react.busy) { o.x = o.body.position.x; o.z = o.body.position.z; o.react.update(dt); o.wield?.update(dt, { how: 'low' }); return true; }
    const ord = o.order || {}, d = dist(o, me), B = o.body;
    let tx = o.x, tz = o.z, run = false;
    if (ord.do === 'move' && ord.to) { tx = ord.to.x; tz = ord.to.z ?? ord.to.y; run = dist(o, { x: tx, z: tz }) > 3; }
    else if (ord.do !== 'shoot' && d > 9) { tx = me.x; tz = me.z; run = d > 16; }   // (no orders yet: in towards them)
    // with no cover to go to they keep their distance, guns on the player, and only close in to make the arrest once the player stands still
    if (!ord.spot && me.v >= 1.2 && Math.hypot(tx - me.x, tz - me.z) < 6.5 && d < 9) { tx = o.x; tz = o.z; run = false; }
    else if (!ord.spot && me.v >= 1.2 && Math.hypot(tx - me.x, tz - me.z) < 6.5) { const k = (d - 7) / Math.max(d, 1e-3); tx = o.x + (me.x - o.x) * k; tz = o.z + (me.z - o.z) * k; }
    // standing still for a shot, or moving
    const dx = tx - o.x, dz = tz - o.z, dd = Math.hypot(dx, dz), sp = dd > .8 ? (run ? 4.4 : 2) : 0;
    const p = { x: o.x + (dd > 0 ? dx / dd : 0) * sp * dt, z: o.z + (dd > 0 ? dz / dd : 0) * sp * dt };
    city.collide(p, .3, .2);
    o.speed += (Math.hypot(p.x - o.x, p.z - o.z) / Math.max(dt, 1e-4) - o.speed) * Math.min(1, dt * 8);
    o.x = p.x; o.z = p.z;
    if ((o.seeT = (o.seeT || 0) - dt) <= 0) { o.seeT = .25 + Math.random() * .1; o.sees = this.lineTo(o, me); }   // (a few rays a second, not every frame)
    const sees = o.sees, face = sees && d < 40 ? Math.atan2(me.x - o.x, me.z - o.z) : dd > .2 ? Math.atan2(dx, dz) : B.rotation.y;
    o.heading = face;
    B.position.set(o.x, city.ground(o.x, o.z, (o.y || 0) + 1) || 0, o.z); B.rotation.y += wrap(face - B.rotation.y) * Math.min(1, dt * 8);
    const low = ord.spot && ord.spot.low && o.speed < .5 && o.aim < .5;
    if (o.speed < .4 && low) { if (o.move !== 'crouch') { B.rig.play('crouch'); o.move = 'crouch'; } } else { o.move = null; B.rig.blend({ idle: 0, walk: 1.4, run: 4 }, o.speed); }
    B.rig.update(dt, { speed: o.speed, toward: { x: tx, z: tz } }); o.react.update(dt);
    // up to aim and fire when they can see the player and aren't running
    const fire = sees && d < o.gun.range * .85 && o.speed < 2.5 && (ord.do === 'shoot' || ord.do === 'hold' || d < 14);
    o.aim = clamp(o.aim + (fire ? dt : -dt) * 2.5, 0, 1);
    const pitch = Math.atan2((me.y || 0) + 1.1 - (B.position.y + 1.45), Math.max(1, d));
    o.wield?.update(dt, { how: o.aim > .3 ? 'aim' : 'ready', pitch });
    if (B.face && (o.lookT = (o.lookT || 0) - dt) <= 0) { o.lookT = .5; B.face.look(d < 20 ? { x: me.x, y: (me.y || 0) + 1.5, z: me.z } : null); }
    if (o.aim >= 1 && (o.fireT -= dt) <= 0) this.fire(o, d);
    // a car driven into them
    if (me.car && me.v > 3 && Math.hypot(me.x - o.x, me.z - o.z) < 1.4) { o.react.hit([me.vx * .5, .5, me.vz * .5], { x: o.x, y: 1, z: o.z }); this.hurt(o, me.v * 4, null, null); law.crime('cop', o); }
    return true;
  }
  // a pull of the trigger at the player: a burst for an SMG; a hit or a miss by the range, the skill, how fast they are going and what is in the way
  fire(o, d) {
    const law = this.law, me = law.me, g = o.gun, B = o.body;
    const from = o.wield ? o.wield.muzzle.clone() : V1.set(o.x, B.position.y + 1.45, o.z).clone();
    o.burst = o.burst > 0 ? o.burst - 1 : (o.kind === 'smg' ? 2 : 0);
    o.fireT = o.burst > 0 ? 1 / g.rate : (o.kind === 'shotgun' ? 1.4 : .7) + Math.random() * (1.2 - .5 * law.skill);
    const to = { x: me.x, y: (me.y || 0) + (me.car ? 1.05 : 1.2), z: me.z };
    const shots = g.pull(from, norm({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }), true); g.pull(from, { x: 0, y: 0, z: -1 }, false);
    if (!shots.length) return;
    weaponSound(o.kind, 'fire', from); this.view.flash?.(from.x, from.y, from.z, { col: '#ffcf7a', i: 6, reach: 4, life: .06 });
    this.shotAt(o, from, to, d, shots[0].damageAt(d) * (o.kind === 'shotgun' ? 4 : 1), o.kind);
  }
  // one shot at the player: hit by chance (closer, slower, a better skill: more likely), unless something solid is in the way
  shotAt(by, from, to, d, damage, kind) {
    const law = this.law, me = law.me;
    const chance = clamp((.32 + .3 * law.skill) * (1 - d / 70) * (me.v > 4 ? .55 : 1) * (me.car ? .8 : 1), .04, .75);
    const blocked = this.blocked(from, to);
    const hit = !blocked && Math.random() < chance;
    const miss = hit ? to : blocked || { x: to.x + (Math.random() - .5) * 2.2, y: to.y + (Math.random() - .5) * 1.2, z: to.z + (Math.random() - .5) * 2.2 };
    law.emit('shot', { by, from, to: miss, dir: norm({ x: miss.x - from.x, y: miss.y - from.y, z: miss.z - from.z }), hit, damage: hit ? damage : 0, kind });
    if (!law.seen) law.seenNow(me);
  }
  // what stands between two points: the city's buildings, and with a World3D whatever is solid in it (not the player's own body)
  blocked(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1;
    const c = this.city.ray(a, { x: dx, y: dy, z: dz }, d - .5); if (c) return { x: a.x + dx / d * c.dist, y: a.y + dy / d * c.dist, z: a.z + dz / d * c.dist };
    const w = this.world, mine = this.law.me?.body;
    if (w?.ray) { const h = w.ray(a, { x: dx / d, y: dy / d, z: dz / d }, d - .6, t => t !== mine && t?.owner !== mine && t?.tag !== 'person'); if (h) return h.point || null; }
    return null;
  }
  lineTo(o, me) { return !this.blocked({ x: o.x, y: 1.5, z: o.z }, { x: me.x, y: (me.y || 0) + 1.2, z: me.z }); }
  /** An officer hit (by the player's shot, a car, a blast): health off, a flinch, a stagger or down by how hard. */
  hurt(o, damage, at = null, from = null) {
    if (!o.health || !o.alive) return o;
    o.health.hurt(damage, { from, at });
    const k = clamp(damage / 25, .2, 2.5), dir = from && at ? norm({ x: at.x - from.x, y: 0, z: at.z - from.z }) : { x: -Math.sin(o.heading || 0), y: 0, z: -Math.cos(o.heading || 0) };
    const point = at || { x: o.x, y: 1.2, z: o.z };
    if (!o.alive) o.react.fall([dir.x * k * 1.5, .3, dir.z * k * 1.5], { limp: true });
    else o.react.hit([dir.x * k, .1, dir.z * k], point);
    if (this.squad) this.squad.hurt(o);
    return o;
  }

  /* ---------- the helicopter ---------- */

  helicopter(dt) {
    const law = this.law, me = law.me;
    if (!this.heliModel) return;
    const want = law.stars >= 3;
    if (!this.heli && want && (this.heliT -= dt) <= 0) this.callHeli();
    const H = this.heli; if (!H) { this.light(null); return; }
    H.leave = !want; if (H.leave) H.arrived = false;   // (called back if the stars rise again on its way off)
    H.t += dt;
    const c = H.craft, q = c.pos, d = Math.hypot(q.x - me.x, q.z - me.z);
    if (!H.down && (H.model.wrecked || H.model.engine < .6)) { H.down = true; H.model.siren?.(false); law.emit('heli down', H); H.mind?.feel(1); }
    if (H.down) {
      c.update(dt, {}); this.light(null);
      if (c.crashed && (H.lie = (H.lie || 0) + dt) > 30) this.dropHeli();
      return;
    }
    // how it closes in (the brain's, now and then), and where that puts it
    if ((H.thinkT -= dt) <= 0) {
      H.thinkT = 1.2 + Math.random() * .6;
      const see = this.see(H, d, true);
      if (H.mind) { H.mind.act(see, 1); H.tactic = H.mind.action || 'close'; } else H.tactic = this.allow(see, this.teach(see));
    }
    if (law.seen && d < 30 && me.v > 8 && (H.felt -= dt) <= 0) { H.felt = 3; H.mind?.feel(.5); }
    // where it heads: the brain's way of closing in, or off when the stars are gone
    const lead = law.know > 0 || law.seen ? me : law.search || law.lastSeen || me;
    let tx = lead.x, tz = lead.z ?? lead.y;
    if (H.leave) { tx = q.x + (q.x - me.x) * 4; tz = q.z + (q.z - me.z) * 4; if (d > 220) { this.dropHeli(); return; } }
    else if (H.tactic === 'ahead') { tx += clamp(me.vx * 3.5, -45, 45); tz += clamp(me.vz * 3.5, -45, 45); }
    else if (H.tactic === 'wide') { const a = H.t * .18 + H.seed; tx += Math.cos(a) * 42; tz += Math.sin(a) * 42; }
    else { tx -= Math.sin(me.heading) * 10; tz -= Math.cos(me.heading) * 10; }
    const gx = tx - q.x, gz = tz - q.z, gd = Math.hypot(gx, gz), ux = gd > .5 ? gx / gd : 0, uz = gd > .5 ? gz / gd : 0;
    // high enough over the roofs under it and on its way there (so it climbs before a tower, not into it)
    const city = this.city, G = city.ground ? (x, z) => city.ground(x, z) || 0 : null;
    let roof = 0; if (G) { roof = G(q.x, q.z); const far = Math.min(gd, 60); for (let k = 12; k <= far; k += 12) roof = Math.max(roof, G(q.x + ux * k, q.z + uz * k)); }
    H.roof = Math.max(roof, (H.roof || 0) - dt * 4);
    const alt = Math.max(32 + 5 * Math.sin(H.t * .23), H.roof + 15);
    // the stick: towards there (as fast as the gap asks), climbing to its height, its nose to the player
    const sp = Math.min(1, gd / 30), wx = ux * sp, wz = uz * sp;
    const s = Math.sin(c.heading), co = Math.cos(c.heading);
    let x = wx * co + wz * s, y = wx * s - wz * co; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    const faceTo = Math.atan2(me.x - q.x, -(me.z - q.z)), yaw = clamp(wrap(faceTo - c.heading) * 1.5, -1, 1);
    const clear = clamp((q.y - H.roof - 2) / 8, .2, 1);   // (near a roof's height: up first, slowing on until clear)
    x *= clear; y *= clear;
    c.update(dt, { x, y, up: clamp((alt - q.y) * .3, -1, 1), yaw: H.leave ? 0 : yaw });
    if (!H.arrived && d < 70) H.arrived = true;
    // its light on the player (or on the search) by night
    this.light(H, lead);
    H.model.siren?.(true);
  }
  callHeli() {
    const law = this.law, me = law.me, a = Math.random() * Math.PI * 2, at = { x: me.x + Math.cos(a) * 160, y: 42, z: me.z + Math.sin(a) * 160 };
    at.y = Math.max(at.y, (this.city.ground?.(at.x, at.z) || 0) + 15);   // (never inside a tower)
    const model = this.heliModel; model.visible = true; model.position.set(at.x, at.y, at.z);
    const craft = new Hover({ at, heading: Math.atan2(me.x - at.x, -(me.z - at.z)), speed: 22, climb: 7, accel: 5, turn: 1.2, vehicle: model, ground: (x, z) => this.city.ground?.(x, z) ?? 0 });
    if (model.health < 1 || model.wrecked) model.mend?.();
    const H = { model, craft, mind: this.wave?.mind() || null, tactic: 'close', thinkT: 0, felt: 0, t: 0, seed: a, arrived: false, down: false, leave: false, pilot: null, air: true };
    if (this.crew && this.law.cops) { const p = this.law.cops[0].twin(); model.putIn(p, 'pilot'); H.pilot = p; }
    this.heli = H; this.heliT = 25;
    law.emit('heli', H);
    return H;
  }
  dropHeli(now = false) {
    const H = this.heli; if (!H) return; this.heli = null;
    H.mind?.done(); if (H.pilot) { H.model.takeOut?.(H.pilot); H.pilot.removeFromParent(); }
    H.craft.rider?.remove?.(); H.model.visible = false; H.model.siren?.(false);
    if (H.down || H.model.wrecked) H.model.mend?.();
    this.heliT = now ? 0 : 40; this.light(null);
  }
  // the searchlight on a point by night: the lamp for the city's lamps, and the beam
  light(H, at = null) {
    const L = this.lamp, night = this.city.night || 0, list = this.city.indoor;
    const on = !!(H && at && night > .05);
    if (list && !on) { const i = list.indexOf(L); if (i >= 0) list.splice(i, 1); }
    if (this.beam) this.beam.visible = on;
    if (!on) { L.i = 0; return; }
    const sp = H.model.points.spot || H.model, p = sp.getWorldPosition(new Vector3()), gy = this.city.ground?.(at.x, at.z ?? at.y, (at === this.law.me ? at.y || 0 : 0) + 1) || 0;
    const dx = at.x - p.x, dy = gy - p.y, dz = (at.z ?? at.y) - p.z, l = Math.hypot(dx, dy, dz) || 1;
    Object.assign(L, { x: p.x, y: p.y - .3, z: p.z, i: 60 * night, reach: l + 25 }); L.dir[0] = dx / l; L.dir[1] = dy / l; L.dir[2] = dz / l;
    if (!(this.city.indoor ||= []).includes(L)) this.city.indoor.push(L);   // (lit with the city's lamps: Interiors gives the city a new list each frame, so it goes in again)
    const B = this.beam;
    B.position.copy(p); B.scale.set(Math.tan(L.angle) * l, l, Math.tan(L.angle) * l); B.quaternion.setFromUnitVectors(V1.set(0, -1, 0), new Vector3(dx / l, dy / l, dz / l));
    B.material.opacity = .03 * night;
  }

  /* ---------- the boats ---------- */

  launches(dt) {
    const law = this.law, me = law.me;
    if (!this.boatModels) return;
    const want = law.stars && this.wet ? Math.min(this.boatModels.length, Math.ceil(law.stars / 2)) : 0;
    const live = this.boats.filter(b => !b.leave && !b.down);
    if (live.length < want && (this.boatT -= dt) <= 0) { this.boatT = 6; this.callBoat(); }
    for (const b of [...this.boats]) {
      if (!law.stars || this.dryT > 16) b.leave = true;
      this.boat(b, dt);
    }
  }
  callBoat() {
    const law = this.law, me = law.me, model = this.boatModels.find(m => !this.boats.some(b => b.model === m)); if (!model) return null;
    // somewhere on open water 70 to 130 metres off, out of sight if it can be, deep enough to float
    let at = null;
    for (let i = 0; i < 24 && !at; i++) {
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 60, x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r, w = this.waterOf.waterAt(x, z, 0);
      if (!(w.y > -Infinity)) continue;
      if (i < 16 && this.waterOf.waterAt(x + 4, z, 0).y === -Infinity) continue;   // (not right at the edge)
      at = { x, y: w.y, z };
    }
    if (!at) return null;
    if (model.health < 1 || model.wrecked) model.mend?.();
    model.visible = true;
    const craft = new Boat({ at, heading: Math.atan2(me.x - at.x, -(me.z - at.z)), power: 9, top: 19, turn: 1.3, vehicle: model, world: this.world, water: { height: (x, z) => this.waterOf.waterAt(x, z, 0).y } });
    const b = { model, craft, mind: this.wave?.mind() || null, tactic: 'close', thinkT: 0, felt: 0, t: 0, leave: false, down: false, crew: [], fireT: 2, air: false };
    if (this.crew && this.law.cops) { const p = this.law.cops[(this.boats.length + 1) % this.law.cops.length].twin(); model.putIn(p, 'helm'); b.crew.push(p); }
    model.siren?.(true);
    this.boats.push(b); law.emit('boat', b);
    return b;
  }
  boat(b, dt) {
    const law = this.law, me = law.me, c = b.craft, d = Math.hypot(c.x - me.x, c.z - me.z);
    b.t += dt;
    if (!b.down && (b.model.wrecked || b.model.sinking > .2)) { b.down = true; b.model.siren?.(false); law.emit('boat down', b); b.mind?.feel(1); }
    if (b.down) { c.update(dt, {}); if (c.sunk || b.t > 300) this.dropBoat(b); return; }
    if ((b.thinkT -= dt) <= 0) {
      b.thinkT = .9 + Math.random() * .5;
      const see = this.see(b, d, false);
      if (b.mind) { b.mind.act(see, 1); b.tactic = b.mind.action || 'close'; } else b.tactic = this.allow(see, this.teach(see));
    }
    if (law.seen && d < 18 && me.v > 6 && (b.felt -= dt) <= 0) { b.felt = 3; b.mind?.feel(.6); }
    let tx = me.x, tz = me.z, keep = 9, full = false;
    if (b.leave) { tx = c.x + (c.x - me.x) * 3; tz = c.z + (c.z - me.z) * 3; keep = 0; if (d > 150) { this.dropBoat(b); return; } }
    else if (!this.wet) {
      // Player went ashore: patrol offshore at the nearest wet point instead of driving onto land
      const ux = (c.x - me.x) / (d || 1), uz = (c.z - me.z) / (d || 1);
      for (let off = 12; off <= Math.max(24, d); off += 6) {
        const px = me.x + ux * off, pz = me.z + uz * off;
        if (this.waterOf.waterAt(px, pz, 0).y > -Infinity) { tx = px; tz = pz; break; }
      }
      keep = 16;
    }
    else if (b.tactic === 'ahead') { tx += clamp(me.vx * 4, -40, 40); tz += clamp(me.vz * 4, -40, 40); keep = 4; }
    else if (b.tactic === 'wide') keep = 26;
    else if (b.tactic === 'ram') { keep = 0; full = true; }
    const gd = Math.hypot(tx - c.x, tz - c.z), want = Math.atan2(tx - c.x, -(tz - c.z)), turn = wrap(want - c.heading);
    let throttle = full ? 1 : gd > keep + 6 ? 1 : gd > keep ? .35 : -.3;
    let steer = clamp(turn * 1.6, -1, 1);
    if (Math.abs(turn) > 2.2 && gd < 15) throttle = -.4;
    // Shore avoidance: reverse and steer back into open water if dry land lies right ahead of the bow
    const fwd = c.forward, probe6 = this.waterOf.waterAt(c.x + fwd.x * 6, c.z + fwd.z * 6, 0).y, probe10 = this.waterOf.waterAt(c.x + fwd.x * 10, c.z + fwd.z * 10, 0).y;
    if (probe6 === -Infinity || probe10 === -Infinity) {
      throttle = probe6 === -Infinity ? -.45 : .15;
      const lx = Math.sin(c.heading - 1.1), lz = -Math.cos(c.heading - 1.1), rx = Math.sin(c.heading + 1.1), rz = -Math.cos(c.heading + 1.1);
      const wetL = this.waterOf.waterAt(c.x + lx * 10, c.z + lz * 10, 0).y > -Infinity;
      const wetR = this.waterOf.waterAt(c.x + rx * 10, c.z + rz * 10, 0).y > -Infinity;
      steer = wetL && !wetR ? -1 : wetR && !wetL ? 1 : (turn >= 0 ? 1 : -1);
    }
    c.update(dt, { throttle, steer });
    if (c.crash && c.crash.speed > 3) { b.model.hit?.(c.crash.point || c.pos, { power: c.crash.speed / 8 }); if (c.crash.thing === me.body || c.crash.thing?.owner === me.body) law.crime('cop', me, { weight: 0 }); }
    // the crew shoot from three stars, when they can see you
    if (law.stars >= 3 && d < 45 && (b.fireT -= dt) <= 0) {
      b.fireT = .45 + Math.random() * (1.3 - .5 * law.skill);
      const from = (b.model.points.deck || b.model.points.helm).getWorldPosition(new Vector3()); from.y += 1.4;
      const to = { x: me.x, y: (me.y || 0) + 1, z: me.z };
      if (!this.blocked(from, to)) { weaponSound('smg', 'fire', from); this.view.flash?.(from.x, from.y, from.z, { col: '#ffcf7a', i: 6, reach: 4, life: .06 }); this.shotAt(b, from, to, d, 12, 'smg'); }
    }
  }
  dropBoat(b, now = false) {
    const i = this.boats.indexOf(b); if (i >= 0) this.boats.splice(i, 1);
    b.mind?.done(); for (const p of b.crew) { b.model.takeOut?.(p); p.removeFromParent(); } b.crew.length = 0;
    b.craft.rider?.remove?.(); b.model.visible = false; b.model.siren?.(false);
    if (b.down || b.model.wrecked) b.model.mend?.();
    if (!now) this.boatT = 12;
  }

  /* ---------- the support brain ---------- */

  // what the helicopter's or a boat's mind sees: [distance, ahead of the player, player's speed, stars, in the air, seen, how sure the turn guess is]
  see(u, d, air) {
    const me = this.law.me, p = air ? u.craft.pos : u.craft, ux = p.x - me.x, uz = p.z - me.z, l = Math.hypot(ux, uz) || 1;
    const ahead = (ux * Math.sin(me.heading) + uz * Math.cos(me.heading)) / l;
    return [clamp(d / 100, 0, 1.5), ahead, clamp(me.v / 30, 0, 1.5), this.law.stars / 5, air ? 1 : -1, this.law.seen ? 1 : -1, this.law.turns?.sure ?? 0];
  }
  // the rules they start from: the helicopter goes ahead of a fast player and sits over a slow one; a boat comes in
  // close, goes ahead of one it is behind, rams at three stars when close and fast, and hangs back once there are two
  teach(see) {
    const d = see[0] * 100, ahead = see[1], speed = see[2] * 30, stars = see[3] * 5, air = see[4] > 0, seen = see[5] > 0;
    if (air) return !seen || d > 80 ? 'close' : speed > 12 ? 'ahead' : stars >= 5 && speed < 3 ? 'wide' : 'close';
    if (d > 60 || !seen) return 'close';
    if (stars >= 3 && d < 22 && speed > 5) return 'ram';
    if (ahead < -.3 && speed > 8 && d > 25) return 'ahead';
    if (this.boats.length > 1 && ahead > .3) return 'wide';
    return 'close';
  }
  // what they may never do: a helicopter never rams; a boat rams only at three stars
  allow(see, a) {
    if (a === 'ram' && (see[4] > 0 || see[3] * 5 < 3)) return 'close';
    return a;
  }
}
Force.ids = 0;
const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };

/**
 * The player's shot (from, dir: a direction in the world), against what the police have out: an officer (their body:
 * a head shot hurts twice), the helicopter or a boat. What it hits is hurt (damage), unless the city's buildings or the
 * game's World3D stop the shot first. Returns { kind: 'officer' | 'helicopter' | 'boat', target, point, d, head } or null.
 */
export function shootAt(force, from, dir, { damage = 22, range = 120 } = {}) {
  const law = force.law, d = norm(dir); let best = null;
  const near = (t, kind, target, point, extra = {}) => { if (t > 0 && t < range && (!best || t < best.d)) best = { kind, target, point, d: t, ...extra }; };
  for (const o of law.officers) {   // an upright body: its middle from the knees to the head, a little over a third of a metre round
    if (o.gone || (o.alive === false)) continue;
    const by = o.body.position.y, px = o.x - from.x, pz = o.z - from.z, a = d.x * d.x + d.z * d.z, t = (px * d.x + pz * d.z) / (a || 1);
    const cx = from.x + d.x * t - o.x, cz = from.z + d.z * t - o.z, y = from.y + d.y * t - by;
    if (cx * cx + cz * cz < .14 && y > .45 && y < 1.85) near(t * Math.sqrt(a + d.y * d.y), 'officer', o, { x: from.x + d.x * t, y: from.y + d.y * t, z: from.z + d.z * t }, { head: y > 1.55 });
  }
  const ball = (kind, u, c, r) => { const px = c.x - from.x, py = c.y - from.y, pz = c.z - from.z, t = px * d.x + py * d.y + pz * d.z, q = px * px + py * py + pz * pz - t * t; if (q < r * r) { const tt = t - Math.sqrt(r * r - q); near(tt, kind, u, { x: from.x + d.x * tt, y: from.y + d.y * tt, z: from.z + d.z * tt }); } };
  const H = force.heli; if (H && !H.down) ball('helicopter', H, H.model.position.clone().add(V1.set(0, 1.3, 0)), 1.6);
  for (const b of force.boats) if (!b.down) ball('boat', b, b.model.position.clone().add(V1.set(0, 1, 0)), Math.min(2.6, b.model.size.width * .55 + .4));
  if (!best) return null;
  const wall = force.blocked(from, best.point); if (wall) return null;
  if (best.kind === 'officer') { force.hurt(best.target, damage * (best.head ? 2 : 1), best.point, from); law.crime('cop', best.point); }
  else { const m = best.target.model; m.harm?.(damage / 700); if (best.kind === 'helicopter' && m.engine < .75) best.target.mind?.feel(.5); law.crime('cop', best.point); }
  return best;
}
