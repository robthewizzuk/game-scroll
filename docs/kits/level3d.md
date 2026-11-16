# gs.level3d

3D levels from text maps.

`gs.level3d.Level3D(text)`

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Level3dPart`, line 3451), where every option and field is described.

- `Level3D: new (text: string, o?: { size?: number; wall?: number; step?: number; floor?: number; water?: number; look?: Record<string, Loose> | ((ch: string) => Loose); …` (:3451)
  - `grid: string[]` (:3445)
  - `rows: number` (:3445)
  - `cols: number` (:3445)
  - `size: number` (:3445)
  - `group: Loose` (:3445)
  - `marks: Record<string, Level3DCell[]>` (:3445)
  - `blocks: Loose[]` (:3445)
  - `ch(col: number, row: number): string` (:3446)
  - `cell(col: number, row: number): Level3DCell` (:3446)
  - `at(x: number, z: number): { col: number; row: number; ch: string }` (:3446)
  - `height(x: number, z: number): number | null` (:3447)
  - `walkable(col: number, row: number): boolean` (:3447)
  - `find(ch: string): Level3DCell[]` (:3447)
  - `solid(world: Loose, o?: Loose): Loose[]` (:3448)
  - `readonly blocked: (col: number, row: number) => boolean` (:3448)
  - `dispose(): void` (:3448)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**3D levels from text** (`gs.level3d.Level3D(text, { size, wall, look })`): the same text maps in 3D.
`#` walls, `.` floor, `1`-`9` raised floors, `~` water, `=` low walls, spaces as holes, letters as
marks (`find('P')`). Rows of the same block merge, so a big map is a few meshes. `level.solid(world)`
makes it solid in `gs.physics3d`; `height(x, z)` gives the floor height for a `Kart`.

## In real games

No game uses `gs.level3d` yet: the examples above are what there is.
