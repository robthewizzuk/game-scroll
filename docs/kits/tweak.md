# gs.tweak

Knobs: the numbers that set how a game feels, with live sliders in npm run dev.

Guide: [feel words: which knob a word moves](../feel-words.md).

`gs.tweak(name, { speed: 3, grip: [.8, 0, 1, 'how hard the tyres hold'] })`: live sliders in `npm run dev` (starting values elsewhere); read fields where used. **Knobs**: keep the numbers that set how a game feels in one `const K = gs.tweak('Feel', { ... })` block with a range and a few words each (every template has one); `node scripts/knobs.mjs <id>` lists and changes them (`speed*0.8`), the panel's Save to file writes sliders back, and [docs/feel-words.md](docs/feel-words.md) says which knob a word like *floaty*, *snappy*, *punchy* or *unfair* moves.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`TweakFn`, line 2418), where every option and field is described.

## From the maker kit

From [Hot reload and tweak sliders](../maker-kit.md#hot-reload-and-tweak-sliders):

**Tweak sliders.** `gs.tweak` puts sliders for your numbers on screen (lil-gui) while you play:

```js
const T = gs.tweak('Car', {
  speed: 3,                      // a number: a slider from 0 to 3 times it
  grip: [.8, 0, 1, .01],         // [value, min, max, step]
  drift: true,                   // a tick box
  paint: '#ff8800',              // a colour
  mode: ['easy', 'easy', 'hard'],// [value, ...choices]
});
// read T.speed where it's used (in update or draw), so a slider change shows on the next frame
```

- **Copy values** puts the current numbers on the clipboard (and in the console) as a `gs.tweak`
  call to paste back into your file.
- The store apps and test builds show no panel: `gs.tweak` just returns the starting values, so the
  call can stay in your game. Test builds can read and set them (`__gs.knobs(id)`,
  `__gs.setKnobs(id, { 'Feel.speed': 2 })`, for every copy of the game, from its next read), so a test
  can play a game with one knob changed.

**Knobs.** Keep the numbers that set how your game feels (speeds, gravity, gaps between spawns, lives,
how close counts as a hit) in one `const K = gs.tweak('Feel', { ... })` block in `make()`, each with a
range and a few words, and read `K.x` where it's used. Every template starts like that. Then a change
asked for in words ("slower fish", "a floatier jump") is one number, and
`node scripts/knobs.mjs <id>` lists them and changes them in the file (`speed=140`, `speed*0.8` stays in
range). [Feel words](feel-words.md) says which knob each word moves, and the usual knob names.

## In real games

19 games use it (`node scripts/examples.mjs gs.tweak` lists them). The shortest:

`src/games/fast-maths.js` (Fast Maths, Pocket · Brain, 135 lines):

```js
  const ready = new Ready({ text: 'TAP TO START' });                   // the first card stays face down until the first tap
  const K = gs.tweak('Feel', {
```

`src/games/slide-ten.js` (Slide Ten, Pocket · Merge, 140 lines):

```js
function make(api) {
  const K = gs.tweak('Feel', {
```
