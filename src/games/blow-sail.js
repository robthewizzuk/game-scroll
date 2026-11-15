// Blow Sail: your breath is the wind. Blow into the mic to fill the sail and race up the bay ahead of
// the storm, dragging to steer round rocks and through buoy gates. No mic? Hold a finger down to
// blow, and slide it to steer.
import gs from '../gamescroll.js';
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { startMic, stopMic, haptic } = gs.device;
const { sfx, bed } = gs.sound;
const { clamp, rnd } = gs.util;
const { approach } = gs.juice;
const { icon } = gs.icons;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ eat: false, text: 'Tap to set sail' });     // the storm waits for the first touch
  let mic, asked, boat, cam, rocks, gates, nextY, storm, score, dist, lives, t, wind, steerX, holding, hurt, puffs, waves, windBed;

  function spawn() {
    while (nextY > cam - H) {
      const y = nextY, k = Math.random();
      if (k < .55) { const n = 1 + (Math.random() * (1 + Math.min(3, t / 30)) | 0); for (let i = 0; i < n; i++) rocks.push({ x: rnd(30, W - 30), y: y + rnd(-30, 30), r: rnd(14, 26), seed: Math.random() * 9 }); }
      else { const gx = rnd(80, W - 80), gw = Math.max(80, 130 - t); gates.push({ x: gx, y, w: gw, got: false }); }
      nextY -= rnd(120, 180);
    }
  }

  return {
    reset() {
      stopMic(); mic = null; asked = false;
      boat = { x: W / 2, y: 0, vx: 0, speed: 0, heading: 0 }; cam = -H * .7;
      rocks = []; gates = []; nextY = -260; storm = 260; score = 0; dist = 0; lives = 3; t = 0; wind = 0; steerX = null; holding = false; hurt = 0; puffs = []; windBed = null;
      waves = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, l: 8 + Math.random() * 14 }));
      spawn(); feel.clear(); ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt) || feel.frozen) return;
      t += dt;
      if (!asked) { asked = true; startMic().then(m => { mic = m; }); windBed = bed({ vol: .0, from: 600, filter: 'lowpass' }); }
      // wind from the breath (or a held finger)
      const breath = Math.max(mic ? mic.blow() : 0, holding ? .85 : 0);
      wind = approach(wind, breath, breath > wind ? 6 : 1.5, dt);
      windBed?.set({ vol: wind * .08, from: 300 + wind * 900 }, .1);
      if (breath > .2 && Math.random() < dt * 30) puffs.push({ x: boat.x + rnd(-40, 40), y: boat.y + 70, l: .6 });
      // sailing: wind pushes, water drags
      boat.speed += (wind * 260 - boat.speed * .9) * dt;
      if (hurt > 0) { hurt -= dt; boat.speed *= Math.pow(.97, dt * 60); }
      if (steerX != null) boat.vx = approach(boat.vx, clamp((steerX - boat.x) * 4, -220, 220), 8, dt);
      else boat.vx = approach(boat.vx, 0, 3, dt);
      boat.x = clamp(boat.x + boat.vx * dt, 16, W - 16);
      boat.heading = approach(boat.heading, boat.vx / 500, 6, dt);
      boat.y -= boat.speed * dt;
      // the storm creeps up from behind, faster as time goes on
      storm -= (34 + t * .9) * dt;
      cam = approach(cam, boat.y - H * .68, 5, dt);
      const d = Math.floor(-boat.y / 150);
      if (d > dist) { score += d - dist; dist = d; api.score(score); }
      // rocks
      for (const r of rocks) if (!r.hit && Math.hypot(r.x - boat.x, r.y - boat.y) < r.r + 10) {
        r.hit = true; lives--; hurt = 1; boat.speed *= .2; boat.vx = (boat.x - r.x) * 4;
        feel.hit(boat.x, boat.y - cam, { power: 1 }); feel.hurt(boat.x, boat.y - cam); haptic('error');
        if (lives <= 0) { feel.lose(); stopMic(); return api.over(); }
      }
      for (const g of gates) if (!g.got && Math.abs(boat.y - g.y) < 12 && Math.abs(boat.x - g.x) < g.w / 2) { g.got = true; score += 3; api.score(score); feel.coin(boat.x, boat.y - cam); feel.juice.pop(boat.x, boat.y - cam - 30, '+3', { color: '#ffd23f' }); }
      if (storm - boat.y < 26) { feel.lose(); feel.juice.flash('#203040', .4); stopMic(); return api.over(); }
      rocks = rocks.filter(r => r.y < cam + H + 60); gates = gates.filter(g => g.y < cam + H + 60);
      for (const p of puffs) { p.l -= dt; p.y -= 140 * dt; } puffs = puffs.filter(p => p.l > 0);
      spawn();
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1e88b8'); g.addColorStop(1, '#0b5e86'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#ffffff30'; c.lineWidth = 2;
      for (const w of waves) { const y = ((w.y - cam * .9) % H + H) % H, x = w.x + Math.sin(t + w.y) * 6; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w.l / 2, y - 4, x + w.l, y); c.stroke(); }
      feel.begin(c);
      c.save(); c.translate(0, -cam);
      // gates: two buoys with a dotted line
      for (const gt of gates) {
        c.strokeStyle = gt.got ? '#ffffff40' : '#ffd23f90'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(gt.x - gt.w / 2, gt.y); c.lineTo(gt.x + gt.w / 2, gt.y); c.stroke(); c.setLineDash([]);
        for (const s of [-1, 1]) { const bx = gt.x + s * gt.w / 2, by = gt.y + Math.sin(t * 3 + s) * 2; c.fillStyle = '#ff5a36'; c.beginPath(); c.arc(bx, by, 8, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(bx - 8, by - 2, 16, 4); }
      }
      // rocks with foam
      for (const r of rocks) {
        c.fillStyle = '#ffffff50'; c.beginPath(); c.arc(r.x, r.y + 3, r.r + 5 + Math.sin(t * 2 + r.seed) * 2, 0, 7); c.fill();
        c.fillStyle = '#5b5f6b'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rr = r.r * (.8 + .2 * Math.sin(r.seed + i * 2.1)); i ? c.lineTo(r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr) : c.moveTo(r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr); } c.fill();
        c.fillStyle = '#8a8f9c'; c.beginPath(); c.arc(r.x - r.r * .25, r.y - r.r * .25, r.r * .45, 0, 7); c.fill();
      }
      // wake
      c.strokeStyle = '#ffffff60'; c.lineWidth = 3; c.beginPath(); c.moveTo(boat.x - 8, boat.y + 18); c.lineTo(boat.x - 16 - boat.speed / 20, boat.y + 40 + boat.speed / 6); c.moveTo(boat.x + 8, boat.y + 18); c.lineTo(boat.x + 16 + boat.speed / 20, boat.y + 40 + boat.speed / 6); c.stroke();
      // the boat, sail billowing with the wind
      c.save(); c.translate(boat.x, boat.y); c.rotate(boat.heading);
      if (hurt > 0 && (t * 12 | 0) % 2) c.globalAlpha = .5;
      c.fillStyle = '#8b5a2b'; c.beginPath(); c.moveTo(0, -22); c.quadraticCurveTo(13, -6, 10, 18); c.lineTo(-10, 18); c.quadraticCurveTo(-13, -6, 0, -22); c.fill();
      c.fillStyle = '#a8703a'; c.fillRect(-7, -4, 14, 18);
      const bill = 4 + wind * 14;
      c.fillStyle = '#fbf8f0'; c.beginPath(); c.moveTo(-14, 2); c.quadraticCurveTo(0, 2 - bill, 14, 2); c.lineTo(14, 6); c.quadraticCurveTo(0, 6 - bill * .6, -14, 6); c.fill();
      c.strokeStyle = '#5a3a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-15, 4); c.lineTo(15, 4); c.stroke();
      c.globalAlpha = 1; c.restore();
      // breath puffs
      c.strokeStyle = '#ffffff'; for (const p of puffs) { c.globalAlpha = p.l; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y + 14); c.stroke(); } c.globalAlpha = 1;
      // the storm behind
      const sg = c.createLinearGradient(0, storm - 60, 0, storm + 40); sg.addColorStop(0, '#1a243300'); sg.addColorStop(.6, '#1a2433dd'); sg.addColorStop(1, '#0e141c');
      c.fillStyle = sg; c.fillRect(0, storm - 60, W, H + 200);
      if (Math.sin(t * 7.3) > .97) { c.fillStyle = '#ffffff30'; c.fillRect(0, storm - 20, W, H); }
      c.restore();
      feel.end(c, W, H);
      // HUD
      for (let i = 0; i < lives; i++) icon(c, 'sailboat', 24 + i * 22, H - 28, 20, { color: '#ffffffdd' });
      c.fillStyle = '#ffffff30'; c.fillRect(W - 110, H - 34, 90, 10); c.fillStyle = '#9ff0ff'; c.fillRect(W - 110, H - 34, 90 * wind, 10);
      c.fillStyle = '#ffffffcc'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText('WIND', W - 116, H - 25);
      if (t < 5) { c.textAlign = 'center'; c.font = '700 17px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(mic ? 'Blow on the mic to sail!' : 'Hold to blow · slide to steer', W / 2, H * .3); c.font = '500 13px Rubik, sans-serif'; c.fillText(mic ? 'Drag to steer · or hold to blow' : 'The storm is behind you', W / 2, H * .3 + 22); }
      ready.draw(c, W, H);
    },
    down(x) { ready.go(); steerX = x; holding = true; if (!mic) sfx(400, .05, 'sine', .02); },
    move(x, y, p) { if (p) steerX = x; },
    up() { steerX = null; holding = false; },
    key(k, d) { if (d) ready.go(); if (k === ' ') holding = d; if (k === 'ArrowLeft') steerX = d ? 0 : null; if (k === 'ArrowRight') steerX = d ? W : null; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'blow-sail',
  title: 'Blow Sail',
  tag: 'Casual · Mic',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 60,
  hint: 'Blow into the mic to fill the sail (or hold a finger down) and drag to steer past rocks. Stay ahead of the storm.',
  make,
};
