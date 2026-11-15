# gs.juice

Particles, shake, pop-ups, flash, hit-stop and tweens by hand; Timeline for sequences.

`gs.juice`: `Juice` (particles, shake, pop-ups, flash, hit-stop, tweens), `Timeline` + `stagger` (anime.js; lazy), `ease`, `lerp`, `approach`, `pulse`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`JuicePart`, line 487), where every option and field is described.

- `Juice: typeof Juice` (:488)
  - `constructor(o?: { pixel?: boolean; max?: number; font?: string; size?: number; color?: string })` (:472)
  - `burst(x: number, y: number, o?: BurstOpts): this` (:473)
  - `emit(x: number, y: number, vx: number, vy: number, o?: BurstOpts): this` (:474)
  - `shake(amount: number): this` (:475)
  - `pop(x: number, y: number, text: string, o?: { color?: string; size?: number }): this` (:476)
  - `tween(obj: object, props: object, dur: number, ease?: (t: number) => number, delay?: number): Loose` (:477)
  - `flash(color?: string, a?: number, dur?: number): this` (:478)
  - `freeze(sec?: number): this` Hit-stop: freeze the action for a moment. (:480)
  - `readonly frozen: boolean` (:481)
  - `update(dt: number): void` (:482)
  - `begin(c: Ctx): void` (:483)
  - `end(c: Ctx, W?: number, H?: number): void` (:484)
  - `clear(): void` (:485)
- `Particles: Loose` (:489)
- `Popups: Loose` (:489)
- `Shake: Loose` (:489)
- `Tweens: Loose` (:489)
- `ease: Record<string, (t: number) => number>` (:490)
- `lerp(a: number, b: number, t: number): number` (:491)
- `approach(cur: number, target: number, rate: number, dt: number): number` Smoothly approach target (frame-rate independent). (:493)
- `pulse(t: number, period?: number): number` (:494)
- `Timeline: new (o?: { loop?: boolean | number; alternate?: boolean; ease?: string | ((t: number) => number); duration?: number }) => Timeline` Steps in order, together and staggered (anime.js, lazy: make it in make() or reset()). (:496)
  - `to(targets: object | object[], params: { duration?: number; delay?: number | Loose; ease?: string | ((t: number) => number); [k: string]: Loose }, position?: number | …` (:501)
  - `call(fn: () => void, position?: number | string): this` (:502)
  - `label(name: string, position?: number | string): this` (:503)
  - `update(dt: number): this` (:504)
  - `play(): this` (:504)
  - `pause(): this` (:504)
  - `seek(t: number): this` (:504)
  - `restart(): this` (:504)
  - `readonly duration: number` (:505)
  - `readonly done: boolean` (:505)
  - `time: number` (:505)
  - `speed: number` (:505)
  - `playing: boolean` (:505)
- `stagger(each: number, o?: { from?: 'first' | 'center' | 'last' | number; start?: number; [k: string]: Loose }): Loose` A delay that grows along a list of targets: stagger(.1). (:498)

## From the maker kit

From [Juice](../maker-kit.md#juice):

`const { Juice, ease, lerp, approach, pulse, Tweens, Particles, Shake, Popups } = gs.juice;`

The `Juice` object bundles the lot. Use `new Juice({ pixel: true })` in Pocket, Color and Advance
games so effects snap to whole pixels.

```js
const fx = new Juice();
reset()    { fx.clear(); }
update(dt) { fx.update(dt); if (fx.frozen) return; /* your game logic */ }
draw(c)    { /* background */ fx.begin(c); /* the world */ fx.end(c, W, H); /* HUD */ }
// when something happens:
fx.burst(x, y, { n: 16, speed: 140, color: ['#ff0', '#f80'], gravity: 300 });
fx.shake(6);                    // about 6 units of shake, fades by itself
fx.pop(x, y, '+10', { color: '#ffd23f' });
fx.flash('#ffffff', .3);        // full-screen flash
fx.freeze(.06);                 // hit-stop: the action pauses for a moment (check fx.frozen)
fx.tween(card, { x: 200, s: 1 }, .4, ease.outBack).then(() => {});
```

- **Particles** `burst(x, y, opts)`: `n`, `speed`, `spread`, `angle` + `arc` (a cone), `life`, `size`,
  `shrink`, `gravity`, `drag`, `color` (one or a list), `shape` (`'circle'`, `'square'`, `'spark'`),
  `glow`. `emit(x, y, vx, vy, opts)` adds one (trails, smoke).
- **Easing**: `ease.linear`, `inQuad`, `outQuad`, `inOutQuad`, `inCubic`, `outCubic`,
  `inOutCubic`, `inBack`, `outBack` (pops), `outElastic` (springy), `outBounce`, `inOutSine`.
- **Tweens**: `fx.tween(obj, props, seconds, easing, delay)` animates any numbers on any object.
- `approach(cur, target, rate, dt)` follows a target smoothly at any frame rate (cameras, needles).
  `pulse(t, period)` is a smooth 0..1 wave for glowing "tap here" prompts.
- In 3D games, draw `fx.begin(c); v.render(c, W, H); fx.end(c, W, H);` so the shake moves the 3D
  frame too. For 3D sparks use the 3D kit's own particles.

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Timelines** (`gs.juice.Timeline`, anime.js; loads on first use, so make it in `make()` or `reset()`):
steps one after another, together or staggered, in seconds and driven by your `dt` so they pause
with the game. `new Timeline({ ease: 'outBack' }).to(title, { y: 120, duration: .5 }).to(stars, { s: 1, duration: .3, delay: stagger(.1) }, '+=.1').call(fn, .6)`,
then `tl.update(dt)`; `done`, `seek()`, `pause()`, `speed`, `loop: true`. For a single number, `Tweens` is still the lightest.

## In real games

21 games use it (`node scripts/examples.mjs gs.juice` lists them). The shortest:

`src/games/buzz-wire.js` (Buzz Wire, Casual · Skill, 84 lines):

```js
const { clamp } = gs.util;
const { approach } = gs.juice;
// …
      dist += speed * dt;
      if (target != null) x = approach(x, target, 18, dt);
```

`src/games/whistle-bird.js` (Whistle Bird, Casual · Voice, 106 lines):

```js
const { clamp, rnd } = gs.util;
const { approach } = gs.juice;
// …
      if (!started) { bird.y = H / 2 + Math.sin(t * 3) * 10; return; }
      if (want != null) { bird.y = approach(bird.y, want, 380, dt); bird.vy = 0; flap += dt * 14; }
```
