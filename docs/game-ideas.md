# Game ideas

Master list toward the 1000-game launch. Every entry must be a **different mechanic**. Reskins, palette swaps and difficulty variants don't count. `[x]` = built (file in `src/games/`). The list grows ahead of building, 100 ideas at a time, and every new idea is checked against what's already here.

Tags: 🕹 pocket/retro · 📱 casual · 🎯 needs a phone feature (with a touch fallback)

## Built (16)

- [x] Cave Flyer 🕹 — hold to climb through a scrolling cave
- [x] Pixel Worm 🕹 — grow a worm by eating seeds without biting yourself
- [x] Brick Bounce 🕹 — paddle and ball breaking a brick wall
- [x] Rock Blaster 🕹 — fixed turret shooting rocks that split
- [x] Road Hopper 🕹 — hop forward across endless roads before the screen catches you
- [x] Sky Defense 🕹 — fixed shooter against a marching formation
- [x] Street Lamps 🕹🎯 — flip-the-neighbours puzzle seeded by your area and the date (GPS)
- [x] Stack Up 📱 — drop sliding blocks, overhang gets trimmed
- [x] Slice Rush 📱 — swipe fruit, avoid bombs
- [x] Tile Tap 📱 — tap the lit tile in every row before it scrolls off
- [x] Hoop Flick 📱 — flick a ball into a moving hoop
- [x] Orbit Jump 📱 — launch from planet orbit to planet orbit
- [x] Rope Swing 📱 — grapple hooks and swing over lava
- [x] Tilt Maze 📱🎯 — roll a marble to the hole (tilt)
- [ ] ~~Shout Rocket 📱🎯 — voice volume is the throttle through rings (mic)~~ Removed: a near-twin of Whistle Bird, which steers by pitch and does more; shouting at a phone is awkward in public.
- [x] Safe Cracker 📱🎯 — feel the haptic thump on the right number (haptics)

## Removed after review (2026-11-11)

Built, then taken out in the whole-catalogue review (`docs/qa/review.md`). Don't rebuild these as they were; a new game needs a real mechanic on top.

- [ ] ~~Lane Racer 🕹 — four-lane top-down traffic dodging~~ Removed: the most basic game in the app; Road Hopper, Ski Slalom, Kit Racer and Pocket Kart cover it.
- [ ] ~~Compass Hunt 🕹🎯 — turn your body to face a radar blip (compass)~~ Removed: you had to turn your whole body, and without a compass it was dragging a dot to the middle.
- [ ] ~~Bubble Level 🕹🎯 — steer a spirit-level bubble into a wandering ring (tilt)~~ Removed: the thinnest of the tilt games; Tilt Maze, Steady Hand and Marble Trio do more.
- [ ] ~~Shake Soda 📱🎯 — shake to build fizz, land the gauge in the green (shake)~~ Removed: a four-second gag with nothing to learn on a second go.
- [ ] ~~Colour Hunt 📱🎯 — find real-world objects matching a colour card (camera)~~ Removed: needed the camera and a walk round the room, and a match was easy to fake or impossible to find.
- [ ] ~~Shake Dice 📳 — shake to roll dice, push your luck to a target~~ Removed: dice luck with one choice; Shake Tree does push-your-luck better.
- [ ] ~~Tap on Green — tap the moment the light turns green (reaction time)~~ Removed: a reaction timer rather than a game; Thumb Duel covers it.
- [ ] ~~Swipe the Arrow — swipe the way the arrow points (or the opposite when it's red)~~ Removed: a bare reflex test; random swipes ended a round in half a second.
- [ ] ~~Lamp Flip — tap lamps that flip their neighbours until every lamp is lit~~ Removed: the same puzzle as Street Lamps, which has the daily neighbourhood twist.

## Reworked after review (2026-11-11)

These thirteen played well but each sat too close to one existing game, so each was redesigned with its own rules and look and given a new name (`docs/qa/review.md`). Don't rebuild the old versions.

- Egg Catcher became **Egg Box**, Germ Buster became **Key Drop**, Cube Tide became **Row Call**, Panel Rise became **Tide Turn**
- Saber Knight became **Snow Swat**, Blob Pairs became **Bookends**, Crate Dash became **Paint Run**, Timing Brawl became **Riposte**
- Grid Duel became **Broadside**, Mansion Night became **Pantry Patrol**, Copy Puff became **Boomerang Fox**, Garden Guard became **Picnic Panic**, Suit Ops became **Canopy Run**

## Research notes (Nov 2026)

What makes the best phone and handheld games fun, and how this list uses it:
- **Sort and merge puzzles** are the fastest-growing casual genres in 2026 (sort-puzzle revenue up 229% and Merge-2 up 74% in H1 2026, [Cinevva](https://app.cinevva.com/guides/casual-games-trends-2026)). The goal is clear at a glance and the combining feels good.
- **Block and colour puzzles** with a one-screen loop were the only casual segment still growing in 2025 and 2026. A meta layer gives players a reason to come back, and our credits and trophies already provide it.
- **One-touch hypercasual** games still lead downloads, because they're snackable and learned in seconds ([Udonis](https://blog.udonis.co/mobile-marketing/mobile-games/casual-games)).
- **Match-3 is saturated**, so match games here need a twist rather than another plain swap-three.
- **Classic handhelds** shone at quick-to-learn rules, score chasing, and huge amounts of bite-sized content ([Nintendo Life top 50](https://www.nintendolife.com/guides/50-best-game-boy-games-of-all-time)). The genres include falling-block and colour-matching puzzles, picture-logic puzzles, block-breaking, pinball, territory capture, motocross, platformers, bomb mazes and run-and-gun.

We use genres and mechanics only: every game has its own name, art, rules and levels.

## Research-led additions

- [x] Merge Ten 📱 — tap groups of touching equal numbers to fuse them one higher; reach 10

- [x] Merge Drop 📱 — drop fruit into a jar; two of the same touching merge into a bigger one, don't overflow
- [x] Territory Claim 🕹 — draw lines to fence off 75% of the field while a bouncing spark hunts your line
- [x] Key Drop 🕹 — drop shape keys down a well of locked crates; a key opens every matching crate it lands on in a chain, a wrong one jams
- [x] Moto Hills 🕹 — side-view dirt bike over hills; lean to land flat
- [x] Bomb Maze 🕹 — drop timed bombs to blast blocks and trap wandering critters on one screen

## Pocket arcade 🕹

- [x] Mole Mallet — tap critters popping from a 3x3 grid; skip the ones wearing helmets
- [x] Lift Operator — run a lift: stop at floors so people get on and off before they lose patience
- [x] Pipe Plumber — rotate pipe tiles to route water before it starts flowing
- [x] Sheep Herder — drag a dog around to push sheep into a pen
- [x] Bomb Sweeper — tap cells to reveal numbers, hold to flag (8x8 board)
- [x] Ladder Climber — tap left/right rungs in rhythm; missing a rung drops you
- [x] Ghost Lantern (built as Lantern Maze) — light a dark maze with a short-lived lantern pulse to find the exit
- [x] Mine Cart — tap to switch the rail junction ahead of your cart
- [x] Balloon Pop Archer (built as Balloon Archer) — aim and release an arrow at drifting balloons, limited arrows
- [x] Egg Box — slide a five-cup egg box under two laying hens; fill every cup to ship the box, never drop an egg on a full cup
- [x] Penguin Slide — hold to dive down slopes, release to fly over gaps
- [x] Tank Duel — angle and power artillery shots against a CPU tank on hilly ground
- [x] Fishing Line — drop a hook, reel up through layers, avoid snagging jellyfish
- [ ] Bat Cave Echo — tap to send an echo that briefly reveals walls in the dark
- [x] Snowball Roll — roll a growing snowball; bigger is slower but smashes obstacles
- [x] Gold Digger — tunnel down through dirt, collect gems, don't get crushed by boulders
- [x] Pinball Pocket — two flippers, one table, three balls
- [ ] ~~Traffic Light — control a crossing's lights so cars and walkers never collide~~ Removed: flipping the light every half second won without watching the queues.
- [x] Number Merge Grid (built as Slide Ten) — slide tiles on a 4x4 grid; bumping tiles add up to at most 10, exactly 10 clears
- [x] Frog Tongue — aim a sticky tongue at passing flies, chain combos
- [x] Kite Flyer — keep a kite in the wind band by tugging the string
- [ ] Domino Run — place dominoes on a grid so one push topples them all
- [x] Space Docking — thrust to match speed and angle with a station port
- [x] Ninja Wall — tap to jump between two walls, dodge spikes
- [x] Chess Knight Path (built as Knight Path) — visit every lit square with knight moves before time runs out

## Pocket puzzle 🕹

- [x] Ice Slide — slide on ice until you hit a rock; reach the exit in few moves
- [x] Crate Pusher — push crates onto targets (small rooms, 1-minute boards)
- [x] Mirror Beam — rotate mirrors to guide a laser to the receiver
- [x] Colour Flood — flood-fill from a corner to make the board one colour in N moves
- [x] Gear Train — place gears so the motor turns the final wheel the right way
- [ ] Bridge Builder Lite — place planks so a cart crosses (fixed budget)
- [x] Sliding Picture — 3x3 sliding tile picture
- [x] One Line — draw through every dot without lifting or reusing a line
- [x] Code Breaker — guess a 4-symbol code from right/close feedback
- [x] Laser Lock — rotate rings so gaps line up and the laser escapes
- [ ] Gravity Flip — flip gravity to guide a block through a maze
- [x] Rail Connect — draw track segments so two stations connect
- [x] Shape Fit — drop given shapes into an outline with no gaps
- [ ] Switch Sequence — repeat a growing pattern of switch presses
- [x] Water Pour — pour between jugs to measure an exact amount
- [x] Arrow Maze — every tile has an arrow; pick a start that reaches the goal
- [ ] Count the Dots — quickly count dots flashed on screen
- [x] Odd One Out — spot the one critter that differs in a grid, subtler each round
- [x] Path Memory — watch a path light up, then walk it from memory
- [x] Balance Scale — place weights so the beam balances

## Casual action 📱

- [x] Dart Wheel — throw darts into a spinning target without hitting other darts
- [x] Ball Bounce Helix — tap to drop a ball through gaps in rotating rings
- [x] Paper Plane — tilt or drag to glide a paper plane through a windy city
- [x] Bowling Swipe — swipe and curve a ball into ten pins
- [x] Mini Golf One Hole — drag back to putt on a random one-hole course
- [x] Bottle Flip — flick to flip a bottle so it lands upright
- [x] Skate Ollie — ollie over obstacles and chain kickflips and grabs in the air
- [x] Archery Wind — aim with wind drift at distant targets
- [x] Penalty Keeper — swipe to dive and save penalty kicks
- [x] Penalty Striker — swipe a curved shot past a moving keeper
- [x] Rhythm Drums — tap three pads in time with falling notes
- [x] Juggle Kick — keep a ball up by tapping under it
- [x] Ski Slalom — steer between gates on a downhill run
- [ ] Surf Wave — ride a wave's face, pump for speed, avoid wipeout
- [ ] Boxing Dodge — swipe to dodge punches, tap to counter
- [x] Laser Dodge — drag a dot through sweeping laser beams
- [x] Popcorn Pan — shake or tap to pop kernels without burning them
- [x] Ping Pong Rally — swipe to return the ball, angle by swipe direction
- [x] Trampoline Tricks — tap in the air to flip, land upright
- [x] Gravity Runner — flip gravity between floor and ceiling to dodge spikes on both
- [ ] ~~Balloon Rise — protect a rising balloon by pushing obstacles away~~ Removed: holding one finger still above the balloon won.
- [x] Hammer Strength — time the power meter for the carnival bell
- [ ] Fruit Stacker — stack wobbling fruit as high as possible
- [x] Cup Shuffle — follow the cup hiding the ball
- [x] Spinner Keep-up — flick a fidget spinner to keep it spinning past targets

## Casual puzzle 📱

- [x] Block Fit Grid — place given blocks on a 8x8 grid, clear full rows and columns
- [x] Ball Sort Tubes — pour coloured balls so each tube is one colour
- [x] Untangle — drag points until no lines cross
- [x] Word Swipe — swipe letters to form words from a wheel
- [x] Hexa Merge — drop numbered hexes, merge three of a kind
- [x] Pin Pull — pull pins in the right order so balls reach the cup
- [x] Parking Out — slide cars so the red car can leave the lot
- [x] Gem Slide — match-three where you slide whole rows and columns round like a loop instead of swapping (20 slides)
- [ ] Draw to Save — draw a line that shields a character from falling rocks
- [x] Candy Swing — cut ropes so the candy swings into the basket
- [ ] Tangram Snap — rotate pieces to fill a silhouette
- [x] Liquid Mixer — mix colours to match a target shade
- [x] Nonogram 5x5 (built as Picture Logic) — fill cells from row and column hints
- [x] Sudoku 4x4 Speed — quick 4x4 sudokus against the clock
- [x] Bubble Shooter (built as Bubble Pop) — aim coloured bubbles to pop groups of three
- [x] Jigsaw Six — six-piece jigsaw against the clock
- [x] Spot the Difference — two pictures, five differences
- [x] Link Pairs — connect matching icons with a path of max two turns
- [ ] Rotate Maze — rotate the whole maze to roll the ball out
- [x] Stack Sort Cards — sort a shuffled hand by dragging into order

## Phone-feature games 🎯

- [x] Blow the Candles 🎤 — blow into the mic to put out candles; striped trick candles relight unless all are out at once
- [x] Whistle Pitch 🎤 — hum or whistle higher or lower to steer a bird
- [x] Clap Back 🎤 — listen to a beat, then clap it back (mic hears real claps)
- [x] Quiet Ninja 🎤 — sneak past guards; any noise above a threshold alerts them
- [x] Tilt Pour 📐 — tilt to pour water into cups without spilling
- [x] Marble Run Tilt 📐 — tilt a tray of three marbles into three holes at once
- [ ] Tilt Snake 📐 — steer a worm by tilting
- [ ] Spin Around 🧭 — spin on the spot a set number of turns as fast as you can
- [ ] Sun Seeker 🧭📍 — point your phone at today's real sun position
- [x] Maraca Rhythm 📳 — shake in time with a beat
- [x] Shake the Tree 📳 — shake to drop apples, stop before the bees come out
- [ ] ~~Cookie Thief 📐✋ — grab cookies face up, lay the phone face down when the cook turns; haptic cues tell you when it is safe~~ Removed (was Hide & Peek): you can't see the screen while you play, and without the sensor it is just hold and let go.
- [x] Steady Hand 📐 — tilt to keep a marble centred on a tray while wind gusts push it
- [ ] Light Seeker 📷 — find the brightest and darkest spots around you
- [ ] Shape Spotter 📷 — find a real round, square and triangular object
- [ ] Mirror Face 📷 — copy the face shown (smile, wink, open mouth) on the front camera
- [ ] Local Weather Run 📍 — a runner whose weather matches your real local weather
- [x] Step Counter Dash 🚶 — take 20 real steps faster than last time
- [x] Buzz Code ✋ — feel a short/long buzz pattern and pick the match from four
- [ ] ~~Heartbeat Guess ✋ — count the haptic pulses with your eyes closed~~ Removed (was Pulse Count): one-note; Tally Count is the better counting game.
- [ ] Volume Keys Racer 🔊 — steer with the volume buttons (native only)
- [ ] Dark Room 📷 — cover the camera to make the screen dark and find hidden glowing items
- [ ] Hot and Cold 📍 — walk around; the phone says warmer or colder toward a hidden spot nearby
- [x] Two-Thumb Duel ✋ — local two-player on one screen, first to tap on the signal

## Quick-reflex micro games 📱

- [ ] ~~Stop the Clock — stop a stopwatch at exactly 3.00 seconds~~ Removed: a timing test rather than a game.
- [ ] Bigger Number — two numbers flash, tap the bigger one, faster each round
- [x] Colour Word Trap — tap the ink colour, not the word
- [ ] Catch the Coin — tap the coin before it falls off screen
- [ ] Count Taps — tap exactly N times in two seconds
- [ ] Sharp Eye — find the letter hiding in a grid of similar letters
- [ ] Memory Flash — remember positions of lit tiles
- [x] Fast Maths — answer quick sums, true or false
- [x] Line Trace — trace a shape within the margin
- [x] Fly Swatter — swat flies, not bees
- [ ] ~~Balloon Pump — hold to inflate, release before it pops, bigger = more points~~ Removed: Water Rocket has the same pump-until-it-bursts risk and adds flying.
- [ ] Rhythm Copy — tap back a rhythm you just heard
- [ ] Ghost Click — tap shapes as they fade in, before they fade out

## Strategy and sim micro games 📱

- [x] Tiny Tower Defense — build dart, frost and boom towers on pads beside a path; survive five waves
- [x] Lemonade Stand — set cups and price against the forecast, five days
- [x] Ant Colony Path — draw a path for ants from nest to food
- [ ] Garden Grow — water the right plants in time, avoid overwatering
- [ ] ~~Dungeon Door — pick doors with risk/reward to get as deep as possible~~ Removed: pure luck; random picks reached the goal.
- [x] Rock Paper Duel — beat CPU opponents whose habits you read from their history
- [x] Higher or Lower — guess the next card, long shots pay more, cash out any time
- [x] Auction Snipe — bid against bots in a 10-second auction
- [ ] Traffic Grid — set light timings on a 2x2 grid to clear rush hour
- [x] Fire Brigade — route fire trucks to fires on a small town map
- [ ] Shepherd's Fence — place fence pieces to enclose the most sheep
- [ ] Pirate Cannons — angle cannon broadsides against a moving ship
- [x] Town Mayor — swipe left or right on townsfolk requests, keep Food, Gold, Mood and Safety balanced
- [x] Chef Orders — assemble burgers matching orders before customers leave
- [x] Space Mining — send drones to asteroids, balance fuel and cargo

## Physics toys 📱

- [x] Ragdoll Drop — drop a ragdoll down stairs for points
- [x] Jelly Bounce — tap as a jelly squashes into a trampoline to bounce higher and grab stars
- [x] Domino Chain — draw a domino line past every bell, round rocks, with a limited count
- [x] Rubber Band Shot — stretch and fire a rubber band at tins sliding along shelves
- [x] Wrecking Ball — swing a wrecking ball to topple a building in three swings
- [ ] Sand Pour — pour sand to fill a shape exactly
- [ ] Bubble Blower — blow bubbles that carry a seed across a pond
- [x] Magnet Pull — your finger is a magnet; pull a steel ball past spikes into a ring
- [x] Spring Jumper — pogo across rooftops; hold to squeeze the spring for bigger jumps
- [x] Water Rocket — pump and launch a water rocket to a target height

## Colour and Advance era 🌈
Full-colour pocket games in the spirit of the late-90s / early-2000s colour handhelds. They are fluid: the screen grows taller on tall phones and wider on unfolded foldables.
- [x] Sling Smash: slingshot stones at blobs hiding in wood, glass and stone forts
- [x] Critter Quest: walk the grass, battle and catch original critters (three-type triangle)
- [x] Pocket Kart: flat-plane scaling kart racer, 2-lap races on 4 themed tracks against 5 rival drivers, podium wins
- [x] Tide Turn: rock-pool creatures; tap groups of three or more (a wrong tap washes in a row), and every few seconds the tide flips which way they fall
- [x] Sword Rooms: top-down dungeon rooms, sword swings, door opens when cleared
- [x] Hop Quest: side-scrolling platformer with stomps, coins, one-way ledges and a flag
- [x] Star Bloom: vertical shooter with power levels and flagship bosses
- [x] Pocket Tactics: turn-based grid war with infantry, tanks and artillery
- Brick Bounce was rebuilt as a colour game with power-up capsules, silver/gold bricks and lives

### Batch 14: more Advance-era genres
Picked from the genres that defined the big Advance hits: licensed space-knight action, wizard-school adventures, real-time grid battlers, farm life sims, timed-hit RPG battles, falling-pair puzzlers and copy-ability platformers. All mechanics are original and use no names, characters, spells or art from those games.
- [x] Snow Swat: snowball fight; tap a side to swat lobbed snowballs back at the kid who threw them, hold and let go to spin
- [x] Spell School: trace runes (line, bar, V, peak, ring, zig) to cast lessons' spells at pests in the school halls
- [x] Broadside: two pirate decks of planks; hop planks, fire up your column, dodge gunners, mortars and boarders, arm barrel shots
- [x] Pocket Farm: till, plant, water and harvest through seasons; shoo crows and hit each season's cash target
- [x] Riposte: turn-based sword duels on a castle wall; timed flurries and lunges, parry high or low on the tell
- [x] Bookends: falling pairs of books; a run of two or more of one colour clears when books of one other colour stand at both ends of it
- [x] Boomerang Fox: auto-walking fox; jump, throw a boomerang that comes back, beetle charms change how it flies

## Dual-screen and stylus era ideas (for later batches) ✍
Research notes on what made the dual-screen handheld era special, turned into original ideas. Foldables are a natural fit: on an unfolded Fold the two halves can act as the two screens, and on a phone the screen splits top and bottom.
- Two screens: the map or radar on top, the action on the bottom; or a mirror world on the other half.
- Stylus: draw paths, slash, trace shapes, rub to reveal, drag-and-fling.
- Microphone: blow to push sails, put out candles, or spin a pinwheel.
- Touch-only control schemes: tap where you want to walk, draw a line to guide a ball.
- [x] Path Doodle: draw a road for a rolling ball in real time; ink runs out
- [ ] Brain Drills: a set of daily quick-maths and memory drills with an original "mind score"
- [x] Ink Ward: draw lines to bounce blobs into the goal under an ink budget
- [x] Twin Mine: top-screen radar, bottom-screen digging; find gems before the cave-in
- [x] Puzzle Detective: tap clues in a scene, then choose the culprit from the evidence
- [x] Blow Sail: blow into the mic to sail a boat around rocks
- [x] Pet Pocket: feed, wash and play with a pocket pet using rubs and taps
- [x] Kitchen Steps: chop by slashing, stir by circling, flip by flicking (original recipes)
- [x] Stylus Rally: draw racing lines for a kart that follows your ink
- [ ] Rhythm Tap Squad: tap and slide on beat markers as a team of original cheer characters

### Batch 15: best of the Advance and first 3D-console era, rebuilt for touch
Picked from the most loved handheld and 32-bit console genres, choosing ones that map cleanly to taps, holds and swipes. All mechanics are original, with no names, characters or art from those games.
- [x] Net Catch: hold to creep, tap to swing a net at escaped imps that see in cones and tire when they run
- [x] Shadow Ops: top-down stealth with torch cones blocked by walls, pebble lures and a crate to hide under
- [x] Paint Run: into-the-screen runner across a desk; burst walls of your own colour, dodge the others, paint showers recolour you
- [x] Row Call: lanes of toy blocks on a table; hop a lane's front block to the back so the front row matches before it marches off
- [x] Ramp Combo: halfpipe session; tap to pump in the green, swipe tricks in the air, land clean to bank
- [x] Swipe Fighter: one-on-one fighter with jab, heavy, sweep, hop and guard, plus wind-up counters
- [x] Pantry Patrol: dark larder corridor; hold the torch on raccoons until they stare, let go to flash them away, never flash a skunk
- [x] Blitz Bits: four-second micro games back to back that speed up

## Brick-building adventure ideas (next batch) 🧱
Original takes on the toy-brick adventure games: smash scenery into studs, rebuild piles of bricks into useful things, swap characters for abilities. No brand names, minifigures or licensed characters.
- [x] Stud Smash: whack brick-built scenery into studs, pull them in, fill the HERO bar
- [x] Pile Builder: hold bouncing brick piles to build bridges, steps, levers and springs for a walking builder
- [x] Blueprint Stack: drop sliding bricks to fill a blueprint outline
- [x] Tag Team: swap between a wall-smashing bruiser and a double-jumping sprite mid-run
- [x] Kit Racer: pick a car body, smash brick piles your armour can handle, upgrade at pit stops
- [x] Kit Hunt: find hidden kit pieces with a buzzing detector before your hammer swings run out
- [x] Boss Brickfall: build launchers from the bricks a boss robot drops, fire when its core glows
- [x] Build Rush: follow the instruction booklet and tap the right brick from the tray, fast

## Batch 17 (Rob's requests, 2026-11-07)
- [x] Shell Duel: turn-based artillery squads on destructible terrain, three weapons, wind (Console)
- [x] Rex Rampage: dinosaur runner, snap to eat and grow, leap the spikes
- [x] Fossil Dig: brush dirt off a buried skeleton, haptic ticks over bone, the pick cracks it
- [x] Picnic Panic: lane defence on a picnic blanket; free pieces are dealt to a tray, same pieces merge, ants march on the cake (Console)
- [x] Agent Zero: spy shootout from cover with a stun-pulse watch (Console)
- [x] Mind Gym: four 15-second brain drills and a Mind Score
- [x] Blitz Bits 2: sensor microgames (tilt, blow, shake, hush, pour) with touch fallbacks
- [x] Blob Ball: one-on-one slime football against quicker and quicker rivals
- [x] Canopy Run: jungle walk to the rescue chopper with a helper drone (SHIELD, DECOY, DASH, STRIKE tricks), free caged parrots (Next Gen)
- [x] Front Line: WW2 beach assault, dash between cover past the MG sweep, grenade the bunker (Console)

## AR · 3D (camera + gyro, 2026-11-07) 📷

3D games that sit in your real room: the camera picture is the background and the phone's gyro turns the view (kit: `src/kit/ar3d.js`, docs: [ar-3d.md](ar-3d.md)).

- [x] Saucer Swarm 📷 — chrome saucers circle your room and close in; turn to aim, tap to zap
- [x] Bin Flick 📷 — flick paper balls into a bin on your real floor; wind, swishes, the bin moves round you
- [x] Hoop Drone 📷 — a drone flies where you point the phone; thread it through hoops against the clock
- [ ] Desk Pet 📷 — a little creature lives on your floor; throw it snacks, it fetches and does tricks
- [ ] Ghost Lantern 📷 — ghosts hide around you; sweep the phone like a torch to find and trap them
- [ ] Tower Toss 📷 — stack wobbly blocks into a tower on your floor, walk the phone round to check the lean
- [ ] Bubble Garden 📷 — bubbles float up from your floor; pop them in colour order by pointing
- [x] Freeze Rex 📷 — a dinosaur roams your room; snap photos, and hold the phone dead still when it sniffs (gyro motion)
- [x] Table Siege 📷 — defend a tiny castle on your table from toy soldiers; tap to lob boulders, walk round to see behind
- [x] Floor Golf 📷 — six mini golf holes laid out on your floor; pull back from the ball to putt
- [x] Domino Run 📷 — drag a line of dominoes across the floor through every star, then tip them
- [x] Laser Mirrors 📷 — place and turn mirrors on a floor grid to bounce a laser into the crystal
- [x] Treasure Drop 📷📍 — a daily chest lands 100–300 m away; follow the light beam and warmer/colder buzzes, then smash it open in AR

## Next Gen · Console (HD 3D, 2026-11-07) 🎮

Modern HD 3D on `src/kit/hd3d.js` (see [nextgen-3d.md](nextgen-3d.md)).

- [x] Bunker Breakout — corridor shooter against the cartoon Red Bear Guard
- [x] Canopy Run — ranger and helper drone against rogue logger bots; free the caged parrots, reach the chopper
- [x] Gravity Grip — anti-gravity tube racer that drives on the walls and ceiling
- [x] Neon Drift — night street circuit; hold drifts for a multiplier, gates add time, walls kill the combo
- [x] Storm Hook — grapple-swing across a stormy harbour city; hold to hook, let go to fly
- [x] Deep Pressure — sub in a black trench; sonar pings light the cave and buzz back as haptic echoes, but wake the Lurker
- [x] Mech Brawl — two-thumb boxing between giant mechs; dodge glowing swings to open them up
- [x] Frost Line — tilt-to-carve snowboarding ahead of an avalanche, with air tricks
- [x] Canyon Ace — tilt-to-fly jet through a desert canyon; skim the rock for up to x4

## Batches 18-27 (2026-11-10)
Ten batches toward 1000, mostly from the open ideas above (ticked where they were built). New ideas that weren't on the list:
- [x] Belt Sorter 🕹 — swipe parcels between three conveyor belts so each lands in the bin with its shape; the bins swap labels
- [x] Clock Set — drag the clock hands to the time on the card (words, digital or sums)
- [x] Mirror Draw 🖊 — trace a dotted path while your pen moves mirrored
- [x] Till Rush — count out a customer's change from the till, fewest coins for a tip
- [x] Shape Turn — tap the box with the top shape only turned, not mirrored
- [x] Tally Count — count only the sheep the card asks for as the flock runs past
- [x] Plate Spinner — tap wobbling plates on sticks to keep them all spinning
- [x] Lasso Loop — circle your finger over a running calf, let go to drop the loop there
- [x] Yo-Yo Tricks — flick to throw, swipe the trick shown while it sleeps, tap to catch before it stops
- [x] Skip Stone — swipe fast and flat to skim stones; lily pads kick, ducks stop it
- [x] Word Ladder — change one letter at a time to turn a word into the target
- [x] Island Bridges — link numbered islands with single and double bridges that never cross
- [x] Swing Pump 📳 — pump a playground swing higher by pushing the phone (or tapping) as it stops at each end
- [x] Sevens — card game against three robots: build each suit out from its 7, knock when nothing fits
- [x] Castle Lanes — send swords, spears and bows down three lanes; each beats one and loses to another
- [x] Bee Keeper — share bees between foraging, building comb and guarding against wasp raids
- [x] Ferry Crossing — river-crossing logic puzzles with a small boat and a different rule each river
- [x] Canal Dig — dig tunnels through falling-sand earth so a water tank drains into buried flower pots
- [x] Bumper Bowl — bumper cars on a round table with no rails: ram the others off and stay on
- [x] Fuse Pass — pass a fizzing party cake round the table before it pops in your hands
- [x] Lighthouse Watch — swing the beam over a dark sea so homecoming boats can see and dodge the rocks
- [x] Ghost Torch 📷 — hold drifting ghosts in your torch circle around the room until they pop
- [x] Star Join 📷 — find numbered stars in the sky around you and join them in order to draw constellations
- [x] Bubble Garden 📷🎤 — blow bubbles (mic or button) onto flower buds on your floor to make them bloom
- [x] Echo Drums 📷 — five drums stand round you: listen, then turn and play their rhythm back

## Board (3D + AR, 2026-11-11) ♟
Games you play on a board, on a table in a 3D room or on your own floor in AR (`era: 'board'`, `gs.tabletop`, [board-games.md](board-games.md)). They may run longer than three minutes and keep your game between visits.
- [x] Living Chess — chess against five levels of opponent; the pieces have eyes and crumble when taken
- [x] Snakes & Ladders — the race to the last square with real dice: throw two and pick which to use
- [x] Mancala — sow glass stones round a carved board; go again in your store, capture opposite
- [x] Tavern Dice — Ten Thousand with six real dice: keep scoring dice, bank or risk the lot
- [x] King's Table — tafl on the small board: get the king to a corner before the raiders trap him
- [x] Tower Four — four in a row on sixteen pegs, in three dimensions
- [x] Carrom — flick the striker to sink your discs and the queen
- [x] Tile Isles — lay six-sided tiles to grow an island; each land scores by its neighbours
- [x] Liar's Lantern — one villager at the table always lies: hear a few out and name the Trickster
- [x] Gloomwick Hall — turn over the rooms of an old house, find three relics and beat the ghost to the door
- [ ] Draughts — jump to capture, crown at the far row
- [ ] Nine Men's Morris — place, slide and fly to make mills of three
- [ ] Backgammon Dash — bear off first with real dice, on a short board
- [ ] Go Nine — surround territory on the 9 x 9 board
- [ ] Ludo Garden — four colours race home, capture sends a piece back
- [ ] Domino Chain — match ends to empty your hand first
- [ ] Hex Bridge — join your two sides of a hex board before your rival joins theirs
- [ ] Fox and Geese — one fox against a flock on a cross-shaped board
