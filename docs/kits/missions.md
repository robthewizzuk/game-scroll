# gs.missions

Mission scripts, zones, objectives and markers, open-world jobs, phone calls, a world save.

`gs.missions` (`Mission` scripts, `zone`, `timer`, `leash`; open world: `Jobs` (markers, pay, unlocks, `retry()` from a checkpoint mid-city at `mission.respawn`), `Phone` (calls that ring with the next job, texts), `WorldSave(api)` (the world's state in the 8 KB, Jobs, Phone, Radio and the `gs.rpg` Quests, Growth, Reputation and Flags kept by themselves, saved soon after a quest moves on; `{ local: true }` parts and save `slot(n)`/`restore(n)` on the phone))

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`MissionsPart`, line 3702), where every option and field is described.

- `zone(at: P3 | { x: number; y: number; w: number; h: number }, r?: number | null): { has(p: P3): boolean; any(list: P3[]): boolean; count(list: P3[]): number }` (:3703)
- `Mission: new (script: (m: Mission, ctx?: Loose) => Generator<Loose, void, Loose>, o?: { save?: () => Loose; load?: (d: Loose) => void; ctx?: Loose }) => Mission` save() gives your state at a checkpoint, load(data) puts it back after restart(). (:3705)
- `Jobs: new (list: Job[], o?: { radius?: number; start?: 'tap' | 'enter'; phone?: Loose | false; calls?: number; link?: boolean }) => On<Loose> & { list: Job[]; done: Se…` The jobs of an open world: a marker for each open one, start from it (a tap, or walking on with start: 'enter'), pay, unlocks (needs), retry from a checkpoint mid-city (put the player at mission.respawn), and a Phone… (:3711)
- `Phone: new (o?: { rings?: number; every?: number; buzz?: boolean; link?: boolean; jobs?: Loose | false; radio?: Loose | false }) => On<Loose> & { state: 'idle' | 'ring…` The player's phone: calls that ring, spoken on a phone line and shown as text, and texts. (:3724)
- `WorldSave: new (api: GameApi, o?: { every?: number; places?: number; limit?: number; link?: boolean; slots?: number }) => { size: number; readonly room: number; droppe…` The world's state in api.save()'s 8 KB: parts you keep, plus Jobs, Phone, Radio and the gs.rpg Quests, Growth, Reputation and Flags found by themselves; rounded, measured, saved when it changes; local parts and save… (:3730)
- `compact<T>(v: T, places?: number): T` Rounds every number in it to `places`. (:3741)
- `rows(list: Record<string, Loose>[], keys: string[]): Loose[][]` A list of records as rows of values (the names once, in `keys`), and back. (:3743)
- `unrows(data: Loose[][], keys: string[]): Record<string, Loose>[]` (:3744)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

A stage: `text` (the journal's line), `at` (where it is: a marker), `reach` (metres from `at` that moves it
on), `when(t)` (moves it on when true; `t` is the time in the stage), `count` + `of` (moves on once that many
are counted with `count(what, n)`; no `of` counts anything), `next`, `end`, `hidden`, `icon`. A quest's `needs`
to start: `'flag:met_mara'`, `'quest:wolves'` (ended any way), `'quest:wolves=done'`, `'!…'` (not) or a
function; `repeat: true` lets it run again. Rewards go by themselves to the game's `Growth` (`xp`),
Inventory (`items`; the newest one made, so a game with a shop's Inventory too passes `inv`, or makes the shop's with `link: false`), `Reputation` (`deeds`) and `Flags` (`flags`); the rest (`gold`) comes with the `reward`
event for your game. `stage(id)`, `is(id, stage)`, `active`, `ended`, `failed`, `can`, `progress(id)`
(`{ n, of }`), `end(id, way)`, `fail(id)`, `journal` (newest first: `{ quest, name, stage, text, end, t }`),
`list()` (`active`, `done`, `failed`), `markers` (`{ at, kind: 'quest', text, icon, pinned }`, the shape
`gs.missions` Jobs gives, so one map draws both; `pin(id)` makes one the waypoint), `vars()` (`quest_key` is
its stage or how it ended, for a conversation) and `pack()` / `unpack()` (a few hundred bytes: the journal's
text comes back from the table). Events `start`, `stage`, `count`, `end`, `fail`, `reward`. A `Talk` finds
the quests and flags too: ink's `EXTERNAL quest(id, stage)` starts or moves a quest, `count(what, n)`
counts, `flag(name)` sets a flag, and declared `VAR`s named like a flag or `quest_key` are set before each line.

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Missions** (`gs.missions`): write a mission as a script that reads like the plan:
`Mission(function* (m) { m.objective('Reach the roof'); yield m.until(() => roof.has(me)); m.checkpoint();
m.say('Go!', { who: 'Ivo' }); yield m.wait(2); ... m.complete(); })`. `zone()` makes areas, `all()` and
`any()` wait for several things, `restart()` returns to the last checkpoint after a loss (skipping
the lines already heard), and `save()`/`load()` keep it between sessions.

**Open-world missions** (`gs.missions`, for a city game): three more pieces on top of `Mission`.

`Jobs` is the list of jobs in the world, each a mission with a place to start it:

```js
const { Jobs, Phone, WorldSave, zone } = gs.missions;
jobs = new Jobs([
  { id: 'pies', name: 'Hot Pies', at: shop, from: 'Nonna Ruth', pay: 150, icon: 'pizza',
    call: { from: 'Nonna Ruth', say: ['The pies are getting cold!', 'Come to the shop.'] },
    script: function* (m, job) {
      m.objective('Take the pies to the docks', { at: docks, kind: 'drop' }); m.timer(90);
      yield m.until(() => zone(docks, 6).has(me));
      m.checkpoint('docks', { at: docks });                        // a retry starts here, mid-city
      m.leash(() => inVan, 10, 'You left the van');
      m.objective('Back to the shop', { at: shop }); yield m.until(() => zone(shop, 4).has(me));
    } },
  { id: 'race', needs: ['pies'], at: { x: -20, z: 5 }, script: ... },
]);
update(dt) { jobs.update(dt, me); }   // me: { x, z }
```

From [Car radio](../maker-kit.md#car-radio):

- **The phone**: a `gs.missions` Phone made in the same game holds the radio down while it rings and while you
  talk (`radio.hold(true)` does it by hand: a cutscene).

## In real games

1 game uses it (`node scripts/examples.mjs gs.missions` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Solid } = gs.characters;
const { Mission } = gs.missions;
// …
        if (s.route) { const r = s.route[s.ri]; if (Math.hypot(r[0] - s.x, r[1] - s.y) > .2) { const d = Math.hypot(r[0] - s.x, r[1] - s.y), k = Math.
        if (s.sending) { s.send += dt; if (s.send > 60) mission.fail('The call went through. The column is coming.'); }
// …
    }
    if (allies.filter(a => a.ko).length >= 2) mission.fail('Hale\'s squad was lost on the bridge.');
// …
    const e = nestEye(nest); look = { yaw: Math.atan2(-(nest.face.x - e.x), -(nest.face.z - e.z)), pitch: -.06 };
    mission = new Mission(def.script.bind(def));
// …
        updateMen(dt); updateAllies(dt); physTick(dt); WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.steam.update(dt); WD.trail.up
        if (state === 'outro') { mission.update(dt); trainUpdate(dt); if (mid === 'm1' && train.final) rideTrain(dt); }
// …

      mission.update(dt);
// …
      if (car && car.on && !car.stopped) {
        if (car.x < 30) { car.stopped = true; mission.fail('The armoured car reached the bridge.'); }
// …
      // losing
      if (me.dead || me.hp <= 0) mission.fail('Wren is down.');
```
