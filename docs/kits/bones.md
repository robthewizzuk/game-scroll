# gs.bones

2D bone characters: poses, blends, clips, IK, wobble.

`gs.bones.Rig`: 2D bone characters (`bone`, `pose`, `blend`, `clip`/`play`, `reach` IK, `look`, `wobble`, `kick`, `draw`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BonesPart`, line 1633), where every option and field is described.

- `Rig: typeof Rig` (:1633)
  - `constructor(o?: { x?: number; y?: number; scale?: number; flip?: boolean })` (:1620)
  - `x: number` (:1621)
  - `y: number` (:1621)
  - `scale: number` (:1621)
  - `flip: boolean` (:1621)
  - `playing: string | null` (:1621)
  - `bone(name: string, o?: { parent?: string; at?: number; len?: number; angle?: number; z?: number; wobble?: { stiff?: number; damp?: number }; min?: number; max?: number…` (:1622)
  - `get(name: string): Bone | undefined` (:1623)
  - `pose(angles: Record<string, number>, o?: { rest?: boolean }): this` (:1624)
  - `snapshot(): Record<string, number>` (:1624)
  - `blend(a: Record<string, number>, b: Record<string, number>, t: number): this` (:1625)
  - `clip(name: string, c: { len: number; loop?: boolean; keys: Record<string, [number, number][]>; ease?: (t: number) => number; events?: [number, string][] }): this` (:1626)
  - `play(name: string, o?: { fade?: number; speed?: number; from?: number }): this` (:1627)
  - `stop(): this` (:1627)
  - `on(ev: string, fn: (rig: Rig, clip?: string) => void): this` (:1627)
  - `update(dt: number): this` (:1628)
  - `solve(dt?: number): this` (:1628)
  - `world(name: string): Bone['w'] | null` (:1628)
  - `kick(name: string, amount?: number): this` (:1628)
  - `reach(upper: string, lower: string, tx: number, ty: number, o?: { bend?: 1 | -1; weight?: number }): boolean` (:1629)
  - `look(name: string, tx: number, ty: number, weight?: number): this` (:1630)
  - `draw(c: Ctx, fn: (c: Ctx, bone: Bone, w: Bone['w']) => void): this` (:1631)

## From the maker kit

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**2D bone characters** (`gs.bones.Rig`): cut-out figures of parts that hang off each other. `bone()`
adds parts (with `wobble` for ears, tails and hair that lag and swing), `pose()` and `blend()` set
angles, `clip()` + `play()` run keyframes with events (`on('step')`), `reach(upper, lower, x, y)` is
two-bone IK (a hand on a ledge, a foot on the ground), `look()` turns a head, `kick()` jolts a wobbly
part, and `draw(c, fn)` calls you for each part already moved and turned into place.

## In real games

No game uses `gs.bones` yet: the examples above are what there is.
