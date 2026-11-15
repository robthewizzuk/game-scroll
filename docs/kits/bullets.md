# gs.bullets

Bullet patterns: thousands of bullets in arrays, grazes, emitters.

`gs.bullets` (`Bullets` thousands in arrays, hit + graze, `Emitter` ring/spread/spiral/burst)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BulletsPart`, line 3197), where every option and field is described.

- `Bullets: new (o?: { max?: number; w?: number; h?: number; margin?: number }) => Bullets` (:3198)
  - `max: number` (:3183)
  - `w: number` (:3183)
  - `h: number` (:3183)
  - `margin: number` (:3183)
  - `n: number` (:3183)
  - `readonly count: number` (:3183)
  - `target: { x: number; y: number } | null` (:3183)
  - `x: Float32Array` (:3184)
  - `y: Float32Array` (:3184)
  - `sp: Float32Array` (:3184)
  - `an: Float32Array` (:3184)
  - `kind: Uint8Array` (:3184)
  - `fire(x: number, y: number, speed: number, angle: number, o?: BulletOpts): number` (:3185)
  - `kill(i: number): void` (:3185)
  - `update(dt: number, target?: { x: number; y: number } | null): void` (:3185)
  - `each(fn: (x: number, y: number, kind: number, angle: number, i: number) => void): void` (:3186)
  - `hit(x: number, y: number, r?: number, graze?: number, size?: (kind: number) => number): { hit: number; grazed: number; x: number; y: number }` (:3187)
  - `clear(fn?: ((x: number, y: number, kind: number) => void) | null, x?: number, y?: number, r?: number): number` (:3188)
- `Emitter: new (bullets: Bullets, o?: { every?: number; rotate?: number; times?: number; delay?: number; o?: BulletOpts }) => Emitter` (:3199)
  - `every: number` (:3192)
  - `rotate: number` (:3192)
  - `times: number` (:3192)
  - `fired: number` (:3192)
  - `on: boolean` (:3192)
  - `readonly done: boolean` (:3192)
  - `ring(n: number, speed: number, o?: BulletOpts): Emitter` (:3193)
  - `spread(n: number, arc: number, speed: number, aim?: Aim, o?: BulletOpts): Emitter` (:3193)
  - `spiral(arms: number, speed: number, step?: number, o?: BulletOpts): Emitter` (:3193)
  - `burst(n: number, speed: number, aim: Aim, slow?: number, o?: BulletOpts): Emitter` (:3194)
  - `custom(fn: (b: Bullets, x: number, y: number, angle: number, volley: number) => void): Emitter` (:3194)
  - `update(dt: number, x: number, y: number): number` (:3195)
  - `reset(): Emitter` (:3195)

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
