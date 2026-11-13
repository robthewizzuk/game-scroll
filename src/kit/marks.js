// gs.outdoors.Marks: ground that takes marks. Feet leave prints and wheels leave tracks in snow, mud and sand,
// and grass parts round whatever moves through it and stays trodden where it was walked on.
//
//   marks = new Marks(view, { land, weather, mud: (x, z) => 0..1, sand: (x, z) => 0..1 });   // in make()
//   marks.watch(person);                        // a gs.models.human: a print where each foot comes down
//   marks.watch(truck);                         // a gs.models.vehicle: a track behind each wheel
//   marks.watch(dog, { feet: 4, size: .09, shape: 'paw' });   // anything else that moves: prints paced out along its way
//   marks.step(x, z, { turn });   marks.press(x, z, r);   marks.roll('sled', x, z, { width: .5, tread: 'smooth' });
//   update(dt) { marks.update(dt, camera.position); for (const m of marks.made) sounds.step(); }
//
// What the ground is like comes from the game and the weather: snow where gs.sky.Weather has let it settle
// (not under a roof), mud where mud(x, z) says earth is bare and the rain has wet it, sand where sand(x, z)
// says so. Fresh snow fills prints in, rain washes them out of mud, wind blows them out of sand.
//
// How it is drawn: the prints are a height picture kept in small tiles round the camera, and each tile that
// has any is one thin sheet lying on the ground with two pictures on it (a colour with how pressed it is as
// its alpha, and a normal map for the dent's walls and rim). They are stock materials, so WebGL and WebGPU
// draw the same thing, and ground with no marks on it costs nothing. Every mark is also kept in a list, so
// a trail is still there when you come back to it, and a game can read it (marks.trail(): who went where).
// Kit use only: games reach it as gs.outdoors.Marks.
import { timed } from './prof.js';
import { BufferAttribute, BufferGeometry, Color, DataTexture, LinearFilter, Mesh, MeshStandardMaterial, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType, Vector3, Vector4 } from 'three';

const TEX = 128, APRON = 2, T = TEX - APRON * 2;   // a tile's pictures are TEX texels a side: T of its own, and APRON of its neighbours' round them (so the two meet without a seam)
const QUADS = 16;                                   // a tile's sheet: squares a side
const SNOW = 1, MUD = 2, SAND = 3, NAMES = [null, 'snow', 'mud', 'sand'];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mod = (a, n) => ((a % n) + n) % n;
const keyOf = (ti, tj) => (ti + 32768) * 65536 + (tj + 32768);

// What each kind of ground looks like where it has been pressed: floor (the bottom of a print) and top (the
// ground's own colour, for the rim pushed up round it), how much of each shows, how soft the print's wall is
// (metres), how high its rim stands (of its depth), how deep a print counts as fully pressed (metres).
const LOOKS = {
  snow: { floor: '#b3c0d8', top: '#eff4fa', aFloor: .95, aRim: .9, edge: .012, rim: .32, full: .03, rough: .82 },
  mud: { floor: '#241c14', top: '#4a3d2e', aFloor: .9, aRim: .55, edge: .014, rim: .45, full: .025, rough: .5 },
  sand: { floor: '#9c855a', top: '#cdb684', aFloor: .7, aRim: .5, edge: .028, rim: .3, full: .022, rough: .96 },
};
const bytes = c => { const k = new Color(c).convertLinearToSRGB(); return [Math.round(k.r * 255), Math.round(k.g * 255), Math.round(k.b * 255)]; };

/* ---------- the shapes of prints ---------- */
// Each answers how far a point is from the print's outline, in metres: under 0 inside. u: along the foot
// (toes at +), v: across it, L: its length, W: its width, side: 1 a left foot, -1 a right one, 0 neither.
const rbox = (x, y, hx, hy, r) => { const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r; return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r; };
const disc = (x, y, r) => Math.hypot(x, y) - r;
const SHAPES = {
  // a boot: the sole and, behind a narrow waist, the heel
  boot: (u, v, L, W) => Math.min(rbox(u - .16 * L, v, .34 * L, .5 * W, .46 * W), rbox(u + .37 * L, v, .13 * L, .43 * W, .36 * W)),
  // a bare foot: heel, the outer edge, the ball, a row of toes
  bare: (u, v, L, W, side) => Math.min(disc(u + .34 * L, v, .36 * W), rbox(u + .06 * L, v - side * .16 * W, .2 * L, .26 * W, .22 * W), rbox(u - .2 * L, v, .15 * L, .5 * W, .4 * W), rbox(u - .43 * L, v + side * .06 * W, .05 * L, .44 * W, .05 * L)),
  // a paw: one pad and four toes
  paw: (u, v, L, W) => Math.min(rbox(u + .14 * L, v, .22 * L, .34 * W, .2 * L), disc(u - .16 * L, v - .34 * W, .13 * L), disc(u - .16 * L, v + .34 * W, .13 * L), disc(u - .34 * L, v - .12 * W, .13 * L), disc(u - .34 * L, v + .12 * W, .13 * L)),
  // a cloven hoof: an oval split down the middle from the front
  hoof: (u, v, L, W) => Math.max((Math.hypot(u / (L * .5), v / (W * .5)) - 1) * Math.min(L, W) * .5, -Math.max(Math.abs(v) - .07 * W, -u - .15 * L)),
  // a horse's shoe: a ring open at the back
  shoe: (u, v, L, W) => { const o = (Math.hypot(u / (L * .5), v / (W * .5)) - 1) * Math.min(L, W) * .5; return Math.max(o, -Math.min(o + .2 * Math.min(L, W), Math.max(Math.abs(v) - .12 * W, u - .1 * L))); },
  // an oval dent (round when L = W): something that fell, a knee, a ball
  round: (u, v, L, W) => (Math.hypot(u / (L * .5), v / (W * .5)) - 1) * Math.min(L, W) * .5,
};
// A track's tread: how deep it presses at s metres along it and v across (0..1 of its depth), W wide.
const TREADS = {
  smooth: () => 1,
  // a tyre: blocks in a chevron, a rib down the middle
  tyre: (s, v, W) => { const p = Math.max(.075, W * .42), a = Math.abs(v) / W; return a < .09 ? 1 : mod(s / p + a * 1.6, 1) < .56 ? 1 : .5; },
  // a caterpillar track: bars across it
  cleat: (s) => mod(s / .15, 1) < .5 ? 1 : .45,
  // a narrow wheel (a cart, a bicycle): a groove
  rim: () => 1,
};

/* ---------- where the ground is ---------- */
// The land's surface exactly as it is drawn: each square of a gs.outdoors Land is two flat triangles, and a
// point between grid lines lies on one of them (land.height() blends the four corners instead, which can sit
// a few centimetres above or below the triangles: enough to bury a sheet that lies on them).
function surfaceOf(land) {
  const g = land.mesh.geometry, n = land.segments, w = n + 1, S = land.size, s = S / n, I = (land.rock?.index0 || g.index)?.array;   // (with land.rocks(), the squares as they were before a cave took some away)
  const cut = I && I[0] === 0 && I[1] === w && I[2] === 1 && I[3] === w && I[4] === w + 1 && I[5] === 1;   // (a three.js plane: each square cut from its far left corner to its near right one)
  return (x, z, out) => {
    const fc = (x + S / 2) / s, fr = (z + S / 2) / s, c = clamp(Math.floor(fc), 0, n - 1), r = clamp(Math.floor(fr), 0, n - 1), u = clamp(fc - c, 0, 1), v = clamp(fr - r, 0, 1);
    const a = r * w + c, b = a + w, d = a + 1, e = b + 1, P = land.z, N = g.attributes.normal?.array;
    let wa, wb, wd, we;
    if (!cut) { wa = (1 - u) * (1 - v); wd = u * (1 - v); wb = (1 - u) * v; we = u * v; }
    else if (u + v <= 1) { wa = 1 - u - v; wd = u; wb = v; we = 0; } else { wa = 0; we = u + v - 1; wb = 1 - u; wd = 1 - v; }
    out.y = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[d * 3 + 2] * wd + P[e * 3 + 2] * we;
    if (N) {   // (the land's own points: x across, y towards -z, z up)
      const nx = N[a * 3] * wa + N[b * 3] * wb + N[d * 3] * wd + N[e * 3] * we, ny = N[a * 3 + 2] * wa + N[b * 3 + 2] * wb + N[d * 3 + 2] * wd + N[e * 3 + 2] * we, nz = -(N[a * 3 + 1] * wa + N[b * 3 + 1] * wb + N[d * 3 + 1] * wd + N[e * 3 + 1] * we), l = Math.hypot(nx, ny, nz) || 1;
      out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
    } else { out.nx = 0; out.ny = 1; out.nz = 0; }
    return out;
  };
}
// the same from a function (x, z) => height
const surfaceFn = fn => (x, z, out) => { const e = .15, y = fn(x, z), dx = fn(x + e, z) - fn(x - e, z), dz = fn(x, z + e) - fn(x, z - e), l = Math.hypot(dx, 2 * e, dz); out.y = y; out.nx = -dx / l; out.ny = 2 * e / l; out.nz = -dz / l; return out; };

/* ---------- grass that parts ---------- */
// How the grass round the camera is pushed about: a small grid that follows its centre a whole cell at a time
// (a cell's answer never moves in memory: the grid wraps round). Each cell holds which way the blades growing
// there lean and how far (they spring back, with a wobble, when what pushed them has gone), and how trodden
// down they are (that mends slowly). gs.outdoors land.meadow() reads it as one small picture.
class Parting {
  constructor({ cells = 128, reach = 12, spring = 7, mend = 40 } = {}) {
    const N = this.N = Math.max(16, Math.min(256, Math.round(cells / 2) * 2)); this.reach = reach; this.cell = reach * 2 / N; this.span = N * this.cell; this.spring = spring; this.mend = mend;
    this.Lx = new Float32Array(N * N); this.Lz = new Float32Array(N * N); this.Vx = new Float32Array(N * N); this.Vz = new Float32Array(N * N); this.F = new Float32Array(N * N);
    this.on = new Uint8Array(N * N); this.held = new Uint8Array(N * N); this.list = new Int32Array(N * N); this.count = 0;
    this.pix = new Uint8Array(N * N * 4); this.blank(0, N * N);
    const t = this.texture = new DataTexture(this.pix, N, N, RGBAFormat, UnsignedByteType); t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = t.minFilter = LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
    this.where = new Vector4(0, 0, 1 / this.span, 0);   // for the grass's shader: the square's middle x, z, 1 / its width, how far from the middle it reaches (0: nowhere yet)
    this.ix = NaN; this.iz = NaN; this.dirty = false;
  }
  blank(c0, c1) { const p = this.pix; for (let c = c0; c < c1; c++) { p[c * 4] = 128; p[c * 4 + 1] = 128; p[c * 4 + 2] = 0; p[c * 4 + 3] = 255; } }
  /** True while any grass is pushed over or trodden down. */
  get busy() { return this.count > 0; }
  // the square follows a point a whole cell at a time; the cells that come into it start upright
  place(x, z) {
    const N = this.N, ix = Math.round(x / this.cell - N / 2), iz = Math.round(z / this.cell - N / 2);
    if (ix === this.ix && iz === this.iz) return;
    const di = ix - this.ix, dj = iz - this.iz, ox = this.ix, oz = this.iz; this.ix = ix; this.iz = iz;
    this.where.x = (ix + N / 2) * this.cell; this.where.y = (iz + N / 2) * this.cell; this.where.w = this.reach - this.cell;
    if (!this.count) return;
    if (!(Math.abs(di) < N && Math.abs(dj) < N)) { this.clear(); return; }
    const wipe = (i0, i1, j0, j1) => { for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) this.still(mod(j, N) * N + mod(i, N)); };
    if (di > 0) wipe(ox, ix, iz, iz + N); else if (di < 0) wipe(ix + N, ox + N, iz, iz + N);   // (the columns it left are the ones that come back in on the other side)
    if (dj > 0) wipe(ix, ix + N, oz, iz); else if (dj < 0) wipe(ix, ix + N, iz + N, oz + N);
  }
  still(c) { if (this.Lx[c] || this.Lz[c] || this.F[c] || this.Vx[c] || this.Vz[c]) { this.Lx[c] = this.Lz[c] = this.Vx[c] = this.Vz[c] = this.F[c] = 0; this.blank(c, c + 1); this.dirty = true; } }
  wake(c) { if (!this.on[c]) { this.on[c] = 1; this.list[this.count++] = c; } }
  // every cell within r of a point that is in the square: fn(cell, 0 at the middle .. 1 at r, the way out from the middle x, z)
  round(x, z, r, fn) {
    const N = this.N, cell = this.cell, fx = x / cell - .5, fz = z / cell - .5, k = Math.max(r, cell * .75) / cell;
    const i0 = Math.max(this.ix, Math.ceil(fx - k)), i1 = Math.min(this.ix + N - 1, Math.floor(fx + k)), j0 = Math.max(this.iz, Math.ceil(fz - k)), j1 = Math.min(this.iz + N - 1, Math.floor(fz + k));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = i - fx, dz = j - fz, d = Math.hypot(dx, dz) / k; if (d < 1) fn(mod(j, N) * N + mod(i, N), d, d > 1e-6 ? dx / (d * k) : 0, d > 1e-6 ? dz / (d * k) : 0); }
  }
  /** Pushes the grass within r metres of a point over, away from it (and along vx, vz, the way the thing there is going). */
  push(x, z, r, vx = 0, vz = 0, amount = 1) {
    if (this.ix !== this.ix) return;
    const v = Math.hypot(vx, vz), ax = v > .05 ? vx / v : 0, az = v > .05 ? vz / v : 0, go = Math.min(1, v / 1.5) * .55;
    this.round(x, z, r, (c, d, ox, oz) => {
      const s = amount * (1 - d * d * d), lx = ox * .8 + ax * go, lz = oz * .8 + az * go, l = Math.hypot(lx, lz) || 1, m = Math.min(1, s * Math.min(1, l * 1.25));
      this.held[c] = 2;
      if (m * m >= (this.Lx[c] * this.Lx[c] + this.Lz[c] * this.Lz[c]) * .8) { this.Lx[c] = lx / l * m; this.Lz[c] = lz / l * m; this.Vx[c] = this.Vz[c] = 0; this.wake(c); }
    });
  }
  /** Treads the grass within r metres of a point down (0..1): it stays down, and mends slowly. */
  flat(x, z, r, amount = 1) { if (this.ix !== this.ix) return; this.round(x, z, r, (c, d) => { const f = amount * (1 - d * d); if (f > this.F[c]) { this.F[c] = Math.min(1, f); this.wake(c); } }); }
  /** How the grass stands at a point: { x, z (which way it leans, 0..1 long), flat (0..1 trodden) }. */
  at(x, z, out = {}) {
    const N = this.N, i = Math.floor(x / this.cell), j = Math.floor(z / this.cell);
    if (!(i >= this.ix && i < this.ix + N && j >= this.iz && j < this.iz + N)) { out.x = out.z = out.flat = 0; return out; }
    const c = mod(j, N) * N + mod(i, N); out.x = this.Lx[c]; out.z = this.Lz[c]; out.flat = this.F[c]; return out;
  }
  /** Each frame: blades that are let go spring back up, trodden grass mends, and the picture follows. */
  update(dt) {
    const { Lx, Lz, Vx, Vz, F, on, held, list, pix } = this, h = Math.min(dt, 1 / 30), w = this.spring, k = w * w, damp = 2 * .42 * w, mend = dt / this.mend; let n = 0;
    for (let q = 0; q < this.count; q++) {
      const c = list[q]; let lx = Lx[c], lz = Lz[c], f = F[c];
      if (held[c]) held[c]--;   // (pushed this frame: it stays where it was put)
      else if (lx || lz) {
        let vx = Vx[c], vz = Vz[c]; vx += (-k * lx - damp * vx) * h; vz += (-k * lz - damp * vz) * h; lx += vx * h; lz += vz * h;
        if (lx * lx + lz * lz < 1e-4 && vx * vx + vz * vz < 4e-3) lx = lz = vx = vz = 0;
        Lx[c] = lx; Lz[c] = lz; Vx[c] = vx; Vz[c] = vz;
      }
      if (f > 0) { f -= mend; if (f < 0) f = 0; F[c] = f; }
      const p = c * 4; pix[p] = 128 + 127 * clamp(lx, -1, 1); pix[p + 1] = 128 + 127 * clamp(lz, -1, 1); pix[p + 2] = 255 * f;
      if (lx || lz || f || held[c]) list[n++] = c; else { on[c] = 0; pix[p] = pix[p + 1] = 128; pix[p + 2] = 0; }
    }
    if (this.count || this.dirty) { this.texture.needsUpdate = true; this.dirty = false; }
    this.count = n;
  }
  clear() { for (const a of [this.Lx, this.Lz, this.Vx, this.Vz, this.F, this.on, this.held]) a.fill(0); this.count = 0; this.blank(0, this.N * this.N); this.texture.needsUpdate = true; }
  dispose() { this.texture.dispose(); }
}

/* ---------- the marks ---------- */
const P3 = { x: 0, y: 0, z: 0 }, SURF = { y: 0, nx: 0, ny: 1, nz: 0 }, V3 = new Vector3();
const posOf = (t, out) => { if (t.isObject3D) return t.getWorldPosition(out); const p = t.position || t.pos || t; out.set(p.x || 0, p.y || 0, p.z || 0); return out; };

/**
 * Ground that takes marks. view: the 3D view its sheets are drawn in (a gs.hd HDView or a gs.toon View; null
 * for the numbers alone). land: the gs.outdoors Land it lies on (or ground: (x, z) => height for ground of
 * your own; neither: flat at y = 0). weather: a gs.sky.Weather made with the level: snow takes prints where it
 * has settled, mud where the rain has wet it. mud(x, z), sand(x, z) => 0..1: where the ground is bare earth,
 * or sand (your own ground's paint decides: the same function that paints it). grass: false if nothing grows
 * here, or (x, z) => 0..1 where it does (true: wherever the land's meadows grow). reach: metres from the centre that
 * prints are drawn (10); cell: metres a texel of the print picture (.025: a boot is eleven long; .04 on
 * slower phones); keep: how many marks are remembered (4000: the oldest go). colours: { snow: { floor, top },
 * mud: {...}, sand: {...} }: the bottom of a print and the rim round it, to match your ground. fill: how much
 * fresh snow fills a print in (of a full cover: .3); wash: seconds of rain that wash prints out of mud (90);
 * blow: metres of wind that blow them out of sand (400: two minutes of a stiff breeze); last: { snow, mud,
 * sand } seconds a mark lasts whatever the weather (0: until it is filled); mend: seconds trodden grass takes
 * to stand again (40); wind: a gs.outdoors Wind (the land's, if it has one). sheet: false draws nothing;
 * above: metres the sheets lie above the ground (.02); budget: how many texels of prints are made again a frame
 * as marks fill in or come into reach (20000: a fifth of a millisecond on a fast phone).
 * Make it in make(), before the first frame (and before the land's meadow is first drawn, for grass that
 * parts on WebGPU), and clear() it in reset().
 */
export class Marks {
  constructor(view, { land = null, ground = null, weather = null, sand = null, mud = null, grass = true, reach = 10, cell = .025, keep = 4000, colours = {}, fill = .3, wash = 90, blow = 400, last = {}, mend = 40, above = .02, sheet = true, wind = null, parting = {}, budget = 20000 } = {}) {
    Object.assign(this, { view, land, weather, sand, mud, reach, cell, keep, fill, wash, blow, above, wind });
    this.size = T * cell;                                 // metres a tile
    this.surface = land ? surfaceOf(land) : ground ? surfaceFn(ground) : (x, z, out) => { out.y = 0; out.nx = 0; out.ny = 1; out.nz = 0; return out; };
    this.grows = grass === true ? (x, z) => { let g = 0; for (const m of land?.meadows || []) { const w = m.userData.meadow?.where; g = Math.max(g, w ? w(x, z) : 1); } return g; } : grass || null;   // (true: wherever the land's meadows grow)
    this.last = { snow: 0, mud: 0, sand: 0, ...last };
    this.looks = [null, ...['snow', 'mud', 'sand'].map(k => { const L = { ...LOOKS[k], ...(colours[k] || {}) }; return { ...L, floorB: bytes(L.floor), topB: bytes(L.top) }; })];
    this.draws = !!(sheet && view?.scene);
    this.log = []; this.head = 0; this.serial = 0;        // every mark, the oldest overwritten first
    this.byTile = new Map();                              // tile key -> the marks that touch it (whether or not the tile is being drawn)
    this.tiles = new Map(); this.pool = []; this.todo = []; this.stale = [];
    this.tracks = new Map(); this.watching = []; this.made = [];
    this.t = 0; this.clock = { snow: 0, rain: 0, wind: 0 }; this.age = 0; this.ci = NaN; this.cj = NaN; this.cx = 0; this.cz = 0; this.frame = 0;
    this.grass = grass === false ? null : new Parting({ mend, ...parting });
    if (this.grass && land) { land.parting = this.grass; for (const m of land.meadows || []) m.userData.meadow?.look?.part?.(this.grass); }
    this.share = null; this.job = null; this.budget = budget; this.lay0 = weather ? weather.snow : 0;
  }
  get wetness() { return this.weather ? this.weather.wet ?? 0 : 0; }
  // the sheets' shared parts: every tile's squares are joined the same way and read its pictures the same way
  shared() {
    if (this.share) return this.share;
    const n = QUADS + 1, uv = new Float32Array(n * n * 2), idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { uv[(j * n + i) * 2] = (APRON + i / QUADS * T) / TEX; uv[(j * n + i) * 2 + 1] = (APRON + j / QUADS * T) / TEX; }
    for (let j = 0; j < QUADS; j++) for (let i = 0; i < QUADS; i++) { const a = j * n + i, b = a + n; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    return this.share = { uv: new BufferAttribute(uv, 2), index: new BufferAttribute(new Uint16Array(idx), 1) };
  }

  /* ----- what the ground is like ----- */
  /**
   * What the ground at x, z is like now: { kind: 'snow' | 'mud' | 'sand' | 'grass' | null, soft: 0..1, depth:
   * metres a foot sinks in, y: its height }. null: firm ground that takes no mark.
   */
  kindAt(x, z, out = {}) {
    const W = this.weather, y = this.surface(x, z, SURF).y; out.kind = null; out.soft = 0; out.depth = 0; out.y = y;
    if (this.land?.rock && this.land.rocky(x, z)) return out;   // (rock: firm, and the sheets lie on the land's own squares, which the rock covers or a cave has taken away)
    P3.x = x; P3.y = y + .05; P3.z = z;
    if (W && W.snow >= .4) { const lies = W.snowAt(P3); if (lies > .012) { out.kind = 'snow'; out.soft = Math.min(1, lies / .06); out.depth = Math.min(.05, lies * .7); return out; } }
    const wet = W ? W.wetAt(P3) : 0;
    const m = this.mud ? this.mud(x, z) * Math.min(1, W ? .1 + wet * 1.2 : 1) : 0, s = this.sand ? this.sand(x, z) * (1 - .45 * wet) : 0;
    if (m > .08 && m >= s) { out.kind = 'mud'; out.soft = Math.min(1, m); out.depth = .038 * out.soft; }
    else if (s > .08) { out.kind = 'sand'; out.soft = Math.min(1, s); out.depth = .028 * out.soft; }
    else if (this.grows) { const g = this.grows(x, z); if (g > .05) { out.kind = 'grass'; out.soft = Math.min(1, g); } }
    return out;
  }

  /* ----- making marks ----- */
  // a new mark goes in the list (the oldest goes out) and into every tile it touches
  add(s) {
    s.n = ++this.serial; s.t = this.t; s.dead = false; s.c0 = s.kind === SNOW ? this.clock.snow : s.kind === MUD ? this.clock.rain : this.clock.wind; s.r0 = this.clock.rain;
    if (this.log.length < this.keep) this.log.push(s);
    else {   // (the oldest is forgotten: its dent stays in the ground until that tile is next made again)
      const old = this.log[this.head]; old.dead = true; this.log[this.head] = s; this.head = (this.head + 1) % this.keep;
      this.eachTile(old, k => { const l = this.byTile.get(k), i = l ? l.indexOf(old) : -1; if (i < 0) return; l.splice(i, 1); if (this.job && this.job.k === k && i < this.job.q) this.job.q--; if (!l.length) this.byTile.delete(k); });
    }
    this.put(s);
    return s;
  }
  // the tiles a mark touches (with the strip of each that its neighbours also keep)
  eachTile(s, fn) {
    const S = this.size, pad = s.r + APRON * this.cell, i0 = Math.floor((Math.min(s.x, s.x1 ?? s.x) - pad) / S), i1 = Math.floor((Math.max(s.x, s.x1 ?? s.x) + pad) / S), j0 = Math.floor((Math.min(s.z, s.z1 ?? s.z) - pad) / S), j1 = Math.floor((Math.max(s.z, s.z1 ?? s.z) + pad) / S);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(keyOf(i, j), i, j);
  }
  put(s, from = 0) {   // (from: a track made longer: only what is new of it, metres along, is pressed in now)
    this.eachTile(s, (k, i, j) => {
      let list = this.byTile.get(k); if (!list) this.byTile.set(k, list = []);
      if (!list.includes(s)) list.push(s);
      if (!this.draws || !this.near(i, j)) return;
      const tile = this.tiles.get(k) || this.open(k, i, j, false);
      if (tile.built) this.draw(tile, s, 1, tile.H, tile.K, from); else if (!tile.queued) { tile.queued = true; this.todo.push(tile); }
    });
  }
  /**
   * One print at x, z. turn: which way the foot points (radians round y, 0 towards +z; or dir: [x, z]); size:
   * its length in metres (.29, a boot); width (size x .38); shape: 'boot' | 'bare' | 'paw' | 'hoof' | 'shoe' |
   * 'round'; side: 1 a left foot, -1 a right one; press: how hard (1 a person's weight: a deeper print up to
   * 1.5); by: who made it (yours, to ask marks.trail() about). Returns the mark, or null on firm ground.
   */
  step(x, z, { turn = 0, dir = null, size = .29, width = size * .38, shape = 'boot', side = 0, press = 1, by = null, who = by } = {}) {
    const g = this.kindAt(x, z, this._k ||= {}), fx = dir ? dir[0] : Math.sin(turn), fz = dir ? dir[1] : Math.cos(turn), fl = Math.hypot(fx, fz) || 1;
    if (!g.kind) return null;
    if (this.grass && this.grows(x, z) > .05) this.grass.flat(x, z, Math.max(.3, size), Math.min(1, .85 * press));
    if (g.kind === 'grass') { this.made.push({ x, z, kind: 'grass', depth: 0, by }); return null; }
    const kind = NAMES.indexOf(g.kind), L = this.looks[kind], d = g.depth * clamp(press, .2, 1.5);
    const s = this.add({ shape: SHAPES[shape] ? shape : 'round', x, z, fx: fx / fl, fz: fz / fl, l: size, w: width, d, kind, side, by, r: Math.hypot(size, width) * .5 + this.rimOf(L, width) });
    this.made.push({ x, z, kind: g.kind, depth: d, by });
    who?.grime?.soil?.(g.kind, d);   // (a gs.models.human: mud splashes up the boots and trousers, sand dusts them: person.grime)
    return s;
  }
  /** A round dent, r metres from its middle to its edge: something fell here, or knelt, or landed. */
  press(x, z, r = .3, { press = 1, by = null } = {}) { return this.step(x, z, { size: r * 2, width: r * 2, shape: 'round', press, by }); }
  rimOf(L, w) { return Math.max(2 * this.cell, .3 * w); }
  /**
   * A track that joins up: call it each frame with where the wheel (or runner, or dragged thing) is now, under
   * a name of its own (id), and a track is laid from where it last was. width: metres (.22); tread: 'tyre' |
   * 'cleat' (a caterpillar track) | 'rim' (a narrow wheel) | 'smooth' (a sled, something dragged); press, by:
   * as step(). marks.lift(id) when it leaves the ground, so the track does not join up across the gap.
   */
  roll(id, x, z, { width = .22, tread = 'tyre', press = 1.2, by = null } = {}) {
    let st = this.tracks.get(id); if (!st) this.tracks.set(id, st = { x, z, s: 0, on: false, cur: null, told: 0 });
    const dx = x - st.x, dz = z - st.z, d = Math.hypot(dx, dz);
    if (!st.on || d > 2.5) { st.x = x; st.z = z; st.on = true; st.cur = null; return null; }
    if (d < Math.max(this.cell * 1.5, .03)) return null;
    const g = this.kindAt((x + st.x) / 2, (z + st.z) / 2, this._k ||= {}), x0 = st.x, z0 = st.z, s0 = st.s; st.x = x; st.z = z; st.s += d;
    if (this.grass && this.grows(x, z) > .05) this.grass.flat(x, z, Math.max(.3, width * 1.1), Math.min(1, .8 * press));
    if (!g.kind || g.kind === 'grass') { st.cur = null; if (g.kind && st.s - st.told > .6) { st.told = st.s; this.made.push({ x, z, kind: 'grass', depth: 0, by, rolling: true }); } return null; }
    const kind = NAMES.indexOf(g.kind), L = this.looks[kind], depth = g.depth * clamp(press, .2, 1.5) * (tread === 'rim' ? 1.2 : .8), fx = dx / d, fz = dz / d;
    if (st.s - st.told > .6) { st.told = st.s; this.made.push({ x, z, kind: g.kind, depth, by, rolling: true }); }
    // a track is one straight mark made longer while it stays within a centimetre of the way the wheel really
    // went (a bend of length l that turns by a lies l x a / 8 off its chord); a sharper bend, or other ground, starts the next
    const c = st.cur;
    if (c && !c.dead && c.kind === kind && Math.abs(c.d - depth) < .004) {
      const cx = x - c.x, cz = z - c.z, l = Math.hypot(cx, cz), cos = c.fx0 * fx + c.fz0 * fz;
      if (l < 1.5 && cos > .96 && l * Math.sqrt(Math.max(0, 2 - 2 * cos)) < .08) { const was = c.len; c.x1 = x; c.z1 = z; c.len = l; c.fx = cx / l; c.fz = cz / l; this.put(c, was); return c; }
    }
    return st.cur = this.add({ shape: 'track', tread: TREADS[tread] ? tread : 'tyre', x: x0, z: z0, x1: x, z1: z, fx, fz, fx0: fx, fz0: fz, len: d, s0, l: 0, w: width, d: depth, kind, side: 0, by, r: width * .5 + this.rimOf(L, width) });
  }
  /** The thing laying track `id` has left the ground: its track stops here. */
  lift(id) { const st = this.tracks.get(id); if (st) { st.on = false; st.cur = null; } }
  /** Parts the grass within r metres of a point this frame, away from it (vx, vz: the way the thing is moving). */
  push(x, z, r = .4, { vx = 0, vz = 0, amount = 1 } = {}) { this.grass?.push(x, z, r, vx, vz, amount); }

  /* ----- things that leave marks by themselves ----- */
  /**
   * From now on this thing leaves marks by itself. A gs.models.human leaves a boot print wherever a foot
   * really comes down (call marks.update() after its rig's); a gs.models.vehicle a track behind each wheel
   * (a tank: its two caterpillar tracks); anything else that moves (an Object3D, or { x, y, z }) has prints
   * paced out along its way. o: feet (2, or 4: an animal), size (a print's length, metres), width (of the
   * print), shape, gap (metres between its left and right prints), pace (metres from one print to the next),
   * long (a four-footed animal's length), press, tread, radius (how far round it the grass parts; 0: not at
   * all), trample (0..1 how flat it leaves the grass it wades through: .6), by (what marks.trail() and marks.made call it: the thing itself), grounded: () => is it on the
   * ground now (default: within .3 m of it). Returns the thing.
   */
  watch(thing, o = {}) {
    if (this.watching.some(w => w.thing === thing)) this.unwatch(thing);
    const id = 'w' + (++this.serial), wheels = thing.wheels?.length ? thing.wheels : null, belts = thing.belts || null, stride = thing.rig?.stride?.ok ? thing.rig.stride : null;
    this.watching.push({ thing, o, id, by: o.by ?? thing, wheels: !belts && wheels, belts, stride, was: null, vx: 0, vz: 0, hx: 0, hz: 1, dist: 0, n: 0, lastT: [null, null] });
    return thing;
  }
  unwatch(thing) { const i = this.watching.findIndex(w => w.thing === thing); if (i >= 0) { const w = this.watching[i]; for (const k of [...this.tracks.keys()]) if (typeof k === 'string' && k.startsWith(w.id + ':')) this.tracks.delete(k); this.watching.splice(i, 1); } }
  follow(w, dt) {
    const { thing, o } = w, p = posOf(thing, V3), x = p.x, y = p.y, z = p.z;
    const jumped = !w.was || Math.hypot(x - w.was.x, z - w.was.z) > Math.max(1.5, 40 * dt);
    if (jumped) { w.was = { x, z }; w.vx = w.vz = 0; w.dist = 0; w.aimed = false; if (w.wheels || w.belts) for (const k of this.tracks.keys()) if (typeof k === 'string' && k.startsWith(w.id + ':')) this.lift(k); return; }
    const dx = x - w.was.x, dz = z - w.was.z, d = Math.hypot(dx, dz); w.was.x = x; w.was.z = z;
    if (dt > 0) { const k = 1 - Math.exp(-dt * 12); w.vx += (dx / dt - w.vx) * k; w.vz += (dz / dt - w.vz) * k; }
    if (d > 1e-4) { const k = w.aimed ? Math.min(1, d * 6) : 1; w.aimed = true; w.hx += (dx / d - w.hx) * k; w.hz += (dz / d - w.hz) * k; const l = Math.hypot(w.hx, w.hz) || 1; w.hx /= l; w.hz /= l; }
    const sc = thing.isObject3D ? Math.hypot(thing.matrixWorld.elements[4], thing.matrixWorld.elements[5], thing.matrixWorld.elements[6]) || 1 : 1;
    const high = thing.isObject3D || (thing.position || thing.pos || thing).y !== undefined;   // (does it say how high it is?)
    const up = high ? y - this.surface(x, z, SURF).y : 0, down = o.grounded ? !!o.grounded() : up < (o.height ?? 0) + .3 && up > -.6;   // (well under the surface: in a cave or under an overhang of land.rocks(), where the ground above is not the ground it stands on)
    // the grass round it
    const rad = o.radius ?? (w.wheels || w.belts ? Math.max(.8, (thing.size?.width ?? 1.8) * .55) : .38 * sc);
    if (this.grass && rad > 0 && down) {
      if (w.wheels || w.belts) { const len = (thing.size?.length ?? 4) * .5 - rad * .5, e = thing.matrixWorld.elements, fl = Math.hypot(e[8], e[10]) || 1, ax = e[8] / fl, az = e[10] / fl; for (const f of [-1, 0, 1]) this.grass.push(x + ax * len * f, z + az * len * f, rad, w.vx, w.vz, 1); }
      else { this.grass.push(x, z, rad, w.vx, w.vz, .95); if (d > 1e-4 && this.grows(x, z) > .05) this.grass.flat(x, z, rad * .75, o.trample ?? .6); }   // (legs sweep a lane through it; each footfall treads it flatter)
    }
    if (w.belts) {   // a tank: a wide track under each side
      const b = w.belts, e = thing.matrixWorld.elements;
      for (const sd of [-1, 1]) { const k = w.id + ':' + sd; if (!down) { this.lift(k); continue; } this.roll(k, x + e[0] * b.x * sd, z + e[2] * b.x * sd, { width: b.width, tread: 'cleat', press: o.press ?? 1.5, by: w.by }); }
      return;
    }
    if (w.wheels) {
      for (let i = 0; i < w.wheels.length; i++) {
        const wh = w.wheels[i], q = wh.getWorldPosition(w.q ||= new Vector3()), k = w.id + ':' + i, r = (wh.radius || .35) * sc;
        if (o.grounded ? !down : !down || q.y - r - this.surface(q.x, q.z, SURF).y > .12) { this.lift(k); continue; }
        this.roll(k, q.x, q.z, { width: (o.width ?? wh.width ?? .22) * sc, tread: o.tread ?? 'tyre', press: o.press ?? 1.3, by: w.by });
      }
      return;
    }
    const st = w.stride, rig = thing.rig;
    if (st && st.on && st.a > .5 && rig.steps !== false && rig.near !== false) {   // a person whose steps are really taken: a print where each foot comes down
      const k = (rig.height || 1.8) / 1.8 * sc, size = o.size ?? .29 * k;
      for (let i = 0; i < 2; i++) {
        const f = st.feet[i]; if (!f.landed) continue;
        const a = st.yaw + (f.yaw0 - st.turned), fx = Math.sin(a), fz = Math.cos(a), px = f.T.x + fx * .035 * k, pz = f.T.z + fz * .035 * k, was = w.lastT[i];   // (a: the way the foot points, which is the way the body faced as it was put down)
        if (was && Math.hypot(px - was.x, pz - was.z) < .04) continue;   // (the rig was not moved on since: the same footfall)
        w.lastT[i] = { x: px, z: pz };
        if (down) this.step(px, pz, { dir: [fx, fz], size, width: o.width ?? size * .38, shape: o.shape ?? 'boot', side: i ? -1 : 1, press: o.press ?? 1, by: w.by, who: w.thing });
      }
      w.dist = 0; return;
    }
    // anything else: prints paced out along the way it goes
    if (!down) { w.dist = 0; return; }
    const feet = o.feet ?? 2, size = (o.size ?? .29) * (o.size ? 1 : sc), pace = o.pace ?? size * (feet === 4 ? 3.2 : 2.45), gap = o.gap ?? size * (feet === 4 ? 1.1 : .62), long = o.long ?? size * 5;
    w.dist += d;
    while (w.dist >= pace) {
      w.dist -= pace; const bx = x - w.hx * w.dist, bz = z - w.hz * w.dist, sd = w.n++ % 2 ? -1 : 1, lx = w.hz * gap * .5 * sd, lz = -w.hx * gap * .5 * sd;
      const opt = { dir: [w.hx, w.hz], size, width: o.width ?? (o.shape === 'paw' || o.shape === 'hoof' || o.shape === 'shoe' || o.shape === 'round' ? size * .9 : size * .38), shape: o.shape ?? 'boot', side: sd, press: o.press ?? 1, by: w.by, who: w.thing };
      if (feet === 4) { this.step(bx + lx + w.hx * long * .5, bz + lz + w.hz * long * .5, opt); this.step(bx - lx - w.hx * long * .5 + w.hx * size * .4, bz - lz - w.hz * long * .5 + w.hz * size * .4, { ...opt, side: -sd }); }
      else this.step(bx + lx, bz + lz, opt);
    }
  }

  /* ----- the tiles ----- */
  near(i, j) { const S = this.size, dx = Math.max(0, Math.abs((i + .5) * S - this.cx) - S / 2), dz = Math.max(0, Math.abs((j + .5) * S - this.cz) - S / 2); return this.ci === this.ci && dx * dx + dz * dz < this.reach * this.reach; }
  open(k, ti, tj, queue = true) {
    const tile = this.pool.pop() || this.blank();
    tile.k = k; tile.ti = ti; tile.tj = tj; tile.x0 = ti * this.size - APRON * this.cell; tile.z0 = tj * this.size - APRON * this.cell; tile.built = false; tile.queued = false; tile.age = this.age; tile.main = 0; tile.stale = false;
    tile.H.fill(0); tile.K.fill(0); tile.dirty = [[0, TEX - 1, 0, TEX - 1]];
    this.lay(tile); this.tiles.set(k, tile);
    if (!this.byTile.get(k)?.length) tile.built = true;   // (nothing here yet: it starts blank)
    else if (queue) { tile.queued = true; this.todo.push(tile); }
    return tile;
  }
  blank() {
    const tex = (srgb) => { const pix = new Uint8Array(TEX * TEX * 4), t = new DataTexture(pix, TEX, TEX, RGBAFormat, UnsignedByteType); t.magFilter = t.minFilter = LinearFilter; t.generateMipmaps = false; if (srgb) t.colorSpace = SRGBColorSpace; return t; };
    const map = tex(true), normal = tex(false), sh = this.shared(), n = QUADS + 1, g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * n * 3), 3)); g.setAttribute('normal', new BufferAttribute(new Float32Array(n * n * 3), 3)); g.setAttribute('uv', sh.uv); g.setIndex(sh.index);
    const mat = new MeshStandardMaterial({ color: '#ffffff', map, normalMap: normal, roughness: .8, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.userData.noSettle = true;   // (no puddles or snow are painted over it: it is the snow's own dents)
    const mesh = new Mesh(g, mat); mesh.name = 'marks'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.renderOrder = -1; mesh.userData.noAO = true; mesh.userData.detail = false; mesh.userData.noSettle = true;
    return { H: new Float32Array(TEX * TEX), K: new Uint8Array(TEX * TEX), map, normal, mesh, mat };
  }
  // the tile's sheet is laid on the ground: each of its points takes the ground's height and the way it faces
  lay(tile) {
    const g = tile.mesh.geometry, P = g.attributes.position.array, Nn = g.attributes.normal.array, n = QUADS + 1, S = this.size, x0 = tile.ti * S, z0 = tile.tj * S;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const q = (j * n + i) * 3, x = x0 + i / QUADS * S, z = z0 + j / QUADS * S, s = this.surface(x, z, SURF);
      P[q] = x; P[q + 1] = s.y + this.above; P[q + 2] = z; Nn[q] = s.nx; Nn[q + 1] = s.ny; Nn[q + 2] = s.nz;
    }
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
  }
  shut(tile) {
    this.tiles.delete(tile.k); tile.mesh.removeFromParent(); tile.queued = false; if (this.job?.tile === tile) this.job = null;
    if (this.pool.length < 24) this.pool.push(tile); else this.scrap(tile);
  }
  scrap(tile) { tile.mesh.removeFromParent(); tile.mesh.geometry.dispose(); tile.mat.dispose(); tile.map.dispose(); tile.normal.dispose(); }
  spoil(k) { const tile = this.tiles.get(k); if (tile && !tile.stale && tile.built) { tile.stale = true; this.stale.push(tile); } }
  // how much is left of a mark now: fresh snow fills it, rain washes it out of mud, wind blows it out of sand, and settled snow hides what lay under it
  left(s) {
    const W = this.weather, name = NAMES[s.kind]; let k = 1;
    if (s.kind === SNOW) { k = 1 - (this.clock.snow - s.c0) / this.fill; if (W) k *= sm(.25, .45, W.snow); }
    else {
      k = s.kind === MUD ? 1 - (this.clock.rain - s.c0) / this.wash : 1 - (this.clock.wind - s.c0) / this.blow - (this.clock.rain - s.r0) / (this.wash * 2);
      if (W && W.snow > .1) { P3.x = s.x; P3.z = s.z; P3.y = this.surface(s.x, s.z, SURF).y + .05; if (W.snowAt(P3) > 0) k *= 1 - sm(.15, .4, W.snow); }
    }
    const life = this.last[name]; if (life > 0) k *= 1 - sm(.7, 1, (this.t - s.t) / life);
    return k;
  }
  // one mark pressed into one tile's heights
  // (H, K: into these heights instead, for a tile being made again; from: only what lies this far along a track
  // and further. Returns how many cells it looked at.)
  draw(tile, s, life, H = tile.H, K = tile.K, from = 0) {
    const cell = this.cell, L = this.looks[s.kind], x0 = tile.x0, z0 = tile.z0, track = s.shape === 'track';
    const ax = from > 0 ? s.x + s.fx * from : s.x, az = from > 0 ? s.z + s.fz * from : s.z, bx = s.x1 ?? s.x, bz = s.z1 ?? s.z;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - s.r - x0) / cell)), i1 = Math.min(TEX - 1, Math.ceil((Math.max(ax, bx) + s.r - x0) / cell)), j0 = Math.max(0, Math.floor((Math.min(az, bz) - s.r - z0) / cell)), j1 = Math.min(TEX - 1, Math.ceil((Math.max(az, bz) + s.r - z0) / cell));
    if (i1 < i0 || j1 < j0) return 0;
    const edge = Math.max(cell * 1.1, L.edge), rw = this.rimOf(L, s.w), d = s.d * life, rh = d * L.rim, fn = track ? null : SHAPES[s.shape], tread = track ? TREADS[s.tread] : null, fx = s.fx, fz = s.fz, hw = s.w * .5;
    let hit = false;
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + (j + .5) * cell - s.z; let c = j * TEX + i0;
      for (let i = i0; i <= i1; i++, c++) {
        const dx = x0 + (i + .5) * cell - s.x, u = dx * fx + dz * fz, v = dx * fz - dz * fx; let sd, m = 1;
        if (track) { const du = u < 0 ? -u : u > s.len ? u - s.len : 0, dv = Math.abs(v) - hw; sd = du > 0 || dv > 0 ? Math.hypot(du, Math.max(dv, 0)) : dv; if (sd < 0) m = tread(s.s0 + u, v, s.w); }
        else sd = fn(u, v, s.l, s.w, s.side);
        let h;
        if (sd < 0) { const t = Math.min(1, -sd / edge); h = -d * t * t * (3 - 2 * t) * m; }
        else if (sd < rw) { const t = sd / rw; h = rh * 6.75 * t * (1 - t) * (1 - t); }
        else continue;
        const was = H[c];
        if (h < 0 ? h < was : was >= 0 && h > was) { H[c] = h; K[c] = s.kind; hit = true; }   // (a dent cuts through a rim; the deeper dent and the higher rim win, so marks can be drawn in any order)
      }
    }
    if (hit) { if (H !== tile.H) this.job.main = s.kind; else { this.smudge(tile, i0, i1, j0, j1); tile.main = s.kind; } }
    return (i1 - i0 + 1) * (j1 - j0 + 1);
  }
  // Tiles' heights are made again from their lists (when one comes into reach, and as its marks fill in): one
  // tile at a time, into spare heights that take its place when they are done, and only so many cells a frame, so
  // a tile a tank has churned for minutes never costs a long frame. cells: how many to look at now.
  remake(cells) {
    for (;;) {
      let job = this.job;
      if (!job) {
        let tile = null;
        while (!tile && this.todo.length) { const t = this.todo.pop(); if (this.tiles.get(t.k) === t && !t.built) tile = t; }   // (the nearest tile that came into reach first)
        if (!tile) {
          if (!this.stale.length && this.frame % 20 === 0) for (const t of this.tiles.values()) if (t.built && Math.abs(this.age - t.age) > .035 && this.byTile.get(t.k)?.length) this.spoil(t.k);
          while (!tile && this.stale.length) { const t = this.stale.pop(); if (this.tiles.get(t.k) === t) tile = t; }
        }
        if (!tile) return;
        job = this.job = { tile, k: tile.k, q: 0, main: 0 }; (this.H2 ||= new Float32Array(TEX * TEX)).fill(0); (this.K2 ||= new Uint8Array(TEX * TEX)).fill(0);
      }
      const tile = job.tile, list = this.byTile.get(job.k) || [];
      while (job.q < list.length && cells > 0) { const s = list[job.q++]; if (s.dead) continue; const k = this.left(s); if (k <= .03) { s.dead = true; continue; } cells -= this.draw(tile, s, Math.min(1, k), this.H2, this.K2) + 40; }
      if (job.q < list.length) return;
      let n = 0; for (const s of list) if (!s.dead) list[n++] = s;
      list.length = n; if (!n) this.byTile.delete(job.k);
      tile.H.set(this.H2); tile.K.set(this.K2); tile.main = job.main;
      tile.dirty = [[0, TEX - 1, 0, TEX - 1]]; tile.built = true; tile.queued = false; tile.stale = false; tile.age = this.age; this.job = null;
      if (cells <= 0) return;
    }
  }
  // a patch of a tile's heights changed: its pictures are painted again there (a few patches are kept apart, so
  // four wheels in one tile do not repaint the ground between them; more than that become one)
  smudge(tile, i0, i1, j0, j1) {
    const D = tile.dirty;
    for (const b of D) if (i0 >= b[0] && i1 <= b[1] && j0 >= b[2] && j1 <= b[3]) return;
    if (D.length < 8) { D.push([i0, i1, j0, j1]); return; }
    const u = D[0]; for (const b of D) { if (b[0] < u[0]) u[0] = b[0]; if (b[1] > u[1]) u[1] = b[1]; if (b[2] < u[2]) u[2] = b[2]; if (b[3] > u[3]) u[3] = b[3]; }
    if (i0 < u[0]) u[0] = i0; if (i1 > u[1]) u[1] = i1; if (j0 < u[2]) u[2] = j0; if (j1 > u[3]) u[3] = j1; D.length = 1;
  }
  // the heights that changed become the two pictures: the colour of pressed ground with how pressed as its alpha, and which way the dent's walls face
  paint(tile) {
    const D = tile.dirty; if (!D.length) return false;
    const H = tile.H, K = tile.K, C = tile.map.image.data, Nn = tile.normal.image.data, g = 1 / (2 * this.cell), LK = this.looks, base = LK[tile.main || SNOW].topB;
    for (const b of D) {
      const i0 = Math.max(0, b[0] - 1), i1 = Math.min(TEX - 1, b[1] + 1), j0 = Math.max(0, b[2] - 1), j1 = Math.min(TEX - 1, b[3] + 1);
      for (let j = j0; j <= j1; j++) {
        const up = j > 0 ? -TEX : 0, dn = j < TEX - 1 ? TEX : 0;
        for (let i = i0; i <= i1; i++) {
          const c = j * TEX + i, p = c * 4, h = H[c], dx = (H[i < TEX - 1 ? c + 1 : c] - H[i > 0 ? c - 1 : c]) * g, dz = (H[c + dn] - H[c + up]) * g;
          if (dx || dz) { const l = 127 / Math.sqrt(dx * dx + dz * dz + 1); Nn[p] = 128 - dx * l; Nn[p + 1] = 128 - dz * l; Nn[p + 2] = 128 + l; } else { Nn[p] = 128; Nn[p + 1] = 128; Nn[p + 2] = 255; }
          Nn[p + 3] = 255;
          if (h < 0) { const L = LK[K[c]], f = Math.min(1, -h / L.full), A = L.floorB, B = L.topB; C[p] = B[0] + (A[0] - B[0]) * f; C[p + 1] = B[1] + (A[1] - B[1]) * f; C[p + 2] = B[2] + (A[2] - B[2]) * f; C[p + 3] = 255 * Math.pow(f, .7) * L.aFloor; }
          else if (h > 0) { const L = LK[K[c]], B = L.topB; C[p] = B[0]; C[p + 1] = B[1]; C[p + 2] = B[2]; C[p + 3] = 255 * Math.min(1, h / (L.full * .3)) * L.aRim; }
          else { C[p] = base[0]; C[p + 1] = base[1]; C[p + 2] = base[2]; C[p + 3] = 0; }
        }
      }
    }
    D.length = 0; tile.map.needsUpdate = tile.normal.needsUpdate = true;
    return true;
  }

  /**
   * Each frame, after the things that leave marks have moved. centre: where prints should be drawn round (the
   * camera's position by default; the spot a scope looks at, for a view through one).
   */
  update(dt, centre = this.view?.cam?.position) {
    this.t += dt; this.frame++; this.made.length = 0;
    const W = this.weather, wind = this.wind ?? this.land?.wind;
    // the clocks marks age by: fresh snow fallen (of a full cover), seconds of rain, metres of wind over a light breeze
    if (W && dt > 0) { if (W.snowing > 0) this.clock.snow += dt / (W.settle || 40) * W.snowing; if (W.rain > 0) this.clock.rain += dt * W.rain; }
    if (wind && dt > 0) { const sp = (wind.speed ?? Math.hypot(wind.x ?? wind[0] ?? 0, wind.z ?? wind[1] ?? 0)) - 2.5; if (sp > 0) this.clock.wind += dt * sp; }
    this.age = this.clock.snow / this.fill + this.clock.rain / this.wash + this.clock.wind / this.blow + (W ? W.snow * 4 : 0) + (this.last.snow || this.last.mud || this.last.sand ? this.t / 6 : 0);
    if (centre) { this.cx = centre.x; this.cz = centre.z; this.grass?.place(centre.x, centre.z); }
    for (const w of this.watching) this.follow(w, dt);
    this.grass?.update(dt);
    if (!this.draws || !centre) return this;
    // the tiles in reach: those that have marks are opened (two a frame at most: the nearest first), those left behind are put away
    const S = this.size, ci = Math.floor(this.cx / S), cj = Math.floor(this.cz / S);
    if (ci !== this.ci || cj !== this.cj) {
      this.ci = ci; this.cj = cj;
      for (const tile of [...this.tiles.values()]) if (!this.near(tile.ti, tile.tj)) this.shut(tile);
      const R = Math.ceil(this.reach / S);
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) { const k = keyOf(i, j); if (!this.tiles.has(k) && this.byTile.get(k)?.length && this.near(i, j)) this.open(k, i, j); }
      this.todo.sort((a, b) => Math.hypot((b.ti + .5) * S - this.cx, (b.tj + .5) * S - this.cz) - Math.hypot((a.ti + .5) * S - this.cx, (a.tj + .5) * S - this.cz));
    }
    // (snow that came or went all at once, a cut to another day: every tile in reach is made again now, not over the next second)
    const lies = W ? W.snow : 0, jump = Math.abs(lies - this.lay0) > .08; this.lay0 = lies;
    if (jump) for (const tile of this.tiles.values()) if (tile.built) this.spoil(tile.k);
    this.remake(dt === 0 || jump ? Infinity : this.budget);   // (update(0, centre): everything in reach now, before a cut)
    // the pictures follow, and each sheet's shine and how far away it fades out
    const scene = this.view.scene, wet = this.wetness, pools = W?.pools ?? 0;
    for (const tile of this.tiles.values()) {
      if (!tile.built) continue;
      this.paint(tile);
      const has = (this.byTile.get(tile.k)?.length ?? 0) > 0;
      if (!has) { if (tile.mesh.parent) tile.mesh.removeFromParent(); if (this.frame % 60 === 0) this.shut(tile); continue; }
      if (!tile.mesh.parent) scene.add(tile.mesh);
      const dx = Math.max(0, Math.abs((tile.ti + .5) * S - this.cx) - S / 2), dz = Math.max(0, Math.abs((tile.tj + .5) * S - this.cz) - S / 2), far = Math.hypot(dx, dz), L = this.looks[tile.main || SNOW];
      tile.mat.opacity = 1 - sm(this.reach - S * 1.5, this.reach, far);
      let rough = L.rough; if (tile.main === MUD && W) { rough = .92 + (L.rough - .92) * Math.min(1, wet * 1.5); rough += (.07 - rough) * pools * wet; }   // (mud dries dull; prints in it fill with water once puddles lie)
      tile.mat.roughness = rough;
    }
    return this;
  }

  /* ----- asking about marks ----- */
  /** How deep the ground is pressed at x, z, in metres (0: not at all, or out of reach of the centre). */
  at(x, z) {
    const S = this.size, tile = this.tiles.get(keyOf(Math.floor(x / S), Math.floor(z / S))); if (!tile || !tile.built) return 0;
    const i = Math.floor((x - tile.x0) / this.cell), j = Math.floor((z - tile.z0) / this.cell), h = tile.H[j * TEX + i];
    return h < 0 ? -h : 0;
  }
  /**
   * The marks within r metres of a point, the newest first: [{ x, z, turn, kind, age (seconds), by, depth }].
   * by: only this one's; newer: only those made in the last so many seconds; max: how many at most (24). For a
   * tracker that follows a trail, or a game about reading one.
   */
  trail(x, z, r = 3, { by = undefined, newer = Infinity, max = 24 } = {}) {
    const out = [], n = this.log.length;
    for (let q = 0; q < n && out.length < max; q++) {
      const s = this.log[mod(this.head - 1 - q + (n < this.keep ? n : 0), n)]; if (s.dead || this.left(s) <= .03) continue;
      const age = this.t - s.t; if (age > newer) break;
      if ((by === undefined || s.by === by) && Math.hypot((s.x1 ?? s.x) - x, (s.z1 ?? s.z) - z) <= r) out.push({ x: s.x1 ?? s.x, z: s.z1 ?? s.z, turn: Math.atan2(s.fx, s.fz), kind: NAMES[s.kind], age, by: s.by, depth: s.d });
    }
    return out;
  }
  /** How many marks are remembered, and how many tiles of them are being drawn. */
  get count() { return this.log.length; }
  get drawn() { let n = 0; for (const t of this.tiles.values()) if (t.mesh.parent) n++; return n; }
  /** Takes every mark away and stands the grass up (in reset()). Things being watched stay watched. */
  clear() {
    for (const tile of [...this.tiles.values()]) this.shut(tile);
    this.log.length = 0; this.head = 0; this.byTile.clear(); this.todo.length = 0; this.stale.length = 0; this.job = null; this.tracks.clear(); this.made.length = 0; this.ci = this.cj = NaN;
    this.clock.snow = this.clock.rain = this.clock.wind = 0; this.grass?.clear();
    for (const w of this.watching) { w.was = null; w.dist = 0; w.lastT = [null, null]; }
    return this;
  }
  dispose() {
    this.clear(); for (const tile of this.pool) this.scrap(tile); this.pool.length = 0; this.watching.length = 0;
    if (this.grass) { if (this.land?.parting === this.grass) { this.land.parting = null; for (const m of this.land.meadows || []) m.userData.meadow?.look?.part?.(null); } this.grass.dispose(); }
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Marks.prototype, 'update', 'ground marks');
