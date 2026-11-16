# gs.climb

Ledges, climbing, ropes and swimming.

`gs.climb` (`Ledges`, `Climber`, `Rope`; `Swimmer`: wade, swim, dive with a breath, climb out onto the bank, in the game's Water or Sea)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ClimbPart`, line 3668), where every option and field is described.

- `Ledges: { new (): { list: Loose[]; add(a: P3, b: P3, normal: { x: number; z: number }, o?: Loose): Loose; closest(p: P3, filter?: (l: Loose) => boolean): Loose }; from…` (:3669)
- `Climber: new (ledges: Loose, o?: { height?: number; reach?: number; shimmy?: number; leap?: number; upTime?: number; leapTime?: number; out?: number }) => { state: 'fr…` (:3670)
- `Rope: new (anchor: P3, length?: number, o?: { gravity?: number; pump?: number; damping?: number }) => { anchor: P3; length: number; catch(feet: P3, vel: P3, height?: n…` (:3674)
- `Swimmer: new (o?: { height?: number; breath?: number; speed?: number; fast?: number; dive?: number; wade?: number; deep?: number | null; hurt?: number; climb?: number;…` Swimming: wading in the shallows (slower the deeper), swimming at the surface, treading water, diving under with a breath that runs out, coming up for air, and climbing out onto an edge up to `climb` metres over the… (:3681)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Climbing** (`gs.climb`): `Ledges.fromLevel(level3d)` finds every edge you can hang from (or `add()`
your own). `Climber` grabs a ledge in reach, shimmies, turns corners, climbs up, leaps to the next
handhold the way you push, drops or kicks off. `Rope` is a swing you pump higher. `climber.pos` and
`climber.state` drive your character and its poses.

**Swimming** (`gs.climb`): `Swimmer()` takes the hero into the water the game made (every `gs.outdoors` `Water` and
`Sea` is found by itself; or `water:` a level, a function of x and z, or a `gs.flow` `Streams` whose current carries
them). Call `swim.update(dt, { move, up, down, fast }, hero)` after your own `hero.walk()`: ankle deep nothing changes;
deeper it wades (`swim.slow`: the walk slows to about half by the waist); out of its depth it swims at the surface
(`pose` `'swim'`, the front crawl, or `'tread'` when the stick is let go, shoulders at the surface) with the mover's
gravity off; `down` dives under (`'diveDown'`, `'dive'`, `'diveUp'`) and the breath runs out (`swim.air`, events
`'low'`, `'empty'`; `swim.hurt` is the damage from then on until they come up, gasping); pushing into a bank, a jetty or a
pool's edge up to `climb` metres (.9) over the water pulls them out onto it (`'climbOut'` with `swim.at`). A Water made
with ripples splashes and leaves a wake by itself. Then `rig.play(swim.pose, { at: swim.at })` when there is one and
face `swim.facing`. With no mover, move `{ x, y, z }` feet by `swim.vel`.

From [Cliffs, caves and overhangs](../maker-kit.md#cliffs-caves-and-overhangs):

- Not there: the rock cannot be dug or broken while playing (it is made once: `gs.voxels` is for ground
  that changes, `gs.destruction` for things that come apart); it has no uvs, so a texture of your own
  has to be mapped by position, as `looks.rock` does; it is drawn as finely far away as close to; and
  nobody climbs it by themselves (`gs.climb` is yours to place).

## In real games

No game uses `gs.climb` yet: the examples above are what there is.
