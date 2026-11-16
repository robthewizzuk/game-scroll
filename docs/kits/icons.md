# gs.icons

528 icons that look the same on every phone (use these, not emoji).

`gs.icons`: `icon(c, 'sword', x, y, size, { color, outline, angle, pixel })`: 528 icons that look the same on every phone (use these, not emoji); plain words (`heart`, `coin`, `key`, `star`, `skull`...) or `names`, `find('potion')`.

Drawing an icon that was drawn before makes next to nothing new (about 50 bytes a call), so `icon()` can run
dozens of times a frame: the options object written in the call is all it costs (about 40 bytes; making it
once outside `draw()` saves even that, worth it only for a lot of icons a frame).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`IconsPart`, line 715), where every option and field is described.

- `icon(c: Ctx, name: string, x: number, y: number, size?: number, o?: { color?: string; outline?: string | null; width?: number; angle?: number; alpha?: number; flip?: b…` Draws an icon centred on (x, y), `size` game units across. (:722)
- `readonly names: readonly string[]` Every icon's name, a to z. (:724)
- `readonly words: Readonly<Record<string, string>>` The plain words that also work, and the icon each is: { sword: 'broadsword', ... (:726)
- `has(name: string): boolean` (:727)
- `find(text: string): string[]` Icons whose name has this text in it. (:729)
- `path(name: string): Path2D | null` The icon as a Path2D on a 512 by 512 grid (to fill, stroke or clip with yourself), or null. (:731)
- `data(name: string): string | null` The icon's SVG path data on a 512 by 512 grid, or null. (:733)
- `remembered(): number` How many drawn icons are remembered right now. (:735)

## From the maker kit

From [Icons](../maker-kit.md#icons):

`const { icon } = gs.icons;` (loads on first use)

528 drawn icons that look the same on every phone, where an emoji is a different picture on each one:
weapons, hearts, keys, chests, potions, animals, food, tools, weather, vehicles, buildings, plants,
sports, music, cards, dice, chess pieces and buttons. They are from the Game Icons set
([game-icons.net](https://game-icons.net)) by Lorc, Delapouite and contributors, CC BY 3.0, credited in
the app's licence list, so a game needs to show nothing.

```js
icon(c, 'sword', x, y, 32);                                         // centred on x, y, 32 units across, white
icon(c, 'hearts', x, y, 24, { color: '#ff5470', outline: '#000' });
icon(c, 'key', x, y, 16, { pixel: true, color: PAL[3] });           // hard pixels for the pixel styles
```

- Names are the set's own (`'broadsword'`, `'health-potion'`, `'pine-tree'`), and about 100 plain words
  work too: `sword`, `shield`, `bow`, `bomb`, `heart`, `coin`, `gem`, `star`, `key`, `lock`, `chest`,
  `potion`, `skull`, `ghost`, `fire`, `ice`, `water`, `bolt`, `sun`, `moon`, `cloud`, `tree`, `flower`,
  `apple`, `fish`, `cat`, `dog`, `dragon`, `rocket`, `castle`, `crown`, `trophy`, `flag`, `map`, `dice`,
  `card`, `play`, `pause`, `settings`, `sound`, `mute`, `home`, `trash`... `gs.icons.names` lists every
  name, `gs.icons.words` the plain words, `gs.icons.find('potion')` searches, `has(name)` checks.
- Options: `color` (white), `outline` and `width`, `angle`, `alpha`, `flip`, and `pixel: true` for the
  pixel styles (every pixel fully on or off, in exactly the colours given; `size` is then whole game
  pixels, and simple icons read best: 16 and up).
- An icon is drawn once at the size and colour asked for and remembered, so drawing it is one
  `drawImage`; a pulsing icon is scaled, not redrawn. `icon()` returns false for a name it doesn't have.
- `path(name)` gives the icon as a `Path2D` on a 512 by 512 grid, to fill with a gradient or a
  `gs.gfx` material, or to clip with.
- To add an icon to the app: put its game-icons.net name in `scripts/icons/names.json` and run
  `node scripts/icons/build.mjs` (shared code, so in its own PR).

## In real games

20 games use it (`node scripts/examples.mjs gs.icons` lists them). The shortest:

`src/games/colour-word.js` (Colour Word Trap, Casual · Brain, 63 lines):

```js
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { icon } = gs.icons;
// …
      c.fillStyle = '#fff'; c.font = '400 13px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(rule === 'ink' ? 'TAP THE INK' : 'TAP 
      for (let i = 0; i < 3; i++) icon(c, 'heart', W / 2 - 28 + i * 28, 53, 20, { color: i < lives ? '#ff4d6d' : '#ffffff22' });
```

`src/games/link-pairs.js` (Link Pairs, Casual · Matching, 71 lines):

```js
const { Feel } = gs.effects;
const { icon } = gs.icons;
// …
        c.fillStyle = s ? '#ffe9a8' : '#f3ead6'; c.beginPath(); c.roundRect(x + 3, y + 3, CS - 6, CS - 6, 8); c.fill(); c.fillStyle = '#c9bb98'; c.fil
        c.fillStyle = `hsl(${HUES[g[i]]} 65% 42%)`; icon(c, ICONS[g[i]], x + CS / 2, y + CS / 2, 30, { color: `hsl(${HUES[g[i]]} 65% 42%)` }); }
```
