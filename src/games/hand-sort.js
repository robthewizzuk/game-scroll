// Hand Sort: you're dealt a messy hand of cards in a column. Drag cards up and down to put them in the
// order the rule asks for (low to high, high to low, by colour then number...). Sorted before the
// sand runs out scores; doing it in few drags scores more.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { Drag } = gs.drag;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

let W = 360, H = 640;
const SUITS = [['#e63946', '●'], ['#1d3557', '▲'], ['#2a9d8f', '■'], ['#f4a261', '★']];
const RULES = [
  { txt: 'Low to high', cmp: (a, b) => a.v - b.v },
  { txt: 'High to low', cmp: (a, b) => b.v - a.v },
  { txt: 'Colours together, low to high in each', cmp: (a, b) => a.s - b.s || a.v - b.v, needSuits: true },
  { txt: 'Evens first, then odds (low to high)', cmp: (a, b) => (a.v % 2) - (b.v % 2) || a.v - b.v },
];

function make(api) {
  const feel = new Feel();
  let drag, rule, hand, drags, round, score, time, tmax, t, banner;
  const ordered = () => { const o = drag.order; return o.every((p, i) => i === 0 || rule.cmp(o[i - 1], p) <= 0); };

  function deal() {
    round++;
    const n = Math.min(8, 4 + Math.floor(round / 2));
    rule = round < 3 ? RULES[0] : RULES[Math.random() * RULES.length | 0];
    const ch = (H - 210) / n - 6, cw = Math.min(W - 80, 230);
    drag = new Drag({ list: { x: W / 2, y: 150, gap: 6, axis: 'y' } });
    const used = new Set(); hand = [];
    while (hand.length < n) { const v = 1 + Math.random() * 12 | 0, s = Math.random() * (rule.needSuits ? 3 : 4) | 0, k = v + ',' + s; if (used.has(k)) continue; used.add(k); hand.push({ v, s }); }
    // make sure it starts unsorted
    hand = shuffle(hand);
    for (const c of hand) drag.piece({ ...c, x: W / 2, y: 150, w: cw, h: ch });
    if (ordered()) { const ps = drag.order; [ps[0].index, ps[1].index] = [ps[1].index, ps[0].index]; drag.layout(); }
    drags = 0; tmax = time = 8 + n * 2.4;
    drag.on('drop', () => { drags++; sfx(400 + drags * 20, .04, 'triangle', .03); haptic('tick'); check(); }).on('pick', () => { sfx(700, .02, 'square', .02); });
    banner = { txt: rule.txt, l: 1.4 };
  }
  function check() {
    if (!ordered()) return;
    const n = drag.pieces.length, pts = 2 + Math.max(0, n - drags) + Math.floor(time / tmax * 3);
    score += pts; api.score(score); notes('C5 E5 G5 C6:2', { len: .06 }); feel.win(W / 2, H / 2); haptic('success');
    banner = { txt: 'Sorted!', sub: `+${pts}`, l: 1.1, next: true };
  }

  return {
    reset() { round = 0; score = 0; t = 0; feel.clear(); deal(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; drag.update(dt);
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); if (b.next) deal(); } if (banner?.next || banner?.over) return; }
      time -= dt;
      if (time <= 0) { feel.lose(); banner = { txt: 'Time up', l: 1.2, over: true }; }
    },
    draw(c) {
      c.fillStyle = '#1f6f50'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff10'; for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 2);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 20px Rubik, sans-serif'; c.fillText(rule.txt, W / 2, 80);
      c.fillStyle = '#00000040'; c.fillRect(30, 100, W - 60, 10); c.fillStyle = time / tmax < .25 ? '#ff6b6b' : '#ffd166'; c.fillRect(30, 100, (W - 60) * Math.max(0, time / tmax), 10);
      feel.begin(c);
      for (const p of drag.pieces) {
        const w = p.w * p.scale, h = p.h * p.scale, [col, sym] = SUITS[p.s];
        c.fillStyle = '#00000040'; c.beginPath(); c.roundRect(p.x - w / 2 + 3, p.y - h / 2 + 4, w, h, 10); c.fill();
        c.fillStyle = p.held ? '#fffbe6' : '#fff'; c.beginPath(); c.roundRect(p.x - w / 2, p.y - h / 2, w, h, 10); c.fill();
        c.fillStyle = col; c.font = `800 ${Math.min(30, h * .6)}px Rubik, sans-serif`; c.textAlign = 'left'; c.fillText(p.v, p.x - w / 2 + 16, p.y + Math.min(30, h * .6) * .35);
        c.textAlign = 'right'; c.font = `700 ${Math.min(26, h * .5)}px sans-serif`; c.fillText(sym, p.x + w / 2 - 16, p.y + Math.min(26, h * .5) * .35);
        c.fillStyle = '#00000018'; c.fillRect(p.x - 12, p.y - h / 2 + 8, 24, 3);
      }
      feel.end(c, W, H);
      c.fillStyle = '#ffffffb0'; c.font = '600 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`drags ${drags} · hand ${round}`, W / 2, H - 22);
      if (banner) { c.fillStyle = '#000000b0'; c.fillRect(0, H * .45 - 40, W, 84); c.fillStyle = '#fff'; c.font = '800 26px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .45); if (banner.sub) { c.font = '600 17px Rubik, sans-serif'; c.fillText(banner.sub, W / 2, H * .45 + 28); } }
    },
    down(x, y, id) { if (!banner) drag.down(x, y, id); },
    move(x, y, p, id) { drag.move(x, y, id); },
    up(x, y, id) { drag.up(x, y, id); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'hand-sort',
  title: 'Hand Sort',
  tag: 'Casual · Cards',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 40,
  hint: 'Drag the cards up and down into the order the rule asks for before the bar runs out. Fewer drags score more.',
  make,
};
