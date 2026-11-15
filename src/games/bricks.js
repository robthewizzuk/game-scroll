import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { approach } = gs.juice;

// Brick breaker, colour edition. Drag to slide the paddle and keep the ball in play. Silver bricks
// take extra hits and gold ones never break. Catch falling capsules: W wide paddle, M multiball,
// S slow ball, L lasers, + extra life. Clear every breakable brick to reach the next wall.
const ROWC = ['#e04848', '#f08830', '#f8c838', '#58c040', '#38b8e8', '#3858d8', '#8848c8', '#e868b8'];
const CAPS = { W: '#38b8e8', M: '#e868b8', S: '#58c040', L: '#e04848', '+': '#f8c838' };
const LAYOUTS = [
  (r, c, R, C) => true,
  (r, c, R, C) => Math.abs(c - (C - 1) / 2) <= r * .7 + .5,
  (r, c) => (r + c) % 2 === 0,
  (r, c, R, C) => Math.abs(c - (C - 1) / 2) + Math.abs(r - (R - 1) / 2) <= Math.min(C, R) / 2 + .5,
  (r, c, R, C) => r === 0 || r === R - 1 || c === 0 || c === C - 1 || (r === (R >> 1) && c % 3 !== 1),
  (r, c, R, C) => c % 3 !== 2 || r % 2 === 0,
];
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false });                              // the first serve waits for the first touch
  let px, tx, pw, balls, bricks, caps, lasers, score, level, lives, wait, t, eff, msg;
  const PY = () => H - 14;
  function build() {
    const C = Math.floor((W - 4) / 16), R = Math.min(9, 5 + (level >> 1)), ox = (W - C * 16) / 2 + .5, lay = LAYOUTS[(level - 1) % LAYOUTS.length];
    bricks = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (!lay(r, c, R, C)) continue;
      let hp = 1, gold = false; if (level > 1 && r === 0) hp = 2; if (level > 2 && Math.random() < .08 + level * .01) hp = 3; if (level > 3 && Math.random() < .05 && r > 1) gold = true;
      bricks.push({ x: ox + c * 16, y: 22 + r * 8, w: 15, h: 7, hp, gold, col: ROWC[r % ROWC.length] });
    }
  }
  function serve() { balls = [{ x: px, y: PY() - 3, vx: 0, vy: 0, stuck: true }]; wait = .8; }
  const speed = () => Math.min(185, 100 + level * 7) * (eff.S > 0 ? .7 : 1);
  function launch(b) { const a = rnd(-.45, .45), s = speed(); b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s; b.stuck = false; }
  function hitBrick(k, i) {
    if (k.gold) { sfx(1200, .03, 'square', .03); return; }
    k.hp--; if (k.hp > 0) { sfx(900, .04, 'square', .04); k.flash = .1; return; }
    bricks.splice(i, 1); score += 1; api.score(score); haptic('tick'); sfx(500 + (k.y - 22) * 8, .05, 'square', .04);
    feel.juice.burst(k.x + 7, k.y + 3, { n: 5, speed: 45, life: .4, size: 2, color: [k.col, '#f8f8f0'] });
    if (Math.random() < .13) { const keys = Object.keys(CAPS); caps.push({ x: k.x + 7, y: k.y + 3, k: keys[Math.random() * keys.length | 0] }); }
  }
  function collide(b) {
    for (let i = 0; i < bricks.length; i++) { const k = bricks[i];
      if (b.x + 1.5 > k.x && b.x - 1.5 < k.x + k.w && b.y + 1.5 > k.y && b.y - 1.5 < k.y + k.h) {
        const ox = Math.min(b.x + 1.5 - k.x, k.x + k.w - (b.x - 1.5)), oy = Math.min(b.y + 1.5 - k.y, k.y + k.h - (b.y - 1.5));
        if (ox < oy) { b.vx = -b.vx; b.x += b.vx > 0 ? ox : -ox; } else { b.vy = -b.vy; b.y += b.vy > 0 ? oy : -oy; }
        hitBrick(k, i); return; } }
  }
  const self = {
    reset() { W = W || 160; px = tx = W / 2; pw = 30; score = 0; level = 1; lives = 3; t = 0; eff = { W: 0, S: 0, L: 0 }; caps = []; lasers = []; msg = null; feel.clear(); ready.reset(); build(); serve(); },
    fx(dt) { feel.update(dt); },
    resize(w, h) { const ow = W, oh = H; W = w; H = h; if (bricks) { const dx = (w - ow) / 2; if (dx) { build(); } for (const b of balls) { b.x += dx; b.y += h - oh; } px = tx = clamp(px + dx, 0, w); } },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      for (const k in eff) eff[k] = Math.max(0, eff[k] - dt);
      pw += ((eff.W > 0 ? 46 : 30) - pw) * Math.min(1, dt * 8);
      px = approach(px, tx, 27, dt); px = clamp(px, pw / 2, W - pw / 2);
      for (const k of bricks) if (k.flash) k.flash = Math.max(0, k.flash - dt);
      if (eff.L > 0 && (t * 4 | 0) !== ((t - dt) * 4 | 0)) { lasers.push({ x: px - pw / 2 + 3, y: PY() }, { x: px + pw / 2 - 3, y: PY() }); sfx(1600, .03, 'square', .02, -800); }
      for (const l of lasers) { l.y -= 240 * dt; for (let i = 0; i < bricks.length; i++) { const k = bricks[i]; if (l.x > k.x && l.x < k.x + k.w && l.y > k.y && l.y < k.y + k.h) { l.dead = true; hitBrick(k, i); break; } } }
      lasers = lasers.filter(l => !l.dead && l.y > 0);
      for (const c of caps) { c.y += 45 * dt; if (c.y > PY() - 3 && c.y < PY() + 5 && Math.abs(c.x - px) < pw / 2 + 4) { c.got = true; haptic('success'); sfx(800, .15, 'triangle', .05, 400);
        if (c.k === 'M') { const src = balls.find(b => !b.stuck) || balls[0]; for (const a of [-.5, .5]) { const s = speed(); balls.push({ x: src.x, y: src.y, vx: Math.sin(a) * s, vy: -Math.cos(a) * s }); } }
        else if (c.k === '+') lives = Math.min(5, lives + 1); else eff[c.k] = 10;
        msg = { txt: { W: 'WIDE PADDLE', M: 'MULTIBALL', S: 'SLOW BALL', L: 'LASERS', '+': '1 UP' }[c.k], l: 1 }; } }
      caps = caps.filter(c => !c.got && c.y < H + 6);
      if (wait > 0) { wait -= dt; for (const b of balls) if (b.stuck) { b.x = px; b.y = PY() - 3; } if (wait <= 0) for (const b of balls) if (b.stuck) launch(b); return; }
      for (const b of balls) {
        const n = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 1.5), h = dt / n;
        for (let s = 0; s < n && !b.out; s++) {
          b.x += b.vx * h; b.y += b.vy * h;
          if (b.x < 1.5) { b.x = 1.5; b.vx = Math.abs(b.vx); } if (b.x > W - 1.5) { b.x = W - 1.5; b.vx = -Math.abs(b.vx); } if (b.y < 12) { b.y = 12; b.vy = Math.abs(b.vy); }
          const py = PY();
          if (b.vy > 0 && b.y + 1.5 >= py && b.y - 1.5 <= py + 4 && b.x >= px - pw / 2 - 2 && b.x <= px + pw / 2 + 2) { const a = clamp((b.x - px) / (pw / 2), -1, 1) * 1.05, sp = Math.max(speed(), Math.min(240, Math.hypot(b.vx, b.vy) * (eff.S > 0 ? .9 : 1.01))); b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; b.y = py - 1.5; sfx(520, .04, 'square', .04); haptic('light'); }
          collide(b);
          if (b.y > H + 4) b.out = true;
        }
      }
      balls = balls.filter(b => !b.out);
      if (!balls.length) { lives--; haptic('error'); sfx(160, .4, 'square', .05, -80); feel.juice.shake(4); eff = { W: 0, S: 0, L: 0 }; caps = []; if (lives <= 0) return api.over(); msg = { txt: `${lives} LEFT`, l: 1 }; serve(); return; }
      if (!bricks.some(k => !k.gold)) { api.win(); level++; score += 5; api.score(score); msg = { txt: `WALL ${level}`, l: 1.4 }; haptic('success'); sfx(990, .3, 'square', .05, 500); caps = []; lasers = []; feel.juice.burst(W / 2, H * .4, { n: 24, speed: 90, life: .7, size: 2, color: ROWC }).pop(W / 2, H * .5, '+5', { color: '#f8d838', size: 8 }); build(); serve(); }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#182048'); g.addColorStop(1, '#301838'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff10'; for (let y = 0; y < H; y += 8) for (let x = (y / 8 % 2) * 8; x < W; x += 16) c.fillRect(x, y, 8, 8);
      feel.begin(c);
      for (const k of bricks) {
        const x = Math.round(k.x), y = k.y;
        if (k.gold) { c.fillStyle = '#a07810'; c.fillRect(x, y, k.w, k.h); c.fillStyle = '#f8d838'; c.fillRect(x, y, k.w - 1, k.h - 1); c.fillStyle = '#fff0a0'; c.fillRect(x + 1, y + 1, 4, 1); continue; }
        const col = k.flash ? '#f8f8f0' : k.hp >= 2 ? (k.hp === 3 ? '#9898b0' : '#c8c8d8') : k.col;
        c.fillStyle = '#00000060'; c.fillRect(x + 1, y + 1, k.w, k.h); c.fillStyle = col; c.fillRect(x, y, k.w, k.h); c.fillStyle = '#ffffff70'; c.fillRect(x, y, k.w, 1); c.fillStyle = '#00000040'; c.fillRect(x, y + k.h - 1, k.w, 1);
      }
      for (const cp of caps) { c.fillStyle = CAPS[cp.k]; c.fillRect(cp.x - 6, cp.y - 3, 12, 6); c.fillStyle = '#f8f8f0'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(cp.k, cp.x + .5, cp.y + 3); }
      c.fillStyle = '#f86040'; for (const l of lasers) c.fillRect(l.x | 0, l.y | 0, 1, 4);
      const py = PY(), x0 = Math.round(px - pw / 2), w = Math.round(pw);
      c.fillStyle = '#e8e8f0'; c.fillRect(x0, py, w, 4); c.fillStyle = eff.L > 0 ? '#e04848' : '#38b8e8'; c.fillRect(x0 + 3, py + 1, w - 6, 2); c.fillStyle = '#9898b0'; c.fillRect(x0, py + 3, w, 1);
      for (const b of balls) { c.fillStyle = '#f8f8f0'; c.fillRect(Math.round(b.x - 1.5), Math.round(b.y - 1.5), 3, 3); }
      feel.end(c, W, H);
      for (let i = 0; i < lives - 1; i++) { c.fillStyle = '#38b8e8'; c.fillRect(3 + i * 9, H - 4, 7, 2); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#a0a0d0'; c.fillText(`W${level}`, 3, 8);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#f8d838'; c.fillText(msg.txt, W / 2, H * .62); }
      ready.draw(c, W, H, { pixel: true, color: '#a0a0d0', y: Math.round(H * .7), text: 'DRAG TO MOVE' });
    },
    down(x) { ready.go(); tx = x; }, move(x, y, p) { if (p) tx = x; },
    key(k, d) { if (!d) return; ready.go(); if (k === 'ArrowLeft') tx = px - 24; if (k === 'ArrowRight') tx = px + 24; },
  };
  return self;
}

export default {
  id: 'bricks', title: 'Brick Bounce', tag: 'Color · Arcade', retro: true, era: 'color', pal: 'lemon', w: 160, h: 160, maxW: 240, maxH: 280, goal: 120,
  hint: 'Drag to slide the paddle. Silver bricks take extra hits; gold never breaks. Catch capsules: W wide, M multiball, S slow, L lasers, + extra life. You have 3 balls.',
  make,
};
