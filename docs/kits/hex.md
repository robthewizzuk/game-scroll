# gs.hex

Hex maps (taps, neighbours, reach, paths, sight) and isometric views.

`gs.hex` (`HexMap`: x, y is its top left, `cx, cy` centres it; taps, neighbours, `reach` with terrain costs, `path`, `sees`; `Iso` views)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`HexPart`, line 3135), where every option and field is described.

- `HexMap: new (o?: { size?: number; pointy?: boolean; shape?: 'rect' | 'hex' | 'none'; w?: number; h?: number; radius?: number; x?: number; y?: number; cx?: number; cy?:…` x, y: the map's TOP LEFT corner. (:3137)
  - `size: number` (:3119)
  - `pointy: boolean` (:3119)
  - `cells: Map<string, HexCell>` (:3119)
  - `readonly list: HexCell[]` (:3119)
  - `add(q: number, r: number): HexCell` (:3120)
  - `remove(c: HexCell): HexMap` (:3120)
  - `cell(q: number, r: number): HexCell | null` (:3120)
  - `at(x: number, y: number): HexCell | null` (:3120)
  - `each(fn: (c: HexCell) => void): HexMap` (:3120)
  - `neighbours(c: HexCell): HexCell[]` (:3121)
  - `distance(a: HexCell, b: HexCell): number` (:3121)
  - `line(a: HexCell, b: HexCell): HexCell[]` (:3121)
  - `range(c: HexCell, n: number): HexCell[]` (:3121)
  - `ring(c: HexCell, n: number): HexCell[]` (:3121)
  - `reach(from: HexCell, moves: number, cost?: (c: HexCell, from: HexCell) => number): Map<HexCell, number>` (:3122)
  - `path(a: HexCell, b: HexCell, cost?: (c: HexCell, from: HexCell) => number): HexCell[] | null` (:3122)
  - `sees(a: HexCell, b: HexCell, blocks?: (c: HexCell) => boolean): boolean` (:3123)
  - `save(): Loose` (:3123)
  - `load(d: Loose): HexMap` (:3123)
  - `readonly bounds: { x: number; y: number; w: number; h: number }` The box round every cell, in game units (x, y its top left). (:3125)
  - `shift(dx: number, dy: number): HexMap` (:3126)
  - `centre(x: number, y: number): HexMap` Moves the map so its middle is at x, y. (:3128)
- `Iso: new (o?: { tw?: number; th?: number; x?: number; y?: number; zh?: number | null }) => Iso` (:3138)
  - `tw: number` (:3131)
  - `th: number` (:3131)
  - `x: number` (:3131)
  - `y: number` (:3131)
  - `zh: number` (:3131)
  - `toScreen(tx: number, ty: number, z?: number): { x: number; y: number }` (:3132)
  - `toTile(x: number, y: number): { tx: number; ty: number }` (:3132)
  - `corners(tx: number, ty: number, z?: number): [number, number][]` (:3132)
  - `sort<T extends { tx: number; ty: number; z?: number }>(list: T[]): T[]` (:3133)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Hex maps and isometric views** (`gs.hex`, hex maths from honeycomb-grid): `HexMap({ size, pointy, shape:
'rect' | 'hex', w, h, radius, x, y })` gives cells with `q, r`, centre `x, y`, `corners` to draw and your
own `data`. The map's `x, y` is its **top left corner**, not its middle: pass `cx, cy` instead (e.g.
`cx: W / 2, cy: H / 2`) to centre it, or call `map.centre(x, y)` / `map.shift(dx, dy)` later; `map.bounds`
is its `{ x, y, w, h }` box. `at(x, y)` is the hex under a tap; `neighbours`, `distance`, `line`, `range`, `ring`;
`reach(from, moves, cost)` is everywhere a unit can move (a Map of cell to points spent, `cost(cell)`
Infinity for blocked); `path(a, b, cost)` the cheapest route; `sees(a, b, blocks)` line of sight.
`Iso({ tw, th, x, y })`: `toScreen(tx, ty, z)`, `toTile(x, y)` for taps, `corners`, `sort(things)` back to front.

## In real games

5 games use it (`node scripts/examples.mjs gs.hex` lists them). The shortest:

`src/games/hex-merge.js` (Hex Merge, Casual · Merge, 84 lines):

```js
const { Feel } = gs.effects;
const { HexMap } = gs.hex;
// …
    const size = Math.min(30, (W - 30) / 13);
    map = new HexMap({ size, shape: 'hex', radius: 3, pointy: true, x: (W - 7 * Math.sqrt(3) * size) / 2, y: H * .44 - size * 5.5 });
    map.each(c => { c.data.v = 0; });
// …
    const v = cell.data.v, seen = new Set([cell]), q = [cell];
    while (q.length) { const c = q.pop(); for (const n of map.neighbours(c)) if (!seen.has(n) && n.data.v === v) { seen.add(n); q.push(n); } }
// …
    reset() { score = 0; t = 0; best = 1; ended = false; pops = []; build(); next = 1; held = 2; feel.clear(); },
    resize(w, h) { W = w; H = h; if (map) { const old = map.list.map(c => [c.q, c.r, c.data.v]); build(); for (const [q, r, v] of old) { const c = map
// …
      feel.begin(c);
      map.each(cell => {
// …
      if (Math.hypot(x - (W / 2 + 100), y - (H - 110)) < 40) { [next, held] = [held, next]; sfx(600, .04, 'triangle', .03); haptic('tick'); return; }
      const cell = map.at(x, y); if (!cell || cell.data.v) return;
```

`src/games/gear-train.js` (Gear Train, Casual · Puzzle, 142 lines):

```js
const { sfx, notes } = gs.sound;
const { HexMap } = gs.hex;
// …
    const size = Math.min((W - 30) / (cols * 1.732 + .9), 30);
    map = new HexMap({ size, shape: 'rect', w: cols, h: rows, x: 0, y: 0 });
    let mx = Infinity, Mx = -Infinity, my = Infinity, My = -Infinity; map.each(c => { mx = Math.min(mx, c.x); Mx = Math.max(Mx, c.x); my = Math.min(my
// …
    const dx = (W - (Mx - mx)) / 2 - mx, dy = 150 + (H - 230 - (My - my)) / 2 - my;
    map.each(c => { c.x += dx; c.y += dy; for (const p of c.corners) { p[0] += dx; p[1] += dy; } });
// …
    // a chord-free random walk from the motor gives a chain that works; its length sets the target's way
    const all = []; map.each(c => all.push(c));
// …
        const cur = path[path.length - 1];
        const opts = map.neighbours(cur).filter(n => !used.has(key(n)) && map.neighbours(n).filter(m => used.has(key(m))).length === 1);
// …
      }
      if (path.length < want + 2 || map.distance(path[0], path[path.length - 1]) < 3) continue;
// …
      const chain = path.length - 2; need = chain % 2 === 0 ? -1 : 1;   // motor turns +1 (clockwise)
      map.each(c => { c.data = {}; });
```
