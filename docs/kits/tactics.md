# gs.tactics

Cover (2D and 3D), squads that use it, taking cover, routes.

`gs.tactics` (`CoverMap`, `Squad`, `Route`; `Cover3D`: cover found from the World3D with rays, which a Squad uses in 3D; `TakeCover`: the hero snaps to it, slides, peeks, pops up, fires blind, runs to the next)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`TacticsPart`, line 3634), where every option and field is described.

- `CoverMap: new (cols: number, rows: number, blocked: (c: number, r: number) => boolean, o?: { size?: number; x0?: number; y0?: number; low?: (c: number, r: number) => b…` (:3635)
- `Squad: new (members: Loose[], o?: { /** A CoverMap. Left out: the one the game made before the squad; false: none. */ cover?: Loose | false; link?: boolean; sees?: (m:…` (:3642)
- `Route: new (points: P3[], o?: { leash?: number; reach?: number }) => On<Loose> & { points: P3[]; i: number; readonly point: P3; readonly done: boolean; update(dt: numb…` (:3652)
- `Cover3D: new (o?: { world?: Loose | false; space?: number; radius?: number; crouch?: number; low?: number; cell?: number; floors?: number; ms?: number; top?: number; l…` Cover in 3D found from the game's World3D with rays (walls, low walls, cars, crates, buildings: whatever is solid). (:3659)
- `TakeCover: new (cover: Loose, o?: { speed?: number; run?: number; peek?: number; dash?: boolean; pull?: number }) => { state: 'out' | 'moving' | 'in' | 'peek' | 'blind…` The hero in cover: take(feet, facing) snaps to the nearest wall, then update(dt, input, feet) each frame slides along it, stops at its ends, leans out round them or pops up over it while aiming, fires blind, runs to… (:3689)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Cover and squads** (`gs.tactics`): `CoverMap(cols, rows, blocked)` finds every spot beside a wall and
which way it faces; `find(from, threat)` picks cover that blocks a threat (or flanks it), `peek()`
says where to lean out. `Squad(members, { cover, sees })` gives each enemy an order each think
(`move`, `shoot`, `throw`, `hold`) with roles: some pin you down while others move up or flank, a
grenade flushes you out of cover you've camped in, the hurt fall back, and they call out
(`on('call')`: contact, reloading, man down) for your barks. `Route(points)` is an ally who leads
and waits for you. A squad can be coached (`coach: true`, then `squad.correct(member, 'flank')` and
`squad.avoid(member)`), and `cover.avoid(spot)` is "not that cover":
[A coach for things that decide by rules](#a-coach-for-things-that-decide-by-rules).

**Cover in 3D** (`gs.tactics`): `Cover3D()` finds cover in the game's `World3D` with rays, so whatever is solid
there is cover: walls, low walls, cars, crates, a City's buildings, a level made with `world.ground(mesh)`. Each spot
knows which way it faces, how high it is (`low`: shoot over it, with its `top`; high: lean out round it) and how far
its ends are (`left`, `right`, as you face out). `cover.update(hero.feet)` looks over the squares round the hero a
little each frame (`around(p, r)` all at once, while loading; `touch(p)` after something there broke). It has the
2D `CoverMap`'s `find`, `peek`, `protects`, `avoid`, so `new Squad(enemies)` hands the same spots out (positions
`{ x, y, z }`, y up) with real line of sight (`cover.sees(a, b)`: eyes to chest). `TakeCover(cover)` is the hero:
`hide.take(hero.feet, heroYaw)` snaps to the nearest wall; each frame `hide.update(dt, { move, aim, blind, threat },
hero.feet)` slides along it, stops at its ends, leans out round an end or stands up over low cover while aiming,
fires blind (`hide.spread` widens the aim), runs to the next cover when the stick keeps pushing at an end, and leaves
when the stick pulls away from the wall. Then `hero.walk(hide.walk.x, hide.walk.z)`, `heroYaw = hide.facing`,
`rig.play(hide.pose)`, `rig.upper(hide.upper)`, shots from `hide.muzzle`; `hide.exposed` (0..1) is how much of the hero
shows, for enemies' aim.

## In real games

1 game uses it (`node scripts/examples.mjs gs.tactics` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Gun, Health, Explosives } = gs.combat;
const { CoverMap, Squad } = gs.tactics;
// …
  }
  WD.cover = new CoverMap(GC, GR, coverAt, { size: CELL, x0: GX0, y0: GZ0, low: (c, r) => WD.lowCells.has(c + ',' + r) });
// …
    s.alert = true; s.sus = 1; s.alertT = 0; s.shoutT = t; if (!squad.members.includes(s)) squad.members.push(s);
    if (!squad.alerted) { squad.alerted = true; squad.call(s, 'contact'); }
// …
    for (const o of men) if (o !== s && !o.ko && Math.hypot(o.x - s.x, o.y - s.y) < 16) { o.shaken = Math.max(o.shaken || 0, .75); if (Math.hypot(o.x 
    squad.hurt(s); squad.cover.free(s);
// …
    // he'd have shown himself here, but men fell doing that in spots like this one: he says so (now and then) and does something else
    if (a !== 'peek' && squad.t - (squad.waryAt ?? -99) > 25) { const r = s.mind.recalled; if (r && r.not && r.action === 'peek' && r.like > .4) { squ
// …
    if ((a === 'rush' || a === 'flank') && nest && !move && d < 40 && squad.grenades > 0 && squad.t - squad.lastGrenade > 9) {
      squad.grenades--; squad.lastGrenade = squad.t; s.order = { do: 'throw', at }; s.plan = 'grenade'; squad.call(s, 'grenade'); return;
// …
      if (d < 30) { s.order = { do: 'shoot', at, spot: null, from: null }; return; }   // close enough: fight from here
      squad.order(s, 'advance', tgt, { band: [2 * C, Math.max(3 * C, d - 3 * C)], near: 14 * C });
// …
      if (!s.order.spot) { const k = clamp(Math.min(40, d - 24) / d, 0, 1); s.order.to = { x: s.x + (tgt.x - s.x) * k, y: s.y + (tgt.y - s.y) * k }; }
      squad.call(s, 'moving');
```
