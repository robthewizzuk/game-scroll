# gs.craft

Planes, boats, hovercraft and floating things.

`gs.craft` (`Plane`, `Boat`, `Hover`, `Floater`)

Give `Boat` and `Hover` a `gs.models.vehicle('boat' | 'helicopter')` as `vehicle` and they move it and wear it: its size sets the hull, crashes `hit()` it, a failing engine slows a boat and sinks a helicopter, a wrecked boat lists and goes down (`boat.sunk`), a wrecked helicopter falls spinning and a hard landing crashes it (`hover.crashed`, `crashSpeed`). Getting on and off is the vehicle's `enter()` / `exit()` (from a dock or the water, onto a dock, a shore or into the water).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CraftPart`, line 5438), where every option and field is described.

- `Plane: new (o?: { at?: P3; heading?: number; speed?: number; power?: number; lift?: number; drag?: number; stall?: number; top?: number; turn?: [number, number, number…` Arcade-true flight. Events this frame in events[]: 'stall', 'land', 'touch', 'crash', 'takeoff'. (:5440)
- `Boat: new (water?: { height?(x: number, z: number): number; normal?(x: number, z: number): P3; [k: string]: Loose } | null, o?: { at?: P3; heading?: number; power?: nu…` water: anything with height(x, z) (a gs.outdoors Water or Sea, gs.flow level(x, z), a function's object); null, or the options in its place: the newest Water or Sea the game made; world: a World3D, solid: it shoves… (:5446)
- `Hover: new (o?: { at?: P3; heading?: number; climb?: number; speed?: number; accel?: number; turn?: number; tilt?: number; gravity?: number; ground?: ((x: number, z: n…` (:5452)

## From the maker kit

From [3D physics](../maker-kit.md#3d-physics):

- **Your own movers, solid in the world**: `rider({ box: [w, h, l] | ball: r | capsule: [r, h], at, turn, step,
  slope, snap, mass })` is something your code moves (a kart, a boat, a drone, a tram) that stops at walls, climbs
  kerbs, keeps to the ground and shoves loose bodies by its `mass`. `slide(dx, dy, dz, turn, dt)` each frame,
  then `pos`, `moved`, `grounded`, `hits` (`[{ thing, normal, point }]`) and `wall`; `move(x, y, z)`, `place()`.
  `gs.vehicles`' `Kart`, `gs.craft`'s `Plane`, `Boat` and `Hover` take `world` and ride one by themselves.

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Planes, boats and hover craft** (`gs.craft`): `Plane({ at, speed, ground })` flies like arcade games
feel: it banks into turns, holds its height when level, stalls when slow, lands, touches down and
crashes (`plane.events`). Feed it `update(dt, { throttle, pitch, roll, yaw, brake })` from a stick or
tilt. `Boat(water, { power, turn, drift })` rides the waves with pitch and roll and leaves `wake`
points for your spray. `Hover` is a drone or hover bike. `Floater(body, water)` makes any physics3d
body bob on the water (crates, buoys, barrels).

From [Water you can disturb](../maker-kit.md#water-you-can-disturb):

- `watch(thing, { radius, bottom, top })` takes a mesh, a physics body, a `gs.craft.Boat`, a character:
  anything with a position. From then on the water does the rest: a splash when it lands in the water or
  leaps out of it, the water it pushes aside as it moves, rings left behind it (slow, they spread round a
  swimmer; fast, they are a boat's wake), a trail of foam above a jog, spray off the bow above 5 m/s.
  `bottom` and `top` are how far below and above its position it reaches (a person standing: `bottom: 0,
  top: 1.8`). It returns the watch: `remove()` stops it. `foam: 0` or `splash: 0` turn those off.

From [Vehicles made in code](../maker-kit.md#vehicles-made-in-code):

- **Which way round.** Its nose points along -z and +x is its right side, in metres, as `gs.vehicles`,
  `gs.craft` and `World3D.vehicle` push things. A road vehicle and a train stand on y = 0. A boat floats
  with its waterline at y = 0 (`boat.draft` is how deep). A plane's origin is on its centre line:
  `plane.gear` is how high that stands above the ground on its wheels and `plane.sit` how far its nose
  points up there.
- **A helicopter** is the look for `gs.craft.Hover`: place it from the craft each frame and `move(dt, speed,
  { power })` spins its rotor and tail rotor up to a blur.
- **Boats and planes** are the look for `gs.craft`: `boat = new Boat(sea, { length: hull.size.length,
  width: hull.size.width, draft: 0 })`, then `hull.position.copy(boat.pos); hull.quaternion.copy(boat.quat);
  hull.move(dt, boat.speed, { steer })` each frame; a plane the same from a `Plane({ ground, gear:
  plane.gear })`, with `move(dt, speed, { power: throttle, ground: flying.onGround })`.

## In real games

No game uses `gs.craft` yet: the examples above are what there is.
