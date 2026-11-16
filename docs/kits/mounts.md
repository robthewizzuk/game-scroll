# gs.mounts

A horse or a flying beast to ride: saddle and reins on any creature, getting on and off, gaits with stamina, jumps, flight, blows from the saddle.

`gs.mounts.Mount(creature, { world })` (a horse or a flying beast to ride: saddle, stirrups and reins fitted to any `gs.models.creature`; `enter(person)` / `exit()` walk on and off astride; `ride(dt, { stick, jump, urge, rein, climb, land })` each frame: walk, trot, canter, gallop with weight and stamina, jumps, take off, bank and land; `strike(side)` and `shoot(dir)` from the saddle as events, harder at a charge; `steerTo(x, z)`).

Guide: [Mounts](../maker-kit.md#mounts).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`MountsPart`, line 3062), where every option and field is described.

- `Mount: new (beast: Loose, o?: { world?: Loose; ground?: (x: number, z: number) => number; fly?: boolean; saddle?: false | { colour?: string; dark?: string; blanket?: s…` A creature to ride. o: world (found), ground(x, z) without one, fly, saddle (false, or { colour, dark, blanket }), reins (false), turn, stamina (seconds of gallop), jump (metres), seat (metres back from the middle of… (:3064)
  - `beast: Loose` The creature. (:3023)
  - `speeds: Record<MountGait | 'fly', number>` Metres a second each gait runs at (and fly for a flyer). (:3025)
  - `speed: number` (:3026)
  - `yaw: number` (:3026)
  - `gait: MountGait` (:3026)
  - `want: MountGait` The gait it is urged to (stick forward runs up to it). (:3028)
  - `air: boolean` (:3029)
  - `flying: boolean` (:3029)
  - `flies: boolean` (:3029)
  - `onGround: boolean` (:3029)
  - `stamina: number` 0..1: the gallop spends it; tired at 0 (no gallop until it is back over a third). (:3031)
  - `tired: boolean` (:3031)
  - `posture: number` How the rider sits: 0 deep in the saddle .. (:3033)
  - `events: MountEvent[]` (:3034)
  - `readonly rider: Loose` Who is in the saddle or getting on. (:3036)
  - `seats: Record<string, Loose>` The saddle seat ({ saddle: { who, point, ... (:3038)
  - `readonly trips: { person: Loose; kind: string; step: string; done: boolean; then(fn: (t: Loose) => void): Loose }[]` The walks on and off in progress. (:3040)
  - `on(type: MountEvent['type'], fn: (e: MountEvent) => void): Mount` (:3041)
  - `place(x?: number, y?: number, z?: number, turn?: number): Mount` (:3042)
  - `enter(person: Loose, o?: { walk?: number }): Loose` Someone walks to its left side and gets on (person.vehicle is the mount from then). (:3044)
  - `exit(): Loose` Whoever is on gets off and stands beside it. (:3046)
  - `putIn(person: Loose): Mount` Puts someone in the saddle at once / takes them off at once. (:3048)
  - `takeOut(person: Loose): Loose` (:3048)
  - `ride(dt: number, input?: MountInput): Mount` Each frame: moves it, plays its gait and sits the rider. (:3050)
  - `urge(): Mount` (:3051)
  - `rein(): Mount` (:3051)
  - `takeOff(): void` (:3052)
  - `strike(side?: 'left' | 'right' | 'front', o?: { power?: number; time?: number }): boolean` A blow from the saddle (its hit comes as a 'strike' event, harder at speed). (:3054)
  - `shoot(dir?: XYZ | null, o?: { time?: number }): boolean` Looses an arrow from the saddle (a 'shoot' event). (:3056)
  - `steerTo(x: number, z: number, o?: { stop?: number; gait?: MountGait }): { x: number; y: number }` A stick that takes it towards a point: pass to ride(). (:3058)
  - `pack(): { x: number; y: number; z: number; r: number; s: number }` (:3059)
  - `unpack(d: Loose): Mount` (:3059)
  - `remove(): void` (:3060)
- `GAITS: readonly MountGait[]` (:3065)

## From the maker kit

From [Mounts](../maker-kit.md#mounts):

`gs.mounts.Mount(creature, { world })` turns a `gs.models.creature` into something to ride: a horse, a deer, a giant owl or a dragon. It fits a saddle, blanket, girth, stirrups and reins to the creature's own shape, pins them to its back so they move with its stride, and makes it a solid rider in the game's World3D, which it finds by itself.

```js
const { Mount } = gs.mounts, { creature, human } = gs.models;
make() {
  [horse] = creature.all([{ like: 'horse', seed: 4 }]); [hero] = human.all([{ seed: 3 }]);
  steed = new Mount(horse);
}
reset() { steed.place(0, 0, 0); }
update(dt) {
  if (tappedTheHorse) steed.enter(hero);                    // walks to its left side and swings up astride
  if (tappedGetOff) steed.exit();
  steed.ride(dt, { stick: stick.value, jump, urge: swipedUp, rein: swipedDown });
  if (swingTapped) steed.strike('right');                   // 'left', 'front'; steed.shoot(dir) for a bow
  for (const e of steed.events) if (e.type === 'strike') hitAround(e.at, e.radius, e.power);
}
```

- **Gaits**: stand, walk, trot, canter and gallop (`GAITS`), at speeds from the creature's own legs (`speeds`). `urge()` and `rein()` move the gait up or down, like a nudge of the heels or a pull on the reins. The stick runs it up to that gait, and pulling back stops it, then backs it up.
- **Weight**: it takes a second or two to get going and stops quicker. It turns tightly at a walk and wide at a gallop, and it leans into turns.
- **Stamina**: the gallop spends it. The mount sends `tired` at nothing left and `rested` once it can gallop again.
- **Jumps** (`jump: true`) go over fences from a trot or faster, or as a hop from a stand. The height comes from its size (`jump` sets it).
- **Flying**: a creature that can fly (a dragon, an owl) takes off on `jump`. In the air, the stick sets the speed, `climb` (-1 to 1) dives or climbs, the stick's x banks it into turns, and `land` brings it down.
- **The rider** sits each gait: deep at the walk, rising at the trot, up and forward over the neck at the gallop. Their hands stay on the reins and their feet in the stirrups. While on, they belong to the mount (`person.vehicle`), as people in a gs.models vehicle do. `rider` says who is on.
- **From the saddle**: a blow's hit comes as a `strike` event, twice as hard at a full gallop as at a stand (a charge). `shoot(dir)` sends a `shoot` event.
- `steerTo(x, z)` gives a stick that takes it somewhere: a companion's horse, or a horse led by the reins. `pack()` and `unpack()` keep where it is.
- Without a World3D it keeps to `ground(x, z)`. `saddle: false` and `reins: false` leave the tack off, and `saddle: { colour, blanket }` colours it.

## In real games

No game uses `gs.mounts` yet: the examples above are what there is.
