# gs.companions

Up to three companions who follow, talk and fight as guard, healer, archer or caster, with an order wheel and approval.

`gs.companions.Companions(api, { hero, coach: true })` (up to three who follow, talk and fight as `guard`, `healer`, `archer` or `caster`: `join(body, { name, role, stats, unit, spells, likes })`, `update(dt, { foes })` returns how fast the world runs, then each one's `goal`, `run`, `act`, `target` and `events` (swings, shots, lines); an order `wheel` that slows time (`open`, `at`, `pick`); `tactics` that `correct(m, 'heal')` teaches; approval from a gs.rpg Reputation's deeds, moods, leaving).

Guide: [Companions](../maker-kit.md#companions).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CompanionsPart`, line 2740), where every option and field is described.

- `Companions: new (api: Loose, o?: { hero?: Loose; max?: number; magic?: Loose; reputation?: Loose; coach?: Loose; talk?: number; banter?: number; leaveAt?: number; leav…` api: the game's api (the coach keeps its corrections). (:2742)
  - `members: Companion[]` (:2720)
  - `events: CompanionEvent[]` (:2720)
  - `max: number` (:2720)
  - `wheel: CompanionWheel` (:2720)
  - `fighting: boolean` (:2720)
  - `hero: Loose` (:2720)
  - `on(type: CompanionEvent['type'] | '*', fn: (e: CompanionEvent) => void): CompanionParty` (:2721)
  - `join(body: Loose, o?: { name?: string; role?: CompanionRole; stats?: Loose; unit?: Loose; health?: () => number; person?: Loose; spells?: Companion['spells']; likes?: …` Adds one (null when full). (:2723)
  - `leave(m: Companion): CompanionParty` (:2724)
  - `clear(): CompanionParty` (:2724)
  - `find(name: string): Companion | null` (:2724)
  - `update(dt: number, o?: { foes?: Loose[]; hero?: Loose }): number` Decides for everyone; returns how fast the world runs now (the wheel slows it). (:2726)
  - `command(id: string, o?: { who?: Companion | null; target?: Loose; at?: Loose; for?: number }): boolean` An order for all (or who): 'attack', 'hold', 'heal', 'focus', 'back', 'follow'. (:2728)
  - `deed(id: string, o?: { seen?: boolean; by?: number }): CompanionParty` A deed the hero did: those who care like or dislike it (a gs.rpg Reputation's deeds arrive by themselves). (:2730)
  - `gift(m: Companion, n?: number): CompanionParty` (:2731)
  - `say(m: Companion, kind: string, o?: { force?: boolean; foe?: Loose }): CompanionEvent | null` (:2732)
  - `correct(m: Companion, action: CompanionAct): CompanionParty` Tiny Brains coach: "here, this one should have done action". (:2734)
  - `avoid(m: Companion, action?: CompanionAct): CompanionParty` "Not what you just did, here." (:2736)
  - `coachFor(role: CompanionRole): Loose` (:2737)
  - `pack(): Loose[]` (:2738)
  - `unpack(d: Loose[]): CompanionParty` (:2738)
- `ACTIONS: readonly CompanionAct[]` (:2743)
- `ROLES: Readonly<Record<CompanionRole, { keep: number; reach: number; acts: CompanionAct[]; every: Record<string, number>; slot: [number, number]; brave: number }>>` (:2744)
- `ORDERS: readonly { id: string; label: string; icon: string }[]` (:2745)
- `MOODS: readonly { id: string; at: number }[]` (:2746)
- `LINES: Readonly<Record<string, string[]>>` (:2747)
- `BANTER: readonly [string, string][]` (:2748)
- `Companion: Loose` (:2749)
- `Wheel: Loose` (:2749)

## From the maker kit

From [Companions](../maker-kit.md#companions):

`gs.companions.Companions(api, { hero, coach: true })` keeps up to three friends who follow the hero, talk and fight in roles. The kit decides; your game moves and draws them.

```js
const { Companions } = gs.companions;
make() { party = new Companions(api, { hero: heroBody, coach: true }); }
reset() {
  party.clear();
  party.join(bran, { name: 'Bran', role: 'guard', stats: branStats, likes: { rescue: 3, steal: -6 } });
  party.join(mira, { name: 'Mira', role: 'healer', stats: miraStats, unit: magic.unit(mira, { team: 'hero', stats: miraStats }), spells: { heal: 'mend', attack: 'spark' } });
}
update(dt) {
  const slow = party.update(dt, { foes });                 // the world runs at dt * slow (the wheel slows it)
  for (const m of party.members) walk(m.body, m.goal, m.run, dt * slow);
  for (const e of party.events) {
    if (e.type === 'swing' || e.type === 'shoot') hurt(e.target, 8);
    if (e.type === 'say') bubble(e.who, e.text);
  }
}
```

- **Roles** (`ROLES`): `guard` stands between the hero and whatever is on it, taunts and swings; `healer` heals whoever is lowest; `archer` keeps her distance and shoots; `caster` casts. With a gs.magic unit and `spells`, heals and spells are cast through Magic by themselves; otherwise each is an event for the game.
- **Each frame** a companion gives `goal` (where to walk), `run`, `face`, `act` (`follow`, `attack`, `shoot`, `cast`, `heal`, `guard`, `hold`, `retreat`, `down`) and `target`.
- **Order wheel**: `party.wheel.open()` on a long press slows the world (`slow: 0` pauses). `wheel.at(dx, dy)` is the item under the finger, measured from the centre as a part of the radius. `wheel.pick(item, { target })` gives the order. The orders are attack, hold here, heal me, all on it, fall back and follow; `command(id, { who })` does the same in code.
- **Tactics** (`m.tactics`): `stance` (bold, steady, careful or passive), `healAt` (0 to 1) and `focus` (nearest, weakest, strongest, or the one on the hero). These are a menu's worth of settings. With `coach: true`, `party.correct(m, 'heal')` means "here you should have healed". After a couple of those, it does so in spots like that. `party.avoid(m)` means "not that, here". The corrections are kept with the game's brains.
- **Approval** (-100 to 100, `m.mood` from fed up to devoted): `likes` maps deeds to how much each one cares. A gs.rpg Reputation's deeds reach them by themselves, `party.deed(id)` covers the game's own, and `party.gift(m)` covers a kindness. A fed-up companion may refuse orders, and at `leaveAt` it leaves.
- **Talk**: lines for joining, fights, getting hurt, healing, orders, approval and quiet moments (`LINES`, or your own in `lines`). Two of them banter when nothing happens. With `voice: true`, a gs.models person in `person` speaks the line.
- `pack()` / `unpack()` keep approval and tactics in a save.

## In real games

No game uses `gs.companions` yet: the examples above are what there is.
