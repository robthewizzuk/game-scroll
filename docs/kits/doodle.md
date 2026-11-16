# gs.doodle

Guesses what a player drew among 200 things, and learns their way of drawing.

`gs.doodle` (lazy): `Doodle` (`guess(strokes, { among })` of 200 things: pass `among`, the few your game cares about; `new Doodle(api)` + `learn(strokes, 'cat')` when the game knows what was drawn, and this player's way of drawing it counts from then on: `yours` on that guess).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`DoodlePart`, line 5676), where every option and field is described.

- `Doodle: { /** new Doodle(): the model alone. new Doodle(api, { name }): what learn() is shown is kept on the phone with the game's brains (name: 'doodle'; save: false:…` Make it in make() or reset() (the model loads first). (:5678)
- `picture(strokes: Loose[], size?: number): Float32Array` The strokes drawn into a 28 x 28 picture (0..1), the way the model sees them. (:5695)
- `scores(img: Float32Array, model: Loose): Float32Array` (:5696)
- `features(img: Float32Array, model: Loose): Float32Array` What the network makes of a picture just before it names it (its last hidden layer). (:5698)

## From the maker kit

From [Hearing, doodles and the phone's AI](../maker-kit.md#hearing-doodles-and-the-phones-ai):

**Doodles** (`gs.doodle.Doodle`): a tiny model (about 100 KB, trained on Google's Quick, Draw!
drawings) names what the player drew, in a few milliseconds:

```js
const { Doodle } = gs.doodle;
reset() { doodle = new Doodle(); strokes = []; }
down(x, y) { strokes.push([{ x, y }]); }
move(x, y, pressed) { if (pressed) strokes.at(-1).push({ x, y }); }
up() { const best = doodle.guess(strokes, { among: ['sword', 'umbrella', 'bridge'] })[0]; if (best.sure > .5) use(best.name); }
```

## In real games

No game uses `gs.doodle` yet: the examples above are what there is.
