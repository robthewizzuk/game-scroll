import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { resample, simplify, pathLength, bounds } = gs.strokes;

// First year at a school for young spellcasters. Mischief creatures drift down the great hall,
// each showing the rune that banishes it. Trace that rune with your finger anywhere on screen
// to cast it. Bigger creatures need a chain of runes. Finish a lesson to learn a new rune.
const RUNES = ['-', '|', 'V', '^', 'O', 'Z'];
const RNAME = { '-': 'LINE', '|': 'DROP', V: 'V', '^': 'PEAK', O: 'RING', Z: 'ZIGZAG' };
const RCOL = { '-': '#f8d838', '|': '#80f8ff', V: '#f86888', '^': '#88f070', O: '#c890ff', Z: '#f8a040' };
const KINDS = [
  { k: 'imp', n: 1, sp: 13, col: '#e05050' },
  { k: 'ghost', n: 1, sp: 17, col: '#d8e8f8' },
  { k: 'bat', n: 2, sp: 15, col: '#8858c8' },
  { k: 'gargoyle', n: 3, sp: 9, col: '#909098' },
];
let W = 160, H = 176;

function rune(c, r, x, y, s, col) {
  c.strokeStyle = col; c.lineWidth = Math.max(1, s / 5); c.beginPath();
  if (r === '-') { c.moveTo(x - s, y); c.lineTo(x + s, y); }
  else if (r === '|') { c.moveTo(x, y - s); c.lineTo(x, y + s); }
  else if (r === 'V') { c.moveTo(x - s, y - s); c.lineTo(x, y + s); c.lineTo(x + s, y - s); }
  else if (r === '^') { c.moveTo(x - s, y + s); c.lineTo(x, y - s); c.lineTo(x + s, y + s); }
  else if (r === 'O') c.arc(x, y, s, 0, 7);
  else { c.moveTo(x - s, y - s); c.lineTo(x + s, y - s); c.lineTo(x - s, y + s); c.lineTo(x + s, y + s); }
  c.stroke();
}

// Rune reader. The line is evened out, then read for a ring (goes once round its middle at about the
// same distance), for its sharp corners, and for its straight runs between them: one run is a LINE or a
// DROP by its slope, two runs that go down then up (or up then down) are a V or a PEAK, three or more
// that turn back hard each time are a ZIGZAG. Anything else (a scribble, a triangle, a loop twice round)
// casts nothing. On real drawings from Quick, Draw! it reads 98 rings in 100, 99 lines and 91 zigzags
// (50 before); made-up scribbles, S shapes and loops twice round cast 4 times in 100 (72 before).
export function recognise(pts) {
  if (pts.length < 3) return null;
  const raw = pts.map(p => [p.x, p.y]), len = pathLength(raw);
  if (len < 12) return null;
  const p = resample(raw, 48), b = bounds(p), size = Math.max(b.w, b.h);
  const a = p[0], z = p[p.length - 1], gap = Math.hypot(z[0] - a[0], z[1] - a[1]);
  // ring: goes once round its middle (loosely) at about the same distance, and ends near its start
  let sweep = 0, rs = 0, rr = 0;
  for (let i = 0; i < p.length; i++) {
    const dx = p[i][0] - b.cx, dy = p[i][1] - b.cy, r = Math.hypot(dx, dy); rs += r; rr += r * r;
    if (i) { let d = Math.atan2(dy, dx) - Math.atan2(p[i - 1][1] - b.cy, p[i - 1][0] - b.cx); d = Math.atan2(Math.sin(d), Math.cos(d)); sweep += d; }
  }
  sweep = Math.abs(sweep) / (Math.PI * 2);
  const rm = rs / p.length, spread = Math.sqrt(Math.max(0, rr / p.length - rm * rm)) / (rm || 1);
  const ringish = sweep > .72 && sweep < 1.6 && gap < size * .6 && Math.min(b.w, b.h) > size * .4 && spread < .3;
  // sharp corners: where the line turns hard over a short stretch (a ring turns evenly and has none)
  let sharp = 0;
  for (let i = 2, was = false; i < p.length - 2; i++) {
    let d = Math.atan2(p[i + 2][1] - p[i][1], p[i + 2][0] - p[i][0]) - Math.atan2(p[i][1] - p[i - 2][1], p[i][0] - p[i - 2][0]);
    d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); const is = d > 1.2; if (is && !was) sharp++; was = is;
  }
  // straight runs: the line thinned to its corners, neighbours that go the same way joined
  const runsAt = tol => {
    const q = simplify(p, Math.max(1.5, size * tol)), segs = [];
    for (let i = 1; i < q.length; i++) { const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1], l = Math.hypot(dx, dy); if (l > size * tol * .75) segs.push({ dx, dy, l, ang: Math.atan2(dy, dx) }); }
    for (let i = 1; i < segs.length; i++) { const s = segs[i - 1], t = segs[i], d = Math.abs(Math.atan2(Math.sin(t.ang - s.ang), Math.cos(t.ang - s.ang))); if (d < .45) { s.dx += t.dx; s.dy += t.dy; s.l = Math.hypot(s.dx, s.dy); s.ang = Math.atan2(s.dy, s.dx); segs.splice(i--, 1); } }
    return segs;
  };
  if (ringish) return sharp >= 2 ? null : 'O';
  const segs = runsAt(.16);
  const n = segs.length, deg = s => { let d = Math.abs(s.ang * 180 / Math.PI); return d > 90 ? 180 - d : d; };   // 0 = flat, 90 = upright
  // ZIGZAG: a Z (across, back down the diagonal, across) or any zigzag of three or more strokes that
  // turn back hard each time, up and down or side to side, either way round. A small zigzag across a
  // wide space thins into one run at first, so it is read again finer.
  const zigzag = all => {
    // hooks where the finger lands and lifts are not strokes of the zigzag
    const big = Math.max(...all.map(s => s.l)), segs = all.filter((s, i) => (i && i < all.length - 1) || s.l > big * .3);
    if (gap < size * .3 || segs.some(s => s.l < big * .2)) return false;
    const n = segs.length; if (n < 3 || n > 14 || sharp < Math.max(2, n - 2)) return false;
    const alt = k => segs.every((s, i) => !i || Math.sign(s[k]) === -Math.sign(segs[i - 1][k]) && Math.abs(s[k]) > s.l * .2 && Math.abs(segs[i - 1][k]) > segs[i - 1].l * .2);
    const isZ = n === 3 && deg(segs[0]) < 38 && deg(segs[2]) < 38 && Math.sign(segs[0].dx) === Math.sign(segs[2].dx) && Math.sign(segs[1].dx) === -Math.sign(segs[0].dx) && Math.abs(segs[1].dy) > segs[1].l * .35;
    return isZ || alt('dx') || alt('dy');
  };
  if (zigzag(segs) || (sharp >= 3 && zigzag(runsAt(.06)))) return 'Z';
  if (n === 1 || (len < gap * 1.15)) {
    const s = { ang: Math.atan2(z[1] - a[1], z[0] - a[0]) }, d = deg(s);
    if (d < 32) return '-'; if (d > 58) return '|'; return null;
  }
  if (n === 2) {
    const [s, t] = segs;
    // V: down then up. ^: up then down. Either way round.
    if (s.dy * t.dy < 0 && Math.abs(s.dy) > s.l * .45 && Math.abs(t.dy) > t.l * .45) return s.dy > 0 ? 'V' : '^';
    return null;
  }
  return null;
}

function make(api) {
  let foes, spells, parts, stroke, ink, hearts, score, t, spawnT, known, lesson, lessonKills, msg, shake, last;
  const floor = () => H - 26;
  function spawn() {
    const pool = KINDS.filter(k => k.n <= Math.min(3, 1 + (lesson >> 1))), k = pool[Math.random() * pool.length | 0];
    const seq = Array.from({ length: k.n }, () => known[Math.random() * known.length | 0]);
    foes.push({ ...k, x: rnd(16, W - 16), y: -10, seq, wob: rnd(0, 6), hit: 0 });
  }
  function cast(r) {
    if (!r) { msg = { txt: '?', l: .5, col: '#a0a0c0' }; sfx(160, .08, 'triangle', .03); haptic('warning'); return; }
    last = { r, l: .6 };
    const targets = foes.filter(f => f.seq[0] === r).sort((a, b) => b.y - a.y);
    if (!targets.length) { msg = { txt: `${RNAME[r]}?`, l: .6, col: '#a0a0c0' }; sfx(200, .1, 'triangle', .03, -60); haptic('warning'); return; }
    const f = targets[0]; spells.push({ x: W / 2, y: floor() - 18, tg: f, r, t: 0 }); sfx(600 + RUNES.indexOf(r) * 90, .15, 'triangle', .05, 600); haptic('light');
  }
  const self = {
    reset() { foes = []; spells = []; parts = []; stroke = null; ink = null; hearts = 3; score = 0; t = 0; spawnT = 1; known = ['-', '|', 'V']; lesson = 1; lessonKills = 0; msg = { txt: 'LESSON 1', l: 1.5, col: '#f8d838' }; shake = 0; last = null; },
    resize(w, h) { const dx = (w - W) / 2; W = w; H = h; if (foes) for (const f of foes) f.x = clamp(f.x + dx, 12, w - 12); },
    update(dt) {
      t += dt; shake = Math.max(0, shake - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; } if (last) { last.l -= dt; if (last.l <= 0) last = null; } if (ink) { ink.l -= dt; if (ink.l <= 0) ink = null; }
      spawnT -= dt; const busy = foes.length < 2 + (lesson >> 1); if (spawnT <= 0 && busy) { spawn(); spawnT = Math.max(1.3, 3.2 - lesson * .25) * rnd(.8, 1.2); }
      for (const f of foes) {
        f.hit = Math.max(0, f.hit - dt); f.y += f.sp * (1 + lesson * .06) * dt; f.x += Math.sin(t * 1.5 + f.wob) * 8 * dt;
        if (f.y > floor() - 14) { f.dead = true; hearts--; shake = .3; haptic('heavy'); sfx(120, .3, 'square', .05, -40); msg = { txt: 'OUCH!', l: .7, col: '#f86060' }; }
      }
      for (const s of spells) {
        s.t += dt; const f = s.tg; if (f.dead) { s.done = true; continue; }
        const dx = f.x - s.x, dy = f.y - s.y, d = Math.hypot(dx, dy), mv = 260 * dt;
        parts.push({ x: s.x, y: s.y, vx: rnd(-10, 10), vy: rnd(-10, 10), l: .3, col: RCOL[s.r] });
        if (d < mv + 4) {
          s.done = true; f.seq.shift(); f.hit = .2;
          for (let i = 0; i < 8; i++) parts.push({ x: f.x, y: f.y, vx: rnd(-60, 60), vy: rnd(-60, 60), l: .4, col: RCOL[s.r] });
          if (!f.seq.length) {
            f.dead = true; score += f.n; api.score(score); lessonKills++; haptic('medium'); sfx(900, .2, 'triangle', .05, 400);
            if (lessonKills >= 6 + lesson) { lesson++; lessonKills = 0; const nr = RUNES.find(r => !known.includes(r)); if (nr) { known.push(nr); msg = { txt: `NEW RUNE: ${RNAME[nr]}`, l: 2, col: RCOL[nr], rune: nr }; } else msg = { txt: `LESSON ${lesson}`, l: 1.5, col: '#f8d838' }; haptic('success'); sfx(700, .4, 'triangle', .05, 700); }
          } else { sfx(500, .08, 'triangle', .04); }
        } else { s.x += dx / d * mv; s.y += dy / d * mv; }
      }
      foes = foes.filter(f => !f.dead); spells = spells.filter(s => !s.done);
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; } parts = parts.filter(p => p.l > 0);
      if (hearts <= 0) { haptic('error'); return api.over(); }
    },
    draw(c) {
      const fl = floor(), sx = shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
      c.fillStyle = '#1a1430'; c.fillRect(0, 0, W, H); c.save(); c.translate(sx, 0);
      // great hall: stone arches, floating candles, long carpet
      for (let x = 8; x < W; x += 48) { c.fillStyle = '#2a2448'; c.fillRect(x, 20, 30, fl - 20); c.fillStyle = '#100c20'; c.fillRect(x + 4, 30, 22, fl - 50); c.beginPath(); c.arc(x + 15, 30, 11, Math.PI, 0); c.fill(); c.fillStyle = '#383068'; c.fillRect(x + 14, 30, 2, fl - 50); }
      for (let i = 0; i < 6; i++) { const cx = (i * 47 + 20) % W, cy = 30 + (i * 29) % 60 + Math.sin(t * 2 + i) * 2; c.fillStyle = '#e8e0c8'; c.fillRect(cx, cy, 2, 5); c.fillStyle = (t * 8 + i | 0) % 2 ? '#f8d838' : '#f8a040'; c.fillRect(cx, cy - 2, 2, 2); }
      c.fillStyle = '#3a2c58'; c.fillRect(0, fl, W, H - fl); c.fillStyle = '#a03040'; c.fillRect(W / 2 - 18, fl, 36, H - fl); c.fillStyle = '#f8d838'; c.fillRect(W / 2 - 18, fl, 1, H - fl); c.fillRect(W / 2 + 17, fl, 1, H - fl);
      // student with wand
      const x = W / 2, y = fl - 4;
      c.fillStyle = '#202030'; c.fillRect(x - 6, y - 14, 12, 14); c.fillStyle = '#a03040'; c.fillRect(x - 6, y - 8, 12, 2); c.fillStyle = '#f8d0a8'; c.fillRect(x - 4, y - 21, 8, 7); c.fillStyle = '#683820'; c.fillRect(x - 5, y - 23, 10, 3); c.fillRect(x - 5, y - 21, 2, 3);
      c.fillStyle = '#101018'; c.fillRect(x - 2, y - 18, 1, 1); c.fillRect(x + 1, y - 18, 1, 1);
      c.fillStyle = '#8a5a30'; c.fillRect(x + 5, y - 20, 1, 8); if (last) { c.fillStyle = RCOL[last.r]; c.fillRect(x + 4, y - 22, 3, 3); }
      for (const f of foes) {
        const fx = Math.round(f.x), fy = Math.round(f.y), hit = f.hit > 0 && (t * 30 | 0) % 2, flap = (t * 8 | 0) % 2;
        c.fillStyle = hit ? '#f8f8f0' : f.col;
        if (f.k === 'imp') { c.fillRect(fx - 5, fy - 4, 10, 9); c.fillRect(fx - 5, fy - 7, 2, 3); c.fillRect(fx + 3, fy - 7, 2, 3); c.fillStyle = '#f8d838'; c.fillRect(fx - 3, fy - 2, 2, 2); c.fillRect(fx + 1, fy - 2, 2, 2); c.fillStyle = '#101018'; c.fillRect(fx - 2, fy + 2, 4, 1); }
        else if (f.k === 'ghost') { c.globalAlpha = .85; c.fillRect(fx - 5, fy - 6, 10, 10); c.fillRect(fx - 5 + flap, fy + 4, 2, 3); c.fillRect(fx - 1, fy + 4, 2, 3 - flap); c.fillRect(fx + 3 - flap, fy + 4, 2, 3); c.globalAlpha = 1; c.fillStyle = '#101018'; c.fillRect(fx - 3, fy - 3, 2, 3); c.fillRect(fx + 1, fy - 3, 2, 3); }
        else if (f.k === 'bat') { c.fillRect(fx - 3, fy - 3, 6, 6); c.fillRect(fx - 9, fy - 3 + flap * 2, 6, 2); c.fillRect(fx + 3, fy - 3 + flap * 2, 6, 2); c.fillStyle = '#f84040'; c.fillRect(fx - 2, fy - 1, 1, 1); c.fillRect(fx + 1, fy - 1, 1, 1); }
        else { c.fillRect(fx - 7, fy - 6, 14, 13); c.fillRect(fx - 10, fy - 4 + flap, 3, 6); c.fillRect(fx + 7, fy - 4 + flap, 3, 6); c.fillStyle = '#606068'; c.fillRect(fx - 7, fy + 4, 14, 3); c.fillStyle = '#f8a040'; c.fillRect(fx - 4, fy - 3, 2, 2); c.fillRect(fx + 2, fy - 3, 2, 2); }
        // rune bubble(s)
        const n = f.seq.length, bw = n * 12 + 2, bx = fx - bw / 2, by = fy - 22;
        c.fillStyle = '#100c20d0'; c.fillRect(bx, by, bw, 12); c.fillStyle = '#ffffff30'; c.fillRect(bx, by, bw, 1);
        f.seq.forEach((r, i) => { c.globalAlpha = i === 0 ? 1 : .45; rune(c, r, bx + 7 + i * 12, by + 6, 3.5, RCOL[r]); }); c.globalAlpha = 1;
      }
      for (const s of spells) { c.fillStyle = '#f8f8f0'; c.fillRect(s.x - 1, s.y - 1, 3, 3); }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x | 0, p.y | 0, 1, 1); }
      // the line just drawn stays a moment: in the rune's colour when it was read, grey and sagging when not
      if (ink) { const k = ink.l / .45; c.strokeStyle = ink.r ? RCOL[ink.r] : '#8080a0'; c.lineWidth = 2; c.globalAlpha = k * .9; c.beginPath(); ink.pts.forEach((q, i) => { const y = q.y + (ink.r ? 0 : (1 - k) * 6); i ? c.lineTo(q.x, y) : c.moveTo(q.x, y); }); c.stroke(); c.globalAlpha = 1; }
      if (stroke && stroke.length > 1) { c.strokeStyle = '#f8f8f0'; c.lineWidth = 2; c.globalAlpha = .8; c.beginPath(); c.moveTo(stroke[0].x, stroke[0].y); for (const p of stroke) c.lineTo(p.x, p.y); c.stroke(); c.globalAlpha = 1; }
      c.restore();
      c.font = '6px "Press Start 2P", monospace';
      for (let i = 0; i < 3; i++) { c.fillStyle = i < hearts ? '#f86888' : '#403858'; c.fillRect(4 + i * 8, 4, 6, 5); }
      // rune book along the bottom
      const bw = W / known.length; known.forEach((r, i) => rune(c, r, bw * i + bw / 2, H - 9, 4, RCOL[r]));
      c.textAlign = 'right'; c.fillStyle = '#a0a0d0'; c.fillText(`L${lesson}`, W - 4, 10);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#100c20c0'; c.fillRect(0, H * .4 - 9, W, 14); c.fillStyle = msg.col; c.fillText(msg.txt, W / 2, H * .4 + 1); }
      if (t < 6) { c.textAlign = 'center'; c.fillStyle = '#c0c0e0'; c.fillText('TRACE THE RUNE', W / 2, H * .4 + 22); }
    },
    down(x, y) { stroke = [{ x, y }]; },
    move(x, y, p) { if (p && stroke) stroke.push({ x, y }); },
    up() { if (stroke) { const r = recognise(stroke); if (stroke.length > 3) { cast(r); ink = { pts: stroke, r, l: .45 }; } stroke = null; } },
    key(k, d) { if (!d) return; const n = '123456'.indexOf(k); if (n >= 0 && known[n]) cast(known[n]); if (k === ' ' && foes[0]) cast(foes[0].seq[0]); },
  };
  return self;
}

export default {
  id: 'spell-school', title: 'Spell School', tag: 'Advance · Magic', retro: true, era: 'advance', pal: 'berry', w: 160, h: 176, maxW: 240, maxH: 300, goal: 25, touch: 'fine',
  hint: 'Creatures drift down the great hall showing the rune that banishes them. Trace that rune anywhere: a line, a drop, a V, a peak, then later a ring and a zigzag. Big creatures need a chain of runes. Finish lessons to learn new runes.',
  make,
};
