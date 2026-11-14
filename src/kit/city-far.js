// gs.city to the horizon: what lies past the city's own streets. A made-up city goes on round it as stand-ins, blocks of plain
// boxes in the city's own colours with windows from one small picture (lit at night from a second one), finer near the city and
// coarser further out: blocks of 90 m out to 1.5 km, 180 m to 3.5 km, 360 m to 6 km, thinning out into the country. Under each
// block a pad of street the colour of the city's roads. At night its street lights are one batch of dots. Round it all, land in a
// ring out to 10 km: flat at first, then hills. None of it is solid or walked in; it is only seen, past the air's haze. The boxes
// are a few meshes (each a slice of the ring, so what is behind the camera is left out) of plain standard materials, so it draws
// the same on WebGL and WebGPU. From the city's seed, with random numbers of its own.
// Kit use only: city.js makes it (City option far).
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { rng, makeNoise } from './math.js';
import { Particles } from './hd3d.js';

const SLICES = 8, BIG = 360;
// the rings of stand-ins: [out to (metres from the city's middle), a block's size, how full (0..1), how tall (1: the city's own storeys)]
export const FAR_RINGS = [[1500, 90, 1, 1], [3500, 180, .8, .55], [Infinity, 360, .5, .25]];

let PIC = null;
// the windows' picture: 8 x 8 windows in a wall (white: the mesh's colour gives the wall's), and which are lit at night (about a
// third, in runs along a floor, as people are home or not)
function pictures() {
  if (PIC) return PIC;
  if (typeof document === 'undefined') return { map: null, lit: null };   // (tests in node)
  const S = 256, c = S / 8, cv = document.createElement('canvas'), lit = document.createElement('canvas'); cv.width = cv.height = lit.width = lit.height = S;
  const g = cv.getContext('2d'), e = lit.getContext('2d'), R = rng(77);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); e.fillStyle = '#000000'; e.fillRect(0, 0, S, S);
  for (let y = 0; y < 8; y++) { let on = R() < .35;
    for (let x = 0; x < 8; x++) {
      const wx = x * c + c * .2, wy = y * c + c * .22, ww = c * .6, wh = c * .56;
      g.fillStyle = '#39414c'; g.fillRect(wx, wy, ww, wh);
      if (R() < .3) on = !on;
      if (on) { const w = R(); e.fillStyle = w < .7 ? '#ffd9a0' : w < .9 ? '#fff1d8' : '#bfd8ff'; e.globalAlpha = .3 + R() * .7; e.fillRect(wx, wy, ww, wh); e.globalAlpha = 1; }
    }
  }
  const tex = (cv, srgb) => { const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 4; if (srgb) t.colorSpace = SRGBColorSpace; return t; };
  PIC = { map: tex(cv, true), lit: tex(lit, true) };
  return PIC;
}

const geometry = (P, N, U, C, I) => {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3)); if (N) g.setAttribute('normal', new Float32BufferAttribute(N, 3));
  if (U) g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setAttribute('color', new Float32BufferAttribute(C, 3)); g.setIndex(I);
  g.computeBoundingSphere(); g.computeBoundingBox(); return g;
};
const only = m => { m.matrixAutoUpdate = false; m.updateMatrix(); Object.assign(m.userData, { noOcclude: true, noDetail: true, noContact: true }); return m; };

export class Skyline {
  /**
   * view: the city's view; plan: the city's layout; colours: its walls' colours (hex, weighted by repeats); street: its roads'
   * colour. reach: how far the stand-ins go (metres from the middle); land: how far the land goes; floors / tall: the city's
   * storeys; water: no stand-ins on the harbour's water; scale: fewer on slower phones (0..1). It makes the camera see as far as
   * the land if it didn't already (view.cam.far).
   */
  constructor(view, plan, { seed = 1, colours = ['#a8a090'], street = '#3b3d40', reach = 6000, land = 10000, floors = [3, 10], tall = 20, water = false, scale = 1 } = {}) {
    this.view = view; this.group = new Group(); this.group.name = 'city to the horizon'; view.scene.add(this.group);
    const B = plan.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, R = rng(seed * 61 + 7), noise = makeNoise(seed * 13 + 5), n01 = (x, z) => .5 + .5 * noise(x, z);
    const pal = colours.map(h => new Color(h)), roof = new Color('#55575a'), road = new Color(street);
    // the city's own ground: its blocks and the asphalt round them (plus a gap), and the harbour's water
    const ox0 = B.x0 - 60, ox1 = B.x1 + 60, oz0 = B.z0 - 60, oz1 = B.z1 + 60, wet = water ? [B.x0 - 40, B.x1 + 40, B.z1, B.z1 + 3010] : null;
    const slices = Array.from({ length: SLICES }, () => ({ P: [], N: [], U: [], C: [], I: [] })), pads = { P: [], C: [], I: [] }, lamps = [];
    const box = (x0, z0, x1, z1, h, col) => {
      const a = Math.atan2((z0 + z1) / 2 - cz, (x0 + x1) / 2 - cx), s = slices[Math.floor(((a + Math.PI) / (2 * Math.PI)) * SLICES) % SLICES];
      const du = Math.floor(R() * 8) / 8, dv = Math.floor(R() * 8) / 8, y0 = -1;
      const quad = (p, n, uv, c) => { const i = s.P.length / 3; for (let k = 0; k < 4; k++) { s.P.push(...p[k]); s.N.push(...n); s.U.push(...uv[k]); s.C.push(c.r, c.g, c.b); } s.I.push(i, i + 1, i + 2, i, i + 2, i + 3); };
      // four walls (24 m and 28 m a picture across and up: eight windows of 3 m, eight storeys of 3.5 m), outward and counter-clockwise
      for (const [ax, az, bx, bz, nx, nz] of [[x0, z1, x1, z1, 0, 1], [x1, z1, x1, z0, 1, 0], [x1, z0, x0, z0, 0, -1], [x0, z0, x0, z1, -1, 0]]) {
        const L = Math.hypot(bx - ax, bz - az) / 24, H = h / 28;
        quad([[ax, y0, az], [bx, y0, bz], [bx, h, bz], [ax, h, az]], [nx, 0, nz], [[du, dv], [du + L, dv], [du + L, dv + H], [du, dv + H]], col);
      }
      quad([[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0]], [0, 1, 0], [[.01, .01], [.01, .01], [.01, .01], [.01, .01]], roof);   // (a corner of the picture with no window)
      this.count++;
    };
    const pad = (x0, z0, x1, z1, col) => { const i = pads.P.length / 3; pads.P.push(x0, .05, z1, x1, .05, z1, x1, .05, z0, x0, .05, z0); for (let k = 0; k < 4; k++) pads.C.push(col.r, col.g, col.b); pads.I.push(i, i + 1, i + 2, i, i + 2, i + 3); };
    const block = (x0, z0, cell, d, [, , full, tallness]) => {
      const busy = full * (1 - Math.min(1, d / reach) ** 2.2) * Math.min(1, Math.max(0, (n01(x0 * .0011, z0 * .0011) - .2) * 2.2));   // (thinning out into the country, with parks and gaps)
      if (R() > busy * Math.sqrt(scale)) return;
      // the block: a street round it (its pad), one to four buildings on it, the tallest near the city
      const st = cell * .14, bx0 = x0 + st, bz0 = z0 + st, bx1 = x0 + cell - st, bz1 = z0 + cell - st, near = 1 - Math.min(1, Math.max(0, d - 400) / 2500);
      pad(x0 + 1, z0 + 1, x0 + cell - 1, z0 + cell - 1, road.clone().multiplyScalar(.9 + R() * .25));
      const k = 1 + Math.floor(R() * (cell > 200 ? 3 : 4));
      for (let b = 0; b < k; b++) {
        const split = k > 1 ? (b + .1 + R() * .2) / k : 0, w = k > 1 ? (bx1 - bx0) / k * (.8 + R() * .2) : bx1 - bx0;
        const ax0 = k > 1 ? bx0 + split * (bx1 - bx0) : bx0, ax1 = Math.min(bx1, ax0 + w), dz = (bz1 - bz0) * (k > 1 ? .55 + R() * .45 : 1);
        const az0 = R() < .5 ? bz0 : bz1 - dz, az1 = az0 + dz;
        let st = floors[0] + R() * (floors[1] - floors[0]); if (R() < .08 * near) st += R() * Math.max(0, tall - floors[1]);
        const h = Math.max(4, st * tallness * (.6 + .4 * near) * 3.5 + R() * 3), col = pal[Math.floor(R() * pal.length)].clone().multiplyScalar(.8 + R() * .3);
        box(ax0, az0, ax1, az1, h, col);
      }
      // its street lights: at the block's corners
      if (cell < 300) for (const [lx, lz] of [[x0, z0], [x0 + cell / 2, z0], [x0, z0 + cell / 2]]) lamps.push(lx, lz, Math.hypot(lx - cx, lz - cz));
    };
    this.count = 0;
    // a grid of big squares round the middle, each cut up as finely as its ring wants (so the rings meet with no overlaps)
    const n = Math.ceil(reach / BIG);
    for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
      const X = cx + i * BIG, Z = cz + j * BIG, D = Math.hypot(X + BIG / 2 - cx, Z + BIG / 2 - cz);
      if (D >= reach) continue;
      const ring = FAR_RINGS.find(r => D < r[0]), cell = ring[1], m = BIG / cell;
      for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
        const x0 = X + a * cell, z0 = Z + b * cell, x1 = x0 + cell, z1 = z0 + cell;
        if (x1 > ox0 && x0 < ox1 && z1 > oz0 && z0 < oz1) continue;   // (the city's own blocks)
        if (wet && x1 > wet[0] && x0 < wet[1] && z1 > wet[2] && z0 < wet[3]) continue;   // (the harbour's water)
        block(x0, z0, cell, Math.hypot(x0 + cell / 2 - cx, z0 + cell / 2 - cz), ring);
      }
    }
    const { map, lit } = pictures();
    this.mat = new MeshStandardMaterial({ map, emissiveMap: lit, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: .85, metalness: .05, name: 'city far' });
    this.meshes = [];
    for (const s of slices) if (s.I.length) { const m = only(new Mesh(geometry(s.P, s.N, s.U, s.C, s.I), this.mat)); m.name = 'city far'; this.group.add(m); this.meshes.push(m); }
    // the blocks' streets: laid on the ground (pulled towards the camera, so they never fight it for the same pixels)
    this.padMat = new MeshStandardMaterial({ vertexColors: true, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, name: 'city far streets' });
    if (pads.I.length) {
      const N = []; for (let i = 0; i < pads.P.length / 3; i++) N.push(0, 1, 0);
      this.pads = only(new Mesh(geometry(pads.P, N, null, pads.C, pads.I), this.padMat)); this.pads.name = 'city far streets'; this.group.add(this.pads);
    } else this.pads = null;
    // the land round it all: a ring from where the city's own ground ends (a rectangle 3 km out from its blocks, or the far side
    // of the harbour's water), flat at first and then hills, out to `land` metres
    const Rx = (B.x1 - B.x0) / 2 + 3040, Rz0 = (B.z1 - B.z0) / 2 + 3040, Rz1 = water ? B.z1 + 3010 - cz : Rz0, A = 96, RN = 28, LP = [], LC = [], LI = [];
    const green = new Color('#56704a'), brown = new Color('#6e6a58'), far = new Color('#6f7d86'), hills0 = Math.max(reach, Math.max(Rx, Rz0) + 1500);
    for (let r = 0; r <= RN; r++) {
      const t = r / RN;
      for (let a = 0; a < A; a++) {
        const th = a / A * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th), edge = Math.min(Rx / Math.max(1e-6, Math.abs(c)), (sn > 0 ? Rz1 : Rz0) / Math.max(1e-6, Math.abs(sn)));
        const rad = edge + (Math.max(land, edge + 500) - edge) * t ** 1.6, x = cx + c * rad, z = cz + sn * rad;
        const hill = Math.min(1, Math.max(0, (rad - hills0) / 2500)), y = (t === 0 ? -2 : -.1) + hill * (80 + 520 * n01(x * .00035, z * .00035)) * (.6 + .4 * Math.sin(th * 3 + seed));
        LP.push(x, y, z); const col = green.clone().lerp(brown, n01(x * .002 + 9, z * .002)).lerp(far, Math.min(1, t * 1.2)); LC.push(col.r, col.g, col.b);
      }
    }
    for (let r = 0; r < RN; r++) for (let a = 0; a < A; a++) { const i = r * A + a, j = r * A + (a + 1) % A; LI.push(i, i + A, j, j, i + A, j + A); }
    const lg = geometry(LP, null, null, LC, LI); lg.computeVertexNormals();
    this.landMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, name: 'city far land' });
    this.land = only(new Mesh(lg, this.landMat)); this.land.name = 'city far land'; this.group.add(this.land);
    this.reach = Math.max(land, Math.max(Rx, Rz0, Rz1) + 500);
    const cam = view.cam; if (cam && cam.far < this.reach + 800) { cam.far = this.reach + 800; cam.updateProjectionMatrix(); }
    // the far street lights: one batch of dots, shown at night, fainter through the haze
    this.lamps = lamps; this.lampCount = lamps.length / 3;
    this.lights = this.lampCount && view.parts ? new Particles(view, { max: this.lampCount, additive: true }) : null;
    this.night = -1; this.haze = -1;
  }
  /** Each frame (it only does something when the night or the air changes): night 0..1. */
  update(night) {
    const v = this.view, haze = (v._air?.haze || 0) * 1e3 + (v.scene.fog?.density || 0);   // (one number for both, to see when either changes)
    if (Math.abs(night - this.night) < .01 && haze === this.haze) return;
    this.night = night; this.haze = haze; this.mat.emissiveIntensity = night * 1.1;
    const L = this.lights; if (!L) return;
    const a = Math.max(0, night - .15) / .85, air = v._air?.haze || 0, fog = v.scene.fog?.density || 0, S = this.lamps;
    L.clear();
    if (a > 0) for (let i = 0; i < S.length; i += 3) {
      const d = S[i + 2], k = a * Math.exp(-d * air) * Math.exp(-((d * fog) ** 2));
      if (k > .02) L.emit({ x: S[i], y: 7, z: S[i + 1], life: 1e9, size: (2.5 + d * .0018) * (.85 + (i % 7) * .05), col: [1, .78, .48], a: k });
    }
    L.update(0);
  }
  /** Triangles in the stand-ins, their streets and the land (for a test's numbers). */
  get triangles() { return [...this.meshes, this.pads, this.land].reduce((t, m) => t + (m ? m.geometry.index.count / 3 : 0), 0); }
  /** Draws it takes: the slices, the streets, the land and the lights. */
  get draws() { return this.meshes.length + (this.pads ? 1 : 0) + 1 + (this.lights?.n ? 1 : 0); }
  dispose() {
    this.group.removeFromParent(); for (const m of this.meshes) m.geometry.dispose(); this.pads?.geometry.dispose(); this.land.geometry.dispose();
    this.mat.dispose(); this.padMat.dispose(); this.landMat.dispose();
    this.lights?.dispose(); this.lights = null;
  }
}
