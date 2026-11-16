# gs.camera

3D camera rigs: chase, shoulder, first person, top, side, orbit, rail, fixed.

`gs.camera.CameraRig` (3D): `chase`, `shoulder`, `first`, `top`, `side`, `orbit`, `rail`, `fixed`; walls, blends, `shake`, `kick`.

**First person feels like a body.** In `first` the eye bobs with each stride (`rig.step`), leans into a strafe, dips as
it lands from a fall (found by itself, or `rig.land(speed)`), and its `shake` turns the view instead of moving the eye.
`rig.recoil(pitch, yaw, { keep })` punches the view up: `keep` of it stays in the aim, the rest holds a moment and comes
back. `rig.aiming` narrows the FOV to `fovAim` and `rig.sprinting` widens it by `fovSprint`. `bob`, `roll` and `landDip`
(0 for none) set how much; all of it is softer with Reduce motion.

**A gun in the hands: `gs.camera.GunRig`.** `new GunRig(v, gs.models.weapon('rifle'), { kind: 'rifle' })` puts the model
in front of the camera and moves it on springs that are worked out exactly, so it feels the same at 30 and 120 fps: a
shot's kick (back, rise, twist, roll, set per kind in `KICK`), lag behind the head's turns, sway with steps, a dip on
landing, lowered to run, raised to aim with the model's own `points.sight` on the middle of the screen, and kept the same
size on screen as the view zooms to aim. Set `held.aiming` and `held.sprinting` each frame and call `held.update(dt)`
after `rig.update()`; it tells the rig and the view (`v.aiming` softens a Next Gen view's edges). A `gs.combat`
`Loadout` made in the same card kicks, draws and reloads it by itself; by hand, `held.fire()`, `held.draw()`,
`held.reload(secs)`. `gs.camera.Spring` is the spring on its own, for your own things.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CameraPart`, line 1878), where every option and field is described.

- `CameraRig: new (view: Loose, o?: { mode?: RigMode; distance?: number; height?: number; side?: number; look?: number; lag?: number; lead?: number; fov?: number; /** Wha…` (:1879)
- `GunRig: new (view: Loose, model?: Loose | null, o?: { kind?: string; kick?: GunKick; /** [x, y, z] in front of the eye at the hip. */ hip?: number[]; /** [x, y, z] whe…` A gun held in first person that moves like a real one: springs for a shot's kick (back, up, twist, roll), lagging the head's turns, swaying with steps, dipping on landing, lowered to run, raised to aim with the… (:1898)
  - `root: Loose` The group in front of the camera the model sits in. (:1907)
  - `model: Loose | null` (:1907)
  - `kind: string` (:1907)
  - `hip: number[]` (:1907)
  - `ads: number[]` (:1907)
  - `aiming: boolean` Raised to the eye (eased in), and lowered to run. (:1908)
  - `sprinting: boolean` (:1908)
  - `hold(model: Loose, kind?: string | null): Loose` Puts another model in the hands (and another kind's pose and kick): the one before. (:1909)
  - `fire(strength?: number, kind?: string | null): GunRigT` A shot: the kind's kick (strength 1; kind: another kind's), and the eye's punch on the rig. (:1910)
  - `land(speed?: number): GunRigT` (:1911)
  - `draw(): GunRigT` Brought up from below (a draw or a switch). (:1911)
  - `reload(secs?: number): GunRigT` Tipped over and lowered for a reload of secs seconds. (:1911)
  - `update(dt: number): GunRigT` (:1912)
  - `dispose(): void` (:1912)
- `Spring: new (o?: { freq?: number; damp?: number; x?: number; target?: number }) => { x: number; v: number; target: number; freq: number; damp: number; push(v: number):…` A spring worked out exactly (the same at any frame rate): freq Hz, damp (1 no overshoot, below a bounce). (:1900)
- `KICK: Record<string, GunKick>` Each kind's kick at the hip (aiming takes a little under half). (:1902)

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
