// Plate Spinner: a row of plates spins on tall sticks. Every plate slows down, starts to wobble, and
// smashes if it stops. Tap a plate (or its stick) to give it a spin. More sticks join as you go, and
// they slow down faster. Three smashed plates and the show is over.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp, rnd } = gs.util;

let W = 360, H = 640;
const COLS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f78c6b'];

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel();
  let plates, score, smashed, t, spun, nextAdd, shards;
  const stickX = (i, n) => W * (i + .5) / n;
  const topY = i => H * .42 + (i % 2) * 40;

  function addPlate() { plates.push({ s: 1, ph: Math.random() * 6, col: COLS[plates.length % COLS.length], decay: rnd(.12, .17), warn: false, fall: 0, gone: false }); }

  return {
    reset() { plates = []; score = 0; smashed = 0; t = 0; spun = 0; nextAdd = 14; shards = []; ready.reset(); addPlate(); addPlate(); addPlate(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      for (const s of shards) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; s.r += s.vr * dt; if (s.y > H - 60) { s.y = H - 60; s.vy *= -.3; s.vx *= .6; } }
      if (!ready.playing) return;
      t += dt;
      if (t > nextAdd && plates.length < 6) { addPlate(); nextAdd += 16; notes('C5 G5', { len: .08 }); feel.juice.pop(W / 2, H * .25, 'One more!', { color: '#fff' }); }
      const speed = 1 + t / 70;
      plates.forEach((p, i) => {
        if (p.gone) return;
        if (p.fall) {
          p.fall += dt;
          if (p.fall > .5) {
            p.gone = true; smashed++; const x = stickX(i, plates.length);
            for (let k = 0; k < 8; k++) shards.push({ x, y: H - 62, vx: rnd(-180, 180), vy: rnd(-380, -160), r: 0, vr: rnd(-9, 9), col: p.col });
            feel.boom(x, H - 62, { size: .6 }); haptic('error');
            if (smashed >= 3) { feel.lose(); api.over(); return; }
            // a smashed plate is replaced after a moment, still slow
            rest(p);
          }
          return;
        }
        p.s -= p.decay * speed * dt; p.ph += (2 + p.s * 18) * dt;
        if (p.s < .35 && !p.warn) { p.warn = true; haptic('tick'); sfx(220, .08, 'triangle', .03, -60); }
        if (p.s <= 0) { p.fall = .01; sfx(160, .3, 'sawtooth', .04, -120); }
        spun += dt * (p.s > .2 ? 1 : 0);
      });
      for (const p of plates) if (p.gone && (p.back -= dt) <= 0) { p.gone = false; p.fall = 0; p.s = .6; p.warn = false; }
      const sc = Math.floor(spun / 4); if (sc > score) { score = sc; api.score(score); }
      shards = shards.filter(s => (s.l = (s.l ?? 2) - dt) > 0);
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a0ca3'); g.addColorStop(1, '#7209b7'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // stage curtains and spotlight
      c.fillStyle = '#d00000'; for (let x = 0; x < 30; x += 10) { c.fillRect(x, 0, 8, H - 60); c.fillRect(W - x - 8, 0, 8, H - 60); }
      c.fillStyle = '#ffffff10'; c.beginPath(); c.moveTo(W * .35, 0); c.lineTo(W * .65, 0); c.lineTo(W, H - 60); c.lineTo(0, H - 60); c.fill();
      c.fillStyle = '#5a3825'; c.fillRect(0, H - 60, W, 60); c.fillStyle = '#7f5539'; c.fillRect(0, H - 60, W, 6);
      feel.begin(c);
      const n = plates.length;
      plates.forEach((p, i) => {
        const x = stickX(i, n), y = topY(i);
        c.strokeStyle = '#e9ecef'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, H - 60); c.lineTo(x, y); c.stroke();
        if (p.gone) return;
        const wob = p.s < .35 ? (1 - p.s / .35) * .6 : .03, tilt = Math.sin(p.ph * .7) * wob, drop = p.fall ? p.fall * p.fall * 2000 : 0;
        c.save(); c.translate(x + tilt * 18 + (p.fall ? p.fall * 60 : 0), y - 4 + drop); c.rotate(tilt + (p.fall ? p.fall * 4 : 0));
        c.fillStyle = '#00000030'; c.beginPath(); c.ellipse(0, 4, 34, 9, 0, 0, 7); c.fill();
        c.fillStyle = p.col; c.beginPath(); c.ellipse(0, 0, 34, 9, 0, 0, 7); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, -1, 22, 5, 0, 0, 7); c.fill();
        // spinning dash shows the speed
        const a = p.ph * 3; c.fillStyle = p.col; c.fillRect(Math.cos(a) * 26 - 3, Math.sin(a) * 6 - 2, 6, 3);
        c.restore();
        // speed gauge under the stick
        c.fillStyle = '#00000050'; c.fillRect(x - 20, H - 40, 40, 6); c.fillStyle = p.s < .35 ? '#ff595e' : '#8ac926'; c.fillRect(x - 20, H - 40, 40 * clamp(p.s, 0, 1), 6);
      });
      for (const s of shards) { c.save(); c.translate(s.x, s.y); c.rotate(s.r); c.fillStyle = s.col; c.fillRect(-6, -2, 12, 4); c.restore(); }
      feel.end(c, W, H);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < 3 - smashed ? '#ffffff' : '#ffffff30'; c.beginPath(); c.ellipse(52 + i * 30, H - 20, 11, 4, 0, 0, 7); c.fill(); }
      if (!ready.playing || t < 3) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '700 18px Rubik, sans-serif'; c.fillText('Tap a plate to spin it', W / 2, H * .2); c.font = '500 14px Rubik, sans-serif'; c.fillText('Don\'t let any of them stop!', W / 2, H * .2 + 24); }
    },
    down(x, y) {
      ready.go();
      const n = plates.length; let best = -1, bd = 1e9;
      plates.forEach((p, i) => { if (p.gone || p.fall) return; const d = Math.abs(x - stickX(i, n)); if (d < bd && d < W / n / 2 + 4 && y > topY(i) - 60) { bd = d; best = i; } });
      if (best < 0) return;
      const p = plates[best], was = p.s;
      p.s = Math.min(1, p.s + .45); p.warn = false;
      sfx(500 + p.s * 400, .06, 'triangle', .03, 200); haptic(was < .35 ? 'medium' : 'light');
      if (was < .2) { feel.juice.pop(stickX(best, n), topY(best) - 30, 'Saved!', { color: '#ffd166' }); spun += 2; }
    },
    key(k, d) { if (d && k >= '1' && k <= '6') { const i = +k - 1; if (plates[i]) this.down(stickX(i, plates.length), topY(i)); } },
  };
  function rest(p) { p.back = 1.5; }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'plate-spinner',
  title: 'Plate Spinner',
  tag: 'Casual · Juggle',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Tap a plate to spin it up before it wobbles to a stop. More plates join as you go. Three smashes and the show is over.',
  make,
};
