// Turn-based battles, items and levelling, for RPGs, monster battlers and roguelikes. The kit does the
// sums (turn order, damage, status effects, items, XP); your game picks moves, draws the fight and
// writes the words.
//
//   const { Fighter, Battle, Bag, levelFor, loot } = gs.battle;
//   hero = new Fighter({ name: 'Pip', hp: 30, atk: 8, def: 4, spd: 6, type: 'leaf' });
//   slime = new Fighter({ name: 'Goo', hp: 18, atk: 5, def: 2, spd: 3, type: 'water' });
//   fight = new Battle([[hero], [slime]], { types: { leaf: { water: 2, fire: .5 } } });
//   fight.on('hit', e => popup(e.target, e.amount, e.crit)).on('status', e => ...).on('faint', e => ...);
//   tap "Attack": fight.act(hero, { move: { power: 10, type: 'leaf' }, target: slime });
//   then let the enemy act: fight.act(fight.turn, { move: claw, target: hero });   // fight.turn: whose go it is
//   fight.over -> 0 or 1 (the winning side) or null
//
// Status effects: fight.inflict(target, 'poison', 3) (turns). Built in: poison and burn (hurt at the
// end of each turn), stun and sleep (skip turns; sleep ends when hit), shield (halves damage),
// regen (heals), and buffs: { atk: 1.5 } style multipliers with Fighter.buff('atk', 1.5, 3).
// Add your own: new Battle(sides, { statuses: { freeze: { skip: true, ends: 'hit' } } }).
//
// A ready-made opponent (Tiny Brains): it weighs every move by the fight's own sums (damage with types,
// what a status or a buff is worth, a heal when it is needed) and learns how this player fights: what
// they do next, and when they heal, so it stops chipping at someone who is about to heal.
//   foe = new Opponent(api, { skill: .7 });                       // make(): what it learns is kept on the phone
//   fight = new Battle([[hero], [slime]], { types }); foe.join(fight);            // each fight
//   the enemy's turn: fight.act(fight.turn, foe.pick(fight.turn, SLIME_MOVES));   // or the fighter's own .moves
//   at the end: foe.result(fight.over === 0);                     // with skill: a gs.brains.Dial, it follows the player

import { Predict } from './brains.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Fighter {
  constructor({ name = '?', hp = 10, atk = 5, def = 3, spd = 5, luck = .05, type = null, level = 1, ...more } = {}) {
    Object.assign(this, { name, maxHp: hp, hp, atk, def, spd, luck, type, level, ...more });
    this.statuses = new Map(); this.buffs = [];
  }
  get alive() { return this.hp > 0; }
  /** A stat with its buffs: f.stat('atk'). */
  stat(k) { let v = this[k] ?? 0; for (const b of this.buffs) if (b.stat === k) v *= b.by; return v; }
  /** Multiplies a stat for some turns: f.buff('def', 1.5, 3) (below 1 for a debuff). */
  buff(stat, by, turns = 3) { this.buffs.push({ stat, by, turns }); return this; }
  has(status) { return this.statuses.has(status); }
  heal(n) { const before = this.hp; this.hp = clamp(this.hp + Math.round(n), 0, this.maxHp); return this.hp - before; }
}

const BUILT_IN = {
  poison: { tick: f => Math.max(1, Math.round(f.maxHp / 12)) },
  burn: { tick: f => Math.max(1, Math.round(f.maxHp / 16)), stat: { atk: .75 } },
  regen: { tick: f => -Math.max(1, Math.round(f.maxHp / 12)) },
  stun: { skip: true },
  sleep: { skip: true, ends: 'hit' },
  shield: { guard: .5 },
};

export class Battle {
  /**
   * sides: arrays of Fighters ([[hero, ally], [slime, bat]]). Options: types (attacker type -> { defender
   * type: multiplier }), statuses (extra kinds), rng, crit (damage multiplier on a lucky hit, 1.5),
   * spread (random 0.85..1 damage, true).
   */
  constructor(sides, { types = {}, statuses = {}, rng = Math.random, crit = 1.5, spread = true } = {}) {
    this.sides = sides; this.types = types; this.kinds = { ...BUILT_IN, ...statuses };
    this.rng = rng; this.critX = crit; this.spread = spread; this.handlers = {}; this.log = []; this.round = 1;
    this.queue = []; this.next();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, e) { e.type = ev; this.log.push(e); if (this.log.length > 50) this.log.shift(); for (const f of this.handlers[ev] || []) f(e); for (const f of this.handlers['*'] || []) f(e); return e; }
  get fighters() { return this.sides.flat(); }
  sideOf(f) { return this.sides.findIndex(s => s.includes(f)); }
  foes(f) { return this.sides.filter((_, i) => i !== this.sideOf(f)).flat().filter(x => x.alive); }
  friends(f) { return (this.sides[this.sideOf(f)] || []).filter(x => x.alive); }
  /** The side still standing (0, 1...) once only one is, else null. */
  get over() { const up = this.sides.map((s, i) => s.some(f => f.alive) ? i : -1).filter(i => i >= 0); return up.length <= 1 ? (up[0] ?? -1) : null; }

  /** Whose turn it is (fastest first each round; ties go to the earlier fighter). */
  get turn() { return this.queue[0] || null; }
  next() {
    this.queue = this.queue.filter(f => f.alive);
    if (!this.queue.length) {
      this.queue = this.fighters.filter(f => f.alive).sort((a, b) => b.stat('spd') - a.stat('spd'));
      if (this.log.length) this.round++;
    }
    // a fighter that must skip (stunned, asleep) loses its turn here
    const f = this.queue[0];
    if (f && [...f.statuses.keys()].some(k => this.kinds[k]?.skip) && this.over == null) {
      this.emit('skip', { who: f, status: [...f.statuses.keys()].find(k => this.kinds[k]?.skip) });
      this.endTurn(f); return this.next();
    }
    return f;
  }
  /** Damage this move would do (no randomness): for previews and AI. */
  preview(by, target, move = {}) { return this.damage(by, target, move, false).amount; }
  damage(by, target, move = {}, roll = true) {
    const power = move.power ?? 10, stat = move.special ? 'mag' : 'atk', guard = move.special ? 'res' : 'def';
    const a = by.stat(stat) || by.stat('atk'), d = Math.max(1, target.stat(guard) || target.stat('def'));
    let n = power * a / (a + d) * (1 + by.level * .05);
    const eff = (this.types[move.type ?? by.type] || {})[target.type] ?? 1;
    n *= eff;
    const crit = roll && this.rng() < (move.crit ?? by.luck);
    if (crit) n *= this.critX;
    if (roll && this.spread) n *= .85 + this.rng() * .15;
    for (const k of target.statuses.keys()) if (this.kinds[k]?.guard) n *= this.kinds[k].guard;
    return { amount: Math.max(move.power === 0 ? 0 : 1, Math.round(n)), crit, effect: eff };
  }
  /**
   * Takes a turn: { move: { power, type, special, crit, heal, status: ['poison', 3], buff: ['atk', 1.5, 3], hits }, target }
   * or { item, target } with an item from a Bag, or { wait: true }. Returns the events it caused.
   */
  act(by, { move = null, item = null, target = null, wait = false } = {}) {
    if (this.over != null || !by?.alive) return [];
    if (this.watchers) for (const w of this.watchers) w(by, { move, item, target, wait });   // (an Opponent that joined)
    const start = this.log.length;
    if (item) { this.useItem(by, item, target || by); }
    else if (move && !wait) {
      const hits = move.hits || 1, t = target || this.foes(by)[0];
      for (let i = 0; i < hits && t?.alive; i++) {
        if (move.miss && this.rng() < move.miss) { this.emit('miss', { who: by, target: t, move }); continue; }
        if (move.power !== 0) {
          const d = this.damage(by, t, move);
          t.hp = Math.max(0, t.hp - d.amount);
          this.emit('hit', { who: by, target: t, move, amount: d.amount, crit: d.crit, effect: d.effect });
          for (const [k] of t.statuses) if (this.kinds[k]?.ends === 'hit') { t.statuses.delete(k); this.emit('cured', { target: t, status: k }); }
          if (!t.alive) this.emit('faint', { target: t, by });
        }
      }
      if (move.heal) { const h = (target && this.sideOf(target) === this.sideOf(by) ? target : by).heal(move.heal); this.emit('heal', { who: by, target: target || by, amount: h }); }
      if (move.status && t?.alive && (move.chance == null || this.rng() < move.chance)) this.inflict(t, move.status[0], move.status[1]);
      if (move.buff) { const [stat, x, turns] = move.buff, who = x >= 1 ? by : t; who.buff(stat, x, turns); this.emit('buff', { who, stat, by: x, turns }); }
    } else this.emit('wait', { who: by });
    this.endTurn(by);
    if (this.over != null) this.emit('over', { winner: this.over });
    else this.next();
    return this.log.slice(start);
  }
  /** Puts a status on a fighter for some turns (refreshes it if it has it). */
  inflict(target, status, turns = 3) {
    if (!this.kinds[status]) throw new Error(`Battle: no status "${status}"`);
    target.statuses.set(status, turns); this.emit('status', { target, status, turns });
    return this;
  }
  useItem(by, item, target) {
    const it = item.def || item;
    if (item.bag && !item.bag.take(item.id)) return;
    if (it.heal) this.emit('heal', { who: by, target, amount: target.heal(it.heal), item: it });
    if (it.cure) { for (const k of [].concat(it.cure)) target.statuses.delete(k); this.emit('cured', { target, status: it.cure, item: it }); }
    if (it.damage) { target.hp = Math.max(0, target.hp - it.damage); this.emit('hit', { who: by, target, amount: it.damage, item: it }); if (!target.alive) this.emit('faint', { target, by }); }
    if (it.status) this.inflict(target, it.status[0], it.status[1]);
    if (it.buff) target.buff(...it.buff);
    it.use?.(target, by, this);
    this.emit('item', { who: by, target, item: it });
  }
  endTurn(f) {
    this.queue = this.queue.filter(x => x !== f);
    for (const [k, left] of [...f.statuses]) {
      const kind = this.kinds[k];
      if (kind.tick && f.alive) { const n = kind.tick(f); if (n > 0) { f.hp = Math.max(0, f.hp - n); this.emit('hurt', { target: f, status: k, amount: n }); if (!f.alive) this.emit('faint', { target: f, status: k }); } else if (n < 0) this.emit('heal', { target: f, status: k, amount: f.heal(-n) }); }
      if (left <= 1) { f.statuses.delete(k); this.emit('cured', { target: f, status: k }); } else f.statuses.set(k, left - 1);
    }
    f.buffs = f.buffs.filter(b => --b.turns > 0);
  }
}

/** Items with counts: bag.add('potion', 3), bag.take('potion'), bag.count('potion'), bag.list. */
export class Bag {
  constructor(defs = {}, { slots = Infinity, stack = 99 } = {}) { this.defs = defs; this.slots = slots; this.stack = stack; this.items = new Map(); }
  add(id, n = 1) {
    const have = this.items.get(id) || 0;
    if (!have && this.items.size >= this.slots) return 0;
    const max = this.defs[id]?.stack ?? this.stack, put = Math.min(n, max - have);
    if (put > 0) this.items.set(id, have + put);
    return Math.max(0, put);
  }
  take(id, n = 1) { const have = this.items.get(id) || 0; if (have < n) return false; if (have === n) this.items.delete(id); else this.items.set(id, have - n); return true; }
  count(id) { return this.items.get(id) || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  /** [{ id, n, def, bag }] (pass one to Battle.act as { item }). */
  get list() { return [...this.items].map(([id, n]) => ({ id, n, def: this.defs[id] || { id }, bag: this })); }
  /** Plain data for api.save, and back. */
  save() { return Object.fromEntries(this.items); }
  load(data) { this.items = new Map(Object.entries(data || {}).filter(([, n]) => n > 0)); return this; }
}

/** XP needed to reach a level: curve(level) = base * level^power (default 10 * level^2.2, rounded). */
export const xpFor = (level, { base = 10, power = 2.2 } = {}) => level <= 1 ? 0 : Math.round(base * Math.pow(level - 1, power));
/** The level for an amount of XP. */
export function levelFor(xp, o = {}) { let l = 1; while (xpFor(l + 1, o) <= xp && l < 999) l++; return l; }
/** Gives XP; returns the levels gained (and raises stats by growth: { hp: 3, atk: 1 } per level). */
export function gainXp(f, xp, { growth = { hp: 3, atk: 1, def: 1, spd: .5 }, curve } = {}) {
  f.xp = (f.xp || 0) + xp; const to = levelFor(f.xp, curve), up = to - f.level;
  for (let i = 0; i < up; i++) for (const [k, v] of Object.entries(growth)) { if (k === 'hp') { f.maxHp += v; f.hp += v; } else f[k] = (f[k] || 0) + v; }
  f.level = to; return up;
}
/** Picks from a weighted table: loot([{ id: 'coin', w: 10 }, { id: 'gem', w: 1 }], rng) -> the entry. */
export function loot(table, rng = Math.random) {
  const total = table.reduce((s, e) => s + (e.w ?? 1), 0); let x = rng() * total;
  for (const e of table) if ((x -= e.w ?? 1) < 0) return e;
  return table[table.length - 1];
}

// ---------------------------------------------------------------- a ready-made opponent

// What a turn was, for learning what the player does next; each is noted with how hurt the player's side was
// (its weakest fighter under a third, under two thirds, or better), so "heals when low" is one of its habits.
const KINDS = ['hit', 'big', 'heal', 'status', 'buff', 'wait'], BANDS = 3;
const FIRST = [.8, .1, .04, .03, .02, .01];   // what it expects of a player it has never met
const bandOf = x => (x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : 2);
const lowest = list => { let m = 1; for (const f of list) if (f.alive) m = Math.min(m, f.hp / f.maxHp); return m; };
const pow = m => (m.power ?? 10) * (m.hits || 1) * (1 - (m.miss || 0));
// Who a player goes for with a hit: the one it hurts most, the one nearest to falling, or someone else.
const AIMS = ['hard', 'weak', 'other'];
const hardest = (c, f, m, foes) => { let best = foes[0], top = -1; for (const t of foes) { const d = c.preview(f, t, m); if (d > top) { top = d; best = t; } } return best; };
const weakest = foes => foes.reduce((a, b) => (b.hp < a.hp ? b : a), foes[0]);

// A copy of a fight to try turns in: the same fighters, statuses and turn order, nobody listening and no luck.
function copyOf(fight) {
  const c = Object.create(Battle.prototype), map = new Map(), from = new Map();
  c.sides = fight.sides.map(s => s.map(f => {
    const g = Object.assign(Object.create(Object.getPrototypeOf(f)), f); g.statuses = new Map(f.statuses); g.buffs = f.buffs.map(b => ({ ...b }));
    map.set(f, g); from.set(g, fight.from ? fight.from.get(f) : f); return g;
  }));
  c.types = fight.types; c.kinds = fight.kinds; c.critX = fight.critX; c.spread = false; c.rng = () => 1;
  c.handlers = {}; c.log = []; c.round = fight.round; c.queue = fight.queue.map(f => map.get(f)); c.to = map; c.from = from;
  return c;
}
// A move as it usually lands, for trying it in a copy: its usual damage (crits, the spread and misses averaged in) and
// its status when that is more likely than not. landed: true or false tries a hit or a miss; status likewise.
function usual(fight, by, move, { landed = null, status = null } = {}) {
  const ex = (fight.spread ? .925 : 1) * (1 + clamp(move.crit ?? by.luck ?? 0, 0, 1) * (fight.critX - 1));
  const miss = move.miss || 0, hit = landed == null ? 1 - miss : landed ? 1 : 0, st = status == null ? (move.chance ?? 1) >= .5 : status;
  return { ...move, power: move.power === 0 || !hit ? 0 : (move.power ?? 10) * ex * hit, heal: move.power !== 0 && !hit ? 0 : move.heal, miss: 0, crit: 0, chance: undefined, status: st && (hit || move.power === 0) ? move.status : undefined };
}

/**
 * An opponent for a Battle. pick(by, moves) tries every move on every target in a copy of the fight, a few turns
 * ahead by the fight's own rules, and gives the one to make: { move, target } (or { item, target }, or
 * { wait: true }), ready for fight.act(). It knows only what a player could: the fighters' health, stats, types and
 * statuses, and the moves it has seen the player's fighters use. Joined to a fight (join(fight)) it learns how the
 * player fights, across fights and sessions, and plays ahead against that player, not a perfect one.
 */
export class Opponent {
  /**
   * name: its save's name ('opponent'); skill: 0..1 (1 always makes its best move and looks furthest ahead; lower,
   * good-but-not-best moves more often; a number, or a gs.brains.Dial that follows the player); side: the side it
   * plays (1); ahead: how many turns it plays ahead, and then on to the player's answer (2; more is slower and, measured, no better); learn: false for one that never learns the player; rng;
   * score(choice, fight, by): a number your game adds to a choice's worth (in shares of a fighter's health).
   */
  constructor(api, opts = {}) {
    if (api && !api.brains && !api.score && arguments.length < 2) { opts = api; api = null; }
    this.name = String(opts.name || 'opponent');
    this.skill = opts.skill ?? .7; this.side = opts.side ?? 1; this.ahead = clamp(opts.ahead | 0 || 2, 1, 8); this.rnd = opts.rng || Math.random;
    this.extra = typeof opts.score === 'function' ? opts.score : null;
    this.habits = opts.learn === false ? null : new Predict(api, { name: this.name, moves: KINDS.length * BANDS });
    this.aims = this.habits ? new Predict(api, { name: this.name + '-aim', moves: AIMS }) : null;   // who the player goes for
    this.known = new WeakMap();   // a player's fighter -> what it has been seen to do
    this.moves = new WeakMap();   // one of its own fighters -> the moves it was given
    this.fight = null; this.options = []; this.tried = 0; this.guess = {}; this.answer = true;
  }
  /** Watches a fight: every turn the other side takes teaches it. Call it for each new Battle. */
  join(fight) {
    this.fight = fight;
    (fight.watchers ||= []).push((by, choice) => this.see(by, choice, fight));
    return this;
  }
  /** A fighter on the other side took a turn (join() has the fight tell it; call it yourself for a fight it has not joined). */
  see(by, { move = null, item = null, target = null, wait = false } = {}, fight = this.fight) {
    if (!fight || fight.sideOf(by) === this.side || fight.sideOf(by) < 0) return this;
    let k = this.known.get(by); if (!k) this.known.set(by, k = { moves: [], heal: 0, other: null });
    const it = item ? item.def || item : null;
    let kind = 'wait';
    if (wait || (!move && !it)) kind = 'wait';
    else if (it) kind = it.heal ? 'heal' : it.damage ? 'hit' : it.status || it.buff || it.cure ? 'status' : 'wait';
    else if (move.power !== 0) {
      if (!k.moves.includes(move)) k.moves.push(move);
      const foes = fight.foes(by), t = target || foes[0];
      if (this.aims && foes.length > 1) { const h = hardest(fight, by, move, foes), w = weakest(foes); if (h !== w) this.aims.see(t === h ? 'hard' : t === w ? 'weak' : 'other'); }
      const rest = k.moves.filter(m => m !== move);
      kind = rest.length && rest.every(m => pow(m) * 1.25 < pow(move)) ? 'big' : 'hit';
    } else { kind = move.heal ? 'heal' : move.status ? 'status' : move.buff ? 'buff' : 'wait'; if (kind === 'status' || kind === 'buff') k.other = move; }
    const heal = it ? it.heal : move && move.power === 0 && move.heal; if (heal > 0) k.heal = Math.max(k.heal, heal);
    if (this.habits) this.habits.see(KINDS.indexOf(kind) * BANDS + bandOf(lowest(fight.friends(by))));
    return this;
  }
  /** What it expects the player to do next when their weakest fighter is at `low` (0..1 of its health): a chance for each of hit, big, heal, status, buff, wait. */
  expect(low = 1) {
    const out = FIRST.slice(), h = this.habits; if (!h || !h.seen) return out;
    // how often each kind of turn came up when they were this hurt (the habits' own counts, where old turns fade)
    const b = bandOf(low), K = KINDS.length; let n = 0;
    for (let k = 0; k < K; k++) n += h.c0[k * BANDS + b];
    for (let k = 0; k < K; k++) out[k] = (h.c0[k * BANDS + b] + out[k] * 2) / (n + 2);
    return out;
  }

  // The turns one of the player's fighters may take in a copy of the fight, each with its chance: [[chance, choice]].
  // Only what it has seen that fighter do; before it has seen anything, a plain hit.
  replies(c, f) {
    const k = this.habits ? this.known.get(c.from.get(f)) : null, p = this.expect(lowest(c.friends(f))), foes = c.foes(f), out = [];
    const weak = this.aims && this.aims.seen > 2 && this.aims.guess() === 'weak';
    const hurts = m => (foes.length < 2 ? foes[0] : weak ? weakest(foes) : hardest(c, f, m, foes));
    const seen = k && k.moves.length ? k.moves.slice().sort((a, b) => pow(b) - pow(a)) : [this.guess];   // (nothing seen yet: a hit about as hard as its own)
    const big = seen.length > 1 && pow(seen[0]) > 1.25 * pow(seen[1]) ? seen[0] : null, rest = big ? seen.slice(1) : seen;
    let hit = rest[0]; if (rest.length > 1 && foes.length) { let top = -1; for (const m of rest) { const d = c.preview(f, hurts(m), m) * (m.hits || 1) * (1 - (m.miss || 0)); if (d > top) { top = d; hit = m; } } }
    const add = (chance, choice) => { if (chance > .03) out.push([chance, choice]); else out[0][0] += chance; };
    out.push([p[0] + (big ? 0 : p[1]), { move: usual(c, f, hit), target: hurts(hit) }]);
    if (big) add(p[1], { move: usual(c, f, big), target: hurts(big) });
    const low = c.friends(f).reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a), f);
    if (k && k.heal > 0 && low.hp < low.maxHp) add(p[2], { item: { def: { heal: k.heal } }, target: low }); else out[0][0] += p[2];
    const o = k && k.other;
    if (o) add(p[3] + p[4], { move: usual(c, f, o), target: o.status && !this.kind(c, o.status[0]) ? foes.find(t => !t.statuses.has(o.status[0])) || foes[0] : o.buff && o.buff[1] < 1 ? foes[0] : f });
    else out[0][0] += p[3] + p[4];
    add(p[5], { wait: true });
    return out;
  }
  // The turns one of its own fighters may take: [{ move | item, target, name }].
  choices(fight, by, moves, items) {
    const foes = fight.foes(by), friends = fight.friends(by), out = [];
    const list = Array.isArray(moves) ? moves.map(m => [m && m.name, m]) : Object.entries(moves || {});
    for (const [name, move] of list) {
      if (!move) continue;
      const st = move.status, good = st && this.kind(fight, st[0]), plain = move.power === 0;
      if (!plain || (st && !good) || (move.buff && move.buff[1] < 1)) for (const target of foes) { if (plain && st && !move.buff && target.statuses.has(st[0])) continue; out.push({ move, target, name }); }
      else if (move.heal > 0 || good) for (const target of friends) { if (move.heal > 0 ? target.hp >= target.maxHp && !good : target.statuses.has(st[0])) continue; out.push({ move, target, name }); }
      else if (move.buff) out.push({ move, target: by, name });
    }
    for (const item of items || []) {
      const it = item.def || item; if (item.n != null && item.n <= 0) continue;
      const good = it.heal > 0 || it.cure || (it.buff && it.buff[1] >= 1) || (it.status && this.kind(fight, it.status[0]));
      for (const target of good ? friends : foes) {
        if (it.heal > 0 && !it.cure && !it.status && !it.buff && target.hp >= target.maxHp) continue;
        if (it.cure && !it.heal && ![].concat(it.cure).some(s => target.statuses.has(s))) continue;
        out.push({ item, target, name: it.name || item.id });
      }
    }
    return out;
  }
  // How a fight stands for its side, in shares of a fighter's health: health and fighters still up, hurt still to come.
  stands(c, bag) {
    let v = 0;
    for (let s = 0; s < c.sides.length; s++) {
      let t = 0;
      for (const f of c.sides[s]) {
        if (!f.alive) continue;
        let hp = f.hp;
        for (const [k, left] of f.statuses) { const kind = c.kinds[k]; if (kind && kind.tick) hp -= kind.tick(f) * left * .6; if (kind && kind.skip) hp -= f.maxHp * .08 * left; }
        t += clamp(hp, 0, f.maxHp) / f.maxHp + .25;
      }
      v += s === this.side ? t : -t;
    }
    if (bag) for (const [it, n] of bag) v += n * (it.heal ? Math.min(.25, it.heal / 60) : .1);   // what it still holds is worth something: no potion wasted
    return v;
  }
  // The worth of a copy of a fight, `turns` more turns played ahead: its own side makes its best turn, the player's what it expects of them.
  play(c, turns, bag) {
    this.tried++;
    if (c.over != null) return this.stands(c, bag) + (c.over === this.side ? 2 : -2);
    const f = c.turn, theirs = f && c.sideOf(f) !== this.side;
    if (!f || this.tried > 2000 || (turns <= 0 && (!theirs || !this.answer || turns < -3))) return this.stands(c, bag);   // (it stops on a turn of its own, so every choice is judged after the player's answer to it)
    if (theirs) {
      let v = 0; const rs = this.replies(c, f);
      for (const [chance, choice] of rs) { const n = rs.length > 1 ? copyOf(c) : c; n.act(n.to ? n.to.get(f) ?? f : f, choice.target ? { ...choice, target: n === c ? choice.target : n.to.get(choice.target) } : choice); v += chance * this.play(n, turns - 1, bag); }
      return v;
    }
    let best = -Infinity;
    const items = bag ? [...bag].filter(([, n]) => n > 0).map(([def]) => ({ def })) : null;
    const opts = this.choices(c, f, this.moves.get(c.from.get(f)) || [{}], items);
    if (!opts.length) { c.act(f, { wait: true }); return this.play(c, turns - 1, bag); }
    for (const o of opts) best = Math.max(best, this.after(c, f, o, turns, bag, false));
    return best;
  }
  // a choice tried in a copy, then played on (first: its own turn now, where a hit or a miss and a status that may not take are each tried)
  after(c, f, o, turns, bag, first) {
    const go = (mv, w) => {
      const n = copyOf(c); let b = bag;
      if (o.item) { const it = o.item.def || o.item; if (bag) { b = new Map(bag); b.set(it, (b.get(it) || 1) - 1); } n.act(n.to.get(f), { item: { def: it }, target: n.to.get(o.target) }); }
      else n.act(n.to.get(f), { move: mv, target: n.to.get(o.target) });
      return w * this.play(n, turns - 1, b);
    };
    if (o.item) return go(null, 1);
    const m = o.move, miss = (m.hits || 1) === 1 && m.power !== 0 ? m.miss || 0 : 0, ch = m.status ? m.chance ?? 1 : 1;
    if (!first || (!miss && ch >= 1)) return go(usual(c, f, m), 1);
    let v = 0;
    for (const [landed, pl] of miss ? [[true, 1 - miss], [false, miss]] : [[null, 1]]) for (const [status, ps] of ch < 1 ? [[true, ch], [false, 1 - ch]] : [[null, 1]]) v += go(usual(c, f, m, { landed, status }), pl * ps);
    return v;
  }

  /**
   * The turn to take for `by` (the fight's turn by default): { move, target }, { item, target } or { wait: true },
   * to pass to fight.act(by, ...). moves: the moves it may make, an array or { name: move } (by.moves by default);
   * items: a Bag's list to use from. The choice also has `name` (the move's) and `worth` (how much better than
   * waiting it is, in shares of a fighter's health), and every choice it weighed is in opponent.options, best first.
   */
  pick(by = this.fight && this.fight.turn, moves = by && by.moves, { items = null, fight = this.fight } = {}) {
    this.options = [];
    if (!by || !fight) return { wait: true, name: 'wait', worth: 0 };
    this.moves.set(by, moves || [{}]);
    for (const f of fight.friends(by)) if (!this.moves.has(f) && f.moves) this.moves.set(f, f.moves);
    const own = (Array.isArray(moves) ? moves : Object.values(moves || {})).filter(m => m && m.power !== 0).map(pow);
    this.guess = { power: own.length ? own.reduce((x, y) => x + y, 0) / own.length : 10 };
    const skill = +this.skill, k = isFinite(skill) ? clamp(skill, 0, 1) : 1;
    const turns = k < .3 ? 1 : this.ahead; this.answer = k >= .3;   // (a weak one takes what looks best now, with no thought for the answer to it)
    const bag = items && items.length ? new Map(items.map(i => [i.def || i, i.n ?? 1])) : null;
    const c = copyOf(fight), me = c.to.get(by), out = this.choices(fight, by, moves, items);
    this.tried = 0;
    const idle = copyOf(c); idle.act(idle.to.get(me), { wait: true }); const base = this.play(idle, turns - 1, bag);
    for (const o of out) {
      const so = { ...o, target: c.to.get(o.target) };
      o.worth = this.after(c, me, so, turns, bag, true) - base;
      if (this.extra) o.worth += +this.extra(o, fight, by) || 0;
    }
    out.push({ wait: true, name: 'wait', worth: 0 });
    out.sort((a, b) => b.worth - a.worth);
    this.options = out;
    // skill 1: the best. Lower: a worse one more often, by how much worse it is
    const real = out.filter(o => !o.wait);
    if (out[0].wait || !(k < 1) || real.length < 2) return out[0];   // (nothing better than waiting; or its best)
    const temp = Math.max(.01, (1 - k) * .5), w = real.map(o => Math.exp((o.worth - real[0].worth) / temp));
    let t = this.rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < real.length; i++) { t -= w[i]; if (t <= 0) return real[i]; }
    return real[0];
  }
  // whether a status is one to give a friend (it heals, or turns damage aside)
  kind(fight, name) { const k = fight.kinds[name]; return !!k && ((k.tick && k.tick({ maxHp: 100, hp: 50 }) < 0) || (k.guard != null && k.guard < 1)); }
  /** The end of a fight: did the player win? Tells a Dial given as its skill, and saves what it learned. */
  result(playerWon) { if (this.skill && typeof this.skill.result === 'function') this.skill.result(playerWon); if (this.habits) { this.habits.persist(); this.aims.persist(); } return this; }
  /** Forgets how the player fights. */
  forget() { if (this.habits) { this.habits.forget(); this.aims.forget(); } this.known = new WeakMap(); return this; }
}
