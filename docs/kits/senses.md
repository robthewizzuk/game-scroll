# gs.senses

Enemy senses: sight cones, hearing, memory, moods from calm to searching; Noises.

`gs.senses`: `Senses` (sight cones, hearing, memory; moods calm/suspicious/alert/searching), `Noises`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SensesPart`, line 984), where every option and field is described.

- `Senses: (new (o?: { range?: number; fov?: number; near?: number; hearing?: number; spotTime?: number; memory?: number; searchTime?: number; calmDown?: number; link?: b…` (:985)
- `Noises: new (o?: { link?: boolean }) => { list: { x: number; y: number; loud: number; age: number }[]; make(x: number, y: number, loud?: number): Loose; update(dt: num…` (:992)

## From the maker kit

From [Enemy senses](../maker-kit.md#enemy-senses):

`const { Senses, Noises } = gs.senses;` What a guard knows: sight cones that walls block, hearing,
memory of where you were, and a mood. You decide what the guard does and how the cone and "?" look.

```js
g.senses = new Senses({ range: 120, fov: 80, spotTime: .9, memory: 4 });
noises.make(player.x, player.y, running ? 70 : 25);
const s = g.senses.update(dt, g, player, { sees: (x1, y1, x2, y2) => nav.sees(x1, y1, x2, y2), noises, light });
if (s.mood === 'alert') chase(s.lastSeen); else if (s.mood !== 'calm') walkTo(s.lookAt);
noises.update(dt);
```

- Guards need `x`, `y`, `facing` (radians); the player `x`, `y` (`hidden: true` in a bush).
- Moods: `calm` → `suspicious` → `alert` → `searching` → `calm`. `awareness` (0..1) fills a meter.
- `alert(x, y)`, `suspect(x, y)`, `Senses.alertAll(guards, x, y, radius)` (one guard raises the alarm).
- 3D games: pass x and z as x and y.

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Standing about** (`gs.models.human` people, by themselves, close up): a person fidgets now and then (shoulders
rolled, the neck stretched, a look down, a sigh, a swallow, a hand shaken out, a look about), and the head follows
the eyes a moment later (`person.face.look(point)`), the body too for something far round. A glance and back:
`person.idle.notice(point)`; at noises and at things that hurry past: `idle.listen(noises)` (`gs.senses.Noises`),
`idle.watch(thing)`. Gestures: `person.idle.gesture('nod')`, `'shake'`, `'shrug'`, `'wave'`, `'point'` (`{ at: [x, y, z] }`),
`'hips'` and `'cross'` (held until `gesture(null)`). `idle.on = false` stops it; `idle.turn = 0` leaves the head to you.

**Stealth extras** (`gs.stealth`, on top of `gs.senses`): `lightAt(p, lamps)` is a light meter (walls
cast shadows) to feed the guards' eyes, `Takedown.check()` finds a guard you're behind, `Bodies` get
found and raise the alarm unless you hide them, `Floors` make gravel loud and carpet quiet, and
`Disguise` lets you walk past some guards until you do something odd.

## In real games

1 game uses it (`node scripts/examples.mjs gs.senses` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Brain, Wave, Imagine, Nemesis } = gs.brains;
const { Senses, Noises } = gs.senses;
// …
  const MARR = 'COL. MARR · GREY ORDER';
  let noises = new Noises(), guard = null, metMarr = false, marrSays = [], built = false, mistT = 0, mistK = 1, lensDrops = [], lensGrad = null, lensT
// …
    // the crack carries a long way across the valley: whoever hears it turns towards the hills (gs.senses)
    noises.make(eye.x, eye.z, b.masked ? (heard ? 220 : 50) : 520);
// …
      // a near miss makes them jumpy (and the smack of it is heard round about)
      noises.make(x, z, 28);
// …
        // with a clear line, he can make Wren out (sooner just after Wren fires, through the lens glint)
        const sn = s.senses ||= new Senses({ range: mid === 'm2' ? 95 : 135, fov: 110, near: 12, hearing: mid === 'm2' ? .75 : 1, spotTime: 2.4, memor
// …
    bodies.update(dt, men.filter(s => !s.ko && !s.fixed));
    noises.update(dt);
// …
    mission.nests = def.nests;
    noises = new Noises(); guard = null; metMarr = false;
```
