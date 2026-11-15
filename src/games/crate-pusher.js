import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Warehouse puzzle: push (never pull) every crate onto a dot. Swipe or tap beside the worker to step. Tap ↺ to restart a room.
const R = PAL.amber, W = 160, H = 160, N = 8, CS = 16, OX = (W - N * CS) / 2, OY = 20, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let wall, targets, crates, p, start, time, score, t, dead, pd, moves, done, started;
  const crateAt = (x, y) => crates.findIndex(c => c.x === x && c.y === y);
  const isWall = (x, y) => x < 0 || y < 0 || x >= N || y >= N || wall[y * N + x];
  function build() {
    for (;;) {
      wall = Array.from({ length: N * N }, (_, i) => { const x = i % N, y = i / N | 0; return x === 0 || y === 0 || x === N - 1 || y === N - 1 || Math.random() < .1; });
      const free = []; for (let i = 0; i < N * N; i++) if (!wall[i]) free.push(i);
      const nc = Math.min(3, 2 + (score >> 2)); const pick = shuffle(free);
      targets = pick.slice(0, nc).map(i => ({ x: i % N, y: i / N | 0 })); crates = targets.map(c => ({ ...c })); let pl = { x: pick[nc] % N, y: pick[nc] / N | 0 };
      for (let s = 0; s < 400; s++) {   // play backwards: random walks with pulls guarantee a solvable room
        const d = D[Math.random() * 4 | 0], nx = pl.x + d[0], ny = pl.y + d[1]; if (isWall(nx, ny) || crateAt(nx, ny) >= 0) continue;
        const bi = crateAt(pl.x - d[0], pl.y - d[1]); if (bi >= 0 && Math.random() < .6) { crates[bi].x = pl.x; crates[bi].y = pl.y; }
        pl = { x: nx, y: ny };
      }
      const off = crates.filter(c => !targets.some(g => g.x === c.x && g.y === c.y)).length;
      if (off >= Math.min(2, crates.length)) { p = pl; start = { p: { ...pl }, crates: crates.map(c => ({ ...c })) }; moves = 0; done = 0; return; }
    }
  }
  function step(d) {
    if (done) return; const nx = p.x + d[0], ny = p.y + d[1]; if (isWall(nx, ny)) return;
    const ci = crateAt(nx, ny);
    if (ci >= 0) { const bx = nx + d[0], by = ny + d[1]; if (isWall(bx, by) || crateAt(bx, by) >= 0) { haptic('tick'); return; } crates[ci].x = bx; crates[ci].y = by; haptic('light'); sfx(160, .05, 'square', .03); if (targets.some(g => g.x === bx && g.y === by)) feel.juice.burst(OX + bx * CS + 8, OY + by * CS + 8, { n: 8, speed: 45, life: .4, size: 2, color: [R[0], R[1]] }); }
    else sfx(400, .02, 'square', .015);
    p = { x: nx, y: ny }; moves++; started = true;
    if (crates.every(c => targets.some(g => g.x === c.x && g.y === c.y))) { done = .001; haptic('success'); sfx(880, .3, 'square', .05, 300); }
  }
  return {
    reset() { time = 75; score = 0; t = 0; dead = 0; pd = null; started = false; feel.clear(); build(); },
    update(dt) { feel.update(dt); t += dt; if (started) time -= dt;   // the clock waits for the first step
      if (time <= 0) { haptic('warning'); feel.juice.shake(4); return api.over(); } if (done) { done += dt; if (done > .6) { score++; api.score(score); time += 20; build(); } } },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const X = OX + x * CS, Y = OY + y * CS; if (wall[y * N + x]) { c.fillStyle = R[1]; c.fillRect(X, Y, CS, CS); c.fillStyle = R[0]; c.fillRect(X, Y + 7, CS, 1); c.fillRect(X + 7, Y, 1, 7); c.fillRect(X + 3, Y + 8, 1, 8); } }
      for (const g of targets) { c.fillStyle = R[1]; c.fillRect(OX + g.x * CS + 6, OY + g.y * CS + 6, 4, 4); }
      for (const k of crates) { const X = OX + k.x * CS, Y = OY + k.y * CS, on = targets.some(g => g.x === k.x && g.y === k.y); c.fillStyle = on ? R[0] : R[2]; c.fillRect(X + 1, Y + 1, CS - 2, CS - 2); c.fillStyle = on ? R[2] : R[0]; c.strokeStyle = c.fillStyle; c.strokeRect(X + 1.5, Y + 1.5, CS - 3, CS - 3); c.beginPath(); c.moveTo(X + 2, Y + 2); c.lineTo(X + CS - 2, Y + CS - 2); c.moveTo(X + CS - 2, Y + 2); c.lineTo(X + 2, Y + CS - 2); c.stroke(); }
      const X = OX + p.x * CS, Y = OY + p.y * CS; c.fillStyle = R[0]; c.fillRect(X + 5, Y + 2, 6, 5); c.fillRect(X + 4, Y + 7, 8, 5); c.fillRect(X + 4, Y + 12, 3, 3); c.fillRect(X + 9, Y + 12, 3, 3); c.fillStyle = R[3]; c.fillRect(X + 6, Y + 4, 1, 1); c.fillRect(X + 9, Y + 4, 1, 1);
      feel.end(c, W, H);
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 4, 10); c.textAlign = 'right'; c.font = '9px Rubik, sans-serif'; c.fillText('↺', W - 4, 12);
    },
    down(x, y) { pd = { x, y }; },
    up(x, y) {
      if (!pd) return; const dx = x - pd.x, dy = y - pd.y; pd = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) {
        if (x > W - 20 && y < 18) { p = { ...start.p }; crates = start.crates.map(c => ({ ...c })); moves = 0; sfx(300, .1, 'square', .03); return; }
        const ax = x - (OX + p.x * CS + 8), ay = y - (OY + p.y * CS + 8); if (Math.max(Math.abs(ax), Math.abs(ay)) < 6) return; step(Math.abs(ax) > Math.abs(ay) ? [Math.sign(ax), 0] : [0, Math.sign(ay)]); return;
      }
      step(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
    },
    key(k, d) { if (!d) return; const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (m) step(m); },
  };
}

export default {
  id: 'crate-pusher', title: 'Crate Pusher', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'amber', goal: 2,
  hint: 'Swipe to walk and push crates onto the dots. You can push but never pull. Tap ↺ to restart a room.',
  make,
};
