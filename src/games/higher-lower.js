import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects;
const { icon } = gs.icons;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Guess if the next card is higher or lower. Each right guess grows the pot, more for riskier calls.
// Cash out any time to bank it; a wrong guess loses the pot. Same value is a free push. Five runs.
const W = 360, H = 640, RUNS = 5, SUITS = ['spades', 'hearts', 'diamonds', 'clubs'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let deck, cur, prev, pot, bank, run, t, msg, flip, streak;
  function draw1() { if (!deck.length) newDeck(); return deck.pop(); }
  function newDeck() { deck = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ r, s }); deck = shuffle(deck); }
  function newRun() { cur = draw1(); prev = null; pot = 0; streak = 0; }
  function odds(up) { // chance of being right, given what's left in the deck
    let win = 0, n = 0; for (const c of deck) { if (c.r === cur.r) continue; n++; if (up ? c.r > cur.r : c.r < cur.r) win++; }
    return n ? win / n : .5;
  }
  function guess(up) {
    if (flip > 0) return; const p = Math.max(.08, odds(up)); prev = cur; cur = draw1(); flip = .35;
    if (cur.r === prev.r) { msg = { txt: 'PUSH', l: .9, c: '#ffffff' }; haptic('light'); sfx(400, .06, 'triangle', .04); return; }
    const right = up ? cur.r > prev.r : cur.r < prev.r;
    if (right) { const gain = Math.max(1, Math.round((1 / p - 1) * 6)); pot += gain; streak++; msg = { txt: `+${gain}`, l: .9, c: '#7dff9a' }; feel.juice.burst(230, 290, { n: 6 + Math.min(20, gain * 2), speed: 180, life: .5, size: 3.5, color: ['#7dff9a', '#ffffff'] }); haptic(p < .35 ? 'success' : 'light'); sfx(500 + streak * 60, .1, 'triangle', .05, 200); }
    else { msg = { txt: pot ? `LOST ${pot}` : 'WRONG', l: 1.2, c: '#ff6b6b' }; pot = 0; feel.juice.shake(7).flash('#ff4040', .2); haptic('error'); sfx(140, .3, 'triangle', .06, -40); endRun(); }
  }
  function cash() {
    if (flip > 0 || !pot) return; bank += pot; api.score(bank); msg = { txt: `BANKED ${pot}`, l: 1.2, c: '#ffd34a' }; feel.juice.burst(W / 2, 150, { n: 10 + Math.min(30, pot), speed: 220, life: .7, size: 4, color: ['#ffd34a', '#ffffff'], gravity: 380 }); haptic('success'); sfx(880, .2, 'triangle', .06, 300); pot = 0; endRun();
  }
  function endRun() { run++; if (run >= RUNS) { flip = 1.4; lastRun = true; } else { flip = 1.1; next = true; } }
  let next = false, lastRun = false;
  return {
    reset() { newDeck(); bank = 0; run = 0; t = 0; msg = null; flip = 0; next = false; lastRun = false; feel.clear(); newRun(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; if (msg) msg.l -= dt;
      if (flip > 0) { flip -= dt; if (flip <= 0) { if (lastRun) return api.over(); if (next) { next = false; newRun(); } } }
    },
    draw(c) {
      c.fillStyle = '#0f3d2a'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffffff08'; c.beginPath(); c.ellipse(W / 2, 300, 230, 170, 0, 0, 7); c.fill();
      feel.begin(c);
      const card = (x, y, cd, s = 1, alpha = 1) => {
        c.globalAlpha = alpha; c.save(); c.translate(x, y); c.scale(s, 1);
        c.fillStyle = '#fafafa'; c.beginPath(); c.roundRect(-60, -85, 120, 170, 12); c.fill();
        const red = cd.s === 1 || cd.s === 2; c.fillStyle = red ? '#d32f2f' : '#222';
        c.font = '800 44px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(RANKS[cd.r], 0, 10); icon(c, SUITS[cd.s], 0, 45, 30, { color: c.fillStyle });
        c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(RANKS[cd.r], -52, -62); icon(c, SUITS[cd.s], -52 + c.measureText(RANKS[cd.r]).width + 8, -68, 13, { color: c.fillStyle });
        c.restore(); c.globalAlpha = 1;
      };
      if (prev) card(95, 290, prev, .8, .45);
      const fl = flip > 0 && !next && !lastRun ? Math.abs(Math.cos(clamp(flip / .35, 0, 1) * Math.PI)) : 1;
      card(prev ? 230 : W / 2, 290, cur, Math.max(.05, fl));
      feel.end(c, W, H);
      c.fillStyle = '#ffffffcc'; c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`RUN ${Math.min(run + 1, RUNS)}/${RUNS}`, 14, 26);
      c.textAlign = 'right'; c.fillText(`BANK ${bank}`, W - 14, 26);
      c.textAlign = 'center'; c.font = '400 16px "Press Start 2P", monospace'; c.fillStyle = '#ffd34a'; c.fillText(`POT ${pot}`, W / 2, 150);
      const pu = odds(true), pd = odds(false);
      const btn = (x, y, w, h, col, label, sub) => { c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, h, 16); c.fill(); c.fillStyle = '#10241a'; c.font = '400 12px "Press Start 2P", monospace'; c.fillText(label, x + w / 2, y + h / 2 + 2); if (sub) { c.font = '500 12px Rubik, sans-serif'; c.fillText(sub, x + w / 2, y + h / 2 + 20); } };
      btn(24, 420, 150, 76, '#7dd3ff', 'HIGHER', `${Math.round(pu * 100)}% chance`); btn(186, 420, 150, 76, '#ffb37d', 'LOWER', `${Math.round(pd * 100)}% chance`);
      btn(90, 512, 180, 56, pot ? '#ffd34a' : '#ffffff30', 'CASH OUT');
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.c; c.font = '400 18px "Press Start 2P", monospace'; c.fillText(msg.txt, W / 2, 100); c.globalAlpha = 1; }
    },
    down(x, y) { if (y > 420 && y < 496) guess(x < W / 2); else if (y > 512 && y < 568) cash(); },
    key(k, d) { if (!d) return; if (k === 'ArrowUp') guess(true); if (k === 'ArrowDown') guess(false); if (k === 'Enter' || k === 'c') cash(); if (k === ' ') { if (pot > 6) cash(); else guess(odds(true) > .5); } },
  };
}

export default {
  id: 'higher-lower', title: 'Higher or Lower', tag: 'Casual · Cards', retro: false, w: W, h: H, goal: 60,
  hint: 'Guess whether the next card is higher or lower. Long-shot guesses pay more. Cash out to bank the pot, or lose it on a wrong guess. Five runs.',
  make,
};
