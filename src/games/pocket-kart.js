import gs from '../gamescroll.js';
const { Timers } = gs.math;
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, disc } = gs.util;
const { approach } = gs.juice;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Pocket Kart: a flat-plane scaling kart racer in the style of early-2000s handhelds. Two laps
// against five rival drivers on one of four hand-laid tracks, each with its own scenery and
// landmarks. You start at the back of the grid. Rivals follow a real racing line, brake for
// corners, pick a side to overtake, sometimes block and sometimes make mistakes. Points are
// paid on your finishing place, and a podium counts as a win.
const WORLD = 1024, CELL = 2, N = WORLD / CELL, PTS = 360, HALF = 32, LAPS = 2, KW = 12;
const GROUND = 0, ROAD = 1, KERB = 2, WATER = 4, RUNOFF = 5, BOOST = 6, ICE = 7;
const SURF = { [GROUND]: [62, 9], [ROAD]: [150, 14], [KERB]: [142, 14], [WATER]: [0, 1], [RUNOFF]: [96, 10], [BOOST]: [150, 14], [ICE]: [120, 1.8] };
const POINTS = [10, 8, 6, 4, 2, 1], SUFFIX = ['ST', 'ND', 'RD', 'TH', 'TH', 'TH'];
let W = 160, H = 160;

const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const h2 = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }

/* ---------- the four tracks ---------- */
const THEMES = [
  { name: 'CLOVER MEADOW', seed: 11,
    pts: [[190, 200], [470, 130], [760, 170], [880, 330], [790, 470], [640, 500], [720, 640], [880, 760], [760, 900], [480, 880], [330, 760], [200, 640], [130, 430]],
    lakes: [{ x: 470, y: 470, rx: 120, ry: 80 }], lake: WATER,
    g1: '#50a840', g2: '#43963a', dot: ['#f8e870', '#f8f8f0', '#e86890'], run: '#c8a468', road: '#70707c', kerb: ['#e03838', '#f4f4ec'], water: ['#3878d8', '#5098e8'], shore: '#d8c890', outer: '#3e8a34',
    sky: ['#3c64e0', '#b8e0f8'], haze: '#b8dcf8', far: '#6c80cc', near: '#2f8a3e',
    scen: [['tree', 6], ['bush', 3], ['hay', 1]], land: [['windmill', 330, 520], ['barn', 600, 330], ['windmill', 960, 560], ['barn', 120, 860]] },
  { name: 'MESA DUNES', seed: 23,
    pts: [[160, 250], [400, 150], [600, 250], [820, 150], [920, 360], [770, 520], [900, 740], [660, 900], [440, 780], [250, 900], [110, 720], [230, 490]],
    lakes: [{ x: 520, y: 520, rx: 90, ry: 70 }], lake: WATER,
    g1: '#e8c478', g2: '#dab468', dot: ['#b08850', '#f8e0a0', '#a07848'], run: '#c89458', road: '#80706c', kerb: ['#e87828', '#f4f4ec'], water: ['#30a0b8', '#50c0d0'], shore: '#78b858', outer: '#e0bc70',
    sky: ['#f08848', '#f8e0a0'], haze: '#f8e0a8', far: '#c06850', near: '#a04c38',
    scen: [['cactus', 5], ['rock', 4]], land: [['mesa', 560, 60], ['tower', 520, 400], ['tent', 640, 640], ['mesa', 40, 520], ['tent', 340, 640]] },
  { name: 'GULL BAY', seed: 37,
    pts: [[180, 170], [560, 130], [790, 230], [800, 450], [640, 560], [770, 760], [600, 900], [320, 880], [200, 660], [330, 490], [140, 340]],
    lakes: [], ocean: 890, lake: WATER,
    g1: '#78b858', g2: '#68a850', dot: ['#f8f0a0', '#f8f8f0', '#58904a'], run: '#e8d8a0', road: '#74747e', kerb: ['#3878e0', '#f4f4ec'], water: ['#2868c8', '#4888e0'], shore: '#f0e0a0', outer: '#2868c8',
    sky: ['#2878e0', '#c8f0ff'], haze: '#c8ecff', far: '#5888c8', near: '#3c7848',
    scen: [['palm', 6], ['bush', 2], ['rock', 1]], land: [['lighthouse', 868, 110], ['hut', 860, 600], ['hut', 860, 330], ['boat', 970, 760], ['boat', 960, 200], ['hut', 520, 330]] },
  { name: 'PINE PASS', seed: 53,
    pts: [[220, 150], [560, 210], [850, 140], [910, 400], [640, 420], [560, 610], [860, 700], [800, 900], [420, 900], [170, 770], [300, 520], [130, 320]],
    lakes: [{ x: 420, y: 380, rx: 90, ry: 60 }], lake: ICE,
    g1: '#eef2fa', g2: '#dce4f2', dot: ['#b8c8e0', '#ffffff', '#a8b8d0'], run: '#a8d0f0', road: '#606a7c', kerb: ['#2c70d8', '#f4f4ec'], water: ['#a0ccf0', '#c0e0f8'], shore: '#f8fbff', outer: '#e4ecf8',
    sky: ['#7890d0', '#e8f0ff'], haze: '#e8f0ff', far: '#9aa8d0', near: '#38604c', runIce: true,
    scen: [['pine', 7], ['rock', 1], ['snowman', 1]], land: [['cabin', 700, 540], ['mast', 1000, 300], ['cabin', 280, 940], ['mast', 40, 560]] },
];

function spline(cp, n) {
  const out = [], m = cp.length;
  for (let i = 0; i < m; i++) { const p0 = cp[(i - 1 + m) % m], p1 = cp[i], p2 = cp[(i + 1) % m], p3 = cp[(i + 2) % m];
    for (let s = 0; s < n; s++) { const t = s / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) }); } }
  return out;
}
function resample(p, n) {
  const L = [0]; for (let i = 1; i <= p.length; i++) L.push(L[i - 1] + Math.hypot(p[i % p.length].x - p[i - 1].x, p[i % p.length].y - p[i - 1].y));
  const tot = L[p.length], out = []; let j = 0;
  for (let k = 0; k < n; k++) { const d = k * tot / n; while (L[j + 1] < d) j++; const a = p[j], b = p[(j + 1) % p.length], s = (d - L[j]) / (L[j + 1] - L[j] || 1); out.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }); }
  return { line: out, len: tot };
}

export function buildTrack(th) {
  const { line, len } = resample(spline(th.pts, 40), PTS), seg = len / PTS, R = rng(th.seed);
  for (let i = 0; i < PTS; i++) { const a = line[(i - 1 + PTS) % PTS], b = line[(i + 1) % PTS], l = Math.hypot(b.x - a.x, b.y - a.y); line[i].tx = (b.x - a.x) / l; line[i].ty = (b.y - a.y) / l; line[i].nx = -line[i].ty; line[i].ny = line[i].tx; }
  for (let i = 0; i < PTS; i++) { const a = line[(i - 6 + PTS) % PTS], b = line[(i + 6) % PTS]; line[i].k = angDiff(Math.atan2(b.ty, b.tx), Math.atan2(a.ty, a.tx)) / (12 * seg); }
  // racing line: relax offsets towards the inside of corners, inside the road edges
  const off = new Float32Array(PTS), lim = HALF - 9;
  for (let it = 0; it < 400; it++) for (let i = 0; i < PTS; i++) {
    const a = line[(i - 4 + PTS) % PTS], b = line[(i + 4) % PTS], oa = off[(i - 4 + PTS) % PTS], ob = off[(i + 4) % PTS], c = line[i];
    const mx = (a.x + a.nx * oa + b.x + b.nx * ob) / 2, my = (a.y + a.ny * oa + b.y + b.ny * ob) / 2;
    off[i] = clamp((mx - c.x) * c.nx + (my - c.y) * c.ny, -lim, lim);
  }
  // speed limit on the racing line from its radius (the same turning model the karts use)
  const vlim = new Float32Array(PTS), rl = line.map((c, i) => ({ x: c.x + c.nx * off[i], y: c.y + c.ny * off[i] }));
  for (let i = 0; i < PTS; i++) { const a = rl[(i - 5 + PTS) % PTS], b = rl[i], c = rl[(i + 5) % PTS];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y), cr = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const r = cr < 1e-6 ? 1e4 : ab * bc * ca / (2 * cr); vlim[i] = r >= 130 ? 200 : 1.26 * r / (1 - .0075 * r); }
  // distance field from the centre line
  const dist = new Float32Array(N * N).fill(1e9), sid = new Int16Array(N * N), RR = Math.ceil((HALF + 34) / CELL);
  for (let i = 0; i < PTS; i++) { const a = line[i], b = line[(i + 1) % PTS];
    for (let s = 0; s < 1; s += 1 / 3) { const x = a.x + (b.x - a.x) * s, y = a.y + (b.y - a.y) * s, cx = x / CELL | 0, cy = y / CELL | 0;
      for (let dy = -RR; dy <= RR; dy++) { const yy = cy + dy; if (yy < 0 || yy >= N) continue; const ey = (yy + .5) * CELL - y;
        for (let dx = -RR; dx <= RR; dx++) { const xx = cx + dx; if (xx < 0 || xx >= N) continue; const ex = (xx + .5) * CELL - x, d = ex * ex + ey * ey, k = yy * N + xx; if (d < dist[k]) { dist[k] = d; sid[k] = i; } } } } }
  const water = (x, y) => { let w = -9; for (const l of th.lakes) w = Math.max(w, 1 - ((x - l.x) / l.rx) ** 2 - ((y - l.y) / l.ry) ** 2); if (th.ocean) w = Math.max(w, (x - th.ocean - Math.sin(y * .021) * 14 - Math.sin(y * .053) * 6) / 40); return w; };
  const tex = new Uint8Array(N * N), col = new Uint8Array(N * N * 3), C = k => hex(k);
  const P = { g1: C(th.g1), g2: C(th.g2), dots: th.dot.map(C), run: C(th.run), road: C(th.road), k0: C(th.kerb[0]), k1: C(th.kerb[1]), w0: C(th.water[0]), w1: C(th.water[1]), shore: C(th.shore), white: [236, 236, 228], shoulder: C(th.road).map(v => v - 22) };
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const k = cy * N + cx, d = Math.sqrt(dist[k]), i = sid[k], x = (cx + .5) * CELL, y = (cy + .5) * CELL; let t = GROUND, c;
    if (d < HALF) { t = ROAD; const n = h2(cx, cy) * 10 - 5; c = P.road.map(v => v + n);
      if (d > HALF - 3.5 && d < HALF - 1.5) c = P.white; else if (d < 1 && (i >> 2) & 1) c = [214, 214, 206];
      if (i < 2) { t = ROAD; c = ((x / 6 | 0) + (y / 6 | 0)) & 1 ? [244, 244, 240] : [28, 28, 36]; } }
    else if (d < HALF + 5) { const corner = Math.abs(line[i].k) > .006; t = corner ? KERB : ROAD; c = corner ? ((i >> 1) & 1 ? P.k0 : P.k1) : P.shoulder; }
    else if (d < HALF + 22 && water(x, y) < 0) { t = th.runIce ? ICE : RUNOFF; const n = h2(cx, cy); c = P.run.map(v => v + (n < .3 ? -10 : n > .9 ? 8 : 0)); }
    else { const w = water(x, y);
      if (w > 0) { t = th.lake; const r = vnoise(x / 14 + Math.sin(y * .05), y / 6); c = r > .72 ? P.w1 : P.w0; if (th.lake === ICE) c = r > .6 ? P.w1 : P.w0; }
      else if (w > -.18 && !(th.ocean && x < th.ocean - 120)) c = P.shore;
      else { const n = vnoise(x / 26, y / 26) + h2(cx, cy) * .28; c = n > .72 ? P.g2 : P.g1; const hh = h2(cx * 7 + 3, cy * 5 + 1); if (hh < .012) c = P.dots[(hh * 250 | 0) % P.dots.length]; } }
    tex[k] = t; col[k * 3] = clamp(c[0], 0, 255); col[k * 3 + 1] = clamp(c[1], 0, 255); col[k * 3 + 2] = clamp(c[2], 0, 255);
  }
  const paint = (cx, cy, c, t) => { if (cx < 0 || cy < 0 || cx >= N || cy >= N) return; const k = cy * N + cx; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; if (t != null) tex[k] = t; };
  // painted grid boxes behind the start line
  const grid = [];
  for (let j = 0; j < 6; j++) { const p = line[PTS - 4 - (j >> 1) * 5 - (j & 1) * 2], lat = (j & 1 ? 1 : -1) * 13; grid.push({ x: p.x + p.nx * lat, y: p.y + p.ny * lat, a: Math.atan2(p.ty, p.tx), idx: PTS - 4 - (j >> 1) * 5 - (j & 1) * 2 });
    const g = grid[j], ca = Math.cos(g.a), sa = Math.sin(g.a);
    for (let u = 6; u <= 7; u += .5) for (let w = -7; w <= 7; w += .5) paint((g.x + ca * u - sa * w) / CELL | 0, (g.y + sa * u + ca * w) / CELL | 0, P.white);
    for (let u = 0; u <= 7; u += .5) for (const w of [-7, 7]) paint((g.x + ca * u - sa * w) / CELL | 0, (g.y + sa * u + ca * w) / CELL | 0, P.white); }
  // boost pads on the two longest straights, set on the racing line
  const pads = [], straight = i => { let s = 0; for (let k = -10; k <= 10; k++) s += Math.abs(line[(i + k + PTS) % PTS].k); return s; };
  const cand = []; for (let i = 20; i < PTS - 20; i += 4) cand.push([straight(i), i]); cand.sort((a, b) => a[0] - b[0]);
  for (const [, i] of cand) { if (pads.length >= 2) break; if (pads.some(p => Math.abs(p - i) < PTS / 4)) continue; pads.push(i); }
  for (const i of pads) { const p = line[i], o = off[i] * .7, ca = p.tx, sa = p.ty;
    for (let u = -8; u <= 8; u += .5) for (let w = -8; w <= 8; w += .5) { const chev = ((u + Math.abs(w) * .6 + 40) % 6) < 3; paint((p.x + p.nx * o + ca * u - sa * w) / CELL | 0, (p.y + p.ny * o + sa * u + ca * w) / CELL | 0, chev ? [248, 208, 48] : [232, 96, 32], BOOST); } }
  // scenery: generic props, chevron boards on the outside of sharp corners, start-line dressing, landmarks
  const props = [], free = (x, y, r) => { const cx = x / CELL | 0, cy = y / CELL | 0; if (cx < 2 || cy < 2 || cx >= N - 2 || cy >= N - 2) return true;
    const k = cy * N + cx; return Math.sqrt(dist[k]) > HALF + r && tex[k] !== WATER && tex[k] !== ICE && !props.some(o => Math.hypot(o.x - x, o.y - y) < 12 + (o.big || 0)); };
  const add = (kind, x, y, o = {}) => props.push({ kind, x, y, ...o });
  for (const [k, x, y] of th.land) if (k === 'boat' || free(x, y, 30)) add(k, x, y, { big: 30 });
  const sp = line[8], side = free(sp.x + sp.nx * (HALF + 46), sp.y + sp.ny * (HALF + 46), 30) ? 1 : -1;
  add('stand', sp.x + sp.nx * side * (HALF + 46), sp.y + sp.ny * side * (HALF + 46), { big: 40 });
  for (let i = -12; i <= 30; i += 7) { const p = line[(i + PTS) % PTS]; for (const s of [-1, 1]) add('flag', p.x + p.nx * s * (HALF + 9), p.y + p.ny * s * (HALF + 9)); }
  for (let i = 0; i < PTS; i++) { const p = line[i], k = p.k;
    if (Math.abs(k) > .011 && Math.abs(k) >= Math.abs(line[(i + 1) % PTS].k) && Math.abs(k) >= Math.abs(line[(i - 1 + PTS) % PTS].k)) {
      const s = k > 0 ? -1 : 1; // outside of the bend
      for (let j = -16; j <= 16; j += 8) { const q = line[(i + j + PTS) % PTS], x = q.x + q.nx * s * (HALF + 12), y = q.y + q.ny * s * (HALF + 12); if (free(x, y, 8)) add(k > 0 ? 'chevR' : 'chevL', x, y); }
      const q = line[i], x = q.x + q.nx * s * (HALF + 24), y = q.y + q.ny * s * (HALF + 24); if (free(x, y, 18)) add('tires', x, y); } }
  const tot = th.scen.reduce((s, e) => s + e[1], 0), pick = () => { let r = R() * tot; for (const [k, w] of th.scen) if ((r -= w) < 0) return k; return th.scen[0][0]; };
  for (let n = 0, made = 0; n < 2500 && made < 230; n++) { const i = R() * PTS | 0, p = line[i], s = R() < .5 ? -1 : 1, dd = HALF + 30 + R() ** 1.6 * 260, x = p.x + p.nx * s * dd, y = p.y + p.ny * s * dd;
    if (free(x, y, 28)) { const k = pick(); add(k, x, y); made++;
      if (k === 'tree' || k === 'pine' || k === 'palm') for (let m = 0; m < 3; m++) { const a = R() * 6.3, r = 16 + R() * 20, xx = x + Math.cos(a) * r, yy = y + Math.sin(a) * r; if (free(xx, yy, 28)) { add(k, xx, yy); made++; } } } }
  // the same colours packed as 32-bit pixels (ABGR, the byte order of ImageData on phones) for drawing
  const col32 = new Int32Array(N * N), O = C(th.outer);
  for (let k = 0; k < N * N; k++) col32[k] = 0xff000000 | col[k * 3 + 2] << 16 | col[k * 3 + 1] << 8 | col[k * 3];
  return { th, line, len, seg, off, vlim, tex, col, col32, outer32: 0xff000000 | O[2] << 16 | O[1] << 8 | O[0], grid, props, name: th.name };
}

/* ---------- pixel sprites ---------- */
const KINDS = { tree: [1.4, 5], bush: [1.1, 0], hay: [1.1, 5], pine: [1.4, 5], palm: [1.5, 3], cactus: [1.3, 3], rock: [1.4, 6], snowman: [1.2, 4],
  windmill: [2.2, 12], barn: [2, 22], tower: [2.2, 12], mesa: [3.4, 60], tent: [1.7, 14], lighthouse: [2.2, 10], hut: [1.7, 12], boat: [1.7, 0], cabin: [2, 20], mast: [2.2, 5],
  chevL: [1.15, 3], chevR: [1.15, 3], tires: [1.15, 5], stand: [1.8, 36], flag: [1.2, 0] };
const DRIVERS = [
  { name: 'ROCCO', col: '#d83830', dark: '#882018', helm: '#f8f0e0', acc: '#202020', feat: 'wing', top: .99, corner: .93, aggr: .8, slip: .05 },
  { name: 'JUNO', col: '#38a8e8', dark: '#1c5c98', helm: '#f8f8f8', acc: '#f8f8f8', feat: 'stripe', top: .97, corner: .98, aggr: .2, slip: .02 },
  { name: 'PIP', col: '#f8d030', dark: '#b08010', helm: '#f87898', acc: '#ffffff', feat: 'bubble', top: .93, corner: 1.05, aggr: .1, slip: .03 },
  { name: 'VEX', col: '#9848d0', dark: '#502878', helm: '#303038', acc: '#e8e040', feat: 'fins', top: .98, corner: .98, aggr: .6, slip: .12 },
  { name: 'TANGO', col: '#f08030', dark: '#a04810', helm: '#58c8a0', acc: '#ffffff', feat: 'flag', top: .92, corner: .94, aggr: .3, slip: .15 },
];
const YOU = { name: 'YOU', col: '#58c840', dark: '#2c7820', helm: '#f8f8f8', acc: '#ffffff', feat: 'you', top: 1, corner: 1, aggr: 0, slip: 0 };

let SPR = null;
function mk(w, h, fn) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); fn(c, (x, y, ww, hh, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, ww, hh); }); return cv; }
function kartSprite(d, view) {
  return mk(26, 22, (c, p) => {
    const sh = view; // -1 turned left, 1 turned right
    p(3, 20, 20, 2, 'rgba(0,0,0,.35)');
    if (view) p(view < 0 ? 18 : 4, 9, 4, 4, '#181820');
    p(1, 12, 6, 9, '#181820'); p(19, 12, 6, 9, '#181820'); p(2, 13, 4, 1, '#50505c'); p(20, 13, 4, 1, '#50505c'); p(2, 16, 4, 1, '#30303a'); p(20, 16, 4, 1, '#30303a');
    p(5, 11, 16, 7, d.col); p(5, 16, 16, 2, d.dark); p(6, 11, 14, 1, '#ffffff50');
    p(8, 17, 10, 2, '#686878'); p(9, 16, 2, 2, '#b0b0b8'); p(15, 16, 2, 2, '#b0b0b8');
    p(8 + sh, 7, 10, 5, d.col); p(8 + sh, 10, 10, 1, d.dark);
    const hx = 13 + sh * 1.5, big = d.feat === 'bubble' ? 1 : 0;
    c.fillStyle = d.helm; disc(c, hx, 4, 3 + big); c.fillStyle = '#ffffff70'; c.fillRect(hx - 2 | 0, 2 - big, 2, 1);
    if (d.feat === 'wing') { p(2, 6, 22, 2, '#303038'); p(2, 6, 22, 1, d.col); p(7, 8, 1, 3, '#303038'); p(18, 8, 1, 3, '#303038'); }
    if (d.feat === 'stripe') { p(12, 11, 2, 7, d.acc); p(12 + sh, 7, 2, 4, d.acc); c.fillStyle = d.col; c.fillRect(hx - .5 | 0, 1, 1, 6); }
    if (d.feat === 'bubble') { p(9, 9, 8, 2, '#ffffff'); p(4, 11, 2, 2, d.acc); p(20, 11, 2, 2, d.acc); }
    if (d.feat === 'fins') { p(4, 6, 2, 6, d.dark); p(20, 6, 2, 6, d.dark); p(4, 6, 2, 1, d.acc); p(20, 6, 2, 1, d.acc); p(10 + sh, 0, 6, 1, d.acc); }
    if (d.feat === 'flag') { p(21, 0, 1, 11, '#d0d0d8'); p(22, 0, 3, 2, d.acc); p(22, 2, 3, 1, d.col); }
    if (d.feat === 'you') { p(10, 11, 1, 7, d.acc); p(15, 11, 1, 7, d.acc); c.fillStyle = d.col; c.fillRect(hx - 3 | 0, 3, 7, 1); }
  });
}
function buildSprites() {
  const S = {};
  S.tree = [mk(18, 24, (c, p) => { p(8, 15, 3, 9, '#7a5030'); p(10, 15, 1, 9, '#4e3018'); p(4, 23, 11, 1, 'rgba(0,0,0,.25)');
    c.fillStyle = '#246c2c'; disc(c, 9, 10, 8); c.fillStyle = '#38923a'; disc(c, 8, 9, 7); c.fillStyle = '#4eae44'; disc(c, 7, 7, 5); c.fillStyle = '#7ccc5c'; disc(c, 6, 5, 2);
    for (let i = 0; i < 18; i++) p(2 + h2(i, 1) * 14, 3 + h2(i, 2) * 13, 1, 1, '#246c2c'); })];
  S.bush = [mk(16, 10, (c) => { c.fillStyle = '#2c7a30'; disc(c, 5, 6, 4); disc(c, 11, 6, 4); c.fillStyle = '#48a040'; disc(c, 8, 4, 4); c.fillStyle = '#78c858'; c.fillRect(6, 2, 2, 1); c.fillStyle = '#e86890'; c.fillRect(4, 5, 1, 1); c.fillRect(11, 4, 1, 1); })];
  S.hay = [mk(12, 9, (c, p) => { p(0, 1, 12, 8, '#d8b048'); p(0, 1, 12, 1, '#f0d070'); for (let y = 3; y < 9; y += 2) p(0, y, 12, 1, '#b89038'); p(4, 1, 1, 8, '#a07828'); })];
  S.pine = [mk(16, 28, (c, p) => { p(7, 22, 3, 6, '#5a3a20'); p(3, 27, 11, 1, 'rgba(0,0,0,.2)');
    for (let tr = 0; tr < 3; tr++) for (let y = 0; y < 10; y++) { const hw = Math.round(1 + y / 10 * (3 + tr * 2)), yy = tr * 6 + y; p(8 - hw, yy, hw, 1, '#2e7058'); p(8, yy, hw, 1, '#1e5040'); if (y < 3) p(8 - hw, yy, hw * 2, 1, '#f4f8ff'); } })];
  S.palm = [mk(24, 34, (c, p) => { for (let y = 33; y > 9; y--) { const x = 10 + Math.sin((33 - y) / 23 * 1.3) * 5; p(x, y, 3, 1, (y % 3) ? '#a07848' : '#6a4a28'); }
    const cx = 15, cy = 9; for (const a of [-2.9, -2.2, -1.5, -.8, -.1, .5]) for (let l = 0; l < 12; l++) { const x = cx + Math.cos(a) * l, y = cy + Math.sin(a) * l * .7 + l * l * .05; p(x, y, 2, 1, l > 8 ? '#2a8038' : '#3cae4a'); }
    p(14, 9, 2, 2, '#6a4020'); p(16, 10, 2, 2, '#6a4020'); })];
  S.cactus = [mk(12, 22, (c, p) => { p(4, 2, 4, 20, '#3a9a48'); p(5, 3, 1, 18, '#6cc070'); p(1, 8, 3, 2, '#3a9a48'); p(1, 4, 2, 5, '#3a9a48'); p(8, 11, 3, 2, '#3a9a48'); p(9, 6, 2, 6, '#3a9a48'); p(2, 21, 9, 1, 'rgba(0,0,0,.2)');
    for (let y = 4; y < 20; y += 3) p(7, y, 1, 1, '#1e6a2c'); p(5, 1, 2, 1, '#f878a0'); })];
  S.rock = [mk(18, 11, (c, p) => { for (let y = 0; y < 11; y++) { const hw = Math.round(Math.sqrt(1 - ((10 - y) / 11) ** 2) * 8 + (y > 6 ? 1 : 0)); p(9 - hw, y, hw * 2, 1, '#9a7a64'); p(9 + hw - 3, y, 3, 1, '#6a5040'); if (y < 5) p(9 - hw + 1, y, 3, 1, '#c8a890'); } })];
  S.snowman = [mk(12, 20, (c, p) => { c.fillStyle = '#d0dcf0'; disc(c, 6, 15, 5); c.fillStyle = '#ffffff'; disc(c, 5, 14, 4); c.fillStyle = '#d0dcf0'; disc(c, 6, 7, 3); c.fillStyle = '#ffffff'; disc(c, 5, 7, 3);
    p(3, 0, 6, 4, '#202028'); p(2, 3, 8, 1, '#202028'); p(4, 6, 1, 1, '#202028'); p(7, 6, 1, 1, '#202028'); p(6, 8, 3, 1, '#f08030'); p(3, 10, 6, 1, '#d83830'); })];
  S.windmill = [0, 1, 2, 3].map(f => mk(30, 60, (c, p) => { for (let y = 20; y < 59; y++) { const hw = Math.round(4 + (y - 20) * .13); p(15 - hw, y, hw * 2, 1, '#ece4d4'); p(15 + hw - 2, y, 2, 1, '#b8ac98'); }
    p(13, 51, 4, 8, '#704828'); p(14, 32, 2, 3, '#384858'); p(10, 15, 10, 6, '#8a4a2a'); p(11, 13, 8, 2, '#6a3418'); p(6, 59, 18, 1, 'rgba(0,0,0,.25)');
    for (let b = 0; b < 4; b++) { const a = f * Math.PI / 8 + b * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      for (let l = 1; l < 15; l++) { p(15 + ca * l, 17 + sa * l, 1, 1, '#5a3a20'); if (l > 4) for (let w = 1; w <= 3; w++) p(15 + ca * l - sa * w, 17 + sa * l + ca * w, 1, 1, (l + w) % 3 ? '#f4ecdc' : '#c8bca8'); } }
    p(14, 16, 2, 2, '#302018'); }));
  S.barn = [mk(34, 26, (c, p) => { p(2, 10, 30, 16, '#c03828'); p(26, 10, 6, 16, '#901c18'); for (let y = 2; y <= 10; y++) { const hw = (y - 2) * 2 + 1; p(17 - hw, y, hw * 2, 1, '#5a2c24'); p(17 - hw, y, 1, 1, '#f0e8d8'); p(16 + hw, y, 1, 1, '#f0e8d8'); }
    p(12, 15, 10, 11, '#f0e8d8'); p(13, 16, 8, 10, '#a02820'); for (let i = 0; i < 8; i++) { p(13 + i, 16 + i * 1.2, 1, 1, '#f0e8d8'); p(20 - i, 16 + i * 1.2, 1, 1, '#f0e8d8'); } p(15, 5, 4, 3, '#f0e8d8'); p(16, 6, 2, 2, '#3a2018'); })];
  S.tower = [mk(22, 48, (c, p) => { p(4, 20, 2, 28, '#606878'); p(16, 20, 2, 28, '#606878'); for (let y = 24; y < 46; y += 8) for (let i = 0; i < 10; i++) { p(6 + i, y + i * .8, 1, 1, '#808898'); p(15 - i, y + i * .8, 1, 1, '#808898'); }
    for (let y = 0; y < 5; y++) p(11 - y * 2, y, y * 4 + 1, 1, '#a0a8b8'); p(1, 5, 20, 15, '#d8dce4'); p(1, 5, 3, 15, '#b0b4c0'); p(17, 5, 4, 15, '#a0a4b0'); p(1, 10, 20, 3, '#d84838'); p(1, 19, 20, 1, '#808898'); })];
  S.mesa = [mk(64, 40, (c, p) => { for (let y = 0; y < 40; y++) { const hw = Math.round(20 + (y > 10 ? (y - 10) * .4 : 0) + Math.sin(y * .9) * 1.5); const col = y < 4 ? '#e8a070' : y < 16 ? '#c86c48' : y < 26 ? '#b05c3c' : '#984c30';
    p(32 - hw, y, hw * 2, 1, col); p(32 + hw - 7, y, 7, 1, '#7a3c28'); if (y % 7 === 3) p(32 - hw + 3, y, hw, 1, '#d88458'); } })];
  S.tent = [mk(26, 18, (c, p) => { for (let y = 0; y < 9; y++) { const hw = Math.round(y * 1.3 + 1); for (let x = -hw; x < hw; x++) p(13 + x, y, 1, 1, ((x + 30) / 3 | 0) % 2 ? '#e84838' : '#f8f0e0'); }
    p(2, 9, 22, 1, '#a02820'); p(3, 10, 1, 8, '#6a4a2a'); p(22, 10, 1, 8, '#6a4a2a'); p(5, 13, 16, 3, '#a07040'); p(7, 11, 3, 2, '#e8c040'); p(12, 11, 3, 2, '#58b848'); p(17, 11, 2, 2, '#e86890'); })];
  S.lighthouse = [0, 1].map(f => mk(18, 66, (c, p) => { for (let y = 16; y < 62; y++) { const hw = Math.round(4 + (y - 16) * .06), band = ((y - 16) / 8 | 0) % 2; p(9 - hw, y, hw * 2, 1, band ? '#d83030' : '#f4f4ec'); p(9 + hw - 2, y, 2, 1, band ? '#a02020' : '#c0c0b8'); }
    p(3, 14, 12, 2, '#303038'); p(5, 8, 8, 6, '#303038'); p(6, 9, 6, 4, f ? '#fff080' : '#c8a040'); p(6, 5, 6, 3, '#c02828'); p(8, 3, 2, 2, '#c02828'); p(0, 62, 18, 4, '#787068'); p(2, 62, 5, 1, '#a09888');
    if (f) { p(0, 10, 5, 1, '#fff8b0'); p(13, 10, 5, 1, '#fff8b0'); } }));
  S.hut = [mk(22, 20, (c, p) => { p(3, 9, 16, 11, '#f0d8a0'); for (let x = 4; x < 19; x += 4) p(x, 9, 2, 11, '#58b0d0'); for (let y = 0; y < 9; y++) { const hw = y + 2; p(11 - hw, y, hw * 2, 1, y % 2 ? '#c89848' : '#b08038'); }
    p(9, 13, 4, 7, '#7a5030'); p(1, 19, 20, 1, 'rgba(0,0,0,.2)'); })];
  S.boat = [0, 1].map(f => mk(24, 18, (c, p) => { const o = f; for (let y = 0; y < 5; y++) p(2 + y, 12 + y + o, 20 - y * 2, 1, y === 1 ? '#3868c8' : '#f4f4ec'); p(11, 1 + o, 1, 11, '#6a4a2a');
    for (let y = 0; y < 9; y++) p(12, 2 + y + o, Math.round(y * .9), 1, '#f8f8f0'); p(12, 1 + o, 3, 1, '#d83030'); p(1, 17, 22, 1, '#ffffff80'); }));
  S.cabin = [mk(30, 26, (c, p) => { p(2, 11, 26, 15, '#8a5a30'); for (let y = 13; y < 26; y += 3) p(2, y, 26, 1, '#6a4020'); p(21, 1, 4, 8, '#7a7070');
    for (let y = 2; y < 12; y++) { const hw = (y - 2) * 1.5 + 3; p(15 - hw, y, hw * 2, 1, y > 9 ? '#c8d4e8' : '#f4f8ff'); } p(5, 15, 5, 4, '#f8d060'); p(20, 15, 5, 4, '#f8d060'); p(13, 16, 4, 10, '#4a2a14'); })];
  S.mast = [0, 1].map(f => mk(12, 66, (c, p) => { for (let y = 6; y < 66; y++) { const hw = Math.round(1 + (y - 6) * .07), col = ((y - 6) / 10 | 0) % 2 ? '#d03030' : '#f0f0f0'; p(6 - hw, y, 1, 1, col); p(5 + hw, y, 1, 1, col); if (y % 5 === 0) p(6 - hw, y, hw * 2, 1, col); }
    p(5, 2, 2, 4, '#808080'); p(4, 0, 4, 3, f ? '#ff3030' : '#601818'); }));
  S.chevL = [mk(14, 15, (c, p) => { p(2, 9, 1, 6, '#404048'); p(11, 9, 1, 6, '#404048'); p(0, 0, 14, 10, '#202028'); p(1, 1, 12, 8, '#f4f4ec'); for (const k of [0, 5]) for (let y = 0; y < 7; y++) p(3 + k + Math.abs(y - 3), 2 + y, 2, 1, '#d82828'); })];
  S.chevR = [mk(14, 15, (c, p) => { p(2, 9, 1, 6, '#404048'); p(11, 9, 1, 6, '#404048'); p(0, 0, 14, 10, '#202028'); p(1, 1, 12, 8, '#f4f4ec'); for (const k of [0, 5]) for (let y = 0; y < 7; y++) p(9 - k - Math.abs(y - 3), 2 + y, 2, 1, '#d82828'); })];
  S.tires = [mk(14, 12, (c, p) => { for (const x of [0, 7]) { p(x, 2, 7, 10, '#202024'); for (let y = 3; y < 12; y += 3) p(x, y, 7, 1, '#4a4a52'); p(x + 1, 1, 5, 2, (x ? '#f4f4ec' : '#d83030')); } })];
  S.stand = [mk(52, 26, (c, p) => { p(0, 4, 52, 22, '#707888'); for (let x = 0; x < 52; x += 6) p(x, 0, 3, 4, '#d84040'), p(x + 3, 0, 3, 4, '#f4f4ec');
    const crowd = ['#f8d030', '#e84838', '#38a8e8', '#f8f8f0', '#58c840', '#e86890']; for (let r = 0; r < 6; r++) { const y = 6 + r * 3; p(2, y + 1, 48, 2, '#8890a0'); for (let x = 2; x < 50; x += 2) if (h2(x, r) > .25) p(x, y, 1, 2, crowd[h2(x, r + 9) * 6 | 0]); }
    p(0, 4, 2, 22, '#505868'); p(50, 4, 2, 22, '#505868'); })];
  S.flag = [0, 1].map(f => mk(8, 20, (c, p) => { p(1, 0, 1, 20, '#c0c0c8'); for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) p(2 + x, 1 + y + (f && x > 2 ? 1 : 0), 1, 1, (x + y) & 1 ? '#202028' : '#f8f8f0'); }));
  S.karts = [...DRIVERS, YOU].map(d => [-1, 0, 1].map(v => kartSprite(d, v)));
  return S;
}
const PANO = new Map();
function pano(th) {
  if (PANO.has(th.name)) return PANO.get(th.name);
  const cv = mk(1024, 56, (c, p) => {
    for (let i = 0; i < 9; i++) { const x = h2(i, 77) * 1024, y = 4 + h2(i, 78) * 18, w = 18 + h2(i, 79) * 30; c.fillStyle = '#ffffffc0'; for (let k = 0; k < 4; k++) disc(c, x + k * w / 4, y + Math.sin(k * 2) * 2, 3 + (k % 2) * 2); c.fillRect(x - 2, y + 2, w + 2, 3); }
    for (let x = 0; x < 1024; x++) { const a = x / 1024 * Math.PI * 2;
      let hf = th.name === 'MESA DUNES' ? (Math.sin(a * 5) > .2 ? 18 : 8) + Math.sin(a * 23) * 2 : th.name === 'GULL BAY' ? (Math.sin(a * 3 + 1) > .6 ? 10 + Math.sin(a * 17) * 4 : 1) : 16 + Math.sin(a * 4) * 6 + Math.sin(a * 11) * 4 + Math.sin(a * 29) * 2;
      if (th.name === 'PINE PASS') hf = 22 + Math.abs(Math.sin(a * 6)) * 14 + Math.sin(a * 19) * 3;
      hf = Math.max(1, hf | 0); p(x, 56 - hf, 1, hf, th.far); if (th.name === 'PINE PASS' && hf > 26) p(x, 56 - hf, 1, Math.min(6, hf - 26), '#f4f8ff');
      const nh = th.name === 'GULL BAY' ? 2 : Math.max(1, 6 + Math.sin(a * 9 + 2) * 3 + Math.sin(a * 37) * 2 + (h2(x >> 2, 5) > .7 ? 3 : 0) | 0); p(x, 56 - nh, 1, nh, th.name === 'GULL BAY' ? th.water[0] : th.near); }
  });
  PANO.set(th.name, cv); return cv;
}

// the ground plane: one packed 32-bit colour per pixel, stepping through the map in tile units. Its own small
// function, on signed 32-bit pixels (Int32Array, not Uint32Array), so the browser keeps every number unboxed: no garbage
function paintGround(out, col, outer, haze, gh, camH, f, cx, cy, ca, sa) {
  const FOG = 10;
  for (let sy = 0; sy < gh; sy++) {
    const rd = camH * f / (sy + 1), sc2 = rd / f / CELL; let u = (cx + ca * rd) / CELL + sa * (W / 2) * sc2, v = (cy + sa * rd) / CELL - ca * (W / 2) * sc2; const su = -sa * sc2, sv = ca * sc2;
    let o = sy * W; const end = o + W;
    if (sy >= FOG) {
      for (; o < end; o++, u += su, v += sv) out[o] = u >= 0 && v >= 0 && u < N && v < N ? col[(v | 0) * N + (u | 0)] : outer;
    } else {   // the far rows fade into the haze
      const fog = 1 - sy / FOG;
      for (; o < end; o++, u += su, v += sv) {
        const p = u >= 0 && v >= 0 && u < N && v < N ? col[(v | 0) * N + (u | 0)] : outer, r = p & 255, gg = p >> 8 & 255, b = p >> 16 & 255;
        out[o] = 0xff000000 | (b + (haze[2] - b) * fog) << 16 | (gg + (haze[1] - gg) * fog) << 8 | (r + (haze[0] - r) * fog);
      }
    }
  }
}

/* ---------- the game ---------- */
function make(api) {
  // how your kart handles: a tap nudges, a hold turns hard, holding through a bend drifts, letting go fires a turbo
  const K = gs.tweak('Feel', {
    full: [.45, .1, .9, 'how far out from the middle (of half the screen) a thumb steers at full lock'],
    middle: [.05, 0, .2, 'the strip in the middle that steers straight'],
    nudge: [.35, 0, 1, 'how much a quick tap steers (full lock is 1)'],
    ramp: [.3, .05, 1, 'seconds of holding to reach full lock'],
    turn: [1, .6, 1.5, 'how fast the kart turns at full lock'],
    snap: [110, 10, 150, 'how fast the wheel follows your finger, and comes back when you let go'],
    assist: [1.4, 0, 4, 'how gently the kart lines up with the road while you are not steering'],
    grip: [36, 6, 50, 'how hard your tyres hold on tarmac (lower slides more)'],
    scrub: [.1, 0, .4, 'speed lost turning at full lock, so a held hairpin slows you a little'],
    driftAfter: [.35, .1, 1, 'seconds of full lock at speed before the kart hops into a drift'],
    driftSpeed: [100, 40, 160, 'the slowest a kart can drift'],
    driftTurn: [1.15, 1, 2, 'how much tighter a drift turns than full lock'],
    driftWide: [.7, .3, 1, 'how much a drift still turns with your thumb slid in towards the middle'],
    driftAngle: [.45, 0, .8, 'how far the tail swings out in a drift (the look; the line is set by driftTurn)'],
    blue: [.35, .2, 2, 'seconds of drifting for a blue spark turbo'],
    orange: [.9, .5, 3, 'seconds of drifting for an orange spark turbo (twice as long)'],
    turbo: [.5, .2, 1.5, 'seconds a blue spark turbo lasts'],
  });
  let side = 0, holdT = 0;
  // where your thumb is sets how hard you steer: the outer part of each side is full lock, sliding in towards the middle eases off
  const wheel = px => { const d = (px - W / 2) / (W / 2), m = Math.abs(d); return { s: m < K.middle ? 0 : Math.sign(d), amt: clamp((m - K.middle) / (K.full - K.middle), .25, 1) }; };
  const timers = new Timers(), later = (fn, ms) => timers.after(ms / 1000, fn);   // game-time delays: they pause with the game
  let trk, karts, me, t, raceT, go, msg, held, flash, shake, finished, endT, results, camA, parts, wrongT, lastPlace, themeI = Math.random() * THEMES.length | 0;
  let img = null, img32 = null, mini = null, best = {}, draftT = 0;
  let skyG = null;
  const VIS = [], POOL = [], PJ = [0, 0], GATE = [[0, 0], [0, 0]], farFirst = (a, b) => b.fw - a.fw, CAM = { cx: 0, cy: 0, ca: 1, sa: 0, n: 0 };
  const proj = (x, y, out) => { const rx = x - CAM.cx, ry = y - CAM.cy; out[0] = rx * CAM.ca + ry * CAM.sa; out[1] = -rx * CAM.sa + ry * CAM.ca; return out; };
  const add = (fw, lt, o, k, gate) => { const e = POOL[CAM.n] || (POOL[CAM.n] = {}); e.fw = fw; e.lt = lt; e.o = o; e.k = k; e.gate = gate; VIS[CAM.n++] = e; };
  const at = (x, y) => { const cx = x / CELL | 0, cy = y / CELL | 0; return cx < 0 || cy < 0 || cx >= N || cy >= N ? GROUND : trk.tex[cy * N + cx]; };
  const P = i => trk.line[((i % PTS) + PTS) % PTS];
  function nearest(x, y, from) { let best = from, bd = 1e12; for (let k = -14; k <= 14; k++) { const i = (from + k + PTS) % PTS, p = trk.line[i], d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
  const prog = k => k.lap * PTS + k.idx + k.frac;
  const latOf = k => { const p = P(k.idx); return (k.x - p.x) * p.nx + (k.y - p.y) * p.ny; };
  const ORD = [], byPlace = (a, b) => (b.done ? 1e9 - b.doneT : prog(b)) - (a.done ? 1e9 - a.doneT : prog(a));
  function order() { ORD.length = 0; for (const k of karts) ORD.push(k); return ORD.sort(byPlace); }   // one list, reused
  function say(txt, l = 1.2, col = '#f8d838') { msg = { txt, l, col }; }

  function drive(k, steer, cap, dt) {
    if (k.sink > 0) { k.sink -= dt; if (k.sink <= 0) { const p = P(k.idx); k.x = p.x; k.y = p.y; k.a = k.md = Math.atan2(p.ty, p.tx); k.v = 0; k.ghost = 1.2; } return; }
    k.ghost = Math.max(0, (k.ghost || 0) - dt); k.boost = Math.max(0, k.boost - dt);
    const g = at(k.x, k.y);
    if (g === WATER) { k.sink = .9; k.v = 0; if (k === me) { haptic('heavy'); sfx(300, .4, 'triangle', .05, -240); say('SPLASH!', 1, '#88c8f8'); } return; }
    if (g === BOOST && k.boost < .6) { k.boost = 1; if (k === me) { haptic('medium'); sfx(520, .3, 'sawtooth', .04, 600); } }
    let top = SURF[g][0] * k.d.top * (k.band || 1) * (k.draft || 1);
    if (k === me && !k.dr) top *= 1 - K.scrub * Math.max(0, Math.abs(k.st) - .6) / .4;   // full lock scrubs a little speed
    if (k.boost) top = Math.max(top, 196); top = Math.min(top, cap);
    k.v += (k.v < top ? (k.boost ? 220 : 72) : -170) * dt; k.v = clamp(k.v, 0, 200);
    k.st = approach(k.st, steer, k === me ? K.snap : 11, dt);
    k.a += k.st * dt * (1.4 + k.v / 120) * .9 * (k === me ? K.turn : 1);
    k.md += angDiff(k.a, k.md) * Math.min(1, SURF[g][1] * (k === me ? K.grip / 14 : 1) * dt);
    k.x = clamp(k.x + Math.cos(k.md) * k.v * dt, 4, WORLD - 4); k.y = clamp(k.y + Math.sin(k.md) * k.v * dt, 4, WORLD - 4);
    k.rough = g === GROUND || g === RUNOFF ? 1 : g === KERB ? .5 : 0;
    for (let i = 0; i < trk.solid.length; i++) { const o = trk.solid[i], dx = k.x - o.x, dy = k.y - o.y, rr = o.r + 5; if (dx * dx + dy * dy < rr * rr) { const d = Math.hypot(dx, dy) || 1; k.x = o.x + dx / d * rr; k.y = o.y + dy / d * rr; if (k.v > 40) { k.v *= .35; if (k === me) { haptic('heavy'); sfx(110, .15, 'square', .06, -40); shake = .25; } } } }
    const ni = nearest(k.x, k.y, k.idx);
    if (k.idx > PTS * .8 && ni < PTS * .2) lapDone(k); else if (ni > PTS * .8 && k.idx < PTS * .2) k.lap--;
    k.idx = ni; const p = P(ni); k.frac = clamp(((k.x - p.x) * p.tx + (k.y - p.y) * p.ty) / trk.seg, -.5, .5);
  }
  function lapDone(k) {
    k.lap++;
    if (k.lap >= LAPS && !k.done) { k.done = true; k.doneT = raceT; if (k === me) finish(true); }
    else if (k === me && k.lap > 0) { if (k.lap === LAPS - 1) { say('FINAL LAP!', 1.6, '#f86868'); sfx(660, .15, 'square', .05); later(() => sfx(990, .25, 'square', .05), 140); } else say(`LAP ${k.lap + 1}`, 1.2); haptic('success'); }
  }
  function finish(crossed) {
    finished = true; endT = 3.6; me.dr = 0; const place = order().indexOf(me) + 1, pts = crossed ? POINTS[place - 1] : 0; dnf = !crossed;   // (not over the line when the rest have long finished: no points)
    newBest = false; const was = best[trk.name];
    if (crossed && (!was || raceT < was)) { best[trk.name] = +raceT.toFixed(2); newBest = !!was; api.save({ best }); }
    say(!crossed ? 'DID NOT FINISH' : place === 1 ? 'YOU WIN!' : `${place}${SUFFIX[place - 1]} PLACE`, 3, crossed && place <= 3 ? '#f8d838' : '#f8f8f0');
    haptic(crossed && place <= 3 ? 'success' : 'warning'); sfx(place <= 3 ? 1046 : 392, .4, 'square', .05, place <= 3 ? 400 : -100);
    if (live) api.score(pts);
  }
  function ai(k, dt) {
    const d = k.d, look = Math.round(5 + k.v / 26), ti = k.idx + look, tp = P(ti), base = trk.off[((ti % PTS) + PTS) % PTS];
    // overtaking: spot a kart just ahead on a similar line and move to the side with more room
    let want = base + d.bias;
    for (const o of karts) { if (o === k || o.sink > 0) continue; const gap = (prog(o) - prog(k)) * trk.seg, dl = latOf(o) - latOf(k);
      if (gap > 0 && gap < 34 && Math.abs(dl) < 13 && k.v > o.v - 8) { k.passT = 1.4; k.passLat = latOf(o) + (latOf(o) > 0 ? -17 : 17); }
      if (o === me && d.aggr > .5 && gap < 0 && gap > -40 && !k.passT) want = want + (latOf(me) - want) * d.aggr * .6; } // block the player
    if (k.passT > 0) { k.passT -= dt; want = k.passLat; }
    k.lat += (clamp(want, -(HALF - 7), HALF - 7) - k.lat) * Math.min(1, dt * 3);
    const tx = tp.x + tp.nx * k.lat, ty = tp.y + tp.ny * k.lat;
    let steer = clamp(angDiff(Math.atan2(ty - k.y, tx - k.x), k.a) * 3.2, -1, 1);
    let vl = 999; for (let j = 0; j < 18; j += 2) vl = Math.min(vl, trk.vlim[(k.idx + j) % PTS] + j * 3);
    let cap = vl * d.corner * (k === me ? 1 : 1.3);
    if (k !== me) { const gap = (prog(k) - prog(me)) * trk.seg; k.band = clamp(1 - gap / 300 * .08, .9, 1.07); } // rivals far ahead ease off, rivals behind push
    if (k.wob > 0) { k.wob -= dt; steer += Math.sin(raceT * 13) * .9; cap *= .85; } else if (Math.random() < d.slip * dt) k.wob = .7;
    drive(k, steer, cap, dt);
  }
  function bumps() {
    for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) { const a = karts[i], b = karts[j]; if (a.sink > 0 || b.sink > 0 || a.ghost || b.ghost) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d >= KW || d === 0) continue;
      const push = (KW - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const back = prog(a) < prog(b) ? a : b; back.v *= .9;
      if ((a === me || b === me) && !me.bumpT) { me.bumpT = .3; haptic('medium'); sfx(150, .08, 'square', .05); shake = .15; } }
    me.bumpT = Math.max(0, (me.bumpT || 0) - 1 / 60);
  }
  // your kart: steering that builds while you hold, drifts with spark turbos, and a light hand on the wheel when you let go
  // particles come from a pool and go back to it: none made afresh each frame
  const FREE = [], part = (x, y, vx, vy, l, c, sp = 0) => { const p = FREE.pop() || {}; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.l = l; p.c = c; p.sp = sp; parts.push(p); };
  function pilot(dt) {
    const k = me, s = held ? held.s : 0, g = at(k.x, k.y), rough = g === GROUND || g === RUNOFF || g === WATER;
    if (s !== side) { side = s; holdT = 0; } else holdT += dt;
    const amt = held ? held.amt : 0;
    let steer = s ? s * amt * (K.nudge + (1 - K.nudge) * Math.min(1, holdT / K.ramp)) : 0;
    if (!k.dr) {
      if (s && amt > .8 && holdT >= K.driftAfter && k.v > K.driftSpeed && !rough && !k.sink) { k.dr = s; k.drT = 0; k.tier = 0; k.hop = .18; sfx(240, .08, 'square', .04, 120); haptic('light'); }
    } else {
      k.drT += dt;
      const tier = k.drT >= K.orange ? 2 : k.drT >= K.blue ? 1 : 0;
      if (tier > k.tier) { k.tier = tier; haptic('light'); sfx(tier === 2 ? 990 : 660, .08, 'square', .04); }
      if (s !== k.dr || k.v < 60 || rough || k.sink) {   // let go (or switch sides) to end it
        // only a drift you end yourself fires its turbo (not one cut short by a crash or the grass)
        if (tier && s !== k.dr && k.v >= 60 && !rough && !k.sink) { k.boost = Math.max(k.boost, K.turbo * tier); haptic('medium'); sfx(520, .3, 'sawtooth', .04, 600); if (tier === 2 && !msg) say('TURBO!', .6, '#f8a030'); }
        k.dr = 0; k.tier = 0;
      } else steer = k.dr * (K.driftWide + (K.driftTurn - K.driftWide) * clamp((amt - .25) / .6, 0, 1));   // slide in to widen it
    }
    // not steering: the nose eases towards the road's direction, so a straight needs no tapping
    if (!s && !k.dr && k.v > 30 && !rough && !k.sink) { const p = P(k.idx + 3), e = angDiff(Math.atan2(p.ty, p.tx), k.a); if (Math.abs(e) < .6) k.a += e * Math.min(1, K.assist * dt); }
    k.hop = Math.max(0, (k.hop || 0) - dt);
    k.slip = (k.slip || 0) + ((k.dr || 0) * K.driftAngle - (k.slip || 0)) * Math.min(1, dt * 9);   // the tail swings out, and back after
    drive(k, steer, 999, dt);
  }
  let live = true, newBest = false, dnf = false;
  const clock = s => `${s / 60 | 0}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  function step(dt, auto) {
    raceT += dt;
    for (const k of karts) if (k === me && !auto) {
      pilot(dt);
    } else ai(k, dt);
    bumps();
    // slipstream: tuck in right behind a rival for a moment and you pull up to them faster
    if (!auto) {
      let behind = false; for (const o of karts) { if (o === me || o.sink > 0) continue; const gap = (prog(o) - prog(me)) * trk.seg; if (gap > 10 && gap < 46 && Math.abs(latOf(o) - latOf(me)) < 8) behind = true; }
      draftT = behind && me.v > 90 ? draftT + dt : Math.max(0, draftT - dt * 2);
      const was = me.draft > 1; me.draft = draftT > .5 ? 1.1 : 1;
      if (me.draft > 1 && !was) { sfx(300, .25, 'sawtooth', .025, 200); haptic('light'); }
      if (me.draft > 1 && Math.random() < .5) part((Math.random() - .5) * 30, -10 - Math.random() * 10, 0, 40, .25, '#f8f8f0a0');
    }
    if (me.rough && me.v > 50 && (raceT * 20 | 0) % 3 === 0 && !auto) haptic('tick');
    if (me.dr && !auto) for (let sx = -14; sx <= 14; sx += 28) if (Math.random() < .8) part(sx + (Math.random() - .5) * 3, 0, sx * 3 + (Math.random() - .5) * 20, -20 - Math.random() * 30, .22, me.tier === 2 ? (Math.random() < .5 ? '#f89830' : '#f8e050') : me.tier === 1 ? (Math.random() < .5 ? '#58b8f8' : '#c8f0f8') : '#f8f8f0', 1);
    if (me.rough || me.boost) for (let n = 0; n < 2; n++) part((Math.random() - .5) * 18, 0, (Math.random() - .5) * 30, -10 - Math.random() * 20, .4, me.boost ? (Math.random() < .5 ? '#f8d030' : '#f86020') : me.rough === .5 ? '#f0f0f0' : trk.th.run);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.l -= dt; } { let n = 0; for (const p of parts) if (p.l > 0) parts[n++] = p; else FREE.push(p); parts.length = n; }
    // wrong way and overtakes
    const p = P(me.idx); wrongT = Math.cos(me.a) * p.tx + Math.sin(me.a) * p.ty < -.3 && me.v > 15 ? wrongT + dt : 0;
    const place = order().indexOf(me) + 1;
    if (!auto && lastPlace && place < lastPlace && raceT > 3) { haptic('light'); sfx(700, .1, 'square', .04, 200); if (!msg || msg.l < .5) say(`${place}${SUFFIX[place - 1]}!`, .7, '#b8f878'); }
    lastPlace = place;
  }

  const self = {
    reset() { timers.clear();
      themeI = (themeI + 1) % THEMES.length; const th = THEMES[themeI];
      if (!trk || trk.th !== th) { trk = buildTrack(th); trk.solid = trk.props.filter(o => KINDS[o.kind][1]).map(o => ({ x: o.x, y: o.y, r: KINDS[o.kind][1] })); img = null; mini = null; }
      const lineup = shuffle([...DRIVERS]);
      karts = [...lineup, YOU].map((d, j) => { const g = trk.grid[j]; return { d, x: g.x, y: g.y, a: g.a, md: g.a, v: 0, st: 0, idx: g.idx, frac: 0, lap: -1, lat: (j & 1 ? 1 : -1) * 13, boost: 0, sink: 0, wob: 0, passT: 0, done: false, si: [...DRIVERS, YOU].indexOf(d),
        // every field set from the start, so a kart keeps one shape (and its numbers aren't boxed afresh each frame)
        passLat: 0, doneT: 0, ghost: 0, rough: 0, band: 1, draft: 1, bumpT: 0, dr: 0, drT: 0, tier: 0, slip: 0, hop: 0 }; });
      for (const k of karts) k.d = { ...k.d, bias: k.d === YOU ? 0 : (Math.random() - .5) * 8 };
      me = karts[5]; best = api.load({ best: {} }).best || {}; draftT = 0; side = 0; holdT = 0; newBest = false; t = 0; raceT = 0; go = 3.2; msg = null; held = null; flash = 0; shake = 0; finished = false; endT = 0; results = null; camA = me.a; parts = []; wrongT = 0; lastPlace = 6; live = true; dnf = false;
    },
    resize(w, h) { W = w; H = h; img = null; },
    update(dt) { timers.update(dt);
      dt = Math.min(dt, 1 / 20); t += dt; flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (go > 0) { const was = Math.ceil(go); go -= dt; const now = Math.ceil(go);
        if (now !== was && now > 0 && now <= 3) { sfx(440, .12, 'square', .05); haptic('light'); }
        if (go <= 0) { sfx(880, .3, 'square', .05); haptic('medium'); say('GO!', .8, '#58e858'); } camA = me.a; return; }
      step(dt, finished);
      camA += angDiff(me.a, camA) * Math.min(1, dt * 7);
      if (finished) { endT -= dt; if (endT <= 0 && live) { live = false; api.over(); } }
      else if (karts.every(k => k.done || k === me) && raceT - Math.max(...karts.filter(k => k !== me).map(k => k.doneT)) > 12) { me.done = true; me.doneT = raceT; finish(); }
    },
    fx(dt) { dt = Math.min(dt, 1 / 20); t += dt; if (go > 0) return; step(dt, true); camA += angDiff(me.a, camA) * Math.min(1, dt * 7); },
    draw(c) {
      if (!SPR) SPR = buildSprites();
      c.imageSmoothingEnabled = false;
      const th = trk.th, hy = Math.round(H * .3), f = W * .9, s0 = W * .19 / KW, d = f / s0, camH = (H - 12 - hy) / s0;
      const ox = shake ? (Math.random() - .5) * 3 : 0, ca = Math.cos(camA), sa = Math.sin(camA), cx = me.x - ca * d, cy = me.y - sa * d;
      c.save(); c.translate(ox | 0, 0);
      // sky and the panorama that wraps all the way round
      if (!skyG || skyG.th !== th || skyG.hy !== hy) { skyG = { th, hy, g: c.createLinearGradient(0, 0, 0, hy) }; skyG.g.addColorStop(0, th.sky[0]); skyG.g.addColorStop(1, th.sky[1]); }
      c.fillStyle = skyG.g; c.fillRect(-4, 0, W + 8, hy);
      const pv = pano(th), srcW = 1024 * 2 * Math.atan(W / 2 / f) / (Math.PI * 2), sc = W / srcW, ph = 56 * sc, px0 = (((camA / (Math.PI * 2)) * 1024 - srcW / 2) % 1024 + 1024) % 1024;
      const seg1 = Math.min(srcW, 1024 - px0); c.drawImage(pv, px0, 0, seg1, 56, 0, hy - ph, seg1 * sc, ph); if (seg1 < srcW) c.drawImage(pv, 0, 0, srcW - seg1, 56, seg1 * sc, hy - ph, (srcW - seg1) * sc + 1, ph);
      // ground plane
      const gh = H - hy; if (!img || img.width !== W || img.height !== gh) { img = c.createImageData(W, gh); img32 = new Int32Array(img.data.buffer); }
      paintGround(img32, trk.col32, trk.outer32, th.hazeRGB || (th.hazeRGB = hex(th.haze)), gh, camH, f, cx, cy, ca, sa);
      c.putImageData(img, ox | 0, hy);
      // billboards: scenery, landmarks, the start gantry and every kart, far to near
      // (the list and its entries are reused every frame: no garbage)
      const vis = VIS; CAM.cx = cx; CAM.cy = cy; CAM.ca = ca; CAM.sa = sa; CAM.n = 0;
      for (const o of trk.props) { proj(o.x, o.y, PJ); const fw = PJ[0], lt = PJ[1]; if (fw < 6 || fw > 760) continue; const s = f / fw, sx = W / 2 + lt * s; if (sx < -200 * s || sx > W + 200 * s) continue; add(fw, lt, o, null, null); }
      for (const k of karts) { proj(k.x, k.y, PJ); const fw = PJ[0], lt = PJ[1]; if (fw > 4 && fw < 760) add(fw, lt, null, k, null); }
      const s0p = P(0), gA = proj(s0p.x + s0p.nx * (HALF + 6), s0p.y + s0p.ny * (HALF + 6), GATE[0]), gB = proj(s0p.x - s0p.nx * (HALF + 6), s0p.y - s0p.ny * (HALF + 6), GATE[1]);
      if (gA[0] > 6 && gB[0] > 6) add((gA[0] + gB[0]) / 2, 0, null, null, GATE);
      vis.length = CAM.n; vis.sort(farFirst);
      for (const v of vis) {
        if (v.gate) { const fa = v.gate[0][0], la = v.gate[0][1], fb = v.gate[1][0], lb = v.gate[1][1], sA = f / fa, sB = f / fb, xa = W / 2 + la * sA, xb = W / 2 + lb * sB, ya = hy + camH * sA, yb = hy + camH * sB, hA = 34 * sA, hB = 34 * sB;
          c.fillStyle = '#d0d0d8'; c.fillRect(xa - 1.5 * sA, ya - hA, Math.max(1, 3 * sA), hA); c.fillRect(xb - 1.5 * sB, yb - hB, Math.max(1, 3 * sB), hB);
          const n = 12; for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n, X0 = xa + (xb - xa) * u0, X1 = xa + (xb - xa) * u1, T0 = (ya - hA) + ((yb - hB) - (ya - hA)) * u0, T1 = (ya - hA) + ((yb - hB) - (ya - hA)) * u1, bh0 = 8 * (sA + (sB - sA) * u0);
            c.fillStyle = i % 2 ? '#202028' : '#f4f4ec'; c.beginPath(); c.moveTo(X0, T0); c.lineTo(X1, T1); c.lineTo(X1, T1 + bh0); c.lineTo(X0, T0 + bh0); c.fill(); }
          continue; }
        const s = f / v.fw, sx = W / 2 + v.lt * s, sy = hy + camH * s;
        if (v.k) { const k = v.k; if (k.sink > 0 && (t * 10 | 0) % 2) continue; if (k.ghost && (t * 12 | 0) % 2) continue;
          const rel = angDiff(k.a, camA) + k.st * .25 + (k.slip || 0), fr = rel < -.22 ? 0 : rel > .22 ? 2 : 1, im = SPR.karts[k.si][fr], w = KW * s * 26 / 24, h = w * 22 / 26, bob = (k.rough && (t * 16 | 0) % 2 ? 1 : 0) + (k.hop ? Math.round(Math.sin(k.hop / .18 * Math.PI) * 3) : 0);
          if (k === me && parts.length) for (const p of parts) if (!p.sp) { c.fillStyle = p.c; c.fillRect(sx + p.x * s / 3, sy - 2 + p.y * s / 4, Math.max(1, s * .5), Math.max(1, s * .5)); }
          c.drawImage(im, Math.round(sx - w / 2), Math.round(sy - h - bob), Math.round(w), Math.round(h));
          // drift sparks fly from the rear wheels, in front of the kart
          if (k === me && me.dr) { const z = Math.max(2, Math.round(s * .8)); for (const p of parts) if (p.sp) { c.fillStyle = p.c; c.fillRect(Math.round(sx + p.x * s / 3 - z / 2), Math.round(sy - 2 + p.y * s / 4), z, z); } }
          if (k.boost > 0 && (t * 20 | 0) % 2) { c.fillStyle = '#f8d030'; c.fillRect(sx - w * .2, sy - h * .15, w * .1, h * .2); c.fillRect(sx + w * .1, sy - h * .15, w * .1, h * .2); }
          if (k !== me && w > 9 && v.fw < 260) { c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = '#101018c0'; const tw = k.d.name.length * 6 + 2; c.fillRect(Math.round(sx - tw / 2), Math.round(sy - h - 10), tw, 8); c.fillStyle = k.d.col; c.fillText(k.d.name, Math.round(sx), Math.round(sy - h - 3)); }
          continue; }
        const o = v.o, fr = SPR[o.kind], im = fr[fr.length > 1 ? ((o.kind === 'windmill' ? t * 6 : t * 2) | 0) % fr.length : 0], ws = KINDS[o.kind][0], w = im.width * ws * s, h = im.height * ws * s;
        if (h < 1) continue; c.drawImage(im, Math.round(sx - w / 2), Math.round(sy - h), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      }
      c.restore();
      if (flash) { c.fillStyle = '#ffffff60'; c.fillRect(0, 0, W, H); }
      hud(c);
    },
    down(px) { held = wheel(px); },
    move(px, py, p) { if (p && held) held = wheel(px); },
    up() { held = null; },
    key(k, d) { if (k === 'ArrowLeft' || k === 'ArrowRight') held = d ? { s: k === 'ArrowLeft' ? -1 : 1, amt: 1 } : null; },
  };

  const FONTS = {}, fontOf = size => FONTS[size] || (FONTS[size] = `${size}px "Press Start 2P", monospace`);   // made once a size
  function text(c, s, x, y, col, size = 6, align = 'left') { c.font = fontOf(size); c.textAlign = align; c.fillStyle = '#101018'; c.fillText(s, x + 1, y + 1); c.fillStyle = col; c.fillText(s, x, y); }
  function hud(c) {
    const ord = order(), place = ord.indexOf(me) + 1;
    // place and lap
    c.fillStyle = '#10101890'; c.fillRect(2, 2, 46, 39);
    text(c, `${place}`, 5, 17, place === 1 ? '#f8d838' : place <= 3 ? '#f8f8f0' : '#f8a868', 12); text(c, SUFFIX[place - 1], 19, 10, '#f8f8f0'); text(c, '/6', 19, 18, '#a8a8b8');
    text(c, `LAP ${clamp(me.lap + 1, 1, LAPS)}/${LAPS}`, 5, 28, '#f8f8f0'); text(c, clock(go > 0 ? 0 : finished ? me.doneT || raceT : raceT), 5, 38, '#a8a8b8');
    // who is just ahead and just behind, with a time gap
    const ahead = ord[place - 2], behind = ord[place];
    const gap = (a, b) => Math.abs(prog(a) - prog(b)) * trk.seg / Math.max(70, me.v);
    let gy = 50; for (let n = 0; n < 2; n++) { const o = n ? behind : ahead, sign = n ? '+' : '-'; if (!o || go > 0 || finished) continue; c.fillStyle = '#10101890'; c.fillRect(2, gy - 7, 70, 9); c.fillStyle = o.d.col; c.fillRect(4, gy - 5, 4, 5); text(c, `${o.d.name.slice(0, 5)}`, 10, gy, '#f8f8f0'); text(c, `${sign}${o.done ? '--' : gap(o, me).toFixed(1)}`, 71, gy, sign === '-' ? '#f8a868' : '#b8f878', 6, 'right'); gy += 10; }
    // minimap
    const M = Math.round(clamp(W * .27, 40, 64)), mx = W - M - 3, my = 3;
    if (!mini || mini.width !== M) mini = mk(M, M, (mc) => { mc.fillStyle = '#101018a0'; mc.fillRect(0, 0, M, M); const sc = (M - 6) / WORLD; mc.strokeStyle = '#f8f8f0'; mc.lineWidth = 2.5; mc.beginPath(); trk.line.forEach((p, i) => i ? mc.lineTo(3 + p.x * sc, 3 + p.y * sc) : mc.moveTo(3 + p.x * sc, 3 + p.y * sc)); mc.closePath(); mc.stroke(); mc.strokeStyle = trk.th.road; mc.lineWidth = 1.2; mc.stroke(); const p0 = trk.line[0]; mc.fillStyle = '#f8d838'; mc.fillRect(2 + p0.x * sc, 2 + p0.y * sc, 2, 2); });
    c.drawImage(mini, mx, my); const sc = (M - 6) / WORLD;
    for (const k of [...karts].reverse()) { if (k === me) continue; c.fillStyle = '#101018'; c.fillRect(mx + 2 + k.x * sc - .5 | 0, my + 2 + k.y * sc - .5 | 0, 3, 3); c.fillStyle = k.d.col; c.fillRect(mx + 2 + k.x * sc | 0, my + 2 + k.y * sc | 0, 2, 2); }
    if ((t * 4 | 0) % 2) { c.fillStyle = '#ffffff'; c.fillRect(mx + 1.5 + me.x * sc | 0, my + 1.5 + me.y * sc | 0, 3, 3); }
    // countdown lights and track name
    if (go > 0) { const n = Math.ceil(go); c.fillStyle = '#101018c0'; c.fillRect(W / 2 - 22, H * .36, 44, 14);
      for (let i = 0; i < 3; i++) { c.fillStyle = 3 - i >= n && n <= 3 ? '#f83838' : '#402020'; disc(c, W / 2 - 13 + i * 13, H * .36 + 7, 4); }
      c.fillStyle = '#101018c0'; c.fillRect(0, H * .36 - 16, W, 11); text(c, trk.name, W / 2, H * .36 - 8, '#f8f8f0', 6, 'center');
      if (go > .4) { c.fillStyle = '#101018c0'; c.fillRect(0, H - 22, W, 11); text(c, go > 1.8 ? 'HOLD LEFT / RIGHT' : 'HOLD IN BENDS: DRIFT', W / 2, H - 14, '#f8d838', 6, 'center'); } }
    if (me.draft > 1 && !finished) text(c, 'SLIPSTREAM', W / 2, H - 6, (t * 8 | 0) % 2 ? '#88d8f8' : '#f8f8f0', 6, 'center');
    if (wrongT > .6 && (t * 3 | 0) % 2) text(c, 'WRONG WAY', W / 2, H * .45, '#f84848', 8, 'center');
    if (msg) text(c, msg.txt, W / 2, H * .42, msg.col, msg.txt.length > 9 ? 8 : 12, 'center');
    if (finished) { const bw = 104, bh = 86, bx = (W - bw) / 2 | 0, by = Math.min(H * .48, H - bh - 2) | 0; c.fillStyle = '#101018d8'; c.fillRect(bx, by, bw, bh); c.fillStyle = '#f8d838'; c.fillRect(bx, by, bw, 1);
      ord.forEach((k, i) => { const y = by + 10 + i * 11; text(c, `${i + 1}`, bx + 5, y, i < 3 ? '#f8d838' : '#a8a8b8'); c.fillStyle = k.d.col; c.fillRect(bx + 16, y - 5, 5, 5); text(c, k.d.name, bx + 25, y, k === me ? '#b8f878' : '#f8f8f0'); text(c, k === me && dnf ? 'DNF' : `+${POINTS[i]}`, bx + bw - 4, y, k === me ? '#b8f878' : '#a8a8b8', 6, 'right'); });
      const b = best[trk.name];
      text(c, newBest ? `NEW BEST ${clock(b)}` : `${clock(me.doneT || raceT)}  BEST ${b ? clock(b) : '--'}`, W / 2, by + bh - 6, newBest && (t * 4 | 0) % 2 ? '#f8d838' : '#f8f8f0', 6, 'center'); }
  }
  return self;
}

export default {
  id: 'pocket-kart', title: 'Pocket Kart', tag: 'Advance · Racing', retro: true, era: 'advance', pal: 'grape', w: 160, h: 160, maxW: 240, maxH: 280, goal: 6,
  hint: 'Two laps against five rivals; you start at the back. Hold the left or right side to steer, sliding your thumb towards the middle to steer gently. Hold through a bend to drift, and let go for a spark turbo. Stay on the road, hit the orange boost pads, tuck in behind a rival to slipstream, and watch the chevrons for sharp bends. Finish on the podium to win.',
  make,
};
