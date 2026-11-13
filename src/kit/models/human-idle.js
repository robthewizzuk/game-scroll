// A person standing about is never still (gs.models.human: person.idle). Over the rig's own standing pose, close up: now and then a
// fidget (the shoulders rolled to loosen them, the neck stretched one way and the other, a look down, a sigh, a swallow, a hand shaken
// out, a look about); where the eyes go the head follows a moment later and, for a thing far round to the side, the body a moment after
// that (the eyes lead, as they do); a glance at a noise or at something that moves nearby (notice, listen to gs.senses Noises, watch);
// and gestures by name: nod, shake (the head), shrug, wave, point, hips (hands on the hips) and cross (arms crossed). The rig steps it
// with the body (gs.poses Rig.update), so there is nothing to call. Kit use: games reach it as person.idle.
import { Vector3, Matrix4 } from 'three';

const PI = Math.PI, S = Math.sin, cl = (v, a, b) => (v < a ? a : v > b ? b : v), rnd = (a, b) => a + Math.random() * (b - a);
const ease = t => t * t * (3 - 2 * t);
// in over the first share a of t (0..1), out over the last share b
const env = (t, a, b) => (t < a ? ease(t / a) : t > 1 - b ? ease(Math.max(0, 1 - t) / b) : 1);
const _m = new Matrix4(), _p = new Vector3(), _h = new Vector3();
const at = (t, out) => (t.isObject3D ? t.getWorldPosition(out) : Array.isArray(t) ? out.set(t[0], t[1], t[2]) : out.set(t.x, t.y, t.z));

// The fidgets: seconds each takes, how often it comes (a share), and the joints it turns (added over the pose) at t (0..1) of it, on side s (1 or -1).
// Signs as the person's rig has them: head x down, y to the person's left; spine x forward; collar z up (left; the right one the other way);
// arm z out from the side (left; the right one the other way), x back; forearm x bent (negative).
const FIDGETS = {
  // the shoulders lifted and dropped, a little back, to loosen them
  shoulders: { time: 1.7, often: 1, j: (t, s, o) => { const a = S(t * PI) ** 2; o.collarL = [0, -.03 * a, .07 * a]; o.collarR = [0, .03 * a, -.07 * a]; o.spine = [-.025 * a, 0, 0]; } },
  // the neck stretched to one side and then the other
  neck: { time: 2.6, often: .8, j: (t, s, o) => { const a = S(t * 2 * PI) * env(t, .15, .2); o.head = [.03 * Math.abs(a), 0, .13 * s * a]; } },
  // a look down at the ground in front, and up again
  down: { time: 2.4, often: .7, j: (t, s, o) => { const a = env(t, .25, .35); o.head = [.28 * a, .1 * s * a, 0]; o.spine = [.03 * a, 0, 0]; } },
  // one deep breath, the shoulders rising with it and falling as it goes out, the head tipped back a little and then down (Breath.sigh)
  sigh: { time: 3.6, often: .45, start: b => b.breath?.sigh(), j: (t, s, o) => { const up = t < .45 ? ease(t / .45) : ease(Math.max(0, 1 - (t - .45) / .45)); o.collarL = [0, 0, .06 * up]; o.collarR = [0, 0, -.06 * up]; o.head = [-.06 * up + .05 * S(PI * cl((t - .4) / .6, 0, 1)), 0, 0]; o.spine = [-.02 * up, 0, 0]; } },
  // a swallow: the chin dips a little and comes back
  swallow: { time: .8, often: .6, j: (t, s, o) => { const a = S(cl(t / .6, 0, 1) * PI); o.head = [.045 * a, 0, 0]; } },
  // a hand shaken out at the wrist
  hand: { time: 1.2, often: .5, j: (t, s, o) => { const a = env(t, .2, .3), w = S(t * 9 * PI) * .35 * a, k = s > 0 ? 'L' : 'R'; o['fore' + k] = [-.35 * a, 0, 0]; o['hand' + k] = [w, 0, w * .4]; } },
  // a look about: somewhere off to one side, at eye height a few metres away (the eyes go first, then the head)
  look: { time: 2.8, often: .9, look: true },
};
const NAMES = Object.keys(FIDGETS);
// (poses where nobody fidgets or glances about: hanging, climbing, in the air, a blow, down on the ground; and the rig's own wave)
const BUSY = /^(downed|hang|shimmy|climb|swing|fall|jump|land|punch|takedown|wave)$/;

// The gestures: seconds (a held one stays at its fullest until gesture(null) or another), and the joints at their fullest, blended over the
// pose (a shrug is a shrug whatever the arms were doing; the head's turn is added, so a look still shows), or added (add: nod, shake); t (0..1) of it.
const GESTURES = {
  nod: { time: .9, add: true, j: (t, o) => { o.head = [.2 * S(t * 4 * PI) ** 2 * (1 - .35 * t), 0, 0]; } },
  shake: { time: 1.2, add: true, j: (t, o) => { o.head = [0, .28 * S(t * 6 * PI) * env(t, .1, .35), 0]; } },
  // (the arms' angles worked out from where the elbow, the wrist and the palm should be: scripts/arm-solve.mjs, mirrored for the other side)
  shrug: { time: 1.5, peak: .4, j: (t, o) => {
    o.collarL = [0, 0, .16]; o.collarR = [0, 0, -.16]; o.head = [-.02, 0, .1]; o.spine = [-.03, 0, 0];
    o.armL = [-.14, .53, .08]; o.armR = [-.14, -.53, -.08]; o.foreL = [-1.39, .99, 0]; o.foreR = [-1.39, -.99, 0]; o.handL = [.02, 0, .02]; o.handR = [.02, 0, -.02];
  } },
  // (the upper arm out to the side and up, the forearm straight up, the palm ahead: it waves side to side at the elbow)
  wave: { time: 2.2, peak: .2, loop: true, j: (t, o, q) => { const s = S(q * 2.6 * 2 * PI) * Math.min(1, q * 3); o.armR = [-1.58, .1, -1.4]; o.foreR = [-1.45 + .32 * s, .86, 0]; o.handR = [0, 0, -.12 * s]; o.collarR = [0, 0, -.08]; o.head = [0, -.08, 0]; } },
  point: { time: 2.4, peak: .25, j: (t, o, q, g) => {
    // (the arm hangs straight down at rest: turned out to the side by c and then forward or back by a, it points along d)
    const d = g.dir, c = Math.asin(cl(d[0], -1, 1)), a = Math.atan2(-d[2], -d[1]);
    o.armR = [a, 0, c]; o.foreR = [-.08, 0, 0]; o.handR = [0, 0, 0]; o.head = [cl(-Math.asin(d[1]), -.4, .4) * .5, cl(Math.atan2(d[0], d[2]), -1, 1) * .6, 0];
  } },
  // (the elbows out to the sides and back, the hands on the hips, palms in)
  hips: { time: 1.2, peak: .5, hold: true, j: (t, o) => {
    o.armL = [1.13, -.64, 1.02]; o.armR = [1.13, .64, -1.02]; o.foreL = [-1.47, .36, 0]; o.foreR = [-1.47, -.36, 0]; o.handL = [.26, 0, .35]; o.handR = [.26, 0, -.35]; o.spine = [-.03, 0, 0];
  } },
  // (the forearms folded across the chest, the right over the left, each hand on the other arm)
  cross: { time: 1.2, peak: .5, hold: true, j: (t, o) => {
    o.armL = [-.3, -1.18, -.01]; o.armR = [-.4, 1.08, .01]; o.foreL = [-1.54, -.37, 0]; o.foreR = [-1.54, .74, 0]; o.handL = [-.21, 0, -.22]; o.handR = [-.28, 0, .26]; o.collarL = [0, -.04, 0]; o.collarR = [0, .04, 0];
  } },
};

export class Idle {
  /** person: the human(); rig: its Rig. */
  constructor(person, rig) {
    this.person = person; this.rig = rig;
    /** false: no fidgets, glances or turning of the head by itself (gestures still play). */
    this.on = true;
    /** How much of a look the head and body take (1); 0 leaves the head to the game (the eyes still look). */
    this.turn = 1;
    /** Seconds between fidgets, about (6); 0 for none. */
    this.every = 6;
    this.cur = null; this.t = 0; this.next = rnd(2, 6); this.still = 0;
    this.g = null;   // the gesture playing: { name, t, hold, dir }
    this.glanceT = 0; this.glanceAt = null; this.before = undefined;
    this.hy = 0; this.hp = 0; this.hv = [0, 0]; this.sy = 0; this.sv = 0;   // the head's turn after the eyes, and the body's after that (springs)
    this.ears = []; this.eyes = []; this.heard = new WeakSet();
    this.handsBusy = 0;   // (person.hold and touch set it: no hand shaken out of a grip)
  }
  /** A fidget now (by name: shoulders, neck, down, sigh, swallow, hand, look; none: one chosen as by itself). */
  fidget(name) {
    if (!name) { const can = this.handsBusy > 0 ? NAMES.filter(n => n !== 'hand') : NAMES; let r = Math.random() * can.reduce((a, n) => a + FIDGETS[n].often, 0); name = can.find(n => (r -= FIDGETS[n].often) <= 0) || 'shoulders'; }
    const f = FIDGETS[name]; if (!f) return this;
    this.cur = { name, f, t: 0, s: Math.random() < .5 ? 1 : -1 }; f.start?.(this.person);
    if (f.look) { const s = this.cur.s, a = rnd(.5, 1.2) * s, d = rnd(3, 7); this.person.updateWorldMatrix(true, false); const p = new Vector3(Math.sin(a) * d, 1.6 + rnd(-.3, .2), Math.cos(a) * d).applyMatrix4(this.person.matrixWorld); this.notice(p, { hold: f.time }); }
    return this;
  }
  /**
   * A glance at something (a point, or an Object3D followed while it lasts): the eyes go at once, the head a moment after and the body
   * after that if it is far round, held for hold seconds (1.6), then back to what the eyes were on before.
   */
  notice(thing, { hold = 1.6 } = {}) {
    const face = this.person.face; if (!face) return this;
    if (this.glanceT <= 0) this.before = face.target; this.glanceAt = thing; this.glanceT = hold; face.look(thing); return this;
  }
  /** Glances at the noises of a gs.senses Noises (x, y there are x, z here; heard within loud / 6 metres): height, the y they are at (1). */
  listen(noises, { height = 1 } = {}) { this.ears.push({ noises, height }); return this; }
  /** Glances at a thing that moves nearby (an Object3D: within near metres, 8, faster than fast metres a second, 1.5). */
  watch(thing, { near = 8, fast = 1.5 } = {}) { this.eyes.push({ thing, near, fast, was: null, quiet: 0 }); return this; }
  /**
   * A gesture by name: nod, shake (the head), shrug, wave, point (at: where, [x, y, z] or an Object3D), hips (hands on the hips), cross (arms
   * crossed); null ends a held one. hold: true stays at its fullest until gesture(null) or another (hips and cross always do; a wave goes on waving).
   */
  gesture(name, { hold, at: where } = {}) {
    if (!name) { if (this.g) this.g.ending = true; return this; }
    const G = GESTURES[name]; if (!G) throw new Error(`person.idle.gesture: no gesture '${name}' (try ${Object.keys(GESTURES).join(', ')})`);
    this.g = { name, G, t: 0, q: 0, hold: hold ?? !!(G.hold || G.loop), ending: false, at: where || null, dir: [0, 0, 1], w: this.g && !this.g.G.add && !G.add ? this.g.w : 0 };
    if (name === 'point') this.person.fingers?.({ R: [.55, -.05, 1, 1, 1] });
    return this;
  }
  /** The gesture playing (its name), or null. */
  get doing() { return this.g?.name ?? null; }
  // one step, over the joints the rig has worked out for this frame (out: joint => [x, y, z] added to each joint's rest); close: the
  // nearest level of detail (fidgets only there), near: not the far one (the head after the eyes, glances; a gesture plays at any distance)
  pose(dt, out, speed = 0, close = true, near = true) {
    const P = this.person, rig = this.rig, face = P.face;
    // (awake and at ease: not hanging, climbing, in the air or down on the ground, breathing, eyes open)
    const asleep = face && (face.awake === false || face.awake == null && face.lie >= .35), calm = !asleep && P.breath?.on !== false && !BUSY.test(rig.state);
    if (this.handsBusy > 0) this.handsBusy--;
    // ---- standing still a moment? (fidgets only then, and never while an upper-body pose like aim is held)
    this.still = calm && Math.abs(speed) < .25 && !rig.topOn ? Math.min(1, this.still + dt / .8) : Math.max(0, this.still - dt / .25);
    // ---- what is heard and seen nearby: a glance (not while a gesture plays)
    if (this.on && near && calm && !this.g && (this.ears.length || this.eyes.length)) this.senses(dt);
    // ---- a fidget now and then
    if (this.on && close && this.every > 0 && this.still >= 1 && !this.cur && !this.g && this.glanceT <= 0 && (this.next -= dt) <= 0) { this.fidget(); this.next = this.every * rnd(.6, 1.5); }
    if (this.cur) {
      const c = this.cur; c.t += dt / c.f.time;
      if (c.t >= 1 || this.still < .2 && !c.f.look || !close) this.cur = null;
      else if (c.f.j) { const o = {}; c.f.j(c.t, c.s, o); const k = Math.min(1, this.still * 4); for (const j in o) { const a = o[j], d = out[j] ||= [0, 0, 0]; d[0] += a[0] * k; d[1] += a[1] * k; d[2] += a[2] * k; } }
    }
    // ---- a glance ends: the eyes go back to what they were on (unless the game has sent them somewhere since)
    if (this.glanceT > 0 && (this.glanceT -= dt) <= 0) { if (face && face.target === this.glanceAt) face.look(this.before ?? null); this.glanceAt = null; this.before = undefined; }
    // ---- the head after the eyes, the body after the head: where the eyes are looking (a point or a thing), in the body's own terms
    let wy = 0, wp = 0, sb = 0;
    const tgt = asleep ? null : face?.target, k = this.on && near ? this.turn * (1 - rig.topW) : 0;
    if (tgt && k > 0) {
      P.updateWorldMatrix(true, false); _m.copy(P.matrixWorld).invert(); at(tgt, _p).applyMatrix4(_m);
      const hb = P.bones?.head; if (hb) _h.setFromMatrixPosition(hb.matrixWorld).applyMatrix4(_m); else _h.set(0, 1.6, 0);
      const dx = _p.x - _h.x, dy = _p.y - _h.y, dz = _p.z - _h.z, flat = Math.hypot(dx, dz);
      if (flat + Math.abs(dy) > .05) { wy = Math.atan2(dx, dz); wp = Math.atan2(-dy, flat); }
      // (the eyes take the first of it: the head turns for what is more than a few degrees off, and no further than a neck goes)
      // (and the body for a thing further round than the head and eyes reach, past a right angle)
      const over = Math.max(0, Math.abs(wy) - .12); sb = Math.sign(wy) * cl((Math.abs(wy) - 1.6) * .6, 0, .4) * k;
      wy = Math.sign(wy) * Math.min(over * .85, 1.05) * k - sb * .5; wp = cl((Math.abs(wp) > .08 ? wp - Math.sign(wp) * .08 : 0) * .75, -.45, .4) * k;
    }
    // (springs: the head comes round in about a third of a second after the eyes, the body in about two thirds)
    const w1 = 9, w2 = 5;
    this.hv[0] += ((wy - this.hy) * w1 * w1 - 2 * w1 * this.hv[0]) * dt; this.hy += this.hv[0] * dt;
    this.hv[1] += ((wp - this.hp) * w1 * w1 - 2 * w1 * this.hv[1]) * dt; this.hp += this.hv[1] * dt;
    this.sv += ((sb - this.sy) * w2 * w2 - 2 * w2 * this.sv) * dt; this.sy += this.sv * dt;
    if (Math.abs(this.hy) + Math.abs(this.hp) + Math.abs(this.sy) > 1e-4) { const h = out.head ||= [0, 0, 0], s = out.spine ||= [0, 0, 0]; h[0] += this.hp; h[1] += this.hy; s[1] += this.sy; }
    // ---- a gesture: in, held at its fullest or played through, and out
    const g = this.g;
    if (g) {
      const G = g.G; g.t += dt / G.time; g.q += dt / G.time;
      if (g.at) { at(g.at, _p); P.updateWorldMatrix(true, false); _m.copy(P.matrixWorld).invert(); _p.applyMatrix4(_m); const sh = P.bones?.armR ? _h.setFromMatrixPosition(P.bones.armR.matrixWorld).applyMatrix4(_m) : _h.set(-.18, 1.42, 0); _p.sub(sh); if (_p.lengthSq() > 1e-6) { _p.normalize(); g.dir = [_p.x, _p.y, _p.z]; } }
      if (G.add) {
        if (g.t >= 1) this.g = null; else { const o = {}; G.j(g.t, o); for (const j in o) { const a = o[j], d = out[j] ||= [0, 0, 0]; d[0] += a[0]; d[1] += a[1]; d[2] += a[2]; } }
      } else {
        // (how far in: up to the peak, held there while held, then out over what is left)
        const peak = G.peak ?? .4, held = g.hold && !g.ending;
        if (held && g.t > peak) g.t = peak;
        if (g.ending && g.t < peak) g.t = peak;
        const want = g.t < peak ? ease(g.t / peak) : ease(cl(1 - (g.t - peak) / (1 - peak), 0, 1));
        g.w = g.t < peak ? Math.max(g.w, want) : want;
        if (g.t >= 1) { if (g.name === 'point') P.fingers?.({ R: 'auto' }); this.g = null; }
        else { const o = {}, w = g.w; G.j(g.t, o, g.q, g); for (const j in o) { const a = o[j], d = out[j] ||= [0, 0, 0]; if (j === 'head') for (let i = 0; i < 3; i++) d[i] += a[i] * w; else for (let i = 0; i < 3; i++) d[i] += (a[i] - d[i]) * w; } }   // (the head's turn is added, so a look still shows; the rest set over the pose)
      }
    }
    return this;
  }
  // a glance at a fresh noise in hearing, or at a thing that moves quickly nearby
  senses(dt) {
    const P = this.person; P.getWorldPosition(_h);
    for (const e of this.ears) for (const n of e.noises.list) {
      if (this.heard.has(n)) continue; this.heard.add(n);
      const d = Math.hypot(n.x - _h.x, n.y - _h.z); if (d < n.loud / 6 && d > .3) { this.notice([n.x, typeof e.height === 'function' ? e.height(n.x, n.y) : e.height, n.y]); return; }
    }
    for (const e of this.eyes) {
      const p = e.thing.getWorldPosition(_p), first = !e.was, v = first ? 0 : p.distanceTo(e.was) / Math.max(dt, 1e-3), d = p.distanceTo(_h);
      (e.was ||= new Vector3()).copy(p); e.quiet -= dt;
      if (first || e.quiet > 0) continue;
      if (v > e.fast && d < e.near) { this.notice(e.thing, { hold: rnd(1, 2) }); e.quiet = rnd(4, 8); return; }
    }
  }
  /** Back to rest: no fidget, glance or gesture. */
  stop() { this.cur = null; if (this.g?.name === 'point') this.person.fingers?.({ R: 'auto' }); this.g = null; if (this.glanceT > 0 && this.person.face?.target === this.glanceAt) this.person.face.look(this.before ?? null); this.glanceT = 0; this.hy = this.hp = this.sy = 0; this.hv[0] = this.hv[1] = this.sv = 0; return this; }
}
export const IDLE_FIDGETS = NAMES, GESTURE_NAMES = Object.keys(GESTURES);
