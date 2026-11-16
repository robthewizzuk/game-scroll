# gs.outdoors

Land, grass, rocks, cliffs and caves, water, the sea, rivers, trees, wind, ground marks, cloth.

`gs.outdoors` (`Land` terrain + `grass`/`scatter`/`meadow` (thick grass that keeps round the camera) + `rocks({ caves: [{ path, radius }], shapes: [{ arch | box | ball, at }] })` (real rock on the height map: cliffs with ledges and overhangs where it is steep, caves to walk through, arches; then `land.floor(x, y, z)` is what a thing stands on, `roof`, `sky` (how dark), `ray`), `Water` (waves to float on; with `ripples: true` it can be disturbed: `ring`, `splash`, `watch(boat)` for its wake and foam, `rain`, a `bed` for shallows and shore foam, `underwater(view)`), `Sea` (the open sea to the horizon: `new Sea({ wind, dir, bed: land.height, view })`, a swell the wind made that `height()` answers, fine waves (an FFT on the chip on WebGPU), whitecaps, and over a `bed` waves that break, a swash up the beach and wet sand; `update(dt, camera.position)`, `covered(x, z)`, `wetAt(x, z)`), `River` (water/lava look for gs.flow), `FloodWater` (GPU on WebGPU), `tree`, `rock`, `Wind`, `impostor`, `Marks` (ground that takes marks: `new Marks(view, { land, weather, mud: (x, z) => 0..1, sand })` in make(), `watch(person)` / `watch(vehicle)` / `watch(thing, { feet: 4, shape: 'paw' })` leave footprints and tyre tracks in snow, mud and sand and part the land's meadow, `update(dt)` each frame, `made` this frame's marks for sounds, `kindAt(x, z)`, `trail(x, z, r, { by })` to follow, `step` / `press` / `roll` by hand, `clear()` in reset()), `Ground(view, { size, kind: 'yard' })` (a yard, street or square painted round the camera with nothing repeating: cast concrete slabs with tar joints, cracks some sealed, wear, oil and rust, or asphalt, paving, a plaza, grass; `line`, `bay`, `hatch` painted on it chipped and worn where wheels run, `lane` polished by traffic, `stamp(x, z, 'oil' | 'skid' | 'scorch')`; in the rain puddles with a soaked band and a damp halo, water left in the joints and cracks; `update()` each frame before the view draws), `Cloth(view, { wind })` (flags, banners, awnings and washing lines in the wind, sheets that drape over `ball` / `capsule` solids: `flag`, `banner`, `awning`, `line`, `sheet`, `piece.ride(mast)`; clothes people wear: `skirt({ on: person })`, `cape({ on: person })` go round their legs and body and fly as they run; `update(dt)`, `clear()` in reset(); on the graphics chip on WebGPU))

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`OutdoorsPart`, line 4836), where every option and field is described.

- `Land: new (o?: { kind?: string | ((x: number, z: number) => number); size?: number; segments?: number; low?: number; high?: number; seed?: number; smooth?: number; ste…` Terrain (THREE.Terrain): kind 'hills' | 'mountains' | 'rolling' | 'islands' | 'bumps' | 'dunes' | 'cracked' | 'ridges' | 'smooth', or (x, z) => height. (:4838)
  - `object: Loose` (:4502)
  - `mesh: Loose` (:4502)
  - `wind?: WindPart | null` A gs.outdoors Wind: the grass sways with it. (:4502)
  - `size: number` (:4502)
  - `segments: number` (:4502)
  - `low: number` (:4502)
  - `high: number` (:4502)
  - `height(x: number, z: number): number` (:4503)
  - `normal(x: number, z: number): P3` (:4503)
  - `slope(x: number, z: number): number` (:4503)
  - `inside(x: number, z: number): boolean` (:4503)
  - `flatten(x: number, z: number, r: number, h?: number, soft?: number): LandPart` (:4504)
  - `paint(stops: [number, string][]): LandPart` (:4504)
  - `masks(fn: (x: number, z: number, y: number, slope: number) => number[]): LandPart` (:4504)
  - `solid(world: Loose, o?: Loose): Loose` (:4504)
  - `grass(o?: { count?: number; colour?: string; /** [from, to]: tufts get a colour between the two. */ tint?: string[]; width?: number; height?: number; blades?: number; …` (:4505)
  - `meadow(o?: false | { reach?: number; gap?: number; height?: number; width?: number; blades?: number; bends?: number; stalks?: number; spread?: number; colours?: string…` Thick grass round the camera: a square of tufts that travels with it over the land (each tuft stays where it grows), bending with land.wind. (:4512)
  - `meadows: Loose[]` The meadow rings on this land (each an instanced mesh). (:4514)
  - `scatter(props: Loose, name: string, count: number, o?: { above?: number; below?: number; steep?: number; keepOut?: (x: number, z: number) => boolean; inset?: number; […` (:4515)
  - `rocks(o?: false | LandRocks): Loose` Rock on the land: cliffs with ledges and overhangs where it is steep, caves cut through it, and rock of your own shape (arches, blocks) melted into it. (:4522)
  - `rock: { group: Loose; material: Loose; tris: number; pieces: number; ms: number; holes: Uint32Array; [k: string]: Loose } | null` What land.rocks() made: its group and material (one stock material for all the rock: give it a look with gs.outdoors.looks.rock), how many triangles in how many pieces, and how long the number work took. (:4524)
  - `floor(x: number, y: number, z: number, reach?: number): number` What a thing at height y stands on at x, z: the highest ground or rock at or under y + reach (.6): a cave's floor, a ledge, the ground under an overhang. (:4526)
  - `roof(x: number, y: number, z: number): number` The underside of what is over a point (Infinity: open sky). (:4528)
  - `rocky(x: number, z: number): boolean` Does rock show at x, z, or has a cave taken the ground away there? (:4530)
  - `sky(x: number, y: number, z: number): number` How much daylight reaches a point: 1 in the open, .7 under an overhang, down to .1 deep in a cave (dim your fill light by it). (:4532)
  - `ray(from: P3, dir: P3, max?: number): { distance: number } | null` Metres from `from` along the unit direction `dir` to the ground or the rock: { distance }, or null within max (100). (:4534)
  - `height0(x: number, z: number): number` The height map's own height at x, z, whatever rock stands there. (:4536)
  - `update(dt: number, camera?: Loose): LandPart` (:4537)
  - `dispose(): void` (:4537)
- `Water: new (o?: WaterOptions) => WaterPart` Waves (a sum of sines) you can read anywhere: height, normal, depth. (:4840)
  - `mesh: Loose` (:4730)
  - `level: number` (:4730)
  - `t: number` (:4730)
  - `rain: number` Rain falling on it, 0..1 (set it each frame from your weather): the water is duller, rings open where the drops land round the centre, and little drops hop back up. (:4732)
  - `readonly under: number` 1 while the camera of the view given to underwater() is below the surface (for your sound: gs.sound.mixer.muffle). (:4734)
  - `readonly splashes: WaterSplash[]` What landed in the water since the last update: your splash() calls and watched things going in or leaping out. (:4736)
  - `readonly busy: boolean` True while ripples are moving. (:4738)
  - `height(x: number, z: number, t?: number): number` Water height at x, z now: the waves, and the ripples where there are any. (:4740)
  - `swellAt(x: number, z: number, t?: number): number` The waves' height over the calm level at x, z (no ripples). (:4742)
  - `normal(x: number, z: number, t?: number): P3` (:4743)
  - `depth(p: P3): number` (:4743)
  - `ripples(o?: { cells?: number; reach?: number; speed?: number }): WaterPart` Makes the ripple field now (see the `ripples` option). (:4745)
  - `ring(x: number, z: number, o?: { size?: number; strength?: number }): WaterPart` Something small dropped in at x, z: rings spread out. (:4747)
  - `splash(x: number, z: number, o?: { size?: number; speed?: number }): WaterPart` Something landed in the water at x, z: spray goes up, rings go out, a patch of foam is left, and it is listed in `splashes` for a frame. (:4749)
  - `watch(thing: Loose, o?: { radius?: number; bottom?: number; top?: number; foam?: number; splash?: number }): WaterWatch` Watches something that can be in the water (a mesh, a body, a boat: anything with a position, or x, y, z) and does the rest by itself: a splash when it lands or leaps out, the water it pushes aside, rings and a wake… (:4755)
  - `unwatch(thing: Loose): WaterPart` (:4756)
  - `underwater(view: Loose, o?: { colour?: string | null; murk?: number; dark?: number }): WaterPart` The look for a camera that goes under the surface: the view's air becomes murky, tinted water (darker the deeper it is), the surface can be seen from below, and it all goes back to the game's own air on the way up. (:4762)
  - `calm(): WaterPart` Calm again, for a new round: no ripples, foam, spray or rain rings. (:4764)
  - `update(dt: number, centre?: P3 | null): WaterPart` (:4765)
  - `dispose(): void` (:4765)
- `Sea: (new (o?: SeaOptions) => SeaPart) & { swell(wind?: number, dir?: number, amount?: number, seed?: number): { dir: number; length: number; height: number; speed: nu…` The open sea to the horizon: a swell the wind has made (what height() answers, so boats float on it on both renderers), fine waves (an FFT on the graphics chip on WebGPU), whitecaps in a fresh wind, colour by depth,… (:4846)
- `tree(o?: { kind?: 'pine' | 'round' | 'palm' | 'bush'; trunk?: string; leaves?: string; height?: number; seed?: number }): Loose` (:4847)
- `rock(o?: { size?: number; colour?: string; seed?: number }): Loose` (:4848)
- `looks: { /** Painted ground; needs land.masks(). */ ground(material: Loose, o?: { detail?: Loose; colours?: Partial<Record<'grassA' | 'grassB' | 'dry' | 'dirt' | 'mud'…` Outdoor looks for Next Gen worlds, as patches on standard materials. (:4850)
- `River: new (stream: Loose, o?: { step?: number; across?: number; lift?: number; look?: Loose; material?: Loose }) => { mesh: Loose; stream: Loose; look: { uniforms: Re…` Draws a gs.flow river, waterfall or pool: moving water with foam, or lava (kind 'lava'), acid, mud. (:4866)
- `FloodWater: new (flood: FloodPart, o?: { view?: Loose; deep?: string; shallow?: string; opacity?: number; rough?: number; full?: number }) => { mesh: Loose; flood: Flo…` Draws a gs.flow Flood (and runs it on the graphics chip on WebGPU when given the view). (:4868)
- `Marks: new (view: Loose | null, o?: MarksOptions) => MarksPart` Ground that takes marks: feet leave prints and wheels leave tracks in snow (where a gs.sky.Weather with a level has let it settle), mud (bare earth the rain has wet) and sand, and the land's meadow parts round… (:4875)
  - `kindAt(x: number, z: number, out?: Loose): { kind: 'snow' | 'mud' | 'sand' | 'grass' | null; soft: number; depth: number; y: number }` What the ground at x, z is like now. (:4627)
  - `step(x: number, z: number, o?: { turn?: number; dir?: [number, number]; size?: number; width?: number; shape?: 'boot' | 'bare' | 'paw' | 'hoof' | 'shoe' | 'round'; sid…` One print. turn: which way the foot points (radians round y, 0 towards +z; or dir: [x, z]); side: 1 a left foot, -1 a right one. (:4629)
  - `press(x: number, z: number, r?: number, o?: { press?: number; by?: Loose }): Loose | null` A round dent r metres from its middle to its edge: something fell here, or knelt. (:4631)
  - `roll(id: Loose, x: number, z: number, o?: { width?: number; tread?: 'tyre' | 'cleat' | 'rim' | 'smooth'; press?: number; by?: Loose }): Loose | null` A track that joins up: call it each frame with where the wheel (or sled, or dragged thing) is now, under a name of its own. (:4633)
  - `lift(id: Loose): void` (:4634)
  - `push(x: number, z: number, r?: number, o?: { vx?: number; vz?: number; amount?: number }): void` Parts the grass within r metres of a point this frame, away from it (vx, vz: the way the thing there is moving). (:4636)
  - `watch<T>(thing: T, o?: MarksWatch): T` From now on this thing leaves marks by itself: a gs.models.human a boot print where each foot really comes down, a gs.models.vehicle a track behind each wheel (a tank its two belts), anything else that moves (an… (:4641)
  - `unwatch(thing: Loose): void` (:4642)
  - `update(dt: number, centre?: P3): MarksPart` Each frame, after the things that leave marks have moved. (:4644)
  - `made: MarkMade[]` The marks made this frame. (:4646)
  - `at(x: number, z: number): number` How deep the ground is pressed at x, z, in metres (0: not at all, or out of reach of the centre). (:4648)
  - `trail(x: number, z: number, r?: number, o?: { by?: Loose; newer?: number; max?: number }): { x: number; z: number; turn: number; kind: 'snow' | 'mud' | 'sand'; age: nu…` The marks within r metres of a point, the newest first (a trail to follow, or to read). (:4650)
  - `readonly count: number` How many marks are remembered, and how many tiles of them are being drawn. (:4652)
  - `readonly drawn: number` (:4652)
  - `grass: { at(x: number, z: number, out?: Loose): { x: number; z: number; flat: number }; readonly busy: boolean; texture: Loose; where: Loose; [k: string]: Loose } | null` The grass field (null with grass: false): at(x, z) => { x, z (which way it leans, 0..1 long), flat (0..1 trodden) }, busy. (:4654)
  - `size: number` Metres a tile of prints is across, and a texel of it. (:4656)
  - `cell: number` (:4656)
  - `clear(): MarksPart` Takes every mark away and stands the grass up (in reset()); what is watched stays watched. (:4658)
  - `dispose(): void` (:4659)
- `Ground: new (view: Loose, o?: { /** metres across, or [width, depth] (60) */ size?: number | [number, number]; kind?: 'yard' | 'asphalt' | 'paving' | 'plaza' | 'grass'…` A yard, a street or a square to stand on, painted round the camera with nothing repeating: kind 'yard' (cast concrete slabs with tar in their joints, cracks, some sealed, pale stones, wear where traffic runs, oil and… (:4883)
  - `mesh: Loose` the ground's mesh (in the view's scene): give it to a World3D's ground() to stand on it (:4603)
  - `kind: string` (:4604)
  - `paint: Loose` the painter underneath (ground-paint.js): info, levels (:4606)
  - `add(mesh: Loose, kind?: 'yard' | 'asphalt' | 'paving' | 'plaza' | 'grass', o?: { base?: string; order?: number }): Loose` More ground painted the same way: a kerb's top, a pavement (kind: as the constructor's). (:4608)
  - `stamp(x: number, z: number, kind?: 'oil' | 'skid' | 'scorch' | 'line' | 'lane' | 'hatch', o?: GroundOptions): Loose` A mark at x, z: 'oil' (size across), 'skid' (size long, track between the wheels), 'scorch', 'line', 'lane', 'hatch'. (:4610)
  - `unstamp(mark: Loose): void` (:4611)
  - `line(x0: number, z0: number, x1: number, z1: number, o?: GroundOptions): Loose` A painted line from (x0, z0) to (x1, z1), chipped and worn where wheels run. (:4613)
  - `lane(x0: number, z0: number, x1: number, z1: number, o?: GroundOptions): Loose` A lane worn by traffic from (x0, z0) to (x1, z1): polished, darker, rubber in its two wheel tracks; lines in it wear through. (:4615)
  - `hatch(x: number, z: number, w: number, d: number, o?: GroundOptions & { spacing?: number }): Loose` A hatched box w x d metres centred at x, z: a border and stripes spacing apart. (:4617)
  - `bay(x: number, z: number, w: number, d: number, o?: GroundOptions & { open?: boolean }): Loose[]` A bay w x d metres centred at x, z: lines on three sides (four with open: false). (:4619)
  - `update(at?: Loose): GroundPart` Each frame before the view draws (at: the camera's place; the view's camera by default). (:4621)
  - `readonly busy: boolean` (:4622)
- …more: `OutdoorsPart` at src/gamescroll.d.ts:4836

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

**Clothes and dirt** (`gs.models.human` people on WebGPU): each cloth is woven at the size of its threads (twill
trousers, a knitted T-shirt, denim, canvas webbing, a woollen coat with a soft sheen; `outfit.legs.weave: 'denim'` and
so on), leather has its grain, and sleeves and trousers crease where the elbows and knees bend. `person.grime`
(`wet`, `mud`, `dust`, `snow`, 0..1) shows on the clothes and the skin: rain soaks a person from the shoulders down
under the open sky by itself, `gs.outdoors` Marks splashes mud up the legs of someone it watches, and you can set
any of it (`person.grime.wet = 1` after a fall in a river; `grime.clean()`). Wet dries and snow melts by themselves.

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

`const { Water } = gs.outdoors;` (3D.) The sea, lake or pond a game already has, answering to what
happens to it. The water within 24 metres of the centre you give `update()` is a field of ripples:

```js
make():   sea = new Water({ level: 0, waves: .6, ripples: true, bed: (x, z) => land.height(x, z) });
          view.scene.add(sea.mesh); sea.underwater(view);            // the look for a camera that goes under
          sea.watch(boat, { radius: 1.2 });                          // by itself from now on: its wake, its foam, a splash if it lands
reset() { sea.calm(); }
update(dt) {
  sky.update(dt); sea.rain = weather.rain;                            // 0..1 (a Weather given `water: sea` sets it itself)
  sea.update(dt, camera.position);                                   // after the sky and your own view.air()
  for (const s of sea.splashes) ears.play('splash', s);              // what landed in it this frame
  mixer.muffle(sea.under ? .8 : 0);
}
sea.splash(rock.x, rock.z, { size: .8, speed: 7 });                  // something fell in
sea.ring(x, z, { size: .3 });                                        // something small did
```

- `ring(x, z, { size, strength })`: rings spread out at walking pace and die away. `splash(x, z, { size,
  speed })`: spray goes up (higher for a faster hit), rings go out and a patch of foam is left that breaks
  up and fades. Each splash is in `sea.splashes` for one frame (`{ x, y, z, size, speed }`): sound, score
  and shake are yours.
- `watch(thing, { radius, bottom, top })` takes a mesh, a physics body, a `gs.craft.Boat`, a character:
  anything with a position. From then on the water does the rest: a splash when it lands in the water or
  leaps out of it, the water it pushes aside as it moves, rings left behind it (slow, they spread round a
  swimmer; fast, they are a boat's wake), a trail of foam above a jog, spray off the bow above 5 m/s.
  `bottom` and `top` are how far below and above its position it reaches (a person standing: `bottom: 0,
  top: 1.8`). It returns the watch: `remove()` stops it. `foam: 0` or `splash: 0` turn those off.
- `sea.height(x, z)` includes the ripples, so a floating thing bobs as a ring passes under it.
- `bed: (x, z) => height` is the ground under the water (`land.height`): the shallows are paler and
  clearer (`shallow`: their colour; `clear`: metres of water that hide the bed, 2.5), the water fades out
  at the waterline, a broken line of foam laps the shore, and ripples die on the beach.
- `sea.rain = 0..1`: the water goes duller, rings open where the drops land round the centre and little
  drops hop back up. This works on any `Water`, with ripples or not.
- `underwater(view, { colour, murk, dark })`: while the view's camera is below the surface, the view's
  air is murky, tinted water (`murk`: how thick, .14 is about 15 metres of view; `dark`: how fast it
  darkens with depth), the surface is seen from below, and `sea.under` is 1. On the way up the air goes
  back to what your game had, or has set since.
- **What it costs.** Calm water does no more work than its waves. While ripples move, a 128 by 128 grid
  is stepped on the processor and two small pictures go to the graphics chip: measured on a desktop,
  `update()` is .13 ms calm, .3 to .6 ms with ripples moving, .1 ms more in rain (not yet measured on a
  phone). `ripples: 64` is a quarter of that with coarser rings. It is the same on WebGL and WebGPU, and
  needs no change to your water's material: your own `material` keeps its normal map and gets foam, spray
  and wakes (its own map hides the small rings).
- Ask for `ripples: true` with the level: the first `ring()`, `splash()` or `watch()` makes the field
  otherwise, in the middle of a round. `foam: false` and `spray: 0` leave those out.
- Not there: waves that break (that is `Sea`, below), water that flows or changes level (`gs.flow`,
  `gs.fluid`), and a split picture while the camera is half under.

More in docs/maker-kit.md: "The open sea and its shore", "Weather that changes the world", "Ground that takes marks", "A yard, a street or a square to stand on", "Cloth in the wind", "Cliffs, caves and overhangs".

## In real games

1 game uses it (`node scripts/examples.mjs gs.outdoors` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { HDView, Particles, pbr, rbox, sun, surface, speckle, THREE } = gs.hd;
const { Land, Water, Wind, looks, groundDetail, horizon, impostor } = gs.outdoors;
// …
function bridgeDeck(land) {
  const top = z => Math.max(land.height(BRIDGE.x - 3, z), land.height(BRIDGE.x, z), land.height(BRIDGE.x + 3, z)), ya = top(BRIDGE.z0), yb = top(BRIDG
  return z => { const t = clamp((z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0), 0, 1); return Math.max(lerp(ya, yb, t) + BRIDGE.hump * Math.sin(Math.PI * t
// …
// rain, and pushes the bullets; its gusts roll down the valley, so the grass shows one coming
const AIR = new Wind({ x: 2.5, z: 0, gust: .45, gustSize: 90, sway: .1, grass: .25 });
// …
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, normalMap: normal, normalScale: new THREE.Vector2(.5, .5) });
  looks.ground(m, { detail: tex.detail, roads: ROADSEGS, wet: GU.uWet });
// …
// rock (gs.outdoors looks.rock): the shape's own colour, cracks and grit, moss where the top faces the sky
function rockMat(tex) { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }); looks.rock(m, { detail: tex.detail }); return
// …
  const m = new THREE.MeshPhysicalMaterial({ map: atlas, vertexColors: true, roughness: .82, alphaTest: .5, side: THREE.DoubleSide, specularIntensity:
  looks.leaves(m, { time: GU.uTime, wind: AIR, sun: GU.uSun, atlas: [1024, 512], glow: .45 });
// …
  // ---- land, with the nests and the village levelled, painted by the ground shader
  const tex = groundDetail();
```
