# gs.characters

Living 3D characters: look at, reach, planted feet, wobble, faces, people who react.

`gs.characters`: `lookAt`, `reach` (two-bone IK), `Carry` (things at the hip or on the back, `draw`n to the hand and `sheathe`d), `Steps` (feet that plant), `Wobble`, `Face` (blend shapes, blinking, lip sync with `say(text)`), `shapes(geo, {...})`, `Reactions(character, { world, mover })` (people who react physically: `hit(push, at)`, `blast`, `trip`, `fall`, `brace`; they flinch, take steps to keep their balance, fall as a ragdoll and get up; steer only while `!react.busy`); ragdolls are `World3D.ragdoll()`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CharactersPart`, line 1861), where every option and field is described.

- `lookAt(obj: Loose, target: Loose | null, dt?: number, o?: { max?: number; up?: number; speed?: number }): Loose` (:1862)
- `reach(upper: Loose, lower: Loose, target: Loose, o?: { pole?: Loose; length?: number; end?: Loose }): boolean` (:1863)
- `Steps: new (o?: { feet?: [number, number][]; stride?: number; lift?: number; time?: number; lead?: number; ground?: ((x: number, z: number) => number) | null }) => { f…` (:1864)
- `Wobble: new (o?: { stiffness?: number; damping?: number }) => { value: number; hit(amount?: number): Loose; update(dt: number): Loose }` (:1865)
- `Face: new (mesh: Loose, o?: { blinkEvery?: number; speed?: number }) => FaceT` Blend shapes on a mesh eased together, blinking by itself, lip sync to gs.sound.say. (:1867)
  - `blinkEvery: number` (:1973)
  - `readonly talking: boolean` (:1973)
  - `set(name: string, amount?: number): FaceT` (:1974)
  - `say(text: string, o?: { pitch?: number; rate?: number; volume?: number; lang?: string }): Promise<boolean>` (:1975)
  - `hush(): FaceT` (:1976)
  - `mouth(level: number | null): FaceT` (:1976)
  - `blink(): FaceT` (:1976)
  - `update(dt: number): FaceT` (:1976)
- `shapes(geo: Loose, fns: Record<string, (p: Loose, out: Loose) => void>): Loose` Adds blend shapes to a geometry: fn sets out to how far each rest point p moves. (:1869)
- `visemes(text: string, o?: { rate?: number }): { t: number; ch: string; open: number; wide: number; round: number }[] & { end: number }` Mouth shapes over time for a line of speech. (:1871)
- `FACE_SHAPES: string[]` (:1872)
- `Reactions: new (body: Loose, o?: ReactionsOptions) => ReactionsT` People who react physically: one for each character on a gs.poses rig (figure(), person(), gs.models.human()). (:1879)
  - `readonly busy: boolean` true while the character is not the game's to steer (staggering, falling, down or getting up). (:1947)
  - `readonly down: boolean` true while it lies on the ground. (:1949)
  - `state: 'steady' | 'stagger' | 'falling' | 'down' | 'rising'` (:1950)
  - `stepped: boolean` true for one frame: a recovery step landed; it hit the ground (impact: metres a second); it is back on its feet. (:1952)
  - `landed: boolean` (:1952)
  - `rose: boolean` (:1952)
  - `impact: number` (:1952)
  - `limp: boolean` (:1953)
  - `steady: number` (:1953)
  - `rest: number` (:1953)
  - `doll: Loose | null` The ragdoll while there is one (parts, part(name), push, hit, drive, relax). (:1955)
  - `hit(push: number[] | XYZ, at?: number[] | XYZ | null): ReactionsT` A blow: push is the change of speed it would give the body (metres a second, world), at a world point (default the chest). (:1957)
  - `blast(point: number[] | XYZ, strength?: number, radius?: number): ReactionsT` Thrown by an explosion at point: strength is metres a second at the centre, nothing at radius. (:1959)
  - `trip(dir?: number[] | XYZ | null): ReactionsT` The legs caught on something: a stumble, or a fall at a run. (:1961)
  - `fall(push?: number[] | XYZ | null, o?: { limp?: boolean }): ReactionsT` Goes down now. limp: nobody in it (knocked out, shot): it stays down until getUp({ revive: true }). (:1963)
  - `brace(from?: number[] | XYZ | null, seconds?: number): ReactionsT` Arms up against something coming from a world point, for some seconds. (:1965)
  - `getUp(o?: { revive?: boolean }): ReactionsT` (:1966)
  - `reset(): ReactionsT` Stands it up at once, steady (a new round). (:1968)
  - `update(dt: number): ReactionsT` Each frame, after rig.update(dt). (:1970)
- `Carry: new (person: Loose, o?: { spots?: Record<string, CarrySpot>; time?: number }) => CarryT` Things carried on the body and drawn to the hand: a sword at the hip, a greatsword or a shield on the back, a quiver, a dagger at the belt. (:1886)
  - `person: Loose` (:1899)
  - `things: Record<string, Loose>` (:1899)
  - `readonly busy: boolean` (:1899)
  - `add(name: string, thing: Loose, spot: string | CarrySpot, o?: { grip?: P3; along?: P3; face?: P3; hand?: 'L' | 'R'; held?: { at: P3; dir: P3; face: P3 }; /** a scabbar…` (:1900)
  - `draw(name: string, o?: { time?: number }): boolean` The hand goes to it, takes it ('grab') and brings it round ('drawn'). (:1903)
  - `sheathe(name: string, o?: { time?: number }): boolean` (:1904)
  - `set(name: string, where: 'hand' | 'spot'): boolean` Straight to the hand or the spot, no reach (a round's start). (:1906)
  - `held(hand?: 'L' | 'R'): string | null` The name of what is in a hand, or null. (:1908)
  - `on(ev: 'grab' | 'drawn' | 'stowed', fn: (e: { name: string; to?: string }) => void): CarryT` (:1909)
  - `update(dt: number): void` (:1910)
  - `clear(): void` (:1911)
- `SPOTS: Record<string, CarrySpot>` Where things are carried: hipL, hipR, back, backL, shield, quiver, bow, belt. (:1888)
- `Solid: new (person: Loose, o?: { world?: Loose | false; pad?: number; head?: boolean; link?: boolean }) => SolidT` A person's body as solid rods (trunk, seat, thighs, shins, arms, head; the ones the cloth goes round), to keep what is posed by hand out of what is solid: acted falls and key poses out of walls (keepOut), the way… (:1895)
  - `person: Loose` (:1915)
  - `readonly rods: SolidRod[]` (:1915)
  - `readonly world: Loose | null` (:1915)
  - `update(): SolidT` The rods where the bones are now. (:1917)
  - `keepOut(o?: { world?: Loose; up?: boolean; most?: number; ground?: boolean; tries?: number }): { x: number; y: number; z: number } | null` Puts the person back out of the world's still things after rig.update() (moves person.position): how far, or null if clear. (:1919)
  - `room(dir: XYZ | { x: number; z: number; y?: number } | number[], length?: number, o?: { world?: Loose; r?: number; heights?: number[] }): number` Metres clear that way ({ x, z } or [x, z]; with y too) from the hips, up to length: for picking which way to go down. (:1921)
  - `keepOff(thing: Loose, o?: { pivot?: XYZ | number[] | null; local?: boolean; from?: XYZ | number[]; to?: XYZ | number[]; r?: number; skip?: string[]; ahead?: boolean; w…` Turns a held thing about pivot as little as it takes to get it out of this body (but the parts in skip) and out of walls: the turn made (radians). (:1923)
  - `bounds(pad?: number): { lo: XYZ; hi: XYZ }` The box round every rod. (:1925)

## From the maker kit

From [Living characters and ragdolls](../maker-kit.md#living-characters-and-ragdolls):

`const { lookAt, reach, Steps, Wobble } = gs.characters;` Motion for characters you build from parts
(groups with their origins at the joints, limbs hanging down their own -y, facing +z).

```js
lookAt(guard.head, hero.position, dt, { max: 1.1 });          // null looks ahead again
reach(thigh, shin, steps.feet[0].pos);                        // two-bone IK: bends the knee
steps = new Steps({ feet: [[-.15, 0], [.15, 0]], stride: .45, ground: (x, z) => 0 });
steps.update(dt, hero);                                       // feet[i].pos, .lifting, .landed (footstep sound)
wobble.hit(1); wobble.update(dt); body.rotation.x = wobble.value * .4;   // springy hit reaction
```

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

From [People who react](../maker-kit.md#people-who-react):

`const { Reactions } = gs.characters;` One for each character with a rig. It decides nothing about your
game: you tell it what happened to the body, and it moves the body the way a body moves.

```js
react = new Reactions(hero, { world: phys, mover });   // world: falls are a real ragdoll; without one they are acted
update(dt) {
  if (!react.busy) { /* steer hero as usual */ }
  hero.rig.update(dt, { speed }); react.update(dt);    // every frame, after the rig
  if (react.stepped) sounds.step(); if (react.landed) feel.land(x, y);   // true for one frame each
}
react.hit([0, 0, -2.5], bullet.point);    // a change of speed (metres a second, world) at a world point
react.blast(bomb.position, 9, 6);         // strength at the centre, radius
react.trip();                             // legs caught: a stumble, or a fall at a run
react.fall(null, { limp: true });         // knocked out or shot: stays down until react.getUp({ revive: true })
react.brace(grenade.position, .8);        // arms up against something coming
```

- **How hard decides what happens.** A light blow only makes the part it landed on give (a head snaps back, a
  shoulder turns, a knee buckles). A harder one sets the body **staggering**: it takes real steps to get its
  feet back under its weight, as many as it needs, and you have it back when it is steady. Harder still, a
  blow to the legs, too many steps, or no ground where the next step must go (a ledge), and it **falls**:
  a ragdoll that throws its arms towards the ground, lands (`react.landed`, `react.impact` in metres a
  second), lies a moment (`rest`, default 1.4 s), and **gets up** from its front or its back, facing the way
  a person getting up from there would.
- `react.state` is `'steady'`, `'stagger'`, `'falling'`, `'down'` or `'rising'`; `react.busy` is true for all
  but the first; `react.down` while it lies. `react.reset()` in `reset()` stands it up at once.
- `steady: 2` is a brute who shrugs off what fells a person; `.5` someone already hurt. Change `react.steady`
  as health drops.
- With `world` it also puts its hands out against a wall it is about to run into, and is knocked back off it
  at a run (`walls: false` turns that off; `level` is what counts as a wall, as for `gs.sound.Ears`).
  `ground: (x, z) => height` for uneven floors and edges (the height of whatever is down there; `-Infinity` for a pit).
- With `mover` (the `phys.mover()` that walks the character) a stagger stops at walls, the mover stands aside
  while the body is down so nothing bumps into an empty capsule, and it is put back where the body gets up.
- Without `world`, falls are acted (forwards onto the hands or back onto the seat) and the body gets up the
  same way. On a desktop a falling body measured about a tenth of a millisecond a frame, physics and all, and
  one standing a few hundredths (not yet measured on a phone).

More in docs/maker-kit.md: "Skinned people, faces and lip sync", "Action and adventure kits", "Vehicles made in code".

## In real games

1 game uses it (`node scripts/examples.mjs gs.characters` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { World3D } = gs.physics3d;
const { Solid } = gs.characters;
// …
  }
  const solidOf = m => m.userData.solid ||= new Solid(m, { world: phys });
```
