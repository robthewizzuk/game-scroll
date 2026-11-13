// Smaller meshes, the number work (no three.js: this runs in workers and in Node too). A mesh's points
// are usually kept as 32-bit floats: twelve bytes for a place, twelve for the way it faces, twelve for a
// colour, sixteen for bone weights. Most of that is precision nothing can see. Here are the smaller
// ways of writing each, picked so the graphics chip reads them back as the same numbers with no change to
// any shader:
//   normals    three signed bytes (the chip divides by 127), each the direction nearest the real one
//   colours    half floats (16 bits: one part in two thousand at any brightness, bright colours kept; slim.js)
//   UVs        half floats, where they stay small enough for that to be exact to a fraction of a texel (slim.js)
//   weights    four bone numbers and four weights in eight bytes (the weights add up to exactly one)
//   places     16-bit steps on a grid of the mesh's own, for meshes the engine alone draws (slim.js says which)
// slim.js makes three.js attributes of them.

/** The biggest size (either sign) in a list, read at every `step`th number. */
export function biggest(src, n = src.length, step = 1) { let m = 0; for (let i = 0; i < n; i += step) { const v = src[i] < 0 ? -src[i] : src[i]; if (v > m) m = v; else if (v !== v) return Infinity; } return m; }

/**
 * Normals (x, y, z floats, any length) as three signed bytes each, to be read as byte / 127. A normal's
 * length does not matter to a shader (it makes it one long again), so of the few lengths from `low` to 127
 * the one whose rounded bytes point nearest the real way is kept: about half the error of plain rounding
 * (a tenth of a degree on average, three tenths at worst), the length never under 97% of one.
 */
export function normals8(src, n = src.length / 3 | 0, size = 3, low = 124) {
  const out = new Int8Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = src[i * size], y = src[i * size + 1], z = src[i * size + 2]; const l = Math.hypot(x, y, z);
    if (!(l > 0)) continue;
    x /= l; y /= l; z /= l;
    let best = -2, bx = 0, by = 0, bz = 0;
    for (let t = 127; t >= low; t--) {
      const qx = Math.round(x * t), qy = Math.round(y * t), qz = Math.round(z * t), d = (qx * x + qy * y + qz * z) / Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (d > best) { best = d; bx = qx; by = qy; bz = qz; }
    }
    out[i * 3] = bx; out[i * 3 + 1] = by; out[i * 3 + 2] = bz;
  }
  return out;
}
/** Normals as three 16-bit numbers each (read as n / 32767): for smooth shiny things, where a tenth of a degree can show in a highlight. */
export function normals16(src, n = src.length / 3 | 0, size = 3) {
  const out = new Int16Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = src[i * size], y = src[i * size + 1], z = src[i * size + 2], l = Math.hypot(x, y, z); if (!(l > 0)) continue;
    out[i * 3] = Math.round(x / l * 32767); out[i * 3 + 1] = Math.round(y / l * 32767); out[i * 3 + 2] = Math.round(z / l * 32767);
  }
  return out;
}
/** Tangents (x, y, z and a side, w = 1 or -1) as four signed bytes. */
export function tangents8(src, n = src.length / 4 | 0) {
  const out = new Int8Array(n * 4), t = normals8(src, n, 4);
  for (let i = 0; i < n; i++) { out[i * 4] = t[i * 3]; out[i * 4 + 1] = t[i * 3 + 1]; out[i * 4 + 2] = t[i * 3 + 2]; out[i * 4 + 3] = src[i * 4 + 3] < 0 ? -127 : 127; }
  return out;
}
/**
 * Numbers known to lie in 0..1 (a mask, a thickness) as bytes, read as byte / 255. null if any is outside
 * 0..1 or is not within `slack` of a byte's worth (so a list that was made from bytes comes back exactly).
 */
export function units8(src, n = src.length, slack = 1) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const v = src[i] * 255, q = Math.round(v); if (!(v >= -1e-3 && v <= 255.001) || Math.abs(v - q) > slack) return null; out[i] = q < 0 ? 0 : q > 255 ? 255 : q; }
  return out;
}
/**
 * Bone numbers and weights (four of each a point) in one list of eight numbers a point: four bone numbers,
 * then four weights in 255ths (65535ths with wide) that add up to exactly the whole, the biggest first.
 * Bytes when every bone number is under 256, else 16-bit numbers; wide: true forces 16 bits.
 * Returns { array (Uint8Array or Uint16Array, n * 8), top (what a weight of one is written as) }.
 */
export function skin8(index, weight, n = weight.length / 4 | 0, wide = false) {
  let most = 0; for (let i = 0; i < n * 4; i++) if (index[i] > most) most = index[i];
  if (most > 255) wide = true;
  const top = wide ? 65535 : 255, out = wide ? new Uint16Array(n * 8) : new Uint8Array(n * 8), w = [0, 0, 0, 0], q = [0, 0, 0, 0], ord = [0, 1, 2, 3];
  for (let i = 0; i < n; i++) {
    let sum = 0; for (let j = 0; j < 4; j++) { const v = weight[i * 4 + j]; w[j] = v > 0 ? v : 0; sum += w[j]; }
    const o = i * 8;
    if (!(sum > 0)) { out[o] = index[i * 4]; out[o + 4] = top; continue; }   // (a point no bone holds follows its first)
    // each weight rounded down, then the 255ths left over given to the ones that lost most by it
    let used = 0; for (let j = 0; j < 4; j++) { w[j] = w[j] / sum * top; q[j] = Math.floor(w[j]); used += q[j]; }
    for (let left = top - used; left > 0; left--) { let b = 0, bd = -1; for (let j = 0; j < 4; j++) { const d = w[j] - q[j]; if (d > bd) { bd = d; b = j; } } q[b]++; w[b] = q[b] - 1; }
    ord.sort((a, b) => q[b] - q[a] || a - b);
    for (let j = 0; j < 4; j++) { const k = ord[j]; out[o + j] = q[k] ? index[i * 4 + k] : 0; out[o + 4 + j] = q[k]; }
    ord[0] = 0; ord[1] = 1; ord[2] = 2; ord[3] = 3;
  }
  return { array: out, top };
}
/**
 * Places (x, y, z floats) as 16-bit steps on a grid: { array (Int16Array, to be read as n / 32767), step
 * (the grid's spacing, in the mesh's units), scale (what a read number is multiplied by: 32767 * step), offset
 * [x, y, z] (then added) }. The spacing is a power of two and the grid passes through the mesh's own zero,
 * so two meshes that share an edge and are set down a whole number of steps apart (side by side, or made in
 * the same place) put the points they share on the same spot, and the chip's sums are exact.
 */
export function places16(src, n = src.length / 3 | 0, size = 3) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = src[i * size], y = src[i * size + 1], z = src[i * size + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (!(x1 >= x0)) { x0 = y0 = z0 = 0; x1 = y1 = z1 = 0; }
  const span = Math.max(x1 - x0, y1 - y0, z1 - z0, 1e-30);
  // the finest power of two whose 65534 steps (and one more, for the rounding at each end) still cover the mesh
  let step = 2 ** Math.ceil(Math.log2(span / 65532));
  const mid = v0 => Math.round(v0 / step) * step, fits = () => Math.max(x1 - mid((x0 + x1) / 2), mid((x0 + x1) / 2) - x0, y1 - mid((y0 + y1) / 2), mid((y0 + y1) / 2) - y0, z1 - mid((z0 + z1) / 2), mid((z0 + z1) / 2) - z0) / step <= 32767;
  while (!fits()) step *= 2;
  const ox = mid((x0 + x1) / 2), oy = mid((y0 + y1) / 2), oz = mid((z0 + z1) / 2), out = new Int16Array(n * 3);
  for (let i = 0; i < n; i++) { out[i * 3] = Math.round((src[i * size] - ox) / step); out[i * 3 + 1] = Math.round((src[i * size + 1] - oy) / step); out[i * 3 + 2] = Math.round((src[i * size + 2] - oz) / step); }
  return { array: out, step, scale: 32767 * step, offset: [ox, oy, oz] };
}
