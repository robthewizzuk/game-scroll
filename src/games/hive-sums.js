// Hive Sums: honeycomb arithmetic and inequality logic puzzle. Fill every blank hex with 1-4 so
// each colored cage hits its target sum with no repeats, each horizontal row has no repeats, and
// every < / > bridge holds. 3 Wax Seal mistakes ends the round; clear 5 hives to win.
import gs from '../gamescroll.js';

const { C16 } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { HexMap } = gs.hex;
const { Puzzle } = gs.solve;
const { rng } = gs.math;
const { text, sprite } = gs.pixel;
const { sfx, notes, sounds } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;

let W = 160, H = 176;

// 14-cell symmetric 3-4-3-4 honeycomb in axial (q, r) coordinates
const COORDS = [
  [0, 0], [1, 0], [2, 0],
  [-1, 1], [0, 1], [1, 1], [2, 1],
  [-1, 2], [0, 2], [1, 2],
  [-2, 3], [-1, 3], [0, 3], [1, 3],
];
const IDS = COORDS.map((_, i) => i);
const ROWS = [0, 1, 2, 3].map(rw => COORDS.map(([, r], i) => (r === rw ? i : -1)).filter(i => i >= 0));

// 5 distinct high-contrast C16 cage fills (all read cleanly with dark ink clues and outlined white entries)
const CAGE_COLS = [C16[4], C16[7], C16[10], C16[5], C16[3]];
const BG_COL = C16[12];
const WOOD_COL = C16[11];
const INK = C16[0];
const CREAM = C16[1];
const ERR_COL = C16[2];
const HINT_COL = C16[6];

// Pixel art definitions (sprites constructed on first make() so Node metadata import succeeds)
const SEAL_ON_ART = `
.kkkkk.
krrrrrk
krwrrrk
krrrrrk
krrrrrk
.krrrk.
..kkk..`;
const SEAL_OFF_ART = `
.kkkkk.
kdddddk
kdkdddk
kddkddk
kdddkdk
.kdddk.
..kkk..`;
const BEE_ART = `
..w.w..
.kkykk.
kykykyk
.kkykk.
..k.k..`;
let SEAL_ON = null, SEAL_OFF = null, BEE = null;

// 5x5 pixel chevron bitmaps for '<' and '>' bridges
const CHEV_LT = [
  [0, 0, 0, 1, 1],
  [0, 1, 1, 0, 0],
  [1, 1, 0, 0, 0],
  [0, 1, 1, 0, 0],
  [0, 0, 0, 1, 1],
];
const CHEV_GT = [
  [1, 1, 0, 0, 0],
  [0, 0, 1, 1, 0],
  [0, 0, 0, 1, 1],
  [0, 0, 1, 1, 0],
  [1, 1, 0, 0, 0],
];

// Fallback pre-verified seed if random search ever misses
const FALLBACK_SEEDS = [104729, 224737, 350377];

function make(api) {
  SEAL_ON ||= sprite(SEAL_ON_ART, { k: INK, r: ERR_COL, w: CREAM });
  SEAL_OFF ||= sprite(SEAL_OFF_ART, { k: INK, d: WOOD_COL });
  BEE ||= sprite(BEE_ART, { k: INK, y: C16[4], w: CREAM });

  const feel = new Feel({ pixel: true });
  const ready = new Ready({ eat: false });

  const K = gs.tweak('Feel', {
    seals: [3, 1, 5, 'wax seal lives before game over'],
    hints: [2, 0, 5, 'logic hints allowed per run'],
    gates: [3, 2, 4, 'inequality bridges per hive'],
    cages: [5, 4, 5, 'preferred cage count per hive'],
  });

  let map, board, sel, score, mistakes, hintsLeft, t, runSeed;
  let clearT, endT, ended, wonRun;
  let flashCell, flashT, hintCell, hintVal, hintT;
  let msg, msgCol, msgT;
  let btnDown, btnFlashT;
  let btns = [];

  function layoutButtons() {
    const hw = 28;
    const gap = 3;
    const bw = Math.floor((W - 8 - hw - gap * 4) / 4);
    const totalW = bw * 4 + hw + gap * 4;
    const x0 = Math.round((W - totalW) / 2);
    const by = H - 35;
    btns = [];
    for (let i = 0; i < 4; i++) btns.push({ x: x0 + i * (bw + gap), y: by, w: bw, h: 28, val: i + 1, kind: 'num' });
    btns.push({ x: x0 + 4 * (bw + gap), y: by, w: hw, h: 28, val: 0, kind: 'hint' });
  }

  function buildGeometry() {
    const size = Math.min(15, Math.floor((H - 80) / 6.5));
    map = new HexMap({ size, shape: 'none', pointy: true });
    COORDS.forEach(([q, r], i) => {
      const c = map.add(q, r);
      c.data.id = i;
      c.data.row = r;
    });
    map.centre(Math.round(W / 2), Math.round(H * 0.42));
  }

  function cacheVisuals() {
    // Map each cell to its cage object and precompute edges, cage badges, row rails, and gate bridges
    const cellCage = new Array(IDS.length);
    for (const cg of board.cages) for (const id of cg.ids) cellCage[id] = cg;

    board.edges = [];
    for (const c of map.list) {
      const id = c.data.id;
      const myCage = cellCage[id];
      const nbrs = map.neighbours(c);
      for (let i = 0; i < 6; i++) {
        const p0 = c.corners[i], p1 = c.corners[(i + 1) % 6];
        const mx = (p0[0] + p1[0]) * 0.5, my = (p0[1] + p1[1]) * 0.5;
        let sameCage = false;
        let otherId = -1;
        for (const n of nbrs) {
          if (Math.hypot((n.x + c.x) * 0.5 - mx, (n.y + c.y) * 0.5 - my) < map.size * 0.4) {
            otherId = n.data.id;
            sameCage = cellCage[otherId] === myCage;
            break;
          }
        }
        // Only store inner seams once (id < otherId) and outer cage borders once per shared edge or rim
        if (otherId < 0 || id < otherId || !sameCage) {
          board.edges.push({
            x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1],
            border: !sameCage,
          });
        }
      }
    }

    // Badge at top-leftmost cell of each cage
    for (const cg of board.cages) {
      let anchor = null;
      for (const id of cg.ids) {
        const c = map.cell(...COORDS[id]);
        if (!anchor || c.y < anchor.y - 1 || (Math.abs(c.y - anchor.y) <= 1 && c.x < anchor.x)) anchor = c;
      }
      cg.bx = Math.round(anchor.x - 8);
      cg.by = Math.round(anchor.y - 12);
      cg.sumStr = String(cg.sum);
    }

    // Row lane rails
    board.rails = ROWS.map(row => {
      let minX = Infinity, maxX = -Infinity, y = 0;
      for (const id of row) {
        const c = map.cell(...COORDS[id]);
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        y = c.y;
      }
      return { x0: Math.round(minX - map.size * 1.15), x1: Math.round(maxX + map.size * 1.15), y: Math.round(y) };
    });

    // Horizontal gate positions
    for (const g of board.gates) {
      const ca = map.cell(...COORDS[g.a]), cb = map.cell(...COORDS[g.b]);
      g.mx = Math.round((ca.x + cb.x) * 0.5);
      g.my = Math.round((ca.y + cb.y) * 0.5);
    }
  }

  function tryGenerate(seed, hiveIdx) {
    const r = rng(seed);
    const keepMin = hiveIdx === 0 ? 4 : hiveIdx === 1 ? 3 : 2;
    const wantGates = clamp(Math.round(K.gates), 2, 4);
    const preferFive = Math.round(K.cages) >= 5;
    let best = null;

    for (let attempt = 0; attempt < 32; attempt++) {
      const cages = [];
      const free = new Set(IDS);
      let ok = true;
      while (free.size) {
        const rem = free.size;
        let target;
        if (rem <= 4) target = rem;
        else if (rem === 5) target = 2;
        else target = preferFive ? r.int(2, Math.min(3, rem - 2)) : r.int(2, Math.min(4, rem - 2));

        const seeds = [...free];
        seeds.sort((a, b) => {
          const na = map.neighbours(map.cell(...COORDS[a])).filter(n => free.has(n.data.id)).length;
          const nb = map.neighbours(map.cell(...COORDS[b])).filter(n => free.has(n.data.id)).length;
          return na - nb;
        });
        const start = seeds[0];
        const cg = [start];
        free.delete(start);
        while (cg.length < target) {
          const frontier = [];
          for (const id of cg) {
            for (const n of map.neighbours(map.cell(...COORDS[id]))) {
              if (free.has(n.data.id) && !frontier.includes(n.data.id)) frontier.push(n.data.id);
            }
          }
          if (!frontier.length) break;
          const pick = r.pick(frontier);
          cg.push(pick);
          free.delete(pick);
        }
        if (cg.length < 2) { ok = false; break; }
        cages.push(cg);
      }
      if (!ok || cages.length > 5) continue;

      const puz = new Puzzle();
      for (const id of IDS) puz.cell(id, [1, 2, 3, 4]);
      for (const row of ROWS) puz.allDiff(row);
      for (const cg of cages) puz.allDiff(cg);

      const { solution } = puz.solve({ rng: r });
      if (!solution) continue;

      const cageMeta = cages.map((ids, idx) => {
        const sum = ids.reduce((s, id) => s + solution[id], 0);
        puz.sum(ids, sum);
        return { ids, sum, idx };
      });

      const horizPairs = [];
      for (const id of IDS) {
        const [q, rw] = COORDS[id];
        const right = map.cell(q + 1, rw);
        if (right) horizPairs.push([id, right.data.id]);
      }
      r.shuffle(horizPairs);
      const gates = horizPairs.slice(0, wantGates).map(([a, b]) => {
        const lt = solution[a] < solution[b];
        puz.rule([a, b], ([va, vb]) => (lt ? va < vb : va > vb));
        return { a, b, lt };
      });

      const clues = puz.carve(solution, { rng: r, grade: 'easy', keep: keepMin });
      const open = IDS.length - Object.keys(clues).length;
      const gr = puz.grade(clues);
      if (gr.level === 'easy' && puz.unique(clues)) {
        const candidate = { puz, sol: solution, clues, cages: cageMeta, gates, open };
        if (!best || open > best.open) best = candidate;
        if (open >= 8) break;
      }
    }
    return best;
  }

  function loadHive(hiveIdx) {
    let gen = null;
    for (let off = 0; off < 6 && !gen; off++) {
      gen = tryGenerate(runSeed + hiveIdx * 7919 + off * 313, hiveIdx);
    }
    if (!gen) gen = tryGenerate(FALLBACK_SEEDS[hiveIdx % FALLBACK_SEEDS.length], hiveIdx);

    // Shuffle cage palette per hive so every board looks fresh
    const pal = rng(runSeed + hiveIdx * 97 + 11).shuffle([...CAGE_COLS]);
    const cellCageIdx = new Array(IDS.length);
    gen.cages.forEach((cg, i) => {
      cg.color = pal[i % pal.length];
      for (const id of cg.ids) cellCageIdx[id] = i;
    });

    const values = new Array(IDS.length).fill(0);
    const given = new Array(IDS.length).fill(false);
    for (const [k, v] of Object.entries(gen.clues)) {
      const id = +k;
      values[id] = v;
      given[id] = true;
    }

    board = {
      puz: gen.puz,
      sol: gen.sol,
      clues: gen.clues,
      moves: {},
      cages: gen.cages,
      cellCageIdx,
      gates: gen.gates,
      values,
      given,
      edges: [],
      rails: [],
    };
    cacheVisuals();
    sel = -1;
    hintCell = -1;
    hintVal = 0;
    hintT = 0;
    flashCell = -1;
    flashT = 0;
    clearT = 0;
  }

  function showMsg(txt, col = CREAM, dur = 1.6) {
    msg = txt;
    msgCol = col;
    msgT = dur;
  }

  function diagnoseWrong(id, val) {
    const rw = COORDS[id][1];
    for (const oid of ROWS[rw]) {
      if (oid !== id && board.values[oid] === val) return 'ROW REPEAT!';
    }
    const cg = board.cages[board.cellCageIdx[id]];
    for (const oid of cg.ids) {
      if (oid !== id && board.values[oid] === val) return 'CAGE REPEAT!';
    }
    let filledSum = val, openCount = 0;
    for (const oid of cg.ids) {
      if (oid === id) continue;
      if (board.values[oid]) filledSum += board.values[oid];
      else openCount++;
    }
    if (filledSum > cg.sum || (openCount === 0 && filledSum !== cg.sum)) return 'CAGE SUM!';
    for (const g of board.gates) {
      if (g.a === id) {
        const vb = board.values[g.b];
        if ((g.lt && (val === 4 || (vb && val >= vb))) || (!g.lt && (val === 1 || (vb && val <= vb)))) return 'ARROW RULE!';
      } else if (g.b === id) {
        const va = board.values[g.a];
        if ((g.lt && (val === 1 || (va && va >= val))) || (!g.lt && (val === 4 || (va && va <= val)))) return 'ARROW RULE!';
      }
    }
    return 'BREAKS LOGIC!';
  }

  function nextEmptyFrom(fromId) {
    for (let off = 1; off <= IDS.length; off++) {
      const nid = (fromId + off) % IDS.length;
      if (!board.values[nid]) return nid;
    }
    return -1;
  }

  function enterDigit(val) {
    if (ended || clearT > 0) return;
    if (sel < 0 || board.values[sel]) {
      sfx(220, 0.03, 'triangle', 0.02);
      showMsg('TAP AN EMPTY HEX', C16[4], 1.1);
      return;
    }

    const cell = map.cell(...COORDS[sel]);
    if (val === board.sol[sel]) {
      board.values[sel] = val;
      board.moves[sel] = val;
      if (hintCell === sel) { hintCell = -1; hintVal = 0; hintT = 0; }
      flashCell = -1;
      flashT = 0;
      feel.coin(cell.x, cell.y);
      sfx(460 + val * 90, 0.045, 'triangle', 0.035);
      haptic('light');

      // Check if hive is complete
      if (board.values.every(Boolean)) {
        score++;
        api.score(score);
        wonRun = score >= 5;
        clearT = 0.95;
        sel = -1;
        feel.win(W / 2, Math.round(H * 0.42));
        notes('C5 E5 G5 C6', { len: 0.055 });
        haptic('success');
        showMsg(wonRun ? 'ALL HIVES FULL!' : `HIVE ${score}/5 CLEAR!`, C16[4], 1.1);
      } else {
        sel = nextEmptyFrom(sel);
        const cg = board.cages[board.cellCageIdx[sel]];
        showMsg(`CAGE SUM ${cg.sum}`, CREAM, 1.0);
      }
    } else {
      mistakes++;
      flashCell = sel;
      flashT = 0.55;
      feel.hurt(cell.x, cell.y);
      feel.juice.shake(3);
      sounds.buzzer();
      haptic('error');
      const reason = diagnoseWrong(sel, val);
      showMsg(reason, ERR_COL, 1.4);

      if (mistakes >= Math.round(K.seals)) {
        ended = true;
        endT = 0.65;
        feel.lose();
        showMsg('SEALS BROKEN!', ERR_COL, 1.2);
      }
    }
  }

  function triggerHint() {
    if (ended || clearT > 0) return;
    if (hintsLeft <= 0) {
      sounds.deny();
      haptic('tick');
      showMsg('NO HINTS LEFT', ERR_COL, 1.1);
      return;
    }
    const h = board.puz.hint(board.clues, board.moves);
    if (!h || h.id == null) return;
    hintsLeft--;
    sel = +h.id;
    hintCell = sel;
    hintVal = h.value;
    hintT = 2.6;
    const cell = map.cell(...COORDS[sel]);
    feel.juice.burst(cell.x, cell.y, { n: 8, speed: 35, life: 0.35, size: 2, color: [C16[4], CREAM] });
    sounds.twinkle();
    haptic('medium');
    const whyTxt = h.why === 'only' ? 'ONLY FIT HERE' : h.why === 'last' ? 'LAST SPOT IN ROW/CAGE' : h.why === 'sum' ? 'CHECK CAGE SUM' : h.why === 'rule' ? 'CHECK ARROW GATE' : 'TRY THIS HEX';
    showMsg(whyTxt, C16[7], 2.2);
  }

  function moveSel(dx, dy) {
    const empties = IDS.filter(i => !board.values[i]);
    if (!empties.length) return;
    if (sel < 0 || board.values[sel]) {
      sel = empties[0];
      sfx(520, 0.025, 'square', 0.015);
      return;
    }
    const cur = map.cell(...COORDS[sel]);
    let bestId = -1, bestScore = Infinity;
    for (const id of empties) {
      if (id === sel) continue;
      const c = map.cell(...COORDS[id]);
      const vx = c.x - cur.x, vy = c.y - cur.y;
      const dot = vx * dx + vy * dy;
      if (dot <= 2) continue;
      const dist = Math.hypot(vx, vy);
      const align = dot / dist;
      const sc = dist / Math.max(0.25, align);
      if (sc < bestScore) { bestScore = sc; bestId = id; }
    }
    if (bestId >= 0) {
      sel = bestId;
      sfx(560, 0.025, 'square', 0.015);
      haptic('tick');
    }
  }

  function drawChevron(c, x, y, lt) {
    const bmp = lt ? CHEV_LT : CHEV_GT;
    c.fillStyle = INK;
    c.fillRect(x - 4, y - 4, 9, 9);
    c.fillStyle = WOOD_COL;
    c.fillRect(x - 3, y - 3, 7, 7);
    c.fillStyle = C16[4];
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < 5; col++) {
        if (bmp[r][col]) c.fillRect(x - 2 + col, y - 2 + r, 1, 1);
      }
    }
  }

  function drawHexPoly(c, corners, inset = 0, cx = 0, cy = 0) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      let px = corners[i][0], py = corners[i][1];
      if (inset > 0) {
        const dx = px - cx, dy = py - cy;
        const d = Math.hypot(dx, dy) || 1;
        px -= (dx / d) * inset;
        py -= (dy / d) * inset;
      }
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  layoutButtons();
  buildGeometry();

  return {
    reset() {
      score = 0;
      mistakes = 0;
      hintsLeft = Math.round(K.hints);
      t = 0;
      clearT = 0;
      endT = 0;
      ended = false;
      wonRun = false;
      btnDown = -1;
      btnFlashT = 0;
      msg = '';
      msgCol = CREAM;
      msgT = 0;
      runSeed = 1 + Math.floor(Math.random() * 9999999);
      feel.clear();
      ready.reset();
      layoutButtons();
      buildGeometry();
      loadHive(0);
    },

    resize(w, h) {
      W = w;
      H = h;
      layoutButtons();
      buildGeometry();
      if (board) cacheVisuals();
    },

    update(dt) {
      feel.update(dt);
      if (feel.frozen) return;
      if (!ready.update(dt)) return;
      t += dt;
      if (flashT > 0) flashT = Math.max(0, flashT - dt);
      if (hintT > 0) { hintT = Math.max(0, hintT - dt); if (hintT === 0) { hintCell = -1; hintVal = 0; } }
      if (msgT > 0) msgT = Math.max(0, msgT - dt);
      if (btnFlashT > 0) { btnFlashT = Math.max(0, btnFlashT - dt); if (btnFlashT === 0) btnDown = -1; }

      if (ended) {
        endT -= dt;
        if (endT <= 0) { endT = 99; api.over(); }
        return;
      }
      if (clearT > 0) {
        clearT -= dt;
        if (clearT <= 0) {
          if (wonRun) { api.win(); wonRun = false; }
          else loadHive(score);
        }
      }
    },

    fx(dt) {
      feel.update(dt);
    },

    draw(c) {
      // Warm hive backdrop
      c.fillStyle = BG_COL;
      c.fillRect(0, 0, W, H);
      c.fillStyle = WOOD_COL;
      c.fillRect(0, 0, W, 19);
      c.fillRect(0, H - 39, W, 39);
      c.fillStyle = INK;
      c.fillRect(0, 19, W, 1);
      c.fillRect(0, H - 39, W, 1);

      // Subtle comb texture dots on the board area
      c.fillStyle = '#582e18';
      for (let py = 24; py < H - 42; py += 12) {
        const off = ((py / 12) & 1) * 8;
        for (let px = 6 + off; px < W - 4; px += 16) c.fillRect(px, py, 2, 2);
      }

      feel.begin(c);

      // Row no-repeat lane rails behind the honeycomb
      for (const rail of board.rails) {
        c.fillStyle = WOOD_COL;
        c.fillRect(rail.x0, rail.y - 1, rail.x1 - rail.x0, 2);
        c.fillStyle = C16[4];
        c.fillRect(rail.x0 - 1, rail.y - 1, 2, 2);
        c.fillRect(rail.x1 - 1, rail.y - 1, 2, 2);
      }

      // Draw hex cells
      const pulse = Math.sin(t * 7) > 0;
      for (const cell of map.list) {
        const id = cell.data.id;
        const cg = board.cages[board.cellCageIdx[id]];
        const isSel = id === sel;
        const isErr = id === flashCell && flashT > 0 && Math.floor(flashT * 18) % 2 === 0;
        const isHint = id === hintCell && hintT > 0;

        drawHexPoly(c, cell.corners);
        c.fillStyle = isErr ? ERR_COL : cg.color;
        c.fill();

        if (isSel) {
          drawHexPoly(c, cell.corners, 2.5, cell.x, cell.y);
          c.fillStyle = CREAM;
          c.fill();
          drawHexPoly(c, cell.corners, 4.5, cell.x, cell.y);
          c.fillStyle = cg.color;
          c.fill();
        } else if (isHint && pulse) {
          drawHexPoly(c, cell.corners, 2.5, cell.x, cell.y);
          c.strokeStyle = HINT_COL;
          c.lineWidth = 2;
          c.stroke();
        }

        // Cell value
        const v = board.values[id];
        if (v) {
          const isGiven = board.given[id];
          text(c, String(v), Math.round(cell.x), Math.round(cell.y) - 2, {
            font: 'big',
            align: 'center',
            color: isGiven ? INK : CREAM,
            outline: isGiven ? null : INK,
          });
        } else if (isSel) {
          // Crisp empty cursor pip
          c.fillStyle = INK;
          c.fillRect(Math.round(cell.x) - 2, Math.round(cell.y) + 2, 4, 2);
        }
      }

      // Inner seams first, then thick dark outer cage borders
      c.lineCap = 'round';
      c.strokeStyle = WOOD_COL;
      c.lineWidth = 1;
      for (const e of board.edges) {
        if (e.border) continue;
        c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke();
      }
      c.strokeStyle = INK;
      c.lineWidth = 2;
      for (const e of board.edges) {
        if (!e.border) continue;
        c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke();
      }

      // Cage target sum badges
      for (const cg of board.cages) {
        const bw = cg.sum >= 10 ? 10 : 7;
        c.fillStyle = INK;
        c.fillRect(cg.bx - 1, cg.by - 1, bw, 7);
        text(c, cg.sumStr, cg.bx, cg.by, { font: 'small', color: C16[4] });
      }

      // Inequality bridges (< / >)
      for (const g of board.gates) drawChevron(c, g.mx, g.my, g.lt);

      feel.end(c, W, H);

      // Top HUD: keep clear of api.scoreArea() in the top center
      const totalSeals = Math.round(K.seals);
      const alive = Math.max(0, totalSeals - mistakes);
      for (let i = 0; i < totalSeals; i++) {
        (i < alive ? SEAL_ON : SEAL_OFF).draw(c, 4 + i * 9, 6);
      }

      // Top-right HUD: hive counter & remaining blanks
      const sa = api.scoreArea();
      const rightX = Math.max(Math.ceil(sa.x + sa.w) + 4, W - 46);
      if (rightX <= W - 26) {
        let leftCount = 0;
        for (let i = 0; i < board.values.length; i++) if (!board.values[i]) leftCount++;
        text(c, `H${Math.min(5, score + 1)}/5`, W - 4, 3, { font: 'small', align: 'right', color: C16[4], outline: INK });
        text(c, `${leftCount} OPEN`, W - 4, 10, { font: 'small', align: 'right', color: CREAM, outline: INK });
      }

      // Decorative bee bobbing smoothly when waiting or celebrating
      if (ready.waiting || clearT > 0) {
        const tt = ready.waiting ? ready.t : t;
        const bx = Math.round(W - 18 + Math.sin(tt * 4) * 3);
        const by = Math.round(24 + Math.cos(tt * 6) * 2);
        BEE.draw(c, bx, by);
      }

      // Status strip between honeycomb and keypad
      const statusY = H - 48;
      if (ready.waiting) {
        ready.draw(c, W, H, { pixel: true, text: 'TAP A HEX TO START', color: C16[4], y: statusY });
      } else if (msgT > 0 && msg) {
        text(c, msg, Math.round(W / 2), statusY, { font: 'small', align: 'center', color: msgCol, outline: INK });
      } else if (sel >= 0 && !board.values[sel]) {
        const cg = board.cages[board.cellCageIdx[sel]];
        let curSum = 0;
        for (const oid of cg.ids) curSum += board.values[oid];
        const info = curSum > 0 ? `CAGE ${curSum}/${cg.sum}  ·  ROW 1-4` : `CAGE SUM ${cg.sum}  ·  ROW 1-4`;
        text(c, info, Math.round(W / 2), statusY, { font: 'small', align: 'center', color: CREAM, outline: INK });
      } else if (t < 6) {
        text(c, 'TAP HEX, THEN 1-4', Math.round(W / 2), statusY, { font: 'small', align: 'center', color: C16[4], outline: INK });
      }

      // Bottom keypad (1-4 + HINT)
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        const pressed = btnDown === i && btnFlashT > 0;
        const dy = pressed ? 1 : 0;
        const isHintTarget = b.kind === 'num' && hintT > 0 && hintVal === b.val;
        const canHint = b.kind === 'hint' && hintsLeft > 0;

        c.fillStyle = INK;
        c.fillRect(b.x, b.y + dy, b.w, b.h);
        if (b.kind === 'num') {
          c.fillStyle = isHintTarget && pulse ? C16[4] : CREAM;
          c.fillRect(b.x + 1, b.y + 1 + dy, b.w - 2, b.h - 3);
          c.fillStyle = C16[4];
          c.fillRect(b.x + 1, b.y + 1 + dy, b.w - 2, 2);
          text(c, String(b.val), Math.round(b.x + b.w / 2), b.y + 9 + dy, { font: 'big', align: 'center', color: INK });
        } else {
          c.fillStyle = canHint ? C16[7] : C16[13];
          c.fillRect(b.x + 1, b.y + 1 + dy, b.w - 2, b.h - 3);
          c.fillStyle = canHint ? CREAM : C16[14];
          c.fillRect(b.x + 1, b.y + 1 + dy, b.w - 2, 2);
          text(c, 'HINT', Math.round(b.x + b.w / 2), b.y + 7 + dy, { font: 'small', align: 'center', color: INK });
          text(c, `x${hintsLeft}`, Math.round(b.x + b.w / 2), b.y + 15 + dy, { font: 'small', align: 'center', color: canHint ? CREAM : INK, outline: canHint ? INK : null });
        }
      }
    },

    down(x, y) {
      ready.go();
      if (ended || clearT > 0) return;

      // Check bottom keypad first
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 3 && y <= b.y + b.h + 2) {
          btnDown = i;
          btnFlashT = 0.12;
          if (b.kind === 'hint') triggerHint();
          else enterDigit(b.val);
          return;
        }
      }

      // Check honeycomb cell tap
      const cell = map.at(x, y);
      if (cell) {
        const id = cell.data.id;
        if (!board.values[id]) {
          sel = id;
          sfx(640, 0.03, 'triangle', 0.02);
          haptic('tick');
          const cg = board.cages[board.cellCageIdx[id]];
          showMsg(`CAGE SUM ${cg.sum}`, CREAM, 0.9);
        } else {
          sfx(240, 0.025, 'square', 0.015);
          haptic('tick');
        }
      }
    },

    move() {},
    up() {},

    key(k, isDown) {
      if (!isDown) return;
      if (ready.waiting && (k === ' ' || k === 'Enter')) { ready.go(); return; }
      ready.go();
      if (ended || clearT > 0) return;

      if (k >= '1' && k <= '4') {
        const v = +k;
        btnDown = v - 1;
        btnFlashT = 0.12;
        enterDigit(v);
      } else if (k === 'h' || k === 'H' || k === '?') {
        btnDown = 4;
        btnFlashT = 0.12;
        triggerHint();
      } else if (k === 'ArrowLeft') moveSel(-1, 0);
      else if (k === 'ArrowRight') moveSel(1, 0);
      else if (k === 'ArrowUp') moveSel(0, -1);
      else if (k === 'ArrowDown') moveSel(0, 1);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'hive-sums',
  title: 'Hive Sums',
  tag: 'Color · Logic',
  retro: true,
  era: 'color',
  pal: 'lemon',
  w: 160,
  h: 176,
  tick: 60,
  music: 'puzzle',
  goal: 5,
  hint: 'Fill blank hexes 1-4 so each cage meets its sum with no repeats, rows never repeat, and arrows hold. 3 mistakes ends it.',
  creator: 'Antigravity',
  make,
};
