# gs.fonts

13 display fonts that look the same on every phone, loaded on first use.

`gs.fonts`: `c.font = font('Bangers', 34)` (13 display fonts that look the same on every phone: `Bangers`, `Fredoka`, `Titan One`, `Bungee`, `Orbitron`, `Creepster`, `Pirata One`, `Rye`, `Monoton`, `Black Ops One`, `Cinzel`, `Patrick Hand`, `Courier Prime`; plus `Rubik`), loaded on first use; `use('Bangers')` in `make()` or `reset()` to have one in before the first frame. Not the phone's own fonts (`Arial`, `Courier New`, `Impact`...).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`FontsPart`, line 573), where every option and field is described.

- `font(name: FontName | (string & {}), size?: number, weight?: number): string` The string for c.font: font('Bangers', 34) is '400 34px "Bangers", Rubik, sans-serif'. (:578)
- `use(...names: (FontName | [FontName, number])[]): boolean` In make() or reset(): have these fonts in before the first frame ("Loading…" the first time). (:580)
- `ready(name: FontName | (string & {}), weight?: number): boolean` Is this font in and ready to draw? (:582)
- `readonly list: readonly { readonly name: FontName; readonly look: string; readonly weights: readonly number[]; readonly pixel: number }[]` Every font: its name, what it looks like, the weights that ship, and for pixel fonts the size in px its pixels are crisp at (else 0). (:584)

## From the maker kit

From [Pixel text and sprites](../maker-kit.md#pixel-text-and-sprites):

`'small'` and `'big'` are always there. The other four are fetched the first time a game names them
(a few kilobytes each) and the text draws in the 8×8 font for the moment before one arrives; call
`gs.fonts.use('Tiny5')` in `make()` or `reset()` if the first frame must already have it (see
[Fonts](#fonts) for the names).

From [Fonts](../maker-kit.md#fonts):

`const { font, use } = gs.fonts;`

The app ships 13 display fonts next to Rubik (its own text), so a title can look like the game it
belongs to and still look the same on every phone. All are open-licence (SIL OFL 1.1) and each one's
file is fetched only the first time a game names it.

```js
reset() { use('Bangers', ['Fredoka', 700]); ... }      // optional: "Loading…" until they are in
draw(c) {
  c.font = font('Bangers', 34); c.fillText('KA-POW!', x, y);
  c.font = font('Fredoka', 16, 700); c.fillText('Tap to bounce', x, y + 30);
}
```

- `font(name, size, weight)` gives the string for `c.font` (`'400 34px "Bangers", Rubik, sans-serif'`)
  and starts the font loading if it isn't in yet. Until it is, the text draws in Rubik, so nothing
  breaks; a card waiting in the feed is drawn again when the font arrives. The nearest weight the
  font has is used, names can be in any case, and an unknown name gives Rubik.
- `use(...names)` in `make()` or `reset()` waits for the fonts before the first frame, the way the
  other lazy parts do (the app shows "Loading…" once). Use it when text is measured to lay things
  out, or when a title in the wrong font for a moment would show. A misspelt name is an error that
  lists the fonts.
- `ready(name, weight)` says whether a font is in. `gs.fonts.list` is every font:
  `{ name, look, weights, pixel }`.
- The pixel fonts (`Press Start 2P`, `Silkscreen`, `Tiny5`, `Jersey 10`, `VT323`) are in the list too.
  In the pixel styles draw them with `gs.pixel.text` ([above](#pixel-text-and-sprites)), which keeps
  every pixel hard; `font('VT323', 25)` on a smooth Phone game is fine for a retro label.
- Fonts that come with the phone (`Arial`, `Courier New`, `Impact`, `Georgia`...) look different on
  every phone and some are missing on Android: name one of these instead. Plain `sans-serif` and
  `monospace` are fine as they are. Emoji are the phone's own too, so they differ between phones.

From [3D extras](../maker-kit.md#3d-extras):

- `text3d('PLAYER 1', { size, color, font, outline, outlineColor, align, maxWidth, face: true })`:
  sharp text in the 3D world at any size and distance, in any 3D style. `font` is `'bold'`, `'regular'`,
  `'pixel'` or any `gs.fonts` name (`'Bangers'`, or `['Fredoka', 700]` for a weight); `size` is the height
  of a capital letter in world units and `outline` a width in the same units; `maxWidth` wraps at
  spaces; `face: true` always faces the camera. Change `label.text = 'NEW'` (or `color`, `size`...) and
  call `label.sync()`; `label.width` and `label.height` say how big it came out. (Each letter is kept as
  a distance field made on the phone with [TinySDF](https://github.com/mapbox/tiny-sdf), so one small
  picture per font serves every size.)

## In real games

3 games use it (`node scripts/examples.mjs gs.fonts` lists them). The shortest:

`src/games/mud-pie-duel.js` (Mud Pie Duel, Casual · Duel, 264 lines):

```js
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds, { Brain } = gs.brains, { icon } = gs.icons, { font, use } = gs.fonts;
```

`src/games/pup-school.js` (Pup School, Casual · Pet, 360 lines):

```js
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds, { Coach } = gs.brains, { icon } = gs.icons, { font, use } = gs.fonts;
```
