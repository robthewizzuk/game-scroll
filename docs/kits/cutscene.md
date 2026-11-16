# gs.cutscene

Cutscenes: camera paths, lines, and actors who walk, turn, look, gesture and speak.

`gs.cutscene` (camera paths, lines, and actors: `{ actor, walk, turn, look, play: 'bow', mood, say, voice }`, `rig.update(dt, cut.motion(person))`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CutscenePart`, line 3773), where every option and field is described.

- `along(points: P3[], u: number): P3` (:3774)
- `Cutscene: new (steps: CutsceneStep[], o?: { bars?: number; skippable?: boolean }) => On<Loose> & { playing: boolean; done: boolean; bars: number; line: { text: string;…` (:3775)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Cutscenes** (`gs.cutscene`): `Cutscene([{ at, cam: [points], look, time }, { at, say, who }, { at, do }])`
moves the camera along smooth paths, shows lines and letterbox bars, runs actions on cue and can be
skipped. Put your camera at `scene.shot` each frame. Camera shakes follow Reduce motion.
It directs people too: a step with `actor: mara` and `walk: { x, z }` (`speed`, 1.3 m/s: she turns, walks there and
stops), `turn` (an angle or a point), `look` (a point or a thing; `null` lets the eyes go), `play: 'bow'` (a gesture
or move), `mood: 'smile'` + `amount`, and `say` with `voice` (her own voice, the mouth moving to it). Update each
rig once a frame with what the cutscene says it is doing: `person.rig.update(dt, cut.motion(person))`. `skip()`
puts everyone where they were going.

## In real games

1 game uses it (`node scripts/examples.mjs gs.cutscene` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Mission } = gs.missions;
const { Cutscene } = gs.cutscene;
// …
    steps = [...rp, ...steps.map(st => ({ ...st, at: st.at + T }))];
    cut = new Cutscene(steps, { bars: .14 }); cut.on('end', () => { outroDone = true; }); state = 'outro'; scoped = false; glass = false; }
// …
    noises = new Noises(); guard = null; metMarr = false;
    cut = new Cutscene(def.intro(), { bars: .14 }); state = 'intro';
// …
      if (state === 'intro' || state === 'outro') {
        cut.update(dt); audioTick(dt);
// …
      if (state === 'brief') return briefTap(x, y);
      if (state === 'intro' && cut) { cut.skip(); return; }
// …
      if (state === 'brief' && (k === 'Enter' || k === ' ')) return go();
      if (state === 'intro' && cut) return cut.skip();
// …
    if (state === 'brief') return dossier(c, ink, paper, brass, red);
    if (cut && (state === 'intro' || state === 'outro')) { cut.drawBars(c, W, H, '#0b0b0a'); radioLine(c, cut.line, brass); if (state === 'intro') { c
```
