# gs.adventure

Point-and-click adventures: rooms, hotspots, use X on Y, exits, flags, a map.

`gs.adventure.Adventure` (point-and-click rooms, hotspots, use X on Y, exits, flags, auto-map)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`AdventurePart`, line 3052), where every option and field is described.

- `Adventure: new (o?: { start?: string | null; bag?: Loose }) => Adventure` (:3052)
  - `rooms: Map<string, AdvRoom>` (:3041)
  - `here: string` (:3041)
  - `seen: Set<string>` (:3041)
  - `flags: Record<string, Loose>` (:3041)
  - `bag: Loose` (:3041)
  - `lines: { nothing: string; cant: string }` (:3041)
  - `on(ev: 'say' | 'enter' | 'take' | 'exit' | 'use' | 'look' | 'talk' | 'locked' | 'cant' | 'nothing' | 'flag' | 'combine', fn: (...a: Loose[]) => void): Adventure` (:3042)
  - `room(id: string, o?: { map?: [number, number]; name?: string; [k: string]: Loose }): AdvRoom` (:3043)
  - `spot(id: string, room?: string): AdvSpot | null` (:3043)
  - `spots(room?: string): AdvSpot[]` (:3043)
  - `at(x: number, y: number, room?: string): AdvSpot | null` (:3043)
  - `rule(item: string, target: string, fn: (spot: AdvSpot | null, item: string, other?: string) => string | void, o?: { keep?: boolean }): Adventure` (:3044)
  - `flag(k: string): Loose` (:3045)
  - `flag(k: string, v: Loose): Adventure` (:3045)
  - `unlock(room: string, spot: string): Adventure` (:3045)
  - `isLocked(s: AdvSpot): boolean` (:3045)
  - `go(room: string): Adventure` (:3045)
  - `say(text: string, spot?: AdvSpot): string` (:3045)
  - `tap(x: number, y: number, item?: string | null): AdvResult` (:3046)
  - `act(s: AdvSpot, item?: string | null, verb?: 'look' | null): AdvResult` (:3046)
  - `combine(a: string, b: string): string | null` (:3046)
  - `walkTo(s: AdvSpot, floorY?: number | null): { x: number; y: number }` (:3047)
  - `map(): { id: string; name: string; col: number; row: number; here: boolean; links: string[] }[]` (:3048)
  - `drawMap(c: CanvasRenderingContext2D, x: number, y: number, o?: { w?: number; h?: number; gap?: number; room?: string; here?: string; line?: string; text?: string; font…` (:3049)
  - `save(): Loose` (:3050)
  - `load(d: Loose): Adventure` (:3050)

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
