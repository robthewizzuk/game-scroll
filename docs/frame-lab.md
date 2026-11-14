# Frame lab

Digital Foundry-style analysis of how a game really runs on a phone: frame times and pacing, 1% and
0.1% lows, what caused each hitch, the 3D's real resolution and upscaler, frame generation, heat and
CPU clocks over time, and picture comparisons you can zoom into. It is for finding problems nobody
has noticed yet, on the phone where they happen (the test browser draws 3D in software, so its timings
mean nothing: [testing.md](testing.md)).

The code is `src/framelab.js`. It loads only when it's on and costs nothing otherwise.

## Turning it on

- **On the phone**: tap the GAME SCROLL logo for the QA panel, then **Frame lab**. (For a first look at every 3D game at once, the panel's **Phone test tour** plays them all and lists the slow ones: [testing.md](testing.md).) It stays on across
  restarts (handy for catching start-up hitches) until you press its ✕.
- **In `npm run dev`**: F3, or open the page with `?lab`, or `__gs.lab()` in the console.

The panel sits at the top of the screen; ⇅ moves it to the bottom, – folds it to one line (fps, lows,
pacing, stutters). It fits the Fold 8 folded (374 px wide) and unfolded.

## What the panel shows

The **graph** is the last 4 seconds. Each bar is one picture put on the screen, its height the time
since the one before:

| Colour | Means |
| --- | --- |
| green | a real frame the game drew |
| magenta | a frame made by frame generation |
| red | a stutter: at least 1.5 times the beat and a whole refresh late |
| grey | not in play (the card waiting, game over) |

The dashed line is the beat the game should hold (the game's frame rate, or every refresh while
frame generation is on), the dotted line twice that. The **strip** above the bars has one cell per
screen refresh: green real, magenta made, dark nothing new, red a refresh the phone skipped. A 60 fps
game on a 120 Hz screen shows green, dark, green, dark; a 60 fps game on a 90 Hz screen shows uneven
gaps, and its pacing number drops. Letters over the graph mark events: **S** shaders built, **X**
textures uploaded, **G** heap fell (garbage collection), **Q** quality tier or resolution step changed,
**F** fold or resize, **C** card or round changed.

The numbers, over the last 5 seconds:

- **fps**, **1%** and **0.1%** lows: the 99th and 99.9th percentile frame time as a frame rate (0.1%
  needs 500+ frames, so it shows – at first).
- **pacing**: the share of pictures that came on the beat (within 0.4 of a refresh).
- **stutters** and **skipped** refreshes.
- the game, its state, the screen's measured rate (and on Android the rates it offers and the one the
  app asked for, `src/kit/screenrate.js`; on iPhone whether the 60 Hz cap came off), the game's frame
  rate, the screen size.
- 3D games: backend (WebGPU or WebGL), quality tier and resolution step, the **3D's own size → the
  final picture's size** (the resolution counter, straight from the 3D kit, so no pixel counting
  needed), the upscaler (SGSR 1 or 2), frame generation (mode, frames made per real one, its cost)
  and why it's on or off, CPU time of the game's `update()`, `draw()` and the 3D render, GPU time
  (`HD.info.gpuMs`: every pass for a real frame and the frames made after it, with the compute
  share in brackets: frame generation, GPU particles, culling), draw calls and triangles, and which
  effects are drawn smaller by their cost ("smaller: ao 50%, bloom 70%"; see docs/nextgen-3d.md).
- **CPU by part** (ms a frame, biggest first): where the phone's CPU time goes by part of the engine,
  so "physics 3D 1.2 · poses 0.8 · crowds 0.4 · 3D render 4.1 · 3D: shadows 0.8 · 3D: drawing 2.1 ·
  game's own code 0.6" (below).
- 2D games: the canvas size, and whether it was eased because the phone fell behind.
- the phone: heat (Android thermal status and headroom, iPhone thermal state), battery, heap,
  **memory** (the memory guard's level, fine, tight, low or critical, and on Android the phone's free
  memory; see below), and **CPU speed**: a fixed bit of work timed every 2 seconds, as a share of its
  best time. When the phone throttles its clocks, this falls.
- the last hitch and its causes. A hitch is a long gap between two pictures, and it is put down to the
  frame drawn before the gap (its update() and draw(), its biggest part, and the shaders, textures and
  garbage counted with it): that frame's work is what held the next picture back.

### CPU by part

Each kit marks its per-frame work once (`timed(World3D.prototype, 'step', 'physics 3D')`,
`src/kit/prof.js`), and the 3D kit marks the parts of its frame (detail, occlusion, copies, contact
shadows, traced reflections, shadows, drawing, shaders built ahead). While the lab is open each part's
own time is added up (a ragdoll's physics inside reactions counts only for the physics), and what is
left of the game's `update()` and `draw()` is the **game's own code**. With the lab closed nothing is
counted: a marked method costs one call and one check. The parts: physics 2D and 3D, poses, crowds,
AI, AI paths 3D, Tiny Brains, senses, sound, smoke and fire, liquids, ground marks, water, sky and
weather, land and grass, props, breaking buildings, reactions, characters, city, particles 3D, voxels,
falling sand, water flow, bullets, effects, board, soft things, vehicles, swarm, 3D render.
`trace(true)` from the lab's api also writes each part as a User Timing measure, which Chrome's
DevTools shows on its timeline (a debug build, the phone on a cable, `chrome://inspect`).

### Memory

The memory guard (`src/kit/memory.js`) asks the phone every 5 seconds, and at once when it warns:
on Android its free memory against the line where it starts closing apps (ActivityManager's
`availMem` and `threshold`), its own low memory flag and its trim warnings; on iPhone its memory
warning; on both the page's JavaScript heap against its limit where the browser says. Its level climbs
at once and falls a step at a time after 30 calm seconds. Low or critical: the feed keeps fewer cards
ready below and behind the one on screen, the 3D draws a resolution step smaller now and a tier lower
from the next round (as when hot), and the textures read back from storage are let go of. A crash
report from a close that came while memory was short says "(memory was low)". The lab's api
`memory(2)` acts as if memory were low (`memory(null)`: back to the phone's readings).

## Hitch causes

Every stutter during play is checked for what happened since the picture before it. So is every
**freeze**: a gap of a quarter of a second or more between two pictures of play (up to 3 s, and not the app
coming back to the front). The frame rate, lows and stutters leave gaps that long out (they look like a
pause), so the recording's summary counts freezes on their own, with the worst.

- shaders built (WebGL programs, WebGPU programs) and textures uploaded
- a garbage collection (the JavaScript heap fell by 1.5 MB or more; the browser rounds the heap
  size, so small ones are missed)
- the browser's long animation frame report: which script held the frame (file and function) or
  whether it was layout
- a quality tier, resolution step or effect size change, a fold or resize, the app coming back to the front,
  a card or round change, refreshes skipped
- the game's own CPU time going over the beat (and the CPU part that took most of it: the scene pass,
  physics, the game's own code...), or GPU time going over it
- if none of those: "no cause seen", which on a 3D game usually means the GPU, the driver or the
  system (another app, the phone's own work)

## Tools

| Button | Does |
| --- | --- |
| **● Rec** | Records up to 60 s of every refresh, hitch and phone reading. Tap again to stop. |
| **Freeze** | Stops the game's clock but keeps drawing: the picture settles and nothing moves. |
| **Tint** | Tints the card magenta on every made frame, so you see frame generation working. |
| **A/B** | On a frozen frame, two pictures with one setting changed: SGSR off vs on, SGSR 1 vs 2, SGSR 2 as Qualcomm has it vs with our changes, textures as drawn vs sharpened under SGSR 2 (WebGPU), WebGL vs WebGPU, half vs full resolution, low vs ultra tier, full vs half precision (the kit's own WebGPU passes in 16-bit numbers, on a chip that has them), every sample vs spread over frames (WebGPU, high and ultra: ambient occlusion, volumetric light and bounce light), the sky as before vs as the big engines draw it (WebGPU: Hillaire's air and marched clouds against the Preetham sky and painted clouds). Settings go back afterwards. |
| **Shimmer** | On a frozen frame, 16 pictures in a row and a heat map of pixels that still change while nothing moves: shimmering edges, upscaler or anti-aliasing jitter. With SGSR 2 it then measures the same frame again as Qualcomm's shader has it, and the notes give both numbers. |
| **FG check** | While you play a WebGPU game: grabs real, made, real frames and flags made pixels that match neither real frame nearby (ghosting, smears, holes behind moving things). Turns frame generation on for the check if it's off. |
| **Half** | While you play a WebGPU game on a chip with half precision (`shader-f16`): the chip's own time a frame by pass with the kit's own passes in full precision, then in half, then both again (1 s to settle and 2.5 s of readings each; the chain is built again at each switch), and how much each pass saved. The passes in half: SGSR 2's upscale, the sharp picture reads in SGSR 2 and frame generation, smoke and fire, the grade and sun glare (`src/kit/half.js`). `HD.info.half` (in the report) says which precision is drawing and any function the chip would not compile in half. |
| **Spread** | While you play a WebGPU game on high or ultra: the chip's time a frame by pass with ambient occlusion, volumetric light and bounce light taking every sample every frame (`HD.spread = false`), then spread over frames (a part of their samples a frame, the frames before filling in: `src/kit/hd3d-gpu-spread.js`), then both again, timed the same way as Half. `HD.info.spread` (in the report) says which are spread. |
| **Clouds** | While you play a WebGPU game on high or ultra whose sky has clouds: the chip's time a frame by pass with the sky's painted clouds (`HD.clouds = false`), then with real ones marched through (a quarter of the pixels a frame, the frames before filling in, and their shadow a few times a second: `src/kit/hd3d-gpu-sky.js`), then both again, timed the same way as Half. `HD.info.sky` (in the report) says what the sky draws. |
| **Report** | Shares a self-contained HTML report (Android and iPhone share sheet; a download on the web). |
| **Copy** | Puts a text summary on the clipboard, to paste into chat. |

The **viewer** (after A/B, Shimmer, FG check, Half, Spread or Clouds) has Wipe (a slider between the two), Side by side
(every picture shows the same part, for pixel peeping), Difference (four times the difference),
Flip (tap to swap), Flags (the heat map over the picture, boxes where flagged pixels gather), and
zoom 1x to 16x (or pinch, or the mouse wheel) with sharp pixels. Drag to move around.

## The report

One HTML file with everything in it, readable in any browser, phone or desktop:

- the summary (the same text as Copy)
- frame time of every picture over the whole recording, with event ticks
- frame rate and 1% low in one-second windows
- CPU time per real frame (update, draw, frame generation) and GPU time where known
- CPU by part: the average a frame and the worst frame for each part of the engine
- the chip by pass: the graphics chip's own time a frame for the scene, its shadows and each pass after
  it (where the phone gives the chip's times: WebGPU with timestamps), and the draws and triangles a frame
- the phone: CPU speed, heat, thermal headroom, battery and memory over time
- frame times in screen refreshes (how many pictures took 1, 2, 3... refreshes)
- every hitch and event with its causes, and the settings at the start and end
- the pictures from A/B (with a wipe slider), Shimmer and FG check, and the Half and Spread checks' times

To send one to Claude: Report, share it to yourself (Drive, email), and attach it in chat; or just
Copy and paste the summary.

## How it hooks in

`src/main.js` calls `LAB.tick(now, card, 'frame' | 'between' | 'idle', update ms, draw ms)` each
refresh, and skips the game's `update()` while frozen. Frame generation's `HD.fgTap` hook (hd3d.js)
says whether each refresh showed a real or made frame. The 3D kit writes the 3D and final sizes into
`HD.info.rw`, `rh`, `ow`, `oh`; `src/kit/renderer.js` counts built WebGL programs in `glStats`
(`src/kit/gpu.js`); `src/kit/power.js` keeps the raw thermal readings. Pictures are grabbed in the
same frame they're drawn, from every canvas (and the AR camera video) in the card.

Timing comes from `requestAnimationFrame`, which on Android and iPhone runs on the screen's beat. The
browser doesn't say when a picture actually lit up, so a frame the compositor held back is not seen.

`scripts/framelab-test.cjs` checks the lab itself in the test browser (2D and Next Gen, A/B, Shimmer,
FG check, the Half check (the test browser has no half precision, so it pretends: `HD.halfPretend`), the Spread check, the Clouds check when the game's sky has clouds, fold and unfold, effects drawn smaller, memory, the report).
