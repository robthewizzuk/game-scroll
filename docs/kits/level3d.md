# gs.level3d

3D levels from text maps.

`gs.level3d.Level3D(text)`

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Level3dPart`, line 3379), where every option and field is described.

- `Level3D: new (text: string, o?: { size?: number; wall?: number; step?: number; floor?: number; water?: number; look?: Record<string, Loose> | ((ch: string) => Loose); …` (:3379)
  - `grid: string[]` (:3373)
  - `rows: number` (:3373)
  - `cols: number` (:3373)
  - `size: number` (:3373)
  - `group: Loose` (:3373)
  - `marks: Record<string, Level3DCell[]>` (:3373)
  - `blocks: Loose[]` (:3373)
  - `ch(col: number, row: number): string` (:3374)
  - `cell(col: number, row: number): Level3DCell` (:3374)
  - `at(x: number, z: number): { col: number; row: number; ch: string }` (:3374)
  - `height(x: number, z: number): number | null` (:3375)
  - `walkable(col: number, row: number): boolean` (:3375)
  - `find(ch: string): Level3DCell[]` (:3375)
  - `solid(world: Loose, o?: Loose): Loose[]` (:3376)
  - `readonly blocked: (col: number, row: number) => boolean` (:3376)
  - `dispose(): void` (:3376)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**3D levels from text** (`gs.level3d.Level3D(text, { size, wall, look })`): the same text maps in 3D.
`#` walls, `.` floor, `1`-`9` raised floors, `~` water, `=` low walls, spaces as holes, letters as
marks (`find('P')`). Rows of the same block merge, so a big map is a few meshes. `level.solid(world)`
makes it solid in `gs.physics3d`; `height(x, z)` gives the floor height for a `Kart`.

## In real games

No game uses `gs.level3d` yet: the examples above are what there is.
