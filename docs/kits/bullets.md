# gs.bullets

Bullet patterns: thousands of bullets in arrays, grazes, emitters.

`gs.bullets` (`Bullets` thousands in arrays, hit + graze, `Emitter` ring/spread/spiral/burst)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BulletsPart`, line 3214), where every option and field is described.

- `Bullets: new (o?: { max?: number; w?: number; h?: number; margin?: number }) => Bullets` (:3215)
  - `max: number` (:3200)
  - `w: number` (:3200)
  - `h: number` (:3200)
  - `margin: number` (:3200)
  - `n: number` (:3200)
  - `readonly count: number` (:3200)
  - `target: { x: number; y: number } | null` (:3200)
  - `x: Float32Array` (:3201)
  - `y: Float32Array` (:3201)
  - `sp: Float32Array` (:3201)
  - `an: Float32Array` (:3201)
  - `kind: Uint8Array` (:3201)
  - `fire(x: number, y: number, speed: number, angle: number, o?: BulletOpts): number` (:3202)
  - `kill(i: number): void` (:3202)
  - `update(dt: number, target?: { x: number; y: number } | null): void` (:3202)
  - `each(fn: (x: number, y: number, kind: number, angle: number, i: number) => void): void` (:3203)
  - `hit(x: number, y: number, r?: number, graze?: number, size?: (kind: number) => number): { hit: number; grazed: number; x: number; y: number }` (:3204)
  - `clear(fn?: ((x: number, y: number, kind: number) => void) | null, x?: number, y?: number, r?: number): number` (:3205)
- `Emitter: new (bullets: Bullets, o?: { every?: number; rotate?: number; times?: number; delay?: number; o?: BulletOpts }) => Emitter` (:3216)
  - `every: number` (:3209)
  - `rotate: number` (:3209)
  - `times: number` (:3209)
  - `fired: number` (:3209)
  - `on: boolean` (:3209)
  - `readonly done: boolean` (:3209)
  - `ring(n: number, speed: number, o?: BulletOpts): Emitter` (:3210)
  - `spread(n: number, arc: number, speed: number, aim?: Aim, o?: BulletOpts): Emitter` (:3210)
  - `spiral(arms: number, speed: number, step?: number, o?: BulletOpts): Emitter` (:3210)
  - `burst(n: number, speed: number, aim: Aim, slow?: number, o?: BulletOpts): Emitter` (:3211)
  - `custom(fn: (b: Bullets, x: number, y: number, angle: number, volley: number) => void): Emitter` (:3211)
  - `update(dt: number, x: number, y: number): number` (:3212)
  - `reset(): Emitter` (:3212)

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
