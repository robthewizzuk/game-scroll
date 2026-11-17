# gs.rhythm

Rhythm games: a beat kept with the sound card, charts, calibration.

`gs.rhythm` (`Beat`, `Chart`, `Calibrate`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`RhythmPart`, line 3363), where every option and field is described.

- `lag(): number` (:3364)
- `Beat: new (o?: { bpm?: number; offset?: number; steps?: number; /** false: count from when sounds are played, with no allowance for the phone's sound delay. */ heard?:…` (:3365)
  - `bpm: number` (:3355)
  - `offset: number` (:3355)
  - `steps: number` (:3355)
  - `time: number` (:3355)
  - `running: boolean` (:3355)
  - `onBeat: boolean` (:3355)
  - `onStep: boolean` (:3355)
  - `readonly spb: number` (:3355)
  - `readonly beat: number` (:3355)
  - `readonly phase: number` (:3355)
  - `readonly delay: number` The sound delay being allowed for, in seconds. (:3355)
  - `start(): Beat` (:3355)
  - `stop(): Beat` (:3355)
  - `update(dt: number): Beat` (:3355)
- `Chart: new (text: string, o?: { bpm?: number; per?: number; lead?: number; windows?: { perfect?: number; good?: number; miss?: number } }) => Chart` (:3366)
  - `notes: ChartNote[]` (:3358)
  - `lanes: number` (:3358)
  - `length: number` (:3358)
  - `counts: { perfect: number; good: number; miss: number }` (:3358)
  - `combo: number` (:3358)
  - `best: number` (:3358)
  - `w: { perfect: number; good: number; miss: number }` (:3359)
  - `readonly done: boolean` (:3359)
  - `readonly accuracy: number` (:3359)
  - `hit(lane: number, time: number): { result: 'perfect' | 'good' | 'miss'; note: ChartNote; error: number } | null` (:3360)
  - `missed(time: number): ChartNote[]` (:3361)
  - `near(time: number, ahead?: number, behind?: number): ChartNote[]` (:3361)
- `Calibrate: new (o?: { bpm?: number; beats?: number; skip?: number }) => { beat: Beat; taps: number[]; done: boolean; lag: number; update(dt: number): Loose; tap(): Loo…` (:3367)

## From the maker kit

From [Sound](../maker-kit.md#sound):

- **`delay()`**: seconds between asking for a sound and the player hearing it (the phone's output
  delay, more on Bluetooth). Rhythm games don't need it: `gs.rhythm.Beat` already follows the sound
  as heard.

From [Game kits](../maker-kit.md#game-kits):

**Rhythm** (`gs.rhythm`): `Beat({ bpm })` keeps time with the sound card, so it stays in step with
`gs.sound.music`. `Chart` reads notes written as text (one line per lane, `x` a note, `=` a hold) and
judges taps as Perfect, Good or Miss, with combo and accuracy. `Calibrate` measures the player's tap
lag (screens and Bluetooth headphones add delay) and every chart allows for it.

## In real games

1 game uses it (`node scripts/examples.mjs gs.rhythm` lists them). The shortest:

`src/games/beat-crypt.js` (Beat Crypt, Pocket · Rhythm, 719 lines):

```js
const { Ready } = gs.rounds;
const { Beat } = gs.rhythm;
// …
  const ready = new Ready({ eat: true });
  const beat = new Beat({ bpm: 108, steps: 2 });
// …
    beat.bpm = K.bpm;
    if (!beat.running) beat.start();
// …
      for (const k in keysDown) delete keysDown[k];
      beat.stop();
// …
      beat.bpm = K.bpm;
      if (!beat.running) beat.start();
      beat.update(dt);
```
