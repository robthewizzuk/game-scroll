import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { approach } = gs.juice;

// Pull down and let go to toss the bottle onto the next table. It spins at a steady rate,
// so the toss height decides how it lands: upright scores 1, on its cap scores 3, anything else tips over.
const W = 360, H = 640, G = 1800, SPIN = 8, BW = 24, BH = 64, MAXPULL = 220;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let plats, cur, bottle, score, streak, pulling, py0, pull, msg, t, cam, camTo, fall, water;
  function addPlat() {
    const last = plats[plats.length - 1], n = plats.length;
    const w = clamp(110 - n * 3, 46, 110) + rnd(-6, 6);
    plats.push({ x: last.x + rnd(140, 220), y: clamp(last.y + rnd(-90, 90), 300, 540), w, kind: Math.floor(rnd(0, 3)) });
  }
  function land(p, cap) {
    bottle.air = false; bottle.x = p.x; bottle.y = p.y; bottle.a = cap ? Math.PI : 0;
    cur++; streak++; const pts = cap ? 3 : 1; score += pts; api.score(score);
    msg = { txt: cap ? 'CAP! +3' : streak > 2 ? 'x' + streak + ' CLEAN' : 'NICE', life: 1 };
    haptic(cap ? 'success' : 'medium'); sfx(cap ? 880 : 620, .14, 'triangle', .06, 200);
    feel.juice.burst(p.x, p.y, { n: cap ? 22 : 10, speed: cap ? 200 : 120, life: .5, size: 3.5, color: cap ? ['#ffd34a', '#ffffff', '#ff5a5a'] : ['#bfe8ff', '#ffffff'], angle: -Math.PI / 2, arc: 2.4, gravity: 400 }).shake(cap ? 5 : 2);
    addPlat(); camTo = p.x - 100;
  }
  const self = {
    reset() {
      plats = [{ x: 100, y: 470, w: 120, kind: 0 }]; addPlat(); addPlat(); cur = 0; score = 0; streak = 0; pulling = false; pull = 0; msg = null; t = 0;
      cam = 0; camTo = 0; fall = null; water = 0; feel.clear();
      bottle = { x: 100, y: 470, a: 0, air: false, vx: 0, vy: 0, from: 0, cap: false };
    },
    update(dt) {
      feel.update(dt); t += dt; cam = approach(cam, camTo, 5, dt); water += (Math.sin(t * 3) * .1 - water) * dt * 2;
      if (msg) msg.life -= dt;
      if (!bottle.air) return;
      const nxt = plats[cur + 1];
      bottle.vy += G * dt; bottle.x += bottle.vx * dt; bottle.y += bottle.vy * dt; bottle.a += SPIN * dt; water = Math.sin(bottle.a) * .5;
      if (bottle.vy > 0 && bottle.y >= nxt.y && Math.abs(bottle.x - nxt.x) < nxt.w / 2 + 6) {
        const m = ((bottle.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const up = Math.min(m, Math.PI * 2 - m), cap = Math.abs(m - Math.PI);
        if (up < .6) return land(nxt, false);
        if (cap < .36) return land(nxt, true);
        bottle.y = nxt.y; fall = { a: bottle.a, dir: Math.sin(bottle.a) > 0 ? 1 : -1, x: bottle.x, y: nxt.y };
        bottle.air = false; feel.juice.shake(8); haptic('error'); sfx(160, .3, 'triangle', .06, -60); return api.over();
      }
      if (bottle.y > H + 80) { haptic('error'); sfx(140, .3, 'triangle', .06, -60); return api.over(); }
    },
    fx(dt) {
      feel.update(dt);
      if (fall) { fall.a += fall.dir * dt * 6; fall.x += fall.dir * dt * 60; fall.y += dt * 140 * Math.max(0, Math.abs(fall.a % Math.PI) - 1); }
      else if (bottle.air) { bottle.vy += G * dt; bottle.y += bottle.vy * dt; bottle.x += bottle.vx * dt; bottle.a += SPIN * dt; }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ffe7c2'); g.addColorStop(1, '#f2b880'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff40'; for (let i = 0; i < 6; i++) { const wx = ((i * 140 - cam * .3) % 840 + 840) % 840 - 120; c.fillRect(wx, 120, 70, 90); }
      c.save(); c.translate(-cam, 0); feel.begin(c);
      for (const p of plats) {
        const cols = ['#8a5a3c', '#5a6f8f', '#7f8a4c'][p.kind];
        c.fillStyle = cols; c.fillRect(p.x - p.w / 2, p.y, p.w, 12); c.fillStyle = '#00000030'; c.fillRect(p.x - p.w / 2, p.y + 10, p.w, 3);
        c.fillStyle = cols; c.fillRect(p.x - p.w / 2 + 6, p.y + 12, 8, H - p.y); c.fillRect(p.x + p.w / 2 - 14, p.y + 12, 8, H - p.y);
      }
      const b = fall ? { x: fall.x, y: fall.y, a: fall.a } : bottle;
      c.save(); c.translate(b.x, b.y - BH / 2); c.rotate(b.a);   // pivot at the bottle's centre
      const sq = pulling ? 1 - pull / MAXPULL * .12 : 1; c.scale(1 / sq * .98 + .02, sq);
      c.fillStyle = '#bfe8ffcc'; c.beginPath(); c.roundRect(-BW / 2, -BH / 2 + 14, BW, BH - 14, 6); c.fill();
      c.beginPath(); c.moveTo(-BW / 2, -BH / 2 + 16); c.lineTo(-5, -BH / 2 + 4); c.lineTo(5, -BH / 2 + 4); c.lineTo(BW / 2, -BH / 2 + 16); c.fill();
      c.save(); c.beginPath(); c.roundRect(-BW / 2, -BH / 2 + 14, BW, BH - 14, 6); c.clip();
      c.fillStyle = '#3d9dff'; c.beginPath(); c.moveTo(-BW, 10 - water * 10); c.lineTo(BW, 10 + water * 10); c.lineTo(BW, BH); c.lineTo(-BW, BH); c.fill(); c.restore();
      c.fillStyle = '#ff5a5a'; c.fillRect(-6, -BH / 2, 12, 6); c.fillStyle = '#ffffff'; c.fillRect(-BW / 2, 4, BW, 10); c.fillStyle = '#ffffff70'; c.fillRect(-BW / 2 + 3, -BH / 2 + 18, 3, BH - 26);
      c.restore(); feel.end(c, W + cam, H); c.restore();
      if (pulling) {
        const f = pull / MAXPULL; c.fillStyle = '#00000025'; c.fillRect(W - 34, 200, 14, 240);
        c.fillStyle = f > .8 ? '#ff5a5a' : '#ffb03d'; c.fillRect(W - 34, 440 - 240 * f, 14, 240 * f);
      }
      if (!bottle.air && !pulling && !fall && cur === 0) { c.fillStyle = '#00000066'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('pull down, let go to toss ↓', W / 2, H - 30); }
      if (msg && msg.life > 0) { c.globalAlpha = clamp(msg.life * 2, 0, 1); c.fillStyle = '#7a2f0e'; c.font = '400 16px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 160); c.globalAlpha = 1; }
    },
    down(x, y) { if (bottle.air || fall) return; pulling = true; py0 = y; pull = 0; },
    move(x, y) { if (pulling) { const np = clamp(y - py0, 0, MAXPULL); if (Math.floor(np / 30) !== Math.floor(pull / 30)) haptic('tick'); pull = np; } },
    up() {
      if (!pulling) return; pulling = false; if (pull < 12) return;
      const nxt = plats[cur + 1], vy0 = 400 + pull / MAXPULL * 1100, dy = nxt.y - bottle.y;
      // Time until it comes back down to the next table's height (or a long arc if it can't reach it).
      const disc = vy0 * vy0 + 2 * G * dy, tt = disc > 0 ? (vy0 + Math.sqrt(disc)) / G : 2 * vy0 / G;
      bottle.air = true; bottle.vy = -vy0; bottle.vx = disc > 0 ? (nxt.x - bottle.x) / tt : (nxt.x - bottle.x) / tt * .7; bottle.a = bottle.a % (Math.PI * 2);
      haptic('light'); sfx(380, .08, 'triangle', .05, 220);
    },
    key(k, d) { if (k === ' ') { if (d) self.down(0, 0); else { pull = 140; self.up(); } } },
  };
  return self;
}

export default {
  id: 'bottle-flip', title: 'Bottle Flip', tag: 'Casual · Skill', retro: false, w: W, h: H, goal: 8,
  hint: 'Pull down and let go to toss. The pull sets the height, and the height sets how many turns it spins. Land it upright, or on its cap for 3.',
  make,
};
