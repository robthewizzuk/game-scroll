// Shape Turn: the shape at the top has been turned round in one of the four boxes below. The others
// are its mirror image, turned, so they look nearly right. Tap the one that's only turned. It gets
// faster and the shapes get bigger. Three wrong taps and it's over.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx } = gs.sound;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

const R = PAL.ice;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let shape, opts, right, score, lives, t, qt, qmax, n, wrongFlash, banner;
  const norm = cs => { const mx = Math.min(...cs.map(c => c[0])), my = Math.min(...cs.map(c => c[1])); return cs.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]); };
  const rot = cs => norm(cs.map(([x, y]) => [-y, x]));
  const mir = cs => norm(cs.map(([x, y]) => [-x, y]));
  const key = cs => norm(cs).map(c => c.join(',')).join(';');
  const rots = cs => { const out = [norm(cs)]; for (let i = 0; i < 3; i++) out.push(rot(out[out.length - 1])); return out; };

  function newQ() {
    n++;
    const size = Math.min(8, 5 + Math.floor(n / 6));
    for (let tries = 0; tries < 300; tries++) {
      // a random polyomino that isn't the same as its own mirror
      const cells = [[0, 0]], set = new Set(['0,0']);
      while (cells.length < size) { const [x, y] = cells[Math.random() * cells.length | 0], d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.random() * 4 | 0], k = (x + d[0]) + ',' + (y + d[1]); if (!set.has(k)) { set.add(k); cells.push([x + d[0], y + d[1]]); } }
      const s = norm(cells), rk = new Set(rots(s).map(key));
      if (rots(mir(s)).some(m => rk.has(key(m)))) continue;   // symmetric under a flip: no good
      shape = s;
      const good = rots(s)[1 + Math.random() * 3 | 0], bads = shuffle(rots(mir(s))).slice(0, 3);
      right = Math.random() * 4 | 0; opts = [...bads]; opts.splice(right, 0, good);
      break;
    }
    qmax = qt = Math.max(2.8, 8 - n * .18);
  }
  function drawShape(c, cs, cx, cy, s, col) {
    const w = Math.max(...cs.map(q => q[0])) + 1, h = Math.max(...cs.map(q => q[1])) + 1, x0 = Math.round(cx - w * s / 2), y0 = Math.round(cy - h * s / 2);
    for (const [x, y] of cs) { c.fillStyle = col; c.fillRect(x0 + x * s, y0 + y * s, s - 1, s - 1); c.fillStyle = R[3]; c.fillRect(x0 + x * s, y0 + y * s, s - 1, 1); }
  }
  const box = i => { const bw = Math.floor((W - 10) / 2), bh = Math.floor((H - 74) / 2); return [5 + (i % 2) * bw, 70 + Math.floor(i / 2) * bh, bw - 4, bh - 4]; };

  return {
    reset() { score = 0; lives = 3; t = 0; n = 0; wrongFlash = -1; banner = null; feel.clear(); newQ(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; wrongFlash = -1; if (b.over) return api.over(); newQ(); } return; }
      qt -= dt;
      if (qt <= 0) { lives--; haptic('error'); sfx(120, .2, 'square', .04); wrongFlash = right; banner = { l: .9, over: lives <= 0 }; }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; c.fillRect(0, 12, W, 54);
      const s = shape.length > 6 ? 6 : 7;
      feel.begin(c);
      drawShape(c, shape, W / 2, 39, s, R[0]);
      for (let i = 0; i < 4; i++) {
        const [x, y, w, h] = box(i), show = banner && i === right;
        c.fillStyle = show ? R[1] : wrongFlash === i ? R[0] : R[2]; c.fillRect(x, y, w, h); c.fillStyle = R[3]; c.fillRect(x + 1, y + 1, w - 2, h - 2);
        if (show) { c.fillStyle = R[2]; c.fillRect(x + 1, y + 1, w - 2, h - 2); }
        drawShape(c, opts[i], x + w / 2, y + h / 2, Math.min(s, Math.floor((h - 8) / 4)), R[1]);
      }
      feel.end(c, W, H);
      c.fillStyle = R[0]; c.fillRect(0, 0, W, 12);
      c.fillStyle = R[2]; c.fillRect(30, 4, Math.round((W - 60) * Math.max(0, qt / qmax)), 4);
      for (let i = 0; i < lives; i++) { c.fillStyle = R[3]; c.fillRect(4 + i * 6, 4, 4, 4); }
      text(c, `${score}`, W - 4, 3, { color: R[3], align: 'right' });
      if (n === 1 && t < 4) text(c, 'TAP THE SAME SHAPE, TURNED', W / 2, 59, { align: 'center', color: R[0] });
    },
    down(x, y) {
      if (banner) return;
      for (let i = 0; i < 4; i++) {
        const [bx, by, w, h] = box(i); if (x < bx || y < by || x > bx + w || y > by + h) continue;
        if (i === right) { score++; api.score(score); feel.coin(bx + w / 2, by + h / 2); haptic('light'); if (score % 10 === 0) feel.juice.pop(W / 2, 40, 'SHARP!', { color: R[0] }); newQ(); }
        else { lives--; wrongFlash = i; feel.hurt(bx + w / 2, by + h / 2); haptic('error'); banner = { l: 1, over: lives <= 0 }; }
        return;
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'shape-turn',
  title: 'Shape Turn',
  tag: 'Pocket · Brain',
  retro: true, pal: 'ice',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 25,
  hint: 'One box holds the top shape just turned round; the others are its mirror image. Tap the turned one before the bar runs out.',
  make,
};
