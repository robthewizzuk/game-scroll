import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;

// Drag the crane along its rail to swing the wrecking ball, and smash the tower down before time
// runs out. Bricks you knock loose fly off; anything left hanging in the air drops. Glass panes score double.
const W = 360, H = 640, CW = 24, COLS = 8, ROWS = 14, GX = (W - COLS * CW) / 2, GROUND = 600, ROPE = 500, BR = 26;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds, buzzes and shake
  let grid, crane, ball, debris, time, score, t, drag, total, level, shake, started;
  function build() {
    grid = []; const top = ROWS - Math.min(ROWS, 8 + level * 2);
    for (let r = 0; r < ROWS; r++) { grid.push([]); for (let c = 0; c < COLS; c++) grid[r].push(r >= top && !(r % 4 === 1 && c % 3 === 1 && r > top) ? (Math.random() < .12 ? 2 : 1) : 0); }
    total = grid.flat().filter(Boolean).length;
  }
  const cellXY = (r, c) => ({ x: GX + c * CW + CW / 2, y: GROUND - (ROWS - r) * CW + CW / 2 });
  return {
    reset() { level = 0; build(); crane = { x: 60, vx: 0 }; ball = { x: 60, y: 40 + ROPE, px: 60, py: 40 + ROPE }; debris = []; time = 35; score = 0; t = 0; drag = null; shake = 0; started = false; feel.clear(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; if (started) time -= dt;   // the clock waits for the first drag
      shake = Math.max(0, shake - dt * 3); if (time <= 0) { haptic('success'); return api.over(); }
      const target = drag ? clamp(drag.x, 20, W - 20) : crane.x; const ox = crane.x; crane.x += (target - crane.x) * Math.min(1, dt * 10); crane.vx = (crane.x - ox) / dt;
      // ball: verlet pendulum hanging from the trolley
      const damp = Math.pow(.995, dt * 60), vx = (ball.x - ball.px) * damp, vy = (ball.y - ball.py) * damp; ball.px   // same swing at 60 and 120 frames a second = ball.x; ball.py = ball.y; ball.x += vx; ball.y += vy + 2400 * dt * dt;
      const dx = ball.x - crane.x, dy = ball.y - 40, d = Math.hypot(dx, dy); ball.x = crane.x + dx / d * ROPE; ball.y = 40 + dy / d * ROPE;
      const bvx = (ball.x - ball.px) / dt, bvy = (ball.y - ball.py) / dt, sp = Math.hypot(bvx, bvy);
      // knock out bricks the ball touches (if it's moving fast enough), bouncing the ball back a little
      let hits = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue; const p = cellXY(r, c);
        if (Math.abs(p.x - ball.x) < CW / 2 + BR * .8 && Math.abs(p.y - ball.y) < CW / 2 + BR * .8) {
          if (sp > 160) { const kind = grid[r][c]; grid[r][c] = 0; hits++; score += kind === 2 ? 2 : 1; debris.push({ x: p.x, y: p.y, vx: bvx * rnd(.4, .9) + rnd(-40, 40), vy: bvy * .5 - rnd(60, 200), r: 0, kind }); if (kind === 2) feel.juice.burst(p.x, p.y, { n: 8, speed: 170, life: .35, size: 3, color: ['#bfe8ff', '#ffffff'], shape: 'spark' }); }
          else { ball.x -= Math.sign(p.x - ball.x) * 1.5; }
        }
      }
      if (hits) { ball.px = ball.x - (ball.x - ball.px) * .55; ball.py = ball.y - (ball.y - ball.py) * .55; api.score(score); haptic(hits > 2 ? 'heavy' : 'medium'); sfx(90 + rnd(0, 40), .15, 'square', .05, -30); shake = Math.min(1, hits * .2); }
      // unsupported bricks fall one cell at a time (very simple crumble)
      for (let r = ROWS - 2; r >= 0; r--) for (let c = 0; c < COLS; c++) if (grid[r][c] && !grid[r + 1][c] && Math.random() < dt * 12) {
        const side = (c > 0 && grid[r][c - 1]) || (c < COLS - 1 && grid[r][c + 1]);
        if (!side || Math.random() < dt * 4) { grid[r + 1][c] = grid[r][c]; grid[r][c] = 0; }
      }
      for (const b of debris) { b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vx * dt * .05; if (b.y > GROUND - 4) { b.y = GROUND - 4; b.vy *= -.3; b.vx *= .7; } }
      debris = debris.filter(b => b.x > -30 && b.x < W + 30 && Math.abs(b.vx) + Math.abs(b.vy) > 5);
      if (!grid.flat().some(Boolean)) { level++; time += 15; build(); haptic('success'); sfx(880, .3, 'triangle', .06, 300); feel.juice.pop(W / 2, 200, 'CLEARED +15s', { color: '#ffffff', size: 18 }); }
    },
    draw(c) {
      c.save(); if (shake) c.translate(rnd(-1, 1) * shake * 6, rnd(-1, 1) * shake * 4);
      c.fillStyle = '#9ac8e8'; c.fillRect(-10, -10, W + 20, H + 20); c.fillStyle = '#6a5a4a'; c.fillRect(-10, GROUND, W + 20, H - GROUND + 10);
      feel.begin(c);
      c.fillStyle = '#ffcc33'; c.fillRect(0, 30, W, 8); c.fillStyle = '#d4a020'; for (let x = 0; x < W; x += 16) c.fillRect(x, 30, 8, 8);
      c.fillStyle = '#444'; c.fillRect(crane.x - 16, 36, 32, 10);
      for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
        const k = grid[r][col]; if (!k) continue; const p = cellXY(r, col);
        c.fillStyle = k === 2 ? '#bfe8ff' : '#c0583a'; c.fillRect(p.x - CW / 2 + 1, p.y - CW / 2 + 1, CW - 2, CW - 2);
        if (k === 2) { c.fillStyle = '#ffffff90'; c.fillRect(p.x - 6, p.y - 8, 3, 14); } else { c.fillStyle = '#00000020'; c.fillRect(p.x - CW / 2 + 1, p.y, CW - 2, 2); }
      }
      for (const b of debris) { c.save(); c.translate(b.x, b.y); c.rotate(b.r); c.fillStyle = b.kind === 2 ? '#bfe8ff' : '#c0583a'; c.fillRect(-9, -9, 18, 18); c.restore(); }
      c.strokeStyle = '#333'; c.lineWidth = 3; c.beginPath(); c.moveTo(crane.x, 44); c.lineTo(ball.x, ball.y); c.stroke();
      const g = c.createRadialGradient(ball.x - 8, ball.y - 8, 4, ball.x, ball.y, BR); g.addColorStop(0, '#888'); g.addColorStop(1, '#222'); c.fillStyle = g; c.beginPath(); c.arc(ball.x, ball.y, BR, 0, 7); c.fill();
      feel.end(c, W, H); c.restore();
      c.fillStyle = '#00000080'; c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 12, 22);
      if (t < 4) { c.fillStyle = '#ffffffdd'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('drag left and right to swing the ball', W / 2, 625); }
    },
    down(x) { started = true; drag = { x }; },
    move(x) { if (drag) drag.x = x; },
    up() { drag = null; },
    key(k, d) { if (d) started = true; if (k === 'ArrowLeft' || k === 'ArrowRight') drag = d ? { x: k === 'ArrowLeft' ? 20 : W - 20 } : null; if (k === ' ') drag = d ? { x: (t * 2 | 0) % 2 ? 20 : W - 20 } : null; },
  };
}

export default {
  id: 'wrecking-ball', title: 'Wrecking Ball', tag: 'Casual · Physics', retro: false, w: W, h: H, goal: 80,
  hint: 'Drag left and right to move the crane and build up a swing. Smash the tower before time runs out. Glass panes score double. A cleared site adds time.',
  make,
};
