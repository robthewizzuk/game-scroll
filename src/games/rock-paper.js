import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Predict, Dial } = gs.brains;

// Rock, paper, scissors against opponents with habits. Each one plays by a hidden rule you can
// read from their history. Beat five rounds to face the next one. Three losses and you're out.
// OWL's habit is you: a Tiny Brains habit reader (gs.brains.Predict) watches every move you make, in
// every duel and every game on this phone, and OWL plays whatever beats the move you're most likely to
// make next. Its read is the habit to work out (so play what beats its answer, or break your pattern),
// and the win-rate dial (gs.brains.Dial) sets how often it trusts the read, so it stays a fair fight.
const P = PAL.moss, W = 160, H = 160, NAMES = ['ROCK', 'PAPER', 'SCISS'];
const beats = m => (m + 1) % 3;   // the move that beats m
// Opponent styles: each sees both histories and returns its move.
const STYLES = [
  { name: 'ROCKY', pick: () => Math.random() < .6 ? 0 : Math.random() * 3 | 0 },
  { name: 'CYCLER', pick: (me, op) => op.length ? (op[op.length - 1] + 1) % 3 : 0 },
  { name: 'COPYCAT', pick: (me) => me.length ? me[me.length - 1] : 1 },
  { name: 'SORE LOSER', pick: (me, op, res) => res.length && res[res.length - 1] === 'win' ? beats(me[me.length - 1]) : op.length ? op[op.length - 1] : 2 },
  { name: 'COUNTER', pick: (me) => me.length ? beats(me[me.length - 1]) : 0 },
  { name: 'SWITCHER', pick: (me, op) => op.length ? (op[op.length - 1] + 2) % 3 : 1 },
];

function icon(c, x, y, m, s, col = P[0]) {
  const q = v => Math.max(1, Math.round(v * s));
  c.fillStyle = col;
  if (m === 0) { c.fillRect(x - q(5), y - q(4), q(10), q(8)); c.fillRect(x - q(4), y - q(5), q(8), q(10)); }
  else if (m === 1) { c.fillRect(x - q(5), y - q(6), q(10), q(12)); c.fillStyle = P[2]; c.fillRect(x - q(3), y - q(3), q(6), 1); c.fillRect(x - q(3), y, q(6), 1); }
  else { c.fillRect(x - q(1), y, q(2), q(6)); c.fillRect(x - q(5), y - q(6), q(3), q(7)); c.fillRect(x + q(2), y - q(6), q(3), q(7)); }
}

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let style, me, op, res, wins, lives, score, t, show;
  const habits = new Predict(api, { name: 'rock-paper-you', moves: 3 }), dial = new Dial(api, { name: 'rock-paper-owl' });
  // OWL plays what beats your likely next move, when it trusts its read (else anything)
  const OWL = { name: 'OWL', pick: () => { const g = habits.guess(); return g != null && habits.sure > .3 && Math.random() < .45 + .5 * dial ? beats(g) : Math.random() * 3 | 0; } };
  function nextFoe() { const pool = [...STYLES, ...(style ? [OWL] : [])].filter(s => s !== style); style = pool[Math.random() * pool.length | 0]; me = []; op = []; res = []; wins = 0; }
  function play(m) {
    if (show) return;
    const o = style.pick(me, op, res); me.push(m); op.push(o); habits.see(m);
    const r = m === o ? 'tie' : beats(o) === m ? 'win' : 'lose'; res.push(r);
    if (r === 'win') { wins++; score++; api.score(score); haptic('success'); sfx(880, .1, 'square', .04, 200); feel.juice.burst(110, 84, { n: 10, speed: 55, life: .45, size: 2, color: [P[0], P[1]] }); }
    else if (r === 'lose') { lives--; haptic('error'); sfx(140, .25, 'square', .05, -40); feel.juice.shake(4); }
    else { haptic('light'); sfx(400, .06, 'square', .03); }
    show = { m, o, r, l: 1 };
  }
  return {
    reset() { style = null; lives = 3; score = 0; t = 0; show = null; feel.clear(); nextFoe(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt;
      if (show) { show.l -= dt; if (show.l <= 0) { show = null; if (lives <= 0) { if (style === OWL) dial.result(false); return api.over(); } if (wins >= 5) { if (style === OWL) dial.result(true); score += 3; api.score(score); haptic('success'); nextFoe(); } } }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = P[0]; c.textAlign = 'left'; c.fillText(`VS ${style.name}`, 4, 10);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? P[0] : P[2]; c.fillRect(W - 10 - i * 8, 4, 5, 5); }
      // history: their last 8 moves (top row) over yours (bottom row)
      const n = op.length, from = Math.max(0, n - 8);
      for (let i = from; i < n; i++) {
        const x = 8 + (i - from) * 18; icon(c, x + 6, 24, op[i], .6); icon(c, x + 6, 38, me[i], .6, P[1]);
        c.fillStyle = res[i] === 'win' ? P[1] : res[i] === 'lose' ? P[0] : P[2]; c.fillRect(x, 46, 12, 2);
      }
      for (let i = 0; i < 5; i++) { c.fillStyle = i < wins ? P[0] : P[2]; c.fillRect(56 + i * 10, 54, 7, 4); }
      if (show) {
        icon(c, 50, 84, show.o, 1.4); icon(c, 110, 84, show.m, 1.4, P[1]);
        c.fillStyle = P[0]; c.textAlign = 'center'; c.fillText(show.r === 'win' ? 'WIN' : show.r === 'lose' ? 'LOSE' : 'TIE', 80, 108);
      } else { c.fillStyle = P[1]; c.textAlign = 'center'; c.fillText('READ THEIR HABIT', 80, 88); }
      for (let i = 0; i < 3; i++) {
        const x = 6 + i * 51; c.fillStyle = P[1]; c.fillRect(x, 118, 46, 36); icon(c, x + 23, 132, i, 1, P[3]);
        c.fillStyle = P[3]; c.textAlign = 'center'; c.fillText(NAMES[i], x + 23, 151);
      }
      feel.end(c, W, H);
    },
    down(x, y) { if (y > 114) play(Math.max(0, Math.min(2, Math.floor((x - 4) / 51)))); },
    key(k, d) { if (!d) return; const m = { r: 0, p: 1, s: 2, 1: 0, 2: 1, 3: 2 }[k]; if (m != null) play(m); if (k === ' ') play(beats(style.pick(me, op, res))); },
  };
}

export default {
  id: 'rock-paper', title: 'Rock Paper Duel', tag: 'Pocket · Strategy', retro: true, w: W, h: H, pal: 'moss', goal: 15,
  hint: 'Each opponent has a habit. Watch their moves at the top, work out the rule, and beat them five times to meet the next. Three losses ends it.',
  make,
};
