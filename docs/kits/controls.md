# gs.controls

On-screen thumbsticks and buttons, taps, holds, swipes, two-finger gestures, keys.

`gs.controls`: `Stick`, `Button`, `Gestures` (tap, doubleTap, hold, swipe), `TwoFingers` (pinch, twist, pan), `twoThumb(W, H)`, `Keys`, `route()`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ControlsPart`, line 533), where every option and field is described.

- `Stick: new (o?: { x?: number; y?: number; r?: number; floating?: boolean; zone?: number[]; dead?: number; axis?: 'both' | 'x' | 'y'; color?: string }) => Control & { x…` Virtual thumbstick: x, y (-1..1), mag, angle, active. (:535)
  - `wants(x: number, y: number): boolean` (:532)
  - `release(): void` (:532)
  - `down(x: number, y: number, id?: number): boolean` (:532)
  - `move(x: number, y: number, pressed: boolean, id?: number): boolean` (:532)
  - `up(x: number, y: number, id?: number): boolean` (:532)
  - `draw(c: Ctx, o?: Loose): void` (:532)
- `Button: new (o?: { x?: number; y?: number; r?: number; label?: string; zone?: number[]; color?: string }) => Control & { isDown: boolean; readonly heldFor: number; pre…` Round button: isDown, pressed() once per press, released(), heldFor. (:537)
- `Gestures: new (o?: Loose) => Loose` Tap, double tap, hold and swipe. (:539)
- `TwoFingers: new (o?: { zone?: number[]; one?: Loose; minScale?: number; minTurn?: number; pinch?: (scale: number, x: number, y: number) => void; twist?: (angle: number…` Pinch, twist and two-finger pan (one-finger touches go to `one`). (:541)
- `Keys: new () => { key(k: string, isDown: boolean): void; held(k: string): boolean; axis(): XY; clear(): void }` Keyboard state: keys.held('ArrowLeft'), keys.axis(). (:543)
- `route(...controls: Loose[]): { down: Game['down']; move: Game['move']; up: Game['up'] }` Hands each finger to the first control that wants it. (:545)
- `twoThumb(W: number, H: number, o?: { right?: 'stick' | string[]; r?: number }): Loose` Left stick plus a right stick (right: 'stick') or named buttons (right: ['A', 'B']). (:547)

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

11 games use it (`node scripts/examples.mjs gs.controls` lists them). The shortest:

`src/games/slide-ten.js` (Slide Ten, Pocket · Merge, 108 lines):

```js
const { Board } = gs.board;
const { Gestures } = gs.controls;
// …
  let b, score, t, dead, moves, lastTen;
  const g = new Gestures({ swipe: dir => slide(dir) });
// …
  return {
    reset() { b = new Board(N, N, { speed: 16 }); score = 0; t = 0; dead = 0; moves = 0; lastTen = 0; g.release(); feel.clear(); for (let i = 0; i < 5
// …
    update(dt) {
      feel.update(dt); g.update(); if (feel.frozen) return;
// …
    },
    down: (x, y, id) => g.down(x, y, id),
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
```

`src/games/ladder-climber.js` (Ladder Climber, Pocket · Reflex, 113 lines):

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
