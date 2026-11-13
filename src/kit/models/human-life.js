// The body of gs.models.human alive under its clothes: it breathes, and its soft flesh settles. The front of the rib cage and of the
// belly have bones of their own (human-shapes.js: chest, belly), shared out over the skin and the cloth in front of them; this moves
// them. At rest a grown person breathes about fifteen times a minute, a little more in than out, the belly more than the chest in a man
// and the chest a little more in a woman; after running, faster and deeper, and back to rest over half a minute or so. A heavy belly
// also lags a moment behind the hips as they rise and fall in a stride or a landing, and settles. The rig steps it with the body
// (gs.poses Rig.update), so there is nothing to call. Kit use only: games reach it as a person's `breath`.

export class Breath {
  /**
   * B: the person's bones; o: { fem, fat (0 thin .. 1 heavy), muscle (0..1) }.
   */
  constructor(B, { fem = false, fat = .5, muscle = .45 } = {}) {
    this.chest = B.chest || null; this.belly = B.belly || null; this.hips = B.hips || null;
    this.c0 = this.chest?.position.clone(); this.b0 = this.belly?.position.clone();
    /** false: still (a held breath, a body on the ground); true: breathing by itself. */
    this.on = true;
    /** How out of breath (0 at rest .. 1 after a sprint): it rises while running and falls back by itself. Set it for a scene that wants it. */
    this.puff = 0;
    this.p = Math.random(); this.rate = .25;
    // (how much of each breath shows in front: the belly more in a man, the chest a little more in a woman; a heavy belly moves more and lags more)
    this.cw = fem ? 1.15 : .8; this.bw = (fem ? .85 : 1.15) * (1 + .5 * Math.max(0, fat - .5)); this.soft = .2 + .8 * Math.max(0, fat - .35) / .65;
    this.v = 0; this.lag = 0; this.y0 = null;
  }
  step(dt, speed = 0, near = true) {
    if (!this.chest || !this.belly || dt <= 0) return this;
    // out of breath: up towards how hard the body works, down slowly once it rests
    const want = Math.min(1, Math.max(0, (Math.abs(speed) - 1.5) / 4.5));
    this.puff += (want - this.puff) * (1 - Math.exp(-dt * (want > this.puff ? .5 : .07)));
    if (!near) { this.chest.position.copy(this.c0); this.belly.position.copy(this.b0); return this; }
    // the breath: 15 a minute at rest to about 40, deeper the more out of breath; in over 40% of it, out over the rest
    this.rate += ((.25 + .42 * this.puff) - this.rate) * (1 - Math.exp(-dt * 2)); this.p = (this.p + dt * this.rate) % 1;
    const p = this.p, b = this.on ? (p < .4 ? .5 - .5 * Math.cos(Math.PI * p / .4) : .5 + .5 * Math.cos(Math.PI * (p - .4) / .6)) : 0, deep = .55 + .9 * this.puff;
    // a heavy belly lags behind the hips as they rise and fall (a spring, well damped: it settles within half a second)
    // (the hips' height as last drawn: how fast they rose or fell, and the change in that, pushes the belly the other way)
    const hy = this.hips.matrixWorld.elements[13];
    if (this.y0 === null) { this.y0 = hy; this.vy = 0; }
    const vy = (hy - this.y0) / Math.max(dt, 1e-3); this.y0 = hy;
    this.v += (-this.lag * 260 - this.v * 22) * dt - Math.max(-2, Math.min(2, vy - this.vy)) * this.soft * .35; this.vy = vy; this.lag += this.v * dt;
    this.lag = Math.max(-.006, Math.min(.006, this.lag));
    const c = this.c0, e = this.b0, k = b * deep;
    this.chest.position.set(c.x, c.y + .0018 * k * this.cw, c.z + .0045 * k * this.cw);
    this.belly.position.set(e.x, e.y + this.lag, e.z + .0056 * k * this.bw);
    return this;
  }
  /** Back to rest (as made). */
  still() { if (this.chest) { this.chest.position.copy(this.c0); this.belly.position.copy(this.b0); } this.v = this.lag = 0; this.y0 = null; return this; }
}
