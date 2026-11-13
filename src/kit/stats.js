// Stats that change while you play (Rob's pick 10 of 2026-11-13): numbers made of a base and what is on
// them right now (buffs that run out, perks that stay, debuffs that hurt over time), pools that drain and
// refill (health, mana, stamina), and cooldowns with charges. For real-time games; gs.battle's statuses
// count turns. The kit works out the numbers and says when things start, tick and end: your game decides
// what a buff does to play, and draws the bars, icons and timers.
//
//   const { Stats } = gs.stats;
//   const BUFFS = {
//     haste:  { for: 4, mul: { speed: 1.5 } },                                 // 4 s of half as fast again
//     poison: { for: 6, every: 1, drain: { hp: 3 }, bad: true, stacks: 3, stack: 'stack' },   // 3 a second, up to three doses
//     shield: { for: 5, add: { armour: 10 }, tags: ['shielded'] },
//     tough:  { add: { 'hp.max': 25 } },                                      // no `for`: a perk, until taken off
//     iron:   { blocks: ['poison'] },                                         // immune: poison can't go on
//   };
//   reset() {
//     hero = new Stats({ speed: 6, damage: 10, armour: 0, hp: { max: 100 }, mana: { max: 50, regen: 8, delay: 1 } }, { buffs: BUFFS });
//     hero.cool('dash', 2, { charges: 2 });
//   }
//   update(dt) { hero.update(dt); x += hero.get('speed') * dt; if (hero.empty('hp')) api.over(); }
//   down() { if (hero.use('dash')) dash(); }
//   hit(n) { hero.change('hp', -Math.max(1, n - hero.get('armour'))); }
//   draw(c) { bar(hero.part('hp')); for (const b of hero.buffs) icon(b.id, b.part); ring(hero.part('dash', 'cool')); }
//
// A stat is (base + every add) x every mul, then held between its min and max. A pool (an object with a
// max) is an amount between 0 and its max, and its max and regen are stats too ('hp.max', 'mana.regen'),
// so a buff can raise them. Buffs and perks go on by name from the table, or with a spec of their own.
// Events (on): 'buff' (on, or stacked again), 'end' (ran out or taken off), 'tick' (every `every` seconds
// while on), 'change' (a pool moved), 'empty' and 'full' (a pool), 'ready' (a cooldown came back), 'blocked'.
import { timed } from './prof.js';

const STACKING = ['refresh', 'extend', 'stack', 'keep', 'strongest'];

/** One buff or perk on a Stats: id, spec, left (seconds, Infinity for a perk), stacks, part (time left, 1..0). */
class Effect {
  constructor(id, spec, stacks = 1) { this.id = id; this.spec = spec; this.stacks = stacks; this.left = spec.for ?? Infinity; this.since = 0; this.next = spec.every ?? 0; }
  get perk() { return !(this.spec.for > 0); }
  get bad() { return !!this.spec.bad; }
  /** How much of its time is left, 1..0 (1 for a perk): for a ring or a shrinking icon. */
  get part() { return this.perk ? 1 : Math.max(0, Math.min(1, this.left / this.spec.for)); }
  get tags() { return this.spec.tags || []; }
}

export class Stats {
  /**
   * stats: { name: number | { base, min, max } (a stat) | { max, regen, delay, start, min } (a pool) }.
   * buffs: a table { id: spec } that buff(id) and perk(id) read, and unpack() needs. A spec: for (seconds; none:
   * a perk), add / mul ({ stat: n }), tags, blocks (tags and ids that can't go on while this is on), drain
   * ({ pool: per second }, negative to heal), every + tick(stats, effect) (and drain counted each `every`
   * instead of smoothly), stacks (most, 1), stack ('refresh' the time, 'extend' it, 'stack' a dose more
   * (each its own add, mul and drain), 'keep' the first, 'strongest' keeps the longer), bad (a debuff: cleanse()).
   */
  constructor(stats = {}, { buffs = {} } = {}) {
    this.table = buffs; this.base = {}; this.lim = {}; this.pools = {}; this.effects = new Map(); this.cools = {};
    this.handlers = {}; this.cache = null;
    for (const [k, v] of Object.entries(stats)) {
      if (typeof v === 'number') this.base[k] = v;
      else if (v && typeof v === 'object' && 'base' in v) { this.base[k] = v.base; this.lim[k] = [v.min ?? -Infinity, v.max ?? Infinity]; }
      else if (v && typeof v === 'object' && 'max' in v) {
        this.base[k + '.max'] = v.max; this.base[k + '.regen'] = v.regen || 0;
        this.pools[k] = { now: v.start ?? v.max, delay: v.delay || 0, since: Infinity, min: v.min ?? 0, wasFull: (v.start ?? v.max) >= v.max, wasEmpty: false };
      } else throw new Error(`Stats: '${k}' should be a number, { base, min, max } or a pool { max, regen, delay }`);
    }
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }

  /* ---------- stats ---------- */
  /** A stat with everything on it now; for a pool, its amount. Unknown names give 0. */
  get(name) {
    const p = this.pools[name]; if (p) return p.now;
    const c = this.cache ||= this.work();
    return c[name] ?? 0;
  }
  /** The stat without what is on it. */
  baseOf(name) { return this.base[name] ?? 0; }
  /** Sets a stat's base (levelling up, a new weapon). */
  setBase(name, v) { this.base[name] = v; this.cache = null; this.fit(); return this; }
  /** (base + adds) x muls for every stat, held to their limits. */
  work() {
    const add = {}, mul = {};
    for (const e of this.effects.values()) {
      const n = e.stacks;
      for (const [k, v] of Object.entries(e.spec.add || {})) add[k] = (add[k] || 0) + v * n;
      for (const [k, v] of Object.entries(e.spec.mul || {})) mul[k] = (mul[k] ?? 1) * Math.pow(v, n);
    }
    const out = {};
    for (const k of new Set([...Object.keys(this.base), ...Object.keys(add), ...Object.keys(mul)])) {
      let v = ((this.base[k] || 0) + (add[k] || 0)) * (mul[k] ?? 1); const l = this.lim[k];
      if (l) v = Math.max(l[0], Math.min(l[1], v));
      out[k] = v;
    }
    return out;
  }

  /* ---------- pools ---------- */
  /** A pool's most (its 'name.max' stat). */
  max(name) { return this.get(name + '.max'); }
  /** How full: a pool 0..1; a cooldown with 'cool' (1 = ready); a buff's time left by its id. */
  part(name, kind) {
    if (kind === 'cool') { const c = this.cools[name]; if (!c) return 1; return c.n >= c.charges ? 1 : Math.max(0, Math.min(1, 1 - c.left / Math.max(1e-6, c.time))); }
    if (this.pools[name]) { const m = this.max(name); return m > 0 ? Math.max(0, Math.min(1, this.pools[name].now / m)) : 0; }
    const e = this.effects.get(name); return e ? e.part : 0;
  }
  /** Moves a pool by n (negative takes away), held between its min and max; a loss holds off regen for its delay. Returns how much it moved. */
  change(name, n, why = null) {
    const p = this.pools[name]; if (!p) throw new Error(`Stats: '${name}' is not a pool`);
    const was = p.now; p.now = Math.max(p.min, Math.min(this.max(name), p.now + n));
    if (n < 0) p.since = 0;
    const by = p.now - was;
    if (by) { this.emit('change', { stat: name, by, now: p.now, why }); this.edges(name, p); }
    return by;
  }
  /** Takes n from a pool if it holds that much (mana for a spell). True if it did. */
  spend(name, n) { if (this.get(name) < n) return false; this.change(name, -n, 'spent'); return true; }
  /** Fills a pool to its max (or sets it to a share of it). */
  fill(name, share = 1) { const p = this.pools[name]; return this.change(name, this.max(name) * share - p.now, 'fill'); }
  empty(name) { const p = this.pools[name]; return !!p && p.now <= p.min; }
  full(name) { return this.get(name) >= this.max(name); }
  edges(name, p) {
    const full = p.now >= this.max(name), empty = p.now <= p.min;
    if (empty && !p.wasEmpty) this.emit('empty', name);
    if (full && !p.wasFull) this.emit('full', name);
    p.wasFull = full; p.wasEmpty = empty;
  }
  // a pool's max went down: hold the amount under it
  fit() { for (const [k, p] of Object.entries(this.pools)) { const m = this.max(k); if (p.now > m) p.now = m; this.edges(k, p); } }

  /* ---------- buffs and perks ---------- */
  spec(id, spec) {
    const s = spec || this.table[id]; if (!s) throw new Error(`Stats: no buff '${id}' (give it a spec, or put it in the buffs table)`);
    if (s.stack && !STACKING.includes(s.stack)) throw new Error(`Stats: buff '${id}' stack should be one of ${STACKING.join(', ')}`);
    return s;
  }
  /** Is something on that keeps this out (its id or one of its tags)? */
  blocked(id, s) {
    for (const e of this.effects.values()) for (const b of e.spec.blocks || []) if (b === id || (s.tags || []).includes(b)) return e;
    return null;
  }
  /**
   * Puts a buff on (by its name in the table, or with a spec). Already on: as its stack rule says. Returns
   * the effect, or null when something on blocks it ('blocked' event).
   */
  buff(id, spec = null, o = {}) {
    const s = this.spec(id, spec), by = this.blocked(id, s);
    if (by) { this.emit('blocked', { id, by: by.id }); return null; }
    let e = this.effects.get(id);
    if (e) {
      const rule = s.stack || 'refresh', most = s.stacks || 1, t = o.for ?? s.for ?? Infinity;
      if (rule === 'keep') return e;
      if (rule === 'stack' && e.stacks < most) e.stacks++;
      if (rule === 'extend') e.left += t; else if (rule === 'strongest') e.left = Math.max(e.left, t); else e.left = t;
      if (e.spec.for > 0 && t > e.spec.for && rule !== 'extend') e.spec = { ...e.spec, for: t };
    } else {
      e = new Effect(id, o.for != null ? { ...s, for: o.for } : s, Math.max(1, Math.min(s.stacks || 1, o.stacks || 1)));
      this.effects.set(id, e);
      // what it blocks comes off as it goes on (a cure that also makes you immune)
      for (const b of s.blocks || []) for (const x of [...this.effects.values()]) if (x !== e && (x.id === b || x.tags.includes(b))) this.remove(x.id, 'blocked');
    }
    this.cache = null; this.fit();
    this.emit('buff', e);
    return e;
  }
  /** A buff with no end: on until remove(). */
  perk(id, spec = null, o = {}) { const s = this.spec(id, spec); return this.buff(id, { ...s, for: undefined }, { ...o, for: undefined }); }
  /** Takes one off (or one dose of it with { dose: true }). */
  remove(id, why = 'removed', { dose = false } = {}) {
    const e = this.effects.get(id); if (!e) return false;
    if (dose && e.stacks > 1) { e.stacks--; this.cache = null; this.fit(); return true; }
    this.effects.delete(id); this.cache = null; this.fit(); this.emit('end', e, why); return true;
  }
  /** Is this buff or perk on (by id), and how many doses. */
  has(id) { return this.effects.get(id)?.stacks || 0; }
  /** Does anything on carry this tag ('stunned', 'burning')? */
  is(tag) { for (const e of this.effects.values()) if (e.tags.includes(tag)) return true; return false; }
  /** What is on, buffs first, the soonest to end first: [{ id, left, part, stacks, perk, bad, tags, spec }]. */
  get buffs() { return [...this.effects.values()].sort((a, b) => (a.perk - b.perk) || a.left - b.left); }
  /** Takes off every debuff (bad: true), or those fn(effect) picks. Returns how many. */
  cleanse(fn = e => e.bad) { let n = 0; for (const e of [...this.effects.values()]) if (fn(e)) { this.remove(e.id, 'cleansed'); n++; } return n; }

  /* ---------- cooldowns ---------- */
  /** A cooldown: seconds per use, charges (uses stored, refilling one at a time), by (a stat that speeds it up: 1.25 = a quarter quicker). */
  cool(name, seconds, { charges = 1, by = null, start = charges } = {}) { this.cools[name] = { time: seconds, charges, by, n: start, left: start < charges ? seconds : 0 }; return this; }
  // how fast it refills now (its `by` stat; 1 without), so a haste mid-wait speeds up the rest of the wait
  coolRate(c) { return Math.max(.05, c.by ? this.get(c.by) || 1 : 1); }
  /** Can it be used now? */
  ready(name) { const c = this.cools[name]; if (!c) throw new Error(`Stats: no cooldown '${name}' (make it with cool())`); return c.n > 0; }
  /** Uses it if ready (one charge) and starts it refilling. True if it was used. */
  use(name) { if (!this.ready(name)) return false; const c = this.cools[name]; if (c.n === c.charges) c.left = c.time; c.n--; return true; }
  /** Seconds until the next charge (0 when full), and charges ready. */
  left(name) { const c = this.cools[name]; return !c || c.n >= c.charges ? 0 : Math.max(0, c.left) / this.coolRate(c); }
  charges(name) { return this.cools[name]?.n ?? 0; }
  /** Takes seconds off a cooldown's wait (a perk, a pickup); all: refills every charge. */
  hurry(name, seconds, { all = false } = {}) { const c = this.cools[name]; if (!c) return; if (all) { c.n = c.charges; c.left = 0; this.emit('ready', name); } else this.coolStep(name, c, seconds); }
  coolStep(name, c, dt) {
    if (c.n >= c.charges) return;
    c.left -= dt * this.coolRate(c);   // (left: seconds of its own time; by speeds the clock up)
    while (c.left <= 0 && c.n < c.charges) { c.n++; this.emit('ready', name); if (c.n < c.charges) c.left += c.time; else c.left = 0; }
  }

  /* ---------- time ---------- */
  /** Moves everything on by dt seconds: buffs run down and tick, pools drain and refill, cooldowns refill. */
  update(dt) {
    if (!(dt > 0)) return;
    for (const e of [...this.effects.values()]) {
      if (!this.effects.has(e.id)) continue;   // (taken off by another's tick)
      e.since += dt;
      const dr = e.spec.drain;
      if (e.spec.every > 0) {
        e.next -= dt;
        while (e.next <= 0 && this.effects.get(e.id) === e) {
          e.next += e.spec.every;
          if (dr) for (const [k, v] of Object.entries(dr)) if (this.pools[k]) this.change(k, -v * e.stacks * e.spec.every, e.id);
          this.emit('tick', e); e.spec.tick?.(this, e);
        }
      } else if (dr) for (const [k, v] of Object.entries(dr)) if (this.pools[k]) this.change(k, -v * e.stacks * dt, e.id);
      if (this.effects.get(e.id) !== e) continue;
      if (!e.perk) { e.left -= dt; if (e.left <= 0) this.remove(e.id, 'ran out'); }
    }
    for (const [k, p] of Object.entries(this.pools)) {
      p.since += dt; const r = this.get(k + '.regen'), t = Math.min(dt, p.since - p.delay);   // (only the time past the delay)
      if (r && t > 0 && (r > 0 ? p.now < this.max(k) : p.now > p.min)) this.change(k, r * t, 'regen');
    }
    for (const [k, c] of Object.entries(this.cools)) this.coolStep(k, c, dt);
  }
  /** Everything taken off and refilled, cooldowns ready (keep: { perks: true } leaves the perks on). */
  clear({ perks = false } = {}) {
    for (const e of [...this.effects.values()]) if (!(perks && e.perk)) this.effects.delete(e.id);
    this.cache = null;
    for (const [k, p] of Object.entries(this.pools)) { p.now = this.max(k); p.since = Infinity; p.wasFull = true; p.wasEmpty = false; }
    for (const c of Object.values(this.cools)) { c.n = c.charges; c.left = 0; }
    return this;
  }

  /* ---------- saving ---------- */
  /** What to keep with api.save(): bases, pools, what is on (by id: their specs come from the table), cooldowns. */
  pack() {
    const r = v => Math.round(v * 1000) / 1000;
    return {
      base: { ...this.base },
      pools: Object.fromEntries(Object.entries(this.pools).map(([k, p]) => [k, r(p.now)])),
      on: [...this.effects.values()].filter(e => this.table[e.id]).map(e => [e.id, e.perk ? -1 : r(e.left), e.stacks]),
      cool: Object.fromEntries(Object.entries(this.cools).map(([k, c]) => [k, [c.n, r(c.left)]])),
    };
  }
  /** Puts back what pack() gave (buffs not in the table are left out). */
  unpack(d) {
    if (!d) return this;
    Object.assign(this.base, d.base || {}); this.effects.clear();
    for (const [id, left, stacks] of d.on || []) {
      const s = this.table[id]; if (!s) continue;
      const e = new Effect(id, left < 0 ? { ...s, for: undefined } : s, stacks || 1);   // (-1: it was on as a perk)
      if (left >= 0 && s.for > 0) e.left = left;
      this.effects.set(id, e);
    }
    this.cache = null;
    for (const [k, v] of Object.entries(d.pools || {})) if (this.pools[k]) { this.pools[k].now = v; this.edges(k, this.pools[k]); }
    for (const [k, [n, left]] of Object.entries(d.cool || {})) if (this.cools[k]) Object.assign(this.cools[k], { n, left });
    this.fit(); return this;
  }
}
timed(Stats.prototype, 'update', 'stats');
