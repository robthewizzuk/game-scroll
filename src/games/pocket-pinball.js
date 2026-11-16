import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

// One-table pinball: tap and hold the left or right half of the screen to flip. Hit bumpers and lanes. Three balls.
const R = PAL.ice, W = 160, H = 160, BR = 3, G = 160;
// Bumpers only tick over: the points are in the top lanes, which take aimed flips (flailing scores little)
const BUMP = 25, LANE = 100, ALL = 600;
const LP = { x: 50, y: 140 }, RP = { x: 110, y: 140 }, FL = 24;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false, text: 'TAP TO SERVE' });       // the first ball waits for a touch
  const sides = new Map();                                             // which side each finger is holding
  let ball, la, ra, lav, rav, lHeld, rHeld, balls, score, bumpers, lights, t, dead, kick;
  const segs = [[[6, 160], [6, 30]], [[154, 160], [154, 30]], [[6, 30], [40, 6]], [[40, 6], [120, 6]], [[120, 6], [154, 30]], [[6, 112], [LP.x, LP.y]], [[154, 112], [RP.x, RP.y]], [[30, 70], [22, 84]], [[130, 70], [138, 84]]];
  function serve() { ball = { x: 80, y: 20, vx: (Math.random() - .5) * 60, vy: 10 }; kick = 0; }
  const tipL = () => ({ x: LP.x + Math.cos(la) * FL, y: LP.y + Math.sin(la) * FL }), tipR = () => ({ x: RP.x - Math.cos(ra) * FL, y: RP.y + Math.sin(ra) * FL });
  function collideSeg(a, b, surfV) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, u = clamp(((ball.x - a.x) * dx + (ball.y - a.y) * dy) / l2, 0, 1), cx = a.x + u * dx, cy = a.y + u * dy;
    const ex = ball.x - cx, ey = ball.y - cy, d = Math.hypot(ex, ey);
    if (d < BR + 1 && d > 0) { const nx = ex / d, ny = ey / d; ball.x = cx + nx * (BR + 1); ball.y = cy + ny * (BR + 1);
      const sv = surfV ? surfV(u) : { x: 0, y: 0 }, rvx = ball.vx - sv.x, rvy = ball.vy - sv.y, dot = rvx * nx + rvy * ny;
      if (dot < 0) { ball.vx -= 1.5 * dot * nx; ball.vy -= 1.5 * dot * ny; return true; } }
    return false;
  }
  return {
    reset() { la = ra = .45; lav = rav = 0; lHeld = rHeld = false; balls = 3; score = 0; t = 0; dead = 0; bumpers = [{ x: 58, y: 44, r: 8, hit: 0 }, { x: 102, y: 44, r: 8, hit: 0 }, { x: 80, y: 70, r: 9, hit: 0 }]; lights = [0, 0, 0, 0]; sides.clear(); feel.clear(); ready.reset(); serve(); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; const n = 8, h = dt / n;
      for (let s = 0; s < n; s++) {
        const tl = lHeld ? -.5 : .45, tr = rHeld ? -.5 : .45, pl = la, pr = ra;
        la += clamp(tl - la, -18 * h, 18 * h); ra += clamp(tr - ra, -18 * h, 18 * h); lav = (la - pl) / h; rav = (ra - pr) / h;
        ball.vy += G * h; ball.x += ball.vx * h; ball.y += ball.vy * h;
        for (const [a, b] of segs) collideSeg({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
        if (collideSeg(LP, tipL(), u => ({ x: -Math.sin(la) * lav * FL * u, y: Math.cos(la) * lav * FL * u })) && lav < -1) sfx(300, .03, 'square', .02);
        if (collideSeg(RP, tipR(), u => ({ x: -Math.sin(ra) * rav * FL * u, y: Math.cos(ra) * rav * FL * u }))) {}
        for (const bm of bumpers) { const dx = ball.x - bm.x, dy = ball.y - bm.y, d = Math.hypot(dx, dy); if (d < bm.r + BR) { const nx = dx / d, ny = dy / d; ball.x = bm.x + nx * (bm.r + BR); ball.y = bm.y + ny * (bm.r + BR); const sp = Math.max(110, Math.hypot(ball.vx, ball.vy)); ball.vx = nx * sp; ball.vy = ny * sp; bm.hit = .2; score += BUMP; api.score(score); haptic('light'); sfx(700 + bm.r * 30, .05, 'square', .04); feel.juice.burst(ball.x, ball.y, { n: 5, speed: 45, life: .3, size: 2, color: [R[0], R[1]] }); } }
        if (ball.y < 14 && ball.vy < 0) { const i = clamp((ball.x - 44) / 18 | 0, 0, 3); if (!lights[i]) { lights[i] = 1; score += LANE; api.score(score); sfx(1000, .05, 'square', .03); if (lights.every(v => v)) { lights = [0, 0, 0, 0]; score += ALL; api.score(score); haptic('success'); sfx(1200, .3, 'square', .05, 300); feel.juice.pop(80, 30, `+${ALL}`, { color: R[0], size: 8 }); } } }
        const sp = Math.hypot(ball.vx, ball.vy); if (sp > 320) { ball.vx *= 320 / sp; ball.vy *= 320 / sp; }
      }
      for (const bm of bumpers) bm.hit = Math.max(0, bm.hit - dt);
      if (ball.y > H + 6) { balls--; haptic('warning'); sfx(150, .4, 'triangle', .05, -80); feel.juice.shake(4); if (balls <= 0) return api.over(); serve(); }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.strokeStyle = R[0]; c.lineWidth = 2; c.beginPath(); for (const [a, b] of segs) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } c.stroke();
      for (let i = 0; i < 4; i++) { c.fillStyle = lights[i] ? R[0] : R[2]; c.fillRect(46 + i * 18, 9, 10, 3); }
      for (const bm of bumpers) { c.fillStyle = bm.hit ? R[0] : R[1]; c.beginPath(); c.arc(bm.x, bm.y, bm.r, 0, 7); c.fill(); c.fillStyle = R[3]; c.beginPath(); c.arc(bm.x, bm.y, bm.r - 4, 0, 7); c.fill(); }
      c.strokeStyle = R[0]; c.lineWidth = 4; c.lineCap = 'round'; const a = tipL(), b = tipR(); c.beginPath(); c.moveTo(LP.x, LP.y); c.lineTo(a.x, a.y); c.moveTo(RP.x, RP.y); c.lineTo(b.x, b.y); c.stroke();
      if (!dead || (dead * 10 | 0) % 2) { c.fillStyle = R[0]; c.beginPath(); c.arc(ball.x, ball.y, BR, 0, 7); c.fill(); c.fillStyle = R[3]; c.fillRect(ball.x - 1, ball.y - 2, 1, 1); }
      feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: R[0], y: 100 });
      for (let i = 0; i < balls; i++) { c.fillStyle = R[1]; c.beginPath(); c.arc(12 + i * 7, 150, 2, 0, 7); c.fill(); }
    },
    down(x, y, id = 0) { ready.go(); const left = x < W / 2; sides.set(id, left); if (left) lHeld = true; else rHeld = true; haptic('tick'); sfx(220, .03, 'square', .02); },
    up(x, y, id = 0) {   // lifting one thumb lets go of that flipper only
      sides.delete(id); const held = [...sides.values()]; lHeld = held.includes(true); rHeld = held.includes(false);
    },
    key(k, d) { if (d) ready.go(); if (k === 'ArrowLeft' || k === 'z') lHeld = d; if (k === 'ArrowRight' || k === 'm') rHeld = d; },
  };
}

export default {
  id: 'pocket-pinball', title: 'Pocket Pinball', tag: 'Pocket · Pinball', retro: true, w: W, h: H, pal: 'ice', goal: 1500,
  hint: 'Hold the left or right side to flip. Bumpers tick over, but the points are in the four top lanes: aim flips to light them all for a big bonus. Three balls.',
  make,
};
