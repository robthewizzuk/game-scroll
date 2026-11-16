# gs.anim

Sprite animation states with frame events and one-shots.

`gs.anim.Animator`: sprite animation states with frame events (`on('step')`), one-shots with `then`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`AnimPart`, line 1516), where every option and field is described.

- `Animator: new (states: Record<string, AnimState>, start?: string) => { readonly state: string; readonly frame: number; readonly progress: number; done: boolean; prev?:…` (:1517)

## From the maker kit

From [Animation, dialogue and replays](../maker-kit.md#animation-dialogue-and-replays):

`gs.anim.Animator` keeps track of which frame to draw: states with `frames`, `fps`, `loop`, `then`
(where a one-shot goes next) and `events` on frames (`on('step', ...)`). Pick the state each frame
with `anim.update(dt, 'run')` or play one with `anim.play('punch')`.

`gs.story.Story(script)` runs a conversation written in ink (inklestudios.com/ink): `next()` gives
`{ text, tags, choices }`, `choose(i)`, `vars` for ink variables, `ended`. `Typewriter` reveals the
text with `shown`, `done`, `skip()` and `ticked` (for a blip sound). Your game draws the box.

**A conversation played by people** (`gs.story.Talk`, for 3D games): the same ink, said by your cast.
`new Talk(new Story(TALK), { cast: { hero: { person: me }, mara: { person: mara, name: 'Mara', voice: 'woman', pitch: 1.1 } }, hero: 'hero', camera: view.camera, view, rep })`,
then `start()`, `update(dt)` each frame, `tap()` (shows the whole line, then goes on) and `choose(index)`; draw
`talk.who`, `talk.shown` and `talk.choices`. Each line's `#who:mara` speaks in her voice with her mouth moving to
it (`voices: false` for text only), the speaker looks at the one spoken to and everyone else at the speaker,
`#mood:angry` (or `#mood:smile .5`) shows on the speaker's face until their next mood, `#do:nod` fires
`on('do', (move, who) => ...)` (play the gesture), and `#wait:1` goes on by itself a second after the line.
The camera is framed as a film crew would: `#shot:over` the listener's shoulder onto the speaker (the default),
`close`, `two` (both, from the side), `wide` or `none`, always from one side of the line between them so cuts
never flip them over; it cuts with `view.cut()`, or read `talk.shot` without a camera. The game's world comes
in as ink variables: `rep` (a `gs.rpg` Reputation: `town`, `town_rank`, `good`, `fame`, `bounty_guard`...), `grow`
(`level` and the attributes) and `vars: () => ({ gold })` set the ink's own `VAR`s of those names before each
line, so `* {town_rank == "loved"} [Ask for the key]` only shows to someone the town loves. And out again:
ink's `EXTERNAL did(deed)` reaches `rep.did`, `xp(n)` reaches `grow.gain`, `has`/`give`/`take(id, n)` an `inv`,
and `bind: { name: fn }` anything else. `scripts/talk.cjs` films a scene and the gestures.

`gs.replay.Ghost` records a few numbers over time (`record(dt, x, y, angle)`), plays them back
smoothly (`at(t)`) and packs to about 1 KB (`pack()`, `Ghost.unpack()`) to keep with `api.save()`:
race your best run. `Recorder` / `Replayer` replay a whole round exactly, if the game takes its
random numbers from `rec.rng`.

**Same on every phone.** A replay (or a daily run that should play out alike for everyone) only
holds if every step computes the same numbers. `+ - * /`, `Math.sqrt` and `Math.hypot` are exact in
every engine, but `Math.sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow` and `tanh` are not:
`node scripts/math-probe.cjs` found the last bit differs on most inputs even between two versions of
V8 (Node 22 and Chromium 153, 8 November 2026), and Android's web view updates itself, so phones
won't agree either. Ghosts are safe (they store positions). For a whole-round replay, keep those
functions out of anything that decides what happens (use them for drawing), use `Imagine` with
`fixed: true`, and never time game logic with the clock.

## In real games

No game uses `gs.anim` yet: the examples above are what there is.
