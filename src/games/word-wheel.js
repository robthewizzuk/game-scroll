// Word Wheel: six letters sit round a wheel. Slide your finger from letter to letter to spell a word and
// let go to try it. Three letters or more, each letter once per word. Long words score more, and every
// word adds time. Use all six letters for a big bonus. Tap the middle to shuffle the wheel.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Words } = gs.words;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  const words = new Words();
  let ended, letters, all, found, path, cur, score, time, t, round, msg, ml, flash;
  const CX = () => W / 2, CY = () => H * .66, RW = () => Math.min(120, W * .33);
  const pos = i => { const a = -Math.PI / 2 + i / letters.length * Math.PI * 2; return { x: CX() + Math.cos(a) * RW(), y: CY() + Math.sin(a) * RW() }; };

  function newWheel() {
    round++;
    let w = null;
    for (let k = 0; k < 40 && !w; k++) { const c = words.random({ length: 6 }); if (c && words.safe(c) && words.from(c, { min: 3, common: true }).length >= 6) w = c; }
    w = (w || 'garden').toUpperCase();
        letters = shuffle(w.split(''));
    all = words.from(w.toLowerCase(), { min: 3, common: true }).filter(x => words.safe(x)).map(x => x.toUpperCase());
    found = []; path = []; cur = null;
  }

  return {
    reset() { ended = false; score = 0; time = 60; t = 0; round = 0; msg = ''; ml = 0; flash = 0; newWheel(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; flash = Math.max(0, flash - dt);
      if (t > 1.5) time -= dt;
      if (time <= 0 && !ended) { time = 0; ended = true; api.over(); }
    },
    draw(c) {
      c.fillStyle = '#fefae0'; c.fillRect(0, 0, W, H);
      // timer
      c.fillStyle = '#e9edc9'; c.fillRect(24, 56, W - 48, 10); c.fillStyle = time < 10 ? '#e63946' : '#606c38'; c.fillRect(24, 56, (W - 48) * Math.min(1, time / 60), 10);
      // found words, in a grid of small tiles
      c.textAlign = 'center';
      c.fillStyle = '#283618'; c.font = '600 13px Rubik, sans-serif'; c.fillText(`${found.length} of ${all.length} words · wheel ${round}`, W / 2, 88);
      const cols = 3, cw = (W - 40) / cols;
      found.slice(-15).forEach((w, i) => { const x = 20 + (i % cols) * cw + cw / 2, y = 112 + Math.floor(i / cols) * 26; c.fillStyle = w.length === 6 ? '#dda15e' : '#ccd5ae'; c.beginPath(); c.roundRect(x - cw / 2 + 4, y - 15, cw - 8, 22, 6); c.fill(); c.fillStyle = '#283618'; c.font = '700 14px Rubik, sans-serif'; c.fillText(w, x, y + 1); });
      // the word being spelled
      const word = path.map(i => letters[i]).join('');
      c.fillStyle = flash ? '#bc4749' : '#283618'; c.font = '800 34px Rubik, sans-serif'; c.fillText(word || (ml > 0 ? msg : ''), W / 2, CY() - RW() - 44);
      feel.begin(c);
      // wheel
      c.fillStyle = '#e9edc9'; c.beginPath(); c.arc(CX(), CY(), RW() + 36, 0, 7); c.fill();
      // the line through chosen letters
      if (path.length) { c.strokeStyle = '#bc6c25'; c.lineWidth = 10; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); path.forEach((i, k) => { const p = pos(i); k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); if (cur) c.lineTo(cur.x, cur.y); c.stroke(); }
      letters.forEach((l, i) => {
        const p = pos(i), on = path.includes(i);
        c.fillStyle = on ? '#bc6c25' : '#fff'; c.beginPath(); c.arc(p.x, p.y, 30, 0, 7); c.fill();
        c.fillStyle = on ? '#fff' : '#283618'; c.font = '800 28px Rubik, sans-serif'; c.fillText(l, p.x, p.y + 10);
      });
      c.fillStyle = '#ccd5ae'; c.beginPath(); c.arc(CX(), CY(), 26, 0, 7); c.fill(); c.strokeStyle = '#606c38'; c.lineWidth = 3; c.beginPath(); c.arc(CX(), CY(), 11, -.3, 4.6); c.stroke(); c.fillStyle = '#606c38'; c.beginPath(); c.moveTo(CX() + 15, CY() - 8); c.lineTo(CX() + 6, CY() - 7); c.lineTo(CX() + 12, CY() + 1); c.fill();
      feel.end(c, W, H);
      c.textAlign = 'center';
      if (t < 5 && round === 1 && !found.length) { c.fillStyle = '#606c38'; c.font = '600 15px Rubik, sans-serif'; c.fillText('Slide across letters to spell', W / 2, H - 30); }
    },
    down(x, y) {
      if (Math.hypot(x - CX(), y - CY()) < 28) { letters = shuffle(letters); sfx(500, .05, 'triangle', .03); haptic('light'); return; }
      path = []; cur = { x, y }; pick(x, y);
    },
    move(x, y, pr) { if (!pr || !cur) return; cur = { x, y }; pick(x, y); },
    up() {
      if (!cur) return; cur = null;
      const w = path.map(i => letters[i]).join(''); path = [];
      if (w.length < 3) return;
      if (found.includes(w)) { msg = 'Already got it'; ml = 1; sfx(300, .08, 'square', .03); return; }
      if (!words.has(w.toLowerCase()) || !words.safe(w.toLowerCase())) { msg = 'Not a word'; ml = .8; flash = .3; haptic('warning'); sfx(150, .15, 'square', .03); return; }
      found.push(w); if (!all.includes(w)) all.push(w);
      const pts = w.length - 2 + (w.length === 6 ? 6 : 0);
      score += pts; api.score(score); time = Math.min(90, time + 2 + w.length);
      msg = w.length === 6 ? 'WHOLE WHEEL!' : `+${pts}`; ml = 1;
      notes(w.length >= 5 ? 'C5 E5 G5 C6' : 'C5 G5', { len: .05 }); feel.coin(W / 2, CY() - RW() - 54); haptic('success');
      if (w.length === 6 || found.length >= Math.min(all.length, 10)) { feel.win(W / 2, H / 2); newWheel(); }
    },
  };

  function pick(x, y) {
    letters.forEach((l, i) => {
      const p = pos(i);
      if (Math.hypot(x - p.x, y - p.y) < 28 && !path.includes(i)) { path.push(i); sfx(400 + path.length * 60, .04, 'triangle', .03); haptic('tick'); }
    });
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'word-wheel',
  title: 'Word Wheel',
  tag: 'Casual · Words',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Slide across the letters on the wheel to spell words of three letters or more. Longer words score more and add time; all six letters gets a new wheel.',
  make,
};
