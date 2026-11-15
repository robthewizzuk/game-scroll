---
name: make-game
description: Make a new Game Scroll mini game (one file in src/games/) from an idea, using the gs kit, then lint, build and smoke-test it. Use when asked to make, add or prototype a game.
---

# Make a Game Scroll game

Follow AGENTS.md at the repo root. In short:

1. **Idea.** If none was given, propose three original ideas that play differently from the games in
   `src/games/` (check their `title`, `tag`, `hint`) and from `docs/game-ideas.md`, and pick the
   strongest unless the user wants to choose. No recreations of existing games.
2. **Style and id.** Choose the style (phone, pocket, color, advance, console, nextgen, ar) and a
   lowercase, dashed id that isn't taken. Run `npm run new <id> --style <style> --title "<Title>"`.
3. **Write it** in `src/games/<id>.js`. Keep the numbers that set how it feels in the template's knobs block
   (`gs.tweak('Feel', { ... })`, `docs/feel-words.md`); when asked to change the feel, change knobs
   (`node scripts/knobs.mjs <id> speed*0.8`) and say what moved by how much. Only `import gs from '../gamescroll.js'`. Use `gs.effects.Feel`
   for game feel, and the other `gs` parts (physics, ai, pixel, controls, moves, math) instead of
   hand-rolled versions. All round state in `reset()`. Touch must work on its own. Set a fair `goal`.
4. **Check and fix until clean:** `node scripts/check.mjs <id>` runs everything below in one go and gives one
   report with the line and a fix for each problem; fix, then run it again (`--quick` for the code checks alone).
   To see how a gs part is used in a real game: `node scripts/examples.mjs <name>`. The checks one by one:
   - `node scripts/game-lint.mjs <id>` (fix what it flags; read its kit hints and take the ones that fit)
   - `node scripts/game-types.mjs <id>`
   - `node scripts/unique.mjs <id>` (its nearest games: if one is a near-twin, change the mechanic, not the names)
   - `npm run games`
   - `npm run build:bundled && node scripts/smoke.cjs <id>`
   - `node scripts/fold.cjs <id>` (and `node scripts/sweep.cjs <id>` for console / nextgen)
5. **Look at it.** Take a screenshot during play (`SHOTS=<dir> node scripts/smoke.cjs <id>`) and check
   it reads well on a phone: big enough targets, clear HUD, the style's colour rules.
6. Report what the game is, how it plays and what the checks said. Change only `src/games/<id>.js`
   (and optionally `docs/game-ideas.md`).
