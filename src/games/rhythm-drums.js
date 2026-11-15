import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

// Three drum pads, notes fall to the line, tap the pad in time. The beat is built from short
// patterns that get busier and faster. Misses drain the groove meter; hits refill it.
const W = 360, H = 640, HITY = 520, LANES = 3, LW = W / LANES, SPEED = 340;
const COLS = ['#ff5a7a', '#ffd34a', '#4ad3ff'], NAMES = ['KICK', 'SNARE', 'HAT'];
// One bar = 8 steps; digits per lane: K S H
const PATTERNS = [
  ['K.H.', 'S...'], ['K.H.', 'S.H.'], ['K..K', 'S...'], ['KHKH', 'SHSH'], ['K.HK', '.SH.'], ['KK.H', 'S.HS'], ['K.S.', 'K.S.'], ['HHHH', 'KSKS'],
];
function play(lane) {
  if (lane === 0) sfx(110, .12, 'sine', .12, -70);
  else if (lane === 1) { sfx(220, .08, 'square', .05, -120); sfx(1400, .05, 'sawtooth', .02, -600); }
  else sfx(3000, .025, 'square', .02);
}

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the drums are the sound
  const ready = new Ready({ eat: false });                // the beat waits for the first tap
  let notes, beat, bpm, score, combo, groove, t, flash, songT, bars;
  function addBar() {
    const lvl = Math.min(PATTERNS.length, 2 + Math.floor(bars / 2)), p = PATTERNS[Math.random() * lvl | 0];
    const steps = (p[0] + p[1]).split(''), stepT = 60 / bpm / 2;
    steps.forEach((ch, i) => { if (ch === '.') return; notes.push({ lane: 'KSH'.indexOf(ch), at: songT + i * stepT, hit: false, miss: false }); });
    songT += steps.length * stepT; bars++; bpm = Math.min(150, bpm + 2);
  }
  return {
    reset() { notes = []; bpm = 92; score = 0; combo = 0; groove = 1; t = -1.5; flash = [0, 0, 0]; songT = 0; bars = 0; feel.clear(); ready.reset(); addBar(); addBar(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); for (let i = 0; i < 3; i++) flash[i] = Math.max(0, flash[i] - dt * 5);
      if (!ready.update(dt)) return;
      t += dt;
      while (songT - t < 3) addBar();
      for (const n of notes) if (!n.hit && !n.miss && t - n.at > .16) { n.miss = true; combo = 0; groove -= .16; haptic('warning'); feel.juice.pop((n.lane + .5) * LW, HITY - 30, 'MISS', { color: '#ff6060', size: 11, font: '"Press Start 2P", monospace', life: .6, rise: 18 }); }
      notes = notes.filter(n => t - n.at < 1);
      if (groove <= 0) { groove = 0; haptic('error'); feel.juice.shake(7); return api.over(); }
    },
    draw(c) {
      c.fillStyle = '#140f24'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < LANES; i++) {
        c.fillStyle = i % 2 ? '#1c1631' : '#181229'; c.fillRect(i * LW, 0, LW, H);
        c.fillStyle = COLS[i] + Math.round(20 + flash[i] * 80).toString(16).padStart(2, '0'); c.fillRect(i * LW, 0, LW, H);
      }
      // beat lines
      const beatT = 60 / bpm; c.fillStyle = '#ffffff10';
      for (let b = Math.ceil(t / beatT); b * beatT < t + 1.6; b++) { const y = HITY - (b * beatT - t) * SPEED; c.fillRect(0, y, W, 1); }
      feel.begin(c);
      c.fillStyle = '#ffffffcc'; c.fillRect(0, HITY - 2, W, 4);
      for (const n of notes) {
        if (n.hit) continue; const y = HITY - (n.at - t) * SPEED; if (y < -20 || y > H) continue;
        c.globalAlpha = n.miss ? .3 : 1; c.fillStyle = COLS[n.lane]; c.beginPath(); c.roundRect(n.lane * LW + 14, y - 12, LW - 28, 24, 12); c.fill(); c.globalAlpha = 1;
      }
      for (let i = 0; i < LANES; i++) {
        const cx = (i + .5) * LW, r = 44 + flash[i] * 6;
        c.fillStyle = '#ffffff10'; c.beginPath(); c.arc(cx, 585, r, 0, 7); c.fill();
        c.strokeStyle = COLS[i]; c.lineWidth = 4; c.beginPath(); c.arc(cx, 585, r - 4, 0, 7); c.stroke();
        c.fillStyle = COLS[i]; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(NAMES[i], cx, 589);
      }
      feel.end(c, W, H);
      // groove meter top-left
      c.fillStyle = '#ffffff22'; c.fillRect(12, 14, 100, 8); c.fillStyle = groove > .3 ? '#7dff9a' : '#ff6060'; c.fillRect(12, 14, 100 * groove, 8);
      if (combo > 4) { c.fillStyle = '#ffd34a'; c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'right'; c.fillText(`x${combo}`, W - 12, 22); }
      if (t < 1) { c.fillStyle = '#ffffffcc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap the pad as notes cross the line', W / 2, 300); }
      ready.draw(c, W, H, { text: 'Tap a pad to start', y: 350 });
    },
    down(x) { ready.go(); hit(clamp(Math.floor(x / LW), 0, 2)); },
    key(k, d) { if (!d) return; const i = { a: 0, s: 1, d: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 }[k]; if (i != null) { ready.go(); hit(i); } },
  };
  function hit(lane) {
    flash[lane] = 1; play(lane);
    let best = null, bd = .16;
    for (const n of notes) if (n.lane === lane && !n.hit && !n.miss && Math.abs(n.at - t) < bd) { bd = Math.abs(n.at - t); best = n; }
    if (!best) { if (t > 0) { combo = 0; groove -= .04; } return; }   // warm-up taps before the first note are free
    best.hit = true; combo++; const perfect = bd < .06;
    feel.juice.burst((lane + .5) * LW, HITY, { n: perfect ? 12 : 6, speed: perfect ? 190 : 120, life: .35, size: 3.5, color: [COLS[lane], '#ffffff'] });
    if (combo && combo % 10 === 0) feel.juice.pop(W / 2, 250, `x${1 + combo / 10} BONUS`, { color: '#ffd34a', size: 18 });
    score += (perfect ? 3 : 1) * (1 + Math.floor(combo / 10)); api.score(score); groove = Math.min(1, groove + .04);
    haptic(perfect ? 'medium' : 'light'); feel.juice.pop((lane + .5) * LW, HITY - 30, perfect ? 'PERFECT' : 'GOOD', { color: perfect ? '#ffd34a' : '#ffffff', size: 11, font: '"Press Start 2P", monospace', life: .5, rise: 15 });
  }
}

export default {
  id: 'rhythm-drums', title: 'Rhythm Drums', tag: 'Casual · Music', retro: false, w: W, h: H, goal: 150,
  hint: 'Tap kick, snare and hat as each note crosses the line. Perfect timing scores triple. Misses drain the groove meter.',
  make,
};
