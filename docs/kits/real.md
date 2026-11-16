# gs.real

Real-world signals with no permission: the sun, the moon, the battery, headphones.

`gs.real` (real-world signals, no permission): `sun(place?)` (`up`, `height`, `compass`, `light` 0..1, `part`, `rise`/`set`, `hour` for gs.sky), `moon(place?)` (`phase`, `lit`, `name`), `battery()` (`level`, `charging`, `saver`), `headphones()`; null where the phone won't say, and never the only way to win.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`RealPart`, line 906), where every option and field is described.

- `sun(place?: { lat: number; lon: number } | null, when?: Date | number): { /** Above the horizon. */ up: boolean; /** Degrees above the horizon (negative below it). */ …` The sun where the player is. (:911)
- `moon(place?: { lat: number; lon: number } | null, when?: Date | number): { /** 0 new, .25 first quarter, .5 full, .75 last quarter. */ phase: number; /** How much of i…` The moon where the player is (the phase is the same everywhere). (:922)
- `battery(): { level: number | null; charging: boolean | null; saver: boolean }` The phone's battery: level 0 to 1 and charging (both null where the phone won't say), and whether power saving is on. (:930)
- `headphones(): boolean | null` Is the sound going to headphones (wired, USB or Bluetooth)? (:932)

## From the maker kit

From [The real world: sun, moon, battery, headphones](../maker-kit.md#the-real-world-sun-moon-battery-headphones):

`gs.real` turns things about the player's real surroundings into game inputs. All of it is worked out
on the phone (the sun and moon with SunCalc's maths), nothing is sent anywhere, and none of it asks for
a permission.

```js
const { sun, moon, battery, headphones } = gs.real;

reset() { const s = sun(); night = !s.up; stars = 1 - s.light; }      // dark outside? the level starts at night
update(dt) { if (battery().charging) hero.energy += dt; }             // plug the phone in to charge the hero
draw(c) { if (moon().name === 'full') drawWerewolf(c); }
```

- `sun(place)`: `up`, `height` (degrees above the horizon), `compass` (degrees clockwise from north,
  like `gs.device.heading()`), `light` (0 at night to 1 in full day, smooth through dawn and dusk),
  `part` (`'night'`, `'dawn'`, `'day'`, `'dusk'`), `rise`, `set` and `noon` (hours on the phone's clock;
  null where the sun doesn't rise or set today) and `hour`, the hour to give `gs.sky`'s `Sky` so its sky
  matches the real one (6 at sunrise, 12 at the sun's highest, 18 at sunset).
- `moon(place)`: `phase` (0 new, .25 first quarter, .5 full, .75 last quarter), `lit` (0 to 1), `waxing`,
  `name` (`'new'`, `'waxing crescent'`, `'first quarter'`, `'waxing gibbous'`, `'full'`, `'waning gibbous'`,
  `'last quarter'`, `'waning crescent'`), and `up`, `height`, `compass`.
- `battery()`: `level` (0 to 1) and `charging`, both null where the phone won't say (iPhones in a
  browser), and `saver` (the phone's power saving mode is on). Read about every 15 seconds.
- `headphones()`: true, false, or null when the phone won't say (most browsers, and the first moment
  after a game first asks). Wired, USB and Bluetooth all count; a Bluetooth speaker can't be told from
  Bluetooth headphones.

`place` is a `{ lat, lon }` from `api.location()` ([Location](#location)). Without one, `sun()` and
`moon()` guess where the player is from the phone's clock and time zone: right about day and night,
rough about the exact angle, and the result says `guess: true`. The moon's phase is the same everywhere.
Pass a second argument (a `Date` or a time in ms) to ask about another moment: tonight, or next full moon.

Keep these for flavour and for play that is as fair at night as by day. A game that can only be won at
noon, on a full battery or with headphones in isn't quick or fair, so never make one the only way to win.

## In real games

No game uses `gs.real` yet: the examples above are what there is.
