// Sand Pour: a funnel slides along the top of a desert tray. Hold to pour, drag to slide it. Sand piles up
// on a heightmap and slumps sideways whenever a slope is steeper than sand can stand, so piles spread like
// real ones. Fill the dotted outline with the sand in the bag: spills above it cost, gaps lower the grade.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { sfx, notes, bed } = gs.sound;
const { haptic } = gs.device;
const { rnd, clamp } = gs.util;

// fluid height: the tray, pile, funnel and controls keep their spacing anchored to the bottom; extra height is sky.
const W = 360, CW = 3, N = W / CW, REP = 2.4, G = 3.2, RATE = 115, DROP = 366;
const SHAPES = [   // u in 0..1 → height
  { n: 'HILL', f: u => 130 * Math.exp(-(((u - .5) / .17) ** 2)) },
  { n: 'RAMP', f: u => u < .72 ? 20 + 150 * u / .72 : 0 },
  { n: 'TWIN PEAKS', f: u => 115 * (Math.exp(-(((u - .3) / .09) ** 2)) + Math.exp(-(((u - .7) / .09) ** 2))) },
  { n: 'MESA', f: u => Math.abs(u - .5) < .2 ? 100 : 0 },
  { n: 'CASTLE', f: u => Math.abs(u - .5) < .07 ? 175 : Math.abs(u - .2) < .05 || Math.abs(u - .8) < .05 ? 150 : Math.abs(u - .5) < .34 ? 80 : 0 },
  { n: 'DUNE', f: u => 140 * Math.exp(-(((u - .62) / (u < .62 ? .3 : .1)) ** 2)) },
  { n: 'VALLEY', f: u => 25 + 120 * ((u - .5) * 2) ** 2 },
  { n: 'STEPS', f: u => u < .2 ? 30 : u < .4 ? 70 : u < .6 ? 110 : u < .8 ? 150 : 60 },
];

function make(api) {
  const feel = new Feel({ sound: false });
  const ready = new Ready();
  let hiss = null;
  let H = 640, FLOOR = H - 124, FY = FLOOR - DROP;
  let h, tgt, grains, fx, tx, hold, bag, cap, level, score, phase, pt, name, grade, pass, total, dunes, tick;

  function startLevel() {
    const { n: nm, f } = SHAPES[(level - 1) % SHAPES.length], k = level > SHAPES.length ? rnd(.85, 1.1) : 1;
    name = nm; h = new Float32Array(N); grains = [];
    tgt = Array.from({ length: N }, (_, i) => Math.max(0, f((i + .5) / N) * k));
    for (let p = 0; p < 2; p++) {   // no outline steeper than sand can stand: shave it to the angle of repose
      for (let i = 1; i < N; i++) tgt[i] = Math.min(tgt[i], tgt[i - 1] + REP * .9);
      for (let i = N - 2; i >= 0; i--) tgt[i] = Math.min(tgt[i], tgt[i + 1] + REP * .9);
    }
    total = tgt.reduce((a, b) => a + b, 0);
    cap = bag = total * Math.max(1.03, 1.14 - level * .015);
    pass = Math.min(76, 52 + level * 3);
    phase = 'pour'; pt = 0; grade = null;
  }
  function finish() { if (phase === 'pour') { phase = 'settle'; pt = 0; hold = false; sfx(440, .1, 'triangle', .04); } }
  function slump() {   // sand steeper than its angle of repose slides sideways; volume is kept
    for (let p = 0; p < 6; p++) {
      const fwd = (p + tick) % 2 === 0;
      for (let k = 0; k < N - 1; k++) {
        const i = fwd ? k : N - 2 - k, d = h[i] - h[i + 1];
        if (d > REP) { const m = (d - REP) * .25; h[i] -= m; h[i + 1] += m; }
        else if (d < -REP) { const m = (-d - REP) * .25; h[i] += m; h[i + 1] -= m; }
      }
    }
  }
  function judge() {
    let over = 0, gap = 0;
    for (let i = 0; i < N; i++) { over += Math.max(0, h[i] - tgt[i]); gap += Math.max(0, tgt[i] - h[i]); }
    const pct = Math.round(clamp(1 - (over * 1.25 + gap) / total, 0, 1) * 100);
    const stars = pct >= 92 ? 3 : pct >= 80 ? 2 : pct >= pass ? 1 : 0;
    grade = { pct, stars, ok: pct >= pass };
    if (grade.ok) {
      score += pct + stars * 10; api.score(score);
      feel.win(W / 2, FLOOR - 160); notes(stars === 3 ? 'C5 E5 G5 C6' : 'C5 E5 G5', { len: .08 }); haptic('success');
      for (let s = 0; s < stars; s++) feel.coin(W / 2 - 40 + s * 40, FY + 110, { color: '#ffd166', pitch: 1 + s * .2 });
    } else { feel.hurt(W / 2, FLOOR - 100); sfx(200, .45, 'sawtooth', .04, -120); }
  }

  return {
    reset() {
      hiss?.stop(); hiss = null;   // the app stops beds with each round, so make a fresh one per round
      level = 1; score = 0; fx = tx = W / 2; hold = false; tick = 0; feel.clear(); ready.reset(); startLevel();
      dunes = Array.from({ length: 3 }, (_, i) => ({ y: 330 - 516 + i * 38, a: rnd(0, 7), s: rnd(.008, .016) }));
      hiss?.set({ vol: 0 }, .05);
    },
    resize(w, h) {
      const dy = (h - 124) - FLOOR;
      H = h; FLOOR = H - 124; FY = FLOOR - DROP;
      for (const g of grains || []) g.y += dy;   // the pile is stored as heights above FLOOR, so it moves with it
    },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      if (!hiss) hiss = bed({ vol: 0, from: 1800, filter: 'bandpass', q: .7 });
      if (!ready.update(dt)) return;
      tick++; pt += dt;
      fx += clamp(tx - fx, -520 * dt, 520 * dt); fx = clamp(fx, 14, W - 14);
      const pouring = phase === 'pour' && hold && bag > 0;
      hiss?.set({ vol: pouring ? .05 : 0, from: 1500 + Math.random() * 600 }, .06);
      if (pouring) {
        for (let n = Math.floor(RATE * dt + Math.random()); n > 0 && bag > 0; n--) { grains.push({ x: fx + rnd(-2.5, 2.5), y: FY + 14, vy: rnd(40, 90) }); bag -= G; }
        if (bag <= 0) { bag = 0; finish(); }
      }
      const keep = [];
      for (const g of grains) {
        g.vy += 900 * dt; g.y += g.vy * dt;
        const i = clamp(Math.floor(g.x / CW), 0, N - 1);
        if (g.y >= FLOOR - h[i]) { h[i] += G; if (Math.random() < .02) haptic('tick'); } else keep.push(g);
      }
      grains = keep;
      slump();
      if (phase === 'settle' && !grains.length && pt > .6) { phase = 'graded'; pt = 0; hiss?.set({ vol: 0 }, .05); judge(); }
      else if (phase === 'graded' && pt > 2.2) {
        if (!grade.ok) { feel.lose(); return api.over(); }
        level++; startLevel();
      }
    },
    draw(c) {
      const sky = c.createLinearGradient(0, 0, 0, FLOOR); sky.addColorStop(0, '#f6b26b'); sky.addColorStop(.55, '#fcd9a0'); sky.addColorStop(1, '#fbe7c2');
      c.fillStyle = sky; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(70, FLOOR - 266, 34, 0, 7); c.fill();
      dunes.forEach((d, k) => {
        c.fillStyle = ['#e9b77a', '#dda465', '#cf9250'][k]; c.beginPath(); c.moveTo(0, FLOOR);
        for (let x = 0; x <= W; x += 12) c.lineTo(x, FLOOR + d.y + Math.sin(x * d.s + d.a) * 16); c.lineTo(W, FLOOR); c.fill();
      });
      feel.begin(c);
      // the pile, with sand above the outline tinted once graded
      c.fillStyle = '#e8b04f'; c.beginPath(); c.moveTo(0, FLOOR);
      for (let i = 0; i < N; i++) c.lineTo(i * CW + CW / 2, FLOOR - h[i]);
      c.lineTo(W, FLOOR); c.fill();
      c.fillStyle = '#c98a32'; for (let i = 0; i < N; i += 2) { const y = FLOOR - h[i] * .55; if (h[i] > 12) c.fillRect(i * CW, y, 2, 2); }
      c.fillStyle = '#fff0b8'; for (let i = 0; i < N; i++) if (h[i] > 1) c.fillRect(i * CW, FLOOR - h[i], CW, 1.5);
      if (phase === 'graded') {
        c.fillStyle = '#d0402f88';
        for (let i = 0; i < N; i++) if (h[i] > tgt[i] + 1) c.fillRect(i * CW, FLOOR - h[i], CW, h[i] - tgt[i]);
        c.fillStyle = '#4a7bd033';
        for (let i = 0; i < N; i++) if (tgt[i] > h[i] + 1) c.fillRect(i * CW, FLOOR - tgt[i], CW, tgt[i] - h[i]);
      }
      // the target outline, dotted
      c.strokeStyle = '#5b2e12'; c.lineWidth = 2.5; c.setLineDash([5, 6]); c.beginPath();
      for (let i = 0; i < N; i++) { const x = i * CW + CW / 2, y = FLOOR - tgt[i]; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke(); c.setLineDash([]);
      c.fillStyle = '#e6a63e'; for (const g of grains) c.fillRect(g.x - 1, g.y - 1, 2.4, 2.4);
      // the funnel on its rail
      c.fillStyle = '#7a4a24'; c.fillRect(0, FY - 34, W, 4);
      c.fillStyle = '#b5652c'; c.beginPath(); c.moveTo(fx - 26, FY - 30); c.lineTo(fx + 26, FY - 30); c.lineTo(fx + 6, FY + 4); c.lineTo(fx + 5, FY + 14); c.lineTo(fx - 5, FY + 14); c.lineTo(fx - 6, FY + 4); c.closePath(); c.fill();
      c.fillStyle = '#e8b04f'; c.fillRect(fx - 20, FY - 26, 40 * clamp(bag / cap, 0, 1), 6);
      c.fillStyle = '#8a4a1e'; c.fillRect(fx - 26, FY - 32, 52, 4);
      feel.end(c, W, H);
      // tray floor and controls
      c.fillStyle = '#8a5a2b'; c.fillRect(0, FLOOR, W, H - FLOOR); c.fillStyle = '#6e4420'; c.fillRect(0, FLOOR, W, 5);
      c.fillStyle = '#fbe7c2'; c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('BAG', 18, H - 70);
      c.fillStyle = '#5a3516'; c.fillRect(18, H - 62, 190, 22); c.fillStyle = bag / cap < .2 ? '#ff9a5a' : '#f2c36b'; c.fillRect(20, H - 60, 186 * clamp(bag / cap, 0, 1), 18);
      const can = phase === 'pour';
      c.fillStyle = can ? '#3f8f5a' : '#6b6b6b'; c.beginPath(); c.roundRect(W - 122, H - 72, 104, 50, 12); c.fill();
      c.fillStyle = '#fff'; c.font = '900 20px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('DONE', W - 70, H - 40);
      // HUD under the app's score badge
      const top = Math.round(api.scoreArea().bottom + 18);
      c.fillStyle = '#5b2e12'; c.font = '800 17px Rubik, sans-serif'; c.fillText(`LEVEL ${level}: ${name}`, W / 2, top);
      c.font = '600 12px Rubik, sans-serif'; c.fillText(`pass mark ${pass}%`, W / 2, top + 17);
      if (grade) {
        c.fillStyle = '#5b2e12'; c.font = '900 40px Rubik, sans-serif'; c.fillText(`${grade.pct}%`, W / 2, FY + 80);
        c.font = '800 16px Rubik, sans-serif'; c.fillText(grade.ok ? '★'.repeat(grade.stars) + '☆'.repeat(3 - grade.stars) : 'BELOW THE PASS MARK', W / 2, FY + 106);
      } else if (level === 1 && pt < 4) { c.fillStyle = '#5b2e12'; c.font = '700 14px Rubik, sans-serif'; c.fillText('HOLD TO POUR · DRAG TO SLIDE', W / 2, FY + 50); }
      ready.draw(c, W, H);
    },
    down(x, y) {
      if (ready.go()) return;
      if (x > W - 128 && y > H - 78) return finish();
      hold = true; tx = x;
    },
    move(x, y, pressed) { if (pressed && hold) tx = x; },
    up() { hold = false; },
    key(k, d) {
      if (k === ' ') { if (d && ready.go()) return; hold = d; }
      if (!d) return;
      if (k === 'ArrowLeft') tx = fx - 24; if (k === 'ArrowRight') tx = fx + 24; if (k === 'Enter') finish();
    },
    pause() { hiss?.set({ vol: 0 }, .05); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'sand-pour',
  title: 'Sand Pour',
  tag: 'Casual · Pour',
  retro: false,
  w: 360, h: 640, maxH: 800,
  tick: 60,
  music: 'puzzle',
  goal: 250,
  hint: 'Hold to pour sand and drag to slide the funnel. Fill the dotted outline, then press DONE.',
  creator: 'Noctizzle',
  make,
};
