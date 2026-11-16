# gs.drag

Drag and drop: pieces, slots, snapping, reordering lists.

`gs.drag.Drag` (pieces, slots, snap, lists)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`DragPart`, line 3322), where every option and field is described.

- `Drag: new (o?: { snap?: number; accept?: (piece: DragThing, slot: DragThing) => boolean; lift?: number; speed?: number; list?: { x: number; y: number; gap?: number; ax…` (:3322)
  - `pieces: DragThing[]` (:2909)
  - `slots: DragThing[]` (:2909)
  - `readonly busy: boolean` (:2909)
  - `readonly order: DragThing[]` (:2909)
  - `on(ev: 'pick' | 'over' | 'drop' | 'reject' | 'home' | 'reorder', fn: (...a: Loose[]) => void): Drag` (:2910)
  - `piece<T extends DragThing>(p: T): T` (:2911)
  - `slot<T extends DragThing>(s: T): T` (:2911)
  - `remove(p: DragThing): void` (:2911)
  - `at(x: number, y: number): DragThing | null` (:2911)
  - `down(x: number, y: number, id?: number): DragThing | null` (:2912)
  - `move(x: number, y: number, id?: number): void` (:2912)
  - `up(x: number, y: number, id?: number): void` (:2912)
  - `place(p: DragThing, s: DragThing | null): Drag` (:2913)
  - `update(dt: number): Drag` (:2913)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Drag and drop** (`gs.drag.Drag({ snap, accept })`): add pieces and slots, pass down/move/up through,
and pieces lift, snap into slots you `accept`, or slide home. With `list: { x, y, axis }` the pieces
form a row you reorder by dragging.

## In real games

1 game uses it (`node scripts/examples.mjs gs.drag` lists them). The shortest:

`src/games/hand-sort.js` (Hand Sort, Casual · Cards, 93 lines):

```js
const { sfx, notes } = gs.sound;
const { Drag } = gs.drag;
// …
    const ch = (H - 210) / n - 6, cw = Math.min(W - 80, 230);
    drag = new Drag({ list: { x: W / 2, y: 150, gap: 6, axis: 'y' } });
// …
    hand = shuffle(hand);
    for (const c of hand) drag.piece({ ...c, x: W / 2, y: 150, w: cw, h: ch });
    if (ordered()) { const ps = drag.order; [ps[0].index, ps[1].index] = [ps[1].index, ps[0].index]; drag.layout(); }
// …
    drags = 0; tmax = time = 8 + n * 2.4;
    drag.on('drop', () => { drags++; sfx(400 + drags * 20, .04, 'triangle', .03); haptic('tick'); check(); }).on('pick', () => { sfx(700, .02, 'square
// …
      feel.update(dt); if (feel.frozen) return;
      t += dt; drag.update(dt);
// …
    },
    down(x, y, id) { if (!banner) drag.down(x, y, id); },
    move(x, y, p, id) { drag.move(x, y, id); },
```
