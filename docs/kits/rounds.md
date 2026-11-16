# gs.rounds

Ready (wait for the first tap), Scenes with fades, Levels.

`gs.rounds`: `Ready` (wait for the first tap: `if (!ready.update(dt)) return;`, `if (ready.go()) return;` in `down`), `Scenes({ name: { enter, update, draw } }, start)` with `go(name, { fade })`, `cover`, `after()`; `Levels(list)`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`RoundsPart`, line 959), where every option and field is described.

- `Scenes: new (scenes: Record<string, Scene>, start: string, o?: { fade?: number }) => { name: string; readonly scene: Scene; is(...names: string[]): boolean; go(name: s…` (:960)
- `Ready: new (o?: { eat?: boolean; text?: string }) => { waiting: boolean; readonly playing: boolean; t: number; since: number; eat: boolean; text: string; reset(): Loos…` Waits for the first touch or key before the round starts: `if (!ready.update(dt)) return;` in update, `if (ready.go()) return;` in down. (:962)
- `Levels: new <T>(list: T[], o?: { loop?: boolean; start?: number }) => { readonly now: T; readonly number: number; readonly last: boolean; index: number; next(): Loose;…` (:963)

## From the maker kit

From [Starter templates](../maker-kit.md#starter-templates):

Every template starts the way a finished game does, so a new game has these from its first line:
a **fixed tick** (`tick: 60`: the same game on every phone, drawn between ticks with `gs.tick.mix`),
**Ready** (`gs.rounds.Ready`: nothing moves or scores until the first tap), **Feel**
(`gs.effects.Feel`: particles, shake, sound and a buzz in one call, following the player's settings),
a **soundtrack in one line** (`music: 'happy'` in the definition) and a HUD that keeps out of the
app's score badge.

From [Rounds and scenes](../maker-kit.md#rounds-and-scenes):

**Waiting for the first touch.** After Play, the round starts at once; a game where things fall,
score or end on their own should wait for the player's first tap, or it scores with no input (the
PR check's bot notices). `Ready` is that wait in one object:

```js
const ready = new gs.rounds.Ready();            // in make(); { eat: false } lets the first tap also act
reset()      { ready.reset(); ... }
update(dt)   { if (!ready.update(dt)) return; ...the game... }
down(x, y)   { if (ready.go()) return; ... }    // the starting tap does nothing else
key(k, down) { if (down && ready.go()) return; ... }
draw(c)      { ...the game...; ready.draw(c, W, H); }   // a pulsing "Tap to start" (or draw your own)
```

`ready.waiting`, `ready.t` (seconds waited, for an idle animation), `ready.since` (seconds playing).
`ready.draw(c, W, H, { text, x, y, color, size, pixel: true })`: pixel styles blink gs.pixel text in
a palette colour you pass. Call `ready.go()` from a tilt or a shout to start the same way.

`const { Scenes, Levels } = gs.rounds;` The parts of a round (intro, play, clear, boss) as scenes
with their own update and draw, and timed changes between them that you draw your own way.

```js
reset() {
  levels = new Levels(LEVELS, { loop: true });
  scenes = new Scenes({
    intro: { enter() { build(levels.now); }, update(dt, s) { if (s.time > 1.2) s.go('play', { fade: .4 }); } },
    play:  { update(dt, s) { step(dt); if (cleared()) s.go('clear'); }, draw: drawWorld },
    clear: { enter() { feel.win(); }, update(dt, s) { if (s.time > 1.5) { levels.next(); s.go('intro', { fade: .6 }); } } },
  }, 'intro');
}
update(dt) { scenes.update(dt); }
draw(c) { scenes.draw(c); if (scenes.changing) { c.fillStyle = `rgba(0,0,0,${scenes.cover})`; c.fillRect(0, 0, W, H); } }
```

- `go(name, { fade, data })`, `after(sec, name)`, `is(name)`, `time`, `prev`, `data`, `changing`,
  `progress` (0 → 1) and `cover` (0 → 1 → 0) for your own fade, wipe or iris. `input('down', x, y)` passes taps on.
- `Levels(list, { loop })`: `now`, `index`, `number`, `lap` (repeats, to make them harder), `next()`, `last`.

## In real games

111 games use it (`node scripts/examples.mjs gs.rounds` lists them). The shortest:

`src/games/untangle.js` (Untangle, Casual · Puzzle, 56 lines):

```js
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
// …
function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
// …
  return {
    reset() { n = 6; time = 60; score = 0; t = 0; dead = 0; drag = null; ready.reset(); feel.clear(); build(); },
// …
    },
    down(x, y) { if (solvedT) return; let best = -1, bd = 34; pts.forEach((p, k) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; be
```

`src/games/colour-word.js` (Colour Word Trap, Casual · Brain, 63 lines):

```js
const { clamp } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
// …
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                                            // the answer clock waits for the first tap
// …
  const self = {
    reset() { lives = 3; rule = 'ink'; score = 0; t = 0; flip = 0; shake = 0; btnOrder = [0, 1, 2, 3]; feel.clear(); ready.reset(); next(); },
// …
    fx(dt) { feel.update(dt); },
    update(dt) { feel.update(dt); if (!ready.update(dt)) return; t += dt; flip = Math.max(0, flip - dt * 2); shake = Math.max(0, shake - dt * 3); time
// …
      feel.end(c, W, H);
      ready.draw(c, W, H, { y: 352 });
// …
    down(x, y) {
      if (ready.go()) return;
```
