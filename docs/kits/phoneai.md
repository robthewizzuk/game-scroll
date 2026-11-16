# gs.phoneai

The phone's own AI for flavour lines only; play never depends on it.

`gs.phoneai`: `PhoneAI({ persona, words })` `ask(prompt, { fallback })` for flavour lines only; play must never depend on it.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PhoneaiPart`, line 5533), where every option and field is described.

- `PhoneAI: new (o?: { persona?: string; words?: number; temperature?: number; timeout?: number }) => { available: boolean | null; last: string | null; ready(): Promise<b…` (:5534)
- `tidy(text: string, words?: number): string | null` Tidies a model's answer, or null if it shouldn't be shown. (:5542)

## From the maker kit

From [Hearing, doodles and the phone's AI](../maker-kit.md#hearing-doodles-and-the-phones-ai):

**The phone's own AI** (`gs.phoneai.PhoneAI`): newer phones have a language model built in (Apple
Intelligence on iPhone, Gemini Nano on Android, the browser's own on the web). Use it for flavour:
a greeting, a taunt, a riddle that changes each time. Most phones don't have one, so every `ask` has
a written `fallback`, and the game must play the same without it.

```js
const { PhoneAI } = gs.phoneai;
const keeper = new PhoneAI({ persona: 'a grumpy old lighthouse keeper', words: 20 });
reset() { line = 'Mind the rocks.'; keeper.ask('Greet the player, who just arrived by boat.', { fallback: 'Mind the rocks.' }).then(t => line = t); }
```

From [Car radio](../maker-kit.md#car-radio):

- **The phone's own AI** writes fresher DJ lines on phones that have one: `new Radio({ ai: new PhoneAI({ persona:
  'a radio DJ', words: 24 }) })` (`gs.phoneai`). It's asked only for the station on air, a song ahead; every line
  has a written one, and play never waits for it.

## In real games

1 game uses it (`node scripts/examples.mjs gs.phoneai` lists them). The shortest:

`src/games/parcel-dash.js` (Parcel Dash, Next Gen · Driving, 199 lines):

```js
const { icon } = gs.icons;
const { PhoneAI } = gs.phoneai;
// …
  // where it can), and the news picks up how your evening is going
  const radio = new Radio({ seed: 'parcel-dash', ai: new PhoneAI({ words: 40 }) });
```
