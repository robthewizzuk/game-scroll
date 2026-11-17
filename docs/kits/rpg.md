# gs.rpg

RPG story systems: levels and skill trees, reputation with factions, quests with stages and a journal, the world's flags.

`gs.rpg` (`Growth(stats, { attributes, derive, tree })`: `gain(xp)` levels, `raise`, a skill tree with `learn`/`can`/`has`, `wear(inv)` so equipped gear counts; `Reputation({ factions, deeds })`: `did(deed, { seen })`, fame and good/evil, factions with rivals and allies, bounties, `mood(faction)`, `price`, `title`, `vars()`; `Quests(table)`: stages that move on by `reach`, `when` or `count`, branches, fails, `needs`, rewards to the kits it finds, `journal`, `markers`, `list()`; `Flags`: the world's facts by name).

`gs.missions` `WorldSave(api)` keeps all four in the save by itself, and `gs.story` `Talk` reads and changes them from ink.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`RpgPart`, line 2673), where every option and field is described.

- `xpTo(level: number, o?: { base?: number; power?: number }): number` XP needed in all to reach a level: base * (level - 1)^power (100, 1.5). (:2675)
- `Growth: new (stats?: Stats | null, o?: { attributes?: Record<string, number>; derive?: Record<string, (attrs: Record<string, number>, g: Growth) => number>; tree?: Rec…` new Growth(stats, { attributes, derive, tree, curve, cap, points, skills, most, refill }) in reset(). (:2677)
  - `stats: Stats | null` (:2608)
  - `level: number` (:2608)
  - `xp: number` (:2608)
  - `points: number` Unspent attribute points. (:2608)
  - `skillPoints: number` Unspent skill points. (:2608)
  - `attrs: Record<string, number>` (:2609)
  - `ranks: Record<string, number>` (:2609)
  - `cap: number` (:2609)
  - `on(ev: 'xp' | 'level' | 'raise' | 'learn' | 'respec', fn: (...a: Loose[]) => void): this` (:2610)
  - `need(level: number): number` XP needed in all for a level. (:2611)
  - `readonly next: number` XP in all for the next level (Infinity at the cap). (:2612)
  - `readonly part: number` 0..1 of the way to the next level. (:2613)
  - `gain(n: number, why?: string | null): number` Gives XP; returns the levels gained (pools filled on a level up unless refill: false). (:2614)
  - `attr(name: string): number` (:2615)
  - `raise(name: string, n?: number): boolean` Spends points on an attribute; false if short or at its top. (:2615)
  - `rank(id: string): number` (:2616)
  - `has(id: string, rank?: number): boolean` (:2616)
  - `can(id: string): { ok: boolean; why: 'ranks' | 'level' | 'needs' | 'excluded' | 'points' | null; needs: string[]; cost: number }` (:2617)
  - `learn(id: string): boolean` Learns a skill's next rank; false if can() says no. (:2618)
  - `readonly nodes: GrowthNode[]` Every skill, for drawing the tree. (:2619)
  - `respec(o?: { keep?: 'attributes' | null }): this` Gives back every point spent (keep: 'attributes' keeps those). (:2620)
  - `gear(slot: string, spec: { add?: Record<string, number>; mul?: Record<string, number>; tags?: string[] } | null): this` A piece of gear's numbers on a slot, or null to take them off. (:2621)
  - `wear(inv: Inventory): this` Follows a gs.items Inventory: what is in its equip slots counts, from its defs' stats: { add, mul }. (:2622)
  - `parts(stat: string): { add: number; mul: number }` What attributes, skills and gear add to a stat and multiply it by. (:2623)
  - `value(stat: string, base?: number): number` A stat now (the Stats' own, or worked out from base with no Stats). (:2624)
  - `restart(level?: number, xp?: number | null): this` (:2625)
  - `pack(): Loose` (:2625)
  - `unpack(d: Loose): this` (:2625)
- `Reputation: new (o?: { axes?: Record<string, [number, number, number?] | { min?: number; max?: number; start?: number; fade?: number }>; factions?: Record<string, RepF…` new Reputation({ axes, factions, deeds, share, inner, good, fame, titles, ranks }) in reset(). (:2679)
  - `on(ev: 'change' | 'rank' | 'deed' | 'paid', fn: (...a: Loose[]) => void): this` (:2630)
  - `get(axis: string): number` (:2631)
  - `lean(axis: string): number` An axis -1..1 (0..1 for one that starts at its bottom). (:2631)
  - `with(faction: string): number` A faction's standing, -100..100. (:2632)
  - `rank(faction: string): string` 'hated' | 'disliked' | 'neutral' | 'liked' | 'loved' (or your ranks). (:2633)
  - `bounty(faction: string): number` (:2634)
  - `pay(faction: string): number` Pays a bounty off; returns it. (:2634)
  - `done(id: string): number` Times a deed was done. (:2635)
  - `move(key: string, by: number, why?: string | null): this` (:2636)
  - `did(id: string, o?: { seen?: boolean | string[]; by?: number; spec?: Record<string, number> | null }): Record<string, number>` The hero did a deed. seen: true (everyone), false (nobody: only inner axes move) or the factions that saw. (:2638)
  - `update(dt: number): void` (:2639)
  - `mood(faction: string): RepMood` How someone of a faction meets the hero. (:2640)
  - `price(base: number, faction?: string | null, o?: { sell?: boolean; spread?: number }): number` A price from a faction (dearer when disliked, cheaper when liked); sell: what they pay the hero. (:2641)
  - `title(): string | null` (:2642)
  - `vars(): Record<string, number | string>` Every number flat, for a conversation's variables. (:2642)
  - `log: { id: string; seen: boolean }[]` (:2643)
  - `restart(): this` (:2643)
  - `pack(): Loose` (:2643)
  - `unpack(d: Loose): this` (:2643)
- `Flags: new (start?: Record<string, Loose>, o?: { link?: boolean }) => Flags` new Flags({ ...start }) in reset(): the world's own facts by name. (:2681)
  - `on(ev: 'change', fn: (name: string, value: Loose, was: Loose) => void): this` (:2646)
  - `get(name: string, fallback?: Loose): Loose` (:2647)
  - `has(name: string): boolean` Set and not false, 0 or ''. (:2647)
  - `set(name: string, value?: Loose): this` false or null takes it out. (:2648)
  - `add(name: string, n?: number): number` Adds to a number; returns it. (:2648)
  - `count(prefix?: string): number` How many set flags start with this. (:2649)
  - `readonly all: Record<string, Loose>` (:2649)
  - `pack(): Record<string, Loose>` (:2650)
  - `unpack(d: Loose): this` (:2650)
- `Quests: new (table: Record<string, QuestDef>, o?: { rep?: Reputation | null; grow?: Growth | null; inv?: Inventory | null; flags?: Flags | null; keep?: number; link?: …` new Quests({ id: { name, stages, rewards, needs } }) in reset(); finds the game's Reputation, Growth, Inventory and Flags. (:2683)
  - `on(ev: 'start' | 'stage' | 'count' | 'end' | 'fail' | 'reward', fn: (...a: Loose[]) => void): this` (:2657)
  - `table: Record<string, QuestDef>` (:2658)
  - `journal: JournalLine[]` (:2658)
  - `pinned: string | null` (:2658)
  - `restart(): this` (:2659)
  - `stage(id: string): string` Its stage ('' when not running). (:2659)
  - `is(id: string, stage: string): boolean` (:2659)
  - `active(id: string): boolean` (:2660)
  - `ended(id: string): string | null` How it ended, or null. (:2660)
  - `failed(id: string): boolean` (:2660)
  - `can(id: string): boolean` Not running, not done (unless repeat) and its needs met: 'quest:id', 'quest:id=way', 'flag:name', '!...' or a function. (:2661)
  - `start(id: string, stage?: string | null): boolean` (:2662)
  - `to(id: string, stage: string): this` Moves it to a stage; an end stage ends it. (:2662)
  - `end(id: string, way?: string): this` (:2663)
  - `fail(id: string): this` (:2663)
  - `count(what: string, n?: number): number` Counts n of something for each running stage that counts it; returns how many stages moved on. (:2664)
  - `progress(id: string): { n: number; of: number }` (:2665)
  - `update(dt: number, player?: Loose): this` Each frame: stages with reach (near at) or when move on. (:2666)
  - `pin(id: string | null): this` (:2667)
  - `readonly markers: { at: P3; kind: 'quest'; text: string; icon: string | null; pinned: boolean; quest: string }[]` (:2667)
  - `list(): { active: QuestLine[]; done: QuestLine[]; failed: QuestLine[] }` (:2668)
  - `vars(): Record<string, string>` quest_<id>: its stage or end, for a conversation. (:2669)
  - `pack(): Loose` (:2670)
  - `unpack(d: Loose): this` (:2670)
  - `readonly rep: Reputation | null` (:2671)
  - `readonly grow: Growth | null` (:2671)
  - `readonly inv: Inventory | null` (:2671)
  - `readonly flags: Flags | null` (:2671)

## From the maker kit

From [Animation, dialogue and replays](../maker-kit.md#animation-dialogue-and-replays):

**A conversation played by people** (`gs.story.Talk`, for 3D games): the same ink, said by your cast.
`new Talk(new Story(TALK), { cast: { hero: { person: me }, mara: { person: mara, name: 'Mara', voice: 'woman', pitch: 1.1 } }, hero: 'hero', camera: view.camera, view, rep })`,
then `start()`, `update(dt)` each frame, `tap()` (shows the whole line, then goes on) and `choose(index)`; draw
`talk.who`, `talk.shown` and `talk.choices`. Each line's `#who:mara` speaks in her voice with her mouth moving to
it (`voices: false` for text only), the speaker looks at the one spoken to and everyone else at the speaker,
`#mood:angry` (or `#mood:smile .5`) shows on the speaker's face until their next mood, `#do:nod` fires
`on('do', (move, who) => ...)` (play the gesture), and `#wait:1` goes on by itself a second after the line.
The camera is framed as a film crew would: `#shot:over` the listener's shoulder onto the speaker (the default),
`close`, `two` (both, from the side), `wide` or `none`, always from one side of the line between them so cuts
never flip them over; it cuts with `view.cut()`, or read `talk.shot` without a camera. The game's world comes
in as ink variables: `rep` (a `gs.rpg` Reputation: `town`, `town_rank`, `good`, `fame`, `bounty_guard`...), `grow`
(`level` and the attributes) and `vars: () => ({ gold })` set the ink's own `VAR`s of those names before each
line, so `* {town_rank == "loved"} [Ask for the key]` only shows to someone the town loves. And out again:
ink's `EXTERNAL did(deed)` reaches `rep.did`, `xp(n)` reaches `grow.gain`, `has`/`give`/`take(id, n)` an `inv`,
and `bind: { name: fn }` anything else. `scripts/talk.cjs` films a scene and the gestures.

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

**Quests and the journal** (`gs.rpg.Quests`): quests that run side by side, branch, fail and pay out. A quest
is a table of stages; the first is where it starts, and an `end` stage ends it that way. Your game draws the
journal, the quest log and the markers; the kit keeps where each quest is.

```js
const { Quests, Flags } = gs.rpg;
flags = new Flags();                         // the world's own facts: flags.set('met_mara'), has, get, add('wolves')
quests = new Quests({
  key: { name: 'The Gate Key', needs: ['flag:met_mara'], stages: {
    ask:   { text: 'Ask Mara about the gate key', at: maraStall, reach: 2, next: 'mill' },  // walk within 2 m
    mill:  { text: 'Find the miller', at: mill, when: () => talked.miller, next: 'flour' },
    flour: { text: 'Bring Mara three sacks of flour', count: 3, of: 'flour', next: 'done' },
    done:  { end: 'helped', text: 'Mara gave you the key.' },
    lost:  { end: 'failed', text: 'Mara will never trust you now.' } },
    rewards: { helped: { xp: 150, items: { key: 1 }, deeds: ['helped'], flags: { mara_friend: true }, gold: 20 } } },
});
quests.start('key'); quests.update(dt, player); quests.count('flour'); quests.to('key', 'lost');
```

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

For a role-playing game, the `gs.rpg` `Quests`, `Growth`, `Reputation` and `Flags` of the same game are kept by
themselves too, and a quest moving on, ending or failing, or a level gained, saves a moment later (`save.soon()`
does the same for your own moments). Save slots live on the phone beside the one save that follows the player:
`save.slot(1, 'Before the tower')` keeps the world as it is now, `save.restore(1)` puts it back and makes that the
save, `save.slots` lists them for a menu (`{ n, label, played, at }` or `null`), `save.clear(1)` empties one
(`slots: 3` by default). `save.played` is seconds of play, kept with the save.

From [Towns that live](../maker-kit.md#towns-that-live):

`gs.town` is a village or a castle town as rules: a world clock, a layout from a seed, townsfolk who live their
day by the clock, shops and monsters that come at night. It is plain data, so a 2D game can use it too;
`gs.city.Town` builds the same plan in a Next Gen view. Reputation is the `gs.rpg` kit's: a shop given a `faction`
finds the game's Reputation and prices by the hero's standing with it (dearer when they dislike the hero, and they
pay less), and `rep.mood(faction)` says how a townsperson meets the hero.

```js
const { Clock, Folk, Shop, Night } = gs.town, { Town } = gs.city;
make() {
  sky = new gs.sky.Sky(view, { physical: true });
  clock = new Clock({ hour: 8, speed: 1 / 30 });              // a day in 12 minutes; drives the Sky by itself
  town = new Town(view, { seed: 7, kind: 'castle', houses: 16 });   // solid in the game's World3D by itself
  folk = new Folk(town.plan, { crowd });                      // a gs.props.Crowd of human() kinds: moved by itself
  night = new Night(town.plan, { kinds: ['ghoul', { kind: 'wolf', speed: 2.4 }] });
  inn = new Shop({ stock: { stew: { price: 4, count: 6 }, room: { price: 10, count: 3 } }, keeper: folk.of('innkeeper')[0], faction: 'town' });
}
update(dt) { clock.update(dt); town.update(dt); folk.update(dt); night.update(dt, hero); }
```

- The clock: `hour`, `day`, `night`, `dark` (0..1 over an hour at dawn and dusk), `part`; `clock.wait(3)` passes
  three hours over 2.5 seconds (`{ over: 0 }`: at once) and `clock.sleep('dawn')` waits till dawn; both are promises.
  `clock.every(18, day => ...)` calls each day as the clock passes six in the evening, waiting or not.
- The plan: `roads` (a main road and lanes that bend), `square`, `buildings` (role `inn`, `smithy`, `store`,
  `bakery`, `hall`, `home`, `house`, `keep`, `barracks`; each with `door`, `front` (on the road outside) and its
  `turn`: the door faces `(sin turn, cos turn)`), `props` (the well, market stalls, the anvil...), `walls` and
  `gates` (castle), `lights` (torches by doors), `fields` (village), `edge` (where the wild begins) and the walking
  graph; `gs.town.route(plan, from, to)` walks it.
- Folk: each person has a job (`smith`, `keeper`, `baker`, `innkeeper`, `farmer`, `guard`, `nightwatch`, `elder`,
  `idler`), a home and a routine (`gs.town.ROUTINES`, or yours: `routines: { smith: [{ from: 6, to: 12, at: 'work',
  do: 'work' }, ...] }`). Read `doing`, `moving`, `inside` (a building id: indoors), `x`, `z`, `turn`.
  `folk.hold(person, 6, hero)` stops one to talk, `folk.near(x, z, r)`, `folk.at(building)`, `folk.of(job)`.
  After a wait everyone is where the clock says.
- Sleep and wait: `folk.rest('dawn', hero)` gives `{ ok, done }`, or `{ ok: false, why: 'danger' }` with a monster
  within 30 m. Fade the screen while `clock.waiting`.
- Shops: `open` by their hours and their keeper (shut while the keeper is away or hiding), `buy(id, n, wallet,
  inventory)` and `sell(...)` with a wallet `{ money }` and a `gs.items` Inventory, restocked each morning.
- The night: monsters come in from the edge after dusk, prowl the roads to the square, keep out of the torches'
  light, hunt the hero inside `sense` metres and go back at dawn; townsfolk go home while any are about. The kit
  moves them (`steer: false`: you do); the game draws them and decides who is hurt (`night.kill(m)`).
- Buildings in code: `gs.models.building({ style: 'cottage' | 'timberframe' | 'keep' })` (daub between oak beams
  under thatch, a timber-framed house under slate, a stone keep with battlements; roofs `thatch` and `battlement`),
  `gs.models.fort({ kind: 'wall' | 'tower' | 'gate' })` and the props `stall`, `well`, `anvil`, `torch`, `lever`,
  `bed`, `hay` and `signboard`. All of them come apart in `gs.destruction.Structure` too.
- Saving: `clock`, `folk`, each `Shop` and `night` have `pack()` / `unpack(d)` (for `WorldSave.keep`).
- To look it over: `node scripts/town.cjs sheet.png [kind=castle] [views=square,street,cottage,inn,gate,keep,high,map]
  [times=10,21.5] [seed=7] [--webgpu]` (`map` shows each townsperson where the hour has them).

More in docs/maker-kit.md: "Companions".

## In real games

1 game uses it (`node scripts/examples.mjs gs.rpg` lists them). The shortest:

`src/games/critter-quest.js` (Critter Quest, Advance · RPG, 1254 lines):

```js
const { Fighter, Battle, Bag, Opponent, gainXp, xpFor, loot } = gs.battle;
const { Quests } = gs.rpg;
// …
  function makeQuests() {
    quests = new Quests({
// …
    }, { link: false });
    quests.on('stage', (id, stage) => { const st = quests.table[id].stages[stage]; if (st && !st.end) { trackI = id; banner = { txt: 'QUEST: ' + st.te
    quests.on('end', id => { addScore(4); banner = { txt: 'QUEST DONE: ' + quests.table[id].name, l: 2.6, quest: true }; sounds.fanfare(); haptic('suc
    quests.on('reward', (id, r) => { if (r.jars) bag.add('jar', r.jars); if (r.berries) bag.add('berry', r.berries); if (r.gold) bag.add('gold', r.gol
// …
    if (n.id === 'gate') {
      if (quests.is('seals', 'gate') || gateOpen) { openGate(); return; }
      return say([`THE GATE IS SEALED. SEALS: ${quests.progress('seals').n || 0} OF 3.`, 'BEAT THE KEEPERS OF THE WILDS: TESS, GIL AND ROOK.'], null, 
// …
      for (const f of party) f.hp = f.maxHp, f.statuses.clear();
      if (quests.is('log', 'back')) return say(['A FULL LOGBOOK! WONDERFUL WORK.', 'HERE: 3 JARS AND 2 BERRIES. NOW, ON TO THE SEALS!'], () => quests.
```
