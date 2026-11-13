// gamescroll.js: the one thing a game imports. Everything the app offers games is on `gs`,
// grouped by what it's for, and it sends each call to the right place underneath (our own kits,
// or the best free library for the job). Games can't reach anything else in the app.
//
//   import gs from '../gamescroll.js';
//   const { sfx, sounds } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util;
//
// What's on it (docs/maker-kit.md has the full guide):
//   gs.sound     beeps, ready-made sounds, ZzFX designs, music loops (and compose(): original tunes from a mood and a seed), Tone.js synths, the mixer (and a voice cap), the sounds a world makes by itself (Foley), speech (say)
//   gs.device    haptics (and rich haptic patterns), tilt, shake, mic (level, pitch, claps, blowing), camera, compass, steps, air pressure, room light, proximity
//   gs.util      clamp, rnd, pix, hash, fmt, disc, flickTracker
//   gs.math      seeded random, daily seed, smooth noise, vectors, overlap tests, Grid, Timers
//   gs.palettes  the Pocket colour sets (PAL, SHELL, C16)
//   gs.juice     particles, shake, tweens, timelines (anime.js; lazy), pop-ups, flashes
//   gs.effects   one-call moments: feel.coin(), feel.hit(), feel.boom() ...
//   gs.controls  sticks, buttons, gestures, two-finger pinch / twist / pan, keys
//   gs.pad       game controllers: analog sticks, triggers, rumble
//   gs.moves     motion moves: swing, punch, throw, flip, twist, knock, shake
//   gs.pixel     pixel text and sprites drawn from text
//   gs.gfx       2D drawing helpers (shaded boxes, balls, glow, backdrops); materials made in code (paper, wood, stone, metal, cloth, water), slabs, stickers
//   gs.fonts     the font library: 13 display fonts and 5 pixel fonts, each loaded when a game first names it
//   gs.sketch    hand-drawn looks: sketchy shapes (Rough.js) and ink strokes (perfect-freehand); lazy
//   gs.icons     528 game icons that look the same on every phone (game-icons.net); lazy
//   gs.real      the real world: where the sun and moon are for the player, the battery, headphones
//   gs.bricks    toy-brick drawing, 2D and 3D
//   gs.physics   2D physics (Rapier): spinning shapes, hinges, ropes, springs. Also the simple World/Body.
//   gs.physics3d 3D physics (Rapier): bodies, level collisions, ray casts, a character mover
//   gs.ai        steering, flocking, path finding, state machines (Yuka)
//   gs.toon      Classic Console 3D (cel-shaded)       gs.hd   Next Gen 3D (PBR, bloom, shadows; upscaling and frame generation built in)
//   gs.ar        AR 3D (camera + gyro)                 gs.fx3d 3D text, 3D particles, outline/glitch/trails
//   gs.vision    face and hand tracking (on the phone's AI chip in the apps, else MediaPipe), object spotting, barcodes   gs.geo  distances and bearings for location games
//   gs.things    game objects: tags, "what did this hit", nearest, reuse; Node: parent and child places
//   gs.rounds    scenes (intro, play, clear...) with timed changes, and level lists
//   gs.pacing    spawners, waves with breathers, a difficulty director
//   gs.aim       touch aim assist: sticky aim, pull onto targets, auto fire
//   gs.senses    enemy sight cones, hearing, memory and moods (calm, suspicious, alert, searching)
//   gs.camera2d  Camera2D: follow with a dead zone, look-ahead, zoom, level bounds, parallax layers
//   gs.tiles     TileMap.fromText(): levels as text, walls, one-way platforms, slopes, marks, rays, auto-tiling
//   gs.movers    Platformer (coyote time, jump buffer, wall jump) and TopDown movement through tiles
//   gs.anim      Animator: sprite animation states with frame events
//   gs.story     Story (branching dialogue in ink; lazy) and Typewriter text
//   gs.replay    Ghost (record and race a run; packs for api.save), Recorder / Replayer (whole rounds)
//   gs.look2d    Lights (with shadows off walls), Screen (CRT, bloom, glitch...; lazy), Batch (fast WebGL sprites; lazy)
//   gs.brains    Tiny Brains: small neural networks that learn as you play, with guard rails (Brain, Wave, Imagine, Predict, Player, Nemesis, Shadow, tune)
//   gs.board     grid boards: match, fall and refill, slide and merge, flood fill, hints
//   gs.battle    turn-based battles: fighters, moves, types, status effects, items (Bag), XP and loot
//   gs.stats     real-time stats: buffs that run out, perks, debuffs over time, pools that drain and refill, cooldowns with charges
//   gs.gen       levels made by code: dungeons, caves, mazes, islands, heightmaps, tile patterns, field of view
//   gs.drag      drag, drop and snap pieces into slots; reorderable lists
//   gs.history   undo and redo: each step of the round, back and forward, undos counted
//   gs.items     inventories (slots, stacks, equip slots, sort) and crafting (recipes, what's missing, timed making)
//   gs.adventure point-and-click: rooms, hotspots, take, use X on Y, exits, flags, a map of rooms seen
//   gs.hex       hex maps (honeycomb-grid): taps, neighbours, ranges, movement reach, paths, sight; Iso views
//   gs.rts       strategy controls: tap and box select, formations, flow fields, build grids, tower targets
//   gs.fight     fighting games: motion inputs with a buffer, moves in frames, hit and hurt boxes, cancels, stun
//   gs.bullets   shoot-'em-up bullets: thousands in flat arrays, rings, spreads, spirals, homing, grazing
//   gs.sand      falling sand and blastable ground: sand, water, oil, fire, smoke, acid, lava; solid() for heroes
//   gs.flow      flowing liquids for play: river current round rocks, waterfalls, whirlpools, lava and acid that hurt (2D or 3D)
//   gs.art       procedural art from a seed: creatures, faces, loot items, buildings, pixel sprites, names
//   gs.sports    team sports AI from above: formations that slide, chase, mark, find space, shoot or pass
//   gs.idle      idle maths: rising prices, affordable counts, short big numbers, Earner (and api.away())
//   gs.party     pass-and-play turns with a hand-over screen, and split-screen halves for two to four
//   gs.rhythm    a beat clock in step with the music, note charts, Perfect/Good/Miss, tap-lag calibration
//   gs.strokes   drawn lines and gesture shapes (circle, zigzag, star... or your own), lines into physics
//   gs.solve     Puzzle (one-answer puzzles: solve, carve clues, grade, fair hints) and Search (turn-based opponents: minimax, MCTS, skill)
//   gs.tabletop  Board games: a table in a room (3D) or in your real room (AR), camera, picking, moves, dice, pieces, chess rules and opponent
//   gs.voxels    editable 3D block worlds: chunks meshed in a worker, ray picks, a box mover, world makers (3D; lazy)
//   gs.fluid     real 3D liquids: a particle fluid to pour, splash and fill things with (on the graphics chip with WebGPU, smaller elsewhere)
//   gs.gas       smoke and fire that flow: a gas simulation that rises, curls, fills rooms and goes round things (a lit volume on the graphics chip with WebGPU, soft puffs elsewhere)
//   gs.tick      the fixed game tick (tick: 60 in the definition): rate, alpha for drawing between ticks, mix, turn
//   gs.paths     smooth paths through points (2D or 3D): steady-speed followers, lanes, nearest point
//   gs.bones     2D bone characters: parts that hang off each other, poses, clips, reach (IK), wobble
//   gs.vehicles  arcade Car (top-down drift) and Kart (3D, hops and drift boosts), Laps and places
//   gs.level3d   3D levels from text maps, solid in physics3d        gs.sky  time of day, rain, snow, storms
//   gs.tweak     live sliders for tuning numbers while you play (npm run dev only; the starting values elsewhere)
//   gs.prefs     the player's Reduce motion setting (read only): reduceMotion, motion
//   gs.camera    3D camera rigs: chase, shoulder, first person, top, side, orbit, rail; no wall clipping
//   gs.nav3d     3D path finding on a walkable map made from your level (Recast)
//   gs.characters  heads that look, limbs that reach (IK), feet that step, springy hit reactions; Reactions: people who stumble, brace, fall and get up
//   gs.combat    guns (spread, recoil, reloads, falloff), flying shots, throw arcs, health and armour, explosives
//   gs.tactics   cover spots, squads that suppress, flank and call out, allies that lead
//   gs.climb     ledges, hanging, shimmying, climbing up, leaps, ropes   gs.poses  a posable 3D figure and pose blending
//   gs.missions  mission scripts: objectives, waits, checkpoints        gs.cutscene  camera paths, lines, letterbox, skip
//   gs.prompts   quick-time taps, swipes, holds and mashing              gs.destruction  shatter and slice meshes; Structure: buildings that come apart
//   gs.stealth   light meter, takedowns, bodies, noisy floors, disguises
//   gs.gadgets   grappling hook, zip line, wire / lock / code puzzles   gs.campaign  chapters, stars, collectibles, unlocks
//   gs.arena     ball games with cars: arena, goals, boost, flips, ball prediction, replays
//   gs.props     thousands of props with culling and detail levels (InstancedMesh2), rooms, chunked worlds
//   gs.regions   big worlds in parts: levels made when picked, squares and land tiles round the player, freed behind
//   gs.outdoors  3D outdoor worlds: terrain (THREE.Terrain), grass, trees, rocks, wavy water you can float on
//   gs.city      made-up 3D cities from a seed: streets, buildings with lit windows, traffic at the lights, people, routes
//   gs.craft     planes, boats and hover craft that feel right, and floating bodies in physics3d
//   gs.soft      cloth, ropes, jelly and squishy blobs you can grab, cut and tear; a simple liquid
//   gs.cards     decks, deals, hands, blackjack totals, rummy sets and runs, poker hands (pokersolver)
//   gs.dice      dice notation ('4d6kh3'), odds, tumbling 2D dice, real 3D dice read by the top face
//   gs.words     an English dictionary (SCOWL): check, pick, find words in letters or grids, compare guesses
//   gs.trivia    about 2,700 quiz questions (Open Trivia Database): seeded quizzes, no repeats, streaks, climbing difficulty, 50:50
//   gs.ui        layout with no look (Yoga flexbox): boxes, taps, holds, drags, scrolling lists, focus for pads
//   gs.hear      hearing everyday sounds (YAMNet: dog, whistle, clapping...) and spoken words, on the phone itself
//   gs.doodle    knows what the player drew (46 things: sword, umbrella, bridge...), a tiny model on the phone
//   gs.phoneai   the phone's own built-in AI for flavour lines, with a written fallback and guard rails
//   gs.THREE     three.js itself
//
// The 3D styles, AI, the action kits, the play kits (craft ... ui) and the smarts (hear, doodle, phoneai) load when a game that uses them is on its way (the app does this; games don't
// need to), so the app opens fast. Big libraries (physics, 3D path finding, 3D effects, face
// tracking, Tone.js) load the first time a game uses them:
// make those things in make() or reset() and the app shows "Loading…" until they're in.

import * as sfx from './sfx.js';
import * as util from './util.js';
import * as palettes from './palettes.js';
import * as device from './kit/device.js';
import * as gfx from './kit/gfx.js';
import * as materials2d from './kit/materials2d.js';
import * as juice from './kit/juice.js';
import * as sound from './kit/sound.js';
import * as controls from './kit/controls.js';
import * as physics2d from './kit/physics2d.js';
import * as physics from './kit/physics.js';
import * as geo from './kit/geo.js';
import * as math from './kit/math.js';
import * as pixel from './kit/pixel.js';
import * as effects from './kit/effects.js';
import * as moves from './kit/motion.js';
import * as pad from './kit/gamepad.js';
import * as vision from './kit/vision.js';
import * as things from './kit/things.js';
import * as rounds from './kit/rounds.js';
import * as pacing from './kit/pacing.js';
import * as aim from './kit/aim.js';
import * as senses from './kit/senses.js';
import * as prefsKit from './kit/prefs.js';
import * as camera2d from './kit/camera2d.js';
import * as tiles from './kit/tiles.js';
import * as movers from './kit/movers.js';
import * as anim from './kit/anim.js';
import * as story from './kit/story.js';
import * as replay from './kit/replay.js';
import * as look2d from './kit/look2d.js';
import { tweak } from './kit/tweak.js';
import * as brains from './kit/brains.js';
import * as board from './kit/board.js';
import * as battle from './kit/battle.js';
import * as stats from './kit/stats.js';
import * as gen from './kit/gen.js';
import * as drag from './kit/drag.js';
import * as idle from './kit/idle.js';
import * as history from './kit/history.js';
import * as items from './kit/items.js';
import * as adventure from './kit/adventure.js';
import * as hex from './kit/hex.js';
import * as rts from './kit/rts.js';
import * as fight from './kit/fight.js';
import * as bullets from './kit/bullets.js';
import * as sand from './kit/sand.js';
import * as flow from './kit/flow.js';
import * as art from './kit/art.js';
import * as sports from './kit/sports.js';
import * as party from './kit/party.js';
import * as rhythm from './kit/rhythm.js';
import * as strokes from './kit/strokes.js';
import * as vehicles from './kit/vehicles.js';
import * as paths from './kit/paths.js';
import * as bones from './kit/bones.js';
import { tick } from './kit/tick.js';
import * as composer from './kit/compose.js';
import * as foley from './kit/foley.js';
import * as solve from './kit/solve.js';
import * as phoneSensors from './kit/sensors.js';
import * as real from './kit/real.js';
import * as fontlib from './kit/fontlib.js';
import { StillLoading } from './kit/lazy.js';

// App-only exports games never get: raw storage, the player's settings, the unrounded location,
// the install's anonymous id, and the hooks the app uses to stop things between rounds.
export const HIDDEN = {
  sound: ['sound', 'setSound', 'audio', 'setSfxOut', 'stopMusic', 'pauseMusic', 'resumeMusic', 'warm', 'voiceCap', 'kitBus'],
  util: ['store', 'deviceId'],
  device: ['location', 'hapticSettings', 'setHaptics', 'stopSensors'],
  real: ['guessPlace', 'readOutputs'],
  fonts: ['whenFontArrives', 'pixelFont', 'want'],
  moves: ['stopMoves'],
  pad: ['pollPads'],
  vision: ['stopVision'],
  gen: ['loadGen'],
  words: ['loadWords'],
  trivia: ['loadTrivia'],
  ui: ['loadUI'],
  hear: ['loadHear', 'stopHearing'],
  doodle: ['loadDoodle'],
  phoneai: ['phoneAIStatus'],
  brains: ['liveBrains', 'brainStats'],   // the debug overlay's list of live brains
  hd: ['FINAL_EFFECTS', 'gpuFits', 'pickEffect'],   // (pickEffect: the effects ladder's choice, for the kit tests)
  toon: ['TOON', 'celReady'],   // test switches, and whether three's toon shader still has the lines the cel look changes
  props: ['simplifyReady'],
  fluid: ['FLUID', 'RHO', 'K', 'G0', 'VMAX', 'LO', 'WALL', 'SOLIDS', 'SINKS', 'PUSHES', 'IN', 'RAD', 'SKIN', 'REACH', 'viscosity', 'bulk', 'thin', 'foamOf'],   // the fluid's numbers (shared with its WebGPU twin) and test switches
  gas: ['GAS', 'SOURCES', 'SOLIDS', 'SOLID', 'WARM', 'IGNITE', 'HEAT', 'BURNS_AT', 'FLAME', 'QUENCH', 'SMOKE_MAX', 'HEAT_MAX', 'FUEL_MAX', 'VMAX', 'SHARP', 'NEAR', 'flameAt', 'emptyField', 'sample'],   // the gas's numbers (shared with its WebGPU twin) and test switches
  tabletop: ['loadChess'],
  models: ['ready'],   // (the app waits for the saved bakes while the 3D parts load)   // the Next Gen screen shader in pieces, for the WebGPU port (docs/webgpu-move.md)
};

// App state some kits keep on an exported object: games get a look, not a lever (one game pinning
// the 3D quality would pin it for every game after it).
const VIEWS = { hd: { HD: readOnly } };

function pick(name, ...mods) {
  const hide = HIDDEN[name] || [], view = VIEWS[name] || {}, out = {};
  for (const m of mods) for (const k of Object.keys(m)) if (!hide.includes(k) && !(k in out)) out[k] = view[k] ? view[k](m[k]) : lock(m[k]);
  return Object.freeze(out);
}

// Every game shares these objects, so they're frozen: a game that writes to gs.palettes.PAL or
// gs.sound.sounds would otherwise change it for the app and for every game after it. Plain data
// only (objects and arrays, all the way down); classes, functions and libraries stay as they are.
const plain = x => {
  if (!x || typeof x !== 'object' || x[Symbol.toStringTag] === 'Module') return false;
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === Array.prototype || p === null;
};
function lock(x) {
  if (!plain(x) || Object.isFrozen(x)) return x;
  Object.freeze(x);
  for (const k of Object.keys(x)) { const d = Object.getOwnPropertyDescriptor(x, k); if ('value' in d) lock(d.value); }
  return x;
}
function readOnly(o) {
  const out = {};
  for (const k of Object.keys(o)) Object.defineProperty(out, k, { enumerable: true, get() { const v = o[k]; return v && typeof v === 'object' ? Object.freeze({ ...v }) : v; } });
  return Object.freeze(out);
}

// Parts that load on first use, so the app opens without them (three.js alone is most of the app's
// code). The app loads the parts a streamed game needs before running it, so games don't notice;
// if a part isn't in yet, reading it throws StillLoading and the app shows "Loading…".
const GROUPS = {
  '3d': { parts: ['toon', 'hd', 'ar', 'bricks', 'physics3d', 'fx3d', 'camera', 'nav3d', 'characters', 'level3d', 'sky', 'poses', 'destruction', 'props', 'outdoors', 'city', 'models', 'voxels', 'fluid', 'gas', 'tabletop', 'regions', 'THREE'],
    // (with WebGPU picked in Settings, its renderer gets ready alongside: src/kit/gpu.js)
    load: () => Promise.all([import('./gs-3d.js').then(m => Promise.all([m.props.simplifyReady, m.models.ready()]).then(() => m)), import('./kit/gpu.js').then(g => g.prepareGPU())]).then(([m]) => ({ toon: pick('toon', m.toon), hd: pick('hd', m.hd), ar: pick('ar', m.ar), bricks: pick('bricks', m.bricks),
      physics3d: pick('physics3d', m.physics3d), fx3d: pick('fx3d', m.fx3d), camera: pick('camera', m.camera), nav3d: pick('nav3d', m.nav3d),
      characters: pick('characters', m.characters, m.reactions), level3d: pick('level3d', m.level3d), sky: pick('sky', m.sky),
      poses: pick('poses', m.poses), destruction: pick('destruction', m.destruction, m.structure), props: pick('props', m.props), outdoors: pick('outdoors', m.outdoors), city: pick('city', m.city), models: pick('models', m.models), voxels: pick('voxels', m.voxels), fluid: pick('fluid', m.fluid), gas: pick('gas', m.gas), tabletop: pick('tabletop', m.tabletop), regions: pick('regions', m.regions), THREE: m.THREE })) },
  ai: { parts: ['ai'], load: () => import('./kit/ai.js').then(m => ({ ai: pick('ai', m) })) },
  action: { parts: ['combat', 'tactics', 'climb', 'missions', 'cutscene', 'prompts', 'stealth', 'gadgets', 'campaign', 'arena'],
    load: () => import('./gs-action.js').then(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, pick(k, v)]))) },
  play: { parts: ['craft', 'soft', 'cards', 'dice', 'words', 'trivia', 'ui'],
    load: () => import('./gs-play.js').then(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, pick(k, v)]))) },
  sketch: { parts: ['sketch'], load: () => import('./kit/sketch.js').then(m => ({ sketch: pick('sketch', m) })) },
  icons: { parts: ['icons'], load: () => import('./kit/icons.js').then(m => ({ icons: pick('icons', m) })) },
  smart: { parts: ['hear', 'doodle', 'phoneai'],
    load: () => import('./gs-smart.js').then(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, pick(k, v)]))) },
};
const groupOf = {}; for (const [g, d] of Object.entries(GROUPS)) for (const p of d.parts) groupOf[p] = g;
const loaded = {}, loading = {};
function loadGroup(g) {
  return loading[g] ||= GROUPS[g].load().then(parts => { Object.assign(loaded, parts); return parts; }, e => { delete loading[g]; throw e; });
}
/** The parts that load later. */
export const LAZY_PARTS = Object.freeze(Object.keys(groupOf));
/** Loads the parts these names need ('toon', 'hd.HDView', ...), or every part if none are given. */
export function loadParts(names) {
  const tops = names ? [...new Set(names.map(n => n.split('.')[0]))] : LAZY_PARTS;
  const groups = Promise.all([...new Set(tops.filter(t => groupOf[t]).map(t => groupOf[t]))].map(loadGroup));
  // a Console game draws on its own WebGPU renderer where the device has one (src/kit/gpu.js): ready before the game runs
  return (tops.includes('toon') ? groups.then(() => import('./kit/gpu.js')).then(g => g.prepareConsoleGPU()) : groups).then(() => {});
}
/** Are these parts loaded? */
export const partsReady = names => (names || LAZY_PARTS).every(n => !groupOf[n.split('.')[0]] || n.split('.')[0] in loaded);
/**
 * Could this app give a game these names? Parts that haven't loaded yet count by name only (the
 * app checks them in full once they're in, before running the game).
 */
export function offers(names) {
  return names.every(n => {
    const ks = n.split('.'); if (groupOf[ks[0]] && !(ks[0] in loaded)) return true;
    let o = gs; for (const k of ks) { if (o == null || !(k in Object(o))) return false; o = o[k]; } return true;
  });
}

const core = {
  sound: pick('sound', sound, sfx, composer, foley),
  device: pick('device', device, phoneSensors),
  util: pick('util', util),
  math: pick('math', math),
  palettes: pick('palettes', palettes),
  juice: pick('juice', juice),
  effects: pick('effects', effects),
  controls: pick('controls', controls),
  pad: pick('pad', pad),
  moves: pick('moves', moves),
  pixel: pick('pixel', pixel),
  gfx: pick('gfx', gfx, materials2d),
  physics: pick('physics', physics, physics2d),
  vision: pick('vision', vision),
  geo: pick('geo', geo),
  real: pick('real', real),
  fonts: pick('fonts', fontlib),
  things: pick('things', things),
  rounds: pick('rounds', rounds),
  pacing: pick('pacing', pacing),
  aim: pick('aim', aim),
  senses: pick('senses', senses),
  prefs: prefsKit.prefs,
  tick,
  camera2d: pick('camera2d', camera2d),
  tiles: pick('tiles', tiles),
  movers: pick('movers', movers),
  anim: pick('anim', anim),
  story: pick('story', story),
  replay: pick('replay', replay),
  look2d: pick('look2d', look2d),
  tweak,
  brains: pick('brains', brains),
  board: pick('board', board),
  battle: pick('battle', battle),
  stats: pick('stats', stats),
  gen: pick('gen', gen),
  drag: pick('drag', drag),
  idle: pick('idle', idle),
  history: pick('history', history),
  items: pick('items', items),
  adventure: pick('adventure', adventure),
  hex: pick('hex', hex),
  rts: pick('rts', rts),
  fight: pick('fight', fight),
  bullets: pick('bullets', bullets),
  sand: pick('sand', sand),
  flow: pick('flow', flow),
  art: pick('art', art),
  sports: pick('sports', sports),
  party: pick('party', party),
  rhythm: pick('rhythm', rhythm),
  strokes: pick('strokes', strokes),
  vehicles: pick('vehicles', vehicles),
  paths: pick('paths', paths),
  bones: pick('bones', bones),
  solve: pick('solve', solve),
};
const gs = {};
for (const [k, v] of Object.entries(core)) Object.defineProperty(gs, k, { value: v, enumerable: true });
for (const k of LAZY_PARTS) Object.defineProperty(gs, k, {
  enumerable: true,
  get() { if (k in loaded) return loaded[k]; throw new StillLoading('gs.' + k, loadParts([k])); },
});
Object.freeze(gs);
export default gs;
