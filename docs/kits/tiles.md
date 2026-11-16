# gs.tiles

Tile levels from text: walls, one-way floors, slopes, marks, moving through them, auto-tiling.

`gs.tiles.TileMap.fromText(level)`: `#` walls, `-` one-way, `/` `\` slopes, letters as marks (`find('P')`); `move(box, dx, dy)`, `ray`, `sees`, `walkable()`, `draw(c, fn, cam)`, `edges(tx, ty)` (auto-tiling: `mask`, `blob`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`TilesPart`, line 1490), where every option and field is described.

- `TileMap: typeof TileMap` (:1490)
  - `constructor(cols: number, rows: number, o?: { size?: number; legend?: Record<string, TileKind>; /** false: it keeps to itself (it finds nothing else the game made, and…` (:1469)
  - `static fromText(text: string | string[], o?: { size?: number; legend?: Record<string, TileKind>; link?: boolean }): TileMap` '#' wall, '-' one-way, '/' '\' slopes, '.' empty; other letters are marks. (:1471)
  - `edges(tx: number, ty: number, same?: string | ((ch: string, tx: number, ty: number) => boolean) | null, o?: { edge?: boolean }): TileEdges` Auto-tiling: which neighbours join (same: characters that join, or a test). (:1473)
  - `cols: number` (:1474)
  - `rows: number` (:1474)
  - `size: number` (:1474)
  - `readonly w: number` (:1474)
  - `readonly h: number` (:1474)
  - `marks: { ch: string; tx: number; ty: number; x: number; y: number }[]` (:1475)
  - `find(ch: string): { ch: string; tx: number; ty: number; x: number; y: number }[]` (:1476)
  - `clear(ch: string, to?: string): this` (:1477)
  - `get(tx: number, ty: number): string` (:1478)
  - `set(tx: number, ty: number, ch: string): this` (:1478)
  - `info(tx: number, ty: number): TileKind` (:1479)
  - `at(x: number, y: number): { tx: number; ty: number; ch: string }` (:1479)
  - `solid(tx: number, ty: number): boolean` (:1480)
  - `slopeY(tx: number, ty: number, x: number): number | null` (:1480)
  - `inside(tx: number, ty: number): boolean` (:1481)
  - `move(box: Box, dx: number, dy: number, o?: { drop?: boolean; stepDown?: number; stepUp?: number }): TileHit` Moves a box (x, y centre) by dx, dy, stopping at walls. (:1483)
  - `ray(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; tx: number; ty: number } | null` (:1484)
  - `sees(x0: number, y0: number, x1: number, y1: number): boolean` (:1485)
  - `walkable(): boolean[][]` (:1486)
  - `draw(c: Ctx, draw: (c: Ctx, ch: string, x: number, y: number, size: number, tx: number, ty: number) => void, cam?: Camera2D | null, o?: { empty?: boolean }): this` (:1487)
- `BLOB_MASKS: number[]` The 47 blob-tile masks in order (piece i's 8-bit mask). (:1490)

## From the maker kit

From [Physics](../maker-kit.md#physics):

- **A tile level in the world**: `phys.tiles(map)` makes a `gs.tiles` `TileMap` solid: walls as a few merged boxes,
  `/` `\` slopes as ramps and `-` one-way tiles as ledges (`move()` boxes jump up through them and drop through with
  `drop: true`). Crates, balls and ragdolls then land on your level. After digging or building call its `rebuild()`.

From [2D cameras, tile levels and movement](../maker-kit.md#2d-cameras-tile-levels-and-movement):

`const { Camera2D } = gs.camera2d, { TileMap } = gs.tiles, { Platformer, TopDown } = gs.movers;`
Write a level as text: `TileMap.fromText(LEVEL, { size: 16 })`. `#` is a wall, `-` a one-way platform
(jump up through it, `input.down` drops through), `/` and `\` are slopes, `.` is empty and any other
letter is a mark you read with `map.find('P')` (each gives `x`, `y` at the tile's centre) and then
`map.clear('P')`. Your own tile kinds go in `legend`. `map.move(box, dx, dy)` moves a box (centre
`x`, `y`, size `w`, `h`) and says what it hit; `map.ray` and `map.sees` are lines of sight and
`map.walkable()` feeds `gs.ai.NavGrid`. `map.draw(c, (c, ch, x, y, size) => ..., cam)` calls your
drawing for each tile on screen.

`Platformer` moves through a map with the tricks that make jumping feel right: coyote time, a jump
buffer, letting go early for a short hop, wall slide and wall jump (`wall: true`), air jumps. Its
`state` ('idle', 'run', 'jump', 'fall', 'wall'), `jumped`, `landed` and `impact` drive your animation
and effects. `TopDown` is eight-way walking that slides along walls.

`Camera2D(W, H, { bounds: [0, 0, map.w, map.h], deadzone: [60, 80], lag: .12, lead: .2 })`:
`cam.update(dt, hero)`, then draw the world between `cam.begin(c)` and `cam.end(c)`; `cam.layer(c,
.3, drawHills, { repeat: [W, 0] })` for parallax; taps go through `cam.toWorld(x, y)`.

From [Game kits](../maker-kit.md#game-kits):

**Made levels** (`gs.gen`, rot.js and WaveFunctionCollapse, loaded on first use: call them in `make()` or
`reset()`): `dungeon`, `cave`, `maze`, `islands`, `heightmap` and `pattern(sample)` (new maps that look
like a small example). They give the same text `gs.tiles.TileMap.fromText()` reads, with `S` start and
`E` exit marks. Pass a `seed` (`gs.math.daily()` for a level of the day). `fov(map, col, row, r)` is
what a hero can see.

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Auto-tiling** (`map.edges(tx, ty, same)` on `gs.tiles.TileMap`): which neighbours join, as a 4-bit
`mask` (16 pieces) or the 47-piece `blob` (`BLOB_MASKS` lists them), so drawn-in-code walls, paths and
water pick the right edge and corner pieces.

## In real games

2 games use it (`node scripts/examples.mjs gs.tiles` lists them). The shortest:

`src/games/echo-loop.js` (Echo Loop, Advance · Time loop, 234 lines):

```js
const { Feel } = gs.effects, { Ready } = gs.rounds, { text, sprite } = gs.pixel, { sounds, sfx } = gs.sound;
const { haptic } = gs.device, { TileMap } = gs.tiles, { Ghost } = gs.replay, { clamp } = gs.util, { mix } = gs.tick;
```

`src/games/critter-quest.js` (Critter Quest, Advance · RPG, 1254 lines):

```js
const { Camera2D } = gs.camera2d;
const { TileMap } = gs.tiles;
// …
  const opp = new Opponent(api, { skill: .5 });    // Tiny Brains: plays turns ahead and learns how this player fights
  const map = TileMap.fromText(MAP.map(r => r.replace(/[^#]/g, '.')), { size: T });
// …
  function setupWorld() {
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) map.set(tx, ty, SOLID[MAP[ty][tx]] ? '#' : '.');
    for (const h of HOUSES) for (let y = 0; y < 3; y++) for (let x = 0; x < h.w; x++) map.set(h.tx + x, h.ty + y, '#');
    map.set(WELL.tx, WELL.ty, '#');
// …
    ];
    for (const n of npcs) { n.x = n.tx * T + 8; n.y = n.ty * T + 8; n.beaten = false; n.walk = 0; map.set(n.tx, n.ty, '#'); }
// …
    gateOpen = false;
    for (let x = 13; x <= 14; x++) map.set(x, 11, '#');
    nav = new NavGrid(COLS, ROWS, T, (cx, cy) => map.solid(cx, cy));
```
