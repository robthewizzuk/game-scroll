# Console games: 3D cel-shaded look

Console games (`era: 'console'`) are drawn in real-time 3D with three.js, cel-shaded with ink
outlines. Pocket games stay flat pixel art. If a game can't reach the 3D bar, move it to Pocket
(`era: 'advance'` or `'color'`) instead of shipping a flat Console game.

The kit is `src/kit/toon3d.js`; toy-brick helpers are `brick3d` / `stud3d` in `src/kit/bricks.js`.

## How it works

- One shared renderer draws every Console game, then copies the frame into the slide's 2D canvas:
  WebGPU where the phone has it, WebGL everywhere else (phones only allow a few WebGL contexts, so
  games never make their own). Both draw the same picture; a view holding a material with its own
  shader stays on WebGL by itself.
- Toon shading: `MeshToonMaterial` with a 3-band ramp (shadow, mid, lit).
- Real shadows: the sun casts them. Every lit, solid thing casts one and every lit thing takes
  them, folded into the ramp (a shadow is the ramp's dark band with one clean edge, never a grey
  smear). In a board view the bare background takes them too. Low-end phones draw `blob()` discs
  in their place, as before.
- A rim of light: a thin bright line along the edges that face the sun.
- Ink lines: a second pass renders normals + depth, and a full-screen pass inks depth jumps
  (silhouettes) and sharp turns (creases). Unlit / see-through things and parts made with
  `line: false` get no ink.
- Resolution adapts: frames slower than ~45 fps render fewer pixels (down to half).
- HUD, text and touch handling stay in the game's 2D code, drawn on top after `v.render(c)`.

## Writing a Console game

```js
import gs from '../gamescroll.js';
const { View, G, part, grp, blob } = gs.toon;

let v3;
function view3d() {
  if (!v3) {
    v3 = new View({ bg: '#5cb84c', sun: [-.6, 1, .4] });
    v3.def('hero', () => grp(part(G.pill, '#3060c0', { sx: 6, sy: 5, sz: 5, y: 6 }), part(G.ball, '#f8c890', { s: 3, y: 12 }), blob(5)));
  }
  v3.board(W, H, .8);          // or v3.side(W, H, fov, eyeX, eyeY) or v3.persp(W, H, fov)
  return v3;
}
// in draw(c):
const v = view3d(); v.frame();
v.put('hero', v.at(pl.x, pl.y), { ry: Math.PI / 2 - pl.a });
v.render(c, W, H);
// ...then 2D HUD on top
```

Cameras:

- `board(W, H, elev)`: tilted top-down, orthographic. Floor point (x, y) is drawn exactly at
  screen (x, y), so taps need no conversion. Use `v.at(x, y, height)` for positions.
- `board(W, H, elev, fov, zoom)`: same but real perspective (strongest 3D). Convert taps with
  `v.pick(x, y)` and place labels with `v.over(x, y, height)`.
- `side(W, H, fov, ex, ey)`: side-on. Point (x, y) on the z = 0 plane maps exactly to the screen;
  `ey > 0` looks down on the scene. Use `v.sv(x, y, z)`.
- `persp(W, H, fov)`: free camera you move yourself (runners, first person).

`v.put(kind, pos, opts)` draws a pooled copy of a prefab registered with `v.def(kind, make)`, so
games keep their plain arrays of objects. `v.fan(points, colour, alpha)` draws see-through floor
polygons (view cones, beams).

## Shadows, the rim and retro looks

Nothing to set up: shadows and the rim are on in every view. What a game can choose, in
`new View({ ... })`:

| Option | What it does |
| --- | --- |
| `shadows: false` | No real shadows; `blob()` discs show instead. |
| `rim: 0..1` | How bright the rim of light is (default `.35`; `0` for none). |
| `floor: false` | A board view whose bare background isn't ground (a drop, the sky): no shadows land on it. |
| `retro: 'chunky'` | 240 lines with hard pixels, corners that snap to the pixel grid (the wobble of early 3D) and 32 shades a colour with a dither pattern. |
| `retro: 'soft'` | 240 lines scaled up smoothly. |
| `retro: 'tube'` | The soft look with scanlines, like an old TV. |
| `retro: { lines, smooth, snap, bits, scan }` | Your own mix: rows up the picture, smooth or hard scaling, snapping corners, `2^bits` shades a colour, how dark the scanlines are (0..1). |

Keep using `blob()`:

- **In a prefab** (`grp(part(...), blob(5))`): the thing's real shadow takes the disc's place, and
  the disc comes back on phones without real shadows.
- **Put on its own** (`v.put('blob', v.at(x, y))` under a ball in the air): it stays, as the mark of
  where the ball will land, and goes while something stands on it.

A free camera's shadow reaches as far as the fog (or 60 units); set `v.shadowReach` for another
distance. A part that should cast nothing: `mesh.userData.gsNoShadow = true`.

## Jointed characters

`gs.toon.figure({ h, body, skin, legs, shoes, hair, eyes })` is a chunky cel-shaded person with
joints (hips, spine, head, arms, forearms, legs, shins) and the `gs.poses` rig, so it walks, runs,
waves and aims without any animation written by hand. Make it 24 units tall or more, so the ink
lines leave its colours showing.

```js
v3.def('hero', () => figure({ h: 30, body: '#c8483c' }));
// in update(dt): step = dt;   (the rig moves by the time since the last frame)
// in draw(c): each copy has a rig of its own
const hero = v.put('hero', v.at(pl.x, pl.y), { ry: pl.a });
hero.rig.play(pl.moving ? 'walk' : 'idle'); hero.rig.update(step, { speed: pl.speed }); step = 0;
```

`dude()` is still the quickest character (a pill and a head); `figure()` is for games where the
character's movement is the point.
