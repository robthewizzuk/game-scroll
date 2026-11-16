# gs.party

Pass-and-play turns, and split screens.

`gs.party` (`Turns` with hand-over, `Split` screens)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PartyPart`, line 3318), where every option and field is described.

- `Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns` (:3319)
  - `players: PartyPlayer[]` (:3308)
  - `i: number` (:3308)
  - `round: number` (:3308)
  - `handover: boolean` (:3308)
  - `waiting: boolean` (:3308)
  - `readonly player: PartyPlayer` (:3309)
  - `readonly leader: PartyPlayer` (:3309)
  - `readonly left: PartyPlayer[]` (:3309)
  - `readonly winners: PartyPlayer[]` (:3309)
  - `add(points: number, p?: PartyPlayer): Turns` (:3310)
  - `out(p?: PartyPlayer): Turns` (:3310)
  - `next(): Turns` (:3310)
  - `ready(): Turns` (:3310)
  - `over(rounds?: number): boolean` (:3310)
  - `cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void` (:3311)
  - `save(): Loose` (:3311)
  - `load(d: Loose): Turns` (:3311)
- `Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split` (:3320)
  - `w: number` (:3314)
  - `h: number` (:3314)
  - `n: number` (:3314)
  - `areas: { x: number; y: number; w: number; h: number; turn: number }[]` (:3314)
  - `resize(w: number, h: number): Split` (:3315)
  - `who(x: number, y: number): number` (:3315)
  - `local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number }` (:3315)
  - `begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }` (:3316)
  - `end(c: Ctx): void` (:3316)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Pass-and-play** (`gs.party`): `Turns({ players, names })` keeps whose go it is, scores and rounds,
with a hand-over pause (`turns.waiting`, `turns.ready()`, `turns.cover(c, W, H)`). `Split(W, H, { players,
facing })` splits the screen between players at once, turning the far half round for a player
sitting opposite (great on an unfolded phone laid flat).

## In real games

No game uses `gs.party` yet: the examples above are what there is.
