# Next Gen · Console games: modern HD 3D

Next Gen Console games (`era: 'nextgen'`) aim for the look of current home consoles. They sit next
to the Classic Console games (`era: 'console'`, cel-shaded, see [console-3d.md](console-3d.md)) and
must look clearly a generation ahead of them. Stylised and cartoony characters are fine; the
rendering is what makes it Next Gen.

The kit is `src/kit/hd3d.js`. Games built on it: `bunker-breakout.js` (corridor shooter),
`canopy-run.js` (top-down jungle twin-stick with a helper drone), `gravity-grip.js` (tube racer that drives on walls and
ceilings), `neon-drift.js` (drift racer on a wet neon street circuit), `storm-hook.js` (grapple swinging),
`deep-pressure.js` (sonar sub; its walls glow with the sonar ring through `gs.hd.pulse`),
`mech-brawl.js` (boxing), `frost-line.js` (snowboarding, tilt to carve) and `canyon-ace.js` (tilt-to-fly jet).

## What the kit gives you

- **Physically based materials** (`pbr(colour, { rough, metal, glow, clear, tex })`): roughness,
  metalness, clearcoat, sheen and emissive glow, lit by real-time lights and image-based
  reflections (a studio environment map, strength set per view with `env`).
- **Procedural surface textures** (`surface(size, paint)`): you paint colour, height and
  roughness on canvases in code, and the kit derives a normal map from the height. No image files.
  On WebGPU the colour, normal, height and metal maps are packed into the phone's own compressed
  formats (ASTC or ETC2; BC on desktops) on the graphics chip by spark.js, so they take about a quarter
  of the memory; each draws plain for its first few frames until its packed copy is ready.
  `speckle()` adds grime and noise. While a card is loading, the bumps (the normal map and the
  rougher small copies) are worked out in a background worker: `surface()` hands the textures back at
  once and the card stays "Loading…" until they are filled in, so twenty textures no longer hold the
  feed still.
- **Bevelled boxes** (`rbox(w, h, d, r)`): rounded edges catch highlights, which reads as
  "modern" far more than sharp boxes.
- **Real-time shadows** (`spot(...)`): a shadow-casting spotlight whose shadow map size follows
  the quality tier. Mark meshes `castShadow` / `receiveShadow`.
- **Sun** (`sun(colour, intensity, size)`): a shadowed directional light for outdoor scenes. Call
  `s.follow(x, y, z)` each frame so the shadow box tracks the player (it moves a whole tile of its map
  at a time, so shadows do not shimmer and most of the map is kept: see "kept in tiles" below) and
  `v.onTier(T => s.setTier(T))`. Big outdoor levels use `s.fit(v, ...)`
  instead (see [Outdoor worlds](#outdoor-worlds-sun-air-sky-and-grade)).
  `gs.hd.sun(...).softShadows(2)` makes its shadows soft the way real ones are: sharp where a thing
  touches the ground, spreading the higher it stands (PCSS, as three.js's own shadow filter hook, on
  WebGPU; WebGL phones get an evenly softer edge). The number is the sun's width in the sky in degrees
  (the real sun is 0.5; 2 to 4 reads as a soft, hazy day). Call it when you make the sun.
- **Lamp light pool** (`v.lampLights(range)` then `v.placeLamps(spots, x, y, z, t)` each frame):
  a level can have dozens of lamps; the nearest few get real point lights (with flicker) and the
  rest only glow. Light count stays fixed, so shaders never recompile mid-game.
- **Post-processing**, one shared chain: HDR render with MSAA (or a light FXAA on lower tiers), ground-truth ambient occlusion
  (GTAO), bloom (anything brighter than about 1 glows: emissive above 1, particle colours above
  1), ACES filmic tone mapping, and a colour grade (vignette, film grain, slight lens fringing at
  the edges, and a red "hurt" tint you set with `v.hurt = 0..1`). A game can add its own grade and
  sun glare in the same pass (`v.grade`, `v.glare`, below).
- **Particles** (`new Particles(v, { max, additive })`): soft camera-facing points. Additive for
  sparks, fire, glints; normal for smoke and dust. `p.emit({ x, y, z, vx, vy, vz, life, size,
  grow, col, a, drag, grav, floor, fadeIn })`, then `p.update(dt)` every frame.

## Performance and adaptive quality

Phones must stay smooth, so the kit adapts on its own:

| Tier | Pixels per frame | Shadows (sun) | Real lamp lights | AO | Anti-aliasing |
| --- | --- | --- | --- | --- | --- |
| ultra | 2.0 M | 1024 (2048) | 4 | full size | 2x MSAA |
| high | 1.3 M | 1024 (2048) | 4 | half size | 2x MSAA |
| medium | 0.85 M | 512 (1024) | 3 | no | light FXAA |
| low | 0.5 M | off | 2 | no | light FXAA |

Ambient occlusion (the soft dark in corners and under things) on the high tier is worked out at half
the picture's width and height, a quarter of the cost, and blended back at full size.

**Phone class and frame rate** (`src/kit/speed.js`). Each phone is sorted into top, mid or low from
its graphics chip (Adreno 830, Mali-G720, ...), its model for iPhones, and its cores and memory.
That picks where 3D games start and how fast they run:

| Class | Starts on | 3D frame rate | Other games |
| --- | --- | --- | --- |
| top (Fold 8, recent iPhone Pro, desktops) | high | 120 fps (where the screen does 120 Hz) | screen rate |
| mid | high | 60 fps | screen rate |
| low | medium | 30 fps | 60 fps |

Play never climbs above **high**: on ultra the Fold 8 got hot and throttled within a minute in every
3D game, and then stuttered (frame lab reports, 2026-11-10). Ultra is still there for `HD.force = 3`
(tests, screenshots, the frame lab's A/B). While the phone is warm or hot (`src/kit/power.js`), and for
a minute after it cools, games also draw one tier lower from the next round (a tier change rebuilds
shaders, so not mid-round) and drop to the first resolution step at once.

The feed loop skips screen refreshes to hold a game at its rate (a 60 fps game on a 120 Hz screen
draws every other refresh), which saves battery and heat. Settings has Auto / 120 / 60 / 30
(battery saver); a game can also set `fps: 30` in its definition to cap itself.

Frame times are averaged over 45-frame windows and compared with the frame budget for the game's rate
(8.3 ms at 120 fps, 16.7 ms at 60). A window is slow when its average is a quarter over the budget, or
when two or more of its frames came a whole refresh late (a game averaging 57 fps at 60 that drops a
frame three times a second stutters visibly, though its average looks fine). After two slow windows the render resolution steps down one fixed
level (100%, 85%, 70%, 55%), then the tier drops. At 120 fps a struggling game first gives up one
resolution step, then drops to 60 fps at full resolution, keeping the picture; at the lowest tier and
resolution a 60 fps game can drop to 30. It only climbs back after eight fast windows in a row (on the beat, with no late frames), and
never above a level that was too slow in the last 30 seconds, so it does not bounce up and down (each
step reallocates render targets). Where a game settles (tier and frame rate) is remembered per game,
so its next round starts there instead of stuttering down again. It is remembered for a day: what pushed
a game down (a warm phone, a low battery, a busy spell while it loaded) has passed by then, and falling
is quick where climbing back is slow, so after a day the game starts from the phone's class again. A
game held up by the CPU above 60 fps (the graphics chip has room) goes straight to 60 instead of giving
up a tier first.

**Speed tricks that keep the picture the same:**

- The 3D canvas is shown directly on the playing card, under the card's own canvas, which is cleared
  each frame so the game's 2D HUD sits on top. Nothing is copied. When another 3D card starts, the
  last frame is baked into the card being left, so it keeps its picture. (Tests and screenshots run
  with `__hd.direct = false`, the old copy-into-the-card path; that's automatic under Playwright.)
  Don't draw anything into the card's canvas before `v.render()`: it is cleared there.
- Bloom, tone mapping and the colour grade are one final full-screen pass. The bloom is a short
  down/up-sampling chain at half resolution and below (9 small passes, was 13 bigger ones plus two
  full-screen ones).
- Shadow maps are only redrawn when a shadow caster or a shadow light has moved, turned, appeared or
  hidden, and each light only for the casters its own shadow can see, on WebGL and WebGPU
  (`__hd.info.shadows` says whether the last frame redrew them, `__hd.info.shDraws` counts frames
  that did). If you change a mesh's geometry in place without moving it, call `v.shadowsDirty()`, which
  draws every map again, the kept copies of still things below included (it used to leave those as they
  were). A `gs.props` copy that is moved, hidden or shown takes its shadow with it (it used to keep its old
  shadow once the kind had stood still for a moment: nothing about the set of copies changed that the
  shadow maps could see).
- Still and moving shadows are kept apart (Unity's cached shadows, Unreal's static/dynamic split): a
  light that stays put keeps a copy of its map with only the things that haven't moved for about
  45 frames, and when only moving things changed, that copy goes back and just the moving things are
  drawn over it. It needs nothing from the game; it turns itself on where the still things far
  outweigh the moving ones (20,000 triangles or more, at least twice the moving ones), for sun and
  spot lights with one map. `__hd.shadowCache = false` turns it off; `node scripts/shadow-check.cjs <id> [--gpu]`
  checks the pictures match a full redraw.
- A sun's shadow map is kept in tiles (`src/kit/shadow-tiles.js`). The map of a sun that follows the
  camera (`s.follow(...)` or `s.fit(...)`) is 16 by 16 tiles that stay put in the world. The sun steps a
  whole tile at a time and the kept map slides with it, so a step draws only the strip of tiles that
  came into the map. Each tile knows the still things and the moving things in it: a tile is drawn
  again only when its still things changed (one came, went, moved or stopped), and the moving things
  are drawn over the kept copy each frame only where they are. A frame in which nothing under the sun
  changed draws no shadows at all. It needs nothing from the game, and turns itself on where the kept
  copy above does (20,000 still triangles or more under the light).
  - On a walk through a village with a truck, a gate, a walker and 600 barrels (software renderer): 4,200
    shadow triangles a frame in place of 35,100 on WebGL and 16,900 in place of 60,200 on WebGPU, 6
    shadow draws in place of 41 to 48, for the same or a little less of the engine's own time. Not yet
    measured on a phone: the town in the engine test scenes is walked a third time with its shadows
    drawn whole for that.
  - `__hd.info.shTris` and `shCalls` count the shadow maps' triangles and draws, `shTiles` the tiles
    drawn again, `shPut` the tiles put back from the kept copy, `shSlid` the slides and `shWhole` the
    times a map was drawn whole (all running totals: take the difference over a frame).
  - Limits: a set of `gs.props` copies has no place of its own in the map, so moving, hiding or showing
    a copy draws the map whole (twice: as the set starts to count as moving, and as it stops). On WebGPU
    a set of copies is drawn whole for each part of the map that is drawn. On WebGL a step of the light
    in depth (taken only once the camera is well out of the middle of the light's box) draws the map
    whole; on WebGPU the kept depths are moved instead. A part of the map that was kept, or drawn by
    itself, can differ from the whole map drawn at once by a texel on a shadow's edge: an edge that
    falls the other way by the last bit of a sum. On the walk that is at most 35 texels of a map's
    262,144, never four together, and a pixel or two of the picture in a few frames (on WebGL none
    at all once the village's still things have been merged).
  - Switches: `__hd.shadowTiles = false` (the sun moves a shadow texel at a time and its map is drawn
    whenever it does, as it used to be), `__hd.shadowCache = false` (no kept copies at all).
    `node scripts/detail-test.cjs --page shadows` (and `--webgpu`) walks the village both ways and
    checks every frame is the same picture to a pixel or two, and on WebGL that the maps themselves
    differ only by those stray texels; `--bench` gives the numbers above.
- On WebGPU the ambient occlusion now draws the same picture twice running. three.js's denoise made its
  noise picture from random numbers, a new one for every view, so two pictures of the same scene
  differed by a few pixels a frame and picture tests there had to allow for it. Every view now reads
  one noise picture made from a fixed seed.
- On WebGPU, SGSR 2 is the anti-aliasing of every Next Gen view that isn't AR (it runs at full size too),
  so the scene under it is drawn without MSAA: the picture measured the same with it and without, and
  the multisampled colour, depth and motion pictures are saved. A view kept off SGSR 2
  (`v.upscaler = 'sgsr1'`, or `__hd.upscaler = 'sgsr1'`) has the tier's own edge smoothing: MSAA at high
  and ultra, FXAA below. On WebGL the tier's MSAA stays under SGSR 2: without it the picture measured
  about 8% closer to the true one but shimmered more with nothing moving, a trade and not a gain. A
  camera jump (`v.cut()`) starts SGSR 2's history again. (three.js's TRAA was
  here for those views at full size until it measured further from the true picture than SGSR 2 with
  the camera still, moving, and with a thing moving, and almost no view reached it.)
- WebGPU times each frame on the graphics chip where the phone allows it (`__hd.info.gpuMs`: every
  pass since the last real frame, the made frames and other compute work included, which
  `__hd.info.gpuCompute` gives on its own). The quality steps use it: a frame slowed by the CPU
  doesn't give up resolution (it wouldn't help), and a GPU with plenty of room gets sharpness back sooner.
- Detailed meshes (3,000 triangles or more, skinned ones too) get simpler copies from meshoptimizer
  in the background, one mesh a frame, and each frame draws the simplest copy whose change would
  show as under a pixel: far soldiers and props need a fraction of their triangles and look the
  same. The copies share the original's points, so normals, UVs and bone weights stay exact. Off for
  instanced and multi-material meshes, see-through ones and `mesh.userData.noLod = true`;
  `__hd.autoLod = false` turns it off. (gs.props makes LODs for instanced props.)
- Cluster detail (a Nanite-style level of detail, by itself): a big still mesh (20,000 triangles or
  more: a hillside, a cliff, a hall made in code) is cut into clusters of a few hundred triangles with
  coarser and coarser versions of each neighbourhood, and every frame each part of it is drawn only as
  finely as shows in the picture (within a pixel) and not at all where it is out of view. So the near
  end of a long wall is at full detail and the far end at a fraction, with no cracks where they meet,
  and a model can carry far more triangles close up without costing more far away. Shadow maps pick
  their own level the same way. On a test hillside with rocks, a view of 1.3 million triangles drew as
  160,000 and matched the full picture more closely than the whole-mesh copies above did.
  - The clusters are made in a worker (about a second for each quarter of a million triangles) while
    the mesh draws whole, and are kept by the mesh's content in memory and in IndexedDB, so the next
    round and the next visit have them at once. Nothing is built on the main thread.
  - The game's mesh stays in the scene as it is (for the game, and for raycasts, which test the full
    mesh); a twin named `gs-detail` is drawn in its place and follows its place, material, shadows and
    visibility. The moment the mesh stops fitting (another geometry or material, taken out of the
    scene) it draws as itself again. A geometry whose points change after it was taken is left alone
    from then on.
  - Taken: plain meshes with one solid material. Not taken: skinned, morphing and instanced meshes,
    see-through and alpha-tested materials, materials that move their points (leaves, grass, water,
    your own shader), multi-material meshes and `v.reflect()` ones. Those keep what they had.
  - `v.detail(meshes)` asks for it on smaller meshes too (from 2,000 triangles), `v.detail(meshes,
    { px: .5 })` makes them finer (pixels the simpler parts may be out by; default 1), and
    `v.detail(meshes, false)` or `mesh.userData.detail = false` draws them whole.
    `__hd.detail = false` turns it all off, `__hd.detailMin` is the triangle count, `__hd.detailPx` the
    pixels, and `__hd.info.detail` says what the last frame drew through it (`meshes`, `tris` drawn
    of `full`, `draws`, `picks`).
  - Works the same on WebGL (one multi-draw call for each mesh) and WebGPU (one small draw for each
    run of clusters). `node scripts/detail-test.cjs [--webgpu]` checks the picture against the full
    meshes.
  - Real surface detail (`gs.models.relief`, below) is drawn through it: a roof's tiles as real
    triangles close up, the flat roof again far away.
- Detail levels for copies (by itself): things drawn as many copies (a `gs.props` kind, a `perCopy()`
  set: trees, rocks, posts, houses) get whole simpler versions made the same way, in the worker and kept
  by the mesh's content, and each copy is drawn at the simplest one whose error is under 0.6 of a pixel
  where it stands. Where a level takes over is worked out from its measured error, the copies' size, the
  lens and the picture's size, so zooming in (a scope) pushes the levels out and nothing pops. In the
  test field (300 rocks and 300 posts among other kinds) its three views drew 78,000 to 273,000 triangles
  a frame on WebGL in place of 439,000 to 1.75 million, shadows included, and matched every copy drawn
  whole to within 0.2 of 255 a pixel.
  - By itself for a set with 200 triangles a copy or more and 60,000 in all, and no levels of its own.
    `props.kind(name, geometry, material, { lod: 'auto' })` (or `mesh.userData.detail = true`) asks for
    it from 60 triangles a copy; `lod: false` (or `mesh.userData.detail = false`, `userData.noLod`)
    keeps a kind whole, and `__hd.copies = false` turns it all off. A kind with its own `lod` keeps it.
  - Up to five levels (a half, a fifth, 7%, 2% and 0.5% of the triangles, for as long as the shape will
    simplify), all on the mesh's own points, so they add an index list each and no points. Seams and
    creases are kept while that costs no shape; a far level may cross them (a ball's seam and poles
    alone hold more triangles than its far levels have).
  - Not for see-through or alpha-tested materials (leaf cards: give those a `gs.outdoors` `impostor()`
    level), a list of materials, or skinned and morphing meshes.
  - `mesh.userData.gsLevels` says what a set was given (`levels`, `tris`, `error`).
    `node scripts/detail-test.cjs --page copies [--webgpu]` checks the pictures and counts, and with
    `--bench --q "forest=20000"` flies over a forest with it off and on.
  - Tried and left out: merging far groups of copies into one baked stand-in mesh a cell. On a forest of
    22,000 it drew no fewer triangles than the levels do and cost more CPU a frame than it saved on
    every path measured (the copies' own culling is already cheap), for up to 8 MB a kind.
- Crowds (`gs.props.Crowd`): hundreds of animated people or animals in a few draws. Each kind's moves
  are played through once and written into a float texture, a row a frame and three texels a bone; a
  member is 20 numbers in an instanced list (where, which way, how big, which two rows and how far
  between them, a tint, and the same as the last frame drew them), and the vertex shader skins it from
  the texture. Nothing is posed in JavaScript and no bones are sent each frame.
  - All of a kind at one level of detail are one draw (one for each material of the figure). Levels: the
    figure's own, plus simpler ones made on the same points wherever two are more than four times apart
    in triangles, down to about 500. A member is drawn at the coarsest level that has 0.15 triangles for
    each pixel of its height squared (about two pixels a triangle), and keeps a level a little past the
    step so none flickers between two. `crowd.lod = 0..2` forces one of the figure's own.
  - Members outside the camera's view (by a ball round each, and `reach` metres more for shadows) or
    past `far` are not sent at all. Their shadows are drawn by the shadow maps as any moving thing's,
    and only again when a member moved or stepped on in its move.
  - WebGL: the shader edit is the named look `'crowd'`. Passes that draw the whole scene with one material
    of their own (ambient occlusion's and reflections' normals) would stand every member unposed at the
    middle of the world, so a crowd draws nothing in them and then draws itself into the same picture
    with a material that knows the poses. The contact-shadow pass leaves crowds out.
  - WebGPU: the same as nodes (`crowd-gpu.js`), with each member's place and pose at the last frame
    drawn for frame generation, SGSR 2 and motion blur. "Last frame" goes by the frames the view draws,
    not by `update()` calls, so a game on a fixed tick that updates twice between frames, or not at all,
    is still right.
  - 300 people and dogs walking in a field (software renderer): 750 draws, 1.35 million triangles and
    29 ms of engine time a frame with a skeleton each; 42 draws, 590,000 triangles and 2.3 ms as a crowd
    on WebGL (500 draws and 35 ms against 28 draws and 1.9 ms on WebGPU). Two people and a dog with three
    moves each are 370 KB of texture.
  - Not in a crowd: faces, hair strands and fur, hands onto things, feet planted on slopes, and hiding
    behind other things (every member in view is drawn). Skin is the plain material.
  - `node scripts/detail-test.cjs --page crowd [--webgpu]` draws a line of people and a dog posed by
    their own skeletons against the same line as members of a crowd, at each level (they differ in under
    0.1% of the pixels they cover), then a field of 300; `--bench` gives the numbers above. The square in
    the engine test scenes is the same comparison for a phone.
- Static batching (WebGL, by itself): small still things that share a material (crates, posts, rocks,
  walls) are merged into one mesh per material and area after about 1.5 s still, one draw call where
  there were dozens (Unity's static batching). A piece that moves, hides or changes material goes back
  to drawing itself that frame, so the game never has to know, and raycasts still hit the pieces.
  `mesh.userData.noBatch = true` keeps a mesh out; `__hd.batch = false` turns it off. WebGPU draws are
  cheap enough that merging measured slower there, so it stays off on WebGPU.
  Kit code that moves objects from one view's scene into another's (gs.tabletop does, between the 3D
  room and AR) calls `view.release()` on the view they leave first: it returns merged pieces, and
  ones waiting for a shader, to drawing themselves.
- On WebGPU, lights use three.js's clustered (Forward+) lighting: each pixel only adds up the point
  and spot lights that reach it, so `v.lampLights()` / `v.placeLamps()` light 8 times as many of the
  nearest lamps (up to 32) for about the same cost, and lamps coming and going build no shaders.
  Lights with shadows are drawn as before. `__hd.manyLights = false` keeps the old lamp count.
- `v.tone = 'aces' | 'neutral' | 'agx'`: which of three.js's tone mappers turns the light into
  screen colours. ACES (the default, the film look) pushes very bright colours towards yellow and
  white; Neutral (Khronos PBR Neutral) keeps colours true to the material, good for neon, paint and
  products; AgX (Blender's) keeps their hue in bright light and rolls off softly.
- `pbr(col, { tex, depth: .05 })`: parallax occlusion mapping on WebGPU for a `surface()` texture: the
  raised parts of its height layer stand up and hide what's behind them as you look across the surface
  (bricks, cobbles, planks, tiles), with no extra triangles. `depth` is in texture widths. WebGL keeps
  the normal map's shading. Use it on big flat surfaces seen at a slant, where it shows the most.
  It looks after itself far off: the relief flattens where a drawn pixel covers more than a few texels
  (it couldn't be seen, only crawl), and where the pattern itself gets down to a few pixels (a tenth of
  the texture is taken as one tile or brick) its bumps flatten and its colour goes over to the texture's
  average, so a tiled roof a hill away is a calm, even red and not a shimmer.
  `gs.models.relief(mesh)` makes the same height layer into real triangles instead (on WebGL too): see
  [Things made in code](#things-made-in-code-gsmodels).
- `pbr(col, { sss: true | { colour, power, scale, distortion, ambient, attenuation } })`: subsurface
  scattering for skin, wax, leaves, jade and ears against the light: light passing through glows out
  of the far side in `colour` (default a skin red). On WebGPU this is three.js's MeshSSSNodeMaterial
  (fast translucency, as in Frostbite); WebGL phones get a soft tinted rim in its place.
  That lets light through the whole thing, thick or thin. For something only thin in places (a head: the
  ears glow, the skull does not) add `thin: true` and give the mesh a `gsThin` attribute, two numbers a
  point: how thin it is there (0 solid .. 1 a sheet) and how open it is straight behind (0 something is
  in the way .. 1 clear). Light then comes through only where it is thin and has somewhere to come from
  (`back: .8` is how strongly), and the thin parts are left out of the shadow map, which is too coarse
  to tell an ear from the head a centimetre behind it. `gs.models.human` measures this by itself.
- Richer materials on `pbr()` (three.js's MeshPhysicalMaterial, the same on WebGL and WebGPU):
  `aniso: .9` (and `anisoDir` in radians) stretches highlights along brushed or turned metal, hair and
  satin; `film: 1` is a thin rainbow film (soap bubbles, oil, beetle shells, lens coatings);
  `glass: true | { thickness, ior, tint, distance }` lets light through and bends it (bottles, ice,
  gems; it costs a picture of what's behind, so keep it to a few things); `wet: .8` soaks a surface
  (darker, glossy, a water layer on top; `porosity` 0..1 for how much it darkens: stone 1, metal 0).
- `detail(big, fine, { times: 4, strength: .7 })`: mixes a fine `surface()` (pores, grain, scratches),
  repeated `times` over, into the normals of a big one, so a close-up keeps its grain without a huge
  texture. Give it sets without `repeat()`; the result has its own `repeat`.
- `v.flare = true | { strength, threshold, spacing, fade, tint, dirt }`: lens flare ghosts of the bright
  parts, mirrored through the middle of the picture (three.js's LensflareNode, the same maths on WebGL),
  and lens dirt (smudges, dust and wipe marks drawn in code) lit where bright light falls on it.
  `dirt` (.5) is how dirty the lens is, 0 for none. Needs bloom; off by default.
- `v.liveBounce = 'screen' | 'voxel' | { kind, strength, res, box }` (WebGPU, high and ultra): light
  bounced off walls and floors onto what's near them, worked out every frame, so it follows a moving
  sun, a lamp switched on or a door opened (`v.bounce()` instead bakes it once, on every renderer).
  `'screen'` is three.js's SSGI: what's on screen bounces, cheapest. `'voxel'` is three.js's VXGI: the
  level is turned into voxels once (`res` along its longest side, 64; `box` a Box3 to cover only part of
  a big world) and light is traced through them in cones, so walls off screen and behind you count
  too; call `v.levelChanged()` after its big still pieces change. Moving things count where they stood
  when the voxels were made, so keep it for levels whose shape stays put. `strength` (1) scales it.
- `v.fog3d = { density, height, falloff, far, colour, glow, ambient, strength, noise, wind, lamps }`
  (WebGPU, high and ultra): fog that light really travels through, kept in a grid of small boxes fitted
  to the view (froxels, as in Frostbite and Unreal) and worked out each frame on the graphics chip. The
  sun lights it through its shadows (dark under a roof, bright in the gaps between pillars), the
  nearest 8 lamps glow in it, and every material reads it at its own place, so glass and particles are
  fogged right too. `density` per metre (.03), lying thickest below `height` (0) and thinning by
  `falloff` (.15) per metre above it, out to `far` metres (60); `glow` (.4) is how much more it shines
  looking towards the light; `noise` (.5) makes it patchy, drifting with `wind` ([x, z]). A plain
  `bg` colour behind isn't fogged, so match it to the fog or use a sky. WebGL keeps the view's own fog.
- `v.oit = true` (WebGPU): order-independent transparency, three.js's weighted blended OIT (McGuire and
  Bavoil). See-through things (normal blending, not glass with `transmission`) blend right whatever
  order they're drawn in: glass behind glass, panes passing through each other, smoke in water, with no
  popping as they move. WebGL sorts them back to front as before. Costs an extra pass; off by default.
- `gs.hd.panel(colour, intensity, w, h, { glow })`: an area light, a glowing rectangle (window, TV,
  striplight, softbox) with the soft, stretched highlights a point light can't make (three.js's
  RectAreaLight, both backends). It shines out of its front (-z): place it and `lookAt` the target.
  `glow: true` also shows the rectangle. No shadows (add a `spot` for those); its tables load the first
  time a game makes one, and it lights up a moment later.
- `v.lut = 'film' | 'bleach' | 'noir' | 'sepia' | 'warm' | 'cold' | 'faded' | 'vivid' | 'night'`: a colour
  look, the way films grade their pictures (a 3D lookup table on the finished colours: one texture
  read, three.js's LUTPass maths and Lut3DNode). Also your own recipe, `v.lut = (r, g, b) => [r, g, b]`
  with screen colours 0..1 (made once), or the text of a `.cube` file pasted into the game as a
  string. `v.lutAmount` (1) blends it in; `gs.hd.lut(look)` makes the table to swap between.
- `v.autoExposure = true | { amount, min, max, speed, darken, key }`: the eye adapts, like walking out
  of a bunker into sunlight: it dazzles a moment, then settles. A light meter reads the picture every
  few frames (read back without waiting) and the exposure drifts so the scene's brightness stays near
  how it looked when it was turned on (or near `key`, a mid grey such as .18). `amount` (.7) is how
  much of the change the eye makes up, `min`/`max` (.4 / 2.5) cap it, `speed` (1.2) brightens and
  `darken` (3) dims, per second. `v.eye = null` measures afresh (a new level). Off by default.
- Bumpy surfaces made with `surface()` don't sparkle in the distance: each smaller copy of the
  roughness map is made a little rougher by how much the bumps under it disagree (Toksvig specular
  anti-aliasing, as in Filament and Unreal). three.js already does the same for curved shapes.

Shaders are compiled up front: the first `render()` calls `v.warm()`, which compiles every material
in the scene, including hidden ones, with shadows on and off. If you build new geometry or
materials later (a new floor), build it while the screen is faded out and call `v.precompile()`: it
compiles the new shaders in the background and resolves when they're ready, so fade back in then
(`v.warmed = false` also works, but compiles everything on the next frame at once, which is a stutter).
Anything that still needs a new shader mid-round (a new kind of thing, a swapped material) doesn't
stop the frame either: it waits, hidden, for a frame or two while its shader builds in the background
(three.js's `compileAsync`: WebGPU's async pipelines, WebGL's parallel shader compile), then appears.
It waits at most `__hd.holdMs` (500 ms); a mesh drawn in clusters (cluster detail) is drawn whole until
its clusters' shader is built, however long that takes. Mark something that must show on its very first frame (the
player, say) `userData.noHold = true`; it then builds in the frame as before. `__hd.hold = false`
turns waiting off; `__hd.info.held` says how many things are waiting. `node scripts/shader-hold.cjs
[--webgpu]` measures the difference.
On WebGPU a shader is built for the picture the scene is drawn into (its layout is part of what three.js
keeps a shader under), so the background builds are made for that picture and a frame finds them. What
the frames have not drawn yet (a muzzle flash that is switched off, the wall behind the camera, the next
room) is built too, one kind of thing at a time for about 3 ms a frame over the view's first frames, so
turning round or switching a thing on mid-round does not stop a frame: `v.shadersLeft` says how many
things are still to look at (a loading screen can wait for 0), and `v.precompile()` waits for them once
the view has drawn a frame. Before a view's first frame that picture is not known yet, so `v.prepare()`
there only gets textures and the canvas's own shaders ready and the first frame builds what it draws.
The shader-hold script fails on WebGPU if a pipeline or a shader's text is made in the middle of a frame
for a thing switched on, turned to or added, or for anything at all after a view's first frame.
`__hd.info` reports `{ calls, tris, cpu, shadows, upscaled, backend, framegen, refl }` for the last frame (`refl`: `'traced'`, `'screen'` or `''`, the reflections it drew). The 3D frame is rendered at the tier's pixel count (and lower while the phone struggles), then upscaled to the card's full resolution with **Snapdragon Game Super Resolution 2** (Qualcomm's temporal upscaler, `src/kit/sgsr2.js`): the camera is nudged by a fraction of a pixel each frame and each new small frame is blended into the full-size picture of the frames before, moved by the camera's own move. That gives a sharper, steadier picture than one frame can, and it also runs at full size as anti-aliasing (grass, leaves, wires and thin poles stop shimmering; FXAA is off then). Things that move fast across a still camera can leave a short soft trail (there are no per-object motion vectors), so a view can set `v.upscaler = 'sgsr1'` to use **SGSR 1** (`src/kit/sgsr.js`, one frame, edge-aware sharpening). AR views and frames with screen-space reflections use SGSR 1 too, and `HD.upscaler = 'sgsr1'` switches every view. `HD.upscale = false` shows the plain stretched picture for comparison, and `node scripts/upscale-compare.cjs` scores plain, SGSR 1 and SGSR 2 against a supersampled picture (`--webgpu` for the WebGPU path, which has its own TSL versions of both). SGSR 2 has two changes of ours to Qualcomm's upscale pass, on WebGPU (`hd3d-gpu.js` `sgsr2Gpu`) and on WebGL (`sgsr2.js`): the history is read sharply (Catmull-Rom) instead of bilinearly, which was softening it a little every frame the camera moved, and a pixel that stays put lets its history count for more (up to four times), so a still picture shimmers less. `__hd.sgsrTune = false` draws it as it was, and the comparison draws both and fails if ours comes out worse. On WebGPU, textures under SGSR 2 are read as the screen's size would read them, not as the small picture does (a mip bias of log2(drawn width / screen width), the value FSR 2 and DLSS ask for too): the small picture's mip level is too soft for the screen it is built up to, and the jitter and history settle the finer detail. WebGPU samplers have no bias, so each texture's node is given one through three.js's hook on the renderer's context (`hd3d-gpu.js` `sharpMips`), with no shader patched and nothing added to the cost of a texture read: every standard material's maps get it, and the kit's own shaders that read textures elsewhere (parallax, scattered and position-laid recipes) scale their gradients to match. On the comparison's textured scene the picture came out 8 to 9% closer to the true one at 1.5x and 10 to 11% at 1.8x, with a little more flicker when nothing moves; half a mip level sharper again was closer still with more shimmer, so it stops at the usual value. (Scaling every texture's uv gradients instead was 11 to 16% closer, but explicit gradients are a slower kind of texture read: 15 to 20% of a frame in the software renderer, not measured on a phone, so the bias it is. three has no hook for a bias, so it is handed to the texture's node for the one read three makes after asking for gradients; if a three.js update changes that, textures go back to being read as drawn and the comparison's textured runs fail.) `__hd.mipBias = false` reads textures as drawn (a number adds that many mip levels on top). WebGL keeps the textures as drawn: WebGL 2 has no sampler bias, and the only other way is patching three's shaders. The 2D HUD is always drawn at
full resolution on top. `v.onTier(T => ...)` lets a game react (for example `spotLight.setTier(T)`).

Rules of thumb:

- Merge level geometry (walls into one mesh per material) and use `InstancedMesh` for repeated
  props. Aim for a few hundred draw calls at most.
- Hide things beyond the fog distance.
- Never create your own `WebGLRenderer`: phones allow only a few WebGL contexts. All Next Gen
  games share one, and the Classic kit has its own.
- Build textures once per game module (lazily, on first draw), not per round.
- `window.__hd.force = 0..3` pins a tier for tests and screenshots.

## Multi-touch

Next Gen games use two thumbs. Input callbacks get a pointer id: `down(x, y, id)`,
`move(x, y, pressed, id)`, `up(x, y, id)`. The pattern used by all three games: the first finger is
the movement stick; a second finger (or a finger on the other half of the screen) is the aim, look,
fire or nitro control. Keep a single-finger fallback so the game still plays with one thumb.

## Writing a Next Gen game

```js
import gs from '../gamescroll.js';
const { HDView, Particles, pbr, rbox, surface, spot, THREE } = gs.hd;

let v;
function setup() {
  v = new HDView({ bg: '#06080c', fog: .07, env: .15, amb: .15 }).lampLights(9);
  const torch = spot('#fff1dc', 22, 16, .5); v.scene.add(torch, torch.target);
  v.onTier(T => torch.setTier(T));
  // add meshes to v.scene; move v.cam yourself (it is a PerspectiveCamera)
}
// in draw(c): move things, v.placeLamps(...), then
v.render(c, W, H);
// ...then the 2D HUD on top
```

Game definition:

```js
export default {
  id: 'my-game', title: 'My Game', tag: 'Next Gen · Shooter',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,   // fluid: the camera adapts to any shape
  goal: 1500, hint: '...', make,
};
```

Check it with `node scripts/sweep.cjs my-game` (long random play at odd sizes) as well as the
usual smoke and fold tests.

**The loading screen after Play.** Play does not start a Next Gen, AR or Board round at once: the
app puts a loading screen over the card, runs your `reset()`, draws the round's first frames under
the cover, runs your first `update()` there once, and starts the round when the shaders for all of
that are built and the frames come on time (usually well under a second; "Play again" mostly shows
no loading screen at all). There is nothing to call. Two things follow for the game: make what the
round needs in `reset()` or in the round's first `update()`, not a few frames later, or it is built
in front of the player after all; and a sound or a spoken line started in the very first `update()`
is heard a moment before the cover lifts, so start those from the first touch (`gs.rounds.Ready`)
or a beat into the round.

**Full screen.** Every Next Gen card has a full screen button on its bezel. In full screen the
frame, caption and buttons go away and `maxW` / `maxH` no longer cap the size, so `resize(w, h)`
can hand you anything up to 2.4 : 1 either way (about 300 × 666 on a tall phone, 666 × 300 on its
side). Keep the HUD anchored to the edges of `W` × `H` and it just works.

## Reflections and contact shadows

- `v.reflect(floor, carBody)` marks shiny surfaces for reflections. On WebGPU they're drawn
  on the high tier (at half size) and ultra; on WebGL on ultra only (tests and `HD.force = 3`:
  play stops at high). On other phones those surfaces keep their normal look, so mark the few that
  matter (a wet floor, a polished hall), not everything. A rougher material reflects less sharply.
- **Ray traced on the best phones.** On most phones those reflections are worked out from the picture
  itself (screen-space), so a floor can only show what the camera can also see: nothing above the top of
  the screen, behind the camera or hidden behind something else. On the best phones (the `top` class,
  on WebGPU) each shiny pixel sends a ray through a simplified copy of the level instead, kept on the
  graphics chip, so a polished floor shows the ceiling and a mirror shows the room behind you. There is
  nothing to call: `v.reflect()` is the same, and the game looks the same on every other phone, less
  what only a ray can find. What to know:
  - The copy holds the level's solid meshes: its still things together (up to 300,000 triangles; bigger
    levels are simplified to fit, the smallest things left out last), and each moving thing as a block
    of its own that is placed every frame (up to 128 of them). A thing that starts to move is noticed
    within a third of a second; say so up front with `mesh.userData.moves = true` (a door, a lift, a
    car) and its reflection never lags. Adding, taking away or reshaping still things has the copy made
    again in the background (a second or so later, and not more often than every 1.5 seconds).
  - People and animals (skinned meshes), sets of copies (`gs.props`, crowds), see-through and cut-out
    things are not in the copy. They still show in reflections where they are on screen, the way they
    always did.
  - What a ray hits is coloured from the picture where the camera can see that spot too. Where it
    can't, it is lit simply: the sun (with a shadow ray), the sky's light, the eight nearest lamps and
    its own glow, in the material's colour (a texture counts by its average colour). So keep things
    that matter in a mirror plainly coloured, and don't expect to read a poster in one.
  - `mesh.userData.noTrace = true` keeps a mesh out of reflections altogether.
  - Reflections are sharp on smooth surfaces and soften with roughness and with distance; from a
    roughness of about 0.65 a surface shows none.
  - `__hd.traced = false` turns the tracing off (screen-space reflections then, as on other phones),
    `true` forces it on wherever the chip can; `__hd.info.trace` says what the copy holds
    (`{ tris, was, things, movers, other, left, ms, mb }`) and `__hd.traceShow = true` draws the copy
    itself. A chip whose driver won't take the tracing goes back to screen-space reflections by itself.
  - Checked by `node scripts/detail-test.cjs --page traced --webgpu` and the kit test (the copy's lists
    are walked there the way the shader walks them, against three's own ray caster). On a phone: the
    **Hall** in the engine test scenes. Nobody has seen it on a phone yet.
- `const cs = v.contact({ y: 0, size: 8 })` lays soft contact shadows on a floor (medium tier and up),
  so things look like they're standing on it even where real shadows are off. In a big level, keep it
  under the action with `cs.at(x, z)`.
- Ambient occlusion and reflections only see solid, opaque surfaces: see-through things (light
  shafts, glows, blob shadows, alpha-cut leaves) are left out of them so they don't leave dark marks.
  Keep any other mesh out with `mesh.userData.noAO = true`.

## Outdoor worlds: sun, air, sky and grade

Big outdoor levels (a valley, a coast, a city's rooftops) can turn these on. Each one is opt-in, so a
game that doesn't ask for them looks exactly as before.

```js
const { HDView, sun } = gs.hd, { Sky, Weather } = gs.sky;
v = new HDView({ bg: '#b8c8d8', env: .5 });
v.cam.far = 1500;
const s = sun('#fff0d8', 2.6); v.scene.add(s, s.target); v.onTier(T => s.setTier(T));
v.sun = s;                                   // the air, the glare and the sky use this light
v.air({ haze: .0008, mist: .002, mistFall: .1, clouds: .4 });
sky = new Sky(v, { time: 7.5, clouds: .4, env: true });
v.grade = { saturation: .92, contrast: 1.08, shadows: '#e6ecff', highlights: '#fff1dc' };
v.glare = .8;
// each frame, before v.render():
sky.update(dt);
s.fit(v, { far: 600, ground: (x, z) => land.height(x, z) });
```

- **Shadows fitted to the view** (`s.fit(view, o)` each frame, in place of `s.follow`): the sun's
  shadow covers just what the camera can see, out to `far` metres. `ground(x, z)` gives the ground's
  height (a `gs.outdoors` Land's `height`), so it stops at the hills; without it, `low` and `high` say
  between which heights things are. `tall` (default 20 m) is how high things on the ground reach. The
  narrower the view, the sharper the shadows: a scope gets crisp shadows where it looks.
  `around: 1.25` keeps the shadow to what's round the middle of the view (a scope looking across a
  valley: sharp shadows round the target, none wasted on the hills behind). It returns
  `{ width, height, texel }` in metres. `s.aim(x, y, z)` points the sun (towards it); a Sky does that
  for you.
- **Air** (`v.air(o)`): distance haze that warms towards the sun, mist lying low in the valleys, cloud
  shadows drifting over the land and wet streets. The kit adds it to every material in the scene
  before it first draws, so it costs no extra pass. Turn it on when you build the level: a material
  that has already been drawn is rebuilt when air reaches it. Settings: `haze` (.001 is about a
  kilometre of view), `colour` (far things fade to it) and `sunColour` (towards the sun), `mist`
  (thickness at height `mistY`, thinning by `mistFall` a metre upwards, `patchy` 0..1), `clouds` (cover
  0..1), `cloudShade` (how dark their shadows are), `cloudHeight`, `cloudSize` (metres), `wind`
  (`[x, z]` m/s they drift) and `wet` (0..1: rain darkens things and makes up-facing surfaces shiny).
  It returns the settings, which you can change any time (`v.air().wet = rain.amount`); `v.air(false)`
  turns it off. Your own `ShaderMaterial`s and materials with `fog: false` are left alone.
- **Weather that changes the world** (`new gs.sky.Weather(v, { kind: 'rain', level: world, ground: land.height })`):
  given the level, the weather wets only what the sky can see, so the floor of a house and a porch stay
  dry; puddles spread on flat ground and dry up; snow settles on ground and roofs and melts. It keeps a
  map of the highest solid thing over each half metre round the camera (rays into the level a few
  hundred a frame) and the air reads it, so it costs no extra pass and is the same on WebGL and WebGPU.
  `weather.wetAt(p)`, `snowAt(p)` and `open(p)` answer for a spot. The full list is in
  [maker-kit.md](maker-kit.md#weather-that-changes-the-world); `node scripts/weather.cjs film.png` films it.
- **Ground that takes marks** (`new gs.outdoors.Marks(v, { land, weather, mud, sand })`, then
  `marks.watch(person)` and `marks.update(dt)`): feet leave prints and wheels leave tracks in snow where
  the weather has let it settle, in mud where the rain has wet bare earth, and in sand; fresh snow, rain
  and wind take them away again; the land's meadow leans away from whatever passes and stays trodden
  where it was walked on. The prints are thin sheets with stock materials on the land's own triangles
  (the same on WebGL and WebGPU, nothing where the ground is unmarked), and every mark is remembered,
  so `marks.trail()` can be followed. The full list is in
  [maker-kit.md](maker-kit.md#ground-that-takes-marks); `node scripts/marks.cjs film.png` films it.
- **Cliffs, caves and overhangs** (`land.rocks({ caves, shapes })` on a `gs.outdoors` `Land`): real rock on
  the height map that can fold over itself. Cliffs with beds, ledges and lips that overhang come by
  themselves where the land is steep; `caves: [{ path, radius }]` cuts tunnels you can walk through (the
  land's own squares are left out at their mouths); `shapes` melts in arches, blocks and balls of rock, or
  cuts hollows. Afterwards `land.height()` is the top of the rock, `land.floor(x, y, z)` what a thing
  stands on (a cave's floor, a ledge), `land.roof()`, `land.sky()` (how dark it is in there) and
  `land.ray()` answer the rest, and the weather, the sound, the physics, the grass and the marks all take
  the rock with the land. It is drawn with one stock material and a colour at every point (the same on
  WebGL and WebGPU; `looks.rock(land.rock.material)` adds grit), and its numbers are worked out in a
  background worker while the card loads. The full list is in
  [maker-kit.md](maker-kit.md#cliffs-caves-and-overhangs); `node scripts/rocks.cjs out.png` takes pictures of it.
- **Sky** (`gs.sky`'s `Sky`) with `clouds: 0..1` draws drifting clouds lit from the sun's side (your
  own colours with `cloudLight` and `cloudDark`; `gap` keeps the low sky round the sun clear). It aims
  the sun, and on a view with air it colours the haze from the sky and lays the clouds' shadows on the
  ground. `env: true` makes the reflections and sky light from this sky instead of the kit's studio
  (made when the shaders warm up, and again when the time or the clouds change, at most every 3 s).
  `sky.flash = 1` lights up the clouds for lightning: set it from your Weather while a flash shows.
- **Colour grade** (`v.grade = { saturation, contrast, shadows, highlights }`): saturation and
  contrast (1 = no change), and tints for the dark and the bright parts of the picture (`'#rrggbb'`, a
  Color or `[r, g, b]`). It runs in the final pass. `v.grade = null` turns it off.
- **Sun glare** (`v.glare = 0..1`): a soft glow round the sun and two faint lens ghosts across the
  picture, only while the sun itself shows (it fades behind a wall or a tree).
- **Shadow cascades** (`s.fit(v, { far: 320, near: 40, ... })`): a second sun light whose shadow
  covers only the first `near` metres, so the grass at your feet gets a sharp shadow while the far one
  still reaches the hills. Each spot takes the sun from one of the two (fading across the near box's
  edge), so it's never lit twice. High and ultra tiers only, with `v.air()` on; turn it off (`near: 0`)
  while a scope is up, where `around` already keeps the shadows sharp round the target.
- **Physical sky** (`new Sky(v, { physical: true })`, or `{ haze, blue, mie, glow, bright }`): the sky's
  colours come from how sunlight scatters in air (the Preetham model): deep blue overhead, pale at the
  horizon, an orange sun as it sets. Clouds, reflections (`env`), the air's colours, fog and the sky
  light all follow it; the day keys then only set how strong the sun and fill are. `sky.physical` can be
  switched any time (a clear morning on one mission, a grey storm with the day keys' colours on the next).
  The glow round the sun has a soft cap (about as bright as a painted sky's), so facing a low sun doesn't
  turn the screen white.
- **Depth of field** (`v.focus = { at, range, depth, blur }`): what's `at` metres away, give or take
  `range`, stays sharp; things `depth` x `at` metres nearer or further are fully soft, up to `blur`
  pixels. Made for scopes and cutscene close-ups; `v.focus = null` turns it off. It reads the depth the
  ambient occlusion already draws, so it's on high and ultra only and costs one full-screen pass.
- **Volumetric light** (`v.beams = { light, density, far, glow, strength, steps }`): light seen in the
  air, cut into beams by shadows: sun through a slatted wall or trees, a lamp's cone in a dusty barn.
  `light` is a `sun()` or `spot()` (default `v.sun`); `density` is how dusty the air is per metre (0.02);
  `far` is how many metres of air it looks through (60); `glow` (0..0.9, 0.5) brightens it toward the
  light; `strength` scales the light's colour (1); `steps` (24, up to 48) trades cost for smoothness.
  Shadows come from the light's own shadow map, so a light without shadows gives plain glowing air.
  Drawn at half size on high and ultra. The same steps as three.js's GodraysNode, written out for WebGL
  and WebGPU so both draw the same beams.
- **Motion blur** (`v.motionBlur = { amount, max, sharp }`): the world smears as the camera turns and
  moves fast. `amount` is how much of each frame's move (0.5, a half-frame shutter); `max` is the longest
  smear as a part of the screen's width (0.04); things nearer than `sharp` metres stay sharp, such as the
  car, bike or hands the camera carries. On WebGPU each thing also blurs by its own move (a ball flying
  past, a spinning wheel, a swung sword), smearing out over what's behind it, from three.js's velocity
  picture; `objects: false` keeps it to the camera's move. WebGL blurs the camera's move only. High and ultra; `v.cut()` after a camera jump stops
  one big smear. Scale `amount` by `gs.prefs.motion` for players with Reduce motion on.
- `v.envFrom(scene)` makes the reflections from any scene of your own (a painted room, a sunset dome),
  and makes them again on WebGPU when the view draws there; `v.env = null` goes back to the studio.
  (A texture set straight on `v.env` keeps a view on WebGL.)
- `gs.hd.noiseTex()` is a shared 256 x 256 tiling noise texture (four sizes of noise in r, g, b and a)
  for your own shaders: clouds, water, grass, dirt.

## WebGPU

On any device that offers WebGPU, Next Gen and AR views draw with three's WebGPU renderer; everywhere
else they use WebGL. There is no setting. Nothing changes in a game: a view that uses a part not
ported yet (see `docs/webgpu-move.md`) stays on WebGL by itself. `node scripts/gpu-games.cjs <id>`
plays a game on both and says which it drew on. Everything in Long Shadow (outdoor looks, sky, shafts,
focus, cascades, Props trees) and Deep Pressure has a WebGPU version.

Code-made textures (`surface()`, `gs.models` recipes, `detail()`) are packed into compressed GPU
formats on WebGPU by spark.js (Ludicon), one at a time in the background. `HD.packed` says how many
and how much memory that saved; `HD.pack = false` keeps them plain (tests).

HDR screens: where the phone's screen reports a high dynamic range, the WebGPU canvas is half-float in
extended range. The picture up to paper white is the same as on any screen; what's brighter than white in
the scene (the sun, glows, sparks, glints, bloom) goes past it, up to about twice paper white, instead of
stopping at white. `HD.info.hdr` says whether it's on. Nothing to do in a game: brighter `glow` values and
bloom simply show brighter on those screens.

### Frame generation

On WebGPU, a Next Gen or AR game that draws fewer frames than a fast screen shows gets made frames on
the refreshes in between, so it moves at the screen's rate (`src/kit/framegen.js`): 60 frames a
second on a 120 Hz screen gets one made frame between each pair, 40 gets two, 30 gets three, and a
90 Hz screen fills its odd refreshes the same way. It's not a neural network: every pixel moves along
its own motion (three's per-pixel velocity, so moving things move, not just the camera), depth
decides what's in front, and gaps that open behind moving things are filled from the background
round them. The method follows AMD FSR 3's frame interpolation (MIT) and Mob-FGSR (SIGGRAPH 2024),
written fresh as WebGPU compute. It runs after SGSR 2 at the screen's size, takes SGSR 2's camera
jitter back out of the motion, and costs a few milliseconds of compute instead of a whole extra frame.

- **What motion vectors miss** (a shadow sliding over still ground, a scrolling texture, a reflection)
  is read from the pictures too: an optical flow, worked out once per pair of real frames by matching
  blocks coarse to fine, as FSR 3 does. It's used per pixel only where it matches both real frames
  clearly better than the game's own motion and the surface's depth agrees, so a still floor under a
  moving shadow isn't dragged along.
- **Cuts are found by themselves:** the same pass compares the two frames' brightness spread and how
  well anything matches; after a cut the made frames show the nearer real frame instead of mixing two
  scenes (the commonest frame gen complaint after ghosting).
- **Big gaps** that open behind fast things are filled from a small pyramid of the made frame that
  favours the far side (the background), instead of a smear from the edge.
- **As sharp as real frames:** both real frames are read with a sharp 5-tap filter, so made frames don't
  look softer than the real ones between them (no "shimmer" from sharp, soft, sharp).
- **Pacing by the clock:** each refresh works out which moment it shows from its own time, so a refresh
  the phone skips doesn't hold the picture back a step that then jumps.
- **Camera turns are exact.** The camera's turn and zoom between frames are worked out from its pose
  (a rotation of the picture), not guessed from pixels, so a fast pan lands where the real frame
  would. What's left (things moving, the camera sliding) follows a curve through the last three real
  frames, so things going round a bend don't cut the corner.
- **Fresh aim.** Each made frame can turn to where the camera points *now*, from the newest touch,
  instead of where it pointed at the last real frame, so looking and steering answer at the screen's
  rate. Camera rigs (`gs.camera`) and AR views do it by themselves; a game with its own camera says
  how with `v.aimNow(cam => { cam.rotation.y = lookAngle; })`: point the camera from the input the
  game has already taken (a look angle a finger moved), without moving the game on. The camera is put
  back straight after.
- **When:** Settings › Frame generation (on devices with WebGPU). Auto (the default) makes frames for a
  game that can't reach the screen's rate (the 3D kit stepped it down), and for every 3D game while the
  phone is warm, in battery saver, or under 20% battery and not charging (`src/kit/power.js` asks the
  phone every 15 seconds; it holds a minute after the reason goes); then the game draws half the
  frames, which keeps the phone cooler. Always does that all the time; Off. A pinned frame rate turns it off.
- **Screen rate:** phone screens pick their own rate (LTPO screens like the Fold's step between 120,
  60 and lower) and a web page can't ask for one, so the app asks through `plugins/screen-rate`
  (`src/kit/screenrate.js`, Android) while a round is played: the fastest rate that's a whole number of
  refreshes per real frame when frame generation fills in (60 fps on a 144 Hz screen asks for 120), so
  the phone can't drop the card to 60 Hz and turn it off; the game's own rate otherwise (a game at 60 or
  30 asks for 60, which saves battery). Between rounds the phone decides. It's a wish: Samsung's Motion
  smoothness, battery saver and Game Booster can still overrule it. On iPhone the web view draws near
  60 frames a second on 120 Hz ProMotion screens, which left no refreshes for frame generation; the
  plugin turns that off with WebKit's own switch (private API, so `GSHighRefreshWebView` = NO in
  `ios/App/App/Info.plist` puts the cap back if App Review objects).
- **Stutter shield:** a game drawing every refresh whose frames start coming late (two late in a
  second) gets frame generation at once for two seconds, so the refreshes it would miss show made
  frames instead of the same frame twice. It can't help a hitch that holds the whole app up (nothing
  is shown then), only a run of slow frames.
- **Pacing per phone:** blend puts a made frame on the same refresh as the real frame's work. If the
  refreshes in between keep coming late in blend, that game switches to ahead on that phone (the work
  is spread over both refreshes; it's remembered with the game's settled frame rate); if they still
  don't come, frame generation turns off for that game until the app restarts. A game that switched
  itself to ahead only guesses one frame per real frame: with two or three to make (a game at 30 on a
  120 Hz screen) they are blended again, because guesses that far past the newest frame smear a
  running figure. Ahead picked in Settings, or by the game's own `frameGen: 'ahead'`, is kept.
- **How:** blend (the default) makes the frames between the last two real frames and shows them
  before the newest, so each real frame shows a little later (half a frame at 60 on 120 Hz, about
  8 ms), with the fewest flaws. Ahead guesses past the newest, so nothing is delayed; edges round fast
  things are a little softer. A reflex or rhythm game can ask for it with `frameGen: 'ahead'` in its
  definition, and `frameGen: false` turns it off for a game (a look that flickers on purpose, a
  picture that changes in ways motion can't follow).
- **See-through things** (transparent materials: glass, water, smoke) have no single motion, so the
  background's motion is kept under them and the made frame shows them from the newest real frame,
  unmoved: they never smear or show twice. **Glowing sparks** (added-light particles that say how
  they move, as `GPUParticles` do) are moved along their own motion where the last frame shows the
  same spark where it came from, so sparks fly at the screen's rate; where sparks cross or flare up
  they stay as drawn. Smoke stays as drawn: moving it dragged the ground behind it along, which looked
  worse than leaving it.
- **Still pictures:** when nothing on screen changed for three frames in a row (the GPU compares a
  sample of pixels; the camera, the hurt flash and the last touch are checked too), the 3D view shows
  its last picture again instead of drawing, and draws one frame in six to look again.
- **With SGSR 2:** SGSR 2 uses the same per-pixel motion (so moving things stop leaving soft trails)
  and the see-through mask (glass and sparks don't smear into its history), whether frame generation
  is on or not. While frame generation is on, each real frame is drawn with 1.6 times the pixels (it
  has twice the time), and at moving edges the made frame picks, of the motions round each screen
  pixel, the one both real frames agree on, so upscaled edges stay sharp. Motion blur is cut by the
  number of refreshes each real frame covers, so it isn't doubled.
- **The HUD** is drawn on the card's own canvas over the 3D, so it is never warped. Vignette, grain
  and the hurt flash go on as each refresh is shown, so they stay put and the grain stays even.
- **Motion comes from what three drew last frame**, so it has to be the same thing in the same place:
  - Instances that move every frame keep each thing in the same slot (instance index) from frame to
    frame; packing a list afresh (a splice, a filter, the visible ones first) gives things each
    other's motion, and they break up in made frames. Hide a slot with a zero scale instead.
    gs.props and gs.city's traffic do this.
  - A material that moves its own points (`positionNode`: sway, waves) also moves `positionPrevious`
    by where they were last frame, as `looks.leaves` does on WebGPU (hd3d-gpu.js `lastFrame()`).
  - A thing that jumps somewhere new (a respawn) shows wrong motion for one frame: do it off screen.
- **Size changes are cheap:** the frame generator's shaders take every size as a uniform, so a
  resolution step mid-round reuses them instead of stalling to build new ones; the stutter shield
  never changes the resolution.
- **Memory:** the made frame and its unfilled copy are kept in 8 bits a channel when the screen is
  not HDR (the picture is already finished screen colour by then, and it scored the same as 16 bits
  on every test scene), which halves those two screen-size stores: about 34 MB on an unfolded Fold.
  The motion and depth stores at the drawn size are the larger part and stay as they are. An HDR
  screen keeps 16 bits throughout.
- **Cuts:** after a cut nothing is made until two new real frames. Another view drawing, a pause and
  big camera jumps (turning more than 20 degrees, moving 8 metres or zooming by a quarter in one frame) are found by themselves;
  call `v.cut()` when the camera switches somewhere new in a smaller step (it also restarts SGSR 2).

`__hd.info.framegen` says which way it ran last frame ('blend', 'ahead' or false), `fgSteps` the
refreshes per real frame, `fgMs` the CPU time to queue it and `still` whether the last refresh
showed a still picture again. `node scripts/framegen-test.cjs [--mode ahead] [--steps 3] [--hard]`
scores made frames against the truth on test scenes (moving things, things going round in circles,
a camera turning round the scene and on the spot, glass, sparks, smoke, SGSR 2's jitter; `--kinds
shadow,scroll,cut` for a moving shadow, a scrolling texture and a cut, with `--query '&flow=0'`,
`&fill=0` or `&sharp=0` to compare without the optical flow, the gap pyramid or the sharp filter), and
`node scripts/framegen-test.cjs --check` runs every suite against `scripts/framegen-test/baseline.json`
(the PR check does this when frame generation's code changes; `--save` after a change meant to move
the numbers). `npm run build:bundled && node scripts/framegen-games.cjs [id ...] [--shots dir]` plays
the Next Gen and AR games with it on and checks every made frame sits between the real frames round it.

## Lots of particles

`new gs.hd.GPUParticles(v, { max: 20000, gravity: 9, drag: .3, floor: 0, turbulence: { strength: 2 } })`
moves its particles on the graphics chip when the view draws with WebGPU, so tens of thousands of
sparks, embers, confetti or rain splashes cost little. On WebGL they move on the CPU, capped to what the
phone can afford (`p.max`). Ask for bursts and step it once a frame:

```js
fire.emit(200, { at: [x, 1, z], vel: [0, 4, 0], spread: 3, life: [.6, 1.2], size: [.12, .02], color: [3, 1.5, .4], to: [1, .1, 0] });
fire.update(dt);
```

Burst fields: `at`, `radius` (start anywhere in a ball), `vel`, `spread` (a random extra speed), `life`,
`size` and `color`/`to` (start and end), `alpha`, `fadeIn`, `ease`. Up to 16 bursts a frame. They are for
looks only (positions can't be read back); use `Particles` for the few the game must know about.

## Glowing rings

`gs.hd.pulse(material, { at, radius, strength, color, width, fill })` adds a glowing ring that
sweeps out from a point over a lit material: sonar, a shockwave, a scanner. `at` is a `{ value: Vector3 }`,
`radius` and `strength` are `{ value }` objects the game changes each frame (strength 0 hides it),
`color` is linear `[r, g, b]` (above 1 is brighter), `width` the ring's thickness in metres and `fill`
a faint glow inside it. Share the same objects across materials to move one ring over all of them. It
works on instanced meshes and on WebGL and WebGPU alike.

## Decals, light probes and sun shafts

- `v.decal(mesh, hit.point, hit.normal, { size: .3, colour: '#1a1410' })` puts a mark on a surface that
  wraps over its shape (three's DecalGeometry): scorches, bullet marks, footprints, paint, splats.
  `paint: (c, s) => {}` draws your own mark on an `s` x `s` canvas (give it a `key` so it's drawn
  once), `life` fades it out after that many seconds, `max` (default 40) drops the oldest first, and
  `glow` makes it shine (lava, neon paint). `v.clearDecals()` removes them all.
- `v.bakeLight([x, y, z], { radius: 10, strength: 1 })` bakes the light round a point into a light
  probe (the colour coming from every direction), so lit materials pick up a red wall, a blue
  window or green grass. Bake once the level is built, not every frame. Several probes blend as the
  camera moves (or `v.probeAt`, such as the player). Lower the view's `amb` when using probes.
  `v.clearProbes()`.
- `v.bounce(box, { spacing: 1.5, bounces: 1 })` adds bounce light (baked global illumination) over a
  box (`{ min: [x, y, z], max }`, a `Box3`, or an Object3D to cover): a 3D grid of light probes, one
  every `spacing` metres, that light every lit material by where it is. A red wall tints the floor
  beside it, a sunlit patch lifts a dark room, a cave is lit from its mouth, and things moving through
  the room pick it up as they go. `bounces` adds passes of light bounced around again. It bakes the first
  frame after (on WebGL or WebGPU, three.js's LightProbeGrid); call `.bake()` on what it returns after
  the level changes, `.remove()` or `v.clearBounce()` to drop it. Lower the view's `amb` with it.
  Prefer it to `bakeLight` for new games (`bakeLight` keeps the view on WebGL).
- `v.room(box, { size: 128, strength: 1, meshes })` gives the shiny things in a room reflections of
  that room: a picture of the room from its middle, box-projected so a polished floor or a chrome ball
  shows the walls, windows and red sofa in the right places instead of a far-off sky. Every lit
  standard material on a mesh inside the box gets it (or only `meshes`); call it once the room is
  built, before the first draw. `.bake()` again after the room changes, `.remove()` to drop it.
- **What is hidden behind other things isn't drawn**, by itself (occlusion culling): the rooms behind a
  wall, the lanes behind a row of houses, a village behind a hill. Nothing is listed or marked. After
  each frame the graphics chip boils that frame's depth down to a small picture (about 2,400 texels:
  how far the farthest thing in each block of the frame is, and how near the nearest) and hands it
  back a frame or two later. The engine carries it over to where the camera is now and keeps only what
  it can be sure of: with the camera where it was (it may have turned), everything; once it has moved,
  only blocks that are one surface all over, and none of the edge where one surface ends. Every mesh
  (a sculpted person or creature by its bones), each copy of a `gs.props` kind and each cluster of a
  cluster-detail mesh is then tested by its bounds, and left out of the frame when it is surely hidden.
  - A frame with the hidden things left out is the same picture as the frame drawn whole
    (`scripts/detail-test.cjs --page occlude` compares them, frame by frame). A thing that moves,
    changes shape or goes takes its old place out of the picture that same frame, so what was behind a
    door is drawn the frame it opens. Glass, fences and anything see-through hide nothing; leaves and
    grass that sway (`looks.leaves`, `land.meadow`) are trusted a little less round where they are.
  - Hidden things still cast their shadows, show in reflections and are hit by rays: they only step
    off the camera's layer for the main draw.
  - It costs about half a millisecond of code a frame on a build machine (`__hd.info.occMs`), so a
    view of fewer than 20,000 triangles and 120 draws is never tried, and a view where it saves next
    to nothing (under 2,000 triangles a frame, or 2% of the frame) rests for a while and tries again
    later. It also rests unless what it leaves out is worth more than finding it costs: on a phone the
    graphics chip's time goes on pixels more than triangles (a Galaxy Z Fold 8 saved about 9 ms for a
    million triangles and 0.01 ms a draw), so the triangles and draws left out are turned into
    milliseconds at those rates and set against the code time it took plus the depth picture's
    (`occludePays` in `src/kit/occlude.js`). A town where it cut a quarter of the triangles for no
    gain in frame rate now rests; a view where most of the scene is behind a wall keeps it.
    `__hd.info.occluded` and `occTris` say what the last frame left out; `occAwake` whether it
    is at work, `occPays` what the last trial found.
  - Limits: on WebGL, the still things that static batching has merged are left out a merged mesh at
    a time. On WebGPU, a `gs.props` kind picked on the chip (2,000 copies or more) or one that casts
    shadows is not left out copy by copy. The shadow maps do not use it (they keep to what changed
    instead: "kept in tiles" above). It is off
    for see-through views (AR), a card's picture, and cameras with no perspective.
  - Switches: `mesh.userData.noOcclude = true` always draws a mesh, `v.autoOcclude = false` stops it
    for a view, `__hd.occlude = false` everywhere (to compare), `__hd.occludeTexels` sizes the depth
    picture (6000 hides a little more of what is small and far, for about twice the work).
- `v.occluders(list)` adds boxes of your own to that: big solid things that stay put (walls,
  buildings, cliffs), as boxes `{ x0, x1, y0, y1, z0, z1 }` in world metres, `Box3`s, or solid
  box-like meshes; `null` clears them. They hide things from the first frame, before any depth
  picture is back, and in views where the last frame's depth can't be used (`{ max: 300 }` of the
  nearest are used). Most games need none. `gs.city` lists its buildings by itself (`occlude: false`
  to stop it). `v.occlusion.stats` says what the last frame tested and skipped.
- GPU culling (WebGPU): a `gs.props` kind with 2,000 copies or more is culled on the graphics chip
  instead of the CPU. A compute pass tests every copy against the view and the lights' shadow views,
  picks its detail level by distance, and packs the ones that pass into a list drawn with one indirect
  draw per level. The CPU only sends the copies again when the game moves, hides or recolours one, so a
  forest of 6,000 trees costs about 2 ms of CPU a frame instead of 6. Games don't change anything.
  `__hd.gpuCull` is `'auto'` (the default), `true` (every kind) or `false` (always the CPU). It is off while
  frame generation runs, because frame generation needs each copy to keep its place in the list. Its
  copies are not left out when hidden behind things, and a kind with a list of materials stays on the CPU. Copies that move every
  frame should be plain meshes anyway; on the GPU path a moved copy gets no motion blur for that frame.
  On the CPU path (smaller kinds, and every kind while frame generation runs) each copy keeps its place
  in the list while it stays in view, and only the copies that came in, left, changed level or were
  changed by the game are sent to the graphics chip again: a still camera sends nothing. (Every list
  used to go up whole each frame, and three.js's copy of it for motion with it: for a forest of 22,000
  that was 430 KB a frame, now about 5 KB while flying over it, and filling the lists took 2.1 ms a
  frame, now 1.5.) A copy that takes a new place in a list (it came into view, or changed detail level in
  the middle of the picture) is put into last frame's list where it stands as well, so frame generation
  and SGSR 2 see it move with the camera like everything round it. Before, its motion came from
  whatever had held that place, and a made frame smeared it across the screen: in the frame generation
  check's `copies` scene, where a zoom changes the level of every copy in the middle distance at once,
  3.2% of the made picture was broken, now 0.13% (a plain strafe: 0.12%).
- `v.shafts = 1` (0..2) adds sun shafts: the bright sky round the sun is smeared towards it at quarter
  size, so whatever blocks it (trees, window frames, a hill) leaves streaks of light. Set `v.sun` so
  it knows where the sun is. It's off on the lowest tier. A physical sky is far brighter round the sun;
  it tells the view how bright (`v.shaftsAt`), so only the sky close to the sun makes shafts and they
  never white out the screen.

## Outdoor looks: ground, hills, rock, leaves, water and lava

`gs.outdoors` paints a Next Gen landscape that holds up through a scope. Each look is a named patch
on a three.js standard material, so light, shadows and the air still apply.

```js
const { Land, looks, groundDetail, horizon } = gs.outdoors, { THREE } = gs.hd;
const tex = groundDetail();                                   // tiling detail + bump textures, made in code
const normal = tex.normal.clone(); normal.repeat.set(170, 170);   // shared textures: clone before changing
const mat = new THREE.MeshStandardMaterial({ normalMap: normal });
const ground = looks.ground(mat, { detail: tex.detail, roads: [[x0, z0, x1, z1]], fields: { angle: .33 } });
land = new Land({ kind: (x, z) => myHeight(x, z), size: 640, segments: 128, material: mat });
land.masks((x, z, y, slope) => [fields, forest, rock, trodden]);  // 0..1 each, where each ground goes
v.scene.add(horizon(land, { inner: 300, outer: 1300 }));         // far hills all round
looks.rock(rockMaterial, { detail: tex.detail });              // cracks and grit three ways, moss on top
const leafLook = looks.leaves(leafMaterial, { wind: .6 });      // sway, sun glow, outlines kept far away
// each frame: leafLook.uniforms.lkTime.value = t; ground.wet = rain.amount;
```

- **`looks.ground(material, o)`**: meadow with dry patches, patchwork fields in strips with hedges
  (`fields: { angle, size: [w, d], furrows, hedge }` or `false`), forest floor, rock on steep ground,
  trodden earth, mud below `bank.low`..`bank.high` metres, lanes with ruts along `roads` (segments
  `[x0, z0, x1, z1]`) and puddles as it gets `wet`. `colours` swaps any of `grassA`, `grassB`, `dry`,
  `dirt`, `mud`, `rock`, `forest`, `cropA`, `cropB`, `plough`, `hedge`. `land.masks(fn)` says where each
  ground goes.
- **`horizon(land, o)`**: a ring of far ridges from `inner` to `outer` metres that meets the land's
  edge. `lower(x, z)` (0..1) keeps a side low for a view out; `colours: { meadow, forest, rock }`.
  `looks.hills(material)` is its look: woods, clearings and scree from noise.
- **`looks.rock(material, o)`** and **`looks.leaves(material, o)`**: `rock({ scale, moss, mossy })`;
  `leaves({ time, wind, sun, sway, above, glow, atlas })`. Pass numbers, or shared uniforms
  (`{ value }`) when several materials should move together.
- **`land.meadow(o)`**: thick grass for a camera that is down in it. A square of tufts travels with the
  camera: each tuft stays where it grows (a tuft is the same tuft whenever you come back to it), only
  the strip coming into the square is planted as you move, and tufts shrink to nothing towards the
  square's edge so none pops. Blades bend with `land.wind` in gusts that roll across them.
  ```js
  const grows = (x, z) => onRoad(x, z) || inYard(x, z) ? 0 : 1;      // 0..1: how thickly it grows there
  land.meadow({ reach: 8, gap: .3, blades: 9, width: .024, stalks: 1, where: grows });   // fine tufts at your elbows
  land.meadow({ reach: 24, gap: .8, blades: 7, bends: 2, width: .07, where: grows });    // coarse ones out to the distance
  // each frame: land.update(dt, v.cam);
  ```
  `reach`: metres from the camera to the edge; `gap`: metres between tufts (reach 22 with gap .55 is
  6,400 tufts of 40 triangles: count them against the tier's budget and use fewer rings on slower
  phones); `height`, `width`: a tall blade; `blades` a tuft; `bends`: 1..3 pieces a blade; `stalks`:
  seed stalks a tuft; `spread`; `colours: [green, another green, dried out]`; `where(x, z)` and
  `tall(x, z)` (0..1: short where it is trodden); `steep`; `seed`. `land.meadow(false)` takes every ring
  away (to build other rings when the tier changes). After a camera cut the square is planted over the
  next few frames, the grass nearest the camera first, spending `budget` milliseconds a frame a ring
  (.5), so a cut never costs a long frame. When you know where the camera will cut to, plant there
  ahead of time by passing that place for a few frames (`land.update(dt, { position })`), or all at once
  with `land.update(0, camera)` while loading. A camera flying past faster than 60 m/s (a bullet camera)
  plants nothing until it slows. Keep `where` cheap, or remember its answers for each metre of ground:
  it is asked for every tuft planted. The look is `looks.meadow`; leaves, grass and tree cards use a
  physical material with hardly any shine (`specularIntensity` about .1), because a blade or leaf seen
  edge-on against a low sun otherwise glints white.
- **Rivers, waterfalls, lava and floods**: `new River(stream)` draws a `gs.flow` river or pool with
  `looks.flow` (ripples and colour sliding downstream at each point's own speed, deeper in the middle,
  foam at rocks, banks and falls) or, for `kind: 'lava'`, `looks.lava` (glowing cracks between drifting
  plates of crust that cool downstream; the glow feeds bloom). `new FloodWater(flood, { view: v })`
  draws a `gs.flow` Flood; on WebGPU the flood itself runs as compute on the graphics chip and its
  depths are copied back every few frames for `flood.depth()`. Both look the same on WebGL and WebGPU.
- **Water you can disturb**: `new Water({ ripples: true, bed })` answers to what happens to it: `ring()`
  and `splash()` (rings, spray, foam), `watch(boat)` (its wake, its foam trail, a splash when it lands),
  `rain`, paler shallows and foam at the shore over a `bed`, and `underwater(view)` for a camera that
  goes under (the view's air turns to murky water and comes back). Stock materials only, so WebGL and
  WebGPU match, and your own water material is left as it is. See
  [Water you can disturb](maker-kit.md#water-you-can-disturb); film it with `node scripts/water.cjs`.
- Every look is a named effect (`material.userData.gsLooks` lists them), so the WebGPU version can
  swap each one for a node later (see `docs/webgpu-move.md`). Road segments: up to 32.

## Real 3D liquids: gs.fluid

`new gs.fluid.Fluid(view, { box, volume, kind })` is liquid you can pour, splash and fill things with:
a particle fluid (MLS-MPM) whose drops fall, pile up, slosh round solid things and settle level. With
WebGPU it runs as compute passes on the graphics chip with tens of thousands of drops (40,000 on a top
phone), drawn from the same buffers as lit round cards that read as one smooth body, with foam where
the liquid is thin or fast; they cast and take shadows and carry motion for frame generation. On WebGL
the same steps run in JavaScript with 600 to 2,000 bigger drops drawn as beads, so a game plays the
same on both and only looks finer on WebGPU.

```js
const { Fluid } = gs.fluid;
fluid = new Fluid(v, { box: [-2, 0, -1, 2, 3, 1], volume: 4, kind: 'water' });   // once, in setup()
tap = fluid.pour({ x: -1.2, y: 2.4, z: 0, rate: 1, speed: 2.5 });
cup = fluid.tube({ x: 1, y: .5, z: 0, r: .5, h: 1, hollow: .06 });
// each frame
fluid.update(dt); if (fluid.amount(cup.inside()) > .3) api.win();
```

Taps, bursts and blocks of liquid, solid balls, boxes and tubes (hollow ones are bowls, tanks and
cups; they push the liquid as they move and pour when tipped), ground to flow over, drains, blasts,
and the questions `amount(box)`, `level(x, z)` and `wet(x, y, z)`: the full list is in
[maker-kit.md](maker-kit.md#real-3d-liquids). `fluid.backend` says which version is running. The
liquid is opaque (coloured, glossy), so it sits in the solid pass with everything else and costs no
extra screen passes. `scripts/look-compare.cjs` draws it (`gpu-fluid`) and checks that the version on
the graphics chip keeps its liquid and comes to rest where the other does.

## Smoke and fire that flow: gs.gas

`new gs.gas.Gas(view, { box, kind })` is smoke and fire that behave: a gas simulation (the "stable
fluids" method) in a grid of cells that carry speed, smoke, heat and fuel. Smoke rises and curls,
spreads under a ceiling, pours round solid things and goes with the wind; fire burns its fuel into heat
and soot; an explosion rolls up into a mushroom. With WebGPU it runs as compute passes on the graphics
chip in 80,000 to 300,000 cells (300,000 on a top phone) and is drawn as a lit volume: each pixel's ray
is walked through the gas at half size, the smoke lit by the sun and the sky and shaded by the smoke
between it and the sun, flames glowing through it, and the result laid over the picture behind whatever
stands in front. On WebGL the same steps run in JavaScript in 5,000 to 12,000 cells, drawn as soft puffs
that ride the flow, so a game plays the same on both and only looks finer on WebGPU.

```js
const { Gas } = gs.gas;
gas = new Gas(v, { box: [-4, 0, -4, 4, 6, 4], kind: 'fire', lamp: true });   // once, in setup()
camp = gas.fire({ x: 0, y: .2, z: 0, size: 1 });
gas.box({ x: 0, y: 2.6, z: 0, w: 2.4, h: .4, d: .6 });                       // a beam the smoke goes round
// each frame
gas.wind.x = 1.2; gas.update(dt); if (gas.sees(gx, gy, gz, px, py, pz) < .3) hidden();
```

Fires, smoke makers, fans, explosions and puffs, solid balls, boxes and tubes (they push the gas as
they move), your world's walls and ground, a closed room, wind, and the questions `smokeAt`, `heatAt`,
`flowAt`, `sees`, `smokeIn` and `glow`: the full list is in
[maker-kit.md](maker-kit.md#smoke-and-fire-that-flow). `gas.backend` says which version is running.
Keep the box small (the cells get bigger with it) and build for the smaller version: a cell is about
three times as wide there. The volume is one more screen pass at half size; the gas casts no shadow on
the world and is not in reflections. `scripts/look-compare.cjs` runs it (`gpu-gas`) and checks that the
version on the graphics chip and the JavaScript one, given the same grid, stay the same gas cell for
cell.

## Things made in code: gs.models

A game stays one `.js` file with no image or model files, so `gs.models` makes the materials and
things a scene needs from recipes written in code. Everything works on WebGL and WebGPU.

```js
const { material, wear } = gs.models, { rbox, THREE } = gs.hd;
const crate = new THREE.Mesh(rbox(.8, .8, .8, .05), material('planks', { colour: '#a87a4c' }));
wear(crate, { edges: .8, dirt: .6 });                                       // rubbed edges, grimy foot
const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, .4), material('brick', { solid: 1, scatter: true }));
const barrel = gs.models.prop('barrel', { seed: 2 }); barrel.position.set(1, 0, 2); v.scene.add(barrel);
wear(wall, { moss: .7 });                                                    // moss on the top
```

- **`material(name, o)`**: 18 recipes: `wood`, `planks`, `bark`, `brick`, `stone`, `cobbles`, `tiles`,
  `concrete`, `metal`, `rust`, `paint`, `fabric`, `leather`, `marble`, `dirt`, `sand`, `snow`, `skin`
  (`gs.models.materials` lists them; `skin` is pores and fine lines, a tile to 16 mm at 64 repeats a metre:
  what the kit's people wear). Change the recipe's colours (`colour`, `dark`, `mortar`, `gap`, `rust`,
  `under`, `vein`, `grout`...), `seed` for another pattern, `repeat: [u, v]`, `size` (texture pixels, 256).
  Each is painted once into tiling colour, bump, roughness and metal textures, and kept across launches
  (the next launch reads them back instead of painting again). On WebGPU: `closeUp` (on by default)
  works the recipe out per pixel near the camera so it stays sharp however close you get. It is for
  the pixels the painted textures are stretched over: each pixel fades to the painted textures as
  they get fine enough for it, so a floor the camera stands on is close-up at its feet and painted
  further off, where the recipe would only shimmer. Its shaders build in the background, one at a
  time, for things within 4 units of the camera, and the painted look is drawn until they're ready.
  `solid: true` (or metres per tile) lays it on by world position, with no UVs or seams; `scatter: true`
  turns and moves each tile so a big floor shows no repeat (close up it works the recipe out four
  times a pixel, once for each tile it blends: pass `closeUp: false` where the camera never comes
  close). Other options go to `gs.hd.pbr` (`glow`, `clear`, `wet`...).
- **`wear(mesh, o)`**: ages a thing from its own shape, the way texture artists use curvature and cavity
  maps: outer edges rubbed lighter (`edges` 0..1, `edgeColour` for what shows through), creases and the
  bottom `ground` metres grimy (`dirt`, `dirtColour`), moss or snow on what faces up (`moss`, `mossColour`,
  `snow`). It is worked out once into vertex colours, so it costs nothing to draw. Flat-sided shapes are
  split into smaller triangles first (the shape stays the same) so there are corners to wear; `split: false`
  skips that. The material is copied, so other things sharing it stay clean.
- **`prop(name, o)`**: everyday things built from simple shapes, dressed in the recipes and aged with
  `wear`: `crate`, `barrel`, `drum`, `pallet`, `table`, `chair`, `bench`, `shelf`, `lamp`, `fence`, `sign`,
  `bucket`, `sack`, `chest`, `cone`, `bin`, `door`, `pipe` (`gs.models.props` lists them). A Group with one
  mesh per material, its foot at y = 0, facing +z. `seed` (small differences), `size` (its main measure in
  metres), `colour` (its main material), `wear` (options for `wear`, or `false` for new), `lit` (lamp glow).
  Asking again with the same options gives a copy that shares shapes and materials, so a hundred crates
  cost one to make, and copies that keep still merge into one draw.
- **`sculpt(shapes, o)`**: soft shapes melted together or carved away, the way sculptors block things
  out, turned into a mesh with surface nets: `{ ball: r }`, `{ box: [w, h, d], round }`, `{ cylinder: [r, h], round }`,
  `{ torus: [R, r] }`, `{ cone: [r, h] }`, `{ capsule: [[x, y, z], [x, y, z]], r }`, each with `at`, `rot`, `scale`,
  `blend` (how softly it melts in, metres), `cut: true` (carved away) and `colour` (vertex colours: give the
  mesh a material with `vertexColors: true`). Or pass a distance function `(x, y, z) => d` with `bounds`.
  Options `blend` (.08), `res` (cells along the longest side, 48, up to 128). About 0.1 s each, so make them
  in `make()` or `reset()`; the same shapes again give back the same geometry. While a card is loading,
  a sculpt given as a list of shapes is made in a background worker and the card waits for it (one
  given as a distance function is made on the spot: a function can't be sent to a worker).

```js
const snowman = gs.models.sculpt([
  { ball: .35, at: [0, .32, 0] }, { ball: .26, at: [0, .78, 0] }, { ball: .18, at: [0, 1.12, 0] },
  { cone: [.04, .22], at: [0, 1.13, .14], rot: [Math.PI / 2, 0, 0], colour: '#e8641c', blend: .01 },
], { blend: .1, colour: '#dde3ea' });
v.scene.add(new THREE.Mesh(snowman, gs.hd.pbr('#ffffff', { vertexColors: true })));
const rock = gs.models.sculpt([{ box: [.9, .6, .7], round: .15 }, { cylinder: [.14, 1], rot: [Math.PI / 2, 0, 0], cut: true }]);
```
- **`tree(kind, o)`**: a tree grown in code with EZ-Tree (branches that split, bend and taper, leaves on
  the twigs): `oak`, `ash`, `aspen`, `pine`, `bush`. Its bark is the `bark` recipe and its leaves are drawn in
  code, swaying in the wind and glowing with the sun behind them, on the view's own clock (they stop when
  the game pauses). `size` ('small', 'medium', 'large': its shape), `height` (metres), `seed` (another tree of
  the same kind), `leaves` and `bark` (colours), `wind` (.6, or a `gs.outdoors` Wind). About 20 to 80 ms each;
  the same options again give a copy sharing shapes and materials, so make a few kinds and place copies (or
  hand them to `gs.props` for instancing and far-off impostors).
- **`building(o)`**: a building to walk up to, from a small shape grammar: the block is split into floors,
  each wall into bays, and each bay into a real window opening (reveal, frame, sill, glass set back) or the
  door, with a string course, cornice, and a flat roof with a parapet or a gable roof. `style` (`brick`,
  `plaster`, `concrete`, `stone`, `timber`, or your own: `{ ...gs.models.buildings.brick, bay: 3 }`), `w`, `d`
  (metres, 8 x 6), `floors`, `roof`, `floor` (storey height), `bay` (metres per window), `win` ([w, h]), `lit` (0..1
  of windows glowing), `colour` (walls), `door: false`, `seed`, `wear`, `materials` (your own three.js materials
  in place of the style's: `{ wall, trim, frame, roof, door, glass, lit }`). Its door faces +z. About 0.1 to 0.25 s
  each, so make them while loading; for a whole town in the distance `gs.city` is far cheaper. One that
  comes apart when it is shot or shelled is `new gs.destruction.Structure(view.scene, { building: { ... } })`
  ([maker-kit.md](maker-kit.md#buildings-that-come-apart)).
- **`relief(target, o)`**: real surface detail. The bumps a material only paints (the height layer its
  texture was made with: the barrels of roof tiles, the mortar between bricks, the ridges of bark) are
  made into real triangles, so they stand out against the sky and hide what is behind them from every
  angle, on WebGL and WebGPU alike, and that mesh no longer needs the parallax shader. It is built in
  a worker (a second or two for a roof) and kept by the mesh's content in IndexedDB; the mesh draws as
  it did until its relief arrives. From then on the view draws it through cluster detail, so it costs
  triangles only where it is near enough to show: in the test scene a tiled roof of 4 triangles is
  17,000 at arm's length, a few thousand from across the yard, and the same 4 again once the tiles are
  smaller than a pixel.

```js
const roof = new THREE.Mesh(roofGeometry, gs.hd.pbr('#ffffff', { tex: tiles, depth: .024 }));
gs.models.relief(roof);                      // its depth: the material's own
gs.models.relief(house, { depth: .02 });     // every mesh under a group that has a height layer
```

  The height comes from the material: one made with `pbr({ tex: surface(...) })` or
  `gs.models.material(name)` has it (a copy made by `wear()` too); or pass `height` (a `surface()` set
  or its height texture). Lengths are in metres: `depth` (how far the lowest parts go in; default the
  material's parallax depth, or 3% of a tile), `fine` (the smallest detail made, half the depth),
  `error` (how far it may be from the picture, a tenth of the depth), `maxTris` (150,000 a mesh).
  Nothing is pushed out (only in), and the game's mesh keeps its own simple geometry, so raycasts,
  physics and anything else that reads it are as they were and nothing sticks out of what the game
  knows. `mesh.userData.relief` says how it stands (`'building'`, `'ready'`, `'failed'`: it then just
  draws flat), `await gs.models.relief.ready(target)` waits for it, `relief(target, false)` takes it off
  and `__hd.relief = false` draws them all flat.
  What it may cost a frame is set by the quality tier, not by how many surfaces a game gave it: the
  surfaces are drawn to within `__hd.reliefPx` pixels (2.5; cluster detail's own meshes keep 1), and when
  they come to more triangles a frame than the tier's budget (none on low, where they draw flat, 60,000
  on medium, 150,000 on high, 300,000 on ultra; `__hd.reliefTris` sets one of your own) every surface
  is drawn a little more coarsely until they fit. `__hd.info.reliefTris` and `reliefPx` say what the
  last frame drew. (A village of twelve houses drew 354,000 relief triangles a frame at one pixel on a
  Fold's picture and ran at 34 frames a second against 58 flat; at 2.5 pixels it draws 117,000.)
  It pays where the depth shows: roofs, stone walls, bark and cobbles seen close or against the light.
  A brick wall's thin mortar takes a great many triangles for little you can see; leave that to the
  normal map, or give it a larger `fine`. Not for materials laid on by position or scattered (`solid`,
  `scatter`), skinned, morphing, instanced or multi-material meshes, or see-through ones.
  `node scripts/detail-test.cjs --page relief [--webgpu]` draws a roof, a brick house and a trunk flat
  and with relief, and measures how much each flickers under a sliding camera (about the same in that
  scene: the gain is real depth that holds at glancing angles and along edges, not less shimmer).
- **`human(o)`**: a person to see up close, sculpted in code: a head with a brow, cheekbones, a nose, lips,
  ears and eyes with lids; hands with fingers; clothes cut the way a tailor cuts them (a tunic with its
  collar, pockets, buttons and belt, a blouse, a smock, breeches, tall boots, gaiters), hats (helmet, cap,
  beret, wool cap, hood), webbing, pouches, a pack. Creases, collars and hat brims sit in soft shadow worked
  out from the shapes themselves, so there is still no texture file. It stands on `gs.poses`' skeleton (`rig`,
  `bones`: the same poses, blends and foot planting; it moves with `gs.poses.LIFELIKE`, strides that land on
  the heel and push off the toes, and has weight: `rig.update(dt, { speed, turn })`; its feet stay where they
  are put down however the game moves it, and it steps round when turned on the spot: "Steps that are really
  taken" in the maker kit guide; a new move takes up the speed the body had, and arms, head and kit swing on
  and settle when it starts, stops or turns: "Momentum and follow-through" there) in three levels of detail: call
  `person.see(camera, screenHeightInPixels)` each frame, or set `person.lod` (0 close .. 2 far).
  `person.twin()` is another of the same person for almost nothing (a squad from two or three faces),
  `person.hold(thing, rightPoint, leftPoint)` bends both arms to put the hands on something carried (after
  `rig.update()`), `person.touch({ handL, handR, footL, footR }, { palms, level, elbows, knees, blend })` puts
  hands and feet on points in the world (a rung, a bar, a ledge: the grip of a closed hand or the palm of an
  open one, and the ball of a foot, land on the point; `palms: { L: [x, y, z] }` is the way a palm faces,
  `level` holds a sole flat, `blend` fades it in), and `person.gear.hat.visible = false` takes the hat off (also `gear.pack`, and your own
  `gear: [{ name, bone, shapes, hide: true }]`); `person.gear.hat.loose()` is a loose copy of it (a plain
  mesh, its middle at its origin, `userData.at` where that sits on its bone) for the helmet that flies off.
  The skeleton has the joints poses turn (`hips`, `spine` (the rib cage), `head`, `armL`, `foreL`, `handL`,
  `legL`, `shinL`, `footL` and their `R` twins) and, between them, a waist, a neck, a collar bone to each arm,
  the turn along each forearm, toes and three joints a finger. The rig sets those by itself from the pose: the
  back and the neck bend along their length, a shoulder rises and comes forward with its arm, the forearm's
  skin turns with the hand, and the toes lie flat as the heel lifts. So old poses, and whatever you parent to
  `bones.spine` or `bones.head`, work as before; after turning joints yourself call `person.rig.fill()`.
  `person.fingers({ L: .5, R: [0, 1, 1, 1, 1] })` closes a hand (0 flat, 1 a fist, `null` as sculpted; a
  number for the hand or one a finger, thumb first), and they stay as set. At the middle and far levels
  the small bones (fingers, toes, forearm turn) stand still and cost nothing.
  Looks: `sex`, `build`, `girth`, `skin`, `hair`, `hairStyle`, `iris`, `lips`, `moustache`, `stubble`, `face`
  (`{ jaw, chin, brow, nose, lips, cheeks, eyes }`, 1 is average), `hands: 'grip'`, and `outfit: { top, legs,
  feet, hat, belt, webbing, gloves, pack, extras }` (every option is listed above `human` in
  `src/kit/models/human.js`); `camo: [colour, colour]` on the top, legs or hat brushes blotches of those over
  its colour. The plain options (`body`, `legs`, `shoes`: colours) still dress a simple person. Each arm is
  a piece of its own that turns in the shoulder, so any pose is safe: nothing stretches at the armpit.
  **A cut of clothes this phone hasn't made yet takes a second or two to sculpt, so it happens in the
  background**: the app shows "Loading…" and makes the game again, exactly as when a big library loads, and
  each piece is saved on the phone for next time. So make people in `make()` or `reset()`; when there are
  several kinds, make them together and first: `const [a, b] = human.all([optsA, optsB])` (or
  `human.need([...])` before anything costly is built, then `human(opts)` wherever you like).
  The face is live: it blinks, the eyes move by themselves and go where you send them
  (`person.face.look(point)`), and `person.face.say(text)`, `set('smile', 1)` and `mouth(level)` work as on
  `gs.characters.Face`, with no `update()` to call: "A live face" in the maker kit guide.
  Skin and eyes read as flesh close up, with nothing to set: the skin has pores and fine lines (the `skin`
  recipe, laid on so it never smears at a seam; cloth and leather the same), an ear against the sun glows
  red while the head beside it stays solid (WebGPU; WebGL has a soft warm rim), and each eye has an iris
  that shades softly into the white, fine streaks out from a small pupil, and a cornea with a small sharp
  wet highlight that slides as the eye turns.
- **`creature(o)`**: an animal or a monster made in code from a seed, built the way people are (soft shapes
  melted into one skin, creases in soft shadow, eyes that catch the light, no model or texture file). 35 to
  start from, in five kinds: four legs (`dog`, `cat`, `horse`, `deer`, `cow`, `pig`, `bear`, `rabbit`, `mouse`,
  `lizard`), birds (`songbird`, `crow`, `duck`, `hawk`, `owl`, `chicken`, `heron`), fish (`fish`, `shark`, `eel`,
  `puffer`, `angler`), insects (`beetle`, `ladybird`, `ant`, `bee`, `butterfly`, `dragonfly`, `spider`) and
  monsters (`dragon`, `beast`, `ogre`, `imp`, `blob`, `serpent`).
  ```js
  const [stag, crow] = gs.models.creature.all([{ like: 'deer', seed: 7 }, { like: 'crow' }]);   // first thing in make()
  view.add(stag); view.add(crow);
  // each frame: the easy way picks and blends the gaits for a speed (metres a second)
  stag.move(dt, speed, { turn });          // walk, trot, gallop in step with the ground
  crow.move(dt, speed, { fly: flying });   // hop about, or beat its wings
  stag.see(view.cam, H);                   // three levels of detail by its size on screen
  ```
  `like` picks the animal; with no `seed` it is the animal as the book shows it, and a `seed` gives it its
  own build (longer legs, a shorter neck, antlers or none), coat, pattern and size, the same on every phone.
  `kind` alone (`'quad'`, `'bird'`, `'fish'`, `'insect'`, `'monster'`) lets the seed pick which animal too. Over
  that you can set `size` (metres from nose to rump; a bird beak to tail; an ogre or imp its height),
  `colour`, `belly`, `accent`, `pattern` (`plain`, `spots`, `stripes`, `patches`, `bands`, `socks`, `back`, `tips`,
  `hood`), `eyes` and the colour of any part (`horn`, `hoof`, `claw`, `beak`, `legs`, `comb`, `mane`, `wing`, `fin`,
  `nose`, `shell`, `lure`), and any measure by name: `build: { neck: .5, horns: 'antlers', wings: 1 }` (a dog
  with wings is a fair monster; `creature.look.build` lists a creature's measures).
  The gaits are worked out from the creature itself: which legs it has and how long they are, its wings, its
  tail, its size. So a seed that changes the animal changes its stride to match, feet don't slide, a mouse
  scurries where a horse strides, and a small bird beats its wings ten times a second where a dragon beats
  them once. `creature.speeds` says where each gait sits (`{ walk, trot, run, fly, swim }`, metres a second).
  For a pose by name use the rig yourself: `creature.rig.play('eat'); creature.rig.update(dt, { speed })`.
  Every kind has `idle`, `walk`, `run`, `attack`, `hurt` and `dead`; four legs add `trot`, `eat`, `sit`, `jump`
  (a rabbit hops); birds `fly`, `glide`, `hover`, `eat`, `sit`, `jump`; fish `swim`; flying insects `fly` and
  `hover`; a dragon and an imp `fly`, `glide`, `hover`; an ogre and an imp stand on a person's joints, so they
  have every `gs.poses` pose; a serpent `rear` and `swim`. `creature.bones` holds the joints (`bones.head`,
  `bones.jaw`, `bones.tail1`, `bones.wingL`...) for a rider, a hat or a hit box.
  `creature.twin()` is another of the very same creature for almost nothing (a herd, a flock, a swarm), and
  creatures of one shape share it whatever their colours and size. An insect is tiny at its real size: give
  it a `size` your camera can see.
  **A shape this phone hasn't made yet takes a few tenths of a second to sculpt, in the background**, as
  people do: the app shows "Loading…" and makes the game again, and the shape is saved on the phone. So make
  creatures in `make()` or `reset()`, and several kinds together and first (`creature.all([...])`, or
  `creature.need([...])` before anything costly is built). `node scripts/creatures.cjs sheet.png` draws every
  animal standing, walking and running (add `like=dog,owl seed=3 cols=fly@.25:three`), to look them over.
- **`fur(mesh, o)`**: fur or hair in layers, with no texture files: copies of the surface pushed out along
  its normals, each cut by a picture of strands made in code. Creatures with a coat of fur wear it by
  themselves (`creature.fur`; `fur: false` to leave it off), and people's hair, moustaches and beards are
  strands (`human({ beard: 1 })`, `person.hair`; `strands: false` for the sculpted hair alone). Close up
  only: it thins out with distance by itself, and the slowest phones draw none. `coat.length = 1.5` stands
  fur on end; `fur(mesh, { length, kind: 'fur' | 'hair', where, lean })` puts a coat on any mesh. Guide:
  [Fur and hair](maker-kit.md#fur-and-hair).
- **`vehicle(kind, o)`**: a car, a lorry, a tank, a train, a boat or a plane made in code: a shell skinned
  over cross-sections from a few measures, in paint, glass, chrome and rubber, aged with `wear()`, with
  the parts that turn on pivots of their own. 31 to start from (`vehicle.kinds`): cars `saloon`, `hatch`,
  `estate`, `sports`, `van`, `pickup`, `jeep`; trucks `flat`, `canvas`, `box`, `tanker`; tanks `medium`,
  `light`, `heavy`; trains `steam`, `diesel` and the wagons `van`, `open`, `flat`, `tanker`, `guard`, `coach`; boats
  `rowboat`, `motor`, `fishing`, `patrol`; planes `prop`, `biplane`, `twin`, `jet`.
  ```js
  const jeep = gs.models.vehicle('car', { style: 'jeep', seed: 4 }); view.add(jeep);   // in make(); its nose points along -z
  jeep.move(dt, speed, { steer });   // each frame: wheels roll and steer, the body rocks on its springs
  const train = gs.models.vehicle('train', { style: 'steam', cars: ['van', { style: 'open', load: 'coal' }, 'guard'] });   // a wagon: a name, or { style, load, colour }
  train.along(rails, metres).roll(metres);   // each car between its own wheels, round the curve
  ```
  A train that only runs straight can be made with `fuse: true`: its cars' shells joined into one mesh a
  kind of surface and its wheels drawn as copies, a third of the draws for the same picture (`along()`
  then throws). `polished: false` is a working engine with nothing kept bright.
  Options, the parts and points of each kind, real springs (`car.chassis()` with `World3D.vehicle`), boats
  and planes on `gs.craft`, and what each costs: [Vehicles made in code](maker-kit.md#vehicles-made-in-code).
  `node scripts/vehicles.cjs sheet.png` draws them all from five sides, to look them over.
