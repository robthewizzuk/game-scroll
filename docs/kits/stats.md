# gs.stats

Real-time stats: buffs and perks that run out, pools that drain and refill, cooldowns with charges.

`gs.stats.Stats` (real time: stats with buffs, perks and debuffs that run out (`buff`, `perk`, `is(tag)`, `cleanse`), pools that drain and refill (`change`, `spend`, `part`), cooldowns with charges (`cool`, `use`))

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`StatsPart`, line 2543), where every option and field is described.

- `Stats: new (stats?: Record<string, number | { base: number; min?: number; max?: number } | { max: number; regen?: number; delay?: number; start?: number; min?: number …` stats: { name: number | { base, min, max } | a pool { max, regen, delay, start, min } }; buffs: the table buff(id) and perk(id) read. (:2545)
  - `on(ev: 'buff' | 'end' | 'tick' | 'change' | 'empty' | 'full' | 'ready' | 'blocked', fn: (...a: Loose[]) => void): this` (:2520)
  - `get(name: string): number` A stat with everything on it now ((base + adds) x muls, held to its min and max); a pool's amount. (:2522)
  - `baseOf(name: string): number` (:2522)
  - `setBase(name: string, v: number): this` (:2522)
  - `max(name: string): number` A pool's most ('name.max'). (:2524)
  - `part(name: string, kind?: 'cool'): number` 0..1: a pool's fill; part(name, 'cool') a cooldown's refill (1 ready); a buff's time left by id. (:2526)
  - `change(name: string, n: number, why?: string | null): number` Moves a pool (negative takes away; a loss holds off regen for its delay). (:2528)
  - `spend(name: string, n: number): boolean` (:2529)
  - `fill(name: string, share?: number): number` (:2529)
  - `empty(name: string): boolean` (:2529)
  - `full(name: string): boolean` (:2529)
  - `buff(id: string, spec?: StatBuff | null, o?: { for?: number; stacks?: number }): StatEffect | null` Puts a buff on by its table name or a spec; null if something on blocks it. (:2531)
  - `perk(id: string, spec?: StatBuff | null, o?: { stacks?: number }): StatEffect | null` (:2532)
  - `remove(id: string, why?: string, o?: { dose?: boolean }): boolean` (:2533)
  - `has(id: string): number` Doses on (0: not on). (:2535)
  - `is(tag: string): boolean` (:2535)
  - `readonly buffs: StatEffect[]` (:2535)
  - `cleanse(fn?: (e: StatEffect) => boolean): number` (:2535)
  - `cool(name: string, seconds: number, o?: { charges?: number; by?: string | null; start?: number }): this` A cooldown: seconds per use, charges stored, by (a stat that speeds it: 1.25 a quarter quicker). (:2537)
  - `ready(name: string): boolean` (:2538)
  - `use(name: string): boolean` (:2538)
  - `left(name: string): number` (:2538)
  - `charges(name: string): number` (:2538)
  - `hurry(name: string, seconds: number, o?: { all?: boolean }): void` (:2539)
  - `update(dt: number): void` (:2540)
  - `clear(o?: { perks?: boolean }): this` (:2540)
  - `pack(): Loose` (:2541)
  - `unpack(d: Loose): this` (:2541)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Stats that change while you play** (`gs.stats`, real time; gs.battle's statuses count turns):
`new Stats({ speed: 6, armour: 0, hp: { max: 100 }, mana: { max: 50, regen: 8, delay: 1 } }, { buffs: TABLE })`.
A stat is (base + every add) x every mul, held to its `min` and `max` (`{ base, min, max }`); `get('speed')`.
A pool (an object with `max`) is an amount that drains and refills: `change('hp', -12)`, `spend('mana', 10)`
(false if short), `fill`, `empty`, `part('hp')` 0..1 for a bar; its max and regen are stats too
(`'hp.max'`, `'mana.regen'`), so a buff can raise them, and a loss holds off regen for `delay` seconds.
Buffs go on by name from the table or with a spec: `buff('haste')`, where `haste: { for: 4, mul: { speed: 1.5 } }`;
with no `for` it is a perk, on until `remove()` (`perk(id)` makes any of them one). A spec can also have
`add`, `tags` (`is('stunned')`), `drain: { hp: 3 }` a second (negative heals; with `every: 1` counted once a
second, and `tick(stats, effect)` called), `stacks` and `stack` (putting it on again: `'refresh'` the time,
`'extend'` it, `'stack'` a dose (each dose adds its own add, mul and drain), `'keep'`, `'strongest'`), `bad: true`
(a debuff: `cleanse()` takes them all off) and `blocks: ['poison']` (immune while it's on; what it blocks comes
off). `buffs` lists what is on with `left` and `part` for icons and rings. Cooldowns: `cool('dash', 2, { charges: 2, by: 'haste' })`,
then `use('dash')` (false while waiting), `ready`, `left`, `charges`, `part('dash', 'cool')`, `hurry`. Events:
`on('buff' | 'end' | 'tick' | 'change' | 'empty' | 'full' | 'ready' | 'blocked', fn)`. Call `update(dt)` each
frame, make it in `reset()` (or `clear()` it there), and `pack()` / `unpack()` with `api.save()`.

**Role-playing** (`gs.rpg`): a hero who grows, and a world that remembers what they did. Your game
decides what a skill does and draws the bars, tree and people; the kit keeps the numbers.
`new Growth(stats, { attributes: { might: 5, grace: 5 }, derive: { damage: a => a.might, 'hp.max': a => 8 * a.might }, tree })`
on a `gs.stats` Stats (or `null`, then read `value(stat, base)`). `gain(xp)` returns the levels gained on a curve
(`xpTo(level)`: 100 x (level - 1)^1.5; `curve: { base, power }` or your own function, `cap` 50), each level
gives `points` (3) for `raise('might')` and `skills` (1) for `learn('cleave')`, and fills the pools. `part` is
the bar to the next level. A tree skill: `{ ranks, cost, level, needs: ['cleave:2'], excludes: ['frenzy'], perk: { add, mul } }`
(the perk goes on the Stats once a rank); `can(id)` says `{ ok, why, needs }` ('ranks', 'level', 'needs',
'excluded', 'points'), `has('whirl')`, `rank(id)`, `nodes` for drawing it, `respec()`. Gear: `wear(inv)`
follows a `gs.items` Inventory, and whatever sits in its equip slots counts from its def's `stats: { add, mul }`
(or `gear(slot, spec)` by hand). Events `xp`, `level`, `raise`, `learn`, `respec`; `pack()` / `unpack()`.

```js
const { Growth, Reputation } = gs.rpg;
rep = new Reputation({
  factions: { town: {}, guard: { law: true, allies: ['town'] }, bandits: { start: -20, rivals: ['town'], fights: true } },
  deeds: { rescue: { good: 15, fame: 10, town: 20 }, steal: { good: -5, town: -15, crime: 50 } },
  titles: [{ name: 'the Bright', good: [50, 100], fame: [40, 100] }],
});
rep.did('rescue');                          // town +20, guard +10 (ally), bandits -10 (rival), good +15, fame +10
rep.did('steal', { seen: ['guard'] });      // only the guard saw: a 50 bounty, and good -5 (the hero knows)
rep.did('steal', { seen: false });          // nobody saw: good -5 only
rep.mood('guard')                           // 'arrest' while there's a bounty; rep.pay('guard')
rep.price(100, 'town')                      // 85 when the town loves you, 125 when it hates you
```

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

## In real games

No game uses `gs.stats` yet: the examples above are what there is.
