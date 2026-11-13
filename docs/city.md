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
| `city.cars` | `list`, `near(p, r)`, `hit(p, r)` (the car you ran into), `bump(car)` (stops it for a moment). |
| `city.people` | `list`, `near(p, r)`, `hit(p, r)`, `scare(p, r)` (everyone near runs), `knock(person, dx, dz)` (a cartoon tumble; they get up and hurry off). |
| `city.avoid(p, r)` | Cars brake for this point this frame: the player, a fallen sign, a parade. |
| `city.walls()` | The building meshes, for `gs.camera`'s `walls` so the camera never goes inside one. |
| `city.solid(world)` | Makes the buildings and kerbs solid in a `gs.physics3d` World3D. |
| `city.occluders()` | The buildings as boxes, for skipping what's hidden behind them. The city already hands them to `v.occluders` (`occlude: false` in the options to stop that); the view also finds what is hidden from each frame's own depth, by itself. |
| `city.plan` | The whole layout as plain numbers (blocks, buildings, junctions, roads, spots). `gs.city.layout({ seed })` gives it without any 3D. |
| `city.drawMap(c, x, y, w, h, { at, range, turn })` + `city.mapPoint(p)` | A quick top-down map for your HUD, and where a point lands on it. Or draw your own from `city.plan`. |

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
