# gs.tabletop

Board games: a table in a 3D room or on your floor in AR, pieces, dice, turns, opponents.

`gs.tabletop` (Board games; guide `docs/board-games.md`): `Table(api, { span, room, table, pitch, frame })` is the table in a 3D room and, on the AR chip, on the player's floor: `board` (add pieces here, in board units), `update`/`draw`/`hud`, `down`/`move`/`up` (a tap, or `{ chip }`), `claim(id)`, `pick`, `over`, `nearest`, `toScreen`; turns as promises (`run`, `hop`, `slide`, `drop`, `pop`, `tween`, `wait`, `until`, `busy`), `think(search, state)` (a `gs.solve.Search` opponent, a little each frame), `dice(n, { tray })` (real dice: `roll({ keep })`, `park`), `crumble`, `puff`, `shake`, `lookAt`, `strip`, `status`, `say`, `frame`, `tall`, `hidden`. Pieces made in code: `slab({ w, d, paint })`, `decal`, `pawn`, `disc`, `stone`, `die`, `chessman`, `eyes`, `ring`, `dot`, `wood`, `fuse(group)`; `sounds`; `ROOMS`; `Chess` (rules + worker opponent: `moves`, `move`, `think({ level })`, `fen`).

`T.think(search, state, o)` thinks a slice of each frame, by default a share of the frame the phone can
spare (2.5 ms on a low phone at 60 Hz, 3.3 mid, 4 top; half that at 120 Hz): `o.slice` sets your own in
milliseconds. `T.puff()` and `T.particles()` make their particles with the table (or when you call
`particles()`), so their shader is built under the loading screen, not at the first burst.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`TabletopPart`, line 1160), where every option and field is described.

- `Table: new (api: GameApi, o?: TableOptions) => TableT` One board, played in a 3D room or in AR: the table, camera, picking, moves, dice. (:1162)
  - `board: Loose` Add the board and pieces here, in board units: the board's top is y = 0, the player sits at +z. (:1071)
  - `anchor: Loose` (:1072)
  - `room: Loose` (:1072)
  - `lamp: Loose` (:1072)
  - `span: number` (:1073)
  - `real: number` (:1073)
  - `base: number` (:1073)
  - `t: number` Seconds of game time on the table's clock. (:1075)
  - `mode: '3d' | 'ar'` (:1076)
  - `W: number` (:1076)
  - `H: number` (:1076)
  - `readonly v: Loose` The view on screen now: a gs.hd HDView (3D) or a gs.ar ARView (AR). (:1078)
  - `v3: Loose` The 3D room's view (always there) and AR's (null until AR is first tapped). (:1080)
  - `va: Loose | null` (:1080)
  - `readonly hidden: boolean` True while AR's own screens are up: hide your HUD. (:1082)
  - `readonly busy: boolean` True while a run() turn is still playing out. (:1084)
  - `readonly tall: boolean` True on a tall screen (a phone held upright), false on a wide one (an unfolded phone). (:1086)
  - `onTier(fn: (tier: Loose) => void): TableT` (:1087)
  - `reset(): TableT` From the game's reset(): drops moves still playing and puts the camera home. (:1089)
  - `stop(): TableT` Stops the camera (before api.over() in AR). (:1091)
  - `update(dt: number): boolean` First in update(dt). False while the game should wait (AR is finding the floor). (:1093)
  - `tween(dur: number, fn: ((k: number, raw: number) => void) | null, o?: { ease?: TableEase; delay?: number }): Promise<void>` (:1094)
  - `wait(s: number): Promise<void>` (:1095)
  - `until<V>(p: Promise<V> | V): Promise<V>` A promise from elsewhere, dropped if the round is reset meanwhile. (:1097)
  - `run(fn: () => unknown): void` Plays a turn written as an async function; busy is true while it runs. (:1099)
  - `think<S = Loose, M = Loose>(search: Loose, state: S, o?: { time?: number; depth?: number; skill?: Skill; mode?: 'minimax' | 'mcts'; rng?: number | string | (() => numb…` A gs.solve.Search opponent's move, thought about a little each frame. (:1101)
  - `hop(obj: Loose, to: BoardPoint, o?: { h?: number; time?: number; sound?: boolean; spin?: number; ease?: TableEase }): Promise<void>` (:1102)
  - `slide(obj: Loose, to: BoardPoint, o?: { time?: number; ease?: TableEase; sound?: boolean }): Promise<void>` (:1103)
  - `drop(obj: Loose, o?: { from?: number; time?: number; sound?: boolean }): Promise<void>` (:1104)
  - `pop(obj: Loose, o?: { by?: number; time?: number }): Promise<void>` (:1105)
  - `shake(amount?: number): TableT` (:1106)
  - `crumble(mesh: Loose, o?: { pieces?: number; push?: number; from?: { x: number; z: number } | null; life?: number }): Promise<void>` Breaks a piece into rubble that tumbles and fades. (:1108)
  - `puff(p: BoardPoint, o?: { col?: string; n?: number; speed?: number; size?: number; life?: number; up?: number; grav?: number; glow?: boolean }): TableT` A burst of dust (or, with glow, sparks) at a board point. (:1110)
  - `lookAt(p: BoardPoint, o?: { zoom?: number | null; yaw?: number | null; pitch?: number | null }): TableT` (:1111)
  - `lookHome(h?: { yaw?: number; pitch?: number; zoom?: number; look?: [number, number, number] } | null): TableT` (:1112)
  - `frame(w: number, d: number): TableT` The area the camera keeps on screen, in board units. (:1114)
  - `setMode(mode: '3d' | 'ar'): TableT` (:1115)
  - `onMode(fn: (mode: '3d' | 'ar') => void): TableT` (:1116)
  - `draw(c: CanvasRenderingContext2D, W: number, H: number): void` (:1117)
  - `hud(c: CanvasRenderingContext2D, W: number, H: number, extra?: TableChip[]): void` The kit's chips (AR / 3D, View, Move) and messages, last in draw(); extra: your own chips. (:1119)
  - `say(text: string, secs?: number): TableT` (:1120)
  - `strip(c: CanvasRenderingContext2D, W: number, list: { name: string; col?: string; score?: number | string | null; note?: string }[], turn?: number, o?: { y?: number | …` The players along the top; returns the y just below. (:1122)
  - `status(c: CanvasRenderingContext2D, W: number, y: number, text: string, col?: string): number` (:1123)
  - `down(x: number, y: number, id?: number): boolean` Pass the game's touches through these. (:1125)
  - `claim(id?: number): TableT` The game is dragging something itself with this touch: the kit won't turn the view with it. (:1127)
  - …9 more in `TableT` (:1069)
- `thinkSlice(cls?: 'top' | 'mid' | 'low', hz?: number): number` The milliseconds a frame Table.think() thinks for when no slice is given: a share of the frame by phone class (top .24, mid .2, low .15), 0.8 to 4. (:1164)
- `ROOMS: Record<RoomName, RoomLook>` (:1165)
- `sounds: Record<'clack' | 'tick' | 'clink' | 'rattle' | 'slide' | 'thud' | 'flip' | 'chime' | 'gong', (v?: number) => void>` Table sounds, each with a volume 0..1. (:1167)
- `slab(o?: { w?: number; d?: number; thick?: number; rim?: number; wood?: string; px?: number; paint?: ((g: Loose, size: number) => void) | null; rough?: number; strengt…` A board: a slab with a top painted in code and a wooden rim, its top at y = 0. (:1169)
- `decal(w: number, d: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, o?: { px?: number; lift?: number; rough?: number; glow?: number }): Loose` A flat picture lying on the board; mesh.userData.redraw(fn) paints it again. (:1171)
- `wood(colour?: string, o?: { repeat?: [number, number]; clear?: number }): Loose` Polished wood with a straight grain, made in code (a material). (:1173)
- `die(size?: number, o?: { body?: string; pips?: string; rough?: number }): Loose` (:1174)
- `pawn(col?: PieceLook, o?: { r?: number; h?: number; [pbr: string]: Loose }): Loose` (:1175)
- `disc(col?: PieceLook, o?: { r?: number; h?: number; [pbr: string]: Loose }): Loose` (:1176)
- `stone(col?: PieceLook, o?: { r?: number; [pbr: string]: Loose }): Loose` (:1177)
- `ring(col?: string, o?: { r?: number; w?: number; glow?: number }): Loose` (:1178)
- `dot(col?: string, o?: { r?: number; glow?: number }): Loose` (:1179)
- `eyes(col?: PieceLook, o?: { y?: number; z?: number; gap?: number; r?: number; glow?: number }): Loose` A pair of glowing eyes to add to a piece. (:1181)
- `chessman(kind: 'p' | 'r' | 'n' | 'b' | 'q' | 'k', col?: PieceLook, o?: Record<string, Loose>): Loose` (:1182)
- `fuse(group: Loose): Loose` Joins the meshes in a group that share a material into one mesh each. (:1184)
- `COLOURS: { readonly players: readonly string[]; readonly light: string; readonly dark: string }` (:1185)
- `shade(col: string, k: number): string` (:1186)
- `EASE: Record<'linear' | 'in' | 'out' | 'inOut' | 'back' | 'bounce', (k: number) => number>` (:1187)
- `Chess: (new (fen?: string | null) => ChessT) & { LEVELS: readonly { name: string; depth: number; time: number }[] }` Chess rules (chess.js) and a computer opponent; make it in make() or reset(). (:1189)
- `loadChess(): Promise<Loose>` (:1190)

## From the maker kit

From [Board games](../maker-kit.md#board-games):

`gs.tabletop` is the kit for Board games (`era: 'board'`): a board on a table in a 3D room that the
AR chip also sets down on the player's floor, with the camera, picking, turns written as `async`
functions, real dice, pieces made in code and chess. The guide, with the options and a starter, is
[board-games.md](board-games.md); `npm run new my-game --style board` makes a working one.

## In real games

11 games use it (`node scripts/examples.mjs gs.tabletop` lists them). The shortest:

`src/games/tower-four.js` (Tower Four, Board · Strategy, 153 lines):

```js
const { Dial } = gs.brains;
const { Table, slab, ring, fuse, sounds } = gs.tabletop;
// …
  function setup() {
    T = new Table(api, { span: 7.6, room: 'study', pitch: 38, yaw: 24, look: [0, 1.25, 0], minPitch: 8, frame: [6.6, 6.2] });
    T.board.add(slab({ w: 5.6, d: 5.6, rim: .2, thick: .42, wood: '#5e3a20', paint(g, S) {      // a walnut block with a ring let in round each peg
// …
    }
    T.board.add(fuse(pegs));
// …
    lit = WHO.map(w => pbr(w.col, { rough: .1, clear: 1, glow: 1.5 }));
    marks = Array.from({ length: 16 }, (_, p) => { const r = ring('#ffe08a', { r: .5, w: .022, glow: .5 }), q = peg(p); r.position.set(q.x, .02, q.z);
// …
    m.position.y = from;
    await T.tween(.2 + (from - y) * .05, k => { m.position.y = from + (y - from) * k; }, { ease: 'in' });
    m.position.y = y; sounds.clink(1.2); sounds.clack(.5); haptic(who ? 'light' : 'medium');
// …
    state = 'done';
    if (line) { for (const cell of line) beads.get(cell).material = lit[s.win]; const mid = seat(line[1]), end = seat(line[2]); T.puff({ x: (mid.x + e
```

`src/games/tavern-dice.js` (Tavern Dice, Board · Dice, 160 lines):

```js
const { haptic, onShake } = gs.device;
const { Table, slab, ring, dot, sounds } = gs.tabletop;
// …
  function setup() {
    T = new Table(api, { span: 8.6, room: 'tavern', pitch: 62, frame: [7.4, 8.2] });
    dice = T.dice(6, { size: .7, tray: { x: 0, z: -.8, w: 6.2, d: 5.5 }, body: '#e9dfc6', pips: '#3a1c12' });
    T.board.add(slab({ w: 6.6, d: 7.6, rim: .32, wood: '#6a3f22', paint(g, S) {      // a worn leather mat, with a strip for the dice you keep
// …
    } }));
    rings = SIX.map(() => { const r = ring('#ffe08a', { r: .56, w: .05, glow: 1.5 }); r.visible = false; T.board.add(r); return r; });
    dots = SIX.map(() => { const d = dot('#ffcf70', { r: .1, glow: 1 }); d.visible = false; T.board.add(d); return d; });
// …
      if (!can.length) {                                          // nothing scores: the turn's points are gone
        note = 'Bust!'; pot = 0; sounds.thud(1.2); haptic('error'); T.shake(.4); await T.wait(1.3); break;
// …
        state = 'pick'; sel = new Set(); show();
        ({ take, stop } = await T.until(new Promise(res => { decide = res; })));
```
