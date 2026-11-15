// Paper Plane: glide a folded paper plane across the rooftops. Hold and drag up or down to tip the nose
// (or tilt the phone). Diving gains speed, climbing spends it, and too slow means a stall. Warm air
// rising from the chimney vents lifts you for free. Don't clip a building.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { Feel } = gs.effects;
const { haptic, tilt, want } = gs.device;
const { sfx, bed } = gs.sound;
const { clamp, rnd } = gs.util;
const { approach } = gs.juice;

let W = 360, H = 640;
const G = 260;

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel();
  let p, cam, blocks, vents, stars, nextX, score, dist, starsN, t, steer, drag0, dead, gust, wind, trail;
  want('motion');

  function more() {
    while (nextX < cam + W * 2) {
      const w = rnd(60, 120), h = rnd(H * .15, H * .5 + Math.min(H * .12, dist / 60)), x = nextX;
      blocks.push({ x, w, h, win: Math.random() * 1000 | 0, col: ['#3d405b', '#4a4e69', '#22223b', '#5c5470'][Math.random() * 4 | 0] });
      if (Math.random() < .5) vents.push({ x: x + w / 2, top: H - h, power: rnd(260, 380) });
      if (Math.random() < .7) stars.push({ x: x + w + rnd(10, 60), y: H - h - rnd(60, 220), got: false });
      nextX += w + rnd(40, 140) - Math.min(30, dist / 200);
    }
  }

  return {
    reset() { ready.reset(); p = { x: 60, y: H * .3, v: 170, a: 0 }; cam = 0; blocks = []; vents = []; stars = []; nextX = 300; score = 0; dist = 0; starsN = 0; t = 0; steer = 0; drag0 = null; dead = 0; gust = 0; trail = []; wind = null; more(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      if (!ready.playing) return;
      t += dt;
      if (!wind) wind = bed({ vol: .02, from: 500, gusts: .5 });
      if (dead) { dead += dt; p.y += 200 * dt; p.a += 3 * dt; if (dead > 1.2) api.over(); return; }
      // steering: finger drag, else tilt
      let want = steer;
      if (drag0 == null) { const tl = tilt(); if (tl) want = clamp(tl.y * 1.6, -1, 1); }
      p.a = approach(p.a, want * .9, 3, dt);
      // glide: diving speeds up, climbing slows down; slow planes sink and pitch down
      p.v += G * Math.sin(p.a) * dt - p.v * .05 * dt;
      p.v = clamp(p.v, 60, 420);
      let vy = Math.sin(p.a) * p.v + (p.v < 120 ? (120 - p.v) * 1.4 : 0) + 18;
      if (p.v < 95) { p.a = approach(p.a, .8, 2, dt); if (Math.random() < dt * 8) haptic('tick'); }
      // warm air from the vents
      for (const v of vents) if (Math.abs(p.x - v.x) < 26 && p.y < v.top && p.y > v.top - 260) { vy -= v.power * (1 - (v.top - p.y) / 280); if (Math.random() < dt * 6) haptic('light'); }
      gust = Math.sin(t * .7) * Math.sin(t * 1.9) * 40;
      p.x += Math.cos(p.a) * p.v * dt; p.y += (vy + gust) * dt;
      if (p.y < 20) { p.y = 20; p.a = Math.max(p.a, 0); }
      cam = p.x - W * .3;
      for (const b of blocks) if (p.x + 10 > b.x && p.x - 10 < b.x + b.w && p.y + 4 > H - b.h) { dead = .01; feel.boom(p.x - cam, p.y, { size: .8 }); feel.lose(); haptic('error'); return; }
      if (p.y > H - 6) { dead = .01; feel.hurt(p.x - cam, p.y); feel.lose(); return; }
      for (const s of stars) if (!s.got && Math.hypot(s.x - p.x, s.y - p.y) < 20) { s.got = true; starsN++; feel.coin(s.x - cam, s.y); }
      const d = Math.floor(p.x / 120); if (d > dist) dist = d;
      const sc = dist + starsN * 3; if (sc !== score) { score = sc; api.score(score); }
      if (Math.random() < dt * 30) trail.push({ x: p.x, y: p.y, l: .5 });
      for (const tr of trail) tr.l -= dt; trail = trail.filter(tr => tr.l > 0);
      blocks = blocks.filter(b => b.x + b.w > cam - 50); vents = vents.filter(v => v.x > cam - 50); stars = stars.filter(s => s.x > cam - 50);
      wind?.set({ vol: .02 + p.v / 8000, from: 300 + p.v * 2 }, .2);
      more();
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ffb4a2'); g.addColorStop(.6, '#ffcdb2'); g.addColorStop(1, '#e5989b'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff4e6'; c.beginPath(); c.arc(W * .75, H * .22, 40, 0, 7); c.fill();
      // far skyline
      c.fillStyle = '#b5838d80'; for (let i = 0; i < 14; i++) { const x = ((i * 70 - cam * .3) % (W + 140) + W + 140) % (W + 140) - 70, h = 80 + (i * 53) % 140; c.fillRect(x, H - h - 40, 50, h + 40); }
      feel.begin(c);
      c.save(); c.translate(-cam, 0);
      for (const v of vents) { c.fillStyle = '#ffffff26'; for (let k = 0; k < 6; k++) { const y = v.top - ((t * 90 + k * 45) % 260); c.beginPath(); c.arc(v.x + Math.sin(y * .05 + k) * 8, y, 6 + k, 0, 7); c.fill(); } }
      for (const b of blocks) {
        c.fillStyle = b.col; c.fillRect(b.x, H - b.h, b.w, b.h);
        c.fillStyle = '#ffd16690'; for (let y = H - b.h + 14; y < H - 10; y += 22) for (let x = b.x + 10; x < b.x + b.w - 12; x += 18) if (((x * 7 + y * 3 + b.win) % 5) < 2) c.fillRect(x, y, 8, 10);
        c.fillStyle = '#00000030'; c.fillRect(b.x, H - b.h, b.w, 6);
      }
      for (const v of vents) { c.fillStyle = '#6d6875'; c.fillRect(v.x - 8, v.top - 14, 16, 14); }
      for (const s of stars) if (!s.got) { c.fillStyle = '#ffd166'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 5 : 12; c.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); } c.fill(); }
      c.strokeStyle = '#ffffff70'; c.lineWidth = 2; c.beginPath(); trail.forEach((tr, i) => i ? c.lineTo(tr.x, tr.y) : c.moveTo(tr.x, tr.y)); c.stroke();
      // the plane
      c.save(); c.translate(p.x, p.y); c.rotate(p.a);
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(18, 0); c.lineTo(-14, -9); c.lineTo(-8, 0); c.lineTo(-14, 6); c.closePath(); c.fill();
      c.fillStyle = '#dee2e6'; c.beginPath(); c.moveTo(18, 0); c.lineTo(-8, 0); c.lineTo(-12, 5); c.closePath(); c.fill();
      c.restore();
      c.restore();
      feel.end(c, W, H);
      c.fillStyle = '#ffffffd0'; c.font = '600 13px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(`${Math.round(p.v / 4)} km/h${p.v < 100 ? '  STALL!' : ''}`, 16, H - 20);
      if (!ready.playing || t < 4) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '700 17px Rubik, sans-serif'; c.fillText('Hold and drag up or down to steer', W / 2, H * .62); c.font = '500 14px Rubik, sans-serif'; c.fillText('Ride the warm air over the vents', W / 2, H * .62 + 22); }
    },
    down(x, y) { ready.go(); drag0 = y; steer = 0; },
    move(x, y, pr) { if (pr && drag0 != null) steer = clamp((y - drag0) / 70, -1, 1); },
    up() { drag0 = null; steer = 0; },
    key(k, d) { if (d) ready.go(); if (k === 'ArrowUp') steer = d ? -1 : 0; if (k === 'ArrowDown') steer = d ? 1 : 0; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'paper-plane',
  title: 'Paper Plane',
  tag: 'Casual · Glide',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 60,
  hint: 'Hold and drag up or down (or tilt) to tip the paper plane. Dive for speed, ride warm air over the vents, and don\'t hit a building.',
  make,
};
