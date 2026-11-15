// King's Table: the old Norse and Irish board game of unequal sides (tafl, on the small 7 x 7 board).
// You lead the king and his four guards; eight raiders surround you. Every piece moves like a rook.
// Trap a piece between two of yours to take it. Get the king to any corner and you win; if the
// raiders trap the king, you lose. The raiders think ahead with gs.solve.Search. Your game is kept.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { Search } = gs.solve;
const { Dial } = gs.brains;
const { Table, slab, pawn, chessman, ring, dot, sounds } = gs.tabletop;
const { pbr } = gs.hd;

let W = 300, H = 460;
const N = 7, THRONE = 24, CORNERS = [0, 6, 42, 48], ESCAPE = 10;
const RAIDER = 1, GUARD = 2, KING = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const at = i => ({ x: i % N - 3, z: ((i / N) | 0) - 3 });
const START = () => { const b = new Array(49).fill(0); for (const i of [3, 10, 21, 22, 26, 27, 38, 45]) b[i] = RAIDER; for (const i of [17, 23, 25, 31]) b[i] = GUARD; b[THRONE] = KING; return b; };
const corner = i => i === 0 || i === 6 || i === 42 || i === 48;

/* ----- the rules, as pure functions (the computer player searches with them) ----- */
function reach(b, i) {                                             // where the piece on square i can go
  const out = [], c0 = i % N, r0 = (i / N) | 0, king = b[i] === KING;
  for (const [dc, dr] of DIRS) {
    let c = c0 + dc, r = r0 + dr;
    while (c >= 0 && c < N && r >= 0 && r < N) {
      const j = r * N + c; if (b[j]) break;
      if (king || (j !== THRONE && !corner(j))) out.push(j);      // only the king may stand on the throne or a corner (others may pass the empty throne)
      c += dc; r += dr;
    }
  }
  return out;
}
function play(s, m) {                                              // m = from * 49 + to; returns the new state (with what was taken)
  const b = s.b.slice(), from = (m / 49) | 0, to = m % 49, me = b[from], mine = v => (me === RAIDER ? v === RAIDER : v === GUARD || v === KING), taken = [];
  b[from] = 0; b[to] = me; let win = -1;
  const c0 = to % N, r0 = (to / N) | 0;
  for (const [dc, dr] of DIRS) {
    const c1 = c0 + dc, r1 = r0 + dr; if (c1 < 0 || c1 >= N || r1 < 0 || r1 >= N) continue;
    const j = r1 * N + c1, v = b[j]; if (!v || mine(v)) continue;
    const c2 = c1 + dc, r2 = r1 + dr, in2 = c2 >= 0 && c2 < N && r2 >= 0 && r2 < N, k = in2 ? r2 * N + c2 : -1;
    const hard = in2 && (mine(b[k]) || (!b[k] && (corner(k) || k === THRONE)));   // one of mine beyond it, or an empty corner or throne
    if (v === KING) {
      const near = j === THRONE || DIRS.some(([a, d]) => { const cc = c1 + a, rr = r1 + d; return cc >= 0 && cc < N && rr >= 0 && rr < N && rr * N + cc === THRONE; });
      if (near ? DIRS.every(([a, d]) => { const cc = c1 + a, rr = r1 + d, q = rr * N + cc; return cc >= 0 && cc < N && rr >= 0 && rr < N && (b[q] === RAIDER || (q === THRONE && !b[q])); }) : hard) { taken.push(j); b[j] = 0; win = 1; }
    } else if (hard) { taken.push(j); b[j] = 0; }
  }
  if (me === KING && corner(to)) win = 0;
  if (win < 0 && !b.includes(RAIDER)) win = 0;
  const next = { b, t: 1 - s.t, win, taken };
  if (win < 0 && !moves(next).length) next.win = s.t;              // nowhere to move: the side that's stuck loses
  return next;
}
function moves(s) {
  if (s.win >= 0) return [];
  const out = [], b = s.b;
  for (let i = 0; i < 49; i++) { const v = b[i]; if (!v || (s.t ? v !== RAIDER : v === RAIDER)) continue; for (const j of reach(b, i)) out.push(i * 49 + j); }
  return out;
}
function worth(s, p) {                                             // how good it looks for player p (0 the king's side, 1 the raiders)
  if (s.win >= 0) return s.win === p ? 10000 : -10000;
  const b = s.b, k = b.indexOf(KING), kc = k % N, kr = (k / N) | 0;
  let v = 0, guards = 0, raiders = 0;
  for (const x of b) { if (x === GUARD) guards++; else if (x === RAIDER) raiders++; }
  const goes = reach(b, k); v += guards * 14 - raiders * 11 + goes.length * 1.5;
  v += goes.filter(corner).length * (s.t === 0 ? 400 : 60);        // a clear run to a corner
  v -= Math.min(kc, 6 - kc) + Math.min(kr, 6 - kr) * 1 + 0;       // nearer an edge is nearer a corner
  for (const [dc, dr] of DIRS) { const c = kc + dc, r = kr + dr; if (c >= 0 && c < N && r >= 0 && r < N && b[r * N + c] === RAIDER) v -= 5; }
  return p ? -v : v;
}
const brain = new Search({ moves, play: (s, m) => { const n = play(s, m); return { b: n.b, t: n.t, win: n.win }; }, turn: s => s.t, over: s => s.win >= 0, score: worth });

function make(api) {
  // the win-rate dial (Tiny Brains): the raiders plays between a looser and a sharper game, following this
  // player's results so they win a little over half their games
  const dial = new Dial(api, { name: 'kings-table', start: .88, range: [.6, .98] });
  let T, s, men, sel, goes, dots, selRing, state, taken, stuff;

  function setup() {
    T = new Table(api, { span: 8.9, room: { like: 'tavern', wall: '#5a4a3a', rug: '#6a2f2a' }, table: 'square', pitch: 57 });
    T.board.add(slab({ w: 7, d: 7, rim: .5, wood: '#5a3a22', paint(g, S) {      // carved oak: a throne in the middle, knots in the corners
      const q = S / 7, c = g.col;
      c.fillStyle = '#c79a62'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 400; i++) { c.strokeStyle = Math.random() < .6 ? '#a97c48' : '#dab27a'; c.globalAlpha = .12 + Math.random() * .2; c.lineWidth = 1 + Math.random() * 2; const y = Math.random() * S; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(S * .3, y + 5, S * .6, y - 5, S, y + 2); c.stroke(); }
      c.globalAlpha = 1;
      const knot = (i, col) => {
        const x = (i % N + .5) * q, y = (((i / N) | 0) + .5) * q;
        c.fillStyle = col; c.fillRect(x - q / 2, y - q / 2, q, q);
        for (const k of [c, g.h]) { k.strokeStyle = k === c ? '#5a3a1c' : '#3c3c3c'; k.lineWidth = q * .05; for (const r of [.34, .2]) { k.beginPath(); k.arc(x, y, q * r, 0, 7); k.stroke(); } k.beginPath(); k.moveTo(x - q * .34, y); k.lineTo(x + q * .34, y); k.moveTo(x, y - q * .34); k.lineTo(x, y + q * .34); k.stroke(); }
      };
      CORNERS.forEach(i => knot(i, '#9ab07a')); knot(THRONE, '#d9b45a');
      for (const k of [c, g.h]) { k.strokeStyle = k === c ? '#6e4a26' : '#484848'; k.lineWidth = S / 260; for (let i = 0; i <= N; i++) { k.beginPath(); k.moveTo(i * q, 0); k.lineTo(i * q, S); k.moveTo(0, i * q); k.lineTo(S, i * q); k.stroke(); } }
    } }));
    stuff = { raider: pbr('#3b3f4a', { rough: .4, clear: .5 }), guard: pbr('#e9dfc8', { rough: .4, clear: .5 }), king: pbr('#e2b23a', { rough: .25, metal: .7 }) };
    dots = Array.from({ length: 12 }, () => { const d = dot('#ffe08a', { r: .15 }); d.visible = false; T.board.add(d); return d; });
    selRing = ring('#ffe08a', { r: .42 }); T.board.add(selRing);
  }
  function piece(v) { const m = v === KING ? chessman('k', stuff.king) : pawn(v === RAIDER ? stuff.raider : stuff.guard, { r: .3, h: .78 }); if (v === KING) m.scale.setScalar(.72); return m; }
  function layout() {
    for (const m of men?.values() || []) m.removeFromParent();
    men = new Map();
    s.b.forEach((v, i) => { if (!v) return; const m = piece(v), p = at(i); m.position.set(p.x, 0, p.z); T.board.add(m); men.set(i, m); });
  }
  function choose(i) {
    sel = i; goes = i == null ? [] : reach(s.b, i);
    dots.forEach((d, k) => { const j = goes[k]; d.visible = j != null; if (d.visible) { const p = at(j); d.position.set(p.x, d.position.y, p.z); } });
    selRing.visible = i != null; if (i != null) { const p = at(i); selRing.position.set(p.x, .03, p.z); }
  }
  async function act(m) {                                          // plays a move on the board, with whatever it takes
    const from = (m / 49) | 0, to = m % 49, mesh = men.get(from), p = at(to), far = Math.hypot(p.x - at(from).x, p.z - at(from).z);
    const next = play(s, m); men.delete(from); men.set(to, mesh);
    await T.slide(mesh, p, { time: .16 + far * .06 }); sounds.clack(.8); haptic('light');
    for (const j of next.taken) {
      const v = men.get(j), q = at(j); men.delete(j);
      T.crumble(v, { from: at(to), push: 2.6, pieces: 7 }); T.puff({ x: q.x, y: .3, z: q.z }, { n: 10, speed: 2, size: .45 }); sounds.thud(); haptic('heavy'); T.shake(.4);
      if (s.t === 0) { taken++; api.score(taken); }
      await T.wait(.25);
    }
    s = { b: next.b, t: next.t, win: next.win };
  }
  async function finish() {
    state = 'done'; choose(null); dial.result(s.win === 0);
    if (s.win === 0) { taken += ESCAPE; api.score(taken); sounds.gong(); const k = at(s.b.indexOf(KING)); T.puff({ x: k.x, y: .8, z: k.z }, { col: '#ffe08a', glow: true, n: 26, speed: 2.2, up: 2.4, size: .24 }); api.win(); } else sounds.thud(1.4);
    await T.wait(1.7); api.clearSave(); T.stop(); api.over();
  }
  async function turn(m) {
    state = 'busy'; choose(null);
    await act(m);
    if (s.win >= 0) return finish();
    const reply = await T.think(brain, s, { time: 320, depth: 4, skill: dial, wait: .6 });
    if (reply == null) { s.win = 0; return finish(); }
    await act(reply);
    if (s.win >= 0) return finish();
    api.save({ b: s.b, n: taken }); state = 'you';
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const v = api.load(null), ok = v && Array.isArray(v.b) && v.b.length === 49 && v.b.filter(x => x === KING).length === 1 && v.b.includes(RAIDER);
      s = { b: ok ? v.b.slice() : START(), t: 0, win: -1 }; taken = ok ? v.n || 0 : 0; state = 'you';
      layout(); choose(null); if (taken) api.score(taken);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      const m = sel != null && men.get(sel); if (m) m.position.y = .1 + Math.sin(T.t * 5) * .03;
    },
    draw(c) {
      T.draw(c, W, H);
      const left = s.b.filter(x => x === RAIDER).length;
      const y = T.strip(c, W, [{ name: 'King', col: '#e2b23a', score: taken }, { name: 'Raiders', col: '#596070', score: left }], state === 'done' ? -1 : state === 'you' ? 0 : 1);
      T.status(c, W, y, state === 'done' ? (s.win === 0 ? 'The king escapes. You win!' : 'The king is taken') : state === 'you' ? (sel != null ? 'Tap where it goes' : 'Tap a piece: get the king to a corner') : s.t ? 'The raiders are thinking…' : '');
      T.hud(c, W, H);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap || tap.chip || state !== 'you' || T.busy) return;
      const hit = T.over(tap.x, tap.y, [...men.values()]), p = T.pick(tap.x, tap.y);
      let i = hit ? [...men].find(([, m]) => m === hit)?.[0] : null;
      if (i == null && p) { const c = Math.round(p.x + 3), r = Math.round(p.z + 3); if (c >= 0 && c < N && r >= 0 && r < N) i = r * N + c; }
      if (i == null) return choose(null);
      if (sel != null && goes.includes(i)) { const m = sel * 49 + i; return T.run(() => turn(m)); }
      const v = s.b[i];
      if (v === GUARD || v === KING) { if (sel != null && men.get(sel)) men.get(sel).position.y = 0; choose(i === sel ? null : i); sounds.tick(); haptic('light'); } else { if (sel != null && men.get(sel)) men.get(sel).position.y = 0; choose(null); }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'kings-table',
  title: 'King’s Table',
  tag: 'Board · Strategy',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'heroic', vol: .5 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: ESCAPE,
  hint: 'Lead the gold king to any corner. Pieces slide like rooks; trap a raider between two of yours to take it, and don’t let them trap the king. Drag to look round, or tap AR to play on your floor.',
  creator: 'Game Scroll',
  make,
};
