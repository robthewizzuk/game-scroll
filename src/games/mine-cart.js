import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Your cart races along three rails. Junction switches flash ahead: tap to flip the next one
// so the cart changes rail (or not) and dodges the broken track. Grab gems on the way.
const P = PAL.amber, W = 160, H = 160, LANES = [56, 88, 120], CX = 34, STEP = 44;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                                           // the cart waits for the first tap
  let cart, segs, speed, dist, score, gems, t, sparks, crashed;
  // Each segment starts at a junction. A junction can lead up or down one rail, or straight.
  const reach = (l, alt) => { let to = l + alt; if (to < 0 || to > 2) to = l - alt; return [l, to]; };
  function addSeg() {
    const prev = segs[segs.length - 1], x = prev ? prev.x + STEP : CX + 30;
    const s = { x, alt: Math.random() < .5 ? -1 : 1, sw: false, broken: [false, false, false], gem: -1 };
    if (segs.length > 4) {
      // Break one or two rails, but always leave every safe rail of the last stretch a way through.
      for (let tries = 0; tries < 20; tries++) {
        const k = Math.random() < .35 + Math.min(.35, dist / 6000) ? 2 : 1, lanes = shuffle([0, 1, 2]);
        s.broken = [false, false, false]; for (let i = 0; i < k; i++) s.broken[lanes[i]] = true;
        if ([0, 1, 2].every(l => prev.broken[l] || reach(l, s.alt).some(to => !s.broken[to]))) break;
        s.broken = [false, false, false];
      }
    }
    if (Math.random() < .5) { const free = [0, 1, 2].filter(l => !s.broken[l]); s.gem = free[Math.random() * free.length | 0]; }
    segs.push(s);
  }
  return {
    reset() { segs = []; dist = 0; for (let i = 0; i < 8; i++) addSeg(); cart = { lane: 1, y: LANES[1], from: 1, to: 1, k: 1 }; speed = 40; score = 0; gems = 0; t = 0; sparks = []; crashed = false; feel.clear(); ready.reset(); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; speed = Math.min(110, 40 + dist / 70); const dx = speed * dt; dist += dx;
      for (const s of segs) s.x -= dx;
      // the cart reaches a junction
      const s = segs.find(q => !q.passed && q.x <= CX);
      if (s) {
        s.passed = true;
        const to = reach(cart.lane, s.alt)[s.sw ? 1 : 0];
        cart.from = cart.lane; cart.to = to; cart.lane = to; cart.k = 0;
        if (s.broken[to]) { crashed = true; haptic('error'); sfx(80, .5, 'square', .06, -20); feel.juice.shake(6); for (let i = 0; i < 10; i++) sparks.push({ x: CX, y: LANES[to], vx: rnd(-40, 40), vy: rnd(-60, 0), l: .8 }); return api.over(); }
        if (s.gem === to) { s.gem = -1; gems++; score += 5; haptic('success'); sfx(1200, .08, 'square', .04, 300); feel.juice.burst(CX + 14, LANES[to] - 7, { n: 8, speed: 45, life: .4, size: 2, color: [P[0], P[1]] }).pop(CX + 14, LANES[to] - 14, '+5', { color: P[0], size: 6 }); }
        else { score++; sfx(300, .02, 'square', .02); }
        api.score(score);
      }
      cart.k = Math.min(1, cart.k + dt * speed / STEP * 1.5); cart.y = LANES[cart.from] + (LANES[cart.to] - LANES[cart.from]) * cart.k;
      segs = segs.filter(q => q.x > -STEP); while (segs.length < 8) addSeg();
      for (const p of sparks) { p.l -= dt; p.x += p.vx * dt; p.vy += 200 * dt; p.y += p.vy * dt; } sparks = sparks.filter(p => p.l > 0);
    },
    fx(dt) { feel.update(dt); for (const p of sparks) { p.l -= dt; p.x += p.vx * dt; p.vy += 200 * dt; p.y += p.vy * dt; } },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H); feel.begin(c); c.fillStyle = P[2]; c.fillRect(0, 0, W, 34);
      c.fillStyle = P[1]; for (let i = 0; i < 12; i++) { const x = ((i * 37 - dist * .3) % 200 + 200) % 200 - 20; c.fillRect(x, 26 - (i % 3) * 6, 14, 10 + (i % 3) * 6); }
      const next = segs.find(q => !q.passed);
      for (const [i, s] of segs.entries()) {
        const n = segs[i + 1], x1 = n ? n.x : s.x + STEP;
        for (let l = 0; l < 3; l++) {
          const y = LANES[l];
          if (s.broken[l]) { c.fillStyle = P[1]; c.fillRect(Math.round(s.x) + 4, y + 3, 8, 2); c.fillRect(Math.round(x1) - 12, y + 3, 8, 2); c.fillStyle = P[0]; c.fillRect(Math.round((s.x + x1) / 2) - 3, y - 3, 6, 8); c.fillStyle = P[3]; c.fillRect(Math.round((s.x + x1) / 2) - 1, y - 1, 2, 2); continue; }
          c.fillStyle = P[1]; for (let x = s.x; x < x1; x += 6) c.fillRect(Math.round(x), y + 1, 2, 5);
          c.fillStyle = P[0]; c.fillRect(Math.round(s.x), y, Math.round(x1 - s.x), 1); c.fillRect(Math.round(s.x), y + 5, Math.round(x1 - s.x), 1);
        }
        // junction switch marker + diverging rail when it's switched
        if (!s.passed) {
          const on = s.sw, act = s === next;
          for (let l = 0; l < 3; l++) {
            const to = reach(l, s.alt)[1];
            c.strokeStyle = on ? P[0] : P[2]; c.lineWidth = on ? 2 : 1; c.beginPath(); c.moveTo(s.x - 14, LANES[l] + 3); c.lineTo(s.x, LANES[to] + 3); c.stroke();
          }
          if (act) { c.fillStyle = (t * 6 | 0) % 2 ? P[0] : P[1]; c.fillRect(Math.round(s.x) - 3, 40, 6, 6); }
        }
        if (s.gem >= 0) { const gx = Math.round((s.x + x1) / 2), gy = LANES[s.gem] - 7; c.fillStyle = P[0]; c.fillRect(gx - 2, gy - 3, 5, 1); c.fillRect(gx - 3, gy - 2, 7, 2); c.fillRect(gx - 2, gy, 5, 1); c.fillRect(gx - 1, gy + 1, 3, 1); c.fillRect(gx, gy + 2, 1, 1); }
      }
      const cy = Math.round(cart.y); c.fillStyle = P[0]; c.fillRect(CX - 8, cy - 9, 16, 9); c.fillStyle = P[2]; c.fillRect(CX - 6, cy - 12, 12, 3);
      c.fillStyle = P[0]; c.fillRect(CX - 6, cy, 4, 4); c.fillRect(CX + 2, cy, 4, 4); c.fillRect(CX - 2, cy - 18, 4, 6);
      for (const p of sparks) { c.fillStyle = P[0]; c.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = P[0]; c.textAlign = 'left'; c.fillText(`*${gems}`, 4, 10);
      if (t < 4) { c.textAlign = 'center'; c.fillText('TAP TO FLIP SWITCH', 80, 152); }
    },
    down() { if (ready.go()) return; const s = segs.find(q => !q.passed); if (s) { s.sw = !s.sw; haptic('tick'); sfx(s.sw ? 520 : 380, .04, 'square', .03); } },
    key(k, d) { if (d && k === ' ') this.down(); },
  };
}

export default {
  id: 'mine-cart', title: 'Mine Cart', tag: 'Pocket · Reflex', retro: true, w: W, h: H, pal: 'amber', goal: 60,
  hint: 'Tap to flip the next junction switch (the flashing one). A bold line means the cart will change rail there. Dodge broken track and grab gems.',
  make,
};
