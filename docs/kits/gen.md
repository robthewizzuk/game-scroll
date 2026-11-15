# gs.gen

Made levels from a seed: dungeons, caves, mazes, islands, patterns, field of view, levels proven playable.

`gs.gen` (lazy: `dungeon`, `cave`, `maze`, `islands`, `pattern`, `fov`, `proven` + `reach`; seeded, same text as TileMap)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`GenPart`, line 2821), where every option and field is described.

- `dungeon(w?: number, h?: number, o?: { seed?: number | string; kind?: 'digger' | 'uniform' | 'rogue'; doors?: boolean; dug?: number }): GenMap & { rooms: { x: number; y…` (:2822)
- `cave(w?: number, h?: number, o?: { seed?: number | string; fill?: number; steps?: number; connect?: boolean }): GenMap` (:2823)
- `maze(w?: number, h?: number, o?: { seed?: number | string; kind?: 'backtracker' | 'eller' | 'divided' }): GenMap` (:2824)
- `heightmap(w?: number, h?: number, o?: { seed?: number | string; scale?: number; octaves?: number }): { w: number; h: number; data: Float32Array; at(x: number, y: numbe…` (:2825)
- `islands(w?: number, h?: number, o?: { seed?: number | string; sea?: number; scale?: number }): GenMap & { heights: Loose }` (:2826)
- `pattern(sample: string, w?: number, h?: number, o?: { seed?: number | string; n?: number; symmetry?: number; periodic?: boolean; tries?: number }): GenMap | null` (:2827)
- `fov(map: string | ((col: number, row: number) => boolean), col: number, row: number, radius?: number): Set<string>` (:2828)
- `proven<L>(make: (seed: number) => L, check: (level: L) => boolean | number | null | undefined, o?: { seed?: number | string; tries?: number; good?: number }): { level:…` Proven levels: makes levels until one passes check (false/null = throw away; true or a number, higher is better). (:2830)
- `reach(text: string, from?: string | { col: number; row: number }, to?: string | { col: number; row: number }, o?: { walls?: string }): number` Steps from one mark to another through anything that isn't a wall, or -1. (:2832)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Made levels** (`gs.gen`, rot.js and WaveFunctionCollapse, loaded on first use: call them in `make()` or
`reset()`): `dungeon`, `cave`, `maze`, `islands`, `heightmap` and `pattern(sample)` (new maps that look
like a small example). They give the same text `gs.tiles.TileMap.fromText()` reads, with `S` start and
`E` exit marks. Pass a `seed` (`gs.math.daily()` for a level of the day). `fov(map, col, row, r)` is
what a hero can see.

**Proven levels** (`gs.gen.proven`): makes levels until one passes your check, so nobody gets one
that can't be beaten or is over in two steps. `make(seed)` builds a level, `check(level)` returns
false to throw it away or a number (higher is better); it stops at the first that scores `good`,
else keeps the best of `tries`. `reach(text, 'S', 'E')` is the walk from one mark to another (-1
when there's no way through). For jumps and physics, play the level in `check` with an `Imagine`
plan or a bot driving your own update. Seeded, so a level of the day is the same for everyone.

```js
const { level } = proven(s => cave(40, 30, { seed: s }), l => { const n = reach(l.text); return n > 30 && n; }, { seed: daily(), good: 60 });
```

From [A camera that knows things](../maker-kit.md#a-camera-that-knows-things):

- **`Scanner({ kinds, every, shape, camera })`**: reads QR codes and the striped codes on anything from
  a cereal box to a library book (`Scanner.kinds`: `'qr'`, `'ean-13'`, `'ean-8'`, `'upc-a'`, `'upc-e'`,
  `'code-128'`, `'code-39'`, `'code-93'`, `'codabar'`, `'itf'`, `'data-matrix'`, `'aztec'`, `'pdf417'`).
  - `scan()`: the code that has just been read, **once** each time one comes into view (else null):
    `{ text, kind, seed, x, y, w, h, left, top, corners }`.
  - `seed` is a whole number made from the text, the same for the same code on every phone and far
    apart for codes one digit apart: hand it to `gs.art.creature(seed)`, `gs.gen.dungeon(40, 30, { seed })`,
    `gs.math.rng(seed)`. A whole kitchen becomes a deck of monsters.
  - `code` is the code in view now (or null), `list` all of them, `backend` which reader is at work.
  - `Scanner.seed('any text')` gives the seed for a typed word.

```js
reset() { scanner = new Scanner({ shape: 1 }); monster = null; }
down(x, y) { if (shuffle.hit(x, y)) monster = gs.art.creature(Math.random() * 1e9 | 0); else scanner.start(); }   // "Surprise me"
update(dt) { scanner.update(); const code = scanner.scan(); if (code) { monster = gs.art.creature(code.seed); feel.powerup(W / 2, H / 2); } }
draw(c) { if (scanner.picture) c.drawImage(scanner.picture, 30, 60, 300, 300); /* a square window onto the camera */ }
```

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

No game uses `gs.gen` yet: the examples above are what there is.
