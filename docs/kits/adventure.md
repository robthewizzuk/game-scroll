# gs.adventure

Point-and-click adventures: rooms, hotspots, use X on Y, exits, flags, a map.

`gs.adventure.Adventure` (point-and-click rooms, hotspots, use X on Y, exits, flags, auto-map)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`AdventurePart`, line 3064), where every option and field is described.

- `Adventure: new (o?: { start?: string | null; bag?: Loose }) => Adventure` (:3064)
  - `rooms: Map<string, AdvRoom>` (:3053)
  - `here: string` (:3053)
  - `seen: Set<string>` (:3053)
  - `flags: Record<string, Loose>` (:3053)
  - `bag: Loose` (:3053)
  - `lines: { nothing: string; cant: string }` (:3053)
  - `on(ev: 'say' | 'enter' | 'take' | 'exit' | 'use' | 'look' | 'talk' | 'locked' | 'cant' | 'nothing' | 'flag' | 'combine', fn: (...a: Loose[]) => void): Adventure` (:3054)
  - `room(id: string, o?: { map?: [number, number]; name?: string; [k: string]: Loose }): AdvRoom` (:3055)
  - `spot(id: string, room?: string): AdvSpot | null` (:3055)
  - `spots(room?: string): AdvSpot[]` (:3055)
  - `at(x: number, y: number, room?: string): AdvSpot | null` (:3055)
  - `rule(item: string, target: string, fn: (spot: AdvSpot | null, item: string, other?: string) => string | void, o?: { keep?: boolean }): Adventure` (:3056)
  - `flag(k: string): Loose` (:3057)
  - `flag(k: string, v: Loose): Adventure` (:3057)
  - `unlock(room: string, spot: string): Adventure` (:3057)
  - `isLocked(s: AdvSpot): boolean` (:3057)
  - `go(room: string): Adventure` (:3057)
  - `say(text: string, spot?: AdvSpot): string` (:3057)
  - `tap(x: number, y: number, item?: string | null): AdvResult` (:3058)
  - `act(s: AdvSpot, item?: string | null, verb?: 'look' | null): AdvResult` (:3058)
  - `combine(a: string, b: string): string | null` (:3058)
  - `walkTo(s: AdvSpot, floorY?: number | null): { x: number; y: number }` (:3059)
  - `map(): { id: string; name: string; col: number; row: number; here: boolean; links: string[] }[]` (:3060)
  - `drawMap(c: CanvasRenderingContext2D, x: number, y: number, o?: { w?: number; h?: number; gap?: number; room?: string; here?: string; line?: string; text?: string; font…` (:3061)
  - `save(): Loose` (:3062)
  - `load(d: Loose): Adventure` (:3062)

## From the maker kit

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

No game uses `gs.adventure` yet: the examples above are what there is.
