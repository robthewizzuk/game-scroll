# gs.trivia

About 2,700 quiz questions, seeded, with no repeats.

`gs.trivia` (lazy: `Quiz` of 2,700 questions, seeded, no repeats, `climb`, `fifty`; show `CREDIT`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`TriviaPart`, line 5561), where every option and field is described.

- `Quiz: new (o?: { categories?: string | string[] | null; difficulty?: 'easy' | 'medium' | 'hard' | ('easy' | 'medium' | 'hard')[] | null; kind?: 'choice' | 'truefalse' …` A quiz from the question bank (loads on first use: make it in make() or reset()). (:5563)
- `categories(): { id: string; name: string; count: number }[]` (:5568)
- `CREDIT: string` (:5569)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Quiz questions** (`gs.trivia`, about 2,700 from the Open Trivia Database, CC BY-SA 4.0; loads on
first use, so make it in `make()` or `reset()`): games can't carry data files, so the bank lives here.
`categories()` lists `{ id, name, count }` (general, animals, geography, history, science, maths,
computers, sports, art, myths, vehicles, books, music; grown-up topics left out). `new Quiz({ categories,
difficulty, kind: 'choice' | 'truefalse', climb, seed })` deals them in a seeded order with no repeats
(`gs.math.daily('quiz')` for the same quiz for everyone today). `next()` gives `{ text, answers, kind,
difficulty, category }` with the answers shuffled (the right one isn't in it); `answer(i)` gives `{ right,
correct, streak, score }`; `timeout()` is a miss; `fifty()` is two wrong answers to take away; with
`climb: 3` it starts easy and steps up after three right in a row, down after a miss. `pack()` is a tiny
save to `resume` from. Show `CREDIT` somewhere in the game: the licence asks for it.

## In real games

No game uses `gs.trivia` yet: the examples above are what there is.
