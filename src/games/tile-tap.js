// Tile Tap: glass tiles in three colours (each with its own shape) slide down four lanes. The lamp at the
// bottom shows which kind is wanted: tap those before they reach the floor, and let the others fall and
// smash. Every few taps the lamp blinks and turns to another kind. Gold tiles are always wanted. Tapping
// the wrong kind, or letting a wanted tile land, costs a heart. Each good tap plays the next note of a tune.
import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

const W = 360, H = 640, COLS = 4, CW = W / COLS, TH = 96, FLOOR = H - 130;
const KINDS = [
  { name: 'teal', top: '#5ff0d8', bot: '#1c9a8f', glow: '#5ff0d8', shape: 'circle' },
  { name: 'amber', top: '#ffd36a', bot: '#d9822b', glow: '#ffc24a', shape: 'triangle' },
  { name: 'rose', top: '#ff8fb8', bot: '#c93c76', glow: '#ff7aa8', shape: 'square' },
];
const GOLD = { name: 'gold', top: '#fff3b0', bot: '#e0a400', glow: '#ffe066', shape: 'star' };
// a little tune, one note a good tap (C major, played on and on)
const TUNE = [523, 587, 659, 523, 659, 698, 784, 698, 659, 587, 523, 587, 659, 659, 587, 523];

function shape(c, s, x, y, r) {
  c.beginPath();
  if (s === 'circle') c.arc(x, y, r, 0, 7);
  else if (s === 'triangle') { c.moveTo(x, y - r); c.lineTo(x + r * .95, y + r * .75); c.lineTo(x - r * .95, y + r * .75); c.closePath(); }
  else if (s === 'square') c.rect(x - r * .8, y - r * .8, r * 1.6, r * 1.6);
  else for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.fill();
}

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ text: 'Tap the kind the lamp shows' });
  const K = gs.tweak('Feel', {
    fall: [170, 80, 320, 'how fast tiles fall at the start (units a second)'],
    faster: [3.2, 0, 10, 'how much faster they fall each second'],
    gap: [.62, .3, 1.2, 'seconds between tiles at the start'],
    tightest: [.26, .12, .6, 'seconds between tiles when it is hardest'],
    ramp: [70, 20, 160, 'seconds until tiles come as often as they get'],
    turnEvery: [8, 4, 16, 1, 'good taps before the lamp turns'],
    want: [.45, .2, .8, 'share of tiles that are the wanted kind'],
    lives: [3, 1, 6, 1, 'hearts'],
  });
  let tiles, want, next, blink, taps, score, combo, hearts, t, spawn, note, dead, lastLane;

  function add() {
    const free = [0, 1, 2, 3].filter(l => l !== lastLane && !tiles.some(q => q.lane === l && !q.hit && !q.smash && q.y < TH * .4));   // never stack a tile on one still coming in
    if (!free.length) return false;
    const lane = free[Math.random() * free.length | 0]; lastLane = lane;
    const r = Math.random();
    const kind = r < .05 ? GOLD : r < .05 + K.want ? KINDS[want] : KINDS[(want + 1 + (Math.random() * 2 | 0)) % 3];
    tiles.push({ lane, y: -TH, kind, hit: 0, smash: 0 }); return true;
  }
  function turn() {
    want = next; next = (want + 1 + (Math.random() * 2 | 0)) % 3; taps = 0; blink = 0;
    sfx(392, .12, 'triangle', .05, 200); haptic('medium');
    feel.juice.flash(KINDS[want].glow, .12);
  }
  function lose(x, y, why) {
    hearts--; combo = 0; haptic('error'); sfx(130, .35, 'sawtooth', .05, -60); feel.juice.shake(7);
    feel.juice.pop(x, y - 30, why, { color: '#ff6b8a', size: 18 });
    if (hearts <= 0) api.over();
  }

  return {
    reset() {
      tiles = []; want = Math.random() * 3 | 0; next = (want + 1) % 3; blink = 0; taps = 0; score = 0; combo = 0; hearts = K.lives;
      t = 0; spawn = .2; note = 0; dead = 0; lastLane = -1; feel.clear(); ready.reset();
      for (let i = 0; i < 3; i++) { add(); tiles[i].y = -TH - i * 150; lastLane = -1; }
    },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; spawn -= dt;
      if (spawn <= 0 && add()) { spawn = Math.max(K.tightest, K.gap - (K.gap - K.tightest) * t / K.ramp) * (.75 + Math.random() * .5); }
      if (taps >= K.turnEvery - 2 && !blink) blink = .001;   // the lamp starts blinking two taps before it turns
      if (blink) blink += dt;
      const v = K.fall + t * K.faster;
      for (const tl of tiles) {
        if (tl.hit) { tl.hit += dt; continue; }
        if (tl.smash) { tl.smash += dt; continue; }
        tl.y += v * dt;
        if (tl.y + TH > FLOOR) {
          const x = tl.lane * CW + CW / 2;
          if (tl.kind === KINDS[want] || tl.kind === GOLD) { tl.smash = .001; lose(x, FLOOR, 'MISSED'); if (hearts <= 0) return; }
          else { tl.smash = .001; sfx(240 + Math.random() * 80, .06, 'square', .015, -200); feel.juice.burst(x, FLOOR, { n: 8, speed: 140, angle: -Math.PI / 2, arc: 2.4, life: .4, size: 4, gravity: 900, color: [tl.kind.top, tl.kind.bot] }); }
        }
      }
      tiles = tiles.filter(tl => (!tl.hit || tl.hit < .25) && (!tl.smash || tl.smash < .2));
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16142b'); g.addColorStop(1, '#2a1f45'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (let i = 1; i < COLS; i++) { c.fillStyle = '#ffffff10'; c.fillRect(i * CW - 1, 0, 2, FLOOR); }
      const k = KINDS[want], on = !blink || (blink * 8 | 0) % 2 === 0;
      // the wanted kind's glow down the lanes
      c.fillStyle = (on ? k.glow : KINDS[next].glow) + '12'; c.fillRect(0, 0, W, FLOOR);
      feel.begin(c);
      for (const tl of tiles) {
        const x = tl.lane * CW + 8, w = CW - 16, sc = tl.hit ? 1 + tl.hit * 1.6 : 1, a = tl.hit ? Math.max(0, 1 - tl.hit * 4) : tl.smash ? Math.max(0, 1 - tl.smash * 5) : 1;
        c.save(); c.globalAlpha = a; c.translate(x + w / 2, tl.y + TH / 2); c.scale(sc, sc);
        const tg = c.createLinearGradient(0, -TH / 2, 0, TH / 2); tg.addColorStop(0, tl.kind.top); tg.addColorStop(1, tl.kind.bot);
        c.fillStyle = tg; c.beginPath(); c.roundRect(-w / 2, -TH / 2 + 4, w, TH - 8, 12); c.fill();
        c.fillStyle = '#ffffff40'; c.beginPath(); c.roundRect(-w / 2 + 6, -TH / 2 + 10, w - 12, 10, 5); c.fill();
        c.fillStyle = '#ffffffd0'; shape(c, tl.kind.shape, 0, 6, 15);
        c.restore();
      }
      feel.end(c, W, H);
      // the floor and the lamp
      c.fillStyle = '#0d0b1a'; c.fillRect(0, FLOOR, W, H - FLOOR); c.fillStyle = '#ffffff25'; c.fillRect(0, FLOOR, W, 3);
      const lk = on ? k : KINDS[next], ly = FLOOR + 62;
      const lg = c.createRadialGradient(W / 2, ly, 4, W / 2, ly, 58); lg.addColorStop(0, lk.glow + 'aa'); lg.addColorStop(1, lk.glow + '00'); c.fillStyle = lg; c.fillRect(W / 2 - 60, ly - 60, 120, 120);
      c.fillStyle = '#2b2440'; c.beginPath(); c.arc(W / 2, ly, 30, 0, 7); c.fill();
      c.fillStyle = lk.top; shape(c, lk.shape, W / 2, ly, 18);
      c.fillStyle = '#ffffffa0'; c.font = '500 13px Rubik, sans-serif'; c.textAlign = 'center';
      c.fillText(blink ? 'changing…' : `tap ${k.name}`, W / 2, ly + 50);
      // gold always counts: a small reminder, then the turn dots and hearts
      for (let i = 0; i < K.turnEvery; i++) { c.fillStyle = i < taps ? lk.top : '#ffffff25'; c.beginPath(); c.arc(W / 2 - (K.turnEvery - 1) * 7 + i * 14, FLOOR + 18, 4, 0, 7); c.fill(); }
      for (let i = 0; i < K.lives; i++) { c.fillStyle = i < hearts ? '#ff6b8a' : '#ffffff25'; const hx = 22 + i * 24, hy = ly; c.beginPath(); c.arc(hx - 4, hy - 2, 5, 0, 7); c.arc(hx + 4, hy - 2, 5, 0, 7); c.fill(); c.beginPath(); c.moveTo(hx - 9, hy); c.lineTo(hx, hy + 10); c.lineTo(hx + 9, hy); c.fill(); }
      if (combo >= 10) { c.fillStyle = '#ffe066'; c.font = '600 15px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText(`streak ${combo}`, W - 16, ly + 5); }
      ready.draw(c, W, H, { y: 300 });
    },
    down(x, y) {
      if (ready.go()) return;
      const lane = Math.min(COLS - 1, Math.max(0, x / CW | 0));
      const tl = tiles.filter(q => !q.hit && !q.smash && q.lane === lane && y >= q.y - 14 && y <= q.y + TH + 14).sort((a, b) => b.y - a.y)[0];
      if (!tl) return;   // empty glass: nothing happens
      const cx = lane * CW + CW / 2, cy = tl.y + TH / 2;
      if (tl.kind === KINDS[want] || tl.kind === GOLD) {
        tl.hit = .001; combo++;
        const pts = (tl.kind === GOLD ? 3 : 1) + Math.floor(combo / 10); score += pts; api.score(score);
        if (tl.kind !== GOLD) taps++;
        sfx(TUNE[note++ % TUNE.length], .14, 'triangle', .06); haptic('light');
        feel.juice.burst(cx, cy, { n: 12, speed: 200, life: .4, size: 4, color: [tl.kind.top, '#ffffff'] });
        if (pts > 1) feel.juice.pop(cx, cy - 40, `+${pts}`, { color: tl.kind.top, size: 18 });
        if (taps >= K.turnEvery) turn();
      } else { tl.smash = .001; feel.juice.burst(cx, cy, { n: 10, speed: 160, life: .4, size: 4, color: [tl.kind.top, tl.kind.bot] }); lose(cx, cy, 'WRONG'); }
    },
    key(k, d) {
      if (!d) return; if (ready.go()) return;
      const lane = { '1': 0, '2': 1, '3': 2, '4': 3, d: 0, f: 1, j: 2, k: 3 }[k]; if (lane == null) return;
      const tl = tiles.filter(q => !q.hit && !q.smash && q.lane === lane).sort((a, b) => b.y - a.y)[0];
      if (tl) this.down(lane * CW + CW / 2, tl.y + TH / 2);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'tile-tap', title: 'Tile Tap', tag: 'Casual · Rhythm', retro: false, w: W, h: H,
  hint: 'Tap only the tiles the lamp at the bottom shows, and let the others fall and smash. The lamp blinks, then turns to another kind. Gold is always good. A wrong tap or a missed tile costs a heart.',
  goal: 100,
  make,
};
