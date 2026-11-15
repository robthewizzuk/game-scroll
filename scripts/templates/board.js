// __TITLE__: a starter Board game made with `npm run new`. Change anything you like.
// One file, played two ways (src/kit/tabletop.js, see docs/board-games.md): on a table in a room in
// 3D, or in the player's own room when they tap AR. Shows a painted board, pawns, real dice, turns
// written as async moves, a computer player, and the players' strip.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { Table, slab, pawn, ring, sounds, COLOURS } = gs.tabletop;

let W = 300, H = 460;
const N = 16, STARS = [3, 7, 11, 14];                       // a loop of 16 squares; land on a star to score
const R = 3.2, spot = i => { const a = (i / N) * Math.PI * 2; return { x: Math.sin(a) * R, z: Math.cos(a) * R }; };
const NAMES = ['You', 'Pip'];

function make(api) {
  let T, dice, pawns, mark, at, stars, turn, state;         // state: 'roll' (waiting for a tap) | 'busy' | 'done'
  // Knobs: the numbers that set how it feels (docs/feel-words.md). Sliders in npm run dev (Save to file
  // writes them back); node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = gs.tweak('Feel', {
    hop: [.2, .08, .5, 'seconds for a pawn to hop one square'],
    think: [.6, 0, 2, 'seconds the computer waits before its go'],
    win: [3, 1, 6, 1, 'stars to win'],
  });

  function setup() {
    T = new Table(api, { span: 9, room: 'study' });
    T.board.add(slab({ w: 8, d: 8, paint(g, S) {              // the board's top, painted in code
      g.col.fillStyle = '#e9dcc0'; g.col.fillRect(0, 0, S, S);
      for (let i = 0; i < N; i++) {
        const p = spot(i), x = (p.x / 8 + .5) * S, y = (p.z / 8 + .5) * S, star = STARS.includes(i);
        g.col.fillStyle = star ? '#f0b429' : i % 2 ? '#3a8fe0' : '#e0483a'; g.col.beginPath(); g.col.arc(x, y, S * .055, 0, 7); g.col.fill();
        g.h.fillStyle = '#404040'; g.h.beginPath(); g.h.arc(x, y, S * .055, 0, 7); g.h.fill();   // darker = lower: the squares sit in a little
        if (star) { g.col.fillStyle = '#fff'; g.col.font = `${S * .06}px Rubik, sans-serif`; g.col.textAlign = 'center'; g.col.textBaseline = 'middle'; g.col.fillText('★', x, y + S * .004); }
      }
    } }));
    pawns = [pawn(COLOURS.players[0]), pawn(COLOURS.players[1])]; T.board.add(...pawns);
    mark = ring('#ffe08a', { r: .5 }); T.board.add(mark);
    dice = T.dice(1, { size: .8, tray: { x: 0, z: 0, w: 4, d: 4 } });   // real dice: made here, because the physics engine loads first
  }
  const place = who => { const p = spot(at[who]), side = who ? .22 : -.22; return { x: p.x + side, z: p.z }; };

  async function takeTurn(who) {
    state = 'busy';
    const [n] = await dice.roll();                          // resolves when the die has settled
    for (let i = 0; i < n; i++) { at[who] = (at[who] + 1) % N; await T.hop(pawns[who], place(who), { time: K.hop }); }
    if (STARS.includes(at[who])) {
      stars[who]++; sounds.chime(); haptic('success'); await T.pop(pawns[who]);
      if (who === 0) api.score(stars[0]);
      if (stars[who] >= K.win) { state = 'done'; await T.wait(.8); T.stop(); if (who === 0) api.win(); return api.over(); }
    }
    turn = 1 - who; state = 'roll';
    if (turn === 1) { await T.wait(K.think); await takeTurn(1); }   // the computer's go
  }

  return {
    reset() {
      if (!T) setup();
      T.reset(); at = [0, 0]; stars = [0, 0]; turn = 0; state = 'roll';
      pawns.forEach((p, i) => { const q = place(i); p.position.set(q.x, 0, q.z); });
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;                            // false while AR is finding the floor
      const p = pawns[turn].position; mark.position.set(p.x, .03, p.z); mark.visible = state === 'roll';
    },
    draw(c) {
      T.draw(c, W, H);                                      // the table in its room, or the board in your room
      const y = T.strip(c, W, NAMES.map((name, i) => ({ name, col: COLOURS.players[i], score: stars[i] })), turn);
      T.status(c, W, y, state === 'roll' && turn === 0 ? 'Tap to roll' : state === 'done' ? 'Game over' : turn ? 'Pip is playing…' : 'Rolling…');
      T.hud(c, W, H);                                       // the AR / 3D chip and messages
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) { const tap = T.up(x, y, id); if (tap && state === 'roll' && turn === 0 && !T.busy) T.run(() => takeTurn(0)); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Board · Race',
  retro: true, era: 'board', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  music: 'happy',           // a soundtrack in one line: happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 3,
  hint: 'Tap to roll the die and hop round the loop. Land on a star to score: three stars before Pip wins. Drag to look round the table, pinch to zoom, or tap AR to play it in your room.',
  creator: '__CREATOR__',
  make,
};
