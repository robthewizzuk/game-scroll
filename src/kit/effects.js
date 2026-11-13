// One-call effects: the sight, sound and buzz of common game moments in one line, so every game
// feels good without wiring particles, shake, sound and haptics by hand each time.
//
//   const { Feel } = gs.effects;
//   const feel = new Feel();                  // in make(); new Feel({ pixel: true }) for pixel styles
//   reset():    feel.clear();
//   update(dt): feel.update(dt);
//   draw(c):    feel.begin(c);  ...draw the world...  feel.end(c);
//   feel.coin(x, y);  feel.hit(x, y);  feel.boom(x, y);  feel.hurt();  feel.combo(n, x, y) ...
//
// Every effect takes an optional colour or size and respects the player's sound and vibration
// settings. feel.juice is the Juice underneath (gs.juice) for your own particles, tweens and pop-ups.

import { timed } from './prof.js';
import { Juice } from './juice.js';
import { sounds, zzfx } from './sound.js';
import { haptic } from './device.js';

export class Feel {
  constructor({ pixel = false, sound = true, buzz = true, ...o } = {}) {
    this.juice = new Juice({ pixel, ...o }); this.pixel = pixel; this.sound = sound; this.buzz = buzz; this.streak = 0;
  }
  update(dt) { this.juice.update(dt); return this; }
  begin(c) { this.juice.begin(c); return this; }
  end(c, W, H) { this.juice.end(c, W, H); return this; }
  clear() { this.juice.clear(); this.streak = 0; return this; }
  /** Is the game frozen for a hit-stop this frame? (skip your own movement while true) */
  get frozen() { return this.juice.hitstop > 0; }
  s(name, ...a) { if (this.sound) sounds[name]?.(...a); }
  h(kind) { if (this.buzz) haptic(kind); }

  /** Picked something up. text: what pops up ('+1', '+10'...), or '' for nothing. */
  coin(x, y, { color = '#ffd84a', text = '+1', pitch = 1 } = {}) { this.juice.burst(x, y, { n: 8, speed: 90, life: .35, size: 2.5, color: [color, '#ffffff'] }); if (text) this.juice.pop(x, y - 8, text, { color }); this.s('coin', pitch); this.h('light'); return this; }
  /** Something hit something. power 0..1 scales it. */
  hit(x, y, { color = '#ffffff', power = .6 } = {}) { this.juice.burst(x, y, { n: 6 + power * 10, speed: 120 + power * 160, life: .25, size: 2, color, shape: 'spark' }); this.juice.shake(2 + power * 5); if (power > .7) this.juice.freeze(.05); this.s('hit', 1 + (1 - power) * .3); this.h(power > .6 ? 'medium' : 'light'); return this; }
  /** An explosion. size: 1 normal. */
  boom(x, y, { size = 1, color = ['#fff4a0', '#ffae2a', '#ff4a1a', '#555555'] } = {}) { this.juice.burst(x, y, { n: 26 * size, speed: 220 * size, life: .6, size: 3.5 * size, color, drag: 2, glow: !this.pixel }); this.juice.shake(8 * size); this.juice.flash('#ffffff', .25 * size); this.juice.freeze(.06); this.s('boom', 1 / Math.max(.5, size)); this.h('heavy'); return this; }
  /** The player got hurt. */
  hurt(x, y) { if (x != null) this.juice.burst(x, y, { n: 10, speed: 140, life: .4, size: 2.5, color: ['#ff3a3a', '#ffffff'] }); this.juice.shake(7); this.juice.flash('#ff2020', .3); this.juice.freeze(.08); this.s('hurt'); this.h('warning'); this.streak = 0; return this; }
  /** Took off. */
  jump(x, y) { this.juice.burst(x, y, { n: 5, speed: 50, life: .25, size: 2, color: '#ffffff', angle: Math.PI / 2, arc: 1.2, gravity: 0 }); this.s('jump'); this.h('light'); return this; }
  /** Landed. speed: how hard (game units per second), so a big fall thumps. */
  land(x, y, speed = 300) { const k = Math.min(1, speed / 600); this.juice.burst(x, y, { n: 4 + k * 8, speed: 60 + k * 80, life: .3, size: 2, color: '#d8d0c0', angle: -Math.PI / 2, arc: 2.2, gravity: 200 }); if (k > .5) { this.juice.shake(k * 4); this.h('medium'); } this.s('blip', .7); return this; }
  /** Fired a shot. */
  shoot(x, y, { color = '#ffe080', angle = -Math.PI / 2 } = {}) { this.juice.burst(x, y, { n: 4, speed: 140, life: .12, size: 2, color, angle, arc: .5 }); this.s('shoot'); this.h('tick'); return this; }
  /** Got a power-up. */
  powerup(x, y, { color = '#7af0ff', text = 'POWER UP!' } = {}) { this.juice.burst(x, y, { n: 24, speed: 160, life: .7, size: 3, color: [color, '#ffffff'] }); if (text) this.juice.pop(x, y - 12, text, { color, size: 1.3 }); this.juice.flash(color, .2); this.s('powerup'); this.h('success'); return this; }
  /** A combo: n in a row. The sound rises and the pop-up grows with n. */
  combo(n, x, y, { color = '#ff7af0' } = {}) { this.streak = n; this.juice.pop(x, y, `${n}×`, { color, size: 1 + Math.min(1.5, n * .1) }); this.juice.burst(x, y, { n: 6 + Math.min(20, n * 2), speed: 120, life: .4, size: 2.5, color: [color, '#ffffff'] }); this.s('coin', 1 + Math.min(1.5, n * .08)); this.h(n % 5 === 0 ? 'medium' : 'light'); return this; }
  /** Points scored at a spot (just the pop-up and a soft blip). */
  score(x, y, points, { color = '#ffffff' } = {}) { this.juice.pop(x, y, (points > 0 ? '+' : '') + points, { color }); this.s('blip'); return this; }
  /** Won the round. */
  win(x, y) { if (x != null) this.juice.burst(x, y, { n: 50, speed: 260, life: 1.2, size: 3, color: ['#ffd84a', '#7af0ff', '#ff7af0', '#9dff6a'], gravity: 220 }); this.juice.flash('#ffffff', .25); this.s('win'); this.h('success'); return this; }
  /** Lost the round. */
  lose() { this.juice.shake(6); this.s('lose'); this.h('error'); return this; }
  /** A menu tap or a small step. */
  click() { this.s('select'); this.h('tick'); return this; }
  /** Your own ZzFX sound (numbers from the ZzFX designer) plus a buzz. */
  play(zzfxParams, buzz = 'light') { if (this.sound) zzfx(...zzfxParams); this.h(buzz); return this; }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Feel.prototype, 'update', 'effects');
