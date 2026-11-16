# gs.paths

2D and 3D paths to follow: points along, offsets, nearest, even spacing.

`gs.paths`: `Path(points, { loop, kind })` (2D/3D; `at`, `offset`, `nearest`, `spaced`, `trace`), `Follower(path, { speed, end })`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PathsPart`, line 1592), where every option and field is described.

- `Path: typeof Path` (:1593)
  - `constructor(points: (number[] | { x: number; y: number; z?: number })[], o?: { loop?: boolean; kind?: 'smooth' | 'line' | 'bezier'; tension?: number; detail?: number })` (:1586)
  - `pts: { x: number; y: number; z: number }[]` (:1587)
  - `readonly length: number` (:1587)
  - `loop: boolean` (:1587)
  - `at(d: number, out?: object): PathPoint` (:1588)
  - `offset(d: number, side: number, out?: object): PathPoint` (:1588)
  - `nearest(x: number, y: number, z?: number): { d: number; x: number; y: number; z: number; dist: number }` (:1589)
  - `spaced(step: number): PathPoint[]` (:1590)
  - `trace(c: Ctx, from?: number, to?: number): this` (:1590)
  - `build(): this` (:1590)
  - `points3(V: Loose, step?: number): Loose[]` (:1590)
- `Follower: new (path: Path, o?: { speed?: number; end?: 'loop' | 'pingpong' | 'stop'; d?: number; side?: number }) => PathPoint & { speed: number; side: number; lap: nu…` Moves along a path at a steady speed: x, y, z, angle, d, lap, done. (:1595)
  - `x: number` (:1584)
  - `y: number` (:1584)
  - `z: number` (:1584)
  - `angle: number` (:1584)
  - `dx: number` (:1584)
  - `dy: number` (:1584)
  - `dz: number` (:1584)
  - `d: number` (:1584)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

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

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Cities** (`gs.city`, 3D): `new City(view, { seed, blocks: 6, style: 'downtown' | 'oldtown' | 'harbour' | 'suburb' })`
makes a made-up city from a seed: streets and junctions with traffic lights, buildings with lit windows,
shops, roof tanks and fire escapes, parks, trees and lamps, cars that keep to their lanes, stop at
red, change lanes, overtake, swerve, pull over for sirens and crash (Rapier bodies after `city.solid(world)`),
and people who cross at the corners, sit, phone, chat, gather at a crash and fall when hit. `city.update(dt, player)`
each frame; `city.avoid(player)` makes cars brake and swerve for you. It answers `collide`, `ray`, `route(a, b)`
(a `gs.paths` Path along the roads), `spot('door' | 'rooftop' | ...)`, `cars.hit`, `cars.chase(car, target)`,
`cars.crash(car, push)`, `people.scare`, `people.knock`, `city.events`, and gives the plan as plain
numbers for your own map. `new gs.city.Wanted(city, api)` is the police and a wanted level: stars from crimes
seen or phoned in, police cars that chase, ram, cut you off and set roadblocks (a Tiny Brain picks the
tactics and learns this player), officers on foot, searches, busted or escaped; `cars.take(car)` takes any car (moving,
parked or police) with a 'carjack' event the police hear. `new Metro(view, { seed, districts: 4 })` is one big city of districts side by side with
roads between, each made over a few frames as the player comes near and let go behind, with hills round them, a river
bridged, tunnels, a highway round it all with slip roads, and cars on all of them; police chase on across all of it and
`switchTo(at)` jumps the player elsewhere. `new Gps(city)` finds the way: a route
that follows the player, the next turn, markers, a minimap that turns, a full map to tap for a waypoint, and the way drawn on the
road. `new Interiors(city)` opens the city's front doors onto rooms: walk up to a shop, a diner, a bar, a home, a lobby
or a warehouse and its room is made, the door swings open and you walk straight in (`room.spots` for a keeper, the counter and
seats). The full guide is [docs/city.md](city.md).

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Paths** (`gs.paths`): `new Path(points, { loop, kind: 'smooth' | 'line' | 'bezier' })` in 2D or 3D, measured
so `Follower(path, { speed, end: 'loop' | 'pingpong' | 'stop' })` moves at a steady speed. `at(d)`,
`offset(d, side)` (lanes, kerbs), `nearest(x, y)` (snap onto the track), `spaced(step)` (coins along a
route) and `trace(c)` (stroke it your way).

From [Vehicles made in code](../maker-kit.md#vehicles-made-in-code):

- **A train** is its cars coupled nose to tail (`train.cars`, the engine first, each a vehicle of its own
  with its `length` over the buffers), its middle at the origin. `train.along(track, d)` lays it on your
  rails with its front `d` metres along them: `track` is `(metres) => ({ x, y, z })` on top of the rails
  or a `gs.paths.Path`, measured in the train's own space, and each car goes between its own wheels, so
  a train bends round curves and tips on slopes. `roll(d)` turns the wheels and a steam engine's rods;
  `train.radius` is its driving wheels' radius (a chuff is a quarter of a turn: `2 * Math.PI * train.radius / 4`
  metres).

## In real games

1 game uses it (`node scripts/examples.mjs gs.paths` lists them). The shortest:

`src/games/eddy-runner.js` (Eddy Runner, Advance · Action, 762 lines):

```js
const { Streams } = gs.flow;
const { Path } = gs.paths;
// …
  function rebuildStreams() {
    riverPath = new Path(pts, { detail: 10 });
// …
      const b = boulders[i];
      const nr = riverPath.nearest(b.x, b.y);
// …
      nextGateY -= gateStep;
      const n = riverPath.nearest(W / 2, gy);
// …
      const side = slot * maxOffset * (0.85 + nextRand() * 0.15);
      const gp = riverPath.offset(n.d, side);
// …
      const rockD = clamp(n.d + (nextRand() < 0.5 ? 24 : -26), 10, riverPath.length - 10);
      const rp = riverPath.offset(rockD, rockSide);
// …
        const eddy = rad >= 7;
        const ep = riverPath.offset(clamp(rockD + rad + 10, 8, riverPath.length - 8), rockSide);
// …
        const wD = clamp(n.d - 48 + nextRand() * 16, 12, riverPath.length - 12);
        const wp = riverPath.offset(wD, wSide);
```
