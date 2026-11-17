# gs.dungeon

Dungeons built in 3D from a gs.gen map: doors, keys, levers, traps, chests, secret walls, solid in the World3D.

`gs.dungeon.Dungeon(view, { map: gs.gen.dungeon(40, 30, { seed }), seed })` (a map built in 3D and dressed from the seed: doors, a locked door and its key in a chest, a gate opened by levers, pressure plates, spike traps, chests, a secret wall, torches, pillars, crates to push; solid in the World3D; `update(dt, hero.position)`, `use(position, { inventory })`, `near`, `on('trap' | 'loot' | 'solved' ...)`, `drawMap`, `pack`; `layout` + `DungeonRules` for 2D).

Guide: [Dungeons](../maker-kit.md#dungeons).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`DungeonPart`, line 3069), where every option and field is described.

- `Dungeon: new (view: Loose, o: { map: string | { text: string; rooms?: Loose[] }; seed?: number; size?: number; height?: number; dress?: boolean; ceiling?: boolean; at?…` A dungeon map (gs.gen's dungeon(), cave() or maze(), or text) built in a Next Gen view: walls, doors, a locked door and its key, a lever gate, plates, traps, chests, a secret wall, torches; solid in the World3D. (:3071)
  - `layout: DungeonLayout` (:3009)
  - `rules: DungeonRulesT` (:3009)
  - `things: DungeonThing[]` (:3009)
  - `group: Loose` (:3009)
  - `start: { x: number; y: number; z: number }` (:3009)
  - `exit: { x: number; y: number; z: number } | null` (:3009)
  - `solid: Loose` (:3009)
  - `on(ev: DungeonEvent, fn: (thing: DungeonThing, more?: Loose) => void): Dungeon3D` (:3010)
  - `update(dt?: number, hero?: { x: number; z: number } | { position: { x: number; z: number } } | ({ x: number; z: number })[] | null): Dungeon3D` Each frame: the hero's position (or several: companions, anything heavy) presses plates, fires traps and fills in the map; doors, gates and lids move to match. (:3012)
  - `use(what: DungeonThing | { x: number; z: number } | { position: { x: number; z: number } }, o?: { inventory?: DungeonInventory | null }): DungeonUse` (:3013)
  - `near(p: { x: number; z: number } | { position: { x: number; z: number } }, r?: number): DungeonThing[]` (:3014)
  - `cellAt(p: { x: number; z: number }): { col: number; row: number; ch: string } | null` (:3014)
  - `spot(t: DungeonThing | { col: number; row: number }): { x: number; y: number; z: number }` (:3015)
  - `find(mark: string): { x: number; y: number; z: number }[]` (:3015)
  - `drawMap(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o?: { at?: { x: number; z: number } | null; turn?: number; all?: boolean; colours?: Re…` (:3016)
  - `settle(dt: number): void` (:3017)
  - `pack(): Loose` (:3017)
  - `unpack(d: Loose): Dungeon3D` (:3017)
  - `remove(): void` (:3017)
- `layout(map: string | { text: string; rooms?: Loose[] }, o?: { size?: number; seed?: number; dress?: boolean }): DungeonLayout` The map read and dressed, as plain data (no 3D). (:3073)
- `DungeonRules: new (layout: DungeonLayout, o?: { loot?: (chest: DungeonThing) => { id: string; n: number }[]; trapRearm?: number }) => DungeonRulesT` The rules alone (what is open, found and taken): for a 2D game or a test. (:3075)
  - `L: DungeonLayout` (:3002)
  - `things: DungeonThing[]` (:3002)
  - `seen: Uint8Array` (:3002)
  - `solved: Set<string>` (:3002)
  - `on(ev: DungeonEvent, fn: (thing: DungeonThing, more?: Loose) => void): DungeonRulesT` (:3003)
  - `cellAt(x: number, z: number): { col: number; row: number; ch: string } | null` (:3003)
  - `open(col: number, row: number): boolean` (:3003)
  - `near(x: number, z: number, r?: number): DungeonThing[]` (:3004)
  - `spot(t: DungeonThing): { x: number; z: number }` (:3004)
  - `use(what: DungeonThing | { x: number; z: number }, o?: { inventory?: DungeonInventory | null }): DungeonUse` (:3004)
  - `check(group: string): void` (:3005)
  - `step(dt: number, feet?: { x: number; z: number }[]): void` (:3005)
  - `see(x: number, z: number): void` (:3005)
  - `find(mark: string): { col: number; row: number; x: number; z: number }[]` (:3005)
  - `pack(): Loose` (:3006)
  - `unpack(d: Loose): DungeonRulesT` (:3006)
- `LEGEND: Record<string, DungeonKind>` The map letters: D door, K locked, G gate, V lever, O plate, C chest, X trap, H secret, T torch, P pillar, B barrel, R crate. (:3077)

## From the maker kit

From [Dungeons](../maker-kit.md#dungeons):

`gs.dungeon.Dungeon` builds a dungeon map in a Next Gen view and makes it work. The map is gs.gen's `dungeon()`,
`cave()` or `maze()` (or your own text), and from a seed it is dressed with doors, one locked door whose key lies in
a chest you can reach first, an iron gate that lifts while its levers are all set right (in front of the exit where
one corridor leads there), spike traps in the corridors, chests, a secret wall that shortens the way, torches,
pillars in the big rooms, and barrels and crates to push. It is solid in the game's `World3D` (found by itself): a
shut door is a wall, an open one is not.

```js
const { Dungeon } = gs.dungeon, { dungeon } = gs.gen;
reset() {
  dg = new Dungeon(view, { map: dungeon(40, 30, { seed }), seed });   // in reset(): under the loading screen
  hero.at(dg.start);
  dg.on('trap', (t, who) => hurt(10)).on('loot', (t, loot) => feel.coin()).on('solved', () => feel.win());
}
update(dt) { dg.update(dt, hero.position); }            // plates, traps, the map filling in, doors swinging
down() { const r = dg.use(hero.position, { inventory }); if (r.why === 'locked') say('Locked. There must be a key.'); }
draw(c) { dg.drawMap(c, 250, 10, 100, 80, { at: hero.position, turn }); }   // only what has been seen
```

- Letters a map may use (`gs.dungeon.LEGEND`): `D` door, `K` locked door, `G` gate, `V` lever, `O` pressure plate,
  `C` chest, `X` spike trap, `H` secret wall, `T` torch, `P` pillar, `B` barrel, `R` crate, `S` start, `E` exit; any
  other letter is a mark (`find('A')`). Levers and plates within 8 cells of a map's gate work it. `dress: false`
  keeps to what the map says.
- `use(what, { inventory })` opens and shuts doors, unlocks with the key (any inventory with `has`, `take` and `add`:
  `gs.items.Inventory` fits), pulls levers, loots chests (`loot: chest => [{ id, n }]`, else some gold) and finds the
  secret wall. `near(position)` lists what is in reach, to show a prompt.
- A lamp on each lever, and over the gate, lights while that lever is right (`hints: false` for none).
- `update(dt, [hero, companion])`: anyone heavy presses plates and sets off traps, and the barrels and crates press
  plates too. The trap's harm is yours: `on('trap', (t, who) => ...)`.
- `ceiling: false` for a camera from above. `at: { x, y, z }` puts it anywhere (under a town, or as a `gs.regions`
  part: build it in the part's make and `remove()` it when the part goes).
- `pack()` / `unpack(data)` keep what is open, found and looted, and the map, for `api.save()`.
- `gs.dungeon.layout(map, { seed })` and `DungeonRules` are the same rules with no 3D, for a 2D game.

## In real games

No game uses `gs.dungeon` yet: the examples above are what there is.
