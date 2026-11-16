# gs.board

Grid puzzles: match, fall and refill, 2048 slides, flood fill, hints.

`gs.board.Board` (match, fall, refill, `slide` 2048-style, `flood`, `hint`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BoardPart`, line 2432), where every option and field is described.

- `Board: new (cols: number, rows: number, o?: { fill?: ((c: number, r: number) => BoardPiece | null) | null; same?: (a: BoardPiece, b: BoardPiece) => boolean; speed?: nu…` (:2432)
  - `kind?: Loose` (:2415)
  - `col?: number` (:2415)
  - `row?: number` (:2415)
  - `x?: number` (:2415)
  - `y?: number` (:2415)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Boards** (`gs.board.Board(cols, rows, { fill })`): match-3, merge, 2048 and block puzzles. `matches()`
finds lines (L and T shapes come back as one group), `clear()`, `fall()` and `refill()` drop and top
up, `settle()` starts a board with no matches, `hint()` finds a swap that makes one, `shuffle()`.
`slide('left', { merge })` does 2048 moves and `flood(col, row)` finds a connected group. Each piece
gets a drawn `x`, `y` that glides to its cell (`board.update(dt)`, `board.busy`).

## In real games

1 game uses it (`node scripts/examples.mjs gs.board` lists them). The shortest:

`src/games/slide-ten.js` (Slide Ten, Pocket · Merge, 140 lines):

```js
const { sfx, notes } = gs.sound;
const { Board } = gs.board;
// …
  return {
    reset() { b = new Board(N, N, { speed: 16 }); score = 0; t = 0; dead = 0; moves = 0; lastTen = 0; streak = 0; rocks = 0; g.release(); feel.clear()
```
