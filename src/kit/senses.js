// Enemy senses for stealth and shooter games: sight cones that walls block, hearing, a memory of
// where the player was last seen, and moods (calm, suspicious, alert, searching). The kit says what
// a guard knows; your game decides what the guard does about it and how it looks (cone drawing,
// "?" and "!" icons, music) using the values below.
//
//   const { Senses, Noises } = gs.senses;
//   reset() { noises = new Noises(); for (const g of guards) g.senses = new Senses({ range: 120, fov: 80 }); }
//   update(dt) {
//     if (playerRan) noises.make(player.x, player.y, 60);         // footsteps, shots (louder = further)
//     for (const g of guards) {
//       const s = g.senses.update(dt, g, player, { sees: (x1, y1, x2, y2) => nav.sees(x1, y1, x2, y2), noises, light: inShadow ? .4 : 1 });
//       if (s.mood === 'alert') chase(g, s.lastSeen);              // s.seen: can see the player right now
//       else if (s.mood === 'suspicious' || s.mood === 'searching') walkTo(g, s.lookAt);
//       else patrol(g);
//     }
//     noises.update(dt);
//   }
//   draw: s.awareness (0..1, how close to spotting you) fills a "?" meter; s.mood picks the icon.
//
// The guard needs x, y and facing (radians). In 3D games pass x and z as x and y. The player needs
// x and y (and can set hidden: true in a locker or bush). Senses.alertAll(guards, x, y, radius)
// tells nearby guards when one raises the alarm.
import { timed } from './prof.js';

export class Senses {
  constructor({ range = 120, fov = 90, near = 20, hearing = 1, spotTime = .9, memory = 4, searchTime = 6, calmDown = 3 } = {}) {
    Object.assign(this, { range, fov: fov * Math.PI / 180, near, hearing, spotTime, memory, searchTime, calmDown });
    this.mood = 'calm'; this.awareness = 0; this.seen = false; this.lastSeen = null; this.lookAt = null; this.since = 99; this.moodTime = 0; this.heard = null;
  }
  /** Is point (x, y) inside the sight cone (ignoring walls)? */
  inCone(me, x, y) {
    const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
    if (d > this.range) return false;
    if (d < this.near) return true;
    let a = Math.atan2(dy, dx) - (me.facing || 0); a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(a) <= this.fov / 2;
  }
  canSee(me, target, sees, light = 1) {
    if (!target || target.hidden || light <= 0) return false;
    if (!this.inCone(me, target.x, target.y)) return false;
    return !sees || sees(me.x, me.y, target.x, target.y);
  }
  set(mood) { if (mood !== this.mood) { this.prev = this.mood; this.mood = mood; this.moodTime = 0; this.onMood?.(mood, this.prev); } }
  /** Raises the alarm: this guard knows where the player is. */
  alert(x, y) { this.lastSeen = { x, y }; this.lookAt = { x, y }; this.since = 0; this.awareness = 1; this.set('alert'); return this; }
  /** Something worth checking at (x, y). */
  suspect(x, y, amount = .5) { this.lookAt = { x, y }; this.awareness = Math.max(this.awareness, Math.min(.99, amount)); if (this.mood === 'calm') this.set('suspicious'); return this; }
  update(dt, me, target, { sees, noises, light = 1 } = {}) {
    this.moodTime += dt; this.since += dt;
    this.seen = this.canSee(me, target, sees, light);
    if (this.seen) {
      const d = Math.hypot(target.x - me.x, target.y - me.y), close = 1 - d / this.range;
      // spotted faster up close, in the light and when already on edge
      const rate = (.4 + 1.6 * close) * light * (this.mood === 'calm' ? 1 : 2) / this.spotTime;
      this.awareness = Math.min(1, this.awareness + rate * dt);
      this.lookAt = { x: target.x, y: target.y };
      if (this.awareness >= 1 || this.mood === 'alert' || this.mood === 'searching' && this.awareness > .5) this.alert(target.x, target.y);
      else if (this.mood === 'calm' && this.awareness > .25) this.set('suspicious');
    } else {
      if (this.mood !== 'alert') this.awareness = Math.max(0, this.awareness - dt / (this.calmDown * 2));
    }
    if (noises) for (const n of noises.list) {
      const d = Math.hypot(n.x - me.x, n.y - me.y);
      if (d < n.loud * this.hearing && n.age === 0) { this.heard = { x: n.x, y: n.y }; this.suspect(n.x, n.y, .3 + .6 * (1 - d / (n.loud * this.hearing))); if (this.mood === 'alert') this.lookAt = { x: n.x, y: n.y }; }
    }
    if (this.mood === 'alert' && !this.seen && this.since > this.memory) this.set('searching');
    else if (this.mood === 'searching' && this.moodTime > this.searchTime) { this.set('calm'); this.awareness = 0; }
    else if (this.mood === 'suspicious' && !this.seen && this.awareness <= 0) this.set('calm');
    return this;
  }
  static alertAll(guards, x, y, radius, from) {
    for (const g of guards) { const s = g.senses; if (!s || s === from || g === from) continue; if (Math.hypot(g.x - x, g.y - y) <= radius) s.alert(x, y); }
  }
}

/**
 * Sounds the player makes, for guards to hear. Guards hear a noise in the frame it's made; it stays
 * in noises.list for half a second (n.age) so you can draw ripples.
 */
export class Noises {
  constructor() { this.list = []; }
  make(x, y, loud = 60) { this.list.push({ x, y, loud, age: 0 }); return this; }
  update(dt) { for (const n of this.list) n.age += dt; this.list = this.list.filter(n => n.age < .5); return this; }
  clear() { this.list = []; return this; }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Senses.prototype, 'update', 'senses');
timed(Noises.prototype, 'update', 'senses');
