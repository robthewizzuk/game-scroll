// Ladder Climber: a climber scrambles up an endless rope ladder with rungs missing on one side or the
// other. Tap the side with the next good rung to grab it. Grab a gap and you slip down. Crows perch
// on rungs too: don't grab where a crow sits. The flood below rises faster and faster.
import gs from '../gamescroll.js';
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds, music } = gs.sound;
const { Keys } = gs.controls;
const { approach } = gs.juice;

const R = PAL.moss;
let W = 160, H = 160;
const GAP = 14;

function make(api) {
  const feel = new Feel({ pixel: true });
  const keys = new Keys();
  const ready = new Ready({ eat: false });                              // the flood waits for the first grab
  let rungs, height, flood, climbY, score, t, side, slip, dead, tune, started, combo, beat;

  // rung i: which side is solid (0 left, 1 right, 2 both) and whether a crow sits on it
  function rung(i) {
    while (rungs.length <= i) {
      const k = rungs.length, prev = rungs[k - 1];
      const both = k < 4 || Math.random() < .25;
      const s = both ? 2 : Math.random() * 2 | 0;
      const crow = k > 12 && s === 2 && Math.random() < .35 ? (Math.random() * 2 | 0) : -1;
      rungs.push({ s, crow, prev });
    }
    return rungs[i];
  }
  const can = (i, sd) => { const r = rung(i); return (r.s === 2 || r.s === sd) && r.crow !== sd; };

  function grab(sd) {
    if (dead || slip > 0) return;
    const i = height + 1;
    side = sd;
    if (can(i, sd)) {
      height = i; combo++; score = height; api.score(score);
      sfx(300 + (combo % 8) * 40, .04, 'square', .03); haptic('tick');
      if (combo % 20 === 0) { feel.juice.pop(sd ? 110 : 50, 60, 'GREAT!', { color: R[0] }); sounds.powerup(); flood -= 2; }
    } else {
      combo = 0; slip = .35; height = Math.max(0, height - 2); sounds.hurt(); haptic('warning'); feel.juice.shake(3);
      if (rung(i).crow === sd) feel.juice.pop(sd ? 110 : 50, 50, 'CAW!', { color: R[0] });
    }
  }

  return {
    reset() { rungs = []; height = 0; flood = -3; score = 0; t = 0; side = 0; slip = 0; dead = 0; combo = 0; started = false; beat = 0; keys.clear(); feel.clear(); climbY = 0; ready.reset(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt) || feel.frozen) return;
      if (!started) { started = true; tune = music({ tempo: 140, lead: 'C5 . E5 . G5 . E5 . D5 . F5 . A5 . F5 .', bass: 'C3 . . . G2 . . . D3 . . . G2 . . .', drums: 'k . h . s . h .' }); tune.start(); }
      t += dt;
      if (dead) { dead += dt; if (dead > 1) { tune?.stop(); api.over(); } return; }
      if (slip > 0) slip -= dt;
      flood += dt * (.8 + t / 22);                       // rungs per second the water rises
      if (flood > height + .3) { dead = .01; feel.lose(); haptic('error'); tune?.stop(); }
      climbY = approach(climbY, height, 16, dt);
      tune?.speed(1 + Math.min(.6, t / 90));
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      const baseY = Math.round(H * .66), lx = W / 2 - 22, rx = W / 2 + 22;
      // far cliff face ticks
      c.fillStyle = R[2]; for (let i = 0; i < 12; i++) { const y = Math.round(((i * 37 + climbY * GAP * .4) % (H + 20)) - 10); c.fillRect((i * 53) % 24, y, 6, 2); c.fillRect(W - 10 - (i * 29) % 20, y + 10, 6, 2); }
      feel.begin(c);
      // ropes
      c.fillStyle = R[1]; c.fillRect(lx - 1, 0, 2, H); c.fillRect(rx - 1, 0, 2, H);
      const first = Math.max(0, Math.floor(climbY - baseY / GAP) - 1), last = Math.ceil(climbY + (H - baseY) / GAP) + 12;
      for (let i = first; i < last; i++) {
        const r = rung(i), y = Math.round(baseY - (i - climbY) * GAP);
        if (y < -4 || y > H + 4) continue;
        c.fillStyle = R[0];
        if (r.s !== 1) c.fillRect(lx, y, W / 2 - lx - 1, 3);
        if (r.s !== 0) c.fillRect(W / 2 + 1, y, rx - W / 2 - 1, 3);
        if (r.s === 2) c.fillRect(W / 2 - 1, y, 2, 3);
        if (r.crow >= 0) { const cx = r.crow ? W / 2 + 10 : W / 2 - 14; c.fillStyle = R[0]; c.fillRect(cx, y - 6, 6, 5); c.fillRect(cx + (r.crow ? 6 : -2), y - 5, 2, 2); c.fillStyle = R[3]; c.fillRect(cx + (r.crow ? 4 : 1), y - 5, 1, 1); }
      }
      // the climber: hands on the rung above, a little drop when slipping
      const py = baseY + (slip > 0 ? 6 : 0), hx = side ? W / 2 + 8 : W / 2 - 10;
      c.fillStyle = R[0]; c.fillRect(W / 2 - 4, py - 2, 8, 10); c.fillRect(W / 2 - 3, py - 8, 6, 6);
      c.fillStyle = R[3]; c.fillRect(W / 2 - 1, py - 6, 1, 1); c.fillRect(W / 2 + 1, py - 6, 1, 1);
      c.fillStyle = R[0]; c.fillRect(Math.min(hx, W / 2 - 4), py - 14, Math.abs(hx - (W / 2 - 4)) + 2, 2); c.fillRect(hx, py - 16, 3, 4);
      c.fillRect(W / 2 - 4, py + 8, 2, 6); c.fillRect(W / 2 + 2, py + 8, 2, 6);
      // flood
      const fy = Math.round(baseY - (flood - climbY) * GAP + 8);
      if (fy < H) { c.fillStyle = R[1]; c.fillRect(0, fy, W, H - fy); c.fillStyle = R[2]; for (let x = 0; x < W; x += 8) c.fillRect(x + Math.round(Math.sin(t * 5 + x) * 2), fy, 5, 2); }
      feel.end(c, W, H);
      text(c, `${height}M`, 4, 4, { color: R[0] });
      if (combo >= 10) text(c, `x${combo}`, W - 4, 4, { color: R[0], align: 'right' });
      if (t < 3) { text(c, 'TAP LEFT OR RIGHT', W / 2, 30, { align: 'center', color: R[0] }); text(c, 'GRAB THE GOOD RUNG', W / 2, 38, { align: 'center', color: R[0] }); }
      ready.draw(c, W, H, { text: 'TAP TO CLIMB', pixel: true, color: R[0], y: 52 });
    },
    fx(dt) { feel.update(dt); },
    down(x) { ready.go(); grab(x < W / 2 ? 0 : 1); },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft' || k === 'a') { ready.go(); grab(0); } if (k === 'ArrowRight' || k === 'd') { ready.go(); grab(1); } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ladder-climber',
  title: 'Ladder Climber',
  tag: 'Pocket · Reflex',
  retro: true, pal: 'moss',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 80,
  hint: 'Tap left or right to grab the next rung on that side. Gaps and crows make you slip. Outclimb the rising flood.',
  make,
};
