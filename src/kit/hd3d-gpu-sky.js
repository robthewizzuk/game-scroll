// The sky on WebGPU (high and ultra tiers for the clouds; any WebGPU tier for the air): gs.sky's Sky drawn as the big
// engines draw theirs.
//
// The air (physical: true): the sky round the camera worked out from how sunlight scatters in the air (atmosphere.js,
// Hillaire's method, as in Unreal), into a small picture (192 x 108) that is made again only when the sun or the
// camera's height moves. The dome reads it, so a sunset is orange round the sun and blue-grey away from it, and the
// air's haze (v.air()) takes the sky's own colour in each direction, with real air's blue over kilometres.
//
// The clouds (clouds: cover): real ones in a layer from 1.5 to 4 km up, ray marched through a noise made here once
// (Perlin-Worley, as in Guerrilla's Nubis clouds) and lit by the sun through themselves, with the many-times-scattered
// light that makes their edges glow towards the sun and a sky light that is bluer on top. Marched at a quarter of the
// picture's pixels with a few steps, a different way along each frame, and filled in from the frames before (the
// sky is far away, so the camera turning moves it on screen exactly, and the camera walking does not move it at all).
// Their shadow on the ground (and in the fog and the volumetric light) comes from the same clouds: a picture of how
// much sun gets through, 6 km across round the camera, made again a few times a second.
//
// Kit use only: hd3d-gpu.js gpuMaterials.skyDome builds a SkyGpu for a Sky's dome, and hd3d.js drawGPU calls its
// frame() before the scene is drawn. WebGL, the lower tiers and a game with HD.clouds = false keep today's sky.
import { QuadMesh, NodeMaterial, RendererUtils, RenderTarget, HalfFloatType, RGBAFormat, LinearFilter, RepeatWrapping, ClampToEdgeWrapping, Data3DTexture, DataTexture, Vector3, Vector4, Matrix4, Color } from 'three/webgpu';
import { Fn, uniform, uv, vec2, vec3, vec4, float, texture, texture3D, Loop, If, Break, max, min, clamp, exp, sqrt, abs, mix, select, smoothstep, dot, normalize, length, pow, acos, sign, fract, screenCoordinate, interleavedGradientNoise, getViewPosition, getScreenPosition } from 'three/tsl';
import { RG, RT, TW, TH, MSN, SKY_K, airOf, luts, lutTextures, skyLight, transmittance } from './atmosphere.js';
import { ORIGIN } from './origin.js';

const PI = Math.PI, H = Math.sqrt(RT * RT - RG * RG), SVW = 192, SVH = 108;
// the cloud layer (metres above y = 0) and how thick a cloud is: extinction a metre at density 1
const BASE = 1500, TOP = 4000, SIGMA = .04, FAR = 60000, SHADOW_SIZE = 6000, SHADOW_N = 256;

let RS;   // (three fills it in: undefined, not null, the first time)
const Q = new QuadMesh();
function quad(r, rt, mat) {
  RS = RendererUtils.resetRendererState(r, RS);
  try { r.setRenderTarget(rt); Q.material = mat; Q.name = mat.name; Q.render(r); } finally { RendererUtils.restoreRendererState(r, RS); }
}
const target = (w, h, part, wrap = ClampToEdgeWrapping) => {
  const t = new RenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, generateMipmaps: false });
  t.texture.minFilter = t.texture.magFilter = LinearFilter; t.texture.wrapS = t.texture.wrapT = wrap; t.gsPart = part;
  return t;
};
const ONE = (() => { const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; return t; })();
const BLACK = (() => { const t = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();

/* ---------- the air ---------- */
// Read a table made by atmosphere.js at the place it keeps (r, mu): how much light gets through, 0 behind the planet
function tLookup(T, r, h, mu) {
  const rr = r.mul(r), disc = rr.mul(mu.mul(mu)).sub(h.mul(r.add(RG)));   // (r^2 - RG^2 as h (r + RG): no cancelling near the ground)
  const rho = sqrt(max(h.mul(r.add(RG)), 0)), dTop = max(r.negate().mul(mu).add(sqrt(max(rr.mul(mu.mul(mu)).add(float(RT).sub(r).mul(r.add(RT))), 0))), 0);
  const dMin = float(RT).sub(r), dMax = rho.add(H), x = dTop.sub(dMin).div(max(dMax.sub(dMin), 1e-4)), y = rho.div(H);
  const c = texture(T, vec2(x.mul(1 - 1 / TW).add(.5 / TW), y.mul(1 - 1 / TH).add(.5 / TH))).level(0).rgb;
  return select(mu.lessThan(0).and(disc.greaterThanEqual(0)), vec3(0), c);
}
function msLookup(MS, r, mu) {
  const u = sign(mu).mul(sqrt(min(abs(mu), 1))).mul(.5).add(.5), v = clamp(r.sub(RG + .01).div(RT - RG - .02), 0, 1);
  return texture(MS, vec2(u.mul(1 - 1 / MSN).add(.5 / MSN), v.mul(1 - 1 / MSN).add(.5 / MSN))).level(0).rgb;
}
const rayPhase = c => c.mul(c).add(1).mul(3 / (16 * PI));
const miePhase = (g, c) => { const g2 = g.mul(g); return float(3 / (8 * PI)).mul(g2.oneMinus()).mul(c.mul(c).add(1)).div(g2.add(2).mul(pow(g2.add(1).sub(g.mul(2).mul(c)), 1.5))); };

class Air {
  constructor() {
    // (hz: the camera's radius r0 in km, the angle down to the horizon beta, the zenith angle of the horizon, r0^2 - RG^2)
    this.u = { hz: uniform(new Vector4(RG + .001, PI / 2, PI / 2, 1)), top: uniform(RT * RT - (RG + .001) ** 2), sun: uniform(new Vector3(0, 1, 0)), ray: uniform(new Vector3()), mie: uniform(new Vector3()), oz: uniform(new Vector3(.65e-3, 1.881e-3, .085e-3)) };
    this.T = texture(BLACK); this.MS = texture(BLACK);
    this.rt = target(SVW, SVH, 'sky');
    this.mat = this.viewMaterial(); this.key = ''; this.L = null;
    this.view = texture(this.rt.texture);
  }
  // the sky round the camera: each texel a direction, by its angle from the sun across the sky (finest round the sun) and
  // its height (finest round the horizon), as Hillaire lays it out
  viewMaterial() {
    const m = new NodeMaterial(); m.name = 'sky picture';
    const U = this.u, T = this.T, MS = this.MS;
    m.fragmentNode = Fn(() => {
      const q = uv(), x = clamp(q.x.sub(.5 / SVW).div(1 - 1 / SVW), 0, 1), y = clamp(q.y.sub(.5 / SVH).div(1 - 1 / SVH), 0, 1);
      const r0 = U.hz.x, beta = U.hz.y, zha = U.hz.z;
      const up = y.mul(2).oneMinus(), dn = y.mul(2).sub(1);
      const ang = select(y.lessThan(.5), zha.mul(up.mul(up).oneMinus()), zha.add(beta.mul(dn.mul(dn))));
      const lvc = x.mul(x).mul(2).oneMinus(), vz = ang.cos(), vs = ang.sin();
      const d = vec3(vs.mul(lvc), vz, vs.mul(sqrt(max(lvc.mul(lvc).oneMinus(), 0)))).toConst();
      const s = U.sun, mu = d.y;
      const discG = r0.mul(r0).mul(mu.mul(mu)).sub(U.hz.w), tG = r0.negate().mul(mu).sub(sqrt(max(discG, 0)));
      const tT = r0.negate().mul(mu).add(sqrt(max(r0.mul(r0).mul(mu.mul(mu)).add(U.top), 0)));
      const len = select(mu.lessThan(0).and(discG.greaterThanEqual(0)), tG, tT).toConst();
      const ct = dot(d, s), pr = rayPhase(ct), pm = miePhase(U.mie.z, ct);
      const L = vec3(0).toVar(), Tr = vec3(1).toVar(), N = 30;
      Loop({ start: 0, end: N }, ({ i }) => {
        const fi = float(i), t0 = len.mul(fi.div(N).mul(fi.div(N))), t1 = len.mul(fi.add(1).div(N).mul(fi.add(1).div(N))), dt = t1.sub(t0), t = t0.add(dt.mul(.3));
        const p = vec3(d.x.mul(t), r0.add(d.y.mul(t)), d.z.mul(t)), r = length(p), h = r.sub(RG), smu = dot(p, s).div(r);
        const rd = exp(h.div(-8)), md = exp(h.div(-1.2)), od = max(abs(h.sub(25)).div(15).oneMinus(), 0);
        const sr = U.ray.mul(rd), sm = U.mie.x.mul(md), ext = sr.add(U.mie.y.mul(md)).add(U.oz.mul(od));
        const S = sr.mul(pr).add(sm.mul(pm)).mul(tLookup(T, r, h, smu)).add(msLookup(MS, r, smu).mul(sr.add(sm)));
        const st = exp(ext.mul(dt).negate());
        L.addAssign(Tr.mul(S).mul(st.oneMinus()).div(max(ext, 1e-7))); Tr.mulAssign(st);
      });
      return vec4(L, 1);
    })();
    return m;
  }
  /** The sky's light looking along d (a world direction; the sun s), in Hillaire's units: the picture read back. */
  at(d, s) {
    const U = this.u, zha = U.hz.z, beta = U.hz.y, ang = acos(clamp(d.y, -1, 1));
    const a = clamp(ang.div(zha), 0, 1), b = clamp(ang.sub(zha).div(max(beta, 1e-4)), 0, 1);
    const v = select(ang.lessThan(zha), sqrt(a.oneMinus()).oneMinus().mul(.5), sqrt(b).mul(.5).add(.5));
    const dh = d.xz, sh = s.xz, l = length(dh).mul(length(sh));
    const lvc = select(l.greaterThan(1e-6), dot(dh, sh).div(max(l, 1e-6)), float(1));
    const u = sqrt(clamp(lvc.mul(-.5).add(.5), 0, 1));
    return this.view.sample(vec2(u.mul(1 - 1 / SVW).add(.5 / SVW), v.mul(1 - 1 / SVH).add(.5 / SVH))).level(0).rgb;
  }
  /** Before the frame: the tables for this air, and the picture of the sky again if the sun or the camera's height moved. */
  frame(r, phys, sun, camY) {
    const A = airOf(phys);
    if (this.L?.A.key !== A.key) { this.L = luts(A); const tx = lutTextures(this.L); this.T.value = tx.T; this.MS.value = tx.MS; this.key = ''; }
    const r0 = RG + Math.max(.0005, camY / 1000), vh2 = r0 * r0 - RG * RG, beta = Math.acos(Math.min(1, Math.sqrt(vh2) / r0));
    const U = this.u; U.hz.value.set(r0, beta, PI - beta, vh2); U.top.value = RT * RT - r0 * r0;
    // (the picture's frame: the sun in the x-y plane, so only its height above the horizon matters)
    const sz = Math.max(-1, Math.min(1, sun.y)); U.sun.value.set(Math.sqrt(1 - sz * sz), sz, 0);
    U.ray.value.fromArray(A.ray); U.mie.value.set(A.mieS, A.mieE, A.g);
    const key = A.key + '|' + sz.toFixed(4) + '|' + Math.round(camY / 5);
    if (key !== this.key) { this.key = key; quad(r, this.rt, this.mat); }
    return this.L;
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); }
}

/* ---------- the clouds' noise, made in code ---------- */
// 32 x 32 x 32, tiling: Perlin-Worley in red (soft round billows), Worley at 4, 8 and 16 cells in green, blue and alpha
// (cauliflower edges, eaten away at the clouds' rims). Made once, about 30 ms.
let N3 = null;
function cloudNoise() {
  if (N3) return N3;
  const S = 32, data = new Uint8Array(S * S * S * 4), hash = (x, y, z, k) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const worley = (px, py, pz, C, k) => {
    const fx = px * C, fy = py * C, fz = pz * C, cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz); let best = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const x = cx + a, y = cy + b, z = cz + c, wx = ((x % C) + C) % C, wy = ((y % C) + C) % C, wz = ((z % C) + C) % C;
      const dx = x + hash(wx, wy, wz, k) - fx, dy = y + hash(wx, wy, wz, k + 1) - fy, dz = z + hash(wx, wy, wz, k + 2) - fz, d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    return 1 - Math.min(1, Math.sqrt(best));
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (x, y, z, P, dx, dy, dz) => { const h = Math.floor(hash(((x % P) + P) % P, ((y % P) + P) % P, ((z % P) + P) % P, 7) * 12), g = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]][h]; return g[0] * dx + g[1] * dy + g[2] * dz; };
  const perlin = (px, py, pz, P) => {
    const fx = px * P, fy = py * P, fz = pz * P, x = Math.floor(fx), y = Math.floor(fy), z = Math.floor(fz), dx = fx - x, dy = fy - y, dz = fz - z, u = fade(dx), v = fade(dy), w = fade(dz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(grad(x, y, z, P, dx, dy, dz), grad(x + 1, y, z, P, dx - 1, dy, dz), u), l(grad(x, y + 1, z, P, dx, dy - 1, dz), grad(x + 1, y + 1, z, P, dx - 1, dy - 1, dz), u), v),
      l(l(grad(x, y, z + 1, P, dx, dy, dz - 1), grad(x + 1, y, z + 1, P, dx - 1, dy, dz - 1), u), l(grad(x, y + 1, z + 1, P, dx, dy - 1, dz - 1), grad(x + 1, y + 1, z + 1, P, dx - 1, dy - 1, dz - 1), u), v), w);
  };
  for (let k = 0; k < S; k++) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const px = (i + .5) / S, py = (j + .5) / S, pz = (k + .5) / S;
    const w4 = worley(px, py, pz, 4, 1), w8 = worley(px, py, pz, 8, 11), w16 = worley(px, py, pz, 16, 21);
    const pf = Math.min(1, Math.max(0, (perlin(px, py, pz, 4) * .5 + perlin(px, py, pz, 8) * .25 + perlin(px, py, pz, 16) * .125) * .9 + .5));
    const wf = w4 * .625 + w8 * .25 + w16 * .125, pw = wf + pf * (1 - wf) - .25;   // (Perlin-Worley: Perlin's billows given Worley's round edges)
    const o = ((k * S + j) * S + i) * 4, b = v => Math.round(Math.min(1, Math.max(0, v)) * 255);
    data[o] = b(pw); data[o + 1] = b(wf); data[o + 2] = b(w8 * .625 + w16 * .375); data[o + 3] = b(w16);
  }
  N3 = new Data3DTexture(data, S, S, S); N3.format = RGBAFormat; N3.minFilter = N3.magFilter = LinearFilter; N3.wrapS = N3.wrapT = N3.wrapR = RepeatWrapping; N3.unpackAlignment = 1; N3.needsUpdate = true;
  return N3;
}

/* ---------- the clouds ---------- */
const remap = (v, lo, hi, a, b) => a.add(v.sub(lo).div(max(hi.sub(lo), 1e-4)).mul(b.sub(a)));
const hg = (c, g) => { const g2 = g * g; return float((1 - g2) / (4 * PI)).div(pow(c.mul(-2 * g).add(1 + g2), 1.5)); };

class Clouds {
  constructor(sky, noise2) {
    this.u = {
      cam: uniform(new Vector3()), y0: uniform(0), invProj: uniform(new Matrix4()), camRot: uniform(new Matrix4()), prevV: uniform(new Matrix4()), prevP: uniform(new Matrix4()),
      sun: uniform(new Vector3(0, 1, 0)), sunL: uniform(new Color()), ambHi: uniform(new Color()), ambLo: uniform(new Color()),
      cover: uniform(.5), gap: uniform(0), wind: uniform(new Vector3()), turn: uniform(0), steps: uniform(16), A: uniform(1), shade: uniform(new Vector4(0, 0, 1 / SHADOW_SIZE, 0)),
    };
    this.N3 = texture3D(cloudNoise()); this.W = texture(noise2 || BLACK);
    this.cur = target(2, 2, 'clouds'); this.hA = target(2, 2, 'clouds'); this.hB = target(2, 2, 'clouds'); this.flip = false;
    this.shadowRT = target(SHADOW_N, SHADOW_N, 'cloud shadow');
    this.histN = texture(this.hA.texture); this.curN = texture(this.cur.texture); this.out = this.hB;
    this.marchM = this.marchMaterial(); this.resolveM = this.resolveMaterial(); this.shadowM = this.shadowMaterial();
    this.n = 0; this.f = 0; this.lastV = new Matrix4(); this.lastP = new Matrix4(); this.shadowAt = -99;
  }
  // how much cloud is at p (metres, the world's; h its height above y = 0 where the planet curves away), cheap: the billows
  // only; full: eaten away at the edges by the finer noise
  density(p, h, full) {
    const U = this.u, h01 = clamp(h.sub(BASE).div(TOP - BASE), 0, 1);
    const w = this.W.sample(p.xz.add(U.wind.xz).div(26000)).level(0).r;
    const cov = clamp(U.cover.add(w.sub(.5).mul(.9)), 0, 1).toConst();
    // (flat bottoms, and tops that round off higher where the sky is fuller)
    const topK = mix(.5, 1, cov), shape = smoothstep(0, .07, h01).mul(smoothstep(topK.mul(.6), topK, h01).oneMinus());
    const n = this.N3.sample(p.add(U.wind).div(5200)).level(0);
    // (the Perlin-Worley billows, spread out to 0..1 so that about cov of the sky is cloud: the noise's own values lie in .47..73)
    const base = clamp(remap(n.r, n.g.sub(1).mul(.5), float(1), float(0), float(1)).sub(.47).div(.26), 0, 1).mul(shape);
    const d = clamp(remap(base, cov.oneMinus(), float(1), float(0), float(1)), 0, 1).mul(cov).toVar();
    if (full) {
      If(d.greaterThan(0), () => {
        const m = this.N3.sample(p.add(U.wind.mul(1.6)).div(1100)).level(0), det = mix(m.g, m.a, h01);
        d.assign(clamp(remap(d, det.mul(.22), float(1), float(0), float(1)), 0, 1));
      });
    }
    return d;
  }
  // the camera's ray through the layer (heights hb..ht along a ray that bends away from a planet 6360 km across): [start, end]
  span(dy, y0) {
    const a = dy.mul(dy).oneMinus().div(2 * RG * 1000).max(1e-12);
    const roots = Hh => {
      const c = float(Hh).sub(y0), disc = dy.mul(dy).sub(a.mul(4).mul(c)), sq = sqrt(max(disc, 0));
      const q = dy.add(select(dy.greaterThanEqual(0), sq, sq.negate())).mul(.5);   // (the stable pair: q / a and c / q)
      const r1 = q.div(a), r2 = c.div(select(abs(q).greaterThan(1e-9), q, float(1e-9)));
      return { ok: disc.greaterThanEqual(0), lo: min(r1, r2), hi: max(r1, r2) };
    };
    const b = roots(BASE), t = roots(TOP);
    const s0 = max(b.lo, 0), e0 = min(b.hi, FAR);
    // (below the top: from where it rises past the base to where it reaches the top; above it, after it comes back down past the top)
    const s = select(t.ok.and(s0.greaterThanEqual(t.lo)), max(s0, t.hi), s0), e = select(t.ok.and(s0.lessThan(t.lo)), min(e0, t.lo), e0);
    return { ok: b.ok.and(e.greaterThan(s)), s, e };
  }
  marchMaterial() {
    const m = new NodeMaterial(); m.name = 'clouds';
    const U = this.u;
    m.fragmentNode = Fn(() => {
      const q = uv(), vp = getViewPosition(q, float(.5), U.invProj), d = normalize(U.camRot.mul(vec4(vp, 0)).xyz).toConst();
      const sp = this.span(d.y, U.y0), out = vec4(0, 0, 0, 1).toVar();
      If(sp.ok, () => {
        const dt = sp.e.sub(sp.s).div(U.steps).toConst(), j = fract(interleavedGradientNoise(screenCoordinate).add(U.turn));
        const t = sp.s.add(dt.mul(j)).toVar(), Tr = float(1).toVar(), L = vec3(0).toVar(), hit = float(-1).toVar();
        const ct = dot(d, U.sun);
        // (the light that has scattered several times inside: dimmer, less forward and further through each time, Wrenninge's octaves)
        const ph = [hg(ct, .8).mul(.7).add(hg(ct, -.3).mul(.3)), hg(ct, .4).mul(.7).add(hg(ct, -.15).mul(.3)), hg(ct, .2).mul(.7).add(hg(ct, -.07).mul(.3))];
        // (the gap: thinner cover in the low sky round the sun, so a sunset shows; as the painted clouds)
        const gap = U.gap.mul(pow(max(dot(normalize(d.xz.add(1e-4)), normalize(U.sun.xz.add(1e-4))), 0), 3)).mul(smoothstep(.02, .22, d.y).oneMinus()).oneMinus();
        Loop({ start: 0, end: 96 }, ({ i }) => {
          If(float(i).greaterThanEqual(U.steps).or(Tr.lessThan(.02)), () => { Break(); });
          const p = U.cam.add(d.mul(t)), h = U.y0.add(d.y.mul(t)).sub(t.mul(t).mul(d.y.mul(d.y).oneMinus()).div(2 * RG * 1000));
          const den = this.density(p, h, true).mul(gap);
          If(den.greaterThan(.003), () => {
            If(hit.lessThan(0), () => { hit.assign(t); });
            // light from the sun through the cloud above this point: five reads further and further out
            const od = float(0).toVar();
            for (const [a, b] of [[0, 40], [40, 110], [110, 240], [240, 500], [500, 1000]]) {
              const pl = p.add(U.sun.mul((a + b) / 2)), hl = h.add(U.sun.y.mul((a + b) / 2));
              od.addAssign(this.density(pl, hl, false).mul(b - a));
            }
            const o = od.mul(SIGMA * .5), h01 = clamp(h.sub(BASE).div(TOP - BASE), 0, 1);
            // (and the light scattered so many times it comes out every way alike: what makes the sunlit side of a thick cloud
            // bright white, a third of the sun's light as a matte white wall would be, where the octaves above give a tenth)
            const sunT = exp(o.negate()).mul(ph[0]).add(exp(o.mul(-.4)).mul(ph[1]).mul(.55)).add(exp(o.mul(-.16)).mul(ph[2]).mul(.3)).add(exp(o.mul(-.25)).mul(.2));
            const amb = mix(U.ambLo, U.ambHi, h01).mul(h01.mul(.6).add(.4));
            const st = exp(den.mul(-SIGMA).mul(dt));
            L.addAssign(Tr.mul(st.oneMinus()).mul(U.sunL.mul(sunT).add(amb)));
            Tr.mulAssign(st);
          });
          t.addAssign(dt);
        });
        // far clouds fade into the haze of the low sky behind them
        const fade = exp(max(hit, 0).div(-32000));
        out.assign(vec4(L.mul(fade), Tr.oneMinus().mul(fade).oneMinus()));
      });
      return out;
    })();
    return m;
  }
  // this frame's march into the frames before, each pixel's history found where its direction was on screen last frame
  resolveMaterial() {
    const m = new NodeMaterial(); m.name = 'clouds history';
    const U = this.u;
    m.fragmentNode = Fn(() => {
      const q = uv(), cur = this.curN.sample(q), vp = getViewPosition(q, float(.5), U.invProj), d = U.camRot.mul(vec4(vp, 0)).xyz;
      const pq = getScreenPosition(U.prevV.mul(vec4(d, 0)).xyz, U.prevP), ok = pq.x.greaterThanEqual(0).and(pq.x.lessThanEqual(1)).and(pq.y.greaterThanEqual(0)).and(pq.y.lessThanEqual(1));
      const h = this.histN.sample(pq);
      return mix(h, cur, select(ok, U.A, float(1)));
    })();
    return m;
  }
  // how much sun gets through the clouds to each spot of a square round the camera, at y = 0 (a point higher up reads it
  // further towards the sun: hd3d-gpu.js gpuSunLight)
  shadowMaterial() {
    const m = new NodeMaterial(); m.name = 'cloud shadow';
    const U = this.u;
    m.fragmentNode = Fn(() => {
      const q = uv(), g = vec3(U.shade.x.add(q.x.sub(.5).mul(SHADOW_SIZE)), 0, U.shade.y.add(q.y.sub(.5).mul(SHADOW_SIZE)));
      const s = vec3(U.sun.x, max(U.sun.y, .15), U.sun.z), od = float(0).toVar(), N = 8, k = (TOP - BASE) / N;
      for (let i = 0; i < N; i++) { const hh = BASE + (i + .5) * k, p = g.add(s.mul(hh).div(s.y)); od.addAssign(this.density(p, float(hh), false)); }
      return vec4(exp(od.mul(k * -SIGMA * .25).div(s.y)), 0, 0, 1);
    })();
    return m;
  }
  /** Before the frame: march, fill in from history, and now and then the shadow. w, h: the 3D picture's size. */
  frame(r, cam, w, h, fresh, bake, steps) {
    const U = this.u, cw = Math.max(1, Math.ceil(w / 2)), ch = Math.max(1, Math.ceil(h / 2));
    if (this.cur.width !== cw || this.cur.height !== ch) { for (const t of [this.cur, this.hA, this.hB]) t.setSize(cw, ch); fresh = true; }
    cam.updateMatrixWorld();
    U.invProj.value.copy(cam.projectionMatrixInverse); U.camRot.value.copy(cam.matrixWorld).setPosition(0, 0, 0);
    const v = new Matrix4().copy(cam.matrixWorldInverse).setPosition(0, 0, 0);
    U.prevV.value.copy(fresh ? v : this.lastV); U.prevP.value.copy(fresh ? cam.projectionMatrix : this.lastP); this.lastV.copy(v); this.lastP.copy(cam.projectionMatrix);
    this.n = fresh ? 0 : this.n + 1; this.f++;
    U.A.value = bake ? 1 : Math.max(1 / 12, 1 / (1 + this.n));
    U.turn.value = bake ? .5 : this.f * .6180339887 % 1; U.steps.value = steps;
    // (ping-pong: last frame's out is this frame's history)
    this.flip = !this.flip; const A = this.flip ? this.hB : this.hA, B = this.flip ? this.hA : this.hB;
    this.histN.value = A.texture; this.out = B;
    quad(r, this.cur, this.marchM); quad(r, B, this.resolveM);
    // the shadow: about six times a second, or at once after a cut
    if (fresh || this.f - this.shadowAt >= 10) {
      this.shadowAt = this.f; const c = U.cam.value, k = SHADOW_SIZE / SHADOW_N;
      U.shade.value.set(Math.round(c.x / k) * k, Math.round(c.z / k) * k, 1 / SHADOW_SIZE, 1);
      quad(r, this.shadowRT, this.shadowM);
    }
  }
  dispose() { for (const t of [this.cur, this.hA, this.hB, this.shadowRT]) t.dispose(); for (const m of [this.marchM, this.resolveM, this.shadowM]) m.dispose(); }
}

/* ---------- what the rest of the kit reads ---------- */
// One sky lights a frame: its air picture for the haze (airNodes) and its clouds' shadow for the sun (gpuSunLight), as
// nodes made once whose pictures and switches the sky drawing the frame sets
export const SKY = {
  on: uniform(0), view: texture(BLACK), hz: uniform(new Vector4(RG + .001, PI / 2, PI / 2, 1)), k: uniform(SKY_K * .55),
  shadeOn: uniform(0), shade: texture(ONE), shadeAt: uniform(new Vector4(0, 0, 1 / SHADOW_SIZE, 0)), shadeK: uniform(.45),
  ext: uniform(new Vector3()),   // (real air's extinction a metre near the ground, per colour: the blue of the far distance)
  sun: uniform(new Vector3(0, 1, 0)), night: uniform(0),
};
/** The dome's soft knee: the glow round a low sun is bright, but no brighter than a painted sky's (2.5 at most). */
export function knee(c) { const l = max(c.r, max(c.g, c.b)), e = max(l.sub(1), 0); return c.mul(select(l.greaterThan(1), e.div(e.div(1.5).add(1)).add(1).div(max(l, 1e-4)), float(1))); }
/** The clouds' soft knee: their light rolls off from .45 towards .76 (brightness as the bloom reads it, which starts at .77). */
export function cloudKnee(c) { const l = dot(c, vec3(.2126, .7152, .0722)), e = max(l.sub(.45), 0); return c.mul(select(l.greaterThan(.45), e.div(e.div(.31).add(1)).add(.45).div(max(l, 1e-4)), float(1))); }
/** The air's colour looking along a world direction d with the sun along s, in the dome's units (SKY.k), for the haze. */
export function skyAt(d, s) {
  const zha = SKY.hz.z, beta = SKY.hz.y, ang = acos(clamp(d.y, -1, 1));
  const a = clamp(ang.div(zha), 0, 1), b = clamp(ang.sub(zha).div(max(beta, 1e-4)), 0, 1);
  const v = select(ang.lessThan(zha), sqrt(a.oneMinus()).oneMinus().mul(.5), sqrt(b).mul(.5).add(.5));
  const dh = d.xz, sh = s.xz, l = length(dh).mul(length(sh)), lvc = select(l.greaterThan(1e-6), dot(dh, sh).div(max(l, 1e-6)), float(1));
  const u = sqrt(clamp(lvc.mul(-.5).add(.5), 0, 1));
  return SKY.view.sample(vec2(u.mul(1 - 1 / SVW).add(.5 / SVW), v.mul(1 - 1 / SVH).add(.5 / SVH))).level(0).rgb.mul(SKY.k);
}
/** How much sun gets past the clouds to world point wp (with the origin's offset added): 1 with no clouds. */
export function cloudShadeAt(wp, sun) {
  const g = wp.xz.sub(sun.xz.div(max(sun.y, .15)).mul(wp.y)), q = g.sub(SKY.shadeAt.xy).mul(SKY.shadeAt.z).add(.5);
  const e = min(q, q.oneMinus()), edge = smoothstep(0, .08, min(e.x, e.y));
  const T = SKY.shade.sample(q).level(0).r;
  return select(SKY.shadeOn.greaterThan(.5), float(1).sub(SKY.shadeK.mul(T.oneMinus()).mul(edge)), float(1));
}

// the share of the cloud layer that is cloud for a sky with clouds: c (how much of the sky they hide, as the painted ones):
// seen through 2.5 km of layer, a thin share already hides much of the sky (a half hides 60% straight up, more further out)
const coverOf = c => c > 0 ? .5 * c + .2 * c ** 3 + .18 * Math.min(1, c * 8) : 0;

/** The GPU half of a gs.sky Sky (one per dome; hd3d-gpu.js skyDome makes it). */
export class SkyGpu {
  constructor(sky, noise2) {
    this.sky = sky; this.noise2 = noise2;
    this.atmOn = uniform(0); this.volOn = uniform(0);
    // (what the dome reads for the clouds: nothing (no light, all let through) until they are first marched)
    this.cloudTex = texture(BLACK);
    this.air = new Air(); this.clouds = null; this.info = '';
  }
  /** The dome's colour from the air picture (Hillaire), d its direction, s the sun's, in the dome's units. */
  domeAir(d, s) { return this.air.at(d, s).mul(SKY.k); }
  /**
   * Before the scene is drawn: o = { w, h (the 3D picture), cut, bake, tier (hd3d tier()), t }. Works out the air's pictures
   * and the colours the CPU side lights the scene with (sky.js reads them on its next apply), and marches the clouds.
   */
  frame(r, cam, o) {
    const S = this.sky, HDf = o.flags || {};
    const phys = S.phys && HDf.atmosphere !== false;
    this.atmOn.value = phys ? 1 : 0; SKY.on.value = phys ? 1 : 0;
    const camY = cam.position.y + ORIGIN.y;
    if (phys) {
      this.air.frame(r, S.phys, S.sunDir, camY);
      SKY.view.value = this.air.rt.texture; SKY.hz.value.copy(this.air.u.hz.value); SKY.k.value = SKY_K * (S.phys.bright ?? .55);
      SKY.sun.value.copy(S.sunDir); SKY.night.value = S.night;
      const A = this.air.L.A, near = Math.exp(-camY / 1000 / 8), mn = Math.exp(-camY / 1000 / 1.2);
      SKY.ext.value.set(A.ray[0] * near + A.mieE * mn, A.ray[1] * near + A.mieE * mn, A.ray[2] * near + A.mieE * mn).multiplyScalar(1e-3);
    }
    const vol = !!(o.tier?.ao > 0 && HDf.clouds !== false && S.clouds > 0 && this.noise2);
    // (their shadows, as the painted clouds': on a view with air (v.air()), as dark as its cloudShade)
    const air = S.view?._air;
    this.volOn.value = vol ? 1 : 0; SKY.shadeOn.value = vol && air ? 1 : 0; SKY.shadeK.value = air?.cloudShade ?? .45;
    this.info = (phys ? 'air' : '') + (vol ? (phys ? ' + ' : '') + 'clouds' : '');
    if (!vol) return;
    const C = this.clouds ||= new Clouds(S, this.noise2), U = C.u;
    U.cam.value.copy(cam.position).add(ORIGIN); U.y0.value = camY;
    U.sun.value.copy(S.lightDir || S.sunDir); U.cover.value = coverOf(S.clouds); U.gap.value = S.gap || 0;
    const t = o.t ?? 0, wd = S.cloudWind || [9, 3.5]; U.wind.value.set(wd[0] * t, 0, wd[1] * t);
    // the sun's light on the clouds, and the sky's from above and below, in the dome's units
    const k = SKY_K * (S.phys?.bright ?? .55);
    if (phys) {
      const L = this.air.L, sd = S.sunDir, hc = RG + (BASE + TOP) / 2000, tr = transmittance(L, hc, Math.max(-1, Math.min(1, sd.y)), [0, 0, 0]);
      U.sunL.value.setRGB(tr[0], tr[1], tr[2]).multiplyScalar(k * (1 - S.night));
      const top = skyLight(L, UP, sd, (BASE + TOP) / 2000, [0, 0, 0], 12);
      U.ambHi.value.setRGB(top[0], top[1], top[2]).multiplyScalar(k * 1.6); U.ambLo.value.copy(S.horizon).multiplyScalar(.5);
    } else {
      U.sunL.value.copy(S.cloudLight || S.sunCol).multiplyScalar(k * .35 * (S.sunI ?? 1));
      U.ambHi.value.copy(S.top).multiplyScalar(1.2); U.ambLo.value.copy(S.cloudDark || S.horizon).multiplyScalar(.6);
    }
    if (S.night > 0) { U.ambHi.value.lerp(S.top, S.night); U.ambLo.value.lerp(S.horizon, S.night).multiplyScalar(1 - .5 * S.night); }
    const steps = o.bake ? 64 : o.tier.ao >= 1 ? 24 : 16;
    C.frame(r, cam, o.w, o.h, !!o.cut, !!o.bake, steps);
    this.cloudTex.value = C.out.texture; SKY.shade.value = C.shadowRT.texture; SKY.shadeAt.value.copy(U.shade.value);
  }
  dispose() { this.air.dispose(); this.clouds?.dispose(); }
}
const UP = { x: 0, y: 1, z: 0 };
