# gs.battle

Turn-based fights: fighters, turn order, types, statuses, items, XP, loot, a ready-made opponent.

`gs.battle` (`Fighter`, `Battle` turn order + types + statuses, `Bag`, `gainXp`, `loot`; `Opponent(api, { skill })` a ready-made enemy: `join(fight)`, then `fight.act(fight.turn, foe.pick())`, which plays turns ahead by the fight's own rules and learns how this player fights)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BattlePart`, line 2475), where every option and field is described.

- `Fighter: new (o?: { name?: string; hp?: number; atk?: number; def?: number; spd?: number; luck?: number; type?: string | null; level?: number; [k: string]: Loose }) =>…` (:2476)
  - `moves: Record<string, FightMove>` (:3085)
  - `x: number` (:3085)
  - `y: number` (:3085)
  - `facing: number` (:3085)
  - `hp: number` (:3085)
  - `maxHp: number` (:3085)
  - `move: string | null` (:3085)
  - `frame: number` (:3085)
  - `stun: number` (:3085)
  - `stop: number` (:3085)
  - `blocking: boolean` (:3085)
  - `blockLow?: boolean` (:3085)
  - `readonly phase: 'start' | 'active' | 'recover' | 'stun' | 'idle'` (:3086)
  - `readonly busy: boolean` (:3086)
  - `on(ev: 'start' | 'active' | 'end' | 'hit' | 'blocked' | 'hurt' | 'block', fn: (...a: Loose[]) => void): Fighter` (:3087)
  - `canCancel(name: string): boolean` (:3088)
  - `start(name: string): boolean` (:3088)
  - `update(dt: number): Fighter` (:3088)
  - `hitboxes(): { x: number; y: number; w: number; h: number }[]` (:3088)
  - `hurtboxes(): { x: number; y: number; w: number; h: number }[]` (:3088)
- `Battle: new (sides: Fighter[][], o?: { types?: Record<string, Record<string, number>>; statuses?: Record<string, Loose>; rng?: () => number; crit?: number; spread?: bo…` (:2477)
  - `sides: Fighter[][]` (:2463)
  - `log: Loose[]` (:2463)
  - `readonly fighters: Fighter[]` (:2463)
  - `readonly turn: Fighter | null` (:2463)
  - `readonly over: number | null` (:2463)
  - `on(ev: string, fn: (e: Loose) => void): Battle` (:2464)
  - `sideOf(f: Fighter): number` (:2464)
  - `foes(f: Fighter): Fighter[]` (:2464)
  - `friends(f: Fighter): Fighter[]` (:2464)
  - `next(): Fighter | null` (:2465)
  - `preview(by: Fighter, target: Fighter, move?: BattleMove): number` (:2465)
  - `damage(by: Fighter, target: Fighter, move?: BattleMove, roll?: boolean): { amount: number; crit: boolean; miss: boolean; effect: number; [k: string]: Loose }` (:2466)
  - `act(by: Fighter, o?: { move?: BattleMove | null; item?: Loose; target?: Fighter | null; wait?: boolean }): Loose` (:2467)
  - `inflict(target: Fighter, status: string, turns?: number): Loose` (:2468)
  - `useItem(by: Fighter, item: string, target?: Fighter): Loose` (:2468)
  - `endTurn(f: Fighter): Loose` (:2468)
- `Bag: new (defs?: Record<string, Loose>, o?: { slots?: number; stack?: number }) => Bag` (:2478)
  - `defs: Record<string, Loose>` (:2471)
  - `items: Map<string, number>` (:2471)
  - `add(id: string, n?: number): number` (:2472)
  - `take(id: string, n?: number): boolean` (:2472)
  - `count(id: string): number` (:2472)
  - `has(id: string, n?: number): boolean` (:2472)
  - `readonly list: { id: string; n: number; def: Loose; bag: Bag }[]` (:2473)
  - `save(): Record<string, number>` (:2473)
  - `load(data: Record<string, number> | null): Bag` (:2473)
- `Opponent: new (api?: GameApi | null, o?: { name?: string; skill?: Skill; /** The side it plays (1). */ side?: number; /** Turns it plays ahead (2). */ ahead?: number; …` new Opponent(api, { name, skill, side, ahead, learn, rng, score }) in make(); join(fight) each fight; fight.act(fight.turn, foe.pick()). (:2480)
  - `skill: Skill` 0..1, or a gs.brains.Dial. (:2446)
  - `side: number` The side it plays. (:2446)
  - `join(fight: Battle): BattleOpponent` Watches a fight, so every turn the other side takes teaches it. (:2448)
  - `pick(by?: Fighter | null, moves?: BattleMove[] | Record<string, BattleMove> | null, o?: { items?: Loose[] | null; fight?: Battle }): BattleChoice` The turn to take for `by` (the fight's turn by default), ready for fight.act(by, choice). (:2450)
  - `options: BattleChoice[]` Every choice the last pick() weighed, best first. (:2452)
  - `expect(low?: number): number[]` What it expects the player to do next when their weakest fighter is at `low` (0..1 of its health): chances for hit, big, heal, status, buff, wait. (:2454)
  - `see(by: Fighter, choice: BattleChoice, fight?: Battle): BattleOpponent` A fighter on the other side took a turn (join() has the fight tell it). (:2456)
  - `result(playerWon: boolean | 'draw' | number): BattleOpponent` The end of a fight: did the player win? (:2458)
  - `forget(): BattleOpponent` Forgets how the player fights. (:2460)
- `xpFor(level: number, o?: { base?: number; power?: number }): number` (:2481)
- `levelFor(xp: number, o?: { base?: number; power?: number }): number` (:2481)
- `gainXp(f: Fighter, xp: number, o?: { growth?: Record<string, number>; curve?: { base?: number; power?: number } }): number` Adds XP and levels up (stats grow by growth per level). (:2483)
- `loot<T extends { w?: number }>(table: T[], rng?: () => number): T` Picks an entry from a weighted table: [{ id: 'coin', w: 10 }, { id: 'gem', w: 1 }]. (:2485)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Battles** (`gs.battle`): `Fighter` (hp, atk, def, spd, luck, type), `Battle([[hero], [foes]], { types })`
for turn order by speed, damage with type bonuses and critical hits, and statuses (poison, burn,
regen, stun, sleep, shield, or your own). `battle.act(who, { move, item, target })`, `battle.turn`,
`battle.over`, and events (`on('hit')`, `on('faint')`). `Bag` holds items and saves with `api.save()`;
`xpFor`, `levelFor`, `gainXp` and `loot` cover levelling and drops.

A ready-made opponent for a battle (Tiny Brains): it tries every move on every target in a copy of
the fight, a couple of turns ahead by the fight's own rules (types, statuses, buffs, potions), and
learns how this player fights: what they do when they are hurt, and who they go for.

```js
const { Fighter, Battle, Opponent } = gs.battle;
foe = new Opponent(api, { skill: .7 });                 // make(): what it learns is kept on the phone
fight = new Battle([[hero], [slime]], { types }); foe.join(fight);        // each fight
// the enemy's turn:
fight.act(fight.turn, foe.pick(fight.turn, SLIME_MOVES, { items: slimeBag.list }));   // or the fighter's own .moves
// at the end:
foe.result(fight.over === 0);                           // did the player win?
```

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

**Inventories and crafting** (`gs.items`): `Inventory(defs, { slots, extra, stack, weight })` is a grid
of slots holding stacks (`defs[id].stack` most per slot, `kind`, `weight`). `add(id, n)` returns what
didn't fit; `take`, `count`, `has`; `move(from, to, n)` merges or swaps, and equip slots in `extra`
(`{ hand: 'tool' }`) only take their kind; `split`, `sort`, `save` / `load`. `Recipes(defs)`:
`add(id, needs, { makes, keep, at, time })`, then `can(inv)` (what can be made now), `missing(id, inv)`,
`times`, `uses(item)`, `make(id, inv, station)`. Recipes with `time` are made over seconds by
`book.timer` (`update(dt)`, `progress(job)`, `on('done')`). gs.battle's `Bag` works as `inv` too.

## In real games

No game uses `gs.battle` yet: the examples above are what there is.
