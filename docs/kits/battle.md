# gs.battle

Turn-based fights: fighters, turn order, types, statuses, items, XP, loot, a ready-made opponent.

`gs.battle` (`Fighter`, `Battle` turn order + types + statuses, `Bag`, `gainXp`, `loot`; `Opponent(api, { skill })` a ready-made enemy: `join(fight)`, then `fight.act(fight.turn, foe.pick())`, which plays turns ahead by the fight's own rules and learns how this player fights)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BattlePart`, line 2480), where every option and field is described.

- `Fighter: new (o?: { name?: string; hp?: number; atk?: number; def?: number; spd?: number; luck?: number; type?: string | null; level?: number; [k: string]: Loose }) =>…` (:2481)
  - `moves: Record<string, FightMove>` (:3090)
  - `x: number` (:3090)
  - `y: number` (:3090)
  - `facing: number` (:3090)
  - `hp: number` (:3090)
  - `maxHp: number` (:3090)
  - `move: string | null` (:3090)
  - `frame: number` (:3090)
  - `stun: number` (:3090)
  - `stop: number` (:3090)
  - `blocking: boolean` (:3090)
  - `blockLow?: boolean` (:3090)
  - `readonly phase: 'start' | 'active' | 'recover' | 'stun' | 'idle'` (:3091)
  - `readonly busy: boolean` (:3091)
  - `on(ev: 'start' | 'active' | 'end' | 'hit' | 'blocked' | 'hurt' | 'block', fn: (...a: Loose[]) => void): Fighter` (:3092)
  - `canCancel(name: string): boolean` (:3093)
  - `start(name: string): boolean` (:3093)
  - `update(dt: number): Fighter` (:3093)
  - `hitboxes(): { x: number; y: number; w: number; h: number }[]` (:3093)
  - `hurtboxes(): { x: number; y: number; w: number; h: number }[]` (:3093)
- `Battle: new (sides: Fighter[][], o?: { types?: Record<string, Record<string, number>>; statuses?: Record<string, Loose>; rng?: () => number; crit?: number; spread?: bo…` (:2482)
  - `sides: Fighter[][]` (:2468)
  - `log: Loose[]` (:2468)
  - `readonly fighters: Fighter[]` (:2468)
  - `readonly turn: Fighter | null` (:2468)
  - `readonly over: number | null` (:2468)
  - `on(ev: string, fn: (e: Loose) => void): Battle` (:2469)
  - `sideOf(f: Fighter): number` (:2469)
  - `foes(f: Fighter): Fighter[]` (:2469)
  - `friends(f: Fighter): Fighter[]` (:2469)
  - `next(): Fighter | null` (:2470)
  - `preview(by: Fighter, target: Fighter, move?: BattleMove): number` (:2470)
  - `damage(by: Fighter, target: Fighter, move?: BattleMove, roll?: boolean): { amount: number; crit: boolean; miss: boolean; effect: number; [k: string]: Loose }` (:2471)
  - `act(by: Fighter, o?: { move?: BattleMove | null; item?: Loose; target?: Fighter | null; wait?: boolean }): Loose` (:2472)
  - `inflict(target: Fighter, status: string, turns?: number): Loose` (:2473)
  - `useItem(by: Fighter, item: string, target?: Fighter): Loose` (:2473)
  - `endTurn(f: Fighter): Loose` (:2473)
- `Bag: new (defs?: Record<string, Loose>, o?: { slots?: number; stack?: number }) => Bag` (:2483)
  - `defs: Record<string, Loose>` (:2476)
  - `items: Map<string, number>` (:2476)
  - `add(id: string, n?: number): number` (:2477)
  - `take(id: string, n?: number): boolean` (:2477)
  - `count(id: string): number` (:2477)
  - `has(id: string, n?: number): boolean` (:2477)
  - `readonly list: { id: string; n: number; def: Loose; bag: Bag }[]` (:2478)
  - `save(): Record<string, number>` (:2478)
  - `load(data: Record<string, number> | null): Bag` (:2478)
- `Opponent: new (api?: GameApi | null, o?: { name?: string; skill?: Skill; /** The side it plays (1). */ side?: number; /** Turns it plays ahead (2). */ ahead?: number; …` new Opponent(api, { name, skill, side, ahead, learn, rng, score }) in make(); join(fight) each fight; fight.act(fight.turn, foe.pick()). (:2485)
  - `skill: Skill` 0..1, or a gs.brains.Dial. (:2451)
  - `side: number` The side it plays. (:2451)
  - `join(fight: Battle): BattleOpponent` Watches a fight, so every turn the other side takes teaches it. (:2453)
  - `pick(by?: Fighter | null, moves?: BattleMove[] | Record<string, BattleMove> | null, o?: { items?: Loose[] | null; fight?: Battle }): BattleChoice` The turn to take for `by` (the fight's turn by default), ready for fight.act(by, choice). (:2455)
  - `options: BattleChoice[]` Every choice the last pick() weighed, best first. (:2457)
  - `expect(low?: number): number[]` What it expects the player to do next when their weakest fighter is at `low` (0..1 of its health): chances for hit, big, heal, status, buff, wait. (:2459)
  - `see(by: Fighter, choice: BattleChoice, fight?: Battle): BattleOpponent` A fighter on the other side took a turn (join() has the fight tell it). (:2461)
  - `result(playerWon: boolean | 'draw' | number): BattleOpponent` The end of a fight: did the player win? (:2463)
  - `forget(): BattleOpponent` Forgets how the player fights. (:2465)
- `xpFor(level: number, o?: { base?: number; power?: number }): number` (:2486)
- `levelFor(xp: number, o?: { base?: number; power?: number }): number` (:2486)
- `gainXp(f: Fighter, xp: number, o?: { growth?: Record<string, number>; curve?: { base?: number; power?: number } }): number` Adds XP and levels up (stats grow by growth per level). (:2488)
- `loot<T extends { w?: number }>(table: T[], rng?: () => number): T` Picks an entry from a weighted table: [{ id: 'coin', w: 10 }, { id: 'gem', w: 1 }]. (:2490)

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

1 game uses it (`node scripts/examples.mjs gs.battle` lists them). The shortest:

`src/games/critter-quest.js` (Critter Quest, Advance · RPG, 1254 lines):

```js
const { Typewriter } = gs.story;
const { Fighter, Battle, Bag, Opponent, gainXp, xpFor, loot } = gs.battle;
// …
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
// …
  });
  const opp = new Opponent(api, { skill: .5 });    // Tiny Brains: plays turns ahead and learns how this player fights
// …
    const sp = SPECIES[id], [hp, atk, def, spd] = sp.base;
    const f = new Fighter({ name: id, hp: hp + Math.round(lvl * 3.2), atk: atk + lvl * 1.3, def: def + lvl * 1.1, spd: spd + lvl * .8, level: lvl, typ
    f.sp = id; f.xp = xpFor(lvl, CURVE); f.learn = sp.moves.filter(m => m[0] <= lvl).map(m => MV[m[1]]).slice(-4);
// …
  const lead = () => party.find(f => f.alive);
  const pickWild = z => { const e = /** @type {{ id: string, lv: number[], w: number }} */ (loot(WILD[z])); return critter(e.id, e.lv[0] + (Math.rando
// …
    quests.on('end', id => { addScore(4); banner = { txt: 'QUEST DONE: ' + quests.table[id].name, l: 2.6, quest: true }; sounds.fanfare(); haptic('suc
    quests.on('reward', (id, r) => { if (r.jars) bag.add('jar', r.jars); if (r.berries) bag.add('berry', r.berries); if (r.gold) bag.add('gold', r.gol
// …
    vis = new Map(); shownHp = new Map(); press = null; path = null; stick.release();
    fight = new Battle([[lead()], [foes[0]]], { types: TYPES });
```
