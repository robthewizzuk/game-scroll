# gs.sky

Time of day, and weather that changes the world: rain, puddles, snow that settles, storms.

`gs.sky` (`Sky` time of day, `Weather` rain/snow/storm; `new Weather(view, { level: world, ground: land.height })` changes the world too: rain and snow stop at roofs, the open ground gets wet and puddled and dries, snow settles and melts, floors indoors stay dry, water runs down walls and glass, drops land on the lens (`view.drops`); `watch(car)` throws spray off its tyres; `wetAt(p)`, `snowAt(p)`, `open(p)`).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`SkyPart`, line 3391), where every option and field is described.

- `DAY: [number, { top: string; horizon: string; sun: string; sunI: number; amb: number }][]` (:3392)
- `Sky: new (view: Loose, o?: { time?: number; speed?: number; day?: SkyPart['DAY']; stars?: number; /** Colours from light scattering in air (Preetham; on WebGPU Hillair…` (:3393)
- `Weather: new (view: Loose, o?: WeatherOptions) => WeatherPart` Rain, snow or a storm round the camera. (:3405)
  - `kind: string` (:3428)
  - `amount: number` (:3428)
  - `wind: [number, number]` (:3428)
  - `onFlash: ((far: number) => void) | null` (:3428)
  - `readonly flashing: boolean` (:3428)
  - `wet: number` How wet the open world is, how far the puddles have spread and how much snow has settled, each 0..1 (with a level). (:3430)
  - `pools: number` (:3430)
  - `snow: number` (:3430)
  - `readonly rain: number` How hard it is raining and snowing now, 0..1. (:3431)
  - `readonly snowing: number` (:3431)
  - `readonly cover: SkyCover | null` The map of what the sky can see (with a level): cover.at(x, z) is the height of the highest solid thing over a spot. (:3432)
  - `set(kind: 'rain' | 'snow' | 'storm' | 'clear', amount?: number): WeatherPart` (:3433)
  - `flash(): WeatherPart` (:3433)
  - `update(dt: number): WeatherPart` (:3433)
  - `dispose(): void` (:3433)
  - `open(p: Fx3dPos): boolean` Can the sky see this point (is nothing over it)? (:3434)
  - `wetAt(p: Fx3dPos): number` How wet a spot is now, 0..1: 0 under a roof (slippery floors, footsteps that splash, a dog that shakes itself indoors). (:3435)
  - `snowAt(p: Fx3dPos): number` How deep the snow lies at a spot, in metres: 0 under a roof (footprints, slower walking). (:3436)
  - `watch<T>(thing: T, o?: { amount?: number; height?: number; wheels?: number[][] }): T` From now on this vehicle throws spray off its tyres while the road under it is wet (Next Gen): a mist that hangs behind it and drops flung off the tread, from about 4 m/s and all of it by 25. (:3443)
  - `unwatch(thing: Loose): WeatherPart` Stops watching a vehicle. (:3444)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Sky and weather** (`gs.sky`): `Sky(view, { time, speed })` moves the sun through the day, colours
the sky, sun, fill light and fog, and brings out stars (`physical: true` uses three.js's physical
sky for Next Gen). `clouds: 0..1` adds drifting clouds lit by the sun, and on Next Gen `env: true`
lights the scene's reflections from the sky; with `v.air()` their shadows cross the ground (see
[nextgen-3d.md](nextgen-3d.md#outdoor-worlds-sun-air-sky-and-grade)). `Weather(view, { kind: 'rain' | 'snow' | 'storm' })` falls around the camera;
storms flash lightning, and `onFlash(far)` is your cue for thunder. In AR the camera feed is the sky,
so use `Weather` alone. Given the level (`Weather(view, { level: world })`) it changes the world too: rain and
snow stop at roofs, the open ground gets wet and puddled and dries again, and snow settles and melts: see
[Weather that changes the world](#weather-that-changes-the-world).

From [Car radio](../maker-kit.md#car-radio):

- **Breaks**: the DJ names the song that just played and the next one, sometimes says the weather (a `gs.sky`
  Weather made in the same game is found by itself) and the time of day (from a Sky), reads an advert or a bit of
  local news, over a soft bed of the next song's chords. A break lasts as long as the DJ takes.

From [The real world: sun, moon, battery, headphones](../maker-kit.md#the-real-world-sun-moon-battery-headphones):

- `sun(place)`: `up`, `height` (degrees above the horizon), `compass` (degrees clockwise from north,
  like `gs.device.heading()`), `light` (0 at night to 1 in full day, smooth through dawn and dusk),
  `part` (`'night'`, `'dawn'`, `'day'`, `'dusk'`), `rise`, `set` and `noon` (hours on the phone's clock;
  null where the sun doesn't rise or set today) and `hour`, the hour to give `gs.sky`'s `Sky` so its sky
  matches the real one (6 at sunrise, 12 at the sun's highest, 18 at sunset).

From [The open sea and its shore](../maker-kit.md#the-open-sea-and-its-shore):

- **Colour by depth.** `deep` and `shallow` colours, and `clear` (3: metres of water that hide the
  bottom). The water lets more through the steeper you look down into it, and reflects the sky at low
  angles: light it with a `gs.sky.Sky` (`env: true`) and a sun, or it mirrors the studio lamps the view
  starts with. On WebGPU's high and ultra tiers, what is under the water is seen through it, bent by the
  waves and tinted with depth, with light playing on the bottom (caustics).

From [Weather that changes the world](../maker-kit.md#weather-that-changes-the-world):

`const { Weather } = gs.sky;` (3D; the look is Next Gen.) Tell the weather what stands in it and the rain
and snow no longer fall through roofs, and the world answers to them:

```js
make():   weather = new Weather(view, { kind: 'rain', level: world, ground: (x, z) => land.height(x, z), water: sea });
reset() { weather.set('clear'); weather.wet = weather.pools = weather.snow = 0; }
update(dt) {
  weather.update(dt);                                   // after the camera has moved
  if (weather.wetAt(player.pos) > .5) grip = .7;         // wet underfoot (0 indoors and under a roof)
  speed *= 1 - weather.snowAt(player.pos) * 1.5;         // metres of snow lying here (0 under a roof)
}
weather.set('snow');                                    // it starts to settle; 'rain' washes it away again
```

- `level` is what keeps the weather off: a `gs.physics3d` `World3D`, a `City`, `Voxels`, a function
  `(from, dir, max) => metres to the first solid thing`, three.js meshes or groups (their triangles are
  asked one by one, so keep those to a few simple shapes: a physics world is much quicker), or a list of
  these. `ground: (x, z) => height` is for land that is not in the level. `level: true` says there are no
  roofs: everything is out in it.
- From these the weather keeps a **map of what the sky can see**: for every half metre within 32 m of the
  camera, the height of the highest solid thing. It fills from the camera outwards a few hundred spots a
  frame (a second or so after a jump), follows the camera, and looks everything over again every six
  seconds, so a roof that is blown off lets the rain in. `weather.cover.touch(x, z, r)` asks again round
  a spot at once. Beyond the map everything counts as open.
- **What you see** (a Next Gen view; the weather turns the view's `air()` on if it is off). In rain each
  drop is a streak turned to the camera and about two of the 3D's pixels wide wherever it falls (so a storm
  still shows on a phone's sharp screen, drawn smaller and filled in by the upscaler); the drops stop at the first thing they meet, little drops hop off the ground round the camera, and
  everything the sky can see gets darker and shinier over `soak` seconds (20). Then puddles open on flat
  ground and spread (they take twice as long), and when the rain stops it all dries over `dry` seconds
  (90), the puddles last. In snow the flakes stop at roofs too, and snow settles over `settle` seconds
  (40): first in patches on flat tops, then over everything that is not too steep (ground, roofs, crates,
  the tops of walls, the leaves that face up). When the snow stops it melts over `melt` seconds (150),
  leaving the ground wet; rain washes it away six times as fast. `melt: Infinity` keeps it lying. Floors
  indoors, porches, the ground under a bridge or a lean-to and the foot of a wall under its eaves stay
  dry, with a soft edge.
- **What you can ask**: `weather.wet`, `weather.pools` and `weather.snow` (each 0..1; set them to start a
  round after rain or in deep snow), `weather.rain` and `weather.snowing` (how hard, now), `open(p)` (can
  the sky see this point), `wetAt(p)` (how wet a spot is, 0 under a roof), `snowAt(p)` (metres of snow
  lying there; `deep`, .25, when it has all settled) and `weather.cover.at(x, z)` (the height of the
  highest thing over a spot). Slipping, slower steps, footprints, splashing footsteps, the sound of rain
  on a roof overhead and who comes in out of the rain are yours, from these.
- **Water that runs**: in the rain, steep walls and windows get rivulets running down them, and glass, car
  paint (a clearcoat) and other smooth things get beads that sit on them; the smoother the surface, the
  more it shows (on rough brick it is a faint sheen). Puddles get rings where the drops land. All of it is in
  the same wet look, with no extra pass, on WebGL and WebGPU, and only where the sky can see.
- **Rain on the lens** (`lens: true`, the default): while it rains and the camera looks out under the open
  sky, drops land on the view's lens, more when it faces up or into the wind. Each bends what is behind it,
  and the big ones run down before they dry. It is drawn in the final pass (16 drops at most). `lens: false`
  keeps the lens dry; `view.drops.add(x, y, r)` is a splash of your own (from a wave, a puddle a car drove
  through), `view.drops.clear()` wipes it.
- **Spray off tyres**: `weather.watch(car)` (a `gs.models.vehicle`, a `World3D.vehicle()` made with its wheel
  meshes, or any moving `Object3D` with `wheels: [[x, z], ...]`) throws a mist that hangs in the air behind
  it and drops flung off the tread while the road is wet, from about 4 m/s and all of it by 25; the back
  wheels throw most. Under a roof higher than the car (a tunnel, a bridge) the road stays dry. `amount`
  sets how much, `weather.unwatch(car)` stops it.
- `water` (one `gs.outdoors.Water`, or a list): the rain falls on it too (it sets `water.rain`), and its
  drops hop off the water's surface.
- Nothing settles on water, on people and animals (skinned meshes), or on anything whose mesh or material
  has `userData.noSettle = true` (a car that drives about); they still get wet. Your own `ShaderMaterial`s
  and materials with `fog: false` are left alone, as with the air.
- Make it with the level, in `make()`, before the first frame is drawn: the look is added to each
  material as it is first drawn, on WebGL and WebGPU alike, and costs no extra pass (three small texture
  reads a pixel). On WebGPU a material that was drawn before there was such a weather keeps its plain wet
  look, with no puddles or snow; and a game with no such weather pays nothing for it. Measured on a
  desktop, `weather.update()` is .15 ms a frame in rain with the map kept up (not yet measured on a
  phone). `cover: { cells: 64 }` is a smaller map (16 m round the camera), `hops: 0` leaves the hopping
  drops out.
- With no `level` the weather is what it always was: it only falls, and `open()` is always true.
- Not there: snow has no depth of its own (it is a look; `snowAt()` is the depth, and
  [`gs.outdoors.Marks`](#ground-that-takes-marks) presses prints into it),
  puddles do not seek out the hollows of the land (they lie on flat ground where the map of them says),
  water runs down walls only as a look (it does not drip off eaves or gather at a wall's foot), and nothing
  piles up on things that move.

More in docs/maker-kit.md: "Ground that takes marks", "Towns that live".

## In real games

2 games use it (`node scripts/examples.mjs gs.sky` lists them). The shortest:

`src/games/parcel-dash.js` (Parcel Dash, Next Gen · Driving, 199 lines):

```js
const { City, Gps } = gs.city;
const { Sky } = gs.sky;
// …
  v.air({ haze: .0016, colour: '#9aa6bc' });
  sky = new Sky(v, { time: 17.9, speed: 0, stars: 200, sun: light, physical: true, fog: true });
// …
      city.avoid(p, 1.4);
      city.update(dt, p); sky.update(dt);
```

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Regions } = gs.regions;
const { Sky, Weather } = gs.sky;
// …
      // (one sky and one weather for the world, which every card of this game shares: a second card used to add its own dome)
      if (!WD.sky) { WD.sky = new Sky(WD.v, { time: MOODS.m1.time, tilt: MOODS.m1.tilt, stars: 300, sun: WD.sl, day: DAY_CLEAR, clouds: MOODS.m1.cloud
```
