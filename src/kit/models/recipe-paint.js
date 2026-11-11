// A gs.models material recipe (recipes.js) painted into its four layers on the CPU: plain numbers in,
// canvas pixels out, nothing from the page, so it runs on the main thread and in a background worker
// (job-worker.js) alike. materials.js turns the layers into a texture set.
// Kit use only.
import { JS } from './ops.js';
import { RECIPES } from './recipes.js';

// the recipe's noise reseeded: every hash gets the seed added, so seed 3 is a different plank pattern
export function seeded(O, seed) {
  if (!seed) return O;
  const k = (seed * 7919) | 0;
  return { ...O, noise: (p, P, s = 0) => O.noise(p, P, s + k), fbm: (p, P, oct, s = 0) => O.fbm(p, P, oct, s + k), cells: (p, P, s = 0, j) => O.cells(p, P, s + k, j), rand: (x, y, s = 0) => O.rand(x, y, s + k) };
}

/**
 * The layers of recipe `name` at size x size as canvas pixels (RGBA bytes each): { col, h, r, m }
 * (colour, height, roughness, metal). K: the look's colours as [r, g, b] (what O.rgb gives).
 */
export function paintRecipe(name, K, size, seed) {
  const R = RECIPES[name], O = seeded(JS, seed), n = size * size * 4;
  const C = new Uint8ClampedArray(n), H = new Uint8ClampedArray(n), Rr = new Uint8ClampedArray(n), M = new Uint8ClampedArray(n);
  const p = { x: 0, y: 0 }, f = R.P / size;
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
    p.x = (x + .5) * f; p.y = (y + .5) * f;
    const r = R.f(O, p, K), c = r.col;
    C[i] = c[0] * 255; C[i + 1] = c[1] * 255; C[i + 2] = c[2] * 255; C[i + 3] = 255;
    const h = Math.min(1, Math.max(0, r.h)) * 255; H[i] = H[i + 1] = H[i + 2] = h; H[i + 3] = 255;
    const ro = Math.min(1, Math.max(0, r.rough)) * 255; Rr[i] = Rr[i + 1] = Rr[i + 2] = ro; Rr[i + 3] = 255;
    const me = Math.min(1, Math.max(0, r.metal)) * 255; M[i] = M[i + 1] = M[i + 2] = me; M[i + 3] = 255;
  }
  return { col: C, h: H, r: Rr, m: M };
}
