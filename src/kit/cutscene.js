// Cutscenes on a timeline: camera moves (smooth paths through points, looking at a target), lines of
// dialogue as subtitles, letterbox bars, timed actions (an explosion at 2.5 s), and skip. Works for
// 3D (positions { x, y, z }) and 2D (Camera2D: { x, y, zoom }). The kit says where the camera is and
// what's on screen each frame; your game puts its camera there and draws the scene.
//
//   const { Cutscene } = gs.cutscene;
//   intro = new Cutscene([
//     { at: 0, cam: [{ x: 0, y: 8, z: 20 }, { x: 6, y: 5, z: 10 }, { x: 4, y: 2, z: 4 }], look: hero, time: 4, ease: 'inOut' },
//     { at: 0, say: 'This is where it all went wrong.', who: 'Mara', time: 3 },
//     { at: 2.5, do: () => blowUp(bridge) },
//     { at: 4, cam: [{ x: 4, y: 2, z: 4 }], look: villain, time: 2 },
//     { at: 4.5, say: 'You should not have come back.', who: 'Kade' },
//     { at: 5, lens: { fstop: 1.8, focus: villain, pull: .8 } },   // a Next Gen lens (v.lens): a focus pull onto Kade
//   ], { bars: .12 });
//   update(dt) { if (intro.playing) { intro.update(dt); const s = intro.shot; cam.position.set(s.x, s.y, s.z); cam.lookAt(s.look.x, s.look.y, s.look.z); v.lens = intro.lens; } }
//   down() { if (intro.playing) intro.skip(); }                    // jumps to the end, running every action it passed
//   draw(c) { intro.drawBars(c, W, H); intro.drawLine(c, W, H); } // or draw your own from intro.bars and intro.line
//
// Actors: steps with actor (a gs.models.human or gs.poses person) direct the people in it. walk: { x, z } (at speed,
// 1.3 m/s; they turn to it, walk there and stop), turn: an angle or a point to face, look: a point or thing for the
// eyes (null: free), play: a gesture or move ('bow', 'nod', 'point'...: gs.poses GESTURES), mood + amount (a face
// shape), and say with actor speaks the line in that person's voice (voice, pitch, fx) with the mouth moving to it
// (with the built-in voice, every such line is written to sound when the cutscene starts, so each starts on its step).
// The game still updates each rig once a frame, with what the cutscene says it is doing:
//     { at: 0, actor: mara, walk: { x: 1, z: 2 } }, { at: 2.5, actor: mara, play: 'bow' },
//     { at: 3, actor: mara, say: 'You came back.', who: 'Mara', voice: 'woman', look: hero },
//   update(dt) { intro.update(dt); for (const p of people) p.rig.update(dt, intro.motion(p)); }
//
// Reduce motion: camera moves still play (they're the story), but shakes added with { shake } are toned down.

import { prefs } from './prefs.js';
import { prepare } from './sound.js';

const EASE = { linear: t => t, in: t => t * t, out: t => 1 - (1 - t) * (1 - t), inOut: t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) };
const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
const KEYS = ['x', 'y', 'z', 'zoom'];
/** A point along a smooth path through points (Catmull-Rom), u 0..1. */
export function along(points, u) {
  if (points.length === 1) return { ...points[0] };
  const n = points.length - 1, f = Math.max(0, Math.min(1, u)) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const p = k => points[Math.max(0, Math.min(n, k))], out = {}; if (!(f >= 0)) return { ...points[0] };
  for (const key of KEYS) if (points[0][key] != null) out[key] = cr(p(i - 1)[key], p(i)[key], p(i + 1)[key], p(i + 2)[key], t);
  return out;
}

export class Cutscene {
  /**
   * steps: [{ at (seconds), and one of: cam: [points] + time + look + ease; say + who + time; do: fn;
   * shake: strength + time; bars: 0..1 (letterbox height share); lens: a Next Gen view's lens from then on (v.lens:
   * f-stop, focus, pull...; null for none), read as this.lens }]. Options: bars (default letterbox), skippable.
   */
  constructor(steps, { bars = .1, skippable = true } = {}) {
    this.steps = steps.map((s, i) => ({ ...s, at: s.at ?? 0, i, ran: false })).sort((a, b) => a.at - b.at || a.i - b.i);
    this.barsTo = bars; this.skippable = skippable; this.handlers = {};
    this.length = Math.max(0, ...this.steps.map(s => s.at + (s.time ?? (s.say ? Math.max(2, s.say.length * .06) : 0))));
    this.reset();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  reset() { this.acting = new Map(); this.t = 0; this.playing = true; this.done = false; this.bars = 0; this.line = null; this.shot = null; this.shakeLeft = 0; this.shakeAmt = 0; for (const s of this.steps) s.ran = false; this.camStep = null; this.lens = null; return this; }
  get progress() { return this.length ? Math.min(1, this.t / this.length) : 1; }
  update(dt) {
    if (!this.playing) { this.bars = Math.max(0, this.bars - dt * 1.5 * this.barsTo); return this; }
    if (!this.t && !this.prepared) {   // the lines actors speak, written to sound ahead (the built-in voice), so each starts on its step
      this.prepared = true;
      for (const s of this.steps) if (s.say != null && s.actor?.face?.say) prepare(s.say, this.sayOpts(s)).catch(() => {});
    }
    this.t += dt;
    for (const s of this.steps) {
      if (s.at > this.t) break;
      if (!s.ran) { s.ran = true; this.start(s); }
    }
    if (this.camStep) {
      const s = this.camStep, u = s.time ? Math.min(1, (this.t - s.at) / s.time) : 1, e = (EASE[s.ease] || EASE.inOut)(u);
      const p = along(s.cam, e), look = typeof s.look === 'function' ? s.look(this.t) : s.look;
      this.shot = { ...p, look: look ? { x: look.x, y: look.y, z: look.z ?? 0 } : null };
    }
    for (const [p, a] of this.acting) this.act(p, a, dt);
    if (this.line && this.t > this.line.until) this.line = null;
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    if (this.shot && this.shakeLeft > 0) { const a = this.shakeAmt * prefs.motion * this.shakeLeft; this.shot.x += (Math.random() - .5) * a; this.shot.y += (Math.random() - .5) * a; }
    this.bars += (this.barsTo - this.bars) * Math.min(1, dt * 4);
    if (this.t >= this.length) this.finish();
    return this;
  }
  start(s) {
    if (s.actor) this.direct(s);
    if (s.cam) this.camStep = s;
    if (s.say != null && s.actor?.face?.say) s.actor.face.say(s.say, this.sayOpts(s));
    if (s.say != null) { this.line = { text: s.say, who: s.who ?? null, until: s.at + (s.time ?? Math.max(2, s.say.length * .06)) }; this.emit('say', this.line); }
    if (s.do) s.do(this);
    if (s.shake) { this.shakeAmt = s.shake; this.shakeLeft = s.time ?? .5; }
    if (s.bars != null) this.barsTo = s.bars;
    if (s.lens !== undefined) this.lens = s.lens;
  }
  sayOpts(s) { return { voice: s.voice ?? null, pitch: s.pitch ?? 1, rate: s.rate ?? 1, fx: s.fx ?? null, size: s.size ?? null }; }
  // an actor's step: what it is told to do from now on
  direct(s) {
    const p = s.actor, a = this.acting.get(p) || { speed: 0, to: null, face: null };
    this.acting.set(p, a);
    if (s.walk) { a.to = { x: s.walk.x, z: s.walk.z ?? s.walk.y }; a.pace = s.speed ?? 1.3; }
    if (s.turn != null) a.face = typeof s.turn === 'number' ? s.turn : Math.atan2((s.turn.x ?? 0) - p.position.x, (s.turn.z ?? s.turn.y ?? 0) - p.position.z);
    if (s.look !== undefined && p.face?.look) p.face.look(s.look);
    if (s.play) p.rig?.play(s.play, { again: true });
    if (s.mood && p.face?.set) { if (a.mood && a.mood !== s.mood) p.face.set(a.mood, 0); p.face.set(s.mood, s.amount ?? 1); a.mood = s.mood; }
  }
  // walking to a point, turning to a heading
  act(p, a, dt) {
    const turnTo = (want, rate) => { let d = want - p.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); p.rotation.y += Math.sign(d) * Math.min(Math.abs(d), rate * dt); };
    if (a.to) {
      const dx = a.to.x - p.position.x, dz = a.to.z - p.position.z, d = Math.hypot(dx, dz);
      if (d < .03) { a.to = null; a.speed = 0; p.rig?.play?.('idle'); }
      else {
        a.speed = Math.min(a.pace, d * 2.5 + .3); const step = Math.min(d, a.speed * dt);
        p.position.x += dx / d * step; p.position.z += dz / d * step; turnTo(Math.atan2(dx, dz), 5);
        p.rig?.blend?.({ idle: 0, walk: 1.3, jog: 3.3, run: 5.6 }, a.speed);
      }
    } else if (a.face != null) { turnTo(a.face, 3); }
  }
  /** What an actor is doing, for its rig: person.rig.update(dt, cut.motion(person)) ({ speed } while it walks). */
  motion(p) { const a = this.acting?.get(p); return a && a.speed ? { speed: a.speed } : {}; }
  /** Jumps to the end: every action not yet run runs now, in order (actors arrive where they were going). */
  skip() { if (!this.skippable || !this.playing) return this; for (const s of this.steps) if (!s.ran) { s.ran = true; if (s.actor) this.direct(s); if (s.do) s.do(this); }
    for (const [p, a] of this.acting) { if (a.to) { p.position.x = a.to.x; p.position.z = a.to.z; a.to = null; a.speed = 0; p.rig?.play?.('idle'); } if (a.face != null) p.rotation.y = a.face; } this.t = this.length; this.line = null; this.emit('skip'); this.finish(); return this; }
  finish() {
    if (this.done) return; this.done = true; this.playing = false; this.line = null;
    if (this.camStep) { const s = this.camStep; this.shot = { ...s.cam[s.cam.length - 1], look: this.shot?.look ?? null }; }
    this.emit('end');
  }
  /** Black bars top and bottom (from this.bars). */
  drawBars(c, w, h, colour = '#000') { if (this.bars < .002) return; const b = h * this.bars / 2; c.fillStyle = colour; c.fillRect(0, 0, w, b); c.fillRect(0, h - b, w, b); }
  /** The current line as a subtitle in the bottom bar. */
  drawLine(c, w, h, { font = 'Rubik, sans-serif', size = Math.round(Math.min(w, h) * .045), colour = '#fff', whoColour = '#ffd25a' } = {}) {
    if (!this.line) return;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 ${size}px ${font}`;
    const y = h - Math.max(h * this.barsTo / 4, size * 1.6), text = (this.line.who ? this.line.who + ': ' : '') + this.line.text;
    const words = text.split(' '), lines = [''], max = w * .9;
    for (const wd of words) { const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd; if (c.measureText(t).width > max) lines.push(wd); else lines[lines.length - 1] = t; }
    lines.forEach((l, i) => {
      const ly = y - (lines.length - 1 - i) * size * 1.25;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(l, w / 2 + 1, ly + 1); c.fillStyle = colour;
      if (i === 0 && this.line.who) { const who = this.line.who + ':', full = c.measureText(l).width, ww = c.measureText(who + ' ').width; c.textAlign = 'left'; const x0 = w / 2 - full / 2; c.fillStyle = whoColour; c.fillText(who, x0, ly); c.fillStyle = colour; c.fillText(l.slice(who.length + 1), x0 + ww, ly); c.textAlign = 'center'; }
      else c.fillText(l, w / 2, ly);
    });
    c.restore();
  }
}
