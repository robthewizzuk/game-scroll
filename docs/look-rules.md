# Look rules for Next Gen games

What makes a 3D game on a phone look like a real place is mostly not more triangles. It is one clear mood carried
by everything at once, surfaces that have been used, and light that has somewhere to go. These are the rules we
hold Next Gen games to. `node scripts/game-lint.mjs <id> --hints` (and `node scripts/check.mjs <id>`) gives a hint
when a Next Gen game uses none of them.

## 1. Pick one mood and commit to it

One line sets the sky colour, fill light, the sun's colour and height, haze and mist, how wet it is, the colour grade
and film look, glare, sun shafts and light beams, bloom, the eye adapting, lens flare and dirt, and a film finish:

```js
v.look('rainy dusk');          // or 'golden hour', 'overcast', 'night rain', 'fog'
v.look('golden hour', { air: { haze: .002 }, film: null });   // change any part of it
```

Make the `gs.sky.Weather` first and `v.look()` sets it raining or dry to match. A low sun is almost always better
than a high one: long shadows show the shape of everything. Keep the sun's colour and the shadows' colour apart
(warm light, cool shade, or the other way round).

## 2. Nothing is new

Clean flat colours read as a toy. Every surface should look like it has been somewhere:

- Use material recipes, not plain colours, for anything big: `gs.models.material('corrugated', { wear: .6 })`.
  `paint`, `hull` and `corrugated` have paint damage built in (chips to the undercoat, stains round the chips, rust
  running down from them; `wear` 0..1). There are 34 recipes: `gs.models.materials`.
- `gs.models.wear(mesh)` rubs edges, puts grime in creases and near the ground, moss or snow on top.
- Put marks on things: `v.decal(mesh, point, normal, gs.hd.mark('rust'))`. Warning signs, stencilled numbers,
  stripes, rust runs, damp stains, oil, scorches, cracks, bullet holes, made-up logos and graffiti, each worn by a
  distress pass. A few in the places people look (doors, corners, where things meet the ground) beat many spread out.

## 3. Let the world vary

`v.air()` turns on `macro` (.5 by default): tone and roughness drift a little over a few metres on everything that
stays put, so two walls of the same material don't match and a repeating texture stops showing. Turn it up for big
open ground, down to 0 for a clean lab.

## 4. Rain changes everything

With `wet` (or a `gs.sky.Weather` raining) rough things that drink water (concrete, asphalt, cloth, wood) go much
darker and richer; metal, glass and paint only get a film. Flat ground holds puddles that ring as drops land, walls
get running streaks, smooth things bead. A wet night street is the single cheapest way to make a scene look rich:
lamps (`v.placeLamps`) reflect long in the wet ground.

## 5. Give light something to do

- Beams (`v.beams`) need gaps: slats, fences, trees, a doorway. Fog (`v.look('fog')`) makes them read.
- Bloom is for lights and glints, not for white walls; keep `v.bloom` under 1.
- Glare and lens flare only when the sun or a lamp is actually in view.

## 6. Finish the picture like a camera would

`v.film` (grain, halation round bright things, a little fringing), a look table (`v.lut`) and the eye adapting
(`v.autoExposure`) are what take a render to a photograph. `v.look()` sets all three; tune them down rather than off.

## 7. Check on a phone

Every one of these is cheap, and the quality tiers turn the expensive ones (beams, froxel fog) off on smaller
phones by themselves. Still: `npm run speed <id>` after a look pass, and look at the game on a low phone tier.
