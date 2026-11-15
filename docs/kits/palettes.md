# gs.palettes

The fixed colour sets of the pixel styles (PAL, SHELL, C16).

`gs.palettes`: `PAL`, `SHELL`, `C16`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PalettesPart`, line 467), where every option and field is described.

- `PAL: Record<string, string[]>` (:467)
- `SHELL: Loose` (:467)
- `C16: string[]` (:467)

## In real games

79 games use it (`node scripts/examples.mjs gs.palettes` lists them). The shortest:

`src/games/colour-flood.js` (Colour Flood, Pocket · Puzzle, 47 lines):

```js
const { haptic } = gs.device;
const { PAL } = gs.palettes;
```

`src/games/picture-logic.js` (Picture Logic, Pocket · Logic, 55 lines):

```js
const { haptic } = gs.device;
const { PAL } = gs.palettes;
```
