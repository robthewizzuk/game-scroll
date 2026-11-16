# gs.fx3d

3D text, 3D particles (fire, smoke, sparks, booms), impacts, outlines, glitch, trails.

`gs.fx3d` (lazy): `text3d()`, `Particles3D` (`fire`, `smoke`, `sparks`, `boom`, `magic`, `snow`), `Impacts(view)` (`hit(rayHit)` sparks, dust, splinters, glints, splashes and a mark by what was hit (no blood), `muzzle(at, dir)`, `shell(eject)` cases that bounce), `outline`, `glitch`, `trails`, `focus`, `pixelate`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Fx3dPart`, line 1792), where every option and field is described.

- `text3d(str: string, o?: { size?: number; color?: Loose; font?: 'regular' | 'bold' | 'pixel' | FontName | [FontName, number]; align?: 'left' | 'center' | 'right'; outli…` Sharp text inside the 3D world: scores over heads, signs, labels. (:1798)
- `Particles3D: new (scene: Loose, o?: { seed?: number | null; lights?: boolean }) => { /** Your own effect: life, speed and size are [min, max]; colors [from, to]; rate …` Particle effects for one scene: fx = new Particles3D(view.scene), then fx.update(dt) every frame. (:1800)
- `Impacts: new (view: Loose, o?: { particles?: Loose; marks?: boolean; holes?: number; sounds?: boolean; cases?: number; link?: boolean }) => { /** hit: a World3D ray's …` What a shot does where it lands and what a gun throws out: hits that look and sound of what was hit (sparks off metal, dust and chips off stone, splinters off wood, glints off glass, dirt, sand, a splash on water, a… (:1820)
- `outline(view: Loose, objects: Loose[], o?: { color?: Loose; hidden?: Loose; strength?: number; thickness?: number; pulse?: number }): { selectedObjects: Loose[]; edgeS…` A glowing edge round things (Next Gen views). (:1833)
- `glitch(view: Loose, o?: { wild?: boolean }): { goWild: boolean; remove(): void; [k: string]: Loose }` A digital glitch (Next Gen views): const g = glitch(view); a moment later g.remove(). (:1835)
- `trails(view: Loose, damp?: number): { damp: number; remove(): void; [k: string]: Loose }` Motion trails (Next Gen views). (:1837)
- `focus(view: Loose, o?: { focus?: number; aperture?: number; maxblur?: number }): { focus: number; remove(): void }` Depth of field (Next Gen views): things `focus` units away are sharp. (:1839)
- `pixelate(view: Loose, size?: number): { size: number; remove(): void; [k: string]: Loose }` Big chunky pixels (Next Gen views). (:1841)
- `loadFx3d(): Promise<Loose>` (:1842)

## From the maker kit

From [3D extras](../maker-kit.md#3d-extras):

`const { text3d, Particles3D, outline, glitch, trails, focus, pixelate } = gs.fx3d;` (make them in
`make()` or `reset()`: they load first).

- `text3d('PLAYER 1', { size, color, font, outline, outlineColor, align, maxWidth, face: true })`:
  sharp text in the 3D world at any size and distance, in any 3D style. `font` is `'bold'`, `'regular'`,
  `'pixel'` or any `gs.fonts` name (`'Bangers'`, or `['Fredoka', 700]` for a weight); `size` is the height
  of a capital letter in world units and `outline` a width in the same units; `maxWidth` wraps at
  spaces; `face: true` always faces the camera. Change `label.text = 'NEW'` (or `color`, `size`...) and
  call `label.sync()`; `label.width` and `label.height` say how big it came out. (Each letter is kept as
  a distance field made on the phone with [TinySDF](https://github.com/mapbox/tiny-sdf), so one small
  picture per font serves every size.)
- `fx = new Particles3D(scene)`, then `fx.fire(pos)`, `fx.smoke(pos)`, `fx.magic(pos)`, `fx.snow(pos)`
  (keep going: `.stop()`, `.remove()`, `.at(pos)`) and `fx.boom(pos)`, `fx.sparks(pos)` (one-off), or
  your own with `fx.make(pos, { life, speed, size, colors, rate, burst, shape, gravity, glow... })`.
  Call `fx.update(dt)` every frame; `fx.count` is how many are flying. `new Particles3D(scene, { seed: 7 })`
  makes the same particles every time (replays). These are small effects (tens to hundreds of dots,
  moved by the kit and drawn in two draw calls); for thousands, Next Gen has `gs.hd.GPUParticles`.
- Next Gen views only: `outline(view, objects, { color })`, `glitch(view)`, `trails(view, .85)`,
  `focus(view, { focus: 10 })` (depth of field), `pixelate(view, 4)`. Each returns a pass with `remove()`
  whose numbers you can change while it runs (`pass.selectedObjects`, `pass.damp`, `pass.size`).

All of it draws on WebGL and on WebGPU, so none of it changes which one a view uses.

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

**Magic** (`gs.magic`, 2D or 3D): a book of spells, `new Magic({ book })`, and a unit for each who casts
or can be hit, `magic.unit(body, { stats, team, radius, height, hand })` (its `stats` is a `gs.stats`
`Stats` with `hp` and `mana` pools). `unit.cast(name, { dir | at | target })` starts a spell or says why
not (`'mana'`, `'cooling'`, `'busy'`, `'stunned'`, `'silenced'`, `'range'`); `magic.update(dt)` finishes
casts, flies bolts, sets off areas, burns beams, runs the units' Stats on and gives back the frame's
events (`hit` with `damage`, `absorbed`, `statuses`, `reaction`, `push`; `heal`, `shield`, `warn`,
`interrupt`, `dead`...). A spell is data: `kind` (`bolt`, `area`, `beam`, `shield`, `heal`, `buff`),
`element`, `cost`, `cool` and `charges` (gs.stats cooldowns), `cast` (seconds; `still`: moving cuts it
off, `fragile`: a big hit does), `damage`, `heal`, `status`, `push`. Bolts can `homing`, `pierce`,
`chain` (jumps on to the next foe) and `splash`; areas are a `circle`, `cone`, `line` or `ring`, at the
caster, the aimed point or the target, with a `delay` (a warning ring first: `area.part`), lingering
(`for`, `every`) or following the caster (an aura), and `blocks: true` stops foes' bolts at its edge;
beams are held (`channel`, `drain` a second); shields soak up harm (`absorb`) or send bolts back
(`reflect`); heals are at once or `over` seconds. Statuses (`STATUSES`: burn, chill, frozen, shocked,
wet, poison, rooted, weak, silence, slow, regen, haste, might, stoneskin) are gs.stats buffs, so put
them in the Stats' buffs table and saving keeps them; three doses of chill freeze, and they meet
(`REACTIONS`): fire thaws ice for half again, frost freezes the wet, lightning through water stuns,
earth shatters ice, fire flares poison. Targets resist with a `resist.fire` stat (0..1), `armour`
takes half off, and `power` and `castSpeed` stats on the caster count. A wall in the game's physics
world stops bolts by itself; a `push` spell throws loose things and people who react; fire bursts in
the game's smoke. `magic.hit(by, who, name, spell)` lands one of your own (a burning blade, a trap). Draw
from `magic.bolts`, `magic.areas`, `magic.beams`, `magic.zaps`, `unit.casting.part` and `unit.ward`,
or in 3D let `new Looks(magic, particles)` (a `gs.fx3d.Particles3D`) do it: a glow in the hand, bolt
trails with their own light, flashes where they land, rings for areas, sparks along beams, a shimmer
round a ward, motes from a heal.

```js
const { Magic, STATUSES, Looks } = gs.magic, { Stats } = gs.stats;
const BOOK = { firebolt: { kind: 'bolt', element: 'fire', cost: 8, cool: .8, cast: .3, speed: 24, damage: 14, status: 'burn' },
               nova: { kind: 'area', element: 'frost', at: 'self', radius: 4, damage: 8, status: 'chill', cost: 20, cool: 6 } };
magic = new Magic({ book: BOOK }); looks = new Looks(magic, new gs.fx3d.Particles3D(view.scene));
hero = magic.unit(heroMesh, { team: 'hero', stats: new Stats({ hp: { max: 100 }, mana: { max: 60, regen: 6 } }, { buffs: STATUSES }) });
// update(dt): for (const e of magic.update(dt)) if (e.type === 'hit') feel.hit(...); looks.update(dt);
```

More in docs/maker-kit.md: "Smoke and fire that flow", "Vehicles made in code".

## In real games

No game uses `gs.fx3d` yet: the examples above are what there is.
