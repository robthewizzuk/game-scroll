# gs.prompts

Quick-time prompts.

`gs.prompts` (quick-time)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PromptsPart`, line 3770), where every option and field is described.

- `Prompts: new (o?: { radius?: number; swipe?: number }) => On<Loose> & { active: boolean; timeScale: number; passed: number; readonly now: Prompt | null; readonly left:…` (:3771)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Quick-time prompts** (`gs.prompts`): `Prompts().start([{ kind: 'tap', x, y }, { kind: 'swipe', dir: 'left' },
{ kind: 'hold', hold: 1 }, { kind: 'mash', count: 8 }])` checks taps, swipes, holds and mashing in
time; `timeScale` slows the world while one shows; `ease` gives the player more time.

## In real games

1 game uses it (`node scripts/examples.mjs gs.prompts` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Cutscene } = gs.cutscene;
const { Prompts } = gs.prompts;
// …
      scoped = false; glass = false; zoom = 7; breath = { v: 1, held: false }; gasp = 0; storm = 0;
      bulletCam = null; WD.bullet.visible = false; move = null; zip = null; mortar = null; mortarCool = 0; qte = new Prompts({ radius: 56, swipe: 40 }
```
