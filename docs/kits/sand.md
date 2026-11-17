# gs.sand

Falling sand: liquids, fire, lava, ground that blasts into holes.

`gs.sand` (`Sand` falling sand, liquids, fire, lava, `blast` holes in ground, `solid`, `picture`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SandPart`, line 3278), where every option and field is described.

- `M: SandMaterials` (:3278)
  - `readonly EMPTY: 0` (:3270)
  - `readonly WALL: 1` (:3270)
  - `readonly DIRT: 2` (:3270)
  - `readonly WOOD: 3` (:3270)
  - `readonly SAND: 4` (:3270)
  - `readonly WATER: 5` (:3270)
  - `readonly OIL: 6` (:3270)
  - `readonly FIRE: 7` (:3270)
  - `readonly SMOKE: 8` (:3270)
  - `readonly ACID: 9` (:3270)
  - `readonly STEAM: 10` (:3270)
  - `readonly LAVA: 11` (:3270)
  - `readonly STONE: 12` (:3270)
- `Sand: new (w?: number, h?: number, o?: { seed?: number }) => Sand` (:3278)
  - `w: number` (:3272)
  - `h: number` (:3272)
  - `rate: number` (:3272)
  - `bg: [number, number, number, number]` (:3272)
  - `t: Uint8Array` (:3272)
  - `get(x: number, y: number): number` (:3273)
  - `set(x: number, y: number, m: number): void` (:3273)
  - `solid(x: number, y: number): boolean` (:3273)
  - `inside(x: number, y: number): boolean` (:3273)
  - `fill(fn: (x: number, y: number) => number): Sand` (:3274)
  - `paint(x: number, y: number, r: number, m: number, o?: { over?: boolean; chance?: number }): Sand` (:3274)
  - `blast(x: number, y: number, r: number, o?: { fire?: boolean }): number` (:3275)
  - `count(m: number, x?: number, y?: number, w?: number, h?: number): number` (:3275)
  - `update(dt: number): Sand` (:3276)
  - `step(): void` (:3276)
  - `colour(m: number, rgbv: [number, number, number, number]): Sand` (:3276)
  - `picture(bg?: [number, number, number, number]): HTMLCanvasElement | OffscreenCanvas` (:3276)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Falling sand and blastable ground** (`gs.sand`): `Sand(w, h)` is a grid of materials (`M.EMPTY`,
`WALL`, `DIRT`, `WOOD`, `SAND`, `WATER`, `OIL`, `FIRE`, `SMOKE`, `ACID`, `STEAM`, `LAVA`, `STONE`) that
behave by themselves: sand piles, water and oil flow and settle by weight, fire burns wood and oil into
smoke, water puts fire out as steam, acid eats ground, slow lava sets things alight and turns to stone
where water touches it. `fill(fn)`, `paint(x, y, r, m)`, `blast(x, y, r)` (a
hole whose edge falls as rubble), `solid(x, y)` for heroes to stand on, `count(m, box)` for goals,
`update(dt)` (60 steps a second), `picture()` to draw scaled up with smoothing off, `colour(m, [r, g,
b, variation])` for your own look. It runs on the CPU in flat arrays: about 120 x 200 cells is
comfortable on a phone.

**Flowing liquids** (`gs.flow`, 2D top-down or 3D ground): `new Streams({ space: '3d' })` holds rivers,
pools and whirlpools. `river(path, { width, speed, depth, kind: 'water' | 'lava' | 'acid' | 'mud' | 'deep',
hurt })` follows a `gs.paths` Path: fastest in the middle, slow at the banks, bending round `rock(d, side,
r)`, and pulling down where the path drops steeply (a waterfall). `pool(at, r, { kind: 'lava' })` and
`whirl(at, r, spin, pull)` are round (or boxes with `w`, `h`). `at(p)` says what the liquid is doing at
a point (`{ in, kind, depth, speed, current, edge, fall, foam, hurt, level }`), `carry(obj, dt, { drag })`
moves a raft or a swimmer with it, `hurt(obj, dt)` is this frame's damage from lava or acid (with
`on('enter' | 'leave')`). `new Flood({ size, cells, ground: (x, z) => land.height(x, z), edges: 'wall' |
'drain' })` is shallow water that spreads, runs downhill and fills hollows: `pour(x, z, rate, r)` (a tap;
negative drains), `add(x, z, volume)` (a burst dam), `rain(rate)`, then `depth`, `wet`, `level`, `current`
and `volume()` anywhere; `ground(fn)` again after digging. In 3D, `gs.outdoors` draws them:
`new River(stream)` (moving water with foam at rocks, banks and falls; lava with glowing cracks and a
crust that cools downstream; acid; mud) and `new FloodWater(flood, { view })`, which on WebGPU runs the
flood on the graphics chip. `gs.sand` has lava too, for 2D.

## In real games

1 game uses it (`node scripts/examples.mjs gs.sand` lists them). The shortest:

`src/games/canal-dig.js` (Canal Dig, Advance · Physics, 135 lines):

```js
const { Feel } = gs.effects;
const { Sand, M } = gs.sand;
// …
    const r = rng(level * 7919 + (Math.random() * 1e6 | 0));
    sand = new Sand(GW, GH, { seed: level * 31 + 7 });
// …
    const surf = x => 22 + Math.round(Math.sin(x / 13 + level) * 3);
    sand.fill((x, y) => y >= surf(x) ? M.DIRT : M.EMPTY);
    for (let i = 0; i < 4 + level; i++) sand.paint(4 + r() * (GW - 8), 34 + r() * (GH - 44), 3 + r() * 4, M.SAND, { over: true });
    for (let i = 0; i < 2 + Math.min(5, level); i++) sand.paint(6 + r() * (GW - 12), 34 + r() * (GH - 44), 2 + r() * 3, M.STONE, { over: true });
// …
      const edge = x === tx || x === tx + tw - 1;
      sand.set(x, y, edge ? M.WALL : y > 8 ? M.WATER : M.EMPTY);
// …
    }
    for (let x = tx; x < tx + tw; x++) for (let y = 21; y < surf(x); y++) sand.set(x, y, M.DIRT);
// …
        const wall = x === px || x === px + pw - 1 || y === py + ph - 1;
        sand.set(x, y, wall ? M.WALL : M.EMPTY);
```
