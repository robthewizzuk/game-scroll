# gs.rts

Strategy controls: selecting, formations, flow fields, building grids, tower targets.

`gs.rts` (`Select` tap/box/double tap, `formation`, `FlowField`, `BuildGrid`, tower `target`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`RtsPart`, line 3088), where every option and field is described.

- `Select: new <T extends XY = XY>(things: () => T[], o?: { radius?: number; drag?: number; kind?: (t: T) => Loose; doubleTap?: number }) => Select<T>` (:3089)
- `formation<T extends XY>(units: T[], x: number, y: number, o?: { shape?: 'grid' | 'line' | 'wedge' | 'circle'; gap?: number; facing?: number | null }): [T, { x: number;…` (:3090)
- `FlowField: new (w: number, h: number, size: number, cost?: (tx: number, ty: number) => number) => FlowField` (:3091)
  - `w: number` (:3086)
  - `h: number` (:3086)
  - `size: number` (:3086)
  - `dist: Float32Array` (:3086)
  - `tile(x: number, y: number): { tx: number; ty: number }` (:3086)
  - `to(tx: number, ty: number, force?: boolean): FlowField` (:3086)
  - `at(tx: number, ty: number): number` (:3086)
  - `dir(x: number, y: number): { x: number; y: number }` (:3086)
- `BuildGrid: new (w: number, h: number, size: number, o?: { blocked?: (tx: number, ty: number) => boolean }) => BuildGrid` (:3092)
  - `w: number` (:3087)
  - `h: number` (:3087)
  - `size: number` (:3087)
  - `things: Set<Loose>` (:3087)
  - `at(tx: number, ty: number): Loose` (:3087)
  - `free(tx: number, ty: number): boolean` (:3087)
  - `fits(tx: number, ty: number, fw?: number, fh?: number): boolean` (:3087)
  - `snap(x: number, y: number, fw?: number, fh?: number): { tx: number; ty: number; x: number; y: number; ok: boolean }` (:3087)
  - `place(thing: Loose, tx: number, ty: number, fw?: number, fh?: number): boolean` (:3087)
  - `remove(thing: Loose): BuildGrid` (:3087)
- `target<T extends XY>(from: XY, things: Iterable<T>, o?: { range?: number; by?: 'first' | 'last' | 'near' | 'far' | 'strong' | 'weak'; progress?: (t: T) => number; hp?:…` (:3093)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Strategy controls** (`gs.rts`): `Select(() => things, { radius })` with `down/move/up` picks by tap or
a dragged box (`sel.box` to draw it), a double tap picks every one of that `kind`, and `up` returns
false for a tap on nothing (that's an order). `formation(units, x, y, { shape: 'grid' | 'line' | 'wedge'
| 'circle', gap })` gives each unit its place. `FlowField(w, h, size, cost).to(tx, ty)` then `dir(x, y)`
steers any number of units round walls. `BuildGrid(w, h, size)`: `snap` a dragged building to tiles,
`fits`, `place`, `remove`, `at`. `target(tower, enemies, { range, by: 'first' | 'last' | 'near' |
'strong' | 'weak' })` picks who a tower shoots.

## In real games

No game uses `gs.rts` yet: the examples above are what there is.
