import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

// Side-view dirt bike. Hold to throttle (and lean back in the air); let go to lean forward. Land level with the slope.
// Each checkpoint flag adds time.
const R = PAL.amber, W = 160, H = 160, G = 260, BX = 48;
const ground = x => 112 - 14 * Math.sin(x / 47) - 10 * Math.sin(x / 19 + 1) * Math.min(1.6, .4 + x / 900) - 7 * Math.sin(x / 9.5) * Math.min(1, x / 1500);
const slope = x => Math.atan2(ground(x + 1) - ground(x - 1), 2);

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false, text: 'HOLD TO RIDE' });       // the clock waits for the first press
  let x, y, vx, vy, ang, av, air, hold, time, nextCp, t, dead, dust;
  return {
    reset() { x = 20; y = ground(20); vx = 30; vy = 0; ang = slope(20); av = 0; air = false; hold = false; time = 25; nextCp = 300; t = 0; dead = 0; dust = []; feel.clear(); ready.reset(); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; time -= dt; if (time <= 0) { haptic('warning'); sfx(160, .3, 'square', .04, -50); return api.over(); }
      if (!air) {
        const s = slope(x); vx += ((hold ? 70 : -12) - G * Math.sin(s) * .9) * dt; vx = clamp(vx, 4, 140);
        const nx = x + vx * dt, ny = ground(nx), wantVy = (ny - y) / dt;
        if (wantVy - vy > G * dt * 2.2 && vx > 50) { air = true; vy = vy; av = 0; sfx(500, .05, 'square', .02); }
        else { vy = wantVy; x = nx; y = ny; ang = s; }
        if (hold && Math.random() < .5) dust.push({ x: x - 4, y: y, vx: -20, vy: -10, l: .3 });
      }
      if (air) {
        vy += G * dt; x += vx * dt; y += vy * dt; av += ((hold ? -4.5 : 3.5) - av * .8) * dt; av = clamp(av, -3, 3); ang += av * dt;
        if (y >= ground(x)) {
          const s = slope(x), diff = Math.atan2(Math.sin(ang - s), Math.cos(ang - s));
          if (Math.abs(diff) > .95) { haptic('error'); sfx(120, .5, 'sawtooth', .05, -60); air = false; feel.juice.shake(6).burst(BX, y - 4, { n: 12, speed: 55, life: .5, size: 2, color: [R[0], R[1]], gravity: 120 }); return api.over(); }
          air = false; y = ground(x); ang = s; vx *= Math.cos(diff) * .95 + .05; haptic(Math.abs(diff) < .2 ? 'light' : 'medium'); sfx(200, .06, 'square', .03);
          if (Math.abs(diff) < .15) { time += 1; feel.juice.pop(BX, y - 24, '+1S', { color: R[0], size: 6 }); }
        }
      }
      for (const d of dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.l -= dt; } dust = dust.filter(d => d.l > 0);
      if (x >= nextCp) { nextCp += 300; time += 8; haptic('success'); sfx(880, .2, 'square', .05, 300); feel.juice.pop(BX + 10, y - 26, '+8S', { color: R[0], size: 8 }); }
      api.score(Math.floor(x / 10));
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      const cam = x - BX; c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = R[2]; for (let i = 0; i < 5; i++) { const hx = ((i * 70 - cam * .3) % 350 + 350) % 350 - 60; c.beginPath(); c.moveTo(hx, 90); c.lineTo(hx + 40, 50 + (i % 2) * 10); c.lineTo(hx + 80, 90); c.fill(); }
      c.fillStyle = R[1]; for (let sx = 0; sx < W; sx += 2) { const gy = Math.round(ground(sx + cam)); c.fillRect(sx, gy, 2, H - gy); }
      c.fillStyle = R[0]; for (let sx = 0; sx < W; sx += 2) c.fillRect(sx, Math.round(ground(sx + cam)), 2, 2);
      const cp = nextCp - cam; if (cp < W + 10) { const gy = ground(nextCp); c.fillStyle = R[0]; c.fillRect(cp, gy - 22, 1, 22); c.fillRect(cp + 1, gy - 22, 8, 5); }
      c.fillStyle = R[2]; for (const d of dust) c.fillRect(Math.round(d.x - cam), Math.round(d.y) - 1, 2, 2);
      if (!dead || (dead * 10 | 0) % 2) {
        c.save(); c.translate(BX, y); c.rotate(ang);
        c.fillStyle = R[0]; for (const wx of [-7, 7]) { c.beginPath(); c.arc(wx, -3, 3.5, 0, 7); c.fill(); }
        c.fillStyle = R[3]; for (const wx of [-7, 7]) c.fillRect(wx - 1, -4, 2, 2);
        c.fillStyle = R[0]; c.fillRect(-6, -8, 12, 3); c.fillRect(-2, -15, 4, 7); c.fillRect(-1, -18, 4, 3); c.fillRect(4, -11, 5, 2);
        c.restore();
      }
      feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: R[3], y: 146 });
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 4, 10);
      c.textAlign = 'right'; c.fillText(air ? (hold ? 'LEAN BACK' : 'LEAN FWD') : '', W - 4, 10);
    },
    down() { ready.go(); hold = true; }, up() { hold = false; },
    key(k, d) { if (k === ' ' || k === 'ArrowRight' || k === 'ArrowUp') { hold = d; if (d) ready.go(); } },
  };
}

export default {
  id: 'moto-hills', title: 'Moto Hills', tag: 'Pocket · Racing', retro: true, w: W, h: H, pal: 'amber', goal: 350,
  hint: 'Hold for throttle; in the air, hold to lean back and let go to lean forward. Land level with the hill.',
  make,
};
