import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { icon } = gs.icons;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// A colour word in a different colour of ink. The rule at the top says whether to tap the INK
// or the WORD, and it can flip at any time. The timer shrinks with every right answer.
const W = 360, H = 640;
const C = [['RED', '#ff4d4d'], ['BLUE', '#3d8bff'], ['GREEN', '#3dd17a'], ['YELLOW', '#ffd34a']];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                                            // the answer clock waits for the first tap
  let lives, word, ink, rule, time, limit, score, t, flip, shake, btnOrder;
  function next() {
    word = Math.random() * 4 | 0; do ink = Math.random() * 4 | 0; while (ink === word && Math.random() < .8);
    if (score >= 4 && Math.random() < .3) { rule = rule === 'ink' ? 'word' : 'ink'; flip = 1; haptic('warning'); }
    limit = Math.max(1.1, 3 - score * .07); time = limit;
    if (score >= 10) btnOrder = shuffle(btnOrder);
  }
  const self = {
    reset() { lives = 3; rule = 'ink'; score = 0; t = 0; flip = 0; shake = 0; btnOrder = [0, 1, 2, 3]; feel.clear(); ready.reset(); next(); },
    fx(dt) { feel.update(dt); },
    update(dt) { feel.update(dt); if (!ready.update(dt)) return; t += dt; flip = Math.max(0, flip - dt * 2); shake = Math.max(0, shake - dt * 3); time -= dt; if (time <= 0) self.miss(); },
    miss() { shake = 1; feel.juice.shake(6).flash('#ff4d4d', .2); haptic('error'); sfx(140, .3, 'square', .05, -40); if (--lives <= 0) return api.over(); next(); },
    draw(c) {
      c.fillStyle = '#16131f'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = flip ? `rgba(255,255,255,${flip * .25})` : '#ffffff10'; c.beginPath(); c.roundRect(40, 80, 280, 60, 14); c.fill();
      c.fillStyle = '#fff'; c.font = '400 13px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(rule === 'ink' ? 'TAP THE INK' : 'TAP THE WORD', W / 2, 117);
      for (let i = 0; i < 3; i++) icon(c, 'heart', W / 2 - 28 + i * 28, 53, 20, { color: i < lives ? '#ff4d6d' : '#ffffff22' });
      c.fillStyle = '#ffffff20'; c.fillRect(40, 160, 280, 8); c.fillStyle = time / limit < .3 ? '#ff4d4d' : '#ffffffcc'; c.fillRect(40, 160, 280 * clamp(time / limit, 0, 1), 8);
      c.save(); c.translate(W / 2 + (shake ? Math.sin(t * 80) * 6 * shake : 0), 290);
      c.fillStyle = C[ink][1]; c.font = '800 54px Rubik, sans-serif'; c.fillText(C[word][0], 0, 0); c.restore();
      btnOrder.forEach((k, i) => {
        const x = 30 + (i % 2) * 155, y = 380 + (i / 2 | 0) * 110;
        c.fillStyle = C[k][1]; c.beginPath(); c.roundRect(x, y, 145, 95, 18); c.fill();
        c.fillStyle = '#00000050'; c.font = '700 16px Rubik, sans-serif'; c.fillText(C[k][0], x + 72, y + 54);
      });
      feel.end(c, W, H);
      ready.draw(c, W, H, { y: 352 });
    },
    down(x, y) {
      if (ready.go()) return;
      if (y < 380 || y > 600) return; const i = (x > W / 2 ? 1 : 0) + (y > 485 ? 2 : 0), k = btnOrder[i];
      const want = rule === 'ink' ? ink : word;
      if (k === want) { feel.juice.burst(30 + (i % 2) * 155 + 72, 380 + (i / 2 | 0) * 110 + 47, { n: 12, speed: 170, life: .4, size: 4, color: [C[k][1], '#ffffff'] }); score++; api.score(score); haptic('light'); sfx(600 + score * 10, .05, 'square', .04, 150); next(); }
      else self.miss();
    },
    key(k, d) { if (!d) return; const i = { 1: 0, 2: 1, 3: 2, 4: 3 }[k]; if (i != null) { const idx = btnOrder.indexOf(i); self.down(idx % 2 ? 300 : 60, idx > 1 ? 540 : 420); } },
  };
  return self;
}

export default {
  id: 'colour-word', title: 'Colour Word Trap', tag: 'Casual · Brain', retro: false, w: W, h: H, goal: 25,
  hint: 'Read the rule: tap the colour of the INK, or the colour the WORD says. The rule flips without warning. You have three hearts: a wrong tap or running out of time costs one.',
  make,
};
