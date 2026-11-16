import gs from '../gamescroll.js';

const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Beat } = gs.rhythm;
const { maze, proven, reach, fov } = gs.gen;
const { Gestures } = gs.controls;
const { text, sprite } = gs.pixel;
const { rng } = gs.math;
const { sounds, sfx } = gs.sound;
const { haptic } = gs.device;

const R = PAL.moss; // R[0] darkest .. R[3] lightest
const W = 160, H = 160;
const GW = 9, GH = 9, TILE = 12;
const OX = 26, OY = 20;
const MAZE_CY = OY + (GH * TILE) / 2;
const BEAT_CX = 98, BEAT_CY = 148, BEAT_HW = 54;
const DIRS = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0],
];

function make(api) {
  const feel = new Feel({ pixel: true });
  const ready = new Ready({ eat: true });
  const beat = new Beat({ bpm: 108, steps: 2 });

  const K = gs.tweak('Feel', {
    bpm: [108, 80, 140, 2, 'tempo in beats per minute'],
    window: [.28, .15, .40, 'timing window either side of the beat (beats)'],
    lives: [3, 1, 5, 1, 'hearts before the round ends'],
    torch: [6, 3, 10, 1, 'missed beats before the torch burns out'],
    sight: [3, 2, 5, 1, 'torch sight radius in tiles'],
  });

  const palMap = { 0: R[0], 1: R[1], 2: R[2], 3: R[3] };
  const heroA = sprite([
    '...0000...',
    '..033330..',
    '..003300..',
    '.00122100.',
    '.01222210.',
    '00.2002.00',
    '...0220...',
    '..00..00..',
    '..0....0..',
    '..........',
  ], palMap);
  const heroB = sprite([
    '..........',
    '...0000...',
    '..033330..',
    '..003300..',
    '.00122100.',
    '.01222210.',
    '00.2002.00',
    '...0220...',
    '..00..00..',
    '..0....0..',
  ], palMap);
  const wardenA = sprite([
    '..000000..',
    '.00111100.',
    '.01300310.',
    '.00000000.',
    '00.0110.00',
    '0..0110..0',
    '...0000...',
    '..00..00..',
    '..0....0..',
    '..........',
  ], palMap);
  const wardenB = sprite([
    '0.000000.0',
    '0001111000',
    '.01300310.',
    '.00000000.',
    '..001100..',
    '...0110...',
    '..000000..',
    '..0....0..',
    '.0......0.',
    '..........',
  ], palMap);
  const gemSpr = sprite([
    '...00...',
    '..0320..',
    '.033220.',
    '03221120',
    '02211110',
    '.021110.',
    '..0110..',
    '...00...',
  ], palMap);
  const stairsSpr = sprite([
    '0000000000',
    '0333333330',
    '0333330000',
    '0222220110',
    '0222200110',
    '0111100000',
    '0111000000',
    '0000000000',
    '0000000000',
    '0000000000',
  ], palMap);
  const heartFull = sprite([
    '.00.00.',
    '0220220',
    '0232210',
    '.02110.',
    '..010..',
    '...0...',
  ], palMap);
  const heartEmpty = sprite([
    '.11.11.',
    '1331331',
    '1333331',
    '.13331.',
    '..131..',
    '...1...',
  ], palMap);
  const torchSpr = sprite([
    '..0..',
    '.030.',
    '.020.',
    '..0..',
    '..1..',
    '..1..',
  ], palMap);

  const vis = new Uint8Array(GW * GH);
  const seen = new Uint8Array(GW * GH);
  const grid = Array.from({ length: GH }, () => new Array(GW).fill('#'));
  const keysDown = Object.create(null);

  let floor, score, hearts, torch, combo, runSeed;
  let gridText, exit, gems, wardens;
  let pCol, pRow, pPrevCol, pPrevRow, pFromCol, pFromRow, pAnim, flashDir, flashT;
  let actedBeat, checkedBeat, enemyBeat, beatPulse, floorDelay, msg, msgT, ignoreUpId;

  function showMsg(txt) {
    msg = txt;
    msgT = 0.75;
  }

  function updateFov() {
    vis.fill(0);
    const s = fov(gridText, pCol, pRow, K.sight);
    for (const key of s) {
      const comma = key.indexOf(',');
      const c = +key.slice(0, comma), r = +key.slice(comma + 1);
      if (c >= 0 && c < GW && r >= 0 && r < GH) {
        const idx = r * GW + c;
        vis[idx] = 1;
        seen[idx] = 1;
      }
    }
  }

  function bfsDist(sc, sr) {
    const d = new Int16Array(GW * GH).fill(-1);
    const q = [sr * GW + sc];
    d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const k = q[i], c = k % GW, r = (k / GW) | 0;
      for (let j = 0; j < 4; j++) {
        const nc = c + DIRS[j][1], nr = r + DIRS[j][2];
        if (nc < 0 || nr < 0 || nc >= GW || nr >= GH || grid[nr][nc] === '#') continue;
        const nk = nr * GW + nc;
        if (d[nk] < 0) { d[nk] = d[k] + 1; q.push(nk); }
      }
    }
    return d;
  }

  function buildFloor() {
    const floorSeed = (runSeed + floor * 7919) | 0;
    const { level } = proven(
      s => {
        const m = maze(GW, GH, { seed: s, kind: floor % 2 === 1 ? 'backtracker' : 'eller' });
        const rows = m.grid.map(row => row.split(''));
        const r = rng(s ^ 0x51a7);
        let opened = 0;
        for (let tries = 0; tries < 24 && opened < 2; tries++) {
          const x = r.int(2, GW - 3), y = r.int(2, GH - 3);
          if (rows[y][x] !== '#') continue;
          const h = rows[y][x - 1] !== '#' && rows[y][x + 1] !== '#' && rows[y - 1][x] === '#' && rows[y + 1][x] === '#';
          const v = rows[y - 1][x] !== '#' && rows[y + 1][x] !== '#' && rows[y][x - 1] === '#' && rows[y][x + 1] === '#';
          if (h || v) { rows[y][x] = '.'; opened++; }
        }
        return { rows, text: rows.map(row => row.join('')).join('\n') };
      },
      l => {
        const d = reach(l.text, 'S', 'E');
        return d >= 8 ? d : false;
      },
      { seed: floorSeed, tries: 18, good: 14 },
    );

    const chosen = level || (() => {
      const m = maze(GW, GH, { seed: floorSeed });
      return { rows: m.grid.map(row => row.split('')), text: m.text };
    })();

    let sc = 1, sr = 1, ec = GW - 2, er = GH - 2;
    for (let r = 0; r < GH; r++) {
      for (let c = 0; c < GW; c++) {
        const ch = chosen.rows[r][c];
        if (ch === 'S') { sc = c; sr = r; grid[r][c] = '.'; }
        else if (ch === 'E') { ec = c; er = r; grid[r][c] = '.'; }
        else grid[r][c] = ch === '#' ? '#' : '.';
      }
    }
    gridText = grid.map(row => row.join('')).join('\n');
    pCol = pFromCol = sc; pRow = pFromRow = sr;
    pPrevCol = -1; pPrevRow = -1; pAnim = 0;
    exit = { col: ec, row: er };
    seen.fill(0);
    updateFov();

    const dist = bfsDist(sc, sr);
    const pr = rng(floorSeed ^ 0x9e37);
    const openCells = [];
    for (let r = 1; r < GH - 1; r++) {
      for (let c = 1; c < GW - 1; c++) {
        if (grid[r][c] === '.' && !(c === sc && r === sr) && !(c === ec && r === er)) {
          openCells.push({ c, r, d: dist[r * GW + c] });
        }
      }
    }
    pr.shuffle(openCells);

    gems = [];
    const gemCount = floor >= 2 ? 3 : 2;
    for (const cell of openCells) {
      if (gems.length >= gemCount) break;
      if (cell.d >= 2) gems.push({ col: cell.c, row: cell.r, taken: false });
    }

    wardens = [];
    const wardenCount = floor >= 3 ? 3 : 2;
    for (const cell of openCells) {
      if (wardens.length >= wardenCount) break;
      if (cell.d < 4) continue;
      if (gems.some(g => g.col === cell.c && g.row === cell.r)) continue;
      wardens.push({
        col: cell.c, row: cell.r,
        fromCol: cell.c, fromRow: cell.r,
        animT: 0, dir: pr.int(0, 3), alive: true,
      });
    }
  }

  function damagePlayer(px, py, label) {
    hearts--;
    combo = 0;
    feel.juice.burst(px, py, { n: 10, speed: 95, life: .35, size: 2, color: [R[0], R[1]] });
    feel.juice.shake(5);
    feel.juice.flash(R[0], .22);
    feel.juice.freeze(.06);
    sounds.hurt();
    haptic('warning');
    showMsg(label);
    if (hearts <= 0) {
      feel.lose();
      api.over();
    }
  }

  function stepWardens() {
    const r = rng((runSeed + floor * 97 + enemyBeat * 31) | 0);
    for (let i = 0; i < wardens.length; i++) {
      const w = wardens[i];
      if (!w.alive) continue;
      const md = Math.abs(w.col - pCol) + Math.abs(w.row - pRow);
      const opts = [];
      for (let d = 0; d < 4; d++) {
        const nc = w.col + DIRS[d][1], nr = w.row + DIRS[d][2];
        if (nc < 0 || nr < 0 || nc >= GW || nr >= GH || grid[nr][nc] === '#') continue;
        let blocked = false;
        for (let j = 0; j < wardens.length; j++) {
          if (j !== i && wardens[j].alive && wardens[j].col === nc && wardens[j].row === nr) { blocked = true; break; }
        }
        if (!blocked) opts.push({ d, nc, nr, dist: Math.abs(nc - pCol) + Math.abs(nr - pRow) });
      }
      if (!opts.length) continue;

      let pick = opts[0];
      if (md <= 3) {
        let bestD = Infinity;
        for (const o of opts) {
          if (o.dist < bestD || (o.dist === bestD && r.chance(.4))) { bestD = o.dist; pick = o; }
        }
      } else {
        const opp = w.dir ^ 1;
        const straight = opts.find(o => o.d === w.dir);
        const nonBack = opts.filter(o => o.d !== opp);
        if (straight && r.chance(.7)) pick = straight;
        else if (nonBack.length) pick = r.pick(nonBack);
        else pick = r.pick(opts);
      }

      if (pick.nc === pCol && pick.nr === pRow) {
        w.fromCol = pick.nc; w.fromRow = pick.nr; w.animT = 1;
        damagePlayer(OX + pCol * TILE + 6, OY + pRow * TILE + 6, 'STRUCK!');
        if (hearts <= 0) return;
      } else {
        w.fromCol = w.col; w.fromRow = w.row;
        w.col = pick.nc; w.row = pick.nr;
        w.dir = pick.d; w.animT = 1;
      }
    }
  }

  function attemptMove(dirName) {
    if (!ready.playing || floorDelay > 0 || hearts <= 0) return;
    const b = beat.beat;
    const nearest = Math.max(0, Math.round(b) | 0);
    const dist = Math.abs(b - nearest);

    if (nearest === actedBeat) {
      if (dist <= 0.08) return;
      combo = 0;
      torch = Math.max(0, torch - 1);
      feel.juice.shake(2);
      sounds.slip();
      haptic('light');
      showMsg('TOO FAST!');
      if (torch <= 0) {
        damagePlayer(OX + pCol * TILE + 6, OY + pRow * TILE + 6, 'DARK!');
        if (hearts <= 0) return;
        torch = Math.max(2, Math.ceil(K.torch / 2));
      }
      stepWardens();
      return;
    }

    if (dist > K.window) {
      combo = 0;
      torch = Math.max(0, torch - 1);
      feel.juice.shake(3);
      sounds.slip();
      haptic('light');
      showMsg('MISS!');
      if (torch <= 0) {
        damagePlayer(OX + pCol * TILE + 6, OY + pRow * TILE + 6, 'DARK!');
        if (hearts <= 0) return;
        torch = Math.max(2, Math.ceil(K.torch / 2));
      }
      stepWardens();
      return;
    }

    actedBeat = Math.max(actedBeat, nearest);
    flashDir = dirName; flashT = 1;
    let dx = 0, dy = 0;
    for (let i = 0; i < 4; i++) if (DIRS[i][0] === dirName) { dx = DIRS[i][1]; dy = DIRS[i][2]; break; }
    const nx = pCol + dx, ny = pRow + dy;

    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || grid[ny][nx] === '#') {
      combo = 0;
      torch = Math.max(0, torch - 1);
      sounds.thud(.9);
      feel.juice.shake(2);
      haptic('light');
      showMsg('WALL!');
      if (torch <= 0) {
        damagePlayer(OX + pCol * TILE + 6, OY + pRow * TILE + 6, 'DARK!');
        if (hearts <= 0) return;
        torch = Math.max(2, Math.ceil(K.torch / 2));
      }
      if (nearest >= 2 && nearest % 2 === 0 && enemyBeat < nearest) {
        enemyBeat = nearest;
        stepWardens();
      }
      return;
    }

    const warden = wardens.find(w => w.alive && w.col === nx && w.row === ny);
    if (warden) {
      warden.alive = false;
      combo++;
      const pts = combo >= 3 ? 4 : 3;
      score += pts;
      api.score(score);
      torch = Math.min(K.torch, torch + 2);
      const wx = OX + nx * TILE + 6, wy = OY + ny * TILE + 6;
      feel.hit(wx, wy, { color: R[0], power: .75 });
      feel.score(wx, wy - 6, pts, { color: R[0] });
      sounds.slash(1 + Math.min(.4, combo * .05));
      showMsg(combo >= 2 ? `HIT! x${combo}` : `HIT! +${pts}`);
      pFromCol = pCol; pFromRow = pRow; pCol = nx; pRow = ny; pAnim = 1;
      pPrevCol = -1; pPrevRow = -1;
    } else {
      const gem = gems.find(g => !g.taken && g.col === nx && g.row === ny);
      if (gem) {
        gem.taken = true;
        combo++;
        const pts = combo >= 2 ? 3 : 2;
        score += pts;
        api.score(score);
        torch = Math.min(K.torch, torch + 2);
        const gx = OX + nx * TILE + 6, gy = OY + ny * TILE + 6;
        feel.juice.burst(gx, gy, { n: 8, speed: 70, life: .3, size: 2, color: [R[0], R[1]] });
        feel.score(gx, gy - 6, pts, { color: R[0] });
        sounds.gem(1 + Math.min(.4, combo * .05));
        haptic('light');
        showMsg(combo >= 2 ? `GEM! x${combo}` : `GEM! +${pts}`);
        pFromCol = pCol; pFromRow = pRow; pCol = nx; pRow = ny; pAnim = 1;
        pPrevCol = -1; pPrevRow = -1;
      } else {
        const pingPong = nx === pPrevCol && ny === pPrevRow;
        if (pingPong) {
          combo = 0;
          torch = Math.max(0, torch - 1);
          sounds.step(.75);
          showMsg('BACK -1');
        } else if (!seen[ny * GW + nx]) {
          torch = Math.min(K.torch, torch + 1);
          sounds.step(1.05);
        } else {
          sounds.step(.95);
        }
        pPrevCol = pCol; pPrevRow = pRow;
        pFromCol = pCol; pFromRow = pRow; pCol = nx; pRow = ny; pAnim = 1;
        haptic('tick');
        if (torch <= 0) {
          damagePlayer(OX + pCol * TILE + 6, OY + pRow * TILE + 6, 'DARK!');
          if (hearts <= 0) return;
          torch = Math.max(2, Math.ceil(K.torch / 2));
        }
      }
    }

    updateFov();

    if (pCol === exit.col && pRow === exit.row) {
      const bonus = 5;
      score += bonus;
      api.score(score);
      torch = K.torch;
      const ex = OX + exit.col * TILE + 6, ey = OY + exit.row * TILE + 6;
      feel.juice.burst(ex, ey, { n: 14, speed: 90, life: .4, size: 2, color: [R[0], R[1]] });
      feel.score(ex, ey - 6, bonus, { color: R[0] });
      sounds.levelup();
      haptic('success');
      showMsg(`FLOOR ${floor + 1}!`);
      floorDelay = 0.34;
      return;
    }

    if (nearest >= 2 && nearest % 2 === 0 && enemyBeat < nearest) {
      enemyBeat = nearest;
      stepWardens();
    }
  }

  const gestures = new Gestures({
    swipeDist: 10,
    swipeSpeed: 90,
    swipe: dir => attemptMove(dir),
    tap: (x, y) => {
      const dx = x - W / 2, dy = y - MAZE_CY;
      attemptMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    },
  });

  function startBeat() {
    beat.bpm = K.bpm;
    if (!beat.running) beat.start();
  }

  return {
    reset() {
      floor = 1; score = 0; hearts = K.lives; torch = K.torch; combo = 0;
      runSeed = (Math.random() * 1e9) | 0;
      actedBeat = -1; checkedBeat = 0; enemyBeat = 0;
      beatPulse = 0; floorDelay = 0; msg = ''; msgT = 0;
      flashDir = ''; flashT = 0; ignoreUpId = null;
      for (const k in keysDown) delete keysDown[k];
      beat.stop();
      feel.clear();
      ready.reset();
      gestures.release();
      buildFloor();
    },

    update(dt) {
      feel.update(dt);
      if (feel.frozen) return;
      if (!ready.update(dt)) return;
      gestures.update();

      if (floorDelay > 0) {
        floorDelay -= dt;
        if (floorDelay <= 0) { floor++; buildFloor(); }
        return;
      }

      beat.bpm = K.bpm;
      if (!beat.running) beat.start();
      beat.update(dt);

      pAnim = Math.max(0, pAnim - dt * 10);
      flashT = Math.max(0, flashT - dt * 6);
      beatPulse = Math.max(0, beatPulse - dt * 5);
      msgT = Math.max(0, msgT - dt);
      for (const w of wardens) w.animT = Math.max(0, w.animT - dt * 10);

      if (beat.onBeat) {
        beatPulse = 1;
        sfx(Math.floor(beat.beat) % 4 === 0 ? 480 : 340, .02, 'triangle', .05);
      }

      while (beat.beat > checkedBeat + K.window) {
        checkedBeat++;
        if (checkedBeat >= 1) {
          if (actedBeat < checkedBeat) {
            combo = 0;
            torch = Math.max(0, torch - 1);
            if (torch <= 0) {
              damagePlayer(OX + pCol * TILE + 6, OY + pRow * TILE + 6, 'DARK!');
              if (hearts <= 0) return;
              torch = Math.max(2, Math.ceil(K.torch / 2));
            } else {
              showMsg('IDLE -1');
            }
          }
          if (checkedBeat >= 2 && checkedBeat % 2 === 0 && enemyBeat < checkedBeat) {
            enemyBeat = checkedBeat;
            stepWardens();
            if (hearts <= 0) return;
          }
        }
      }
    },

    draw(c) {
      c.fillStyle = R[3];
      c.fillRect(0, 0, W, H);
      feel.begin(c);

      // Maze outer frame
      c.fillStyle = R[0];
      c.fillRect(OX - 1, OY - 1, GW * TILE + 2, GH * TILE + 2);

      // Tiles (visible, explored, or shrouded)
      for (let r = 0; r < GH; r++) {
        const ty = OY + r * TILE;
        for (let col = 0; col < GW; col++) {
          const tx = OX + col * TILE;
          const idx = r * GW + col;
          const isVis = vis[idx] === 1;
          const isSeen = seen[idx] === 1;
          const wall = grid[r][col] === '#';

          if (!isSeen) {
            c.fillStyle = R[1];
            c.fillRect(tx, ty, TILE, TILE);
            c.fillStyle = R[0];
            c.fillRect(tx + 2, ty + 2, 2, 2);
            c.fillRect(tx + 8, ty + 8, 2, 2);
          } else if (wall) {
            c.fillStyle = isVis ? R[0] : R[1];
            c.fillRect(tx, ty, TILE, TILE);
            c.fillStyle = isVis ? R[2] : R[0];
            c.fillRect(tx + 1, ty + 1, TILE - 2, 2);
            c.fillStyle = isVis ? R[1] : R[0];
            c.fillRect(tx + 5, ty + 5, 2, 5);
          } else {
            c.fillStyle = isVis ? R[3] : R[2];
            c.fillRect(tx, ty, TILE, TILE);
            c.fillStyle = isVis ? R[2] : R[1];
            c.fillRect(tx + 1, ty + 1, 1, 1);
            c.fillRect(tx + TILE - 2, ty + TILE - 2, 1, 1);
          }
        }
      }

      // Stairs (visible once explored)
      if (seen[exit.row * GW + exit.col]) {
        stairsSpr.draw(c, OX + exit.col * TILE + 1, OY + exit.row * TILE + 1);
      }

      // Gems (visible in current FOV)
      for (const g of gems) {
        if (g.taken || !vis[g.row * GW + g.col]) continue;
        const bob = beatPulse > .4 ? -1 : 0;
        gemSpr.draw(c, OX + g.col * TILE + 2, OY + g.row * TILE + 2 + bob);
      }

      // Wardens (visible in current FOV)
      const moveNext = ((Math.max(0, Math.floor(beat.beat)) + 1) % 2) === 0;
      for (const w of wardens) {
        if (!w.alive || !vis[w.row * GW + w.col]) continue;
        const wx = Math.round(OX + (w.fromCol + (w.col - w.fromCol) * (1 - w.animT)) * TILE + 1);
        const wy = Math.round(OY + (w.fromRow + (w.row - w.fromRow) * (1 - w.animT)) * TILE + 1);
        (moveNext ? wardenB : wardenA).draw(c, wx, wy);
      }

      // Hero
      const hx = Math.round(OX + (pFromCol + (pCol - pFromCol) * (1 - pAnim)) * TILE + 1);
      const hy = Math.round(OY + (pFromRow + (pRow - pFromRow) * (1 - pAnim)) * TILE + 1);
      (beat.phase < .5 ? heroA : heroB).draw(c, hx, hy);

      // Subtle directional touch guides around the crypt
      c.fillStyle = R[2];
      text(c, '<', OX - 8, MAZE_CY - 2, { color: flashT > 0 && flashDir === 'left' ? R[0] : R[2] });
      text(c, '>', OX + GW * TILE + 5, MAZE_CY - 2, { color: flashT > 0 && flashDir === 'right' ? R[0] : R[2] });

      feel.end(c, W, H);

      // Top HUD (clear of center api.scoreArea())
      text(c, `F${floor}`, 3, 3, { color: R[0] });
      if (combo >= 2) text(c, `x${combo}`, 18, 3, { color: R[1] });

      const pips = K.torch;
      const pipStartX = W - 3 - pips * 4;
      torchSpr.draw(c, pipStartX - 7, 2);
      for (let i = 0; i < pips; i++) {
        c.fillStyle = i < torch ? R[0] : R[2];
        c.fillRect(pipStartX + i * 4, 3, 3, 5);
      }

      // Status popup line between maze and beat bar
      if (msgT > 0 && msg) {
        text(c, msg, W / 2, 131, { align: 'center', color: R[0] });
      }

      // Bottom HUD: Hearts + Converging Beat Bar
      for (let i = 0; i < K.lives; i++) {
        (i < hearts ? heartFull : heartEmpty).draw(c, 4 + i * 9, 145);
      }

      const bVal = beat.running ? beat.beat : ready.t * (K.bpm / 60);
      const phase = bVal - Math.floor(bVal);
      const nearBeat = Math.abs(bVal - Math.round(bVal));
      const inWin = nearBeat <= K.window;
      const winPx = Math.round(K.window * BEAT_HW);

      // Beat track & sweet-spot zone
      c.fillStyle = R[2];
      c.fillRect(BEAT_CX - BEAT_HW, BEAT_CY, BEAT_HW * 2, 1);
      c.fillRect(BEAT_CX - winPx, BEAT_CY - 3, winPx * 2, 7);
      c.fillStyle = R[1];
      c.fillRect(BEAT_CX - winPx, BEAT_CY - 4, 1, 9);
      c.fillRect(BEAT_CX + winPx, BEAT_CY - 4, 1, 9);

      // Center beat diamond
      c.fillStyle = inWin || beatPulse > .5 ? R[0] : R[1];
      const cr = inWin ? 4 : 3;
      c.fillRect(BEAT_CX - cr, BEAT_CY - 1, cr * 2 + 1, 3);
      c.fillRect(BEAT_CX - 1, BEAT_CY - cr, 3, cr * 2 + 1);

      // Converging pulse bars
      const lx = Math.round(BEAT_CX - BEAT_HW + phase * BEAT_HW);
      const rx = Math.round(BEAT_CX + BEAT_HW - phase * BEAT_HW);
      c.fillStyle = inWin ? R[0] : R[1];
      c.fillRect(lx - 1, BEAT_CY - 5, 2, 11);
      c.fillRect(rx, BEAT_CY - 5, 2, 11);

      ready.draw(c, W, H, { pixel: true, text: 'TAP TO RAID', color: R[0], y: 130 });
    },

    down(x, y, id) {
      if (ready.go()) {
        ignoreUpId = id;
        startBeat();
        return;
      }
      gestures.down(x, y, id);
    },

    move(x, y, pressed, id) {
      if (id === ignoreUpId) return;
      gestures.move(x, y, pressed, id);
    },

    up(x, y, id) {
      if (id === ignoreUpId) { ignoreUpId = null; return; }
      gestures.up(x, y, id);
    },

    key(k, isDown) {
      if (!isDown) { keysDown[k] = false; return; }
      if (keysDown[k]) return;
      keysDown[k] = true;
      if (ready.go()) { startBeat(); return; }
      if (k === 'ArrowUp' || k === 'w' || k === 'W') attemptMove('up');
      else if (k === 'ArrowDown' || k === 's' || k === 'S') attemptMove('down');
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') attemptMove('left');
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') attemptMove('right');
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'beat-crypt',
  title: 'Beat Crypt',
  tag: 'Pocket · Rhythm',
  retro: true,
  pal: 'moss',
  lcd: true,
  w: 160,
  h: 160,
  tick: 60,
  music: 'tense',
  goal: 25,
  hint: 'Swipe or tap on the beat to strike wardens, grab gems, and reach the stairs.',
  creator: 'Antigravity',
  make,
};
