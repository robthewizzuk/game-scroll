# gs.pad

Game controllers: analog sticks, triggers, buttons, rumble.

`gs.pad`: `pad()` (analog sticks, triggers, `pressed('a')`), `pads()`, `rumble()`. Pads also arrive as keys.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PadPart`, line 551), where every option and field is described.

- `pad(i?: number): PadState | null` (:551)
- `pads(): PadState[]` (:551)
- `rumble(strength?: number, ms?: number, i?: number): void` (:551)
- `padConnected(): boolean` (:551)

## From the maker kit

From [Game controllers](../maker-kit.md#game-controllers):

A pad already works in every game: the d-pad and left stick are the arrow keys, A is Space, B is
`x`, X is `z`, Y is `c`, Start pauses. In the feed, A plays and up / down move between games. For
analog control:

```js
const { pad, pads, rumble } = gs.pad;
const p = pad();                         // null with no controller
if (p) { ship.vx = p.x * 200; if (p.pressed('a')) fire(); if (p.rt > .5) boost(); }
rumble(.6, 200);
```

`p.x, p.y, p.rx, p.ry` (sticks, with a dead zone), `p.lt, p.rt` (triggers), `held / pressed /
released(name)` for `a b x y l r start select up down left right`. `pads()` lists every controller.

## In real games

No game uses `gs.pad` yet: the examples above are what there is.
