// Ball games with cars (or anything) in a walled arena: the arena builds itself in a gs.physics3d
// World3D (floor, walls, curved ramps where they meet, a ceiling, two goals), keeps the score and the
// clock, spots goals, gives touches on the ball some extra punch, predicts where the ball goes (for
// a landing marker or the AI) and keeps a few seconds of replay. BallCar is a Rapier car with boost,
// jump, double jump / flip and air control. Rapier does the physics; your game draws everything.
//
//   const { Arena, BallCar } = gs.arena;
//   reset() { world = new World3D(); arena = new Arena(world, { w: 40, l: 60, ball: ballMesh });
//             me = new BallCar(world, carMesh, { at: arena.spawns[0][0] }); arena.cars.push(me);
//             arena.on('goal', g => feel.boom(...)); }
//   update(dt) { me.control({ throttle, steer, boost, jump, pitch, roll }); me.update(dt, arena); world.step(dt); arena.update(dt); }
//   landing: arena.predict(2).find(p => p.bounce)       // where the ball next bounces
//
// Team 0 defends the goal at -z and scores at +z; team 1 the other way. Sizes are metres.

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const rot = (v, q) => {   // v rotated by quaternion q
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return V(ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x);
};
// quaternion from three unit axes (the box's x, y and z in the world)
function basis(x, y, z) {
  const m00 = x.x, m01 = y.x, m02 = z.x, m10 = x.y, m11 = y.y, m12 = z.y, m20 = x.z, m21 = y.z, m22 = z.z, tr = m00 + m11 + m22;
  let w, a, b, c;
  if (tr > 0) { const s = .5 / Math.sqrt(tr + 1); w = .25 / s; a = (m21 - m12) * s; b = (m02 - m20) * s; c = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; a = .25 * s; b = (m01 + m10) / s; c = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; a = (m01 + m10) / s; b = .25 * s; c = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; a = (m02 + m20) / s; b = (m12 + m21) / s; c = .25 * s; }
  return { x: a, y: b, z: c, w };
}

/**
 * The arena. w × l floor, h high; curve: radius of the ramps where floor meets wall (0 for square);
 * goal: { w, h, d } mouth size and depth; ball: a mesh (or null) and ballR its radius; time: seconds a
 * match lasts (0 for no clock); bounce: how lively the ball is; punch: extra kick when a car touches it.
 */
export class Arena {
  constructor(world, { w = 40, l = 60, h = 14, curve = 3, segments = 4, goal = {}, ball = null, ballR = 1.1, bounce = .65,
    time = 120, punch = .35, replay = 4, pads = true } = {}) {
    Object.assign(this, { world, w, l, h, curve, ballR, punch, length: time });
    this.goal = { w: 9, h: 3.6, d: 3.5, ...goal };
    this.handlers = {}; this.cars = []; this.score = [0, 0]; this.walls = [];
    this.build(segments);
    this.ballDrag = .12; this.ballSpinDrag = .3; this.path = null;
    this.ball = world.ball(ball, ballR, { bounce, friction: .4, density: .25, drag: this.ballDrag, spinDrag: this.ballSpinDrag, bullet: true, tag: 'ball', at: V(0, ballR + 2, 0) });
    this.frames = []; this.keep = Math.round(replay * 30); this.rec = 0;
    this.pads = pads ? this.makePads() : [];
    this.spawns = [-1, 1].map(s => [V(0, .6, s * l * .38), V(-w * .22, .6, s * l * .42), V(w * .22, .6, s * l * .42)].map(p => ({ ...p, facing: s > 0 ? 0 : Math.PI })));
    this.restart();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }

  // fixed box of full size sx × sy × sz at p, turned by q
  wall(p, sx, sy, sz, q = null, bounce = .3) { const b = this.world.box(null, sx, sy, sz, { fixed: true, at: p, bounce, friction: .6, tag: 'wall' }); if (q) b.place(p, q); this.walls.push(b); return b; }
  build(n) {
    const { w, l, h, goal: g } = this, T = 2, gw = g.w / 2;
    this.wall(V(0, -T / 2, 0), w + 2 * T, T, l + 2 * T + 2 * g.d);                       // floor (runs into the goals)
    this.wall(V(0, h + T / 2, 0), w + 2 * T, T, l + 2 * T);                               // ceiling
    for (const s of [-1, 1]) this.wall(V(s * (w / 2 + T / 2), h / 2, 0), T, h, l + 2 * T); // side walls
    for (const s of [-1, 1]) {                                                             // end walls with a goal mouth
      const z = s * (l / 2 + T / 2), side = (w / 2 - gw);
      for (const k of [-1, 1]) this.wall(V(k * (gw + side / 2), h / 2, z), side, h, T);
      this.wall(V(0, g.h + (h - g.h) / 2, z), g.w, h - g.h, T);
      const gz = s * (l / 2 + g.d + T / 2);                                                // the net box
      this.wall(V(0, g.h / 2, gz), g.w + 2 * T, g.h, T, null, 0);                       // the net soaks the ball up
      this.wall(V(0, g.h + T / 2, s * (l / 2 + g.d / 2)), g.w + 2 * T, T, g.d, null, 0);
      for (const k of [-1, 1]) this.wall(V(k * (gw + T / 2), g.h / 2, s * (l / 2 + g.d / 2)), T, g.h, g.d, null, 0);
    }
    if (this.curve > 0) {
      const up = V(0, 1, 0);
      // sides: the whole length; ends: either side of the goal mouth
      for (const s of [-1, 1]) this.ramp(V(s, 0, 0), V(0, 0, 1), w / 2, 0, l, n, up);
      const side = w / 2 - gw;
      for (const s of [-1, 1]) for (const k of [-1, 1]) this.ramp(V(0, 0, s), V(1, 0, 0), l / 2, k * (gw + side / 2), side, n, up);
    }
  }
  // a quarter pipe along a wall: normal n (out), along t, wall at distance D, centred at `mid` along t, length L
  ramp(n, t, D, mid, L, segs, up) {
    const r = this.curve, cx = D - r, cy = r, T = .5;
    for (let i = 0; i < segs; i++) {
      const a0 = -Math.PI / 2 + (Math.PI / 2) * i / segs, a1 = -Math.PI / 2 + (Math.PI / 2) * (i + 1) / segs, am = (a0 + a1) / 2;
      const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      // outward (into the wall) unit normal in the (n, up) plane, and the chord direction
      const on = [Math.cos(am), Math.sin(am)], cd = [(p1[0] - p0[0]) / chord, (p1[1] - p0[1]) / chord];
      const mx = (p0[0] + p1[0]) / 2 + on[0] * T / 2, my = (p0[1] + p1[1]) / 2 + on[1] * T / 2;
      const P = V(n.x * mx + t.x * mid, my, n.z * mx + t.z * mid);
      const Y = V(n.x * on[0], on[1], n.z * on[0]), Z = V(n.x * cd[0], cd[1], n.z * cd[0]);
      const X = V(Y.y * Z.z - Y.z * Z.y, Y.z * Z.x - Y.x * Z.z, Y.x * Z.y - Y.y * Z.x);   // along the wall
      this.wall(P, L, T, chord + .05, basis(X, Y, Z));
    }
  }
  makePads() {
    const { w, l } = this, out = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ x: sx * (w / 2 - 3), z: sz * (l / 2 - 3), big: true, wait: 0 });
    for (const sx of [-1, 1]) out.push({ x: sx * (w / 2 - 3), z: 0, big: true, wait: 0 });
    for (const sx of [-1, 0, 1]) for (const sz of [-.25, .25]) out.push({ x: sx * w * .25, z: sz * l, big: false, wait: 0 });
    return out;
  }

  /** A new match: score 0-0, full clock, ball in the middle. */
  restart() { this.score = [0, 0]; this.clock = this.length; this.overtime = false; this.over = false; this.kickoff(); return this; }
  /** Ball back in the middle, still. Puts cars on their spawns too. countdown: seconds before play (frozen). */
  kickoff(countdown = 0) {
    this.ball.place(V(0, this.ballR + .05, 0), { x: 0, y: 0, z: 0, w: 1 }); this.ball.setVel(0, 0, 0).setSpin(0, 0, 0);
    const used = [0, 0];
    for (const c of this.cars) { const s = this.spawns[c.team ?? 0][used[c.team ?? 0]++ % 3]; c.spawn?.(s); }
    this.wait = countdown; this.scored = 0; this.lastTouch = null; this.frames = [];
    this.emit('kickoff');
    return this;
  }
  /** Which team's goal a point is in (0 = the goal at -z, 1 = +z), or -1. */
  inGoal(p) {
    const { l, goal: g, ballR } = this;
    if (Math.abs(p.x) > g.w / 2 || p.y > g.h) return -1;
    if (p.z < -(l / 2 + ballR)) return 0;
    if (p.z > l / 2 + ballR) return 1;
    return -1;
  }
  update(dt) {
    if (this.over) return this;
    if (this.wait > 0) { this.wait -= dt; return this; }
    const b = this.ball.pos;
    // touches: a little extra kick from the car's speed, and who touched last
    for (const c of this.cars) {
      const p = c.pos, d = Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z), reach = this.ballR + (c.reach ?? 1.4);
      if (d > reach) { c.touching = false; continue; }
      if (c.touching) continue;
      c.touching = true; this.lastTouch = c;
      const cv = c.vel, bv = this.ball.vel, n = V((b.x - p.x) / d, (b.y - p.y) / d, (b.z - p.z) / d);
      const closing = (cv.x - bv.x) * n.x + (cv.y - bv.y) * n.y + (cv.z - bv.z) * n.z;
      if (closing > 0) this.ball.push(n.x * closing * this.punch, n.y * closing * this.punch + closing * this.punch * .2, n.z * closing * this.punch);
      this.emit('touch', c, Math.max(0, closing));
    }
    // boost pads
    for (const pad of this.pads) {
      pad.wait = Math.max(0, pad.wait - dt); if (pad.wait > 0) continue;
      for (const c of this.cars) {
        if (c.boost == null) continue; const p = c.pos;
        if (Math.hypot(p.x - pad.x, p.z - pad.z) > (pad.big ? 1.6 : 1) || p.y > 2.5) continue;
        if (c.boost >= c.maxBoost) continue;
        c.boost = Math.min(c.maxBoost, c.boost + (pad.big ? c.maxBoost : 12)); pad.wait = pad.big ? 10 : 4; this.emit('pad', c, pad); break;
      }
    }
    // goals
    const g = this.scored ? -1 : this.inGoal(b);
    if (g >= 0) {
      const team = 1 - g; this.score[team]++; this.scored = 1;
      this.emit('goal', { team, by: this.lastTouch, at: { ...b }, speed: this.ball.speed });
      if (this.overtime) { this.over = true; this.emit('end', { score: this.score.slice(), winner: team }); }
    }
    // clock (it stops on 0 only once the ball touches the ground, as in most ball games)
    if (this.length > 0 && !this.overtime) {
      this.clock = Math.max(0, this.clock - dt);
      if (this.clock === 0 && b.y < this.ballR + .3) {
        if (this.score[0] === this.score[1]) { this.overtime = true; this.emit('overtime'); }
        else { this.over = true; this.emit('end', { score: this.score.slice(), winner: this.score[0] > this.score[1] ? 0 : 1 }); }
      }
    }
    // replay frames, 30 a second
    this.rec += dt;
    if (this.rec >= 1 / 30) { this.rec = 0; this.frames.push([this.ball, ...this.cars].map(t => ({ p: { ...t.pos }, q: { ...(t.rot ?? t.body?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 }) } }))); if (this.frames.length > this.keep) this.frames.shift(); }
    return this;
  }
  /** The kept replay at time t (0 = oldest kept): [{ p, q }] for the ball then each car. */
  playback(t) { const f = this.frames; if (!f.length) return null; return f[Math.max(0, Math.min(f.length - 1, Math.floor(t * 30)))]; }
  get replayLength() { return this.frames.length / 30; }

  /**
   * Where the ball will be over the next `seconds`, ignoring cars: [{ x, y, z, t, bounce }] every `step` seconds;
   * bounce marks a point where it hits floor, wall, ramp or ceiling. The physics world is asked where the ball
   * next meets the arena (its real walls, curved ramps and goals, and how bouncy each is), so the marker lands
   * where the ball will. It is worked out once a frame however many ask (the landing marker, every computer car).
   */
  predict(seconds = 2, step = 1 / 30) {
    const W = this.world, b = this.ball, at = b.pos, sp = b.vel, want = Math.floor(seconds / step + 1e-6); let c = this.path;
    if (!c || c.steps !== W.steps || c.step !== step || c.p0.x !== at.x || c.p0.y !== at.y || c.p0.z !== at.z || c.v0.x !== sp.x || c.v0.y !== sp.y || c.v0.z !== sp.z)
      c = this.path = { steps: W.steps, step, list: [], p0: { ...at }, v0: { ...sp }, p: { ...at }, v: { ...sp }, w: { ...b.spin } };
    if (c.list.length >= want) return c.list.length === want ? c.list : c.list.slice(0, want);
    const out = c.list = c.list.slice();   // (a longer look than the last one this frame carries on from where that ended, in a list of its own: the shorter one a caller holds stays as it was)
    const g = W.gravity, r = this.ballR, drag = this.ballDrag, sdrag = this.ballSpinDrag, col = b.collider, e0 = col.restitution(), f0 = col.friction();
    const shape = this.ballShape ||= { ball: r }, mv = V(), opt = this.still ||= { still: true }, { p, v, w } = c;
    // the ball meets something (the world says where, and its normal n): off it as the two together bounce, and their grip
    // turns sliding into rolling (a ball that lands with no spin loses 2/7 of its speed along the ground as it takes it up)
    const meet = (hit, h) => {
      const n = hit.normal, into = -(v.x * n.x + v.y * n.y + v.z * n.z); if (into <= 0) return -1;   // (touching it and on its way off)
      const o = hit.thing?.collider, e = (e0 + (o?.restitution() ?? e0)) / 2, mu = (f0 + (o?.friction() ?? f0)) / 2, j = (1 + e) * into;
      v.x += n.x * j; v.y += n.y * j; v.z += n.z * j;
      // how fast the ball's skin slides over what it touches: v + spin × (-r n), along the surface
      let ux = v.x - r * (w.y * n.z - w.z * n.y), uy = v.y - r * (w.z * n.x - w.x * n.z), uz = v.z - r * (w.x * n.y - w.y * n.x); const un = ux * n.x + uy * n.y + uz * n.z;
      ux -= un * n.x; uy -= un * n.y; uz -= un * n.z; const u = Math.hypot(ux, uy, uz);
      if (u > 1e-6) {
        const k = Math.min(mu * Math.max(j, -(g.x * n.x + g.y * n.y + g.z * n.z) * h), u * 2 / 7) / u, dx = -ux * k, dy = -uy * k, dz = -uz * k, s = 2.5 / r;   // (a solid ball: I = 2/5 m r²)
        v.x += dx; v.y += dy; v.z += dz; w.x -= s * (n.y * dz - n.z * dy); w.y -= s * (n.z * dx - n.x * dz); w.z -= s * (n.x * dy - n.y * dx);
      }
      return into * e;
    };
    for (let i = out.length; i < want; i++) {
      const k = 1 / (1 + drag * step), ks = 1 / (1 + sdrag * step); v.x = (v.x + g.x * step) * k; v.y = (v.y + g.y * step) * k; v.z = (v.z + g.z * step) * k; w.x *= ks; w.y *= ks; w.z *= ks;   // (as the physics slows it)
      let left = step, bounce = false;
      for (let pass = 0; pass < 3 && left > 1e-5; pass++) {   // to where it next meets the arena, off that, and on with what is left of the step
        mv.x = v.x * left; mv.y = v.y * left; mv.z = v.z * left;
        const hit = W.sweep(shape, p, mv, opt), up = hit ? meet(hit, left) : -1;
        if (up < 0) { p.x += mv.x; p.y += mv.y; p.z += mv.z; break; }
        p.x = hit.at.x; p.y = hit.at.y; p.z = hit.at.z; left *= 1 - hit.share; if (up > .5) bounce = true;
        if (hit.share < 1e-4 && pass) break;
      }
      out.push({ x: p.x, y: p.y, z: p.z, t: (i + 1) * step, bounce });
    }
    return out;
  }
  /** Is the ball heading into a goal within `seconds`? Returns the team whose goal (0 or 1), or -1. */
  danger(seconds = 2) { for (const p of this.predict(seconds)) { const g = this.inGoal(p); if (g >= 0) return g; } return -1; }
  /** mm:ss for the HUD (+ while in overtime). */
  get clockText() { const s = Math.ceil(this.clock); return (this.overtime ? '+' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
}

/**
 * A car for ball games: a gs.physics3d vehicle with boost, jump, a second jump that flips you in the
 * stick's direction (a dodge), and air control (pitch, yaw, roll) once off the ground. The nose
 * points along -z. team: 0 or 1.
 */
export class BallCar {
  constructor(world, mesh, { team = 0, at = null, wheels = [], power = 18, steer = .6, top = 23, boostTop = 32, maxBoost = 100,
    boostUse = 33, boostPush = 22, jump = 7, dodge = 9, air = 4.5, start = 33, w = 1.8, h = .6, l = 3 } = {}) {
    Object.assign(this, { world, team, top, boostTop, maxBoost, boostUse, boostPush, jumpSpeed: jump, dodgeSpeed: dodge, air, startBoost: start });
    this.car = world.vehicle(mesh, { w, h, l, wheels, power, steer, grip: 3, at: at || V(0, 1, 0), tag: 'car' });
    this.car.chassis.owner = this;
    this.boost = start; this.input = {}; this.jumps = 0; this.airTime = 0; this.wasJump = false; this.flipping = 0;
    this.reach = Math.max(w, l) / 2 + .2;
  }
  get body() { return this.car.chassis.body; }
  get pos() { return this.car.chassis.pos; }
  get vel() { return this.car.chassis.vel; }
  get rot() { return this.body.rotation(); }
  get speed() { return this.car.speed; }
  get grounded() { return this.car.grounded; }
  get boosting() { return !!this.input.boost && this.boost > 0; }
  /** World direction of the nose, roof and right side. */
  get forward() { return rot(V(0, 0, -1), this.rot); }
  get up() { return rot(V(0, 1, 0), this.rot); }
  get right() { return rot(V(1, 0, 0), this.rot); }
  /** Back on a spawn ({ x, y, z, facing }), still, with the starting boost. */
  spawn(s) {
    const a = s.facing || 0, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
    this.car.chassis.place(V(s.x, s.y ?? .6, s.z), q); this.car.chassis.setVel(0, 0, 0).setSpin(0, 0, 0);
    this.boost = this.startBoost; this.jumps = 0; this.flipping = 0; return this;
  }
  /** Set the controls each frame: throttle and steer -1..1, boost and jump held (true/false), pitch, yaw, roll -1..1 in the air. */
  control(input = {}) { this.input = input; return this; }
  update(dt) {
    const i = this.input, b = this.body, m = b.mass(), ground = this.grounded, f = this.forward, up = this.up;
    this.car.drive(i.throttle || 0, i.steer || 0, !!i.brake);
    if (ground) { this.airTime = 0; if (this.flipping <= 0) this.jumps = 0; } else this.airTime += dt;
    // jump: first press from the ground goes up along the roof; a second press within 1.5 s flips you
    const press = !!i.jump && !this.wasJump; this.wasJump = !!i.jump;
    if (press && ground) { b.applyImpulse(V(up.x * this.jumpSpeed * m, up.y * this.jumpSpeed * m, up.z * this.jumpSpeed * m), true); this.jumps = 1; this.flipping = 0; }
    else if (press && this.jumps < 2 && this.airTime < 1.5) {
      this.jumps = 2;
      const fx = -(i.pitch ?? i.throttle ?? 0), sx = i.roll ?? i.steer ?? 0;
      if (Math.abs(fx) + Math.abs(sx) < .2) b.applyImpulse(V(0, this.jumpSpeed * .8 * m, 0), true);   // straight double jump
      else {
        const r = this.right, flat = Math.hypot(f.x, f.z) || 1, fw = V(f.x / flat, 0, f.z / flat), rt = V(r.x, 0, r.z);
        const d = V(fw.x * -fx + rt.x * sx, 0, fw.z * -fx + rt.z * sx), dl = Math.hypot(d.x, d.z) || 1;
        b.applyImpulse(V(d.x / dl * this.dodgeSpeed * m, 1 * m, d.z / dl * this.dodgeSpeed * m), true);
        // spin about the axis across the flip direction
        const ax = V(d.z / dl, 0, -d.x / dl); b.setAngvel(V(ax.x * 9, 0, ax.z * 9), true); this.flipping = .6;
      }
    }
    this.flipping = Math.max(0, this.flipping - dt);
    // air control: turn the spin toward what the stick asks, in the car's own axes
    if (!ground && this.flipping <= 0) {
      const want = rot(V(-(i.pitch || 0) * this.air, -(i.yaw ?? i.steer ?? 0) * this.air, -(i.roll || 0) * this.air), this.rot), s = b.angvel(), k = Math.min(1, dt * 6);
      b.setAngvel(V(s.x + (want.x - s.x) * k, s.y + (want.y - s.y) * k, s.z + (want.z - s.z) * k), true);
    }
    // boost: push along the nose, up to the boost top speed
    if (this.boosting) {
      this.boost = Math.max(0, this.boost - this.boostUse * dt);
      const v = b.linvel(), along = v.x * f.x + v.y * f.y + v.z * f.z;
      if (along < this.boostTop) { const k = this.boostPush * dt * m; b.applyImpulse(V(f.x * k, f.y * k, f.z * k), true); }
    } else if (ground) {
      const v = b.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      if (sp > this.top) { const k = this.top / sp; b.setLinvel(V(v.x * k, v.y * k, v.z * k), true); }
    }
    return this;
  }
  /** Flip back onto the wheels (when stuck upside down). */
  rightUp() { this.car.rightUp(); return this; }
  get upsideDown() { return this.car.upsideDown; }
  remove() { this.car.remove(); }
}

/**
 * A simple opponent for ball games: drives to get behind the ball and hits it toward the other goal,
 * goes back to defend when the ball heads for its own goal, and boosts on long runs. Returns the
 * input for car.control().
 */
export function chaseBall(car, arena, { skill = .7 } = {}) {
  const b = arena.ball.pos, p = car.pos, f = car.forward, aim = car.team === 0 ? 1 : -1;
  const danger = arena.danger(1.5) === car.team;
  // where to go: behind the ball (on the side away from the goal it attacks), or our own goal mouth
  const lead = arena.predict(.5 * skill).at(-1) || b;
  let tx = lead.x, tz = lead.z - aim * 2.5;
  if (danger) { tx = b.x * .5; tz = -aim * (arena.l / 2 - 3); }
  if ((p.z - lead.z) * aim > 0 && !danger) { tx = lead.x + (p.x > lead.x ? 3 : -3); tz = lead.z - aim * 4; }   // wrong side: go round
  const dx = tx - p.x, dz = tz - p.z, want = Math.atan2(dx, -dz), have = Math.atan2(f.x, -f.z);
  let err = Math.atan2(Math.sin(want - have), Math.cos(want - have));
  const dist = Math.hypot(dx, dz), steer = Math.max(-1, Math.min(1, err * 2.2)), back = Math.abs(err) > 2.4 && dist < 8;
  const near = Math.hypot(b.x - p.x, b.z - p.z) < 5;
  return { throttle: back ? -1 : 1, steer: back ? -steer : steer, boost: !back && Math.abs(err) < .3 && dist > 12 && car.boost > 20 && skill > .4, jump: near && b.y > 2.4 && b.y < 5 && Math.abs(err) < .4 && skill > .5 };
}
