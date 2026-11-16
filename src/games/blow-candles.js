import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { startMic, stopMic, haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Blow into the mic to put out the birthday candles. Trick candles (striped) relight unless
// every candle is out at the same moment. No mic? Tap a candle to puff at it.
const W = 360, H = 640;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let candles, time, score, cakes, t, mic, asked, level, smoke, done;
  function cake() {
    const n = Math.min(9, 4 + cakes), trick = Math.min(3, Math.floor(cakes / 2));
    candles = [...Array(n)].map((_, i) => ({ x: 70 + i * (220 / (n - 1 || 1)) + rnd(-6, 6), y: 360 + Math.abs(i - (n - 1) / 2) * 6, hp: 1, out: 0, trick: i < trick ? 1 : 0, col: ['#ff6b8a', '#6bc5ff', '#ffd34a', '#8aff9a'][i % 4] }));
    candles = shuffle(candles);
    done = 0;
  }
  return {
    reset() { stopMic(); mic = null; asked = false; time = 30; score = 0; cakes = 0; t = 0; level = 0; smoke = []; feel.clear(); cake(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; time -= dt; if (time <= 0) { stopMic(); haptic('error'); return api.over(); }
      if (!asked) { asked = true; startMic().then(m => { mic = m; }); }
      level = mic ? clamp((mic.level() - .12) * 2.5, 0, 1) : 0;
      if (done > 0) { done -= dt; if (done <= 0) { cakes++; time += 6; cake(); } }
      for (const c of candles) {
        if (c.out) { c.out += dt; if (c.trick && c.out > 1.6 && candles.some(o => !o.out)) { c.out = 0; c.hp = 1; feel.juice.burst(c.x, c.y - 62, { n: 8, speed: 70, life: .35, size: 3, color: ['#ffb02e', '#fff3b0'] }).pop(c.x, c.y - 84, 'RELIT!', { color: '#ffb02e', size: 13 }); sfx(300, .15, 'triangle', .04, 200); haptic('warning'); } continue; }
        if (level > 0) c.hp -= level * dt * rnd(1.2, 2.4) * (c.trick ? .8 : 1);
        if (c.hp <= 0) extinguish(c);
      }
      for (const s of smoke) { s.y -= dt * 40; s.l -= dt; s.x += Math.sin(s.l * 6) * .4; } smoke = smoke.filter(s => s.l > 0);
    },
    draw(c) {
      c.fillStyle = '#2a1c3a'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#ffffff08'; c.beginPath(); c.arc(W / 2, 330, 240, 0, 7); c.fill();
      c.fillStyle = '#e8d2b0'; c.beginPath(); c.ellipse(W / 2, 520, 170, 26, 0, 0, 7); c.fill();
      c.fillStyle = '#ff9ec2'; c.fillRect(40, 380, 280, 130); c.beginPath(); c.ellipse(W / 2, 510, 140, 22, 0, 0, Math.PI); c.fill();
      c.fillStyle = '#ffc4dc'; c.beginPath(); c.ellipse(W / 2, 380, 140, 30, 0, 0, 7); c.fill();
      c.fillStyle = '#ffffff'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(50 + i * 20, 392 + (i % 2) * 4, 9, 0, Math.PI); c.fill(); }
      for (const cd of candles) {
        c.fillStyle = cd.col; c.fillRect(cd.x - 5, cd.y - 50, 10, 50);
        if (cd.trick) { c.fillStyle = '#ffffff'; for (let y = 0; y < 50; y += 10) c.fillRect(cd.x - 5, cd.y - 50 + y, 10, 4); }
        c.fillStyle = '#333'; c.fillRect(cd.x - 1, cd.y - 56, 2, 6);
        if (!cd.out) {
          const fl = clamp(cd.hp, .2, 1), lean = level * 10, fx = cd.x + lean, fy = cd.y - 62;
          c.fillStyle = '#ffb02e'; c.beginPath(); c.ellipse(fx, fy, 6 * fl, 13 * fl + Math.sin(t * 25 + cd.x) * 1.5, lean * .03, 0, 7); c.fill();
          c.fillStyle = '#fff3b0'; c.beginPath(); c.ellipse(fx, fy + 3, 3 * fl, 6 * fl, 0, 0, 7); c.fill();
        }
      }
      for (const s of smoke) { c.fillStyle = `rgba(200,200,220,${s.l * .5})`; c.beginPath(); c.arc(s.x, s.y, 6 + (1.5 - s.l) * 6, 0, 7); c.fill(); }
      feel.end(c, W, H);
      c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = time < 6 ? '#ff6060' : '#ffffffcc'; c.fillText(`${Math.ceil(time)}s`, 14, 26);
      c.fillStyle = '#ffffff18'; c.fillRect(16, H - 40, W - 32, 10); c.fillStyle = '#7dd3ff'; c.fillRect(16, H - 40, (W - 32) * level, 10);
      c.fillStyle = '#ffffffaa'; c.font = '500 12px Rubik, sans-serif'; c.fillText(mic ? 'Blow into the mic! Striped candles relight.' : 'Tap candles to puff them out (allow the mic to blow)', 16, H - 48);
      if (done > 0) { c.fillStyle = '#ffd34a'; c.font = '400 18px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('MAKE A WISH', W / 2, 200); }
    },
    down(x, y) {
      let best = null, bd = 34; for (const cd of candles) { if (cd.out) continue; const d = Math.hypot(cd.x - x, cd.y - 40 - y); if (d < bd) { bd = d; best = cd; } }
      if (!best) return; best.hp -= .4; haptic('tick'); sfx(400, .05, 'triangle', .02, -200); if (best.hp <= 0) extinguish(best);
    },
    key(k, d) { if (d && k === ' ') { const cd = candles.find(q => !q.out); if (cd) extinguish(cd); } },
  };
  function extinguish(cd) {
    cd.out = .001; cd.hp = 0; score++; api.score(score); haptic('light'); sfx(700, .06, 'triangle', .04, -300);
    for (let i = 0; i < 4; i++) smoke.push({ x: cd.x + rnd(-3, 3), y: cd.y - 62, l: 1.5 - i * .2 });
    if (candles.every(q => q.out) && done <= 0) { done = 1.2; feel.win(W / 2, 330); feel.juice.pop(W / 2, 240, '+6s', { color: '#7dff9a', size: 20 }); haptic('success'); sfx(880, .3, 'triangle', .06, 300); }
  }
}

export default {
  id: 'blow-candles', title: 'Blow the Candles', tag: 'Casual · Mic', retro: false, w: W, h: H, goal: 25,
  hint: 'Blow into your phone\'s mic to put out the candles. Striped trick candles relight unless they are all out at once. No mic? Tap the candles.',
  make,
};
