// Tiny Brains: small neural networks that learn while you play. There is no training step: a brain
// starts by copying the game's own simple AI (the "teacher"), learns a little every frame, and only
// takes over from the teacher as it proves it makes the game more fun. Guard rails are built in, so
// a brain can't turn cruel: it aims for the player winning about 60% of the time (not for beating
// them), it works inside the limits the game sets (reaction time, how often it changes its mind,
// always a bit of randomness), every nudge is tiny and it stays tied to the brain it started as, it
// eases off at once after a losing streak, the game's rules override it, and what it learned stays
// in that game's slot on the phone (brain.reset() forgets it).
//
//   const { Brain, Wave, Imagine } = gs.brains;
//   make(api) {
//     bot = new Brain(api, {
//       name: 'bot', inputs: 4, actions: ['left', 'right', 'jump', 'wait'],
//       teacher: see => see[0] < 0 ? 'left' : 'right',            // the game's own simple AI
//       limits: { react: .15, perSecond: 6 },                      // human-like caps
//       rules: (see, a) => playerDown && a === 'jump' ? 'wait' : a, // things it may never do
//     });
//   }
//   update(dt) {
//     const a = bot.act([dx / W, dy / H, vx / 300, onGround ? 1 : -1], dt);   // inputs about -1..1
//     if (bot.action === 'jump') ...
//     if (nearMiss) bot.feel(+1);          // a moment that made the round exciting (pressure, a close call)
//     if (playerHit) bot.feel(+.5);
//   }
//   on game over: bot.result(playerWon);   // the win-rate guard rail (call it for each duel or round)
//
// feel() is "this moment was a good challenge". The brain uses it to learn what pressure looks like,
// then turns it up or down to steer the player's win rate to the target: when the player is losing
// too much the same signal teaches it to back off. Waves: every enemy is a small experiment (see
// Wave). Racing and physics: Imagine tries moves ahead with your game's own step function. Board,
// card, rhythm and turn games: Predict learns the player's habits and guesses their next move.
//
// More parts: Player (one private profile of how this player plays, read by every game's brains, so a
// new game starts at their level), styles (one brain, several personalities), tells (a wind-up the
// player can read before the brain changes what it's doing), Nemesis (a rival who remembers you
// between sessions), Shadow (copies how you play: race your own clone, or make a starting brain from
// your own play while making the game), and tune() (finds the game-feel numbers that hit a target).
// The app also tells every brain how fun each round looked (played again, hearted, left in a hurry),
// and the brain leans its pressure towards what this player enjoys, always inside the win-rate rail.
//
// Runs on the phone's CPU in plain JavaScript (a decision takes microseconds).

import { timed } from './prof.js';
import { rng } from './math.js';
import { phoneClass } from './speed.js';
import { currentOwner } from './cleanup.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const MAX_PARAMS = 1200;   // keeps a brain (and its starting copy) inside the game's brain slot
const ODDS = 8;            // skill buckets the win-chance table keeps

// ---------------------------------------------------------------- the network

/** A small fully connected network: tanh hidden layers, softmax out. */
export class Net {
  constructor(sizes, seed = 1) {
    this.sizes = sizes.map(n => Math.max(1, n | 0));
    let n = 0; for (let i = 1; i < this.sizes.length; i++) n += this.sizes[i - 1] * this.sizes[i] + this.sizes[i];
    if (n > MAX_PARAMS) throw new Error(`Tiny Brains: ${n} numbers is too big (most ${MAX_PARAMS}); use fewer inputs or hidden cells`);
    this.w = new Float32Array(n);
    const r = rng(seed); let o = 0;
    for (let i = 1; i < this.sizes.length; i++) {
      const a = this.sizes[i - 1], b = this.sizes[i], s = Math.sqrt(1 / a);
      for (let k = 0; k < a * b; k++) this.w[o++] = (r() * 2 - 1) * s;
      o += b;   // biases start at 0
    }
    this.acts = this.sizes.map(n => new Float32Array(n));
    this.grads = this.sizes.map(n => new Float32Array(n));
    this.even = false;   // even steps: each number's step is scaled by how big its recent steps were
    this.ms = null; this.t = 0;
  }
  get shape() { return this.sizes.join('x'); }
  get length() { return this.w.length; }
  /** Outputs (probabilities, adding up to 1) for inputs x. The array is reused: copy it to keep it. */
  run(x) {
    const A = this.acts, S = this.sizes, w = this.w; let o = 0;
    for (let i = 0; i < S[0]; i++) A[0][i] = clamp(+x[i] || 0, -4, 4);
    for (let l = 1; l < S.length; l++) {
      const a = S[l - 1], b = S[l], inp = A[l - 1], out = A[l], wo = o, bo = o + a * b, last = l === S.length - 1;
      for (let j = 0; j < b; j++) {
        let s = w[bo + j];
        for (let i = 0; i < a; i++) s += w[wo + j * a + i] * inp[i];
        out[j] = last ? s : Math.tanh(s);
      }
      o = bo + b;
    }
    const out = A[S.length - 1]; let m = -Infinity; for (const v of out) m = Math.max(m, v);
    let z = 0; for (let j = 0; j < out.length; j++) z += out[j] = Math.exp(out[j] - m);
    for (let j = 0; j < out.length; j++) out[j] /= z;
    return out;
  }
  /**
   * One small learning step on inputs x: makes `toward` more likely (by `amount`, which can be
   * negative to make it less likely). Returns this. Run it right after run(x) or it runs x itself.
   */
  learn(x, toward, amount, ran = false) {
    if (!amount) return this;
    if (!ran) this.run(x);
    const A = this.acts, G = this.grads, S = this.sizes, w = this.w, L = S.length - 1;
    const out = A[L];
    for (let j = 0; j < out.length; j++) G[L][j] = (j === toward ? 1 : 0) - out[j];   // gradient of log p(toward)
    // even steps (RMSprop-like): divide each number's step by the size of its recent steps, so one
    // learning speed suits inputs of any scale. Bias-corrected, so the first steps aren't huge.
    const even = this.even, ms = even ? (this.ms ||= new Float32Array(w.length)) : null, fix = even ? 1 - Math.pow(EVEN_KEEP, ++this.t) : 1;
    // walk back: offsets of each layer's weights
    const offs = []; let o = 0;
    for (let l = 1; l < S.length; l++) { offs[l] = o; o += S[l - 1] * S[l] + S[l]; }
    for (let l = L; l >= 1; l--) {
      const a = S[l - 1], b = S[l], wo = offs[l], bo = wo + a * b, inp = A[l - 1], g = G[l];
      if (l > 1) { const gi = G[l - 1]; gi.fill(0); for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) gi[i] += w[wo + j * a + i] * g[j]; for (let i = 0; i < a; i++) gi[i] *= 1 - inp[i] * inp[i]; }
      if (!even) { for (let j = 0; j < b; j++) { w[bo + j] += g[j] * amount; for (let i = 0; i < a; i++) w[wo + j * a + i] += g[j] * inp[i] * amount; } continue; }
      for (let j = 0; j < b; j++) {
        w[bo + j] += evenStep(ms, bo + j, g[j], fix) * amount;
        for (let i = 0; i < a; i++) { const k = wo + j * a + i; w[k] += evenStep(ms, k, g[j] * inp[i], fix) * amount; }
      }
    }
    return this;
  }
  copy() { const n = new Net(this.sizes); n.w.set(this.w); n.even = this.even; return n; }
  /** The weights as a short string ("tb1:6x12x4:<scale>:<base64>"), 1 byte each. */
  pack() { return packWeights(this.sizes, this.w); }
  static unpack(s) {
    const p = unpackWeights(s); if (!p) return null;
    const n = new Net(p.sizes); if (n.w.length !== p.w.length) return null; n.w.set(p.w); return n;
  }
}

const EVEN_KEEP = .98, EVEN_SCALE = .25;
function evenStep(ms, k, r, fix) {
  const v = ms[k] = ms[k] * EVEN_KEEP + r * r * (1 - EVEN_KEEP);
  return r / (Math.sqrt(v / fix) + 1e-3) * EVEN_SCALE;
}

export function packWeights(sizes, w) {
  let m = 0; for (const v of w) m = Math.max(m, Math.abs(v));
  const scale = m / 127 || 1e-6, bytes = new Uint8Array(w.length);
  for (let i = 0; i < w.length; i++) bytes[i] = (Math.round(w[i] / scale) + 256) & 255;
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return `tb1:${sizes.join('x')}:${scale.toPrecision(6)}:${btoa(bin)}`;
}
export function unpackWeights(s) {
  const m = /^tb1:(\d+(?:x\d+){1,5}):([0-9.eE+-]+):([A-Za-z0-9+/=]*)$/.exec(String(s || ''));
  if (!m) return null;
  const sizes = m[1].split('x').map(Number), scale = +m[2]; let bin;
  try { bin = atob(m[3]); } catch (_) { return null; }
  if (!(scale > 0) || !isFinite(scale)) return null;
  const w = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) { const b = bin.charCodeAt(i); w[i] = (b > 127 ? b - 256 : b) * scale; }
  return { sizes, w };
}

// ---------------------------------------------------------------- where a brain keeps what it learned

const memory = new Map();   // when the game has no api (tests): kept for this session only
function slot(api, name) {
  const b = api && api.brains;
  return {
    load: () => (b ? b.load(name) : memory.get(name) ?? null),
    save: text => (b ? b.save(name, text) : memory.set(name, text)),
    shared: shape => (b && b.shared ? b.shared(name, shape) : Promise.resolve(null)),
    share: (shape, w, steps) => b && b.share && b.share(name, shape, w, steps),
    onFun: fn => (b && b.onFun ? b.onFun(name, fn) : () => {}),
  };
}

// Live brains, for the debug overlay (dev builds) and the cruelty test: weakly held, tagged with the
// card that made them.
const LIVE = new Set();
const track = o => { o.owner = currentOwner(); LIVE.add(new WeakRef(o)); if (LIVE.size > 200) for (const r of LIVE) if (!r.deref()) LIVE.delete(r); };
/** The brains (Brain, Shadow, Nemesis) still alive, optionally only those a card made. */
export const brainStats = b => b.target && !b.habits ? { name: b.name, kind: 'brain', skill: b.skill, skill0: b.skill0, winRate: b.winRate, target: b.target, rounds: b.rounds, trust: b.trust, lean: b.lean, fun: b.fun, ok: b.net.w.every(Number.isFinite) }
  : b.habits ? { name: b.name, kind: 'nemesis', ...b.record } : { name: b.name, kind: 'shadow', like: b.like, seen: b.seen, ok: b.net.w.every(Number.isFinite) };
export function liveBrains(owner) {
  const out = [];
  for (const r of LIVE) { const o = r.deref(); if (!o) LIVE.delete(r); else if (owner === undefined || o.owner === owner) out.push(o); }
  return out;
}

// ---------------------------------------------------------------- Player

// When a game has no app (tests): one profile for this session.
const memProfile = (() => { let k = {}; return { read: () => JSON.parse(JSON.stringify(k)), write: (kind, v, n) => { k[kind] = { v, n }; return true; }, clear: () => { k = {}; } }; })();

/**
 * How this player plays, across every game: one small private profile on the phone (and their own
 * cloud save, never shared). Every Brain reads it, so a brand new game starts at the player's level
 * instead of the middle; games can note more and read it too.
 *
 *   const me = new gs.brains.Player(api);
 *   me.skill        0..1: where this player's brains tend to settle (.5 before any)
 *   me.reaction     seconds from a cue to their tap (.45 before any)
 *   me.aim          0..1: how often their aimed shots land (.5 before any)
 *   me.note('reaction', .31); me.note('aim', hit ? 1 : 0); me.get('patience', .5)
 *
 * Each note moves the number a little (the newest notes count most), so it follows the player as
 * they improve. Kinds are short names; the whole profile stays under 1 KB.
 */
export class Player {
  constructor(api) { this.store = (api && api.brains && api.brains.player) || memProfile; }
  /** A kind's number, or fallback before any notes. */
  get(kind, fallback = 0) { const e = this.store.read()[kind]; return e && e.n > 0 && isFinite(e.v) ? e.v : fallback; }
  /** How many notes a kind has. */
  count(kind) { const e = this.store.read()[kind]; return e ? e.n | 0 : 0; }
  /** Adds what the player just did to a kind (the newest count most: at least 1/20 of the number). */
  note(kind, v) {
    v = +v; if (!isFinite(v)) return this;
    const e = this.store.read()[kind] || { v, n: 0 }, n = e.n + 1;
    this.store.write(kind, e.v + (v - e.v) * Math.max(1 / n, .05), n);
    return this;
  }
  get skill() { return clamp(this.get('skill', .5), .05, 1); }
  get reaction() { return clamp(this.get('reaction', .45), .08, 3); }
  get aim() { return clamp(this.get('aim', .5), 0, 1); }
  /** Forgets the profile. */
  clear() { this.store.clear && this.store.clear(); return this; }
}

// ---------------------------------------------------------------- Brain

/**
 * A brain for one kind of character. opts:
 *   name        what it's called in the game's brain slot ('bot')
 *   inputs      how many numbers act() gets (scale them to about -1..1)
 *   actions     a count, or a list of names
 *   hidden      hidden cells, default [12]
 *   teacher     (see) => action: the game's own simple AI, which the brain starts by copying
 *   rules       (see, action) => action: the game's hard rules, applied to every choice
 *   limits      { react: seconds between decisions (.12), perSecond: most changes of mind a second (8),
 *                 minNoise: always this share of random choices (.05) }
 *   target      the player's win rate to aim for (.6)
 *   learn       learning speed, 1 = normal
 *   drift       how far each number may move from the brain it started as (1)
 *   share       join shared learning: a fresh brain starts from the average of everyone's (true)
 *   even        even steps: each number learns at a speed scaled to its own recent steps, so one
 *               learn speed suits any game's inputs (true)
 *   odds        learn the player's real win chance at each skill level, and set the skill where
 *               that chance is the target (true); winChance(skill) reads it
 *   styles      personalities, e.g. ['careful', 'bold', 'sneaky']: the brain sees which one it's
 *               playing as an extra input, the teacher and rules get it as a third argument, and
 *               brain.style = 'bold' (or { bold: .7, sneaky: .3 }) switches; a Wave can give each
 *               enemy its own (wave.mind({ style }))
 *   tells       a wind-up before it changes what it's doing, so the player can read it: true, or
 *               { windup: seconds (.2), unsure: extra share when it's torn (1) }. brain.telling is
 *               { action, left, t } during one (draw a glance, a crouch, a flash), else null
 *   start       a starting brain made from your own play (Shadow.pack()), used instead of copying a
 *               teacher: see "teach by playing" in docs/maker-kit.md
 *   fun         lean towards what this player finds fun, from the app's signals (true)
 *   profile     start a fresh brain at the player's usual level and add to it (true)
 */
export class Brain {
  constructor(api, opts = {}) {
    if (api && !opts.inputs && api.inputs) { opts = api; api = null; }
    this.api = api; this.opts = opts;
    this.names = Array.isArray(opts.actions) ? opts.actions.slice() : null;
    const nAct = this.names ? this.names.length : Math.max(2, opts.actions | 0 || 2);
    this.name = String(opts.name || 'brain');
    this.net = new Net([opts.inputs | 0 || 1, ...(opts.hidden || [12]), nAct], hashName(this.name));
    this.limits = { react: .12, perSecond: 8, minNoise: .05, ...(opts.limits || {}) };
    this.target = clamp(opts.target ?? .6, .2, .9);
    this.rate = opts.learn ?? 1;
    this.drift = opts.drift ?? 1;
    this.even = opts.even !== false; this.net.even = this.even;
    this.useOdds = opts.odds !== false;
    this.teacher = opts.teacher || null;
    this.rules = opts.rules || null;
    // personalities: one input each, after the game's own
    this.styles = Array.isArray(opts.styles) && opts.styles.length ? opts.styles.map(String) : null;
    if (this.styles) { this.net = new Net([(opts.inputs | 0 || 1) + this.styles.length, ...(opts.hidden || [12]), nAct], hashName(this.name)); this.sv = new Float32Array(this.styles.length); this.sv[0] = 1; this.styleName = this.styles[0]; }
    this.xbuf = null;
    const t = opts.tells; this.tells = t ? { windup: .2, unsure: 1, ...(t === true ? {} : t) } : null;
    this.slot = slot(api, this.name);
    this.player = opts.profile === false ? null : new Player(api);
    this.r = rng(hashName(this.name) ^ 0x9e3779b9);
    this.fresh();
    this.restore(this.slot.load());
    if (opts.share !== false && this.steps < 200 && !this.started) this.slot.shared(this.net.shape).then(s => this.adoptShared(s)).catch(() => {});
    if (opts.fun !== false) this.slot.onFun(x => this.funSignal(x));
    this.skill0 = this.skill;     // where it started this session (the cruelty test compares)
    track(this);
  }
  /** The personality it's playing ('bold'), or set one: a name, or { bold: .7, sneaky: .3 } to mix. */
  get style() { return this.styleName; }
  set style(v) {
    if (!this.styles) return;
    this.sv.fill(0);
    if (typeof v === 'string') { const i = Math.max(0, this.styles.indexOf(v)); this.sv[i] = 1; this.styleName = this.styles[i]; return; }
    let top = 0, name = this.styles[0];
    for (const [k, w] of Object.entries(v || {})) { const i = this.styles.indexOf(k); if (i >= 0) { this.sv[i] = clamp(+w || 0, 0, 1); if (this.sv[i] > top) { top = this.sv[i]; name = k; } } }
    this.styleName = name;
  }
  /** What the network sees: the game's inputs, then the personality. */
  input(see) {
    if (!this.styles) return see;
    const n = see.length, x = this.xbuf && this.xbuf.length === n + this.sv.length ? this.xbuf : (this.xbuf = new Float32Array(n + this.sv.length));
    for (let i = 0; i < n; i++) x[i] = see[i];
    x.set(this.sv, n); return x;
  }
  fresh() {
    this.anchor = null;           // the brain it started as (set once it has copied the teacher)
    this.trust = this.teacher ? 0 : 1;   // how much of the time it decides instead of the teacher
    this.skill = .5;              // the difficulty dial, steered by the win rate
    this.winRate = this.target;   // the player's, smoothed
    this.losses = 0;              // the player's losses in a row
    this.agree = 0;               // how often it already picks what the teacher would (smoothed)
    this.mood = 0;                // feel() smoothed: how exciting things are
    this.byNet = 0; this.byTeacher = 0;   // excitement while the brain / the teacher was deciding
    this.steps = 0; this.wait = 0; this.since = 1; this.last = -1; this.trace = []; this.saveIn = 10;
    this.ledByNet = false;
    this.odds = new Float32Array(ODDS * 2);   // per skill bucket: player wins, rounds (fading)
    this.rounds = 0;              // results seen
    this.fun = 0;                 // how fun rounds have looked to the app lately (-1..1)
    this.lean = 0;                // more (+) or less (-) pressure than usual, learned from fun (-.3..3)
    this.rSum = 0; this.rN = 0; this.lastRound = null; this.moodAvg = 0;   // feel() this round, last round, usual
    this.unsure = 0;              // how torn the last decision was (0 sure .. 1 torn)
    this.tellNext = -1; this.tellLeft = 0; this.tellLen = 0;
    this.started = false;
    // a starting brain from the maker's own play
    const st = this.opts.start ? Net.unpack(this.opts.start) : null;
    if (st && st.shape === this.net.shape) { this.net = st; this.net.even = this.even; this.anchor = st.copy(); this.trust = this.teacher ? .6 : 1; this.started = true; }
    // a fresh brain starts at the player's usual level
    if (this.player && this.player.count('skill') > 0) this.skill = clamp(this.player.skill, .2, .85);
  }
  /** During a wind-up (tells): { action, left: seconds, t: 0..1 through it }, else null. */
  get telling() {
    if (this.tellNext < 0) return null;
    return { action: this.names ? this.names[this.tellNext] : this.tellNext, left: this.tellLeft, t: this.tellLen ? 1 - this.tellLeft / this.tellLen : 1 };
  }
  /** The starting brain as text: what Shadow.pack() gives, for opts.start. */
  pack() { return this.net.pack(); }
  /**
   * Learns from a move someone showed it (the maker in dev, or a demo): on these inputs, this action.
   * The same imitation the teacher gives, so the guard rails still apply.
   */
  watch(see, action, amount = .05) { this.net.learn(this.input(see), this.index(action), amount * this.rate); this.guard(this.net); return this; }
  // which way pressure should go: the win-rate rail, plus a lean towards what this player enjoys
  // (never more pressure while they're losing more than they should)
  push() {
    const lean = this.winRate < this.target - .1 ? Math.min(0, this.lean) : this.lean;
    return clamp((this.winRate - this.target) * 4 + .25 + lean, -1, 1);
  }
  /**
   * The app's view of how fun the last round was (-1..1): played again soon +1, hearted +1, left the
   * game-over screen at once -0.5, Meh -1. Was that round tenser than usual? Then this player likes
   * pressure (or doesn't), and the brain leans that way next time.
   */
  funSignal(x) {
    x = clamp(+x || 0, -1, 1);
    this.fun += (x - this.fun) * .2;
    if (this.lastRound == null) return;
    const d = clamp((this.lastRound - this.moodAvg) * 4, -1, 1);
    this.lean = clamp(this.lean + x * d * .06, -.3, .3);
  }
  /** The last action's name (or number when actions is a count). */
  get action() { return this.names ? this.names[this.last] : this.last; }
  index(a) { if (typeof a === 'number') return a | 0; const i = this.names ? this.names.indexOf(a) : -1; return i < 0 ? 0 : i; }

  /** Picks an action for what it sees (an array of numbers), once per frame with dt. Returns its index. */
  act(see, dt = 1 / 60, net = this.net) {
    this.wait -= dt; this.since += dt;
    // a wind-up (tells): keep doing what it was doing until the tell has played out
    if (this.tellNext >= 0) {
      this.tellLeft -= dt;
      if (this.tellLeft > 0) return this.last;
      this.last = this.tellNext; this.tellNext = -1; this.since = 0; return this.last;
    }
    if (this.wait > 0 && this.last >= 0) return this.last;
    const raw = see; see = this.input(see);
    // reaction time: slower when the skill dial is low, never faster than limits.react
    this.wait = this.limits.react * (1 + (1 - this.skill) * 1.5);
    const p = net.run(see), teach = this.teacher ? this.index(this.teacher(raw, this.styleName)) : -1;
    // learning, a tiny bit every decision: copy the teacher while it's still learning the game
    if (teach >= 0) {
      const best = argmax(p);
      this.agree += ((best === teach ? 1 : 0) - this.agree) * .02;
      const copy = .03 * this.rate * (1 - this.trust * .8);
      net.learn(see, teach, copy, true);
      net.run(see);
    }
    // choose: the teacher or the brain, then a little randomness, then the game's rules
    this.ledByNet = this.r() < this.trust;
    let a = this.ledByNet || teach < 0 ? sample(p, this.r, 1.6 - this.skill * 1.2) : teach;
    const noise = Math.max(this.limits.minNoise, (1 - this.skill) * .25);
    if (this.r() < noise) a = Math.floor(this.r() * p.length);
    if (this.rules) a = this.index(this.rules(raw, this.names ? this.names[a] : a, this.styleName) ?? a);
    // changes of mind: at most perSecond
    if (this.last >= 0 && a !== this.last && this.since < 1 / this.limits.perSecond) a = this.last;
    // how torn it was: the gap between its top two choices
    { let t1 = 0, t2 = 0; for (const v of p) { if (v > t1) { t2 = t1; t1 = v; } else if (v > t2) t2 = v; } this.unsure = clamp(1 - (t1 - t2), 0, 1); }
    if (this.tells && this.last >= 0 && a !== this.last) {
      // a tell the player can read: longer when the skill dial is low and when it's torn
      this.tellLen = this.tellLeft = this.tells.windup * (1.5 - this.skill) * (1 + this.unsure * this.tells.unsure);
      this.tellNext = a;
    } else {
      if (a !== this.last) this.since = 0;
      this.last = a;
    }
    this.trace.push([Array.from(see), a, net]); if (this.trace.length > 12) this.trace.shift();
    this.steps++;
    this.guard(net);
    if (--this.saveIn <= 0) { this.saveIn = 300; this.persist(); }
    return a;
  }

  /**
   * A moment that made the round exciting for the player: the brain put on pressure, a close call.
   * About -1..1 (negative: a dull or unfair moment). Learned from at once.
   */
  feel(x = 1) {
    x = clamp(+x || 0, -2, 2);
    this.mood += (x - this.mood) * .05; this.rSum += x; this.rN++;
    if (this.ledByNet) this.byNet += (x - this.byNet) * .05; else this.byTeacher += (x - this.byTeacher) * .05;
    // the win-rate guard rail turns the signal: pressure is good while the player wins too easily, and
    // something to back off from while they lose too often
    const dir = this.push();
    const amount = .02 * this.rate * x * dir;
    let decay = 1;
    for (let i = this.trace.length - 1; i >= 0; i--, decay *= .7) { const [s, a, net] = this.trace[i]; net.learn(s, a, amount * decay); }
    // trust grows when moments the brain led are better than moments the teacher led
    if (this.teacher) {
      const ready = this.agree > .8 || this.steps > 2000;
      // once it copies the teacher well it keeps that as its starting brain, and gets a share of the
      // decisions to show what it can do (never less than 10%, so it can keep earning trust)
      if (ready && !this.anchor) { this.anchor = this.net.copy(); this.trust = Math.max(this.trust, .15); this.byNet = this.byTeacher; }
      const step = ready ? (this.byNet >= this.byTeacher ? .004 : -.006) : 0;
      this.trust = clamp(this.trust + step, ready ? .1 : 0, ready ? .95 : .2);
    }
    this.guard(this.net);
  }

  /** The end of a duel or round: did the player win? Steers the difficulty towards the target win rate. */
  result(playerWon) {
    const w = playerWon ? 1 : 0, played = this.skill;
    this.winRate += (w - this.winRate) * .15;
    this.losses = playerWon ? 0 : this.losses + 1;
    // the skill dial: a little each result, a big step down after three player losses in a row
    this.skill = clamp(this.skill + (this.winRate - this.target) * .3, .05, 1);
    if (this.useOdds) this.calibrate(w, played);
    if (this.losses >= 3) { this.skill = clamp(this.skill - .25, .05, 1); this.trust *= .5; this.losses = 0; }
    // this round's excitement, for the fun signal that may follow
    this.lastRound = this.rN ? this.rSum / this.rN : 0; this.moodAvg += (this.lastRound - this.moodAvg) * .2; this.rSum = 0; this.rN = 0;
    this.rounds++;
    if (this.player && this.rounds >= 5) this.player.note('skill', this.skill);
    this.persist();
    if (this.opts.share !== false && this.steps > 500 && this.r() < .2) this.slot.share(this.net.shape, this.net.pack(), this.steps);
  }

  /**
   * The player's chance of winning a round against this brain at a skill level (default: now),
   * learned from results (with odds: true). Before there are results it is the smoothed win rate.
   */
  winChance(skill = this.skill) {
    const o = this.odds, est = [];
    // each bucket's rate, pulled towards the overall win rate while it has few rounds; a higher
    // skill never gives the player a better chance than a lower one
    // (the guess for a bucket with few rounds: today's win rate, a bit lower for each step of skill up)
    for (let b = 0; b < ODDS; b++) {
      const prior = clamp(this.winRate + (this.skill - (.05 + .95 * b / (ODDS - 1))) * .6, .02, .98);
      const v = (o[b * 2] + 2 * prior) / (o[b * 2 + 1] + 2); est.push(b ? Math.min(v, est[b - 1]) : v);
    }
    const x = clamp((skill - .05) / .95, 0, 1) * (ODDS - 1), i = Math.min(ODDS - 2, x | 0), f = x - i;
    return est[i] + (est[i + 1] - est[i]) * f;
  }
  calibrate(w, played) {
    const o = this.odds, b = Math.round(clamp((played - .05) / .95, 0, 1) * (ODDS - 1));
    for (let i = 0; i < o.length; i++) o[i] *= .97;   // old rounds fade, so it follows the player getting better
    o[b * 2] += w; o[b * 2 + 1] += 1;
    let n = 0; for (let i = 1; i < o.length; i += 2) n += o[i];
    if (n < 6) return;
    let best = this.skill, gap = Infinity;
    for (let s = .05; s <= 1.0001; s += .05) {
      const g = Math.abs(this.winChance(s) - this.target);
      if (g < gap - 1e-9 || (g < gap + 1e-9 && Math.abs(s - this.skill) < Math.abs(best - this.skill))) { gap = g; best = s; }
    }
    this.skill = clamp(this.skill + (best - this.skill) * .5, .05, 1);
  }

  /** Keeps every number within `drift` of the brain it started as (and pulls gently back). */
  guard(net) {
    const a = this.anchor; if (!a || net.w.length !== a.w.length) return;
    const w = net.w, aw = a.w, d = this.drift;
    for (let i = 0; i < w.length; i++) { let v = w[i] + (aw[i] - w[i]) * 1e-4; w[i] = v < aw[i] - d ? aw[i] - d : v > aw[i] + d ? aw[i] + d : v; }
  }

  /** Forgets everything it learned (on this phone). */
  reset() { this.net = new Net(this.net.sizes, hashName(this.name)); this.net.even = this.even; this.fresh(); if (this.styles) this.style = this.styleName; this.persist(); return this; }

  persist() {
    const s = JSON.stringify({ w: this.net.pack(), a: this.anchor ? this.anchor.pack() : '', t: +this.trust.toFixed(3), k: +this.skill.toFixed(3),
      r: +this.winRate.toFixed(3), g: +this.agree.toFixed(3), n: this.steps, q: this.rounds, f: +this.lean.toFixed(3), ...(this.useOdds ? { o: Array.from(this.odds, v => +v.toFixed(2)) } : {}) });
    try { this.slot.save(s); } catch (_) {}
  }
  restore(text) {
    if (!text) return;
    let d; try { d = JSON.parse(text); } catch (_) { return; }
    const n = Net.unpack(d.w); if (!n || n.shape !== this.net.shape) return;   // the game changed the brain's shape: start again
    this.net = n; this.anchor = d.a ? Net.unpack(d.a) : null;
    this.trust = clamp(+d.t || 0, 0, 1); if (!this.teacher) this.trust = 1;
    this.skill = clamp(+d.k || .5, .05, 1); this.winRate = clamp(+d.r || this.target, 0, 1);
    this.agree = clamp(+d.g || 0, 0, 1); this.steps = d.n | 0; this.rounds = Math.max(0, d.q | 0); this.lean = clamp(+d.f || 0, -.3, .3);
    this.net.even = this.even;
    if (Array.isArray(d.o) && d.o.length === this.odds.length) d.o.forEach((v, i) => { this.odds[i] = clamp(+v || 0, 0, 1e4); });
  }
  adoptShared(text) {
    if (!text || this.steps >= 200) return;
    const n = Net.unpack(text); if (!n || n.shape !== this.net.shape) return;
    this.net = n; this.net.even = this.even; this.anchor = n.copy(); if (this.teacher) this.trust = .3;
  }
}

// ---------------------------------------------------------------- Wave

/**
 * Every enemy in a wave is a small experiment: each mind is the brain with a small change, scored by
 * how exciting it made things (its feel() total for its life), and pairs of opposite changes move the
 * brain towards whichever did better. All the brain's guard rails apply to every mind.
 *
 *   const wave = new Wave(bot);
 *   spawn() { enemy.mind = wave.mind(); }
 *   update(dt) { const a = enemy.mind.act(see, dt); if (nearMiss) enemy.mind.feel(1); }
 *   when an enemy dies or leaves: enemy.mind.done();
 *
 * wave.unsure(see): how much the live minds disagree about what to do (0 all agree .. 1 none do).
 * A cheap "not sure" signal: lean on the teacher, hesitate, or show a tell when it's high.
 */
export class Wave {
  constructor(brain, { change = .08 } = {}) { this.brain = brain; this.change = change; this.pair = null; this.r = rng(hashName(brain.name) + 7); this.live = new Set(); }
  mind({ style } = {}) {
    const b = this.brain, n = b.net.w.length;
    let sign = 1, eps;
    if (this.pair && !this.pair.taken) { eps = this.pair.eps; sign = -1; this.pair.taken = true; }
    else { eps = new Float32Array(n); for (let i = 0; i < n; i++) eps[i] = gauss(this.r) * this.change; this.pair = { eps, taken: false, score: [null, null] }; }
    const pair = this.pair, net = b.net.copy();
    for (let i = 0; i < n; i++) net.w[i] += sign * eps[i];
    let total = 0, time = 0, alive = true;
    // each mind keeps its own reaction timer and last choice, so a squad of enemies that all act in
    // the same frame each decide for themselves (rather than getting whatever the last one chose)
    const own = { wait: 0, since: 1, last: -1, tellNext: -1, tellLeft: 0, tellLen: 0, unsure: 0 };
    if (b.styles) { const keep = [b.sv.slice(), b.styleName]; b.style = style ?? b.styleName; own.sv = b.sv.slice(); own.styleName = b.styleName; b.sv.set(keep[0]); b.styleName = keep[1]; }
    const swap = () => { for (const k in own) [own[k], b[k]] = [b[k], own[k]]; };
    const self = this; this.live.add(net);
    return {
      act(see, dt = 1 / 60) { time += dt; swap(); try { return b.act(see, dt, net); } finally { swap(); } },
      get action() { return own.last < 0 ? undefined : b.names ? b.names[own.last] : own.last; },
      get telling() { swap(); try { return b.telling; } finally { swap(); } },
      get unsure() { return own.unsure; },
      get style() { return own.styleName; },
      feel(x = 1) { total += clamp(+x || 0, -2, 2); b.feel(x); },
      done() {
        if (!alive) return; alive = false; self.live.delete(net);
        pair.score[sign > 0 ? 0 : 1] = total / Math.max(1, time);
        if (pair.score[0] != null && pair.score[1] != null) self.learn(pair);
      },
    };
  }
  /** How much the live minds disagree on inputs `see`: 0 when they all pick alike, towards 1 apart. */
  unsure(see) {
    const ps = [];
    const x = this.brain.input(see);
    for (const net of this.live) ps.push(Float64Array.from(net.run(x), Math.sqrt));
    const n = ps.length; if (n < 2) return 0;
    // 1 - the average overlap (squared Bhattacharyya coefficient) of every pair of minds' choices
    let sum = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let c = 0; const a = ps[i], b = ps[j]; for (let k = 0; k < a.length; k++) c += a[k] * b[k]; sum += c * c; }
    return clamp(1 - sum / (n * n), 0, 1);
  }
  learn(pair) {
    const b = this.brain, w = b.net.w, [up, down] = pair.score;
    const dir = b.push();   // same win-rate guard rail as feel()
    const k = clamp((up - down) * dir, -1, 1) * .5 * b.rate;
    for (let i = 0; i < w.length; i++) w[i] += k * pair.eps[i];
    b.guard(b.net);
  }
}

// ---------------------------------------------------------------- Imagine

/**
 * Tries moves ahead with your game's own step function before acting: smart from the first second,
 * for racing lines, aiming throws, physics. step(state, action, dt) must return a NEW state (don't
 * change the real one); score(state) says how good a state is for this character. Give it a brain
 * (and see(state) for its inputs) and the brain learns from every plan, and the brain's guard rails
 * apply to the plans.
 *
 *   const plan = new Imagine({ actions: 3, step: (s, a, dt) => drive({ ...s }, a, dt), score: s => s.progress - s.offTrack * 5 });
 *   const a = plan.pick(carState);
 *
 * By default it plans for at most `budget` ms, so a slow phone tries fewer moves. fixed: true always
 * tries every move `tries` times, so it picks the same on every phone (for replays and daily runs);
 * plan.tried says how many rounds of tries the last pick used.
 *
 * auto: true switches planning off on phones that can't afford it: at once on a low phone (see
 * src/kit/speed.js), or when picks keep taking longer than maxMs (default: budget) on average.
 * plan.on says whether it's planning (plan.why says why not). While off, pick() asks
 * fallback(state) for the move, or the brain (with see), or keeps the last move.
 */
export class Imagine {
  constructor({ actions, step, score, depth = 24, dt = 1 / 30, tries = 2, budget = 2, fixed = false, auto = false, maxMs = budget, fallback = null, brain = null, see = null }) {
    this.n = Array.isArray(actions) ? actions.length : actions; this.names = Array.isArray(actions) ? actions : null;
    Object.assign(this, { step, score, depth, dt, tries, budget, fixed, auto, maxMs, fallback, brain, see });
    this.r = rng(99); this.last = 0; this.tried = 0; this.cost = 0; this.picks = 0;
    this.on = true; this.why = '';
    if (auto) { let k = 'mid'; try { k = phoneClass(); } catch (_) {} if (k === 'low') { this.on = false; this.why = 'low phone'; } }
  }
  get action() { return this.names ? this.names[this.last] : this.last; }
  pick(state) {
    if (!this.on) return this.instead(state);
    const start = performance.now(), t0 = this.fixed ? 0 : start, totals = new Float64Array(this.n), counts = new Uint16Array(this.n), hold = Math.max(1, this.depth / 3 | 0);
    this.tried = 0;
    outer: for (let t = 0; t < this.tries; t++, this.tried = t) for (let a = 0; a < this.n; a++) {
      let s = state, sum = 0;
      for (let d = 0; d < this.depth; d++) {
        const act = d < hold ? a : this.brain && this.see ? argmax(this.brain.net.run(this.brain.input(this.see(s)))) : (this.r() < .7 ? a : Math.floor(this.r() * this.n));
        s = this.step(s, act, this.dt); sum += this.score(s) * Math.pow(.97, d);
      }
      totals[a] += sum; counts[a]++;
      if (!this.fixed && t > 0 && performance.now() - t0 > this.budget) { this.tried = t; break outer; }
    }
    let best = 0, bestV = -Infinity;
    for (let a = 0; a < this.n; a++) { const v = counts[a] ? totals[a] / counts[a] : -Infinity; if (v > bestV) { bestV = v; best = a; } }
    let a = best;
    const b = this.brain;
    if (b) {
      if (this.see) b.net.learn(b.input(this.see(state)), best, .03 * b.rate);   // the brain learns from the plan
      if (this.r() < Math.max(b.limits.minNoise, (1 - b.skill) * .3)) a = Math.floor(this.r() * this.n);   // the skill dial
      if (b.rules) { const x = this.see ? this.see(state) : []; a = b.index(b.rules(x, this.names ? this.names[a] : a) ?? a); }
    }
    this.last = a;
    // what a pick costs on this phone (measured only: it never changes the pick)
    const took = performance.now() - start;
    this.picks++; this.cost = this.picks === 1 ? took : this.cost + (took - this.cost) * .1;
    if (this.auto && this.picks >= 10 && this.cost > this.maxMs) { this.on = false; this.why = 'too slow'; }
    return a;
  }
  /** The move while planning is off: the game's fallback, else the brain, else the last move. */
  instead(state) {
    let a = this.last;
    if (this.fallback) { const f = this.fallback(state); a = typeof f === 'number' ? f | 0 : this.names ? Math.max(0, this.names.indexOf(f)) : 0; }
    else if (this.brain && this.see) {
      const x = this.see(state); a = argmax(this.brain.net.run(this.brain.input(x)));
      if (this.brain.rules) a = this.brain.index(this.brain.rules(x, this.names ? this.names[a] : a) ?? a);
    }
    this.last = a; return a;
  }
}

// ---------------------------------------------------------------- Predict

/**
 * Learns the player's habits and guesses their next move: for board, card, rhythm and turn games.
 * It counts what the player did after their last move, last two and last three, and blends those
 * guesses, learning which to believe (logistic mixing). A few dozen moves are enough to spot a habit.
 *
 *   const habits = new Predict(api, { moves: ['rock', 'paper', 'scissors'] });
 *   on each player move: habits.see('paper');
 *   habits.guess()      the most likely next move ('rock'), or null before any moves
 *   habits.chances()    a chance for every move (adds up to 1)
 *   habits.sure         how sure it is (0..1): only counter a habit when it's high
 *   habits.right        how often its guesses came true lately (0..1): "you always open left"
 *
 * It only guesses; the game decides what to do with it, inside the same guard rails as a Brain
 * (counter a habit only some of the time, and less when the player is losing). It keeps what it
 * learned in the game's brain slot (name, default 'habits'); forget() clears it.
 */
export class Predict {
  constructor(api, opts = {}) {
    if (api && !opts.moves && api.moves) { opts = api; api = null; }
    this.names = Array.isArray(opts.moves) ? opts.moves.slice() : null;
    this.n = this.names ? this.names.length : Math.max(2, opts.moves | 0 || 2);
    if (this.n > 64) throw new Error('Predict: at most 64 moves');
    this.name = String(opts.name || 'habits');
    this.rate = opts.learn ?? 1;
    this.slot = slot(api, this.name);
    this.forget(false);
    this.restore(this.slot.load());
  }
  /** Forgets every habit it learned. */
  forget(save = true) {
    const n = this.n;
    // models: 0 = how often each move comes up, 1 = after the last move (exact), 2 and 3 = after the
    // last two / three moves (hashed into 256 rows each, so memory stays small)
    this.c0 = new Float32Array(n); this.c1 = new Float32Array(n * n);
    this.c2 = new Float32Array(PRED_ROWS * n); this.c3 = new Float32Array(PRED_ROWS * n);
    this.mix = new Float64Array([.3, .5, .5, .5]);   // how much it believes each model
    this.past = []; this.seen = 0; this.right = 1 / n; this.saveIn = 20;
    if (save) this.persist();
    return this;
  }
  index(m) { if (typeof m === 'number') return m | 0; const i = this.names ? this.names.indexOf(m) : -1; return i; }
  rows() {
    const p = this.past, n = this.n, k = p.length, R = [[this.c0, 0]];
    if (k >= 1) R.push([this.c1, p[k - 1] * n]);
    if (k >= 2) R.push([this.c2, (predHash(p[k - 2], p[k - 1], 0, 2) % PRED_ROWS) * n]);
    if (k >= 3) R.push([this.c3, (predHash(p[k - 3], p[k - 2], p[k - 1], 3) % PRED_ROWS) * n]);
    return R;
  }
  // each model's log chances for the next move, and the blend
  think() {
    const n = this.n, R = this.rows(), logs = [], out = new Float64Array(n);
    for (const [c, o] of R) {
      let sum = 0; for (let m = 0; m < n; m++) sum += c[o + m];
      const l = new Float64Array(n); for (let m = 0; m < n; m++) l[m] = Math.log((c[o + m] + .4) / (sum + .4 * n));
      logs.push(l);
    }
    let top = -Infinity;
    for (let m = 0; m < n; m++) { let s = 0; for (let i = 0; i < logs.length; i++) s += this.mix[i] * logs[i][m]; out[m] = s; if (s > top) top = s; }
    let z = 0; for (let m = 0; m < n; m++) z += out[m] = Math.exp(out[m] - top);
    for (let m = 0; m < n; m++) out[m] /= z;
    return { R, logs, p: out };
  }
  /** A chance for each move being the player's next (a new array, adding up to 1). */
  chances() { return this.think().p; }
  /** The most likely next move (its name, or index when moves is a count), or null before any moves. */
  guess() { if (!this.seen) return null; const i = argmax(this.chances()); return this.names ? this.names[i] : i; }
  /** How sure the guess is: 0 (no idea, every move as likely) .. 1 (certain). */
  get sure() { if (!this.seen) return 0; const p = this.chances(), n = this.n; return clamp((p[argmax(p)] - 1 / n) / (1 - 1 / n), 0, 1); }
  /** The player made a move: learn from it. */
  see(move) {
    const y = this.index(move); if (y < 0 || y >= this.n) return this;
    const n = this.n, { R, logs, p } = this.think();
    if (this.seen) this.right += ((argmax(p) === y ? 1 : 0) - this.right) * .1;
    // the blend: believe more in the models that gave the real move a better chance than the blend did
    const lr = .02 * this.rate;
    for (let i = 0; i < logs.length; i++) {
      let e = 0; for (let m = 0; m < n; m++) e += p[m] * logs[i][m];
      this.mix[i] = clamp(this.mix[i] + lr * (logs[i][y] - e), -1, 3);
    }
    // the counts: old habits fade once a row is full, so new ones take over
    for (const [c, o] of R) {
      c[o + y] += 1;
      let sum = 0; for (let m = 0; m < n; m++) sum += c[o + m];
      if (sum > PRED_FULL) for (let m = 0; m < n; m++) c[o + m] *= .5;
    }
    this.past.push(y); if (this.past.length > 3) this.past.shift();
    this.seen++;
    if (--this.saveIn <= 0) { this.saveIn = 20; this.persist(); }
    return this;
  }
  persist() {
    // what lasts: the blend and the two small tables (the hashed ones rebuild in a round)
    const n = this.n, round = a => Array.from(a, v => Math.round(v * 10) / 10);
    const d = { v: 1, n, m: Array.from(this.mix, v => +v.toFixed(3)), c0: round(this.c0), r: +this.right.toFixed(3), s: this.seen };
    if (n <= 12) d.c1 = round(this.c1);
    try { this.slot.save(JSON.stringify(d)); } catch (_) {}
  }
  restore(text) {
    if (!text) return;
    let d; try { d = JSON.parse(text); } catch (_) { return; }
    if (!d || d.v !== 1 || d.n !== this.n) return;
    const fill = (dst, src) => { if (Array.isArray(src) && src.length === dst.length) src.forEach((v, i) => { dst[i] = clamp(+v || 0, 0, PRED_FULL); }); };
    if (Array.isArray(d.m) && d.m.length === 4) d.m.forEach((v, i) => { this.mix[i] = clamp(+v || 0, -1, 3); });
    fill(this.c0, d.c0); fill(this.c1, d.c1);
    this.right = clamp(+d.r || 0, 0, 1); this.seen = Math.max(0, d.s | 0);
  }
}
const PRED_ROWS = 256, PRED_FULL = 30;
function predHash(a, b, c, k) { let h = Math.imul(k * 0x9e3779b1 ^ a, 0x85ebca6b); h = Math.imul(h ^ b, 0xc2b2ae35); h = Math.imul(h ^ c, 0x27d4eb2f); return (h ^ (h >>> 15)) >>> 0; }

// ---------------------------------------------------------------- Nemesis

/**
 * A rival who remembers you between sessions: how often you've met, who's ahead, your habits (a
 * Predict inside), and when you last played. Your game writes the lines and draws the rival; the
 * kit picks a fitting line and keeps the rival fair.
 *
 *   const grub = new gs.brains.Nemesis(api, { name: 'grub', moves: ['left', 'right', 'jump'], lines: {
 *     first: ['New face, huh?'], back: ['Back for more?'], long: ['{days} days! Thought you ran off.'],
 *     habit: ['You always go {move}...'], won: ['Lucky. Again!'], lost: ['Good try! Rematch?'], streak: ['{streak} in a row?!'],
 *   } });
 *   reset() { say(grub.met()); }                 // a line for this meeting
 *   on each player move: grub.see('left');
 *   const m = grub.counter(bot.skill);            // the move to guard against, or null
 *   at the end: say(grub.result(playerWon));
 *
 * Guard rails: it only brings up a habit when it's sure and you aren't on a losing run; counter()
 * guesses only some of the time (never more than `skill`, at most 60%, and less while you're
 * losing); after you lose it uses the 'lost' lines, which should be kind (write them that way).
 */
export class Nemesis {
  constructor(api, opts = {}) {
    if (api && !opts.moves && api.moves) { opts = api; api = null; }
    this.name = String(opts.name || 'nemesis');
    this.lines = opts.lines || {};
    this.target = clamp(opts.target ?? .6, .2, .9);
    this.habits = new Predict(api, { moves: opts.moves || 2, name: this.name.slice(0, 18) + '-habit' });
    this.slot = slot(api, this.name);
    this.r = rng(hashName(this.name) ^ 0x5bd1e995);
    this.used = new Map();
    this.forget(false);
    this.load();
    track(this);
  }
  /** Forgets the whole rivalry (the habits too). */
  forget(save = true) {
    this.record = { met: 0, wins: 0, losses: 0, streak: 0, last: 0 };   // wins and losses are the player's; streak: + player wins in a row, - losses
    this.winRate = this.target;
    if (save) { this.habits.forget(); this.save(); }
    return this;
  }
  /** 0..1: how much it wants a rematch (you've been beating it). */
  get grudge() { const r = this.record; return clamp((r.wins - r.losses) / Math.max(4, r.met) + (r.streak > 0 ? r.streak * .1 : 0), 0, 1); }
  /** Your habit it has spotted, { move, sure }, or null (not sure yet, or you're on a losing run). */
  get habit() {
    const h = this.habits;
    if (h.seen < 12 || h.sure < .5 || h.right < .45 || this.record.streak <= -2 || this.winRate < this.target - .15) return null;
    return { move: h.guess(), sure: h.sure };
  }
  /** Start of a meeting: a line for it ('first', 'long' after 3+ days away, 'habit', else 'back'). */
  met(now = Date.now()) {
    const r = this.record, days = r.last ? Math.floor((now - r.last) / 864e5) : 0;
    const kind = !r.met ? 'first' : days >= 3 && this.lines.long ? 'long' : this.habit && this.lines.habit && this.r() < .5 ? 'habit' : 'back';
    r.met++; r.last = now; this.save();
    return this.line(kind, { days });
  }
  /** The player made a move. */
  see(move) { this.habits.see(move); return this; }
  /** The move to guard against, or null: only when it's sure, and only some of the time. */
  counter(skill = .5) {
    const h = this.habit; if (!h) return null;
    const ease = this.winRate < this.target ? .5 : 1;
    return this.r() < Math.min(.6, clamp(skill, 0, 1)) * ease * h.sure ? h.move : null;
  }
  /** End of a meeting: did the player win? A line for it ('streak' after 3+ wins in a row, 'won' or 'lost'). */
  result(playerWon) {
    const r = this.record;
    if (playerWon) { r.wins++; r.streak = r.streak > 0 ? r.streak + 1 : 1; } else { r.losses++; r.streak = r.streak < 0 ? r.streak - 1 : -1; }
    this.winRate += ((playerWon ? 1 : 0) - this.winRate) * .2;
    this.save();
    return this.line(playerWon ? (r.streak >= 3 && this.lines.streak ? 'streak' : 'won') : 'lost');
  }
  /** One of your lines of a kind, not the one it used last, with {move} {wins} {losses} {streak} {met} {days} {name} filled in. Null if there are none. */
  line(kind, vars = {}) {
    const list = this.lines[kind]; if (!Array.isArray(list) || !list.length) return null;
    let i = Math.floor(this.r() * list.length);
    if (list.length > 1 && i === this.used.get(kind)) i = (i + 1) % list.length;
    this.used.set(kind, i);
    const r = this.record, h = this.habit;
    const v = { move: h ? h.move : '', wins: r.wins, losses: r.losses, streak: Math.abs(r.streak), met: r.met, days: 0, name: this.name, ...vars };
    return String(list[i]).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  }
  save() { const r = this.record; try { this.slot.save(JSON.stringify({ v: 1, ...r, wr: +this.winRate.toFixed(3) })); } catch (_) {} }
  load() {
    let d; try { d = JSON.parse(this.slot.load() || 'null'); } catch (_) { return; }
    if (!d || d.v !== 1) return;
    const n = x => Math.max(0, Math.min(1e6, x | 0));
    this.record = { met: n(d.met), wins: n(d.wins), losses: n(d.losses), streak: clamp(d.streak | 0, -99, 99), last: Math.max(0, +d.last || 0) };
    this.winRate = clamp(+d.wr || this.target, 0, 1);
  }
}

// ---------------------------------------------------------------- Shadow

/**
 * Copies how you play. Give it what you see and what you did, as you play; then it can play like
 * you: race your own clone, fight yourself, or hand a friend "your" bot. It's also how a maker teaches
 * a brain by playing (pack() gives a starting brain for new Brain({ start })).
 *
 *   const me = new gs.brains.Shadow(api, { inputs: 3, actions: ['left', 'right', 'jump', 'wait'] });
 *   while the player plays:   me.watch([dx / W, dy / H, vx / 300], playerMove);
 *   the clone, next round:    const a = me.act(see, dt);   me.action
 *   me.like                   how well it copies you lately (0..1)
 *   me.ready                  true once it has watched enough to be worth racing
 *
 * It plays with your own pace (limits.react, perSecond like Brain), a little randomness, and your
 * game's rules. What it learned stays in the game's brain slot (name, default 'shadow'); reset()
 * forgets it. It is never shared.
 */
export class Shadow {
  constructor(api, opts = {}) {
    if (api && !opts.inputs && api.inputs) { opts = api; api = null; }
    this.opts = opts;
    this.names = Array.isArray(opts.actions) ? opts.actions.slice() : null;
    const nAct = this.names ? this.names.length : Math.max(2, opts.actions | 0 || 2);
    this.name = String(opts.name || 'shadow');
    this.sizes = [opts.inputs | 0 || 1, ...(opts.hidden || [12]), nAct];
    this.limits = { react: .1, perSecond: 10, minNoise: .03, ...(opts.limits || {}) };
    this.rules = opts.rules || null;
    this.rate = opts.learn ?? 1;
    this.slot = slot(api, this.name);
    this.r = rng(hashName(this.name) ^ 0x27d4eb2f);
    this.reset(false);
    this.load();
    track(this);
  }
  /** Forgets how you play. */
  reset(save = true) {
    this.net = new Net(this.sizes, hashName(this.name)); this.net.even = true;
    this.like = 0; this.seen = 0; this.last = -1; this.wait = 0; this.since = 1; this.saveIn = 120;
    if (save) this.save();
    return this;
  }
  get action() { return this.names ? this.names[this.last] : this.last; }
  get ready() { return this.seen >= 300 && this.like > .5; }
  index(a) { if (typeof a === 'number') return a | 0; const i = this.names ? this.names.indexOf(a) : -1; return i < 0 ? 0 : i; }
  /** The player, on these inputs, did this. Call it each frame (or each decision) while they play. */
  watch(see, action) {
    const y = this.index(action), p = this.net.run(see);
    this.like += ((argmax(p) === y ? 1 : 0) - this.like) * .01;
    this.net.learn(see, y, .05 * this.rate, true);
    this.seen++;
    if (--this.saveIn <= 0) { this.saveIn = 600; this.save(); }
    return this;
  }
  /** Plays like you: picks an action for what it sees, every frame. Returns its index. */
  act(see, dt = 1 / 60) {
    this.wait -= dt; this.since += dt;
    if (this.wait > 0 && this.last >= 0) return this.last;
    this.wait = this.limits.react;
    const p = this.net.run(see);
    let a = sample(p, this.r, 1);
    if (this.r() < this.limits.minNoise) a = Math.floor(this.r() * p.length);
    if (this.rules) a = this.index(this.rules(see, this.names ? this.names[a] : a) ?? a);
    if (this.last >= 0 && a !== this.last && this.since < 1 / this.limits.perSecond) a = this.last;
    if (a !== this.last) this.since = 0;
    return this.last = a;
  }
  /** What it learned as text: a starting brain for new Brain(api, { start }) with the same inputs and actions. */
  pack() { return this.net.pack(); }
  save() { try { this.slot.save(JSON.stringify({ v: 1, w: this.net.pack(), l: +this.like.toFixed(3), n: this.seen })); } catch (_) {} }
  load() {
    let d; try { d = JSON.parse(this.slot.load() || 'null'); } catch (_) { return; }
    if (!d || d.v !== 1) return;
    const n = Net.unpack(d.w); if (!n || n.shape !== this.net.shape) return;
    n.even = true; this.net = n; this.like = clamp(+d.l || 0, 0, 1); this.seen = Math.max(0, d.n | 0);
  }
}

// ---------------------------------------------------------------- tune

/**
 * Finds game-feel numbers that hit a target, for makers (run it from a test, a script or the dev
 * console, not on players' phones). trial(params) plays a quick round with those numbers (usually a
 * bot or an Imagine plan driving your own update) and returns a number: how long the round lasted,
 * the bot's score, how often the jump was made. tune() searches the ranges for params whose result
 * is closest to `want`.
 *
 *   const best = gs.brains.tune({
 *     params: { jump: [300, 700], gravity: [800, 2000] },
 *     trial: p => playBotRound(p).seconds,     // your own quick simulation
 *     want: 45, tries: 80, seed: 1,
 *   });
 *   // best = { params: { jump: 512, gravity: 1310 }, result: 44.6, tried: 80, log: [...] }
 *
 * Each candidate is tried `repeats` times (results averaged) since bot rounds vary. It starts with a
 * spread of guesses across the ranges, then keeps narrowing around the best one.
 */
export function tune({ params, trial, want, tries = 60, repeats = 3, seed = 1 }) {
  const keys = Object.keys(params || {}); if (!keys.length || typeof trial !== 'function') throw new Error('tune: give params { name: [min, max] } and trial(params)');
  const r = rng(seed), lo = keys.map(k => +params[k][0]), hi = keys.map(k => +params[k][1]);
  const run = x => { const p = {}; keys.forEach((k, i) => { p[k] = x[i]; }); let s = 0; for (let i = 0; i < repeats; i++) s += +trial(p) || 0; return { p, v: s / repeats }; };
  let best = null, spread = .5; const log = [], first = Math.max(4, tries / 4 | 0);
  for (let t = 0; t < tries; t++) {
    const x = keys.map((k, i) => {
      if (!best || t < first) return lo[i] + (hi[i] - lo[i]) * r();   // a spread of guesses first
      const c = best.x[i] + (r() * 2 - 1) * spread * (hi[i] - lo[i]);
      return clamp(c, Math.min(lo[i], hi[i]), Math.max(lo[i], hi[i]));
    });
    const { p, v } = run(x), gap = Math.abs(v - want);
    log.push({ params: p, result: v });
    if (!best || gap < best.gap) best = { x, p, v, gap }; else if (t >= first) spread = Math.max(.02, spread * .93);
  }
  return { params: best.p, result: best.v, tried: tries, log };
}

// ---------------------------------------------------------------- helpers

function argmax(p) { let b = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[b]) b = i; return b; }
function sample(p, r, temp) {
  // softmax temperature on probabilities: p^(1/temp)
  let z = 0; const q = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) z += q[i] = Math.pow(p[i] + 1e-9, 1 / Math.max(.05, temp));
  let x = r() * z; for (let i = 0; i < q.length; i++) if ((x -= q[i]) <= 0) return i;
  return q.length - 1;
}
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function hashName(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// per-frame work, timed while the frame lab is open (prof.js)
timed(Brain.prototype, 'act', 'Tiny Brains');
timed(Imagine.prototype, 'think', 'Tiny Brains');
timed(Shadow.prototype, 'act', 'Tiny Brains');
