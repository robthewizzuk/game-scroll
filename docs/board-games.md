# Board games: one board, in a 3D room or on your floor

Board games (`era: 'board'`, tag `Board · <Genre>`) are games you play on a board: chess, snakes and
ladders, mancala, dice games, tile laying, a deduction game round a table. Every one of them plays
two ways from the same code:

- **3D.** The board sits on a table in a room made in code, drawn with the Next Gen renderer
  (`gs.hd`). Drag to walk the camera round the table, pinch to zoom, tap to play.
- **AR.** Tap the **AR** chip and the same board is set down in the player's real room through the
  camera (`gs.ar`): on the floor in front of them, or where they tap on phones with native AR. Pinch
  to size it from tabletop to giant, drag to turn it. The camera is only asked for when AR is tapped,
  so the game opens in 3D with no permission prompt.

The game never needs to know which way it is being shown. It builds its board and pieces once, in
**board units**, inside `table.board`, and the tabletop kit (`gs.tabletop`, `src/kit/tabletop.js`)
does the table, the room, the camera, AR, picking, moves, dice and sounds.

```bash
npm run new my-game --style board --title "My Game"
```

## How a board game differs from the other styles

- **Longer rounds, kept between visits.** A game of chess doesn't fit the usual 20 seconds to 3
  minutes. Board games **save after every turn** with `api.save()` and pick the game back up in
  `reset()`, so a player can swipe away mid-game and come back. Check a loaded save before trusting
  it, and `api.clearSave()` when the game ends. Quick board games (a dice race) are welcome too.
- **Nothing moves before the first touch.** The player moves first, or taps to throw. Opponents wait.
- **A computer opponent, or a puzzle for one.** There's no multiplayer yet. Use `gs.solve.Search`
  for the opponent (`table.think()` runs it a few milliseconds a frame), `gs.tabletop.Chess` for
  chess, or make the game a solo puzzle.
- **`goal` is "you won".** Score something that grows through the game (stones in your store, pieces
  taken, your square on the track) so the badge moves, with `goal` at the winning number; call
  `api.win()` as well when a win isn't a number (checkmate).
- **Quiet music.** A game that lasts ten minutes wants its tune low: `music: { mood: 'calm', vol: .5 }`
  (the app's one-line soundtrack, with the volume turned down).
- **Original.** Old games in the public domain (chess, mancala, tafl, carrom, snakes and ladders,
  Ten Thousand) are fine to build as they are. A modern published game is not: take the kind of
  game it is (hidden roles, exploring a house) and invent your own rules, names and look.

## The shape of a board game

```js
import gs from '../gamescroll.js';
const { Table, slab, pawn, ring, sounds } = gs.tabletop;

let W = 300, H = 460;
function make(api) {
  let T, piece, state;
  function setup() {                                   // once: the table, the board, the pieces
    T = new Table(api, { span: 9, room: 'study' });    // span: how wide the playing area is, in board units
    T.board.add(slab({ w: 8, d: 8, paint(g, S) { /* draw the board's top on a square canvas of S pixels */ } }));
    piece = pawn('#d94a3a'); T.board.add(piece);
  }
  async function turn(to) {                            // a turn reads top to bottom
    state = 'busy';
    await T.hop(piece, to);                            // moves are promises on the table's clock
    await T.wait(.3);
    api.save({ at: to }); state = 'you';
  }
  return {
    reset() { if (!T) setup(); T.reset(); state = 'you'; /* place pieces from api.load(null) */ },
    resize(w, h) { W = w; H = h; },
    update(dt) { if (!T.update(dt)) return; /* false while AR finds the floor */ },
    draw(c) { T.draw(c, W, H); const y = T.strip(c, W, [{ name: 'You', col: '#d94a3a', score: 0 }], 0); T.status(c, W, y, 'Tap a square'); T.hud(c, W, H); },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap || tap.chip || state !== 'you' || T.busy) return;
      const p = T.pick(tap.x, tap.y);                  // where the tap meets the board, in board units
      if (p) T.run(() => turn({ x: Math.round(p.x), z: Math.round(p.z) }));
    },
  };
}
export default { id: 'my-game', title: 'My Game', tag: 'Board · Strategy', retro: true, era: 'board', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680, music: { mood: 'calm', vol: .5 }, goal: 10, hint: '...', creator: 'You', make };
```

**Board units.** The board's top is `y = 0`, the player sits at `+z` (the bottom of the screen), `x`
runs to their right. A chess square is 1 unit; a pawn is about 0.8 tall. `span` is how wide the
playing area is; the camera fits it on any screen, clear of the score badge and the chips. For a
board that isn't square, pass `frame: [w, d]` (or call `T.frame(w, d)`), and use `T.tall` to turn a
long board end-on for a phone held upright and across for an unfolded one (Mancala does).

## The table

`new Table(api, options)`:

| Option | What it does |
| --- | --- |
| `span` | Width of the playing area in board units (10). |
| `room` | `'study'`, `'parlour'`, `'tavern'`, `'attic'`, `'hall'`, `'sunroom'`, or `{ like: 'tavern', felt: '#5a2030' }` to change one (`gs.tabletop.ROOMS` lists the fields: walls, floor, rug, wood, felt, lamp, light levels, colour grade). |
| `table` | `'round'` (default), `'square'`, or `false` for none. |
| `pitch`, `yaw`, `zoom`, `look` | The camera's home: degrees down at the board (56), round it, how close, and the board point it aims at. `minPitch`, `maxPitch` limit dragging. |
| `frame` | `[w, d]`: the area the camera keeps on screen when it isn't `span` x `span`. |
| `ar`, `arSize` | `ar: false` leaves the AR chip out; `arSize` is how many metres wide the board is on the floor (0.9). |
| `real`, `base` | The board's real width in metres (0.5), for the room's proportions; how thick the board is under `y = 0` (0.3). |
| `blur` | Depth of field, for a miniature look (best phones only). |

Each frame: `T.update(dt)` first in `update` (it returns `false` while AR is finding the floor: skip
the rest), `T.draw(c, W, H)` first in `draw`, your HUD, then `T.hud(c, W, H, chips)` last. Pass every
touch through `T.down`, `T.move` and `T.up`. `T.up` returns a tap (`{ x, y }`, with `chip` when it
was one of your own chips) or `null` for a drag, a pinch or one of the kit's chips. A game that drags
something itself (Carrom's striker) calls `T.claim(id)` so the view doesn't turn with that touch.

**Turns.** `T.run(async () => { ... })` plays a turn; `T.busy` is true while it runs. Inside it,
`await` the moves: `T.hop(obj, to)`, `T.slide`, `T.drop`, `T.pop`, `T.tween(seconds, k => ...)`,
`T.wait(seconds)`, `T.until(promise)` for anything from elsewhere. They run on the table's own clock,
so they pause with the game, and `T.reset()` drops whatever is still playing. An error inside a turn
is raised from the next `T.update()`, where the app handles it as usual.

**Opponents.** `await T.think(search, state, { time, depth, skill, wait, slice })` runs a `gs.solve.Search`
a few milliseconds a frame so the 3D never stutters (`slice`: by default a share of the frame the phone
can spare, 2.5 ms on a low phone at 60 Hz up to 4 on a top one, less at 120 Hz), and takes at least `wait` seconds so a reply
doesn't land the instant the player lets go. Write the rules as pure functions (`moves`, `play`,
`turn`, `over`, `score`) and the search and the game share them.

**Picking.** `T.pick(x, y)` is where a screen point meets the board; `T.over(x, y, meshes)` is the
piece under it; `T.nearest(x, y, points, maxPx)` is a thumb-sized pick of pits, seats or pegs;
`T.toScreen(point)` puts a label over a board point.

**HUD.** `T.strip(c, W, players, turn)` draws the players under the score badge, `T.status(c, W, y,
text)` one line under that, `T.say(text)` a message at the bottom. All of it hides itself while AR's
own screens are up (`T.hidden`): hide your own HUD then too.

**Effects.** `T.crumble(piece)` breaks a piece into rubble of its own shape, `T.puff(point, { glow })`
is dust or sparks, `T.shake()` kicks the camera, `T.lookAt(point, { zoom })` and `T.lookHome()` move
it. `T.particles()` gives particles that follow the board into AR.

**Dice.** `dice = T.dice(2, { size, tray: { x, z, w, d } })` makes real dice that tumble in
`gs.physics3d` inside an unseen tray (make them in setup: the physics loads first).
`const values = await dice.roll({ keep: [1] })` throws all but the kept ones; `dice.park(i, { x, z })`
stands one aside with its number kept.

## Boards and pieces

All made in code; nothing is loaded.

- `slab({ w, d, rim, wood, paint(g, S) })`: a board with a painted top and a wooden frame. `paint`
  draws on a square canvas: `g.col` is colour, `g.h` height (dark is lower: grooves, hollows) and
  `g.r` roughness, the same as `gs.hd.surface`. The top of the canvas is the far side.
- `decal(w, d, draw)`: a flat picture on the board (cards, tiles' faces, labels).
- `pawn`, `disc`, `stone`, `chessman(kind)`, `die`: pieces; pass a colour, or a material to share one
  between many. `eyes()` gives a piece a pair of glowing eyes. `ring` and `dot` mark squares and moves.
- `wood(colour)`: polished wood for boxes and trays. `fuse(group)` joins the meshes in a group that
  share a material into one draw: use it on anything with many small parts (a ladder's rungs).
- `sounds`: `clack`, `tick`, `clink`, `rattle`, `slide`, `thud`, `flip`, `chime`, `gong`.
- `gs.tabletop.Chess`: chess rules (chess.js) and an opponent that thinks in a worker.
  `game.moves('e2')`, `game.move({ from, to })`, `game.think({ level })`, `game.fen` for `api.save`.

Keep it quick to draw: share materials, fuse small parts, and keep to a few dozen draws.

## The ten games that came with the category

| Game | What it shows |
| --- | --- |
| Living Chess | `Chess`, pieces with glowing eyes that crumble when taken, undo, levels |
| Snakes & Ladders | Real dice, three players, a choice each turn (throw two, pick one) |
| Mancala | `Search` opponent, a long board that turns to suit the screen |
| Tavern Dice | Six real dice, keeping and banking, big HUD buttons |
| King's Table | Unequal sides (tafl), `Search`, captures |
| Tower Four | Four in a row in 3D: a game you walk the camera round |
| Carrom | `gs.physics` discs, a flick the game drags itself (`T.claim`) |
| Tile Isles | `gs.hex` map on the board, tiles copied from fused prototypes |
| Liar's Lantern | Deduction for one: puzzles made and checked in code, `gs.art` faces |
| Gloomwick Hall | Exploring face-down tiles, a die for traps, a ghost that hunts |

## Checking a board game

The usual checks ([testing.md](testing.md)), plus `node scripts/sweep.cjs <id>` as for any 3D game.
Board games run on the Next Gen renderer, so the 3D rules in [nextgen-3d.md](nextgen-3d.md) apply,
and AR's in [ar-3d.md](ar-3d.md): every game must also play with no camera and no gyro, which the
kit does for you (no camera: it stays in 3D; no gyro: drag to look).
