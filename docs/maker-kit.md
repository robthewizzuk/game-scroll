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
| Guns, recoil, health that comes back, explosions | `gs.combat` | [Action and adventure kits](#action-and-adventure-kits) |
| Enemies that take cover, flank and call out | `gs.tactics` | [Action and adventure kits](#action-and-adventure-kits) |
| Hang from ledges, shimmy, climb, swing on ropes | `gs.climb` | [Action and adventure kits](#action-and-adventure-kits) |
| Run, aim, hang and climb poses on a 3D figure | `gs.poses` | [Action and adventure kits](#action-and-adventure-kits) |
| Mission scripts, objectives, checkpoints | `gs.missions` | [Action and adventure kits](#action-and-adventure-kits) |
| Cutscenes, quick-time prompts | `gs.cutscene`, `gs.prompts` | [Action and adventure kits](#action-and-adventure-kits) |
| Break walls into pieces, slice things in two | `gs.destruction` (three-pinata) | [Action and adventure kits](#action-and-adventure-kits) |
| Light meter, takedowns, bodies, disguises | `gs.stealth` | [Action and adventure kits](#action-and-adventure-kits) |
| Grappling hook, zip line, hacking puzzles | `gs.gadgets` | [Action and adventure kits](#action-and-adventure-kits) |
| Ball games with boosting, flipping cars | `gs.arena` | [Action and adventure kits](#action-and-adventure-kits) |
| Chapters, stars, collectibles, unlocks | `gs.campaign` | [Action and adventure kits](#action-and-adventure-kits) |
| Sounds placed in 3D, music that builds up | `gs.sound.Ears`, `music({ layers })` | [Action and adventure kits](#action-and-adventure-kits) |
| Thousands of trees and rocks, rooms, big worlds | `gs.props` (InstancedMesh2) | [Action and adventure kits](#action-and-adventure-kits) |
| Materials, props, sculpted shapes, trees, buildings, close-up people, and animals and monsters from a seed, made in code, and real surface detail (Next Gen) | `gs.models` | [Next Gen 3D](nextgen-3d.md#things-made-in-code-gsmodels) |
| Hills, islands, grass and trees, water to float on | `gs.outdoors` (THREE.Terrain) | [Worlds, craft, soft things, cards and menus](#worlds-craft-soft-things-cards-and-menus) |
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
| Night in the game when it is night outside; the real moon; plug in to charge; headphones in | `gs.real` (SunCalc) | [The real world: sun, moon, battery, headphones](#the-real-world-sun-moon-battery-headphones) |

## What `gs` has, and what it doesn't

`gs` is a frozen object with one group per job: `sound`, `device`, `util`, `math`, `palettes`,
`juice`, `effects`, `controls`, `pad`, `moves`, `pixel`, `gfx`, `bricks`, `physics`, `physics3d`,
`ai`, `things`, `rounds`, `pacing`, `aim`, `senses`, `prefs`, `camera2d`, `tiles`, `movers`, `anim`, `story`,
`replay`, `look2d`, `brains`, `tweak`, `board`, `battle`, `gen`, `drag`, `idle`, `party`, `rhythm`,
`strokes`, `vehicles`, `paths`, `bones`, `level3d`, `sky`, `camera`, `nav3d`, `characters`, the action kits (`combat`,
`tactics`, `climb`, `poses`, `missions`, `cutscene`, `prompts`, `destruction`, `stealth`, `gadgets`,
`campaign`, `arena`, `props`), `outdoors`, `craft`, `soft`, `cards`, `dice`, `words`, `ui`, `solve`, `tick`, `voxels`, `fluid`, `toon` (Classic
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

In 3D, ragdolls are part of 3D physics (2D games use `gs.physics` `phys.ragdoll(x, y)`, above): `rag = phys.ragdoll(guard, { limbs: [head, armL, armR, legL, legR], push: [0, 2, -5] })`
turns the character floppy (each limb swings at its origin). `rag.push()`, `rag.hit(part, ...)`, `rag.remove()`.

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
so use `Weather` alone.

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
planted foot doesn't slide), with a turning pelvis, countering shoulders and swinging arms:
`new Rig(parts, { poses: LIFELIKE, weight: 1 })`, then `rig.blend({ idle: 0, walk: 1.4, jog: 3.4, run: 5.6 }, speed)`.
`weight` gives the body weight: it leans into a spurt, rocks back as it stops and banks into a turn
(`rig.update(dt, { speed, turn })`). Your own actions are key poses: `keys([[0, { spine: [.2, 0, 0] }], [.4, { armL:
[-1, 0, 0], drop: .1 }], [1, {}]])` glides through them on curves that never overshoot (a key names only what
changes; `drop` lowers the hips, `shift: [x, y, z]` moves them, in metres). `rig.add('vault', keys([...]), { time:
1.2, once: true })` plays by the clock and holds its end (`rig.done`); `rig.play('climb', { at: rungs % 1 })` lets
the game hold the phase itself, in step with a ladder or a cutscene. `gs.models.human` people use all of this, and
`person.touch({ handL, footR, ... })` then puts hands and feet on points in the world (a rung, a bar, a ledge).

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
normal)` cuts one in two; `Rubble` fades old pieces so phones stay fast.

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

## Worlds, craft, soft things, cards and menus

As everywhere in the kit, these work things out and your game decides how it all looks.

**Outdoor worlds** (`gs.outdoors`, 3D, THREE.Terrain): `Land({ kind: 'islands', size: 200, high: 20, seed })`
makes terrain (`hills`, `mountains`, `rolling`, `islands`, `bumps`, `dunes`, `cracked`, `ridges`,
`smooth`, or your own `(x, z) => height`). `land.height(x, z)`, `normal()` and `slope()` answer where
the ground is, `flatten()` makes a pad for a village or a landing strip, `paint([[0, '#dc9'], [3, '#4a3']])`
colours it by height in your palette, `solid(world)` makes it solid in `gs.physics3d`, `grass()` scatters
blades that sway (only near the camera), and `scatter(props, 'tree', 300, { above: 1, steep: .3 })` puts
`gs.props` things on suitable ground. For a camera down in the grass (a sniper's nest, a crawl, a close-up), `land.meadow({ reach: 22, gap: .55 })`
keeps a square of thick tufts round the camera wherever it goes: see [Next Gen outdoor looks](nextgen-3d.md#outdoor-looks-ground-hills-rock-leaves-water-and-lava). `tree({ kind: 'pine' | 'round' | 'palm' | 'bush' })` and `rock()`
make simple shapes to scatter. Next Gen worlds can paint it instead with `looks.ground` (fields, hedges, lanes, mud, puddles), ring it with far hills (`horizon(land)`) and give rocks and leaves their looks: see [Next Gen outdoor looks](nextgen-3d.md#outdoor-looks-ground-hills-rock-leaves-water-and-lava). `River(stream)` and `FloodWater(flood)` draw `gs.flow` rivers, waterfalls, lava and floods (see Flowing liquids). `Water({ level, waves })` is a sea of rolling waves you can ask about
anywhere (`height(x, z)`, `normal`, `depth(p)`); call `update(dt, camera.position)` each frame.

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
stunned, inside a box). It all goes back to normal when the round ends.

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
`v.probeAt`, moves; bake once after building the level: it returns a promise and joins a frame or two later), `v.bounce(box)` adds bounce light over a level (a grid of probes: a red wall tints the floor, light from a door fills a room; WebGL and WebGPU), `v.room(box)` gives shiny things in a room box-projected reflections of that room, `v.detail(meshes)` asks for cluster detail on meshes under 20,000 triangles (big still meshes get it by themselves: each part is drawn only as finely as shows, see docs/nextgen-3d.md; `v.detail(meshes, false)` draws them whole), `v.occluders(boxes)` skips drawing what's hidden behind big solid boxes (occlusion culling; `gs.city` does it for its buildings), and `v.shafts = 1` adds sun shafts streaming
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
