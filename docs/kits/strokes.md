# gs.strokes

Drawn shapes: smoothed finger lines, a shape recogniser, lines into physics.

`gs.strokes` (`Stroke`, `Shapes` recogniser, `toPhysics`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`StrokesPart`, line 3308), where every option and field is described.

- `SHAPES: readonly string[]` (:3309)
- `Stroke: new (o?: { smooth?: number; gap?: number }) => Stroke` (:3310)
  - `points: Pt[]` (:3303)
  - `length: number` (:3303)
  - `readonly first: Pt` (:3303)
  - `readonly last: Pt` (:3303)
  - `readonly closed: boolean` (:3303)
  - `readonly turns: number` (:3303)
  - `readonly bounds: { x: number; y: number; w: number; h: number; cx: number; cy: number }` (:3304)
  - `add(x: number, y: number): Stroke` (:3305)
  - `simplify(tolerance?: number): Pt[]` (:3305)
  - `resample(n?: number): Pt[]` (:3305)
  - `draw(c: Ctx, o?: { width?: number; color?: string; cap?: CanvasLineCap }): void` (:3306)
- `Shapes: new (names?: readonly string[], o?: { n?: number; sure?: number }) => { add(name: string, points: Pt[]): Loose; match(points: Pt[], o?: { min?: number }): { na…` (:3311)
- `toPhysics(phys: Loose, points: Pt[], o?: { thick?: number; fixed?: boolean; [k: string]: Loose }): Loose` (:3314)
- `pathLength(p: Pt[]): number` (:3315)
- `bounds(p: Pt[]): { x: number; y: number; w: number; h: number; cx: number; cy: number }` (:3315)
- `resample(p: Pt[], n?: number): Pt[]` (:3315)
- `simplify(p: Pt[], tol?: number): Pt[]` (:3315)

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

2 games use it (`node scripts/examples.mjs gs.strokes` lists them). The shortest:

`src/games/ink-ward.js` (Ink Ward, spike, 166 lines):

```js
const { Physics } = gs.physics;
const { Stroke } = gs.strokes;
// …
    },
    down(x, y) { ready.go(); if (ended) return; erasing = lineNear(x, y); stroke = new Stroke().add(x, y); },
```

`src/games/spell-school.js` (Spell School, Advance · Magic, 420 lines):

```js
const { text } = gs.pixel;
const { resample, simplify, pathLength, bounds, Shapes } = gs.strokes;
// …
const IDEAL = { '-': [[0, .5], [1, .5]], '|': [[.5, 0], [.5, 1]], V: [[0, 0], [.5, 1], [1, 0]], '^': [[0, 1], [.5, 0], [1, 1]], O: ring(24) };
const CLOSED = new Shapes(['circle', 'heart', 'star', 'triangle', 'square']);
// …
  if (pts.length < 3) return null;
  const raw = pts.map(p => [p.x, p.y]), len = pathLength(raw);
// …
  if (len < 12) return null;
  const p = resample(raw, 48), b = bounds(p), size = Math.max(b.w, b.h);
// …
    let e = 0; for (const q of p) { let m = Infinity; for (let i = 1; i < T.length; i++) m = Math.min(m, segDist(q, T[i - 1], T[i])); e += m; }
    const ts = resample(T, 24); let f = 0; for (const q of ts) { let m = Infinity; for (const s of p) m = Math.min(m, Math.hypot(q[0] - s[0], q[1] - s
// …
  const runsAt = tol => {
    const q = simplify(p, Math.max(1.5, size * tol)), segs = [];
// …
  // STAR: five points drawn in one line goes twice round its middle, with hard corners
  if (closed && sweep > 1.5 && sweep < 2.6 && sharp >= 4) { const m = CLOSED.rank(p); if (m[0].name === 'star') return out('S', 1); }
// …
  if (closed && sweep > .72 && sweep < 1.6 && Math.min(b.w, b.h) > size * .4) {
    const m = CLOSED.rank(p), top = m[0];
```
