// Slide Ten: swipe to slide every tile on the 4x4 board. Two tiles that bump together always add up.
// Make exactly 10 and the tile clears; go over 10 and they set into a rock that never adds again.
// Tens in a row with no rock score more, and two tens in one swipe smash the rocks beside them.
// New tiles drop in after every slide, faster as you go; jam the board with rocks and it's over.
// (Swiping round and round without looking makes rocks fast: the board has to be read.)
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { Board } = gs.board;
const { Gestures } = gs.controls;

const R = PAL.berry;
let W = 160, H = 160;
const N = 4;

function make(api) {
  const K = gs.tweak('Feel', {
    extra: [3, 2, 8, 1, 'moves between extra tiles at the start (lower = the board fills faster)'],
    rampAt: [20, 5, 80, 1, 'moves until an extra tile comes every second move'],
    streakMax: [5, 1, 10, 1, 'most a ten can score when it is part of a streak'],
  });
  const feel = new Feel({ pixel: true });
  let b, score, t, dead, moves, lastTen, streak, rocks;
  const g = new Gestures({ swipe: dir => slide(dir) });
  const geo = () => { const s = Math.floor(Math.min(W - 12, H - 30) / N), x = Math.round((W - s * N) / 2), y = Math.round(18 + (H - 24 - s * N) / 2); return { s, x, y }; };

  function drop() {
    const free = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!b.get(c, r)) free.push([c, r]);
    if (!free.length) return;
    const [c, r] = free[Math.random() * free.length | 0], k = Math.random();
    const v = k < .35 ? 1 : k < .6 ? 2 : k < .8 ? 3 : k < .93 ? 4 : 5;   // (weights tried against a bot that swipes round and round)
    b.put(c, r, { v, pop: .25 });
  }
  function stuck() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = b.get(c, r); if (!p) return false;
      const rt = b.get(c + 1, r), dn = b.get(c, r + 1);
      if (!p.rock && ((rt && !rt.rock) || (dn && !dn.rock))) return false;
    }
    return true;
  }
  function slide(dir) {
    if (dead || b.busy) return;
    // bumping tiles always add: over 10 sets them into a rock
    const res = b.slide(dir, { merge: (a, q) => !a.rock && !q.rock && (a.v + q.v > 10 ? { rock: true, v: 0, pop: .3 } : { v: a.v + q.v, pop: .2 }) });
    if (!res.moved) { haptic('tick'); return; }
    moves++;
    const { s, x, y } = geo(), popY = Math.min(H - 8, y + s * N + 10), mid = m => [x + (m.col + .5) * s, y + (m.row + .5) * s];
    const tens = res.merged.filter(m => m.v === 10), busts = res.merged.filter(m => m.rock);
    let smashed = 0;
    for (const m of tens) {
      b.take(m.col, m.row);
      feel.juice.burst(...mid(m), { n: 12, speed: 70, size: 2, color: [R[0], R[1], R[2]], gravity: 80 });
      // two or more tens in one swipe break the rocks next to them
      if (tens.length > 1) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = b.get(m.col + dc, m.row + dr); if (!q?.rock) continue;
        b.take(m.col + dc, m.row + dr); smashed++;
        feel.juice.burst(x + (m.col + dc + .5) * s, y + (m.row + dr + .5) * s, { n: 10, speed: 90, size: 2, color: [R[0], R[1]], gravity: 160 });
      }
    }
    if (busts.length) {
      streak = 0; rocks += busts.length;
      for (const m of busts) feel.juice.burst(...mid(m), { n: 6, speed: 40, size: 1, color: [R[0]], gravity: 120 });
      feel.juice.shake(2); sfx(110, .12, 'square', .04, -40); haptic('heavy');
      if (!tens.length) feel.juice.pop(W / 2, popY, 'OVER 10: ROCK', { color: R[1] });
    }
    if (tens.length) {
      let pts = smashed;
      for (let i = 0; i < tens.length; i++) { streak++; pts += Math.min(K.streakMax, streak); }
      score += pts; api.score(score); lastTen = .4;
      feel.juice.pop(W / 2, popY, smashed ? `ROCKS SMASHED +${pts}` : tens.length > 1 ? `DOUBLE TEN! +${pts}` : `TEN! +${pts}`, { color: R[0] });
      notes(tens.length > 1 ? 'C5 E5 G5 C6' : streak > 2 ? 'E5 A5 C6' : 'E5 A5', { len: .06 }); haptic(tens.length > 1 ? 'success' : 'medium');
    } else if (!busts.length && res.merged.length) { sfx(500 + Math.max(...res.merged.map(m => m.v)) * 60, .05, 'square', .03); haptic('light'); }
    else if (!busts.length) { sfx(220, .03, 'square', .02); }
    drop();
    if (moves % Math.max(2, K.extra - Math.floor(moves / K.rampAt)) === 0) drop();   // the board fills faster as you go
    if (stuck()) { dead = .01; feel.lose(); haptic('error'); }
  }

  return {
    reset() { b = new Board(N, N, { speed: 16 }); score = 0; t = 0; dead = 0; moves = 0; lastTen = 0; streak = 0; rocks = 0; g.release(); feel.clear(); for (let i = 0; i < 5; i++) drop(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); g.update(); if (feel.frozen) return;
      t += dt; b.update(dt); if (lastTen > 0) lastTen -= dt;
      b.each(p => { if (p.pop > 0) p.pop -= dt; });
      if (dead) { dead += dt; if (dead > 1.2) api.over(); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      const { s, x: X, y: Y } = geo();
      feel.begin(c);
      c.fillStyle = R[2]; c.fillRect(X - 3, Y - 3, s * N + 6, s * N + 6);
      for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { c.fillStyle = R[3]; c.fillRect(X + q * s + 1, Y + r * s + 1, s - 2, s - 2); }
      b.each(p => {
        if (p.rock) {   // a rock: dark, cracked, no number
          const grow = p.pop > 0 ? Math.round(p.pop * 6) : 0, x = Math.round(X + p.x * s) + 2 - grow, y = Math.round(Y + p.y * s) + 2 - grow, w = s - 4 + grow * 2;
          c.fillStyle = R[1]; c.fillRect(x, y, w, w);   // speckled stone: unlike any flat number tile
          c.fillStyle = R[0]; for (let yy = 1; yy < w - 1; yy += 2) for (let xx = 1 + (yy >> 1) % 2; xx < w - 1; xx += 2) c.fillRect(x + xx, y + yy, 1, 1);
          c.fillRect(x, y + w - 2, w, 2); c.fillRect(x + w - 2, y, 2, w);
          c.fillStyle = R[2]; c.fillRect(x, y, w - 2, 1); c.fillRect(x, y, 1, w - 2);
          c.fillStyle = R[3]; c.fillRect(x + 4, y + w / 2 - 1 | 0, w - 8, 1); c.fillRect(x + w / 2 | 0, y + 4, 1, w - 8);   // a cross: can't add
          return;
        }
        const grow = p.pop > 0 ? Math.round(p.pop * 8) : 0, x = Math.round(X + p.x * s) + 2 - grow, y = Math.round(Y + p.y * s) + 2 - grow, w = s - 4 + grow * 2;
        const hi = p.v >= 8, mid = p.v >= 5;
        c.fillStyle = hi ? R[0] : mid ? R[1] : R[2]; c.fillRect(x, y, w, w);
        c.fillStyle = hi || mid ? R[2] : R[3]; c.fillRect(x, y, w, 2);
        text(c, String(p.v), x + w / 2, y + w / 2 - 4, { font: 'big', align: 'center', color: hi || mid ? R[3] : R[0] });
        // dots showing how far from ten
        c.fillStyle = hi || mid ? R[3] : R[0]; for (let i = 0; i < 10 - p.v && i < 9; i++) c.fillRect(x + 3 + i * 3, y + w - 4, 1, 1);
      });
      feel.end(c, W, H);
      text(c, `PTS ${score}`, 4, 4, { color: R[0] });
      text(c, streak > 1 ? `STREAK x${Math.min(K.streakMax, streak + 1)}` : `${moves}`, W - 4, 4, { color: streak > 1 ? R[0] : R[1], align: 'right' });
      if (t < 5 && !moves) text(c, 'MAKE 10. OVER 10 = ROCK', W / 2, H - 9, { align: 'center', color: R[0] });
      if (dead) text(c, 'ROCKED IN', W / 2, H / 2 - 4, { font: 'big', align: 'center', color: R[3], outline: R[0] });
    },
    down: (x, y, id) => g.down(x, y, id),
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
    key(k, d) { if (!d) return; const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k]; if (m) slide(m); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'slide-ten',
  title: 'Slide Ten',
  tag: 'Pocket · Merge',
  retro: true, pal: 'berry',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 30, music: 'puzzle',
  hint: 'Swipe to slide all the tiles; tiles that bump always add up. Make exactly 10 to clear them, but over 10 sets them into a rock. Tens in a row score more, and two tens in one swipe smash the rocks beside them.',
  make,
};
