# gs.history

Undo and redo for moves.

`gs.history.History` (undo/redo: `push`, `undo`, `redo`, `merge`, `group`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`HistoryPart`, line 2861), where every option and field is described.

- `History: new <S = Loose>(start: S, o?: { max?: number }) => History<S>` (:2861)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Undo and redo** (`gs.history.History(start, { max })`): `push(state, label)` after each change keeps a
copy; `undo()` and `redo()` hand back a fresh copy of that step (null when there's none). `canUndo`,
`canRedo`, `undoLabel` for the buttons, `undos` to count them (fewer undos, more stars). Pushes with the
same `merge` key in a row are one step (a dragged slider); `group(state, label, fn)` makes several one.
A change after an undo drops the steps ahead. `pack()` / `unpack()` for `api.save`.

```js
reset() { board = newBoard(); hist = new History(board); }
tap(x, y) { flip(board, x, y); hist.push(board, 'flip'); }
undo() { board = hist.undo() ?? board; }
```

## In real games

No game uses `gs.history` yet: the examples above are what there is.
