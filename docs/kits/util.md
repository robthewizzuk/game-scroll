# gs.util

Small helpers: clamp, rnd, pix, disc, hash, fmt, letter, flick speed.

`gs.util`: `clamp`, `rnd`, `pix`, `disc`, `hash`, `fmt`, `letter(i)` ('A' + i), `flickTracker`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`UtilPart`, line 443), where every option and field is described.

- `clamp(v: number, a: number, b: number): number` (:444)
- `rnd(a: number, b: number): number` (:445)
- `pix(c: Ctx, map: string[], x: number, y: number, col: Record<string, string>): void` Draws a tiny pixel map: each char keys into col, '.' is clear. (:447)
- `disc(c: Ctx, x: number, y: number, r: number): void` (:448)
- `hash(str: string): number` (:449)
- `fmt(n: number): string` (:450)
- `flickTracker(): Loose` (:451)
- `letter(i: number, o?: { lower?: boolean }): string` The i-th letter: letter(0) is 'A' (wraps after 'Z'); { lower: true } for lower case. (:453)

## In real games

187 games use it (`node scripts/examples.mjs gs.util` lists them). The shortest:

`src/games/untangle.js` (Untangle, Casual · Puzzle, 56 lines):

```js
const { haptic } = gs.device;
const { rnd } = gs.util;
// …
  function build() {
    const sol = Array.from({ length: n }, () => ({ x: rnd(PAD, W - PAD), y: rnd(TOP, BOT) }));
// …
    for (const [i, j] of cand) { if (edges.length >= n * 1.6) break; if (edges.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && cross(sol[
    do { pts = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 + rnd(-.2, .2); return { x: W / 2 + Math.cos(a) * 130, y: (TOP + BO
```

`src/games/safe-cracker.js` (Safe Cracker, Casual · Haptics, 59 lines):

```js
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
// …
  let ang, combo, idx, time, score, t, grab, lastNum, glow, open, wrong, dead;
  function newSafe() { combo = [0, 0, 0].map(() => rnd(0, NUMS) | 0); idx = 0; open = 0; }
```
