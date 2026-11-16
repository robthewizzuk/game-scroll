# gs.movers

Platformer and top-down movement with coyote time, jump buffer, wall jumps and the rest.

`gs.movers`: `Platformer` (coyote time, jump buffer, variable jump, wall jump, air jumps), `TopDown`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`MoversPart`, line 1501), where every option and field is described.

- `Platformer: new (o?: { x?: number; y?: number; w?: number; h?: number; jump?: number; jumpTime?: number; run?: number; accel?: number; airAccel?: number; stop?: number…` (:1502)
  - `x: number` (:1500)
  - `y: number` (:1500)
  - `w: number` (:1500)
  - `h: number` (:1500)
  - `vx: number` (:1500)
  - `vy: number` (:1500)
  - `onGround: boolean` (:1500)
  - `facing: number` (:1500)
  - `hit: Partial<TileHit>` (:1500)
  - `readonly left: number` (:1500)
  - `readonly right: number` (:1500)
  - `readonly top: number` (:1500)
  - `readonly bottom: number` (:1500)
- `TopDown: new (o?: { x?: number; y?: number; w?: number; h?: number; speed?: number; accel?: number; stop?: number }) => MoverBase & { speed: number; state: 'idle' | 'w…` (:1509)

## From the maker kit

From [Physics](../maker-kit.md#physics):

- **Walk a hero through the world**: `phys.move(box, dx, dy, { step, slope, snap, mass, angle, drop })` moves a
  `{ x, y, w, h }` box (or `{ x, y, r }`) as far as the world lets it, the same way a `TileMap`'s `move()` does and with
  the same answer (`{ left, right, up, down, hits }`). It stops at walls and slides along them, walks up steps and slopes,
  keeps to the ground going down, and shoves crates and balls out of its way (`mass`, kg: how hard). It is solid
  itself, so things land on it, and `onHit` tells you what it ran into. With no gravity (seen from above) walls are
  walls all round. `unmove(box)` takes it out. `gs.movers`' `Platformer` and `TopDown` and `gs.vehicles`' 2D `Car`
  take the world in place of a tile map (`hero.update(dt, phys, input)`), so a hero kicks the crates about.

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

1 game uses it (`node scripts/examples.mjs gs.movers` lists them). The shortest:

`src/games/critter-quest.js` (Critter Quest, Advance · RPG, 1254 lines):

```js
const { TileMap } = gs.tiles;
const { TopDown } = gs.movers;
// …
      setupWorld(); makeQuests();
      hero = new TopDown({ x: 12 * T + 8, y: 53 * T + 8, w: 9, h: 7, speed: K.walk, accel: 900, stop: 1400 }); hero.dir = { x: 0, y: -1 };
// …
      hero.speed = K.walk;
      hero.update(dt, map, walkInput());
```
