import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects, { Ready } = gs.rounds;
const text = gs.pixel.text;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Bookends: pairs of books drop into a bookcase. Slide a pair with your finger, tap to spin it, flick
// down to drop it. Books clear when they are trapped: a run of two or more of the same book with a
// matching book of another colour at each end (red blue blue red, or green yellow yellow yellow green),
// along a row or up a column. The bookends go too. Longer runs and chains score more. Dusty boxes land now and
// then: they can be trapped like any book but never work as bookends.
const COLS = 6, ROWS = 12, BOX = 9;
const COL = [['#d84848', '#ffa8a0', '#8a2020'], ['#40a850', '#a8eaa0', '#1c6428'], ['#4078e0', '#a8c8ff', '#1c3a8a'], ['#f0c030', '#fff0a0', '#8a6a10'], ['#a058d8', '#e0b0ff', '#562880']];
let W = 160, H = 192, CS = 14;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready({ eat: false });                               // the first pair waits for the first touch
  let g, cur, next, score, t, fallT, speed, phase, chain, msg, drag, kinds, boxT, dead;
  const L = () => Math.max(4, (W - COLS * CS - 48) >> 1), T = () => H - ROWS * CS - 5;
  const size = () => { CS = Math.max(10, Math.min(22, Math.floor((H - 30) / ROWS), Math.floor((W - 56) / COLS))); };
  const pair = () => { const a = Math.random() * kinds | 0; let b = Math.random() * kinds | 0; if (b === a && Math.random() < .6) b = (a + 1 + (Math.random() * (kinds - 1) | 0)) % kinds; return { a, b }; };
  const offs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const cells = p => [[p.x, p.y, p.a], [p.x + offs[p.r][0], p.y + offs[p.r][1], p.b]];
  const free = (x, y) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !g[y][x]);
  const fits = p => cells(p).every(([x, y]) => free(x, y));
  function spawn() {
    cur = { ...next, x: 2, y: 0, r: 0, land: 0 }; next = pair();
    if (!fits(cur) || g[0][2] || g[0][3]) { dead = .01; haptic('error'); sfx(110, .6, 'square', .05, -40); feel.juice.shake(4); }
  }
  function tryMove(dx, dy) { const p = { ...cur, x: cur.x + dx, y: cur.y + dy }; if (fits(p)) { cur = p; return true; } return false; }
  function spin() {
    const r = (cur.r + 1) % 4;
    for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [0, -1]]) { const p = { ...cur, r, x: cur.x + kx, y: cur.y + ky }; if (fits(p)) { cur = p; sfx(700, .03, 'square', .03); haptic('tick'); return; } }
  }
  function place() {
    for (const [x, y, k] of cells(cur)) if (y >= 0) g[y][x] = { k, pop: 0 }; else dead = .01;
    cur = null; chain = 0; phase = 'fall'; haptic('light'); sfx(220, .05, 'square', .04);
  }
  function gravity() {
    let moved = false;
    for (let y = ROWS - 2; y >= 0; y--) for (let x = 0; x < COLS; x++) if (g[y][x] && !g[y + 1][x]) { g[y + 1][x] = g[y][x]; g[y][x] = null; moved = true; }
    return moved;
  }
  function findTraps() {                                 // every run of two or more held between two matching bookends
    const hit = new Set(); let longest = 0;
    const line = list => {
      const k = list.map(([x, y]) => g[y][x] ? g[y][x].k : -1);
      for (let i = 0; i < k.length - 2; i++) {
        const a = k[i], b = k[i + 1]; if (a < 0 || a === BOX || b < 0 || b === a) continue;
        let j = i + 1; while (j < k.length && k[j] === b) j++;
        if (j - i > 2 && j < k.length && k[j] === a) { for (let q = i; q <= j; q++) hit.add(list[q][1] * COLS + list[q][0]); longest = Math.max(longest, j - i - 1); }
      }
    };
    for (let y = 0; y < ROWS; y++) line(Array.from({ length: COLS }, (_, x) => [x, y]));
    for (let x = 0; x < COLS; x++) line(Array.from({ length: ROWS }, (_, y) => [x, y]));
    return { hit, longest };
  }
  function clear({ hit, longest }) {
    chain++; let sx = 0, sy = 0;
    for (const i of hit) { const x = i % COLS, y = i / COLS | 0; g[y][x].pop = .4; sx += x; sy += y; }
    const pts = (hit.size * 10 + (longest - 2) * 30) * chain; score += pts; api.score(score);
    const px = L() + (sx / hit.size + .5) * CS, py = T() + (sy / hit.size) * CS;
    feel.juice.pop(px, py, chain > 1 ? `CHAIN ${chain}` : longest > 2 ? `RUN OF ${longest}` : `+${pts}`, { color: chain > 1 ? '#80f8ff' : '#f8d838' });
    if (chain > 1 || longest > 2) feel.juice.shake(2);
    haptic(chain > 1 ? 'success' : 'medium'); sfx(440 + chain * 160 + longest * 40, .14, 'square', .05, 300);
  }
  function dropBoxes() {
    const n = 2 + Math.min(3, score / 600 | 0), xs = shuffle([0, 1, 2, 3, 4, 5]).slice(0, n);
    for (const x of xs) if (!g[0][x]) g[0][x] = { k: BOX, pop: 0 };
    msg = { txt: 'DUSTY BOXES', l: 1 }; sfx(160, .2, 'square', .04, -60); haptic('medium');
  }
  function book(c, k, x, y, flash) {
    const w = CS - 1, h = CS - 1;
    if (k === BOX) {
      c.fillStyle = '#a89070'; c.fillRect(x, y, w, h); c.fillStyle = '#c8b494'; c.fillRect(x, y, w, 2); c.fillStyle = '#7a6448'; c.fillRect(x, y + h - 2, w, 2); c.fillRect(x + (w >> 1), y + 2, 1, h - 4);
      return;
    }
    const col = COL[k], m = x + (w >> 1), n = y + (h >> 1);
    c.fillStyle = flash ? '#ffffff' : col[0]; c.fillRect(x, y, w, h);
    if (flash) return;
    c.fillStyle = col[1]; c.fillRect(x, y, 2, h); c.fillRect(x + 2, y + 1, w - 3, 1); c.fillRect(x + 2, y + h - 2, w - 3, 1);   // the spine catches the light, bands top and bottom
    c.fillStyle = col[2]; c.fillRect(x + w - 1, y, 1, h);
    c.fillStyle = col[1];                                   // each colour has its own mark
    if (k === 0) c.fillRect(m - 2, n - 1, 5, 2);
    else if (k === 1) { c.fillRect(m - 2, n - 2, 5, 1); c.fillRect(m - 2, n + 1, 5, 1); }
    else if (k === 2) { c.fillRect(m - 1, n - 2, 3, 5); c.fillRect(m - 2, n - 1, 5, 3); }
    else if (k === 3) c.fillRect(m, n - 3, 2, 6);
    else { c.fillRect(m - 2, n - 2, 2, 2); c.fillRect(m + 1, n - 2, 2, 2); c.fillRect(m - 1, n + 1, 3, 2); }
  }
  const self = {
    reset() {
      size(); g = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); kinds = 4; score = 0; t = 0; fallT = 0; speed = .7; chain = 0;
      msg = null; drag = null; boxT = 16; dead = 0; phase = 'play'; self.soft = false; feel.clear(); ready.reset(); next = pair(); spawn();
    },
    resize(w, h) { W = w; H = h; size(); },
    update(dt) {
      feel.update(dt);
      if (!ready.update(dt)) return;
      t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.4) return api.over(); return; }
      if (t > 70 && kinds === 4) { kinds = 5; msg = { txt: 'NEW COLOUR', l: 1.5 }; }
      speed = Math.max(.14, .7 - t / 320);
      if (phase === 'fall') {
        fallT -= dt; if (fallT > 0) return; fallT = .05; if (gravity()) return;
        const found = findTraps();
        if (found.hit.size) { clear(found); phase = 'pop'; fallT = .4; }
        else { phase = 'play'; boxT--; if (boxT <= 0) { boxT = Math.max(7, 14 - (t / 40 | 0)); dropBoxes(); phase = 'fall'; return; } spawn(); }
        return;
      }
      if (phase === 'pop') {
        fallT -= dt;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const b = g[y][x]; if (b && b.pop > 0) { b.pop -= dt; if (b.pop <= 0) { g[y][x] = null; const col = b.k === BOX ? ['#c8b494', '#7a6448'] : [COL[b.k][0], COL[b.k][1]]; feel.juice.burst(L() + x * CS + CS / 2, T() + y * CS + CS / 2, { n: 4, speed: 50, life: .35, size: 2, color: col }); } } }
        if (fallT <= 0) { phase = 'fall'; fallT = .08; }
        return;
      }
      if (!cur) return;
      fallT += dt * (self.soft ? 10 : 1);
      if (fallT >= speed) { fallT = 0; if (!tryMove(0, 1)) cur.land += speed; else cur.land = 0; }
      if (cur.land > 0 && !fits({ ...cur, y: cur.y + 1 })) { cur.land += dt; if (cur.land > .5 || self.soft) place(); }
    },
    fx(dt) { feel.update(dt); },
    draw(c) {
      const l = L(), tp = T(), bw = COLS * CS, bh = ROWS * CS;
      c.fillStyle = '#284850'; c.fillRect(0, 0, W, H);                              // wallpaper
      c.fillStyle = '#305860'; for (let y = 6; y < H; y += 12) for (let x = (y / 12 | 0) % 2 ? 4 : 10; x < W; x += 12) c.fillRect(x, y, 2, 2);
      c.fillStyle = '#5a3418'; c.fillRect(l - 5, tp - 5, bw + 10, bh + 10); c.fillStyle = '#8a5a30'; c.fillRect(l - 4, tp - 4, bw + 8, bh + 8);
      c.fillStyle = '#2e1c12'; c.fillRect(l, tp, bw, bh);
      c.fillStyle = '#3a2418'; for (let y = 3; y < ROWS; y += 3) c.fillRect(l, tp + y * CS - 1, bw, 1);
      c.fillStyle = '#58301c'; c.fillRect(l + 2 * CS, tp, CS * 2, 1);                   // where pairs come in
      feel.begin(c);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const b = g[y][x]; if (b) book(c, b.k, l + x * CS, tp + y * CS, b.pop > 0 && (b.pop * 20 | 0) % 2); }
      if (cur && !dead) {
        let gy = { ...cur }; while (fits({ ...gy, y: gy.y + 1 })) gy.y++;              // a faint copy shows where the pair will land
        c.globalAlpha = .3; for (const [x, y, k] of cells(gy)) if (y >= 0) book(c, k, l + x * CS, tp + y * CS); c.globalAlpha = 1;
        const off = Math.round(Math.min(1, fallT / speed) * (fits({ ...cur, y: cur.y + 1 }) ? CS * .6 : 0));
        c.save(); c.beginPath(); c.rect(l, tp, bw, bh); c.clip();
        for (const [x, y, k] of cells(cur)) book(c, k, l + x * CS, tp + y * CS + off);
        c.restore();
      }
      feel.end(c, W, H);
      const nx = l + bw + 10, ny = tp + 10;                                              // next pair, and the rule in three books
      text(c, 'NEXT', nx, tp, { color: '#f8f0e0' });
      c.fillStyle = '#2e1c12'; c.fillRect(nx - 2, ny - 2, CS + 3, CS * 2 + 3);
      book(c, next.b, nx, ny); book(c, next.a, nx, ny + CS);
      const ry = ny + CS * 2 + 12; text(c, 'TRAP', nx, ry, { color: '#f8f0e0' });
      for (let i = 0; i < 3; i++) { c.fillStyle = COL[i === 1 ? 2 : 0][0]; c.fillRect(nx + i * 7, ry + 9, 6, 8); c.fillStyle = COL[i === 1 ? 2 : 0][1]; c.fillRect(nx + i * 7, ry + 9, 1, 8); }
      if (msg) { c.fillStyle = '#2e1c12'; c.fillRect(l, tp + (bh >> 1) - 7, bw, 11); text(c, msg.txt, l + bw / 2, tp + (bh >> 1) - 4, { color: '#f8f0e0', align: 'center' }); }
      if (dead) { c.fillStyle = '#2e1c12'; c.fillRect(l, tp + (bh >> 1) - 7, bw, 11); text(c, 'SHELF FULL', l + bw / 2, tp + (bh >> 1) - 4, { color: '#ff8a80', align: 'center' }); }
      ready.draw(c, W, H, { pixel: true, color: '#f8f0e0', shadow: '#2e1c12', x: l + bw / 2, y: tp + bh * .45, text: 'SLIDE AND TAP' });
    },
    down(x, y) { ready.go(); drag = { x0: x, y0: y, x, y, t, col: cur ? cur.x : 0, moved: false }; },
    move(x, y, p) {
      if (!p || !drag || !cur || phase !== 'play') return; drag.x = x; drag.y = y;
      const dx = Math.round((x - drag.x0) / (CS * 1.1)); if (Math.abs(x - drag.x0) > 6) drag.moved = true;
      const want = drag.col + dx; let guard = 6; while (cur.x !== want && guard--) { if (!tryMove(Math.sign(want - cur.x), 0)) break; sfx(500, .02, 'square', .02); }
      if (y - drag.y0 > CS * 1.5 && Math.abs(y - drag.y0) > Math.abs(x - drag.x0) * 1.5) { drag.moved = true; self.soft = true; }
    },
    up() {
      if (drag && cur && phase === 'play' && !dead) { const dt = t - drag.t, dy = drag.y - drag.y0; if (dy > CS * 2 && dt < .26) { while (tryMove(0, 1)); place(); sfx(180, .08, 'square', .05, -80); } else if (!drag.moved && dt < .3) spin(); }
      drag = null; self.soft = false;
    },
    key(k, d) {
      if (!d) { if (k === 'ArrowDown') self.soft = false; return; }
      ready.go(); if (!cur || phase !== 'play' || dead) return;
      if (k === 'ArrowLeft') tryMove(-1, 0); if (k === 'ArrowRight') tryMove(1, 0); if (k === 'ArrowUp' || k === ' ') spin(); if (k === 'ArrowDown') self.soft = true;
    },
  };
  return self;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'bookends', title: 'Bookends', tag: 'Advance · Puzzle', retro: true, era: 'advance', pal: 'berry', w: 160, h: 192, maxW: 240, maxH: 320, goal: 400, music: 'puzzle',
  hint: 'Drag to slide the falling pair, tap to spin it, flick down to drop it. Two or more books of one colour clear when a matching book of another colour stands at each end, like red blue blue red. Longer runs score more.',
  make,
};
