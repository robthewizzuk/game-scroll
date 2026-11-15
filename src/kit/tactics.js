// Cover and squad tactics for shooters: cover spots worked out from the level, "which cover keeps me
// safe from there", peeking out to shoot; and squads that share the work (some pin you down while
// others move up or go round the side, throw a grenade when you hide too long, fall back when hurt,
// and call it all out). Allies can follow a route with you. The kit gives orders; your game moves
// the characters (gs.ai Crowd, NavGrid paths, physics3d movers) and plays the shots and voices.
//
//   const { CoverMap, Squad, Route } = gs.tactics;
//   reset() {
//     cover = new CoverMap(map.cols, map.rows, (c, r) => map.solid(c, r), { size: 16, low: (c, r) => map.at(c, r) === '=' });
//     squad = new Squad(enemies, { cover, sees: (a, b) => nav.sees(a.x, a.y, b.x, b.y) });
//     squad.on('call', (who, what) => say(who, what));           // 'contact' 'flanking' 'covering' 'grenade' 'man down' 'falling back' 'reloading'
//   }
//   update(dt) {
//     squad.update(dt, player);
//     for (const e of enemies) {
//       const o = e.order;        // { do: 'move' | 'shoot' | 'throw' | 'hold', to: { x, y }, at: { x, y }, spot, role }
//       if (o.do === 'move') walk(e, o.to); else if (o.do === 'shoot') fireAt(e, o.at); else if (o.do === 'throw') lob(e, o.at);
//     }
//   }
//
// Positions are { x, y } (3D games: pass x and z as x and y). Members need x, y, and alive or hp.
// Tell the squad what happened: squad.hurt(member) when one is hit, squad.reloading(member).
//
// A squad can be coached (Tiny Brains corrections): new Squad(men, { coach: true }), then
// squad.correct(member, 'flank') says "there, he should have gone round" and squad.avoid(member) "not
// what he was told, there": a couple of times and the squad hands out roles that way in spots like
// them (how far, how hurt, whether he sees the target, how many are left) and nowhere else.
// coach: new gs.brains.Coach(api, { name: 'grey' }) keeps it on the phone. And cover.avoid(spot):
// "not that cover" (a man fell there): the others take it only when nothing else will do.

import { linksFor, linked } from './links.js';
import { Coach } from './brains.js';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ROLES = ['suppress', 'advance', 'flank', 'grenade', 'retreat'];   // what a coach can say to a squad member

/**
 * Cover spots from a grid level: every open cell next to a wall. blocked(col, row) says which cells
 * are walls; low(col, row) marks low walls you can shoot over. size and x0, y0 place the grid in the
 * world (a cell's centre is x0 + (col + .5) * size).
 */
export class CoverMap {
  constructor(cols, rows, blocked, { size = 1, x0 = 0, y0 = 0, low = null, link = true } = {}) {
    Object.assign(this, { cols, rows, blocked, size, x0, y0, lowAt: low }); linksFor(null, link)?.join('cover', this);   // (links.js: a Squad made after it uses it)
    this.spots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (blocked(c, r)) continue;
      const normals = []; let isLow = false;
      for (const [dc, dr] of N4) if (c + dc >= 0 && r + dr >= 0 && c + dc < cols && r + dr < rows && blocked(c + dc, r + dr)) { normals.push({ x: dc, y: dr }); if (low?.(c + dc, r + dr)) isLow = true; }
      if (normals.length) this.spots.push({ col: c, row: r, x: x0 + (c + .5) * size, y: y0 + (r + .5) * size, normals, low: isLow, by: null });
    }
  }
  /** Does this spot keep you safe from a threat at (x, y)? (a wall is between, roughly) */
  protects(spot, threat) {
    const dx = threat.x - spot.x, dy = threat.y - spot.y, d = Math.hypot(dx, dy) || 1;
    return spot.normals.some(n => (n.x * dx + n.y * dy) / d > .55);
  }
  /**
   * The best free cover from `from` against `threat`. Options: near (how far you'll walk, default
   * 8 cells), band [min, max] distance to keep from the threat, flank (radians: prefer spots this far
   * round from the line between threat and from), who (taken spots by others are skipped), sees(a, b)
   * (a real line-of-sight test makes it exact).
   */
  find(from, threat, { near = 8 * this.size, band = [3 * this.size, 20 * this.size], flank = 0, who = null, sees = null } = {}) {
    let best = null, bs = -Infinity;
    const base = Math.atan2(from.y - threat.y, from.x - threat.x);
    for (const s of this.spots) {
      if (s.by && s.by !== who) continue;
      const dw = dist(s, from); if (dw > near) continue;
      const dt = dist(s, threat); if (dt < band[0] || dt > band[1]) continue;
      if (!this.protects(s, threat)) continue;
      if (sees && sees(threat, s)) continue;
      let score = -dw / this.size - Math.abs(dt - (band[0] + band[1]) / 2) / this.size * .2 + (s.low ? .5 : 0) - (s.bad || 0);
      if (flank) { const a = Math.atan2(s.y - threat.y, s.x - threat.x), off = Math.abs(Math.atan2(Math.sin(a - base), Math.cos(a - base))); score += 6 - Math.abs(off - flank) * 6; }
      if (score > bs) { bs = score; best = s; }
    }
    return best;
  }
  take(spot, who) { if (spot) { this.free(who); spot.by = who; } return spot; }
  /** "Not that cover": a spot (or the one nearest { x, y }) counts as `by` cells further to walk from now on, and its neighbours within `near` a little; forgive() takes it all back. */
  avoid(spot, { by = 6, near = 1.5 * this.size } = {}) {
    if (spot && spot.normals === undefined) spot = this.spots.reduce((a, s) => (!a || dist(s, spot) < dist(a, spot) ? s : a), null);
    if (!spot) return this;
    for (const s of this.spots) { const d = dist(s, spot); if (s === spot) s.bad = (s.bad || 0) + by; else if (d <= near) s.bad = (s.bad || 0) + by * .5; }
    return this;
  }
  forgive() { for (const s of this.spots) s.bad = 0; return this; }
  free(who) { for (const s of this.spots) if (s.by === who) s.by = null; return this; }
  /** Where to stand to shoot from a spot at a threat: over low cover, or a step to the open side. */
  peek(spot, threat) {
    if (spot.low) return { x: spot.x, y: spot.y, over: true };
    const n = spot.normals.reduce((a, b) => ((b.x * (threat.x - spot.x) + b.y * (threat.y - spot.y)) > (a.x * (threat.x - spot.x) + a.y * (threat.y - spot.y)) ? b : a));
    for (const side of [{ x: -n.y, y: n.x }, { x: n.y, y: -n.x }]) {
      const c = spot.col + side.x, r = spot.row + side.y;
      if (c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked(c, r)) return { x: spot.x + side.x * this.size * .6, y: spot.y + side.y * this.size * .6, over: false };
    }
    return { x: spot.x, y: spot.y, over: false };
  }
  /** The spot at a cell, if any. */
  at(col, row) { return this.spots.find(s => s.col === col && s.row === row) || null; }
}

/**
 * A squad that shares the work. Each think (every `think` seconds) it hands out roles: one or two
 * suppress (shoot from cover to pin the target), one advances to closer cover, one flanks round the
 * side, someone throws a grenade if the target stays put too long, and hurt members fall back.
 * Options: cover (a CoverMap), sees(a, b), range (shooting range), grenades (how many the squad has),
 * camp (seconds still before a grenade), think, aggression 0..1 (more advancing, less waiting),
 * coach (true, or a gs.brains.Coach: then correct(member, role) and avoid(member) teach it; roles
 * 'suppress' | 'advance' | 'flank' | 'grenade' | 'retreat').
 */
export class Squad {
  constructor(members, { cover = null, sees = null, range = 12, grenades = 2, camp = 4, think = .6, aggression = .5, rng = Math.random, link = true, coach = null } = {}) {
    cover = linked(cover, linksFor(null, link), 'cover');   // (links.js: with none given, the CoverMap the game made; false: none)
    Object.assign(this, { members, cover, sees, range, grenades, camp, thinkEvery: think, aggression, rng });
    this.coach = coach === true ? new Coach({ name: 'squad', save: false }) : coach || null;
    if (this.coach) this.coach.shape(7, ROLES);
    this.t = 0; this.handlers = {}; this.still = 0; this.lastTarget = null; this.alerted = false; this.lastFlank = -99; this.lastGrenade = -99;
    for (const m of members) m.order = { do: 'hold', role: 'idle' };
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  call(who, what) { const now = this.t; if (who._said?.[what] > now - 4) return; (who._said ||= {})[what] = now; for (const f of this.handlers.call || []) f(who, what); }
  alive(m) { return m.alive ?? (m.hp == null || m.hp > 0); }
  get left() { return this.members.filter(m => this.alive(m)); }
  /** Tell the squad a member was hit (hurt ones may fall back; a death gets "man down"). */
  hurt(m) { m._hurtAt = this.t; if (!this.alive(m)) { this.cover?.free(m); const s = this.left[0]; if (s) this.call(s, 'man down'); } return this; }
  reloading(m) { m._reloadUntil = this.t + 1.5; this.call(m, 'reloading'); return this; }
  update(dt, target) {
    this.t += dt;
    if (this.lastTarget && dist(this.lastTarget, target) < (this.cover?.size || 1) * 1.5) this.still += dt; else { this.still = 0; this.lastTarget = { x: target.x, y: target.y }; }
    const left = this.left; if (!left.length) return this;
    const seen = left.some(m => !this.sees || this.sees(m, target));
    if (seen && !this.alerted) { this.alerted = true; this.call(left[0], 'contact'); }
    if (!this.alerted) return this;
    this.nextThink = (this.nextThink ?? 0) - dt; if (this.nextThink > 0) return this;
    this.nextThink = this.thinkEvery * (.8 + this.rng() * .4);
    // roles: nearest suppress, one moves up, one flanks, grenade on campers, hurt fall back
    const byDist = left.slice().sort((a, b) => dist(a, target) - dist(b, target));
    let movers = Math.max(0, Math.round(left.length * (.25 + this.aggression * .35))), flanked = false;
    const C = this.coach, size = this.cover?.size || 1;
    byDist.forEach((m, rank) => {
      const hp = m.hp != null && m.maxHp ? m.hp / m.maxHp : 1, canSee = !this.sees || this.sees(m, target), d = dist(m, target);
      // the squad's own rules, in this order
      const lob = this.grenades > 0 && this.still > this.camp && this.t - this.lastGrenade > 3 && d < this.range;
      const round = !flanked && left.length > 2 && this.t - this.lastFlank > 6 && m !== byDist[0];
      const up = movers > 0 && (m._reloadUntil ?? 0) < this.t, fire = canSee && d <= this.range;
      let role = hp < .35 && m.order.role !== 'retreat' ? 'retreat' : lob ? 'grenade' : round ? 'flank' : up ? 'advance' : fire ? 'suppress' : 'advance';
      const usual = role;
      if (C) {
        // what a coach's examples are about: how far, how hurt, whether he sees the target, where he is in the line, how long it has stayed put
        const see = m._see || (m._see = new Float32Array(7));
        see[0] = Math.min(2, d / this.range); see[1] = hp; see[2] = canSee ? 1 : 0; see[3] = byDist.length > 1 ? rank / (byDist.length - 1) : 0;
        see[4] = Math.min(2, this.still / Math.max(.1, this.camp)); see[5] = left.length / Math.max(1, this.members.length); see[6] = this.aggression;
        const can = [usual]; for (const r of ROLES) if (r !== usual && (r === 'suppress' ? fire : r === 'grenade' ? this.grenades > 0 && d < this.range * 1.2 : r === 'flank' ? !flanked && left.length > 1 : true)) can.push(r);
        role = C.pick(see, can); m._role = role; m._recalled = C.recalled;
      }
      if (role === 'retreat') { if (m.order.role !== 'retreat') { this.order(m, 'retreat', target, { near: 10 * size, band: [this.range * .8, this.range * 2] }); this.call(m, 'falling back'); } }
      else if (role === 'grenade') { this.grenades--; this.lastGrenade = this.t; this.still = 0; m.order = { do: 'throw', role: 'grenade', at: { x: target.x, y: target.y } }; this.call(m, 'grenade'); }
      else if (role === 'flank') { flanked = true; this.lastFlank = this.t; this.order(m, 'flank', target, { flank: 1.3, near: 14 * size }); this.call(m, 'flanking'); }
      else if (role === 'advance') {
        if (up) movers--;
        this.order(m, 'advance', target, up || role !== usual ? { band: [2 * size, Math.max(3, d - 2 * size)] } : {});
      } else { const spot = m.order.spot; m.order = { do: 'shoot', role: 'suppress', at: { x: target.x, y: target.y }, spot, from: spot && this.cover ? this.cover.peek(spot, target) : null }; if (this.rng() < .15) this.call(m, 'covering'); }
    });
    return this;
  }
  /** "There, he should have been told this": the role for the spot the member was last given one in (with a coach). */
  correct(m, role) { if (this.coach && m && m._see) this.coach.correct(m._see, role); return this; }
  /** "Not that, there": the role he was last given (or the one named) in the spot he was given it in (with a coach). */
  avoid(m, role = m && m._role) { if (this.coach && m && m._see && role) this.coach.avoid(m._see, role); return this; }
  /** The correction that shaped the member's last role, { action, not, like }, or null. */
  recalled(m) { return (m && m._recalled) || null; }
  /** Gives m a move order to cover for a role (or straight at the target if there's no cover). */
  order(m, role, target, o) {
    let spot = null;
    if (this.cover) { spot = this.cover.find(m, target, { who: m, sees: this.sees, ...o }); this.cover.take(spot, m); }
    const to = spot ? { x: spot.x, y: spot.y } : role === 'retreat' ? { x: m.x + (m.x - target.x), y: m.y + (m.y - target.y) } : { x: target.x, y: target.y };
    m.order = { do: 'move', role, to, spot, at: { x: target.x, y: target.y } };
  }
}

/**
 * A route for allies (or an escort) to follow with the player: they move to the next point when the
 * player catches up (within `leash`) and wait there otherwise. points [{ x, y, wait?, say? }].
 */
export class Route {
  constructor(points, { leash = 6, reach = .6 } = {}) { this.points = points; this.leash = leash; this.reach = reach; this.i = 0; this.waited = 0; this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  get point() { return this.points[Math.min(this.i, this.points.length - 1)]; }
  get done() { return this.i >= this.points.length - 1 && this.arrived; }
  /** Where the ally should head now. ally: { x, y }; player: { x, y }. */
  update(dt, ally, player) {
    const p = this.point; this.arrived = dist(ally, p) < this.reach;
    if (this.arrived && this.i < this.points.length - 1) {
      this.waited += dt;
      if (this.waited >= (p.wait || 0) && dist(player, p) < this.leash) { this.i++; this.waited = 0; for (const f of this.handlers.next || []) f(this.point, this.i); if (this.point.say) for (const f of this.handlers.say || []) f(this.point.say); }
    }
    return this.point;
  }
}
