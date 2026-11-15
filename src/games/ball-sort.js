import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle

// Pour coloured balls between tubes until every tube holds one colour. Each solved rack adds time and a colour.
const W = 360, H = 640, CAP = 4;
const COLS = ['#ff5d73', '#ffb020', '#3ddc97', '#5aa8ff', '#9a8cff', '#ff7ad9', '#ffe14d'];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let tubes, sel, time, score, t, nColors, moving, dead, shake;
  function rack() {
    let balls = []; for (let i = 0; i < nColors; i++) for (let k = 0; k < CAP; k++) balls.push(i);
    do balls = shuffle(balls); while (solved(chunk(balls)));
    tubes = chunk(balls); tubes.push([], []); sel = -1;
  }
  const chunk = b => { const out = []; for (let i = 0; i < b.length; i += CAP) out.push(b.slice(i, i + CAP)); return out; };
  const solved = ts => ts.every(tb => tb.length === 0 || (tb.length === CAP && tb.every(v => v === tb[0])));
  function layout() { const n = tubes.length, per = n > 5 ? Math.ceil(n / 2) : n, rows = Math.ceil(n / per); return tubes.map((_, i) => { const r = i / per | 0, cnt = r === rows - 1 ? n - per * r : per, ci = i - r * per; return { x: W / 2 + (ci - (cnt - 1) / 2) * 62, y: rows === 1 ? 260 : 170 + r * 240 }; }); }
  return {
    reset() { nColors = 3; time = 50; score = 0; t = 0; moving = null; dead = 0; shake = 0; feel.clear(); rack(); },
    update(dt) {
      feel.update(dt); t += dt; shake = Math.max(0, shake - dt * 4);
      if (moving) { moving.k += dt * 5; if (moving.k >= 1) moving = null; }
      time -= dt; if (time <= 0) { haptic('warning'); return api.over(); }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = '#16212e'; c.fillRect(0, 0, W, H);
      const P = layout();
      feel.begin(c);
      tubes.forEach((tb, i) => {
        const { x, y } = P[i], up = i === sel ? -26 : 0, sx = i === sel ? Math.sin(shake * 30) * 4 * shake : 0;
        c.fillStyle = '#ffffff12'; c.strokeStyle = i === sel ? '#ffd34a' : '#ffffff55'; c.lineWidth = 3;
        c.beginPath(); c.roundRect(x - 24 + sx, y - 8 + up, 48, CAP * 42 + 16, [4, 4, 24, 24]); c.fill(); c.stroke();
        tb.forEach((v, k) => { const by = y + (CAP - 1 - k) * 42 + 26 + up; c.fillStyle = COLS[v]; c.beginPath(); c.arc(x + sx, by, 18, 0, 7); c.fill(); c.fillStyle = '#ffffff44'; c.beginPath(); c.arc(x + sx - 6, by - 6, 5, 0, 7); c.fill(); });
      });
      feel.end(c, W, H);
      c.fillStyle = time < 8 ? '#ff6b6b' : '#ffffffcc'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`${Math.ceil(time)}s`, W / 2, 96);
      c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#ffffff77'; c.fillText('Tap a tube, then tap where to pour', W / 2, H - 22);
    },
    down(x, y) {
      const P = layout(); const i = P.findIndex(p => Math.abs(x - p.x) < 30 && y > p.y - 40 && y < p.y + CAP * 42 + 20); if (i < 0) { sel = -1; return; }
      if (sel < 0) { if (tubes[i].length) { sel = i; haptic('tick'); sfx(500, .04, 'triangle', .03); } return; }
      if (i === sel) { sel = -1; return; }
      const from = tubes[sel], to = tubes[i], top = from[from.length - 1];
      if (to.length >= CAP || (to.length && to[to.length - 1] !== top)) { shake = 1; haptic('warning'); sfx(160, .1, 'square', .03); return; }
      let n = 0; while (from.length && from[from.length - 1] === top && to.length < CAP) { to.push(from.pop()); n++; }
      sfx(420 + n * 60, .08, 'triangle', .04); haptic('light'); sel = -1;
      feel.juice.burst(P[i].x, P[i].y + (CAP - to.length) * 42 + 26, { n: 6 + n * 3, speed: 90, life: .35, size: 3, color: [COLS[top], '#ffffff'] });
      if (to.length === CAP && to.every(v => v === top)) feel.juice.pop(P[i].x, P[i].y - 24, 'SORTED', { color: COLS[top], size: 14 });
      if (solved(tubes)) { feel.win(W / 2, 300); feel.juice.pop(W / 2, 120, '+15s', { color: '#7dff9a', size: 22 }); score++; api.score(score); time += 15; nColors = Math.min(COLS.length, nColors + 1); haptic('success'); sfx(880, .25, 'triangle', .06, 300); rack(); }
    },
  };
}

export default {
  id: 'ball-sort', title: 'Ball Sort', tag: 'Casual · Sort', retro: false, w: W, h: H, goal: 2,
  hint: 'Tap a tube, then another, to pour. You can only pour onto the same colour or into an empty tube.',
  make,
};
