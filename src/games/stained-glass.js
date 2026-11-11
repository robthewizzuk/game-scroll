// Stained Glass: a church window of irregular panes, cut fresh by code each time. Tap a pane to cycle its glass
// colour. Panes that share a lead line must differ; a few come pre-set (the gold rivets) and can't change. Get every
// pane right and the sun shines through, then a bigger window goes up. Every window is coloured once first, so
// there is always an answer.
import gs from '../gamescroll.js';
const { C16 } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { text } = gs.pixel;
const { sounds, notes } = gs.sound;
const { haptic } = gs.device;
const { rng } = gs.math;

const W = 160, H = 176, GW = 64, GH = 64, CS = 2, OX = 16, OY = 22;
const GLASS = [C16[2], C16[8], C16[4], C16[5]];
const PITCH = ['C5', 'E5', 'G5', 'B5'];

function inArch(gx, gy) { if (gy >= 32) return true; const dx = gx - 31.5, dy = gy - 32; return dx * dx + dy * dy <= 32 * 32; }

// One window: weighted Voronoi panes inside an arch, their neighbours, and a proper colouring to lock clues from.
function cut(level, seed) {
  const r = rng(seed), n = Math.min(22, 5 + level * 2);
  for (let tries = 0; ; tries++) {
    const K = level <= 3 && tries < 30 ? 3 : 4, gap = Math.sqrt(GW * GH * .85 / n) * .62, seeds = [];
    for (let a = 0; seeds.length < n && a < 2000; a++) {
      const sx = 2 + r() * (GW - 4), sy = 2 + r() * (GH - 4);
      if (inArch(sx | 0, sy | 0) && seeds.every(s => Math.hypot(s.x - sx, s.y - sy) > gap)) seeds.push({ x: sx, y: sy, w: (r() - .5) * 5 });
    }
    const map = new Int16Array(GW * GH).fill(-1), size = seeds.map(() => 0);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      if (!inArch(gx, gy)) continue;
      let best = 1e9, bi = 0;
      for (let i = 0; i < seeds.length; i++) { const d = Math.hypot(seeds[i].x - gx, seeds[i].y - gy) + seeds[i].w; if (d < best) { best = d; bi = i; } }
      map[gy * GW + gx] = bi; size[bi]++;
    }
    if (size.some(s => s < 14)) continue;
    const count = new Map(), edge = new Map();
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const a = map[gy * GW + gx]; if (a < 0) continue;
      for (const [nx, ny] of [[gx + 1, gy], [gx, gy + 1]]) {
        if (nx >= GW || ny >= GH) continue;
        const b = map[ny * GW + nx]; if (b < 0 || b === a) continue;
        const key = Math.min(a, b) * 64 + Math.max(a, b);
        count.set(key, (count.get(key) || 0) + 1); if (!edge.has(key)) edge.set(key, []); edge.get(key).push(gy * GW + gx);
      }
    }
    const pairs = [], nb = seeds.map(() => []);
    for (const [key, c] of count) if (c >= 2) { const a = key >> 6, b = key & 63; pairs.push({ a, b, cells: edge.get(key) }); nb[a].push(b); nb[b].push(a); }
    // colour it (backtracking, biggest neighbourhoods first)
    const sol = seeds.map(() => -1), ord = seeds.map((_, i) => i).sort((p, q) => nb[q].length - nb[p].length);
    let steps = 0;
    const go = i => {
      if (i === ord.length) return true; if (++steps > 30000) return false;
      const v = ord[i], st = r() * K | 0;
      for (let k = 0; k < K; k++) { const col = (st + k) % K; if (nb[v].every(u => sol[u] !== col)) { sol[v] = col; if (go(i + 1)) return true; } }
      sol[v] = -1; return false;
    };
    if (!go(0)) continue;
    return { seeds, map, pairs, sol, K };
  }
}

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });
  const ready = new Ready({ eat: false });
  let win, col, locked, runs, leads, clash, level, score, time, phase, st, t, msg, ml;

  function build() {
    level++; phase = 'play'; st = 0;
    win = cut(level, (Math.random() * 1e9) | 0);
    const n = win.seeds.length, nLock = Math.max(1, Math.round(n * .22));
    col = win.sol.map(() => -1); locked = win.sol.map(() => false);
    const idx = win.sol.map((_, i) => i).sort(() => Math.random() - .5);
    for (let i = 0; i < nLock; i++) { locked[idx[i]] = true; col[idx[i]] = win.sol[idx[i]]; }
    // row runs: glass fill and lead lines (a cell is lead where its right or lower neighbour is another pane or stone)
    runs = []; leads = [];
    const m = win.map, at = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH) ? -1 : m[y * GW + x];
    for (let gy = 0; gy < GH; gy++) {
      let cur = null;
      for (let gx = 0; gx <= GW; gx++) {
        const a = gx < GW ? at(gx, gy) : -2;
        const lead = a >= 0 && (at(gx + 1, gy) !== a || at(gx, gy + 1) !== a || at(gx - 1, gy) < 0 || at(gx, gy - 1) < 0);
        const k = a < 0 ? null : lead ? 'L' : a;
        if (cur && cur.k === k) { cur.w++; continue; }
        if (cur) (cur.k === 'L' ? leads : runs).push(cur);
        cur = k === null ? null : { k, x: gx, y: gy, w: 1 };
      }
    }
    clash = [];
  }
  const check = () => { clash = win.pairs.filter(p => col[p.a] >= 0 && col[p.a] === col[p.b]); };
  const say = (m, s = 1.2) => { msg = m; ml = s; };

  function paneAt(x, y) {
    const gx = Math.floor((x - OX) / CS), gy = Math.floor((y - OY) / CS);
    let best = -1, bd = 9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = gx + dx, Y = gy + dy; if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue;
      const v = win.map[Y * GW + X], d = dx * dx + dy * dy; if (v >= 0 && d < bd) { bd = d; best = v; }
    }
    return best;
  }

  return {
    reset() { level = 0; score = 0; time = 45; t = 0; msg = ''; ml = 0; feel.clear(); ready.reset(); build(); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      if (!ready.update(dt)) return;
      if (phase === 'shine') { st += dt; if (st > 1.6) build(); return; }
      time -= dt;
      if (time <= 0) { time = 0; feel.juice.shake(4); sounds.buzzer(); haptic('error'); return api.over(); }
    },
    draw(c) {
      c.fillStyle = C16[12]; c.fillRect(0, 0, W, H);
      c.fillStyle = C16[11]; for (let y = 0; y < 152; y += 8) for (let x = (y / 8) % 2 * 8; x < W; x += 16) c.fillRect(x, y, 15, 7);
      feel.begin(c);
      c.fillStyle = C16[0]; c.fillRect(OX - 3, OY + 32 * CS, GW * CS + 6, 32 * CS + 3);
      for (const q of runs) { const k = col[q.k]; c.fillStyle = k < 0 ? C16[14] : GLASS[k]; c.fillRect(OX + q.x * CS, OY + q.y * CS, q.w * CS, CS); }
      c.fillStyle = C16[0]; for (const q of leads) c.fillRect(OX + q.x * CS, OY + q.y * CS, q.w * CS, CS);
      // clear glass gets a pale streak, coloured glass a glint, locked panes a gold rivet
      win.seeds.forEach((s, i) => {
        const x = OX + Math.round(s.x) * CS, y = OY + Math.round(s.y) * CS;
        if (col[i] < 0) { c.fillStyle = C16[13]; c.fillRect(x - 3, y + 2, 2, 1); c.fillRect(x - 1, y, 2, 1); c.fillRect(x + 1, y - 2, 2, 1); }
        else { c.fillStyle = C16[1]; c.fillRect(x - 4, y - 4, 2, 1); c.fillRect(x - 4, y - 3, 1, 1); }
        if (locked[i]) { c.fillStyle = C16[0]; c.fillRect(x - 2, y - 2, 5, 5); c.fillStyle = C16[4]; c.fillRect(x - 1, y - 1, 3, 3); c.fillStyle = C16[1]; c.fillRect(x - 1, y - 1, 1, 1); }
      });
      // clashing lead lines flash
      if (clash.length && (t * 6 | 0) % 2) { c.fillStyle = C16[1]; for (const p of clash) for (const i of p.cells) c.fillRect(OX + (i % GW) * CS, OY + (i / GW | 0) * CS, CS, CS); }
      // sunbeams through a finished window
      if (phase === 'shine') {
        c.fillStyle = C16[1];
        for (let b = 0; b < 4; b++) { const p = Math.round((st * 120 + b * 34) % 200) - 40; for (let k = 0; k < 40; k++) { const x = OX + p + k, y = OY + 128 - k * 3; if (x >= OX && x < OX + 128 && y >= OY && (k % 2 || b % 2)) c.fillRect(x, y, 1, 2); } }
      }
      feel.end(c, W, H);
      // HUD under the window
      c.fillStyle = C16[0]; c.fillRect(0, 152, W, H - 152);
      text(c, `WINDOW ${level}`, 4, 156, { color: C16[1] });
      for (let k = 0; k < win.K; k++) { c.fillStyle = GLASS[k]; c.fillRect(W - 8 - (win.K - 1 - k) * 8, 156, 6, 6); }
      const bw = Math.round((W - 8) * Math.min(1, time / 60));
      c.fillStyle = C16[13]; c.fillRect(4, 167, W - 8, 4); c.fillStyle = time < 8 && (t * 4 | 0) % 2 ? C16[2] : C16[4]; c.fillRect(4, 167, bw, 4);
      if (ml > 0) text(c, msg, W / 2, Math.max(12, Math.ceil(api.scoreArea().bottom) + 2), { color: C16[1], align: 'center', outline: C16[0] });
      ready.draw(c, W, H, { pixel: true, text: 'TAP A PANE: CHANGE GLASS', color: C16[1], shadow: C16[0], y: 120 });
    },
    down(x, y) {
      ready.go();
      if (phase !== 'play') return;
      const i = paneAt(x, y); if (i < 0) return;
      if (locked[i]) { sounds.deny(); haptic('light'); feel.juice.shake(1); return; }
      const before = clash.length;
      col[i] = (col[i] + 1) % win.K; check();
      sounds.pluck(1); notes(PITCH[col[i]], { len: .08, wave: 'triangle', vol: .04 }); haptic('tick');
      const s = win.seeds[i]; feel.juice.burst(OX + s.x * CS, OY + s.y * CS, { n: 5, speed: 30, life: .25, size: 1, color: [GLASS[col[i]], C16[1]] });
      if (clash.length > before) { sounds.wobble(); haptic('warning'); }
      if (!clash.length && col.every(v => v >= 0)) {
        phase = 'shine'; st = 0; score++; api.score(score);
        time = Math.min(60, time + 8 + win.seeds.length * .6);
        say('SUNLIGHT!', 1.4); sounds.twinkle(); notes('C5 E5 G5 C6', { len: .09 }); haptic('success');
        feel.juice.flash(C16[1], .25);
        win.seeds.forEach(q => feel.juice.burst(OX + q.x * CS, OY + q.y * CS, { n: 4, speed: 40, life: .7, size: 1, color: [C16[1], C16[4]], gravity: -20 }));
      }
    },
    key(k, d) { if (d && k === ' ') ready.go(); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'stained-glass',
  title: 'Stained Glass',
  tag: 'Color · Logic',
  retro: true, era: 'color', pal: 'lemon',
  w: W, h: H,
  tick: 60,
  music: 'puzzle',
  goal: 5,
  hint: 'Tap a pane to change its glass colour. Panes that share a lead line must differ; the gold-riveted ones are fixed.',
  creator: 'Noctizzle',
  make,
};
