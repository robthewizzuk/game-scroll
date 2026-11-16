# gs.gfx

Shaded 2D shapes, glows, backdrops and materials made in code (wood, stone, metal, water...).

`gs.gfx` (shaded 2D shapes, glow, backdrops; materials made in code: `material('paper'|'wood'|'stone'|'metal'|'cloth'|'water', { color, seed, scale, planks, blocks })` then `c.fillStyle = m.at(x, y)`, `slab(c, x, y, w, h, m, { r, bevel, shadow })`, `water(c, x, y, w, h, t)`, `sticker(w, h, draw, { outline, glow, shadow })` then `.draw(c, x, y, { scale, angle })`)

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`GfxPart`, line 637), where every option and field is described.

- `shade(hex: string, amt: number): string` (:638)
- `shadow(c: Ctx, x: number, y: number, rx: number, ry?: number, a?: number): void` (:639)
- `box(c: Ctx, x: number, y: number, w: number, h: number, col: string, o?: { r?: number; drop?: boolean; rim?: boolean }): void` (:640)
- `ball(c: Ctx, x: number, y: number, r: number, col: string, o?: { gloss?: number }): void` (:641)
- `glow(c: Ctx, x: number, y: number, r: number, col: string, a?: number): void` (:642)
- `backdrop(c: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string): void` (:643)
- `post(c: Ctx, w: number, h: number): void` (:644)
- `readonly MATERIALS: Readonly<Record<MaterialName, string>>` The materials, and the colour each starts as. (:646)
- `material(name: MaterialName | Material2D, o?: MaterialOptions): Material2D` A material made in code, to fill shapes with (no image files; worked out once and remembered). (:652)
- `texture(name: MaterialName, o?: MaterialOptions & { px?: number }): { size: number; data: Uint8ClampedArray }` A material's tile as numbers: a size x size RGBA picture that repeats without a seam (px: its size, 256). (:654)
- `slab(c: Ctx, x: number, y: number, w: number, h: number, mat?: MaterialName | Material2D, o?: { r?: number; bevel?: number; shadow?: boolean | number; tint?: string | …` A block of a material: rounded corners, lit from the top left, a soft shadow under it. (:660)
- `water(c: Ctx, x: number, y: number, w: number, h: number, t?: number, o?: { color?: string; deep?: string | null; light?: string; strength?: number; scale?: number; fl…` Water in a rectangle with light moving on it. (:666)
- `sticker(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, o?: { outline?: string; width?: number; glow?: string; glowSize?: number; shadow?: boolean …` Keeps a drawing as a picture (one drawImage however much went into it) and adds the looks that are slow to draw every frame: an outline, a glow, a soft shadow. (:671)

## From the maker kit

From [2D materials, slabs, water and stickers](../maker-kit.md#2d-materials-slabs-water-and-stickers):

`const { material, slab, water, sticker } = gs.gfx;`

Looks for the smooth 2D styles, made in code (no image files): six materials that tile without a seam,
blocks of them with lit edges and soft shadows, water with light moving on it, and stickers, which keep
any drawing as a picture with an outline, a glow and a shadow already on it.

```js
reset() {
  wood = material('wood', { color: '#a9703f', planks: 4 });     // made once (some tens of ms), then remembered
  coin = sticker(40, 40, g => { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(20, 20, 16, 0, 7); g.fill(); },
    { outline: '#5a3d00', glow: '#fff3a0', shadow: true });
}
draw(c) {
  slab(c, 20, 500, 320, 60, wood, { r: 8 });                    // a lit, rounded plank with a soft shadow
  c.fillStyle = material('stone').at(x, y); c.beginPath(); c.arc(x, y, 30, 0, 7); c.fill();   // any shape
  water(c, 0, 560, W, 80, t);                                   // t: the game's own clock, in seconds
  coin.draw(c, x, y, { scale: 1 + .1 * Math.sin(t * 6), angle: t });
}
```

- `material(name, { color, seed, scale, contrast })` gives the material; the same options give the same
  one back, so asking again in `draw()` is cheap, but make them in `make()` or `reset()` so the first
  frame doesn't wait. `color` is its main colour, `seed` a different piece of it, `scale: 2` makes the
  grain twice as big (one tile covers 128 game units at 1), `contrast: 0` to `2` flattens or deepens it.
- `c.fillStyle = m.at(x, y)` fills any shape with the texture's corner at (x, y), so a crate that moves
  carries its grain with it. `m.pattern` is the same fixed at 0, 0 (a floor that things move over).
  `m.tile` is the picture itself, for `drawImage`.
- `slab(c, x, y, w, h, material, { r, bevel, shadow, tint, anchor })` draws a block of it: rounded
  corners (`r`, 6), a lit top left edge and dark bottom right (`bevel`, 2; 0 for flat), a soft shadow
  (`shadow: false` to leave it out, or a number for how far it drops) and `tint: '#ff000040'` to wash a
  colour over it. `anchor: [0, 0]` cuts every slab from one big sheet instead of each carrying its own.
- `water(c, x, y, w, h, t, { color, deep, light, strength, scale, flow })` fills a rectangle with water
  and a net of light that drifts. For a pond or river of another shape, `c.clip()` to the shape first.
  This is a look; for water that pushes things, see `gs.flow`.
- `sticker(w, h, draw, { outline, width, glow, glowSize, shadow, shadowBlur, shadowY })` runs
  `draw(g, w, h)` once into a picture as sharp as the screen, adds the outline, glow and shadow, and
  `sticker.draw(c, x, y, { scale, angle, alpha, flip, anchor })` is then one `drawImage` however much
  went into it. Use it for anything drawn many times or with looks that are slow every frame
  (`shadowBlur`, gradients, text with an outline). `sticker.redraw()` after what it shows changes.
- These are for the Phone style and for 2D drawn over 3D. Pocket, Color and Advance games keep to their
  palettes and whole pixels.

From [Sketchy shapes and ink](../maker-kit.md#sketchy-shapes-and-ink):

- A shape is worked out once and remembered, wherever it is drawn, so moving it is free and its wobble
  stays put instead of crawling. A shape that changes size is worked out again at each new size (sizes
  are kept to half a unit), so grow things in steps or keep them in a `gs.gfx.sticker`.

From [Icons](../maker-kit.md#icons):

- `path(name)` gives the icon as a `Path2D` on a 512 by 512 grid, to fill with a gradient or a
  `gs.gfx` material, or to clip with.

## In real games

11 games use it (`node scripts/examples.mjs gs.gfx` lists them). The shortest:

`src/games/build-rush.js` (Build Rush, Bricks · Speed, 101 lines):

```js
const { rnd } = gs.util;
const { backdrop } = gs.gfx;
// …
      const C = cell(), bookW = 10 * C + 16, bx = (W - bookW) / 2, by = 18, bookH = 8 * C;
      backdrop(c, 0, 0, W, H, '#f6efe2', '#ddd2bd');
// …
      // booklet page
      c.fillStyle = '#0000002a'; c.fillRect(bx + 2, by + 3, bookW, bookH + 14); backdrop(c, bx, by, bookW, bookH + 14, '#ffffff', '#f2eee6'); c.stroke
// …
      // tray
      const sl = slots(), trayTop = sl.reduce((m, s) => Math.min(m, s.y), H) - 6; backdrop(c, 0, trayTop, W, H - trayTop, '#6a7182', '#3c414e'); c.fil
// …
      const sx = shake > 0 ? Math.sin(shake * 80) * 2 : 0;
      for (const s of sl) { backdrop(c, s.x + 2 + sx, s.y + 2, s.w2 - 4, s.h2 - 4, '#2e333e', '#474d5c'); const bw = s.w * C; brick(c, s.x + (s.w2 - b
```

`src/games/pile-builder.js` (Pile Builder, Bricks · Puzzle, 122 lines):

```js
const { clamp, rnd } = gs.util;
const { backdrop, glow } = gs.gfx;
// …
      for (const o of obs) {
        if (o.k === 'gap') { seg(x0, o.x - 12, lift); x0 = o.x + 12; backdrop(c, o.x - 12, g() - lift + 4, 24, H, '#183048', '#04080c'); if (o.built) 
```
