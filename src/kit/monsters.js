// Monsters (Rob's fantasy RPG pick 11, 2026-11-15): what a monster fights with, how it takes a hit, and bosses that
// change as they weaken. A Moveset is a monster's attacks as data (a bite, a claw, a tail sweep, a stomp, a charge, a
// pounce, breath, a roar...), each with a wind-up you can see coming (the telegraph: draw `moves.now.shape`), a moment
// it hurts and a recovery to punish; it picks what fits where you stand and walks in between. Hurt makes a gs.models
// creature (or anything on a gs.poses Rig) flinch away from a hit, stagger back, get knocked off its feet and back up,
// and fall dead. Boss splits a fight into phases by health (new attacks, faster, a roar between), with a poise meter
// that breaks into a stagger and an enrage timer. 2D or 3D: leave out z for the flat. The kit says who was hit and
// for how much; your game decides what that means and draws the warnings.
//
//   const { Moveset, Hurt, Boss, ATTACKS } = gs.monsters;
//   make() { wolf = gs.models.creature({ like: 'wolf' }); }
//   reset() {
//     stats = new gs.stats.Stats({ hp: { max: 300 }, speed: 4 });
//     moves = new Moveset(wolf, { attacks: ['bite', 'claw', 'pounce'], radius: .6, stats });
//     hurt = new Hurt(wolf, { ground: () => 0 });
//   }
//   update(dt) {
//     const o = moves.update(dt, hero, [hero]);             // what to do, and who it hit
//     if (!hurt.busy) { wolf.position.x += o.walk.x * stats.get('speed') * dt; ...; wolf.rotation.y = o.face; }
//     if (o.pose) wolf.rig.play(o.pose.name, { at: o.pose.at }).update(dt); else wolf.move(dt, o.speed * stats.get('speed'));
//     hurt.update(dt);                                          // after the rig: flinches, staggers, falls
//     for (const h of o.hits) feel.hit(...);
//   }
//   when the hero hits it: hurt.hit(push, { power: .5 }); moves.hurt(power)
//   draw: moves.now ({ attack, phase: 'windup' | 'active' | 'recover', part, shape: { x, z, dir, radius, angle, kind } })

const TAU = Math.PI * 2, PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { a = (a + PI) % TAU; return a < 0 ? a + TAU - PI : a - PI; };
const posOf = t => { const b = typeof t === 'function' ? t() : t; return b?.pos ?? b?.position ?? b; };
const yawOf = b => b?.rotation?.y ?? b?.yaw ?? b?.angle ?? 0;
// the flat plane: x and z in 3D, x and y in 2D
const flat = p => p.z == null;
const pz = p => flat(p) ? p.y : p.z;
// which way a yaw faces: 3D about y from +z; 2D from +x
const dirOf = (a, f2) => f2 ? [Math.cos(a), Math.sin(a)] : [Math.sin(a), Math.cos(a)];
const yawTo = (dx, dz, f2) => f2 ? Math.atan2(dz, dx) : Math.atan2(dx, dz);

/**
 * Attacks to start from (copy and change them, or write your own). Times in seconds: windup (the telegraph), active
 * (when it hurts), recover (the opening). shape: 'cone' (reach, angle: its half width), 'circle' (radius, ahead: how
 * far in front its middle is), 'ring' (radius, inner), 'rear' (a cone behind), 'line' (a dash: it moves `dash` metres
 * and hits what it runs into). range: [nearest, furthest] it is picked from; side: 'front' | 'back' | 'any'.
 * damage, push (metres a second), up (a toss), status (a gs.stats buff id), element, cool (seconds before it is
 * picked again), weight (how often), track (radians a second it can still turn while winding up), pose (the rig's
 * pose name and the part of it each phase plays: [windupStart, active, recoverEnd]), spin (radians turned while it
 * hurts: a tail sweep), leap (a pounce: how high), every (it hurts again each `every` while active: breath),
 * spell (cast this gs.magic spell at the target instead, from the Moveset's unit), hpBelow (only under this share).
 */
export const ATTACKS = Object.freeze({
  bite: { shape: 'cone', reach: 1.1, angle: .55, range: [0, 1.3], windup: .45, active: .12, recover: .45, damage: 12, push: 2, cool: .8, weight: 3, track: 3, pose: ['attack', 0, .25, .5] },
  claw: { shape: 'cone', reach: 1.4, angle: .9, range: [0, 1.5], windup: .55, active: .15, recover: .5, damage: 15, push: 3.5, cool: 1.5, weight: 2, track: 2.5, pose: ['attack', 0, .25, .5] },
  swipe: { shape: 'cone', reach: 2.2, angle: 1.4, range: [0, 2.2], windup: .8, active: .2, recover: .7, damage: 18, push: 6, cool: 3, weight: 1.5, track: 1.5, pose: ['attack', 0, .25, .5] },
  tail: { shape: 'rear', reach: 2.4, angle: 1.2, range: [0, 2.4], side: 'back', windup: .6, active: .25, recover: .6, damage: 16, push: 7, cool: 3, weight: 4, track: 0, spin: 0, pose: ['attack', 0, .25, .5] },
  sweep: { shape: 'ring', radius: 2.6, inner: 0, range: [0, 2.6], side: 'any', windup: .7, active: .35, recover: .8, damage: 14, push: 6, cool: 6, weight: 1, track: 0, spin: TAU, pose: ['attack', 0, .25, .5] },
  stomp: { shape: 'circle', radius: 2.4, ahead: 0, range: [0, 2.2], side: 'any', windup: .9, active: .1, recover: .9, damage: 20, push: 5, up: 3, status: 'slow', cool: 7, weight: 1, track: 0, pose: ['attack', 0, .25, .5] },
  slam: { shape: 'circle', radius: 1.4, ahead: 1.6, range: [.5, 2.8], windup: 1.0, active: .1, recover: 1.1, damage: 30, push: 7, up: 4, cool: 5, weight: 1.5, track: 1.2, pose: ['attack', 0, .25, .5] },
  charge: { shape: 'line', width: 1.2, dash: 8, range: [4, 12], windup: .9, active: .55, recover: .9, damage: 22, push: 9, up: 2, cool: 6, weight: 2, track: 2, pose: ['run', 0, 0, 0] },
  pounce: { shape: 'circle', radius: 1.1, ahead: 0, dash: 5, leap: 1.2, range: [2.5, 6], windup: .5, active: .45, recover: .6, damage: 16, push: 5, cool: 4, weight: 2, track: 3, pose: ['jump', 0, 0, 0] },
  breath: { shape: 'cone', reach: 6, angle: .4, range: [1.5, 6], windup: 1.0, active: 1.6, recover: .8, damage: 5, every: .25, element: 'fire', status: 'burn', cool: 9, weight: 1.5, track: .8, pose: ['attack', 0, .22, .5] },
  spit: { shape: 'none', range: [3, 14], windup: .6, active: .1, recover: .5, damage: 10, cool: 3, weight: 1.5, track: 3, shoot: { speed: 14, size: .2 }, pose: ['attack', 0, .25, .5] },
  roar: { shape: 'circle', radius: 5, ahead: 0, range: [0, 8], side: 'any', windup: .5, active: .9, recover: .5, damage: 0, push: 2, status: 'slow', cool: 14, weight: .6, track: 0, pose: ['attack', 0, .25, .5] },
});

/**
 * A monster's attacks. body: what it is (an Object3D such as a gs.models.creature, or { x, y, z, yaw }). attacks: names
 * from ATTACKS or { name, ...spec } (or both: { name: 'bite', damage: 30 }). radius (its own size), reach (how close it
 * likes to get before it bites: from its attacks by default), keep (a distance it holds off at: a spitter),
 * rest ([min, max] seconds between attacks), skill (0..1, or a gs.brains Dial: windups are shorter and it rests less
 * as it rises), stats (a gs.stats Stats: its 'power' scales damage, 'speed' its walk is yours to use, and a stun or
 * 'stunned' tag holds it), unit (a gs.magic unit for attacks with a spell), rng.
 */
export class Moveset {
  constructor(body, { attacks = ['bite'], radius = .6, reach = null, keep = 0, rest = [.4, 1.2], skill = .5, stats = null, unit = null, rng = Math.random, apply = true } = {}) {
    this.body = body; this.radius = radius; this.keep = keep; this.rest = rest; this.skill = skill; this.stats = stats; this.unit = unit; this.rng = rng; this.apply = apply;
    this.set(attacks); this.reach = reach ?? Math.max(.8, Math.min(...this.list.filter(a => a.shape !== 'none' && !a.dash).map(a => (a.range?.[1] ?? 1.5) * .8).concat([1.5])));
    this.cools = {}; this.now = null; this.wait = rest[0]; this.face = yawOf(body); this.handlers = {}; this.stun = 0; this.mul = 1; this.hits = [];
  }
  /** Changes what it can do (a boss's next phase): names or specs, as in the constructor. */
  set(attacks) {
    this.list = attacks.map(a => { const name = typeof a === 'string' ? a : a.name, base = ATTACKS[name] || {}; if (!ATTACKS[name] && typeof a === 'string') throw new Error(`gs.monsters: no attack '${a}' (write it as { name, shape, ... })`); return { name, ...base, ...(typeof a === 'object' ? a : {}) }; });
    return this;
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, e) { for (const f of this.handlers[ev] || []) f(e); }
  get pos() { return posOf(this.body); }
  get k() { return clamp(isFinite(+this.skill) ? +this.skill : .5, 0, 1); }
  /** Can it start this one now, against a target? true or why not ('busy', 'cooling', 'range', 'side', 'health'). */
  can(name, target = null) {
    const a = this.list.find(x => x.name === name); if (!a) return 'unknown';
    if (this.now) return 'busy'; if ((this.cools[name] || 0) > 0) return 'cooling';
    if (a.hpBelow != null && this.stats?.pools?.hp && this.stats.part('hp') > a.hpBelow) return 'health';
    if (target) { const r = this.rel(target); if (r.d < (a.range?.[0] ?? 0) || r.d > (a.range?.[1] ?? 2) + (target.radius || 0)) return 'range'; const side = a.side || 'front'; if (side === 'front' && Math.abs(r.ang) > 1.2) return 'side'; if (side === 'back' && Math.abs(r.ang) < 1.9) return 'side'; }
    return true;
  }
  // where a target is from here: distance (edge to edge), its angle off where we face, and the yaw towards it
  rel(t) {
    const p = this.pos, q = posOf(t.body ?? t) || t, f2 = flat(p), dx = q.x - p.x, dz = pz(q) - pz(p), d = Math.hypot(dx, dz), yaw = yawTo(dx, dz, f2);
    return { d: Math.max(0, d - this.radius - (t.radius || 0)), raw: d, yaw, ang: wrapA(yaw - this.face), dx, dz };
  }
  /** Starts an attack now (skips the choosing). */
  start(name, target = null) {
    const a = this.list.find(x => x.name === name); if (!a) throw new Error(`gs.monsters: no attack '${name}' in this set`);
    const k = this.k, wind = a.windup * (1.25 - .45 * k) / this.mul;   // (a kinder monster shows its hand longer)
    this.now = { attack: a, name, phase: 'windup', t: 0, part: 0, of: { windup: wind, active: a.active / this.mul, recover: a.recover * (1.2 - .4 * k) / this.mul }, hit: new Set(), next: 0, target, face0: this.face, moved: 0, shape: null };
    this.shape(); this.emit('start', this.now); return this.now;
  }
  /** Stops what it is doing (a stagger, a stun): an attack winding up is lost. */
  stop(why = 'stopped') { if (!this.now) return false; const n = this.now; this.now = null; this.wait = this.rest[0]; this.emit('stop', { ...n, why }); return true; }
  /** It was hit: power 0..1. A hard enough hit (over its `poise`, .45 by default) breaks a windup. */
  hurt(power = .5, { poise = .45 } = {}) { if (this.now?.phase === 'windup' && power >= poise && !this.now.attack.armour) { this.stop('hurt'); return true; } return false; }
  /** Holds it still for seconds (a stun, a stagger). */
  stunFor(s) { this.stun = Math.max(this.stun, s); this.stop('stunned'); }
  // the area it hurts in now, for the hits and for your telegraph: { x, z, dir (yaw), radius, angle, inner, width, kind }
  shape() {
    const n = this.now; if (!n) return null; const a = n.attack, p = this.pos, f2 = flat(p), [fx, fz] = dirOf(this.face, f2);
    const s = { kind: a.shape, flat: f2, dir: this.face, x: p.x, z: pz(p), y: f2 ? 0 : p.y, radius: (a.reach ?? a.radius ?? 1.5) + (a.shape === 'cone' || a.shape === 'rear' ? this.radius : 0), angle: a.angle ?? .6, inner: a.inner ?? 0, width: a.width ?? 1, part: n.part, phase: n.phase };
    if (a.shape === 'circle') { s.radius = a.radius ?? 1.5; s.x += fx * (a.ahead || 0); s.z += fz * (a.ahead || 0); }
    if (a.shape === 'rear') { s.dir = wrapA(this.face + PI); }
    if (a.shape === 'line') { s.radius = n.phase === 'windup' ? (a.dash || 6) : this.radius + .3; s.width = a.width ?? 1.2; }
    return n.shape = s;
  }
  /**
   * Thinks, moves the attack on and hits. target: the one it is after (an Object3D, { x, y, z }, or { body, radius }),
   * targets: who can be hurt (the same shapes; each with radius, stats (hp comes off), react (gs.characters.Reactions
   * or a Hurt: shoved), blocks(attack, from) => true when guarded, dodging: true when it can't be touched).
   * Returns { walk: { x, z } (a direction times how much it wants to go, 0..1; y in 2D), speed (0..1), face (the yaw
   * to turn to), pose ({ name, at }: the rig pose for the attack, or null), move ({ x, y, z }: metres it moves itself
   * this frame in a dash or a leap: add it to its position), attack (now), hits ([{ who, attack, damage, push, at,
   * blocked }]), shots ([{ from, dir, speed, size, attack }] from a spit with no spell) }.
   */
  update(dt, target = null, targets = target ? [target] : []) {
    const out = this.out = { walk: { x: 0, y: 0, z: 0 }, speed: 0, face: this.face, pose: null, move: { x: 0, y: 0, z: 0 }, attack: null, hits: [], shots: [] };
    this.lastDt = dt; for (const k in this.cools) this.cools[k] -= dt;
    const st = this.stats, held = st?.is?.('stunned') || st?.is?.('frozen');
    if (this.stun > 0 || held) { this.stun -= dt; if (this.now) this.stop('stunned'); return out; }
    this.mul = st ? Math.max(.25, (st.get('attackSpeed') || 1)) : 1;
    const p = this.pos, f2 = flat(p);
    if (!this.now) {
      if (!target) return out;
      const r = this.rel(target);
      // turn to it, and close in (or hold off)
      this.face = turnTo(this.face, r.yaw, 4 * dt); out.face = this.face;
      const want = this.keep > 0 ? (r.d < this.keep * .8 ? -1 : r.d > this.keep * 1.2 ? 1 : 0) : r.d > this.reach ? 1 : 0;
      if (want) { const [dx, dz] = [r.dx / (r.raw || 1), r.dz / (r.raw || 1)], go = want * clamp((Math.abs(r.d - (this.keep || this.reach)) + .3) / 1.5, .3, 1); out.walk.x = dx * go; if (f2) out.walk.y = dz * go; else out.walk.z = dz * go; out.speed = Math.abs(go); }
      this.wait -= dt;
      if (this.wait <= 0) {
        const ok = this.list.filter(a => (a.weight ?? 1) > 0 && this.can(a.name, target) === true), sum = ok.reduce((s, a) => s + (a.weight ?? 1), 0);
        if (ok.length) { let x = this.rng() * sum, pick = ok[0]; for (const a of ok) { x -= a.weight ?? 1; if (x <= 0) { pick = a; break; } } this.start(pick.name, target); }
      }
      if (!this.now) return out;
    }
    // the attack under way
    const n = this.now, a = n.attack; n.t += dt; out.attack = n;
    if (n.phase === 'windup') {
      if (a.track && n.target) { const r = this.rel(n.target); this.face = turnTo(this.face, r.yaw, a.track * dt); }
      if (n.t >= n.of.windup) { n.phase = 'active'; n.t -= n.of.windup; n.face0 = this.face; this.emit('active', n); this.go(n, out); }
    }
    if (n.phase === 'active') {
      const k = n.of.active > 0 ? Math.min(1, n.t / n.of.active) : 1;
      if (a.spin) this.face = wrapA(n.face0 + a.spin * k);
      if (a.dash) {   // a charge or a pounce carries it along
        const [fx, fz] = dirOf(this.face, f2), step = (a.dash / Math.max(.05, n.of.active)) * dt * (n.t <= n.of.active + dt ? 1 : 0), m = Math.min(step, a.dash - n.moved); n.moved += m;
        out.move.x = fx * m; if (f2) out.move.y = fz * m; else { out.move.z = fz * m; if (a.leap) { const y = n.t >= n.of.active ? 0 : a.leap * curve(k); out.move.y = y - (n.lift || 0); n.lift = y; } }
      }
      this.shape(); this.strike(n, targets, out);
      if (n.t >= n.of.active) { n.phase = 'recover'; n.t -= n.of.active; this.emit('recover', n); }
    }
    if (n.phase === 'recover' && n.t >= n.of.recover) { this.cools[a.name] = a.cool ?? 1; this.now = null; const k2 = this.k; this.wait = this.rest[0] + (this.rest[1] - this.rest[0]) * this.rng() * (1.2 - .7 * k2); this.emit('end', n); }
    if (this.now) { const tot = n.of.windup + n.of.active + n.of.recover, at = (n.phase === 'windup' ? n.t : n.phase === 'active' ? n.of.windup + n.t : n.of.windup + n.of.active + n.t); n.part = Math.min(1, at / tot); n.phaseT = n.phase === 'windup' ? n.t / n.of.windup : n.phase === 'active' ? n.t / Math.max(1e-6, n.of.active) : n.t / Math.max(1e-6, n.of.recover); this.shape(); }
    if (a.pose && this.now) { const [name, p0, p1, p2] = a.pose, q = n.phase === 'windup' ? p0 + (p1 - p0) * n.phaseT : n.phase === 'active' ? p1 : p1 + (p2 - p1) * n.phaseT; out.pose = { name, at: ((q % 1) + 1) % 1 }; }
    out.face = this.face;
    return out;
  }
  // the moment it starts to hurt: a spell, or a shot
  go(n, out) {
    const a = n.attack, t = n.target;
    if (a.spell && this.unit) { const ok = this.unit.cast(a.spell, t ? { target: t.unit || undefined, at: t.unit ? undefined : posOf(t.body ?? t) } : {}); if (ok !== true) this.emit('fail', { attack: a, why: ok }); return; }
    if (a.shoot) {
      const p = this.pos, f2 = flat(p), [fx, fz] = dirOf(this.face, f2), from = f2 ? { x: p.x + fx * this.radius, y: p.y + fz * this.radius } : { x: p.x + fx * this.radius, y: p.y + (a.shoot.height ?? .6), z: p.z + fz * this.radius };
      let dir = f2 ? { x: fx, y: fz } : { x: fx, y: 0, z: fz };
      if (t) { const q = posOf(t.body ?? t), dx = q.x - from.x, dy = (f2 ? q.y - from.y : (q.y + (t.height || 1.6) * .5) - from.y), dz = f2 ? 0 : q.z - from.z, l = Math.hypot(dx, dy, dz) || 1; dir = f2 ? { x: dx / l, y: dy / l } : { x: dx / l, y: dy / l, z: dz / l }; }
      out.shots.push({ from, dir, speed: a.shoot.speed ?? 12, size: a.shoot.size ?? .2, attack: a, damage: this.dmg(a), by: this }); this.emit('shoot', out.shots.at(-1));
    }
  }
  dmg(a) { return (a.damage || 0) * (this.stats ? (this.stats.get('power') || 1) : 1); }
  // who is in the shape now (each once a strike; again each `every` for breath)
  strike(n, targets, out) {
    const a = n.attack; if (a.spell || a.shape === 'none') return;
    if (a.every) { n.next -= this.lastDt || 0; if (n.next > 0) return; n.next += a.every; n.hit.clear(); }
    const s = n.shape;
    for (const t of targets) {
      if (!t || n.hit.has(t) || t.dead) continue;
      const q = posOf(t.body ?? t); if (!q) continue;
      if (!inShape(s, q.x, pz(q), t.radius ?? .4)) continue;
      n.hit.add(t);
      if (t.dodging) { this.emit('miss', { who: t, attack: a }); continue; }
      const p = this.pos, f2 = flat(p), dx = q.x - p.x, dz = pz(q) - pz(p), l = Math.hypot(dx, dz) || 1, push = a.push || 0;
      const shove = f2 ? { x: dx / l * push, y: dz / l * push } : { x: dx / l * push, y: a.up || 0, z: dz / l * push };
      const blocked = !!t.blocks?.(a, p);
      const hit = { who: t, attack: a, name: a.name, damage: blocked ? Math.round(this.dmg(a) * (a.chip ?? .15)) : this.dmg(a), push: blocked ? scale(shove, .4) : shove, at: q, blocked, by: this };
      const st = t.stats;
      if (this.apply && st?.pools?.hp && hit.damage > 0 && !st.is?.('invulnerable')) st.change('hp', -hit.damage, 'monster');
      if (this.apply && st && a.status && !blocked) try { st.buff(a.status, st.table?.[a.status] ? null : STATUS_DEFAULTS[a.status] || null); } catch (e) { /* a status the game didn't give it: say so once */ if (!this.warned) { this.warned = true; console.warn('gs.monsters:', e.message); } }
      if (this.apply && t.react && !f2) { if (blocked) t.react.brace?.(); else if (t.react instanceof Hurt) t.react.hit(hit.push, { power: Math.min(1, push / 8) }); else t.react.hit?.(hit.push, { x: q.x, y: q.y + 1, z: q.z }); }
      out.hits.push(hit); this.hits.push(hit); this.emit(blocked ? 'blocked' : 'hit', hit);
    }
  }
}
// (the part of the time a leap has risen: up and down again)
const curve = k => Math.sin(PI * k);
const scale = (v, k) => ({ x: v.x * k, y: v.y * k, ...(v.z == null ? {} : { z: v.z * k }) });
const turnTo = (a, b, most) => { const d = wrapA(b - a); return wrapA(a + clamp(d, -most, most)); };
// what Moveset uses when a target's Stats has no table entry for an attack's status
const STATUS_DEFAULTS = { slow: { for: 3, mul: { speed: .6 }, bad: true, tags: ['slowed'] }, burn: { for: 3, every: .5, drain: { hp: 3 }, bad: true, stacks: 3, stack: 'stack', tags: ['burning'] }, poison: { for: 5, every: 1, drain: { hp: 2 }, bad: true, stacks: 5, stack: 'stack', tags: ['poisoned'] }, stun: { for: 1, bad: true, tags: ['stunned'] } };

/** Is a point (with a radius) in an attack's shape ({ kind, x, z, dir, radius, angle, inner, width })? For your own checks too. */
export function inShape(s, x, z, r = 0) {
  if (!s) return false;
  const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
  if (s.kind === 'circle') return d <= s.radius + r;
  if (s.kind === 'ring') return d <= s.radius + r && d >= (s.inner || 0) - r;
  const f2 = !!s.flat, [fx, fz] = f2 ? [Math.cos(s.dir), Math.sin(s.dir)] : [Math.sin(s.dir), Math.cos(s.dir)];
  if (s.kind === 'cone' || s.kind === 'rear') { if (d > s.radius + r) return false; if (d < r + .2) return true; const c = (dx * fx + dz * fz) / d; return Math.acos(clamp(c, -1, 1)) <= s.angle + Math.atan2(r, d); }
  if (s.kind === 'line') { const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx); return along >= -r && along <= s.radius + r && across <= s.width / 2 + r; }
  return false;
}

/**
 * How a creature takes a hit, on top of whatever its rig is doing (call update(dt) after the rig's own update each
 * frame). creature: a gs.models.creature (or anything with a gs.poses rig: { rig, bones } or an Object3D with .rig).
 * ground(x, z) => height under it (none: it stays at its height), weight (heavier: shoved less; 1 for its size),
 * poise (0..1: how hard a hit has to be to stagger it; .3), sturdy (how hard to knock it down; .7), move (false: you
 * move it yourself; read `slide` metres a second), getUp (seconds it lies down; .9).
 * hit(push, { power, at }): power 0..1 (or worked out from the push): a flinch, a stagger back, knocked down.
 * die(push): it falls dead and stays. state: 'steady' | 'flinch' | 'stagger' | 'down' | 'rising' | 'dead'; busy
 * (true while it can't act: stagger, down, rising, dead); events on('hit' | 'down' | 'up' | 'dead').
 */
export class Hurt {
  constructor(creature, { ground = null, weight = 1, poise = .3, sturdy = .7, move = true, getUp = .9, down = 'dead', flinch = 'hurt' } = {}) {
    this.c = creature; this.rig = creature.rig; this.bones = creature.bones || this.rig?.parts || {}; this.ground = ground; this.weight = weight; this.poise = poise; this.sturdy = sturdy; this.moves = move; this.getUp = getUp;
    this.downPose = down; this.flinchPose = flinch; this.state = 'steady'; this.t = 0; this.slide = { x: 0, y: 0, z: 0 }; this.handlers = {};
    this.springs = { pitch: [0, 0], roll: [0, 0], twist: [0, 0] }; this.over = 0; this.overPose = null; this.hurtW = 0; this.side = 1; this.fell = 0;
    const names = Object.keys(this.bones);
    this.chain = ['spine', 'neck', 'head'].filter(n => names.includes(n)).concat(names.filter(n => /^spine\d|^neck\d/.test(n)));
    this.tail = names.filter(n => /^tail\d*$/.test(n));
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, e) { for (const f of this.handlers[ev] || []) f(e); }
  get busy() { return this.state === 'stagger' || this.state === 'down' || this.state === 'rising' || this.state === 'dead'; }
  get dead() { return this.state === 'dead'; }
  // the push in the creature's own terms: [across (+x its left), back (+z its front)]
  local(push) { const yaw = this.c.rotation?.y || 0, c = Math.cos(yaw), s = Math.sin(yaw); return [push.x * c - push.z * s, push.x * s + push.z * c]; }
  /** A hit. push: { x, y, z } metres a second it is shoved (along the blow); power: 0..1 how hard (none: from the push). */
  hit(push = { x: 0, y: 0, z: 0 }, { power = null } = {}) {
    if (this.state === 'dead') return this;
    const sp = Math.hypot(push.x, push.z || 0), pw = clamp(power ?? sp / 10, 0, 1) / Math.max(.2, this.weight), [lx, lz] = this.local({ x: push.x, z: push.z || 0 });
    // the body jerks away from the blow, the head most
    const k = .6 + 1.4 * pw; this.springs.pitch[1] += lz / (sp || 1) * 9 * k; this.springs.roll[1] += -lx / (sp || 1) * 7 * k; this.springs.twist[1] += lx / (sp || 1) * 6 * k; this.hurtW = Math.min(1, .5 + pw);
    let kind = 'flinch';
    if (this.state === 'down' || this.state === 'rising') kind = 'down';
    else if (pw >= this.sturdy) { kind = 'down'; this.state = 'down'; this.t = 0; this.side = lx >= 0 ? 1 : -1; this.emit('down', { push }); }
    else if (pw >= this.poise) { kind = 'stagger'; this.state = 'stagger'; this.t = 0; }
    else if (this.state === 'steady') { this.state = 'flinch'; this.t = 0; }
    const shove = kind === 'flinch' ? .25 : kind === 'stagger' ? .6 : .9;
    this.slide.x += push.x * shove / this.weight; this.slide.z += (push.z || 0) * shove / this.weight;
    this.emit('hit', { kind, power: pw, push }); return this;
  }
  /** It falls dead (pushed along push) and stays down. */
  die(push = { x: 0, y: 0, z: 0 }) { if (this.state === 'dead') return this; this.hit(push, { power: .2 }); this.state = 'dead'; this.t = 0; const [lx] = this.local({ x: push.x, z: push.z || 0 }); this.side = lx >= 0 ? 1 : -1; this.emit('dead', { push }); return this; }
  /** Back on its feet at once, nothing on it (a new round). */
  reset() { this.state = 'steady'; this.t = 0; this.slide = { x: 0, y: 0, z: 0 }; for (const k in this.springs) this.springs[k] = [0, 0]; this.over = 0; this.hurtW = 0; return this; }
  update(dt) {
    if (!(dt > 0)) return this;
    this.t += dt; const R = this.rig;
    // springs (critically damped: a jerk that settles in about a third of a second)
    for (const s of Object.values(this.springs)) { const w = 14; s[1] += (-w * w * s[0] - 2 * w * s[1]) * dt; s[0] += s[1] * dt; }
    // where the state goes next
    const st = this.state;
    if (st === 'flinch' && this.t > .35) this.state = 'steady';
    if (st === 'stagger' && this.t > .7) this.state = 'steady';
    if (st === 'down' && this.t > .35 + this.getUp) { this.state = 'rising'; this.t = 0; }
    if (st === 'rising' && this.t > .6) { this.state = 'steady'; this.emit('up', {}); }
    // how much of the lying pose: in fast, out slowly
    const want = this.state === 'down' || this.state === 'dead' ? 1 : 0;
    this.over = want ? Math.min(1, this.over + dt / (this.state === 'dead' ? .55 : .3)) : this.state === 'rising' ? Math.max(0, 1 - this.t / .6) : Math.max(0, this.over - dt * 3);
    this.hurtW = Math.max(0, this.hurtW - dt * (this.state === 'stagger' ? 1.4 : 3));
    // pose: the rig's own, then towards lying (and its 'hurt' pose a moment), then the jerk on top
    if (R?.base && R.poses) {
      const cur = R.cur || {}, lay = this.over > 0 && R.poses[this.downPose] ? R.sample(this.downPose, 0) : null, hp = this.hurtW > 0 && R.poses[this.flinchPose] ? R.sample(this.flinchPose, (this.t * 1.2) % 1) : null;
      if (lay || hp) for (const [j, b] of R.base) {
        const p = this.bones[j]; if (!p) continue; const a = cur[j] || Z, l = lay?.j[j] || Z, h = hp?.j[j] || Z, wl = this.over * this.over * (3 - 2 * this.over), wh = this.hurtW * .6 * (1 - wl);
        let x = a[0] + (h[0] - a[0]) * wh, y = a[1] + (h[1] - a[1]) * wh, z = a[2] + (h[2] - a[2]) * wh;
        if (lay) { const zz = j === 'hips' ? l[2] * this.side : l[2]; x += (l[0] - x) * wl; y += (l[1] - y) * wl; z += (zz - z) * wl; }
        p.rotation.set(b[0] + x, b[1] + y, b[2] + z);
      }
      if (lay && this.bones.hips && R.hip0 != null) { const d = lay.drop * this.over * this.over * (3 - 2 * this.over); this.bones.hips.position.y -= d * R.height; }
      // the jerk
      const [pi, ro, tw] = [this.springs.pitch[0], this.springs.roll[0], this.springs.twist[0]];
      this.chain.forEach((n, i) => { const p = this.bones[n]; if (!p) return; const k = (i + 1) / this.chain.length; p.rotation.x += -pi * .09 * k; p.rotation.z += ro * .05 * k; p.rotation.y += tw * .06 * k; });
      this.tail.forEach((n, i) => { const p = this.bones[n]; if (p) p.rotation.y += -tw * .08 * (1 + i * .3); });
    }
    // it slides back, slowing on the ground
    if (this.moves && this.c.position) {
      const pos = this.c.position; pos.x += this.slide.x * dt; pos.z += this.slide.z * dt; const f = Math.exp(-dt * (this.state === 'down' || this.state === 'dead' ? 3 : 6)); this.slide.x *= f; this.slide.z *= f;
      if (this.ground) pos.y = this.ground(pos.x, pos.z);
    }
    return this;
  }
}
const Z = [0, 0, 0];

/**
 * A boss fight in phases. stats: its gs.stats Stats (with an 'hp' pool). phases: [{ below (a share of health it starts
 * under; the first is 1), attacks (the Moveset's attacks from then on), buff ({ add, mul } on its stats: faster,
 * stronger), pause (seconds of a roar in between, when nothing hurts it: 'invulnerable' tag), summon ({ count, kind }:
 * a 'summon' event for your game to bring them in), name }]. moves: its Moveset (set() each phase, stopped while it roars).
 * poise ({ max, recover (a second), stun (seconds) }): a meter hits fill (or poise(n)), full it staggers: an opening.
 * enrage: seconds into the fight it gets angry (mul on power and attackSpeed); rage: { mul } for that.
 * update(dt) returns events: { type: 'phase', phase, index, from } | { type: 'staggered' } | { type: 'enraged' } |
 * { type: 'summon', count, kind } | { type: 'calm' } (the roar between phases is over) | { type: 'dead' }.
 */
export class Boss {
  constructor({ stats, phases = [{ below: 1 }], moves = null, poise = null, enrage = 0, rage = { mul: { power: 1.4, attackSpeed: 1.3 } }, hurt = null } = {}) {
    if (!stats?.pools?.hp) throw new Error('gs.monsters: a Boss needs stats with an hp pool');
    this.stats = stats; this.phases = phases.slice().sort((a, b) => (b.below ?? 1) - (a.below ?? 1)); this.moves = moves; this.hurtBy = hurt;
    this.poiseO = poise ? { max: 50, recover: 8, stun: 2.5, ...poise } : null; this.enrageAt = enrage; this.rage = rage;
    this.index = -1; this.t = 0; this.pausing = 0; this.enraged = false; this.poised = 0; this.events = []; this.handlers = {}; this.dead = false;
    stats.on('change', e => { if (e.stat === 'hp' && e.by < 0 && this.poiseO && !(this.pausing > 0)) this.poise(-e.by); });
    this.enter(0, true);
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  // (what happens between updates, a stagger from a hit, is in the next update's list)
  emit(e) { if (this.fresh) { this.events = []; this.fresh = false; } this.events.push(e); for (const f of this.handlers[e.type] || []) f(e); }
  /** The phase it is in ({ name, below, ... }) and its health 0..1 (for the bar, with the phases' marks at their `below`). */
  get phase() { return this.phases[this.index]; }
  get part() { return this.stats.part('hp'); }
  /** The poise meter, 0..1 (full: it staggers). */
  get poiseLeft() { return this.poiseO ? this.poised / this.poiseO.max : 0; }
  /** True during the roar between phases (it takes no harm then). */
  get changing() { return this.pausing > 0; }
  /** Adds to the poise meter (hits fill it by themselves through its Stats; call this for a parry, a heavy blow). */
  poise(n) { const P = this.poiseO; if (!P || this.dead) return this; this.poised += n; if (this.poised >= P.max) { this.poised = 0; this.moves?.stunFor(P.stun); this.stats.buff('staggered', { for: P.stun, tags: ['staggered', 'stunned'] }); this.hurtBy?.hit({ x: 0, y: 0, z: 0 }, { power: (this.hurtBy.poise + this.hurtBy.sturdy) / 2 }); this.emit({ type: 'staggered', time: P.stun }); } return this; }
  enter(i, quiet = false) {
    const from = this.index, ph = this.phases[i]; this.index = i;
    if (from >= 0 && this.phases[from]?.buff) this.stats.remove('phase:' + from);
    if (ph.buff) this.stats.perk('phase:' + i, { ...ph.buff });
    if (ph.attacks && this.moves) this.moves.set(ph.attacks);
    if (!quiet) {
      this.pausing = ph.pause ?? 1.5; if (this.pausing > 0) { this.stats.buff('changing', { for: this.pausing, tags: ['invulnerable'] }); this.moves?.stunFor(this.pausing); }
      this.poised = 0; this.emit({ type: 'phase', phase: ph, index: i, from });
      if (ph.summon) this.emit({ type: 'summon', ...ph.summon, index: i });
    }
  }
  update(dt) { if (this.fresh) { this.events = []; this.fresh = false; } this.step(dt); this.fresh = true; return this.events; }
  step(dt) {
    if (this.dead || !(dt > 0)) return; this.t += dt;
    if (this.stats.empty('hp')) { this.dead = true; this.moves?.stop('dead'); this.emit({ type: 'dead' }); return; }
    if (this.pausing > 0) { this.pausing -= dt; if (this.pausing <= 0) this.emit({ type: 'calm', index: this.index }); }
    const part = this.part; let next = this.index;
    while (next + 1 < this.phases.length && part <= (this.phases[next + 1].below ?? 0)) next++;
    if (next !== this.index) this.enter(next);
    if (this.poiseO && this.poised > 0) this.poised = Math.max(0, this.poised - this.poiseO.recover * dt);
    if (this.enrageAt > 0 && !this.enraged && this.t >= this.enrageAt) { this.enraged = true; this.stats.perk('enraged', { ...this.rage, tags: ['enraged'] }); this.emit({ type: 'enraged' }); }
  }
}
