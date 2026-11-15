// Magic (Rob's fantasy RPG pick 7, 2026-11-15): spells with a cast and a cost, bolts that fly (homing, piercing,
// chaining, splashing), areas (a circle, a cone, a line, a ring; at once, after a warning, or lingering), beams you
// channel, shields that soak up harm (or turn bolts back), heals at once or over time, buffs, and status effects
// (burning, chilled, frozen, shocked, wet, poisoned...) that meet each other: fire thaws ice, frost freezes the
// wet, lightning through water stuns. Mana, cooldowns, charges and statuses are gs.stats' own (a Stats each).
// 2D or 3D: leave out z and it all happens on the flat. The kit says who was hit and for how much, and keeps the
// numbers; your game draws (or uses Looks for ready-made 3D effects on gs.fx3d's particles) and decides the rest.
//
//   const { Magic, STATUSES } = gs.magic, { Stats } = gs.stats;
//   const BOOK = {
//     firebolt: { kind: 'bolt', element: 'fire', cost: 8, cool: .8, cast: .3, speed: 24, damage: 14, status: 'burn' },
//     nova:     { kind: 'area', element: 'frost', cost: 20, cool: 6, at: 'self', radius: 4, damage: 8, status: 'chill', push: 5 },
//     ward:     { kind: 'shield', cost: 15, cool: 10, absorb: 40, for: 8 },
//     mend:     { kind: 'heal', cost: 12, cool: 2, cast: 1, heal: 30 },
//   };
//   reset() {
//     magic = new Magic({ book: BOOK });
//     hero = magic.unit(heroMesh, { team: 'hero', stats: new Stats({ hp: { max: 100 }, mana: { max: 60, regen: 6, delay: 1 }, speed: 5 }, { buffs: STATUSES }) });
//     for (const m of monsters) m.unit = magic.unit(m.mesh, { team: 'foes', stats: m.stats, radius: .6, height: 1.6 });
//   }
//   update(dt) {
//     for (const e of magic.update(dt)) if (e.type === 'hit' && e.who.dead) ...;   // hits, heals, reactions, ...
//     if (tapped) hero.cast('firebolt', { dir: aimDir });            // or { at: point } or { target: unit }
//   }
//   draw: magic.bolts, magic.areas (part: how far through its warning), magic.beams, hero.casting.part, hero.ward
//
// What a unit has on it is its own Stats, so a game's buffs table can hold the statuses too (STATUSES, or your own
// under the same names), and saving the Stats keeps them.
import { linksFor } from './links.js';

const TAU = Math.PI * 2;
const v3 = (x = 0, y = 0, z) => ({ x, y, z });
const len = (x, y, z = 0) => Math.hypot(x, y, z);
const flatOf = p => p.z == null;

/**
 * Statuses, as gs.stats buff specs (seconds, adds and muls on stats, drains per second), with the element they come
 * from and what they turn into at their most stacks (full). Tags the kit reads: 'stunned' (no casting, a cast is cut
 * off), 'silenced' (no casting), 'rooted' (no moving: the game reads it). Copy and change, or give your own to Magic.
 */
export const STATUSES = Object.freeze({
  burn: { for: 4, every: .5, drain: { hp: 4 }, bad: true, stacks: 3, stack: 'stack', tags: ['burning'], element: 'fire' },
  chill: { for: 4, mul: { speed: .7, castSpeed: .8 }, bad: true, stacks: 3, stack: 'stack', tags: ['chilled'], element: 'frost', full: 'frozen' },
  frozen: { for: 2.5, mul: { speed: 0 }, bad: true, tags: ['frozen', 'stunned', 'rooted'], element: 'frost' },
  shocked: { for: .8, bad: true, tags: ['shocked', 'stunned'], element: 'storm' },
  wet: { for: 8, bad: true, tags: ['wet'], element: 'water' },
  poison: { for: 6, every: 1, drain: { hp: 3 }, bad: true, stacks: 5, stack: 'stack', tags: ['poisoned'], element: 'nature' },
  rooted: { for: 2, mul: { speed: 0 }, bad: true, tags: ['rooted'], element: 'earth' },
  weak: { for: 6, mul: { power: .7 }, bad: true, tags: ['weakened'], element: 'shadow' },
  silence: { for: 3, bad: true, tags: ['silenced'], element: 'arcane' },
  slow: { for: 4, mul: { speed: .6 }, bad: true, tags: ['slowed'] },
  regen: { for: 6, every: 1, drain: { hp: -5 }, tags: ['regen'], element: 'nature' },
  haste: { for: 6, mul: { speed: 1.35, castSpeed: 1.3 }, tags: ['hasted'], element: 'storm' },
  might: { for: 8, mul: { power: 1.3 }, tags: ['empowered'], element: 'holy' },
  stoneskin: { for: 8, add: { armour: 10 }, tags: ['stoneskin'], element: 'earth' },
});

/**
 * How statuses meet: when a spell of element `by` lands on someone who `has` a status (by id or tag), it can `clear`
 * statuses, `add` one, do `bonus` more damage (x), and `skip` its own status. The first rule that fits is the one.
 */
export const REACTIONS = Object.freeze([
  { name: 'thaw', has: 'frozen', by: 'fire', clear: ['frozen', 'chill'], bonus: .5, skip: true },
  { name: 'steam', has: 'wet', by: 'fire', clear: ['wet'], skip: true },
  { name: 'melt', has: 'chill', by: 'fire', clear: ['chill'] },
  { name: 'freeze', has: 'wet', by: 'frost', clear: ['wet'], add: 'frozen' },
  { name: 'douse', has: 'burn', by: 'frost', clear: ['burn'] },
  { name: 'douse', has: 'burn', by: 'water', clear: ['burn'] },
  { name: 'conduct', has: 'wet', by: 'storm', add: 'shocked', bonus: .5 },
  { name: 'shatter', has: 'frozen', by: 'earth', clear: ['frozen'], bonus: 1 },
  { name: 'shatter', has: 'frozen', by: 'force', clear: ['frozen'], bonus: 1 },
  { name: 'flare', has: 'poison', by: 'fire', clear: ['poison'], bonus: .75 },
]);

/** Colours for each element, [core, edge] (Looks uses them; so can your own drawing). */
export const ELEMENTS = Object.freeze({
  fire: ['#fff0a0', '#ff4a10'], frost: ['#f0fcff', '#4aa8ff'], storm: ['#ffffff', '#8a7dff'], water: ['#d8f4ff', '#2a7fd8'],
  earth: ['#e8d2a0', '#7a5a30'], nature: ['#e8ffb0', '#3fbf3a'], arcane: ['#ffd8ff', '#a050ff'], holy: ['#fffbe0', '#ffc840'],
  shadow: ['#c8a8ff', '#3a1a6a'], force: ['#ffffff', '#9fd0ff'],
});

const DEFAULTS = { bolt: { speed: 20, size: .25, range: 30 }, area: { radius: 3, at: 'self', shape: 'circle' }, beam: { range: 12, every: .2, width: .3 } };
const ALLY_KINDS = new Set(['heal', 'shield', 'buff']);

/**
 * A spell's caster, or anything spells can hit (Magic.unit makes them). body: an Object3D or { x, y, z } (read each
 * frame; a function giving one works too), stats: a gs.stats Stats (pools 'hp' and the spell's pool, usually 'mana';
 * stats 'power', 'castSpeed', 'armour', 'resist.<element>' (0..1) if it has them), team, radius and height (what is hit:
 * an upright capsule, a circle in 2D), hand (where its spells leave from: an Object3D, a point or a function; else
 * chest high in front), facing (radians, or a function: which way 'self' cones and lines go without an aim),
 * thing (its body in the physics world, which its own bolts pass).
 */
export class Unit {
  constructor(magic, body, o = {}) {
    this.magic = magic; this.body = body; this.stats = o.stats || null; this.team = o.team ?? 'hero';
    this.radius = o.radius ?? .45; this.height = o.height ?? 1.8; this.hand = o.hand || null; this.facing = o.facing ?? null; this.thing = o.thing || null;
    this.book = o.book || magic.book; this.casting = null; this.channel = null; this.wards = []; this.gcd = 0; this.dead = false; this.last = null; this.id = ++magic.ids;
    this.fragile = o.fragile ?? .25;   // a share of its health in one hit that breaks a cast with `fragile` (the spell's own wins)
    if (this.stats) {
      for (const [name, s] of Object.entries(this.book)) if (s.cool > 0 || s.charges > 1) this.stats.cool(name, s.cool || 0, { charges: s.charges || 1, by: s.coolBy ?? null });
      this.stats.on('change', e => { if (e.by < 0 && e.stat === 'hp' && e.why !== 'magic') this.hurt(-e.by); });
    }
  }
  /** Where it is now ({ x, y, z }; z undefined in 2D). */
  get pos() { const b = typeof this.body === 'function' ? this.body() : this.body; return b?.position ?? b ?? v3(); }
  /** Can it cast this now? true, or why not: 'unknown', 'dead', 'stunned', 'silenced', 'busy', 'cooling', 'mana', 'range'. */
  can(name, aim = {}) {
    const s = this.book[name], st = this.stats; if (!s) return 'unknown';
    if (this.dead) return 'dead'; if (st?.is('stunned')) return 'stunned'; if (st?.is('silenced') && !s.free) return 'silenced';
    if (this.casting || this.channel || this.gcd > 0) return 'busy';
    if (st?.cools[name] && !st.ready(name)) return 'cooling';
    if (s.cost && st && st.get(s.pool || 'mana') < s.cost) return 'mana';
    const t = aim.target?.pos ?? aim.at; if (t && s.range && dist(this.pos, t) > s.range + (aim.target?.radius || 0)) return 'range';
    return true;
  }
  /**
   * Starts a spell from the book. aim: { dir } (which way), { at } (a point) or { target } (a unit: bolts home in if
   * the spell says homing, heals and areas go on it). Returns true, or why not (see can()); 'fail' events say so too.
   */
  cast(name, aim = {}) {
    const ok = this.can(name, aim); if (ok !== true) { this.magic.emit({ type: 'fail', by: this, spell: name, why: ok }); return ok; }
    const s = this.book[name], t = (s.cast || 0) / Math.max(.1, this.stats?.get('castSpeed') || 1);
    this.casting = { name, spell: s, aim, t: 0, of: t, at: copy(this.pos), part: 0 };
    this.magic.emit({ type: 'start', by: this, spell: name, time: t });
    if (t <= 0) this.release();
    return true;
  }
  /** Cuts a cast or a channel off (nothing spent for a cast that hadn't gone). */
  interrupt(why = 'interrupted') {
    if (!this.casting && !this.channel) return false;
    const name = (this.casting || this.channel).name; this.casting = null; if (this.channel) this.endChannel(why);
    this.magic.emit({ type: 'interrupt', by: this, spell: name, why }); return true;
  }
  /** Lets go of a channelled spell. */
  stop() { if (this.channel) { this.endChannel('stopped'); return true; } return false; }
  endChannel(why) { const c = this.channel; this.channel = null; this.magic.beams = this.magic.beams.filter(b => b.by !== this || b.name !== c.name); this.magic.emit({ type: 'end', by: this, spell: c.name, why }); }
  // a hit from anything (a sword too): a big enough one breaks a fragile cast
  hurt(n) {
    const c = this.casting || this.channel, f = c?.spell.fragile ?? null; if (!c || f === false) return;
    const max = this.stats?.max('hp') || 100, share = f === true || f == null ? this.fragile : f;
    if (f === true || n >= share * max) this.interrupt('hurt');
  }
  release() {
    const c = this.casting; this.casting = null; const s = c.spell, st = this.stats;
    if (s.cost && st && !st.spend(s.pool || 'mana', s.cost)) { this.magic.emit({ type: 'fail', by: this, spell: c.name, why: 'mana' }); return; }
    if (st?.cools[c.name]) st.use(c.name);
    this.gcd = s.gcd ?? this.magic.gcd;
    this.magic.go(this, c.name, s, c.aim);
  }
  /** A ward on it now: the strongest one's { amount, max, part, left, reflect }, or null. */
  get ward() { let w = null; for (const x of this.wards) if (!w || x.amount > w.amount) w = x; return w && { ...w, part: w.amount / w.max }; }
  /** Where its spells leave from. */
  from() {
    const h = typeof this.hand === 'function' ? this.hand() : this.hand; if (h) { if (h.getWorldPosition) { const p = h.getWorldPosition(this._hp ||= h.position.clone()); return v3(p.x, p.y, p.z); } return copy(h); }
    const p = this.pos, f = this.face(); if (flatOf(p)) return v3(p.x + Math.cos(f) * this.radius, p.y + Math.sin(f) * this.radius);
    return v3(p.x + Math.sin(f) * this.radius, p.y + this.height * .72, p.z + Math.cos(f) * this.radius);
  }
  // which way it faces (radians: 3D about y from +z; 2D from +x)
  face() {
    if (this.facing != null) return typeof this.facing === 'function' ? this.facing() : this.facing;
    const b = typeof this.body === 'function' ? this.body() : this.body; return b?.rotation?.y ?? b?.yaw ?? b?.angle ?? 0;
  }
}

/**
 * The spells in play: units, bolts, areas, beams. book: { name: spell } (see below); statuses (STATUSES), reactions
 * (REACTIONS: [] for none), gcd (seconds after any cast before the next; .25), gravity (on bolts that drop: -9.8),
 * world (a gs.physics3d World3D or 2D Physics: bolts stop at walls; none: the game's own, found by itself; false:
 * none), apply (false: the kit only says what was hit, and takes nothing off anyone).
 *
 * A spell: kind ('bolt' | 'area' | 'beam' | 'shield' | 'heal' | 'buff'), element, cost (and pool: 'mana'), cool
 * (seconds), charges, cast (seconds to cast; still: moving cuts it off; fragile: a big hit cuts it off, true any hit,
 * a share of health, false never), gcd, range, damage, heal, status (an id or [ids], chance 0..1), push (metres a
 * second away; negative pulls in), hits ('foes' | 'allies' | 'all': foes for harm, allies for heals, shields, buffs).
 *  bolt: speed, size (radius), gravity (true: the Magic's), homing (radians a second it turns towards its target),
 *        pierce (how many it passes through), chain ({ jumps, range, falloff }: jumps on to the next foe),
 *        splash ({ radius, damage, status }: an area where it lands), life (seconds).
 *  area: at ('self' | 'aim' | 'target'), shape ('circle' | 'cone' | 'line' | 'ring'), radius, angle (a cone's half
 *        width), width (a line's), inner (a ring's hole), delay (a warning first: seconds), for + every (it lingers,
 *        hitting each `every`), follow (it moves with the caster: an aura), blocks (foes' bolts stop at its edge).
 *  beam: channel (seconds it can be held), every, range, width, drain (pool per second while held).
 *  shield: absorb (how much harm it soaks), for (seconds), reflect (foes' bolts turn back), on ('self' | 'target' |
 *          'allies' with radius), element (it soaks only that element).
 *  heal: heal (at once), over (seconds: then as regen instead), on ('self' | 'target' | 'allies' with radius), cleanse.
 *  buff: buff (a status id), on (as heal).
 */
export class Magic {
  constructor({ book = {}, statuses = STATUSES, reactions = REACTIONS, gcd = .25, gravity = -9.8, world = null, apply = true, link = true } = {}) {
    this.book = book; this.statuses = statuses; this.reactions = reactions; this.gcd = gcd; this.gravity = gravity; this.apply = apply;
    this.units = []; this.bolts = []; this.areas = []; this.beams = []; this.zaps = []; this.events = []; this.fresh = false; this.handlers = {}; this.ids = 0; this.t = 0;
    const L = this.links = linksFor(null, link); L?.join('magic', this); this.world = world || null; this.seeks = world == null && !!L;
    for (const [n, s] of Object.entries(book)) if (!['bolt', 'area', 'beam', 'shield', 'heal', 'buff'].includes(s.kind)) throw new Error(`gs.magic: spell '${n}' needs kind 'bolt', 'area', 'beam', 'shield', 'heal' or 'buff'`);
  }
  /** Something spells can hit, and that can cast them (see Unit). */
  unit(body, o = {}) { const u = new Unit(this, body, o); this.units.push(u); return u; }
  /** Takes a unit out (it died for good, it left). */
  remove(u) { this.units = this.units.filter(x => x !== u); this.bolts = this.bolts.filter(b => b.by !== u); this.beams = this.beams.filter(b => b.by !== u); this.areas = this.areas.filter(a => !(a.follow && a.by === u)); return this; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  // (what happens between updates, a cast that goes at once, is in the next update's list)
  emit(e) { if (this.fresh) { this.events = []; this.fresh = false; } this.events.push(e); for (const f of this.handlers[e.type] || []) f(e); for (const f of this.handlers.any || []) f(e); }
  /** Everything taken out (a new round). */
  clear() { this.units = []; this.bolts = []; this.areas = []; this.beams = []; this.zaps = []; this.events = []; return this; }

  // ---- what a spell does when it goes
  go(u, name, s, aim) {
    const k = s.kind, ev = { type: 'release', by: u, spell: name, kind: k }, P = u.pos;
    if (k === 'bolt') { const b = this.bolt(u, name, s, aim); ev.bolt = b; }
    else if (k === 'area') {
      const at = s.at || 'self', c = at === 'target' && aim.target ? copy(aim.target.pos) : at === 'aim' && aim.at ? clampTo(P, aim.at, s.range) : copy(P);
      ev.area = this.area(u, name, s, c, dirOf(u, aim, c));
    } else if (k === 'beam') {
      u.channel = { name, spell: s, aim, t: 0, next: 0, of: s.channel ?? 2 };
      const b = { by: u, name, spell: s, from: u.from(), to: null, hit: null }; this.beams.push(b); ev.beam = b;
    } else for (const t of this.whoFor(u, s, aim)) this.bless(u, name, s, t);
    this.emit(ev);
  }
  // a heal, a shield or a buff on each it goes to
  bless(u, name, s, t) {
    const e = { type: s.kind, by: u, who: t, spell: name, at: copy(t.pos) };
    if (s.kind === 'heal') {
      if (s.cleanse && t.stats) e.cleansed = t.stats.cleanse();
      if (s.over > 0) { const per = (s.heal || 0) / s.over; e.status = this.status(t, 'regen', s, { for: s.over, spec: { ...(this.statuses.regen || {}), for: s.over, every: 1, drain: { hp: -per } } }); }
      else if (t.stats && this.apply) e.heal = t.stats.pools.hp ? t.stats.change('hp', (s.heal || 0) * (u.stats?.get('power') || 1), 'heal') : 0;
      else e.heal = s.heal || 0;
    } else if (s.kind === 'shield') {
      const w = { by: u, spell: name, amount: s.absorb ?? 30, max: s.absorb ?? 30, left: s.for ?? 8, of: s.for ?? 8, reflect: !!s.reflect, element: s.element && s.only ? s.element : null };
      t.wards = t.wards.filter(x => x.spell !== name); t.wards.push(w); e.ward = w;
    } else if (s.kind === 'buff') e.status = this.status(t, s.buff, s);
    this.emit(e);
  }
  // who a heal, shield or buff goes to
  whoFor(u, s, aim) {
    const on = s.on || (aim.target ? 'target' : 'self');
    if (on === 'target') return aim.target && !aim.target.dead && this.wants(u, s, aim.target) ? [aim.target] : [u];
    if (on === 'allies') return this.units.filter(t => !t.dead && t.team === u.team && dist(t.pos, u.pos) <= (s.radius ?? 6));
    return [u];
  }
  // does this spell of u's go for t?
  wants(u, s, t) { const h = s.hits || (ALLY_KINDS.has(s.kind) ? 'allies' : 'foes'); return h === 'all' || (h === 'allies' ? t.team === u.team : t.team !== u.team); }

  bolt(u, name, s, aim, from = u.from(), dir = null) {
    const d = { ...DEFAULTS.bolt, ...s }, to = aim.target ? centre(aim.target) : aim.at;
    dir ||= aim.dir ? norm(aim.dir) : to ? norm(sub(to, from)) : faceDir(u, from);
    const b = { by: u, name, spell: s, team: u.team, x: from.x, y: from.y, z: from.z, v: v3(dir.x * d.speed, dir.y * d.speed, flatOf(from) ? undefined : (dir.z || 0) * d.speed),
      size: d.size, target: aim.target || null, left: s.life ?? d.range / d.speed, pierce: s.pierce || 0, passed: new Set(), id: ++this.ids, from: copy(from) };
    this.bolts.push(b); return b;
  }
  area(u, name, s, c, dir) {
    const d = { ...DEFAULTS.area, ...s }, a = { by: u, name, spell: s, team: u.team, x: c.x, y: c.y, z: c.z, dir, shape: d.shape, radius: d.radius, angle: d.angle ?? .6, width: d.width ?? 1.2, inner: d.inner ?? 0,
      warn: s.delay || 0, t: 0, left: s.for || 0, every: s.every || .5, next: 0, follow: !!s.follow, blocks: !!s.blocks, part: s.delay ? 0 : 1, live: !s.delay, id: ++this.ids, hit: new Set() };
    this.areas.push(a); if (a.warn) this.emit({ type: 'warn', by: u, spell: name, area: a, time: a.warn }); else this.burst(a, true);
    return a;
  }

  /**
   * Moves everything on by dt: casts finish, bolts fly and hit, areas go off and tick, beams burn, wards run down,
   * the units' Stats run on (statuses tick). Returns this frame's events: { type: 'start' | 'release' | 'hit' | 'heal'
   * | 'shield' | 'buff' | 'reaction' | 'absorb' | 'broken' | 'reflect' | 'warn' | 'interrupt' | 'end' | 'fail' |
   * 'dead', by, who, spell, at, damage, absorbed, statuses, reaction, ... }. stats: false if your game updates the
   * units' Stats itself.
   */
  update(dt, { stats = true } = {}) {
    if (this.fresh) { this.events = []; this.fresh = false; } if (!(dt > 0)) return this.events; this.t += dt;
    if (this.seeks) { const L = this.links; this.world = L.one('world') ?? L.one('world2d') ?? null; }
    for (const u of this.units) {
      if (stats && u.stats) u.stats.update(dt);
      u.gcd = Math.max(0, u.gcd - dt);
      for (const w of u.wards) w.left -= dt; const was = u.wards.length; u.wards = u.wards.filter(w => w.left > 0 && w.amount > 0); if (u.wards.length < was) this.emit({ type: 'end', by: u, spell: 'ward', why: 'ran out' });
      const c = u.casting;
      if (c) {
        if (u.stats?.is('stunned')) u.interrupt('stunned');
        else if (c.spell.still && dist(u.pos, c.at) > .15) u.interrupt('moved');
        else { c.t += dt; c.part = c.of > 0 ? Math.min(1, c.t / c.of) : 1; if (c.t >= c.of) u.release(); }
      }
      if (u.channel) this.channelStep(u, dt);
      if (!u.dead && u.stats?.pools.hp && u.stats.empty('hp')) { u.dead = true; u.interrupt('dead'); this.emit({ type: 'dead', who: u }); }
    }
    this.boltsStep(dt); this.areasStep(dt);
    for (const z of this.zaps) z.life -= dt; this.zaps = this.zaps.filter(z => z.life > 0);
    this.fresh = true; return this.events;
  }
  boltsStep(dt) {
    const W = this.world, flat3 = W && W.ray?.length >= 4;
    for (const b of this.bolts) {
      const s = b.spell, from = v3(b.x, b.y, b.z);
      if (s.homing && b.target && !b.target.dead) {   // turn towards the target, no faster than homing radians a second
        const sp = len(b.v.x, b.v.y, b.v.z || 0), want = norm(sub(centre(b.target), from)), cur = norm(b.v), turn = Math.min(1, s.homing * dt / Math.max(1e-3, Math.acos(Math.max(-1, Math.min(1, dot(cur, want))))));
        const n = norm(v3(cur.x + (want.x - cur.x) * turn, cur.y + (want.y - cur.y) * turn, b.z == null ? undefined : cur.z + (want.z - cur.z) * turn)); b.v.x = n.x * sp; b.v.y = n.y * sp; if (b.z != null) b.v.z = n.z * sp;
      }
      if (s.gravity && b.z != null) b.v.y += (s.gravity === true ? this.gravity : s.gravity) * dt;
      b.x += b.v.x * dt; b.y += b.v.y * dt; if (b.z != null) b.z += b.v.z * dt; b.left -= dt;
      const to = v3(b.x, b.y, b.z);
      // a foe's dome on its way
      for (const a of this.areas) if (a.blocks && a.live && a.team !== b.team && inside(a, from) !== inside(a, to)) { b.dead = true; this.emit({ type: 'blocked', by: b.by, spell: b.name, area: a, at: to }); this.splash(b, to); break; }
      if (b.dead) continue;
      // who it passes through this frame (the nearest first)
      const hits = [];
      for (const t of this.units) {
        if (t.dead || b.passed.has(t) || !this.wants(b.by, s, t)) continue;
        const k = segHit(from, to, t, b.size); if (k != null) hits.push([k, t]);
      }
      hits.sort((p, q) => p[0] - q[0]);
      // a wall on the way (a physics world)
      let wall = null;
      if (W?.ray) {
        const dx = to.x - from.x, dy = to.y - from.y, dz = (to.z || 0) - (from.z || 0), l = len(dx, dy, dz);
        if (l > 0) { const keep = t => t !== b.by.thing && !t.collider?.isSensor?.() && !this.units.some(u => u.thing === t); const h = flat3 ? W.ray(from.x, from.y, to.x, to.y, keep) : W.ray(from, v3(dx, dy, dz), l, keep); if (h) { const d = h.distance ?? (h.toi ?? 0); wall = { k: Math.min(1, d / l), h }; } }
      }
      for (const [k, t] of hits) {
        if (wall && wall.k < k) break;
        const w = t.ward;
        if (w?.reflect && t.team !== b.team) {   // turned back
          const ws = t.wards.find(x => x.reflect); b.v.x = -b.v.x; b.v.y = -b.v.y; if (b.z != null) b.v.z = -b.v.z; b.team = t.team; b.by = t; b.target = null; b.passed = new Set([t]); b.left = Math.max(b.left, 1);
          ws.amount -= (s.damage || 0) * .5; this.emit({ type: 'reflect', by: t, who: t, spell: b.name, at: lerp(from, to, k) }); wall = null; break;
        }
        this.hit(b.by, t, b.name, s, lerp(from, to, k), b.v);
        b.passed.add(t);
        if (s.chain) this.chain(b, t, lerp(from, to, k));
        if (b.pierce-- <= 0) { b.dead = true; this.splash(b, lerp(from, to, k)); break; }
      }
      if (!b.dead && wall) { b.dead = true; const h = wall.h, at = flat3 ? v3(h.x, h.y) : h.point ? v3(h.point.x, h.point.y, h.point.z) : lerp(from, to, wall.k); this.emit({ type: 'wall', by: b.by, spell: b.name, at, thing: wall.h.thing }); this.splash(b, at); }
      if (!b.dead && b.left <= 0) { b.dead = true; this.splash(b, to); this.emit({ type: 'fizzle', by: b.by, spell: b.name, at: to }); }
      if (!b.dead && b.z != null && b.y < -100) b.dead = true;
    }
    this.bolts = this.bolts.filter(b => !b.dead);
  }
  // a bolt that splashes leaves an area where it stopped
  splash(b, at) { const p = b.spell.splash; if (!p) return; this.area(b.by, b.name, { ...b.spell, kind: 'area', status: p.status ?? b.spell.status, damage: p.damage ?? b.spell.damage * .5, push: p.push ?? b.spell.push, delay: 0, for: p.for || 0, every: p.every, shape: 'circle', radius: p.radius ?? 2 }, at, null); }
  // lightning that jumps from one to the next
  chain(b, from, at) {
    const c = b.spell.chain; let last = from, p = at, dmg = b.spell.damage || 0; const done = new Set([from]);
    for (let j = 0; j < (c.jumps ?? 3); j++) {
      let best = null, bd = c.range ?? 5;
      for (const t of this.units) { if (t.dead || done.has(t) || !this.wants(b.by, b.spell, t)) continue; const d = dist(t.pos, last.pos); if (d < bd) { bd = d; best = t; } }
      if (!best) break; dmg *= c.falloff ?? .7; const q = centre(best);
      this.zaps.push({ from: p, to: q, element: b.spell.element, life: .25, spell: b.name }); this.hit(b.by, best, b.name, { ...b.spell, damage: dmg }, q, null, { chain: j + 1 });
      done.add(best); b.passed.add(best); last = best; p = q;
    }
  }
  areasStep(dt) {
    for (const a of this.areas) {
      a.t += dt;
      if (a.follow) { const p = a.by.pos; a.x = p.x; a.y = p.y; a.z = p.z; }
      if (!a.live) { a.part = Math.min(1, a.t / a.warn); if (a.t >= a.warn) { a.live = true; a.t = 0; this.burst(a, true); } continue; }
      if (a.left > 0) { a.left -= dt; a.next -= dt; while (a.next <= 0 && a.left > 0) { a.next += a.every; this.burst(a, false); } }
      if (a.left <= 0) a.gone = true;
    }
    this.areas = this.areas.filter(a => !a.gone);
  }
  // an area hits what is in it (first: the moment it goes off; lingering ones again each tick, without the push)
  burst(a, first) {
    const s = a.spell, k = first ? 1 : (a.every / Math.max(a.every, s.for || a.every));
    for (const t of this.units) {
      if (t.dead || !this.wants(a.by, s, t) || !inside(a, t.pos, t.radius)) continue;
      if (ALLY_KINDS.has(s.kind)) { this.bless(a.by, a.name, s, t); continue; }
      if (!first && !(s.damage || s.status)) continue;
      const push = first && s.push ? sub(t.pos, a) : null;
      this.hit(a.by, t, a.name, first ? s : { ...s, damage: (s.damage || 0) * (s.tick ?? 1), push: 0 }, centre(t), push, { area: a, tick: !first });
    }
    if (first) { this.felt(a, s); this.emit({ type: 'burst', by: a.by, spell: a.name, area: a, at: v3(a.x, a.y, a.z) }); }
    if (first && !(s.for > 0) && !s.follow) a.gone = true;
    return k;
  }
  // what else the game made feels a spell going off: a push throws loose things and people who react; fire bursts in smoke
  felt(a, s) {
    const L = this.links; if (!L || a.z == null) return; const at = v3(a.x, a.y, a.z);
    if (s.push && this.world?.blast && this.world.ray?.length < 4) this.world.blast(at, a.radius, Math.abs(s.push) * (s.push < 0 ? -1 : 1));
    if (s.push) for (const p of L.all('reactions')) p.blast?.(at, s.push, a.radius);
    if (s.element === 'fire') for (const g of L.all('gas')) { const B = g.bounds; if (B && at.x > B[0] && at.x < B[3] && at.z > B[2] && at.z < B[5]) g.burst(at.x, at.y + .3, at.z, { size: a.radius * .3 }); }
  }
  channelStep(u, dt) {
    const c = u.channel, s = c.spell, d = { ...DEFAULTS.beam, ...s }, b = this.beams.find(x => x.by === u && x.name === c.name);
    if (u.stats?.is('stunned')) return u.interrupt('stunned');
    if (s.drain && u.stats && !u.stats.spend(s.pool || 'mana', s.drain * dt)) return u.endChannel('mana');
    c.t += dt; c.next -= dt;
    const from = u.from(), aim = c.aim, dir = aim.target && !aim.target.dead ? norm(sub(centre(aim.target), from)) : aim.at ? norm(sub(aim.at, from)) : aim.dir ? norm(aim.dir) : faceDir(u, from);
    let best = null, bk = 1; const to = v3(from.x + dir.x * d.range, from.y + dir.y * d.range, from.z == null ? undefined : from.z + (dir.z || 0) * d.range);
    for (const t of this.units) { if (t.dead || !this.wants(u, s, t)) continue; const k = segHit(from, to, t, d.width); if (k != null && k < bk) { bk = k; best = t; } }
    const W = this.world;
    if (W?.ray && W.ray.length < 4 && from.z != null) { const h = W.ray(from, dir, d.range * bk, t => t !== u.thing && !this.units.some(x => x.thing === t)); if (h) { bk = (h.distance ?? h.toi) / d.range; best = null; } }
    if (b) { b.from = from; b.to = lerp(from, to, bk); b.hit = best; }
    if (c.next <= 0) { c.next += d.every; if (best) this.hit(u, best, c.name, { ...s, damage: (s.damage || 0) * d.every / (s.tickOf ?? d.every) }, lerp(from, to, bk), null, { beam: true }); }
    if (c.t >= c.of) u.endChannel('done');
  }

  /**
   * One spell landing on one unit (bolts, areas, beams and your own calls: a cursed sword's fire, a trap): its
   * element meets what is on them, wards soak it up, then it comes off their health and its status goes on.
   * push: a direction it shoves along (the spell's push says how hard). Returns the 'hit' event.
   */
  hit(by, t, name, s, at, push = null, more = {}) {
    const st = t.stats, el = s.element || null, e = { type: 'hit', by, who: t, spell: name, element: el, at: at || centre(t), damage: 0, absorbed: 0, statuses: [], reaction: null, ...more };
    let dmg = (s.damage || 0) * (by?.stats?.get('power') || 1), skip = false;
    if (st && el) {
      const r = this.reactions.find(x => x.by === el && (st.has(x.has) || st.is(x.has)));
      if (r) {
        for (const id of r.clear || []) st.remove(id, 'reaction'); if (r.add) e.statuses.push(this.status(t, r.add, s));
        dmg *= 1 + (r.bonus || 0); skip = !!r.skip; e.reaction = r.name; this.emit({ type: 'reaction', by, who: t, name: r.name, spell: name, at: e.at });
      }
      dmg *= 1 - Math.max(-1, Math.min(1, st.get('resist.' + el)));
    }
    if (dmg > 0 && st) dmg = Math.max(dmg > 0 ? 1 : 0, dmg - st.get('armour') * (s.pierceArmour ? 0 : .5));
    // wards first
    for (const w of t.wards) { if (dmg <= 0) break; if (w.element && w.element !== el) continue; const k = Math.min(w.amount, dmg); w.amount -= k; dmg -= k; e.absorbed += k; if (w.amount <= 0) this.emit({ type: 'broken', by: w.by, who: t, spell: w.spell, at: e.at }); }
    if (e.absorbed) this.emit({ type: 'absorb', by, who: t, spell: name, amount: e.absorbed, at: e.at });
    e.damage = Math.round(dmg * 10) / 10;
    if (this.apply && st?.pools.hp && e.damage > 0) st.change('hp', -e.damage, 'magic');
    if (e.damage > 0) t.hurt(e.damage);
    if (!skip && s.status) for (const id of [].concat(s.status)) if (!(s.chance < 1) || Math.random() < s.chance) { const x = this.status(t, id, s); if (x) e.statuses.push(x); }
    if (s.push && (push || at)) {
      const P = t.pos, dir = norm(push || sub(P, at)); e.push = v3(dir.x * s.push, (dir.y || 0) * s.push * .3 + (P.z == null ? 0 : Math.abs(s.push) * .25), P.z == null ? undefined : (dir.z || 0) * s.push);
    }
    this.emit(e);
    return e;
  }
  /** Puts a status on a unit (by id from the statuses; o.spec your own, o.for its time). At its most stacks it turns into its `full` one. */
  status(t, id, s = {}, o = {}) {
    const st = t.stats; if (!st || !id) return null;
    const spec = o.spec || st.table?.[id] || this.statuses[id]; if (!spec) throw new Error(`gs.magic: no status '${id}'`);
    const x = st.buff(id, st.table?.[id] && !o.spec ? null : spec, { for: o.for ?? s.statusFor });
    if (x && spec.full && x.stacks >= (spec.stacks || 1)) { st.remove(id, 'full'); return this.status(t, spec.full, s); }
    return x ? id : null;
  }
}

// ---- shapes and sums (2D: z undefined; 3D: about y, facing from +z)
const copy = p => v3(p.x, p.y, p.z);
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z == null ? undefined : a.z - (b.z || 0));
const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
const norm = a => { const l = len(a.x, a.y, a.z || 0) || 1; return v3(a.x / l, a.y / l, a.z == null ? undefined : a.z / l); };
const lerp = (a, b, k) => v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z == null ? undefined : a.z + ((b.z || 0) - a.z) * k);
const dist = (a, b) => len(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const clampTo = (from, to, r) => { if (!r) return copy(to); const d = dist(from, to); return d <= r ? copy(to) : lerp(from, to, r / d); };
const centre = t => { const p = t.pos; return p.z == null ? copy(p) : v3(p.x, p.y + t.height * .55, p.z); };
function faceDir(u, from) { const f = u.face(); return from.z == null ? v3(Math.cos(f), Math.sin(f)) : v3(Math.sin(f), 0, Math.cos(f)); }
// which way an area points (a cone, a line): the aim's, else towards its point, else the way the caster faces
function dirOf(u, aim, c) { const P = u.pos; if (aim.dir) return norm(aim.dir); const t = aim.target?.pos ?? aim.at; if (t && dist(t, P) > .01) return norm(sub(t, P)); return faceDir(u, P); }
// is a point (with a radius) in an area? 3D areas are flat on the ground: they reach 2 m up and down
function inside(a, p, r = 0) {
  const flat = p.z == null, dx = p.x - a.x, dz = flat ? p.y - a.y : p.z - a.z, d = Math.hypot(dx, dz);
  if (!flat && Math.abs(p.y - a.y) > Math.max(2, a.radius * .5)) return false;
  if (a.shape === 'circle') return d <= a.radius + r;
  if (a.shape === 'ring') return d <= a.radius + r && d >= a.inner - r;
  const dir = a.dir || v3(0, 0, 1), fx = dir.x, fz = flat ? dir.y : (dir.z || 0), fl = Math.hypot(fx, fz) || 1, along = (dx * fx + dz * fz) / fl, across = Math.abs(dx * fz - dz * fx) / fl;
  if (a.shape === 'cone') return d <= a.radius + r && (d < r || Math.acos(Math.max(-1, Math.min(1, along / Math.max(1e-6, d)))) <= a.angle + Math.atan2(r, Math.max(d, 1e-6)));
  if (a.shape === 'line') return along >= -r && along <= a.radius + r && across <= a.width / 2 + r;
  return false;
}
// where along a segment (0..1) a ball of radius r first meets a unit's upright capsule (a circle in 2D), or null
function segHit(a, b, t, r) {
  const p = t.pos, flat = a.z == null, R = t.radius + r;
  const ax = a.x - p.x, az = flat ? a.y - p.y : a.z - p.z, bx = b.x - p.x, bz = flat ? b.y - p.y : b.z - p.z, dx = bx - ax, dz = bz - az;
  const A = dx * dx + dz * dz, B = 2 * (ax * dx + az * dz), C = ax * ax + az * az - R * R;
  let k;
  if (C <= 0) k = 0; else if (A < 1e-12) return null; else { const D = B * B - 4 * A * C; if (D < 0) return null; k = (-B - Math.sqrt(D)) / (2 * A); if (k < 0 || k > 1) return null; }
  if (!flat) { const y = a.y + (b.y - a.y) * k; if (y < p.y - r || y > p.y + t.height + r) { // over or under at the side: try where it crosses the capsule's span
    const y0 = p.y - r, y1 = p.y + t.height + r, dy = b.y - a.y; if (Math.abs(dy) < 1e-9) return null;
    for (const yy of [y0, y1]) { const kk = (yy - a.y) / dy; if (kk < k || kk > 1) continue; const x = ax + dx * kk, z = az + dz * kk; if (x * x + z * z <= R * R) return kk; }
    return null; } }
  return k;
}

/**
 * Ready-made looks for spells in 3D, on a gs.fx3d Particles3D (and its view's lights in Next Gen): a glow in the hand
 * while casting, a trail behind each bolt and a light that goes with it, a flash where things land, rings for areas
 * (a faint one while it warns), sparks along beams and chains, a shimmer round a ward, motes rising from a heal.
 * Colours by element (ELEMENTS; colours: { element: [core, edge] } for your own). update(dt) after magic.update().
 */
export class Looks {
  constructor(magic, fx, { colours = {}, lights = true, size = 1 } = {}) {
    this.magic = magic; this.fx = fx; this.col = { ...ELEMENTS, ...colours }; this.lights = lights; this.size = size; this.trails = new Map(); this.held = new Map(); this.rings = new Map(); this.shields = new Map(); this.beams = new Map();
  }
  c(el) { return this.col[el] || this.col.arcane; }
  update(dt) {
    const M = this.magic, fx = this.fx, z = this.size;
    for (const e of M.events) {
      const s = M.book[e.spell] || {}, [a, b] = this.c(e.element || s.element);
      if (e.type === 'hit' && e.at?.z != null && !e.tick) { fx.make(e.at, { burst: Math.round(40 * z), life: [.25, .6], speed: [1.5 * z, 4.5 * z], size: [.12 * z, .3 * z], colors: [a, b], gravity: -2 }); if (this.lights) fx.flash(e.at, { col: b, i: 8 * z, reach: 4 * z, life: .18 }); }
      else if ((e.type === 'wall' || e.type === 'fizzle' || e.type === 'blocked') && e.at?.z != null) fx.make(e.at, { burst: Math.round(18 * z), life: [.15, .4], speed: [1 * z, 3 * z], size: [.05 * z, .12 * z], colors: [a, b] });
      else if (e.type === 'burst' && e.at?.z != null) this.ring(e.area, a, b, 1);
      else if (e.type === 'heal' && e.who?.pos?.z != null) { const p = e.who.pos; fx.make(v3(p.x, p.y + .2, p.z), { burst: Math.round(50 * z), life: [.7, 1.3], speed: [.2, .8], size: [.08, .2], colors: ['#f4ffe0', '#7cf080'], radius: e.who.radius, gravity: 1.6 }); if (this.lights) fx.flash(v3(p.x, p.y + 1, p.z), { col: '#9cff9a', i: 6, reach: 3, life: .5 }); }
      else if (e.type === 'reaction' && e.at?.z != null) fx.sparks(e.at, { color: a, count: 16, power: .7 * z, light: this.lights });
      else if (e.type === 'release' && e.by.pos.z != null && e.kind === 'bolt') fx.make(e.by.from(), { burst: Math.round(10 * z), life: [.1, .25], speed: [.5, 2], size: [.05, .12], colors: [a, b] });
    }
    // bolts: a trail each, with a light that goes with it
    const live = new Set();
    for (const bo of M.bolts) {
      if (bo.z == null) continue; live.add(bo.id); let t = this.trails.get(bo.id); const [a, b] = this.c(bo.spell.element);
      if (!t) { t = fx.make(bo, { loop: true, rate: 140 * z, life: [.18, .4], speed: [0, .5], size: [bo.size * .9 * z, bo.size * 2 * z], colors: [a, b], radius: bo.size * .3 }); if (this.lights) t.light = fx.flash(bo, { col: b, i: 5 * z, reach: 3.5 * z, keep: true, flicker: .3 }); this.trails.set(bo.id, t); }
      t.at(bo);
    }
    for (const [id, t] of this.trails) if (!live.has(id)) { t.stop(); this.trails.delete(id); }
    // a glow in the hand while casting or channelling
    for (const u of M.units) {
      const c = u.casting || u.channel, p = u.pos; if (p.z == null) continue;
      let h = this.held.get(u);
      if (c) { const [a, b] = this.c(c.spell.element); if (!h || h.name !== c.name) { h?.stop(); h = fx.make(u.from(), { loop: true, rate: 60 * z, life: [.2, .45], speed: [.1, .6], size: [.08 * z, .18 * z], colors: [a, b], radius: .1, gravity: .8 }); if (this.lights) h.light = fx.flash(u.from(), { col: b, i: 3 * z, reach: 2.5 * z, keep: true, flicker: .5 }); h.name = c.name; this.held.set(u, h); } h.at(u.from()); }
      else if (h) { h.stop(); this.held.delete(u); }
      // a shimmer round a ward
      let w = this.shields.get(u); const wd = u.ward;
      if (wd) { const [a, b] = this.c(M.book[wd.spell]?.element || 'arcane'); if (!w) { w = fx.make(p, { loop: true, rate: 120 * z, life: [.3, .7], speed: [0, .1], size: [.08, .16], colors: [a, b], radius: Math.max(u.radius * 1.4, u.height * .55), fade: true }); this.shields.set(u, w); } w.at(v3(p.x, p.y + u.height * .5, p.z)); }
      else if (w) { w.stop(); this.shields.delete(u); }
    }
    // areas: a faint ring while it warns, a lingering one while it lasts
    const areas = new Set();
    for (const ar of M.areas) {
      if (ar.z == null) continue; areas.add(ar.id); const [a, b] = this.c(ar.spell.element);
      if (!ar.live) { if (!this.rings.has(ar.id) || ((M.t * 6) | 0) !== this.rings.get(ar.id)) { this.rings.set(ar.id, (M.t * 6) | 0); this.ring(ar, a, b, .25 + .5 * ar.part); } }
      else if (ar.left > 0 && ((M.t * 4) | 0) !== this.rings.get(ar.id)) { this.rings.set(ar.id, (M.t * 4) | 0); this.ring(ar, a, b, .35); }
    }
    for (const id of this.rings.keys()) if (!areas.has(id)) this.rings.delete(id);
    // beams and chains: sparks along them
    for (const be of M.beams) if (be.to && be.from.z != null) { const [a, b] = this.c(be.spell.element); this.line(be.from, be.to, a, b, 10); }
    for (const zp of M.zaps) if (zp.from.z != null && !zp.drawn) { zp.drawn = true; const [a, b] = this.c(zp.element); this.line(zp.from, zp.to, a, b, 12); }
  }
  // a ring of bursts round an area's edge (and a fan for a cone, a strip for a line)
  ring(ar, a, b, k) {
    const fx = this.fx, n = Math.max(8, Math.min(28, Math.round(ar.radius * 5))), y = ar.y + .08, d = ar.dir || v3(0, 0, 1), base = Math.atan2(d.x, d.z || 0);
    const pts = [];
    if (ar.shape === 'cone') for (let i = 0; i <= n; i++) { const t = base - ar.angle + 2 * ar.angle * i / n; pts.push(v3(ar.x + Math.sin(t) * ar.radius, y, ar.z + Math.cos(t) * ar.radius)); }
    else if (ar.shape === 'line') for (let i = 0; i <= n; i++) { const f = ar.radius * i / n; for (const s of [-1, 1]) pts.push(v3(ar.x + d.x * f + s * d.z * ar.width / 2, y, ar.z + d.z * f - s * d.x * ar.width / 2)); }
    else { for (let i = 0; i < n; i++) { const t = TAU * i / n; pts.push(v3(ar.x + Math.sin(t) * ar.radius, y, ar.z + Math.cos(t) * ar.radius)); if (ar.shape === 'ring' && ar.inner > .3) pts.push(v3(ar.x + Math.sin(t) * ar.inner, y, ar.z + Math.cos(t) * ar.inner)); } }
    // and inside it (a burst only): a cone or a line sweeps out from the caster, a circle fills
    if (k >= 1) {
      if (ar.shape === 'cone' || ar.shape === 'line') for (let i = 1; i <= 6; i++) for (let j = -2; j <= 2; j++) { const f = ar.radius * i / 6, t = base + (ar.shape === 'cone' ? ar.angle * j / 2.5 : 0), off = ar.shape === 'line' ? ar.width * j / 5 : 0; pts.push(v3(ar.x + Math.sin(t) * f + d.z * off, y + .5, ar.z + Math.cos(t) * f - d.x * off)); }
      else for (let i = 0; i < n; i++) { const t = TAU * i / n * 2.4, f = ar.radius * Math.sqrt((i + .5) / n); pts.push(v3(ar.x + Math.sin(t) * f, y + .3, ar.z + Math.cos(t) * f)); }
    }
    for (const p of pts) fx.make(p, { burst: Math.max(1, Math.round(6 * k * this.size)), life: [.3, .65], speed: [.3 * k, 1.6 * k], size: [.1 * k + .04, .26 * k + .05], colors: [a, b], gravity: .8 });
    if (k >= 1 && this.lights) fx.flash(v3(ar.x, ar.y + .6, ar.z), { col: b, i: 14 * this.size * Math.min(2, ar.radius / 3), reach: ar.radius * 2.2, life: .3 });
  }
  line(p, q, a, b, n) { for (let i = 0; i <= n; i++) this.fx.make(lerp(p, q, i / n), { burst: 3, life: [.06, .18], speed: [.2, 1.2], size: [.08, .18], colors: [a, b] }); }
  /** Stops every effect it started (a new round). */
  clear() { for (const m of [this.trails, this.held, this.shields]) { for (const t of m.values()) t.stop(); m.clear(); } this.rings.clear(); return this; }
}
