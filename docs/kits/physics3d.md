# gs.physics3d

Rapier 3D physics: bodies, level collisions, walking characters, ragdolls, vehicles.

`gs.physics3d.World3D` (Rapier 3D; lazy): `ball`, `box`, `capsule`, `hull`, `ground(mesh)`, `floor`, `mover()` (walking character), `rider()` (something your code moves, solid: kerbs, walls, shoves), `shape(mesh, { box | ball | capsule | hull })`, `shapes(list)` (thousands of still shapes in one body), `floorAt`, `sweep(shape, from, move)` (what a moved ball, box or capsule first touches), `ragdoll(character)` (a jointed ragdoll on a `gs.poses` rig: joints that only turn as real ones do, `drive(pose, strength)` muscles), `ray`, joints, `step(dt)` syncs meshes. One world through the kits: `Platformer`/`TopDown`, `Car`/`Kart`, `Plane`/`Boat`/`Hover`, `Shots`/`arc`/`Explosives`, `Grapple`, `slice`, `props.solid`, `city.solid`, `voxels.physics`, `Cloth`, `Soft`/`Liquid` and `Streams.carry` all take it (`docs/maker-kit.md`, "One physics world through the kits").

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Physics3dPart`, line 1760), where every option and field is described.

- `World3D: new (o?: { gravity?: number | XYZ; smooth?: boolean; link?: boolean }) => World3DT` gravity: metres a second² (negative is down) or { x, y, z }; smooth: meshes drawn between ticks (tick: 60 games). (:1762)
  - `readonly bodies: Body3D[]` (:1719)
  - `readonly movers: Mover3D[]` (:1719)
  - `readonly riders: Rider3D[]` (:1719)
  - `readonly vehicles: Vehicle3D[]` (:1719)
  - `readonly at: XYZ` Where Rapier's own centre is (x and z): see centre(). (:1720)
  - `ball(mesh: Loose, r?: number, o?: Body3DOptions): Body3D` (:1721)
  - `box(mesh: Loose, w?: number, h?: number, d?: number, o?: Body3DOptions): Body3D` A box of full size w × h × d. (:1722)
  - `capsule(mesh: Loose, radius?: number, height?: number, o?: Body3DOptions): Body3D` An upright capsule; height includes the round ends. (:1723)
  - `hull(mesh: Loose, o?: Body3DOptions): Body3D` A dynamic body shaped like the mesh's outline. (:1724)
  - `shape(mesh: Loose, spec: { box?: number[]; ball?: number; capsule?: number[]; hull?: number[] | XYZ[]; off?: XYZ; turn?: Loose }, o?: Body3DOptions): Body3D` A body of a plain shape: { box: [w, h, d] } | { ball: r } | { capsule: [r, h] } | { hull: points }, with off and turn. (:1726)
  - `shapes(list?: Loose[], o?: Body3DOptions): Body3D & { add(shape: Loose): Loose; drop(part: Loose): void; set(part: Loose, at: XYZ, turn?: number | Loose): void }` Many still shapes in one fixed body (lamp posts, tree trunks): each a shape() spec with at, turn and part. (:1728)
  - `ground(mesh: Loose, o?: Body3DOptions): Body3D` Makes a mesh (and everything inside it) solid and fixed: the level. (:1729)
  - `heights(o: { data: ArrayLike<number>; cols: number; rows: number; x?: number; z?: number; width: number; depth?: number }, o2?: Body3DOptions): Body3D` Solid ground from a grid of (cols + 1) × (rows + 1) heights. (:1730)
  - `floor(y?: number, o?: Body3DOptions): Body3D` A flat endless floor at height y. (:1731)
  - `mover(mesh: Loose, o?: { radius?: number; height?: number; step?: number; slope?: number; gravity?: number; at?: XYZ }): Mover3D` A walking character: radius, height, step (tallest step), slope (degrees), at. (:1732)
  - `rider(o?: { box?: number[]; ball?: number; capsule?: number[]; round?: number; at?: XYZ; turn?: number; lift?: number; step?: number; slope?: number; snap?: number; ma…` Something your code moves, solid: one of box [w, h, l], ball r, capsule [r, h]. (:1734)
  - `floorAt(x: number, y?: number, z?: number, reach?: number, not?: Body3D | Mover3D | Rider3D | null): number | null` The height of the first solid thing under (x, z) at or below y + reach, or null. (:1735)
  - `vehicle(mesh: Loose, o?: { w?: number; h?: number; l?: number; density?: number; wheels?: Loose[]; radius?: number; rest?: number; travel?: number; stiffness?: number;…` A car with suspension: chassis w, h, l, wheel meshes, power, grip, steer, at; bike: true for a motorbike. (:1737)
  - `hinge(a: Body3D | null, b: Body3D | null, p: XYZ, axis?: XYZ, o?: { min?: number; max?: number; motor?: number; strength?: number }): Joint3D` A hinge at p about axis (default y: a door); min/max (radians), motor. (:1738)
  - `pin(a: Body3D | null, b: Body3D | null, p: XYZ): Joint3D` Ball and socket at p. (:1739)
  - `weld(a: Body3D | null, b: Body3D | null): Joint3D` Glues b to a where they are now. (:1740)
  - `spring(a: Body3D | null, b: Body3D | null, pa: XYZ, pb: XYZ, o?: { stiffness?: number; damping?: number; length?: number }): Joint3D` (:1741)
  - `leash(a: Body3D | null, b: Body3D | null, pa: XYZ, pb: XYZ, length?: number): Joint3D` (:1742)
  - `remove(thing: Body3D | Mover3D | Rider3D | Vehicle3D): void` (:1743)
  - `clear(): void` (:1743)
  - `ragdoll(root: Loose, o?: { limbs?: Loose[]; push?: number[] | XYZ; [k: string]: Loose }): Ragdoll3D` A character goes floppy: a gs.poses-rigged person (figure, person, gs.models.human) as one jointed body, or a Group with limbs. (:1745)
  - `ray(from: XYZ, dir: XYZ, max?: number, filter?: Loose): RayHit3D | null` The first thing along a ray from `from` in direction dir, up to max metres. (:1746)
  - `sweep(shape: { ball?: number; box?: number[]; capsule?: number[] }, from: XYZ, move: XYZ, o?: { still?: boolean; not?: Loose; turn?: Loose }): { thing: Body3D | null; …` The first thing a moving { ball } / { box } / { capsule } meets. (:1748)
  - `around(lo: XYZ, hi: XYZ, pad?: number): Loose[]` The shapes in a box of the world, for outOf(). (:1749)
  - `outOf(p: XYZ, r: number, shapes: Loose[], from?: XYZ | null): { x: number; y: number; z: number; nx: number; ny: number; nz: number; depth: number; thing: Body3D } | null` Keeps a point of radius r out of the shapes from around(): null if clear. (:1750)
  - `near(p: XYZ, radius: number): Body3D[]` Every body within radius of a point. (:1751)
  - `blast(p: XYZ, radius: number, strength?: number): void` Throws everything near p outward (metres a second at the centre). (:1752)
  - `onHit(fn: (a: Loose, b: Loose, speed: number, contact: { readonly at: XYZ | null; readonly normal: XYZ | null }) => void): this` fn(a, b, speed, contact) when two things start touching; contact.at, contact.normal. (:1753)
  - `centre(x: number, z: number): void` Keeps the bodies in Rapier about (x, z) (the world does it by itself from the view). (:1754)
  - `inner(p: XYZ): XYZ` (:1755)
  - `outer(p: XYZ): XYZ` (:1755)
  - `step(dt: number): void` Moves the world on by dt seconds and puts the meshes where their bodies are. (:1756)
  - `free(): void` Free the engine's memory (the app does it when the card leaves the feed). (:1757)
  - `world: Loose` Rapier's own world. (:1758)
- `loadPhysics3D(): Promise<Loose>` (:1763)
- `physics3DReady(): boolean` (:1763)

## From the maker kit

From [3D physics](../maker-kit.md#3d-physics):

`const { World3D } = gs.physics3d;` Rapier in 3D, in your three.js scene's units (metres, y up). It
keeps your meshes in step with their bodies.

```js
reset() {
  phys = new World3D({ gravity: -20 });
  phys.ground(levelGroup);                                  // any meshes: solid and fixed (floors, walls, ramps)
  crate = phys.box(crateMesh, 1, 1, 1);                     // falls and tumbles; crateMesh follows it
  hero = phys.mover(heroMesh, { radius: .4, height: 1.8 }); // walks into walls, climbs steps and slopes
}
update(dt) { hero.walk(stick.x * 6, stick.y * 6); if (tapped) hero.jump(8); phys.step(dt); }
```

- Bodies: `ball(mesh, r)`, `box(mesh, w, h, d)`, `capsule(mesh, r, height)`, `hull(mesh)` (shaped
  like the mesh), `ground(mesh)`, `floor(y)`. Same options as 2D (`bounce`, `fixed`, `moving`,
  `sensor`, `noSpin`, `group`...), plus `at` for a body with no mesh.
- A body: `pos`, `vel`, `place(x, y, z)`, `setVel()`, `push(x, y, z)`, `twist()`, `touching()`, `remove()`.
- The mover: `walk(vx, vz)` every frame, `jump(speed)`, `grounded`, `feet`, `place()`.
- `ray(from, dir, max)` → `{ thing, point, normal, distance }` (aiming, line of sight, "what's under me"),
  `near(p, r)`, `blast(p, r, strength)`, `onHit((a, b, speed, contact) => ...)` (`contact.at` and
  `contact.normal`: where they met, worked out only if you read them; `contact.part` for a `shapes()` part).
- `floor(y)` is a true endless plane (walkers and riders don't sink into it or stall). `floorAt(x, y, z, reach, not)`
  is the height of the first solid thing under a point (a crate's top, a ramp; a bridge above is left out), so a
  World3D can be the `ground` of any kit that asks for one.
- **Your own movers, solid in the world**: `rider({ box: [w, h, l] | ball: r | capsule: [r, h], at, turn, step,
  slope, snap, mass })` is something your code moves (a kart, a boat, a drone, a tram) that stops at walls, climbs
  kerbs, keeps to the ground and shoves loose bodies by its `mass`. `slide(dx, dy, dz, turn, dt)` each frame,
  then `pos`, `moved`, `grounded`, `hits` (`[{ thing, normal, point }]`) and `wall`; `move(x, y, z)`, `place()`.
  `gs.vehicles`' `Kart`, `gs.craft`'s `Plane`, `Boat` and `Hover` take `world` and ride one by themselves.
- **Shapes by size, and many in one body**: `shape(mesh, { box: [w, h, d] | ball: r | capsule: [r, h] | hull: points,
  off, turn })` for a body of a size you give (not the mesh's). `shapes([{ box, at, turn, part }...], { tag, sound })`
  puts thousands of still shapes (a street's posts, a forest's trunks) in one fixed body: `add`, `drop(part)`,
  `set(part, at, turn)`, and a ray's `hit.part` says which one. `gs.props`' `solid()` and `gs.city`'s `solid()` use it.
- A `vehicle()` whose mesh is a `gs.models` vehicle dents, cracks its glass and breaks its lamps where it hits
  things by itself (`dents: false` to do your own).
- Joints: `hinge(a, b, p, axis, { min, max, motor })`, `pin(a, b, p)` (ball and socket), `weld(a, b)`,
  `spring(a, b, pa, pb)`, `leash(a, b, pa, pb, length)`.

From [Game kits](../maker-kit.md#game-kits):

**Vehicles** (`gs.vehicles`): `Car` (top-down) and `Kart` (3D) are arcade handling without a physics
engine: grip, slides, a drift you hold for a boost, surfaces (`surface: .1` is ice), hops and ground
following. `Laps(checkpoints)` counts laps, places racers and gives computer drivers somewhere to aim.
For real suspension and cars that can roll over, `World3D.vehicle(mesh, { wheels })` in
`gs.physics3d` uses Rapier's ray-cast vehicle: `car.drive(throttle, steer, brake)`, `car.speed`,
`car.upsideDown`, `car.rightUp()`.
These are how a car handles; what it looks like is yours, or `gs.models.vehicle('car')`:
[Vehicles made in code](#vehicles-made-in-code).

**3D levels from text** (`gs.level3d.Level3D(text, { size, wall, look })`): the same text maps in 3D.
`#` walls, `.` floor, `1`-`9` raised floors, `~` water, `=` low walls, spaces as holes, letters as
marks (`find('P')`). Rows of the same block merge, so a big map is a few meshes. `level.solid(world)`
makes it solid in `gs.physics3d`; `height(x, z)` gives the floor height for a `Kart`.

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Breaking things** (`gs.destruction`, 3D, three-pinata): `shatter(mesh, { pieces, at, world })` breaks
any mesh into real pieces (more near where it was hit) that fly with `gs.physics3d`; `slice(mesh, point,
normal)` cuts one in two; `Rubble` fades old pieces so phones stay fast. A whole building that knows what
holds it up is `Structure`: [Buildings that come apart](#buildings-that-come-apart).

**Ball games with cars** (`gs.arena`, Rapier through `gs.physics3d`): `Arena(world, { w, l, goal, ball })`
builds the walls, curved ramps, ceiling and goals, keeps the score and clock (with overtime), adds
punch to touches, has boost pads, `predict()`s the ball's path for a landing marker (the physics world is
asked where the ball next meets the real floor, walls, ramps and goals, once a frame however many ask), and keeps a
few seconds of replay (`playback(t)`). `BallCar` is a real suspension car with boost, jump, a second
jump that flips you the way you push, and air control. `chaseBall(car, arena)` is a simple
opponent to start from.

**Sound that knows the level**: give the ears the level and they work the rest out.
`new Ears({ level: world })` takes a `gs.physics3d` `World3D`, a `TileMap`, a `City`, `Voxels`, 2D
`Physics`, a `NavGrid`, a function `(from, dir, max) => metres to the first solid thing`, or a list
of those. Then:

**The sounds a world makes by itself** (`gs.sound.Foley`): with nothing more to call than
`foley.update(dt)` each frame, things that knock into each other sound of what they are made of, people's
feet sound of what they walk on, and engines rev with their speed through the gears. All made in code,
and placed with the ears if you give it some.

```js
const { Ears, Foley } = gs.sound;
ears = new Ears({ level: world });
foley = new Foley({ ears, world, marks, weather });       // in make(); world: a gs.physics3d World3D
foley.watch(person);                                        // a gs.models.human: a step where each foot comes down
foley.watch(truck);                                         // a gs.models.vehicle: its engine, tyres and skids
foley.watch(dog, { feet: 4, shoe: 'paw', weight: 30 });     // anything else: steps paced out along its way
phys.box(crateMesh, 1, 1, 1, { sound: 'wood' });            // or read from the mesh: planks are wood, rust is metal
update(dt) { phys.step(dt); person.move(dt, speed); foley.update(dt); }
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

More in docs/maker-kit.md: "Worlds, craft, soft things, cards and menus", "Big worlds in parts", "Weather that changes the world", "Cloth in the wind", "Vehicles made in code".

## In real games

1 game uses it (`node scripts/examples.mjs gs.physics3d` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Bodies } = gs.stealth;
const { World3D } = gs.physics3d;
// …
  // moves in it, so it is only stepped while something falls.
  const phys = new World3D({ gravity: -9.81, link: false }), loose = [];
// …
    if (physMade) return; physMade = true;
    phys.shapes(rooted(WD.coll), { tag: 'village', friction: .8, bounce: .05 });
    phys.shapes(rooted(WD.solids.filter(b => !b.temp && !b.deck).map(boxOf)), { tag: 'walls', friction: .8, bounce: .05 });
// …
    physTemp?.remove(); const t = WD.solids.filter(b => b.temp);
    physTemp = t.length ? phys.shapes(rooted(t.map(boxOf)), { tag: 'bags' }) : null;
// …
    physTemps(); if (!loose.length) return;
    phys.step(dt);
// …
    { const r = (shape.ball ?? Math.max(...shape.box) / 2), o = shape.off ? _gc.set(shape.off.x, shape.off.y, shape.off.z).applyQuaternion(mesh.quater
      for (let k = 0; k < 3; k++) { const h = phys.outOf(o, Math.min(r, .12), phys.around(lo, hi).filter(q => !q.thin)); if (!h) break; mesh.position.
    const b = phys.shape(mesh, shape, { vel, density: o.density ?? 400, friction: o.friction ?? .7, bounce: o.bounce ?? .15, spinDrag: .4, drag: .05 }
```
