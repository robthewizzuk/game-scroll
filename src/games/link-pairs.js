import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { icon } = gs.icons;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle

// Tap two matching tiles to clear them, but only if a path with at most two turns joins them through empty space.
const W = 360, H = 640, C = 6, Rn = 8, CS = 52, OX = (W - C * CS) / 2, OY = 130;
const ICONS = ['star', 'heart', 'diamonds', 'clubs', 'spades', 'moon', 'anchor', 'crown', 'sun', 'cloud', 'music', 'flower'];   // gs.icons names
const HUES = [45, 350, 200, 130, 260, 20, 170, 300, 60, 220, 100, 330];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let g, sel, time, score, t, line, dead, board;
  const at = (x, y) => (x < 0 || y < 0 || x >= C || y >= Rn) ? -1 : g[y * C + x];
  function deal() {
    const n = C * Rn / 2, kinds = Math.min(ICONS.length, 6 + board), vals = []; for (let i = 0; i < n; i++) { const k = i % kinds; vals.push(k, k); }
    g = shuffle(vals); sel = null;
  }
  // BFS over cells (with a 1-cell border outside the board) counting turns.
  function path(a, b) {
    const key = (x, y, d) => `${x},${y},${d}`, q = [], best = new Map(), D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let d = 0; d < 4; d++) { q.push([a.x, a.y, d, 0, [[a.x, a.y]]]); }
    while (q.length) {
      const [x, y, d, turns, pts] = q.shift(); const nx = x + D[d][0], ny = y + D[d][1];
      if (nx < -1 || ny < -1 || nx > C || ny > Rn) continue;
      const np = [...pts, [nx, ny]];
      if (nx === b.x && ny === b.y) return np;
      if (at(nx, ny) !== -1 && at(nx, ny) !== null) continue;
      for (let nd = 0; nd < 4; nd++) { const nt = turns + (nd === d ? 0 : 1); if (nt > 2) continue; const k = key(nx, ny, nd); if (best.has(k) && best.get(k) <= nt) continue; best.set(k, nt); q.push([nx, ny, nd, nt, np]); }
    }
    return null;
  }
  function anyMove() { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (g[i] !== null && g[i] === g[j] && path({ x: i % C, y: i / C | 0 }, { x: j % C, y: j / C | 0 })) return true; return false; }
  return {
    reset() { time = 60; score = 0; t = 0; dead = 0; line = null; board = 0; feel.clear(); deal(); },
    update(dt) { feel.update(dt); t += dt; if (line) { line.l -= dt; if (line.l <= 0) line = null; } time -= dt; if (time <= 0) { haptic('warning'); return api.over(); } },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = '#1f2a1f'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (let i = 0; i < g.length; i++) { if (g[i] === null) continue; const x = OX + (i % C) * CS, y = OY + (i / C | 0) * CS, s = sel === i;
        c.fillStyle = s ? '#ffe9a8' : '#f3ead6'; c.beginPath(); c.roundRect(x + 3, y + 3, CS - 6, CS - 6, 8); c.fill(); c.fillStyle = '#c9bb98'; c.fillRect(x + 6, y + CS - 8, CS - 12, 3);
        c.fillStyle = `hsl(${HUES[g[i]]} 65% 42%)`; icon(c, ICONS[g[i]], x + CS / 2, y + CS / 2, 30, { color: `hsl(${HUES[g[i]]} 65% 42%)` }); }
      c.textBaseline = 'alphabetic';
      if (line) { c.strokeStyle = `rgba(255,211,74,${line.l * 3})`; c.lineWidth = 4; c.beginPath(); line.pts.forEach(([x, y], i) => { const px = OX + x * CS + CS / 2, py = OY + y * CS + CS / 2; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); }
      feel.end(c, W, H);
      c.fillStyle = time < 8 ? '#ff6b6b' : '#ffffffcc'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`${Math.ceil(time)}s`, W / 2, 100);
    },
    down(x, y) {
      const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= C || cy >= Rn) return;
      const i = cy * C + cx; if (g[i] === null) return;
      if (sel === null || sel === i) { sel = sel === i ? null : i; haptic('tick'); return; }
      if (g[sel] !== g[i]) { sel = i; haptic('tick'); sfx(250, .04, 'square', .02); return; }
      const p = path({ x: sel % C, y: sel / C | 0 }, { x: cx, y: cy });
      if (!p) { haptic('warning'); sfx(160, .1, 'square', .03); sel = i; return; }
      for (const k of [sel, i]) feel.juice.burst(OX + (k % C + .5) * CS, OY + ((k / C | 0) + .5) * CS, { n: 9, speed: 150, life: .4, size: 3.5, color: [`hsl(${HUES[g[k]]} 65% 55%)`, '#f3ead6'] });
      line = { pts: p, l: .35 }; g[sel] = g[i] = null; sel = null; score++; api.score(score); haptic('light'); sfx(700, .08, 'triangle', .04, 200);
      if (g.every(v => v === null)) { board++; time += 25; feel.win(W / 2, 300); feel.juice.pop(W / 2, 130, '+25s', { color: '#7dff9a', size: 22 }); haptic('success'); deal(); }
      else if (!anyMove()) { const left = g.filter(v => v !== null); for (let k = left.length - 1; k > 0; k--) { const j = Math.random() * (k + 1) | 0; [left[k], left[j]] = [left[j], left[k]]; } let n = 0; g = g.map(v => v === null ? null : left[n++]); }
    },
  };
}

export default {
  id: 'link-pairs', title: 'Link Pairs', tag: 'Casual · Matching', retro: false, w: W, h: H, goal: 12,
  hint: 'Tap two matching tiles. They clear if a line with no more than two turns can join them through gaps.',
  make,
};
