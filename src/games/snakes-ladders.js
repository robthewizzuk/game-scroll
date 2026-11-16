// Snakes & Ladders, with a choice: every turn you throw two real dice and pick which one to move by,
// so you can step round a snake's mouth or stretch for a ladder. Race two computer players to square
// 64. The snakes and ladders lie on the board in 3D: ladders are climbed, and a snake swallows the
// pawn and slides it down to its tail. Shake the phone (or tap) to throw. Your race is kept if you leave.
import gs from '../gamescroll.js';
const { haptic, onShake } = gs.device;
const { noise } = gs.sound;
const { Table, slab, pawn, ring, eyes, wood, fuse, sounds, COLOURS } = gs.tabletop;
const { pbr, rbox } = gs.hd;
const { Mesh, Group, TubeGeometry, CatmullRomCurve3, Vector3, SphereGeometry, BoxGeometry, PlaneGeometry } = gs.THREE;
const { icon } = gs.icons;

let W = 300, H = 460;
const END = 64, BZ = -.95;                                           // the last square; how far back the board sits (the dice tray is in front)
const LADDERS = { 3: 20, 9: 26, 18: 37, 28: 45, 41: 58 };            // foot -> top
const SNAKES = { 62: 43, 55: 36, 47: 30, 33: 14, 24: 7 };            // mouth -> tail
const SNAKE_COLS = ['#3fae5a', '#e08a2a', '#a05ad6', '#2aa6b8', '#d6485a'];
const WHO = [{ name: 'You', col: COLOURS.players[0] }, { name: 'Mabel', col: COLOURS.players[1] }, { name: 'Tobias', col: COLOURS.players[2] }];
const OFF = [[-.2, .16], [.2, .16], [0, -.2]];                       // where each pawn stands in a shared square
const cell = n => { const r = Math.floor((n - 1) / 8), c = (n - 1) % 8; return { col: r % 2 ? 7 - c : c, row: r }; };   // the squares wind back and forth up the board
const spot = n => { const { col, row } = cell(n); return { x: col - 3.5, z: BZ + 3.5 - row }; };
const land = n => LADDERS[n] || SNAKES[n] || n;                      // where a pawn ends up after a square's ladder or snake

function make(api) {
  let T, dice, pawns, marks, curves, at, turn, state, vals, choose, shown;

  function setup() {
    T = new Table(api, { span: 11.2, room: 'sunroom', pitch: 60, look: [0, 0, .15] });
    dice = T.dice(2, { size: .62, tray: { x: 0, z: 4.45, w: 4.6, d: 1.5 } });
    const board = slab({ w: 8, d: 8, rim: .3, wood: '#a8713c', paint(g, S) {
      const q = S / 8, c = g.col;
      for (let n = 1; n <= END; n++) {
        const { col, row } = cell(n), x = col * q, y = (7 - row) * q;
        c.fillStyle = n === END ? '#f2c230' : LADDERS[n] ? '#bfe3b0' : SNAKES[n] ? '#f3c0b4' : (col + row) % 2 ? '#f4ead2' : '#e6d5ae'; c.fillRect(x, y, q, q);
        c.fillStyle = n === END ? '#7a4a00' : '#8a7350'; c.font = `700 ${q * .26}px Rubik, sans-serif`; c.textAlign = 'left'; c.textBaseline = 'top'; if (n === END) icon(c, 'star', x + q * .2, y + q * .2, q * .26, { color: c.fillStyle }); else c.fillText(String(n), x + q * .08, y + q * .07);
      }
      g.h.strokeStyle = '#555'; g.h.lineWidth = S / 400; c.strokeStyle = '#b89f70'; c.lineWidth = S / 500;
      for (let i = 0; i <= 8; i++) for (const k of [g.h, c]) { k.beginPath(); k.moveTo(i * q, 0); k.lineTo(i * q, S); k.moveTo(0, i * q); k.lineTo(S, i * q); k.stroke(); }
    } });
    board.position.z = BZ; T.board.add(board);
    // the dice tray: a felt-lined wooden box in front of the board
    const tray = new Group(), wd = wood('#8a5a34');
    const base = new Mesh(rbox(5.3, .3, 2.2, .06), wd); base.position.y = -.156;
    const felt = new Mesh(new PlaneGeometry(4.7, 1.6).rotateX(-Math.PI / 2), pbr('#2f7d5a', { rough: 1 })); felt.position.y = .002; felt.receiveShadow = true;
    tray.add(base);
    for (const [x, z, w, d] of [[0, -.95, 5.3, .3], [0, .95, 5.3, .3], [-2.5, 0, .3, 1.6], [2.5, 0, .3, 1.6]]) { const b = new Mesh(rbox(w, .34, d, .05), wd); b.position.set(x, .1, z); tray.add(b); }
    const box = fuse(tray); box.add(felt); box.position.z = 4.45; T.board.add(box);
    // ladders: two rails and their rungs, one mesh each
    const lw = wood('#d9a860', { clear: .4 });
    for (const [a, b] of Object.entries(LADDERS)) {
      const p = spot(+a), q = spot(b), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), g = new Group();
      for (const s of [-.19, .19]) { const rail = new Mesh(new BoxGeometry(L + .3, .07, .07), lw); rail.position.z = s; g.add(rail); }
      for (let x = -L / 2 + .1; x <= L / 2 - .05; x += .4) { const rung = new Mesh(new BoxGeometry(.06, .05, .38), lw); rung.position.x = x; g.add(rung); }
      g.position.set((p.x + q.x) / 2, .06, (p.z + q.z) / 2); g.rotation.y = Math.atan2(-dz, dx); T.board.add(fuse(g));
    }
    // snakes: a wavy tube from mouth to tail, with a head that watches the board
    curves = {};
    Object.entries(SNAKES).forEach(([a, b], i) => {
      const p = spot(+a), q = spot(b), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), px = -dz / L, pz = dx / L, pts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10, w = Math.sin(t * Math.PI * 3) * .34 * Math.sin(t * Math.PI); pts.push(new Vector3(p.x + dx * t + px * w, .13, p.z + dz * t + pz * w)); }
      const curve = curves[a] = new CatmullRomCurve3(pts), skin = pbr(SNAKE_COLS[i], { rough: .3, clear: .8 });
      const body = new Mesh(new TubeGeometry(curve, 44, .12, 8), skin); body.castShadow = true; T.board.add(body);
      const tail = new Mesh(new SphereGeometry(.12, 8, 6), skin); tail.position.copy(pts[10]); T.board.add(tail);
      const head = new Mesh(new SphereGeometry(.2, 12, 8), skin); head.scale.set(1, .72, 1.35); head.position.set(p.x, .17, p.z); head.rotation.y = Math.atan2(-dx, -dz); head.castShadow = true;
      const ey = eyes('#fff6c0', { y: .12, z: .09, gap: .09, r: .045, glow: 1.2 }); head.add(ey); T.board.add(head);
    });
    pawns = WHO.map(w => { const p = pawn(w.col, { r: .2, h: .62 }); T.board.add(p); return p; });
    marks = [ring('#ffe08a', { r: .4, w: .05, glow: 2 }), ring('#8ad0ff', { r: .4, w: .05, glow: 2 })]; T.board.add(...marks);
  }
  const place = (who, n = at[who]) => { const p = spot(n); return { x: p.x + OFF[who][0], z: p.z + OFF[who][1] }; };
  const save = () => api.save({ at, turn });

  async function walk(who, steps) {
    const me = pawns[who];
    for (let i = 0; i < steps && at[who] < END; i++) { at[who]++; await T.hop(me, place(who), { time: .17, h: .42 }); }
    const n = at[who];
    if (LADDERS[n]) {
      sounds.chime(.8); haptic('success'); await T.wait(.15);
      at[who] = LADDERS[n]; await T.slide(me, { ...place(who), y: 0 }, { time: .7, sound: false }); sounds.clack();
    } else if (SNAKES[n]) {
      noise(.5, { vol: .07, from: 7000, to: 3500, filter: 'highpass' }); haptic('warning'); T.shake(.35); await T.pop(me, { by: -.3, time: .3 });
      const curve = curves[n]; at[who] = SNAKES[n];
      await T.tween(.95, k => { const q = curve.getPoint(k); me.position.set(q.x, .16 + Math.sin(k * Math.PI) * .1, q.z); me.scale.setScalar(.55 + .45 * Math.abs(1 - 2 * k)); }, { ease: 'inOut' });
      me.scale.setScalar(1); await T.hop(me, { ...place(who), y: 0 }, { time: .2, h: .3 });
    }
    if (who === 0) api.score(at[0]);
  }
  async function takeTurn(who) {
    state = 'busy'; turn = who;
    vals = await dice.roll();
    let pick = 0;
    const ends = vals.map(v => Math.min(END, at[who] + v));
    if (vals[0] !== vals[1]) {
      if (who === 0) {
        shown = ends; marks.forEach((m, i) => { const p = spot(ends[i]); m.position.set(p.x, .03, p.z); m.visible = true; });
        state = 'pick'; pick = await T.until(new Promise(res => { choose = res; })); state = 'busy';
        marks.forEach(m => { m.visible = false; }); shown = null;
      } else {
        await T.wait(.55);
        pick = Math.random() < .2 ? (Math.random() < .5 ? 0 : 1) : land(ends[0]) >= land(ends[1]) ? 0 : 1;   // usually the better die; now and then, a slip
      }
    } else await T.wait(.35);
    sounds.tick(); await T.pop(dice.meshes[pick], { by: .3, time: .2 });
    await walk(who, vals[pick]);
    if (at[who] >= END) {
      state = 'done'; sounds.gong(); T.puff({ ...spot(END), y: .5 }, { col: '#ffe08a', glow: true, n: 24, speed: 2.4, up: 2.2, size: .25 });
      if (who === 0) api.win();
      await T.wait(1.4); api.clearSave(); T.stop(); return api.over();
    }
    turn = (who + 1) % WHO.length; save();
    if (turn !== 0) { await T.wait(.45); return takeTurn(turn); }
    state = 'roll';
  }
  const throwDice = () => { if (state === 'roll' && turn === 0 && T && !T.busy && !T.hidden) T.run(() => takeTurn(0)); };
  onShake(throwDice);

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const s = api.load(null), ok = s && Array.isArray(s.at) && s.at.length === WHO.length && s.at.every(n => n >= 1 && n < END);
      at = ok ? s.at.slice() : WHO.map(() => 1); turn = 0; state = 'roll'; vals = null; choose = null; shown = null;
      pawns.forEach((p, i) => { const q = place(i); p.position.set(q.x, 0, q.z); p.scale.setScalar(1); });
      marks.forEach(m => { m.visible = false; });
      if (at[0] > 1) api.score(at[0]);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) { if (!T.update(dt)) return; },
    draw(c) {
      T.draw(c, W, H);
      const y = T.strip(c, W, WHO.map((w, i) => ({ name: w.name, col: w.col, score: at[i] })), state === 'done' ? -1 : turn);
      T.status(c, W, y, state === 'roll' ? 'Tap or shake to throw' : state === 'pick' ? 'Pick a die: tap it, or its square' : state === 'done' ? `${at.findIndex(n => n >= END) === 0 ? 'You win' : WHO[at.findIndex(n => n >= END)].name + ' wins'}!` : turn ? `${WHO[turn].name}'s turn` : 'Rolling…');
      if (shown && !T.hidden) {                               // what each die would do, written over its square
        c.save(); c.font = '800 12px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        shown.forEach((n, i) => {
          const p = spot(n), [sx, sy] = T.toScreen({ x: p.x, y: .5, z: p.z }), to = land(n), text = `+${vals[i]}${to !== n ? (to > n ? ' ↑' : ' ↓') + to : ''}`, w = c.measureText(text).width + 14;
          c.fillStyle = i ? '#bfe6ff' : '#ffe9a8'; c.beginPath(); c.roundRect(sx - w / 2, sy - 22, w, 18, 9); c.fill(); c.fillStyle = '#1a1d24'; c.fillText(text, sx, sy - 12.5);
        });
        c.restore();
      }
      T.hud(c, W, H);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap || tap.chip) return;
      if (state === 'roll') return throwDice();
      if (state === 'pick' && choose) {
        const die = T.over(tap.x, tap.y, dice.meshes), i = die ? dice.meshes.indexOf(die) : T.nearest(tap.x, tap.y, shown.map(n => ({ ...spot(n), y: .1 })), 44);
        if (i >= 0) { const go = choose; choose = null; haptic('light'); go(i); }
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'snakes-ladders',
  title: 'Snakes & Ladders',
  tag: 'Board · Race',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'happy', vol: .55 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: END,
  hint: 'Throw two dice (tap, or shake the phone) and pick which one to move by: climb ladders, dodge the snakes, and reach square 64 before Mabel and Tobias. Drag to look round, or tap AR to play on your floor.',
  creator: 'Game Scroll',
  make,
};
