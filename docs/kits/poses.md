# gs.poses

Jointed 3D people: figures, skinned people with faces, blend spaces, foot IK, key-pose actions.

`gs.poses` (`figure`, `person` skinned with a face, `Rig` with `blend`/`blend2` blend spaces and `plant` foot IK, `LIFELIKE` strides whose feet don't slide, `keys([...])` key-pose actions; `GESTURES` every figure knows: `rig.play('nod' | 'shake' | 'bow' | 'shrug' | 'point' | 'cheer' | 'laugh' | 'think' | 'beckon')`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PosesPart`, line 4260), where every option and field is described.

- `POSES: Record<string, Loose>` (:4261)
- `GESTURES: Record<'nod' | 'shake' | 'bow' | 'shrug' | 'point' | 'cheer' | 'laugh' | 'think' | 'beckon', Loose>` Gestures every rig has, played once from standing at ease: rig.play('nod'): nod, shake, bow, shrug, point, cheer, laugh, think, beckon. (:4263)
- `Between: new () => Loose & { of: Loose | null; home: Loose | null; out: [number, number, number] | null }` A joint in between (a person's shoulders, elbows, hips and knees: bones.elbowL...): a bone that takes half of another joint's turn by itself whenever the skeleton is worked out, for the skin round the joint to go… (:4265)
- `Bulge: new () => Loose & { of: Loose | null; home: Loose | null; out: [number, number, number] | null; size: number }` A muscle that bulges (a person's biceps: bones.bicepL...): a bone that moves out from its place as another joint bends (of), by out (metres) at a right angle's bend times size, for the skin over it to swell. (:4267)
- `LIFELIKE: Record<string, Loose>` Lifelike idle, walk, jog, run, sprint and sneak for a figure with feet and hands (heel strike, push off the toes, planted feet that don't slide): new Rig(parts, { poses: LIFELIKE, weight: 1 }). (:4269)
- `keys(list: [number, Record<string, number[] | number>][], o?: { loop?: boolean }): (phase: number) => { j: Record<string, number[]>; drop: number; shift?: number[] }` A pose that moves through key poses on curves that never overshoot, for rig.add(): keys([[0, { spine: [.2, 0, 0] }], [.4, { armL: [-1, 0, 0], drop: .1, shift: [0, 0, .2] }], [1, {}]]). (:4271)
- `mirror(fn: (phase: number) => Loose): (phase: number) => Loose` A pose function mirrored, left for right: rig.add('waveL', mirror(rig.poses.wave.cycle)). (:4273)
- `Rig: new (parts: Loose, o?: { fade?: number; height?: number; poses?: Record<string, Loose>; weight?: number; size?: number; full?: boolean; joints?: string[]; body?: …` parts: the joints (hips, spine, head, arms, legs; hands and feet too if the figure has them). (:4275)
  - `state: string` (:4166)
  - `readonly done: boolean` True once a pose added with { once: true } has played through (it then holds its last frame). (:4168)
  - `phase: number` How far through its cycle the pose is, 0..1 (blendPhase: the same for a blend space: footsteps fall at 0 and .5). (:4170)
  - `blendPhase: number` (:4170)
  - `weight: number` Lean and bank (0: none; 1: a person): the body tips into a change of speed and into a turn (update's speed and turn). (:4172)
  - `play(name: string, o?: { fade?: number; at?: number | null; from?: number | null; again?: boolean }): RigT` Blends to a pose. at: where in the pose it stands (0..1), for a pose the game drives itself (call each frame); from: where it starts; again: start a playing pose over. (:4174)
  - `upper(name: string | null): RigT` (:4174)
  - `pace(name: string): { rate: number; per: number; once: boolean } | null` How a pose moves on: rate: cycles a metre (walks and runs; 0 for the rest), per: cycles a second (0: it stands still), once: it plays through and holds. (:4176)
  - `add(name: string, fn: Loose, rate?: number | { time?: number; once?: boolean; rate?: number; ground?: boolean; stance?: number }): RigT` Your own pose: fn(phase 0..1) => { j: { joint: [x, y, z] }, drop, shift: [x, y, z] metres }. (:4178)
  - `blend(space: Record<string, number>, v: number): RigT` 1D blend space: { pose: value }, mixed at v with every cycle in step. (:4180)
  - `blend2(space: Record<string, [number, number]>, x: number, y: number): RigT` 2D blend space: { pose: [x, y] }, mixed at (x, y). (:4182)
  - `plant(ground: (x: number, z: number) => number, body: Loose, o?: { most?: number }): RigT` Foot IK after update(): feet on the floor at ground(x, z); body is the character. (:4184)
  - `fill(pose?: Record<string, number[]> | null): RigT` A full skeleton (gs.models.human's): brings the joints in between into line (the waist with the rib cage, the neck with the head, a collar bone with each arm, the forearm's skin with the hand). (:4193)
  - `fine?: boolean` A full skeleton: false leaves the forearm's turn and the toes alone (a person seen from further off sets it by itself: person.lod, see()). (:4195)
  - `breath?: BreathT` A gs.models.human person's breathing and soft flesh (the same as person.breath); update() steps it. (:4197)
  - `grime?: GrimeT` A gs.models.human person's wet, mud, dust and snow (the same as person.grime): drawn on WebGPU. (:4199)
  - `idle?: IdleT` A gs.models.human person standing about: fidgets, the head after the eyes, glances, gestures (the same as person.idle). (:4201)
  - `steps?: boolean` Steps that are really taken (gs.models.human people; on by itself): in the poses that stand on the ground (the lifelike walks and runs, standing easy, and your own added with { ground: true }) a foot stays where it… (:4210)
  - `readonly stride?: { readonly feet: { readonly down: boolean; readonly landed: boolean }[]; plan: boolean } | null` The feet as they stand (people with steps): feet[0] the left, feet[1] the right; landed is true on the update a foot touches the ground (a footstep sound), down while it stands. (:4217)
  - `readonly lead?: { amount: number; reset(): void } | null` The eyes and the head go first into a turn (gs.models.human people; on by itself): the eyes flick round, the head follows, then the rib cage, and the hips and feet come last. (:4224)
  - `manner?: { mood: string | Record<string, number> | null; side: 'L' | 'R'; amount: number; readonly pace: number; readonly limp: number; reset(): void } | null` A walk of one's own (gs.models.human people; on by itself): from the body (an older person takes shorter, quicker steps, swings the arms less, leans and stands wider; a heavy one walks wider and rolls more; a muscled… (:4235)
  - `momentum?: boolean` Momentum between moves (gs.models.human people; on by itself): a new move begins at once and takes up what the body was doing. (:4242)
  - `readonly follow?: { amount: number; reset(): void } | null` Follow-through (gs.models.human people; on by itself): what the body carries goes on a moment and settles when the game starts it, stops it, turns it or drops it. (:4249)
  - `hang(thing: Loose, o?: { pivot?: [number, number, number]; swing?: number; bounce?: number; stiff?: number; damp?: number; most?: number; away?: [number, number, numbe…` Something that hangs from the body and swings as it moves (a slung rifle, a lantern, a satchel): thing is an Object3D on one of the joints, as it hangs at rest. (:4258)
- `person(o?: { body?: string; skin?: string; legs?: string; shoes?: string; hair?: string | null; eyes?: string; lips?: string; sleeves?: 'long' | 'short'; girth?: numbe…` A skinned person: one smooth mesh over the figure's bones, with a Rig and a Face. (:4277)
- `Face: CharactersPart['Face']` (:4278)
- `shapes: CharactersPart['shapes']` (:4278)
- `visemes: CharactersPart['visemes']` (:4278)
- `FACE_SHAPES: string[]` (:4278)
- `figure(o?: { body?: string; skin?: string; legs?: string; shoes?: string; hair?: string; mat?: (colour: string) => Loose; scale?: number; shadows?: boolean }): Loose` (:4279)

## From the maker kit

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

From [Skinned people, faces and lip sync](../maker-kit.md#skinned-people-faces-and-lip-sync):

`person()` is one smooth mesh over a skeleton (a three.js `SkinnedMesh`): elbows, knees, the waist and
the neck bend like skin, and the whole person is one draw call. It has the same joints as `figure()`,
so the same `Rig` poses drive it. Every 3D style can use it, on WebGL and WebGPU.

```js
const { person } = gs.poses;
hero = person({ body: '#c0392b', skin: '#e0ac69', hair: '#2b1a10', sleeves: 'short', girth: 1, mat: c => pbr(c) });
view.add(hero);                                   // hero.rig, hero.face, hero.mesh, hero.bones

// blend spaces (blend trees): the poses either side of the value, every cycle in step so feet don't slide
hero.rig.blend({ idle: 0, walk: 1.4, run: 4, sprint: 7 }, speed);
hero.rig.blend2({ idle: [0, 0], walk: [0, 1], back: [0, -1], strafeL: [-1, 0], strafeR: [1, 0] }, sideways, forwards);
hero.rig.upper(aiming ? 'aim' : null);            // still layers on top
hero.rig.update(dt, { speed });
hero.rig.plant((x, z) => land.height(x, z), hero); // foot IK: feet on steps and slopes (also works on figure())
hero.rig.play('jump');                            // back to one pose, faded
```

Faces are blend shapes (morph targets): `open`, `wide`, `round` (the mouth), `smile`, `frown`,
`surprise`, `blink`. `Face` eases them, blinks by itself and moves the mouth to speech:

```js
hero.face.say('Over here!', { pitch: 1.2 });     // speaks with gs.sound.say; the mouth follows the words
hero.face.set('smile', 1);                        // eases in; set('smile', 0) lets go
hero.face.mouth(mic.level());                     // or a mouth driven by anything (null stops)
hero.face.update(dt);                             // every frame
```

The mouth moves even when the phone is muted, so always show the words on screen too. Your own meshes
can have shapes: `shapes(geometry, { puff: (p, out) => out.set(0, p.y * .2, 0) })`, then
`new Face(mesh).set('puff', 1)` (`const { Face, shapes, visemes } = gs.characters`). `visemes(text)`
gives the mouth shapes over time for a line, for mouths you draw yourself.

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Weapons you can see** (`gs.models` and `gs.fx3d`, Next Gen): `gs.models.weapon('rifle')` is one made in code, our own
designs, a few draws each (the old world's too: `sword`, `longsword`, `dagger`, `axe`, `mace`, `spear`, `staff`,
`shield` in `style` `'round'`, `'heater'` or `'kite'` painted in `finish`, `bow`, `arrow`, `quiver`; held with `Carry`), with `points` for the right hand's `grip`, the left hand's `fore`, the `muzzle`, `eject`,
`sight` and `stock`. `weapon.wield(person)` puts it in the hands of a `gs.models.human`, a `gs.poses` person or a figure:
each frame after `rig.update()`, `held.update(dt, { how, pitch, yaw })` holds it `'aim'` (a long gun's stock in the
shoulder, a pistol out in both hands, pointing where the body faces, turned about the shoulder by the aim), `'hip'`,
`'ready'` (pointing down in front), `'low'` (in one hand at the side), `'slung'` (on the back) or `'none'` (put away),
eased from one to the next, with both hands closed round it; `held.muzzle` and `held.dir` are where shots leave. Things
to swing are held up over the shoulder at `'ready'` and out in front at `'aim'`. `gs.fx3d.Impacts(view)` shows where shots
land, by what they hit: `fx.hit(worldRayHit, { from })` throws sparks off metal, dust and chips off stone, splinters off
wood, glints off glass, a spray of dirt, sand or snow, a splash on water, a puff off cloth and people (no blood) and
leaves a mark on the surface, with its sound; what was hit is read from the mesh as `Foley` reads it (or
`{ surface: 'metal' }`). `fx.muzzle(at, dir, { kind })` is a flash that lights the scene and a wisp of smoke;
`fx.shell(held.gun.points.eject, { kind })` throws a spent case out to the right that bounces on the world with a tinkle.
`fx.update(dt)` each frame, `fx.clear()` in `reset()`. On WebGPU marks don't show on see-through things (glass).
A held weapon never goes through the one holding it: each `held.update()` turns it about the grip, as little as it
takes, until it is clear of the holder's body (and of the walls of the game's `World3D`, when there is one), so a rifle
held across a man who turns lies along him rather than through his chest (`held.turned`: how far it was turned this
frame; `keep: false` to hold it exactly as posed).

**Melee in 3D** (`gs.fight`): `Melee(body, { react })` is one person's fists and feet in a 3D world, in frames like the
2D `Fighter` but with a reach, an arc in front and a height where 2D has boxes. `attack('light')` (jab, cross, hook,
uppercut: pressed again in time they chain into a combo, and a press a moment early still counts), `attack('heavy')`
(a kick, a knee), `attack('low')` (a sweep that trips), `attack('push')` (a shove the guard can't stop), `block(held)`
(stops what comes from in front, not from behind), `dodge({ x, z })` (a quick step nothing can hit for most of).
`update(dt, foes)` locks on to the foe in front, turns and steps in to bring the blow into reach (`walk`, `facing`),
and returns what landed: `{ who, damage, blocked, at, push, knock, trip }`. A foe that is a `Melee` gets hit stun and
loses `hp`; one with `react` (a `gs.characters.Reactions` on its body) staggers, trips or falls for real. `pose` and `at`
go to `rig.play(m.pose, { at: m.at, fade: .06 })` (gs.poses has `guard`, `jab`, `cross`, `hook`, `uppercut`, `kick`,
`knee`, `sweep`, `shove`, `stagger`, `dodgeL`, `dodgeR`, `dodgeBack`, and with a bat `swing`, `backhand`, `overhead`).
`moves: SWINGS` with `weapon: { reach, damage }` for a bat, a pipe or a stick. `Brawler({ skill })` is a ready-made
foe: `think(dt, me, foe)` gives `{ walk, face, attack, block, dodge }`: it closes in, circles, throws combos when you
are open, blocks or steps out of what it sees coming no faster than a person, and backs off when hurt.

More in docs/maker-kit.md: "Action and adventure kits", "Vehicles made in code".

## In real games

1 game uses it (`node scripts/examples.mjs gs.poses` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { human, vehicle } = gs.models;
const { keys } = gs.poses;
// …
  const TOP = 33, FLOOR = 10.7, RAIL = 11.8, Y_END = ((TOP - 1) / 2 - LEAD) * 2 * GAP, OVER = 1.8;
  const track = pts => { const f = keys(pts.map(([t, v]) => [t, { v }])); return t => f(t).j.v; }, fy = n => n * GAP + .03 - FLOOR, E = ladder(Y_END, 
// …
  const poses = {
    topout: [keys([
// …
    // or leg out to his left turns +z, to his right -z.)
    fallBack: [keys([
// …
    ]), { time: 1.05, once: true }],
    fallFront: [keys([
// …
    ]), { time: 1.05, once: true }],
    fallRight: [keys([
// …
    // a round cracks past: he ducks his head into his shoulders, half down, and looks for where it came from
    flinch: [keys([
// …
    // The zip line. Under the bar with both hands on it: a look down the line, he sinks, then springs and his knees come up
    zipReady: [keys([
```
