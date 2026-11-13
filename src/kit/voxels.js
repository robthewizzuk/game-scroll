// Voxel worlds: editable 3D block worlds for building, digging and crafting games (gs.voxels).
// Blocks live in chunks; changed chunks are meshed again (greedy meshing with corner shading, in a
// worker when the phone has one) and drawn with three's standard material, so they look the same on
// WebGL and WebGPU and take the scene's lights and shadows. Ray picks for "which block am I looking
// at", a box mover for walking characters that climbs nothing and falls, and a few world makers.
//
//   const { Voxels, BLOCKS } = gs.voxels;
//   reset() {
//     world = new Voxels({ size: [64, 32, 64] });            // blocks across, up, deep
//     world.generate({ seed: 'my-game', kind: 'hills' });
//     view.scene.add(world.group);
//     me = { x: 32, y: 20, z: 32, w: .6, h: 1.7, d: .6, vy: 0 };
//   }
//   update(dt) {
//     world.update();                                       // meshes changed chunks (a few a frame)
//     me.vy -= 25 * dt; const hit = world.move(me, vx * dt, me.vy * dt, vz * dt); if (hit.ground) me.vy = 0;
//   }
//   tap: const r = world.ray(eye, dir, 6); if (r) world.set(r.x, r.y, r.z, 0);            // dig
//                                          if (r) world.set(r.x + r.nx, r.y + r.ny, r.z + r.nz, BLOCKS.stone); // build
//
// Our own code: the JavaScript voxel engines are either unmaintained (voxel.js) or whole game
// engines of their own; what a game needs here is small.
import { timed } from './prof.js';
import * as THREE from 'three';
import { meshChunk } from './voxel-mesh.js';
import { rng, noise2, noise3 } from './math.js';

/** Ready-made blocks: id numbers for set() / fill(). Add your own with world.block(name, colour, { see }). */
export const BLOCKS = Object.freeze({ air: 0, grass: 1, dirt: 2, stone: 3, sand: 4, water: 5, wood: 6, leaves: 7, snow: 8, brick: 9, glass: 10, lava: 11, gold: 12, coal: 13, plank: 14, ice: 15 });
const LOOK = [
  null, ['#5fae3c'], ['#8a5a36'], ['#8b8f96'], ['#e2cf8a'], ['#3d7fd6', true], ['#7a5232'], ['#3f8f3a'], ['#f2f6fa'],
  ['#b04a3a'], ['#cfe8f2', true], ['#ff6a1a'], ['#f2c230'], ['#3a3a40'], ['#c4955a'], ['#a8d8f0', true],
];

let worker = null, workerOff = false, job = 0;
const waiting = new Map();
function meshWorker() {
  if (worker || workerOff || typeof Worker !== 'function') return worker;
  try {
    worker = new Worker(new URL('./voxel-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const w = waiting.get(e.data.job); if (w) { waiting.delete(e.data.job); w(e.data); } };
    worker.onerror = () => { workerOff = true; worker = null; for (const [, w] of waiting) w({ error: 'worker' }); waiting.clear(); };
  } catch { workerOff = true; worker = null; }
  return worker;
}

export class Voxels {
  /**
   * size: [x, y, z] in blocks (each rounded up to whole chunks). chunk: blocks along a chunk's side
   * (16 or 32). scale: game units per block. shadows: chunk meshes cast and take shadows.
   * worker: mesh in a background worker (default true where there is one).
   */
  constructor({ size = [64, 32, 64], chunk = 16, scale = 1, shadows = true, worker: useWorker = true, rough = .9 } = {}) {
    this.S = chunk; this.scale = scale; this.shadows = shadows; this.useWorker = useWorker;
    this.cx = Math.ceil(size[0] / chunk); this.cy = Math.ceil(size[1] / chunk); this.cz = Math.ceil(size[2] / chunk);
    this.w = this.cx * chunk; this.h = this.cy * chunk; this.d = this.cz * chunk;
    this.data = new Uint8Array(this.w * this.h * this.d);
    this.colors = new Float32Array(256 * 3); this.see = new Uint8Array(256); this.names = {};
    LOOK.forEach((l, id) => { if (l) this.setLook(id, l[0], { see: l[1] }); });
    for (const [n, id] of Object.entries(BLOCKS)) this.names[n] = id;
    this.next = LOOK.length;
    this.group = new THREE.Group(); this.group.scale.setScalar(scale); this.group.name = 'voxels';
    this.solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0 });
    this.clearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .15, metalness: 0, transparent: true, opacity: .62, depthWrite: false });
    this.meshes = new Map(); this.dirty = new Set(); this.busy = new Set(); this.version = new Map();
  }

  /** A new block type: world.block('crystal', '#a0f', { see: true }) -> its id. */
  block(name, color, { see = false } = {}) {
    if (this.next > 255) throw new Error('Voxels: at most 255 block types');
    const id = this.next++; this.names[name] = id; this.setLook(id, color, { see }); return id;
  }
  setLook(id, color, { see = false } = {}) {
    const c = new THREE.Color(color); this.colors.set([c.r, c.g, c.b], id * 3); this.see[id] = see ? 1 : 0;
    if (this.meshes) for (const k of this.meshes.keys()) this.dirty.add(k);
  }
  /** The id for a block name ('stone'), or the number itself. */
  id(b) { return typeof b === 'string' ? (this.names[b] ?? 0) : b | 0; }

  /* ---------- blocks ---------- */
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  get(x, y, z) { x = Math.floor(x); y = Math.floor(y); z = Math.floor(z); return this.inside(x, y, z) ? this.data[(z * this.h + y) * this.w + x] : 0; }
  /** Is there a solid block here (see-through ones like water and glass don't count)? */
  solid(x, y, z) { const b = this.get(x, y, z); return b > 0 && !this.see[b]; }
  set(x, y, z, b) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z); if (!this.inside(x, y, z)) return false;
    const i = (z * this.h + y) * this.w + x, id = this.id(b); if (this.data[i] === id) return false;
    this.data[i] = id; this.touch(x, y, z); return true;
  }
  touch(x, y, z) {   // the chunk, and its neighbours when the block sits on an edge (their shading changes)
    const S = this.S;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = Math.floor((x + dx) / S), b = Math.floor((y + dy) / S), c = Math.floor((z + dz) / S);
      if (a >= 0 && b >= 0 && c >= 0 && a < this.cx && b < this.cy && c < this.cz) this.dirty.add(a + ',' + b + ',' + c);
    }
  }
  /** Fills a box of blocks (corners included). */
  fill(x0, y0, z0, x1, y1, z1, b) {
    const id = this.id(b);
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, id);
    return this;
  }
  /** A ball of blocks; b = 0 (air) digs a hole, a blast. Returns how many blocks changed and which ids went. */
  sphere(cx, cy, cz, r, b = 0) {
    const id = this.id(b), gone = {}; let n = 0;
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 + (z + .5 - cz) ** 2 > r * r) continue;
      const was = this.get(x, y, z); if (this.set(x, y, z, id)) { n++; if (was) gone[was] = (gone[was] || 0) + 1; }
    }
    return { changed: n, gone };
  }
  /** The y of the highest solid block at (x, z), or -1. */
  top(x, z) { for (let y = this.h - 1; y >= 0; y--) if (this.solid(x, y, z)) return y; return -1; }

  /* ---------- making worlds ---------- */
  /**
   * generate({ seed, kind, ground, hills, water, trees, caves }): kind 'hills' (grass, dirt, stone,
   * sandy shores, water, trees), 'flat' (a building floor), 'island' (hills sinking into the sea)
   * or 'caves' (hills with tunnels and ore underneath). ground: base height (blocks), hills: how
   * high hills go, water: sea level (-1 none), trees: about how many per 100 blocks of grass.
   */
  generate({ seed = 1, kind = 'hills', ground = Math.floor(this.h * .3), hills = Math.floor(this.h * .3), water = Math.floor(this.h * .3), trees = 1.2, caves = kind === 'caves' } = {}) {
    this.data.fill(0);
    const r = rng(seed), o = r() * 1000, B = BLOCKS;
    if (kind === 'flat') { this.fill(0, 0, 0, this.w - 1, Math.max(0, ground - 1), this.d - 1, B.stone); this.fill(0, ground, 0, this.w - 1, ground, this.d - 1, B.grass); this.dirtyAll(); return this; }
    for (let z = 0; z < this.d; z++) for (let x = 0; x < this.w; x++) {
      let n = (noise2(x * .02 + o, z * .02) * .65 + noise2(x * .06 + o, z * .06 + 50) * .25 + noise2(x * .15, z * .15 + o) * .1) * .5 + .5;
      if (kind === 'island') { const dx = x / this.w - .5, dz = z / this.d - .5; n = n * .6 + .55; n *= Math.max(0, 1 - Math.hypot(dx, dz) * 1.9); }
      const hgt = Math.min(this.h - 8, Math.floor(kind === 'island' ? ground * .3 + n * (hills + ground) : ground + n * hills));
      for (let y = 0; y <= hgt; y++) {
        let b = y === hgt ? (hgt <= water + 1 ? B.sand : hgt > this.h * .75 ? B.snow : B.grass) : y > hgt - 4 ? (hgt <= water + 1 ? B.sand : B.dirt) : B.stone;
        if (caves && y < hgt - 3 && y > 1 && noise3(x * .08, y * .12, z * .08 + o) > .45) b = 0;
        else if (b === B.stone && noise3(x * .2 + o, y * .2, z * .2) > .7) b = y < ground * .5 && r() < .3 ? B.gold : B.coal;
        if (b) this.data[(z * this.h + y) * this.w + x] = b;
      }
      for (let y = hgt + 1; y <= water; y++) this.data[(z * this.h + y) * this.w + x] = B.water;
    }
    if (trees > 0) {
      const n = Math.round(this.w * this.d / 100 * trees * .3);
      for (let i = 0; i < n; i++) {
        const x = r.int(2, this.w - 3), z = r.int(2, this.d - 3), y = this.top(x, z);
        if (y > 0 && this.get(x, y, z) === B.grass && y + 7 < this.h) this.tree(x, y + 1, z, r.int(3, 5));
      }
    }
    this.dirtyAll();
    return this;
  }
  /** A tree: a trunk `height` blocks tall with a round crown of leaves. */
  tree(x, y, z, height = 4) {
    for (let k = 0; k < height; k++) this.set(x, y + k, z, BLOCKS.wood);
    const top = y + height;
    for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++)
      if (dx * dx + dz * dz + dy * dy * 2 <= 5 && !this.get(x + dx, top + dy, z + dz)) this.set(x + dx, top + dy, z + dz, BLOCKS.leaves);
    return this;
  }
  dirtyAll() { for (let a = 0; a < this.cx; a++) for (let b = 0; b < this.cy; b++) for (let c = 0; c < this.cz; c++) this.dirty.add(a + ',' + b + ',' + c); }

  /* ---------- meshing ---------- */
  /**
   * Meshes changed chunks: call every update. limit: chunks started this call (the worker does them
   * in the background; on the main thread each takes a millisecond or two). Returns how many are left.
   */
  update(limit = 4) {
    let n = 0;
    for (const key of this.dirty) {
      if (n >= limit) break;
      if (this.busy.has(key)) continue;
      this.dirty.delete(key); n++; this.remesh(key);
    }
    return this.dirty.size + this.busy.size;
  }
  /** Meshes every chunk right now (on this thread): after generate(), before the first frame. */
  build() { for (const key of [...this.dirty]) { this.dirty.delete(key); this.remesh(key, true); } return this; }
  get meshing() { return this.dirty.size + this.busy.size; }

  remesh(key, now = false) {
    const [a, b, c] = key.split(',').map(Number), S = this.S, P = S + 2, ox = a * S, oy = b * S, oz = c * S;
    const data = new Uint8Array(P * P * P);
    let any = false;
    for (let z = -1; z <= S; z++) for (let y = -1; y <= S; y++) {
      const gy = oy + y, gz = oz + z; if (gy < 0 || gz < 0 || gy >= this.h || gz >= this.d) continue;
      const row = (gz * this.h + gy) * this.w, out = ((z + 1) * P + (y + 1)) * P;
      for (let x = -1; x <= S; x++) { const gx = ox + x; if (gx < 0 || gx >= this.w) continue; const v = this.data[row + gx]; data[out + x + 1] = v; if (v && x >= 0 && x < S && y >= 0 && y < S && z >= 0 && z < S) any = true; }
    }
    const ver = (this.version.get(key) || 0) + 1; this.version.set(key, ver);
    if (!any) { this.place(key, { solid: null, clear: null }, ox, oy, oz); return; }
    const info = { S, colors: this.colors, see: this.see, ox, oy, oz };
    const w = !now && this.useWorker ? meshWorker() : null;
    if (!w) { this.place(key, meshChunk(data, info), ox, oy, oz); return; }
    const id = ++job; this.busy.add(key);
    waiting.set(id, res => {
      this.busy.delete(key);
      if (this.disposed) return;
      if (res.error) { this.place(key, meshChunk(data, info), ox, oy, oz); return; }
      if (this.version.get(key) === ver) this.place(key, res.mesh, ox, oy, oz);
    });
    w.postMessage({ job: id, data, info: { ...info, colors: this.colors.slice(), see: this.see.slice() } }, [data.buffer]);
  }
  place(key, m, ox, oy, oz) {
    const old = this.meshes.get(key) || [];
    for (const o of old) { this.group.remove(o); o.geometry.dispose(); }
    const now = [];
    for (const [g, mat] of [[m.solid, this.solidMat], [m.clear, this.clearMat]]) {
      if (!g) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3)); geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(ox, oy, oz); mesh.name = 'chunk ' + key;
      mesh.castShadow = this.shadows && mat === this.solidMat; mesh.receiveShadow = this.shadows; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (mat === this.clearMat) mesh.renderOrder = 1;
      this.group.add(mesh); now.push(mesh);
    }
    this.meshes.set(key, now);
    this.changed = (this.changed || 0) + 1;   // for games that bake shadows or light: something moved
  }

  /* ---------- looking and moving ---------- */
  /**
   * The first block a ray hits: from (game units, the world's own space) along dir, up to `far`
   * blocks. -> { x, y, z (the block), id, nx, ny, nz (the face it hit: add to place a block there),
   * dist } or null. solidOnly: pass through see-through blocks (water).
   */
  ray(from, dir, far = 8, { solidOnly = false } = {}) {
    const s = this.scale, ox = from.x / s, oy = from.y / s, oz = from.z / s, len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / len, dy = dir.y / len, dz = dir.z / len;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
    let tx = dx ? ((sx > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity, ty = dy ? ((sy > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity, tz = dz ? ((sz > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 512 && t <= far; i++) {
      const b = this.get(x, y, z);
      if (b && (!solidOnly || !this.see[b]) && i > 0 || b && i === 0 && !this.see[b]) return { x, y, z, id: b, nx, ny, nz, dist: t * s };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; ny = -sy; nx = nz = 0; }
      else { z += sz; t = tz; tz += tdz; nz = -sz; nx = ny = 0; }
    }
    return null;
  }
  /**
   * Moves a box through the blocks without going into them: box { x, z (middle), y (feet), w, h, d }
   * in blocks... or game units when scale isn't 1. Changes box.x/y/z. -> { x, y, z (true where it
   * was stopped on that axis), ground (standing on a block), inWater }. step: blocks it may step up
   * (0.5 walks onto half steps; 1 hops onto single blocks like an auto-jump).
   */
  move(box, dx, dy, dz, { step = 0 } = {}) {
    const s = this.scale, hit = { x: false, y: false, z: false, ground: false, inWater: false };
    const b = { x: box.x / s, y: box.y / s, z: box.z / s, w: (box.w ?? .6) / s, h: (box.h ?? 1.7) / s, d: (box.d ?? box.w ?? .6) / s };
    const blocked = () => {
      for (let z = Math.floor(b.z - b.d / 2); z <= Math.floor(b.z + b.d / 2 - 1e-6); z++)
        for (let y = Math.floor(b.y); y <= Math.floor(b.y + b.h - 1e-6); y++)
          for (let x = Math.floor(b.x - b.w / 2); x <= Math.floor(b.x + b.w / 2 - 1e-6); x++) if (this.solid(x, y, z)) return true;
      return false;
    };
    const half = { x: b.w / 2, z: b.d / 2 };
    const axis = (k, amount) => {
      const n = Math.max(1, Math.ceil(Math.abs(amount) / .25)), each = amount / n;
      for (let i = 0; i < n; i++) {
        const was = b[k]; b[k] += each;
        if (!blocked()) continue;
        if (k !== 'y' && step > 0) { b.y += step; if (!blocked()) continue; b.y -= step; }   // walk up a low step
        // stop right against the block
        if (k === 'y') b.y = each < 0 ? Math.floor(b.y) + 1 : Math.floor(b.y + b.h) - b.h - 1e-4;
        else b[k] = each > 0 ? Math.floor(b[k] + half[k]) - half[k] - 1e-4 : Math.floor(b[k] - half[k]) + 1 + half[k] + 1e-4;
        if (blocked()) b[k] = was;
        if (k === 'y' && each < 0) hit.ground = true;
        hit[k] = true; break;
      }
    };
    axis('y', dy / s); axis('x', dx / s); axis('z', dz / s);
    if (!hit.ground) { b.y -= .02; hit.ground = blocked(); b.y += .02; }
    const feet = this.get(b.x, b.y + .1, b.z); hit.inWater = !!feet && !!this.see[feet] && feet === BLOCKS.water;
    box.x = b.x * s; box.y = b.y * s; box.z = b.z * s;
    return hit;
  }

  /* ---------- saving ---------- */
  /** The whole world as a short string (runs of the same block), for api.save() in small worlds or sharing. */
  pack() {
    const out = []; let run = 1, last = this.data[0];
    for (let i = 1; i <= this.data.length; i++) {
      const v = i < this.data.length ? this.data[i] : -1;
      if (v === last && run < 4095) { run++; continue; }
      out.push((run > 1 ? run.toString(36) + ':' : '') + last.toString(36)); last = v; run = 1;
    }
    return out.join(',');
  }
  /** Puts back a world from pack() (the same size). */
  unpack(text) {
    let i = 0;
    for (const part of String(text).split(',')) {
      const [a, b] = part.includes(':') ? part.split(':') : ['1', part];
      const n = parseInt(a, 36), v = parseInt(b, 36); this.data.fill(v, i, i + n); i += n;
    }
    this.dirtyAll(); return this;
  }

  /** Frees the meshes (the world can't be used afterwards). */
  dispose() {
    this.disposed = true;
    for (const list of this.meshes.values()) for (const o of list) { this.group.remove(o); o.geometry.dispose(); }
    this.meshes.clear(); this.solidMat.dispose(); this.clearMat.dispose();
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Voxels.prototype, 'update', 'voxels');
