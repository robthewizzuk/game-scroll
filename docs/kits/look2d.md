# gs.look2d

2D lights and shadows (glowing on the graphics chip), screen effects, thousands of sprites.

`gs.look2d`: `Lights` (darkness, coloured lights, shadows off walls; `glow: true` works it out on the graphics chip: soft shadows, colours that mix, and whatever `emit(c)` paints in `draw(c, lights, { walls, emit, block })` glows and lights the room in its own shape), `Screen` (lazy: crt, bloom, grade, glitch, film, shockwave...), `Batch` (lazy: thousands of WebGL sprites).

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`Look2dPart`, line 1565), where every option and field is described.

- `Screen: new (effects?: Partial<Record<ScreenEffect, object | boolean | null>>) => { set(effects: Partial<Record<ScreenEffect, object | boolean | null>>): Loose; filter…` Whole-screen effects with pixi-filters (lazy). (:1570)
- `Batch: new (w: number, h: number, o?: { pixel?: boolean }) => { texture(src: Loose, w?: number, h?: number): Loose; add(tex: Loose, x?: number, y?: number, o?: { scale…` Fast WebGL sprites with PixiJS (lazy). (:1572)
- `loadLook2D(): Promise<Loose>` (:1573)

## From the maker kit

From [2D lights and screen effects](../maker-kit.md#2d-lights-and-screen-effects):

`gs.look2d.Lights(W, H, { dark: .85 })` draws darkness with lights cut out of it:
`lights.draw(c, [{ x, y, r, color, cone, dir, flicker }], { walls: map, cam })`. Walls (a TileMap,
anything with `ray()`, or `[x1, y1, x2, y2]` segments) cast real shadows. `pixel: true` bands the
light for pixel styles.

**Light that glows** (`new Lights(W, H, { glow: true })`): the light is worked out on the graphics chip
with 2D radiance cascades (Sannikov 2023). Light leaves each light's bright middle (`size`, in game
units) and anything `emit(c)` paints, runs across the screen, stops at walls (a TileMap or segments)
and at whatever `block(c)` paints, and soaks round corners: shadows are soft far from what casts them
and sharp close to it, coloured lights mix where they meet, and a lava pool or a neon tube lights the
room in its own shape. It costs the same for one light or forty.

```js
lights = new Lights(W, H, { glow: true, dark: .9 });
lights.draw(c, [{ x: hero.x, y: hero.y, r: 120, color: '#ffb35a' }], {
  walls: map,
  emit: c => { c.fillStyle = '#ff6a10'; c.fill(lavaPath); },   // glows, and is drawn sharp on top
  block: c => { for (const p of pillars) { c.beginPath(); c.arc(p.x, p.y, 16, 0, 7); c.fill(); } },
});
```

Options: `res` (texels a game unit; picked for the phone), `bright` (how brightly `emit` paint shines,
3), `haze` (glow added round bright light, .3), `sky` (a colour coming in from past the screen's
edges), `steady` (.75: how much of the last frames is kept, which smooths the light; moving lights
and the camera are followed at once). `lights.glowing` says whether the chip is doing it; where it
can't (no WebGL2 half-float pictures), the canvas lights draw instead and `emit` is added on top, so
a game looks right either way. `node scripts/glow.cjs out.png` draws test scenes both ways.

`Screen({ crt: true, bloom: { threshold: .6 } })` (PixiJS and pixi-filters, loaded on first use) runs
the whole frame through effects: call `screen.apply(c)` last in `draw`. Effects: `crt`, `bloom`,
`grade`, `pixelate`, `glitch`, `rgbSplit`, `film`, `shockwave` (`screen.shock(x, y)`), `godrays`,
`zoomBlur`, `blur`, `outline`, `grayscale`, with their pixi-filters options. Reduce motion turns off
the shaky ones. `Batch(W, H)` draws thousands of sprites with WebGL: `batch.texture(sprite)`,
`batch.add(tex, x, y)`, `batch.draw(c)`.

## In real games

No game uses `gs.look2d` yet: the examples above are what there is.
