// Shape Fit: fill the dotted outline exactly with the pieces in the tray, no gaps and no overhang. Drag
// a piece onto the board; tap a piece to turn it. Each outline is made from its pieces, so there is
// always a way. Faster fits score more.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

let W = 160, H = 192;
const N = 6, COLS = [C16[2], C16[3], C16[5], C16[8], C16[9], C16[10], C16[7]];

function make(api) {
  const feel = new Feel({ pixel: true });
  let shape, pieces, drag, level, score, time, t, done, cs, bx, by;

  const norm = cells => { const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1])); return cells.map(([x, y]) => [x - mx, y - my]); };
  const rot = cells => norm(cells.map(([x, y]) => [-y, x]));
  function layout() {
    cs = Math.floor(Math.min((W - 16) / N, (H * .5) / N)); bx = Math.round((W - cs * N) / 2); by = 18;
  }
  function trayPos(i) { const n = pieces.length, col = i % 3, row = Math.floor(i / 3); const tw = (W - 8) / 3; return [Math.round(4 + col * tw + tw / 2), Math.round(by + cs * N + 14 + row * (cs * 2.2) + cs * 1.1)]; }

  function newShape() {
    for (let tries = 0; tries < 200; tries++) {
      const grid = new Array(N * N).fill(-1), n = Math.min(5, 2 + Math.ceil(level / 2)); pieces = [];
      let ok = true;
      for (let p = 0; p < n && ok; p++) {
        const size = 3 + (Math.random() * (level < 3 ? 2 : 3) | 0);
        // seed: middle for the first, else a free cell touching what's there
        let seeds = [];
        for (let i = 0; i < N * N; i++) if (grid[i] < 0) { const x = i % N, y = i / N | 0; if (p === 0 ? (x === 2 || x === 3) && (y === 2 || y === 3) : [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && grid[ny * N + nx] >= 0; })) seeds.push(i); }
        if (!seeds.length) { ok = false; break; }
        const cells = [seeds[Math.random() * seeds.length | 0]]; grid[cells[0]] = p;
        while (cells.length < size) {
          const opts = []; for (const c of cells) { const x = c % N, y = c / N | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && grid[ny * N + nx] < 0) opts.push(ny * N + nx); } }
          if (!opts.length) break; const c = opts[Math.random() * opts.length | 0]; grid[c] = p; cells.push(c);
        }
        if (cells.length < 3) { ok = false; break; }
        let shapeCells = norm(cells.map(c => [c % N, c / N | 0]));
        for (let r = Math.random() * 4 | 0; r > 0; r--) shapeCells = rot(shapeCells);
        pieces.push({ cells: shapeCells, col: COLS[p % COLS.length], at: null });
      }
      if (!ok) continue;
      shape = grid.map(v => v >= 0);
      break;
    }
    pieces = shuffle(pieces);
    time = 25 + pieces.length * 8 - Math.min(10, level); done = 0; drag = null;
  }
  const fills = () => { const f = new Array(N * N).fill(null); for (const p of pieces) if (p.at) for (const [x, y] of p.cells) f[(p.at[1] + y) * N + p.at[0] + x] = p; return f; };
  const fits = (p, gx, gy) => { const f = fills(); return p.cells.every(([x, y]) => { const cx = gx + x, cy = gy + y; if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false; const i = cy * N + cx; return shape[i] && (!f[i] || f[i] === p); }); };

  function drawPiece(c, p, x, y, s) { for (const [cx, cy] of p.cells) { c.fillStyle = C16[0]; c.fillRect(x + cx * s, y + cy * s, s, s); c.fillStyle = p.col; c.fillRect(x + cx * s + 1, y + cy * s + 1, s - 2, s - 2); c.fillStyle = '#ffffff60'; c.fillRect(x + cx * s + 1, y + cy * s + 1, s - 2, 1); } }

  return {
    reset() { level = 1; score = 0; t = 0; layout(); feel.clear(); newShape(); },
    resize(w, h) { W = w; H = h; layout(); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (done) { done -= dt; if (done <= 0) { level++; newShape(); } return; }
      time -= dt; if (time <= 0) { feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = C16[15]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = C16[0]; c.fillRect(bx - 2, by - 2, cs * N + 4, cs * N + 4);
      for (let i = 0; i < N * N; i++) { const x = bx + (i % N) * cs, y = by + (i / N | 0) * cs; c.fillStyle = shape[i] ? C16[14] : C16[0]; c.fillRect(x, y, cs, cs); if (shape[i]) { c.fillStyle = C16[13]; c.fillRect(x + (cs >> 1), y + (cs >> 1), 1, 1); } }
      for (const p of pieces) if (p.at && p !== drag?.p) drawPiece(c, p, bx + p.at[0] * cs, by + p.at[1] * cs, cs);
      // tray pieces drawn smaller
      const ts = Math.max(5, Math.floor(cs * .5));
      pieces.forEach((p, i) => { if (p.at || p === drag?.p) return; const [x, y] = trayPos(i), w = Math.max(...p.cells.map(q => q[0])) + 1, h = Math.max(...p.cells.map(q => q[1])) + 1; drawPiece(c, p, Math.round(x - w * ts / 2), Math.round(y - h * ts / 2), ts); });
      if (drag) { const gx = Math.round((drag.x - bx) / cs - drag.ox), gy = Math.round((drag.y - by) / cs - drag.oy); const ok = fits(drag.p, gx, gy); if (ok) { c.fillStyle = '#ffffff50'; for (const [x, y] of drag.p.cells) c.fillRect(bx + (gx + x) * cs, by + (gy + y) * cs, cs, cs); } drawPiece(c, drag.p, Math.round(drag.x - drag.ox * cs), Math.round(drag.y - drag.oy * cs), cs); }
      feel.end(c, W, H);
      text(c, `L${level}`, 4, 4, { color: C16[1] });
      text(c, `${Math.max(0, Math.ceil(time))}S`, W - 4, 4, { color: time < 8 ? C16[2] : C16[4], align: 'right' });
      if (done) text(c, 'FITS!', W / 2, by + cs * N / 2 - 4, { font: 'big', align: 'center', color: C16[4], outline: C16[0] });
      else if (level === 1 && t < 5) text(c, 'DRAG IN, TAP TO TURN', W / 2, H - 9, { align: 'center', color: C16[1] });
    },
    down(x, y) {
      if (done) return;
      const ts = Math.max(5, Math.floor(cs * .5));
      // a placed piece on the board?
      for (const p of pieces) if (p.at && p.cells.some(([cx, cy]) => { const px = bx + (p.at[0] + cx) * cs, py = by + (p.at[1] + cy) * cs; return x >= px && x < px + cs && y >= py && y < py + cs; })) { drag = { p, x, y, ox: (x - bx) / cs - p.at[0], oy: (y - by) / cs - p.at[1], sx: x, sy: y, was: p.at }; p.at = null; return; }
      let best = -1, bd = 26; pieces.forEach((p, i) => { if (p.at) return; const [px, py] = trayPos(i), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { const p = pieces[best], w = Math.max(...p.cells.map(q => q[0])) + 1, h = Math.max(...p.cells.map(q => q[1])) + 1; drag = { p, x, y, ox: w / 2, oy: h / 2 + 1.2, sx: x, sy: y, was: null }; sfx(500, .03, 'square', .02); }
    },
    move(x, y, p) { if (p && drag) { drag.x = x; drag.y = y; } },
    up(x, y) {
      if (!drag) return;
      const p = drag.p, moved = Math.hypot(x - drag.sx, y - drag.sy) > 5;
      if (!moved) {   // a tap turns it
        p.cells = rot(p.cells); sfx(700, .03, 'square', .03); haptic('tick');
        if (drag.was && fits(p, ...drag.was)) p.at = drag.was;
        drag = null; return;
      }
      const gx = Math.round((drag.x - bx) / cs - drag.ox), gy = Math.round((drag.y - by) / cs - drag.oy);
      if (fits(p, gx, gy)) { p.at = [gx, gy]; sfx(400, .05, 'square', .04); haptic('light'); }
      else { sfx(150, .05, 'square', .03); }
      drag = null;
      const f = fills();
      if (shape.every((v, i) => !v || f[i])) {
        const pts = 2 + pieces.length + Math.floor(time / 6); score += pts; api.score(score); time = Math.max(time, 0);
        done = 1.3; notes('C5 E5 G5 C6', { len: .07 }); feel.win(W / 2, by + cs * N / 2); haptic('success');
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'shape-fit',
  title: 'Shape Fit',
  tag: 'Color · Puzzle',
  retro: true, era: 'color', pal: 'teal',
  w: 160, h: 208, maxW: 220, maxH: 270,
  goal: 30,
  hint: 'Drag the pieces into the outline so it is filled exactly. Tap a piece to turn it. Fill it before the clock runs out.',
  make,
};
