# gs.tick

The fixed 60 Hz tick: how far between ticks a frame is, and smooth mixing for drawing.

`gs.tick` (games with `tick: 60`): `alpha` (also `draw(c, alpha)`), `mix(before, now)`, `turn`, `rate`, `count`; Physics `sx`/`sy`/`sangle`, `World3D({ smooth: true })`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`TickPart`, line 1463), where every option and field is described.

- `readonly rate: number` Ticks per second for the game being played; 0 when it runs one update per frame. (:1465)
- `readonly on: boolean` (:1465)
- `readonly dt: number` (:1465)
- `readonly alpha: number` How far the frame being drawn is between the last two ticks (0..1; 1 when off). (:1467)
- `readonly count: number` Ticks since the round started. (:1469)
- `mix(before: number, now: number, alpha?: number): number` (:1470)
- `turn(before: number, now: number, alpha?: number): number` (:1471)

## From the maker kit

From [Starter templates](../maker-kit.md#starter-templates):

Every template starts the way a finished game does, so a new game has these from its first line:
a **fixed tick** (`tick: 60`: the same game on every phone, drawn between ticks with `gs.tick.mix`),
**Ready** (`gs.rounds.Ready`: nothing moves or scores until the first tap), **Feel**
(`gs.effects.Feel`: particles, shake, sound and a buzz in one call, following the player's settings),
a **soundtrack in one line** (`music: 'happy'` in the definition) and a HUD that keeps out of the
app's score badge.

From [Fixed game tick](../maker-kit.md#fixed-game-tick):

The frame then shows a moment between two ticks: `draw(c, alpha)` gets how far along it is (0..1; always
1 without a tick), also on `gs.tick.alpha`. Keep where things were before the update and draw
`gs.tick.mix(before, now)` (and `gs.tick.turn` for angles) so motion stays smooth on 90 and 120 Hz screens.
The kits do it for you where they can: `gs.physics` things have `sx`, `sy`, `sangle` (and `phys.path()`
uses them), and `new World3D({ smooth: true })` moves its meshes between ticks just before each frame
(aim the camera in `draw()` from the meshes then, so they agree). `gs.tick.rate`, `.on`, `.dt` and
`.count` (ticks this round) are there too. Physics worlds take exactly one step per tick, so a round
is the same on every phone.

## In real games

8 games use it (`node scripts/examples.mjs gs.tick` lists them). The shortest:

`src/games/rain-herder.js` (Rain Herder, Casual · Weather, 212 lines):

```js
const { Feel } = gs.effects, { Ready } = gs.rounds, { sounds } = gs.sound, { haptic } = gs.device;
const { clamp, rnd } = gs.util, { mix } = gs.tick;
```

`src/games/echo-loop.js` (Echo Loop, Advance · Time loop, 234 lines):

```js
const { Feel } = gs.effects, { Ready } = gs.rounds, { text, sprite } = gs.pixel, { sounds, sfx } = gs.sound;
const { haptic } = gs.device, { TileMap } = gs.tiles, { Ghost } = gs.replay, { clamp } = gs.util, { mix } = gs.tick;
```
