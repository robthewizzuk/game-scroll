import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { text } = gs.pixel;

// Is the sum right or wrong? Tap the left half for YES and the right half for NO.
// Sums get harder and the timer gets shorter. One wrong answer or timeout ends it.
const P = PAL.ice, W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ text: 'TAP TO START' });                   // the first sum stays hidden, and the bar full, until the first tap
  let lives, q, time, limit, score, t, flash;
  function next() {
    const lvl = Math.min(4, Math.floor(score / 6)); let a, b, op, r;
    const ops = ['+', '-', 'x', '+', '-'].slice(0, 2 + lvl);
    op = ops[Math.random() * ops.length | 0];
    if (op === 'x') { a = 2 + (Math.random() * (4 + lvl * 2) | 0); b = 2 + (Math.random() * 8 | 0); r = a * b; }
    else { a = 1 + (Math.random() * (9 + lvl * 15) | 0); b = 1 + (Math.random() * (9 + lvl * 15) | 0); if (op === '-' && b > a) [a, b] = [b, a]; r = op === '+' ? a + b : a - b; }
    const truth = Math.random() < .5; let shown = r;
    if (!truth) { const offs = [1, -1, 2, -2, 10, -10]; shown = r + offs[Math.random() * offs.length | 0]; if (op === 'x' && Math.random() < .5) shown = a * (b + 1); }
    q = { txt: `${a}${op}${b}`, shown, truth: shown === r };
    limit = Math.max(1.4, 4 - score * .08); time = limit;
  }
  function answer(yes) {
    if (yes === q.truth) { score++; api.score(score); flash = { ok: true, l: .2 }; haptic('light'); sfx(700 + score * 8, .05, 'square', .04, 150); next(); }
    else miss();
  }
  function miss() {
    flash = { ok: false, l: .4 }; haptic('error'); sfx(140, .3, 'square', .05, -40); feel.juice.shake(4); if (--lives <= 0) return api.over(); next();
  }
  return {
    reset() { lives = 3; score = 0; t = 0; flash = null; feel.clear(); ready.reset(); next(); },
    fx(dt) { feel.update(dt); },
    update(dt) { feel.update(dt); if (!ready.update(dt)) return; t += dt; if (flash) { flash.l -= dt; if (flash.l <= 0) flash = null; } time -= dt; if (time <= 0) miss(); },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? P[0] : P[2]; c.fillRect(W - 12 - i * 9, 6, 6, 6); }   // top right, clear of the score in the middle
      c.fillStyle = P[2]; c.fillRect(10, 22, 140, 4); c.fillStyle = P[0]; c.fillRect(10, 22, 140 * clamp(time / limit, 0, 1), 4);
      feel.begin(c);
      c.fillStyle = P[0]; c.font = '12px "Press Start 2P", monospace'; c.textAlign = 'center'; if (!ready.waiting) { c.fillText(q.txt, 80, 62); c.fillText(`= ${q.shown}`, 80, 86); }
      c.fillStyle = P[1]; c.fillRect(6, 106, 70, 44); c.fillRect(84, 106, 70, 44);
      c.fillStyle = P[3]; c.font = '8px "Press Start 2P", monospace'; text(c, 'YES', 41, 124, { color: P[3], align: 'center', font: 'big' }); text(c, 'NO', 119, 124, { color: P[3], align: 'center', font: 'big' });
      feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: P[0], y: 70 });
      if (flash) { c.fillStyle = flash.ok ? P[2] : P[0]; c.globalAlpha = .4; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    },
    down(x, y) { if (ready.go()) return; if (y > 30) answer(x < 80); },
    key(k, d) { if (!d || ready.go()) return; if (k === 'ArrowLeft' || k === 'y') answer(true); if (k === 'ArrowRight' || k === 'n') answer(false); },
  };
}

export default {
  id: 'fast-maths', title: 'Fast Maths', tag: 'Pocket · Brain', retro: true, w: W, h: H, pal: 'ice', goal: 25,
  hint: 'Is the sum right? Tap YES or NO before the bar runs out. It gets harder as you go. Three strikes: a wrong answer or a timeout costs one.',
  make,
};
