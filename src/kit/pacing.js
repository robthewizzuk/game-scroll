// Spawning and pacing: when things appear and how hard the game gets. The kit decides *when*; your
// game decides *what* (it gets a call and makes the enemy, coin or wall itself).
//
//   const { Spawner, Waves, Director, ramp } = gs.pacing;
//
// A steady stream that speeds up:
//   spawner = new Spawner({ every: 1.2, fastest: .35, over: 60, jitter: .25 });   // 1.2 s apart, down to .35 s after 60 s
//   update(dt) { spawner.update(dt, () => things.add(makeBat(), 'enemy')); }
//   spawner.pause(3);  spawner.burst(5, .1);   // a 3 second breather; 5 quick ones now
//
// Waves with breathers in between:
//   waves = new Waves([{ count: 6, every: .7, kind: 'bat' }, { count: 4, every: 1, kind: 'tank' }, { count: 1, kind: 'boss' }],
//                     { breather: 3, loop: true });          // after the last wave it repeats; waves.lap counts repeats
//   update(dt) { waves.update(dt, (kind, wave) => spawn(kind, wave), things.count('enemy')); }
//   // a wave ends once all of it has spawned and the alive count you pass is 0; then the breather starts
//   waves.number, waves.state ('spawning' | 'fighting' | 'breather' | 'done'), waves.left, waves.breatherLeft
//
// A director that reads how the player is doing (like the AI directors in big shooters):
//   director = new Director({ over: 90 });           // difficulty climbs from 0 to 1 over 90 s ...
//   director.hurt(1); director.scored(1);            // ... eases off after the player gets hurt,
//   update(dt) { director.update(dt); const d = director.level; }   // pushes on when they're cruising
//   director.calm: true for a moment after a heavy hit, so hold back spawns.
//   new Director({ over: 90, dial }): with a gs.brains.Dial it also remembers this player between rounds:
//   it climbs sooner for one who usually wins, later and not all the way for one who usually loses.
//
// ramp(t, from, to, seconds, ease?) is the plain version: a value that goes from → to over seconds.

const smooth = x => x * x * (3 - 2 * x);
export function ramp(t, from, to, seconds, ease = smooth) { const k = Math.max(0, Math.min(1, t / seconds)); return from + (to - from) * ease(k); }

export class Spawner {
  constructor({ every = 1, fastest = every, over = 60, jitter = 0, first = every, max = Infinity, rnd = Math.random } = {}) {
    Object.assign(this, { every, fastest, over, jitter, max, rnd }); this.t = 0; this.next = first; this.count = 0; this.held = 0; this.queue = [];
  }
  /** Seconds between spawns right now. */
  get gap() { return ramp(this.t, this.every, this.fastest, this.over); }
  pause(sec) { this.held = Math.max(this.held, sec); return this; }
  /** n spawns right away, gap seconds apart. */
  burst(n, gap = .1) { for (let i = 0; i < n; i++) this.queue.push(i * gap); return this; }
  update(dt, spawn) {
    this.t += dt;
    for (let i = 0; i < this.queue.length; i++) this.queue[i] -= dt;
    while (this.queue.length && this.queue[0] <= 0) { this.queue.shift(); this.count++; spawn(this.count); }
    if (this.held > 0) { this.held -= dt; return this; }
    if (this.count >= this.max) return this;
    this.next -= dt;
    if (this.next <= 0) { this.count++; spawn(this.count); const g = this.gap; this.next += g * (1 + (this.rnd() * 2 - 1) * this.jitter); if (this.next < 0) this.next = g; }
    return this;
  }
  reset() { this.t = 0; this.next = this.every; this.count = 0; this.held = 0; this.queue = []; return this; }
}

export class Waves {
  constructor(waves, { breather = 3, loop = false, first = 1 } = {}) {
    this.waves = waves; this.breather = breather; this.loop = loop; this.index = 0; this.lap = 0;
    this.state = 'breather'; this.breatherLeft = first; this.spawned = 0; this.nextIn = 0; this.time = 0;
  }
  get wave() { return this.waves[this.index]; }
  /** 1, 2, 3 ... counting repeats. */
  get number() { return this.lap * this.waves.length + this.index + 1; }
  get left() { return this.wave ? (this.wave.count ?? 1) - this.spawned : 0; }
  start() { this.state = 'spawning'; this.spawned = 0; this.nextIn = this.wave.delay ?? 0; this.time = 0; this.onStart?.(this.wave, this); }
  update(dt, spawn, alive = 0) {
    if (this.state === 'done') return this;
    this.time += dt;
    if (this.state === 'breather') { this.breatherLeft -= dt; if (this.breatherLeft <= 0) this.start(); return this; }
    const w = this.wave;
    if (this.state === 'spawning') {
      this.nextIn -= dt;
      while (this.nextIn <= 0 && this.spawned < (w.count ?? 1)) { this.spawned++; spawn(w.kind, w, this.spawned, this); this.nextIn += w.every ?? .5; }
      if (this.spawned >= (w.count ?? 1)) this.state = 'fighting';
    }
    if (this.state === 'fighting' && alive <= 0) {
      this.onClear?.(w, this);
      if (this.index + 1 < this.waves.length) this.index++;
      else if (this.loop) { this.index = 0; this.lap++; }
      else { this.state = 'done'; return this; }
      this.state = 'breather'; this.breatherLeft = w.breather ?? this.breather;
    }
    return this;
  }
}

export class Director {
  constructor({ over = 90, start = 0, max = 1, ease = 6, calmFor = 2.5, dial = null } = {}) {
    Object.assign(this, { over, start, max, ease, calmFor, dial });
    this.t = 0; this.stress = 0; this.calmLeft = 0; this.flow = 0;
  }
  /** The player got hurt (amount ~ 1 for a normal hit). */
  hurt(amount = 1) { this.stress = Math.min(1, this.stress + .25 * amount); if (amount >= 1) this.calmLeft = this.calmFor; return this; }
  /** The player did well (a kill, a pickup, a combo). */
  scored(amount = 1) { this.flow = Math.min(1, this.flow + .05 * amount); return this; }
  get calm() { return this.calmLeft > 0; }
  /** Difficulty 0..max right now. */
  get level() {
    // with a dial (gs.brains.Dial, or a number 0..1): a player who usually wins gets there sooner, one who
    // usually loses later and not all the way (.5 is the game as made)
    const k = this.dial == null ? .5 : Math.max(0, Math.min(1, +this.dial || 0)), top = this.start + (this.max - this.start) * Math.min(1, .6 + .8 * k);
    const base = ramp(this.t * (.5 + k), this.start, top, this.over);
    return Math.max(0, Math.min(this.max, base * (1 - .5 * this.stress) + .15 * this.flow));
  }
  update(dt) {
    this.t += dt; this.calmLeft = Math.max(0, this.calmLeft - dt);
    this.stress *= Math.exp(-dt / this.ease); this.flow *= Math.exp(-dt / (this.ease * 2));
    return this;
  }
  /** A value between easy and hard at the current level: director.pick(1.4, .4) for a spawn gap. */
  pick(easy, hard) { return easy + (hard - easy) * this.level; }
}
