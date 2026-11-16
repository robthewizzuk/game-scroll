# gs.gas

Smoke and fire that flow: rise, curl, spread under ceilings, go round things.

`gs.gas` (3D): `Gas(view, { box, kind: 'smoke'|'fire'|'steam'|'dust'|'toxic'|'magic', open: false (a closed room), lamp: true })` smoke and fire that flow: they rise, curl, spread under a ceiling, go round solid things and with the wind (a lit volume of hundreds of thousands of cells on WebGPU, soft puffs in a coarse grid elsewhere; make it once, `clear()` in `reset()`): `fire({ x, y, z, size, power })` (with `dir`, `speed`: a torch, a jet), `smoke({ rate, heat })`, `fan({ dir, speed })`, `burst(x, y, z, { size })` an explosion, `puff` (dust, a smoke bomb), `wind`, solid `ball`/`box`/`tube` (`set()` or `follow` to move), `solid(fn)` walls, `ground(fn)`, `update(dt)`; `smokeAt`, `heatAt`, `flowAt`, `sees(a, b)` (how much shows through the smoke), `smokeIn(box)`, `glow`. Keep the box small; gaps at least three cells wide (`gas.cell`), fires at least half a unit; try `{ gpu: false, cells: 5000 }` once, which is what slow phones run.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`GasPart`, line 1423), where every option and field is described.

- `Gas: (new (view: Loose, o?: GasLook & { box?: [number, number, number, number, number, number]; open?: boolean; kind?: GasKind; /** Left out, out in the open: the Wind…` Smoke and fire in a box of your world: make it once with the scene, and clear() it each round. (:1425)
- `KINDS: Readonly<Record<GasKind, GasLook>>` (:1432)

## From the maker kit

From [Smoke and fire that flow](../maker-kit.md#smoke-and-fire-that-flow):

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

## In real games

No game uses `gs.gas` yet: the examples above are what there is.
