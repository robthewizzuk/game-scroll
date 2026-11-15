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

## What a frame asks of the chip

`node scripts/gpu-calls.cjs` counts every WebGPU call a frame makes (docs/testing.md). A phone's chip draws in
tiles: a pass that keeps what was in a picture loads all of it into the chip's tile memory first, and a pass
writes out every picture it does not throw away, so the things to keep small are the bytes of each picture, the
passes that load, and the pictures kept for nothing. What the kit does about it (2026-11-14):

- The screen's own picture has no depth picture beside it (`SCREEN_DEPTH` in `gpu.js`): every view draws its scene
  into pictures of its own and only finished rectangles onto the screen. three makes one by default, 4 bytes a
  pixel, cleared and written out every frame.
  (three's background builds, `compileAsync`, take "is there a depth picture" from this setting of the renderer's,
  where its frames take it from the picture drawn into: `forPass` in `hd3d.js` sets it for the scene pass while a
  build starts, or every shader made ahead is made for a pass with no depth and made again when first drawn.)
- Console's passes are 8-bit and its colour pass throws its samples away (above): about 16 bytes a pixel written
  a frame where it was 76.
- A sun's shadow map slid whole (`shadowBlit.shift`) is cleared, not loaded (`SHIFT_CLEAR`).
- The device is asked for lists of up to 256 MB (`maxStorageBufferBindingSize`; WebGPU promises 128), and the
  posed people's list (`skin-gpu.js`) stops growing at what the device allows: a mesh with no room is posed in
  its own vertex shader. Before, 300 close-up people asked for a 512 MB list, WebGPU refused it, and nobody in
  the list was drawn.
- A kit's compute passes of a frame go to the chip as one list (`renderer.compute([a, b, a, b])`: one compute
  pass and one submit, where a call for each made a pass and a submit of its own): the sea's 18 (`sea-gpu.js`),
  a cloth's small step (`cloth-gpu.js`), the flood's and the liquid's steps of a frame (`flood-gpu.js`,
  `fluid-gpu.js`) and a set of culled copies' up to seven (`props-gpu.js`). The gas, frame generation and the
  posed people already did. A list is kept and used again (the chip's times are told apart by the list), and
  nothing between two of its passes may change a uniform: three sends each uniform once for the whole list.
- A frame's passes go to the chip together (`src/kit/submit.js`, `HD.oneSubmit`, the steering list's `submit`).
  three makes a command encoder for every pass and compute call and submits each by itself: 25 to 40 submits a
  frame. The device's queue now holds what three submits and sends it in a few goes, in the same order. WebGPU does an upload at once, ahead of anything not yet submitted, so each encoder keeps a
  list of the buffers and pictures its passes use (bind groups, vertex and index buffers, copies, bundles, the
  pictures drawn into), each of those counts the held encoders that use it, and an upload to, a read back of
  or the freeing of one that a held pass uses sends the held passes first. Everything else goes straight
  through. The town goes to the chip 4.8 times a frame where it was 30 (three uploads to a shared list between
  passes, two reads back), the coast 1.5 where it was 25. `gpu-calls.cjs --why` names the buffer or picture
  behind each early send; a kit that uploads to a buffer between two passes that both read it costs a send.
  Before the canvas is read (`copyFrame`, a test's own read) `flushGPU()` sends what is held.
  The chip starts on a pass when it is sent, not when the frame's code ends (`node scripts/gpu-overlap.cjs`: a
  heavy pass sent and then its own time again spent in code is done in 1.1 times the pass's time; the code first
  and the pass after, in 2 times). One send at the very end left the chip idle through the frame's code, so the
  3D view also sends what is held where a lot of code is still to come (`sendEarly`, `HD.submitEarly`): before
  the scene is drawn (skinning, compute, the kit's shadow maps, the sky's pictures), after a shadow map three
  draws inside the scene's pass, and at once when the scene's pass is encoded. The effects, encoded while the
  chip draws the scene, go together at the end. With those the town goes 5.9 times a frame and the coast 4.5.
- A shadow map kept from frame to frame is written in as few passes as there can be (`HD.shadowOne`,
  `SHADOW_ONE` in `hd3d-gpu.js`). WebGPU has no way to load or store a part of a picture: every pass on a
  2048 map loads its 16 MB into a phone chip's tile memory and stores them again, whatever part it writes.
  A sun's map in tiles took two passes on a frame where only moving things changed (the kept copy's parts
  put back, then the moving things) and seven on a sun's step (slide, then empty and draw each new part,
  copy them aside, draw the moving things). Now the rectangles that put the kept copy back, or empty a
  part, are drawn first in the pass of the things drawn over them (`scene-list.js` `RIDE`: a mesh the next
  draw of a scene takes with it, ahead of everything in the scene, with its own material where three would
  draw it with the light's: `allowOverride = false`): one pass, and four on a sun's step (after a slide the
  map holds no moving things yet, so the kept copy is one plain copy of it once its new parts are drawn).
  A lamp's kept map is cleared, filled from its kept copy and drawn over in one pass, where it was a copy
  and a pass that loaded it again. The rectangles are drawn from a few meshes in turn: one mesh used twice
  in a frame had its rectangles uploaded under a pass still held (`submit.js`), which cost a send each time.
  The village walk of `--page shadows`: 2.03 passes a frame on the sun's map and its copy down to 1.12.
- The effect steps draw into `rg11b10ufloat` (`HD.hdrSmall`, `hdrPic` in `hd3d-gpu.js`): 4 bytes a pixel for an
  HDR colour where a half-float picture of four channels took 8, the fourth always 1. In three that is a render
  target of `UnsignedInt101111Type` and `RGBFormat`; drawing into it needs the device feature
  `rg11b10ufloat-renderable` (three asks for every feature the adapter has), and without it the pictures stay
  half floats. It has no sign, so a picture that holds a move (motion blur's tiles) is `rg16float`, and one
  number (the volumetric light) `r16float`. 6 bits of fraction in red and green and 5 in blue are about a
  screen's 8 bits in a picture's mid tones. A chip given a number between two that the format has may take the
  lower one (the test machine's does): each step came out half a step darker, a whole one in blue, and three
  steps in a row made the flare look scene 2% darker and 5% less blue. So each step rounds its colour itself
  (`hdrFit`): to one of the two numbers either side, with the odds of how near each is, by a noise pattern that
  stays put. That is right on average whichever way the chip rounds, and leaves no bands where a sky shades
  off; the look scenes then differ from half floats by 0.3 of 255 at most. three's afterimage node (gs.fx3d
  trails) gives its own pictures the type of the picture it reads but not the format, and a trail that fades a
  little each frame needs a half float's steps: its pictures stay half floats (`hd3d-gpu-fx.js`). `sharePictures` shares a picture only between steps of one
  kind, so GSSR's small picture (four channels) no longer takes a step's. Not changed: the scene pass's
  colour, anything in `hd3d-gpu-trace.js`, GSSR's and frame generation's pictures.
- Things that move go to the chip when they change, once (`sendChanged`, `oneWrite` in `src/kit/gpu.js`; `frameWide`
  in `src/kit/hd3d-gpu.js`; `HD.sendChanged`, `HD.oneWrite`). Three faults, each found by counting
  (`gpu-calls.cjs --uploads --uniforms`):
  three r187 sends a list marked `DynamicDrawUsage` again on every render that draws with it, changed or not, and
  once more for each shadow map it is in. The kit marks what it rewrites often that way, as WebGL wants: copies'
  places, cloth, particles, a posed person's index list. Now they go when their version has risen, which every
  write already did for WebGL. Eight people walking sent 915 KB a frame and now send 67 KB; a parade 1,061 KB and
  now 79 KB; a field 972 KB and now 145 KB.
  three sends each run of changed uniforms of a thing in a call of its own, so a thing that moved made two or
  three calls a pass. One call from the first changed number to the last sends the same.
  And the numbers the whole frame shares (the air's haze, mist and drift, the sky's horizon and sun, the weather's
  wet and rain, the sun's near map) were uniforms of each thing's own, so each was written into every thing drawn,
  every frame it changed; they are in three's per-render group now, sent once a render, and reach a thing three
  finds unchanged too. A street made 394 writes a frame and makes 61, a field 306 and 91, the coast 251 and 74.
  What is left is real change: the sea's own surface, made in JavaScript each frame (650 KB a frame at the coast;
  in the vertex shader it would cost neither the sums nor the upload), posed people's lists and three's own
  camera matrices, once a pass.
- The 3D canvas is opaque to the page while a view fills it (`HD.opaque`, `canvasShows` in `src/kit/gpu.js`).
  three makes the canvas see-through (`alphaMode: 'premultiplied'`), which AR needs for the camera picture
  behind it; then the browser blends the whole 3D picture over what is behind it on every frame. Told the
  picture is opaque, the browser draws it with no blending, skips what is under it, and the system may show
  it on a display plane of its own. WebGPU lets a canvas be configured again between frames with the device
  and everything on it kept, so the view says before each frame whether anything shows through: a view with
  `clearBg` (AR) turns the canvas back to blended for its frames, and the next filled view turns it opaque.
  three sets the canvas up anew after every change of size from the backend's `parameters.alpha`, so that
  is kept in step; the renderer's own `alpha` (how it clears) is left as it was, and the picture is the same
  to the bit: a filled view left no see-through pixel on the blended canvas either (the test page counts
  them), so nothing on the page changes. The pictures of cards waiting in the feed are drawn before the
  live view's frame, each the way its own view asks. WebGL's canvas is fixed when it is made and stays
  blended. `HD.info.canvas` says which.
- Depth is kept reversed, in 32-bit floats (`REVERSED` in `src/kit/gpu.js`, three's `reversedDepthBuffer`;
  `HD.info.depth`). A perspective depth crowds the far world into the top of its range: with a near plane at
  10 cm everything past 100 m is in the last thousandth, and 24 bits cannot tell two walls a metre apart at
  3 km (the test page counts 864 of 1,008 pixels of the wall behind showing through the one in front). Kept
  the other way round, 1 at the near plane and 0 at the far one, a float's fine steps near 0 land where the
  depths are crowded: the same walls are clean at 8 km with the same near plane, and cards 2 mm apart at
  arm's length are as they were. three turns its own side round: the cameras' projection matrices, the depth
  tests and clears, polygon offsets, the shadow cameras and their compare, and its nodes that read depth
  (`getViewPosition`, `perspectiveDepthToViewZ`, the ambient occlusion, reflection and denoise nodes). The
  kit's own readers are turned by hand. In three's projection the reversed depth is exactly 1 minus the
  forward one, so a shader that reads a depth picture takes `fwdDepth()` for the depth as it ran before or
  `noDepth()` for where nothing was drawn (`src/kit/depth-gpu.js`): the depth meter for occlusion culling, the
  volumetric light, depth of field and the lens, motion blur, smoke and fire, GSSR and frame generation. The
  kept shadow map's copies and slides write depth themselves (far is 0, a slide deeper subtracts), and 3D
  fog's test against the sun's map is turned. Code on the CPU that works depths out itself takes
  `forwardProjection(camera)` (`occlusion.js`); GPU culling's frustum is told the camera is reversed.
  `toScreen()` still gives a game a third number that grows with distance and is over 1 behind the camera.
  The scene's depth picture is `depth32float` where it was `depth24plus`, 4 bytes a pixel either way on
  phone chips. The Console renderer and WebGL keep depth as it was. `?depth=forward` in the address, or
  `REVERSED.on = false` before the renderer is made, keeps depth forward to compare, and the steering list's
  `depth: false` keeps it forward on a phone or driver that turns out to need it. The projection native
  AR hands over is turned in `ar3d.js` (`projectNative`); that has not run on a phone.
- A sun's shadow map and its kept copy are 16-bit depth (`depth16unorm`; `HD.shadow16`, `SHADOW_16` in
  `hd3d-gpu.js`): half the memory, and half of what each pass on them moves. three makes every shadow map
  `depth24plus`, 4 bytes a texel. An orthographic light's depth is even from near to far, so 65,536 steps
  are plenty: 1.8 mm over a `follow()`'s 119 m. `follow()` moves in depth by 1,024 whole steps (1.86 m, it
  was 2 m), so a kept copy moved deeper lands on the map's own numbers and nothing is rounded each time; a
  fitted sun's bias is never under four steps (a box more than 500 m deep). Lamps' atlas and spot lights
  keep 24 bits: a perspective light crowds its steps up to the near plane, and the lamps' bias is a step
  and a half of 16 bits. The kept copy takes the map's own kind (WebGPU refuses a copy between two).

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

## Shaders a round made, made ahead next time

`src/kit/pipes.js` (2026-11-14) notes the pipelines a round makes in play and makes them ahead the next
time, as Unity's PSO tracing and Godot's shader baker do, without knowing anything about three.js:

- `watchDevice(device)` (from `prepareGPU`) wraps the device's `createShaderModule`, bind group and
  pipeline layouts and `createRenderPipeline(Async)` / `createComputePipeline(Async)`. Each pipeline's
  description is written out as plain data (shader modules by a hash of their text, layouts by their
  entries, labels left out) and hashed. One first made while a round is playing is noted for that game.
- The notes are kept in IndexedDB (`gs-pipes`, gzipped, up to 96 a game and 40 games, the oldest
  played forgotten first, dropped on a three.js update). When the game's card comes up (`primePipes`
  in `setActive`), each is made again with `createRenderPipelineAsync` in the background, and the
  loading gate waits a little for them (at most 4 s: the `Shaders` soft wait). Dawn keeps one pipeline
  for each description while one is alive, so three's own ask in the round finds it already made
  (on the test machine, 191 ms down to 4 ms).
- A note the chip refuses is dropped; one not asked for in 3 rounds of 20 s or more is dropped too.
- three writes the members of a shared uniform block in the order the material first used them, which
  is not always the same from one launch to the next, so some of a game's notes (on the test machine,
  about a fifth) never match three's own asks in a later launch: those are made ahead for nothing and
  dropped after 3 rounds. Sorting the members by name when the text is written made every note match,
  but three had already sized some uniform buffers by the old order ("bound with size 288 ... is too
  small", a frame dropped), so it was taken out; doing it where three adds the members is a follow-up.

`__gs.pipes.stats()` gives what was noted, primed, made and asked for; `node scripts/shader-replay.cjs`
plays a game twice in two launches of the browser on one profile and fails if the second made none
of what the first noted.

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

- An 8-bit canvas and 8-bit passes (the renderer is made with `outputBufferType: UnsignedByteType`: three gives
  every scene pass the renderer's own kind of picture whatever the pass asks for, so until 2026-11-14 they were
  16-bit float), the colour pass's four samples a pixel thrown away once joined (`storeMultisampledColorBuffer`
  and `...DepthBuffer` false: not written to memory, and on Chrome 146 and later not kept in memory at all), no tone mapping, and a renderer-wide `getOutput` (`celOut`) that turns
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
