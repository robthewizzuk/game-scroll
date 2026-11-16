import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { approach } = gs.juice;

// Single-screen bomb maze: tap to drop a bomb, drag to walk. Blasts break crates and catch critters. Don't stand in the blast.
const R = PAL.moss, W = 160, H = 160, GW = 15, GH = 13, CS = 10, OX = 5, OY = 24;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let g, p, bombs, fires, critters, level, score, t, dead, held, dir, o;
  const cellAt = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH) ? 1 : g[y * GW + x];
  const blocked = (x, y, self) => cellAt(x, y) || bombs.some(b => b.x === x && b.y === y && !(self && b.x === p.x && b.y === p.y));
  function newLevel() {
    g = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1 || (x % 2 === 0 && y % 2 === 0)) g[y * GW + x] = 1; else if (!(x < 3 && y < 3) && Math.random() < .45) g[y * GW + x] = 2; }
    p = { x: 1, y: 1, fx: 1, fy: 1, mv: 0 }; bombs = []; fires = []; critters = [];
    while (critters.length < 2 + level) { const x = 1 + (Math.random() * (GW - 2) | 0), y = 1 + (Math.random() * (GH - 2) | 0); if (!g[y * GW + x] && x + y > 8) critters.push({ x, y, fx: x, fy: y, d: [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.random() * 4 | 0], mv: 0, sp: .5 - Math.min(.25, level * .03) }); }
  }
  function explode(b) {
    bombs = bombs.filter(q => q !== b); sfx(90, .3, 'sawtooth', .06, -40); haptic('heavy'); feel.juice.shake(3);
    const cells = [[b.x, b.y]];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 1; i <= 2; i++) { const x = b.x + dx * i, y = b.y + dy * i, v = cellAt(x, y); if (v === 1) break; cells.push([x, y]); if (v === 2) { g[y * GW + x] = 0; score += 10; feel.juice.burst(OX + x * CS + 5, OY + y * CS + 5, { n: 5, speed: 45, life: .35, size: 2, color: [R[1], R[2]], gravity: 120 }); break; } }
    for (const [x, y] of cells) { fires.push({ x, y, l: .45 }); const ch = bombs.find(q => q.x === x && q.y === y); if (ch) ch.f = Math.min(ch.f, .05); }
    api.score(score);
  }
  return {
    reset() { level = 1; score = 0; t = 0; dead = 0; held = false; dir = null; feel.clear(); newLevel(); },
    update(dt) {
      feel.update(dt); t += dt;
      if (p.mv > 0) { p.mv -= dt; } else if (held && dir) { const nx = p.x + dir[0], ny = p.y + dir[1]; if (!blocked(nx, ny)) { p.x = nx; p.y = ny; p.mv = .14; } }
      const k = Math.max(0, p.mv / .14); p.fx = approach(p.fx, p.x, 19, dt); p.fy = approach(p.fy, p.y, 19, dt);
      for (const b of [...bombs]) { b.f -= dt; if (b.f <= 0) explode(b); }
      for (const f of fires) f.l -= dt; fires = fires.filter(f => f.l > 0);
      for (const cr of critters) {
        cr.mv -= dt; cr.fx = approach(cr.fx, cr.x, 11, dt); cr.fy = approach(cr.fy, cr.y, 11, dt);
        if (cr.mv <= 0) { cr.mv = cr.sp; if (blocked(cr.x + cr.d[0], cr.y + cr.d[1]) || Math.random() < .25) { const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => !blocked(cr.x + d[0], cr.y + d[1])); if (opts.length) cr.d = opts[Math.random() * opts.length | 0]; } if (!blocked(cr.x + cr.d[0], cr.y + cr.d[1])) { cr.x += cr.d[0]; cr.y += cr.d[1]; } }
      }
      const caught = critters.filter(cr => fires.some(f => f.x === cr.x && f.y === cr.y));
      if (caught.length) { critters = critters.filter(cr => !caught.includes(cr)); score += caught.length * 100; api.score(score); haptic('medium'); sfx(880, .1, 'square', .04, 200); for (const cr of caught) feel.juice.pop(OX + cr.x * CS + 5, OY + cr.y * CS, '100', { color: R[0], size: 6 }); }
      if (fires.some(f => f.x === p.x && f.y === p.y) || critters.some(cr => cr.x === p.x && cr.y === p.y)) { haptic('error'); sfx(120, .5, 'sawtooth', .05, -60); feel.juice.shake(5); return api.over(); }
      if (!critters.length) { level++; score += 300; api.score(score); haptic('success'); sfx(990, .3, 'square', .05, 400); newLevel(); }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const v = g[y * GW + x], X = OX + x * CS, Y = OY + y * CS;
        if (v === 1) { c.fillStyle = R[0]; c.fillRect(X, Y, CS, CS); c.fillStyle = R[1]; c.fillRect(X + 1, Y + 1, CS - 3, CS - 3); }
        else if (v === 2) { c.fillStyle = R[1]; c.fillRect(X, Y, CS, CS); c.fillStyle = R[2]; c.fillRect(X + 1, Y + 1, CS - 2, 3); c.fillRect(X + 1, Y + 5, CS - 2, 3); } }
      for (const b of bombs) { const X = OX + b.x * CS, Y = OY + b.y * CS, s = (t * (b.f < .6 ? 12 : 4) | 0) % 2; c.fillStyle = R[0]; c.beginPath(); c.arc(X + 5, Y + 5.5, s ? 4 : 3.5, 0, 7); c.fill(); c.fillRect(X + 5, Y, 1, 2); }
      for (const f of fires) { c.fillStyle = (t * 20 | 0) % 2 ? R[0] : R[1]; c.fillRect(OX + f.x * CS + 1, OY + f.y * CS + 1, CS - 2, CS - 2); c.fillStyle = R[3]; c.fillRect(OX + f.x * CS + 3, OY + f.y * CS + 3, CS - 6, CS - 6); }
      for (const cr of critters) { const X = Math.round(OX + cr.fx * CS), Y = Math.round(OY + cr.fy * CS); c.fillStyle = R[0]; c.fillRect(X + 2, Y + 2, 6, 6); c.fillStyle = R[3]; c.fillRect(X + 3, Y + 4, 1, 1); c.fillRect(X + 6, Y + 4, 1, 1); if ((t * 4 | 0) % 2) { c.fillStyle = R[0]; c.fillRect(X + 1, Y + 8, 2, 1); c.fillRect(X + 7, Y + 8, 2, 1); } }
      if (!dead || (dead * 10 | 0) % 2) { const X = Math.round(OX + p.fx * CS), Y = Math.round(OY + p.fy * CS); c.fillStyle = R[3]; c.fillRect(X + 2, Y + 1, 6, 8); c.fillStyle = R[0]; c.fillRect(X + 2, Y + 1, 6, 3); c.fillRect(X + 3, Y + 5, 4, 3); c.fillStyle = R[3]; c.fillRect(X + 3, Y + 2, 1, 1); c.fillRect(X + 6, Y + 2, 1, 1); }
      feel.end(c, W, H);
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`LV${level}`, 4, 10); c.textAlign = 'right'; c.fillText(`x${critters.length}`, W - 4, 10);
    },
    down(x, y) { o = { x, y }; held = true; this._moved = false; },
    move(x, y, pr) { if (!pr || !o) return; const dx = x - o.x, dy = y - o.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 5) { dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; o = { x, y }; this._moved = true; } },
    up() { held = false; if (!this._moved) this.bomb(); dir = null; },
    bomb() { if (bombs.length < 2 && !bombs.some(b => b.x === p.x && b.y === p.y)) { bombs.push({ x: p.x, y: p.y, f: 2 }); sfx(300, .05, 'square', .03); haptic('tick'); } },
    key(k, d) { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (m) { dir = m; held = d; } if (d && k === ' ') this.bomb(); },
  };
}

export default {
  id: 'bomb-maze', title: 'Bomb Maze', tag: 'Pocket · Action', retro: true, w: W, h: H, pal: 'moss', goal: 300,
  hint: 'Drag to walk, tap to drop a bomb, then get clear. Catch every critter in a blast to clear the maze.',
  make,
};
