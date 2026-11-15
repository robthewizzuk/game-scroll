import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, flickTracker } = gs.util;
const { Feel } = gs.effects;

// Five frames of top-down bowling. Swipe up to roll: the swipe's direction aims it and a curved
// swipe puts hook on the ball. Strikes earn +5, spares +3, on top of every pin knocked down.
const W = 360, H = 640, LX = 70, LW = 220, BR = 15, PR = 9, PIN_Y = 120, FRAMES = 5;

function make(api) {
  const flick = flickTracker();   // how fast the swipe is going as it lets go
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let ball, pins, frame, roll, score, pts, settle, msg, t, frameDown, done;
  function rack() {
    pins = []; for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++)
      pins.push({ x: W / 2 + (i - r / 2) * 34, y: PIN_Y - r * 30 + 90, ox: 0, oy: 0, vx: 0, vy: 0, down: false, gone: false, hit: false });
    for (const p of pins) { p.ox = p.x; p.oy = p.y; }
  }
  function newBall() { ball = { x: W / 2, y: H - 70, vx: 0, vy: 0, spin: 0, live: false, gutter: false, rot: 0 }; settle = 0; }
  function standing() { return pins.filter(p => !p.down); }
  function endRoll() {
    const knocked = pins.filter(p => p.down && !p.gone);
    const n = knocked.length; for (const p of knocked) p.gone = true;
    frameDown += n; score += n;
    if (roll === 0 && frameDown === 10) { score += 5; msg = { txt: 'STRIKE!', life: 1.4 }; feel.win(W / 2, PIN_Y + 40); feel.juice.shake(8); haptic('success'); sfx(880, .3, 'square', .05, 300); return nextFrame(); }
    if (roll === 1 && frameDown === 10) { score += 3; msg = { txt: 'SPARE', life: 1.2 }; feel.juice.burst(W / 2, PIN_Y + 40, { n: 24, speed: 200, life: .7, size: 3.5, color: ['#ffd34a', '#ffffff'], gravity: 260 }); haptic('success'); sfx(700, .25, 'square', .05, 200); }
    else if (n === 0) msg = { txt: ball.gutter ? 'GUTTER' : 'MISS', life: 1 };
    else msg = { txt: n + ' PINS', life: 1 };
    api.score(score);
    if (roll === 1) return nextFrame();
    roll = 1; for (const p of pins) { p.vx = p.vy = 0; } newBall();
  }
  function nextFrame() {
    api.score(score); frame++;
    if (frame >= FRAMES) { done = true; return api.over(); }
    roll = 0; frameDown = 0; rack(); newBall();
  }
  let trail = [], held = false;
  return {
    reset() { frame = 0; roll = 0; score = 0; frameDown = 0; msg = null; t = 0; done = false; feel.clear(); rack(); newBall(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; if (msg) msg.life -= dt;
      if (!ball.live) return;
      const steps = 4, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        if (!ball.gutter) ball.vx += ball.spin * h;
        ball.x += ball.vx * h; ball.y += ball.vy * h; ball.rot += ball.vy * h * .05;
        if (!ball.gutter && (ball.x < LX + BR * .4 || ball.x > LX + LW - BR * .4)) { ball.gutter = true; ball.x = ball.x < W / 2 ? LX - 12 : LX + LW + 12; ball.vx = 0; sfx(120, .3, 'triangle', .04); haptic('warning'); }
        for (const p of pins) {
          if (p.gone) continue;
          p.x += p.vx * h; p.y += p.vy * h; p.vx *= 1 - 2.5 * h; p.vy *= 1 - 2.5 * h;
          if (!ball.gutter) {
            const dx = p.x - ball.x, dy = p.y - ball.y, d = Math.hypot(dx, dy);
            if (d < BR + PR && d > 0) {
              const nx = dx / d, ny = dy / d, rel = ball.vx * nx + ball.vy * ny;
              if (rel > 0) { p.vx += nx * rel * 1.6; p.vy += ny * rel * 1.6; ball.vx -= nx * rel * .12; ball.vy -= ny * rel * .12; if (!p.hit) { p.hit = true; feel.juice.burst(p.x, p.y, { n: 5, speed: 150, life: .25, size: 2.5, color: ['#ffffff', '#e03a3a'], shape: 'spark' }).shake(1.5); haptic('light'); sfx(260 + Math.random() * 200, .05, 'square', .04); } }
              p.x = ball.x + nx * (BR + PR); p.y = ball.y + ny * (BR + PR);
            }
          }
        }
        for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
          const a = pins[i], b = pins[j]; if (a.gone || b.gone) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < PR * 2 && d > 0) {
            const nx = dx / d, ny = dy / d, rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel > 0) { a.vx -= nx * rel * .9; a.vy -= ny * rel * .9; b.vx += nx * rel * .9; b.vy += ny * rel * .9; b.hit = true; sfx(300 + Math.random() * 200, .04, 'square', .03); }
            const push = (PR * 2 - d) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          }
        }
      }
      for (const p of pins) if (!p.gone && !p.down && Math.hypot(p.x - p.ox, p.y - p.oy) > 7) p.down = true;
      if (ball.y < 30 || Math.hypot(ball.vx, ball.vy) < 40) {
        ball.vy = Math.min(ball.vy, 0);
        const moving = pins.some(p => !p.gone && Math.hypot(p.vx, p.vy) > 12);
        settle += dt; if (settle > 1.2 || (settle > .5 && !moving)) { ball.live = false; endRoll(); }
      }
    },
    draw(c) {
      c.fillStyle = '#1b1530'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2b2245'; c.fillRect(LX - 26, 0, LW + 52, H);
      const g = c.createLinearGradient(LX, 0, LX + LW, 0); g.addColorStop(0, '#d9a066'); g.addColorStop(.5, '#f0c890'); g.addColorStop(1, '#d9a066');
      c.fillStyle = g; c.fillRect(LX, 0, LW, H);
      c.strokeStyle = '#00000018'; c.lineWidth = 1; for (let i = 1; i < 11; i++) { c.beginPath(); c.moveTo(LX + i * LW / 11, 0); c.lineTo(LX + i * LW / 11, H); c.stroke(); }
      c.fillStyle = '#7a4a22'; for (let i = 0; i < 7; i++) { const ax = LX + 30 + i * (LW - 60) / 6, ay = 420 + Math.abs(i - 3) * 12; c.beginPath(); c.moveTo(ax, ay - 8); c.lineTo(ax - 5, ay + 4); c.lineTo(ax + 5, ay + 4); c.fill(); }
      c.fillStyle = '#c0392b'; c.fillRect(LX, H - 110, LW, 3);
      feel.begin(c);
      for (const p of pins) {
        if (p.gone) continue;
        if (p.down) { c.fillStyle = '#ffffff99'; c.beginPath(); c.ellipse(p.x, p.y, PR + 3, PR - 3, Math.atan2(p.vy, p.vx), 0, 7); c.fill(); continue; }
        c.fillStyle = '#00000030'; c.beginPath(); c.arc(p.x + 2, p.y + 3, PR, 0, 7); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(p.x, p.y, PR, 0, 7); c.fill(); c.strokeStyle = '#e03a3a'; c.lineWidth = 2.5; c.beginPath(); c.arc(p.x, p.y, PR - 4, 0, 7); c.stroke();
      }
      c.save(); c.translate(ball.x, ball.y); c.fillStyle = '#00000040'; c.beginPath(); c.arc(3, 4, BR, 0, 7); c.fill();
      c.fillStyle = '#3d6bff'; c.beginPath(); c.arc(0, 0, BR, 0, 7); c.fill(); c.rotate(ball.rot);
      c.fillStyle = '#10204a'; for (const [hx, hy] of [[-4, -5], [3, -6], [0, 2]]) { c.beginPath(); c.arc(hx, hy, 2.4, 0, 7); c.fill(); }
      c.restore();
      if (held && trail.length > 1) { c.strokeStyle = '#ffffff55'; c.lineWidth = 4; c.beginPath(); c.moveTo(trail[0].x, trail[0].y); for (const p of trail) c.lineTo(p.x, p.y); c.stroke(); }
      feel.end(c, W, H);
      // frame boxes, top-left
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffaa'; c.fillText('FRAME ' + Math.min(frame + 1, FRAMES) + '/' + FRAMES, 10, 18);
      c.fillText('BALL ' + (roll + 1), 10, 32);
      if (!ball.live && frame === 0 && roll === 0 && !held) { c.fillStyle = '#ffffffaa'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('swipe up · curve it to hook', W / 2, H - 20); }
      if (msg && msg.life > 0) { c.globalAlpha = clamp(msg.life * 2, 0, 1); c.fillStyle = '#ffd34a'; c.font = '400 18px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 300); c.globalAlpha = 1; }
    },
    down(x, y) { if (ball.live || done) return; held = true; trail = [{ x, y }]; flick.start(x, y); },
    move(x, y) { if (held) { trail.push({ x, y }); flick.add(x, y); } },
    up(x, y) {
      if (!held) return; held = false; trail.push({ x, y }); flick.add(x, y);
      const a = trail[0], b = trail[trail.length - 1], dy = b.y - a.y, dx = b.x - a.x;
      if (dy > -50) { trail = []; return; }
      const v = flick.velocity(), sp = Math.hypot(v.vx, v.vy);   // how fast the finger was going as it let go
      // Hook: how far the swipe's middle bowed away from the straight line between its ends.
      const m = trail[Math.floor(trail.length / 2)], len = Math.hypot(dx, dy);
      const bow = ((m.x - a.x) * dy - (m.y - a.y) * dx) / len;
      const speed = clamp(sp * .5, 420, 900), dir = clamp(dx / -dy, -.35, .35);
      ball.x = clamp(a.x, LX + BR, LX + LW - BR);
      ball.vy = -speed; ball.vx = dir * speed; ball.spin = clamp(-bow * 6, -260, 260); ball.live = true;
      haptic('medium'); sfx(90, .5, 'triangle', .05, 30); trail = [];
    },
    key(k, d) { if (d && k === ' ' && !ball.live && !done) { ball.vy = -700; ball.vx = (Math.random() - .5) * 60; ball.spin = 0; ball.live = true; } },
  };
}

export default {
  id: 'bowling-swipe', title: 'Bowling Swipe', tag: 'Casual · Sports', retro: false, w: W, h: H, goal: 40,
  hint: 'Swipe up to bowl. Start your swipe where you want to release, and bend it to hook the ball. Five frames.',
  make,
};
