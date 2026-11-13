# Game Scroll: instructions for AI coding tools

Game Scroll is a phone app where you scroll a feed of quick mini games, like a short-video feed
but every card is playable. Each game is **one file in `src/games/`**. These instructions are for
AI tools (Claude Code, Codex, Gemini CLI, Copilot, Cursor...) helping someone make or fix a game.
The human-facing guide is [CONTRIBUTING.md](CONTRIBUTING.md); the kit reference is
[docs/maker-kit.md](docs/maker-kit.md).

## Making a game: the steps

1. Pick an idea that plays differently from the games already in `src/games/` (look at their
   `title`, `tag` and `hint`) and from `docs/game-ideas.md`. A new mechanic, not a reskin.
2. Start from a template: `npm run new <id> --style <phone|pocket|color|advance|console|nextgen|ar|board>`.
   It writes `src/games/<id>.js`, a small working game. Then change it into the new game.
3. Write the game (rules below). Use `gs` for everything shared.
4. Check it, and fix whatever fails:
   ```bash
   node scripts/game-lint.mjs <id>          # forbidden code (network, storage, eval...); also kit hints (advice, not failures)
   node scripts/game-types.mjs <id>         # gs used the way its types describe (no kit, method, option or field that doesn't exist)
   node scripts/unique.mjs <id>             # the three nearest games and why; a near-copy fails, a near-twin is a warning to act on
   npm run games                             # builds streamed files; fails on bad imports or a missing gs part
   npm run build:bundled && node scripts/smoke.cjs <id>   # plays it with random input; fails on any error
   node scripts/stream-smoke.mjs <id>        # plays it streamed, the way the store apps run it
   node scripts/fold.cjs <id>                # survives folding / unfolding the screen
   ```
   For Console, Next Gen and Board games also run `node scripts/sweep.cjs <id>`. `node scripts/playtest.cjs <id>`
   has a bot try to reach the goal (warnings only). `node scripts/budget.cjs <id>`
   checks frame time and memory on a slowed CPU (the PR check runs it too).
   Which check fits which change, and how to keep testing fast (`--jobs`, software 3D): [docs/testing.md](docs/testing.md).
5. Only change files in `src/games/` (and optionally tick the idea in `docs/game-ideas.md`). Shared
   code (`src/kit/`, `src/gamescroll.js`, `src/main.js`...) ships inside the app: change it only when
   asked to, in a separate PR.
6. **Adding a dependency** (a package in `package.json` `dependencies`, only for shared code): add it
   to `src/licences.js` in the same PR so it shows under Settings › Licence › Open-source parts.
   `npm run licences` checks this, and the PR check fails until it's listed.

## The rules (a game that breaks one won't be merged)

- **Original.** Genres and mechanics are fine; recreating a specific existing game (its name,
  characters, art, music, levels or look, even renamed) is not. Invent names and characters.
- **One file, drawn in code.** No image, font, sound or data files. Draw on the canvas; make sounds
  with `gs.sound`.
- **Only `gs`.** The one import is `import gs from '../gamescroll.js'`. No other imports, no
  `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `indexedDB`, `eval`, `new Function`,
  `import()`, `window.open`, Capacitor or `navigator.geolocation`. Save with `api.save()`, find the
  player with `api.location()`.
- **Touch first.** Fully playable with touch alone. Sensors (tilt, mic, camera, face, motion moves)
  need a touch fallback.
- **Quick.** One sentence of hint explains it; a round lasts about 20 seconds to 3 minutes (a Board game
  may run longer, and then saves after every turn with `api.save()` so it can be picked up again).
- **Family friendly.** Cartoon action is fine; no gore, hate, real-money gambling.
- `goal` is required: the score that counts as a win (a decent player reaches it in about a minute).

## A game file

```js
import gs from '../gamescroll.js';
const { sounds } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects, { clamp, rnd } = gs.util;

const W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let things, score, t;
  return {
    reset() { things = []; score = 0; t = 0; feel.clear(); },   // ALL round state here
    update(dt) {                                               // dt in seconds
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      // ...move things, spawn, check for game over: api.over()
    },
    draw(c) {                                                  // draw the whole frame, W x H units
      c.fillStyle = '#123'; c.fillRect(0, 0, W, H);
      feel.begin(c); /* the world */ feel.end(c, W, H);
      // HUD
    },
    down(x, y, id) { /* already in game units */ score++; api.score(score); feel.coin(x, y); },
    move(x, y, pressed, id) {},
    up(x, y, id) {},
    key(k, isDown) {},                                         // optional: desktop keys and controllers
    // with tick: 60 in the definition, update(dt) gets exactly 1/60 and draw(c, alpha) how far between ticks
  };
}

export default {
  id: 'my-game',                  // = the file name
  title: 'My Game',
  tag: 'Casual · Reflex',         // '<Style> · <Genre>'
  retro: false,                   // style fields: see "Styles" below
  w: W, h: H,
  goal: 30,
  hint: 'Tap the ... before they ... Miss three and it is over.',
  creator: 'Your Name',
  make,
};
```

`api`: `score(n)`, `over()`, `win()`, `has(itemId)`, `away()` (seconds since it last ran), `scoreArea()` (where the app's score badge sits: keep HUDs out of it), `save(data)` / `load(fallback)` / `clearSave()`
(8 KB JSON, follows the player to a new phone; changing its shape? add `save: { version, migrate(data, from) }` to the definition), `saveLocal(data)` / `loadLocal(fallback)` / `clearLocal()` (512 KB JSON that stays on this phone,
for a built world or recorded runs; call `loadLocal` in `make()` or `reset()`), `ahead(id)` (where a finger is heading by the next frame, or null), `location()` / `watchLocation(cb)` (needs `location: 'coarse'` or `'precise'` in the
definition).
Optional definition fields: `tick: 60` (fixed tick), `music: 'chase'` (a soundtrack in one line: the app plays an original tune under each round that follows the action; moods `happy`, `calm`, `tense`, `spooky`, `heroic`, `sad`, `silly`, `chase`, `puzzle`),
`touch: 'fine'` (`move()` gets every reading of the finger, several a frame: drawing and tracing games), `lcd: true` (pixel styles: an old handheld screen's grid and ghosting), `maxW` / `maxH` (fluid size), `reward`, `shop`.
Optional game methods: `snapshot()` / `restore(data)` (keep a round across hot reload), `fx(dt)` (effects behind the game-over screen), `resize(w, h)`
(fluid games with `maxW`, `maxH`), `debug(c)`, `pause()`, `resume()`.
Next Gen and AR: frame generation makes the in-between frames on fast screens by itself; `frameGen: 'ahead'`
(no added delay) or `frameGen: false` in the definition, `view.cut()` after a camera jump, and
`view.aimNow(cam => ...)` for a game turning its own camera from touch (gs.camera rigs already do).

The app draws the start and game-over screens and the score. The game only draws play.
On a Next Gen, AR or Board game, Play first shows a loading screen: the app runs `reset()`, draws the round's
first frames and runs its first `update()` under it, and starts the round once the shaders for all of that are
built. So make what a round needs in `reset()` or its first `update()`, not a few frames in.

## Styles

| Style | Fields | Tag | Size | Use |
| --- | --- | --- | --- | --- |
| Phone (Casual) | `retro: false` | `Casual ·` | 360 × 640 | any colours, smooth |
| Dot matrix (Pocket) | `retro: true, pal: 'moss'` | `Pocket ·` | 160 × 160 | exactly 4 shades: `gs.palettes.PAL[pal]` |
| Color (Pocket) | `retro: true, era: 'color', pal: 'lemon'` | `Color ·` | 160 × 160..192 | `gs.palettes.C16` |
| Advance (Pocket) | `retro: true, era: 'advance', pal: 'grape'` | `Advance ·` | 176 × 176 | rich pixel colours, sprites |
| Classic Console (3D) | `retro: true, era: 'console', pal: 'grape'` | `Console ·` | 192 × 160 | `gs.toon` cel-shaded 3D |
| Next Gen (HD 3D) | `retro: true, era: 'nextgen', pal: 'grape'` | `Next Gen ·` | 300 × 300 | `gs.hd` PBR, shadows, bloom |
| AR · 3D | `retro: true, era: 'ar', pal: 'grape'` | `AR ·` | 300 × 460 | `gs.ar` camera + gyro |
| Board (3D + AR) | `retro: true, era: 'board', pal: 'grape'` | `Board ·` | 300 × 460 | `gs.tabletop`: a board on a table in 3D, or on your floor in AR |

Pixel styles (Pocket, Color, Advance): use `new Feel({ pixel: true })`, whole-pixel positions and
`gs.pixel` for text and sprites. 3D: copy the matching template; docs are `docs/console-3d.md`,
`docs/nextgen-3d.md`, `docs/ar-3d.md`, `docs/board-games.md`.

## What's on `gs` (use it rather than writing your own)

- `gs.effects.Feel`: `coin`, `hit`, `boom`, `hurt`, `jump`, `land`, `shoot`, `powerup`, `combo`,
  `score`, `win`, `lose`, `click`: particles + shake + sound + haptics in one call.
- `gs.juice`: `Juice` (particles, shake, pop-ups, flash, hit-stop, tweens), `Timeline` + `stagger` (anime.js; lazy), `ease`, `lerp`, `approach`, `pulse`.
- `gs.sound`: `sfx(f, d, type, vol, slide)`, `sounds.coin()` etc. (98 ready-made: `step`, `slash`, `gem`, `door`, `fanfare`, `boing`...; the full list is in `docs/maker-kit.md` and the types), `noise()`, `tone()`, `notes('C5 E5 G5')`,
  `music({ tempo, lead, bass, drums, set: 'chip'|'synth'|'band'|'orchestra' })`, `instrument('kalimba')` (one voice to play; lazy), `compose({ mood, seed })` (an original tune for music()), `zzfx(...numbers)`, `zsound()`, `Tone()` (Tone.js; lazy),
  `mixer` (`volume`, `duck`, `room('cave')`, `muffle`, `voices(n)`: 32 sounds at once, the quietest give way), `Foley({ ears, world, marks, weather })` (the sounds a world makes by itself: World3D knocks by what things are made of (a body's `sound: 'wood'`, else its mesh), `watch(person)` footsteps by what is underfoot, `watch(vehicle)` engines through the gears; `update(dt)` each frame), `say(text, { pitch, rate, lang, voice, size, fx })` (text to speech; `voice: 'woman' | 'man' | { kind, lang, take }` casts a character from the phone's voices, `say(['Bold.', .3, 'Rectangular.'])` times a line with pauses, and `size: 1.15` (a bigger person) and `fx: 'radio' | 'tannoy' | 'phone' | 'megaphone' | 'box' | 'bright' | 'warm' | 'robot' | 'tiny'` shape the voice into a character and play it through the mixer in the apps; `shaped()`).
- `gs.device`: `haptic('light'|'medium'|'heavy'|'tick'|'success'|'warning'|'error')`, `buzz()`,
  `steps()`, `pressure()` (height change), `light()`, `near()`, `hasSensor(kind)` (null until running; keep a touch way),
  `hapticPattern([{ at, len, strength, sharpness, to }] | 'heartbeat'|'explosion'|'charge'...)`,
  `tilt()` + `want('motion')`, `calibrateTilt()`, `onShake(cb)`, `heading()`, `faceDown()`,
  `startMic()` (`level()`, `pitch()`, `blow()`, `clapped()`, `whistle()`)/`stopMic()`, `startCamera()`/`stopCamera()`.
- `gs.controls`: `Stick`, `Button`, `Gestures` (tap, doubleTap, hold, swipe), `TwoFingers` (pinch, twist, pan), `twoThumb(W, H)`, `Keys`, `route()`.
- `gs.pad`: `pad()` (analog sticks, triggers, `pressed('a')`), `pads()`, `rumble()`. Pads also arrive as keys.
- `gs.moves.Moves`: `on('swing'|'punch'|'throw'|'flip'|'twist'|'knock'|'shake', fn)`, `update()` each frame.
- `gs.pixel`: `text(c, str, x, y, { size, font: 'small'|'big'|'tiny'|'silkscreen'|'jersey'|'terminal', align, color, outline })`,
  `sprite(art, palette)`, `anim(frames, palette, fps)`, `tiles()`.
- `gs.fonts`: `c.font = font('Bangers', 34)` (13 display fonts that look the same on every phone: `Bangers`, `Fredoka`, `Titan One`, `Bungee`,
  `Orbitron`, `Creepster`, `Pirata One`, `Rye`, `Monoton`, `Black Ops One`, `Cinzel`, `Patrick Hand`, `Courier Prime`; plus `Rubik`), loaded on first use;
  `use('Bangers')` in `make()` or `reset()` to have one in before the first frame. Not the phone's own fonts (`Arial`, `Courier New`, `Impact`...).
- `gs.physics.Physics` (Rapier 2D; lazy): `circle`, `box`, `poly`, `line`, `walls`, `hinge`, `spring`,
  `rope`, `ragdoll(x, y, { size })`, `weld`, `slider`, `wheel`, `grab`, `ray`, `at`, `blast`, `onHit`, `step(dt)`, `path(c, t)`.
- `gs.physics3d.World3D` (Rapier 3D; lazy): `ball`, `box`, `capsule`, `hull`, `ground(mesh)`,
  `floor`, `mover()` (walking character), `ragdoll(character)` (a jointed ragdoll on a `gs.poses` rig: joints that only turn as real ones do, `drive(pose, strength)` muscles), `ray`, joints, `step(dt)` syncs meshes.
- `gs.ai`: `Crowd` (`add(x, y).chase(t) / flee / wander / follow(route) / flock / hunt(t, nav)`),
  `NavGrid` (`path`, `sees`), `Brain` (state machine), `Tree` (behaviour trees: mistreevous text, actions by name), `Choose`
  (utility AI: the highest-scoring want), `YUKA`, `Swarm({ count, w, h, speed })` (thousands of flockers on the
  graphics chip where the phone can: `pull(x, y, { strength, radius })`, `obstacle`, `near`, `kill`, `x`/`y` arrays; `Swarm.max()`).
- `gs.things.Things` (game objects): `add(obj, tag)`, `hit(obj, tag)`, `hits(tagA, tagB, fn)`, `near`, `nearest`, `kill`, `reuse`, `each`, `all`.
  `gs.things.Node`: parent and child places (`add`, `update()`, `wx`/`wy`/`wangle`, `toWorld`, `hit`, `pick`, `attach`, `draw`).
- `gs.rounds`: `Ready` (wait for the first tap: `if (!ready.update(dt)) return;`, `if (ready.go()) return;` in `down`), `Scenes({ name: { enter, update, draw } }, start)` with `go(name, { fade })`, `cover`, `after()`; `Levels(list)`.
- `gs.pacing`: `Spawner({ every, fastest, over })`, `Waves([...], { breather })`, `Director` (difficulty that eases off), `ramp`.
- `gs.aim.AimAssist`: sticky aim, pull onto targets, auto fire (2D angle or 3D direction).
- `gs.senses`: `Senses` (sight cones, hearing, memory; moods calm/suspicious/alert/searching), `Noises`.
- `gs.camera.CameraRig` (3D): `chase`, `shoulder`, `first`, `top`, `side`, `orbit`, `rail`, `fixed`; walls, blends, `shake`, `kick`.
- `gs.nav3d.NavMesh3D` (lazy): 3D paths made from your level meshes, `crowd()` agents.
- `gs.characters`: `lookAt`, `reach` (two-bone IK), `Steps` (feet that plant), `Wobble`, `Face` (blend shapes, blinking, lip sync with `say(text)`), `shapes(geo, {...})`, `Reactions(character, { world, mover })` (people who react physically: `hit(push, at)`, `blast`, `trip`, `fall`, `brace`; they flinch, take steps to keep their balance, fall as a ragdoll and get up; steer only while `!react.busy`); ragdolls are `World3D.ragdoll()`.
- `gs.camera2d.Camera2D`: follow with a dead zone, look-ahead, zoom, level bounds, `layer()` parallax, `toWorld()`.
- `gs.tiles.TileMap.fromText(level)`: `#` walls, `-` one-way, `/` `\` slopes, letters as marks (`find('P')`);
  `move(box, dx, dy)`, `ray`, `sees`, `walkable()`, `draw(c, fn, cam)`, `edges(tx, ty)` (auto-tiling: `mask`, `blob`).
- `gs.paths`: `Path(points, { loop, kind })` (2D/3D; `at`, `offset`, `nearest`, `spaced`, `trace`), `Follower(path, { speed, end })`.
- `gs.bones.Rig`: 2D bone characters (`bone`, `pose`, `blend`, `clip`/`play`, `reach` IK, `look`, `wobble`, `kick`, `draw`).
- `gs.movers`: `Platformer` (coyote time, jump buffer, variable jump, wall jump, air jumps), `TopDown`.
- `gs.anim.Animator`: sprite animation states with frame events (`on('step')`), one-shots with `then`.
- `gs.story` (lazy): `Story(inkScript)` branching dialogue (`next()`, `choose(i)`, `vars`), `Typewriter`.
- `gs.replay`: `Ghost` (record a run, `pack()` for `api.save`, race it), `Recorder` / `Replayer` (whole rounds).
- `gs.look2d`: `Lights` (darkness, coloured lights, shadows off walls), `Screen` (lazy: crt, bloom, grade,
  glitch, film, shockwave...), `Batch` (lazy: thousands of WebGL sprites).
- `gs.brains` (Tiny Brains): `Brain(api, { inputs, actions, teacher, limits, rules })` learns as you play with guard rails (`act`, `feel`, `result`), `Wave` (each enemy an experiment, `unsure(see)`), `Imagine` (tries moves ahead; `fixed: true` for replays), `Predict` (learns the player's habits: `see`, `guess`, `sure`), `Player` (one private profile across games: `skill`, `note`), `Nemesis` (a rival who remembers you), `Shadow` (copies how you play; `pack()` for `start`), `tune()`; brain options `styles`, `tells`, `start`.
- `gs.board.Board` (match, fall, refill, `slide` 2048-style, `flood`, `hint`), `gs.battle` (`Fighter`, `Battle`
  turn order + types + statuses, `Bag`, `gainXp`, `loot`), `gs.stats.Stats` (real time: stats with buffs, perks and debuffs that run out (`buff`, `perk`, `is(tag)`, `cleanse`), pools that drain and refill (`change`, `spend`, `part`), cooldowns with charges (`cool`, `use`)), `gs.gen` (lazy: `dungeon`, `cave`, `maze`, `islands`,
  `pattern`, `fov`, `proven` + `reach`; seeded, same text as TileMap), `gs.drag.Drag` (pieces, slots, snap, lists), `gs.history.History` (undo/redo: `push`, `undo`, `redo`, `merge`, `group`), `gs.items` (`Inventory` slots/stacks/equip slots, `Recipes` with `can`, `missing`, stations, timed making), `gs.adventure.Adventure` (point-and-click rooms, hotspots, use X on Y, exits, flags, auto-map), `gs.hex` (`HexMap`: x, y is its top left, `cx, cy` centres it; taps, neighbours, `reach` with terrain costs, `path`, `sees`; `Iso` views), `gs.rts` (`Select` tap/box/double tap, `formation`, `FlowField`, `BuildGrid`, tower `target`), `gs.fight` (`Reader` motion inputs + buffer, `Fighter` frame data, hit/hurt boxes, cancels, `clash`), `gs.bullets` (`Bullets` thousands in arrays, hit + graze, `Emitter` ring/spread/spiral/burst), `gs.sand` (`Sand` falling sand, liquids, fire, lava, `blast` holes in ground, `solid`, `picture`), `gs.flow` (`Streams`: rivers with current round rocks, waterfalls, whirlpools, lava/acid `hurt` zones; `Flood` shallow water that fills hollows), `gs.art` (seeded `creature`, `face`, `item` with rarity, `building`, pixel `sprite`, `name`), `gs.sports` (`Pitch`, `Team.think`: formations, chase, mark, support, shoot/pass/dribble), `gs.trivia` (lazy: `Quiz` of 2,700 questions, seeded, no repeats, `climb`, `fifty`; show `CREDIT`), `gs.idle`
  (`cost`, `afford`, `short`, `Earner`; `api.away()` for time away), `gs.party` (`Turns` with hand-over, `Split`
  screens), `gs.rhythm` (`Beat`, `Chart`, `Calibrate`), `gs.strokes` (`Stroke`, `Shapes` recogniser, `toPhysics`),
  `gs.vehicles` (`Car`, `Kart`, `Laps`; `World3D.vehicle()` for suspension), `gs.level3d.Level3D(text)`, `gs.sky`
  (`Sky` time of day, `Weather` rain/snow/storm; `new Weather(view, { level: world, ground: land.height })` changes the world too: rain and snow stop at roofs, the open ground gets wet and puddled and dries, snow settles and melts, floors indoors stay dry, water runs down walls and glass, drops land on the lens (`view.drops`); `watch(car)` throws spray off its tyres; `wetAt(p)`, `snowAt(p)`, `open(p)`).
- Action and adventure: `gs.combat` (`Gun`, `Shots`, `arc`/`lob`, `Health`, `Markers`, `Explosives`), `gs.tactics`
  (`CoverMap`, `Squad`, `Route`), `gs.climb` (`Ledges`, `Climber`, `Rope`), `gs.poses` (`figure`, `person` skinned with a face, `Rig` with `blend`/`blend2` blend spaces and `plant` foot IK, `LIFELIKE` strides whose feet don't slide, `keys([...])` key-pose actions), `gs.missions`
  (`Mission` scripts, `zone`), `gs.cutscene`, `gs.prompts` (quick-time), `gs.destruction` (`shatter`, `slice`, `Rubble`; `Structure(scene, { building: { style, floors }, world })`: a building that comes apart: `hit(point, { power })`, `blast(point, radius)`, and what the broken pieces held up comes down; `broke` lists what happened for your dust and sound, `standing` 1..0; make it in make(), `reset()` each round),
  `gs.stealth` (`lightAt`, `Takedown`, `Bodies`, `Floors`, `Disguise`), `gs.gadgets` (`Grapple`, `Zipline`, `Wires`, `Lock`,
  `Code`), `gs.arena` (`Arena`, `BallCar`, `chaseBall`), `gs.campaign.Campaign`, `gs.sound.Ears` (3D sound; `new Ears({ level: world })` muffles sounds behind walls and gives each place its own echo by itself) and
  `music({ layers }).intensity()` + `follow(song)` (living music), `gs.props` (`Props` instancing + LOD (a kind with no `lod` gets simpler far shapes by itself), `perCopy(instancedMesh)` skips off-screen copies, `Areas`, `Chunks`, `simplify`; `Crowd(view, { of: [human(...), creature(...)], moves: ['idle', 'walk', 'run'] })` hundreds of animated people or animals in a few draws, nobody posed in JavaScript: `add({ x, z, turn, kind, move, size, tint })` gives a member to move as you like, `update(dt)` each frame, `near`, `ray` (a shot or a tap), `clear()` in `reset()`; no faces, hair strands or fur in a crowd, so swap the one the player is looking at for a real `human()`).
- Cities: `gs.city.City(view, { seed, blocks, style: 'downtown'|'oldtown'|'harbour'|'suburb', traffic, people, sky })` (made-up streets, lit buildings
  with rooms behind every window, traffic at the lights and people (on Next Gen real cars and sculpted people, sculpted the first time a phone meets them); `update(dt, player)`, `avoid`, `collide`, `ray`, `route`, `spot('door'|'rooftop'...)`, `cars.hit`, `people.scare`, `plan`, `drawMap`); guide `docs/city.md`.
- Big worlds: `gs.regions` (`Regions(view, { world })`: a world in parts that are made a little each frame while wanted and freed behind (meshes, their geometry and pictures, bodies): `part(name, make)` + `want(name)` for levels built only when picked (in `reset()`: at once, under the loading screen; later: over the next frames, `has(name)` says when), `cells({ size, reach, make })` squares round the player, `land({ height, size, reach, solid })` ground in tiles, finer close by and solid near; `update(dt, at)` each frame, `ready`, `progress`; a make can be a generator function that `yield`s between pieces, and `yield r.wait(promise)` waits for background work; far out, the view draws and `World3D` simulates about a centre that follows the camera by itself, so places 20 km out stay steady and nothing changes for a game).
- Things made in code (Next Gen; no image or model files): `gs.models` (`material(name)` 19 recipes like wood, brick, rust, fabric;
  `wear(mesh)` worn edges, grime, moss, snow; `prop('crate'|'barrel'|...)` 18 props; `sculpt([{ ball }, { box, cut }...])`;
  `tree('oak'|'pine'|'palm'|'fan'|'banana'|'fern'|'cypress'|'reeds'|'lily'|...)` (plants with leaves that sway from where they grow; `bend: marks` brushed aside by passers-by), `ivy(walls)` grown over meshes, `weeds({ lines, walls })` in cracks; `building({ style, floors })`; `relief(mesh)` a material's bumps (roof tiles, bark, stone) as real triangles, built in the background and drawn only as finely as shows; `human(opts)` a sculpted close-up person: face, hands, clothes, hats, kit, three detail levels, `twin()`, `hold()`, `touch()` (hands and feet onto a rung, a bar, a ledge; the fingers close round what a hand holds by themselves and lie relaxed when it holds nothing), feet that stay where they are put down however you move it (it steps round when turned on the spot, stops in two steps, and its eyes and head go first into a turn: `rig.update(dt, { speed, toward })` says where it means to go; a walk of its own from its body and seed, no two strides alike, slopes, and moods: `rig.manner.mood = 'tired'`), moves that take up the body's speed, and arms, head, pack and belt kit that swing on and settle when it starts, stops or turns (nothing to call; `rig.hang(thing)` for your own slung rifle), and a live face (`person.face`: it blinks and its eyes move by themselves; `look(point)`, `say(text)`, `set('angry', 1)`, `wince()`; no `update()` to call), skin with pores and eyes with a wet cornea close up (nothing to set); several kinds: `human.all([...])` first thing in make();
  `creature({ like: 'deer', seed })` an animal or monster from a seed with gaits made for its own legs and wings: 35 to start from (`dog`, `horse`, `owl`, `shark`, `bee`, `spider`, `dragon`, `ogre`, `blob`...; kinds `quad`, `bird`, `fish`, `insect`, `monster`), `move(dt, speed, { fly })` each frame, `speeds`, `rig.play('eat')`, `twin()` for a herd, `creature.all([...])` first thing in make();
  `fur(mesh, { length, kind: 'fur'|'hair', where, lean })` fur or hair in layers on any mesh, no texture files; creatures with a coat of fur wear it by themselves close up (`creature.fur.length = 1.5` stands it on end; `fur: false` leaves it off) and people's beards are strands, `beard: 0..1.5` (`person.hair`; `strands: true` for their hair too, `strands: false` for none);
  `vehicle('car'|'truck'|'tank'|'train'|'boat'|'plane', { style, seed, colour, finish })` a vehicle with no model files, its nose along -z: 31 styles (`vehicle.kinds`: `jeep`, `pickup`, `tanker`, `heavy`, `steam`, `coach`, `rowboat`, `patrol`, `biplane`, `jet`...), `move(dt, speed, { steer })` each frame rolls and steers its wheels, runs its tracks and spins its propellers, `aim(turn, lift)` a turret, `points.driver` / `muzzle` / `exhaust`, `car.chassis()` for `World3D.vehicle`, a train's `cars: ['van', { style: 'open', load: 'coal', colour }, 'guard']` (loads `tarp`, `coal`, `crates`; `deflectors: true` on a steam engine, `polished: false` a working one with nothing bright) and `along(track, d)`, or `fuse: true` for a train that keeps to a straight line in a third of the draws, `twin()`); guide in `docs/nextgen-3d.md`.
- Worlds, craft, soft things, cards and menus: `gs.outdoors` (`Land` terrain + `grass`/`scatter`/`meadow` (thick grass that keeps round the camera) + `rocks({ caves: [{ path, radius }], shapes: [{ arch | box | ball, at }] })` (real rock on the height map: cliffs with ledges and overhangs where it is steep, caves to walk through, arches; then `land.floor(x, y, z)` is what a thing stands on, `roof`, `sky` (how dark), `ray`), `Water` (waves to float on; with `ripples: true` it can be disturbed: `ring`, `splash`, `watch(boat)` for its wake and foam, `rain`, a `bed` for shallows and shore foam, `underwater(view)`), `Sea` (the open sea to the horizon: `new Sea({ wind, dir, bed: land.height, view })`, a swell the wind made that `height()` answers, fine waves (an FFT on the chip on WebGPU), whitecaps, and over a `bed` waves that break, a swash up the beach and wet sand; `update(dt, camera.position)`, `covered(x, z)`, `wetAt(x, z)`), `River` (water/lava look for gs.flow), `FloodWater` (GPU on WebGPU), `tree`, `rock`, `Wind`, `impostor`, `Marks` (ground that takes marks: `new Marks(view, { land, weather, mud: (x, z) => 0..1, sand })` in make(), `watch(person)` / `watch(vehicle)` / `watch(thing, { feet: 4, shape: 'paw' })` leave footprints and tyre tracks in snow, mud and sand and part the land's meadow, `update(dt)` each frame, `made` this frame's marks for sounds, `kindAt(x, z)`, `trail(x, z, r, { by })` to follow, `step` / `press` / `roll` by hand, `clear()` in reset()), `Cloth(view, { wind })` (flags, banners, awnings and washing lines in the wind, sheets that drape over `ball` / `capsule` solids: `flag`, `banner`, `awning`, `line`, `sheet`, `piece.ride(mast)`; clothes people wear: `skirt({ on: person })`, `cape({ on: person })` go round their legs and body and fly as they run; `update(dt)`, `clear()` in reset(); on the graphics chip on WebGPU)),
  `gs.craft` (`Plane`, `Boat`, `Hover`, `Floater`), `gs.soft` (`Soft` cloth/rope/jelly with `grab`/`cut`, `Liquid`),
  `gs.cards` (`Deck`, `total`, `groups`, `poker`, `winners`, `stacks`), `gs.dice` (`roll('4d6kh3')`, `odds`, `Dice`, `Dice3D`),
  `gs.words` (lazy: `Words` dictionary, `compare`, `Bag`, `score`), `gs.ui` (lazy: `UI` flexbox layout and input with no look; you draw it).
- `gs.solve`: `Puzzle` (`cell`, `allDiff`, `sum`, `rule`; `solve`, `unique`, `carve` to one-answer clues, `grade`, `hint`), `Search` (turn-based opponents: `best(state, { time, skill, mode: 'minimax'|'mcts' })`).
- `gs.tick` (games with `tick: 60`): `alpha` (also `draw(c, alpha)`), `mix(before, now)`, `turn`, `rate`, `count`; Physics `sx`/`sy`/`sangle`, `World3D({ smooth: true })`.
- `gs.voxels` (3D; lazy): `Voxels({ size })`: `generate({ seed, kind })`, `set`/`get`/`fill`/`sphere`, `update()` meshes changed chunks, `ray`, `move(box, ...)`, `pack`.
- `gs.fluid` (3D): `Fluid(view, { box, volume, kind: 'water'|'lava'|'slime'|'honey' })` real liquid to pour, splash and fill things with (tens of thousands of drops on WebGPU, a smaller version elsewhere; make it once, `clear()` in `reset()`):
  `pour({ x, y, z, rate, speed })` taps, `fill({ y1 })`, `splash`, solid `ball`/`box`/`tube` (`hollow` cups and tanks, `set()` or `follow` to move), `ground(fn)`, `drain`, `push` (blast), `update(dt)`; `amount(box)`, `level(x, z)`, `wet(x, y, z)`, `full`. Cups and gaps at least six drops wide (`fluid.dropSize`); try `{ gpu: false, drops: 600 }` once, which is what slow phones run.
- `gs.gas` (3D): `Gas(view, { box, kind: 'smoke'|'fire'|'steam'|'dust'|'toxic'|'magic', open: false (a closed room), lamp: true })` smoke and fire that flow: they rise, curl, spread under a ceiling, go round solid things and with the wind (a lit volume of hundreds of thousands of cells on WebGPU, soft puffs in a coarse grid elsewhere; make it once, `clear()` in `reset()`):
  `fire({ x, y, z, size, power })` (with `dir`, `speed`: a torch, a jet), `smoke({ rate, heat })`, `fan({ dir, speed })`, `burst(x, y, z, { size })` an explosion, `puff` (dust, a smoke bomb), `wind`, solid `ball`/`box`/`tube` (`set()` or `follow` to move), `solid(fn)` walls, `ground(fn)`, `update(dt)`; `smokeAt`, `heatAt`, `flowAt`, `sees(a, b)` (how much shows through the smoke), `smokeIn(box)`, `glow`. Keep the box small; gaps at least three cells wide (`gas.cell`), fires at least half a unit; try `{ gpu: false, cells: 5000 }` once, which is what slow phones run.
- `gs.tweak(name, { speed: 3, grip: [.8, 0, 1] })`: live sliders in `npm run dev` (starting values elsewhere); read fields where used.
- `gs.prefs` (read only): the player's Reduce motion setting, `reduceMotion`, `motion`. Shake, flash and
  camera kicks already follow it; scale your own big effects by `gs.prefs.motion`.
- `gs.math`: `rng(seed)`, `daily(salt)`, `noise2`, `noise3`, `fbm`, `vec`, `overlap`, `Grid`, `Timers`, `angleDiff`, `wrap`.
- `gs.util`: `clamp`, `rnd`, `pix`, `disc`, `hash`, `fmt`, `letter(i)` ('A' + i), `flickTracker`. `gs.palettes`: `PAL`, `SHELL`, `C16`.
- `gs.gfx` (shaded 2D shapes, glow, backdrops; materials made in code: `material('paper'|'wood'|'stone'|'metal'|'cloth'|'water', { color, seed, scale, planks, blocks })` then `c.fillStyle = m.at(x, y)`,
  `slab(c, x, y, w, h, m, { r, bevel, shadow })`, `water(c, x, y, w, h, t)`, `sticker(w, h, draw, { outline, glow, shadow })` then `.draw(c, x, y, { scale, angle })`), `gs.bricks` (toy bricks), `gs.geo` (location maths).
- `gs.sketch` (hand-drawn looks): `Sketch({ stroke, roughness, boil })` `rect`/`circle`/`ellipse`/`line`/`poly`/`lines`/`curve`/`arc`/`path` with `{ fill, fillStyle: 'hachure'|'solid'|'cross-hatch'|'zigzag'|'dots' }`;
  `Ink({ size, taper, color })` `add(x, y)`/`end()`/`draw(c)`/`hit(x, y)` for lines the player draws, `ink(c, points)`.
- `gs.icons`: `icon(c, 'sword', x, y, size, { color, outline, angle, pixel })`: 528 icons that look the same on every phone (use these, not emoji); plain words (`heart`, `coin`, `key`, `star`, `skull`...) or `names`, `find('potion')`.
- `gs.real` (real-world signals, no permission): `sun(place?)` (`up`, `height`, `compass`, `light` 0..1, `part`, `rise`/`set`, `hour` for gs.sky), `moon(place?)` (`phase`, `lit`, `name`), `battery()` (`level`, `charging`, `saver`), `headphones()`; null where the phone won't say, and never the only way to win.
- `gs.toon` (Console 3D: `View` with real toon shadows and a rim of light, `{ retro: 'chunky'|'soft'|'tube' }` looks, `G`, `part`, `grp`, `blob`, `toon`, `dude`, `figure` (a jointed person with a `gs.poses` rig)), `gs.hd` (Next Gen: `HDView` with `decal`, `bounce` (bounce light), `room` (room reflections), `reflect(floor)` (marks shiny things for reflections; ray traced on the best phones, where a floor also shows what is off screen), `detail` (cluster detail: big still meshes drawn only as finely as shows, by itself from 20,000 triangles), `occluders` (occlusion culling: what is behind other things is left out by itself; this adds boxes of your own), `beams` (volumetric light), `motionBlur`, `lens` (a real camera: depth of field from the f-stop, bokeh discs, focus pulls and autofocus, exposure in stops), `bakeLight`, `shafts`, `lampLights` + `placeLamps` (many lamps: the nearest lit, with shadows, light shapes like a headlamp's beam or a window's bars, and neon tubes and signs from `neon` and `sign`),
  `pbr`, `rbox`, `surface`, `speckle`, `Particles`, `sun`, `spot`), `gs.ar` (`ARView`, `FLOOR`, `arNote`; with native AR, `new ARView({ occlude: true, walls: true, light: 'real' })` lets real things hide virtual ones, maps walls and follows the room's light, `v.anchor(p, q)` holds a real spot and `v.marker(markerArt(seed))` finds a printed picture: all bonuses, never the only way to play), `gs.THREE`.
- `gs.tabletop` (Board games; guide `docs/board-games.md`): `Table(api, { span, room, table, pitch, frame })` is the table in a 3D room and, on the AR
  chip, on the player's floor: `board` (add pieces here, in board units), `update`/`draw`/`hud`, `down`/`move`/`up` (a tap, or `{ chip }`), `claim(id)`,
  `pick`, `over`, `nearest`, `toScreen`; turns as promises (`run`, `hop`, `slide`, `drop`, `pop`, `tween`, `wait`, `until`, `busy`), `think(search, state)`
  (a `gs.solve.Search` opponent, a little each frame), `dice(n, { tray })` (real dice: `roll({ keep })`, `park`), `crumble`, `puff`, `shake`, `lookAt`,
  `strip`, `status`, `say`, `frame`, `tall`, `hidden`. Pieces made in code: `slab({ w, d, paint })`, `decal`, `pawn`, `disc`, `stone`, `die`, `chessman`,
  `eyes`, `ring`, `dot`, `wood`, `fuse(group)`; `sounds`; `ROOMS`; `Chess` (rules + worker opponent: `moves`, `move`, `think({ level })`, `fen`).
- `gs.fx3d` (lazy): `text3d()`, `Particles3D` (`fire`, `smoke`, `sparks`, `boom`, `magic`, `snow`),
  `outline`, `glitch`, `trails`, `focus`, `pixelate`.
- `gs.vision` (lazy): `Face` (`x`, `y`, `yaw`, `mouth`, `smile`, `blink`...), `Hands` (`pinch`, `open`, `point`...),
  `Body` (joints, `armsUp`, `lean`, `squat`, `jump`, `clap`), `CutOut` (the player cut out of the camera), `Signs` (thumbs up, victory...); runs on the phone's AI chip in the apps, so pass `{ preview: true }` if you draw `picture`.
  Back camera: `Objects({ want: ['cup', 'banana'], shape: W / H })` spots 80 everyday things (`seen(name)` once each time one comes into view, `seeing`, `count`, `list` of boxes, `Objects.names`); `Scanner({ shape })` reads barcodes and QR codes (`scan()` gives `{ text, kind, seed }` once per code: the same code makes the same seed on every phone; `Scanner.seed(word)` for a typed word instead). Both: `start()` from a tap, `update()` each frame, draw `picture` (a canvas already cut to `shape`), positions 0..1 of it.
- `gs.hear` (lazy): `Sounds({ want: ['Dog', 'Whistling'] })` (`start()` from a tap, `update(dt)`, `heard`, `hearing`, `top`),
  `Voice({ words, also })` (`start()`, `said(word)`, `available`). `gs.doodle` (lazy): `Doodle` (`guess(strokes, { among })` of 200 things: pass `among`, the few your game cares about).
  `gs.phoneai`: `PhoneAI({ persona, words })` `ask(prompt, { fallback })` for flavour lines only; play must never depend on it.

**Lazy parts** (physics, physics3d, nav3d, fx3d, vision, Tone, `sound.instrument`, `api.loadLocal`, `tabletop.Chess`, `Table.dice()`, `story.Story`, `look2d.Screen`, `look2d.Batch`, `words.Words`, `trivia.Quiz`, `ui.UI`, `juice.Timeline`, `hear.Sounds`, `doodle.Doodle`, `fonts.use`): create them in `make()` or `reset()`, never
later. The app shows "Loading…" and remakes the game once the library is in.
A big 3D game is also made a little each frame while its card loads (the kit's builders stop the pass, each pass on a fresh copy of the game's file, and heavy number work goes to background workers), so `make()` and `reset()` may run several times
before the first round: build the world there, and keep once-only things (a save, a sound) out of them.
The 3D parts (`toon`, `hd`, `ar`, `bricks`, `physics3d`, `fx3d`, `camera`, `nav3d`, `characters`, `level3d`, `sky`, `poses`, `destruction`, `props`, `outdoors`, `city`, `models`, `voxels`, `fluid`, `gas`, `tabletop`, `regions`, `THREE`)
and `ai`, plus the action kits (`combat`, `tactics`, `climb`, `missions`, `cutscene`, `prompts`, `stealth`, `gadgets`, `campaign`, `arena`) and play kits (`craft`, `soft`, `cards`, `dice`, `words`, `trivia`, `ui`) and smarts (`hear`, `doodle`, `phoneai`) and looks (`sketch`, `icons`), also load on first use, so the app opens fast. The app loads the ones a game uses before it
runs, so read them as usual (`const { HDView } = gs.hd` at the top of the file is fine).

**Sensors are worked out for you.** The build reads which camera, mic and motion parts a game uses and
the card says so before Play (and iPhones ask for motion access on the Play tap). Don't add a field.

**Types:** `src/gamescroll.d.ts` describes all of `gs` and the game definition, so editors autocomplete.
Add `/** @type {import('../gamescroll.js').GameDef} */` above `export default` to check the definition.

## Common mistakes

- Making the kits decide the look: kits give answers (hits, timings, where to aim or look); your game draws and sets the rules.

- Round state set in `make()` instead of `reset()`, so "Play again" doesn't start clean.
- A round that starts moving (or scoring) before the player touches it: wait with `gs.rounds.Ready`.
- A HUD drawn under the app's score badge (top centre): keep it out of `api.scoreArea()`.
- Using `Date.now()` or `setTimeout` for game timing: use `dt` and `gs.math.Timers` (they pause with the game).
- Starting music in `reset()` (it also runs while the card waits in the feed): start it in `update()`, or put `music: '<mood>'` in the definition and the app plays and stops it.
- Timing with `performance.now()` in `update()`, or a hand-made fixed step: use `dt`, and `tick: 60` in the definition for the same game on every phone.
- Particles, screen shake, a thumbstick or "wait for the first tap" written by hand: `Feel`, `gs.controls.Stick` and `gs.rounds.Ready` do them (`game-lint` hints at these).
- Drawing in screen pixels: always draw in `w` × `h` game units; input is already converted.
- Forgetting a touch fallback for tilt, mic, voice, camera, face or motion.
- Pocket games with more than 4 shades, or smooth (non-integer) positions in pixel styles.
- A `goal` nobody can reach, or a game that scores with no input.
