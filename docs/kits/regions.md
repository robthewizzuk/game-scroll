# gs.regions

Big worlds in parts, made a little each frame while wanted and freed behind.

`gs.regions` (`Regions(view, { world })`: a world in parts that are made a little each frame while wanted and freed behind (meshes, their geometry and pictures, bodies): `part(name, make)` + `want(name)` for levels built only when picked (in `reset()`: at once, under the loading screen; later: over the next frames, `has(name)` says when), `cells({ size, reach, make })` squares round the player, `land({ height, size, reach, solid })` ground in tiles, finer close by and solid near; `update(dt, at)` each frame, `ready`, `progress`; a make can be a generator function that `yield`s between pieces, and `yield r.wait(promise)` waits for background work; far out, the view draws and `World3D` simulates about a centre that follows the camera by itself, so places 20 km out stay steady and nothing changes for a game).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`RegionsPart`, line 1444), where every option and field is described.

- `Regions: new (view: Loose, o?: { /** A World3D: solid ground and bodies freed with their parts. Left out: the one the game made before this; false: none. */ world?: Lo…` A big world in parts that are made as they're wanted and let go of behind: named parts (levels made only when picked), squares round the player, land in tiles. (:1450)
  - `part(name: string, make: RegionMake): this` A named part (a level, a district, the inside of a house): make(r) builds it, all at once or as a generator function that yields between pieces. (:1420)
  - `want(...names: (string | string[])[]): this` These parts are wanted, and no others. (:1422)
  - `has(name: string): boolean` Is this part made? has(x, z): is the square under x, z made in every layer? (:1424)
  - `has(x: number, z: number): boolean` (:1425)
  - `readonly ready: boolean` Every wanted part made, and the squares round the player. (:1427)
  - `readonly progress: number` 0..1: how much of what is wanted is made. (:1429)
  - `cells(o: { size?: number; reach?: number; make: RegionMake; level?: (ring: number) => number; seed?: number }): RegionLayer` Squares round the player: make(r) builds one (r.cx, r.cz, r.x0, r.z0, r.size, r.seed). (:1431)
  - `land(o: { height: (x: number, z: number) => number; size?: number; reach?: number; segments?: number; solid?: number; material?: Loose; colour?: (x: number, y: number,…` Ground in tiles from height(x, z): finer close by, solid in the regions' world within `solid` squares, skirts so tiles meet. (:1433)
  - `update(dt?: number, at?: { x: number; y?: number; z?: number } | null): this` Each frame: builds a little of what is wanted (budget ms) and lets go of what is behind. (:1436)
  - `clear(): this` Lets go of every part and square (they're made again as they're wanted). (:1438)
  - `dispose(): void` (:1439)
  - `readonly info: { parts: string[]; cells: number; making: number; ms: number; made: number; dropped: number }` What is in now: parts made, squares made, how many are being made, and this frame's building time in ms. (:1441)
  - `budget: number` (:1442)

## From the maker kit

From [Big worlds in parts](../maker-kit.md#big-worlds-in-parts):

`gs.regions.Regions` (3D): a world in parts that are made a little each frame while they are wanted and
let go of when they are not. Use it for levels a game should build only once the player picks one (a
campaign's missions, the inside of a house), for a world bigger than a phone can hold at once (squares of
it made round the player as they walk, and freed behind), and for ground in tiles that are finer close by.

```js
const { Regions } = gs.regions;
const regions = new Regions(view, { world });   // world: a gs.physics3d.World3D, if the parts make bodies
// a named part: what it adds to the scene, the bodies it makes in `world` and what it hands r.keep() are its own
regions.part('harbour', function* (r) {
  view.scene.add(quay());
  yield;                                          // the rest waits for the next frame
  for (const p of CRATES) { r.add(prop('crate'), p); yield; }
  const people = yield r.wait(human.ready(DOCKERS)); // background work: the part goes on once it is in
});
regions.part('fort', makeFort);                   // a plain function is made in one go
// in reset(): made at once, under the loading screen; later (a menu pick): over the next frames
regions.want(pick === 1 ? 'harbour' : 'fort');
// squares round the player, and ground in tiles (finer close by, solid within one square)
regions.cells({ size: 64, reach: 2, make: r => scatterTrees(r.x0, r.z0, r.size, r.seed) });
const ground = regions.land({ height: (x, z) => 20 * gs.math.fbm(x * .004, z * .004), size: 64, reach: 5, solid: 1,
  colour: (x, y, z, slope) => slope > .35 ? '#7a7466' : '#5c7f3a' });
// each frame
regions.update(dt, player.position);
if (!regions.has('fort')) drawLoading(regions.progress);
```

- **Parts.** `part(name, make)` says how to make one; `want(...names)` says which are wanted (and no
  others). Inside `make()` or `reset()` a wanted part is made at once, so the card's loading screen covers
  it; after that it is made in the frame's spare time (`budget` milliseconds a frame, 3 by default), and
  `has(name)` says when it is in. A part no longer wanted is kept for later (`keep: 1` by default: the
  last one) while the phone has memory to spare, so picking it again is instant; short of memory it is let
  go of at once. A part let go of while it is still being made stops.
- **What belongs to a part.** Everything its make adds to the top of the scene (or `r.add(obj, at, parent)`
  adds), the bodies made in `world` while it runs, and what it hands `r.keep(thing)` (anything with
  `dispose()`, `stop()` or `remove()`, or a function). When it goes, those are taken out, and the geometry
  and pictures that were made while it ran are freed once nothing left in the scene uses them. Materials
  are kept: making one again would build its shader, a stall in play. `r.on(fn)` runs when it goes.
- **Generators.** A make that is a generator function (`function*`) can `yield` between pieces; the rest
  waits for the next frame's budget. `yield r.wait(promise)` waits for background work and hands back its
  answer. A sculpt or a library that isn't in yet (a `human()` not sculpted on this phone) starts the part
  again once it is in.
- **Squares.** `cells({ size, reach, make, level })` makes the squares within `reach` of the player
  (nearest first, then those in front), and lets go of those beyond `reach + 1`. `make(r)` gets `r.cx`,
  `r.cz`, `r.x0`, `r.z0`, `r.size`, `r.ring` and `r.seed` (the same every time for that square, so it
  looks the same when it comes back). With `level(ring)`, a square whose detail level changes as you near
  it is made again and the old one stays until the new one is in.
- **Land.** `land({ height, size, reach, segments, solid, material, colour })` is ground in tiles of
  `size` metres from your `height(x, z)`: `segments` across for the nearest, half that for each ring out,
  each tile's edge sloping the way its neighbour's does and a skirt below its edges so a fine and a coarse
  tile meet without a gap; within `solid` squares it is solid in `world` (a heightfield, much lighter than
  a mesh). `colour(x, y, z, slope)` paints it; every tile shares `material`.
- **Memory.** Short of memory (the app's memory guard), parts kept for later are let go of, and squares
  and land reach one square less (two when critical).
- `ready` (every wanted part made, and the squares next to the player), `progress` (0..1), `info` (what
  is in, and this frame's building time), `clear()` (everything let go of, made again as wanted),
  `dispose()`.
- **Far from the world's centre.** Nothing to do. A phone's graphics chip and the physics work in 32-bit
  numbers (about seven digits), so 20 km out a place is kept to about 2 mm and a face close up shakes by a
  few pixels. A Next Gen view draws about a centre that moves along with its camera (a floating origin):
  it stays at 0, 0 until the camera is 1024 m from it, then moves to the camera in steps of 256 m. A
  `World3D` keeps its bodies about the view's centre too (`world.at`; `world.centre(x, z)` for a world with
  no view), and every place it gives or takes is in the world's own numbers. The kit's ground, rock, leaves,
  clouds and wet ground keep their patterns where they are in the world. `__hd.origin = 0` (the frame lab)
  keeps the centre at 0, 0.

From [Dungeons](../maker-kit.md#dungeons):

- `ceiling: false` for a camera from above. `at: { x, y, z }` puts it anywhere (under a town, or as a `gs.regions`
  part: build it in the part's make and `remove()` it when the part goes).

## In real games

1 game uses it (`node scripts/examples.mjs gs.regions` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Props } = gs.props;
const { Regions } = gs.regions;
// …
function missionParts(v) {
  const R = new Regions(v, { keep: 1 });
// …
  // dawn: the supply train Wren rides out on
  R.part('m1', r => {
// …
  // dusk: Sgt. Rook and Hale's squad (their faces are sculpted now, the first time on this phone)
  R.part('m2', () => { human.need(looksOf(LOOKS.m2)); });
```
