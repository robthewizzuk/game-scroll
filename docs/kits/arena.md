# gs.arena

Car football: an arena, a ball car, chasing the ball.

`gs.arena` (`Arena`, `BallCar`, `chaseBall`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ArenaPart`, line 3813), where every option and field is described.

- `Arena: new (world: Loose, o?: { w?: number; l?: number; h?: number; curve?: number; segments?: number; goal?: { w?: number; h?: number; d?: number }; ball?: Loose; bal…` (:3814)
- `BallCar: new (world: Loose, mesh: Loose, o?: { team?: number; at?: P3; wheels?: Loose[]; power?: number; steer?: number; top?: number; boostTop?: number; maxBoost?: nu…` (:3819)
  - `team: number` (:3809)
  - `boost: number` (:3809)
  - `maxBoost: number` (:3809)
  - `readonly pos: P3` (:3809)
  - `readonly vel: P3` (:3809)
  - `readonly rot: Loose` (:3809)
  - `readonly speed: number` (:3809)
  - `readonly grounded: boolean` (:3809)
  - `readonly boosting: boolean` (:3809)
  - `readonly forward: P3` (:3810)
  - `readonly up: P3` (:3810)
  - `readonly right: P3` (:3810)
  - `readonly upsideDown: boolean` (:3810)
  - `control(i: { throttle?: number; steer?: number; brake?: boolean; boost?: boolean; jump?: boolean; pitch?: number; yaw?: number; roll?: number }): BallCar` (:3811)
  - `update(dt: number): BallCar` (:3811)
  - `spawn(s: P3 & { facing?: number }): BallCar` (:3811)
  - `rightUp(): BallCar` (:3811)
  - `remove(): void` (:3811)
- `chaseBall(car: BallCar, arena: Loose, o?: { skill?: Skill }): { throttle: number; steer: number; boost: boolean; jump: boolean }` (:3820)

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
