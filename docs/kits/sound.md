# gs.sound

Sound effects, 98 ready-made sounds, music and tunes made in code, the mixer, world sounds (Foley) and voices.

`gs.sound`: `sfx(f, d, type, vol, slide)`, `sounds.coin()` etc. (98 ready-made: `step`, `slash`, `gem`, `door`, `fanfare`, `boing`...; the full list is in `docs/maker-kit.md` and the types), `noise()`, `tone()`, `notes('C5 E5 G5')`, `music({ tempo, lead, bass, drums, set: 'chip'|'synth'|'band'|'orchestra' })`, `Radio()` (a car radio: stations of original songs, made-up DJs who talk between them, adverts, `news(text)` from the game, muffled outside the car: `on`, `next`, `listen({ inside, distance })`, `now`), `instrument('kalimba')` (one voice to play; lazy), `compose({ mood, seed })` (an original tune for music()), `zzfx(...numbers)`, `zsound()`, `Tone()` (Tone.js; lazy), `mixer` (`volume`, `duck`, `room('cave')`, `muffle`, `voices(n)`: 32 sounds at once, the quietest give way), `Foley({ ears, world, marks, weather })` (the sounds a world makes by itself: World3D knocks by what things are made of (a body's `sound: 'wood'`, else its mesh), `watch(person)` footsteps by what is underfoot, `watch(vehicle)` engines through the gears; `update(dt)` each frame), `say(text, { pitch, rate, lang, voice, size, fx })` (text to speech; `voice: 'woman' | 'man' | { kind, lang, take }` casts a character from the phone's voices, `say(['Bold.', .3, 'Rectangular.'])` times a line with pauses, and `size: 1.15` (a bigger person) and `fx: 'radio' | 'tannoy' | 'phone' | 'megaphone' | 'box' | 'bright' | 'warm' | 'robot' | 'tiny'` shape the voice into a character and play it through the mixer in the apps; `shaped()`).

`gs.sound.Ears` (3D sound; `new Ears({ level: world })` muffles sounds behind walls and gives each place its own echo by itself) and `music({ layers }).intensity()` + `follow(song)` (living music)

On the Mac, Windows and Linux app, and in the phone apps, every English `say()` line is spoken by the app's own built-in voice (Pocket TTS 7M by Kyutai with their 100M model's decoder, run in background workers; `src/kit/talk.js`), so a cast sounds the same everywhere and a SteamOS handheld doesn't fall back to espeak. Its 45 voices: 20 women and 22 men cast by `voice: 'woman' | 'man'` (English first, then Scottish, Welsh and Northern Irish (`en-GB-scotland`, `en-GB-wales`, `en-GB-ulster`), then the rest of the English-speaking world: Canadian, American, Irish, Indian, South African, Australian, New Zealand (`lang: 'en-US'` puts American first, `'en-IE'` Irish, `'en-IN'` Indian...), then English with a French, Spanish, Italian or Dutch accent (`lang: ['en-FR']`); within each the most natural-sounding first, as measured), and 3 in between that come only by name (`like: ['alba']`); a cast bigger than that gets voices made between two of one kind (190 more women, 231 more men). Every line goes through the mixer as a shaped one does, so `size` and `fx` work there too, and it starts after its first sentence is written (the rest is written while it plays). `gs.sound.prepare(text, o)` writes a line ahead so `say()` with the same words and options starts at once (a `Cutscene` prepares its actors' lines itself). It makes the sound through the decoder of Kyutai's 100M model, which hasn't the 7M's own steady whine (the "robotic twang"). After it is spoken, each sentence is made more like a person (`src/kit/voice-pitch.js`): its pitch moves further and wavers a little, as a real voice does, a soft breath comes before most sentences after the first and in some long pauses, a little air goes through the voice and a quiet room sits under it (so a pause isn't dead silence), a statement's end falls (a yes-or-no question's rises), the last syllable is drawn out, and endings are a little rough; how much of each, the pace and how often it pauses at a comma are tuned per voice (`src/kit/voice-human.js`) to match its own real speaker's recordings. `mood: 'angry' | 'happy' | 'scared' | 'sad'` says a line as the voice's own speaker sounds in that mood (pitch, range, pace, loudness and steadiness as actors move them, measured from CREMA-D; a `Cutscene` step takes `sayMood`, and says a smile happy). `casual: 0..1` makes a character chat rather than read (now and then a "well," or "um," or "I - I"), and a line that answers another (`after: { text, voice }`, which a `Cutscene` gives by itself) drifts a little toward its liveliness and pace, as people in a conversation do, and if the line it answers is still being said it waits its turn (about a fifth of a second after; now and then a short or heated answer comes in a moment early). In the text `[sigh]`, `[gasp]` and `[hmm]` go before a line and `[laugh]` is said where it is (`sounds: true` lets a mood add them now and then), and `*word*` (or a word in capitals in a line that isn't) is stressed: higher, longer and louder. A character remembers how it said its last few lines (a density bank, `src/kit/voice-memory.js`): a line said again soon, or one much like it, comes out another of its four ways (`take: 0..3` picks one). Over a loud game a voice speaks up as people do (higher, slower, louder), following the mixer's level (`effort: 0..1` to set it). Lines in other languages, lines before its 22 MB file has downloaded the first time, and every line on a device too slow to write speech well ahead of playing it (timed once, at the start), are said by the device's own voices. It reads numbers, money, times and dates as words (`'£5.99 at 3:30 pm on 01/02'`: five pounds ninety-nine at three thirty p m on the first of February; `lang: 'en-US'` reads the month first), says a line the same way each time it comes again after a while and keeps it for the next launch (`fresh: true` for a new take), and `lively: 0..1` widens a character's intonation (left out, each voice has a liveliness of its own, more on a line that shouts!). `respell: { Zorblax: 'zor blacks' }` says made-up names your way, with every voice.

`gs.sound.score({ mood, key, tempo, seed })` is a film score rendered the way action games mix theirs: seven stems (a low drone, strings, an ostinato pulse, ticks, big drums, brass and a high lift for the last stand) made once in background workers while the round loads (about a second; `src/kit/score-render.js`), all looping together on the music channel. `intensity(x)` brings them in (the drone alone at rest; strings, pulse and ticks from .3; drums and brass from .7), `final(true)` lays the lift on top, `hit()` lands an orchestral hit on the next beat, `riser(4)` builds for about four seconds and lands an impact on the next bar line (the score dips just before it), and `sting('win' | 'lose' | 'found')` plays on the next beat. Moods: `tense`, `heroic`, `dark`, `sad`, `chase`, `explore`. The music, its moods and notes are our own; the method (rendered stems, hits, risers) is how film-style game scores are built. `follow(score)` drives it like a `music()` tune.

Gunshots from `gs.combat` (`weaponSound`, a `Loadout`, the city's police) are rendered too (`src/kit/gunshots.js`): each gun's report is layers of filtered noise with their own hold and decay on a thump and the muzzle's push, driven and closed down after the crack, with the action's clicks as struck metal and a spring after the bolt; several takes played in turn; a tail for indoors (close reflections, flutter, the room's hum) and one for outside (slaps off far walls, a long roll) picked by how closed in the `Ears` find the place (`place: 'in' | 'out'` says so yourself); and the music, other sounds and voices dip for a moment under the player's own shots. They are made in the background when a gun is armed; until then the old live sound plays.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SoundPart`, line 161), where every option and field is described.

- `sfx(f?: number, d?: number, type?: OscillatorType, vol?: number, slide?: number): void` One beep: frequency, duration (s), wave, volume, pitch slide (Hz). (:163)
- `sounds: Record<SoundName, SoundFx>` Ready-made sounds (98): sounds.coin(), sounds.step()... (:175)
- `freq(note: string | number): number` A note name ('C5', 'F#3') to Hz. (:177)
- `tone(f: number | string, o?: { len?: number; wave?: OscillatorType; vol?: number; slide?: number; attack?: number; hold?: number; wobble?: [number, number]; at?: numbe…` One note. hold: seconds at full volume before it fades (0: fades from the start, like a pluck). (:179)
- `noise(len?: number, o?: { vol?: number; from?: number; to?: number; filter?: BiquadFilterType; q?: number; at?: number; when?: number; attack?: number; hold?: number; …` (:180)
- `space(o?: { seconds?: number; decay?: number; wet?: number; bright?: number; pre?: number }): { in: AudioNode; tail: AudioNode; set(o: { wet?: number; bright?: number …` The sound of a place: a reverb made in code. (:182)
- `bed(o?: { vol?: number; from?: number; filter?: BiquadFilterType; q?: number; gusts?: number; out?: AudioNode }): { set(o: { vol?: number; from?: number; q?: number },…` A steady background of noise (wind, rain, a river) that glides with set(); stops with the round, quiet while paused. (:184)
- `notes(seq: string, o?: { len?: number; gap?: number; wave?: OscillatorType; vol?: number; at?: number }): number` Plays a tune like 'C5 E5 G5 - C6' ('-' is a rest). (:186)
- `follow(song: Loose, o?: { calm?: number; ease?: number; tempo?: [number, number]; pace?: number; brain?: Brain }): { readonly tension: number; readonly speed: number; …` Living music: the tune follows the play (tension from close calls, settles, a loss calms it, tempo leans to the player's pace). (:188)
- `compose(o?: { mood?: MusicMood; seed?: string | number; tempo?: number; key?: string; bars?: 4 | 8 }): { tempo: number; swing: number; layers: Record<string, number>; …` Writes an original looping tune from a mood and a seed (same seed, same tune): pass it to music(). (:190)
- `MOODS: Record<string, Loose>` (:191)
- `Radio: new (o?: { stations?: RadioStation[]; seed?: string; ai?: { ask(prompt: string, o?: { fallback?: string }): Promise<string> | string } | null; on?: boolean; sta…` A car radio: stations of original songs from compose(), each with a made-up DJ who talks between songs (say()), adverts, idents and the game's own news. (:198)
- `STATIONS: RadioStation[]` The five stations that come with Radio (all made up). (:211)
- `ADVERTS: string[]` The made-up adverts the stations play. (:213)
- `music(o?: { tempo?: number; vol?: number; swing?: number; lead?: string; bass?: string; drums?: string; layers?: Record<string, number>; set?: MusicSet; voices?: Recor…` Background music from patterns; start it in update(), not reset(). (:219)
- `score(o?: { mood?: 'tense' | 'heroic' | 'dark' | 'sad' | 'chase' | 'explore'; key?: string; tempo?: number | null; seed?: number; vol?: number }): { /** Starts with th…` A film score (rendered, not played note by note): stems made once in the background while the round loads (a low drone, strings, an ostinato pulse, ticks, big drums, brass and a high lift), all looping together and… (:229)
- `Ears: new (o?: { ref?: number; max?: number; rolloff?: number; hrtf?: boolean; flat?: boolean; space?: { tail: AudioNode } | null; send?: number; /** What stands in th…` 3D sound: the listener follows the camera; sounds play at points in the world (HRTF in headphones). (:250)
- `Foley: FoleyClass` The sounds a world makes by itself, with nothing more to call than update() each frame: things that knock into each other in a gs.physics3d World3D sound of what they are made of (a body's `sound` option, else read… (:274)
  - `new (o?: { ears?: Loose; world?: Loose; marks?: Loose; weather?: Loose; land?: Loose; splashes?: boolean; breaks?: boolean; link?: boolean; ground?: ((x: number, z: nu…` ears, world, marks, weather, land: left out, each is the one the game made (found again when the game makes a new one, as a World3D each round); false: none. (:386)
  - `readonly materials: FoleyMaterial[]` (:387)
  - `readonly engines: FoleyEngine[]` (:388)
  - `materialOf(obj: Loose): FoleyMaterial | null` What a mesh or group is made of, as Foley hears it (userData.sound, its material's recipe or name); null if nothing says. (:390)
- `acoustics: { caster(level: SoundLevel | null, o?: { flat?: boolean }): SoundCast | null; blocked(cast: SoundCast | null, ear: { x: number; y: number; z?: number }, sou…` The sums behind sound that knows the level, for your own sounds and subtitles (no audio): caster(level) makes one question of any level (cast(from, dir, max) => metres to the first solid thing, or Infinity),… (:280)
- `zzfx(...params: number[]): void` ZzFX sound from its numbers (zzfx.micro). (:287)
- `zsound(...params: number[]): () => void` (:288)
- `Tone(): Loose` Tone.js (lazy: call it in make() or reset()). (:290)
- `expectTune(o?: { set?: MusicSet; voices?: Record<string, VoiceName | KitName | 'chip'>; [part: string]: Loose }): void` Says a tune like this (music()'s options) will play later, so its instruments are made ahead under the round's loading screen (a car radio's stations do this). (:292)
- `prepareTunes(): void` Makes the instruments expectTune() asked for now (the app calls it behind a round's loading screen). (:294)
- `instrument(name: VoiceName, o?: { vol?: number }): { name: string; play(note: string | number, o?: { len?: number; vol?: number; at?: number }): Loose; free(): void }` One instrument to play yourself (lazy: make it in make() or reset()): instrument('epiano').play('C4', { len: .4 }). (:296)
- `SETS: Record<MusicSet, Record<string, string> | null>` Which voice plays each part in each set, and the voices and drum kits themselves (their settings, read only). (:298)
- `VOICES: Record<VoiceName, Loose>` (:299)
- `KITS: Record<KitName, Loose>` (:300)
- `delay(): number` Seconds between a sound being played and the player hearing it (the phone's output, Bluetooth included where it says). (:302)
- `mixer: { volume(name: string, v: number, fade?: number): Loose; duck(name?: string, to?: number, hold?: number, back?: number): Loose; room(r?: 'none' | 'room' | 'hall…` Channels ('sfx', 'music', 'voice' or your own), ducking, room echo and muffle. (:304)
- `say(text: string | SayPart[], o?: { pitch?: number; rate?: number; volume?: number; lang?: string | string[]; voice?: SayVoice | null; onWord?: (at: number) => void; s…` Speaks a line with the phone's own voices (text to speech). (:336)
- `prepare(text: string | SayPart[], o?: { pitch?: number; rate?: number; volume?: number; lang?: string | string[]; voice?: SayVoice | null; size?: number | null; fx?: S…` Writes a line to sound ahead of time with the built-in voice, so a say() with the same words and options starts at once (a cutscene's next lines while this one plays; a Cutscene does its actors' lines itself). (:342)
- `voices(): Promise<{ name: string; lang: string; kind: 'woman' | 'man' | null }[]>` The voices this phone has to cast from (joke voices left out). (:344)
- `stopTalking(): void` (:345)
- `talking(): boolean` (:346)
- `shaped(): boolean | null` Whether lines with a size or fx are being shaped: true once one has played that way, false where the phone can't (and in a browser), null before the first try. (:348)

## From the maker kit

From [Maker kit](../maker-kit.md#maker-kit):

Games use all of it through one import, `gs`:

```js
import gs from '../gamescroll.js';
const { sounds } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects;
```

From [Sound](../maker-kit.md#sound):

`const { sounds, noise, notes, tone, music, freq, zzfx, zsound, Tone, sfx } = gs.sound;`

```js
sounds.coin();  sounds.coin(1 + combo * .05);    // optional pitch: rising combos
noise(.4, { vol: .1, from: 2000, to: 80 });      // a custom explosion
notes('C5 E5 G5 C6:3', { len: .09 });           // a jingle; ':3' = three steps long, '.' = rest
const tune = music({ tempo: 128, lead: 'E5 . G5 . A5 - G5 .', bass: 'C3 . . . G2 . . .', drums: 'k . h . s . h .' });
tune.start(); tune.speed(1.2); tune.stop();
```

- **Ready-made** (98): each takes an optional pitch (`sounds.step(1.2)`). Ones that repeat a lot (steps,
  hits, shots, whooshes) come out a touch different each time, so ten in a row don't sound like a
  machine; tuned ones (coins, jingles) play exact.
  - Menus: `tick` `tock` `toggle` `back` `confirm` `deny` `open` `close` `select` `blip` `click`
  - Moving: `jump` `step` `land` `dash` `skid` `flap` `bounce` `boing` `swoosh` `whoosh` `slip`
  - Fights and breaking: `hit` `hurt` `shoot` `laser` `boom` `blast` `slash` `punch` `block` `clang`
    `bow` `reload` `zap` `charge` `shield` `thud` `crack` `shatter` `crumble`
  - Rewards: `coin` `gem` `key` `heal` `star` `chest` `combo` `perfect` `unlock` `cash` `powerup`
    `levelup` `pop`
  - Weather and animals: `splash` `drip` `bubble` `gust` `thunder` `crackle` `chirp` `croak` `buzz`
    `squeak` `growl`
  - Machines: `beep` `alarm` `siren` `ring` `door` `lever` `teleport` `warp` `robot` `rev`
  - The round: `countdown(last)` `go` `win` `lose` `buzzer` `fanfare` `tada` `whistle` `gong` `bell`
    `roll` `horn` `sad` `heart`
  - Cartoon: `wobble` `squish` `plop` `zip` `honk` `twinkle` `pluck` `munch` `gulp`
- **`noise(len, { vol, from, to, filter, q, attack })`**: filtered noise sweeping from `from` Hz to `to` Hz.
  High to low is an explosion, short and high is a hit, long and low is a rumble. `attack` fades it in (a whoosh).
- **`space({ seconds, decay, wet, bright, pre })`**: the sound of a place, a reverb made in code (a
  church, a valley, a cave). Play into it with `noise(len, { out: sp?.in })` or `tone(f, { out: sp?.in })`,
  or pass it to `new Ears({ space: sp, send })` so 3D sounds echo too. `sp.set({ wet, bright }, seconds)`
  glides (stepping indoors). Null where there is no audio, so write `sp?.in`.
- **`bed({ vol, from, filter, q, gusts })`**: a steady background made from noise: wind (`gusts` for
  slow swells), rain, a river. `b.set({ vol, from }, seconds)` glides as a storm rises. Beds fade in,
  go quiet while paused and stop with the round.
- **`tone(note, { len, wave, vol, slide, attack, hold, wobble })`**: one note with a soft envelope.
  Notes are names (`'A4'`, `'C#5'`, `'Eb3'`) or Hz. `hold` keeps it at full for that long before it
  fades (an alarm, a horn); `wobble: [times a second, cents]` is vibrato.
- **`music({ tempo, lead, bass, pad, arp, drums, vol, swing })`**: a looping tune. Each part is a
  line of eighth-note steps: a note, `.` for a rest, `-` to hold the note before. Drums: `k` kick,
  `s` snare, `h` hi-hat, `c` crash (several at once: `kh`). Parts can be different lengths.
- **Instruments**: `music({ set: 'band', ... })` plays the same tune on real-sounding instruments
  made in code (Tone.js; no sound files). Sets: `'chip'` (square and triangle waves, the default),
  `'synth'` (saw lead, sub bass, warm pad, 808 drums), `'band'` (electric piano, bass guitar, organ, a
  drum kit) and `'orchestra'` (flute, cello, strings, harp, timpani). Swap single parts with
  `voices: { lead: 'bell', drums: 'kit' }`: `saw` `sub` `warm` `pulse` `epiano` `bassguitar` `organ`
  `pick` `flute` `cello` `strings` `harp` `brass` `bell` `kalimba` `marimba` `steelpan`, drum kits
  `kit` `808` `concert`. The instruments load the first time a tune asks for them; it plays in the
  chip sound until they're in (`song.tuned` says when). Every set comes out about as loud as the others.
- **`instrument('kalimba')`**: one of those voices to play yourself, for a piano, a xylophone or a
  rhythm game: `const k = instrument('kalimba'); k.play('C5', { len: .4, vol: .8 });`. Make it in
  `make()` or `reset()` (it loads first).
- **A soundtrack in one line**: `music: 'chase'` in the definition and the app plays an original tune
  under each round, written from that mood and the game's id (so every game gets its own). It builds
  as the score nears the goal, lifts when the player scores, leans its tempo to how fast they tap,
  holds on the pause screen and stops when the round ends. Moods: `happy` `calm` `tense` `spooky`
  `heroic` `sad` `silly` `chase` `puzzle`. Pixel styles get the chip sound and the others a set to
  suit the mood, or say more: `music: { mood: 'heroic', set: 'orchestra', vol: .8, tempo: 120, key: 'D', bars: 8 }`.
  A game with its own `music()` calls leaves the field out.
- Start your own music in `update()`, not in `reset()` (reset also runs while the game waits in the
  feed). The app stops all music when a round ends or the player moves to another game.
- **Loudness looks after itself**: everything a game plays goes through a limiter, so twenty sounds at
  once (a big combo, an explosion over music) get quieter together instead of crackling.
- **`delay()`**: seconds between asking for a sound and the player hearing it (the phone's output
  delay, more on Bluetooth). Rhythm games don't need it: `gs.rhythm.Beat` already follows the sound
  as heard.
- Everything respects the player's Sound & haptics settings (sound, volume, music). `sfx()` still works as before.
- **Your own sound effects with ZzFX**: design one on the [ZzFX page](https://killedbyapixel.github.io/ZzFX/)
  (move the sliders, press play), copy the list of numbers and play it: `zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17])`.
  `const zap = zsound(...numbers); zap(); zap(1.5)` keeps one to play again (1.5 = higher).
- **Real synths with Tone.js** (for music and rhythm games): `const T = Tone()` in `make()` or `reset()`
  (it loads first), then anything from [tonejs.github.io](https://tonejs.github.io/):
  `new T.PolySynth(T.Synth).toDestination().triggerAttackRelease(['C4', 'E4', 'G4'], '8n')`. It plays
  through the app's volume and mute.

From [People who react](../maker-kit.md#people-who-react):

- With `world` it also puts its hands out against a wall it is about to run into, and is knocked back off it
  at a run (`walls: false` turns that off; `level` is what counts as a wall, as for `gs.sound.Ears`).
  `ground: (x, z) => height` for uneven floors and edges (the height of whatever is down there; `-Infinity` for a pit).

From [Skinned people, faces and lip sync](../maker-kit.md#skinned-people-faces-and-lip-sync):

Faces are blend shapes (morph targets): `open`, `wide`, `round` (the mouth), `smile`, `frown`,
`surprise`, `blink`. `Face` eases them, blinks by itself and moves the mouth to speech:

```js
hero.face.say('Over here!', { pitch: 1.2 });     // speaks with gs.sound.say; the mouth follows the words
hero.face.set('smile', 1);                        // eases in; set('smile', 0) lets go
hero.face.mouth(mic.level());                     // or a mouth driven by anything (null stops)
hero.face.update(dt);                             // every frame
```

More in docs/maker-kit.md: "Game kits", "Action and adventure kits", "Feel, sound, touch and 2D animation (round 9)", "Music composer", "Car radio", "Buildings that come apart", "Ground that takes marks", "Cliffs, caves and overhangs", "Vehicles made in code".

## In real games

249 games use it (`node scripts/examples.mjs gs.sound` lists them). The shortest:

`src/games/colour-flood.js` (Colour Flood, Pocket · Puzzle, 47 lines):

```js
import gs from '../gamescroll.js';
const { sfx } = gs.sound;
// …
      if (win || y < 136) return; const col = Math.floor((x - 20) / 32); if (col < 0 || col >= K || col === g[0]) return;
      const before = region(g).size; g = apply(g, col); moves++; const after = region(g).size; score += after - before; api.score(score); haptic(after
      if (after === N * N) { win = .001; score += (limit - moves) * 20 + 50; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 300); fe
      else if (moves >= limit) { haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); feel.juice.shake(5); api.over(); }
```

`src/games/merge-ten.js` (Merge Ten, Casual · Merge, 51 lines):

```js
import gs from '../gamescroll.js';
const { sfx } = gs.sound;
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
