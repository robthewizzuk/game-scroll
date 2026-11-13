// The air as sunlight passes through it, worked out the way Unreal's sky does (Hillaire 2020, "A Scalable and
// Production Ready Sky and Atmosphere Rendering Technique"): a planet 6360 km across under 100 km of air that
// scatters blue light most (Rayleigh), haze that scatters all colours forward (Mie), and ozone that takes a little
// orange out, so the sky is deep blue overhead, pale at the horizon, and the sun goes orange and red as it sets
// through more and more air. Light that has scattered once, twice and more is all counted (the second picture),
// which is what keeps a low sun's sky bright and the shadow side of the sky blue.
//
// Three pictures, as in the paper: how much light gets through the air from any height in any direction
// (transmittance, 256 x 64), the light scattered many times at any height for any height of the sun (32 x 32),
// both made here once for the air's settings; and the sky round the camera (hd3d-gpu-sky.js, on the chip,
// made again only when the sun or the camera's height has moved). The sums here also give the colours the rest
// of the scene takes from the sky (sky.js: overhead, round the horizon, the sun's own colour).
//
// Units: kilometres. Kit use only (sky.js, hd3d-gpu-sky.js).
import { DataTexture, RGBAFormat, HalfFloatType, LinearFilter, ClampToEdgeWrapping, DataUtils } from 'three';

export const RG = 6360, RT = 6460, TW = 256, TH = 64;
// the sky's light in the dome's units: Hillaire's sums with the sun's light 1, times this times the Sky's bright (.55):
// the same brightness overhead at noon, after the dome's soft knee, as the Preetham sky had (sky.js, hd3d-gpu-sky.js)
export const SKY_K = 18;
// (the many-times-scattered picture is small and made with few directions: within 4% of Hillaire's 32 x 32 and 64 directions
// in daylight, at a tenth of the time, about 45 ms once; its sun axis is finest round the horizon, where twilight changes fastest)
export const MSN = 16;
const MS_S = 6, MS_N = 14;
const H = Math.sqrt(RT * RT - RG * RG), PI = Math.PI;
// Rayleigh scattering at sea level (per km) and its scale height; haze (Mie) scattering and extinction; ozone's absorption
const RAY = [5.802e-3, 13.558e-3, 33.1e-3], RAY_H = 8, MIE_S = 3.996e-3, MIE_E = 4.44e-3, MIE_H = 1.2, OZ = [.65e-3, 1.881e-3, .085e-3], ALBEDO = .3;

/**
 * The air for a Sky's physical settings (sky.js PHYS: haze, blue, mie, glow, bright), as the Preetham sky read them:
 * blue scales the Rayleigh scattering (1.6 is the air as it is), haze and mie the haze's (6 and .004), glow is how
 * far forward haze scatters.
 */
export function airOf(p) {
  const r = (p.blue ?? 1.6) / 1.6, m = (p.haze ?? 6) / 6 * (p.mie ?? .004) / .004;
  const a = { ray: RAY.map(v => v * r), mieS: MIE_S * m, mieE: MIE_E * m, oz: OZ, g: Math.min(.95, Math.max(0, p.glow ?? .8)) };
  a.key = [r, m].map(v => v.toFixed(4)).join('|');
  return a;
}

// the air at a height (km): scattering (Rayleigh, Mie) and extinction per colour, into o
function medium(A, h, o) {
  const rd = Math.exp(-h / RAY_H), md = Math.exp(-h / MIE_H), od = Math.max(0, 1 - Math.abs(h - 25) / 15);
  o.m = A.mieS * md;
  for (let c = 0; c < 3; c++) { o.r[c] = A.ray[c] * rd; o.e[c] = o.r[c] + A.mieE * md + A.oz[c] * od; }
  return o;
}
const M0 = () => ({ r: [0, 0, 0], e: [0, 0, 0], m: 0 });
// distance along a ray from radius r at cos mu to a sphere of radius R: the far crossing (inside it) or -1
function toSphere(r, mu, R) { const d = r * r * (mu * mu - 1) + R * R; return d < 0 ? -1 : -r * mu + Math.sqrt(d); }
// the near crossing with the ground, or -1 when the ray misses it
function toGround(r, mu) { if (mu >= 0) return -1; const d = r * r * (mu * mu - 1) + RG * RG; return d < 0 ? -1 : -r * mu - Math.sqrt(d); }

/** Where (r, mu) is in the transmittance picture (0..1, texel centres), as hd3d-gpu-sky.js reads it. */
export function tUV(r, mu) {
  const rho = Math.sqrt(Math.max(0, r * r - RG * RG)), d = Math.max(0, toSphere(r, mu, RT)), dMin = RT - r, dMax = rho + H;
  const x = dMax > dMin ? (d - dMin) / (dMax - dMin) : 0, y = rho / H;
  return [.5 / TW + x * (1 - 1 / TW), .5 / TH + y * (1 - 1 / TH)];
}
// bilinear read of a float RGBA table w x h at u, v (0..1, as a texture would)
function read(t, w, h, u, v, o) {
  const x = Math.min(w - 1, Math.max(0, u * w - .5)), y = Math.min(h - 1, Math.max(0, v * h - .5)), x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  for (let c = 0; c < 3; c++) {
    const a = t[(y0 * w + x0) * 4 + c], b = t[(y0 * w + x1) * 4 + c], d = t[(y1 * w + x0) * 4 + c], e = t[(y1 * w + x1) * 4 + c];
    o[c] = (a + (b - a) * fx) * (1 - fy) + (d + (e - d) * fx) * fy;
  }
  return o;
}

/** How much sunlight reaches radius r with the sun at cos mu from overhead: 0 where the planet is in the way. */
export function transmittance(L, r, mu, o = [0, 0, 0]) {
  if (toGround(r, mu) > 0) { o[0] = o[1] = o[2] = 0; return o; }
  const [u, v] = tUV(r, mu); return read(L.T, TW, TH, u, v, o);
}

function makeT(A) {
  const T = new Float32Array(TW * TH * 4), m = M0();
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const x = (i + .5) / TW, y = (j + .5) / TH, rho = H * y, r = Math.sqrt(rho * rho + RG * RG), dMin = RT - r, dMax = rho + H, d = dMin + x * (dMax - dMin);
    const mu = d === 0 ? 1 : Math.max(-1, Math.min(1, (H * H - rho * rho - d * d) / (2 * r * d)));
    const od = [0, 0, 0], N = 30, dt = d / N;
    for (let s = 0; s < N; s++) {
      const t = (s + .5) * dt, h = Math.sqrt(r * r + t * t + 2 * r * mu * t) - RG; medium(A, h, m);
      for (let c = 0; c < 3; c++) od[c] += m.e[c] * dt;
    }
    const k = (j * TW + i) * 4; T[k] = Math.exp(-od[0]); T[k + 1] = Math.exp(-od[1]); T[k + 2] = Math.exp(-od[2]); T[k + 3] = 1;
  }
  return T;
}

// (the sun's height across the many-times-scattered picture: finest round the horizon, where twilight's colours change fastest)
export const uOfMu = mu => .5 + .5 * Math.sign(mu) * Math.sqrt(Math.min(1, Math.abs(mu)));
const muOfU = u => { const x = u * 2 - 1; return Math.sign(x) * x * x; };
// light scattered many times (Hillaire's section 5.5): for each height and sun height, the light coming in from every
// direction after one bounce (L2) and the share of light scattered back towards a point (f), summed as a geometric
// series: L2 / (1 - f). Read as if it came in the same from everywhere.
function makeMS(A, L) {
  const MS = new Float32Array(MSN * MSN * 4), m = M0(), tr = [0, 0, 0], S = MS_S, N = MS_N, uni = 1 / (4 * PI);
  for (let j = 0; j < MSN; j++) for (let i = 0; i < MSN; i++) {
    const sz = muOfU((i + .5) / MSN), r = RG + .01 + ((j + .5) / MSN) * (RT - RG - .02), sx = Math.sqrt(Math.max(0, 1 - sz * sz));
    const Ls = [0, 0, 0], Fs = [0, 0, 0];
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const th = 2 * PI * (a + .5) / S, ph = Math.acos(1 - 2 * (b + .5) / S), dx = Math.cos(th) * Math.sin(ph), dy = Math.cos(ph), dz = Math.sin(th) * Math.sin(ph);
      const g = toGround(r, dy), len = g > 0 ? g : toSphere(r, dy, RT), dt = len / N;
      const Tt = [1, 1, 1], Lr = [0, 0, 0], F = [0, 0, 0];
      for (let s = 0; s < N; s++) {
        const t = (s + .5) * dt, px = dx * t, py = r + dy * t, pz = dz * t, pr = Math.hypot(px, py, pz), h = pr - RG;
        medium(A, h, m); transmittance(L, pr, (px * sx + py * sz) / pr, tr);
        for (let c = 0; c < 3; c++) {
          const sc = m.r[c] + m.m, e = m.e[c], st = Math.exp(-e * dt), w = (1 - st) / e;
          Lr[c] += Tt[c] * sc * uni * tr[c] * w; F[c] += Tt[c] * sc * w; Tt[c] *= st;
        }
      }
      if (g > 0) {   // the ground, lit by the sun and seen from here
        const px = dx * len, py = r + dy * len, pz = dz * len, pr = Math.hypot(px, py, pz), nmu = (px * sx + py * sz) / pr;
        transmittance(L, pr, nmu, tr); for (let c = 0; c < 3; c++) Lr[c] += Tt[c] * tr[c] * Math.max(0, nmu) * ALBEDO / PI;
      }
      for (let c = 0; c < 3; c++) { Ls[c] += Lr[c]; Fs[c] += F[c] * uni; }
    }
    const k = (j * MSN + i) * 4, n = S * S;
    // (each direction stands for 4 pi / n of the sphere, and light scattered towards the point takes the isotropic phase, 1 / 4 pi:
    // the light after one bounce is the mean over the directions; so is the share f)
    for (let c = 0; c < 3; c++) { const f = Fs[c] / n * 4 * PI; MS[k + c] = (Ls[c] / n) / Math.max(1e-4, 1 - f); }
    MS[k + 3] = 1;
  }
  return MS;
}
/** The many-times-scattered light at radius r with the sun at cos mu. */
export function multiScatter(L, r, mu, o = [0, 0, 0]) {
  const u = .5 / MSN + uOfMu(mu) * (1 - 1 / MSN), v = .5 / MSN + Math.max(0, Math.min(1, (r - RG - .01) / (RT - RG - .02))) * (1 - 1 / MSN);
  return read(L.MS, MSN, MSN, u, v, o);
}

const half = (a, w, h) => {
  const d = new Uint16Array(a.length); for (let i = 0; i < a.length; i++) d[i] = DataUtils.toHalfFloat(a[i]);
  const t = new DataTexture(d, w, h, RGBAFormat, HalfFloatType); t.magFilter = t.minFilter = LinearFilter; t.wrapS = t.wrapT = ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
};
const made = new Map();
/** The transmittance and many-times-scattered pictures for this air (worked out once for each setting; a few tens of ms). */
export function luts(A) {
  let L = made.get(A.key);
  if (!L) {
    L = { A, T: null, MS: null, tex: null };
    L.T = makeT(A); L.MS = makeMS(A, L);
    // (a few kept: a game switching between missions' skies pays once each; the oldest goes past 8, its textures with it)
    if (made.size >= 8) { const [k, old] = made.entries().next().value; made.delete(k); if (old.tex) { old.tex.T.dispose(); old.tex.MS.dispose(); } }
    made.set(A.key, L);
  }
  return L;
}
/** The same as textures for the chip (half floats, made the first time they are asked for). */
export function lutTextures(L) { return L.tex ||= { T: half(L.T, TW, TH), MS: half(L.MS, MSN, MSN) }; }

const rayPhase = c => 3 / (16 * PI) * (1 + c * c);
/** Cornette-Shanks: haze's forward scattering (g from 0 to 1: how forward). */
export const miePhase = (g, c) => 3 / (8 * PI) * (1 - g * g) * (1 + c * c) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * c, 1.5));

/**
 * The sky's light looking along d (unit, y up) from a height h (km) with the sun along s (unit), the sun's own light 1.
 * The same sum as the chip's picture of the sky (hd3d-gpu-sky.js skyLight), with fewer steps: for the colours the
 * scene takes from the sky.
 */
export function skyLight(L, d, s, h, o = [0, 0, 0], N = 24) {
  const A = L.A, r = RG + Math.max(.001, h), g = toGround(r, d.y), len = g > 0 ? g : toSphere(r, d.y, RT), ct = d.x * s.x + d.y * s.y + d.z * s.z;
  const pr = rayPhase(ct), pm = miePhase(A.g, ct), m = M0(), tr = [0, 0, 0], ms = [0, 0, 0], T = [1, 1, 1];
  o[0] = o[1] = o[2] = 0;
  for (let i = 0; i < N; i++) {
    const t0 = len * (i / N) ** 2, t1 = len * ((i + 1) / N) ** 2, dt = t1 - t0, t = t0 + .3 * dt;
    const px = d.x * t, py = r + d.y * t, pz = d.z * t, q = Math.hypot(px, py, pz), mu = (px * s.x + py * s.y + pz * s.z) / q;
    medium(A, q - RG, m); transmittance(L, q, mu, tr); multiScatter(L, q, mu, ms);
    for (let c = 0; c < 3; c++) {
      const S = (m.r[c] * pr + m.m * pm) * tr[c] + ms[c] * (m.r[c] + m.m), e = m.e[c], st = Math.exp(-e * dt);
      o[c] += T[c] * S * (1 - st) / e; T[c] *= st;
    }
  }
  return o;
}
