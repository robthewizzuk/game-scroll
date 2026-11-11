// Ripple Pond: ducklings drift on a slow current toward the weir. Tap the water to send out a ripple ring
// that pushes floating things AWAY from where you tapped (weaker further out), so tap behind a duckling to
// nudge it into the reed nest. Lily pads and logs float too and can bump ducklings along.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { sfx, notes } = gs.sound;
const { haptic } = gs.device;
const { rnd, clamp } = gs.util;

// fluid height: the weir stays at the bottom, and the current and the nest's spot scale with the pond's
// length (span: spawn line to weir), so a duckling takes the same time to reach the weir at every height.
const W = 360, BANK = 26, REACH = 230, PUSH = 240, SPAN0 = 596;

function make(api) {
  const feel = new Feel({ sound: false });
  const ready = new Ready();
  let H = 640, WEIR = H - 64;
  const k = () => (WEIR + 20) / SPAN0, flow = () => cur * k();
  let things, rings, nest, level, lives, score, toSpawn, spawnT, cur, t, streaks, cool, msg, msgT;

  function add(kind, x, y) {
    const r = kind === 'duck' ? 14 : kind === 'pad' ? 19 : 22;
    const o = { kind, x, y, vx: 0, vy: 0, r, m: r * r, ang: rnd(0, 7), spin: rnd(-.4, .4), bob: rnd(0, 7) };
    things.push(o); return o;
  }
  function startLevel() {
    cur = Math.min(62, 18 + level * 5);
    toSpawn = Math.min(8, 2 + level); spawnT = .5;
    things = things.filter(o => o.kind === 'duck');
    nest = { x: rnd(80, W - 80), y: -20 + (rnd(170, 360) + 20) * k(), r: 32, pulse: 0 };
    const n = 2 + Math.min(4, level);
    for (let i = 0; i < n; i++) {
      let x, y, k = 0;
      do { x = rnd(BANK + 30, W - BANK - 30); y = rnd(140, WEIR - 120); k++; } while (k < 20 && Math.hypot(x - nest.x, y - nest.y) < 80);
      add(i % 3 === 2 ? 'log' : 'pad', x, y);
    }
    msg = `LEVEL ${level}`; msgT = 1.6;
  }
  function ripple(x, y) {
    if (cool > 0) return;
    cool = .22; rings.push({ x, y, r: 0, hit: new Set() });
    sfx(520, .18, 'sine', .04, -260); haptic('light');
  }

  return {
    reset() {
      things = []; rings = []; level = 1; lives = 3; score = 0; t = 0; cool = 0; msg = ''; msgT = 0;
      streaks = Array.from({ length: 26 }, () => ({ x: rnd(BANK + 6, W - BANK - 6), y: rnd(0, H), l: rnd(10, 26) }));
      feel.clear(); ready.reset(); startLevel();
    },
    resize(w, h) {
      const old = WEIR + 20;
      H = h; WEIR = H - 64;
      const f = (WEIR + 20) / old, sy = y => -20 + (y + 20) * f;   // stretch the pond, keep everything where it was
      for (const o of [...(things || []), ...(streaks || [])]) o.y = sy(o.y);
      if (nest) nest.y = sy(nest.y);
    },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      for (const s of streaks) { s.y += flow() * 1.4 * dt; if (s.y > WEIR) { s.y = rnd(-40, 0); s.x = rnd(BANK + 6, W - BANK - 6); } }
      if (!ready.update(dt)) return;
      cool -= dt; msgT -= dt; nest.pulse = Math.max(0, nest.pulse - dt * 2);
      spawnT -= dt;
      if (toSpawn > 0 && spawnT <= 0) { add('duck', rnd(BANK + 50, W - BANK - 50), -20).vy = flow(); toSpawn--; spawnT = Math.max(1.6, 3.4 - level * .2); }
      for (const g of rings) {   // a ring pushes each thing once, as it passes over it
        g.r += 300 * dt;
        for (const o of things) {
          if (g.hit.has(o)) continue;
          const dx = o.x - g.x, dy = o.y - g.y, d = Math.hypot(dx, dy);
          if (d > g.r) continue;
          g.hit.add(o);
          if (d < 4) continue;   // right under the tap: the water just heaves, no push
          const k = PUSH * clamp(1 - d / REACH, 0, 1) * (d < o.r ? d / o.r : 1) * (o.kind === 'duck' ? 1 : .8);
          o.vx += dx / d * k; o.vy += dy / d * k;
        }
      }
      rings = rings.filter(g => g.r < REACH);
      for (const o of things) {   // current, drag, a little sway
        const sway = Math.sin(t * .8 + o.y * .02) * 8;
        o.vx += (sway - o.vx) * 1.1 * dt; o.vy += (flow() - o.vy) * 1.1 * dt;
        o.x += o.vx * dt; o.y += o.vy * dt; o.ang += o.spin * dt; o.bob += dt * 3;
        if (o.x < BANK + o.r) { o.x = BANK + o.r; o.vx = Math.abs(o.vx) * .5; }
        if (o.x > W - BANK - o.r) { o.x = W - BANK - o.r; o.vx = -Math.abs(o.vx) * .5; }
        if (o.y < -60) o.vy = Math.abs(o.vy);
      }
      for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) {   // floating things bump
        const a = things[i], b = things[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, ov = a.r + b.r - d;
        if (ov <= 0) continue;
        const nx = dx / d, ny = dy / d, ma = 1 / a.m, mb = 1 / b.m, s = ov / (ma + mb);
        a.x -= nx * s * ma; a.y -= ny * s * ma; b.x += nx * s * mb; b.y += ny * s * mb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) { const j2 = -1.6 * rv / (ma + mb); a.vx -= j2 * ma * nx; a.vy -= j2 * ma * ny; b.vx += j2 * mb * nx; b.vy += j2 * mb * ny; if (rv < -40 && (a.kind === 'duck' || b.kind === 'duck')) sfx(200, .05, 'triangle', .03); }
      }
      const keep = [];
      for (const o of things) {
        if (o.kind === 'duck' && Math.hypot(o.x - nest.x, o.y - nest.y) < nest.r - 6) {
          score++; api.score(score); nest.pulse = 1;
          feel.coin(o.x, o.y, { color: '#ffe066', text: '+1' }); notes('E5 G5 C6', { len: .06 }); haptic('success');
        } else if (o.y > WEIR + 8) {
          if (o.kind === 'duck') {
            lives--; feel.hurt(o.x, WEIR); sfx(300, .35, 'sine', .05, -200); haptic('error');
            if (lives <= 0) { feel.lose(); return api.over(); }
          } else keep.push(Object.assign(o, { y: -30, x: rnd(BANK + 30, W - BANK - 30), vx: 0, vy: 0 }));   // pads and logs drift round again
        } else keep.push(o);
      }
      things = keep;
      if (toSpawn === 0 && !things.some(o => o.kind === 'duck')) { level++; feel.win(nest.x, nest.y); startLevel(); }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3fa7a0'); g.addColorStop(1, '#22707a');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#ffffff22'; c.lineWidth = 2;
      for (const s of streaks) { c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x, s.y + s.l); c.stroke(); }
      feel.begin(c);
      // nest: a ring of reeds and twigs
      const p = 1 + nest.pulse * .15;
      c.fillStyle = '#2e5f4a55'; c.beginPath(); c.arc(nest.x, nest.y, nest.r * p, 0, 7); c.fill();
      c.strokeStyle = '#8a6236'; c.lineWidth = 7; c.beginPath(); c.arc(nest.x, nest.y, nest.r * p, 0, 7); c.stroke();
      c.strokeStyle = '#c49a5c'; c.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const a = i * .45 + 0.2; c.beginPath(); c.arc(nest.x, nest.y, nest.r * p - 2 + (i % 3), a, a + .5); c.stroke(); }
      c.strokeStyle = '#3f7a3a'; c.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const a = i * 1.05, x = nest.x + Math.cos(a) * (nest.r + 6), y = nest.y + Math.sin(a) * (nest.r + 6); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(t + i) * 3, y - 22); c.stroke(); }
      for (const o of things) {
        const by = Math.sin(o.bob) * 1.2;
        c.save(); c.translate(o.x, o.y + by);
        if (o.kind === 'pad') {
          c.rotate(o.ang); c.fillStyle = '#4f9a3c'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, o.r, .35, 6); c.closePath(); c.fill();
          c.strokeStyle = '#3d7f2e'; c.lineWidth = 1.5; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(i * 1.2 + .8) * o.r * .8, Math.sin(i * 1.2 + .8) * o.r * .8); c.stroke(); }
        } else if (o.kind === 'log') {
          c.rotate(o.ang); c.fillStyle = '#7a4f2c'; c.beginPath(); c.roundRect(-o.r * 1.15, -o.r * .5, o.r * 2.3, o.r, o.r * .5); c.fill();
          c.fillStyle = '#c8955a'; c.beginPath(); c.ellipse(o.r * 1.05, 0, 4, o.r * .45, 0, 0, 7); c.fill();
          c.strokeStyle = '#5a3a1f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-o.r * .8, -3); c.lineTo(o.r * .5, -3); c.moveTo(-o.r * .5, 4); c.lineTo(o.r * .7, 4); c.stroke();
        } else {
          const hd = Math.atan2(o.vy, o.vx || .001);
          c.fillStyle = '#ffffff33'; c.beginPath(); c.ellipse(0, 3, o.r + 3, o.r * .8, 0, 0, 7); c.fill();
          c.fillStyle = '#ffd53d'; c.beginPath(); c.arc(0, 0, o.r, 0, 7); c.fill();
          const hx = Math.cos(hd) * 9, hy = Math.sin(hd) * 9 - 3;
          c.beginPath(); c.arc(hx, hy, 8, 0, 7); c.fill();
          c.fillStyle = '#ff8a2a'; c.beginPath(); c.arc(hx + Math.cos(hd) * 8, hy + Math.sin(hd) * 8, 3.5, 0, 7); c.fill();
          c.fillStyle = '#222'; c.beginPath(); c.arc(hx + Math.cos(hd - 1.2) * 4, hy + Math.sin(hd - 1.2) * 4 - 1, 1.6, 0, 7); c.fill();
        }
        c.restore();
      }
      for (const r of rings) {
        const a = 1 - r.r / REACH;
        c.strokeStyle = `rgba(230,255,255,${.7 * a})`; c.lineWidth = 3; c.beginPath(); c.arc(r.x, r.y, r.r, 0, 7); c.stroke();
        c.strokeStyle = `rgba(230,255,255,${.3 * a})`; c.lineWidth = 2; c.beginPath(); c.arc(r.x, r.y, Math.max(0, r.r - 14), 0, 7); c.stroke();
      }
      feel.end(c, W, H);
      // banks and the weir
      c.fillStyle = '#5c8a3a'; c.fillRect(0, 0, BANK, H); c.fillRect(W - BANK, 0, BANK, H);
      c.fillStyle = '#4a7530'; for (let y = 8; y < H; y += 22) { c.fillRect(BANK - 6, y, 6, 12); c.fillRect(W - BANK, y + 11, 6, 12); }
      c.fillStyle = '#8c8f94'; c.fillRect(0, WEIR, W, 12);
      c.fillStyle = '#6f7277'; for (let x = 0; x < W; x += 30) c.fillRect(x + 2, WEIR + 2, 26, 8);
      c.fillStyle = '#1a4e5a'; c.fillRect(0, WEIR + 12, W, H - WEIR - 12);
      c.fillStyle = '#e8fbff'; for (let x = 0; x < W; x += 9) c.fillRect(x, WEIR + 12 + ((x * 7 + t * 60) % 20), 4, 3);
      // HUD under the app's score badge
      const top = Math.round(api.scoreArea().bottom + 16);
      c.textAlign = 'center'; c.font = '700 14px Rubik, sans-serif'; c.fillStyle = '#ffffffdd';
      const left = toSpawn + things.filter(o => o.kind === 'duck').length;
      c.fillText(`LEVEL ${level} · ${left} to bring home`, W / 2, top);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#ffd53d' : '#ffffff33'; c.beginPath(); c.arc(W / 2 - 24 + i * 24, top + 16, 7, 0, 7); c.fill(); }
      if (msgT > 0) { c.font = '900 30px Rubik, sans-serif'; c.fillStyle = '#ffffff'; c.fillText(msg, W / 2, H / 2 + 120); }
      if (t < 6 && score === 0) { c.font = '700 14px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText('TAP BEHIND A DUCKLING TO PUSH IT', W / 2, WEIR - 14); }
      ready.draw(c, W, H);
    },
    down(x, y) { if (ready.go()) return; ripple(x, y); },
    key(k, d) {
      if (!d || k !== ' ') return; if (ready.go()) return;
      const duck = things.find(o => o.kind === 'duck');   // desktop: ripple just behind the lead duckling, aimed at the nest
      if (duck) { const dx = duck.x - nest.x, dy = duck.y - nest.y, l = Math.hypot(dx, dy) || 1; ripple(duck.x + dx / l * 50, duck.y + dy / l * 50); }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ripple-pond',
  title: 'Ripple Pond',
  tag: 'Casual · Physics',
  retro: false,
  w: 360, h: 640, maxH: 800,
  tick: 60,
  music: 'calm',
  goal: 8,
  hint: 'Tap the water behind a duckling: the ripple pushes it away from your tap. Steer each one into the reed nest before the weir.',
  creator: 'Noctizzle',
  make,
};
