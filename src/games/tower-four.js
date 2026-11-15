// Tower Four: four in a row, in three dimensions. Sixteen brass pegs stand on a block; you and Quill
// take turns dropping a glass bead onto any peg. Line up four of yours along a row, up a peg, or on any
// slant through the stack (76 lines in all) to win. Walk the camera round the block to see the
// slants. Quill looks ahead with gs.solve.Search. Your game is kept between visits.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { Search } = gs.solve;
const { Dial } = gs.brains;
const { Table, slab, ring, fuse, sounds } = gs.tabletop;
const { pbr } = gs.hd;
const { Mesh, SphereGeometry, CylinderGeometry, Group } = gs.THREE;

let W = 300, H = 460;
const GAP = 1.32, RISE = .74, R = .43;
const peg = p => ({ x: (p % 4 - 1.5) * GAP, z: (((p / 4) | 0) - 1.5) * GAP });
const WHO = [{ name: 'You', col: '#f2a01e' }, { name: 'Quill', col: '#22a79c' }];

/* ----- the rules, as pure functions (Quill searches with them) ----- */
const LINES = [];                                                   // every run of four cells: 76 of them
for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++)
  for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]]) {
    const ex = x + dx * 3, ey = y + dy * 3, ez = z + dz * 3; if (ex < 0 || ex > 3 || ey < 0 || ey > 3 || ez < 0 || ez > 3) continue;
    LINES.push([0, 1, 2, 3].map(k => (x + dx * k) + (z + dz * k) * 4 + (y + dy * k) * 16));
  }
const THROUGH = Array.from({ length: 64 }, (_, c) => LINES.filter(l => l.includes(c)));
const height = (c, p) => { let h = 0; while (h < 4 && c[p + h * 16]) h++; return h; };
function play(s, p) {
  const c = s.c.slice(), cell = p + height(c, p) * 16, me = s.t + 1; c[cell] = me;
  let win = -1, line = null;
  for (const l of THROUGH[cell]) if (l.every(i => c[i] === me)) { win = s.t; line = l; break; }
  if (win < 0 && !c.includes(0)) win = 2;                           // the block is full: a draw
  return { c, t: 1 - s.t, win, line, cell };
}
const moves = s => (s.win >= 0 ? [] : [5, 6, 9, 10, 0, 3, 12, 15, 1, 2, 4, 7, 8, 11, 13, 14].filter(p => !s.c[p + 48]));
const WORTH = [0, 1, 6, 40, 0];
function worth(s, p) {
  if (s.win >= 0) return s.win === 2 ? 0 : s.win === p ? 10000 : -10000;
  let v = 0; const c = s.c;
  for (const l of LINES) { let a = 0, b = 0; for (const i of l) { if (c[i] === 1) a++; else if (c[i] === 2) b++; } if (!b) v += WORTH[a]; else if (!a) v -= WORTH[b]; }
  return p ? -v : v;
}
const best = (c, who) => { let n = 0; for (const l of LINES) { let a = 0, b = 0; for (const i of l) { if (c[i] === who) a++; else if (c[i]) b++; } if (!b && a > n) n = a; } return n; };
const brain = new Search({ moves, play: (s, m) => { const n = play(s, m); return { c: n.c, t: n.t, win: n.win }; }, turn: s => s.t, over: s => s.win >= 0, score: worth });

function make(api) {
  // the win-rate dial (Tiny Brains): Quill plays between a looser and a sharper game, following this
  // player's results so they win a little over half their games
  const dial = new Dial(api, { name: 'tower-four', start: .84, range: [.6, .97] });
  let T, s, beads, state, glass, lit, hitters, marks, geo, line;

  function setup() {
    T = new Table(api, { span: 7.6, room: 'study', pitch: 38, yaw: 24, look: [0, 1.25, 0], minPitch: 8, frame: [6.6, 6.2] });
    T.board.add(slab({ w: 5.6, d: 5.6, rim: .2, thick: .42, wood: '#5e3a20', paint(g, S) {      // a walnut block with a ring let in round each peg
      const c = g.col; c.fillStyle = '#8a5a34'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 320; i++) { c.strokeStyle = Math.random() < .6 ? '#6e4424' : '#a87648'; c.globalAlpha = .14 + Math.random() * .2; c.lineWidth = 1 + Math.random() * 2; const y = Math.random() * S; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(S * .3, y + 6, S * .6, y - 6, S, y + 3); c.stroke(); }
      c.globalAlpha = 1;
      for (let p = 0; p < 16; p++) {
        const q = peg(p), x = (q.x / 5.6 + .5) * S, y = (q.z / 5.6 + .5) * S, r = .5 / 5.6 * S;
        c.fillStyle = '#6a4222'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.strokeStyle = '#d2a45c'; c.lineWidth = S / 300; c.stroke();
        g.h.fillStyle = '#5c5c5c'; g.h.beginPath(); g.h.arc(x, y, r, 0, 7); g.h.fill();
      }
    } }));
    const brass = pbr('#d0a24a', { rough: .28, metal: .9 }), pegGeo = new CylinderGeometry(.075, .075, RISE * 4 + .45, 12), pegs = new Group();
    hitters = [];
    for (let p = 0; p < 16; p++) {
      const q = peg(p), m = new Mesh(pegGeo, brass); m.position.set(q.x, (RISE * 4 + .45) / 2, q.z); m.castShadow = true; pegs.add(m);
      const cap = new Mesh(new SphereGeometry(.11, 12, 8), brass); cap.position.set(q.x, RISE * 4 + .45, q.z); pegs.add(cap);
      const h = new Mesh(new CylinderGeometry(.56, .56, RISE * 4 + .6, 8)); h.position.set(q.x, (RISE * 4 + .6) / 2, q.z); h.visible = false; h.userData.peg = p; T.board.add(h); hitters.push(h);   // an unseen column to tap
    }
    T.board.add(fuse(pegs));
    geo = new SphereGeometry(R, 24, 16);
    glass = WHO.map(w => pbr(w.col, { rough: .1, clear: 1 }));
    lit = WHO.map(w => pbr(w.col, { rough: .1, clear: 1, glow: 1.5 }));
    marks = Array.from({ length: 16 }, (_, p) => { const r = ring('#ffe08a', { r: .5, w: .022, glow: .5 }), q = peg(p); r.position.set(q.x, .02, q.z); T.board.add(r); return r; });
  }
  const seat = cell => { const q = peg(cell % 16); return { x: q.x, y: .06 + ((cell / 16) | 0) * RISE + R * .88, z: q.z }; };
  function bead(cell, who) {
    const m = new Mesh(geo, glass[who]), q = seat(cell); m.scale.y = .88; m.position.set(q.x, q.y, q.z); m.castShadow = true; m.userData.h = R * 2; T.board.add(m); beads.set(cell, m); return m;
  }
  function layout() {
    for (const m of beads?.values() || []) m.removeFromParent();
    beads = new Map(); s.c.forEach((v, cell) => { if (v) bead(cell, v - 1); });
  }
  const tell = () => api.score(best(s.c, 1));
  async function drop(p) {
    const who = s.t, next = play(s, p), m = bead(next.cell, who), y = m.position.y, from = RISE * 4 + 1.6;
    m.position.y = from;
    await T.tween(.2 + (from - y) * .05, k => { m.position.y = from + (y - from) * k; }, { ease: 'in' });
    m.position.y = y; sounds.clink(1.2); sounds.clack(.5); haptic(who ? 'light' : 'medium');
    s = { c: next.c, t: next.t, win: next.win }; line = next.line; tell();
  }
  async function finish() {
    state = 'done';
    if (line) { for (const cell of line) beads.get(cell).material = lit[s.win]; const mid = seat(line[1]), end = seat(line[2]); T.puff({ x: (mid.x + end.x) / 2, y: (mid.y + end.y) / 2, z: (mid.z + end.z) / 2 }, { col: WHO[s.win].col, glow: true, n: 22, speed: 2, up: 1.6, size: .2 }); }
    dial.result(s.win === 0 ? true : s.win === 2 ? 'draw' : false);
    if (s.win === 0) { sounds.gong(); haptic('success'); api.score(4); api.win(); } else sounds.thud(1.2);
    await T.wait(1.9); api.clearSave(); T.stop(); api.over();
  }
  async function turn(p) {
    state = 'busy';
    await drop(p); if (s.win >= 0) return finish();
    const reply = await T.think(brain, s, { time: 280, depth: 4, skill: dial, wait: .65 });
    await drop(reply); if (s.win >= 0) return finish();
    api.save({ c: s.c.join('') }); state = 'you';
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const v = api.load(null), c = v && typeof v.c === 'string' && /^[012]{64}$/.test(v.c) ? [...v.c].map(Number) : null;
      const ok = c && c.filter(x => x === 1).length === c.filter(x => x === 2).length && c.includes(0);
      s = { c: ok ? c : new Array(64).fill(0), t: 0, win: -1 }; state = 'you'; line = null;
      layout(); if (ok) tell();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      marks.forEach((r, p) => { r.visible = state === 'you' && !s.c[p + 48] && !T.busy; r.scale.setScalar(1 + Math.sin(T.t * 4 + p) * .04); });
      if (state === 'done' && line) for (const m of lit) m.emissiveIntensity = 1.1 + Math.sin(T.t * 7) * .6;
    },
    draw(c) {
      T.draw(c, W, H);
      const y = T.strip(c, W, WHO.map((w, i) => ({ name: w.name, col: w.col, score: best(s.c, i + 1) })), state === 'done' ? -1 : state === 'you' ? 0 : 1);
      T.status(c, W, y, state === 'done' ? (s.win === 0 ? 'Four in a row. You win!' : s.win === 1 ? 'Quill makes four' : 'The block is full: a draw') : state === 'you' ? 'Tap a peg to drop a bead' : s.t ? 'Quill is thinking…' : '');
      T.hud(c, W, H);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap || tap.chip || state !== 'you' || T.busy) return;
      const hit = T.over(tap.x, tap.y, hitters);
      let p = hit ? hit.userData.peg : T.nearest(tap.x, tap.y, hitters.map((h, i) => ({ ...peg(i), y: height(s.c, i) * RISE + .4 })), 30);
      if (p == null || p < 0) return;
      if (s.c[p + 48]) { haptic('warning'); return T.say('That peg is full'); }
      T.run(() => turn(p));
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'tower-four',
  title: 'Tower Four',
  tag: 'Board · Strategy',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'puzzle', vol: .5 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 4,
  hint: 'Tap a peg to drop a bead on it. Line up four of yours along a row, up a peg or on any slant through the stack before Quill does. Drag to walk round the block and spot the slants, or tap AR to stand it on your floor.',
  creator: 'Game Scroll',
  make,
};
