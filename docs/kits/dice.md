# gs.dice

Dice rolls in dice notation, odds, 2D and 3D dice.

`gs.dice` (`roll('4d6kh3')`, `odds`, `Dice`, `Dice3D`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`DicePart`, line 5547), where every option and field is described.

- `roll(text: string, random?: number | (() => number) | null): { total: number; rolls: number[][]; kept: number[][]; text: string }` (:5548)
- `odds(count: number, sides: number): Record<number, number>` (:5549)
- `Dice: new (count?: number, o?: { sides?: number; time?: number; seed?: number | null }) => On<Loose> & { values: number[]; shown: number[]; held: boolean[]; readonly s…` (:5550)
- `FACES: Record<number, P3>` (:5554)
- `faceUp(q: { x: number; y: number; z: number; w: number }): number` (:5554)
- `Dice3D: new (world: Loose, meshes?: number | Loose[], o?: { size?: number; bounce?: number; friction?: number; density?: number; seed?: number | null }) => On<Loose> &…` (:5555)

## From the maker kit

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Dice** (`gs.dice`): `roll('4d6kh3')` reads dice notation (keep highest or lowest, `!` explodes, `+`/`-`),
`odds(2, 6)` gives every total's chance. `Dice(5)` tumbles for a moment then lands on the result
(`hold(i)` keeps dice back for dice-poker games). `Dice3D(world, meshes)` throws real cubes in
`gs.physics3d` and reads which face ends up on top.

## In real games

No game uses `gs.dice` yet: the examples above are what there is.
