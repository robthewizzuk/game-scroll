# gs.adventure

Point-and-click adventures: rooms, hotspots, use X on Y, exits, flags, a map.

`gs.adventure.Adventure` (point-and-click rooms, hotspots, use X on Y, exits, flags, auto-map)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`AdventurePart`, line 3114), where every option and field is described.

- `Adventure: new (o?: { start?: string | null; bag?: Loose }) => Adventure` (:3114)
  - `rooms: Map<string, AdvRoom>` (:3103)
  - `here: string` (:3103)
  - `seen: Set<string>` (:3103)
  - `flags: Record<string, Loose>` (:3103)
  - `bag: Loose` (:3103)
  - `lines: { nothing: string; cant: string }` (:3103)
  - `on(ev: 'say' | 'enter' | 'take' | 'exit' | 'use' | 'look' | 'talk' | 'locked' | 'cant' | 'nothing' | 'flag' | 'combine', fn: (...a: Loose[]) => void): Adventure` (:3104)
  - `room(id: string, o?: { map?: [number, number]; name?: string; [k: string]: Loose }): AdvRoom` (:3105)
  - `spot(id: string, room?: string): AdvSpot | null` (:3105)
  - `spots(room?: string): AdvSpot[]` (:3105)
  - `at(x: number, y: number, room?: string): AdvSpot | null` (:3105)
  - `rule(item: string, target: string, fn: (spot: AdvSpot | null, item: string, other?: string) => string | void, o?: { keep?: boolean }): Adventure` (:3106)
  - `flag(k: string): Loose` (:3107)
  - `flag(k: string, v: Loose): Adventure` (:3107)
  - `unlock(room: string, spot: string): Adventure` (:3107)
  - `isLocked(s: AdvSpot): boolean` (:3107)
  - `go(room: string): Adventure` (:3107)
  - `say(text: string, spot?: AdvSpot): string` (:3107)
  - `tap(x: number, y: number, item?: string | null): AdvResult` (:3108)
  - `act(s: AdvSpot, item?: string | null, verb?: 'look' | null): AdvResult` (:3108)
  - `combine(a: string, b: string): string | null` (:3108)
  - `walkTo(s: AdvSpot, floorY?: number | null): { x: number; y: number }` (:3109)
  - `map(): { id: string; name: string; col: number; row: number; here: boolean; links: string[] }[]` (:3110)
  - `drawMap(c: CanvasRenderingContext2D, x: number, y: number, o?: { w?: number; h?: number; gap?: number; room?: string; here?: string; line?: string; text?: string; font…` (:3111)
  - `save(): Loose` (:3112)
  - `load(d: Loose): Adventure` (:3112)

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
