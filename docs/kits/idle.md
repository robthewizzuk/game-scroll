# gs.idle

Idle game maths: rising prices, big numbers, money earned while away.

`gs.idle` (`cost`, `afford`, `short`, `Earner`; `api.away()` for time away)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`IdlePart`, line 3331), where every option and field is described.

- `cost(base: number, growth: number, owned?: number, n?: number): number` (:3332)
- `afford(base: number, growth: number, owned: number, money: number, max?: number): number` (:3332)
- `short(n: number, digits?: number): string` (:3333)
- `curve(level: number, levels: number, from: number, to: number, power?: number): number` (:3333)
- `Earner: new (defs?: Record<string, Loose>, money?: number) => Earner` (:3334)
  - `defs: Record<string, { base: number; growth?: number; rate?: number; [k: string]: Loose }>` (:3327)
  - `owned: Record<string, number>` (:3327)
  - `money: number` (:3327)
  - `mult: number` (:3327)
  - `readonly perSecond: number` (:3327)
  - `add(id: string, def: { base: number; growth?: number; rate?: number; [k: string]: Loose }): Earner` (:3328)
  - `price(id: string, n?: number): number` (:3328)
  - `canBuy(id: string, n?: number): boolean` (:3328)
  - `buy(id: string, n?: number): boolean` (:3328)
  - `update(dt: number): Earner` (:3329)
  - `catchUp(seconds: number, share?: number): number` (:3329)
  - `save(): Loose` (:3329)
  - `load(d: Loose): Earner` (:3329)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Idle maths** (`gs.idle`): `cost` (prices that climb), `afford`, `short(1234567)` gives '1.23M', and
`Earner` for producers that earn per second. `api.away()` is the seconds since this game last ran
on this phone (at most a week), for money earned while away.

## In real games

No game uses `gs.idle` yet: the examples above are what there is.
