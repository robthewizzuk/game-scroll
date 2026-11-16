# gs.ai

Crowds that chase, flee, flock and hunt; grid paths; state machines, behaviour trees, utility AI; swarms.

`gs.ai`: `Crowd` (`add(x, y).chase(t) / flee / wander / follow(route) / flock / hunt(t, nav)`), `NavGrid` (`path`, `sees`), `Brain` (state machine), `Tree` (behaviour trees: mistreevous text, actions by name), `Choose` (utility AI: the highest-scoring want), `YUKA`, `Swarm({ count, w, h, speed })` (thousands of flockers on the graphics chip where the phone can: `pull(x, y, { strength, radius })`, `obstacle`, `near`, `kill`, `x`/`y` arrays; `Swarm.max()`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`AiPart`, line 2096), where every option and field is described.

- `Crowd: new (...a: Loose[]) => Loose` (:2096)
- `NavGrid: new (...a: Loose[]) => Loose` (:2096)
- `Brain: new (...a: Loose[]) => Loose` (:2096)
- `YUKA: Loose` (:2096)
- `Swarm: typeof Swarm` (:2096)
  - `constructor(o?: { count?: number; w?: number; h?: number; speed?: number; sight?: number; separate?: number; align?: number; cohere?: number; wander?: number; edges?: …` (:2077)
  - `readonly count: number` (:2078)
  - `living: number` (:2078)
  - `gpu: boolean` (:2078)
  - `x: Float32Array` (:2079)
  - `y: Float32Array` (:2079)
  - `vx: Float32Array` (:2079)
  - `vy: Float32Array` (:2079)
  - `alive: Uint8Array` (:2079)
  - `speed: number` (:2080)
  - `sight: number` (:2080)
  - `separate: number` (:2080)
  - `align: number` (:2080)
  - `cohere: number` (:2080)
  - `wander: number` (:2080)
  - `edges: 'wrap' | 'bounce'` (:2080)
  - `ready: Promise<boolean>` Resolves true once it's moving on the GPU (false if it stays on the CPU). (:2082)
  - `pull(x: number, y: number, o?: { strength?: number; radius?: number }): this` Towards (x, y) this frame; strength < 0 pushes away. (:2084)
  - `obstacle(x: number, y: number, r: number): this` (:2085)
  - `clearObstacles(): this` (:2085)
  - `kill(i: number): this` (:2086)
  - `revive(i: number, x: number, y: number): this` (:2086)
  - `place(i: number, x: number, y: number): this` (:2086)
  - `angle(i: number): number` (:2087)
  - `near(x: number, y: number, r: number): number[]` Living ones within r of (x, y), as indices. (:2089)
  - `order(): number` 0 (all over) to 1 (all heading one way). (:2091)
  - `update(dt: number): this` (:2092)
  - `sync(): Promise<void>` (:2092)
  - `dispose(): void` (:2092)
  - `static max(): number` About how many this phone moves smoothly (8192 with the GPU, 2000 without). (:2094)
- `Tree: typeof Tree` (:2096)
  - `constructor(definition: string | object, agent: Record<string, (...a: Loose[]) => Loose>, o?: { seed?: number; /** Corrections (with see): true, or a gs.brains.Coach t…` (:2100)
  - `static ok: string` (:2101)
  - `static fail: string` (:2101)
  - `static run: string` (:2101)
  - `update(dt: number): this` (:2102)
  - `reset(): this` (:2102)
  - `readonly state: 'running' | 'ok' | 'failed'` (:2102)
  - `path(): string[]` (:2102)
  - `readonly coach: Coach | null` The coach, when it was given one and a see. (:2104)
  - `correct(name: string): this` "In a moment like this, do this": makes the built-in condition [Told, "Name"] true in moments like it, so give the tree a branch for it first: sequence { condition [Told, "Flee"] action [Flee] }. (:2106)
  - `avoid(name?: string): this` "Not that, in a moment like this": the action named (default: the one it last ran) fails at once in moments like it, and the tree goes on to its next branch. (:2108)
  - `readonly told: { action: string; not: boolean } | null` After update(): what the coach's examples changed this step, or null. (:2110)
- `Choose: typeof Choose` (:2096)
  - `constructor(options: Record<string, Consideration | Consideration[] | { score: Consideration | Consideration[]; weight?: number }>, o?: { stick?: number; noise?: numbe…` (:2115)
  - `pick(...a: Loose[]): string` (:2116)
  - `scores: Record<string, number>` (:2116)
  - `current: string | null` (:2116)
  - `readonly coach: Coach | null` With coach: want.coach.correct('sleep') ("there, it should have wanted sleep"), want.coach.avoid(), want.coach.recalled. (:2118)
  - `static linear: Consideration` (:2119)
  - `static quad: Consideration` (:2119)
  - `static root: Consideration` (:2119)
  - `static invert: Consideration` (:2119)
  - `static logistic(mid?: number, k?: number): Consideration` (:2120)
  - `static step(at?: number): Consideration` (:2120)

## From the maker kit

From [AI](../maker-kit.md#ai):

`const { Crowd, NavGrid, Brain } = gs.ai;` Steering and path finding from [Yuka](https://mugen87.github.io/yuka/),
in your game's 2D units.

```js
reset() {
  crowd = new Crowd();
  bat = crowd.add(50, 50, { speed: 120 }).chase(player);    // anything with x, y
  sheep = crowd.add(200, 300, { speed: 60 }).wander().flock();
  nav = new NavGrid(20, 30, 16, (cx, cy) => level[cy][cx] === '#');
  guard = crowd.add(40, 40).hunt(player, nav);                // goes round the walls, re-plans as you move
}
update(dt) { crowd.update(dt); }                             // read bat.x, bat.y, bat.angle
```

- Steering: `seek`, `arrive`, `flee(target, panic)`, `chase`, `pursue(agent)`, `evade(agent)`,
  `wander()`, `follow(route, loop)`, `separate()`, `flock()`, `stop()`. They combine: `.wander().flee(cat)`.
- `NavGrid`: `path(x1, y1, x2, y2)` → `[{ x, y }, ...]` or null, `sees(x1, y1, x2, y2)` (line of sight),
  `set(cx, cy, wall)` (doors, towers), `blocked(x, y)`.
- `Brain(start, { state: { enter, update(dt), exit } })`: `go(name)`, `is(name)`, `time` in the state.
- All of Yuka is there as `gs.ai.YUKA` (fuzzy logic, goals, vision cones, nav meshes).

From [Behaviour trees and wants](../maker-kit.md#behaviour-trees-and-wants):

`gs.ai.Tree` is a behaviour tree (mistreevous): a short text of what to try, in what order, and when
to give up. Your object gives every action and condition by name. A condition returns true or false;
an action returns `Tree.ok` (done), `Tree.fail`, or nothing (still going, ask again next frame).

```js
const { Tree, Choose } = gs.ai;
reset() {
  guard = new Tree(`root {
    selector {
      sequence { condition [Hurt] action [Flee] }
      sequence while(SeesPlayer) until(Hurt) { action [Chase] action [Strike] }
      sequence until(SeesPlayer) { action [Walk] wait [1000, 2500] }
    }
  }`, {
    Hurt: () => me.hp < 3, SeesPlayer: () => sees(me, player),
    Flee: () => (runFrom(player), far(player) ? Tree.ok : undefined),
    Chase: () => moveTo(player) ? Tree.ok : undefined, Strike: () => (hit(player), Tree.ok),
    Walk: () => moveTo(nextPost()) ? Tree.ok : undefined,
  }, { seed: 3 });
}
update(dt) { guard.update(dt); }
```

Nodes: `sequence`, `selector`, `parallel`, `race`, `all`, `lotto [2, 1]` (weighted random), `repeat`,
`retry`, `flip`, `succeed`, `fail`, `wait [ms]` or `wait [min, max]` (game time), `branch [Name]`
(subtrees), and guards on any node: `while(Cond)` / `until(Cond)` cut a running branch short when they
change. A selector doesn't look back up its list while a later branch is running, so put a guard on each
branch for whatever should interrupt it (above: seeing the player stops the walk, getting hurt stops the
chase). `tree.path()` lists what's running (handy as a debug label). A finished tree starts again at the top.

`gs.ai.Choose` is utility AI: each want scores 0 to 1 from one or more things (multiplied, shaped by an
optional curve), and the highest wins, with a little stickiness so it doesn't flicker:

```js
const want = new Choose({
  eat: [() => 1 - me.food, Choose.quad],
  sleep: () => me.tired,
  fight: { score: [() => closeness(player), () => me.hp / 10], weight: 1.5 },
}, { stick: .1 });
const goal = want.pick();   // 'eat', 'sleep' or 'fight'; want.scores has them all
```

Curves: `Choose.linear`, `quad`, `root`, `invert`, `logistic(mid, k)`, `step(at)`. Use a Choose inside a
tree action, or to pick a `Brain` state.

Both can be coached: `new Choose(options, { coach: true })` then `want.coach.correct('sleep')`, and
`new Tree(text, agent, { coach: true, see: () => [me.hp / 10, cornered ? 1 : 0] })` then
`tree.avoid('Bite')` and `tree.correct('Flee')`
([A coach for things that decide by rules](#a-coach-for-things-that-decide-by-rules)).

From [Swarms: thousands of flockers](../maker-kit.md#swarms-thousands-of-flockers):

`gs.ai.Swarm` moves hundreds or thousands of simple creatures that flock: shoals, bats, bees,
starlings, a zombie horde. On top-end phones with WebGPU the moving is done on the graphics chip
(a compute shader); everywhere else it runs on the CPU with a spatial grid. Same rules either way,
so the game never needs to know (`swarm.gpu` says which). If the chip turns out too slow, or goes
away, it carries on on the CPU by itself.

```js
const { Swarm } = gs.ai;
reset() { fish = new Swarm({ count: Math.min(3000, Swarm.max()), w: W, h: H, speed: 70 }); }
update(dt) {
  fish.pull(food.x, food.y);                                   // come here (up to 8 pulls a frame)
  fish.pull(shark.x, shark.y, { strength: -4, radius: 90 });   // keep away from here
  fish.update(dt);
  for (const i of fish.near(shark.x, shark.y, 12)) { fish.kill(i); api.score(++score); }
}
draw(c) { for (let i = 0; i < fish.count; i++) if (fish.alive[i]) drawFish(c, fish.x[i], fish.y[i], fish.angle(i)); }
```

Options: `count` (up to 8192), `w`, `h`, `speed`, `sight` (how far each sees its neighbours, 24),
the flocking urges `separate` (1.6), `align` (1) and `cohere` (.8), `wander` (.3), `edges` (`'wrap'`
or `'bounce'`), `seed`. Also `obstacle(x, y, r)`, `place(i, x, y)`, `revive(i, x, y)`, `living`, and
`order()` (0 when they head all over, 1 when they all head one way). `Swarm.max()` is about how many
the phone moves smoothly: 8192 with the graphics chip, 2000 without. On the GPU the positions you
read are a frame or two behind, which nobody sees; don't use a swarm for exact, frame-perfect rules.
For a few clever agents (chase, patrol, paths) use `Crowd` instead.

From [2D cameras, tile levels and movement](../maker-kit.md#2d-cameras-tile-levels-and-movement):

`const { Camera2D } = gs.camera2d, { TileMap } = gs.tiles, { Platformer, TopDown } = gs.movers;`
Write a level as text: `TileMap.fromText(LEVEL, { size: 16 })`. `#` is a wall, `-` a one-way platform
(jump up through it, `input.down` drops through), `/` and `\` are slopes, `.` is empty and any other
letter is a mark you read with `map.find('P')` (each gives `x`, `y` at the tile's centre) and then
`map.clear('P')`. Your own tile kinds go in `legend`. `map.move(box, dx, dy)` moves a box (centre
`x`, `y`, size `w`, `h`) and says what it hit; `map.ray` and `map.sees` are lines of sight and
`map.walkable()` feeds `gs.ai.NavGrid`. `map.draw(c, (c, ch, x, y, size) => ..., cam)` calls your
drawing for each tile on screen.

## In real games

3 games use it (`node scripts/examples.mjs gs.ai` lists them). The shortest:

`src/games/critter-quest.js` (Critter Quest, Advance · RPG, 1254 lines):

```js
const { Stick } = gs.controls;
const { NavGrid } = gs.ai;
// …
    for (let x = 13; x <= 14; x++) map.set(x, 11, '#');
    nav = new NavGrid(COLS, ROWS, T, (cx, cy) => map.solid(cx, cy));
// …
    if (gateOpen) return;
    gateOpen = true; for (let x = 13; x <= 14; x++) { map.set(x, 11, '.'); nav.set(x, 11, false); }
// …
  function walkTo(wx, wy, then = null) {
    const p = nav.path(hero.x, hero.y, wx, wy);
// …
      if (Math.hypot(n.x - hero.x, n.y - hero.y) < 26) { interact(n); return; }
      const spots = [[0, 1], [0, -1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ x: (tx + dx) * T + 8, y: (ty + dy) * T + 8 })).filter(p => !nav.blocked(p.
// …
    }
    if (!nav.blocked(w.x, w.y)) { walkTo(w.x, w.y); feel.click(); marker = { x: tx * T + 8, y: ty * T + 8, l: .6 }; }
// …
    if (want >= dist) {
      n.tx += w.d[0] * w.steps; n.ty += w.d[1] * w.steps; n.x = n.tx * T + 8; n.y = n.ty * T + 8; map.set(n.tx, n.ty, '#'); nav.set(n.tx, n.ty, true);
      for (let i = 0; i < w.steps; i++) nav.set(n.tx - w.d[0] * (i + 1), n.ty - w.d[1] * (i + 1), false);
```

`src/games/door-committee.js` (Door Committee, Next Gen · Puzzle, 1339 lines):

```js
const { Ready } = gs.rounds;
const { NavGrid } = gs.ai;
// …
    walls.computeBoundingSphere(); lows.computeBoundingSphere(); bases.computeBoundingSphere();
    nav = new NavGrid(COLS, ROWS, 1, (x, y) => { const ch = grid[y][x]; return ch === '#'; }, { diagonal: true });
// …
    const px = cxOf(P.x) + .5, pz = cyOf(P.z) + .5;
    const r = nav.path(Math.max(.5, Math.min(COLS - .5, px)), Math.max(.5, Math.min(ROWS - .5, pz)), tx + .5, ty + .5);
// …
  function buildDoor(cx) {    // the Creative Director's room: the door goes where you tapped
    grid[0][cx] = 'E'; nav.set(cx, 0, false);
// …
    if (!B.on) return;
    if (!B.path) { B.wait -= dt; if (B.wait <= 0) { B.at = 1 - B.at; const s = B.stops[B.at]; const r = nav.path(B.x + COLS / 2, B.z + ROWS / 2, s.x +
```
