// Penalty Striker: you take the kicks. Swipe up from the ball toward the goal: the direction aims, a
// faster swipe lifts the ball higher (too fast sails over the bar), and a curved swipe bends the shot.
// The keeper reads the line you swipe, so bend it round them. A sometimes-there wall gets in the way.
// The keeper is a Tiny Brains rival with a memory. For each kick it picks how to go: read your straight
// line (as before), allow for the bend you usually put on it, guess your favourite side early, or stand
// tall in the middle. It feels each kick (a fingertip save or a goal just past the glove is the exciting
// one) and remembers which way of keeping made a close call against this striker; the win-rate rail
// keeps it fair. A gold sparkle on the keeper means it is going on what it remembered.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { clamp, rnd } = gs.util;
const { approach } = gs.juice;
const { Brain } = gs.brains;
const { sounds } = gs.sound;
const READS = ['line', 'bend', 'guess', 'stay'];

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let swipe, shot, keeper, wall, score, misses, kicks, t, msg, ml, wait, sparkle = 0;
  // how this striker shoots, kept across rounds: the bend they put on it, the side they go for and how
  // high, each smoothed over the last few kicks (-1..1)
  const trend = { curl: 0, side: 0, high: 0 };
  // see: 0..2 the habits above, 3 how far into the round (kicks), 4 misses so far
  const see = () => [trend.curl, trend.side, trend.high, clamp(kicks / 12, 0, 1) * 2 - 1, misses - 1];
  const gk = new Brain(api, {
    name: 'penalty-striker-keeper', inputs: 5, actions: READS, memory: true, target: .7,
    // the teacher: allow for a striker who always bends it, else read the line
    teacher: s => Math.abs(s[0]) > .4 ? 'bend' : 'line',
    limits: { react: .1, perSecond: 10, minNoise: .08 },
  });
  const G = () => ({ l: W * .12, r: W * .88, top: 150, bot: 270 });
  const BALL = () => ({ x: W / 2, y: H - 130 });

  function setup() {
    shot = null; wait = 0;
    keeper = { x: W / 2, y: G().bot - 30, tx: W / 2, dive: 0, sway: rnd(0, 6) };
    wall = kicks >= 3 && Math.random() < .5 ? { x: W / 2 + rnd(-60, 60), n: 2 + (Math.random() * 2 | 0) } : null;
  }

  return {
    reset() { score = 0; misses = 0; kicks = 0; t = 0; msg = ''; ml = 0; swipe = null; setup(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; sparkle = Math.max(0, sparkle - dt);
      const g = G();
      if (!shot) { keeper.x = W / 2 + Math.sin(t * 1.4 + keeper.sway) * (30 + Math.min(40, kicks * 4)); return; }
      if (wait > 0) { wait -= dt; if (wait <= 0) { if (misses >= 3) return api.over(); setup(); } return; }
      shot.k += dt / shot.dur;
      // keeper reacts to the straight line you swiped, a beat late
      if (shot.k > .18) { keeper.x = approach(keeper.x, keeper.tx, (260 + kicks * 8) * (.85 + .3 * gk.skill), dt); keeper.dive = Math.min(1, keeper.dive + dt * 4); }
      const k = Math.min(1, shot.k), b = BALL();
      shot.x = b.x + (shot.gx - b.x) * k + Math.sin(k * Math.PI) * shot.curl * 70 + shot.curl * 50 * k * k;
      shot.y = b.y + (shot.gy - b.y) * k;
      // the wall blocks low shots that pass through it at the right moment
      if (wall && !shot.wallDone && k > .45) {
        shot.wallDone = true;
        const ww = wall.n * 26, hgt = (b.y - shot.gy) * .45 + (shot.gy < g.bot - 70 ? 60 : 0);
        if (Math.abs(shot.x - wall.x) < ww / 2 && hgt < 70) return end('BLOCKED', false);
      }
      if (shot.k >= 1) {
        const x = shot.x, y = shot.gy;
        if (y < g.top) return end('OVER THE BAR', false);
        if (x < g.l || x > g.r) return end('WIDE', false);
        const kx = keeper.x, ky = keeper.y - keeper.dive * (keeper.y - y) * .6;
        if (Math.abs(x - kx) < 38 && Math.abs(y - ky) < 46) return end('SAVED!', false);
        const corner = (x < g.l + 40 || x > g.r - 40) && y < g.top + 45;
        return end(corner ? 'TOP CORNER! +3' : 'GOAL!', true, corner ? 3 : 1);
      }
    },
    draw(c) {
      c.fillStyle = '#1b4332'; c.fillRect(0, 0, W, H);
      // crowd
      for (let y = 20; y < 120; y += 10) for (let x = (y / 10 % 2) * 6; x < W; x += 12) { c.fillStyle = ['#e63946', '#f1faee', '#457b9d', '#ffd166'][(x * 7 + y * 3) % 4]; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); }
      c.fillStyle = '#2d6a4f'; c.fillRect(0, 120, W, H - 120);
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#40916c' : '#2d6a4f'; c.fillRect(0, 270 + i * 50, W, 50); }
      const g = G();
      // net and frame
      c.strokeStyle = '#ffffff40'; c.lineWidth = 1;
      for (let x = g.l; x <= g.r; x += 12) { c.beginPath(); c.moveTo(x, g.top); c.lineTo(x, g.bot); c.stroke(); }
      for (let y = g.top; y <= g.bot; y += 12) { c.beginPath(); c.moveTo(g.l, y); c.lineTo(g.r, y); c.stroke(); }
      c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.moveTo(g.l, g.bot); c.lineTo(g.l, g.top); c.lineTo(g.r, g.top); c.lineTo(g.r, g.bot); c.stroke();
      c.strokeStyle = '#ffffff90'; c.lineWidth = 2; c.strokeRect(W * .2, g.bot, W * .6, 60); c.beginPath(); c.arc(W / 2, H - 130, 3, 0, 7); c.stroke();
      feel.begin(c);
      // keeper
      const ky = keeper.y - (shot ? keeper.dive * 20 : 0), lean = shot ? clamp((keeper.tx - keeper.x) / 80, -1, 1) * keeper.dive : 0;
      c.save(); c.translate(keeper.x, ky); c.rotate(lean * .9);
      c.fillStyle = '#ffb703'; c.fillRect(-14, -20, 28, 34); c.fillStyle = '#023047'; c.fillRect(-12, 14, 10, 18); c.fillRect(2, 14, 10, 18);
      c.fillStyle = '#ffb703'; c.fillRect(-34, -18, 20, 8); c.fillRect(14, -18, 20, 8); c.fillStyle = '#8ecae6'; c.fillRect(-40, -20, 8, 12); c.fillRect(32, -20, 8, 12);
      c.fillStyle = '#e0a370'; c.beginPath(); c.arc(0, -30, 10, 0, 7); c.fill();
      if (sparkle > 0) {   // the keeper remembers what worked against you
        const r = 5 + Math.sin(t * 14) * 1.5; c.globalAlpha = Math.min(1, sparkle * 2); c.fillStyle = '#ffd166'; c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .4 : r; c.lineTo(14 + Math.cos(a) * rr, -44 + Math.sin(a) * rr); }
        c.fill(); c.globalAlpha = 1;
      }
      c.restore();
      // wall
      if (wall) { const y = H * .52; for (let i = 0; i < wall.n; i++) { const x = wall.x - wall.n * 13 + 13 + i * 26; c.fillStyle = '#e63946'; c.fillRect(x - 11, y - 30, 22, 34); c.fillStyle = '#e0a370'; c.beginPath(); c.arc(x, y - 38, 9, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(x - 11, y + 4, 22, 24); } }
      // ball
      const b = BALL(), bx = shot ? shot.x : b.x, by = shot ? shot.y : b.y, k = shot ? Math.min(1, shot.k) : 0, r = 14 * (1 - k * .55), lift = shot ? Math.sin(k * Math.PI) * (b.y - shot.gy) * .12 : 0;
      c.fillStyle = '#00000040'; c.beginPath(); c.ellipse(bx, by + r * .8, r, r * .35, 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by - lift, r, 0, 7); c.fill();
      c.fillStyle = '#212529'; c.beginPath(); c.arc(bx + Math.cos(t * 20 * (shot ? 1 : 0)) * r * .3, by - lift, r * .35, 0, 7); c.fill();
      feel.end(c, W, H);
      // your swipe
      if (swipe && swipe.pts.length > 1) { c.strokeStyle = '#ffffff90'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); swipe.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); }
      c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '700 15px Rubik, sans-serif'; c.fillText(`kicks ${kicks}`, 16, H - 22);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < 3 - misses ? '#fff' : '#ffffff30'; c.beginPath(); c.arc(W - 24 - i * 22, H - 28, 7, 0, 7); c.fill(); }
      c.textAlign = 'center';
      if (ml > 0) { c.fillStyle = '#ffd166'; c.font = '800 30px Rubik, sans-serif'; c.fillText(msg, W / 2, H * .62); }
      if (!kicks && !shot) { c.fillStyle = '#fff'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Swipe up from the ball', W / 2, H - 70); c.font = '500 14px Rubik, sans-serif'; c.fillText('Curve the swipe to bend it', W / 2, H - 50); }
    },
    down(x, y) { if (shot) return; swipe = { pts: [{ x, y, t }] }; },
    move(x, y, pr) { if (!pr || !swipe) return; swipe.pts.push({ x, y, t }); },
    up(x, y) {
      if (!swipe || shot) { swipe = null; return; }
      const p = swipe.pts; swipe = null;
      const a = p[0], z = p[p.length - 1], dy = a.y - z.y;
      if (p.length < 3 || dy < 40) return;
      const dt = Math.max(.05, z.t - a.t), speed = Math.hypot(z.x - a.x, dy) / dt;
      // aim along the swipe; the swipe's bow (how far its middle strays from the straight line) is curl
      const m = p[p.length >> 1], len = Math.hypot(z.x - a.x, dy), side = ((m.x - a.x) * (z.y - a.y) - (m.y - a.y) * (z.x - a.x)) / len;
      const g = G(), b = BALL(), toGoal = b.y - (g.top + g.bot) / 2;
      const gx = b.x + (z.x - a.x) / dy * toGoal, gy = g.bot - clamp((speed - 500) / 1300, 0, 1.4) * (g.bot - g.top);
      const curl = clamp(-side / 40, -1.2, 1.2);
      shot = { k: 0, dur: clamp(900 / speed, .45, .8), gx, gy, curl, x: b.x, y: b.y };
      // the keeper picks how to read this kick: the straight line, the line plus your usual bend, your
      // favourite side, or the middle (each with some error)
      gk.act(see(), 1); sparkle = gk.remembered ? 1.4 : 0; if (sparkle) sounds.twinkle();
      const read = gk.action, mid = (g.l + g.r) / 2;
      const guess = read === 'bend' ? gx + trend.curl * 40 : read === 'guess' ? mid + trend.side * (g.r - g.l) * .3 : read === 'stay' ? mid : gx;
      keeper.tx = clamp(guess + rnd(-30, 30) * (read === 'stay' ? .3 : 1), g.l + 20, g.r - 20); keeper.dive = 0;
      trend.curl += (curl - trend.curl) * .3;
      trend.side += (clamp((gx - mid) / ((g.r - g.l) * .4), -1, 1) - trend.side) * .3;
      trend.high += (clamp((g.bot - gy) / (g.bot - g.top) * 2 - 1, -1, 1) - trend.high) * .3;
      kicks++; noise(.06, { vol: .06, from: 600, to: 200 }); sfx(120, .08, 'square', .05); haptic('medium');
    },
  };

  function end(why, goal, pts = 1) {
    msg = why; ml = 1.3; wait = 1.2;
    // what the keeper learns: a save by the fingertips or a goal just past the glove is the close call;
    // a goal it was nowhere near is dull, and a kick that missed by itself says nothing about the keeping
    const miss = Math.abs(shot.x - keeper.x);
    if (why === 'SAVED!') gk.feel(miss > 24 ? 1 : .15);
    else if (goal) gk.feel(miss < 70 ? .8 : -.3);
    else gk.feel(0);
    gk.result(goal);
    if (goal) { score += pts; api.score(score); notes(pts > 1 ? 'C5 E5 G5 C6' : 'C5 G5', { len: .06 }); feel.win(shot.x, shot.gy); haptic('success'); }
    else { misses++; feel.hurt(shot.x, shot.gy); haptic(why === 'SAVED!' ? 'heavy' : 'warning'); sfx(150, .2, 'triangle', .04); }
    shot.k = 1;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'penalty-striker',
  title: 'Penalty Striker',
  tag: 'Casual · Sport',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 15,
  hint: 'Swipe up from the ball to shoot: faster lifts it higher, a curved swipe bends it round the keeper. Three misses and it is over.',
  make,
};
