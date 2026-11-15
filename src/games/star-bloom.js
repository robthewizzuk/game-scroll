import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { approach } = gs.juice;

// Vertical space shooter. Drag anywhere to fly; your ship fires on its own. Catch the P orbs to
// widen your shot. A hit knocks your power down a level, and a hit with no power left ends the run.
// Every sixth wave a big flagship arrives.
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false });                              // the guns and the waves wait for the first touch
  let ship, shots, ebul, foes, orbs, parts, stars, power, wave, waveT, boss, score, t, fireT, drag, inv, msg, dead;
  function spawnWave() {
    wave++;
    if (wave % 6 === 0) { boss = { x: W / 2, y: -30, hp: 50 + wave * 6, max: 50 + wave * 6, t: 0 }; msg = { txt: 'WARNING! FLAGSHIP', l: 2 }; sfx(120, .8, 'sawtooth', .05, 60); haptic('heavy'); return; }
    const kind = ['line', 'dive', 'pods', 'line', 'dive'][Math.random() * (wave < 3 ? 2 : 5) | 0], sp = 1 + wave * .04;
    if (kind === 'line') { const side = Math.random() < .5, n = 5 + (wave > 6); for (let i = 0; i < n; i++) foes.push({ k: 'swoop', x: side ? -10 - i * 14 : W + 10 + i * 14, y: 20 + rnd(0, 20), vx: (side ? 55 : -55) * sp, t: -i * .2, hp: 1, drop: i === n - 1 }); }
    else if (kind === 'dive') { for (let i = 0; i < 3 + (wave > 8); i++) foes.push({ k: 'dive', x: rnd(16, W - 16), y: -10 - i * 18, t: 0, hp: 2, sp: 70 * sp, drop: i === 0 && Math.random() < .5 }); }
    else { for (let i = 0; i < 2 + (W > 200); i++) foes.push({ k: 'pod', x: (i + 1) * W / (3 + (W > 200)), y: -12, t: rnd(0, 1), hp: 5, drop: true }); }
  }
  function fire() {
    const lanes = [[0, 0], [-4, -40, 4, 40], [0, 0, -5, -70, 5, 70], [-3, -20, 3, 20, -7, -90, 7, 90]][power];
    for (let i = 0; i < lanes.length; i += 2) shots.push({ x: ship.x + lanes[i], y: ship.y - 6, vx: lanes[i + 1] || 0, vy: -260 });
    sfx(1400, .02, 'square', .015, -600);
  }
  function boom(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-70, 70), vy: rnd(-70, 70), l: rnd(.2, .5), col }); }
  function hurt() {
    if (inv > 0 || dead) return;
    feel.juice.shake(power > 0 ? 3 : 5);
    if (power > 0) { power--; inv = 1.5; msg = { txt: 'POWER DOWN', l: 1 }; haptic('heavy'); sfx(200, .3, 'square', .05, -120); ebul = []; boom(ship.x, ship.y, '#f8d838'); }
    else { dead = 1; boom(ship.x, ship.y, '#f86030', 24); haptic('error'); sfx(90, .7, 'sawtooth', .06, -40); }
  }
  function aimShot(x, y, sp) { const dx = ship.x - x, dy = ship.y - y, d = Math.hypot(dx, dy) || 1; ebul.push({ x, y, vx: dx / d * sp, vy: dy / d * sp }); }
  const self = {
    reset() {
      ship = { x: W / 2, y: H - 24 }; shots = []; ebul = []; foes = []; orbs = []; parts = []; power = 1; wave = 0; waveT = 1.2; boss = null; score = 0; t = 0; fireT = 0; drag = null; inv = 0; msg = null; dead = 0; self.keys = 0; feel.clear(); ready.reset();
      stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: rnd(.3, 1) }));
    },
    resize(w, h) { if (ship) { ship.x *= w / W; ship.y = clamp(ship.y + h - H, 10, h - 8); } W = w; H = h; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; inv = Math.max(0, inv - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      for (const s of stars) { s.y += s.z * dt * .25; if (s.y > 1) { s.y = 0; s.x = Math.random(); } }
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; } parts = parts.filter(p => p.l > 0);
      if (dead) { dead -= dt * .8; if (dead <= 0) return api.over(); return; }
      if (self.keys) { ship.x = clamp(ship.x + self.keys * 110 * dt, 6, W - 6); }
      fireT -= dt; if (fireT <= 0) { fireT = .13; fire(); }
      for (const s of shots) { s.x += s.vx * dt; s.y += s.vy * dt; } shots = shots.filter(s => s.y > -6 && s.x > -6 && s.x < W + 6);
      for (const b of ebul) { b.x += b.vx * dt; b.y += b.vy * dt; if (Math.abs(b.x - ship.x) < 3 && Math.abs(b.y - ship.y) < 4) { b.dead = true; hurt(); } }
      ebul = ebul.filter(b => !b.dead && b.y < H + 6 && b.y > -10 && b.x > -6 && b.x < W + 6);
      if (!foes.length && !boss) { waveT -= dt; if (waveT <= 0) { spawnWave(); waveT = 1; } }
      const rate = Math.max(.7, 2 - wave * .05);
      for (const f of foes) {
        f.t += dt; if (f.t < 0) continue;
        if (f.k === 'swoop') { f.x += f.vx * dt; f.y += Math.sin(f.t * 3) * 30 * dt + 8 * dt; if (Math.random() < dt / (rate * 2.2)) aimShot(f.x, f.y, 70); if (f.x < -40 || f.x > W + 40) f.gone = true; }
        else if (f.k === 'dive') { if (f.t < .8) f.y += 40 * dt; else { if (!f.v) { const dx = ship.x - f.x, dy = ship.y - f.y, d = Math.hypot(dx, dy) || 1; f.v = [dx / d * f.sp, dy / d * f.sp]; } f.x += f.v[0] * dt; f.y += f.v[1] * dt; } if (f.y > H + 12) f.gone = true; }
        else { if (f.y < 30) f.y += 25 * dt; else { f.y += 4 * dt; if (f.t % rate < dt) { for (const a of [-.25, 0, .25]) { const dx = ship.x - f.x, dy = ship.y - f.y, ang = Math.atan2(dy, dx) + a; ebul.push({ x: f.x, y: f.y + 5, vx: Math.cos(ang) * 75, vy: Math.sin(ang) * 75 }); } sfx(300, .05, 'square', .02); } } if (f.y > H + 12) f.gone = true; }
        if (Math.abs(f.x - ship.x) < 7 && Math.abs(f.y - ship.y) < 7) { f.hp = 0; hurt(); }
        for (const s of shots) if (!s.dead && Math.abs(s.x - f.x) < 6 && Math.abs(s.y - f.y) < 6) { s.dead = true; f.hp--; f.flash = .06; }
        if (f.hp <= 0 && !f.gone) { f.gone = true; score++; api.score(score); boom(f.x, f.y, f.k === 'pod' ? '#38b8e8' : '#e868b8'); sfx(220, .1, 'square', .03, -100); haptic('tick'); if (f.drop) orbs.push({ x: f.x, y: f.y }); }
        f.flash = Math.max(0, (f.flash || 0) - dt);
      }
      foes = foes.filter(f => !f.gone); shots = shots.filter(s => !s.dead);
      if (boss) {
        boss.t += dt; boss.y = approach(boss.y, 34, 1.5, dt); boss.x = W / 2 + Math.sin(boss.t * .7) * (W / 2 - 30);
        if (boss.t > 1.5 && boss.t % 1.6 < dt) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + boss.t; ebul.push({ x: boss.x, y: boss.y + 6, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55 }); } sfx(180, .1, 'square', .03); }
        if (boss.t > 2 && boss.t % 2.3 < dt) { for (let k = 0; k < 3; k++) aimShot(boss.x + (k - 1) * 12, boss.y + 8, 95); }
        for (const s of shots) if (!s.dead && Math.abs(s.x - boss.x) < 22 && Math.abs(s.y - boss.y) < 10) { s.dead = true; boss.hp--; boss.flash = .05; }
        boss.flash = Math.max(0, (boss.flash || 0) - dt);
        if (boss.hp <= 0) { score += 10; api.score(score); for (let i = 0; i < 5; i++) boom(boss.x + rnd(-20, 20), boss.y + rnd(-8, 8), i % 2 ? '#f8d838' : '#f86030', 10); orbs.push({ x: boss.x, y: boss.y }); boss = null; ebul = []; msg = { txt: 'FLAGSHIP DOWN!', l: 1.5 }; haptic('success'); sfx(600, .6, 'square', .05, 600); }
      }
      for (const o of orbs) { o.y += 40 * dt; if (Math.abs(o.x - ship.x) < 8 && Math.abs(o.y - ship.y) < 8) { o.got = true; if (power < 3) power++; else { score += 3; api.score(score); } haptic('success'); sfx(900, .15, 'triangle', .05, 500); msg = { txt: power < 3 ? 'POWER UP' : 'MAX +3', l: .8 }; } }
      orbs = orbs.filter(o => !o.got && o.y < H + 8);
    },
    fx(dt) { feel.update(dt); for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; } parts = parts.filter(p => p.l > 0); },
    draw(c) {
      c.fillStyle = '#0c0820'; c.fillRect(0, 0, W, H);
      const neb = c.createRadialGradient(W * .7, H * .3, 0, W * .7, H * .3, W * .8); neb.addColorStop(0, '#3a1858'); neb.addColorStop(1, '#0c082000'); c.fillStyle = neb; c.fillRect(0, 0, W, H);
      for (const s of stars) { c.fillStyle = s.z > .8 ? '#f8f8f0' : s.z > .5 ? '#a0a0d0' : '#505080'; c.fillRect(s.x * W | 0, s.y * H | 0, 1, s.z > .8 ? 2 : 1); }
      feel.begin(c);
      for (const o of orbs) { const b = (t * 6 | 0) % 2; c.fillStyle = b ? '#f8d838' : '#f88830'; c.fillRect(o.x - 4, o.y - 4, 8, 8); c.fillStyle = '#101018'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('P', o.x + .5, o.y + 3); }
      for (const f of foes) {
        if (f.t < 0) continue; const x = Math.round(f.x), y = Math.round(f.y), fl = f.flash > 0;
        if (f.k === 'swoop') { c.fillStyle = fl ? '#fff' : '#e868b8'; c.fillRect(x - 5, y - 2, 10, 4); c.fillRect(x - 2, y - 4, 4, 8); c.fillStyle = '#f8d838'; c.fillRect(x - 1, y - 1, 2, 2); }
        else if (f.k === 'dive') { c.fillStyle = fl ? '#fff' : '#58c040'; c.fillRect(x - 4, y - 4, 8, 6); c.fillRect(x - 6, y - 6, 2, 6); c.fillRect(x + 4, y - 6, 2, 6); c.fillStyle = '#e04040'; c.fillRect(x - 1, y, 2, 3); }
        else { c.fillStyle = fl ? '#fff' : '#3858d8'; c.fillRect(x - 7, y - 5, 14, 10); c.fillStyle = '#38b8e8'; c.fillRect(x - 5, y - 3, 10, 4); c.fillStyle = '#101018'; c.fillRect(x - 1, y + 2, 2, 4); }
      }
      if (boss) {
        const x = Math.round(boss.x), y = Math.round(boss.y), fl = boss.flash > 0;
        c.fillStyle = fl ? '#fff' : '#883048'; c.fillRect(x - 24, y - 6, 48, 12); c.fillRect(x - 14, y - 12, 28, 6); c.fillStyle = fl ? '#fff' : '#c84868'; c.fillRect(x - 20, y - 4, 40, 4);
        c.fillStyle = '#f8d838'; c.fillRect(x - 3, y + 2, 6, 6); c.fillStyle = '#38b8e8'; c.fillRect(x - 10, y - 10, 4, 3); c.fillRect(x + 6, y - 10, 4, 3);
        const by = Math.round(api.scoreArea().bottom + 2);   // the flagship's health bar sits below the app's score badge
        c.fillStyle = '#ffffff40'; c.fillRect(20, by, W - 40, 3); c.fillStyle = '#f86030'; c.fillRect(20, by, (W - 40) * boss.hp / boss.max, 3);
      }
      c.fillStyle = '#f8f0a0'; for (const s of shots) c.fillRect(s.x - .5 | 0, s.y | 0, 1, 4);
      for (const b of ebul) { c.fillStyle = (t * 12 | 0) % 2 ? '#f86030' : '#f8d838'; c.fillRect(b.x - 1 | 0, b.y - 1 | 0, 3, 3); }
      if (!dead && !(inv > 0 && (t * 14 | 0) % 2)) {
        const x = Math.round(ship.x), y = Math.round(ship.y);
        c.fillStyle = '#e8e8f0'; c.fillRect(x - 1, y - 6, 2, 10); c.fillRect(x - 3, y - 2, 6, 6); c.fillStyle = '#38b8e8'; c.fillRect(x - 6, y + 1, 12, 3); c.fillStyle = '#e04040'; c.fillRect(x - 6, y + 1, 1, 3); c.fillRect(x + 5, y + 1, 1, 3); c.fillStyle = '#58d8f8'; c.fillRect(x - 1, y - 2, 2, 2);
        c.fillStyle = (t * 20 | 0) % 2 ? '#f8d838' : '#f86030'; c.fillRect(x - 1, y + 4, 2, 2 + (t * 20 | 0) % 2);
      }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x | 0, p.y | 0, 2, 2); }
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#a0a0d0'; c.fillText(`W${wave}`, 3, 8);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < power ? '#f8d838' : '#383858'; c.fillRect(W - 6 - i * 5, 3, 3, 5); }
      if (msg) { c.textAlign = 'center'; c.fillStyle = msg.txt.startsWith('WARN') && (t * 6 | 0) % 2 ? '#f86030' : '#f8f8f0'; c.fillText(msg.txt, W / 2, H * .45); }
      if (!ready.waiting && t < 4) { c.textAlign = 'center'; c.fillStyle = '#a0a0d0'; c.fillText('DRAG TO FLY', W / 2, H - 4); }
      ready.draw(c, W, H, { pixel: true, color: '#a0a0d0', y: H - 7, text: 'DRAG TO FLY' });
    },
    down(x, y) { ready.go(); drag = { x, y, sx: ship.x, sy: ship.y }; },
    move(x, y, p) { if (!p || !drag || dead) return; ship.x = clamp(drag.sx + (x - drag.x) * 1.3, 6, W - 6); ship.y = clamp(drag.sy + (y - drag.y) * 1.3, 20, H - 8); },
    up() { drag = null; },
    key(k, d) { if (d) ready.go(); if (k === 'ArrowLeft' || k === 'ArrowRight') self.keys = d ? (k === 'ArrowLeft' ? -1 : 1) : 0; },
  };
  return self;
}

export default {
  id: 'star-bloom', title: 'Star Bloom', tag: 'Advance · Shooter', retro: true, era: 'advance', pal: 'grape', w: 160, h: 160, maxW: 240, maxH: 300, goal: 60,
  hint: 'Drag anywhere to fly; you fire on your own. Grab P orbs to widen your shot. A hit costs a power level, and a hit with none left ends the run. A flagship arrives every sixth wave.',
  make,
};
