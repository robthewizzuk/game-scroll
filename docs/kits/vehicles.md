# gs.vehicles

Arcade cars and karts that drift and boost, laps, a ready-made rival driver.

`gs.vehicles` (`Car`, `Kart`, `Laps`; `Driver(api, { skill })` a ready-made rival: `them.update(dt, rival.drive(dt, them, race))`, and `rival.watch(dt, me, race)` has it take the player's best lap as its line when that is quicker than its own; `World3D.vehicle()` for suspension)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`VehiclesPart`, line 3428), where every option and field is described.

- `Car: new (o?: WheelsOpts & { x?: number; y?: number; angle?: number; /** A 2D Physics to drive in, solid. Left out: the one the game made before the car; false: none. …` world: a gs.physics Physics with no gravity (top-down) to drive in, solid; size: [length, width]; mass (kg: how hard it shoves). (:3430)
  - `x: number` (:3393)
  - `y: number` (:3393)
  - `angle: number` (:3393)
  - `vx: number` (:3393)
  - `vy: number` (:3393)
  - `crash: { thing: Loose; nx: number; ny: number; speed: number } | null` In a physics world: what it ran into this frame (a wall, a car; not the cones it shoves), else null. (:3395)
  - `thing?: Loose` (:3395)
  - `update(dt: number, input?: DriveInput): Car` (:3396)
  - `bump(nx?: number, ny?: number, o?: { keep?: number }): Car` (:3396)
  - `point(forward: number, right?: number): XY` (:3396)
- `Kart: new (o?: WheelsOpts & { x?: number; y?: number; z?: number; heading?: number; gravity?: number; hop?: number; /** A World3D to drive in, solid. Left out: the one…` world: a gs.physics3d World3D to drive in, solid; size: [width, height, length] (metres); clear: the gap under it (kerbs and ramp lips lower pass under); fall: the y it counts as fallen out. (:3432)
  - `x: number` (:3399)
  - `y: number` (:3399)
  - `z: number` (:3399)
  - `heading: number` (:3399)
  - `vx: number` (:3399)
  - `vy: number` (:3399)
  - `vz: number` (:3399)
  - `onGround: boolean` (:3399)
  - `lean: number` (:3399)
  - `pitch: number` (:3399)
  - `airTime: number` (:3399)
  - `landed: boolean` (:3399)
  - `fell: boolean` (:3399)
  - `impact?: number` (:3399)
  - `crash: { thing: Loose; normal: P3; point: P3; speed: number } | null` In a World3D: what it ran into this frame ({ thing, normal, point, speed }) or null; rider: its body there (a World3D rider). (:3401)
  - `rider?: Loose` (:3401)
  - `hop(): Kart` (:3402)
  - `update(dt: number, input?: DriveInput, ground?: ((x: number, z: number) => number | null) | null): Kart` (:3402)
  - `bump(nx?: number, nz?: number, o?: { keep?: number }): Kart` (:3402)
  - `place(obj: Loose): Kart` (:3402)
  - `moveTo(x: number, y: number, z: number, heading?: number): Kart` Puts it straight at x, y, z (its underside), turned to heading, with nothing in between. (:3404)
- `Driver: { new (api: GameApi | null, o?: { name?: string; skill?: Skill; learn?: boolean; save?: boolean; rng?: () => number }): Driver; new (o?: { name?: string; skill…` A ready-made rival driver. (:3438)
- `Laps: new (points: Pt[], o?: { radius?: number; laps?: number }) => { points: Pt[]; laps: number; racers: Loose[]; join<T>(r: T): T; update<T>(r: T): T; places<T = Loo…` (:3439)

## From the maker kit

From [Physics](../maker-kit.md#physics):

- **Walk a hero through the world**: `phys.move(box, dx, dy, { step, slope, snap, mass, angle, drop })` moves a
  `{ x, y, w, h }` box (or `{ x, y, r }`) as far as the world lets it, the same way a `TileMap`'s `move()` does and with
  the same answer (`{ left, right, up, down, hits }`). It stops at walls and slides along them, walks up steps and slopes,
  keeps to the ground going down, and shoves crates and balls out of its way (`mass`, kg: how hard). It is solid
  itself, so things land on it, and `onHit` tells you what it ran into. With no gravity (seen from above) walls are
  walls all round. `unmove(box)` takes it out. `gs.movers`' `Platformer` and `TopDown` and `gs.vehicles`' 2D `Car`
  take the world in place of a tile map (`hero.update(dt, phys, input)`), so a hero kicks the crates about.

From [3D physics](../maker-kit.md#3d-physics):

- **Your own movers, solid in the world**: `rider({ box: [w, h, l] | ball: r | capsule: [r, h], at, turn, step,
  slope, snap, mass })` is something your code moves (a kart, a boat, a drone, a tram) that stops at walls, climbs
  kerbs, keeps to the ground and shoves loose bodies by its `mass`. `slide(dx, dy, dz, turn, dt)` each frame,
  then `pos`, `moved`, `grounded`, `hits` (`[{ thing, normal, point }]`) and `wall`; `move(x, y, z)`, `place()`.
  `gs.vehicles`' `Kart`, `gs.craft`'s `Plane`, `Boat` and `Hover` take `world` and ride one by themselves.

From [Game kits](../maker-kit.md#game-kits):

**Vehicles** (`gs.vehicles`): `Car` (top-down) and `Kart` (3D) are arcade handling without a physics
engine: grip, slides, a drift you hold for a boost, surfaces (`surface: .1` is ice), hops and ground
following. `Laps(checkpoints)` counts laps, places racers and gives computer drivers somewhere to aim.
For real suspension and cars that can roll over, `World3D.vehicle(mesh, { wheels })` in
`gs.physics3d` uses Rapier's ray-cast vehicle: `car.drive(throttle, steer, brake)`, `car.speed`,
`car.upsideDown`, `car.rightUp()`.
These are how a car handles; what it looks like is yours, or `gs.models.vehicle('car')`:
[Vehicles made in code](#vehicles-made-in-code).

A ready-made rival driver (Tiny Brains): `Driver` drives a `Car` or a `Kart` round a `Laps` course, and
takes the player's best lap as its own line when that is quicker than its own way round.

```js
const { Car, Laps, Driver } = gs.vehicles;
rival = new Driver(api, { name: 'harbour', skill: .7 });   // make(): one for each rival car, a name for each course
reset() { race = new Laps(POINTS, { radius: 40 }); me = race.join(new Car(START)); them = race.join(new Car(GRID2)); }
update(dt) {
  me.update(dt, myInput); race.update(me);
  rival.watch(dt, me, race);                               // it keeps the player's best lap
  them.update(dt, rival.drive(dt, them, race)); race.update(them);   // { throttle, steer, brake, drift }
}
// at the end of a race:
rival.result(playerWon);
```

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Shooting from a car** (`gs.combat`): `DriveBy(car, { seat: 'driver' })` (a `gs.models` vehicle, any Object3D, or a
`gs.vehicles` Car) keeps the aim where it can go from that seat: out of the side window on its side (the gun leans
out further the further round it points), through the windscreen, out of the back window with `rear: true`; the
driver can't shoot across his own passenger. `drive.update(dt)` after the car moves, `drive.aim(wantDir)`, then
`drive.fire(gun, held)` pulls the trigger from where the gun is: the ride throws the aim about (speed and bumps:
`drive.spread`) and flying shots carry the car's speed. `drive.glass` is where a shot crosses the glass
(`car.hit(drive.glass)` breaks it), `drive.pose` the upper-body pose (`carAimL`, `carAimR`, `carAimF`) and
`drive.turn`, `drive.pitch` go to `rig.update(dt, { aimYaw: drive.turn, aim: drive.pitch })`. Police leaning out of
their car use the same.

- **Engines**: a `gs.models.vehicle` gets the engine its kind and style has (a saloon's petrol, a sports
  car's six, a lorry's diesel, a tank's tracks, a steam engine's chuffs and the rails' clack, an outboard,
  a propeller, a jet that spools up): revs through the gears with its speed, louder and brighter under load,
  tyres on what the road is, a squeal when it slides. A `World3D.vehicle()` and a `gs.vehicles` `Car` or `Kart`
  too, from their own speed and throttle. `watch(v, { engine, top, throttle: () => 0..1, vol })` to choose.

From [Vehicles made in code](../maker-kit.md#vehicles-made-in-code):

`const { vehicle } = gs.models;` (Next Gen.) Cars, lorries, buses, motorbikes, tanks, trains, boats, planes
and helicopters with no model files. Each is worked out from a few measures into a shell, dressed in paint, glass, chrome and rubber, aged
a little, and handed back as a three.js Group with the parts that turn on pivots of their own:

```js
make():   jeep = vehicle('car', { style: 'jeep', seed: 4 }); view.add(jeep);
          tank = vehicle('tank', { style: 'heavy', finish: 'worn' }); view.add(tank);
          train = vehicle('train', { style: 'steam', cars: ['van', { style: 'open', load: 'coal' }, 'guard'] }); view.add(train);
update(dt) {
  kart.update(dt, input); kart.place(jeep);                 // gs.vehicles says where it is...
  jeep.move(dt, kart.speed, { steer: input.steer });        // ...this rolls and steers its wheels and rocks its body
  tank.move(dt, speed, { turn, aim: [bearing, lift] });     // tracks run, one ahead of the other in a turn; the turret comes round
  along += 12 * dt; train.along(rails, along).roll(along);  // each car between its own wheels, round the curve
}
```

- **Which way round.** Its nose points along -z and +x is its right side, in metres, as `gs.vehicles`,
  `gs.craft` and `World3D.vehicle` push things. A road vehicle and a train stand on y = 0. A boat floats
  with its waterline at y = 0 (`boat.draft` is how deep). A plane's origin is on its centre line:
  `plane.gear` is how high that stands above the ground on its wheels and `plane.sit` how far its nose
  points up there.

## In real games

1 game uses it (`node scripts/examples.mjs gs.vehicles` lists them). The shortest:

`src/games/parcel-dash.js` (Parcel Dash, Next Gen · Driving, 199 lines):

```js
const { Sky } = gs.sky;
const { Car } = gs.vehicles;
// …
      const st = city.spot('street', { near: city.start, max: 60, rnd: R }) || city.road(0, 0);
      car = new Car({ x: st.x, y: st.z, angle: Math.PI / 2 - st.heading, top: 21, accel: 13, brakes: 32, turn: 2.3, roll: .35, grip: 7, reverse: .35 }
// …
      const braking = pad.buttons.BRAKE.isDown;
      car.update(dt, { throttle: pad.left.active || k.x || k.y ? Math.max(-1, Math.min(1, -sy * 1.4 + (pad.left.active ? .35 : 0))) : 0, steer: sx, br
// …
      const p = { x: car.x, z: car.y }, wall = city.collide(p, 1.15, .5);
      if (wall) { const nx = p.x - car.x, nz = p.z - car.y, l = Math.hypot(nx, nz) || 1; car.x = p.x; car.y = p.z; if (Math.abs(car.speed) > 6) { soun
// …
      const other = hitT <= 0 && city.cars.hit(p, 1.1);
      if (other) { hitT = 1; city.cars.bump(other); car.bump(); time -= 3; say('Crash! -3s', '#ff7060'); sounds.boom(); haptic('heavy'); fx.shake(6); 
```
