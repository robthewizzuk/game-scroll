import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// You're mayor of a little town. Townsfolk bring requests: swipe left or right to decide.
// Keep Food, Gold, Mood and Safety balanced: if any runs out OR overflows, your term is over.
const W = 360, H = 640, METERS = [['FOOD', '#7dd36a'], ['GOLD', '#ffd34a'], ['MOOD', '#ff8ac0'], ['SAFETY', '#6ab8ff']];
// d = [food, gold, mood, safety]
const CARDS = [
  { who: 'Farmer', txt: 'The north field flooded. Pay to drain it?', L: ['No', [-2, 0, -1, 0]], R: ['Pay', [2, -2, 0, 0]] },
  { who: 'Baker', txt: 'Let me give out free bread on market day!', L: ['Not now', [0, 0, -1, 0]], R: ['Lovely', [-1, 0, 2, 0]] },
  { who: 'Captain', txt: 'Wolves near the woods. I need more guards.', L: ['Too costly', [0, 0, 0, -2]], R: ['Hire them', [0, -2, 0, 2]] },
  { who: 'Merchant', txt: 'Let my caravans pass through, for a fee to you.', L: ['Refuse', [0, -1, 0, 1]], R: ['Welcome', [1, 2, 0, -1]] },
  { who: 'Teacher', txt: 'The school roof leaks. Can the town fix it?', L: ['Next year', [0, 0, -2, 0]], R: ['Fix it', [0, -2, 2, 0]] },
  { who: 'Jester', txt: 'A festival! Music, dancing, games!', L: ['Too rowdy', [0, 0, -1, 1]], R: ['Party!', [-1, -1, 3, -1]] },
  { who: 'Tax Clerk', txt: 'Raise taxes a little this season?', L: ['No', [0, -1, 1, 0]], R: ['Raise', [0, 3, -2, 0]] },
  { who: 'Fisher', txt: 'Build a new pier and we will catch twice as much.', L: ['No', [0, 0, -1, 0]], R: ['Build', [2, -2, 0, 0]] },
  { who: 'Stranger', txt: 'Buy my magic beans? Only a little gold...', L: ['Shoo', [0, 0, 0, 0]], R: ['Why not', [2, -1, 0, -1]] },
  { who: 'Healer', txt: 'A cough is spreading. Close the market for a week?', L: ['Keep open', [0, 1, -1, -2]], R: ['Close it', [-1, -2, -1, 2]] },
  { who: 'Knight', txt: 'Bandits on the road. Shall I ride out?', L: ['Stay', [0, -1, 0, -2]], R: ['Ride!', [-1, 1, 1, 2]] },
  { who: 'Miller', txt: 'Sell our spare grain to the next town?', L: ['Keep it', [1, 0, 0, 0]], R: ['Sell', [-2, 3, 0, 0]] },
  { who: 'Kids', txt: 'Can we have a playground by the pond?', L: ['No', [0, 0, -2, 0]], R: ['Yes!', [0, -2, 3, -1]] },
  { who: 'Guard', txt: 'Lock the gates every night from now on?', L: ['No', [0, 0, 1, -1]], R: ['Lock up', [-1, 0, -1, 2]] },
  { who: 'Banker', txt: 'Lend the town gold now, pay me back with interest.', L: ['No debt', [0, 0, 0, 0]], R: ['Borrow', [0, 3, 0, -1]] },
  { who: 'Shepherd', txt: 'Sheep keep wandering into town. Build a fence?', L: ['Let them', [1, 0, -1, -1]], R: ['Fence', [0, -1, 1, 1]] },
  { who: 'Bard', txt: 'Let me write a song about your wise rule!', L: ['Modest', [0, 0, 0, 0]], R: ['Please do', [0, -1, 2, 0]] },
  { who: 'Old Witch', txt: 'Cross my palm with gold and I will bless the harvest.', L: ['Nonsense', [0, 0, -1, 0]], R: ['Pay her', [2, -2, 1, 0]] },
  { who: 'Blacksmith', txt: 'I could forge swords... or ploughs. Which?', L: ['Ploughs', [2, 0, 0, -1]], R: ['Swords', [-1, 0, 0, 2]] },
  { who: 'Neighbour Lord', txt: 'Join my hunting party? It is costly, but good for friendship.', L: ['Decline', [0, 0, 0, -1]], R: ['Join', [1, -2, 1, 1]] },
  { who: 'Brewer', txt: 'Open a new tavern on the square?', L: ['No', [0, 0, -1, 1]], R: ['Cheers', [-1, 2, 2, -2]] },
  { who: 'Scout', txt: 'There is gold in the hills! Send miners?', L: ['Too risky', [0, 0, 0, 0]], R: ['Dig', [-1, 3, 0, -1]] },
  { who: 'Cook', txt: 'Hold a feast for the whole town?', L: ['Save food', [1, 0, -1, 0]], R: ['Feast!', [-3, 0, 3, 0]] },
  { who: 'Watchman', txt: 'Build a tall watchtower on the hill?', L: ['No', [0, 0, 0, -1]], R: ['Build', [0, -2, 0, 3]] },
  { who: 'Gardener', txt: 'Plant an orchard on the common?', L: ['No', [0, 0, 0, 0]], R: ['Plant', [2, -1, 1, 0]] },
];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let m, card, deck, days, drag, fly, t, flash, last;
  function nextCard() { if (!deck.length) deck = shuffle(CARDS.map((_, i) => i)); let i; do i = deck.pop(); while (i === last && deck.length); last = i; card = CARDS[i]; }
  function choose(right) {
    const ch = right ? card.R : card.L;
    ch[1].forEach((d, i) => { m[i] = clamp(m[i] + d, 0, 10); if (d) feel.juice.pop(51 + i * 80, 58, d > 0 ? `+${d}` : `${d}`, { color: d > 0 ? '#7dff9a' : '#ff8a8a', size: 15 }); });
    days++; api.score(days); fly = { dir: right ? 1 : -1, l: .3, card };
    flash = ch[1].map(d => d);
    haptic('light'); sfx(right ? 600 : 450, .06, 'triangle', .04, right ? 120 : -120);
    const bad = m.findIndex(v => v <= 0 || v >= 10);
    if (bad >= 0) { haptic('error'); sfx(130, .4, 'triangle', .06, -40); feel.juice.shake(7); return api.over(); }
    nextCard();
  }
  return {
    reset() { m = [5, 5, 5, 5]; deck = []; days = 0; drag = null; fly = null; t = 0; flash = null; last = -1; feel.clear(); nextCard(); },
    fx(dt) { feel.update(dt); },
    update(dt) { feel.update(dt); t += dt; if (fly) { fly.l -= dt; if (fly.l <= 0) fly = null; } },
    draw(c) {
      c.fillStyle = '#2a2140'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      // meters
      METERS.forEach(([name, col], i) => {
        const x = 26 + i * 80, v = m[i] / 10;
        c.fillStyle = '#ffffff14'; c.fillRect(x, 64, 50, 60); c.fillStyle = v <= .2 || v >= .8 ? '#ff5a5a' : col; c.fillRect(x, 64 + 60 * (1 - v), 50, 60 * v);
        c.fillStyle = '#ffffffcc'; c.font = '400 7px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(name, x + 25, 140);
        const pre = drag && Math.abs(drag.dx) > 20 ? (drag.dx > 0 ? card.R : card.L)[1][i] : 0;
        if (pre) { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + 25, 52, Math.abs(pre) > 1 ? 6 : 3.5, 0, 7); c.fill(); }
      });
      // card
      const dx = drag ? drag.dx : 0, rot = dx / 600;
      const drawCard = (cd, ox, r, a) => {
        c.save(); c.globalAlpha = a; c.translate(W / 2 + ox, 368); c.rotate(r);
        c.fillStyle = '#f6eedc'; c.beginPath(); c.roundRect(-140, -180, 280, 360, 20); c.fill();
        c.fillStyle = '#8a6a4a'; c.beginPath(); c.arc(0, -90, 50, 0, 7); c.fill(); c.fillStyle = '#f2c79a'; c.beginPath(); c.arc(0, -95, 30, 0, 7); c.fill();
        c.fillStyle = '#3a2a1a'; c.fillRect(-12, -102, 6, 6); c.fillRect(6, -102, 6, 6);
        c.fillStyle = '#3a2a1a'; c.font = '700 18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(cd.who, 0, -20);
        c.font = '500 15px Rubik, sans-serif'; wrap(c, cd.txt, 0, 12, 240, 20);
        if (Math.abs(ox) > 20 && cd === card) { const ch = ox > 0 ? cd.R : cd.L; c.fillStyle = ox > 0 ? '#2e8a4a' : '#b03a3a'; c.font = '700 20px Rubik, sans-serif'; c.fillText(ch[0], 0, 140); }
        c.restore(); c.globalAlpha = 1;
      };
      if (fly) drawCard(fly.card, fly.dir * (1 - fly.l / .3) * 400, fly.dir * .4, fly.l / .3);
      drawCard(card, dx, rot, 1);
      feel.end(c, W, H);
      c.fillStyle = '#ffffffaa'; c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`DAY ${days + 1}`, W / 2, 590);
      c.font = '500 12px Rubik, sans-serif'; c.fillText(`← ${card.L[0]}     ${card.R[0]} →`, W / 2, 615);
    },
    down(x) { drag = { x0: x, dx: 0 }; },
    move(x) { if (drag) { const old = Math.abs(drag.dx) > 20; drag.dx = x - drag.x0; if (!old && Math.abs(drag.dx) > 20) haptic('tick'); } },
    up() { if (!drag) return; const d = drag.dx; drag = null; if (Math.abs(d) > 80) choose(d > 0); },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') choose(false); if (k === 'ArrowRight') choose(true); if (k === ' ') { const score = ch => ch[1].reduce((s, v, i) => s + Math.abs(m[i] + v - 5), 0); choose(score(card.R) < score(card.L)); } },
  };
}
function wrap(c, txt, x, y, maxW, lh) {
  const words = txt.split(' '); let line = '';
  for (const w of words) { const test = line ? line + ' ' + w : w; if (c.measureText(test).width > maxW) { c.fillText(line, x, y); line = w; y += lh; } else line = test; }
  c.fillText(line, x, y);
}

export default {
  id: 'town-mayor', title: 'Town Mayor', tag: 'Casual · Choices', retro: false, w: W, h: H, goal: 30,
  hint: 'Swipe the card left or right to decide. Dots show which meters a choice will change. If Food, Gold, Mood or Safety hits empty or full, your term ends.',
  make,
};
