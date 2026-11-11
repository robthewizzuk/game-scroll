// 3D path finding for Console, Next Gen and AR games: enemies and helpers find their way around any
// 3D level. The walkable map (a "nav mesh") is made from your level's own meshes, so there's no grid
// to draw by hand: floors, ramps and stairs are walkable, walls and boxes are in the way. Uses
// Recast & Detour (the path finder in many big games), via recast-navigation (MIT).
//
//   const { NavMesh3D } = gs.nav3d;
//   reset() {
//     nav = new NavMesh3D([floor, walls, crates], { radius: .4, height: 1.8, climb: .4, slope: 45 });   // make it in make() or reset()
//     path = nav.path(guard.position, hero.position);          // [Vector3, ...] corners to walk through, or []
//     const p = nav.closest(tap);  const r = nav.random();     // snap a point onto walkable ground; a random spot
//     crowd = nav.crowd();                                     // optional: agents that steer round each other
//     g.agent = crowd.add(guard.position, { speed: 3.5, radius: .4 });
//   }
//   update(dt) {
//     g.agent.goto(hero.position);                            // keep asking; it re-plans as the hero moves
//     crowd.update(dt);                                       // moves every agent (call once per frame)
//     guard.position.copy(g.agent.position);                  // you move the mesh, face it with g.agent.velocity
//   }
//
// Units are your scene's (metres, y up). cell (default radius / 2) sets the map's detail: smaller is
// more exact but slower to build. Like physics, the engine loads the first time a game needs it.

import { lazy } from './lazy.js';
import { need, pause, built } from './slices.js';
import { runNav, canRunNav } from './jobs.js';
import { Vector3, Mesh } from 'three';

const engine = lazy('3D path finding', () => Promise.all([import('recast-navigation'), import('recast-navigation/generators')]).then(async ([core, gen]) => {
  await core.init();
  return { ...core, ...gen };
}));
export const loadNav3D = () => engine.load();
export const nav3DReady = () => engine.ready;

const live = [];
const v3 = p => p instanceof Vector3 ? p : new Vector3(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]);
const plain = p => ({ x: p.x ?? p[0], y: p.y ?? p[1], z: p.z ?? p[2] });

// a short name for a level: every number of its triangles and settings folded together
function hashOf(P, I, cfg) {
  let h = 2166136261; const mix = v => { h ^= v; h = Math.imul(h, 16777619); };
  const b = new Uint32Array(P.buffer, 0, P.length); for (let i = 0; i < b.length; i++) mix(b[i]);
  for (let i = 0; i < I.length; i++) mix(I[i]);
  const c = JSON.stringify(cfg); for (let i = 0; i < c.length; i++) mix(c.charCodeAt(i));
  return (h >>> 0).toString(36) + '.' + P.length + '.' + I.length;
}
/** The triangles of these meshes (and their children), in world space. */
function triangles(objects) {
  const pos = [], idx = [], v = new Vector3();
  for (const root of objects) {
    root.updateMatrixWorld?.(true);
    root.traverse?.(o => {
      if (!(o instanceof Mesh) || !o.geometry?.attributes?.position || o.userData.noNav) return;
      const g = o.geometry, p = g.attributes.position, base = pos.length / 3;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
      else for (let i = 0; i < p.count; i++) idx.push(base + i);
    });
  }
  return { pos, idx };
}

export class NavMesh3D {
  constructor(objects, { radius = .4, height = 1.8, climb = .4, slope = 45, cell, maxEdge = 12 } = {}) {
    const R = this.R = engine.get();
    const { pos, idx } = triangles([].concat(objects));
    if (!idx.length) throw new Error('NavMesh3D: no meshes to build from');
    const cs = cell ?? Math.max(.05, radius / 2), ch = cs / 2;
    const cfg = { cs, ch, walkableRadius: Math.ceil(radius / cs), walkableHeight: Math.ceil(height / ch), walkableClimb: Math.floor(climb / ch), walkableSlopeAngle: slope, maxEdgeLen: Math.round(maxEdge / cs), maxSimplificationError: 1.3, minRegionArea: 8, mergeRegionArea: 20, maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1 };
    // While a card loads, the map is built in a background worker and read back in here (the card waits
    // for it: slices.js need). What is asked is the level itself: its triangles and the walker's size.
    const P = new Float32Array(pos), I = new Uint32Array(idx);
    const bytes = need('Path map', 'nav|' + hashOf(P, I, cfg), () => canRunNav() && runNav({ pos: P, idx: I, cfg }));
    let res = null;
    if (bytes) { try { res = { success: true, navMesh: R.importNavMesh(bytes).navMesh }; } catch (e) { res = null; } }
    if (!res) { pause('Path map'); res = R.generateSoloNavMesh(P, I, cfg); built(); }
    if (!res.success) throw new Error('NavMesh3D: could not build the walkable map (' + (res.error || 'unknown') + ')');
    this.mesh = res.navMesh; this.query = new R.NavMeshQuery(this.mesh); this.reach = { x: radius * 4 + 1, y: height + climb + 1, z: radius * 4 + 1 };
    // wasm memory isn't freed by the garbage collector: keep the few newest maps, free older ones
    live.push(this); while (live.length > 4) live.shift().destroy();
  }
  /** Corners of the shortest walk from a to b (Vector3s), or [] if b can't be reached. */
  path(a, b) {
    const r = this.query.computePath(plain(a), plain(b), { halfExtents: this.reach });
    const pts = Array.isArray(r) ? r : r?.success ? r.path : [];
    return pts.map(p => new Vector3(p.x, p.y, p.z));
  }
  /** Is there a walk from a to b? */
  reachable(a, b) { const p = this.path(a, b); if (!p.length) return false; return p[p.length - 1].distanceTo(this.closest(b)) < .3; }
  /** The nearest walkable point to p (a Vector3), or p itself if nothing is near. */
  closest(p) { const r = this.query.findClosestPoint(plain(p), { halfExtents: this.reach }); return r.success ? new Vector3(r.point.x, r.point.y, r.point.z) : v3(p).clone(); }
  /** A random walkable point (near p within radius, if given). */
  random(p, radius) {
    const r = p ? this.query.findRandomPointAroundCircle(plain(p), radius ?? 5, { halfExtents: this.reach }) : this.query.findRandomPoint();
    const q = r.randomPoint || r.point; return r.success && q ? new Vector3(q.x, q.y, q.z) : null;
  }
  /** Agents that walk the map and steer round each other. */
  crowd({ max = 32, maxRadius = 1 } = {}) { return new Crowd3D(this, max, maxRadius); }
  destroy() { if (this.gone) return; this.gone = true; this.crowds?.forEach(c => c.destroy()); this.query?.destroy?.(); this.mesh?.destroy?.(); const i = live.indexOf(this); if (i >= 0) live.splice(i, 1); }
}

class Agent3D {
  constructor(crowd, raw) { this.crowd = crowd; this.raw = raw; this._p = new Vector3(); this._v = new Vector3(); this.target = null; }
  get position() { const p = this.raw.position(); return this._p.set(p.x, p.y, p.z); }
  get velocity() { const v = this.raw.velocity(); return this._v.set(v.x, v.y, v.z); }
  get speed() { const v = this.raw.velocity(); return Math.hypot(v.x, v.z); }
  /** Walks towards p (call as often as you like; it only re-plans when p has moved). */
  goto(p) {
    if (this.target && this.target.distanceToSquared(p) < .04) return this;
    this.target = v3(p).clone(); this.raw.requestMoveTarget(plain(this.crowd.nav.closest(p))); return this;
  }
  stop() { this.target = null; this.raw.resetMoveTarget?.(); return this; }
  place(p) { this.raw.teleport(plain(this.crowd.nav.closest(p))); return this; }
  /** Close to where it was sent? */
  arrived(within = .3) { return !this.target || this.position.distanceTo(this.target) <= within || (this.speed < .05 && this.position.distanceTo(this.crowd.nav.closest(this.target)) <= within); }
  set maxSpeed(s) { this.raw.maxSpeed = s; }
  remove() { this.crowd.raw.removeAgent(this.raw); this.crowd.agents.delete(this); }
}

class Crowd3D {
  constructor(nav, max, maxRadius) { this.nav = nav; this.raw = new nav.R.Crowd(nav.mesh, { maxAgents: max, maxAgentRadius: maxRadius }); this.agents = new Set(); (nav.crowds ||= []).push(this); }
  add(p, { speed = 3.5, radius = .4, height = 1.8, accel = speed * 4, separation = 1 } = {}) {
    const raw = this.raw.addAgent(plain(this.nav.closest(p)), { radius, height, maxSpeed: speed, maxAcceleration: accel, separationWeight: separation, collisionQueryRange: radius * 8, pathOptimizationRange: radius * 30 });
    const a = new Agent3D(this, raw); this.agents.add(a); return a;
  }
  update(dt) { if (dt > 0) this.raw.update(Math.min(dt, .1)); return this; }
  destroy() { this.raw.destroy?.(); this.agents.clear(); }
}
