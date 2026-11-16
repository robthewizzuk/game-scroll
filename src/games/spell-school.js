import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { text } = gs.pixel;
const { resample, simplify, pathLength, bounds, Shapes } = gs.strokes;

// First year at a school for young spellcasters. Mischief creatures drift down the great hall,
// each showing the rune that banishes it. Trace that rune with your finger anywhere on screen
// to cast it: neatly for bonus points, big to hit every creature showing it, small for a quick bolt,
// or over one creature to aim at it. A wrong rune jams the wand. Lessons teach new runes, spells made
// of two runes, and runes for yourself (a heart, a star, a spiral) paid for with the wand's charge.
// Every third lesson ends in an exam against the Ink Golem.
const RUNES = ['-', '|', 'V', '^', 'O', 'Z'];             // creature runes
const SELF = ['H', 'S', '@'];                             // runes for yourself
const RNAME = { '-': 'LINE', '|': 'DROP', V: 'V', '^': 'PEAK', O: 'RING', Z: 'ZIGZAG', H: 'HEART', S: 'STAR', '@': 'SPIRAL' };
const RCOL = { '-': '#f8d838', '|': '#80f8ff', V: '#f86888', '^': '#88f070', O: '#c890ff', Z: '#f8a040', H: '#f84870', S: '#f8f8a0', '@': '#60c8f8' };
const OPP = { '-': '|', '|': '-', V: '^', '^': 'V' };      // what a mirror imp's rune is, flipped
// what each lesson teaches (lesson 1 starts with LINE, DROP and V)
const LEARN = { 2: '^', 3: 'O', 4: 'Z', 5: 'H', 6: 'S', 7: '@' };
// spells made of two runes drawn one after the other
const COMBOS = [
  { name: 'CROSS', a: '-', b: '|', at: 2, say: 'LINE + DROP: CLEARS LINES + DROPS' },
  { name: 'DIAMOND', a: 'V', b: '^', at: 3, say: 'V + PEAK: CLEARS VS + PEAKS' },
  { name: 'WARD', a: 'O', b: 'O', at: 4, say: 'RING + RING: A FLOOR SHIELD' },
  { name: 'STORM', a: 'O', b: 'Z', at: 5, say: 'RING + ZIGZAG: 3 LIGHTNING BOLTS' },
];
const TRICKS = { swap: { at: 3, say: 'SWAPPER IMP: ITS RUNE CHANGES!' }, fade: { at: 4, say: 'FADING GHOST: REMEMBER ITS RUNES' }, mirror: { at: 5, say: 'MIRROR IMP: DRAW ITS RUNE FLIPPED' } };
const KINDS = [
  { k: 'imp', n: 1, sp: 13, col: '#e05050' },
  { k: 'ghost', n: 1, sp: 17, col: '#d8e8f8' },
  { k: 'bat', n: 2, sp: 15, col: '#8858c8' },
  { k: 'gargoyle', n: 3, sp: 9, col: '#909098' },
];
let W = 160, H = 176;

function rune(c, r, x, y, s, col) {
  c.strokeStyle = col; c.lineWidth = Math.max(1, s / 4); c.lineJoin = 'round'; c.beginPath();
  if (r === '-') { c.moveTo(x - s, y); c.lineTo(x + s, y); }
  else if (r === '|') { c.moveTo(x, y - s); c.lineTo(x, y + s); }
  else if (r === 'V') { c.moveTo(x - s, y - s); c.lineTo(x, y + s); c.lineTo(x + s, y - s); }
  else if (r === '^') { c.moveTo(x - s, y + s); c.lineTo(x, y - s); c.lineTo(x + s, y + s); }
  else if (r === 'O') c.arc(x, y, s, 0, 7);
  else if (r === 'Z') { c.moveTo(x - s, y - s); c.lineTo(x + s, y - s); c.lineTo(x - s, y + s); c.lineTo(x + s, y + s); }
  else if (r === 'H') { for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283, hx = x + 16 * Math.sin(a) ** 3 / 16 * s, hy = y - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16 * s; i ? c.lineTo(hx, hy) : c.moveTo(hx, hy); } }
  else if (r === 'S') { for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5; i ? c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s) : c.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s); } }
  else if (r === '@') { for (let i = 0; i <= 30; i++) { const u = i / 30, a = u * 6.283 * 1.8, rr = s * (.15 + u * .85); i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } }
  c.stroke();
}

// Rune reader. The line is evened out, then read for going round (a ring, heart, star or spiral: how
// far round its middle it goes, how evenly far from it, and its sharp corners) and for its straight
// runs between corners: one run is a LINE or a DROP by its slope, two that go down then up (or up then
// down) are a V or a PEAK, three or more that turn back hard each time are a ZIGZAG. Anything else (a
// scribble, a triangle, a loop twice round) casts nothing. On real drawings from Quick, Draw! it reads
// 98 rings in 100, 99 lines, 91 zigzags and 91 stars; made-up scribbles cast 4 times in 100.
// Each rune's ideal shape in a 1 x 1 box, to measure how neatly it was drawn.
const ring = n => Array.from({ length: n + 1 }, (_, i) => [.5 + Math.cos(i / n * 6.283) / 2, .5 + Math.sin(i / n * 6.283) / 2]);
const IDEAL = { '-': [[0, .5], [1, .5]], '|': [[.5, 0], [.5, 1]], V: [[0, 0], [.5, 1], [1, 0]], '^': [[0, 1], [.5, 0], [1, 1]], O: ring(24) };
const CLOSED = new Shapes(['circle', 'heart', 'star', 'triangle', 'square']);
// distance from point q to the segment a-b
const segDist = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = clamp(((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L, 0, 1); return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
export function recognise(pts) {
  if (pts.length < 3) return null;
  const raw = pts.map(p => [p.x, p.y]), len = pathLength(raw);
  if (len < 12) return null;
  const p = resample(raw, 48), b = bounds(p), size = Math.max(b.w, b.h);
  const a = p[0], z = p[p.length - 1], gap = Math.hypot(z[0] - a[0], z[1] - a[1]);
  // neatness (1 = perfect): how far the line strays from the rune's ideal shape stretched over the same box, both ways
  // round (the line from the ideal, and the ideal from the line, so a missing part counts too)
  const tidy = r => {
    const I = IDEAL[r];
    const w = Math.max(b.w, size * .08), h = Math.max(b.h, size * .08), x0 = b.cx - w / 2, y0 = b.cy - h / 2, T = I.map(([u, v]) => [x0 + u * w, y0 + v * h]);
    let e = 0; for (const q of p) { let m = Infinity; for (let i = 1; i < T.length; i++) m = Math.min(m, segDist(q, T[i - 1], T[i])); e += m; }
    const ts = resample(T, 24); let f = 0; for (const q of ts) { let m = Infinity; for (const s of p) m = Math.min(m, Math.hypot(q[0] - s[0], q[1] - s[1])); f += m; }
    return 1 - (e / p.length + f / ts.length) / size * 5;
  };
  // what was read: the rune, how neat (0..1), how big, and where (for aiming)
  const out = (r, neat) => ({ r, neat: clamp(neat, 0, 1), size, cx: b.cx, cy: b.cy });
  // going round: how far round its middle the line goes, and how evenly far from it
  let sweep = 0, rs = 0, rr = 0, ri = 0;
  const rad = [];
  for (let i = 0; i < p.length; i++) {
    const dx = p[i][0] - b.cx, dy = p[i][1] - b.cy, r = Math.hypot(dx, dy); rs += r; rr += r * r; rad.push(r);
    if (i) { let d = Math.atan2(dy, dx) - Math.atan2(p[i - 1][1] - b.cy, p[i - 1][0] - b.cx); d = Math.atan2(Math.sin(d), Math.cos(d)); sweep += d; }
  }
  sweep = Math.abs(sweep) / (Math.PI * 2);
  const rm = rs / p.length, spread = Math.sqrt(Math.max(0, rr / p.length - rm * rm)) / (rm || 1);
  // how steadily the distance from the middle grows (or shrinks) along the line: a spiral's does
  { const n = rad.length, mi = (n - 1) / 2; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const u = i - mi, v = rad[i] - rm; sxy += u * v; sxx += u * u; syy += v * v; } ri = sxy / Math.sqrt(sxx * syy || 1); }
  // sharp corners: where the line turns hard over a short stretch (a ring turns evenly and has none)
  let sharp = 0;
  for (let i = 2, was = false; i < p.length - 2; i++) {
    let d = Math.atan2(p[i + 2][1] - p[i][1], p[i + 2][0] - p[i][0]) - Math.atan2(p[i][1] - p[i - 2][1], p[i][0] - p[i - 2][0]);
    d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); const is = d > 1.2; if (is && !was) sharp++; was = is;
  }
  // straight runs: the line thinned to its corners, neighbours that go the same way joined
  const runsAt = tol => {
    const q = simplify(p, Math.max(1.5, size * tol)), segs = [];
    for (let i = 1; i < q.length; i++) { const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1], l = Math.hypot(dx, dy); if (l > size * tol * .75) segs.push({ dx, dy, l, ang: Math.atan2(dy, dx), a: q[i - 1], b: q[i] }); }
    for (let i = 1; i < segs.length; i++) { const s = segs[i - 1], t = segs[i], d = Math.abs(Math.atan2(Math.sin(t.ang - s.ang), Math.cos(t.ang - s.ang))); if (d < .45) { s.dx += t.dx; s.dy += t.dy; s.l = Math.hypot(s.dx, s.dy); s.ang = Math.atan2(s.dy, s.dx); s.b = t.b; segs.splice(i--, 1); } }
    return segs;
  };
  // neatness of straight-line runes: how close the line keeps to its runs (1 = ruler straight)
  const straight = segs => { let e = 0; for (const q of p) { let m = Infinity; for (const s of segs) m = Math.min(m, segDist(q, s.a, s.b)); e += m; } return 1 - e / p.length / size * 9; };
  // SPIRAL: round more than one and a half times, getting steadily wider (or narrower)
  if (sweep > 1.35 && Math.abs(ri) > .6 && Math.min(b.w, b.h) > size * .4) return out('@', 1);
  const closed = gap < size * .45;
  // STAR: five points drawn in one line goes twice round its middle, with hard corners
  if (closed && sweep > 1.5 && sweep < 2.6 && sharp >= 4) { const m = CLOSED.rank(p); if (m[0].name === 'star') return out('S', 1); }
  // RING, HEART, STAR: shapes that come back to their start
  if (closed && sweep > .72 && sweep < 1.6 && Math.min(b.w, b.h) > size * .4) {
    const m = CLOSED.rank(p), top = m[0];
    if (top.name === 'star' && sharp >= 4) return out('S', 1);
    if (top.name === 'heart' && (sharp >= 1 || top.score > m[1].score + .04)) return out('H', 1);
    if (spread < .3 && sharp < 2) return out('O', tidy('O'));
    return null;
  }
  if (sweep > .72 && sweep < 1.6 && gap < size * .6 && Math.min(b.w, b.h) > size * .4 && spread < .3 && sharp < 2) return out('O', tidy('O'));
  const segs = runsAt(.16);
  const n = segs.length, deg = s => { let d = Math.abs(s.ang * 180 / Math.PI); return d > 90 ? 180 - d : d; };   // 0 = flat, 90 = upright
  // ZIGZAG: a Z or any zigzag of three or more strokes that turn back hard each time
  const zigzag = all => {
    const big = Math.max(...all.map(s => s.l)), segs = all.filter((s, i) => (i && i < all.length - 1) || s.l > big * .3);
    if (gap < size * .3 || segs.some(s => s.l < big * .2)) return false;
    const n = segs.length; if (n < 3 || n > 14 || sharp < Math.max(2, n - 2)) return false;
    const alt = k => segs.every((s, i) => !i || Math.sign(s[k]) === -Math.sign(segs[i - 1][k]) && Math.abs(s[k]) > s.l * .2 && Math.abs(segs[i - 1][k]) > segs[i - 1].l * .2);
    const isZ = n === 3 && deg(segs[0]) < 38 && deg(segs[2]) < 38 && Math.sign(segs[0].dx) === Math.sign(segs[2].dx) && Math.sign(segs[1].dx) === -Math.sign(segs[0].dx) && Math.abs(segs[1].dy) > segs[1].l * .35;
    return isZ || alt('dx') || alt('dy');
  };
  // a zigzag's neatness is how straight its strokes are (it has no one ideal shape: any number of strokes)
  if (zigzag(segs)) return out('Z', 1 - (1 - straight(segs)) * 3.5);
  if (sharp >= 3) { const fine = runsAt(.06); if (zigzag(fine)) return out('Z', 1 - (1 - straight(fine)) * 3.5); }
  if (n === 1 || (len < gap * 1.15)) {
    const d = deg({ ang: Math.atan2(z[1] - a[1], z[0] - a[0]) }), one = [{ a, b: z }];
    if (d < 32) return out('-', tidy('-')); if (d > 58) return out('|', tidy('|')); return null;
  }
  if (n === 2) {
    const [s, t] = segs;
    if (s.dy * t.dy < 0 && Math.abs(s.dy) > s.l * .45 && Math.abs(t.dy) > t.l * .45) { const r = s.dy > 0 ? 'V' : '^'; return out(r, tidy(r)); }
    return null;
  }
  return null;
}

function make(api) {
  const feel = new Feel({ pixel: true }), ready = new Ready();
  // Knobs: the numbers that set how it feels (docs/feel-words.md); node scripts/knobs.mjs spell-school lists them.
  const K = gs.tweak('Feel', {
    fall: [1, .5, 2, 'how fast creatures drift down'],
    gap: [3.2, 1.5, 5, 'seconds between creatures at the start'],
    jam: [.6, 0, 1.5, 'seconds the wand jams after a wrong rune'],
    jamUnread: [.25, 0, 1, 'seconds the wand jams after a line it could not read'],
    neat: [.7, .4, .95, 'how neat a rune must be for NEAT'],
    perfect: [.85, .6, 1, 'how neat a rune must be for PERFECT'],
    big: [.5, .3, .8, 'a rune this big (share of the screen) hits every creature showing it'],
    small: [.2, .05, .35, 'a rune this small (share of the screen) flies twice as fast'],
    aim: [14, 4, 40, 'how close to a creature a rune must be drawn to aim at it'],
    comboGap: [.9, .4, 2, 'seconds between two runes for a two-rune spell'],
    comboCost: [4, 1, 10, 1, 'charge a two-rune spell costs'],
    freeze: [2.5, 1, 5, 'seconds a STAR stops the hall'],
    pull: [40, 15, 80, 'how far a SPIRAL lifts every creature'],
    lives: [3, 1, 6, 1, 'hearts at the start'],
  });
  const COST = { H: 8, S: 6, '@': 5 }, CHARGE = 10;
  let foes, bolts, zaps, stroke, ink, hearts, score, t, spawnT, known, lesson, lessonKills, msgs, flash, last, prev, primed, jam;
  let charge, combo, freeze, ward, exam, exams, seen, spells, badge = { x: 0, y: 0, w: 0, h: 0, bottom: 0 };
  const floor = () => H - 26, small = () => Math.min(W, H);
  // lesson news waits its turn; quick news (fizzles, spell names) shows at once
  const tell = (txt, col = '#f8f8f0', l = 1.4, r = null) => { if (msgs.length < 6) msgs.push({ txt, col, l, r }); };
  const say = (txt, col = '#f8f8f0', l = .8) => { flash = { txt, col, l }; };
  const known6 = () => known.filter(r => RUNES.includes(r));
  const mult = () => combo >= 15 ? 3 : combo >= 6 ? 2 : 1;
  // the rune a creature needs next, after the bolts already flying at it
  const needAt = (f, k = f.inbound) => { const r = f.seq[k]; return r && f.trick === 'mirror' ? OPP[r] : r; };
  function spawn() {
    const pool = KINDS.filter(k => k.n <= Math.min(3, 1 + (lesson >> 1)));
    let k = pool[Math.random() * pool.length | 0], trick = null;
    const tricks = Object.keys(TRICKS).filter(n => lesson >= TRICKS[n].at);
    if (tricks.length && !exam && Math.random() < .3) {
      trick = tricks[Math.random() * tricks.length | 0];
      if (trick === 'swap' || trick === 'mirror') k = { k: 'imp', n: 1, sp: 12, col: trick === 'swap' ? '#60c050' : '#b0a8e0' };
      if (trick === 'fade') k = { k: 'ghost', n: 2, sp: 12, col: '#c8d8f8' };
    }
    const pick = list => list[Math.random() * list.length | 0];
    const flips = known6().filter(r => OPP[r] && known.includes(OPP[r]));
    if (trick === 'mirror' && !flips.length) trick = null;
    const seq = Array.from({ length: k.n }, () => pick(trick === 'mirror' ? flips : known6()));
    foes.push({ ...k, x: rnd(16, W - 16), y: -10, seq, wob: rnd(0, 6), hit: 0, inbound: 0, age: 0, trick, swapIn: trick === 'swap' ? rnd(.3, .5) * floor() : 0 });
    if (trick && !seen.has(trick)) { seen.add(trick); tell(TRICKS[trick].say, k.col, 2); }
  }
  function startExam() {
    exams++; exam = { n: exams };
    const seq = Array.from({ length: 4 + exams * 2 }, () => known6()[Math.random() * known6().length | 0]);
    foes.push({ k: 'golem', n: 5, sp: 4.5, col: '#283058', boss: true, x: W / 2, y: 6, seq, wob: 0, hit: 0, inbound: 0, age: 0 });
    tell(`EXAM ${exams}: THE INK GOLEM`, '#f8d838', 2.2); sfx(220, .5, 'square', .05, -80); haptic('heavy');
  }
  function nextLesson() {
    lesson++; lessonKills = 0;
    const nr = LEARN[lesson];
    if (nr) { known.push(nr); tell(`NEW RUNE: ${RNAME[nr]}`, RCOL[nr], 2.2, nr); if (SELF.includes(nr)) tell(nr === 'H' ? 'HEART: +1 LIFE, 8 CHARGE' : nr === 'S' ? 'STAR: STOPS ALL, 6 CHARGE' : 'SPIRAL: LIFTS ALL, 5 CHARGE', RCOL[nr], 2.4); }
    else tell(`LESSON ${lesson}`, '#f8d838');
    for (const s of COMBOS) if (s.at === lesson) { spells.push(s); tell(`NEW SPELL: ${s.name}`, '#f8f8f0', 1.6); tell(s.say, '#c0c0e0', 2.4); }
    haptic('success'); sfx(700, .4, 'triangle', .05, 700);
  }
  function banish(f) {
    f.dead = true; combo++;
    const pts = f.boss ? 10 * exam.n : f.n * mult();
    score += pts; api.score(score);
    if (f.boss) { hearts = Math.min(K.lives, hearts + 1); charge = CHARGE; exam = null; feel.win(f.x, f.y); tell('EXAM PASSED!', '#f8d838', 2); nextLesson(); return; }
    feel.coin(f.x, f.y, { color: f.col, text: `+${pts}` });
    if (combo > 1 && combo % 5 === 0) feel.combo(combo, f.x, f.y - 10, { color: '#f8d838' });
    if (!exam && ++lessonKills >= 6 + lesson) { if (lesson % 3 === 0) startExam(); else nextLesson(); }
  }
  function fizzle(sec, txt) {
    jam = Math.max(jam, sec); combo = 0; prev = primed = null;
    say(txt, '#a0a0c0', .7); sfx(160, .12, 'sawtooth', .03, -60); haptic('warning');
    feel.juice.burst(W / 2 + 5, floor() - 26, { n: 8, color: '#8080a0', speed: 30, life: .5 });
  }
  function bolt(f, r, fast) { f.inbound++; bolts.push({ x: W / 2 + 5, y: floor() - 26, tg: f, r, sp: fast ? 520 : 260 }); }
  function cast2(s) {
    charge -= K.comboCost; prev = primed = null; combo++;
    say(`${s.name}!`, '#f8f8f0', 1.2); feel.powerup(W / 2, floor() - 30, { color: RCOL[s.b] });
    if (s.name === 'CROSS' || s.name === 'DIAMOND') { for (const f of foes) { const r = needAt(f); if (!f.dead && (r === s.a || r === s.b)) bolt(f, r, true); } }
    else if (s.name === 'STORM') { for (const f of foes.filter(f => !f.dead && needAt(f)).sort((a, b) => b.y - a.y).slice(0, 3)) { zaps.push({ x: f.x, y: f.y, l: .3 }); f.inbound++; land(f); } feel.juice.flash('#f8f8ff', .4, .15); sfx(90, .4, 'sawtooth', .06, 300); }
    else { ward = Math.min(2, ward + 1); }
  }
  function self(r) {
    if (charge < COST[r]) { say(`${RNAME[r]} NEEDS ${COST[r]} CHARGE`, '#a0a0c0', .9); sfx(200, .1, 'triangle', .03, -60); return; }
    if (r === 'H' && hearts >= K.lives) { say('HEARTS ARE FULL', '#a0a0c0', .8); return; }
    charge -= COST[r]; prev = null;
    if (r === 'H') { hearts++; feel.powerup(W / 2, floor() - 30, { color: RCOL.H, text: '+1 LIFE' }); }
    else if (r === 'S') { freeze = K.freeze; feel.powerup(W / 2, floor() - 30, { color: RCOL.S, text: 'FREEZE!' }); feel.juice.flash('#c0e8ff', .35, .2); }
    else { for (const f of foes) { f.y = Math.max(-8, f.y - K.pull); feel.juice.burst(f.x, f.y, { n: 6, color: RCOL['@'], speed: 40 }); } feel.powerup(W / 2, floor() - 30, { color: RCOL['@'], text: 'WHIRL!' }); }
  }
  // a rune was read (or not): cast it
  function cast(g) {
    if (!g) return fizzle(K.jamUnread, '?');
    const r = g.r; last = { r, l: .6 };
    if (!known.includes(r)) return fizzle(K.jamUnread, `${RNAME[r]}? NOT LEARNED YET`);
    if (SELF.includes(r)) return self(r);
    // the second rune of a two-rune spell
    if (prev && t - prev.t < K.comboGap && charge >= K.comboCost) {
      const s = spells.find(s => (s.a === prev.r && s.b === r) || (s.a === r && s.b === prev.r));
      if (s) return cast2(s);
    }
    if (primed) primed = null;
    let tg = foes.filter(f => !f.dead && needAt(f) === r);
    const big = g.size >= K.big * small(), quick = g.size <= K.small * small();
    if (!tg.length) {
      // no creature needs it: it may be the start of a two-rune spell, else the wand jams
      if (charge >= K.comboCost && spells.some(s => s.a === r || s.b === r)) { primed = prev = { r, t }; say(`${RNAME[r]}...`, RCOL[r], K.comboGap); return; }
      return fizzle(K.jam, 'FIZZLE! WRONG RUNE');
    }
    prev = { r, t };
    if (!big) {
      // drawn over a creature: that one; else the lowest
      const near = tg.map(f => ({ f, d: Math.hypot(f.x - g.cx, f.y - g.cy) - (f.boss ? 14 : 8) })).filter(o => o.d < K.aim).sort((a, b) => a.d - b.d)[0];
      tg = [near ? near.f : tg.sort((a, b) => b.y - a.y)[0]];
    } else feel.juice.pop(g.cx, g.cy - 8, 'BIG!', { color: RCOL[r] });
    for (const f of tg) bolt(f, r, quick);
    combo++; charge = Math.min(CHARGE, charge + 1);
    if (g.neat >= K.perfect) { score += 2 * mult(); charge = Math.min(CHARGE, charge + 2); feel.juice.pop(g.cx, g.cy, 'PERFECT!', { color: '#f8f8a0' }); sfx(1200, .12, 'triangle', .04, 300); }
    else if (g.neat >= K.neat) { score += mult(); charge = Math.min(CHARGE, charge + 1); feel.juice.pop(g.cx, g.cy, 'NEAT', { color: '#e0e0f8' }); }
    api.score(score);
    sfx(600 + RUNES.indexOf(r) * 90, .15, 'triangle', .05, quick ? 900 : 600); haptic('light');
  }
  // a bolt (or lightning) reaches its creature: one rune off
  function land(f) {
    f.inbound = Math.max(0, f.inbound - 1); f.seq.shift(); f.hit = .2;
    feel.hit(f.x, f.y, { color: RCOL[f.seq[0]] || f.col, power: .25 });
    if (!f.seq.length) return banish(f);
    // the golem shuffles: its next rune may change when it is hit
    if (f.boss && !f.inbound && Math.random() < .5) { const k = known6(); f.seq[0] = k[Math.random() * k.length | 0]; f.hit = .4; }
  }
  const self_ = {
    reset() {
      foes = []; bolts = []; zaps = []; stroke = null; ink = null; hearts = K.lives; score = 0; t = 0; spawnT = 1; known = ['-', '|', 'V']; lesson = 1; lessonKills = 0;
      msgs = [{ txt: 'LESSON 1', col: '#f8d838', l: 1.5 }]; flash = null; last = null; prev = primed = null; jam = 0; charge = 0; combo = 0; freeze = 0; ward = 0; exam = null; exams = 0; seen = new Set(); spells = [];
      feel.clear(); ready.reset();
    },
    // keep a round across a hot reload (bolts in flight are dropped)
    snapshot() { return { foes: foes.map(f => ({ ...f, inbound: 0 })), hearts, score, t, known, lesson, lessonKills, charge, combo, ward, exam, exams, seen: [...seen], spells: spells.map(s => s.name) }; },
    restore(d) { ({ hearts, score, t, known, lesson, lessonKills, charge, combo, ward, exam, exams } = d); foes = d.foes; seen = new Set(d.seen); spells = COMBOS.filter(s => d.spells.includes(s.name)); bolts = []; ready.go(); },
    resize(w, h) { const dx = (w - W) / 2; W = w; H = h; if (foes) for (const f of foes) f.x = clamp(f.x + dx, 12, w - 12); },
    update(dt) {
      feel.update(dt);
      if (!ready.update(dt)) return;
      t += dt; jam = Math.max(0, jam - dt); freeze = Math.max(0, freeze - dt);
      if (msgs.length) { msgs[0].l -= dt; if (msgs[0].l <= 0) msgs.shift(); } if (flash) { flash.l -= dt; if (flash.l <= 0) flash = null; }
      if (last) { last.l -= dt; if (last.l <= 0) last = null; } if (ink) { ink.l -= dt; if (ink.l <= 0) ink = null; }
      if (primed && t - primed.t > K.comboGap) { primed = null; fizzle(K.jam, 'FIZZLE! WRONG RUNE'); }
      spawnT -= dt; const room = foes.length < (exam ? 2 : 2 + (lesson >> 1));
      if (spawnT <= 0 && room) { spawn(); spawnT = Math.max(1.3, K.gap - lesson * .25) * rnd(.8, 1.2) * (exam ? 1.8 : 1); }
      for (const f of foes) {
        f.hit = Math.max(0, f.hit - dt); f.age += dt;
        if (freeze <= 0) { f.y += f.sp * K.fall * (1 + lesson * .06) * dt; f.x += Math.sin(t * 1.5 + f.wob) * (f.boss ? 3 : 8) * dt; }
        // a swapper changes its rune once, halfway down (it blinks first)
        if (f.trick === 'swap' && !f.swapped && f.y > f.swapIn && !f.inbound) {
          if (!f.warn) f.warn = .5; f.warn -= dt;
          if (f.warn <= 0) { f.swapped = true; const k = known6().filter(r => r !== f.seq[0]); f.seq[0] = k[Math.random() * k.length | 0]; sfx(900, .1, 'square', .03, -500); feel.juice.burst(f.x, f.y - 22, { n: 6, color: '#60c050', speed: 30 }); }
        }
        if (f.y > floor() - (f.boss ? 18 : 14)) {
          f.dead = true;
          if (ward > 0 && !f.boss) { ward--; say('WARDED!', RCOL.O, .8); feel.boom(f.x, f.y, { color: RCOL.O }); continue; }
          hearts -= f.boss ? 2 : 1; combo = 0; feel.hurt(f.x, f.y); say(f.boss ? 'EXAM FAILED!' : 'OUCH!', '#f86060', .9);
          if (f.boss) { exam = null; if (hearts > 0) nextLesson(); }
        }
      }
      for (const b of bolts) {
        const f = b.tg; if (f.dead) { b.done = true; continue; }
        const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy), mv = b.sp * dt;
        feel.juice.emit(b.x, b.y, rnd(-10, 10), rnd(-10, 10), { color: RCOL[b.r], life: .25, size: 1 });
        if (d < mv + 4) { b.done = true; land(f); } else { b.x += dx / d * mv; b.y += dy / d * mv; }
      }
      for (const z of zaps) z.l -= dt;
      foes = foes.filter(f => !f.dead); bolts = bolts.filter(b => !b.done); zaps = zaps.filter(z => z.l > 0);
      if (hearts <= 0) { feel.lose(); return api.over(); }
    },
    draw(c) {
      const fl = floor(); badge = api.scoreArea();
      c.fillStyle = '#1a1430'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      // great hall: stone arches, floating candles, long carpet
      for (let x = 8; x < W; x += 48) { c.fillStyle = '#2a2448'; c.fillRect(x, 20, 30, fl - 20); c.fillStyle = '#100c20'; c.fillRect(x + 4, 30, 22, fl - 50); c.beginPath(); c.arc(x + 15, 30, 11, Math.PI, 0); c.fill(); c.fillStyle = '#383068'; c.fillRect(x + 14, 30, 2, fl - 50); }
      for (let i = 0; i < 6; i++) { const cx = (i * 47 + 20) % W, cy = 30 + (i * 29) % 60 + Math.round(Math.sin(t * 2 + i) * 2); c.fillStyle = '#e8e0c8'; c.fillRect(cx, cy, 2, 5); c.fillStyle = (t * 8 + i | 0) % 2 ? '#f8d838' : '#f8a040'; c.fillRect(cx, cy - 2, 2, 2); }
      c.fillStyle = '#3a2c58'; c.fillRect(0, fl, W, H - fl); c.fillStyle = '#a03040'; c.fillRect(W / 2 - 18, fl, 36, H - fl); c.fillStyle = '#f8d838'; c.fillRect(W / 2 - 18, fl, 1, H - fl); c.fillRect(W / 2 + 17, fl, 1, H - fl);
      // a WARD shimmers along the floor
      if (ward) { c.globalAlpha = .45 + Math.sin(t * 6) * .2; c.fillStyle = RCOL.O; c.fillRect(0, fl - 3, W, 2); if (ward > 1) c.fillRect(0, fl - 6, W, 1); c.globalAlpha = 1; }
      // student with wand (it smokes while jammed)
      const x = W / 2, y = fl - 4;
      c.fillStyle = '#202030'; c.fillRect(x - 6, y - 14, 12, 14); c.fillStyle = '#a03040'; c.fillRect(x - 6, y - 8, 12, 2); c.fillStyle = '#f8d0a8'; c.fillRect(x - 4, y - 21, 8, 7); c.fillStyle = '#683820'; c.fillRect(x - 5, y - 23, 10, 3); c.fillRect(x - 5, y - 21, 2, 3);
      c.fillStyle = '#101018'; c.fillRect(x - 2, y - 18, 1, 1); c.fillRect(x + 1, y - 18, 1, 1);
      c.fillStyle = '#8a5a30'; c.fillRect(x + 5, y - 20, 1, 8);
      if (jam > 0) { c.fillStyle = '#9090a8'; for (let i = 0; i < 3; i++) c.fillRect(x + 5 + Math.round(Math.sin(t * 9 + i * 2) * 2), y - 24 - i * 3 - Math.round((t * 12 + i * 3) % 3), 2, 2); }
      else if (last) { c.fillStyle = RCOL[last.r]; c.fillRect(x + 4, y - 22, 3, 3); }
      else if (primed) { c.fillStyle = (t * 10 | 0) % 2 ? RCOL[primed.r] : '#f8f8f0'; c.fillRect(x + 4, y - 22, 3, 3); }
      for (const f of foes) drawFoe(c, f);
      for (const b of bolts) { c.fillStyle = '#f8f8f0'; c.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3); }
      for (const z of zaps) { c.strokeStyle = '#f8f8ff'; c.lineWidth = 2; c.beginPath(); let zx = z.x, zy = 0; c.moveTo(zx, zy); while (zy < z.y) { zy = Math.min(z.y, zy + 10); zx = z.x + (zy < z.y ? rnd(-6, 6) : 0); c.lineTo(Math.round(zx), Math.round(zy)); } c.stroke(); }
      if (freeze > 0) { c.globalAlpha = Math.min(.25, freeze); c.fillStyle = '#a0d8ff'; c.fillRect(0, 0, W, fl); c.globalAlpha = 1; }
      // the line just drawn stays a moment: in the rune's colour when it was read, grey and sagging when not
      if (ink) { const k = ink.l / .45; c.strokeStyle = ink.r ? RCOL[ink.r] : '#8080a0'; c.lineWidth = 2; c.globalAlpha = k * .9; c.beginPath(); ink.pts.forEach((q, i) => { const yy = q.y + (ink.r ? 0 : (1 - k) * 6); i ? c.lineTo(q.x, yy) : c.moveTo(q.x, yy); }); c.stroke(); c.globalAlpha = 1; }
      if (stroke && stroke.length > 1) { c.strokeStyle = jam > 0 ? '#606078' : '#f8f8f0'; c.lineWidth = 2; c.globalAlpha = .8; c.beginPath(); c.moveTo(stroke[0].x, stroke[0].y); for (const p of stroke) c.lineTo(p.x, p.y); c.stroke(); c.globalAlpha = 1; }
      feel.end(c, W, H);
      // HUD: hearts and the wand's charge top left, lesson and multiplier top right (the app's score sits top centre)
      for (let i = 0; i < Math.max(hearts, K.lives); i++) { c.fillStyle = i < hearts ? '#f86888' : '#403858'; c.fillRect(4 + i * 8, 4, 6, 5); }
      for (let i = 0; i < CHARGE; i++) { c.fillStyle = i < charge ? (charge >= K.comboCost ? '#f8d838' : '#c8a030') : '#302848'; c.fillRect(4 + i * 4, 12, 3, 3); }
      text(c, exam ? 'EXAM' : `L${lesson}`, W - 4, 4, { font: 'small', align: 'right', color: exam ? '#f8d838' : '#a0a0d0' });
      if (mult() > 1) text(c, `X${mult()}`, W - 4, 12, { font: 'small', align: 'right', color: '#f8d838' });
      // rune book along the bottom: runes for yourself are dim until the charge can pay for them
      const bw = W / known.length;
      c.fillStyle = '#140f26e0'; c.fillRect(0, H - 19, W, 19); c.fillStyle = '#4a3c70'; c.fillRect(0, H - 19, W, 1);
      known.forEach((r, i) => { c.globalAlpha = SELF.includes(r) && charge < COST[r] ? .35 : 1; rune(c, r, Math.round(bw * i + bw / 2), H - 11, 4, RCOL[r]); if (SELF.includes(r)) text(c, `${COST[r]}`, Math.round(bw * i + bw / 2) + 6, H - 7, { font: 'small', color: '#c0c0e0' }); c.globalAlpha = 1; });
      const m = msgs[0];
      const my = Math.round(H * .4);
      if (m) { c.fillStyle = '#100c20c0'; c.fillRect(0, my - 6, W, 13); text(c, m.txt, W / 2, my - 3, { font: 'small', align: 'center', color: m.col }); if (m.r) rune(c, m.r, W / 2, my + 30, 6, RCOL[m.r]); }
      if (flash) { const fy = m ? my + 9 : my; c.fillStyle = '#100c20c0'; c.fillRect(0, fy - 6, W, 13); text(c, flash.txt, W / 2, fy - 3, { font: 'small', align: 'center', color: flash.col }); }
      if (ready.waiting) ready.draw(c, W, H, { pixel: true, color: '#f8f8f0', y: Math.round(H * .55), text: 'TRACE THE RUNE' });
      else if (t < 5) text(c, 'TRACE THE RUNE', W / 2, Math.round(H * .4) + 22, { font: 'small', align: 'center', color: '#c0c0e0' });
    },
    down(x, y) { if (ready.go()) return; stroke = jam > 0 ? null : [{ x, y }]; if (jam > 0) say('WAND JAMMED', '#a0a0c0', .4); },
    move(x, y, p) { if (p && stroke) stroke.push({ x, y }); },
    up() { if (stroke) { if (stroke.length > 3) { const g = recognise(stroke); cast(g); ink = { pts: stroke, r: g && g.r, l: .45 }; } stroke = null; } },
    key(k, d) {
      if (!d) return; if (ready.go()) return;
      const n = '123456789'.indexOf(k), at = { neat: .5, size: small() * .3, cx: -99, cy: -99 };
      if (n >= 0 && known[n] && !jam) cast({ ...at, r: known[n] });
      if (k === ' ' && !jam) { const f = foes.filter(f => needAt(f)).sort((a, b) => b.y - a.y)[0]; if (f) cast({ ...at, r: needAt(f) }); }
    },
  };
  function drawFoe(c, f) {
    const fx = Math.round(f.x), fy = Math.round(f.y), hit = f.hit > 0 && (t * 30 | 0) % 2, flap = (t * 8 | 0) % 2;
    c.fillStyle = hit ? '#f8f8f0' : f.col;
    if (f.k === 'imp') {
      c.fillRect(fx - 5, fy - 4, 10, 9); c.fillRect(fx - 5, fy - 7, 2, 3); c.fillRect(fx + 3, fy - 7, 2, 3);
      c.fillStyle = f.trick === 'mirror' ? '#f8f8f8' : '#f8d838'; c.fillRect(fx - 3, fy - 2, 2, 2); c.fillRect(fx + 1, fy - 2, 2, 2); c.fillStyle = '#101018'; c.fillRect(fx - 2, fy + 2, 4, 1);
      if (f.trick === 'mirror') { c.fillStyle = '#e8e8ff'; c.fillRect(fx - 6, fy - 4, 1, 9); c.fillRect(fx + 5, fy - 4, 1, 9); }
    } else if (f.k === 'ghost') {
      c.globalAlpha = f.trick === 'fade' ? .55 + Math.sin(t * 3) * .2 : .85; c.fillRect(fx - 5, fy - 6, 10, 10); c.fillRect(fx - 5 + flap, fy + 4, 2, 3); c.fillRect(fx - 1, fy + 4, 2, 3 - flap); c.fillRect(fx + 3 - flap, fy + 4, 2, 3); c.globalAlpha = 1;
      c.fillStyle = '#101018'; c.fillRect(fx - 3, fy - 3, 2, 3); c.fillRect(fx + 1, fy - 3, 2, 3);
    } else if (f.k === 'bat') {
      c.fillRect(fx - 3, fy - 3, 6, 6); c.fillRect(fx - 9, fy - 3 + flap * 2, 6, 2); c.fillRect(fx + 3, fy - 3 + flap * 2, 6, 2); c.fillStyle = '#f84040'; c.fillRect(fx - 2, fy - 1, 1, 1); c.fillRect(fx + 1, fy - 1, 1, 1);
    } else if (f.k === 'gargoyle') {
      c.fillRect(fx - 7, fy - 6, 14, 13); c.fillRect(fx - 10, fy - 4 + flap, 3, 6); c.fillRect(fx + 7, fy - 4 + flap, 3, 6); c.fillStyle = '#606068'; c.fillRect(fx - 7, fy + 4, 14, 3); c.fillStyle = '#f8a040'; c.fillRect(fx - 4, fy - 3, 2, 2); c.fillRect(fx + 2, fy - 3, 2, 2);
    } else {
      // the Ink Golem: a wobbling blot of exam ink in a mortarboard
      const wob = Math.round(Math.sin(t * 3) * 1);
      c.fillRect(fx - 12 - wob, fy - 10, 24 + wob * 2, 20); c.fillRect(fx - 9, fy - 13, 18, 3); c.fillRect(fx - 14, fy - 4, 2, 10); c.fillRect(fx + 12, fy - 4, 2, 10);
      for (let i = 0; i < 4; i++) c.fillRect(fx - 10 + i * 6, fy + 10, 2, 2 + ((t * 4 + i) % 3 | 0));
      c.fillStyle = '#f8f8f0'; c.fillRect(fx - 6, fy - 5, 4, 4); c.fillRect(fx + 2, fy - 5, 4, 4); c.fillStyle = '#101018'; c.fillRect(fx - 5, fy - 4, 2, 2); c.fillRect(fx + 3, fy - 4, 2, 2);
      c.fillStyle = '#181818'; c.fillRect(fx - 10, fy - 17, 20, 3); c.fillRect(fx - 5, fy - 15, 10, 3); c.fillStyle = '#f8d838'; c.fillRect(fx + 8, fy - 15, 1, 6);
    }
    // rune bubble: the next rune bright, the rest dim; a fading ghost's runes fade out, a mirror imp's sit in a mirror
    const show = f.seq.slice(0, 5), more = f.seq.length - show.length, cell = 14, bw = show.length * cell + 2 + (more ? 10 : 0);
    const bx = Math.round(clamp(fx - bw / 2, 1, W - bw - 1));
    let by = fy - (f.boss ? 34 : 26);
    // keep the bubble out from under the app's score badge
    if (by < badge.bottom && bx < badge.x + badge.w && bx + bw > badge.x) by = Math.round(badge.bottom + 1);
    const fade = f.trick === 'fade' ? clamp(1 - (f.age - 1.6) / .5, 0, 1) : 1;
    const blink = f.warn > 0 && !f.swapped && (t * 12 | 0) % 2;
    c.fillStyle = '#100c20d8'; c.fillRect(bx, by, bw, 16); c.fillStyle = f.trick === 'mirror' ? '#e8e8ff' : '#ffffff30'; c.fillRect(bx, by, bw, 1);
    if (f.trick === 'mirror') { c.fillRect(bx, by + 15, bw, 1); c.fillRect(bx, by, 1, 16); c.fillRect(bx + bw - 1, by, 1, 16); }
    if (fade < 1) { c.strokeStyle = '#ffffff40'; c.lineWidth = 1; c.strokeRect(bx + .5, by + .5, bw - 1, 15); }
    show.forEach((r, i) => { c.globalAlpha = (i === 0 ? 1 : .45) * fade * (blink && i === 0 ? .2 : 1); rune(c, r, bx + 8 + i * cell, by + 8, 5, RCOL[r]); });
    c.globalAlpha = 1;
    if (more) text(c, `+${more}`, bx + bw - 10, by + 6, { font: 'small', color: '#c0c0e0' });
  }
  return self_;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'spell-school', title: 'Spell School', tag: 'Advance · Magic', retro: true, era: 'advance', pal: 'berry', w: 160, h: 176, maxW: 240, maxH: 300, goal: 60, touch: 'fine', music: 'silly',
  hint: 'Trace the rune each creature shows to banish it: neat runes score more, a big rune hits every creature showing it, a wrong one jams your wand, and lessons teach new runes and two-rune spells.',
  make,
};
