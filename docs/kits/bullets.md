# gs.bullets

Bullet patterns: thousands of bullets in arrays, grazes, emitters.

`gs.bullets` (`Bullets` thousands in arrays, hit + graze, `Emitter` ring/spread/spiral/burst)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BulletsPart`, line 3266), where every option and field is described.

- `Bullets: new (o?: { max?: number; w?: number; h?: number; margin?: number }) => Bullets` (:3267)
  - `max: number` (:3252)
  - `w: number` (:3252)
  - `h: number` (:3252)
  - `margin: number` (:3252)
  - `n: number` (:3252)
  - `readonly count: number` (:3252)
  - `target: { x: number; y: number } | null` (:3252)
  - `x: Float32Array` (:3253)
  - `y: Float32Array` (:3253)
  - `sp: Float32Array` (:3253)
  - `an: Float32Array` (:3253)
  - `kind: Uint8Array` (:3253)
  - `fire(x: number, y: number, speed: number, angle: number, o?: BulletOpts): number` (:3254)
  - `kill(i: number): void` (:3254)
  - `update(dt: number, target?: { x: number; y: number } | null): void` (:3254)
  - `each(fn: (x: number, y: number, kind: number, angle: number, i: number) => void): void` (:3255)
  - `hit(x: number, y: number, r?: number, graze?: number, size?: (kind: number) => number): { hit: number; grazed: number; x: number; y: number }` (:3256)
  - `clear(fn?: ((x: number, y: number, kind: number) => void) | null, x?: number, y?: number, r?: number): number` (:3257)
- `Emitter: new (bullets: Bullets, o?: { every?: number; rotate?: number; times?: number; delay?: number; o?: BulletOpts }) => Emitter` (:3268)
  - `every: number` (:3261)
  - `rotate: number` (:3261)
  - `times: number` (:3261)
  - `fired: number` (:3261)
  - `on: boolean` (:3261)
  - `readonly done: boolean` (:3261)
  - `ring(n: number, speed: number, o?: BulletOpts): Emitter` (:3262)
  - `spread(n: number, arc: number, speed: number, aim?: Aim, o?: BulletOpts): Emitter` (:3262)
  - `spiral(arms: number, speed: number, step?: number, o?: BulletOpts): Emitter` (:3262)
  - `burst(n: number, speed: number, aim: Aim, slow?: number, o?: BulletOpts): Emitter` (:3263)
  - `custom(fn: (b: Bullets, x: number, y: number, angle: number, volley: number) => void): Emitter` (:3263)
  - `update(dt: number, x: number, y: number): number` (:3264)
  - `reset(): Emitter` (:3264)

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
