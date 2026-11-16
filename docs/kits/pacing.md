# gs.pacing

Spawners, waves, a director that eases off, difficulty ramps.

`gs.pacing`: `Spawner({ every, fastest, over })`, `Waves([...], { breather })`, `Director` (difficulty that eases off), `ramp`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`PacingPart`, line 959), where every option and field is described.

- `ramp(t: number, from: number, to: number, seconds: number, ease?: (k: number) => number): number` (:960)
- `Spawner: new (o?: { every?: number; fastest?: number; over?: number; jitter?: number; first?: number; max?: number; rnd?: () => number }) => { readonly gap: number; co…` (:961)
- `Waves: new (waves: Loose[], o?: { breather?: number; loop?: boolean; first?: number }) => { readonly wave: Loose; readonly number: number; readonly left: number; state…` (:962)
- `Director: new (o?: { over?: number; start?: number; max?: number; ease?: number; calmFor?: number; /** A gs.brains.Dial (or 0..1): it climbs sooner for a player who us…` (:963)

## From the maker kit

From [Spawning and pacing](../maker-kit.md#spawning-and-pacing):

`const { Spawner, Waves, Director, ramp } = gs.pacing;` When things appear and how hard it gets.
The kit says when; your game makes the thing.

```js
spawner = new Spawner({ every: 1.2, fastest: .35, over: 60, jitter: .25 });   // speeds up over a minute
spawner.update(dt, () => things.add(makeBat(), 'enemy'));

waves = new Waves([{ count: 6, every: .7, kind: 'bat' }, { count: 1, kind: 'boss' }], { breather: 3, loop: true });
waves.update(dt, kind => spawn(kind), things.count('enemy'));   // next wave once this one is beaten
// waves.number, waves.state ('spawning' | 'fighting' | 'breather' | 'done'), waves.breatherLeft

director = new Director({ over: 90 });      // difficulty 0..1 that eases off when the player is struggling
// new Director({ over: 90, dial }): with a gs.brains.Dial it also remembers the player between rounds
director.hurt(1); director.scored(1); director.update(dt); gap = director.pick(1.4, .4);
```

## In real games

No game uses `gs.pacing` yet: the examples above are what there is.
