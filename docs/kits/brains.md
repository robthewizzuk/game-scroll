# gs.brains

Tiny Brains: on-device learning opponents and helpers, with guard rails, corrections and memories.

`gs.brains` (Tiny Brains): `Brain(api, { inputs, actions, teacher, limits, rules })` learns as you play with guard rails (`act`, `feel`, `result`; `correct(see, action)`: "here the right move was this", a couple of examples and it holds to it in spots like them; `avoid()`: "not that here"; `recalled`; a memory of which move made things exciting where, from each `feel()`, that switches itself on in games that call `feel()` after most decisions (`memory: true` from the start, `false` never); `remembered`), `Wave` (each enemy an experiment, `unsure(see)`), `Imagine` (tries moves ahead; `fixed: true` for replays), `Predict` (learns the player's habits: `see`, `guess`, `sure`), `Player` (one private profile across games: `skill`, `note`), `Dial` (the win-rate rail for any opponent: pass it as a kit's `skill`, `result(playerWon)` at the end), `Coach` (corrections for anything that decides by rules: `pick(see, usual)`, `correct('pass')`, `avoid()`; `Team`, `Squad`, `Choose` and `Tree` take `coach: true` or one of these, and `cover.avoid(spot)` is "not that cover"), `Examples` (teach by example: `add('rock', hand.shape)`, `guess(hand.shape)` gives `{ name, sure }` or null; `of: 'hand' | 'pose' | 'move' | 'sound'` for a hand's or body's `shape`, `new Moves({ learn })` + `teach(name)`, a `Sounds` `shape`), `Nemesis` (a rival who remembers you), `Shadow` (copies how you play; `pack()` for `start`), `tune()`; brain options `styles`, `tells`, `start`.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`BrainsPart`, line 2389), where every option and field is described.

- `Net: typeof TinyNet` (:2390)
  - `constructor(sizes: number[], seed?: number)` (:2121)
  - `readonly sizes: number[]` (:2122)
  - `readonly shape: string` (:2122)
  - `readonly length: number` (:2122)
  - `w: Float32Array` (:2122)
  - `run(x: ArrayLike<number>): Float32Array` Probabilities for inputs x (reused array). (:2124)
  - `learn(x: ArrayLike<number>, toward: number, amount: number, ran?: boolean): this` Makes `toward` more likely for x by `amount` (negative: less likely). (:2126)
  - `copy(): TinyNet` (:2127)
  - `pack(): string` (:2128)
  - `static unpack(s: string): TinyNet | null` (:2129)
- `Brain: typeof Brain` (:2391)
  - `constructor(api: GameApi | null, opts: BrainOptions)` (:2176)
  - `net: TinyNet` (:2177)
  - `skill: number` (:2177)
  - `trust: number` (:2177)
  - `winRate: number` (:2177)
  - `steps: number` (:2177)
  - `readonly action: number | string` The last action (its name when actions is a list). (:2179)
  - `act(see: number[], dt?: number): number` Picks an action for what it sees (numbers about -1..1), every frame. (:2181)
  - `feel(x?: number): void` A moment that made the round exciting (about -1..1). (:2183)
  - `result(playerWon: boolean): void` End of a duel or round: did the player win? (:2185)
  - `winChance(skill?: number): number` The player's learned chance of winning a round at a skill level (default: the current one). (:2187)
  - `reset(): this` Forgets what it learned. (:2189)
  - `style: string | Record<string, number> | undefined` The personality it's playing; set a name or a mix ({ bold: .7, sneaky: .3 }). (:2191)
  - `readonly telling: { action: number | string; left: number; t: number } | null` During a wind-up (tells): what it's about to do. (:2193)
  - `unsure: number` How torn its last decision was, 0..1. (:2195)
  - `fun: number` How fun rounds have looked lately (-1..1), and its learned lean (-0.3..0.3). (:2197)
  - `lean: number` (:2197)
  - `rounds: number` (:2197)
  - `watch(see: number[], action: number | string, amount?: number): this` Learns from a move someone showed it (teach by playing). (:2199)
  - `correct(see: ArrayLike<number>, action: number | string): this` "In this spot the right move was this": correct(see, action), or correct(action) for the spot it last decided on. (:2206)
  - `correct(action: number | string): this` (:2207)
  - `avoid(see: ArrayLike<number>, action: number | string): this` "In this spot, not that": avoid(see, action), avoid(action) for the spot it last decided on, or avoid() for whatever it just did there. (:2213)
  - `avoid(action?: number | string): this` (:2214)
  - `readonly recalled: { action: number | string; not: boolean; like: number } | null` After act(): the correction that shaped the move it just chose ({ action, not: it leaned away, like: 0..1 how alike the spot was }), or null. (:2216)
  - `readonly remembered: { action: number | string; better: number } | null` After act(), with the memory option: the move its memory chose over the one it would have made ({ action, better: how much more exciting it expects, in typical feel()s }), or null. (:2218)
  - `uncorrect(action?: number | string): this` Forgets the corrections given while running (all, or one action's); the maker's own stay. (:2220)
  - `readonly corrections: ([number[], number | string] | [number[], number | string, false])[]` Every correction it holds, as [see, action] ("not this": [see, action, false]); copy them into the corrections option to keep them in the game. (:2222)
  - `readonly heed: number` How far it trusts its corrections, 0..2: full while they agree, less when examples close together name different moves. (:2224)
  - `pack(): string` The brain as text (for start). (:2226)
- `Wave: new (brain: Brain, o?: { change?: number }) => { mind(o?: { style?: string }): BrainMind; /** How much the live minds disagree on these inputs, 0..1. */ unsure(s…` Every enemy in a wave is an experiment: wave.mind() per enemy (each with its own reaction time and action), mind.done() when it leaves. (:2393)
- `Predict: typeof Predict` Learns the player's habits and guesses their next move (board, card, rhythm, turn games). (:2395)
  - `constructor(api: GameApi | null, opts: { moves: number | string[]; name?: string; learn?: number })` (:2372)
  - `see(move: number | string): this` The player made a move. (:2374)
  - `guess(): number | string | null` The most likely next move, or null before any moves. (:2376)
  - `chances(): Float64Array` A chance for each move (adds up to 1). (:2378)
  - `readonly sure: number` How sure the guess is, 0..1. (:2380)
  - `right: number` How often its guesses came true lately, 0..1. (:2382)
  - `seen: number` Moves seen. (:2384)
  - `forget(): this` Forgets every habit. (:2386)
- `Player: typeof Player` (:2396)
  - `constructor(api: GameApi | null)` (:2230)
  - `readonly skill: number` (:2231)
  - `readonly reaction: number` (:2231)
  - `readonly aim: number` (:2231)
  - `get(kind: string, fallback?: number): number` (:2232)
  - `count(kind: string): number` (:2232)
  - `note(kind: string, value: number): this` (:2232)
  - `clear(): this` (:2232)
- `Dial: typeof Dial` (:2397)
  - `constructor(api: GameApi | null, opts?: DialOptions)` (:2242)
  - `constructor(opts?: DialOptions)` (:2243)
  - `name: string` (:2244)
  - `skill: number` The dial, 0..1 (within range). (:2246)
  - `winRate: number` The player's win rate, smoothed, and the rate it steers to. (:2248)
  - `readonly target: number` (:2248)
  - `rounds: number` Results seen. (:2250)
  - `valueOf(): number` (:2251)
  - `level(n?: number): number` The dial as a level 1..n (default 5). (:2253)
  - `result(playerWon: boolean | 'draw' | number): this` The end of a game or round: did the player win? (:2255)
  - `winChance(skill?: number): number` The player's learned chance of winning at a skill (default: the current one). (:2257)
  - `forget(): this` Forgets what it learned about this player. (:2259)
- `Coach: typeof Coach` (:2398)
  - `constructor(api: GameApi | null, opts?: CoachOptions)` (:2282)
  - `constructor(opts?: CoachOptions)` (:2283)
  - `name: string` (:2284)
  - `shape(inputs: number, actions: string[] | number): this` What it looks at and what it can say. (:2286)
  - `pick<T extends number | string>(see: ArrayLike<number>, usual: T | T[]): T` The move to make on inputs `see`: `usual` (the rules' choice; or a list, best first, of the moves that can be made here), unless corrections in spots like this one say otherwise. (:2288)
  - `correct(action: number | string): this` "In this spot the right move was this": for the spot it last picked on, or one of your own. (:2290)
  - `correct(see: ArrayLike<number>, action: number | string): this` (:2290)
  - `avoid(action?: number | string): this` "In this spot, not that": avoid() is about what it last picked (so name the move when teaching the same thing twice). (:2292)
  - `avoid(see: ArrayLike<number>, action: number | string): this` (:2292)
  - `readonly recalled: { action: number | string; not: boolean; like: number } | null` After pick(): the correction that shaped it, or null. (:2294)
  - `uncorrect(action?: number | string): this` Forgets the corrections given while running (all, or one action's); the maker's own stay. (:2296)
  - `readonly corrections: ([number[], number | string] | [number[], number | string, false])[]` Every correction it holds, as [see, action] ("not this": [see, action, false]). (:2298)
  - `readonly heed: number` How far it trusts its corrections, 0..2. (:2300)
  - `lean(see: ArrayLike<number>): Float32Array | null` What its examples say about a spot, per action: above 0 towards it, below 0 away (null: nothing like it). (:2302)
- `Examples: typeof Examples` (:2399)
  - `constructor(api: GameApi | null, opts?: ExamplesOptions)` (:2320)
- …more: `BrainsPart` at src/gamescroll.d.ts:2389

## From the maker kit

From [Motion moves](../maker-kit.md#motion-moves):

Moves of your own, or the player's: `new Moves({ learn: new gs.brains.Examples(api, { name: 'moves', of: 'move' }) })`,
then `moves.teach('stir')` takes the next move made as an example and `moves.on('stir', fn)` fires for
moves like it. `moves.on('motion', m => m.shape)` gets every burst of movement
([Teach by example](#teach-by-example-signs-poses-moves-and-sounds-of-your-own)).

From [Spawning and pacing](../maker-kit.md#spawning-and-pacing):

`const { Spawner, Waves, Director, ramp } = gs.pacing;` When things appear and how hard it gets.
The kit says when; your game makes the thing.

```js
spawner = new Spawner({ every: 1.2, fastest: .35, over: 60, jitter: .25 });   // speeds up over a minute
spawner.update(dt, () => things.add(makeBat(), 'enemy'));

waves = new Waves([{ count: 6, every: .7, kind: 'bat' }, { count: 1, kind: 'boss' }], { breather: 3, loop: true });
waves.update(dt, kind => spawn(kind), things.count('enemy'));   // next wave once this one is beaten
// waves.number, waves.state ('spawning' | 'fighting' | 'breather' | 'done'), waves.breatherLeft

director = new Director({ over: 90 });      // difficulty 0..1 that eases off when the player is struggling
// new Director({ over: 90, dial }): with a gs.brains.Dial it also remembers the player between rounds
director.hurt(1); director.scored(1); director.update(dt); gap = director.pick(1.4, .4);
```

From [Face and hands](../maker-kit.md#face-and-hands):

- `Hands`: `list` of `{ x, y, tipX, tipY, pinch, pinchX, pinchY, open, fist, point, side, points, shape }`, `first`.
  `shape` is the hand as numbers for `gs.brains.Examples`: signs of your own ([Teach by example](#teach-by-example-signs-poses-moves-and-sounds-of-your-own)).

From [Tiny Brains](../maker-kit.md#tiny-brains):

Tiny Brains are small neural networks that learn while people play, with no training step. A brain
starts by copying your game's own simple AI (its **teacher**), learns a little every frame, and only
takes over from the teacher as it shows it makes the game more fun. It runs on the phone's CPU in
plain JavaScript; a decision takes microseconds.

```js
const { Brain } = gs.brains;
function make(api) {
  const bot = new Brain(api, {
    name: 'bot',
    inputs: 4,                                          // numbers it sees, each about -1..1
    actions: ['left', 'right', 'jump', 'wait'],
    teacher: see => (see[0] < 0 ? 'left' : 'right'),    // your simple AI: where it starts
    limits: { react: .15, perSecond: 6, minNoise: .05 },// human-like caps it can never go past
    rules: (see, a) => (playerDown && a === 'jump' ? 'wait' : a),   // things it may never do
  });
  return {
    update(dt) {
      bot.act([dx / W, dy / H, vx / 300, onGround ? 1 : -1], dt);
      if (bot.action === 'jump') jump();
      if (nearMiss) bot.feel(1);        // an exciting moment: pressure, a close call
    },
    // when the round (or a duel) ends:
    // bot.result(playerWon);
  };
}
```

- `act(see, dt)` every frame: returns the action's index; `bot.action` is its name.
- `feel(x)` (about -1..1): "this moment was a good challenge". Call it for close calls, pressure,
  near misses; negative for dull or unfair moments. Don't reward hurting the player as such.
- `result(playerWon)` at the end of each round or duel.
- `reset()` forgets what it learned on this phone.

**Guard rails** (always on, a game can't turn them off):

- **It aims for fun, not winning.** It steers the player's win rate towards `target` (0.6). While the
  player loses too often, the same `feel()` signals teach it to ease off.
- **Hard limits from your game:** `react` (seconds between decisions, longer when the skill dial is
  low), `perSecond` (changes of mind), `minNoise` (always a little randomness).
- **Tiny, slow changes:** each nudge is small, and every number stays within `drift` (1) of the
  brain it started as (the copy of your teacher), with a gentle pull back.
- **Losing streak relief:** after three player losses in a row it backs off at once.
- **Your rules win:** `rules(see, action)` can swap any choice.
- **Private and resettable:** what it learned stays in the game's brain slot on the phone (and the
  player's cloud save), apart from `api.save()`.

**Shared learning.** Now and then a brain that has learned enough sends its numbers (only the
numbers, nothing about the player) to our server, and a fresh brain starts from everyone's average
(the server drops the most unusual 20% of each number, so a few odd phones can't steer it).
`share: false` turns it off for a brain. Changing `inputs`, `hidden` or `actions` makes a new brain
shape that starts again.

**Waves: every enemy is an experiment.** Each enemy gets a slightly changed copy of the brain; it's
scored by its `feel()` over its own life, and pairs of opposite changes move the brain towards
whichever made things more exciting.

```js
const wave = new gs.brains.Wave(bot);
spawn() { enemy.mind = wave.mind(); }
update(dt) { enemy.mind.act(see, dt); if (nearMiss) enemy.mind.feel(1); }
// when the enemy is destroyed or leaves: enemy.mind.done();
```

Each mind has its own reaction time and its own choice (`enemy.mind.action`), so a whole squad can
act in the same frame.

`wave.unsure(see)` says how much the live minds disagree about what to do on those inputs (0 they
all agree, towards 1 they don't). It's a cheap "not sure" signal: when it's high, let the teacher
decide, hesitate, or show a tell the player can read.

**Imagine: trying moves ahead.** For racing lines, throws and physics, `Imagine` tries each action a
short way ahead with your own step function and picks the best: smart from the first second. Give
it a brain and the brain learns from every plan, and the brain's skill dial and rules apply.

```js
const plan = new gs.brains.Imagine({
  actions: ['left', 'straight', 'right'],
  step: (s, a, dt) => drive({ ...s }, a, dt),   // returns a NEW state; never change the real one
  score: s => s.progress - s.offTrack * 5,
  brain: racer, see: s => [s.angle / Math.PI, s.speed / 300, s.edge],
});
const a = plan.pick(car);
```

`Imagine` plans for at most `budget` ms (2), so a slow phone tries fewer moves. In a game that
records replays or runs a daily seed, add `fixed: true`: it then always tries every move `tries`
times and picks the same on every phone (`plan.tried` says how many rounds the last pick used).

`auto: true` switches planning off on phones that can't afford it: at once on a low phone, or once
picks average longer than `maxMs` (default: `budget`). `plan.on` says whether it's planning and
`plan.why` why not. While it's off, `pick()` uses `fallback(state)`, or the brain (with `see`), so
the game keeps working the same way, just less cleverly.

**Predict: learning the player's habits.** For board, card, rhythm and turn games. It counts what the
player did after their last move, last two and last three, and learns which of those to believe. A
few dozen moves are enough to spot a habit; a player who really is random doesn't fool it into
being sure.

```js
const habits = new gs.brains.Predict(api, { moves: ['rock', 'paper', 'scissors'] });
// each time the player moves:
habits.see('paper');
// before the opponent moves:
if (habits.sure > .5 && Math.random() < bot.skill) counter(habits.guess());
// a hint: if (habits.right > .7) say('You always play paper after rock!')
```

More in docs/maker-kit.md: "Tiny Brains", "The player, fun, personalities and tells", "A dial for opponents that aren't brains", "A coach for things that decide by rules", "Teach by example: signs, poses, moves and sounds of your own", "Nemesis, Shadow and teaching by playing", "Game kits", "Action and adventure kits", "Hearing, doodles and the phone's AI".

## In real games

21 games use it (`node scripts/examples.mjs gs.brains` lists them). The shortest:

`src/games/rock-paper.js` (Rock Paper Duel, Pocket · Strategy, 89 lines):

```js
const { Feel } = gs.effects;
const { Predict, Dial } = gs.brains;
// …
  let style, me, op, res, wins, lives, score, t, show;
  const habits = new Predict(api, { name: 'rock-paper-you', moves: 3 }), dial = new Dial(api, { name: 'rock-paper-owl' });
// …
  // OWL plays what beats your likely next move, when it trusts its read (else anything)
  const OWL = { name: 'OWL', pick: () => { const g = habits.guess(); return g != null && habits.sure > .3 && Math.random() < .45 + .5 * dial ? beats(g
// …
    if (show) return;
    const o = style.pick(me, op, res); me.push(m); op.push(o); habits.see(m);
// …
      feel.update(dt); t += dt;
      if (show) { show.l -= dt; if (show.l <= 0) { show = null; if (lives <= 0) { if (style === OWL) dial.result(false); return api.over(); } if (wins
```

`src/games/thumb-duel.js` (Thumb Duel, Casual · Party, 125 lines):

```js
const { rnd, clamp } = gs.util;
const { Brain } = gs.brains;
// …
  const see = () => [style.quick, style.jumpy, (you - them) / 5, clamp(rounds / 8, 0, 1) * 2 - 1];
  const robot = new Brain(api, {
// …
    if (two) { const n = Math.random() * 3 | 0; for (let i = 0; i < n; i++) fakes.push(fake(['yellow', 'flicker', 'cough'][Math.random() * 3 | 0], rnd
    robot.act(see(), 1);
// …
    if (two) return;
    if (early) { robot.feel(.4); style.jumpy += (1 - style.jumpy) * .25; }
// …
      style.jumpy += (-1 - style.jumpy) * .1;
      if (who === 'you') { const gap = botAt - goT; robot.feel(gap < .06 ? 1 : gap < .14 ? .3 : -.3); style.quick += (clamp((.4 - goT) / .15, -1, 1) -
      else robot.feel(.2);
// …
    }
    robot.result(who === 'you');
```
