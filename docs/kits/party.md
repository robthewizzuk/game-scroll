# gs.party

Pass-and-play turns, and split screens.

`gs.party` (`Turns` with hand-over, `Split` screens)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PartyPart`, line 3349), where every option and field is described.

- `Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns` (:3350)
  - `players: PartyPlayer[]` (:3339)
  - `i: number` (:3339)
  - `round: number` (:3339)
  - `handover: boolean` (:3339)
  - `waiting: boolean` (:3339)
  - `readonly player: PartyPlayer` (:3340)
  - `readonly leader: PartyPlayer` (:3340)
  - `readonly left: PartyPlayer[]` (:3340)
  - `readonly winners: PartyPlayer[]` (:3340)
  - `add(points: number, p?: PartyPlayer): Turns` (:3341)
  - `out(p?: PartyPlayer): Turns` (:3341)
  - `next(): Turns` (:3341)
  - `ready(): Turns` (:3341)
  - `over(rounds?: number): boolean` (:3341)
  - `cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void` (:3342)
  - `save(): Loose` (:3342)
  - `load(d: Loose): Turns` (:3342)
- `Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split` (:3351)
  - `w: number` (:3345)
  - `h: number` (:3345)
  - `n: number` (:3345)
  - `areas: { x: number; y: number; w: number; h: number; turn: number }[]` (:3345)
  - `resize(w: number, h: number): Split` (:3346)
  - `who(x: number, y: number): number` (:3346)
  - `local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number }` (:3346)
  - `begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }` (:3347)
  - `end(c: Ctx): void` (:3347)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Pass-and-play** (`gs.party`): `Turns({ players, names })` keeps whose go it is, scores and rounds,
with a hand-over pause (`turns.waiting`, `turns.ready()`, `turns.cover(c, W, H)`). `Split(W, H, { players,
facing })` splits the screen between players at once, turning the far half round for a player
sitting opposite (great on an unfolded phone laid flat).

## In real games

No game uses `gs.party` yet: the examples above are what there is.
