// gs.outdoors.Sea's fine waves on WebGPU (sea.js, looks.sea): an ocean's spectrum for the wind (Phillips, the waves a
// wind of that speed raises, mostly running its way), moved on each frame and turned into a tile of waves by an inverse
// FFT on the graphics chip: compute passes over two storage buffers, then one that writes the tile into a texture the
// water's look reads. Each texel holds the fine waves' height, their slopes across x and z, and how sharply the surface
// curves (+ over crests: where whitecaps break, and what focuses the sun into caustics on the bottom). Only waves shorter than the swell's are in the spectrum: the swell is
// the patch's own (sea.js), the same sums height() answers, so floating things read the same heights on both renderers.
// Kit use only (hd3d-gpu.js exports seaFFT and seaStep).
import { StorageTexture, HalfFloatType, LinearFilter, RepeatWrapping } from 'three/webgpu';
import { Fn, instancedArray, instanceIndex, uniform, int, float, vec2, vec4, uvec2, cos, sin, select, textureStore } from 'three/tsl';

const G = 9.81, TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * new SeaFFT({ n, tile, wind, dir, fine, seed }): n texels a side (a power of two: 128), tile metres the waves repeat
 * over, wind (m/s) and dir (radians) as the sea's, fine: how rough (1). step(renderer, t) each frame; texture: the
 * tile (r: height, g: slope across x, b: slope across z, a: how sharply the surface curves, + over crests).
 */
export class SeaFFT {
  constructor({ n = 128, tile = 48, wind = 7, dir = 0, fine = 1, seed = 7 } = {}) {
    const N = n, NN = N * N, H = N >> 1, P = Math.round(Math.log2(N));
    if (1 << P !== N) throw new Error('SeaFFT: n must be a power of two');
    Object.assign(this, { n: N, tile, wind, dir });
    // the spectrum at t = 0, once, here: h0(k) and conj(h0(-k)) for each wave number k, and k itself with its speed
    let s = seed >>> 0 || 1; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(TAU * R());
    const V = Math.max(.5, wind), Lw = V * V / G, wx = Math.cos(dir), wz = Math.sin(dir), kCut = TAU / 9, kSmall = TAU / (tile / N * 2.2);
    const h0 = new Float32Array(NN * 2), K = new Float32Array(NN * 4);
    let slope = 0;
    for (let l = 0; l < N; l++) for (let m = 0; m < N; m++) {
      const c = l * N + m, kx = TAU * (m - H) / tile, kz = TAU * (l - H) / tile, k = Math.hypot(kx, kz);
      K[c * 4] = kx; K[c * 4 + 1] = kz; K[c * 4 + 2] = k; K[c * 4 + 3] = Math.sqrt(G * k);
      if (k < 1e-6 || m === 0 || l === 0) continue;   // (and none on the shortest row and column, which have no -k to pair with)
      const cw = (kx * wx + kz * wz) / k;
      // Phillips: the wind's peak, falling off as 1/k^4 (a little slower here, for more of the short chop a phone's screen
      // shows), mostly downwind (a little against it), the shortest damped; and none longer than the swell's shortest
      // (sea.js makes those)
      let p = Math.exp(-1 / (k * Lw) ** 2) / k ** 3.5 * cw * cw * (cw < 0 ? .07 : 1) * Math.exp(-((k / kSmall) ** 2)) * smooth(kCut * .55, kCut, k);
      p = Math.sqrt(p / 2);
      h0[c * 2] = gauss() * p; h0[c * 2 + 1] = gauss() * p;
      slope += k * k * (h0[c * 2] ** 2 + h0[c * 2 + 1] ** 2) * 2;
    }
    // as rough as the WebGL look's few fine waves: about .15 of slope (more in a fresh wind), whatever the spectrum's own size
    const want = .15 * fine * (.4 + .6 * smooth(1, 9, V)), sc = slope > 0 ? want / Math.sqrt(slope) : 0, S = new Float32Array(NN * 4);
    for (let l = 0; l < N; l++) for (let m = 0; m < N; m++) {
      const c = l * N + m, mm = (N - m) % N, ll = (N - l) % N, o = ll * N + mm;   // (-k)
      S[c * 4] = h0[c * 2] * sc; S[c * 4 + 1] = h0[c * 2 + 1] * sc; S[c * 4 + 2] = h0[o * 2] * sc; S[c * 4 + 3] = -h0[o * 2 + 1] * sc;
    }
    const Sb = instancedArray(S, 'vec4'), Kb = instancedArray(K, 'vec4'), A = instancedArray(NN, 'vec4'), B = instancedArray(NN, 'vec4');
    this.T = uniform(0);
    const cmul = (a, b) => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));
    // each k's wave now: h(k, t) = h0(k) e^(iwt) + conj(h0(-k)) e^(-iwt); packed as two fields an inverse FFT turns
    // into four real ones: (h + i dh/dx) and (dh/dz + i [k² h]), [k² h] being how sharply the surface curves (+ at the crests)
    const evolve = Fn(() => {
      const c = int(instanceIndex), s0 = Sb.element(c), k = Kb.element(c), ph = k.w.mul(this.T), e = vec2(cos(ph), sin(ph)), ec = vec2(e.x, e.y.negate());
      const h = cmul(s0.xy, e).add(cmul(s0.zw, ec));
      const dx = vec2(h.y.mul(k.x).negate(), h.x.mul(k.x)), dz = vec2(h.y.mul(k.y).negate(), h.x.mul(k.y)), kh = h.mul(k.z.mul(k.z));   // (i kx h), (i kz h), (k² h)
      A.element(c).assign(vec4(h.x.sub(dx.y), h.y.add(dx.x), dz.x.sub(kh.y), dz.y.add(kh.x)));   // h + i (i kx h), (i kz h) + i (k h)
    })().compute(NN, [64]);
    // one radix-2 pass of a Stockham FFT along rows (across x) or columns (across z), stride ns, from a into b
    const butterfly = (a, b, ns, rows) => Fn(() => {
      const t = int(instanceIndex), line = rows ? t.div(H) : t.mod(N), j = rows ? t.mod(H) : t.div(N);
      const at = q => rows ? line.mul(N).add(q) : q.mul(N).add(line);
      const k = j.mod(ns), ang = float(k).mul(TAU / (2 * ns)), w = vec2(cos(ang), sin(ang));
      const u = a.element(at(j)), v0 = a.element(at(j.add(H))), v = vec4(cmul(v0.xy, w), cmul(v0.zw, w));
      const d = j.sub(k).mul(2).add(k);
      b.element(at(d)).assign(u.add(v)); b.element(at(d.add(ns))).assign(u.sub(v));
    })().compute(NN / 2, [64]);
    this.passes = [];
    let src = A, dst = B;
    for (const rows of [true, false]) for (let p = 0; p < P; p++) { this.passes.push(butterfly(src, dst, 1 << p, rows)); [src, dst] = [dst, src]; }
    // the tile into the texture, each texel's sign put right (the spectrum's middle is k = 0, not its first entry)
    const tex = this.texture = new StorageTexture(N, N);
    tex.type = HalfFloatType; tex.magFilter = tex.minFilter = LinearFilter; tex.wrapS = tex.wrapT = RepeatWrapping; tex.generateMipmaps = false;
    const out = src;
    this.write = Fn(() => {
      const c = int(instanceIndex), x = c.mod(N), y = c.div(N), sg = select(x.add(y).mod(2).equal(0), float(1), float(-1));
      textureStore(tex, uvec2(x, y), out.element(c).mul(sg)).toWriteOnly();
    })().compute(NN, [64]);
    this.evolve = evolve; this.buffers = [Sb, Kb, A, B];
  }
  /** Moves the waves on to time t (seconds) and makes the tile: each frame, before the water is drawn. */
  step(r, t) {
    this.T.value = t;
    r.compute(this.evolve);
    for (const p of this.passes) r.compute(p);
    r.compute(this.write);
  }
  dispose() {
    this.texture.dispose();
    for (const n of [this.evolve, this.write, ...this.passes]) n.dispose?.();
    for (const b of this.buffers) b.value?.dispose?.();
  }
}
