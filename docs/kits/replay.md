# gs.replay

Ghosts to race, and whole rounds recorded and played back.

`gs.replay`: `Ghost` (record a run, `pack()` for `api.save`, race it), `Recorder` / `Replayer` (whole rounds).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ReplayPart`, line 1543), where every option and field is described.

- `Ghost: typeof Ghost` (:1544)
  - `constructor(o?: { every?: number })` (:1535)
  - `time: number` (:1536)
  - `readonly length: number` (:1536)
  - `record(dt: number, ...values: number[]): this` (:1537)
  - `at(t: number): { x: number; y: number; v: number[]; done: boolean } | null` (:1538)
  - `pack(maxBytes?: number, precision?: number): string` A short string for api.save(). (:1540)
  - `static unpack(s: string): Ghost` (:1541)
- `Recorder: new (o?: { seed?: number; max?: number }) => { seed: number; rng: Rng; readonly time: number; readonly data: { seed: number; frames: Loose[] }; event(kind: s…` (:1545)
- `Replayer: new (data: { seed: number; frames: Loose[] }) => { rng: Rng; readonly done: boolean; step(game: Partial<Game>): number }` (:1546)

## From the maker kit

From [Animation, dialogue and replays](../maker-kit.md#animation-dialogue-and-replays):

`gs.replay.Ghost` records a few numbers over time (`record(dt, x, y, angle)`), plays them back
smoothly (`at(t)`) and packs to about 1 KB (`pack()`, `Ghost.unpack()`) to keep with `api.save()`:
race your best run. `Recorder` / `Replayer` replay a whole round exactly, if the game takes its
random numbers from `rec.rng`.

## In real games

1 game uses it (`node scripts/examples.mjs gs.replay` lists them). The shortest:

`src/games/echo-loop.js` (Echo Loop, Advance · Time loop, 234 lines):

```js
const { Feel } = gs.effects, { Ready } = gs.rounds, { text, sprite } = gs.pixel, { sounds, sfx } = gs.sound;
const { haptic } = gs.device, { TileMap } = gs.tiles, { Ghost } = gs.replay, { clamp } = gs.util, { mix } = gs.tick;
```
