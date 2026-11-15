// Companions (Rob's fantasy RPG gap 10, 2026-11-15): up to three friends who follow the hero, talk, and fight in
// roles: a guard who stands between the hero and harm, a healer who keeps everyone up, an archer who keeps her
// distance and shoots, a caster with spells. A wheel of orders that slows or pauses time while it is open. Tactics as
// a few settings a menu can show (how bold, when to heal, who to go for), with a Tiny Brains Coach that takes
// corrections ("here you should have healed"). And companions who like or dislike what the hero does: a gs.rpg
// Reputation's deeds reach them by themselves.
//
// The kit decides; the game moves and draws. Each frame a companion says where it wants to be (goal, run), what it
// faces, and what it does (act, target); swings, shots, heals and lines come out as events. Spells go through the
// game's gs.magic when the companion has a unit there (found by itself), so heals and bolts just happen.
//
//   const { Companions } = gs.companions;
//   make() { party = new Companions(api, { hero: heroBody, coach: true }); }
//   reset() {
//     party.clear();
//     party.join(mira, { name: 'Mira', role: 'healer', stats: miraStats, unit: magic.unit(mira, { team: 'hero', stats: miraStats }),
//       likes: { rescue: 3, steal: -4 }, spells: { heal: 'mend', attack: 'spark' } });
//   }
//   update(dt) {
//     const slow = party.update(dt, { foes });           // slow: how fast the world runs now (the wheel slows it)
//     for (const m of party.members) walk(m.body, m.goal, m.run ? 6 : 3, dt * slow);
//     for (const e of party.events) if (e.type === 'swing') hurt(e.target, 8); else if (e.type === 'say') bubble(e.who, e.text);
//   }
//   wheel: party.wheel.open() on a long press, party.wheel.at(dx, dy) under the finger, party.wheel.pick(item, { target })
//
// Positions are whatever the game uses: an object with x and z (3D, the y left alone), or x and y (2D: give no z).
// Bodies may be three.js objects (their position is read), gs.physics bodies, or plain { x, z }.
import { linksFor, linked } from './links.js';
import { Coach } from './brains.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** What a companion can do. The coach learns among these; each role uses some of them. */
export const ACTIONS = Object.freeze(['follow', 'attack', 'shoot', 'cast', 'heal', 'guard', 'hold', 'retreat']);

/**
 * The roles: how close they keep to a fight (keep), how far they reach (reach), what they do (acts), how long a
 * swing, shot, spell or heal takes to come round again (every), and where they walk beside the hero (slot: across,
 * back, in metres from the hero, facing the way the hero goes).
 */
export const ROLES = Object.freeze({
  guard: { keep: 1.4, reach: 2, acts: ['follow', 'attack', 'guard', 'hold', 'retreat'], every: { attack: .9, guard: 6 }, slot: [1.3, -.6], brave: .8 },
  healer: { keep: 6, reach: 10, acts: ['follow', 'heal', 'cast', 'attack', 'hold', 'retreat'], every: { heal: 2.5, cast: 2, attack: 1.1 }, slot: [-1.3, -1.6], brave: .3 },
  archer: { keep: 9, reach: 16, acts: ['follow', 'shoot', 'attack', 'hold', 'retreat'], every: { shoot: 1.2, attack: 1 }, slot: [1.4, -2], brave: .45 },
  caster: { keep: 8, reach: 13, acts: ['follow', 'cast', 'heal', 'hold', 'retreat'], every: { cast: 1.8, heal: 4 }, slot: [-1.4, -2.6], brave: .4 },
});

/** The order wheel's items, round from the top: an order for everyone, or the one picked (who). */
export const ORDERS = Object.freeze([
  { id: 'attack', label: 'Attack', icon: 'sword' },
  { id: 'hold', label: 'Hold here', icon: 'shield' },
  { id: 'heal', label: 'Heal me', icon: 'heart' },
  { id: 'focus', label: 'All on it', icon: 'target' },
  { id: 'back', label: 'Fall back', icon: 'flag' },
  { id: 'follow', label: 'Follow', icon: 'walk' },
]);

/** Moods from approval (-100..100), lowest first: below `at` it is the one before. */
export const MOODS = Object.freeze([
  { id: 'fed up', at: -60 }, { id: 'wary', at: -20 }, { id: 'easy', at: 25 }, { id: 'warm', at: 60 }, { id: 'devoted', at: 101 },
]);

/** What they say, by what happened. A line may hold {hero}, {foe} or {name}. Games pass their own as `lines`. */
export const LINES = Object.freeze({
  join: ['Lead on.', 'I go where you go.', 'Right behind you.'],
  fight: ['Here they come!', 'Weapons out!', 'Stay close!'],
  hurt: ['Ow, that stung.', 'I am hit!', 'Watch my side!'],
  low: ['I cannot take much more!', 'Help me!', 'I am in trouble here!'],
  heal: ['Hold still.', 'Mending you.', 'This will help.'],
  win: ['That is the last of them.', 'Is everyone standing?', 'Well fought.'],
  down: ['I am down...', 'Go on without...'],
  up: ['On my feet again.', 'Thank you.'],
  order: ['On it.', 'As you say.', 'Understood.'],
  refuse: ['Do it yourself.', 'Not after what you did.', 'Why should I?'],
  approve: ['Good call.', 'I like that.', 'That was kind of you.'],
  disapprove: ['Was that needed?', 'I do not like that.', 'That was wrong.'],
  leave: ['I am done with you. Farewell.'],
  idle: ['Quiet out here.', 'My feet hurt.', 'Do you hear that?', 'I could eat a horse. Not ours.'],
});
/** Two companions talking while nothing happens: pairs of lines, the first said by one, the second by another. */
export const BANTER = Object.freeze([
  ['Do you ever stop sharpening that?', 'Do you ever stop talking?'],
  ['I saw a bird earlier the size of a cart.', 'You say that about every bird.'],
  ['When this is done, I am opening a bakery.', 'You would eat the stock.'],
  ['Which way is north?', 'Behind us. Always behind us.'],
]);

const posOf = t => t?.position ?? t?.body?.position ?? t?.mesh?.position ?? t;
const flatOf = p => (p.z === undefined || p.z === null ? 'y' : 'z');
const hpOf = t => {
  if (!t) return 1;
  if (typeof t.health === 'function') return t.health();
  const st = t.stats || t.unit?.stats;
  if (st?.pools?.hp) return st.part('hp');
  if (typeof t.hp === 'number') return t.hpMax ? t.hp / t.hpMax : t.hp > 0 ? 1 : 0;
  return t.dead ? 0 : 1;
};
const goneOf = t => !!(t?.dead || t?.gone || t?.unit?.dead || hpOf(t) <= 0);

export class Companion {
  constructor(party, body, o = {}) {
    const role = ROLES[o.role || 'guard']; if (!role) throw new Error(`Companions: no role '${o.role}' (try ${Object.keys(ROLES).join(', ')})`);
    this.party = party; this.body = body; this.name = o.name || 'Friend'; this.role = o.role || 'guard'; this.R = { ...role, ...(o.roleOpts || {}) };
    this.stats = o.stats || null; this.unit = o.unit || null; this.person = o.person || null; this.health = o.health || null;
    this.spells = o.spells || {}; this.likes = { ...(o.likes || {}) }; this.lines = { ...LINES, ...(o.lines || {}) };
    this.tactics = { stance: 'steady', healAt: .5, focus: 'nearest', ...(o.tactics || {}) };   // stance: bold | steady | careful | passive
    this.approval = clamp(o.approval ?? 0, -100, 100);
    this.goal = { ...this.at() }; this.run = false; this.face = null; this.act = 'follow'; this.target = null; this.order = null;
    this.down = false; this.cool = {}; this.see = new Float32Array(8); this.wasHp = hpOf(this); this.said = 0; this.gone = false;
  }
  at() { const p = posOf(this.body); return flatOf(p) === 'z' ? { x: p.x, z: p.z } : { x: p.x, y: p.y }; }
  hp() { return this.health ? this.health() : hpOf(this); }
  /** The mood its approval puts it in: 'fed up', 'wary', 'easy', 'warm' or 'devoted'. */
  get mood() { for (const m of MOODS) if (this.approval < m.at) return m.id; return 'devoted'; }
  /** Moves its approval (and says so, when it moved enough to notice). */
  approve(n, why = null) {
    if (!n || this.gone) return this;
    const was = this.mood; this.approval = clamp(this.approval + n, -100, 100);
    this.party.emit({ type: n > 0 ? 'approve' : 'disapprove', who: this, by: n, why, approval: this.approval });
    if (Math.abs(n) >= 2) this.party.say(this, n > 0 ? 'approve' : 'disapprove', { force: true });
    if (this.mood !== was) this.party.emit({ type: 'mood', who: this, mood: this.mood, was });
    if (this.approval <= this.party.leaveAt) { this.party.say(this, 'leave', { force: true }); this.party.emit({ type: 'leave', who: this }); if (this.party.leaves) this.party.leave(this); }
    return this;
  }
  /** Orders this one alone: an order id from ORDERS, with a target or a place. False when it refused. */
  command(id, o = {}) { return this.party.command(id, { ...o, who: this }); }
  /** Back on its feet. */
  revive() { if (!this.down) return this; this.down = false; this.party.say(this, 'up', { force: true }); this.party.emit({ type: 'up', who: this }); return this; }
}

/**
 * The order wheel: open() slows the world (slow: 0 pauses, .15 a crawl) while the player picks; items are round it
 * from the top, clockwise (angle in radians, 0 up). at(dx, dy) is the item a finger is over, from the wheel's centre
 * as a part of its radius (inside .25 is none). pick() gives the order and closes it.
 */
export class Wheel {
  constructor(party, { slow = .12, orders = ORDERS, ease = .15 } = {}) {
    this.party = party; this.slow = slow; this.ease = ease; this.on = false; this.who = null; this.speed = 1; this.over = null;
    this.items = orders.map((d, i) => ({ ...d, angle: i / orders.length * Math.PI * 2 }));
  }
  open(who = null) { this.on = true; this.who = who; this.over = null; this.party.emit({ type: 'wheel', open: true, who }); return this; }
  close() { if (this.on) this.party.emit({ type: 'wheel', open: false }); this.on = false; this.over = null; return this; }
  at(dx, dy) {
    const r = Math.hypot(dx, dy); if (r < .25) return (this.over = null);
    let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2; const n = this.items.length;
    return (this.over = this.items[Math.round(a / (Math.PI * 2) * n) % n]);
  }
  pick(item = this.over, o = {}) { if (!item) { this.close(); return false; } const id = typeof item === 'string' ? item : item.id; const ok = this.party.command(id, { who: this.who, ...o }); this.close(); return ok; }
  step(dt) { const want = this.on ? this.slow : 1, k = this.ease > 0 ? Math.min(1, dt / this.ease) : 1; this.speed += (want - this.speed) * k; if (Math.abs(this.speed - want) < .005) this.speed = want; return this.speed; }
}

export class Companions {
  /**
   * api: the game's api (the coach keeps its corrections with the game's brains). o: hero (its body), max (3),
   * magic (a gs.magic Magic; found by itself), reputation (a gs.rpg Reputation whose deeds they react to; found by
   * itself), coach (true: one Tiny Brains Coach per role; or a Coach, or { role: Coach }), talk (seconds between
   * lines, 6), banter (seconds of quiet before two of them chat, 40; 0 never), leaveAt (approval at which one
   * leaves, -90), leaves (true: taken out of the party then), wheel ({ slow, orders }), seed.
   */
  constructor(api, o = {}) {
    if (api && !api.brains && !api.score && (api.hero || api.max || api.coach !== undefined)) { o = api; api = null; }
    this.api = api; this.hero = o.hero || null; this.max = o.max ?? 3; this.members = []; this.events = []; this.handlers = {};
    this.talkGap = o.talk ?? 6; this.banterGap = o.banter ?? 40; this.leaveAt = o.leaveAt ?? -90; this.leaves = o.leaves ?? true;
    this.links = linksFor(null, o.link ?? true); this.links?.join('companions', this);
    this.given = { magic: o.magic, reputation: o.reputation };
    this.coaches = {}; this.coachOpt = o.coach ?? false;
    this.wheel = new Wheel(this, o.wheel || {});
    this.seed = (o.seed ?? 1) >>> 0 || 1; this.quiet = 0; this.lastSay = -1e9; this.t = 0; this.fighting = false; this.heading = { x: 0, z: 1 }; this.heroWas = null;
    this.heroUnit = o.heroUnit || null; this.heroName = o.heroName || null; this.voice = !!o.voice;
    this.heard = null; this.deedFn = (id, out) => this.deed(id, { seen: out?.seen ?? true });
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(e) { this.events.push(e); for (const f of this.handlers[e.type] || []) f(e); for (const f of this.handlers['*'] || []) f(e); return e; }
  get magic() { return linked(this.given.magic, this.links, 'magic'); }
  get reputation() { return linked(this.given.reputation, this.links, 'reputation'); }
  coachFor(role) {
    const c = this.coachOpt; if (!c) return null;
    if (c instanceof Coach || c.coach === true && c.pick) return c;
    if (typeof c === 'object' && c[role]) return c[role];
    return (this.coaches[role] ||= new Coach(this.api, { name: 'companions:' + role, inputs: 8, actions: ACTIONS }));
  }
  /** Adds a companion (null when the party is full). o: name, role, stats / unit / health, person, spells { heal, attack, ward }, likes { deed: amount }, lines, tactics, approval. */
  join(body, o = {}) {
    if (this.members.length >= this.max) { this.emit({ type: 'full', body }); return null; }
    const m = new Companion(this, body, o); this.members.push(m);
    this.emit({ type: 'join', who: m }); this.say(m, 'join', { force: true });
    return m;
  }
  leave(m) { m.gone = true; this.members = this.members.filter(x => x !== m); return this; }
  clear() { this.members = []; this.events = []; this.quiet = 0; this.lastSay = -1e9; this.t = 0; this.fighting = false; this.wheel.close(); this.wheel.speed = 1; return this; }
  find(name) { return this.members.find(m => m.name === name) || null; }

  /** A deed the hero did (an id from the Reputation's deeds, or the game's own word): those who care like or dislike it. A Reputation's deeds arrive by themselves. */
  deed(id, { seen = true, by = 1 } = {}) {
    for (const m of this.members) { const l = m.likes[id]; if (l && (seen || m.likes.always?.includes?.(id))) m.approve(l * by, id); }
    return this;
  }
  /** A gift or a kindness to one of them: approval by `n`. */
  gift(m, n = 5) { m.approve(n, 'gift'); return this; }

  /** Speaks a line of `kind` (one of LINES' keys or the companion's own), unless someone spoke a moment ago (force: anyway). */
  say(m, kind, { force = false, foe = null } = {}) {
    if (!m || m.gone) return null;
    if (!force && this.t - this.lastSay < this.talkGap) return null;
    const l = m.lines[kind]; if (!l || !l.length) return null;
    const text = String(l[Math.floor(this.rnd() * l.length)]).replace(/\{name\}/g, m.name).replace(/\{hero\}/g, this.heroName || 'you').replace(/\{foe\}/g, foe?.name || 'them');
    this.lastSay = this.t; m.said = this.t; this.quiet = 0;
    if (this.voice && m.person?.face?.say) m.person.face.say(text);
    return this.emit({ type: 'say', who: m, text, kind });
  }

  /**
   * An order: 'attack' (target: what to go for; else the nearest foe), 'hold' (at: where; else where each stands),
   * 'heal' (the healers on the hero, or on target), 'focus' (everyone on target), 'back' (fall back behind the hero),
   * 'follow' (back to following). who: one companion, else all. for: seconds it lasts (orders with a target last
   * until it falls). A fed-up companion may refuse; returns false then.
   */
  command(id, { who = null, target = null, at = null, for: secs = 0 } = {}) {
    const list = who ? [who] : this.members; let any = false;
    for (const m of list) {
      if (m.down) continue;
      if (m.mood === 'fed up' && this.rnd() < .5) { this.say(m, 'refuse', { force: true }); this.emit({ type: 'refuse', who: m, order: id }); continue; }
      m.order = id === 'follow' ? null : { id, target, at: at ? { ...at } : id === 'hold' ? m.at() : null, left: secs || (id === 'hold' || id === 'back' ? 1e9 : target ? 1e9 : 20) };
      any = true;
    }
    if (any) { this.say(list.find(m => !m.down) || list[0], 'order', { force: true }); this.emit({ type: 'order', id, who, target }); }
    return any;
  }
  /** The coach: "here, this one should have done `action`" (the spot it last decided in). */
  correct(m, action) { const c = this.coachFor(m.role); if (c) c.correct(m.see, action); return this; }
  /** The coach: "not what you just did, here". */
  avoid(m, action) { const c = this.coachFor(m.role); if (c) action === undefined ? c.avoid(m.see, ACTIONS.indexOf(m.act)) : c.avoid(m.see, action); return this; }

  // ---- each frame
  /**
   * Decides for everyone. dt: real seconds. foes: a list of what they fight (bodies, magic units, anything with a
   * position; dead or gone ones are skipped). Returns how fast the world should run now (the wheel slows it): give
   * your world dt times this. Read each companion's goal, run, face, act and target; events lists what happened.
   */
  update(dt, { foes = [], hero = this.hero } = {}) {
    this.events = []; this.t += dt; this.hero = hero;
    const speed = this.wheel.step(dt), wdt = dt * speed;
    // the reputation's deeds reach them by themselves (rebound when a new one is made)
    const rep = this.reputation; if (rep !== this.heard) { this.heard?.handlers?.deed && (this.heard.handlers.deed = this.heard.handlers.deed.filter(f => f !== this.deedFn)); this.heard = rep; rep?.on?.('deed', this.deedFn); }
    if (!hero || !this.members.length) return speed;
    const hp = posOf(hero), Z = flatOf(hp), H = { x: hp.x, z: hp[Z] };
    // which way the hero is going (for the walking places beside it), from how it moved
    if (this.heroWas) { const dx = H.x - this.heroWas.x, dz = H.z - this.heroWas.z, d = Math.hypot(dx, dz); if (d > .02) { const k = Math.min(1, d * 2); this.heading.x += (dx / d - this.heading.x) * k; this.heading.z += (dz / d - this.heading.z) * k; const l = Math.hypot(this.heading.x, this.heading.z) || 1; this.heading.x /= l; this.heading.z /= l; } }
    this.heroWas = H;
    const live = foes.filter(f => f && !goneOf(f)).map(f => { const p = posOf(f); return { f, x: p.x, z: p[Z], d: Math.hypot(p.x - H.x, p[Z] - H.z), hp: hpOf(f) }; });
    const near = live.filter(f => f.d < 18);
    // a fight starts and ends
    if (near.length && !this.fighting) { this.fighting = true; this.emit({ type: 'fight' }); this.say(this.members[Math.floor(this.rnd() * this.members.length)], 'fight', { force: true }); }
    else if (!near.length && this.fighting && !live.some(f => f.d < 26)) { this.fighting = false; this.emit({ type: 'calm' }); const s = this.members.filter(m => !m.down); if (s.length) this.say(s[Math.floor(this.rnd() * s.length)], 'win', { force: true }); }
    const heroHp = hpOf(hero), party = [{ who: hero, hp: heroHp, hero: true, x: H.x, z: H.z }, ...this.members.filter(m => !m.down).map(m => { const p = m.at(); return { who: m, hp: m.hp(), x: p.x, z: p[Z] }; })];
    for (const m of this.members) this.think(m, wdt, { H, Z, near, live, party, heroHp });
    // quiet: an idle line or two of them chatting
    if (!this.fighting) {
      this.quiet += dt;
      const up = this.members.filter(m => !m.down);
      if (this.banterGap > 0 && this.quiet > this.banterGap && up.length >= 2) {
        const pair = BANTER[Math.floor(this.rnd() * BANTER.length)], a = up[Math.floor(this.rnd() * up.length)], b = up.find(x => x !== a);
        this.emit({ type: 'say', who: a, text: pair[0], kind: 'banter' }); this.emit({ type: 'say', who: b, text: pair[1], kind: 'banter', after: 2.2 });
        if (this.voice) { a.person?.face?.say?.(pair[0]); }
        this.quiet = 0; this.lastSay = this.t;
      } else if (this.banterGap > 0 && this.quiet > this.banterGap * .6 && up.length === 1 && this.rnd() < dt * .05) this.say(up[0], 'idle');
    } else this.quiet = 0;
    return speed;
  }

  think(m, dt, { H, Z, near, party, heroHp }) {
    const p = m.at(), P = { x: p.x, z: p[Z] }, hp = m.hp(), R = m.R, set = (x, z) => { m.goal = Z === 'z' ? { x, z } : { x, y: z }; };
    for (const k in m.cool) m.cool[k] = Math.max(0, m.cool[k] - dt);
    // hurt, low, down
    if (hp < m.wasHp - .08) { this.say(m, hp < .3 ? 'low' : 'hurt'); m.wasHp = hp; } else if (hp > m.wasHp) m.wasHp = hp;
    if (hp <= 0 && !m.down) { m.down = true; m.act = 'down'; m.target = null; m.order = null; this.say(m, 'down', { force: true }); this.emit({ type: 'down', who: m }); }
    if (m.down) { m.goal = { ...p }; m.run = false; m.act = 'down'; return; }
    // the order it is under runs out, or its target falls
    if (m.order) { m.order.left -= dt; if (m.order.left <= 0 || (m.order.target && goneOf(m.order.target))) m.order = null; }
    // what it looks at (for the coach): hero's health, its own, foes near, the nearest's distance, the weakest friend, mana, foes on the hero, under orders
    const nearest = near.reduce((a, f) => (!a || Math.hypot(f.x - P.x, f.z - P.z) < Math.hypot(a.x - P.x, a.z - P.z) ? f : a), null);
    const weakest = party.reduce((a, q) => (!a || q.hp < a.hp ? q : a), null);
    const onHero = near.filter(f => f.d < 3).length, mana = m.unit?.stats?.pools?.mana ? m.unit.stats.part('mana') : m.stats?.pools?.mana ? m.stats.part('mana') : 1;
    const see = m.see; see[0] = heroHp; see[1] = hp; see[2] = Math.min(1, near.length / 5); see[3] = nearest ? Math.min(1, Math.hypot(nearest.x - P.x, nearest.z - P.z) / 15) : 1;
    see[4] = weakest ? weakest.hp : 1; see[5] = mana; see[6] = Math.min(1, onHero / 3); see[7] = m.order ? 1 : 0;
    // the rules' choice, best first, of what this role can do now
    const can = this.choices(m, { near, nearest, weakest, hp, heroHp, onHero, mana });
    const c = this.coachFor(m.role), act = m.order ? can[0] : c ? c.pick(see, can) : can[0];
    m.act = act; m.run = false; m.face = null;
    const tgt = this.targetFor(m, act, { near, nearest, weakest, P, H });
    m.target = tgt?.f ?? tgt?.who ?? null;
    const away = (from, to, d) => { const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1; return { x: to.x - dx / l * d, z: to.z - dz / l * d }; };
    const dist = tgt ? Math.hypot(tgt.x - P.x, tgt.z - P.z) : 0;
    switch (act) {
      case 'attack': case 'shoot': case 'cast': {
        if (!tgt) { this.follow(m, H, P, set); break; }
        const keep = act === 'attack' ? Math.min(R.keep, 1.4) : R.keep, back = act !== 'attack' && dist < keep * .5;
        const g = dist > keep ? away(P, tgt, keep * .9) : back ? { x: tgt.x + (P.x - tgt.x) / (dist || 1) * keep * .8, z: tgt.z + (P.z - tgt.z) / (dist || 1) * keep * .8 } : P;
        set(g.x, g.z); m.run = dist > keep + 3 || back; m.face = { x: tgt.x, z: tgt.z };
        const reach = act === 'attack' ? Math.max(R.reach, 1.6) : R.reach;
        if (dist <= reach + .2 && !m.cool[act]) this.strike(m, act, tgt, P);
        break;
      }
      case 'heal': {
        if (!tgt) { this.follow(m, H, P, set); break; }
        if (dist > R.reach * .8) { const g = away(P, tgt, R.reach * .6); set(g.x, g.z); m.run = true; } else set(P.x, P.z);
        m.face = { x: tgt.x, z: tgt.z };
        if (dist <= R.reach && !m.cool.heal) this.strike(m, 'heal', tgt, P);
        break;
      }
      case 'guard': {
        // between the hero and the nearest foe on it, a step out from the hero
        const f = tgt || nearest; if (!f) { this.follow(m, H, P, set); break; }
        const g = away(f, H, 1.6); set(g.x, g.z); m.run = Math.hypot(g.x - P.x, g.z - P.z) > 2.5; m.face = { x: f.x, z: f.z };
        if (!m.cool.guard && Math.hypot(f.x - P.x, f.z - P.z) < 4) { m.cool.guard = R.every.guard ?? 6; this.emit({ type: 'taunt', who: m, target: f.f }); }
        if (Math.hypot(f.x - P.x, f.z - P.z) <= R.reach && !m.cool.attack) this.strike(m, 'attack', f, P);
        break;
      }
      case 'hold': { const a = m.order?.at || m.holdAt || (m.holdAt = { ...p }); set(a.x, a[Z]); if (nearest) m.face = { x: nearest.x, z: nearest.z }; if (nearest && R.reach > 3 && Math.hypot(nearest.x - P.x, nearest.z - P.z) <= R.reach && !m.cool.shoot && m.R.acts.includes('shoot')) this.strike(m, 'shoot', nearest, P); break; }
      case 'retreat': {
        // behind the hero, away from the foes
        let ax = 0, az = 0; for (const f of near) { const d = Math.hypot(f.x - H.x, f.z - H.z) || 1; ax += (H.x - f.x) / d; az += (H.z - f.z) / d; }
        const l = Math.hypot(ax, az); if (l < .01) { ax = -this.heading.x; az = -this.heading.z; } else { ax /= l; az /= l; }
        const back = m.order?.id === 'back' ? 6 : R.keep + 2; set(H.x + ax * back, H.z + az * back); m.run = true; break;
      }
      default: this.follow(m, H, P, set);
    }
    if (act !== 'hold') m.holdAt = null;
  }
  // its walking place beside the hero
  follow(m, H, P, set) {
    const [sx, sb] = m.R.slot, hx = this.heading.x, hz = this.heading.z;
    const twin = this.members.slice(0, this.members.indexOf(m)).filter(x => x.R.slot[0] === sx).length, across = sx * (twin % 2 ? -1 : 1), back = sb - twin * .8;
    const gx = H.x + hz * across + hx * back, gz = H.z - hx * across + hz * back;
    const d = Math.hypot(gx - P.x, gz - P.z); if (d > .6) set(gx, gz); else set(P.x, P.z);
    m.run = d > 5; m.act = 'follow';
  }
  // what the rules would do, best first (the coach may pick another of these)
  choices(m, { near, nearest, weakest, hp, heroHp, onHero, mana }) {
    const A = m.R.acts, o = m.order, st = m.tactics.stance, has = a => A.includes(a), out = [];
    const put = a => { if (has(a) && !out.includes(a)) out.push(a); };
    if (o) {
      if (o.id === 'attack' || o.id === 'focus') { put(has('shoot') ? 'shoot' : has('cast') && !has('attack') ? 'cast' : 'attack'); put('cast'); put('shoot'); put('attack'); }
      else if (o.id === 'hold') put('hold');
      else if (o.id === 'back') put('retreat');
      else if (o.id === 'heal') { put('heal'); }
      put('follow'); return out;
    }
    const scared = hp < .25 && st !== 'bold', want = m.tactics.healAt;
    if (!near.length) { if (weakest && weakest.hp < Math.max(.85, want) && has('heal')) put('heal'); put('follow'); return out; }
    if (st === 'passive') { if (has('heal') && weakest && weakest.hp < want) put('heal'); put('follow'); put('retreat'); put('hold'); return out; }
    if (has('heal') && weakest && weakest.hp < want && mana > .1) put('heal');
    if (scared) put('retreat');
    if (has('guard') && onHero > 0 && (heroHp < .7 || onHero > 1)) put('guard');
    if (has('shoot')) put('shoot');
    if (has('cast') && mana > .15) put('cast');
    if (has('attack') && (st === 'bold' || m.R.brave > .5 || Math.hypot(nearest.x - m.at().x, nearest.z - (m.at().z ?? m.at().y)) < 2.5)) put('attack');
    if (has('guard')) put('guard');
    if (st === 'careful') put('retreat');
    put('follow'); put('hold'); put('retreat');   // (last: what the coach may pick instead, when corrected)
    return out;
  }
  targetFor(m, act, { near, nearest, weakest, P, H }) {
    if (act === 'heal') { const o = m.order; if (o?.id === 'heal' && o.target) { const t = this.partyAt(o.target, H); if (t) return t; } return weakest; }
    if (act === 'follow' || act === 'retreat' || act === 'hold') return null;
    const o = m.order; if (o?.target) { const p = posOf(o.target), Z = flatOf(p); if (!goneOf(o.target)) return { f: o.target, x: p.x, z: p[Z], hp: hpOf(o.target) }; }
    if (!near.length) return null;
    const f = m.tactics.focus;
    if (f === 'weakest') return near.reduce((a, q) => (q.hp < a.hp ? q : a));
    if (f === 'strongest') return near.reduce((a, q) => (q.hp > a.hp ? q : a));
    if (f === 'hero') return near.reduce((a, q) => (q.d < a.d ? q : a));
    return nearest;
  }
  partyAt(who, H) { if (who === this.hero) return { who, x: H.x, z: H.z, hp: hpOf(who) }; const m = this.members.find(x => x === who || x.body === who); if (!m) return null; const p = m.at(); return { who: m, x: p.x, z: p.z ?? p.y, hp: m.hp() }; }
  // a swing, a shot, a spell or a heal: through gs.magic when there is a unit and a spell for it, else an event for the game
  strike(m, act, tgt, P) {
    m.cool[act] = m.R.every[act] ?? 1.2;
    const mg = this.magic, sp = act === 'heal' ? m.spells.heal : act === 'cast' ? m.spells.attack : act === 'shoot' ? m.spells.shoot : m.spells.melee;
    const t = tgt.f ?? tgt.who, tu = t?.unit || (t?.cast && t.stats ? t : null) || (t === this.hero ? this.heroUnit : null);
    let cast = null;
    if (mg && m.unit && sp) { const aim = tu ? { target: tu } : { at: { x: tgt.x, y: 1, z: tgt.z } }; cast = m.unit.can(sp, aim) === true ? m.unit.cast(sp, aim) : null; }
    const e = this.emit({ type: act === 'attack' ? 'swing' : act, who: m, target: t, at: { x: tgt.x, z: tgt.z }, from: P, spell: sp || null, cast: !!cast });
    if (act === 'heal' && t !== m && (tgt.hp ?? 1) < .5) this.say(m, 'heal');
    return e;
  }

  /** What to save: names, approval, tactics, who is down. */
  pack() { return this.members.map(m => ({ n: m.name, a: Math.round(m.approval * 10) / 10, t: m.tactics, d: m.down ? 1 : 0 })); }
  /** Puts saved approval and tactics back on the companions of the same name (join them first). */
  unpack(d) { for (const s of d || []) { const m = this.find(s.n); if (!m) continue; m.approval = clamp(+s.a || 0, -100, 100); m.tactics = { ...m.tactics, ...(s.t || {}) }; m.down = !!s.d; } return this; }
}
