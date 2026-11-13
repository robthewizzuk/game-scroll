// The body of gs.models.human alive under its clothes: it breathes, and its soft flesh settles. The front of the rib cage and of the
// belly have bones of their own (human-shapes.js: chest, belly), shared out over the skin and the cloth in front of them; this moves
// them. At rest a grown person breathes about fifteen times a minute, a little more in than out, the belly more than the chest in a man
// and the chest a little more in a woman; after running, faster and deeper, and back to rest over half a minute or so. A heavy belly
// also lags a moment behind the hips as they rise and fall in a stride or a landing, and settles. The rig steps it with the body
// (gs.poses Rig.update), so there is nothing to call. Kit use only: games reach it as a person's `breath`.

import { Vector4 } from 'three';

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
    this.v = 0; this.lag = 0; this.y0 = null; this.sighing = 0; this.sk = 1;
  }
  /** One deep, slow breath now, a sigh (person.idle sighs now and then by itself). */
  sigh() {   // (from where the breath is: the same height on the way in, so the chest doesn't jump, and in from there deeper)
    const p = this.p, b = p < .4 ? .5 - .5 * Math.cos(Math.PI * p / .4) : .5 + .5 * Math.cos(Math.PI * (p - .4) / .6);
    this.p = .4 * Math.acos(1 - 2 * b) / Math.PI; this.sighing = 1; return this;
  }
  step(dt, speed = 0, near = true) {
    if (!this.chest || !this.belly || dt <= 0) return this;
    // out of breath: up towards how hard the body works, down slowly once it rests
    const want = Math.min(1, Math.max(0, (Math.abs(speed) - 1.5) / 4.5));
    this.puff += (want - this.puff) * (1 - Math.exp(-dt * (want > this.puff ? .5 : .07)));
    if (!near) { this.chest.position.copy(this.c0); this.belly.position.copy(this.b0); return this; }
    // the breath: 15 a minute at rest to about 40, deeper the more out of breath; in over 40% of it, out over the rest
    this.rate += ((.25 + .42 * this.puff) - this.rate) * (1 - Math.exp(-dt * 2));
    { const q = this.p + dt * this.rate * (this.sighing ? .55 : 1); if (q >= 1) this.sighing = 0; this.p = q % 1; }   // (a sigh: one breath at half the pace, and deeper)
    const p = this.p, b = this.on ? (p < .4 ? .5 - .5 * Math.cos(Math.PI * p / .4) : .5 + .5 * Math.cos(Math.PI * (p - .4) / .6)) : 0, deep = (.55 + .9 * this.puff) * (this.sk += ((this.sighing ? 2.3 : 1) - this.sk) * (1 - Math.exp(-dt * 2.5)));
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
  still() { if (this.chest) { this.chest.position.copy(this.c0); this.belly.position.copy(this.b0); } this.v = this.lag = 0; this.y0 = null; this.sighing = 0; this.sk = 1; return this; }
}

// How wet, muddy, dusty and snowy a person is (person.grime), for the WebGPU look of their clothes and skin (hd3d-gpu.js grime): their own,
// on top of what the weather does to everyone under the open sky by itself. Mud comes from gs.outdoors Marks (marks.watch(person): each step in
// mud splashes the boots and trouser legs a little higher, a step in sand or dust dusts them); a game sets any of it as it likes (a fall in a
// river: grime.wet = 1). Wet dries over a few minutes and snow melts; mud and dust stay until clean(). Also the bends of the elbows and knees,
// for the creases in the clothes there (the place of each joint as the mesh was made, and how far it is bent: 0 straight .. 1 folded over).
const JOINTS = [['elbowL', 'foreL'], ['elbowR', 'foreR'], ['kneeL', 'shinL'], ['kneeR', 'shinR']];
export class Grime {
  /** B: the person's bones; at: where each of JOINTS was as the mesh was made (in the mesh's space), [x, y, z] four times. */
  constructor(B, at) {
    /** 0..1 each: how wet (dries by itself), how far up the legs the mud has splashed, how dusty, how much snow lies on the shoulders and the head. */
    this.wet = 0; this.mud = 0; this.dust = 0; this.snow = 0;
    this.v = new Vector4();   // (what the shader reads: wet, mud, dust, snow)
    this.of = JOINTS.map(j => B[j[1]] || null); this.bends = JOINTS.map((j, i) => new Vector4(...(at?.[i] || [0, -9, 0]), 0));
  }
  step(dt) {
    if (dt > 0) { this.wet = Math.max(0, this.wet - dt / 240); this.snow = Math.max(0, this.snow - dt / 120); }
    const c = v => (v > 1 ? 1 : v > 0 ? v : 0); this.v.set(c(this.wet), c(this.mud), c(this.dust), c(this.snow));
    for (let i = 0; i < 4; i++) { const q = this.of[i]?.quaternion; this.bends[i].w = q ? 1 - q.w * q.w : 0; }
    return this;
  }
  /** A step in something that marks (gs.outdoors Marks: the kind of ground, how deep the print). */
  soil(kind, depth = .02) {
    // (each step a little higher, less so the higher it already is: up the boots in a dozen steps, to the knee after fifty or so)
    if (kind === 'mud') this.mud = Math.min(1, this.mud + (.012 + .6 * depth) * (1 - .8 * this.mud));
    else if (kind === 'sand' || kind === 'dust') this.dust = Math.min(1, this.dust + .015 * (1 - .7 * this.dust));
    return this;
  }
  /** Clean and dry. */
  clean() { this.wet = this.mud = this.dust = this.snow = 0; return this.step(0); }
}
