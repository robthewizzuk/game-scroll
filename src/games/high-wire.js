// High Wire: an acrobat walks the tightrope across the big top by herself, carrying a long pole. She is
// an inverted pendulum: any lean grows unless you correct it. Hold the left or right half of the screen
// to dip that end of the pole. Arrows warn of a gust before it shoves; birds land on a pole end and weigh
// it down until you double tap that side (or they get bored). Lean too far and she drops into the net.
// Score is metres walked; each platform is a breather, and the next span is quicker and touchier.
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds;
const { sounds, sfx } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util;

// Fluid height: the wire sits a little lower on taller screens, the net and HUD stay on the bottom edge. The
// physics never look at H, so a taller screen is no easier.
const W = 360, CX = W / 2, PX = 34, SPAN = 25, LIMIT = .72, POLE = 112;
let H = 640, WY = 392, NY = 566;
function layout(h) { H = h; WY = 392 + Math.round((h - 640) * .6); NY = h - 74; }

function make(api) {
  const feel = new Feel(), ready = new Ready();
  let th, om, uc, dist, span, v, phase, restT, fallT, gust, gustT, birds, birdT, flyers, held, lastTap, t, wob, wobT, best, fall, keys;

  const K = () => span ? 1.5 + span * .22 : 1.0;          // the first span is a gentle one to learn in
  const pressed = () => { let u = 0; for (const s of held.values()) u += s; return clamp(u + keys, -1, 1); };
  function shoo(side) {
    const out = birds.filter(b => b.side === side); if (!out.length) return;
    birds = birds.filter(b => b.side !== side); sounds.flap(); haptic('light');
    for (const b of out) flyers.push({ x: CX + side * POLE, y: WY - 80, vx: side * rnd(60, 140), vy: -rnd(120, 180), f: 0 });
  }
  function tap(side) {
    if (t - lastTap[side] < .35) { shoo(side); lastTap[side] = -9; } else lastTap[side] = t;
  }

  return {
    resize(w, h) {
      const wy0 = WY; layout(h);
      if (fall) fall.y = Math.min(fall.y + WY - wy0, NY - 20);   // keep a falling acrobat in step with the moved wire/net
    },
    reset() {
      th = 0; om = 0; uc = 0; dist = 0; span = 0; v = 1.4; phase = 'walk'; restT = 0; fallT = 0; gust = null; gustT = rnd(4.5, 6);
      birds = []; birdT = rnd(7, 10); flyers = []; held = new Map(); lastTap = { '-1': -9, '1': -9 }; t = 0; wob = 0; wobT = 0; best = 0; fall = null; keys = 0;
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt;
      for (const f of flyers) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 40 * dt; f.f += dt * 14; }
      flyers = flyers.filter(f => f.y > -40 && f.x > -40 && f.x < W + 40);
      if (feel.frozen || !ready.update(dt)) return;
      if (phase === 'fall') {
        fallT += dt; fall.vy += 900 * dt; fall.y += fall.vy * dt; fall.x += fall.vx * dt; fall.a += fall.va * dt;
        if (fall.y > NY - 20 && fall.vy > 0) { fall.y = NY - 20; fall.vy *= -.45; fall.va *= .5; fall.sag = Math.min(40, Math.abs(fall.vy) * .12 + 10); if (Math.abs(fall.vy) > 60) { sounds.boing(); haptic('medium'); } }
        fall.sag *= Math.pow(.05, dt);
        if (fallT > 1.8) { phase = 'end'; api.over(); }
        return;
      }
      if (phase === 'rest') {
        restT -= dt; th *= Math.pow(.02, dt); om = 0; uc *= Math.pow(.02, dt);
        if (restT <= 0) { phase = 'walk'; span++; v = Math.min(3.4, 1.4 + span * .26); gustT = rnd(2, 4); birdT = rnd(4, 7); sounds.go(); }
        return;
      }
      // the pendulum: gravity tips her further, the pole pulls back, gusts and birds push
      uc += (pressed() - uc) * Math.min(1, dt * 9);
      wobT -= dt; if (wobT <= 0) { wobT = rnd(.4, 1); wob = rnd(-.25, .25) * (span ? 1 + span * .15 : .6); }
      let a = K() * Math.sin(th) + 3.6 * uc + wob;
      gustT -= dt;
      if (!gust && gustT <= 0) { gust = { dir: Math.random() < .5 ? -1 : 1, warn: 1.3, on: 1.1, f: 1 + span * .15 }; sounds.whistle(.8); }
      if (gust) {
        if (gust.warn > 0) { gust.warn -= dt; if (gust.warn <= 0) sounds.gust(); }
        else { a += gust.dir * gust.f; gust.on -= dt; if (Math.random() < dt * 8) feel.juice.burst(gust.dir > 0 ? 0 : W, WY + rnd(-192, 48), { n: 2, speed: 300, life: .5, size: 2, color: '#ffffffaa' }); if (gust.on <= 0) { gust = null; gustT = Math.max(2, rnd(4, 7) - span * .4); } }
      }
      birdT -= dt;
      if (birdT <= 0) {
        birdT = Math.max(3, rnd(6, 10) - span * .5); const side = Math.random() < .5 ? -1 : 1;
        if (birds.filter(b => b.side === side).length < 2) { birds.push({ side, life: 6, land: .4 }); sounds.chirp(); }
      }
      for (const b of birds) { b.life -= dt; b.land = Math.max(0, b.land - dt); a += b.side * .85 * (b.land > 0 ? .3 : 1); }
      for (const b of birds) if (b.life <= 0) flyers.push({ x: CX + b.side * POLE, y: WY - 80, vx: b.side * 90, vy: -150, f: 0 });
      birds = birds.filter(b => b.life > 0);
      om += a * dt; om *= Math.pow(.4, dt); th += om * dt;
      if (Math.abs(th) > LIMIT) {
        phase = 'fall'; fallT = 0; birds = []; gust = null; feel.hurt(CX, WY - 60); sounds.slip(); haptic('error');
        fall = { x: CX, y: WY - 50, vx: Math.sign(th) * 70, vy: -60, a: th, va: Math.sign(th) * 4, sag: 0 }; return;
      }
      if (Math.abs(th) > LIMIT * .7 && Math.random() < dt * 8) haptic('tick');
      dist += v * dt;
      if (Math.floor(dist) > best) { best = Math.floor(dist); api.score(best); if (best % 10 === 0) sounds.tick(); }
      if (dist >= (span + 1) * SPAN) {
        dist = (span + 1) * SPAN; phase = 'rest'; restT = 2.2; gust = null; shoo(-1); shoo(1);
        feel.coin(CX, WY - 140, { color: '#ffd84a', text: 'PLATFORM!' }); sounds.fanfare(); haptic('success');
      }
    },
    fx(dt) { feel.update(dt); },
    draw(c) {
      // the big top: stripes fanning from the apex, a spotlight on her
      c.fillStyle = '#2a0e18'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 18; i++) {
        const a0 = Math.PI * (.05 + i / 18 * .9), a1 = Math.PI * (.05 + (i + 1) / 18 * .9);
        c.fillStyle = i % 2 ? '#5a1a26' : '#3b1420'; c.beginPath(); c.moveTo(CX, -80); c.lineTo(CX + Math.cos(a0) * 900, -80 + Math.sin(a0) * 900); c.lineTo(CX + Math.cos(a1) * 900, -80 + Math.sin(a1) * 900); c.fill();
      }
      const sx = phase === 'fall' ? fall.x : CX, sp = c.createRadialGradient(sx, WY - 60, 10, sx, WY - 60, 200);
      sp.addColorStop(0, 'rgba(255,240,200,.32)'); sp.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = sp; c.fillRect(0, 0, W, H);
      c.fillStyle = '#170810'; c.fillRect(0, H - 50, W, 50);
      feel.begin(c);
      // platforms and towers, the wire and its metre marks
      for (let k = span; k <= span + 2; k++) {
        const x = CX + (k * SPAN - dist) * PX; if (x < -60 || x > W + 60) continue;
        c.fillStyle = '#8a6a48'; c.fillRect(x - 5, WY, 10, H - WY); c.fillStyle = '#c9a26a'; c.fillRect(x - 36, WY, 72, 10);
        c.fillStyle = '#ffd84a'; c.fillRect(x - 36, WY + 10, 72, 3);
      }
      c.strokeStyle = '#d8d0c0'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, WY); c.lineTo(W, WY); c.stroke();
      c.fillStyle = '#d8d0c088'; for (let m = Math.ceil(dist - 6); m < dist + 6; m++) if (m % 5 === 0 && m >= 0) c.fillRect(CX + (m - dist) * PX - 1, WY + 3, 2, 6);
      // the net
      const sag = fall ? fall.sag : 0, fx0 = fall ? fall.x : CX;
      c.strokeStyle = '#c8b89a66'; c.lineWidth = 1; c.beginPath();
      const ny = x => NY + sag * Math.max(0, 1 - Math.abs(x - fx0) / 140);
      for (let x = -20; x < W + 20; x += 16) { c.moveTo(x, ny(x)); c.lineTo(x + 16, ny(x + 16) + 10); c.moveTo(x + 16, ny(x + 16)); c.lineTo(x, ny(x) + 10); }
      c.stroke(); c.strokeStyle = '#c8b89a'; c.lineWidth = 2; c.beginPath(); for (let x = 0; x <= W; x += 10) c.lineTo(x, ny(x)); c.stroke();
      // the acrobat: pivot at her feet, pole in her hands, birds on its ends
      c.save();
      if (phase === 'fall') { c.translate(fall.x, fall.y + 50); c.rotate(fall.a); } else { c.translate(CX, WY - 1); c.rotate(th); }
      const step = phase === 'walk' && ready.playing ? Math.sin(dist * 4) * 7 : 0;
      c.strokeStyle = '#f2e6d8'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-3 + step, 0); c.lineTo(0, -44); c.lineTo(3 - step, 0); c.stroke();
      c.fillStyle = '#26b5a8'; c.beginPath(); c.roundRect(-11, -92, 22, 52, 9); c.fill();
      c.fillStyle = '#ffd84a'; c.fillRect(-11, -62, 22, 5);
      c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(0, -104, 11, 0, 7); c.fill();
      c.fillStyle = '#6a3a22'; c.beginPath(); c.arc(0, -108, 11, Math.PI, 0); c.fill(); c.beginPath(); c.arc(9, -106, 5, 0, 7); c.fill();
      c.save(); c.translate(0, -76); c.rotate(-th * .5 + uc * .26);
      c.strokeStyle = '#f2c9a0'; c.lineWidth = 4; c.beginPath(); c.moveTo(-8, -10); c.lineTo(-22, 0); c.moveTo(8, -10); c.lineTo(22, 0); c.stroke();
      c.strokeStyle = '#e8dcc0'; c.lineWidth = 4; c.beginPath(); c.moveTo(-POLE, 0); c.lineTo(POLE, 0); c.stroke();
      for (const s of [-1, 1]) {
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(s * POLE, 0, 7, 0, 7); c.fill();
        birds.filter(b => b.side === s).forEach((b, i) => {
          const bx = s * (POLE - 4 - i * 16), byy = -12 - b.land * 60, flap = b.land > 0 ? Math.sin(t * 40) * 6 : 0, warn = b.life < 1.5 && (t * 8 | 0) % 2;
          c.fillStyle = warn ? '#8fa8c8' : '#5b7bb5'; c.beginPath(); c.ellipse(bx, byy, 9, 7, 0, 0, 7); c.fill();
          c.beginPath(); c.arc(bx + s * 7, byy - 6, 5, 0, 7); c.fill();
          c.fillStyle = '#ffb02e'; c.beginPath(); c.moveTo(bx + s * 11, byy - 7); c.lineTo(bx + s * 17, byy - 5); c.lineTo(bx + s * 11, byy - 3); c.fill();
          c.fillStyle = '#3a527e'; c.beginPath(); c.moveTo(bx - 4, byy - 2); c.lineTo(bx - s * 10, byy - 8 - flap); c.lineTo(bx + 4, byy - 2); c.fill();
        });
      }
      c.restore(); c.restore();
      for (const f of flyers) { const w = Math.sin(f.f) * 8; c.fillStyle = '#5b7bb5'; c.beginPath(); c.ellipse(f.x, f.y, 8, 6, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(f.x - 10, f.y - w); c.lineTo(f.x, f.y); c.lineTo(f.x + 10, f.y - w); c.strokeStyle = '#5b7bb5'; c.lineWidth = 3; c.stroke(); }
      feel.end(c, W, H);
      // gust warning arrows on the side the wind comes from
      if (gust) {
        const from = gust.dir > 0 ? 0 : W, blink = gust.warn > 0 ? (t * 8 | 0) % 2 : 1;
        if (blink) for (let i = 0; i < 3; i++) {
          const y = WY - 162 + i * 50, x = from + gust.dir * (30 + (gust.warn > 0 ? 0 : (t * 300 + i * 40) % 80));
          c.fillStyle = gust.warn > 0 ? '#ffd84a' : '#ffffffcc'; c.beginPath(); c.moveTo(x + gust.dir * 22, y); c.lineTo(x - gust.dir * 6, y - 14); c.lineTo(x - gust.dir * 6, y + 14); c.fill();
        }
      }
      // HUD at the bottom: lean meter, metres, hold zones
      const ln = clamp((phase === 'fall' ? LIMIT : th) / LIMIT, -1, 1);
      c.fillStyle = '#ffffff22'; c.fillRect(70, H - 98, 220, 12); c.fillStyle = Math.abs(ln) > .7 ? '#ff5a4a' : '#7be0a0';
      c.fillRect(CX + Math.min(0, ln * 110), H - 98, Math.abs(ln * 110), 12); c.fillStyle = '#fff'; c.fillRect(CX - 1, H - 101, 2, 18);
      c.textAlign = 'center'; c.fillStyle = '#fff2dc'; c.font = '800 22px Rubik, sans-serif'; c.fillText(`${Math.floor(dist)} m`, CX, H - 58);
      c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#d9b9a6'; c.fillText(`next platform ${Math.max(0, Math.ceil((span + 1) * SPAN - dist))} m`, CX, H - 40);
      for (const s of [-1, 1]) {
        const on = phase === 'walk' && (pressed() === s), x = s < 0 ? 34 : W - 34;
        c.fillStyle = on ? '#ffd84a' : '#ffffff33'; c.beginPath(); c.moveTo(x + s * 14, H - 26); c.lineTo(x - s * 10, H - 40); c.lineTo(x - s * 10, H - 12); c.fill();
      }
      ready.draw(c, W, H, { text: 'Hold left or right to balance', y: WY - 222, color: '#fff2dc' });
    },
    down(x, y, id) {
      if (ready.go()) return;
      const side = x < CX ? -1 : 1; held.set(id ?? 0, side); if (phase === 'walk') tap(side);
    },
    move(x, y, pr, id) { if (pr && held.has(id ?? 0)) held.set(id ?? 0, x < CX ? -1 : 1); },
    up(x, y, id) { held.delete(id ?? 0); },
    key(k, d) {
      if (d && ready.go()) return;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { const s = k === 'ArrowLeft' ? -1 : 1; if (d) { if (keys !== s) tap(s); keys = s; } else if (keys === s) keys = 0; }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'high-wire', title: 'High Wire', tag: 'Casual · Balance', retro: false, w: W, h: 640, maxH: 800, tick: 60, music: 'tense',
  goal: 80,
  hint: 'Hold the left or right half of the screen to dip that end of the pole and stop her leaning over. Double tap a side to shoo birds off it.',
  creator: 'Noctizzle',
  make,
};
