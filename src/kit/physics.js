// Physics engine for 2D games: real rigid-body physics from Rapier (rapier.rs, free, Apache-2.0).
// Shapes spin and tumble, and you can join them with hinges, ropes, springs, welds and sliders:
// slingshots, bridges, wrecking balls, ragdolls, cars, stacking, pinball.
//
// Everything is in your game's own units (pixels) with y pointing down, like the canvas. Angles
// are radians, clockwise on screen, so c.rotate(thing.angle) just works.
//
//   import gs from '../gamescroll.js';
//   const { Physics } = gs.physics;
//   let phys;
//   reset() { phys = new Physics({ gravity: 900, walls: [0, 0, W, H] });          // make it in make() or reset()
//             crate = phys.box(100, 50, 30, 30, { bounce: .2 });                   // centre x, y, width, height
//             ball = phys.circle(200, 40, 12, { bounce: .6 }); }
//   phys.onHit((a, b, speed) => { if (speed > 200) feel.hit(a.x, a.y); });
//   update(dt) { phys.step(dt); }
//   draw(c)    { for (const t of phys.things) { phys.path(c, t); c.fill(); } }   // or draw your own art at t.x, t.y, t.angle
//
// The engine is a few MB, so the app loads it the first time a game that uses it comes up in the
// feed, before the game is shown: just create your Physics in make() or reset(), not later. The raw
// engine is there too (phys.R, phys.world) for anything the helpers don't cover; it works in metres,
// so use phys.toWorld(x) / phys.toGame(m) to convert.

import { timed } from './prof.js';
import { lazy } from './lazy.js';
import { wasmSimd } from './simd.js';
import { own } from './cleanup.js';
import { tick } from './tick.js';
// The SIMD build where the phone has WebAssembly SIMD (faster: Neon on ARM phones), else the plain one.
// Same engine and API; only one of the two is ever downloaded.
const engine = lazy('The physics engine', () => (wasmSimd() ? import('@dimforge/rapier2d-simd-compat') : import('@dimforge/rapier2d-compat')).then(async m => {
  const r = m.default?.init ? m.default : m;
  await r.init();
  return r;
}));
let R = null;
/** Loads the engine (the app does this for you before showing a game that uses it). */
export const loadPhysics = () => engine.load().then(r => (R = r));
/** True once the engine is loaded. */
export const physicsReady = () => engine.ready;

const ALL = 0xffff;
const groups = (member, filter) => ((member & ALL) << 16) | (filter & ALL);

/**
 * One body in the world. Read x, y, angle, vx, vy, spin (game units) any time; set them to move it.
 * kind: 'circle' | 'box' | 'poly' | 'line'; r for circles, w and h for boxes, points for polygons
 * and lines. tag is yours to use.
 */
class Thing {
  constructor(phys, body, collider, kind, size, tag) {
    this.phys = phys; this.body = body; this.collider = collider; this.kind = kind; this.tag = tag; this.dead = false;
    Object.assign(this, size);
    body.userData = this; this.fx = 0; this.fy = 0;
  }
  get x() { return this.body.translation().x * this.phys.scale; }
  get y() { return this.body.translation().y * this.phys.scale; }
  set x(v) { const p = this.body.translation(); this.body.setTranslation({ x: v / this.phys.scale, y: p.y }, true); }
  set y(v) { const p = this.body.translation(); this.body.setTranslation({ x: p.x, y: v / this.phys.scale }, true); }
  get angle() { return this.body.rotation(); }
  set angle(a) { this.body.setRotation(a, true); }
  /** Where to draw it: between the last two ticks on a fixed-tick game (`tick: 60`), else x / y / angle. */
  get sx() { const w = this._was; return w ? w.x + (this.x - w.x) * tick.alpha : this.x; }
  get sy() { const w = this._was; return w ? w.y + (this.y - w.y) * tick.alpha : this.y; }
  get sangle() { const w = this._was; return w ? tick.turn(w.a, this.angle) : this.angle; }
  get vx() { return this.body.linvel().x * this.phys.scale; }
  get vy() { return this.body.linvel().y * this.phys.scale; }
  set vx(v) { const l = this.body.linvel(); this.body.setLinvel({ x: v / this.phys.scale, y: l.y }, true); }
  set vy(v) { const l = this.body.linvel(); this.body.setLinvel({ x: l.x, y: v / this.phys.scale }, true); }
  /** Spin speed in radians per second (clockwise +). */
  get spin() { return this.body.angvel(); }
  set spin(v) { this.body.setAngvel(v, true); }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get fixed() { return this.body.isFixed(); }
  get sleeping() { return this.body.isSleeping(); }
  get mass() { return this.body.mass(); }
  /** Moves it straight to (x, y), optionally turned to angle. */
  place(x, y, angle = this.angle) {
    const s = this.phys.scale;
    if (this.body.isKinematic()) { this.body.setNextKinematicTranslation({ x: x / s, y: y / s }); this.body.setNextKinematicRotation(angle); }
    else { this.body.setTranslation({ x: x / s, y: y / s }, true); this.body.setRotation(angle, true); }
    return this;
  }
  /** An instant kick in game units per second: push(0, -400) is a jump. At (px, py) it also spins. */
  push(ix, iy, px, py) {
    const s = this.phys.scale, m = this.body.mass();
    if (px == null) this.body.applyImpulse({ x: ix / s * m, y: iy / s * m }, true);
    else this.body.applyImpulseAtPoint({ x: ix / s * m, y: iy / s * m }, { x: px / s, y: py / s }, true);
    return this;
  }
  /** A steady push for this frame (call it every update): thrusters, wind, magnets. Same units as gravity. */
  force(fx, fy) { this.fx += fx; this.fy += fy; return this; }
  /** Spins it up by `amount` radians per second. */
  twist(amount) { this.body.setAngvel(this.body.angvel() + amount, true); return this; }
  /** Is the point (game units) inside this thing? */
  contains(px, py) { return this.collider.containsPoint({ x: px / this.phys.scale, y: py / this.phys.scale }); }
  /** The things it is touching right now. */
  touching() {
    const out = [];
    this.phys.world.contactPairsWith(this.collider, c => { const t = c.parent()?.userData; if (t && t !== this) out.push(t); });
    return out;
  }
  /** Is it standing on something (for "can jump")? */
  onGround(gap = 2) {
    const half = this.kind === 'circle' ? this.r : this.kind === 'box' ? this.h / 2 : 0;
    const hit = this.phys.ray(this.x, this.y, this.x, this.y + half + gap, t => t !== this && !t.collider.isSensor());
    return !!hit;
  }
  remove() { this.phys.remove(this); }
}

export class Physics {
  /**
   * gravity: downward pull in game units per second² (or { x, y }). scale: game units per metre
   * (30 suits most phone games: a 30 px crate behaves like a 1 m crate). walls: [x, y, w, h] puts
   * solid walls round that rectangle.
   */
  constructor({ gravity = 900, scale = 30, walls = null } = {}) {
    R = engine.get();
    this.R = R; this.scale = scale;
    const g = typeof gravity === 'number' ? { x: 0, y: gravity } : gravity;
    this.gravity = { x: g.x || 0, y: g.y || 0 };
    this.world = new R.World({ x: (g.x || 0) / scale, y: (g.y || 0) / scale });
    this.events = new R.EventQueue(true);
    own(this);   // freed when the card leaves the feed (src/kit/cleanup.js)
    this.things = []; this.joints = []; this.hits = []; this.time = 0; this.walkers = []; this.met = []; this.steps = 0;
    this.ground = this.world.createRigidBody(R.RigidBodyDesc.fixed());   // the world, for hinges "to nothing"
    if (walls) this.walls(...walls);
  }
  /** Free the physics engine's memory for this world. The app does this when the card leaves the
   *  feed; a game can call it too, when it drops a world. Don't use the world afterwards. */
  free() {
    if (!this.world) return;
    try { this.events.free(); } catch (_) { /* already gone */ }
    for (const w of this.walkers) try { this.world.removeCharacterController(w.ctl); } catch (_) { /* already gone */ }
    this.world.free(); this.world = null;
  }
  toWorld(v) { return v / this.scale; }
  toGame(m) { return m * this.scale; }
  v(x, y) { return { x: x / this.scale, y: y / this.scale }; }

  /* ---------- making things ---------- */
  make(x, y, o, kind, size, desc) {
    const D = o.fixed ? R.RigidBodyDesc.fixed() : o.moving ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    D.setTranslation(x / this.scale, y / this.scale).setRotation(o.angle || 0)
      .setLinearDamping(o.drag ?? 0).setAngularDamping(o.spinDrag ?? .05).setGravityScale(o.gravity ?? 1).setCcdEnabled(!!o.bullet);
    if (o.vx || o.vy) D.setLinvel((o.vx || 0) / this.scale, (o.vy || 0) / this.scale);
    if (o.spin) D.setAngvel(o.spin);
    if (o.noSpin) D.lockRotations();
    const body = this.world.createRigidBody(D);
    desc.setDensity(o.density ?? 1).setFriction(o.friction ?? .4).setRestitution(o.bounce ?? .1).setSensor(!!o.sensor)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    if (o.group) { const bit = 1 << Math.max(0, Math.min(14, o.group)); desc.setCollisionGroups(groups(bit, ALL & ~bit)); }
    const collider = this.world.createCollider(desc, body);
    const t = new Thing(this, body, collider, kind, size, o.tag);
    this.things.push(t);
    return t;
  }
  /**
   * Options for every shape: bounce (0..1), friction (0..1), density (heavier per area, default 1),
   * fixed (never moves), moving (moves only where you place() it: platforms, paddles), sensor
   * (reports hits but doesn't push: pickups, goal zones), bullet (fast things that mustn't pass
   * through walls), noSpin (stays upright: players), angle, spin, vx, vy, drag, gravity (multiplier:
   * 0 floats), group (1-14: things in the same group never hit each other), tag.
   */
  circle(x, y, r, o = {}) { return this.make(x, y, o, 'circle', { r }, R.ColliderDesc.ball(r / this.scale)); }
  box(x, y, w, h, o = {}) { return this.make(x, y, o, 'box', { w, h }, R.ColliderDesc.cuboid(w / 2 / this.scale, h / 2 / this.scale)); }
  /** A convex shape from points [[x, y], ...] relative to (x, y). */
  poly(x, y, points, o = {}) {
    const desc = R.ColliderDesc.convexHull(new Float32Array(points.flatMap(([px, py]) => [px / this.scale, py / this.scale])));
    if (!desc) throw new Error('poly() needs at least 3 points that are not in a line');
    return this.make(x, y, o, 'poly', { points }, desc);
  }
  /** A fixed line or ground through points [[x, y], ...] (game positions): hills, slopes, ramps. loop closes it. */
  line(points, o = {}) {
    const pts = o.loop ? [...points, points[0]] : points;
    const desc = R.ColliderDesc.polyline(new Float32Array(pts.flatMap(([px, py]) => [px / this.scale, py / this.scale])));
    return this.make(0, 0, { ...o, fixed: true }, 'line', { points, loop: !!o.loop }, desc);
  }
  /** Solid walls round a rectangle. */
  walls(x, y, w, h, o = {}) { return this.line([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { friction: .5, ...o, loop: true, tag: o.tag ?? 'wall' }); }
  remove(t) {
    if (!t || t.dead) return;
    t.dead = true;
    for (const j of this.joints) if (j.a === t || j.b === t) j.dead = true;
    this.joints = this.joints.filter(j => !j.dead);
    if (t.ctl) { try { this.world.removeCharacterController(t.ctl); } catch (_) { /* already gone */ } this.walkers = this.walkers.filter(x => x !== t); if (t.owner?.thing === t) t.owner.thing = null; }
    this.world.removeRigidBody(t.body);   // also removes its collider and joints
    this.things = this.things.filter(x => x !== t);
  }
  clear() { for (const t of [...this.things]) this.remove(t); }

  /* ---------- things your code steers, and tile levels ---------- */
  /**
   * Moves a box your code steers (a gs.movers Platformer or TopDown, a gs.vehicles Car, or any { x, y, w, h }, or { x, y, r }
   * for a round one) by dx, dy game units as far as the world lets it: it stops at walls and slides along them, walks up
   * `step`s and slopes up to `slope` degrees, keeps to the ground going down (`snap`), and shoves loose things out of
   * its way (mass: how hard, kg). It is solid itself, so things land on it and bounce off it, and onHit(box.thing, thing,
   * speed) tells you what it ran into. With no gravity (a top-down game) there is no up: walls are walls all round.
   * Returns { left, right, up, down, hits: [{ thing, nx, ny, x, y }] } as gs.tiles' TileMap.move does, so
   * hero.update(dt, phys, input) just works. angle: turns it (a car from above). drop: falls through one-way tiles.
   */
  move(box, dx, dy, { step = null, slope = 50, snap = null, mass = 80, angle = null, drop = false } = {}) {
    if (!this.steps) this.queries();   // (a world made this frame: what is in it is not yet where queries look)
    const S = this.scale, side = this.gravity.y || this.gravity.x ? 1 : 0, w = box.thing && !box.thing.dead ? box.thing : this.walker(box, mass);
    const size = box.r != null ? box.r * 2 : box.h ?? 16;
    if (w.size !== size) this.walkerShape(w, box);
    const c = w.ctl;
    if (side && w.cfg !== `${step}|${slope}|${snap}`) {   // (a platformer: up is against gravity; steps, slopes and sticking to the ground)
      w.cfg = `${step}|${slope}|${snap}`; const g = this.gravity, l = Math.hypot(g.x, g.y);
      c.setUp({ x: -g.x / l, y: -g.y / l }); const st = (step ?? size * .35) / S, sn = (snap ?? size * .35) / S;
      if (st > 0) c.enableAutostep(st, Math.min(st, 4 / S), false); else c.disableAutostep();
      if (sn > 0) c.enableSnapToGround(sn); else c.disableSnapToGround();
      c.setMaxSlopeClimbAngle(slope * Math.PI / 180); c.setMinSlopeSlideAngle(Math.PI / 2);
    } else if (!side && w.cfg !== 'flat') { w.cfg = 'flat'; c.disableAutostep(); c.disableSnapToGround(); c.setMaxSlopeClimbAngle(0); c.setMinSlopeSlideAngle(Math.PI / 2); }
    c.setCharacterMass(mass);
    // where it is now: where your code says (it may have put it somewhere new itself), turned to angle
    const t = w.body.translation(), from = w.to || t, bx = box.x / S, by = box.y / S;
    if (Math.abs(from.x - bx) > 1e-4 || Math.abs(from.y - by) > 1e-4) { w.body.setTranslation({ x: bx, y: by }, true); w.from = { x: bx, y: by }; w.to = null; }
    else if (from !== t) w.body.setTranslation(from, false);
    if (angle != null) { w.body.setRotation(angle, false); w.angle = angle; }
    const W = this.world, ts = W.timestep, dt = this.dt || 1 / 60; W.timestep = Math.max(1 / 240, Math.min(dt, 1 / 15));
    const bottom = box.y + size / 2;
    c.computeColliderMovement(w.collider, { x: dx / S, y: dy / S }, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, col => {
      const o = col.userData; if (!o?.oneWay) return true;   // (one-way tiles: only from above, and not when dropping through)
      return !drop && dy >= 0 && bottom <= o.top + 1;
    });
    W.timestep = ts;
    const m = c.computedMovement(), hit = { left: false, right: false, up: false, down: false, hits: [] };
    box.x += m.x * S; box.y += m.y * S;
    w.from = w.from || { x: bx, y: by }; w.to = { x: box.x / S, y: box.y / S };
    const g = this.gravity, gl = Math.hypot(g.x, g.y) || 1, ux = -g.x / gl, uy = -g.y / gl;
    for (let i = 0, n = c.numComputedCollisions(); i < n; i++) {
      const k = c.computedCollision(i); if (!k) continue;
      const thing = k.collider?.parent()?.userData || null, nx = k.normal1.x, ny = k.normal1.y, x = k.witness1.x * S, y = k.witness1.y * S;
      hit.hits.push({ thing, nx, ny, x, y });
      if (thing && !thing.fixed && !thing.body.isKinematic() && thing.mass < mass * 2) { if (thing !== w) this.meet(w, thing, (dx * -nx + dy * -ny) / dt, x, y); continue; }   // (something it shoves along: not a wall)
      if (side) { const up = nx * ux + ny * uy; if (up > .6) hit.down = true; else if (up < -.6) hit.up = true; else if (nx * uy - ny * ux > 0) hit.right = true; else hit.left = true; }
      else if (Math.abs(nx) > Math.abs(ny)) hit[nx > 0 ? 'left' : 'right'] = true; else hit[ny > 0 ? 'up' : 'down'] = true;
      if (thing && thing !== w) this.meet(w, thing, (dx * -nx + dy * -ny) / dt, x, y);
    }
    if (side && c.computedGrounded()) hit.down = true;
    if (side) box.onGround = hit.down;
    box.hit = hit; return hit;
  }
  // the body of a box moved with move(): a kinematic shape and a character controller
  walker(box, mass) {
    const S = this.scale, body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(box.x / S, box.y / S));
    const w = new Thing(this, body, null, 'box', { w: box.w ?? (box.r ?? 8) * 2, h: box.h ?? (box.r ?? 8) * 2 }, box.tag ?? 'walker');
    w.owner = box; w.ctl = this.world.createCharacterController(.5 / S); w.ctl.setApplyImpulsesToDynamicBodies(true); w.ctl.setCharacterMass(mass);
    w.from = body.translation(); w.to = null; w.met = new Map();
    this.walkerShape(w, box); box.thing = w; this.things.push(w); this.walkers.push(w);
    return w;
  }
  walkerShape(w, box) {
    const S = this.scale; if (w.collider) this.world.removeCollider(w.collider, false);
    let d;
    if (box.r != null) { d = R.ColliderDesc.ball(box.r / S); w.kind = 'circle'; w.r = box.r; }
    else { const hw = (box.w ?? 16) / 2 / S, hh = (box.h ?? 16) / 2 / S, r = Math.min(hw, hh) * .25; d = R.ColliderDesc.roundCuboid(Math.max(.001, hw - r), Math.max(.001, hh - r), r); w.kind = 'box'; w.w = box.w ?? 16; w.h = box.h ?? 16; }   // (rounded corners: a sharp box catches on the joins of flat ground)
    w.collider = this.world.createCollider(d.setFriction(.2).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), w.body);
    w.size = box.r != null ? box.r * 2 : box.h ?? 16;
  }
  // a walker's own hits (it is kinematic, so Rapier reports none): one per thing it starts touching, as fast as it meant to go into it
  meet(w, thing, speed, x, y) { const was = w.met.has(thing); w.met.set(thing, 0); if (!was) this.met.push([w, thing, Math.max(0, speed), x, y]); }
  /** Takes a box moved with move() out of the world (its body goes). */
  unmove(box) { const w = box.thing; if (w && !w.dead) { this.remove(w); } box.thing = null; return this; }
  /**
   * Makes a gs.tiles TileMap solid: walls as a few merged boxes, slopes as ramps, one-way tiles as ledges that
   * things land on (move() boxes jump up through them, and drop through with drop: true). Crates, balls and
   * ragdolls then land on your level; move() boxes walk it. Returns its thing (kind 'tiles'); after changing tiles
   * (digging, building) call its rebuild().
   */
  tiles(map, { friction = .5, bounce = 0, tag = 'tiles' } = {}) {
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed()), t = new Thing(this, body, null, 'tiles', { map, rects: [], ramps: [] }, tag), S = this.scale;
    t.rebuild = () => {
      for (const c of t.colliders || []) this.world.removeCollider(c, false);
      t.colliders = []; t.rects = []; t.ramps = [];
      const sz = map.size, add = (d, data = null) => { d.setFriction(friction).setRestitution(bounce).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS); const c = this.world.createCollider(d, body); c.userData = data; t.colliders.push(c); return c; };
      // walls: runs along each row, joined with the same run in the rows below
      const open = new Map();
      for (let ty = 0; ty <= map.rows; ty++) {
        const runs = [];
        if (ty < map.rows) for (let tx = 0; tx < map.cols; tx++) { if (!map.solid(tx, ty)) continue; let e = tx; while (e + 1 < map.cols && map.solid(e + 1, ty)) e++; runs.push([tx, e]); tx = e; }
        const next = new Map();
        for (const [a, b] of runs) { const k = a + ',' + b, r = open.get(k); if (r) { r.y1 = ty; open.delete(k); next.set(k, r); } else next.set(k, { x0: a, x1: b, y0: ty, y1: ty }); }
        for (const r of open.values()) t.rects.push(r);
        open.clear(); for (const [k, r] of next) open.set(k, r);
      }
      for (const r of t.rects) { const w = (r.x1 - r.x0 + 1) * sz, h = (r.y1 - r.y0 + 1) * sz; add(R.ColliderDesc.cuboid(w / 2 / S, h / 2 / S).setTranslation((r.x0 * sz + w / 2) / S, (r.y0 * sz + h / 2) / S)); }
      for (let ty = 0; ty < map.rows; ty++) for (let tx = 0; tx < map.cols; tx++) {
        const i = map.info(tx, ty), x = tx * sz, y = ty * sz;
        if (i.slope) {   // '/' rises to the right, '\' to the left
          const pts = i.slope > 0 ? [x, y + sz, x + sz, y + sz, x + sz, y] : [x, y, x + sz, y + sz, x, y + sz];
          const d = R.ColliderDesc.convexHull(new Float32Array(pts.map(v => v / S))); if (d) { add(d); t.ramps.push(pts); }
        } else if (i.oneWay) { const h = Math.max(2, sz * .15); add(R.ColliderDesc.cuboid(sz / 2 / S, h / 2 / S).setTranslation((x + sz / 2) / S, (y + h / 2) / S), { oneWay: true, top: y }); t.rects.push({ x0: tx, x1: tx, y0: ty, y1: ty, oneWay: true }); }
      }
      if (!t.colliders.length) add(R.ColliderDesc.ball(.001).setSensor(true).setTranslation(-1e4, -1e4));
      t.collider = t.colliders[0];
      return t;
    };
    t.rebuild(); this.things.push(t);
    return t;
  }
  // a world not stepped yet: one tiny step so queries (move, rays) see what is in it
  queries() {
    const W = this.world, keep = [], asleep = [];
    W.forEachRigidBody(b => { if (b.isSleeping()) asleep.push(b); const n = b.isKinematic() && b.nextTranslation(); if (n) keep.push([b, n]); });
    const ts = W.timestep; W.timestep = 1e-9; W.step(this.events); W.timestep = ts; this.events.drainCollisionEvents(() => {});
    for (const [b, n] of keep) b.setNextKinematicTranslation(n);
    for (const b of asleep) b.sleep();
    this.steps++;
  }
  /**
   * The shapes near a box (x0, y0, x1, y1 game units), for things that aren't bodies (gs.soft's points, your own
   * particles) to stay out of: pass to outOf().
   */
  near(x0, y0, x1, y1, pad = 4) {
    const S = this.scale, out = [];
    this.world.collidersWithAabbIntersectingAabb({ x: (x0 + x1) / 2 / S, y: (y0 + y1) / 2 / S }, { x: ((x1 - x0) / 2 + pad) / S, y: ((y1 - y0) / 2 + pad) / S }, c => {
      if (c.isSensor()) return true;
      const t = c.parent()?.userData, p = c.translation(), type = c.shapeType(), T = R.ShapeType;
      const r = type === T.Ball ? c.radius() : type === T.Cuboid ? Math.hypot(c.halfExtents().x, c.halfExtents().y) : type === T.RoundCuboid ? Math.hypot(c.halfExtents().x, c.halfExtents().y) + c.roundRadius() : Infinity;
      out.push({ c, thing: t, x: p.x * S, y: p.y * S, r: r * S }); return true;
    });
    return out;
  }
  /**
   * Keeps a point of radius r out of the shapes from near(): returns null if it is clear, else { x, y (where it
   * should be), nx, ny (the way out), depth, thing }.
   */
  outOf(x, y, r, shapes) {
    const S = this.scale; let best = null;
    for (const o of shapes) {
      if (o.r !== Infinity && Math.hypot(x - o.x, y - o.y) > o.r + r) continue;
      const q = o.c.projectPoint({ x: x / S, y: y / S }, true); if (!q) continue;
      const px = q.point.x * S, py = q.point.y * S, dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
      if (q.isInside) {   // (inside: out the nearest way, which is past the surface point)
        const sp = o.c.projectPoint({ x: x / S, y: y / S }, false); if (!sp) continue;
        const sx = sp.point.x * S, sy = sp.point.y * S, ex = sx - x, ey = sy - y, e = Math.hypot(ex, ey) || 1e-6;
        const depth = e + r; if (!best || depth > best.depth) best = { x: sx + ex / e * r, y: sy + ey / e * r, nx: ex / e, ny: ey / e, depth, thing: o.thing };
      } else if (d < r) { const depth = r - d, nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1; if (!best || depth > best.depth) best = { x: px + nx * r, y: py + ny * r, nx, ny, depth, thing: o.thing }; }
    }
    return best;
  }

  /* ---------- joining things ---------- */
  // a and b are things; null means the fixed world. Points are game positions.
  bodyOf(t) { return t ? t.body : this.ground; }
  local(t, x, y) {   // a game position in a body's own frame, in metres
    const b = this.bodyOf(t), p = b.translation(), a = b.rotation(), dx = x / this.scale - p.x, dy = y / this.scale - p.y, c = Math.cos(-a), s = Math.sin(-a);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }
  keep(params, a, b, kind) {
    const joint = this.world.createImpulseJoint(params, this.bodyOf(a), this.bodyOf(b), true);
    const h = { joint, a, b, kind, dead: false, remove: () => { if (!h.dead) { h.dead = true; if (this.world.getImpulseJoint(joint.handle)) this.world.removeImpulseJoint(joint, true); this.joints = this.joints.filter(x => x !== h); } } };
    this.joints.push(h);
    return h;
  }
  /**
   * A hinge (pin) at (x, y): doors, flippers, wheels, pendulums. Options: motor (spin speed,
   * radians/s) and strength, and min / max angles to limit the swing.
   */
  hinge(a, b, x, y, o = {}) {
    const h = this.keep(R.JointData.revolute(this.local(a, x, y), this.local(b, x, y)), a, b, 'hinge');
    if (o.min != null || o.max != null) h.joint.setLimits(o.min ?? -Math.PI, o.max ?? Math.PI);
    if (o.motor != null) h.joint.configureMotorVelocity(o.motor, o.strength ?? 50);
    h.motor = (speed, strength = o.strength ?? 50) => h.joint.configureMotorVelocity(speed, strength);
    return h;
  }
  /**
   * A spring between a point on a and a point on b: bouncy, soft. stiffness: how many bounces per
   * second (2-6 feels good), damping 0..1 (1 = no wobble), length: rest length (default: as placed).
   */
  spring(a, b, ax, ay, bx, by, { stiffness = 4, damping = .3, length } = {}) {
    const m = Math.max(.01, Math.min(a && !a.fixed ? a.mass : Infinity, b && !b.fixed ? b.mass : Infinity) || 1), w = 2 * Math.PI * stiffness;
    const rest = (length ?? Math.hypot(bx - ax, by - ay)) / this.scale;
    return this.keep(R.JointData.spring(rest, m * w * w, 2 * m * damping * w, this.local(a, ax, ay), this.local(b, bx, by)), a, b, 'spring');
  }
  /** A leash: the two points can't get further apart than `length` (default: as placed), but can come closer. */
  leash(a, b, ax, ay, bx, by, length) {
    return this.keep(R.JointData.rope((length ?? Math.hypot(bx - ax, by - ay)) / this.scale, this.local(a, ax, ay), this.local(b, bx, by)), a, b, 'leash');
  }
  /** Glues b to a at (x, y): they move as one until you remove() the weld. */
  weld(a, b, x, y) {
    const ra = this.bodyOf(a).rotation(), rb = this.bodyOf(b).rotation();
    return this.keep(R.JointData.fixed(this.local(a, x, y), 0, this.local(b, x, y), ra - rb), a, b, 'weld');
  }
  /** A slider along direction (dx, dy) through (x, y): lifts, pistons, sliding doors. min / max limit the travel (game units); motor drives it. */
  slider(a, b, x, y, dx, dy, o = {}) {
    const l = Math.hypot(dx, dy) || 1, ra = this.bodyOf(a).rotation(), c = Math.cos(-ra), s = Math.sin(-ra);
    const axis = { x: (dx * c - dy * s) / l, y: (dx * s + dy * c) / l };
    const h = this.keep(R.JointData.prismatic(this.local(a, x, y), this.local(b, x, y), axis), a, b, 'slider');
    if (o.min != null || o.max != null) h.joint.setLimits((o.min ?? -1e4) / this.scale, (o.max ?? 1e4) / this.scale);
    if (o.motor != null) h.joint.configureMotorVelocity(o.motor / this.scale, o.strength ?? 50);
    return h;
  }
  /** A motor-driven wheel: b spins on a hinge at (x, y) of a. Set the speed later with h.motor(speed). */
  wheel(a, b, x, y, { motor = 0, strength = 20 } = {}) { return this.hinge(a, b, x, y, { motor, strength }); }
  /**
   * A rope of small links from (x1, y1) to (x2, y2), hung from thing a (null = the world) and tied to
   * thing b at the far end (undefined = loose). Returns { links, joints, remove() }. Cut it by
   * removing one joint.
   */
  rope(a, x1, y1, b, x2, y2, { links = 12, thick = 4, density = .5, ...o } = {}) {
    const dx = (x2 - x1) / links, dy = (y2 - y1) / links, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const parts = [], joints = [];
    let prev = a;
    for (let i = 0; i < links; i++) {
      const link = this.box(x1 + dx * (i + .5), y1 + dy * (i + .5), len, thick, { density, friction: .2, angle: ang, group: 14, tag: 'rope', ...o });
      joints.push(this.hinge(prev, link, x1 + dx * i, y1 + dy * i));
      parts.push(link); prev = link;
    }
    if (b !== undefined) joints.push(this.hinge(prev, b, x2, y2));
    return { links: parts, joints, remove: () => { joints.forEach(j => j.remove()); parts.forEach(p => this.remove(p)); } };
  }
  /**
   * A floppy person of 10 parts (head, chest, two-part arms and legs) joined by hinges with
   * human-ish limits, standing with its middle (the hips) at (x, y). size: head-to-toe height in game
   * units. face: 1 faces right, -1 left (which way knees and elbows bend). Parts never hit each other
   * (they share `group`); other options (density, friction, bounce, drag...) go to every part.
   * Returns { parts: { head, chest, armL, foreL, armR, foreR, legL, shinL, legR, shinR }, list,
   * joints, push(vx, vy), remove() }. Draw it yourself (phys.path(c, part) gives each part's outline)
   * or with rag.draw(c, colour). Make it stand up again by removing it and making a new one.
   */
  ragdoll(x, y, { size = 60, face = 1, group = 13, density = 1, friction = .6, bounce = .05, tag = 'ragdoll', ...o } = {}) {
    const h = size, f = face < 0 ? -1 : 1, opt = { density, friction, bounce, group, spinDrag: .4, tag, ...o };
    const part = (name, px, py, w, l) => this.box(x + px * h, y + py * h, w * h, l * h, opt);
    const parts = {
      chest: part('chest', 0, -.16, .2, .32),
      head: this.circle(x, y - .41 * h, .085 * h, opt),
      armL: part('arm', -.13, -.21, .07, .16), foreL: part('arm', -.13, -.06, .06, .15),
      armR: part('arm', .13, -.21, .07, .16), foreR: part('arm', .13, -.06, .06, .15),
      legL: part('leg', -.05, .11, .08, .22), shinL: part('leg', -.05, .34, .07, .23),
      legR: part('leg', .05, .11, .08, .22), shinR: part('leg', .05, .34, .07, .23),
    };
    const P = parts, j = (a, b, px, py, min, max) => this.hinge(a, b, x + px * h, y + py * h, { min, max });
    // limits: an angle is the child's turn against its parent, clockwise +; knees bend back, elbows forward
    const knee = f > 0 ? [0, 2.4] : [-2.4, 0], elbow = f > 0 ? [-2.4, 0] : [0, 2.4], hip = f > 0 ? [-2, .5] : [-.5, 2];
    const joints = [
      j(P.chest, P.head, 0, -.32, -.6, .6),
      j(P.chest, P.armL, -.13, -.29, -3, 3), j(P.armL, P.foreL, -.13, -.13, ...elbow),
      j(P.chest, P.armR, .13, -.29, -3, 3), j(P.armR, P.foreR, .13, -.13, ...elbow),
      j(P.chest, P.legL, -.05, 0, ...hip), j(P.legL, P.shinL, -.05, .22, ...knee),
      j(P.chest, P.legR, .05, 0, ...hip), j(P.legR, P.shinR, .05, .22, ...knee),
    ];
    const list = Object.values(parts);
    return {
      parts, list, joints,
      /** Throws the whole body (game units per second), like a hit or an explosion. */
      push: (vx, vy) => { for (const t of list) t.push(vx, vy); },
      remove: () => { for (const jt of joints) jt.remove(); for (const t of list) this.remove(t); },
      /** A plain filled drawing: limbs behind, then chest and head. */
      draw: (c, colour = '#f2d0a0') => { c.fillStyle = colour; for (const t of [P.armL, P.foreL, P.legL, P.shinL, P.legR, P.shinR, P.chest, P.armR, P.foreR, P.head]) { this.path(c, t); c.fill(); } },
    };
  }
  /**
   * Drag a thing with a finger: in down(), const g = phys.grab(x, y) (null if nothing's there);
   * in move(), g.move(x, y); in up(), g.release(). It pulls on a spring rather than teleporting,
   * so the thing still collides. strength: how hard it pulls.
   */
  grab(x, y, { strength = 8, filter = t => !t.fixed } = {}) {
    const t = this.at(x, y, filter); if (!t) return null;
    const hand = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x / this.scale, y / this.scale));
    const m = t.mass, w = 2 * Math.PI * strength;
    const joint = this.world.createImpulseJoint(R.JointData.spring(0, m * w * w, 2 * m * w, { x: 0, y: 0 }, this.local(t, x, y)), hand, t.body, true);
    let live = true;
    return {
      thing: t,
      move: (mx, my) => { if (live) hand.setNextKinematicTranslation(this.v(mx, my)); },
      release: () => { if (!live) return; live = false; if (!t.dead) this.world.removeImpulseJoint(joint, true); this.world.removeRigidBody(hand); },
    };
  }

  /* ---------- asking about the world ---------- */
  /** The thing at a point, or null. */
  at(x, y, filter = () => true) {
    if (!this.steps) this.queries();
    let hit = null;
    this.world.intersectionsWithPoint(this.v(x, y), c => { const t = c.parent()?.userData; if (t && t.kind !== 'line' && filter(t)) { hit = t; return false; } return true; });
    return hit;
  }
  /** Every thing overlapping the box [x, y, w, h]. */
  inBox(x, y, w, h) {
    if (!this.steps) this.queries();
    const out = new Set(), s = this.scale;
    this.world.intersectionsWithShape({ x: (x + w / 2) / s, y: (y + h / 2) / s }, 0, new R.Cuboid(w / 2 / s, h / 2 / s), c => { const t = c.parent()?.userData; if (t) out.add(t); return true; });
    return [...out];
  }
  /** First thing a ray from (x1, y1) to (x2, y2) hits: { thing, x, y, nx, ny, distance } or null. Lasers, line of sight, aim guides. */
  ray(x1, y1, x2, y2, filter = t => !t.collider.isSensor()) {
    if (!this.steps) this.queries();
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy); if (!len) return null;
    const hit = this.world.castRayAndGetNormal(new R.Ray(this.v(x1, y1), { x: dx / len, y: dy / len }), len / this.scale, true,
      undefined, undefined, undefined, undefined, c => { const t = c.parent()?.userData; return !!t && filter(t); });
    if (!hit) return null;
    const d = hit.timeOfImpact * this.scale;
    return { thing: hit.collider.parent()?.userData || null, x: x1 + dx / len * d, y: y1 + dy / len * d, nx: hit.normal.x, ny: hit.normal.y, distance: d };
  }
  /** Throws everything near (x, y) outward, strongest at the centre (game units per second at the middle). */
  blast(x, y, radius, strength = 600) {
    for (const t of this.inBox(x - radius, y - radius, radius * 2, radius * 2)) {
      if (t.fixed || t.body.isKinematic()) continue;
      const dx = t.x - x, dy = t.y - y, d = Math.hypot(dx, dy) || 1, k = strength * Math.max(0, 1 - d / radius);
      if (k > 0) t.push(dx / d * k, dy / d * k);
    }
  }
  /**
   * fn(a, b, speed, x, y) when two things start touching. speed is how fast they met (game units per
   * second), so you can play a soft or a hard sound. It runs after the step, so it's safe to remove
   * things in it. a or b is the walls' thing (tag 'wall') for wall hits.
   */
  onHit(fn) { this.hits.push(fn); return this; }

  /* ---------- running ---------- */
  /** Moves the world on by dt seconds (call once per update). */
  step(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 1 / 15);
    const n = Math.max(1, Math.ceil(dt * 60 - .01)), h = dt / n, s = this.scale;
    // speeds before the step, so a hit's speed is how fast they met, not how fast they bounced off
    const before = new Map();
    if (this.hits.length) for (const t of this.things) if (!t.fixed) before.set(t, t.body.linvel());
    const started = [];
    if (tick.on) for (const t of this.things) if (!t.fixed) { const w = t._was || (t._was = {}); w.x = t.x; w.y = t.y; w.a = t.angle; }
    this.world.timestep = h; this.dt = dt; this.steps++;
    for (let i = 0; i < n; i++) {
      for (const t of this.things) if (t.fx || t.fy) { const m = t.body.mass(); t.body.applyImpulse({ x: t.fx / s * m * h, y: t.fy / s * m * h }, true); }
      for (const w of this.walkers) if (w.to) { const a = w.from || w.to, k = (i + 1) / n; w.body.setNextKinematicTranslation({ x: a.x + (w.to.x - a.x) * k, y: a.y + (w.to.y - a.y) * k }); if (w.angle != null) w.body.setNextKinematicRotation(w.angle); }   // (a share of its move each small step: what it meets is pushed at its real speed)
      this.world.step(this.events);
      this.events.drainCollisionEvents((h1, h2, on) => { if (on) started.push([h1, h2]); });
    }
    for (const w of this.walkers) { if (w.to) { w.from = w.to; w.to = null; } for (const [t, k] of w.met) if (k > 3) w.met.delete(t); else w.met.set(t, k + 1); }
    for (const t of this.things) t.fx = t.fy = 0;
    this.time += dt;
    for (const [a, b, speed, x, y] of this.met.splice(0)) if (!a.dead && !b.dead) for (const fn of this.hits) fn(a, b, speed * s, x, y);
    for (const [h1, h2] of started) {
      const c1 = this.world.getCollider(h1), c2 = this.world.getCollider(h2); if (!c1 || !c2) continue;
      const a = c1.parent()?.userData, b = c2.parent()?.userData; if (!a || !b || a.dead || b.dead) continue;
      const va = before.get(a) || { x: 0, y: 0 }, vb = before.get(b) || { x: 0, y: 0 };
      let nx = 0, ny = 0, px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
      this.world.contactPair(c1, c2, (m, flipped) => {
        const nrm = m.normal(); nx = flipped ? -nrm.x : nrm.x; ny = flipped ? -nrm.y : nrm.y;
        if (m.numSolverContacts?.() > 0) { const p = m.solverContactPoint(0); px = p.x * s; py = p.y * s; }
      });
      const rvx = vb.x - va.x, rvy = vb.y - va.y;
      const speed = (nx || ny ? Math.abs(rvx * nx + rvy * ny) : Math.hypot(rvx, rvy)) * s;
      for (const fn of this.hits) fn(a, b, speed, px, py);
    }
    // things that fall far out of the world are removed
    for (const t of [...this.things]) if (!t.fixed && (Math.abs(t.y) > 1e5 || Math.abs(t.x) > 1e5)) this.remove(t);
  }

  /* ---------- drawing ---------- */
  /** Makes the canvas path of a thing's shape (game units), ready for c.fill() / c.stroke(). */
  path(c, t) {
    c.beginPath();
    if (t.kind === 'line') { t.points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); if (t.loop) c.closePath(); return; }
    if (t.kind === 'tiles') { const z = t.map.size; for (const r of t.rects) c.rect(r.x0 * z, r.y0 * z, (r.x1 - r.x0 + 1) * z, r.oneWay ? Math.max(2, z * .15) : (r.y1 - r.y0 + 1) * z); for (const p of t.ramps) { c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); c.lineTo(p[4], p[5]); c.closePath(); } return; }
    const x = t.sx, y = t.sy, a = t.sangle, co = Math.cos(a), si = Math.sin(a), P = (px, py) => [x + px * co - py * si, y + px * si + py * co];
    if (t.kind === 'circle') { c.arc(x, y, t.r, 0, Math.PI * 2); return; }
    const pts = t.kind === 'box' ? [[-t.w / 2, -t.h / 2], [t.w / 2, -t.h / 2], [t.w / 2, t.h / 2], [-t.w / 2, t.h / 2]] : t.points;
    pts.forEach(([px, py], i) => { const [qx, qy] = P(px, py); i ? c.lineTo(qx, qy) : c.moveTo(qx, qy); });
    c.closePath();
  }
  /** Outlines every thing and joint: handy while building (call it from your game's debug(c)). */
  debugDraw(c, color = '#00ff88') {
    c.save(); c.lineWidth = 1;
    for (const t of this.things) {
      c.strokeStyle = t.collider.isSensor() ? '#ffcc00' : color; c.globalAlpha = t.sleeping ? .4 : 1;
      this.path(c, t); c.stroke();
      if (t.kind === 'circle') { c.beginPath(); c.moveTo(t.x, t.y); c.lineTo(t.x + Math.cos(t.angle) * t.r, t.y + Math.sin(t.angle) * t.r); c.stroke(); }
    }
    c.globalAlpha = 1; c.fillStyle = '#ff60c0';
    for (const h of this.joints) {
      const b = h.b ? h.b.body : this.ground, p = b.translation(), a = b.rotation(), l = h.joint.anchor2(), co = Math.cos(a), si = Math.sin(a);
      c.fillRect((p.x + l.x * co - l.y * si) * this.scale - 1.5, (p.y + l.x * si + l.y * co) * this.scale - 1.5, 3, 3);
    }
    c.restore();
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Physics.prototype, 'step', 'physics 2D');
