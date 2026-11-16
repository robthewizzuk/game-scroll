# gs.sketch

Hand-drawn looks (sketchy shapes) and ink lines the player draws.

`gs.sketch` (hand-drawn looks): `Sketch({ stroke, roughness, boil })` `rect`/`circle`/`ellipse`/`line`/`poly`/`lines`/`curve`/`arc`/`path` with `{ fill, fillStyle: 'hachure'|'solid'|'cross-hatch'|'zigzag'|'dots' }`; `Ink({ size, taper, color })` `add(x, y)`/`end()`/`draw(c)`/`hit(x, y)` for lines the player draws, `ink(c, points)`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SketchPart`, line 705), where every option and field is described.

- `Sketch: new (o?: SketchOptions & { seed?: number; boil?: number }) => { boil: number; seed: number; readonly remembered: number; update(dt: number): void; clear(): voi…` A pen that draws sketchy shapes. (:710)
- `Ink: new (o?: InkOptions) => { readonly points: number[][]; readonly length: number; done: boolean; add(x: number, y: number, pressure?: number): Loose; end(): Loose; …` One ink stroke that grows as points are added and remembers its shape: add(x, y) while the finger moves, end() when it lifts, draw(c) each frame. (:729)
- `ink(c: Ctx, points: InkPoint[] | { points: InkPoint[] }, o?: InkOptions): boolean` Draws one ink stroke through the points in one call (a gs.strokes Stroke works too). (:738)
- `inkOutline(points: InkPoint[] | { points: InkPoint[] }, o?: InkOptions, done?: boolean): number[][]` The outline of an ink stroke: [[x, y], ...], a closed shape to fill or to test. (:740)

## From the maker kit

From [Sketchy shapes and ink](../maker-kit.md#sketchy-shapes-and-ink):

`const { Sketch, Ink, ink } = gs.sketch;` (Rough.js and perfect-freehand; loads on first use)

A hand-drawn look: shapes that look sketched with a pen, and ink lines that swell and taper.

```js
reset() { pen = new Sketch({ stroke: '#2b2b2b', strokeWidth: 2, roughness: 1.2 }); }
draw(c) {
  pen.rect(c, 40, 80, 120, 60, { fill: '#ffd23f' });                      // wobbly outline, hatched fill
  pen.circle(c, 200, 110, 28, { fill: '#4fc3ff', fillStyle: 'solid' });
  pen.line(c, 20, 200, 340, 204);
}
```

- Shapes: `rect(c, x, y, w, h)`, `circle(c, x, y, r)`, `ellipse(c, x, y, rx, ry)`, `line(c, x1, y1, x2, y2)`,
  `poly(c, points)` (closed), `lines(c, points)` (open), `curve(c, points)`, `arc(c, x, y, r, from, to, { closed })`,
  `path(c, x, y, 'M0 0 L40 0 ...')`. Points are `[x, y]` or `{ x, y }`.
- Options, for the pen and again for one shape: `stroke` (or `'none'`), `strokeWidth`, `fill`,
  `fillStyle` (`'hachure'`, `'solid'`, `'zigzag'`, `'cross-hatch'`, `'dots'`, `'dashed'`, `'zigzag-line'`),
  `hachureGap`, `hachureAngle`, `fillWeight`, `roughness` (0 is a ruler, 1 a steady hand, 3 a shaky
  one), `bowing`, `dash: [on, off]`, `seed` (a different hand).
- A shape is worked out once and remembered, wherever it is drawn, so moving it is free and its wobble
  stays put instead of crawling. A shape that changes size is worked out again at each new size (sizes
  are kept to half a unit), so grow things in steps or keep them in a `gs.gfx.sticker`.
- `new Sketch({ boil: 8 })` with `pen.update(dt)` each frame redraws the wobble 8 times a second: the
  "line boil" of hand-drawn cartoons.

Ink is for lines the player draws (and any line of many points):

```js
down(x, y) { line = new Ink({ size: 10, color: '#1b1b3a' }); line.add(x, y); }
move(x, y, pressed) { if (pressed) line.add(x, y); }
up() { line.end(); }
draw(c) { line.draw(c); }                 // touch: 'fine' in the definition gives it every reading of the finger
```

- `Ink` options: `size` (the widest the line gets), `thinning` (.5: a fast line is thinner; 0 for an
  even line), `smoothing`, `streamline` (.5: how much the line lags to iron out a shaky hand), `taper`
  (a length, or `{ start, end }`: the ends thin to a point), `color`.
- `line.outline()` is the stroke's shape as points, `line.hit(x, y, r)` says whether a point is on it,
  `line.clear()` starts again. `ink(c, points, options)` draws a stroke in one call; for a line through
  a few far-apart points add `spacing: 6`, which adds points in between so it follows them.
- With `gs.strokes` (`Stroke`, `Shapes`, `toPhysics`) the same points can be recognised as a shape or
  turned into ground; this kit only makes the line look inked.

## In real games

No game uses `gs.sketch` yet: the examples above are what there is.
