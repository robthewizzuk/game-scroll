import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { text } = gs.pixel;

// A pocket-sized mine field. Tap to dig, hold to plant a flag. Numbers count the bombs touching
// that square. Your first dig is always safe. Clear a board to get a new, slightly nastier one.
const P = PAL.mono, W = 160, H = 160, N = 8, CS = 18, OX = 8, OY = 14, HOLD = .32;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let grid, first, score, boards, t, press, boom, mines, flash, lastNum;
  function newBoard() {
    grid = [...Array(N * N)].map(() => ({ mine: false, open: false, flag: false, n: 0 }));
    first = true; mines = Math.min(14, 9 + boards); boom = null;
  }
  const nb = i => { const x = i % N, y = i / N | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N) r.push(yy * N + xx); } return r; };
  function plant(safe) {
    const ban = new Set([safe, ...nb(safe)]); let k = 0;
    while (k < mines) { const i = Math.random() * N * N | 0; if (ban.has(i) || grid[i].mine) continue; grid[i].mine = true; k++; }
    grid.forEach((c, i) => { c.n = nb(i).filter(j => grid[j].mine).length; });
  }
  function open(i) {
    const stack = [i], seen = new Set(); let count = 0;
    while (stack.length) { const j = stack.pop(); if (seen.has(j)) continue; seen.add(j); const c = grid[j]; if (c.open || c.flag) continue; c.open = true; count++; if (c.n === 0) stack.push(...nb(j)); }
    return count;
  }
  function dig(i) {
    const c = grid[i]; if (c.flag) return;
    if (c.open) { // chord: if flags around match the number, open the rest
      const ns = nb(i); if (ns.filter(j => grid[j].flag).length !== c.n) return; for (const j of ns) if (!grid[j].flag && !grid[j].open) { if (grid[j].mine) return explode(j); score += open(j); } api.score(score); return checkWin();
    }
    if (first) { plant(i); first = false; }
    if (c.mine) return explode(i);
    const k = open(i); score += k; api.score(score); haptic(k > 4 ? 'medium' : 'tick'); sfx(400 + Math.min(k, 20) * 20, .04, 'square', .03);
    checkWin();
  }
  function explode(i) {
    boom = { i, l: 0 }; grid.forEach(c => { if (c.mine) c.open = true; }); haptic('error'); sfx(70, .5, 'square', .06, -20);
    feel.juice.shake(6).burst(OX + (i % N) * CS + 9, OY + (i / N | 0) * CS + 9, { n: 14, speed: 70, life: .5, size: 3, color: [P[0], P[1]] }); api.over();
  }
  function checkWin() {
    if (grid.every(c => c.open || c.mine)) { boards++; score += 20; api.score(score); flash = 1; haptic('success'); sfx(990, .25, 'square', .05, 300); newBoard(); }
  }
  return {
    reset() { score = 0; boards = 0; t = 0; press = null; flash = 0; feel.clear(); newBoard(); },
    update(dt) {
      feel.update(dt); t += dt; flash = Math.max(0, flash - dt * 2);
      if (press && !press.done) { press.t += dt; if (press.t >= HOLD) { press.done = true; const c = grid[press.i]; if (!c.open) { c.flag = !c.flag; haptic('medium'); sfx(c.flag ? 700 : 300, .05, 'square', .03); } } }
    },
    fx(dt) { if (boom) boom.l += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = flash ? P[3] : P[2]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.font = '8px "Press Start 2P", monospace'; c.textAlign = 'center';
      grid.forEach((g, i) => {
        const x = OX + (i % N) * CS, y = OY + (i / N | 0) * CS;
        if (g.open) {
          c.fillStyle = P[3]; c.fillRect(x, y, CS - 1, CS - 1);
          if (g.mine) { c.fillStyle = boom && boom.i === i ? P[1] : P[0]; c.beginPath(); c.arc(x + 8.5, y + 8.5, 5, 0, 7); c.fill(); c.fillRect(x + 8, y + 1, 1, 4); }
          else if (g.n) { c.fillStyle = g.n > 2 ? P[0] : P[1]; text(c, String(g.n), x + 9, y + 13 - 8, { color: c.fillStyle, align: 'center', font: 'big' }); }
        } else {
          c.fillStyle = P[1]; c.fillRect(x, y, CS - 1, CS - 1); c.fillStyle = P[2]; c.fillRect(x, y, CS - 1, 2); c.fillRect(x, y, 2, CS - 1);
          if (g.flag) { c.fillStyle = P[3]; c.fillRect(x + 7, y + 4, 2, 10); c.fillRect(x + 9, y + 4, 4, 4); }
          if (press && press.i === i && !press.done) { c.fillStyle = P[3]; c.fillRect(x + 2, y + CS - 4, (CS - 5) * press.t / HOLD, 2); }
        }
      });
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = P[0]; c.textAlign = 'left'; c.fillText(`B${mines}`, 4, 9);
      c.textAlign = 'right'; c.fillText(`F${grid.filter(g => g.flag).length}`, W - 4, 9);
      if (first && boards === 0 && t < 5) { c.textAlign = 'center'; c.fillStyle = P[0]; c.fillText('TAP DIG / HOLD FLAG', 80, 159); }
    },
    down(x, y) {
      const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      press = { i: cy * N + cx, t: 0, done: false };
    },
    up() { if (press && !press.done && !boom) dig(press.i); press = null; },
    key(k, d) { if (d && k === ' ' && first) dig(Math.random() * N * N | 0); },
  };
}

export default {
  id: 'bomb-sweeper', title: 'Bomb Sweeper', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'mono', goal: 64,
  hint: 'Tap a square to dig. Hold to flag a bomb. Numbers say how many bombs touch that square. Tap a number with all its flags set to clear around it.',
  make,
};
