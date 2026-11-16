# gs.words

A word dictionary, word comparison, letter bags, scoring.

`gs.words` (lazy: `Words` dictionary, `compare`, `Bag`, `score`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`WordsPart`, line 5610), where every option and field is described.

- `Words: new () => { readonly size: number; has(w: string): boolean; safe(w: string): boolean; of(len: number): string[]; random(o?: { length?: number | null; min?: numb…` The dictionary (loads on first use: make it in make() or reset()). (:5612)
- `compare(guess: string, answer: string): ('hit' | 'near' | 'miss')[]` (:5619)
- `LETTERS: Record<string, number>` (:5620)
- `VALUES: Record<string, number>` (:5620)
- `score(word: string, o?: { values?: Record<string, number>; mult?: number }): number` (:5621)
- `Bag: new (o?: { size?: number; blanks?: number; seed?: number | string | null; letters?: Record<string, number> }) => { tiles: string[]; readonly left: number; shuffle…` (:5622)

## From the maker kit

From [What `gs` has, and what it doesn't](../maker-kit.md#what-gs-has-and-what-it-doesnt):

**Big parts load when first used.** Physics, 3D physics, 3D path finding, 3D extras, face tracking, Tone.js, the
dictionary (`gs.words`) and the UI layout engine (`gs.ui`) are a
few MB, so the app loads them the first time a game needs them. Create those things in `make()` or
`reset()`: if the library isn't in yet, the app shows "Loading…" on the card and makes your game
again once it is. Don't create them later (in `update()` or a tap), or the game will stop with an error.

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Words** (`gs.words`, SCOWL lists, about 60,000 English words, British spellings too; loads on first
use, so make `new Words()` in `make()` or `reset()`): `has()`, `random({ length: 5, seed: gs.math.daily('word') })`
(only common, clean words are picked), `from('tsrleai')` (every word in some letters, `?` for a
blank), `anagrams()`, `match('c?t')`, `find(grid)` (words snaking through a letter grid with their
paths), `compare(guess, answer)` (hit / near / miss, fair with repeated letters), `safe()` for words
players type, and `Bag` for letter tiles with `score()`.

## In real games

2 games use it (`node scripts/examples.mjs gs.words` lists them). The shortest:

`src/games/word-wheel.js` (Word Wheel, Casual · Words, 105 lines):

```js
const { Feel } = gs.effects;
const { Words } = gs.words;
// …
  const feel = new Feel();
  const words = new Words();
// …
    let w = null;
    for (let k = 0; k < 40 && !w; k++) { const c = words.random({ length: 6 }); if (c && words.safe(c) && words.from(c, { min: 3, common: true }).leng
// …
        letters = shuffle(w.split(''));
    all = words.from(w.toLowerCase(), { min: 3, common: true }).filter(x => words.safe(x)).map(x => x.toUpperCase());
// …
      if (found.includes(w)) { msg = 'Already got it'; ml = 1; sfx(300, .08, 'square', .03); return; }
      if (!words.has(w.toLowerCase()) || !words.safe(w.toLowerCase())) { msg = 'Not a word'; ml = .8; flash = .3; haptic('warning'); sfx(150, .15, 'sq
```

`src/games/word-ladder.js` (Word Ladder, Casual · Words, 121 lines):

```js
const { Feel } = gs.effects;
const { Words } = gs.words;
// …
  const feel = new Feel();
  const words = new Words();
// …
  function newLadder() {
    graph ||= new Set(words.of(4).filter(w => words.safe(w)));
// …
    for (let tries = 0; tries < 60; tries++) {
      const s = words.random({ length: 4 }); if (!s || !graph.has(s)) continue;
// …
    const n = w.slice(0, slot) + ch + w.slice(slot + 1);
    if (!words.has(n.toLowerCase()) || !words.safe(n.toLowerCase())) { msg = `${n} isn't a word`; ml = 1; haptic('warning'); sfx(150, .12, 'square', .
```
