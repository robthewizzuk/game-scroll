# gs.props

Thousands of 3D props in few draws (instancing, LOD), areas, chunks, crowds of animated people.

`gs.props` (`Props` instancing + LOD (a kind with no `lod` gets simpler far shapes by itself), `perCopy(instancedMesh)` skips off-screen copies, `Areas`, `Chunks`, `simplify`; `Crowd(view, { of: [human(...), creature(...)], moves: ['idle', 'walk', 'run'] })` hundreds of animated people or animals in a few draws, nobody posed in JavaScript: `add({ x, z, turn, kind, move, size, tint })` gives a member to move as you like, `update(dt)` each frame, `near`, `ray` (a shot or a tap), `clear()` in `reset()`; no faces, hair strands or fur in a crowd, so swap the one the player is looking at for a real `human()`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PropsPart`, line 4394), where every option and field is described.

- `Crowd: new (view: Loose, o: { of: Loose[]; moves?: string[]; far?: number; shadows?: boolean; reach?: number }) => CrowdT` A crowd in a Next Gen view. (:4402)
  - `readonly list: CrowdMember[]` The members, in the order they were added. (:4371)
  - `visible: boolean` false: nobody is drawn (their moves still step on). (:4373)
  - `lod: number | null` 0, 1 or 2: every member at that one of its figure's own levels of detail. (:4375)
  - `far: number` Metres past which nobody is drawn. (:4377)
  - `readonly info: { members: number; drawn: number; levels: number[]; draws: number; triangles: number }` What the last update() drew: members, how many were sent to be drawn, how many at each level of detail (finest first), draws and triangles a frame. (:4379)
  - `add(o?: { x?: number; y?: number; z?: number; turn?: number; kind?: number; move?: string; size?: number; tint?: string | number; phase?: number; data?: Loose }): Crow…` Adds a member. move: one of the crowd's moves (the first by default); phase: where in it to start (by default each starts somewhere else, so the crowd is out of step); tint: a colour its own are multiplied by; data:… (:4381)
  - `remove(member: CrowdMember): CrowdT` (:4382)
  - `clear(): CrowdT` Takes everyone out (call in reset()). (:4384)
  - `near(x: number, z: number, r: number, out?: CrowdMember[]): CrowdMember[]` The members within r metres of (x, z). (:4386)
  - `ray(origin: XYZ, dir: XYZ, far?: number): { member: CrowdMember; distance: number; height: number } | null` The first member a ray meets (a shot, a tap through the camera). (:4388)
  - `update(dt?: number): CrowdT` Each frame, after the members and the camera have moved. (:4390)
  - `dispose(): void` Out of the scene, and what it made freed. (:4392)
- `simplify(geometry: Loose, keep?: number): Loose` (:4403)
- `perCopy(instancedMesh: Loose, o?: { renderer?: Loose }): Loose` A finished InstancedMesh of still things, swapped in place for one that skips the copies off screen (same look). (:4405)
- `freeCopies(root: Loose): void` Frees the perCopy() / Props meshes under root once it's thrown away (a rebuilt level). (:4407)
- `Props: new (scene: Loose, o?: { renderer?: Loose; shadows?: boolean }) => { /** A kind of prop. lod: distances where simpler shapes made for you take over, [[distance,…` (:4408)
- `Areas: new (o?: { depth?: number }) => { current: string | null; add(name: string, object: Loose, box?: Loose): Loose; link(a: string, b: string): Loose; at(p: P3): st…` (:4427)
- `Chunks: new (scene: Loose, o: { size?: number; radius?: number; make: (cx: number, cz: number) => Loose; drop?: (o: Loose, cx: number, cz: number) => void; perFrame?: …` (:4428)

## From the maker kit

From [3D physics](../maker-kit.md#3d-physics):

- **Shapes by size, and many in one body**: `shape(mesh, { box: [w, h, d] | ball: r | capsule: [r, h] | hull: points,
  off, turn })` for a body of a size you give (not the mesh's). `shapes([{ box, at, turn, part }...], { tag, sound })`
  puts thousands of still shapes (a street's posts, a forest's trunks) in one fixed body: `add`, `drop(part)`,
  `set(part, at, turn)`, and a ray's `hit.part` says which one. `gs.props`' `solid()` and `gs.city`'s `solid()` use it.

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Bigger levels on phones** (`gs.props`, 3D, InstancedMesh2): `Props` draws thousands of the same thing
(trees, rocks, crates) in one go, skips the ones off screen and swaps far ones for simpler shapes
made for you (`simplify()`, three's SimplifyModifier). `scatter()` spreads them over ground with
gaps and keep-out zones. `Areas` hides rooms you can't see into, and `Chunks` builds a big world
around the player a piece at a time and drops what's far away. Already built an `InstancedMesh` of still things (towers, trees,
track pieces)? `perCopy(mesh)` swaps it in place for one that skips the copies off screen, same look (`freeCopies(group)` when you throw
the level away).

**Crowds** (`gs.props.Crowd`, Next Gen): a street, a stand full of fans or a herd, hundreds of animated people
or animals for the cost of a few draws. A person drawn the usual way has a skeleton of its own that is
posed in JavaScript every frame and is several draws by itself, which is fine for a squad and far too much
for three hundred. A crowd plays each kind's moves through once, writes where every bone is in every frame
into a texture, and from then on the graphics chip bends each member into its pose: a member is a few
numbers, and all of a kind at one level of detail are one draw.

```js
const { Crowd } = gs.props, { human, creature } = gs.models;
function make(api) {
  human.all([{ seed: 1, strands: false }, { seed: 2, sex: 'f', strands: false }]);     // sculpted first, as for any human()
  const crowd = new Crowd(view, { of: [human({ seed: 1, strands: false }), human({ seed: 2, sex: 'f', strands: false }), creature({ like: 'dog', fur: false })],
    moves: ['idle', 'walk', 'run'] });                                                 // the poses of their rigs the members will use
  return {
    reset() { crowd.clear(); for (let i = 0; i < 300; i++) crowd.add({ x: rnd(-40, 40), z: rnd(-40, 40), turn: rnd(0, 6.28), kind: i % 3, move: 'walk', size: rnd(.95, 1.05) }); },
    update(dt) {
      for (const p of crowd.list) { p.x += Math.sin(p.turn) * 1.3 * dt; p.z += Math.cos(p.turn) * 1.3 * dt; }   // move them as your game likes
      crowd.update(dt);                                                                // after the camera has moved
    },
  };
}
```

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

`new Wind({ x: 3, z: 0, gust: .4 })` is one wind for the whole world: `land.wind = wind` sways the
grass with it, `looks.leaves(m, { wind })` makes the trees lean and stream downwind, `Weather({ wind })`
blows the rain, `new Particles(v, { wind, blow: .6 })` carries smoke and dust, `v.air({ wind })` drifts
the cloud shadows, and `wind.at(x, z)` is the push right there (gusts roll across the land downwind, so
grass shows a gust before it reaches you): use it for bullets, flags and sails. `wind.update(dt)` each
frame; change `wind.x`, `wind.z` any time. `impostor(geometry, material)` bakes a far-away stand-in for
a tree: a few crossed cards with pictures of the real tree, lit live. Use it as the last `gs.props`
level: `lod: [[90, mid], [240, imp.geometry, imp.material]]` (a level can have a material of its own).

From [Vehicles made in code](../maker-kit.md#vehicles-made-in-code):

- **Street props that go over.** `city.solid(world)` makes lamp posts, signals, signs, benches, hydrants and
  bins that a car going fast enough knocks over (they fall as bodies of their own; the car carries on, a
  little slower); trees, bollards and poles stop it. `city.props.mend()` stands them up again. Your own
  `gs.props`: `props.solid(world, 'post', { shape: 'trunk', knock: 6 })` (m/s), `props.knock(name, id)`, `props.mend()`.

From [Towns that live](../maker-kit.md#towns-that-live):

`gs.town` is a village or a castle town as rules: a world clock, a layout from a seed, townsfolk who live their
day by the clock, shops and monsters that come at night. It is plain data, so a 2D game can use it too;
`gs.city.Town` builds the same plan in a Next Gen view. Reputation is the `gs.rpg` kit's: a shop given a `faction`
finds the game's Reputation and prices by the hero's standing with it (dearer when they dislike the hero, and they
pay less), and `rep.mood(faction)` says how a townsperson meets the hero.

```js
const { Clock, Folk, Shop, Night } = gs.town, { Town } = gs.city;
make() {
  sky = new gs.sky.Sky(view, { physical: true });
  clock = new Clock({ hour: 8, speed: 1 / 30 });              // a day in 12 minutes; drives the Sky by itself
  town = new Town(view, { seed: 7, kind: 'castle', houses: 16 });   // solid in the game's World3D by itself
  folk = new Folk(town.plan, { crowd });                      // a gs.props.Crowd of human() kinds: moved by itself
  night = new Night(town.plan, { kinds: ['ghoul', { kind: 'wolf', speed: 2.4 }] });
  inn = new Shop({ stock: { stew: { price: 4, count: 6 }, room: { price: 10, count: 3 } }, keeper: folk.of('innkeeper')[0], faction: 'town' });
}
update(dt) { clock.update(dt); town.update(dt); folk.update(dt); night.update(dt, hero); }
```

## In real games

3 games use it (`node scripts/examples.mjs gs.props` lists them). The shortest:

`src/games/neon-drift.js` (Neon Drift, Next Gen · Racing, 287 lines):

```js
const { HDView, Particles, pbr, rbox, surface, speckle, spot, THREE } = gs.hd;
const { perCopy, freeCopies } = gs.props;
// …
    setup(); const m = looks();
    if (built) { v.scene.remove(built); freeCopies(built); }
// …
    poles.count = bulbs.count = pc; poles.castShadow = true; poles.frustumCulled = bulbs.frustumCulled = false; built.add(poles, bulbs);
    for (const o of [bar, ...neon, tw, ...signs, poles, bulbs]) perCopy(o);   // the copies off screen aren't drawn
```

`src/games/gravity-grip.js` (Gravity Grip, Next Gen · Racing, 368 lines):

```js
const { HDView, Particles, pbr, rbox, surface, speckle, spot, THREE } = gs.hd;
const { perCopy, freeCopies } = gs.props;
// …
    const { m, G } = looks();
    if (world) { v.scene.remove(world); world.traverse(o => { if (o.userData.own) o.geometry.dispose(); }); freeCopies(world); }
// …
    pd.frustumCulled = false; pd.renderOrder = 3; world.add(pd);
    for (const o of [frames, ob]) perCopy(o); rings = perCopy(rings);   // the big copies off screen aren't drawn (the small strips and pads cost more
```
