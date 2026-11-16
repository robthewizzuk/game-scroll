# gs.story

Branching dialogue from ink scripts, played by people in 3D with camera shots, and a typewriter for text.

`gs.story` (lazy): `Story(inkScript)` branching dialogue (`next()`, `choose(i)`, `vars`), `Typewriter`; `Talk(story, { cast, hero, camera, view, rep })` plays it with people in 3D: `#who:` speaks in their voice with the mouth moving, faces look at each other, `#mood:`, `#do:` (a gesture), `#shot:over|close|two|wide` camera shots that keep to one side of the line, and the game's `gs.rpg` Reputation/Growth/Quests/Flags and Inventory, found by themselves, as ink VARs and EXTERNAL functions (`did`, `xp`, `has`, `give`, `take`, `quest`, `count`, `flag`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`StoryPart`, line 1526), where every option and field is described.

- `Story: new (source: string) => { readonly ended: boolean; readonly choices: StoryLine['choices']; vars: Record<string, Loose>; ink: Loose; next(): StoryLine; choose(in…` Branching dialogue written in ink (lazy: make it in make() or reset()). (:1528)
- `Typewriter: new (text?: string, o?: { speed?: number; pause?: number }) => { readonly shown: string; readonly done: boolean; ticked: boolean; text: string; show(text: …` (:1533)
- `loadStory(): Promise<Loose>` (:1534)
- `Talk: new (story: InstanceType<StoryPart['Story']>, o?: { cast?: Record<string, { person?: Loose; name?: string; voice?: SayVoice | null; pitch?: number; rate?: number…` A conversation played by people: each line's #who: speaks in their voice with their face moving, faces look at each other, #mood: shows, and camera shots are picked as a film does (#shot:over | close | two | wide |… (:1540)
  - `on(ev: 'line' | 'choose' | 'do' | 'end', fn: (...a: Loose[]) => void): this` (:1543)
  - `start(section?: string | null): this` Starts (at a section of the story, or where it is). (:1544)
  - `readonly speaker: string | null` The speaker's cast id (null: a narrator). (:1545)
  - `readonly who: string` Their name to draw. (:1545)
  - `readonly shown: string` The line so far, typed out. (:1546)
  - `readonly text: string` (:1546)
  - `readonly choices: StoryLine['choices']` Choices open once the line is typed out. (:1547)
  - `line: { text: string; tags: Record<string, string | true>; choices: StoryLine['choices']; who: string | null } | null` (:1548)
  - `shot: (P3 & { look: P3; kind: 'over' | 'close' | 'two' | 'wide'; cut: boolean }) | null` The camera for this line: where it is, what it looks at, the kind of shot, and cut (true on the frame it cut). (:1550)
  - `ended: boolean` (:1551)
  - `tap(): this` Shows the whole line, or goes on. (:1552)
  - `choose(index: number): this` (:1552)
  - `stop(): this` (:1552)
  - `update(dt: number): this` (:1552)
  - `save(): string` (:1553)
  - `load(json: string): this` (:1553)

## From the maker kit

From [Animation, dialogue and replays](../maker-kit.md#animation-dialogue-and-replays):

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

From [Game kits](../maker-kit.md#game-kits):

**Point-and-click adventures** (`gs.adventure.Adventure({ start, bag })`): `room(id, { map: [col, row] })`
then `.spot(id, { x, y, w, h } | { x, y, r } | { poly }, look, take, exit, locked, talk, when, walk })`.
`tap(x, y, item)` finds the topmost spot and does it: a use rule when an item is held
(`rule(item, spot, fn)`; fn returns the line to say), else take, exit (unless locked), talk or look; it
returns `{ spot, did, text }` and fires `say`, `enter` and the rest. `act(spot, item, 'look')` after the
hero has walked to `walkTo(spot)`. `combine(a, b)` for items in the bag, `flag(k, v)`, `unlock`,
`map()` / `drawMap(c, x, y)` for the rooms seen, `save` / `load`. Use an `Inventory` as the bag for
slots and limits, and `gs.story` for conversations.

## In real games

1 game uses it (`node scripts/examples.mjs gs.story` lists them). The shortest:

`src/games/critter-quest.js` (Critter Quest, Advance · RPG, 1254 lines):

```js
const { NavGrid } = gs.ai;
const { Typewriter } = gs.story;
// …
    talkQ = lines.map(l => typeof l === 'string' ? { who, txt: l } : l); talkThen = then; mode = 'talk';
    tw = new Typewriter(talkQ[0].txt, { speed: K.textSpeed }); stick.release(); press = null; path = null;
// …
  function talkTap() {
    if (!tw.done) { tw.skip(); return; }
// …
    talkQ.shift(); sounds.blip();
    if (talkQ.length) { tw = new Typewriter(talkQ[0].txt, { speed: K.textSpeed }); return; }
// …
      if (mode === 'end' || mode === 'won') { endT -= dt; if (endT <= 0) { if (mode === 'won') { feel.win(); api.win(); } else api.over(); mode = 'gon
      if (mode === 'talk') { tw.update(dt); if (!tw.done && tw.ticked && (t * 30 | 0) % 2) sounds.blip(1.6); return; }
```
