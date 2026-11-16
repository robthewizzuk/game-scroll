# gs.physics

Rapier 2D physics: shapes that tumble, joints, ropes, ragdolls, grabbing, walking a hero through the world.

`gs.physics.Physics` (Rapier 2D; lazy): `circle`, `box`, `poly`, `line`, `walls`, `hinge`, `spring`, `rope`, `ragdoll(x, y, { size })`, `weld`, `slider`, `wheel`, `grab`, `ray`, `at`, `blast`, `onHit`, `step(dt)`, `path(c, t)`, `move(box, dx, dy)` (a hero walked through the world: steps, slopes, shoves crates), `tiles(map)` (a TileMap level made solid).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PhysicsPart`, line 829), where every option and field is described.

- `Physics: new (o?: { gravity?: number | { x: number; y: number }; scale?: number; walls?: number[] | null; link?: boolean }) => PhysicsWorld` gravity: downward pull in game units a second² (or { x, y }); scale: game units per metre (30); walls: [x, y, w, h] puts solid walls round it. (:831)
  - `readonly things: PhysicsThing[]` Everything in it, walls too. (:781)
  - `readonly joints: PhysicsJoint[]` (:781)
  - `readonly scale: number` Game units per metre (default 30). (:782)
  - `gravity: { x: number; y: number }` (:782)
  - `readonly time: number` (:782)
  - `circle(x: number, y: number, r: number, o?: PhysicsShapeOptions): PhysicsThing` (:783)
  - `box(x: number, y: number, w: number, h: number, o?: PhysicsShapeOptions): PhysicsThing` x, y is its centre. (:784)
  - `poly(x: number, y: number, points: number[][], o?: PhysicsShapeOptions): PhysicsThing` A convex shape from points [[x, y], ...] relative to (x, y). (:785)
  - `line(points: number[][], o?: PhysicsShapeOptions & { loop?: boolean }): PhysicsThing` A fixed line or ground through points [[x, y], ...] (game positions): hills, slopes, ramps. (:786)
  - `walls(x: number, y: number, w: number, h: number, o?: PhysicsShapeOptions): PhysicsThing` Solid walls round a rectangle (tag 'wall'). (:787)
  - `remove(thing: PhysicsThing): void` (:788)
  - `clear(): void` (:788)
  - `free(): void` Free the engine's memory (the app does it when the card leaves the feed). (:789)
  - `move(box: { x: number; y: number; w?: number; h?: number; r?: number; [k: string]: Loose }, dx: number, dy: number, o?: { step?: number | null; slope?: number; snap?: …` Moves a box your code steers (a gs.movers Platformer or TopDown, a Car, any { x, y, w, h } or { x, y, r }) as far as the world lets it: stops at walls and slides along them, walks up steps and slopes, keeps to the… (:792)
  - `unmove(box: Loose): this` Takes a box moved with move() out of the world. (:793)
  - `tiles(map: TileMap, o?: { friction?: number; bounce?: number; tag?: string }): PhysicsThing` Makes a gs.tiles TileMap solid (walls, slopes, one-way ledges); call rebuild() on what it returns after changing tiles. (:795)
  - `near(x0: number, y0: number, x1: number, y1: number, pad?: number): Loose[]` The shapes near a box, for things that aren't bodies (points, particles) to stay out of with outOf(). (:796)
  - `outOf(x: number, y: number, r: number, shapes: Loose[]): { x: number; y: number; nx: number; ny: number; depth: number; thing: PhysicsThing } | null` Keeps a point of radius r out of the shapes from near(): null if clear. (:797)
  - `hinge(a: PhysicsThing | null, b: PhysicsThing | null, x: number, y: number, o?: { min?: number; max?: number; motor?: number; strength?: number }): PhysicsJoint` A hinge (pin) at (x, y): doors, flippers, wheels, pendulums. (:798)
  - `spring(a: PhysicsThing | null, b: PhysicsThing | null, ax: number, ay: number, bx: number, by: number, o?: { stiffness?: number; damping?: number; length?: number }): …` stiffness: bounces a second (2-6), damping 0..1, length: rest length (default as placed). (:799)
  - `leash(a: PhysicsThing | null, b: PhysicsThing | null, ax: number, ay: number, bx: number, by: number, length?: number): PhysicsJoint` The two points can't get further apart than length. (:800)
  - `weld(a: PhysicsThing | null, b: PhysicsThing | null, x: number, y: number): PhysicsJoint` Glues b to a at (x, y). (:801)
  - `slider(a: PhysicsThing | null, b: PhysicsThing | null, x: number, y: number, dx: number, dy: number, o?: { min?: number; max?: number; motor?: number; strength?: numbe…` Along (dx, dy) through (x, y): lifts, pistons, sliding doors. (:802)
  - `wheel(a: PhysicsThing | null, b: PhysicsThing | null, x: number, y: number, o?: { motor?: number; strength?: number }): PhysicsJoint` b spins on a hinge at (x, y) of a; later h.motor(speed). (:803)
  - `rope(a: PhysicsThing | null, x1: number, y1: number, b: PhysicsThing | null | undefined, x2: number, y2: number, o?: PhysicsShapeOptions & { links?: number; thick?: nu…` A rope of small links from a (null = the world) to b (undefined = loose). (:805)
  - `ragdoll(x: number, y: number, o?: PhysicsShapeOptions & { size?: number; face?: number }): { parts: Record<'head' | 'chest' | 'armL' | 'foreL' | 'armR' | 'foreR' | 'le…` A floppy person of 10 hinged parts, hips at (x, y); size: head-to-toe height; face 1 right, -1 left. (:807)
  - `grab(x: number, y: number, o?: { strength?: number; filter?: (t: PhysicsThing) => boolean }): { thing: PhysicsThing; move(x: number, y: number): void; release(): void …` Drag with a finger: grab in down() (null if nothing's there), move in move(), release in up(). (:809)
  - `at(x: number, y: number, filter?: (t: PhysicsThing) => boolean): PhysicsThing | null` The thing at a point, or null. (:810)
  - `inBox(x: number, y: number, w: number, h: number): PhysicsThing[]` Every thing overlapping the box. (:811)
  - `ray(x1: number, y1: number, x2: number, y2: number, filter?: (t: PhysicsThing) => boolean): { thing: PhysicsThing | null; x: number; y: number; nx: number; ny: number;…` The first thing a ray hits, or null. (:812)
  - `blast(x: number, y: number, radius: number, strength?: number): void` Throws everything near (x, y) outward. (:813)
  - `onHit(fn: (a: PhysicsThing, b: PhysicsThing, speed: number, x: number, y: number) => void): this` fn(a, b, speed, x, y) when two things start touching; safe to remove things in it. (:814)
  - `step(dt: number): void` Moves the world on by dt seconds (once per update). (:815)
  - `path(c: CanvasRenderingContext2D, t: PhysicsThing): void` The canvas path of a thing's shape, ready for c.fill() or c.stroke(). (:816)
  - `debugDraw(c: CanvasRenderingContext2D, color?: string): void` Outlines every thing and joint (from your game's debug(c)). (:817)
  - `toWorld(v: number): number` (:818)
  - `toGame(m: number): number` (:818)
  - `world: Loose` Rapier's own world and module. (:819)
  - `R: Loose` (:819)
- `Body: Function` What a Physics makes (for instanceof, not new). (:833)
- `World: new (o?: { gravity?: number | { x: number; y: number }; walls?: number[] | null; wallBounce?: number; wallFriction?: number; link?: boolean }) => PhysicsSimpleW…` The simple world: a Physics (the same engine, every method) with a few names of its own: balls and upright boxes whose mass goes by their size in game units, `bodies`, `near(x, y, r)`, `onHit((a, b, speed) => ...)`… (:835)
  - `readonly bodies: PhysicsThing[]` The bodies in it (not its walls). (:823)
  - `onHit(fn: (a: PhysicsThing, b: PhysicsThing | null, speed: number) => void): this` fn(a, b, speed) when two bodies meet with some speed (b null for a wall). (:824)
  - `near(x: number, y: number, r: number, ...rest: number[]): Loose[]` Bodies overlapping a circle; with four numbers or more, Physics' near(). (:825)
- `loadPhysics(): Promise<Loose>` (:836)
- `physicsReady(): boolean` (:836)

## From the maker kit

From [Physics](../maker-kit.md#physics):

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
- **Walk a hero through the world**: `phys.move(box, dx, dy, { step, slope, snap, mass, angle, drop })` moves a
  `{ x, y, w, h }` box (or `{ x, y, r }`) as far as the world lets it, the same way a `TileMap`'s `move()` does and with
  the same answer (`{ left, right, up, down, hits }`). It stops at walls and slides along them, walks up steps and slopes,
  keeps to the ground going down, and shoves crates and balls out of its way (`mass`, kg: how hard). It is solid
  itself, so things land on it, and `onHit` tells you what it ran into. With no gravity (seen from above) walls are
  walls all round. `unmove(box)` takes it out. `gs.movers`' `Platformer` and `TopDown` and `gs.vehicles`' 2D `Car`
  take the world in place of a tile map (`hero.update(dt, phys, input)`), so a hero kicks the crates about.
- **A tile level in the world**: `phys.tiles(map)` makes a `gs.tiles` `TileMap` solid: walls as a few merged boxes,
  `/` `\` slopes as ramps and `-` one-way tiles as ledges (`move()` boxes jump up through them and drop through with
  `drop: true`). Crates, balls and ragdolls then land on your level. After digging or building call its `rebuild()`.
- **Things that aren't bodies** (your own particles, `gs.soft`'s points): `near(x0, y0, x1, y1)` gives the shapes in a
  box and `outOf(x, y, r, shapes)` says where a point of radius `r` must go to be out of them (`null` when it's clear).
- The raw engine is there too: `phys.R` and `phys.world` (Rapier works in metres: `phys.toWorld(px)`).
- The simple world, `gs.physics.World` (balls and upright boxes, mass by size in game units, `bodies`, `near(x, y, r)`,
  `onHit` with `b` null for a wall), is this same engine with those few names kept: every `Physics` method works in it.

From [Living characters and ragdolls](../maker-kit.md#living-characters-and-ragdolls):

In 3D, ragdolls are part of 3D physics (2D games use `gs.physics` `phys.ragdoll(x, y)`, above). On a
character with a `gs.poses` rig (`figure()`, `person()`, `gs.models.human()`), `rag = phys.ragdoll(guard, { push: [0, 2, -5] })`
is a jointed ragdoll: eleven bodies (hips, chest, head, upper and lower arms and legs) joined where the
joints are, each turning only as far as a real one does (a knee bends one way; a head can't spin round),
and the character stays one skinned mesh whose bones follow them. `rag.push(x, y, z)`, `rag.hit('head', x, y, z, point)`,
`rag.part('armL')`, `rag.still()`, `rag.remove()` (it stays as it lies). It has muscles: `rag.drive({ armL: [-1.2, 0, .3], foreL: [-.6, 0, 0] }, .6)`
turns its joints towards a pose (the rig's angles from rest; strength 0 limp to 1 firm), so a falling body can
throw its arms out; `rag.relax()` lets go. A character you built from loose parts with no rig:
`phys.ragdoll(guard, { limbs: [head, armL, armR, legL, legR], push })` (each limb swings at its origin).

From [Game kits](../maker-kit.md#game-kits):

**Drawn shapes** (`gs.strokes`): `Stroke` records a smoothed finger line. `Shapes` recognises circle,
line, triangle, square, check, caret, zigzag, heart, star, spiral, wave, cross, or shapes you add as
points, drawn any size and either way round. `match()` gives `{ name, score, sure }`. `toPhysics()`
turns a drawn line into a `gs.physics` ramp or a falling object.

From [Fixed game tick](../maker-kit.md#fixed-game-tick):

The frame then shows a moment between two ticks: `draw(c, alpha)` gets how far along it is (0..1; always
1 without a tick), also on `gs.tick.alpha`. Keep where things were before the update and draw
`gs.tick.mix(before, now)` (and `gs.tick.turn` for angles) so motion stays smooth on 90 and 120 Hz screens.
The kits do it for you where they can: `gs.physics` things have `sx`, `sy`, `sangle` (and `phys.path()`
uses them), and `new World3D({ smooth: true })` moves its meshes between ticks just before each frame
(aim the camera in `draw()` from the meshes then, so they agree). `gs.tick.rate`, `.on`, `.dt` and
`.count` (ticks this round) are there too. Physics worlds take exactly one step per tick, so a round
is the same on every phone.

## In real games

8 games use it (`node scripts/examples.mjs gs.physics` lists them). The shortest:

`src/games/pin-pull.js` (Pin Pull, Casual · Puzzle, 115 lines):

```js
const { Feel } = gs.effects;
const { Physics } = gs.physics;
// …
    phys?.free?.();
    phys = new Physics({ gravity: 900 });
// …
      const c = mirror ? cols - 1 - c0 : c0, ch = L[r][c0], x = ox + c * cs + cs / 2, y = oy + r * cs + cs / 2;
      if (ch === '#') { cells.push({ x, y }); phys.box(x, y, cs, cs, { fixed: true, friction: .1 }); }
      else if (ch >= '1' && ch <= '9') { const p = pins[ch] ||= { id: ch, parts: [], gone: false }; p.parts.push({ x, y, body: phys.box(x, y, cs, cs *
// …
        const m = ch === 'g' ? 'gold' : ch === 'l' ? 'lava' : 'water', br = cs / 4 - .5;
        for (let i = 0; i < 4; i++) { const b = phys.circle(x + (i % 2 ? .5 : -.5) * cs / 2, y + (i < 2 ? -.5 : .5) * cs / 2, br, { friction: .05, bou
// …
    }
    phys.onHit((a, b) => {
// …
      feel.update(dt); if (feel.frozen) return;
      t += dt; phys.step(dt);
// …
      best.gone = true; pulls++;
      for (const q of best.parts) phys.remove(q.body);
```

`src/games/path-doodle.js` (Path Doodle, rock, 133 lines):

```js
const { Ready } = gs.rounds;
const { Physics } = gs.physics;
// …
      const x = nextX, k = Math.random();
      if (k < .35) { const h = 30 + Math.random() * 60; rocks.push({ x, h, thing: phys.box(x, H - h / 2, 18, h, { fixed: true, tag: 'rock' }) }); }
// …
    ink -= cost;
    const thing = phys.line([[last[0], last[1]], [wx, y]], { friction: .2 });
// …
      phys?.free?.();
      phys = new Physics({ gravity: 420, scale: 20 });
// …
      // a little starting ledge
      const ledge = phys.line([[0, 60], [70, 74]], { friction: .2 });
// …
      segs.push({ a: [0, 60], b: [70, 74], age: -3, thing: ledge });
      ball = phys.circle(14, 48, R, { bounce: .15, friction: .4, density: 1, tag: 'ball' });
// …
      if (ball.vx < 55) ball.force(8, 0);            // it always wants to roll on
      phys.step(dt);
```
