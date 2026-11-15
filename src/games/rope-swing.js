// Rope Swing: swing across a city at dusk above a lava river. Touch a hook to fire your rope at it (the
// rope flies to the hook nearest your finger, if it's in reach), hold to swing, let go to fly. Let go on
// the way up for a SLING: points and a kick of speed, and slings in a row count for more. Cracked hooks
// snap a moment after you grab them, springy hooks throw you further, and some hooks slide on rails.
// Stars hang in the air between hooks. After letting go the rope needs a moment to wind back in.
import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { clamp, rnd } = gs.util;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

const W = 360, H = 640, FLOOR = H - 60, TOP = 14;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false, text: 'Touch a hook to swing' });   // hangs still until the first touch
  const K = gs.tweak('Feel', {
    gravity: [1300, 600, 2200, 'how hard you fall'],
    reach: [380, 220, 480, 'how far the rope reaches'],
    rewind: [.28, 0, .8, 'seconds before the rope can fire again after letting go'],
    snap: [.85, .3, 2, 'seconds a cracked hook holds you'],
    grip: [4, 2, 10, 'seconds you can hang from any hook before your hands slip'],
    sling: [1.12, 1, 1.4, 'speed kept on a sling (times)'],
    spring: [1.3, 1, 1.8, 'speed a springy hook gives on letting go (times)'],
    gap: [200, 140, 300, 'average space between hooks at the start'],
  });
  let keepFirst, told, p, hooks, stars, rope, camX, dist, bonus, t, dead, wind, streak, whiff, trail, flyT;

  function more() {
    let x = hooks.length ? hooks[hooks.length - 1].x : 140;
    while (x < camX + W * 2) {
      const far = Math.min(1, x / 12000);   // the city spreads out and gets trickier as you go
      x += rnd(K.gap * (.75 + far * .25), K.gap * (1.15 + far * .45));
      const r = Math.random(), kind = x < 700 ? 'plain' : r < .18 + far * .17 ? 'crack' : r < .32 + far * .2 ? 'spring' : r < .42 + far * .25 ? 'rail' : 'plain';
      const h = { x, y: rnd(100, 230), kind, x0: x, ph: rnd(0, 6), held: 0, gone: false };
      hooks.push(h);
      if (Math.random() < .6) {   // a little arc of stars between this hook and the one before, where a good fly goes
        const n = 3, mx = x - K.gap * .55, my = rnd(150, 300);
        for (let i = 0; i < n; i++) stars.push({ x: mx + (i - 1) * 26, y: my - Math.abs(i - 1) * -10 - 10, got: false });
      }
    }
  }
  function hookAt(wx, wy) {   // the hook nearest the finger that the rope can reach
    let best = null, bd = 1e9;
    for (const k of hooks) {
      if (k.gone || Math.hypot(k.x - p.x, k.y - p.y) > K.reach) continue;
      const d = Math.hypot(k.x - wx, k.y - wy);
      if (d < bd) { bd = d; best = k; }
    }
    return bd < 150 ? best : null;
  }
  function letGo(snapped) {
    if (!rope) return;
    const k = rope.k; rope = null; whiff = Math.max(whiff, K.rewind); flyT = 0;
    if (snapped) return;
    if (k.kind === 'spring') { p.vx *= K.spring; p.vy *= K.spring; sfx(880, .12, 'triangle', .05, 500); feel.juice.burst(k.x, k.y, { n: 10, speed: 120, life: .35, size: 3, color: ['#7dffb2', '#ffffff'] }); }
    const ang = Math.atan2(-p.vy, p.vx);   // upward and forward: a sling
    if (p.vx > 120 && ang > .2 && ang < 1.15) {
      streak = Math.min(5, streak + 1); const pts = 5 * streak; bonus += pts; p.vx *= K.sling; p.vy *= K.sling;
      haptic('medium'); sfx(520 + streak * 90, .1, 'square', .04, 300);
      feel.juice.pop(p.x, p.y - 26, streak > 1 ? `SLING x${streak} +${pts}` : `SLING +${pts}`, { color: '#ffd34a', size: 14 });
    } else { streak = 0; haptic('tick'); }
  }

  return {
    reset() {
      hooks = []; stars = []; camX = 0; more(); p = { x: 60, y: 260, vx: 250, vy: -120 }; trail = [];
      const k = hooks[0]; rope = { k, len: clamp(Math.hypot(k.x - p.x, k.y - p.y), 60, K.reach) };
      dist = 0; bonus = 0; told = 0; keepFirst = false; t = 0; dead = 0; wind = 0; streak = 0; whiff = 0; flyT = 0; feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt; if (!ready.update(dt)) return;
      whiff = Math.max(0, whiff - dt); if (!rope) flyT += dt;
      for (const k of hooks) if (k.kind === 'rail') k.x = k.x0 + Math.sin(t * 1.4 + k.ph) * 40;
      if (rope) {
        const k = rope.k; k.held += dt;
        if (k.held > K.grip && k.kind !== 'crack') { sfx(220, .2, 'triangle', .04, -120); haptic('warning'); letGo(true); }   // hands tire: no hanging about
        else if (k.kind === 'crack' && k.held > K.snap) { k.gone = true; sfx(160, .25, 'sawtooth', .05, -80); haptic('warning'); feel.juice.burst(k.x, k.y, { n: 12, speed: 110, life: .5, size: 3, gravity: 600, color: ['#9fd6e0', '#5a7d86'] }); letGo(true); }
      }
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.vy += K.gravity * h; p.x += p.vx * h; p.y += p.vy * h;
        if (rope) {   // a rope keeps its length: put the swinger back on it and take away the outward speed
          const k = rope.k, dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy);
          if (d > rope.len) { const nx = dx / d, ny = dy / d; p.x = k.x + nx * rope.len; p.y = k.y + ny * rope.len; const vr = p.vx * nx + p.vy * ny; if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; } }
        }
      }
      if (p.y < TOP + 10) { p.y = TOP + 10; p.vy = Math.abs(p.vy) * .3; }
      trail.push(p.x, p.y); if (trail.length > 24) trail.splice(0, 2);
      for (const s of stars) if (!s.got && Math.hypot(s.x - p.x, s.y - p.y) < 20) { s.got = true; bonus += 25; haptic('light'); sfx(1200, .06, 'triangle', .04, 400); feel.juice.burst(s.x, s.y, { n: 8, speed: 90, life: .35, size: 3, color: ['#ffd34a', '#ffffff'] }).pop(s.x, s.y - 18, '+25', { color: '#ffd34a', size: 12 }); }
      camX += ((p.x - 120) - camX) * (1 - Math.pow(.007, dt)); more();
      hooks = hooks.filter(k => k.x > camX - 80 || (rope && rope.k === k)); stars = stars.filter(s => s.x > camX - 40);
      dist = Math.max(dist, Math.floor(p.x / 20));
      if (dist + bonus !== told) { told = dist + bonus; api.score(told); }
      if (p.y > FLOOR - 10) {
        sfx(120, .4, 'sawtooth', .05, -60); haptic('error');
        feel.juice.shake(8).flash('#ff5a36', .25).burst(p.x, FLOOR, { n: 16, speed: 190, spread: .6, angle: -Math.PI / 2, arc: 2.2, life: .5, size: 4, shrink: false, shape: 'square', gravity: 650, drag: 0, color: '#ffb446' });
        return api.over();
      }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b1f4a'); g.addColorStop(.55, '#b4506a'); g.addColorStop(1, '#ff9a5a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffe2a0'; c.beginPath(); c.arc(270 - (camX * .02) % 40, 300, 46, 0, 7); c.fill();
      // two layers of rooftops, slower the further back
      for (const [k, col, hgt, wid] of [[.2, '#5b2e55', 260, 64], [.45, '#311c3a', 190, 52]]) {
        c.fillStyle = col;
        for (let i = -1; i < 9; i++) {
          const n = i + Math.floor(camX * k / wid), bx = i * wid - (camX * k) % wid, bh = hgt * (.45 + (n * 37 % 10) / 18);
          c.fillRect(bx, FLOOR - bh, wid - 8, bh);
          if (k > .3) { c.fillStyle = '#ffcf6a55'; for (let wy = FLOOR - bh + 12; wy < FLOOR - 16; wy += 22) if ((n * 7 + wy) % 3) c.fillRect(bx + 8, wy, 8, 8); c.fillStyle = col; }
        }
      }
      c.save(); c.translate(-camX, 0); feel.begin(c);
      c.fillStyle = '#1b1229'; c.fillRect(camX, 0, W, TOP);
      // lava river
      c.fillStyle = '#ff5a36'; c.fillRect(camX, FLOOR, W, H - FLOOR);
      c.fillStyle = '#ffb347'; for (let x = Math.floor(camX / 24) * 24; x < camX + W; x += 24) c.fillRect(x, FLOOR + Math.sin(t * 4 + x * .05) * 3, 12, 3);
      // stars
      for (const s of stars) if (!s.got) { const r = 7 + Math.sin(t * 6 + s.x) * 1.2; c.fillStyle = '#ffd34a'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; c.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr); } c.fill(); }
      // hooks: a cable from the top, a ring; cracked, springy and sliding ones look it
      for (const k of hooks) {
        if (k.gone) continue;
        if (k.kind === 'rail') { c.strokeStyle = '#ffffff40'; c.lineWidth = 3; c.beginPath(); c.moveTo(k.x0 - 46, k.y - 14); c.lineTo(k.x0 + 46, k.y - 14); c.stroke(); }
        c.strokeStyle = '#ffffff35'; c.lineWidth = 2; c.beginPath(); c.moveTo(k.x, k.kind === 'rail' ? k.y - 14 : TOP); c.lineTo(k.x, k.y - 8); c.stroke();
        const inReach = !rope && Math.hypot(k.x - p.x, k.y - p.y) < K.reach;
        const col = k.kind === 'spring' ? '#7dffb2' : k.kind === 'crack' ? '#c9b8a6' : k.kind === 'rail' ? '#8fc6ff' : '#e9f6ff';
        if (inReach) { c.fillStyle = col + '30'; c.beginPath(); c.arc(k.x, k.y, 15, 0, 7); c.fill(); }
        c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(k.x, k.y, 8, 0, 7); c.stroke();
        if (k.kind === 'crack') { c.strokeStyle = '#2b1f4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(k.x - 3, k.y - 9); c.lineTo(k.x + 1, k.y - 2); c.lineTo(k.x - 2, k.y + 3); c.stroke(); if (rope && rope.k === k && (t * 12 | 0) % 2) { c.strokeStyle = '#ff5a36'; c.lineWidth = 2; c.beginPath(); c.arc(k.x, k.y, 12, 0, 7); c.stroke(); } }
        if (k.kind === 'spring') { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < 4; i++) c.lineTo(k.x + (i % 2 ? 4 : -4), k.y - 12 - i * 4); c.stroke(); }
      }
      // trail and rope
      c.strokeStyle = '#ffd34a40'; c.lineWidth = 4; c.beginPath(); for (let i = 0; i < trail.length; i += 2) c.lineTo(trail[i], trail[i + 1]); c.stroke();
      if (rope) { c.strokeStyle = '#f2e6c9'; c.lineWidth = 3; c.beginPath(); c.moveTo(rope.k.x, rope.k.y); c.lineTo(p.x, p.y); c.stroke(); }
      // the swinger: a round acrobat with a scarf that streams behind
      if (!dead || (dead * 10 | 0) % 2) {
        const a = Math.atan2(p.vy, p.vx);
        c.strokeStyle = '#ff5a8a'; c.lineWidth = 4; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - Math.cos(a) * 18 + Math.sin(t * 20) * 2, p.y - Math.sin(a) * 18 + Math.cos(t * 17) * 3); c.stroke();
        c.fillStyle = '#ffd34a'; c.beginPath(); c.arc(p.x, p.y, 11, 0, 7); c.fill();
        c.fillStyle = '#2b1f4a'; c.fillRect(p.x + Math.cos(a) * 4 - 2, p.y + Math.sin(a) * 4 - 4, 3, 3);
      }
      feel.end(c, W + camX, H); c.restore();
      if (streak > 1) { c.fillStyle = '#ffd34a'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText(`sling x${streak}`, W - 12, 34); }
      ready.draw(c, W, H, { y: 420 });
    },
    down(x, y) {
      if (ready.waiting) { ready.go(); keepFirst = true; return; }   // the first touch starts the swing you're already on; letting go of it doesn't drop you
      if (rope || whiff > 0) return;
      const k = hookAt(x + camX, y);
      if (!k) { whiff = .15; sfx(260, .05, 'triangle', .02, -100); return; }   // nothing in reach there: the rope falls short
      rope = { k, len: clamp(Math.hypot(k.x - p.x, k.y - p.y), 60, K.reach) }; k.held = 0;
      sfx(700, .05, 'square', .03, -300); haptic('light');
    },
    up() { if (keepFirst) { keepFirst = false; return; } if (ready.playing) letGo(false); },
    key(k, d) {
      if (k !== ' ') return;
      if (d) { const ahead = hooks.filter(h => !h.gone && h.x > p.x + 20).sort((a, b) => a.x - b.x)[0]; if (ahead) this.down(ahead.x - camX, ahead.y); } else this.up();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'rope-swing', title: 'Rope Swing', tag: 'Casual · Physics', retro: false, w: W, h: H,
  music: 'chase',
  hint: 'Touch a hook to fire your rope at it and hold to swing; let go on the way up to sling for points. Cracked hooks snap, springy ones throw you further. Grab the stars and stay out of the lava.',
  goal: 1500,
  make,
};
