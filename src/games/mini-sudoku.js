// Mini Sudoku: quick 4x4 number grids against the clock. Every row, column and 2x2 box needs 1, 2, 3
// and 4 once each. Tap an empty square, then tap a number. Clashes light up red. Each solved grid adds
// time, and the grids give fewer clues as you go.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

let W = 160, H = 176;
const K = C16;

function make(api) {
  const feel = new Feel({ pixel: true });
  let sol, grid, given, sel, time, solved, score, t, banner, ended;
  const CS = () => Math.min(28, Math.floor((H - 70) / 4)), GX = () => Math.round(W / 2 - CS() * 2), GY = 22;
  const btn = i => { const bw = Math.floor((W - 20) / 4); return [10 + i * bw, H - 30, bw - 4, 22]; };

  function count(g) {
    // how many ways can this grid be finished (stops at 2)
    const i = g.indexOf(0); if (i < 0) return 1;
    let n = 0;
    for (let v = 1; v <= 4 && n < 2; v++) if (ok(g, i, v)) { g[i] = v; n += count(g); g[i] = 0; }
    return n;
  }
  function ok(g, i, v) {
    const r = i >> 2, c = i & 3, br = r & 2, bc = c & 2;
    for (let k = 0; k < 4; k++) { if (k !== c && g[r * 4 + k] === v) return false; if (k !== r && g[k * 4 + c] === v) return false; }
    for (let a = br; a < br + 2; a++) for (let b = bc; b < bc + 2; b++) if ((a !== r || b !== c) && g[a * 4 + b] === v) return false;
    return true;
  }
  function newGrid() {
    // shuffle a known solution: relabel numbers, swap rows inside bands, bands, then the same for columns
    const base = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1], perm = shuffle([1, 2, 3, 4]);
    let rows = [[0, 1], [2, 3]].map(b => Math.random() < .5 ? b : b.reverse()); if (Math.random() < .5) rows.reverse(); rows = rows.flat();
    let cols = [[0, 1], [2, 3]].map(b => Math.random() < .5 ? b : b.reverse()); if (Math.random() < .5) cols.reverse(); cols = cols.flat();
    const tr = Math.random() < .5;
    sol = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const rr = tr ? cols[c] : rows[r], cc = tr ? rows[r] : cols[c]; sol.push(perm[base[rr * 4 + cc] - 1]); }
    // take clues away while it still has only one answer
    grid = [...sol]; const want = Math.max(4, 8 - Math.floor(solved / 2));
    const order = shuffle([...Array(16).keys()]);
    for (const i of order) { if (grid.filter(Boolean).length <= want) break; const v = grid[i]; grid[i] = 0; if (count([...grid]) !== 1) grid[i] = v; }
    given = grid.map(Boolean); sel = given.indexOf(false);
  }
  const clash = i => grid[i] && !ok(grid, i, grid[i]);

  return {
    reset() { time = 90; solved = 0; score = 0; t = 0; banner = null; ended = false; feel.clear(); newGrid(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { banner = null; newGrid(); } return; }
      time -= dt;
      if (time <= 0 && !ended) { ended = true; time = 0; feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = K[14]; c.fillRect(0, 0, W, H);
      const cs = CS(), gx = GX();
      feel.begin(c);
      c.fillStyle = K[0]; c.fillRect(gx - 2, GY - 2, cs * 4 + 4, cs * 4 + 4);
      for (let i = 0; i < 16; i++) {
        const r = i >> 2, col = i & 3, x = gx + col * cs + (col >= 2 ? 1 : 0), y = GY + r * cs + (r >= 2 ? 1 : 0);
        c.fillStyle = i === sel ? K[4] : given[i] ? K[13] : K[1]; c.fillRect(x, y, cs - 1, cs - 1);
        if (grid[i]) text(c, String(grid[i]), x + Math.floor(cs / 2), y + Math.floor(cs / 2) - 5, { font: 'big', align: 'center', color: clash(i) ? K[2] : given[i] ? K[0] : K[8] });
      }
      feel.end(c, W, H);
      for (let i = 0; i < 4; i++) { const [x, y, w, h] = btn(i); c.fillStyle = K[8]; c.fillRect(x, y, w, h); c.fillStyle = K[7]; c.fillRect(x, y, w, 2); text(c, String(i + 1), x + Math.floor(w / 2), y + 7, { font: 'big', align: 'center', color: K[1] }); }
      // clock
      c.fillStyle = K[13]; c.fillRect(4, 4, 40, 6); c.fillStyle = time < 15 ? K[2] : K[5]; c.fillRect(4, 4, Math.round(40 * Math.min(1, time / 90)), 6);
      text(c, `${solved}`, W - 4, 3, { align: 'right', color: K[0] });
      if (banner) { c.fillStyle = K[0]; c.fillRect(0, Math.round(H * .35), W, 22); text(c, banner.txt, W / 2, Math.round(H * .35) + 7, { font: 'big', align: 'center', color: K[4] }); }
      else if (solved === 0 && t < 6) text(c, '1-4 ONCE IN EVERY ROW, COLUMN, BOX', W / 2, H - 40, { align: 'center', color: K[0], font: 'small' });
    },
    down(x, y) {
      if (banner) return;
      const cs = CS(), gx = GX(), col = Math.floor((x - gx) / cs), r = Math.floor((y - GY) / cs);
      if (col >= 0 && col < 4 && r >= 0 && r < 4) { const i = r * 4 + col; if (!given[i]) { sel = i; sfx(700, .03, 'square', .02); haptic('tick'); } return; }
      for (let i = 0; i < 4; i++) { const [bx, by, w, h] = btn(i); if (x >= bx && x <= bx + w && y >= by - 4 && y <= by + h + 4) return put(i + 1); }
    },
    key(k, d) {
      if (!d || banner) return;
      if (k >= '1' && k <= '4') return put(+k);
      const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[k]; if (mv) sel = (sel + mv + 16) % 16;
    },
  };

  function put(v) {
    if (sel < 0 || given[sel]) return;
    grid[sel] = grid[sel] === v ? 0 : v; sfx(400 + v * 100, .04, 'square', .03); haptic('light');
    if (clash(sel)) { haptic('warning'); sfx(150, .1, 'square', .03); }
    // move to the next empty square
    if (grid[sel]) { const nx = grid.findIndex((g, i) => !g && !given[i]); if (nx >= 0) sel = nx; }
    if (grid.every((g, i) => g && !clash(i))) {
      solved++; const pts = 3 + Math.floor(time / 30); score += pts; api.score(score); time = Math.min(120, time + 15);
      notes('C5 E5 G5 C6', { len: .05 }); feel.win(W / 2, H / 2); haptic('success');
      banner = { txt: `SOLVED +${pts}`, l: 1 };
    }
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'mini-sudoku',
  title: 'Mini Sudoku',
  tag: 'Color · Logic',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Fill the 4x4 grid so 1 to 4 appear once in every row, column and box. Tap a square, then a number. Each solve adds time.',
  make,
};
