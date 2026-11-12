// What the sky can see. For each half metre of the world round the camera, the height of the highest solid
// thing over it: a roof, a bridge, a tree's trunk, the ground. Rain and snow stop there, and only what lies
// at that height gets wet or snowed on, so the floor of a house stays dry and a porch keeps a dry strip
// along its wall. gs.sky.Weather makes one when it is given the level; other kits read it (footprints in
// snow, a sound of rain on a roof overhead):
//
//   cover.at(x, z)          the height of the highest thing over that spot (-Infinity where it does not know)
//   cover.open(x, y, z)     can the sky see this point
//
// It is plain numbers on a grid that follows its centre a whole cell at a time (a cell's answer never moves
// in memory: the grid wraps round), filled a few hundred rays a frame from the centre outwards and looked
// over again every few seconds, so a roof that is blown off lets the rain in. The same numbers go to the
// graphics chip as one small picture. Kit use only: games reach it as weather.cover.
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, Raycaster, RedFormat, RepeatWrapping, Vector3 } from 'three';
import { caster } from './acoustics.js';

const LOW = -1000, DOWN = { x: 0, y: -1, z: 0 };
const mod = (a, n) => ((a % n) + n) % n;

/**
 * level: what stands in the weather: a gs.physics3d World3D, a City, Voxels, a function (from, dir, max) =>
 * metres to the first solid thing, three.js meshes or groups (their triangles are asked: keep those few),
 * or a list of any of these. ground: (x, z) => the height of the land (land.height), for land that is not
 * in the level. cells (128) of cell metres (.5): the square it knows, round its centre. rise, drop: how far
 * above and below the centre it looks (80 m each). rays: how many spots it asks about each update at most
 * (400); ms: and for how long at most (1.5); again: how many it asks again each update (48: the whole
 * square in about six seconds).
 */
export class Cover {
  constructor({ level = null, ground = null, cells = 128, cell = .5, rise = 80, drop = 80, rays = 400, ms = 1.5, again = 48 } = {}) {
    const N = this.N = Math.max(16, Math.min(512, Math.round(cells / 2) * 2)); this.cell = cell; this.span = N * cell;   // (an even number: it fills in rings round the middle)
    Object.assign(this, { ground, rise, drop, rays, ms, again });
    const list = level && level !== true ? [].concat(level) : [], things = list.filter(l => l?.isObject3D), rest = list.filter(l => !l?.isObject3D);
    this.cast = rest.length ? caster(rest) : null; this.things = things.length ? things : null;
    this.H = new Float32Array(N * N).fill(LOW);
    this.ix = NaN; this.iz = NaN; this.y = 0; this.todo = []; this.next = 0; this.left = 0; this.dirty = false; this.asked = 0;
    this.pix = new Uint16Array(N * N).fill(DataUtils.toHalfFloat(LOW));
    const t = this.texture = new DataTexture(this.pix, N, N, RedFormat, HalfFloatType); t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = t.minFilter = LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
    this.from = { x: 0, y: 0, z: 0 };
  }
  /** The middle of the square it knows, and how far from it the answers reach (metres). */
  get cx() { return (this.ix + this.N / 2) * this.cell; }
  get cz() { return (this.iz + this.N / 2) * this.cell; }
  get reach() { return this.span / 2 - this.cell; }
  /** True once every spot in the square has been asked about. */
  get ready() { return this.left === 0 && this.ix === this.ix; }
  // the highest thing over one spot
  probe(x, z) {
    const top = this.y + this.rise, far = this.rise + this.drop; let h = LOW;
    if (this.cast) { const f = this.from; f.x = x; f.y = top; f.z = z; const d = this.cast(f, DOWN, far); if (d < far) h = top - d; }
    if (this.things) {
      const rc = this.rc ||= new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, far); rc.far = far; rc.ray.origin.set(x, top, z);
      const hit = rc.intersectObjects(this.things, true)[0]; if (hit && hit.point.y > h) h = hit.point.y;
    }
    if (this.ground) { const g = this.ground(x, z); if (g > h) h = g; }
    this.asked++;
    return h;
  }
  set(wi, wj, h) {
    const N = this.N, c = mod(wj, N) * N + mod(wi, N);
    if (Math.abs(this.H[c] - h) < .02) return false;
    this.H[c] = h; this.pix[c] = DataUtils.toHalfFloat(h); this.dirty = true; return true;
  }
  // a box of cells (world cell numbers, i1 and j1 not included) to ask about, soonest first if `first`
  queue(i0, i1, j0, j1, first = false) { if (i1 <= i0 || j1 <= j0) return; const b = { i0, i1, j0, j1, i: i0, j: j0 }; this.left += (i1 - i0) * (j1 - j0); if (first) this.todo.unshift(b); else this.todo.push(b); }
  /** Keeps the square round a point (the camera): a whole cell at a time, so what it knows stays put. */
  place(x, y, z) {
    const N = this.N, ix = Math.round(x / this.cell - N / 2), iz = Math.round(z / this.cell - N / 2); this.y = y;
    if (ix === this.ix && iz === this.iz) return this;
    const di = ix - this.ix, dj = iz - this.iz, ox = this.ix, oz = this.iz; this.ix = ix; this.iz = iz;
    const unknown = (i0, i1, j0, j1) => { for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const c = mod(j, N) * N + mod(i, N); if (this.H[c] !== LOW) { this.H[c] = LOW; this.pix[c] = DataUtils.toHalfFloat(LOW); this.dirty = true; } } };
    if (!(Math.abs(di) < N && Math.abs(dj) < N)) {
      // somewhere new: nothing is known, and it is asked in rings from the middle outwards
      this.todo.length = 0; this.left = 0; unknown(ix, ix + N, iz, iz + N);
      const m = N >> 1;
      for (let r = 0; r < m; r++) { const a = ix + m - 1 - r, b = ix + m + 1 + r, c = iz + m - 1 - r, d = iz + m + 1 + r; this.queue(a, b, c, c + 1); this.queue(a, b, d - 1, d); this.queue(a, a + 1, c + 1, d - 1); this.queue(b - 1, b, c + 1, d - 1); }
      return this;
    }
    // the strips that came into the square are not known yet: they are asked about before anything else
    if (di > 0) { unknown(ox + N, ix + N, iz, iz + N); this.queue(ox + N, ix + N, iz, iz + N, true); } else if (di < 0) { unknown(ix, ox, iz, iz + N); this.queue(ix, ox, iz, iz + N, true); }
    if (dj > 0) { unknown(ix, ix + N, oz + N, iz + N); this.queue(ix, ix + N, oz + N, iz + N, true); } else if (dj < 0) { unknown(ix, ix + N, iz, oz); this.queue(ix, ix + N, iz, oz, true); }
    return this;
  }
  /** Each frame: asks about a few hundred spots it does not know yet, and a few it does (things change). all: every spot now (while loading). */
  update(all = false) {
    if (this.ix !== this.ix) return this;
    const N = this.N, cell = this.cell, ix = this.ix, iz = this.iz, t0 = all ? 0 : performance.now(); let n = all ? Infinity : this.rays;
    while (this.todo.length && n > 0) {
      const b = this.todo[0];
      while (n > 0 && b.j < b.j1) {
        const i = b.i, j = b.j; if (++b.i >= b.i1) { b.i = b.i0; b.j++; } this.left--;
        if (i < ix || i >= ix + N || j < iz || j >= iz + N) continue;   // (it left the square before its turn came)
        this.set(i, j, this.probe((i + .5) * cell, (j + .5) * cell)); n--;
        if (!all && (n & 31) === 0 && performance.now() - t0 > this.ms) n = 0;
      }
      if (b.j >= b.j1) this.todo.shift();
    }
    // and a few it knows already, in turn: a roof that came down, a door that opened
    if (!this.todo.length) for (let q = all ? 0 : this.again; q > 0; q--) { const k = this.next; this.next = (k + 1) % (N * N); const i = ix + k % N, j = iz + ((k / N) | 0); this.set(i, j, this.probe((i + .5) * cell, (j + .5) * cell)); }
    if (this.dirty) { this.dirty = false; this.texture.needsUpdate = true; }
    return this;
  }
  /** Asks again about everything within r metres of a point at the next updates (you changed the level there). */
  touch(x, z, r = 4) { const c = this.cell, N = this.N; this.queue(Math.max(this.ix, Math.floor((x - r) / c)), Math.min(this.ix + N, Math.ceil((x + r) / c)), Math.max(this.iz, Math.floor((z - r) / c)), Math.min(this.iz + N, Math.ceil((z + r) / c)), true); return this; }
  /** The height of the highest thing over x, z: -Infinity where it does not know (outside its square, or not asked yet). */
  at(x, z) {
    const N = this.N, i = Math.floor(x / this.cell), j = Math.floor(z / this.cell);
    if (!(i >= this.ix && i < this.ix + N && j >= this.iz && j < this.iz + N)) return -Infinity;
    const h = this.H[mod(j, N) * N + mod(i, N)]; return h <= LOW ? -Infinity : h;
  }
  /** Can the sky see this point: is nothing over it. slack: how far under the highest thing still counts (.3 m). */
  open(x, y, z, slack = .3) { return y >= this.at(x, z) - slack; }
  dispose() { this.texture.dispose(); }
}
