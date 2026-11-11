// The kit's background jobs (jobs.js): heavy number work done off the main thread while a card says
// "Loading…". A job in ({ id, kind, data }), plain arrays out ({ id, r }), their buffers handed over
// without a copy. Only code that needs nothing from the page is brought in here.
import { surfaceMath } from './surface-math.js';
import { paintRecipe } from './models/recipe-paint.js';
import { sculptArrays } from './models/sculpt-arrays.js';

const JOBS = {
  // a surface's normal map and rougher small copies, from its height and roughness layers (gs.hd.surface)
  surface: ({ hd, rd, size, strength }) => surfaceMath(hd, rd, size, strength),
  // a recipe material painted, then the same (gs.models.material)
  recipe({ name, K, size, seed, strength }) { const layers = paintRecipe(name, K, size, seed); return { ...surfaceMath(layers.h, layers.r, size, strength), layers }; },
  // a sculpted mesh's arrays (gs.models.sculpt)
  sculpt: ({ shapes, o }) => sculptArrays(shapes, o),
};
// every array buffer in an answer, once each (they are handed over, not copied)
function buffers(v, out = new Set()) {
  if (!v || typeof v !== 'object') return out;
  if (ArrayBuffer.isView(v)) out.add(v.buffer);
  else for (const k in v) buffers(v[k], out);
  return out;
}
self.onmessage = e => {
  const { id, kind, data } = e.data;
  try { const r = JOBS[kind](data); self.postMessage({ id, r }, [...buffers(r)]); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
