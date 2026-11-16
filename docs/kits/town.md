# gs.town

A living town: a world clock, a seeded town plan, townsfolk with daily routines, shops with hours, monsters at night.

Guide: [Towns that live](../maker-kit.md#towns-that-live).

`gs.town` (`Clock` a world clock: `hour`, `day`, `night`, `dark`, `wait(hours)`, `sleep('dawn')`, `every(hour, fn)`, drives the Sky; `plan({ seed, kind: 'village'|'castle', houses })` a seeded town as data; `Folk(plan, { crowd })` townsfolk with daily routines by the clock, `rest('dawn', hero)`; `Shop` opening hours, buy and sell, restocks, `price` hook for reputation; `Night(plan)` monsters from the edge at night, kept off by torches, gone at dawn) and `gs.city.Town(view, { seed, kind })` built in 3D (buildings `cottage`, `timberframe`, `keep`, `gs.models.fort` walls, towers and gate, windows and torches lit by the clock).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`TownPart`, line 3010), where every option and field is described.

- `Clock: new (o?: { hour?: number; day?: number; speed?: number; dawn?: number; dusk?: number; sky?: Loose | false; link?: boolean }) => WorldClock` The world's time of day: hour, day, night, dark (0..1), wait()/sleep() to pass time, every(hour, fn). (:3012)
  - `time: number` (:2888)
  - `speed: number` (:2888)
  - `dawn: number` (:2888)
  - `dusk: number` (:2888)
  - `readonly waiting: boolean` (:2888)
  - `hour: number` (:2888)
  - `readonly day: number` (:2888)
  - `readonly night: boolean` (:2888)
  - `readonly dark: number` (:2888)
  - `readonly part: 'night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening'` (:2889)
  - `set(hour: number, day?: number): WorldClock` (:2890)
  - `until(hour: number | 'dawn' | 'dusk'): number` (:2890)
  - `wait(hours: number, o?: { over?: number }): Promise<WorldClock>` (:2891)
  - `sleep(hour?: number | 'dawn' | 'dusk', o?: { over?: number }): Promise<WorldClock>` (:2891)
  - `every(hour: number | 'dawn' | 'dusk', fn: (day: number) => void): () => void` (:2892)
  - `update(dt: number): WorldClock` (:2892)
  - `pack(): Loose` (:2892)
  - `unpack(d: Loose): WorldClock` (:2892)
- `plan(o?: TownPlanOptions): TownPlan` A village or a castle town laid out from a seed, as plain data (gs.city.Town builds it in 3D). (:3014)
- `route(plan: TownPlan, from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[]` A way through a town along its roads, from one spot to another. (:3016)
- `Folk: new (plan: TownPlan, o?: { count?: number; clock?: WorldClock; seed?: number; speed?: number; crowd?: Loose; moves?: { walk?: string; idle?: string; sit?: string…` Townsfolk who live their day by the clock: sleep, work, eat, drink at the inn, chat on the square; they hide when monsters are about. (:3018)
  - `people: TownPerson[]` (:2895)
  - `town: TownPlan` (:2895)
  - `speed: number` (:2895)
  - `update(dt: number): TownFolk` (:2896)
  - `settle(): TownFolk` (:2896)
  - `hold(p: TownPerson, seconds?: number, face?: { x: number; z: number } | null): TownPerson` (:2896)
  - `near(x: number, z: number, r?: number): TownPerson[]` (:2897)
  - `at(building: number | TownBuilding): TownPerson[]` (:2897)
  - `of(job: string): TownPerson[]` (:2897)
  - `rest(hours?: number | 'dawn' | 'dusk', where?: { x: number; z: number } | null): { ok: boolean; why?: string; hours?: number; done?: Promise<WorldClock> }` (:2898)
  - `on(ev: 'arrive' | 'slot', fn: (p: TownPerson) => void): TownFolk` (:2899)
  - `pack(): Loose` (:2899)
  - `unpack(d: Loose): TownFolk` (:2899)
- `Shop: new (o?: { name?: string; stock?: Record<string, { price: number; count?: number; restock?: number }>; hours?: [number, number]; clock?: WorldClock; keeper?: Tow…` A shop with opening hours, stock that restocks each morning, buying and selling; faction: whose shop, priced by a gs.rpg Reputation's standing with it (found by itself); price: your own, which wins. (:3020)
  - `name: string` (:2902)
  - `money: number` (:2902)
  - `stock: Record<string, { price: number; count: number; restock: number }>` (:2902)
  - `readonly open: boolean` (:2902)
  - `keeper: TownPerson | null` (:2902)
  - `priceOf(id: string, o?: { selling?: boolean }): number | null` (:2903)
  - `restock(): TownShop` (:2903)
  - `buy(id: string, n?: number, wallet?: { money: number }, inventory?: Inventory | null): { ok: boolean; cost?: number; why?: string }` (:2904)
  - `sell(id: string, n?: number, wallet?: { money: number }, inventory?: Inventory | null): { ok: boolean; paid?: number; why?: string }` (:2905)
  - `pack(): Loose` (:2906)
  - `unpack(d: Loose): TownShop` (:2906)
- `Night: new (plan: TownPlan, o?: { clock?: WorldClock; kinds?: (string | { kind: string; weight?: number; speed?: number; sense?: number })[]; every?: number; max?: num…` Monsters that come in from the wild at night, keep off torches, hunt the hero when near and go at dawn. (:3022)
  - `monsters: NightMonster[]` (:2910)
  - `readonly active: boolean` (:2910)
  - `readonly time: boolean` (:2910)
  - `update(dt: number, hero?: { x: number; z: number } | null): TownNight` (:2911)
  - `near(x: number, z: number, r?: number): NightMonster[]` (:2911)
  - `lit(x: number, z: number): boolean` (:2911)
  - `spawn(hero?: { x: number; z: number } | null): NightMonster | null` (:2912)
  - `kill(m: NightMonster): TownNight` (:2912)
  - `clear(): TownNight` (:2912)
  - `on(ev: 'spawn' | 'gone', fn: (m: NightMonster) => void): TownNight` (:2913)
  - `pack(): Loose` (:2913)
  - `unpack(d: Loose): TownNight` (:2913)
- `readonly ROUTINES: Record<string, TownSlot[]>` Each kind of townsperson's day. (:3024)
- `between(h: number, a: number, b: number): boolean` Is hour h in [a, b), wrapping midnight? (:3026)

## From the maker kit

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

## In real games

No game uses `gs.town` yet: the examples above are what there is.
