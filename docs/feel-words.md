# Feel words: what to change when someone says "floatier"

People ask for changes in feel words: *make it snappier*, *the jump is too floaty*, *it needs more
punch*, *it's unfair*. This page turns each word into the numbers to move, so a person or an AI tool
makes the change the player meant, in the right place and by about the right amount.

Most of those numbers should be **knobs**: one block at the top of `make()` where a game keeps the
numbers that set how it feels.

```js
const K = gs.tweak('Feel', {
  speed: [110, 40, 240, 'how fast the player moves (units a second)'],
  spawn: [.9, .3, 2, 'seconds between new hazards at the start'],
  ramp:  [60, 20, 180, 'seconds until it is as hard as it gets'],
  lives: [3, 1, 5, 1, 'misses before the round ends'],
});
// read K.speed where it's used (in update or draw), so a change shows on the next frame
```

`[value, min, max, step?, 'what it does']`: the words show on the slider and in
`node scripts/knobs.mjs <id>`, which lists a game's knobs and changes them in the file
(`node scripts/knobs.mjs <id> speed*0.8`). In `npm run dev` the slider panel tunes them while you play,
on a computer or a phone on the same Wi-Fi, and **Save to file** writes the values back into the game.
The store apps show no panel: `gs.tweak` hands back the file's values. Every template made by
`npm run new` starts with a knobs block.

## How to make a change asked for in words

1. Find the word below, and the knobs or kit numbers it points to.
2. `node scripts/knobs.mjs <id>` for the game's knobs. If the number isn't a knob yet, make it one:
   move it into the `Feel` block with a range and a few words, then change it there.
3. Change one or two numbers by the step given (most feel changes are 15 to 30 %; a "much" is 50 %).
   Keep a change inside the knob's range; widen the range only if the person asks for more.
4. Check it still plays: `node scripts/check.mjs <id>`. Say what you changed and by how much, so the
   person can ask for more or less.

Use the usual knob names below when a game has the same idea, so the same word moves the same knob in
every game.

## The words

| Word (and ones like it) | Move | Which way |
| --- | --- | --- |
| **floaty**, floatier, moon-like, too much hang time | `jumpTime` (Platformer: seconds to the top), `gravity`, `fall` (top falling speed) | floatier: `jumpTime` up 20 %, `fall` down 20 %. Less floaty: the other way, and `cut` up (letting go early cuts the rise) |
| **heavy**, weighty, solid | `gravity` or `jumpTime`, `accel` / `stop`, `land` shake | heavier: `jumpTime` down, `fall` up, `accel` down a little, `feel.land(x, y, speed)` on landing |
| **snappy**, tight, responsive, twitchy | `accel`, `stop`, `airAccel` (Platformer, TopDown), tween times, `Stick` `dead` | snappier: `accel` and `stop` up 30 to 50 %, tweens shorter (.35 s to .2 s), a smaller stick dead zone |
| **slippery**, icy, drifty, sluggish | `stop`, `accel`, Physics `friction` | less slippery: `stop` up; more: `stop` down, `friction` down |
| **fast**, quicker, slow, sluggish | `speed` (the player), `run` (Platformer), world speed, `spawn` | the player's speed first; change the world's speed with it or the game gets easier or harder too |
| **punchy**, juicy, impact, crunchy, satisfying | Feel calls (`feel.hit`, `feel.boom`, `feel.coin`), `power` / `size` on them, `juice.freeze(sec)` hit-stop, `juice.shake(amount)` | more punch: `feel.hit(x, y, { power })` up, a hit-stop of .04 to .08 s on big hits, a `feel.combo` on streaks. Never more than .12 s of freeze: it reads as lag |
| **too much**, busy, noisy, shaky, overwhelming | the same Feel calls, particle counts | fewer and smaller: drop shake on small events, keep it for big ones. Effects follow the player's Reduce motion setting; scale your own big ones by `gs.prefs.motion` |
| **hard**, unfair, cheap, frustrating | `lives`, `spawn`, `ramp`, hitbox size, `coyote`, `buffer`, warning time | fairer: `coyote` (.1 s to .15 s) and `buffer` (.12 s to .18 s) up, hazards' hitboxes a little smaller than they look, a warning before a hazard lands (.4 s or more), `lives` up one. Don't make hazards slower first: that makes it dull |
| **easy**, boring, no challenge | `ramp`, `spawn` and `fastest` (Spawner), enemy `speed`, `goal` | harder over time rather than from the start: `ramp` down (it gets hard sooner), Spawner `fastest` down; raise `goal` only if a decent player reaches it in well under a minute |
| **harder over time**, builds up, escalates | `gs.pacing`: `Spawner({ every, fastest, over })`, `ramp(t, from, to, seconds)`, `Director` | `over` / `ramp` is the seconds to full difficulty (60 to 120 s for a 2 minute round). A `Director` eases off after the player gets hit |
| **long**, drags, too short | `goal`, `lives`, `ramp`, level length | a round is 20 s to 3 min. Shorter: fewer lives or a sooner ramp; longer: the other way |
| **slow start**, nothing happens | `first` (Spawner: seconds to the first spawn), the opening `spawn` | something to do within 2 s of the first tap |
| **can't see**, cluttered, hard to read | sizes, contrast, `Camera2D` `lead` and `deadzone`, HUD | bigger targets (44 game units or more on a 360 wide screen for a thumb), more contrast between what hurts and what helps, look-ahead in the way the player moves |
| **tap feels off**, missed taps, fat fingers | hit radius, `gs.aim.AimAssist` `pull` / `cone`, timing `window` | hit areas larger than the drawing (1.3x), a timing window of .12 s or more each side |
| **stiff**, robotic, lifeless | squash and stretch tweens, `gs.characters.Wobble`, ease curves | ease in and out (`ease.outBack`, `ease.outElastic` on pop-ins), a little overshoot, idle motion |
| **music** too much, too quiet, wrong mood | `music: '<mood>'` in the definition | moods: `happy`, `calm`, `tense`, `spooky`, `heroic`, `sad`, `silly`, `chase`, `puzzle`; the player's volume is theirs |

## Usual knob names

| Knob | What it is |
| --- | --- |
| `speed` | how fast the player (or the thing the player steers) moves, in units a second |
| `jump`, `jumpTime`, `fall`, `cut`, `coyote`, `buffer` | the Platformer's own options (`gs.movers.Platformer`), same names, so the knob passes straight in |
| `gravity` | for a game with its own jumping or falling, in units a second squared |
| `accel`, `stop` | how quickly it gets up to speed and stops |
| `spawn` | seconds between new things at the start |
| `fastest` | the shortest gap between new things, when it is at its hardest |
| `ramp` | seconds until it is as hard as it gets |
| `lives` | misses or hits before the round ends |
| `window` | seconds either side of a beat or a mark that still count |
| `enemy` | an enemy's speed (`enemySpeed`, `chase`... when there are several kinds) |
| `power` | how hard a shot, a swing or a throw is |
| `punch` | how big the hit effects are (pass it to `feel.hit(x, y, { power: K.punch })`) |

A game can have any other knob it needs: say in its words what it does.
