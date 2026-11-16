# gs.monsters

Monster attacks with telegraphs, hurt reactions (flinch, stagger, knocked down) and bosses with phases.

`gs.monsters` (`Moveset(body, { attacks: ['bite', 'tail', 'charge'] })` attack sets with telegraphs: `update(dt, target, targets)` gives walk, pose, move and hits, draw `now.shape`; `ATTACKS` to start from; `Hurt(creature)` flinch, stagger, knocked down, up again, dead; `Boss({ stats, moves, phases, poise, enrage })`). 2D or 3D: the kit gives the answers, your game draws them and keeps the score.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`MonstersPart`, line 2813), where every option and field is described.

- `Moveset: new (body: Loose, o?: { attacks?: (string | MonsterAttack)[]; radius?: number; reach?: number | null; keep?: number; rest?: [number, number]; skill?: Skill | …` A monster's attacks: names from ATTACKS or specs. (:2815)
  - `list: MonsterAttack[]` (:2786)
  - `radius: number` (:2786)
  - `reach: number` (:2786)
  - `keep: number` (:2786)
  - `skill: Skill | number` (:2786)
  - `stats: Stats | null` (:2786)
  - `unit: MagicUnit | null` (:2786)
  - `face: number` (:2786)
  - `cools: Record<string, number>` (:2786)
  - `readonly now: AttackNow | null` The attack under way (phase, part, shape for the telegraph), or null. (:2788)
  - `readonly pos: P3` (:2788)
  - `set(attacks: (string | MonsterAttack)[]): this` (:2789)
  - `on(ev: 'start' | 'active' | 'recover' | 'end' | 'stop' | 'hit' | 'blocked' | 'miss' | 'shoot' | 'fail', fn: (e: Loose) => void): this` (:2790)
  - `can(name: string, target?: Loose): true | 'unknown' | 'busy' | 'cooling' | 'range' | 'side' | 'health'` (:2791)
  - `start(name: string, target?: Loose): AttackNow` (:2792)
  - `stop(why?: string): boolean` (:2792)
  - `hurt(power?: number, o?: { poise?: number }): boolean` It was hit (power 0..1): a hard enough one breaks a windup. (:2794)
  - `stunFor(seconds: number): void` (:2794)
  - `update(dt: number, target?: Loose, targets?: Loose[]): { walk: P3; speed: number; face: number; pose: { name: string; at: number } | null; move: P3; attack: AttackNow …` Thinks, moves the attack on and hits. (:2796)
- `Hurt: new (creature: Loose, o?: { ground?: ((x: number, z: number) => number) | null; weight?: number; poise?: number; sturdy?: number; move?: boolean; getUp?: number;…` How a creature (gs.models.creature, or anything on a gs.poses Rig) takes a hit, over its rig's own pose. (:2817)
  - `state: 'steady' | 'flinch' | 'stagger' | 'down' | 'rising' | 'dead'` (:2799)
  - `readonly busy: boolean` (:2799)
  - `readonly dead: boolean` (:2799)
  - `slide: P3` (:2799)
  - `weight: number` (:2799)
  - `poise: number` (:2799)
  - `sturdy: number` (:2799)
  - `on(ev: 'hit' | 'down' | 'up' | 'dead', fn: (e: Loose) => void): this` (:2800)
  - `hit(push?: P3, o?: { power?: number | null }): this` A hit: push in metres a second along the blow, power 0..1 (a flinch, a stagger back, knocked down). (:2802)
  - `die(push?: P3): this` (:2802)
  - `reset(): this` (:2802)
  - `update(dt: number): this` After the rig's own update each frame. (:2804)
- `Boss: new (o: { stats: Stats; phases?: Boss['phases']; moves?: Moveset | null; poise?: { max?: number; recover?: number; stun?: number } | null; enrage?: number; rage?…` A boss fight in phases by health, with a roar between, poise that breaks into a stagger and an enrage timer. (:2819)
  - `stats: Stats` (:2807)
  - `phases: { below?: number; name?: string; attacks?: (string | MonsterAttack)[]; buff?: StatBuff; pause?: number; summon?: { count: number; kind?: string }; [k: string]:…` (:2807)
  - `moves: Moveset | null` (:2807)
  - `readonly index: number` (:2808)
  - `readonly phase: { below?: number; name?: string; [k: string]: Loose }` (:2808)
  - `readonly part: number` (:2808)
  - `readonly poiseLeft: number` (:2808)
  - `readonly changing: boolean` (:2808)
  - `readonly enraged: boolean` (:2808)
  - `readonly dead: boolean` (:2808)
  - `readonly t: number` (:2808)
  - `on(ev: 'phase' | 'staggered' | 'enraged' | 'summon' | 'calm' | 'dead', fn: (e: Loose) => void): this` (:2809)
  - `poise(n: number): this` (:2810)
  - `update(dt: number): { type: 'phase' | 'staggered' | 'enraged' | 'summon' | 'calm' | 'dead'; [k: string]: Loose }[]` (:2811)
- `ATTACKS: Readonly<Record<string, MonsterAttack>>` bite, claw, swipe, tail, sweep, stomp, slam, charge, pounce, breath, spit, roar. (:2821)
- `inShape(shape: Partial<AttackShape>, x: number, z: number, r?: number): boolean` (:2822)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

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

## In real games

No game uses `gs.monsters` yet: the examples above are what there is.
