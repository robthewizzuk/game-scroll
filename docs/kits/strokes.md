# gs.strokes

Drawn shapes: smoothed finger lines, a shape recogniser, lines into physics.

`gs.strokes` (`Stroke`, `Shapes` recogniser, `toPhysics`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`StrokesPart`, line 3303), where every option and field is described.

- `SHAPES: readonly string[]` (:3304)
- `Stroke: new (o?: { smooth?: number; gap?: number }) => Stroke` (:3305)
  - `points: Pt[]` (:3298)
  - `length: number` (:3298)
  - `readonly first: Pt` (:3298)
  - `readonly last: Pt` (:3298)
  - `readonly closed: boolean` (:3298)
  - `readonly turns: number` (:3298)
  - `readonly bounds: { x: number; y: number; w: number; h: number; cx: number; cy: number }` (:3299)
  - `add(x: number, y: number): Stroke` (:3300)
  - `simplify(tolerance?: number): Pt[]` (:3300)
  - `resample(n?: number): Pt[]` (:3300)
  - `draw(c: Ctx, o?: { width?: number; color?: string; cap?: CanvasLineCap }): void` (:3301)
- `Shapes: new (names?: readonly string[], o?: { n?: number; sure?: number }) => { add(name: string, points: Pt[]): Loose; match(points: Pt[], o?: { min?: number }): { na…` (:3306)
- `toPhysics(phys: Loose, points: Pt[], o?: { thick?: number; fixed?: boolean; [k: string]: Loose }): Loose` (:3309)
- `pathLength(p: Pt[]): number` (:3310)
- `bounds(p: Pt[]): { x: number; y: number; w: number; h: number; cx: number; cy: number }` (:3310)
- `resample(p: Pt[], n?: number): Pt[]` (:3310)
- `simplify(p: Pt[], tol?: number): Pt[]` (:3310)

## From the maker kit

From [Sketchy shapes and ink](../maker-kit.md#sketchy-shapes-and-ink):

- With `gs.strokes` (`Stroke`, `Shapes`, `toPhysics`) the same points can be recognised as a shape or
  turned into ground; this kit only makes the line look inked.

From [Game kits](../maker-kit.md#game-kits):

**Drawn shapes** (`gs.strokes`): `Stroke` records a smoothed finger line. `Shapes` recognises circle,
line, triangle, square, check, caret, zigzag, heart, star, spiral, wave, cross, or shapes you add as
points, drawn any size and either way round. `match()` gives `{ name, score, sure }`. `toPhysics()`
turns a drawn line into a `gs.physics` ramp or a falling object.

From [Hearing, doodles and the phone's AI](../maker-kit.md#hearing-doodles-and-the-phones-ai):

Measured on the dataset's own pictures of drawings it never saw: 76 in 100 are named right among
all 200, 89 in 100 are in its first three guesses, and 96 in 100 are right when the game asks it to
choose among five. So pass `among` with the few things your game cares about, and take the top guess
only when its `sure` is high. Animals that look alike as doodles are the hard ones (dog, bear, bird,
frog, raccoon and tiger are right a third to a half of the time among all 200): don't put two of
those in one `among`. Drawn from strokes, the way a game does it, on 2,100 real drawings of 14 things
(nine of them look-alike animals): 60 in 100 right among all 200, 80 in its first three, 95 among
five. The model is about 440 KB and is only fetched by a game that uses it. For plain shapes,
`gs.strokes` `Shapes` needs no model.

## In real games

1 game uses it (`node scripts/examples.mjs gs.strokes` lists them). The shortest:

`src/games/ink-ward.js` (Ink Ward, spike, 166 lines):

```js
const { Physics } = gs.physics;
const { Stroke } = gs.strokes;
// …
    },
    down(x, y) { ready.go(); if (ended) return; erasing = lineNear(x, y); stroke = new Stroke().add(x, y); },
```
