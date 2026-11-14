// Movement that feels right without a physics engine: a platformer jump with the tricks good
// platformers use (coyote time, jump buffering, variable jump height, wall slide and wall jump), and
// top-down walking with acceleration. They move a box through a gs.tiles TileMap (or any solid(x, y)
// test), or through a gs.physics world (hero.update(dt, phys, input): it is then solid there, shoves crates,
// stands on what it lands on; phys.tiles(map) makes a TileMap solid in it), and your game says what the
// input is and how it all looks.
//
//   const { Platformer, TopDown } = gs.movers;
//   reset() { hero = new Platformer({ x: 40, y: 40, w: 12, h: 14, jump: 52, run: 110 }); }
//   update(dt) {
//     hero.update(dt, map, { x: stick.x, jump: jumpBtn.isDown });   // x: -1..1; jump: held now
//     if (hero.jumped) sounds.jump();  if (hero.landed) feel.land(hero.x, hero.bottom, hero.impact);
//   }
//   draw(c) { drawHero(c, hero.x, hero.y, hero.facing, hero.state); }   // state: 'idle' 'run' 'jump' 'fall' 'wall'
//
// Units are your game's: jump is the jump height, run the top speed per second. Change any option
// later (hero.run = 160 after a power-up). hero.vx / hero.vy can be set for knockback and springs.

class Mover {
  constructor(o) { Object.assign(this, { x: 0, y: 0, w: 12, h: 14, vx: 0, vy: 0, onGround: false, facing: 1 }, o); this.hit = {}; }
  get left() { return this.x - this.w / 2; }
  get right() { return this.x + this.w / 2; }
  get top() { return this.y - this.h / 2; }
  get bottom() { return this.y + this.h / 2; }
  moveIn(map, dx, dy, o) {
    if (map?.move) return map.move(this, dx, dy, o);
    this.x += dx; this.y += dy; const hit = { left: false, right: false, up: false, down: false };
    if (map?.floor != null && this.bottom > map.floor) { this.y = map.floor - this.h / 2; hit.down = true; }
    this.onGround = hit.down; return hit;
  }
}

const approach = (v, to, step) => v < to ? Math.min(to, v + step) : Math.max(to, v - step);

export class Platformer extends Mover {
  /**
   * jump: height of a full jump; jumpTime: seconds to the top; run: top speed; accel / airAccel: how
   * fast it gets there (per second, on the ground / in the air); stop: how fast it stops on the
   * ground; coyote: seconds after leaving a ledge you can still jump; buffer: seconds a jump press
   * is remembered before landing; cut: how much letting go of jump early cuts the rise (0..1);
   * fall: top falling speed; wall: true for wall slide and wall jump; airJumps: extra jumps in the air.
   */
  constructor(o = {}) {
    super({ jump: 48, jumpTime: .36, run: 100, accel: 900, airAccel: 600, stop: 1200, coyote: .1, buffer: .12, cut: .5,
      fall: 380, wall: false, wallSlide: 60, wallKick: 1, airJumps: 0, ...o });
    this.sinceGround = 9; this.sinceJumpPress = 9; this.wasJump = false; this.jumpsLeft = this.airJumps;
    this.state = 'idle'; this.jumped = false; this.landed = false; this.impact = 0; this.onWall = 0; this.rising = false;
  }
  /** Gravity and jump speed worked out from jump height and time to the top. */
  get gravity() { return 2 * this.jump / (this.jumpTime * this.jumpTime); }
  get jumpSpeed() { return 2 * this.jump / this.jumpTime; }
  update(dt, map, input = {}) {
    const ix = Math.max(-1, Math.min(1, input.x || 0)), held = !!input.jump, pressed = held && !this.wasJump;
    this.wasJump = held; this.jumped = false; this.landed = false;
    if (pressed) this.sinceJumpPress = 0; else this.sinceJumpPress += dt;
    if (this.onGround) { this.sinceGround = 0; this.jumpsLeft = this.airJumps; } else this.sinceGround += dt;
    // run
    const target = ix * this.run, a = this.onGround ? (ix && Math.sign(ix) === Math.sign(this.vx || ix) ? this.accel : this.stop) : this.airAccel;
    this.vx = approach(this.vx, target, a * dt);
    if (ix) this.facing = Math.sign(ix);
    // jump: on the ground, just after leaving it (coyote), off a wall, or an air jump
    const want = this.sinceJumpPress <= this.buffer;
    if (want && this.sinceGround <= this.coyote) this.doJump();
    else if (want && this.wall && this.onWall) { this.doJump(); this.vx = -this.onWall * this.run * this.wallKick; this.facing = -this.onWall; }
    else if (pressed && this.jumpsLeft > 0 && !this.onGround) { this.jumpsLeft--; this.doJump(); }
    // gravity; letting go early cuts the jump short
    if (this.rising && !held && this.vy < 0) { this.vy *= this.cut; this.rising = false; }
    this.vy += this.gravity * dt;
    const slide = this.wall && this.onWall && this.vy > 0 && ix === this.onWall;
    this.vy = Math.min(this.vy, slide ? this.wallSlide : this.fall);
    if (this.vy >= 0) this.rising = false;
    // move
    const vyBefore = this.vy, was = this.onGround;
    const hit = this.hit = this.moveIn(map, this.vx * dt, this.vy * dt, { drop: !!input.down && this.onGround });
    if (hit.left || hit.right) this.vx = 0;
    if (hit.up && this.vy < 0) this.vy = 0;
    if (hit.down) { if (!was) { this.landed = true; this.impact = vyBefore; } if (this.vy > 0) this.vy = 0; }
    this.onWall = !hit.down && this.wall ? (this.touching(map, 1) ? 1 : this.touching(map, -1) ? -1 : 0) : 0;
    this.state = this.onWall && this.vy > 0 ? 'wall' : !this.onGround ? (this.vy < 0 ? 'jump' : 'fall') : Math.abs(this.vx) > 4 ? 'run' : 'idle';
    return this;
  }
  doJump() { this.vy = -this.jumpSpeed; this.sinceJumpPress = 9; this.sinceGround = 9; this.onGround = false; this.jumped = true; this.rising = true; }
  touching(map, side) {
    if (map?.walkers) {   // (a gs.physics world: a short look sideways from the box's edge at three heights)
      const x = side > 0 ? this.right : this.left;
      for (const y of [this.top + 2, this.y, this.bottom - 2]) if (map.ray(x, y, x + side * 1.5, y, t => t !== this.thing && !t.collider.isSensor() && (t.fixed || t.body.isKinematic()))) return true;
      return false;
    }
    if (!map?.at || !map.solid) return false;
    const x = side > 0 ? this.right + .5 : this.left - .5;
    for (const y of [this.top + 2, this.y, this.bottom - 2]) { const t = map.at(x, y); if (map.solid(t.tx, t.ty)) return true; }
    return false;
  }
}

export class TopDown extends Mover {
  /** speed: top speed; accel / stop: per second; diagonal moves aren't faster. */
  constructor(o = {}) { super({ speed: 90, accel: 800, stop: 1000, ...o }); this.state = 'idle'; this.dir = { x: 0, y: 1 }; }
  update(dt, map, input = {}) {
    let ix = input.x || 0, iy = input.y || 0; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const tx = ix * this.speed, ty = iy * this.speed;
    this.vx = approach(this.vx, tx, (ix ? this.accel : this.stop) * dt);
    this.vy = approach(this.vy, ty, (iy ? this.accel : this.stop) * dt);
    if (m > .1) { this.dir = { x: ix, y: iy }; if (Math.abs(ix) > .2) this.facing = Math.sign(ix); }
    const hit = this.hit = this.moveIn(map, this.vx * dt, 0);
    if (hit.left || hit.right) this.vx = 0;
    const hy = this.moveIn(map, 0, this.vy * dt);
    if (hy.up || hy.down) this.vy = 0;
    Object.assign(this.hit, { up: hy.up, down: hy.down });
    this.onGround = false;
    this.state = Math.hypot(this.vx, this.vy) > 4 ? 'walk' : 'idle';
    return this;
  }
}
