# gs.destruction

Things that break: shatter, slice, rubble, buildings that come apart.

`gs.destruction` (`shatter`, `slice`, `Rubble`; `Structure(scene, { building: { style, floors }, world })`: a building that comes apart: `hit(point, { power })`, `blast(point, radius)`, and what the broken pieces held up comes down; `broke` lists what happened for your dust and sound, `standing` 1..0; make it in make(), `reset()` each round)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`DestructionPart`, line 4252), where every option and field is described.

- `shatter(mesh: Loose, o?: { pieces?: number; at?: P3; flat?: boolean; inside?: Loose; /** Left out: the World3D the game made; false: none. */ world?: Loose | false; pu…` (:4253)
- `slice(mesh: Loose, point: P3, normal: P3, o?: { inside?: Loose; /** Left out: the World3D the game made; false: none. */ world?: Loose | false; apart?: number; density…` world: a World3D: both halves become bodies going on as the mesh did (its own body there is given up); apart: m/s they part along the cut. (:4255)
- `Rubble: new (scene?: Loose, o?: { max?: number; life?: number; shrink?: number }) => { add(pieces: Loose | Loose[]): Loose; update(dt: number): Loose; clear(): Loose; …` (:4256)
- `Structure: new (scene?: Loose | null, o?: StructureOptions) => StructureT` A building that comes apart (Next Gen). (:4263)
  - `broke: StructureEvent[]` What happened this frame (after update): feed your dust, sound and shake from it. (:4312)
  - `readonly standing: number` How much of it still stands, by weight: 1 whole, 0 flat. (:4314)
  - `readonly falling: number` Pieces about to fall or in the air; busy: true while anything is still coming down (pieces or rubble). (:4316)
  - `readonly busy: boolean` (:4316)
  - `readonly pieces: number` How many pieces it is made of, and how many still stand. (:4318)
  - `readonly left: number` (:4318)
  - `group: Loose` The standing building (a Group in the scene) and what has come off it. (:4320)
  - `debris: Loose` (:4320)
  - `hit(point: number[] | XYZ, o?: { radius?: number; power?: number; dir?: number[] | XYZ | null; push?: number }): number` A hit at a world point (a bullet, a wrecking ball): pieces within radius (.4) are hurt by power (1 breaks a timber wall, 1.5 brick, 2 stone, 2.5 concrete; .1 a window; hurt adds up), and one that breaks goes to… (:4322)
  - `blast(point: number[] | XYZ, radius?: number, o?: { power?: number; push?: number }): number` An explosion at a world point: every piece within radius (3) is hurt (power at the centre, 4, none at the edge), the nearest go to rubble, the rest of the broken ones are thrown whole at up to push metres a second… (:4324)
  - `ray(from: number[] | XYZ, dir: number[] | XYZ, max?: number): { point: Loose; normal: Loose; distance: number; kind: string; piece: number } | null` The first standing piece along a ray (for shots without a physics world), or null. (:4326)
  - `update(dt: number): StructureT` Each frame, after the physics step. (:4328)
  - `reset(o?: { world?: Loose | null }): StructureT` Whole again, for a new round. (:4330)
  - `remove(): void` Out of the scene and the physics world. (:4332)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Breaking things** (`gs.destruction`, 3D, three-pinata): `shatter(mesh, { pieces, at, world })` breaks
any mesh into real pieces (more near where it was hit) that fly with `gs.physics3d`; `slice(mesh, point,
normal)` cuts one in two; `Rubble` fades old pieces so phones stay fast. A whole building that knows what
holds it up is `Structure`: [Buildings that come apart](#buildings-that-come-apart).

From [Buildings that come apart](../maker-kit.md#buildings-that-come-apart):

`const { Structure } = gs.destruction;` (Next Gen.) A `gs.models.building()` made of pieces: each half of
a pier, the wall under and over each window, each window and door, each floor tile and roof panel. Every
piece knows what holds it up, so you only say where it was hit:

```js
make():   house = new Structure(view.scene, { building: { style: 'brick', w: 8, d: 6, floors: 2 }, at: [0, 0, -12], turn: .4 });
reset() { phys = new World3D(); house.reset({ world: phys }); }      // whole again, and solid in this round's world
update(dt) {
  phys.step(dt); house.update(dt);                                   // after the physics step
  for (const b of house.broke) if (b.how !== 'fell') dust(b.x, b.y, b.z, b.size);   // what happened this frame
}
house.hit(bullet.point, { power: .4, dir: bullet.dir });             // a shot: small hits add up
house.hit(ball.position, { radius: 1.3, power: 2.4, dir, push: 5 }); // a wrecking ball
house.blast(shell.position, 3);                                      // an explosion, 3 m across
```

- **What holds what.** A piece stands on the one under it, and is held by the ones at its sides. When
  pieces go, whatever no longer reaches the ground through the ones left comes down a moment later, the
  collapse spreading out from the hole. Masonry (brick, stone, plaster) can hang one piece out sideways, so a
  wall closes over a hole one window wide and comes down over a wider one; timber and concrete hang two.
  Knock out a corner and the wall above it goes, with the floor it carried; the roof hangs on while
  a wall or its ridge still holds it. The same shell leaves a different ruin in each style.
- `hit(point, { radius, power, dir, push })`: pieces within `radius` (.4 m) are hurt by `power` (a piece
  breaks at about 1 for timber, 1.5 brick, 2 stone, 2.5 concrete, .1 a window; hurt adds up) and a broken
  one goes to rubble along `dir`. `blast(point, radius, { power, push })`: `power` (4) at the centre
  falling to none at `radius`; the nearest pieces go to rubble and the rest of the broken ones are thrown
  out whole. Both return how many pieces broke. Points are world points.
- `house.broke` after `update()`: `{ how: 'broke' | 'fell' | 'landed', kind: 'wall' | 'window' | 'door' |
  'roof' | 'floor', x, y, z, size, mass, speed, crumbled }` for each thing that happened. The kit draws
  the pieces and the rubble and nothing else: dust, sound and shake are yours, from this list.
- `house.standing` (1 whole .. 0 flat, by weight), `house.left` / `house.pieces`, `house.falling`,
  `house.busy` (true until everything has come to rest: wait for it before you score a demolition).
- **With a physics world** (`world: phys`, or `reset({ world })`) the walls are solid for movers, rays and
  `gs.sound.Ears`, a hole lets them through, and what falls is real tumbling bodies that pile up and can
  break what they land on (`crush: 0` turns that off). `phys.ray()` gives `hit.thing.structure` for the
  building it struck. **Without one** the building keeps a small physics
  world of its own (its walls, the ground under it and what has fallen), so the collapse is the same one, the
  same way every time; it steps that world itself, only while something is falling. Either way
  `house.ray(from, dir)` finds the piece a shot strikes (`{ point, normal, distance, kind, piece }`).
- Small rubble is cheap: boxes drawn as copies, in the building's own materials, that land on the ground
  (`ground: (x, z) => height`) or on what still stands. `bits` (240) is how many a material keeps and `keep`
  (40) how many fallen pieces stay as bodies; the oldest go first.
- **Your own boxes** in place of a building: `pieces: [{ size: [w, h, d], at: [x, y, z], material: 'planks',
  strength, fixed }]` (`at` is each box's centre; `fixed: true` never moves and holds the rest up, as the
  ground does: a cliff a bridge is built into), with `materials: { planks: aThreeMaterial }` if you want
  your own and `span` (1: masonry, 2: timber and steel). Boxes hold each other where they touch.
- Make it once with the level (`make()`), and `reset()` it each round. A house is about 170 pieces and
  4,400 triangles and takes a quarter of a second to cut the first time, then a few milliseconds a copy;
  a five-storey block about 1,500 pieces. On a desktop a house falling with physics measured half a
  millisecond a frame, and under a tenth without (not yet measured on a phone).
- Not there: rooms inside (it is a shell with floors), break edges that are not straight, and rubble
  that piles against walls (it lies on the ground and on floors).

From [Cliffs, caves and overhangs](../maker-kit.md#cliffs-caves-and-overhangs):

- Not there: the rock cannot be dug or broken while playing (it is made once: `gs.voxels` is for ground
  that changes, `gs.destruction` for things that come apart); it has no uvs, so a texture of your own
  has to be mapped by position, as `looks.rock` does; it is drawn as finely far away as close to; and
  nobody climbs it by themselves (`gs.climb` is yours to place).

From [Towns that live](../maker-kit.md#towns-that-live):

- Buildings in code: `gs.models.building({ style: 'cottage' | 'timberframe' | 'keep' })` (daub between oak beams
  under thatch, a timber-framed house under slate, a stone keep with battlements; roofs `thatch` and `battlement`),
  `gs.models.fort({ kind: 'wall' | 'tower' | 'gate' })` and the props `stall`, `well`, `anvil`, `torch`, `lever`,
  `bed`, `hay` and `signboard`. All of them come apart in `gs.destruction.Structure` too.

## In real games

1 game uses it (`node scripts/examples.mjs gs.destruction` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4136 lines):

```js
const { Campaign } = gs.campaign;
const { shatter } = gs.destruction;
// …
      tower.down = true; const pieces = [];
      for (const m of [...tower.g.children]) { m.updateMatrixWorld(true); const ps = shatter(m, { pieces: 5, at: { x, y: y + 2, z }, inside: WD.M.wood
```
