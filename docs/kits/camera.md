# gs.camera

3D camera rigs: chase, shoulder, first person, top, side, orbit, rail, fixed.

`gs.camera.CameraRig` (3D): `chase`, `shoulder`, `first`, `top`, `side`, `orbit`, `rail`, `fixed`; walls, blends, `shake`, `kick`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CameraPart`, line 1840), where every option and field is described.

- `CameraRig: new (view: Loose, o?: { mode?: RigMode; distance?: number; height?: number; side?: number; look?: number; lag?: number; lead?: number; fov?: number; /** Wha…` (:1841)

## From the maker kit

From [Camera rigs](../maker-kit.md#camera-rigs):

`const { CameraRig } = gs.camera;` Moves a 3D camera for you: `chase`, `shoulder`, `first`, `top`,
`side`, `orbit`, `rail` and `fixed`. It stays out of walls, blends between rigs, shakes and kicks.

```js
rig = new CameraRig(v, { mode: 'chase', distance: 6, height: 2.2, walls: [level] });
rig.yaw += dragX * .01; rig.pitch += dragY * .01;   // look around
rig.update(dt, hero);                               // any Object3D, or { position, yaw }
rig.to('shoulder', .4); rig.shake(.5); rig.kick(8, .25);
const fwd = rig.forward(), right = rig.right();     // "stick up = away from the camera"
```

Settings (also `rig.set({...})`): `distance`, `height`, `side`, `look`, `lag`, `lead`, `fov`, `walls`,
`pitchMin`, `pitchMax`, `rail` (a `THREE.Curve`), `at` (for `fixed`). Characters face +z.

From [Speed budget](../maker-kit.md#speed-budget):

**Next Gen and AR on fast screens.** With WebGPU on, a 3D game the phone can't draw at the screen's
rate (90, 120 or 144 Hz) gets made frames between its real ones (frame generation), so it still moves
at the screen's rate; the same happens while the phone is warm or low on battery. Nothing to do in the
game. `frameGen: 'ahead'` in the definition guesses ahead instead of blending (no added delay, for
reflex and rhythm games), `frameGen: false` turns it off, and `v.cut()` after a camera jump starts it
(and the upscaler) fresh. A game that turns its own camera from touch can add
`v.aimNow(cam => { cam.rotation.y = lookAngle; })` so made frames turn with the finger at the screen's
rate (`gs.camera` rigs do this already). Details: [docs/nextgen-3d.md](nextgen-3d.md#frame-generation).

## In real games

No game uses `gs.camera` yet: the examples above are what there is.
