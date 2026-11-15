import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { clamp, rnd, flickTracker } = gs.util;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { icon } = gs.icons;

// Flick the ball up into the hoop. After a few baskets the hoop starts sliding. One miss ends the run.
const W = 360, H = 640, G = 1500, BR = 20, RIM = 46, START = { x: W / 2, y: H - 90 };

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game plays its own sounds
  let lives, ball, hoop, score, flick, held, scored, t, net, msg, dead;
  function newBall() { ball = { x: START.x, y: START.y, vx: 0, vy: 0, live: false, passedTop: false, spin: 0 }; scored = false; }
  return {
    reset() { lives = 3; hoop = { x: W / 2, y: 190, dir: 1, speed: 0 }; score = 0; flick = flickTracker(); held = false; t = 0; net = 0; msg = null; dead = 0; feel.clear(); newBall(); },
    update(dt) {
      feel.update(dt); t += dt; net = Math.max(0, net - dt * 3);
      hoop.speed = score < 3 ? 0 : Math.min(170, 40 + score * 10);
      hoop.x += hoop.dir * hoop.speed * dt; if (hoop.x < RIM + 20) { hoop.x = RIM + 20; hoop.dir = 1; } if (hoop.x > W - RIM - 20) { hoop.x = W - RIM - 20; hoop.dir = -1; }
      if (msg) msg.life -= dt;
      if (!ball.live) return;
      const steps = 4, h = dt / steps;
      for (let i = 0; i < steps; i++) {
        ball.vy += G * h; ball.x += ball.vx * h; ball.y += ball.vy * h; ball.spin += ball.vx * h * .03;
        if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx) * .7; } if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx) * .7; }
        if (ball.y < hoop.y - BR) ball.passedTop = true;
        for (const rx of [hoop.x - RIM, hoop.x + RIM]) {   // rim ends behave like small posts
          const dx = ball.x - rx, dy = ball.y - hoop.y, d = Math.hypot(dx, dy);
          if (d < BR + 4 && d > 0) { const nx = dx / d, ny = dy / d, dot = ball.vx * nx + ball.vy * ny; if (dot < 0) { ball.vx -= 1.7 * dot * nx; ball.vy -= 1.7 * dot * ny; sfx(300, .04, 'triangle', .04); haptic('tick'); feel.juice.burst(rx, hoop.y, { n: 4, speed: 110, life: .2, size: 2.5, color: ['#ff7a3d', '#ffffff'], shape: 'spark' }); } ball.x = rx + nx * (BR + 4); ball.y = hoop.y + ny * (BR + 4); }
        }
        if (!scored && ball.passedTop && ball.vy > 0 && Math.abs(ball.y - hoop.y) < 8 && Math.abs(ball.x - hoop.x) < RIM - 6) {
          scored = true; net = 1; const clean = Math.abs(ball.x - hoop.x) < 14; score += clean ? 2 : 1; api.score(score);
          msg = { txt: clean ? 'SWISH +2' : 'NICE', life: .9 }; sfx(clean ? 880 : 660, .18, 'triangle', .06, 200); haptic(clean ? 'success' : 'medium');
          feel.juice.burst(hoop.x, hoop.y + 30, { n: clean ? 22 : 10, speed: clean ? 200 : 130, life: .5, size: 3.5, color: clean ? ['#ffd34a', '#ffffff', '#ff7a3d'] : ['#ffffff', '#ff7a3d'], angle: Math.PI / 2, arc: 2.2, gravity: 300 });
        }
      }
      if (ball.y > H + BR) { if (scored) newBall(); else { sfx(140, .35, 'triangle', .06, -60); haptic('error'); feel.juice.shake(5); if (--lives <= 0) return api.over(); msg = { txt: 'MISS', life: .7 }; newBall(); } }
    },
    fx(dt) { dead += dt; feel.update(dt); if (ball.live) { ball.vy += G * dt; ball.y += ball.vy * dt; } },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b1a3f'); g.addColorStop(1, '#120c1f'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff0d'; c.fillRect(0, H - 40, W, 40); c.fillStyle = '#ffffff18'; c.fillRect(0, H - 40, W, 2);
      feel.begin(c);
      // backboard + hoop back
      c.fillStyle = '#ffffff20'; c.fillRect(hoop.x - 70, hoop.y - 90, 140, 80); c.strokeStyle = '#ffffff55'; c.lineWidth = 3; c.strokeRect(hoop.x - 30, hoop.y - 50, 60, 40);
      c.strokeStyle = '#ff7a3d'; c.lineWidth = 6; c.beginPath(); c.ellipse(hoop.x, hoop.y, RIM, 9, 0, Math.PI, 0); c.stroke();
      const sx = (ball.live && ball.y < hoop.y) ? 1 : 1;
      const drawBall = () => {
        c.save(); c.translate(ball.x, ball.y); c.rotate(ball.spin);
        c.fillStyle = '#ff8a3d'; c.beginPath(); c.arc(0, 0, BR * sx, 0, 7); c.fill();
        c.strokeStyle = '#7a2f0e'; c.lineWidth = 2; c.beginPath(); c.moveTo(-BR, 0); c.lineTo(BR, 0); c.moveTo(0, -BR); c.lineTo(0, BR); c.stroke();
        c.beginPath(); c.arc(-BR * 1.2, 0, BR * .9, -.9, .9); c.stroke(); c.beginPath(); c.arc(BR * 1.2, 0, BR * .9, Math.PI - .9, Math.PI + .9); c.stroke();
        c.restore();
      };
      const ballBehind = ball.live && ball.y < hoop.y && ball.vy > 0;
      if (ballBehind) drawBall();
      // net + rim front
      c.strokeStyle = '#ffffffaa'; c.lineWidth = 2; const sway = net * 6 * Math.sin(t * 30);
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(hoop.x + i * RIM / 3.2, hoop.y + 4); c.lineTo(hoop.x + i * RIM / 4.5 + sway, hoop.y + 52 + net * 10); c.stroke(); }
      c.beginPath(); c.moveTo(hoop.x - RIM * .85, hoop.y + 22); c.lineTo(hoop.x + RIM * .85, hoop.y + 22); c.stroke();
      c.strokeStyle = '#ff7a3d'; c.lineWidth = 6; c.beginPath(); c.ellipse(hoop.x, hoop.y, RIM, 9, 0, 0, Math.PI); c.stroke();
      if (!ballBehind) drawBall();
      feel.end(c, W, H);
      if (!ball.live && !dead) { c.fillStyle = '#ffffff55'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('flick up ↑', W / 2, H - 20 - (t * 2 % 1) * 6); }
      for (let i = 0; i < 3; i++) icon(c, 'heart', 24 + i * 24, H - 21, 20, { color: i < lives ? '#ff4d6d' : '#ffffff22' });
      if (msg && msg.life > 0) { c.globalAlpha = clamp(msg.life * 2, 0, 1); c.fillStyle = '#ffd34a'; c.font = '400 16px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, hoop.x, hoop.y - 110); c.globalAlpha = 1; }
    },
    down(x, y) { if (ball.live) return; held = true; flick.start(x, y); },
    move(x, y) { if (held) flick.add(x, y); },
    up(x, y) {
      if (!held) return; held = false; flick.add(x, y); const v = flick.velocity();
      if (v.vy > -300) return;   // not an upward flick
      // Any upward flick clears the rim; a harder flick arcs higher. Sideways motion aims.
      const power = clamp((-v.vy - 300) / 2400, 0, 1); ball.vy = -(1120 + power * 330); ball.vx = clamp(v.vx * .35, -420, 420); ball.live = true; sfx(420, .06, 'triangle', .04, 200); haptic('light');
    },
    key(k, d) { if (d && k === ' ' && !ball.live) { ball.vx = (hoop.x - ball.x) * .6 + rnd(-30, 30); ball.vy = -1220; ball.live = true; } },
  };
}

export default {
  id: 'hoop-flick', title: 'Hoop Flick', tag: 'Casual · Sports', retro: false, w: W, h: H,
  hint: 'Flick the ball up into the hoop. A clean swish scores double. You get three misses.',
  goal: 15,
  make,
};
