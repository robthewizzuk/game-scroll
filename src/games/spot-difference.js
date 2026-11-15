import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Two little scenes, five differences, drawn fresh every round. Tap a difference on either picture.
// Wrong taps cost three seconds. Finish a pair to win more time.
const W = 360, H = 640, SW = 340, SH = 250, OX = 10, TOPS = [80, 352], DIFFS = 5;
const PALETTE = ['#ff5a5a', '#ffb03d', '#ffe14d', '#5ad17a', '#3da0ff', '#9a6bff', '#ff7ac8', '#ffffff'];

function scene() {
  const objs = [], types = ['tree', 'house', 'cloud', 'flower', 'balloon', 'sun', 'rock', 'bird'];
  for (let r = 0; r < 3; r++) for (let col = 0; col < 4; col++) {
    if (Math.random() < .15) continue;
    const type = r === 0 ? ['cloud', 'balloon', 'bird', 'sun'][Math.random() * 4 | 0] : types[Math.random() * types.length | 0];
    objs.push({ type: type === 'sun' && objs.some(o => o.type === 'sun') ? 'cloud' : type, x: 45 + col * 83 + rnd(-14, 14), y: 45 + r * 80 + rnd(-10, 10), s: rnd(.8, 1.15), col: PALETTE[Math.random() * PALETTE.length | 0], flip: Math.random() < .5, extra: Math.random() < .5 });
  }
  return objs;
}
function mutate(o) {
  const m = { ...o }, kinds = ['col', 'gone', 'size', 'flip', 'extra'], k = kinds[Math.random() * kinds.length | 0];
  if (k === 'col') { let c; do c = PALETTE[Math.random() * PALETTE.length | 0]; while (c === o.col); m.col = c; }
  if (k === 'gone') m.gone = true;
  if (k === 'size') m.s = o.s * (Math.random() < .5 ? .6 : 1.45);
  if (k === 'flip') { if (o.type === 'sun' || o.type === 'rock') m.col = o.col === '#ffffff' ? '#ffb03d' : '#ffffff'; else m.flip = !o.flip; }
  if (k === 'extra') m.extra = !o.extra;
  return m;
}
function drawObj(c, o) {
  if (o.gone) return;
  c.save(); c.translate(o.x, o.y); c.scale(o.flip ? -o.s : o.s, o.s);
  switch (o.type) {
    case 'tree': c.fillStyle = '#7a4a22'; c.fillRect(-4, 0, 8, 26); c.fillStyle = o.col === '#ffffff' ? '#5ad17a' : o.col; c.beginPath(); c.arc(0, -6, 20, 0, 7); c.fill(); if (o.extra) { c.fillStyle = '#ff5a5a'; for (const [ax, ay] of [[-8, -10], [6, -2], [4, -16]]) { c.beginPath(); c.arc(ax, ay, 3, 0, 7); c.fill(); } } break;
    case 'house': c.fillStyle = o.col; c.fillRect(-20, -6, 40, 32); c.fillStyle = '#8a3a2a'; c.beginPath(); c.moveTo(-26, -6); c.lineTo(0, -28); c.lineTo(26, -6); c.fill(); c.fillStyle = '#5a3a22'; c.fillRect(4, 8, 10, 18); c.fillStyle = o.extra ? '#ffe14d' : '#2a3a5a'; c.fillRect(-14, 2, 10, 9); break;
    case 'cloud': c.fillStyle = o.col === '#ffffff' ? '#ffffff' : o.col + '99'; for (const [ax, r] of [[-14, 10], [0, 14], [14, 10]]) { c.beginPath(); c.arc(ax, 0, r, 0, 7); c.fill(); } if (o.extra) { c.fillStyle = '#3da0ff'; for (const ax of [-8, 0, 8]) c.fillRect(ax, 16, 2, 6); } break;
    case 'flower': c.strokeStyle = '#3a8a4a'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 26); c.lineTo(0, 0); c.stroke(); c.fillStyle = o.col; for (let i = 0; i < (o.extra ? 6 : 5); i++) { const a = i / (o.extra ? 6 : 5) * 6.283; c.beginPath(); c.arc(Math.cos(a) * 8, Math.sin(a) * 8, 6, 0, 7); c.fill(); } c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); break;
    case 'balloon': c.strokeStyle = '#ffffffaa'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 14); c.quadraticCurveTo(6, 24, 0, 34); c.stroke(); c.fillStyle = o.col; c.beginPath(); c.ellipse(0, 0, 12, 15, 0, 0, 7); c.fill(); if (o.extra) { c.fillStyle = '#ffffff80'; c.beginPath(); c.arc(-4, -5, 3, 0, 7); c.fill(); } break;
    case 'sun': c.fillStyle = o.col === '#ffffff' ? '#ffe14d' : '#ffb03d'; c.beginPath(); c.arc(0, 0, 16, 0, 7); c.fill(); if (o.extra) { c.strokeStyle = c.fillStyle; c.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; c.beginPath(); c.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); c.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); c.stroke(); } } break;
    case 'rock': c.fillStyle = o.col === '#ffffff' ? '#c8c8d0' : '#7a7a88'; c.beginPath(); c.ellipse(0, 12, 20, 12, 0, Math.PI, 0); c.fill(); if (o.extra) { c.fillStyle = '#5ad17a'; c.fillRect(-10, 2, 8, 3); } break;
    case 'bird': c.strokeStyle = '#2a2a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-14, -4); c.quadraticCurveTo(-7, -10, 0, 0); c.quadraticCurveTo(7, -10, 14, -4); c.stroke(); if (o.extra) { c.beginPath(); c.moveTo(16, 6); c.quadraticCurveTo(22, 2, 28, 8); c.stroke(); } break;
  }
  c.restore();
}

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                              // the pictures stay covered (and the clock stopped) until the first tap
  let a, b, diffs, found, time, score, t, marks, misses, round;
  function newPair() {
    a = scene(); const idx = shuffle(a.map((_, i) => i)).slice(0, DIFFS);
    b = a.map((o, i) => idx.includes(i) ? mutate(o) : o); diffs = idx.map(i => ({ x: a[i].x, y: a[i].y, r: 30 * Math.max(a[i].s, b[i].s), found: false }));
    marks = []; round++;
  }
  const self = {
    reset() { time = 45; score = 0; t = 0; misses = []; round = 0; feel.clear(); ready.reset(); newPair(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; time -= dt; if (time <= 0) { time = 0; haptic('error'); return api.over(); }
      for (const m of misses) m.l -= dt; misses = misses.filter(m => m.l > 0);
      if (diffs.every(d => d.found)) { time += 20; haptic('success'); sfx(990, .25, 'triangle', .06, 300); feel.juice.flash('#ffffff', .4, .33); feel.juice.pop(W / 2, 336, '+20s', { color: '#7dff9a', size: 18 }); newPair(); }
    },
    draw(c) {
      c.fillStyle = '#1b2236'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (const [pi, top] of TOPS.entries()) {
        c.save(); c.translate(OX, top); c.beginPath(); c.roundRect(0, 0, SW, SH, 12); c.clip();
        const g = c.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, '#8fd3ff'); g.addColorStop(.62, '#d8f1ff'); g.addColorStop(.62, '#8fd16a'); g.addColorStop(1, '#5aa84a'); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
        if (!ready.waiting) for (const o of pi ? b : a) drawObj(c, o);
        for (const d of diffs) if (d.found) { c.strokeStyle = '#ff3d6b'; c.lineWidth = 4; c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.stroke(); }
        c.restore();
      }
      for (const m of misses) { c.globalAlpha = m.l; c.strokeStyle = '#ff3d3d'; c.lineWidth = 4; c.beginPath(); c.moveTo(m.x - 10, m.y - 10); c.lineTo(m.x + 10, m.y + 10); c.moveTo(m.x + 10, m.y - 10); c.lineTo(m.x - 10, m.y + 10); c.stroke(); c.globalAlpha = 1; }
      feel.end(c, W, H);
      ready.draw(c, W, H, { text: 'Tap to show the pictures', y: 341, size: 17 });
      c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = time < 8 ? '#ff6060' : '#ffffffcc'; c.fillText(`${Math.ceil(time)}s`, 14, 30);
      c.textAlign = 'right'; c.fillStyle = '#ffffffcc'; c.fillText(`${diffs.filter(d => d.found).length}/${DIFFS}`, W - 14, 30);
      c.textAlign = 'center'; c.fillStyle = '#ffffff60'; c.font = '600 12px Rubik, sans-serif'; c.fillText(t < 5 && round === 1 ? 'tap the 5 differences on either picture' : '', W / 2, 620);
    },
    down(x, y) {
      if (ready.go()) return;
      const pi = TOPS.findIndex(tp => y >= tp && y <= tp + SH); if (pi < 0 || x < OX || x > OX + SW) return;
      const sx = x - OX, sy = y - TOPS[pi];
      let best = null, bd = 1e9; for (const d of diffs) { if (d.found) continue; const dd = Math.hypot(d.x - sx, d.y - sy); if (dd < Math.max(d.r, 26) && dd < bd) { bd = dd; best = d; } }
      if (best) { best.found = true; score++; api.score(score); haptic('success'); sfx(700 + diffs.filter(d => d.found).length * 80, .12, 'triangle', .05, 200); for (const top of TOPS) feel.juice.burst(OX + best.x, top + best.y, { n: 10, speed: 150, life: .4, size: 3.5, color: ['#ff3d6b', '#ffe14d', '#ffffff'] }); }
      else if (!diffs.some(d => d.found && Math.hypot(d.x - sx, d.y - sy) < d.r)) { time = Math.max(0, time - 3); misses.push({ x, y, l: .8 }); haptic('warning'); sfx(160, .15, 'square', .04, -40); feel.juice.shake(4).pop(x, y - 18, '-3s', { color: '#ff6060', size: 16 }); }
    },
    key(k, d) { if (d && k === ' ') { if (ready.go()) return; const df = diffs.find(q => !q.found); if (df) self.down(df.x + OX, df.y + TOPS[0]); } },
  };
  return self;
}

export default {
  id: 'spot-difference', title: 'Spot the Difference', tag: 'Casual · Puzzle', retro: false, w: W, h: H, goal: 12,
  hint: 'Two pictures, five differences. Tap one on either picture. Wrong taps cost 3 seconds. Each finished pair adds 20 seconds.',
  make,
};
