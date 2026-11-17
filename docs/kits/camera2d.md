# gs.camera2d

A 2D camera: follow with a dead zone, look-ahead, zoom, level bounds, parallax layers.

`gs.camera2d.Camera2D`: follow with a dead zone, look-ahead, zoom, level bounds, `layer()` parallax, `toWorld()`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Camera2dPart`, line 1494), where every option and field is described.

- `Camera2D: typeof Camera2D` (:1494)
  - `constructor(w: number, h: number, o?: { deadzone?: [number, number]; lag?: number; lead?: number; zoom?: number; bounds?: [number, number, number, number] | null; pixe…` (:1480)
  - `x: number` The world point at the centre of the screen. (:1482)
  - `y: number` (:1482)
  - `zoom: number` (:1482)
  - `deadzone: [number, number]` (:1482)
  - `lag: number` (:1482)
  - `lead: number` (:1482)
  - `bounds: [number, number, number, number] | null` (:1482)
  - `readonly view: { x: number; y: number; w: number; h: number }` (:1483)
  - `update(dt: number, target?: { x: number; y: number; vx?: number; vy?: number }): this` (:1484)
  - `snap(x: number, y: number): this` (:1485)
  - `zoomIn(z: number, sec?: number): this` (:1486)
  - `begin(c: Ctx): this` (:1487)
  - `end(c: Ctx): this` (:1487)
  - `layer(c: Ctx, f: number, draw: (c: Ctx) => void, o?: { repeat?: [number, number] | null }): this` A background layer moving at factor f of the camera (0 fixed, 1 with the world). (:1489)
  - `toWorld(sx: number, sy: number): XY` (:1490)
  - `toScreen(wx: number, wy: number): XY` (:1490)
  - `sees(x: number, y: number, w?: number, h?: number, margin?: number): boolean` (:1491)
  - `offset(f?: number): [number, number]` (:1492)

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

1 game uses it (`node scripts/examples.mjs gs.camera2d` lists them). The shortest:

`src/games/critter-quest.js` (Critter Quest, Advance · RPG, 1254 lines):

```js
const { rng, makeNoise } = gs.math;
const { Camera2D } = gs.camera2d;
// …
  function tapWorld(sx, sy) {
    const w = cam.toWorld(sx, sy), tx = Math.floor(w.x / T), ty = Math.floor(w.y / T), n = thingAt(tx, ty);
// …
      hero = new TopDown({ x: 12 * T + 8, y: 53 * T + 8, w: 9, h: 7, speed: K.walk, accel: 900, stop: 1400 }); hero.dir = { x: 0, y: -1 };
      cam = new Camera2D(W, H, { pixel: true, bounds: [0, 0, WW, WH], lag: .12, deadzone: [10, 8] }); cam.snap(hero.x, hero.y);
// …
    },
    resize(w, h) { W = w; H = h; if (cam) { const x = cam.x, y = cam.y; cam = new Camera2D(W, H, { pixel: true, bounds: [0, 0, WW, WH], lag: .12, dead
// …
      tryWalkInto(dt);
      cam.update(dt, hero);
// …
    c.fillStyle = '#183018'; c.fillRect(0, 0, W, H);
    cam.begin(c); feel.begin(c);
// …
    drawAmbient(c, v);
    feel.end(c, W, H); cam.end(c);
// …
  function drawDark(c) {
    const s = cam.toScreen(hero.x, hero.y), g = c.createRadialGradient(s.x, s.y, 20, s.x, s.y, Math.max(W, H) * .75);
```
