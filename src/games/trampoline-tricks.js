// Trampoline Tricks: a gymnast bounces on a trampoline all by herself. Hold to tuck into a ball and
// spin fast; let go to open out and slow the spin. Land feet first to bank your flips, and each clean
// landing bounces you higher. Land on your head or back three times and the coach calls it a day.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp } = gs.util;
const { icon } = gs.icons;

let W = 360, H = 640;
const TAU = Math.PI * 2;

function make(api) {
  const feel = new Feel();
  let y, vy, rot, spin, tuck, combo, score, falls, t, bounce, msg, ml, held, sag, flipsNow;
  const MATY = () => H - 150, G = 900;
  const peak = () => 150 + Math.min(5, bounce) * 45;   // apex height in units

  function launch() { vy = Math.sqrt(2 * G * peak()); y = 0; rot = 0; flipsNow = 0; }

  return {
    reset() { y = 0; vy = 0; rot = 0; spin = 0; tuck = 0; combo = 0; score = 0; falls = 0; t = 0; bounce = 0; msg = ''; ml = 0; held = false; sag = 0; flipsNow = 0; launch(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; sag = Math.max(0, sag - dt * 3);
      tuck = clamp(tuck + (held ? 6 : -5) * dt, 0, 1);
      spin = tuck * 10 + (rot > 0 ? 1.4 : 0);
      vy -= G * dt; y += vy * dt;
      if (y > 30) rot += spin * dt;
      const f = Math.floor((rot + .8) / TAU); if (f > flipsNow) { flipsNow = f; sfx(600 + f * 120, .05, 'triangle', .03); haptic('tick'); }
      if (y <= 0 && vy < 0) {
        y = 0; sag = 1;
        const off = Math.abs(((rot % TAU) + TAU + Math.PI) % TAU - Math.PI);
        if (off < .7 && tuck < .5) {
          const flips = Math.round(rot / TAU);
          if (flips > 0) { combo++; const pts = flips * flips + combo - 1; score += pts; api.score(score); msg = flips === 1 ? 'Flip!' : flips === 2 ? 'Double!' : flips === 3 ? 'Triple!' : `${flips}x flip!`; ml = 1; notes(flips > 1 ? 'C5 E5 G5 C6' : 'C5 G5', { len: .05 }); feel.coin(W / 2, MATY() - 60); haptic('success'); }
          bounce = Math.min(5, bounce + 1);
          sfx(180, .12, 'sine', .05, 140);
        } else if (rot > 1) {
          falls++; combo = 0; bounce = 0; msg = tuck >= .5 ? 'Still tucked!' : 'Ouch!'; ml = 1.2; feel.hurt(W / 2, MATY() - 20); haptic('error'); sfx(120, .2, 'square', .04);
          if (falls >= 3) { feel.lose(); return api.over(); }
        }
        launch();
      }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#caf0f8'); g.addColorStop(1, '#90e0ef'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // height marks on the gym wall
      c.fillStyle = '#0077b620'; for (let k = 1; k <= 6; k++) { const yy = MATY() - (150 + (k - 1) * 45) * .9; c.fillRect(20, yy, W - 40, 1); }
      c.fillStyle = '#48cae4'; c.fillRect(0, H - 110, W, 110);
      feel.begin(c);
      // trampoline
      const my = MATY(), dip = sag * 22 + (y < 0 ? 0 : 0);
      c.strokeStyle = '#023e8a'; c.lineWidth = 6; c.beginPath(); c.moveTo(W / 2 - 110, my + 40); c.lineTo(W / 2 - 100, my); c.moveTo(W / 2 + 110, my + 40); c.lineTo(W / 2 + 100, my); c.stroke();
      c.strokeStyle = '#03045e'; c.lineWidth = 5; c.beginPath(); c.moveTo(W / 2 - 100, my); c.quadraticCurveTo(W / 2, my + dip * 2, W / 2 + 100, my); c.stroke();
      // gymnast: rotates around her middle; tuck pulls arms and legs in
      const cy = my - y * .9 - 34 + dip, k = tuck;
      c.save(); c.translate(W / 2, cy); c.rotate(rot);
      c.strokeStyle = '#7b2cbf'; c.lineCap = 'round'; c.lineWidth = 9;
      c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 8); c.stroke();                                            // body
      c.lineWidth = 7; c.beginPath(); c.moveTo(0, 8); c.lineTo(-6 + k * 12, 24 - k * 18); c.lineTo(-4 + k * 2, 36 - k * 24); c.moveTo(0, 8); c.lineTo(6 + k * 10, 24 - k * 16); c.lineTo(5 + k * 4, 36 - k * 22); c.stroke(); // legs
      c.strokeStyle = '#ffb4a2'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -8); c.lineTo(-14 + k * 22, -22 + k * 26); c.moveTo(0, -8); c.lineTo(14 + k * 4, -22 + k * 26); c.stroke(); // arms
      c.fillStyle = '#ffb4a2'; c.beginPath(); c.arc(0, -22 + k * 4, 8, 0, 7); c.fill();
      c.fillStyle = '#3c096c'; c.beginPath(); c.arc(0, -25 + k * 4, 8, Math.PI, TAU); c.fill();
      c.restore();
      feel.end(c, W, H);
      for (let i = 0; i < 3 - falls; i++) icon(c, 'star', 24 + i * 18, H - 30, 16, { color: '#03045e' });
      c.textAlign = 'right'; c.font = '600 14px Rubik, sans-serif'; c.fillText(combo ? `streak ${combo}` : '', W - 16, H - 24);
      c.textAlign = 'center';
      if (ml > 0) { c.fillStyle = '#ff006e'; c.font = '800 28px Rubik, sans-serif'; c.fillText(msg, W / 2, 110); }
      if (t < 5) { c.fillStyle = '#03045e'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Hold to tuck and spin', W / 2, H - 70); c.font = '500 14px Rubik, sans-serif'; c.fillText('Let go to land on your feet', W / 2, H - 50); }
    },
    down() { held = true; },
    up() { held = false; },
    key(k, d) { if (k === ' ' || k === 'ArrowDown') held = d; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'trampoline-tricks',
  title: 'Trampoline Tricks',
  tag: 'Casual · Timing',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Hold to tuck and spin, let go to open out. Land feet first to score your flips; clean landings bounce higher. Three bad landings and it is over.',
  make,
};
