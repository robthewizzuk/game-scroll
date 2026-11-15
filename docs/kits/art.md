# gs.art

Seeded art made in code: creatures, faces, items, buildings, sprites, names.

`gs.art` (seeded `creature`, `face`, `item` with rarity, `building`, pixel `sprite`, `name`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`ArtPart`, line 3231), where every option and field is described.

- `creature(seed: number, o?: ArtLook): ArtCreature` (:3232)
- `face(seed: number, o?: { skin?: string; hair?: string }): ArtFace` (:3232)
- `item(seed: number, kind?: ArtItem['kind'] | null, o?: ArtLook): ArtItem` (:3233)
- `building(seed: number, o?: ArtLook): ArtBuilding` (:3233)
- `sprite(seed: number, w?: number, h?: number, colours?: string[], o?: { fill?: number }): ArtSprite` (:3234)
- `name(seed: number, kind?: 'person' | 'place' | 'thing'): string` (:3234)

## From the maker kit

From [Game kits](../maker-kit.md#game-kits):

**Procedural art** (`gs.art`): the same seed always gives the same thing, drawn in code.
`creature(seed, { hue })` (body, legs, eyes, horns, wings: read them for the rules),
`face(seed)` (draw with a mood -1..1), `item(seed, 'sword' | 'potion' | 'gem' | 'shield' | 'key' | 'ring')`
(with a `rarity` and `power`), `building(seed)` (draw with night 0..1 for lit windows), `sprite(seed, w,
h, palette)` (a mirrored pixel sprite for the Pocket styles), `name(seed, 'person' | 'place' | 'thing')`.
Each has `draw(c, x, y, size)`; `{ hue }` or `{ palette }` keeps a set in one colour family.

From [A camera that knows things](../maker-kit.md#a-camera-that-knows-things):

- **`Scanner({ kinds, every, shape, camera })`**: reads QR codes and the striped codes on anything from
  a cereal box to a library book (`Scanner.kinds`: `'qr'`, `'ean-13'`, `'ean-8'`, `'upc-a'`, `'upc-e'`,
  `'code-128'`, `'code-39'`, `'code-93'`, `'codabar'`, `'itf'`, `'data-matrix'`, `'aztec'`, `'pdf417'`).
  - `scan()`: the code that has just been read, **once** each time one comes into view (else null):
    `{ text, kind, seed, x, y, w, h, left, top, corners }`.
  - `seed` is a whole number made from the text, the same for the same code on every phone and far
    apart for codes one digit apart: hand it to `gs.art.creature(seed)`, `gs.gen.dungeon(40, 30, { seed })`,
    `gs.math.rng(seed)`. A whole kitchen becomes a deck of monsters.
  - `code` is the code in view now (or null), `list` all of them, `backend` which reader is at work.
  - `Scanner.seed('any text')` gives the seed for a typed word.

```js
reset() { scanner = new Scanner({ shape: 1 }); monster = null; }
down(x, y) { if (shuffle.hit(x, y)) monster = gs.art.creature(Math.random() * 1e9 | 0); else scanner.start(); }   // "Surprise me"
update(dt) { scanner.update(); const code = scanner.scan(); if (code) { monster = gs.art.creature(code.seed); feel.powerup(W / 2, H / 2); } }
draw(c) { if (scanner.picture) c.drawImage(scanner.picture, 30, 60, 300, 300); /* a square window onto the camera */ }
```

## In real games

1 game uses it (`node scripts/examples.mjs gs.art` lists them). The shortest:

`src/games/liars-lantern.js` (Liar’s Lantern, Board · Deduction, 208 lines):

```js
const { haptic } = gs.device;
const { face } = gs.art;
// …
      if (drop) { g.visible = false; T.tween(.01, null, { delay: i * .09 }).then(() => T.drop(g, { from: 3, time: .4 })); }
      return { g, body, e, mark, face: face(v.seed), p };
```
