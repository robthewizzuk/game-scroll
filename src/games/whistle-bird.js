// Whistle Bird: a songbird flies wherever your note is. Hum low to fly low, whistle high to fly high,
// and go quiet to glide down. Thread the gaps in the hedges and sing through the music rings.
// No mic, or rather not sing? Hold and drag up and down instead.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { Feel } = gs.effects;
const { startMic, stopMic, haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp, rnd } = gs.util;
const { approach } = gs.juice;
const { icon } = gs.icons;

let W = 360, H = 640;

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel();
  let mic, asked, bird, hedges, rings, cam, nextX, score, lives, t, finger, inv, lo, hi, heard, flap;
  const TOP = 70, BOT = () => H - 70;

  function more() {
    while (nextX < cam + W * 1.6) {
      const gap = Math.max(150, 230 - score * 3), gy = rnd(TOP + gap / 2 + 10, BOT() - gap / 2 - 10);
      hedges.push({ x: nextX, gy, gap, w: 44 });
      if (Math.random() < .7) rings.push({ x: nextX + rnd(90, 140), y: rnd(TOP + 40, BOT() - 40), got: false });
      nextX += rnd(230, 290);
    }
  }

  return {
    reset() { stopMic(); mic = null; asked = false; bird = { x: 80, y: H / 2, vy: 0 }; hedges = []; rings = []; cam = 0; nextX = 420; score = 0; lives = 3; t = 0; finger = null; inv = 0; lo = 52; hi = 76; heard = 0; flap = 0; ready.reset(); more(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      if (!asked) { asked = true; startMic().then(m => { mic = m; }); }
      t += dt; inv = Math.max(0, inv - dt);
      // where the bird wants to be: your note, your finger, or gliding down
      let want = null;
      const p = mic && !finger ? mic.pitch() : null;
      if (p && p.clarity > .6 && p.hz > 80) {
        heard = .3; ready.go();
        // the range stretches to fit your voice
        lo = Math.min(lo, p.midi + 1); hi = Math.max(hi, p.midi - 1);
        want = BOT() - (clamp((p.midi - lo) / Math.max(8, hi - lo), 0, 1)) * (BOT() - TOP);
      } else heard = Math.max(0, heard - dt);
      if (finger != null) { want = finger; ready.go(); }
      if (!ready.playing) { bird.y = H / 2 + Math.sin(t * 3) * 10; return; }
      if (want != null) { bird.y = approach(bird.y, want, 380, dt); bird.vy = 0; flap += dt * 14; }
      else if (!heard) { bird.vy = Math.min(140, bird.vy + 200 * dt); bird.y += bird.vy * dt; flap += dt * 4; }
      bird.y = clamp(bird.y, TOP, BOT());
      bird.x += (120 + Math.min(80, t * 2)) * dt; cam = bird.x - 80;
      for (const h of hedges) {
        if (!h.passed && bird.x > h.x + h.w) { h.passed = true; score++; api.score(score); sfx(660, .05, 'triangle', .03); }
        if (!inv && bird.x + 12 > h.x && bird.x - 12 < h.x + h.w && Math.abs(bird.y - h.gy) > h.gap / 2 - 10) {
          lives--; inv = 1.5; feel.hurt(bird.x - cam, bird.y); haptic('error');
          if (lives <= 0) { feel.lose(); stopMic(); return api.over(); }
        }
      }
      for (const r of rings) if (!r.got && Math.hypot(r.x - bird.x, r.y - bird.y) < 26) { r.got = true; score += 2; api.score(score); notes('G5 C6', { len: .06 }); feel.coin(r.x - cam, r.y); haptic('light'); }
      hedges = hedges.filter(h => h.x + h.w > cam - 20); rings = rings.filter(r => r.x > cam - 20);
      if (bird.y >= BOT() && !inv) { lives--; inv = 1.5; bird.vy = -200; feel.hurt(bird.x - cam, bird.y); haptic('error'); if (lives <= 0) { feel.lose(); stopMic(); return api.over(); } }
      more();
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#bde0fe'); g.addColorStop(1, '#ffafcc'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffffa0'; for (let i = 0; i < 6; i++) { const x = ((i * 90 - cam * .3) % (W + 120) + W + 120) % (W + 120) - 60, y = 110 + (i * 67) % 200; c.beginPath(); c.arc(x, y, 18, 0, 7); c.arc(x + 20, y - 8, 22, 0, 7); c.arc(x + 42, y, 16, 0, 7); c.fill(); }
      c.fillStyle = '#80b918'; c.fillRect(0, BOT() + 14, W, H);
      feel.begin(c);
      c.save(); c.translate(-cam, 0);
      for (const h of hedges) {
        c.fillStyle = '#2b9348';
        c.beginPath(); c.roundRect(h.x, -20, h.w, h.gy - h.gap / 2 + 20, 14); c.fill();
        c.beginPath(); c.roundRect(h.x, h.gy + h.gap / 2, h.w, H, 14); c.fill();
        c.fillStyle = '#55a630'; for (let y = h.gy + h.gap / 2 + 12; y < H; y += 22) c.fillRect(h.x + 8, y, 6, 6); for (let y = h.gy - h.gap / 2 - 18; y > 0; y -= 22) c.fillRect(h.x + 26, y, 6, 6);
      }
      for (const r of rings) if (!r.got) { c.strokeStyle = '#ffd60a'; c.lineWidth = 4; c.beginPath(); c.arc(r.x, r.y, 18, 0, 7); c.stroke(); icon(c, 'music', r.x, r.y, 18, { color: '#ffd60a' }); }
      // the bird
      if (!inv || Math.floor(t * 12) % 2) {
        const x = bird.x, y = bird.y, wing = Math.sin(flap) * 8;
        c.fillStyle = '#ff006e'; c.beginPath(); c.ellipse(x, y, 16, 12, 0, 0, 7); c.fill();
        c.fillStyle = '#fb5607'; c.beginPath(); c.moveTo(x + 14, y - 2); c.lineTo(x + 24, y + 1); c.lineTo(x + 14, y + 4); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 7, y - 4, 4, 0, 7); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(x + 8, y - 4, 2, 0, 7); c.fill();
        c.fillStyle = '#c9184a'; c.beginPath(); c.ellipse(x - 4, y + wing * .3, 10, 5, -.4 + wing * .04, 0, 7); c.fill();
        if (heard) icon(c, 'musical-notes', x + 20, y - 23 - Math.sin(t * 8) * 3, 16, { color: '#7209b7' });
      }
      c.restore();
      feel.end(c, W, H);
      c.textAlign = 'left'; for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#ff006e' : '#ffffff70'; c.beginPath(); c.arc(22 + i * 22, H - 28, 7, 0, 7); c.fill(); }
      if (!ready.playing || t < 4) { c.textAlign = 'center'; c.fillStyle = '#3a0ca3'; c.font = '700 17px Rubik, sans-serif'; c.fillText(mic ? 'Hum low, whistle high!' : 'Hold and drag to fly', W / 2, H * .82); c.font = '500 14px Rubik, sans-serif'; c.fillText(mic ? 'Or hold and drag up and down' : 'Fly through the gaps', W / 2, H * .82 + 22); }
    },
    down(x, y) { finger = clamp(y, TOP, BOT()); },
    move(x, y, pr) { if (pr && finger != null) finger = clamp(y, TOP, BOT()); },
    up() { finger = null; },
    key(k, d) { if (k === 'ArrowUp') finger = d ? TOP : null; if (k === 'ArrowDown') finger = d ? BOT() : null; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'whistle-bird',
  title: 'Whistle Bird',
  tag: 'Casual · Voice',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'The bird flies at the height of your note: hum low, whistle high, go quiet to glide down. Or hold and drag. Fly through the hedge gaps.',
  make,
};
