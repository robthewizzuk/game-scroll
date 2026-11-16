# gs.math

Seeded random, daily seeds, smooth noise, vectors, grids, timers that pause with the game.

`gs.math`: `rng(seed)`, `daily(salt)`, `noise2`, `noise3`, `fbm`, `vec`, `overlap`, `Grid`, `Timers`, `angleDiff`, `wrap`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`MathPart`, line 466), where every option and field is described.

- `rng(seed?: number | string): Rng` Seeded random numbers (same seed, same run). (:468)
- `daily(salt?: string, date?: Date): number` A seed that's the same for everyone today. (:470)
- `seedOf(s: string): number` (:471)
- `noise2(x: number, y: number): number` (:472)
- `noise3(x: number, y: number, z: number): number` (:473)
- `noiseSeed(seed: number | string): void` (:474)
- `makeNoise(seed: number | string): (x: number, y: number, z?: number) => number` (:475)
- `fbm(x: number, y: number, octaves?: number): number` (:476)
- `vec: Loose` (:477)
- `overlap(a: Loose, b: Loose): boolean` (:478)
- `angleDiff(a: number, b: number): number` (:479)
- `wrap(v: number, max: number): number` (:480)
- `Grid: new (w: number, h: number, fill?: Loose) => Loose` (:481)
- `Timers: new () => { after(sec: number, fn: () => void): Timer; every(sec: number, fn: () => void): Timer; update(dt: number): void; clear(): void }` Game timing that pauses with the game: timers.after(1.5, fn); timers.update(dt) each frame. (:483)

## From the maker kit

From [Maths](../maker-kit.md#maths):

`const { rng, daily, noise2, fbm, vec, overlap, Grid, Timers } = gs.math;`

- `rng(seed)` → `r()` 0..1, `r.int(a, b)`, `r.range(a, b)`, `r.pick(list)`, `r.shuffle(list)`, `r.chance(p)`.
  Same seed, same numbers: levels everyone shares.
- `daily('my-game')`: today's seed (the same for every player all day). `rng(daily('my-game'))` makes a daily challenge.
- `noise2(x, y)`, `noise3(x, y, z)`: smooth noise -1..1 (simplex-noise) for hills, caves, clouds,
  wobble. `fbm(x, y, octaves)` is rougher and more natural. `noiseSeed(seed)`, `makeNoise(seed)`.
- `vec.add / sub / scale / len / dist / norm / dot / angle / fromAngle / rotate / lerp` on `{ x, y }`,
  `angleDiff(a, b)`, `wrap(v, max)`.
- `overlap.circles / boxes / circleBox / pointInBox / pointInCircle / lineCircle`.
- `Grid(cell)`: find nearby things fast (hundreds of bullets): `clear()`, `add(t)`, `near(x, y, r)`.
- `Timers`: `after(sec, fn)`, `every(sec, fn)`, `update(dt)`. They run on game time, so they stop
  when the game pauses (setTimeout doesn't).

From [Pause and resume](../maker-kit.md#pause-and-resume):

The app pauses a game when the player opens How to play, switches apps, or presses Escape or a
controller's Start, and shows a "Carry on" button. `update()` simply stops being called, and
music is held. If your game has its own timers or sounds outside `update()`, add `pause()` and
`resume()` to your game object. Use `gs.math.Timers` rather than `setTimeout` and you won't need to.

The app keeps the screen on while a round is in play, so games played by tilting, talking, blowing
or just watching don't dim and lock. It lets the phone sleep again when the round ends or pauses, and
after five minutes with no touch at all. Nothing to do in the game.

From [Game kits](../maker-kit.md#game-kits):

**Made levels** (`gs.gen`, rot.js and WaveFunctionCollapse, loaded on first use: call them in `make()` or
`reset()`): `dungeon`, `cave`, `maze`, `islands`, `heightmap` and `pattern(sample)` (new maps that look
like a small example). They give the same text `gs.tiles.TileMap.fromText()` reads, with `S` start and
`E` exit marks. Pass a `seed` (`gs.math.daily()` for a level of the day). `fov(map, col, row, r)` is
what a hero can see.

**Quiz questions** (`gs.trivia`, about 2,700 from the Open Trivia Database, CC BY-SA 4.0; loads on
first use, so make it in `make()` or `reset()`): games can't carry data files, so the bank lives here.
`categories()` lists `{ id, name, count }` (general, animals, geography, history, science, maths,
computers, sports, art, myths, vehicles, books, music; grown-up topics left out). `new Quiz({ categories,
difficulty, kind: 'choice' | 'truefalse', climb, seed })` deals them in a seeded order with no repeats
(`gs.math.daily('quiz')` for the same quiz for everyone today). `next()` gives `{ text, answers, kind,
difficulty, category }` with the answers shuffled (the right one isn't in it); `answer(i)` gives `{ right,
correct, streak, score }`; `timeout()` is a miss; `fifty()` is two wrong answers to take away; with
`climb: 3` it starts easy and steps up after three right in a row, down after a miss. `pack()` is a tiny
save to `resume` from. Show `CREDIT` somewhere in the game: the licence asks for it.

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Words** (`gs.words`, SCOWL lists, about 60,000 English words, British spellings too; loads on first
use, so make `new Words()` in `make()` or `reset()`): `has()`, `random({ length: 5, seed: gs.math.daily('word') })`
(only common, clean words are picked), `from('tsrleai')` (every word in some letters, `?` for a
blank), `anagrams()`, `match('c?t')`, `find(grid)` (words snaking through a letter grid with their
paths), `compare(guess, answer)` (hit / near / miss, fair with repeated letters), `safe()` for words
players type, and `Bag` for letter tiles with `score()`.

From [A camera that knows things](../maker-kit.md#a-camera-that-knows-things):

- **`Scanner({ kinds, every, shape, camera })`**: reads QR codes and the striped codes on anything from
  a cereal box to a library book (`Scanner.kinds`: `'qr'`, `'ean-13'`, `'ean-8'`, `'upc-a'`, `'upc-e'`,
  `'code-128'`, `'code-39'`, `'code-93'`, `'codabar'`, `'itf'`, `'data-matrix'`, `'aztec'`, `'pdf417'`).
  - `scan()`: the code that has just been read, **once** each time one comes into view (else null):
    `{ text, kind, seed, x, y, w, h, left, top, corners }`.
  - `seed` is a whole number made from the text, the same for the same code on every phone and far
    apart for codes one digit apart: hand it to `gs.art.creature(seed)`, `gs.gen.dungeon(40, 30, { seed })`,
    `gs.math.rng(seed)`. A whole kitchen becomes a deck of monsters.
  - `code` is the code in view now (or null), `list` all of them, `backend` which reader is at work.
  - `Scanner.seed('any text')` gives the seed for a typed word.

```js
reset() { scanner = new Scanner({ shape: 1 }); monster = null; }
down(x, y) { if (shuffle.hit(x, y)) monster = gs.art.creature(Math.random() * 1e9 | 0); else scanner.start(); }   // "Surprise me"
update(dt) { scanner.update(); const code = scanner.scan(); if (code) { monster = gs.art.creature(code.seed); feel.powerup(W / 2, H / 2); } }
draw(c) { if (scanner.picture) c.drawImage(scanner.picture, 30, 60, 300, 300); /* a square window onto the camera */ }
```

From [Big worlds in parts](../maker-kit.md#big-worlds-in-parts):

`gs.regions.Regions` (3D): a world in parts that are made a little each frame while they are wanted and
let go of when they are not. Use it for levels a game should build only once the player picks one (a
campaign's missions, the inside of a house), for a world bigger than a phone can hold at once (squares of
it made round the player as they walk, and freed behind), and for ground in tiles that are finer close by.

```js
const { Regions } = gs.regions;
const regions = new Regions(view, { world });   // world: a gs.physics3d.World3D, if the parts make bodies
// a named part: what it adds to the scene, the bodies it makes in `world` and what it hands r.keep() are its own
regions.part('harbour', function* (r) {
  view.scene.add(quay());
  yield;                                          // the rest waits for the next frame
  for (const p of CRATES) { r.add(prop('crate'), p); yield; }
  const people = yield r.wait(human.ready(DOCKERS)); // background work: the part goes on once it is in
});
regions.part('fort', makeFort);                   // a plain function is made in one go
// in reset(): made at once, under the loading screen; later (a menu pick): over the next frames
regions.want(pick === 1 ? 'harbour' : 'fort');
// squares round the player, and ground in tiles (finer close by, solid within one square)
regions.cells({ size: 64, reach: 2, make: r => scatterTrees(r.x0, r.z0, r.size, r.seed) });
const ground = regions.land({ height: (x, z) => 20 * gs.math.fbm(x * .004, z * .004), size: 64, reach: 5, solid: 1,
  colour: (x, y, z, slope) => slope > .35 ? '#7a7466' : '#5c7f3a' });
// each frame
regions.update(dt, player.position);
if (!regions.has('fort')) drawLoading(regions.progress);
```

## In real games

51 games use it (`node scripts/examples.mjs gs.math` lists them). The shortest:

`src/games/untangle.js` (Untangle, Casual · Puzzle, 56 lines):

```js
const { Feel } = gs.effects;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle
```

`src/games/colour-word.js` (Colour Word Trap, Casual · Brain, 63 lines):

```js
const { icon } = gs.icons;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)
```
