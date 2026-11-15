# gs.ar

AR 3D: the camera and gyro view, the floor, anchors and markers.

Guide: [AR 3D guide](../ar-3d.md).

`gs.ar` (`ARView`, `FLOOR`, `arNote`; with native AR, `new ARView({ occlude: true, walls: true, light: 'real' })` lets real things hide virtual ones, maps walls and follows the room's light, `v.anchor(p, q)` holds a real spot and `v.marker(markerArt(seed))` finds a printed picture: all bonuses, never the only way to play)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ArPart`, line 1646), where every option and field is described.

- `ARView: new (...a: Loose[]) => Loose` (:1646)
- `FLOOR: Loose` (:1646)
- `arNote: Loose` (:1646)
- `markerArt: (seed?: number, size?: number) => HTMLCanvasElement` (:1646)
- `THREE: Loose` (:1646)

## In real games

15 games use it (`node scripts/examples.mjs gs.ar` lists them). The shortest:

`src/games/ghost-torch.js` (Ghost Torch, AR · Spooky, 119 lines):

```js
const { Particles, pbr, THREE } = gs.hd;
const { ARView, arNote } = gs.ar;
// …
  function setup() {
    v = new ARView();
// …
      if (!v) setup();
      v.off(); v.recenter();
// …
    update(dt) {
      v.live(); if (v.calibrating) return;   // finding or lining up the floor: the round waits
// …
        place(gh);
        const [sx, sy, z] = v.toScreen(gh.m.position.x, gh.m.position.y, gh.m.position.z);
// …
          drop(gh); ghosts.splice(ghosts.indexOf(gh), 1);
          if (candles <= 0) { ended = true; v.off(); sounds.lose(); api.over(); }
// …
    draw(c) {
      v.look();
      v.draw(c, W, H);
```

`src/games/echo-drums.js` (Echo Drums, AR · Memory, 128 lines):

```js
const { Particles, pbr, rbox, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
// …
  function setup() {
    v = new ARView();
// …
    let best = null, bd = 60;
    for (const d of drums) { const p = d.grp.position, [sx, sy, z] = v.toScreen(p.x, p.y + .25, p.z); const dist = Math.hypot(sx - x, sy - y); if (z <
// …
      sticks--; haptic('error'); fx.flash('#ff4060', .3).shake(4); sfx(110, .4, 'sawtooth', .05);
      if (sticks <= 0) { ended = true; v.off(); sounds.lose(); msg = 'OUT OF STICKS'; ml = 2; api.over(); return; }
// …
      if (!v) setup();
      v.off(); v.recenter(); layout();
// …
    update(dt) {
      v.live(); if (v.calibrating) return;   // finding or lining up the floor: the round waits
// …
    draw(c) {
      v.look();
      v.draw(c, W, H);
```
