# gs.sports

Team sports AI: pitches, formations, marking, passing and shooting.

`gs.sports` (`Pitch`, `Team.think`: formations, chase, mark, support, shoot/pass/dribble)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SportsPart`, line 3246), where every option and field is described.

- `Pitch: new (o?: { w?: number; h?: number; goal?: number; x?: number; y?: number }) => SportsPitch` (:3247)
  - `w: number` (:3236)
  - `h: number` (:3236)
  - `goal: number` (:3236)
  - `x: number` (:3236)
  - `y: number` (:3236)
  - `goalFor(side: 0 | 1): { x: number; y: number; half: number }` (:3236)
  - `toPitch(side: 0 | 1, u: number, v: number): { x: number; y: number }` (:3236)
  - `upfield(side: 0 | 1, p: { x: number; y: number }): number` (:3236)
- `Team: new (pitch: SportsPitch, side: 0 | 1, o?: { formation?: string | [number, number][]; skill?: Skill; shootRange?: number | null; keeper?: boolean | null; players?…` (:3248)
  - `pitch: SportsPitch` (:3239)
  - `side: 0 | 1` (:3239)
  - `skill: Skill` (:3239)
  - `keeper: boolean` (:3239)
  - `shootRange: number` (:3239)
  - `players: Loose[]` (:3239)
  - `chaser: Loose` (:3239)
  - `plan: Map<Loose, SportsAct>` (:3239)
  - `readonly coach: Coach | null` With coach: about the last choice of the one with the ball ('shoot' | 'pass' | 'dribble'): team.coach.correct('pass'), team.coach.avoid('shoot'), team.coach.recalled. (:3241)
  - `home(p: Loose, ball: { x: number; y: number }): { x: number; y: number }` (:3242)
  - `think(world: { ball: { x: number; y: number; vx?: number; vy?: number; owner?: Loose }; mates?: Loose[]; foes?: Loose[] }, dt?: number): Map<Loose, SportsAct>` (:3243)
  - `kick(p: { x: number; y: number }, at: { x: number; y: number }, power: number): { x: number; y: number; power: number }` (:3244)

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
