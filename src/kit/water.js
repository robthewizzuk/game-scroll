// gs.outdoors.Water: a sea, a lake or a pond. Rolling waves you can ask about anywhere (the same sums move
// the mesh and answer water.height(x, z), so boats sit right), and water you can disturb: a square of it
// round the camera is a ripple field, so what lands in it throws up spray and sends rings out, what moves
// through it pushes a bow wave and leaves a wake and a trail of foam that fades, rain leaves rings on it, the
// shallows are paler and clearer with foam lapping at the shore, and a camera under the surface sees
// murky, tinted water.
//
//   sea = new Water({ level: 0, waves: 1, ripples: true, bed: (x, z) => land.height(x, z) }); view.scene.add(sea.mesh);
//   sea.watch(boat, { radius: 1.4 });                 // by itself from now on: its wake, its foam, a splash if it lands
//   sea.splash(x, z, { size: 1 });                    // something fell in      sea.ring(x, z): something small did
//   sea.underwater(view);                             // the look for a camera that goes under
//   update(dt) { sea.rain = raining; sea.update(dt, camera.position); for (const s of sea.splashes) sounds.splash(); if (sea.under) ... }
//
// The ripples are a small grid stepped on the processor and handed to the stock material as two small
// pictures (a normal map for the water, an alpha map for a layer of foam over it), so it is the same on
// WebGL and WebGPU and costs nothing while the water is calm. Kit use only: games reach it as gs.outdoors.Water.
import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Color, DataTexture, DoubleSide, DynamicDrawUsage, FogExp2, AdditiveBlending, BackSide, IcosahedronGeometry, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RingGeometry, SphereGeometry, RepeatWrapping, RGBAFormat, RGFormat, UnsignedByteType, Vector2 } from 'three';

const STEP = 1 / 60, TAU = Math.PI * 2, FADE = .996;   // (foam: a third is left after four and a half seconds)
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const posOf = t => t.position || t.pos || t;

// What foam looks like close up: a tile of blotches and bubbles, laid over the water every few metres. The
// ripple square only says how much foam lies where; the two are multiplied and cut at a half, so thick foam
// is whole (the tile's alpha never falls under a half), and as it thins it opens into holes, then scraps, then goes.
let LACE = null;
function lace() {
  if (LACE) return LACE;
  const S = 128, pix = new Uint8Array(S * S * 4), f = new Float32Array(S * S); let s = 4321; const R = () => (s = (s * 16807) % 2147483647) / 2147483647, sm = t => t * t * (3 - 2 * t);
  // blotches: value noise that tiles, five sizes from half the tile down
  for (const [n, amp] of [[2, .34], [4, .27], [8, .19], [16, .12], [32, .08]]) {
    const g = Float32Array.from({ length: n * n }, R);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = i / S * n, y = j / S * n, x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      f[j * S + i] += amp * ((g[y0 * n + x0] * (1 - fx) + g[y0 * n + x1] * fx) * (1 - fy) + (g[y1 * n + x0] * (1 - fx) + g[y1 * n + x1] * fx) * fy);
    }
  }
  // bubbles: small cells whose walls are a little thicker foam
  const n = 20, px = Float32Array.from({ length: n * n }, R), py = Float32Array.from({ length: n * n }, R);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i / S * n, y = j / S * n, cx = Math.floor(x), cy = Math.floor(y); let d1 = 9, d2 = 9;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const q = ((cy + b + n) % n) * n + (cx + a + n) % n, d = Math.hypot(cx + a + px[q] - x, cy + b + py[q] - y);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const wall = 1 - clamp((d2 - d1) / .3, 0, 1), v = clamp((f[j * S + i] - .3) * 2.3 + wall * .22, 0, 1), p = (j * S + i) * 4;
    pix[p] = pix[p + 1] = pix[p + 2] = 228 + 27 * wall; pix[p + 3] = (.5 + .5 * v) * 255 + .5;
  }
  const t = new DataTexture(pix, S, S, RGBAFormat, UnsignedByteType); t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return LACE = t;
}

// The square of water that can be disturbed: heights and speeds on a grid that travels with the centre in
// whole cells (what is in it stays where it is in the world), foam that lies and fades, and how deep the bed is.
class Ripples {
  constructor(water, { cells = 128, reach = 24, speed = 2.6 } = {}) {
    const N = this.N = Math.max(32, Math.min(512, Math.round(cells))); this.water = water; this.reach = reach; this.cell = reach * 2 / N; this.speed = speed;
    this.H = new Float32Array(N * N); this.V = new Float32Array(N * N); this.F = new Float32Array(N * N); this.B = water.bed ? new Float32Array(N * N) : null;
    this.k = Math.min(.45, (speed * STEP / this.cell) ** 2);
    // waves die away over the outer cells, so none comes back off the edge of the square or is cut off by it
    const E = 10; this.edge = Float32Array.from({ length: N }, (_, i) => { const f = Math.min(1, Math.min(i, N - 1 - i) / E); return 1 - .3 * (1 - f) * (1 - f); });
    this.ix = NaN; this.iz = NaN; this.acc = 0; this.live = 0; this.sources = []; this.shore = []; this.seed = 1234567;
    this.energy = 0; this.white = false; this.calmPix = true; this.foamPix = true; this.moved = false; this.wantFoam = true;   // (calmPix, foamPix: the pictures are blank now)
    // only the part of the grid that is not at rest is stepped and painted: [i0, i1, j0, j1] of the waves, of the foam, and of what each picture last showed
    this.box = [N, -1, N, -1]; this.fbox = [N, -1, N, -1]; this.ndone = [N, -1, N, -1]; this.fdone = [N, -1, N, -1]; this.touch = this.box; this.sbox = [N, -1, N, -1];
    this.nPix = new Uint8Array(N * N * 4); for (let i = 0; i < N * N; i++) { this.nPix[i * 4] = 128; this.nPix[i * 4 + 1] = 128; this.nPix[i * 4 + 2] = 255; this.nPix[i * 4 + 3] = 255; }
    this.fPix = new Uint8Array(N * N * 2);
    const tex = (pix, fmt) => { const t = new DataTexture(pix, N, N, fmt, UnsignedByteType); t.magFilter = t.minFilter = LinearFilter; t.wrapS = t.wrapT = ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true; return t; };
    this.normalTex = tex(this.nPix, RGBAFormat); this.foamTex = tex(this.fPix, RGFormat);
  }
  rnd() { return (this.seed = (this.seed * 16807) % 2147483647) / 2147483647; }
  grow(b, i0, i1, j0, j1) { if (i0 < b[0]) b[0] = i0; if (i1 > b[1]) b[1] = i1; if (j0 < b[2]) b[2] = j0; if (j1 > b[3]) b[3] = j1; }
  // two boxes as one, inside the grid's rim
  span(a, b, pad = 0) { const N = this.N; return [Math.max(1, Math.min(a[0], b[0]) - pad), Math.min(N - 2, Math.max(a[1], b[1]) + pad), Math.max(1, Math.min(a[2], b[2]) - pad), Math.min(N - 2, Math.max(a[3], b[3]) + pad)]; }
  get x0() { return this.ix * this.cell; }
  get z0() { return this.iz * this.cell; }
  // the square follows the centre a whole cell at a time; what it leaves behind is lost, what comes in is calm
  place(cx, cz) {
    const N = this.N, ix = Math.round((cx - this.reach) / this.cell), iz = Math.round((cz - this.reach) / this.cell);
    if (ix === this.ix && iz === this.iz) return false;
    const di = ix - this.ix, dj = iz - this.iz, all = !(Math.abs(di) < N && Math.abs(dj) < N); this.ix = ix; this.iz = iz;
    if (all) { this.H.fill(0); this.V.fill(0); this.F.fill(0); this.beds(0, N, 0, N); this.box = [N, -1, N, -1]; this.fbox = [N, -1, N, -1]; this.sources.length = 0; }
    else {
      for (const b of [this.box, this.fbox]) if (b[1] >= b[0]) { b[0] -= di; b[1] -= di; b[2] -= dj; b[3] -= dj; }
      const s = dj * N + di, n = N * N;
      for (const a of [this.H, this.V, this.F, this.B]) if (a) { if (s > 0) a.copyWithin(0, s); else a.copyWithin(-s, 0, n + s); }
      const i0 = di > 0 ? N - di : 0, i1 = di > 0 ? N : -di, j0 = dj > 0 ? N - dj : 0, j1 = dj > 0 ? N : -dj;
      if (di) this.fresh(i0, i1, 0, N); if (dj) this.fresh(0, N, j0, j1);
    }
    if (this.B) this.shoreline();
    this.moved = true; this.ndone = [1, N - 2, 1, N - 2]; this.fdone = [1, N - 2, 1, N - 2];   // (the pictures show the square from its new place: all of each is painted again)
    return true;
  }
  fresh(i0, i1, j0, j1) { const N = this.N; for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const c = j * N + i; this.H[c] = this.V[c] = this.F[c] = 0; } this.beds(i0, i1, j0, j1); }
  // how deep the calm water is over each cell (the bed's own answer: asked once for each cell as it comes into the square)
  beds(i0, i1, j0, j1) {
    const B = this.B; if (!B) return; const N = this.N, w = this.water, cell = this.cell, x0 = this.x0, z0 = this.z0;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) B[j * N + i] = w.level - w.bed(x0 + (i + .5) * cell, z0 + (j + .5) * cell);
  }
  // the cells the waterline can reach: only these are asked about for foam at the shore
  shoreline() {
    const B = this.B, n = this.N * this.N, top = this.water.swell + .3, list = this.shore; list.length = 0;
    const N = this.N, sb = this.sbox = [N, -1, N, -1];
    for (let c = 0; c < n; c++) if (B[c] > -top && B[c] < top) { list.push(c); const i = c % N, j = (c - i) / N; this.grow(sb, i, i, j, j); }
  }
  /** The ripple's height at a world point (0 outside the square). */
  at(x, z) {
    const N = this.N, fx = (x - this.x0) / this.cell - .5, fz = (z - this.z0) / this.cell - .5;
    if (!(fx >= 0 && fz >= 0 && fx < N - 1 && fz < N - 1)) return 0;
    const i = fx | 0, j = fz | 0, a = fx - i, b = fz - j, c = j * N + i, H = this.H;
    return (H[c] * (1 - a) + H[c + 1] * a) * (1 - b) + (H[c + N] * (1 - a) + H[c + N + 1] * a) * b;
  }
  // every cell within r of a world point: fn(cell, weight 1 at the middle .. 0 at r)
  disc(x, z, r, fn) {
    const N = this.N, cell = this.cell, rc = Math.max(r, cell * .75), fx = (x - this.x0) / cell - .5, fz = (z - this.z0) / cell - .5, k = rc / cell;
    const i0 = Math.max(1, Math.ceil(fx - k)), i1 = Math.min(N - 2, Math.floor(fx + k)), j0 = Math.max(1, Math.ceil(fz - k)), j1 = Math.min(N - 2, Math.floor(fz + k));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = ((i - fx) ** 2 + (j - fz) ** 2) / (k * k); if (d < 1) fn(j * N + i, (1 - d) * (1 - d)); }
    if (i1 >= i0 && j1 >= j0) this.grow(this.touch, i0, i1, j0, j1);
  }
  inside(x, z, margin = 0) { const m = margin + this.cell; return x > this.x0 + m && z > this.z0 + m && x < this.x0 + this.reach * 2 - m && z < this.z0 + this.reach * 2 - m; }
  /** Pushes the water at a point down (or up) by metres, over a disc. */
  dent(x, z, r, metres) { if (!this.inside(x, z, -r)) return; this.touch = this.box; this.disc(x, z, r, (c, w) => { this.H[c] += metres * w; }); this.live = 90; }
  foam(x, z, r, amount, most = 1.25) { if (!this.inside(x, z, -r)) return; this.touch = this.fbox; this.disc(x, z, r, (c, w) => { const f = this.F[c] + amount * Math.min(1, w * 3); if (f > this.F[c]) this.F[c] = f > most ? Math.max(this.F[c], most) : f; }); }
  /** Something that bobs at a point for a few beats: rings spread out from it. */
  ring(x, z, size, strength) {
    if (!this.inside(x, z)) return;
    const len = Math.max(this.cell * 4, size * 1.6), f = this.speed / len;
    this.sources.push({ x, z, r: Math.max(this.cell * 1.2, size * .5), a: .05 * strength * Math.min(1.6, .5 + size * .5), w: TAU * f, t: 0, life: 2.6 / f });
    this.live = 90;
  }
  // the waves move on one step, in the part of the grid that is not at rest
  step() {
    const { N, H, V, F, B, k, edge } = this;
    this.touch = this.box;
    for (let q = this.sources.length - 1; q >= 0; q--) {
      const s = this.sources[q], push = s.a * Math.cos(s.w * s.t) * Math.exp(-s.t / s.life * 2.2) * s.w * STEP; s.t += STEP;
      this.disc(s.x, s.z, s.r, (c, wt) => { V[c] -= push * wt; });
      if (s.t > s.life) this.sources.splice(q, 1);
    }
    const [i0, i1, j0, j1] = this.span(this.box, this.box, 1), nb = [N, -1, N, -1], fb = this.fbox; let e = 0;
    for (let j = j0; j <= j1; j++) {
      const ej = edge[j] * .9945; let c = j * N + i0;
      for (let i = i0; i <= i1; i++, c++) {
        let v = (V[c] + (H[c - 1] + H[c + 1] + H[c - N] + H[c + N] - 4 * H[c]) * k) * ej * edge[i];
        if (B) { const d = B[c]; if (d < .35) v *= d > 0 ? .8 + d * .55 : 0; }   // ripples die on the beach
        V[c] = v;
      }
    }
    for (let j = j0; j <= j1; j++) {
      let c = j * N + i0, lo = N, hi = -1;
      for (let i = i0; i <= i1; i++, c++) {
        let h = (H[c] + V[c]) * .999; if (h > .3) h = .3; else if (h < -.3) h = -.3; if (B && B[c] <= 0) h = 0;   // (.999: the whole surface finds its level again)
        const a = h < 0 ? -h : h, av = V[c] < 0 ? -V[c] : V[c];
        if (a < 2e-5 && av < 2e-6) { H[c] = 0; V[c] = 0; continue; }
        H[c] = h; if (a > e) e = a; if (av * 12 > e) e = av * 12; if (i < lo) lo = i; hi = i;
        if (av > .03) { const f = F[c] + (av - .03) * 4; F[c] = f > 1.25 ? 1.25 : f; this.grow(fb, i, i, j, j); }   // water thrown about goes white
      }
      if (hi >= 0) this.grow(nb, lo - 1, hi + 1, j - 1, j + 1);   // (a wave gets a cell further each step)
    }
    this.box = nb; this.energy = e;
    if (e > .007 || this.sources.length) this.live = Math.max(this.live, 30);   // (under 7 mm it is as good as still)
  }
  // foam fades where it lies
  fade(dt) {
    const { N, F } = this, [i0, i1, j0, j1] = this.span(this.fbox, this.fbox), k = Math.pow(FADE, dt / STEP), nf = [N, -1, N, -1];
    for (let j = j0; j <= j1; j++) {
      let c = j * N + i0, lo = N, hi = -1;
      for (let i = i0; i <= i1; i++, c++) { let f = F[c]; if (f > 0) { f *= k; if (f < .004) f = 0; else { if (i < lo) lo = i; hi = i; } F[c] = f; } }
      if (hi >= 0) this.grow(nf, lo, hi, j, j);
    }
    this.fbox = nf;
  }
  // foam where the water is thin over the bed: the waterline moves in and out with the waves and leaves foam behind
  lap(dt) {
    const { N, B, F, H, cell } = this, thin = Math.pow(.955, dt / STEP), w = this.water, x0 = this.x0 + cell * .5, z0 = this.z0 + cell * .5, band = .14;
    // (the waves' height here comes from the patch's own points, as they were last frame: no sines to take)
    const Y = w.Y, n1 = w.segments + 1, pc = w.size / w.segments, ox = (x0 - w.Yx) / pc, oz = (z0 - w.Yz) / pc, sc = cell / pc, top = n1 - 1.001;
    for (const c of this.shore) {
      const i = c % N, j = (c - i) / N; let sw = 0;
      if (Y) { const fx = clamp(ox + i * sc, 0, top), fz = clamp(oz + j * sc, 0, top), a = fx | 0, b = fz | 0, u = fx - a, v = fz - b, q = b * n1 + a; sw = (Y[q] * (1 - u) + Y[q + 1] * u) * (1 - v) + (Y[q + n1] * (1 - u) + Y[q + n1 + 1] * u) * v; }
      const d = B[c] + sw + H[c];
      if (d > 0 && d < band) { const f = .5 + .24 * (1 - d / band); if (f > F[c]) F[c] = f; }   // (.5 is where the lace starts to show: scraps at the band's deep edge, most of it at the waterline)
      else if (F[c] > 0 && F[c] < .8) F[c] *= thin;   // (what a wave leaves behind as it runs back soaks away; a splash's foam stays)
    }
    const sb = this.sbox; this.grow(this.fbox, sb[0], sb[1], sb[2], sb[3]);
  }
  /** One frame: the grid moves on, and the pictures follow where anything changed. */
  update(dt) {
    const busy = this.live > 0 || this.sources.length > 0;
    if (busy) {
      this.acc = Math.min(this.acc + dt, STEP * 3);
      while (this.acc >= STEP) { this.acc -= STEP; this.step(); if (this.live > 0) this.live--; }
    } else if (this.energy) { this.energy = 0; this.H.fill(0); this.V.fill(0); this.box = [this.N, -1, this.N, -1]; }
    if (dt > 0) { if (this.fbox[1] >= this.fbox[0]) this.fade(dt); if (this.shore.length) this.lap(dt); }
    this.white = this.fbox[1] >= this.fbox[0];
    if (this.energy > 0 || !this.calmPix || this.moved) this.normals();
    if (this.wantFoam && (this.white || !this.foamPix || this.moved)) this.foams();
    this.moved = false;
    return busy;
  }
  // the heights as a normal map (red: across x, green: across -z, the way the water mesh's own map lies; its rows run from far z to near)
  normals() {
    const { N, H, nPix } = this, g = 1 / (2 * this.cell), [i0, i1, j0, j1] = this.span(this.box, this.ndone, 1); let any = false;
    for (let j = j0; j <= j1; j++) {
      let c = j * N + i0, p = ((N - 1 - j) * N + i0) * 4;
      for (let i = i0; i <= i1; i++, c++, p += 4) {
        const dx = (H[c + 1] - H[c - 1]) * g, dz = (H[c + N] - H[c - N]) * g;
        if (dx || dz) { const l = 127 / Math.sqrt(dx * dx + dz * dz + 1); nPix[p] = 128 - dx * l; nPix[p + 1] = 128 + dz * l; nPix[p + 2] = 128 + l; any = true; }
        else { nPix[p] = 128; nPix[p + 1] = 128; nPix[p + 2] = 255; }
      }
    }
    this.ndone = [...this.box]; this.calmPix = !any; this.normalTex.needsUpdate = true;
  }
  // how much foam lies where (the lace tile breaks it up on the way to the screen)
  foams() {
    const { N, F, fPix } = this, [i0, i1, j0, j1] = this.span(this.fbox, this.fdone); let any = false;
    for (let j = j0; j <= j1; j++) {
      let c = j * N + i0, p = ((N - 1 - j) * N + i0) * 2;
      for (let i = i0; i <= i1; i++, c++, p += 2) { const f = F[c]; let v = 0; if (f > 0) { v = f >= 1 ? 255 : f * 255; any = true; } fPix[p] = fPix[p + 1] = v; }
    }
    this.fdone = [...this.fbox]; this.foamPix = !any; this.foamTex.needsUpdate = true;
  }
  dispose() { this.normalTex.dispose(); this.foamTex.dispose(); }
}

// Spray: drops thrown up that fall back, drawn as copies of one small shape.
class Spray {
  constructor(max, colour) {
    this.n = max; this.P = new Float32Array(max * 3); this.Vl = new Float32Array(max * 3); this.S = new Float32Array(max); this.L = new Float32Array(max); this.next = 0; this.alive = 0;
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: colour, roughness: .75, metalness: 0 }), max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage); this.mesh.instanceMatrix.array.fill(0); this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.name = 'water:spray'; this.mesh.userData.detail = false;
    this.mesh.visible = false;
  }
  add(x, y, z, vx, vy, vz, size) {
    const i = this.next; this.next = (i + 1) % this.n; if (!(this.L[i] > 0)) this.alive++;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z; this.Vl[i * 3] = vx; this.Vl[i * 3 + 1] = vy; this.Vl[i * 3 + 2] = vz; this.S[i] = size; this.L[i] = 1;
  }
  update(dt, water) {
    if (!this.alive) { if (this.mesh.visible) this.mesh.visible = false; return; }
    const { P, Vl, S, L } = this, A = this.mesh.instanceMatrix.array; this.mesh.visible = true;
    for (let i = 0; i < this.n; i++) {
      if (!(L[i] > 0)) continue;
      const k = i * 3, o = i * 16; Vl[k + 1] -= 9.8 * dt; const drag = 1 - .6 * dt; Vl[k] *= drag; Vl[k + 2] *= drag;
      P[k] += Vl[k] * dt; P[k + 1] += Vl[k + 1] * dt; P[k + 2] += Vl[k + 2] * dt; L[i] -= dt * .45;
      const done = L[i] <= 0 || (Vl[k + 1] < 0 && P[k + 1] < water.swellAt(P[k], P[k + 2]) + water.level);
      if (done) { L[i] = 0; this.alive--; A[o] = A[o + 5] = A[o + 10] = 0; if (S[i] > .05) water.rip?.foam(P[k], P[k + 2], S[i] * 2.5, .5, .6); continue; }
      const s = S[i] * (.6 + .4 * L[i]), tall = s * (1 + Math.min(1.5, Math.abs(Vl[k + 1]) * .12));   // (drawn out along its fall)
      A[o] = s; A[o + 5] = tall; A[o + 10] = s; A[o + 12] = P[k]; A[o + 13] = P[k + 1]; A[o + 14] = P[k + 2]; A[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.L.fill(0); this.alive = 0; this.mesh.instanceMatrix.array.fill(0); this.mesh.instanceMatrix.needsUpdate = true; this.mesh.visible = false; }
}

// Rain landing: rings that open and fade where the drops fall. Copies of one flat ring, added to the picture
// (so a ring fades by going dark), riding on the waves.
class Dapple {
  constructor(max, colour) {
    this.n = max; this.P = new Float32Array(max * 2); this.T = new Float32Array(max).fill(1); this.R = new Float32Array(max); this.next = 0; this.alive = 0;
    const g = new RingGeometry(.84, 1, 12, 1); g.rotateX(-Math.PI / 2);
    this.mesh = new InstancedMesh(g, new MeshBasicMaterial({ color: colour, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }), max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage); this.mesh.instanceMatrix.array.fill(0);
    this.mesh.setColorAt(0, new Color(0)); this.mesh.instanceColor.array.fill(0); this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.renderOrder = 2; this.mesh.name = 'water:rain'; this.mesh.userData.detail = false; this.mesh.visible = false;
  }
  add(x, z, r) { const i = this.next; this.next = (i + 1) % this.n; if (this.T[i] >= 1) this.alive++; this.P[i * 2] = x; this.P[i * 2 + 1] = z; this.T[i] = 0; this.R[i] = r; }
  update(dt, water) {
    if (!this.alive) { if (this.mesh.visible) this.mesh.visible = false; return; }
    const { P, T, R } = this, A = this.mesh.instanceMatrix.array, C = this.mesh.instanceColor.array; this.mesh.visible = true;
    for (let i = 0; i < this.n; i++) {
      if (T[i] >= 1) continue;
      const t = T[i] += dt / .45, o = i * 16, k = i * 3;
      if (t >= 1) { T[i] = 1; this.alive--; A[o] = A[o + 5] = A[o + 10] = 0; C[k] = C[k + 1] = C[k + 2] = 0; continue; }
      const s = R[i] * (.12 + .88 * Math.sqrt(t)), f = (1 - t) * (1 - t) * .55, x = P[i * 2], z = P[i * 2 + 1];
      A[o] = s; A[o + 5] = 1; A[o + 10] = s; A[o + 12] = x; A[o + 13] = water.level + water.swellAt(x, z) + .012; A[o + 14] = z; A[o + 15] = 1;
      C[k] = C[k + 1] = C[k + 2] = f;
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.T.fill(1); this.alive = 0; this.mesh.instanceMatrix.array.fill(0); this.mesh.instanceMatrix.needsUpdate = true; this.mesh.visible = false; }
}

/**
 * Water with waves. level: the calm height; waves: how rough (0 calm .. 2 stormy) or your own list
 * [{ dir: radians, length: metres, height: metres, speed }]; size and segments: the patch that
 * follows the camera. colour, opacity, material: the look. height(x, z) and normal(x, z) use the
 * same waves as the mesh, so floating things match what you see.
 *
 * Water you can disturb: ripples (true, or how many cells across: 128) makes the square of water within
 * reach metres (24) of the centre a ripple field: ring(), splash(), watch() and rain work in it. bed:
 * (x, z) => the height of the ground under the water (land.height): the shallows are paler and clearer
 * (shallow: their colour; clear: metres of water that hide the bed), and foam laps the shore. foam: its
 * colour, or false for none. spray: how many drops splashes can throw (80; 0: none).
 */
export class Water {
  constructor({ level = 0, waves = 1, size = 160, segments = 64, colour = '#2f7fb8', opacity = .85, material = null, seed = 3, ripples = 0, reach = 24, bed = null, shallow = null, clear = 2.5, foam = '#f2f8fa', spray = 80 } = {}) {
    Object.assign(this, { level, size, segments, bed, clear, reach }); this.t = 0;
    let s = seed; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    this.list = Array.isArray(waves) ? waves : Array.from({ length: 4 }, (_, i) => ({ dir: R() * Math.PI * 2, length: [24, 13, 7, 4][i], height: waves * [.35, .18, .08, .04][i], speed: 0 }));
    for (const w of this.list) { w.k = Math.PI * 2 / w.length; w.c = w.speed || Math.sqrt(9.8 / w.k); w.dx = Math.cos(w.dir); w.dz = Math.sin(w.dir); w.ph = R() * 6.28; }
    this.rnd = R;
    this.swell = this.list.reduce((a, w) => a + Math.abs(w.height), 0);   // the most the waves can lift it
    const g = new PlaneGeometry(size, size, segments, segments); g.rotateX(-Math.PI / 2);
    this.own = !material;
    this.mesh = new Mesh(g, material || new MeshStandardMaterial({ color: colour, roughness: .15, metalness: .1, transparent: opacity < 1, opacity }));
    this.mesh.receiveShadow = true; this.base = Float32Array.from(g.attributes.position.array);
    this.deep = new Color(colour); this.shallow = shallow ? new Color(shallow) : this.deep.clone().lerp(new Color('#9fe0d0'), .55); this.foamColour = foam;
    this.sprayMax = spray; this.rain = 0; this.rained = false; this.busy = false; this.splashes = []; this.pending = []; this.watched = []; this.under = 0; this.rip = null; this.spray = null; this.dapple = null; this.foamMesh = null; this.medium = null;
    if (bed) { g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4)); const m = this.mesh.material; m.vertexColors = true; m.transparent = true; m.needsUpdate = true; this.shadeAt = null; }
    if (ripples) this.ripples(ripples === true ? {} : { cells: ripples });
    this.update(0, { x: 0, y: 0, z: 0 });
  }
  /**
   * Makes the water round the centre a ripple field (done by itself the first time something disturbs it; ask
   * for it with the level, `ripples: true`, so nothing new is built in the middle of a round). cells: how fine
   * (128 a side); reach: metres from the centre to its edge.
   */
  ripples({ cells = 128, reach = this.reach, speed = 2.6 } = {}) {
    if (this.rip) return this;
    const r = this.rip = new Ripples(this, { cells, reach, speed }), m = this.mesh.material, g = this.mesh.geometry;
    if (!m.normalMap) { m.normalMap = r.normalTex; m.normalScale = new Vector2(2, 2); m.needsUpdate = true; this.rippleMap = true; }
    if (this.foamColour !== false) {
      // a layer of foam over the middle of the patch: the very same points, so it lies on the water exactly
      const n = this.segments, cp = this.size / n, hw = Math.min(n / 2, Math.ceil((reach + cp / 2) / cp)), a0 = Math.floor(n / 2 - hw), a1 = Math.ceil(n / 2 + hw), idx = [];
      for (let iy = a0; iy < a1; iy++) for (let ix = a0; ix < a1; ix++) { const a = ix + (n + 1) * iy, b = ix + (n + 1) * (iy + 1), c = ix + 1 + (n + 1) * (iy + 1), d = ix + 1 + (n + 1) * iy; idx.push(a, b, d, b, c, d); }
      const fg = new BufferGeometry(); for (const k of ['position', 'normal', 'uv']) fg.setAttribute(k, g.attributes[k]); fg.setIndex(idx);
      this.foamMesh = new Mesh(fg, new MeshStandardMaterial({ color: this.foamColour, roughness: .9, metalness: 0, map: this.lace = lace().clone(), alphaMap: r.foamTex, alphaTest: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      this.foamMesh.frustumCulled = false; this.foamMesh.renderOrder = this.mesh.renderOrder + 1; this.foamMesh.receiveShadow = true; this.foamMesh.name = 'water:foam'; this.foamMesh.userData.detail = false;
      this.mesh.add(this.foamMesh);
    }
    r.wantFoam = !!this.foamMesh;
    this.drops(); r.place(this.cx ?? 0, this.cz ?? 0); this.lay();
    return this;
  }
  // the drops that splashes and rain throw up (made the first time they are wanted)
  drops() { if (!this.spray && this.sprayMax > 0) { this.spray = new Spray(this.sprayMax, this.foamColour || '#f2f8fa'); this.mesh.add(this.spray.mesh); } return this.spray; }
  // the two pictures lie over the square of ripples wherever the patch has got to
  lay() {
    const r = this.rip, p = this.mesh.position;
    if (r) { const W = r.reach * 2, a = this.size / W, ox = (p.x - this.size / 2 - r.x0) / W, oy = 1 - (p.z + this.size / 2 - r.z0) / W; for (const t of [this.rippleMap ? r.normalTex : null, this.foamMesh ? r.foamTex : null]) if (t) { t.repeat.set(a, a); t.offset.set(ox, oy); } }
    if (this.lace) { const L = 3, k = this.size / L; this.lace.repeat.set(k, k); this.lace.offset.set(((p.x - this.size / 2) / L) % 1, (-(p.z + this.size / 2) / L) % 1); }   // (the lace stays where it is on the water as the patch moves)
    for (const q of [this.spray, this.dapple]) if (q) q.mesh.position.set(-p.x, -p.y, -p.z);   // (their copies are placed in the world)
  }
  /** The waves' height over the calm level at x, z (no ripples). */
  swellAt(x, z, t = this.t) { let y = 0; for (const w of this.list) y += w.height * Math.sin(w.k * (x * w.dx + z * w.dz) - w.k * w.c * t + w.ph); return y; }
  /** Water height at x, z right now. */
  height(x, z, t = this.t) { let y = this.level; for (const w of this.list) y += w.height * Math.sin(w.k * (x * w.dx + z * w.dz) - w.k * w.c * t + w.ph); return this.rip && t === this.t ? y + this.rip.at(x, z) : y; }
  /** Surface up direction at x, z. */
  normal(x, z, t = this.t) {
    let gx = 0, gz = 0;
    for (const w of this.list) { const d = w.height * w.k * Math.cos(w.k * (x * w.dx + z * w.dz) - w.k * w.c * t + w.ph); gx += d * w.dx; gz += d * w.dz; }
    const l = Math.hypot(gx, 1, gz); return { x: -gx / l, y: 1 / l, z: -gz / l };
  }
  /** How deep a point is under the surface (negative above it). */
  depth(p) { return this.height(p.x, p.z) - p.y; }

  /** Something small dropped in at x, z: rings spread out. size: metres across it; strength: 1. */
  ring(x, z, { size = .4, strength = 1 } = {}) { this.ripples(); this.rip.ring(x, z, size, strength); return this; }
  /**
   * Something landed in the water at x, z: spray is thrown up, rings go out and a patch of foam is left. size:
   * metres across it; speed: how fast it hit (metres a second: higher spray). It is listed in `splashes` for
   * this frame, for your sound.
   */
  splash(x, z, { size = 1, speed = 4 } = {}) {
    this.ripples(); const r = this.rip, y = this.height(x, z);
    this.pending.push({ x, y, z, size, speed });
    if (r.inside(x, z)) {
      r.dent(x, z, Math.max(r.cell * 1.5, size * .6), -Math.min(.25, .05 + size * .06 + speed * .008));
      r.ring(x, z, size, .7 + Math.min(1.2, speed * .1)); r.foam(x, z, size * .8, 1.2);
    }
    if (this.spray) {
      const n = Math.min(this.spray.n, Math.round(8 + size * 9 + speed)), up = 1.6 + Math.min(9, speed) * .55 + size * .5;
      for (let q = 0; q < n; q++) { const a = r.rnd() * TAU, d = Math.sqrt(r.rnd()) * size * .45, out = (.4 + r.rnd() * 1.1) * (.6 + size * .5), v = up * (.45 + r.rnd() * .75); this.spray.add(x + Math.cos(a) * d, y + .02, z + Math.sin(a) * d, Math.cos(a) * out, v, Math.sin(a) * out, (.035 + r.rnd() * .05) * Math.min(2.2, .6 + size * .5)); }
    }
    return this;
  }
  /**
   * Watches something that can be in the water (a mesh, a body, a boat: anything with a position or x, y, z)
   * and from then on does the rest by itself: a splash when it lands in the water or leaps out, the water it
   * pushes aside as it moves (a bow wave, and a wake behind it when it is fast), and a trail of foam. radius:
   * half its width in the water (.5); bottom, top: how far below and above its position it reaches (default
   * the radius each way: a person standing has bottom 0 and top 1.8). Returns the watch: remove() stops it.
   */
  watch(thing, { radius = .5, bottom = -radius, top = radius, foam = 1, splash = 1 } = {}) {
    this.ripples(); const p = posOf(thing);
    const wt = { thing, radius, bottom, top, foam, splash, x: p.x, y: p.y, z: p.z, wet: false, where: 0, first: true, gone: 0, remove: () => { this.unwatch(thing); } };
    this.watched.push(wt); return wt;
  }
  unwatch(thing) { this.watched = this.watched.filter(w => w.thing !== thing && w !== thing); return this; }
  // rain on the water (any water: no ripples needed): it is duller (not a mirror any more), rings open where the drops land round the centre, and little drops hop back up
  wetting(dt) {
    const rain = clamp(this.rain, 0, 1), m = this.mesh.material, R = this.rnd;
    if (this.own) { this.rough0 ??= m.roughness; m.roughness = this.rough0 + .22 * rain; }
    if (rain > 0 && dt > 0 && this.sprayMax > 0) {
      if (!this.dapple) { this.dapple = new Dapple(Math.min(640, this.sprayMax * 8), this.foamColour || '#f2f8fa'); this.mesh.add(this.dapple.mesh); }
      const spray = this.drops(), cx = this.cx ?? 0, cz = this.cz ?? 0, reach = 9, n = rain * dt * this.dapple.n / .45, k = Math.floor(n) + (R() < n % 1 ? 1 : 0);
      for (let q = 0; q < k; q++) {
        const a = R() * TAU, d = Math.pow(R(), .65) * reach, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;   // (more of them near the centre, where they can be seen)
        this.dapple.add(x, z, .07 + R() * .13);
        if (q % 8 === 0) spray.add(x, this.level + this.swellAt(x, z) + .01, z, (R() - .5) * .4, 1 + R() * 1.1, (R() - .5) * .4, .016 + R() * .014);
      }
    }
    this.rained = rain > 0 || (this.dapple?.alive || 0) > 0;
  }
  // each watched thing: where it has got to, what it pushed aside, whether it went in or came out
  wakes(dt) {
    const r = this.rip;
    for (const w of this.watched) {
      const p = posOf(w.thing), x = p.x, y = p.y, z = p.z, top = this.level + this.swellAt(x, z), where = y + w.bottom >= top ? 0 : y + w.top <= top ? 2 : 1, wet = where === 1;   // (0: in the air; 1: in the surface; 2: right under)
      const vx = (x - w.x) / dt, vy = (y - w.y) / dt, vz = (z - w.z) / dt, sp = Math.hypot(vx, vz), jump = Math.hypot(x - w.x, z - w.z) > w.radius * 6 + 4;   // (jump: it was put somewhere else)
      if (!w.first && !jump && dt > 0) {
        const push = .05 + Math.min(.09, w.radius * .05);
        if (where !== w.where) {
          // out of the air or into it: a splash if it is fast. Going right under, or coming up under the surface: none
          const hard = Math.abs(vy), air = !where || !w.where;
          if (air && hard > 1.5 && w.splash) this.splash(where ? x : w.x, where ? z : w.z, { size: w.radius * 1.7 * w.splash, speed: where ? hard : hard * .5 });
          else if (wet) r.dent(x, z, w.radius, -push); else if (w.where === 1) r.dent(w.x, w.z, w.radius, push);
        } else if (wet && (sp > .05 || Math.abs(vy) > .05)) {
          // the water under it goes with it: down where it has got to, back up where it was
          r.dent(x, z, w.radius, -push); r.dent(w.x, w.z, w.radius, push);
          // and it leaves rings behind as it goes: slow, they spread round it; fast, it outruns them and they make its wake
          w.gone += sp * dt;
          if (sp > .25 && w.gone > Math.max(.6, w.radius * .9)) { w.gone = 0; r.ring(x - vx / sp * w.radius * .5, z - vz / sp * w.radius * .5, w.radius * .9, clamp(.5 + sp * .25, .5, 1.7)); }
          if (w.foam && sp > 1.2) r.foam(x - vx / sp * w.radius * .6, z - vz / sp * w.radius * .6, w.radius * .9, Math.min(1, (sp - 1.2) * .2) * dt * 6 * w.foam, .7 + Math.min(.4, sp * .05));
          if (this.spray && sp > 5 && r.rnd() < (sp - 5) * dt * 3) { const a = Math.atan2(vz, vx) + (r.rnd() < .5 ? 1 : -1) * (.5 + r.rnd() * .6); this.spray.add(x + vx / sp * w.radius, top + .05, z + vz / sp * w.radius, Math.cos(a) * sp * .3, 1 + sp * .16 * r.rnd(), Math.sin(a) * sp * .3, .03 + r.rnd() * .035); }
        }
      }
      w.x = x; w.y = y; w.z = z; w.wet = wet; w.where = where; w.first = false;
    }
  }
  /**
   * The look for a camera under the surface: the view's air turns to murky, tinted water (thicker and darker
   * the deeper it is), and the surface can be seen from below. view: an HDView. colour: the water's colour
   * down there (default: from its own); murk: how thick (.14: about 15 m of view); dark: how fast it darkens
   * with depth (.06 a metre). water.under is 1 while the camera is below the surface (for your sound:
   * gs.sound.mixer.muffle). Call water.update() after you set the view's own air for the frame.
   */
  underwater(view, { colour = null, murk = .14, dark = .06 } = {}) {
    const c = colour ? new Color(colour) : this.deep.clone().lerp(new Color('#0c3a3c'), .35);
    this.medium = { view, colour: c, murk, dark, col: new Color() };
    if (view && view.scene && !view.scene.fog) view.scene.fog = new FogExp2(view.scene.background?.isColor ? view.scene.background.getHex() : 0xc8d0d8, 0);   // (made now, so nothing is rebuilt at the first dive)
    if (this.mesh.material.side !== DoubleSide) { this.mesh.material.side = DoubleSide; this.mesh.material.needsUpdate = true; }
    // deep water all round the camera while it is under, in place of the sky; open overhead, where the sky shows through the surface
    if (!this.deepMesh) {
      this.deepMesh = new Mesh(new SphereGeometry(1, 24, 10, 0, TAU, .82, Math.PI - .82), new MeshBasicMaterial({ color: this.medium.col, side: BackSide, fog: false, depthWrite: false }));
      this.deepMesh.renderOrder = -8; this.deepMesh.frustumCulled = false; this.deepMesh.visible = false; this.deepMesh.name = 'water:deep'; this.deepMesh.userData.detail = false;
    }
    view?.scene?.add(this.deepMesh);
    return this;
  }
  // The view's air while the camera is under: each number is put back to what the game had (or has since set) on the way up.
  dive() {
    const M = this.medium, v = M.view, cam = v.cam || v.camera; if (!cam) return;
    const p = cam.position, d = this.height(p.x, p.z) - p.y, u = d > 0 ? 1 : 0, was = this.under; this.under = u;
    if (!u && !was) return;
    const air = v._air || null, fog = v.scene.fog, bg = v.scene.background?.isColor ? v.scene.background : null;
    const dim = Math.exp(-Math.max(0, d) * M.dark), col = M.col; col.copy(M.colour).multiplyScalar(.35 + .65 * dim);
    const far = this.deepMesh; far.visible = !!u; if (u) { far.position.copy(p); far.scale.setScalar(Math.min((cam.far || 120) * .8, 90)); far.material.color.copy(col); }
    // each knob: the game's own value (what it was, or what the game has set since we last wrote), and ours while under
    const num = (get, set, to) => ({ get, set, to }), hue = c => ({ c });
    const knobs = M.knobs ||= [
      num(() => air ? air.haze : fog.density, x => { if (air) air.haze = x; else fog.density = x; }, () => M.murk),
      num(() => air ? air.mist : 0, x => { if (air) air.mist = x; }, () => 0),
      hue(air ? air.colour : fog.color), ...(air?.sunColour ? [hue(air.sunColour)] : []), ...(bg ? [hue(bg)] : []),
    ];
    for (const k of knobs) {
      if (k.c) {
        const c = k.c, w = k.wrote; if (!k.base) k.base = c.clone(); else if (!w || c.r !== w[0] || c.g !== w[1] || c.b !== w[2]) k.base.copy(c);
        c.copy(u ? col : k.base); k.wrote = [c.r, c.g, c.b];
      } else {
        const cur = k.get(); if (k.base === undefined || cur !== k.wrote) k.base = cur;
        k.wrote = u ? k.to() : k.base; if (k.wrote !== cur) k.set(k.wrote);
      }
    }
    if (!u) M.knobs = null;
  }
  // paler, clearer water where it is thin over the bed, fading to nothing at the waterline
  shade() {
    const g = this.mesh.geometry, C = g.attributes.color, A = C.array, b = this.base, p = this.mesh.position, n = C.count, sh = this.shallow, dp = this.deep;
    const rr = sh.r / (dp.r || .01), rg = sh.g / (dp.g || .01), rb = sh.b / (dp.b || .01);
    for (let i = 0; i < n; i++) {
      const d = this.level - this.bed(b[i * 3] + p.x, b[i * 3 + 2] + p.z), t = clamp(d / this.clear, 0, 1), f = t * (2 - t), e = clamp((d + this.swell * .5) / .35, 0, 1);
      A[i * 4] = rr + (1 - rr) * f; A[i * 4 + 1] = rg + (1 - rg) * f; A[i * 4 + 2] = rb + (1 - rb) * f; A[i * 4 + 3] = e * (.45 + .55 * f);
    }
    C.needsUpdate = true;
  }
  // The patch's points and their normals from the wave sums. The points are a grid, so along a row each wave's
  // sine and cosine step on by a fixed turn: no sines to take but one a row, and the normals come out exact.
  heave() {
    const g = this.mesh.geometry, P = g.attributes.position, Nm = g.attributes.normal, arr = P.array, nor = Nm.array, n1 = this.segments + 1, cell = this.size / this.segments, p = this.mesh.position;
    const cnt = n1 * n1, Y = this.Y ||= new Float32Array(cnt), GX = this.GX ||= new Float32Array(cnt), GZ = this.GZ ||= new Float32Array(cnt); Y.fill(0); GX.fill(0); GZ.fill(0);
    const xa = this.Yx = p.x - this.size / 2, za = this.Yz = p.z - this.size / 2;   // (where the grid's first point is: the shore foam reads Y too)
    for (const w of this.list) {
      const d = w.k * w.dx * cell, sd = Math.sin(d), cd = Math.cos(d), hk = w.height * w.k, t0 = w.ph - w.k * w.c * this.t;
      for (let j = 0, i = 0; j < n1; j++) {
        const ph = w.k * (xa * w.dx + (za + j * cell) * w.dz) + t0; let sn = Math.sin(ph), cs = Math.cos(ph);
        for (let q = 0; q < n1; q++, i++) { Y[i] += w.height * sn; const sl = hk * cs; GX[i] += sl * w.dx; GZ[i] += sl * w.dz; const s2 = sn * cd + cs * sd; cs = cs * cd - sn * sd; sn = s2; }
      }
    }
    const r = this.rip, near = r && r.energy > 0 ? r : null, x0 = near ? near.x0 : 0, z0 = near ? near.z0 : 0, x1 = x0 + this.reach * 2, z1 = z0 + this.reach * 2;
    for (let i = 0, k = 0; i < cnt; i++, k += 3) {
      let y = this.level + Y[i];
      if (near) { const x = arr[k] + p.x, z = arr[k + 2] + p.z; if (x > x0 && x < x1 && z > z0 && z < z1) y += near.at(x, z); }
      arr[k + 1] = y; const gx = GX[i], gz = GZ[i], l = 1 / Math.sqrt(gx * gx + gz * gz + 1); nor[k] = -gx * l; nor[k + 1] = l; nor[k + 2] = -gz * l;
    }
    P.needsUpdate = true; Nm.needsUpdate = true;
  }
  /** Each frame: moves the waves on and keeps the patch under `centre` (the camera or the boat). */
  update(dt, centre = null) {
    this.t += dt;
    const cell = this.size / this.segments, p = this.mesh.position;
    if (centre) { p.x = Math.round(centre.x / cell) * cell; p.z = Math.round(centre.z / cell) * cell; this.cx = centre.x; this.cz = centre.z; }
    const r = this.rip;
    if (r) {
      r.place(this.cx ?? p.x, this.cz ?? p.z);
      if (this.watched.length) this.wakes(dt);
      this.busy = r.update(dt);
    }
    if (this.rain > 0 || this.rained) this.wetting(dt);
    if (r || this.spray) { this.spray?.update(dt, this); this.dapple?.update(dt, this); this.lay(); }
    this.heave();
    if (this.bed) { const key = p.x + ',' + p.z; if (key !== this.shadeAt) { this.shadeAt = key; this.shade(); } }
    if (this.medium) this.dive();
    this.splashes = this.pending; this.pending = [];   // (what landed in it since the last frame)
    return this;
  }
  /** Calm again (a new round): no ripples, foam or spray. */
  calm() { const r = this.rip; if (r) { r.H.fill(0); r.V.fill(0); r.F.fill(0); r.sources.length = 0; r.live = 2; r.calmPix = r.foamPix = false; } this.spray?.clear(); this.dapple?.clear(); for (const w of this.watched) w.first = true; this.splashes = []; this.pending = []; return this; }
  dispose() {
    this.rip?.dispose(); this.foamMesh?.material.dispose(); this.lace?.dispose();
    if (this.deepMesh) { this.deepMesh.removeFromParent(); this.deepMesh.geometry.dispose(); this.deepMesh.material.dispose(); }
    if (this.medium && this.under) { this.under = 0; const k = this.medium.knobs; if (k) for (const q of k) { if (q.c) q.c.copy(q.base); else q.set(q.base); } }   // (the view's air goes back to the game's)
    for (const q of [this.spray, this.dapple]) if (q) { q.mesh.geometry.dispose(); q.mesh.material.dispose(); q.mesh.dispose?.(); }
    this.mesh.geometry.dispose(); this.mesh.removeFromParent();
  }
}
