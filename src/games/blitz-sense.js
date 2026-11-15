import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic, want, tilt, calibrateTilt, onShake, startMic, stopMic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// More four-second micro games, but these use the phone itself. Tilt to roll a ball into the hole,
// blow to pop a balloon, shake a fizzy can, keep a tray level, hush when the baby sleeps, steer
// past cones. Every one has a touch fallback: drag to tilt, tap fast to blow, rub to shake.
let W = 176, H = 176;

// shared sensor helpers: tilt (or a drag stand-in), mic level (or tap bursts), shake count (or rubbing)
const sense = { drag: null, tapBurst: 0, shakes: 0, rub: 0, mic: null };
function tl() { const t = tilt(); if (t && (Math.abs(t.x) > .02 || Math.abs(t.y) > .02)) return t; return sense.drag || { x: 0, y: 0 }; }
function blowLvl() { const m = sense.mic ? clamp((sense.mic.level() - .12) * 2.5, 0, 1) : 0; return Math.max(m, clamp(sense.tapBurst, 0, 1)); }

const MICROS = [
  { verb: 'ROLL IN!', init(s) { s.b = { x: rnd(30, W - 30), y: H * .75, vx: 0, vy: 0 }; s.hole = { x: rnd(30, W - 30), y: rnd(40, H * .45) }; },
    update(s, dt) { if (s.win) return; const g = tl(), b = s.b; b.vx += g.x * 260 * dt; b.vy += g.y * 260 * dt; const k = Math.pow(.985, dt * 60); b.vx *= k; b.vy *= k; b.x += b.vx * dt; b.y += b.vy * dt; if (b.x < 8 || b.x > W - 8) { b.vx *= -.5; b.x = clamp(b.x, 8, W - 8); } if (b.y < 22 || b.y > H - 8) { b.vy *= -.5; b.y = clamp(b.y, 22, H - 8); } if (Math.hypot(b.x - s.hole.x, b.y - s.hole.y) < 8 && Math.hypot(b.vx, b.vy) < 140) { s.win = true; haptic('medium'); } },
    draw(s, c) { c.fillStyle = '#4a7a3a'; c.fillRect(0, 12, W, H - 12); c.fillStyle = '#183010'; c.beginPath(); c.arc(s.hole.x, s.hole.y, 9, 0, 7); c.fill(); c.fillStyle = '#f8f8f0'; c.fillRect(s.hole.x, s.hole.y - 22, 1, 22); c.fillStyle = '#f84040'; c.fillRect(s.hole.x + 1, s.hole.y - 22, 8, 5); if (!s.win) { c.fillStyle = '#f8f8f0'; c.beginPath(); c.arc(s.b.x, s.b.y, 5, 0, 7); c.fill(); } },
    tip: 'TILT (OR DRAG)' },
  { verb: 'BLOW!', init(s) { s.size = 8; },
    update(s, dt) { if (s.win) return; s.size += blowLvl() * 34 * dt - 3 * dt; s.size = Math.max(8, s.size); if (s.size > 40) { s.win = true; haptic('heavy'); sfx(1200, .12, 'square', .06, -900); } },
    draw(s, c) { const cx = W / 2, cy = H * .5; if (s.win) { c.fillStyle = '#f84868'; for (let i = 0; i < 10; i++) { const a = i * .63; c.fillRect(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 4, 3); } c.fillStyle = '#202028'; c.font = '8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('POP!', cx, cy + 3); return; } c.fillStyle = '#f84868'; c.beginPath(); c.ellipse(cx, cy, s.size * .85, s.size, 0, 0, 7); c.fill(); c.fillStyle = '#ffffff70'; c.beginPath(); c.ellipse(cx - s.size * .35, cy - s.size * .4, s.size * .15, s.size * .25, -.5, 0, 7); c.fill(); c.strokeStyle = '#202028'; c.beginPath(); c.moveTo(cx, cy + s.size); c.lineTo(cx, H - 10); c.stroke(); },
    tip: 'BLOW THE MIC (OR TAP FAST)' },
  { verb: 'SHAKE!', init(s) { s.fizz = 0; s.s0 = sense.shakes; s.r0 = sense.rub; },
    update(s, dt) { if (s.win) return; s.fizz = (sense.shakes - s.s0) * .22 + (sense.rub - s.r0) / (W * 7); if (s.fizz >= 1) { s.win = true; haptic('heavy'); sfx(300, .3, 'sawtooth', .05, 900); } },
    draw(s, c) { const cx = W / 2, cy = H * .55, j = s.win ? 0 : Math.sin(s.t * 60) * s.fizz * 3; c.fillStyle = '#c03030'; c.fillRect(cx - 14 + j, cy - 26, 28, 52); c.fillStyle = '#d8d8e0'; c.fillRect(cx - 14 + j, cy - 30, 28, 5); c.fillRect(cx - 14 + j, cy + 25, 28, 4); c.fillStyle = '#f8f8f0'; c.fillRect(cx - 10 + j, cy - 6, 20, 10); c.fillStyle = '#ffffff60'; c.fillRect(cx - 18, cy + 36, 36 * clamp(s.fizz, 0, 1), 4);
      if (s.win) { c.fillStyle = '#f0e8c0'; for (let i = 0; i < 14; i++) c.fillRect(cx + Math.sin(i * 2.1 + s.t * 9) * (6 + i), cy - 34 - i * 5 - (s.t * 40 % 8), 4, 4); } },
    tip: 'SHAKE THE PHONE (OR RUB)' },
  { verb: 'KEEP LEVEL!', survive: true, init(s) { s.ang = 0; s.v = rnd(-.5, .5) || .3; s.cup = 0; },
    update(s, dt) { const g = tl(); s.v += (Math.sin(s.t * 2.3) * .9 * s.sp - g.x * 3.2) * dt; s.v *= Math.pow(.97, dt * 60); s.ang += s.v * dt * 2; s.cup += s.ang * 90 * dt; s.cup *= Math.pow(.98, dt * 60); if (Math.abs(s.ang) > .45 || Math.abs(s.cup) > 52) s.lose = true; },
    draw(s, c) { const cx = W / 2, cy = H * .62; c.save(); c.translate(cx, cy); c.rotate(s.ang); c.fillStyle = '#a07040'; c.fillRect(-56, 0, 112, 5); c.fillStyle = '#f8f8f0'; c.fillRect(s.cup - 6, -14, 12, 14); c.fillStyle = '#704020'; c.fillRect(s.cup - 5, -12, 10, 3); c.restore(); c.fillStyle = '#20202840'; c.fillRect(cx - 1, cy + 8, 2, 30); },
    tip: 'TILT (OR DRAG) TO BALANCE' },
  { verb: 'SHH!', survive: true, init(s) { s.noise = 0; },
    update(s, dt) { const l = sense.mic ? clamp((sense.mic.level() - .2) * 3, 0, 1) : 0; s.noise += (l + sense.tapBurst) * dt * 2.2 - dt * .4; s.noise = Math.max(0, s.noise); if (s.noise > 1) s.lose = true; },
    draw(s, c) { const cx = W / 2, cy = H * .58; c.fillStyle = '#d8c8f0'; c.fillRect(cx - 34, cy - 4, 68, 26); c.fillStyle = '#f8f8f0'; c.fillRect(cx - 30, cy - 10, 60, 14); c.fillStyle = '#f8d0b0'; c.beginPath(); c.arc(cx - 16, cy - 10, 9, 0, 7); c.fill(); c.fillStyle = '#202028'; if (s.lose) { c.beginPath(); c.arc(cx - 16, cy - 8, 3, 0, 7); c.fill(); } else { c.fillRect(cx - 20, cy - 11, 3, 1); c.fillRect(cx - 14, cy - 11, 3, 1); c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText('z', cx + 4 + Math.sin(s.t * 3) * 3, cy - 22 - (s.t * 10 % 10)); }
      c.fillStyle = '#20202840'; c.fillRect(W * .2, H - 16, W * .6, 4); c.fillStyle = '#f84040'; c.fillRect(W * .2, H - 16, W * .6 * clamp(s.noise, 0, 1), 4); },
    tip: 'STAY QUIET, DON\'T TAP' },
  { verb: 'STEER!', survive: true, init(s) { s.x = W / 2; s.cones = Array.from({ length: 4 }, (_, i) => ({ x: rnd(16, W - 16), y: -10 - i * 46 })); },
    update(s, dt) { const g = tl(); s.x = clamp(s.x + g.x * 220 * dt, 12, W - 12); for (const k of s.cones) { k.y += 120 * s.sp * dt; if (Math.abs(k.y - (H - 22)) < 9 && Math.abs(k.x - s.x) < 12) s.lose = true; } },
    draw(s, c) { c.fillStyle = '#505058'; c.fillRect(0, 12, W, H - 12); c.fillStyle = '#f8f8f0'; for (let y = (s.t * 120) % 24 - 24; y < H; y += 24) c.fillRect(W / 2 - 1, y, 2, 12); for (const k of s.cones) { c.fillStyle = '#f87818'; c.beginPath(); c.moveTo(k.x, k.y - 8); c.lineTo(k.x + 6, k.y + 6); c.lineTo(k.x - 6, k.y + 6); c.fill(); c.fillStyle = '#f8f8f0'; c.fillRect(k.x - 3, k.y, 6, 2); } c.fillStyle = '#3080f0'; c.fillRect(s.x - 7, H - 30, 14, 18); c.fillStyle = '#a0d0f8'; c.fillRect(s.x - 5, H - 27, 10, 4); },
    tip: 'TILT (OR DRAG) TO STEER' },
  { verb: 'POUR!', init(s) { s.fill = 0; s.spill = 0; s.line = rnd(.55, .8); },
    update(s, dt) { if (s.done) return; const g = tl(), flow = clamp(g.x * 1.6, 0, 1); s.flow = flow; s.fill += flow * .42 * dt; if (s.fill > s.line + .12) s.lose = true; if (s.stop) { s.done = true; if (Math.abs(s.fill - s.line) < .12) s.win = true; else s.lose = true; } },
    draw(s, c) { const gx = W * .55, gy = H * .38, gw = 34, gh = 70; c.save(); c.translate(W * .28, H * .3); c.rotate((s.flow || 0) * 1.2); c.fillStyle = '#e0e8f0'; c.fillRect(-12, -16, 24, 32); c.fillStyle = '#f0a020'; c.fillRect(-10, -6, 20, 20); c.restore(); if (s.flow > .05 && !s.done) { c.fillStyle = '#f0a020'; c.fillRect(W * .4, H * .3, 3, gy + gh - H * .3 - s.fill * gh); }
      c.fillStyle = '#ffffff40'; c.fillRect(gx, gy, gw, gh); c.fillStyle = '#f0a020'; c.fillRect(gx, gy + gh * (1 - s.fill), gw, gh * s.fill); c.fillStyle = '#f8f8f0'; c.fillRect(gx - 4, gy + gh * (1 - s.line), gw + 8, 2); c.strokeStyle = '#f8f8f0'; c.strokeRect(gx, gy, gw, gh); },
    down(s) { if (s.fill > .1) s.stop = true; },
    tip: 'TILT RIGHT TO POUR, TAP TO STOP' },
];

function make(api) {
  want('motion');
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                                            // the first micro game waits for a tap
  let cur, s, wins, lives, t, phase, pt, speed, order, last, unShake, dragStart;
  function next() {
    if (!order.length) { order = shuffle(MICROS.map((_, i) => i)); if (order[0] === last) order.push(order.shift()); }
    last = order.shift(); cur = MICROS[last]; s = { t: 0, sp: speed, win: false, lose: false }; cur.init(s); phase = 'intro'; pt = 0; sense.drag = null; sense.tapBurst = 0; calibrateTilt();
  }
  const dur = () => Math.max(3, 4.6 - (speed - 1) * 1.6);
  const self = {
    reset() { stopMic(); sense.mic = null; wins = 0; lives = 4; t = 0; speed = 1; order = []; last = -1; if (!unShake) unShake = onShake(() => { sense.shakes++; haptic('light'); }); feel.clear(); ready.reset(); next(); pt = -.6; },
    fx(dt) { feel.update(dt); },
    resize(w, h) { W = w; H = h; if (cur && phase !== 'play') { s = { t: 0, sp: speed, win: false, lose: false }; cur.init(s); } },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; pt += dt; sense.tapBurst = Math.max(0, sense.tapBurst - dt * 2.5);
      if (phase === 'intro') { if (pt > 1.1) { phase = 'play'; pt = 0; sense.tapBurst = 0; sfx(660, .08, 'square', .04, 200); } return; }
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
      if (phase === 'result' && pt > .9) { if (lives <= 0) { phase = 'over'; pt = 0; stopMic(); sense.mic = null; return; } next(); }
      if (phase === 'over' && pt > 1) api.over();
    },
    draw(c) {
      feel.begin(c); self.scene(c); feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: '#f8f8f0', y: Math.round(H / 2 + 46), text: 'TAP TO START' });
    },
    scene(c) {
      const bg = ['#38c8b8', '#f89838', '#8878f8', '#f8d038', '#f86888'][wins % 5];
      c.fillStyle = phase === 'result' ? (s.won ? '#58c858' : '#e04848') : bg; c.fillRect(0, 0, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      if (phase !== 'play') {
        c.fillStyle = '#20202880'; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 - t; c.beginPath(); c.moveTo(W / 2, H / 2); c.arc(W / 2, H / 2, W, a, a + .26); c.fill(); }
        c.fillStyle = '#f8f8f0'; c.font = '8px "Press Start 2P", monospace';
        if (phase === 'intro') { const sc = 1 + Math.max(0, .3 - pt) * 2; c.save(); c.translate(W / 2, H / 2); c.scale(sc, sc); c.fillStyle = '#202028'; c.fillText(cur.verb, 2, 2); c.fillStyle = '#f8f8f0'; c.fillText(cur.verb, 0, 0); c.restore(); c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#202028'; c.fillRect(0, H / 2 + 24, W, 12); c.fillStyle = '#f8f8f0'; c.fillText(cur.tip, W / 2, H / 2 + 32); }
        else if (phase === 'result') c.fillText(s.won ? 'NICE!' : 'MISS!', W / 2, H / 2 - 8);
        else c.fillText('GAME OVER', W / 2, H / 2);
        c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#f8f8f0'; c.fillText(`${wins}`, W / 2, H / 2 + 14);
        for (let i = 0; i < 4; i++) { c.fillStyle = i < lives ? '#f83858' : '#20202860'; c.beginPath(); const x = W / 2 - 21 + i * 14, y = H - 20; c.arc(x - 2, y, 3, 0, 7); c.arc(x + 2, y, 3, 0, 7); c.moveTo(x - 5, y + 1); c.lineTo(x, y + 6); c.lineTo(x + 5, y + 1); c.fill(); }
        return;
      }
      cur.draw(s, c);
      const left = 1 - pt / dur(); c.fillStyle = '#202028'; c.fillRect(0, 0, W, 12); c.fillStyle = left < .3 ? '#f84040' : '#f8f8f0'; c.fillRect(2, 3, (W - 4) * clamp(left, 0, 1), 6);
      c.fillStyle = '#f8a020'; c.fillRect(2 + (W - 4) * clamp(left, 0, 1) - 2, 2, 4, 8);
      c.fillStyle = '#202028'; c.textAlign = 'left'; c.fillText(cur.verb, 4, 22);
    },
    down(x, y) {
      if (!sense.mic) startMic().then(m => { if (m) sense.mic = m; });
      if (ready.go()) return;
      dragStart = { x, y }; sense.lx = x; sense.ly = y;
      if (phase === 'play' && !s.endT) { sense.tapBurst += .35; if (cur.down) cur.down(s, x, y); }
    },
    move(x, y, p) {
      if (!p || !dragStart || phase !== 'play') return;
      sense.drag = { x: clamp((x - dragStart.x) / 50, -1, 1), y: clamp((y - dragStart.y) / 50, -1, 1) };
      sense.rub += Math.hypot(x - sense.lx, y - sense.ly); sense.lx = x; sense.ly = y;
    },
    up() { dragStart = null; sense.drag = null; },
    key(k, d) { if (d && k === ' ') self.down(W / 2, H / 2); },
  };
  return self;
}

export default {
  id: 'blitz-sense', title: 'Blitz Bits 2', tag: 'Advance · Micro', retro: true, era: 'advance', pal: 'lemon', w: 176, h: 176, maxW: 260, maxH: 300, goal: 15,
  hint: 'Four-second micro games that use your phone: tilt to roll the ball in, blow into the mic to pop the balloon, shake the fizzy can, keep the tray level, hush while the baby sleeps, steer past cones, and pour to the line. No sensors? Drag to tilt, tap fast to blow, rub to shake. Four misses and you\'re out.',
  make,
};
