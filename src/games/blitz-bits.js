import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// A gauntlet of four-second micro games, back to back. Each one flashes a single word telling
// you what to do: tap, catch, dodge, pop, stop, rub, plug, flick or wait. Win to keep going;
// lose one and you drop a heart. Every few wins the pace picks up.
let W = 176, H = 176;

const MICROS = [
  { verb: 'SQUASH!', init(s) { s.b = { x: rnd(30, W - 30), y: rnd(40, H - 30), vx: rnd(-60, 60), vy: rnd(-60, 60) }; },
    update(s, dt) { const b = s.b; b.x += b.vx * dt * s.sp; b.y += b.vy * dt * s.sp; if (b.x < 12 || b.x > W - 12) b.vx *= -1; if (b.y < 30 || b.y > H - 12) b.vy *= -1; if (Math.random() < dt * 2) { b.vx = rnd(-80, 80); b.vy = rnd(-80, 80); } },
    draw(s, c) { const b = s.b; if (s.win) { c.fillStyle = '#806030'; c.fillRect(b.x - 8, b.y - 1, 16, 3); return; } c.fillStyle = '#403020'; c.beginPath(); c.ellipse(b.x, b.y, 6, 4, Math.atan2(b.vy, b.vx), 0, 7); c.fill(); c.fillStyle = '#c0d8f8a0'; c.fillRect(b.x - 6, b.y - 6 + ((s.t * 30 | 0) % 2) * 2, 4, 3); c.fillRect(b.x + 2, b.y - 6, 4, 3); },
    down(s, x, y) { if (Math.hypot(x - s.b.x, y - s.b.y) < 14) s.win = true; } },
  { verb: 'CATCH!', init(s) { s.px = W / 2; s.e = { x: rnd(20, W - 20), y: 20, vy: 0 }; },
    update(s, dt) { if (s.win) return; s.e.vy += 120 * s.sp * dt; s.e.y += s.e.vy * dt; if (!s.win && s.e.y > H - 26 && s.e.y < H - 16 && Math.abs(s.e.x - s.px) < 16) s.win = true; if (s.e.y > H) s.lose = true; },
    draw(s, c) { if (!s.win) { c.fillStyle = '#f8f0e0'; c.beginPath(); c.ellipse(s.e.x, s.e.y, 5, 6, 0, 0, 7); c.fill(); } c.fillStyle = '#a07038'; c.fillRect(s.px - 16, H - 20, 32, 10); c.fillStyle = '#c89050'; c.fillRect(s.px - 16, H - 20, 32, 2); if (s.win) { c.fillStyle = '#f8f0e0'; c.beginPath(); c.ellipse(s.px, H - 21, 5, 4, 0, 0, 7); c.fill(); } },
    move(s, x) { s.px = clamp(x, 16, W - 16); }, down(s, x) { s.px = clamp(x, 16, W - 16); } },
  { verb: 'DODGE!', survive: true, init(s) { s.px = W / 2; s.rocks = Array.from({ length: 3 }, (_, i) => ({ x: rnd(10, W - 10), y: -20 - i * 50, r: rnd(7, 11) })); },
    update(s, dt) { for (const r of s.rocks) { r.y += 130 * s.sp * dt; if (Math.hypot(r.x - s.px, r.y - (H - 18)) < r.r + 6) s.lose = true; } },
    draw(s, c) { c.fillStyle = '#887868'; for (const r of s.rocks) { c.beginPath(); c.arc(r.x, r.y, r.r, 0, 7); c.fill(); } c.fillStyle = '#48a8f8'; c.beginPath(); c.moveTo(s.px, H - 26); c.lineTo(s.px + 7, H - 12); c.lineTo(s.px - 7, H - 12); c.fill(); },
    move(s, x) { s.px = clamp(x, 8, W - 8); }, down(s, x) { s.px = clamp(x, 8, W - 8); } },
  { verb: 'POP 5!', init(s) { s.bl = Array.from({ length: 5 }, () => ({ x: rnd(16, W - 16), y: rnd(H * .4, H + 20), col: ['#f84848', '#48a8f8', '#f8d038', '#58c058'][Math.random() * 4 | 0], pop: false })); },
    update(s, dt) { for (const b of s.bl) b.y -= 30 * s.sp * dt; if (s.bl.every(b => b.pop)) s.win = true; },
    draw(s, c) { for (const b of s.bl) { if (b.pop) continue; c.fillStyle = b.col; c.beginPath(); c.ellipse(b.x, b.y, 8, 10, 0, 0, 7); c.fill(); c.strokeStyle = '#ffffff80'; c.beginPath(); c.moveTo(b.x, b.y + 10); c.lineTo(b.x, b.y + 18); c.stroke(); } },
    down(s, x, y) { for (const b of s.bl) if (!b.pop && Math.hypot(x - b.x, y - b.y) < 14) { b.pop = true; sfx(900, .04, 'square', .03, 300); break; } } },
  { verb: 'STOP!', init(s) { s.a = 0; s.zone = rnd(.55, .85); s.done = false; },
    update(s, dt) { if (!s.done) s.a = (s.a + dt * 1.1 * s.sp) % 1; },
    draw(s, c) { const cx = W / 2, cy = H * .62, R = Math.min(W, H) * .32; c.strokeStyle = '#ffffff40'; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, R, Math.PI, 0); c.stroke(); c.strokeStyle = '#58d858'; c.beginPath(); c.arc(cx, cy, R, Math.PI + s.zone * Math.PI - .2, Math.PI + s.zone * Math.PI + .2); c.stroke(); const a = Math.PI + Math.abs(1 - 2 * s.a) * Math.PI; c.strokeStyle = '#f8f8f0'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke(); c.lineWidth = 1; },
    down(s) { if (s.done) return; s.done = true; const v = Math.abs(1 - 2 * s.a); if (Math.abs(v - s.zone) < .2 / Math.PI) s.win = true; else s.lose = true; } },
  { verb: 'RUB!', init(s) { s.dirt = 1; s.lx = null; },
    update(s) { if (s.dirt <= 0) s.win = true; },
    draw(s, c) { c.fillStyle = '#88c8f8'; c.fillRect(W * .2, H * .3, W * .6, H * .5); c.fillStyle = '#f8f8f0'; c.fillRect(W * .5 - 1, H * .3, 2, H * .5); c.fillStyle = `rgba(110,80,40,${clamp(s.dirt, 0, 1) * .9})`; c.fillRect(W * .2, H * .3, W * .6, H * .5); c.fillStyle = '#ffffff'; c.fillRect(W * .5 - 20, H - 18, 40 * (1 - clamp(s.dirt, 0, 1)), 4); },
    move(s, x, y) { if (s.lx != null) s.dirt -= Math.hypot(x - s.lx, y - s.ly) / (W * 5); s.lx = x; s.ly = y; }, down(s, x, y) { s.lx = x; s.ly = y; } },
  { verb: 'PLUG IN!', init(s) { s.p = { x: rnd(20, W * .4), y: rnd(H * .5, H - 20) }; s.sock = { x: rnd(W * .6, W - 20), y: rnd(40, H * .5) }; s.drag = false; },
    update() {},
    draw(s, c) { c.fillStyle = '#e8e0d0'; c.fillRect(s.sock.x - 10, s.sock.y - 10, 20, 20); c.fillStyle = '#303030'; c.fillRect(s.sock.x - 5, s.sock.y - 4, 2, 6); c.fillRect(s.sock.x + 3, s.sock.y - 4, 2, 6); c.strokeStyle = '#303030'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, H - 10); c.quadraticCurveTo(s.p.x - 30, H, s.p.x, s.p.y); c.stroke(); c.lineWidth = 1; c.fillStyle = '#404040'; c.fillRect(s.p.x - 6, s.p.y - 6, 12, 12); c.fillStyle = '#c0c0c0'; c.fillRect(s.p.x - 4, s.p.y - 10, 2, 4); c.fillRect(s.p.x + 2, s.p.y - 10, 2, 4); },
    down(s, x, y) { if (Math.hypot(x - s.p.x, y - s.p.y) < 20) s.drag = true; }, move(s, x, y) { if (!s.drag || s.win) return; s.p = { x, y }; if (Math.hypot(x - s.sock.x, y - 6 - s.sock.y) < 9) { s.win = true; s.p = { x: s.sock.x, y: s.sock.y + 6 }; } }, up(s) { s.drag = false; } },
  { verb: 'FLICK UP!', init(s) { s.ball = { x: W / 2, y: H - 20, vy: 0, vx: 0, fly: false }; s.bin = { x: rnd(30, W - 30) }; s.st = null; },
    update(s, dt) { const b = s.ball; if (b.fly && !s.win) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 300 * dt; if (b.vy > 0 && b.y > 36 && b.y < 46 && Math.abs(b.x - s.bin.x) < 14) s.win = true; if (b.y > H + 10) s.lose = true; } },
    draw(s, c) { c.fillStyle = '#707880'; c.fillRect(s.bin.x - 13, 40, 26, 18); c.fillStyle = '#909aa0'; c.fillRect(s.bin.x - 14, 38, 28, 3); if (!s.win) { c.fillStyle = '#f8f8f0'; c.beginPath(); c.arc(s.ball.x, s.ball.y, 5, 0, 7); c.fill(); } },
    down(s, x, y) { s.st = { x, y }; }, up(s, x, y) { if (!s.st || s.ball.fly || x == null) return; const dx = x - s.st.x, dy = y - s.st.y; if (dy > -20) return; s.ball.fly = true; s.ball.vx = clamp(dx / -dy * 80, -160, 160); s.ball.vy = -300; } },
  { verb: 'DON\'T TOUCH!', survive: true, init(s) { s.btn = { x: W / 2, y: H * .6 }; },
    update() {},
    draw(s, c) { c.fillStyle = '#801818'; c.beginPath(); c.ellipse(s.btn.x, s.btn.y + 5, 26, 12, 0, 0, 7); c.fill(); c.fillStyle = (s.t * 6 | 0) % 2 ? '#f84040' : '#e02828'; c.beginPath(); c.ellipse(s.btn.x, s.btn.y, 26, 12, 0, 0, 7); c.fill(); c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.font = '6px "Press Start 2P", monospace'; c.fillText('PRESS ME', s.btn.x, s.btn.y + 2); },
    down(s) { s.lose = true; } },
];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                                            // the first micro game waits for a tap
  let cur, s, wins, lives, t, phase, pt, speed, order, last;
  function next() {
    if (!order.length) { order = shuffle(MICROS.map((_, i) => i)); if (order[0] === last) order.push(order.shift()); }
    last = order.shift(); cur = MICROS[last]; s = { t: 0, sp: speed, win: false, lose: false }; cur.init(s); phase = 'intro'; pt = 0;
  }
  const dur = () => Math.max(2.6, 4.2 - (speed - 1) * 1.6);
  const self = {
    reset() { wins = 0; lives = 4; t = 0; speed = 1; order = []; last = -1; feel.clear(); ready.reset(); next(); phase = 'intro'; pt = -.6; },
    fx(dt) { feel.update(dt); },
    resize(w, h) { W = w; H = h; if (cur && phase !== 'play') { s = { t: 0, sp: speed, win: false, lose: false }; cur.init(s); } },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; pt += dt;
      if (phase === 'intro') { if (pt > .8) { phase = 'play'; pt = 0; sfx(660, .08, 'square', .04, 200); } return; }
      if (phase === 'play') {
        s.t += dt; cur.update(s, dt);
        const out = pt >= dur(), done = (!cur.survive && s.win) || s.lose || out;
        if (done && !s.endT) s.endT = pt;
        if (s.endT != null && pt - s.endT > (out ? 0 : .45)) {
          const won = cur.survive ? !s.lose : s.win && !s.lose;
          if (won) { wins++; api.score(wins); haptic('success'); sfx(880, .2, 'square', .05, 400); feel.juice.burst(W / 2, H / 2, { n: 20, speed: 110, life: .6, size: 2, color: ['#f8f8f0', '#f8e040'] }); if (wins % 5 === 0) speed = Math.min(2, speed + .15); }
          else { lives--; haptic('error'); sfx(150, .35, 'sawtooth', .05, -60); feel.juice.shake(4); }
          phase = 'result'; pt = 0; s.won = won;
        }
        return;
      }
      if (phase === 'result' && pt > .9) { if (lives <= 0) { phase = 'over'; pt = 0; return; } next(); }
      if (phase === 'over' && pt > 1) api.over();
    },
    draw(c) {
      feel.begin(c); self.scene(c); feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: '#f8f8f0', y: Math.round(H / 2 + 34), text: 'TAP TO START' });
    },
    scene(c) {
      const bg = ['#f8c838', '#48b8f8', '#f87898', '#68d868', '#b888f8'][wins % 5];
      c.fillStyle = phase === 'result' ? (s.won ? '#58c858' : '#e04848') : bg; c.fillRect(0, 0, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      if (phase === 'intro' || phase === 'result' || phase === 'over') {
        c.fillStyle = '#20202880'; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + t; c.beginPath(); c.moveTo(W / 2, H / 2); c.arc(W / 2, H / 2, W, a, a + .26); c.fill(); }
        c.fillStyle = '#f8f8f0'; c.font = '8px "Press Start 2P", monospace';
        if (phase === 'intro') { const sc = 1 + Math.max(0, .3 - pt) * 2; c.save(); c.translate(W / 2, H / 2); c.scale(sc, sc); c.fillStyle = '#202028'; c.fillText(cur.verb, 2, 2); c.fillStyle = '#f8f8f0'; c.fillText(cur.verb, 0, 0); c.restore(); }
        else if (phase === 'result') { c.fillText(s.won ? 'NICE!' : 'MISS!', W / 2, H / 2 - 8); }
        else { c.fillText('GAME OVER', W / 2, H / 2); }
        c.font = '6px "Press Start 2P", monospace'; c.fillText(`${wins}`, W / 2, H / 2 + 14);
        for (let i = 0; i < 4; i++) { c.fillStyle = i < lives ? '#f83858' : '#20202860'; c.beginPath(); const x = W / 2 - 21 + i * 14, y = H - 20; c.arc(x - 2, y, 3, 0, 7); c.arc(x + 2, y, 3, 0, 7); c.moveTo(x - 5, y + 1); c.lineTo(x, y + 6); c.lineTo(x + 5, y + 1); c.fill(); }
        return;
      }
      cur.draw(s, c);
      // fuse timer
      const left = 1 - pt / dur(); c.fillStyle = '#202028'; c.fillRect(0, 0, W, 12); c.fillStyle = left < .3 ? '#f84040' : '#f8f8f0'; c.fillRect(2, 3, (W - 4) * clamp(left, 0, 1), 6);
      c.fillStyle = '#f8a020'; c.fillRect(2 + (W - 4) * clamp(left, 0, 1) - 2, 2, 4, 8);
      c.fillStyle = '#202028'; c.textAlign = 'left'; c.fillText(cur.verb, 4, 22);
    },
    down(x, y) { if (ready.go()) return; if (phase === 'play' && cur.down && !s.endT) cur.down(s, x, y); },
    move(x, y, p) { if (phase === 'play' && cur.move && !s.endT) cur.move(s, x, y, p); },
    up(x, y) { if (phase === 'play' && cur.up && !s.endT) cur.up(s, x, y); },
    key(k, d) { if (d && k === ' ') self.down(W / 2, H / 2); else if (!d && k === ' ') self.up(W / 2, H / 4); },
  };
  return self;
}

export default {
  id: 'blitz-bits', title: 'Blitz Bits', tag: 'Advance · Micro', retro: true, era: 'advance', pal: 'lemon', w: 176, h: 176, maxW: 260, maxH: 300, goal: 20,
  hint: 'Four-second micro games, one after another. Read the word and do it fast: squash the fly, catch the egg, dodge the rocks, pop five balloons, stop the needle in the green, rub the window clean, plug in the cable, flick the ball into the bin, and sometimes... don\'t touch anything. Four misses and you\'re out.',
  make,
};
