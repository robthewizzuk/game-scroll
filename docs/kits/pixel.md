# gs.pixel

Crisp pixel text in pixel fonts, sprites and animations drawn from text, tiles.

`gs.pixel`: `text(c, str, x, y, { size, font: 'small'|'big'|'tiny'|'silkscreen'|'jersey'|'terminal', align, color, outline })`, `sprite(art, palette)`, `anim(frames, palette, fps)`, `tiles()`.

Text drawn before is remembered: drawing the same text again makes nothing new, so a HUD can call `text()`
every frame (text that changes, a score or a timer, is drawn afresh once each time it changes).

The built-in 3×5 font (`font: 'small'`, the default, and `Ready({ pixel: true })`) has A to Z (small letters
come out as capitals), 0 to 9 and `. , ! ? : ; - + = / \ ( ) [ ] { } ' " % * < > # _ $ @ & | ^ ~ ` ♥ ♪ × · • ° – — ‘ ’ “ ” … ← → ↑ ↓`.
Anything else is drawn as `?`; `node scripts/game-lint.mjs <id>` names any letter a game's text uses that it hasn't got.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PixelPart`, line 625), where every option and field is described.

- `text(c: Ctx, str: string, x: number, y: number, o?: { size?: number; font?: PixelFontName; align?: 'left' | 'center' | 'right'; color?: string; outline?: string | null…` Crisp pixel text with its top-left at x, y; returns the width drawn. (:631)
- `measure(str: string, font?: PixelFontName): { w: number; h: number }` Width and height in pixels at size 1. (:633)
- `sprite(art: string | string[], palette: Record<string, string> | string[]): Loose` (:634)
- `anim(frames: (string | string[])[], palette: Record<string, string> | string[], fps?: number): Loose` (:635)
- `tiles(art: Loose, palette: Loose, tw: number, th: number): Loose` (:636)

## From the maker kit

From [Pixel text and sprites](../maker-kit.md#pixel-text-and-sprites):

`const { text, measure, sprite, anim, tiles } = gs.pixel;`

```js
text(c, 'SCORE 120', 4, 4, { size: 2, color: '#fff' });                       // 3×5 font, always crisp
text(c, 'GAME OVER', W / 2, 80, { font: 'big', align: 'center', outline: '#000' });   // 8×8 font
text(c, 'Find the key', 4, 20, { font: 'tiny' });                             // four more pixel fonts, below
const hero = sprite(`
  ..kk..
  .kyyk.
  ..kk..`, { k: '#000', y: '#fd0' });     // one letter per pixel, '.' is clear
hero.draw(c, x, y, { scale: 3, flip: true, outline: '#fff' });
const red = hero.recolor({ y: '#f33' });
const walk = anim([frameA, frameB], palette, 8);  walk.draw(c, x, y, time, { scale: 3 });
```

Sprites and text are drawn once and cached. `sprite.solid(px, py)` is for pixel-perfect hits;
`tiles(art, palette, 8, 8)` cuts a tile sheet.

The pixel fonts for `text(c, str, x, y, { font })`. Each is drawn at the one size its pixels sit on
the grid, so it is always crisp; `size: 2` doubles it. `text()` returns the width it drew and
`measure(str, font)` gives `{ w, h }` at size 1 without drawing.

`'small'` and `'big'` are always there. The other four are fetched the first time a game names them
(a few kilobytes each) and the text draws in the 8×8 font for the moment before one arrives; call
`gs.fonts.use('Tiny5')` in `make()` or `reset()` if the first frame must already have it (see
[Fonts](#fonts) for the names).

From [Fonts](../maker-kit.md#fonts):

- The pixel fonts (`Press Start 2P`, `Silkscreen`, `Tiny5`, `Jersey 10`, `VT323`) are in the list too.
  In the pixel styles draw them with `gs.pixel.text` ([above](#pixel-text-and-sprites)), which keeps
  every pixel hard; `font('VT323', 25)` on a smooth Phone game is fine for a retro label.

From [Rounds and scenes](../maker-kit.md#rounds-and-scenes):

`ready.waiting`, `ready.t` (seconds waited, for an idle animation), `ready.since` (seconds playing).
`ready.draw(c, W, H, { text, x, y, color, size, pixel: true })`: pixel styles blink gs.pixel text in
a palette colour you pass. Call `ready.go()` from a tilt or a shout to start the same way.

## In real games

71 games use it (`node scripts/examples.mjs gs.pixel` lists them). The shortest:

`src/games/quiet-ninja.js` (Quiet Ninja, Pocket · Mic, 78 lines):

```js
const { Feel } = gs.effects;
const { text } = gs.pixel;
// …
        if (g.wake > 0 && !awake) { c.fillStyle = P[0]; c.fillRect(gx - 6, FLOOR - 36, 12, 2); c.fillStyle = P[3]; c.fillRect(gx - 6, FLOOR - 36, Math
        if (awake) { c.fillStyle = P[0]; c.font = '8px "Press Start 2P", monospace'; text(c, '!', gx - 2, FLOOR - 32 - 8, { color: P[0], font: 'big' }
```

`src/games/sprint-feet.js` (Sprint Feet, Advance · Sport, 88 lines):

```js
const { Feel } = gs.effects;
const { text } = gs.pixel;
// …
      c.fillStyle = flashL ? '#f8f8f0' : '#383848'; c.fillRect(4, H - 44, bw, 40); c.fillStyle = flashR ? '#f8f8f0' : '#383848'; c.fillRect(W - 4 - bw
      text(c, 'LEFT', 4 + bw / 2, H - 28, { align: 'center', color: flashL ? '#383848' : '#f8f8f0' }); text(c, 'RIGHT', W - 4 - bw / 2, H - 28, { alig
      text(c, `HEAT ${heat}`, 4, 3, { color: '#f8f8f0' }); text(c, `${Math.min(RACE, Math.floor(you.d))}M`, W - 4, 3, { align: 'right', color: '#f8f8f
      if (phase === 'set') text(c, cd > 1.2 ? 'ON YOUR MARKS' : 'GET SET', W / 2, 74, { font: 'big', align: 'center', color: '#f8f8f0', outline: '#202
      if (ml > 0) text(c, msg, W / 2, 74, { font: 'big', align: 'center', color: '#f8d038', outline: '#202028' });
      if (heat === 1 && phase !== 'done' && t < 6) text(c, 'TAP LEFT, RIGHT, LEFT...', W / 2, H - 54, { align: 'center', color: '#f8f8f0', outline: '#
```
