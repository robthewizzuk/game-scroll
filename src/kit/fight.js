// Fighting games (and, for 3D street fights, Melee and Brawler: src/kit/melee3d.js): an input reader that remembers the last moments (so a special move's motion and a
// press a moment early both count), and moves made of frames (start-up, active, recovery) with hit
// boxes, hurt boxes, cancels, hit stun, block stun and hit stop. Frames are 60ths of a second; the kit
// steps them with dt. Your game draws the fighters and decides damage and the rules.
//
//   const { Reader, Fighter, clash } = gs.fight;
//   const MOVES = {
//     jab:   { start: 3, active: 2, recover: 6, hit: [[20, -50, 30, 14]], damage: 4, stun: 12, cancel: ['jab', 'fireball'] },
//     sweep: { start: 6, active: 3, recover: 14, hit: [[18, -10, 40, 12]], damage: 7, stun: 18, low: true },
//     fireball: { start: 10, active: 1, recover: 20, input: '236P', damage: 8, spawn: 'fireball' },
//   };
//   reset() { p1 = new Fighter(MOVES, { x: 100, facing: 1, hurt: [[-12, -80, 24, 80]] }); read = new Reader(); }
//   update(dt) {
//     read.feed(stick.x, -stick.y, { P: punch.down, K: kick.down }, dt, p1.facing);   // numpad directions: 6 is forward
//     const m = read.special(MOVES) || (read.take('P') && 'jab'); if (m) p1.start(m);
//     p1.update(dt); p2.update(dt);
//     const hit = clash(p1, p2); if (hit) { p2.hp -= hit.blocked ? 0 : hit.move.damage; feel.hit(hit.x, hit.y); }
//   }
//
// Directions are numpad numbers seen from the fighter's side: 1 2 3 down-back, down, down-forward;
// 4 5 6 back, neutral, forward; 7 8 9 up-back, up, up-forward. '236P' is a quarter circle forward and P.
//
// A ready-made opponent (Tiny Brains): it reads its moves' frames (how far each reaches, how fast it comes out,
// whether it is safe when blocked) and learns how this player fights: how high they attack from each distance,
// how they guard, whether they punish. It reacts no faster than a person, so what it has learned is how it
// guards in time.
//   cpu = new Opponent(api, { skill: .6 });                     // make(): what it learns is kept on the phone
//   reset() { p1 = new Fighter(MOVES, ...); p2 = new Fighter(MOVES, ...); cpu.join(p2, p1); }
//   update(dt) {
//     const want = cpu.think(dt);                               // { walk: -1 | 0 | 1, block: false | 'high' | 'low', move: 'jab' | null }
//     p2.x += want.walk * p2.facing * WALK * dt; p2.blocking = !!want.block; p2.blockLow = want.block === 'low';
//     if (want.move) p2.start(want.move);
//   }
//   at the end of a round: cpu.result(playerWon);               // with skill: a gs.brains.Dial, it follows the player

import { Predict } from './brains.js';

const FRAME = 1 / 60;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dirOf = (x, y, dead) => { const h = x > dead ? 1 : x < -dead ? -1 : 0, v = y > dead ? 1 : y < -dead ? -1 : 0; return 5 + h + v * 3; };   // y up

/** Reads a stick and buttons into numpad directions and presses, and keeps the last moments of both. */
export class Reader {
  /** window: seconds a motion may take; buffer: seconds a press is kept for (pressed early still counts); dead: stick dead zone. */
  constructor({ window = .4, buffer = .15, dead = .35 } = {}) {
    Object.assign(this, { window, buffer, dead }); this.t = 0; this.dirs = [{ d: 5, t: 0 }]; this.presses = []; this.held = {};
  }
  /** Each frame: stick x, y (-1..1, y up), buttons { name: down }, dt, facing (1: right, -1: left: forward follows it). */
  feed(x, y, buttons = {}, dt = FRAME, facing = 1) {
    this.t += dt;
    const d = dirOf(x * facing, y, this.dead);
    if (d !== this.dirs[this.dirs.length - 1].d) { this.dirs.push({ d, t: this.t }); if (this.dirs.length > 32) this.dirs.shift(); }
    for (const [b, down] of Object.entries(buttons)) { if (down && !this.held[b]) this.presses.push({ b, t: this.t }); this.held[b] = !!down; }
    this.presses = this.presses.filter(p => this.t - p.t <= this.buffer);
    return this;
  }
  /** The direction now (numpad). */
  get dir() { return this.dirs[this.dirs.length - 1].d; }
  /** Whether a button was pressed in the last `buffer` seconds (and takes it, so it counts once). */
  take(b) { const i = this.presses.findIndex(p => p.b === b); if (i < 0) return false; this.presses.splice(i, 1); return true; }
  /** Whether a button is held. */
  holding(b) { return !!this.held[b]; }
  /**
   * Whether a motion was done in the last `window` seconds, then a button: '236P' (quarter circle forward),
   * '623P' (forward, down, down-forward), '41236K', '66' (dash: forward twice), '22' ... The motion's
   * directions must come in order (others between are fine, as on a pad); the button must be pressed
   * in the buffer. Takes the press when it matches.
   */
  did(cmd) {
    const m = /^([1-9]*)([A-Z]*)$/.exec(cmd); if (!m) return false;
    const seq = m[1].split('').map(Number), btn = m[2];
    let pi = -1; if (btn) { pi = this.presses.findIndex(p => p.b === btn); if (pi < 0) return false; }
    const end = btn ? this.presses[pi].t : this.t, from = end - this.window;
    // walk back through the directions, matching the motion from its last step
    let k = seq.length - 1;
    for (let i = this.dirs.length - 1; i >= 0 && k >= 0; i--) {
      const e = this.dirs[i], next = this.dirs[i + 1];
      if (e.t > end + 1e-9) continue;
      if (next && next.t < from) break;
      if (e.d === seq[k]) k--;   // (others between are skipped: '66' is forward, neutral, forward)
    }
    if (k >= 0) return false;
    if (btn) this.presses.splice(pi, 1);
    return true;
  }
  /** The first move in a move list whose input was done (longest motions first), or null. */
  special(moves) {
    const list = Object.entries(moves).filter(([, m]) => m.input).sort((a, b) => b[1].input.length - a[1].input.length);
    for (const [name, m] of list) if (this.did(m.input)) return name;
    return null;
  }
  clear() { this.dirs = [{ d: this.dir, t: this.t }]; this.presses = []; }
}

/** A fighter's moves, frames and boxes. Boxes are [x, y, w, h] from the fighter's feet, facing right (flipped for facing -1). */
export class Fighter {
  constructor(moves, { x = 0, y = 0, facing = 1, hurt = [[-12, -80, 24, 80]], hp = 100 } = {}) {
    Object.assign(this, { moves, x, y, facing, hurtBoxes: hurt, hp, maxHp: hp });
    this.move = null; this.frame = 0; this.acc = 0; this.stun = 0; this.stop = 0; this.blocking = false; this.hitThis = new Set(); this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** 'start' | 'active' | 'recover' | 'stun' | 'idle' */
  get phase() {
    if (this.stun > 0) return 'stun'; const m = this.moves[this.move]; if (!m) return 'idle';
    return this.frame < m.start ? 'start' : this.frame < m.start + m.active ? 'active' : 'recover';
  }
  get busy() { return this.phase !== 'idle'; }
  /** Whether the move now may be cancelled into `name` (its cancel list, once it has hit; or always on its own cancelAny). */
  canCancel(name) { const m = this.moves[this.move]; return !!m && (m.cancel || []).includes(name) && (this.hitThis.size > 0 || m.cancelAny) && this.phase !== 'start'; }
  /** Starts a move if free (or it cancels the current one). Returns whether it started. */
  start(name) {
    if (!this.moves[name] || this.stun > 0) return false;
    if (this.busy && !this.canCancel(name)) return false;
    this.move = name; this.frame = 0; this.acc = 0; this.hitThis.clear(); this.emit('start', name);
    return true;
  }
  /** Steps frames (not during hit stop). */
  update(dt) {
    if (this.stop > 0) { this.stop -= dt; return this; }
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      if (this.stun > 0) { this.stun--; continue; }
      const m = this.moves[this.move]; if (!m) continue;
      const was = this.phase; this.frame++;
      if (was === 'start' && this.phase === 'active') this.emit('active', this.move, m);
      if (this.frame >= m.start + m.active + m.recover) { this.emit('end', this.move); this.move = null; this.frame = 0; }
    }
    return this;
  }
  box(b) { const [bx, by, w, h] = b; return { x: this.facing > 0 ? this.x + bx : this.x - bx - w, y: this.y + by, w, h }; }
  /** The hit boxes now (world rects), during a move's active frames (hit: [[...]] for all, or by active frame: [[[...]], [[...]]]). */
  hitboxes() {
    const m = this.moves[this.move]; if (this.phase !== 'active' || !m.hit) return [];
    const af = this.frame - m.start, set = Array.isArray(m.hit[0]?.[0]) ? m.hit[Math.min(af, m.hit.length - 1)] : m.hit;
    return set.map(b => this.box(b));
  }
  /** The hurt boxes now (a move's own `hurt` replaces them while it runs). */
  hurtboxes() { const m = this.moves[this.move]; return (m?.hurt || this.hurtBoxes).map(b => this.box(b)); }
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Whether a's move hits b now (each move hits a fighter once). On a hit: b gets hit stun (move.stun
 * frames) or, while b.blocking and the move isn't `low` (or b blocks low: b.blockLow), block stun
 * (move.blockStun, half by default); both get hit stop (move.stop frames, 6). Returns { move, blocked, x, y } or null.
 */
export function clash(a, b) {
  const hb = a.hitboxes(); if (!hb.length || a.hitThis.has(b)) return null;
  const hurt = b.hurtboxes();
  for (const h of hb) for (const u of hurt) {
    if (!overlap(h, u)) continue;
    const m = a.moves[a.move]; a.hitThis.add(b);
    const blocked = !!b.blocking && !b.busy && (!m.low || !!b.blockLow) && (!m.high || !b.blockLow);
    b.stun = blocked ? (m.blockStun ?? Math.round((m.stun ?? 12) / 2)) : (m.stun ?? 12);
    if (!blocked) { b.move = null; b.frame = 0; }
    a.stop = b.stop = (m.stop ?? 6) * FRAME;
    const x = (Math.max(h.x, u.x) + Math.min(h.x + h.w, u.x + u.w)) / 2, y = (Math.max(h.y, u.y) + Math.min(h.y + h.h, u.y + u.h)) / 2;
    const res = { move: m, name: a.move, blocked, x, y };
    a.emit(blocked ? 'blocked' : 'hit', res, b); b.emit(blocked ? 'block' : 'hurt', res, a);
    return res;
  }
  return null;
}

// ---------------------------------------------------------------- a ready-made opponent

// What each move of a list is good for, read from its frames: how far it reaches (from the feet, facing right), how
// fast it comes out, how many frames ahead (+) or behind (-) it leaves its user when it hits and when it is blocked.
const read = new WeakMap();
function movesOf(moves) {
  let out = read.get(moves); if (out) return out;
  out = {};
  for (const [name, m] of Object.entries(moves || {})) {
    const sets = !m.hit ? [] : Array.isArray(m.hit[0]?.[0]) ? m.hit : [m.hit];
    let reach = -Infinity, near = Infinity;
    for (const set of sets) for (const [bx, , w] of set) { reach = Math.max(reach, bx + w); near = Math.min(near, bx); }
    const stun = m.stun ?? 12, rest = (m.active || 0) + (m.recover || 0);
    out[name] = { name, m, hits: sets.length > 0, reach, near, start: m.start || 0, total: (m.start || 0) + rest, damage: m.damage ?? 0, height: m.low ? 1 : m.high ? 2 : 0, onHit: stun - rest, onBlock: (m.blockStun ?? Math.round(stun / 2)) - rest };
  }
  read.set(moves, out); return out;
}
const HEIGHTS = ['mid', 'low', 'high'], GUARDS = ['open', 'high', 'low'], BANDS = 3;
const front = f => Math.max(0, ...f.hurtBoxes.map(b => b[0] + b[2]));

/**
 * An opponent for a fighting game: think(dt) says what it wants to do this frame, { walk, block, move }, and your
 * game does it. It reads its own moves' frames for what reaches, what is fast and what is safe, punishes a move
 * that missed or was blocked with the hardest move that lands in time, cancels into its follow-ups, and guards
 * what it sees coming, but it sees a move only after a person's reaction time. What it can't react to it must
 * expect: joined to the two fighters it learns how this player attacks and guards, across rounds and sessions.
 */
export class Opponent {
  /**
   * name: its save's name ('fighter'); skill: 0..1 (how fast it reacts, how often it punishes, guards right and takes
   * its follow-ups; a number, or a gs.brains.Dial that follows the player); learn: false for one that never learns
   * the player; rng.
   */
  constructor(api, opts = {}) {
    if (api && !api.brains && !api.score && arguments.length < 2) { opts = api; api = null; }
    this.name = String(opts.name || 'fighter'); this.skill = opts.skill ?? .6; this.rnd = opts.rng || Math.random;
    const learn = opts.learn !== false;
    this.heights = learn ? new Predict(api, { name: this.name, moves: HEIGHTS.length * BANDS }) : null;      // how high they attack, by how far apart
    this.guards = learn ? new Predict(api, { name: this.name + '-guard', moves: GUARDS }) : null;             // how they guard when it attacks
    this.punished = learn ? new Predict(api, { name: this.name + '-punish', moves: 2 }) : null;               // whether they punish what they block
    this.me = this.foe = null; this.seen = new Map(); this.near = 0; this.starts = 0; this.clear();
  }
  clear() { this.t = 0; this.open = null; this.hold = null; this.window = null; this.took = null; this.swing = 0; this.lean = null; }
  /** The two fighters of a round: its own, and the player's. Call it for each new pair (in reset()). */
  join(me, foe) {
    this.me = me; this.foe = foe; this.clear();
    foe.on('start', name => this.saw(name));
    me.on('hit', () => { if (this.guards) this.guards.see('open'); });
    me.on('blocked', (res, b) => { if (this.guards) this.guards.see(b.blockLow ? 'low' : 'high'); this.open = this.t; });
    me.on('hurt', () => { if (this.open != null && this.t - this.open < .6) { if (this.punished) this.punished.see(1); this.open = null; } });
    return this;
  }
  band(dist) { const r = this.range(); return dist < r * .6 ? 0 : dist < r * 1.05 ? 1 : 2; }
  // the player began a move: one more thing it knows of them
  saw(name) {
    const i = movesOf(this.foe.moves)[name]; if (!i) return;
    const dist = Math.abs(this.foe.x - this.me.x);
    this.seen.set(name, i); if (i.hits && dist <= this.range() + 4) this.starts++;
    if (i.hits && this.heights) this.heights.see(i.height * BANDS + this.band(dist));
  }
  // how far the player's moves reach, of those it has seen (before any: as far as its own)
  range() {
    let r = 0; for (const i of this.seen.values()) if (i.hits) r = Math.max(r, i.reach);
    if (!r && this.me) for (const i of Object.values(movesOf(this.me.moves))) if (i.hits) r = Math.max(r, i.reach);
    return r + (this.me ? front(this.me) : 0);
  }
  /** What it expects of the player from `dist` apart: { mid, low, high } chances for how high their next attack is, and `eager`, the attacks they begin a second while it is in their reach. */
  expect(dist = 0) {
    const out = { mid: .6, low: .25, high: .15, eager: this.near > 1 ? this.starts / this.near : 1 }, h = this.heights; if (!h || !h.seen) return out;
    const b = this.band(dist); let n = 0; for (let k = 0; k < 3; k++) n += h.c0[k * BANDS + b];
    for (let k = 0; k < 3; k++) out[HEIGHTS[k]] = (h.c0[k * BANDS + b] + out[HEIGHTS[k]] * 2) / (n + 2);
    return out;
  }
  /** How it expects the player to be guarding when it attacks: { open, high, low } chances. */
  guard() {
    const out = { open: .5, high: .4, low: .1 }, g = this.guards; if (!g || !g.seen) return out;
    let n = 0; for (let k = 0; k < 3; k++) n += g.c0[k];
    for (let k = 0; k < 3; k++) out[GUARDS[k]] = (g.c0[k] + out[GUARDS[k]] * 3) / (n + 3);
    return out;
  }
  /**
   * Each frame: what it wants to do, for your game to do: walk (1 towards the player, -1 away, 0), block (false,
   * 'high' or 'low') and move (a move's name to start now, or null). me, foe: the fighters, when not joined.
   */
  think(dt = FRAME, me = this.me, foe = this.foe) {
    const want = { walk: 0, block: false, move: null }; if (!me || !foe) return want;
    if (me !== this.me || foe !== this.foe) this.join(me, foe);
    this.t += dt;
    const k = clamp(isFinite(+this.skill) ? +this.skill : 1, 0, 1), r = this.rnd, mine = movesOf(me.moves), theirs = movesOf(foe.moves);
    const dist = Math.abs(foe.x - me.x), gap = dist - front(foe), reaches = i => i.hits && i.reach >= gap + 2 && i.near <= dist + front(foe);
    const fm = theirs[foe.move], react = Math.round(20 - 13 * k), sees = fm && foe.frame >= react;   // it sees a move a reaction time after it began
    if (this.open != null && this.t - this.open >= .6) { if (this.punished) this.punished.see(0); this.open = null; }
    const inTheirs = dist <= this.range() + 4;
    if (inTheirs) this.near += dt;   // (how long it has spent in their reach, and how many attacks they began there: both fade)
    this.near *= .9995; this.starts *= .9995;
    // a guard held is held for a moment (no flicker), and dropped to attack
    const held = this.hold && this.t < this.hold.until ? this.hold.block : null;
    if (me.stun > 0) { want.block = held || false; return want; }
    // its own move is under way: a follow-up when it connected
    if (me.busy) {
      const m = me.moves[me.move];
      if (me.hitThis.size && m.cancel && this.took !== me.move + this.swing) {
        let best = null;
        for (const n of m.cancel) { const i = mine[n]; if (i && me.canCancel(n) && reaches(i) && (!best || i.damage > best.damage)) best = i; }
        if (best) { this.took = me.move + this.swing; if (r() < .3 + .7 * k) { want.move = best.name; this.swing++; } }
      }
      return want;
    }
    // what each of its moves is worth now, against how this player guards and how soon they hit back
    const g = this.guard(), e = this.expect(dist), stance = foe.blocking && !foe.busy ? (foe.blockLow ? 'low' : 'high') : null;
    let quickest = 99; for (const i of this.seen.values()) if (i.hits) quickest = Math.min(quickest, i.start); if (quickest > 90) quickest = 5;
    const keen = clamp(e.eager / 2, 0, 1), punish = this.punished && this.punished.seen > 2 ? this.punished.c0[1] / Math.max(1, this.punished.c0[0] + this.punished.c0[1]) : .5;
    if (!this.lean || this.t >= this.lean.until) this.lean = { until: this.t + .5, by: {} };   // (a weaker one's fancy for a move, for half a second)
    const worth = (i, turn) => {
      // the chance it is blocked: by the guard they are holding now, else by how they have guarded before
      const stops = i.height === 1 ? g.low : i.height === 2 ? g.high : g.high + g.low;
      const blocked = stance ? ((i.height === 1 ? stance === 'low' : i.height === 2 ? stance === 'high' : true) ? .85 : .1) : stops;
      const more = i.m.cancel ? Math.max(0, ...i.m.cancel.map(n => (mine[n] ? mine[n].damage : 0))) * (.3 + .7 * k) : 0;
      const fancy = this.lean.by[i.name] ??= (r() - .5) * (1 - k) * 8;
      return (1 - blocked) * (i.damage + more) - blocked * (i.onBlock < -4 ? punish * 8 : 0) - (turn ? 0 : keen * (i.start >= quickest ? 5 : 0)) + fancy;
    };
    // the player is open: a move that missed or was blocked and has not recovered, or they are reeling
    const left = foe.stun > 0 ? foe.stun : sees && foe.phase === 'recover' ? fm.total - foe.frame : fm && foe.phase === 'active' && sees && !(fm.reach + front(me) >= dist - 2) ? fm.total - foe.frame : 0;
    if (left > 1) {
      const id = foe.stun > 0 ? 'stun' + Math.round(this.t * 4) : foe.move + ':' + Math.round(this.t * 60 - foe.frame);
      if (!this.window || this.window.id !== id) this.window = { id, go: r() < .25 + .75 * k };
      if (this.window.go) {
        // the hardest move that lands before they can do anything; else it takes its turn: the best move that is out before theirs could be
        let best = null, turn = null, top = 0, closer = false;
        for (const i of Object.values(mine)) {
          if (!i.hits) continue;
          if (i.start < left) { if (reaches(i)) { if (!best || i.damage > best.damage) best = i; } else if (i.reach < gap + 2) closer = true; }
          else if (i.start < left + quickest - 1 && reaches(i)) { const w = worth(i, true); if (w > top) { top = w; turn = i; } }
        }
        if (best || turn) { want.move = (best || turn).name; this.swing++; this.hold = null; return want; }
        if (closer) { want.walk = 1; return want; }
      }
    }
    // it sees an attack coming that will reach: a faster move of its own to stop it, or a guard at the right height
    if (sees && fm.hits && (foe.phase === 'start' || foe.phase === 'active') && fm.reach + front(me) >= dist - 6) {
      const until = Math.max(0, fm.start - foe.frame);
      let quick = null; for (const i of Object.values(mine)) if (reaches(i) && i.start < until - 1 && (!quick || i.start < quick.start)) quick = i;
      if (quick && r() < k * .5) { want.move = quick.name; this.swing++; return want; }
      const right = fm.height === 1 ? 'low' : 'high', slip = r() < (1 - k) * .35;
      const block = held && this.hold.sure ? held : slip ? (r() < .5 ? false : right === 'low' ? 'high' : 'low') : right;
      this.hold = { block, until: this.t + .2, sure: true }; want.block = block; return want;
    }
    // nothing seen: the move worth most; attack when it reaches, else close to where it does
    let plan = null, top = 0;
    for (const i of Object.values(mine)) { if (!i.hits) continue; const w = worth(i, false); if (w > top) { top = w; plan = i; } }
    if (plan && reaches(plan) && r() < (1.5 + 3.5 * k) * (1 - .7 * keen) * dt) { want.move = plan.name; this.swing++; this.hold = null; return want; }
    if (plan && !reaches(plan) && plan.reach < gap + 2) want.walk = 1;
    // inside their reach it guards as this player has taught it to: more for one who attacks at once, low for one who goes low
    if (inTheirs) {
      if (held == null) {
        const wary = clamp(.15 + e.eager * .35, .15, .85) * (.4 + .6 * k);
        this.hold = { block: r() < wary ? (this.heights && e.low > Math.max(e.mid, e.high) ? 'low' : 'high') : false, until: this.t + .25 + r() * .2, sure: false };
      }
      want.block = this.hold.block;
      if (want.block) want.walk = 0;
    }
    return want;
  }
  /** The end of a round: did the player win? Tells a Dial given as its skill, and saves what it learned. */
  result(playerWon) { if (this.skill && typeof this.skill.result === 'function') this.skill.result(playerWon); for (const p of [this.heights, this.guards, this.punished]) if (p) p.persist(); return this; }
  /** Forgets how the player fights. */
  forget() { for (const p of [this.heights, this.guards, this.punished]) if (p) p.forget(); this.seen.clear(); this.near = this.starts = 0; this.clear(); return this; }
}

// fights between people standing in a 3D world (src/kit/melee3d.js)
export { Melee, Brawler, FISTS, SWINGS, BLADES, AXES, SPEARS, STAVES, MOVESETS, ARMS, SHIELD } from './melee3d.js';
