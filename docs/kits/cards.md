# gs.cards

Card decks, totals, groups, poker hands, winners, stacks.

`gs.cards` (`Deck`, `total`, `groups`, `poker`, `winners`, `stacks`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CardsPart`, line 5549), where every option and field is described.

- `SUITS: string[]` (:5550)
- `SUIT_SIGN: Record<string, string>` (:5550)
- `card(suit: string, rank: number): Card` (:5551)
- `Deck: new (o?: { suits?: string[]; ranks?: number[]; jokers?: number; decks?: number; seed?: number | null; cards?: Card[] | null }) => { cards: Card[]; discards: Card…` (:5552)
- `sort(cards: Card[], o?: { by?: 'suit' | 'rank'; aceHigh?: boolean; suits?: string[] }): Card[]` (:5557)
- `total(cards: Card[], o?: { face?: number; limit?: number; aceHigh?: number }): { total: number; soft: boolean; bust: boolean }` (:5558)
- `groups(cards: Card[], o?: { min?: number; aceHigh?: boolean }): { sets: Card[][]; runs: Card[][] }` (:5559)
- `poker(cards: Card[]): { name: string; describe: string; rank: number; cards: Card[]; solved: Loose }` (:5560)
- `winners(hands: Card[][]): number[]` (:5561)
- `stacks(a: Card, b: Card | null, o?: { down?: boolean; alternate?: boolean; sameSuit?: boolean }): boolean` (:5562)

## From the maker kit

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Cards** (`gs.cards`): `Deck({ seed, jokers, decks })` shuffles, deals, draws (reshuffling the discards
when it runs out) and saves to `api.save`. `total()` scores a blackjack-style hand, `groups()` finds
sets and runs for rummy, `poker()` names the best hand (pokersolver) and `winners()` compares them,
`stacks()` checks patience moves. Cards are plain `{ suit, rank, name, red }` objects: draw them in
your style. No real-money gambling.

## In real games

3 games use it (`node scripts/examples.mjs gs.cards` lists them). The shortest:

`src/games/higher-lower.js` (Higher or Lower, Casual · Cards, 76 lines):

```js
const { icon } = gs.icons;
const { Deck } = gs.cards;
// …
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const deck = new Deck();   // 52 cards, ace low
// …
  let cur, prev, pot, bank, run, t, msg, flip, streak;
  function draw1() { if (deck.empty) deck.reset(); return deck.top(); }
// …
  return {
    reset() { deck.reset(); bank = 0; run = 0; t = 0; msg = null; flip = 0; next = false; lastRun = false; feel.clear(); newRun(); },
```

`src/games/sevens-cards.js` (Sevens, Casual · Cards, 110 lines):

```js
const { Feel } = gs.effects;
const { Deck, SUITS, SUIT_SIGN, sort } = gs.cards;
// …
    round++;
    const deck = new Deck(); deck.shuffle();
    hands = deck.deal(4, 13).map(h => sort(h, { by: 'suit' }));
// …
      const cw = 22, ch = 34;
      SUITS.forEach((s, si) => {
```
