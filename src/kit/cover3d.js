// Cover in 3D, found from the level itself: whatever is solid in the game's gs.physics3d World3D (walls, low walls,
// cars, crates, a city's buildings, a level made with world.ground(mesh)) is felt for with rays, and every place a
// person can crouch or stand with their back to something solid becomes a cover spot: which way it faces, how high it
// is (low: shoot over it; high: lean out round its end), where its ends are. Then the hero can take it (TakeCover:
// snap to the wall, slide along it, stop at its ends, peek out, pop up over it, fire blind, run to the next), and a
// gs.tactics Squad hands the same spots out to enemies, with real line of sight.
//
//   const { Cover3D, TakeCover } = gs.tactics;
//   reset() {
//     world = new World3D(); world.ground(levelMesh);            // the level (or city.solid, props.solid...)
//     cover = new Cover3D();                                    // finds the game's World3D by itself
//     hide = new TakeCover(cover);
//     squad = new Squad(enemies);                              // finds the cover by itself; 3D positions: x, y (up), z
//   }
//   update(dt) {
//     cover.update(hero.feet);                                  // looks for cover round the hero, a little each frame
//     if (coverTapped) hide.busy ? hide.leave() : hide.take(hero.feet, heroYaw);
//     if (hide.busy) {
//       hide.update(dt, { move: { x, z }, aim: aimHeld, blind: fireHeld && !aimHeld, threat: nearestEnemy }, hero.feet);
//       hero.walk(hide.walk.x, hide.walk.z); heroYaw = hide.facing;
//       rig.play(hide.pose); rig.upper(hide.upper);             // 'coverHighL', 'coverLowR', 'peekHighL', 'aim', 'blindOver'...
//       if (fireHeld) for (const s of gun.pull(hide.muzzle, aimDir)) ...   // hide.spread: add to the aim cone (blind fire)
//     }
//   }
//
// Positions are { x, y, z } with y up; a spot's y is the floor it stands on (feet). Kit use in a Squad: it has the same
// find(), take(), free(), peek(), protects(), avoid() as the 2D CoverMap.

import { linksFor } from './links.js';

const hyp = (x, z) => Math.sqrt(x * x + z * z);
const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
const H = [.5, .95, 1.35, 1.75];   // heights above the floor a wall is felt at: knee, a crouched head, a low wall's top, a standing head
const key = (i, j) => i * 73856093 ^ j * 19349663;

/**
 * Cover spots from a World3D. world: the World3D (left out: the one the game made). space: metres between spots along
 * a wall (1). radius: the person's (.35). crouch: the height that hides a crouched person (.95); low: cover lower than
 * this (1.3 m) is shot over, higher is leaned round. cell: metres of the squares it looks over a square at a time (4).
 * floors: floors it looks for under one spot, for buildings with storeys (3). ms: time it may take each update (1.2).
 * top: the highest it looks from (60 m over the point it is given).
 */
export class Cover3D {
  constructor({ world = null, space = 1, radius = .35, crouch = .95, low = 1.3, cell = 4, floors = 3, ms = 1.2, top = 60, link = true } = {}) {
    const L = this.links = linksFor(null, link); L?.join('cover', this);
    this.given = world; this.seek = world == null;
    Object.assign(this, { space, radius, crouch, low, cell, floors, ms, top });
    this.size = space; this.spots = []; this.done = new Set(); this.hash = new Map(); this.rays = 0; this.queue = [];
  }
  get world() { return this.given || (this.seek ? this.links?.one('world') ?? null : null); }
  // ---- feeling for walls
  ray(o, d, len, not = null) { this.rays++; const w = this.world; if (!w) return null; return w.ray(o, d, len, not ? t => t !== not && !t.collider?.isSensor?.() : undefined); }
  floor(x, y, z) { this.rays++; return this.world?.floorAt(x, y, z, .6) ?? null; }
  /** The floors under (x, z) from height y down: their heights, highest first. */
  floorsAt(x, y, z) {
    const out = []; let from = y;
    for (let n = 0; n < this.floors; n++) {
      const f = this.floor(x, from, z); if (f == null) break;
      out.push(f); from = f - 2.2;   // (a storey further down, under this floor)
      if (from < y - this.top * 2) break;
    }
    return out;
  }
  /**
   * A spot against the wall a ray met: hit point p and its normal n (out of the wall, flat), on the floor near y. Null
   * where no one could take cover there: no floor, no room to stand, or what is there is too low to hide behind.
   */
  spotAt(px, pz, nx, nz, y) {
    const l = hyp(nx, nz) || 1; nx /= l; nz /= l;
    const r = this.radius, x = px + nx * (r + .05), z = pz + nz * (r + .05), fy = this.floor(x, y + .5, z);
    if (fy == null || Math.abs(fy - y) > .6) return null;
    // the wall at each height, straight back from where one would stand
    const at = h => { const hit = this.ray({ x: x, y: fy + h, z: z }, { x: -nx, y: 0, z: -nz }, r + .45); return hit && Math.abs(hit.normal.y) < .5 ? hit : null; };
    const knee = at(H[0]), head = at(H[1]); if (!knee || !head) return null;
    // room to stand there: nothing just in front, nothing low overhead
    if (this.ray({ x, y: fy + H[1], z }, { x: nx, y: 0, z: nz }, .5)) return null;
    const over = this.ray({ x, y: fy + .3, z }, { x: 0, y: 1, z: 0 }, 1.2); if (over) return null;
    const high = !!at(H[3]), mid = !!at(H[2]);
    let top = high ? 2 : mid ? H[2] : H[1];
    if (!high) { let a = top, b = mid ? H[3] : H[2]; for (let k = 0; k < 3; k++) { const m = (a + b) / 2; if (at(m)) a = m; else b = m; } top = (a + b) / 2; }   // (where a low wall's top is: what you shoot over)
    const s = { x, y: fy, z, nx, nz, low: top < this.low, top, left: null, right: null, by: null, bad: 0 };
    this.ends(s);
    if (s.left != null && s.right != null && s.left + s.right < .4) return null;   // (the end of a thin wall: nothing to hide behind)
    return s;
  }
  // how far along the wall each end is (within a metre or so): where the wall stops, you can lean out round it
  ends(s) {
    const tx = -s.nz, tz = s.nx, h = s.y + Math.min(s.top, H[1]) - .1, r = this.radius;
    for (const side of [-1, 1]) {
      let end = null;
      for (let d = .3; d <= 1.2 + 1e-6; d += .3) {
        const x = s.x + tx * d * side, z = s.z + tz * d * side;
        if (this.ray({ x: s.x, y: h, z: s.z }, { x: tx * side, y: 0, z: tz * side }, d + r * .5)) break;   // (something in the way along the wall: a corner going in)
        if (!this.ray({ x, y: h, z }, { x: -s.nx, y: 0, z: -s.nz }, r + .45)) { end = d - .15; break; }
      }
      s[side < 0 ? 'left' : 'right'] = end;
    }
  }
  /** Spots in the square of the world numbered (i, j), found now (each square is looked over once; touch() to look again). */
  scanCell(i, j, y) {
    const k = key(i, j); if (this.done.has(k)) return; this.done.add(k);
    const c = this.cell, sp = this.space, n = Math.max(1, Math.round(c / sp)), tried = new Set();
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const x = (i + (a + .5) / n) * c, z = (j + (b + .5) / n) * c;
      for (const f of this.floorsAt(x, y + this.top, z)) {
        for (const [dx, dz] of DIRS) {
          const hit = this.ray({ x, y: f + .7, z }, { x: dx, y: 0, z: dz }, sp * .75); if (!hit || Math.abs(hit.normal.y) > .4) continue;
          if (this.near(hit.point.x + hit.normal.x * this.radius, f, hit.point.z + hit.normal.z * this.radius, hit.normal.x, hit.normal.z, sp * .6)) continue;
          const tk = `${Math.round(hit.point.x * 3)},${Math.round(hit.point.z * 3)},${Math.round(f * 2)},${Math.round(Math.atan2(hit.normal.x, hit.normal.z) * 2)}`;   // (a place that was no good once is not asked about again)
          if (tried.has(tk)) continue; tried.add(tk);
          const s = this.spotAt(hit.point.x, hit.point.z, hit.normal.x, hit.normal.z, f);
          if (s && !this.near(s.x, s.y, s.z, s.nx, s.nz, sp * .6)) this.addSpot(s, k);
        }
      }
    }
  }
  addSpot(s, cellKey) {
    s.cell = cellKey; this.spots.push(s);
    const hk = key(Math.floor(s.x), Math.floor(s.z)); (this.hash.get(hk) || this.hash.set(hk, []).get(hk)).push(s);
    return s;
  }
  // a spot already there close by, facing about the same way
  near(x, y, z, nx, nz, r) {
    const l = hyp(nx, nz) || 1;
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) {
      const list = this.hash.get(key(i, j)); if (!list) continue;
      for (const s of list) if (Math.abs(s.y - y) < .6 && hyp(s.x - x, s.z - z) < r && (s.nx * nx + s.nz * nz) / l > .7) return s;
    }
    return null;
  }
  /** Looks over everything within r metres of a point now (while loading, or before a fight starts). */
  around(p, r = 12) {
    const c = this.cell, y = p.y ?? 0;
    for (let i = Math.floor((p.x - r) / c); i <= Math.floor((p.x + r) / c); i++) for (let j = Math.floor((p.z - r) / c); j <= Math.floor((p.z + r) / c); j++) this.scanCell(i, j, y);
    return this;
  }
  /** Each frame: looks over the squares round a point (the hero) it has not looked at yet, nearest first, for ms at most. reach: metres (24). */
  update(p, { reach = 24 } = {}) {
    if (!this.world || !p) return this;
    const c = this.cell, ci = Math.floor(p.x / c), cj = Math.floor(p.z / c), R = Math.ceil(reach / c), t0 = performance.now();
    if (ci !== this.ci || cj !== this.cj || this.dirty) {
      this.ci = ci; this.cj = cj; this.dirty = false; this.queue = [];
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (!this.done.has(key(ci + a, cj + b))) this.queue.push([ci + a, cj + b, a * a + b * b]);
      this.queue.sort((u, v) => v[2] - u[2]);
    }
    while (this.queue.length && performance.now() - t0 < this.ms) { const [i, j] = this.queue.pop(); this.scanCell(i, j, p.y ?? 0); }
    return this;
  }
  /** Forgets the spots within r metres of a point and looks again (something there moved, broke or was built). */
  touch(p, r = 4) {
    const c = this.cell, gone = new Set();
    for (let i = Math.floor((p.x - r) / c); i <= Math.floor((p.x + r) / c); i++) for (let j = Math.floor((p.z - r) / c); j <= Math.floor((p.z + r) / c); j++) { const k = key(i, j); if (this.done.delete(k)) gone.add(k); }
    this.spots = this.spots.filter(s => !gone.has(s.cell) || s.by);   // (a spot someone is in stays until they leave it)
    this.hash.clear(); for (const s of this.spots) { const hk = key(Math.floor(s.x), Math.floor(s.z)); (this.hash.get(hk) || this.hash.set(hk, []).get(hk)).push(s); }
    this.dirty = true; return this;
  }
  clear() { this.spots = []; this.done.clear(); this.hash.clear(); this.queue = []; this.dirty = true; return this; }

  // ---- what a spot is good for
  /** Can a see b: a person's eyes (eye: 1.6 m over a's feet) to b's chest (1 m over b's feet), nothing solid between. not: a's own body. */
  sees(a, b, { eye = 1.6, chest = 1, not = null } = {}) {
    const o = { x: a.x, y: (a.y ?? 0) + eye, z: a.z }, d = { x: b.x - o.x, y: (b.y ?? 0) + chest - o.y, z: b.z - o.z }, l = Math.hypot(d.x, d.y, d.z);
    if (l < .05) return true;
    const hit = this.ray(o, d, l, not ?? a.body ?? null);
    return !hit || hit.distance > l - .3 || (b.body && hit.thing === b.body);
  }
  /** Does this spot keep someone crouched there safe from a threat ({ x, y, z } feet)? */
  protects(s, t) {
    const dx = t.x - s.x, dz = t.z - s.z, d = hyp(dx, dz) || 1;
    if ((s.nx * dx + s.nz * dz) / d > -.15) return false;   // (the threat is on the open side)
    return !this.sees(t, s, { chest: Math.min(s.top, this.crouch) - .2 });
  }
  /**
   * The best free spot from `from` against `threat`: as CoverMap.find. near: metres to walk at most (8); band [min, max]:
   * how far from the threat (3, 25); flank: radians round from the line between threat and from to prefer; who: spots
   * taken by others are skipped; sees(a, b): your own line of sight (the world's rays otherwise).
   */
  find(from, threat, { near = 8, band = [3, 25], flank = 0, who = null, sees = null } = {}) {
    let best = null, bs = -Infinity;
    const base = Math.atan2(from.z - threat.z, from.x - threat.x);
    for (const s of this.spots) {
      if (s.by && s.by !== who) continue;
      if (Math.abs(s.y - (from.y ?? s.y)) > 3.5) continue;
      const dw = hyp(s.x - from.x, s.z - from.z); if (dw > near) continue;
      const dt = hyp(s.x - threat.x, s.z - threat.z); if (dt < band[0] || dt > band[1]) continue;
      // cheap tests first: rays only for spots that could win
      let score = -dw - Math.abs(dt - (band[0] + band[1]) / 2) * .2 + (s.low ? .5 : 0) + (s.left != null || s.right != null ? .4 : 0) - (s.bad || 0);
      if (flank) { const a = Math.atan2(s.z - threat.z, s.x - threat.x), off = Math.abs(Math.atan2(Math.sin(a - base), Math.cos(a - base))); score += 6 - Math.abs(off - flank) * 6; }
      if (score <= bs) continue;
      if (sees ? sees(threat, s) : !this.protects(s, threat)) continue;
      bs = score; best = s;
    }
    return best;
  }
  take(s, who) { if (s) { this.free(who); s.by = who; } return s; }
  free(who) { for (const s of this.spots) if (s.by === who) s.by = null; return this; }
  /** "Not that cover": the spot (or the one nearest a point) counts as `by` metres further to walk, and those within `near` half that. */
  avoid(s, { by = 6, near = 1.5 } = {}) {
    if (s && s.nx === undefined) { const p = s; s = this.spots.reduce((a, q) => (!a || hyp(q.x - p.x, q.z - p.z) < hyp(a.x - p.x, a.z - p.z) ? q : a), null); }
    if (!s) return this;
    for (const q of this.spots) { if (q === s) q.bad += by; else if (hyp(q.x - s.x, q.z - s.z) <= near) q.bad += by * .5; }
    return this;
  }
  forgive() { for (const s of this.spots) s.bad = 0; return this; }
  /**
   * Where to stand to shoot from a spot at a threat: up over low cover (over: true, eye: the height to aim from), or out
   * round the end of high cover nearer the threat (side: -1 left, 1 right, as you face out from the wall). Neither
   * (high cover with no end near): side 0, blind fire only.
   */
  peek(s, t) {
    if (s.low) return { x: s.x, y: s.y, z: s.z, over: true, side: 0, eye: s.y + Math.max(1.45, s.top + .25) };
    const tx = -s.nz, tz = s.nx, along = t ? (t.x - s.x) * tx + (t.z - s.z) * tz : 0;
    const order = along < 0 ? [-1, 1] : [1, -1];
    for (const side of order) {
      const e = s[side < 0 ? 'left' : 'right']; if (e == null) continue;
      const d = e + this.radius + .1;
      return { x: s.x + tx * d * side + s.nx * .1, y: s.y, z: s.z + tz * d * side + s.nz * .1, over: false, side, eye: s.y + 1.6 };
    }
    return { x: s.x, y: s.y, z: s.z, over: false, side: 0, eye: s.y + 1.6 };
  }
  /**
   * Cover within reach of someone now (the hero pressing "take cover"), felt for at once with rays: the nearest wall
   * round their feet, the way they face first. facing: yaw (radians, as rotation.y: 0 looks along +z). Null for none.
   */
  snap(feet, facing = null, { reach = 2.2 } = {}) {
    let best = null, bs = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, dx = Math.sin(a), dz = Math.cos(a);
      const hit = this.ray({ x: feet.x, y: (feet.y ?? 0) + .7, z: feet.z }, { x: dx, y: 0, z: dz }, reach); if (!hit || Math.abs(hit.normal.y) > .4) continue;
      const turn = facing == null ? 0 : 1 - Math.cos(a - facing);   // 0 straight ahead, 2 behind
      const score = hit.distance + turn * .6; if (score >= bs) continue;
      const s = this.spotAt(hit.point.x, hit.point.z, hit.normal.x, hit.normal.z, feet.y ?? 0); if (!s) continue;
      bs = score; best = s;
    }
    if (best) { const there = this.near(best.x, best.y, best.z, best.nx, best.nz, .45); if (there && !there.by) return there; }
    return best;
  }
  /**
   * The wall again `d` metres along from a spot (TakeCover's slide): a new spot there, following the wall round a bend,
   * or null where it stops (an end) or something is in the way.
   */
  slide(s, d) {
    const tx = -s.nz, tz = s.nx, h = s.y + Math.min(s.top, H[1]) - .1, r = this.radius;
    if (this.ray({ x: s.x, y: h, z: s.z }, { x: tx * Math.sign(d), y: 0, z: tz * Math.sign(d) }, Math.abs(d) + r * .7)) return null;
    const x = s.x + tx * d, z = s.z + tz * d, hit = this.ray({ x, y: s.y + .7, z }, { x: -s.nx, y: 0, z: -s.nz }, r + .6);
    if (!hit || Math.abs(hit.normal.y) > .4 || hit.normal.x * s.nx + hit.normal.z * s.nz < .5) return null;
    return this.spotAt(hit.point.x, hit.point.z, hit.normal.x, hit.normal.z, s.y);
  }
  /** The next free spot from a spot the way someone pushes ({ x, z }), within `reach` metres (7): cover to cover. */
  next(s, dir, { reach = 7, who = null } = {}) {
    const l = hyp(dir.x, dir.z) || 1, ux = dir.x / l, uz = dir.z / l; let best = null, bs = Infinity;
    for (const q of this.spots) {
      if (q === s || (q.by && q.by !== who) || Math.abs(q.y - s.y) > 1) continue;
      const dx = q.x - s.x, dz = q.z - s.z, d = hyp(dx, dz); if (d < 1.2 || d > reach) continue;
      const c = (dx * ux + dz * uz) / d; if (c < .6) continue;
      const score = d * (2 - c); if (score >= bs) continue;
      if (!this.open(s, q)) continue;
      bs = score; best = q;
    }
    return best;
  }
  /** Is there a way straight from one spot to another (nothing solid at knee and chest height between)? */
  open(a, b) {
    for (const h of [.4, 1]) { const o = { x: a.x, y: a.y + h, z: a.z }, d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, l = Math.hypot(d.x, d.y, d.z); const hit = this.ray(o, d, l); if (hit && hit.distance < l - this.radius - .1) return false; }
    return true;
  }
}

/**
 * The hero in cover. take(feet, facing) snaps to the nearest wall (or enter(spot)); then each frame update(dt, input,
 * feet) slides along it, stops at its ends, peeks out round them or up over it while aiming, fires blind, runs to the next
 * cover the way the stick pushes at an end (dash: true), and leaves when the stick pulls away from the wall. It says how:
 * walk (metres a second for your mover), facing (yaw), pose and upper (poses for gs.poses), muzzle (where shots come
 * from), spread (extra aim cone: blind fire), exposed (0..1 of the body that shows: for enemies' aim), state.
 * speed: along the wall (2.4 m/s); run: to cover (5.5); peek: seconds to lean out (.18).
 */
export class TakeCover {
  constructor(cover, { speed = 2.4, run = 5.5, peek = .18, dash = true, pull = .35 } = {}) {
    Object.assign(this, { cover, speed, run, peekTime: peek, dashes: dash, pullTime: pull });
    this.reset();
  }
  reset() {
    if (this.spot) this.cover.free(this);
    this.state = 'out'; this.spot = null; this.side = 1; this.out = 0; this.pulled = 0; this.held = 0; this.walk = { x: 0, z: 0 }; this.to = null;
    this.facing = 0; this.pose = null; this.upper = null; this.muzzle = null; this.spread = 0; this.exposed = 1; this.events = [];
    return this;
  }
  /** In cover (or running to it). */
  get busy() { return this.state !== 'out'; }
  /** Takes the nearest cover in reach (true), or there is none (false). */
  take(feet, facing = null, o) { const s = this.cover.snap(feet, facing, o); if (!s) return false; this.enter(s, feet); return true; }
  /** Runs to a spot and takes it. */
  enter(s, feet = null) {
    this.cover.take(s, this); this.spot = s; this.to = s; this.out = 0; this.pulled = 0; this.held = 0;
    this.state = feet && hyp(feet.x - s.x, feet.z - s.z) < .3 ? 'in' : 'moving';
    if (feet) { const along = (feet.x - s.x) * -s.nz + (feet.z - s.z) * s.nx; if (Math.abs(along) > .05) this.side = along > 0 ? -1 : 1; }
    this.events.push('enter'); return this;
  }
  leave() { if (this.spot) this.cover.free(this); this.spot = null; this.state = 'out'; this.walk = { x: 0, z: 0 }; this.pose = null; this.upper = null; this.exposed = 1; this.events.push('leave'); return this; }
  /**
   * input: move ({ x, z }: where the stick pushes, in the world, -1..1), aim (held: lean out / pop up), blind (firing
   * without looking), threat ({ x, y, z }: who to lean out towards; the side the hero last moved otherwise). feet: where
   * the hero's feet are now.
   */
  update(dt, { move = null, aim = false, blind = false, threat = null } = {}, feet = null) {
    this.events.length = 0;
    const s = this.spot; if (!s) { this.state = 'out'; return this; }
    const mx = move?.x || 0, mz = move?.z || 0, ml = hyp(mx, mz), tx = -s.nz, tz = s.nx;
    const at = feet || { x: s.x, y: s.y, z: s.z };
    if (this.state === 'moving' || this.state === 'dash') {
      const dx = this.to.x - at.x, dz = this.to.z - at.z, d = hyp(dx, dz), v = Math.min(this.run, d / Math.max(dt, 1e-3));
      this.walk = d > 1e-4 ? { x: dx / d * v, z: dz / d * v } : { x: 0, z: 0 };
      this.facing = Math.atan2(dx, dz); this.pose = 'run'; this.upper = null; this.exposed = 1; this.muzzle = null; this.spread = 0;
      if (d < .25) { this.state = 'in'; this.events.push('arrive'); }
      return this;
    }
    // pulling away from the wall for a moment leaves it
    const away = ml > .3 ? (mx * s.nx + mz * s.nz) / ml : 0;
    if (away > .75 && !aim) { this.pulled += dt; if (this.pulled > this.pullTime) return this.leave(); } else this.pulled = 0;
    // along the wall
    let along = ml > .25 && !aim && away < .75 ? (mx * tx + mz * tz) : 0;
    if (!along) this.held = 0;
    if (along) this.side = along > 0 ? 1 : -1;
    const end = s[this.side < 0 ? 'left' : 'right'], here = this.spot;
    if (along) {
      const step = Math.sign(along) * Math.min(Math.abs(along), 1) * this.speed * dt, next = this.cover.slide(here, step);
      if (next) { this.cover.free(this); this.cover.take(next, this); this.spot = next; }
      else if (this.dashes && end != null && end < .2 && Math.abs(along) > .8 && (this.held += dt) > this.pullTime) {
        // at the end, still pushing: on to the next cover that way
        const n = this.cover.next(here, { x: tx * this.side, z: tz * this.side }, { who: this });
        if (n) { this.enter(n); this.state = 'dash'; this.to = n; this.events.push('dash'); return this; }
      }
    }
    const S = this.spot, P = this.cover.peek(S, threat || { x: S.x + -S.nz * this.side * 5 - S.nx * 3, z: S.z + S.nx * this.side * 5 - S.nz * 3 });
    if (P.side) this.side = P.side;
    // leaning out: over, round an end, or (nothing to lean round) blind
    const want = aim && (S.low || P.side) ? 1 : 0;
    this.out += (want - this.out) * Math.min(1, dt / Math.max(.02, this.peekTime) * 2.5); if (Math.abs(want - this.out) < .02) this.out = want;
    const k = this.out, gx = S.x + (P.x - S.x) * k, gz = S.z + (P.z - S.z) * k;
    const dx = gx - at.x, dz = gz - at.z, v = 1 / Math.max(dt, 1e-3), lim = this.run * 1.5, d = hyp(dx, dz) * v, f = d > lim ? lim / d : 1;
    this.walk = { x: dx * v * f, z: dz * v * f };
    const LR = this.side < 0 ? 'L' : 'R', H0 = S.low ? 'Low' : 'High';
    const look = threat ? Math.atan2(threat.x - gx, threat.z - gz) : Math.atan2(-S.nx, -S.nz);
    this.exposed = .12 + k * .6; this.spread = 0;
    if (k > .5) {
      this.state = 'peek'; this.facing = look;
      this.pose = S.low ? 'idle' : 'peekHigh' + LR; this.upper = 'aim';
      this.muzzle = { x: gx, y: S.low ? P.eye - .15 : S.y + 1.45, z: gz };
    } else if (blind) {
      this.state = 'blind'; this.facing = Math.atan2(S.nx, S.nz); this.exposed = .2; this.spread = .14;
      this.pose = 'cover' + H0 + LR; this.upper = S.low || !P.side ? 'blindOver' : 'blindSide' + LR;
      // the gun held up over the top, or out round the end, without looking
      this.muzzle = S.low || !P.side ? { x: S.x - S.nx * .25, y: S.y + S.top + .2, z: S.z - S.nz * .25 } : { x: S.x + tx * this.side * ((S[this.side < 0 ? 'left' : 'right'] ?? 0) + .45), y: S.y + 1.3, z: S.z + tz * this.side * ((S[this.side < 0 ? 'left' : 'right'] ?? 0) + .45) };
    } else {
      this.state = 'in'; this.facing = Math.atan2(S.nx, S.nz);   // (back to the wall, looking out)
      this.pose = 'cover' + H0 + LR; this.upper = null; this.muzzle = null;
    }
    return this;
  }
}
