// Baked light's probe grid as numbers (bake-light.js; no page or chip needed, so the kit test runs it in Node): where the
// probes stand, probes inside walls or under the ground filled in from their neighbours, the parts put together with the
// game's sky and sun colours, packed the way three's LightProbeGrid reads them, and a light map's texels as bytes.
// A probe's number: ix + nx * (iy + ny * iz).
// Kit use only.
import { DataUtils } from 'three';

/** Floats a probe: vis (9), sky (27), sun (27), the share of its rays that hit the back of something (1). */
export const PROBE = 64;
/** The light arriving at a surface facing (x, y, z) from SH coefficients c[o + k * s] (k 0..8), as three's shader works it out. */
export function shIrradiance(c, o, s, x, y, z) {
  const r = c[o] * .886227 + 2 * .511664 * (c[o + s] * y + c[o + 2 * s] * z + c[o + 3 * s] * x)
    + 2 * .429043 * (c[o + 4 * s] * x * y + c[o + 5 * s] * y * z + c[o + 7 * s] * x * z) + c[o + 6 * s] * (.743125 * z * z - .247708) + c[o + 8 * s] * .429043 * (x * x - y * y);
  return r > 0 ? r : 0;
}

/**
 * A grid over box ({ min: [x, y, z], max }), a probe every spacing metres (a number, or [x, y, z]), at most most probes
 * (spread out further to fit). Returns { min, max, res: [nx, ny, nz], size: [w, h, d], step: [sx, sy, sz], count }.
 */
export function gridOver(box, spacing = 8, most = 6000) {
  const min = [...box.min], max = [...box.max], size = [0, 1, 2].map(i => Math.max(.01, max[i] - min[i]));
  let sp = Array.isArray(spacing) ? [...spacing] : [spacing, spacing, spacing];
  const res = () => sp.map((s, i) => Math.max(1, Math.round(size[i] / Math.max(.05, s))));
  let r = res(); while (r[0] * r[1] * r[2] > most) { sp = sp.map(s => s * 1.08); r = res(); }
  return { min, max, size, res: r, step: size.map((s, i) => s / r[i]), count: r[0] * r[1] * r[2] };
}
/** Where probe p stands (three's getProbePosition: in the middle of its cell). */
export function probeAt(g, p, out = [0, 0, 0]) {
  const [nx, ny] = g.res, ix = p % nx, iy = (p / nx | 0) % ny, iz = p / (nx * ny) | 0;
  out[0] = g.min[0] + (ix + .5) * g.step[0]; out[1] = g.min[1] + (iy + .5) * g.step[1]; out[2] = g.min[2] + (iz + .5) * g.step[2];
  return out;
}
/** The positions of a list of probes, for a job (x, y, z a probe). */
export function probePlaces(g, list) { const a = new Float32Array(list.length * 3), o = [0, 0, 0]; list.forEach((p, i) => { probeAt(g, p, o); a.set(o, i * 3); }); return a; }

/**
 * Fills in the probes that can't be trusted (inside something: back > most of their rays hit the back of something, or not
 * traced yet: back < 0) from the trusted ones next to them, a ring at a time. data: Float32Array(PROBE a probe); parts:
 * which floats of a probe to fill ([from, to)). A probe with no trusted probe anywhere near keeps what it has.
 */
export function fillIn(g, data, { most = .25, from = 0, to = 63 } = {}) {
  const [nx, ny, nz] = g.res, n = g.count, ok = new Uint8Array(n);
  for (let p = 0; p < n; p++) { const b = data[p * PROBE + 63]; ok[p] = b >= 0 && b <= most ? 1 : 0; }
  for (let ring = 0; ring < 8; ring++) {
    const now = ok.slice(); let left = 0;
    for (let p = 0; p < n; p++) {
      if (ok[p]) continue;
      const ix = p % nx, iy = (p / nx | 0) % ny, iz = p / (nx * ny) | 0; let k = 0;
      const sum = new Float32Array(to - from);
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = ix + dx, y = iy + dy, z = iz + dz; if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
        const q = x + nx * (y + ny * z); if (!ok[q]) continue;
        // (above counts most: a probe under the ground takes the light of the air over it, not of the rock beside it)
        const w = dy > 0 ? 2 : dy < 0 ? .5 : 1; k += w;
        for (let i = from; i < to; i++) sum[i - from] += data[q * PROBE + i] * w;
      }
      if (!k) { left++; continue; }
      for (let i = from; i < to; i++) data[p * PROBE + i] = sum[i - from] / k;
      now[p] = 2;
    }
    ok.set(now);
    if (!left) break;
  }
  return data;
}

/**
 * The grid's light, put together: sky (C, [r, g, b]: the hemisphere light's colour times its strength) and sun (S, the sun
 * light's colour times its strength) multiply in, as the light they stand for (C / pi, S / pi). data: Float32Array(PROBE a
 * probe), as bakeProbes made it. openSky: false leaves out the sky seen straight out (the hemisphere light still lights it);
 * bounce: how strong the bounced light is; sun: false leaves the sun's part out. Out: Float32Array(27 a probe: r0..r8,
 * g0..g8, b0..b8).
 */
export function combine(data, n, C, S, { openSky = true, bounce = 1, sun = true } = {}, out = new Float32Array(n * 27)) {
  const ip = 1 / Math.PI, v = openSky ? 1 : 0, b = bounce, ks = sun ? ip * bounce : 0;
  for (let p = 0; p < n; p++) {
    const o = p * PROBE, q = p * 27;
    for (let ch = 0; ch < 3; ch++) {
      const c = C[ch] * ip, s = S[ch] * ks;
      for (let k = 0; k < 9; k++) out[q + ch * 9 + k] = c * (data[o + k] * v + data[o + 9 + ch * 9 + k] * b) + s * data[o + 36 + ch * 9 + k];
    }
  }
  return out;
}
/** A hemisphere light (sky above, ground below) as SH, into out (27): what the grid shows before anything is baked. */
export function hemisphereSH(sky, ground, out = new Float32Array(27)) {
  // three's HemisphereLightProbe's shape, in the hemisphere light's units (its colour C lights an upward face with C, where
  // light of C from all round would light it with pi C: so C / pi)
  const c0 = 1 / Math.sqrt(Math.PI), c1 = c0 * Math.sqrt(.75);
  for (let ch = 0; ch < 3; ch++) { out.fill(0, ch * 9, ch * 9 + 9); out[ch * 9] = (sky[ch] + ground[ch]) * c0; out[ch * 9 + 1] = (sky[ch] - ground[ch]) * c1; }
  return out;
}

/** The size of three's LightProbeGrid atlas for this grid: [w, h, depth]. */
export const atlasSize = g => [g.res[0], g.res[1], 7 * (g.res[2] + 2)];
/**
 * Packs SH (27 a probe) into three's LightProbeGrid atlas (half floats, RGBA): seven sub-volumes stacked in depth, each with
 * a copy of its first and last slice either side. out: Uint16Array(w * h * depth * 4).
 */
export function packAtlas(g, sh, out) {
  const [nx, ny, nz] = g.res, pad = nz + 2, h = DataUtils.toHalfFloat, plane = nx * ny * 4, sub = pad * plane;
  // the order of the 27 numbers in the seven sub-volumes' texels (c0.rgb c1.r | c1.gb c2.rg | ...; 27 is the empty last one)
  const ORDER = PACK;
  for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const p = ix + nx * (iy + ny * iz), q = p * 27, at = (iy * nx + ix) * 4;
    for (let k = 0; k < 7; k++) {
      const i = k * sub + (1 + iz) * plane + at, o = k * 4;
      for (let c = 0; c < 4; c++) { const j = ORDER[o + c]; out[i + c] = j < 27 ? h(sh[q + j]) : 0; }
      if (iz === 0) out.copyWithin(i - plane, i, i + 4);
      if (iz === nz - 1) out.copyWithin(i + plane, i, i + 4);
    }
  }
  return out;
}
// coefficient k of colour ch is sh[ch * 9 + k]; texel t holds coefficients in the order c0.rgb, c1.rgb, ... c8.rgb, 4 at a time
const PACK = Uint8Array.from({ length: 28 }, (_, i) => i < 27 ? (i % 3) * 9 + (i / 3 | 0) : 27);

/** A light map's texels (bake-worker.js): what each sees of the sky (bakeTexels, 0..1) as three's aoMap takes it (a byte, 255 = all of it). */
export function aoBytes(v) { const out = new Uint8Array(v.length); for (let t = 0; t < v.length; t++) out[t] = Math.round(Math.min(1, Math.max(0, v[t])) * 255); return out; }
