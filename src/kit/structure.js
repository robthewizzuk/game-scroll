// gs.destruction.Structure: a building that comes apart. It is made of pieces (each half of a pier, the
// wall under and over a window, a window, a floor tile, a roof panel) and every piece knows what holds it
// up: what it stands on, and what it is fixed to at its sides. Shoot a piece away, or set off a blast, and
// whatever no longer reaches the ground through the pieces that are left comes down a moment later, the
// collapse spreading out from the hole: knock out a corner and the wall above it goes, the floor it carried
// sags away, the roof hangs on by the ridge. Masonry can hang one piece out sideways, timber and concrete
// two, so the same shot leaves different ruins.
//
//   const { Structure } = gs.destruction;
//   make():   house = new Structure(view.scene, { building: { style: 'brick', w: 8, d: 6, floors: 2 }, at: [0, 0, -12] });
//   reset() { phys = new World3D(); house.reset({ world: phys }); }           // whole again, and solid in the round's world
//   a shell lands:  house.blast(point, 3);              a bullet:  house.hit(point, { power: .3 });
//   update(dt) { phys.step(dt); house.update(dt); for (const b of house.broke) if (b.how === 'landed') dust(b.x, b.y, b.z, b.size); }
//
// With a gs.physics3d world the walls are solid (movers, rays, sound that knows the level), what falls is
// real tumbling bodies that pile up, and what they land on can break in turn. Without one the pieces fall
// and break up where they land. Either way the small rubble is cheap: boxes drawn as copies, not bodies.
// The look is the game's: `broke` lists what happened each frame (where, how big, how fast) for your dust,
// sound and shake. Kit use only: games reach it as gs.destruction.Structure.
import { timed } from './prof.js';
import { Group, Mesh, BufferGeometry, BufferAttribute, BoxGeometry, InstancedMesh, InstancedBufferAttribute, DynamicDrawUsage, Matrix4, Quaternion, Vector3, Euler } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingPieces } from './models/buildings.js';
import { Build, boxUV, rngOf } from './models/props.js';
import { material } from './models/materials.js';
import { wear } from './models/wear.js';

// what a thing is made of: tonnes a cubic metre, the landing speed (m/s) that breaks a piece of it up (0: it
// stays whole), how hard it is to break, and the shape of its rubble
const STUFF = {
  brick: [1.8, 3.5, 1.5, 'lump'], stone: [2.3, 4.5, 2, 'lump'], cobbles: [2.2, 4, 2, 'lump'], concrete: [2.3, 7, 2.5, 'lump'], marble: [2.6, 4.5, 2, 'lump'],
  tiles: [1.6, 3, 1, 'slate'], planks: [.6, 0, .8, 'plank'], wood: [.6, 0, .8, 'stick'], bark: [.6, 0, .8, 'stick'], metal: [2.5, 0, 3, 'sheet'], rust: [2.5, 0, 3, 'sheet'],
  paint: [.8, 0, .6, 'stick'], glass: [2.5, 1.5, .1, null],
};
const stuffOf = n => STUFF[n] || STUFF.brick;
const HARD = new Set(['wall', 'roof', 'floor', 'door', 'glass', 'lit']);   // a building's slots that are solid (the rest is trim)
const EPS = .025, STAND = 0, DUE = 1, LOOSE = 2, GONE = 3;
const M4 = new Matrix4(), Q = new Quaternion(), Q2 = new Quaternion(), E = new Euler(), V = new Vector3(), V2 = new Vector3(), S1 = new Vector3(1, 1, 1);

// Once for a kind of building: each piece's bounds, weight and strength, which pieces touch, and how far
// (in sideways holds) each is from the ground while it is whole.
function survey(src) {
  if (src.survey) return src.survey;
  const C = src.chunks.map(c => {
    const hard = c.boxes.filter(b => b.hard ?? HARD.has(b.slot)), use = c.kind === 'window' || c.kind === 'door' || !hard.length ? c.boxes : hard;
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9], com = [0, 0, 0]; let mass = 0, vol = 0, top = null, most = 0;
    for (const b of c.boxes) {
      const [dens] = stuffOf(b.stuff ?? src.recipes[b.slot] ?? (b.slot === 'glass' || b.slot === 'lit' ? 'glass' : '')), v = b.size[0] * b.size[1] * b.size[2], m = v * dens;
      mass += m; for (let k = 0; k < 3; k++) com[k] += b.at[k] * m;
      if (use.includes(b)) {
        vol += v; if (m > most) { most = m; top = b; }
        let h = [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2];
        if (b.rot) { const e = M4.makeRotationFromEuler(E.set(...b.rot)).elements; h = [0, 1, 2].map(r => Math.abs(e[r]) * h[0] + Math.abs(e[r + 4]) * h[1] + Math.abs(e[r + 8]) * h[2]); }
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.at[k] - h[k]); max[k] = Math.max(max[k], b.at[k] + h[k]); }
      }
    }
    for (let k = 0; k < 3; k++) com[k] /= mass || 1;
    const name = top.stuff ?? src.recipes[top.slot] ?? (top.slot === 'glass' || top.slot === 'lit' ? 'glass' : ''), [, crumble, hard0, bit] = stuffOf(name);
    const strength = c.strength ?? (c.kind === 'base' ? Infinity : c.kind === 'window' ? .1 : c.kind === 'door' ? .5 : c.kind === 'roof' ? hard0 * .5 : c.kind === 'floor' ? hard0 * .7 : src.strength ?? hard0);
    const solids = (hard.length ? hard : c.boxes.slice(0, 1)).map(b => ({ c: b.at, h: b.size.map(x => x / 2), q: b.rot ? new Quaternion().setFromEuler(E.set(...b.rot)) : null }));
    return { kind: c.kind, min, max, com, mass, vol, solids, slot: top.slot, crumble: c.kind === 'window' ? 1.5 : crumble, bit, strength: c.fixed ? Infinity : strength,
      carry: c.kind !== 'window' && c.kind !== 'door', anchor: !!c.fixed || c.kind === 'base', size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) };
  });
  const n = C.length, base = C.reduce((a, c) => Math.min(a, c.min[1]), 1e9);
  for (const c of C) if (c.min[1] <= base + EPS) c.anchor = true;   // it stands on the ground
  // who holds whom: holds[j] lists [i, cost, face]: piece i can be held by j, for nothing if it stands on it, 1 if
  // it is fixed to its side (face: which side of i that is: 0 -x, 1 +x, 2 -z, 3 +z), 2 if it hangs under it
  const holds = C.map(() => []), near = C.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = C[i], b = C[j]; let over = 0, apart = false, meet = 0, least = -1e9;
    for (let k = 0; k < 3; k++) { const g = Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k]); if (g > EPS) { apart = true; break; } if (g < -EPS) over++; if (g > least) { least = g; meet = k; } }
    if (apart || over < 2) continue;   // (they touch over a face, not along an edge)
    near[i].push(j); near[j].push(i);
    const can = (x, y) => y.carry && !(x.kind === 'roof' && y.kind === 'floor');   // x held by y (a roof stands on walls, not on the ceiling)
    if (meet !== 1) {   // side by side
      const bLow = b.min[meet] + b.max[meet] < a.min[meet] + a.max[meet] ? 0 : 1;   // is b on a's low side or its high side
      if (can(a, b)) holds[j].push([i, 1, meet + bLow]); if (can(b, a)) holds[i].push([j, 1, meet + 1 - bLow]);
    } else {   // one on top of the other: the upper stands on the lower, and the lower can hang from it (worth two holds)
      const [u, l] = a.min[1] + a.max[1] > b.min[1] + b.max[1] ? [i, j] : [j, i];
      if (can(C[u], C[l])) holds[l].push([u, 0, -1]); if (can(C[l], C[u])) holds[u].push([l, 2, -1]);
    }
  }
  const S = { C, holds, near, n, base, span: src.span ?? 1, total: C.reduce((a, c) => a + (c.kind === 'base' ? 0 : c.mass), 0) };
  const own = costs(S, new Uint8Array(n));
  S.loose = 0; for (let i = 0; i < n; i++) if (own[i] === Infinity) { C[i].anchor = true; own[i] = 0; S.loose++; }   // (held by nothing we know of: the game's own doing)
  S.limit = Float32Array.from(own, c => c + S.span);   // a piece falls when it is `span` holds further from the ground than it was whole
  // a grid over the floor plan: the pieces above each square (for rubble landing on what still stands)
  const x0 = Math.min(...C.map(c => c.min[0])), z0 = Math.min(...C.map(c => c.min[2])), x1 = Math.max(...C.map(c => c.max[0])), z1 = Math.max(...C.map(c => c.max[2])), cell = 1.5;
  const gw = Math.max(1, Math.ceil((x1 - x0) / cell)), gd = Math.max(1, Math.ceil((z1 - z0) / cell)), cells = Array.from({ length: gw * gd }, () => []);
  C.forEach((c, i) => { for (let gx = Math.max(0, Math.floor((c.min[0] - x0) / cell)); gx <= Math.min(gw - 1, Math.floor((c.max[0] - x0) / cell)); gx++) for (let gz = Math.max(0, Math.floor((c.min[2] - z0) / cell)); gz <= Math.min(gd - 1, Math.floor((c.max[2] - z0) / cell)); gz++) cells[gx + gz * gw].push(i); });
  S.grid = { x0, z0, x1, z1, cell, gw, gd, cells, y1: Math.max(...C.map(c => c.max[1])) };
  return src.survey = S;
}
// How far each standing piece is from the ground: 0 if it reaches it through pieces under it, 1 more for
// every sideways hold on the way, Infinity if nothing holds it. A piece held on two opposite sides is a
// bridge between them, and is only as far as the further of the two (so a wall closes over a small hole,
// as brickwork does, and a floor spans from wall to wall). state: only STAND pieces count.
function costs(S, state) {
  const { C, holds, n } = S, cost = new Float32Array(n).fill(Infinity), side = new Float32Array(n * 4).fill(Infinity), q = [];
  for (let i = 0; i < n; i++) if (state[i] === STAND && C[i].anchor) { cost[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const j = q[h], cj = cost[j];
    for (const [i, w, f] of holds[j]) {
      if (state[i] !== STAND) continue;
      let c = cj + w;
      if (f >= 0) { const k = i * 4 + f; if (cj < side[k]) side[k] = cj; c = Math.min(c, Math.max(side[k], side[k ^ 1])); }
      if (c < cost[i]) { cost[i] = c; q.push(i); }
    }
  }
  return cost;
}

// A structure from the game's own boxes: [{ size: [w, h, d], at: [x, y, z] (its centre), material, strength, kind, fixed }]
function fromPieces(list, { materials = {}, span = 1, wear: wr = {}, seed = 0 }) {
  const b = new Build(), chunks = [], tags = new Map(), mats = {}, recipes = {};
  for (const p of list) {
    const m = p.material ?? 'brick', slot = typeof m === 'string' ? m : 'm' + m.uuid;
    if (!mats[slot]) { const own = typeof m === 'string' ? materials[m] : m; mats[slot] = own?.isMaterial ? own : Array.isArray(own) ? material(own[0], own[1]) : material(m); recipes[slot] = Array.isArray(own) ? own[0] : typeof m === 'string' ? m : ''; }
    b.box(slot, p.size[0], p.size[1], p.size[2], p.at);
    if (!tags.has(slot)) tags.set(slot, []); tags.get(slot).push(chunks.length);
    chunks.push({ kind: p.kind || 'wall', strength: p.strength, fixed: !!p.fixed, boxes: [{ slot, at: p.at, size: p.size, rot: null, hard: true, stuff: p.stuff }], ranges: [] });
  }
  const parts = [];
  for (const [slot, geos] of b.slots) {
    let v = 0; geos.forEach((g, i) => { const n = g.attributes.position.count; chunks[tags.get(slot)[i]].ranges.push([parts.length, v, n]); v += n; });
    const m = new Mesh(boxUV(mergeGeometries(geos, false), 1), mats[slot]); for (const x of geos) x.dispose();
    if (wr !== false) wear(m, { seed, split: false, edges: .4, dirt: .4, ground: .8, ...wr });
    parts.push({ slot, geo: m.geometry, mat: m.material, shadow: true });
  }
  return { parts, chunks, span, recipes };
}

// Small rubble: boxes drawn as copies of one shape (a set for each material), thrown, landing on the ground
// or on what still stands, lying flat where they stop. The oldest go when a set is full.
let bitGeo = null;
function bitShape() {
  if (bitGeo) return bitGeo;
  const g = new BoxGeometry(1, 1, 1).toNonIndexed(), P = g.attributes.position, r = rngOf(7), off = new Map();
  for (let i = 0; i < P.count; i++) {   // corners knocked about a little, the same for the faces that share one
    const k = `${P.getX(i)},${P.getY(i)},${P.getZ(i)}`; if (!off.has(k)) off.set(k, [(r() - .5) * .22, (r() - .5) * .22, (r() - .5) * .22]);
    const o = off.get(k); P.setXYZ(i, P.getX(i) + o[0], P.getY(i) + o[1], P.getZ(i) + o[2]);
  }
  g.deleteAttribute('uv'); g.computeVertexNormals(); boxUV(g, 3);
  g.setAttribute('color', new BufferAttribute(new Float32Array(P.count * 3).fill(1), 3));
  return bitGeo = g;
}
class Bits {
  constructor(parent, cap, gravity) { this.parent = parent; this.cap = cap; this.g = gravity; this.sets = new Map(); this.moving = 0; }
  set(slot, mat, share = 1) {
    let s = this.sets.get(slot); if (s) return s;
    const n = Math.max(8, Math.round(this.cap * share)), mesh = new InstancedMesh(bitShape(), mat, n);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.instanceMatrix.array.fill(0);   // (unused ones: no size, never seen)
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'rubble:' + slot; mesh.userData.detail = false;
    this.parent.add(mesh);
    s = { mesh, n, next: 0, P: new Float32Array(n * 3), V: new Float32Array(n * 3), R: new Float32Array(n * 4), W: new Float32Array(n * 3), Z: new Float32Array(n * 3), st: new Uint8Array(n), on: new Int32Array(n).fill(-1) };
    this.sets.set(slot, s); return s;
  }
  /** One bit: where, how big, how fast. */
  add(slot, mat, x, y, z, sx, sy, sz, vx, vy, vz, r) {
    const s = this.set(slot, mat), i = s.next; s.next = (i + 1) % s.n;
    s.P.set([x, y, z], i * 3); s.V.set([vx, vy, vz], i * 3); s.Z.set([sx, sy, sz], i * 3);
    Q.setFromEuler(E.set(r() * 6.3, r() * 6.3, r() * 6.3)); s.R.set([Q.x, Q.y, Q.z, Q.w], i * 4);
    s.W.set([(r() - .5) * 9, (r() - .5) * 9, (r() - .5) * 9], i * 3); s.st[i] = 1; s.on[i] = -1;
    const c = .78 + r() * .3; s.mesh.instanceColor.setXYZ(i, c, c, c); s.mesh.instanceColor.needsUpdate = true;
  }
  /** Bits lying on piece j fall again. */
  wake(j) { for (const s of this.sets.values()) for (let i = 0; i < s.n; i++) if (s.on[i] === j && s.st[i]) { s.st[i] = 1; s.on[i] = -1; s.V.fill(0, i * 3, i * 3 + 3); s.W.fill(0, i * 3, i * 3 + 3); } }
  /** floor(x, y, z, out): the height to land on under a point, and out.on the piece it is (or -1). */
  update(dt, floor) {
    const out = { on: -1 }; this.moving = 0;
    for (const s of this.sets.values()) {
      let any = false;
      for (let i = 0; i < s.n; i++) {
        const st = s.st[i]; if (st !== 1 && st !== 3) continue;
        any = true; this.moving++;
        const p = i * 3, q = i * 4, P = s.P, Vv = s.V, R = s.R, W = s.W, Z = s.Z;
        if (st === 1) {
          Vv[p + 1] += this.g * dt; P[p] += Vv[p] * dt; P[p + 1] += Vv[p + 1] * dt; P[p + 2] += Vv[p + 2] * dt;
          // it turns as it flies
          const wx = W[p] * dt * .5, wy = W[p + 1] * dt * .5, wz = W[p + 2] * dt * .5, x = R[q], y = R[q + 1], z = R[q + 2], w = R[q + 3];
          let nx = x + wx * w + wy * z - wz * y, ny = y + wy * w + wz * x - wx * z, nz = z + wz * w + wx * y - wy * x, nw = w - wx * x - wy * y - wz * z; const l = Math.hypot(nx, ny, nz, nw) || 1;
          R[q] = nx / l; R[q + 1] = ny / l; R[q + 2] = nz / l; R[q + 3] = nw / l;
          const r = Math.min(Z[p], Z[p + 1], Z[p + 2]) / 2, gy = floor(P[p], P[p + 1], P[p + 2], out);
          if (P[p + 1] - r <= gy) {
            P[p + 1] = gy + r;
            if (Vv[p + 1] < -2.2) { Vv[p + 1] *= -.22; Vv[p] *= .55; Vv[p + 2] *= .55; W[p] *= .5; W[p + 1] *= .5; W[p + 2] *= .5; }   // a bounce
            else {   // it stops, and tips onto its nearest face
              s.st[i] = 3; s.on[i] = out.on;
              Q.set(R[q], R[q + 1], R[q + 2], R[q + 3]); let best = 0, dot = 0;
              for (let k = 0; k < 3; k++) { V.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(Q); if (Math.abs(V.y) > Math.abs(dot)) { dot = V.y; best = k; } }
              V.set(best === 0 ? 1 : 0, best === 1 ? 1 : 0, best === 2 ? 1 : 0).applyQuaternion(Q); Q2.setFromUnitVectors(V, V2.set(0, Math.sign(dot) || 1, 0)).multiply(Q);
              W[p] = Q2.x; W[p + 1] = Q2.y; W[p + 2] = Q2.z; Vv[p] = Q2.w; Vv[p + 1] = gy + Z[p + best] / 2;   // (kept in the spin and speed slots while it settles)
            }
          }
        } else {
          const k = Math.min(1, dt * 16); Q.set(R[q], R[q + 1], R[q + 2], R[q + 3]); Q2.set(W[p], W[p + 1], W[p + 2], Vv[p]);
          Q.slerp(Q2, k); R[q] = Q.x; R[q + 1] = Q.y; R[q + 2] = Q.z; R[q + 3] = Q.w; P[p + 1] += (Vv[p + 1] - P[p + 1]) * k;
          if (Math.abs(Q.dot(Q2)) > .9995) { s.st[i] = 2; P[p + 1] = Vv[p + 1]; }
        }
        M4.compose(V.set(P[p], P[p + 1], P[p + 2]), Q.set(R[q], R[q + 1], R[q + 2], R[q + 3]), V2.set(Z[p], Z[p + 1], Z[p + 2])); M4.toArray(s.mesh.instanceMatrix.array, i * 16);
      }
      if (any) s.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  clear() { for (const s of this.sets.values()) { s.st.fill(0); s.on.fill(-1); s.next = 0; s.mesh.instanceMatrix.array.fill(0); s.mesh.instanceMatrix.needsUpdate = true; } this.moving = 0; }
  remove() { for (const s of this.sets.values()) s.mesh.removeFromParent(); this.sets.clear(); }
}
// the sizes of a bit of rubble, by the shape its stuff breaks into
const BIT = {
  lump: r => { const s = .18 + r() * r() * .5; return [s, s * (.55 + r() * .4), s * (.7 + r() * .4)]; },
  slate: r => [.26 + r() * .16, .035, .2 + r() * .12], plank: r => [.6 + r() * .7, .045, .13 + r() * .06],
  stick: r => [.35 + r() * .5, .05 + r() * .03, .05 + r() * .03], sheet: r => [.3 + r() * .4, .02, .25 + r() * .3],
};

export class Structure {
  /**
   * scene: where it is drawn (a view's scene, or any group). Options: building (what gs.models.building takes:
   * style, w, d, floors, roof, seed, materials...) or pieces (your own boxes: [{ size: [w, h, d], at: [x, y, z]
   * (the box's centre), material ('brick', 'planks'... or a three.js material), strength, fixed (true: it never
   * moves and holds the rest up, as the ground does) }], with materials { name: a material } and span); at ([x, y, z] of
   * its foot), turn (radians about y); world (a gs.physics3d World3D: solid walls, and what falls tumbles and
   * piles up); ground ((x, z) => the height rubble lands at; flat at its foot otherwise); bits (240: how
   * much small rubble a material keeps), keep (40: how many fallen pieces stay as bodies; the oldest break up),
   * crush (1: how hard falling pieces hit what they land on; 0: they break nothing), gravity, seed.
   */
  constructor(scene, o = {}) {
    const { building = null, pieces = null, at = [0, 0, 0], turn = 0, world = null, ground = null, bits = 240, keep = 40, crush = 1, seed = 1 } = o;
    this.src = pieces ? fromPieces(pieces, o) : buildingPieces(building || {});
    const S = this.S = survey(this.src), n = S.n;
    this.scene = scene; this.world = world; this.keep = keep; this.crush = crush; this.seed = seed;
    this.at = Array.isArray(at) ? [...at] : [at.x, at.y, at.z]; this.turn = turn; this.cos = Math.cos(turn); this.sin = Math.sin(turn);
    this.ground = ground || (() => this.at[1]);
    this.gravity = o.gravity ?? world?.gravity?.y ?? -9.81;
    this.group = new Group(); this.group.name = 'structure'; this.group.position.set(...this.at); this.group.rotation.y = turn;
    this.debris = new Group(); this.debris.name = 'structure:debris';
    // its meshes: the building's own points, with a list of triangles of its own so a piece can be taken out of the picture
    this.meshes = this.src.parts.map(p => {
      const g = new BufferGeometry(), cnt = p.geo.attributes.position.count;
      for (const k in p.geo.attributes) g.setAttribute(k, p.geo.attributes[k]);
      const idx = new (cnt > 65535 ? Uint32Array : Uint16Array)(cnt); for (let i = 0; i < cnt; i++) idx[i] = i;
      g.setIndex(new BufferAttribute(idx, 1)); g.computeBoundingBox(); g.computeBoundingSphere();
      const m = new Mesh(g, p.mat); m.castShadow = p.shadow; m.receiveShadow = true; m.name = p.slot;
      m.userData.detail = false; m.userData.gsMoved = 0;   // (not for cluster detail: its triangles change; and shadows are told when they do)
      this.group.add(m); return m;
    });
    scene?.add(this.group, this.debris);
    this.group.updateMatrixWorld(true);
    this.state = new Uint8Array(n); this.hurt = new Float32Array(n); this.fallAt = new Float32Array(n); this.cols = Array.from({ length: n }, () => null);
    this.loose = []; this.bits = new Bits(this.debris, bits, this.gravity); this.time = 0; this.broke = []; this.events = []; this.due = 0; this.spent = 0;
    // (the rubble's sets are made now, so their shaders are built with the rest of the level and not on the first shot)
    this.src.parts.forEach((p, k) => { if (p.slot !== 'glass' && p.slot !== 'lit') this.bits.set(p.slot, this.meshes[k].material, pieces || p.slot === 'wall' ? 1 : p.slot === 'roof' || p.slot === 'floor' ? .5 : .25); });
    this.under = (x, y, z, o) => this.floor(x, y, z, o);
    this.yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn);
    this.solid();
  }
  // a point of the structure's own frame in the world, and back
  out(x, y, z, v = new Vector3()) { return v.set(this.at[0] + x * this.cos + z * this.sin, this.at[1] + y, this.at[2] - x * this.sin + z * this.cos); }
  in(p, v = new Vector3()) { const x = (p.x ?? p[0]) - this.at[0], z = (p.z ?? p[2]) - this.at[2]; return v.set(x * this.cos - z * this.sin, (p.y ?? p[1]) - this.at[1], x * this.sin + z * this.cos); }

  // physics: one fixed body, a box for every solid part of every standing piece
  solid() {
    const w = this.world; if (!w?.world) return;
    const R = w.R;
    this.body = w.make(this.group, R.ColliderDesc.ball(.01).setTranslation(0, -500, 0), { fixed: true, tag: 'structure' }, 'structure');
    this.body.structure = this; this.body.mesh = null;   // (it never moves: nothing to follow)
    for (let i = 0; i < this.S.n; i++) if (this.state[i] <= DUE) this.cols[i] = this.shapes(i).map(d => w.world.createCollider(d, this.body.body));
  }
  // the collider of each solid box of piece i, placed from `from` (its balance point) for a loose piece: those a
  // touch smaller, or a piece with standing ones on both sides is gripped by them and hangs in the air
  shapes(i, from = null) {
    const R = this.world.R, c = this.src.chunks[i], hard = c.boxes.filter(b => b.hard ?? HARD.has(b.slot)), o = from || [0, 0, 0], gap = from ? .012 : 0;
    return (hard.length ? hard : c.boxes.slice(0, 1)).map(b => {
      const d = R.ColliderDesc.cuboid(Math.max(.01, b.size[0] / 2 - gap), Math.max(.01, b.size[1] / 2 - gap), Math.max(.01, b.size[2] / 2 - gap)).setTranslation(b.at[0] - o[0], b.at[1] - o[1], b.at[2] - o[2]);
      if (b.rot) { Q.setFromEuler(E.set(...b.rot)); d.setRotation({ x: Q.x, y: Q.y, z: Q.z, w: Q.w }); }
      const [dens] = stuffOf(b.stuff ?? this.src.recipes[b.slot] ?? (b.slot === 'glass' || b.slot === 'lit' ? 'glass' : ''));
      return d.setDensity(dens).setFriction(.75).setRestitution(.02);
    });
  }
  unsolid(i) { const cs = this.cols[i]; if (!cs) return; this.cols[i] = null; if (this.world?.world && this.body && !this.body.dead) for (const c of cs) this.world.world.removeCollider(c, true); }

  // drawing: a piece's triangles taken out of (or put back into) the building's meshes
  show(i, on) {
    for (const [pi, s, n] of this.src.chunks[i].ranges) {
      const m = this.meshes[pi], ix = m.geometry.index, a = ix.array;
      if (on) for (let k = s; k < s + n; k++) a[k] = k; else a.fill(0, s, s + n);
      ix.addUpdateRange(s, n); ix.needsUpdate = true; m.userData.gsMoved++;
    }
  }
  // a piece as meshes of its own (round its balance point), for when it falls
  lift(i) {
    const c = this.src.chunks[i], com = this.S.C[i].com, g = new Group(), by = new Map();
    for (const [pi, s, n] of c.ranges) { if (!by.has(pi)) by.set(pi, []); by.get(pi).push([s, n]); }
    for (const [pi, list] of by) {
      const src = this.meshes[pi].geometry, geo = new BufferGeometry(), cnt = list.reduce((a, [, n]) => a + n, 0);
      for (const k in src.attributes) {
        const A = src.attributes[k], sz = A.itemSize, arr = new Float32Array(cnt * sz); let o = 0;
        for (const [s, n] of list) { arr.set(A.array.subarray(s * sz, (s + n) * sz), o); o += n * sz; }
        if (k === 'position') for (let j = 0; j < arr.length; j += 3) { arr[j] -= com[0]; arr[j + 1] -= com[1]; arr[j + 2] -= com[2]; }
        geo.setAttribute(k, new BufferAttribute(arr, sz));
      }
      const m = new Mesh(geo, this.meshes[pi].material); m.castShadow = this.meshes[pi].castShadow; m.receiveShadow = true; m.userData.detail = false; g.add(m);
    }
    this.out(com[0], com[1], com[2], g.position); g.quaternion.copy(this.yaw);
    return g;
  }

  note(how, i, x, y, z, speed, more) { const c = this.S.C[i]; this.events.push({ how, kind: c.kind, x, y, z, size: c.size, mass: c.mass, speed, ...more }); }

  // piece i breaks up into rubble: where it stands (loose = null) or where a fallen one has got to; v: how fast the rubble sets off
  crumble(i, loose, vx, vy, vz, scatter = 1.5) {
    const c = this.src.chunks[i], C = this.S.C[i], r = this.rnd ||= rngOf(this.seed + 5);
    const pos = loose ? loose.g.position : this.out(C.com[0], C.com[1], C.com[2], new Vector3()), rot = loose ? loose.g.quaternion : this.yaw;
    for (const b of c.boxes) {
      const name = b.stuff ?? this.src.recipes[b.slot] ?? ''; let shape = b.slot === 'glass' || b.slot === 'lit' ? null : stuffOf(name)[3] || 'lump';
      if (!shape) continue;
      const [thin, mid, long] = [...b.size].sort((x, y) => x - y);
      if (shape === 'lump') { if (mid >= .15 && thin < .13) shape = 'slate'; }   // (a thin sheet of it: roof slates, a skim)
      else if (mid < .15) shape = 'stick';   // (a bar of it: a window frame, a rail)
      // fewer, bigger bits when a lot is breaking at once (a whole house): the sets hold only so many
      const room = Math.max(0, 1 - this.spent / (this.bits.cap * .7)), hard = b.hard ?? HARD.has(b.slot), vol = b.size[0] * b.size[1] * b.size[2];
      const many = hard ? Math.max(1, Math.round(Math.max(2, Math.min(10, vol / .08)) * (.2 + .8 * room))) : r() < .6 * room ? 1 : 0, big = 1 + (1 - room) * .6;
      const mesh = this.meshes[this.src.parts.findIndex(p => p.slot === b.slot)];
      this.spent += many;
      for (let k = 0; k < many; k++) {
        const z = BIT[shape](r), most = Math.max(.03, Math.min(long * .9, mid * 3)); for (let a = 0; a < 3; a++) z[a] = Math.min(z[a] * (shape === 'lump' ? big : 1), most);
        V.set((r() - .5) * b.size[0], (r() - .5) * b.size[1], (r() - .5) * b.size[2]); if (b.rot) V.applyEuler(E.set(...b.rot));
        V.set(V.x + b.at[0] - C.com[0], V.y + b.at[1] - C.com[1], V.z + b.at[2] - C.com[2]).applyQuaternion(rot).add(pos);
        this.bits.add(b.slot, mesh.material, V.x, V.y, V.z, z[0], z[1], z[2], vx + (r() - .5) * scatter, vy + r() * scatter * .6, vz + (r() - .5) * scatter, r);
      }
    }
  }
  // piece i leaves the building
  leave(i) { this.show(i, false); this.unsolid(i); this.bits.wake(i); if (this.state[i] === DUE) this.due--; this.state[i] = GONE; }
  /** Piece i is smashed where it stands: rubble flying at v (world, metres a second). */
  smash(i, vx = 0, vy = 0, vz = 0) {
    if (this.state[i] > DUE) return;
    const C = this.S.C[i], p = this.out(C.com[0], C.com[1], C.com[2]);
    this.crumble(i, null, vx, vy, vz, 1.5 + Math.hypot(vx, vy, vz) * .35); this.leave(i);
    this.note('broke', i, p.x, p.y, p.z, Math.hypot(vx, vy, vz));
  }
  /** Piece i comes away whole and falls, setting off at v with a spin. */
  drop(i, vx = 0, vy = 0, vz = 0, spin = .5) {
    if (this.state[i] > DUE) return;
    if (this.loose.length >= this.keep * 1.5) return this.smash(i, vx, vy, vz);   // (too many bodies at once: this one goes straight to rubble)
    const C = this.S.C[i], g = this.lift(i), r = this.rnd ||= rngOf(this.seed + 5);
    this.leave(i); this.state[i] = LOOSE; this.debris.add(g);
    const L = { i, g, body: null, v: new Vector3(vx, vy, vz), w: new Vector3((r() - .5) * spin, (r() - .5) * spin * .4, (r() - .5) * spin), v0: 0, top: 0, topT: 0, age: 0, still: 0, rest: false, hy: (C.max[1] - C.min[1]) / 2 };
    if (this.world?.world) {
      const ds = this.shapes(i, C.com);
      L.body = this.world.make(g, ds[0], { density: ds[0].density, friction: .75, bounce: .02, spinDrag: .3, vel: [vx, vy, vz], tag: 'rubble' }, 'piece');
      for (const d of ds.slice(1)) this.world.world.createCollider(d, L.body.body);
      L.body.structure = this; L.body.setSpin(L.w.x, L.w.y, L.w.z);
    }
    this.loose.push(L); this.note('fell', i, g.position.x, g.position.y, g.position.z, 0);
  }
  // a fallen piece is done with: it breaks up (or just goes)
  done(L, bits = true) {
    const live = L.body && !L.body.dead && this.world?.world;   // (a world the game has freed took its bodies with it)
    if (bits) { const v = live ? L.body.vel : L.v; this.crumble(L.i, L, v.x * .35, Math.abs(v.y) * .12 + .6, v.z * .35, 1.2 + L.v0 * .25); }
    if (live) this.world.remove(L.body);
    L.g.removeFromParent(); for (const m of L.g.children) m.geometry.dispose();
    this.loose.splice(this.loose.indexOf(L), 1); this.state[L.i] = GONE;
  }

  // Standing pieces near a point (in the structure's frame) are hurt: power at the point, none at radius. Those
  // hurt past their strength break: by(i, share, harm) says how. Then what they held up is found. below: only
  // pieces whose tops are under this height.
  harm(p, radius, power, by, below = Infinity) {
    const { C, n } = this.S; let broke = 0;
    for (let i = 0; i < n; i++) {
      if (this.state[i] > DUE || C[i].max[1] > below) continue;
      const c = C[i], dx = Math.max(c.min[0] - p.x, 0, p.x - c.max[0]), dy = Math.max(c.min[1] - p.y, 0, p.y - c.max[1]), dz = Math.max(c.min[2] - p.z, 0, p.z - c.max[2]), d = Math.hypot(dx, dy, dz);
      if (d >= radius) continue;
      const k = 1 - d / radius, h = power * k; this.hurt[i] += h;
      if (this.hurt[i] >= c.strength) { by(i, k, h); broke++; }
    }
    if (broke) this.settle(p);
    return broke;
  }
  // which standing pieces no longer reach the ground: they come down in turn, the nearest to p first
  settle(p) {
    const cost = costs(this.S, this.state), { C, limit, n } = this.S, r = this.rnd ||= rngOf(this.seed + 5);
    for (let i = 0; i < n; i++) if (this.state[i] === STAND && cost[i] > limit[i]) {
      const c = C[i].com; this.state[i] = DUE; this.due++;
      this.fallAt[i] = this.time + .06 + Math.hypot(c[0] - p.x, c[1] - p.y, c[2] - p.z) * .07 * (.7 + r() * .6);
    }
  }

  /**
   * A hit at a point (a bullet, a shell that does not burst, a wrecking ball): pieces within radius (.4) are hurt
   * by power (1 breaks a timber wall, 1.5 brick, 2 stone, 2.5 concrete; .1 a window; hurt adds up, so small hits
   * tell in the end), and a piece that breaks is knocked to rubble along dir. Returns how many pieces broke.
   */
  hit(point, { radius = .4, power = 1, dir = null, push = 3 } = {}) {
    const p = this.in(point), d = dir ? V2.set(dir.x ?? dir[0], dir.y ?? dir[1], dir.z ?? dir[2]).normalize().multiplyScalar(push).clone() : null;
    return this.harm(p, radius, power, i => {
      if (d) return this.smash(i, d.x, d.y, d.z);
      const c = this.S.C[i].com, o = this.out(c[0] - p.x, 0, c[2] - p.z).sub(V.set(...this.at)), l = Math.hypot(o.x, o.z) || 1;
      this.smash(i, o.x / l * push * .5, 1, o.z / l * push * .5);
    });
  }
  /**
   * An explosion at a point: every piece within radius is hurt (power at the point, falling to none at the
   * radius; 4), the nearest are blown to rubble and the rest of the broken ones thrown out whole at up to
   * push metres a second (8). What they held up follows. Returns how many pieces broke.
   */
  blast(point, radius = 3, { power = 4, push = 8 } = {}) {
    const p = this.in(point);
    return this.harm(p, radius, power, (i, k, h) => {
      const C = this.S.C[i], r = this.rnd ||= rngOf(this.seed + 5), s = push * (.35 + .65 * k) * (.8 + r() * .4);
      let dx = C.com[0] - p.x, dy = C.com[1] - p.y + .4, dz = C.com[2] - p.z, l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      // a slab (a wall, a floor) goes through its thin side: the pieces round it stop it going any other way
      const e = [C.max[0] - C.min[0], C.max[1] - C.min[1], C.max[2] - C.min[2]], a = e[0] < e[2] ? (e[0] < e[1] ? 0 : 1) : (e[2] < e[1] ? 2 : 1);
      if (e[a] < .6 * Math.max(e[(a + 1) % 3], e[(a + 2) % 3])) {
        const d = [dx, dy, dz], side = Math.abs(d[a]) > .08 ? Math.sign(d[a]) : a === 1 ? 1 : Math.sign(C.com[a]) || 1;
        for (let j = 0; j < 3; j++) d[j] *= .35; d[a] = side * .9; [dx, dy, dz] = d;
      }
      const v = this.out(dx * s, 0, dz * s).sub(V.set(...this.at)); v.y = dy * s;
      if (h >= C.strength * (C.crumble > 0 ? 1.5 : 2.5) || C.kind === 'window' || C.size < .7) this.smash(i, v.x, v.y, v.z);   // the nearest to rubble, the rest thrown whole
      else this.drop(i, v.x * .7, v.y * .7, v.z * .7, 3);
    });
  }
  /** The first standing piece along a ray (for shots, with no physics world): { point, normal, distance, kind } or null. */
  ray(from, dir, max = 100) {
    const o = this.in(from), dw = V2.set(dir.x ?? dir[0], dir.y ?? dir[1], dir.z ?? dir[2]).normalize(), d = new Vector3(dw.x * this.cos - dw.z * this.sin, dw.y, dw.x * this.sin + dw.z * this.cos);
    // a ray against a box: where it goes in (t) and through which face (axis), or -1
    const slab = (O, D, h, far) => {
      let t0 = 0, t1 = far, ax = 0;
      for (let k = 0; k < 3; k++) {
        const ok = O.getComponent(k), dk = D.getComponent(k);
        if (Math.abs(dk) < 1e-9) { if (Math.abs(ok) > h[k]) return -1; continue; }
        let a = (-h[k] - ok) / dk, b = (h[k] - ok) / dk; if (a > b) [a, b] = [b, a];
        if (a > t0) { t0 = a; ax = k; } if (b < t1) t1 = b;
        if (t0 > t1) return -1;
      }
      axis = ax; return t0;
    };
    let best = max, hit = -1, axis = 0; const n = new Vector3(), O = new Vector3(), D = new Vector3(), half = [0, 0, 0];
    for (let i = 0; i < this.S.n; i++) {
      if (this.state[i] > DUE) continue;
      const c = this.S.C[i];
      for (let k = 0; k < 3; k++) half[k] = (c.max[k] - c.min[k]) / 2 + .2;
      if (slab(O.set(o.x - (c.min[0] + c.max[0]) / 2, o.y - (c.min[1] + c.max[1]) / 2, o.z - (c.min[2] + c.max[2]) / 2), d, half, best) < 0) continue;   // (not even near it)
      for (const b of c.solids) {
        O.set(o.x - b.c[0], o.y - b.c[1], o.z - b.c[2]); D.copy(d);
        if (b.q) { Q.copy(b.q).invert(); O.applyQuaternion(Q); D.applyQuaternion(Q); }
        const t = slab(O, D, b.h, best);
        if (t >= 0 && t < best) { best = t; hit = i; n.set(0, 0, 0).setComponent(axis, -Math.sign(D.getComponent(axis))); if (b.q) n.applyQuaternion(b.q); }
      }
    }
    if (hit < 0) return null;
    return { point: this.out(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal: new Vector3(n.x * this.cos + n.z * this.sin, n.y, -n.x * this.sin + n.z * this.cos), distance: best, kind: this.S.C[hit].kind, piece: hit };
  }

  // where rubble lands under a world point: the ground, or the top of a standing piece below it
  floor(x, y, z, out) {
    const G = this.S.grid, lx = (x - this.at[0]) * this.cos - (z - this.at[2]) * this.sin, lz = (x - this.at[0]) * this.sin + (z - this.at[2]) * this.cos, ly = y - this.at[1];
    let top = this.ground(x, z) - this.at[1]; out.on = -1;
    if (lx >= G.x0 && lx <= G.x1 && lz >= G.z0 && lz <= G.z1 && ly < G.y1 + 1) {
      const cell = G.cells[Math.min(G.gw - 1, Math.floor((lx - G.x0) / G.cell)) + Math.min(G.gd - 1, Math.floor((lz - G.z0) / G.cell)) * G.gw];
      for (const j of cell) { if (this.state[j] > DUE) continue; const c = this.S.C[j]; if (lx >= c.min[0] && lx <= c.max[0] && lz >= c.min[2] && lz <= c.max[2] && c.max[1] <= ly + .2 && c.max[1] > top) { top = c.max[1]; out.on = j; } }
    }
    return top + this.at[1];
  }
  // a falling piece has hit something at `speed`: what is under it is hurt, and it breaks up if its stuff does
  landed(L, speed) {
    const C = this.S.C[L.i], p = L.g.position;
    const breaks = !L.body || (C.crumble > 0 && speed >= C.crumble);
    this.note('landed', L.i, p.x, p.y, p.z, speed, { crumbled: breaks });
    if (this.crush > 0 && speed > 2.5) {
      const q = this.in(p), v = L.body ? L.body.vel : L.v;
      this.harm(q, Math.min(1.3, C.size * .35 + .3), Math.min(C.mass, 2.5) * speed * .1 * this.crush, i => this.drop(i, v.x * .3, -1 - speed * .25, v.z * .3, 1), q.y + .1);
    }
    if (breaks) this.done(L);
  }

  /** Each frame, after the physics step. Fills `broke`: [{ how: 'broke' | 'fell' | 'landed', kind, x, y, z, size, mass, speed, crumbled }]. */
  update(dt) {
    if (!(dt > 0)) { this.broke = this.events; this.events = []; return this; }
    this.time += dt;
    const { C, n } = this.S, r = this.rnd ||= rngOf(this.seed + 5);
    if (this.due) for (let i = 0; i < n; i++) if (this.state[i] === DUE && this.fallAt[i] <= this.time) {   // pieces with nothing left under them let go
      const c = C[i].com, o = this.out(c[0], 0, c[2]).sub(V.set(...this.at)), l = Math.hypot(o.x, o.z) || 1;
      this.drop(i, o.x / l * .5 * r(), -.3, o.z / l * .5 * r(), .7);
    }
    const out = { on: -1 };
    for (const L of [...this.loose]) {
      L.age += dt;
      if (L.body) {
        if (L.body.dead) { this.done(L, false); continue; }   // (the game cleared the world)
        // it has landed when it loses most of its speed at once (its fastest in the last moment against now)
        const v = L.body.vel, sp = Math.hypot(v.x, v.y, v.z);
        if (sp >= L.top || L.age - L.topT > .15) { L.top = sp; L.topT = L.age; }
        L.v.set(v.x, v.y, v.z); L.v0 = sp;
        if (L.top > 1.2 && sp < L.top * .5) { const hit = L.top; L.top = sp; L.topT = L.age; this.landed(L, hit); if (!this.loose.includes(L)) continue; }
        if (sp < .12 || L.body.sleeping) L.still += dt; else L.still = 0;
        if (L.still > .5 && !L.rest) {   // it has stopped: if that is up in the air, caught between pieces that still stand, it breaks up
          const p = L.g.position;
          if (p.y - C[L.i].size / 2 > this.floor(p.x, p.y, p.z, out) + .5) { this.note('landed', L.i, p.x, p.y, p.z, 0, { crumbled: true }); this.done(L); continue; }
          L.rest = true;
        }
        if (L.g.position.y < this.ground(L.g.position.x, L.g.position.z) - 30) this.done(L, false);   // (fell out of the world)
      } else {
        // no physics: it falls, turning, until it meets the ground or a piece that still stands
        L.v.y += this.gravity * dt; L.g.position.addScaledVector(L.v, dt);
        const a = L.w.length(); if (a > 1e-6) L.g.quaternion.premultiply(Q.setFromAxisAngle(V.copy(L.w).divideScalar(a), a * dt));
        const p = L.g.position, gy = this.floor(p.x, p.y - L.hy + .25, p.z, out);
        if (p.y - L.hy <= gy) { p.y = gy + L.hy; this.landed(L, Math.hypot(L.v.x, L.v.y, L.v.z)); }
      }
    }
    // more fallen pieces than are kept: the oldest that has come to rest breaks up
    while (this.loose.length > this.keep) { const L = this.loose.find(x => x.rest) || this.loose[0]; this.done(L); }
    this.bits.update(dt, this.under); this.spent *= Math.exp(-dt / 1.5);
    this.broke = this.events; this.events = [];
    return this;
  }
  /** How much of it still stands, by weight: 1 whole, 0 flat. */
  get standing() { let m = 0; for (let i = 0; i < this.S.n; i++) if (this.state[i] <= DUE && this.S.C[i].kind !== 'base') m += this.S.C[i].mass; return this.S.total ? m / this.S.total : 0; }
  /** Pieces about to fall or in the air. */
  get falling() { return this.due + this.loose.reduce((a, L) => a + (L.rest ? 0 : 1), 0); }
  /** True while anything is still coming down (pieces or rubble). */
  get busy() { return this.falling > 0 || this.bits.moving > 0; }
  /** How many pieces it is made of, and how many still stand. */
  get pieces() { return this.S.n; }
  get left() { let k = 0; for (let i = 0; i < this.S.n; i++) if (this.state[i] <= DUE) k++; return k; }

  /** Whole again (a new round). Call it after clearing the physics world, if you do; { world }: the round's new one. */
  reset(o = null) {
    for (const L of [...this.loose]) this.done(L, false);
    this.bits.clear();
    if (this.body) { if (this.world?.world && !this.body.dead) this.world.remove(this.body); this.body = null; }
    for (let i = 0; i < this.S.n; i++) { if (this.state[i] > DUE) this.show(i, true); this.cols[i] = null; }
    this.state.fill(0); this.hurt.fill(0); this.due = 0; this.time = 0; this.spent = 0; this.broke = []; this.events = []; this.rnd = null;
    if (o && 'world' in o) this.world = o.world;
    this.solid();
    return this;
  }
  /** Takes it out of the scene and the physics world. */
  remove() {
    for (const L of [...this.loose]) this.done(L, false);
    if (this.body && this.world?.world && !this.body.dead) this.world.remove(this.body);
    this.body = null; this.bits.remove(); this.group.removeFromParent(); this.debris.removeFromParent();
    for (const m of this.meshes) m.geometry.dispose();   // (its own triangle lists; the points are shared with other copies)
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Structure.prototype, 'update', 'breaking buildings');
