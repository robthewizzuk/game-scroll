# gs.idle

Idle game maths: rising prices, big numbers, money earned while away.

`gs.idle` (`cost`, `afford`, `short`, `Earner`; `api.away()` for time away)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`IdlePart`, line 3257), where every option and field is described.

- `cost(base: number, growth: number, owned?: number, n?: number): number` (:3258)
- `afford(base: number, growth: number, owned: number, money: number, max?: number): number` (:3258)
- `short(n: number, digits?: number): string` (:3259)
- `curve(level: number, levels: number, from: number, to: number, power?: number): number` (:3259)
- `Earner: new (defs?: Record<string, Loose>, money?: number) => Earner` (:3260)
  - `defs: Record<string, { base: number; growth?: number; rate?: number; [k: string]: Loose }>` (:3253)
  - `owned: Record<string, number>` (:3253)
  - `money: number` (:3253)
  - `mult: number` (:3253)
  - `readonly perSecond: number` (:3253)
  - `add(id: string, def: { base: number; growth?: number; rate?: number; [k: string]: Loose }): Earner` (:3254)
  - `price(id: string, n?: number): number` (:3254)
  - `canBuy(id: string, n?: number): boolean` (:3254)
  - `buy(id: string, n?: number): boolean` (:3254)
  - `update(dt: number): Earner` (:3255)
  - `catchUp(seconds: number, share?: number): number` (:3255)
  - `save(): Loose` (:3255)
  - `load(d: Loose): Earner` (:3255)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Idle maths** (`gs.idle`): `cost` (prices that climb), `afford`, `short(1234567)` gives '1.23M', and
`Earner` for producers that earn per second. `api.away()` is the seconds since this game last ran
on this phone (at most a week), for money earned while away.

## In real games

No game uses `gs.idle` yet: the examples above are what there is.
