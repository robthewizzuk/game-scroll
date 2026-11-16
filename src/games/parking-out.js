import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects;

// Slide the cars along their lanes to clear a path so the red car can drive out of the exit on the right.
const W = 360, H = 640, N = 6, CS = 52, OX = (W - N * CS) / 2, OY = 170, EXIT_ROW = 2;
const HUES = [30, 50, 140, 190, 220, 265, 310, 90];

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let cars, drag, time, score, t, moves, leaving, dead;
  const occ = (skip) => { const o = new Set(); for (const c of cars) if (c !== skip) for (let i = 0; i < c.len; i++) o.add((c.y + (c.h ? 0 : i)) * N + c.x + (c.h ? i : 0)); return o; };
  const range = c => { const o = occ(c); let lo = c.h ? c.x : c.y, hi = lo; while (lo > 0 && !o.has(c.h ? c.y * N + lo - 1 : (lo - 1) * N + c.x)) lo--; while (hi + c.len < N && !o.has(c.h ? c.y * N + hi + c.len : (hi + c.len) * N + c.x)) hi++; return [lo, hi]; };
  function puzzle(level) {
    for (;;) {
      cars = [{ x: 4, y: EXIT_ROW, len: 2, h: true, red: true }]; const want = Math.min(11, 6 + level);
      for (let tries = 0; tries < 300 && cars.length < want; tries++) {
        const h = Math.random() < .5, len = Math.random() < .3 ? 3 : 2, x = Math.random() * (h ? N - len + 1 : N) | 0, y = Math.random() * (h ? N : N - len + 1) | 0;
        if (h && y === EXIT_ROW) continue; const o = occ(null); let ok = true; for (let i = 0; i < len; i++) if (o.has((y + (h ? 0 : i)) * N + x + (h ? i : 0))) ok = false;
        if (ok) cars.push({ x, y, len, h, hue: HUES[cars.length % HUES.length] });
      }
      for (let i = 0; i < 400; i++) { const c = cars[Math.random() * cars.length | 0], [lo, hi] = range(c), v = lo + (Math.random() * (hi - lo + 1) | 0); if (c.h) c.x = v; else c.y = v; }
      const red = cars[0]; const o = occ(red); let blockers = 0; for (let x = red.x + 2; x < N; x++) if (o.has(EXIT_ROW * N + x)) blockers++;
      if (red.x <= 2 && blockers >= Math.min(2, level)) break;
    }
    moves = 0; leaving = 0;
  }
  return {
    reset() { time = 60; score = 0; t = 0; dead = 0; drag = null; ready.reset(); feel.clear(); puzzle(1); },
    update(dt) {
      feel.update(dt); t += dt; if (ready.playing) time -= dt;   // the clock waits for the first drag
      if (time <= 0) { haptic('warning'); feel.juice.shake(5); return api.over(); }
      if (leaving) { leaving += dt; if (leaving > .6) { score++; api.score(score); time += 20; feel.juice.pop(W / 2, 150, '+20s', { color: '#7dff9a', size: 18 }); puzzle(score + 1); } }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = '#2b2f36'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#3a3f48'; c.beginPath(); c.roundRect(OX - 10, OY - 10, N * CS + 20, N * CS + 20, 14); c.fill();
      c.fillStyle = '#ffd34a'; c.fillRect(OX + N * CS + 10, OY + EXIT_ROW * CS + 6, 30, CS - 12);
      c.fillStyle = '#2b2f36'; c.fillRect(OX + N * CS - 2, OY + EXIT_ROW * CS + 4, 14, CS - 8);
      c.strokeStyle = '#ffffff14'; c.lineWidth = 2; for (let i = 1; i < N; i++) { c.beginPath(); c.moveTo(OX + i * CS, OY); c.lineTo(OX + i * CS, OY + N * CS); c.moveTo(OX, OY + i * CS); c.lineTo(OX + N * CS, OY + i * CS); c.stroke(); }
      for (const car of cars) {
        let x = OX + car.x * CS, y = OY + car.y * CS; if (drag && drag.car === car) { if (car.h) x = OX + drag.pos * CS; else y = OY + drag.pos * CS; }
        if (car.red && leaving) x += leaving * 600;
        const w = car.h ? car.len * CS : CS, h = car.h ? CS : car.len * CS;
        c.fillStyle = car.red ? '#ff4d5e' : `hsl(${car.hue} 60% 55%)`; c.beginPath(); c.roundRect(x + 5, y + 5, w - 10, h - 10, 12); c.fill();
        c.fillStyle = '#ffffff40'; if (car.h) { c.fillRect(x + w - 30, y + 12, 10, h - 24); c.fillRect(x + 18, y + 12, 8, h - 24); } else { c.fillRect(x + 12, y + 18, w - 24, 8); c.fillRect(x + 12, y + h - 30, w - 24, 10); }
      }
      feel.end(c, W, H);
      c.fillStyle = time < 8 ? '#ff6b6b' : '#ffffffcc'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`${Math.ceil(time)}s`, W / 2, 120);
      c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#ffffff77'; c.fillText(`Moves ${moves} · drag cars along their lane`, W / 2, OY + N * CS + 50);
    },
    down(x, y) {
      if (leaving) return; const gx = Math.floor((x - OX) / CS), gy = Math.floor((y - OY) / CS);
      const car = cars.find(c => gx >= c.x && gx < c.x + (c.h ? c.len : 1) && gy >= c.y && gy < c.y + (c.h ? 1 : c.len)); if (!car) return;
      drag = { car, start: car.h ? x : y, base: car.h ? car.x : car.y, pos: car.h ? car.x : car.y, range: range(car) }; ready.go(); haptic('tick');
    },
    move(x, y) { if (!drag) return; const d = ((drag.car.h ? x : y) - drag.start) / CS; drag.pos = clamp(drag.base + d, drag.range[0], drag.range[1]); },
    up() {
      if (!drag) return; const car = drag.car, v = Math.round(drag.pos); if (v !== (car.h ? car.x : car.y)) { moves++; sfx(300, .05, 'triangle', .03); haptic('light'); }
      if (car.h) car.x = v; else car.y = v; drag = null;
      if (car.red && car.x + car.len === N && range(car)[1] === car.x) { leaving = .001; haptic('success'); sfx(700, .4, 'sawtooth', .04, 500); feel.juice.burst(OX + N * CS, OY + (EXIT_ROW + .5) * CS, { n: 18, speed: 200, life: .5, size: 4, color: ['#ffd34a', '#ffffff', '#ff4d5e'] }); }
    },
  };
}

export default {
  id: 'parking-out', title: 'Parking Out', tag: 'Casual · Sliding puzzle', retro: false, w: W, h: H, goal: 2,
  hint: 'Drag cars forwards and backwards along their lane. Clear a way for the red car to reach the exit.',
  make,
};
