# gs.solve

Logic puzzles with one answer (make, solve, grade, hint) and turn-based opponents (minimax, MCTS).

`gs.solve`: `Puzzle` (`cell`, `allDiff`, `sum`, `rule`; `solve`, `unique`, `carve` to one-answer clues, `grade`, `hint`), `Search` (turn-based opponents: `best(state, { time, skill, mode: 'minimax'|'mcts' })`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SolvePart`, line 1037), where every option and field is described.

- `Puzzle: new () => PuzzleSolver` (:1038)
  - `cell(id: string | number, values: Loose[]): this` (:1026)
  - `allDiff(ids: (string | number)[]): this` (:1027)
  - `sum(ids: (string | number)[], total: number): this` (:1028)
  - `rule(ids: (string | number)[], ok: (values: Loose[]) => boolean): this` (:1029)
  - `solve(o?: { known?: Record<string, Loose> | null; limit?: number; rng?: number | string | (() => number) | null }): { solution: Record<string, Loose> | null; count: nu…` (:1030)
  - `unique(known?: Record<string, Loose>): boolean` (:1031)
  - `grade(known?: Record<string, Loose>): { level: 'easy' | 'medium' | 'hard' | 'expert' | 'none'; guesses: number; open: number }` (:1032)
  - `carve(solution: Record<string, Loose>, o?: { rng?: number | string | (() => number); grade?: 'easy' | 'medium' | 'hard' | 'expert'; keep?: number }): Record<string, Lo…` (:1033)
  - `hint(clues: Record<string, Loose>, moves?: Record<string, Loose>): { id: string | number | null; value: Loose; why: 'only' | 'last' | 'sum' | 'rule' | 'guess' | 'wrong…` (:1034)
- `Search: new <S = Loose, M = Loose>(game: SearchGame<S, M>) => { best(s: S, o?: { time?: number; depth?: number; skill?: Skill; rng?: number | string | (() => number); …` (:1039)

## From the maker kit

From [Puzzles and opponents](../maker-kit.md#puzzles-and-opponents):

`gs.solve.Puzzle`: cells with possible values and rules between them.
`cell(id, values)`, `allDiff(ids)` (rows, boxes, cages), `sum(ids, total)`, `rule(ids, ok)` (your own
test of the cells' values). Then:

- `solve({ known, limit, rng })`: `{ solution, count }`; with `rng` a random answer (a fresh filled grid).
- `unique(clues)`: exactly one answer?
- `carve(solution, { rng, grade, keep })`: takes clues away while there's still one answer and it's no
  harder than `grade` (`'easy'` keeps it solvable by working things out alone, no guessing).
- `grade(clues)`: `{ level: 'easy' | 'medium' | 'hard' | 'expert', guesses, open }`, judged the way
  people solve: what deduction finds first ("only this fits", "the last place for a 7"), guessing after.
- `hint(clues, moves)`: a cell the player can work out now and why (`only`, `last`, `sum`, `rule`;
  `guess` if they're stuck), plus `wrong`: moves that don't match the answer.

`gs.solve.Search`: a computer opponent for turn-based games. Give it `moves(state)`, `play(state, move)`
(a new state), `turn(state)`, `score(state, player)` and optionally `over(state)` / `winner(state)`.
`best(state, { time: 60, skill })` looks ahead within the time (minimax with alpha-beta and iterative
deepening; `mode: 'mcts'` for games with dice, more than two players or huge choice). `skill` below 1
picks good-but-not-best moves more often, so mistakes look human. `rank(state)` lists every move's value.
`think(state, { time, depth, skill })` is `best()` spread over frames, for 3D games: it returns a job;
call `job.step(5)` (milliseconds to spend now) each update until it returns true, then play `job.move`.
Board games get this in one line: `await table.think(search, state, { time, skill, wait })`.

## In real games

5 games use it (`node scripts/examples.mjs gs.solve` lists them). The shortest:

`src/games/tower-four.js` (Tower Four, Board · Strategy, 153 lines):

```js
const { haptic } = gs.device;
const { Search } = gs.solve;
// …
const best = (c, who) => { let n = 0; for (const l of LINES) { let a = 0, b = 0; for (const i of l) { if (c[i] === who) a++; else if (c[i]) b++; } if 
const brain = new Search({ moves, play: (s, m) => { const n = play(s, m); return { c: n.c, t: n.t, win: n.win }; }, turn: s => s.t, over: s => s.win >
```

`src/games/mancala.js` (Mancala, Board · Strategy, 170 lines):

```js
const { haptic } = gs.device;
const { Search } = gs.solve;
// …
}
const brain = new Search({
```
