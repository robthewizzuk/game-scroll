// gs.outdoors.Sea: the open sea out to the horizon, and its shore. Everything gs.outdoors.Water does (height() and
// normal() that floating things read, ripples, splash(), watch(), rain, underwater()), and:
//   - a swell the wind has made: long waves from its speed and way, the sums height() answers, the same on WebGL and WebGPU
//   - fine waves: on WebGPU an ocean's spectrum turned into waves every frame by an FFT on the graphics chip (sea-gpu.js),
//     with whitecaps where they crowd and break; on WebGL a few moving ripples in the shader in their place
//   - colour by depth, and on WebGPU (high and ultra) what lies under the water seen through it, bent and fading with
//     depth, with light playing on the bottom (caustics)
//   - with a bed (land.height): waves that rise as the water shoals, break into foam and run up the beach and back
//     (height() follows them, so a boat in the surf rides them), and sand they leave dark and wet, which dries
//   - the swell running on out to the horizon round the patch (far metres), thinned to what its points can carry
//
//   sea = new Sea({ wind: 8, dir: .6, bed: (x, z) => land.height(x, z), view }); view.scene.add(sea.mesh);
//   update(dt) { sea.update(dt, view.cam.position); boat.position.y = sea.height(boat.position.x, boat.position.z); }
//
// The near patch's points, the swell, the shore's waves and the wet sand are worked out here each frame (a few tenths of
// a millisecond); the fine waves and the see-through are the graphics chip's. Kit use only: games reach it as gs.outdoors.Sea.
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { Water, lace } from './water.js';
import { looks } from './looks.js';
import { timed } from './prof.js';

const TAU = Math.PI * 2, G = 9.81;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
// a broken wave, a bore: the water rises fast as its front comes and falls away slowly behind it (u: 0..1 through it)
const bore = u => u < .12 ? smooth(0, .12, u) : 1 - (u - .12) / .88;
// how far up the beach a broken wave has run, u of the way through its period (0..1 of the highest it reaches): up fast
// as the bore arrives, slowing at the top, then sliding back
const runUp = u => { const b = bore(clamp(u * 1.08 - .04, 0, 1)); return b * Math.sqrt(b); };
// how far the crests along a shore are out of line with each other (a smooth wander, so no two waves arrive alike)
const wander = (x, z) => 1.3 * Math.sin(x * .031 + z * .017) + .8 * Math.sin(-x * .013 + z * .041 + 1.7) + .5 * Math.sin(x * .057 - z * .029 + 4.1);

/**
 * The sea. level: the calm height; wind: metres a second (7), dir: the way it blows and the waves run (radians, 0 is +x,
 * PI/2 is +z); waves: how big the swell is for that wind (1; or your own list as for Water); size and segments: the near
 * patch that follows the camera (160 m, 96); far: metres out the water reaches round it (4000; 0: none). bed: (x, z) =>
 * the ground's height under it: shallows, a shore with breaking waves and wet sand. shore: how big the breakers are (1;
 * 0: none), sand: how long the sand takes to dry (40 s; 0: no wet sand). deep, shallow, foam: colours; clear: metres of
 * water that hide the bottom (6). fine: how strong the fine waves are (1), choppy: how sharp their crests (1.2). view: the
 * HDView it is drawn in (for the graphics chip's part on WebGPU). Also ripples, reach, spray as for Water.
 */
export class Sea extends Water {
  constructor({ level = 0, wind = 7, dir = 0, waves = 1, size = 160, segments = 96, far = 4000, bed = null, shore = 1, sand = 40, view = null,
    deep = '#0b3550', shallow = '#2a8f9e', foam = '#f2f7f7', clear = 3, fine = 1, choppy = 1.2, seed = 7, ripples = 0, reach = 24, spray = 80 } = {}) {
    const list = Array.isArray(waves) ? waves : Sea.swell(wind, dir, waves, seed);
    const m = new MeshPhysicalMaterial({ color: deep, roughness: .05, metalness: 0, ior: 1.333, transparent: true, depthWrite: true, alphaTest: .01 });
    super({ level, waves: list, size, segments, material: m, seed, ripples, reach, bed, shallow, clear, foam, spray, colour: deep });
    m.vertexColors = false; m.needsUpdate = true; this.own = true;
    const n1 = segments + 1, cnt = n1 * n1, g = this.mesh.geometry;
    g.deleteAttribute('color');
    this.attr = new BufferAttribute(new Float32Array(cnt * 4), 4); g.setAttribute('lkSea', this.attr);   // (shore foam, depth, crest, swash: how far the swash is past the point, in metres, 1 in the water): looks.sea reads them
    this.mesh.name = 'sea'; this.mesh.renderOrder = 1;
    const V = Math.max(.5, wind), Hs = .21 * V * V / G * (typeof waves === 'number' ? waves : 1), Lp = clamp(8.17 * V * V / G, 6, 220);
    this.sea = {
      wind: V, dir, Hs, Lp, choppy, fine, clear, far, sandDry: sand,
      // the shore's waves: what the swell becomes in shallow water. Their period is the swell's; their length the
      // shallow water's (slower there); they rise and steepen over the last few metres of depth
      period: Math.sqrt(TAU * Lp / G), feel: clamp(Lp * .12, 2.5, 7), H0: Hs * .75 * shore, on: !!bed && shore > 0,
      cell: size / segments, D: new Float32Array(cnt), S: new Float32Array(cnt), N: new Float32Array(cnt),
      F: new Float32Array(cnt), H: new Float32Array(cnt), BR: new Float32Array(cnt), HB: new Float32Array(cnt), NB: new Float32Array(cnt), E: new Float32Array(cnt).fill(1), SP: new Float64Array(cnt), CP: new Float64Array(cnt), U0: new Float64Array(cnt), NU: new Float64Array(cnt),   // (what each point's depth makes of the shore's waves there: shoreStill())
      lat: null,   // (the bed at each point of the patch's lattice, kept as the patch moves: lattice())
    };
    this.sea.k = TAU / (this.sea.period * Math.sqrt(G * 2.5));
    this.look = looks.sea(m, { deep, shallow, foam, clear, wind: V, dir, fine, choppy, tile: 48, lace: lace() });
    if (far > 0) this.horizon(far);
    if (bed && sand > 0) this.sandSheet();
    this.view = view; if (view) (view.sims ||= []).push(this);
    this.shadeAt = null; this.update(0, { x: 0, y: 0, z: 0 });
  }

  /**
   * The swell a wind makes: five long waves round its way, the longest the length a sea of that wind peaks at (about 8 V² / g:
   * 30 m for 6 m/s, 53 m for 8) and as high as such a sea is (its significant height .21 V² / g, times amount). As Water's waves list.
   */
  static swell(wind = 7, dir = 0, amount = 1, seed = 7) {
    let s = seed; const R = () => (s = (s * 16807) % 2147483647) / 2147483647, V = Math.max(.5, wind);
    const Lp = clamp(8.17 * V * V / G, 6, 220), Hs = .21 * V * V / G * amount;
    return [[1, .42, 0], [.72, .26, .38], [.55, .16, -.46], [.39, .1, .82], [.27, .06, -.95]].map(([lf, hs, a]) =>
      ({ dir: dir + a * (.8 + R() * .4), length: Lp * lf * (.92 + R() * .16), height: Hs * .5 * hs, speed: 0 }));
  }

  /* ----- the shore ----- */
  // the bed at lattice point (I, J) of the patch's grid (whole cells from the world's 0): kept in a square that wraps, so
  // only the strip the patch has moved into is asked of the bed
  lattice(I, J) {
    const S = this.sea, M = this.segments + 8;
    let L = S.lat; if (!L) L = S.lat = { M, H: new Float32Array(M * M), I: new Int32Array(M * M).fill(-2147483647), J: new Int32Array(M * M) };
    const k = ((I % M) + M) % M + (((J % M) + M) % M) * M;
    if (L.I[k] !== I || L.J[k] !== J) { L.I[k] = I; L.J[k] = J; L.H[k] = this.bed(I * S.cell, J * S.cell); }
    return L.H[k];
  }
  // depth (metres, negative on the beach) and how far out from the waterline (metres, up the slope's way) a point is
  shoreOf(x, z, out) {
    const h = this.sea.cell, b = this.bed(x, z), gx = (this.bed(x + h, z) - this.bed(x - h, z)) / (2 * h), gz = (this.bed(x, z + h) - this.bed(x, z - h)) / (2 * h);
    out.d = this.level - b; out.s = clamp(out.d / Math.max(Math.hypot(gx, gz), .015), 0, 150); return out;
  }
  // the parts of the shore's waves at a point that its depth alone settles: how much of the open swell is left (f), how
  // high the wave has grown (H: it rises as the water shoals), how far it has broken (br: once it is too high for the
  // depth), the broken wave's height (Hb) and how near it is to breaking (nb)
  shoreStill(d, out) {
    const S = this.sea, feel = S.feel; out.f = smooth(.3, feel, d); out.e = 1;
    if (!(d > 0)) { out.H = out.br = out.Hb = out.nb = 0; return out; }
    const H = S.H0 * Math.pow(feel / Math.max(d, .25), .25) * (1 - smooth(feel, feel * 1.5, d)), db = H / .78;
    out.H = H; out.br = 1 - smooth(db * .85, db * 1.15, d); out.Hb = Math.min(H, .78 * Math.max(d, .05)); out.nb = smooth(db * 2.2, db * 1.1, d);
    return out;
  }
  // what the shore adds over the calm level at depth d, s metres out, with phase offset n, at time t, given shoreStill()'s
  // st there (and st.e: 1, less toward the patch's edge, where the far rings have no breakers): { h (metres), foam (0..1),
  // cover (true where the beach is under the swash), m (on the beach: how far the swash is past the point, metres up) }
  shoreWave(d, s, n, t, out, st) {
    const S = this.sea; out.h = 0; out.foam = 0; out.cover = false; out.f = st.f; out.m = 1;
    if (!S.on || d > S.feel * 1.5) return out;
    const R = S.H0 * .9 * st.e * runUp(fract((TAU * t / S.period + n) / TAU));
    if (d > 0) { const ph = TAU * t / S.period - S.k * s + n; this.breaker(st, Math.sin(ph), fract(ph / TAU), out); return d < .6 ? this.shoal(d, R, out) : out; }
    return this.swash(-d, R, out);
  }
  // the swash's film carries on a little way into the water (d metres deep), where it stands higher than the waves, so the
  // water has no step where the beach begins
  shoal(d, R, out) {
    const h = -d + Math.max(.015, (R + d) * .22);
    if (h > out.h) { out.h = h; out.foam = Math.max(out.foam, .12 * (1 - d / .6)); }
    return out;
  }
  // in the water: a wave at sin(phase) sp, u of the way through its period, peaked as the water shoals and turning into a
  // bore as it breaks; foam in a band just behind each broken wave's front, thinning out behind it, and a little on the
  // crests about to break
  breaker(st, sp, u, out) {
    const br = st.br, e = st.e, p = (sp + 1) / 2, swell = st.H * (p * p - .375), broken = st.Hb * (bore(u) - .4);
    out.h = (swell + (broken - swell) * br) * e;
    out.foam = ((br > 0 ? br * .95 * (u < .1 ? smooth(.015, .1, u) : Math.exp(-(u - .1) * 4.5)) : 0) + (st.nb > 0 ? (1 - br) * st.nb * smooth(.9, 1, p) * .6 : 0)) * e;
    return out;
  }
  // on the beach, up metres above the level: each broken wave runs up it (R: how high it has reached now) and slides back.
  // The film lies a little over the sand a way past its edge too, unseen, so the edge falls between points where it is
  swash(up, R, out) {
    const m = R - up; out.m = m; out.cover = m > 0;
    if (m > -.4) { out.h = up + Math.max(.015, m * .22); out.foam = m > 0 ? .12 + .75 * (1 - smooth(0, Math.max(.04, R * .25), m)) : .87; }   // (foam at the swash's leading edge)
    else out.h = up - .35;   // (under the sand, out of sight)
    return out;
  }
  // 1, falling to 0 over the last 14 m to the patch's edge (as heave() has it per point)
  edgeFade(x, z) {
    const p = this.mesh.position, half = this.size / 2;
    return smooth(0, 14, Math.min(half - Math.abs(x - p.x), half - Math.abs(z - p.z)));
  }
  /** The waves' height over the calm level at x, z (no ripples), with the shore's breakers where there is a bed. */
  swellAt(x, z, t = this.t) {
    const y = super.swellAt(x, z, t);
    if (!this.sea?.on) return y;
    const sh = this.shoreOf(x, z, SH), st = this.shoreStill(sh.d, ST); st.e = this.edgeFade(x, z);
    const w = this.shoreWave(sh.d, sh.s, wander(x, z), t, SW, st);
    return y * w.f + w.h;
  }
  /** Water height at x, z right now (floating things: the swell, the breakers and the ripples, as drawn). */
  height(x, z, t = this.t) { const y = this.level + this.swellAt(x, z, t); return this.rip && t === this.t ? y + this.rip.at(x, z) : y; }
  /** Surface up direction at x, z. */
  normal(x, z, t = this.t) {
    if (!this.sea?.on) return super.normal(x, z, t);
    const e = .25, gx = (this.swellAt(x + e, z, t) - this.swellAt(x - e, z, t)) / (2 * e), gz = (this.swellAt(x, z + e, t) - this.swellAt(x, z - e, t)) / (2 * e), l = Math.hypot(gx, 1, gz);
    return { x: -gx / l, y: 1 / l, z: -gz / l };
  }
  /** Where the beach is under the water's run-up now (the swash), at x, z. */
  covered(x, z) {
    if (!this.sea.on) return !this.bed || this.height(x, z) > this.bed(x, z);
    const sh = this.shoreOf(x, z, SH); if (sh.d > 0) return true;
    const st = this.shoreStill(sh.d, ST); st.e = this.edgeFade(x, z); return this.shoreWave(sh.d, sh.s, wander(x, z), this.t, SW, st).cover;
  }
  /** How wet the sand is at x, z (0..1): 1 where the waves reach, drying behind them. */
  wetAt(x, z) {
    const W = this.sea.wet; if (!W) return 0;
    const S = this.sea, I = Math.round(x / S.cell), J = Math.round(z / S.cell), i = I - W.I0, j = J - W.J0;
    return i >= 0 && j >= 0 && i <= W.n && j <= W.n ? W.v[j * (W.n + 1) + i] : 0;
  }

  // the patch's depths, distances out and crest offsets, from the lattice (again only when the patch has moved a cell)
  shade() {
    const S = this.sea; if (!S || !this.bed) return;
    const n1 = this.segments + 1, p = this.mesh.position, h = S.cell, I0 = Math.round((p.x - this.size / 2) / h), J0 = Math.round((p.z - this.size / 2) / h);
    for (let j = 0, i = 0; j < n1; j++) for (let q = 0; q < n1; q++, i++) {
      const I = I0 + q, J = J0 + j, b = this.lattice(I, J), gx = (this.lattice(I + 1, J) - this.lattice(I - 1, J)) / (2 * h), gz = (this.lattice(I, J + 1) - this.lattice(I, J - 1)) / (2 * h);
      S.D[i] = this.level - b; S.S[i] = clamp(S.D[i] / Math.max(Math.hypot(gx, gz), .015), 0, 150); S.N[i] = wander(I * h, J * h);
      const st = this.shoreStill(S.D[i], ST); S.F[i] = st.f; S.H[i] = st.H; S.BR[i] = st.br; S.HB[i] = st.Hb; S.NB[i] = st.nb;
      S.E[i] = smooth(0, 14, Math.min(q, n1 - 1 - q, j, n1 - 1 - j) * h);
      const ph = S.N[i] - S.k * S.S[i]; S.SP[i] = Math.sin(ph); S.CP[i] = Math.cos(ph); S.U0[i] = ph / TAU; S.NU[i] = S.N[i] / TAU;   // (the waves' phase there, less the clock's part)
    }
    if (this.farMesh) {   // (the far rings' first few: the colour of their depth, as far as the bed is known)
      const A = this.farMesh.geometry.attributes.lkSea, at = A.array, b = this.farBase, per = this.segments * 4, rows = Math.min(this.farRows.length, 5), F = this.farF ||= new Float32Array(per * rows);
      for (let i = 0; i < per * rows; i++) {   // (and how much of the swell the depth leaves: none on the beach, so it stays under the sand)
        const d = this.level - this.bed(b[i * 3] + p.x, b[i * 3 + 2] + p.z), ok = Number.isFinite(d);
        at[i * 4 + 1] = ok ? clamp(d, -5, 1000) : 1000; F[i] = ok ? smooth(.3, S.feel, d) : 1;
      }
      A.needsUpdate = true;
    }
  }
  // The patch's points and normals: the swell (as Water: sines stepped along each row), less in the shallows, plus the
  // shore's waves; and for the look, each point's shore foam, depth, crest and whether it is the swash's thin film
  heave() {
    const S = this.sea; if (!S) return super.heave();
    const g = this.mesh.geometry, P = g.attributes.position, Nm = g.attributes.normal, arr = P.array, nor = Nm.array, n1 = this.segments + 1, cell = this.size / this.segments, p = this.mesh.position;
    const cnt = n1 * n1, Y = this.Y ||= new Float32Array(cnt), GX = this.GX ||= new Float32Array(cnt), GZ = this.GZ ||= new Float32Array(cnt); Y.fill(0); GX.fill(0); GZ.fill(0);
    const xa = this.Yx = p.x - this.size / 2, za = this.Yz = p.z - this.size / 2, A = this.attr.array, top = this.swell || 1;
    for (const w of this.list) {
      const d = w.k * w.dx * cell, sd = Math.sin(d), cd = Math.cos(d), hk = w.height * w.k, t0 = w.ph - w.k * w.c * this.t;
      for (let j = 0, i = 0; j < n1; j++) {
        const ph = w.k * (xa * w.dx + (za + j * cell) * w.dz) + t0; let sn = Math.sin(ph), cs = Math.cos(ph);
        for (let q = 0; q < n1; q++, i++) { Y[i] += w.height * sn; const sl = hk * cs; GX[i] += sl * w.dx; GZ[i] += sl * w.dz; const s2 = sn * cd + cs * sd; cs = cs * cd - sn * sd; sn = s2; }
      }
    }
    const r = this.rip, near = r && r.energy > 0 ? r : null, x0 = near ? near.x0 : 0, z0 = near ? near.z0 : 0, x1 = x0 + this.reach * 2, z1 = z0 + this.reach * 2, shore = S.on;
    // the shore's clock: its waves' phase here is the point's own (from shade()) plus this, so no sine is worked out per point
    const ck = TAU * this.t / S.period, sA = Math.sin(ck), cA = Math.cos(ck), uA = ck / TAU, band = S.feel * 1.5, R0 = S.H0 * .9;
    for (let i = 0, k = 0, a = 0; i < cnt; i++, k += 3, a += 4) {
      let y = Y[i], gx = GX[i], gz = GZ[i], foam = 0, film = 1, depth = shore ? S.D[i] : 1000;
      if (shore && depth < band) {
        const e = S.E[i], f = S.F[i]; y *= f; gx *= f; gz *= f;
        if (depth > 0) {
          ST.H = S.H[i]; ST.br = S.BR[i]; ST.Hb = S.HB[i]; ST.nb = S.NB[i]; ST.e = e;
          const w = this.breaker(ST, S.SP[i] * cA + S.CP[i] * sA, fract(S.U0[i] + uA), SW); if (depth < .6) this.shoal(depth, R0 * e * runUp(fract(uA + S.NU[i])), w);
          y += w.h; foam = w.foam;
          film = Math.min(1, depth + y);   // (in the water: how deep it is now, so its edge falls between points as the swash's does)
        } else if (-depth > R0 * e + .4) { y = -depth - .35; film = -1; }   // (above anywhere the swash reaches: under the sand)
        else { const w = this.swash(-depth, R0 * e * runUp(fract(uA + S.NU[i])), SW); y = w.h; foam = w.foam; film = w.m; }
      }
      y += this.level;
      if (near) { const x = arr[k] + p.x, z = arr[k + 2] + p.z; if (x > x0 && x < x1 && z > z0 && z < z1) y += near.at(x, z); }
      arr[k + 1] = y; const l = 1 / Math.sqrt(gx * gx + gz * gz + 1); nor[k] = -gx * l; nor[k + 1] = l; nor[k + 2] = -gz * l;
      A[a] = foam; A[a + 1] = depth; A[a + 2] = clamp(Y[i] / top, -1, 1) * Math.min(1, Math.sqrt(GX[i] * GX[i] + GZ[i] * GZ[i]) * 6); A[a + 3] = film;
    }
    if (shore) {   // (the shore's waves bend the normals too: worked out across the grid, where they are)
      for (let j = 1; j < n1 - 1; j++) for (let q = 1; q < n1 - 1; q++) {
        const i = j * n1 + q; if (S.D[i] > S.feel * 1.5) continue;
        const k = i * 3, gx = (arr[k + 4] - arr[k - 2]) / (2 * cell), gz = (arr[k + n1 * 3 + 1] - arr[k - n1 * 3 + 1]) / (2 * cell), l = 1 / Math.sqrt(gx * gx + gz * gz + 1);
        nor[k] = -gx * l; nor[k + 1] = l; nor[k + 2] = -gz * l;
      }
    }
    P.needsUpdate = true; Nm.needsUpdate = true; this.attr.needsUpdate = true;
    if (this.farMesh) this.heaveFar();
    if (this.sea.wet) this.dry();
  }

  /* ----- out to the horizon ----- */
  // rings of points round the patch, each a square, further apart the further out, the first on the patch's own edge
  horizon(far) {
    const n = this.segments, per = n * 4, half = this.size / 2, rows = [half];
    for (let h = half; h < far;) { h = Math.min(far, h * 1.28 + this.sea.cell * 2); rows.push(h); }
    const R = rows.length, pos = new Float32Array(per * R * 3), idx = [];
    const edge = (u, h) => { const s = Math.floor(u / n), f = (u % n) / n * 2 - 1; return s === 0 ? [f * h, -h] : s === 1 ? [h, f * h] : s === 2 ? [-f * h, h] : [-h, -f * h]; };
    for (let r = 0; r < R; r++) for (let u = 0; u < per; u++) { const [x, z] = edge(u, rows[r]), k = (r * per + u) * 3; pos[k] = x; pos[k + 2] = z; }
    for (let r = 0; r < R - 1; r++) for (let u = 0; u < per; u++) { const a = r * per + u, b = r * per + (u + 1) % per, c = a + per, d = b + per; idx.push(a, b, c, b, d, c); }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length), 3));
    const at = new Float32Array(per * R * 4); for (let i = 0; i < per * R; i++) { at[i * 4 + 1] = 1000; at[i * 4 + 3] = 1; } g.setAttribute('lkSea', new BufferAttribute(at, 4)); g.setIndex(idx);
    this.farRows = rows; this.farBase = Float32Array.from(pos);
    this.farMesh = new Mesh(g, this.mesh.material); this.farMesh.name = 'sea:far'; this.farMesh.frustumCulled = false; this.farMesh.renderOrder = this.mesh.renderOrder; this.farMesh.userData.noSettle = true; this.farMesh.userData.detail = false;
    this.farMesh.receiveShadow = false; this.mesh.add(this.farMesh);
  }
  // the far rings heave with the swell too, each wave thinned out where the points are too far apart to carry it
  heaveFar() {
    const g = this.farMesh.geometry, P = g.attributes.position.array, Nm = g.attributes.normal.array, b = this.farBase, rows = this.farRows, per = this.segments * 4, p = this.mesh.position, fF = this.sea.on ? this.farF : null;
    for (let r = 0; r < rows.length; r++) {
      const gap = r ? rows[r] - rows[r - 1] : this.sea.cell, amp = this.list.map(w => w.height * (1 - smooth(w.length * .2, w.length * .45, gap)));
      if (r > 1 && amp.every(a => a === 0)) {   // (beyond the last wave they can carry: flat, and already flat from before)
        if (this.farFlat === r) break;
        for (let i = r * per; i < rows.length * per; i++) { P[i * 3 + 1] = this.level; Nm[i * 3] = 0; Nm[i * 3 + 1] = 1; Nm[i * 3 + 2] = 0; }
        this.farFlat = r; break;
      }
      for (let u = 0; u < per; u++) {
        const i = r * per + u, k = i * 3, x = b[k] + p.x, z = b[k + 2] + p.z, f = fF && i < fF.length ? fF[i] : 1; let y = 0, gx = 0, gz = 0;
        if (f > 0) for (let q = 0; q < this.list.length; q++) { const w = this.list[q]; if (!amp[q]) continue; const ph = w.k * (x * w.dx + z * w.dz) - w.k * w.c * this.t + w.ph; y += amp[q] * Math.sin(ph); const sl = amp[q] * w.k * Math.cos(ph); gx += sl * w.dx; gz += sl * w.dz; }
        y = this.level + y * f; gx *= f; gz *= f;
        P[k + 1] = y; const l = 1 / Math.sqrt(gx * gx + gz * gz + 1); Nm[k] = -gx * l; Nm[k + 1] = l; Nm[k + 2] = -gz * l;
      }
    }
    this.seam();
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
  // the first far ring lies on the patch's edge: it takes the patch's own heights there (shore waves and ripples included)
  seam() {
    const n = this.segments, n1 = n + 1, per = n * 4, A = this.mesh.geometry.attributes.position.array, F = this.farMesh.geometry.attributes.position.array;
    for (let u = 0; u < per; u++) {
      const s = Math.floor(u / n), f = u % n, q = s === 0 ? f : s === 1 ? n : s === 2 ? n - f : 0, j = s === 0 ? 0 : s === 1 ? f : s === 2 ? n : n - f;
      F[u * 3 + 1] = A[(j * n1 + q) * 3 + 1];
    }
  }

  /* ----- wet sand ----- */
  // a thin sheet over the beach near the centre, dark and glossy where the waves have reached: each point's wetness is set
  // to 1 while the swash covers it and dries away over sand seconds after
  sandSheet() {
    const S = this.sea, n = Math.min(this.segments, Math.round(80 / S.cell)), n1 = n + 1, cnt = n1 * n1, idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * n1 + i; idx.push(a, a + n1, a + 1, a + 1, a + n1, a + n1 + 1); }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(cnt * 3), 3)); g.setAttribute('normal', new BufferAttribute(new Float32Array(cnt * 3), 3));
    const C = new Float32Array(cnt * 4); for (let i = 0; i < cnt; i++) { C[i * 4] = .05; C[i * 4 + 1] = .042; C[i * 4 + 2] = .032; }   // (wet sand: much darker, a little browner)
    g.setAttribute('color', new BufferAttribute(C, 4)); g.setIndex(idx);
    const m = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, transparent: true, roughness: .28, metalness: 0, depthWrite: false, alphaTest: .02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.noSettle = true;
    const mesh = new Mesh(g, m); mesh.name = 'sea:wet sand'; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = -1; mesh.userData.noSettle = true; mesh.userData.detail = false; mesh.userData.noAO = true;
    S.wet = { n, mesh, v: new Float32Array(cnt), I0: NaN, J0: NaN, tone: .7 };
    this.wetMesh = mesh;
  }
  // (each frame, from heave()): the sheet follows the centre in whole cells, keeping what it knew; points the swash covers
  // are wet; the rest dry
  dry() {
    const S = this.sea, W = S.wet, n1 = W.n + 1, h = S.cell, cx = this.cx ?? this.mesh.position.x, cz = this.cz ?? this.mesh.position.z;
    const I0 = Math.round(cx / h) - (W.n >> 1), J0 = Math.round(cz / h) - (W.n >> 1), g = W.mesh.geometry, P = g.attributes.position.array, Nm = g.attributes.normal.array, C = g.attributes.color.array;
    if (I0 !== W.I0 || J0 !== W.J0) {   // moved: carry the wetness over, lay the sheet on the bed again
      const old = W.v.slice(), dI = I0 - W.I0, dJ = J0 - W.J0, had = Number.isFinite(W.I0);
      const top = S.H0 * .9;   // (sand new to the sheet starts as the waves would have left it: wet up to where they reach)
      for (let j = 0, i = 0; j < n1; j++) for (let q = 0; q < n1; q++, i++) {
        const oq = q + dI, oj = j + dJ; W.v[i] = had && oq >= 0 && oj >= 0 && oq < n1 && oj < n1 ? old[oj * n1 + oq] : this.level - this.lattice(I0 + q, J0 + j) > -top ? .95 : 0;
        const I = I0 + q, J = J0 + j, b = this.lattice(I, J), gx = (this.lattice(I + 1, J) - this.lattice(I - 1, J)) / (2 * h), gz = (this.lattice(I, J + 1) - this.lattice(I, J - 1)) / (2 * h), l = 1 / Math.hypot(gx, 1, gz);
        P[i * 3] = I * h; P[i * 3 + 1] = b + .025; P[i * 3 + 2] = J * h; Nm[i * 3] = -gx * l; Nm[i * 3 + 1] = l; Nm[i * 3 + 2] = -gz * l;
      }
      W.I0 = I0; W.J0 = J0; g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true; g.computeBoundingSphere();
      W.D = W.D || new Float32Array(n1 * n1); W.Sd = W.Sd || new Float32Array(n1 * n1); W.Nn = W.Nn || new Float32Array(n1 * n1);
      for (let j = 0, i = 0; j < n1; j++) for (let q = 0; q < n1; q++, i++) {
        const I = I0 + q, J = J0 + j, b = this.lattice(I, J), gx = (this.lattice(I + 1, J) - this.lattice(I - 1, J)) / (2 * h), gz = (this.lattice(I, J + 1) - this.lattice(I, J - 1)) / (2 * h);
        W.D[i] = this.level - b; W.Sd[i] = clamp(W.D[i] / Math.max(Math.hypot(gx, gz), .015), 0, 150); W.Nn[i] = wander(I * h, J * h);
      }
    }
    const dt = this.t - (W.t ?? this.t); W.t = this.t; const by = S.sandDry > 0 ? Math.max(0, dt) / S.sandDry : 1, lim = S.H0 * 1.2 + .3, tone = W.tone;
    // (the sheet's points are the patch's: where it lies on the patch, the swash heave() found there says if it is covered)
    const pn = this.segments, P0 = this.mesh.position, pI = Math.round((P0.x - this.size / 2) / h), pJ = Math.round((P0.z - this.size / 2) / h), A = this.attr.array;
    for (let i = 0; i < n1 * n1; i++) {
      const d = W.D[i]; let v = W.v[i];
      if (d > 0) v = 1;   // (under the water)
      else if (-d < lim) {
        const pq = I0 + i % n1 - pI, pj = J0 + ((i / n1) | 0) - pJ;
        if (pq >= 0 && pj >= 0 && pq <= pn && pj <= pn ? A[(pj * (pn + 1) + pq) * 4 + 3] > 0 : this.shoreWave(d, W.Sd[i], W.Nn[i], this.t, SW, this.shoreStill(d, ST)).cover) v = 1;
        else if (v > 0) v = Math.max(0, v - by * (.6 + .4 * v));
      }
      else if (v > 0) v = Math.max(0, v - by * (.6 + .4 * v));   // (drying: the last of it lingers)
      const q = i % n1, j = (i - q) / n1, edge = smooth(0, 8, Math.min(q, W.n - q, j, W.n - j) * h);   // (fading out toward the sheet's edge)
      W.v[i] = v; const a = -d < lim + .4 && d < .5 ? v * tone * edge * (1 - smooth(.1, .5, d)) : 0;   // (in the water itself it is the sea's to draw)
      C[i * 4 + 3] = a;
    }
    g.attributes.color.needsUpdate = true;
    if (W.mesh.parent !== this.mesh.parent && this.mesh.parent) this.mesh.parent.add(W.mesh);   // (the sheet lies in the world, beside the water)
  }

  /** Each frame: moves the waves on, keeps the patch under `centre` (the camera or the boat), and the fine waves' clock. */
  update(dt, centre = null) {
    if (this.sea && this.bed && centre) {   // (the depths are found for where the patch is going before it is heaved there)
      const cell = this.size / this.segments, px = Math.round(centre.x / cell) * cell, pz = Math.round(centre.z / cell) * cell, key = px + ',' + pz;
      if (key !== this.shadeAt) { this.mesh.position.x = px; this.mesh.position.z = pz; this.shadeAt = key; this.shade(); }
    }
    super.update(dt, centre);
    if (this.look) this.look.uniforms.lkSeaT.value = this.t;
    return this;
  }
  // hd3d.js runs this each frame: on WebGPU the fine waves are worked out on the graphics chip (sea-gpu.js)
  gpuStep(G) { if (G && this.look && G.fx.seaStep) { this.gpuFree = G.fx.seaFree; G.fx.seaStep(G.r, this.look, this.t); } }
  calm() { super.calm(); if (this.sea.wet) { this.sea.wet.v.fill(0); this.sea.wet.I0 = NaN; } return this; }
  dispose() {
    super.dispose();
    for (const m of [this.farMesh, this.wetMesh]) if (m) { m.removeFromParent(); m.geometry.dispose(); if (m !== this.farMesh) m.material.dispose(); }
    this.mesh.material.dispose(); if (this.look) this.gpuFree?.(this.look);
    const s = this.view?.sims, i = s ? s.indexOf(this) : -1; if (i >= 0) s.splice(i, 1);
  }
}
const SH = { d: 0, s: 0 }, SW = { h: 0, foam: 0, cover: false, f: 1, m: 1 }, ST = { f: 1, H: 0, br: 0, Hb: 0, nb: 0, e: 1 };

timed(Sea.prototype, 'update', 'water');
