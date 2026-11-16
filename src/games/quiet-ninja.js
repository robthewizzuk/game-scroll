import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { startMic, stopMic, haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { text } = gs.pixel;

// Sneak through the castle. Hold to creep forward; the longer you hold, the faster and noisier
// your footsteps. Guards wake if the noise gets too loud near them, and that includes the real
// room you're in: the mic hears you. Reach the scroll at the end of each hall.
const P = PAL.mono, W = 160, H = 160, FLOOR = 120;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let x, speed, holding, guards, noise, halls, t, mic, asked, roomNoise, spotted, len, steps;
  function hall() {
    len = 360 + halls * 60; x = 10; speed = 0; guards = [];
    const n = 2 + Math.min(4, halls);
    for (let i = 0; i < n; i++) guards.push({ x: 70 + (i + .5) * (len - 110) / n + rnd(-15, 15), sleep: rnd(.2, .6), wake: 0, ear: rnd(.55, .75) });
  }
  return {
    reset() { stopMic(); mic = null; asked = false; halls = 0; t = 0; noise = 0; roomNoise = 0; spotted = 0; steps = 0; holding = false; feel.clear(); hall(); },
    update(dt) {
      feel.update(dt); t += dt;
      if (!asked) { asked = true; startMic().then(m => { mic = m; }); }
      if (spotted) { spotted += dt; if (spotted > .8) { stopMic(); return api.over(); } return; }
      speed = holding ? Math.min(75, speed + dt * 45) : Math.max(0, speed - dt * 150);
      x += speed * dt; steps += speed * dt;
      roomNoise = mic ? clamp((mic.level() - .06) * 2, 0, 1) : 0;
      const stepNoise = clamp((speed - 15) / 60, 0, 1) ** 2;
      noise = Math.max(stepNoise, roomNoise);
      if (steps > 10) { steps = 0; if (speed > 5) sfx(120 + speed * 3, .03, 'square', .01 + stepNoise * .03); }
      for (const g of guards) {
        const near = Math.abs(g.x - x) < 46, heard = near ? noise * (1 - Math.abs(g.x - x) / 60) : 0;
        if (heard > g.ear * .6) { g.wake += dt * (heard - g.ear * .6) * 10; if (g.wake > .3 && Math.random() < dt * 3) haptic('tick'); } else g.wake = Math.max(0, g.wake - dt * .5);
        if (g.wake >= 1) { spotted = .001; haptic('error'); sfx(220, .4, 'square', .06, 300); feel.juice.shake(5); return; }
      }
      if (x >= len - 14) { halls++; api.score(halls); haptic('success'); sfx(990, .2, 'square', .05, 300); feel.juice.burst(60, FLOOR - 10, { n: 14, speed: 60, life: .5, size: 2, color: [P[3], P[0]] }); hall(); }
    },
    fx(dt) { spotted && (spotted += dt); feel.update(dt); },
    draw(c) {
      const cam = clamp(x - 50, 0, len - W);
      c.fillStyle = P[2]; c.fillRect(0, 0, W, H); feel.begin(c); c.fillStyle = P[1]; c.fillRect(0, FLOOR, W, H - FLOOR);
      c.save(); c.translate(-Math.round(cam), 0);
      c.fillStyle = P[1]; for (let bx = 0; bx < len; bx += 40) { c.fillRect(bx + 10, 30, 14, 24); c.fillStyle = P[3]; c.fillRect(bx + 12, 32, 10, 20); c.fillStyle = P[1]; }
      c.fillStyle = P[3]; c.fillRect(len - 18, FLOOR - 14, 10, 14); c.fillStyle = P[0]; c.fillRect(len - 18, FLOOR - 14, 10, 2); c.fillRect(len - 18, FLOOR - 2, 10, 2);
      for (const g of guards) {
        const gx = Math.round(g.x), awake = g.wake >= 1 || spotted;
        c.fillStyle = P[0]; c.fillRect(gx - 5, FLOOR - 20, 10, 20); c.fillRect(gx - 4, FLOOR - 27, 8, 7); c.fillRect(gx + 5, FLOOR - 30, 2, 30);
        c.fillStyle = P[3]; if (awake) { c.fillRect(gx - 3, FLOOR - 25, 2, 2); c.fillRect(gx + 1, FLOOR - 25, 2, 2); } else { c.fillRect(gx - 3, FLOOR - 24, 2, 1); c.fillRect(gx + 1, FLOOR - 24, 2, 1); }
        if (!awake && g.wake < .2) { c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.fillText('z', gx + 6, FLOOR - 32 - (t * 8 + gx) % 8); }
        if (g.wake > 0 && !awake) { c.fillStyle = P[0]; c.fillRect(gx - 6, FLOOR - 36, 12, 2); c.fillStyle = P[3]; c.fillRect(gx - 6, FLOOR - 36, Math.round(12 * g.wake), 2); }
        if (awake) { c.fillStyle = P[0]; c.font = '8px "Press Start 2P", monospace'; text(c, '!', gx - 2, FLOOR - 32 - 8, { color: P[0], font: 'big' }); }
      }
      const nx = Math.round(x), step = speed > 2 ? Math.sin(t * speed * .4) * 2 : 0;
      c.fillStyle = P[0]; c.fillRect(nx - 3, FLOOR - 14 + Math.abs(step) * .5, 7, 9); c.fillRect(nx - 2, FLOOR - 19, 6, 5); c.fillStyle = P[3]; c.fillRect(nx, FLOOR - 17, 3, 1);
      c.fillStyle = P[0]; c.fillRect(nx - 3 + step, FLOOR - 5, 2, 5); c.fillRect(nx + 2 - step, FLOOR - 5, 2, 5);
      c.restore();
      feel.end(c, W, H);
      // noise meter
      c.fillStyle = P[0]; c.fillRect(4, 146, 60, 6); c.fillStyle = noise > .6 ? P[3] : P[2]; c.fillRect(5, 147, 58 * noise, 4);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[3]; c.fillText(mic ? 'NOISE+MIC' : 'NOISE', 68, 152);
      c.fillStyle = P[0]; c.fillText(`HALL ${halls + 1}`, 4, 10); c.textAlign = 'left';
      if (t < 4 && halls === 0) { c.fillStyle = P[3]; c.fillText('HOLD TO SNEAK', 4, 136); }
    },
    down() { holding = true; },
    up() { holding = false; },
    key(k, d) { if (k === ' ' || k === 'ArrowRight') holding = d; },
  };
}

export default {
  id: 'quiet-ninja', title: 'Quiet Ninja', tag: 'Pocket · Mic', retro: true, w: W, h: H, pal: 'mono', goal: 4,
  hint: 'Hold to sneak forward and let go to stop. Faster steps are louder, and the mic hears your room too. Wake a guard and it is over.',
  make,
};
