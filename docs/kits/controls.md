# gs.controls

On-screen thumbsticks and buttons, taps, holds, swipes, two-finger gestures, keys.

`gs.controls`: `Stick`, `Button`, `Gestures` (tap, doubleTap, hold, swipe), `TwoFingers` (pinch, twist, pan), `twoThumb(W, H)`, `Keys`, `route()`.

On a games handheld (a ROG Ally, a Steam Deck: the desktop app in Steam's games mode) `Stick` and `Button` aren't drawn:
it has real sticks and buttons, which reach the game through `key()`, so a game with on-screen controls should take keys
too. They show again for a few seconds after a touch, and work under a finger all the while. `onScreen()` says whether
they are drawn now, for a game that draws its own controls.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ControlsPart`, line 574), where every option and field is described.

- `Stick: new (o?: { x?: number; y?: number; r?: number; floating?: boolean; zone?: number[]; dead?: number; axis?: 'both' | 'x' | 'y'; color?: string }) => Control & { x…` Virtual thumbstick: x, y (-1..1), mag, angle, active; r its reach (change it as the screen changes); cx, cy where its ring is (where the finger landed, for a floating one) and kx, ky its knob, for a game that draws… (:576)
  - `wants(x: number, y: number): boolean` (:573)
  - `release(): void` (:573)
  - `down(x: number, y: number, id?: number): boolean` (:573)
  - `move(x: number, y: number, pressed: boolean, id?: number): boolean` (:573)
  - `up(x: number, y: number, id?: number): boolean` (:573)
  - `draw(c: Ctx, o?: Loose): void` (:573)
- `Button: new (o?: { x?: number; y?: number; r?: number; label?: string; zone?: number[]; color?: string }) => Control & { isDown: boolean; readonly heldFor: number; pre…` Round button: isDown, pressed() once per press, released(), heldFor. (:578)
- `Gestures: new (o?: Loose) => Loose` Tap, double tap, hold and swipe. (:580)
- `TwoFingers: new (o?: { zone?: number[]; one?: Loose; minScale?: number; minTurn?: number; pinch?: (scale: number, x: number, y: number) => void; twist?: (angle: number…` Pinch, twist and two-finger pan (one-finger touches go to `one`). (:582)
- `Keys: new () => { key(k: string, isDown: boolean): void; held(k: string): boolean; axis(): XY; clear(): void }` Keyboard state: keys.held('ArrowLeft'), keys.axis(). (:584)
- `route(...controls: Loose[]): { down: Game['down']; move: Game['move']; up: Game['up'] }` Hands each finger to the first control that wants it. (:586)
- `twoThumb(W: number, H: number, o?: { right?: 'stick' | string[]; r?: number }): Loose` Left stick plus a right stick (right: 'stick') or named buttons (right: ['A', 'B']). (:588)
- `onScreen(): boolean` Whether on-screen sticks and buttons are drawn now: always on a phone; on a games handheld (a ROG Ally: real controls, played through key()) only for a few seconds after a touch. (:590)

## From the maker kit

From [Controls](../maker-kit.md#controls):

`const { Stick, Button, Gestures, route, twoThumb, Keys } = gs.controls;`

Every control takes `down(x, y, id)`, `move(x, y, pressed, id)`, `up(x, y, id)`, just like your game,
so you can pass input straight through. Fingers are tracked by id, so two thumbs work together.

```js
// one stick that appears wherever the thumb lands
const stick = new Stick({ r: 30, floating: true, zone: [0, 0, W, H] });
down: (x, y, id) => stick.down(x, y, id), move: (x, y, p, id) => stick.move(x, y, p, id), up: (x, y, id) => stick.up(x, y, id),
update(dt) { player.x += stick.x * speed * dt; player.y += stick.y * speed * dt; },
draw(c) { /* ... */ stick.draw(c); },

// the standard two-thumb layout: move on the left, aim stick or buttons on the right
const pad = twoThumb(W, H, { right: 'stick' });      // or { right: ['A', 'B'] }
pad.left.x, pad.right.angle, pad.buttons.A.pressed()  // resize(w, h) { pad.layout(w, h); }

// tap / double-tap / hold / swipe, the same feel in every game
const g = new Gestures({ tap(x, y) {}, doubleTap(x, y) {}, hold(x, y) {}, holdEnd(x, y, secs) {}, swipe(dir, vx, vy) {} });
update() { g.update(); }   // needed for hold
```

- `Stick`: `x`, `y` (-1..1, with a dead zone), `mag`, `angle`, `active`. Options `r`, `floating`,
  `zone: [x, y, w, h]`, `dead`, `axis: 'x'` (a slider). `place(x, y, zone)` moves it on resize.
- `Button`: `isDown`, `pressed()` (once per press), `released()`, `heldFor` (seconds).
- `route(a, b, c, fallback)` gives each finger to the first control that wants it. A function at the
  end gets everything else as `fn(type, x, y, id)`.
- `Keys` remembers held keys for desktop: `key: (k, d) => keys.key(k, d)`, then `keys.axis()` for
  arrows / WASD, `keys.held(' ')`.
- Call `release()` on controls in `reset()`, so a finger held at game over doesn't stick.
- Draw sticks and buttons faintly, and keep them off the important part of the screen.

From [Game kits](../maker-kit.md#game-kits):

**Fighting games** (`gs.fight`): `Reader({ window, buffer })` gets `feed(stickX, stickY, { P, K }, dt,
facing)` each frame (a `gs.controls.Stick` on touch) and keeps the last moments: `did('236P')` for
motions in numpad notation (forward follows `facing`), `special(moves)` for the first move whose
`input` was done, `take('P')` for a press up to `buffer` seconds old. `Fighter(moves, { x, facing, hurt
})`: moves are `{ start, active, recover }` in 60ths of a second with `hit` boxes `[x, y, w, h]` from the
feet (facing right), `stun`, `blockStun`, `stop`, `low`/`high`, `cancel: [names]` (once it has hit);
`start(name)`, `update(dt)`, `phase`. `clash(a, b)` checks a's hit boxes against b's hurt boxes once per
move, sets stun, block stun (b.blocking, b.blockLow) and hit stop, and returns `{ move, blocked, x, y }`.

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Two fingers** (`gs.controls.TwoFingers`): pinch, twist and two-finger drag, with your one-finger
`Gestures` still working through `one:`. Callbacks get the change since last time (`pinch(scale, x, y)`,
`twist(angle, x, y)`, `pan(dx, dy)`), or read `scale`, `angle`, `x`, `y` and `active`. When the second
finger lands the one-finger gesture is dropped, so a pinch never ends in a stray tap.

## In real games

20 games use it (`node scripts/examples.mjs gs.controls` lists them). The shortest:

`src/games/ladder-climber.js` (Ladder Climber, Pocket · Reflex, 114 lines):

```js
const { sfx, sounds, music } = gs.sound;
const { Keys } = gs.controls;
// …
  const feel = new Feel({ pixel: true });
  const keys = new Keys();
// …
  return {
    reset() { rungs = []; height = 0; flood = -3; score = 0; t = 0; side = 0; slip = 0; dead = 0; combo = 0; started = false; beat = 0; keys.clear(); 
```

`src/games/ghost-torch.js` (Ghost Torch, AR · Spooky, 119 lines):

```js
const { Juice } = gs.juice;
const { Gestures } = gs.controls;
// …
  let v, geo, ghosts, sparks, score, candles, t, spawnT, on, ended;
  const g = new Gestures({
// …
      for (const gh of ghosts || []) drop(gh);
      ghosts = []; score = 0; candles = 3; t = 0; spawnT = 0; on = false; ended = false; sparks.clear(); fx.clear(); g.release();
// …
    // the AR kit gets touches first: its floor panels (Skip, Done, the Floor chip) use them
    down: (x, y, id) => { if (!v?.input?.('down', x, y, id)) g.down(x, y, id); },
    move: (x, y, p, id) => { if (!v?.input?.('move', x, y, id, p)) g.move(x, y, p, id); },
    up: (x, y, id) => { if (!v?.input?.('up', x, y, id)) g.up(x, y, id); },
```
