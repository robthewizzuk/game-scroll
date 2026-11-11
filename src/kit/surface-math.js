// The number work of a surface texture set (gs.hd.surface): the height layer turned into a normal map,
// and the roughness layer's smaller copies made rougher where the bumps under them disagree.
// Plain arrays in, plain arrays out, nothing from the page or from three.js, so the same code runs on
// the main thread and in a background worker (job-worker.js). It is four fifths of what a surface
// costs to make, which is why a loading card hands it to a worker (slices.js, jobs.js).
// Kit use only.

/**
 * hd, rd: the height and roughness layers as canvas pixels (RGBA bytes, size x size). Returns
 * { out (the normal map's RGBA bytes), nf (the normals as numbers, 3 a pixel), mips (the roughness
 * layer's smaller copies as RGBA bytes, from size / 2 down to 1; none unless size is a power of two),
 * rd (handed back, so a worker can give its buffer back) }.
 */
export function surfaceMath(hd, rd, size, strength) {
  // height -> tangent-space normal map (wrapping Sobel). Written for speed: the heights once as
  // numbers, each row's wrapped neighbours worked out once, no helper calls in the loop.
  const n = size * size, out = new Uint8ClampedArray(n * 4), nf = new Float32Array(n * 3), Hf = new Float32Array(n);
  for (let i = 0; i < n; i++) Hf[i] = hd[i * 4] / 255;
  for (let y = 0; y < size; y++) {
    const r0 = (y ? y - 1 : size - 1) * size, r1 = y * size, r2 = (y + 1 < size ? y + 1 : 0) * size;
    for (let x = 0; x < size; x++) {
      const xl = x ? x - 1 : size - 1, xr = x + 1 < size ? x + 1 : 0;
      const dx = (Hf[r0 + xr] + 2 * Hf[r1 + xr] + Hf[r2 + xr]) - (Hf[r0 + xl] + 2 * Hf[r1 + xl] + Hf[r2 + xl]);
      const dy = (Hf[r2 + xl] + 2 * Hf[r2 + x] + Hf[r2 + xr]) - (Hf[r0 + xl] + 2 * Hf[r0 + x] + Hf[r0 + xr]);
      let nx = -dx * strength, ny = dy * strength; const l = Math.sqrt(nx * nx + ny * ny + 1), nz = 1 / l; nx /= l; ny /= l;
      const j = (r1 + x) * 3; nf[j] = nx; nf[j + 1] = ny; nf[j + 2] = nz;
      const i = (r1 + x) * 4; out[i] = (nx * .5 + .5) * 255; out[i + 1] = (ny * .5 + .5) * 255; out[i + 2] = (nz * .5 + .5) * 255; out[i + 3] = 255;
    }
  }
  return { out, nf, mips: roughMipsMath(rd, nf, size), rd };
}

// Specular anti-aliasing for bumpy surfaces (Toksvig; the way Filament's roughness-prefilter and
// Unreal's normal-map roughness do it). Far away, a texture's smaller copies average many tiny bumps
// into one pixel; a shiny surface then sparkles as the bumps' highlights flick on and off. Here
// each smaller copy of the roughness map is made a little rougher by how much the normals under it
// disagree (the shorter their average, the more they disagree), so the highlight spreads into the
// soft sheen the bumps would really make. three.js already does the same for curved shapes
// (geometry roughness); this adds the bumps. Close up (the full-size copy) nothing changes.
/** The roughness layer's smaller copies (RGBA bytes each, size / 2 down to 1), or null when size isn't a power of two. */
export function roughMipsMath(rd, nf, size) {
  if (size & (size - 1)) return null;   // whole halvings only
  let n = nf, r = new Float32Array(size * size); for (let i = 0; i < r.length; i++) r[i] = rd[i * 4 + 1] / 255;
  const mips = [];
  for (let s = size >> 1; s >= 1; s >>= 1) {
    const S = s * 2, n2 = new Float32Array(s * s * 3), r2 = new Float32Array(s * s), id = new Uint8ClampedArray(s * s * 4);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      // (the four texels under this one, with no list made for each: this loop runs a third of a million times a 512 surface)
      const a = (y * 2 * S + x * 2), a3 = a * 3, b3 = a3 + 3, c3 = (a + S) * 3, d3 = c3 + 3, o = y * s + x;
      const nx = (n[a3] + n[b3] + n[c3] + n[d3]) / 4, ny = (n[a3 + 1] + n[b3 + 1] + n[c3 + 1] + n[d3 + 1]) / 4, nz = (n[a3 + 2] + n[b3 + 2] + n[c3 + 2] + n[d3 + 2]) / 4, rr = (r[a] + r[a + 1] + r[a + S] + r[a + S + 1]) / 4;
      n2[o * 3] = nx; n2[o * 3 + 1] = ny; n2[o * 3 + 2] = nz; r2[o] = rr;
      // the averaged normal's length -> how spread the bumps are (von Mises-Fisher), added to the roughness (alpha = r^2)
      const len = Math.min(.9999, Math.sqrt(nx * nx + ny * ny + nz * nz)), kappa = (3 * len - len * len * len) / (1 - len * len), r4 = rr * rr * rr * rr;
      const a2 = Math.min(1, r4 + Math.min(2 / kappa, .18)), v = Math.round(Math.sqrt(Math.sqrt(a2)) * 255), i = o * 4;
      id[i] = id[i + 1] = id[i + 2] = v; id[i + 3] = 255;
    }
    mips.push(id); n = n2; r = r2;
  }
  return mips;
}
