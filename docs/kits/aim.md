# gs.aim

Aim assist: sticky aim, pull onto targets, auto fire, in 2D or 3D.

`gs.aim.AimAssist`: sticky aim, pull onto targets, auto fire (2D angle or 3D direction).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`AimPart`, line 974), where every option and field is described.

- `AimAssist: new (o?: { cone?: number; range?: number; pull?: number; slow?: number; autoFire?: number; stickTime?: number; strength?: number }) => { strength: number; t…` (:975)

## From the maker kit

From [Aim assist](../maker-kit.md#aim-assist):

`const { AimAssist } = gs.aim;` The help phone shooters give thumbs: sticky aim, a gentle pull onto
targets and optional auto fire. You still own the gun, the shots and the crosshair.

```js
assist = new AimAssist({ cone: 12, range: 300, pull: .5, slow: .45, autoFire: .15 });
aim += assist.turn(stickX * 3 * dt);                                   // turning slows over a target
const a = assist.update(dt, gun, aim, things.all('enemy'), { sees: nav && ((x1, y1, x2, y2) => nav.sees(x1, y1, x2, y2)) });
aim = a.angle; if (a.fire) shoot();                                    // a.target, a.on, a.lock (0..1)
```

3D: pass `{ x, y, z }` for the gun and a direction vector for the aim; read `a.dir`. `{ lead: bulletSpeed }`
aims ahead of moving targets (with `vx`, `vy`). `assist.strength = 0` turns it off.

## In real games

No game uses `gs.aim` yet: the examples above are what there is.
