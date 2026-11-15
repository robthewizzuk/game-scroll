import gs from '../gamescroll.js';
const { Timers } = gs.math;
const { sfx } = gs.sound;
const { buzz, canBuzz, haptic } = gs.device;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Feel the code. Your phone buzzes a pattern of short and long pulses: pick the matching pattern
// from four. Tap the hand to feel it again (costs time). Phones that can't vibrate flash the screen instead.
const W = 360, H = 640, SHORT = 110, LONG = 420, GAP = 260;

function make(api) {
  const timers = new Timers(), later = (fn, ms) => timers.after(ms / 1000, fn);   // game-time delays: they pause with the game
  let pat, opts, time, score, lives, t, playing, flashT, flashSeq, msg, feel, replays;
  const key = p => p.join('');
  function rand(len) { return [...Array(len)].map(() => Math.random() < .5 ? 0 : 1); }
  function next() {
    const len = Math.min(6, 2 + Math.floor(score / 3)); pat = rand(len); const set = new Set([key(pat)]); opts = [pat];
    while (opts.length < 4) { const o = Math.random() < .6 ? pat.map((v, i) => i === (Math.random() * len | 0) ? 1 - v : v) : rand(len); if (!set.has(key(o))) { set.add(key(o)); opts.push(o); } }
    opts = shuffle(opts); time = 8; replays = 0; play();
  }
  function play() {
    feel = canBuzz(); playing = buzz(pat, SHORT, LONG, GAP) / 1000 + .2; flashT = 0;
    flashSeq = []; let at = 0; for (const p of pat) { const d = (p ? LONG : SHORT) / 1000; flashSeq.push([at, at + d]); at += d + GAP / 1000; }
    if (!feel) for (const [a] of flashSeq) later(() => sfx(660, .05, 'sine', .015), a * 1000);
  }
  function pick(i) {
    if (playing > 0 || msg) return;
    if (key(opts[i]) === key(pat)) { score++; api.score(score); haptic('success'); sfx(880, .15, 'triangle', .05, 200); msg = { ok: true, l: .7, i }; }
    else { lives--; haptic('error'); sfx(140, .3, 'square', .05, -40); msg = { ok: false, l: 1.1, i }; }
  }
  return {
    reset() { timers.clear(); score = 0; lives = 3; t = 0; msg = null; next(); },
    update(dt) { timers.update(dt);
      t += dt; flashT += dt; if (playing > 0) playing -= dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) { msg = null; if (lives <= 0) return api.over(); next(); } return; }
      if (playing <= 0) { time -= dt; if (time <= 0) { lives--; haptic('error'); msg = { ok: false, l: 1, i: -1 }; } }
    },
    draw(c) {
      const on = !feel && flashSeq.some(([a, b]) => flashT >= a && flashT < b);
      c.fillStyle = on ? '#fff3c4' : '#1b1b2b'; c.fillRect(0, 0, W, H);
      // hand / phone icon
      c.save(); c.translate(W / 2, 170); const shake = playing > 0 && feel ? Math.sin(t * 90) * 3 : 0; c.translate(shake, 0);
      c.fillStyle = '#ffffff20'; c.beginPath(); c.roundRect(-40, -70, 80, 140, 14); c.fill(); c.strokeStyle = '#ffffff70'; c.lineWidth = 3; c.stroke();
      if (playing > 0) { c.strokeStyle = '#ffd34a'; for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(sd * (52 + k * 10), 0, 14 + k * 6, sd > 0 ? -.8 : Math.PI - .8, sd > 0 ? .8 : Math.PI + .8); c.stroke(); } }
      c.restore();
      c.fillStyle = on ? '#1b1b2b' : '#ffffffaa'; c.font = '500 13px Rubik, sans-serif'; c.textAlign = 'center';
      c.fillText(playing > 0 ? (feel ? 'feel it…' : 'watch the flashes…') : `tap the phone to replay · ${Math.ceil(time)}s`, W / 2, 275);
      opts.forEach((o, i) => {
        const y = 310 + i * 76, sel = msg && msg.i === i, right = msg && key(o) === key(pat);
        c.fillStyle = sel ? (msg.ok ? '#2e7d4a' : '#8a2a3a') : msg && right ? '#2e7d4a' : '#ffffff12'; c.beginPath(); c.roundRect(30, y, 300, 62, 14); c.fill();
        let x = 180 - (o.reduce((s, v) => s + (v ? 40 : 14) + 12, 0) - 12) / 2;
        for (const v of o) { c.fillStyle = '#fff'; if (v) { c.beginPath(); c.roundRect(x, y + 25, 40, 12, 6); c.fill(); x += 52; } else { c.beginPath(); c.arc(x + 7, y + 31, 7, 0, 7); c.fill(); x += 26; } }
      });
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffaa'; c.fillText('LIVES', 12, 22);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#ff6b8a' : '#ffffff20'; c.beginPath(); c.arc(20 + i * 16, 36, 6, 0, 7); c.fill(); }
    },
    down(x, y) {
      if (y > 100 && y < 250 && Math.abs(x - W / 2) < 70 && playing <= 0 && !msg) { replays++; time = Math.max(1, time - 1.5); play(); return; }
      const i = Math.floor((y - 310) / 76); if (i >= 0 && i < 4 && y - 310 - i * 76 < 62) pick(i);
    },
    key(k, d) { if (d && k === ' ') pick(opts.findIndex(o => key(o) === key(pat))); },
  };
}

export default {
  id: 'haptic-morse', title: 'Buzz Code', tag: 'Casual · Haptics', retro: false, w: W, h: H, goal: 12,
  hint: 'Your phone buzzes a pattern of short and long pulses. Pick the matching pattern. Tap the phone picture to feel it again. Three wrong picks ends it.',
  make,
};
