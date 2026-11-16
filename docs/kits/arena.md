# gs.arena

Car football: an arena, a ball car, chasing the ball.

`gs.arena` (`Arena`, `BallCar`, `chaseBall`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ArenaPart`, line 3825), where every option and field is described.

- `Arena: new (world: Loose, o?: { w?: number; l?: number; h?: number; curve?: number; segments?: number; goal?: { w?: number; h?: number; d?: number }; ball?: Loose; bal…` (:3826)
- `BallCar: new (world: Loose, mesh: Loose, o?: { team?: number; at?: P3; wheels?: Loose[]; power?: number; steer?: number; top?: number; boostTop?: number; maxBoost?: nu…` (:3831)
  - `team: number` (:3821)
  - `boost: number` (:3821)
  - `maxBoost: number` (:3821)
  - `readonly pos: P3` (:3821)
  - `readonly vel: P3` (:3821)
  - `readonly rot: Loose` (:3821)
  - `readonly speed: number` (:3821)
  - `readonly grounded: boolean` (:3821)
  - `readonly boosting: boolean` (:3821)
  - `readonly forward: P3` (:3822)
  - `readonly up: P3` (:3822)
  - `readonly right: P3` (:3822)
  - `readonly upsideDown: boolean` (:3822)
  - `control(i: { throttle?: number; steer?: number; brake?: boolean; boost?: boolean; jump?: boolean; pitch?: number; yaw?: number; roll?: number }): BallCar` (:3823)
  - `update(dt: number): BallCar` (:3823)
  - `spawn(s: P3 & { facing?: number }): BallCar` (:3823)
  - `rightUp(): BallCar` (:3823)
  - `remove(): void` (:3823)
- `chaseBall(car: BallCar, arena: Loose, o?: { skill?: Skill }): { throttle: number; steer: number; boost: boolean; jump: boolean }` (:3832)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Ball games with cars** (`gs.arena`, Rapier through `gs.physics3d`): `Arena(world, { w, l, goal, ball })`
builds the walls, curved ramps, ceiling and goals, keeps the score and clock (with overtime), adds
punch to touches, has boost pads, `predict()`s the ball's path for a landing marker (the physics world is
asked where the ball next meets the real floor, walls, ramps and goals, once a frame however many ask), and keeps a
few seconds of replay (`playback(t)`). `BallCar` is a real suspension car with boost, jump, a second
jump that flips you the way you push, and air control. `chaseBall(car, arena)` is a simple
opponent to start from.

## In real games

No game uses `gs.arena` yet: the examples above are what there is.
