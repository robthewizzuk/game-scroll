# Open-city games: what a phone can carry

An open-city game (an original crime-action game in a made-up city: driving, on foot, police, missions)
asks for every heavy system at once: the city to the horizon, its traffic and people, night lights,
rain, physics and a chase. The **Open city** engine test scene (`opencity` in `src/detail-scenes.js`;
QA panel › Phone test tour › Engine test scenes) drives through all of that on the phone in your hand,
so each system can be given a budget, and a game can be built to it.

## The scene

A drive at 16 m/s across a made-up downtown of ten blocks a side, corner to corner and back, with the
camera in a chase behind a car. The city is not built ahead: it builds as the drive reaches it, as a
game's would. Four runs, the first three each adding more:

| Run | What is on |
| --- | --- |
| `day` | The city to the horizon (`far: true`), traffic and people at 1.3 times normal, parked cars, at midday and dry |
| `night` | The same drive at night in the rain: street lamps and headlights casting shadows, wet streets, drops on the lens, spray off the tyres |
| `chase` | The night drive with three cars behind, the city solid in `gs.physics3d` (buildings, kerbs, street furniture, parked cars, the nearest traffic and people), crates in the road for the car to shove, people running from it and traffic braking for it |
| `metro` | The whole city at midday: four districts (downtown, an old town, a suburb, a harbour) with land and roads between them (`gs.city` `Metro`), driven from the middle of downtown down to the harbour's quay and back. The districts round the start are made before the run, as a game's loading screen would; the harbour is made a step at a time on the way |

Each run's report line gives each system's own time a frame (the city's code, the sky, the rain and
wet, physics and how many hits), how many of the city's chunks are built, what the meshes keep in
JavaScript and on the graphics chip, and the JavaScript heap where the browser says.

`node scripts/scene-probe.cjs --webgpu --q "scene=opencity&mode=chase&size=.25&frames=60"` flies one
run on the build machine (no phone timing; the code's time by function is what to read there).

## Budgets

These are starting budgets for a Galaxy Z Fold 8 at 60 fps (16.7 ms a frame). They are set again from
the first run of the scene on the Fold; until then they are targets, not measurements.

| System | Code a frame | Notes |
| --- | --- | --- |
| City (building, traffic, people, lamps) | 2.0 ms | builds within 2.5 ms a frame; more cars and people cost here |
| Physics | 1.5 ms | the nearest 10 cars and 14 people are bodies; keep loose things in the tens |
| Rain and wet | 0.8 ms | |
| Sky | 0.3 ms | |
| The game's own code | 2.0 ms | AI, missions, HUD |
| Drawing (the 3D kit's code) | 6.0 ms | the frame lab splits it by pass |
| Memory | | |
| Meshes on the chip | 400 MB | |
| JavaScript heap | 400 MB | the memory guard steps detail down before the phone runs short |

Measured on the build machine (software WebGPU, size 0.25, so three blocks a side, 2026-11-15): city
3.8 to 4.7 ms, sky 0.4 ms, rain and wet 5.1 ms, physics 2.9 ms, 34 MB of meshes on the chip, 98 MB heap.
The build machine is several times slower than a phone, so these say where the time goes, not what a
phone takes.

In the `metro` run the report line also says how many of the four districts were made and the most the city's code
took in one frame while making one.

## What the scene shows today

A city lets go of the blocks it has driven past (`keep`, 600 m) and they stand as lit boxes, so its memory stays
bounded however far the drive goes. A big city of districts (`Metro`) makes each district a step at a time as the
drive comes near: on the build machine the longest step went from 105 ms (a new style of car, then the parked cars'
shapes) to about 7 ms once every district's cars are shaped with the first. What is left is the city's own: a block
of buildings is built whole in one frame (8 to 30 ms on the build machine), and each made district's traffic and
people cost their own time, so three made at once took 9 ms a frame against 4 ms for one.

Next for the big city: a highway with ramps, bridges over the water, tunnels and hills under the roads, and traffic
on the roads between districts.
