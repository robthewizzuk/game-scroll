# gs.cards

Card decks, totals, groups, poker hands, winners, stacks.

`gs.cards` (`Deck`, `total`, `groups`, `poker`, `winners`, `stacks`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`CardsPart`, line 5377), where every option and field is described.

- `SUITS: string[]` (:5378)
- `SUIT_SIGN: Record<string, string>` (:5378)
- `card(suit: string, rank: number): Card` (:5379)
- `Deck: new (o?: { suits?: string[]; ranks?: number[]; jokers?: number; decks?: number; seed?: number | null; cards?: Card[] | null }) => { cards: Card[]; discards: Card…` (:5380)
- `sort(cards: Card[], o?: { by?: 'suit' | 'rank'; aceHigh?: boolean; suits?: string[] }): Card[]` (:5385)
- `total(cards: Card[], o?: { face?: number; limit?: number; aceHigh?: number }): { total: number; soft: boolean; bust: boolean }` (:5386)
- `groups(cards: Card[], o?: { min?: number; aceHigh?: boolean }): { sets: Card[][]; runs: Card[][] }` (:5387)
- `poker(cards: Card[]): { name: string; describe: string; rank: number; cards: Card[]; solved: Loose }` (:5388)
- `winners(hands: Card[][]): number[]` (:5389)
- `stacks(a: Card, b: Card | null, o?: { down?: boolean; alternate?: boolean; sameSuit?: boolean }): boolean` (:5390)

## From the maker kit

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Cards** (`gs.cards`): `Deck({ seed, jokers, decks })` shuffles, deals, draws (reshuffling the discards
when it runs out) and saves to `api.save`. `total()` scores a blackjack-style hand, `groups()` finds
sets and runs for rummy, `poker()` names the best hand (pokersolver) and `winners()` compares them,
`stacks()` checks patience moves. Cards are plain `{ suit, rank, name, red }` objects: draw them in
your style. No real-money gambling.

## In real games

1 game uses it (`node scripts/examples.mjs gs.cards` lists them). The shortest:

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
