// Weapons and damage for shooters, 2D or 3D: guns with recoil, spread, magazines and reloads, shots
// that hit at once or fly, damage that falls off with distance, headshots, grenade arcs; and health
// that comes back, armour, a downed state and "where was I hit from" arrows. The kit does the sums
// and timing; your game draws the gun, the shots and the HUD, and says what a shot hit.
//
//   const { Gun, Health, arc, hitFrom } = gs.combat;
//   reset() {
//     gun = new Gun({ damage: 20, rate: 8, mag: 30, reload: 1.6, spread: .03, recoil: .06, falloff: [20, 60, .5] });
//     me = new Health({ max: 100, regen: 25, delay: 3, armour: 50 });
//   }
//   update(dt) {
//     gun.update(dt); me.update(dt);
//     if (fireHeld) for (const s of gun.pull(eye, aimDir)) {           // 0, 1 or more shots this frame
//       const hit = phys.ray(s.from, s.dir, s.range);                    // you find what it hit
//       if (hit) { const dmg = s.damageAt(hit.distance, hit.thing.tag === 'head'); enemy.hp -= dmg; markers.push(...) }
//     }
//     aimPitch += gun.kick.pitch; aimYaw += gun.kick.yaw;                // recoil this frame: up while firing, drifting back after
//   }
//   enemy fires at you: me.hurt(12, { from: enemy.pos, at: me.pos, facing: yaw }) -> me.hits for arrows
//   draw: gun.ammo, gun.reloading (0..1), gun.spreadNow (crosshair size), me.hp, me.armour, me.hits
//
// Vectors are plain { x, y } or { x, y, z } (three.js vectors work too). 2D games leave out z.

const len = v => Math.hypot(v.x, v.y, v.z || 0);
const norm = v => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: (v.z || 0) / l }; };
const has3 = v => v.z != null;

/**
 * A gun. damage per shot; rate: shots per second; mag: rounds per magazine (Infinity for none);
 * reserve: spare rounds (Infinity); reload: seconds; spread: radians of random aim cone (grows by
 * bloom per shot up to maxSpread, settles back at settle per second); pellets: shots per pull
 * (shotguns); auto: hold to keep firing; recoil: radians of kick up per shot (and a little sideways);
 * range; falloff: [from, to, keep] (full damage up to `from`, down to `keep` x at `to`); head:
 * headshot multiplier; speed: 0 for instant hits, else a flying shot (metres or units a second).
 */
export class Gun {
  constructor(o = {}) {
    Object.assign(this, {
      damage: 20, rate: 6, mag: 12, reserve: Infinity, reload: 1.4, spread: .02, bloom: .01, maxSpread: .12, settle: .25,
      pellets: 1, auto: true, recoil: .04, sideways: .4, recover: 8, range: 100, falloff: null, head: 2, speed: 0, rng: Math.random,
    }, o);
    this.ammo = this.mag; this.cool = 0; this.reloadLeft = 0; this.extra = 0; this.held = false;
    this.kick = { pitch: 0, yaw: 0 }; this.owed = { pitch: 0, yaw: 0 }; this.offset = { pitch: 0, yaw: 0 }; this.justFired = false; this.empty = false;
  }
  /** 0..1 through a reload (0 when not reloading). */
  get reloading() { return this.reloadLeft > 0 ? 1 - this.reloadLeft / this.reload : 0; }
  /** The aim cone right now (radians), for the crosshair. */
  get spreadNow() { return this.spread + this.extra; }
  /** Starts a reload (if there's room and spare rounds). */
  startReload() { if (this.reloadLeft > 0 || this.ammo >= this.mag || this.reserve <= 0) return false; this.reloadLeft = this.reload; return true; }
  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.extra = Math.max(0, this.extra - this.settle * dt);
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) { const n = Math.min(this.mag - this.ammo, this.reserve); this.ammo += n; this.reserve -= n; this.reloadLeft = 0; this.reloaded = true; }
    } else this.reloaded = false;
    // recoil: kick arrives over a few frames and then the aim drifts most of the way back
    const k = Math.min(1, dt * 30), r = Math.min(1, dt * this.recover) * (this.held ? .3 : 1);
    const up = this.owed.pitch * k, side = this.owed.yaw * k; this.owed.pitch -= up; this.owed.yaw -= side;
    const backP = this.offset.pitch * r * .7, backY = this.offset.yaw * r * .7;
    this.kick.pitch = up - backP; this.kick.yaw = side - backY;
    this.offset.pitch += this.kick.pitch; this.offset.yaw += this.kick.yaw;
    return this;
  }
  /**
   * Pull (or hold) the trigger this frame: aims from `from` along `dir`. Returns the shots fired now
   * (an empty list when cooling down, reloading or empty): [{ from, dir, range, speed, damageAt(distance, head) }].
   * pressed: false when the trigger isn't held (lets semi-auto guns fire again).
   */
  pull(from, dir, pressed = true) {
    this.justFired = false; this.empty = false;
    if (!pressed) { this.held = false; return []; }
    if (this.cool > 0 || this.reloadLeft > 0 || (!this.auto && this.held)) { this.held = true; return []; }
    this.held = true;
    if (this.ammo <= 0) { this.empty = true; this.startReload(); this.cool = .25; return []; }
    this.ammo--; this.cool = 1 / this.rate; this.justFired = true;
    const shots = [], is3 = has3(dir), d = norm(dir);
    for (let i = 0; i < this.pellets; i++) shots.push(this.shot(from, this.wobble(d, this.spreadNow, is3)));
    this.extra = Math.min(this.maxSpread - this.spread, this.extra + this.bloom);
    this.owed.pitch += this.recoil; this.owed.yaw += (this.rng() - .5) * 2 * this.recoil * this.sideways;
    if (this.ammo === 0) this.startReload();
    return shots;
  }
  wobble(d, cone, is3) {
    if (!is3) { const ang = Math.atan2(d.y, d.x) + (this.rng() - .5) * 2 * cone; return { x: Math.cos(ang), y: Math.sin(ang) }; }
    if (!cone) return d;
    const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * cone;
    // two directions at right angles to d, then tilt d by r towards angle a
    const up = Math.abs(d.y) < .99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const u = norm({ x: up.y * d.z - up.z * d.y, y: up.z * d.x - up.x * d.z, z: up.x * d.y - up.y * d.x });
    const v = { x: d.y * u.z - d.z * u.y, y: d.z * u.x - d.x * u.z, z: d.x * u.y - d.y * u.x };
    const c = Math.cos(a) * Math.tan(r), s = Math.sin(a) * Math.tan(r);
    return norm({ x: d.x + u.x * c + v.x * s, y: d.y + u.y * c + v.y * s, z: d.z + u.z * c + v.z * s });
  }
  shot(from, dir) {
    const gun = this;
    return { from: { ...from }, dir, range: this.range, speed: this.speed, damageAt: (distance = 0, head = false) => gun.damageAt(distance, head) };
  }
  /** Damage at a distance, with falloff and headshots. */
  damageAt(distance = 0, head = false) {
    let d = this.damage;
    if (this.falloff) { const [a, b, keep] = this.falloff; d *= distance <= a ? 1 : distance >= b ? keep : 1 - (1 - keep) * (distance - a) / (b - a); }
    return Math.round(d * (head ? this.head : 1));
  }
  /** For api.save or a weapon swap: ammo and reserve. */
  save() { return { a: this.ammo, r: this.reserve === Infinity ? -1 : this.reserve }; }
  load(d) { if (d) { this.ammo = d.a; this.reserve = d.r < 0 ? Infinity : d.r; } return this; }
}

/**
 * Flying shots (rockets, arrows, plasma): add shots from Gun.pull with speed, update moves them, hits come back.
 * gravity: pull on them (arrows drop); push: how hard a hit shoves a loose body (kg metres a second: a rifle round
 * about 4, a rocket 300) when update is given a physics world.
 */
export class Shots {
  constructor({ gravity = 0, push = 0 } = {}) { this.list = []; this.gravity = gravity; this.push = push; }
  /** extra: anything to keep on the shot (who fired it; not: their body in the physics world, which the shot passes). */
  add(s, extra = {}) { const v = { x: s.dir.x * s.speed, y: s.dir.y * s.speed, z: (s.dir.z || 0) * s.speed }; this.list.push({ ...extra, x: s.from.x, y: s.from.y, z: s.from.z || 0, v, left: s.range / Math.max(1, s.speed), shot: s }); return this; }
  /**
   * Moves every shot. hits(from, to, shot) => what it hit (or null): give it your ray test, or a physics world
   * (a gs.physics3d World3D, or gs.physics' 2D Physics): each shot is then traced against everything in it, hits
   * stop where they met it ({ thing, point, normal }) and shove what they hit. Returns [{ shot, hit, at }] for
   * shots that hit this frame (they are removed).
   */
  update(dt, hits) {
    const out = [], test = typeof hits === 'function' ? hits : hits?.ray ? traced(hits, this) : null;
    for (const p of this.list) {
      const from = { x: p.x, y: p.y, z: p.z };
      p.v.y += this.gravity * dt; p.x += p.v.x * dt; p.y += p.v.y * dt; p.z += p.v.z * dt; p.left -= dt;
      const h = test ? test(from, { x: p.x, y: p.y, z: p.z }, p) : null;
      if (h) { p.dead = true; const at = h.point ? { x: h.point.x, y: h.point.y, z: h.point.z ?? 0 } : { x: p.x, y: p.y, z: p.z }; out.push({ shot: p, hit: h, at }); } else if (p.left <= 0) p.dead = true;
    }
    this.list = this.list.filter(p => !p.dead);
    return out;
  }
}
// a ray test from a physics world for Shots: the first thing along each shot's path this frame (not the shooter's own
// body), shoved along the shot. 3D: World3D.ray; 2D: Physics.ray(x1, y1, x2, y2), whose hits come back with a point.
function traced(world, shots) {
  const flat = world.ray.length >= 4;
  return (a, b, p) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0), l = Math.hypot(dx, dy, dz); if (!l) return null;
    const keep = t => t !== p.not && !t.collider?.isSensor?.();
    const h = flat ? world.ray(a.x, a.y, b.x, b.y, keep) : world.ray(a, { x: dx, y: dy, z: dz }, l, keep);
    if (!h) return null;
    if (flat) h.point = { x: h.x, y: h.y, z: 0 };
    const t = h.thing, k = (p.push ?? shots.push) / l;
    if (k > 0 && t?.body && !t.fixed && !t.body.isKinematic()) {
      if (flat) { const v = world.scale / t.body.mass(); t.push(dx * k * v, dy * k * v, h.x, h.y); }   // (kg m/s to game units a second)
      else t.body.applyImpulseAtPoint({ x: dx * k, y: dy * k, z: dz * k }, world.inner(h.point), true);
    }
    return h;
  };
}

/**
 * Where a thrown thing goes: points along the arc from `from` with velocity `vel` under gravity (a
 * number on y; negative is down in 3D, positive is down in 2D screen games). Stops when ground(p)
 * says it's under the floor, or, with a physics world as ground (a gs.physics3d World3D or 2D Physics),
 * where the arc first meets anything in it (a wall, a crate, the floor): the last point is there.
 * For the aim line before a throw and for grenades.
 */
export function arc(from, vel, gravity = -20, { steps = 40, dt = 1 / 20, ground = null, not = null } = {}) {
  const pts = []; let p = { x: from.x, y: from.y, z: from.z || 0 }, v = { x: vel.x, y: vel.y, z: vel.z || 0 };
  const world = ground && typeof ground !== 'function' && ground.ray ? ground : null, flat = world && world.ray.length >= 4, keep = t => t !== not && !t.collider?.isSensor?.();
  for (let i = 0; i < steps; i++) {
    pts.push({ ...p });
    v = { ...v, y: v.y + gravity * dt }; const n = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
    if (world) {
      const d = { x: n.x - p.x, y: n.y - p.y, z: n.z - p.z }, l = Math.hypot(d.x, d.y, d.z), h = !l ? null : flat ? world.ray(p.x, p.y, n.x, n.y, keep) : world.ray(p, d, l, keep);
      if (h) { pts.push(flat ? { x: h.x, y: h.y, z: 0, hit: h } : { ...h.point, hit: h }); break; }
    } else if (ground && ground(n)) { pts.push(n); break; }
    p = n;
  }
  return pts;
}
/** The throw velocity that lands at `to` from `from` in `time` seconds under gravity. */
export function lob(from, to, time = 1, gravity = -20) {
  return { x: (to.x - from.x) / time, y: (to.y - from.y) / time - .5 * gravity * time, z: ((to.z || 0) - (from.z || 0)) / time };
}

/**
 * The player's (or anyone's) health. max; regen: health back per second after `delay` seconds
 * without a hit (0 for none); armour: soaks hits first (absorb share of each hit); downed: true to
 * go down at 0 instead of dying (revive() brings them back; bleed seconds to be revived).
 */
export class Health {
  constructor({ max = 100, regen = 0, delay = 4, armour = 0, maxArmour = armour, absorb = .66, downed = false, bleed = 12 } = {}) {
    Object.assign(this, { max, regen, delay, armour, maxArmour, absorb, canDown: downed, bleed });
    this.hp = max; this.since = 99; this.hits = []; this.down = false; this.dead = false; this.bleedLeft = 0; this.flash = 0;
  }
  /** 0..1 */
  get frac() { return this.hp / this.max; }
  /** True for a moment after a hit (red edges, a grunt). */
  get hurting() { return this.flash > 0; }
  /**
   * Takes damage. from/at: where the hit came from and where we are, with facing (radians: in 2D the
   * angle we face, in 3D our yaw with -z forward), for a direction arrow. Returns the health lost.
   */
  hurt(amount, { from = null, at = null, facing = 0 } = {}) {
    if (this.dead || amount <= 0) return 0;
    let toArmour = Math.min(this.armour, amount * this.absorb); this.armour -= toArmour;
    const lost = Math.min(this.hp, amount - toArmour); this.hp -= lost; this.since = 0; this.flash = .3;
    if (from && at) this.hits.push({ angle: hitFrom(from, at, facing), life: 1.2, amount });
    if (this.hp <= 0) { if (this.down) this.bleedLeft -= amount / 10; else if (this.canDown) { this.down = true; this.bleedLeft = this.bleed; } else this.dead = true; }
    return lost;
  }
  heal(n) { if (this.dead) return 0; const b = this.hp; this.hp = Math.min(this.max, this.hp + n); return this.hp - b; }
  addArmour(n) { this.armour = Math.min(this.maxArmour || n, this.armour + n); return this; }
  revive(share = .3) { if (!this.down) return this; this.down = false; this.hp = Math.max(1, this.max * share); this.since = 0; return this; }
  update(dt) {
    this.since += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.down) { this.bleedLeft -= dt; if (this.bleedLeft <= 0) { this.down = false; this.dead = true; } }
    else if (!this.dead && this.regen && this.since > this.delay) this.hp = Math.min(this.max, this.hp + this.regen * dt);
    for (const h of this.hits) h.life -= dt; this.hits = this.hits.filter(h => h.life > 0);
    return this;
  }
  reset() { this.hp = this.max; this.armour = this.maxArmour; this.down = this.dead = false; this.hits = []; this.since = 99; return this; }
}

/**
 * Which way a hit came from, relative to where we face: radians, 0 = straight ahead, positive = to
 * the right. 2D: facing is our angle. 3D (points with z): facing is our yaw, looking along -z at 0.
 */
export function hitFrom(from, at, facing = 0) {
  let a;
  if (has3(from) && has3(at)) { const dx = from.x - at.x, dz = from.z - at.z; a = Math.atan2(dx, -dz) + facing; }
  else a = Math.atan2(from.y - at.y, from.x - at.x) - facing;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Short-lived hit markers for the crosshair: markers.add(head, kill); markers.list -> [{ head, kill, life }]. */
export class Markers {
  constructor() { this.list = []; }
  add(head = false, kill = false) { this.list.push({ head, kill, life: kill ? .45 : .25 }); return this; }
  update(dt) { for (const m of this.list) m.life -= dt; this.list = this.list.filter(m => m.life > 0); return this; }
  get showing() { return this.list.length > 0; }
}

/**
 * Explosive barrels, mines and gas tanks that set each other off. add({ x, y, z?, radius, damage,
 * fuse }) each one; boom(thing) sets one off now; update(dt) runs the chain: anything within a blast's
 * radius goes off after its own fuse. on('boom', b => ...) is your cue for effects and damage: b.hurt(p)
 * gives damage at a point (less further out).
 * world: a gs.physics3d World3D or 2D Physics: each blast throws what is near it (b.push: how hard, metres a
 * second at the middle, 3 x its radius by default; in 2D game units a second, 600 by default), a barrel added with body: (its body there) goes where the body
 * goes and is set off by a knock harder than `knock` metres a second (9; 300 game units a second in 2D: a fall,
 * a car, a crate thrown at it).
 */
export class Explosives {
  constructor({ fuse = .25, radius = 4, damage = 80, world = null, knock = null } = {}) {
    this.list = []; this.handlers = {}; this.d = { fuse, radius, damage }; this.world = world;
    knock ??= world?.ray?.length >= 4 ? 300 : 9;   // (2D: game units a second)
    if (world?.onHit) world.onHit((a, b, speed) => { if (speed < knock) return; for (const x of this.list) if (!x.gone && (x.body === a || x.body === b)) this.light(x); });
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  add(o) { const b = { ...this.d, ...o, lit: -1, gone: false }; this.list.push(b); return b; }
  /** Lights one (it goes off after its fuse, or at once with now). */
  light(b, now = false) { if (b.gone || b.lit >= 0) return this; b.lit = now ? 0 : b.fuse; return this; }
  boom(b) { return this.light(b, true); }
  /** Things in range of a point (for a shot or a fire hitting barrels): lights them. */
  near(p, r = 0) { for (const b of this.list) if (!b.gone && Math.hypot(b.x - p.x, b.y - p.y, (b.z || 0) - (p.z || 0)) <= r + (b.size || .5)) this.light(b); return this; }
  update(dt) {
    for (const b of this.list) if (b.body && !b.gone) { if (b.body.dead) { b.body = null; continue; } const p = b.body.pos ?? b.body; b.x = p.x; b.y = p.y; if (p.z != null) b.z = p.z; }   // (a barrel that rolls)
    for (const b of this.list) {
      if (b.gone || b.lit < 0) continue;
      b.lit -= dt; if (b.lit > 0) continue;
      b.gone = true;
      const e = { ...b, at: { x: b.x, y: b.y, z: b.z || 0 }, hurt: p => { const d = Math.hypot(p.x - b.x, p.y - b.y, (p.z || 0) - (b.z || 0)); return d >= b.radius ? 0 : Math.round(b.damage * (1 - d / b.radius)); } };
      const W = this.world; if (W) { if (W.ray.length >= 4) W.blast(b.x, b.y, b.radius, b.push); else W.blast(e.at, b.radius, b.push ?? b.radius * 3); }   // (2D: game units a second, its own default)
      for (const f of this.handlers.boom || []) f(e, b);
      for (const o of this.list) if (!o.gone && o.lit < 0 && Math.hypot(o.x - b.x, o.y - b.y, (o.z || 0) - (b.z || 0)) <= b.radius) this.light(o);
    }
    this.list = this.list.filter(b => !b.gone);
    return this;
  }
}
