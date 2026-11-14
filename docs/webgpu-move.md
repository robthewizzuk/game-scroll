# Moving the 3D to WebGPU

Game Scroll's 3D (Classic Console, Next Gen, AR) draws with three.js's WebGL renderer. Rob's plan
(2026-11-08): build every engine part so it can move, then a WebGPU path (three.js's `WebGPURenderer`
and TSL node shaders) for top phones that support it, checked against WebGL game by game, then the
default where it's supported, with WebGL kept for older phones.

**Where it is now (stage 3, 2026-11-09):** there is no setting. On any device that offers WebGPU, Next
Gen and AR views draw on WebGPU
whenever everything in the view has a WebGPU version, and quietly stay on WebGL otherwise (checked every
frame, so a game that adds an unported effect mid-round moves back before it draws). Classic Console
views do the same on a WebGPU renderer of their own (2026-11-11: `gpu.js prepareConsoleGPU()`, the passes
in `src/kit/toon3d-gpu.js`), made on the Next Gen renderer's device when the first Console game loads.

The rules for new 3D code until then:

- Use three.js's stock materials and lights (`MeshStandardMaterial`, `MeshPhysicalMaterial`,
  `MeshToonMaterial`, `LightProbe`...). The WebGPU renderer turns them into node materials itself.
- No new `onBeforeCompile` patches, and no raw `ShaderMaterial` in games (game-lint warns).
  A look the kits need goes through `lookPatch()` in `src/kit/looks.js`, so it is named and can be
  swapped for a node in one place.
- Each screen effect is its own small pass with its own settings, so it can be rewritten in TSL on
  its own and compared side by side.
- Only the kits make renderers, and pixel reads go through one place that can wait (WebGPU reads
  pixels back asynchronously).

## How the WebGPU path works

- `src/kit/gpu.js` (no three.js): the player's pick (`gpuPick`, `setGpuPick`), `hasWebGPU()`, and
  `prepareGPU()`, which loads three's WebGPU build and `hd3d-gpu.js` and makes the one shared
  `WebGPURenderer` (the app calls it while loading the 3D parts). If three falls back to its WebGL 2
  backend, or the GPU is lost, we use our own WebGL path instead.
- `src/kit/hd3d-gpu.js`: the Next Gen look as TSL nodes, piece for piece with `FINAL_EFFECTS` (bloom as
  the same small mip chain, grade, glare, ACES and sRGB, FXAA or lens fringe, vignette, grain on the same
  pixel rows, hurt), three's GTAO plus its denoise for AO, the outdoor air (haze and valley mist) as the
  scene's fog node, GPU particles as instanced sprites reading the same arrays, and contact shadows.
  Shadows redraw every frame on WebGPU (no "only when something moved" yet).
- `src/kit/hd3d.js`: `gpuFits(view)` says what (if anything) keeps a view on WebGL; `HD.info.backend`
  and `HD.info.webgl` (the reason) show it in tests.
- Upscaling: both Snapdragon GSRs have TSL versions in `hd3d-gpu.js` (`sgsr2Gpu`, and `sgsr1Gpu` for AR
  and `v.upscaler = 'sgsr1'` views), so no view stretches its picture on WebGPU any more.
- Frame generation (WebGPU only, `src/kit/framegen.js`): the scene's pass also writes three's per-pixel
  velocity and a see-through mask (`frameGenMRT()`), the finished frame (SGSR 2's output, or the chain's
  drawn into a picture) goes to the generator, and `GpuChain.show()` puts a real or made frame on the
  screen with the vignette, grain and hurt flash. `speed.js` decides when (`frameGenFor`), `main.js`
  calls `speed.between` on the refreshes it skips. See docs/nextgen-3d.md, Frame generation.
- Checks: `node scripts/look-compare.cjs save base` then `check base --webgpu` compares fixed scenes
  (Next Gen at every tier, a dark room with lamps, a headlight and contact shadows, an outdoor valley)
  between the two; they are within 2.5/255. `npm run build:bundled && node scripts/gpu-games.cjs [--tier n] [--shots dir]`
  plays every Next Gen and AR game on both and reports which draw on WebGPU, any errors, and how
  different the first seconds of play look (a guide: each game's own randomness moves things too). Both
  use SwiftShader's Vulkan driver, so they run without a GPU.

## When the device is lost

A browser can take the WebGPU device away at any time: a driver reset after a hang, the system taking
the chip's memory back, or the browser's graphics process crashing (2026-11-13, `src/kit/gpu.js`,
"Lost graphics chips"):

- `prepareGPU()` watches the device's `lost` promise. On a loss (`lostGPU`) it forgets the renderer,
  the Console renderer and the shared compute device, waits 300 ms and makes new ones on a new device.
  A loss we caused ourselves (`window.__gpu.lose()` in tests) counts; three's own `dispose()` doesn't.
- `onGpuLoss(fn)` tells the app: `{ kind: 'lost', reason, message, n, canvases }`, then
  `{ kind: 'back', backend: 'webgpu' | 'webgl' | 'none', ms, n }`. `gpuMending()` is the mend in
  progress, `gpuLosses()` what happened last.
- While it mends, views draw nothing and keep their picture (Next Gen clears its card, Console skips the
  frame), and `stillComing` holds the loading screen. Then each view sees a new renderer (`newRenderer()`
  in `hd3d.js`): what was hidden while its shaders built shows again, the shader bookkeeping starts over,
  and everything else keyed by renderer (the environment light, GPU particles, gas, props and the other
  twins) is made again for it the first time it draws.
- `src/main.js` pauses a playing 3D round at once (`pauseWhy: 'gpu'`), shows the pause screen as a
  loading screen with Play turned off, waits for the new device and three calm frames with no shaders
  left to build (`mendStep`, the loading gate's rule), then gives "Carry on" back. A loss in the feed
  or under the loading screen needs nothing: the round starts on the new device.
- The fourth loss in a session draws with WebGL from then on. Chrome itself refuses a page any 3D after
  its graphics process has crashed twice on it; then the pause screen says to restart the app (the Mac
  and Windows app turns that rule off with `app.disableDomainBlockingFor3DAPIs()`).
- `src/perf.js` reports each loss as kind `gpu` with how it ended, and the report page has a "Graphics
  chip lost" table (docs/crash-reports.md).
- Errors in flight on the lost device are quietened for a few seconds (`unhandledrejection` with a
  device-lost message: three's pipeline error scopes), and three logs "Error resolving queries" for the
  frame timing it was reading back; both are expected.

Test: `npm run build:bundled && node scripts/gpu-loss.cjs` crashes the browser's graphics process
(Chrome DevTools' `Browser.crashGpuProcess`, a real loss) in a round of two Next Gen games and a
Console one, and checks the round comes back drawn as before, on WebGPU, with a report. `--times 4
--how destroy` checks the move to WebGL, `--times 2` Chrome's block, `--when gate` and `--when feed`
a loss before the round. The PR check runs it when `gpu.js`, `toon3d.js` or the script change.

## What still keeps a view on WebGL (the move checklist)

| Part | Where | What it needs for WebGPU |
| --- | --- | --- |
| Sky glow cap and shafts threshold | `sky.js` soft knee in the physical dome, `v.shaftsAt`; `hd3d.js` `ShaftsPass.bright()` (`thr`/`hi`/`cap`/`gain`) | The same knee in `gpuMaterials.skyDome` and the same mask numbers in `GpuChain`'s shafts |
| Sized points | `gs.sky` stars and snow (`PointsMaterial` with `size`) | WebGPU draws points 1 pixel wide whatever the size: sprites (instanced quads) instead. They don't keep a view on WebGL; they are just thin |

Status from `gpu-games.cjs` (2026-11-09): all 20 Next Gen and AR games draw on WebGPU with no errors.
2026-11-11: all 18 Classic Console games do too.

## Classic Console on WebGPU

The WebGL Console renderer draws straight to its canvas, so everything happens in the screen's colours:
see-through things blend there, fog mixes there and the ink is laid over colours that are already as the
screen shows them. The WebGPU Console renderer draws the same way, so the two pictures match
(`PICK=console,console-floor,console-side,console-persp,console-figure,console-chunky,console-soft,console-tube
node scripts/look-compare.cjs save base`, then `check base --webgpu`: under 1/255 apart):

- An 8-bit canvas and 8-bit passes, no tone mapping, and a renderer-wide `getOutput` (`celOut`) that turns
  every material's finished colour into the screen's colours as it is written, mixes the fog in after
  that, and cuts it to a retro look's few shades. three's own fog and background are off while it draws;
  the clear colour is the background as the screen shows it.
- The cel look's twin is a lighting model (`CelModel`): the ramp read at N·L, and the sun's shadow folded
  in as the ramp's dark band with one smoothed edge, the same sum as the GLSL in `toon3d.js`.
- One set of passes for every Console view: the scene in colour, the scene again as normals and depth
  (things on layer 0), then the ink and the rim of light over the colour.
- Each renderer has a shadow object of its own for a view's sun (a shadow's map belongs to the renderer
  that made it), so a view can move between the two.
- The looks that have twins are listed in `toon3d.js` `PORTED`; a view holding anything else (a
  `ShaderMaterial`, another `lookPatch`) stays on WebGL from then on, and `window.__toon.why` says what.

## Done: gs.fx3d, reflections and light probes on both

Nothing a game can ask for from `gs.fx3d`, `v.reflect()` or `v.bakeLight()` keeps a view on WebGL any more
(`hd3d.js` `gpuFits`); only a screen pass of the game's own (one not made by `gs.fx3d`) still does.

- **3D text** (`src/kit/text3d.js`): distance-field letters made on the phone from the app's fonts with
  TinySDF, drawn by a stock `MeshBasicMaterial` with the `sdf` look (`lookPatch` on WebGL, `sdfLook` in
  `hd3d-gpu-fx.js` as nodes). troika-three-text is gone.
- **3D particles** (`src/kit/particles3d.js`): the kit moves the dots and draws them as camera-facing
  quads in two meshes with stock materials, so there is no shader to port. three.quarks is gone.
- **Screen effects** (`hd3d-gpu-fx.js`): outline, trails (three's `OutlineNode`, `AfterImageNode`), glitch
  and pixelate as stages of `GpuChain`, each reading its numbers from the pass the game holds
  (`pass.gsFx`). A pass that is removed leaves its stage switched off, so an effect that comes and goes
  doesn't build the chain again. Depth of field was already the view's own (`v.focus`).
- **Reflections**: the scene's pass writes one more picture (which pixels are the marked shiny things,
  and how rough) and three's `ssr()` node traces only those; on high (half size) and ultra here, where
  WebGL has them on ultra only.
- **Ray traced reflections** (`hd3d-gpu-trace.js`, the best phones): in place of `ssr()`, a half-size
  pass sends a ray from each shiny pixel through a copy of the level kept in four storage buffers
  (three-mesh-bvh's packed tree, walked by its own WGSL functions inside a TSL stage). `trace-scene.js`
  picks what goes in, `trace-build.js` makes the blocks in a worker (`trace-worker.js`), and the tree
  over the blocks is our own, written again whenever something moves. The scene's extra picture
  (`gsRefl`) also says which pixels are things the copy doesn't hold; rays look for those along the
  screen. The first frames with new buffers are drawn inside a WebGPU error scope: a driver that
  refuses the shader puts the view back on `ssr()`. Phone ray tracing hardware can't be reached from
  WebGPU, which is why the rays are walked in a shader.
- **Light probes**: `v.bakeLight()` bakes with the renderer the view draws with (a `CubeRenderTarget`
  on WebGPU).
- **The scene pass's pictures**: each extra picture is 8 bytes a pixel and WebGPU promises only 32 in
  all, so `gpu.js` asks the chip for up to 64 and `GpuChain` leaves out what still doesn't fit
  (reflections first, then live bounce light).
- **Materials with one look**: on WebGPU three keys a classic material's shader by its settings, not
  by its nodes, so two materials with the same look shared the first one's numbers and pictures.
  `lookPatch` now gives each a `gsGpuKey` saying whose `{ value }` objects it holds; a look whose
  nodes read from the material being drawn (`gpuShared`, 3D text) shares one shader.
- **One shader build at a time**: three's `compileAsync` keeps a single state, so two builds running
  together on one renderer left it broken ("Async render pipeline creation failed", now and then, in
  games that warm a level while new things appear). Every WebGPU build goes through `compileGPU()` in
  `hd3d.js`, which queues them; nothing in the kit calls `r.compileAsync` on WebGPU directly.
- **A shadow-only floor with shadows off**: when the quality tier switches shadows off, a light still
  holds the shadow node it made before, and three's `ShadowMaterial` (the AR floor, a board game's
  table) multiplied by it and got nothing ("Invalid generated code, expected a float"; the floor drew
  dark all over). `hd3d-gpu.js` makes a switched-off shadow answer "no shadow".

Checked by `look-compare` (`fx-text`, `fx-parts`, `fx-outline`, `fx-pixelate`, `fx-trails`, `fx-probe`,
`pulse-two`, `shadow-off` against WebGL; `gpu-fx-glitch` and `gpu-fx-reflect` by eye) and by
`scripts/framegen-games.cjs`, which fails on any console error.

## GPU particles

`gs.hd.GPUParticles` is the first part made WebGPU-first: a TSL compute pass (`src/kit/particles-gpu.js`)
moves them in storage buffers that the sprites read, with the same rules run on the CPU for WebGL. The
look-compare `sparks` scene checks the two match.

## Real 3D liquids

`gs.fluid` is WebGPU-first too: MLS-MPM as six TSL compute passes a step (`src/kit/fluid-gpu.js`: clear
the grid, drops to grid with atomics in fixed point, the grid's weight with the walls' mirrors folded
in, the push of squeezed liquid, the grid's speeds, grid to drops), the drops drawn from the same
storage buffers, and the drops' places copied back every few frames for the game's questions and its
drains. `src/kit/fluid.js` runs the same steps line for line in JavaScript for WebGL, with fewer drops.
The look-compare `gpu-fluid` scene runs a dam break with a tap, a cup and a drain on whichever backend
is drawing and fails if liquid is lost or comes to rest somewhere else.

## Smoke and fire that flow

`gs.gas` is WebGPU-first as well: a stable-fluids gas as TSL compute passes over storage buffers
(`src/kit/gas-gpu.js`: which cells are solid, carry everything along the flow, put the smoke right with
the burning, the lift and the sources, the swirl, swirls kept alive, how much the flow piles up, two
dozen rounds of pressure, the flow gives way), then once a frame the sun's light through the smoke and
the fire's glow into two 3D pictures, and a screen pass at half size (`gasStage` in
`src/kit/hd3d-gpu-fx.js`) that walks each pixel's ray through them and lays the gas over the scene
behind what is in front of it. Every few frames the gas is copied back, four cells to one, for the
game's questions. `src/kit/gas.js` runs the same steps line for line in JavaScript for WebGL, in a much
coarser grid, drawn as soft puffs (stock `MeshBasicMaterial`, no shader patching). The look-compare
`gpu-gas` scene gives both the same grid and fails if their cells part.

## Done for Long Shadow and Deep Pressure

- **Outdoor looks as TSL**: `gpuLooks` in `hd3d-gpu.js` has `ground` (fields, roads, wear), `hills`,
  `rock` (three-way texture), `leaves` (wind sway, see-through edges, light through the leaves) and `air`
  (haze and mist as fog, cloud shade on the sun, wet ground with `gpuWet`), plus Deep Pressure's `pulse`.
  The WebGL looks still come from `looks.js`; `PORTED_LOOKS` in `hd3d.js` lists the ones with a twin.
- **Sun shafts and depth of field** are passes in `GpuChain` (a quarter-size bright mask plus a radial
  blur; a 16-tap blur by depth), each built only once a view uses it.
- **Shadow cascades**: the near and far sun lights' `colorNode` carries the same fade weights as the
  WebGL light edit (`gpuSunLight`, `setCascade`).
- **Sky**: the dome is a TSL twin (`gpuMaterials.skyDome`, Preetham and the painted gradient, clouds),
  swapped in by `material.userData.gsGpu`. Sky reflections bake again on whichever renderer draws
  (`HDView.envFor`), through `envFrom`'s `wrap` so the baked sun is softened the same way on both.
- **Tree impostors** read their bake back into a plain texture, so they draw on either renderer. The bake
  also left the WebGL viewport small (the next frame drew into a corner); it now puts it back.
- **Props** (`@three.ez/instanced-mesh`, no WebGPU support) get plain `InstancedMesh` twins per level of
  detail (`gpuProps`), culled and sorted into levels on the CPU each frame from the library's own arrays.
- **AO only where WebGL has it**: the normal target's alpha marks pixels that take AO, so see-through
  and `noAO` things (leaves, the first-person rifle) aren't darkened.
- `look-compare` has an outdoor scene at tier 1, tier 3 and with the physical sky; WebGPU is within
  2.4/255 of WebGL on all three. `Q=feat=-shafts,-props...` turns pieces off on both runs to find a gap.

three.js 0.186 gotchas found on the way (worked around in the kit):

- WebGPU `PMREMGenerator` sets its cube camera's near and far on the first bake only, so a later bake
  with a bigger far still clips. Every bake uses one far (`ENV_FAR`, 5000).
- The renderer switches a camera to WebGPU's 0..1 depth only when the camera's setting differs; SGSR 2's
  jitter put back a matrix saved before the switch, so on WebGPU the near clip sat at twice its distance.
  `HDView.render` now sets the camera's coordinate system before anything saves its matrix.
- `copyTextureToTexture` into a render target that is never drawn into keeps its old size after
  `setSize` (the fold-out freeze, fixed in #79 by drawing into two targets in turn).
- A node set on a WebGL material (`colorNode`, `positionNode`...) carries over to its node twin; vertex
  colours multiply after `colorNode`; WGSL can't sample a texture with automatic mip levels inside a
  branch that differs per pixel, so the clouds are worked out everywhere and masked.

## Done in the prep PR (#68)

- **Renderers in one place**: `src/kit/renderer.js` `makeRenderer()` makes every WebGL renderer; `gpu.js`
  has `backend(r)`, `gpuName()`, `copyFrame` and an async `readPixels`.
- **Named look effects**: `src/kit/looks.js` `lookPatch(material, name, spec)` is the only way kits
  change a stock material's shader; `lookEffects()` lists them for porting and tests.
- **Final pass in pieces**: `FINAL_EFFECTS` in `hd3d.js`, joined into the same shader as before.
- **three.js 0.186.1** (from 0.180; `PCFSoftShadowMap` became `PCFShadowMap`; `SimplifyModifier.modify`
  became async, so `props.simplify` calls meshoptimizer itself), three.quarks 0.17.1.
- **game-lint warns** on `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, `ShaderChunk` and
  `ShaderLib` in games (a warning, not a failure).

Parts that already move without work: PixiJS (2D effects and sprites) supports WebGPU, so
`look2d` only needs its `preference` changed; decals (`DecalGeometry`) are stock three.js.
