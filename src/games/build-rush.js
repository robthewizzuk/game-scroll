import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { backdrop } = gs.gfx;
const { brick, BRICK_KEYS } = gs.bricks;
const { Feel } = gs.effects;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Speed-build from the instruction booklet. The booklet shows the model and flashes the next
// brick it needs. Find that exact brick (colour AND length) in the tray and tap it. The right
// brick snaps on; a wrong one costs two seconds. Finish models to add time and earn more points.
const SIZES = [2, 3, 4];
let W = 176, H = 192;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let model, step, tray, time, score, models, t, parts, msg, dead, flyer, shake, streak, started;
  const cell = () => Math.max(6, Math.min(12, Math.floor((W - 40) / 10)));
  function newModel() {
    const rows = 3 + Math.min(3, Math.floor(models / 2)), list = [];
    let width = 8;
    for (let r = 0; r < rows; r++) {
      let x = r === 0 ? 0 : Math.max(0, (8 - width) / 2 | 0), left = width;
      while (left > 1) { const s = SIZES.filter(z => z <= left); const z = s[Math.random() * s.length | 0]; list.push({ r, x, w: z, col: BRICK_KEYS[Math.random() * (models < 2 ? 4 : 6) | 0] }); x += z; left -= z; }
      width = Math.max(2, width - (Math.random() < .6 ? 2 : 0));
    }
    model = list; step = 0; fillTray(); msg = { txt: `MODEL ${models + 1}`, l: .9 };
  }
  function fillTray() {
    const need = model[step], n = 6, items = [{ w: need.w, col: need.col }];
    while (items.length < n) { const r = Math.random(), it = r < .35 ? { w: need.w, col: BRICK_KEYS[Math.random() * 6 | 0] } : r < .7 ? { w: SIZES[Math.random() * 3 | 0], col: need.col } : { w: SIZES[Math.random() * 3 | 0], col: BRICK_KEYS[Math.random() * 6 | 0] }; if (!items.some(o => o.w === it.w && o.col === it.col)) items.push(it); }
    tray = shuffle(items);
  }
  function slots() {
    const n = tray.length, cols = 3, cw = (W - 16) / cols, rh = Math.min(30, (H * .42) / 2);
    return tray.map((o, i) => ({ ...o, x: 8 + (i % cols) * cw, y: H - 8 - (2 - (i / cols | 0)) * rh, w2: cw, h2: rh }));
  }
  const self = {
    reset() { time = 25; score = 0; models = 0; t = 0; parts = []; dead = 0; flyer = null; shake = 0; streak = 0; started = false; feel.clear(); newModel(); },
    fx(dt) { feel.update(dt); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); t += dt; shake = Math.max(0, shake - dt); for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (flyer) { flyer.k += dt * 5; if (flyer.k >= 1) flyer = null; }
      if (dead) { dead += dt; if (dead > 1.4) api.over(); return; }
      if (started) time -= dt;                      // the clock waits for the first brick
      if (time <= 0) { time = 0; dead = .01; msg = { txt: 'TIME UP', l: 9 }; haptic('error'); sfx(140, .5, 'square', .05, -60); }
    },
    draw(c) {
      const C = cell(), bookW = 10 * C + 16, bx = (W - bookW) / 2, by = 18, bookH = 8 * C;
      backdrop(c, 0, 0, W, H, '#f6efe2', '#ddd2bd');
      feel.begin(c);
      // booklet page
      c.fillStyle = '#0000002a'; c.fillRect(bx + 2, by + 3, bookW, bookH + 14); backdrop(c, bx, by, bookW, bookH + 14, '#ffffff', '#f2eee6'); c.strokeStyle = '#c0b8a8'; c.strokeRect(bx + .5, by + .5, bookW - 1, bookH + 13);
      c.fillStyle = '#2c64c8'; c.beginPath(); c.arc(bx + 10, by + 10, 7, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(String(step + 1), bx + 10, by + 13);
      const mx = bx + 8 + C, base = by + bookH + 8;
      model.forEach((b, i) => {
        const x = mx + b.x * C, y = base - (b.r + 1) * C;
        if (i < step) brick(c, x, y, b.w * C, C, b.col, C);
        else if (i === step) { if ((t * 4 | 0) % 2) brick(c, x, y, b.w * C, C, b.col, C); c.strokeStyle = '#d83a2c'; c.lineWidth = 1; c.strokeRect(x - .5, y - .5, b.w * C + 1, C + 1); }
        else { c.strokeStyle = '#d8d0c0'; c.setLineDash([2, 2]); c.strokeRect(x + .5, y + .5, b.w * C - 1, C - 1); c.setLineDash([]); }
      });
      // callout box for the next brick
      const need = model[step], cx = bx + bookW - 8 - 4 * C - 6; c.fillStyle = '#f8f0c0'; c.fillRect(cx, by + 4, 4 * C + 8, C + 12); c.strokeStyle = '#c0a840'; c.strokeRect(cx + .5, by + 4.5, 4 * C + 7, C + 11); brick(c, cx + 4, by + 10, need.w * C, C, need.col, C); c.fillStyle = '#202020'; c.textAlign = 'left'; c.fillText(`1x${need.w}`, cx + 4 + need.w * C + 2, by + 10 + C);
      // tray
      const sl = slots(), trayTop = sl.reduce((m, s) => Math.min(m, s.y), H) - 6; backdrop(c, 0, trayTop, W, H - trayTop, '#6a7182', '#3c414e'); c.fillStyle = '#ffffff30'; c.fillRect(0, trayTop, W, 1);
      const sx = shake > 0 ? Math.sin(shake * 80) * 2 : 0;
      for (const s of sl) { backdrop(c, s.x + 2 + sx, s.y + 2, s.w2 - 4, s.h2 - 4, '#2e333e', '#474d5c'); const bw = s.w * C; brick(c, s.x + (s.w2 - bw) / 2 + sx, s.y + (s.h2 - C) / 2 + 2, bw, C, s.col, C); }
      if (flyer) { const k = flyer.k, x = flyer.x0 + (flyer.x1 - flyer.x0) * k, y = flyer.y0 + (flyer.y1 - flyer.y0) * k - Math.sin(k * Math.PI) * 30; brick(c, x, y, flyer.w * C, C, flyer.col, C); }
      for (const p of parts) { if (p.txt) { c.fillStyle = p.col; c.textAlign = 'center'; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#383c48'; c.fillRect(0, 0, W, 13); c.textAlign = 'left'; c.fillStyle = time < 6 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 4, 10);
      c.textAlign = 'right'; c.fillStyle = '#f0c020'; c.fillText(String(score), W - 4, 10);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, by + bookH / 2 - 4, W, 14); c.fillStyle = dead ? '#f86060' : '#f0c020'; c.fillText(msg.txt, W / 2, by + bookH / 2 + 6); }
    },
    down(x, y) {
      if (dead) return; started = true;
      const s = slots().find(s => x > s.x && x < s.x + s.w2 && y > s.y && y < s.y + s.h2); if (!s) return;
      const need = model[step];
      if (s.w === need.w && s.col === need.col) {
        const C = cell(), bookW = 10 * C + 16, bx = (W - bookW) / 2, base = 18 + 8 * C + 8;
        flyer = { k: 0, x0: s.x + (s.w2 - s.w * C) / 2, y0: s.y + 6, x1: bx + 8 + C + need.x * C, y1: base - (need.r + 1) * C, w: need.w, col: need.col };
        step++; streak++; score += 1 + Math.min(4, streak / 5 | 0); api.score(score); haptic('light'); sfx(600 + (step % 6) * 80, .05, 'square', .04, 200);
        if (step >= model.length) { models++; score += 5; api.score(score); const bonus = Math.max(2.5, 6 - models * .2) + model.length * .45; time += bonus; haptic('success'); sfx(880, .3, 'square', .05, 500); parts.push({ txt: `+${bonus | 0}s`, x: W / 2, y: 60, l: 1, col: '#38a040' }); feel.juice.burst(W / 2, 18 + 4 * cell(), { n: 22, speed: 90, life: .6, size: 2, color: ['#f0c020', '#d83a2c', '#2c64c8', '#38a040'] }); newModel(); }
        else fillTray();
      } else { time -= 2; streak = 0; shake = .25; haptic('error'); sfx(150, .15, 'sawtooth', .05, -40); parts.push({ txt: '-2s', x, y: y - 6, l: .7, col: '#d83a2c' }); }
    },
    move() {}, up() {},
    key(k, d) { if (d && '123456'.includes(k)) { const s = slots()[+k - 1]; if (s) self.down(s.x + 2, s.y + 2); } },
  };
  return self;
}

export default {
  id: 'build-rush', title: 'Build Rush', tag: 'Bricks · Speed', retro: true, era: 'advance', pal: 'teal', w: 176, h: 192, maxW: 260, maxH: 320, goal: 120,
  hint: 'The instruction booklet flashes the next brick the model needs, and the yellow box shows it close up. Tap the brick with the same colour AND length in the tray below. Wrong bricks cost two seconds. Finishing a model adds time.',
  make,
};
