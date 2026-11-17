# gs.bones

2D bone characters: poses, blends, clips, IK, wobble.

`gs.bones.Rig`: 2D bone characters (`bone`, `pose`, `blend`, `clip`/`play`, `reach` IK, `look`, `wobble`, `kick`, `draw`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BonesPart`, line 1635), where every option and field is described.

- `Rig: typeof Rig` (:1635)
  - `constructor(o?: { x?: number; y?: number; scale?: number; flip?: boolean })` (:1622)
  - `x: number` (:1623)
  - `y: number` (:1623)
  - `scale: number` (:1623)
  - `flip: boolean` (:1623)
  - `playing: string | null` (:1623)
  - `bone(name: string, o?: { parent?: string; at?: number; len?: number; angle?: number; z?: number; wobble?: { stiff?: number; damp?: number }; min?: number; max?: number…` (:1624)
  - `get(name: string): Bone | undefined` (:1625)
  - `pose(angles: Record<string, number>, o?: { rest?: boolean }): this` (:1626)
  - `snapshot(): Record<string, number>` (:1626)
  - `blend(a: Record<string, number>, b: Record<string, number>, t: number): this` (:1627)
  - `clip(name: string, c: { len: number; loop?: boolean; keys: Record<string, [number, number][]>; ease?: (t: number) => number; events?: [number, string][] }): this` (:1628)
  - `play(name: string, o?: { fade?: number; speed?: number; from?: number }): this` (:1629)
  - `stop(): this` (:1629)
  - `on(ev: string, fn: (rig: Rig, clip?: string) => void): this` (:1629)
  - `update(dt: number): this` (:1630)
  - `solve(dt?: number): this` (:1630)
  - `world(name: string): Bone['w'] | null` (:1630)
  - `kick(name: string, amount?: number): this` (:1630)
  - `reach(upper: string, lower: string, tx: number, ty: number, o?: { bend?: 1 | -1; weight?: number }): boolean` (:1631)
  - `look(name: string, tx: number, ty: number, weight?: number): this` (:1632)
  - `draw(c: Ctx, fn: (c: Ctx, bone: Bone, w: Bone['w']) => void): this` (:1633)

## From the maker kit

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**2D bone characters** (`gs.bones.Rig`): cut-out figures of parts that hang off each other. `bone()`
adds parts (with `wobble` for ears, tails and hair that lag and swing), `pose()` and `blend()` set
angles, `clip()` + `play()` run keyframes with events (`on('step')`), `reach(upper, lower, x, y)` is
two-bone IK (a hand on a ledge, a foot on the ground), `look()` turns a head, `kick()` jolts a wobbly
part, and `draw(c, fn)` calls you for each part already moved and turned into place.

## In real games

No game uses `gs.bones` yet: the examples above are what there is.
