// Swimming for 3D games: wading in the shallows (slower the deeper it gets), swimming at the surface, treading water,
// diving under with a breath that runs out, coming up for air, and climbing out onto a bank, a jetty or a pool's edge.
// The water is the game's own: a gs.outdoors Water or Sea it made is found by itself, or say where it is (a level, a
// function, a gs.flow Streams with its currents). Works with a gs.physics3d World3D mover (it takes the mover over
// while it swims: no gravity, its own speeds, its place while climbing out) or with any { x, y, z } feet you move
// yourself from swim.vel. Kit use: games reach it as gs.climb.Swimmer.
//
//   const { Swimmer } = gs.climb;
//   reset() { swim = new Swimmer({ height: 1.8 }); }                  // the Water or Sea the game made is found
//   update(dt) {
//     hero.walk(stick.x * 4, stick.z * 4);                             // on foot as ever
//     swim.update(dt, { move: stick, up: jumpHeld, down: crouchHeld, fast: sprintHeld }, hero);   // then: in water it takes over
//     rig.play(swim.pose ?? walkPose, swim.at != null ? { at: swim.at } : {});   // tread, swim, dive, diveDown, diveUp, climbOut, wade
//     if (swim.facing != null) heroYaw = swim.facing;
//     me.hurt(swim.hurt);                                              // out of breath: it hurts until they come up
//   }
//   draw: swim.air (0..1: a breath bar while under), swim.state 'out' | 'wade' | 'swim' | 'dive' | 'climb'
//
// Units are metres with y up; move is the stick in the world (x, z, length 0..1).
import { linksFor } from './links.js';
import { noise, tone } from './sound.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const NOWATER = { y: -Infinity, current: null };

/**
 * One swimmer. height: of the person (1.8); breath: seconds of air (25); speed: swimming metres a second (1.4; fast
 * 2.4, under water .85 of it); dive: metres a second down and up (1.3); float: how they lie in the water (default
 * shoulders at the surface treading, hips just under it swimming); water: where the water is (left out: every Water
 * and Sea the game made; a number: a level everywhere; (x, z) => surface height or null; something with height(x, z)
 * like a Water; a gs.flow Streams: its liquid where it runs, and its current carries them); world: a gs.physics3d
 * World3D to find the edge to climb out on (left out: the game's); climb: highest an edge can be over the water to
 * climb out (.9 metres; 0 never); sounds: false for none. Each frame read state, pose and at (for rig.play), facing,
 * vel, depth, under, air, hurt, events (this frame's: 'in', 'out', 'swim', 'under', 'surface', 'gasp', 'low', 'empty', 'climb').
 */
export class Swimmer {
  constructor({ height = 1.8, breath = 25, speed = 1.4, fast = 2.4, dive = 1.3, wade = .35, deep = null, hurt = 10, climb = .9, water = null, world = null, sounds = true, link = true } = {}) {
    Object.assign(this, { height, breath, swimSpeed: speed, fastSpeed: fast, diveSpeed: dive, wadeFrom: wade, deep: deep ?? height * .7, hurtRate: hurt, climbUp: climb, water, given: world, sounds });
    this.links = linksFor(null, link);
    this.reset();
  }
  reset() {
    this.state = 'out'; this.pose = null; this.at = null; this.facing = null; this.vel = { x: 0, y: 0, z: 0 }; this.depth = 0; this.surface = -Infinity;
    this.under = false; this.left = this.breath; this.hurt = 0; this.events = []; this.slow = 1; this.tilt = 0; this.stroke = 0; this.low = false;
    this.climbing = null; this.g0 = null; this.watched = null; this.vy = 0;
    return this;
  }
  /** 0..1 of the breath left (1 full). */
  get air() { return this.left / this.breath; }
  get world() { return this.given || this.links?.one('world') || null; }
  /** The water's surface over (x, z) and the current there: { y, current } (y -Infinity: no water). */
  waterAt(x, z, y = 0) {
    const W = this.water;
    if (W != null) return this.read(W, x, z, y);
    let best = NOWATER;
    for (const w of this.links?.all('water') || []) { const r = this.read(w, x, z, y); if (r.y > best.y) best = r; }
    return best;
  }
  read(w, x, z, y) {
    if (typeof w === 'number') return { y: w, current: null };
    if (typeof w === 'function') { const h = w(x, z); return h == null ? NOWATER : { y: h, current: null }; }
    if (w.at && !w.height) { const s = w.at({ x, y, z }); return s?.in ? { y: s.level ?? y + (s.depth || 0), current: s.current && s.stream ? { x: s.current.x * s.stream.push, z: s.current.z * s.stream.push } : null } : NOWATER; }
    if (w.height) {
      // a Water is a square of `size` round its mesh; the open sea goes on, and is no water where the beach is above it
      const m = w.mesh, half = w.size / 2; if (m && half && !w.sea && (Math.abs(x - m.position.x) > half || Math.abs(z - m.position.z) > half)) return NOWATER;
      const h = w.height(x, z); if (w.bed && w.bed(x, z) >= h) return NOWATER;
      return { y: h, current: null };
    }
    return NOWATER;
  }
  say(e) { this.events.push(e); }
  /**
   * One frame. input: move ({ x, z } the stick in the world, length up to 1), up (swim up / climb out), down (dive),
   * fast. body: a World3D mover (call after your own walk(): in the water it takes over) or { x, y, z } feet (move them
   * by vel yourself). Returns this.
   */
  update(dt, { move = null, up = false, down = false, fast = false } = {}, body = null) {
    this.events = []; this.hurt = 0;
    const mover = body && typeof body.walk === 'function' && body.body ? body : null, feet = mover ? mover.feet : body || { x: 0, y: 0, z: 0 };
    const mx = move?.x || 0, mz = move?.z ?? move?.y ?? 0, push = Math.min(1, Math.hypot(mx, mz));
    const w = this.waterAt(feet.x, feet.z, feet.y), was = this.state;
    this.surface = w.y; this.depth = Math.max(0, w.y - feet.y);
    const eye = feet.y + this.height * .93;
    if (this.climbing) return this.climbStep(dt, mover, body);
    // which: out, wading in the shallows, swimming at the surface, or under
    let st = this.depth < this.wadeFrom ? 'out' : this.depth < this.deep ? 'wade' : 'swim';
    if (st === 'swim' && (was === 'dive' || down) && (down || eye < w.y - .1)) st = 'dive';
    if (st === 'wade' && (was === 'swim' || was === 'dive') && this.depth > this.deep * .8 && !mover?.grounded) st = 'swim';   // (no foothold yet: still swimming)
    this.state = st; this.under = eye < w.y;
    if (st !== was) this.changed(was, st, feet, mover);
    // breath: it runs out under water and comes back above it
    if (this.under) {
      this.left = Math.max(0, this.left - dt);
      if (!this.low && this.air < .3) { this.low = true; this.say('low'); }
      if (this.left <= 0) { if (this.hurt === 0 && !this.emptied) { this.emptied = true; this.say('empty'); } this.hurt = this.hurtRate * dt; }
    } else {
      if (this.left < this.breath) { if (this.wasUnder) { this.say('surface'); if (this.air < .45) { this.say('gasp'); this.noise('gasp', feet); } } this.left = Math.min(this.breath, this.left + dt * this.breath / 3); }
      if (this.air > .5) this.low = false; this.emptied = false;
    }
    if (this.under && !this.wasUnder) this.say('under');
    this.wasUnder = this.under;
    // the moves
    const cur = w.current, face = push > .1 ? Math.atan2(mx, mz) : null;
    this.facing = face; this.at = null; this.tilt = 0;
    if (st === 'out') { this.pose = null; this.slow = 1; this.vel = { x: 0, y: 0, z: 0 }; this.release(mover); return this; }
    if (st === 'wade') {
      // the deeper, the slower (knee deep a little, waist deep about half)
      this.slow = 1 - .55 * clamp((this.depth - this.wadeFrom) / (this.deep - this.wadeFrom), 0, 1);
      this.pose = push > .1 ? 'wade' : null; this.release(mover);
      if (mover) { mover.vx *= this.slow; mover.vz *= this.slow; if (cur) { mover.vx += cur.x * .3; mover.vz += cur.z * .3; } }
      this.vel = { x: mover ? mover.vx : mx * 3 * this.slow, y: 0, z: mover ? mover.vz : mz * 3 * this.slow };
      if (push > .1) this.strokes(dt, push, feet, .7);
      return this;
    }
    // swimming or under: their own speeds; floating up to where they lie in the water
    const sp = (fast ? this.fastSpeed : this.swimSpeed) * (st === 'dive' ? .85 : 1) * push;
    let vx = push > 0 ? mx / Math.max(push, 1e-6) * sp : 0, vz = push > 0 ? mz / Math.max(push, 1e-6) * sp : 0, vy;
    if (cur) { vx += cur.x * .5; vz += cur.z * .5; }
    if (st === 'swim') {
      const lie = push > .2 ? this.height * .6 : this.height * .78, want = w.y - lie;   // swimming: hips just under; treading: shoulders at the surface
      vy = clamp((want - feet.y) * 3, -1.5, 1.5);
      this.pose = push > .2 ? 'swim' : 'tread';
      if (push > .2) this.strokes(dt, push * (fast ? 1.4 : 1), feet, 1); else this.stroke = 0;
      // climbing out: pushing into an edge that stands a little over the water
      if ((push > .5 || up) && this.climbUp > 0 && face != null) { const e = this.edge(feet, mx / push, mz / push, w.y, mover); if (e) return this.startClimb(e, feet, mover); }
    } else {
      // under: down dives, up (or nothing pushed) rises slowly back to the surface
      vy = down ? -this.diveSpeed : up ? this.diveSpeed : .45;
      this.tilt = down ? -.7 : up ? .7 : 0;
      this.pose = down ? 'diveDown' : up ? 'diveUp' : 'dive';
      if (push > .2 || down || up) this.strokes(dt, Math.max(push, .6), feet, .8);
      if (!down && feet.y + this.height * .6 > w.y) st = this.state = 'swim';   // (back up)
    }
    this.vel = { x: vx, y: vy, z: vz };
    if (mover) {
      if (this.g0 == null) { this.g0 = mover.gravity; mover.gravity = 0; }
      mover.walk(vx, vz); mover.vy = vy;
    }
    return this;
  }
  // a state changed: splashes, sounds and the mover's own gravity back
  changed(was, st, feet, mover) {
    if (was === 'out' && st !== 'out') this.say('in');
    if (st === 'out') this.say('out');
    if (st === 'swim' && was !== 'dive') { this.say('swim'); if (was === 'out' || (mover && mover.vy < -2.5)) this.noise('splash', feet); }
    // a Water made to be disturbed: it splashes, and a wake follows them, by itself
    if (st !== 'out' && !this.watched) for (const w of this.links?.all('water') || []) if (w.rip && w.watch) { this.watched = w.watch(this.spot ||= { x: 0, y: 0, z: 0 }, { radius: .35, bottom: 0, top: this.height }); break; }
  }
  release(mover) { if (mover && this.g0 != null) { mover.gravity = this.g0; this.g0 = null; } }
  // a stroke's swish now and then, and a ring on the water a Water made to be disturbed shows
  strokes(dt, k, feet, every) {
    if (this.spot) { this.spot.x = feet.x; this.spot.y = feet.y; this.spot.z = feet.z; }
    this.stroke += dt * k / every;
    if (this.stroke >= 1) { this.stroke -= 1; if (!this.under) this.noise('stroke', feet); else this.noise('bubbles', feet); }
  }
  // the edge in front: the floor a little ahead stands over the water by no more than climbUp, and is well over where they are
  edge(feet, dx, dz, surface, mover) {
    const W = this.world; if (!W?.floorAt) return null;
    for (const d of [.45, .7]) {
      const x = feet.x + dx * d, z = feet.z + dz * d, top = W.floorAt(x, surface + this.climbUp + .05, z, this.climbUp + .5, mover);
      if (top == null || top < surface - .25 || top > surface + this.climbUp) continue;
      const here = W.floorAt(feet.x, feet.y + .2, feet.z, 3, mover) ?? -Infinity;
      if (top - here < .9) return null;   // (only from deep water: in the shallows they walk out)
      return { x, z, y: top, dx, dz };
    }
    return null;
  }
  startClimb(e, feet, mover) {
    this.climbing = { t: 0, time: 1.1, from: { x: feet.x, y: feet.y, z: feet.z }, to: { x: e.x + e.dx * .15, y: e.y, z: e.z + e.dz * .15 }, dx: e.dx, dz: e.dz };
    this.state = 'climb'; this.say('climb'); this.facing = Math.atan2(e.dx, e.dz); this.noise('splash', feet, .5);
    if (mover && this.g0 == null) { this.g0 = mover.gravity; mover.gravity = 0; }
    return this.climbStep(0, mover, null);
  }
  // pulled up on the arms (to the chest over the edge), then a knee up and onto the feet
  climbStep(dt, mover, body) {
    const c = this.climbing; c.t = Math.min(1, c.t + dt / c.time);
    const t = c.t, up = clamp(t / .55, 0, 1), on = clamp((t - .45) / .55, 0, 1), e = s => s * s * (3 - 2 * s);
    const lift = c.to.y - this.height * .55;   // (the edge at their chest)
    const p = { x: c.from.x + (c.to.x - c.from.x) * e(on), y: t < .55 ? c.from.y + (Math.max(c.from.y, lift) - c.from.y) * e(up) : lift + (c.to.y - lift) * e(on), z: c.from.z + (c.to.z - c.from.z) * e(on) };
    this.pose = 'climbOut'; this.at = t; this.facing = Math.atan2(c.dx, c.dz); this.under = false;
    this.vel = { x: 0, y: 0, z: 0 };
    if (mover) { mover.walk(0, 0); mover.vy = 0; mover.place(p.x, p.y, p.z); } else if (body) { body.x = p.x; body.y = p.y; body.z = p.z; }
    if (t >= 1) { this.climbing = null; this.state = 'out'; this.pose = null; this.at = null; this.say('out'); this.release(mover); }
    return this;
  }
  // the water's sounds round the swimmer: heard from there through the game's gs.sound.Ears when it made one
  noise(kind, at, k = 1) {
    if (!this.sounds) return;
    const E = this.links?.one('ears'), p = { x: at.x, y: Math.max(at.y, this.surface), z: at.z };
    const N = (len, o) => E ? E.noise(len, p, o) : noise(len, o), Tn = (f, o) => E ? E.tone(f, p, o) : tone(f, o);
    if (kind === 'splash') { N(.5 * k, { vol: .1 * k, from: 2500, to: 400 }); N(.25 * k, { vol: .05 * k, from: 6000, to: 2000, filter: 'highpass' }); }
    else if (kind === 'stroke') N(.22, { vol: .03, from: 1400 + Math.random() * 600, to: 500, filter: 'bandpass', q: .8 });
    else if (kind === 'bubbles') { for (let i = 0; i < 3; i++) Tn(380 + Math.random() * 300, { len: .05, wave: 'sine', vol: .015, slide: 250, at: i * .07 }); }
    else if (kind === 'gasp') N(.35, { vol: .05, from: 1800, to: 3200, filter: 'bandpass', q: 2 });
  }
}
