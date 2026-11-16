# gs.prefs

The player's Reduce motion setting (read only), to scale your own big effects.

`gs.prefs` (read only): the player's Reduce motion setting, `reduceMotion`, `motion`. Shake, flash and camera kicks already follow it; scale your own big effects by

`gs.prefs.motion`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PrefsPart`, line 1440), where every option and field is described.

- `readonly reduceMotion: boolean` (:1440)
- `readonly motion: number` 1 normally, smaller with Reduce motion: scale your own shakes and flashes by it. (:1440)

## In real games

2 games use it (`node scripts/examples.mjs gs.prefs` lists them). The shortest:

`src/games/kit-hunt.js` (Kit Hunt, Bricks · Phone, 160 lines):

```js
    draw(c) {
      const sx = shake ? Math.round(rnd(-2, 2) * gs.prefs.motion) : 0;
```

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
    // bullet cam for good long shots (worked out ahead from where things are heading)
    if (!gs.prefs.reduceMotion) {
// …
    // goes with it, the first time one is asked for, and that used to be the flyover's first frame, which drew without what was still being made)
    const first = !camWas.blurred && gs.prefs.motion > 0; camWas.blurred = true;
    v.motionBlur = blur && gs.prefs.motion > 0 ? (MBLUR.amount = .5 * gs.prefs.motion, MBLUR) : first ? (MBLUR.amount = 0, MBLUR) : null;
// …
    c.fillStyle = '#050505'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, R, 0, TAU, true); c.fill('evenodd');
    const g = c.createRadialGradient(cx, cy, R * (.7 - beat * .08 * gs.prefs.motion), cx, cy, R); g.addColorStop(0, '#0000'); g.addColorStop(1, '#000d
```
