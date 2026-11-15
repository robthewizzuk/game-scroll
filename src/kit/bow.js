// Bows for 3D games: an arrow nocked from the quiver, the string drawn back (the longer it is held the harder it flies,
// held at full draw too long and the arm starts to shake), loosed, flying in an arc that drops with gravity, and
// stopping in what it hits: in the walls and ground of the game's World3D (where it stays, sticking out), or in a
// person or creature from the game's list (it goes along with them). The kit does the sums and the sounds; the game
// draws the bow (gs.models.weapon('bow'), its string to the hand with bow.pull(k)), the arrows (show() keeps a model on
// each, or read flying and stuck) and says what a hit does. Kit use: games reach it as gs.combat.Bow.
//
//   const { Bow, Pouch } = gs.combat;
//   reset() { bow = new Bow({ pouch: new Pouch({ arrows: 20 }) }); bow.show(view.scene, () => gs.models.weapon('arrow')); }
//   update(dt) {
//     for (const h of bow.update(dt, { pull: held, from: eye, dir: aim, targets: foes })) { if (h.who) h.who.hp -= h.damage; }
//     bowModel.pull(bow.k);                                         // the string comes back as far as it is drawn
//     rig.play(bow.k > 0 ? 'bowDraw' : 'bowReady', { at: bow.k });
//   }
//
// Positions are metres with y up; targets are anything with a position (or x, y, z), a radius (.35) and a height (1.8)
// standing on it, as gs.fight.Melee and the movers have.
import { weaponSound } from './arsenal.js';
import { linksFor } from './links.js';

const posOf = t => t.pos || t.position || t;

/**
 * new Bow({ draw, speed, damage, gravity, spread, shake, tire, nock, pouch, ammo, stick, sounds, rng }):
 * draw (seconds to full draw, .75), speed (metres a second at full draw, 60), damage (at full draw, 40), gravity (-9.8),
 * spread (radians, at full draw, .004), shake (radians a second more once held past tire seconds, 2.5), nock (seconds to
 * take the next arrow, .45), pouch (a gs.combat.Pouch the arrows come out of; without, they never run out) and ammo (its
 * name for them, 'arrows'), stick (how many arrows stay where they landed, 16), range (metres before an arrow is gone, 220).
 * update(dt, { pull, from, dir, targets, hits }) each frame: pull (the button is held), from and dir (where it leaves and
 * which way it is aimed, as the eye looks), targets (who can be hit), hits (your own ray test, else the game's World3D).
 * Returns the hits this frame: [{ arrow, who (a target, or null), thing (what of the world, or null), at, dir, damage,
 * head (it struck the top tenth of a target), speed }]. Then k (the draw, 0..1), loaded, ready (nocked and not drawn), flying,
 * stuck; events 'nock', 'draw', 'loose', 'hit' (on(name, fn)).
 */
export class Bow {
  constructor({ draw = .75, speed = 60, damage = 40, gravity = -9.8, spread = .004, shake = .03, tire = 2.5, nock = .45, pouch = null, ammo = 'arrows', stick = 16, range = 220, sounds = true, rng = Math.random, link = true } = {}) {
    Object.assign(this, { drawTime: draw, speed, damage, gravity, spread, shake, tire, nockTime: nock, pouch, ammo, stickMax: stick, range, sounds, rng });
    this.links = linksFor(this, link); this.ons = {}; this.models = null; this.reset();
  }
  reset() { this.k = 0; this.full = 0; this.loaded = false; this.nockT = 0; this.flying = []; this.stuck = []; this.hits = []; return this; }
  on(ev, fn) { (this.ons[ev] ||= []).push(fn); return this; }
  emit(ev, e) { for (const f of this.ons[ev] || []) f(e); }
  /** Nocked, and not being drawn. */
  get ready() { return this.loaded && this.k === 0; }
  /** Arrows left (in the pouch, and on the string). */
  get left() { return (this.pouch ? this.pouch.count(this.ammo) : Infinity) + (this.loaded ? 1 : 0); }
  /** How far off the aim an arrow loosed now may go (radians): wide when barely drawn, steady at full, shaking when held too long. */
  get wobble() { return this.spread * (1 + (1 - this.k) * 6) + this.shake * Math.max(0, this.full - this.tire); }
  update(dt, { pull = false, from = null, dir = null, targets = [], hits } = {}) {
    this.hits = [];
    // the next arrow onto the string
    if (!this.loaded) {
      this.nockT -= dt;
      if (this.nockT <= 0 && (!this.pouch || this.pouch.take(this.ammo, 1) > 0)) { this.loaded = true; this.emit('nock', {}); if (this.sounds) weaponSound('bow', 'nock', from); }
    }
    if (this.loaded) {
      if (pull) {
        if (this.k === 0) { this.emit('draw', {}); if (this.sounds) weaponSound('bow', 'draw', from, { time: this.drawTime }); }
        this.k = Math.min(1, this.k + dt / this.drawTime); if (this.k >= 1) this.full += dt;
      } else if (this.k > 0) {
        if (this.k > .2 && from && dir) this.loose(from, dir); else { this.k = Math.max(0, this.k - dt * 3); this.full = 0; }   // (barely drawn: let down)
      }
    }
    this.fly(dt, targets, hits);
    if (this.models) this.sync();
    return this.hits;
  }
  /** Lets the arrow go now (update does it when pull ends), from and dir as in update. */
  loose(from, dir) {
    if (!this.loaded || this.k <= 0) return null;
    const k = this.k, s = this.speed * (.3 + .7 * k), w = this.wobble, d = norm(dir);
    // off the aim by up to the wobble, in a random direction round it
    const a = norm(Math.abs(d.y) > .95 ? { x: 1, y: 0, z: 0 } : { x: -d.z, y: 0, z: d.x }), b = cross(d, a), off = Math.sqrt(this.rng()) * w, turn = this.rng() * Math.PI * 2;
    for (const c of ['x', 'y', 'z']) d[c] += (a[c] * Math.cos(turn) + b[c] * Math.sin(turn)) * off;
    Object.assign(d, norm(d));
    const arrow = { x: from.x, y: from.y, z: from.z, v: { x: d.x * s, y: d.y * s, z: d.z * s }, damage: this.damage * (.25 + .75 * k * k), left: this.range / s, k };
    this.flying.push(arrow); this.loaded = false; this.nockT = this.nockTime; this.k = 0; this.full = 0;
    this.emit('loose', { arrow }); if (this.sounds) weaponSound('bow', 'fire', from);
    return arrow;
  }
  fly(dt, targets, hits) {
    const world = hits == null ? this.links?.one('world') : null;
    for (const a of this.flying) {
      const x0 = a.x, y0 = a.y, z0 = a.z;
      a.v.y += this.gravity * dt; a.x += a.v.x * dt; a.y += a.v.y * dt; a.z += a.v.z * dt; a.left -= dt;
      const dx = a.x - x0, dy = a.y - y0, dz = a.z - z0, len = Math.hypot(dx, dy, dz) || 1e-6;
      let best = null, bt = 1;
      // the people and creatures in the way: the path through an upright cylinder round each
      for (const t of targets) {
        if (!t || (t.hp ?? 1) <= 0 || t.untouchable) continue;
        const p = posOf(t), r = t.radius ?? .35, h = t.height ?? 1.8, u = cylHit(x0, y0, z0, dx, dy, dz, p.x, p.y ?? 0, p.z, r, h);
        if (u != null && u < bt) { bt = u; best = { who: t, y: y0 + dy * u - (p.y ?? 0), h }; }
      }
      // the world: the game's World3D, or your own test
      let hw = null;
      if (typeof hits === 'function') hw = hits({ x: x0, y: y0, z: z0 }, { x: a.x, y: a.y, z: a.z }, a);
      else if (world?.ray) hw = world.ray({ x: x0, y: y0, z: z0 }, { x: dx, y: dy, z: dz }, len, t => !t.collider?.isSensor?.());
      if (hw) { const hp = hw.point || hw, u = Math.hypot(hp.x - x0, hp.y - y0, (hp.z ?? 0) - z0) / len; if (u < bt) { bt = u; best = { thing: hw.thing ?? hw.body ?? null, normal: hw.normal }; } }
      if (best) {
        a.dead = true;
        const at = { x: x0 + dx * bt, y: y0 + dy * bt, z: z0 + dz * bt }, dir = { x: dx / len, y: dy / len, z: dz / len }, speed = Math.hypot(a.v.x, a.v.y, a.v.z);
        const head = !!best.who && best.y > best.h * .9;
        const hit = { arrow: a, who: best.who || null, thing: best.thing || null, at, dir, speed, head, damage: Math.round(a.damage * (head ? 2 : 1)) };
        this.stick(at, dir, best.who);
        this.hits.push(hit); this.emit('hit', hit); if (this.sounds) weaponSound('bow', best.who ? 'flesh' : 'thunk', at);
      } else if (a.left <= 0) a.dead = true;
    }
    this.flying = this.flying.filter(a => !a.dead);
    // arrows stuck in someone go along with them (turned with them), and fall out when they are down
    for (const s of this.stuck) {
      if (!s.on) continue; const p = posOf(s.on), yaw = s.on.rotation ? s.on.rotation.y : s.on.yaw ?? 0, c = Math.cos(yaw - s.yaw), n = Math.sin(yaw - s.yaw);
      s.x = p.x + s.ox * c + s.oz * n; s.y = (p.y ?? 0) + s.oy; s.z = p.z - s.ox * n + s.oz * c;
      const dx = s.d0.x * c + s.d0.z * n, dz = -s.d0.x * n + s.d0.z * c; s.dir = { x: dx, y: s.d0.y, z: dz };
      if ((s.on.hp ?? 1) <= 0 && s.on.react?.state === 'down') s.on = null;
    }
  }
  // an arrow where it stopped, its head a little in
  stick(at, dir, who) {
    const s = { x: at.x + dir.x * .06, y: at.y + dir.y * .06, z: at.z + dir.z * .06, dir: { ...dir }, on: who || null };
    if (who) { const p = posOf(who); s.ox = s.x - p.x; s.oy = s.y - (p.y ?? 0); s.oz = s.z - p.z; s.yaw = who.rotation ? who.rotation.y : who.yaw ?? 0; s.d0 = { ...dir }; }
    this.stuck.push(s); while (this.stuck.length > this.stickMax) this.stuck.shift();
  }
  /** Picks up the stuck arrows near a point (walked over): how many went back in the pouch. */
  gather(at, reach = 1.2) {
    let n = 0; this.stuck = this.stuck.filter(s => { if (s.on || Math.hypot(s.x - at.x, s.z - at.z) > reach || Math.abs(s.y - at.y) > 2) return true; n++; return false; });
    if (n && this.pouch) n = this.pouch.add(this.ammo, n);
    return n;
  }
  /**
   * Keeps a model on each arrow in flight and each stuck one, in scene: make() gives one (an Object3D pointing along -z from
   * its nock at the origin, as () => gs.models.weapon('arrow') does). Call once; update() then moves them. hide() takes them away.
   */
  show(scene, make) { if (typeof make !== 'function') throw new Error("gs.combat.Bow.show(scene, make): make gives an arrow, () => gs.models.weapon('arrow')"); this.models = { scene, make, pool: [] }; return this; }
  hide() { if (this.models) for (const m of this.models.pool) m.removeFromParent(); this.models = null; return this; }
  sync() {
    const M = this.models, all = [...this.flying.map(a => ({ x: a.x, y: a.y, z: a.z, dir: a.v, fly: true })), ...this.stuck];
    while (M.pool.length < all.length) { const m = M.make(); M.scene.add(m); M.pool.push(m); }
    M.pool.forEach((m, i) => {
      const a = all[i]; m.visible = !!a; if (!a) return;
      const d = norm(a.dir);
      // (an arrow's point is .78 m ahead of its nock: the model is placed by the nock, the arrow's place is its point; lookAt turns +z to a point, so behind it)
      m.position.set(a.x - d.x * .78, a.y - d.y * .78, a.z - d.z * .78); m.lookAt(m.position.x - d.x, m.position.y - d.y, m.position.z - d.z);
    });
  }
}
const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

// where (0..1 of the step) a path from (x,y,z) by (dx,dy,dz) first enters an upright cylinder of radius r, height h at (cx,cy,cz)
function cylHit(x, y, z, dx, dy, dz, cx, cy, cz, r, h) {
  const ox = x - cx, oz = z - cz, a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - r * r;
  let t0 = 0, t1 = 1;
  if (a < 1e-9) { if (c > 0) return null; } else {
    const disc = b * b - 4 * a * c; if (disc < 0) return null;
    const s = Math.sqrt(disc); t0 = Math.max(0, (-b - s) / (2 * a)); t1 = Math.min(1, (-b + s) / (2 * a)); if (t0 > t1) return null;
  }
  // within its height somewhere between t0 and t1
  for (const t of [t0, t1]) { const yy = y + dy * t - cy; if (yy >= 0 && yy <= h) return t; }
  if (Math.abs(dy) > 1e-9) for (const yy of [0, h]) { const t = (cy + yy - y) / dy; if (t >= t0 && t <= t1) return t; }
  return null;
}
