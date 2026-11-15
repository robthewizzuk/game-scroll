# gs.prefs

The player's Reduce motion setting (read only), to scale your own big effects.

`gs.prefs` (read only): the player's Reduce motion setting, `reduceMotion`, `motion`. Shake, flash and camera kicks already follow it; scale your own big effects by

`gs.prefs.motion`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PrefsPart`, line 1430), where every option and field is described.

- `readonly reduceMotion: boolean` (:1430)
- `readonly motion: number` 1 normally, smaller with Reduce motion: scale your own shakes and flashes by it. (:1430)

## In real games

3 games use it (`node scripts/examples.mjs gs.prefs` lists them). The shortest:

`src/games/kit-hunt.js` (Kit Hunt, Bricks · Phone, 159 lines):

```js
    draw(c) {
      const sx = shake ? Math.round(rnd(-2, 2) * gs.prefs.motion) : 0;
```

`src/games/critter-quest.js` (Critter Quest, Color · RPG, 211 lines):

```js
      const me = lead(), sx = shake > 0 ? Math.round(Math.sin(t * 80) * 2) : 0, L = layout();
      c.fillStyle = flash > 0 && !gs.prefs.reduceMotion && (t * 10 | 0) % 2 ? '#f8f8f0' : '#f0e8c8'; c.fillRect(0, 0, W, H);   // no strobe with Reduc
```
