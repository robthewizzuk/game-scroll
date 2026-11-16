# gs.stealth

Stealth: how lit a spot is, takedowns, bodies, floors that make noise, disguises.

`gs.stealth` (`lightAt`, `Takedown`, `Bodies`, `Floors`, `Disguise`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`StealthPart`, line 3840), where every option and field is described.

- `lightAt(p: Pt2, lights: { x: number; y: number; r?: number; i?: number; cone?: number; dir?: number }[], o?: { ambient?: number; sees?: (light: Pt2, p: Pt2) => boolean…` (:3841)
- `Takedown: { check<T>(player: Pt2, guards: T[], o?: { reach?: number; behind?: number; moods?: string[] }): T | null; front(player: Pt2, g: Loose, o?: { reach?: number …` (:3842)
- `Bodies: new (o?: { range?: number }) => On<Loose> & { list: Loose[]; add(x: number, y: number, who?: Loose): Loose; carry(b: Loose): Loose; drop(b: Loose, x: number, y…` (:3843)
- `Floors: new (kinds?: Record<string, number>, at?: (p: Pt2) => string | null, o?: { walk?: number; run?: number }) => { noise(p: Pt2, speed: number, o?: { sneak?: numbe…` (:3844)
- `Disguise: new (o?: { fools?: Record<string, string[]>; close?: number }) => { wearing: string | null; wear(kind: string): Loose; off(): Loose; blow(seconds?: number): …` (:3845)

## From the maker kit

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**Stealth extras** (`gs.stealth`, on top of `gs.senses`): `lightAt(p, lamps)` is a light meter (walls
cast shadows) to feed the guards' eyes, `Takedown.check()` finds a guard you're behind, `Bodies` get
found and raise the alarm unless you hide them, `Floors` make gravel loud and carpet quiet, and
`Disguise` lets you walk past some guards until you do something odd.

## In real games

1 game uses it (`node scripts/examples.mjs gs.stealth` lists them). The shortest:

`src/games/long-shadow.js` (Long Shadow, village, 4148 lines):

```js
const { Senses, Noises } = gs.senses;
const { Bodies } = gs.stealth;
// …
  const me = new Health({ max: 100, regen: 14, delay: 4 });
  const bodies = new Bodies({ range: 22 });
// …
  const shapeOf = mesh => { if (mesh.userData.shapeOf) return mesh.userData.shapeOf; mesh.updateMatrixWorld(true); const inv = mesh.matrixWorld.clone(
  bodies.on('found', (b, g) => { g.sus = 1; heat = Math.min(1.2, heat + .12); });
// …
    squad.hurt(s); squad.cover.free(s);
    bodies.add(s.x, s.y, s);
// …
    spread(men, dt); if (allies) spread(allies, dt);
    bodies.update(dt, men.filter(s => !s.ko && !s.fixed));
```
