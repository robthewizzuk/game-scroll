// The simple 2D world: balls and boxes that fall, bounce, roll, stack and collide, in a handful of calls. Good for
// physics toys, stacking games, pinball-ish bouncers and puzzle drops. Boxes stay upright (they don't rotate),
// which keeps stacks steady.
//
//   const { World } = gs.physics;
//   reset() { w = new World({ gravity: 900, walls: [0, 0, W, H] });      // walls: [x, y, w, h], or leave out for none
//             ball = w.circle(100, 50, 12, { bounce: .6 });
//             floor = w.box(W / 2, H - 10, W, 20, { fixed: true }); }       // boxes are centre x, y, width, height
//   w.onHit((a, b, speed) => { if (speed > 120) sounds.hit(); });           // b is null for a wall
//   update(dt): w.step(dt);
//   draw(c):    for (const b of w.bodies) ...draw at b.x, b.y (b.r for balls, b.w / b.h for boxes, b.angle for a ball's roll)
//
// It used to be a small engine of its own. It is now gs.physics' Physics (Rapier) with these few names kept, so it
// is the same engine as everything else: what a World holds can be hinged, roped, grabbed, traced by rays, walked on
// by a gs.movers hero, driven into by a gs.vehicles Car and kept out of by gs.soft, like any Physics (every Physics
// method is here too). Like Physics, make it in make() or reset(): the engine loads the first time a game needs it.
//
// Units are the game's own, gravity in units per second squared. Body fields you can read or set: x, y, vx, vy,
// bounce (0..1), friction (0..1), sensor (reports hits but doesn't push), tag (anything, for your own use); and read:
// mass, fixed, sleeping, angle, kind, bounds. Options when making one: those, and fixed (never moves), gravity (a
// multiplier: 0 floats, -1 rises), drag (air drag per second), mass or density. b.push(vx, vy) is an instant kick
// (game units a second, whatever it weighs, as in Physics).

import { Physics } from './physics.js';

const WALL = 'wall';

export class World extends Physics {
  /**
   * gravity: downward pull (units/s²), or { x, y }. walls: [x, y, w, h] keeps everything inside that rectangle
   * (none: bodies that fall far out are removed). wallBounce, wallFriction: how the walls play (.4 each).
   */
  constructor({ gravity = 900, walls = null, wallBounce = .4, wallFriction = .4, link = true } = {}) {
    super({ gravity, link });
    this.wallBounce = wallBounce; this.wallFriction = wallFriction;
    this.edge = walls ? this.walls(walls[0], walls[1], walls[2], walls[3], { bounce: wallBounce, friction: wallFriction, tag: WALL }) : null;
  }
  /** The bodies in it (not its walls): a list to read. */
  get bodies() { const out = []; for (const t of this.things) if (t !== this.edge) out.push(t); return out; }
  // a body as the simple world makes it: its mass by its size in game units (area × density, .01 by default: the
  // numbers it always had) and the less bouncy of two things that meet decides the bounce
  opts(o, area) { return { bounce: .3, ...o, density: (o.mass ?? area * (o.density ?? .01)) * this.scale * this.scale / area }; }
  simple(t) { t.collider.setRestitutionCombineRule(this.R.CoefficientCombineRule.Min); return t; }
  circle(x, y, r, o = {}) { return this.simple(super.circle(x, y, r, this.opts(o, Math.PI * r * r))); }
  box(x, y, w, h, o = {}) { return this.simple(super.box(x, y, w, h, { noSpin: true, ...this.opts(o, w * h) })); }
  /** fn(a, b, speed) when two bodies meet with some speed (b is null for a wall), and when one enters a sensor. */
  onHit(fn) {
    return super.onHit((a, b, speed, x, y) => {
      if (a === this.edge) { a = b; b = null; } else if (b === this.edge) b = null;
      if (speed > 30 || a.sensor || b?.sensor) fn(a, b, speed, x, y);
    });
  }
  /** All bodies overlapping a circle (x, y, r). (With four numbers or more it is Physics' near(): the shapes in a box.) */
  near(px, py, r, ...rest) {
    if (rest.length) return super.near(px, py, r, ...rest);
    const out = [];
    for (const t of this.inBox(px - r, py - r, r * 2, r * 2)) {
      if (t === this.edge) continue;
      const [l, top, rt, bot] = t.bounds, qx = Math.max(l, Math.min(px, rt)), qy = Math.max(top, Math.min(py, bot));
      if ((qx - px) ** 2 + (qy - py) ** 2 <= r * r) out.push(t);
    }
    return out;
  }
}
