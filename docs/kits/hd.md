# gs.hd

Next Gen HD 3D: the view with shadows, bloom, reflections, lamps, lens, decals and more.

Guide: [Next Gen 3D guide](../nextgen-3d.md).

`gs.hd` (Next Gen: `HDView` with `decal`, `bounce` (bounce light), `room` (room reflections), `reflect(floor)` (marks shiny things for reflections; ray traced on the best phones, where a floor also shows what is off screen), `detail` (cluster detail: big meshes, still or moving, copies, skinned people, drawn only as finely as shows, by itself from 8,000 triangles), `occluders` (occlusion culling: what is behind other things is left out by itself; this adds boxes of your own), `farWorld` (the far world drawn into pictures round a camera that keeps still, and shown from them: a valley below a nest), `beams` (volumetric light), `motionBlur`, `lens` (a real camera: depth of field from the f-stop, bokeh discs, focus pulls and autofocus, exposure in stops), `bakeLight`, `shafts`, `lampLights` + `placeLamps` (many lamps: the nearest lit, with shadows, light shapes like a headlamp's beam or a window's bars, and neon tubes and signs from `neon` and `sign`), `contactShadows` and `farShadows` (finer sun shadows on WebGPU: cups, fingers and noses close up, far hills and towers; a crowd's far people throw capsule shadows by themselves), `flash` (a short-lived light: muzzle flashes; gs.fx3d fire, explosions and sparks and gs.gas blasts light the scene by themselves, and smoke takes the lamps' light), `pbr`, `rbox`, `surface`, `speckle`, `Particles`, `sun`, `spot`)

**No shader built mid-round.** Under the loading screen after Play the view builds the shaders for
everything in the scene, hidden things too (a victory marker, a muzzle flash, drops not poured yet), for the picture
the scene is really drawn into, and again for what the round's first `update()` made. Make what a round shows in
`make()`, `reset()` or that first `update()` and hide it until it's wanted, rather than adding it later. A
material swapped in later: `v.warm(material)`; a new level made mid-game: `v.precompile()` while the screen is faded.
A light switched on or off changes every lit shader (the lamps keep their lights on and go dark instead:
`v.lampLights`, `v.flash`). `node scripts/budget.cjs <id>` says if a shader was still built in play.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`HdPart`, line 1656), where every option and field is described.

- `ContactShadows: new (o?: { y?: number; size?: number; blur?: number; darkness?: number; opacity?: number; height?: number }) => Loose` (:1656)
- `HDView: new (...a: Loose[]) => Loose` (:1656)
- `HD: Loose` (:1656)
- `TIERS: Loose` (:1656)
- `hasHD(): boolean` (:1656)
- `pbr: Loose` (:1656)
- `rbox: Loose` (:1656)
- `surface: Loose` (:1656)
- `speckle: Loose` (:1656)
- `panel(col?: string | number, i?: number, w?: number, h?: number, o?: { glow?: boolean }): Loose` panel(colour, intensity, w, h, { glow }): an area light, a glowing w x h rectangle shining out of its front (-z; aim with lookAt). (:1656)
- `neon(points: (number[] | Loose)[], o?: { colour?: string; thick?: number; glow?: number; i?: number; reach?: number; lights?: number }): Loose` neon(points, { colour, thick, glow, i, reach, lights }): a glowing neon tube along [[x, y, z], ...] (a Group); g.spots(list?) gives its longest runs as lamp spots for v.placeLamps (tube lights: a long tube makes a… (:1656)
- `sign(w: number, h: number, paint?: (c: CanvasRenderingContext2D, w: number, h: number) => void, o?: { colour?: string; glow?: number; i?: number; reach?: number; px?: …` sign(w, h, paint(ctx, pw, ph), { colour, glow, i, reach, px, picture }): a lit sign w x h metres facing +z (turn the group to aim it) whose face you paint on a canvas; g.spots(list?) gives one lamp spot that lights… (:1656)
- `lut(look: string | ((r: number, g: number, b: number) => number[]), o?: { size?: number }): Loose` lut(look, { size }): a colour look table for v.lut, from a name, (r, g, b) => [r, g, b] (screen colours 0..1) or .cube file text. (:1656)
- `pulse(m: Loose, o?: { at?: { value: Loose }; radius?: { value: number }; strength?: { value: number }; color?: number[] | Loose; width?: number; fill?: number }): Loose` pulse(material, { at, radius, strength, color, width, fill }): a glowing ring sweeping out from a point (sonar, shockwave). (:1656)
- `Particles: Loose` (:1656)
- `GPUParticles: new (view: Loose, o?: { max?: number; additive?: boolean; gravity?: number; drag?: number; bounce?: number; floor?: number | null; turbulence?: { strengt…` Tens of thousands of particles moved on the graphics chip with WebGPU (capped on the CPU with WebGL). (:1658)
- `sun: Loose` (:1667)
- `spot: Loose` (:1667)
- `THREE: Loose` (:1667)
- `noiseTex(): Loose` A shared 256 x 256 tiling noise texture (four noise sizes in r, g, b, a) for your own shaders: clouds, water, grass. (:1669)
- `bakeRenderer(): Loose` The shared WebGL renderer for kit bakes (gs.outdoors impostor()); null without 3D. (:1671)

## From the maker kit

From [3D extras](../maker-kit.md#3d-extras):

- `fx = new Particles3D(scene)`, then `fx.fire(pos)`, `fx.smoke(pos)`, `fx.magic(pos)`, `fx.snow(pos)`
  (keep going: `.stop()`, `.remove()`, `.at(pos)`) and `fx.boom(pos)`, `fx.sparks(pos)` (one-off), or
  your own with `fx.make(pos, { life, speed, size, colors, rate, burst, shape, gravity, glow... })`.
  Call `fx.update(dt)` every frame; `fx.count` is how many are flying. `new Particles3D(scene, { seed: 7 })`
  makes the same particles every time (replays). These are small effects (tens to hundreds of dots,
  moved by the kit and drawn in two draw calls); for thousands, Next Gen has `gs.hd.GPUParticles`.

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Next Gen extras** (`gs.hd` HDView): `v.decal(mesh, point, normal, { size, colour, paint, life })` puts a
mark on a surface that wraps over its shape (scorches, footprints, paint; capped at 40, oldest
first; on WebGPU hundreds cost no draws, as boxes in the lamps' grid), `v.bakeLight({ box, maps: [land.mesh] })` bakes a whole level's light on the phone the first time it is played (probes and the ground's light map, kept on the phone; docs/nextgen-3d.md), `v.bakeLight([x, y, z], { radius })` bakes the light around a point into a light probe so rooms
and caves pick up the colour of their walls and windows (several blend as the camera, or
`v.probeAt`, moves; bake once after building the level: it returns a promise and joins a frame or two later), `v.bounce(box)` adds bounce light over a level (a grid of probes: a red wall tints the floor, light from a door fills a room; WebGL and WebGPU), `v.room(box)` gives shiny things in a room box-projected reflections of that room, `v.detail(meshes)` asks for cluster detail on meshes under 8,000 triangles (big meshes get it by themselves, still or moving, copies, several materials, cut-outs, skinned and morphing: each part is drawn only as finely as shows, see docs/nextgen-3d.md; `v.detail(meshes, false)` draws them whole), what is fully hidden behind other things is left out of the frame by itself (occlusion culling, from the last frame's own depth: nothing to list; `mesh.userData.noOcclude = true` always draws a mesh, and `v.occluders(boxes)` adds big solid boxes of your own, as `gs.city` does for its buildings), and `v.shafts = 1` adds sun shafts streaming
past whatever blocks the sky (not on the lowest tier).

## In real games

38 games use it (`node scripts/examples.mjs gs.hd` lists them). The shortest:

`src/games/ghost-torch.js` (Ghost Torch, AR · Spooky, 119 lines):

```js
const { Gestures } = gs.controls;
const { Particles, pbr, THREE } = gs.hd;
// …
    v = new ARView();
    sparks = new Particles(v, { max: 400, additive: true });
    geo = { head: new THREE.SphereGeometry(.2, 20, 14), skirt: new THREE.ConeGeometry(.2, .38, 20, 1, true), eye: new THREE.SphereGeometry(.035, 8, 6)
// …
  function ghostMesh() {
    const m = new THREE.Group();
    const mat = pbr('#e8f0ff', { glow: .8, rough: .4, transparent: true, opacity: .1, depthWrite: false });
    const head = new THREE.Mesh(geo.head, mat); head.position.y = .1;
    const skirt = new THREE.Mesh(geo.skirt, mat); skirt.rotation.x = Math.PI; skirt.position.y = -.1;
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#101020', transparent: true, opacity: .1 });
```

`src/games/echo-drums.js` (Echo Drums, AR · Memory, 130 lines):

```js
const { Gestures } = gs.controls;
const { Particles, pbr, rbox, THREE } = gs.hd;
// …
    drums = DRUMS.map((d, i) => {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .2, .5, 28), pbr(d.col, { rough: .35, clear: 1 }));
// …
      body.position.y = .25;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.22, .02, 8, 28), pbr('#d8d8e0', { rough: .2, metal: .9 })); rim.rotation.x = Math.PI / 2; ri
      const skinMat = pbr('#f4ecd8', { rough: .7, glow: 0, glowCol: d.col });
      const skin = new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .02, 28), skinMat); skin.position.y = .5;
      const legs = new THREE.Mesh(rbox(.06, .5, .06, .02), pbr('#30303a', { metal: .6, rough: .4 })); legs.position.y = -.25;
      grp.add(body, rim, skin, legs); grp.traverse(o => { o.castShadow = true; });
```
