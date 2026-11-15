// Mancala (the six-pit sowing game): scoop up the glass stones in one of your pits and sow them one by
// one round the board. End in your store and you go again; end in an empty pit of yours and you
// capture what's opposite. The board is carved wood with 48 glass stones, each one hopping into
// place; the opponent looks ahead with gs.solve.Search. On a tall screen the board turns end-on so
// it fills the screen; on a wide one (an unfolded phone) it lies across.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { Search } = gs.solve;
const { Dial } = gs.brains;
const { Table, slab, stone, ring, sounds } = gs.tabletop;

let W = 300, H = 460;
const GEMS = ['#3fa7e8', '#e85a4a', '#f0b429', '#49b86c', '#a66bdc', '#f08a3a'];
const STEP = 1.28, ROW = .82, STORE = 4.5;                           // pit spacing, how far each row is from the middle, where the stores are
const MINE = [0, 1, 2, 3, 4, 5], THEIRS = [7, 8, 9, 10, 11, 12], ME = 6, THEM = 13;
// where each pit is on the board (lying across: your row is the near one, sowing runs anticlockwise)
const pit = i => (i === ME ? { x: STORE, z: 0 } : i === THEM ? { x: -STORE, z: 0 } : i < 6 ? { x: (i - 2.5) * STEP, z: ROW } : { x: (2.5 - (i - 7)) * STEP, z: -ROW });
const side = (b, list) => list.reduce((n, i) => n + b[i], 0);

// The rules, as pure functions on an array of 14 counts (the computer player uses them too).
function sow(b, from) {
  const me = from < 6 ? 0 : 1, store = me ? THEM : ME, skip = me ? ME : THEM, nb = b.slice(), path = [];
  let n = nb[from], i = from; nb[from] = 0;
  while (n > 0) { i = (i + 1) % 14; if (i === skip) continue; nb[i]++; n--; path.push(i); }
  const own = me ? i >= 7 && i <= 12 : i <= 5;
  let capture = null;
  if (own && nb[i] === 1 && nb[12 - i] > 0) { capture = [i, 12 - i]; nb[store] += nb[12 - i] + 1; nb[i] = nb[12 - i] = 0; }
  const done = side(nb, MINE) === 0 || side(nb, THEIRS) === 0;
  if (done) { nb[ME] += side(nb, MINE); nb[THEM] += side(nb, THEIRS); for (const k of [...MINE, ...THEIRS]) nb[k] = 0; }
  return { b: nb, path, capture, done, store, t: done ? -1 : i === store ? me : 1 - me };
}
const brain = new Search({
  moves: s => (s.t < 0 ? [] : (s.t ? THEIRS : MINE).filter(i => s.b[i] > 0)),
  play: (s, m) => { const r = sow(s.b, m); return { b: r.b, t: r.t }; },
  turn: s => Math.max(0, s.t),
  over: s => s.t < 0,
  score: (s, p) => { const d = (s.b[ME] - s.b[THEM]) * (p ? -1 : 1); return s.t < 0 ? d * 100 : d * 4 + (side(s.b, p ? THEIRS : MINE) - side(s.b, p ? MINE : THEIRS)) * .25; },
});

function make(api) {
  // the win-rate dial (Tiny Brains): the other side plays between a looser and a sharper game, following this
  // player's results so they win a little over half their games
  const dial = new Dial(api, { name: 'mancala', start: .82, range: [.55, .97] });
  let T, rig, stones, pits, rings, b, state, turn, tall = true;

  function setup() {
    T = new Table(api, { span: 11.6, room: 'parlour', pitch: 60 });
    rig = new gs.THREE.Group(); T.board.add(rig);                  // everything sits in here, so the whole board can turn end-on
    const w = 10.9, d = 3.7;
    rig.add(slab({ w, d, rim: .14, thick: .34, wood: '#8a5630', paint(g, S) {
      const c = g.col, X = x => (x / w + .5) * S, Y = z => (z / d + .5) * S;
      c.fillStyle = '#b07840'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 300; i++) { c.strokeStyle = Math.random() < .6 ? '#8f5e2e' : '#c98f52'; c.globalAlpha = .12 + Math.random() * .2; c.lineWidth = 1 + Math.random() * 2; const y = Math.random() * S; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(S * .3, y + 6, S * .6, y - 6, S, y + 3); c.stroke(); }
      c.globalAlpha = 1;
      const bowl = (x, z, rx, rz) => {                            // a hollow: dark towards the rim's shadow, and a dip in the height layer
        for (const [k, ctx] of [[0, c], [1, g.h]]) {
          const gr = ctx.createRadialGradient(0, 0, .15, 0, 0, 1);
          if (k) { gr.addColorStop(0, '#2c2c2c'); gr.addColorStop(.75, '#3c3c3c'); gr.addColorStop(1, '#808080'); } else { gr.addColorStop(0, '#6e431d'); gr.addColorStop(.8, '#5a3414'); gr.addColorStop(1, '#3a2009'); }
          ctx.save(); ctx.translate(X(x), Y(z)); ctx.scale(rx / w * S, rz / d * S); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
        }
      };
      const trough = x => {                                       // a store: one long hollow
        for (const [k, ctx] of [[0, c], [1, g.h]]) {
          ctx.save(); ctx.shadowColor = k ? '#808080' : '#3a2009'; ctx.shadowBlur = S * .012; ctx.fillStyle = k ? '#303030' : '#633a18';
          ctx.beginPath(); ctx.roundRect(X(x - .56), Y(-1.42), .56 * 2 / w * S, 2.84 / d * S, .5 / w * S); ctx.fill(); ctx.restore();
        }
      };
      for (let i = 0; i < 14; i++) { const p = pit(i); if (i === ME || i === THEM) trough(p.x); else bowl(p.x, p.z, .54, .54); }
    } }));
    stones = Array.from({ length: 48 }, (_, i) => { const s = stone(GEMS[i % GEMS.length], { r: .17 }); rig.add(s); return s; });
    rings = MINE.map(i => { const r = ring('#ffe08a', { r: .57, w: .028, glow: .9 }), p = pit(i); r.position.set(p.x, .02, p.z); rig.add(r); return r; });
  }
  // where the k-th stone of a pit lies: a loose spiral, so every pile looks tumbled but nothing overlaps much
  function seat(i, k) {
    const p = pit(i), a = k * 2.4 + i, r = Math.min(.34, .13 * Math.sqrt(k)), long = i === ME || i === THEM;
    return { x: p.x + Math.cos(a) * r, y: .05 + Math.floor(k / 9) * .09, z: p.z + (long ? ((k % 5) - 2) * .36 + Math.sin(a) * .1 : Math.sin(a) * r) };
  }
  function layout() {
    rig.rotation.y = tall ? -Math.PI / 2 : 0; T.frame(tall ? 4.4 : 11.4, tall ? 11.4 : 4.4); T.lookHome({ pitch: tall ? 64 : 58 });
  }
  function deal() {                                               // puts the stones where the counts say
    pits = Array.from({ length: 14 }, () => []); let k = 0;
    b.forEach((n, i) => { for (let j = 0; j < n; j++) { const s = stones[k++], q = seat(i, j); s.position.set(q.x, q.y, q.z); pits[i].push(s); } });
  }
  const world = i => { const p = pit(i); return tall ? { x: -p.z, y: .15, z: p.x } : { x: p.x, y: .15, z: p.z }; };   // a pit in the table's own units (for taps and labels)

  async function play(from) {
    const r = sow(b, from), hand = pits[from].splice(0);
    for (const s of hand) s.position.y += .25;
    for (const to of r.path) {
      const s = hand.pop(), q = seat(to, pits[to].length); pits[to].push(s);
      await T.hop(s, q, { time: .12, h: .45, sound: false }); sounds.clink(.9); if (to === r.store) haptic('light');
    }
    const sweep = async (list, store) => {
      const jobs = [];
      for (const i of list) for (const s of pits[i].splice(0)) { const q = seat(store, pits[store].length); pits[store].push(s); jobs.push(T.hop(s, q, { time: .32 + jobs.length * .02, h: .9, sound: false })); }
      if (jobs.length) { await Promise.all(jobs); sounds.clink(1.2); }
    };
    if (r.capture) { sounds.chime(.7); haptic('medium'); await T.wait(.15); await sweep(r.capture, r.store); }
    if (r.done) { await T.wait(.3); await sweep(MINE, ME); await sweep(THEIRS, THEM); }
    b = r.b; api.score(b[ME]);
    return r;
  }
  async function go(from) {
    state = 'busy';
    let r = await play(from);
    while (!r.done && r.t === 1) {                                 // the other side plays until the turn comes back
      turn = 1; const m = await T.think(brain, { b, t: 1 }, { time: 220, depth: 7, skill: dial, wait: .7 });
      r = await play(m);
    }
    if (r.done) {
      state = 'done'; turn = -1; const won = b[ME] > b[THEM]; dial.result(b[ME] === b[THEM] ? 'draw' : won);
      if (won) { sounds.gong(); api.win(); } else sounds.thud();
      await T.wait(1.6); api.clearSave(); T.stop(); return api.over();
    }
    turn = 0; state = 'you'; api.save({ b });
    if (from < 6 && r.t === 0 && r.path[r.path.length - 1] === ME) T.say('Last stone in your store: go again');
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const s = api.load(null), ok = s && Array.isArray(s.b) && s.b.length === 14 && s.b.reduce((n, v) => n + v, 0) === 48 && side(s.b, MINE) > 0 && side(s.b, THEIRS) > 0;
      b = ok ? s.b.slice() : [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]; state = 'you'; turn = 0;
      deal(); layout(); if (b[ME]) api.score(b[ME]);
    },
    resize(w, h) { W = w; H = h; const t = W / H < .8; if (t !== tall) { tall = t; if (T) layout(); } },
    update(dt) {
      if (!T.update(dt)) return;
      rings.forEach((r, i) => { r.visible = state === 'you' && b[i] > 0; r.scale.setScalar(1 + Math.sin(T.t * 4 + i) * .03); });
    },
    draw(c) {
      T.draw(c, W, H);
      const y = T.strip(c, W, [{ name: 'You', col: '#ffe08a', score: b[ME] }, { name: 'Odalys', col: '#c9a0ff', score: b[THEM] }], turn);
      T.status(c, W, y, state === 'you' ? 'Tap one of your pits' : state === 'done' ? (b[ME] > b[THEM] ? 'You win!' : b[ME] === b[THEM] ? 'A draw' : 'Odalys wins') : turn ? 'Odalys is thinking…' : 'Sowing…');
      if (!T.hidden) {                                            // how many stones are in each pit
        c.save(); c.font = '800 10px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 0; i < 14; i++) {
          if (i === ME || i === THEM || !b[i]) continue;
          const p = world(i), o = tall ? { x: p.x + (i < 6 ? -.82 : .82), z: p.z } : { x: p.x, z: p.z + (i < 6 ? .8 : -.8) }, [sx, sy, sz] = T.toScreen({ x: o.x, y: .1, z: o.z }); if (sz >= 1) continue;
          c.fillStyle = i < 6 ? '#ffe9a8' : '#e2d2ff'; c.beginPath(); c.arc(sx, sy, 8, 0, 7); c.fill(); c.fillStyle = '#1a1d24'; c.fillText(String(b[i]), sx, sy + .5);
        }
        c.restore();
      }
      T.hud(c, W, H);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap || tap.chip || state !== 'you' || T.busy) return;
      const i = T.nearest(tap.x, tap.y, MINE.map(k => (b[k] > 0 ? world(k) : null)), 40);
      if (i >= 0) { haptic('light'); T.run(() => go(i)); }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'mancala',
  title: 'Mancala',
  tag: 'Board · Strategy',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'calm', vol: .55 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 25,
  hint: 'Tap one of your pits to sow its stones round the board. End in your store to go again; end in an empty pit of yours to capture the stones opposite. Hold more than half (25) to win. Drag to look round, or tap AR.',
  creator: 'Game Scroll',
  make,
};
