# Game review

## 2026-11-15: second pass (259 games)

Every game was played by a bot that tries lazy tricks (tap the middle, mash one spot, hold still, circle a finger, swipe back and forth, swipe up) for up to three minutes of game time, photographed mid-play, and compared with its nearest games (`scripts/unique.mjs`). Games other threads were fixing at the time were left out (wrecking-ball, slide-ten, merge-ten, tank-duel, critter-quest, pocket-kart, sling-smash).

**Rob's decision (2026-11-15): remove eight; keep and refresh fast-maths, rope-swing, tile-tap and sky-defense.**

| Game | Why it was removed |
|---|---|
| Stop the Clock (`stop-clock`) | A timing test rather than a game. |
| Pulse Count (`pulse-count`) | Count the buzzes: one-note, and Tally Count is the better counting game. |
| Hide & Peek (`hide-peek`) | You can't see the screen while you play; without the sensor it is just hold and let go. |
| Dungeon Door (`dungeon-door`) | Pick one of three doors: pure luck, and random picks reached the goal. |
| Traffic Light (`traffic-light`) | Flipping the light every half second won without watching the queues. |
| Balloon Rise (`balloon-rise`) | Holding one finger still above the balloon won. |
| Balloon Pump (`balloon-pump`) | The same pump-until-it-bursts risk as Water Rocket, which adds flying. |
| Shout Rocket (`shout-rocket`) | A near-twin of Whistle Bird (voice throttle through rings), and shouting at a phone is awkward in public. |

Found on the way, to fix rather than remove: juggle-kick (mashing the middle wins), skate-ollie (swiping left and right wins), gap-drop (circling a finger wins), whistle-bird (green pipes and a small bird read as one famous game), and a space key on desktop that plays the right move for you in chef-orders, code-breaker, haptic-morse, gem-slide, lemonade-stand, bowling-swipe, frog-tongue, juggle-kick and blow-candles.

## 2026-11-11: whole-catalogue review (244 games)

Every game file was checked again: the code or its design notes, a mid-play screenshot, the idle and random-tap bots (`npm run qa`), a 20-second no-touch run and the goal-reaching bot (`scripts/playtest.cjs`). These are Claude's judgement, not player data; Rob's in-app ratings (👎 Meh / ♥) overrule them.

**Rob's decision (2026-11-11): remove the nine, rework the thirteen.** Both are done in this pass, which leaves 235 games.

- **Keep:** 221 games (121 of them changed in this pass, see below).
- **Removed:** 9 (eight weak games and one duplicate).
- **Reworked:** 13. Good games, but each followed one well-known game's rules and look closely enough to break the "original, not a recreation" rule. Each is now a new game with its own rules, look and name.
- **Hidden already:** ar-lab (the AR test scene, on the BENCHED list).

### Removed (9)

| Game | Why |
|---|---|
| Colour Hunt (`color-hunt`) | Needs the camera and a walk round the room, and a matching colour is easy to fake or impossible to find. The no-camera version is a different, weaker game. |
| Shake Dice (`shake-dice`) | Dice luck against "the house" with one choice (roll or bank). Shake Tree does push-your-luck better and without the casino feel. |
| Shake Soda (`shake-soda`) | One four-second gag: shake, then wait. Nothing to learn on a second go. |
| Swipe the Arrow (`swipe-arrow`) | A bare reflex test. Random swipes end a round in half a second, and several other games use swipes with more to them. |
| Tap on Green (`tap-green`) | A reaction-time test rather than a game. Thumb Duel is the same idea with fake-outs, a rival and two-player. |
| Bubble Level (`bubble-level`) | The thinnest of the tilt games (Tilt Maze, Steady Hand, Marble Trio all do more), and it scored with no touch. |
| Compass Hunt (`compass-hunt`) | You have to turn your whole body. Awkward on a sofa or a bus, and with no compass it is just dragging a dot to the middle. |
| Lane Racer (`lane-racer`) | The most basic game in the app (2.7 KB): four lanes, dodge. Road Hopper, Ski Slalom, Kit Racer and Pocket Kart cover it. |
| Lamp Flip (`lamp-flip`) | Same lights-out puzzle as Street Lamps, which has the daily shared-with-your-neighbourhood twist. Keep one. |

On the 2026-11-06 shortlist but kept now: higher-lower, shout-rocket, safe-cracker, haptic-morse (Buzz Code) and penalty-keeper. Each was fixed or turned out to work without the sensor it leans on.

### Reworked: too close to one existing game (13)

The rule (AGENTS.md): genres and mechanics are fine; recreating a specific existing game (its characters, rules or look, even renamed) is not. Each of these had its own art and names, but the set of rules taken together pointed at one game. Each was redesigned from the rules up and renamed; the old files are gone. What carries over is the genre and, where it was our own work, the scene code.

| Was | Too close to | What gave it away | Now |
|---|---|---|---|
| Copy Puff (`copy-puff`) | the pink puff platformers | A round puff that floats by flapping, sucks in enemies and copies their power. | **Boomerang Fox** (`boomerang-fox`): a fox that jumps and throws a boomerang that has to come back before the next throw. Beetle charms change how it flies (wide, fire, twin). Points come from hits, stomps and acorns, not distance. |
| Garden Guard (`garden-guard`) | the lawn defence game with plants | Falling dew to collect, seed cards, a resource flower, a shooter, a wall and a bomb, with the house on the left. | **Picnic Panic** (`picnic-panic`): no currency. Free pieces are dealt to a tray of three; two of the same kind and level merge; placed pieces can be picked up and moved. Lemon squirters, jam catapults, bread walls and fans against ants marching on the cake. |
| Crate Dash (`crate-dash`) | the orange marsupial crate platformers | A jungle path into the screen, spin through wooden, explosive and bouncy crates, 100 gems for a life. | **Paint Run** (`paint-run`): a runner across a desk where you are one of three colours. Walls of your colour burst for points, other colours hurt, and paint showers change your colour. |
| Cube Tide (`cube-tide`) | the 1997 rolling-cube puzzle game | Cubes roll down a floating floor, mark and trigger a tile to sink them, never sink a black one. | **Row Call** (`row-call`): four lanes of toy blocks on a table. Tap a lane to hop its front block to the back; when the timer runs out the front row marches off and scores if the blocks match. |
| Saber Knight (`saber-knight`) | the space-knight film series | A robed knight with a glowing blade knocking blaster bolts back, and a "push" power. | **Snow Swat** (`snow-swat`): a snowball fight at dusk. Kids pop up and lob snowballs in arcs; a late swat sends one back at the thrower, giant rolling snowballs need a swat of their own, and a spin leaves you dizzy. |
| Grid Duel (`grid-duel`) | the net-battler handheld RPG series | A 6x3 grid split blue and red, a buster down your row, battle chips loading into a tray. | **Broadside** (`broadside`): two ships seen from above. Hop between your planks, fire up your column, and read three kinds of enemy crew (gunners, mortars, boarders). Barrels arm one special shot. |
| Timing Brawl (`timing-brawl`) | the paper plumber RPG battles | Turn-based fights with a timed JUMP and a hold-and-release hammer, spiky foes and flying foes. | **Riposte** (`riposte`): sword duels on a castle wall. A flurry of three timed taps or one pendulum lunge; the foe's cut comes high or low with a tell and you parry the right half. Shield guards, acrobats and a feinting captain. |
| Suit Ops (`suit-ops`) | the nanosuit shooter | A power suit with ARMOR, CLOAK, SPEED and POWER modes on one energy bar, on a jungle island. | **Canopy Run** (`canopy-run`): a ranger and a helper drone against rogue logger bots. Four drone tricks, each on its own recharge (a shield dome that stays put, a decoy, a dash, a strike), caged parrots to free on the way, no suit, no energy bar, no cloak. |
| Egg Catcher (`egg-catcher`) | the 1981 LCD egg handheld | Four hens, four ramps, a catcher moved between four corners, three broken eggs. | **Egg Box** (`egg-box`): slide a five-cup egg box under two hens. An egg only fits an empty cup, a full box ships for a bonus, and a crow drops pebbles you must not catch. |
| Germ Buster (`germ-buster`) | the capsule-and-virus puzzle game | Two-tone capsules dropped onto germs in a bottle, four in a line clears. | **Key Drop** (`key-drop`): locked crates rise from the bottom of a well. Drop a shape key down a column: it opens every matching crate it meets in a chain, and a wrong key jams the column. |
| Blob Pairs (`blob-pairs`) | the falling-blob-pairs puzzle series | Pairs of blobs, four touching pop, chains, grey junk blobs. | **Bookends** (`bookends`): falling pairs of books in a bookcase. Nothing clears by touching: a run of two or more of one colour clears only when books of one other colour stand at both ends of it. |
| Panel Rise (`panel-rise`) | the rising-panel swap puzzle series | A rising stack, swap two side by side, clears of three, chain bonuses. | **Tide Turn** (`tide-turn`): a rock pool of creatures. Tap groups of three or more to clear them (a tap on a smaller group washes in a row); every few seconds the tide turns, gravity flips and a new row washes in from the other end. |
| Mansion Night (`mansion-night`) | the mansion survival-horror series | A dark mansion, a six-shot pistol, green herbs, a knife, head shots. Also the grimmest game in a family app. | **Pantry Patrol** (`pantry-patrol`): raccoons raid a larder at night. They freeze in the torch beam; hold it on one until it stares, then let go to flash it away. Never flash a skunk. Nothing is shot. |

All thirteen pass the game lint, the random-play, streamed-play, fold and speed checks, and none ends or scores without a touch.

Genre-level only, fine to keep: shell-duel (turn-based artillery), sling-smash (slingshot physics), critter-quest (monster-collecting RPG), stud-smash, pile-builder and the other brick games (toy bricks), gap-drop (rotating floors), bricks (brick breaker), blob-ball, pocket-kart, bunker-breakout (corridor shooter), pin-pull. sword-rooms had a green cap and tunic on its hero; it is now blue.

### Changes made in this pass (121 games, plus the 13 reworks)

- **Shared effects (100 older games).** Games written before `gs.effects.Feel` each had their own particle list, or none. They now use Feel for bursts, pop-up numbers and shake (with the game's own sounds kept), so hits, clears and losses look and feel the same everywhere, follow the player's Reduce motion setting, and finish playing behind the game-over screen (`fx(dt)`).
- **Wait for the first touch (60 games).** `gs.rounds.Ready`: nothing moves, scores or ends until the player touches the screen. Before this pass 17 games ended by themselves within six seconds of Play and 25 scored points with no touch. In a 20-second no-touch run of every game now, the only keepers that still end or score are ones where that is the design: races that start on a countdown (gravity-grip, neon-drift), bunker-breakout (auto-fire), freeze-rex (holding still is the game) and two puzzles whose timer is about 20 seconds (hand-sort, spinner-keep).
- **Score badge.** fossil-dig, hop-quest, rex-rampage, star-bloom and hoop-drone size or place their HUD from `api.scoreArea()`; fast-maths and mole-mallet moved their lives out from under the badge.
- **Game time, not the wall clock.** blitz-bits, blob-ball, fossil-dig, deep-pressure and street-lamps used `performance.now()` or `setTimeout` for game timing, which keeps running while the game is paused. They use `dt` now. (Tap-versus-hold timing in the 3D games and the daily clock in treasure-drop are real time on purpose and were left.)
- **Same speed on 60 and 120 Hz screens.** Per-frame damping (`v *= .98`) became `Math.pow(.98, dt * 60)` in blitz-sense, blow-sail, fly-swatter, gravity-grip, pet-pocket, shell-duel, stud-smash, stylus-rally and wrecking-ball; camera easing in canyon-ace, deep-pressure, frost-line and storm-hook.
- **Goals the bot reached in seconds.** dart-wheel 25 to 60, merge-ten 150 to 500, mini-golf 12 to 25, moto-hills 120 to 350, rope-swing 200 to 1000, freeze-rex 500 to 1200 (plus a 1.5 s wind-on between photos).
- **Bugs.** bricks: the ball could speed up without limit off the paddle. street-lamps: a failed location request could leave it waiting for ever. pocket-pinball: each finger now works its own flipper. fishing-line: a smooth gradient broke the four-shade Pocket rule. critter-quest: the battle strobe follows Reduce motion. spot-difference: the pictures stay covered until you start, so the clock is fair. Several games kept a little state from the last round (held keys, a drag in progress); all round state is set in `reset()` now.
- **Reading the bot report.** In [auto-report.md](auto-report.md), `dies-instantly-idle` on ink-ward and path-doodle is the physics library arriving (the app makes the game again once it is in), not a round ending: a 20-second no-touch run ends neither. The flag moves between the physics games from run to run (dummy-tumble had it in the last report).

### Games added since the first review (102)

| Game | Style · genre | Verdict | Notes |
|---|---|---|---|
| Ant Trail (`ant-trail`) | Color · Colony | Keep | Draw a scent trail for the ants. Fresh idea, reads at once. |
| AR Lab (`ar-lab`) | AR · Test | Hidden | Not a game: the AR test scene. Already hidden from the feed (BENCHED). |
| Archery Wind (`archery-wind`) | Casual · Aim | Keep | Wind and drop make every arrow a small decision. |
| Arrow Maze (`arrow-maze`) | Pocket · Puzzle | Keep | Plan, press GO, watch. Good puzzle for short bursts. |
| Auction Snipe (`auction-snipe`) | Casual · Trading | Keep | Bidding against three bots. Unlike anything else in the feed. |
| Balance Scale (`balance-scale`) | Casual · Logic | Keep | Lever maths as a drag puzzle. Clear. |
| Balloon Archer (`balloon-archer`) | Pocket · Aim | Keep | Line up two balloons per arrow to win arrows back. |
| Bee Keeper (`bee-keeper`) | Pocket · Sim | Keep | Slow three-slider sim. The least feed-like of the batch, but it works. |
| Belt Sorter (`belt-sorter`) | Pocket · Sorting | Keep, fixed | Three-belt sorting with labels that swap. Fixed: the belts wait for your first touch. |
| Bin Flick (`bin-flick`) | AR · Sports | Keep | AR paper toss with wind. Drag works when there is no camera. |
| Blow Sail (`blow-sail`) | Casual · Mic | Keep, fixed | Mic sailing with a hold fallback. Fixed: the storm waits for your first touch (an untouched round ended in 7 seconds), and a rock hit slowed the boat more on fast screens. |
| Bubble Garden (`bubble-garden`) | AR · Gentle | Keep | Gentle AR mic game with a button fallback. |
| Bumper Bowl (`bumper-bowl`) | Console · Party | Keep | Sumo bumper cars. Fun straight away. |
| Bunker Breakout (`bunker-breakout`) | Next Gen · Shooter | Keep | The first Next Gen game and the biggest in the app. Made-up cartoon army. |
| Buzz Wire (`buzz-wire`) | Casual · Skill | Keep | The steady-hand fairground game. Fair. |
| Canal Dig (`canal-dig`) | Advance · Physics | Keep | Dig-and-flow water puzzle. One of the best of the newer games. |
| Canyon Ace (`canyon-ace`) | Next Gen · Flying | Keep, fixed | Fixed: the jet waits for your first touch (it flew and scored by itself) and sets level tilt from how you are holding the phone then. Camera easing no longer depends on frame rate. |
| Castle Lanes (`castle-lanes`) | Casual · Strategy | Keep | Three-lane rock-paper-scissors battler. |
| Clock Set (`clock-set`) | Casual · Brain | Keep | Set the clock from words. Good brain game. |
| Cup Shuffle (`cup-shuffle`) | Color · Eye | Keep | The shell game. Simple and honest. |
| Deep Pressure (`deep-pressure`) | Next Gen · Survival | Keep, fixed | Sonar and haptic echoes: a standout. Fixed: waits for your first touch (it scored by itself); camera easing no longer depends on frame rate. |
| Domino Run (`domino-run`) | AR · Puzzle | Keep | AR domino line drawing. |
| Door Committee (`door-committee`) | Next Gen · Puzzle | Keep | Comedy puzzle walk. Long for the feed, by design. |
| Dummy Tumble (`dummy-tumble`) | stairs | Keep | Ragdoll down the stairs, three flings. |
| Echo Drums (`echo-drums`) | AR · Memory | Keep | AR memory rhythm on a ring of drums. |
| Ferry Crossing (`ferry-crossing`) | Color · Logic | Keep | River-crossing riddles with a new rule each river. |
| Fire Brigade (`fire-brigade`) | Advance · Strategy | Keep | Tap-to-send town strategy. |
| Floor Golf (`floor-golf`) | AR · Sports | Keep | AR mini golf, six holes. |
| Freeze Rex (`freeze-rex`) | AR · Stealth | Keep, fixed | Fixed: mashing the shutter reached the goal in 4 seconds. The camera now winds on for 1.5 s between photos (shown on the button) and the goal is 1200. |
| Frost Line (`frost-line`) | Next Gen · Sports | Keep, fixed | Fixed: rider and avalanche wait for your first touch (it scored by itself), level tilt is set then; camera easing no longer depends on frame rate. |
| Fuse Pass (`fuse-pass`) | Console · Party | Keep | Hot-potato party game. |
| Gap Drop (`gap-drop`) | Casual · Drop | Keep | Turn the floors so the ball drops. A 2D take on a well-known hypercasual rule set (genre level, not a copy of its look). |
| Gear Train (`gear-train`) | Casual · Puzzle | Keep | Which way does the last gear turn? Clever. |
| Ghost Torch (`ghost-torch`) | AR · Spooky | Keep | AR torch sweep. |
| Gravity Grip (`gravity-grip`) | Next Gen · Racing | Keep, fixed | Tube racer. Fixed: cars that touch slowed more on fast screens. |
| Hammer Bell (`hammer-bell`) | Pocket · Timing | Keep | Strength tester with a target band. |
| Hand Sort (`hand-sort`) | Casual · Cards | Keep | Card sorting against the sand timer. |
| Hex Merge (`hex-merge`) | Casual · Merge | Keep | Hex merge-three with a held tile. |
| Hoop Drone (`hoop-drone`) | AR · Flying | Keep, fixed | Fixed: the clock waits for your first touch (the drone drifted through the first hoop by itself), and the timer bar moved out from under the score badge. |
| Ink Ward (`ink-ward`) | spike | Keep, fixed | Draw springy lines to bounce blobs into the jar. Fixed: the spout waits for your first line. |
| Island Bridges (`island-bridges`) | Color · Logic | Keep | The bridges pencil puzzle. |
| Jigsaw Six (`jigsaw-six`) | Casual · Puzzle | Keep | Jigsaws painted in code. |
| Jug Pour (`jug-pour`) | Casual · Logic | Keep | Measure with unmarked jugs. |
| Kitchen Steps (`kitchen-steps`) | Casual · Cooking | Keep | Cooking with five gestures. |
| Kite Flyer (`kite-flyer`) | Pocket · Skill | Keep, fixed | Fixed: waits for your first hold (it scored by itself in the wind band). |
| Knight Path (`knight-path`) | Pocket · Logic | Keep | Knight's-move puzzle. |
| Ladder Climber (`ladder-climber`) | Pocket · Reflex | Keep, fixed | Fixed: the flood waits for your first grab (an untouched round ended in 5 seconds). |
| Lamp Flip (`lamp-flip`) | Pocket · Logic | ✂ Removed | Same lights-out puzzle as Street Lamps, which has the daily shared-with-your-neighbourhood twist. Keep one. |
| Lantern Maze (`lantern-maze`) | Pocket · Maze | Keep | Flare, remember, walk. |
| Laser Dodge (`laser-dodge`) | Pocket · Dodge | Keep | Lasers warn before they fire. Fair. |
| Laser Lock (`laser-lock`) | Advance · Puzzle | Keep | Geared rings puzzle. |
| Laser Mirrors (`laser-mirrors`) | AR · Puzzle | Keep | AR mirror puzzle on the floor. |
| Lasso Loop (`lasso-loop`) | Advance · Ranch | Keep | Circle faster for a wider loop: a new kind of touch control. |
| Lighthouse Watch (`lighthouse-watch`) | Next Gen · Strategy | Keep | Sweep the beam so boats see the rocks. Calm strategy. |
| Long Shadow (`long-shadow`) | Next Gen · Sniper | Keep | Belongs to the Long Shadow thread, which is still working on it. Not reviewed or edited here. |
| Maraca Beat (`maraca-beat`) | Color · Rhythm | Keep | Shake rhythm with a tap fallback. |
| Marble Trio (`marble-trio`) | Casual · Tilt | Keep | Three marbles, three holes. The best of the tilt games. |
| Mech Brawl (`mech-brawl`) | Next Gen · Fighting | Keep | Readable tells and it looks great. |
| Mini Sudoku (`mini-sudoku`) | Color · Logic | Keep | 4x4 sudoku sprints. |
| Mirror Draw (`mirror-draw`) | Color · Brain | Keep | Mirrored tracing. Funny and hard. |
| Neon Drift (`neon-drift`) | Next Gen · Racing | Keep | Drift for points, bank them cleanly. Strong. |
| One Line (`one-line`) | Color · Puzzle | Keep | One-stroke line puzzles. |
| Paper Plane (`paper-plane`) | Casual · Glide | Keep | Glide, dive, ride the warm air. |
| Parcel Dash (`parcel-dash`) | Next Gen · Driving | Keep | City delivery with real traffic and people. |
| Path Doodle (`path-doodle`) | rock | Keep | Draw the ground under a rolling ball. |
| Penalty Striker (`penalty-striker`) | Casual · Sport | Keep | Swipe to aim and bend the shot. |
| Penguin Slide (`penguin-slide`) | Pocket · Slide | Keep, fixed | Fixed: waits for your first touch (it scored by itself on distance). |
| Pet Pocket (`pet-pocket`) | Color · Pet | Keep, fixed | Fixed: the needs only start dropping at your first touch (it earned hearts untouched); the ball and pet slow the same on fast screens. |
| Pin Pull (`pin-pull`) | Casual · Puzzle | Keep | Pull the pins in the right order. A familiar puzzle type, own look. |
| Ping Pong Rally (`ping-pong-rally`) | Casual · Sport | Keep | Top-down table tennis with slice. |
| Plate Spinner (`plate-spinner`) | Casual · Juggle | Keep | Keep the plates spinning. |
| Popcorn Pan (`popcorn-pan`) | Color · Cooking | Keep | Heat and shake without scorching. |
| Pulse Count (`pulse-count`) | Pocket · Feel | Keep | Count the buzzes. Flashes instead where the phone cannot buzz. |
| Puzzle Detective (`puzzle-detective`) | Color · Mystery | Keep | Find the clues, pick the suspect. |
| Rail Connect (`rail-connect`) | Color · Trains | Keep | Lay track before the train leaves. |
| Rift Keeper (`rift-keeper`) | AR · Arcade | Keep | See-through portals round your room. The best AR game. |
| Saucer Swarm (`saucer-swarm`) | AR · Shooter | Keep | AR saucer shooter. |
| Sevens (`sevens-cards`) | Casual · Cards | Keep | The card game Sevens against three bots. |
| Shake Tree (`shake-tree`) | Advance · Luck | Keep | Push-your-luck with bees. The better shake game. |
| Shape Fit (`shape-fit`) | Color · Puzzle | Keep | Fill the outline with the pieces. |
| Shape Turn (`shape-turn`) | Pocket · Brain | Keep | Spot the turned (not mirrored) shape. |
| Skip Stone (`skip-stone`) | Color · Throw | Keep | Swipe to skim stones. |
| Slide Picture (`slide-picture`) | Color · Puzzle | Keep | Sliding picture puzzle. |
| Slide Ten (`slide-ten`) | Pocket · Merge | Keep | Slide and add to ten. |
| Space Mining (`space-mining`) | Casual · Strategy | Keep | Send drones, mind the fuel. |
| Spinner Keep (`spinner-keep`) | Pocket · Touch | Keep | Keep the spinner inside the band. |
| Sprint Feet (`sprint-feet`) | Advance · Sport | Keep | Left-right sprint, with real steps if the phone counts them. |
| Star Join (`star-join`) | AR · Puzzle | Keep | AR dot-to-dot constellations. |
| Storm Hook (`storm-hook`) | Next Gen · Action | Keep, fixed | Fixed: the hero waits for your first hold (it scored by itself); camera easing no longer depends on frame rate. |
| Stylus Rally (`stylus-rally`) | Advance · Racing | Keep, fixed | Draw the racing line. Fixed: the car and the clock wait for your first line (it drove and scored by itself). |
| Swing Pump (`swing-pump`) | Casual · Motion | Keep | Pump the swing at the right moment. |
| Table Siege (`table-siege`) | AR · Strategy | Keep | AR castle defence on the table. |
| Tally Count (`tally-count`) | Pocket · Brain | Keep | Count only the sheep the card asks for. |
| Thumb Duel (`thumb-duel`) | Casual · Party | Keep | Quick draw for two on one phone, with fake-outs. |
| Till Rush (`till-rush`) | Advance · Shop | Keep | Count out the change. |
| Trampoline Tricks (`trampoline-tricks`) | Casual · Timing | Keep | Tuck to spin, open to land. |
| Treasure Drop (`treasure-drop`) | AR · Explore · Local | Keep | A daily real-world treasure walk. |
| Twin Mine (`twin-mine`) | Advance · Digging | Keep | Radar on top, digging below. |
| Whistle Bird (`whistle-bird`) | Casual · Voice | Keep | Fly by the pitch of your voice. Drag fallback. |
| Word Ladder (`word-ladder`) | Casual · Words | Keep | Change one letter at a time. |
| Word Wheel (`word-wheel`) | Casual · Words | Keep | Spell words round a wheel. |
| Yo-Yo Tricks (`yoyo-tricks`) | Pocket · Tricks | Keep | Throw, trick, catch before it runs down. |

## First review: scores (2026-11-06)

Every game scored 1-5 on five things, out of 25. Scored on 2026-11-06 from the code, a mid-play screenshot and the bot play test in [auto-report.md](auto-report.md). These are Claude's judgement, not player data. Rob's in-app ratings (👎 Meh / ♥, see the QA panel) should overrule them.

- **Fun**: is it enjoyable for a few rounds?
- **Clarity**: can you play it from the one-line hint?
- **Controls**: do touch controls feel right, and does it work without special sensors?
- **Length**: does a round last a good feed-sized time (about 20s to 2 min)?
- **Uniqueness**: is it unlike the other games in the app?

Sorted weakest first. Marks are as of 2026-11-11: ✂ = removed, ⚠ = too close to one existing game, since reworked under a new name.

| # | Game | Fun | Clarity | Controls | Length | Unique | Total | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | ✂ bubble-level | 2 | 3 | 3 | 3 | 2 | **13** | Third tilt-the-marble game next to Tilt Maze and Steady Hand, and the weakest. |
| 2 | ✂ shake-soda | 2 | 3 | 3 | 2 | 3 | **13** | Shake then wait. Thin, and similar to Water Rocket's build-to-the-limit. |
| 3 | ✂ color-hunt | 2 | 3 | 2 | 2 | 5 | **14** | Needs the camera and walking round the room. Breaks the scroll rhythm. |
| 4 | ✂ compass-hunt | 2 | 3 | 2 | 3 | 4 | **14** | You have to turn your whole body. Awkward on a sofa or bus, and does nothing without a compass. |
| 5 | safe-cracker | 2 | 3 | 3 | 2 | 4 | **14** | Off the shortlist: the right number also glows on the dial, so it plays without haptics. |
| 6 | ✂ shake-dice | 2 | 3 | 4 | 3 | 2 | **14** | Pig dice with a shake. Little choice, and a dupe of Balloon Pump's push-your-luck. |
| 7 | shout-rocket | 2 | 4 | 2 | 3 | 3 | **14** | Off the shortlist after this pass: waits for your first shout or hold. Still the weakest mic game. |
| 8 | ✂ swipe-arrow | 2 | 4 | 4 | 2 | 2 | **14** | Generic hypercasual reflex test with little to learn. |
| 9 | penalty-keeper | 2 | 3 | 4 | 3 | 3 | **15** | Reworked 2026-11-06 at Rob's request; now waits for your first touch. |
| 10 | blow-candles | 3 | 4 | 3 | 2 | 4 | **16** | Fun once, but needs the mic and runs short. |
| 11 | clap-beat | 3 | 3 | 3 | 3 | 4 | **16** | Mic clapping is novel but unreliable in noisy rooms; tap fallback is fine. |
| 12 | haptic-morse | 2 | 3 | 4 | 3 | 4 | **16** | Off the shortlist: flashes the screen where the phone cannot buzz. |
| 13 | higher-lower | 2 | 4 | 5 | 3 | 2 | **16** | Off the shortlist after this pass (shared effects, clearer feedback). Still the weakest push-your-luck game. |
| 14 | hoop-flick | 3 | 4 | 4 | 2 | 3 | **16** | One miss ends it; short sessions. |
| 15 | jelly-bounce | 3 | 3 | 3 | 3 | 4 | **16** | Timing window is hard to read. |
| 16 | magnet-pull | 3 | 3 | 3 | 3 | 4 | **16** | Floaty; looks sparse on screen. |
| 17 | space-dock | 3 | 3 | 3 | 3 | 4 | **16** | Inverted thrust is confusing, but some will love it. |
| 18 | steady-hand | 3 | 4 | 3 | 3 | 3 | **16** | Tilt balance; overlaps Tilt Maze. |
| 19 | ✂ tap-green | 2 | 5 | 5 | 2 | 2 | **16** | A reaction-time test, not really a game. |
| 20 | tilt-maze | 3 | 4 | 3 | 3 | 3 | **16** | Fine tilt maze with drag fallback. |
| 21 | water-rocket | 3 | 3 | 3 | 3 | 4 | **16** | Two-phase game; pressure step drags. |
| 22 | domino-chain | 3 | 3 | 3 | 3 | 5 | **17** | Clever, but the draw-a-path rule takes a couple of tries to understand. |
| 23 | hide-peek | 3 | 3 | 3 | 3 | 5 | **17** | Face-down phone trick is unique but confusing at first. |
| 24 | ✂ lane-racer | 2 | 5 | 5 | 3 | 2 | **17** | Very basic four-lane dodge. Road Hopper and Ski Slalom do this better. |
| 25 | mine-cart | 3 | 3 | 4 | 3 | 4 | **17** | Switch rule takes a moment; the first few seconds are risk-free. |
| 26 | quiet-ninja | 3 | 3 | 3 | 3 | 5 | **17** | Original idea; the mic makes it unfair in a noisy room. |
| 27 | rock-blaster | 3 | 4 | 4 | 3 | 3 | **17** | OK; overlaps with Sky Defense. |
| 28 | rope-swing | 3 | 4 | 4 | 3 | 3 | **17** | Mashing works too well; looks sparse. |
| 29 | spring-jumper | 3 | 4 | 4 | 2 | 4 | **17** | Rounds are short and the gap read is hard. |
| 30 | tilt-pour | 3 | 4 | 3 | 3 | 4 | **17** | Cute pouring; tilt is fiddly. |
| 31 | bottle-flip | 3 | 4 | 4 | 3 | 4 | **18** | Satisfying flick, thin over time. |
| 32 | code-breaker | 3 | 4 | 4 | 4 | 3 | **18** | Good logic puzzle but slow for a scroll feed. |
| 33 | colour-flood | 3 | 4 | 5 | 3 | 3 | **18** | Fine, quiet puzzle. |
| 34 | colour-word | 3 | 4 | 5 | 2 | 4 | **18** | Sharp brain teaser, but one wrong tap ends it in seconds. |
| 35 | ⚠ egg-catcher | 3 | 4 | 4 | 4 | 3 | **18** | Handheld classic, simple and fair. Too close to one existing game; reworked on 2026-11-11 as Egg Box (`egg-box`). |
| 36 | fast-maths | 3 | 5 | 5 | 2 | 3 | **18** | Quick and clear. Fine as feed filler. |
| 37 | ⚠ germ-buster | 4 | 4 | 3 | 4 | 3 | **18** | Falling-capsule puzzle; swipe controls take a minute. Too close to one existing game; reworked on 2026-11-11 as Key Drop (`key-drop`). |
| 38 | lemonade-stand | 3 | 4 | 4 | 3 | 4 | **18** | Light strategy; good change of pace. |
| 39 | mirror-beam | 3 | 4 | 5 | 3 | 3 | **18** | Fine; overlaps a little with Pipe Plumber. |
| 40 | moto-hills | 4 | 3 | 3 | 4 | 4 | **18** | Good, but lean-in-air is hard to learn. |
| 41 | rock-paper | 3 | 3 | 5 | 3 | 4 | **18** | Clever pattern-reading, but slow to click. |
| 42 | skate-ollie | 4 | 4 | 3 | 3 | 4 | **18** | Tricks are fun; first obstacle comes quickly. |
| 43 | ski-slalom | 4 | 4 | 4 | 3 | 3 | **18** | Good. |
| 44 | street-lamps | 3 | 4 | 5 | 3 | 3 | **18** | Lights-out puzzle. The GPS twist is invisible to the player. |
| 45 | tile-tap | 3 | 5 | 5 | 2 | 3 | **18** | Piano-tiles style; short rounds. |
| 46 | balloon-pump | 4 | 4 | 5 | 3 | 3 | **19** | Best of the three push-your-luck games. Keep this one. |
| 47 | balloon-rise | 4 | 4 | 4 | 3 | 4 | **19** | Good shove-the-blocks physics. |
| 48 | bomb-maze | 4 | 4 | 3 | 4 | 4 | **19** | Solid bomb maze; drag-to-walk is a bit fiddly. |
| 49 | bomb-sweeper | 4 | 4 | 4 | 3 | 4 | **19** | Classic logic. Random taps die fast, as they should. |
| 50 | bubble-pop | 4 | 4 | 4 | 4 | 3 | **19** | Bubble shooter done well. |
| 51 | candy-swing | 4 | 4 | 4 | 3 | 4 | **19** | Rope-cut physics puzzle; good when the cut lands. |
| 52 | crate-pusher | 4 | 4 | 4 | 4 | 3 | **19** | Box-push puzzle, good rooms. |
| 53 | fishing-line | 4 | 4 | 4 | 3 | 4 | **19** | Nice hold-and-release timing. |
| 54 | fly-swatter | 3 | 5 | 5 | 3 | 3 | **19** | Simple tap fun. |
| 55 | frog-tongue | 4 | 4 | 4 | 3 | 4 | **19** | Lead-the-target aim is satisfying. |
| 56 | link-pairs | 3 | 4 | 5 | 4 | 3 | **19** | Solid tile match. |
| 57 | liquid-mixer | 3 | 4 | 4 | 3 | 5 | **19** | Colour mixing is fresh; 75% threshold feels harsh. |
| 58 | mole-mallet | 3 | 5 | 5 | 3 | 3 | **19** | Classic whack, fine. |
| 59 | parking-out | 4 | 4 | 4 | 4 | 3 | **19** | Proven sliding puzzle. |
| 60 | path-memory | 3 | 5 | 5 | 3 | 3 | **19** | Simon-style memory; fine. |
| 61 | rhythm-drums | 4 | 4 | 4 | 4 | 3 | **19** | Good rhythm feel. |
| 62 | rubber-band | 4 | 4 | 4 | 3 | 4 | **19** | Good aim and shoot; the closest thing to Angry Birds today. |
| 63 | sky-defense | 3 | 5 | 5 | 3 | 3 | **19** | Auto-fire means you only dodge. Overlaps Rock Blaster. |
| 64 | stop-clock | 3 | 5 | 5 | 3 | 3 | **19** | Fine quick timing test. |
| 65 | tank-duel | 4 | 4 | 4 | 3 | 4 | **19** | Artillery with wind is a good fit. |
| 66 | territory-claim | 4 | 4 | 3 | 4 | 4 | **19** | Good territory capture; drag controls a bit loose. |
| 67 | traffic-light | 3 | 4 | 5 | 3 | 4 | **19** | Simple but fair. |
| 68 | wrecking-ball | 4 | 4 | 4 | 3 | 4 | **19** | Satisfying smash. |
| 69 | bowling-swipe | 4 | 4 | 4 | 4 | 4 | **20** | Hook swipe feels good; five frames is a good length. |
| 70 | cave | 4 | 5 | 5 | 3 | 3 | **20** | Pure one-touch classic. Dies quickly if you hesitate, by design. |
| 71 | chef-orders | 4 | 4 | 4 | 4 | 4 | **20** | Busy and readable. |
| 72 | dungeon-door | 4 | 4 | 5 | 3 | 4 | **20** | Quick decisions, good risk. |
| 73 | gem-slide | 4 | 4 | 4 | 4 | 4 | **20** | Good twist on match-3. |
| 74 | gold-digger | 4 | 4 | 4 | 4 | 4 | **20** | Digging with falling boulders; strong. |
| 75 | mini-golf | 4 | 5 | 4 | 4 | 3 | **20** | Good putt feel. |
| 76 | ninja-wall | 4 | 5 | 5 | 3 | 3 | **20** | Good one-tap. |
| 77 | orbit-jump | 4 | 4 | 5 | 3 | 4 | **20** | Rounds end fast until you get it; looks sparse. |
| 78 | picture-logic | 4 | 4 | 4 | 5 | 3 | **20** | Nonograms; good depth. |
| 79 | pipe-plumber | 4 | 4 | 5 | 4 | 3 | **20** | Classic pipe race. |
| 80 | pocket-pinball | 4 | 4 | 4 | 4 | 4 | **20** | Plays well on a small screen. |
| 81 | road-hopper | 4 | 5 | 4 | 4 | 3 | **20** | Strong hop-across-roads. |
| 82 | sheep-herder | 4 | 4 | 4 | 3 | 5 | **20** | Original and charming. |
| 83 | slice | 4 | 5 | 5 | 3 | 3 | **20** | Proven swipe game. |
| 84 | snowball-roll | 4 | 4 | 4 | 3 | 5 | **20** | Original size-matters steering. |
| 85 | spike-runner | 4 | 5 | 5 | 3 | 3 | **20** | Clean gravity-flip runner. |
| 86 | stack | 4 | 5 | 5 | 3 | 3 | **20** | Proven one-tap stacker. |
| 87 | tiny-tower | 4 | 4 | 4 | 4 | 4 | **20** | Rob asked for tower defense: this is it. Short (five waves); could grow. |
| 88 | worm | 4 | 5 | 5 | 4 | 2 | **20** | Classic, always solid. |
| 89 | bricks | 4 | 5 | 5 | 4 | 3 | **21** | Rob asked for brick breaker: this is it, and it works. Could use power-ups. |
| 90 | dart-wheel | 4 | 5 | 5 | 3 | 4 | **21** | Tight one-tap game. |
| 91 | ice-slide | 4 | 4 | 5 | 4 | 4 | **21** | Clean slide puzzle. |
| 92 | juggle-kick | 4 | 5 | 5 | 3 | 4 | **21** | Great one-tap feel. |
| 93 | lift-operator | 4 | 4 | 4 | 4 | 5 | **21** | Original and busy. |
| 94 | odd-one-out | 4 | 5 | 5 | 3 | 4 | **21** | Great quick eye test. |
| 95 | spot-difference | 4 | 5 | 5 | 4 | 3 | **21** | Universally understood. |
| 96 | untangle | 3 | 5 | 5 | 4 | 4 | **21** | Relaxing puzzle. |
| 97 | ball-sort | 4 | 5 | 5 | 4 | 4 | **22** | Proven sort-puzzle loop, clean art. |
| 98 | block-fit | 4 | 5 | 4 | 5 | 4 | **22** | Strong block-puzzle loop; long sessions. |
| 99 | merge-ten | 4 | 5 | 5 | 4 | 4 | **22** | Very readable, very sticky. |
| 100 | town-mayor | 4 | 5 | 5 | 4 | 4 | **22** | Swipe-card choices work well. |
| 101 | merge-drop | 5 | 5 | 5 | 4 | 4 | **23** | The best casual game in the set. |

## Batches 13-17 (41 games), reviewed 2026-11-07

Same scoring. Most of these are deeper "handheld era" games (RPGs, tactics, farming, racing), so they score lower on Length for a scroll feed and higher on Uniqueness. None crashed in the bot test. The weakest are listed first.

| # | Game | Fun | Clarity | Controls | Length | Unique | Total | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | blitz-sense | 3 | 3 | 2 | 4 | 4 | **16** | Fun idea, but half the micro games need the mic, tilt or shake, which a lot of players can't use on a bus. |
| 2 | fossil-dig | 3 | 3 | 3 | 3 | 4 | **16** | Rub-to-brush is calm but slow; the brush/pick difference takes a try to learn. |
| 3 | ⚠ cube-tide | 3 | 2 | 3 | 3 | 4 | **15** | Three trap rules (grey, green, black) at once is a lot to read from the hint. Too close to one existing game; reworked on 2026-11-11 as Row Call (`row-call`). |
| 4 | kit-hunt | 3 | 3 | 3 | 3 | 4 | **16** | Detector sweep is neat; swings run out fast. |
| 5 | pocket-tactics | 3 | 3 | 4 | 2 | 4 | **16** | Proper tactics, but a battle is several minutes. Better as a "sit down" game. |
| 6 | pocket-farm | 3 | 4 | 4 | 2 | 4 | **17** | Cosy; days take a while to pay off in a feed. |
| 7 | critter-quest | 4 | 3 | 4 | 2 | 4 | **17** | Rob's monster-catching request. Lots of content; long for a scroll. |
| 8 | ⚠ mansion-night | 3 | 4 | 3 | 3 | 4 | **17** | Atmospheric; reload swipe is easy to miss. Too close to one existing game; reworked on 2026-11-11 as Pantry Patrol (`pantry-patrol`). |
| 9 | shell-duel | 4 | 3 | 3 | 3 | 4 | **17** | Artillery turns are slow next to the rest of the feed. |
| 10 | spell-school | 3 | 3 | 3 | 4 | 4 | **17** | Rune tracing is unique; the V and peak shapes get confused. |
| 11 | blueprint-stack | 3 | 4 | 4 | 3 | 4 | **18** | Tidy drop puzzle. |
| 12 | build-rush | 3 | 4 | 5 | 3 | 3 | **18** | Clear speed-match game. |
| 13 | front-line | 3 | 4 | 4 | 3 | 4 | **18** | Timing the dash past the sweep reads well. |
| 14 | ⚠ grid-duel | 4 | 3 | 4 | 3 | 4 | **18** | Grid battler with chips; dense first screen. Too close to one existing game; reworked on 2026-11-11 as Broadside (`broadside`). |
| 15 | kit-racer | 3 | 4 | 4 | 3 | 4 | **18** | Garage pick then race; fine. |
| 16 | mind-gym | 3 | 5 | 5 | 3 | 2 | **18** | Overlaps Fast Maths, Path Memory and Odd One Out. |
| 17 | pile-builder | 3 | 3 | 4 | 4 | 4 | **18** | Hold-to-build is a fresh idea. |
| 18 | ⚠ timing-brawl | 4 | 3 | 4 | 3 | 4 | **18** | Timed-hit RPG fights; good feel once learned. Too close to one existing game; reworked on 2026-11-11 as Riposte (`riposte`). |
| 19 | agent-zero | 4 | 4 | 4 | 3 | 4 | **19** | Cover shooter in one hold. Works well. |
| 20 | ⚠ blob-pairs | 4 | 4 | 4 | 4 | 3 | **19** | Solid falling-pairs puzzle. Too close to one existing game; reworked on 2026-11-11 as Bookends (`bookends`). |
| 21 | boss-brickfall | 4 | 3 | 4 | 4 | 4 | **19** | Build launchers from the fallen bricks: clever. |
| 22 | ⚠ garden-guard | 4 | 4 | 4 | 4 | 3 | **19** | Rob's lane-defence request; reads clearly. Too close to one existing game; reworked on 2026-11-11 as Picnic Panic (`picnic-panic`). |
| 23 | net-catch | 4 | 4 | 4 | 3 | 4 | **19** | Sneak-and-catch, nice and readable. |
| 24 | ⚠ panel-rise | 4 | 4 | 4 | 4 | 3 | **19** | Swap-and-raise puzzle, solid. Too close to one existing game; reworked on 2026-11-11 as Tide Turn (`tide-turn`). |
| 25 | pocket-kart | 4 | 4 | 4 | 3 | 4 | **19** | Mode-7 style racer looks great. |
| 26 | rex-rampage | 4 | 5 | 5 | 3 | 3 | **20** | Simple, punchy. |
| 27 | ramp-combo | 4 | 4 | 4 | 4 | 4 | **20** | Pump-and-trick loop is satisfying. |
| 28 | ⚠ saber-knight | 4 | 4 | 5 | 3 | 4 | **20** | Deflect timing feels great. Too close to one existing game; reworked on 2026-11-11 as Snow Swat (`snow-swat`). |
| 29 | shadow-ops | 4 | 4 | 4 | 4 | 4 | **20** | Best of the stealth games. |
| 30 | sling-smash | 4 | 5 | 5 | 3 | 3 | **20** | Rob's slingshot-physics request; works. |
| 31 | stud-smash | 4 | 4 | 4 | 4 | 4 | **20** | Smash-and-collect is very moreish. |
| 32 | ⚠ suit-ops | 4 | 4 | 4 | 4 | 4 | **20** | Mode-switch shooter with real choices. Too close to one existing game; reworked on 2026-11-11 as Canopy Run (`canopy-run`). |
| 33 | swipe-fighter | 4 | 3 | 4 | 4 | 5 | **20** | Swipe fighting with readable tells. |
| 34 | sword-rooms | 4 | 5 | 4 | 4 | 3 | **20** | Classic top-down rooms, clear. |
| 35 | blitz-bits | 4 | 4 | 4 | 5 | 4 | **21** | Micro-game rapid fire is perfect for a feed. |
| 36 | blob-ball | 4 | 4 | 4 | 4 | 5 | **21** | Silly one-on-one football; very replayable. |
| 37 | ⚠ copy-puff | 4 | 4 | 4 | 4 | 4 | **21** | Copy-ability platformer with real variety. Too close to one existing game; reworked on 2026-11-11 as Boomerang Fox (`boomerang-fox`). |
| 38 | ⚠ crate-dash | 4 | 5 | 4 | 4 | 4 | **21** | Lane runner with spin; polished. Too close to one existing game; reworked on 2026-11-11 as Paint Run (`paint-run`). |
| 39 | hop-quest | 4 | 5 | 4 | 4 | 3 | **20** | Classic platformer feel. |
| 40 | star-bloom | 4 | 5 | 5 | 4 | 3 | **21** | Clean auto-fire shooter with power levels. |
| 41 | tag-team | 4 | 4 | 4 | 4 | 5 | **21** | Hero-swap runner, the best of the brick games. |

## Changes made in the 2026-11-07 pass

**Console look.** Console games used to render as chunky pixels like the Pocket games. They now draw at full phone resolution, with a shared lighting pass (warm key light and vignette), and every console game was redrawn with soft shadows, gradients, glossy spheres and glows from the new `src/kit/gfx.js`. The brick kit is now glossy plastic with lit studs.

**Balance.**
- **colour-word, fast-maths, hoop-flick:** three hearts instead of one mistake ending the round. All three were flagged for very short rounds.
- **cave:** hovers until your first touch, instead of crashing in under a second if you don't react.
- **tile-tap:** tiles wait for your first tap, like the genre.
- **rope-swing:** you start hanging from the first hook, instead of falling unless you grab within a second.
- **spring-jumper:** a dotted arc shows where you'll land while you charge, and early gaps are smaller.
- **jelly-bounce:** the timing windows are wider. A tap just before landing now counts as GOOD; it used to be silently thrown away.
