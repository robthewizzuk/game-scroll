# gs.party

Pass-and-play turns, and split screens.

`gs.party` (`Turns` with hand-over, `Split` screens)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PartyPart`, line 3275), where every option and field is described.

- `Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns` (:3276)
  - `players: PartyPlayer[]` (:3265)
  - `i: number` (:3265)
  - `round: number` (:3265)
  - `handover: boolean` (:3265)
  - `waiting: boolean` (:3265)
  - `readonly player: PartyPlayer` (:3266)
  - `readonly leader: PartyPlayer` (:3266)
  - `readonly left: PartyPlayer[]` (:3266)
  - `readonly winners: PartyPlayer[]` (:3266)
  - `add(points: number, p?: PartyPlayer): Turns` (:3267)
  - `out(p?: PartyPlayer): Turns` (:3267)
  - `next(): Turns` (:3267)
  - `ready(): Turns` (:3267)
  - `over(rounds?: number): boolean` (:3267)
  - `cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void` (:3268)
  - `save(): Loose` (:3268)
  - `load(d: Loose): Turns` (:3268)
- `Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split` (:3277)
  - `w: number` (:3271)
  - `h: number` (:3271)
  - `n: number` (:3271)
  - `areas: { x: number; y: number; w: number; h: number; turn: number }[]` (:3271)
  - `resize(w: number, h: number): Split` (:3272)
  - `who(x: number, y: number): number` (:3272)
  - `local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number }` (:3272)
  - `begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }` (:3273)
  - `end(c: Ctx): void` (:3273)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Pass-and-play** (`gs.party`): `Turns({ players, names })` keeps whose go it is, scores and rounds,
with a hand-over pause (`turns.waiting`, `turns.ready()`, `turns.cover(c, W, H)`). `Split(W, H, { players,
facing })` splits the screen between players at once, turning the far half round for a player
sitting opposite (great on an unfolded phone laid flat).

## In real games

No game uses `gs.party` yet: the examples above are what there is.
