import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// A one-minute daily workout for your brain: four quick drills, fifteen seconds each. Quick sums,
// count the dots, remember the lit squares, pick the bigger side, and tap 1 to 9 in order. Every
// right answer scores; wrong ones knock a second off the drill. At the end you get a Mind Score.
const DRILLS = ['SUMS', 'DOTS', 'MEMORY', 'BIGGER', 'ORDER'];
let W = 176, H = 192;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                                            // the first drill waits for a tap
  let plan, di, phase, pt, q, score, per, t, fx, done, results, tx = 0, ty = 0;
  function newQ() {
    const d = plan[di], lvl = per[di] || 0;
    if (d === 'SUMS') { const op = lvl > 4 && Math.random() < .5 ? '-' : lvl > 8 && Math.random() < .3 ? 'x' : '+', a = op === 'x' ? 2 + (Math.random() * 8 | 0) : 2 + (Math.random() * (9 + lvl * 2) | 0), b = op === 'x' ? 2 + (Math.random() * 8 | 0) : 1 + (Math.random() * (8 + lvl) | 0), A = op === '-' ? Math.max(a, b) : a, B = op === '-' ? Math.min(a, b) : b, ans = op === '+' ? A + B : op === '-' ? A - B : A * B; const opts = new Set([ans]); while (opts.size < 4) opts.add(Math.max(0, ans + (Math.random() * 7 | 0) - 3)); q = { text: `${A} ${op === 'x' ? '×' : op} ${B}`, ans, opts: shuffle([...opts]) }; }
    else if (d === 'DOTS') { const n = 3 + (Math.random() * Math.min(9, 4 + lvl) | 0), dots = []; while (dots.length < n) { const p = { x: rnd(.1, .9), y: rnd(.1, .9) }; if (dots.every(o => Math.hypot(o.x - p.x, o.y - p.y) > .14)) dots.push(p); } const opts = new Set([n]); while (opts.size < 4) opts.add(Math.max(1, n + (Math.random() * 5 | 0) - 2)); q = { dots, ans: n, show: Math.max(.6, 1.4 - lvl * .08), opts: [...opts].sort((a, b) => a - b) }; }
    else if (d === 'MEMORY') { const n = 3 + Math.min(4, lvl >> 1), cells = []; while (cells.length < n) { const i = Math.random() * 16 | 0; if (!cells.includes(i)) cells.push(i); } q = { cells, got: [], show: 1.4, bad: 0 }; }
    else if (d === 'BIGGER') { const mk = () => { const a = 1 + (Math.random() * (6 + lvl) | 0), b = 1 + (Math.random() * (6 + lvl) | 0); return Math.random() < .5 ? { s: `${a}+${b}`, v: a + b } : { s: `${a}×${b > 5 ? b - 4 : b}`, v: a * (b > 5 ? b - 4 : b) }; }; let L = mk(), R = mk(); while (L.v === R.v) R = mk(); q = { L, R }; }
    else { const nums = [], n = 9; while (nums.length < n) { const p = { x: rnd(.1, .9), y: rnd(.1, .9), n: nums.length + 1 }; if (nums.every(o => Math.hypot(o.x - p.x, o.y - p.y) > .18)) nums.push(p); } q = { nums, next: 1 }; }
    q.t = 0;
  }
  const area = () => ({ x: 8, y: 40, w: W - 16, h: H - 48 });
  function right(x, y) { score++; per[di] = (per[di] || 0) + 1; api.score(score); fx = { ok: true, l: .25 }; haptic('light'); sfx(880 + (per[di] % 5) * 60, .06, 'square', .04, 200); feel.juice.burst(tx, ty, { n: 8, speed: 70, life: .35, size: 2, color: ['#48a868', '#f0b030'] }); }
  function wrong() { pt += 1; fx = { ok: false, l: .3 }; haptic('error'); sfx(160, .12, 'sawtooth', .04, -40); feel.juice.shake(3); }
  function optRects(n) { const a = area(), bw = (a.w - 6) / 2, bh = 30, y0 = a.y + a.h - bh * 2 - 6; return Array.from({ length: n }, (_, i) => ({ x: a.x + (i % 2) * (bw + 6), y: y0 + (i >> 1) * (bh + 6), w: bw, h: bh })); }
  const self = {
    reset() { plan = shuffle([...DRILLS]).slice(0, 4); di = 0; phase = 'intro'; pt = 0; score = 0; per = []; t = 0; fx = null; done = 0; results = []; feel.clear(); ready.reset(); newQ(); },
    fx(dt) { feel.update(dt); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; if (fx) { fx.l -= dt; if (fx.l <= 0) fx = null; }
      if (phase === 'end') { done += dt; if (done > 2.6) api.over(); return; }
      pt += phase === 'play' ? dt : 0; if (q) q.t += dt;
      if (phase === 'intro') { if (q.t > 1.2) { phase = 'play'; pt = 0; newQ(); } return; }
      if (pt >= 15) { results.push(per[di] || 0); di++; if (di >= plan.length) { phase = 'end'; sfx(660, .5, 'square', .05, 300); haptic('success'); return; } phase = 'intro'; newQ(); q.t = 0; }
    },
    draw(c) {
      c.fillStyle = '#f4f0e8'; c.fillRect(0, 0, W, H);
      feel.begin(c); self.scene(c); feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: '#2c3848', y: Math.round(H * .7), text: 'TAP TO START' });
    },
    scene(c) {
      c.fillStyle = '#f4f0e8'; c.fillRect(0, 0, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      c.fillStyle = '#2c3848'; c.fillRect(0, 0, W, 14); c.fillStyle = '#f4f0e8'; c.textAlign = 'left'; c.fillText(`DRILL ${Math.min(di + 1, 4)}/4`, 4, 10); c.textAlign = 'right'; c.fillText(String(score), W - 4, 10);
      if (phase !== 'end') { c.fillStyle = '#d8d0c0'; c.fillRect(0, 14, W, 4); c.fillStyle = pt > 12 ? '#e04848' : '#48a868'; c.fillRect(0, 14, W * (1 - pt / 15), 4); }
      const a = area(); c.textAlign = 'center';
      if (phase === 'end') {
        c.fillStyle = '#2c3848'; c.font = '8px "Press Start 2P", monospace'; c.fillText('MIND SCORE', W / 2, H * .25); c.font = '16px "Press Start 2P", monospace'; c.fillStyle = '#e07020'; c.fillText(String(score * 10), W / 2, H * .4);
        c.font = '6px "Press Start 2P", monospace'; plan.forEach((d, i) => { c.fillStyle = '#2c3848'; c.textAlign = 'left'; c.fillText(d, W * .25, H * .55 + i * 12); c.textAlign = 'right'; c.fillText(String(results[i] || 0), W * .75, H * .55 + i * 12); });
        c.textAlign = 'center'; c.fillStyle = '#708090'; c.fillText(score >= 40 ? 'SHARP AS A TACK' : score >= 25 ? 'NICELY WARMED UP' : 'GOOD START', W / 2, H * .9); return;
      }
      c.fillStyle = '#2c3848'; c.font = '8px "Press Start 2P", monospace'; c.fillText(plan[di], W / 2, 32); c.font = '6px "Press Start 2P", monospace';
      if (phase === 'intro') { c.fillStyle = '#708090'; c.fillText({ SUMS: 'TAP THE ANSWER', DOTS: 'HOW MANY DOTS?', MEMORY: 'TAP THE LIT SQUARES', BIGGER: 'TAP THE BIGGER SIDE', ORDER: 'TAP 1 TO 9 IN ORDER' }[plan[di]], W / 2, H / 2); return; }
      const d = plan[di];
      if (d === 'SUMS' || d === 'DOTS') {
        if (d === 'SUMS') { c.fillStyle = '#2c3848'; c.font = '14px "Press Start 2P", monospace'; c.fillText(q.text, W / 2, a.y + 36); c.font = '6px "Press Start 2P", monospace'; }
        else { const bh = a.h - 80; c.fillStyle = '#e8e0d0'; c.fillRect(a.x, a.y, a.w, bh); if (q.t < q.show) { c.fillStyle = '#3070c0'; for (const p of q.dots) { c.beginPath(); c.arc(a.x + p.x * a.w, a.y + p.y * bh, 4, 0, 7); c.fill(); } } else { c.fillStyle = '#a09888'; c.fillText('?', W / 2, a.y + bh / 2); } }
        optRects(4).forEach((r, i) => { c.fillStyle = '#2c3848'; c.fillRect(r.x, r.y, r.w, r.h); c.fillStyle = '#f4f0e8'; c.font = '10px "Press Start 2P", monospace'; c.fillText(String(q.opts[i]), r.x + r.w / 2, r.y + r.h / 2 + 5); c.font = '6px "Press Start 2P", monospace'; });
      } else if (d === 'MEMORY') {
        const s = Math.min(a.w, a.h) / 4 - 4, gx = (W - (s + 4) * 4) / 2, gy = a.y + (a.h - (s + 4) * 4) / 2;
        for (let i = 0; i < 16; i++) { const x = gx + (i % 4) * (s + 4), y = gy + (i >> 2) * (s + 4), lit = q.t < q.show && q.cells.includes(i), got = q.got.includes(i); c.fillStyle = lit ? '#f0b030' : got ? '#48a868' : '#d8d0c0'; c.fillRect(x, y, s, s); }
      } else if (d === 'BIGGER') {
        const bw = (a.w - 8) / 2; [q.L, q.R].forEach((o, i) => { const x = a.x + i * (bw + 8); c.fillStyle = '#2c3848'; c.fillRect(x, a.y + 10, bw, a.h - 20); c.fillStyle = '#f4f0e8'; c.font = '10px "Press Start 2P", monospace'; c.fillText(o.s, x + bw / 2, a.y + a.h / 2 + 4); c.font = '6px "Press Start 2P", monospace'; });
      } else {
        for (const p of q.nums) { const x = a.x + p.x * a.w, y = a.y + p.y * a.h; c.fillStyle = p.n < q.next ? '#48a868' : '#2c3848'; c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill(); c.fillStyle = '#f4f0e8'; c.font = '8px "Press Start 2P", monospace'; c.fillText(String(p.n), x, y + 4); c.font = '6px "Press Start 2P", monospace'; }
      }
      if (fx) { c.strokeStyle = fx.ok ? '#48a868' : '#e04848'; c.lineWidth = 3; c.strokeRect(2, 20, W - 4, H - 22); c.lineWidth = 1; }
    },
    down(x, y) {
      if (ready.go()) return; tx = x; ty = y;
      if (phase !== 'play') return; const d = plan[di], a = area();
      if (d === 'SUMS' || d === 'DOTS') { if (d === 'DOTS' && q.t < q.show) return; const i = optRects(4).findIndex(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h); if (i < 0) return; if (q.opts[i] === q.ans) { right(); newQ(); } else { wrong(); newQ(); } }
      else if (d === 'MEMORY') { if (q.t < q.show) return; const s = Math.min(a.w, a.h) / 4 - 4, gx = (W - (s + 4) * 4) / 2, gy = a.y + (a.h - (s + 4) * 4) / 2, cx = Math.floor((x - gx) / (s + 4)), cy = Math.floor((y - gy) / (s + 4)); if (cx < 0 || cx > 3 || cy < 0 || cy > 3) return; const i = cy * 4 + cx; if (q.got.includes(i)) return; if (q.cells.includes(i)) { q.got.push(i); sfx(700, .04, 'square', .03); if (q.got.length === q.cells.length) { right(); newQ(); } } else { wrong(); newQ(); } }
      else if (d === 'BIGGER') { const bw = (a.w - 8) / 2, side = x < a.x + bw + 4 ? 0 : 1; if ((side === 0) === (q.L.v > q.R.v)) right(); else wrong(); newQ(); }
      else { const p = q.nums.find(p => Math.hypot(a.x + p.x * a.w - x, a.y + p.y * a.h - y) < 14); if (!p) return; if (p.n === q.next) { q.next++; sfx(500 + p.n * 60, .04, 'square', .03); haptic('tick'); if (q.next > 9) { right(); newQ(); } } else if (p.n > q.next) { wrong(); } }
    },
    move() {}, up() {}, key(k, d) { if (d) ready.go(); },
  };
  return self;
}

export default {
  id: 'mind-gym', title: 'Mind Gym', tag: 'Advance · Brain', retro: true, era: 'advance', pal: 'teal', w: 176, h: 192, maxW: 260, maxH: 320, goal: 30,
  hint: 'Four fifteen-second drills: quick sums, count the dots, remember the lit squares, tap the bigger side, or tap 1 to 9 in order. Every right answer scores; wrong ones cost a second. Your Mind Score shows at the end.',
  make,
};
