import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;

// Keep the ball off the ground. Tap the ball to kick it up: tap its left side to send it right
// and its right side to send it left. Wind picks up after ten kicks. Dead-centre kicks score double.
const W = 360, H = 640, R = 30, G = 1250, FLOOR = H - 70;

/* ---------- a real soccer ball: a truncated icosahedron (12 black pentagons, 20 white hexagons) ---------- */
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map(norm);
const ICO_EDGES = [];
for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const d = Math.hypot(...ICO[i].map((x, k) => x - ICO[j][k])); if (d < 1.1) ICO_EDGES.push([i, j]); }
const lerp3 = (a, b, f) => norm(a.map((x, k) => x + (b[k] - x) * f));
// Each icosahedron edge is cut at 1/3 and 2/3: those 60 points are the ball's seam corners.
const PENTS = ICO.map(() => []), SEAMS = [];
for (const [a, b] of ICO_EDGES) {
  const p = lerp3(ICO[a], ICO[b], 1 / 3), q = lerp3(ICO[a], ICO[b], 2 / 3);
  PENTS[a].push(p); PENTS[b].push(q); SEAMS.push([p, q]);
}
PENTS.forEach((ps, i) => {
  const c = ICO[i], u = norm(ps[0].map((x, k) => x - c[k])), v = [c[1] * u[2] - c[2] * u[1], c[2] * u[0] - c[0] * u[2], c[0] * u[1] - c[1] * u[0]];
  ps.sort((m, n) => Math.atan2(m.reduce((s, x, k) => s + x * v[k], 0), m.reduce((s, x, k) => s + x * u[k], 0)) - Math.atan2(n.reduce((s, x, k) => s + x * v[k], 0), n.reduce((s, x, k) => s + x * u[k], 0)));
  for (let k = 0; k < 5; k++) SEAMS.push([ps[k], ps[(k + 1) % 5]]);
});
// Rotate by roll (screen spin) then tumble (forward/back), as seen from the front.
function orient(roll, tumble) {
  const cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tumble), st = Math.sin(tumble);
  return ([x, y, z]) => { const y1 = y * ct - z * st, z1 = y * st + z * ct; return [x * cr - y1 * sr, x * sr + y1 * cr, z1]; };
}
function drawBall(c, roll, tumble) {
  const rot = orient(roll, tumble), P = v => { const [x, y, z] = rot(v); return [x * R, y * R, z]; };
  c.save(); c.beginPath(); c.arc(0, 0, R, 0, 7); c.clip();
  const g = c.createRadialGradient(-R * .35, -R * .4, R * .1, 0, 0, R); g.addColorStop(0, '#ffffff'); g.addColorStop(.7, '#eef1f4'); g.addColorStop(1, '#b9c2cc');
  c.fillStyle = g; c.fillRect(-R, -R, R * 2, R * 2);
  // black pentagons on the near side, curved along the sphere
  for (let i = 0; i < 12; i++) {
    const cz = rot(ICO[i])[2]; if (cz < -.15) continue;
    c.fillStyle = cz > .3 ? '#1b1f27' : '#2b313b'; c.beginPath();
    const ps = PENTS[i];
    for (let k = 0; k < 5; k++) { const a = ps[k], b = ps[(k + 1) % 5]; for (let f = 0; f < 1; f += .25) { const [x, y] = P(lerp3(a, b, f)); k || f ? c.lineTo(x, y) : c.moveTo(x, y); } }
    c.closePath(); c.fill();
  }
  // seams between the white hexagons
  c.strokeStyle = '#8a95a3'; c.lineWidth = 1.2; c.beginPath();
  for (const [a, b] of SEAMS) {
    if (rot(a)[2] < 0 && rot(b)[2] < 0) continue;
    for (let f = 0; f <= 1.001; f += .25) { const [x, y] = P(lerp3(a, b, f)); f ? c.lineTo(x, y) : c.moveTo(x, y); }
  }
  c.stroke();
  // soft rim shadow and a highlight so it reads as round
  const rim = c.createRadialGradient(0, 0, R * .6, 0, 0, R); rim.addColorStop(0, '#0000'); rim.addColorStop(1, '#0003'); c.fillStyle = rim; c.fillRect(-R, -R, R * 2, R * 2);
  c.fillStyle = '#ffffff55'; c.beginPath(); c.ellipse(-R * .38, -R * .42, R * .28, R * .17, -.6, 0, 7); c.fill();
  c.restore();
  c.strokeStyle = '#00000040'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R - .5, 0, 7); c.stroke();
}

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let ball, score, wind, windT, t, kicks, dead, foot;
  const self = {
    reset() { ball = { x: W / 2, y: 260, vx: 0, vy: 0, rot: 0, tumble: .4, spin: 0, live: false }; score = 0; wind = 0; windT = 3; t = 0; kicks = 0; dead = 0; foot = null; feel.clear(); },
    update(dt) {
      feel.update(dt); t += dt; if (foot) { foot.l -= dt; if (foot.l <= 0) foot = null; }
      if (!ball.live) { ball.y = 260 + Math.sin(t * 3) * 8; ball.rot += dt * .4; return; }
      if (kicks >= 10) { windT -= dt; if (windT <= 0) { windT = rnd(2, 4); wind = rnd(-1, 1) * Math.min(260, 60 + kicks * 6); } }
      ball.vx += wind * dt; ball.vy += G * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.rot += ball.vx * dt / R; ball.tumble += ball.spin * dt; ball.spin *= Math.pow(.6, dt);
      if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx) * .8; sfx(200, .03, 'triangle', .03); }
      if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx) * .8; sfx(200, .03, 'triangle', .03); }
      if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy) * .5; }
      if (ball.y > FLOOR - R) { ball.y = FLOOR - R; feel.juice.burst(ball.x, FLOOR, { n: 14, speed: 170, life: .5, size: 3.5, color: ['#4caf50', '#3d8f41', '#ffffff'], angle: -Math.PI / 2, arc: 2.6, gravity: 500 }).shake(8); haptic('error'); sfx(120, .3, 'triangle', .06, -30); return api.over(); }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#79c7ff'); g.addColorStop(1, '#c8ecff'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffffaa'; for (let i = 0; i < 4; i++) { const cx = ((i * 130 + t * (12 + wind * .2)) % 520 + 520) % 520 - 80; c.beginPath(); c.ellipse(cx, 90 + i * 60, 46, 14, 0, 0, 7); c.fill(); }
      c.fillStyle = '#4caf50'; c.fillRect(0, FLOOR, W, H - FLOOR); c.fillStyle = '#3d8f41'; for (let x = 0; x < W; x += 24) c.fillRect(x, FLOOR, 12, H - FLOOR);
      feel.begin(c);
      const sh = clamp(1 - (FLOOR - ball.y) / 600, .2, 1); c.fillStyle = '#00000030'; c.beginPath(); c.ellipse(ball.x, FLOOR + 4, R * sh, 6 * sh, 0, 0, 7); c.fill();
      c.save(); c.translate(ball.x, ball.y); drawBall(c, ball.rot, ball.tumble); c.restore();
      if (foot) { c.globalAlpha = foot.l * 3; c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(foot.x, foot.y, 14 + (1 - foot.l * 3) * 20, 0, 7); c.stroke(); c.globalAlpha = 1; }
      feel.end(c, W, H);
      if (Math.abs(wind) > 20) { c.fillStyle = '#ffffffcc'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = wind > 0 ? 'right' : 'left'; c.fillText(wind > 0 ? 'WIND >>' : '<< WIND', wind > 0 ? W - 12 : 12, 22); }
      if (!ball.live) { c.fillStyle = '#1a3a6acc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap the ball to kick it up', W / 2, 360); }
    },
    down(x, y) {
      const dx = x - ball.x, dy = y - ball.y; if (Math.hypot(dx, dy) > R + 26) return;
      const centre = Math.abs(dx) < 7; ball.live = true; kicks++;
      ball.vy = -Math.min(980, 820 + kicks * 3); ball.vx = clamp(-dx * 9 + ball.vx * .2, -420, 420); ball.spin = -(6 + Math.abs(dx) * .15) * (dy > 0 ? -1 : 1);
      const pts = centre ? 2 : 1; score += pts; api.score(score);
      feel.juice.burst(x, y, { n: centre ? 14 : 6, speed: centre ? 200 : 130, life: .3, size: 3, color: centre ? ['#ffd34a', '#ffffff'] : '#ffffff', shape: 'spark' }); if (centre) feel.juice.shake(2);
      foot = { x, y, l: .3 }; haptic(centre ? 'medium' : 'light'); sfx(centre ? 660 : 440, .06, 'triangle', .06, 120);
      if (centre) feel.juice.pop(ball.x, ball.y - 50, 'SWEET +2', { color: '#1a3a6a', size: 12, font: '"Press Start 2P", monospace', life: .8, rise: 32 });
    },
    key(k, d) { if (d && k === ' ') self.down(ball.x + rnd(-5, 5), ball.y); },
  };
  return self;
}

export default {
  id: 'juggle-kick', title: 'Juggle Kick', tag: 'Casual · Sports', retro: false, w: W, h: H, goal: 25,
  hint: 'Tap the ball to kick it up. Tap off-centre to push it sideways. A dead-centre kick scores 2. Do not let it touch the grass.',
  make,
};
