# gs.effects

Feel: coin, hit, boom, jump and more as particles, shake, sound and haptics in one call.

`gs.effects.Feel`: `coin`, `hit`, `boom`, `hurt`, `jump`, `land`, `shoot`, `powerup`, `combo`, `score`, `win`, `lose`, `click`: particles + shake + sound + haptics in one call.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts`, where every option and field is described.

- `effects: { Feel: typeof Feel }` (:5680)

## From the maker kit

From [Maker kit](../maker-kit.md#maker-kit):

Games use all of it through one import, `gs`:

```js
import gs from '../gamescroll.js';
const { sounds } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects;
```

From [Starter templates](../maker-kit.md#starter-templates):

Every template starts the way a finished game does, so a new game has these from its first line:
a **fixed tick** (`tick: 60`: the same game on every phone, drawn between ticks with `gs.tick.mix`),
**Ready** (`gs.rounds.Ready`: nothing moves or scores until the first tap), **Feel**
(`gs.effects.Feel`: particles, shake, sound and a buzz in one call, following the player's settings),
a **soundtrack in one line** (`music: 'happy'` in the definition) and a HUD that keeps out of the
app's score badge.

From [Effects](../maker-kit.md#effects):

`const { Feel } = gs.effects;` The sight, sound and buzz of common moments in one call.

```js
const feel = new Feel();                 // new Feel({ pixel: true }) for pixel styles
reset()    { feel.clear(); }
update(dt) { feel.update(dt); if (feel.frozen) return; }
draw(c)    { feel.begin(c); /* the world */ feel.end(c, W, H); }
feel.coin(x, y); feel.hit(x, y, { power: .8 }); feel.boom(x, y, { size: 1.5 }); feel.hurt(x, y);
feel.jump(x, y); feel.land(x, y, speed); feel.shoot(x, y); feel.powerup(x, y); feel.combo(n, x, y);
feel.score(x, y, 50); feel.win(x, y); feel.lose(); feel.click(); feel.play(zzfxNumbers);
```

`feel.juice` is the Juice underneath, for your own particles and tweens. `feel.end()` undoes the shake
(a canvas `restore()`) but keeps the text settings you set while drawing the world (`textAlign`,
`textBaseline`, `font`), so a HUD drawn after it doesn't need to set them again.

## In real games

200 games use it (`node scripts/examples.mjs gs.effects` lists them). The shortest:

`src/games/colour-flood.js` (Colour Flood, Pocket · Puzzle, 47 lines):

```js
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
// …
function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
// …
  return {
    reset() { score = 0; boards = 0; t = 0; dead = 0; feel.clear(); build(); },
    update(dt) { feel.update(dt); t += dt; if (win) { win += dt; if (win > .6) { boards++; build(); } } },
    fx(dt) { dead += dt; feel.update(dt); },
// …
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H); const mine = region(g);
      feel.begin(c);
// …
      for (let col = 0; col < K; col++) { const X = 20 + col * 32, Y = 140; c.fillStyle = R[0]; c.fillRect(X - 1, Y - 1, 26, 16); tile(c, X, Y, col, 2
      feel.end(c, W, H);
```

`src/games/merge-ten.js` (Merge Ten, Casual · Merge, 51 lines):

```js
const { haptic } = gs.device;
const { Feel } = gs.effects;
// …
function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
// …
  return {
    reset() { best = 3; g = Array.from({ length: N * N }, () => 1 + (Math.random() * 3 | 0)); while (stuck()) g[Math.random() * N * N | 0] = g[0]; sco
    update(dt) { feel.update(dt); t += dt; for (const p of pops) p.l -= dt; pops = pops.filter(p => p.l > 0); fallY = fallY.map(v => Math.max(0, v - d
// …
      c.fillStyle = '#ffffffcc'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`Highest: ${best}`, W / 2, 120);
      feel.begin(c);
// …
      for (const p of pops) { c.strokeStyle = `rgba(255,255,255,${p.l * 2})`; c.lineWidth = 3; c.beginPath(); c.roundRect(p.x + 4 - (1 - p.l * 2) * 8,
      feel.end(c, W, H);
```
