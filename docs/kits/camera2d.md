# gs.camera2d

A 2D camera: follow with a dead zone, look-ahead, zoom, level bounds, parallax layers.

`gs.camera2d.Camera2D`: follow with a dead zone, look-ahead, zoom, level bounds, `layer()` parallax, `toWorld()`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Camera2dPart`, line 1449), where every option and field is described.

- `Camera2D: typeof Camera2D` (:1449)
  - `constructor(w: number, h: number, o?: { deadzone?: [number, number]; lag?: number; lead?: number; zoom?: number; bounds?: [number, number, number, number] | null; pixe…` (:1435)
  - `x: number` The world point at the centre of the screen. (:1437)
  - `y: number` (:1437)
  - `zoom: number` (:1437)
  - `deadzone: [number, number]` (:1437)
  - `lag: number` (:1437)
  - `lead: number` (:1437)
  - `bounds: [number, number, number, number] | null` (:1437)
  - `readonly view: { x: number; y: number; w: number; h: number }` (:1438)
  - `update(dt: number, target?: { x: number; y: number; vx?: number; vy?: number }): this` (:1439)
  - `snap(x: number, y: number): this` (:1440)
  - `zoomIn(z: number, sec?: number): this` (:1441)
  - `begin(c: Ctx): this` (:1442)
  - `end(c: Ctx): this` (:1442)
  - `layer(c: Ctx, f: number, draw: (c: Ctx) => void, o?: { repeat?: [number, number] | null }): this` A background layer moving at factor f of the camera (0 fixed, 1 with the world). (:1444)
  - `toWorld(sx: number, sy: number): XY` (:1445)
  - `toScreen(wx: number, wy: number): XY` (:1445)
  - `sees(x: number, y: number, w?: number, h?: number, margin?: number): boolean` (:1446)
  - `offset(f?: number): [number, number]` (:1447)

## From the maker kit

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

## In real games

No game uses `gs.camera2d` yet: the examples above are what there is.
