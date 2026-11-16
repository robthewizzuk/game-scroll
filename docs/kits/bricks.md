# gs.bricks

Toy bricks in 3D.

`gs.bricks` (toy bricks)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BricksPart`, line 1690), where every option and field is described.

- `BRICK: Loose` (:1690)
- `BRICK_KEYS: Loose` (:1690)
- `STUD: Loose` (:1690)
- `brick: Loose` (:1690)
- `brick3d: Loose` (:1690)
- `stud: Loose` (:1690)
- `stud3d: Loose` (:1690)

## In real games

8 games use it (`node scripts/examples.mjs gs.bricks` lists them). The shortest:

`src/games/build-rush.js` (Build Rush, Bricks · Speed, 101 lines):

```js
const { backdrop } = gs.gfx;
const { brick, BRICK_KEYS } = gs.bricks;
// …
        const x = mx + b.x * C, y = base - (b.r + 1) * C;
        if (i < step) brick(c, x, y, b.w * C, C, b.col, C);
        else if (i === step) { if ((t * 4 | 0) % 2) brick(c, x, y, b.w * C, C, b.col, C); c.strokeStyle = '#d83a2c'; c.lineWidth = 1; c.strokeRect(x -
// …
      // callout box for the next brick
      const need = model[step], cx = bx + bookW - 8 - 4 * C - 6; c.fillStyle = '#f8f0c0'; c.fillRect(cx, by + 4, 4 * C + 8, C + 12); c.strokeStyle = '
// …
      const sx = shake > 0 ? Math.sin(shake * 80) * 2 : 0;
      for (const s of sl) { backdrop(c, s.x + 2 + sx, s.y + 2, s.w2 - 4, s.h2 - 4, '#2e333e', '#474d5c'); const bw = s.w * C; brick(c, s.x + (s.w2 - b
      if (flyer) { const k = flyer.k, x = flyer.x0 + (flyer.x1 - flyer.x0) * k, y = flyer.y0 + (flyer.y1 - flyer.y0) * k - Math.sin(k * Math.PI) * 30;
```

`src/games/pile-builder.js` (Pile Builder, Bricks · Puzzle, 122 lines):

```js
const { backdrop, glow } = gs.gfx;
const { brick, BRICK_KEYS } = gs.bricks;
// …
      const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#68b8f8'); sky.addColorStop(1, '#d0ecff'); c.fillStyle = sky; c.fillRect(0,
      for (let i = 0; i < 4; i++) { const x = (i * 61 + t * 4) % (W + 40) - 20; brick(c, x, 18 + (i % 2) * 14, 24, 6, 'white', 6); }
// …
      let x0 = 0, lift = 0;
      const seg = (a, b, lf) => { for (let x = a; x < b; x += 16) brick(c, x, g() - lf, Math.min(16, b - x), H - g() + lf, 'green', 8); };
// …
      for (const o of obs) {
        if (o.k === 'gap') { seg(x0, o.x - 12, lift); x0 = o.x + 12; backdrop(c, o.x - 12, g() - lift + 4, 24, H, '#183048', '#04080c'); if (o.built) 
        else if (o.k === 'step') { seg(x0, o.x, lift); x0 = o.x; lift = o.top; if (o.built) { for (let i = 0; i < 3; i++) brick(c, o.x - 9 + i * 3, g(
// …
        const by = g() - o.base;
        if (o.k === 'gate') { if (!o.built || !o.passed) { c.fillStyle = '#585c64'; for (let i = 0; i < 3; i++) c.fillRect(o.x - 4 + i * 4, by - (o.bu
        if (o.k === 'wall') { for (let i = 0; i < 5; i++) brick(c, o.x - 4, by - 6 - i * 6, 10, 6, 'grey', 5); if (o.built) { brick(c, o.x - 18, by - 
// …
          const px = o.pile.x, py = pileY(o);
          if (o.pile.crate) { brick(c, px - 8, py - 14, 16, 14, 'tan', 8); c.fillStyle = '#907040'; c.fillRect(px - 8, py - 8, 16, 1); c.fillRect(px -
```
