# gs.combat

Guns, shots, lobs, health, markers, explosives, weapons made in code, drive-bys.

`gs.combat` (`Gun`, `Shots`, `arc`/`lob`, `Health`, `Markers`, `Explosives`, `DriveBy`: shooting from a car's seat out of its windows; a ready-made arsenal: `ARSENAL` (numbers for pistol, revolver, smg, shotgun, rifle, sniper, launcher, grenade, bat, pipe, wrench, baton, and the old world's sword, longsword, dagger, axe, mace, spear, staff, shield, bow), `arm(kind)`, `Pouch` (ammo the guns share), `Loadout` (`give`, `next`, `fire` with its sound, `reload`; a shield worn beside, `off`), `Bow` (`update(dt, { pull, from, dir, targets })`: drawn over time, loosed on letting go, arrows that drop, stick in the world or in who they hit and go along with them), `Pickups` (`collect(dt, hero, arms)`), `weaponSound`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CombatPart`, line 3508), where every option and field is described.

- `Gun: new (o?: { damage?: number; rate?: number; mag?: number; reserve?: number; reload?: number; spread?: number; bloom?: number; maxSpread?: number; settle?: number; …` (:3509)
  - `damage: number` (:3457)
  - `rate: number` (:3457)
  - `mag: number` (:3457)
  - `reserve: number` (:3457)
  - `reload: number` (:3457)
  - `ammo: number` (:3457)
  - `kick: { pitch: number; yaw: number }` (:3457)
  - `kind?: WeaponKind` The kind it is (arm(kind)), the ammo it takes, the Pouch it reloads out of (else its own reserve). (:3458)
  - `ammoType: string | null` (:3458)
  - `pouch: Pouch | null` (:3458)
  - `readonly spare: number` Spare rounds to reload from: in its pouch, else its reserve. (:3459)
  - `justFired: boolean` (:3460)
  - `empty: boolean` (:3460)
  - `readonly reloading: number` (:3460)
  - `readonly spreadNow: number` (:3460)
  - `pull(from: P3, dir: P3, pressed?: boolean): Shot[]` (:3461)
  - `wobble(dir: P3, cone: number, is3?: boolean): P3` (:3461)
  - `update(dt: number): Gun` (:3461)
  - `startReload(): boolean` (:3461)
  - `damageAt(distance?: number, head?: boolean): number` (:3461)
  - `save(): Loose` (:3462)
  - `load(d: Loose): Gun` (:3462)
- `ARSENAL: Readonly<Record<ArsenalKind, ArsenalEntry>>` Each weapon's numbers (the ones gs.models.weapon makes): its Gun options, ammo, case, slot, a grenade's throw, a rocket's blast, a melee weapon. (:3511)
- `arm(kind: ArsenalKind, o?: Loose): Gun` A Gun with a weapon's numbers (o over them: a pouch...). (:3513)
- `Bow: new (o?: { draw?: number; speed?: number; damage?: number; gravity?: number; spread?: number; shake?: number; tire?: number; nock?: number; pouch?: Pouch | null; …` A bow: drawn over draw seconds while pull is held (speed and damage grow with it; held at full past tire seconds it shakes), loosed on letting go (barely drawn: let down), the next arrow nocked from the pouch. (:3519)
  - `k: number` The draw now, 0..1 (bowModel.pull(bow.k)); seconds held at full; an arrow on the string. (:3478)
  - `full: number` (:3478)
  - `loaded: boolean` (:3478)
  - `flying: Loose[]` Arrows in flight ({ x, y, z, v, damage }) and stuck where they landed ({ x, y, z, dir, on }). (:3479)
  - `stuck: Loose[]` (:3479)
  - `readonly ready: boolean` Nocked and not drawn. (:3480)
  - `readonly left: number` Arrows left (the pouch's and the one on the string). (:3480)
  - `readonly wobble: number` How far off the aim an arrow loosed now may go (radians). (:3480)
  - `update(dt: number, o?: { pull?: boolean; from?: P3 | null; dir?: P3 | null; targets?: Loose[]; hits?: (from: P3, to: P3, arrow: Loose) => Loose }): BowHit[]` Each frame: pull (held), from and dir (where it leaves, the aim), targets, hits (your own ray test, else the game's World3D). (:3482)
  - `loose(from: P3, dir: P3): Loose | null` Lets the arrow go now. (:3483)
  - `gather(at: P3, reach?: number): number` Picks up stuck arrows near a point: how many went back in the pouch. (:3484)
  - `show(scene: Loose, make: () => Loose): BowT` Keeps a model on each arrow (make: () => gs.models.weapon('arrow')). (:3485)
  - `hide(): BowT` (:3485)
  - `on(ev: 'nock' | 'draw' | 'loose' | 'hit', fn: (e: Loose) => void): BowT` (:3486)
  - `reset(): BowT` (:3486)
- `Pouch: new (start?: Record<string, number>, o?: { max?: Record<string, number> }) => Pouch` Ammo carried by kind ('pistol', 'magnum', 'shells', 'rifle', 'rockets', 'grenades' or your own); max: the most of each. (:3521)
  - `n: Record<string, number>` (:3488)
  - `max: Record<string, number>` (:3488)
  - `count(kind: string): number` (:3488)
  - `add(kind: string, n: number): number` (:3488)
  - `take(kind: string, n?: number): number` (:3488)
  - `full(kind: string): boolean` (:3488)
  - `save(): Record<string, number>` (:3488)
  - `load(d: Loose): Pouch` (:3488)
- `Loadout: new (o?: { pouch?: Pouch; sounds?: boolean; health?: Health | null }) => Loadout` The weapons one person carries (a slot each), the one out, and a pouch the guns share; sounds: false to play your own. (:3523)
  - `pouch: Pouch` (:3491)
  - `carried: Record<string, { gun: Gun | null; bow: BowT | null }>` (:3491)
  - `kind: ArsenalKind | null` (:3491)
  - `switching: number` (:3491)
  - `health: Health | null` (:3491)
  - `off: ArsenalKind | null` The shield worn beside the one out (slot 'off'), or null. (:3492)
  - `readonly bow: BowT | null` The bow out (its arrows come from the pouch; update it yourself: arms.bow.update(dt, { pull, from, dir, targets })), or null. (:3493)
  - `readonly gun: Gun | null` The gun out (null for a thing swung or thrown, or nothing). (:3494)
  - `readonly info: ArsenalEntry | null` ARSENAL's entry for the one out. (:3495)
  - `readonly list: ArsenalKind[]` The kinds carried, in slot order. (:3496)
  - `has(kind: string): boolean` (:3497)
  - `give(kind: ArsenalKind, o?: { rounds?: number; use?: boolean }): ArsenalKind | null` Picks one up (with its rounds): drops what was in its slot (returned). (:3498)
  - `take(p: Pickup): number` What a Pickups handed over: how much it took (0: leave it lying). (:3499)
  - `use(kind: ArsenalKind): Loadout` (:3500)
  - `next(step?: number): Loadout` (:3500)
  - `prev(): Loadout` (:3500)
  - `update(dt: number): Loadout` (:3500)
  - `fire(from: P3, dir: P3, pressed?: boolean, o?: { at?: P3 }): Shot[]` Gun.pull with its sound (at: where), nothing while switching. (:3501)
  - `reload(o?: { at?: P3 | null }): Loadout` (:3502)
  - `save(): Loose` (:3502)
  - `load(d: Loose): Loadout` (:3502)
- `Pickups: new (o?: { reach?: number; bob?: number }) => { list: Pickup[]; add(o: Partial<Pickup> & { kind: string }): Pickup; remove(p: Pickup): Loose; taken(p: Pickup)…` Things lying in the world to pick up (weapons, kind 'ammo' with of and amount, kind 'health'); update(dt, who) gives those in reach; collect(dt, who, loadout) takes them. (:3525)
- `weaponSound(kind: WeaponKind | string, what?: 'fire' | 'empty' | 'reload' | 'pump' | 'swing' | 'pin' | 'draw' | 'clang' | 'parry' | 'bash' | 'nock' | 'thunk' | 'flesh'…` A weapon's sound: 'fire', 'empty', 'reload' (over time), 'pump', 'swing', 'pin', 'draw'; at: through the game's gs.sound.Ears when there is one. (:3527)
- `Shots: new (o?: { gravity?: number; push?: number; link?: boolean }) => { list: Loose[]; push: number; add(s: Shot, extra?: Loose): Loose; /** hits: your own test (fro…` push: how hard a hit shoves a loose body (kg metres a second) when update is given a physics world. (:3529)
- `arc(from: P3, vel: P3, gravity?: number, o?: { steps?: number; dt?: number; ground?: ((p: P3) => boolean) | Loose; not?: Loose }): (P3 & { hit?: Loose })[]` ground: (p) => true under the floor, or a physics world (World3D or 2D Physics): the arc stops where it first meets anything there (the last point has .hit); not: a body it passes. (:3534)
- `lob(from: P3, to: P3, time?: number, gravity?: number): P3` (:3535)
- `Health: new (o?: { max?: number; regen?: number; delay?: number; armour?: number; maxArmour?: number; absorb?: number; downed?: boolean; bleed?: number }) => Health` (:3536)
  - `hp: number` (:3505)
  - `max: number` (:3505)
  - `armour: number` (:3505)
  - `down: boolean` (:3505)
  - `dead: boolean` (:3505)
  - `hits: { angle: number; amount: number; life: number }[]` (:3505)
  - `readonly frac: number` (:3505)
  - `readonly hurting: boolean` (:3505)
  - `hurt(amount: number, o?: { from?: P3; at?: P3; facing?: number }): number` (:3506)
  - `heal(n: number): number` (:3506)
  - `addArmour(n: number): Health` (:3506)
  - `revive(share?: number): Health` (:3506)
- …more: `CombatPart` at src/gamescroll.d.ts:3508

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Weapons and damage** (`gs.combat`): `Gun({ rate, mag, reload, spread, recoil, pellets, falloff })`:
`gun.pull(from, dir, held)` gives the shots fired this frame (spread that blooms and settles,
shotgun pellets, full auto or one per tap), `gun.kick` is the recoil to add to your camera, and
`damageAt(distance, head)` covers range falloff and headshots. `Shots` flies slower shots (rockets,
arrows) and asks your `hits()` what each one met; `arc` and `lob` give grenade throw lines.
`Health({ regen, delay, armour, downed })` heals after a quiet spell, soaks hits with armour, can go
down before dying, and keeps the direction of each hit (`hits[].angle`) for damage arrows.
`Markers` times hit markers. `Explosives` are barrels and mines that set each other off.

**A ready-made arsenal** (`gs.combat`): `ARSENAL` holds the numbers for every weapon `gs.models.weapon` makes
(`pistol`, `revolver`, `smg`, `shotgun`, `rifle`, `sniper`, `launcher`, `grenade`, and `bat`, `pipe`, `wrench`, `baton`
to swing): its `Gun` options, the ammo it takes, the case it throws, a grenade's throw and fuse, a rocket's blast and
a melee weapon's `{ reach, damage, arc }` for `Melee`. `arm('rifle')` is a `Gun` with those numbers. `Pouch({ pistol: 36 })`
is ammo by kind with a most of each, and a gun given one (`arm(kind, { pouch })`) reloads out of it, so guns that take
the same rounds share them. `Loadout({ pouch, health })` is what one person carries, a weapon to each slot (melee, hand,
long, heavy, throw): `give(kind)` picks one up loaded (another of the same kind gives its rounds; a second long gun
takes the first's place, which `give` returns to drop), `next()`, `use(kind)` (drawing takes a moment),
`fire(from, dir, held, { at })` pulls the trigger with the weapon's sound, `reload()`, `save()` / `load()`.
`Pickups()` lies about the world: `add({ x, y, z, kind: 'shotgun' })`, `{ kind: 'ammo', of: 'shells', amount }`,
`{ kind: 'health', amount }`, with `respawn` seconds; `drops.collect(dt, hero.feet, arms)` takes what the hero walks
over and the loadout has room for (each has `spin` and `bob` to draw it turning). `weaponSound(kind, what, at)` is each
weapon's own report, click when empty, reload, pump or bolt, swing, pin and draw, heard from `at` through the game's
`gs.sound.Ears` when it made one (muffled behind walls, echoing in the place). A rocket is a flying `Shots` shot that
lights an `Explosives` charge where it lands; a grenade is a `World3D` ball added to `Explosives` with `body` and lit
(`ARSENAL.grenade.throw` has its speed and fuse; `arc` draws the throw line).

**The old world's** (`gs.combat` and `gs.fight`): `ARSENAL` has `sword`, `longsword`, `dagger`, `axe`, `mace`, `spear`,
`staff` (their `melee` is `gs.fight.ARMS[kind]`), `shield` (slot `'off'`: a `Loadout` wears it beside what is out, as
`arms.off`) and `bow` (`arms.bow` is its `Bow`, its arrows out of the pouch). `new Bow({ pouch })`: each frame
`bow.update(dt, { pull: held, from: eye, dir: aim, targets: foes })` draws while held (`bow.k` 0..1 over `draw` seconds:
the longer, the faster and harder it flies; held at full past `tire` seconds the aim shakes), looses on letting go (barely
drawn, it is let down), nocks the next; arrows drop as they fly, stop in the game's `World3D` (or your `hits` test) or in a
target (anything with a position, `radius` and `height`; the top tenth is a head shot), stay stuck there and go along with
who they are in (`stuck`; `gather(at)` picks them up). It returns `{ who, thing, at, dir, damage, head }` for each hit;
`bow.show(view.scene, () => gs.models.weapon('arrow'))` keeps an arrow model on each. `weaponSound('bow', 'nock' | 'draw' |
'fire' | 'thunk' | 'flesh')`, and `'clang'`, `'parry'` and `'bash'` for blades and shields.

**Shooting from a car** (`gs.combat`): `DriveBy(car, { seat: 'driver' })` (a `gs.models` vehicle, any Object3D, or a
`gs.vehicles` Car) keeps the aim where it can go from that seat: out of the side window on its side (the gun leans
out further the further round it points), through the windscreen, out of the back window with `rear: true`; the
driver can't shoot across his own passenger. `drive.update(dt)` after the car moves, `drive.aim(wantDir)`, then
`drive.fire(gun, held)` pulls the trigger from where the gun is: the ride throws the aim about (speed and bumps:
`drive.spread`) and flying shots carry the car's speed. `drive.glass` is where a shot crosses the glass
(`car.hit(drive.glass)` breaks it), `drive.pose` the upper-body pose (`carAimL`, `carAimR`, `carAimF`) and
`drive.turn`, `drive.pitch` go to `rig.update(dt, { aimYaw: drive.turn, aim: drive.pitch })`. Police leaning out of
their car use the same.

From [Vehicles made in code](../maker-kit.md#vehicles-made-in-code):

- **People in it.** `car.seats` are its seats by name (`driver`, `passenger`, `backL`, `backR`; a
  motorbike's `rider`, `pillion`; a helicopter's `pilot`, `copilot`), each with its `point`, its `door` and
  `who` sits there.
  ```js
  trip = car.enter(player);                 // walks to the driver's door, opens it, gets in, sits, pulls it shut
  trip.then(() => { driving = true; });     // trip.step: 'walk', 'open', 'in', 'close', then 'done'
  car.exit();                               // opens the door, steps out, shuts it: the player is the game's again
  car.pull('driver', player);               // wrenches the door open, throws the driver out, gets in in their place
  car.putIn(driver, 'driver');              // a car that comes with someone at the wheel (takeOut(person) the other way)
  ```
  A person in a car, or on the way in or out, is the car's: its `update(dt)` runs their rig, sits them on
  the cushion, and puts their hands on the wheel as it turns (a motorbike's: on the bars), so leave anyone
  with `person.vehicle` set alone. A person who is pulled out is thrown down by their
  `gs.characters.Reactions` if they have one (`trip.thrown` says who it was; they are the game's again).
  `seats.driver.hold = false` frees the hands (shooting out of the window: `gs.combat.DriveBy`). The poses
  are `drive` and `ride` (any `gs.poses` rig has them). Enter and exit take about four seconds with the walk,
  `pull` about three and a half.

## In real games

1 game uses it (`node scripts/examples.mjs gs.combat` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Sky, Weather } = gs.sky;
const { Gun, Health, Explosives } = gs.combat;
// …
    // (seen along its length the stock is all grazing angles, where any surface mirrors the sky: its wood is given less of that, and a little of its 
    for (const m of near) m.side = THREE.DoubleSide; near[1].roughness = .46; near[1].metalness = .75; gun.add(new Mesh(P.wood, near[0]), new Mesh(P.s
  gun.scale.setScalar(1.5); gun.position.set(.27, -.3, -.56); gun.rotation.set(.05, .13, -.1); gun.traverse(m => { m.castShadow = false; m.userData.no
// …
  const camp = new Campaign(CHAPTERS).attach(api);
  const gun = new Gun({ damage: 100, rate: .95, mag: 5, reload: 2.6, spread: 0, bloom: 0, recoil: .03, sideways: .3, recover: 3, auto: false, range: 6
  const me = new Health({ max: 100, regen: 14, delay: 4 });
// …
    const d = dirOf(look.yaw + sy, look.pitch + sp + BORE, tmpB).clone();
    const s = gun.pull({ x: eye.x, y: eye.y, z: eye.z }, d, true); gun.pull(eye, d, false);
// …
  function hurtMe(n, from) {
    me.hurt(n); const e = WD.v.cam.position, rel = angDiff(Math.atan2(-(from.x - e.x), -(from.z - e.z)), look.yaw);
// …
  }
  function drumHit(b) { if (b.gone) return; boom.light(b, true); }
```
