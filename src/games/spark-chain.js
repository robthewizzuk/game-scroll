// Spark Chain: fireflies drift over a night meadow. Each wave you get ONE tap: it opens a glowing burst,
// and any firefly that touches a burst bursts too, so a good tap sets off a chain across the field.
// Catch the wave's quota to move on (more and faster fireflies, a higher quota); miss it and a lantern goes out.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { sfx, notes } = gs.sound;
const { haptic } = gs.device;
const { rnd, clamp } = gs.util;

// fluid height: the meadow band keeps a fixed height (so firefly density and difficulty match at every
// screen height) and sits on the ground at the bottom; extra height becomes night sky above it.
const W = 360, BAND = 440, FR = 7, WAIT = 10;

function make(api) {
  const feel = new Feel({ sound: false });
  const ready = new Ready();
  let H = 640, BOT = H - 90, TOP = BOT - BAND;
  let flies, bursts, wave, quota, caught, total, lives, phase, pt, links, stars, grass, msg, best;

  function startWave() {
    const m = Math.min(42, 12 + wave * 3), sp = Math.min(95, 28 + wave * 7);
    quota = Math.min(Math.floor(m * .82), Math.ceil(m * (.3 + wave * .05)));
    flies = Array.from({ length: m }, () => {
      const a = rnd(0, 7), s = rnd(.6, 1) * sp;
      return { x: rnd(30, W - 30), y: rnd(TOP + 20, BOT - 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s, ph: rnd(0, 7), sp: s };
    });
    bursts = []; caught = 0; links = 0; best = 0; phase = 'aim'; pt = 0;
  }
  function burst(x, y, link) {
    bursts.push({ x, y, r: 0, max: 58 - Math.min(18, wave * 2) + Math.min(8, link * .4), age: 0, link });
  }
  function tap(x, y) {
    if (phase !== 'aim') return;
    phase = 'chain'; pt = 0;
    burst(clamp(x, 10, W - 10), clamp(y, TOP, BOT), 0);
    sfx(220, .25, 'sine', .06, 180); haptic('light');
  }
  function endWave(ok) {
    phase = 'result'; pt = 0;
    if (ok) { msg = caught >= quota * 1.6 ? 'BRILLIANT!' : 'WAVE CLEAR'; feel.win(W / 2, H / 2); notes('C5 E5 G5 C6', { len: .07 }); wave++; }
    else {
      lives--; msg = lives > 0 ? 'A LANTERN GOES OUT' : 'DAWN BREAKS'; feel.hurt(W / 2, H / 2); sfx(180, .4, 'triangle', .06, -80);
      if (lives <= 0) { feel.lose(); api.over(); }
    }
  }

  return {
    reset() {
      wave = 1; total = 0; lives = 3; msg = ''; feel.clear(); ready.reset(); startWave();
      stars = Array.from({ length: 50 }, () => ({ x: rnd(0, W), f: rnd(0, 1), s: rnd(.5, 1.6), p: rnd(0, 7) }));
      grass = Array.from({ length: 70 }, (_, i) => ({ x: i * 5.3 + rnd(-2, 2), h: rnd(18, 48), b: rnd(-6, 6) }));
    },
    resize(w, h) {
      const dy = (h - 90) - BOT;
      H = h; BOT = H - 90; TOP = BOT - BAND;
      for (const o of [...(flies || []), ...(bursts || [])]) o.y += dy;   // keep the field where it was on the meadow
    },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      for (const f of flies) {   // fireflies drift and weave inside the meadow
        f.ph += dt * 2;
        const a = Math.atan2(f.vy, f.vx) + Math.sin(f.ph) * dt * 1.6;
        f.vx = Math.cos(a) * f.sp; f.vy = Math.sin(a) * f.sp;
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.x < 14 || f.x > W - 14) { f.vx *= -1; f.x = clamp(f.x, 14, W - 14); }
        if (f.y < TOP || f.y > BOT) { f.vy *= -1; f.y = clamp(f.y, TOP, BOT); }
      }
      if (!ready.update(dt)) return;
      pt += dt;
      if (phase === 'aim' && pt > WAIT) { endWave(false); if (lives > 0) msg = 'TOO SLOW'; return; }
      if (phase === 'chain') {
        for (const b of bursts) {
          b.age += dt;
          b.r = b.age < .35 ? b.max * Math.sin(b.age / .35 * Math.PI / 2) : b.age < 1.2 ? b.max : b.max * Math.max(0, 1 - (b.age - 1.2) / .35);
        }
        const fresh = [];
        for (const b of bursts) {
          if (b.age > 1.4) continue;   // fading bursts no longer catch
          for (const f of flies) {
            if (f.dead || Math.hypot(f.x - b.x, f.y - b.y) > b.r + FR) continue;
            f.dead = true; caught++; total++; links++; best = Math.max(best, b.link + 1);
            fresh.push([f.x, f.y, b.link + 1]);
            const p = Math.min(2.4, 1 + links * .045);
            sfx(330 * p, .12, 'triangle', .045, 120 * p); haptic('tick');
            feel.coin(f.x, f.y, { color: '#e8ff7a', text: '+1', pitch: p });
            if (links % 5 === 0) { feel.combo(links, f.x, f.y - 20, { color: '#fff1a0' }); sfx(660 * p, .18, 'sine', .04, 300); }
          }
        }
        for (const [x, y, l] of fresh) burst(x, y, l);
        if (fresh.length) { flies = flies.filter(f => !f.dead); api.score(total); }
        bursts = bursts.filter(b => b.age < 1.55);
        if (!bursts.length) endWave(caught >= quota);
      } else if (phase === 'result' && pt > 1.6 && lives > 0) startWave();
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060b24'); g.addColorStop(.6, '#132a45'); g.addColorStop(1, '#0f2a26');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (const s of stars) { c.fillStyle = `rgba(255,255,230,${.35 + .3 * Math.sin(s.p + pt * 2)})`; c.fillRect(s.x, s.f * (TOP + 120), s.s, s.s); }
      c.fillStyle = '#f4f0d0'; c.beginPath(); c.arc(292, 70, 20, 0, 7); c.fill();
      c.fillStyle = '#060b24'; c.beginPath(); c.arc(282, 64, 18, 0, 7); c.fill();
      c.fillStyle = '#0b1e1c'; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 30) c.lineTo(x, BOT + 30 + Math.sin(x * .03) * 10); c.lineTo(W, H); c.fill();
      feel.begin(c);
      c.globalCompositeOperation = 'lighter';
      for (const b of bursts) {
        const a = b.age > 1.2 ? Math.max(0, 1 - (b.age - 1.2) / .35) : 1, rr = Math.max(1, b.r);
        const rg = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, rr * 1.25);
        rg.addColorStop(0, `rgba(255,255,200,${.8 * a})`); rg.addColorStop(.6, `rgba(190,255,90,${.45 * a})`); rg.addColorStop(1, 'rgba(120,255,60,0)');
        c.fillStyle = rg; c.beginPath(); c.arc(b.x, b.y, rr * 1.25, 0, 7); c.fill();
        c.strokeStyle = `rgba(230,255,160,${.6 * a})`; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, rr, 0, 7); c.stroke();
      }
      for (const f of flies) {
        const gl = .55 + .45 * Math.sin(f.ph * 2.3);
        const fg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, 16); fg.addColorStop(0, `rgba(220,255,110,${.55 * gl})`); fg.addColorStop(1, 'rgba(160,255,80,0)');
        c.fillStyle = fg; c.beginPath(); c.arc(f.x, f.y, 16, 0, 7); c.fill();
        c.fillStyle = '#fbffcf'; c.beginPath(); c.arc(f.x, f.y, 3.2, 0, 7); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      feel.end(c, W, H);
      c.strokeStyle = '#08201a'; c.lineWidth = 3;   // grass in front
      for (const s of grass) { c.beginPath(); c.moveTo(s.x, H); c.quadraticCurveTo(s.x, H - s.h * .6, s.x + s.b, H - s.h); c.stroke(); }
      // HUD under the app's score badge
      const top = Math.round(api.scoreArea().bottom + 18);
      c.textAlign = 'center'; c.font = '800 17px Rubik, sans-serif';
      c.fillStyle = caught >= quota ? '#c9ff7a' : '#ffffff';
      c.fillText(`CATCH ${Math.min(caught, 99)} / ${quota}  of ${flies.length + caught}`, W / 2, top);
      c.font = '600 12px Rubik, sans-serif'; c.fillStyle = '#ffffff99'; c.fillText(`WAVE ${wave}`, W / 2, top + 18);
      if (phase === 'aim' && ready.playing) {
        const k = 1 - pt / WAIT; c.fillStyle = '#ffffff22'; c.fillRect(W / 2 - 60, top + 26, 120, 4);
        c.fillStyle = k < .3 ? '#ff8a6a' : '#c9ff7a'; c.fillRect(W / 2 - 60, top + 26, 120 * clamp(k, 0, 1), 4);
        if (pt < 2.5) { c.font = '700 15px Rubik, sans-serif'; c.fillStyle = '#ffffffcc'; c.fillText('ONE TAP: START THE CHAIN', W / 2, BOT + 40); }
      }
      if (phase === 'result') {
        c.font = '900 30px Rubik, sans-serif'; c.fillStyle = '#fff6c0'; c.fillText(msg, W / 2, H / 2 - 10);
        if (best > 2) { c.font = '700 15px Rubik, sans-serif'; c.fillText(`longest chain ${best}`, W / 2, H / 2 + 18); }
      }
      for (let i = 0; i < 3; i++) {   // lanterns
        const x = 26 + i * 30, y = H - 34, lit = i < lives;
        c.fillStyle = '#3a2c1c'; c.fillRect(x - 7, y - 14, 14, 3); c.fillRect(x - 7, y + 10, 14, 3);
        c.fillStyle = lit ? '#ffd35a' : '#2a2a34'; c.fillRect(x - 6, y - 11, 12, 21);
        if (lit) { c.fillStyle = '#fff6c0'; c.fillRect(x - 2, y - 6, 4, 10); }
      }
      ready.draw(c, W, H);
    },
    down(x, y) { if (ready.go()) return; tap(x, y); },
    key(k, d) { if (!d || k !== ' ') return; if (ready.go()) return; tap(W / 2, (TOP + BOT) / 2); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'spark-chain',
  title: 'Spark Chain',
  tag: 'Casual · Chain reaction',
  retro: false,
  w: 360, h: 640, maxH: 800,
  tick: 60,
  music: 'calm',
  goal: 35,
  hint: 'Tap once per wave to make a glowing burst: fireflies that touch it burst too. Catch the quota or a lantern goes out.',
  creator: 'Noctizzle',
  make,
};
