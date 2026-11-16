# gs.moves

Motion moves with the phone: swing, punch, throw, flip, twist, knock, shake.

`gs.moves.Moves`: `on('swing'|'punch'|'throw'|'flip'|'twist'|'knock'|'shake', fn)`, `update()` each frame.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`MovesPart`, line 595), where every option and field is described.

- `Moves: new (o?: { sensitivity?: number; /** A gs.brains.Examples (of: 'move'): moves of your own, or the player's, fire under the names it knows. */ learn?: Examples |…` (:595)

## From the maker kit

From [Motion moves](../maker-kit.md#motion-moves):

`const { Moves } = gs.moves;`

```js
reset() { moves = new Moves(); moves.on('swing', m => slash(m.dir, m.power)); moves.on('flip', () => flip()); }
update(dt) { moves.update(); }   // moves are handed to your handlers here
```

Moves: `swing` (`dir` left / right / up / down), `punch`, `throw`, `flip` (forward / back),
`twist` (left / right), `knock`, `shake`, and `any`. Each has `power` 0..1. `new Moves({ sensitivity: 1.3 })`
fires more easily. On iPhones the player is asked for motion access when they tap Play.

Moves of your own, or the player's: `new Moves({ learn: new gs.brains.Examples(api, { name: 'moves', of: 'move' }) })`,
then `moves.teach('stir')` takes the next move made as an example and `moves.on('stir', fn)` fires for
moves like it. `moves.on('motion', m => m.shape)` gets every burst of movement
([Teach by example](#teach-by-example-signs-poses-moves-and-sounds-of-your-own)).

## In real games

No game uses `gs.moves` yet: the examples above are what there is.
