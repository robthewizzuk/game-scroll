import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { tilt, calibrateTilt, want, haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { approach } = gs.juice;

// Ski downhill through the gates. Drag left and right to carve (or tilt the phone).
// Every gate cleared speeds you up. Miss three gates or hit a tree and the run ends.
const W = 360, H = 640, SY = 170;

function make(api) {
  want('motion');
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false, text: 'Touch to push off' });   // stands at the top until the first touch
  let sk, gates, trees, speed, dist, nextGate, nextTree, score, missed, t, drag, track, snow, crash, gateN;
  return {
    reset() {
      calibrateTilt(); sk = { x: W / 2, vx: 0, ang: 0 }; gates = []; trees = []; speed = 230; dist = 0; nextGate = 300; nextTree = 100; score = 0; missed = 0; t = 0; drag = null; track = []; crash = null; gateN = 0; feel.clear(); ready.reset();
      snow = [...Array(40)].map(() => ({ x: rnd(0, W), y: rnd(0, H) }));
    },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; const dy = speed * dt; dist += dy;
      // steering target
      let target = sk.x; const tl = tilt();
      if (drag) target = drag.x; else if (tl) target = sk.x + tl.x * 160;
      const want_vx = clamp((target - sk.x) * 4, -320, 320); sk.vx = approach(sk.vx, want_vx, 5, dt); sk.x = clamp(sk.x + sk.vx * dt, 14, W - 14);
      sk.ang = clamp(sk.vx / 320, -1, 1);
      track.push({ x: sk.x, y: SY }); for (const p of track) p.y -= dy; track = track.filter(p => p.y > -10);
      for (const s of snow) { s.y -= dy * .2; if (s.y < 0) { s.y += H; s.x = rnd(0, W); } }
      nextGate -= dy; nextTree -= dy;
      if (nextGate <= 0) {
        const gap = Math.max(72, 130 - gateN * 2.5), prev = gates.length ? gates[gates.length - 1].x : W / 2;
        const x = clamp(prev + rnd(-150, 150), gap / 2 + 24, W - gap / 2 - 24);
        gates.push({ x, y: H + 30, gap, red: gateN % 2 === 0, done: false }); gateN++; nextGate = Math.max(190, 280 - gateN * 3);
      }
      if (nextTree <= 0) {
        nextTree = rnd(50, 120); const x = rnd(10, W - 10);
        if (!gates.some(g => Math.abs(g.y - (H + 30)) < 60 && Math.abs(g.x - x) < g.gap)) trees.push({ x, y: H + 30, r: rnd(12, 18) });
      }
      for (const g of gates) {
        g.y -= dy;
        if (!g.done && g.y < SY) {
          g.done = true;
          if (Math.abs(sk.x - g.x) < g.gap / 2) { score++; api.score(score); speed = Math.min(520, speed + 9); g.ok = true; haptic('light'); sfx(g.red ? 700 : 880, .08, 'triangle', .05, 120); feel.juice.burst(sk.x, SY, { n: 8, speed: 130, life: .35, size: 3, color: [g.red ? '#ff4060' : '#3d6bff', '#ffffff'] }); }
          else { missed++; g.ok = false; haptic('warning'); sfx(200, .2, 'square', .04, -60); feel.juice.shake(5); if (missed >= 3) { crash = 'gates'; return api.over(); } }
        }
      }
      for (const tr of trees) { tr.y -= dy; if (Math.abs(tr.x - sk.x) < tr.r * .6 + 6 && Math.abs(tr.y - SY) < 10) { crash = 'tree'; haptic('heavy'); sfx(90, .4, 'square', .06, -30); feel.juice.shake(10).burst(sk.x, SY, { n: 22, speed: 220, life: .5, size: 4, color: ['#ffffff', '#dfe9f7', '#2f7a4c'] }); return api.over(); } }
      gates = gates.filter(g => g.y > -40); trees = trees.filter(tr => tr.y > -40);
    },
    draw(c) {
      c.fillStyle = '#f4f8ff'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#dfe9f7'; for (const s of snow) c.fillRect(s.x, s.y, 3, 2);
      c.strokeStyle = '#c4d4ea'; c.lineWidth = 3; c.beginPath(); for (const [i, p] of track.entries()) { if (i) c.lineTo(p.x - 4, p.y); else c.moveTo(p.x - 4, p.y); } c.stroke();
      c.beginPath(); for (const [i, p] of track.entries()) { if (i) c.lineTo(p.x + 4, p.y); else c.moveTo(p.x + 4, p.y); } c.stroke();
      for (const g of gates) {
        const col = g.red ? '#ff4060' : '#3d6bff';
        if (g.ok === false) c.globalAlpha = .35;
        for (const fx of [g.x - g.gap / 2, g.x + g.gap / 2]) { c.fillStyle = '#555'; c.fillRect(fx - 1, g.y - 22, 2, 22); c.fillStyle = col; c.beginPath(); c.moveTo(fx, g.y - 22); c.lineTo(fx + (fx < g.x ? -14 : 14), g.y - 16); c.lineTo(fx, g.y - 10); c.fill(); }
        if (!g.done) { c.strokeStyle = col + '40'; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(g.x - g.gap / 2, g.y); c.lineTo(g.x + g.gap / 2, g.y); c.stroke(); c.setLineDash([]); }
        c.globalAlpha = 1;
      }
      for (const tr of trees) { c.fillStyle = '#6b4a2a'; c.fillRect(tr.x - 2, tr.y - 4, 4, 8); c.fillStyle = '#2f7a4c'; c.beginPath(); c.moveTo(tr.x, tr.y - tr.r * 2.2); c.lineTo(tr.x - tr.r, tr.y - 2); c.lineTo(tr.x + tr.r, tr.y - 2); c.fill(); c.fillStyle = '#ffffffcc'; c.beginPath(); c.moveTo(tr.x, tr.y - tr.r * 2.2); c.lineTo(tr.x - tr.r * .4, tr.y - tr.r * 1.4); c.lineTo(tr.x + tr.r * .4, tr.y - tr.r * 1.4); c.fill(); }
      c.save(); c.translate(sk.x, SY); c.rotate(-sk.ang * .5);
      c.fillStyle = '#222'; c.fillRect(-7, -10, 3, 26); c.fillRect(4, -10, 3, 26);
      c.fillStyle = crash ? '#999' : '#ff7a3d'; c.beginPath(); c.roundRect(-8, -14, 16, 18, 5); c.fill();
      c.fillStyle = '#ffd34a'; c.beginPath(); c.arc(0, -16, 6, 0, 7); c.fill();
      c.restore();
      feel.end(c, W, H);
      ready.draw(c, W, H, { y: 330, color: '#3d5a88', shadow: null });
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#7a8aa8'; c.fillText('MISSED', 12, 20);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < missed ? '#ff4060' : '#d6e0ef'; c.fillRect(14 + i * 14, 28, 10, 10); }
      if (t < 3) { c.fillStyle = '#5a6a88'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(tilt() ? 'tilt or drag to steer through the gates' : 'drag to steer through the gates', W / 2, H - 30); }
    },
    down(x) { ready.go(); drag = { x }; },
    move(x, y, p) { if (drag) drag.x = x; },
    up() { drag = null; },
    key(k, d) { if (d) ready.go(); if (k === 'ArrowLeft' || k === 'ArrowRight') drag = d ? { x: k === 'ArrowLeft' ? 0 : W } : null; },
  };
}

export default {
  id: 'ski-slalom', title: 'Ski Slalom', tag: 'Casual · Motion', retro: false, w: W, h: H, goal: 20,
  hint: 'Hold and drag to steer, or tilt your phone. Pass between each pair of flags. Three missed gates or one tree ends the run.',
  make,
};
