# gs.models

Things made in code for Next Gen: materials, props, trees, buildings, people (and a character creator), creatures, fur, vehicles, weapons.

Guide: [Next Gen 3D guide](../nextgen-3d.md).

`gs.models` (`material(name)` 34 recipes like wood, brick, rust, fabric, thatch, and worn paint over metal (`paint`, `hull`, `corrugated`, `wear: 0..1` chips it to the undercoat, stains round the chips and runs rust down from them), `asphalt`, `epoxy`, `galvanised`, `diamond` plate, `brushed` steel, `gunmetal`, `polymer`, `plastic`, `tarp`, `cardboard`, `rubber`, `carbon`; `wear(mesh)` worn edges, grime, moss, snow; `prop('crate'|'barrel'|'stall'|'torch'|'container'|'crane'|...)` 37 props (yards and docks: containers, a gantry crane, barriers, chain-link, oil drums, pallets, cable reels, bollards, skips); `fort({ kind: 'wall'|'tower'|'gate' })` castle pieces; `sculpt([{ ball }, { box, cut }...])`; `tree('oak'|'pine'|'palm'|'fan'|'banana'|'fern'|'cypress'|'reeds'|'lily'|...)` (plants with leaves that sway from where they grow; `bend: marks` brushed aside by passers-by), `ivy(walls)` grown over meshes, `weeds({ lines, walls })` in cracks; `building({ style, floors })`; `relief(mesh)` a material's bumps (roof tiles, bark, stone) as real triangles, built in the background and drawn only as finely as shows; `human(opts)` a sculpted close-up person: face, hands, clothes, hats, kit, armour (`outfit.armour: { chest: 'plate' | 'leather' | 'brigandine', shoulders, arms, hands, thighs, shins, feet }`, swapped at once with `armour.wear(part, kind)`; helms `nasal`, `kettle`, `sallet`, `great`, `circlet`; tops `gambeson`, legs `hose`), three detail levels, `twin()`, `hold()`, `touch()` (hands and feet onto a rung, a bar, a ledge; the fingers close round what a hand holds by themselves and lie relaxed when it holds nothing), feet that stay where they are put down however you move it (it steps round when turned on the spot, stops in two steps, and its eyes and head go first into a turn: `rig.update(dt, { speed, toward })` says where it means to go; a walk of its own from its body and seed, no two strides alike, slopes, and moods: `rig.manner.mood = 'tired'`), moves that take up the body's speed, and arms, head, pack and belt kit that swing on and settle when it starts, stops or turns (nothing to call; `rig.hang(thing)` for your own slung rifle), and a live face (`person.face`: it blinks and its eyes move by themselves; `look(point)`, `say(text)`, `set('angry', 1)`, `wince()`; no `update()` to call), skin with pores and eyes with a wet cornea close up (nothing to set); several kinds: `human.all([...])` first thing in make(); `person.looks.set({ weight, muscle, age, jaw, chin, cheeks, nose, lips, brow, eyes, lean, skin, hair, height })` changes a person while the game runs (nothing sculpted again) and `looks.mark({ kind: 'scar' | 'tattoo', at: 'cheekL', design })` puts marks on the skin; `new Creator(options, { onSwap })` a character creator (sliders that show at once, picks that remake the person); `creature({ like: 'deer', seed })` an animal or monster from a seed with gaits made for its own legs and wings: 35 to start from (`dog`, `horse`, `owl`, `shark`, `bee`, `spider`, `dragon`, `ogre`, `blob`...; kinds `quad`, `bird`, `fish`, `insect`, `monster`), `move(dt, speed, { fly })` each frame, `speeds`, `rig.play('eat')`, `twin()` for a herd, `creature.all([...])` first thing in make(); `fur(mesh, { length, kind: 'fur'|'hair', where, lean })` fur or hair in layers on any mesh, no texture files; creatures with a coat of fur wear it by themselves close up (`creature.fur.length = 1.5` stands it on end; `fur: false` leaves it off) and people's beards are strands, `beard: 0..1.5` (`person.hair`; `strands: true` for their hair too, `strands: false` for none), and a real face's hair is single strands on WebGPU close up that curl by `hairTexture: 'straight'|'wavy'|'curly'|'coily'` (by heritage if left out; `hairStyle: 'afro'`); `weapon('rifle'|'pistol'|'shotgun'|'bat'|'sword'|'axe'|'spear'|'shield'|'bow'|...)` a weapon made in code (shields in `style` round, heater, kite; a bow's `pull(k)`, `load(arrow)`) with `points` (grip, fore, muzzle, eject), `weapon.wield(person)` then `held.update(dt, { how: 'aim'|'ready'|'hip'|'low'|'slung'|'none', pitch, yaw })` each frame after rig.update(): both hands on it, the stock in the shoulder; `vehicle('car'|'truck'|'tank'|'train'|'boat'|'plane', { style, seed, colour, finish })` a vehicle with no model files, its nose along -z: 31 styles (`vehicle.kinds`: `jeep`, `pickup`, `tanker`, `heavy`, `steam`, `coach`, `rowboat`, `patrol`, `biplane`, `jet`...), `move(dt, speed, { steer })` each frame rolls and steers its wheels, runs its tracks and spins its propellers, `aim(turn, lift)` a turret, `points.driver` / `muzzle` / `exhaust`, `car.chassis()` for `World3D.vehicle`, cars that hold up close (seats behind see-through glass, flaked paint; `dirt(v)`, `wet(v)`, `hit(point, { power })` dents and broken glass that falls to the road, `update(dt)`, `damage`, `mend()`), a train's `cars: ['van', { style: 'open', load: 'coal', colour }, 'guard']` (loads `tarp`, `coal`, `crates`; `deflectors: true` on a steam engine, `polished: false` a working one with nothing bright) and `along(track, d)`, or `fuse: true` for a train that keeps to a straight line in a third of the draws, `twin()`); guide in `docs/nextgen-3d.md`.

Vehicles: boats (`rowboat`, `motor`, `fishing`, `patrol`, `police`) have seats to stand or sit at (`helm`, `seat`, `passenger`, `deck`) that `enter(person, { from: 'water' })` boards from a dock or by climbing out of the water and `exit(seat, { to })` leaves onto a dock, a shore or into the water; boats and helicopters wear and wreck like cars (`harm`, `blow`, `engine`): a helicopter's rotor flies off, a boat burns and sinks (`sinking`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ModelsPart`, line 4997), where every option and field is described.

- `material(name: string, o?: { colour?: string; color?: string; wear?: number; seed?: number; repeat?: [number, number]; size?: number; depth?: number; closeUp?: boolean…` A material from a recipe: 'wood' | 'planks' | 'bark' | 'brick' | 'stone' | 'cobbles' | 'tiles' | 'concrete' | 'metal' | 'rust' | 'paint' (worn paint on metal: chips to the undercoat, stains, rust runs) | 'hull'… (:4999)
- `readonly materials: readonly string[]` The recipe names. (:5001)
- `wear<M = Loose>(mesh: M, o?: { edges?: number; edgeColour?: string; dirt?: number; dirtColour?: string; ground?: number; moss?: number; mossColour?: string; snow?: num…` Ages a mesh in place (and returns it), from its own shape: outer edges rubbed lighter, creases and the part near the ground grimy, moss or snow on what faces up. (:5003)
- `prop(name: 'crate' | 'barrel' | 'drum' | 'pallet' | 'table' | 'chair' | 'bench' | 'shelf' | 'lamp' | 'fence' | 'sign' | 'bucket' | 'sack' | 'chest' | 'cone' | 'bin' | …` An everyday thing built in code from the recipes and aged with wear(): a Group (one mesh per material), foot at y = 0, facing +z. (:5005)
- `readonly props: readonly string[]` The prop names. (:5007)
- `sculpt(shapes: SculptShape[] | ((x: number, y: number, z: number) => number), o?: { blend?: number; res?: number; bounds?: [[number, number, number], [number, number, …` A mesh from soft shapes melted together or carved away, made with surface nets: each { ball: r } | { box: [w, h, d], round } | { cylinder: [r, h], round } | { torus: [R, r] } | { cone: [r, h] } | { capsule: [[x, y,… (:5009)
- `tree(kind?: 'oak' | 'ash' | 'aspen' | 'pine' | 'bush' | 'palm' | 'fan' | 'banana' | 'fern' | 'taro' | 'cypress' | 'reeds' | 'flowers' | 'lily', o?: { size?: 'small' | …` A tree or plant grown in code with the bark recipe and leaves drawn in code that sway and glow with the sun behind. (:5020)
- `ivy(targets: Loose, o?: { seed?: number; roots?: number; from?: [number, number, number][]; length?: number; size?: number; density?: number; up?: number; leaves?: str…` Ivy grown over meshes (walls, a house, a stump, a statue; their world places as they are now): vines start at the foot of steep faces (or from: points) and climb, keeping to the surface, branching out sideways, going… (:5028)
- `weeds(o?: { lines?: ([number, number] | [number, number, number])[][]; walls?: Loose; spots?: number[][]; ground?: (x: number, z: number) => number; gap?: number; heig…` Weeds where nobody weeds, in one InstancedMesh (one draw): along cracks and kerbs (lines: [[[x, z], ...], ...] or points with y), at the foot of walls (walls: meshes; where their steep faces meet the ground) and at… (:5033)
- `readonly trees: readonly string[]` The tree and plant kinds. (:5035)
- `building(o?: BuildingOptions): Loose` A close-up building from a shape grammar: floors split into bays, each a real window opening (frame, glass set back, sill) or the door; string course, cornice, flat roof with parapet or gable roof; recipe materials,… (:5037)
- `readonly looks: readonly LookShape[]` The shapes person.looks can set. (:5046)
- `readonly CREATOR_SLIDERS: readonly CreatorSlider[]` (:5047)
- `readonly CREATOR_PICKS: readonly CreatorPick[]` (:5047)
- `fort(o?: { kind?: 'wall' | 'tower' | 'gate'; length?: number; height?: number; thick?: number; radius?: number; width?: number; roof?: boolean; colour?: string; color?…` (:5048)
- `readonly forts: readonly string[]` The castle pieces fort() makes. (:5050)
- `readonly buildings: Record<string, Record<string, Loose>>` The building styles (copy one and change it: { ...gs.models.buildings.brick, bay: 3 }). (:5052)
- `relief: { <M = Loose>(target: M, o?: false | { depth?: number; fine?: number; coarse?: number; error?: number; maxTris?: number; height?: Loose; mid?: number }): M; /*…` Real surface detail for a mesh (or every mesh under a group): the bumps its material only paints (the height layer of pbr({ tex: surface() }) or gs.models.material(): roof tiles, mortar, bark) made into real… (:5058)
- `human: { (o?: { look?: 'clean' | 'real'; seed?: number | string; age?: number; weight?: number; muscle?: number; sex?: 'm' | 'f'; heritage?: 'african' | 'east-asian' |…` A person to see up close, sculpted in code (a face with eyes, hands with fingers, clothes cut and worn, hats, webbing, a pack; creases in soft shadow, no texture files), on gs.poses' skeleton in three levels of detail. (:5089)
- `fur: { (mesh: Loose, o?: FurOptions): FurCoat; /** The geometry a coat's layers share, by itself (hand it to several coats as `shell`). */ shell(geometry: Loose, o?: F…` Fur or hair on any mesh, in layers: copies of the surface pushed out along its normals, each cut by one picture of strands made in code, so strands seem to stand in the coat. (:5109)
- `creature: { (o?: CreatureOptions): CreatureT; /** The kinds: 'quad', 'bird', 'fish', 'insect', 'monster'. */ readonly kinds: readonly string[]; /** Every animal a crea…` An animal or a monster made in code from a seed, sculpted the way gs.models.human is (no model or texture files): one skinned mesh in three levels of detail on a skeleton of its own, with gaits made for its own legs,… (:5126)
- `vehicle: { (kind: 'train', o?: VehicleOptions): TrainT; (kind?: 'car' | 'truck' | 'tank' | 'bus' | 'bike' | 'boat' | 'plane' | 'helicopter', o?: VehicleOptions): Vehic…` A vehicle made in code (no model or texture files): a shell skinned over cross-sections from a few measures, in paint, glass, chrome and rubber, aged, with the parts that turn on their own pivots. (:5149)
- `weapon(kind?: WeaponKind, o?: { finish?: string | null; seed?: number; shadows?: boolean; style?: 'round' | 'heater' | 'kite' | null }): Loose & { points: Record<'grip…` A weapon made in code (no model files), our own designs: 'pistol' | 'revolver' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'launcher' | 'grenade' | 'bat' | 'pipe' | 'wrench' | 'baton'. (:5161)
- `readonly weapons: readonly WeaponKind[]` The weapons there are. (:5164)
- `Wield: new (person: Loose, weapon: Loose) => Wield` A weapon in someone's hands: weapon.wield(person) or new Wield(person, weapon). (:5166)
  - `person: Loose` (:4964)
  - `gun: Loose` (:4964)
  - `how: string` (:4964)
  - `ease: number` (:4964)
  - `muzzle: Loose` Where shots leave (world) and the way it points (a thing swung: along its length). (:4965)
  - `dir: Loose` (:4965)
  - `update(dt: number, o?: { how?: 'aim' | 'ready' | 'hip' | 'low' | 'slung' | 'none'; pitch?: number; yaw?: number; hands?: boolean; keep?: boolean }): Wield` keep: false lets it go into its holder and walls (by default it is turned about the grip out of both: gs.characters.Solid). (:4967)
  - `readonly turned?: number` How far it was turned out of the body or a wall this frame (radians). (:4968)
  - `drop(): Loose` Takes it off the person: the weapon. (:4969)
- `curvature(geometry: Loose): { curve: Float32Array; up: Float32Array }` Per-vertex curvature of a geometry (convex > 0, concave < 0) and how much each vertex faces up. (:5168)

## From the maker kit

From [3D physics](../maker-kit.md#3d-physics):

- A `vehicle()` whose mesh is a `gs.models` vehicle dents, cracks its glass and breaks its lamps where it hits
  things by itself (`dents: false` to do your own).

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

From [Carried and drawn](../maker-kit.md#carried-and-drawn):

`const { Carry } = gs.characters;` Things worn on the body until they are wanted: a sword at the hip, a
greatsword or a bow across the back, a shield slung behind, a quiver, a dagger at the belt (or a torch, a
tool). One for each person with a rig (`gs.models.human()` best: its hand closes round the grip).

```js
const kit = new Carry(hero);
kit.add('sword', swordMesh, 'hipL', { sheath: true });       // its grip at its origin, its blade up its +y
kit.add('shield', shieldMesh, 'shield');                      // flat on the back, face out
kit.on('grab', e => sounds.slash());
kit.draw('sword');                                            // the right hand goes to the hilt and brings it round
hero.rig.update(dt); kit.update(dt);                          // after the rig, each frame
kit.held('R');                                                // 'sword' once it is in hand; kit.sheathe('sword') puts it back
```

Spots: `hipL`, `hipR`, `back`, `backL`, `shield`, `quiver`, `bow`, `belt`, or your own `{ bone, at, dir,
face, hand }` (in the person's own space as they stand). `grip`, `along`, `face` say how a thing of your own
is made; `held` how the hand holds it if the usual grip doesn't suit it; `set(name, 'hand')` with no reach.
A `gs.models.weapon` brings all that with it: `kit.add('shield', gs.models.weapon('shield', { style: 'heater' }), 'shield')`
goes to the left hand held by its grip, a bow too, and a spear, a staff or a longsword has the other hand on it once drawn
(`both: false` for one hand).

From [A body that stays out of walls](../maker-kit.md#a-body-that-stays-out-of-walls):

`const { Solid } = gs.characters;` The body of a posed person (a `gs.models.human`, a `gs.poses` person or a figure)
as rods on the trunk, thighs, seat, shins and arms and a ball for the head, that follow the bones, for a body your
game poses or plays clips on (a fall acted from a clip, a man leaning on a wall) rather than one a ragdoll moves:

```js
body = new Solid(man);                                   // finds the game's World3D, or { world }
body.room({ x: 0, z: -1 }, 1.8);                         // how far he can go down that way before a wall, a kerb, a cart (0..1.8)
update(dt) { man.rig.update(dt); const k = body.keepOut({ up: false, most: .12 }); if (k) { x += k.x; z += k.z; } }   // moved out of the walls
body.keepOff(rifle, { pivot: grip, local: true });       // a thing he holds turned about its grip until it is out of his body
```

`keepOut()` looks at each rod against the world's still things and moves the whole body out of them by the
smallest move (it never pushes down; `up: false` keeps it on the ground; `most` is the most it moves in one go) and
gives back the move it made, or null. `room(dir, length)` sweeps a ball at shin and hip height from the hips that
way. `keepOff(thing, { pivot, local, ahead })` turns something held about the pivot until it is clear of the
body's rods and of the world's walls (`walls: false`: the body alone; `ahead: true`: only the longer side of the
pivot, so a stock in the shoulder may touch); `weapon.wield()` does this by itself.

From [Game kits](../maker-kit.md#game-kits):

**Vehicles** (`gs.vehicles`): `Car` (top-down) and `Kart` (3D) are arcade handling without a physics
engine: grip, slides, a drift you hold for a boost, surfaces (`surface: .1` is ice), hops and ground
following. `Laps(checkpoints)` counts laps, places racers and gives computer drivers somewhere to aim.
For real suspension and cars that can roll over, `World3D.vehicle(mesh, { wheels })` in
`gs.physics3d` uses Rapier's ray-cast vehicle: `car.drive(throttle, steer, brake)`, `car.speed`,
`car.upsideDown`, `car.rightUp()`.
These are how a car handles; what it looks like is yours, or `gs.models.vehicle('car')`:
[Vehicles made in code](#vehicles-made-in-code).

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

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

More in docs/maker-kit.md: "Action and adventure kits", "Buildings that come apart", "Weather that changes the world", "Ground that takes marks", "Cloth in the wind", "Vehicles made in code", "Fur and hair", "Towns that live", "People who change, and a character creator", "Companions", "Mounts".

## In real games

1 game uses it (`node scripts/examples.mjs gs.models` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { shatter } = gs.destruction;
const { human, vehicle } = gs.models;
// …
  COLLECT = [];
  human.need(looksOf(LOOKS.both));   // the people first: if this phone hasn't sculpted them yet the app waits here, before anything else is built (ea
// …
  R.part('m1', r => {
    human.need(looksOf(LOOKS.m1));
// …
    // tops with its nose along -z; the line runs along x, and the van Wren rides out on is TRAIN.W1 from train.x
    const tr = WD.rail = vehicle('train', { style: 'steam', colour: '#1d1e20', deflectors: true, lit: true, gauge: 1.365, fuse: true, polished: false,
// …
  // dusk: Sgt. Rook and Hale's squad (their faces are sculpted now, the first time on this phone)
  R.part('m2', () => { human.need(looksOf(LOOKS.m2)); });
// …
// the first of each face of a kind, made together the first time one of them is needed
const folk = kind => PEOPLE[kind] ||= human.all(PEOPLE_SPEC[kind]);
```
