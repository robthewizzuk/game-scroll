# gs.bullets

Bullet patterns: thousands of bullets in arrays, grazes, emitters.

`gs.bullets` (`Bullets` thousands in arrays, hit + graze, `Emitter` ring/spread/spiral/burst)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BulletsPart`, line 3264), where every option and field is described.

- `Bullets: new (o?: { max?: number; w?: number; h?: number; margin?: number }) => Bullets` (:3265)
  - `max: number` (:3250)
  - `w: number` (:3250)
  - `h: number` (:3250)
  - `margin: number` (:3250)
  - `n: number` (:3250)
  - `readonly count: number` (:3250)
  - `target: { x: number; y: number } | null` (:3250)
  - `x: Float32Array` (:3251)
  - `y: Float32Array` (:3251)
  - `sp: Float32Array` (:3251)
  - `an: Float32Array` (:3251)
  - `kind: Uint8Array` (:3251)
  - `fire(x: number, y: number, speed: number, angle: number, o?: BulletOpts): number` (:3252)
  - `kill(i: number): void` (:3252)
  - `update(dt: number, target?: { x: number; y: number } | null): void` (:3252)
  - `each(fn: (x: number, y: number, kind: number, angle: number, i: number) => void): void` (:3253)
  - `hit(x: number, y: number, r?: number, graze?: number, size?: (kind: number) => number): { hit: number; grazed: number; x: number; y: number }` (:3254)
  - `clear(fn?: ((x: number, y: number, kind: number) => void) | null, x?: number, y?: number, r?: number): number` (:3255)
- `Emitter: new (bullets: Bullets, o?: { every?: number; rotate?: number; times?: number; delay?: number; o?: BulletOpts }) => Emitter` (:3266)
  - `every: number` (:3259)
  - `rotate: number` (:3259)
  - `times: number` (:3259)
  - `fired: number` (:3259)
  - `on: boolean` (:3259)
  - `readonly done: boolean` (:3259)
  - `ring(n: number, speed: number, o?: BulletOpts): Emitter` (:3260)
  - `spread(n: number, arc: number, speed: number, aim?: Aim, o?: BulletOpts): Emitter` (:3260)
  - `spiral(arms: number, speed: number, step?: number, o?: BulletOpts): Emitter` (:3260)
  - `burst(n: number, speed: number, aim: Aim, slow?: number, o?: BulletOpts): Emitter` (:3261)
  - `custom(fn: (b: Bullets, x: number, y: number, angle: number, volley: number) => void): Emitter` (:3261)
  - `update(dt: number, x: number, y: number): number` (:3262)
  - `reset(): Emitter` (:3262)

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
