# gs.party

Pass-and-play turns, and split screens.

`gs.party` (`Turns` with hand-over, `Split` screens)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PartyPart`, line 3285), where every option and field is described.

- `Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns` (:3286)
  - `players: PartyPlayer[]` (:3275)
  - `i: number` (:3275)
  - `round: number` (:3275)
  - `handover: boolean` (:3275)
  - `waiting: boolean` (:3275)
  - `readonly player: PartyPlayer` (:3276)
  - `readonly leader: PartyPlayer` (:3276)
  - `readonly left: PartyPlayer[]` (:3276)
  - `readonly winners: PartyPlayer[]` (:3276)
  - `add(points: number, p?: PartyPlayer): Turns` (:3277)
  - `out(p?: PartyPlayer): Turns` (:3277)
  - `next(): Turns` (:3277)
  - `ready(): Turns` (:3277)
  - `over(rounds?: number): boolean` (:3277)
  - `cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void` (:3278)
  - `save(): Loose` (:3278)
  - `load(d: Loose): Turns` (:3278)
- `Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split` (:3287)
  - `w: number` (:3281)
  - `h: number` (:3281)
  - `n: number` (:3281)
  - `areas: { x: number; y: number; w: number; h: number; turn: number }[]` (:3281)
  - `resize(w: number, h: number): Split` (:3282)
  - `who(x: number, y: number): number` (:3282)
  - `local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number }` (:3282)
  - `begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }` (:3283)
  - `end(c: Ctx): void` (:3283)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Pass-and-play** (`gs.party`): `Turns({ players, names })` keeps whose go it is, scores and rounds,
with a hand-over pause (`turns.waiting`, `turns.ready()`, `turns.cover(c, W, H)`). `Split(W, H, { players,
facing })` splits the screen between players at once, turning the far half round for a player
sitting opposite (great on an unfolded phone laid flat).

## In real games

No game uses `gs.party` yet: the examples above are what there is.
