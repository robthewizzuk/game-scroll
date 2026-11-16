# gs.hear

Sounds the mic hears (a dog, whistling...) and spoken words.

`gs.hear` (lazy): `Sounds({ want: ['Dog', 'Whistling'] })` (`start()` from a tap, `update(dt)`, `heard`, `hearing`, `top`), `Voice({ words, also })` (`start()`, `said(word)`, `available`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`HearPart`, line 5619), where every option and field is described.

- `Sounds: new (o?: { want?: string[]; sure?: number; every?: number }) => { ready: boolean; running: boolean; failed: unknown; top: { name: string; sure: number } | null…` Hears everyday sounds: 'Dog', 'Whistling', 'Clapping', 'Laughter', 'Knock', 'Bell'... (:5621)
- `Voice: new (o?: { words?: string[]; also?: Record<string, string[]>; language?: string }) => { available: boolean | null; listening: boolean; heard: string[]; /** Call…` Spoken commands. available is false on phones that can't listen on the phone itself: use touch then. (:5632)

## From the maker kit

From [Hearing, doodles and the phone's AI](../maker-kit.md#hearing-doodles-and-the-phones-ai):

**Everyday sounds** (`gs.hear.Sounds`): Google's YAMNet knows 521 sounds. Name the ones you want,
start from a tap, and read them each frame:

```js
const { Sounds, Voice } = gs.hear;
reset() { ears = new Sounds({ want: ['Dog', 'Whistling', 'Clapping', 'Laughter'] }); }
down() { if (!ears.running) ears.start(); /* ...and the touch way to play */ }
update(dt) { ears.update(dt); if (ears.heard('Dog')) scareCats(); }
```

**Spoken commands** (`gs.hear.Voice`): uses the phone's own on-device recogniser (iPhone, and
Android 12 and later). Phones without one say `available` false, so keep touch controls:

```js
voice = new Voice({ words: ['jump', 'fire'], also: { fire: ['shoot', 'bang'] } });
down() { voice.start(); }               // false if this phone can't listen on the phone itself
update(dt) { if (voice.said('jump')) jump(); }
```

## In real games

No game uses `gs.hear` yet: the examples above are what there is.
