# gs.items

Inventories (slots, stacks, equipment) and crafting recipes.

`gs.items` (`Inventory` slots/stacks/equip slots, `Recipes` with `can`, `missing`, stations, timed making)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ItemsPart`, line 3097), where every option and field is described.

- `Inventory: new (defs?: Record<string, ItemDef>, o?: { slots?: number; extra?: Record<string, string>; stack?: number; weight?: number; link?: boolean }) => Inventory` (:3098)
  - `defs: Record<string, ItemDef>` (:2929)
  - `slots: (ItemStack | null)[]` (:2929)
  - `equip: Record<string, ItemStack | null>` (:2929)
  - `extra: Record<string, string>` (:2929)
  - `readonly weight: number` (:2929)
  - `readonly free: number` (:2929)
  - `on(ev: 'add' | 'take' | 'full' | 'move' | 'sort', fn: (...a: Loose[]) => void): Inventory` (:2930)
  - `count(id: string): number` (:2931)
  - `has(id: string, n?: number): boolean` (:2931)
  - `all(): ItemStack[]` (:2931)
  - `add(id: string, n?: number): number` (:2931)
  - `take(id: string, n?: number): boolean` (:2931)
  - `at(where: number | string): ItemStack | null` (:2932)
  - `fits(s: ItemStack | null, where: number | string): boolean` (:2932)
  - `move(from: number | string, to: number | string, n?: number): boolean` (:2932)
  - `split(from: number | string): number` (:2933)
  - `sort(by?: ((a: string, b: string) => number) | null): Inventory` (:2933)
  - `save(): Loose` (:2933)
  - `load(d: Loose): Inventory` (:2933)
- `Recipes: new (defs?: Record<string, ItemDef>) => Recipes` (:3099)
  - `list: Recipe[]` (:2938)
  - `add(id: string, needs: Record<string, number>, o?: { makes?: number; keep?: string[]; at?: string | null; time?: number; name?: string }): Recipes` (:2939)
  - `recipe(id: string, inv?: Loose, at?: string | null): Recipe | null` (:2940)
  - `missing(id: string, inv: Loose, at?: string | null): Record<string, number> | null` (:2940)
  - `can(inv: Loose, at?: string | null): Recipe[]` (:2941)
  - `times(id: string, inv: Loose, at?: string | null): number` (:2941)
  - `uses(item: string): Recipe[]` (:2941)
  - `make(id: string, inv: Loose, at?: string | null): Recipe | null` (:2941)
  - `timer: { jobs: CraftJob[]; on(ev: 'done', fn: (r: Recipe, over: number) => void): Loose; progress(job: CraftJob): number; update(dt: number): void; clear(): void }` (:2942)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

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

**Inventories and crafting** (`gs.items`): `Inventory(defs, { slots, extra, stack, weight })` is a grid
of slots holding stacks (`defs[id].stack` most per slot, `kind`, `weight`). `add(id, n)` returns what
didn't fit; `take`, `count`, `has`; `move(from, to, n)` merges or swaps, and equip slots in `extra`
(`{ hand: 'tool' }`) only take their kind; `split`, `sort`, `save` / `load`. `Recipes(defs)`:
`add(id, needs, { makes, keep, at, time })`, then `can(inv)` (what can be made now), `missing(id, inv)`,
`times`, `uses(item)`, `make(id, inv, station)`. Recipes with `time` are made over seconds by
`book.timer` (`update(dt)`, `progress(job)`, `on('done')`). gs.battle's `Bag` works as `inv` too.

From [Towns that live](../maker-kit.md#towns-that-live):

- Shops: `open` by their hours and their keeper (shut while the keeper is away or hiding), `buy(id, n, wallet,
  inventory)` and `sell(...)` with a wallet `{ money }` and a `gs.items` Inventory, restocked each morning.

From [Dungeons](../maker-kit.md#dungeons):

- `use(what, { inventory })` opens and shuts doors, unlocks with the key (any inventory with `has`, `take` and `add`:
  `gs.items.Inventory` fits), pulls levers, loots chests (`loot: chest => [{ id, n }]`, else some gold) and finds the
  secret wall. `near(position)` lists what is in reach, to show a prompt.

## In real games

No game uses `gs.items` yet: the examples above are what there is.
