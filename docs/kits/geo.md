# gs.geo

Location maths: distances and bearings between places.

`gs.geo` (location maths).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`GeoPart`, line 926), where every option and field is described.

- `distance(a: LatLon, b: LatLon): number` (:926)
- `bearing(a: LatLon, b: LatLon): number` (:926)
- `offset(p: LatLon, east: number, north: number): LatLon` (:926)
- `toLocal(origin: LatLon, p: LatLon): XY` (:926)
- `cellId(p: LatLon, metres?: number): string` (:926)

## From the maker kit

From [Location](../maker-kit.md#location):

For games built from where the player is (a daily puzzle shared with everyone nearby, things that
live in this park) or played by walking about. Declare how precise you need it, then ask during play:

```js
const { cellId, distance, offset } = gs.geo;

function make(api) {
  let here = null, asked = false;
  return {
    reset() { asked = false; },
    update(dt) {
      if (!asked) { asked = true; api.location().then(p => { here = p; buildLevel(p.real ? cellId(p, 2000) : todaySeed()); }); }
      // ...
    },
  };
}
export default { id: 'park-hunt', /* ... */ location: 'coarse', make };   // 'precise' for walk-around games
```

- `api.location()` resolves (never throws, at most ~8 s) to
  `{ lat, lon, accuracy, real: true, precision }`, rounded **before your game sees it**: to 0.01°
  (about 1 km) for `'coarse'` and 0.0001° (about 10 m) for `'precise'`. `accuracy` is in metres and
  never smaller than the rounding.
- When there's no real position it resolves to the stand-in `{ lat: 0, lon: 0, real: false, reason }`
  where `reason` is `'denied'` (the player said no), `'off'` (Settings → "Let games use my location"),
  `'unavailable'` (no fix, indoors, timed out) or `'not-playing'`. **The game must play with the
  stand-in**: use a daily seed, or let the player walk the stand-in around with `offset(p, east, north)`.
- `api.watchLocation(cb)` calls `cb` at once and again each time the rounded position changes. It
  stops when the round ends, and returns `stop()` for stopping sooner. A coarse game only hears about
  moves of about 1 km.
- **Play time only.** Before the player presses Play, and after the round ends, both give the
  stand-in without asking, so the phone's permission question only appears for a game the player
  chose to play. The start screen and the How to play card tell players the game uses location.
- `npm run games` refuses a game that calls `api.location` without declaring `location`. The PR check
  flags `'precise'` (a maintainer checks it's needed) and any direct `navigator.geolocation` use.
- The declaration goes into the catalogue, and the game asks for `api.location`, so app versions
  older than this one skip location games instead of offering them.
- Location never leaves the phone and isn't saved. Don't put coordinates in `api.save()`; save a
  `cellId` if you need to remember a place.
- There are no map tiles yet: draw the area yourself (paths, a grid, a compass to a target).

`gs.geo` has the maths: `distance(a, b)` in metres, `bearing(a, b)` in degrees from north,
`offset(p, east, north)`, `toLocal(origin, p)` → `{ x, y }` metres for drawing, and `cellId(p, metres)`,
a whole number that is the same for everyone in the same square (to seed "what spawns here today").

Test: `npm run location-test` checks the rounding, the play-time rule and the stand-ins in the real
app with a fake GPS position.

## In real games

1 game uses it (`node scripts/examples.mjs gs.geo` lists them). The shortest:

`src/games/treasure-drop.js` (Treasure Drop, AR · Explore · Local, 180 lines):

```js
const { ARView, arNote, FLOOR } = gs.ar;
const { distance, bearing, offset } = gs.geo;
// …
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
// …
      const h = hash(today() + ':' + Math.round(loc.lat * 100) + ':' + Math.round(loc.lon * 100)), ang = (h % 3600) / 10 * Math.PI / 180, d = 100 + (h
      const c = offset(loc, Math.sin(ang) * d, Math.cos(ang) * d); save = { ...save, day: today(), lat: c.lat, lon: c.lon, opened: false }; api.save(s
// …
    if (save.opened) { state = 'done-today'; return; }
    chestAt = { lat: save.lat, lon: save.lon }; dist = distance(me, chestAt); lastDist = dist; startDist = dist; accuracy = loc.accuracy || 15;
// …
    stopWatch = api.watchLocation(p => {
      if (!p.real || state !== 'hunt') return; me = p; accuracy = p.accuracy || accuracy; const d = distance(me, chestAt);
// …
  }
  const yesterday = () => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
// …
      const cd = compass(); beam.visible = cd != null;
      if (cd != null) { const rel = ((bearing(me, chestAt) - cd + 540) % 360 - 180) * Math.PI / 180, yaw = v.heading() - rel, e = v.eyePos, far = clam
// …
    if (state === 'locked' || state === 'drop') v.pointers(c, W, H, [{ p: chestPos, col: '#ffd040' }]);
    c.save(); c.textBaseline = 'middle'; c.textAlign = 'center';
```
