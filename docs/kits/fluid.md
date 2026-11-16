# gs.fluid

Real 3D liquid to pour and splash, and sand, snow and mud that behave like the real thing.

`gs.fluid` (3D): `Fluid(view, { box, volume, kind: 'water'|'lava'|'slime'|'honey'|'sand'|'snow'|'mud' })` real liquid to pour, splash and fill things with, and ground that behaves like the real thing (sand piles and slumps, snow packs and keeps footprints, mud oozes and settles; or your own `grain`, `holds`, `packs`) (tens of thousands of drops on WebGPU, a smaller version elsewhere; make it once, `clear()` in `reset()`): `pour({ x, y, z, rate, speed })` taps, `fill({ y1 })`, `splash`, solid `ball`/`box`/`tube` (`hollow` cups and tanks, `set()` or `follow` to move), `ground(fn)`, `drain`, `push` (blast), `update(dt)`; `amount(box)`, `level(x, z)`, `wet(x, y, z)`, `full`. Cups and gaps at least six drops wide (`fluid.dropSize`); try `{ gpu: false, drops: 600 }` once, which is what slow phones run.

Without WebGPU the liquid runs on the CPU with 300 (low), 800 (mid) or 1,400 (top) drops: that keeps a
game's `update()` inside its budget on a phone of that class (`Fluid.max()` is this phone's number). Its
foam colours and shader are made with it, so the first splash builds nothing.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`FluidPart`, line 1302), where every option and field is described.

- `Fluid: (new (view: Loose, o?: { box?: [number, number, number, number, number, number]; volume?: number; open?: boolean; kind?: FluidKind; colour?: string; foam?: stri…` A liquid in a box of your world: make it once with the scene, and clear() it each round. (:1304)
- `KINDS: Readonly<Record<FluidKind, { colour: string; foam: string; thick: number; rough: number; glow: number }>>` (:1311)

## From the maker kit

From [Real 3D liquids](../maker-kit.md#real-3d-liquids):

`gs.fluid.Fluid` (3D): a particle fluid in a box of your world. Drops fall, pile up, slosh, run round
solid things and settle level. On phones with WebGPU the whole fluid runs on the graphics chip (tens
of thousands of drops, drawn as one smooth body); everywhere else the same maths runs with fewer,
bigger drops (300 to 1,400, drawn as beads). The game code is the same for both.

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
- Ground that isn't a liquid: `kind: 'sand'` piles up at a slope and stands still, is shoved aside by a
  foot and slumps back into the print; `'snow'` packs down where it is pressed (no rim, and the packed
  snow holds harder), so footprints and wheel ruts stay, and lumps break off and tumble; `'mud'` oozes
  into a rim round what presses it and settles where it stops. Each drop keeps how far its bit of ground
  has been sheared and pushes back like a spring, up to a limit (friction times how hard it is squeezed,
  plus what holds it together: Drucker-Prager plasticity on MLS-MPM, without the usual deformation
  gradients); past it the ground gives and flows. Your own: `grain` (friction: 1.4 piles at about 25
  degrees), `holds` (about how many drops' widths of wall stand up by themselves: snow 5, mud 1.5),
  `packs` (how much denser it may be pressed: snow 1.8). The floor and solid things grip it. Press a
  `fluid.box()` that `follow`s a foot or a wheel into a layer made with `fill()`; `level(x, z)` reads
  the print back.
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

From [Water you can disturb](../maker-kit.md#water-you-can-disturb):

- Not there: waves that break (that is `Sea`, below), water that flows or changes level (`gs.flow`,
  `gs.fluid`), and a split picture while the camera is half under.

## In real games

1 game uses it (`node scripts/examples.mjs gs.fluid` lists them). The shortest:

`src/games/lava-gate.js` (Lava Gate, Next Gen · Strategy, 797 lines):

```js
const { Keys } = gs.controls;
const { Fluid } = gs.fluid;
// …
  // Fluid simulation + solids + drains (all created ONCE).
  fluid = new Fluid(v, { box: BOX, volume: 3.6, kind: 'lava', shadows: false, drops: Fluid.max() > 3000 ? undefined : 175 });
  fluid.ground(groundHeight);
  tap = fluid.pour({ x: 0, y: 2.35, z: -2.55, dir: [0, -0.72, 0.69], rate: 0.95, speed: 3.1, spread: 0.08, r: 0.24, on: false });
// …

  fluid.box({ x: -1.04, y: 0.96, z: 1.02, w: 0.34, h: 1.25, d: 1.78 });
  fluid.box({ x: 1.04, y: 0.96, z: 1.02, w: 0.34, h: 1.25, d: 1.78 });
  gateSolidL = fluid.box({ x: GATE_CLOSED.lx, y: GATE_CLOSED.y, z: GATE_CLOSED.z, w: 1.90, h: 0.90, d: 0.26 });
  gateSolidR = fluid.box({ x: GATE_CLOSED.rx, y: GATE_CLOSED.y, z: GATE_CLOSED.z, w: 1.90, h: 0.90, d: 0.26 });
```
