// Solvers for puzzle and turn-based games.
//
// Puzzle: cells with possible values and rules between them (all different, sums, your own). It
// solves, counts answers (so a made puzzle has exactly one), carves a full answer down to the
// fewest clues that still have one answer, grades how hard it is the way people solve (by
// deduction first, guessing only when stuck), and gives fair hints: a cell the player can work out
// from what's on the board now.
//
//   const p = new Puzzle();
//   for (let i = 0; i < 81; i++) p.cell(i, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
//   rows / columns / boxes: p.allDiff([...ids])
//   const full = p.solve({ rng }).solution;               // a random filled grid
//   const clues = p.carve(full, { rng, grade: 'medium' }); // the clues to show
//   p.hint(clues, playerMoves)                              // -> { id, value, why, wrong } or null
//
// Search: a computer opponent for turn-based games (board, card, hex...). Your game says what moves
// there are and what a move does; it looks ahead (minimax with alpha-beta and iterative deepening,
// or Monte Carlo tree search for games with dice or huge choice) within a time budget, and plays
// worse on purpose when skill is low.
//
// Our own code: the JavaScript constraint and game-search libraries are unmaintained or SAT-only,
// and SAT can't grade a puzzle by how a person would solve it.
import { rng as makeRng } from './math.js';

const bits = n => { let c = 0; while (n) { n &= n - 1; c++; } return c; };
const low = n => 31 - Math.clz32(n & -n);   // index of the lowest set bit

/* ======================== Puzzle ======================== */

export class Puzzle {
  constructor() { this.ids = []; this.index = new Map(); this.values = []; this.rules = []; this.of = []; }

  /** A cell: id (anything) and the values it may take (at most 31). */
  cell(id, values) {
    if (this.index.has(id)) throw new Error('Puzzle: cell ' + id + ' twice');
    if (!values.length || values.length > 31) throw new Error('Puzzle: a cell takes 1 to 31 values');
    this.index.set(id, this.ids.length); this.ids.push(id); this.values.push(values.slice()); this.of.push([]);
    return this;
  }
  /** These cells all differ (rows, columns, boxes, cages). */
  allDiff(ids) { return this.add({ kind: 'diff', cells: this.at(ids) }); }
  /** These cells (number values) add up to total. */
  sum(ids, total) { return this.add({ kind: 'sum', cells: this.at(ids), total }); }
  /** Your own rule: ok(values) gets the cells' values (in order) once they are all known. */
  rule(ids, ok) { return this.add({ kind: 'rule', cells: this.at(ids), ok }); }
  at(ids) { return ids.map(id => { const i = this.index.get(id); if (i == null) throw new Error('Puzzle: no cell ' + id); return i; }); }
  add(r) { r.n = this.rules.length; this.rules.push(r); for (const c of r.cells) this.of[c].push(r); return this; }

  // domains: one bitmask of value indexes per cell
  start(known) {
    const d = this.values.map(v => (1 << v.length) - 1);
    if (known) for (const [id, val] of Object.entries(known instanceof Map ? Object.fromEntries(known) : known)) {
      const i = this.index.get(this.index.has(id) ? id : +id); if (i == null) continue;
      const k = this.values[i].indexOf(val); if (k < 0) return null;
      d[i] &= 1 << k; if (!d[i]) return null;
    }
    return d;
  }

  // Deduction: what a person would do. Returns false on a contradiction. log (optional) gets each
  // cell worked out: [cell, valueIndex, how].
  deduce(d, log = null, { hidden = true } = {}) {
    const queue = [...this.rules], inQ = new Set(queue.map(r => r.n));
    const touch = c => { for (const r of this.of[c]) if (!inQ.has(r.n)) { inQ.add(r.n); queue.push(r); } };
    const fixed = (c, how) => { if (log) log.push([c, low(d[c]), how]); touch(c); };
    while (queue.length) {
      const r = queue.shift(); inQ.delete(r.n);
      if (r.kind === 'diff') {
        for (const c of r.cells) if (bits(d[c]) === 1) for (const o of r.cells) if (o !== c && d[o] & d[c]) {
          d[o] &= ~d[c]; if (!d[o]) return false; if (bits(d[o]) === 1) fixed(o, 'only');
        }
        let all = 0; for (const c of r.cells) all |= d[c];
        if (bits(all) < r.cells.length) return false;   // more cells than values left
        if (hidden) {   // a value with one place left in the group goes there
          for (let m = all; m; m &= m - 1) {
            const b = m & -m; let where = -1, n = 0;
            for (const c of r.cells) if (d[c] & b) { n++; where = c; }
            if (n === 1 && bits(d[where]) > 1) { d[where] = b; fixed(where, 'last'); }
          }
        }
      } else if (r.kind === 'sum') {
        for (const c of r.cells) {
          let lo = 0, hi = 0;
          for (const o of r.cells) if (o !== c) { const v = this.vals(o, d[o]); lo += Math.min(...v); hi += Math.max(...v); }
          const vs = this.values[c]; let nd = 0;
          for (let m = d[c]; m; m &= m - 1) { const k = low(m), v = vs[k]; if (v + lo <= r.total && v + hi >= r.total) nd |= 1 << k; }
          if (!nd) return false;
          if (nd !== d[c]) { d[c] = nd; if (bits(nd) === 1) fixed(c, 'sum'); else touch(c); }
        }
      } else if (r.kind === 'rule') {
        if (r.cells.every(c => bits(d[c]) === 1) && !r.ok(r.cells.map(c => this.values[c][low(d[c])]))) return false;
        // one cell left open: keep only the values that pass
        const open = r.cells.filter(c => bits(d[c]) !== 1);
        if (open.length === 1) {
          const c = open[0]; let nd = 0;
          for (let m = d[c]; m; m &= m - 1) { const k = low(m); if (r.ok(r.cells.map(x => this.values[x][x === c ? k : low(d[x])]))) nd |= 1 << k; }
          if (!nd) return false;
          if (nd !== d[c]) { d[c] = nd; if (bits(nd) === 1) fixed(c, 'rule'); else touch(c); }
        }
      }
    }
    return true;
  }
  vals(c, m) { const out = []; for (; m; m &= m - 1) out.push(this.values[c][low(m)]); return out; }

  // Deduction, then guessing on the cell with the fewest choices. Calls found(d) for each answer;
  // found returns true to stop. stats counts guesses.
  search(d, found, rand, stats) {
    if (!this.deduce(d)) return false;
    let best = -1, bn = 99;
    for (let i = 0; i < d.length; i++) { const n = bits(d[i]); if (n > 1 && n < bn) { bn = n; best = i; } }
    if (best < 0) return found(d);
    let choices = []; for (let m = d[best]; m; m &= m - 1) choices.push(m & -m);
    if (rand) choices = rand.shuffle(choices);
    for (const b of choices) {
      if (stats) stats.guesses++;
      const nd = d.slice(); nd[best] = b;
      if (this.search(nd, found, rand, stats)) return true;
    }
    return false;
  }
  answer(d) { const out = {}; d.forEach((m, i) => { out[this.ids[i]] = this.values[i][low(m)]; }); return out; }

  /** Solves from the known cells. { solution, count } (count up to `limit`, default 1). rng: a random answer. */
  solve({ known = null, limit = 1, rng = null } = {}) {
    const d = this.start(known); if (!d) return { solution: null, count: 0 };
    let first = null, count = 0;
    const rand = rng == null ? null : typeof rng === 'function' ? rng : makeRng(rng);
    this.search(d, s => { if (!first) first = this.answer(s); return ++count >= limit; }, rand, null);
    return { solution: first, count };
  }
  /** Does this set of clues have exactly one answer? */
  unique(known) { return this.solve({ known, limit: 2 }).count === 1; }

  /**
   * How hard it is for a person: 'easy' (deduction alone solves it), 'medium', 'hard', 'expert'
   * (more guesses needed). Also { guesses, open } (cells left after deduction alone).
   */
  grade(known) {
    const d = this.start(known); if (!d) return { level: 'none', guesses: 0, open: this.ids.length };
    const plain = d.slice(); this.deduce(plain);
    const open = plain.filter(m => bits(m) > 1).length;
    if (!open) return { level: 'easy', guesses: 0, open };
    const stats = { guesses: 0 }; this.search(d, () => true, null, stats);
    const level = stats.guesses <= 2 ? 'medium' : stats.guesses <= 8 ? 'hard' : 'expert';
    return { level, guesses: stats.guesses, open };
  }

  /**
   * Takes clues away from a full answer while it keeps exactly one answer. grade: stop once the
   * puzzle is this hard ('easy' keeps it solvable by deduction alone). keep: fewest clues to leave.
   * Returns the clues as { id: value }.
   */
  carve(solution, { rng = 1, grade = 'hard', keep = 0 } = {}) {
    const r = typeof rng === 'function' ? rng : makeRng(rng), order = r.shuffle(this.ids), clues = { ...solution };
    const rank = { easy: 0, medium: 1, hard: 2, expert: 3 }, want = rank[grade] ?? 2;
    let left = this.ids.length;
    for (const id of order) {
      if (left <= keep) break;
      const v = clues[id]; delete clues[id];
      const ok = want === 0 ? this.grade(clues).level === 'easy' : this.unique(clues) && rank[this.grade(clues).level] <= want;
      if (ok) left--; else clues[id] = v;
    }
    return clues;
  }

  /**
   * A fair hint: a cell the player can work out from the clues and their moves so far, and why
   * ('only': nothing else fits there; 'last': the only place left for that value; 'sum' / 'rule').
   * If deduction alone finds none, the open cell with the fewest choices, from the answer. Moves
   * that don't match the answer come back in `wrong`, so the game can point them out (the hint
   * then works from the clues and the right moves). null when nothing is left to find.
   */
  hint(clues, moves = {}) {
    const sol = this.solve({ known: clues }).solution; if (!sol) return null;
    const wrong = Object.keys(moves).filter(id => sol[id] !== moves[id]).map(k => this.index.has(k) ? k : +k);
    const known = { ...clues }; for (const id of Object.keys(moves)) if (!wrong.includes(id)) known[id] = moves[id];
    const d = this.start(known), log = [];
    if (d && this.deduce(d, log)) for (const [c, k, how] of log) { const id = this.ids[c]; if (!(id in known)) return { id, value: this.values[c][k], why: how, wrong }; }
    const plain = this.start(known); if (plain) this.deduce(plain);
    let best = null, bn = 99;
    this.ids.forEach((id, i) => { if (id in known) return; const n = plain ? bits(plain[i]) : 2; if (n < bn) { bn = n; best = id; } });
    return best == null ? (wrong.length ? { id: null, value: null, why: 'wrong', wrong } : null) : { id: best, value: sol[best], why: 'guess', wrong };
  }
}

/* ======================== Search: turn-based opponents ======================== */

/**
 * new Search({ moves, play, score, turn, over, chance })
 *   moves(state): the moves the player to move can make
 *   play(state, move): the new state (don't change the old one)
 *   score(state, player): how good the state looks for player (bigger is better; a win is a big number)
 *   turn(state): whose turn it is
 *   over(state) (optional): true when the game has ended
 * best(state, { time, depth, skill, rng, mode }): the move to make.
 *   time: milliseconds to think (default 60), depth: deepest look-ahead (default 8),
 *   skill 0..1 (default 1; a number or a gs.brains.Dial): lower picks good-but-not-best moves more often,
 *   mode: 'minimax' (default; two players, no luck) or 'mcts' (luck, many players, or huge choice).
 */
export class Search {
  constructor(game) {
    for (const k of ['moves', 'play', 'turn']) if (typeof game[k] !== 'function') throw new Error('Search: needs ' + k + '(state)');
    this.g = game; this.nodes = 0;
  }
  over(s) { return this.g.over ? this.g.over(s) : this.g.moves(s).length === 0; }

  best(state, { time = 60, depth = 8, skill = 1, rng = null, mode = 'minimax', now = () => performance.now() } = {}) {
    const moves = this.g.moves(state); if (!moves.length) return null;
    if (moves.length === 1) return moves[0];
    const r = rng == null ? Math.random : typeof rng === 'function' ? rng : makeRng(rng);
    const ranked = mode === 'mcts' ? this.mcts(state, moves, time, r, now) : this.minimax(state, moves, time, depth, now);
    return pickBySkill(ranked, skill, r);
  }
  /** Each move with its value for the player to move, best first. */
  rank(state, o = {}) {
    const moves = this.g.moves(state); if (!moves.length) return [];
    const now = o.now || (() => performance.now());
    return o.mode === 'mcts' ? this.mcts(state, moves, o.time ?? 60, o.rng ? makeRng(o.rng) : Math.random, now) : this.minimax(state, moves, o.time ?? 60, o.depth ?? 8, now);
  }

  minimax(state, moves, time, maxDepth, now) {
    if (typeof this.g.score !== 'function') throw new Error('Search: minimax needs score(state, player)');
    const me = this.g.turn(state), end = now() + time;
    let ranked = moves.map(m => ({ move: m, value: 0 }));
    this.nodes = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const out = []; let alpha = -Infinity, timedOut = false;
      for (const x of ranked) {   // best moves from the last depth first: more cut-offs
        const v = this.ab(this.g.play(state, x.move), depth - 1, alpha, Infinity, me, end, now);
        if (v === null) { timedOut = true; break; }
        out.push({ move: x.move, value: v }); if (v > alpha) alpha = v;
      }
      if (timedOut && depth > 1) break;
      if (timedOut) { for (const x of ranked.slice(out.length)) out.push(x); }
      ranked = out.sort((a, b) => b.value - a.value);
      if (timedOut || now() > end) break;
    }
    return ranked;
  }
  ab(s, depth, alpha, beta, me, end, now) {
    if ((++this.nodes & 255) === 0 && now() > end) return null;
    if (depth <= 0 || this.over(s)) return this.g.score(s, me) + (this.over(s) ? depth : 0);   // win sooner, lose later
    const mine = this.g.turn(s) === me, moves = this.g.moves(s);
    if (!moves.length) return this.g.score(s, me);
    let best = mine ? -Infinity : Infinity;
    for (const m of moves) {
      const v = this.ab(this.g.play(s, m), depth - 1, alpha, beta, me, end, now);
      if (v === null) return null;
      if (mine) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
      if (alpha >= beta) break;
    }
    return best;
  }

  /**
   * The same thinking as best(), a little each frame, so a 3D game doesn't miss frames while its
   * opponent thinks: job = search.think(state, { time: 300, skill }); then every update
   * `if (job.step(6)) play(job.move)` (step's number is milliseconds to spend now; it returns true once
   * it has the move). time is the total thinking time over all the steps. job.ranked lists the moves.
   */
  think(state, { time = 300, depth = 8, skill = 1, rng = null, mode = 'minimax', now = () => performance.now() } = {}) {
    const g = this.g, moves = g.moves(state), r = rng == null ? Math.random : typeof rng === 'function' ? rng : makeRng(rng);
    const job = { done: false, move: null, ranked: moves.map(m => ({ move: m, value: 0 })), spent: 0, step: () => true };
    const finish = ranked => { job.ranked = ranked; job.move = ranked.length ? pickBySkill(ranked, skill, r) : null; job.done = true; };
    if (moves.length <= 1) { finish(job.ranked); return job; }
    if (mode === 'mcts') {
      const tree = this.tree(state, r);
      job.step = (ms = 6) => {
        if (job.done) return true;
        const t0 = now(), full = tree.run(t0 + Math.min(ms, Math.max(1, time - job.spent)), now); job.spent += now() - t0;
        if (full || job.spent >= time) finish(tree.ranked());
        return job.done;
      };
      return job;
    }
    if (typeof g.score !== 'function') throw new Error('Search: minimax needs score(state, player)');
    // one move from the top of the tree at a time, deeper each pass. Each move's subtree is a walk()
    // that stops wherever the step's milliseconds run out and carries on from there next step.
    const me = g.turn(state); let ranked = job.ranked, d = 1, i = 0, out = [], alpha = -Infinity, w = null;
    this.nodes = 0;
    // out of time: the last full pass stands (a first pass cut short keeps what it has, best first)
    const stop = () => finish(d > 1 ? ranked : out.concat(ranked.slice(out.length)).sort((a, b) => b.value - a.value));
    job.step = (ms = 6) => {
      if (job.done) return true;
      const t0 = now(), end = t0 + ms;
      while (!job.done) {
        const left = time - job.spent - (now() - t0);
        if (left <= 0) { stop(); break; }
        if (!w) w = this.walk(g.play(state, ranked[i].move), d - 1, alpha, Infinity, me);
        if (!w.run(Math.min(end, now() + left), now)) { if (now() < end) stop(); break; }
        const v = w.value; w = null;
        out.push({ move: ranked[i].move, value: v }); if (v > alpha) alpha = v; i++;
        if (i >= ranked.length) { ranked = out.sort((a, b) => b.value - a.value); out = []; i = 0; alpha = -Infinity; d++; if (d > depth) finish(ranked); }
        if (now() >= end) break;
      }
      job.spent += now() - t0;
      return job.done;
    };
    return job;
  }
  // ab() as a walk that can stop anywhere and carry on (think()): the same values, kept on its own stack.
  walk(s, depth, alpha, beta, me) {
    const g = this.g, frame = (s, depth, alpha, beta) => ({ s, depth, alpha, beta, moves: null, i: 0, mine: false, best: 0 });
    const stack = [frame(s, depth, alpha, beta)]; let ret = null;
    const w = {
      value: null,
      /** Runs until the clock passes `end`; true once `value` is in. */
      run: (end, now) => {
        while (stack.length) {
          const f = stack[stack.length - 1];
          if (!f.moves) {                                    // a new position
            if ((++this.nodes & 15) === 0 && now() >= end) return false;
            const over = this.over(f.s);
            if (f.depth <= 0 || over) { ret = g.score(f.s, me) + (over ? f.depth : 0); stack.pop(); continue; }   // win sooner, lose later
            const moves = g.moves(f.s);
            if (!moves.length) { ret = g.score(f.s, me); stack.pop(); continue; }
            f.moves = moves; f.mine = g.turn(f.s) === me; f.best = f.mine ? -Infinity : Infinity;
          } else {                                           // a move below came back with its value
            const v = ret; ret = null;
            if (f.mine) { if (v > f.best) f.best = v; if (v > f.alpha) f.alpha = v; } else { if (v < f.best) f.best = v; if (v < f.beta) f.beta = v; }
            if (f.alpha >= f.beta || f.i >= f.moves.length) { ret = f.best; stack.pop(); continue; }
          }
          stack.push(frame(g.play(f.s, f.moves[f.i++]), f.depth - 1, f.alpha, f.beta));
        }
        w.value = ret; return true;
      },
    };
    return w;
  }

  // Monte Carlo tree search (UCT): random play-outs, scored by winner(state) or score().
  mcts(state, moves, time, r, now) {
    const tree = this.tree(state, r); tree.run(now() + time, now); return tree.ranked();
  }
  // The search tree on its own, so it can grow over several frames (think()).
  tree(state, r) {
    const g = this.g;
    const result = (s, who) => {   // 1 win, 0 loss, .5 draw for `who`
      if (g.winner) { const w = g.winner(s); return w == null ? .5 : w === who ? 1 : 0; }
      if (g.score) { const v = g.score(s, who); return v > 0 ? 1 : v < 0 ? 0 : .5; }
      return .5;
    };
    const root = { s: state, kids: null, n: 0, w: 0, who: null };
    const expand = node => { node.kids = g.moves(node.s).map(m => ({ move: m, s: g.play(node.s, m), kids: null, n: 0, w: 0, who: g.turn(node.s) })); };
    expand(root);
    let runs = 0;
    const run = (end, now) => {
      while (runs < 20 || now() < end) {
        runs++; if (runs > 200000) break;
        const path = [root]; let node = root;
        while (node.kids && node.kids.length && node.n > 0) {
          let best = null, bv = -Infinity;
          for (const k of node.kids) { const v = k.n ? k.w / k.n + 1.4 * Math.sqrt(Math.log(node.n) / k.n) : 1e9 + r(); if (v > bv) { bv = v; best = k; } }
          node = best; path.push(node);
          if (!node.kids && !this.over(node.s)) { expand(node); break; }
        }
        let s = node.s, steps = 0;
        while (!this.over(s) && steps++ < 400) { const ms = g.moves(s); if (!ms.length) break; s = g.play(s, ms[Math.floor(r() * ms.length)]); }
        for (const p of path) { p.n++; if (p.who != null) p.w += result(s, p.who); }
      }
      return runs > 200000;   // true: the tree is as big as it gets
    };
    return { run, ranked: () => root.kids.map(k => ({ move: k.move, value: k.n ? k.w / k.n : 0, visits: k.n })).sort((a, b) => b.visits - a.visits || b.value - a.value) };
  }
}

// skill 1: the best move. Lower: a softmax over the ranked moves, so mistakes are plausible ones.
function pickBySkill(ranked, skill, r) {
  skill = +skill; if (!isFinite(skill)) skill = 1;   // a number, or a gs.brains.Dial that follows the player
  if (skill >= 1 || ranked.length === 1) return ranked[0].move;
  const top = ranked[0].value, spread = Math.max(1e-6, Math.abs(top - ranked[ranked.length - 1].value));
  const temp = Math.max(.02, (1 - Math.max(0, skill)) * .6);
  const w = ranked.map(x => Math.exp((x.value - top) / spread / temp));
  let t = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ranked.length; i++) { t -= w[i]; if (t <= 0) return ranked[i].move; }
  return ranked[0].move;
}
