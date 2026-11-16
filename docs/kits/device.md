# gs.device

Haptics, tilt, shake, compass, mic, camera and the phone's other sensors, each with a touch fallback.

`gs.device`: `haptic('light'|'medium'|'heavy'|'tick'|'success'|'warning'|'error')`, `buzz()`, `steps()`, `pressure()` (height change), `light()`, `near()`, `hasSensor(kind)` (null until running; keep a touch way), `hapticPattern([{ at, len, strength, sharpness, to }] | 'heartbeat'|'explosion'|'charge'...)`, `tilt()` + `want('motion')`, `calibrateTilt()`, `onShake(cb)`, `heading()`, `faceDown()`, `startMic()` (`level()`, `pitch()`, `blow()`, `clapped()`, `whistle()`)/`stopMic()`, `startCamera()`/`stopCamera()`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`DevicePart`, line 433), where every option and field is described.

- `steps(): { count: number; new: number; perMinute: number } | null` Steps walked since the round started (null until the step counter runs and the player allowed it). (:435)
- `pressure(): { hPa: number; height: number } | null` Air pressure and height change (metres) since the round started. (:437)
- `light(): { lux: number; dark: boolean } | null` The room's light (Android; some browsers). (:439)
- `near(): boolean | null` Something right over the top of the phone (Android). (:441)
- `hasSensor(kind: 'steps' | 'pressure' | 'light' | 'near'): boolean | null` Does this phone have it? (:443)
- `haptic(kind?: HapticKind): void` (:444)
- `buzz(pattern: (number | boolean)[], short?: number, long?: number, gap?: number): void` Morse-like buzz pattern: 0 short, 1 long. (:446)
- `canBuzz(): boolean` (:447)
- `hapticPattern(events: HapticEvent[] | keyof typeof HAPTIC_NAMES | string, o?: { len?: number; strength?: number }): number` Rich haptics: taps (no len) and buzzes (len s) with strength and sharpness 0..1, `to` fades a buzz, at in seconds. (:449)
- `HAPTICS: Readonly<Record<string, (o: { len?: number; strength?: number }) => HapticEvent[]>>` Ready-made patterns: tap, thud, heartbeat, explosion, charge, engine, rain, rumble, success, fail. (:451)
- `stopHaptics(): void` (:452)
- `want(feature: string): void` Ask for a sensor before Play: 'motion', 'mic', 'camera'... (:454)
- `tilt(): XY | null` Tilt -1..1 on each axis, or null when there's no sensor (give a touch fallback). (:456)
- `calibrateTilt(): void` (:457)
- `onMotion(cb: (m: Loose) => void): () => void` (:458)
- `onShake(cb: (strength: number) => void): () => void` cb(strength) on each shake: about 28 (a light shake) to 70 and more (a hard one). (:460)
- `orientation(): Loose` (:461)
- `heading(): number | null` Compass heading in degrees, or null. (:463)
- `faceDown(): boolean | null` (:464)
- `startMic(): Promise<Mic | null>` The mic (call from a tap): level(), pitch() -> { hz, note, midi, clarity } | null, blow(), clapped(), whistle(), stop(); or null if refused. (:466)
- `stopMic(): void` (:467)
- `startCamera(): Promise<Loose>` (:468)
- `stopCamera(): void` (:469)

## From the maker kit

From [Maker kit](../maker-kit.md#maker-kit):

Games use all of it through one import, `gs`:

```js
import gs from '../gamescroll.js';
const { sounds } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects;
```

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Rich haptics** (`gs.device.hapticPattern`): feel that changes over time. Each event is a tap (no `len`)
or a buzz (`len` in seconds) with `strength` and `sharpness` 0..1 (sharp is a crisp click, soft a deep
thud), and a buzz can fade or swell to `to`. `at` is seconds from now, so start a sound at the same
moment and they line up: `hapticPattern([{ at: 0, strength: 1, sharpness: .9 }, { at: .1, len: .4, strength: .8, to: 0, sharpness: .2 }])`.
Ready-made: `hapticPattern('heartbeat')`, `'explosion'`, `'charge'` (`{ len: 1.5 }`), `'engine'`, `'rain'`,
`'rumble'`, `'thud'`, `'tap'`, `'success'`, `'fail'`. iPhones use Core Haptics and Android the
vibrator's strength control and haptic primitives (`plugins/rich-haptics`); other phones get the
closest taps or buzzes. The player's haptics setting always applies.

**Mic games** (`gs.device.startMic()`, from a tap): besides `level()`, the mic now hears `pitch()`
(`{ hz, note: 'A4', midi, clarity }` of a sung, hummed or whistled note, or null; pitchy, the McLeod
pitch method), `blow()` (0..1, blowing on the mic), `clapped()` (true once per clap, snap or tap on the
phone) and `whistle()` (Hz, or 0). Read them every frame, and always give a touch way to play.

**Two fingers** (`gs.controls.TwoFingers`): pinch, twist and two-finger drag, with your one-finger
`Gestures` still working through `one:`. Callbacks get the change since last time (`pinch(scale, x, y)`,
`twist(angle, x, y)`, `pan(dx, dy)`), or read `scale`, `angle`, `x`, `y` and `active`. When the second
finger lands the one-finger gesture is dropped, so a pinch never ends in a stray tap.

**The mixer** (`gs.sound.mixer`): every sound goes through a channel (`'sfx'`, `'music'` for `music()`
and Tone.js, `'voice'`, or your own with `tone(f, { bus: 'alarm' })`), then a shared room and muffle.
`mixer.volume('music', .4)`, `mixer.duck('music', .3, .8)` (dip it for a big moment), `mixer.room('cave')`
(`'room'`, `'hall'`, `'cave'`, `'pipe'` or `{ reverb, size, echo, delay }`) and `mixer.muffle(.8)` (underwater,
stunned, inside a box), `mixer.voices(48)` (how many sounds at once: 32). `mixer.place({ tail, wet, echo, delay })` is the echo of the place the listener
stands in, for effects and voices only: `new Ears({ level })` sets it from the level by itself, or set
it for a place you know (`{ tail: 3.5, wet: .4 }` is a cathedral). It all goes back to normal when the round ends.

**Speech** (`gs.sound.say('Watch out!', { pitch, rate, lang })`): characters talk with the phone's own
voices (no sound files; iPhone and Android speech, the browser's on the web). It returns a promise
that ends when the line is said, dips the music while it talks, follows the player's mute and stops
with the round. `stopTalking()`, `talking()`. Always show the words on screen too.

Give each character **a voice of their own**, cast from the voices the phone has:
`say('Minuted.', { voice: 'woman' })`, `say("I'll have that back.", { voice: { kind: 'man', lang: ['en-AU', 'en-GB'], take: 1 } })`.
`kind` is `'woman'`, `'man'` or `'any'`; `lang` lists the accents to try, in order; `take: 1` is the
second such voice, so two men in one scene sound different; `like: ['Daniel']` prefers a voice by name
where the phone has it. A phone with no voice of that kind uses its own, a little lower or higher, so
the cast still differs. A real voice at its own pitch sounds far more human than one bent a long way,
so cast first and keep `pitch` near 1. `voices()` resolves to what this phone has.

**Timing** is most of a line's character. An array is said part by part, with pauses in seconds
between, and a part can have its own delivery: `say(['Bold.', .3, 'Visionary.', .5, { text: 'Rectangular.', rate: .85 }], { voice: 'woman' })`.

**A shaped voice** makes the same phone voice into a character: `say('Door three is opening.', { voice: 'woman', fx: 'tannoy' })`,
`say('Copy that.', { voice: 'man', size: 1.15, fx: 'radio' })`. `size` is the build of the speaker: 1.15 is a
bigger person (deeper in every way, at the same pace), .85 a smaller one (.6 to 1.6). `fx` is what the voice
comes through:

or a recipe of your own, which can start from a named one: `{ like: 'radio', drive: .2, mix: .6 }` (the parts:
`low`, `high`, `peaks`, `bass`, `treble`, `drive`, `ring`, `comb`, `squeeze`, `echo`, `squelch`, `hiss`, `mix`;
the types say what each is). With a `size` or an `fx` the phone writes the line to sound instead of speaking
it, and the kit plays that through the mixer's `'voice'` channel. So a shaped line is as loud on every phone
and with every treatment, `mixer.room()`, `mixer.muffle()` and the level's own echo (`Ears`) reach it like
any other sound, and `onWord` is called for every word (lip sync that keeps time). A line said in parts
through one radio stays keyed up between them. This needs the Android or iPhone app: in a browser, or on a
phone whose speech engine can't write to sound, the line is spoken as before, with `size` as a lean of its
pitch and no `fx`; `shaped()` says which (true once a line has played shaped, false where it can't be, null
before the first try). A shaped line starts a moment later than a plain one, because the phone writes all of
it first: open with a short pause (`say([.2, 'Ah. A door.'], { fx: 'tannoy' })`), which is when the kit
gets the line ready. A line said again starts at once.

**Timelines** (`gs.juice.Timeline`, anime.js; loads on first use, so make it in `make()` or `reset()`):
steps one after another, together or staggered, in seconds and driven by your `dt` so they pause
with the game. `new Timeline({ ease: 'outBack' }).to(title, { y: 120, duration: .5 }).to(stars, { s: 1, duration: .3, delay: stagger(.1) }, '+=.1').call(fn, .6)`,
then `tl.update(dt)`; `done`, `seek()`, `pause()`, `speed`, `loop: true`. For a single number, `Tweens` is still the lightest.

**Paths** (`gs.paths`): `new Path(points, { loop, kind: 'smooth' | 'line' | 'bezier' })` in 2D or 3D, measured
so `Follower(path, { speed, end: 'loop' | 'pingpong' | 'stop' })` moves at a steady speed. `at(d)`,
`offset(d, side)` (lanes, kerbs), `nearest(x, y)` (snap onto the track), `spaced(step)` (coins along a
route) and `trace(c)` (stroke it your way).

**Auto-tiling** (`map.edges(tx, ty, same)` on `gs.tiles.TileMap`): which neighbours join, as a 4-bit
`mask` (16 pieces) or the 47-piece `blob` (`BLOB_MASKS` lists them), so drawn-in-code walls, paths and
water pick the right edge and corner pieces.

**2D bone characters** (`gs.bones.Rig`): cut-out figures of parts that hang off each other. `bone()`
adds parts (with `wobble` for ears, tails and hair that lag and swing), `pose()` and `blend()` set
angles, `clip()` + `play()` run keyframes with events (`on('step')`), `reach(upper, lower, x, y)` is
two-bone IK (a hand on a ledge, a foot on the ground), `look()` turns a head, `kick()` jolts a wobbly
part, and `draw(c, fn)` calls you for each part already moved and turned into place.

More in docs/maker-kit.md: "Feel, sound, touch and 2D animation (round 9)", "Steps, air pressure, light, proximity", "The real world: sun, moon, battery, headphones".

## In real games

255 games use it (`node scripts/examples.mjs gs.device` lists them). The shortest:

`src/games/colour-flood.js` (Colour Flood, Pocket · Puzzle, 47 lines):

```js
const { sfx } = gs.sound;
const { haptic } = gs.device;
// …
      if (win || y < 136) return; const col = Math.floor((x - 20) / 32); if (col < 0 || col >= K || col === g[0]) return;
      const before = region(g).size; g = apply(g, col); moves++; const after = region(g).size; score += after - before; api.score(score); haptic(after
      if (after === N * N) { win = .001; score += (limit - moves) * 20 + 50; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 300); fe
      else if (moves >= limit) { haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); feel.juice.shake(5); api.over(); }
```

`src/games/merge-ten.js` (Merge Ten, Casual · Merge, 51 lines):

```js
const { sfx } = gs.sound;
const { haptic } = gs.device;
// …
      const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      const i = cy * N + cx, grp = group(i); if (grp.size < 2) { haptic('tick'); sfx(180, .05, 'square', .02); return; }
// …
      for (let col = 0; col < N; col++) { const vals = []; for (let r = N - 1; r >= 0; r--) if (g[r * N + col] !== null) vals.push([g[r * N + col], r]
      if (v > best) { best = v; score += v * 10; feel.juice.shake(4).flash('#ffffff', .15).pop(W / 2, 150, `NEW HIGH ${v}! +${v * 10}`, { color: '#ffd
// …
      api.score(score);
      if (stuck()) { feel.juice.shake(7); haptic('error'); sfx(140, .5, 'sawtooth', .05, -60); api.over(); }
```
