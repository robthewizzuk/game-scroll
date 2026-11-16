// Hex Bridge: a 7x7 diamond hex-connection game on a walnut and ivory board. Take turns placing
// glass stones with Bramble (gs.solve.Search MCTS + gs.brains.Dial). Connect your warm Amber borders
// (top-left to bottom-right) before Bramble bridges the cool Jade borders (bottom-left to top-right).
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { HexMap } = gs.hex;
const { Search } = gs.solve;
const { Dial } = gs.brains;
const { Table, slab, stone, ring, sounds } = gs.tabletop;
const { pbr } = gs.hd;

let W = 300, H = 460;
const N = 7, TOTAL = N * N;
const HEX_R = .335, REST_Y = .235 * .62 * .92;
const AMBER = '#f2a01e', JADE = '#22a79c', IVORY = '#efe3c8', IVORY_EDGE = '#d5c19a';
const WHO = [{ name: 'You', col: AMBER }, { name: 'Bramble', col: JADE }];
const AX = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const ANG = -Math.PI / 6, CA = Math.cos(ANG), SA = Math.sin(ANG);
const EMPTY_MOVES = [];

// Precomputed 6-neighbour indices for every cell i = r * 7 + q (zero allocs during MCTS)
const NEIGH = Array.from({ length: TOTAL }, (_, i) => {
  const q = i % N, r = (i / N) | 0, out = [];
  for (const [dq, dr] of AX) {
    const nq = q + dq, nr = r + dr;
    if (nq >= 0 && nq < N && nr >= 0 && nr < N) out.push(nr * N + nq);
  }
  return out;
});

// Scratch buffers for zero-alloc BFS / 0-1 BFS inside Search playouts & scoring
const Q = new Int8Array(TOTAL);
const SEEN = new Uint8Array(TOTAL);
const DIST = new Int8Array(TOTAL);
const DQ = new Int8Array(128);
let STAMP = 1;

function hasBridge(b, who) {
  let hasStart = false, hasEnd = false;
  if (who === 1) {
    for (let q = 0; q < N; q++) {
      if (b[q] === 1) hasStart = true;
      if (b[42 + q] === 1) hasEnd = true;
    }
  } else {
    for (let r = 0; r < N; r++) {
      if (b[r * N] === 2) hasStart = true;
      if (b[r * N + 6] === 2) hasEnd = true;
    }
  }
  if (!hasStart || !hasEnd) return false;
  if (++STAMP >= 250) { SEEN.fill(0); STAMP = 1; }
  let head = 0, tail = 0;
  if (who === 1) {
    for (let q = 0; q < N; q++) if (b[q] === 1) { SEEN[q] = STAMP; Q[tail++] = q; }
    while (head < tail) {
      const u = Q[head++], ns = NEIGH[u];
      for (let k = 0; k < ns.length; k++) {
        const v = ns[k];
        if (b[v] === 1 && SEEN[v] !== STAMP) {
          if (v >= 42) return true;
          SEEN[v] = STAMP; Q[tail++] = v;
        }
      }
    }
  } else {
    for (let r = 0; r < N; r++) {
      const idx = r * N;
      if (b[idx] === 2) { SEEN[idx] = STAMP; Q[tail++] = idx; }
    }
    while (head < tail) {
      const u = Q[head++], ns = NEIGH[u];
      for (let k = 0; k < ns.length; k++) {
        const v = ns[k];
        if (b[v] === 2 && SEEN[v] !== STAMP) {
          if (v % N === 6) return true;
          SEEN[v] = STAMP; Q[tail++] = v;
        }
      }
    }
  }
  return false;
}

// Minimum empty stones needed to complete a bridge for `who` (0-1 BFS)
function bridgeDist(b, who) {
  const opp = 3 - who;
  DIST.fill(99);
  let head = 64, tail = 64;
  if (who === 1) {
    for (let q = 0; q < N; q++) {
      const v = b[q];
      if (v === who) { DIST[q] = 0; head = (head - 1) & 127; DQ[head] = q; }
      else if (v === 0) { DIST[q] = 1; DQ[tail] = q; tail = (tail + 1) & 127; }
    }
  } else {
    for (let r = 0; r < N; r++) {
      const i = r * N, v = b[i];
      if (v === who) { DIST[i] = 0; head = (head - 1) & 127; DQ[head] = i; }
      else if (v === 0) { DIST[i] = 1; DQ[tail] = i; tail = (tail + 1) & 127; }
    }
  }
  while (head !== tail) {
    const u = DQ[head]; head = (head + 1) & 127;
    const d = DIST[u];
    if (who === 1 ? u >= 42 : u % N === 6) return d;
    const ns = NEIGH[u];
    for (let k = 0; k < ns.length; k++) {
      const v = ns[k], bv = b[v];
      if (bv === opp) continue;
      const nd = d + (bv === who ? 0 : 1);
      if (nd < DIST[v]) {
        DIST[v] = nd;
        if (bv === who) { head = (head - 1) & 127; DQ[head] = v; }
        else { DQ[tail] = v; tail = (tail + 1) & 127; }
      }
    }
  }
  return 99;
}

// Longest connected border-to-border axis span (1..7): Amber spans r (0..6), Jade spans q (0..6)
function spanScore(b, who) {
  if (++STAMP >= 250) { SEEN.fill(0); STAMP = 1; }
  let best = 0;
  for (let i = 0; i < TOTAL; i++) {
    if (b[i] !== who || SEEN[i] === STAMP) continue;
    let head = 0, tail = 0;
    SEEN[i] = STAMP; Q[tail++] = i;
    let lo = who === 1 ? (i / N) | 0 : i % N, hi = lo;
    while (head < tail) {
      const u = Q[head++], coord = who === 1 ? (u / N) | 0 : u % N;
      if (coord < lo) lo = coord;
      if (coord > hi) hi = coord;
      const ns = NEIGH[u];
      for (let k = 0; k < ns.length; k++) {
        const v = ns[k];
        if (b[v] === who && SEEN[v] !== STAMP) { SEEN[v] = STAMP; Q[tail++] = v; }
      }
    }
    const span = hi - lo + 1;
    if (span > best) best = span;
  }
  return best;
}

// Shortest winning stone chain for highlight + celebration sparks
function winningChain(b, who) {
  const prev = new Int8Array(TOTAL).fill(-1);
  if (++STAMP >= 250) { SEEN.fill(0); STAMP = 1; }
  let head = 0, tail = 0;
  if (who === 1) {
    for (let q = 0; q < N; q++) if (b[q] === 1) { SEEN[q] = STAMP; Q[tail++] = q; }
  } else {
    for (let r = 0; r < N; r++) { const i = r * N; if (b[i] === 2) { SEEN[i] = STAMP; Q[tail++] = i; } }
  }
  let end = -1;
  while (head < tail) {
    const u = Q[head++];
    if (who === 1 ? u >= 42 : u % N === 6) { end = u; break; }
    const ns = NEIGH[u];
    for (let k = 0; k < ns.length; k++) {
      const v = ns[k];
      if (b[v] === who && SEEN[v] !== STAMP) { SEEN[v] = STAMP; prev[v] = u; Q[tail++] = v; }
    }
  }
  if (end < 0) return [];
  const chain = [];
  for (let cur = end; cur >= 0; cur = prev[cur]) chain.push(cur);
  chain.reverse();
  return chain;
}

/* ----- pure rules shared between play & MCTS Search ----- */
function moves(s) {
  if (s.win >= 0) return EMPTY_MOVES;
  const out = [];
  for (let i = 0; i < TOTAL; i++) if (s.b[i] === 0) out.push(i);
  return out;
}
function play(s, m) {
  const nb = s.b.slice();
  nb[m] = s.t + 1;
  const win = hasBridge(nb, s.t + 1) ? s.t : -1;
  return { b: nb, t: 1 - s.t, win };
}
function evalState(s, p) {
  if (s.win >= 0) return s.win === p ? 10000 : -10000;
  const d0 = bridgeDist(s.b, 1), d1 = bridgeDist(s.b, 2);
  const diff = d0 - d1; // positive favors Jade (1), negative favors Amber (0)
  return (p === 1 ? diff : -diff) * 100;
}
const brain = new Search({
  moves,
  play,
  turn: s => s.t,
  over: s => s.win >= 0,
  score: evalState,
});

// Fast tactical 1-move win / urgent 1-move block check so Bramble never misses obvious mates
function tacticalMove(s, skill) {
  const nb = s.b.slice();
  // 1. Immediate winning move for Bramble (Jade = 2)
  for (let i = 0; i < TOTAL; i++) {
    if (nb[i] !== 0) continue;
    nb[i] = 2;
    if (hasBridge(nb, 2)) return i;
    nb[i] = 0;
  }
  // 2. Urgent 1-move bridge block against Amber (Amber = 1)
  if (Math.random() < .35 + .65 * skill) {
    let block = -1, threats = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (nb[i] !== 0) continue;
      nb[i] = 1;
      if (hasBridge(nb, 1)) { block = i; threats++; }
      nb[i] = 0;
    }
    if (threats === 1) return block;
    if (threats > 1) return block; // block at least one threat
  }
  return -1;
}

const toBoard = (u, v) => ({ x: u * CA - v * SA, z: u * SA + v * CA });
const toMap = (x, z) => ({ u: x * CA + z * SA, v: -x * SA + z * CA });

function make(api) {
  const dial = new Dial(api, { name: 'hex-bridge', start: .65, target: .55, range: [.3, .95] });
  const K = gs.tweak('Feel', {
    think: [.22, .08, .5, 'seconds MCTS thinks per move'],
    wait: [.45, .15, 1.0, 'minimum pause before Bramble replies'],
    drop: [.32, .15, .6, 'seconds for a stone to drop into its well'],
  });
  const stripPlayers = [{ name: WHO[0].name, col: AMBER, score: 0 }, { name: WHO[1].name, col: JADE, score: 0 }];

  let T, map, cellPts, stones, amberMat, jadeMat, amberLit, jadeLit, lastRings, cursorRing;
  let s, state, winChain, lastMove, lastWho, pendingReply, kq, kr, showCursor;

  function setup() {
    T = new Table(api, { span: 9.2, room: 'study', pitch: 58, yaw: 0, frame: [8.8, 8.8] });
    map = new HexMap({ size: HEX_R, pointy: true, shape: 'none' });
    for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) map.add(q, r);
    map.centre(0, 0);

    cellPts = new Array(TOTAL);
    for (let r = 0; r < N; r++) {
      for (let q = 0; q < N; q++) {
        const i = r * N + q, cell = map.cell(q, r);
        cell.data.i = i;
        const p = toBoard(cell.x, cell.y);
        cellPts[i] = { x: p.x, y: .04, z: p.z };
      }
    }

    // Walnut & ivory 7x7 rhombus board with Warm Amber & Cool Jade border rails
    T.board.add(slab({
      w: 8.6, d: 8.6, rim: .25, thick: .36, wood: '#5b3922',
      paint(g, S) {
        const c = g.col, h = g.h, rg = g.r;
        const X = x => (x / 8.6 + .5) * S, Y = z => (z / 8.6 + .5) * S;
        // Rich walnut wood base + organic grain
        c.fillStyle = '#5e3b23'; c.fillRect(0, 0, S, S);
        for (let i = 0; i < 360; i++) {
          c.strokeStyle = Math.random() < .55 ? '#462a17' : '#764d2f';
          c.globalAlpha = .14 + Math.random() * .2;
          c.lineWidth = 1 + Math.random() * 2.2;
          const y = Math.random() * S;
          c.beginPath(); c.moveTo(0, y);
          c.bezierCurveTo(S * .3, y + 7, S * .65, y - 7, S, y + 3);
          c.stroke();
        }
        c.globalAlpha = 1;
        h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
        rg.fillStyle = '#707070'; rg.fillRect(0, 0, S, S);

        // Diamond border coordinates (exact 30° slope hugging the 7x7 hex cells)
        const s3 = Math.sqrt(3);
        const xIn = 10.65 * HEX_R, zIn = (10.65 / s3) * HEX_R;
        const xOut = 12.2 * HEX_R, zOut = (12.2 / s3) * HEX_R;
        const L0 = [X(-xIn), Y(0)], T0 = [X(0), Y(-zIn)], R0 = [X(xIn), Y(0)], B0 = [X(0), Y(zIn)];
        const L1 = [X(-xOut), Y(0)], T1 = [X(0), Y(-zOut)], R1 = [X(xOut), Y(0)], B1 = [X(0), Y(zOut)];

        // Decorative brass/ivory inlay lines in upper and lower walnut aprons
        c.strokeStyle = '#c8a66a'; c.lineWidth = S * .004; c.globalAlpha = .45;
        c.strokeRect(S * .045, S * .045, S * .91, S * .91);
        c.globalAlpha = 1;

        // Recessed dark walnut bed inside the diamond
        c.fillStyle = '#2d1a0d';
        c.beginPath(); c.moveTo(...L0); c.lineTo(...T0); c.lineTo(...R0); c.lineTo(...B0); c.closePath(); c.fill();
        h.fillStyle = '#4c4c4c';
        h.beginPath(); h.moveTo(...L0); h.lineTo(...T0); h.lineTo(...R0); h.lineTo(...B0); h.closePath(); h.fill();

        // Four beveled border rails: Amber (Top-Left r=0, Bottom-Right r=6), Jade (Bottom-Left q=0, Top-Right q=6)
        const drawRail = (a0, b0, b1, a1, col, hi) => {
          c.fillStyle = col;
          c.beginPath(); c.moveTo(...a0); c.lineTo(...b0); c.lineTo(...b1); c.lineTo(...a1); c.closePath(); c.fill();
          c.strokeStyle = hi; c.lineWidth = S * .005; c.stroke();
          h.fillStyle = '#b4b4b4';
          h.beginPath(); h.moveTo(...a0); h.lineTo(...b0); h.lineTo(...b1); h.lineTo(...a1); h.closePath(); h.fill();
          rg.fillStyle = '#383838';
          rg.beginPath(); rg.moveTo(...a0); rg.lineTo(...b0); rg.lineTo(...b1); rg.lineTo(...a1); rg.closePath(); rg.fill();
        };
        drawRail(L0, T0, T1, L1, AMBER, '#ffd076'); // Top-Left: Amber (r === 0)
        drawRail(B0, R0, R1, B1, AMBER, '#ffd076'); // Bottom-Right: Amber (r === 6)
        drawRail(L0, B0, B1, L1, JADE, '#6be0d5');  // Bottom-Left: Jade (q === 0)
        drawRail(T0, R0, R1, T1, JADE, '#6be0d5');  // Top-Right: Jade (q === 6)

        // Miter corner caps separating Amber and Jade borders cleanly
        c.fillStyle = '#d8b468';
        for (const [vx, vz] of [[-xOut * .93, 0], [xOut * .93, 0], [0, -zOut * .93], [0, zOut * .93]]) {
          c.beginPath(); c.arc(X(vx), Y(vz), S * .014, 0, Math.PI * 2); c.fill();
        }

        // 49 inlaid ivory hex tiles with recessed stone wells
        const wellPx = HEX_R * .52 / 8.6 * S;
        for (let r = 0; r < N; r++) {
          for (let q = 0; q < N; q++) {
            const cell = map.cell(q, r), ctr = toBoard(cell.x, cell.y);
            const cx = X(ctr.x), cy = Y(ctr.z);
            c.beginPath();
            h.beginPath();
            rg.beginPath();
            cell.corners.forEach(([ux, uy], k) => {
              const bx = cell.x + (ux - cell.x) * .92, by = cell.y + (uy - cell.y) * .92;
              const p = toBoard(bx, by);
              const px = X(p.x), py = Y(p.z);
              if (k === 0) { c.moveTo(px, py); h.moveTo(px, py); rg.moveTo(px, py); }
              else { c.lineTo(px, py); h.lineTo(px, py); rg.lineTo(px, py); }
            });
            c.closePath(); h.closePath(); rg.closePath();

            // Subtle warm ivory gradient per hex tile
            const gr = c.createRadialGradient(cx, cy, wellPx * .2, cx, cy, HEX_R / 8.6 * S);
            gr.addColorStop(0, '#f5ebd6'); gr.addColorStop(1, IVORY_EDGE);
            c.fillStyle = gr; c.fill();

            // Border indicator accent dots on the edge hexes
            if (r === 0 || r === N - 1) {
              c.strokeStyle = AMBER; c.lineWidth = S * .0035; c.globalAlpha = .55; c.stroke(); c.globalAlpha = 1;
            } else if (q === 0 || q === N - 1) {
              c.strokeStyle = JADE; c.lineWidth = S * .0035; c.globalAlpha = .55; c.stroke(); c.globalAlpha = 1;
            } else {
              c.strokeStyle = '#9b835b'; c.lineWidth = S * .0022; c.stroke();
            }

            h.fillStyle = '#9c9c9c'; h.fill();
            rg.fillStyle = '#525252'; rg.fill();

            // Circular stone seat dimple in center of each hex
            c.fillStyle = '#d4c29e';
            c.beginPath(); c.arc(cx, cy, wellPx, 0, Math.PI * 2); c.fill();
            h.fillStyle = '#626262';
            h.beginPath(); h.arc(cx, cy, wellPx, 0, Math.PI * 2); h.fill();
          }
        }
      },
    }));

    // Pre-make materials & 49 pooled stone meshes ONCE in setup (zero mid-play allocations/compiles)
    amberMat = pbr(AMBER, { rough: .06, metal: .12 });
    jadeMat = pbr(JADE, { rough: .06, metal: .12 });
    amberLit = pbr(AMBER, { rough: .05, metal: .12, glow: 1.55 });
    jadeLit = pbr(JADE, { rough: .05, metal: .12, glow: 1.55 });

    stones = new Array(TOTAL);
    for (let i = 0; i < TOTAL; i++) {
      const m = stone(amberMat, { r: .235 });
      const p = cellPts[i];
      m.position.set(p.x, REST_Y, p.z);
      m.visible = false;
      T.board.add(m);
      stones[i] = m;
    }

    lastRings = [
      ring(AMBER, { r: .28, w: .024, glow: 1.2 }),
      ring(JADE, { r: .28, w: .024, glow: 1.2 }),
    ];
    for (const r of lastRings) { r.visible = false; T.board.add(r); }

    cursorRing = ring('#fff6d6', { r: .26, w: .02, glow: 1.3 });
    cursorRing.visible = false;
    T.board.add(cursorRing);
  }

  function syncBoard() {
    for (let i = 0; i < TOTAL; i++) {
      const v = s.b[i], m = stones[i];
      m.position.y = REST_Y;
      m.scale.set(1, .62, 1);
      if (v === 0) { m.visible = false; }
      else { m.material = v === 1 ? amberMat : jadeMat; m.visible = true; }
    }
    for (const r of lastRings) r.visible = false;
    if (lastMove >= 0 && lastWho >= 0) {
      const p = cellPts[lastMove], r = lastRings[lastWho];
      r.position.set(p.x, .025, p.z);
      r.visible = true;
    }
  }

  function tellScores() {
    const a = spanScore(s.b, 1), j = spanScore(s.b, 2);
    stripPlayers[0].score = a;
    stripPlayers[1].score = j;
    api.score(a);
  }

  function saveState() {
    api.save({ b: s.b.join('') });
  }

  async function placeStone(i) {
    const who = s.t;
    s = play(s, i);
    lastMove = i; lastWho = who;
    const m = stones[i];
    m.material = who === 0 ? amberMat : jadeMat;
    m.position.y = REST_Y;
    m.scale.set(1, .62, 1);
    for (const r of lastRings) r.visible = false;
    await T.drop(m, { from: 2.1, time: K.drop });
    const p = cellPts[i];
    lastRings[who].position.set(p.x, .025, p.z);
    lastRings[who].visible = state !== 'done';
    T.puff({ x: p.x, y: .08, z: p.z }, { col: WHO[who].col, n: 8, speed: 1.1, size: .18, up: .4 });
    sounds.clink(1.1);
    haptic(who ? 'light' : 'medium');
    tellScores();
  }

  async function finish() {
    state = 'done';
    for (const r of lastRings) r.visible = false;
    winChain = winningChain(s.b, s.win + 1);
    const mat = s.win === 0 ? amberLit : jadeLit;
    for (const i of winChain) stones[i].material = mat;
    if (winChain.length) {
      const mid = cellPts[winChain[winChain.length >> 1]];
      T.puff({ x: mid.x, y: .2, z: mid.z }, { col: WHO[s.win].col, glow: true, n: 24, speed: 2.1, up: 1.5, size: .2 });
    }
    dial.result(s.win === 0);
    if (s.win === 0) {
      sounds.gong(); haptic('success');
      stripPlayers[0].score = 7;
      api.score(7);
      api.win();
    } else {
      sounds.thud(1.2); haptic('error');
    }
    await T.wait(1.9);
    api.clearSave();
    T.stop();
    api.over();
  }

  async function aiReply() {
    state = 'busy';
    pendingReply = false;
    let reply = tacticalMove(s, dial.skill);
    if (reply >= 0) {
      await T.wait(K.wait);
    } else {
      reply = await T.think(brain, s, { mode: 'mcts', time: Math.round(K.think * 1000), skill: dial, wait: K.wait, slice: 1.4 });
    }
    if (reply == null || reply < 0 || s.b[reply] !== 0) {
      const open = moves(s);
      reply = open.length ? open[0] : -1;
    }
    if (reply >= 0) await placeStone(reply);
    if (s.win >= 0) return finish();
    saveState();
    state = 'you';
  }

  async function turn(i) {
    state = 'busy';
    await placeStone(i);
    if (s.win >= 0) return finish();
    saveState();
    await aiReply();
  }

  function pickCell(x, y) {
    const p = T.pick(x, y);
    if (p) {
      const { u, v } = toMap(p.x, p.z);
      const cell = map.at(u, v);
      if (cell) return cell.data.i;
    }
    return T.nearest(x, y, cellPts, 28);
  }

  function tryPlace(i) {
    if (i == null || i < 0 || i >= TOTAL) return;
    if (s.b[i] !== 0) {
      haptic('warning'); sounds.thud(.45);
      T.say('Occupied');
      return;
    }
    T.run(() => turn(i));
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const saved = api.load(null);
      const validStr = saved && typeof saved.b === 'string' && /^[012]{49}$/.test(saved.b);
      let loaded = null, ones = 0, twos = 0;
      if (validStr) {
        loaded = new Uint8Array(TOTAL);
        for (let i = 0; i < TOTAL; i++) {
          const v = Number(saved.b[i]);
          loaded[i] = v;
          if (v === 1) ones++;
          else if (v === 2) twos++;
        }
        if ((ones !== twos && ones !== twos + 1) || hasBridge(loaded, 1) || hasBridge(loaded, 2)) loaded = null;
      }
      pendingReply = !!(loaded && ones === twos + 1);
      s = { b: loaded || new Uint8Array(TOTAL), t: pendingReply ? 1 : 0, win: -1 };
      state = 'you';
      winChain = null;
      lastMove = -1; lastWho = -1;
      kq = 3; kr = 3; showCursor = false;
      cursorRing.visible = false;
      syncBoard();
      tellScores();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      if (lastMove >= 0 && lastWho >= 0 && state !== 'done') {
        lastRings[lastWho].scale.setScalar(1 + Math.sin(T.t * 4) * .05);
      }
      if (showCursor && state === 'you' && !T.busy) {
        const p = cellPts[kr * N + kq];
        cursorRing.position.set(p.x, .03, p.z);
        cursorRing.visible = true;
        cursorRing.scale.setScalar(1 + Math.sin(T.t * 6) * .06);
      } else {
        cursorRing.visible = false;
      }
      if (state === 'done' && winChain) {
        const mat = s.win === 0 ? amberLit : jadeLit;
        mat.emissiveIntensity = 1.15 + Math.sin(T.t * 7) * .55;
      }
    },
    draw(c) {
      T.draw(c, W, H);
      const y = T.strip(c, W, stripPlayers, state === 'done' ? -1 : (state === 'you' && !pendingReply) ? 0 : 1);
      const msg = state === 'done'
        ? (s.win === 0 ? 'Amber bridge complete. You win!' : 'Bramble bridged the jade borders')
        : pendingReply ? 'Tap board to continue'
        : state === 'you' ? 'Tap an open hex to bridge Amber'
        : s.t === 1 ? 'Bramble is thinking…' : '';
      T.status(c, W, y, msg);
      T.hud(c, W, H);
    },
    down(x, y, id) { showCursor = false; T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id);
      if (!tap || tap.chip || state !== 'you' || T.busy) return;
      if (pendingReply) { T.run(() => aiReply()); return; }
      tryPlace(pickCell(tap.x, tap.y));
    },
    key(k, isDown) {
      if (!isDown || state !== 'you' || T.busy) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { kq = Math.max(0, kq - 1); showCursor = true; }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { kq = Math.min(N - 1, kq + 1); showCursor = true; }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { kr = Math.max(0, kr - 1); showCursor = true; }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { kr = Math.min(N - 1, kr + 1); showCursor = true; }
      else if (k === 'Enter' || k === ' ') {
        if (pendingReply) { T.run(() => aiReply()); return; }
        showCursor = true;
        tryPlace(kr * N + kq);
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'hex-bridge',
  title: 'Hex Bridge',
  tag: 'Board · Strategy',
  retro: true, era: 'board', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  music: { mood: 'calm', vol: .5 },
  goal: 7,
  hint: 'Tap any open hex to drop an Amber stone. Link the top-left and bottom-right Amber borders in an unbroken chain before Bramble connects the Jade borders. Drag to look round, or tap AR.',
  creator: 'Antigravity',
  make,
};
