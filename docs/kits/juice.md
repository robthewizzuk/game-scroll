# gs.juice

Particles, shake, pop-ups, flash, hit-stop and tweens by hand; Timeline for sequences.

`gs.juice`: `Juice` (particles, shake, pop-ups, flash, hit-stop, tweens), `Timeline` + `stagger` (anime.js; lazy), `ease`, `lerp`, `approach`, `pulse`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`JuicePart`, line 499), where every option and field is described.

- `Juice: typeof Juice` (:500)
  - `constructor(o?: { pixel?: boolean; max?: number; font?: string; size?: number; color?: string })` (:483)
  - `burst(x: number, y: number, o?: BurstOpts): this` (:484)
  - `emit(x: number, y: number, vx: number, vy: number, o?: BurstOpts): this` (:485)
  - `shake(amount: number): this` (:486)
  - `pop(x: number, y: number, text: string, o?: { color?: string; size?: number; font?: string; life?: number; rise?: number }): this` A line of text that pops up and rises: font is a CSS family (the Juice's own by default), life seconds (.9), rise how far it rises (30). (:488)
  - `tween(obj: object, props: object, dur: number, ease?: (t: number) => number, delay?: number): Loose` (:489)
  - `flash(color?: string, a?: number, dur?: number): this` (:490)
  - `freeze(sec?: number): this` Hit-stop: freeze the action for a moment. (:492)
  - `readonly frozen: boolean` (:493)
  - `update(dt: number): void` (:494)
  - `begin(c: Ctx): void` (:495)
  - `end(c: Ctx, W?: number, H?: number): void` (:496)
  - `clear(): void` (:497)
- `Particles: Loose` (:501)
- `Popups: Loose` (:501)
- `Shake: Loose` (:501)
- `Tweens: Loose` (:501)
- `ease: Record<string, (t: number) => number>` (:502)
- `lerp(a: number, b: number, t: number): number` (:503)
- `approach(cur: number, target: number, rate: number, dt: number): number` Smoothly approach target (frame-rate independent). (:505)
- `pulse(t: number, period?: number): number` (:506)
- `Timeline: new (o?: { loop?: boolean | number; alternate?: boolean; ease?: string | ((t: number) => number); duration?: number }) => Timeline` Steps in order, together and staggered (anime.js, lazy: make it in make() or reset()). (:508)
  - `to(targets: object | object[], params: { duration?: number; delay?: number | Loose; ease?: string | ((t: number) => number); [k: string]: Loose }, position?: number | …` (:513)
  - `call(fn: () => void, position?: number | string): this` (:514)
  - `label(name: string, position?: number | string): this` (:515)
  - `update(dt: number): this` (:516)
  - `play(): this` (:516)
  - `pause(): this` (:516)
  - `seek(t: number): this` (:516)
  - `restart(): this` (:516)
  - `readonly duration: number` (:517)
  - `readonly done: boolean` (:517)
  - `time: number` (:517)
  - `speed: number` (:517)
  - `playing: boolean` (:517)
- `stagger(each: number, o?: { from?: 'first' | 'center' | 'last' | number; start?: number; [k: string]: Loose }): Loose` A delay that grows along a list of targets: stagger(.1). (:510)

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

40 games use it (`node scripts/examples.mjs gs.juice` lists them). The shortest:

`src/games/bomb-maze.js` (Bomb Maze, Pocket · Action, 73 lines):

```js
const { Feel } = gs.effects;
const { approach } = gs.juice;
// …
      if (p.mv > 0) { p.mv -= dt; } else if (held && dir) { const nx = p.x + dir[0], ny = p.y + dir[1]; if (!blocked(nx, ny)) { p.x = nx; p.y = ny; p.
      const k = Math.max(0, p.mv / .14); p.fx = approach(p.fx, p.x, 19, dt); p.fy = approach(p.fy, p.y, 19, dt);
// …
      for (const cr of critters) {
        cr.mv -= dt; cr.fx = approach(cr.fx, cr.x, 11, dt); cr.fy = approach(cr.fy, cr.y, 11, dt);
```

`src/games/stack.js` (Stack Up, Casual · Timing, 75 lines):

```js
const { Feel } = gs.effects;
const { approach } = gs.juice;
// …
  function phys(dt){
    cam = approach(cam, camT, 6, dt);
```
