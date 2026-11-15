// Fast Maths: keep a running total in your head. The total sits in the box at the top; each card adds,
// takes away, doubles or halves it and claims an answer. Tap YES if the claim is right, NO if it's wrong.
// Either way the total moves on to the true answer, so every card builds on the last. Every few cards
// the box fogs over and you carry the total yourself. Right answers in a row raise the multiplier.
import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { text } = gs.pixel;

const P = PAL.ice, W = 160, H = 160;   // P[0] darkest ... P[3] lightest

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ text: 'TAP TO START' });                   // the first card stays face down until the first tap
  const K = gs.tweak('Feel', {
    time: [4.4, 2, 8, 'seconds for the first cards'],
    fastest: [1.7, .8, 4, 'seconds a card gets when it is hardest'],
    faster: [.055, 0, .2, 'seconds taken off the time for each card answered'],
    fogEvery: [6, 3, 12, 1, 'right answers between fogs'],
    fogFor: [3, 1, 6, 1, 'cards the total stays hidden'],
    lives: [3, 1, 6, 1, 'wrong answers before it is over'],
  });
  let lives, total, card, time, limit, score, streak, answered, sinceFog, fog, t, fly, msg, shown;

  // the next card: an operation on the running total and a claimed result (true about half the time)
  function deal() {
    const lvl = Math.min(5, answered / 5 | 0), ops = ['+', '-'];
    if (lvl >= 1) ops.push('x2');
    if (lvl >= 2 && total % 2 === 0 && total > 2) ops.push('/2');
    if (lvl >= 3) ops.push('x3', '+', '-');
    let op = ops[Math.random() * ops.length | 0], n = 0, r;
    if (total > 120 && (op === 'x2' || op === 'x3')) op = total % 2 === 0 ? '/2' : '-';
    if (total < 4 && (op === '-' || op === '/2')) op = '+';
    if (op === '+') { n = 1 + (Math.random() * (8 + lvl * 4) | 0); r = total + n; }
    else if (op === '-') { n = 1 + (Math.random() * Math.min(total, 8 + lvl * 4) | 0); r = total - n; }
    else if (op === 'x2') r = total * 2;
    else if (op === 'x3') r = total * 3;
    else r = total / 2;
    let claim = r;
    if (Math.random() < .5) {   // a near miss: off by one or two, by ten, or the digits swapped
      const k = Math.random(), swap = r >= 10 && r % 10 !== (r / 10 | 0) % 10 ? +String(r).split('').reverse().join('') : null;
      claim = k < .5 ? r + [1, -1, 2, -2][Math.random() * 4 | 0] : k < .8 || swap == null ? r + (Math.random() < .5 ? 10 : -10) : swap;
      if (claim < 0 || claim === r) claim = r + 1;
    }
    card = { op, n, r, claim, label: op === '+' ? `+${n}` : op === '-' ? `-${n}` : op === 'x2' ? 'x2' : op === 'x3' ? 'x3' : 'HALF' };
    limit = Math.max(K.fastest, K.time - answered * K.faster); time = limit;
  }
  const mult = () => streak >= 8 ? 3 : streak >= 4 ? 2 : 1;
  function answer(yes) {
    if (fly) return;
    const right = yes === (card.claim === card.r);
    answered++; fly = { dir: yes ? -1 : 1, t: 0, label: card.label, claim: card.claim, ok: right };
    if (right) {
      streak++; score += mult(); api.score(score); sinceFog++;
      haptic('light'); sfx(620 + Math.min(streak, 12) * 30, .05, 'square', .04, 150);
      feel.juice.pop(140, 84, `+${mult()}`, { color: P[0], size: 8 });
      if (streak === 4 || streak === 8) { feel.juice.pop(132, 18, `x${mult()}`, { color: P[0], size: 8 }); sfx(990, .15, 'square', .04, 400); }
    } else {
      streak = 0; lives--; msg = { txt: `WAS ${card.r}`, l: 1.1 };
      haptic('error'); sfx(140, .3, 'square', .05, -40); feel.juice.shake(4);
      if (lives <= 0) { total = card.r; feel.lose(); return api.over(); }
    }
    total = card.r;
    if (fog > 0) fog--; else if (sinceFog >= K.fogEvery) { fog = K.fogFor; sinceFog = 0; sfx(300, .25, 'triangle', .04, -100); }
    shown = fog > 0 ? null : total;
    deal();
  }
  function timeout() {
    answered++; streak = 0; lives--; msg = { txt: `WAS ${card.r}`, l: 1.1 };
    fly = { dir: 0, t: 0, label: card.label, claim: card.claim, ok: false };
    haptic('error'); sfx(140, .3, 'square', .05, -40); feel.juice.shake(4);
    if (lives <= 0) return api.over();
    total = card.r; if (fog > 0) fog--; shown = fog > 0 ? null : total; deal();
  }

  return {
    reset() {
      lives = K.lives; total = 3 + (Math.random() * 7 | 0); shown = total; score = 0; streak = 0; answered = 0; sinceFog = 0; fog = 0;
      t = 0; fly = null; msg = null; feel.clear(); ready.reset(); deal();
    },
    fx(dt) { feel.update(dt); if (fly) fly.t += dt; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; if (fly) { fly.t += dt; if (fly.t > .3) fly = null; }
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      time -= dt; if (time <= 0) timeout();
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      // lives top left, multiplier top right: the app's score sits top centre
      for (let i = 0; i < K.lives; i++) { c.fillStyle = i < lives ? P[0] : P[2]; c.fillRect(4 + i * 7, 4, 5, 5); }
      text(c, `x${mult()}`, W - 4, 3, { color: mult() > 1 ? P[0] : P[2], align: 'right' });
      feel.begin(c);
      // the running total
      c.fillStyle = P[0]; c.fillRect(48, 16, 64, 30); c.fillStyle = shown == null ? P[1] : P[3]; c.fillRect(50, 18, 60, 26);
      if (shown == null) { for (let i = 0; i < 9; i++) { c.fillStyle = P[2]; c.fillRect(52 + (i * 23 + (t * 9 | 0)) % 54, 21 + (i * 7) % 18, 6, 2); } text(c, '?', 80, 24, { font: 'big', color: P[3], align: 'center', size: 2 }); }
      else text(c, String(shown), 80, 23, { font: 'big', color: P[0], align: 'center', size: 2 });
      text(c, fog > 0 ? 'KEEP IT IN YOUR HEAD' : 'TOTAL', 80, 49, { color: P[1], align: 'center' });
      // time bar
      c.fillStyle = P[2]; c.fillRect(10, 59, 140, 3); c.fillStyle = P[0]; c.fillRect(10, 59, Math.round(140 * clamp(time / limit, 0, 1)), 3);
      // the card flying away, then the card in play
      if (fly) {
        const k = Math.min(1, fly.t / .3), x = Math.round(30 + fly.dir * k * 110), y = Math.round(68 + (fly.dir ? 0 : k * 50));
        c.fillStyle = fly.ok ? P[2] : P[1]; c.fillRect(x, y, 100, 32);
        text(c, fly.ok ? 'RIGHT' : 'WRONG', x + 50, y + 12, { font: 'big', color: P[3], align: 'center' });
      }
      if (!ready.waiting && (!fly || fly.t > .1)) {
        c.fillStyle = P[0]; c.fillRect(29, 67, 102, 34); c.fillStyle = P[3]; c.fillRect(30, 68, 100, 32);
        text(c, card.label, 80, 72, { font: 'big', color: P[0], align: 'center' });
        text(c, `= ${card.claim} ?`, 80, 86, { font: 'big', color: P[1], align: 'center' });
      }
      feel.end(c, W, H);
      // answer buttons
      c.fillStyle = P[1]; c.fillRect(6, 112, 70, 40); c.fillRect(84, 112, 70, 40);
      text(c, 'YES', 41, 128, { font: 'big', color: P[3], align: 'center' }); text(c, 'NO', 119, 128, { font: 'big', color: P[3], align: 'center' });
      if (msg) { c.fillStyle = P[0]; c.fillRect(40, 101, 80, 10); text(c, msg.txt, 80, 104, { color: P[3], align: 'center' }); }
      ready.draw(c, W, H, { pixel: true, color: P[0], y: 84 });
    },
    down(x, y) { if (ready.go()) return; if (y > 64) answer(x < 80); },
    key(k, d) { if (!d || ready.go()) return; if (k === 'ArrowLeft' || k === 'y') answer(true); if (k === 'ArrowRight' || k === 'n') answer(false); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'fast-maths', title: 'Fast Maths', tag: 'Pocket · Brain', retro: true, w: W, h: H, pal: 'ice', goal: 50,
  tick: 60, music: 'puzzle',
  hint: 'Keep a running total: each card changes it and claims the answer. Tap YES if it is right, NO if not. Sometimes the total hides, so keep it in your head. Three wrong and it is over.',
  make,
};
