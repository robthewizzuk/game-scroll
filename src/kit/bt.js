// Behaviour trees and utility scoring for enemies, pets, units and bosses (gs.ai.Tree, gs.ai.Choose).
//
// Tree: mistreevous (MIT), the behaviour tree most JS games use: written as a short text (MDSL) with
// sequence, selector, parallel, lotto (weighted random), repeat, retry, wait, guards that cut a running
// branch short (while / until), and subtrees. The game's object supplies the actions and conditions by name.
//
//   const tree = new Tree(`root {
//     selector {
//       sequence { condition [Hurt] action [Flee] }
//       sequence while(SeesPlayer) until(Hurt) { action [Chase] action [Bite] }
//       sequence until(SeesPlayer) { action [Wander] }
//     }
//   }`, {
//     Hurt: () => me.hp < 3,                     // a condition: true or false
//     Flee: () => me.runFrom(player) ? Tree.ok : undefined,   // an action: Tree.ok, Tree.fail, or nothing (still going)
//     SeesPlayer: () => sees(me, player), Chase: () => ..., Bite: () => ..., Wander: () => ...,
//   }, { seed: 4 });
//   update(dt) { tree.update(dt); }
//
// Choose: utility AI. Each option scores 0..1 from one or more considerations (multiplied, with the usual
// make-up so more considerations don't mean lower scores); the best wins, with a little stickiness so
// it doesn't flip every frame. Good for "what do I most want right now" (eat, sleep, fight, hide).
//
//   const want = new Choose({
//     eat:   [() => 1 - me.food, Choose.quad],   // a consideration, then a curve that shapes it
//     sleep: () => me.tired,
//     fight: { score: [() => near(player), () => me.hp / 10], weight: 1.5 },
//   }, { stick: .1 });
//   const goal = want.pick();            // 'eat' | 'sleep' | 'fight' (want.scores has every score)
//
// Both can be coached (Tiny Brains corrections; coach: true, or a gs.brains.Coach to keep it on the phone).
// Choose: want.coach.correct('sleep') says "there, it should have wanted sleep" and want.coach.avoid() "not
// what it just picked, there"; a couple of times and it picks so whenever its considerations read like that.
// Tree: give it `see: () => [numbers about the moment]`; tree.avoid('Bite') makes that action fail in
// moments like this one (so the tree goes on to its next branch), and tree.correct('Flee') makes the built-in
// condition [Told, "Flee"] true in them: put `sequence { condition [Told, "Flee"] action [Flee] }` first.
import { BehaviourTree, State } from 'mistreevous';
import { Coach } from './brains.js';

const rng = seed => { let a = seed >>> 0 || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

// the names of a definition's actions (MDSL text, or mistreevous JSON)
function actionsOf(def) {
  const out = [], add = n => { if (n && !out.includes(n)) out.push(n); };
  if (typeof def === 'string') { for (const m of def.matchAll(/\baction\s*\[\s*([A-Za-z_$][\w$]*)/g)) add(m[1]); }
  else { const walk = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (n.type === 'action') add(n.call); walk(n.children); walk(n.child); }; walk(def); }
  return out;
}
export class Tree {
  /** definition: MDSL text (or mistreevous JSON); agent: { Name: fn } for every action and condition; seed: repeatable lotto and waits; coach + see: corrections (see the top of the file). */
  constructor(definition, agent, { seed = 1, coach = null, see = null } = {}) {
    this.dt = 0; const random = rng(seed);
    this.coach = coach === true ? new Coach({ name: 'tree', save: false }) : coach || null; this.see = see; this.doing = null; this.told = null;
    if (this.coach && see) {
      const names = actionsOf(definition), C = this.coach; this.names = names; this.spot = null; this.lean = null;
      C.shape(see().length, names);
      // an action its examples say "not here" about fails at once, and Told(name) is true where they say "this, here"
      const own = agent; agent = Object.create(own);
      for (const name of names) {
        const fn = own[name]; if (typeof fn !== 'function') continue;
        agent[name] = (...args) => {
          const t = this.look(), i = names.indexOf(name);
          if (t && t[i] <= -3) { this.told = { action: name, not: true }; return State.FAILED; }
          this.doing = name; return fn.apply(own, args);
        };
      }
      if (typeof own.Told !== 'function') agent.Told = name => { const t = this.look(), i = names.indexOf(name); if (!t || i < 0 || t[i] < 3) return false; for (let j = 0; j < t.length; j++) if (t[j] > t[i]) return false; this.told = { action: name, not: false }; return true; };
    } else this.coach = null;
    this.bt = new BehaviourTree(definition, agent, { getDeltaTime: () => this.dt, random });
  }
  // what the coach's examples say about this moment (asked once a step, and only when an action or Told needs it)
  look() { if (!this.spot) { this.spot = this.see(); this.lean = this.coach.lean(this.spot); } return this.lean; }
  /** "In a moment like this, do this": makes condition [Told, "Name"] true in moments like it (with coach and see). */
  correct(name) { if (this.coach) this.coach.correct(this.see(), name); return this; }
  /** "Not that, in a moment like this": the action named (or the one it last ran) fails at once in moments like it. */
  avoid(name = this.doing) { if (this.coach && name) this.coach.avoid(this.see(), name); return this; }
  /** One step of thinking; dt in seconds (wait nodes count game time, so they pause with the game). A finished tree starts again at the top. */
  update(dt) { this.dt = dt; this.spot = null; this.told = null; this.bt.step(); if (!this.bt.isRunning()) this.bt.reset(); return this; }
  /** 'running', 'ok' or 'failed' after the last step. */
  get state() { const s = this.bt.getState(); return s === State.SUCCEEDED ? 'ok' : s === State.FAILED ? 'failed' : 'running'; }
  /** Starts again from the top. */
  reset() { this.bt.reset(); return this; }
  /** The names of the nodes running now, root first (for a debug label). */
  path() {
    const out = [], walk = n => { if (n.state !== State.RUNNING) return; out.push(n.name || n.type); for (const c of n.children || (n.child ? [n.child] : [])) walk(c); };
    walk(this.bt.getTreeNodeDetails()); return out;
  }
}
/** What an action returns: done, failed (nothing means still going). */
Tree.ok = State.SUCCEEDED; Tree.fail = State.FAILED; Tree.run = State.RUNNING;

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v || 0;
export class Choose {
  /** options: { name: fn | [fn, curve?, fn, curve?...] | { score, weight } }; stick: a bonus for the current pick; noise: random wobble; seed; coach: true or a gs.brains.Coach (want.coach.correct(name), .avoid(), .recalled). */
  constructor(options, { stick = .1, noise = 0, seed = 1, coach = null } = {}) {
    this.options = Object.entries(options).map(([name, o]) => {
      const spec = typeof o === 'function' || Array.isArray(o) ? { score: o } : o, list = [].concat(spec.score), parts = [];
      for (const f of list) { if (f.curve) parts[parts.length - 1].curve = f; else parts.push({ f }); }
      return { name, parts, weight: spec.weight ?? 1 };
    });
    Object.assign(this, { stick, noise }); this.random = rng(seed); this.scores = {}; this.current = null;
    this.coach = coach === true ? new Coach({ name: 'choose', save: false }) : coach || null;
    if (this.coach) { let n = 0; for (const o of this.options) n += o.parts.length; this.vals = new Float32Array(n); this.coach.shape(n, this.options.map(o => o.name)); }
  }
  /** Scores every option (passing args on to each consideration) and returns the best one's name. */
  pick(...args) {
    let best = null, bestScore = -1, k = 0;
    const C = this.coach, vals = this.vals;
    for (const o of this.options) {
      // (a coach's examples are about what every consideration reads, so with one they are all read)
      let s = 1; for (const p of o.parts) { const v = clamp01(p.f(...args)); if (C) vals[k++] = v; s *= p.curve ? clamp01(p.curve(v)) : v; if (!s && !C) break; }
      const n = o.parts.length; if (n > 1 && s > 0) { const mod = 1 - 1 / n; s += (1 - s) * mod * s; }   // make-up: more considerations shouldn't mean lower scores
      s *= o.weight; if (o.name === this.current) s += this.stick; if (this.noise) s += (this.random() - .5) * this.noise;
      this.scores[o.name] = s; if (s > bestScore) { bestScore = s; best = o.name; }
    }
    // coached: its own order, best first, unless the examples say otherwise in a spot like this
    if (C) best = C.pick(vals, this.options.map(o => o.name).sort((a, b) => this.scores[b] - this.scores[a]));
    this.current = best; return best;
  }
}
// curves to shape a consideration (0..1 in, 0..1 out); mark them so Choose knows they follow one
const curve = f => (f.curve = true, f);
Choose.linear = curve(v => v);
Choose.quad = curve(v => v * v);
Choose.root = curve(v => Math.sqrt(v));
Choose.invert = curve(v => 1 - v);
/** An S-shape: low below mid, high above it; k is how sharp. */
Choose.logistic = (mid = .5, k = 10) => curve(v => 1 / (1 + Math.exp(-k * (v - mid))));
/** 1 at or above `at`, else 0. */
Choose.step = (at = .5) => curve(v => v >= at ? 1 : 0);
