# Next Gen · Console games: modern HD 3D

Next Gen Console games (`era: 'nextgen'`) aim for the look of current home consoles. They sit next
to the Classic Console games (`era: 'console'`, cel-shaded, see [console-3d.md](console-3d.md)) and
must look clearly a generation ahead of them. Stylised and cartoony characters are fine; the
rendering is what makes it Next Gen.

The kit is `src/kit/hd3d.js`. Games built on it: `bunker-breakout.js` (corridor shooter),
`suit-ops.js` (top-down jungle twin-stick) and `gravity-grip.js` (tube racer that drives on walls and
ceilings).

## What the kit gives you

- **Physically based materials** (`pbr(colour, { rough, metal, glow, clear, tex })`): roughness,
  metalness, clearcoat, sheen and emissive glow, lit by real-time lights and image-based
  reflections (a studio environment map, strength set per view with `env`).
- **Procedural surface textures** (`surface(size, paint)`): you paint colour, height and
  roughness on canvases in code, and the kit derives a normal map from the height. No image files.
  `speckle()` adds grime and noise.
- **Bevelled boxes** (`rbox(w, h, d, r)`): rounded edges catch highlights, which reads as
  "modern" far more than sharp boxes.
- **Real-time shadows** (`spot(...)`): a shadow-casting spotlight whose shadow map size follows
  the quality tier. Mark meshes `castShadow` / `receiveShadow`.
- **Sun** (`sun(colour, intensity, size)`): a shadowed directional light for outdoor scenes. Call
  `s.follow(x, y, z)` each frame so the shadow box tracks the player (it snaps to shadow texels, so
  shadows do not shimmer) and `v.onTier(T => s.setTier(T))`.
- **Lamp light pool** (`v.lampLights(range)` then `v.placeLamps(spots, x, y, z, t)` each frame):
  a level can have dozens of lamps; the nearest few get real point lights (with flicker) and the
  rest only glow. Light count stays fixed, so shaders never recompile mid-game.
- **Post-processing**, one shared chain: HDR render with MSAA (or a light FXAA on lower tiers), ground-truth ambient occlusion
  (GTAO), bloom (anything brighter than about 1 glows: emissive above 1, particle colours above
  1), ACES filmic tone mapping, and a colour grade (vignette, film grain, slight lens fringing at
  the edges, and a red "hurt" tint you set with `v.hurt = 0..1`).
- **Particles** (`new Particles(v, { max, additive })`): soft camera-facing points. Additive for
  sparks, fire, glints; normal for smoke and dust. `p.emit({ x, y, z, vx, vy, vz, life, size,
  grow, col, a, drag, grav, floor, fadeIn })`, then `p.update(dt)` every frame.

## Performance and adaptive quality

Phones must stay smooth, so the kit adapts on its own:

| Tier | Pixels per frame | Shadows | Real lamp lights | AO | Anti-aliasing |
| --- | --- | --- | --- | --- | --- |
| ultra | 2.0 M | 1024 | 4 | yes | 2x MSAA |
| high | 1.3 M | 1024 | 4 | no | 2x MSAA |
| medium | 0.85 M | 512 | 3 | no | light FXAA |
| low | 0.5 M | off | 2 | no | light FXAA |

**Phone class and frame rate** (`src/kit/speed.js`). Each phone is sorted into top, mid or low from
its graphics chip (Adreno 830, Mali-G720, ...), its model for iPhones, and its cores and memory.
That picks where 3D games start and how fast they run:

| Class | Starts on | 3D frame rate | Other games |
| --- | --- | --- | --- |
| top (Fold 8, recent iPhone Pro, desktops) | ultra | 120 fps (where the screen does 120 Hz) | screen rate |
| mid | high | 60 fps | screen rate |
| low | medium | 30 fps | 60 fps |

The feed loop skips screen refreshes to hold a game at its rate (a 60 fps game on a 120 Hz screen
draws every other refresh), which saves battery and heat. Settings has Auto / 120 / 60 / 30
(battery saver); a game can also set `fps: 30` in its definition to cap itself.

Frame times are averaged over 45-frame windows and compared with the frame budget for the game's rate
(8.3 ms at 120 fps, 16.7 ms at 60). After two slow windows the render resolution steps down one fixed
level (100%, 85%, 70%, 55%), then the tier drops. At 120 fps a struggling game first gives up one
resolution step, then drops to 60 fps at full resolution, keeping the picture; at the lowest tier and
resolution a 60 fps game can drop to 30. It only climbs back after eight fast windows in a row, and
never above a level that was too slow in the last 30 seconds, so it does not bounce up and down (each
step reallocates render targets). Where a game settles (tier and frame rate) is remembered per game,
so its next round starts there instead of stuttering down again.

**Speed tricks that keep the picture the same:**

- The 3D canvas is shown directly on the playing card, under the card's own canvas, which is cleared
  each frame so the game's 2D HUD sits on top. Nothing is copied. When another 3D card starts, the
  last frame is baked into the card being left, so it keeps its picture. (Tests and screenshots run
  with `__hd.direct = false`, the old copy-into-the-card path; that's automatic under Playwright.)
  Don't draw anything into the card's canvas before `v.render()`: it is cleared there.
- Bloom, tone mapping and the colour grade are one final full-screen pass. The bloom is a short
  down/up-sampling chain at half resolution and below (9 small passes, was 13 bigger ones plus two
  full-screen ones).
- Shadow maps are only redrawn when a shadow caster or a shadow light has moved, turned, appeared or
  hidden (`__hd.info.shadows` says whether the last frame redrew them). If you change a mesh's
  geometry in place without moving it, call `v.shadowsDirty()`.

Shaders are compiled up front: the first `render()` calls `v.warm()`, which compiles every material
in the scene, including hidden ones, with shadows on and off. If you build new geometry or
materials later (a new floor), set `v.warmed = false` so the next frame warms again before play.
`__hd.info` reports `{ calls, tris, cpu, shadows }` for the last frame. The 3D frame is rendered at the tier's pixel count and stretched to the card; the 2D HUD is always drawn at
full resolution on top. `v.onTier(T => ...)` lets a game react (for example `spotLight.setTier(T)`).

Rules of thumb:

- Merge level geometry (walls into one mesh per material) and use `InstancedMesh` for repeated
  props. Aim for a few hundred draw calls at most.
- Hide things beyond the fog distance.
- Never create your own `WebGLRenderer`: phones allow only a few WebGL contexts. All Next Gen
  games share one, and the Classic kit has its own.
- Build textures once per game module (lazily, on first draw), not per round.
- `window.__hd.force = 0..3` pins a tier for tests and screenshots.

## Multi-touch

Next Gen games use two thumbs. Input callbacks get a pointer id: `down(x, y, id)`,
`move(x, y, pressed, id)`, `up(x, y, id)`. The pattern used by all three games: the first finger is
the movement stick; a second finger (or a finger on the other half of the screen) is the aim, look,
fire or nitro control. Keep a single-finger fallback so the game still plays with one thumb.

## Writing a Next Gen game

```js
import { HDView, Particles, pbr, rbox, surface, spot, THREE } from '../kit/hd3d.js';

let v;
function setup() {
  v = new HDView({ bg: '#06080c', fog: .07, env: .15, amb: .15 }).lampLights(9);
  const torch = spot('#fff1dc', 22, 16, .5); v.scene.add(torch, torch.target);
  v.onTier(T => torch.setTier(T));
  // add meshes to v.scene; move v.cam yourself (it is a PerspectiveCamera)
}
// in draw(c): move things, v.placeLamps(...), then
v.render(c, W, H);
// ...then the 2D HUD on top
```

Game definition:

```js
export default {
  id: 'my-game', title: 'My Game', tag: 'Next Gen · Shooter',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,   // fluid: the camera adapts to any shape
  goal: 1500, hint: '...', make,
};
```

Check it with `node scripts/sweep.cjs my-game` (long random play at odd sizes) as well as the
usual smoke and fold tests.
