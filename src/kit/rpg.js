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
  constructor(stats = null, { attributes = {}, derive = {}, tree = {}, curve = {}, cap = 50, points = 3, skills = 1, most = 99, refill = true, level = 1, xp = null } = {}) {
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
  constructor({ axes = { good: [-100, 100, 0], fame: [0, 100, 0] }, factions = {}, deeds = {}, share = .5, inner = ['good'], good = 'good', fame = 'fame', titles = [], ranks = RANKS, keep = 40 } = {}) {
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
    const f = this.factions[faction] || {}, s = this.with(faction) / 100, fame = this.lean(this.fameAxis), g = this.lean(this.goodAxis);
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
