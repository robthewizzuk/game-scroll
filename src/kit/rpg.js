// Role-playing games (Rob's RPG picks of 2026-11-15): a hero who grows (levels, attributes, a skill tree,
// gear whose numbers count) and a world that remembers what the hero did (fame, a good or evil lean,
// standing with each faction, bounties, prices, how people greet you). The kit keeps the numbers and the
// rules; your game decides what a skill does, and draws the bars, the tree and the people.
//
//   const { Stats } = gs.stats, { Growth, Reputation } = gs.rpg;
//   const TREE = {
//     cleave: { ranks: 3, perk: { mul: { damage: 1.1 } } },                       // +10% damage a rank
//     whirl:  { needs: ['cleave:2'], level: 4 },                                   // a move: grow.has('whirl')
//     ward:   { perk: { add: { armour: 5 } }, excludes: ['frenzy'] },              // one or the other
//     frenzy: { perk: { mul: { speed: 1.2 } }, excludes: ['ward'] },
//   };
//   reset() {
//     hero = new Stats({ damage: 4, armour: 0, speed: 5, hp: { max: 60 } });
//     grow = new Growth(hero, { attributes: { might: 5, grace: 5, wits: 5 }, tree: TREE,
//       derive: { damage: a => a.might, 'hp.max': a => 8 * a.might, speed: a => .1 * a.grace } });
//     grow.wear(inv);                                   // a gs.items Inventory: what is equipped counts (defs' stats)
//     rep = new Reputation({ factions: { town: {}, bandits: { start: -20, rivals: ['town'], fights: true } },
//       deeds: { rescue: { good: 15, fame: 10, town: 20 }, steal: { good: -5, town: -15, crime: 50 } } });
//   }
//   wolfDown() { grow.gain(30); rep.did('rescue'); }   // grow.on('level', n => feel.powerup(...))
//   draw(c) { bar(grow.part); for (const n of grow.nodes) node(n.id, n.rank, n.ok); greet(rep.mood('town')); }
//   save: api.save({ grow: grow.pack(), rep: rep.pack() });  grow.unpack(d.grow); rep.unpack(d.rep);
//
// Growth: XP gives levels on a curve, each level gives attribute points and skill points. Attributes feed
// the Stats through derive (added to each stat's base), skills put their perk on the Stats once a rank,
// and equipped gear puts its stats on: a def's stats: { add, mul } in the Inventory's table. With no Stats,
// read grow.value('damage') yourself.
// Reputation: axes (good, from -100 to 100, and fame, 0 to 100, unless you give your own) and factions
// (-100 to 100). A deed moves the hero's conscience (the good axis) whoever saw it; fame, factions and
// bounties only move when someone saw it (did(id, { seen: false }) for a deed nobody saw, or a list of the
// factions that did). A faction's rivals move the other way by a share, its allies the same way.
// Use its numbers anywhere: rep.price(), rep.mood(), rep.title(), and rep.vars() for a conversation.

import { linksFor, linked } from './links.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const parseNeed = s => { const m = String(s).match(/^(.*?)(?::(\d+))?$/); return { id: m[1], rank: m[2] ? +m[2] : 1 }; };

/* ---------------------------------------------------------------- Growth */

/** XP needed in all to reach a level (1 needs none): base * (level - 1)^power. */
export const xpTo = (level, { base = 100, power = 1.5 } = {}) => level <= 1 ? 0 : Math.round(base * Math.pow(level - 1, power));

export class Growth {
  /**
   * stats: a gs.stats Stats the hero's numbers live on (or null). Options: attributes ({ name: start }),
   * derive ({ stat: attributes => amount added to its base }), tree ({ id: { ranks, cost, level, needs:
   * ['id' | 'id:rank'], excludes: [ids], perk: { add, mul } (once a rank), name, at, tags } }), curve
   * ({ base, power } or level => XP needed in all), cap (top level, 50), points (attribute points a level, 3),
   * skills (skill points a level, 1), most (top of an attribute, 99, or { name: top }), refill (fill the
   * pools on a level up, true), level and xp (to start with).
   */
  constructor(stats = null, { attributes = {}, derive = {}, tree = {}, curve = {}, cap = 50, points = 3, skills = 1, most = 99, refill = true, level = 1, xp = null, link = true } = {}) {
    linksFor(null, link)?.join('growth', this);
    this.stats = stats; this.derive = derive; this.tree = tree; this.curve = curve; this.cap = cap; this.perLevel = { points, skills };
    this.most = most; this.refill = refill; this.handlers = {}; this.start = { ...attributes };
    for (const [id, n] of Object.entries(tree)) for (const d of n.needs || []) if (!tree[parseNeed(d).id]) throw new Error(`Growth: skill '${id}' needs '${d}', which is not in the tree`);
    this.gearOn = {}; this.inv = null; this.base = {};
    this.restart(level, xp);
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Back to the start (level 1 unless given), keeping the tree and what is worn. */
  restart(level = 1, xp = null) {
    this.level = clamp(level, 1, this.cap); this.xp = xp ?? this.need(this.level);
    this.attrs = { ...this.start }; this.ranks = {};
    this.points = (this.level - 1) * this.perLevel.points; this.skillPoints = (this.level - 1) * this.perLevel.skills;
    this.apply(); return this;
  }
  /** XP needed in all for a level. */
  need(level) { return typeof this.curve === 'function' ? Math.round(this.curve(level)) : xpTo(level, this.curve); }
  /** XP in all for the next level (Infinity at the cap). */
  get next() { return this.level >= this.cap ? Infinity : this.need(this.level + 1); }
  /** 0..1 of the way to the next level: for a bar. */
  get part() { if (this.level >= this.cap) return 1; const a = this.need(this.level), b = this.next; return clamp((this.xp - a) / Math.max(1, b - a), 0, 1); }
  /** Gives XP ('xp' event); returns the levels gained ('level' event once for each, with the new level). */
  gain(n, why = null) {
    if (!(n > 0)) return 0;
    this.xp += n; this.emit('xp', n, why); let up = 0;
    while (this.level < this.cap && this.xp >= this.next) {
      this.level++; up++; this.points += this.perLevel.points; this.skillPoints += this.perLevel.skills;
      this.emit('level', this.level);
    }
    if (up) { this.apply(); if (this.refill && this.stats) for (const k of Object.keys(this.stats.pools || {})) this.stats.fill(k); }
    return up;
  }

  /* ---------- attributes ---------- */
  /** An attribute's value now. */
  attr(name) { return this.attrs[name] ?? 0; }
  top(name) { return typeof this.most === 'object' ? this.most[name] ?? 99 : this.most; }
  /** Spends points on an attribute ('raise' event). False if there aren't enough points or it is at its top. */
  raise(name, n = 1) {
    if (!(name in this.attrs)) throw new Error(`Growth: no attribute '${name}' (have ${Object.keys(this.attrs).join(', ')})`);
    if (this.points < n || this.attrs[name] + n > this.top(name)) return false;
    this.attrs[name] += n; this.points -= n; this.apply(); this.emit('raise', name, this.attrs[name]); return true;
  }

  /* ---------- the skill tree ---------- */
  /** A skill's rank (0: not learnt). */
  rank(id) { return this.ranks[id] || 0; }
  /** Learnt (at least rank 1, or the rank asked)? */
  has(id, rank = 1) { return this.rank(id) >= rank; }
  /** Can the next rank of a skill be learnt now? { ok, why: 'ranks' | 'level' | 'needs' | 'excluded' | 'points', needs: [what is missing], cost }. */
  can(id) {
    const n = this.tree[id]; if (!n) throw new Error(`Growth: no skill '${id}' in the tree`);
    const cost = n.cost ?? 1, r = this.rank(id), out = (ok, why = null, needs = []) => ({ ok, why, needs, cost });
    if (r >= (n.ranks ?? 1)) return out(false, 'ranks');
    if (this.level < (n.level ?? 1)) return out(false, 'level');
    const missing = (n.needs || []).filter(d => { const { id: k, rank } = parseNeed(d); return this.rank(k) < rank; });
    if (missing.length) return out(false, 'needs', missing);
    const clash = (n.excludes || []).filter(k => this.rank(k) > 0);
    if (clash.length) return out(false, 'excluded', clash);
    if (this.skillPoints < cost) return out(false, 'points');
    return out(true);
  }
  /** Learns the next rank of a skill ('learn' event with id and rank). False if can() says no. */
  learn(id) {
    if (!this.can(id).ok) return false;
    this.skillPoints -= this.tree[id].cost ?? 1; this.ranks[id] = this.rank(id) + 1;
    this.apply(); this.emit('learn', id, this.ranks[id]); return true;
  }
  /** Every skill for drawing the tree: [{ id, name, rank, ranks, ok, why, needs, at, tags }]. */
  get nodes() {
    return Object.entries(this.tree).map(([id, n]) => { const c = this.can(id); return { id, name: n.name ?? id, rank: this.rank(id), ranks: n.ranks ?? 1, ok: c.ok, why: c.why, needs: (n.needs || []).map(d => parseNeed(d)), at: n.at ?? null, tags: n.tags || [] }; });
  }
  /** Gives back every point spent (attributes too unless keep: 'attributes'). */
  respec({ keep = null } = {}) {
    for (const [id, r] of Object.entries(this.ranks)) this.skillPoints += r * (this.tree[id]?.cost ?? 1);
    this.ranks = {};
    if (keep !== 'attributes') for (const k of Object.keys(this.attrs)) { this.points += this.attrs[k] - (this.start[k] ?? 0); this.attrs[k] = this.start[k] ?? 0; }
    this.apply(); this.emit('respec'); return this;
  }

  /* ---------- gear ---------- */
  /** Puts a piece of gear's numbers on ({ add, mul }), or takes them off with null. */
  gear(slot, spec) { if (spec) this.gearOn[slot] = spec; else delete this.gearOn[slot]; this.apply(); return this; }
  /** Follows a gs.items Inventory: what sits in its equip slots counts, from its defs' stats: { add, mul }. */
  wear(inv) {
    this.inv = inv;
    const sync = () => {
      for (const k of Object.keys(this.gearOn)) delete this.gearOn[k];
      for (const [slot, s] of Object.entries(inv.equip || {})) { const st = s && inv.def(s.id).stats; if (st) this.gearOn[slot] = st; }
      this.apply();
    };
    if (!inv._growthWatch) { inv._growthWatch = true; for (const ev of ['move', 'add', 'take', 'sort']) inv.on(ev, () => inv._growth?.()); }
    inv._growth = sync; sync(); return this;
  }

  /* ---------- the numbers ---------- */
  /** What attributes, skills and gear add to a stat, and multiply it by: { add, mul }. */
  parts(stat) {
    let add = 0, mul = 1;
    if (this.derive[stat]) add += this.derive[stat](this.attrs, this) || 0;
    for (const [id, r] of Object.entries(this.ranks)) { const p = this.tree[id]?.perk; if (p) { add += (p.add?.[stat] || 0) * r; mul *= Math.pow(p.mul?.[stat] ?? 1, r); } }
    for (const g of Object.values(this.gearOn)) { add += g.add?.[stat] || 0; mul *= g.mul?.[stat] ?? 1; }
    return { add, mul };
  }
  /** A stat as it is now: the Stats' own when there is one, else (base + adds) x muls from what Growth knows. */
  value(stat, base = this.base[stat] ?? 0) { if (this.stats) return this.stats.get(stat); const { add, mul } = this.parts(stat); return (base + add) * mul; }
  // the hero's attributes, skills and gear go onto the Stats as perks (their own names, so the game's buffs stay apart)
  apply() {
    const s = this.stats; if (!s) return;
    const derived = {}; for (const k of Object.keys(this.derive)) derived[k] = this.derive[k](this.attrs, this) || 0;
    s.remove('rpg:attributes', 'growth'); if (Object.keys(derived).length) s.perk('rpg:attributes', { add: derived });
    for (const e of [...s.effects.keys()]) if (e.startsWith('rpg:skill:') || e.startsWith('rpg:gear:')) s.remove(e, 'growth');
    for (const [id, r] of Object.entries(this.ranks)) { const p = this.tree[id]?.perk; if (r && p) s.perk('rpg:skill:' + id, { add: p.add, mul: p.mul, tags: this.tree[id].tags, stacks: r }, { stacks: r }); }
    for (const [slot, g] of Object.entries(this.gearOn)) s.perk('rpg:gear:' + slot, { add: g.add, mul: g.mul, tags: g.tags });
  }
  /** A small object for api.save(). */
  pack() { return { l: this.level, x: this.xp, a: { ...this.attrs }, r: { ...this.ranks }, p: this.points, s: this.skillPoints }; }
  unpack(d) {
    if (!d) return this;
    this.level = clamp(d.l ?? 1, 1, this.cap); this.xp = d.x ?? this.need(this.level);
    this.attrs = { ...this.start, ...(d.a || {}) }; this.ranks = {}; for (const [k, r] of Object.entries(d.r || {})) if (this.tree[k]) this.ranks[k] = Math.min(r, this.tree[k].ranks ?? 1);
    this.points = d.p ?? 0; this.skillPoints = d.s ?? 0;
    if (this.inv) this.inv._growth?.(); else this.apply();
    return this;
  }
}

/* ---------------------------------------------------------------- Reputation */

const RANKS = [[-60, 'hated'], [-20, 'disliked'], [20, 'neutral'], [60, 'liked'], [Infinity, 'loved']];
const axisOf = v => Array.isArray(v) ? { min: v[0], max: v[1], start: v[2] ?? Math.max(v[0], Math.min(v[1], 0)) } : { min: v.min ?? -100, max: v.max ?? 100, start: v.start ?? 0, fade: v.fade || 0 };

export class Reputation {
  /**
   * axes: { name: { min, max, start, fade } | [min, max] } (default good -100..100 and fame 0..100).
   * factions: { name: { start, rivals, allies, law (it puts bounties on crimes and arrests), fights (when it hates
   * you it attacks, else it flees), timid (a feared villain sends it running), fade } }. deeds: { id: { axis or
   * faction: amount, crime (a bounty put on by each law faction that saw it) } }. share: how far rivals and allies
   * move with a faction (.5). inner: axes a deed moves even when nobody saw it (['good']). good, fame: which axes
   * mean those (for mood, price and titles). titles: [{ name, ...axisOrFaction: [low, high] }], first match wins.
   * fade: points a second each axis and faction drifts back to its start (per axis or faction too).
   */
  constructor({ axes = { good: [-100, 100, 0], fame: [0, 100, 0] }, factions = {}, deeds = {}, share = .5, inner = ['good'], good = 'good', fame = 'fame', titles = [], ranks = RANKS, keep = 40, link = true } = {}) {
    linksFor(null, link)?.join('reputation', this);
    this.axes = {}; for (const [k, v] of Object.entries(axes)) this.axes[k] = axisOf(v);
    this.factions = {}; for (const [k, v] of Object.entries(factions)) { if (k in this.axes) throw new Error(`Reputation: '${k}' is both an axis and a faction`); this.factions[k] = { start: 0, rivals: [], allies: [], ...v }; }
    for (const [k, f] of Object.entries(this.factions)) for (const r of [...f.rivals, ...f.allies]) if (!this.factions[r]) throw new Error(`Reputation: faction '${k}' names '${r}', which is not a faction`);
    // rivals and allies go both ways: named on either side
    for (const [k, f] of Object.entries(this.factions)) { f.rivals = [...f.rivals]; f.allies = [...f.allies]; }
    for (const [k, f] of Object.entries(this.factions)) for (const [list, other] of [['rivals', f.rivals], ['allies', f.allies]]) for (const r of other) if (!this.factions[r][list].includes(k)) this.factions[r][list].push(k);
    for (const [id, d] of Object.entries(deeds)) for (const k of Object.keys(d)) if (!['crime', 'name', 'tags'].includes(k) && !(k in this.axes) && !(k in this.factions)) throw new Error(`Reputation: deed '${id}' moves '${k}', which is neither an axis nor a faction`);
    Object.assign(this, { deeds, share, inner, goodAxis: good, fameAxis: fame, titles, rankTable: ranks, keep });
    this.handlers = {}; this.restart();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Everything back to its start. */
  restart() {
    this.now = {}; for (const [k, a] of Object.entries(this.axes)) this.now[k] = a.start;
    this.stand = {}; for (const [k, f] of Object.entries(this.factions)) this.stand[k] = f.start;
    this.bounties = {}; this.counts = {}; this.log = []; this.fadeOn = { ...this.fadeTable() }; return this;
  }
  fadeTable() { const o = {}; for (const [k, a] of Object.entries(this.axes)) o[k] = a.fade || 0; for (const [k, f] of Object.entries(this.factions)) o[k] = f.fade || 0; return o; }
  /** An axis's value. */
  get(axis) { return this.now[axis] ?? 0; }
  /** An axis from -1 to 1 (or 0 to 1 for one that starts at its bottom). */
  lean(axis) { const a = this.axes[axis]; if (!a) return 0; const v = this.get(axis); return a.min >= 0 ? (v - a.min) / Math.max(1e-6, a.max - a.min) : v >= 0 ? v / Math.max(1e-6, a.max) : -v / Math.min(-1e-6, a.min); }
  /** A faction's standing, -100..100. */
  with(faction) { return this.stand[faction] ?? 0; }
  /** A faction's standing in words: 'hated' | 'disliked' | 'neutral' | 'liked' | 'loved' (or your ranks). */
  rank(faction) { const v = this.with(faction); for (const [top, name] of this.rankTable) if (v < top) return name; return this.rankTable[this.rankTable.length - 1][1]; }
  /** The bounty a law faction has on the hero. */
  bounty(faction) { return this.bounties[faction] || 0; }
  /** Pays a bounty off (or serves the time): it goes, and the faction's standing comes up a little. */
  pay(faction) { const b = this.bounty(faction); if (!b) return 0; delete this.bounties[faction]; this.move(faction, Math.min(20, b / 10), 'paid'); this.emit('paid', faction, b); return b; }
  /** Times a deed was done (that anyone saw, or not: counts both). */
  done(id) { return this.counts[id] || 0; }
  /** Moves an axis or a faction by hand. */
  move(key, by, why = null) {
    if (key in this.axes) { const a = this.axes[key], was = this.now[key]; this.now[key] = clamp(was + by, a.min, a.max); if (this.now[key] !== was) this.emit('change', key, this.now[key] - was, why); return this; }
    if (!(key in this.factions)) throw new Error(`Reputation: no axis or faction '${key}'`);
    const was = this.stand[key], wasRank = this.rank(key); this.stand[key] = clamp(was + by, -100, 100);
    if (this.stand[key] !== was) { this.emit('change', key, this.stand[key] - was, why); if (this.rank(key) !== wasRank) this.emit('rank', key, this.rank(key), wasRank); }
    return this;
  }
  /**
   * The hero did something: a deed from the table (or a spec of its own). seen: true (everyone), false (nobody:
   * only the inner axes move) or a list of the factions that saw (fame moves if anyone did). by: scales it.
   * Returns { id: moved } of what changed.
   */
  did(id, { seen = true, by = 1, spec = null } = {}) {
    const d = spec || this.deeds[id]; if (!d) throw new Error(`Reputation: no deed '${id}' (give it a spec, or put it in the deeds table)`);
    const saw = seen === true ? Object.keys(this.factions) : Array.isArray(seen) ? seen : [], anyone = seen === true || saw.length > 0;
    const out = {}, put = (k, v) => { if (!v) return; const before = k in this.axes ? this.get(k) : this.with(k); this.move(k, v, id); const after = k in this.axes ? this.get(k) : this.with(k); if (after !== before) out[k] = (out[k] || 0) + after - before; };
    for (const [k, v] of Object.entries(d)) if (k in this.axes && (anyone || this.inner.includes(k))) put(k, v * by);
    const direct = Object.keys(d).filter(k => k in this.factions);
    for (const k of direct) if (saw.includes(k)) {
      const v = d[k] * by; put(k, v);
      const f = this.factions[k];
      for (const r of f.rivals) if (!direct.includes(r)) put(r, -v * this.share);
      for (const a of f.allies) if (!direct.includes(a)) put(a, v * this.share);
    }
    if (d.crime) for (const k of saw) if (this.factions[k]?.law) { this.bounties[k] = (this.bounties[k] || 0) + d.crime * by; out['bounty:' + k] = d.crime * by; }
    this.counts[id] = (this.counts[id] || 0) + 1;
    this.log.push({ id, seen: anyone }); if (this.log.length > this.keep) this.log.shift();
    this.emit('deed', id, out);
    return out;
  }
  /** Drifts axes and factions with fade back towards their start (memories fade). */
  update(dt) {
    for (const [k, f] of Object.entries(this.fadeOn)) if (f > 0) {
      const home = k in this.axes ? this.axes[k].start : this.factions[k].start, v = k in this.axes ? this.now[k] : this.stand[k];
      const nv = v > home ? Math.max(home, v - f * dt) : Math.min(home, v + f * dt);
      if (k in this.axes) this.now[k] = nv; else this.stand[k] = nv;
    }
  }
  /**
   * How someone of a faction meets the hero: 'arrest' (a law faction with a bounty on them), 'attack', 'flee',
   * 'avoid', 'ignore', 'stare' (a famous stranger), 'greet', 'bow', 'cheer' (loved and famous). Your game plays it.
   */
  mood(faction) {
    // (this.with in brackets: without them CodeQL's parser reads 'with(...) / 100, ... /' as a regex)
    const f = this.factions[faction] || {}, s = (this.with(faction)) / 100, fame = this.lean(this.fameAxis), g = this.lean(this.goodAxis);
    if (f.law && this.bounty(faction) > 0) return 'arrest';
    if (s <= -.6) return f.fights ? 'attack' : 'flee';
    if (f.timid && g <= -.5 && fame >= .5) return 'flee';
    if (s <= -.2) return 'avoid';
    if (s >= .6) return fame >= .5 ? 'cheer' : 'bow';
    if (s >= .2) return 'greet';
    return fame >= .3 ? 'stare' : 'ignore';
  }
  /** A price from someone of a faction: dearer when they dislike the hero, cheaper when they like them (spread: .25 at the ends). sell: what they pay the hero (half, moved the other way). */
  price(base, faction = null, { sell = false, spread = .25 } = {}) {
    const s = faction ? this.with(faction) / 100 : 0;
    return Math.max(sell ? 0 : 1, Math.round(sell ? base * .5 * (1 + spread * s) : base * (1 - spread * s)));
  }
  /** The first title whose every range fits ({ name, good: [50, 100], fame: [40, 100] }), or null. */
  title() {
    for (const t of this.titles) if (Object.entries(t).every(([k, r]) => k === 'name' || (Array.isArray(r) && (k in this.axes ? this.get(k) : this.with(k)) >= r[0] && (k in this.axes ? this.get(k) : this.with(k)) <= r[1]))) return t.name;
    return null;
  }
  /** Every number as one flat object for a conversation's variables: axes, factions, faction_rank, bounty_faction. */
  vars() {
    const o = {}; for (const k of Object.keys(this.axes)) o[k] = Math.round(this.get(k));
    for (const k of Object.keys(this.factions)) { o[k] = Math.round(this.with(k)); o[k + '_rank'] = this.rank(k); o['bounty_' + k] = this.bounty(k); }
    return o;
  }
  /** A small object for api.save(). */
  pack() { const r = n => Math.round(n * 10) / 10; return { a: Object.fromEntries(Object.entries(this.now).map(([k, v]) => [k, r(v)])), f: Object.fromEntries(Object.entries(this.stand).map(([k, v]) => [k, r(v)])), b: { ...this.bounties }, c: { ...this.counts } }; }
  unpack(d) {
    if (!d) return this; this.restart();
    for (const [k, v] of Object.entries(d.a || {})) if (k in this.axes) this.now[k] = clamp(v, this.axes[k].min, this.axes[k].max);
    for (const [k, v] of Object.entries(d.f || {})) if (k in this.factions) this.stand[k] = clamp(v, -100, 100);
    this.bounties = { ...(d.b || {}) }; this.counts = { ...(d.c || {}) }; return this;
  }
}

/* ---------------------------------------------------------------- Flags: what the world remembers */

/**
 * The world's own facts, kept by name: who is gone, which chests are open, what the hero was told, the door that
 * was broken. set('chest-12'), has('chest-12'), get('gold-in-well', 0), add('wolves', 1). Numbers, words and
 * true; false or null takes one out. pack() / unpack() (a game's gs.missions WorldSave keeps them by itself).
 */
export class Flags {
  constructor(start = {}, { link = true } = {}) { this.v = { ...start }; this.handlers = {}; linksFor(null, link)?.join('flags', this); }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  get(name, fallback = null) { return name in this.v ? this.v[name] : fallback; }
  has(name) { const x = this.v[name]; return x != null && x !== false && x !== 0 && x !== ''; }
  set(name, value = true) {
    const was = this.v[name];
    if (value == null || value === false) delete this.v[name]; else this.v[name] = value;
    if (was !== this.v[name]) this.emit('change', name, this.v[name] ?? null, was ?? null);
    return this;
  }
  add(name, n = 1) { return this.set(name, (+this.get(name, 0) || 0) + n).get(name, 0); }
  /** Every name starting with prefix ('chest-'): how many are set. */
  count(prefix = '') { let n = 0; for (const k in this.v) if (k.startsWith(prefix) && this.has(k)) n++; return n; }
  get all() { return { ...this.v }; }
  pack() { return { ...this.v }; }
  unpack(d) { this.v = { ...(d || {}) }; return this; }
}

/* ---------------------------------------------------------------- Quests and the journal */

const P3 = p => p == null ? null : { x: p.x ?? p[0] ?? 0, y: p.y ?? p[1] ?? 0, z: p.z ?? p[2] ?? 0 };
const sayNeeds = (q, need, flags, ends) => {
  // 'quest:gate' (that quest ended, any way), 'quest:gate=helped' (that way), 'flag:metMara', '!flag:x' (not), or a function
  if (typeof need === 'function') return !!need();
  const not = need.startsWith('!'), n = not ? need.slice(1) : need, [kind, rest] = n.includes(':') ? n.split(/:(.*)/s) : ['flag', n];
  let ok;
  if (kind === 'quest') { const [id, way] = rest.split('='); ok = way ? ends[id] === way : !!ends[id]; }
  else ok = !!flags?.has(rest);
  return not ? !ok : ok;
};

/**
 * Quests that run side by side, branch, can fail, and give rewards; the journal that tells their story; markers for
 * the map. A quest is a table of stages; the game moves it on with to(id, stage), or a stage moves on by itself:
 *
 *   quests = new Quests({
 *     key: { name: 'The Gate Key', stages: {
 *       ask:   { text: 'Ask Mara about the gate key', at: maraStall, reach: 2, next: 'mill' },   // walk within 2 m
 *       mill:  { text: 'Find the miller', at: mill, when: () => talkedTo.miller, next: 'flour' },
 *       flour: { text: 'Bring Mara three sacks of flour', count: 3, of: 'flour', next: 'done' },   // quests.count('flour')
 *       done:  { end: 'helped', text: 'Mara gave you the key.' },
 *       lost:  { end: 'failed', text: 'Mara will never trust you now.' } },
 *       rewards: { helped: { xp: 50, items: { key: 1 }, deeds: ['helped'], flags: { mara_friend: true } } },
 *       needs: ['flag:met_mara'] } });
 *   quests.start('key'); quests.update(dt, player); quests.to('key', 'lost'); quests.count('flour', 1);
 *   draw: quests.journal (newest first), quests.markers, quests.list() (active, done, failed)
 *
 * A stage: text (the journal's line), at (where: a marker), reach (metres from at that moves it on), when (moves
 * it on when true), count + of (moves it on when that many of something are counted), next, end (the quest ends
 * that way: 'failed' or 'fail' counts as failing), hidden (no marker). A quest: name, stages (the first is where it
 * starts), rewards { end: { xp, items, deeds, flags, ... } } (xp, items, deeds and flags go to the game's Growth,
 * Inventory, Reputation and Flags; everything else comes with the 'reward' event), needs (to start), repeat.
 * Events: start, stage, count, end, fail, reward. vars() is every quest's stage for a conversation (quest_key).
 */
export class Quests {
  constructor(table = {}, { rep, grow, inv, flags, link = true, keep = 60 } = {}) {
    this.table = table; this.keep = keep; this.links = linksFor(null, link); this.links?.join('quests', this);
    this.given = { rep, grow, inv, flags }; this.handlers = {}; this.pinned = null;
    for (const [id, q] of Object.entries(table)) {
      const st = q.stages || {}; if (!Object.keys(st).length) throw new Error(`Quests: '${id}' has no stages`);
      for (const [k, v] of Object.entries(st)) if (v.next && !st[v.next]) throw new Error(`Quests: '${id}' stage '${k}' goes on to '${v.next}', which is not one of its stages`);
    }
    this.restart();
  }
  get rep() { return linked(this.given.rep, this.links, 'reputation'); }
  get grow() { return linked(this.given.grow, this.links, 'growth'); }
  get inv() { return linked(this.given.inv, this.links, 'inventory'); }
  get flags() { return linked(this.given.flags, this.links, 'flags'); }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  restart() { this.now = {}; this.ends = {}; this.counts = {}; this.journal = []; this.t = 0; this.times = {}; return this; }
  q(id) { const q = this.table[id]; if (!q) throw new Error(`Quests: no quest '${id}'`); return q; }
  /** The stage a quest is at ('' before it starts and once it is over). */
  stage(id) { return this.now[id] ?? ''; }
  /** At that stage now? */
  is(id, stage) { return this.now[id] === stage; }
  /** Running now? */
  active(id) { return id in this.now; }
  /** How it ended ('helped', 'failed'...), or null. */
  ended(id) { return this.ends[id] ?? null; }
  failed(id) { const e = this.ends[id]; return e === 'failed' || e === 'fail'; }
  /** Could it start now (not running, not over unless it repeats, its needs met)? */
  can(id) { const q = this.q(id); if (this.active(id) || (this.ends[id] && !q.repeat)) return false; return (q.needs || []).every(n => sayNeeds(q, n, this.flags, this.ends)); }
  /** Starts it (at its first stage, or the one given). False if it can't. */
  start(id, stage = null) {
    if (!this.can(id)) return false;
    const q = this.q(id); delete this.ends[id]; this.emit('start', id);
    this.to(id, stage || Object.keys(q.stages)[0]); return true;
  }
  /** Moves a quest to a stage (it starts it if needed). An end stage ends it. */
  to(id, stage) {
    const q = this.q(id), st = q.stages[stage]; if (!st) throw new Error(`Quests: '${id}' has no stage '${stage}'`);
    const was = this.now[id] ?? null; if (was === stage) return this;
    this.now[id] = stage; this.counts[id] = 0; this.times[id] = 0;
    this.note(id, stage, st);
    this.emit('stage', id, stage, was);
    if (st.end) this.finish(id, st.end);
    return this;
  }
  note(id, stage, st) {
    if (!st.text) return;
    this.journal.unshift({ quest: id, name: this.table[id].name ?? id, stage, text: st.text, end: st.end ?? null, t: Math.round(this.t) });
    if (this.journal.length > this.keep) this.journal.length = this.keep;
  }
  finish(id, way) {
    delete this.now[id]; this.ends[id] = way; if (this.pinned === id) this.pinned = null;
    const r = this.table[id].rewards?.[way];
    if (r) {
      if (r.xp) this.grow?.gain(r.xp, 'quest:' + id);
      for (const [item, n] of Object.entries(r.items || {})) this.inv?.add(item, n);
      for (const d of r.deeds || []) this.rep?.did(d);
      for (const [f, v] of Object.entries(r.flags || {})) this.flags?.set(f, v);
      this.emit('reward', id, r, way);
    }
    this.emit(way === 'failed' || way === 'fail' ? 'fail' : 'end', id, way);
  }
  /** Ends a quest that way from wherever it is (fail('key') fails it). */
  end(id, way = 'done') { if (!this.active(id)) return this; this.note(id, '', { text: this.table[id].stages[this.now[id]]?.failText ?? null, end: way }); this.finish(id, way); return this; }
  fail(id) { return this.end(id, 'failed'); }
  /** Counts n of something for every running stage that counts it (of: 'flour'); a stage with no `of` counts anything. Returns how many stages moved on. */
  count(what, n = 1) {
    let moved = 0;
    for (const id of Object.keys(this.now)) {
      const st = this.q(id).stages[this.now[id]]; if (!st?.count || (st.of && st.of !== what)) continue;
      this.counts[id] = Math.min(st.count, (this.counts[id] || 0) + n); this.emit('count', id, this.counts[id], st.count);
      if (this.counts[id] >= st.count && st.next) { this.to(id, st.next); moved++; }
    }
    return moved;
  }
  /** How far a counting stage is: { n, of } (0 of 0 for one that doesn't count). */
  progress(id) { const st = this.active(id) ? this.q(id).stages[this.now[id]] : null; return { n: this.counts[id] || 0, of: st?.count || 0 }; }
  /** Each frame: stages with reach (the player within it of at) or when (true) move on. player: { x, z } or { x, y }. */
  update(dt, player = null) {
    this.t += dt; const P = player ? P3(player) : null;
    for (const id of Object.keys(this.now)) {
      this.times[id] = (this.times[id] || 0) + dt;
      const st = this.q(id).stages[this.now[id]]; if (!st?.next) continue;
      let go = false;
      if (st.when && st.when(this.times[id])) go = true;
      if (!go && st.reach != null && P && st.at) { const a = P3(typeof st.at === 'function' ? st.at() : st.at), flat = player.z == null; go = Math.hypot(P.x - a.x, flat ? P.y - a.y : P.z - a.z) <= st.reach; }
      if (go) this.to(id, st.next);
    }
    return this;
  }
  /** The quest whose marker is the waypoint (pinned: true on its marker). */
  pin(id) { this.pinned = id && this.active(id) ? id : null; return this; }
  /** A marker for each running quest's stage that has a place: [{ at, kind: 'quest', text, icon, pinned, quest }] (the same shape as gs.missions Jobs.markers). */
  get markers() {
    const out = [];
    for (const id of Object.keys(this.now)) {
      const st = this.q(id).stages[this.now[id]]; if (!st?.at || st.hidden) continue;
      out.push({ at: P3(typeof st.at === 'function' ? st.at() : st.at), kind: 'quest', text: st.text ?? this.table[id].name ?? id, icon: st.icon ?? this.table[id].icon ?? null, pinned: this.pinned === id, quest: id });
    }
    return out;
  }
  /** For a quest log: { active: [...], done: [...], failed: [...] } of { id, name, stage, text, end }. */
  list() {
    const one = id => ({ id, name: this.table[id].name ?? id, stage: this.now[id] ?? null, text: this.now[id] ? this.table[id].stages[this.now[id]].text ?? '' : this.journal.find(j => j.quest === id)?.text ?? '', end: this.ends[id] ?? null });
    const ids = Object.keys(this.table);
    return { active: ids.filter(id => this.active(id)).map(one), done: ids.filter(id => this.ends[id] && !this.failed(id)).map(one), failed: ids.filter(id => this.failed(id)).map(one) };
  }
  /** For a conversation: quest_<id> = its stage, or its end once over ('' before it starts). */
  vars() { const o = {}; for (const id of Object.keys(this.table)) o['quest_' + id] = this.now[id] ?? this.ends[id] ?? ''; return o; }
  /** A small object for api.save(): stages, ends, counts and the journal's last lines. */
  pack() { return { s: { ...this.now }, e: { ...this.ends }, c: { ...this.counts }, p: this.pinned, j: this.journal.slice(0, 12).map(j => [j.quest, j.stage, j.end ?? 0, j.t]) }; }
  unpack(d) {
    if (!d) return this; this.restart();
    for (const [id, st] of Object.entries(d.s || {})) if (this.table[id]?.stages[st]) this.now[id] = st;
    for (const [id, e] of Object.entries(d.e || {})) if (this.table[id]) this.ends[id] = e;
    this.counts = { ...(d.c || {}) }; this.pinned = d.p && this.now[d.p] ? d.p : null;
    // the journal's lines come back from the table (its text is not saved)
    this.journal = (d.j || []).filter(([q, st]) => this.table[q]).map(([q, st, end, t]) => ({ quest: q, name: this.table[q].name ?? q, stage: st, text: this.table[q].stages[st]?.text ?? '', end: end || null, t }));
    return this;
  }
}
