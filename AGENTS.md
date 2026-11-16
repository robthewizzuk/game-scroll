# Game Scroll: instructions for AI coding tools

Game Scroll is a phone app where you scroll a feed of quick mini games, like a short-video feed
but every card is playable. Each game is **one file in `src/games/`**. These instructions are for
AI tools (Claude Code, Codex, Gemini CLI, Copilot, Cursor...) helping someone make or fix a game.
The human-facing guide is [CONTRIBUTING.md](CONTRIBUTING.md); each part of `gs` has a short page in
[docs/kits/](docs/kits/README.md) (the long reference is [docs/maker-kit.md](docs/maker-kit.md)).

## Making a game: the steps

1. Pick an idea that plays differently from the games already in `src/games/` (look at their
   `title`, `tag` and `hint`) and from `docs/game-ideas.md`. A new mechanic, not a reskin.
2. Start from a template: `npm run new <id> --style <phone|pocket|color|advance|console|nextgen|ar|board>`.
   It writes `src/games/<id>.js`, a small working game. Then change it into the new game.
3. Write the game (rules below). Use `gs` for everything shared. Keep the numbers that set how it feels in the
   template's knobs block (`gs.tweak('Feel', { ... })`): a change asked for in words ("slower", "floatier")
   is then one number, and [docs/feel-words.md](docs/feel-words.md) says which. Before using a part of `gs`, read its
   page in [docs/kits/](docs/kits/README.md) (`npm run kit physics`). To see how a part is used in a real game,
   `node scripts/examples.mjs <name>` (`rope`, `Physics.rope`, `Feel.coin`, `gs.physics`): the shortest games
   that use it with the lines, plus its declaration in `src/gamescroll.d.ts` and its place in `docs/maker-kit.md`.
4. Check it, and fix whatever fails: `node scripts/check.mjs <id>` runs all of the checks below in about
   30 s and prints one report: each problem with the line in your file (a crash while playing is traced
   back to your source line), the code on it and what to do (`--quick`: only the code checks, 2 s; `--no-speed`: without
   the speed report; `--json` for tools). The checks one by one:
   ```bash
   node scripts/game-lint.mjs <id>          # forbidden code (network, storage, eval...); also kit hints (advice, not failures),
                                            # such as letters the 3×5 pixel font hasn't got
   node scripts/game-types.mjs <id>         # gs used the way its types describe (no kit, method, option or field that doesn't exist)
   node scripts/unique.mjs <id>             # the three nearest games and why; a near-copy fails, a near-twin is a warning to act on
   npm run games                             # builds streamed files; fails on bad imports or a missing gs part
   npm run build:bundled && node scripts/smoke.cjs <id>   # plays it with random input; fails on any error
   node scripts/stream-smoke.mjs <id>        # plays it streamed, the way the store apps run it
   node scripts/fold.cjs <id>                # survives folding / unfolding the screen
   ```
   For Console, Next Gen and Board games also run `node scripts/sweep.cjs <id>`. `node scripts/playtest.cjs <id>`
   has a bot try to reach the goal (warnings only). `node scripts/lazy-check.cjs <id>` plays the lazy tricks (doing
   nothing, holding the middle, mashing one spot, circles, swiping back and forth): one that wins fails. `npm run speed <id>` (`node scripts/budget.cjs <id>`) is the speed
   report, last in the check: frame time on a slowed CPU against the budget (over it fails, here and in the PR check), the
   slowest lines in your file, garbage made a second and where, memory growth, and for 3D games draw calls, triangles and
   shaders built mid-play against low, mid and top phones, each with what to do. Making a game run well on phones is
   the maker's job: fix its warnings too. A frame lab recording from a phone (its Report file or Copy text) gets the
   same advice: `node scripts/budget.cjs --lab <file>`.
   Which check fits which change, and how to keep testing fast (`--jobs`, software 3D): [docs/testing.md](docs/testing.md).
5. Look at it, and at each change asked for: `npm run watch <id>` plays it with taps and saves a strip of frames with
   the score over time, rounds and frame times; `npm run watch <id> gravity*0.8` plays before and after a knob change
   from the same start (the file is not changed). The Game Scroll MCP server (`scripts/mcp.mjs`, set up by `.mcp.json`)
   gives AI tools all of these as tools: [docs/ai-makers.md](docs/ai-makers.md#the-game-scroll-mcp-server).
6. Only change files in `src/games/` (and optionally tick the idea in `docs/game-ideas.md`). Shared
   code (`src/kit/`, `src/gamescroll.js`, `src/main.js`...) ships inside the app: change it only when
   asked to, in a separate PR.
7. **Adding a dependency** (a package in `package.json` `dependencies`, only for shared code): add it
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
Next Gen and AR: on a phone a 3D game aims for 60; where it can't hold 60 (and on low, warm or power-saving phones) the app
draws 30 and frame generation (GSFG) makes the other 30, by itself; `frameGen: 'ahead'`
(no added delay) or `frameGen: false` in the definition, `view.cut()` after a camera jump, and
`view.aimNow(cam => ...)` for a game turning its own camera from touch (gs.camera rigs already do).

The app draws the start and game-over screens and the score. The game only draws play.
On a Next Gen, AR or Board game, the card in the feed is only a picture (the game's last round on this phone, or a
cover): its `make()` runs after Play. Play shows a loading screen: the app makes the game, runs `reset()`, draws the
round's first frames and runs its first `update()` under it, and starts the round once the shaders for all of that are
built. So make what a round needs in `make()`, `reset()` or its first `update()`, not a few frames in.

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

Every part of `gs` has a short guide in [docs/kits/](docs/kits/README.md): what it is, what to know, its types,
the maker kit's examples and the shortest real games that use it. Read the line here, then the pages of the parts
you use (`npm run kit <name>` prints one as it is now; `node scripts/examples.mjs <name>` finds every game using a
part). A new part or method of `gs`: its types in `src/gamescroll.d.ts`, what to know in the top half of its page
(`node scripts/kit-guides.mjs --new <kit>` starts one), then `node scripts/kit-guides.mjs` remakes the rest and this index.

<!-- kit index: made by node scripts/kit-guides.mjs from the first line of each docs/kits page -->
- [`gs.sound`](docs/kits/sound.md): Sound effects, 98 ready-made sounds, music and tunes made in code, the mixer, world sounds (Foley) and voices.
- [`gs.device`](docs/kits/device.md): Haptics, tilt, shake, compass, mic, camera and the phone's other sensors, each with a touch fallback.
- [`gs.util`](docs/kits/util.md): Small helpers: clamp, rnd, pix, disc, hash, fmt, letter, flick speed.
- [`gs.math`](docs/kits/math.md): Seeded random, daily seeds, smooth noise, vectors, grids, timers that pause with the game.
- [`gs.palettes`](docs/kits/palettes.md): The fixed colour sets of the pixel styles (PAL, SHELL, C16).
- [`gs.juice`](docs/kits/juice.md): Particles, shake, pop-ups, flash, hit-stop and tweens by hand; Timeline for sequences.
- [`gs.effects`](docs/kits/effects.md): Feel: coin, hit, boom, jump and more as particles, shake, sound and haptics in one call.
- [`gs.controls`](docs/kits/controls.md): On-screen thumbsticks and buttons, taps, holds, swipes, two-finger gestures, keys.
- [`gs.pad`](docs/kits/pad.md): Game controllers: analog sticks, triggers, buttons, rumble.
- [`gs.moves`](docs/kits/moves.md): Motion moves with the phone: swing, punch, throw, flip, twist, knock, shake.
- [`gs.pixel`](docs/kits/pixel.md): Crisp pixel text in pixel fonts, sprites and animations drawn from text, tiles.
- [`gs.gfx`](docs/kits/gfx.md): Shaded 2D shapes, glows, backdrops and materials made in code (wood, stone, metal, water...).
- [`gs.physics`](docs/kits/physics.md): Rapier 2D physics: shapes that tumble, joints, ropes, ragdolls, grabbing, walking a hero through the world.
- [`gs.vision`](docs/kits/vision.md): The front camera: face, hands, body and hand signs; the back camera: everyday things and barcodes.
- [`gs.geo`](docs/kits/geo.md): Location maths: distances and bearings between places.
- [`gs.real`](docs/kits/real.md): Real-world signals with no permission: the sun, the moon, the battery, headphones.
- [`gs.fonts`](docs/kits/fonts.md): 13 display fonts that look the same on every phone, loaded on first use.
- [`gs.things`](docs/kits/things.md): Game objects: add, tag, hit tests between tags, near, nearest, reuse; parent and child Nodes.
- [`gs.rounds`](docs/kits/rounds.md): Ready (wait for the first tap), Scenes with fades, Levels.
- [`gs.pacing`](docs/kits/pacing.md): Spawners, waves, a director that eases off, difficulty ramps.
- [`gs.aim`](docs/kits/aim.md): Aim assist: sticky aim, pull onto targets, auto fire, in 2D or 3D.
- [`gs.senses`](docs/kits/senses.md): Enemy senses: sight cones, hearing, memory, moods from calm to searching; Noises.
- [`gs.prefs`](docs/kits/prefs.md): The player's Reduce motion setting (read only), to scale your own big effects.
- [`gs.tick`](docs/kits/tick.md): The fixed 60 Hz tick: how far between ticks a frame is, and smooth mixing for drawing.
- [`gs.solve`](docs/kits/solve.md): Logic puzzles with one answer (make, solve, grade, hint) and turn-based opponents (minimax, MCTS).
- [`gs.camera2d`](docs/kits/camera2d.md): A 2D camera: follow with a dead zone, look-ahead, zoom, level bounds, parallax layers.
- [`gs.tiles`](docs/kits/tiles.md): Tile levels from text: walls, one-way floors, slopes, marks, moving through them, auto-tiling.
- [`gs.movers`](docs/kits/movers.md): Platformer and top-down movement with coyote time, jump buffer, wall jumps and the rest.
- [`gs.anim`](docs/kits/anim.md): Sprite animation states with frame events and one-shots.
- [`gs.story`](docs/kits/story.md): Branching dialogue from ink scripts, played by people in 3D with camera shots, and a typewriter for text.
- [`gs.replay`](docs/kits/replay.md): Ghosts to race, and whole rounds recorded and played back.
- [`gs.look2d`](docs/kits/look2d.md): 2D lights and shadows (glowing on the graphics chip), screen effects, thousands of sprites.
- [`gs.tweak`](docs/kits/tweak.md): Knobs: the numbers that set how a game feels, with live sliders in npm run dev.
- [`gs.brains`](docs/kits/brains.md): Tiny Brains: on-device learning opponents and helpers, with guard rails, corrections and memories.
- [`gs.board`](docs/kits/board.md): Grid puzzles: match, fall and refill, 2048 slides, flood fill, hints.
- [`gs.battle`](docs/kits/battle.md): Turn-based fights: fighters, turn order, types, statuses, items, XP, loot, a ready-made opponent.
- [`gs.stats`](docs/kits/stats.md): Real-time stats: buffs and perks that run out, pools that drain and refill, cooldowns with charges.
- [`gs.rpg`](docs/kits/rpg.md): RPG story systems: levels and skill trees, reputation with factions, quests with stages and a journal, the world's flags.
- [`gs.gen`](docs/kits/gen.md): Made levels from a seed: dungeons, caves, mazes, islands, patterns, field of view, levels proven playable.
- [`gs.drag`](docs/kits/drag.md): Drag and drop: pieces, slots, snapping, reordering lists.
- [`gs.idle`](docs/kits/idle.md): Idle game maths: rising prices, big numbers, money earned while away.
- [`gs.history`](docs/kits/history.md): Undo and redo for moves.
- [`gs.items`](docs/kits/items.md): Inventories (slots, stacks, equipment) and crafting recipes.
- [`gs.town`](docs/kits/town.md): A living town: a world clock, a seeded town plan, townsfolk with daily routines, shops with hours, monsters at night.
- [`gs.adventure`](docs/kits/adventure.md): Point-and-click adventures: rooms, hotspots, use X on Y, exits, flags, a map.
- [`gs.hex`](docs/kits/hex.md): Hex maps (taps, neighbours, reach, paths, sight) and isometric views.
- [`gs.rts`](docs/kits/rts.md): Strategy controls: selecting, formations, flow fields, building grids, tower targets.
- [`gs.fight`](docs/kits/fight.md): Fighting games: motion inputs, frame data, hit boxes, cancels, 3D melee, a ready-made opponent.
- [`gs.bullets`](docs/kits/bullets.md): Bullet patterns: thousands of bullets in arrays, grazes, emitters.
- [`gs.sand`](docs/kits/sand.md): Falling sand: liquids, fire, lava, ground that blasts into holes.
- [`gs.flow`](docs/kits/flow.md): Rivers with currents, waterfalls, whirlpools, lava and floods that fill hollows.
- [`gs.art`](docs/kits/art.md): Seeded art made in code: creatures, faces, items, buildings, sprites, names.
- [`gs.sports`](docs/kits/sports.md): Team sports AI: pitches, formations, marking, passing and shooting.
- [`gs.party`](docs/kits/party.md): Pass-and-play turns, and split screens.
- [`gs.rhythm`](docs/kits/rhythm.md): Rhythm games: a beat kept with the sound card, charts, calibration.
- [`gs.strokes`](docs/kits/strokes.md): Drawn shapes: smoothed finger lines, a shape recogniser, lines into physics.
- [`gs.vehicles`](docs/kits/vehicles.md): Arcade cars and karts that drift and boost, laps, a ready-made rival driver.
- [`gs.paths`](docs/kits/paths.md): 2D and 3D paths to follow: points along, offsets, nearest, even spacing.
- [`gs.bones`](docs/kits/bones.md): 2D bone characters: poses, blends, clips, IK, wobble.
- [`gs.level3d`](docs/kits/level3d.md): 3D levels from text maps.
- [`gs.sky`](docs/kits/sky.md): Time of day, and weather that changes the world: rain, puddles, snow that settles, storms.
- [`gs.combat`](docs/kits/combat.md): Guns, shots, lobs, health, markers, explosives, weapons made in code, drive-bys.
- [`gs.tactics`](docs/kits/tactics.md): Cover (2D and 3D), squads that use it, taking cover, routes.
- [`gs.climb`](docs/kits/climb.md): Ledges, climbing, ropes and swimming.
- [`gs.missions`](docs/kits/missions.md): Mission scripts, zones, objectives and markers, open-world jobs, phone calls, a world save.
- [`gs.cutscene`](docs/kits/cutscene.md): Cutscenes: camera paths, lines, and actors who walk, turn, look, gesture and speak.
- [`gs.prompts`](docs/kits/prompts.md): Quick-time prompts.
- [`gs.stealth`](docs/kits/stealth.md): Stealth: how lit a spot is, takedowns, bodies, floors that make noise, disguises.
- [`gs.gadgets`](docs/kits/gadgets.md): Grapples, ziplines, wires to cut, locks to pick, codes to crack.
- [`gs.campaign`](docs/kits/campaign.md): A campaign of levels with progress.
- [`gs.arena`](docs/kits/arena.md): Car football: an arena, a ball car, chasing the ball.
- [`gs.magic`](docs/kits/magic.md): Spells with casts, mana and cooldowns: bolts, areas, beams, wards, heals and statuses that meet.
- [`gs.monsters`](docs/kits/monsters.md): Monster attacks with telegraphs, hurt reactions (flinch, stagger, knocked down) and bosses with phases.
- [`gs.companions`](docs/kits/companions.md): Up to three companions who follow, talk and fight as guard, healer, archer or caster, with an order wheel and approval.
- [`gs.poses`](docs/kits/poses.md): Jointed 3D people: figures, skinned people with faces, blend spaces, foot IK, key-pose actions.
- [`gs.destruction`](docs/kits/destruction.md): Things that break: shatter, slice, rubble, buildings that come apart.
- [`gs.props`](docs/kits/props.md): Thousands of 3D props in few draws (instancing, LOD), areas, chunks, crowds of animated people.
- [`gs.outdoors`](docs/kits/outdoors.md): Land, grass, rocks, cliffs and caves, water, the sea, rivers, trees, wind, ground marks, cloth.
- [`gs.city`](docs/kits/city.md): Made-up cities: streets, lit buildings with rooms to walk into, traffic and people, police, one big streamed city of districts, routes, a GPS and maps.
- [`gs.models`](docs/kits/models.md): Things made in code for Next Gen: materials, props, trees, buildings, people (and a character creator), creatures, fur, vehicles, weapons.
- [`gs.voxels`](docs/kits/voxels.md): Voxel worlds: generate, edit, mesh, ray, move through.
- [`gs.fluid`](docs/kits/fluid.md): Real 3D liquid to pour and splash, and sand, snow and mud that behave like the real thing.
- [`gs.gas`](docs/kits/gas.md): Smoke and fire that flow: rise, curl, spread under ceilings, go round things.
- [`gs.regions`](docs/kits/regions.md): Big worlds in parts, made a little each frame while wanted and freed behind.
- [`gs.dungeon`](docs/kits/dungeon.md): Dungeons built in 3D from a gs.gen map: doors, keys, levers, traps, chests, secret walls, solid in the World3D.
- [`gs.mounts`](docs/kits/mounts.md): A horse or a flying beast to ride: saddle and reins on any creature, getting on and off, gaits with stamina, jumps, flight, blows from the saddle.
- [`gs.craft`](docs/kits/craft.md): Planes, boats, hovercraft and floating things.
- [`gs.soft`](docs/kits/soft.md): Soft things: cloth, rope and jelly to grab and cut; 2D liquid.
- [`gs.cards`](docs/kits/cards.md): Card decks, totals, groups, poker hands, winners, stacks.
- [`gs.dice`](docs/kits/dice.md): Dice rolls in dice notation, odds, 2D and 3D dice.
- [`gs.words`](docs/kits/words.md): A word dictionary, word comparison, letter bags, scoring.
- [`gs.trivia`](docs/kits/trivia.md): About 2,700 quiz questions, seeded, with no repeats.
- [`gs.ui`](docs/kits/ui.md): Flexbox layout and input for menus, with no look of its own.
- [`gs.hear`](docs/kits/hear.md): Sounds the mic hears (a dog, whistling...) and spoken words.
- [`gs.doodle`](docs/kits/doodle.md): Guesses what a player drew among 200 things, and learns their way of drawing.
- [`gs.phoneai`](docs/kits/phoneai.md): The phone's own AI for flavour lines only; play never depends on it.
- [`gs.sketch`](docs/kits/sketch.md): Hand-drawn looks (sketchy shapes) and ink lines the player draws.
- [`gs.icons`](docs/kits/icons.md): 528 icons that look the same on every phone (use these, not emoji).
- [`gs.toon`](docs/kits/toon.md): Classic Console 3D: a cel-shaded view, parts, figures.
- [`gs.hd`](docs/kits/hd.md): Next Gen HD 3D: the view with shadows, bloom, reflections, lamps, lens, decals and more.
- [`gs.ar`](docs/kits/ar.md): AR 3D: the camera and gyro view, the floor, anchors and markers.
- [`gs.bricks`](docs/kits/bricks.md): Toy bricks in 3D.
- [`gs.physics3d`](docs/kits/physics3d.md): Rapier 3D physics: bodies, level collisions, walking characters, ragdolls, vehicles.
- [`gs.fx3d`](docs/kits/fx3d.md): 3D text, 3D particles (fire, smoke, sparks, booms), impacts, outlines, glitch, trails.
- [`gs.tabletop`](docs/kits/tabletop.md): Board games: a table in a 3D room or on your floor in AR, pieces, dice, turns, opponents.
- [`gs.camera`](docs/kits/camera.md): 3D camera rigs: chase, shoulder, first person, top, side, orbit, rail, fixed.
- [`gs.nav3d`](docs/kits/nav3d.md): 3D paths from your level meshes, and crowds that walk them.
- [`gs.characters`](docs/kits/characters.md): Living 3D characters: look at, reach, planted feet, wobble, faces, people who react.
- [`gs.ai`](docs/kits/ai.md): Crowds that chase, flee, flock and hunt; grid paths; state machines, behaviour trees, utility AI; swarms.
<!-- end of kit index -->

**Kits find each other.** What a game makes in `make()` and `reset()` finds the rest of what it made, with nothing passed: one `Wind` blows the grass, trees, rain, `Cloth`, smoke, particles and the `Sea`'s swell; `Weather` rains on every `Water`; a `World3D` is found by `Explosives`, `Shots` (`shots.update(dt)`), `Cloth`, `Structure`, `Reactions`, `Foley`, `Ears`, `CameraRig`, `Kart`, `Plane`, `Boat`, `Hover`, `Grapple`, `shatter`/`slice` and `Regions` (a 2D `Physics` by `Car`, `Soft`, `Liquid` and the movers; a 3D `Soft` finds the `World3D`); a `TileMap`, `NavGrid`, `Noises` and `CoverMap` are found by movers, `Senses`, hunting agents and `Squad`; a 3D blast is felt by structures, smoke, liquid, water made with `ripples`, people who react and soft ground; `Foley` finds the ears, world, marks, weather and land. What you pass wins, `false` is none (`wind: false`), `link: false` keeps a kit to itself. Links are things the world does; who is hurt and what scores stay the game's (`docs/maker-kit.md`, "Kits that find each other").

**Lazy parts** (physics, physics3d, nav3d, fx3d, vision, Tone, `sound.instrument`, `api.loadLocal`, `tabletop.Chess`, `Table.dice()`, `story.Story`, `look2d.Screen`, `look2d.Batch`, `words.Words`, `trivia.Quiz`, `ui.UI`, `juice.Timeline`, `hear.Sounds`, `doodle.Doodle`, `fonts.use`): create them in `make()` or `reset()`, never
later. The app shows "Loading…" and remakes the game once the library is in.
A big 3D game is also made a little each frame under its loading screen after Play (the kit's builders stop the pass, each pass on a fresh copy of the game's file, and heavy number work goes to background workers), so `make()` and `reset()` may run several times
before the first round: build the world there, and keep once-only things (a save, a sound) out of them.
The 3D parts (`toon`, `hd`, `ar`, `bricks`, `physics3d`, `fx3d`, `camera`, `nav3d`, `characters`, `level3d`, `sky`, `poses`, `destruction`, `props`, `outdoors`, `city`, `models`, `voxels`, `fluid`, `gas`, `tabletop`, `regions`, `dungeon`, `mounts`, `THREE`)
and `ai`, plus the action kits (`combat`, `tactics`, `climb`, `missions`, `cutscene`, `prompts`, `stealth`, `gadgets`, `campaign`, `arena`, `magic`, `companions`) and play kits (`craft`, `soft`, `cards`, `dice`, `words`, `trivia`, `ui`) and smarts (`hear`, `doodle`, `phoneai`) and looks (`sketch`, `icons`), also load on first use, so the app opens fast. The app loads the ones a game uses before it
runs, so read them as usual (`const { HDView } = gs.hd` at the top of the file is fine).

**Sensors are worked out for you.** The build reads which camera, mic and motion parts a game uses and
the card says so before Play (and iPhones ask for motion access on the Play tap). Don't add a field.

**Types:** `src/gamescroll.d.ts` describes all of `gs` and the game definition, so editors autocomplete.
Add `/** @type {import('../gamescroll.js').GameDef} */` above `export default` to check the definition.

## Common mistakes

- Wiring the kits to each other by hand (the same `wind`, `world` or `weather` passed to each): made in `make()` or `reset()`, they find each other. Pass one only to choose a different one, or `false` for none.
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
