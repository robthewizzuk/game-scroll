import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { approach } = gs.juice;

// A tiny farm, one season at a time. Pick a seed at the bottom, then tap a plot: tap empty soil to
// plant, tap a dry crop to water it, tap a ripe crop to harvest and sell it. Watered crops grow
// overnight. Shoo crows before they peck your crops. Earn the season's target to keep the farm.
const SEEDS = [
  { k: 'TURNIP', days: 2, cost: 2, sell: 6, col: '#f8f8f0', leaf: '#58c040' },
  { k: 'POTATO', days: 3, cost: 3, sell: 10, col: '#c89858', leaf: '#48a838' },
  { k: 'CORN', days: 4, cost: 5, sell: 18, col: '#f8d838', leaf: '#68b848' },
  { k: 'PUMPKIN', days: 5, cost: 8, sell: 30, col: '#f08830', leaf: '#388830' },
];
const DAY = 22, SEASON = 6, PS = 20;
let W = 160, H = 176;

function make(api) {
  let plots, cols, rows, coins, earned, seasonEarn, target, season, day, clock, seed, unlocked, crows, fx, score, t, rain, msg, started;
  const TOP = 20, BAR = 28;
  const ox = () => (W - cols * PS) / 2, oy = () => TOP + Math.max(0, (H - TOP - BAR - rows * PS) / 2);
  function layout() { const nc = clamp(Math.floor((W - 12) / PS), 5, 10), nr = clamp(Math.floor((H - TOP - BAR - 30) / PS), 4, 9); if (nc !== cols || nr !== rows || !plots) { const old = plots || []; cols = nc; rows = nr; plots = Array.from({ length: cols * rows }, (_, i) => old[i] || { crop: null }); } }
  function newDay() {
    day++; clock = 0; rain = Math.random() < .2;
    for (const p of plots) if (p.crop) { if (p.crop.wet || rain) { p.crop.age++; } p.crop.wet = rain; }
    if (day > SEASON) {
      if (seasonEarn >= target) { season++; day = 1; score += 5; api.score(score); msg = { txt: `SEASON ${season}!`, sub: `TARGET $${target = Math.round(target * 1.6 + 10)}`, l: 2.2 }; seasonEarn = 0; if (unlocked < SEEDS.length) unlocked++; haptic('success'); sfx(880, .4, 'triangle', .05, 400); }
      else { msg = { txt: 'SEASON LOST', l: 2 }; return true; }
    } else msg = { txt: rain ? `DAY ${day}: RAIN` : `DAY ${day}`, l: 1.1 };
    return false;
  }
  function act(i) {
    const p = plots[i]; if (!p) return; const sd = SEEDS[seed];
    const crow = crows.find(c => c.plot === i && c.state === 'eat'); if (crow) { crow.state = 'fly'; haptic('light'); sfx(900, .08, 'square', .03, 300); return; }
    if (!p.crop) { if (coins < sd.cost) { haptic('warning'); fx.push({ i, txt: 'NO $', l: .6, col: '#f86060' }); return; } coins -= sd.cost; p.crop = { s: seed, age: 0, wet: false }; haptic('tick'); sfx(300, .05, 'square', .03); return; }
    const s = SEEDS[p.crop.s];
    if (p.crop.age >= s.days) { coins += s.sell; earned += s.sell; seasonEarn += s.sell; score += s.sell; api.score(score); fx.push({ i, txt: `+$${s.sell}`, l: .8, col: '#f8d838' }); p.crop = null; haptic('success'); sfx(700 + s.sell * 10, .1, 'triangle', .05, 300); return; }
    if (!p.crop.wet) { p.crop.wet = true; haptic('light'); sfx(500, .08, 'triangle', .03, -200); for (let k = 0; k < 4; k++) fx.push({ i, drop: true, dx: rnd(3, 17), dy: rnd(-4, 4), l: .4 }); }
  }
  const self = {
    reset() { plots = null; layout(); coins = 12; earned = 0; seasonEarn = 0; target = 30; season = 1; day = 0; clock = 0; seed = 0; unlocked = 2; crows = []; fx = []; score = 0; t = 0; rain = false; started = false; self.lastDrag = -1; newDay(); msg = { txt: 'SEASON 1', sub: 'TARGET $30', l: 2 }; },
    resize(w, h) { W = w; H = h; if (plots) layout(); },
    update(dt) {
      t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (!started) return;                         // the first day starts with your first tap
      clock += dt;
      if (clock >= DAY) { if (newDay()) { haptic('error'); sfx(130, .6, 'square', .05, -60); return api.over(); } }
      if (Math.random() < dt * (.025 + season * .02)) { const grown = plots.map((p, i) => p.crop ? i : -1).filter(i => i >= 0); if (grown.length) { const i = grown[Math.random() * grown.length | 0]; if (!crows.some(c => c.plot === i)) crows.push({ plot: i, state: 'land', x: -10, y: 10, k: 0, eat: 4 }); sfx(1300, .05, 'square', .02, -300); } }
      for (const c of crows) {
        const tx = ox() + (c.plot % cols) * PS + 10, ty = oy() + (c.plot / cols | 0) * PS + 6;
        if (c.state === 'land') { c.x = approach(c.x, tx, 3, dt); c.y = approach(c.y, ty, 3, dt); if (Math.hypot(tx - c.x, ty - c.y) < 2) c.state = 'eat'; }
        else if (c.state === 'eat') { c.eat -= dt; if (c.eat <= 0) { plots[c.plot].crop = null; c.state = 'fly'; fx.push({ i: c.plot, txt: 'PECKED!', l: .9, col: '#f86060' }); haptic('warning'); sfx(200, .15, 'square', .04, -80); } }
        else { c.x += 120 * dt; c.y -= 80 * dt; if (c.y < -20) c.gone = true; }
      }
      crows = crows.filter(c => !c.gone);
      for (const f of fx) f.l -= dt; fx = fx.filter(f => f.l > 0);
    },
    draw(c) {
      const k = clock / DAY, dusk = k > .75 ? (k - .75) * 4 : 0;
      c.fillStyle = rain ? '#6878a0' : '#88c8f0'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#78b848'; c.fillRect(0, TOP - 4, W, H); c.fillStyle = '#68a840'; for (let i = 0; i < 30; i++) c.fillRect((i * 41) % W, TOP + (i * 23) % (H - TOP), 2, 1);
      // barn and fence
      c.fillStyle = '#c84838'; c.fillRect(W - 30, TOP - 14, 24, 14); c.fillStyle = '#f8f8f0'; c.fillRect(W - 21, TOP - 8, 6, 8); c.fillStyle = '#883028'; c.beginPath(); c.moveTo(W - 32, TOP - 14); c.lineTo(W - 18, TOP - 22); c.lineTo(W - 4, TOP - 14); c.fill();
      const X0 = ox(), Y0 = oy();
      c.fillStyle = '#a07040'; c.fillRect(X0 - 3, Y0 - 3, cols * PS + 6, rows * PS + 6);
      plots.forEach((p, i) => {
        const x = X0 + (i % cols) * PS, y = Y0 + (i / cols | 0) * PS, cr = p.crop;
        c.fillStyle = cr && (cr.wet || rain) ? '#583820' : '#906038'; c.fillRect(x + 1, y + 1, PS - 2, PS - 2); c.fillStyle = cr && (cr.wet || rain) ? '#482818' : '#805028'; c.fillRect(x + 3, y + 6, PS - 6, 1); c.fillRect(x + 3, y + 12, PS - 6, 1);
        if (!cr) return; const s = SEEDS[cr.s], ripe = cr.age >= s.days, g = Math.min(1, cr.age / s.days);
        if (ripe) { c.fillStyle = s.leaf; c.fillRect(x + 7, y + 3, 6, 4); c.fillStyle = s.col; if (cr.s === 2) c.fillRect(x + 8, y + 5, 4, 11); else c.fillRect(x + 5, y + 8, 10, 8); c.fillStyle = '#ffffff60'; c.fillRect(x + 6, y + 9, 2, 2); if ((t * 3 | 0) % 2) { c.fillStyle = '#f8f8f0'; c.fillRect(x + PS - 5, y + 2, 2, 2); } }
        else { c.fillStyle = s.leaf; const hh = 2 + Math.round(g * 8); c.fillRect(x + 9, y + 15 - hh, 2, hh); if (g > .3) { c.fillRect(x + 6, y + 15 - hh, 3, 2); c.fillRect(x + 11, y + 14 - hh, 3, 2); } if (!cr.wet && !rain) { c.fillStyle = '#80c8f8'; c.fillRect(x + PS - 6, y + 2, 3, 4); c.fillRect(x + PS - 5, y + 1, 1, 1); } }
      });
      for (const f of fx) { const x = X0 + (f.i % cols) * PS, y = Y0 + (f.i / cols | 0) * PS; if (f.drop) { c.fillStyle = '#80c8f8'; c.fillRect(x + f.dx, y + 8 + f.dy + (1 - f.l / .4) * 8, 1, 2); } else { c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText(f.txt, x + 11, y - 1 - (1 - f.l) * 8); c.fillStyle = f.col; c.fillText(f.txt, x + 10, y - 2 - (1 - f.l) * 8); } }
      for (const cw of crows) { const x = Math.round(cw.x), y = Math.round(cw.y), fl = cw.state !== 'eat' ? (t * 10 | 0) % 2 : 0; c.fillStyle = '#202028'; c.fillRect(x - 4, y - 3, 8, 5); c.fillRect(x - 7, y - 3 + fl * 2, 3, 2); c.fillRect(x + 4, y - 3 + fl * 2, 3, 2); c.fillStyle = '#f8c838'; c.fillRect(x + 4, y - 1, 2, 1); if (cw.state === 'eat') { c.fillStyle = '#f84040'; c.fillRect(x - 1, y - 9, 2, 4); c.fillRect(x - 1, y - 4, 2, 1); } }
      if (rain) { c.fillStyle = '#c8e8ff80'; for (let i = 0; i < 40; i++) { const rx = (i * 37 + t * 40) % W, ry = (i * 53 + t * 160) % H; c.fillRect(rx, ry, 1, 3); } }
      if (dusk) { c.fillStyle = `rgba(40,20,80,${dusk * .45})`; c.fillRect(0, 0, W, H); }
      // HUD
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#101018a0'; c.fillRect(0, 0, W, 13); c.textAlign = 'left'; c.fillStyle = '#f8d838'; c.fillText(`$${coins}`, 3, 9);
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(`D${Math.min(day, SEASON)}/${SEASON}`, W - 3, 9);
      c.fillStyle = '#ffffff40'; c.fillRect(3, 14, W - 6, 2); c.fillStyle = '#f8d838'; c.fillRect(3, 14, (W - 6) * Math.min(1, seasonEarn / target), 2);
      // seed bar
      const by = H - BAR; c.fillStyle = '#583820'; c.fillRect(0, by, W, BAR); const bw = W / 4;
      for (let i = 0; i < 4; i++) { const sd = SEEDS[i], bx = i * bw, lock = i >= unlocked; c.fillStyle = i === seed ? '#f8d838' : '#704828'; c.fillRect(bx + 2, by + 3, bw - 4, BAR - 6); c.globalAlpha = lock ? .35 : 1;
        c.fillStyle = sd.col; c.fillRect(bx + bw / 2 - 3, by + 6, 6, 5); c.fillStyle = sd.leaf; c.fillRect(bx + bw / 2 - 1, by + 4, 2, 2); c.textAlign = 'center'; c.fillStyle = i === seed ? '#101018' : '#f8f8f0'; c.fillText(lock ? 'LOCK' : `$${sd.cost}`, bx + bw / 2, by + 20); c.globalAlpha = 1; }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#101018c0'; c.fillRect(0, H * .42 - 10, W, msg.sub ? 24 : 15); c.fillStyle = '#f8f8f0'; c.fillText(msg.txt, W / 2, H * .42); if (msg.sub) { c.fillStyle = '#f8d838'; c.fillText(msg.sub, W / 2, H * .42 + 10); } }
      if (t < 6 && season === 1 && day === 1) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText('TAP SOIL TO PLANT', W / 2, oy() - 6 > 22 ? oy() - 6 : H - BAR - 4); }
    },
    down(x, y) {
      started = true;
      if (y >= H - BAR) { const i = Math.floor(x / (W / 4)); if (i < unlocked) { seed = i; haptic('tick'); sfx(600, .03, 'square', .02); } else haptic('warning'); return; }
      for (const cw of crows) if (cw.state === 'eat' && Math.hypot(cw.x - x, cw.y - y) < 10) { cw.state = 'fly'; haptic('light'); sfx(900, .08, 'square', .03, 300); return; }
      const cx = Math.floor((x - ox()) / PS), cy = Math.floor((y - oy()) / PS); if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return; act(cy * cols + cx);
    },
    move(x, y, p) { if (!p || y >= H - BAR) return; const cx = Math.floor((x - ox()) / PS), cy = Math.floor((y - oy()) / PS); if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return; const i = cy * cols + cx, pl = plots[i]; if (self.lastDrag !== i && pl.crop && !pl.crop.wet) { self.lastDrag = i; act(i); } },
    up() { self.lastDrag = -1; },
    key(k, d) { if (!d) return; started = true; const n = '1234'.indexOf(k); if (n >= 0 && n < unlocked) seed = n; if (k === ' ') { const cw = crows.find(c => c.state === 'eat'); if (cw) { act(cw.plot); return; } const i = plots.findIndex(p => p.crop && (p.crop.age >= SEEDS[p.crop.s].days || !p.crop.wet)); act(i >= 0 ? i : plots.findIndex(p => !p.crop)); } },
  };
  return self;
}

export default {
  id: 'pocket-farm', title: 'Pocket Farm', tag: 'Advance · Farming', retro: true, era: 'advance', pal: 'lemon', w: 160, h: 176, maxW: 240, maxH: 300, goal: 80,
  hint: 'Pick a seed at the bottom, then tap empty soil to plant it. Tap dry crops (blue drop) to water them, or drag across several. Watered crops grow overnight; tap ripe ones to sell. Tap crows to shoo them. Hit the season target to keep farming.',
  make,
};
