// Big worlds in parts (gs.regions): a world too big to build before play, or levels a game should only
// build once the player picks them. Each part is made a little each frame while it is wanted, and let go
// of (its meshes, their geometry and pictures, its physics bodies, whatever it kept) when it isn't.
//
//   const { Regions } = gs.regions;
//   const regions = new Regions(view, { world });                  // world: a gs.physics3d.World3D, if the parts have bodies
//   regions.part('docks', function* (r) {                           // a named part: a level, a district, the inside of a house
//     view.scene.add(crane());                                       // what it adds to the scene, the bodies it makes in the world
//     yield;                                                        // and what it hands r.keep() are its own, freed with it
//     for (const p of spots) { r.add(prop('crate'), p); yield; }     // yield between pieces: the rest waits for the next frame
//   });
//   regions.want('docks');            // build it (in make() or reset(): at once, under the loading screen); others are let go of
//   regions.has('docks')              // made yet?
//   regions.cells({ size: 64, reach: 2, make: function* (r) { ... r.x0, r.z0, r.size, r.seed ... } })   // squares round the player
//   regions.land({ height: (x, z) => ..., size: 64, reach: 6, material, solid: 1 })   // ground in tiles, finer close by, solid near
//   regions.update(dt, player.position)   // each frame (where the player is: the camera if left out)
//
// A part's make(r) is a plain function (made in one go) or a generator function that yields between pieces;
// `yield r.wait(promise)` waits for background work (human.ready(looks), say) and hands back its answer. Made
// inside make() or reset() it is made at once (the card's loading screen covers it); after that it is made in
// the frame's spare time, budget milliseconds a frame (nearest cells first, those in front before those behind).
// What belongs to a part: everything it adds to the top of the scene (or to r.add's parent), bodies made in
// `world` while it runs, and r.keep(thing) (anything with dispose(), stop() or remove(), or a function). The
// geometry and pictures made while it runs are freed with it once nothing else in the scene uses them;
// materials are kept (making one again builds its shader: a stall). A part let go of while being made stops.
// Short of memory (the app's memory guard), parts kept for later are let go of and cells reach less far.
// Kit file: games reach it as gs.regions.
import { BufferGeometry, Texture, BufferAttribute, Mesh, MeshStandardMaterial, Color, Vector3 } from 'three';
import { currentOwner } from './cleanup.js';
import { StillLoading } from './lazy.js';
import { loading as passLoading } from './slices.js';
import { onMemory, memory } from './memory.js';
import { timed } from './prof.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// ids three hands out in order: a probe's id says where the count stands, so what a part made is what was born between
const geoId = () => new BufferGeometry().id;
const texId = () => new Texture().id;
const hash = (a, b, s) => { let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(s | 0, 83492791)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return (h ^ (h >>> 13)) >>> 0; };
const WAIT = Symbol('wait');

// one part being made or made: what it owns, and the generator still making it
class Piece {
  constructor(regions, key, make, info) {
    Object.assign(this, { regions, key, make, info });
    this.objects = []; this.bodies = []; this.kept = []; this.drops = []; this.geo = []; this.tex = [];
    this.gen = null; this.done = false; this.failed = null; this.waiting = null; this.answer = undefined; this.started = false; this.ms = 0; this.at = 0;
  }
}
// what a part's make(r) is handed
class Builder {
  constructor(piece) { this._p = piece; Object.assign(this, piece.info); }
  /** Adds obj to parent (the scene by default), at { x, y, z } if given; it is this part's own. */
  add(obj, at = null, parent = null) {
    if (at) obj.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0);
    (parent || this._p.regions.view.scene).add(obj); if (parent) this._p.objects.push(obj); return obj;
  }
  /** Anything to free with this part: a thing with dispose(), stop() or remove() (a loop, a crowd, a body), or a function. */
  keep(thing) { if (thing) this._p.kept.push(thing); return thing; }
  /** fn() runs when this part is let go of. */
  on(fn) { this._p.drops.push(fn); return this; }
  /** yield r.wait(promise): this part goes on once the promise settles, with its answer. */
  wait(promise) { return { [WAIT]: Promise.resolve(promise) }; }
}

export class Regions {
  /**
   * view: the 3D view (its scene; its camera is where the player is unless update() is told).
   * world: a gs.physics3d.World3D the parts make bodies in. budget: milliseconds of a frame to build in.
   * keep: how many named parts no longer wanted to keep for later while memory is fine (0: let go of at once).
   */
  constructor(view, { world = null, budget = 3, keep = 1 } = {}) {
    Object.assign(this, { view, world, budget, keepN: keep });
    this.parts = new Map();      // name -> { make, piece }
    this.wanted = new Set();
    this.layers = [];            // cells() and land() grids
    this.spare = [];             // names no longer wanted, kept for later (oldest first)
    this.at = { x: 0, y: 0, z: 0 }; this.look = { x: 0, z: -1 };
    this.frameMs = 0; this.made = 0; this.dropped = 0;
    // (held weakly: a loading pass on a copy of the game that is thrown away mustn't keep its world alive here)
    const me = typeof WeakRef === 'function' ? new WeakRef(this) : { deref: () => this };
    const off = this.offMem = onMemory(level => { const r = me.deref(); if (!r) return off(); if (level >= 1) r.trim(0); });
  }

  /* ---------- named parts ---------- */
  /** A named part: make(r) builds it (a plain function, or a generator function that yields between pieces). */
  part(name, make) {
    const had = this.parts.get(name);
    if (had?.piece) this.free(had.piece);
    this.parts.set(name, { make, piece: null });
    if (this.wanted.has(name)) this.start(name);
    return this;
  }
  /** These parts are wanted (and no others): what isn't is let go of, or kept for later (keep). Inside make() or reset() they're made at once. */
  want(...names) {
    names = names.flat().filter(n => n != null);
    for (const n of names) if (!this.parts.has(n)) throw new Error(`gs.regions: no part called '${n}' (regions.part('${n}', make) first)`);
    const next = new Set(names);
    for (const n of this.wanted) if (!next.has(n)) {
      const p = this.parts.get(n).piece; if (!p) continue;
      if (!p.done) { this.free(p); this.parts.get(n).piece = null; } else { this.spare = this.spare.filter(s => s !== n); this.spare.push(n); }
    }
    this.wanted = next; this.spare = this.spare.filter(s => !next.has(s));
    for (const n of names) this.start(n);
    this.trim();
    if (currentOwner() || passLoading()) for (const n of names) this.finish(this.parts.get(n).piece);   // (in make() / reset(): made now)
    return this;
  }
  /** Is this part made (or this cell's square, for has(x, z))? */
  has(name, z) {
    if (typeof name === 'number') { for (const L of this.layers) { const c = L.live.get(L.keyAt(name, z)); if (!c?.piece.done) return false; } return true; }
    return !!this.parts.get(name)?.piece?.done;
  }
  /** Every wanted part made, and every cell within one square of the player. */
  get ready() {
    for (const n of this.wanted) if (!this.has(n)) return false;
    for (const L of this.layers) for (const c of L.live.values()) if (c.ring <= 1 && !c.piece.done && !c.piece.failed) return false;
    return true;
  }
  /** 0..1: how much of what is wanted is made. */
  get progress() {
    let all = 0, done = 0;
    for (const n of this.wanted) { all++; if (this.has(n)) done++; }
    for (const L of this.layers) for (const c of L.live.values()) { all++; if (c.piece.done) done++; }
    return all ? done / all : 1;
  }
  start(name) {
    const e = this.parts.get(name); if (e.piece) return e.piece;
    return (e.piece = new Piece(this, name, e.make, { name }));
  }
  // let go of named parts kept for later: down to n (default: the keep count while memory is fine, else none)
  trim(n = memory.level >= 1 ? 0 : this.keepN) {
    while (this.spare.length > n) { const name = this.spare.shift(), e = this.parts.get(name); if (e?.piece) { this.free(e.piece); e.piece = null; } }
  }

  /* ---------- squares round the player ---------- */
  /**
   * Squares of the world round the player: make(r) builds one (r.cx, r.cz its number, r.x0, r.z0 its corner,
   * r.size, r.seed for the same look every time, r.ring how many squares out). Made nearest first within reach
   * squares, let go of beyond reach + 1. level(ring): a detail level by distance; a square whose level changes
   * is made again, and the old one stays until the new one is in. Returns the layer (clear(), count).
   */
  cells({ size = 64, reach = 2, make, level = null, seed = 0 } = {}) {
    if (typeof make !== 'function') throw new Error('gs.regions.cells: make(r) builds one square');
    const L = new Layer(this, { size, reach, make, level, seed }); this.layers.push(L); return L;
  }
  /**
   * Ground in tiles from a height function (x, z in metres -> height): finer close by (segments for the
   * nearest, halved each ring out to 4), solid in a gs.physics3d world within `solid` squares, with skirts so
   * coarse and fine tiles meet without gaps. colour(x, y, z, slope) -> '#rrggbb' or a Color paints it (else
   * material's own colour). Every tile shares material. Returns the layer; land.height(x, z) is the ground.
   */
  land({ height, size = 64, reach = 4, segments = 32, solid = 1, material = null, colour = null, skirt = null, shadows = true, seed = 0 } = {}) {
    if (typeof height !== 'function') throw new Error('gs.regions.land: height(x, z) gives the ground');
    const mat = material || new MeshStandardMaterial({ color: '#ffffff', roughness: .95, vertexColors: !!colour });
    const levels = Math.max(1, Math.round(Math.log2(segments / 4)) + 1);
    const L = this.cells({
      size, reach, seed, level: ring => Math.min(levels - 1, Math.max(0, ring - 1)),
      make: r => tile(this, r, { height, segments: Math.max(4, segments >> r.level), solid: r.ring <= solid && r.level === 0, mat, colour, skirt, shadows }),
    });
    L.height = height; L.material = mat;
    return L;
  }

  /* ---------- each frame ---------- */
  /** Builds a little of what is wanted (budget milliseconds) and lets go of what is behind. at: where the player is. */
  update(dt = 0, at = null) {
    const cam = this.view?.cam;
    const p = at || cam?.position; if (p) { this.at.x = p.x; this.at.y = p.y ?? 0; this.at.z = p.z ?? p.y ?? 0; }
    if (cam?.getWorldDirection) { const d = cam.getWorldDirection(_dir); const l = Math.hypot(d.x, d.z) || 1; this.look.x = d.x / l; this.look.z = d.z / l; }
    const shrink = memory.level >= 3 ? 2 : memory.level >= 2 ? 1 : 0;
    for (const L of this.layers) L.update(shrink);
    // what to work on: wanted parts first, then cells by ring (in front first)
    const t0 = now(), queue = [];
    for (const n of this.wanted) { const pc = this.parts.get(n).piece; if (pc && !pc.done && !pc.failed && !pc.waiting) queue.push([-1, pc]); }
    for (const L of this.layers) for (const c of L.live.values()) if (!c.piece.done && !c.piece.failed && !c.piece.waiting) queue.push([c.order, c.piece]);
    queue.sort((a, b) => a[0] - b[0]);
    let first = true;   // (at least one step a frame, however small the budget)
    for (const [, pc] of queue) {
      if (!first && now() - t0 >= this.budget) break;
      while (!pc.done && !pc.failed && !pc.waiting && (first || now() - t0 < this.budget)) { this.step(pc); first = false; }
      if (pc.done) for (const L of this.layers) L.landed(pc);
    }
    this.frameMs = now() - t0;
    return this;
  }
  // one go of a part's make: runs it (or its generator to the next yield), and notes what it made
  step(pc) {
    const R = this.view.scene, before = new Set(R.children), W = this.world, nb = W ? count(W) : 0, g0 = geoId(), t0 = texId(), T = now();
    let late = null;
    try {
      if (!pc.started) {
        pc.started = true; const out = pc.make(new Builder(pc));
        if (out && typeof out.next === 'function') pc.gen = out; else pc.done = true;
      }
      if (pc.gen) {
        const ans = pc.answer; pc.answer = undefined;
        const s = pc.gen.next(ans);
        if (s.done) pc.done = true;
        else if (s.value && s.value[WAIT]) {
          const pr = s.value[WAIT]; pc.waiting = pr;
          pr.then(v => { if (pc.waiting === pr) { pc.waiting = null; pc.answer = v; } }, e => { if (pc.waiting === pr) { pc.waiting = null; pc.failed = e; console.warn('[gs.regions]', pc.key, e); } });
        }
      }
    } catch (e) {
      if (e instanceof StillLoading) {   // (a lazy library or a sculpt asked for inside make(): it starts again once that is in)
        late = e;
      } else { pc.failed = e; console.warn('[gs.regions] making', pc.key, 'failed:', e); }
    } finally {
      pc.ms += now() - T;
      for (const o of R.children) if (!before.has(o) && o !== this.view.cam) pc.objects.push(o);
      pc.geo.push(g0, geoId()); pc.tex.push(t0, texId());
      if (W && count(W) !== nb) for (const b of newBodies(W, nb)) pc.bodies.push(b);
    }
    if (late) {
      // what it made so far is let go of and it starts again from the top once the library or sculpt is in:
      // inside make() / reset() the app's loading screen waits for it, in play the part waits
      this.free(pc, false); pc.started = false;
      if (currentOwner() || passLoading()) throw late;
      const pr = Promise.resolve(late.kitLoading); pc.waiting = pr;
      pr.then(() => { if (pc.waiting === pr) pc.waiting = null; }, e => { if (pc.waiting === pr) { pc.waiting = null; pc.failed = e; } });
    }
    if (pc.done) { this.made++; pc.at = now(); }
  }
  // make a part now, to the end (in make() / reset(): a part waiting on background work hands the app its promise)
  finish(pc) {
    let n = 0;
    while (pc && !pc.done && !pc.failed && n++ < 1e6) {
      if (pc.waiting) throw new StillLoading('gs.regions', pc.waiting);
      this.step(pc);
    }
  }
  // let go of a part: off the scene, its bodies out of the world, its own geometry and pictures freed
  free(pc, counted = true) {
    try { pc.gen?.return?.(); } catch (_) { /* a generator that was running */ }
    pc.gen = null; pc.done = false; pc.waiting = null;
    for (const fn of pc.drops) try { fn(); } catch (e) { console.warn('[gs.regions]', e); }
    for (const k of pc.kept) try { if (typeof k === 'function') k(); else if (k.dispose) k.dispose(); else if (k.stop) k.stop(); else if (k.remove) k.remove(); } catch (e) { console.warn('[gs.regions]', e); }
    if (this.world) for (const b of pc.bodies) try { this.world.remove(b); } catch (_) { /* already gone */ }
    const born = (id, list) => { for (let i = 0; i < list.length; i += 2) if (id > list[i] && id < list[i + 1]) return true; return false; };
    const geos = new Set(), texs = new Set();
    for (const o of pc.objects) {
      o.removeFromParent();
      o.traverse(m => {
        if (m.geometry && born(m.geometry.id, pc.geo)) geos.add(m.geometry);
        for (const mt of [].concat(m.material || [])) for (const k in mt) { const t = mt[k]; if (t?.isTexture && born(t.id, pc.tex)) texs.add(t); }
      });
    }
    if (geos.size || texs.size) {   // (not while something still in the scene uses them: a shared rock, a material another part made)
      this.view.scene.traverse(m => { if (m.geometry) geos.delete(m.geometry); for (const mt of [].concat(m.material || [])) for (const k in mt) if (mt[k]?.isTexture) texs.delete(mt[k]); });
      for (const g of geos) g.dispose(); for (const t of texs) t.dispose();
    }
    pc.objects.length = pc.bodies.length = pc.kept.length = pc.drops.length = pc.geo.length = pc.tex.length = 0; if (counted) this.dropped++;
  }
  /** Lets go of every part and cell (they're made again as they're wanted). */
  clear() {
    for (const e of this.parts.values()) if (e.piece) { this.free(e.piece); e.piece = null; }
    for (const L of this.layers) L.clear();
    this.spare = [];
    for (const n of this.wanted) this.start(n);
    return this;
  }
  /** Stops for good: everything let go of, the memory guard no longer heard. */
  dispose() { this.wanted.clear(); this.clear(); this.parts.clear(); this.layers.length = 0; this.offMem?.(); }
  /** What is in: { parts: [names made], cells, making, ms } (ms: this frame's building). */
  get info() {
    const parts = [...this.parts].filter(([, e]) => e.piece?.done).map(([n]) => n);
    let cells = 0, making = 0; for (const L of this.layers) for (const c of L.live.values()) { if (c.piece.done) cells++; else making++; }
    for (const n of this.wanted) if (!this.has(n)) making++;
    return { parts, cells, making, ms: this.frameMs, made: this.made, dropped: this.dropped };
  }
}
const _dir = new Vector3();
const count = W => W.bodies.length + (W.movers?.length || 0);
function newBodies(W, n) { const all = [...W.bodies, ...(W.movers || [])]; return n < all.length ? all.slice(n) : []; }

// squares round the player, each a part of its own
class Layer {
  constructor(regions, o) { Object.assign(this, { regions }, o); this.live = new Map(); this.old = []; }
  keyAt(x, z) { return Math.floor(x / this.size) + ',' + Math.floor(z / this.size); }
  update(shrink = 0) {
    const R = this.regions, s = this.size, cx = Math.floor(R.at.x / s), cz = Math.floor(R.at.z / s), r = Math.max(1, this.reach - shrink);
    // beyond reach + 1: let go of
    for (const [k, c] of this.live) if (Math.abs(c.cx - cx) > r + 1 || Math.abs(c.cz - cz) > r + 1) { R.free(c.piece); if (c.was) R.free(c.was); this.live.delete(k); }
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const x = cx + i, z = cz + j, k = x + ',' + z, ring = Math.max(Math.abs(i), Math.abs(j));
      // nearest first, and of those the ones in front of the camera before those behind
      const fx = (x + .5) * s - R.at.x, fz = (z + .5) * s - R.at.z, ahead = (fx * R.look.x + fz * R.look.z) / (Math.hypot(fx, fz) || 1);
      const order = ring * 4 + (1 - ahead) * 1.5, level = this.level ? this.level(ring) : 0;
      let c = this.live.get(k);
      if (c && c.level !== level && c.piece.done && !c.was) { c.was = c.piece; c.piece = this.piece(x, z, ring, level); c.level = level; }   // made again at its new level; the old stays until it's in
      if (!c) { c = { cx: x, cz: z, ring, level, order, piece: this.piece(x, z, ring, level), was: null }; this.live.set(k, c); }
      c.ring = ring; c.order = order;
    }
  }
  piece(cx, cz, ring, level) {
    const s = this.size;
    return new Piece(this.regions, 'cell ' + cx + ',' + cz, this.make, { cx, cz, x0: cx * s, z0: cz * s, size: s, ring, level, seed: hash(cx, cz, this.seed) });
  }
  // a square's new level is in: let go of the old one
  landed(pc) { for (const c of this.live.values()) if (c.piece === pc && c.was) { this.regions.free(c.was); c.was = null; } }
  clear() { for (const c of this.live.values()) { this.regions.free(c.piece); if (c.was) this.regions.free(c.was); } this.live.clear(); }
  get count() { let n = 0; for (const c of this.live.values()) if (c.piece.done) n++; return n; }
}

// one tile of land: a grid of heights (with a ring of samples outside it, so its edges slope the way its
// neighbours' do), a skirt hanging from its edges, and a heightfield in the physics world when it's near
function* tile(regions, r, { height, segments: n, solid, mat, colour, skirt, shadows }) {
  const s = r.size, x0 = r.x0, z0 = r.z0, e = s / n, w = n + 3, H = new Float32Array(w * w);
  for (let j = 0; j < w; j++) { for (let i = 0; i < w; i++) H[j * w + i] = height(x0 + (i - 1) * e, z0 + (j - 1) * e); if (j % 8 === 7) yield; }
  const h = (i, j) => H[(j + 1) * w + (i + 1)], v = n + 1, skirtD = skirt ?? e * 1.5;
  const P = [], N = [], C = [], I = [], col = new Color();
  const put = (i, j, y) => {
    const dx = h(i + 1, j) - h(i - 1, j), dz = h(i, j + 1) - h(i, j - 1), l = Math.hypot(dx, 2 * e, dz);
    P.push(i * e, y, j * e); N.push(-dx / l, 2 * e / l, -dz / l);
    if (colour) { const c = colour(x0 + i * e, h(i, j), z0 + j * e, 1 - 2 * e / l); col.set(c ?? '#ffffff'); C.push(col.r, col.g, col.b); }
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) put(i, j, h(i, j));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * v + i, b = a + 1, c = a + v, d = c + 1; I.push(a, c, b, b, c, d); }
  // the skirt: each edge again, lower, joined to the edge
  const edge = [];
  for (let i = 0; i <= n; i++) edge.push([i, 0]); for (let j = 1; j <= n; j++) edge.push([n, j]);
  for (let i = n - 1; i >= 0; i--) edge.push([i, n]); for (let j = n - 1; j >= 1; j--) edge.push([0, j]);
  const base = P.length / 3;
  for (const [i, j] of edge) put(i, j, h(i, j) - skirtD);
  for (let k = 0; k < edge.length; k++) {
    const k2 = (k + 1) % edge.length, [i1, j1] = edge[k], [i2, j2] = edge[k2], a = j1 * v + i1, b = j2 * v + i2, c = base + k, d = base + k2;
    I.push(a, b, c, b, d, c);
  }
  yield;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(N), 3));
  if (C.length) g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
  g.setIndex(I); g.computeBoundingBox(); g.computeBoundingSphere();
  const m = new Mesh(g, mat); m.position.set(x0, 0, z0); m.receiveShadow = shadows; m.castShadow = false; m.name = 'land ' + r.cx + ',' + r.cz;
  m.userData.gsLand = true;
  regions.view.scene.add(m);
  if (solid && regions.world?.heights) {
    const grid = new Float32Array(v * v); for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) grid[j * v + i] = h(i, j);
    regions.world.heights({ data: grid, cols: n, rows: n, x: x0, z: z0, width: s, depth: s }, { tag: 'land', sound: 'dirt' });
  }
}

timed(Regions.prototype, 'update', 'regions');
