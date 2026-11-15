# gs.icons

528 icons that look the same on every phone (use these, not emoji).

`gs.icons`: `icon(c, 'sword', x, y, size, { color, outline, angle, pixel })`: 528 icons that look the same on every phone (use these, not emoji); plain words (`heart`, `coin`, `key`, `star`, `skull`...) or `names`, `find('potion')`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`IconsPart`, line 703), where every option and field is described.

- `icon(c: Ctx, name: string, x: number, y: number, size?: number, o?: { color?: string; outline?: string | null; width?: number; angle?: number; alpha?: number; flip?: b…` Draws an icon centred on (x, y), `size` game units across. (:710)
- `readonly names: readonly string[]` Every icon's name, a to z. (:712)
- `readonly words: Readonly<Record<string, string>>` The plain words that also work, and the icon each is: { sword: 'broadsword', ... (:714)
- `has(name: string): boolean` (:715)
- `find(text: string): string[]` Icons whose name has this text in it. (:717)
- `path(name: string): Path2D | null` The icon as a Path2D on a 512 by 512 grid (to fill, stroke or clip with yourself), or null. (:719)
- `data(name: string): string | null` The icon's SVG path data on a 512 by 512 grid, or null. (:721)
- `remembered(): number` How many drawn icons are remembered right now. (:723)

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

3 games use it (`node scripts/examples.mjs gs.icons` lists them). The shortest:

`src/games/parcel-dash.js` (Parcel Dash, Next Gen · Driving, 186 lines):

```js
const { rng } = gs.math;
const { icon } = gs.icons;
// …
    c.strokeStyle = n.on ? '#ffb24a66' : '#ffffff33'; c.lineWidth = 1; c.stroke();
    icon(c, n.on ? 'musical-notes' : 'speaker-off', d.x + 14, d.y + d.h / 2, 16, { color: n.on ? '#ffb24a' : '#9aa4b8' });
```

`src/games/mud-pie-duel.js` (Mud Pie Duel, Casual · Duel, 264 lines):

```js
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds, { Brain } = gs.brains, { icon } = gs.icons, { font, use } = gs.fonts;
```
