# gs.ui

Flexbox layout and input for menus, with no look of its own.

`gs.ui` (lazy: `UI` flexbox layout and input with no look; you draw it).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`UIPart`, line 5433), where every option and field is described.

- `UI: new (w: number, h: number, tree?: Loose) => On<UINode> & { root: UINode | null; w: number; h: number; readonly focusable: UINode[]; readonly focused: UINode | null…` Flexbox layout (Yoga) and input with no look: your game draws every box. (:5435)
- `wrap(c: CanvasRenderingContext2D, text: string, width: number): string[]` Splits text into lines that fit width (with c's current font). (:5443)

## From the maker kit

From [What `gs` has, and what it doesn't](../maker-kit.md#what-gs-has-and-what-it-doesnt):

**Big parts load when first used.** Physics, 3D physics, 3D path finding, 3D extras, face tracking, Tone.js, the
dictionary (`gs.words`) and the UI layout engine (`gs.ui`) are a
few MB, so the app loads them the first time a game needs them. Create those things in `make()` or
`reset()`: if the library isn't in yet, the app shows "Loading…" on the card and makes your game
again once it is. Don't create them later (in `update()` or a tap), or the game will stop with an error.

From [Worlds, craft, soft things, cards and menus](../maker-kit.md#worlds-craft-soft-things-cards-and-menus):

**Menus and HUDs with no look** (`gs.ui`, Yoga flexbox; loads on first use): describe boxes (`dir`, `gap`,
`pad`, `grow`, `justify`, `align`, `w`/`h` in units or `'%'`, `scroll: 'y'` lists, `at` for overlays)
and `UI(W, H, tree)` works out where each goes. It handles taps, holds, drags, scrolling with
momentum, and moving focus with arrows or a controller (`key()`), and sends `tap`, `hold`, `drag`
and `back` events. `ui.each((node, box) => ...)` hands you every visible box with its state
(`pressed`, `focused`, `press` for a bounce, your own `data`) and you paint it however your game
looks. `wrap(c, text, width)` splits text into lines.

## In real games

No game uses `gs.ui` yet: the examples above are what there is.
