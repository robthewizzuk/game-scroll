# gs.party

Pass-and-play turns, and split screens.

`gs.party` (`Turns` with hand-over, `Split` screens)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PartyPart`, line 3289), where every option and field is described.

- `Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns` (:3290)
  - `players: PartyPlayer[]` (:3279)
  - `i: number` (:3279)
  - `round: number` (:3279)
  - `handover: boolean` (:3279)
  - `waiting: boolean` (:3279)
  - `readonly player: PartyPlayer` (:3280)
  - `readonly leader: PartyPlayer` (:3280)
  - `readonly left: PartyPlayer[]` (:3280)
  - `readonly winners: PartyPlayer[]` (:3280)
  - `add(points: number, p?: PartyPlayer): Turns` (:3281)
  - `out(p?: PartyPlayer): Turns` (:3281)
  - `next(): Turns` (:3281)
  - `ready(): Turns` (:3281)
  - `over(rounds?: number): boolean` (:3281)
  - `cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void` (:3282)
  - `save(): Loose` (:3282)
  - `load(d: Loose): Turns` (:3282)
- `Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split` (:3291)
  - `w: number` (:3285)
  - `h: number` (:3285)
  - `n: number` (:3285)
  - `areas: { x: number; y: number; w: number; h: number; turn: number }[]` (:3285)
  - `resize(w: number, h: number): Split` (:3286)
  - `who(x: number, y: number): number` (:3286)
  - `local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number }` (:3286)
  - `begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }` (:3287)
  - `end(c: Ctx): void` (:3287)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Pass-and-play** (`gs.party`): `Turns({ players, names })` keeps whose go it is, scores and rounds,
with a hand-over pause (`turns.waiting`, `turns.ready()`, `turns.cover(c, W, H)`). `Split(W, H, { players,
facing })` splits the screen between players at once, turning the far half round for a player
sitting opposite (great on an unfolded phone laid flat).

## In real games

No game uses `gs.party` yet: the examples above are what there is.
