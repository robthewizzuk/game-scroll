# gs.voxels

Voxel worlds: generate, edit, mesh, ray, move through.

`gs.voxels` (3D; lazy): `Voxels({ size })`: `generate({ seed, kind })`, `set`/`get`/`fill`/`sphere`, `update()` meshes changed chunks, `ray`, `move(box, ...)`, `pack`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`VoxelsPart`, line 1198), where every option and field is described.

- `Voxels: new (o?: { size?: [number, number, number]; chunk?: number; scale?: number; shadows?: boolean; worker?: boolean; rough?: number }) => VoxelWorld` (:1199)
  - `readonly w: number` (:1183)
  - `readonly h: number` (:1183)
  - `readonly d: number` (:1183)
  - `readonly scale: number` (:1183)
  - `group: Loose` (:1183)
  - `readonly meshing: number` (:1183)
  - `block(name: string, color: string, o?: { see?: boolean }): number` (:1184)
  - `id(b: string | number): number` (:1184)
  - `get(x: number, y: number, z: number): number` (:1185)
  - `solid(x: number, y: number, z: number): boolean` (:1185)
  - `set(x: number, y: number, z: number, b: string | number): boolean` (:1185)
  - `fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: string | number): this` (:1186)
  - `sphere(cx: number, cy: number, cz: number, r: number, b?: string | number): { changed: number; gone: Record<number, number> }` (:1187)
  - `top(x: number, z: number): number` (:1188)
  - `generate(o?: { seed?: string | number; kind?: 'hills' | 'flat' | 'island' | 'caves'; ground?: number; hills?: number; water?: number; trees?: number; caves?: boolean }…` (:1189)
  - `tree(x: number, y: number, z: number, height?: number): this` (:1190)
  - `update(limit?: number): number` (:1191)
  - `build(): this` (:1191)
  - `ray(from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, far?: number, o?: { solidOnly?: boolean }): { x: number; y: number; z: number;…` (:1192)
  - `move(box: { x: number; y: number; z: number; w?: number; h?: number; d?: number }, dx: number, dy: number, dz: number, o?: { step?: number }): { x: boolean; y: boolean…` (:1193)
  - `pack(): string` (:1194)
  - `unpack(text: string): this` (:1194)
  - `dispose(): void` (:1194)
  - `physics(world: Loose | null): this` The blocks solid in a gs.physics3d World3D (a chunk's ground made again when it changes; water and glass stay open); null takes them out. (:1196)
- `BLOCKS: Readonly<Record<'air' | 'grass' | 'dirt' | 'stone' | 'sand' | 'water' | 'wood' | 'leaves' | 'snow' | 'brick' | 'glass' | 'lava' | 'gold' | 'coal' | 'plank' | '…` (:1200)

## From the maker kit

From [Voxel worlds](../maker-kit.md#voxel-worlds):

`gs.voxels.Voxels` (3D, lazy): an editable world of blocks, drawn with three's standard material so it
looks the same on WebGL and WebGPU and takes your scene's lights and shadows.

```js
world = new Voxels({ size: [64, 32, 64] }).generate({ seed: 'my-game', kind: 'hills' });
view.scene.add(world.group);
update(dt) { world.update(); me.vy -= 25 * dt; if (world.move(me, vx * dt, me.vy * dt, vz * dt, { step: 1 }).ground) me.vy = 0; }
```

- Blocks: `get`, `set(x, y, z, BLOCKS.stone)`, `solid`, `fill(box)`, `sphere(x, y, z, r)` (digs or
  blasts; says which blocks went), `top(x, z)`, `tree(x, y, z)`, and your own types with
  `world.block('crystal', '#a0f', { see: true })`.
- Worlds: `generate({ seed, kind: 'hills' | 'island' | 'caves' | 'flat', ground, hills, water, trees })`.
- Drawing: changed chunks are meshed again in `update()` (greedy meshing with soft corner shading, in a
  background worker), or all at once with `build()`.
- Playing: `ray(eye, dir, far)` gives the block you're looking at and the face (`nx`, `ny`, `nz`: add
  them to place a block on it); `move(box, dx, dy, dz, { step })` walks a box through the blocks
  (`ground`, `inWater`, and which axes were stopped).
- `pack()` / `unpack()`: the world as a short string (runs of the same block).

From [Cliffs, caves and overhangs](../maker-kit.md#cliffs-caves-and-overhangs):

- Not there: the rock cannot be dug or broken while playing (it is made once: `gs.voxels` is for ground
  that changes, `gs.destruction` for things that come apart); it has no uvs, so a texture of your own
  has to be mapped by position, as `looks.rock` does; it is drawn as finely far away as close to; and
  nobody climbs it by themselves (`gs.climb` is yours to place).

## In real games

No game uses `gs.voxels` yet: the examples above are what there is.
