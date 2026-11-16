// AI playtester: a bot that really tries to win a game, for the PR check (scripts/playtest.cjs).
// The QA bots only sit still or mash taps; this one runs the game much faster than real time with
// a seeded Math.random and looks ahead: every quarter second of game time it tries a few taps,
// holds, swipes, drags and keys (and doing nothing), plays each out a little, and keeps the best. It reports
// whether the goal was reached and after how much game time, so a goal nobody can reach (or one
// reached by doing nothing) shows up before Rob plays it.
//
// Dev and test builds only: __gs.playtest(id, opts) loads this file.
import { ownedBy, release, stopAll } from './kit/cleanup.js';
import { sound } from './sfx.js';
import { rng as makeRng } from './kit/math.js';
import { tickRate } from './kit/tick.js';

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const clampTo = (v, max) => Math.max(max * .03, Math.min(max * .97, v));
// Games the bot can't judge: winning them takes thinking (a puzzle, words, memory, a plan), not
// reactions, so "goal not reached" from it says nothing. Read from the game's tag (every Board game counts:
// they are played in turns against an opponent, over more minutes than the bot plays).
export const THINKING = /\b(puzzle|word|logic|brain|memory|trivia|quiz|riddle|sudoku|maze|merge|sort|match|cards?|chess|board|strategy|tactics?|deduction|spelling|maths?|codes?)/i;

// Plays rounds of a game much faster than real time, each following a plan of inputs (sorted by time) with a
// seeded Math.random: run(plan, roundSeed, realLimit, stopAt) -> { score, goalAt, ended, sec, win }.
function runner(def, baseApi, maxSec) {
  const W = def.w, H = def.h, goal = def.goal || 0, h = 1 / (tickRate(def) || 60);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), errors = new Set(), stats = { evals: 0 };
  const realRandom = Math.random;
  // one round following plan (sorted by time); deterministic for a given plan and seed
  function run(plan, roundSeed, realLimit = 4000, stopAt = maxSec) {
    const owner = {}, R = makeRng(roundSeed); let game, score = 0, ended = null, goalAt = null, best = 0;
    const save = new Map();
    const api = {
      ...baseApi,
      score: n => { score = n; if (n > best) best = n; if (goal && n >= goal && goalAt == null) goalAt = t; },
      over: () => { ended = ended || 'over'; }, win: () => { ended = 'win'; if (goalAt == null) goalAt = t; },
      has: () => false, save: d => { save.set('d', JSON.parse(JSON.stringify(d))); }, load: f => save.has('d') ? save.get('d') : f, clearSave: () => save.clear(),
      away: () => 0,
    };
    let t = 0;
    Math.random = R; stats.evals++;
    const t0 = performance.now();
    // The game's own clock: kits that time touches with performance.now() (holds, swipe speed, double
    // taps) and games that read Date.now() see game time, not the much faster real time of the run.
    const realNow = performance.now, realDate = Date.now, base = realDate();
    performance.now = () => t0 + t * 1000; Date.now = () => base + Math.round(t * 1000);
    try {
      ownedBy(owner, () => { game = def.make(api); game.reset(); });
      let i = 0, held = null, ticks = 0;
      while (t < stopAt && !ended && goalAt == null) {
        while (i < plan.length && plan[i].at <= t) {
          const m = plan[i++];
          if (held) { held.up(); held = null; }
          if (m.kind === 'key') { game.key?.(m.key, true); held = { end: t + m.len, up: () => game.key?.(m.key, false) }; }
          else {
            game.down?.(m.x, m.y, 0);
            const f = { end: t + m.len, x: m.x, y: m.y, m }; f.up = () => game.up?.(f.x, f.y, 0); held = f;
          }
        }
        if (held && held.m && held.m.kind === 'circle') {   // a finger going round and round (the lazy checks)
          const m = held.m, a = (t - m.at) / m.period * Math.PI * 2;
          held.x = m.cx + Math.cos(a) * m.r; held.y = m.cy + Math.sin(a) * m.r;
          game.move?.(held.x, held.y, true, 0);
        }
        if (held && held.m && held.m.kind === 'drag') {   // slide the finger towards the end point
          const k = Math.min(1, 1 - (held.end - t) / held.m.len);
          held.x = held.m.x + (held.m.x2 - held.m.x) * k; held.y = held.m.y + (held.m.y2 - held.m.y) * k;
          game.move?.(held.x, held.y, true, 0);
        }
        if (held && t >= held.end) { const u = held.up; held = null; u(); }
        game.update(h); t += h; ticks++;
        if (ticks % 15 === 0) { game.draw(ctx, 1); if (realNow.call(performance) - t0 > realLimit) break; }
      }
    } catch (e) { errors.add(String(e && e.message || e)); }
    finally { Math.random = realRandom; delete performance.now; Date.now = realDate; if (performance.now !== realNow) performance.now = realNow; try { stopAll(); } catch (_) { /* nothing playing */ } release(owner); }
    return { score: best, goalAt, ended, sec: t, win: goalAt != null };
  }

  return { run, errors, stats };
}

/**
 * playtest(def, baseApi, { budget, maxSec, seed }) -> report.
 * budget: real milliseconds to search (default 20 s). maxSec: longest round in game seconds (180).
 */
export async function playtest(def, baseApi, { budget = 20000, maxSec = 180, seed = 1, pop = 6 } = {}) {
  const W = def.w, H = def.h, goal = def.goal || 0, r = makeRng(seed);
  const wasMuted = sound.muted; sound.muted = true;
  const R = runner(def, baseApi, maxSec), run = R.run, errors = R.errors;
  // plans
  const pt = () => ({ x: r.range(W * .04, W * .96), y: r.range(H * .04, H * .96) });
  const move = at => {
    const k = r(), p = pt();
    if (k < .08) return { at, kind: 'key', key: r.pick(KEYS), len: r.range(.05, .8) };
    if (k < .45) return { at, kind: 'tap', ...p, len: r.range(.03, .12) };
    if (k < .6) return { at, kind: 'hold', ...p, len: r.range(.2, 1.5) };
    if (k < .82) {   // a real swipe: a quick straight flick one way, as fast and as far as a thumb does it
      const [dx, dy] = r.pick(DIRS), d = Math.min(W, H) * r.range(.15, .35), sx = clampTo(p.x, W), sy = clampTo(p.y, H);
      return { at, kind: 'drag', x: sx, y: sy, x2: clampTo(sx + dx * d, W), y2: clampTo(sy + dy * d, H), len: r.range(.06, .14) };
    }
    const q = pt(); return { at, kind: 'drag', ...p, x2: q.x, y2: q.y, len: r.range(.1, .6) };
  };
  const randomPlan = (gap = r.range(.12, .7)) => { const out = []; for (let at = r.range(0, .5); at < maxSec; at += gap * r.range(.5, 1.5)) out.push(move(at)); return out; };

  const start = performance.now();
  const idle = run([], 1);
  const firstGen = Array.from({ length: pop }, () => run(randomPlan(), 1));
  // Looking ahead: every STEP of game time, try a few next moves (and doing nothing), each followed
  // by a short random play-out, by replaying the round so far (games can't be copied, but with a
  // seeded Math.random a replay is exact). Keep the best and move on. Slow (each look replays from
  // the start), but it reacts like a player, which a fixed plan can't.
  const STEP = .25, AHEAD = 1.6, TRIES = 5;
  const value = res => res.win ? 1e12 - res.goalAt : res.ended ? -1e9 + res.score * 1e3 + res.sec : res.score * 1e3 + res.sec * .01;
  let plan = [], t = 0, looks = 0;
  while (t < maxSec && performance.now() - start < budget) {
    let pick = null;
    for (let k = 0; k <= TRIES; k++) {
      const next = k === 0 ? [] : [move(t + r.range(0, STEP * .5))];
      const tail = []; for (let at = t + STEP; at < t + AHEAD; at += r.range(.15, .5)) tail.push(move(at));
      // each try is played out twice: with a few random moves after it, and with nothing after it
      // (random moves can lose a game a careful player wouldn't)
      for (const after of [tail, []]) {
        const res = run([...plan, ...next, ...after], 1, 4000, t + AHEAD); looks++;
        if (!pick || value(res) > value(pick.res)) pick = { next, tail: after, res };
      }
    }
    if (pick.res.win) { plan = [...plan, ...pick.next, ...pick.tail]; break; }
    plan.push(...pick.next); t += STEP;
    if (pick.res.ended && pick.res.sec < t) break;   // even the best try lost before the next look: the round is over
  }
  const top = { plan, res: run(plan, 1) };
  if (value(firstGen.reduce((a, b) => value(b) > value(a) ? b : a, firstGen[0])) > value(top.res)) top.res = firstGen.reduce((a, b) => value(b) > value(a) ? b : a);
    sound.muted = wasMuted;
  return {
    id: def.id, goal, tick: tickRate(def) || null, thinking: THINKING.test(def.tag || ''),
    reached: top.res.win, goalAt: top.res.win ? +top.res.goalAt.toFixed(1) : null, best: top.res.score,
    idleScore: idle.score, idleWin: idle.win, idleEndsAt: idle.ended ? +idle.sec.toFixed(1) : null,
    randomBest: Math.max(...firstGen.map(x => x.score)), randomWin: firstGen.some(x => x.win),
    playedTo: +top.res.sec.toFixed(1), looks, evals: R.stats.evals, ms: Math.round(performance.now() - start), errors: [...errors],
  };
}

// The lazy tricks: what a player who doesn't want to play tries first. None of them should reach the goal:
// a game one of them wins is a game you don't have to play (and doing nothing shouldn't score at all).
export const TRICKS = ['idle', 'hold the middle', 'mash one spot', 'circles', 'swipe back and forth'];
/**
 * lazy(def, baseApi, { maxSec, seed }) -> { id, goal, tricks: [{ trick, best, win, goalAt, ended, sec, share }], errors }.
 * Each trick is played as one round (several spots for mashing; the best counts), much faster than real time.
 * share: the trick's best score over the goal.
 */
export async function lazy(def, baseApi, { maxSec = 120, seed = 1 } = {}) {
  const W = def.w, H = def.h, goal = def.goal || 0;
  const wasMuted = sound.muted; sound.muted = true;
  const R = runner(def, baseApi, maxSec), out = [];
  const every = (gap, make) => { const p = []; for (let at = .3; at < maxSec; at += gap) p.push(make(at, p.length)); return p; };
  const spots = [[W / 2, H / 2], [W / 2, H * .82], [W / 2, H * .2]];
  const plans = {
    'idle': [[]],
    'hold the middle': [[{ at: .3, kind: 'hold', x: W / 2, y: H / 2, len: maxSec }]],
    'mash one spot': spots.map(([x, y]) => every(.14, at => ({ at, kind: 'tap', x, y, len: .05 }))),
    'circles': [[{ at: .3, kind: 'circle', x: W / 2 + Math.min(W, H) * .28, y: H / 2, cx: W / 2, cy: H / 2, r: Math.min(W, H) * .28, period: .9, len: maxSec }]],
    'swipe back and forth': [every(.3, (at, i) => ({ at, kind: 'drag', x: W * (i % 2 ? .8 : .2), y: H / 2, x2: W * (i % 2 ? .2 : .8), y2: H / 2, len: .18 }))],
  };
  for (const trick of TRICKS) {
    let best = null;
    for (const plan of plans[trick]) {
      const res = R.run(plan, seed, 5000);
      if (!best || (res.win && !best.win) || (res.win === best.win && res.score > best.score)) best = res;
    }
    out.push({ trick, best: best.score, win: best.win, goalAt: best.win ? +best.goalAt.toFixed(1) : null, ended: best.ended, sec: +best.sec.toFixed(1), share: goal ? +(best.score / goal).toFixed(2) : 0 });
  }
  sound.muted = wasMuted;
  return { id: def.id, goal, thinking: THINKING.test(def.tag || ''), tricks: out, errors: [...R.errors] };
}
