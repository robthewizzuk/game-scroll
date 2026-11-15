import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { startMic, stopMic, haptic } = gs.device;
const { Feel } = gs.effects;
const { approach } = gs.juice;

// Call and response. Listen to the beat, then clap it back (the mic hears real claps) or tap it.
// Your first clap sets the timing; the rest must land with it. Patterns grow longer. Three flops and you're out.
const W = 360, H = 640, STEP = .3, WIN = .13;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let pat, phase, timer, played, input, score, lives, t, mic, asked, avg, cool, pulses, verdict, rounds;
  function newPattern() {
    const len = Math.min(8, 3 + Math.floor(rounds / 2)), slots = [0];
    for (let s = 1; s < 8 && slots.length < len; s++) if (Math.random() < .55 || 8 - s <= len - slots.length) slots.push(s);
    pat = slots; phase = 'listen'; timer = -.8; played = 0; input = []; verdict = null;
  }
  function clap(src) {
    if (phase !== 'play') return; input.push(t); pulses.push({ l: .3, src }); haptic('light'); sfx(1800, .03, 'square', .03, -1200);
    if (input.length >= pat.length) judge();
  }
  function judge() {
    const t0 = input[0]; let ok = input.length === pat.length;
    for (let i = 0; ok && i < pat.length; i++) if (Math.abs(input[i] - t0 - pat[i] * STEP) > WIN + i * .01) ok = false;
    phase = 'result'; timer = 1.1;
    if (ok) { rounds++; score += pat.length; api.score(score); verdict = 'SPOT ON'; feel.juice.burst(W / 2, 430, { n: 28, speed: 240, life: .7, size: 4, color: ['#ffd34a', '#7dff9a', '#ffffff'], gravity: 260 }).pop(W / 2, 340, `+${pat.length}`, { color: '#7dff9a', size: 24 }); haptic('success'); sfx(880, .2, 'triangle', .06, 300); }
    else { lives--; verdict = 'OFF BEAT'; feel.juice.shake(7).flash('#ff4040', .2); haptic('error'); sfx(140, .3, 'square', .05, -40); }
  }
  return {
    reset() { stopMic(); mic = null; asked = false; score = 0; lives = 3; t = 0; avg = 0; cool = 0; pulses = []; rounds = 0; feel.clear(); newPattern(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; cool -= dt; for (const p of pulses) p.l -= dt; pulses = pulses.filter(p => p.l > 0);
      if (!asked) { asked = true; startMic().then(m => { mic = m; }); }
      if (mic) { const lv = mic.level(); if (lv > avg + .35 && lv > .4 && cool <= 0) { cool = .12; clap('mic'); } avg = approach(avg, lv, 4, dt); }
      if (phase === 'listen') {
        timer += dt;
        while (played < pat.length && timer >= pat[played] * STEP) { played++; sfx(180, .1, 'square', .06, -100); sfx(2400, .03, 'sawtooth', .02, -1800); haptic('medium'); pulses.push({ l: .3, src: 'demo' }); }
        if (timer > pat[pat.length - 1] * STEP + .6) { phase = 'play'; timer = 0; input = []; }
      } else if (phase === 'play') {
        timer += dt; const lim = input.length ? (pat[pat.length - 1] * STEP + 1.2) : 6;
        if ((input.length ? t - input[0] : timer) > lim) judge();
      } else if (phase === 'result') { timer -= dt; if (timer <= 0) { if (lives <= 0) { stopMic(); return api.over(); } newPattern(); } }
    },
    draw(c) {
      c.fillStyle = phase === 'play' ? '#1a2a1e' : '#1a1a2e'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.font = '400 13px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = '#fff';
      c.fillText(phase === 'listen' ? 'LISTEN…' : phase === 'play' ? 'YOUR TURN' : verdict, W / 2, 150);
      // the bar: 8 slots
      for (let s = 0; s < 8; s++) {
        const x = 40 + s * 40, on = pat.includes(s), idx = pat.indexOf(s), hit = phase === 'listen' ? idx >= 0 && idx < played : phase !== 'listen' && on;
        c.fillStyle = '#ffffff14'; c.beginPath(); c.arc(x, 260, 15, 0, 7); c.fill();
        if (on && hit) { c.fillStyle = '#ffd34a'; c.beginPath(); c.arc(x, 260, 12, 0, 7); c.fill(); }
      }
      if (input.length) { const t0 = input[0]; for (const it of input) { const x = 40 + (it - t0) / STEP * 40; c.strokeStyle = '#7dff9a'; c.lineWidth = 3; c.beginPath(); c.arc(x, 300, 8, 0, 7); c.stroke(); } }
      // big hands
      const p = pulses.length ? Math.max(...pulses.map(q => q.l)) / .3 : 0;
      c.save(); c.translate(W / 2, 430); c.scale(1 + p * .15, 1 + p * .15);
      c.fillStyle = '#f2c79a'; c.beginPath(); c.ellipse(-26 + (1 - p) * -10, 0, 30, 46, -.3, 0, 7); c.fill(); c.beginPath(); c.ellipse(26 + (1 - p) * 10, 0, 30, 46, .3, 0, 7); c.fill();
      if (p > .3) { c.strokeStyle = '#ffd34a'; c.lineWidth = 4; for (let i = 0; i < 6; i++) { const a = -1.57 + (i - 2.5) * .45; c.beginPath(); c.moveTo(Math.cos(a) * 64, Math.sin(a) * 64); c.lineTo(Math.cos(a) * 84, Math.sin(a) * 84); c.stroke(); } }
      c.restore();
      feel.end(c, W, H);
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffaa'; c.fillText('LIVES', 12, 22);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#ff6b8a' : '#ffffff20'; c.beginPath(); c.arc(20 + i * 16, 36, 6, 0, 7); c.fill(); }
      c.fillStyle = '#ffffff88'; c.font = '500 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(mic ? 'clap it back, or tap the screen' : 'tap it back (allow the mic to clap)', W / 2, 590);
    },
    down() { clap('tap'); },
    key(k, d) { if (d && k === ' ') clap('tap'); },
  };
}

export default {
  id: 'clap-beat', title: 'Clap Back', tag: 'Casual · Mic', retro: false, w: W, h: H, goal: 25,
  hint: 'Listen to the beat, then clap it back (your phone hears real claps) or tap it. Your first clap sets the timing. Three off-beat tries and you are out.',
  make,
};
