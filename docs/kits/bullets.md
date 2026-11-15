# gs.bullets

Bullet patterns: thousands of bullets in arrays, grazes, emitters.

`gs.bullets` (`Bullets` thousands in arrays, hit + graze, `Emitter` ring/spread/spiral/burst)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BulletsPart`, line 3192), where every option and field is described.

- `Bullets: new (o?: { max?: number; w?: number; h?: number; margin?: number }) => Bullets` (:3193)
  - `max: number` (:3178)
  - `w: number` (:3178)
  - `h: number` (:3178)
  - `margin: number` (:3178)
  - `n: number` (:3178)
  - `readonly count: number` (:3178)
  - `target: { x: number; y: number } | null` (:3178)
  - `x: Float32Array` (:3179)
  - `y: Float32Array` (:3179)
  - `sp: Float32Array` (:3179)
  - `an: Float32Array` (:3179)
  - `kind: Uint8Array` (:3179)
  - `fire(x: number, y: number, speed: number, angle: number, o?: BulletOpts): number` (:3180)
  - `kill(i: number): void` (:3180)
  - `update(dt: number, target?: { x: number; y: number } | null): void` (:3180)
  - `each(fn: (x: number, y: number, kind: number, angle: number, i: number) => void): void` (:3181)
  - `hit(x: number, y: number, r?: number, graze?: number, size?: (kind: number) => number): { hit: number; grazed: number; x: number; y: number }` (:3182)
  - `clear(fn?: ((x: number, y: number, kind: number) => void) | null, x?: number, y?: number, r?: number): number` (:3183)
- `Emitter: new (bullets: Bullets, o?: { every?: number; rotate?: number; times?: number; delay?: number; o?: BulletOpts }) => Emitter` (:3194)
  - `every: number` (:3187)
  - `rotate: number` (:3187)
  - `times: number` (:3187)
  - `fired: number` (:3187)
  - `on: boolean` (:3187)
  - `readonly done: boolean` (:3187)
  - `ring(n: number, speed: number, o?: BulletOpts): Emitter` (:3188)
  - `spread(n: number, arc: number, speed: number, aim?: Aim, o?: BulletOpts): Emitter` (:3188)
  - `spiral(arms: number, speed: number, step?: number, o?: BulletOpts): Emitter` (:3188)
  - `burst(n: number, speed: number, aim: Aim, slow?: number, o?: BulletOpts): Emitter` (:3189)
  - `custom(fn: (b: Bullets, x: number, y: number, angle: number, volley: number) => void): Emitter` (:3189)
  - `update(dt: number, x: number, y: number): number` (:3190)
  - `reset(): Emitter` (:3190)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Bullet patterns** (`gs.bullets`): `Bullets({ max, w, h })` keeps thousands of bullets in flat arrays:
`fire(x, y, speed, angle, { accel, turn, wave, home, kind, life })`, `update(dt, target)`, `each(fn)` to
draw, `hit(x, y, r, graze)` (`{ hit, grazed }`: near misses count once) and `clear(fn, x, y, r)` for
bombs and turning bullets into points. `Emitter(bullets, { every, rotate, times, delay })` fires a
volley built from `ring(n, speed)`, `spread(n, arc, speed, aim)`, `spiral(arms, speed, step)`,
`burst(n, speed, aim)` and `custom(fn)` each time; `update(dt, x, y)` from where the boss is.

## In real games

No game uses `gs.bullets` yet: the examples above are what there is.
