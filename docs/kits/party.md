# gs.party

Pass-and-play turns, and split screens.

`gs.party` (`Turns` with hand-over, `Split` screens)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PartyPart`, line 3280), where every option and field is described.

- `Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns` (:3281)
  - `players: PartyPlayer[]` (:3270)
  - `i: number` (:3270)
  - `round: number` (:3270)
  - `handover: boolean` (:3270)
  - `waiting: boolean` (:3270)
  - `readonly player: PartyPlayer` (:3271)
  - `readonly leader: PartyPlayer` (:3271)
  - `readonly left: PartyPlayer[]` (:3271)
  - `readonly winners: PartyPlayer[]` (:3271)
  - `add(points: number, p?: PartyPlayer): Turns` (:3272)
  - `out(p?: PartyPlayer): Turns` (:3272)
  - `next(): Turns` (:3272)
  - `ready(): Turns` (:3272)
  - `over(rounds?: number): boolean` (:3272)
  - `cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void` (:3273)
  - `save(): Loose` (:3273)
  - `load(d: Loose): Turns` (:3273)
- `Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split` (:3282)
  - `w: number` (:3276)
  - `h: number` (:3276)
  - `n: number` (:3276)
  - `areas: { x: number; y: number; w: number; h: number; turn: number }[]` (:3276)
  - `resize(w: number, h: number): Split` (:3277)
  - `who(x: number, y: number): number` (:3277)
  - `local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number }` (:3277)
  - `begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }` (:3278)
  - `end(c: Ctx): void` (:3278)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Pass-and-play** (`gs.party`): `Turns({ players, names })` keeps whose go it is, scores and rounds,
with a hand-over pause (`turns.waiting`, `turns.ready()`, `turns.cover(c, W, H)`). `Split(W, H, { players,
facing })` splits the screen between players at once, turning the far half round for a player
sitting opposite (great on an unfolded phone laid flat).

## In real games

No game uses `gs.party` yet: the examples above are what there is.
