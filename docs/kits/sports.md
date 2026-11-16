# gs.sports

Team sports AI: pitches, formations, marking, passing and shooting.

`gs.sports` (`Pitch`, `Team.think`: formations, chase, mark, support, shoot/pass/dribble)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SportsPart`, line 3318), where every option and field is described.

- `Pitch: new (o?: { w?: number; h?: number; goal?: number; x?: number; y?: number }) => SportsPitch` (:3319)
  - `w: number` (:3308)
  - `h: number` (:3308)
  - `goal: number` (:3308)
  - `x: number` (:3308)
  - `y: number` (:3308)
  - `goalFor(side: 0 | 1): { x: number; y: number; half: number }` (:3308)
  - `toPitch(side: 0 | 1, u: number, v: number): { x: number; y: number }` (:3308)
  - `upfield(side: 0 | 1, p: { x: number; y: number }): number` (:3308)
- `Team: new (pitch: SportsPitch, side: 0 | 1, o?: { formation?: string | [number, number][]; skill?: Skill; shootRange?: number | null; keeper?: boolean | null; players?…` (:3320)
  - `pitch: SportsPitch` (:3311)
  - `side: 0 | 1` (:3311)
  - `skill: Skill` (:3311)
  - `keeper: boolean` (:3311)
  - `shootRange: number` (:3311)
  - `players: Loose[]` (:3311)
  - `chaser: Loose` (:3311)
  - `plan: Map<Loose, SportsAct>` (:3311)
  - `readonly coach: Coach | null` With coach: about the last choice of the one with the ball ('shoot' | 'pass' | 'dribble'): team.coach.correct('pass'), team.coach.avoid('shoot'), team.coach.recalled. (:3313)
  - `home(p: Loose, ball: { x: number; y: number }): { x: number; y: number }` (:3314)
  - `think(world: { ball: { x: number; y: number; vx?: number; vy?: number; owner?: Loose }; mates?: Loose[]; foes?: Loose[] }, dt?: number): Map<Loose, SportsAct>` (:3315)
  - `kick(p: { x: number; y: number }, at: { x: number; y: number }, power: number): { x: number; y: number; power: number }` (:3316)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Team sports AI** (`gs.sports`): `Pitch({ w, h, goal })` (team 0 attacks the top) and `Team(pitch,
side, { formation: '2-2' | 'k-3-2' | ..., skill })`. `team.think({ ball, foes }, dt)` returns a Map of
each player (not marked `human`) to `{ do, x, y, kick }`: one chases the ball, the rest slide with the
formation, find space when you have the ball or mark someone goal side when you don't; the one with
the ball shoots at the most open corner, passes along the clearest lane, or runs on. Your game moves
the players towards x, y and applies the kick. `home(p, ball)` is where a player belongs now.

## In real games

No game uses `gs.sports` yet: the examples above are what there is.
