# gs.gadgets

Grapples, ziplines, wires to cut, locks to pick, codes to crack.

`gs.gadgets` (`Grapple`, `Zipline`, `Wires`, `Lock`, `Code`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`GadgetsPart`, line 3774), where every option and field is described.

- `Grapple: new (o?: { range?: number; reel?: number; swing?: boolean; flyTime?: number; min?: number; mass?: number; link?: boolean }) => { attached: boolean; flying: nu…` mass: the user's (kg): hooked onto a loose body in a World3D, the pull is shared by mass (a light crate comes to you, you go to a truck). (:3776)
- `Zipline: new (a: P3, b: P3, o?: { gravity?: number; drag?: number; grab?: number; hang?: number }) => { riding: boolean; done?: boolean; t: number; speed: number; near…` (:3782)
- `Wires: new (cols?: number, rows?: number, o?: { seed?: number }) => { cols: number; rows: number; cells: number[]; moves: number; readonly solved: boolean; get(c: numb…` (:3783)
- `Lock: new (o?: { pins?: number; speed?: number; gap?: number; shrink?: number; seed?: number }) => { pin: number; pins: number; a: number; at: number; gap: number; fai…` (:3784)
- `Code: new (o?: { keys?: number; start?: number; seed?: number }) => { seq: number[]; i: number; failed: boolean; readonly done: boolean; press(k: number): boolean; gro…` (:3785)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Gadgets** (`gs.gadgets`): `Grapple` (fire, swing, reel in), `Zipline`, and three hacking puzzles:
`Wires` (turn tiles till power reaches every one; always solvable), `Lock` (stop the marker in the
gap, pin by pin) and `Code` (repeat the sequence).

## In real games

1 game uses it (`node scripts/examples.mjs gs.gadgets` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4136 lines):

```js
const { Prompts } = gs.prompts;
const { Zipline } = gs.gadgets;
// …
  }
  const zipLine = () => new Zipline(WD.zipA, WD.zipB, { gravity: 170, drag: .14 });
```
