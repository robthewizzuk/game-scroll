# gs.things

Game objects: add, tag, hit tests between tags, near, nearest, reuse; parent and child Nodes.

`gs.things.Things` (game objects): `add(obj, tag)`, `hit(obj, tag)`, `hits(tagA, tagB, fn)`, `near`, `nearest`, `kill`, `reuse`, `each`, `all`.

`gs.things.Node`: parent and child places (`add`, `update()`, `wx`/`wy`/`wangle`, `toWorld`, `hit`, `pick`, `attach`, `draw`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ThingsPart`, line 935), where every option and field is described.

- `Node: typeof Node` (:936)
  - `constructor(o?: { x?: number; y?: number; angle?: number; scale?: number; r?: number; w?: number; h?: number; [k: string]: Loose })` (:926)
  - `x: number` (:927)
  - `y: number` (:927)
  - `angle: number` (:927)
  - `scale: number` (:927)
  - `visible: boolean` (:927)
  - `r?: number` (:927)
  - `w?: number` (:927)
  - `h?: number` (:927)
  - `readonly wx: number` (:928)
  - `readonly wy: number` (:928)
  - `readonly wangle: number` (:928)
  - `readonly wscale: number` (:928)
  - `parent: Node | null` (:929)
  - `children: Node[]` (:929)
  - `add<T extends Node>(child: T): T` (:930)
  - `remove<T extends Node>(child: T): T` (:930)
  - `attach(parent: Node | null): this` (:930)
  - `update(): this` (:930)
  - `toWorld(x: number, y: number): XY` (:931)
  - `toLocal(x: number, y: number): XY` (:931)
  - `hit(x: number, y: number): boolean` (:931)
  - `pick(x: number, y: number): Node | null` (:931)
  - `each(fn: (n: Node) => void): this` (:932)
  - `draw(c: Ctx, fn: (c: Ctx, n: Node) => void): this` (:932)
- `Things: new (o?: { plane?: 'xy' | 'xz'; cell?: number }) => { add<T extends object>(obj: T, ...tags: string[]): T & Thing; reuse<T extends object>(tag: string, make?: …` (:937)

## From the maker kit

From [Game objects](../maker-kit.md#game-objects):

`const { Things } = gs.things;` A light list of your game's objects with tags, so collisions and
"what's nearest" are one line. They stay your own plain objects: you move and draw them.

```js
reset() { things = new Things(); player = things.add({ x: 180, y: 600, r: 14 }, 'player'); }
update(dt) {
  things.each('bullet', b => { b.y -= 400 * dt; });
  things.hits('bullet', 'enemy', (b, e) => { things.kill(b); if (--e.hp <= 0) things.kill(e); });
  const coin = things.hit(player, 'coin'); if (coin) { things.kill(coin); score++; }
  things.cull(0, 0, W, H, 20, 'bullet');      // gone off screen
  things.update(dt);                          // calls each thing's own update(dt) if it has one, drops killed ones
}
draw(c) { for (const e of things.all('enemy')) drawEnemy(c, e); }
```

- Shapes: `r` (circle), `w` + `h` (box centred on x, y) or neither (a point). A thing can have several tags.
- `all(tag)`, `count(tag)`, `first(tag)`, `each(tag, fn)`, `hit(obj, tag)`, `hitsOf(obj, tag)`,
  `hits(tagA, tagB, fn)` (fast with hundreds), `near(x, y, r, tag)`, `nearest(x, y, tag)`, `tag()`, `untag()`, `is()`.
- `reuse(tag, make, init)` recycles killed objects (less garbage in busy games).
- 3D games: `new Things({ plane: 'xz' })` uses x and z.

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Parent and child** (`gs.things.Node`): a turret on a tank, a rider on a horse, a moon round a
planet. Nodes have `x`, `y`, `angle`, `scale` relative to their parent; `root.update()` works out
`wx`, `wy`, `wangle`, `wscale` for all of them. `toWorld`, `toLocal`, `hit` (rotated boxes and circles),
`pick` (the top node under a tap), `attach(newParent)` (keeps it where it is) and `draw(c, fn)`.

## In real games

No game uses `gs.things` yet: the examples above are what there is.
