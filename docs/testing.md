# Testing Game Scroll quickly

How to check a change without waiting longer than you need to. Written for people and AI tools
(Claude Code, Codex, Gemini CLI...) working in this repo. The times below were measured on a
4-CPU cloud machine (2026-11-09), about what the GitHub PR check gets.

## First

- `npm ci` before anything else in a fresh checkout, and again after pulling a change to
  `package-lock.json`. A stale `node_modules` (say three 0.186 where the lock says 0.187) gives
  errors that look like real bugs.
- Most browser checks play the **built** app (`dist/`). Run `npm run build:bundled` (about 2 s) after
  every change and before them, or you test the old code. `budget.cjs`, `look-compare.cjs` and
  `perf-bench.cjs --profile` run the dev server instead and need no build.

## Which check for which change

| You changed | Run | Time |
| --- | --- | --- |
| One game file | `node scripts/game-lint.mjs <id>` (it also gives kit hints: advice, never a failure), `node scripts/game-types.mjs <id>`, `npm run games`, then `node scripts/smoke.cjs <id>` and `node scripts/stream-smoke.mjs <id>` | under 20 s |
| How games use `gs` (a kit, method, option or definition field that doesn't exist) | `npm run game-types` (every game against `src/gamescroll.d.ts`; `-- --self-test` checks the check, `-- --all` also lists what it leaves alone) | about a second |
| Does a game play differently from the others? | `node scripts/unique.mjs <id>` (its three nearest games and what they share; no ids: the closest pairs of all; `--since origin/main...HEAD`: the games a branch adds or changes; `--self-test`). A near-copy (new names on the same code) fails; a near-twin (plays and reads like another) is a warning | 4 s |
| A 3D game (Console, Next Gen, AR, Board) | add `node scripts/sweep.cjs <id>` | 20 s to 2 min |
| A game's speed | `node scripts/budget.cjs <id>` | about 25 s |
| Can the goal be reached? | `node scripts/playtest.cjs <id> [--budget 20] [--strict]`: a bot plays faster than real time and tries to win (see below) | about 20 s a game |
| Layout, cards, folding | `node scripts/fold.cjs [id ...]` | about 12 s |
| Feed swiping | `node scripts/feed-jank.cjs [swipes] [--filter nextgen]` (compare before and after, not with a phone) | about a minute |
| Shared game links, or how the feed starts (`src/share.js`, `openShared` and `playNow` in `src/main.js`, the catalogue in `src/remote.js`) | `node scripts/share-link.mjs [id]`: opens the streamed web app from a shared link on quick, slow and stale connections (builds what it needs) | about 30 s |
| The Mac and Windows app (`desktop/`, `src/desktop.js`, the computer branches in `src/kit/speed.js` and `src/kit/hd3d.js`) | `npm ci --prefix desktop`, then `npm run desktop:test` (Linux: `xvfb-run -a`): the app's address, what the page can reach, the computer's speed class, a 2D and a Next Gen game, `gamescroll://` links ([docs/desktop.md](desktop.md)) | about 40 s |
| A kit in `src/kit/` | `npm run kit-test`, then smoke the games that use it (`node scripts/pick-games.mjs` names the best few per style) | 3 s + games |
| Physics through the kits (`src/kit/physics.js`, `physics3d.js`, and the `world` of `vehicles`, `craft`, `gadgets`, `combat`, `destruction`, `props`, `city`, `voxels`, `cloth`, `soft`, `flow`, `fluid`, `gas`) | `npm run kit-test` (riders, karts and craft that are solid, a floor that is a true plane, grapples, shots, lobs and barrels, shatter and slice, props, voxels, cloth, dents, rivers; 2D walkers, tile maps, cars, jelly and water), then `node scripts/rapier.cjs film.png [acts=kart,props,shatter,car,cloth,voxels,blast,city] [cols=6] [cell=300x220] [--webgpu]`: a row a kit doing something in one World3D, a picture every so often along it, and what happened in numbers (the same on both backends: the physics doesn't depend on the drawing). The cloth act is drawn every frame, as on WebGPU the cloth takes its steps when the view draws | 3 s for the tests, then about 2 min a film |
| How a 3D round starts: the loading screen after Play (`getReady` in `src/main.js`, `src/kit/getready.js`, what the 3D kit says it is still waiting for) | `node scripts/app-test.cjs ready` after a build, then `node scripts/round-start.cjs [id ...] [--webgpu]` (see "Play on a 3D game" below) | 1 min, then about 10 s a game |
| What happens when the graphics chip is lost (`lostGPU` in `src/kit/gpu.js`, `mendStep` in `src/main.js`, a view's `newRenderer()`) | `node scripts/gpu-loss.cjs [id ...] [--how cdp\|destroy] [--times n] [--when round\|gate\|feed] [--shots dir]` after a build: crashes the browser's graphics process in a round and checks it pauses, comes back on WebGPU, draws as before and is reported (see docs/webgpu-move.md, When the device is lost) | about 40 s a game |
| What the app does around a game (screen kept on, finer touch, even pixels and the LCD look, the one-line soundtrack, the phone-only save), the font library, and the 2D looks (materials, slabs, water, stickers, sketch pen, ink, icons) | `node scripts/app-test.cjs [awake\|touch\|pixels\|music\|saves\|fonts\|looks\|tour\|loading\|ready]` after a build (`npm run app-test` does both; `SHOTS=<folder>` saves a picture of every font and look) | about a minute |
| Sound (`src/sfx.js`, `src/kit/sound.js`, `acoustics.js`, `instruments.js`, `foley.js`) | `npm run sound-test [sounds\|band\|clock\|level\|cap\|foley]`: renders the sound off screen and measures it (every ready-made sound is heard and none is too loud, the limiter holds, instrument sets are as loud as each other, the music clock keeps the beat through a frozen frame, a sound behind a wall comes out quieter and duller and a room rings by itself, only 32 sounds play at once with the quietest giving way, and the world's own sounds: a knock and a step on every material, a box dropped in a physics world, what is underfoot, a car going up through the gears) | about 110 s |
| A starter template (`scripts/templates/`) | `npm run new zz-try --style <style>`, then lint, types and smoke it like any game, and delete it | under 30 s |
| The 3D look (hd3d, toon3d, post effects, a three.js update) | `node scripts/look-compare.cjs save base` **before** the change, `check base` after; add `--webgpu` to check the WebGPU path | about 16 s each |
| The AR kit (`ar3d.js`, `ar-floor.js`, `ar-room.js`, `native-ar.js`) or a native AR plugin | `npm run kit-test` (rooms played through the floor search, depth pictures and room light through the room maths), then `node scripts/ar-floor.cjs [word] [--shots dir] [--webgpu]`: Bin Flick and AR Lab against a pretend native AR phone ([ar-3d.md](ar-3d.md), Testing). Then AR Lab on a real phone | about 4 min |
| Creatures (`gs.models.creature`: `src/kit/models/creature*.js`) | `npm run kit-test` and `npm run kit-browser` (every animal's bones, poses, speeds and sculpt), then `node scripts/creatures.cjs sheet.png [like=dog,cat] [seed=3] [cols=walk@.25:side,fly:three] [lod=1] [bones] [--webgpu]`: a sheet with one row an animal and one column a pose, to look at; `PICK=creatures node scripts/look-compare.cjs` for the look | about 20 s, then 2 s an animal |
| People who react (`src/kit/reactions.js`, `src/kit/ragdoll.js`, `World3D.ragdoll`) | `npm run kit-test` (the ragdoll's limits and muscles; a nudge, a shove, falls from each side, limp, a trip, a blast, bracing, a wall, a ledge, acted falls, a mover), then `node scripts/reactions.cjs film.png [who=human\|person\|figure] [acts=shove,fallBack,runTrip] [view=side\|three\|front\|back] [cols=10] [phys=0] [--webgpu]`: a row for each thing that happens to a person, a picture every so often along it, to look at, and what happened when (`ALLWARN=1` with `dbg=6 joints=armL,foreL` prints joint angles) | 2 s, then about 15 s an act |
| Buildings that come apart (`src/kit/structure.js`, `buildingPieces` in `src/kit/models/buildings.js`) | `npm run kit-test` (the cut into pieces for every style, hits and blasts, what holds what, a big bomb, physics, reset, your own boxes), then `node scripts/structure.cjs film.png [style=brick\|plaster\|concrete\|stone\|timber] [acts=shell,corner,upstairs,roof,shots,ball,big,level] [size=8x6x2] [view=three\|front\|side\|back\|top\|in] [cols=8] [phys=0] [dust=0] [--webgpu]`: a row for each thing done to a building, a picture every so often along it, to look at, and how many pieces broke, fell and landed, what still stands and what a frame cost | 3 s, then about 12 s an act |
| Water you can disturb (`src/kit/water.js`: `gs.outdoors.Water`) | `npm run kit-test` (the same waves as before, calm water doing no work, rings, the square that follows the centre, splashes, watched things and wakes, shallows and shore foam, under the surface, rain, your own material), then `node scripts/water.cjs film.png [acts=pebble,rock,drop,boat,swim,rain,shore,wade,under] [cols=8] [cell=300x210] [cells=128] [reach=24] [waves=.6] [view=top\|near] [from= to=] [--webgpu]`: a film strip, a row for each thing that happens to the water, and what a frame of `water.update()` cost. Look at it on WebGL and with `--webgpu` |
| Weather that changes the world (`src/kit/cover.js`, `Weather` in `src/kit/sky.js`, `AIR_WET` in `src/kit/hd3d.js`, `gpuWet` in `src/kit/hd3d-gpu.js`) | `npm run kit-test` (the map of what the sky can see: filling, following, finding changes, meshes; rain soaking in, pooling and drying; snow settling and melting; roofs keeping it off; no level as before), then `node scripts/weather.cjs film.png [views=yard,porch,in,roof,top,pond] [cols=8] [cell=300x210] [story=rain,dry,snow,melt] [secs=8] [phys] [cover=0] [hold=snow:.9] [--webgpu]`: one story of weather along the film, a row a camera, over a house with a porch and an open door, a lean-to, a yard, trees and a pond; it prints what `weather.update()` cost, how long the map took and the most pictures any one material reads at once (phones allow 16). Film it on WebGL and with `--webgpu` and compare: puddles and snow lie in the same places on both. `npm run kit-browser` has three checks on a floor half under a roof. |
| Ground that takes marks (`src/kit/marks.js`: `gs.outdoors.Marks`; the meadow's `LK_PART` in `src/kit/looks.js` and `gpuLooks.meadow` in `src/kit/hd3d-gpu.js`) | `npm run kit-test` (a print's dent, rim and pictures; sheets that meet; tracks that join up; what is remembered; snow, mud and sand by the weather; filling, washing and blowing out; watched feet, paws, wheels and belts; the land's own triangles; grass that parts and mends), then `node scripts/marks.cjs film.png [views=mud,sand,grass,lawn,top,low,close,wide] [cols=6] [cell=420x300] [story=snow,fresh,rain,wet,dry] [secs=8] [hold=snow:.9] [who=people,dog,jeep,tank] [off] [cellsize=.025] [reach=10] [prof] [--webgpu]`: one story of weather along the film, a row a camera, over a field of sand, grass and bare earth with two people, a dog and a jeep going round it; it prints what `marks.update()` cost (`prof`: each part of it), how many marks are kept and how many tiles are drawn. `off` is the same film with no Marks, to compare. Film it on WebGL and with `--webgpu` | 55 s for the tests, then about 40 s a film |
| Smoke and fire that flow (`src/kit/gas.js`, `src/kit/gas-gpu.js`: `gs.gas`; `gasStage` in `src/kit/hd3d-gpu-fx.js`) | `npm run kit-test` (smoke that climbs and goes round a ball, a closed room, solid things, wind, a fan, fire, a jet, an explosion, dust, resizing, the answers copied back, seeds), then `node scripts/gas.cjs film.png [acts=camp,room,blast,wind,ball,torch,dust] [cols=6] [cell=300x380] [cells=20000] [klass=top\|mid\|low] [--webgpu]`: a row for each thing smoke and fire do, a picture every so often along it, to judge by eye how it rises, curls, spreads and is lit; it prints what the gas ran on, how many cells it had and what `gas.update()` cost. Film it without `--webgpu` (the JavaScript version, soft puffs) and with (the lit volume: on a build machine's software chip, so keep `cells` small), one film at a time, and don't edit `src/` while one runs (the page reloads). Then `PICK=gpu-gas node scripts/look-compare.cjs save <dir> --webgpu` (the two versions cell for cell) | 1 min 10 s for the tests, then about 20 s an act |
| A city (`src/kit/city.js`: `gs.city`; rooms behind the windows `city-rooms.js` and its twin `city-gpu.js`, real and parked cars `city-cars.js`, street dressing `city-dress.js`) | `npm run kit-test` (the plan, routes, rays and collisions), then `node scripts/city.cjs sheet.png [views=street,close,shop,corner,cars,folk,high,far,up,parked,roofs] [times=17.2,21.5] [style=oldtown] [old] [off=rooms,dress,fleet,crowd,parked] [--webgpu]`: the city drawn from each camera at each time of day (`cars` and `folk` look at the nearest car and person once the frames have run, `up` up a front, `parked` along a row of parked cars), with the draws, triangles, cars and people of each; `old` draws it as it was (windows painted on, boxes for cars and people, no dressing); look at it on both backends, then play `parcel-dash` (smoke, budget) | about 1.5 min a sheet |
| Cliffs, caves and overhangs (`src/kit/land-rock.js`, `Land.rocks()` and its answers in `src/kit/outdoors.js`, the `rock` job in `src/kit/job-worker.js`) | `npm run kit-test` (the rock as numbers: pieces that meet, hidden rock left out, overhangs, the same seed the same rock; a cave's floor and roof, an arch, a hollow, rays, a walk in at a cave's mouth; then on a Land: the squares a cave takes, marks, physics, `flatten()`, `rocks(false)`), then `node scripts/rocks.cjs out.png [views=wide,cliff,mouth,inside,arch,under,edge,top] [cols=4] [cell=480x340] [off] [rockcell=.4] [seed=3] [snow] [time=15.5] [nomeadow] [flat] [look] [--webgpu]`: a picture from each camera of a valley with a cliff, a cave through a spur, an arch and a shelf of rock, people standing about for scale; it prints how many triangles the rock is, in how many pieces, and how long it took. `off` is the land as a height map alone, `flat` the bare shapes with no beds or joints, `snow` with snow lying (on the ledges, not in the cave), `look` with `looks.rock` over it. Take it on WebGL and with `--webgpu` and compare. A change to how long it takes: `node scripts/load-time.cjs <a game that uses it> --passes` says whether the numbers still go to a worker | 55 s for the tests, then about 30 s a sheet |
| Fur and hair (`gs.models.fur`: `src/kit/models/fur.js`, and its use in `creature.js` and `human.js`) | `npm run kit-test` (the strand pictures, the shell: lengths, thin things, edges, a crown; the layers; thinning with distance; a cat, a horse's mane, a pig without) and `npm run kit-browser` (a furry cat and a bearded person drawn in a Next Gen view, a coat put away far off), then `node scripts/creatures.cjs sheet.png like=dog,cat,person:long:f,person:short:beard:grey cols=idle:face,idle:nape cell=480x480 [layers=10] [fur=0] [fur=auto] [time] [--webgpu]` to look at it: a row can be a person (`person:` then a hair style and any of `f`, `beard`, `moustache`, `hat`, `grey`, `fair`, `red`, `black`; a person row asks for strands on the hair of the head too, `combed` leaves it the combed shape people have unasked), `time` prints how long a frame takes | 2 s for the tests' part, then about 3 s a row (10 s with `--webgpu`) |
| People (`gs.models.human`: `src/kit/models/human*.js`, `field.js`; skin's light in `sss()` of `src/kit/hd3d-gpu.js`) | `npm run kit-test` (the skeleton, the sculpted pieces, the live face, strides, the real look: a face from a seed, its folds and its broader jaw, and for skin and eyes: how thin a sheet, a rim and a block measure, only the ears of a head thin, an eye's rings and cornea) and `npm run kit-browser` (no close-up triangle with its grain smeared, thin flesh at the ears only, the skin and eye materials, the face's paint and the hair's combed strands made in code, clothes' seams and stitching: some of every cloth near a line, no close-up triangle counting more stitches than it is long), then `PICK=humans node scripts/look-compare.cjs check base` on WebGL and with `--webgpu`, and smoke a game with people in it (`long-shadow`). Look at a face close up on both backends before believing it: ears against the sun, the eye's highlight; for faces, `node scripts/face-lab.cjs sheet.png [look=real] [who=0,5] [cols=sun:face,lamp:face,indoor:front] [wrap=4] [--webgpu]` (twelve people of different ages, builds and skin, a column for each light and view; `noao`, `noshadow`, `nocontact` take the person out of the ambient occlusion, its own shadow or the contact shadows, to find where a dark patch comes from; `strands` puts strands on the hair of the head too; `ref` adds a row with a real head scan under the same lights, to judge faces against a real one: fetch `LeePerrySmith.glb` and its pictures from three.js's examples into `scripts/face-lab/ref/`, never committed); `node scripts/head-fit.mjs sheet.png [age=35] [fem] [part=nose|mouth|jaw|eyes|brow] [fit=off]` lays the same scan over our real-look head by its eyes, ears and skull and draws both in plaster, their outlines, slices and differences in depth part by part (red: ours stands out, blue: sunk in), and `solve=1` works the fit out again and writes it into `src/kit/models/human-fit.js` (after a change to the head's shapes; `colour=out.json` writes the scan's points with their colour places for measuring skin colour); the fits of each sex and heritage come the same way from GNM Head (Google's head model learned from scans, Apache 2.0): fetch `gnm_head.npz` and `identity_decoder_model.h5` into `scripts/face-lab/ref/gnm/` (links at the top of the script), run `python3 scripts/face-lab/gnm-heads.py` (numpy and h5py) for its heads of men and women of four broad groups, then for each `node scripts/head-fit.mjs sheet.png scan=gnm/f-black-0 fem solve=1 kin=f:african` (`gnm/m-white-0` with `kin=m:european`, `asian` with `east-asian`, `middle-eastern` the same; `scan=` alone draws the sheet against that head, `heritage=african` with our head fitted to it), again after a change to the head's shapes; in the face lab `kin=off` fits every head to the one scan, as before heritage; GNM faces (every real face; `gnm: false` the sculpted one): `npm run kit-test` (a face from a seed, sex and class; grown old; no bubble behind the lips, no pocket by the neck, lips that part along their line), `python3 scripts/face-lab/gnm-pack.py` (after `gnm-heads.py`'s fetch) packs GNM's mean head, its 32 main ways to vary and its marks into `src/kit/models/human-gnm-data.js` and `human-gnm-marks.js`, and in the face lab every real-look person has a GNM face (`gnmface=off`: the older sculpted ones, for comparing) (`gnm=f-white-0,m-black-1` adds rows of GNM Head's own heads, from `gnm-heads.py`'s files), views `lips`, `lipside` and `eye` look at the mouth from the front and the side and at an eye, and `zoom=2` / `dy=.01` come closer and aim higher; `node scripts/skin-fit.mjs [show=out.png] [write]` measures the scan's colour picture part by part (how much redder, bluer and more speckled each part of the face is than its plain skin, the photo's own light left out) and `write` puts it into `src/kit/models/human-fit.js` (needs python3 with PIL); in the face lab, views `brow`, `eyesfront` and `mouthfront` are closer still, `hairline` looks at the hairline and the hair over the brow and `back` at the back of the head (a real face's hair strips: no hard edge round the face or at the nape, no strips standing out as stripes), and `taa` draws with the smoothing over frames the games have (fine hairs as they look in play); and clothes from half a metre (seams, stitching along straps and pockets, no stitching where none was asked for) | 1 min + pictures |
| Vehicles made in code (`gs.models.vehicle`: `src/kit/models/vehicles.js`, `vehicle-*.js`) | `npm run kit-test` (the shape tools: skins closed and facing out, rounded corners, slots, belts, wheels; every plan's size, wheels and points; rolling, steering, a tank's tracks and turret, a train round a curve, a goods train's wagons, loads and colours, a fused train (`fuse: true`) and a working engine (`polished: false`), propellers; a car on `gs.physics3d` springs) and `npm run kit-browser` (all 31 with their recipe materials, a goods train with its boards and riveted plate, a car on springs, one drawn in a Next Gen view, the fused goods train drawing the same picture as the loose one), then `node scripts/vehicles.cjs sheet.png [show=car:saloon,car:jeep,tank,train:steam-van_6b3024-open_coal-guard] [views=front,side,back,top,move] [cell=360x230] [finish=worn] [wear=1] [lit] [seed=3] [time=15] [axles=3] [offroad] [colour=#a22] [detail=.5] [deflectors] [load=coal] [fuse] [dull] [zoom=2] [at=-3] [--webgpu]`: a row a vehicle, a column a camera (the last one caught moving: wheels steered, turret round, propellers a blur, a train on a curve), to look at (a train is its engine and wagons joined by `-`, a wagon's own colour and load after `_`; `zoom` and `at` come closer to a point along it; `fuse` is `fuse: true` and `dull` is `polished: false`); it prints each one's triangles, draws, size and how long it took to make. Look at it on WebGL and with `--webgpu` | about 20 s, then 1 s a vehicle (2 s with `--webgpu`) |
| Next Gen / AR / Board / Console on WebGPU | `node scripts/gpu-games.cjs [id ...]` | about 25 s a game (Console: 12 s) |
| Still scenery in render bundles (`src/kit/still.js`, `pushCells` in `scene-list.js`, `stillFrame` in hd3d.js) | `npm run kit-test` (joining, leaving with a reason, coming back, areas culled whole), then `node scripts/detail-test.cjs --page bundles --webgpu [--shots dir]`: a yard moved, hidden, recoloured, given new materials and textures, cut short, emptied, filled, lit and moved far from the centre, then the town, village and street, each the same picture with bundles as with every thing drawn by itself (`--q "scenes="` leaves the engine scenes out) | about 4 min |
| Picture memory on WebGPU (depth-only shadow maps: `SHADOW_DEPTH` in hd3d-gpu.js, `HD.shadowColour`; effect steps sharing pictures: `sharePictures`, `HD.shareTargets`) | `node scripts/detail-test.cjs --page memory --webgpu [--shots dir]` (`--q "scene=town&fx=dof,mb,vol&w=1080&h=2340"`): every picture the view holds by what it is for and when in the frame it is used, which could share, and the view as before its savings against now: less memory and the same picture (`swap`, `was=`, `now=` for one switch at a time) | about 2 min |
| Cluster detail (`src/kit/detail*.js`, `autoDetail` in hd3d.js) | `node scripts/detail-test.cjs` and again with `--webgpu` (`--shots dir` saves the pictures), then `--page everything` both ways: copies, two materials, a cut-out, a moving rock, a morphing rock, a skinned tentacle and a person mid-stride, whole against cluster detail near and far, following moves and poses (`--bench` for triangles and time). `node scripts/detail-survey.cjs [id ...]` lists each game's triangles and why a big mesh is not taken | about 40 s each |
| Real surface detail (`src/kit/relief*.js`, `gs.models.relief`) | `npm run kit-test` (the builder), then `node scripts/detail-test.cjs --page relief` and again with `--webgpu`: a roof, a brick house and a trunk flat against relief, near and far | about a minute each |
| Hiding what is behind other things (`src/kit/occlusion.js`, `src/kit/occlude.js`, `occludeStep` in hd3d.js, the depth meters) | `npm run kit-test` (the depth picture carried over camera moves, 60 random places: nothing seen is ever hidden), then `node scripts/detail-test.cjs --page occlude` and again with `--webgpu`: a street walked, driven and flown over, every frame drawn twice (hidden things left out, then all of it) and compared, with a gate that opens, a balloon rising from behind a bridge, glass, a fence, a swaying tree, cluster detail and copies. `--q tier=1` draws with one sample a pixel, where the two pictures must match to the pixel (with several, the software renderer lets a far triangle's sample through a wall in the whole picture now and then: up to 2 pixels a frame are let by). `--bench` gives triangles, draws and code time with it off and on; `--q trace` a line a frame, `--q "trace&dump=5,20"` those frames' depth pictures as text | about 1.5 min each |
| Shadows (`shadowLights`, `splitShadowsGL`, `sun()` in hd3d.js, `shadowOps` in hd3d-gpu.js, `src/kit/shadow-tiles.js`) | `npm run kit-test` (the tiles' bookkeeping against a model), then `node scripts/detail-test.cjs --page shadows` and again with `--webgpu`: a village walked with the sun's map in tiles and with every shadow whole, every frame the same picture to a pixel or two, on WebGL the shadow maps themselves read back and compared texel by texel (only stray texels on edges may differ, never four together: that would be a tile not drawn again), and what was drawn. `--bench` for the numbers. Its header lists `?verify`, `?verify=map`, `?verify=top` and `?control` for finding a frame that went wrong. Then `node scripts/shadow-check.cjs <id> [--gpu]` on a few games, and `node scripts/app-test.cjs scenes` (the town's third run) |
| Night lights (`src/kit/lamps.js`, `src/kit/lamps-gpu.js`: `lampLights`, `placeLamps`, `neon`, `sign` in hd3d.js) | `npm run kit-test` (the light shapes, a WebGL pool that never shrinks and makes spot lights only when one is wanted, tube and sign lights, shadow slots for the nearest lamps, a few drawn a frame, none drawn again while nothing moved), then `node scripts/lights.cjs sheet.png [acts=street,car,room,neon,shapes] [cell=360x480] [tier=2] [frames=6] [move] [solo=sign\|tubes] [--webgpu]`: a picture a scene (lamps on posts casting people's shadows, a car's dipped headlights on a wall, light through a window and a blind, neon and a sign over a wet street, every light shape side by side), with what the shadows cost. Look at it on WebGL and with `--webgpu`: on WebGL only the few lamps with a spot light show a shape. Then `node scripts/app-test.cjs scenes` (the night street) | 1 min 10 s for the tests, then about 20 s a scene (a minute with `--webgpu`) |
| Finer sun shadows (`src/kit/sunmask.js`, `src/kit/sunmask-gpu.js`: `v.contactShadows`, `v.farShadows`, crowd capsules; WebGPU) | `npm run kit-test` (people and animals as capsules, their shadows behind them and none beside or on themselves, the grid of squares they fall across, the map of heights' tiles), then `node scripts/finer.cjs sheet.png [acts=contact,face,far,crowd] [cell=360x300] [tier=3] [frames=8] [people=120] --webgpu`: each scene with the sun's shadow maps alone and with the sun mask (cups and fingers on a table, a face close up, towers far past the sun map's box, a crowd from above), with the frame time to the chip's last pixel, the mask's CPU time and what the sun map drew. `node scripts/finer.cjs sheet.png scene=shade [at=3,8,13,18] --webgpu` draws the tour's shade scene along its walk. Then `node scripts/app-test.cjs scenes` | 1 min 10 s for the tests, then about a minute a sheet |
| Crowds (`src/kit/crowd.js`, `crowd-gpu.js`, `gs.props.Crowd`) | `npm run kit-test` (the rows against the figures' own skeletons, who is sent and how finely, strides, blends, rays), then `node scripts/detail-test.cjs --page crowd` and again with `--webgpu`: people and a dog posed by their own skeletons against the same as members of a crowd at each level, a field of 300, and on WebGPU how each member moved since the last frame; `--bench` for draws and time against skeletons | about 1 min each |
| Detail levels that fade (`src/kit/lod-fade.js`, `lod-fade-gpu.js`, `fadeOn` in hd3d.js, the fading lists in `gpuProps` and `props-gpu.js`, the `lod` setters of `human.js` and `creature.js`) | `npm run kit-test` (the shares, shadows, turning round, waiting for shaders, copies into the fading lists), then `node scripts/detail-test.cjs --page fades` and again with `--webgpu`: a person and a dog half way through a change (one level or the other at each pixel, no holes, about half of each), its end against a plain switch, turned round, and things that switch at once; on WebGPU copies whose level's distance is pulled in, picked on the CPU and on the chip. `--shots dir` saves a quarter, half and three quarters of the way | a second, then about 3 min each |
| People posed once a frame on the chip (`src/kit/skin-gpu.js`, `HD.gpuSkin`, the motion picture's matrices kept by the frame) | `node scripts/detail-test.cjs --page skin --webgpu`: a line of people (a real-look one with wet eyes and hair strips) and a dog at each level of detail and close up, posed in each pass against posed once (the same picture, and drawn by shaders that read the pool), twenty frames walking, motion of a walker and a post of six materials moved 30 cm, nobody posed out of every view, off and on, taken out and put back; without `--webgpu` the pool is never made. `--bench` (`--q "n=300"`) for code, chip and draws both ways; the engine test square (frame lab) has the same as a run of its own | about 2 min on WebGPU |
| Detail levels for copies (`autoCopies` in hd3d.js, `buildLevels`, `gpuProps` in hd3d-gpu.js, `src/kit/props.js`) | `npm run kit-test` (the levels, `props.move`, which copies are sent), then `node scripts/detail-test.cjs --page copies` and again with `--webgpu`: a field of rocks and posts whole against levels from three cameras, a zoom, a hidden and a moved copy, and on WebGPU that only changed copies go to the chip. `--bench --q "forest=20000"` (add `&cpucull` on WebGPU for the path frame generation uses) gives triangles, draws, list time and KB sent a frame | about 40 s each |
| Smaller meshes (`src/kit/slim.js`, `slim-core.js`, and where they are used: people, creatures, fur, crowds, fused trains, buildings, city blocks, real surface detail) | `npm run kit-test` (the number work: normals, bone weights, grid places, what is left alone), then `node scripts/detail-test.cjs --page slim` and again with `--webgpu`: two people, a furred dog, a fused train, a brick house with real surface detail and a crowd, made with plain floats and then kept small: six pictures compared, the bytes counted in memory and on the chip, the kinds of list, rays and sizes checked (`--q both=plain` or `both=small` draws the same thing twice, to see what differs between two runs anyway). `node scripts/mesh-memory.cjs [id ...] [--webgpu] --json before.json` before a change and `--vs before.json` after gives a game's mesh memory by list, by kind and by mesh | about 2 min each |
| Ray traced reflections (`src/kit/hd3d-gpu-trace.js`, `trace-scene.js`, `trace-build.js`, `traceLights` in hd3d.js) | `npm run kit-test` (blocks, looks, what goes in, and the traced copy's lists walked the way the shader walks them, against three's own ray caster, through moves, hides, additions and bigger lists), then `node scripts/detail-test.cjs --page traced --webgpu [--shots dir]`: a yard whose floor must show a bar above the screen and whose chrome ball must show a wall behind the camera, a box moved, copies found on the screen, a glow changed and a thing added, against screen-space reflections, which can show none of it. `--bench` walks the engine test scenes' hall three ways | a second, then about 2 min |
| The world's centre moving with the camera (`src/kit/origin.js`, `originOn`/`originOff` in hd3d.js, `ORIGIN`/`gsOrigin` in the shaders, `World3D.centre()`) | `npm run kit-test` (the centre's steps; a ball and a walker 20 km out run exactly as at the centre once the world's centre is there; a shift leaves sleeping stacks, lifts, hinges and rays be; it follows the view), then `node scripts/detail-test.cjs --page origin` and again with `--webgpu`: each engine test scene drawn about the world's own centre and about a centre 768, -512 m off (`--q at=x,z`), which must be the same picture (`--q modes=all` for every mode, `scenes=valley,field`, `--shots dir` for the worst pair and their difference) | a second, then about 8 min each |
| Lots of particles (`gs.hd.GPUParticles` in `src/kit/hd3d.js`, its WebGPU step `src/kit/particles-gpu.js`: bursts, pulls, flows) | `node scripts/detail-test.cjs --page particles` and again with `--webgpu` (`--shots dir` saves a portal and a flow to look at): a burst left alone, pulled in, pushed out, out of a pull's reach, taken, swirled, carried by a flow inside its box and not outside it, the flow sampled again; the first burst is asked for before the view has drawn (it must still start); on WebGPU, pulls and a flow added mid-run build no shader, and the positions are read back from the chip | about 30 s each |
| Decals in the lamps' grid (`HDView.decal` in `src/kit/hd3d.js`, `src/kit/decals-gpu.js`, the lamps' loop in `src/kit/lamps-gpu.js`, `HD.gridDecals`) | `node scripts/detail-test.cjs --page decals --webgpu [--shots dir]`: marks on a floor, a wall and a thin panel as grid decals against the same marks as meshes (they must look alike), switched to meshes and back, the panel's back and a thing with `material.decals = false` left alone, a lamp's light between 60 marks as it was, no more draws with 60 marks and no shader when marks come and go, a mark's life, past 16 pictures the rest as meshes; then without `--webgpu` (every decal a mesh, as before) and `node scripts/look-compare.cjs check <dir> --webgpu` against main | about 2 min, then 15 min |
| Signs that light with their own picture (`gs.hd.sign(..., { picture: true })` and `g.paint()` in `src/kit/hd3d.js`, `picture` on `placeLamps` spots in `src/kit/lamps.js`, the rect lamps' picture in `src/kit/lamps-gpu.js`, the shared atlas in `src/kit/decals-gpu.js`) | `node scripts/detail-test.cjs --page signs --webgpu [--shots dir]`: a screen half red and half blue in a dark room over a shiny floor: each half lights the walls and floor on its own side, the shiny floor mirrors the two halves and a rough one blurs them together, a white picture lights as the plain sign did, painted again (green) its light follows with no shader made; then without `--webgpu` (the light takes the picture's average colour) | about a minute each |
| Heavy effects spread over frames (`src/kit/hd3d-gpu-spread.js`, the `spr()` parts of `GpuChain.build` in hd3d-gpu.js) | `node scripts/detail-test.cjs --page spread --webgpu [--shots dir]`: a room with ambient occlusion, volumetric light and bounce light drawn with every sample and spread over frames: held still (and the picture must stop changing), while the camera moves and a crate slides, with the camera still while the crate slides back, the frame after a cut (which must keep nothing from before it), and the beams switched from the sun to a lamp (nothing of the sun's may linger); `--q only=ao` (or `vol`, `bounce`) spreads one alone. Then `node scripts/look-compare.cjs check <main's save> --webgpu`, and on a phone the frame lab's Spread button | about 45 s |
| Ambient occlusion on the light that bounces only (`aoInShading` and `GpuChain.aoScene` in `src/kit/hd3d-gpu.js`, `HD.aoBack`, `HD.aoDirect`) | `node scripts/detail-test.cjs --page aoback --webgpu [--shots dir]`: a sunlit and a shaded corner with the occlusion on the whole picture against in the shading: sunlit places it darkened are lighter and none darker, shaded corners keep it, a still picture stops changing, the frame after a cut takes none and the next ones have it, a moving camera reads it in the right places, and the scene's materials are not built again when the chain is (a quality step); then `node scripts/shader-hold.cjs --webgpu` and `node scripts/look-compare.cjs check <dir> --webgpu` against main | about a minute, then a minute and 15 min |
| The physical sky and marched clouds on WebGPU (`src/kit/atmosphere.js`, `src/kit/hd3d-gpu-sky.js`, the sky parts of `skyDome`, `airNodes` and `gpuSunLight` in hd3d-gpu.js) | `node scripts/detail-test.cjs --page sky --webgpu [--shots dir] [--q w=360&h=480]`: a field under a physical sky with clouds at noon, late afternoon and sunset, drawn as before (`HD.atmosphere` and `HD.clouds` false) and now: blue overhead at noon, the low sky warmer towards a setting sun than away from it, clouds that vary the sky and shade the field at some of nine places, that settle held still, keep their place as the camera turns and are the same clouds a frame after a cut and in a card's picture, a storm with the game's own cloud colours that stays dark, and the two switches off drawing as before; without `--webgpu` it checks WebGL draws as before. Look at the pictures too (`--shots`): the sky is judged by eye. Then `node scripts/look-compare.cjs check <main's save> --webgpu` (scenes with a physical sky or clouds change on purpose) | about 3 min |
| A camera like a real lens (`src/kit/lens.js`, `src/kit/hd3d-gpu-lens.js`, `lensStep` in hd3d.js, the DOF pass's lens mode) | `node scripts/detail-test.cjs --page lens --webgpu [--shots dir]` and again without `--webgpu`: a striped post in focus and a checker wall 30 m off, the blur of lamps against the circle of confusion worked out by hand (radius within a fifth), discs evenly lit and smaller with six blades, a near post that spills over what is behind it and goes soft when focused far, autofocus on the post and then the wall, a focus pull that eases in time, sunny sixteen drawing as the game set it and f/8 two stops brighter, the shutter's motion blur, a card's picture the same, `v.lens = null` drawing as before, and iso 'auto' lifting a night less than all the way. Then `node scripts/look-compare.cjs check <main's save> --webgpu` (nothing changes without a lens) | about 2 min each |
| Shaders built mid-round (hd3d `holdNew`, `buildAhead`, `shadowAhead`, `compileGPU`, `forPass`, `gridRoom`; `KitLighting`, `shadowOps` and the passes' `contextNode` in hd3d-gpu.js; `freeUnbuilt` in gpu.js) | `node scripts/shader-hold.cjs` and again with `--webgpu`: on WebGPU it fails if a pipeline or a shader's text is made in the middle of a frame for a thing switched on, turned to or added, or for the scene's things after a view's first frame, or for a thing that was hidden while the scene's lights changed, or for a thing of a look already drawn that takes shadows where that one does not (`shaderKey`), or if the chip refuses a pipeline after a thing's shape was freed while its shader was still being built (`freeUnbuilt` in gpu.js), or if the effects chain's passes write their shaders again in the frames after the chain is built again (a quality step; NodeMaterial's `contextNode` and GTAO's setup in hd3d-gpu.js) | about a minute each |
| Shaders a round made, made ahead next time (`src/kit/pipes.js`) | `npm run build:bundled && node scripts/shader-replay.cjs [ids] [--runs 3] [--secs 20]`: plays each game in two or more launches of the browser on one profile, with the same taps; the first notes the pipelines made in play, the later ones must make them ahead (under the card and the loading screen) and three's asks must find them. It fails if a game noted pipelines and the last run made none of them ahead. The software chip's pipelines take far longer than a phone's, so read the counts, not the milliseconds | about a minute a game |
| The phone and driver steering list (`src/steer-list.js`, `src/steer.js`, `src/kit/steering.js`) | `node scripts/steer.mjs` (the PR check runs it): every rule's fields, knobs, patterns and version ranges, and the matching itself; `--try platform=android chip="Adreno (TM) 830" engine="Chrome 142"` says which rules a device with those facts gets and what they set, `--file x.json` checks a rule being drafted. `cd workers/hearts && node test.mjs` checks the report's rules (docs/crash-reports.md, Chips and phones to steer) | 1 s |
| Where the engine's own code time goes, and what a frame built (any of hd3d.js's per-frame work) | `node scripts/scene-probe.cjs --webgpu --q "scene=village&mode=off&frames=120" --top 30` flies one run of an engine test scene under a CPU profile and lists the functions by time a frame; `--long 80 --prep` lists the frames that made a shader, pipeline, texture or buffer and for which mesh; `&keys` and `&grid` in `--q` say why a shader's text was written twice. Read code time and counts only: the software renderer says nothing about a phone's chip | 2 to 4 min a run, one or two at a time |
| The close-up look of `gs.models.material()` on WebGPU (`hd3d-gpu.js` `recipeTwin`, `hd3d.js` `swapTwins`) | `node scripts/close-up.cjs [--shots dir] [--only uvs\|scatter\|solid]`: a floor the camera stands on is never hidden while its close-up shader comes in, its far end is as steady as the painted textures when the picture moves by part of a pixel, and a panel at the camera is sharper than them with its pattern in the same place | about 40 s |
| Frame generation | `node scripts/framegen-test.cjs --check` (19 suites against `scripts/framegen-test/baseline.json`, two of them what the game's motion misses and the optical flow catches (a shadow sweeping past, reflections, a picture on a screen), two `gs.props` copies changing detail level and the last two blend shapes (fur shells, faces); `--save` after a change meant to move the numbers), `node scripts/framegen-games.cjs [--jobs n]` | about 3 min, then 1 to 4 min |
| The upscalers (SGSR 1 and 2, `hd3d-gpu.js` `sgsr2Gpu`, `sgsr2.js`) | `node scripts/upscale-compare.cjs [--webgpu] [--scale 1.8] [--tier 2] [--warm 80]`: error and flicker against the scene drawn at twice the size; fails if SGSR 2 is worse than a plain stretch, our changes to it worse than Qualcomm's shader as it was, or (WebGPU, on its textured scene) the sharper textures under SGSR 2 not clearly closer than without. `--scenes textured` runs only those; `--modes sgsr2-x0100011` sets GSSR's FSR 3.1 switches by digit (`__hd.sgsrFsr`, docs/nextgen-3d.md), and the printed `thin` and `moving` columns are the error and flicker on thin things and on what moved; the moving light (`lamp-moves`) is printed, not checked against the shader as it was; `sgsr2-hand` and `aa-hand` draw GSSR without its learned blend, and the comparison fails if the learned one is clearly further from the true picture or shimmers more where nothing moves (`--net w.json` tries a trained net; `scripts/gssr-train.cjs` and `gssr-train.py` make one, docs/nextgen-3d.md); the PR check runs it with `--webgpu`, and without for the WebGL shader in `sgsr2.js` | about 5 min, 2 min |
| Engine speed (CPU per frame) | `node scripts/perf-bench.cjs [id ...] --json before.json` before, `--vs before.json` after (see below) | about 15 s a game per backend |
| Shared code that is slow, makes garbage or stalls in many games (any of `src/kit`, `src/main.js`, `src/perf.js`...) | `node scripts/kit-hot.cjs --era 2d\|pocket\|console\|nextgen\|ar\|board\|3d\|all [--gpu] [--secs 5] [--jobs 3] [--json before.json]` (`--vs before.json` after): plays every game of a style under a CPU profile and an allocation sampler and adds up, over all of them, each engine function's own time, the time under it, the memory it allocates, and the long busy stretches with the function under them. A function a little slow in fifty games outranks one game's own slow code. Hitches are only worth reading with `--jobs 1` or 2: several browsers on four cores stall each other | 2D: about 15 min for the 86 phone games; Next Gen with `--gpu`: about 10 min |
| What a 3D game asks of the chip in the middle of a round (shaders, pipelines, texture uploads) | `node scripts/round-probe.cjs [id ...] [--secs 15]`: starts each round the real way (Play, through the loading screen), plays it, and lists shader text written, pipelines made in a frame, textures uploaded and made, with the kit or game function that asked. WebGPU. No ids: every Next Gen game; name Console, AR and Board games to probe them too (a Console game is watched on its own renderer). An upload that takes long here is the main thread waiting on the chip's process | about a minute a game |
| Loading (how long a game's making holds the main thread; `src/kit/slices.js`, `jobs.js`, the builders that pause) | `npm run kit-test` and `npm run kit-browser` (the workers' answers against the same work done on the spot), then `node scripts/load-time.cjs [id ...] --json before.json` before, `--vs before.json` after (see below) | about 5 s a game |
| Half precision in the kit's own WebGPU passes (`src/kit/half.js` `halfFn`: SGSR 2's upscale and sharp reads, frame generation's sharp reads, smoke and fire, the grade) | `node scripts/half-check.mjs`: each half function compiled on its own by naga (the WebGPU shader checker Firefox uses), in half and in full; the build machine's WebGPU has no half precision, so this is the only compile the half versions get before a phone (needs `cargo install naga-cli`; that part skips without); then, in the test browser, the start-up check (`halfCheck`) that draws in full any function a phone's chip won't compile, with no error reported. Then the full-precision pictures: `node scripts/upscale-compare.cjs --webgpu --modes sgsr2` (scores as before), `node scripts/framegen-test.cjs --check`, `node scripts/look-compare.cjs check <main's save> --webgpu`, and `node scripts/framelab-test.cjs` for the switch | half a minute; then minutes each |
| Subgroups in the kit's own WebGPU compute passes (`src/kit/subgroups.js` `claim`, `addUp`: GPU culling's lists, frame generation's counts) | `node scripts/detail-test.cjs --page cull --webgpu` (the same pictures and lists with `HD.subgroups` off and on; the test browser's chip has subgroups of 4), `node scripts/framegen-test.cjs --check` and again with `--query '&subgroups=0'` (the same scores), then `node scripts/framelab-test.cjs` for the frame lab's Subgroups check | about 40 s, then minutes each |
| The frame lab (`src/framelab.js`), CPU by part (`src/kit/prof.js`), effects that step down by their cost (hd3d.js `FXS`, `pickEffect`) | `npm run kit-test` (time by part, the effect picked), then `node scripts/framelab-test.cjs [2d-id] [3d-id] [--shots dir] [--report file.html]` (also: the chip's time by effect, effects drawn smaller with no shader built, memory) | a second, then about 3 min |
| The memory guard (`src/kit/memory.js`, `plugins/power-state`) | `npm run kit-test` (levels from the phone's readings and warnings, up at once and down after a calm spell), `node scripts/prune.cjs` (the feed keeps fewer cards while memory is short, and builds back up), `node scripts/app-test.cjs reports` (a crash report says "(memory was low)"). On a phone: the frame lab's memory line, and its api `memory(2)` | a second, about a minute, about a minute |
| How a game really runs (pacing, hitch causes, upscaler, frame gen) | the frame lab on a phone: QA panel › Frame lab, Rec, Report ([frame-lab.md](frame-lab.md)) | |
| Every 3D game and every native plugin on a real phone | the phone test tour: QA panel › Phone test tour (see below) | about 25 min for the 56 3D games |
| What the engine's detail systems gain on a real phone's graphics chip | the tour's engine test scenes: QA panel › Phone test tour › Engine test scenes (see below) | about 18 min |
| What ray traced reflections cost on a real phone's graphics chip | the hall alone: QA panel › Phone test tour › Ray tracing only (see below) | about 2 min |
| What frame generation costs and gives on a real phone (pictures a second, the made frames' chip time) | the tour's frame generation runs: QA panel › Phone test tour › Frame generation (see below) | about 8 min |
| The tour itself (`src/tour.js`, `src/detail-tour.js`, the guest in `src/main.js`) | `node scripts/app-test.cjs tour scenes framegen` (`tour`: the guest, the report and the sheet; `scenes`: the engine test scenes; `framegen`: their frame generation runs on WebGPU) | about 5 min |
| Everything (before a big engine PR) | `node scripts/smoke.cjs` (all 162 games) | about 3.5 min |

The PR check (`.github/workflows/game-pr-check.yml`) runs the node checks (`npm run games`, the store
apps' web build, `licences`, `types-check`, `game-types`, the starter templates, `kit-test`, `brains`, `recommend`, `site`),
the uniqueness check on the changed games (`unique.mjs --since`), and then smoke, streamed, fold, sweep, Tiny
Brains, the AI playtester and budget on the changed games (plus a sample of engine-heavy games when shared code
changes), split over up to three machines. The slower checks run only when their parts change, each on a machine
of its own: `app-test.cjs -scenes` and `sound-test.cjs` ("app"), `app-test.cjs scenes` ("app-scenes"),
`framegen-test.cjs --check`, `close-up.cjs`, `gpu-loss.cjs` and the dust look ("framegen"), `upscale-compare.cjs`
in three parts ("sgsr"), `share-link.mjs`, the guards' mutation check, and `ar-floor.cjs` when the AR kit changes.

**Keeping it quick.** GitHub runs about 20 jobs at once for the whole repository, shared by every open pull
request, so time on a machine is what everyone waits for. Before adding a check: give it a "did my part
change?" step like the others, so other pull requests skip it in seconds; keep any one job under about 8
minutes on GitHub (split by part or scene, as `app-test.cjs` and `upscale-compare.cjs` are); and use
`.github/actions/browser` for Node and the browser. GitHub's machines are about 1.8 times slower than the
cloud machine these times were measured on. The maths probe (`math-probe.cjs`, a warning only) runs after
merging (`maths-probe.yml`), and the Android builds skip pull requests that change only games, kits or test
scripts.

## The AI playtester: can a player reach the goal?

`node scripts/playtest.cjs <id>` (after `npm run build:bundled`; `npm run playtest -- <id>` does both)
plays the game with a bot that really tries to win, not one that mashes taps. It runs the game much
faster than real time with a seeded `Math.random`, so a replay is exact, and every quarter second of
game time it tries a few taps, holds, drags and keys (and doing nothing), plays each a little further
in two ways (random moves after, and nothing after), and keeps the best. It prints whether the goal
was reached and after how much game time.

The flags are signals, not verdicts: a bot that can't sort a puzzle doesn't mean people can't.
`goal-not-reached`, `goal-in-under-5s` and `random-taps-win` show as warnings on the PR. It fails on
errors and on `goal-with-no-input` (the goal reached without touching the game); `--strict` also fails
on a goal it never reached. A game on a fixed tick (`tick: 60`) is played on that tick.

The bot swipes like a thumb (quick straight flicks in the four directions) as well as tapping,
holding and dragging, and while it plays, `performance.now()` and `Date.now()` follow game time, so
holds, double taps and swipe speeds in `gs.controls` read the same as on a phone. It can't solve
puzzles, so on a **thinking game** (a tag with Puzzle, Word, Logic, Memory, Strategy, Cards, Match,
Merge, Sort, Maze, Trivia...) "goal not reached" is a note, not a warning, and `--strict` ignores it.

**Emoji in the test browser.** Emoji show on phones, but a test machine without a colour emoji font
draws them as empty boxes. On Debian or Ubuntu, `sudo apt-get install fonts-noto-color-emoji` fixes
it; `smoke.cjs` says when the font is missing. Drawing icons yourself works everywhere too.

## Running many games at once

`smoke.cjs`, `stream-smoke.mjs`, `fold.cjs` and `sweep.cjs` play several games side by side, one
browser each (`scripts/lib/pool.cjs`). The default is one browser per CPU (up to 6) for the 2D-heavy
checks and half the CPUs for `sweep.cjs`, whose 3D draws in software. Change it with `--jobs n` or
`JOBS=n`; use `--jobs 1` when you want the output in order or the machine is busy with something
else. Results print as each game finishes, so they can come out in a different order.

| Check (cloud machine, 4 CPUs) | Before | Now |
| --- | --- | --- |
| `smoke.cjs`, all 162 games | 12 min 3 s | 3 min 18 s |
| `stream-smoke.mjs`, all 162 games | 5 min 14 s | 1 min 38 s |
| `sweep.cjs` Bunker Breakout, Parcel Dash, Suit Ops (now Canopy Run), Long Shadow | 12 min 37 s | 2 min 51 s |
| `npm run kit-test` | 63 s | 3 s |

`budget.cjs` stays one game at a time on purpose: it measures time, and games running beside it
would make it look slower than it is.

## Why 3D tests are slow, and what to do about it

The test browser has no graphics chip: WebGL and WebGPU are drawn in software (SwiftShader). One Next
Gen frame takes a third to most of a second there, and copying it onto the card (what tests do, as
`__hd.direct` is off under a test browser) waits for all of it. So:

- In a test that checks logic (errors, rules, layout), draw less 3D, not less game: `sweep.cjs`
  draws Next Gen and AR every 20th step at the odd sizes (at a small size: `__hd.scale = .3`,
  `__hd.upscale = false`) and every 10th at the game's own size. `--full` puts the old way back
  (every 5th step at full size) when you are chasing a drawing bug.
- `__hd.force = 0..3` pins a quality tier, `__hd.scale` the 3D size, `__hd.upscale` turns SGSR off;
  set them only for what a test is about, and put them back (`null`, `true`) after.
- Frame rates on SwiftShader say nothing about phones. Compare CPU numbers (update, `HD.info.cpu`,
  draw calls) before and after on the **same** machine, never against a phone.
- `gl.finish()` does not wait in Chrome, and `readPixels` on a multisampled target throws, so GPU
  time per pass can't be measured this way here. GPU cost needs a real phone.
- Wait for a game's lazy parts before you time or draw it: loop until `!__gs.active.loading`.

## The phone test tour: every 3D game and every plugin, on the phone in your hand

The checks above run in a desktop browser on a build machine. They can't say how a 3D game runs on a
phone's graphics chip, whether it stutters once the phone is warm, or whether a native plugin still
answers after an update. The tour does, with one button:

1. On the phone, tap the **GAME SCROLL** logo for the QA panel, then **Phone test tour**.
2. Choose what to play (the 3D games, only Next Gen and AR, or every game) and for how long (10, 20 or
   30 seconds each). Next Gen games are played in full screen, the way they are played and the most
   work for the phone; untick the box to time them on their card. The sheet says how long the whole
   tour will take. Press **Start** and leave the phone on a table with the screen on. AR games may ask
   for the camera the first time.
3. When it ends (or you press **Stop** on the bar at the top) it shows one report. **Copy report** and
   paste it into chat. The last report is kept: open the tour again and press **Last report**.

What it does (`src/tour.js`):

- **Plugins.** Each native plugin is asked one harmless question with a 4 second limit: Device, App,
  Haptics, KeepAwake, Geolocation (only its permission state), Filesystem, Share, TextToSpeech,
  PowerState, AppHealth (Android: why the app last closed), ScreenRate, PhoneSensors (which sensors, and where sound is going), RichHaptics,
  NativeAR, NPU, PhoneAI (the model, and speech), GameServices (whether the player is signed in
  already) and SpeechAudio (the phone writes three words of speech to sound, unheard: the answer says
  how many samples a second, how long it is and how many word marks came with it, which is what shaped
  voices in `gs.sound.say` need). None of them shows a prompt, turns a sensor on or changes a setting. The report lists
  `ok` with the answer, `FAIL` (an error, or no answer in time) and `MISSING` (not in this build of
  the app), problems first. The web version has no plugins and says so.
- **Games.** Each game is shown through the real feed, loaded, started and played by a bot: two
  thumbs that tap, hold, swipe, drag and work a thumb-stick, sent to the game's canvas as pointer
  events, so they travel the way a finger's do. A round that ends is started again until the seconds
  are up. The app's own frame loop times every frame (the same numbers the stutter reports use), so
  frame pacing, frame generation and the screen's rate are the real thing. Sound and vibration are
  off while it runs unless you tick the box.
- **The report.** The phone (model, system, screen, refresh rate, graphics chip, WebGPU, class), the
  battery and heat before and after, the settings that change speed, the plugins, then one line per
  game, problems first:

  ```
  SLOW      canyon-ace (Canyon Ace) · Next Gen · loaded in 2.4 s · round ready in 0.9 s · 47 of 60 fps (+60 made) · worst 1% 31 fps · longest 58 ms · slow 6% · freezes 0 · game code 4.1 ms · WebGPU, quality 2/1, full screen · 2 rounds, best 14 · phone warm
  ```

  `round ready in` is how long the loading screen was up between Play and the first round starting
  (3D games only: see "Play on a 3D game" below), `47 of 60 fps` is real frames drawn against the rate
  the game aims for on this phone, `+60 made`
  the frames frame generation adds, `worst 1%` the frame rate of the slowest hundredth of frames,
  `slow` the share of frames over one and a half times their budget, `freezes` frames of 70 ms or
  longer (those as a round started are counted apart: that is the level being built, not play), and
  `game code` the game's own `update` and `draw` per frame. The word at the start is `ok`, `SLOW`
  (under 85% of the rate it aims for), `STUTTER` (3 or more freezes in play, or 1 frame in 20 slow),
  `ERROR` (the game threw; the message and place follow), `NO LOAD` (not ready in 40 s, it failed to
  start, or it is a streamed game not on the phone yet with no connection) or `NO FRAMES`.

**The bot is a guest.** Nothing it does is kept: games get saves and Tiny Brains that go nowhere
(reads still see the player's own), and a round pays no credits, sets no best, sends no leaderboard
score or play stats, uses up no boosts and doesn't reset an idle game's time away. Location games
get the stand-in place, so nothing asks where you are. Frame timings and errors do count, in the QA
panel and the anonymous stutter reports: they are real ones from a real phone. The quality tier a
3D game settles on is kept too, as it is after any play.

The bot only pokes at a game; it doesn't try to win (that is `scripts/playtest.cjs`), so `best 0` is
normal. Later games run on a warmer phone than earlier ones: the report says so on each line, and a
second tour in the other order (or of only the slow games) tells heat from a slow game.

In a test browser, `__gs.tour({ ids, seconds })` runs it and `(await __gs.tourKit()).reportText(result)`
makes the report; `node scripts/app-test.cjs tour` checks the guest, the bot, the frame sums, the
plugin check (against a stand-in app) and the sheet.

### The engine test scenes: what the detail systems are worth on a phone

The Next Gen engine's detail systems (cluster detail, detail for copies, real surface detail, hiding
what is behind other things, shadows in tiles, crowds, ray traced reflections, smaller meshes) are checked by `scripts/detail-test.cjs` on a build machine's software renderer (ground that takes marks by `scripts/marks.cjs`, smoke and fire by `scripts/gas.cjs`). That can count triangles
and compare pictures; it can't say what a phone's graphics chip gains. The tour can:

1. QA panel, **Phone test tour**, and under **Play** choose **Engine test scenes**. Pick the seconds
   for each run and press **Start**.
2. Nineteen scenes made in code (`src/detail-scenes.js`) are each flown through with one system off
   and then on (`src/detail-tour.js`): a **valley** of about 1.9 million triangles (cluster detail), a
   **forest** of 20,000 firs and 2,000 rocks (detail levels for copies; on WebGPU it is flown twice over,
   with the chip picking the copies and then the CPU, as happens while frame generation runs), a **village** of twelve houses
   (their bricks, slates and planks as real triangles) and a **town** of 25 houses with 400 statues, urns, rocks and
   crates round them, walked through by lanes that end at houses (hiding what is behind other things; the report says
   how many things it left out a frame and how long finding them took. It is kept at work all through that run, where
   in a game it would rest wherever it saves next to nothing). The town is then walked a third time with the sun's
   shadow map drawn whole, as it used to be, and the report sets that against the run before it, whose map is kept
   in tiles ("shadows in tiles against shadows drawn whole"); every run of the town says how many triangles and
   draws its shadow maps took a frame. A **square** of 300 people and dogs walking, running and
   standing is walked through with a skeleton each and then as one crowd (`gs.props.Crowd`); each run says
   how long posing them took a frame. Then a **field** of sand, grass and bare earth with eight people, a
   dog, a jeep and a tank going round it, as snow lies, thaws to wet earth and dries (the weather goes
   round every 18 seconds): once leaving no trace, then with their prints, tracks and parted grass
   (`gs.outdoors.Marks`); that run says how many marks are kept, how many tiles of them are drawn and how
   long making them took a frame. And a **yard** with a camp fire under a beam, a smoking chimney, a
   burning drum and an explosion every seven seconds, in a wind that swings round (`gs.gas`): once with
   no smoke or fire, then as the smaller version (the gas worked out in JavaScript, drawn as soft puffs)
   and, on WebGPU, a third time as the gas on the graphics chip, drawn as a lit volume; each run says how
   many cells the gas has, how wide one is and how long the kit's own code took a frame. Then a walk
   along the foot of a **cliff**, in at a cave under a spur, out the other side and under an arch: once
   on the height map alone (the walk goes over the spur), then with the rock on it (`land.rocks()`);
   that run says how many triangles the rock is, in how many pieces, and how long its numbers took. Last, a polished **hall** of 24 pillars and figures (half a million
   triangles, with banners and lanterns over the camera's head, glowing orbs and chrome balls moving
   through it and a mirror at each end) is walked three times on WebGPU: with no reflections, with
   reflections worked out from the screen, and ray traced (`src/kit/hd3d-gpu-trace.js`). The report sets
   screen reflections against none and ray traced against screen, and says what the traced copy of the
   hall holds, how long it took to make and how much memory it takes on the chip. The ray traced run is
   forced on for the test, and says so on a phone that would not trace by itself; on WebGL the hall is
   walked twice, without the ray traced run. Last of all a **parade**: eight people, each their own, a
   dog, a horse and a goods train walked along close up, their points kept as plain floats and then kept
   small (`src/kit/slim.js`); each run says how many bytes they took in memory and on the graphics chip
   (the pictures are the same, so the frame rates say whether a phone's chip minds the smaller lists).
   Then a **line-up**: eight people along a line, one walking a ring, one turning quickly on the spot, one
   kneeling and turning, one dropping to a crouch and up, one holding a rifle, one talking, one walking to
   and fro with stops and one standing with a pack on, posed as drawn and then with what makes people move
   and look alive (steps that are really taken, momentum and follow-through, a live face, hands that hold);
   each run says how long the posing took a frame, and the second how many steps were taken.
   Then **faces**: four people (a young woman, an older heavy man, a young man with dark skin, a woman of
   fifty), each in turn filling the screen as the camera drifts round them in a low sun, in the clean look
   and then the real one (`look: 'real'`); the frame rates say what a real face costs close up.
   And a **street**: a walk along the pavement of a made-up downtown (`gs.city`), at golden hour and, after
   ten seconds, at night: once as the city was (windows painted on, cars and people of boxes), then with
   rooms behind every window (`src/kit/city-rooms.js`), real cars (`src/kit/city-cars.js`: the nearest few
   whole, the rest as simpler copies), cars parked along the kerbs, sculpted people on the pavements (a
   `gs.props.Crowd`) and the street dressed (`src/kit/city-dress.js`: ledges, balconies, shop signs, kerbs,
   drains, corner name signs, bins); each run says how long the city's own code took a frame, the second
   how many cars were drawn whole, how many were parked and how many people in how many draws.
   Then a **night** street: a walk down a wet pavement under lamps on posts, cars going by with their
   headlights on, people walking, two neon tubes and a lit sign; once with every lamp a plain round light,
   then with the nearest lamps and headlights casting shadows from one shared atlas (each slot drawn again
   only when something it sees moved), headlights in a dipped beam's shape and the neon and sign lighting the
   road from their length (`src/kit/lamps.js`); the second run says how many lights were lit, how many had a
   shadow and how many shadow slots were drawn a frame.
   And **cars**: a kerb of parked cars walked past at arm's length in a low sun, once as cars were (dark glass
   with nothing behind it, plain paint), then with seats, dashboards and door cards behind see-through glass,
   paint with flakes, road grime and rain beading (`src/kit/models/vehicle-looks.js`), and one car hit early on:
   a dent with scraped paint, a side window that breaks and drops its glass on the road, a crazed windscreen
   and a broken lamp (`src/kit/models/vehicle-damage.js`); each run says how many triangles a car is, the
   second what the hit car took.
   And the **ground**: a drive at 9 metres a second down the streets of a made-up old town at midday, once on
   the tiled ground pictures the city had (they repeat every few metres) past bare walls, then on the ground
   painted round the camera (`src/kit/ground-paint.js`): patches, cracks and tar lines in the asphalt, slabs
   laid in a bond with a cracked one here and there, gum and stains, oil under parked cars and skid marks before
   stop lines, painted into two pictures that follow the camera a strip at a time and read in place of the
   tiles, with posters, made-up tags, damp streaks and grime on the street walls (`src/kit/city-walls.js`); the
   second run says how many strips were painted, how many texels a frame on average and how many things the
   walls wear.
   Then **shade**: sat at a café table looking at the cups, then up and out across a square full of people
   and rising over it to look at towers and hills far off, under a low sun; once with the sun's shadow maps
   alone, then with the sun mask (`src/kit/sunmask.js`, `sunmask-gpu.js`; WebGPU): short rays in the depth
   picture for the cups, shadows past the sun map's box for the far towers, and the crowd's far members as
   capsules, out of the sun's map. Each run says what the shadow maps took a frame (fewer triangles in the
   second, as the far people leave them), and the second how many capsules there were; on WebGL both runs
   draw the same and the second says so.
   Then the **skyline**: the view from the tallest roof of a made-up downtown, turning slowly round as dusk turns to
   night, once with the city stopping at its last street, then going on to the horizon (`src/kit/city-far.js`): a
   made-up city of stand-ins in its own colours (blocks of 90 m, then 180 m, then 360 m, thinning out into the
   country by 6 km) with its windows lit at night, its street lights one batch of dots and land with hills out to
   10 km; the second run says how many stand-ins and far lamps there are and how many triangles in how many draws.
   Last, a **coast** in the rain, followed behind a jeep that goes along the coast road and back along the
   sand above the surf, past a hut with a window and a rowing boat offshore: with the plain water
   (`gs.outdoors.Water`), with the open sea and its shore (`gs.outdoors.Sea`: the swell, breakers, the
   swash and wet sand, and on WebGPU the FFT's fine waves and the see-through water), then with the rain
   that runs onto the lens and is thrown off the jeep's tyres; each run says how long the water and the
   rain took a frame.
   About 20 minutes at 20 seconds a run on WebGPU (40 runs), longer the
   first time: the systems build what they need in the background, which the report times, and keep it
   on the phone.
3. The report, to copy and paste into chat, has the phone, the picture (WebGPU or WebGL, the quality,
   the size the 3D was drawn and shown at) and for each scene:

   ```
   VALLEY · cluster detail · 1,915,460 triangles in 55 meshes · made in 1.4 s
     every triangle             58 fps · worst 1% 44 fps · longest 31 ms · chip 15.2 ms · code 1.1 ms · 1,583,930 triangles in 212 draws
     cluster detail             120 fps · worst 1% 97 fps · longest 12 ms · chip 4.0 ms · code 1.3 ms · 47,604 triangles in 140 draws · ready in 21.4 s · 37 meshes drawn in clusters · cluster tables 15.3 MB
     = cluster detail against every triangle: 2.1 times the frame rate · 3.8 times less chip time · 33 times fewer triangles
   ```

   (Those numbers are made up to show the shape: nobody has run it on a phone yet.) `chip` is the
   graphics chip's own time for a frame, where the phone tells it (WebGPU with timestamps), followed in
   brackets by where it went, biggest first (`chip 15.2 ms (scene 6.1, upscale 2.4, AO 2.3, bloom 1.6,
   shadows 1.2, finishing 1.0, to screen 0.6)`: the game's own things, the passes that make the full-size
   picture, the soft shading in corners, the glow, the shadow maps, the pass that lays the shading and glow
   on the small picture and grades it, the last pass onto the screen); `code` is
   the time the engine's code took to draw a frame; `ready in` is how long the system took to build
   what it needs.

   A phone's chip doesn't run at one speed: it slows down as it gets hot, and when the code holds the
   frames up it clocks down to fill the time (on Rob's Fold, 2026-11-13, the bloom and the upscale, which
   do the same work in every run, each took from one to four times as long from one run to the next, and
   always kept to the same share of each other). So where the chip says where its time went, the `=`
   line also gives the **chip work**: the frame's chip time measured against the passes that do the same
   work in every run (finishing, upscale, bloom, to screen), which takes the phone's own slowing down out,
   and says so when the chip ran more than 15% slower or faster in one of the two runs. Go by the chip
   work where it and the chip time disagree.

How the runs are kept comparable: the feed is emptied and the scenes draw on a canvas of their own
over the app, with the 3D canvas under it as on a game's card; quality is pinned to the tier the
phone's class starts on, at full resolution, so neither run can trade sharpness for speed; frame
generation is off, so every frame timed is a real one; before a run is timed its builds are waited
for and the whole flight is flown once quickly, so its shaders are built; and each run flies the same
path by the clock. A frame rate can't go above the screen's rate, so where both runs keep it, the chip
time is what tells them apart. The valley's "every triangle" run also turns the older whole-mesh
levels off (`HD.autoLod`), which would otherwise arrive part-way through it.

In a test browser, `__gs.tour({ scenes: true, seconds, size, only })` runs them (`size: .1` for small
scenes, `only: ['valley']` for one); `node scripts/app-test.cjs scenes` flies small ones and checks the
counts, the stage, and that the feed comes back as it was. A new detail system gets a scene in
`src/detail-scenes.js`: `[key, name, what it tries, make]`, where `make({ gs, HD, size, gpu })` gives
`{ v, holds, modes: [{ key, name, enter(draw) }], path(t, cam), tell(), dispose() }`.

### Ray tracing alone on a phone

Under **Play**, **Ray tracing only** flies just the **hall**, the same way and with the same report as
in the engine test scenes (its header says `engine test scenes, ray tracing`): with no reflections, with
reflections worked out from the screen and ray traced, about 2 minutes at 20 seconds a run in place of
the full tour's 15. Read `= ray traced against from the screen` for what tracing costs, and the
`reflections` part of each run's chip time for the reflection passes themselves. On WebGL the hall is
walked twice, without the ray traced run, and the report says ray tracing needs WebGPU. In a test
browser: `__gs.tour({ scenes: true, traced: true, seconds, size })`.

### Frame generation on a phone

Under **Play**, **Frame generation** flies four of those scenes (the town, the square, the forest and the
yard: houses and shadows, people, thin leaves, smoke and fire) with their system on, five ways each:

- as many frames drawn as this class of phone draws a Next Gen game (every refresh on a top phone),
- half the screen's rate drawn and nothing made,
- half drawn with the refreshes between blended as before (each made frame on its real frame's refresh,
  every tile the full way, none dropped: `HD.fgPace = 'after'`, `HD.fgQuick = false`, `HD.fgDrop = false`),
- half drawn with the refreshes between blended as now (paced by the chip's times, easy tiles the quick
  way, a made frame that would come late dropped),
- half drawn with the refreshes between guessed ahead of the newest.

Each run is paced the way the app paces a game (`src/main.js` `frame()`: a real frame on a steady beat,
and `speed.between` on the refreshes between). Frame generation is forced on or off for the run whatever
Settings say (`speed.forceFrameGen`), and the screen is asked for the rate a game drawn that way would get
(`speed.standIn`). Each step of a made frame is timed as a pass of its own (`HD.fgParts`), so the report
says where a made frame's time goes. About 10 minutes at 20 seconds a run.

```
SQUARE · crowds · 300 people and dogs walking, running and standing in a square · made in 0.4 s
  120 drawn, none made       112 pictures a second · worst 1% 71 · longest 25 ms · chip 8.1 ms a drawn frame (scene 4.2, …) · code 1.9 ms · 3D at 907 x 1434 · screen 120 Hz
  60 drawn, none made        60 pictures a second · … · screen 60 Hz
  60 + 60 blended before     92 pictures a second (50 drawn) · … · chip 13.8 ms a drawn frame (made frames 7.8, …) · a made frame 7.6 ms (picture 2.9, moving 2.2, …) · the made frame on the real one's refresh · …
  60 drawn, 60 blended       116 pictures a second (58 drawn) · … · chip 10.3 ms a drawn frame (made frames 4.1, …) · a made frame 4.1 ms (…) · each frame on a refresh of its own · 81% of tiles the quick way · …
  60 drawn, 60 ahead         118 pictures a second (59 drawn) · …
  = a made frame: 7.6 ms blended before, 4.1 ms blended, 4.0 ms ahead of chip time, against 6.0 ms for a drawn frame with the chip as busy
  = 60 drawn, 60 blended against 60 + 60 blended before: 116 pictures a second against 92 · worst 1% 80 against 22 · a made frame 4.1 ms against 7.6
  = 60 drawn, 60 blended against 120 drawn, none made: 116 pictures a second against 112 · worst 1% 80 against 71 · 1.6 times less chip time a picture
```

(Made-up numbers, to show the shape.) `pictures a second` counts the drawn and made frames that reached
a refresh (a refresh that showed the same picture again isn't counted), with how many were drawn; worst
1% and longest are of the gaps between those pictures. `chip` is the graphics chip's time for each drawn
frame together with the frames made after it; "a made frame" is a made frame's own passes (moving: each
pixel along its motion; motion: the optical flow and the tile sort, once a pair; picture: putting it
together; holes: filling what was uncovered; keeping: the newest frame kept for the next pair). Don't
take the difference from "none made" as the made frames' cost: a phone clocks its chip down at half
rate, so frames drawn with none made take it longer (11.8 ms against 6.2 in the forest on the Fold).
"chip time a picture" shares a drawn frame's time among the pictures it gave. "the page got N
refreshes a second" shows up when the phone held refreshes back because the chip was behind. On WebGL there is nothing to
time (frame generation is WebGPU only), and the report says so.

In a test browser, `__gs.tour({ scenes: true, framegen: true, alternate: true, seconds, size, only })`
runs them (`alternate`: every other refresh is one between real frames, since a software renderer's
frames come too slowly for a beat); `node scripts/app-test.cjs framegen` runs the square that way on WebGPU's
software renderer.

## Measuring engine speed: perf-bench

```bash
npm run build:bundled
node scripts/perf-bench.cjs --json /tmp/before.json          # every Next Gen game, WebGL then WebGPU
# ...change the engine, build again...
node scripts/perf-bench.cjs --vs /tmp/before.json            # prints the change per game
node scripts/perf-bench.cjs long-shadow --gpu --profile      # the slowest functions, with file and line
```

It plays each game at the top tier (Rob's Galaxy Z Fold 8 is a top-class phone) with random taps and
prints the game's `update()` time, the 3D frame's CPU time (`HD.info.cpu`), draw calls, triangles,
load time and memory kept. The numbers move by 10 to 20% between runs on a shared machine, so trust
bigger changes, or run it twice.

To see whether WebGPU builds shaders during play (a hitch each time), hook
`renderer.debug.onNodeBuilderCreated` on `webgpu().r` (from `src/kit/gpu.js`, importable in the dev
server) and count the calls per second.

## Measuring loading: load-time

```bash
npm run build:bundled
node scripts/load-time.cjs --json /tmp/before.json           # every 3D game, a fresh page each
# ...change the engine, build again...
node scripts/load-time.cjs --vs /tmp/before.json             # prints "(was N)" beside each number
node scripts/load-time.cjs gloomwick-hall --passes           # each pass of one game's making
CPU=4 node scripts/load-time.cjs living-chess                # on a 4 times slower processor
OUT=/tmp/dist-before node scripts/load-time.cjs              # another build (vite build --outDir)
```

A game is made a little each frame while its card says "Loading…" (`src/kit/slices.js`), each pass
on a fresh copy of the game's file, with the heavy number work in background workers
(`src/kit/jobs.js`). For each game this prints `worst` (the longest single run of `make()` +
`reset()` on the main thread: what a player scrolling past feels), `total` (all passes added up),
the number of passes, the jobs the workers did and when the card became playable. It times one card
on a fresh page: the first time a player meets the game. `--passes` shows, for each pass, how much
of it was the game's own code (and kit work nobody keeps, such as a texture the game painted): that
part is run again every pass, so a game with more than 30 ms of it is "made in one go" from there.
The numbers move 10 to 20% between runs, and first-frame costs (shader builds, texture uploads,
drawing) are not in them: `perf-bench.cjs` and `shader-hold.cjs` measure those.

## Play on a 3D game: the loading screen before a round

Play on a Next Gen, AR or Board game does not start the round at once. The app puts a loading screen
over the card, runs the game's `reset()`, draws the round's first frames under the cover (`draw()`
with no `update()`), runs the round's first `update()` there too, once, and starts the round when the
3D kit has nothing left on its way (shaders being built, things hidden until theirs are; for up to 4 s
also cluster detail, shaders built ahead and, on WebGPU, textures still being packed for the chip) and a few
frames in a row came on time (`getReady` in `src/main.js`; `src/kit/getready.js` is what the app and
the kits share). A card that has been through it once is quick the next time, so "Play again" usually
shows no loading screen at all. A 2D game still starts the instant Play is pressed.

In tests, `__gs.start()` starts the round this instant, as it always has, so every existing script
times what it timed before. `__gs.play()` is the real tap: it goes through the loading screen.
`__gs.active.starting` is set while a card gets ready (`phase`: `load`, `warm`, `hold`),
`__gs.active.readyMs` is how long the last one took, and `__gs.waits()` is what the kits are still
waiting for (`{ hard, soft, what }`).

```bash
npm run build:bundled
node scripts/app-test.cjs ready                  # the rules: cover up at once, one reset, one hidden update, nothing hidden at the start
node scripts/round-start.cjs                     # every Next Gen, AR and Board game: Play to the round, and its first frames
node scripts/round-start.cjs parcel-dash --now   # the old way, to compare: the round starts on the tap
node scripts/round-start.cjs --webgpu --jobs 3   # the WebGPU path, in software
```

`round-start.cjs` prints one line a game: how long it took to get ready, the frames drawn under the
cover (the longest of them is the building that used to land in the round), and the round's first
five frames beside its usual one. `HIDDEN n` means the round started with things still waiting for
their shaders, `LONG` that its first frames were more than 2.2 times the usual one, `(later n)` only
that something the game made mid-round was hidden for a moment while its shader built. With `--now`
the same games show what the loading screen saves: Parcel Dash's first frame is about 2 s in software
instead of a normal one.

## Pictures: proving a change doesn't change the look

- `look-compare.cjs` draws fixed, seeded scenes (Next Gen at every tier, Console) and fails on a
  visible difference. Save before the change, check after, on WebGL and with `--webgpu`.
  (Saving the "before" from a second git worktree whose `node_modules` is a link to the first one: the dev
  server won't serve the fonts through the link, so `fx-text` differs for that reason alone.)
  `PICK=recipes,wear` draws just those scenes (about 10 s; `beams` draws beams-sun, beams-lamp and motion-blur); `Q=dbg` (with `ALLWARN=1`) logs what the
  renderer holds (and how many textures are packed) every 3 s and says when the graphics queue stops
  answering; `Q=nopack` draws code-made textures uncompressed on WebGPU; `Q=hdr` turns on HDR output (as on an HDR
  phone screen; the saved pictures clip it to white).
- Real liquids (`gs.fluid`): `PICK=gpu-fluid node scripts/look-compare.cjs save <dir> --webgpu` runs a dam
  break round a cup with a tap, a ball, a blast and a drain on the graphics chip, with the JavaScript
  version beside it, and fails if the two part by more than a hundredth of a cell or liquid is lost;
  without `--webgpu` it draws the JavaScript version. `npm run kit-test` has the liquid's rules.
- Smoke and fire (`gs.gas`): `PICK=gpu-gas node scripts/look-compare.cjs save <dir> --webgpu` burns a fire and
  a smoke maker under a ball on the graphics chip with the JavaScript version beside it, given the same grid
  and the same steps, and fails if their cells part by more than a hundredth of the smoke or the answers
  copied back (where the fire is, how smoky the box is) are not the other's; then a closed room with ground,
  a wall, wind, a fan, a tube, a turning box, an explosion and a puff, held to the same rule. Without
  `--webgpu` it draws the JavaScript version. `npm run kit-test` has the gas's rules.
- GPU culling of `gs.props`: `PICK=gpu-cull-cpu,gpu-cull node scripts/look-compare.cjs save <dir> --webgpu`
  draws the same forest culled on the CPU and on the GPU (`Q=n=6000` sets the number of trees). The two
  pictures should match, and each line gives the CPU time per frame and the time spent building the lists.
  Occlusion culling on the chip: `node scripts/detail-test.cjs --page cull --webgpu [--shots dir]` walks along a
  wall with 2,500 posts behind it and a low sun from the side, each frame drawn with the hidden posts left out and
  drawn whole (the same picture, shadows of the hidden posts included), the counts read back from the chip,
  subgroups off and on, and a post carried out from behind the wall (about 40 s). `--page occlude --webgpu
  --q cull` runs the street with every `gs.props` kind picked on the chip.
- Known noise (2026-11-10): the test machine's software WebGPU (SwiftShader) sometimes hangs its queue,
  with no error, partway through a full `--webgpu` run (seen after the live bounce light scenes), and
  every scene after that shows the same frozen picture. If a run of CHANGED lines all differ by 30+,
  run the check again or `PICK` the scenes that failed.
- `gpu-games.cjs --shots dir` saves each game's first moments on both backends; games move a little
  by their own randomness, so it's a guide, not a test.
- `shots.cjs` / `shots3d.cjs` take screenshots at phone and fold sizes for looking at.

## Habits that save time

- Test the games you changed, not all of them; for engine changes, `pick-games.mjs` gives the few
  per style that use the most of `gs`.
- Run long checks in the background and read their log when they finish, rather than waiting on them.
- One check at a time when you are timing something; parallel checks slow each other down.
- Known noise (2026-11-09): `gpu-games.cjs` can log WebGPU `struct OutputType {}` errors when it plays
  several games in one page. The WebGPU thread is fixing it; check whether a failure is that before
  chasing it.
- The cloud machine can't reach `api.game-scroll.com`; the failed requests in logs are expected.
