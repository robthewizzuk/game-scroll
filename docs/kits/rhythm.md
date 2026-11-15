# gs.rhythm

Rhythm games: a beat kept with the sound card, charts, calibration.

`gs.rhythm` (`Beat`, `Chart`, `Calibrate`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`RhythmPart`, line 3294), where every option and field is described.

- `lag(): number` (:3295)
- `Beat: new (o?: { bpm?: number; offset?: number; steps?: number; /** false: count from when sounds are played, with no allowance for the phone's sound delay. */ heard?:…` (:3296)
  - `bpm: number` (:3286)
  - `offset: number` (:3286)
  - `steps: number` (:3286)
  - `time: number` (:3286)
  - `running: boolean` (:3286)
  - `onBeat: boolean` (:3286)
  - `onStep: boolean` (:3286)
  - `readonly spb: number` (:3286)
  - `readonly beat: number` (:3286)
  - `readonly phase: number` (:3286)
  - `readonly delay: number` The sound delay being allowed for, in seconds. (:3286)
  - `start(): Beat` (:3286)
  - `stop(): Beat` (:3286)
  - `update(dt: number): Beat` (:3286)
- `Chart: new (text: string, o?: { bpm?: number; per?: number; lead?: number; windows?: { perfect?: number; good?: number; miss?: number } }) => Chart` (:3297)
  - `notes: ChartNote[]` (:3289)
  - `lanes: number` (:3289)
  - `length: number` (:3289)
  - `counts: { perfect: number; good: number; miss: number }` (:3289)
  - `combo: number` (:3289)
  - `best: number` (:3289)
  - `w: { perfect: number; good: number; miss: number }` (:3290)
  - `readonly done: boolean` (:3290)
  - `readonly accuracy: number` (:3290)
  - `hit(lane: number, time: number): { result: 'perfect' | 'good' | 'miss'; note: ChartNote; error: number } | null` (:3291)
  - `missed(time: number): ChartNote[]` (:3292)
  - `near(time: number, ahead?: number, behind?: number): ChartNote[]` (:3292)
- `Calibrate: new (o?: { bpm?: number; beats?: number; skip?: number }) => { beat: Beat; taps: number[]; done: boolean; lag: number; update(dt: number): Loose; tap(): Loo…` (:3298)

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

No game uses `gs.rhythm` yet: the examples above are what there is.
