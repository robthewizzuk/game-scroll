# gs.fight

Fighting games: motion inputs, frame data, hit boxes, cancels, 3D melee, a ready-made opponent.

`gs.fight` (`Reader` motion inputs + buffer, `Fighter` frame data, hit/hurt boxes, cancels, `clash`; `Opponent(api, { skill })` a ready-made enemy: `join(p2, p1)` each round, `think(dt)` gives `{ walk, block, move }` for your game to do; it reads its moves' frames, reacts no faster than a person and learns how this player attacks and guards; 3D street fights: `Melee(body, { react })` jab-cross-hook combos, kicks, sweeps, guard, dodge, lock-on and stepping in, hits passed to Reactions; swords and shields: `Melee(body, { weapon: 'sword' | 'axe' | 'spear'..., shield: true, armour: 'auto' })` with `BLADES`, `AXES`, `SPEARS`, `STAVES`, a shield bash, parries (a guard raised just in time), armour that soaks by where the blow lands and its edge; `Brawler({ skill })` a ready-made foe; `FISTS`, `SWINGS` for a bat)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`FightPart`, line 3190), where every option and field is described.

- `Melee: new (body: Loose, o?: { moves?: Record<string, MeleeMove>; radius?: number; height?: number; lock?: number; turn?: number; react?: Loose; buffer?: number; weapo…` Melee between people in a 3D world: body an Object3D (position, rotation.y) or { x, y, z, yaw }. (:3198)
  - `body: Loose` (:3174)
  - `moves: Record<string, MeleeMove>` (:3174)
  - `radius: number` (:3174)
  - `height: number` (:3174)
  - `hp: number` (:3174)
  - `maxHp: number` (:3174)
  - `react: Loose` (:3174)
  - `weapon: MeleeArm | null` (:3174)
  - `shield: MeleeShield | null` (:3175)
  - `parryWindow: number` (:3175)
  - `armour: number | 'auto' | { high?: number; mid?: number; low?: number }` (:3175)
  - `guardPose: string` The pose for its guard ('guard', 'armed', 'shieldUp', 'spearGuard'); the guard knocked aside (seconds left); left open after a parry (seconds left). (:3176)
  - `guardDown: number` (:3176)
  - `open: number` (:3176)
  - `readonly parrying: boolean` The guard was raised in time to parry what lands now. (:3177)
  - `protect(height?: 'high' | 'mid' | 'low', edge?: 'cut' | 'point' | 'blunt'): number` How much of a blow at a height with an edge its armour takes, 0..1. (:3178)
  - `move: MeleeMove | null` (:3179)
  - `name: string | null` (:3179)
  - `frame: number` (:3179)
  - `stun: number` (:3179)
  - `guard: boolean` (:3179)
  - `target: Loose` (:3179)
  - `combo: number` (:3179)
  - `hits: MeleeHit[]` (:3179)
  - `walk: { x: number; z: number }` After update: metres a second to move the body by (stepping in, a dodge), the yaw to turn to (or null), the pose for gs.poses and how far through it (rig.play(m.pose, { at: m.at, fade: .06 })). (:3181)
  - `facing: number | null` (:3181)
  - `pose: string | null` (:3181)
  - `at: number` (:3181)
  - `readonly pos: P3` (:3182)
  - `readonly yaw: number` (:3182)
  - `readonly phase: 'start' | 'active' | 'recover' | 'stun' | 'dodge' | 'block' | 'idle'` (:3182)
  - `readonly busy: boolean` (:3182)
  - `readonly untouchable: boolean` (:3182)
  - `attack(button: string | null | undefined): MeleeT` Presses a button ('light', 'heavy', 'low', 'push'): kept a moment, so a press early in a combo counts. (:3184)
  - `block(on?: boolean): MeleeT` (:3184)
  - `dodge(dir: { x: number; z: number }): boolean` (:3184)
  - `pick(foes: Loose[]): Loose` (:3185)
  - `start(name: string): boolean` (:3185)
  - `stats(m: MeleeMove): MeleeMove` (:3185)
  - `reset(): MeleeT` (:3185)
  - `update(dt: number, foes?: Loose[]): MeleeHit[]` Steps the frames, takes buffered presses, turns and steps in onto the foe locked on to, and returns what landed this frame. (:3187)
  - `on(ev: 'start' | 'active' | 'end' | 'hit' | 'blocked' | 'parried' | 'hurt' | 'block' | 'parry' | 'dodge', fn: (...a: Loose[]) => void): MeleeT` (:3188)
- `Brawler: new (o?: { skill?: Skill | number; speed?: number; rng?: () => number; mean?: number }) => { skill: Loose; think(dt: number, me: MeleeT, foe: MeleeT): { walk:…` A ready-made 3D brawler: think(dt, me, foe) gives { walk, face, attack, block, dodge } for your game to do. (:3200)
- `FISTS: Record<string, MeleeMove>` Fists and feet: jab, cross, hook, uppercut (light chain), kick, knee (heavy), sweep (low: trips), shove (push: unblockable). (:3202)
- `SWINGS: Record<string, MeleeMove>` Swinging something held: swing, backhand, overhead, jabWith, sweep. (:3204)
- `BLADES: Record<string, MeleeMove>` A one-handed sword (or a dagger): slash, cutBack, chop (light chain), thrust (heavy), lowCut (low), bash (push, with a shield), shove. (:3206)
- `AXES: Record<string, MeleeMove>` An axe or a mace: hack, hackBack, cleave (puts them down), hook (low: pulls the guard aside), bash, shove. (:3208)
- `SPEARS: Record<string, MeleeMove>` A spear: thrust, thrust2, lunge (heavy), sweep (low: trips), shaft (push). (:3210)
- `STAVES: Record<string, MeleeMove>` A staff: swing, backhand, overhead, jab (heavy), sweep, shaft. (:3212)
- `MOVESETS: Record<'FISTS' | 'SWINGS' | 'BLADES' | 'AXES' | 'SPEARS' | 'STAVES', Record<string, MeleeMove>>` The move sets by name. (:3214)
- `ARMS: Record<'bat' | 'pipe' | 'wrench' | 'baton' | 'sword' | 'longsword' | 'dagger' | 'axe' | 'mace' | 'spear' | 'staff', MeleeArm>` Each weapon's numbers for Melee (gs.combat's ARSENAL melee entries are these). (:3216)
- `SHIELD: MeleeShield` How a shield guards by default. (:3218)
  - `arc: number` (:3170)
  - `chip: number` (:3170)
  - `parry: number` (:3170)
- `Reader: new (o?: { window?: number; buffer?: number; dead?: number }) => FightReader` (:3219)
  - `window: number` (:3157)
  - `buffer: number` (:3157)
  - `dead: number` (:3157)
  - `readonly dir: number` (:3157)
  - `feed(x: number, y: number, buttons?: Record<string, boolean>, dt?: number, facing?: number): FightReader` (:3157)
  - `take(b: string): boolean` (:3157)
  - `holding(b: string): boolean` (:3157)
  - `did(cmd: string): boolean` (:3157)
  - `special(moves: Record<string, FightMove>): string | null` (:3157)
  - `clear(): void` (:3157)
- `Fighter: new (moves: Record<string, FightMove>, o?: { x?: number; y?: number; facing?: number; hurt?: FBox[]; hp?: number }) => Fighter` (:3220)
  - `moves: Record<string, FightMove>` (:3159)
  - `x: number` (:3159)
  - `y: number` (:3159)
  - `facing: number` (:3159)
  - `hp: number` (:3159)
  - `maxHp: number` (:3159)
  - `move: string | null` (:3159)
  - `frame: number` (:3159)
  - `stun: number` (:3159)
  - `stop: number` (:3159)
  - `blocking: boolean` (:3159)
  - `blockLow?: boolean` (:3159)
  - `readonly phase: 'start' | 'active' | 'recover' | 'stun' | 'idle'` (:3160)
  - `readonly busy: boolean` (:3160)
  - `on(ev: 'start' | 'active' | 'end' | 'hit' | 'blocked' | 'hurt' | 'block', fn: (...a: Loose[]) => void): Fighter` (:3161)
  - `canCancel(name: string): boolean` (:3162)
  - `start(name: string): boolean` (:3162)
  - `update(dt: number): Fighter` (:3162)
  - `hitboxes(): { x: number; y: number; w: number; h: number }[]` (:3162)
  - `hurtboxes(): { x: number; y: number; w: number; h: number }[]` (:3162)
- `clash(a: Fighter, b: Fighter): { move: FightMove; name: string; blocked: boolean; x: number; y: number } | null` (:3221)
- `Opponent: new (api?: GameApi | null, o?: { name?: string; skill?: Skill; /** false: it never learns the player. */ learn?: boolean; rng?: () => number }) => FightOpponent` new Opponent(api, { name, skill, learn, rng }) in make(); join(its fighter, the player's) each round; think(dt) each frame. (:3223)
- …more: `FightPart` at src/gamescroll.d.ts:3190

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Fighting games** (`gs.fight`): `Reader({ window, buffer })` gets `feed(stickX, stickY, { P, K }, dt,
facing)` each frame (a `gs.controls.Stick` on touch) and keeps the last moments: `did('236P')` for
motions in numpad notation (forward follows `facing`), `special(moves)` for the first move whose
`input` was done, `take('P')` for a press up to `buffer` seconds old. `Fighter(moves, { x, facing, hurt
})`: moves are `{ start, active, recover }` in 60ths of a second with `hit` boxes `[x, y, w, h]` from the
feet (facing right), `stun`, `blockStun`, `stop`, `low`/`high`, `cancel: [names]` (once it has hit);
`start(name)`, `update(dt)`, `phase`. `clash(a, b)` checks a's hit boxes against b's hurt boxes once per
move, sets stun, block stun (b.blocking, b.blockLow) and hit stop, and returns `{ move, blocked, x, y }`.

A ready-made opponent for a fighting game (Tiny Brains): it reads its moves' frames (how far each
reaches, how fast it comes out, whether it is safe when blocked) and learns how this player fights.

```js
const { Fighter, Opponent, clash } = gs.fight;
cpu = new Opponent(api, { skill: .6 });                 // make(): what it learns is kept on the phone
reset() { p1 = new Fighter(MOVES, { x: 100 }); p2 = new Fighter(MOVES, { x: 260, facing: -1 }); cpu.join(p2, p1); }
update(dt) {
  const want = cpu.think(dt);                           // { walk: -1 | 0 | 1, block: false | 'high' | 'low', move: 'jab' | null }
  p2.blocking = !!want.block; p2.blockLow = want.block === 'low';
  if (!p2.busy) p2.x += want.walk * p2.facing * WALK * dt;       // 1 is towards the player
  if (want.move) p2.start(want.move);
  // ...the player's side, p1.update(dt), p2.update(dt), clash() both ways, as before
}
// at the end of a round:
cpu.result(playerWon);
```

From [Action and adventure kits](../maker-kit.md#action-and-adventure-kits):

**The old world's** (`gs.combat` and `gs.fight`): `ARSENAL` has `sword`, `longsword`, `dagger`, `axe`, `mace`, `spear`,
`staff` (their `melee` is `gs.fight.ARMS[kind]`), `shield` (slot `'off'`: a `Loadout` wears it beside what is out, as
`arms.off`) and `bow` (`arms.bow` is its `Bow`, its arrows out of the pouch). `new Bow({ pouch })`: each frame
`bow.update(dt, { pull: held, from: eye, dir: aim, targets: foes })` draws while held (`bow.k` 0..1 over `draw` seconds:
the longer, the faster and harder it flies; held at full past `tire` seconds the aim shakes), looses on letting go (barely
drawn, it is let down), nocks the next; arrows drop as they fly, stop in the game's `World3D` (or your `hits` test) or in a
target (anything with a position, `radius` and `height`; the top tenth is a head shot), stay stuck there and go along with
who they are in (`stuck`; `gather(at)` picks them up). It returns `{ who, thing, at, dir, damage, head }` for each hit;
`bow.show(view.scene, () => gs.models.weapon('arrow'))` keeps an arrow model on each. `weaponSound('bow', 'nock' | 'draw' |
'fire' | 'thunk' | 'flesh')`, and `'clang'`, `'parry'` and `'bash'` for blades and shields.

**Melee in 3D** (`gs.fight`): `Melee(body, { react })` is one person's fists and feet in a 3D world, in frames like the
2D `Fighter` but with a reach, an arc in front and a height where 2D has boxes. `attack('light')` (jab, cross, hook,
uppercut: pressed again in time they chain into a combo, and a press a moment early still counts), `attack('heavy')`
(a kick, a knee), `attack('low')` (a sweep that trips), `attack('push')` (a shove the guard can't stop), `block(held)`
(stops what comes from in front, not from behind), `dodge({ x, z })` (a quick step nothing can hit for most of).
`update(dt, foes)` locks on to the foe in front, turns and steps in to bring the blow into reach (`walk`, `facing`),
and returns what landed: `{ who, damage, blocked, at, push, knock, trip }`. A foe that is a `Melee` gets hit stun and
loses `hp`; one with `react` (a `gs.characters.Reactions` on its body) staggers, trips or falls for real. `pose` and `at`
go to `rig.play(m.pose, { at: m.at, fade: .06 })` (gs.poses has `guard`, `jab`, `cross`, `hook`, `uppercut`, `kick`,
`knee`, `sweep`, `shove`, `stagger`, `dodgeL`, `dodgeR`, `dodgeBack`, and with a bat `swing`, `backhand`, `overhead`).
`moves: SWINGS` with `weapon: { reach, damage }` for a bat, a pipe or a stick. `Brawler({ skill })` is a ready-made
foe: `think(dt, me, foe)` gives `{ walk, face, attack, block, dodge }`: it closes in, circles, throws combos when you
are open, blocks or steps out of what it sees coming no faster than a person, and backs off when hurt.

Swords, axes, spears and shields: `new Melee(body, { weapon: 'sword', shield: true, armour: 'auto' })`. The weapon
(`gs.fight.ARMS`: `sword`, `longsword`, `dagger`, `axe`, `mace`, `spear`, `staff`, and the bat and friends) brings its
move set: `BLADES` (`slash`, `cutBack`, `chop` on light, `thrust` heavy, `lowCut` low), `AXES` (`hack`, `hackBack`,
`cleave` that puts them down, a `hook` on low that pulls the guard aside), `SPEARS` (quick `thrust`s that keep a foe
out, a `lunge`, a `sweep` that trips, a shove with the `shaft`), `STAVES`; a dagger's are quicker and shorter. A
shield's guard covers a wider arc, takes low blows too and lets nothing through, and `'push'` bashes with it, which
can't be blocked and knocks a guard aside. A guard raised just before a blow lands (`parry` frames, 6; 10 with a
shield) parries it: no damage, `hit.parried`, events `'parried'` / `'parry'`, and the one who swung is thrown off
(`stun`) and left `open` a moment. `armour`: 0..1, `{ high, mid, low }`, or `'auto'`, which reads what a `gs.models.human`
body wears (`body.armour.worn`) where the blow lands: plate takes most of a cut, less of a thrust (`edge: 'point'`) and
much less of a mace (`'blunt'`); `hit.soaked` says how much. The guard's pose is `m.guardPose` (`armed`, `shieldUp`,
`spearGuard`); gs.poses also has `slash`, `cutBack`, `chop`, `thrust`, `lowCut`, `bash`, `axeHook`, `spearThrust`,
`spearLunge`, `spearSweep`, and `bowReady` and `bowDraw` (`{ at: bow.k }`: side on, the bow arm out along the body's
forward, the string to the jaw). The things in the hands: `gs.models.weapon('sword')` and the rest (below) with a
`gs.characters.Carry`, whose hand holds them through the poses; a bow model's `pull(bow.k)` draws its string, `load(arrow)`
puts an arrow on it. A `Brawler` with a shield and skill parries some of what comes.

## In real games

No game uses `gs.fight` yet: the examples above are what there is.
