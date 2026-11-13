// A walk of one's own. No two people walk alike, and nobody takes the same step twice. A drawn walk is everybody's
// walk; here each person's is their own, from their body and a seed, and it changes as they go:
//   - from the body: an older person takes shorter, quicker steps with less swing of the arms and the hips, leans and
//     looks down a little more and stands wider, toes out; a heavy one walks wider and rolls more from side to side,
//     arms held out from the body; a muscled one carries the arms out and a little bent; and from the seed, the rest
//     of a person's own way of walking (how much the arms swing, one more than the other, how far the hips turn, how
//     upright, a habit of the head), the same on every phone;
//   - a mood the game sets (rig.manner.mood = 'tired', or { tired: .5, wary: .5 }): brisk, tired, wary, proud, sad or a
//     limp (manner.side: the leg that hurts), eased in and out over a second;
//   - no two steps alike: how long a stride takes, how far the arms swing, how wide the feet go and how upright the
//     body is wander a little from stride to stride, as they do in a person (in a long walk the changes are not random
//     from step to step: one stride is like the strides before it, and the drift is larger over many strides than over
//     a few, "1/f" as it is measured), from the seed;
//   - each footfall is felt: the knees give and the hips drop a little, the rib cage dips and the head nods after it,
//     the elbows bounce; more at a run and in a heavy person;
//   - slopes: from how the body rises or falls as it goes (nothing to tell it): uphill a person leans into it and takes
//     shorter, quicker steps, swinging the arms more; downhill leans back, bends the knees and holds the arms out.
// The rig calls this (rig.manner, made by gs.models.human); the walk's own swing of the arms and the hips is scaled
// inside the walk (poses.js, gait()), the rest is added to the pose here. rig.manner.amount = 0 leaves the walk as drawn.

const TAU = Math.PI * 2, cl = (v, a, b) => v < a ? a : v > b ? b : v, ss = (a, b, x) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// what a mood changes. pace: strides a second (x); arm: the arms' swing (x); hips: the hips' turn and sway (x); bob: the rise and fall (x);
// (a game sets the speed: a mood that strides slower at it takes longer strides, so a tired or sad person's steps are as
// short or shorter, and the game slows them); lean: the rib cage forward (rad); head: the head down (rad, over what the walk has); sh: the shoulders up (rad, the collar bones; down is
// slumped); elbow: more bend at the elbows (rad); out: the arms out from the body (rad); crouch: the knees bent (metres the hips go down);
// scan: the head looks about; limp: (with side) less time on the leg that hurts and the body over it while it bears the weight
const MOODS = {
  brisk: { pace: 1.06, arm: 1.3, hips: 1.05, bob: 1.1, lean: .04, head: -.03, elbow: .14, sh: .02 },
  tired: { pace: 1.04, arm: .6, hips: .8, bob: .7, lean: .08, head: .14, sh: -.07, elbow: -.04, crouch: .01 },
  wary: { pace: 1.04, arm: .45, lean: .07, head: -.02, elbow: .4, out: .05, crouch: .03, scan: 1 },
  proud: { pace: .97, arm: 1.1, hips: 1.25, bob: 1.05, lean: -.06, head: -.07, sh: .05 },
  sad: { pace: 1.02, arm: .45, hips: .8, bob: .6, lean: .1, head: .26, sh: -.09, elbow: -.04 },
  limp: { pace: 1.05, arm: .85, limp: 1 },
};
const KEYS = ['pace', 'arm', 'hips', 'bob', 'lean', 'head', 'sh', 'elbow', 'out', 'crouch', 'scan', 'limp'], MUL = new Set(['pace', 'arm', 'hips', 'bob']);
// a seeded random number maker (0..1)
const rngOf = seed => { let h = 2166136261 >>> 0; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); let a = h >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// pink noise, a value a stride: the sum of a few random values each held for twice as many strides as the one before (Voss)
class Pink {
  constructor(r, n = 4) { this.r = r; this.v = Array.from({ length: n }, () => r() * 2 - 1); this.k = 0; }
  next() { this.k++; for (let i = 0; i < this.v.length; i++) if (this.k % (1 << i) === 0) this.v[i] = this.r() * 2 - 1; let s = this.r() * 2 - 1; for (const x of this.v) s += x; return s / Math.sqrt(this.v.length + 1) * 1.73; }   // (a spread (standard deviation) of 1)
}

export class Manner {
  /**
   * rig: the person's rig; body: what the game moves. o: { seed, age (years), fat (0..1, .5 an ordinary build), muscle (0..1, .45), fem }.
   * Without a seed only the body sets the walk (two people made alike walk alike).
   */
  constructor(rig, body, { seed = null, age = 30, fat = .5, muscle = .45, fem = false } = {}) {
    this.rig = rig; this.body = body;
    /** 0 the walk as drawn, 1 a person's own. */
    this.amount = 1;
    /** The leg that hurts, for a limp: 'L' or 'R'. */
    this.side = 'R';
    this.want = null; this.m = {}; for (const k of KEYS) this.m[k] = MUL.has(k) ? 1 : 0;
    // ---- the person's own, from the body (and the seed)
    const old = ss(42, 80, age), young = 1 - ss(16, 28, age), heavy = this.heavy = ss(.55, .95, fat), built = ss(.5, .9, muscle), r = seed == null ? null : rngOf('walk' + seed), g = (s, k = 1) => r ? (r() + r() + r() - 1.5) * 1.15 * s * k : 0;
    this.own = {
      pace: (1 + .06 * old - .03 * heavy + (fem ? .03 : 0)) * (1 + g(.035)), arm: (1 - .35 * old + .1 * young - .15 * heavy - .1 * built) * (1 + g(.18)),
      hips: (1 - .25 * old + .25 * heavy + (fem ? .15 : 0)) * (1 + g(.18)), twist: 1 + g(.2), bob: (1 - .3 * old + .1 * young - .1 * heavy) * (1 + g(.2)),
      lean: .07 * old + g(.025), head: .06 * old + g(.035), tilt: g(.025), elbow: .1 * old + .06 * built + g(.07), out: Math.max(-.01, .02 * old + .08 * heavy + .06 * built + g(.025)),
      toe: .04 + .08 * old + .06 * heavy + g(.05), wide: .02 * old + .04 * heavy - (fem ? .012 : 0) + g(.012), crouch: .012 * old, asym: g(.1), sh: .04 * built - .04 * old + g(.025),
    };
    // ---- no two steps alike
    const rv = rngOf('stride' + (seed ?? 0)); this.pink = ['pace', 'arm', 'wide', 'lean', 'look'].map(() => new Pink(rv)); this.vary = [0, 0, 0, 0, 0]; this.from = [0, 0, 0, 0, 0]; this.to = [0, 0, 0, 0, 0];
    this.ph = -1; this.t = 0; this.j = 0; this.jv = 0; this.y = null; this.grade = 0; this.scanT = 0;
    // what the walk reads (poses.js gait()): its arms' swing, each side's, the hips' turn and sway, the shoulders', the rise and fall,
    // the arms out and bent, the toes out and the feet apart
    this.g = { arm: 1, armL: 1, armR: 1, hips: 1, twist: 1, bob: 1, out: 0, elbow: 0, toe: 0, wide: 0 };
    /** Strides a second (x), for the rig. */
    this.pace = 1;
    /** How much of the limp there is now (0..1). */
    this.limp = 0;
  }
  /** The mood, eased in over a second: null, a name (brisk, tired, wary, proud, sad, limp) or { name: amount }. */
  get mood() { return this.want; }
  set mood(m) { this.want = m; }
  /** Stills it (a new round). */
  reset() { this.j = this.jv = 0; this.y = null; this.grade = 0; this.ph = -1; }
  // the phase as the pose has it: with a limp, less of the stride is spent on the leg that hurts
  warp(p) {
    const a = .3 * this.limp * this.amount; if (a < 1e-4) return p;
    const c = this.side === 'L' ? .31 : .81; return p + a / TAU * Math.sin(TAU * (p - c));
  }
  /** Before the poses are mixed: how this person walks now. dt: seconds; speed: metres a second. */
  begin(dt, speed) {
    const A = cl(this.amount, 0, 2), M = this.m, own = this.own, w = this.want;
    // the mood, eased in and out
    if (dt > 0) {
      const k = 1 - Math.exp(-dt * 2.5);
      for (const key of KEYS) {
        let v = MUL.has(key) ? 1 : 0;
        if (w) for (const [n, s] of typeof w === 'string' ? [[w, 1]] : Object.entries(w)) { const d = MOODS[n]?.[key]; if (d != null) v += (d - (MUL.has(key) ? 1 : 0)) * s; }
        M[key] += (v - M[key]) * k;
      }
    }
    this.limp = cl(M.limp, 0, 1);
    // slopes: how far the body rises for each metre it goes
    if (this.body && dt > 0) {
      const y = this.body.matrixWorld.elements[13]; if (this.y != null) { const vy = (y - this.y) / dt, gr = Math.abs(speed) > .3 ? cl(vy / Math.abs(speed), -.6, .6) : 0; this.grade += (gr - this.grade) * (1 - Math.exp(-dt * 4)); } this.y = y;
    }
    const gu = Math.max(0, this.grade), gd = Math.max(0, -this.grade), V = this.vary;
    const mix = (base, x) => 1 + (base * x - 1) * A;
    this.pace = mix(own.pace * M.pace * (1 + .015 * V[0]) * (1 + .14 * gu + .12 * gd), 1);
    const g = this.g, arm = own.arm * M.arm * (1 + .06 * V[1]) * (1 + .3 * gu);
    g.arm = mix(arm, 1); g.armL = 1 + own.asym * A - (this.side === 'L' ? .3 * this.limp * A : 0); g.armR = 1 - own.asym * A - (this.side === 'R' ? .3 * this.limp * A : 0);
    g.hips = mix(own.hips * M.hips, 1); g.twist = mix(own.twist, 1); g.bob = mix(own.bob * M.bob, 1);
    g.out = (own.out + M.out + .06 * gd) * A; g.elbow = (own.elbow + M.elbow + .1 * gd) * A; g.toe = own.toe * A; g.wide = (own.wide + .006 * V[2]) * A;
  }
  /** After the poses are mixed: the person's own bearing, the mood's, a footfall felt, the slope (out: joint => [x, y, z]). Returns how much further the hips go down (a share of the height). */
  pose(dt, out, speed, phase, gait) {
    const A = cl(this.amount, 0, 2); if (A <= 0) return 0;
    const M = this.m, own = this.own, rig = this.rig, up = 1 - (rig.topW || 0), V = this.vary;
    // ---- a new stride: the next of the wandering values (eased in over it); a footfall at each heel strike
    let land = 0;
    if (phase != null && gait > .05) {
      const p = this.warp(phase);
      if (this.ph >= 0) {
        const a = this.ph, b = p < a - .5 ? p + 1 : p;   // (it came round)
        if (a < 1 && b >= 1) { for (let i = 0; i < 5; i++) { this.from[i] = V[i]; this.to[i] = this.pink[i].next(); } this.t = 0; }
        if ((a < 1 && b >= 1) || (a < .5 && b >= .5)) land = 1;
      }
      this.ph = p;
    } else this.ph = -1;
    if (dt > 0) { this.t = Math.min(1, this.t + dt * 1.2); const e = this.t * this.t * (3 - 2 * this.t); for (let i = 0; i < 5; i++) V[i] = this.from[i] + (this.to[i] - this.from[i]) * e; }
    // ---- a footfall felt: a quick push down the body that springs back (harder at a run, in a heavy person)
    if (land) this.jv += cl(Math.abs(speed) / 1.4, .3, 3.5) ** .6 * gait * (1 + .5 * this.heavy) * 45;
    if (dt > 0) { const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n, w = 30, z = .45; for (let i = 0; i < n; i++) { this.jv += (-w * w * this.j - 2 * z * w * this.jv) * h; this.j += this.jv * h; } }
    const j = this.j * A, gu = Math.max(0, this.grade) * A, gd = Math.max(0, -this.grade) * A;
    // ---- the bearing: how upright, the head, the shoulders, the arms
    const lean = (own.lean + M.lean + .005 * V[3]) * A + .45 * gu - .3 * gd;
    let limpZ = 0;
    if (this.limp > .01 && this.ph >= 0) { const c = this.side === 'L' ? .31 : .81, d = this.ph - c - Math.round(this.ph - c); limpZ = (this.side === 'L' ? -1 : 1) * .09 * this.limp * A * Math.exp(-d * d / .02) * gait; }   // (over the leg that hurts while it bears the weight)
    if (dt > 0) this.scanT += dt;
    const look = (.025 * V[4] + M.scan * .3 * Math.sin(this.scanT * .9) * Math.sin(this.scanT * .37 + 1)) * A;
    const s = out.spine ||= [0, 0, 0], hd = out.head ||= [0, 0, 0];
    s[0] += (lean + .012 * j) * up; s[2] += limpZ * up;
    hd[0] += ((own.head + M.head) * A - .7 * lean - .009 * j) * up; hd[1] += look * up; hd[2] += (own.tilt * A - .6 * limpZ) * up;
    const sh = (own.sh + M.sh) * A; if (sh && rig.parts.collarL) { (out.collarL ||= [0, 0, 0])[2] += sh * up; (out.collarR ||= [0, 0, 0])[2] -= sh * up; }
    if (!gait) {   // (standing, the arms out and bent as walking has them; walking, the walk does it: gait() reads them)
      const e = (own.elbow + M.elbow) * A * .6, o = (own.out + M.out) * A * .6;
      if (out.foreL) out.foreL[0] -= e * up; if (out.foreR) out.foreR[0] -= e * up; if (out.armL) out.armL[2] += o * up; if (out.armR) out.armR[2] -= o * up;
    }
    if (out.foreL) out.foreL[0] -= .03 * j * up; if (out.foreR) out.foreR[0] -= .03 * j * up;
    // ---- the hips: lower with the knees bent (only where the feet are kept on the ground, so the legs bend to them), and a footfall's drop
    const kept = rig.stride && rig.steps && rig.near !== false && rig.stride.a > .5;
    return ((kept ? (own.crouch + M.crouch) * A + .03 * gd : 0) + .006 * j) / 1.8;
  }
}
