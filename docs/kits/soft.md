# gs.soft

Soft things: cloth, rope and jelly to grab and cut; 2D liquid.

`gs.soft` (`Soft` cloth/rope/jelly with `grab`/`cut`, `Liquid`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SoftPart`, line 5561), where every option and field is described.

- `Soft: new (o?: { gravity?: P3 | null; dims?: 2 | 3; iterations?: number; damping?: number; bounds?: [number, number, number, number] | null; floor?: number | null; bou…` world: a 2D gs.physics world whose shapes the points stay out of; weight: kg a point, to push loose things there back. (:5563)
- `Liquid: new (o?: { r?: number; gravity?: number; stiff?: number; near?: number; rest?: number; viscosity?: number; bounds?: [number, number, number, number]; max?: num…` A simple 2D liquid (particles that pool and splash). (:5576)

## From the maker kit

From [Physics](../maker-kit.md#physics):

- **Things that aren't bodies** (your own particles, `gs.soft`'s points): `near(x0, y0, x1, y1)` gives the shapes in a
  box and `outOf(x, y, r, shapes)` says where a point of radius `r` must go to be out of them (`null` when it's clear).

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Soft things** (`gs.soft`): `Soft()` is a light Verlet world (2D, or 3D with `dims: 3`): `cloth()` (pinned
along the top, tears if you like), `rope()`, `jelly()` (a pressure blob that squashes and springs
back), with round and box `solids` to hit. `grab(x, y)` lets a finger pull a point, `cut()` slices
everything a swipe crosses, `push()` blasts and `wind()` blows. Draw the points your way, or send a
3D cloth to a mesh with `toGeometry()`. In a game with a physics world (2D or 3D) the points stay out of
its shapes and press on loose ones. `Liquid()` is a simple 2D liquid of particles that pools,
splashes and pours (`pour()`, `near()`, `count()`) for water and goo puzzles.

## In real games

1 game uses it (`node scripts/examples.mjs gs.soft` lists them). The shortest:

`src/games/goo-squeeze.js` (Goo Squeeze, shelf, 938 lines):

```js
const { Physics } = gs.physics;
const { Soft } = gs.soft;
// …
    pushBuf.x = hx; pushBuf.y = hy; pushBuf.z = 0;
    soft.push(pushBuf, 110, pushForce);
// …
      phys = new Physics({ gravity: 450 });
      soft = new Soft({
// …

      jelly = soft.jelly(W * 0.5, H - 120, 28, 12, { pressure: K.pressure, stiff: 0.88, mass: 1 });
// …
      phys.step(dt);
      soft.update(dt);
// …
      const wx = x, wy = y + camY;
      const g = soft.grab(wx, wy, K.grabReach);
```
