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
// Reduce motion: camera moves still play (they're the story), but shakes added with { shake } are toned down.

import { prefs } from './prefs.js';

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
  reset() { this.t = 0; this.playing = true; this.done = false; this.bars = 0; this.line = null; this.shot = null; this.shakeLeft = 0; this.shakeAmt = 0; for (const s of this.steps) s.ran = false; this.camStep = null; this.lens = null; return this; }
  get progress() { return this.length ? Math.min(1, this.t / this.length) : 1; }
  update(dt) {
    if (!this.playing) { this.bars = Math.max(0, this.bars - dt * 1.5 * this.barsTo); return this; }
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
    if (this.line && this.t > this.line.until) this.line = null;
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    if (this.shot && this.shakeLeft > 0) { const a = this.shakeAmt * prefs.motion * this.shakeLeft; this.shot.x += (Math.random() - .5) * a; this.shot.y += (Math.random() - .5) * a; }
    this.bars += (this.barsTo - this.bars) * Math.min(1, dt * 4);
    if (this.t >= this.length) this.finish();
    return this;
  }
  start(s) {
    if (s.cam) this.camStep = s;
    if (s.say != null) { this.line = { text: s.say, who: s.who ?? null, until: s.at + (s.time ?? Math.max(2, s.say.length * .06)) }; this.emit('say', this.line); }
    if (s.do) s.do(this);
    if (s.shake) { this.shakeAmt = s.shake; this.shakeLeft = s.time ?? .5; }
    if (s.bars != null) this.barsTo = s.bars;
    if (s.lens !== undefined) this.lens = s.lens;
  }
  /** Jumps to the end: every action not yet run runs now, in order. */
  skip() { if (!this.skippable || !this.playing) return this; for (const s of this.steps) if (!s.ran) { s.ran = true; if (s.do) s.do(this); } this.t = this.length; this.line = null; this.emit('skip'); this.finish(); return this; }
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
