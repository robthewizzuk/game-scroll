# gs.magic

Spells with casts, mana and cooldowns: bolts, areas, beams, wards, heals and statuses that meet.

`gs.magic` (`Magic({ book })` spells: `unit(body, { stats, team }).cast(name, { dir | at | target })`; bolts that home, pierce, chain and splash, areas that warn, linger or follow, beams, wards that soak or reflect, heals; mana and cooldowns through `gs.stats`; `STATUSES` that meet (`REACTIONS`: fire thaws ice, frost freezes the wet); `Looks(magic, particles)` for 3D)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`MagicPart`, line 2746), where every option and field is described.

- `Magic: new (o?: { book?: Record<string, Spell>; statuses?: Record<string, StatBuff>; reactions?: { name: string; has: string; by: string; clear?: string[]; add?: strin…` book: { name: Spell }; statuses (STATUSES), reactions (REACTIONS), gcd, gravity, world (a World3D or 2D Physics; found by itself; false none), apply (false: only say who was hit). (:2748)
  - `book: Record<string, Spell>` (:2656)
  - `units: MagicUnit[]` (:2656)
  - `gcd: number` (:2656)
  - `apply: boolean` (:2656)
  - `world: Loose` (:2656)
  - `readonly t: number` (:2656)
  - `bolts: { x: number; y: number; z?: number; v: P3; size: number; spell: Spell; name: string; by: MagicUnit; team: string | number; target: MagicUnit | null; id: number }[]` Bolts in flight: { x, y, z, v, size, spell, name, by, team, target }. (:2658)
  - `areas: { x: number; y: number; z?: number; shape: string; radius: number; angle: number; width: number; inner: number; dir: P3 | null; part: number; live: boolean; lef…` Areas: { x, y, z, shape, radius, angle, width, dir, part (how far through its warning), live, left (seconds it lingers) }. (:2660)
  - `beams: { by: MagicUnit; name: string; spell: Spell; from: P3; to: P3 | null; hit: MagicUnit | null }[]` (:2661)
  - `zaps: { from: P3; to: P3; element: string; life: number }[]` A chain's jumps, fading: { from, to, element, life }. (:2663)
  - `events: MagicEvent[]` (:2664)
  - `unit(body: Loose, o?: { stats?: Stats; team?: string | number; radius?: number; height?: number; hand?: Loose; facing?: number | (() => number); thing?: Loose; book?: …` (:2665)
  - `remove(u: MagicUnit): this` (:2666)
  - `clear(): this` (:2666)
  - `on(type: MagicEvent['type'] | 'any', fn: (e: MagicEvent) => void): this` (:2667)
  - `update(dt: number, o?: { stats?: boolean }): MagicEvent[]` Casts finish, bolts fly and hit, areas go off and tick, beams burn, the units' Stats run on. (:2669)
  - `hit(by: MagicUnit | null, who: MagicUnit, name: string, spell: Partial<Spell>, at?: P3, push?: P3 | null): MagicEvent` One spell landing on one unit (your own: a cursed blade's fire, a trap): reactions, resist, armour, wards, then health and statuses. (:2671)
  - `status(who: MagicUnit, id: string, spell?: Partial<Spell>, o?: { for?: number; spec?: StatBuff }): string | null` (:2672)
- `Unit: new (magic: Magic, body: Loose, o?: Loose) => MagicUnit` The class of what Magic.unit makes (for instanceof; make them with magic.unit()). (:2750)
  - `readonly id: number` (:2638)
  - `body: Loose` (:2638)
  - `stats: Stats | null` (:2638)
  - `team: string | number` (:2638)
  - `radius: number` (:2638)
  - `height: number` (:2638)
  - `hand: Loose` (:2638)
  - `facing: number | (() => number) | null` (:2638)
  - `thing: Loose` (:2638)
  - `book: Record<string, Spell>` (:2638)
  - `dead: boolean` (:2638)
  - `gcd: number` (:2638)
  - `readonly casting: { name: string; spell: Spell; part: number; of: number; t: number } | null` The cast going on: { name, spell, part (0..1), of (seconds) }, or null. (:2640)
  - `readonly channel: { name: string; spell: Spell; t: number; of: number } | null` (:2641)
  - `wards: { by: MagicUnit; spell: string; amount: number; max: number; left: number; of: number; reflect: boolean }[]` (:2642)
  - `readonly ward: { amount: number; max: number; part: number; left: number; reflect: boolean; spell: string } | null` The strongest ward on it ({ amount, max, part, left, reflect }) or null. (:2644)
  - `readonly pos: P3` (:2645)
  - `can(name: string, aim?: SpellAim): true | string` true, or why not: 'unknown' | 'dead' | 'stunned' | 'silenced' | 'busy' | 'cooling' | 'mana' | 'range'. (:2647)
  - `cast(name: string, aim?: SpellAim): true | string` (:2648)
  - `interrupt(why?: string): boolean` (:2649)
  - `stop(): boolean` (:2649)
  - `hurt(n: number): void` (:2649)
  - `from(): P3` (:2649)
  - `face(): number` (:2649)
- `STATUSES: Readonly<Record<string, StatBuff>>` Statuses as gs.stats buffs: burn, chill (three doses: frozen), frozen, shocked, wet, poison, rooted, weak, silence, slow, regen, haste, might, stoneskin. (:2752)
- `REACTIONS: readonly { name: string; has: string; by: string; clear?: string[]; add?: string; bonus?: number; skip?: boolean }[]` (:2753)
- `ELEMENTS: Readonly<Record<string, [string, string]>>` [core, edge] colours for each element. (:2755)
- `Looks: new (magic: Magic, fx: Loose, o?: { colours?: Record<string, [string, string]>; lights?: boolean; size?: number }) => { update(dt: number): void; clear(): Loose }` Ready-made 3D looks on a gs.fx3d Particles3D: hand glows, bolt trails with lights, flashes, area rings, beam sparks, ward shimmer, heal motes. (:2757)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

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

**Monsters** (`gs.monsters`, 2D or 3D): `new Moveset(body, { attacks: ['bite', 'claw', 'pounce'], radius, stats })`
is what a monster fights with. Each attack is data (`ATTACKS` has `bite`, `claw`, `swipe`, `tail`,
`sweep`, `stomp`, `slam`, `charge`, `pounce`, `breath`, `spit` and `roar` to start from): a `shape`
(`cone`, `circle`, `ring`, `rear` behind it, `line` for a dash), the `range` and `side` it is picked
from, a `windup` you can see coming, an `active` moment it hurts, a `recover` to punish, `damage`,
`push`, `status`, `cool` and `weight`; `track` turns it after you while it winds up, `spin` sweeps it
round, `dash` and `leap` carry it (a charge, a pounce), `every` hurts again and again (breath), `spell`
casts a gs.magic spell from its `unit`. `moves.update(dt, target, targets)` gives `{ walk, speed, face,
pose, move, hits, shots }`: walk it in between, play `pose` (`{ name, at }`) on its rig, add `move`
to its position. Draw the telegraph from `moves.now.shape` (red while it winds up, by `now.phaseT`).
Targets with `stats` lose health, with `react` (people who react, or a Hurt) are shoved, with
`blocks(attack, from)` take a chip, `dodging` are missed. `moves.hurt(power)` breaks a windup on a hard
hit; `skill` (a number or a gs.brains `Dial`) shortens the windups and the rests. `new Hurt(creature, {
ground })` is how a `gs.models.creature` (or anything on a gs.poses rig) takes a hit, over whatever its
rig is doing: `hurt.hit(push, { power })` is a flinch away from the blow, a stagger back, or knocked off
its feet onto its side to get up again; `hurt.die(push)` falls dead and stays; `hurt.busy` says when it
can't act; call `hurt.update(dt)` after the rig. `new Boss({ stats, moves, phases: [{ below: 1, attacks
}, { below: .6, attacks, buff, pause, summon }], poise: { max, stun }, enrage: 120 })` changes the fight
as its health falls: new attacks and buffs, a roar between when it takes no harm (`invulnerable`), a
`summon` event for adds, a poise meter its hits fill that breaks into a stagger, and a rage when time is
up; `boss.update(dt)` gives `phase`, `staggered`, `summon`, `calm`, `enraged` and `dead`.

From [Companions](../maker-kit.md#companions):

- **Roles** (`ROLES`): `guard` stands between the hero and whatever is on it, taunts and swings; `healer` heals whoever is lowest; `archer` keeps her distance and shoots; `caster` casts. With a gs.magic unit and `spells`, heals and spells are cast through Magic by themselves; otherwise each is an event for the game.

## In real games

No game uses `gs.magic` yet: the examples above are what there is.
