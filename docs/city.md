# Cities (`gs.city`)

`gs.city` makes a whole 3D city from a seed number: streets and junctions, blocks of buildings with
lit windows and shops, parks and plazas, trees and street lamps, traffic that keeps to its lanes and
stops at the lights, and people who walk the pavements and cross at the corners. The same seed always
makes the same city, so leaderboards stay fair. Nothing is loaded from files: the city, its textures
and its sounds are all made in code.

It works with Next Gen (`gs.hd`) views, and with any view that has `.scene` and `.cam`. As with every
kit, the city gives answers (where the roads go, what you hit, where to put the next pickup) and your
game sets the rules and draws its own HUD.

## A city in a few lines

```js
import gs from '../gamescroll.js';
const { HDView, sun } = gs.hd, { City } = gs.city, { Sky } = gs.sky;

let v, light, sky, city;
function setup() {
  v = new HDView({ fog: .003 }); v.cam.far = 900; v.cam.updateProjectionMatrix();
  light = sun('#ffc890', 2.4, 60); v.scene.add(light, light.target); v.onTier(T => light.setTier(T));
  sky = new Sky(v, { time: 18.3, sun: light, physical: true });
  city = new City(v, { seed: 7, blocks: 6, style: 'downtown', sky });   // sky: windows light up as it gets dark
}
function make(api) {
  return {
    reset() { if (!v) setup(); city.reset(); /* your player at city.start */ },
    update(dt) {
      city.avoid(player, 1.4);          // cars brake for the player
      city.update(dt, player);          // builds what's coming into view, moves cars and people
      sky.update(dt);
    },
    draw(c) { /* camera */ v.render(c, W, H); },
  };
}
```

Make the city once (in `make()` or the first `reset()`, like the view) and call `city.reset()` from
`reset()` to put the cars and people back. `src/games/parcel-dash.js` is a full game made with it.

## Options

`new City(view, { ... })`:

| Option | What it does |
| --- | --- |
| `seed` | Which city (a number). The same seed gives the same streets and buildings. |
| `blocks` | How many blocks across: `6`, or `[8, 4]` for a long city. Each block is 50 to 100 m. |
| `style` | `'downtown'` (towers in the middle), `'oldtown'` (brick and plaster, 3 to 6 floors), `'harbour'` (warehouses and a quay on the water), `'suburb'` (houses with gardens and pitched roofs), or your own (below). |
| `side` | `'right'` (drive on the right) or `'left'`. |
| `traffic`, `people` | How busy, 1 = normal. Scaled down on slower phones by itself. |
| `night` | 0 (day) to 1 (night): windows, shop signs, street lamps and car lights. |
| `sky` | A `gs.sky` Sky: the city follows its `night`. |
| `lamps` | Real lights from the nearest street lamps at night (default on); on a Next Gen view the cars drawn whole light the road ahead with dipped headlights that cast shadows. |
| `sound` | The city's hum, horns from cars stuck behind you, birds in the parks, a far siren (default on). |
| `at` | Where the player starts (that part is built first). |
| `detail` | Metres within which awnings, cornices and fire escapes show (default 260). |
| `rooms` | Rooms behind every window and shop front (default on): the glass is set back in the wall with its frame and bars, and past it a room of its own, with walls, a floor, a ceiling, something standing in it and curtains or blinds, dim by day and lit at night (the windows the facade lights, so a street is lit the same near and far). `false`: windows painted on, as before. |
| `fleet` | The traffic as real cars (`gs.models.vehicle`, default on a Next Gen view): the nearest few drawn whole, wheels rolling and steering, bodies dipping as they brake, brake lamps, seats and dashboards behind see-through glass, paint with flakes in some colours, a little road grime and rain beading; the rest as simpler copies in two draws a style, with dark glass. `false`: two boxes a car. |
| `dress` | Street dressing and depth on the fronts (default on): stone ledges along each storey of the old blocks, fins between the glass towers' bays, balconies, sills, air-con boxes, shopfronts with pilasters and a fascia with each shop's sign (made-up names, lit at night), stair huts, vents and dishes on the roofs; kerb stones, drains, worn road paint, a name sign at each corner (made-up street names), bins, bollards round the squares, parking signs, wires across the old town's streets and along the suburb's poles. `false`: as before. |
| `paint` | The ground with no repeats (default on a Next Gen view): the roads, pavements, plazas and parks round the camera are painted from what each is into two pictures that follow the camera (a fine one 32 m across and a coarser one 128 m across, a strip at a time as it moves), and read in place of the tiled ground pictures: patches, cracks and tar lines in the asphalt, slabs laid in a bond with a cracked or newer one here and there, gum and stains, oil under some parked cars and skid marks before some stop lines. Past 64 m the tiles are read as before. `false`: the tiles everywhere. |
| `far` | The city to the horizon (default off; `true` for 6 km, or how far in metres): past the last street a made-up city goes on as stand-ins in this one's colours and storeys (blocks of 90 m out to 1.5 km, 180 m to 3.5 km, 360 m beyond, thinning out into the country), each block on a pad of street, with windows that light at night, their street lights one batch of dots that fade into the haze, and land round it all out to 10 km, flat and then hills. About 20,000 to 30,000 triangles in ten or eleven draws, made in about 50 ms; nothing of it is solid. It makes the camera see 10.8 km if it didn't already. To see it, the air must be thin: fog about `.00012` and `v.air({ haze: .00025 })` (the street scenes' `.0022` hides everything past a kilometre). |
| `keep` | Metres from the player within which the blocks stay built (default 600). Past it, and a little more, a block is let go: its meshes and their memory freed, and its buildings stand as plain boxes of their own shape and colour with lit windows, so the skyline stays whole and a long drive's memory stays bounded. Less while the phone is short of memory. `Infinity` keeps everything once built. `city.freed` counts what was let go. |
| `centre` | Where the city's middle is, `[x, z]` (default the origin). A city moved is the same city, moved: districts side by side (see One big city, below). |
| `walls` | What the street walls wear (default on): posters pasted between the ground floor's windows (made-up bands, fairs and a lost cat, some pasted over others, torn and faded), a few tags in made-up words low on the walls, each its own colour, a big painted piece across the harbour's sheds, damp streaks and rust runs under some sills, and grime along the foot of every street wall. One picture made in code, one mesh a chunk, shown within `detail` metres. `false`: bare walls. |
| `parked` | Parked cars along the kerbs where a road is wide enough for them, and on the suburb's drives (default on a Next Gen view): the city's three commonest styles, whole close by (seats behind see-through glass, its glass one draw a style) and simpler further off, each its own colour. They are solid: `city.collide()` pushes out of them and returns the car (`{ parked: true, ... }`); `city.parked` lists them. |
| `crowd` | The pavements full of sculpted people (`gs.models.human` in a `gs.props.Crowd`, default on a Next Gen view): walking, running from a scare, waiting at the lights, lying where they were knocked. They are sculpted the first time a phone meets them (the card says "Loading…" a few seconds, once) and kept. `false`: figures of boxes. |

Any style setting can be passed straight in too: `new City(v, { style: 'oldtown', floors: [2, 4], trees: 1 })`.
A style is `STYLES.downtown` and friends: `block` (sizes), `street` and `avenue` (road widths; every
`every`-th road is an avenue with two lanes each way), `floors`, `tall` (storeys in the busiest middle),
`core`, `gap` (between buildings), `facades` (how often each look is picked), `shops`, `parks`,
`plazas`, `trees`, `houses`, `setbacks`, `tanks`, `fire`, `water`, and the `ground` and `pavement`
colours. `FACADES` holds the building looks: wall, trim and glass colours, window width, storey
height, how many windows are lit at night and how warm their light is. A style picks from the nine
by name: `stone`, `brick`, `plaster`, `concrete`, `glass`, `dark`, `silver`, `house` and `shed`
(`facades: { brick: 3, glass: 1 }`).

## Answers for your game

| Call | Answer |
| --- | --- |
| `city.collide(p, r, y)` | Pushes a circle (`{ x, z }` or a Vector3) out of the buildings; returns the building it touched. `y`: things above a roof pass over it. |
| `city.ray(from, dir, far)` | The first building along a ray: `{ point, normal, dist, building }`. |
| `city.route(a, b)` | A driving route on the right side of the roads: `{ points, path, length }`. `path` is a `gs.paths` Path, so a `Follower` can drive it. |
| `city.road(x, z)` | The nearest point in a lane, with its `heading`. |
| `city.spot(kind, { near, min, max, rnd })` | A place: `'door'` (outside a building, facing it), `'rooftop'`, `'corner'`, `'street'` (in a lane), `'pavement'`, `'park'`. |
| `city.buildingAt(x, z)`, `city.ground(x, z)` | The building there; the height of the ground (road 0, pavement 0.15, a roof's top). |
| `city.signal(node, axis)` | A junction's light: `'g'`, `'a'` or `'r'`. |
| `city.cars` | `list`, `near(p, r)`, `hit(p, r)` (the car you ran into), `bump(car)` (stops it for a moment), `crash(car, push, { at, spin, by })` (it leaves its lane sliding and spinning; a Rapier body after `city.solid(world)`), `add({ x, z, police, keep })` (a car of your own), `chase(car, target, { how, top, keep, face })` and `release(car)` (below), `stats`. |
| `city.people` | `list`, `near(p, r)`, `hit(p, r)`, `scare(p, r)` (everyone near runs), `cower(p, r)`, `knock(person, dx, dz, s, { speed, by })` (they stagger or fall; near the camera on Next Gen as a full person, a ragdoll after `city.solid(world)`, and get up), `witness(at, r)`, `report(person, at)`, `promote(person)`. |
| `city.avoid(p, r)` | Cars brake for this point this frame and swerve round it when there is room: the player, a fallen sign, a parade. Give it `vx, vz` (or `v` and `heading`) when it moves, and cars and people get out of its way. |
| `city.events`, `city.event(e)` | What happened last frame: `crash`, `wreck`, `knock`, `call` (someone phoned the police), `bang` / `shots` (people near duck, then run), and anything a game adds. Each has `at`, and `car`, `person` or `by` where it fits. |
| `city.walls()` | The building meshes, for `gs.camera`'s `walls` so the camera never goes inside one. |
| `city.solid(world, { buildings, floor, furniture, parked, cars, people, within })` | Makes the city solid in a `gs.physics3d` World3D: the buildings and kerbs, the street furniture, the parked cars, and bodies that follow the nearest traffic and people. |
| `city.occluders()` | The buildings as boxes, for skipping what's hidden behind them. The city already hands them to `v.occluders` (`occlude: false` in the options to stop that); the view also finds what is hidden from each frame's own depth, by itself. |
| `city.plan` | The whole layout as plain numbers (blocks, buildings, junctions, roads, spots). `gs.city.layout({ seed })` gives it without any 3D. |
| `city.drawMap(c, x, y, w, h, { at, range, turn })` + `city.mapPoint(p)` | A quick top-down map for your HUD, and where a point lands on it. Or draw your own from `city.plan`. |

## Traffic off its lanes

Cars keep to their lanes, but not blindly. They change lanes for the turn they want and to get past a slow
car on a two-lane road, overtake across the middle when the other way is clear, swerve round something in
the road (what you pass to `avoid()`, a crashed car, someone fallen over) when there is room and brake when
there isn't, swerve to the kerb from something coming at them, and pull over and stop for a siren from
either way. `city.cars.stats` counts all of it.

`cars.chase(car, target, { how })` takes a car off its lanes after something: `'pursue'` (stays `keep` metres
behind), `'ram'`, `'go'` (to a place), `'flee'` or `'block'` (parks across the road there, facing `face`). It
drives straight at what it can see, and along the roads when it can't, slowing for the corners it has
coming, steering round the traffic and reversing when it is stuck. `release(car)` sends it back to the
lanes. `cars.crash(car, push)` throws a car out of its lane: after `city.solid(world)` it is a real body
in the World3D that tips and spins; when it stops it either drives back into the traffic or stays as a
wreck (and its driver gets out). A car the player's World3D body hits hard crashes by itself.

## Street life

People walk, wait and cross, but also sit on park benches, stop on their phone, chat with someone they
pass, look in shop windows and go in at doors. They jump out of the way of a car coming at them, gather to
look at a crash, and phone the police about what they saw. Near the camera on a Next Gen view, a few of them
become full people (`gs.models.human` with `gs.characters.Reactions`): they look at you, and when knocked
they stagger, brace or fall as a ragdoll and get up. How many depends on the phone (one to three).

## Police and the wanted level

`gs.city.Wanted` is the police for a city:

```js
const { City, Wanted } = gs.city;
make()   { city = new City(view, { seed: 4 }); law = new Wanted(city, api); law.on('busted', () => api.over()); }
reset()  { city.reset(); law.reset(); }
update(dt) {
  city.avoid(me, 1.2); city.update(dt, me);
  law.update(dt, { x, z, heading, v, car: true, body: kart.body });  // crashes and knocks the body causes count by themselves
  if (robbed) law.crime('theft', me);                                  // 'police', 'reported' or 'unseen'
}
// law.stars (0..5), law.seen, law.search { x, z, r }, law.left (seconds to clear), law.busting (0..1), law.units
```

A crime seen by a police car or an officer counts at once. One seen only by people in the street is
phoned in a few seconds later (if the player doesn't stop them), and the police search where it
happened. Police cars come with sirens and lights from ahead of you, out of sight. They chase, ram (3 stars),
cut you off and park roadblocks across the road ahead (4 stars), and their officers get out and run at you
when you stop. Out of sight they search where they last saw you, and after a while (longer at more stars)
you are clear. Stopped close to them, you are busted.

Which tactic each car uses is a Tiny Brain (`gs.brains` `Brain` with a `Wave`: every police car a mind of
one brain), taught at first by plain rules, that learns which tactics made the chase exciting for this
player and keeps their escape rate near a half. A `Predict` learns which way this player turns at
junctions, so cut-offs and roadblocks go to the road they will take. What it learns is kept in the game's
brain slot. `brains: false` keeps to the rules alone.

## One big city: `Metro`

A city of several districts side by side, with open land and roads between them, for a game the player drives
across for minutes:

```js
const { Metro } = gs.city;
reset() {
  if (!metro) metro = new Metro(view, { seed: 7, districts: ['downtown', 'oldtown', 'suburb', 'harbour'], far: true });
  metro.prepare(player).reset(player);       // the districts round the start made now, under the loading screen
}
update(dt) { metro.avoid(player, 1.2); metro.update(dt, player); }
```

- The first district is the middle; each next one is placed beside one already there (east, west or north), as near
  the middle as it fits, with `between` metres of land between (`[120, 240]`). A harbour always goes on the south edge,
  with the sea past it. `districts: 4` picks styles for you; `{ style, blocks, seed, name }` sets one district.
- Roads join the districts: from the outer junction of one to the one of the next most nearly in line, curving across the land
  between (with its lines painted). Every district is joined to the rest.
- The land between and round the districts rises into hills (`hills`, 0..1, .5); the districts themselves stay level. A river
  runs down the gap between the first district and the next (`river: true`; that gap is made wide for it) to the sea, or to
  the land's edge. Each road's height follows the land, smoothed and held to a gradient a car climbs (7 %), and level with
  its district where it meets one: where that leaves it well over the land it is a **bridge** (a deck on piers, parapets each
  side; the river is always bridged with room under it), well under it a **tunnel** (walls, a roof, lamps, a concrete portal
  standing in a cutting at each end), and otherwise the land is cut or filled to meet it, with a level verge each side.
- A **highway** goes round the whole city (`highway: true`), two lanes each way with a barrier between, on piers 6.5 m up
  over level land and through cuttings and tunnels in the hills, with a **slip road** from an outer junction of each
  district it can reach, joining it on the district's side in the way its cars then drive. `metro.ring` is the highway,
  `metro.ramps` the slip roads.
- Cars drive the roads between, the slip roads and the highway too: out of a district, up onto the highway (easing across into
  its lane), round, off down another slip road, and into a district at the far end. They keep their lane at their own pace
  behind the car ahead and brake for what you `avoid()`; they are in `metro.cars` with the districts' own.
- `metro.ground(x, z, y)` is the road or the land between districts: under height `y` when given (under a bridge the land, in
  a tunnel the road), so a car or a person stands at the right height anywhere; `metro.roadY(x, z)` the road's height (Gps
  draws its way at it); `collide` keeps the player inside a bridge's parapets and a tunnel's walls; `solid(world)` makes the
  hills, decks, parapets, piers and tunnels solid too.
- Only the districts within `live` metres of the player (380) are real cities, each a `City` with its traffic, people,
  rooms and lamps. A district coming into range is made a step at a time, within `budget` ms a frame (3), so driving up to one
  doesn't stop the game; one well behind is let go. The others stand as their buildings in lit boxes, and with `far: true`
  the city goes on to the horizon past them all.
- The districts share one crowd of people, one ground painter and one set of lamps, so a district made late costs only its
  own streets and buildings, and every district's cars are shaped when the Metro is made.
- Each district's own blocks are let go behind the player too (`keep`, as a `City`'s).
- `metro.route(a, b)` is a driving route across districts and the roads between (as `city.route()`, with its `legs`);
  `metro.road(x, z)` the nearest lane anywhere. `collide`, `ray`, `ground`, `buildingAt`, `spot(kind, { in: 'harbour' })`,
  `cars`, `people`, `avoid`, `solid(world)`, `drawMap` and `mapPoint` work as a city's, across all of them.
- `metro.districts` lists them (`name`, `style`, `plan`, `rect`, `city` while made); `metro.city` is the made district the
  player is in, `metro.connectors` the roads between (`points`, `len`, `lanes`; `metro.lanePos(road, lane, s, back)`).
  `gs.city.metroPlan({ seed, districts })` places them without any 3D.
- A district's own traffic keeps to its streets; the cars between districts are the Metro's own.

## Finding the way: `Gps`

```js
const { Gps } = gs.city;
const gps = new Gps(city, { icon: gs.icons.icon });   // a City or a Metro
gps.to(target);                                       // where the game sends the player (a thing that moves is followed)
gps.watch(jobs);                                      // gs.missions Jobs or Mission: their markers on the maps
gps.show(view);                                       // the way on the road ahead, as glowing arrows
update(dt) { gps.update(dt, { x: car.x, z: car.y, heading: car.angle }); }
draw(c) {
  gps.mini(c, W - 96, 10, 86, 86);                    // the minimap, turning with the player
  if (gps.next) say(gps.next.turn, gps.next.in);      // 'left' | 'right' | 'arrive', in metres
  if (gps.opened) gps.map(c, 0, 0, W, H);             // the full map (gps.open() from a button)
}
down(x, y) { if (gps.opened) gps.tap(x, y); }         // a waypoint on the nearest road (tap it again to clear it)
```

- The route keeps to the driving side and is worked out again when the player is more than `off` metres (18) off it, or
  the target moves `moved` metres (25). `gps.left` is the metres to go, `gps.arrived` true within `arrive` metres (14),
  `gps.next` the next turn and how far, `gps.ahead(12)` a point along the way for an arrow over the car.
- Where it goes: the game's `to()`, else the player's waypoint, else the first `pinned` marker.
- Markers are `{ at, kind, text, icon, pinned }`. Each kind has a plain shape and colour (`target`, `waypoint`, `job`,
  `shop`, `danger`, `friend`, `home`); with `icon` and `Gps({ icon: gs.icons.icon })` the icon is drawn instead. On the
  minimap a pinned one off the map is held at its edge, in its direction.
- The full map pans with `gps.pan(dx, dy)` and zooms with `gps.zoom(f, x, y)` from your own gestures (`gs.controls.TwoFingers`).
- `gps.show(view)` draws the way 220 m ahead on the road (one mesh, made again every couple of metres driven).

## How it stays quick on a phone

- Buildings are merged into a handful of meshes for each 2 × 2 blocks, so a whole city is a few
  hundred draw calls at most, and the ones off screen are skipped.
- Blocks are built a few at a time, nearest first, in about 2.5 ms a frame; `city.warm()` builds the
  lot at once.
- Awnings, cornices, fire escapes and the dressing on the fronts (ledges, fins, balconies, shop signs, kerbs,
  corner name signs) only show within `detail` metres.
- Trees, lamps, traffic lights, benches, roof tanks and huts, air-con boxes, bins, bollards, sign posts and
  parked cars are `gs.props`: culled, and simpler far away (a parked car is whole within 12 m).
- The signs are one picture made in code (`src/kit/city-dress.js`), and the dressing has random numbers of
  its own, so a seed gives the same layout with it or without it.
- Cars live within about 190 m of the player and people within 100 m (75 m for a crowd); ones that drift further away
  come back somewhere nearer and out of sight. How many follows the phone's speed.
- Facade textures are made once and shared by every city (smaller on slower phones). Each building
  starts at a different window, so the lit windows don't repeat.
- While the card says "Loading…", the textures and the street furniture's shapes are made a few each
  frame (they are kept, so the feed keeps moving); the streets and blocks round the start are then
  made in one go, which is the longest single step of a city game's loading.
- The rooms behind the windows are one look on the facade's own material (`src/kit/city-rooms.js`, and
  `src/kit/city-gpu.js` the same as WebGPU nodes): a few dozen sums a pixel and one texture read, no
  room models; past 240 m the painted facade takes over, faded so nothing pops.
- Real cars: each style the city drives is made once and taken apart: its paint, everything else that
  doesn't glow in one material (each surface's roughness and metal read from a small table), its lamps
  and its wheel. The nearest few (about 32 m) are drawn whole, each a new object as it comes close (so
  frame generation never sees one jump); the others are copies of a simpler shape of about 1,250
  triangles, two draws a style.
- People are one `gs.props.Crowd`: a few draws for all of them, each drawn as finely as its size on
  screen needs; there are more of them, and closer round the player, than the boxes were.
- `await City.ready()` (tools and tests) waits for the far shapes' simplifier and the people's sculpts.
- Otherwise stock three.js materials, so it draws the same on WebGL and WebGPU.

## Credits

The facade colours, window sizes and lit-window numbers, and the idea of building detail round the
player, come from [Slop New York](https://github.com/mrdoob/slop-newyork) by Mr.doob (MIT). The cities
here are made up: no map data is used.
