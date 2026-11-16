# gs.city

Made-up cities: streets, lit buildings with rooms to walk into, traffic and people, police, one big streamed city of districts, routes, a GPS and maps.

`gs.city.City(view, { seed, blocks, style: 'downtown'|'oldtown'|'harbour'|'suburb'|'beach'|'marina'|'glades', climate, traffic, people, sky })` (made-up streets, lit buildings with rooms behind every window, traffic at the lights and people (on Next Gen real cars and sculpted people, sculpted the first time a phone meets them, and ground painted round the camera with no repeats; `far: true` goes on to the horizon as stand-ins, far lights and hills); `update(dt, player)`, `avoid`, `collide`, `ray`, `route`, `spot('door'|'rooftop'...)`, `cars.hit`, `cars.chase(car, target, { how })`, `cars.crash(car, push)`, `people.scare`, `people.knock`, `events` (crash, wreck, knock, call), `plan`, `drawMap`; cars change lanes, overtake, swerve and pull over for sirens, people sit, phone, chat, gather and fall as full people when hit; blocks behind the player let go past `keep` and stand as lit boxes); `Wanted(city, api)` the police and stars: `crime(kind, at)`, `update(dt, player)`, `stars`, `seen`, `busting`, `on('busted')`; tactics (chase, ram, cut off, roadblock) are a Tiny Brain that learns the player; from two stars officers who get out are armed (Health, a gun, Reactions, a `gs.tactics` Squad that takes cover and flanks) and fire (`on('shot', e => ...)`: `e.hit`, `e.damage` are the game's to take off), from three a police helicopter comes (its searchlight on the player by night keeps them seen), and police launches come after a player on the water (`armed`, `air`, `water` options; a Tiny Brain picks how the helicopter and launches close in); `law.shoot(from, dir, { damage })` is the player firing back (officers, the helicopter, launches; not through walls), `law.heli`, `law.boats`, `law.brains` (to save or look into); `gs.city.Metro(view, { seed, districts: ['downtown', 'oldtown', 'suburb', 'harbour'], far })` one big city of districts with roads between, each made a few ms a frame as the player comes near, hills round them, a river bridged, tunnels, a highway round it all with slip roads, and cars on them (`hills`, `river`, `highway`; `prepare(player)` in reset(), then `update(dt, player)`; `route`, `road`, `ground(x, z, y)`, `districtAt` across them all); `gs.city.Interiors(city, { world })` the rooms behind every front door (a store, diner, bar, home, lobby or warehouse made as the player comes near; the door swings open and they walk straight in; `room`, `entered`, `near`, `room.spots.keeper` / `counter` / `seats`; on Next Gen a keeper behind the counter and patrons sat or stood about (`room.people`, `room.keeper`, `people: false` for none, `ROOM_PEOPLE` how many by phone); `on('enter' | 'leave', room => ...)` or `onEnter` / `onLeave`; `city.door(b, open)` by hand); `gs.city.Gps(city)` finds the way (`to(target)`, `watch(jobs)`, `update(dt, player)`, `next` turn, `mini(c, ...)` minimap that turns, `open()` + `map(c, ...)` + `tap(x, y)` waypoint, `show(view)` the way on the road); guide `docs/city.md`.

`gs.city.Town(view, { seed, kind })` builds a `gs.town` plan in 3D (buildings `cottage`, `timberframe`, `keep`, `gs.models.fort` walls, towers and gate, windows and torches lit by the clock); see [gs.town](town.md).

## Coasts, climates and water

- **Styles on the water.** `beach`: pastel art-deco hotels (neon on their parapets and shop fronts at night), a palm promenade, then sand from the promenade down into the surf with parasols, loungers, towels and lifeguard huts (`plan.beach`, `plan.spots.beach`). `marina`: towers on a quay with piers and berths: `plan.spots.slip` (where a boat lies, its `heading` facing out) and `plan.spots.dock` (the pier beside it, where a person steps aboard). `harbour` keeps its stone quay. `water: 'east'` (or `'north'`, `'west'`, `false`) and `shore: 'quay'|'beach'|'marina'` move or change any style's water.
- **Climates.** `climate: 'temperate'|'tropical'|'wetland'` sets what grows in the streets and parks (round trees and pines; palms and bushes; bald cypresses with moss, reeds round ponds), the grass and, in a Metro, the land's colour and hills; `kinds` / `parkKinds` give your own weights (`{ palm: 8, round: 2 }`). `glades` is a low wetland town round ponds (`block.kind === 'pond'`). On Next Gen the palms, cypresses, ferns and reeds are `gs.models` plants that sway, drawn as instanced props with simple stand-ins past 70 m.
- **The water is a thing to find.** `city.water` (and `metro.water`, every district's and the river, bay and sea between) joins the game's links as `water`, so `gs.climb` Swimmer, `gs.craft` boats and floating things, `gs.sky` rain and splashes find it with nothing passed: `height(x, z)` the surface (`-Infinity` on dry land), `bed(x, z)` the sand or sea bed under it. `sea: true` draws it as a `gs.outdoors` Sea with swell and surf (off by default: flat water).
- **Rapier ground with no floor over the water.** `solid(world)` on a city or metro with water makes the ground itself (streets, the land, the beach's sand down the slope, the quay, piers and piles, the sea bed at 3 m) in place of a plane at 0, so whoever walks off the quay or down the beach is in the water. A city with no water keeps the plane.
- **Metro on a bay.** `gs.city.Metro(view, { districts: ['downtown', 'oldtown', 'glades', 'marina', 'beach'], coast: 'bay', climate: 'tropical' })`: the waterfront districts face a bay along the mainland's east side, the beaches are out on an island across it facing the open sea, and the roads across the water are causeways on piers 5 m up that boats pass under; the highway rings the mainland only.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CityPart`, line 5221), where every option and field is described.

- `City: new (view: Loose, o?: { seed?: number; blocks?: number | [number, number]; style?: CityStyleName | Record<string, Loose>; side?: 'right' | 'left'; /** The trees …` A made-up city from a seed, in a gs.hd HDView (or any view with .scene and .cam). (:5226)
  - `plan: CityPlan` (:5450)
  - `group: Loose` (:5450)
  - `seed: number` (:5450)
  - `start: CitySpot` (:5450)
  - `t: number` (:5450)
  - `water: CityWater | null` The city's water (its shore and ponds) as one thing that swimmers, boats and the rain find; a Metro's district: the Metro's. (:5451)
  - `sea: Loose | null` With { sea }: the gs.outdoors Sea drawn for it. (:5451)
  - `far: { count: number; lampCount: number; readonly triangles: number; readonly draws: number; group: Loose } | null` With { far }: the city to the horizon (stand-ins, far lamps and land), else null. (:5453)
  - `night: number` 0 day .. 1 night: windows, shop signs, street lamps and car lights. (:5455)
  - `cars: { list: CityCar[]; /** Cars within r, nearest first: o.parked adds the kerbside parked cars ({ parked: true }), police: false leaves police cars out, moving: fal…` The traffic: cars that keep to their lanes, change lanes, overtake, swerve round what is in the way, pull over for sirens, and crash. (:5457)
  - `parkedNear(x: number, z: number, r: number): CityCar[]` The parked cars along the kerbs within r of x, z ({ parked: true }), nearest first. (:5476)
  - `unpark(car: CityCar, o?: { by?: Loose }): VehicleT | null` A parked car taken off the kerb (out of the props, its body dropped): a gs.models vehicle where it stood, and a 'carjack' event. (:5477)
  - `people: { list: CityPerson[]; near(p: { x: number; z?: number; y?: number }, r: number): CityPerson[]; hit(p: { x: number; z?: number; y?: number }, r?: number): CityP…` The people in the street: walking, waiting and crossing, sitting on benches, on the phone, chatting, looking in windows, going in at doors; they jump out of the way, gather to look at a crash and phone the police;… (:5479)
  - `events: CityEvent[]` What happened last frame (crashes, wrecks, knocks, calls, bangs, and anything a game or kit added with event()). (:5490)
  - `event(e: CityEvent): CityWorld` Adds something that happened, for everything that reads city.events next frame. (:5492)
  - `props: PropsPart['Props'] extends new (...a: Loose[]) => infer P ? P : Loose` (:5493)
  - `reset(focus?: { x: number; z: number }): CityWorld` (:5494)
  - `update(dt: number, focus?: { x: number; z?: number; y?: number }): CityWorld` (:5495)
  - `avoid(p: { x: number; z?: number; y?: number; vx?: number; vz?: number; v?: number; heading?: number }, r?: number): CityWorld` Cars brake for this point (radius r) this frame and swerve round it; with vx, vz (or v and heading) cars and people get out of its way. (:5497)
  - `warm(): CityWorld` Builds every chunk now (otherwise they're built a few a frame, nearest first). (:5499)
  - `signal(node: CityPlan['nodes'][number], axis: 'x' | 'z', t?: number): 'g' | 'a' | 'r'` Traffic light state for traffic along axis at a junction: 'g' | 'a' | 'r'. (:5501)
  - `signalLeft(node: CityPlan['nodes'][number], axis: 'x' | 'z', t?: number): number` (:5502)
  - `buildingAt(x: number, z: number): CityBuilding | null` (:5503)
  - `ground(x: number, z: number): number` (:5504)
  - `collide(p: { x: number; z?: number; y?: number }, r?: number, y?: number): CityBuilding | CityParkedCar | null` Pushes a circle out of the buildings and parked cars (changes p); the building (or parked car) touched, or null. (:5506)
  - `door(b: CityBuilding, open?: number | boolean): number` Opens (1 or true) or shuts (0) building b's front door: it swings over the next frames, and after solid(world) it stops being solid while open. (:5508)
  - `doors: { open(b: CityBuilding): number; set(b: CityBuilding, want: number): void } | null` Every building's front door (null with { doors: false }): open(b) says how far open, 0..1. (:5510)
  - `indoor: { x: number; y: number; z: number; col?: string; i?: number; reach?: number }[] | null` Lamp spots lit by day and by night along with the street's (gs.city Interiors sets them for the rooms near the player). (:5512)
  - `parked: CityParkedCar[]` The parked cars (empty without the parked option). (:5514)
  - `ray(from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, far?: number): { point: { x: number; y: number; z: number }; normal: { x: numb…` (:5515)
  - `road(x: number, z: number, heading?: number | null): { x: number; z: number; heading: number; edge: Loose; lane: number; s: number; d: number }` The nearest point in a lane. (:5517)
  - `route(a: { x: number; z?: number; y?: number }, b: { x: number; z?: number; y?: number }): { points: [number, number][]; path: Loose; length: number; nodes: CityPlan['…` (:5518)
  - `spot(kind?: 'door' | 'rooftop' | 'corner' | 'street' | 'pavement' | 'park', o?: { near?: { x: number; z?: number; y?: number } | null; min?: number; max?: number; rnd?…` (:5519)
  - `occluders(near?: { x: number; z?: number; y?: number } | null, r?: number): { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[]` Building boxes for occlusion culling (optionally only those within r of near). (:5521)
  - `walls(): Loose[]` (:5522)
  - `solid(world: Loose, o?: { buildings?: boolean; floor?: boolean; furniture?: boolean; parked?: boolean; cars?: number; people?: number; within?: number; /** true: a car…` The city solid in a gs.physics3d World3D: buildings and kerbs, street furniture (trunks, posts, benches, bins, roof tanks), parked cars, and bodies for the nearest `cars` and `people` that move with them (refreshed… (:5528)
  - `freed: number` How many blocks' chunks have been let go behind the player (keep). (:5530)
  - `drawMap(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o?: { at?: { x: number; z?: number; y?: number }; range?: number; turn?: number; colou…` (:5531)
  - `mapPoint(p: { x: number; z?: number; y?: number }): [number, number]` (:5532)
  - `dispose(): void` (:5533)
- `Metro: new (view: Loose, o?: { seed?: number; /** How many (4), or styles, or { style, blocks, seed, name }; the first is the middle. */ districts?: number | (string |…` One big city of districts side by side (a downtown, an old town, suburbs, a harbour on the south edge with the sea past it), joined by roads across open land. (:5245)
  - `water: CityWater | null` The water of every district and between them (rivers, the bay, the sea), as one: what swimmers, boats and the rain find. (:5360)
  - `sea: Loose | null` With { sea }: the gs.outdoors Sea drawn for it. (:5360)
  - `districts: CityDistrict[]` (:5361)
  - `connectors: CityRoad[]` (:5361)
  - `bounds: { x0: number; x1: number; z0: number; z1: number }` (:5361)
  - `start: { x: number; z: number }` (:5361)
  - `night: number` (:5361)
  - `ring: CityRoad | null` The highway round the city (null with highway: false), and the slip roads up to it. (:5362)
  - `ramps: CityRoad[]` (:5362)
  - `ways: { river: Loose; roads: CityRoad[]; landAt(x: number, z: number): number; natural(x: number, z: number): number; hills(x: number, z: number): number; near(x: numb…` The land and roads between the districts: river { axis, c, from, to }, landAt(x, z), natural(x, z) (before the roads), hills(x, z), near(x, z, reach) the nearest road point, roads (every one), traffic (its cars: list). (:5364)
  - `indoor: { x: number; y: number; z: number; col?: string; i?: number; reach?: number }[] | null` Lamp spots lit by day and by night in every district (gs.city Interiors sets them). (:5365)
  - `readonly cities: CityWorld[]` The made districts. (:5366)
  - `readonly city: CityWorld | null` The made district the player is in, or null on the roads between. (:5366)
  - `making: CityDistrict | null` The district being made a step at a time, or null. (:5367)
  - `cars: Omit<CityWorld['cars'], 'take' | 'near'> & { near(p: { x: number; z?: number; y?: number }, r: number, o?: { parked?: boolean; police?: boolean; moving?: boolean…` Every car of the city, as a City's cars: each made district's traffic, the cars on the roads between (the connectors, slip roads and highway: they pull over for sirens, crash into World3D bodies after solid(world),… (:5374)
  - `people: CityWorld['people']` Every made district's people, as a City's (near and witness nearest first across districts). (:5382)
  - `events: CityEvent[]` What happened last frame in every made district and on the roads between (crashes, wrecks, carjacks, calls...). (:5383)
  - `event(e: CityEvent): CityMetro` Adds something that happened: to the made district at e.at, else to the big city's own, for everything that reads events next frame. (:5384)
  - `readonly ears: Loose | null` What hears the city's sounds: the district's Ears, or the big city's own on the roads between. (:5385)
  - `planOf(edge: Loose): Loose | null` The plan (a district's) a road edge belongs to, or null. (:5386)
  - `switchTo(at: { x: number; z?: number; y?: number }, o?: { reset?: boolean }): CityMetro` The player somewhere else at once (a second lead, a taxi ride, a cutscene): the districts far from there are let go first (a half made one too), then the ones there are made now (under a fade or loading screen), and… (:5392)
  - `update(dt: number, focus?: { x: number; z?: number; y?: number }): CityMetro` (:5393)
  - `reset(focus?: { x: number; z: number }): CityMetro` (:5393)
  - `prepare(at?: { x: number; z?: number; y?: number }): CityMetro` Makes now every district the player at `at` wants (from reset(), under the loading screen). (:5394)
  - `districtAt(x: number, z: number, margin?: number): CityDistrict | null` (:5395)
  - `route(a: { x: number; z?: number; y?: number }, b: { x: number; z?: number; y?: number }): { points: [number, number][]; path: Loose; length: number; legs: ({ district…` A driving route across districts and the roads between: as City.route(), plus its legs in order. (:5397)
  - `road(x: number, z: number, heading?: number | null): Loose` The nearest point in a lane: as City.road(), plus district, or road (between districts) with back (driving from its second district); heading (radians) picks the side going that way. (:5399)
  - `along(r: CityRoad, s: number, out?: Loose): { x: number; y: number; z: number; dx: number; dz: number; kind: number; grade: number }` A point s metres along a road between districts, a slip road or the highway { x, y, z, dx, dz, kind, grade }, and the middle of its lane k (back: driving from its second end). (:5401)
  - `lanePos(r: CityRoad, k: number, s: number, back?: boolean, out?: Loose): { x: number; y: number; z: number; dx: number; dz: number; grade: number }` (:5401)
  - `ground(x: number, z: number, y?: number): number` The ground at x, z: in a district as City.ground(); between them the road or the land, under height y when given (under a bridge, the land; in a tunnel, the road). (:5403)
  - `roadY(x: number, z: number): number` The height of the road at x, z (on a bridge its deck, in a tunnel its floor), else the land: for things drawn on the road. (:5404)
  - `avoid(p: { x: number; z?: number; y?: number }, r?: number): CityMetro` (:5405)
  - `buildingAt(x: number, z: number): CityBuilding | null` (:5405)
  - `collide(p: { x: number; z?: number; y?: number }, r?: number, y?: number): CityBuilding | Loose | null` (:5406)
  - `ray(from: P3, dir: P3, far?: number): { point: P3; normal: P3; dist: number; building: CityBuilding } | null` (:5406)
  - `spot(kind?: 'door' | 'rooftop' | 'corner' | 'street' | 'pavement' | 'park', o?: { in?: string; near?: { x: number; z?: number; y?: number } | null; min?: number; max?:…` A spot in a made district (in: its name), or for 'street' also a lane of the roads between ({ x, y, z, heading, road, lane, s, back }). (:5408)
  - `occluders(near?: { x: number; z?: number; y?: number } | null, r?: number): { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[]` (:5409)
  - `walls(): Loose[]` (:5409)
  - `solid(world: Loose, o?: { furniture?: boolean; parked?: boolean; cars?: number; people?: number; within?: number }): CityMetro` Solid in a World3D: the ground, and each made district as City.solid() (one made later is made solid as it is made). (:5410)
  - `drawMap(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o?: { at?: { x: number; z?: number; y?: number }; range?: number; turn?: number; colou…` (:5411)
  - `mapPoint(p: { x: number; z?: number; y?: number }): [number, number]` (:5412)
  - `dispose(): void` (:5413)
- `routeOn(plan: CityPlan, a: { x: number; z?: number; y?: number }, b: { x: number; z?: number; y?: number }): { points: [number, number][]; path: Loose; length: number;…` A driving route across a plan's roads (from layout()), with no 3D: as City.route(). (:5253)
- `roadOn(plan: CityPlan, x: number, z: number): { x: number; z: number; heading: number; edge: Loose; lane: number; s: number; d: number }` The nearest point in a lane of a plan's roads: as City.road(). (:5255)
- `Gps: new (city: CityWorld | CityMetro, o?: { /** Metres off the route before it is worked out again (18). */ off?: number; /** Seconds between routes worked out anyway…` Finding the way round a City or a Metro: a route to where the player is going that follows them (worked out again when they leave it), the next turn, markers (a game's own, and those of anything watched, such as… (:5261)
  - `route: { points: [number, number][]; path: Loose; length: number; at: number[]; turns: { s: number; x: number; z: number; turn: 'left' | 'right'; angle: number }[]; to…` (:5418)
  - `left: number` Metres to go along the route; how far along it the player is (s); there yet. (:5419)
  - `s: number` (:5419)
- …more: `CityPart` at src/gamescroll.d.ts:5221

## From the maker kit

From [3D physics](../maker-kit.md#3d-physics):

- **Shapes by size, and many in one body**: `shape(mesh, { box: [w, h, d] | ball: r | capsule: [r, h] | hull: points,
  off, turn })` for a body of a size you give (not the mesh's). `shapes([{ box, at, turn, part }...], { tag, sound })`
  puts thousands of still shapes (a street's posts, a forest's trunks) in one fixed body: `add`, `drop(part)`,
  `set(part, at, turn)`, and a ray's `hit.part` says which one. `gs.props`' `solid()` and `gs.city`'s `solid()` use it.

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Cities** (`gs.city`, 3D): `new City(view, { seed, blocks: 6, style: 'downtown' | 'oldtown' | 'harbour' | 'suburb' })`
makes a made-up city from a seed: streets and junctions with traffic lights, buildings with lit windows,
shops, roof tanks and fire escapes, parks, trees and lamps, cars that keep to their lanes, stop at
red, change lanes, overtake, swerve, pull over for sirens and crash (Rapier bodies after `city.solid(world)`),
and people who cross at the corners, sit, phone, chat, gather at a crash and fall when hit. `city.update(dt, player)`
each frame; `city.avoid(player)` makes cars brake and swerve for you. It answers `collide`, `ray`, `route(a, b)`
(a `gs.paths` Path along the roads), `spot('door' | 'rooftop' | ...)`, `cars.hit`, `cars.chase(car, target)`,
`cars.crash(car, push)`, `people.scare`, `people.knock`, `city.events`, and gives the plan as plain
numbers for your own map. `new gs.city.Wanted(city, api)` is the police and a wanted level: stars from crimes
seen or phoned in, police cars that chase, ram, cut you off and set roadblocks (a Tiny Brain picks the
tactics and learns this player), officers on foot, searches, busted or escaped; `cars.take(car)` takes any car (moving,
parked or police) with a 'carjack' event the police hear. `new Metro(view, { seed, districts: 4 })` is one big city of districts side by side with
roads between, each made over a few frames as the player comes near and let go behind, with hills round them, a river
bridged, tunnels, a highway round it all with slip roads, and cars on all of them; police chase on across all of it and
`switchTo(at)` jumps the player elsewhere. `new Gps(city)` finds the way: a route
that follows the player, the next turn, markers, a minimap that turns, a full map to tap for a waypoint, and the way drawn on the
road. `new Interiors(city)` opens the city's front doors onto rooms: walk up to a shop, a diner, a bar, a home, a lobby
or a warehouse and its room is made, the door swings open and you walk straight in (`room.spots` for a keeper, the counter and
seats). The full guide is [docs/city.md](city.md).

From [Feel, sound, touch and 2D animation (round 9)](../maker-kit.md#feel-sound-touch-and-2d-animation-round-9):

**Next Gen extras** (`gs.hd` HDView): `v.decal(mesh, point, normal, { size, colour, paint, life })` puts a
mark on a surface that wraps over its shape (scorches, footprints, paint; capped at 40, oldest
first; on WebGPU hundreds cost no draws, as boxes in the lamps' grid), `v.bakeLight({ box, maps: [land.mesh] })` bakes a whole level's light on the phone the first time it is played (probes and the ground's light map, kept on the phone; docs/nextgen-3d.md), `v.bakeLight([x, y, z], { radius })` bakes the light around a point into a light probe so rooms
and caves pick up the colour of their walls and windows (several blend as the camera, or
`v.probeAt`, moves; bake once after building the level: it returns a promise and joins a frame or two later), `v.bounce(box)` adds bounce light over a level (a grid of probes: a red wall tints the floor, light from a door fills a room; WebGL and WebGPU), `v.room(box)` gives shiny things in a room box-projected reflections of that room, `v.detail(meshes)` asks for cluster detail on meshes under 8,000 triangles (big meshes get it by themselves, still or moving, copies, several materials, cut-outs, skinned and morphing: each part is drawn only as finely as shows, see docs/nextgen-3d.md; `v.detail(meshes, false)` draws them whole), what is fully hidden behind other things is left out of the frame by itself (occlusion culling, from the last frame's own depth: nothing to list; `mesh.userData.noOcclude = true` always draws a mesh, and `v.occluders(boxes)` adds big solid boxes of your own, as `gs.city` does for its buildings), and `v.shafts = 1` adds sun shafts streaming
past whatever blocks the sky (not on the lowest tier).

From [A yard, a street or a square to stand on](../maker-kit.md#a-yard-a-street-or-a-square-to-stand-on):

- `ground.add(mesh, kind)` paints a kerb's top or a pavement the same way. A `gs.city` lays its own.

From [Towns that live](../maker-kit.md#towns-that-live):

`gs.town` is a village or a castle town as rules: a world clock, a layout from a seed, townsfolk who live their
day by the clock, shops and monsters that come at night. It is plain data, so a 2D game can use it too;
`gs.city.Town` builds the same plan in a Next Gen view. Reputation is the `gs.rpg` kit's: a shop given a `faction`
finds the game's Reputation and prices by the hero's standing with it (dearer when they dislike the hero, and they
pay less), and `rep.mood(faction)` says how a townsperson meets the hero.

```js
const { Clock, Folk, Shop, Night } = gs.town, { Town } = gs.city;
make() {
  sky = new gs.sky.Sky(view, { physical: true });
  clock = new Clock({ hour: 8, speed: 1 / 30 });              // a day in 12 minutes; drives the Sky by itself
  town = new Town(view, { seed: 7, kind: 'castle', houses: 16 });   // solid in the game's World3D by itself
  folk = new Folk(town.plan, { crowd });                      // a gs.props.Crowd of human() kinds: moved by itself
  night = new Night(town.plan, { kinds: ['ghoul', { kind: 'wolf', speed: 2.4 }] });
  inn = new Shop({ stock: { stew: { price: 4, count: 6 }, room: { price: 10, count: 3 } }, keeper: folk.of('innkeeper')[0], faction: 'town' });
}
update(dt) { clock.update(dt); town.update(dt); folk.update(dt); night.update(dt, hero); }
```

- The clock: `hour`, `day`, `night`, `dark` (0..1 over an hour at dawn and dusk), `part`; `clock.wait(3)` passes
  three hours over 2.5 seconds (`{ over: 0 }`: at once) and `clock.sleep('dawn')` waits till dawn; both are promises.
  `clock.every(18, day => ...)` calls each day as the clock passes six in the evening, waiting or not.
- The plan: `roads` (a main road and lanes that bend), `square`, `buildings` (role `inn`, `smithy`, `store`,
  `bakery`, `hall`, `home`, `house`, `keep`, `barracks`; each with `door`, `front` (on the road outside) and its
  `turn`: the door faces `(sin turn, cos turn)`), `props` (the well, market stalls, the anvil...), `walls` and
  `gates` (castle), `lights` (torches by doors), `fields` (village), `edge` (where the wild begins) and the walking
  graph; `gs.town.route(plan, from, to)` walks it.
- Folk: each person has a job (`smith`, `keeper`, `baker`, `innkeeper`, `farmer`, `guard`, `nightwatch`, `elder`,
  `idler`), a home and a routine (`gs.town.ROUTINES`, or yours: `routines: { smith: [{ from: 6, to: 12, at: 'work',
  do: 'work' }, ...] }`). Read `doing`, `moving`, `inside` (a building id: indoors), `x`, `z`, `turn`.
  `folk.hold(person, 6, hero)` stops one to talk, `folk.near(x, z, r)`, `folk.at(building)`, `folk.of(job)`.
  After a wait everyone is where the clock says.
- Sleep and wait: `folk.rest('dawn', hero)` gives `{ ok, done }`, or `{ ok: false, why: 'danger' }` with a monster
  within 30 m. Fade the screen while `clock.waiting`.
- Shops: `open` by their hours and their keeper (shut while the keeper is away or hiding), `buy(id, n, wallet,
  inventory)` and `sell(...)` with a wallet `{ money }` and a `gs.items` Inventory, restocked each morning.
- The night: monsters come in from the edge after dusk, prowl the roads to the square, keep out of the torches'
  light, hunt the hero inside `sense` metres and go back at dawn; townsfolk go home while any are about. The kit
  moves them (`steer: false`: you do); the game draws them and decides who is hurt (`night.kill(m)`).
- Buildings in code: `gs.models.building({ style: 'cottage' | 'timberframe' | 'keep' })` (daub between oak beams
  under thatch, a timber-framed house under slate, a stone keep with battlements; roofs `thatch` and `battlement`),
  `gs.models.fort({ kind: 'wall' | 'tower' | 'gate' })` and the props `stall`, `well`, `anvil`, `torch`, `lever`,
  `bed`, `hay` and `signboard`. All of them come apart in `gs.destruction.Structure` too.
- Saving: `clock`, `folk`, each `Shop` and `night` have `pack()` / `unpack(d)` (for `WorldSave.keep`).
- To look it over: `node scripts/town.cjs sheet.png [kind=castle] [views=square,street,cottage,inn,gate,keep,high,map]
  [times=10,21.5] [seed=7] [--webgpu]` (`map` shows each townsperson where the hour has them).

## In real games

1 game uses it (`node scripts/examples.mjs gs.city` lists them). The shortest:

`src/games/parcel-dash.js` (Parcel Dash, Next Gen · Driving, 199 lines):

```js
const { HDView, pbr, rbox, sun, THREE } = gs.hd;
const { City, Gps } = gs.city;
// …
  sky = new Sky(v, { time: 17.9, speed: 0, stars: 200, sun: light, physical: true, fog: true });
  city = new City(v, { seed: 7, blocks: 6, style: 'downtown', sky, traffic: 1, people: 1 });
// …
  // the GPS: the way to the drop, worked out again when you leave it, on the minimap, as the next turn and as arrows on the road
  gps = new Gps(city, { icon }); gps.show(v, { reach: 160, width: 1.6, opacity: .8 });
// …
  const pickTarget = () => {
    target = city.spot('door', { near: { x: car.x, z: car.y }, min: 110, max: 300, rnd: R }) || city.spot('door', { rnd: R });
// …
    ring.position.set(target.x, .2, target.z); beacon.position.set(target.x, 80, target.z);
    drop.at = target; gps.to(target); trip = city.route({ x: car.x, z: car.y }, target)?.length || 0;   // (how far it is by road, for the bonus)
// …
      if (!v) setup();
      city.reset(); R = rng(11);
      const st = city.spot('street', { near: city.start, max: 60, rnd: R }) || city.road(0, 0);
// …
      camPos = new THREE.Vector3(car.x, 6, car.y - 10); camLook = new THREE.Vector3(car.x, 1, car.y);
      gps.clear(); gps.add(drop); pickTarget(); gps.update(0, { x: car.x, z: car.y, heading: Math.PI / 2 - car.angle });
```
