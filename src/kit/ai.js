// Game AI: enemies and creatures that chase, flee, wander, patrol, flock and find their way round
// walls. Steering and path finding come from Yuka (mugen87.github.io/yuka, MIT); this kit puts them
// in your game's 2D units (pixels, y down) so you don't deal with Yuka's 3D maths.
//
//   const { Crowd, NavGrid, Brain } = gs.ai;
//   reset() {
//     crowd = new Crowd();
//     bat = crowd.add(50, 50, { speed: 120 }).chase(player);   // keeps after the player (anything with x, y)
//     sheep = crowd.add(200, 300, { speed: 60 }).wander().flock();
//   }
//   update(dt) { crowd.update(dt); }                            // moves everyone; read bat.x, bat.y, bat.angle
//
// For hundreds or thousands of simple flockers (shoals, bats, hordes) use Swarm (swarm.js), which
// runs on the graphics chip where the phone can.
//
//   nav = new NavGrid(20, 30, 16, (cx, cy) => level[cy][cx] === '#');   // cols, rows, cell size, is it a wall?
//   const route = nav.path(bat.x, bat.y, player.x, player.y);           // [{ x, y }, ...] round the walls, or null
//   bat.follow(route);  or crowd.add(...).hunt(player, nav)             // re-plans the route as the player moves
//
//   brain = new Brain('patrol', {                                       // simple states
//     patrol: { enter: () => guard.follow(beat, true), update: dt => { if (sees) brain.go('chase'); } },
//     chase:  { enter: () => guard.chase(player),      update: dt => { if (brain.time > 5) brain.go('patrol'); } },
//   });  update(dt): brain.update(dt);
//
// The whole Yuka library is there as gs.ai.YUKA for anything else (fuzzy logic, goals, vision, nav meshes).

import { timed } from './prof.js';
import * as YUKA from 'yuka';
export { YUKA };
export { Swarm } from './swarm.js';
export { Tree, Choose } from './bt.js';
const { Vehicle, EntityManager, Vector3, SeekBehavior, FleeBehavior, ArriveBehavior, PursuitBehavior, EvadeBehavior, WanderBehavior,
  FollowPathBehavior, SeparationBehavior, AlignmentBehavior, CohesionBehavior, Path, Graph, NavNode, NavEdge, AStar } = YUKA;

const v3 = (x, y) => new Vector3(x, 0, y);
const STEER = ['seek', 'arrive', 'flee', 'pursue', 'evade', 'wander', 'follow', 'sep', 'align', 'coh'];

/** One moving creature. x, y, vx, vy, angle (radians, 0 = facing right), speed. tag is yours. */
class Agent {
  constructor(crowd, x, y, { speed = 100, force, radius = 10, mass = 1, agility = 6, tag } = {}) {
    this.crowd = crowd; this.tag = tag; this.r = radius; this.dead = false;
    const v = this.v = new Vehicle();
    v.position.set(x, 0, y); v.maxSpeed = speed; v.maxForce = force ?? speed * 4; v.mass = mass / agility;   // Yuka's steering reacts in about mass seconds v.boundingRadius = radius;
    v.updateOrientation = false; v.neighborhoodRadius = radius * 6; v.updateNeighborhood = false;
    this.b = {}; this.targets = []; this.hunting = null; this._angle = 0;
  }
  get x() { return this.v.position.x; } set x(n) { this.v.position.x = n; }
  get y() { return this.v.position.z; } set y(n) { this.v.position.z = n; }
  get vx() { return this.v.velocity.x; } get vy() { return this.v.velocity.z; }
  get angle() { return this._angle; }
  get speed() { return this.v.getSpeed(); }
  /** Top speed (game units per second). */
  get maxSpeed() { return this.v.maxSpeed; } set maxSpeed(n) { this.v.maxSpeed = n; }
  place(x, y) { this.v.position.set(x, 0, y); this.v.velocity.set(0, 0, 0); return this; }
  set(kind, beh, weight = 1) {
    if (this.b[kind]) this.v.steering.remove(this.b[kind]);
    beh.weight = weight; this.b[kind] = beh; this.v.steering.add(beh); return this;
  }
  drop(...kinds) { for (const k of kinds) if (this.b[k]) { this.v.steering.remove(this.b[k]); delete this.b[k]; } this.targets = this.targets.filter(t => !kinds.includes(t.kind)); }
  track(kind, target, vec) { this.targets = this.targets.filter(t => t.kind !== kind); if (target && typeof target === 'object') this.targets.push({ kind, target, vec }); }
  /** Stops all steering (it slows to a halt). */
  stop() { this.drop(...STEER); this.hunting = null; return this; }
  /** Heads straight for a point or a thing (anything with x, y), at full speed. */
  seek(target, weight = 1) { this.drop('arrive', 'pursue', 'follow'); const b = new SeekBehavior(v3(target.x, target.y)); this.track('seek', target, b.target); return this.set('seek', b, weight); }
  /** Goes to a point or thing and slows down to stop there (slow: seconds it takes to ease in). */
  arrive(target, weight = 1, slow = .3) { this.drop('seek', 'pursue', 'follow'); const b = new ArriveBehavior(v3(target.x, target.y), slow); this.track('arrive', target, b.target); return this.set('arrive', b, weight); }
  /** Runs from a point or thing when it is closer than `panic` units. */
  flee(target, panic = 150, weight = 1) { const b = new FleeBehavior(v3(target.x, target.y), panic); this.track('flee', target, b.target); return this.set('flee', b, weight); }
  /** Chases another agent, aiming where it's going to be. For a plain thing (the player) use chase(). */
  pursue(agent, weight = 1) { this.drop('seek', 'arrive', 'follow'); return this.set('pursue', new PursuitBehavior(agent.v), weight); }
  /** Runs from another agent, allowing for where it's heading. */
  evade(agent, panic = 150, weight = 1) { return this.set('evade', new EvadeBehavior(agent.v, panic), weight); }
  /** Keeps after anything with x, y (an agent, the player...): aims ahead if it knows its speed (vx, vy). */
  chase(target, weight = 1) { if (target instanceof Agent) return this.pursue(target, weight); this.lead = true; return this.seek(target, weight); }
  /** Wanders about at random. */
  wander(weight = .5, { radius = 1, distance = 3, jitter = 30 } = {}) {
    const b = new WanderBehavior(radius * this.r, distance * this.r, jitter * this.r / 5); return this.set('wander', b, weight);
  }
  /** Walks a route [{ x, y }, ...] (or [[x, y], ...]); loop goes round and round. */
  follow(points, loop = false, weight = 1) {
    this.drop('seek', 'arrive', 'pursue');
    if (!points || !points.length) return this.drop('follow'), this;
    const p = new Path(); p.loop = loop;
    for (const q of points) p.add(Array.isArray(q) ? v3(q[0], q[1]) : v3(q.x, q.y));
    const f = new FollowPathBehavior(p, this.r * 2); f._arrive.deceleration = .3; this.end = p._waypoints[p._waypoints.length - 1];
    this.set('follow', f, weight);
    return this;
  }
  /** Has it reached the end of its route? */
  get arrived() { const b = this.b.follow; return !b || (b.path.finished() && (b.path.loop || Math.hypot(this.end.x - this.x, this.end.z - this.y) < this.r * 2)); }
  /** Chases a target round the walls of a NavGrid, re-planning as it moves (every `every` seconds). */
  hunt(target, nav, every = .4) { this.stop(); this.hunting = { target, nav, every, t: 0 }; return this; }
  /** Keeps its distance from the others in the crowd. */
  separate(weight = 1.5) { this.v.updateNeighborhood = true; return this.set('sep', new SeparationBehavior(), weight); }
  /** Moves with the others nearby like a flock or shoal: stays close, faces the same way, doesn't bump. */
  flock(weight = 1) {
    this.v.updateNeighborhood = true;
    this.set('sep', new SeparationBehavior(), weight * 1.6); this.set('align', new AlignmentBehavior(), weight); return this.set('coh', new CohesionBehavior(), weight * .8);
  }
  /** Agents in the crowd within `radius`. */
  near(radius = this.r * 6) { return this.crowd.agents.filter(a => a !== this && Math.hypot(a.x - this.x, a.y - this.y) < radius); }
  remove() { this.crowd.remove(this); }
  tick(dt) {
    for (const t of this.targets) {
      let x = t.target.x, y = t.target.y;
      if (this.lead && t.kind === 'seek' && (t.target.vx || t.target.vy)) { const ahead = Math.min(1, Math.hypot(x - this.x, y - this.y) / (this.v.maxSpeed || 1)); x += t.target.vx * ahead; y += t.target.vy * ahead; }
      t.vec.set(x, 0, y);
    }
    const h = this.hunting;
    if (h && (h.t -= dt) <= 0) {
      h.t = h.every;
      const route = h.nav.path(this.x, this.y, h.target.x, h.target.y);
      if (route && route.length > 1) { const keep = this.hunting; this.follow(route.slice(1)); this.hunting = keep; }
      else { const keep = this.hunting; this.arrive(h.target); this.hunting = keep; }
    }
  }
}

/** A group of agents that move together and know about each other. */
export class Crowd {
  constructor() { this.em = new EntityManager(); this.agents = []; }
  /** Adds an agent at (x, y). Options: speed, agility (how quickly it turns and brakes, default 6), force (the most it can steer), radius, mass, tag. */
  add(x, y, o = {}) { const a = new Agent(this, x, y, o); this.agents.push(a); this.em.add(a.v); return a; }
  remove(a) { if (a.dead) return; a.dead = true; this.em.remove(a.v); this.agents = this.agents.filter(x => x !== a); }
  clear() { for (const a of [...this.agents]) this.remove(a); }
  update(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, .1);
    for (const a of this.agents) a.tick(dt);
    this.em.update(dt);
    for (const a of this.agents) {
      a.v.position.y = 0; a.v.velocity.y = 0;
      if (a.v.getSpeed() > 1) a._angle = Math.atan2(a.v.velocity.z, a.v.velocity.x);
    }
  }
}

/**
 * A grid level for path finding: cols × rows cells of `cell` units, and wall(cx, cy) says which are
 * blocked. path() finds the shortest way round the walls (A*), diagonals included unless diagonal: false.
 */
export class NavGrid {
  constructor(cols, rows, cell, wall = () => false, { diagonal = true } = {}) {
    this.cols = cols; this.rows = rows; this.cell = cell; this.diagonal = diagonal;
    this.walls = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) this.walls[y * cols + x] = wall(x, y) ? 1 : 0;
    this.build();
  }
  build() {
    const g = this.graph = new Graph(); g.digraph = true;
    const { cols, rows, cell } = this;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g.addNode(new NavNode(y * cols + x, new Vector3((x + .5) * cell, 0, (y + .5) * cell)));
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) this.link(x, y);
  }
  link(x, y) {
    const i = y * this.cols + x, g = this.graph;
    for (const e of [...(g._edges.get(i) || [])]) g.removeEdge(e);
    if (this.walls[i]) return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!this.open(nx, ny)) continue;
      if (dx && dy && (!this.diagonal || !this.open(x + dx, y) || !this.open(x, y + dy))) continue;   // no cutting corners
      g.addEdge(new NavEdge(i, ny * this.cols + nx, Math.hypot(dx, dy)));
    }
  }
  open(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows && !this.walls[cy * this.cols + cx]; }
  /** Is the cell under (x, y) a wall? */
  blocked(x, y) { return !this.open(Math.floor(x / this.cell), Math.floor(y / this.cell)); }
  /** Changes a cell (doors, broken walls, placed towers). */
  set(cx, cy, wall) {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    this.walls[cy * this.cols + cx] = wall ? 1 : 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < this.cols && ny < this.rows) this.link(nx, ny); }
  }
  /** Shortest route from (x1, y1) to (x2, y2) as cell centres [{ x, y }, ...] (straightened), or null if there is none. */
  path(x1, y1, x2, y2) {
    const c = this.cell, a = Math.floor(y1 / c) * this.cols + Math.floor(x1 / c), b = Math.floor(y2 / c) * this.cols + Math.floor(x2 / c);
    if (!this.open(Math.floor(x1 / c), Math.floor(y1 / c)) || !this.open(Math.floor(x2 / c), Math.floor(y2 / c))) return null;
    if (a === b) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const s = new AStar(this.graph, a, b); s.search();
    if (!s.found) return null;
    const pts = s.getPath().map(i => { const p = this.graph.getNode(i).position; return { x: p.x, y: p.z }; });
    pts[0] = { x: x1, y: y1 }; pts[pts.length - 1] = { x: x2, y: y2 };
    // straighten: skip points we can see past
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) if (i === pts.length - 1 || !this.sees(out[out.length - 1].x, out[out.length - 1].y, pts[i + 1].x, pts[i + 1].y)) out.push(pts[i]);
    return out;
  }
  /** Is there a clear straight line from (x1, y1) to (x2, y2)? Line of sight for guards and turrets. */
  sees(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / (this.cell / 3));
    for (let i = 1; i < n; i++) { const t = i / n; if (this.blocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false; }
    return true;
  }
}

/**
 * A simple state machine ("brain"): one state at a time, each with optional enter(), update(dt) and
 * exit(). brain.state is the current name, brain.time how long it has been in it.
 */
export class Brain {
  constructor(start, states) { this.states = states; this.state = null; this.time = 0; this.go(start); }
  go(name) {
    if (name === this.state || !this.states[name]) return this;
    this.states[this.state]?.exit?.();
    this.prev = this.state; this.state = name; this.time = 0;
    this.states[name].enter?.();
    return this;
  }
  is(name) { return this.state === name; }
  update(dt) { this.time += dt; this.states[this.state]?.update?.(dt); return this; }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Crowd.prototype, 'update', 'AI');
timed(Brain.prototype, 'update', 'AI');
