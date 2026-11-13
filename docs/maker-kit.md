# Maker kit

Ready-made tools for making games feel good, so you can spend your time on the idea and not on
plumbing. Everything here is built into the app, made in code (no image or sound files), and works
in every style. The `npm run new` templates use all of it, so they are the quickest way to see it.

Games use all of it through one import, `gs`:

```js
import gs from '../gamescroll.js';
const { sounds } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects;
```

| You want | Use | Section |
| --- | --- | --- |
| A working game to start from | `npm run new my-game --style pocket` | [Starter templates](#starter-templates) |
| To remember things between plays | `api.save(data)`, `api.load(fallback)` | [Save slots](#save-slots) |
| To pause cleanly | `pause()` / `resume()` hooks | [Pause and resume](#pause-and-resume) |
| To wait for the first tap before the round starts | `gs.rounds.Ready` | [Rounds and scenes](#rounds-and-scenes) |
| To keep a HUD out from under the score badge | `api.scoreArea()` | [The score badge](#the-score-badge) |
| A level from where the player is, or walking to play | `api.location()`, `gs.geo` | [Location](#location) |
| Coin, hit, boom, hurt... in one line | `gs.effects.Feel` | [Effects](#effects) |
| Particles, screen shake, smooth movement, "+10" pop-ups | `gs.juice` | [Juice](#juice) |
| Explosions, jingles, music, designed sounds, synths | `gs.sound` | [Sound](#sound) |
| A thumbstick, buttons, tap / hold / swipe | `gs.controls` | [Controls](#controls) |
| Game controllers, analog sticks, rumble | `gs.pad` | [Game controllers](#game-controllers) |
| Swing, punch, throw, flip, twist the phone | `gs.moves` | [Motion moves](#motion-moves) |
| Crisp pixel text, sprites drawn from text | `gs.pixel` | [Pixel text and sprites](#pixel-text-and-sprites) |
| A title in a comic, spooky, sci-fi, western or handwritten font | `gs.fonts` (13 display fonts, 4 more pixel fonts) | [Fonts](#fonts) |
| Wood, stone, metal, paper, cloth and water without image files; things with outlines, glows and soft shadows | `gs.gfx` `material`, `slab`, `water`, `sticker` | [2D materials, slabs, water and stickers](#2d-materials-slabs-water-and-stickers) |
| A hand-drawn look; inked lines the player draws | `gs.sketch` (Rough.js, perfect-freehand) | [Sketchy shapes and ink](#sketchy-shapes-and-ink) |
| A sword, heart, key or coin picture that looks the same on every phone | `gs.icons` (528 icons, game-icons.net) | [Icons](#icons) |
| Things that spin, tumble, hinge, swing on ropes | `gs.physics` (Rapier) | [Physics](#physics) |
| 3D bodies, level collisions, a walking character | `gs.physics3d` (Rapier) | [3D physics](#3d-physics) |
| Enemies that chase, flee, flock, find a path | `gs.ai` (Yuka) | [AI](#ai) |
| Seeded random, daily seed, smooth noise, timers | `gs.math` | [Maths](#maths) |
| 3D text, 3D particles, outlines, glitch, trails | `gs.fx3d` | [3D extras](#3d-extras) |
| Enemies that plan: behaviour trees, "what do I want most" | `gs.ai.Tree` (mistreevous), `gs.ai.Choose` | [Behaviour trees and wants](#behaviour-trees-and-wants) |
| People who stumble, brace, fall and get up when hit, shoved, tripped or blown up | `gs.characters.Reactions`, `phys.ragdoll(character)` | [People who react](#people-who-react) |
| 3D people that bend smoothly, walk-to-run blends, feet on slopes, faces that talk | `gs.poses.person`, `rig.blend`, `rig.plant`, `gs.characters.Face` | [Skinned people, faces and lip sync](#skinned-people-faces-and-lip-sync) |
| Thousands of fish, bats or zombies that flock | `gs.ai.Swarm` (WebGPU compute, CPU fallback) | [Swarms](#swarms-thousands-of-flockers) |
| Play with your face or your hands | `gs.vision` (MediaPipe) | [Face and hands](#face-and-hands) |
| To see frame rate, hitboxes, slow motion | press `` ` `` in `npm run dev` | [Debug overlay](#debug-overlay) |
| Opponents that learn as you play (Tiny Brains) | `gs.brains` | [Tiny Brains](#tiny-brains) |
| Sliders to tune numbers while you play | `gs.tweak` | [Hot reload and tweak sliders](#hot-reload-and-tweak-sliders) |
| A save that survives a game update | `save: { version, migrate }` | [Save slots](#save-slots) |
| Is my game fast enough for phones? | `npm run budget my-game` | [Speed budget](#speed-budget) |
| Match-3, 2048 sliding, flood fill on a grid | `gs.board` | [Game kits](#game-kits) |
| Turn-based fights, items, XP and loot | `gs.battle` | [Game kits](#game-kits) |
| Buffs, perks, poison over time, mana that refills, cooldowns with charges (real time) | `gs.stats` | [Game kits](#game-kits) |
| Dungeons, caves, mazes, islands, tile patterns | `gs.gen` (rot.js, WaveFunctionCollapse) | [Game kits](#game-kits) |
| Drag pieces into slots, reorder a list | `gs.drag` | [Game kits](#game-kits) |
| Undo and redo moves | `gs.history` | [Game kits](#game-kits) |
| An inventory, crafting recipes | `gs.items` | [Game kits](#game-kits) |
| A point-and-click adventure | `gs.adventure` | [Game kits](#game-kits) |
| Hex maps, isometric views | `gs.hex` | [Game kits](#game-kits) |
| Strategy controls, tower defence | `gs.rts` | [Game kits](#game-kits) |
| A fighting game | `gs.fight` | [Game kits](#game-kits) |
| Bullet patterns (shoot-'em-ups) | `gs.bullets` | [Game kits](#game-kits) |
| Falling sand, blastable ground | `gs.sand` | [Game kits](#game-kits) |
| Monsters, faces, loot, towns from a seed | `gs.art` | [Game kits](#game-kits) |
| Team sports AI | `gs.sports` | [Game kits](#game-kits) |
| Quiz questions (about 2,700) | `gs.trivia` (Open Trivia Database) | [Game kits](#game-kits) |
| Rivers, waterfalls, lava, floods | `gs.flow` (+ `gs.outdoors` `River`, `FloodWater` in 3D) | [Game kits](#game-kits) |
| Idle game prices and big numbers, money while away | `gs.idle`, `api.away()` | [Game kits](#game-kits) |
| Pass the phone, or split the screen | `gs.party` | [Game kits](#game-kits) |
| Notes on the beat, Perfect / Good / Miss | `gs.rhythm` | [Game kits](#game-kits) |
| Draw a shape to cast it, drawn lines as ramps | `gs.strokes` | [Game kits](#game-kits) |
| Cars and karts that drift and boost, laps | `gs.vehicles`, `World3D.vehicle()` | [Game kits](#game-kits) |
| A 3D level from a text map | `gs.level3d` | [Game kits](#game-kits) |
| Time of day, rain, snow, lightning | `gs.sky` | [Game kits](#game-kits) |
| Rain that wets the ground and stops at roofs, puddles, snow that settles | `gs.sky` `Weather({ level })` | [Weather that changes the world](#weather-that-changes-the-world) |
| Footprints and tyre tracks in snow, mud and sand, grass that parts, a trail to follow | `gs.outdoors` `Marks` | [Ground that takes marks](#ground-that-takes-marks) |
| Cliffs with ledges and overhangs, caves to walk through, arches, rock of your own shape | `gs.outdoors` `land.rocks()` | [Cliffs, caves and overhangs](#cliffs-caves-and-overhangs) |
| Guns, recoil, health that comes back, explosions | `gs.combat` | [Action and adventure kits](#action-and-adventure-kits) |
| Enemies that take cover, flank and call out | `gs.tactics` | [Action and adventure kits](#action-and-adventure-kits) |
| Hang from ledges, shimmy, climb, swing on ropes | `gs.climb` | [Action and adventure kits](#action-and-adventure-kits) |
| Run, aim, hang and climb poses on a 3D figure | `gs.poses` | [Action and adventure kits](#action-and-adventure-kits) |
| Mission scripts, objectives, checkpoints | `gs.missions` | [Action and adventure kits](#action-and-adventure-kits) |
| Cutscenes, quick-time prompts | `gs.cutscene`, `gs.prompts` | [Action and adventure kits](#action-and-adventure-kits) |
| Break walls into pieces, slice things in two | `gs.destruction` (three-pinata) | [Action and adventure kits](#action-and-adventure-kits) |
| Buildings that come apart: shoot a hole, blow out a corner, and what it held up comes down | `gs.destruction.Structure` | [Buildings that come apart](#buildings-that-come-apart) |
| Cars, lorries, tanks, trains, boats and planes to drive, with no model files: wheels that roll and steer, tracks, a turret, propellers | `gs.models.vehicle` | [Vehicles made in code](#vehicles-made-in-code) |
| Fur on animals, beards (and hair, when asked) in strands on people, or a furry anything: strands in layers, no texture files | `gs.models.fur`, `creature({ fur })`, `human({ strands, beard })` | [Fur and hair](#fur-and-hair) |
| Light meter, takedowns, bodies, disguises | `gs.stealth` | [Action and adventure kits](#action-and-adventure-kits) |
| Grappling hook, zip line, hacking puzzles | `gs.gadgets` | [Action and adventure kits](#action-and-adventure-kits) |
| Ball games with boosting, flipping cars | `gs.arena` | [Action and adventure kits](#action-and-adventure-kits) |
| Chapters, stars, collectibles, unlocks | `gs.campaign` | [Action and adventure kits](#action-and-adventure-kits) |
| Sounds placed in 3D, music that builds up | `gs.sound.Ears`, `music({ layers })` | [Action and adventure kits](#action-and-adventure-kits) |
| Sounds muffled by walls, each place with its own echo, by themselves | `new Ears({ level })` | [Action and adventure kits](#action-and-adventure-kits) |
| Knocks by what things are made of, footsteps by what is underfoot, engines that rev through the gears, by themselves | `gs.sound.Foley` | [Action and adventure kits](#action-and-adventure-kits) |
| Thousands of trees and rocks, rooms, big worlds | `gs.props` (InstancedMesh2) | [Action and adventure kits](#action-and-adventure-kits) |
| Materials, props, sculpted shapes, trees and plants (palms, ferns, swamp plants, ivy over walls, weeds in cracks), buildings, close-up people, and animals and monsters from a seed, made in code, and real surface detail (Next Gen) | `gs.models` | [Next Gen 3D](nextgen-3d.md#things-made-in-code-gsmodels) |
| Hills, islands, grass and trees, water to float on | `gs.outdoors` (THREE.Terrain) | [Worlds, craft, soft things, cards and menus](#worlds-craft-soft-things-cards-and-menus) |
| Water you can disturb: rings, splashes and spray, wakes and foam behind boats and swimmers, rain on it, foam at the shore, the view from under it | `gs.outdoors.Water` | [Water you can disturb](#water-you-can-disturb) |
| A whole city: streets, buildings, traffic at the lights, people, routes | `gs.city` | [Cities](city.md) |
| Planes, boats, hover craft, floating crates | `gs.craft` | [Worlds, craft, soft things, cards and menus](#worlds-craft-soft-things-cards-and-menus) |
| Cloth, ropes, jelly to cut and squish; a simple liquid | `gs.soft` | [Worlds, craft, soft things, cards and menus](#worlds-craft-soft-things-cards-and-menus) |
| Decks, hands, poker and blackjack maths; dice | `gs.cards` (pokersolver), `gs.dice` | [Worlds, craft, soft things, cards and menus](#worlds-craft-soft-things-cards-and-menus) |
| A dictionary for word games | `gs.words` (SCOWL) | [Worlds, craft, soft things, cards and menus](#worlds-craft-soft-things-cards-and-menus) |
| Menus, shops and HUD layout in your own look | `gs.ui` (Yoga) | [Worlds, craft, soft things, cards and menus](#worlds-craft-soft-things-cards-and-menus) |
| Hear a dog bark, a whistle, clapping; spoken commands | `gs.hear` (YAMNet, the phone's own speech) | [Hearing, doodles and the phone's AI](#hearing-doodles-and-the-phones-ai) |
| Know what the player drew (sword, bridge, umbrella...) | `gs.doodle` | [Hearing, doodles and the phone's AI](#hearing-doodles-and-the-phones-ai) |
| Lines that change every time (a shopkeeper, a riddle) | `gs.phoneai` (the phone's built-in AI) | [Hearing, doodles and the phone's AI](#hearing-doodles-and-the-phones-ai) |
| The same jumps and timings at 30, 60 and 120 fps; exact replays | `tick: 60`, `gs.tick` | [Fixed game tick](#fixed-game-tick) |
| An original tune for your game without writing notes | `gs.sound.compose({ mood, seed })` | [Music composer](#music-composer) |
| Music under every round in one line; a band, synths or an orchestra instead of beeps | `music: 'chase'` in the definition, `music({ set: 'band' })`, `gs.sound.instrument()` | [Sound](#sound) |
| Smooth lines in a drawing game; ink that stays under the fingertip | `touch: 'fine'`, `api.ahead()` | [Finer touch](#finer-touch) |
| Save something big (a built world, drawings, recorded runs) | `api.saveLocal()` / `loadLocal()` | [Save slots](#a-bigger-save-that-stays-on-the-phone) |
| The look of an old handheld's screen | `lcd: true` in the definition | [Pixel text and sprites](#even-pixels-and-the-lcd-look) |
| Puzzles with exactly one answer, graded, with fair hints; computer opponents for board games | `gs.solve` | [Puzzles and opponents](#puzzles-and-opponents) |
| A board game on a table in 3D that also plays on your floor in AR: camera, picking, turns, real dice, pieces, chess | `gs.tabletop` | [board-games.md](board-games.md) |
| Play with your whole body; put the player inside the game; thumbs up and other hand signs | `gs.vision.Body`, `CutOut`, `Signs` | [Body, cut-outs and hand signs](#body-cut-outs-and-hand-signs) |
| A scavenger hunt for real things ("find a cup!"); scan a barcode or QR code to make a creature or a level | `gs.vision.Objects`, `Scanner` | [A camera that knows things](#a-camera-that-knows-things) |
| Walk to play, lift the phone, a dark room, a hand over the phone | `gs.device.steps()`, `pressure()`, `light()`, `near()` | [Steps, air pressure, light, proximity](#steps-air-pressure-light-proximity) |
| Block worlds to dig, build and craft in | `gs.voxels` | [Voxel worlds](#voxel-worlds) |
| Liquid you can pour, splash and fill things with, in 3D | `gs.fluid` | [Real 3D liquids](#real-3d-liquids) |
| Smoke and fire that rise, curl, fill a room and go round things, in 3D | `gs.gas` | [Smoke and fire that flow](#smoke-and-fire-that-flow) |
| A world too big to build before play; levels built only when the player picks them | `gs.regions` | [Big worlds in parts](#big-worlds-in-parts) |
| Night in the game when it is night outside; the real moon; plug in to charge; headphones in | `gs.real` (SunCalc) | [The real world: sun, moon, battery, headphones](#the-real-world-sun-moon-battery-headphones) |

## What `gs` has, and what it doesn't

`gs` is a frozen object with one group per job: `sound`, `device`, `util`, `math`, `palettes`,
`juice`, `effects`, `controls`, `pad`, `moves`, `pixel`, `gfx`, `bricks`, `physics`, `physics3d`,
`ai`, `things`, `rounds`, `pacing`, `aim`, `senses`, `prefs`, `camera2d`, `tiles`, `movers`, `anim`, `story`,
`replay`, `look2d`, `brains`, `tweak`, `board`, `battle`, `gen`, `drag`, `idle`, `party`, `rhythm`,
`strokes`, `vehicles`, `paths`, `bones`, `level3d`, `sky`, `camera`, `nav3d`, `characters`, the action kits (`combat`,
`tactics`, `climb`, `poses`, `missions`, `cutscene`, `prompts`, `destruction`, `stealth`, `gadgets`,
`campaign`, `arena`, `props`), `outdoors`, `craft`, `soft`, `cards`, `dice`, `words`, `ui`, `solve`, `tick`, `voxels`, `fluid`, `gas`, `toon` (Classic
Console 3D), `hd` (Next Gen 3D), `ar`, `fx3d`, `vision`, `geo`, `real`, `fonts`, `sketch`, `icons` and `THREE`.
It is the only thing a game may import (`src/game-modules.js`); `npm run games` refuses anything
else and the PR check flags it.

Everything else (credits, saved progress, settings, hearts, raw storage, the unrounded location)
belongs to the app and isn't on `gs`. Save with `api.save()`, find the player with `api.location()`.

`gs` sends each call to the right place underneath: our own kits, or the best free library for the
job (Rapier for physics, Yuka for AI, Recast for 3D path finding, MediaPipe for faces and hands,
Tone.js, ZzFX, TinySDF, simplex-noise, rot.js, WaveFunctionCollapse, three-pinata,
InstancedMesh2, THREE.Terrain, Yoga, pokersolver, SCOWL, anime.js, pitchy, the phone's own speech). If we swap a library later, games don't change.

**Big parts load when first used.** Physics, 3D physics, 3D path finding, 3D extras, face tracking, Tone.js, the
dictionary (`gs.words`) and the UI layout engine (`gs.ui`) are a
few MB, so the app loads them the first time a game needs them. Create those things in `make()` or
`reset()`: if the library isn't in yet, the app shows "Loading…" on the card and makes your game
again once it is. Don't create them later (in `update()` or a tap), or the game will stop with an error.

**Loading doesn't hold the feed still.** A big 3D game (a board game's room, a level with twenty
textures made in code) used to stop the feed for a third of a second or more while it was made. Now
its card says "Loading…" with a bar, and the feed and the game being played keep moving. You don't
write anything for it:

- The heavy number work goes to background workers: a `surface()` texture's bumps, a recipe
  material's pixels, a sculpted mesh, a 3D path map. The game is made straight away with what it
  asked for, and the card waits until the workers have filled it in.
- The kit's builders that keep what they make (props, trees, buildings, recipe materials, sculpts,
  `rbox()` rounded boxes, a city's textures and street furniture) build a little each frame: when a pass of `make()` has used its share of the frame, the builder
  stops it, and the app makes the game again on the next frame, when everything already built
  comes straight back.
- Each of those passes runs on a fresh copy of your game's file, and the copy that gets to the end
  is the game. So a world kept at the top of the file (`let view; ... if (!view) setup()`, as the
  templates do) is never left half built by a pass that was stopped.
- A game whose own code is the slow part (more than about 30 ms of its own maths and painting in a
  pass) is made in one go, as before: running that again every frame would cost more than it saves.
  The workers still take the number work.

What it means for a game: `make()` and `reset()` may run more than once before the first round, so
keep things that must happen once (a save written, a sound played) out of them. That was already
the rule for the big parts above. Build the world in `make()` or the first `reset()`; a builder
called later (in `update()`, or in a new round) just builds on the spot.

`node scripts/load-time.cjs <id> --passes` shows how long a game's making holds the main thread,
in how many passes, and how much of that is the game's own code ([testing.md](testing.md)).

**Your game leads, the kit helps.** The kits work out the fiddly parts (what hit what, when to
spawn, where a guard looks, where the camera goes) and hand you the answers. How things look, the
HUD, and the rules stay in your game: nothing on `gs` draws a screen for you unless you call it.

Each streamed game lists the parts of `gs` it uses, so an app version that doesn't have one yet
skips the game until it updates.

## Starter templates

```bash
npm run new my-game                     # Phone (Casual)
npm run new my-game --style pocket      # phone | pocket | color | advance | console | nextgen | ar | board
npm run new my-game --style ar --title "Balloon Pop" --creator "Sam"
```

This writes `src/games/my-game.js`, a small complete game that already plays and passes the smoke
test. Then `npm run dev` and `__gs.only('my-game')` in the browser console. Change the mechanic, the
look, the title, tag and hint: the template is only a starting point, and a game that is still
recognisably the template won't be merged.

Every template starts the way a finished game does, so a new game has these from its first line:
a **fixed tick** (`tick: 60`: the same game on every phone, drawn between ticks with `gs.tick.mix`),
**Ready** (`gs.rounds.Ready`: nothing moves or scores until the first tap), **Feel**
(`gs.effects.Feel`: particles, shake, sound and a buzz in one call, following the player's settings),
a **soundtrack in one line** (`music: 'happy'` in the definition) and a HUD that keeps out of the
app's score badge.

| Style | What the template also shows |
| --- | --- |
| `phone` | Tap targets; tweens, hit-stop, a save slot |
| `pocket` | Catch game in four shades; slider stick, pixel text, a chip tune |
| `color` | Runner; tap to jump and hold for a big jump (gestures), pixel text |
| `advance` | Tower of crates that tumble; real 2D physics (Rapier) drawn between ticks, pixel text, a save slot for the best tower |
| `console` | Cel-shaded 3D gem hunt; floating thumbstick |
| `nextgen` | HD 3D rolling ball; two-thumb layout (stick + boost button), GPU sparks, shadows |
| `ar` | Balloons in your room; tap to pop, drag to look when there's no gyro |

## Save slots

Every game has its own small save, for unlocked levels, settings, a best combo, a run to continue:

```js
function make(api) {
  let unlocked = api.load({ level: 1 }).level;      // fallback when there is no save yet
  return {
    // ...
    levelDone() { unlocked++; api.save({ level: unlocked }); },
  };
}
```

- `api.save(data)` replaces the save. `data` must be JSON (numbers, strings, booleans, arrays,
  plain objects) and at most 8 KB as JSON text. It returns `false`, and saves nothing, if not.
- `api.load(fallback)` returns a fresh copy of the save, or `fallback` when there is none.
- `api.clearSave()` deletes it.
- A game can only see its own save. Saves ride along in the player's Game Center / Play Games cloud
  save, so they follow the player to a new phone. If two phones saved, the newer save wins.
- Save at moments that matter (a level cleared, game over), not every frame.
- Best scores and credits are already saved by the app: don't keep them in your save.

**Changing what you save.** When an update changes the shape of your save, give it a version and
say how to turn an old save into the new one, so players keep their progress:

```js
export default {
  // ...
  save: {
    version: 2,                                   // was 1 (no `save` field means version 1)
    migrate(data, from) {                         // runs once, the first time the new game loads it
      if (from < 2) data = { level: data.level, stars: [] };
      return data;
    },
  },
};
```

- `migrate(data, from)` gets the old save and its version and returns the new one, which is kept.
  Handle every older version (`if (from < 2) ...; if (from < 3) ...`).
- If it throws or returns `undefined`, `load()` gives your fallback and the old save stays as it is.
- A save written by a newer version of your game (the player's other phone already has the update)
  is left alone: `load()` gives the fallback and `save()` returns `false` until this phone updates.

### A bigger save that stays on the phone

For things too big for the cloud save that wouldn't be missed on a new phone (a world the player
built, drawings, recorded runs to race against) there is a second slot, up to 512 KB of JSON:

```js
function make(api) {
  let world = api.loadLocal(null) || newWorld();    // in make() or reset(): see below
  return {
    // ...
    built() { api.saveLocal(world); },               // false if it isn't JSON or is over 512 KB
  };
}
```

- `api.saveLocal(data)`, `api.loadLocal(fallback)`, `api.clearLocal()` work like the three above, but
  the data stays on this phone (in its database, packed) and is not part of the cloud save.
- Reading it the first time takes a moment, so call `loadLocal()` in `make()` or `reset()`: the card
  shows "Loading…" and the game is made again once the save is in, the same way it waits for the
  physics engine. After that it answers at once, anywhere.
- Keep what matters (progress, unlocks) in `api.save()`, which follows the player. A new phone, or a
  player who clears the app's data, starts the phone-only slot empty: always have a fallback.
- Save versions cover it too: `save: { version: 2, migrateLocal(data, from) { ... } }`.

## Location

For games built from where the player is (a daily puzzle shared with everyone nearby, things that
live in this park) or played by walking about. Declare how precise you need it, then ask during play:

```js
const { cellId, distance, offset } = gs.geo;

function make(api) {
  let here = null, asked = false;
  return {
    reset() { asked = false; },
    update(dt) {
      if (!asked) { asked = true; api.location().then(p => { here = p; buildLevel(p.real ? cellId(p, 2000) : todaySeed()); }); }
      // ...
    },
  };
}
export default { id: 'park-hunt', /* ... */ location: 'coarse', make };   // 'precise' for walk-around games
```

- `api.location()` resolves (never throws, at most ~8 s) to
  `{ lat, lon, accuracy, real: true, precision }`, rounded **before your game sees it**: to 0.01°
  (about 1 km) for `'coarse'` and 0.0001° (about 10 m) for `'precise'`. `accuracy` is in metres and
  never smaller than the rounding.
- When there's no real position it resolves to the stand-in `{ lat: 0, lon: 0, real: false, reason }`
  where `reason` is `'denied'` (the player said no), `'off'` (Settings → "Let games use my location"),
  `'unavailable'` (no fix, indoors, timed out) or `'not-playing'`. **The game must play with the
  stand-in**: use a daily seed, or let the player walk the stand-in around with `offset(p, east, north)`.
- `api.watchLocation(cb)` calls `cb` at once and again each time the rounded position changes. It
  stops when the round ends, and returns `stop()` for stopping sooner. A coarse game only hears about
  moves of about 1 km.
- **Play time only.** Before the player presses Play, and after the round ends, both give the
  stand-in without asking, so the phone's permission question only appears for a game the player
  chose to play. The start screen and the How to play card tell players the game uses location.
- `npm run games` refuses a game that calls `api.location` without declaring `location`. The PR check
  flags `'precise'` (a maintainer checks it's needed) and any direct `navigator.geolocation` use.
- The declaration goes into the catalogue, and the game asks for `api.location`, so app versions
  older than this one skip location games instead of offering them.
- Location never leaves the phone and isn't saved. Don't put coordinates in `api.save()`; save a
  `cellId` if you need to remember a place.
- There are no map tiles yet: draw the area yourself (paths, a grid, a compass to a target).

`gs.geo` has the maths: `distance(a, b)` in metres, `bearing(a, b)` in degrees from north,
`offset(p, east, north)`, `toLocal(origin, p)` → `{ x, y }` metres for drawing, and `cellId(p, metres)`,
a whole number that is the same for everyone in the same square (to seed "what spawns here today").

Test: `npm run location-test` checks the rounding, the play-time rule and the stand-ins in the real
app with a fake GPS position.

## Juice

`const { Juice, ease, lerp, approach, pulse, Tweens, Particles, Shake, Popups } = gs.juice;`

The `Juice` object bundles the lot. Use `new Juice({ pixel: true })` in Pocket, Color and Advance
games so effects snap to whole pixels.

```js
const fx = new Juice();
reset()    { fx.clear(); }
update(dt) { fx.update(dt); if (fx.frozen) return; /* your game logic */ }
draw(c)    { /* background */ fx.begin(c); /* the world */ fx.end(c, W, H); /* HUD */ }
// when something happens:
fx.burst(x, y, { n: 16, speed: 140, color: ['#ff0', '#f80'], gravity: 300 });
fx.shake(6);                    // about 6 units of shake, fades by itself
fx.pop(x, y, '+10', { color: '#ffd23f' });
fx.flash('#ffffff', .3);        // full-screen flash
fx.freeze(.06);                 // hit-stop: the action pauses for a moment (check fx.frozen)
fx.tween(card, { x: 200, s: 1 }, .4, ease.outBack).then(() => {});
```

- **Particles** `burst(x, y, opts)`: `n`, `speed`, `spread`, `angle` + `arc` (a cone), `life`, `size`,
  `shrink`, `gravity`, `drag`, `color` (one or a list), `shape` (`'circle'`, `'square'`, `'spark'`),
  `glow`. `emit(x, y, vx, vy, opts)` adds one (trails, smoke).
- **Easing**: `ease.linear`, `inQuad`, `outQuad`, `inOutQuad`, `inCubic`, `outCubic`,
  `inOutCubic`, `inBack`, `outBack` (pops), `outElastic` (springy), `outBounce`, `inOutSine`.
- **Tweens**: `fx.tween(obj, props, seconds, easing, delay)` animates any numbers on any object.
- `approach(cur, target, rate, dt)` follows a target smoothly at any frame rate (cameras, needles).
  `pulse(t, period)` is a smooth 0..1 wave for glowing "tap here" prompts.
- In 3D games, draw `fx.begin(c); v.render(c, W, H); fx.end(c, W, H);` so the shake moves the 3D
  frame too. For 3D sparks use the 3D kit's own particles.

## Sound

`const { sounds, noise, notes, tone, music, freq, zzfx, zsound, Tone, sfx } = gs.sound;`

```js
sounds.coin();  sounds.coin(1 + combo * .05);    // optional pitch: rising combos
noise(.4, { vol: .1, from: 2000, to: 80 });      // a custom explosion
notes('C5 E5 G5 C6:3', { len: .09 });           // a jingle; ':3' = three steps long, '.' = rest
const tune = music({ tempo: 128, lead: 'E5 . G5 . A5 - G5 .', bass: 'C3 . . . G2 . . .', drums: 'k . h . s . h .' });
tune.start(); tune.speed(1.2); tune.stop();
```

- **Ready-made** (98): each takes an optional pitch (`sounds.step(1.2)`). Ones that repeat a lot (steps,
  hits, shots, whooshes) come out a touch different each time, so ten in a row don't sound like a
  machine; tuned ones (coins, jingles) play exact.
  - Menus: `tick` `tock` `toggle` `back` `confirm` `deny` `open` `close` `select` `blip` `click`
  - Moving: `jump` `step` `land` `dash` `skid` `flap` `bounce` `boing` `swoosh` `whoosh` `slip`
  - Fights and breaking: `hit` `hurt` `shoot` `laser` `boom` `blast` `slash` `punch` `block` `clang`
    `bow` `reload` `zap` `charge` `shield` `thud` `crack` `shatter` `crumble`
  - Rewards: `coin` `gem` `key` `heal` `star` `chest` `combo` `perfect` `unlock` `cash` `powerup`
    `levelup` `pop`
  - Weather and animals: `splash` `drip` `bubble` `gust` `thunder` `crackle` `chirp` `croak` `buzz`
    `squeak` `growl`
  - Machines: `beep` `alarm` `siren` `ring` `door` `lever` `teleport` `warp` `robot` `rev`
  - The round: `countdown(last)` `go` `win` `lose` `buzzer` `fanfare` `tada` `whistle` `gong` `bell`
    `roll` `horn` `sad` `heart`
  - Cartoon: `wobble` `squish` `plop` `zip` `honk` `twinkle` `pluck` `munch` `gulp`
- **`noise(len, { vol, from, to, filter, q, attack })`**: filtered noise sweeping from `from` Hz to `to` Hz.
  High to low is an explosion, short and high is a hit, long and low is a rumble. `attack` fades it in (a whoosh).
- **`space({ seconds, decay, wet, bright, pre })`**: the sound of a place, a reverb made in code (a
  church, a valley, a cave). Play into it with `noise(len, { out: sp?.in })` or `tone(f, { out: sp?.in })`,
  or pass it to `new Ears({ space: sp, send })` so 3D sounds echo too. `sp.set({ wet, bright }, seconds)`
  glides (stepping indoors). Null where there is no audio, so write `sp?.in`.
- **`bed({ vol, from, filter, q, gusts })`**: a steady background made from noise: wind (`gusts` for
  slow swells), rain, a river. `b.set({ vol, from }, seconds)` glides as a storm rises. Beds fade in,
  go quiet while paused and stop with the round.
- **`tone(note, { len, wave, vol, slide, attack, hold, wobble })`**: one note with a soft envelope.
  Notes are names (`'A4'`, `'C#5'`, `'Eb3'`) or Hz. `hold` keeps it at full for that long before it
  fades (an alarm, a horn); `wobble: [times a second, cents]` is vibrato.
- **`music({ tempo, lead, bass, pad, arp, drums, vol, swing })`**: a looping tune. Each part is a
  line of eighth-note steps: a note, `.` for a rest, `-` to hold the note before. Drums: `k` kick,
  `s` snare, `h` hi-hat, `c` crash (several at once: `kh`). Parts can be different lengths.
- **Instruments**: `music({ set: 'band', ... })` plays the same tune on real-sounding instruments
  made in code (Tone.js; no sound files). Sets: `'chip'` (square and triangle waves, the default),
  `'synth'` (saw lead, sub bass, warm pad, 808 drums), `'band'` (electric piano, bass guitar, organ, a
  drum kit) and `'orchestra'` (flute, cello, strings, harp, timpani). Swap single parts with
  `voices: { lead: 'bell', drums: 'kit' }`: `saw` `sub` `warm` `pulse` `epiano` `bassguitar` `organ`
  `pick` `flute` `cello` `strings` `harp` `brass` `bell` `kalimba` `marimba` `steelpan`, drum kits
  `kit` `808` `concert`. The instruments load the first time a tune asks for them; it plays in the
  chip sound until they're in (`song.tuned` says when). Every set comes out about as loud as the others.
- **`instrument('kalimba')`**: one of those voices to play yourself, for a piano, a xylophone or a
  rhythm game: `const k = instrument('kalimba'); k.play('C5', { len: .4, vol: .8 });`. Make it in
  `make()` or `reset()` (it loads first).
- **A soundtrack in one line**: `music: 'chase'` in the definition and the app plays an original tune
  under each round, written from that mood and the game's id (so every game gets its own). It builds
  as the score nears the goal, lifts when the player scores, leans its tempo to how fast they tap,
  holds on the pause screen and stops when the round ends. Moods: `happy` `calm` `tense` `spooky`
  `heroic` `sad` `silly` `chase` `puzzle`. Pixel styles get the chip sound and the others a set to
  suit the mood, or say more: `music: { mood: 'heroic', set: 'orchestra', vol: .8, tempo: 120, key: 'D', bars: 8 }`.
  A game with its own `music()` calls leaves the field out.
- Start your own music in `update()`, not in `reset()` (reset also runs while the game waits in the
  feed). The app stops all music when a round ends or the player moves to another game.
- **Loudness looks after itself**: everything a game plays goes through a limiter, so twenty sounds at
  once (a big combo, an explosion over music) get quieter together instead of crackling.
- **`delay()`**: seconds between asking for a sound and the player hearing it (the phone's output
  delay, more on Bluetooth). Rhythm games don't need it: `gs.rhythm.Beat` already follows the sound
  as heard.
- Everything respects the player's Sound & haptics settings (sound, volume, music). `sfx()` still works as before.
- **Your own sound effects with ZzFX**: design one on the [ZzFX page](https://killedbyapixel.github.io/ZzFX/)
  (move the sliders, press play), copy the list of numbers and play it: `zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17])`.
  `const zap = zsound(...numbers); zap(); zap(1.5)` keeps one to play again (1.5 = higher).
- **Real synths with Tone.js** (for music and rhythm games): `const T = Tone()` in `make()` or `reset()`
  (it loads first), then anything from [tonejs.github.io](https://tonejs.github.io/):
  `new T.PolySynth(T.Synth).toDestination().triggerAttackRelease(['C4', 'E4', 'G4'], '8n')`. It plays
  through the app's volume and mute.

## Controls

`const { Stick, Button, Gestures, route, twoThumb, Keys } = gs.controls;`

Every control takes `down(x, y, id)`, `move(x, y, pressed, id)`, `up(x, y, id)`, just like your game,
so you can pass input straight through. Fingers are tracked by id, so two thumbs work together.

```js
// one stick that appears wherever the thumb lands
const stick = new Stick({ r: 30, floating: true, zone: [0, 0, W, H] });
down: (x, y, id) => stick.down(x, y, id), move: (x, y, p, id) => stick.move(x, y, p, id), up: (x, y, id) => stick.up(x, y, id),
update(dt) { player.x += stick.x * speed * dt; player.y += stick.y * speed * dt; },
draw(c) { /* ... */ stick.draw(c); },

// the standard two-thumb layout: move on the left, aim stick or buttons on the right
const pad = twoThumb(W, H, { right: 'stick' });      // or { right: ['A', 'B'] }
pad.left.x, pad.right.angle, pad.buttons.A.pressed()  // resize(w, h) { pad.layout(w, h); }

// tap / double-tap / hold / swipe, the same feel in every game
const g = new Gestures({ tap(x, y) {}, doubleTap(x, y) {}, hold(x, y) {}, holdEnd(x, y, secs) {}, swipe(dir, vx, vy) {} });
update() { g.update(); }   // needed for hold
```

- `Stick`: `x`, `y` (-1..1, with a dead zone), `mag`, `angle`, `active`. Options `r`, `floating`,
  `zone: [x, y, w, h]`, `dead`, `axis: 'x'` (a slider). `place(x, y, zone)` moves it on resize.
- `Button`: `isDown`, `pressed()` (once per press), `released()`, `heldFor` (seconds).
- `route(a, b, c, fallback)` gives each finger to the first control that wants it. A function at the
  end gets everything else as `fn(type, x, y, id)`.
- `Keys` remembers held keys for desktop: `key: (k, d) => keys.key(k, d)`, then `keys.axis()` for
  arrows / WASD, `keys.held(' ')`.
- Call `release()` on controls in `reset()`, so a finger held at game over doesn't stick.
- Draw sticks and buttons faintly, and keep them off the important part of the screen.

## Finer touch

A phone reads a finger more often than it draws (120 to 240 times a second), and by default a game
gets one `move()` per frame: the newest point. A drawing or tracing game wants them all:

```js
export default { /* ... */ touch: 'fine', make };
move(x, y, pressed, id) { if (pressed) line.push([x, y]); }   // every reading, oldest first, several a frame
```

Curves come out round instead of a chain of straight bits. Leave it out if your game reads one
move's distance as a speed (it would get several short moves instead of one long one).

`api.ahead(id)` is where the finger is heading by the next frame, `[x, y]` in game units, or `null`
when the phone doesn't guess or the finger has stopped. Draw the last bit of a line to it and the ink
stays under the fingertip instead of trailing behind; never use it for hits or scoring (it's a guess).

## Physics

`const { Physics } = gs.physics;` Real 2D rigid-body physics from [Rapier](https://rapier.rs): shapes
spin and tumble, and you can join them with hinges, springs, ropes, welds and sliders. Slingshots,
bridges, wrecking balls, ragdolls, cars, stacking, pinball. Everything is in your game's units
(pixels, y down); angles are radians, clockwise on screen, so `c.rotate(t.angle)` just works.

Phones with WebAssembly SIMD (nearly all from the last few years) get Rapier's SIMD build, which
turns into ARM Neon and steps about 10-20% faster; older phones get the plain build. Same engine,
same results for your game, only one is downloaded. `?nosimd` in the URL tries the plain build in dev.

```js
reset() {
  phys = new Physics({ gravity: 900, walls: [0, 0, W, H] });   // in make() or reset(): the engine loads first
  crate = phys.box(100, 50, 30, 30, { bounce: .2 });           // centre x, y, width, height
  ball = phys.circle(200, 40, 12, { bounce: .6 });
  phys.hinge(null, flipper, 80, 500, { min: -.5, max: .5 });  // null = pinned to the world
  phys.rope(null, 180, 0, ball, 180, 200);                     // a rope from the ceiling to the ball
  phys.onHit((a, b, speed, x, y) => { if (speed > 200) feel.hit(x, y); });
}
update(dt) { phys.step(dt); }
draw(c) { for (const t of phys.things) { phys.path(c, t); c.fill(); } }   // or draw art at t.x, t.y, t.angle
debug(c) { phys.debugDraw(c); }
```

- **Shapes**: `circle(x, y, r)`, `box(x, y, w, h)`, `poly(x, y, [[x, y], ...])` (convex),
  `line([[x, y], ...], { loop })` (fixed ground, hills, ramps), `walls(x, y, w, h)`.
- **Options**: `bounce`, `friction`, `density`, `fixed`, `moving` (you `place()` it: platforms,
  paddles), `sensor` (pickups, goals), `bullet` (fast things), `noSpin` (players), `angle`, `spin`,
  `vx`, `vy`, `drag`, `gravity` (multiplier), `group` (1-14: same group never collide), `tag`.
- **A thing**: read or set `x`, `y`, `angle`, `vx`, `vy`, `spin`; `place(x, y, angle)`,
  `push(ix, iy)` (an instant kick: `push(0, -400)` jumps), `force(fx, fy)` (every frame: thrusters,
  wind), `twist(amount)`, `touching()`, `onGround()`, `remove()`.
- **Joints**: `hinge(a, b, x, y, { min, max, motor })`, `spring(a, b, ax, ay, bx, by, { stiffness, damping })`,
  `leash(...)`, `weld(a, b, x, y)`, `slider(a, b, x, y, dx, dy, { min, max, motor })`,
  `wheel(car, tyre, x, y)`, `rope(a, x1, y1, b, x2, y2, { links })`. Each returns a handle with `remove()`.
- **2D ragdoll**: `rag = phys.ragdoll(x, y, { size: 60, face: 1 })` is a floppy person of 10 hinged
  parts with its hips at `x, y` (`size` = height). `rag.parts.head` / `chest` / `armL` / `foreL` / `legL` /
  `shinL` (and `R`), `rag.list`, `rag.push(vx, vy)` throws it, `rag.draw(c, colour)` or your own drawing
  with `phys.path(c, part)`, `rag.remove()`.
- **Drag with a finger**: `g = phys.grab(x, y)` in `down`, `g.move(x, y)` in `move`, `g.release()` in `up`.
- **Ask the world**: `at(x, y)`, `inBox(x, y, w, h)`, `ray(x1, y1, x2, y2)` → `{ thing, x, y, nx, ny, distance }`,
  `blast(x, y, radius, strength)`. Things made this frame show up in these after the next `step()`.
- The raw engine is there too: `phys.R` and `phys.world` (Rapier works in metres: `phys.toWorld(px)`).
- The old simple engine is still there as `gs.physics.World` (balls and upright boxes, no joints).

## 3D physics

`const { World3D } = gs.physics3d;` Rapier in 3D, in your three.js scene's units (metres, y up). It
keeps your meshes in step with their bodies.

```js
reset() {
  phys = new World3D({ gravity: -20 });
  phys.ground(levelGroup);                                  // any meshes: solid and fixed (floors, walls, ramps)
  crate = phys.box(crateMesh, 1, 1, 1);                     // falls and tumbles; crateMesh follows it
  hero = phys.mover(heroMesh, { radius: .4, height: 1.8 }); // walks into walls, climbs steps and slopes
}
update(dt) { hero.walk(stick.x * 6, stick.y * 6); if (tapped) hero.jump(8); phys.step(dt); }
```

- Bodies: `ball(mesh, r)`, `box(mesh, w, h, d)`, `capsule(mesh, r, height)`, `hull(mesh)` (shaped
  like the mesh), `ground(mesh)`, `floor(y)`. Same options as 2D (`bounce`, `fixed`, `moving`,
  `sensor`, `noSpin`, `group`...), plus `at` for a body with no mesh.
- A body: `pos`, `vel`, `place(x, y, z)`, `setVel()`, `push(x, y, z)`, `twist()`, `touching()`, `remove()`.
- The mover: `walk(vx, vz)` every frame, `jump(speed)`, `grounded`, `feet`, `place()`.
- `ray(from, dir, max)` → `{ thing, point, normal, distance }` (aiming, line of sight, "what's under me"),
  `near(p, r)`, `blast(p, r, strength)`, `onHit((a, b, speed) => ...)`.
- Joints: `hinge(a, b, p, axis, { min, max, motor })`, `pin(a, b, p)` (ball and socket), `weld(a, b)`,
  `spring(a, b, pa, pb)`, `leash(a, b, pa, pb, length)`.

## AI

`const { Crowd, NavGrid, Brain } = gs.ai;` Steering and path finding from [Yuka](https://mugen87.github.io/yuka/),
in your game's 2D units.

```js
reset() {
  crowd = new Crowd();
  bat = crowd.add(50, 50, { speed: 120 }).chase(player);    // anything with x, y
  sheep = crowd.add(200, 300, { speed: 60 }).wander().flock();
  nav = new NavGrid(20, 30, 16, (cx, cy) => level[cy][cx] === '#');
  guard = crowd.add(40, 40).hunt(player, nav);                // goes round the walls, re-plans as you move
}
update(dt) { crowd.update(dt); }                             // read bat.x, bat.y, bat.angle
```

- Steering: `seek`, `arrive`, `flee(target, panic)`, `chase`, `pursue(agent)`, `evade(agent)`,
  `wander()`, `follow(route, loop)`, `separate()`, `flock()`, `stop()`. They combine: `.wander().flee(cat)`.
- `NavGrid`: `path(x1, y1, x2, y2)` → `[{ x, y }, ...]` or null, `sees(x1, y1, x2, y2)` (line of sight),
  `set(cx, cy, wall)` (doors, towers), `blocked(x, y)`.
- `Brain(start, { state: { enter, update(dt), exit } })`: `go(name)`, `is(name)`, `time` in the state.
- All of Yuka is there as `gs.ai.YUKA` (fuzzy logic, goals, vision cones, nav meshes).


### Behaviour trees and wants

`gs.ai.Tree` is a behaviour tree (mistreevous): a short text of what to try, in what order, and when
to give up. Your object gives every action and condition by name. A condition returns true or false;
an action returns `Tree.ok` (done), `Tree.fail`, or nothing (still going, ask again next frame).

```js
const { Tree, Choose } = gs.ai;
reset() {
  guard = new Tree(`root {
    selector {
      sequence { condition [Hurt] action [Flee] }
      sequence while(SeesPlayer) until(Hurt) { action [Chase] action [Strike] }
      sequence until(SeesPlayer) { action [Walk] wait [1000, 2500] }
    }
  }`, {
    Hurt: () => me.hp < 3, SeesPlayer: () => sees(me, player),
    Flee: () => (runFrom(player), far(player) ? Tree.ok : undefined),
    Chase: () => moveTo(player) ? Tree.ok : undefined, Strike: () => (hit(player), Tree.ok),
    Walk: () => moveTo(nextPost()) ? Tree.ok : undefined,
  }, { seed: 3 });
}
update(dt) { guard.update(dt); }
```

Nodes: `sequence`, `selector`, `parallel`, `race`, `all`, `lotto [2, 1]` (weighted random), `repeat`,
`retry`, `flip`, `succeed`, `fail`, `wait [ms]` or `wait [min, max]` (game time), `branch [Name]`
(subtrees), and guards on any node: `while(Cond)` / `until(Cond)` cut a running branch short when they
change. A selector doesn't look back up its list while a later branch is running, so put a guard on each
branch for whatever should interrupt it (above: seeing the player stops the walk, getting hurt stops the
chase). `tree.path()` lists what's running (handy as a debug label). A finished tree starts again at the top.

`gs.ai.Choose` is utility AI: each want scores 0 to 1 from one or more things (multiplied, shaped by an
optional curve), and the highest wins, with a little stickiness so it doesn't flicker:

```js
const want = new Choose({
  eat: [() => 1 - me.food, Choose.quad],
  sleep: () => me.tired,
  fight: { score: [() => closeness(player), () => me.hp / 10], weight: 1.5 },
}, { stick: .1 });
const goal = want.pick();   // 'eat', 'sleep' or 'fight'; want.scores has them all
```

Curves: `Choose.linear`, `quad`, `root`, `invert`, `logistic(mid, k)`, `step(at)`. Use a Choose inside a
tree action, or to pick a `Brain` state.

### Swarms: thousands of flockers

`gs.ai.Swarm` moves hundreds or thousands of simple creatures that flock: shoals, bats, bees,
starlings, a zombie horde. On top-end phones with WebGPU the moving is done on the graphics chip
(a compute shader); everywhere else it runs on the CPU with a spatial grid. Same rules either way,
so the game never needs to know (`swarm.gpu` says which). If the chip turns out too slow, or goes
away, it carries on on the CPU by itself.

```js
const { Swarm } = gs.ai;
reset() { fish = new Swarm({ count: Math.min(3000, Swarm.max()), w: W, h: H, speed: 70 }); }
update(dt) {
  fish.pull(food.x, food.y);                                   // come here (up to 8 pulls a frame)
  fish.pull(shark.x, shark.y, { strength: -4, radius: 90 });   // keep away from here
  fish.update(dt);
  for (const i of fish.near(shark.x, shark.y, 12)) { fish.kill(i); api.score(++score); }
}
draw(c) { for (let i = 0; i < fish.count; i++) if (fish.alive[i]) drawFish(c, fish.x[i], fish.y[i], fish.angle(i)); }
```

Options: `count` (up to 8192), `w`, `h`, `speed`, `sight` (how far each sees its neighbours, 24),
the flocking urges `separate` (1.6), `align` (1) and `cohere` (.8), `wander` (.3), `edges` (`'wrap'`
or `'bounce'`), `seed`. Also `obstacle(x, y, r)`, `place(i, x, y)`, `revive(i, x, y)`, `living`, and
`order()` (0 when they head all over, 1 when they all head one way). `Swarm.max()` is about how many
the phone moves smoothly: 8192 with the graphics chip, 2000 without. On the GPU the positions you
read are a frame or two behind, which nobody sees; don't use a swarm for exact, frame-perfect rules.
For a few clever agents (chase, patrol, paths) use `Crowd` instead.
## Maths

`const { rng, daily, noise2, fbm, vec, overlap, Grid, Timers } = gs.math;`

- `rng(seed)` → `r()` 0..1, `r.int(a, b)`, `r.range(a, b)`, `r.pick(list)`, `r.shuffle(list)`, `r.chance(p)`.
  Same seed, same numbers: levels everyone shares.
- `daily('my-game')`: today's seed (the same for every player all day). `rng(daily('my-game'))` makes a daily challenge.
- `noise2(x, y)`, `noise3(x, y, z)`: smooth noise -1..1 (simplex-noise) for hills, caves, clouds,
  wobble. `fbm(x, y, octaves)` is rougher and more natural. `noiseSeed(seed)`, `makeNoise(seed)`.
- `vec.add / sub / scale / len / dist / norm / dot / angle / fromAngle / rotate / lerp` on `{ x, y }`,
  `angleDiff(a, b)`, `wrap(v, max)`.
- `overlap.circles / boxes / circleBox / pointInBox / pointInCircle / lineCircle`.
- `Grid(cell)`: find nearby things fast (hundreds of bullets): `clear()`, `add(t)`, `near(x, y, r)`.
- `Timers`: `after(sec, fn)`, `every(sec, fn)`, `update(dt)`. They run on game time, so they stop
  when the game pauses (setTimeout doesn't).

## Effects

`const { Feel } = gs.effects;` The sight, sound and buzz of common moments in one call.

```js
const feel = new Feel();                 // new Feel({ pixel: true }) for pixel styles
reset()    { feel.clear(); }
update(dt) { feel.update(dt); if (feel.frozen) return; }
draw(c)    { feel.begin(c); /* the world */ feel.end(c, W, H); }
feel.coin(x, y); feel.hit(x, y, { power: .8 }); feel.boom(x, y, { size: 1.5 }); feel.hurt(x, y);
feel.jump(x, y); feel.land(x, y, speed); feel.shoot(x, y); feel.powerup(x, y); feel.combo(n, x, y);
feel.score(x, y, 50); feel.win(x, y); feel.lose(); feel.click(); feel.play(zzfxNumbers);
```

`feel.juice` is the Juice underneath, for your own particles and tweens. `feel.end()` undoes the shake
(a canvas `restore()`) but keeps the text settings you set while drawing the world (`textAlign`,
`textBaseline`, `font`), so a HUD drawn after it doesn't need to set them again.

## The score badge

The app draws the score at the top centre of the game. `api.scoreArea()` says where, in your game's
units: `{ x, y, w, h, bottom }`, wide enough for a 4-digit score. Keep your HUD out of it: put lives
on the left, a timer on the right, or a bar below it at `api.scoreArea().bottom + 4`. The box moves
with the style and the screen size (folding a phone changes it), so read it while drawing; it's cheap
(measured at most four times a second). Pixel styles get whole pixels.

```js
draw(c) {
  const top = api.scoreArea().bottom + 4;
  drawTimerBar(c, 10, top, W - 20);    // under the badge, not behind it
}
```

## Pixel text and sprites

`const { text, measure, sprite, anim, tiles } = gs.pixel;`

```js
text(c, 'SCORE 120', 4, 4, { size: 2, color: '#fff' });                       // 3×5 font, always crisp
text(c, 'GAME OVER', W / 2, 80, { font: 'big', align: 'center', outline: '#000' });   // 8×8 font
text(c, 'Find the key', 4, 20, { font: 'tiny' });                             // four more pixel fonts, below
const hero = sprite(`
  ..kk..
  .kyyk.
  ..kk..`, { k: '#000', y: '#fd0' });     // one letter per pixel, '.' is clear
hero.draw(c, x, y, { scale: 3, flip: true, outline: '#fff' });
const red = hero.recolor({ y: '#f33' });
const walk = anim([frameA, frameB], palette, 8);  walk.draw(c, x, y, time, { scale: 3 });
```

Sprites and text are drawn once and cached. `sprite.solid(px, py)` is for pixel-perfect hits;
`tiles(art, palette, 8, 8)` cuts a tile sheet.

The pixel fonts for `text(c, str, x, y, { font })`. Each is drawn at the one size its pixels sit on
the grid, so it is always crisp; `size: 2` doubles it. `text()` returns the width it drew and
`measure(str, font)` gives `{ w, h }` at size 1 without drawing.

| `font` | Capitals | Looks like | Small letters |
| --- | --- | --- | --- |
| `'small'` (the default) | 5 high, 3 wide | the tiniest: scores and labels | no (capitals only) |
| `'tiny'` | 5 high | tiny and narrow, fits a sentence on a 160 wide screen | yes |
| `'silkscreen'`, `'silkscreen bold'` | 5 high | wide, clean capitals | no (small capitals) |
| `'big'` | 7 high | arcade letters | yes |
| `'jersey'` | 10 high | tall scoreboard numbers and titles | yes |
| `'terminal'` | 14 high | an old computer terminal | yes |

`'small'` and `'big'` are always there. The other four are fetched the first time a game names them
(a few kilobytes each) and the text draws in the 8×8 font for the moment before one arrives; call
`gs.fonts.use('Tiny5')` in `make()` or `reset()` if the first frame must already have it (see
[Fonts](#fonts) for the names).

### Even pixels and the LCD look

Pocket, Color and Advance games are drawn at exactly `w` × `h` and scaled up by the app with every
game pixel the same size on any screen (no fat and thin columns, no shimmer when things scroll).
Nothing to do in the game: draw at whole-pixel positions as before.

`lcd: true` in the definition adds the look of an old handheld's screen: fine lines between the
pixels and a little ghosting (fast things leave a short trail). `lcd: { grid: .3, ghost: .45 }` sets
how strong each is (grid 0 to .6, ghost 0 to .85; `false` turns one off). It's a look, so it's the
game's choice: left out, the picture is clean. Ghosting can hide a blinking sprite's off frames, so
check anything that flickers on purpose.

## Fonts

`const { font, use } = gs.fonts;`

The app ships 13 display fonts next to Rubik (its own text), so a title can look like the game it
belongs to and still look the same on every phone. All are open-licence (SIL OFL 1.1) and each one's
file is fetched only the first time a game names it.

```js
reset() { use('Bangers', ['Fredoka', 700]); ... }      // optional: "Loading…" until they are in
draw(c) {
  c.font = font('Bangers', 34); c.fillText('KA-POW!', x, y);
  c.font = font('Fredoka', 16, 700); c.fillText('Tap to bounce', x, y + 30);
}
```

| Name | Looks like | Weights |
| --- | --- | --- |
| `Rubik` | the app's own text: plain and friendly | 400, 500, 700, 800 |
| `Bangers` | comic book shout | 400 |
| `Fredoka` | round and friendly | 400, 700 |
| `Titan One` | chunky cartoon title | 400 |
| `Bungee` | arcade sign, block capitals | 400 |
| `Orbitron` | science fiction | 500, 800 |
| `Creepster` | spooky | 400 |
| `Pirata One` | pirates and castles | 400 |
| `Rye` | wild west | 400 |
| `Monoton` | neon tubes | 400 |
| `Black Ops One` | army stencil | 400 |
| `Cinzel` | epic fantasy capitals | 400, 700 |
| `Patrick Hand` | handwritten note | 400 |
| `Courier Prime` | typewriter | 400, 700 |

- `font(name, size, weight)` gives the string for `c.font` (`'400 34px "Bangers", Rubik, sans-serif'`)
  and starts the font loading if it isn't in yet. Until it is, the text draws in Rubik, so nothing
  breaks; a card waiting in the feed is drawn again when the font arrives. The nearest weight the
  font has is used, names can be in any case, and an unknown name gives Rubik.
- `use(...names)` in `make()` or `reset()` waits for the fonts before the first frame, the way the
  other lazy parts do (the app shows "Loading…" once). Use it when text is measured to lay things
  out, or when a title in the wrong font for a moment would show. A misspelt name is an error that
  lists the fonts.
- `ready(name, weight)` says whether a font is in. `gs.fonts.list` is every font:
  `{ name, look, weights, pixel }`.
- The pixel fonts (`Press Start 2P`, `Silkscreen`, `Tiny5`, `Jersey 10`, `VT323`) are in the list too.
  In the pixel styles draw them with `gs.pixel.text` ([above](#pixel-text-and-sprites)), which keeps
  every pixel hard; `font('VT323', 25)` on a smooth Phone game is fine for a retro label.
- Fonts that come with the phone (`Arial`, `Courier New`, `Impact`, `Georgia`...) look different on
  every phone and some are missing on Android: name one of these instead. Plain `sans-serif` and
  `monospace` are fine as they are. Emoji are the phone's own too, so they differ between phones.

## 2D materials, slabs, water and stickers

`const { material, slab, water, sticker } = gs.gfx;`

Looks for the smooth 2D styles, made in code (no image files): six materials that tile without a seam,
blocks of them with lit edges and soft shadows, water with light moving on it, and stickers, which keep
any drawing as a picture with an outline, a glow and a shadow already on it.

```js
reset() {
  wood = material('wood', { color: '#a9703f', planks: 4 });     // made once (some tens of ms), then remembered
  coin = sticker(40, 40, g => { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(20, 20, 16, 0, 7); g.fill(); },
    { outline: '#5a3d00', glow: '#fff3a0', shadow: true });
}
draw(c) {
  slab(c, 20, 500, 320, 60, wood, { r: 8 });                    // a lit, rounded plank with a soft shadow
  c.fillStyle = material('stone').at(x, y); c.beginPath(); c.arc(x, y, 30, 0, 7); c.fill();   // any shape
  water(c, 0, 560, W, 80, t);                                   // t: the game's own clock, in seconds
  coin.draw(c, x, y, { scale: 1 + .1 * Math.sin(t * 6), angle: t });
}
```

| Material | Starts as | Its own options |
| --- | --- | --- |
| `paper` | cream, with fibres | |
| `wood` | brown, grain running across | `planks: 4` (boards down the tile, each with its own grain) |
| `stone` | grey rock with cracks | `blocks: 4` (rows of blocks with mortar; even numbers) |
| `metal` | brushed steel | |
| `cloth` | blue weave | `threads: 32` (across the tile) |
| `water` | blue, with a still net of light | (`water()` below moves it) |

- `material(name, { color, seed, scale, contrast })` gives the material; the same options give the same
  one back, so asking again in `draw()` is cheap, but make them in `make()` or `reset()` so the first
  frame doesn't wait. `color` is its main colour, `seed` a different piece of it, `scale: 2` makes the
  grain twice as big (one tile covers 128 game units at 1), `contrast: 0` to `2` flattens or deepens it.
- `c.fillStyle = m.at(x, y)` fills any shape with the texture's corner at (x, y), so a crate that moves
  carries its grain with it. `m.pattern` is the same fixed at 0, 0 (a floor that things move over).
  `m.tile` is the picture itself, for `drawImage`.
- `slab(c, x, y, w, h, material, { r, bevel, shadow, tint, anchor })` draws a block of it: rounded
  corners (`r`, 6), a lit top left edge and dark bottom right (`bevel`, 2; 0 for flat), a soft shadow
  (`shadow: false` to leave it out, or a number for how far it drops) and `tint: '#ff000040'` to wash a
  colour over it. `anchor: [0, 0]` cuts every slab from one big sheet instead of each carrying its own.
- `water(c, x, y, w, h, t, { color, deep, light, strength, scale, flow })` fills a rectangle with water
  and a net of light that drifts. For a pond or river of another shape, `c.clip()` to the shape first.
  This is a look; for water that pushes things, see `gs.flow`.
- `sticker(w, h, draw, { outline, width, glow, glowSize, shadow, shadowBlur, shadowY })` runs
  `draw(g, w, h)` once into a picture as sharp as the screen, adds the outline, glow and shadow, and
  `sticker.draw(c, x, y, { scale, angle, alpha, flip, anchor })` is then one `drawImage` however much
  went into it. Use it for anything drawn many times or with looks that are slow every frame
  (`shadowBlur`, gradients, text with an outline). `sticker.redraw()` after what it shows changes.
- These are for the Phone style and for 2D drawn over 3D. Pocket, Color and Advance games keep to their
  palettes and whole pixels.

## Sketchy shapes and ink

`const { Sketch, Ink, ink } = gs.sketch;` (Rough.js and perfect-freehand; loads on first use)

A hand-drawn look: shapes that look sketched with a pen, and ink lines that swell and taper.

```js
reset() { pen = new Sketch({ stroke: '#2b2b2b', strokeWidth: 2, roughness: 1.2 }); }
draw(c) {
  pen.rect(c, 40, 80, 120, 60, { fill: '#ffd23f' });                      // wobbly outline, hatched fill
  pen.circle(c, 200, 110, 28, { fill: '#4fc3ff', fillStyle: 'solid' });
  pen.line(c, 20, 200, 340, 204);
}
```

- Shapes: `rect(c, x, y, w, h)`, `circle(c, x, y, r)`, `ellipse(c, x, y, rx, ry)`, `line(c, x1, y1, x2, y2)`,
  `poly(c, points)` (closed), `lines(c, points)` (open), `curve(c, points)`, `arc(c, x, y, r, from, to, { closed })`,
  `path(c, x, y, 'M0 0 L40 0 ...')`. Points are `[x, y]` or `{ x, y }`.
- Options, for the pen and again for one shape: `stroke` (or `'none'`), `strokeWidth`, `fill`,
  `fillStyle` (`'hachure'`, `'solid'`, `'zigzag'`, `'cross-hatch'`, `'dots'`, `'dashed'`, `'zigzag-line'`),
  `hachureGap`, `hachureAngle`, `fillWeight`, `roughness` (0 is a ruler, 1 a steady hand, 3 a shaky
  one), `bowing`, `dash: [on, off]`, `seed` (a different hand).
- A shape is worked out once and remembered, wherever it is drawn, so moving it is free and its wobble
  stays put instead of crawling. A shape that changes size is worked out again at each new size (sizes
  are kept to half a unit), so grow things in steps or keep them in a `gs.gfx.sticker`.
- `new Sketch({ boil: 8 })` with `pen.update(dt)` each frame redraws the wobble 8 times a second: the
  "line boil" of hand-drawn cartoons.

Ink is for lines the player draws (and any line of many points):

```js
down(x, y) { line = new Ink({ size: 10, color: '#1b1b3a' }); line.add(x, y); }
move(x, y, pressed) { if (pressed) line.add(x, y); }
up() { line.end(); }
draw(c) { line.draw(c); }                 // touch: 'fine' in the definition gives it every reading of the finger
```

- `Ink` options: `size` (the widest the line gets), `thinning` (.5: a fast line is thinner; 0 for an
  even line), `smoothing`, `streamline` (.5: how much the line lags to iron out a shaky hand), `taper`
  (a length, or `{ start, end }`: the ends thin to a point), `color`.
- `line.outline()` is the stroke's shape as points, `line.hit(x, y, r)` says whether a point is on it,
  `line.clear()` starts again. `ink(c, points, options)` draws a stroke in one call; for a line through
  a few far-apart points add `spacing: 6`, which adds points in between so it follows them.
- With `gs.strokes` (`Stroke`, `Shapes`, `toPhysics`) the same points can be recognised as a shape or
  turned into ground; this kit only makes the line look inked.

## Icons

`const { icon } = gs.icons;` (loads on first use)

528 drawn icons that look the same on every phone, where an emoji is a different picture on each one:
weapons, hearts, keys, chests, potions, animals, food, tools, weather, vehicles, buildings, plants,
sports, music, cards, dice, chess pieces and buttons. They are from the Game Icons set
([game-icons.net](https://game-icons.net)) by Lorc, Delapouite and contributors, CC BY 3.0, credited in
the app's licence list, so a game needs to show nothing.

```js
icon(c, 'sword', x, y, 32);                                         // centred on x, y, 32 units across, white
icon(c, 'hearts', x, y, 24, { color: '#ff5470', outline: '#000' });
icon(c, 'key', x, y, 16, { pixel: true, color: PAL[3] });           // hard pixels for the pixel styles
```

- Names are the set's own (`'broadsword'`, `'health-potion'`, `'pine-tree'`), and about 100 plain words
  work too: `sword`, `shield`, `bow`, `bomb`, `heart`, `coin`, `gem`, `star`, `key`, `lock`, `chest`,
  `potion`, `skull`, `ghost`, `fire`, `ice`, `water`, `bolt`, `sun`, `moon`, `cloud`, `tree`, `flower`,
  `apple`, `fish`, `cat`, `dog`, `dragon`, `rocket`, `castle`, `crown`, `trophy`, `flag`, `map`, `dice`,
  `card`, `play`, `pause`, `settings`, `sound`, `mute`, `home`, `trash`... `gs.icons.names` lists every
  name, `gs.icons.words` the plain words, `gs.icons.find('potion')` searches, `has(name)` checks.
- Options: `color` (white), `outline` and `width`, `angle`, `alpha`, `flip`, and `pixel: true` for the
  pixel styles (every pixel fully on or off, in exactly the colours given; `size` is then whole game
  pixels, and simple icons read best: 16 and up).
- An icon is drawn once at the size and colour asked for and remembered, so drawing it is one
  `drawImage`; a pulsing icon is scaled, not redrawn. `icon()` returns false for a name it doesn't have.
- `path(name)` gives the icon as a `Path2D` on a 512 by 512 grid, to fill with a gradient or a
  `gs.gfx` material, or to clip with.
- To add an icon to the app: put its game-icons.net name in `scripts/icons/names.json` and run
  `node scripts/icons/build.mjs` (shared code, so in its own PR).

## Game controllers

A pad already works in every game: the d-pad and left stick are the arrow keys, A is Space, B is
`x`, X is `z`, Y is `c`, Start pauses. In the feed, A plays and up / down move between games. For
analog control:

```js
const { pad, pads, rumble } = gs.pad;
const p = pad();                         // null with no controller
if (p) { ship.vx = p.x * 200; if (p.pressed('a')) fire(); if (p.rt > .5) boost(); }
rumble(.6, 200);
```

`p.x, p.y, p.rx, p.ry` (sticks, with a dead zone), `p.lt, p.rt` (triggers), `held / pressed /
released(name)` for `a b x y l r start select up down left right`. `pads()` lists every controller.

## Motion moves

`const { Moves } = gs.moves;`

```js
reset() { moves = new Moves(); moves.on('swing', m => slash(m.dir, m.power)); moves.on('flip', () => flip()); }
update(dt) { moves.update(); }   // moves are handed to your handlers here
```

Moves: `swing` (`dir` left / right / up / down), `punch`, `throw`, `flip` (forward / back),
`twist` (left / right), `knock`, `shake`, and `any`. Each has `power` 0..1. `new Moves({ sensitivity: 1.3 })`
fires more easily. On iPhones the player is asked for motion access when they tap Play.

## Game objects

`const { Things } = gs.things;` A light list of your game's objects with tags, so collisions and
"what's nearest" are one line. They stay your own plain objects: you move and draw them.

```js
reset() { things = new Things(); player = things.add({ x: 180, y: 600, r: 14 }, 'player'); }
update(dt) {
  things.each('bullet', b => { b.y -= 400 * dt; });
  things.hits('bullet', 'enemy', (b, e) => { things.kill(b); if (--e.hp <= 0) things.kill(e); });
  const coin = things.hit(player, 'coin'); if (coin) { things.kill(coin); score++; }
  things.cull(0, 0, W, H, 20, 'bullet');      // gone off screen
  things.update(dt);                          // calls each thing's own update(dt) if it has one, drops killed ones
}
draw(c) { for (const e of things.all('enemy')) drawEnemy(c, e); }
```

- Shapes: `r` (circle), `w` + `h` (box centred on x, y) or neither (a point). A thing can have several tags.
- `all(tag)`, `count(tag)`, `first(tag)`, `each(tag, fn)`, `hit(obj, tag)`, `hitsOf(obj, tag)`,
  `hits(tagA, tagB, fn)` (fast with hundreds), `near(x, y, r, tag)`, `nearest(x, y, tag)`, `tag()`, `untag()`, `is()`.
- `reuse(tag, make, init)` recycles killed objects (less garbage in busy games).
- 3D games: `new Things({ plane: 'xz' })` uses x and z.

## Rounds and scenes

**Waiting for the first touch.** After Play, the round starts at once; a game where things fall,
score or end on their own should wait for the player's first tap, or it scores with no input (the
PR check's bot notices). `Ready` is that wait in one object:

```js
const ready = new gs.rounds.Ready();            // in make(); { eat: false } lets the first tap also act
reset()      { ready.reset(); ... }
update(dt)   { if (!ready.update(dt)) return; ...the game... }
down(x, y)   { if (ready.go()) return; ... }    // the starting tap does nothing else
key(k, down) { if (down && ready.go()) return; ... }
draw(c)      { ...the game...; ready.draw(c, W, H); }   // a pulsing "Tap to start" (or draw your own)
```

`ready.waiting`, `ready.t` (seconds waited, for an idle animation), `ready.since` (seconds playing).
`ready.draw(c, W, H, { text, x, y, color, size, pixel: true })`: pixel styles blink gs.pixel text in
a palette colour you pass. Call `ready.go()` from a tilt or a shout to start the same way.

`const { Scenes, Levels } = gs.rounds;` The parts of a round (intro, play, clear, boss) as scenes
with their own update and draw, and timed changes between them that you draw your own way.

```js
reset() {
  levels = new Levels(LEVELS, { loop: true });
  scenes = new Scenes({
    intro: { enter() { build(levels.now); }, update(dt, s) { if (s.time > 1.2) s.go('play', { fade: .4 }); } },
    play:  { update(dt, s) { step(dt); if (cleared()) s.go('clear'); }, draw: drawWorld },
    clear: { enter() { feel.win(); }, update(dt, s) { if (s.time > 1.5) { levels.next(); s.go('intro', { fade: .6 }); } } },
  }, 'intro');
}
update(dt) { scenes.update(dt); }
draw(c) { scenes.draw(c); if (scenes.changing) { c.fillStyle = `rgba(0,0,0,${scenes.cover})`; c.fillRect(0, 0, W, H); } }
```

- `go(name, { fade, data })`, `after(sec, name)`, `is(name)`, `time`, `prev`, `data`, `changing`,
  `progress` (0 → 1) and `cover` (0 → 1 → 0) for your own fade, wipe or iris. `input('down', x, y)` passes taps on.
- `Levels(list, { loop })`: `now`, `index`, `number`, `lap` (repeats, to make them harder), `next()`, `last`.

## Spawning and pacing

`const { Spawner, Waves, Director, ramp } = gs.pacing;` When things appear and how hard it gets.
The kit says when; your game makes the thing.

```js
spawner = new Spawner({ every: 1.2, fastest: .35, over: 60, jitter: .25 });   // speeds up over a minute
spawner.update(dt, () => things.add(makeBat(), 'enemy'));

waves = new Waves([{ count: 6, every: .7, kind: 'bat' }, { count: 1, kind: 'boss' }], { breather: 3, loop: true });
waves.update(dt, kind => spawn(kind), things.count('enemy'));   // next wave once this one is beaten
// waves.number, waves.state ('spawning' | 'fighting' | 'breather' | 'done'), waves.breatherLeft

director = new Director({ over: 90 });      // difficulty 0..1 that eases off when the player is struggling
director.hurt(1); director.scored(1); director.update(dt); gap = director.pick(1.4, .4);
```

## Aim assist

`const { AimAssist } = gs.aim;` The help phone shooters give thumbs: sticky aim, a gentle pull onto
targets and optional auto fire. You still own the gun, the shots and the crosshair.

```js
assist = new AimAssist({ cone: 12, range: 300, pull: .5, slow: .45, autoFire: .15 });
aim += assist.turn(stickX * 3 * dt);                                   // turning slows over a target
const a = assist.update(dt, gun, aim, things.all('enemy'), { sees: nav && ((x1, y1, x2, y2) => nav.sees(x1, y1, x2, y2)) });
aim = a.angle; if (a.fire) shoot();                                    // a.target, a.on, a.lock (0..1)
```

3D: pass `{ x, y, z }` for the gun and a direction vector for the aim; read `a.dir`. `{ lead: bulletSpeed }`
aims ahead of moving targets (with `vx`, `vy`). `assist.strength = 0` turns it off.

## Enemy senses

`const { Senses, Noises } = gs.senses;` What a guard knows: sight cones that walls block, hearing,
memory of where you were, and a mood. You decide what the guard does and how the cone and "?" look.

```js
g.senses = new Senses({ range: 120, fov: 80, spotTime: .9, memory: 4 });
noises.make(player.x, player.y, running ? 70 : 25);
const s = g.senses.update(dt, g, player, { sees: (x1, y1, x2, y2) => nav.sees(x1, y1, x2, y2), noises, light });
if (s.mood === 'alert') chase(s.lastSeen); else if (s.mood !== 'calm') walkTo(s.lookAt);
noises.update(dt);
```

- Guards need `x`, `y`, `facing` (radians); the player `x`, `y` (`hidden: true` in a bush).
- Moods: `calm` → `suspicious` → `alert` → `searching` → `calm`. `awareness` (0..1) fills a meter.
- `alert(x, y)`, `suspect(x, y)`, `Senses.alertAll(guards, x, y, radius)` (one guard raises the alarm).
- 3D games: pass x and z as x and y.

## Camera rigs

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

## 3D path finding

`const { NavMesh3D } = gs.nav3d;` (loads when first used.) Finds paths round any 3D level, using a
walkable map made from your level's meshes ([Recast & Detour](https://github.com/isaac-mason/recast-navigation-js)).

```js
reset() {
  nav = new NavMesh3D([floor, walls, crates], { radius: .4, height: 1.8, climb: .4, slope: 45 });
  crowd = nav.crowd(); g.agent = crowd.add(g.mesh.position, { speed: 3.5 });
}
update(dt) { g.agent.goto(hero.position); crowd.update(dt); g.mesh.position.copy(g.agent.position); }
```

- `path(a, b)` → corners `[Vector3]` (or `[]`), `reachable(a, b)`, `closest(p)`, `random(p, radius)`.
- Agents: `goto(p)`, `stop()`, `place(p)`, `arrived()`, `position`, `velocity`, `speed`, `remove()`.
- Set `mesh.userData.noNav = true` on things that shouldn't count (decorations, the player).
- While a card is loading, the map is made in a background worker and the card waits for it, so a big
  level doesn't hold the feed still. A new round's map (a level that changes) is made on the spot.

## Living characters and ragdolls

`const { lookAt, reach, Steps, Wobble } = gs.characters;` Motion for characters you build from parts
(groups with their origins at the joints, limbs hanging down their own -y, facing +z).

```js
lookAt(guard.head, hero.position, dt, { max: 1.1 });          // null looks ahead again
reach(thigh, shin, steps.feet[0].pos);                        // two-bone IK: bends the knee
steps = new Steps({ feet: [[-.15, 0], [.15, 0]], stride: .45, ground: (x, z) => 0 });
steps.update(dt, hero);                                       // feet[i].pos, .lifting, .landed (footstep sound)
wobble.hit(1); wobble.update(dt); body.rotation.x = wobble.value * .4;   // springy hit reaction
```

In 3D, ragdolls are part of 3D physics (2D games use `gs.physics` `phys.ragdoll(x, y)`, above). On a
character with a `gs.poses` rig (`figure()`, `person()`, `gs.models.human()`), `rag = phys.ragdoll(guard, { push: [0, 2, -5] })`
is a jointed ragdoll: eleven bodies (hips, chest, head, upper and lower arms and legs) joined where the
joints are, each turning only as far as a real one does (a knee bends one way; a head can't spin round),
and the character stays one skinned mesh whose bones follow them. `rag.push(x, y, z)`, `rag.hit('head', x, y, z, point)`,
`rag.part('armL')`, `rag.still()`, `rag.remove()` (it stays as it lies). It has muscles: `rag.drive({ armL: [-1.2, 0, .3], foreL: [-.6, 0, 0] }, .6)`
turns its joints towards a pose (the rig's angles from rest; strength 0 limp to 1 firm), so a falling body can
throw its arms out; `rag.relax()` lets go. A character you built from loose parts with no rig:
`phys.ragdoll(guard, { limbs: [head, armL, armR, legL, legR], push })` (each limb swings at its origin).

### People who react

`const { Reactions } = gs.characters;` One for each character with a rig. It decides nothing about your
game: you tell it what happened to the body, and it moves the body the way a body moves.

```js
react = new Reactions(hero, { world: phys, mover });   // world: falls are a real ragdoll; without one they are acted
update(dt) {
  if (!react.busy) { /* steer hero as usual */ }
  hero.rig.update(dt, { speed }); react.update(dt);    // every frame, after the rig
  if (react.stepped) sounds.step(); if (react.landed) feel.land(x, y);   // true for one frame each
}
react.hit([0, 0, -2.5], bullet.point);    // a change of speed (metres a second, world) at a world point
react.blast(bomb.position, 9, 6);         // strength at the centre, radius
react.trip();                             // legs caught: a stumble, or a fall at a run
react.fall(null, { limp: true });         // knocked out or shot: stays down until react.getUp({ revive: true })
react.brace(grenade.position, .8);        // arms up against something coming
```

- **How hard decides what happens.** A light blow only makes the part it landed on give (a head snaps back, a
  shoulder turns, a knee buckles). A harder one sets the body **staggering**: it takes real steps to get its
  feet back under its weight, as many as it needs, and you have it back when it is steady. Harder still, a
  blow to the legs, too many steps, or no ground where the next step must go (a ledge), and it **falls**:
  a ragdoll that throws its arms towards the ground, lands (`react.landed`, `react.impact` in metres a
  second), lies a moment (`rest`, default 1.4 s), and **gets up** from its front or its back, facing the way
  a person getting up from there would.
- `react.state` is `'steady'`, `'stagger'`, `'falling'`, `'down'` or `'rising'`; `react.busy` is true for all
  but the first; `react.down` while it lies. `react.reset()` in `reset()` stands it up at once.
- `steady: 2` is a brute who shrugs off what fells a person; `.5` someone already hurt. Change `react.steady`
  as health drops.
- With `world` it also puts its hands out against a wall it is about to run into, and is knocked back off it
  at a run (`walls: false` turns that off; `level` is what counts as a wall, as for `gs.sound.Ears`).
  `ground: (x, z) => height` for uneven floors and edges (the height of whatever is down there; `-Infinity` for a pit).
- With `mover` (the `phys.mover()` that walks the character) a stagger stops at walls, the mover stands aside
  while the body is down so nothing bumps into an empty capsule, and it is put back where the body gets up.
- Without `world`, falls are acted (forwards onto the hands or back onto the seat) and the body gets up the
  same way. On a desktop a falling body measured about a tenth of a millisecond a frame, physics and all, and
  one standing a few hundredths (not yet measured on a phone).

### Skinned people, faces and lip sync

`person()` is one smooth mesh over a skeleton (a three.js `SkinnedMesh`): elbows, knees, the waist and
the neck bend like skin, and the whole person is one draw call. It has the same joints as `figure()`,
so the same `Rig` poses drive it. Every 3D style can use it, on WebGL and WebGPU.

```js
const { person } = gs.poses;
hero = person({ body: '#c0392b', skin: '#e0ac69', hair: '#2b1a10', sleeves: 'short', girth: 1, mat: c => pbr(c) });
view.add(hero);                                   // hero.rig, hero.face, hero.mesh, hero.bones

// blend spaces (blend trees): the poses either side of the value, every cycle in step so feet don't slide
hero.rig.blend({ idle: 0, walk: 1.4, run: 4, sprint: 7 }, speed);
hero.rig.blend2({ idle: [0, 0], walk: [0, 1], back: [0, -1], strafeL: [-1, 0], strafeR: [1, 0] }, sideways, forwards);
hero.rig.upper(aiming ? 'aim' : null);            // still layers on top
hero.rig.update(dt, { speed });
hero.rig.plant((x, z) => land.height(x, z), hero); // foot IK: feet on steps and slopes (also works on figure())
hero.rig.play('jump');                            // back to one pose, faded
```

Faces are blend shapes (morph targets): `open`, `wide`, `round` (the mouth), `smile`, `frown`,
`surprise`, `blink`. `Face` eases them, blinks by itself and moves the mouth to speech:

```js
hero.face.say('Over here!', { pitch: 1.2 });     // speaks with gs.sound.say; the mouth follows the words
hero.face.set('smile', 1);                        // eases in; set('smile', 0) lets go
hero.face.mouth(mic.level());                     // or a mouth driven by anything (null stops)
hero.face.update(dt);                             // every frame
```

The mouth moves even when the phone is muted, so always show the words on screen too. Your own meshes
can have shapes: `shapes(geometry, { puff: (p, out) => out.set(0, p.y * .2, 0) })`, then
`new Face(mesh).set('puff', 1)` (`const { Face, shapes, visemes } = gs.characters`). `visemes(text)`
gives the mouth shapes over time for a line, for mouths you draw yourself.

## 3D extras

`const { text3d, Particles3D, outline, glitch, trails, focus, pixelate } = gs.fx3d;` (make them in
`make()` or `reset()`: they load first).

- `text3d('PLAYER 1', { size, color, font, outline, outlineColor, align, maxWidth, face: true })`:
  sharp text in the 3D world at any size and distance, in any 3D style. `font` is `'bold'`, `'regular'`,
  `'pixel'` or any `gs.fonts` name (`'Bangers'`, or `['Fredoka', 700]` for a weight); `size` is the height
  of a capital letter in world units and `outline` a width in the same units; `maxWidth` wraps at
  spaces; `face: true` always faces the camera. Change `label.text = 'NEW'` (or `color`, `size`...) and
  call `label.sync()`; `label.width` and `label.height` say how big it came out. (Each letter is kept as
  a distance field made on the phone with [TinySDF](https://github.com/mapbox/tiny-sdf), so one small
  picture per font serves every size.)
- `fx = new Particles3D(scene)`, then `fx.fire(pos)`, `fx.smoke(pos)`, `fx.magic(pos)`, `fx.snow(pos)`
  (keep going: `.stop()`, `.remove()`, `.at(pos)`) and `fx.boom(pos)`, `fx.sparks(pos)` (one-off), or
  your own with `fx.make(pos, { life, speed, size, colors, rate, burst, shape, gravity, glow... })`.
  Call `fx.update(dt)` every frame; `fx.count` is how many are flying. `new Particles3D(scene, { seed: 7 })`
  makes the same particles every time (replays). These are small effects (tens to hundreds of dots,
  moved by the kit and drawn in two draw calls); for thousands, Next Gen has `gs.hd.GPUParticles`.
- Next Gen views only: `outline(view, objects, { color })`, `glitch(view)`, `trails(view, .85)`,
  `focus(view, { focus: 10 })` (depth of field), `pixelate(view, 4)`. Each returns a pass with `remove()`
  whose numbers you can change while it runs (`pass.selectedObjects`, `pass.damp`, `pass.size`).

All of it draws on WebGL and on WebGPU, so none of it changes which one a view uses.

## Face and hands

`const { Face, Hands } = gs.vision;` Face and hand tracking with the front camera, from Google's
[MediaPipe](https://ai.google.dev/edge/mediapipe) models. It all runs on the phone: no picture leaves it.
In the phone apps the models run on the phone's AI chip (Qualcomm's NPU on Snapdragon, the Neural
Engine on iPhone, else the CPU) through [ONNX Runtime](https://onnxruntime.ai), with the camera read
natively, so the game's frame time and the GPU stay free; on the web, MediaPipe runs in the page.
(The test APKs from GitHub fetch Qualcomm's NPU libraries, about 40 MB, on Wi-Fi a little after the
first start on a Snapdragon 8 Gen 2 or newer; until then the models run on the CPU.)

```js
reset() { face = new Face(); }           // loads the library first
update(dt) {
  if (!face.running) face.start();       // asks for the front camera the first time
  face.update();
  if (face.found) { ship.x = face.x * W; if (face.mouth > .5) chomp(); if (face.blink) jump(); }
}
```

- `Face`: `found`, `x`, `y` (0..1, mirrored like a selfie), `size`, `yaw`, `pitch`, `roll`, `mouth`,
  `smile`, `blink`, `winkLeft`, `winkRight`, `brows`, `points` (478), `shapes` (52 expressions by name).
- `Hands`: `list` of `{ x, y, tipX, tipY, pinch, pinchX, pinchY, open, fist, point, side, points }`, `first`.
- `ready` is true once the camera and model are running; `failed` holds the error if the player
  said no to the camera. The app stops the camera when the round ends. `backend` says where it runs
  (`'npu'` on the AI chip).
- Drawing the camera picture (`face.picture`, a mirrored selfie view)? Make it with
  `new Face({ preview: true })` (or `Hands({ preview: true })`): the AI chip never passes pictures to
  the game, so with `preview` the tracker runs in the web view instead.
- The models (4 MB face, 8 MB hands, plus a 14 MB engine on the web) download from our games server
  the first time; `npm run ml` fetches the web ones for `npm run dev` (the AI chip's are in `ml-models/`).
  `npm run kit-browser`-style checks of the AI chip steps against MediaPipe: `node scripts/npu-test.cjs`.

## Pause and resume

The app pauses a game when the player opens How to play, switches apps, or presses Escape or a
controller's Start, and shows a "Carry on" button. `update()` simply stops being called, and
music is held. If your game has its own timers or sounds outside `update()`, add `pause()` and
`resume()` to your game object. Use `gs.math.Timers` rather than `setTimeout` and you won't need to.

The app keeps the screen on while a round is in play, so games played by tilting, talking, blowing
or just watching don't dim and lock. It lets the phone sleep again when the round ends or pauses, and
after five minutes with no touch at all. Nothing to do in the game.

## Debug overlay

In `npm run dev` (and test builds), press `` ` `` (backquote) or F2 while a game is on screen, or
open the page with `?debug`, or run `__gs.debug()` in the browser console. It never appears in the
store apps.

| Key | Does |
| --- | --- |
| `` ` `` / F2 | Overlay on and off |
| `[` `]` | Slower and faster: 0.1x, 0.25x, 0.5x, 1x, 2x |
| `P` | Pause |
| `.` | While paused: step one frame |
| `H` | Hitboxes on and off |

The panel shows frames per second, how long your `update()` and `draw()` take, the game's size,
score and state. For hitboxes, give your game object a `debug(c)` method that outlines whatever you
like in game units; it is drawn on top while hitboxes are on. A physics game can just call
`phys.debugDraw(c)`.

For how a game runs on a real phone (frame pacing, 1% lows, hitch causes, resolution, upscaler and
frame generation checks), use the [frame lab](frame-lab.md): F3 in `npm run dev`, or the QA panel on
the phone.

## Tiny Brains

Tiny Brains are small neural networks that learn while people play, with no training step. A brain
starts by copying your game's own simple AI (its **teacher**), learns a little every frame, and only
takes over from the teacher as it shows it makes the game more fun. It runs on the phone's CPU in
plain JavaScript; a decision takes microseconds.

```js
const { Brain } = gs.brains;
function make(api) {
  const bot = new Brain(api, {
    name: 'bot',
    inputs: 4,                                          // numbers it sees, each about -1..1
    actions: ['left', 'right', 'jump', 'wait'],
    teacher: see => (see[0] < 0 ? 'left' : 'right'),    // your simple AI: where it starts
    limits: { react: .15, perSecond: 6, minNoise: .05 },// human-like caps it can never go past
    rules: (see, a) => (playerDown && a === 'jump' ? 'wait' : a),   // things it may never do
  });
  return {
    update(dt) {
      bot.act([dx / W, dy / H, vx / 300, onGround ? 1 : -1], dt);
      if (bot.action === 'jump') jump();
      if (nearMiss) bot.feel(1);        // an exciting moment: pressure, a close call
    },
    // when the round (or a duel) ends:
    // bot.result(playerWon);
  };
}
```

- `act(see, dt)` every frame: returns the action's index; `bot.action` is its name.
- `feel(x)` (about -1..1): "this moment was a good challenge". Call it for close calls, pressure,
  near misses; negative for dull or unfair moments. Don't reward hurting the player as such.
- `result(playerWon)` at the end of each round or duel.
- `reset()` forgets what it learned on this phone.

**Guard rails** (always on, a game can't turn them off):

- **It aims for fun, not winning.** It steers the player's win rate towards `target` (0.6). While the
  player loses too often, the same `feel()` signals teach it to ease off.
- **Hard limits from your game:** `react` (seconds between decisions, longer when the skill dial is
  low), `perSecond` (changes of mind), `minNoise` (always a little randomness).
- **Tiny, slow changes:** each nudge is small, and every number stays within `drift` (1) of the
  brain it started as (the copy of your teacher), with a gentle pull back.
- **Losing streak relief:** after three player losses in a row it backs off at once.
- **Your rules win:** `rules(see, action)` can swap any choice.
- **Private and resettable:** what it learned stays in the game's brain slot on the phone (and the
  player's cloud save), apart from `api.save()`.

**Shared learning.** Now and then a brain that has learned enough sends its numbers (only the
numbers, nothing about the player) to our server, and a fresh brain starts from everyone's average
(the server drops the most unusual 20% of each number, so a few odd phones can't steer it).
`share: false` turns it off for a brain. Changing `inputs`, `hidden` or `actions` makes a new brain
shape that starts again.

**Waves: every enemy is an experiment.** Each enemy gets a slightly changed copy of the brain; it's
scored by its `feel()` over its own life, and pairs of opposite changes move the brain towards
whichever made things more exciting.

```js
const wave = new gs.brains.Wave(bot);
spawn() { enemy.mind = wave.mind(); }
update(dt) { enemy.mind.act(see, dt); if (nearMiss) enemy.mind.feel(1); }
// when the enemy is destroyed or leaves: enemy.mind.done();
```

Each mind has its own reaction time and its own choice (`enemy.mind.action`), so a whole squad can
act in the same frame.

`wave.unsure(see)` says how much the live minds disagree about what to do on those inputs (0 they
all agree, towards 1 they don't). It's a cheap "not sure" signal: when it's high, let the teacher
decide, hesitate, or show a tell the player can read.

**Imagine: trying moves ahead.** For racing lines, throws and physics, `Imagine` tries each action a
short way ahead with your own step function and picks the best: smart from the first second. Give
it a brain and the brain learns from every plan, and the brain's skill dial and rules apply.

```js
const plan = new gs.brains.Imagine({
  actions: ['left', 'straight', 'right'],
  step: (s, a, dt) => drive({ ...s }, a, dt),   // returns a NEW state; never change the real one
  score: s => s.progress - s.offTrack * 5,
  brain: racer, see: s => [s.angle / Math.PI, s.speed / 300, s.edge],
});
const a = plan.pick(car);
```

`Imagine` plans for at most `budget` ms (2), so a slow phone tries fewer moves. In a game that
records replays or runs a daily seed, add `fixed: true`: it then always tries every move `tries`
times and picks the same on every phone (`plan.tried` says how many rounds the last pick used).

`auto: true` switches planning off on phones that can't afford it: at once on a low phone, or once
picks average longer than `maxMs` (default: `budget`). `plan.on` says whether it's planning and
`plan.why` why not. While it's off, `pick()` uses `fallback(state)`, or the brain (with `see`), so
the game keeps working the same way, just less cleverly.

**Predict: learning the player's habits.** For board, card, rhythm and turn games. It counts what the
player did after their last move, last two and last three, and learns which of those to believe. A
few dozen moves are enough to spot a habit; a player who really is random doesn't fool it into
being sure.

```js
const habits = new gs.brains.Predict(api, { moves: ['rock', 'paper', 'scissors'] });
// each time the player moves:
habits.see('paper');
// before the opponent moves:
if (habits.sure > .5 && Math.random() < bot.skill) counter(habits.guess());
// a hint: if (habits.right > .7) say('You always play paper after rock!')
```

`guess()` is the likely next move (null before any), `chances()` gives every move a chance, `sure`
(0..1) is how sure it is and `right` how often it has been right lately. It keeps what it learned in
the game's brain slot (`name`, default `'habits'`); `forget()` clears it. It only guesses: your game
decides how often to use it, so keep it inside the same guard rails (counter a habit some of the
time, less when the player is losing).

**Built in (both on; `false` turns either off):**

- `even`: even steps. Each number learns at a speed scaled to its own recent steps (like RMSprop),
  so one `learn` speed suits any game's inputs, tiny or large.
- `odds`: the brain learns the player's real chance of winning at each skill level from round
  results, and moves the skill to where that chance is `target`, rather than only reacting after
  losses. `bot.winChance(skill)` reads it. The losing-streak relief still applies on top.

Brains are small (`inputs`, `hidden` and `actions` multiplied out stay under 1,200 numbers).

### The player, fun, personalities and tells

**One profile across every game.** `gs.brains.Player` is a small private record of how this player
plays: the skill their brains settle at, reaction time, aim. Every Brain reads it, so a game they've
never played starts at their level instead of the middle, and adds to it after a few rounds. Games
can add their own: `me.note('reaction', .31)`, `me.note('aim', hit ? 1 : 0)`, `me.get('patience', .5)`.
It stays on the phone (and the player's own cloud save) and is never shared. `profile: false` keeps a
brain out of it.

**Fun signals.** The app tells your brains how fun each round looked: played again within 30 s (+1),
hearted (+1), Meh (-1), or left the game-over screen within 4 s (-0.5). A brain compares that with how
tense the round was, and learns whether this player enjoys more pressure or less (`bot.lean`, at most
±0.3). The win-rate rail still decides: it never adds pressure while the player is losing more than
the target. Nothing to call; `fun: false` turns it off.

**Personalities.** `styles: ['careful', 'bold', 'sneaky']` gives one brain several characters: the
style is an extra input, your teacher and rules get it as a third argument (`teacher: (see, style) =>
...`), and `bot.style = 'bold'` or `bot.style = { bold: .7, sneaky: .3 }` switches. In a wave,
`wave.mind({ style: 'sneaky' })` gives each enemy its own, so a squad feels like a cast.

**Tells.** `tells: true` (or `{ windup: .2, unsure: 1 }`) makes the brain wind up before it changes
what it's doing, so the player can read it and react: longer when the skill dial is low and when it's
torn. While `bot.telling` is set (`{ action, left, t }`), draw a glance, a crouch or a flash. Each
wave mind has its own `mind.telling`. `bot.unsure` (0..1) is how torn its last choice was.

### Nemesis, Shadow and teaching by playing

**Nemesis: a rival who remembers you.** It keeps the record between sessions (meetings, wins, losses,
streaks, days away) and your habits (a `Predict` inside). Your game writes the lines; it picks one
that fits and fills in `{move}`, `{wins}`, `{streak}`, `{days}`, `{name}`.

```js
const grub = new gs.brains.Nemesis(api, { name: 'grub', moves: ['left', 'right', 'jump'], lines: {
  first: ['New here?'], back: ['Back for more?'], long: ['{days} days! Thought you ran off.'],
  habit: ['You always go {move}...'], won: ['Lucky! Again!'], lost: ['Good try. Rematch?'], streak: ['{streak} in a row?!'],
} });
reset() { banner(grub.met()); }
// each player move: grub.see(move);   guard against: const m = grub.counter(bot.skill);
// game over: banner(grub.result(playerWon));
```

Guard rails: it only brings up a habit when it's sure and the player isn't on a losing run;
`counter()` uses a habit at most 60% of the time (less while the player is losing, never on a losing
run). Write the `lost` lines kindly: they're what a player hears after losing.

**Shadow: your own clone.** Feed it what the player sees and does while they play, and it learns to
play like them: race your own ghost that thinks, fight yourself, or play a friend's "you". `me.like`
is how well it copies (0..1) and `me.ready` says it has watched enough.

```js
const me = new gs.brains.Shadow(api, { inputs: 3, actions: ['left', 'right', 'jump', 'wait'] });
// while the player plays:  me.watch([dx / W, dy / H, vx / 300], playerMove);
// the clone:               me.act(see, dt); if (me.action === 'jump') ...
```

**Teach by playing (makers).** Instead of writing a teacher, play it yourself in `npm run dev`: feed a
`Shadow` (or `bot.watch(see, move)`) your own moves, press **B** in the debug overlay to copy the
starting brain, and paste it in as `start`:

```js
const bot = new Brain(api, { inputs: 3, actions: [...], start: 'tb1:3x12x4:0.0123:...' });
```

The bot then plays like you from the first frame, and learns from there inside the same guard rails.
It works best when the bot plays the same role the player does (duels, races, sports). The debug
overlay also lists each brain's skill, win rate against its target, trust, fun lean, how torn it is
and any tell.

**Tune the feel (makers).** `gs.brains.tune({ params, trial, want })` searches number ranges for the
ones whose `trial(params)` result is closest to `want`: run a quick bot round with your own update and
return how long it lasted, or how often a jump was made. It's for tests and the dev console, not for
players' phones.

```js
const best = gs.brains.tune({ params: { jump: [300, 700], gravity: [800, 2000] }, trial: p => botRound(p).seconds, want: 45 });
```

**The cruelty test.** `npm run brains` plays made-up weak, middling and strong players against a
brain for hundreds of rounds, plus a badly made game that rewards hurting the player and fun signals
that always ask for more, and fails if a weak player stops winning about as often as the target or
any number leaves its rail. `node scripts/brain-check.mjs --games <id>` (after `npm run build:bundled`)
plays your game with random taps and fails if a brain got harder while that player was losing. The
PR check runs both.

## Hot reload and tweak sliders

In `npm run dev`, saving your game file swaps the new code into the card you're playing, in about a
second: the page doesn't reload, the feed stays where it is, and the debug overlay stays on. A round
in progress starts again at once, or carries on if your game says what to keep:

```js
return {
  snapshot() { return { score, level, hero: { x: hero.x, y: hero.y } }; },   // plain data
  restore(s) { score = s.score; level = s.level; hero.x = s.hero.x; hero.y = s.hero.y; api.score(score); },
  // ...
};
```

`restore()` runs on the new code, after `reset()`. Changes to kit or app files still reload the page.

**Tweak sliders.** `gs.tweak` puts sliders for your numbers on screen (lil-gui) while you play:

```js
const T = gs.tweak('Car', {
  speed: 3,                      // a number: a slider from 0 to 3 times it
  grip: [.8, 0, 1, .01],         // [value, min, max, step]
  drift: true,                   // a tick box
  paint: '#ff8800',              // a colour
  mode: ['easy', 'easy', 'hard'],// [value, ...choices]
});
// read T.speed where it's used (in update or draw), so a slider change shows on the next frame
```

- Call it in `make()` or `reset()`. Each game on screen shows only its own panel.
- **Copy values** puts the current numbers on the clipboard (and in the console) as a `gs.tweak`
  call to paste back into your file.
- Values you changed survive hot reload. Change a number in the file and the file's number wins.
- The store apps and test builds show no panel: `gs.tweak` just returns the starting values, so the
  call can stay in your game.

## Speed budget

`npm run budget my-game` plays your game for a few seconds with random taps on a CPU slowed to about
a mid-range phone, and fails it if:

- `update()` + `draw()` take more than three quarters of a 60 fps frame (12.5 ms) on its slowest
  frames (the 95th percentile). For Console, Next Gen and AR games only `update()` counts, with a
  budget of 8.3 ms: a headless browser draws 3D far slower than a phone's GPU.
- JavaScript memory keeps growing (more than 40 MB held after the run): something is kept every
  frame or round.

When a game is over budget it lists the functions that took the most time, with their file and
line. Pull requests that change a game run it automatically.

Shared CI machines vary, so the same code can land either side of the line. A game that is only a
little over (up to 1.5 times the budget) is played twice more and judged on the middle run; the
report shows all three times and their spread, so you can tell a real slowdown from a noisy machine.

**Next Gen and AR on fast screens.** With WebGPU on, a 3D game the phone can't draw at the screen's
rate (90, 120 or 144 Hz) gets made frames between its real ones (frame generation), so it still moves
at the screen's rate; the same happens while the phone is warm or low on battery. Nothing to do in the
game. `frameGen: 'ahead'` in the definition guesses ahead instead of blending (no added delay, for
reflex and rhythm games), `frameGen: false` turns it off, and `v.cut()` after a camera jump starts it
(and the upscaler) fresh. A game that turns its own camera from touch can add
`v.aimNow(cam => { cam.rotation.y = lookAngle; })` so made frames turn with the finger at the screen's
rate (`gs.camera` rigs do this already). Details: [docs/nextgen-3d.md](nextgen-3d.md#frame-generation).

## 2D cameras, tile levels and movement

`const { Camera2D } = gs.camera2d, { TileMap } = gs.tiles, { Platformer, TopDown } = gs.movers;`
Write a level as text: `TileMap.fromText(LEVEL, { size: 16 })`. `#` is a wall, `-` a one-way platform
(jump up through it, `input.down` drops through), `/` and `\` are slopes, `.` is empty and any other
letter is a mark you read with `map.find('P')` (each gives `x`, `y` at the tile's centre) and then
`map.clear('P')`. Your own tile kinds go in `legend`. `map.move(box, dx, dy)` moves a box (centre
`x`, `y`, size `w`, `h`) and says what it hit; `map.ray` and `map.sees` are lines of sight and
`map.walkable()` feeds `gs.ai.NavGrid`. `map.draw(c, (c, ch, x, y, size) => ..., cam)` calls your
drawing for each tile on screen.

`Platformer` moves through a map with the tricks that make jumping feel right: coyote time, a jump
buffer, letting go early for a short hop, wall slide and wall jump (`wall: true`), air jumps. Its
`state` ('idle', 'run', 'jump', 'fall', 'wall'), `jumped`, `landed` and `impact` drive your animation
and effects. `TopDown` is eight-way walking that slides along walls.

`Camera2D(W, H, { bounds: [0, 0, map.w, map.h], deadzone: [60, 80], lag: .12, lead: .2 })`:
`cam.update(dt, hero)`, then draw the world between `cam.begin(c)` and `cam.end(c)`; `cam.layer(c,
.3, drawHills, { repeat: [W, 0] })` for parallax; taps go through `cam.toWorld(x, y)`.

## Animation, dialogue and replays

`gs.anim.Animator` keeps track of which frame to draw: states with `frames`, `fps`, `loop`, `then`
(where a one-shot goes next) and `events` on frames (`on('step', ...)`). Pick the state each frame
with `anim.update(dt, 'run')` or play one with `anim.play('punch')`.

`gs.story.Story(script)` runs a conversation written in ink (inklestudios.com/ink): `next()` gives
`{ text, tags, choices }`, `choose(i)`, `vars` for ink variables, `ended`. `Typewriter` reveals the
text with `shown`, `done`, `skip()` and `ticked` (for a blip sound). Your game draws the box.

`gs.replay.Ghost` records a few numbers over time (`record(dt, x, y, angle)`), plays them back
smoothly (`at(t)`) and packs to about 1 KB (`pack()`, `Ghost.unpack()`) to keep with `api.save()`:
race your best run. `Recorder` / `Replayer` replay a whole round exactly, if the game takes its
random numbers from `rec.rng`.

**Same on every phone.** A replay (or a daily run that should play out alike for everyone) only
holds if every step computes the same numbers. `+ - * /`, `Math.sqrt` and `Math.hypot` are exact in
every engine, but `Math.sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow` and `tanh` are not:
`node scripts/math-probe.cjs` found the last bit differs on most inputs even between two versions of
V8 (Node 22 and Chromium 153, 8 November 2026), and Android's web view updates itself, so phones
won't agree either. Ghosts are safe (they store positions). For a whole-round replay, keep those
functions out of anything that decides what happens (use them for drawing), use `Imagine` with
`fixed: true`, and never time game logic with the clock.

## 2D lights and screen effects

`gs.look2d.Lights(W, H, { dark: .85 })` draws darkness with lights cut out of it:
`lights.draw(c, [{ x, y, r, color, cone, dir, flicker }], { walls: map, cam })`. Walls (a TileMap,
anything with `ray()`, or `[x1, y1, x2, y2]` segments) cast real shadows. `pixel: true` bands the
light for pixel styles.

`Screen({ crt: true, bloom: { threshold: .6 } })` (PixiJS and pixi-filters, loaded on first use) runs
the whole frame through effects: call `screen.apply(c)` last in `draw`. Effects: `crt`, `bloom`,
`grade`, `pixelate`, `glitch`, `rgbSplit`, `film`, `shockwave` (`screen.shock(x, y)`), `godrays`,
`zoomBlur`, `blur`, `outline`, `grayscale`, with their pixi-filters options. Reduce motion turns off
the shaky ones. `Batch(W, H)` draws thousands of sprites with WebGL: `batch.texture(sprite)`,
`batch.add(tex, x, y)`, `batch.draw(c)`.

## Game kits

Kits for the things many kinds of game share. Each one does the sums and keeps the state; your game
draws everything and sets the rules. Every file in `src/kit/` starts with a worked example.

**Boards** (`gs.board.Board(cols, rows, { fill })`): match-3, merge, 2048 and block puzzles. `matches()`
finds lines (L and T shapes come back as one group), `clear()`, `fall()` and `refill()` drop and top
up, `settle()` starts a board with no matches, `hint()` finds a swap that makes one, `shuffle()`.
`slide('left', { merge })` does 2048 moves and `flood(col, row)` finds a connected group. Each piece
gets a drawn `x`, `y` that glides to its cell (`board.update(dt)`, `board.busy`).

**Battles** (`gs.battle`): `Fighter` (hp, atk, def, spd, luck, type), `Battle([[hero], [foes]], { types })`
for turn order by speed, damage with type bonuses and critical hits, and statuses (poison, burn,
regen, stun, sleep, shield, or your own). `battle.act(who, { move, item, target })`, `battle.turn`,
`battle.over`, and events (`on('hit')`, `on('faint')`). `Bag` holds items and saves with `api.save()`;
`xpFor`, `levelFor`, `gainXp` and `loot` cover levelling and drops.

**Stats that change while you play** (`gs.stats`, real time; gs.battle's statuses count turns):
`new Stats({ speed: 6, armour: 0, hp: { max: 100 }, mana: { max: 50, regen: 8, delay: 1 } }, { buffs: TABLE })`.
A stat is (base + every add) x every mul, held to its `min` and `max` (`{ base, min, max }`); `get('speed')`.
A pool (an object with `max`) is an amount that drains and refills: `change('hp', -12)`, `spend('mana', 10)`
(false if short), `fill`, `empty`, `part('hp')` 0..1 for a bar; its max and regen are stats too
(`'hp.max'`, `'mana.regen'`), so a buff can raise them, and a loss holds off regen for `delay` seconds.
Buffs go on by name from the table or with a spec: `buff('haste')`, where `haste: { for: 4, mul: { speed: 1.5 } }`;
with no `for` it is a perk, on until `remove()` (`perk(id)` makes any of them one). A spec can also have
`add`, `tags` (`is('stunned')`), `drain: { hp: 3 }` a second (negative heals; with `every: 1` counted once a
second, and `tick(stats, effect)` called), `stacks` and `stack` (putting it on again: `'refresh'` the time,
`'extend'` it, `'stack'` a dose (each dose adds its own add, mul and drain), `'keep'`, `'strongest'`), `bad: true`
(a debuff: `cleanse()` takes them all off) and `blocks: ['poison']` (immune while it's on; what it blocks comes
off). `buffs` lists what is on with `left` and `part` for icons and rings. Cooldowns: `cool('dash', 2, { charges: 2, by: 'haste' })`,
then `use('dash')` (false while waiting), `ready`, `left`, `charges`, `part('dash', 'cool')`, `hurry`. Events:
`on('buff' | 'end' | 'tick' | 'change' | 'empty' | 'full' | 'ready' | 'blocked', fn)`. Call `update(dt)` each
frame, make it in `reset()` (or `clear()` it there), and `pack()` / `unpack()` with `api.save()`.

**Made levels** (`gs.gen`, rot.js and WaveFunctionCollapse, loaded on first use: call them in `make()` or
`reset()`): `dungeon`, `cave`, `maze`, `islands`, `heightmap` and `pattern(sample)` (new maps that look
like a small example). They give the same text `gs.tiles.TileMap.fromText()` reads, with `S` start and
`E` exit marks. Pass a `seed` (`gs.math.daily()` for a level of the day). `fov(map, col, row, r)` is
what a hero can see.

**Proven levels** (`gs.gen.proven`): makes levels until one passes your check, so nobody gets one
that can't be beaten or is over in two steps. `make(seed)` builds a level, `check(level)` returns
false to throw it away or a number (higher is better); it stops at the first that scores `good`,
else keeps the best of `tries`. `reach(text, 'S', 'E')` is the walk from one mark to another (-1
when there's no way through). For jumps and physics, play the level in `check` with an `Imagine`
plan or a bot driving your own update. Seeded, so a level of the day is the same for everyone.

```js
const { level } = proven(s => cave(40, 30, { seed: s }), l => { const n = reach(l.text); return n > 30 && n; }, { seed: daily(), good: 60 });
```

**Drag and drop** (`gs.drag.Drag({ snap, accept })`): add pieces and slots, pass down/move/up through,
and pieces lift, snap into slots you `accept`, or slide home. With `list: { x, y, axis }` the pieces
form a row you reorder by dragging.

**Undo and redo** (`gs.history.History(start, { max })`): `push(state, label)` after each change keeps a
copy; `undo()` and `redo()` hand back a fresh copy of that step (null when there's none). `canUndo`,
`canRedo`, `undoLabel` for the buttons, `undos` to count them (fewer undos, more stars). Pushes with the
same `merge` key in a row are one step (a dragged slider); `group(state, label, fn)` makes several one.
A change after an undo drops the steps ahead. `pack()` / `unpack()` for `api.save`.

```js
reset() { board = newBoard(); hist = new History(board); }
tap(x, y) { flip(board, x, y); hist.push(board, 'flip'); }
undo() { board = hist.undo() ?? board; }
```

**Inventories and crafting** (`gs.items`): `Inventory(defs, { slots, extra, stack, weight })` is a grid
of slots holding stacks (`defs[id].stack` most per slot, `kind`, `weight`). `add(id, n)` returns what
didn't fit; `take`, `count`, `has`; `move(from, to, n)` merges or swaps, and equip slots in `extra`
(`{ hand: 'tool' }`) only take their kind; `split`, `sort`, `save` / `load`. `Recipes(defs)`:
`add(id, needs, { makes, keep, at, time })`, then `can(inv)` (what can be made now), `missing(id, inv)`,
`times`, `uses(item)`, `make(id, inv, station)`. Recipes with `time` are made over seconds by
`book.timer` (`update(dt)`, `progress(job)`, `on('done')`). gs.battle's `Bag` works as `inv` too.

**Point-and-click adventures** (`gs.adventure.Adventure({ start, bag })`): `room(id, { map: [col, row] })`
then `.spot(id, { x, y, w, h } | { x, y, r } | { poly }, look, take, exit, locked, talk, when, walk })`.
`tap(x, y, item)` finds the topmost spot and does it: a use rule when an item is held
(`rule(item, spot, fn)`; fn returns the line to say), else take, exit (unless locked), talk or look; it
returns `{ spot, did, text }` and fires `say`, `enter` and the rest. `act(spot, item, 'look')` after the
hero has walked to `walkTo(spot)`. `combine(a, b)` for items in the bag, `flag(k, v)`, `unlock`,
`map()` / `drawMap(c, x, y)` for the rooms seen, `save` / `load`. Use an `Inventory` as the bag for
slots and limits, and `gs.story` for conversations.

**Hex maps and isometric views** (`gs.hex`, hex maths from honeycomb-grid): `HexMap({ size, pointy, shape:
'rect' | 'hex', w, h, radius, x, y })` gives cells with `q, r`, centre `x, y`, `corners` to draw and your
own `data`. The map's `x, y` is its **top left corner**, not its middle: pass `cx, cy` instead (e.g.
`cx: W / 2, cy: H / 2`) to centre it, or call `map.centre(x, y)` / `map.shift(dx, dy)` later; `map.bounds`
is its `{ x, y, w, h }` box. `at(x, y)` is the hex under a tap; `neighbours`, `distance`, `line`, `range`, `ring`;
`reach(from, moves, cost)` is everywhere a unit can move (a Map of cell to points spent, `cost(cell)`
Infinity for blocked); `path(a, b, cost)` the cheapest route; `sees(a, b, blocks)` line of sight.
`Iso({ tw, th, x, y })`: `toScreen(tx, ty, z)`, `toTile(x, y)` for taps, `corners`, `sort(things)` back to front.

**Strategy controls** (`gs.rts`): `Select(() => things, { radius })` with `down/move/up` picks by tap or
a dragged box (`sel.box` to draw it), a double tap picks every one of that `kind`, and `up` returns
false for a tap on nothing (that's an order). `formation(units, x, y, { shape: 'grid' | 'line' | 'wedge'
| 'circle', gap })` gives each unit its place. `FlowField(w, h, size, cost).to(tx, ty)` then `dir(x, y)`
steers any number of units round walls. `BuildGrid(w, h, size)`: `snap` a dragged building to tiles,
`fits`, `place`, `remove`, `at`. `target(tower, enemies, { range, by: 'first' | 'last' | 'near' |
'strong' | 'weak' })` picks who a tower shoots.

**Fighting games** (`gs.fight`): `Reader({ window, buffer })` gets `feed(stickX, stickY, { P, K }, dt,
facing)` each frame (a `gs.controls.Stick` on touch) and keeps the last moments: `did('236P')` for
motions in numpad notation (forward follows `facing`), `special(moves)` for the first move whose
`input` was done, `take('P')` for a press up to `buffer` seconds old. `Fighter(moves, { x, facing, hurt
})`: moves are `{ start, active, recover }` in 60ths of a second with `hit` boxes `[x, y, w, h]` from the
feet (facing right), `stun`, `blockStun`, `stop`, `low`/`high`, `cancel: [names]` (once it has hit);
`start(name)`, `update(dt)`, `phase`. `clash(a, b)` checks a's hit boxes against b's hurt boxes once per
move, sets stun, block stun (b.blocking, b.blockLow) and hit stop, and returns `{ move, blocked, x, y }`.

**Bullet patterns** (`gs.bullets`): `Bullets({ max, w, h })` keeps thousands of bullets in flat arrays:
`fire(x, y, speed, angle, { accel, turn, wave, home, kind, life })`, `update(dt, target)`, `each(fn)` to
draw, `hit(x, y, r, graze)` (`{ hit, grazed }`: near misses count once) and `clear(fn, x, y, r)` for
bombs and turning bullets into points. `Emitter(bullets, { every, rotate, times, delay })` fires a
volley built from `ring(n, speed)`, `spread(n, arc, speed, aim)`, `spiral(arms, speed, step)`,
`burst(n, speed, aim)` and `custom(fn)` each time; `update(dt, x, y)` from where the boss is.

**Falling sand and blastable ground** (`gs.sand`): `Sand(w, h)` is a grid of materials (`M.EMPTY`,
`WALL`, `DIRT`, `WOOD`, `SAND`, `WATER`, `OIL`, `FIRE`, `SMOKE`, `ACID`, `STEAM`, `LAVA`, `STONE`) that
behave by themselves: sand piles, water and oil flow and settle by weight, fire burns wood and oil into
smoke, water puts fire out as steam, acid eats ground, slow lava sets things alight and turns to stone
where water touches it. `fill(fn)`, `paint(x, y, r, m)`, `blast(x, y, r)` (a
hole whose edge falls as rubble), `solid(x, y)` for heroes to stand on, `count(m, box)` for goals,
`update(dt)` (60 steps a second), `picture()` to draw scaled up with smoothing off, `colour(m, [r, g,
b, variation])` for your own look. It runs on the CPU in flat arrays: about 120 x 200 cells is
comfortable on a phone.

**Procedural art** (`gs.art`): the same seed always gives the same thing, drawn in code.
`creature(seed, { hue })` (body, legs, eyes, horns, wings: read them for the rules),
`face(seed)` (draw with a mood -1..1), `item(seed, 'sword' | 'potion' | 'gem' | 'shield' | 'key' | 'ring')`
(with a `rarity` and `power`), `building(seed)` (draw with night 0..1 for lit windows), `sprite(seed, w,
h, palette)` (a mirrored pixel sprite for the Pocket styles), `name(seed, 'person' | 'place' | 'thing')`.
Each has `draw(c, x, y, size)`; `{ hue }` or `{ palette }` keeps a set in one colour family.

**Team sports AI** (`gs.sports`): `Pitch({ w, h, goal })` (team 0 attacks the top) and `Team(pitch,
side, { formation: '2-2' | 'k-3-2' | ..., skill })`. `team.think({ ball, foes }, dt)` returns a Map of
each player (not marked `human`) to `{ do, x, y, kick }`: one chases the ball, the rest slide with the
formation, find space when you have the ball or mark someone goal side when you don't; the one with
the ball shoots at the most open corner, passes along the clearest lane, or runs on. Your game moves
the players towards x, y and applies the kick. `home(p, ball)` is where a player belongs now.

**Quiz questions** (`gs.trivia`, about 2,700 from the Open Trivia Database, CC BY-SA 4.0; loads on
first use, so make it in `make()` or `reset()`): games can't carry data files, so the bank lives here.
`categories()` lists `{ id, name, count }` (general, animals, geography, history, science, maths,
computers, sports, art, myths, vehicles, books, music; grown-up topics left out). `new Quiz({ categories,
difficulty, kind: 'choice' | 'truefalse', climb, seed })` deals them in a seeded order with no repeats
(`gs.math.daily('quiz')` for the same quiz for everyone today). `next()` gives `{ text, answers, kind,
difficulty, category }` with the answers shuffled (the right one isn't in it); `answer(i)` gives `{ right,
correct, streak, score }`; `timeout()` is a miss; `fifty()` is two wrong answers to take away; with
`climb: 3` it starts easy and steps up after three right in a row, down after a miss. `pack()` is a tiny
save to `resume` from. Show `CREDIT` somewhere in the game: the licence asks for it.

**Flowing liquids** (`gs.flow`, 2D top-down or 3D ground): `new Streams({ space: '3d' })` holds rivers,
pools and whirlpools. `river(path, { width, speed, depth, kind: 'water' | 'lava' | 'acid' | 'mud' | 'deep',
hurt })` follows a `gs.paths` Path: fastest in the middle, slow at the banks, bending round `rock(d, side,
r)`, and pulling down where the path drops steeply (a waterfall). `pool(at, r, { kind: 'lava' })` and
`whirl(at, r, spin, pull)` are round (or boxes with `w`, `h`). `at(p)` says what the liquid is doing at
a point (`{ in, kind, depth, speed, current, edge, fall, foam, hurt, level }`), `carry(obj, dt, { drag })`
moves a raft or a swimmer with it, `hurt(obj, dt)` is this frame's damage from lava or acid (with
`on('enter' | 'leave')`). `new Flood({ size, cells, ground: (x, z) => land.height(x, z), edges: 'wall' |
'drain' })` is shallow water that spreads, runs downhill and fills hollows: `pour(x, z, rate, r)` (a tap;
negative drains), `add(x, z, volume)` (a burst dam), `rain(rate)`, then `depth`, `wet`, `level`, `current`
and `volume()` anywhere; `ground(fn)` again after digging. In 3D, `gs.outdoors` draws them:
`new River(stream)` (moving water with foam at rocks, banks and falls; lava with glowing cracks and a
crust that cools downstream; acid; mud) and `new FloodWater(flood, { view })`, which on WebGPU runs the
flood on the graphics chip. `gs.sand` has lava too, for 2D.

**Idle maths** (`gs.idle`): `cost` (prices that climb), `afford`, `short(1234567)` gives '1.23M', and
`Earner` for producers that earn per second. `api.away()` is the seconds since this game last ran
on this phone (at most a week), for money earned while away.

**Pass-and-play** (`gs.party`): `Turns({ players, names })` keeps whose go it is, scores and rounds,
with a hand-over pause (`turns.waiting`, `turns.ready()`, `turns.cover(c, W, H)`). `Split(W, H, { players,
facing })` splits the screen between players at once, turning the far half round for a player
sitting opposite (great on an unfolded phone laid flat).

**Rhythm** (`gs.rhythm`): `Beat({ bpm })` keeps time with the sound card, so it stays in step with
`gs.sound.music`. `Chart` reads notes written as text (one line per lane, `x` a note, `=` a hold) and
judges taps as Perfect, Good or Miss, with combo and accuracy. `Calibrate` measures the player's tap
lag (screens and Bluetooth headphones add delay) and every chart allows for it.

**Drawn shapes** (`gs.strokes`): `Stroke` records a smoothed finger line. `Shapes` recognises circle,
line, triangle, square, check, caret, zigzag, heart, star, spiral, wave, cross, or shapes you add as
points, drawn any size and either way round. `match()` gives `{ name, score, sure }`. `toPhysics()`
turns a drawn line into a `gs.physics` ramp or a falling object.

**Vehicles** (`gs.vehicles`): `Car` (top-down) and `Kart` (3D) are arcade handling without a physics
engine: grip, slides, a drift you hold for a boost, surfaces (`surface: .1` is ice), hops and ground
following. `Laps(checkpoints)` counts laps, places racers and gives computer drivers somewhere to aim.
For real suspension and cars that can roll over, `World3D.vehicle(mesh, { wheels })` in
`gs.physics3d` uses Rapier's ray-cast vehicle: `car.drive(throttle, steer, brake)`, `car.speed`,
`car.upsideDown`, `car.rightUp()`.
These are how a car handles; what it looks like is yours, or `gs.models.vehicle('car')`:
[Vehicles made in code](#vehicles-made-in-code).

**3D levels from text** (`gs.level3d.Level3D(text, { size, wall, look })`): the same text maps in 3D.
`#` walls, `.` floor, `1`-`9` raised floors, `~` water, `=` low walls, spaces as holes, letters as
marks (`find('P')`). Rows of the same block merge, so a big map is a few meshes. `level.solid(world)`
makes it solid in `gs.physics3d`; `height(x, z)` gives the floor height for a `Kart`.

**Sky and weather** (`gs.sky`): `Sky(view, { time, speed })` moves the sun through the day, colours
the sky, sun, fill light and fog, and brings out stars (`physical: true` uses three.js's physical
sky for Next Gen). `clouds: 0..1` adds drifting clouds lit by the sun, and on Next Gen `env: true`
lights the scene's reflections from the sky; with `v.air()` their shadows cross the ground (see
[nextgen-3d.md](nextgen-3d.md#outdoor-worlds-sun-air-sky-and-grade)). `Weather(view, { kind: 'rain' | 'snow' | 'storm' })` falls around the camera;
storms flash lightning, and `onFlash(far)` is your cue for thunder. In AR the camera feed is the sky,
so use `Weather` alone. Given the level (`Weather(view, { level: world })`) it changes the world too: rain and
snow stop at roofs, the open ground gets wet and puddled and dries again, and snow settles and melts: see
[Weather that changes the world](#weather-that-changes-the-world).

## Action and adventure kits

For shooters, stealth, climbing adventures, spy games and ball games with cars. As with every kit,
these give answers (hits, orders, where the camera goes, who scored) and your game draws the lot,
including its own HUD and menus. The few `draw...()` helpers below are plain starting points you can
ignore.

**Weapons and damage** (`gs.combat`): `Gun({ rate, mag, reload, spread, recoil, pellets, falloff })`:
`gun.pull(from, dir, held)` gives the shots fired this frame (spread that blooms and settles,
shotgun pellets, full auto or one per tap), `gun.kick` is the recoil to add to your camera, and
`damageAt(distance, head)` covers range falloff and headshots. `Shots` flies slower shots (rockets,
arrows) and asks your `hits()` what each one met; `arc` and `lob` give grenade throw lines.
`Health({ regen, delay, armour, downed })` heals after a quiet spell, soaks hits with armour, can go
down before dying, and keeps the direction of each hit (`hits[].angle`) for damage arrows.
`Markers` times hit markers. `Explosives` are barrels and mines that set each other off.

**Cover and squads** (`gs.tactics`): `CoverMap(cols, rows, blocked)` finds every spot beside a wall and
which way it faces; `find(from, threat)` picks cover that blocks a threat (or flanks it), `peek()`
says where to lean out. `Squad(members, { cover, sees })` gives each enemy an order each think
(`move`, `shoot`, `throw`, `hold`) with roles: some pin you down while others move up or flank, a
grenade flushes you out of cover you've camped in, the hurt fall back, and they call out
(`on('call')`: contact, reloading, man down) for your barks. `Route(points)` is an ally who leads
and waits for you.

**Climbing** (`gs.climb`): `Ledges.fromLevel(level3d)` finds every edge you can hang from (or `add()`
your own). `Climber` grabs a ledge in reach, shimmies, turns corners, climbs up, leaps to the next
handhold the way you push, drops or kicks off. `Rope` is a swing you pump higher. `climber.pos` and
`climber.state` drive your character and its poses.

**Poses** (`gs.poses`, 3D): `figure()` builds a simple jointed person and `Rig` blends poses on it:
idle, walk, run, sprint, crouch, sneak, aim, jump, fall, land, hang, shimmy, climb, swing, cover,
punch, takedown, downed, wave, sit, or your own. Walk and run cycles follow `speed` so feet don't
slide; `upper('aim')` aims over the legs. Works on your own models too (pass their joints).

**Lifelike motion** (`gs.poses`): `LIFELIKE` is a set of idle, walk, jog, run, sprint and sneak drawn from where
the feet go (the heel lands, the foot lies flat, the toes push off; the legs are bent to put it there, so a
planted foot doesn't slide; a runner lands on a bent knee under the body and the other knee drives through),
with a turning pelvis, countering shoulders and swinging arms:
`new Rig(parts, { poses: LIFELIKE, weight: 1 })`, then `rig.blend({ idle: 0, walk: 1.4, jog: 3.4, run: 5.6 }, speed)`.
`weight` gives the body weight: it leans into a spurt, rocks back as it stops and banks into a turn
(`rig.update(dt, { speed, turn })`). Your own actions are key poses: `keys([[0, { spine: [.2, 0, 0] }], [.4, { armL:
[-1, 0, 0], drop: .1 }], [1, {}]])` glides through them on curves that never overshoot (a key names only what
changes; `drop` lowers the hips, `shift: [x, y, z]` moves them, in metres). `rig.add('vault', keys([...]), { time:
1.2, once: true })` plays by the clock and holds its end (`rig.done`); `rig.play('climb', { at: rungs % 1 })` lets
the game hold the phase itself, in step with a ladder or a cutscene. `gs.models.human` people use all of this, and
`person.touch({ handL, footR, ... })` then puts hands and feet on points in the world (a rung, a bar, a ledge).

**Steps that are really taken** (`gs.models.human` people, by themselves): a walk is drawn for a body going
straight ahead at the walk's own speed, and a game turns its people, starts and stops them and moves them a
little faster or slower than that. So the rig keeps each foot where it was put down: the leg is bent again as
the body goes on over it, the foot rolls from its heel onto its ball without either moving on the ground, the
next footfall lands where the body is really going (round a bend, off its pace, sidestepping, backwards), and a
person turned or shifted while standing steps round to stand under himself, a foot at a time, where he used to
turn like a statue on a turntable. Nothing to call: move the person, then `rig.update(dt, { speed })` as before.
It works in the poses that stand on the ground (the lifelike walks and runs and standing easy); say so for a
pose of your own with `rig.add('guard', fn, { ground: true })` (a walk of your own also gives `stance: .6`, the
share of a stride a foot is down). Low stances of your own can stand on the ground too: a leg the pose puts down
on its knee is not stood on, so a kneeling person turned quickly comes round on the knee and steps only the front
foot, and a change from one way of standing to another (standing easy to a kneel, a kneel to a crouch) moves the
feet as the poses draw them, with no shuffling after. A quick turn on the spot opens with the foot on the side it
turns to. `rig.stride.feet[0].landed` (left; `[1]` right) is true on the update a foot
touches the ground, for a footstep sound. It stands down by itself for a walk on the spot (a figure in a menu),
a person carried along faster than a slow walk, a far-off person and one that `Reactions` has off its balance;
`rig.steps = false` leaves every pose as drawn (a person riding on something slow).

**Momentum and follow-through** (`gs.models.human` people, by themselves): a body has weight. A new move begins
at once and takes up what the body was doing: how far each joint was from where the new move has it, and how
fast it was turning, die away smoothly in about the fade you ask for (`rig.play(name, { fade })`), so a limb in
mid swing swings on a little, a person comes down into a kneel with weight, and nobody is half in one pose and
half in another, as a cross-fade has them (`fade: 0` is still a cut; `rig.momentum = false` cross-fades). And
what the body carries goes on a moment and settles when you start it, stop it, turn it or drop it: the arms are
left behind as a runner sets off and swing on as he pulls up, the head nods, the rib cage and the head come
round after the hips, the shoulders give on a landing, and his pack, bag, canteen and holster swing and bounce
(close up). It is measured from how you really move the person, so there is nothing to call; a steady walk gets
nothing added, nor does a person put somewhere else at a stroke. `rig.follow.amount = 0` turns it off (2 doubles
it), `rig.follow.reset()` stills it for a new round. Your own thing that hangs (a slung rifle, a lantern):
`rig.hang(thing, { pivot, swing: .03, bounce: .001, away: [0, 0, -1] })` swings it about the point it hangs
from, never into the body; for a thing you place yourself each frame pass `apply: false` and add the `x`, `z`
(radians) and `y` (metres) it returns.

**A living body** (`gs.models.human` people, by themselves): close up, the chest and the belly breathe, about fifteen
times a minute at rest, a little more in than out, the belly more in a man and the chest a little more in a woman;
after a run, faster and deeper, and back to rest over half a minute or so (`person.breath.puff`, 0..1, says how out of
breath; set it for a winded person). `person.breath.on = false` holds the breath (a sniper before the shot, someone
playing dead). A heavy belly lags a moment behind the hips in a stride or a landing and settles. A bicep swells as its
elbow bends, more on a muscled arm, and shoulders, elbows, hips and knees keep their girth in a deep bend. With
`look: 'real'` the body comes from the seed too, with `muscle` (0 slight .. 1 built) beside `age` and `weight`.

**A live face** (`gs.models.human` people, by themselves): close up, a person blinks, and the eyes keep to a
spot in the world while the head moves, as eyes do, and jump to a new one now and then or when the head has
turned away from the old one. Nothing to call: the rig steps the face with the body. `person.face` takes what
`gs.characters.Face` takes: `face.say('Over here!')` speaks the line and moves the jaw and the lips to it,
`face.mouth(level)` opens the mouth from your own source, `face.set('smile', 1)` eases an expression in (`open`,
`wide`, `round`, `smile`, `frown`, `surprise`, `blink`, and on these people `squint`, `sad`, `angry`, `wince`,
`winkL`, `winkR`, `disgust`, `fear`, `contempt` too), `face.blink()` blinks now and `face.blinkEvery = 0` stops the
blinks. Under the expressions are the 51 single movements that face capture records, by their ARKit names
(`browInnerUp`, `cheekSquintLeft`, `jawOpen`, `mouthSmileRight`, `noseSneerLeft`...; Left and Right are the person's
own; the list is `gs.models.human.moves`), each set the same way, so a face can be posed by hand or played from a
recording; they add to the expressions. Speech presses the lips together for m, b and p and tucks the lower lip under
the teeth for f and v, and the nostrils widen a little on each breath (`face.breathe = false` stills them). On a real
face (`look: 'real'`) the lines that come with an expression come and go with it on WebGPU: across the forehead with
raised brows, between the brows in a frown, down the nose when it screws up, crow's feet in a smile, and the fold from
the nose to the mouth deepens; young faces fold less deeply. And it looks:
`face.look(point)` puts the eyes on a point in the world (`[x, y, z]` or `{ x, y, z }`) or on an `Object3D`,
followed as it moves, each eye by itself, so they cross a little onto something close; `face.look(null)` lets
them wander again. Eyes turn about 30 degrees to either side and less up and down, so turn the head yourself
for more (`gs.characters.lookAt`); `face.yaw` and `face.pitch` say where they are turned. `face.wince()` screws
the eyes shut for a moment (`Reactions` does it at a blow). The eyes of someone lying on the ground close by
themselves (the head lying over, low down): `face.awake = true` keeps them open (the wounded), `false` closes
them wherever he is, `null` is as made. The head has bones for all of it (`bones.eyeL`, `lidL`, `lowLidL`, `browL`,
`browInL`, `cheekL`, `noseL`, `cornerL`, `lipUpL`, `lipLowL` and their `R` twins, and `bones.jaw` and `chin`), lips that
part, and teeth and a tongue behind them.
At the middle and far levels, and in a crowd, the face is still and costs nothing. For a close-up or a cutscene,
`view.faceLight(person)` (once, in `make()`) lights the face softly from beside the camera, as a film crew's fill
does, with a small bright point in each eye; `{ strength: .5 }` sets how much, `view.faceLight(null)` dims it.

**Missions** (`gs.missions`): write a mission as a script that reads like the plan:
`Mission(function* (m) { m.objective('Reach the roof'); yield m.until(() => roof.has(me)); m.checkpoint();
m.say('Go!', { who: 'Ivo' }); yield m.wait(2); ... m.complete(); })`. `zone()` makes areas, `all()` and
`any()` wait for several things, `restart()` returns to the last checkpoint after a loss (skipping
the lines already heard), and `save()`/`load()` keep it between sessions.

**Cutscenes** (`gs.cutscene`): `Cutscene([{ at, cam: [points], look, time }, { at, say, who }, { at, do }])`
moves the camera along smooth paths, shows lines and letterbox bars, runs actions on cue and can be
skipped. Put your camera at `scene.shot` each frame. Camera shakes follow Reduce motion.

**Quick-time prompts** (`gs.prompts`): `Prompts().start([{ kind: 'tap', x, y }, { kind: 'swipe', dir: 'left' },
{ kind: 'hold', hold: 1 }, { kind: 'mash', count: 8 }])` checks taps, swipes, holds and mashing in
time; `timeScale` slows the world while one shows; `ease` gives the player more time.

**Breaking things** (`gs.destruction`, 3D, three-pinata): `shatter(mesh, { pieces, at, world })` breaks
any mesh into real pieces (more near where it was hit) that fly with `gs.physics3d`; `slice(mesh, point,
normal)` cuts one in two; `Rubble` fades old pieces so phones stay fast. A whole building that knows what
holds it up is `Structure`: [Buildings that come apart](#buildings-that-come-apart).

**Stealth extras** (`gs.stealth`, on top of `gs.senses`): `lightAt(p, lamps)` is a light meter (walls
cast shadows) to feed the guards' eyes, `Takedown.check()` finds a guard you're behind, `Bodies` get
found and raise the alarm unless you hide them, `Floors` make gravel loud and carpet quiet, and
`Disguise` lets you walk past some guards until you do something odd.

**Gadgets** (`gs.gadgets`): `Grapple` (fire, swing, reel in), `Zipline`, and three hacking puzzles:
`Wires` (turn tiles till power reaches every one; always solvable), `Lock` (stop the marker in the
gap, pin by pin) and `Code` (repeat the sequence).

**Ball games with cars** (`gs.arena`, Rapier through `gs.physics3d`): `Arena(world, { w, l, goal, ball })`
builds the walls, curved ramps, ceiling and goals, keeps the score and clock (with overtime), adds
punch to touches, has boost pads, `predict()`s the ball's path for a landing marker, and keeps a
few seconds of replay (`playback(t)`). `BallCar` is a real suspension car with boost, jump, a second
jump that flips you the way you push, and air control. `chaseBall(car, arena)` is a simple
opponent to start from.

**Campaigns** (`gs.campaign`): `Campaign(chapters, { extras }).attach(api)` keeps which missions are
open (in order, or by stars), up to three stars each (score targets or named challenges), best
scores, collectibles and extras that unlock at a star count, saved compactly with `api.save()`.

**3D sound and music layers** (`gs.sound`): `Ears` puts sounds in the world with the browser's own 3D
audio (left/right and in front/behind in headphones, quieter with distance, `muffled` for behind a
wall). `ears.place(camera.position, forward)` each frame, then `ears.play('boom', pos)`,
`ears.tone()`, `ears.zzfx(pos, ...)`, and `ears.loop(pos)` for engines that follow something.

**Sound that knows the level**: give the ears the level and they work the rest out.
`new Ears({ level: world })` takes a `gs.physics3d` `World3D`, a `TileMap`, a `City`, `Voxels`, 2D
`Physics`, a `NavGrid`, a function `(from, dir, max) => metres to the first solid thing`, or a list
of those. Then:

- Every sound is **muffled by what stands between it and the ears**: quieter and duller behind a
  wall, more so behind a thick one, less through a doorway or round a corner (sound finds the way
  round). A `loop()` is checked again as it and the ears move, so an engine dulls as it passes behind
  a barn and clears as it comes out. `muffled: true` or a number 0..1 still says so yourself, and
  `muffled: false` leaves one sound clear (a voice in the player's own head).
- **The place gets its own echo**: a few rays a frame feel out the walls and the roof round the ears,
  and effects and voices (never the music) ring like the place they are in: a cupboard, a hall, a
  cave, a street with a slap back off the far houses, open country with none. It changes smoothly as
  the player walks from one to the next.

`ears.room` is what it has worked out (`{ size, walls, roof, enclosed, tail, wet, echo, delay }`),
`ears.blocked(pos)` is how muffled a point is (0 clear to 1 behind a thick wall) and `ears.heard(pos)`
is quieter behind walls too, so subtitles and "you heard that" hints agree with the sound. Options:
`hard` (0 carpet, snow and forest to 1 bare stone, default .6), `unit` (level units to a metre: 16 for
a map of 16-pixel tiles a metre across), `rays` (4 a frame) and `auto: false` to read `ears.room` and
set the echo yourself with `mixer.place({ tail, wet, echo, delay })`. Set `ears.level` again when the
level is another one. The sums alone, with no audio, are `gs.sound.acoustics` (`caster`, `blocked`,
`muffleOf`, `Room`). It costs a few rays a frame and one small search per sound behind a wall.

```js
const ears = new Ears({ level: world, hard: .8 });          // a stone keep
update(dt) { ears.place(cam.position, forward); }
ears.play('door', door.pos);                                 // dull if it is two rooms away
if (ears.room.roof < .3) rain.set({ vol: .5 }, 1);           // the rain is louder out of doors
```
**The sounds a world makes by itself** (`gs.sound.Foley`): with nothing more to call than
`foley.update(dt)` each frame, things that knock into each other sound of what they are made of, people's
feet sound of what they walk on, and engines rev with their speed through the gears. All made in code,
and placed with the ears if you give it some.

```js
const { Ears, Foley } = gs.sound;
ears = new Ears({ level: world });
foley = new Foley({ ears, world, marks, weather });       // in make(); world: a gs.physics3d World3D
foley.watch(person);                                        // a gs.models.human: a step where each foot comes down
foley.watch(truck);                                         // a gs.models.vehicle: its engine, tyres and skids
foley.watch(dog, { feet: 4, shoe: 'paw', weight: 30 });     // anything else: steps paced out along its way
phys.box(crateMesh, 1, 1, 1, { sound: 'wood' });            // or read from the mesh: planks are wood, rust is metal
update(dt) { phys.step(dt); person.move(dt, speed); foley.update(dt); }
```

- **Knocks**: two bodies of the world meeting at more than half a metre a second each sound of what they
  are made of: the lighter fully, the heavier (or the floor) a little under it, louder the harder and
  heavier, lower the bigger. Metal rings on, unless it landed on something soft; glass is bright; stone, dirt
  and wood thud. A body's `sound` option says what it is; else its mesh (`userData.sound`, a `gs.models`
  material or prop by its recipe, other materials by their names and how metallic they are). A heap
  settling makes six knocks a frame at most, and each thing one every 70 ms.
- **Steps**: a `gs.models.human` steps where each foot really comes down (its rig's own steps); anything
  else (an Object3D, a World3D mover, `{ x, y, z }`) has steps paced out along its way, and a landing after a
  fall. What is underfoot, the first that answers: your `ground(x, z, y)`, the weather's settled snow, the
  marks' snow, mud, sand and grass, the body of the world below (its `sound`, or the mesh of the level it
  hits: `World3D.ray()` now says which mesh, `hit.mesh`), dirt on a land, else stone (`under` changes that).
  Puddles splash too. `shoe`: `'boot'` (a heel that clicks on hard floors), `'bare'`, `'paw'` or `'hoof'`;
  `weight` in kg (heavier is louder and lower), and a run is louder than a walk.
- **Engines**: a `gs.models.vehicle` gets the engine its kind and style has (a saloon's petrol, a sports
  car's six, a lorry's diesel, a tank's tracks, a steam engine's chuffs and the rails' clack, an outboard,
  a propeller, a jet that spools up): revs through the gears with its speed, louder and brighter under load,
  tyres on what the road is, a squeal when it slides. A `World3D.vehicle()` and a `gs.vehicles` `Car` or `Kart`
  too, from their own speed and throttle. `watch(v, { engine, top, throttle: () => 0..1, vol })` to choose.
- By hand: `foley.hit(p, 'metal', { speed, size })`, `foley.step(p, 'gravel')`, `foley.surface(p)`.
  `Foley.materials` and `Foley.engines` list the names; `Foley.materialOf(mesh)` is what it reads a mesh as.

**Only so many sounds at once** (the voice cap): however many a game asks for, 32 play (a voice is one
tone or one burst of noise; the music is never counted). Past that a new sound quieter than all of those
playing is left out, and a louder one takes the place of the quietest, counting how far each has died away;
sounds at a point count as loud as the ears hear them, so the far ones give way first. The same sound asked
for many times at once (twenty coins picked up in one frame) plays three times, and only the eight
nearest sounds at a point get HRTF (the costly kind of 3D sound); the rest are plain left and right.
`mixer.voices(48)` for a game made of many small sounds that all matter; back to 32 when the round ends.

`music({ ..., drums2, lead2, layers: { drums2: .3, lead2: .7 } })` builds up with `tune.intensity(x)`:
quiet while sneaking, full when the fight starts.

**Living music** (`gs.sound.follow(song)`): the tune follows the play by itself. `live.feel(1)` on a
close call builds tension, it settles when things calm down, `live.lost()` brings it straight down,
`live.won()` gives a lift, and `live.tap()` on each input leans the tempo a little towards the
player's own pace (`pace`: taps a second that count as normal; `tempo: [.92, 1.12]` the range).
Call `live.update(dt)` each frame; give the song `layers` so the intensity has parts to bring in.
`brain: bot` keeps the tension up while a Tiny Brain's mood is high.

**Bigger levels on phones** (`gs.props`, 3D, InstancedMesh2): `Props` draws thousands of the same thing
(trees, rocks, crates) in one go, skips the ones off screen and swaps far ones for simpler shapes
made for you (`simplify()`, three's SimplifyModifier). `scatter()` spreads them over ground with
gaps and keep-out zones. `Areas` hides rooms you can't see into, and `Chunks` builds a big world
around the player a piece at a time and drops what's far away. Already built an `InstancedMesh` of still things (towers, trees,
track pieces)? `perCopy(mesh)` swaps it in place for one that skips the copies off screen, same look (`freeCopies(group)` when you throw
the level away).

A kind with no `lod` of its own gets its simpler shapes by itself in the Next Gen, AR and Board views once
there is enough of it to matter (200 triangles a copy and 60,000 in all): they are made in the background,
and each copy is drawn at the simplest one whose change can't be seen from where the camera is, so a
forest costs a fraction of its triangles and looks the same. `lod: 'auto'` asks for that for a smaller kind
too, and `lod: false` keeps every copy whole. See [Next Gen 3D](nextgen-3d.md) (detail levels for copies).

**Crowds** (`gs.props.Crowd`, Next Gen): a street, a stand full of fans or a herd, hundreds of animated people
or animals for the cost of a few draws. A person drawn the usual way has a skeleton of its own that is
posed in JavaScript every frame and is several draws by itself, which is fine for a squad and far too much
for three hundred. A crowd plays each kind's moves through once, writes where every bone is in every frame
into a texture, and from then on the graphics chip bends each member into its pose: a member is a few
numbers, and all of a kind at one level of detail are one draw.

```js
const { Crowd } = gs.props, { human, creature } = gs.models;
function make(api) {
  human.all([{ seed: 1, strands: false }, { seed: 2, sex: 'f', strands: false }]);     // sculpted first, as for any human()
  const crowd = new Crowd(view, { of: [human({ seed: 1, strands: false }), human({ seed: 2, sex: 'f', strands: false }), creature({ like: 'dog', fur: false })],
    moves: ['idle', 'walk', 'run'] });                                                 // the poses of their rigs the members will use
  return {
    reset() { crowd.clear(); for (let i = 0; i < 300; i++) crowd.add({ x: rnd(-40, 40), z: rnd(-40, 40), turn: rnd(0, 6.28), kind: i % 3, move: 'walk', size: rnd(.95, 1.05) }); },
    update(dt) {
      for (const p of crowd.list) { p.x += Math.sin(p.turn) * 1.3 * dt; p.z += Math.cos(p.turn) * 1.3 * dt; }   // move them as your game likes
      crowd.update(dt);                                                                // after the camera has moved
    },
  };
}
```

A member is `{ x, y, z, turn, move, size, tint, hide, data }`: change them and call `update(dt)`. The crowd
looks after the rest: a walk or run steps on by the ground the member really covered, so feet don't slide
(other moves run by the clock, and `member.done` turns true when one that plays once has ended); a new
`move` blends in over a quarter of a second; members out of view are not sent to the chip at all; each is
drawn only as finely as its size on screen needs (the figure's own detail levels, with simpler ones made
between and after them, down to about 500 triangles); they cast and take shadows on WebGL and WebGPU; and
frame generation is told how each one moved. `crowd.near(x, z, r)` lists the members round a point and
`crowd.ray(origin, dir, far)` finds the first one a shot or a tap meets (`{ member, distance, height }`,
height 0 at the feet and 1 at the top of the head). A move of your own: add it to the figure's rig
(`figure.rig.add('cheer', keys([...]), { time: 1.2 })`) before the crowd is made, and name it in `moves`.

What a crowd leaves out is what needs a skeleton: faces, hair in strands and fur (make the figures with
`strands: false` and `fur: false` so they look the same near and far), hands onto things, and feet planted
on slopes (give each member its ground height as `y`). For the one the player walks up to, hide the member
and stand a real `human()` in its place. Three hundred people and dogs walking in a field, on a build
machine's software renderer: 750 draws and 29 ms of the engine's time a frame with a skeleton each, 42
draws and 2.3 ms as a crowd (WebGL; 500 draws and 35 ms against 28 and 1.9 on WebGPU), for 370 KB of texture.

## Worlds, craft, soft things, cards and menus

As everywhere in the kit, these work things out and your game decides how it all looks.

**Outdoor worlds** (`gs.outdoors`, 3D, THREE.Terrain): `Land({ kind: 'islands', size: 200, high: 20, seed })`
makes terrain (`hills`, `mountains`, `rolling`, `islands`, `bumps`, `dunes`, `cracked`, `ridges`,
`smooth`, or your own `(x, z) => height`). `land.height(x, z)`, `normal()` and `slope()` answer where
the ground is, `flatten()` makes a pad for a village or a landing strip, `paint([[0, '#dc9'], [3, '#4a3']])`
colours it by height in your palette, `solid(world)` makes it solid in `gs.physics3d`, `grass()` scatters
blades that sway (only near the camera), and `scatter(props, 'tree', 300, { above: 1, steep: .3 })` puts
`gs.props` things on suitable ground. `land.rocks({ caves, shapes })` puts real rock on it (cliffs that overhang, caves, arches: see
[Cliffs, caves and overhangs](#cliffs-caves-and-overhangs)). For a camera down in the grass (a sniper's nest, a crawl, a close-up), `land.meadow({ reach: 22, gap: .55 })`
keeps a square of thick tufts round the camera wherever it goes: see [Next Gen outdoor looks](nextgen-3d.md#outdoor-looks-ground-hills-rock-leaves-water-and-lava). `tree({ kind: 'pine' | 'round' | 'palm' | 'bush' })` and `rock()`
make simple shapes to scatter. Next Gen worlds can paint it instead with `looks.ground` (fields, hedges, lanes, mud, puddles), ring it with far hills (`horizon(land)`) and give rocks and leaves their looks: see [Next Gen outdoor looks](nextgen-3d.md#outdoor-looks-ground-hills-rock-leaves-water-and-lava). `River(stream)` and `FloodWater(flood)` draw `gs.flow` rivers, waterfalls, lava and floods (see Flowing liquids). `Water({ level, waves })` is a sea of rolling waves you can ask about
anywhere (`height(x, z)`, `normal`, `depth(p)`); call `update(dt, camera.position)` each frame. It can be disturbed too (rings, splashes, wakes,
rain, a shore, the view from under it): see [Water you can disturb](#water-you-can-disturb).

`new Wind({ x: 3, z: 0, gust: .4 })` is one wind for the whole world: `land.wind = wind` sways the
grass with it, `looks.leaves(m, { wind })` makes the trees lean and stream downwind, `Weather({ wind })`
blows the rain, `new Particles(v, { wind, blow: .6 })` carries smoke and dust, `v.air({ wind })` drifts
the cloud shadows, and `wind.at(x, z)` is the push right there (gusts roll across the land downwind, so
grass shows a gust before it reaches you): use it for bullets, flags and sails. `wind.update(dt)` each
frame; change `wind.x`, `wind.z` any time. `impostor(geometry, material)` bakes a far-away stand-in for
a tree: a few crossed cards with pictures of the real tree, lit live. Use it as the last `gs.props`
level: `lod: [[90, mid], [240, imp.geometry, imp.material]]` (a level can have a material of its own).

**Cities** (`gs.city`, 3D): `new City(view, { seed, blocks: 6, style: 'downtown' | 'oldtown' | 'harbour' | 'suburb' })`
makes a made-up city from a seed: streets and junctions with traffic lights, buildings with lit windows,
shops, roof tanks and fire escapes, parks, trees and lamps, cars that keep to their lanes and stop at
red, and people who cross at the corners. `city.update(dt, player)` each frame; `city.avoid(player)`
makes cars brake for you. It answers `collide`, `ray`, `route(a, b)` (a `gs.paths` Path along the
roads), `spot('door' | 'rooftop' | ...)`, `cars.hit`, `people.scare`, and gives the plan as plain
numbers for your own map. The full guide is [docs/city.md](city.md).

**Planes, boats and hover craft** (`gs.craft`): `Plane({ at, speed, ground })` flies like arcade games
feel: it banks into turns, holds its height when level, stalls when slow, lands, touches down and
crashes (`plane.events`). Feed it `update(dt, { throttle, pitch, roll, yaw, brake })` from a stick or
tilt. `Boat(water, { power, turn, drift })` rides the waves with pitch and roll and leaves `wake`
points for your spray. `Hover` is a drone or hover bike. `Floater(body, water)` makes any physics3d
body bob on the water (crates, buoys, barrels).

**Soft things** (`gs.soft`): `Soft()` is a light Verlet world (2D, or 3D with `dims: 3`): `cloth()` (pinned
along the top, tears if you like), `rope()`, `jelly()` (a pressure blob that squashes and springs
back), with round and box `solids` to hit. `grab(x, y)` lets a finger pull a point, `cut()` slices
everything a swipe crosses, `push()` blasts and `wind()` blows. Draw the points your way, or send a
3D cloth to a mesh with `toGeometry()`. `Liquid()` is a simple 2D liquid of particles that pools,
splashes and pours (`pour()`, `near()`, `count()`) for water and goo puzzles.

**Cards** (`gs.cards`): `Deck({ seed, jokers, decks })` shuffles, deals, draws (reshuffling the discards
when it runs out) and saves to `api.save`. `total()` scores a blackjack-style hand, `groups()` finds
sets and runs for rummy, `poker()` names the best hand (pokersolver) and `winners()` compares them,
`stacks()` checks patience moves. Cards are plain `{ suit, rank, name, red }` objects: draw them in
your style. No real-money gambling.

**Dice** (`gs.dice`): `roll('4d6kh3')` reads dice notation (keep highest or lowest, `!` explodes, `+`/`-`),
`odds(2, 6)` gives every total's chance. `Dice(5)` tumbles for a moment then lands on the result
(`hold(i)` keeps dice back for dice-poker games). `Dice3D(world, meshes)` throws real cubes in
`gs.physics3d` and reads which face ends up on top.

**Words** (`gs.words`, SCOWL lists, about 60,000 English words, British spellings too; loads on first
use, so make `new Words()` in `make()` or `reset()`): `has()`, `random({ length: 5, seed: gs.math.daily('word') })`
(only common, clean words are picked), `from('tsrleai')` (every word in some letters, `?` for a
blank), `anagrams()`, `match('c?t')`, `find(grid)` (words snaking through a letter grid with their
paths), `compare(guess, answer)` (hit / near / miss, fair with repeated letters), `safe()` for words
players type, and `Bag` for letter tiles with `score()`.

**Menus and HUDs with no look** (`gs.ui`, Yoga flexbox; loads on first use): describe boxes (`dir`, `gap`,
`pad`, `grow`, `justify`, `align`, `w`/`h` in units or `'%'`, `scroll: 'y'` lists, `at` for overlays)
and `UI(W, H, tree)` works out where each goes. It handles taps, holds, drags, scrolling with
momentum, and moving focus with arrows or a controller (`key()`), and sends `tap`, `hold`, `drag`
and `back` events. `ui.each((node, box) => ...)` hands you every visible box with its state
(`pressed`, `focused`, `press` for a bounce, your own `data`) and you paint it however your game
looks. `wrap(c, text, width)` splits text into lines.

## Hearing, doodles and the phone's AI

All three run on the phone itself: nothing the mic hears, nothing drawn and nothing said leaves it.
They load the first time a game uses them, so make them in `make()` or `reset()`.

**Everyday sounds** (`gs.hear.Sounds`): Google's YAMNet knows 521 sounds. Name the ones you want,
start from a tap, and read them each frame:

```js
const { Sounds, Voice } = gs.hear;
reset() { ears = new Sounds({ want: ['Dog', 'Whistling', 'Clapping', 'Laughter'] }); }
down() { if (!ears.running) ears.start(); /* ...and the touch way to play */ }
update(dt) { ears.update(dt); if (ears.heard('Dog')) scareCats(); }
```

`heard(name)` is true once each time the sound starts, `hearing(name)` is how sure it is right now
(0..1) and `top` is the surest sound. Options: `sure` (.3) and `every` (seconds between looks, .25).
Some names: `'Speech'`, `'Singing'`, `'Whistling'`, `'Clapping'`, `'Finger snapping'`, `'Laughter'`,
`'Dog'`, `'Cat'`, `'Bird'`, `'Knock'`, `'Bell'`, `'Cough'`, `'Snoring'`, `'Music'`. In the phone apps YAMNet
runs on the phone's AI chip with the mic read natively (a 5 MB model); on the web the MediaPipe engine
and model (about 11 MB) download once from our games server; `npm run ml` fetches them for `npm run dev`.

**Spoken commands** (`gs.hear.Voice`): uses the phone's own on-device recogniser (iPhone, and
Android 12 and later). Phones without one say `available` false, so keep touch controls:

```js
voice = new Voice({ words: ['jump', 'fire'], also: { fire: ['shoot', 'bang'] } });
down() { voice.start(); }               // false if this phone can't listen on the phone itself
update(dt) { if (voice.said('jump')) jump(); }
```

`said(word)` is true once each time it's said, a near miss of one letter still counts ("jumb"), and
`heard` lists the words caught lately, for showing on screen.

**Doodles** (`gs.doodle.Doodle`): a tiny model (about 100 KB, trained on Google's Quick, Draw!
drawings) names what the player drew, in a few milliseconds:

```js
const { Doodle } = gs.doodle;
reset() { doodle = new Doodle(); strokes = []; }
down(x, y) { strokes.push([{ x, y }]); }
move(x, y, pressed) { if (pressed) strokes.at(-1).push({ x, y }); }
up() { const best = doodle.guess(strokes, { among: ['sword', 'umbrella', 'bridge'] })[0]; if (best.sure > .5) use(best.name); }
```

It knows 200 things (`Doodle.things`): sword, star, circle, triangle, square, house, tree, cat,
fish, bird, sun, moon, cloud, lightning, umbrella, key, ladder, bridge, car, sailboat, airplane,
flower, apple, snowman, mountain, hat, crown, envelope, eye, smiley face, fork, hammer, axe, door,
candle, clock, cup, diamond, banana, bicycle, spider, snake, rainbow, octopus, light bulb, hot air
balloon, ant, bat, bear, bee, butterfly, camel, cow, crab, crocodile, dog, dolphin, dragon, duck,
elephant, flamingo, frog, giraffe, hedgehog, horse, kangaroo, lion, lobster, monkey, mosquito,
mouse, owl, panda, parrot, penguin, pig, rabbit, raccoon, rhinoceros, scorpion, sea turtle, shark,
sheep, snail, squirrel, swan, tiger, whale, zebra, bread, broccoli, cake, carrot, donut, grapes,
hamburger, hot dog, ice cream, lollipop, mushroom, onion, pear, pineapple, pizza, popsicle,
strawberry, watermelon, peanut, anvil, backpack, basket, book, boomerang, bucket, broom, camera,
cannon, compass, drums, dumbbell, eyeglasses, feather, flashlight, guitar, headphones, helmet,
hourglass, knife, lantern, leaf, map, microphone, necklace, paintbrush, parachute, pencil, piano,
rake, saw, scissors, screwdriver, shovel, skull, snowflake, spoon, teapot, telephone, tent, tooth,
trumpet, violin, wheel, wine glass, shoe, sock, t-shirt, pants, bowtie, mailbox, megaphone,
suitcase, vase, barn, bus, canoe, castle, church, fence, flying saucer, helicopter, lighthouse,
motorbike, palm tree, cactus, rain, skateboard, skyscraper, stairs, stop sign, submarine, tornado,
tractor, traffic light, train, truck, windmill, campfire, bed, chair, table, bench, television,
laptop, hand, moustache, mermaid, angel, soccer ball, tennis racquet, basketball.

Measured on drawings it never saw: 76 in 100 are named right among all 200, 89 in 100 are in its
first three guesses, and 96 in 100 are right when the game asks it to choose among five. So pass
`among` with the few things your game cares about, and take the top guess only when its `sure` is
high. Animals that look alike as doodles are the hard ones (dog, bear, bird, frog, raccoon and tiger
are right a third to a half of the time among all 200): don't put two of those in one `among`. The
model is about 440 KB and is only fetched by a game that uses it. For plain shapes, `gs.strokes`
`Shapes` needs no model.

**The phone's own AI** (`gs.phoneai.PhoneAI`): newer phones have a language model built in (Apple
Intelligence on iPhone, Gemini Nano on Android, the browser's own on the web). Use it for flavour:
a greeting, a taunt, a riddle that changes each time. Most phones don't have one, so every `ask` has
a written `fallback`, and the game must play the same without it.

```js
const { PhoneAI } = gs.phoneai;
const keeper = new PhoneAI({ persona: 'a grumpy old lighthouse keeper', words: 20 });
reset() { line = 'Mind the rocks.'; keeper.ask('Greet the player, who just arrived by boat.', { fallback: 'Mind the rocks.' }).then(t => line = t); }
```

Guard rails, always on: the model is told it's a character in a family game; answers are cut to
`words`, and any answer with a link, an email, a long number or a blocked word is dropped for the
fallback. One ask at a time, at most one every 2 seconds, each giving up after `timeout` seconds (4).
The same prompt gives the same answer for the round (`forget()` for new ones, `fresh: true` for one).

## Feel, sound, touch and 2D animation (round 9)

**Rich haptics** (`gs.device.hapticPattern`): feel that changes over time. Each event is a tap (no `len`)
or a buzz (`len` in seconds) with `strength` and `sharpness` 0..1 (sharp is a crisp click, soft a deep
thud), and a buzz can fade or swell to `to`. `at` is seconds from now, so start a sound at the same
moment and they line up: `hapticPattern([{ at: 0, strength: 1, sharpness: .9 }, { at: .1, len: .4, strength: .8, to: 0, sharpness: .2 }])`.
Ready-made: `hapticPattern('heartbeat')`, `'explosion'`, `'charge'` (`{ len: 1.5 }`), `'engine'`, `'rain'`,
`'rumble'`, `'thud'`, `'tap'`, `'success'`, `'fail'`. iPhones use Core Haptics and Android the
vibrator's strength control and haptic primitives (`plugins/rich-haptics`); other phones get the
closest taps or buzzes. The player's haptics setting always applies.

**Mic games** (`gs.device.startMic()`, from a tap): besides `level()`, the mic now hears `pitch()`
(`{ hz, note: 'A4', midi, clarity }` of a sung, hummed or whistled note, or null; pitchy, the McLeod
pitch method), `blow()` (0..1, blowing on the mic), `clapped()` (true once per clap, snap or tap on the
phone) and `whistle()` (Hz, or 0). Read them every frame, and always give a touch way to play.

**Two fingers** (`gs.controls.TwoFingers`): pinch, twist and two-finger drag, with your one-finger
`Gestures` still working through `one:`. Callbacks get the change since last time (`pinch(scale, x, y)`,
`twist(angle, x, y)`, `pan(dx, dy)`), or read `scale`, `angle`, `x`, `y` and `active`. When the second
finger lands the one-finger gesture is dropped, so a pinch never ends in a stray tap.

**The mixer** (`gs.sound.mixer`): every sound goes through a channel (`'sfx'`, `'music'` for `music()`
and Tone.js, `'voice'`, or your own with `tone(f, { bus: 'alarm' })`), then a shared room and muffle.
`mixer.volume('music', .4)`, `mixer.duck('music', .3, .8)` (dip it for a big moment), `mixer.room('cave')`
(`'room'`, `'hall'`, `'cave'`, `'pipe'` or `{ reverb, size, echo, delay }`) and `mixer.muffle(.8)` (underwater,
stunned, inside a box), `mixer.voices(48)` (how many sounds at once: 32). `mixer.place({ tail, wet, echo, delay })` is the echo of the place the listener
stands in, for effects and voices only: `new Ears({ level })` sets it from the level by itself, or set
it for a place you know (`{ tail: 3.5, wet: .4 }` is a cathedral). It all goes back to normal when the round ends.

**Speech** (`gs.sound.say('Watch out!', { pitch, rate, lang })`): characters talk with the phone's own
voices (no sound files; iPhone and Android speech, the browser's on the web). It returns a promise
that ends when the line is said, dips the music while it talks, follows the player's mute and stops
with the round. `stopTalking()`, `talking()`. Always show the words on screen too.

Give each character **a voice of their own**, cast from the voices the phone has:
`say('Minuted.', { voice: 'woman' })`, `say("I'll have that back.", { voice: { kind: 'man', lang: ['en-AU', 'en-GB'], take: 1 } })`.
`kind` is `'woman'`, `'man'` or `'any'`; `lang` lists the accents to try, in order; `take: 1` is the
second such voice, so two men in one scene sound different; `like: ['Daniel']` prefers a voice by name
where the phone has it. A phone with no voice of that kind uses its own, a little lower or higher, so
the cast still differs. A real voice at its own pitch sounds far more human than one bent a long way,
so cast first and keep `pitch` near 1. `voices()` resolves to what this phone has.

**Timing** is most of a line's character. An array is said part by part, with pauses in seconds
between, and a part can have its own delivery: `say(['Bold.', .3, 'Visionary.', .5, { text: 'Rectangular.', rate: .85 }], { voice: 'woman' })`.

**A shaped voice** makes the same phone voice into a character: `say('Door three is opening.', { voice: 'woman', fx: 'tannoy' })`,
`say('Copy that.', { voice: 'man', size: 1.15, fx: 'radio' })`. `size` is the build of the speaker: 1.15 is a
bigger person (deeper in every way, at the same pace), .85 a smaller one (.6 to 1.6). `fx` is what the voice
comes through:

| fx | sounds like |
| --- | --- |
| `'radio'` | a handheld radio: narrow, overdriven, a burst of static as it keys up and lets go |
| `'tannoy'` | a loudspeaker in a hall: honky, with slap echoes |
| `'phone'` | a telephone line |
| `'megaphone'` | louder and harsher than a tannoy, one echo |
| `'box'` | from inside something: a cupboard, a crate, a door |
| `'bright'` | an advert: crisp and evened out |
| `'warm'` | close and low, a narrator |
| `'robot'` | a metal ring and a buzz |
| `'tiny'` | a toy's speaker, a very small creature |
| `'clean'` | no treatment (the voice still goes through the mixer) |

or a recipe of your own, which can start from a named one: `{ like: 'radio', drive: .2, mix: .6 }` (the parts:
`low`, `high`, `peaks`, `bass`, `treble`, `drive`, `ring`, `comb`, `squeeze`, `echo`, `squelch`, `hiss`, `mix`;
the types say what each is). With a `size` or an `fx` the phone writes the line to sound instead of speaking
it, and the kit plays that through the mixer's `'voice'` channel. So a shaped line is as loud on every phone
and with every treatment, `mixer.room()`, `mixer.muffle()` and the level's own echo (`Ears`) reach it like
any other sound, and `onWord` is called for every word (lip sync that keeps time). A line said in parts
through one radio stays keyed up between them. This needs the Android or iPhone app: in a browser, or on a
phone whose speech engine can't write to sound, the line is spoken as before, with `size` as a lean of its
pitch and no `fx`; `shaped()` says which (true once a line has played shaped, false where it can't be, null
before the first try). A shaped line starts a moment later than a plain one, because the phone writes all of
it first: open with a short pause (`say([.2, 'Ah. A door.'], { fx: 'tannoy' })`), which is when the kit
gets the line ready. A line said again starts at once.

**Timelines** (`gs.juice.Timeline`, anime.js; loads on first use, so make it in `make()` or `reset()`):
steps one after another, together or staggered, in seconds and driven by your `dt` so they pause
with the game. `new Timeline({ ease: 'outBack' }).to(title, { y: 120, duration: .5 }).to(stars, { s: 1, duration: .3, delay: stagger(.1) }, '+=.1').call(fn, .6)`,
then `tl.update(dt)`; `done`, `seek()`, `pause()`, `speed`, `loop: true`. For a single number, `Tweens` is still the lightest.

**Paths** (`gs.paths`): `new Path(points, { loop, kind: 'smooth' | 'line' | 'bezier' })` in 2D or 3D, measured
so `Follower(path, { speed, end: 'loop' | 'pingpong' | 'stop' })` moves at a steady speed. `at(d)`,
`offset(d, side)` (lanes, kerbs), `nearest(x, y)` (snap onto the track), `spaced(step)` (coins along a
route) and `trace(c)` (stroke it your way).

**Auto-tiling** (`map.edges(tx, ty, same)` on `gs.tiles.TileMap`): which neighbours join, as a 4-bit
`mask` (16 pieces) or the 47-piece `blob` (`BLOB_MASKS` lists them), so drawn-in-code walls, paths and
water pick the right edge and corner pieces.

**2D bone characters** (`gs.bones.Rig`): cut-out figures of parts that hang off each other. `bone()`
adds parts (with `wobble` for ears, tails and hair that lag and swing), `pose()` and `blend()` set
angles, `clip()` + `play()` run keyframes with events (`on('step')`), `reach(upper, lower, x, y)` is
two-bone IK (a hand on a ledge, a foot on the ground), `look()` turns a head, `kick()` jolts a wobbly
part, and `draw(c, fn)` calls you for each part already moved and turned into place.

**Parent and child** (`gs.things.Node`): a turret on a tank, a rider on a horse, a moon round a
planet. Nodes have `x`, `y`, `angle`, `scale` relative to their parent; `root.update()` works out
`wx`, `wy`, `wangle`, `wscale` for all of them. `toWorld`, `toLocal`, `hit` (rotated boxes and circles),
`pick` (the top node under a tap), `attach(newParent)` (keeps it where it is) and `draw(c, fn)`.

**Next Gen extras** (`gs.hd` HDView): `v.decal(mesh, point, normal, { size, colour, paint, life })` puts a
mark on a surface that wraps over its shape (scorches, footprints, paint; capped at 40, oldest
first), `v.bakeLight([x, y, z], { radius })` bakes the light around a point into a light probe so rooms
and caves pick up the colour of their walls and windows (several blend as the camera, or
`v.probeAt`, moves; bake once after building the level: it returns a promise and joins a frame or two later), `v.bounce(box)` adds bounce light over a level (a grid of probes: a red wall tints the floor, light from a door fills a room; WebGL and WebGPU), `v.room(box)` gives shiny things in a room box-projected reflections of that room, `v.detail(meshes)` asks for cluster detail on meshes under 20,000 triangles (big still meshes get it by themselves: each part is drawn only as finely as shows, see docs/nextgen-3d.md; `v.detail(meshes, false)` draws them whole), what is fully hidden behind other things is left out of the frame by itself (occlusion culling, from the last frame's own depth: nothing to list; `mesh.userData.noOcclude = true` always draws a mesh, and `v.occluders(boxes)` adds big solid boxes of your own, as `gs.city` does for its buildings), and `v.shafts = 1` adds sun shafts streaming
past whatever blocks the sky (not on the lowest tier).

## Fixed game tick

By default `update(dt)` runs once a frame with however long the frame took, so a game plays a little
differently at 30, 60 and 120 fps (a jump peaks at a slightly different height, a spawn lands a frame
apart) and a recorded run can't be replayed exactly. Add `tick: 60` (or 30, 120; `true` means 60) to the
definition and the app calls `update(1 / 60)` a whole number of times each frame instead, whatever the
screen does: two updates on a 30 fps frame, one on a 60 fps frame, one every other frame at 120 fps.
After a long hitch it runs at most 8 and lets the game fall behind rather than freeze.

The frame then shows a moment between two ticks: `draw(c, alpha)` gets how far along it is (0..1; always
1 without a tick), also on `gs.tick.alpha`. Keep where things were before the update and draw
`gs.tick.mix(before, now)` (and `gs.tick.turn` for angles) so motion stays smooth on 90 and 120 Hz screens.
The kits do it for you where they can: `gs.physics` things have `sx`, `sy`, `sangle` (and `phys.path()`
uses them), and `new World3D({ smooth: true })` moves its meshes between ticks just before each frame
(aim the camera in `draw()` from the meshes then, so they agree). `gs.tick.rate`, `.on`, `.dt` and
`.count` (ticks this round) are there too. Physics worlds take exactly one step per tick, so a round
is the same on every phone.

## Music composer

`gs.sound.compose({ mood, seed })` writes an original looping tune: chords from the mood's
progressions, a bass line, pads, an arpeggio, drums, and a melody built from a two-bar idea that comes
back fitted to the next chords and ends on the home note. The same seed always gives the same tune, so
use your game's id and every game gets its own soundtrack. Moods: `happy`, `calm`, `tense`, `spooky`,
`heroic`, `sad`, `silly`, `chase`, `puzzle`. `tempo`, `key` ('D', 'Bb') and `bars: 8` (a second half
that answers the first) are optional.

```js
const tune = music(compose({ mood: 'chase', seed: 'my-game' }));
update(dt) { if (!tune.playing) tune.start(); tune.intensity(danger); }   // arpeggio, busier drums, harmony
```

For a tune that simply plays under the rounds and follows the action, put `music: 'chase'` in the
definition instead (see [Sound](#sound)): the app does all of this for you.

It returns music()'s parts with `layers: { arp, drums2, lead2 }`, so `intensity()` and `follow()` build
it up. `info` has the key, mode and chords, plus `win` and `lose` jingles for `notes()` in the same key.
Music theory (scales and modes) comes from Tonal (MIT).

## Puzzles and opponents

`gs.solve.Puzzle`: cells with possible values and rules between them.
`cell(id, values)`, `allDiff(ids)` (rows, boxes, cages), `sum(ids, total)`, `rule(ids, ok)` (your own
test of the cells' values). Then:

- `solve({ known, limit, rng })`: `{ solution, count }`; with `rng` a random answer (a fresh filled grid).
- `unique(clues)`: exactly one answer?
- `carve(solution, { rng, grade, keep })`: takes clues away while there's still one answer and it's no
  harder than `grade` (`'easy'` keeps it solvable by working things out alone, no guessing).
- `grade(clues)`: `{ level: 'easy' | 'medium' | 'hard' | 'expert', guesses, open }`, judged the way
  people solve: what deduction finds first ("only this fits", "the last place for a 7"), guessing after.
- `hint(clues, moves)`: a cell the player can work out now and why (`only`, `last`, `sum`, `rule`;
  `guess` if they're stuck), plus `wrong`: moves that don't match the answer.

`gs.solve.Search`: a computer opponent for turn-based games. Give it `moves(state)`, `play(state, move)`
(a new state), `turn(state)`, `score(state, player)` and optionally `over(state)` / `winner(state)`.
`best(state, { time: 60, skill })` looks ahead within the time (minimax with alpha-beta and iterative
deepening; `mode: 'mcts'` for games with dice, more than two players or huge choice). `skill` below 1
picks good-but-not-best moves more often, so mistakes look human. `rank(state)` lists every move's value.
`think(state, { time, depth, skill })` is `best()` spread over frames, for 3D games: it returns a job;
call `job.step(5)` (milliseconds to spend now) each update until it returns true, then play `job.move`.
Board games get this in one line: `await table.think(search, state, { time, skill, wait })`.

## Board games

`gs.tabletop` is the kit for Board games (`era: 'board'`): a board on a table in a 3D room that the
AR chip also sets down on the player's floor, with the camera, picking, turns written as `async`
functions, real dice, pieces made in code and chess. The guide, with the options and a starter, is
[board-games.md](board-games.md); `npm run new my-game --style board` makes a working one.

## Body, cut-outs and hand signs

More of `gs.vision`, used like `Face` and `Hands` (make in `make()` or `reset()`, `start()` from a tap,
`update()` each frame). They run in the web view with MediaPipe on the graphics chip; positions are
0..1 and mirrored like a selfie.

- `Body`: stand back so the camera sees you. `joints` by name (`nose`, `leftHand`, `rightKnee`...: `x`,
  `y`, `seen`), and moves: `armsUp`, `leftUp`, `rightUp`, `lean` (-1..1), `squat` (0..1), `jump` and
  `clap` (true on the update they happen). Dance, dodge, exercise and goalkeeper games.
- `CutOut`: the player cut out of the camera picture. `cut.picture` is a canvas, see-through round
  the person, to draw inside your game (a face in the spaceship window, yourself on the cover of the
  level). `soft` sets the edge.
- `Signs`: `thumbs-up`, `thumbs-down`, `victory`, `open-palm`, `fist`, `point-up`, `love`. `sign` (the
  first hand's), `showing(name)`, and `made` (the sign that just started, for one-shot actions).

Like every camera game, keep a touch way to play.

## A camera that knows things

Two more of `gs.vision`, and these look out of the **back** of the phone at the room: `Objects` knows
80 everyday things by name, and `Scanner` reads barcodes and QR codes. Make them in `make()` or
`reset()`, `start()` them from a tap, call `update()` every frame.

```js
const { Objects, Scanner } = gs.vision;

// a scavenger hunt
reset() { eyes = new Objects({ want: ['cup', 'banana', 'book', 'spoon'], shape: W / H }); }
down()  { eyes.start(); }                               // from a tap: asks for the camera
update(dt) {
  eyes.update();
  if (eyes.seen(target)) { score++; api.score(score); feel.coin(W / 2, H / 2); target = nextThing(); }
}
draw(c) {
  if (eyes.picture) c.drawImage(eyes.picture, 0, 0, W, H);          // the camera, already W x H shaped
  for (const o of eyes.list) c.strokeRect(o.left * W, o.top * H, o.w * W, o.h * H);
}
```

- **`Objects({ want, sure, max, every, shape, camera })`**: `want` is the names to look for (leave it
  out for all 80: `Objects.names` lists them, from `'cup'`, `'fork'`, `'banana'`, `'book'`, `'clock'`
  and `'scissors'` to `'dog'`, `'chair'`, `'bicycle'` and `'teddy bear'`; a few other words work too,
  such as `'phone'`, `'sofa'`, `'fridge'` and `'mug'`). A name it doesn't know throws when the game
  is made, so a typo shows up straight away. `sure` is how sure it must be (0..1, `.5`), `max` how many
  things at once (5), `every` the seconds between looks (`.25`).
  - `seen(name)`: true **once** each time one comes into view (it has to be there two looks running,
    so one blurry frame doesn't count). `seen()` with no name gives the name of whatever just arrived.
  - `seeing(name)`: how sure it is that one is in view now (0 when not). `count(name)`: how many.
  - `list`: what this look found, surest first: `{ name, sure, x, y, w, h, left, top }` (`x`, `y` is
    the middle). `top` is the surest, `found` whether there is anything.
- **`Scanner({ kinds, every, shape, camera })`**: reads QR codes and the striped codes on anything from
  a cereal box to a library book (`Scanner.kinds`: `'qr'`, `'ean-13'`, `'ean-8'`, `'upc-a'`, `'upc-e'`,
  `'code-128'`, `'code-39'`, `'code-93'`, `'codabar'`, `'itf'`, `'data-matrix'`, `'aztec'`, `'pdf417'`).
  - `scan()`: the code that has just been read, **once** each time one comes into view (else null):
    `{ text, kind, seed, x, y, w, h, left, top, corners }`.
  - `seed` is a whole number made from the text, the same for the same code on every phone and far
    apart for codes one digit apart: hand it to `gs.art.creature(seed)`, `gs.gen.dungeon(40, 30, { seed })`,
    `gs.math.rng(seed)`. A whole kitchen becomes a deck of monsters.
  - `code` is the code in view now (or null), `list` all of them, `backend` which reader is at work.
  - `Scanner.seed('any text')` gives the seed for a typed word.

```js
reset() { scanner = new Scanner({ shape: 1 }); monster = null; }
down(x, y) { if (shuffle.hit(x, y)) monster = gs.art.creature(Math.random() * 1e9 | 0); else scanner.start(); }   // "Surprise me"
update(dt) { scanner.update(); const code = scanner.scan(); if (code) { monster = gs.art.creature(code.seed); feel.powerup(W / 2, H / 2); } }
draw(c) { if (scanner.picture) c.drawImage(scanner.picture, 30, 60, 300, 300); /* a square window onto the camera */ }
```

**The picture and positions.** `picture` is a canvas of what the camera sees, already cut to the
`shape` you asked for (width / height: `W / H` for the whole card, `1` for a square window), so draw
it as it is and nothing is stretched. Every position is 0..1 of that picture: multiply by the size you
drew it at. `{ camera: 'front' }` uses the selfie camera, mirrored. `ready` turns true once the camera
is running; `failed` says why if the player said no or the phone has no camera.

**How they work.** Everything happens on the phone and no picture leaves it. `Objects` is Google's
EfficientDet-Lite0 through MediaPipe (a 7 MB model, downloaded the first time such a game is played).
It takes a few hundredths of a second a look, which is why it looks four times a second and not every
frame. `Scanner` uses the phone's own barcode reader where the web view has one (Android) and ZXing
elsewhere (iPhone), reading in the background so the game never waits for it.

**Always give another way in.** Not everyone has a banana or a barcode to hand, and some players say
no to the camera: a "Skip" for a thing nobody can find, a "Surprise me" button beside "Scan". The
model knows what a cup looks like in most kitchens, not in all of them, so score finding things, never
failing to.

## Steps, air pressure, light, proximity

On `gs.device`, each starts the first time you read it and stops when the round ends; each returns
null until it's running (and allowed), so a game always has a touch way to play.

- `steps()`: `{ count, new, perMinute }` since the round started. Step counters report in bursts every
  few seconds, so count steps rather than timing jumps by them. Android asks for physical activity
  access, iPhone for motion and fitness, the first time.
- `pressure()`: `{ hPa, height }`, height being metres up or down since the round started (a floor is
  about 3 m; holding the phone high is about 1 m, so smooth it).
- `light()`: `{ lux, dark }` (Android, and browsers with AmbientLightSensor).
- `near()`: something right over the top of the phone (Android).
- `hasSensor(kind)`: true or false (null while the phone is still being asked).

iPhones don't share the light sensor, and their proximity sensor turns the screen off, so those two are
Android only. The card says which sensors a game uses, as it does for the camera and mic.

## The real world: sun, moon, battery, headphones

`gs.real` turns things about the player's real surroundings into game inputs. All of it is worked out
on the phone (the sun and moon with SunCalc's maths), nothing is sent anywhere, and none of it asks for
a permission.

```js
const { sun, moon, battery, headphones } = gs.real;

reset() { const s = sun(); night = !s.up; stars = 1 - s.light; }      // dark outside? the level starts at night
update(dt) { if (battery().charging) hero.energy += dt; }             // plug the phone in to charge the hero
draw(c) { if (moon().name === 'full') drawWerewolf(c); }
```

- `sun(place)`: `up`, `height` (degrees above the horizon), `compass` (degrees clockwise from north,
  like `gs.device.heading()`), `light` (0 at night to 1 in full day, smooth through dawn and dusk),
  `part` (`'night'`, `'dawn'`, `'day'`, `'dusk'`), `rise`, `set` and `noon` (hours on the phone's clock;
  null where the sun doesn't rise or set today) and `hour`, the hour to give `gs.sky`'s `Sky` so its sky
  matches the real one (6 at sunrise, 12 at the sun's highest, 18 at sunset).
- `moon(place)`: `phase` (0 new, .25 first quarter, .5 full, .75 last quarter), `lit` (0 to 1), `waxing`,
  `name` (`'new'`, `'waxing crescent'`, `'first quarter'`, `'waxing gibbous'`, `'full'`, `'waning gibbous'`,
  `'last quarter'`, `'waning crescent'`), and `up`, `height`, `compass`.
- `battery()`: `level` (0 to 1) and `charging`, both null where the phone won't say (iPhones in a
  browser), and `saver` (the phone's power saving mode is on). Read about every 15 seconds.
- `headphones()`: true, false, or null when the phone won't say (most browsers, and the first moment
  after a game first asks). Wired, USB and Bluetooth all count; a Bluetooth speaker can't be told from
  Bluetooth headphones.

`place` is a `{ lat, lon }` from `api.location()` ([Location](#location)). Without one, `sun()` and
`moon()` guess where the player is from the phone's clock and time zone: right about day and night,
rough about the exact angle, and the result says `guess: true`. The moon's phase is the same everywhere.
Pass a second argument (a `Date` or a time in ms) to ask about another moment: tonight, or next full moon.

Keep these for flavour and for play that is as fair at night as by day. A game that can only be won at
noon, on a full battery or with headphones in isn't quick or fair, so never make one the only way to win.

## Voxel worlds

`gs.voxels.Voxels` (3D, lazy): an editable world of blocks, drawn with three's standard material so it
looks the same on WebGL and WebGPU and takes your scene's lights and shadows.

```js
world = new Voxels({ size: [64, 32, 64] }).generate({ seed: 'my-game', kind: 'hills' });
view.scene.add(world.group);
update(dt) { world.update(); me.vy -= 25 * dt; if (world.move(me, vx * dt, me.vy * dt, vz * dt, { step: 1 }).ground) me.vy = 0; }
```

- Blocks: `get`, `set(x, y, z, BLOCKS.stone)`, `solid`, `fill(box)`, `sphere(x, y, z, r)` (digs or
  blasts; says which blocks went), `top(x, z)`, `tree(x, y, z)`, and your own types with
  `world.block('crystal', '#a0f', { see: true })`.
- Worlds: `generate({ seed, kind: 'hills' | 'island' | 'caves' | 'flat', ground, hills, water, trees })`.
- Drawing: changed chunks are meshed again in `update()` (greedy meshing with soft corner shading, in a
  background worker), or all at once with `build()`.
- Playing: `ray(eye, dir, far)` gives the block you're looking at and the face (`nx`, `ny`, `nz`: add
  them to place a block on it); `move(box, dx, dy, dz, { step })` walks a box through the blocks
  (`ground`, `inWater`, and which axes were stopped).
- `pack()` / `unpack()`: the world as a short string (runs of the same block).

## Real 3D liquids

`gs.fluid.Fluid` (3D): a particle fluid in a box of your world. Drops fall, pile up, slosh, run round
solid things and settle level. On phones with WebGPU the whole fluid runs on the graphics chip (tens
of thousands of drops, drawn as one smooth body); everywhere else the same maths runs with fewer,
bigger drops (600 to 2,000, drawn as beads). The game code is the same for both.

```js
const { Fluid } = gs.fluid;
function setup() {                                                                     // once, with the scene
  fluid = new Fluid(view, { box: [-2, 0, -2, 2, 3, 2], volume: 4, kind: 'water' });  // where it can go, and the most it holds
  tap = fluid.pour({ x: 0, y: 2.5, z: 0, rate: .6, speed: 2 });                        // a stream straight down
  cup = fluid.tube({ x: 1, y: .4, z: 0, r: .4, h: .8, hollow: .05 });                  // an open cup
  ball = fluid.ball({ r: .3 });                                                        // something to push the liquid about
}
reset() { fluid.clear(); fluid.fill({ y1: .3 }); }                                     // each round: empty it, start with the floor wet
update(dt) { tap.on = pressed; ball.set(px, py, pz); fluid.update(dt);
             if (fluid.amount(cup.inside()) > .25) api.win(); }
```

- Everything is in your world's units: places, sizes, speeds (units a second), amounts (units cubed).
- `new Fluid(view, { box, volume, kind, open, gravity, drops, size, shadows })`: `box` is
  `[x0, y0, z0, x1, y1, z1]` with walls all round (`open: true`: a floor and no walls, and drops that leave it vanish). `volume` is
  the most liquid it has to hold (a quarter of the box if you don't say): the kit picks how many drops
  the phone can run (`Fluid.max()`) and sizes them so that much fits, so say what you need and no more
  (less volume: finer drops). `kind`: `'water'`, `'lava'`, `'slime'`, `'honey'` (`gs.fluid.KINDS`), or
  your own `colour`, `foam` (the colour of spray and fast liquid, or `false`), `thick` (0 water .. 1
  honey), `rough`, `glow`. `gravity`: a number (9.8) or `{ x, y, z }`; set `fluid.gravity` any time to
  tilt the world.
- Putting liquid in: `fluid.pour({ x, y, z, dir, rate, speed, spread, r })` is a tap (change its fields
  or `tap.on` any time; `tap.remove()`), `fluid.fill({ y1: 1 })` is liquid at rest in a block (sides you
  leave out are the box's), `fluid.splash(x, y, z, { amount, speed, up })` a burst, `cup.fill(.8)` fills a
  hollow thing. `fluid.full` / `fluid.room`: when the drops run out, taps stop until some drains away.
- Solid things: `fluid.ball({ x, y, z, r })`, `fluid.box({ w, h, d, turn })`, `fluid.tube({ r, h, turn })`
  (up to 8). `hollow: .05` makes a bowl, a tank or a cup with walls that thick, open at the top
  (`open: false`: sealed). Move one with `thing.set(x, y, z, turn)` each frame, or pass
  `follow: mesh` and it follows a three.js object: the liquid is pushed by how fast it moves, and
  pours out of a cup you tip. You draw the things; the fluid only needs their shapes.
- The world: `fluid.ground((x, z) => y)` lets it flow over land; `fluid.drain({ x, y, z, r })` swallows
  drops that reach it (`drain.amount` counts how much); `fluid.push(x, y, z, { radius, strength, up })`
  is a blast.
- Questions: `fluid.amount()` or `fluid.amount(box)` (units cubed; `cup.inside()` is the box of a hollow
  thing's room), `fluid.level(x, z)` (the height of its top there, or null where it's dry),
  `fluid.wet(x, y, z)` (0 dry .. 1 under), `fluid.count`, `fluid.backend` (`'gpu'` or `'cpu'`). On WebGPU
  the answers are a few frames old, and under a tap `level()` is the top of the stream.
- Make the fluid once, with the scene, and `clear()` it in `reset()`. Keep the box no bigger than the
  liquid needs: the drops get bigger with the box. View: an `HDView` (Next Gen, AR, Board) for the
  WebGPU version; in a Console `View` it runs the smaller one.
- Build for the smaller version. Without WebGPU the drops are about three times as wide, so a cup,
  a pipe or a gap has to be wide enough for those: at least six drops across inside
  (`fluid.dropSize` is a drop's width). `new Fluid(view, { gpu: false, drops: 600 })` runs what the
  slowest phones run, on any machine: play your game with it once. It pours and fills the same way
  every time (`seed` changes its dice), so a level that works once keeps working.

## Smoke and fire that flow

`gs.gas.Gas` (3D): a gas simulation in a box of your world. Smoke rises, curls, spreads under a ceiling,
pours round solid things and is carried off by the wind; fire burns its fuel into heat and soot, and an
explosion throws a fireball that rolls up into a mushroom. On phones with WebGPU the whole gas runs on
the graphics chip (80,000 to 300,000 cells) and is drawn as a lit volume; everywhere else the same maths
runs in a much coarser grid (5,000 to 12,000 cells), drawn as soft puffs that ride the flow. The game
code is the same for both. (`gs.fx3d.Particles3D` makes puffs that go their own way; this is for smoke
and fire that have to behave: fill a corridor, pour out of a window, be blown aside.)

```js
const { Gas } = gs.gas;
function setup() {                                                          // once, with the scene
  gas = new Gas(view, { box: [-4, 0, -4, 4, 6, 4], kind: 'fire' });         // where the smoke can go
  camp = gas.fire({ x: 0, y: .2, z: 0, size: 1 });                          // a fire that keeps burning
  rock = gas.ball({ x: 0, y: 2.5, z: 0, r: .8 });                           // the smoke goes round it
}
reset() { gas.clear(); }                                                    // each round: clear air
update(dt) { camp.on = lit; gas.wind.x = 1.5; gas.update(dt);
             if (gas.smokeAt(px, py + 1.6, pz) > .4) cough(); }
```

- Everything is in your world's units: places, sizes and speeds (units a second).
- `new Gas(view, { box, kind, open, wind, cells, size, lamp, draw, seed })`: `box` is
  `[x0, y0, z0, x1, y1, z1]`, where the gas can go: a floor, and open air on every other side (smoke that
  leaves is gone). `open: false`: walls and a ceiling too, a room that fills with smoke. `kind`:
  `'smoke'`, `'fire'`, `'steam'`, `'dust'`, `'toxic'` (heavy: it creeps along the floor) or `'magic'`
  (`gs.gas.KINDS`), and any of a kind's numbers and colours as your own: `colour`, `colour2` (a source's
  `tint` 0..1 blends towards it), `flame` (three colours, edge to core), `lift` (how hard heat rises),
  `weight` (how hard the smoke itself sinks), `fade` and `cool` (the share of smoke and of heat lost a
  second), `thick` (how much it hides), `soot`, `burn` (less: taller flames), `curl` (how lively the
  swirls are, 0..1), `glow`. `wind: { x, y, z }`: change `gas.wind` any time. `lamp: true` (or
  `{ strength, distance }`): a light that follows the fire and flickers with it. `draw: false`: nothing
  is drawn (ask it questions and draw your own). The kit picks how many cells the phone can run
  (`Gas.max()`; `gas.cells`, and `gas.cell` is one cell's width); `cells` asks for fewer.
- Putting gas in: `gas.fire({ x, y, z, size, power })` is a fire that keeps burning (`size`: how wide
  its base is; a fire 1 wide burns a little under 2 high), and with `dir` and `speed` a blown one (a
  torch, a jet). `gas.smoke({ x, y, z, size, rate, heat, dir, speed, tint })` is smoke that keeps
  coming (`heat` 0 hangs where it is, .5 drifts up, 1 climbs fast). `gas.fan({ x, y, z, size, dir, speed })`
  pushes the gas (a fan, someone blowing). Each returns the thing: change its fields
  or `on` any time, `remove()` takes it away. `gas.burst(x, y, z, { size, fire, smoke, force })` is an
  explosion; `gas.puff(x, y, z, { size, amount, heat })` a cloud all at once (dust kicked up, a smoke
  bomb). Up to 16 at work in one step.
- Solid things: `gas.ball({ x, y, z, r })`, `gas.box({ w, h, d, turn })`, `gas.tube({ r, h, turn })` (up
  to 8). Move one with `thing.set(x, y, z, turn)` each frame, or pass `follow: mesh`: the gas is pushed
  by how fast it moves (swing a door through smoke). For the still parts of the world,
  `gas.solid((x, y, z) => true where it is solid)` (walls, a doorway, a chimney) and
  `gas.ground((x, z) => y)`: call them again when the world changes. You draw the things; the gas only
  needs their shapes.
- Questions: `gas.smokeAt(x, y, z)` (0 clear air, about 1 thick smoke), `gas.heatAt(x, y, z)` (up to .4
  warm smoke, over .45 flame, 1 and more the heart of a fire), `gas.flowAt(x, y, z)` (which way and how
  fast it moves), `gas.sees(ax, ay, az, bx, by, bz)` (how much can be seen through the smoke between two
  points, 1..0: can the guard see you?), `gas.smokeIn(box)` (how smoky a room is), `gas.glow`
  (`{ x, y, z, power }`: where its fire is and how much of it, for a light of your own),
  `gas.backend` (`'gpu'` or `'cpu'`). On WebGPU the answers are a few frames old and four cells coarse.
- Make the gas once, with the scene, and `clear()` it in `reset()`. Keep the box no bigger than the
  smoke needs: the cells get bigger with the box. View: an `HDView` (Next Gen, Board) for the WebGPU
  version; in a Console or AR view it runs the smaller one.
- Build for the smaller version. Without WebGPU a cell is about three times as wide (30 to 45 cm in a
  box 8 by 6 by 8), so a doorway, a chimney or a gap has to be at least three cells wide for smoke to
  get through, a fire under half a unit wide hardly shows, and a thing thinner than a cell (a railing,
  a rope, a thin beam) may not be felt at all. `new Gas(view, { gpu: false, cells: 5000 })` runs what the slowest phones run, on any
  machine: play your game with it once. It burns the same way every time (`seed` changes its dice).
- The two versions are the same kind of gas, not the same amount of it. In a coarse grid a plume climbs
  more slowly and wider, so more smoke hangs in the box: a camp fire's box held up to nearly three times
  the smoke in 11,000 cells that it held in 290,000, and most other things up to twice. Set what a game
  decides by (`smokeAt(...) > .4`, `sees(...) < .3`) with room to spare, and play it on both.

## Big worlds in parts

`gs.regions.Regions` (3D): a world in parts that are made a little each frame while they are wanted and
let go of when they are not. Use it for levels a game should build only once the player picks one (a
campaign's missions, the inside of a house), for a world bigger than a phone can hold at once (squares of
it made round the player as they walk, and freed behind), and for ground in tiles that are finer close by.

```js
const { Regions } = gs.regions;
const regions = new Regions(view, { world });   // world: a gs.physics3d.World3D, if the parts make bodies
// a named part: what it adds to the scene, the bodies it makes in `world` and what it hands r.keep() are its own
regions.part('harbour', function* (r) {
  view.scene.add(quay());
  yield;                                          // the rest waits for the next frame
  for (const p of CRATES) { r.add(prop('crate'), p); yield; }
  const people = yield r.wait(human.ready(DOCKERS)); // background work: the part goes on once it is in
});
regions.part('fort', makeFort);                   // a plain function is made in one go
// in reset(): made at once, under the loading screen; later (a menu pick): over the next frames
regions.want(pick === 1 ? 'harbour' : 'fort');
// squares round the player, and ground in tiles (finer close by, solid within one square)
regions.cells({ size: 64, reach: 2, make: r => scatterTrees(r.x0, r.z0, r.size, r.seed) });
const ground = regions.land({ height: (x, z) => 20 * gs.math.fbm(x * .004, z * .004), size: 64, reach: 5, solid: 1,
  colour: (x, y, z, slope) => slope > .35 ? '#7a7466' : '#5c7f3a' });
// each frame
regions.update(dt, player.position);
if (!regions.has('fort')) drawLoading(regions.progress);
```

- **Parts.** `part(name, make)` says how to make one; `want(...names)` says which are wanted (and no
  others). Inside `make()` or `reset()` a wanted part is made at once, so the card's loading screen covers
  it; after that it is made in the frame's spare time (`budget` milliseconds a frame, 3 by default), and
  `has(name)` says when it is in. A part no longer wanted is kept for later (`keep: 1` by default: the
  last one) while the phone has memory to spare, so picking it again is instant; short of memory it is let
  go of at once. A part let go of while it is still being made stops.
- **What belongs to a part.** Everything its make adds to the top of the scene (or `r.add(obj, at, parent)`
  adds), the bodies made in `world` while it runs, and what it hands `r.keep(thing)` (anything with
  `dispose()`, `stop()` or `remove()`, or a function). When it goes, those are taken out, and the geometry
  and pictures that were made while it ran are freed once nothing left in the scene uses them. Materials
  are kept: making one again would build its shader, a stall in play. `r.on(fn)` runs when it goes.
- **Generators.** A make that is a generator function (`function*`) can `yield` between pieces; the rest
  waits for the next frame's budget. `yield r.wait(promise)` waits for background work and hands back its
  answer. A sculpt or a library that isn't in yet (a `human()` not sculpted on this phone) starts the part
  again once it is in.
- **Squares.** `cells({ size, reach, make, level })` makes the squares within `reach` of the player
  (nearest first, then those in front), and lets go of those beyond `reach + 1`. `make(r)` gets `r.cx`,
  `r.cz`, `r.x0`, `r.z0`, `r.size`, `r.ring` and `r.seed` (the same every time for that square, so it
  looks the same when it comes back). With `level(ring)`, a square whose detail level changes as you near
  it is made again and the old one stays until the new one is in.
- **Land.** `land({ height, size, reach, segments, solid, material, colour })` is ground in tiles of
  `size` metres from your `height(x, z)`: `segments` across for the nearest, half that for each ring out,
  each tile's edge sloping the way its neighbour's does and a skirt below its edges so a fine and a coarse
  tile meet without a gap; within `solid` squares it is solid in `world` (a heightfield, much lighter than
  a mesh). `colour(x, y, z, slope)` paints it; every tile shares `material`.
- **Memory.** Short of memory (the app's memory guard), parts kept for later are let go of, and squares
  and land reach one square less (two when critical).
- `ready` (every wanted part made, and the squares next to the player), `progress` (0..1), `info` (what
  is in, and this frame's building time), `clear()` (everything let go of, made again as wanted),
  `dispose()`.
- **Far from the world's centre.** Nothing to do. A phone's graphics chip and the physics work in 32-bit
  numbers (about seven digits), so 20 km out a place is kept to about 2 mm and a face close up shakes by a
  few pixels. A Next Gen view draws about a centre that moves along with its camera (a floating origin):
  it stays at 0, 0 until the camera is 1024 m from it, then moves to the camera in steps of 256 m. A
  `World3D` keeps its bodies about the view's centre too (`world.at`; `world.centre(x, z)` for a world with
  no view), and every place it gives or takes is in the world's own numbers. The kit's ground, rock, leaves,
  clouds and wet ground keep their patterns where they are in the world. `__hd.origin = 0` (the frame lab)
  keeps the centre at 0, 0.

## Buildings that come apart

`const { Structure } = gs.destruction;` (Next Gen.) A `gs.models.building()` made of pieces: each half of
a pier, the wall under and over each window, each window and door, each floor tile and roof panel. Every
piece knows what holds it up, so you only say where it was hit:

```js
make():   house = new Structure(view.scene, { building: { style: 'brick', w: 8, d: 6, floors: 2 }, at: [0, 0, -12], turn: .4 });
reset() { phys = new World3D(); house.reset({ world: phys }); }      // whole again, and solid in this round's world
update(dt) {
  phys.step(dt); house.update(dt);                                   // after the physics step
  for (const b of house.broke) if (b.how !== 'fell') dust(b.x, b.y, b.z, b.size);   // what happened this frame
}
house.hit(bullet.point, { power: .4, dir: bullet.dir });             // a shot: small hits add up
house.hit(ball.position, { radius: 1.3, power: 2.4, dir, push: 5 }); // a wrecking ball
house.blast(shell.position, 3);                                      // an explosion, 3 m across
```

- **What holds what.** A piece stands on the one under it, and is held by the ones at its sides. When
  pieces go, whatever no longer reaches the ground through the ones left comes down a moment later, the
  collapse spreading out from the hole. Masonry (brick, stone, plaster) can hang one piece out sideways, so a
  wall closes over a hole one window wide and comes down over a wider one; timber and concrete hang two.
  Knock out a corner and the wall above it goes, with the floor it carried; the roof hangs on while
  a wall or its ridge still holds it. The same shell leaves a different ruin in each style.
- `hit(point, { radius, power, dir, push })`: pieces within `radius` (.4 m) are hurt by `power` (a piece
  breaks at about 1 for timber, 1.5 brick, 2 stone, 2.5 concrete, .1 a window; hurt adds up) and a broken
  one goes to rubble along `dir`. `blast(point, radius, { power, push })`: `power` (4) at the centre
  falling to none at `radius`; the nearest pieces go to rubble and the rest of the broken ones are thrown
  out whole. Both return how many pieces broke. Points are world points.
- `house.broke` after `update()`: `{ how: 'broke' | 'fell' | 'landed', kind: 'wall' | 'window' | 'door' |
  'roof' | 'floor', x, y, z, size, mass, speed, crumbled }` for each thing that happened. The kit draws
  the pieces and the rubble and nothing else: dust, sound and shake are yours, from this list.
- `house.standing` (1 whole .. 0 flat, by weight), `house.left` / `house.pieces`, `house.falling`,
  `house.busy` (true until everything has come to rest: wait for it before you score a demolition).
- **With a physics world** (`world: phys`, or `reset({ world })`) the walls are solid for movers, rays and
  `gs.sound.Ears`, a hole lets them through, and what falls is real tumbling bodies that pile up and can
  break what they land on (`crush: 0` turns that off). `phys.ray()` gives `hit.thing.structure` for the
  building it struck. **Without one** pieces fall and break up where they land, the same way every time,
  and `house.ray(from, dir)` finds the piece a shot strikes (`{ point, normal, distance, kind }`).
- Small rubble is cheap: boxes drawn as copies, in the building's own materials, that land on the ground
  (`ground: (x, z) => height`) or on what still stands. `bits` (240) is how many a material keeps and `keep`
  (40) how many fallen pieces stay as bodies; the oldest go first.
- **Your own boxes** in place of a building: `pieces: [{ size: [w, h, d], at: [x, y, z], material: 'planks',
  strength, fixed }]` (`at` is each box's centre; `fixed: true` never moves and holds the rest up, as the
  ground does: a cliff a bridge is built into), with `materials: { planks: aThreeMaterial }` if you want
  your own and `span` (1: masonry, 2: timber and steel). Boxes hold each other where they touch.
- Make it once with the level (`make()`), and `reset()` it each round. A house is about 170 pieces and
  4,400 triangles and takes a quarter of a second to cut the first time, then a few milliseconds a copy;
  a five-storey block about 1,500 pieces. On a desktop a house falling with physics measured half a
  millisecond a frame, and under a tenth without (not yet measured on a phone).
- Not there: rooms inside (it is a shell with floors), break edges that are not straight, and rubble
  that piles against walls (it lies on the ground and on floors).

## Water you can disturb

`const { Water } = gs.outdoors;` (3D.) The sea, lake or pond a game already has, answering to what
happens to it. The water within 24 metres of the centre you give `update()` is a field of ripples:

```js
make():   sea = new Water({ level: 0, waves: .6, ripples: true, bed: (x, z) => land.height(x, z) });
          view.scene.add(sea.mesh); sea.underwater(view);            // the look for a camera that goes under
          sea.watch(boat, { radius: 1.2 });                          // by itself from now on: its wake, its foam, a splash if it lands
reset() { sea.calm(); }
update(dt) {
  sky.update(dt); sea.rain = weather.rain;                            // 0..1 (a Weather given `water: sea` sets it itself)
  sea.update(dt, camera.position);                                   // after the sky and your own view.air()
  for (const s of sea.splashes) ears.play('splash', s);              // what landed in it this frame
  mixer.muffle(sea.under ? .8 : 0);
}
sea.splash(rock.x, rock.z, { size: .8, speed: 7 });                  // something fell in
sea.ring(x, z, { size: .3 });                                        // something small did
```

- `ring(x, z, { size, strength })`: rings spread out at walking pace and die away. `splash(x, z, { size,
  speed })`: spray goes up (higher for a faster hit), rings go out and a patch of foam is left that breaks
  up and fades. Each splash is in `sea.splashes` for one frame (`{ x, y, z, size, speed }`): sound, score
  and shake are yours.
- `watch(thing, { radius, bottom, top })` takes a mesh, a physics body, a `gs.craft.Boat`, a character:
  anything with a position. From then on the water does the rest: a splash when it lands in the water or
  leaps out of it, the water it pushes aside as it moves, rings left behind it (slow, they spread round a
  swimmer; fast, they are a boat's wake), a trail of foam above a jog, spray off the bow above 5 m/s.
  `bottom` and `top` are how far below and above its position it reaches (a person standing: `bottom: 0,
  top: 1.8`). It returns the watch: `remove()` stops it. `foam: 0` or `splash: 0` turn those off.
- `sea.height(x, z)` includes the ripples, so a floating thing bobs as a ring passes under it.
- `bed: (x, z) => height` is the ground under the water (`land.height`): the shallows are paler and
  clearer (`shallow`: their colour; `clear`: metres of water that hide the bed, 2.5), the water fades out
  at the waterline, a broken line of foam laps the shore, and ripples die on the beach.
- `sea.rain = 0..1`: the water goes duller, rings open where the drops land round the centre and little
  drops hop back up. This works on any `Water`, with ripples or not.
- `underwater(view, { colour, murk, dark })`: while the view's camera is below the surface, the view's
  air is murky, tinted water (`murk`: how thick, .14 is about 15 metres of view; `dark`: how fast it
  darkens with depth), the surface is seen from below, and `sea.under` is 1. On the way up the air goes
  back to what your game had, or has set since.
- **What it costs.** Calm water does no more work than its waves. While ripples move, a 128 by 128 grid
  is stepped on the processor and two small pictures go to the graphics chip: measured on a desktop,
  `update()` is .13 ms calm, .3 to .6 ms with ripples moving, .1 ms more in rain (not yet measured on a
  phone). `ripples: 64` is a quarter of that with coarser rings. It is the same on WebGL and WebGPU, and
  needs no change to your water's material: your own `material` keeps its normal map and gets foam, spray
  and wakes (its own map hides the small rings).
- Ask for `ripples: true` with the level: the first `ring()`, `splash()` or `watch()` makes the field
  otherwise, in the middle of a round. `foam: false` and `spray: 0` leave those out.
- Not there: waves that break, water that flows or changes level (`gs.flow`, `gs.fluid`), and a split
  picture while the camera is half under.

## Weather that changes the world

`const { Weather } = gs.sky;` (3D; the look is Next Gen.) Tell the weather what stands in it and the rain
and snow no longer fall through roofs, and the world answers to them:

```js
make():   weather = new Weather(view, { kind: 'rain', level: world, ground: (x, z) => land.height(x, z), water: sea });
reset() { weather.set('clear'); weather.wet = weather.pools = weather.snow = 0; }
update(dt) {
  weather.update(dt);                                   // after the camera has moved
  if (weather.wetAt(player.pos) > .5) grip = .7;         // wet underfoot (0 indoors and under a roof)
  speed *= 1 - weather.snowAt(player.pos) * 1.5;         // metres of snow lying here (0 under a roof)
}
weather.set('snow');                                    // it starts to settle; 'rain' washes it away again
```

- `level` is what keeps the weather off: a `gs.physics3d` `World3D`, a `City`, `Voxels`, a function
  `(from, dir, max) => metres to the first solid thing`, three.js meshes or groups (their triangles are
  asked one by one, so keep those to a few simple shapes: a physics world is much quicker), or a list of
  these. `ground: (x, z) => height` is for land that is not in the level. `level: true` says there are no
  roofs: everything is out in it.
- From these the weather keeps a **map of what the sky can see**: for every half metre within 32 m of the
  camera, the height of the highest solid thing. It fills from the camera outwards a few hundred spots a
  frame (a second or so after a jump), follows the camera, and looks everything over again every six
  seconds, so a roof that is blown off lets the rain in. `weather.cover.touch(x, z, r)` asks again round
  a spot at once. Beyond the map everything counts as open.
- **What you see** (a Next Gen view; the weather turns the view's `air()` on if it is off). In rain each
  drop is a streak turned to the camera and about two of the 3D's pixels wide wherever it falls (so a storm
  still shows on a phone's sharp screen, drawn smaller and filled in by the upscaler); the drops stop at the first thing they meet, little drops hop off the ground round the camera, and
  everything the sky can see gets darker and shinier over `soak` seconds (20). Then puddles open on flat
  ground and spread (they take twice as long), and when the rain stops it all dries over `dry` seconds
  (90), the puddles last. In snow the flakes stop at roofs too, and snow settles over `settle` seconds
  (40): first in patches on flat tops, then over everything that is not too steep (ground, roofs, crates,
  the tops of walls, the leaves that face up). When the snow stops it melts over `melt` seconds (150),
  leaving the ground wet; rain washes it away six times as fast. `melt: Infinity` keeps it lying. Floors
  indoors, porches, the ground under a bridge or a lean-to and the foot of a wall under its eaves stay
  dry, with a soft edge.
- **What you can ask**: `weather.wet`, `weather.pools` and `weather.snow` (each 0..1; set them to start a
  round after rain or in deep snow), `weather.rain` and `weather.snowing` (how hard, now), `open(p)` (can
  the sky see this point), `wetAt(p)` (how wet a spot is, 0 under a roof), `snowAt(p)` (metres of snow
  lying there; `deep`, .25, when it has all settled) and `weather.cover.at(x, z)` (the height of the
  highest thing over a spot). Slipping, slower steps, footprints, splashing footsteps, the sound of rain
  on a roof overhead and who comes in out of the rain are yours, from these.
- `water` (one `gs.outdoors.Water`, or a list): the rain falls on it too (it sets `water.rain`), and its
  drops hop off the water's surface.
- Nothing settles on water, on people and animals (skinned meshes), or on anything whose mesh or material
  has `userData.noSettle = true` (a car that drives about); they still get wet. Your own `ShaderMaterial`s
  and materials with `fog: false` are left alone, as with the air.
- Make it with the level, in `make()`, before the first frame is drawn: the look is added to each
  material as it is first drawn, on WebGL and WebGPU alike, and costs no extra pass (three small texture
  reads a pixel). On WebGPU a material that was drawn before there was such a weather keeps its plain wet
  look, with no puddles or snow; and a game with no such weather pays nothing for it. Measured on a
  desktop, `weather.update()` is .15 ms a frame in rain with the map kept up (not yet measured on a
  phone). `cover: { cells: 64 }` is a smaller map (16 m round the camera), `hops: 0` leaves the hopping
  drops out.
- With no `level` the weather is what it always was: it only falls, and `open()` is always true.
- Not there: snow has no depth of its own (it is a look; `snowAt()` is the depth, and
  [`gs.outdoors.Marks`](#ground-that-takes-marks) presses prints into it),
  puddles do not seek out the hollows of the land (they lie on flat ground where the map of them says),
  water does not run down walls or drip off eaves, and nothing piles up on things that move.

## Ground that takes marks

`const { Marks } = gs.outdoors;` (3D; the look is Next Gen.) Feet leave prints and wheels leave tracks in
snow, mud and sand, and grass parts round whatever moves through it:

```js
make():   marks = new Marks(view, { land, weather, mud: (x, z) => bare(x, z), sand: (x, z) => beach(x, z) });
          land.meadow({ where: (x, z) => grassy(x, z) });     // after the Marks: its blades read the grass field
          marks.watch(player); marks.watch(jeep); marks.watch(dog, { feet: 4, size: .08, shape: 'paw' });
reset() { marks.clear(); }
update(dt) {
  marks.update(dt);                                       // after everything has moved (and after rig.update())
  for (const m of marks.made) if (m.by === player) gs.sound.noise(.07, { vol: .2, from: m.kind === 'snow' ? 2400 : 500 });   // a crunch, a squelch
  const trail = marks.trail(hunter.x, hunter.z, 4, { by: player, newer: 60 });   // the newest first
  if (trail[0]) hunter.goTo(trail[0].x, trail[0].z);
}
```

- **What the ground is like** comes from your game and the weather. `mud(x, z)` and `sand(x, z)` say
  (0..1) where the ground is bare earth or sand: use the functions that paint your ground. With a
  `gs.sky.Weather` that was given the level, **snow** takes prints wherever it has settled (not under a
  roof, so a trail stops at a porch), **mud** is soft where the rain has wet it (dry earth takes hardly
  a mark, and earth under a roof stays hard), and wet sand is firmer than dry. `marks.kindAt(x, z)`
  answers `{ kind: 'snow' | 'mud' | 'sand' | 'grass' | null, soft, depth, y }` for a spot: how far a
  foot sinks in there, for your own sounds, slowing and splashes. `null` is firm ground.
- **Things that leave marks by themselves**: `marks.watch(thing)`. A `gs.models.human` leaves a boot
  print wherever a foot really comes down, pointing the way it was put down. A `gs.models.vehicle`
  leaves a track behind each wheel as wide as the wheel, with a tyre's tread; a tank its two belts.
  Anything else that moves (an Object3D or `{ position }`) has prints paced out along its way: `feet`
  (2, or 4), `size`, `shape` (`'boot' | 'bare' | 'paw' | 'hoof' | 'shoe' | 'round'`), `gap`, `pace`,
  `long`, `press`. In the air (more than .3 m up, or `grounded: () => false`) nothing is left.
- **By hand**: `marks.step(x, z, { turn, size, shape, side, press, by })` is one print,
  `marks.press(x, z, r)` a round dent (something fell, someone knelt), and
  `marks.roll(id, x, z, { width, tread: 'tyre' | 'cleat' | 'rim' | 'smooth' })` each frame lays a track
  that joins up behind a wheel, a sled or a dragged crate (`marks.lift(id)` when it leaves the ground).
- **They do not last for ever.** Fresh snow fills prints in (`fill`: .3 of a full cover), rain washes
  them out of mud (`wash`: 90 seconds of it), wind blows them out of sand (`blow`: 400 metres of wind
  over a light breeze, about two minutes of a stiff one), snow that settles hides what was in the mud
  under it, and melting snow takes its prints with it. `last: { snow: 120 }` gives marks a life in
  seconds whatever the weather. 4000 marks are remembered (`keep`); then the oldest are forgotten.
- **A trail to read**: `marks.made` lists what was pressed this frame (`{ x, z, kind, depth, by,
  rolling }`: for a crunch, a squelch, a puff of snow), `marks.at(x, z)` is how deep the ground is
  pressed at a spot, and `marks.trail(x, z, r, { by, newer, max })` gives the marks near a point, the
  newest first, each with where it is, which way it points, what it is in, how old it is and who made
  it: enough for a tracker that follows the player, or a game about reading who went where.
- **Grass that parts.** The land's meadow (`land.meadow()`) leans away from whatever is watched, springs
  back with a wobble when it has passed, and lies flat and a little paler where it was walked or driven
  on, mending over `mend` seconds (40). `marks.push(x, z, r, { vx, vz })` parts it yourself (a gust
  from a rotor, a creature you move by hand); `marks.grass.at(x, z)` says how it stands. `grass:
  (x, z) => 0..1` says where grass grows if you have no meadow (for `kindAt` and `made`); `grass: false`
  keeps no grass field at all.
- **How it is drawn, and what it costs.** The prints are a height picture kept in tiles 3 m across round
  the camera (`reach`: 10 m; `cell`: .025 m a texel, so a boot is eleven texels long); each tile that has
  any is one thin sheet lying on the land's own triangles, with a colour and a normal picture made from
  the heights. They are stock materials, so WebGL and WebGPU draw the same thing and ground with no
  marks costs nothing. `colours: { mud: { floor: '#2a2018', top: '#55452f' } }` matches a print's floor
  and rim to your ground. Tiles are made again a slice a frame as marks fill in or come into reach
  (`budget`), so a cut to a new place shows its prints over a few frames, the nearest first:
  `marks.update(0, centre)` makes them all at once before a cut you know is coming. Measured on a
  desktop, `marks.update()` is .02 ms a frame for one walker and .25 to .5 ms with a walker, a dog, a
  car and a tank all churning the ground at once (not yet measured on a phone). `cell: .04` is a third
  of the work with softer prints.
- `update(dt, centre)`: `centre` is where prints are drawn round (the camera by default; the spot a
  scope looks at, for a view through one).
- Make it in `make()`, before the first frame: on WebGPU the meadow's blades can only read the grass
  field if they were given it before they were first drawn.
- Not there: the ground itself does not move (a print is at most 5 cm deep, drawn on a sheet, so
  deep drifts you wade through and ruts a wheel sinks into are not here), marks do not show beyond
  `reach`, `land.grass()` (the far grass) does not part, things do not get muddy or snowy from
  walking in it, and rock (`land.rocks()`) takes no marks: not on it, and not in a cave under it.

## Cliffs, caves and overhangs

`land.rocks(o)`, on a `gs.outdoors` `Land`. (3D; the look is Next Gen.) A height map has one height for
each spot, so it cannot fold over itself. This puts real rock on it that can: cliffs with ledges and
overhangs wherever the land is steep, caves to walk through, arches, and rock of your own shape.

```js
make():   land = new Land({ kind: (x, z) => myHeight(x, z), size: 160, colours });
          land.rocks({
            seed: 3,
            caves: [{ path: [[-3, 2.3, -5], [-4.5, 2.5, 10], [-3, 2.3, 31]], radius: 2.6 }],   // a tunnel under a spur: points [x, y, z]
            shapes: [{ arch: [9, 5.5, 2.2, 3], at: [-22, 0, 28], turn: .5 },                  // [span, rise, thick, deep], standing on `at`
                     { box: [8, 1.8, 6], at: [8.5, 10, -25] }],                               // a shelf that sticks out of the cliff
          });
          gs.outdoors.looks.rock(land.rock.material, { mossy: 0 });   // if you like: grit and cracks over its colours
          land.meadow({ reach: 16 }); land.solid(world);              // after the rock: grass keeps off it, physics takes it
          weather = new Weather(view, { ground: (x, z) => land.height(x, z) });   // snow on the ledges, none in the cave
update(dt) {
  player.y = land.floor(player.x, player.y, player.z);                // what it stands on: the cave's floor, not the hill over it
  view.hemi.intensity = fill * land.sky(cam.x, cam.y, cam.z);         // your fill light, dimmer in a cave
}
```

- **Cliffs** come by themselves wherever the land is steeper than `steep` (.42, as `land.slope()` counts
  it): the stone lies in beds (`beds`: 1.8 m thick), hard beds stand out past soft ones as ledges
  (`ledge`: 1.1 m), each bed leans out towards its top, which is what overhangs (`lip`: .7 m), and joints
  run down the face (`cracks`). `cliffs: { steep, depth, beds, ledge, lip, rough, cracks, area: [x0, z0,
  x1, z1] }` changes them, `cliffs: false` leaves them out. The top of a cliff is level with the ground
  behind it, and flat ledges take the land's own colour, so grass seems to grow on them.
- **Caves** are tunnels along a path of `[x, y, z, radius?]` points (`radius`: 2.5 m; a cave is a little
  lower than it is wide, so its floor is about .85 of the radius under the path). Wherever the path comes
  out of the ground the cave is open: the land's own squares are left out there, and a low rim of rock
  covers their edge. Run the path a few metres out past the hillside at each mouth.
- **Shapes** are rock of your own, melted into the land and into each other over `blend` metres (.6):
  `box: [wide, high, deep]`, `ball: radius`, `arch: [span, rise, thick, deep]` or a tube along a `path`,
  at `at: [x, y, z]` (a box's or ball's middle; where an arch stands), turned by `turn`. They get the same
  beds, lumps and joints as the cliffs. `cut: true` takes the shape out instead: a hollow, a pit, a notch
  in a cliff.
- **Asking about it.** `land.height(x, z)` is now the top of whatever is highest (so everything that
  already asks the land, like the weather, sees the rock). `land.floor(x, y, z)` is what a thing at height
  `y` stands on: the highest ground or rock at or under `y + .6`, so give it the thing's own last height
  and it follows a cave's floor in and out, steps up a ledge, and stays under an overhang.
  `land.roof(x, y, z)` is the underside of what is over a point (`Infinity` under open sky),
  `land.rocky(x, z)` whether rock shows there (or a cave has taken the ground away), `land.sky(x, y, z)`
  how much daylight reaches a point (1 in the open, .7 under an overhang, down to .1 deep in a cave), and
  `land.ray(from, dir, max)` how far it is to the ground or the rock (`{ distance }` or `null`).
- **What works with it.** A `Weather` given `ground: (x, z) => land.height(x, z)` (or `level: land`) lets
  snow lie on ledges and cliff tops and keeps caves and the ground under overhangs dry.
  `new gs.sound.Ears({ level: land })` muffles sounds behind rock and gives a cave its echo.
  `land.solid(world)` makes the rock solid with the land. `land.meadow()`, `land.grass()` and
  `land.scatter()` keep off it (call them after `rocks()`). `gs.outdoors.Marks` takes no marks on rock,
  and something walking in a cave leaves none on the hill above.
- **How it is made, and what it costs.** The rock is a second surface, made from a density (how far in
  or out of stone a point is) with surface nets, in pieces 13 m across that are culled one by one. Where
  no rock stands out it lies just under the ground and is not drawn, so rock comes out of the land along
  a line with nothing to stitch. It is drawn with one stock material and a colour at every point (beds of
  two tints, streaks, darker in creases and down caves): no shader patch, so WebGL and WebGPU draw the
  same thing. The valley used for testing (160 m, a cliff 16 m high, a 36 m cave, an arch and a shelf) is
  82,000 triangles in 30 pieces and 2 MB; its numbers take .8 seconds on a desktop (not yet measured on
  a phone), in a background worker while the card says Loading, and are kept, so Play again does not make
  them again. `cell: .6` (metres a cell; the default is .4) is 36,000 triangles in .3 seconds, `cell: .8`
  19,000 in .2, with rounder ledges. Asking `height()` or `floor()` near rock costs about a quarter of a
  microsecond.
- `colours: { rock, dark, top, floor }` are the stone's two tints, the colour of flat tops and of where
  rock meets the ground (the land's own colour there, if you give none) and of a cave's floor.
  `material` is your own for the rock instead; `land.rock.material` is the one it made, and
  `land.rock.group` its meshes.
- Make it in `make()`, once the land has its shape and colours (after `flatten()` and `paint()`). The
  same land and the same asking always give the same rock. `land.rocks(false)` takes it away.
- Not there: the rock cannot be dug or broken while playing (it is made once: `gs.voxels` is for ground
  that changes, `gs.destruction` for things that come apart); it has no uvs, so a texture of your own
  has to be mapped by position, as `looks.rock` does; it is drawn as finely far away as close to; and
  nobody climbs it by themselves (`gs.climb` is yours to place).

## Vehicles made in code

`const { vehicle } = gs.models;` (Next Gen.) Cars, lorries, tanks, trains, boats and planes with no model
files. Each is worked out from a few measures into a shell, dressed in paint, glass, chrome and rubber, aged
a little, and handed back as a three.js Group with the parts that turn on pivots of their own:

```js
make():   jeep = vehicle('car', { style: 'jeep', seed: 4 }); view.add(jeep);
          tank = vehicle('tank', { style: 'heavy', finish: 'worn' }); view.add(tank);
          train = vehicle('train', { style: 'steam', cars: ['van', { style: 'open', load: 'coal' }, 'guard'] }); view.add(train);
update(dt) {
  kart.update(dt, input); kart.place(jeep);                 // gs.vehicles says where it is...
  jeep.move(dt, kart.speed, { steer: input.steer });        // ...this rolls and steers its wheels and rocks its body
  tank.move(dt, speed, { turn, aim: [bearing, lift] });     // tracks run, one ahead of the other in a turn; the turret comes round
  along += 12 * dt; train.along(rails, along).roll(along);  // each car between its own wheels, round the curve
}
```

| `kind` | `style` (the first is what you get with none) | What turns | `points` |
| --- | --- | --- | --- |
| `car` | `saloon`, `hatch`, `estate`, `sports`, `van`, `pickup`, `jeep` | four `wheels` | `driver`, `passenger`, `exhaust`, `lampL`, `lampR`, `hitch` |
| `truck` | `flat`, `canvas`, `box`, `tanker`; `axles: 3`, `offroad: true` (tyres with lugs), `canvas: '#5c6040'` | four or six `wheels`, twin tyres behind | a car's, and `load` |
| `tank` | `medium`, `light`, `heavy` | tracks and road wheels, `parts.turret`, `parts.gun` | `muzzle`, `commander`, `driver`, `exhaust` |
| `train` | engines `steam` (it brings its tender) and `diesel`; wagons `van`, `open`, `flat`, `tanker`, `guard` (a guard's van), `coach`, `tender` | every wheel, a steam engine's rods | `front`, `back`; `smoke`, `steam`, `whistle`, `driver`, `fire`; a tender's `coal`; a wagon's `load`, a coach's `door`, the `roof` of a van, a guard's van and a coach; a guard's van's `veranda` and `tail`; a tank wagon's `filler` |
| `boat` | `rowboat`, `motor`, `fishing`, `patrol` | `parts.oarL`, `oarR`; `motor` and its `prop`; `radar`, `turret`, `gun` | `helm` (a rowboat: `seat`), `bow`, `wake`, `deck`, `muzzle` |
| `plane` | `prop`, `biplane`, `twin`, `jet` | `parts.prop` (a twin: `propL`, `propR`), its `wheels` | `pilot`, `exhaust`, `guns`, `smoke`; a twin's `door`, `cabin` |

`vehicle.kinds` is the same list, for a menu or a test.

- **Which way round.** Its nose points along -z and +x is its right side, in metres, as `gs.vehicles`,
  `gs.craft` and `World3D.vehicle` push things. A road vehicle and a train stand on y = 0. A boat floats
  with its waterline at y = 0 (`boat.draft` is how deep). A plane's origin is on its centre line:
  `plane.gear` is how high that stands above the ground on its wheels and `plane.sit` how far its nose
  points up there.
- **Options**: `style`; `seed` (which of its kind's colours, where its wear falls: the same on every phone);
  `colour` and `trim` (its second colour: a coach's band, a wheelhouse, a stripe); `finish`: `'gloss'`,
  `'satin'`, `'matt'`, `'worn'` (paint rubbed through to the metal) or `'rusty'`, each kind starting with its
  own; `wear` (0..1 how aged, `false` for straight from the factory); `lit: true` (lamps that glow;
  `lights(on)` later); `detail: .5` (a car's or a lorry's shell and wheels a little coarser: about a fifth fewer triangles). A
  train also takes `cars` (what the engine pulls, in order), `gauge` (metres between the rails, 1.435) and
  `deflectors: true` (a steam engine's smoke deflectors: a plate each side of its smokebox),
  `polished: false` (a working engine: its dome and boiler bands painted over and no bright wheel rims
  anywhere on the train) and `fuse: true` (a train that keeps to a straight line, in a third of the draws:
  below).
- **`move(dt, speed, o)`** is the easy way to keep one alive each frame, whatever moves it: wheels and
  tracks roll for the speed (metres a second), the front wheels ease to `steer` (-1..1, + right; `lock`
  is how far they turn at 1, .55 radians), the body rolls outwards in a turn, squats as it pulls away and dips as it brakes, as a car on
  springs does (`sway: 0` for none), propellers spin up to a blur with `power` (0..1), a boat's outboard turns with the steering
  and a patrol boat's radar goes round. A tank takes `turn` (-1..1: one track runs ahead of the other, on
  the spot when it stands) and `aim: [bearing, lift]`, which eases its turret and gun there. `ground:
  false` keeps a plane's wheels still in the air (it is the default for a plane).
- **By hand** instead: `roll(metres so far)` (a tank: `roll(left, right)`), `steer(radians)`,
  `aim(bearing, lift)` (the gun stops at its own limits), or turn any of `parts` yourself (they are
  Groups: `boat.parts.oarL.rotation.y = stroke`).
- **`points`** are places on it that move with it (three.js objects, turned as the vehicle is):
  `car.points.driver` is the driver's seat (`points.driver.add(person)` with a sitting pose and
  `person.rotation.y = Math.PI`, since the kit's people face +z; in a wheelhouse, on a footplate or in
  a turret hatch it is where they stand), `tank.points.muzzle.getWorldPosition(v)` for the flash and the
  shell, `points.exhaust` and a steam engine's `points.smoke` for `gs.fx3d` smoke, `points.wake` for
  `water.watch()`.
- **`size`** (`length`, `width`, `height` in metres), `wheelbase`, `track` (between the wheels across),
  `radius` (of a wheel), `tris` (triangles), and `look` (what it was made with) are there to read.
- **On real springs** (cars and lorries): `drive = world.vehicle(car, car.chassis({ power: 14 }))` gives
  `gs.physics3d` the chassis and the car's own four wheels, so they ride the bumps and it can roll over;
  then `drive.drive(throttle, steer, brake)` each frame as ever (don't call `move()` as well). `chassis()`
  moves the body so its origin is the middle of the chassis and not the road, so call it once, when you
  make the car. A third axle's wheels follow the second's.
- **Boats and planes** are the look for `gs.craft`: `boat = new Boat(sea, { length: hull.size.length,
  width: hull.size.width, draft: 0 })`, then `hull.position.copy(boat.pos); hull.quaternion.copy(boat.quat);
  hull.move(dt, boat.speed, { steer })` each frame; a plane the same from a `Plane({ ground, gear:
  plane.gear })`, with `move(dt, speed, { power: throttle, ground: flying.onGround })`.
- **A train** is its cars coupled nose to tail (`train.cars`, the engine first, each a vehicle of its own
  with its `length` over the buffers), its middle at the origin. `train.along(track, d)` lays it on your
  rails with its front `d` metres along them: `track` is `(metres) => ({ x, y, z })` on top of the rails
  or a `gs.paths.Path`, measured in the train's own space, and each car goes between its own wheels, so
  a train bends round curves and tips on slopes. `roll(d)` turns the wheels and a steam engine's rods;
  `train.radius` is its driving wheels' radius (a chuff is a quarter of a turn: `2 * Math.PI * train.radius / 4`
  metres).
- **A goods train.** A wagon in `cars` can be a name or `{ style, load, colour, canvas }`. `colour` paints
  that wagon's boards (or a tank wagon's tank) in a colour of its own; with none its boards are bare wood.
  `load` is what it carries: an `open` wagon's `'tarp'` (a load under canvas, `canvas` its colour) or
  `'coal'`, a `flat` wagon's `'crates'` (crates, oil drums and something under canvas). A wagon made by
  itself takes them from the top: `vehicle('train', { style: 'open', load: 'coal', colour: '#565c50' })`.
  The `guard` goes last: a cabin with a look-out each side and a stove pipe, an open end
  (`points.veranda` is where the guard stands) and two red tail lamps that glow with `lit: true`
  (`points.tail`). `points.roof` on a van or a guard's van is the top of its roof, for someone riding
  it. The steam engine has lamps over its buffers, pipes, a pump and a fire in its cab (`points.fire`),
  its cab and tender are riveted plate, and every wagon stands on leaf springs with its brake lever:
  ```js
  train = vehicle('train', { style: 'steam', colour: '#1d1e20', deflectors: true, lit: true, cars: [
    { style: 'van', colour: '#6b3024' }, { style: 'open', load: 'tarp', colour: '#565c50' },
    { style: 'tanker', colour: '#2e3235' }, { style: 'flat', load: 'crates' }, { style: 'guard', colour: '#565b5e' }] });
  ```
  That train is 64 m long, about 50,000 triangles in 58 draws.
- **A train that keeps to a straight line: `fuse: true`.** A train's cars are vehicles of their own so
  that `along()` can bend it round a curve, and that is what its draws pay for. A train that only runs
  straight (past a platform, across a bridge, through a level on rails) can be made with `fuse: true`:
  every car's shell is joined into one mesh for each kind of surface (surfaces that differ only in colour
  share a material and carry their colours in their corners), and every wheelset of one shape is drawn as
  copies in one draw. The goods train above is then **16 draws where it was 58**, with the same triangles
  and the same picture. Everything else is as before: `roll(d)` and `move(dt, speed)` turn the wheels and
  the rods, `lights(on)`, `twin()` (which shares the joined shapes), `train.points` and each
  `train.cars[i].points`. The cars are still there, without meshes, so something of your own added to
  `train.cars[2]` rides on that wagon. `along()` throws, saying why; `train.fused` is `true`. Move the
  whole train by its own position.
- **Cost.** A car is about 13,000 triangles in 12 to 14 draws; a lorry 12,000 to 17,000; a tank 18,000 to
  21,000 (most of it track links and road wheels, which are two draws of copies); a railway car 5,000 to
  15,000; a boat 3,000 to 6,000; a plane 5,000 to 8,000. Each is made in about a tenth of a second or less
  on a desktop (not yet measured on a phone), and the same vehicle asked for again, or `car.twin()`,
  shares its shapes and materials and costs almost nothing: a car park is one car made once.
  Wagons of one kind share theirs too. Make vehicles in `make()`.
- Not there: nothing dents or comes off, doors and bonnets do not open, cars have dark glass with no
  inside behind it (the jeep, the lorry's bed, the boats and the cockpits are open and have seats),
  there are no simpler shapes for far away made by themselves, and a train has no physics of its
  own.

## Fur and hair

(Next Gen.) Animals with a coat of fur have fur, and people's beards and moustaches are strands, by themselves
(the hair of a head is a clean combed shape, and wears strands when asked):

```js
make():   fox = gs.models.creature({ like: 'dog', seed: 9 }); view.add(fox);          // furry close up, nothing to ask for
          man = gs.models.human({ hair: '#8a8a88', beard: 1 }); view.add(man);        // a beard in strands (strands: true for his hair too)
          rug = gs.models.fur(mesh, { length: .04, lean: .8 });                        // or fur on any mesh of your own
update(dt) { fox.move(dt, speed); if (scared) fox.fur.length = 1.5; }                  // its fur stands on end
```

**How it is drawn.** A coat is "shells": copies of the furry surface, each a little further out along its
normals, each cut by one picture of strands seen from their tips (made in code: a strand's height is the
picture's alpha), so less of every strand shows the further out a layer is and the eye joins the dots into
strands. It is all three.js's own (a map with an alpha cut, vertex colours, and two morph targets every
layer shares: out, and over the way the strands lie), so WebGL and WebGPU draw it alike, on skinned
meshes too, and it takes the light and shadows as everything else does. A coat casts no shadow of its own
(what it grows on does).

- **Creatures.** One with a coat of fur (`dog`, `cat`, `deer`, `bear`, `rabbit`, `mouse`, `beast`, or any
  given `build: { coat: 'fur' }`) grows fur; a mane and a tail of hair grow on any coat (a `horse`). Short
  on the face and feet, long in a mane and a bushy tail, none on noses, claws and the rims of eyes, and no
  strand longer than about half of how thick what it grows on is, so ears, thin tails and legs keep their
  shape. A seed makes one a little shaggier or sleeker. `fur: false` leaves it off; `fur: { length: .04,
  layers: 8, lean: .7, tile: .08 }` tunes it (metres). `creature.fur` is the coat, or `null`.
- **People.** `human()` lays strands over a moustache and over a beard: `beard: 0..1.5` is how long (`true`
  is .6; the painted `stubble` is still there for a shave two days old). The hair of the head is a clean
  sculpted shape with a crisp hairline and combed strands painted on it (a small picture made in code, laid
  round the head from the crown), which reads well at every distance and costs nothing extra; `strands: true`
  lays real strands over it as well, streaming from the crown (from the bun, for `hairStyle: 'bun'`), and
  `strands: { length: .02, layers: 8 }` tunes them. With `look: 'real'` a beard and a moustache are single
  hairs in the head's own close-up mesh instead, over the beard's colour painted under them, and wear no coat.
  `person.hair` is the coat, or `null`: no beard or moustache (or a real face's) and no strands asked for, under a hat (the hair there stays as sculpted, cropped close), or
  `strands: false` (none anywhere).
- **Any mesh.** `gs.models.fur(mesh, o)`: `length` (in the mesh's own units), `kind` (`'fur'` on end, `'hair'`
  lying side by side), `where` (how much of the length grows at each point: a `Float32Array` of 0..1, or
  `(i, x, y, z) => 0..1`; strands shorten toward where none grow and the coat thins out there, so it has
  no cliff at its edge), `tile` (how wide the strand picture is on the surface: fur has 32 strands across
  it), `lean` and `flow` (how far the strands lie over, and which way: down and back along -z unless told),
  `uv: { centre, crown }` (hair streaming from the crown of a head), `thin`, `rough`, `root` and `tip` (how
  dark the roots, how light the tips), `colour`, `seed`. The mesh's vertex colours colour the coat.
- **The coat** (`creature.fur`, `person.hair`, what `fur()` returns): `length` (1 as made; set it any time:
  1.5 stands fur on end, .5 is a wet coat) and `lean` (a creature's `move()` lays its fur back as it runs),
  `level` (how much of it is showing), `layers`, `tris`, `shells` (its meshes), `dispose()`.
- **Cost, and what keeps it down.** Each layer is one more draw of the furry triangles: a dog is about
  4,500 triangles a layer (the body on the middle level's triangles, the head on the finest), a head of
  hair about 2,000, a beard 4,500 more (it grows on the face's finest triangles). So: the layers are few
  and set by the phone's quality (none on the slowest phones, then 5, 7 and 10; `layers` overrides); a
  coat shows only on the closest level of detail; and it thins out by itself with distance, whether or
  not you call `see()`: an animal has every layer while it is over about 260 pixels on screen, every
  other one down to 120 and none below; a person's hair has every layer once they stand about 800 pixels
  tall (a head big enough to see strands on), every other one from about 360. The outermost layer is
  drawn first, so what it covers of the ones below is not drawn. Not yet measured on a phone: in a
  crowd, give fur to the few the camera is close to (`fur: false` on the rest).
- Not there: strands are not simulated (fur does not sway or part, long hair does not swing: it is the
  sculpted shape with strands on it), a coat does not get wet or snowy with the weather by itself, and
  feathers and scales are still painted.
- To look it over: `node scripts/creatures.cjs sheet.png like=dog,cat,person:long:f,person:short:beard:grey
  cols=idle:face,idle:nape cell=480x480 [layers=10] [fur=0] [--webgpu]`.
