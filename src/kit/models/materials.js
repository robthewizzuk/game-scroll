// gs.models.material(name, options): a ready material from a recipe (recipes.js), painted into tiling
// textures in code (no image files), kept across launches (cache.js). On WebGPU it also gets the
// recipe's own finest layers worked out per pixel up close (no blur however near the camera gets),
// and can be laid on without UVs (solid) or without visible repeats (scatter).
// Kit use only: games reach it as gs.models.material.
import { JS } from './ops.js';
import { RECIPES, NAMES } from './recipes.js';
import { seeded, paintRecipe } from './recipe-paint.js';
import * as cache from './cache.js';
import { pbr, surface } from '../hd3d.js';
import { pause, built, later } from '../slices.js';

export { seeded };
export function lookOf(name, o) {
  const R = RECIPES[name], look = {};
  for (const k in R.look) look[k] = o[k] ?? (k === 'colour' ? o.color : undefined) ?? R.look[k];
  return look;
}
const sets = new Map();   // this run's sets, by key
/** The texture set for a recipe (as surface() returns), painted or read back from the saved bakes. */
export function bakeSet(name, look, size, seed) {
  const key = `${name}|${size}|${seed}|${Object.values(look).join(',')}|1`;
  let set = sets.get(key); if (set) { if (set.core.wait) later(set.core.wait); return set; }   // (still with a worker: this card waits for it too)
  pause('Textures');   // (while a card loads, a frame may go by before each new recipe: slices.js)
  const saved = cache.get(key), K = {}; for (const k in look) K[k] = JS.rgb(look[k]);
  set = surface(size, g => {
    if (saved) {   // drawn back from last launch's pictures
      const L = saved.layers; g.col.drawImage(L.col, 0, 0); g.h.drawImage(L.h, 0, 0); g.r.drawImage(L.r, 0, 0); if (L.m) g.m.drawImage(L.m, 0, 0);
      return;
    }
    const L = paintRecipe(name, K, size, seed), put = (ctx, d) => ctx.putImageData(new ImageData(d, size, size), 0, 0);
    put(g.col, L.col); put(g.h, L.h); put(g.r, L.r); put(g.m, L.m);
    // (worker: while a card loads, a recipe that isn't saved yet is painted off the main thread; the same pixels)
  }, { metal: true, strength: 2, worker: saved ? null : ['recipe', { name, K, size, seed }] });
  // (kept for next time once its layers are in: a worker may still be painting them)
  if (!saved) { const put = () => cache.put(key, set.canvases), w = set.core.wait; if (w) w.then(put); else put(); }
  sets.set(key, set); built();
  return set;
}

/**
 * A material made from a recipe: wood, planks, bark, brick, stone, cobbles, tiles, concrete, metal,
 * rust, paint, fabric, leather, marble, dirt, sand, snow. Options: the recipe's colours (colour, dark,
 * mortar, rust, vein...), seed (another pattern), repeat ([u, v] tiles across the mesh's UVs), size
 * (texture pixels, 256), depth (parallax depth on WebGPU), and on WebGPU: closeUp (true: finest detail
 * worked out per pixel near the camera, on the pixels the textures are stretched over), solid (true: laid
 * on by position, no UVs or seams; a number is metres per tile), scatter (true: each tile turned and moved
 * so big floors don't show a repeat; with closeUp the recipe is worked out four times a pixel up close).
 * Other options go to gs.hd.pbr (glow, clear, wet...).
 */
export function material(name, o = {}) {
  const R = RECIPES[name];
  if (!R) throw new Error(`gs.models.material: no recipe '${name}' (try ${NAMES.join(', ')})`);
  const { size = 256, seed = 0, repeat = [1, 1], depth = 0, closeUp = true, solid = false, scatter = false, ...rest } = o;
  for (const k in R.look) delete rest[k]; delete rest.color;
  const look = lookOf(name, o), set = bakeSet(name, look, Math.max(64, Math.min(1024, size)), seed), t = set.repeat(repeat[0], repeat[1]);
  const m = pbr('#ffffff', { rough: 1, metal: 1, tex: t, depth, ...rest });
  m.name = 'models:' + name;
  m.userData.recipe = { name, look, seed, P: R.P, repeat, closeUp, solid, scatter };
  m.userData.recipeHeight = t.height;   // (WebGPU: bumps when laid on by position)
  if (!m.userData.gsGpu && (closeUp || solid || scatter)) m.userData.gsGpu = 'recipe';
  return m;
}
export { NAMES };
