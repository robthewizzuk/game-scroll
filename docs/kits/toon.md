# gs.toon

Classic Console 3D: a cel-shaded view, parts, figures.

Guide: [Classic Console 3D guide](../console-3d.md).

`gs.toon` (Console 3D: `View` with real toon shadows and a rim of light, `{ retro: 'chunky'|'soft'|'tube' }` looks, `G`, `part`, `grp`, `blob`, `toon`, `dude`, `figure` (a jointed person with a `gs.poses` rig))

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ToonPart`, line 1606), where every option and field is described.

- `View: new (o?: ToonViewOptions) => Loose` (:1607)
- `G: Loose` (:1607)
- `part: Loose` (:1607)
- `grp: Loose` (:1607)
- `blob: Loose` (:1607)
- `toon: Loose` (:1607)
- `flat: Loose` (:1607)
- `dude: Loose` (:1607)
- `has3D(): boolean` (:1607)
- `THREE: Loose` (:1607)
- `figure(o?: { h?: number; body?: string; skin?: string; legs?: string; shoes?: string; hair?: string | null; eyes?: string | null }): Loose & { rig: RigT }` A jointed cel-shaded person h units tall (best 24 or more) with the gs.poses joints: figure().rig.play('walk'), rig.update(dt, { speed }) each frame. (:1609)

## In real games

18 games use it (`node scripts/examples.mjs gs.toon` lists them). The shortest:

`src/games/fuse-pass.js` (Fuse Pass, Console · Party, 112 lines):

```js
const { Juice } = gs.juice;
const { View, G, part, grp, blob } = gs.toon;
// …
  if (!v3) {
    v3 = new View({ bg: '#302048', sun: [-.4, 1, .6] });
    v3.def('table', () => part(G.cyl, '#8a5a30', { y: -.5 }));
    for (let i = 0; i < 5; i++) v3.def('kid' + i, () => grp(part(G.pill, SHIRT[i], { sx: 9, sy: 9, sz: 9, y: 6 }), part(G.ball, SKIN[i], { s: 8, y: 14
    v3.def('cake', () => grp(part(G.cyl, '#f0e0f0', { sx: 9, sy: 5, sz: 9, y: 2.5 }), part(G.cyl, '#f080b0', { sx: 9.5, sy: 1.5, sz: 9.5, y: 5 }), par
    v3.def('spark', () => part(G.ball, '#ffe060', { s: 3, glow: 1 }));
// …
  }
  v3.board(W, H, .7);
```

`src/games/blueprint-stack.js` (Blueprint Stack, Bricks · Puzzle, 124 lines):

```js
const { brick, brick3d, BRICK_KEYS } = gs.bricks;
const { View, G, part, grp, flat } = gs.toon;
// …
    if (!v3) {
      v3 = new View({ bg: '#1c3c68', sun: [-.5, .9, .8], sunI: 2.4, amb: 1, sky: '#c0d8ff', ground: '#203050' });
      v3.add(part(G.box, '#2a5288', { sx: 2000, sy: 2000, sz: 2, z: -60, line: false }));
      for (let i = -10; i <= 10; i++) { v3.add(part(G.box, '#30588c', { sx: .6, sy: 2000, sz: 1, x: i * 16, z: -58.5, line: false })); v3.add(part(G.b
      v3.def('ghost', () => part(G.box, flat('#a8d0ff', .18)));
      v3.def('bad', () => part(G.box, flat('#f84040', .35)));
      v3.def('aim', () => part(G.box, flat('#ffffff', .15)));
      v3.def('base', () => part(G.box, '#8c9098'));
```
