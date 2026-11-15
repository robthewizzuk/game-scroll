// Arrow Maze: every tile has an arrow, and the robot always walks the way the arrow under it points.
// You get a few turns: tap tiles to spin their arrows a quarter turn, then press GO and watch the robot
// walk. Reach the flag, scoop the batteries on the way, don't walk off the edge or into a loop.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

const R = PAL.moss;
let W = 160, H = 160;
const N = 6, DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

function make(api) {
  const feel = new Feel({ pixel: true });
  let budget0, arrows, orig, start, goal, cells, turns, level, score, lives, t, run, banner, bats;
  const geo = () => { const s = Math.floor(Math.min(W - 8, H - 34) / N), x = Math.round((W - s * N) / 2), y = 14; return { s, x, y }; };
  const goBtn = () => { const { s, y } = geo(); return { x: W / 2 - 22, y: y + s * N + 4, w: 44, h: 14 }; };

  function newLevel() {
    for (let tries = 0; tries < 200; tries++) {
      arrows = Array.from({ length: N * N }, () => Math.random() * 4 | 0);
      start = [0, Math.random() * N | 0];
      // a random self-avoiding walk to the goal; set the arrows along it
      const path = [start], seen = new Set([start[1] * N]);
      let [x, y] = start;
      const len = Math.min(N * N - 6, 6 + level * 2);
      while (path.length < len) {
        const opts = [0, 1, 2, 3].filter(d => { const nx = x + DX[d], ny = y + DY[d]; return nx >= 0 && ny >= 0 && nx < N && ny < N && !seen.has(ny * N + nx); });
        if (!opts.length) break; const d = opts[Math.random() * opts.length | 0];
        arrows[y * N + x] = d; x += DX[d]; y += DY[d]; path.push([x, y]); seen.add(y * N + x);
      }
      if (path.length < len) continue;
      goal = [x, y];
      bats = new Set(path.slice(2, -1).filter(() => Math.random() < .25).map(([a, b]) => b * N + a));
      // scramble a few arrows on the path; that many turns (+1) is the budget
      const k = Math.min(6, 1 + Math.floor(level / 1.5));
      const idx = shuffle(path.slice(0, -1).map(([a, b]) => b * N + a)).slice(0, k);
      let need = 0; for (const i of idx) { const r = 1 + Math.random() * 3 | 0; arrows[i] = (arrows[i] + r) % 4; need += 4 - r; }
      turns = budget0 = need + 1 + (level < 3 ? 2 : 0); orig = [...arrows]; break;
    }
    run = null; banner = { txt: `MAZE ${level}`, sub: `${turns} TURNS`, l: 1.1 };
  }
  function go() {
    if (run || banner) return;
    run = { x: start[0], y: start[1], k: 0, got: new Set(), seen: new Set(), steps: 0 }; sfx(600, .08, 'square', .03); haptic('light');
  }
  function fail(why) { lives--; feel.hurt(W / 2, H / 2); haptic('error'); banner = { txt: why, sub: lives > 0 ? 'TRY AGAIN' : '', l: 1.3, next: lives > 0 ? 'retry' : 'over' }; }

  return {
    reset() { level = 1; score = 0; lives = 3; t = 0; feel.clear(); newLevel(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.next === 'over') return api.over(); if (b.next === 'win') { level++; newLevel(); } if (b.next === 'retry') { run = null; arrows = [...orig]; turns = budget0; } } return; }
      if (!run) return;
      run.k += dt * 6;
      if (run.k >= 1) {
        run.k = 0; const i = run.y * N + run.x;
        if (run.seen.has(i)) return fail('LOOPED!');
        run.seen.add(i);
        const d = arrows[i]; run.x += DX[d]; run.y += DY[d]; run.steps++;
        sfx(300 + (run.steps % 8) * 40, .03, 'square', .02);
        if (run.x < 0 || run.y < 0 || run.x >= N || run.y >= N) return fail('OFF THE EDGE!');
        const j = run.y * N + run.x;
        if (bats.has(j) && !run.got.has(j)) { run.got.add(j); feel.coin(W / 2, H / 2); }
        if (run.x === goal[0] && run.y === goal[1]) {
          const pts = 3 + run.got.size * 2 + turns; score += pts; api.score(score);
          notes('C5 E5 G5 C6', { len: .07 }); feel.win(W / 2, H / 2); haptic('success');
          banner = { txt: 'HOME!', sub: `+${pts}`, l: 1.3, next: 'win' };
        }
      }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      const { s, x: X, y: Y } = geo();
      feel.begin(c);
      for (let i = 0; i < N * N; i++) {
        const cx = i % N, cy = i / N | 0, x = X + cx * s, y = Y + cy * s, ch = arrows[i] !== orig[i];
        c.fillStyle = (cx + cy) % 2 ? R[2] : R[3]; c.fillRect(x, y, s, s);
        if (run?.seen.has(i)) { c.fillStyle = R[2]; c.fillRect(x + 1, y + 1, s - 2, s - 2); }
        const m = s >> 1, d = arrows[i];
        c.fillStyle = ch ? R[0] : R[1];
        // arrow: a stem and a head, pointing d
        for (let k = -3; k <= 3; k++) { const px = x + m + DX[d] * k, py = y + m + DY[d] * k; c.fillRect(px, py, 1, 1); }
        for (let k = 1; k <= 3; k++) { const hx = x + m + DX[d] * (3 - k), hy = y + m + DY[d] * (3 - k); c.fillRect(hx + DY[d] * k, hy + DX[d] * k, 1, 1); c.fillRect(hx - DY[d] * k, hy - DX[d] * k, 1, 1); }
        if (bats.has(i) && !run?.got.has(i)) { c.fillStyle = R[0]; c.fillRect(x + 2, y + 2, 4, 6); c.fillRect(x + 3, y + 1, 2, 1); c.fillStyle = R[3]; c.fillRect(x + 3, y + 3, 2, 2); }
      }
      c.fillStyle = R[0]; c.fillRect(X - 1, Y - 1, s * N + 2, 1); c.fillRect(X - 1, Y + s * N, s * N + 2, 1); c.fillRect(X - 1, Y, 1, s * N); c.fillRect(X + s * N, Y, 1, s * N);
      // flag and start pad
      const gx = X + goal[0] * s, gy = Y + goal[1] * s; c.fillStyle = R[0]; c.fillRect(gx + 3, gy + 2, 1, s - 4); c.fillRect(gx + 4, gy + 2, 5, 4);
      c.fillStyle = R[1]; c.fillRect(X + start[0] * s, Y + start[1] * s, 2, s);
      // robot
      const rx = run ? run.x : start[0], ry = run ? run.y : start[1], bob = run ? (t * 12 | 0) % 2 : 0;
      if (rx >= 0 && ry >= 0 && rx < N && ry < N) { const x = X + rx * s + (s >> 1), y = Y + ry * s + (s >> 1) - bob; c.fillStyle = R[0]; c.fillRect(x - 4, y - 4, 8, 7); c.fillRect(x - 1, y - 6, 2, 2); c.fillStyle = R[3]; c.fillRect(x - 2, y - 2, 1, 2); c.fillRect(x + 1, y - 2, 1, 2); c.fillStyle = R[0]; c.fillRect(x - 3, y + 3, 2, 2); c.fillRect(x + 1, y + 3, 2, 2); }
      feel.end(c, W, H);
      text(c, `TURNS ${turns}`, 4, 4, { color: R[0] });
      for (let i = 0; i < lives; i++) { c.fillStyle = R[0]; c.fillRect(W - 8 - i * 6, 4, 4, 4); }
      const b = goBtn(); c.fillStyle = run ? R[2] : R[0]; c.fillRect(b.x, b.y, b.w, b.h); text(c, 'GO!', b.x + b.w / 2, b.y + 4, { align: 'center', color: R[3] });
      if (banner) { text(c, banner.txt, W / 2, H / 2 - 8, { font: 'big', align: 'center', color: R[3], outline: R[0] }); if (banner.sub) text(c, banner.sub, W / 2, H / 2 + 6, { align: 'center', color: R[3], outline: R[0] }); }
    },
    down(x, y) {
      if (banner || run) return;
      const b = goBtn(); if (x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 3 && y < b.y + b.h + 6) return go();
      const { s, x: X, y: Y } = geo(), cx = Math.floor((x - X) / s), cy = Math.floor((y - Y) / s);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      if (turns <= 0) { haptic('warning'); feel.juice.pop(x, y - 6, 'NO TURNS', { color: R[0] }); return; }
      const i = cy * N + cx; arrows[i] = (arrows[i] + 1) % 4; turns--; sfx(500, .03, 'square', .03); haptic('tick');
    },
    key(k, d) { if (d && k === ' ') go(); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'arrow-maze',
  title: 'Arrow Maze',
  tag: 'Pocket · Puzzle',
  retro: true, pal: 'moss',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'The robot follows the arrows. Tap tiles to turn their arrows (you have a few turns), then press GO to walk it to the flag.',
  make,
};
