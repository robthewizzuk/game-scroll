# AR · 3D games: 3D in your real room

AR games (`era: 'ar'`) put 3D objects into the player's real room. The back camera picture fills the
screen and the phone's gyro turns the 3D camera, so a saucer, a bin or a hoop stays where it is in
the room while you move the phone around. It is "look-around" AR (3 degrees of freedom): you turn,
tilt and look up and down on the spot; walking around is not tracked.

The kit is `src/kit/ar3d.js`, built on the Next Gen renderer (`src/kit/hd3d.js`): physically based
materials, reflections, and real-time shadows that fall on the real floor (an invisible floor that
only shows shadows). Bloom and the colour grade are left out, because they would also tint the real
world behind the scene. Games built on it: `saucer-swarm.js`, `bin-flick.js`, `hoop-drone.js`, `freeze-rex.js` (reads how much
the phone moves), `table-siege.js`, `floor-golf.js`, `domino-run.js` and `laser-mirrors.js` (things placed on a
real surface: tap with native AR, in front of you otherwise) and `treasure-drop.js` (uses `api.location`).

## Native AR: walk around (world mode)

In the phone app, the kit uses ARKit (iPhone) or ARCore (Android) through the `NativeAR` plugin
(`plugins/native-ar`, bridged by `src/kit/native-ar.js`). The camera picture is then drawn natively
**behind** a see-through page (the `ar-live` class on `<html>`; CSS keeps only the game screen
clear), and every frame the plugin sends the phone's real position and turn, the lens, and a light
estimate. So the 3D camera moves when the player walks, and things stay put on the real floor.

- `v.mode` is `'world'` with native AR, `'look'` otherwise. Games don't have to care: `FLOOR`,
  `look()`, `draw()`, `eyePos`, `forward()` and `recenter()` all work the same in both.
- The floor is found, not calibrated. Each round opens with "Find your floor" (`v.calibrating` is
  true, so games already pause) and the search (`src/kit/ar-floor.js`) listens to everything the
  phone can tell it:
  - **mapped surfaces** (the lowest one of real size wins, so a table or bed above the floor is
    passed over; an iPhone that names a surface "floor" is believed at once, and one it names table
    or seat is never the floor);
  - **feature points** (the dots the phone tracks): where they lie in a flat layer, that is a
    surface, long before the phone has mapped it. This is what finds a plain floor quickly;
  - **hit tests** from three spots on the screen (a mapped surface counts at once, rough points
    need three that agree).

  Only something at least 75 cm below the phone counts (45 cm if it is floor-sized or reaches well
  away, for a player sitting low), and nothing more than 2.3 m below.
- **Nobody gets stuck.** If nothing sure turns up in 5 s of good tracking, the round starts on the
  best estimate (last round's floor, a thin layer of points, or the usual phone height), and the
  search carries on quietly: the real floor takes over when it is seen. Skip (shown after 2.5 s)
  does the same at once. From the second round on, last round's floor is used after about a second.
- **The grid tells the truth.** No grid shows while the kit is still looking. A teal grid and
  "Floor found" mean the phone has seen the floor; an amber grid and "Floor estimated" mean a best
  guess. The "⇕ Floor" chip (bottom left) opens "Line up your floor" in world mode too: drag the
  grid onto the floor by hand (that then stands, whatever is mapped later), or "Scan again".
- **Lost tracking.** If the phone loses the room for more than a second mid-round, `v.calibrating`
  turns true (the game waits) and a panel says why and what to do (too dark, moving too fast, a
  blank wall). After 5 s of that, in a round or in the search, "Play without room tracking" switches
  to look-around mode for the rest of the session (`v.toLook()`).
- `recenter()` (from a game's reset) puts the player at x = z = 0 straight away, so a game can
  place a new round's things from `eyePos` at once.
- `recenter()` makes where the phone points and stands now "straight ahead" at x = z = 0.
- `v.surfaces()` lists found surfaces `{ id, p, q, w, d, floor, kind, wall, n }` (empty in look mode;
  `kind` is `'floor'`, `'table'`, `'seat'` or `'other'` on phones that can tell, else undefined;
  `n` is the way the surface faces. Walls are listed only when the game asks for them, see below).
- `v.floorFound` is true once the phone has really seen the floor (or the player set it by hand),
  and false while play runs on an estimate. `v.floorSource` says where the height comes from:
  `'plane'`, `'points'`, `'hits'`, `'hand'` (seen or set), `'kept'`, `'rough'`, `'guess'`
  (estimates), or null. `FLOOR` is right to use either way; a game that needs the true floor (to
  measure a jump, say) can wait for `floorFound`.
- `v.status()` gives the whole picture for a debug readout: `{ mode, tracking, why, surfaces,
  points, floor, sure, layer }`, and for the parts below `{ depth, walls, light, sun, anchors, markers }`.
- `await v.hit(x, y)` finds where a screen point meets a real surface: `{ p, kind, wall, n, q }` with kind
  `'plane'` or `'point'`, or `'floor'` in look mode (the line of sight meets `FLOOR`), or null.
  `n` is the way the surface faces and `q` a turn that stands a thing there (its +z out of a wall, or
  towards the phone on a floor or a table).
  Feature-check new methods (`v.hit?.(...)`, `v.surfaces?.()`, `v.status?.()`) so a game still runs
  on an older app.
- `ar: 'world'` on a game definition means it only makes sense walking around; the feed leaves it
  out on phones without native AR. Leave it off for games that play fine in look mode.
- `AR Lab` (`src/games/ar-lab.js`, benched, opened from Settings > AR test) is the test scene: a
  cube on the floor, found surfaces drawn as outlines, and a status panel that says what the phone
  is tracking, why not if it isn't, and what the floor height comes from. Its chips (Hide, Walls,
  Light, Mesh, Marker) switch on the parts below one at a time.
- The plugin sends feature points only while the kit asks for them (`points({ on })`): during the
  search, and for up to 40 s after a round starts on an estimate.
- ARCore is optional in the Android manifest, so the app still installs on phones without it; the
  first native AR game may ask to install Google Play Services for AR. The privacy page says so.

## The real room joins in (AR phase 2)

With native AR a game can ask for more of the real room. Each part is off unless the game asks for
it, so a game that doesn't plays exactly as before; and each is a bonus: in look-around mode, on the
web, or on a phone that can't do it, the game still plays (nothing is hidden, the light is the usual
one, a marker is never found), so none of them may be the only way to play.

```js
const v = new ARView({ occlude: true, walls: true, light: 'real' });
```

- **Real things hide virtual ones** (`occlude: true`). The phone measures how far away the room is
  (most ARCore phones; iPhones with a LiDAR scanner) and about ten times a second the kit turns that
  depth picture into an invisible mesh that only fills the depth buffer (`src/kit/ar-room.js`), so
  the part of a robot behind a real sofa isn't drawn. Phone depth is a few centimetres out, so every
  spot is set back a little, and a spot seen on the mapped floor or a mapped wall goes just behind
  it: things standing on the real floor, and their shadows, are never cut into. Where the phone
  knows nothing (too near, beyond 8 m, shiny or dark things) nothing is hidden. `v.occluding` is true
  while it is at work. Things that should always show (a HUD marker in the scene) can be drawn over
  it with `material.depthTest = false`.
- **Walls** (`walls: true`). Walls are mapped as well as floors and tables: `v.surfaces()` lists them
  with `wall: true` and `kind: 'wall'`, and `v.hit(x, y)` can land on one (`wall: true`; stand a
  thing there with `obj.position.copy(h.p); obj.quaternion.copy(h.q)`). A wall is never taken for the
  floor.
- **The room's real light** (`light: 'real'`). The sun moves to where the room's light really comes
  from (a window, a lamp), so virtual shadows fall the same way as real ones, and shiny things
  reflect the phone's picture of the room rather than the kit's studio. Android gives the direction
  itself; on iPhones the kit finds the brightest part of the room's picture. The sun is never lower
  than 25 degrees, so shadows don't stretch right across the floor, and an evenly lit room keeps the
  usual sun. Brightness and colour still come from the light estimate as before.
- **Anchors** (`v.anchor(p, q)`). The phone keeps correcting its map of the room as it learns it,
  and over a long round things can creep a few centimetres. An anchor is a spot the phone holds on
  to: `const a = v.anchor(h.p, h.q); a.attach(mesh)` keeps the mesh there (`a.p`, `a.q` are where it
  is now; `a.held` says the phone has it; `a.remove()` lets go). Sixteen at most. Anchors last one
  round: `off()` lets them all go, so make them again after `reset()`. In look mode the spot simply
  stays where it was put.
- **Picture markers** (`v.marker(picture, { width, name })`). The phone looks for a picture in the
  room: a printed card, or another screen showing it. `picture` is a canvas, and
  `gs.ar.markerArt(seed)` draws one that phones find easily (a plain or repeating picture is turned
  down: `m.ok` is false). `m.attach(mesh)` puts the mesh on the picture once it is found; `m.found`,
  `m.tracked` (in sight now), `m.p`, `m.q` (x to the picture's right, y out of it, z down it) and
  `m.w` (its measured width) say the rest. Give `width` in metres when the game knows it (a printed
  card): the phone then places it at once; without it the phone works the size out as it looks. Two
  phones looking at the same card see the same place, which is one way to start a shared board.

All five are new and have run only against the pretend phone below, not on a real one: try AR Lab's
chips on a phone before building a game on them.

For the plugins (`plugins/native-ar`): `start({ depth, walls, light: 'real' })` answers which of the
three this phone gave; depth pictures arrive as a `depth` event (a grid of 16-bit millimetres), the
room's light as an `env` event (a small cube map) and, on Android, a direction in each frame's
`light.dir`; `anchor()`, `removeAnchor()` and `images()` do the rest. The header of
`NativeARPlugin.java` has the exact shapes, and `scripts/lib/fake-native-ar.js` speaks the same.

## Fitting the real room

- **Floor calibration.** The first time the camera starts, the kit opens "Line up your floor": the
  player points at the floor and drags a teal grid up or down until it lies flat on it, then taps
  Done. That sets how high the phone is held (saved on the device), and the 3D camera sits at
  `FLOOR + v.eyeH`, so anything a game puts at `y = FLOOR` stands on the real floor. A small
  "⇕ Floor" chip (bottom left, while the camera is on) reopens it. While it's open
  `v.calibrating` is true: games must skip their update (that pauses timers and enemies) and send
  their input through `v.input(...)` first. **The build checks this**: `npm run games` fails for a
  game that makes an `ARView` but never reads `.calibrating` or calls `.input(`, because such a game
  runs (and can be lost) behind the "Find your floor" panel, and its Skip and Done buttons don't work.
- **Light estimation.** Twice a second the camera picture is shrunk to 8 x 6 pixels; its average
  brightness and colour drive the sky light, sun and reflections, so objects get darker in a dim
  room and pick up warm or cool light. (Reading pixels back stalls the graphics chip, so it isn't
  done every frame.)
- **Camera picture under the 3D.** In look-around mode the camera's video element sits under the
  see-through 3D canvas (CSS `object-fit: cover`, the same crop as before), so the picture isn't
  redrawn into the game's canvas every frame. Tests and screenshots (`__hd.direct = false`) still
  draw it into the canvas.
- **Less drift.** On Android the kit uses the compass-locked orientation
  (`deviceorientationabsolute`), so "straight ahead" can't slowly turn. iPhones use the gyro reading, which drifts very
  little over a short game.

## Fallbacks (every AR game must play everywhere)

- **No camera** (refused, desktop, web): a virtual room (wooden floor, painted walls) is drawn
  instead, and the game plays the same.
- **No gyro** (desktop, motion refused): the player drags on the screen to look around
  (`v.drag(dx, dy)`). Games where dragging is already the control (Bin Flick's flick) should keep
  their targets in view instead.
- `arNote(c, v, W, H)` draws a small note at the bottom saying which fallback is on.

## Writing an AR game

```js
import gs from '../gamescroll.js';
const { haptic, want } = gs.device;
const { ARView, arNote, FLOOR } = gs.ar;
const { Particles, pbr, rbox, THREE } = gs.hd;

function make(api) {
  want('motion');                  // iPhones ask for motion access on the Play tap
  let v;
  return {
    reset() { v?.off(); v?.recenter(); /* ... */ },     // stop the camera; "ahead" = where the phone points next
    update(dt) { if (!v) return; v.live(); if (v.calibrating) return; /* ... */ if (lost) { v.off(); api.over(); } },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; /* ... */ },          // same for move (pass pressed) and up
    draw(c) {
      if (!v) { v = new ARView(); /* build meshes, add to v.scene */ this.reset(); }
      v.look();                    // gyro (or drag) -> camera
      v.draw(c, W, H);             // camera picture + 3D scene
      v.pointers(c, W, H, [{ p: target, col: '#8affdc' }]);   // edge arrows to things off screen
      /* 2D HUD */ arNote(c, v, W, H);
    },
  };
}
```

- The floor is at `y = FLOOR` (-1.3) and the phone (the eye) is at `v.eyePos`: above the origin by
  however the player calibrated (1.3 m above the floor until then). Aim rays start at `v.eyePos`. Straight ahead at the start is `-z`. Put things 1.5 to 7 m away at real-world sizes
  (a bin is 38 cm tall, a saucer 80 cm across) so they look right on the real floor.
- `v.forward()`, `v.heading()` and `v.offAim(p)` tell you where the phone points; `v.toScreen(x, y, z)`
  gives screen coordinates for tap tests and labels.
- `v.seeing` is true while the camera picture shows, `v.sensor` while the gyro drives the view.
- Spread targets round the player to make them turn (behind them too), and always add edge arrows
  so they can find them.
- The 3D lens is matched to the camera's field of view (about 64 degrees on the long side), so
  placed objects don't slide against the room as you turn.
- Stop the camera (`v.off()`) in `reset()` and before `api.over()`. The kit also stops it when the
  app goes to the background.

Game definition:

```js
export default {
  id: 'my-ar-game', title: 'My AR Game', tag: 'AR · Shooter',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,   // fluid: fills tall phones and unfolded foldables
  goal: 20, hint: '... through the camera ... No camera? Drag to look around.', make,
};
```

## Testing

`npm run smoke`, `npm run fold` and `node scripts/sweep.cjs <id>` run AR games with the virtual room.
To see the camera path in headless Chromium, launch it with
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=room.y4m`,
grant the `camera` permission, make `DeviceMotionEvent.requestPermission` resolve `'granted'`, start
the game with a real click (motion access is asked on the Play tap), and dispatch
`Object.assign(new Event('deviceorientation'), { alpha, beta: 90, gamma: 0 })` to turn the phone.

**Native AR without a phone.** `node scripts/ar-floor.cjs` (after `npm run build:bundled`) plays Bin
Flick against a pretend `NativeAR` plugin (`scripts/lib/fake-native-ar.js`): a phone held at 1.3 m
that sways as if in a hand, with whatever the scene sets up in `window.__ar` (mapped surfaces, feature
points, rough hit points, tracking state and the reason it is poor, an older app that sends less). It
checks that the floor is found from each kind of evidence, that a table is not taken for the floor,
that a round never waits for ever, and that Skip, the Floor chip, lost tracking and "Play without room
tracking" work. Its "room:" scenes play AR Lab in a pretend room with a box, walls, a lamp, a map that
shifts and a marker card, and check each AR phase 2 part: the box hides the cube behind it (and the
cube's shadow still shows), noisy depth doesn't cut into the floor, walls are mapped and never taken
for the floor, the sun turns to the light, an evenly lit room looks like the studio, an anchor follows
the map, a marker is found, and an older app or a phone that can't do a part still plays. `--shots
<dir>` saves screenshots; `--webgpu` runs on WebGPU; a word after the script name runs only the scenes
whose name contains it. The floor search itself is plain JavaScript, and `npm run kit-test` plays
about thirty rooms through it in Node. Neither replaces a real room: ARCore and ARKit decide what
they map and when, so try AR Lab on a phone after changing the search.

## Contact shadows

`ARView` lays soft contact shadows on the floor under everything that casts a shadow (medium tier and
up), so objects look like they're sitting on your real floor. Adjust them with
`v.contactShadows.at(x, z)` (centre) or turn them off with `v.contactShadows.enabled = false`. Screen-space reflections are Next Gen only: they'd look wrong over the
live camera picture.

Like Next Gen, the 3D layer is drawn at the tier's pixel count and upscaled to the screen with Snapdragon Game Super Resolution 1 (the camera picture underneath stays at full resolution).

On WebGPU, frame generation works for AR views as it does for Next Gen (`docs/nextgen-3d.md`, Frame
generation): on a 120 Hz screen, a game drawing 60 frames a second gets a made frame between each pair,
see-through background included. The camera picture underneath plays at its own rate and isn't
touched. `frameGen: false | 'ahead'` in the definition and `v.cut()` work the same way.
