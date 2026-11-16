import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;

// A hungry tyrant lizard stomps through the valley. Tap to snap your jaws at whatever is in front;
// swipe up to leap. Small grazers and darting lizards fill your belly and make you grow. Don't
// bite the spiky shell-backs, and leap over the rolling boulders. The hunger bar always drains,
// and when it's empty the hunt is over.
const PREY = {
  grazer: { w: 14, h: 10, food: 18, sp: 18, col: '#68b058', pts: 2 },
  darter: { w: 9, h: 6, food: 10, sp: 55, col: '#d0a040', pts: 3, dart: true },
  flyer: { w: 12, h: 6, food: 14, sp: 30, col: '#c06080', pts: 4, fly: true },
  spiky: { w: 18, h: 11, food: 0, sp: 10, col: '#807048', bad: true },
  rock: { w: 10, h: 10, food: 0, sp: -50, col: '#808088', rock: true },
};
let W = 192, H = 144;
const WHIFF = 3;   // belly a snap at nothing costs

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false });                              // the hunt (and the hunger) starts on the first touch
  let rex, things, cam, spawnX, hunger, eaten, score, t, parts, msg, dead, sw, bite;
  const gy = () => H - 16;
  const size = () => 1 + Math.min(1.2, eaten * .025);
  function spawn() {
    const lvl = Math.min(1, cam / 4000), r = Math.random(), x = cam + W + rnd(10, 40);
    const k = r < .34 ? 'grazer' : r < .54 ? 'darter' : r < .66 ? 'flyer' : r < .82 + lvl * .05 ? 'spiky' : 'rock';
    const P = PREY[k]; things.push({ k, ...P, x, y: P.fly ? gy() - rnd(26, 40) : gy(), vx: -P.sp * (k === 'rock' ? 1 + lvl : rnd(.6, 1)), ph: rnd(0, 6), fled: false });
  }
  function burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-80, 0), l: .45, col }); }
  function hurt(n, txt) { hunger -= n; rex.inv = 1; feel.juice.shake(3); haptic('heavy'); sfx(140, .3, 'sawtooth', .05, -60); parts.push({ txt, x: rex.x, y: gy() - 40, l: 1, col: '#f86060' }); }
  const self = {
    reset() { rex = { x: 40, y: gy(), vy: 0, air: false, inv: 0 }; things = []; cam = 0; spawnX = 0; hunger = 100; eaten = 0; score = 0; t = 0; parts = []; msg = { txt: 'TAP TO SNAP · SWIPE UP TO LEAP', l: 2.2 }; dead = 0; sw = null; bite = 0; feel.clear(); ready.reset(); },
    fx(dt) { feel.update(dt); },
    resize(w, h) { const dy = h - H; W = w; H = h; if (rex && dy) { rex.y += dy; for (const o of things) o.y += dy; } },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; bite = Math.max(0, bite - dt); for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) api.over(); return; }
      const s = size(); rex.inv = Math.max(0, rex.inv - dt);
      hunger -= dt * (4.5 + Math.min(4, cam / 1500)); if (hunger <= 0) { hunger = 0; dead = .01; msg = { txt: 'TOO HUNGRY...', l: 9 }; haptic('error'); sfx(90, .8, 'sawtooth', .05, -30); return; }
      const sp = 34 - (s - 1) * 6; rex.x += sp * dt; cam = rex.x - W * .25;
      rex.vy += 520 * dt; rex.y += rex.vy * dt; if (rex.y >= gy()) { if (rex.air) { haptic('medium'); sfx(80, .1, 'square', .05); } rex.y = gy(); rex.vy = 0; rex.air = false; }
      if (cam + W > spawnX) { spawn(); spawnX = cam + W + rnd(28, 60) - Math.min(18, cam / 400); }
      const front = rex.x + 14 * s;
      for (const o of things) {
        if (o.gone) continue; o.ph += dt;
        if (o.dart && !o.fled && o.x - front < 30) { o.vx = 70; o.fled = true; }
        o.x += o.vx * dt; if (o.fly) o.y += Math.sin(o.ph * 3) * 14 * dt;
        if (o.rock) { if (Math.abs(o.x - rex.x) < 9 * s && rex.y > gy() - 10 && rex.inv <= 0) { o.gone = true; hurt(18, 'CRUNCH!'); burst(o.x, o.y - 5, '#a0a0a8'); } }
        else if (o.bad && !o.hitMe && Math.abs(o.x - rex.x) < 10 * s && rex.inv <= 0 && !rex.air) { o.hitMe = true; hurt(8, 'OUCH!'); }
      }
      things = things.filter(o => !o.gone && o.x > cam - 40 && o.x < cam + W + 120);
      api.score(score);
    },
    draw(c) {
      const ox = -Math.round(cam), g = gy(), s = size();
      const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#f8c070'); sky.addColorStop(1, '#f8e8b0'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#d07040'; for (let i = 0; i < 4; i++) { const x = ((i * 90 - cam * .15) % (W + 90) + W + 90) % (W + 90) - 45; c.beginPath(); c.moveTo(x - 40, g); c.lineTo(x, g - 50 - (i % 2) * 14); c.lineTo(x + 40, g); c.fill(); if (i % 2) { c.fillStyle = '#f8f0e0a0'; c.beginPath(); c.arc(x, g - 70 - (t * 8 % 20), 5 + (t * 8 % 20) / 4, 0, 7); c.fill(); c.fillStyle = '#d07040'; } }
      c.fillStyle = '#48803c'; for (let i = 0; i < 6; i++) { const x = ((i * 53 - cam * .5) % (W + 53) + W + 53) % (W + 53) - 26; c.fillRect(x, g - 30, 3, 30); c.beginPath(); c.arc(x + 1, g - 32, 10, Math.PI, 0); c.fill(); }
      c.fillStyle = '#987040'; c.fillRect(0, g, W, H - g); c.fillStyle = '#78a040'; c.fillRect(0, g, W, 3);
      for (const o of things) {
        const x = Math.round(o.x + ox), y = Math.round(o.y);
        if (o.rock) { c.save(); c.translate(x, y - 5); c.rotate(-o.x / 5); c.fillStyle = o.col; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); c.fillStyle = '#606068'; c.fillRect(-2, -2, 2, 2); c.restore(); continue; }
        c.fillStyle = o.col; c.fillRect(x - o.w / 2, y - o.h, o.w, o.h * .7);
        if (o.fly) { const f = Math.sin(o.ph * 12) * 4; c.beginPath(); c.moveTo(x - 2, y - o.h + 2); c.lineTo(x - 8, y - o.h - f); c.lineTo(x + 4, y - o.h + 2); c.fill(); }
        else { c.fillRect(x - o.w / 2 + 2, y - o.h * .3, 2, o.h * .3); c.fillRect(x + o.w / 2 - 4, y - o.h * .3, 2, o.h * .3); c.fillRect(x - o.w / 2 - 4 * (o.vx < 0 ? 1 : -1) * 0 - (o.vx < 0 ? 4 : -o.w), y - o.h, 4, 4); }
        if (o.bad) { c.fillStyle = '#e0e0c8'; for (let i = 0; i < o.w; i += 4) { c.beginPath(); c.moveTo(x - o.w / 2 + i, y - o.h); c.lineTo(x - o.w / 2 + i + 2, y - o.h - 4); c.lineTo(x - o.w / 2 + i + 4, y - o.h); c.fill(); } }
        c.fillStyle = '#202020'; c.fillRect(x + (o.vx < 0 ? -o.w / 2 - 2 : o.w / 2 - 1), y - o.h + 1, 1, 1);
      }
      // the rex
      if (!(rex.inv > 0 && (t * 14 | 0) % 2)) {
        const x = Math.round(rex.x + ox), y = Math.round(rex.y), step = rex.air ? 0 : (t * 6 | 0) % 2, open = bite > 0 ? 1 : 0;
        c.save(); c.translate(x, y); c.scale(s, s);
        c.fillStyle = '#3c8c48'; c.beginPath(); c.moveTo(-18, -14); c.lineTo(-6, -18); c.lineTo(-6, -10); c.fill();
        c.fillRect(-8, -22, 16, 14); c.fillRect(-5, -8, 4, 8 - step * 2); c.fillRect(2, -8, 4, 6 + step * 2);
        c.fillRect(4, -30 - open * 2, 14, 8); c.fillStyle = '#2c6c38'; c.fillRect(4, -22 + open * 3, 13, 3);
        c.fillStyle = '#f8f8f0'; c.fillRect(10, -23 + open * 1, 6, 1); c.fillStyle = '#f8e040'; c.fillRect(13, -28 - open * 2, 2, 2); c.fillStyle = '#202020'; c.fillRect(14, -28 - open * 2, 1, 1);
        c.fillStyle = '#3c8c48'; c.fillRect(7, -15, 3, 2);
        c.restore();
      }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + ox + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x + ox, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x + ox, p.y, 2, 2); } }
      feel.end(c, W, H);
      c.fillStyle = '#00000060'; c.fillRect(0, 0, W, 12); c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText('BELLY', 4, 9);
      const bw = Math.max(20, Math.min(60, api.scoreArea().x - 46));   // the belly bar stops short of the app's score badge
      c.fillStyle = '#402818'; c.fillRect(42, 3, bw, 6); c.fillStyle = hunger < 25 && (t * 4 | 0) % 2 ? '#f84040' : '#f8a040'; c.fillRect(42, 3, bw * hunger / 100, 6);
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(String(score), W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .35 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H * .35); }
    },
    down(x, y) { ready.go(); sw = { x, y, used: false }; },
    move(x, y, p) { if (p && sw && !sw.used && sw.y - y > 18) { sw.used = true; self.leap(); } },
    up() { if (sw && !sw.used) self.snap(); sw = null; },
    leap() { if (dead || rex.air) return; rex.vy = -205; rex.air = true; sfx(300, .1, 'square', .04, 200); haptic('light'); },
    snap() {
      if (dead || bite > 0) return; bite = .25; const s = size(), reach0 = rex.x + 4 * s, reach1 = rex.x + 30 * s, top = rex.y - 34 * s;
      sfx(180, .08, 'square', .05, -60); haptic('light');
      for (const o of things) {
        if (o.gone || o.rock || o.x < reach0 - o.w / 2 || o.x > reach1 + o.w / 2 || o.y - o.h < top - 6 || o.y - o.h > rex.y) continue;
        if (o.bad) { hurt(10, 'SPIKY!'); o.gone = true; burst(o.x, o.y - 6, '#e0e0c8'); return; }
        o.gone = true; eaten++; hunger = Math.min(100, hunger + o.food); score += o.pts; api.score(score); burst(o.x, o.y - 4, o.col); parts.push({ txt: `+${o.pts}`, x: o.x, y: o.y - 14, l: .7, col: '#f8e040' }); haptic('medium'); sfx(500, .08, 'square', .05, 200); if (eaten % 10 === 0) { msg = { txt: 'BIGGER!', l: 1 }; haptic('success'); } return;
      }
      // snapping at thin air tires the jaws: it costs belly and the next snap comes slower (so snapping blindly starves you)
      hunger -= WHIFF; bite = .45; parts.push({ txt: 'SNAP', x: rex.x + 18 * s, y: rex.y - 30 * s, l: .4, col: '#c0c0b0' });
    },
    key(k, d) { if (!d) return; ready.go(); if (k === ' ') self.snap(); if (k === 'ArrowUp') self.leap(); },
  };
  return self;
}

export default {
  id: 'rex-rampage', title: 'Rex Rampage', tag: 'Advance · Dinosaur', retro: true, era: 'advance', pal: 'lemon', w: 192, h: 144, maxW: 320, maxH: 220, goal: 120,
  hint: 'Your tyrant lizard stomps forward on its own. Tap to snap at what\'s in front, swipe up to leap. Grazers, darting lizards and low flyers fill your belly and make you grow. Never bite the spiky shell-backs, and leap over rolling boulders. The belly bar keeps draining, and snapping at nothing drains it too.',
  make,
};
