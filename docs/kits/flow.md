# gs.flow

Rivers with currents, waterfalls, whirlpools, lava and floods that fill hollows.

`gs.flow` (`Streams`: rivers with current round rocks, waterfalls, whirlpools, lava/acid `hurt` zones; `Flood` shallow water that fills hollows)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`FlowPart`, line 3288), where every option and field is described.

- `Streams: new (o?: { space?: '2d' | '3d' }) => On<Loose> & { list: Loose[]; river(path: Loose, o?: FlowOptions): FlowStream; pool(at: { x: number; y?: number; z?: numbe…` Rivers, pools, whirlpools: current that carries things, waterfalls, lava and acid that hurt. (:3290)
- `Flood: new (o?: { size?: number; cells?: number; x?: number; z?: number; y?: number | null; ground?: (x: number, z: number) => number; edges?: 'wall' | 'drain'; damp?:…` Shallow water that floods: spreads, runs downhill, fills hollows. (:3296)
  - `N: number` (:3283)
  - `size: number` (:3283)
  - `l: number` (:3283)
  - `D: Float32Array` (:3283)
  - `B: Float32Array` (:3283)
  - `edges: 'wall' | 'drain'` (:3283)
  - `rate: number` (:3283)
  - `ground(fn: (x: number, z: number) => number): FloodPart` (:3284)
  - `pour(x: number, z: number, rate?: number, r?: number): { x: number; z: number; rate: number; r: number }` (:3284)
  - `drain(x: number, z: number, rate?: number, r?: number): Loose` (:3284)
  - `remove(src: Loose): FloodPart` (:3284)
  - `rain(rate: number): FloodPart` (:3285)
  - `add(x: number, z: number, volume: number, r?: number): FloodPart` (:3285)
  - `depth(x: number, z: number): number` (:3285)
  - `wet(x: number, z: number, deep?: number): boolean` (:3285)
  - `level(x: number, z: number): number` (:3285)
  - `current(x: number, z: number): { x: number; z: number; speed: number }` (:3286)
  - `volume(): number` (:3286)
  - `update(dt: number): FloodPart` (:3286)
  - `step(h: number): void` (:3286)

## From the maker kit

From [2D materials, slabs, water and stickers](../maker-kit.md#2d-materials-slabs-water-and-stickers):

- `water(c, x, y, w, h, t, { color, deep, light, strength, scale, flow })` fills a rectangle with water
  and a net of light that drifts. For a pond or river of another shape, `c.clip()` to the shape first.
  This is a look; for water that pushes things, see `gs.flow`.

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

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Swimming** (`gs.climb`): `Swimmer()` takes the hero into the water the game made (every `gs.outdoors` `Water` and
`Sea` is found by itself; or `water:` a level, a function of x and z, or a `gs.flow` `Streams` whose current carries
them). Call `swim.update(dt, { move, up, down, fast }, hero)` after your own `hero.walk()`: ankle deep nothing changes;
deeper it wades (`swim.slow`: the walk slows to about half by the waist); out of its depth it swims at the surface
(`pose` `'swim'`, the front crawl, or `'tread'` when the stick is let go, shoulders at the surface) with the mover's
gravity off; `down` dives under (`'diveDown'`, `'dive'`, `'diveUp'`) and the breath runs out (`swim.air`, events
`'low'`, `'empty'`; `swim.hurt` is the damage from then on until they come up, gasping); pushing into a bank, a jetty or a
pool's edge up to `climb` metres (.9) over the water pulls them out onto it (`'climbOut'` with `swim.at`). A Water made
with ripples splashes and leaves a wake by itself. Then `rig.play(swim.pose, { at: swim.at })` when there is one and
face `swim.facing`. With no mover, move `{ x, y, z }` feet by `swim.vel`.

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Outdoor worlds** (`gs.outdoors`, 3D, THREE.Terrain): `Land({ kind: 'islands', size: 200, high: 20, seed })`
makes terrain (`hills`, `mountains`, `rolling`, `islands`, `bumps`, `dunes`, `cracked`, `ridges`,
`smooth`, or your own `(x, z) => height`). `land.height(x, z)`, `normal()` and `slope()` answer where
the ground is, `flatten()` makes a pad for a village or a landing strip, `paint([[0, '#dc9'], [3, '#4a3']])`
colours it by height in your palette, `solid(world)` makes it solid in `gs.physics3d`, `grass()` scatters
blades that sway (only near the camera), and `scatter(props, 'tree', 300, { above: 1, steep: .3 })` puts
`gs.props` things on suitable ground. `land.rocks({ caves, shapes })` puts real rock on it (cliffs that overhang, caves, arches: see
[Cliffs, caves and overhangs](#cliffs-caves-and-overhangs)). For a camera down in the grass (a sniper's nest, a crawl, a close-up), `land.meadow({ reach: 22, gap: .55 })`
keeps a square of thick tufts round the camera wherever it goes: see [Next Gen outdoor looks](nextgen-3d.md#outdoor-looks-ground-hills-rock-leaves-water-and-lava). `tree({ kind: 'pine' | 'round' | 'palm' | 'bush' })` and `rock()`
make simple shapes to scatter. Next Gen worlds can paint it instead with `looks.ground` (fields, hedges, lanes, mud, puddles), ring it with far hills (`horizon(land)`) and give rocks and leaves their looks: see [Next Gen outdoor looks](nextgen-3d.md#outdoor-looks-ground-hills-rock-leaves-water-and-lava). `River(stream)` and `FloodWater(flood)` draw `gs.flow` rivers, waterfalls, lava and floods (see Flowing liquids). `Water({ level, waves })` is a sea of rolling waves you can ask about
anywhere (`height(x, z)`, `normal`, `depth(p)`); call `update(dt, camera.position)` each frame. It can be disturbed too (rings, splashes, wakes,
rain, a shore, the view from under it): see [Water you can disturb](#water-you-can-disturb).

From [Water you can disturb](../maker-kit.md#water-you-can-disturb):

- Not there: waves that break (that is `Sea`, below), water that flows or changes level (`gs.flow`,
  `gs.fluid`), and a split picture while the camera is half under.

## In real games

1 game uses it (`node scripts/examples.mjs gs.flow` lists them). The shortest:

`src/games/eddy-runner.js` (Eddy Runner, Advance · Action, 762 lines):

```js
const { Ready } = gs.rounds;
const { Streams } = gs.flow;
// …
    riverPath = new Path(pts, { detail: 10 });
    streams = new Streams({ space: '2d' });
    river = streams.river(riverPath, { width: riverWidthAt(), speed: currentSpeedAt(), push: 1 });
// …
      river.rock(nr.d, b.side, b.r);
      if (b.eddy) streams.pool({ x: b.ex, y: b.ey }, b.er, { push: 0.16 });
// …
      const w = whirls[i];
      streams.whirl({ x: w.x, y: w.y }, w.r, w.spin, w.pull);
// …
    // Water current & whirlpools via gs.flow.Streams
    const here = streams.carry(kayak, dt, { drag: K.drag });
```
