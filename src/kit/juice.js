// "Juice" kit: the small touches that make a game feel good. Particles, screen shake, smooth
// movement (easing and tweens), pop-up score text and screen flashes, for any 2D game (and the 2D
// HUD of 3D games). Everything is in the game's own units and is updated with the game's dt.
//
// The quick way is one Juice object that bundles them all:
//
//   import { Juice, ease } from '../kit/juice.js';
//   const fx = new Juice();                 // in make()
//   reset():   fx.clear();
//   update(dt): fx.update(dt);
//   draw(c):   fx.begin(c);  ...draw the world...  fx.end(c);   // shake + particles + popups + flash
//   on a hit:  fx.burst(x, y, { color: '#ff0' }); fx.shake(4); fx.pop(x, y, '+10'); fx.flash('#fff', .3);
//
// For pixel styles (Pocket, Color, Advance) pass new Juice({ pixel: true }): particles are drawn as
// crisp squares and shake moves in whole pixels.

import { lazy } from './lazy.js';
import { prefs } from './prefs.js';
const TAU = Math.PI * 2;

/* ---------- easing ---------- */
// Each takes t in 0..1 and returns the eased value (0 at the start, 1 at the end).
const outBounce = t => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + .75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + .9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + .984375;
};
export const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  inCubic: t => t * t * t,
  outCubic: t => 1 - (1 - t) ** 3,
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  inBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
  outBack: t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,          // overshoots a little: pops
  outElastic: t => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * TAU / 3) + 1,   // springy wobble
  outBounce,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** Straight blend from a to b by t (0..1). */
export const lerp = (a, b, t) => a + (b - a) * t;
/**
 * Moves `cur` smoothly toward `target`, the same speed at any frame rate. `rate` is how quickly:
 * about 10 catches up in a few tenths of a second. Use it for cameras, followers and UI.
 */
export const approach = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
/** Smooth 0..1 wave for pulsing things (glows, "tap" prompts). period in seconds. */
export const pulse = (t, period = 1) => .5 - .5 * Math.cos(t / period * TAU);

/* ---------- tweens ---------- */
/**
 * Animates numbers on any object over time:
 *   tw.to(card, { x: 200, s: 1 }, .4, ease.outBack)          // move and grow card over 0.4 s
 *   tw.to(ball, { y: 0 }, .3).then(() => sfx(...))           // run something when it ends
 *   tw.to(o, { a: 0 }, .5, ease.linear, .2)                   // start after 0.2 s
 * Call tw.update(dt) every frame. A new tween on the same object and key replaces the old one.
 */
export class Tweens {
  constructor() { this.list = []; }
  to(obj, props, dur = .3, fn = ease.outQuad, delay = 0) {
    const keys = Object.keys(props);
    this.list = this.list.filter(t => t.obj !== obj || !t.keys.some(k => keys.includes(k)));
    const tw = { obj, keys, to: props, from: null, dur: Math.max(.001, dur), fn, t: -delay, done: null };
    tw.then = f => { tw.done = f; return tw; };
    this.list.push(tw);
    return tw;
  }
  update(dt) {
    if (!this.list.length) return;
    let ended = null;
    for (const tw of this.list) {
      tw.t += dt;
      if (tw.t < 0) continue;
      if (!tw.from) { tw.from = {}; for (const k of tw.keys) tw.from[k] = +tw.obj[k] || 0; }
      const k = Math.min(1, tw.t / tw.dur), e = tw.fn(k);
      for (const key of tw.keys) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) (ended ||= []).push(tw);
    }
    if (ended) { this.list = this.list.filter(t => !ended.includes(t)); for (const t of ended) t.done?.(t.obj); }
  }
  /** Is anything still animating (on this object, if given)? */
  busy(obj) { return this.list.some(t => !obj || t.obj === obj); }
  clear() { this.list = []; }
}

/* ---------- timelines: steps in order, together and staggered (anime.js) ---------- */
// For moments with several parts: a title that drops in, then the stars pop one after another, then
// a button wobbles. Built on anime.js (animejs.com, MIT), which loads the first time a game makes a
// Timeline (do it in make() or reset()), and driven by your game's dt, so it pauses with the game.
// Times are in seconds.
//   const tl = new Timeline({ ease: 'outBack' })
//     .to(title, { y: 120, duration: .5 })
//     .to(stars, { s: 1, duration: .3, delay: stagger(.1) }, '+=.1')     // each star .1 s after the last
//     .to(button, { r: [-.1, .1, 0], duration: .4 }, 'stars')             // keyframes; at the 'stars' label
//     .label('stars', .5).call(() => sounds.win(), .6);
//   update(dt) { tl.update(dt); }        tl.done, tl.time, tl.duration, tl.play(), tl.pause(), tl.seek(s), tl.speed = 2
// Targets are your own objects (or a list of them) and their number fields. Positions: a number of
// seconds from the start, '+=.2' / '-=.2' after / before the end so far, '<' with the step before,
// or a label. Eases: anime's names ('outBack', 'inOutQuad', 'outElastic(1, .5)', 'steps(4)'...) or
// any function from `ease`. Seeking backwards runs call() steps again as it passes them.
const animeLib = lazy('anime.js', () => import('animejs').then(m => ({ createTimeline: m.createTimeline, stagger: m.stagger })));
const ms = v => typeof v === 'number' ? v * 1000 : v;
const pos = p => typeof p === 'number' ? p * 1000 : typeof p === 'string' ? p.replace(/([+-]=)\s*([\d.]+)/, (_, op, n) => op + (+n * 1000)) : p;
function toMs(params) {
  const o = { ...params };
  for (const k of ['duration', 'delay', 'loopDelay']) if (k in o) o[k] = typeof o[k] === 'function' && o[k].secs ? o[k].fn : ms(o[k]);
  return o;
}
/** A delay that grows along a list: stagger(.1) is 0, .1, .2 ... s; options as anime's ({ from: 'center', start }). */
export function stagger(each, o = {}) {
  const A = animeLib.get(), fn = A.stagger(each * 1000, o.start != null ? { ...o, start: o.start * 1000 } : o);
  const f = (...a) => fn(...a); f.secs = true; f.fn = fn; return f;
}
export class Timeline {
  /** defaults: { ease, duration } for every step; loop: true or a number of repeats; alternate: back and forth. */
  constructor({ loop = false, alternate = false, ...defaults } = {}) {
    const A = animeLib.get();
    this.tl = A.createTimeline({ autoplay: false, loop: loop === true ? Infinity : loop || 0, alternate, defaults: toMs(defaults) });
    this.time = 0; this.speed = 1; this.playing = true;
  }
  /** Animates targets' numbers to the values in params (with duration, delay, ease), at position. */
  to(targets, params, position) { this.tl.add(targets, toMs(params), pos(position)); return this; }
  /** Runs fn when the timeline passes this point. */
  call(fn, position) { this.tl.call(fn, pos(position)); return this; }
  /** Names a point (seconds, or a position string) to place later steps at. */
  label(name, position) { this.tl.label(name, pos(position)); return this; }
  /** How long it lasts in seconds (one loop). */
  get duration() { return this.tl.iterationDuration / 1000; }
  /** True once it has played to the end (never, if it loops for ever). */
  get done() { return !!this.tl.completed; }
  update(dt) { if (!this.playing) return this; this.time = Math.max(0, this.time + dt * this.speed); this.tl.seek(this.time * 1000); return this; }
  play() { this.playing = true; return this; }
  pause() { this.playing = false; return this; }
  /** Jumps to a time in seconds (values update straight away). */
  seek(t) { this.time = Math.max(0, t); this.tl.seek(this.time * 1000); return this; }
  restart() { return this.seek(0).play(); }
}

const alive = p => p.life > 0, showing = p => p.t < p.life;

/* ---------- particles ---------- */
/**
 * A pool of 2D particles. burst() throws out a ring of them:
 *   parts.burst(x, y, { n: 14, speed: 120, life: .6, size: 3, color: ['#ff0', '#f80'], gravity: 300 })
 * Options (all optional): n, speed (and spread 0..1 of random speed), angle + arc (radians: a cone
 * instead of a ring), life, size, shrink (true: get smaller as they fade), gravity, drag, color (one
 * or a list), shape ('circle' | 'square' | 'spark': a streak along its motion), glow (adds light).
 * emit(x, y, vx, vy, opts) adds a single one (trails, smoke).
 */
export class Particles {
  constructor({ max = 500, pixel = false } = {}) { this.max = max; this.pixel = pixel; this.list = []; }
  emit(x, y, vx = 0, vy = 0, o = {}) {
    if (this.list.length >= this.max) this.list.shift();
    const col = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : (o.color || '#ffffff');
    const life = (o.life ?? .6) * (.7 + Math.random() * .6);
    this.list.push({ x, y, vx, vy, life, max: life, size: o.size ?? 3, col, g: o.gravity ?? 0, drag: o.drag ?? 1.5,
      shape: o.shape || (this.pixel ? 'square' : 'circle'), shrink: o.shrink ?? true, glow: !!o.glow });
  }
  burst(x, y, o = {}) {
    const n = o.n ?? 12, sp = o.speed ?? 120, spread = o.spread ?? .6, arc = o.arc ?? TAU, a0 = (o.angle ?? 0) - arc / 2;
    for (let i = 0; i < n; i++) {
      const a = arc >= TAU ? (i / n) * TAU + Math.random() * .5 : a0 + Math.random() * arc;
      const v = sp * (1 - spread + Math.random() * spread * 2);
      this.emit(x, y, Math.cos(a) * v, Math.sin(a) * v, o);
    }
  }
  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    let dead = false; for (const p of this.list) if (p.life <= 0) { dead = true; break; }
    if (dead) this.list = this.list.filter(alive);
  }
  draw(c) {
    if (!this.list.length) return;
    c.save();
    for (const p of this.list) {
      const k = Math.max(0, p.life / p.max), s = p.shrink ? p.size * (.3 + .7 * k) : p.size;
      c.globalAlpha = Math.min(1, k * 1.5);
      c.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      c.fillStyle = p.col; c.strokeStyle = p.col;
      if (p.shape === 'square') {
        const q = this.pixel ? Math.max(1, Math.round(s)) : s;
        const x = this.pixel ? Math.round(p.x - q / 2) : p.x - q / 2, y = this.pixel ? Math.round(p.y - q / 2) : p.y - q / 2;
        c.fillRect(x, y, q, q);
      } else if (p.shape === 'spark') {
        c.lineWidth = Math.max(1, s * .6); c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * .04, p.y - p.vy * .04); c.stroke();
      } else { c.beginPath(); c.arc(p.x, p.y, s / 2, 0, TAU); c.fill(); }
    }
    c.restore();
  }
  get count() { return this.list.length; }
  clear() { this.list = []; }
}

/* ---------- screen shake ---------- */
/**
 * Trauma-style shake: add(amount) stacks up (amount is roughly the shake in game units), it fades
 * by itself. In draw: shake.apply(c) before the world, c.restore() after (Juice.begin/end do it).
 */
export class Shake {
  constructor({ pixel = false, max = 12, fade = 1.6 } = {}) { this.pixel = pixel; this.max = max; this.fade = fade; this.trauma = 0; this.x = 0; this.y = 0; this.t = 0; }
  add(amount = 4) { this.trauma = Math.min(1, this.trauma + amount * prefs.motion / this.max); }   // softer with Reduce motion
  update(dt) {
    this.t += dt; this.trauma = Math.max(0, this.trauma - this.fade * dt);
    const k = this.trauma * this.trauma * this.max;   // squared: big hits shake hard, small ones barely
    this.x = k * (Math.sin(this.t * 71) * .6 + Math.sin(this.t * 113) * .4);
    this.y = k * (Math.sin(this.t * 89 + 1) * .6 + Math.sin(this.t * 131 + 2) * .4);
    if (this.pixel) { this.x = Math.round(this.x); this.y = Math.round(this.y); }
  }
  apply(c) { c.save(); c.translate(this.x, this.y); }
  clear() { this.trauma = 0; this.x = this.y = 0; }
}

/* ---------- pop-up text ---------- */
/**
 * Floating text that rises and fades: pops.add(x, y, '+10', { color, size, font, life, rise }).
 * Defaults to a bold font that suits phone games; pixel games can pass font: '"Press Start 2P"'.
 */
export class Popups {
  constructor({ font = 'Rubik, sans-serif', size = 16, color = '#ffffff', pixel = false } = {}) {
    this.font = font; this.size = size; this.color = color; this.pixel = pixel; this.list = [];
  }
  add(x, y, text, o = {}) {
    if (this.list.length > 40) this.list.shift();
    this.list.push({ x, y, text: String(text), t: 0, life: o.life ?? .9, rise: o.rise ?? 30, color: o.color || this.color, size: o.size || this.size, font: o.font || this.font });
  }
  update(dt) { let done = false; for (const p of this.list) if ((p.t += dt) >= p.life) done = true; if (done) this.list = this.list.filter(showing); }
  draw(c) {
    if (!this.list.length) return;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of this.list) {
      const k = p.t / p.life, grow = k < .15 ? ease.outBack(k / .15) : 1;
      const y = p.y - p.rise * ease.outCubic(k);
      c.globalAlpha = k > .6 ? 1 - (k - .6) / .4 : 1;
      c.font = `800 ${Math.round(p.size * grow)}px ${p.font}`;
      const px = this.pixel ? Math.round(p.x) : p.x, py = this.pixel ? Math.round(y) : y;
      c.fillStyle = '#000000a0'; c.fillText(p.text, px + 1, py + 1);
      c.fillStyle = p.color; c.fillText(p.text, px, py);
    }
    c.restore();
  }
  clear() { this.list = []; }
}

/* ---------- everything together ---------- */
export class Juice {
  constructor({ pixel = false, max = 500, font, size, color } = {}) {
    this.pixel = pixel;
    this.parts = new Particles({ max, pixel });
    this.shaker = new Shake({ pixel });
    this.pops = new Popups({ pixel, font: font || (pixel ? '"Press Start 2P", monospace' : undefined), size: size || (pixel ? 8 : 16), color });
    this.tweens = new Tweens();
    this.fl = null;   // current flash
    this.hitstop = 0;
  }
  burst(x, y, o) { this.parts.burst(x, y, o); return this; }
  emit(x, y, vx, vy, o) { this.parts.emit(x, y, vx, vy, o); return this; }
  shake(amount) { this.shaker.add(amount); return this; }
  pop(x, y, text, o) { this.pops.add(x, y, text, o); return this; }
  tween(obj, props, dur, fn, delay) { return this.tweens.to(obj, props, dur, fn, delay); }
  /** Brief full-screen colour flash (a hit, a pickup). a = strength 0..1. */
  flash(color = '#ffffff', a = .35, dur = .18) { this.fl = { color, a: a * (prefs.reduceMotion ? .3 : 1), dur, t: 0 }; return this; }
  /**
   * Hit-stop: freeze the action for a moment on a big hit (it sells the impact). The game checks
   * `if (fx.frozen) return;` at the top of its own update logic; effects keep moving.
   */
  freeze(sec = .06) { this.hitstop = Math.max(this.hitstop, sec); return this; }
  get frozen() { return this.hitstop > 0; }
  update(dt) {
    this.hitstop = Math.max(0, this.hitstop - dt);
    this.parts.update(dt); this.shaker.update(dt); this.pops.update(dt); this.tweens.update(dt);
    if (this.fl && (this.fl.t += dt) >= this.fl.dur) this.fl = null;
  }
  /** Call before drawing the world: applies the shake. */
  begin(c) { this.shaker.apply(c); }
  /**
   * Call after drawing the world: draws particles and popups, undoes the shake, draws the flash.
   * Text settings the world set (textAlign, textBaseline, font, direction) carry on past end(), so a
   * HUD drawn after it gets what the game last set, not what was set before begin().
   */
  end(c, W = c.canvas.width, H = c.canvas.height) {
    const ta = c.textAlign, tb = c.textBaseline, f = c.font, dir = c.direction;
    this.parts.draw(c); this.pops.draw(c);
    c.restore();
    c.textAlign = ta; c.textBaseline = tb; c.font = f; c.direction = dir;
    if (this.fl) {
      c.save(); c.globalAlpha = this.fl.a * (1 - this.fl.t / this.fl.dur); c.fillStyle = this.fl.color;
      c.fillRect(-20, -20, W + 40, H + 40); c.restore();
    }
  }
  clear() { this.parts.clear(); this.shaker.clear(); this.pops.clear(); this.tweens.clear(); this.fl = null; this.hitstop = 0; }
}
