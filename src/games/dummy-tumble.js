// Dummy Tumble: a floppy crash-test dummy stands at the top of a long staircase. Drag back from it and
// let go to fling it; it tumbles down the steps, and every hard bump scores. Knock the crates off and
// land in the padded bin for bonuses. Three flings: make each one bumpier than the last.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Physics } = gs.physics;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp } = gs.util;

let W = 360, H = 640;
const N = 6;

function make(api) {
  const feel = new Feel();
  let phys, parts, crates, bin, score, throws, t, aim, still, run, cool, binHit;
  const START = () => ({ x: 50, y: 150 });
  const SW = () => (W - 150) / N, SH = () => (H - 300) / N;
  function steps() {
    const pts = [[-10, 0], [-10, 180], [70, 180]];
    let x = 70, y = 180;
    for (let i = 0; i < N; i++) { y += SH(); pts.push([x, y]); x += SW(); pts.push([x, y]); }
    pts.push([W + 10, y], [W + 10, 0]);
    return pts;
  }

  function build() {
    phys = new Physics({ gravity: 1000 });
    // the staircase: one solid line down the steps, plus side walls
    const pts = steps();
    phys.line(pts, { friction: .6, bounce: .15, tag: 'stairs' });
    // a padded bin at the bottom right
    bin = { x: W - 40, y: 180 + SH() * N };
    phys.box(bin.x, bin.y - 20, 50, 4, { fixed: true, sensor: true, tag: 'bin' });
    crates = []; setCrates();
    phys.onHit((a, b, speed, x, y) => hit(a, b, speed, x, y));
  }
  function setCrates() {
    for (const cr of crates) phys.remove(cr);
    crates = [];
    for (let k = 0; k < 3; k++) { const sx = 70 + SW() * (1 + k * 2) + SW() / 2, sy = 180 + SH() * (2 + k * 2) - 12; { const cr = phys.box(sx, sy, 22, 22, { density: .4, bounce: .1, tag: 'crate' }); cr.y0 = sy; crates.push(cr); } }
  }
  function hit(a, b, speed, x, y) {
    {
      const d =a.tag === 'dummy' ? a : b.tag === 'dummy' ? b : null; if (!d || !run) return;
      const other = d === a ? b : a;
      if (other.tag === 'bin') { if (!binHit) { binHit = true; feel.juice.pop(x, y, 'IN THE BIN! +15', { color: '#d00000', life: 1.4, rise: 42 }); score += 15; api.score(score); notes('C5 E5 G5 C6', { len: .06 }); haptic('success'); } return; }
      if (speed < 250 || (cool.get(d) || 0) > t) return;
      cool.set(d, t + .15);
      const p = Math.floor(speed / 250) * (d.head ? 2 : 1);
      score += p; api.score(score); run.got += p;
      feel.juice.pop(x, y, `+${p}`, { color: '#d00000', life: .7, rise: 21 });
      sfx(140 + speed * .1, .06, 'square', .04); haptic(speed > 500 ? 'medium' : 'light');
      if (speed > 500) feel.hit(x, y, { power: .4 });
    }
  }

  function dummy(vx, vy) {
    const s = START(), o = { vx, vy, tag: 'dummy', group: 3, friction: .5, bounce: .2 };
    const torso = phys.box(s.x, s.y, 16, 30, o), head = phys.circle(s.x, s.y - 24, 9, o); head.head = true;
    const ua = [phys.box(s.x - 14, s.y - 6, 18, 7, o), phys.box(s.x + 14, s.y - 6, 18, 7, o)];
    const la = [phys.box(s.x - 30, s.y - 6, 16, 6, o), phys.box(s.x + 30, s.y - 6, 16, 6, o)];
    const ul = [phys.box(s.x - 5, s.y + 24, 8, 20, o), phys.box(s.x + 5, s.y + 24, 8, 20, o)];
    const ll = [phys.box(s.x - 5, s.y + 44, 7, 20, o), phys.box(s.x + 5, s.y + 44, 7, 20, o)];
    phys.hinge(torso, head, s.x, s.y - 15, { min: -.6, max: .6 });
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1;
      phys.hinge(torso, ua[i], s.x + sg * 6, s.y - 6);
      phys.hinge(ua[i], la[i], s.x + sg * 22, s.y - 6, { min: -2, max: 2 });
      phys.hinge(torso, ul[i], s.x + sg * 5, s.y + 14, { min: -1.5, max: 1.5 });
      phys.hinge(ul[i], ll[i], s.x + sg * 5, s.y + 34, { min: -2, max: .1 });
    }
    return [torso, head, ...ua, ...la, ...ul, ...ll];
  }

  return {
    reset() { score = 0; throws = 3; t = 0; aim = null; still = 0; run = null; parts = null; cool = new Map(); binHit = false; build(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      phys.step(dt);
      if (!run) return;
      run.time += dt;
      for (const c of crates) if (!c.out && c.y > c.y0 + SH() * 1.5) { c.out = true; score += 5; api.score(score); feel.juice.pop(c.x, c.y - 20, 'CRATE +5', { color: '#d00000', life: 1, rise: 30 }); notes('E5 G5', { len: .05 }); }
      const torso = parts[0], sp = Math.hypot(torso.vx, torso.vy);
      still = sp < 25 ? still + dt : 0;
      if (still > 1.2 || run.time > 12 || torso.y > H + 100) {
        throws--; run = null; still = 0;
        if (throws <= 0) { api.over(); return; }
        // tidy up for the next fling
        for (const p of parts) phys.remove(p);
        setCrates(); parts = null; binHit = false;
      }
    },
    draw(c) {
      c.fillStyle = '#e9edc9'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ccd5ae'; for (let y = 0; y < H; y += 40) c.fillRect(0, y, W, 2);
      // the steps
      const pts = steps(); c.fillStyle = '#6b705c'; c.beginPath(); c.moveTo(-10, H); for (const [x, y] of pts.slice(1, -1)) c.lineTo(x, y); c.lineTo(W + 10, H); c.fill();
      c.fillStyle = '#a5a58d'; for (let i = 1; i < pts.length - 2; i += 2) c.fillRect(pts[i][0], pts[i][1], pts[i + 1][0] - pts[i][0], 5);
      c.fillStyle = '#3a3d2f'; c.fillRect(0, bin.y + 5, W, H - bin.y);
      // bin
      c.fillStyle = '#e76f51'; c.fillRect(bin.x - 28, bin.y - 24, 56, 24); c.fillStyle = '#f4a261'; c.fillRect(bin.x - 24, bin.y - 20, 48, 8);
      feel.begin(c);
      for (const cr of crates) { c.save(); c.translate(cr.x, cr.y); c.rotate(cr.angle); c.fillStyle = '#bc6c25'; c.fillRect(-11, -11, 22, 22); c.strokeStyle = '#7f4f24'; c.lineWidth = 2; c.strokeRect(-9, -9, 18, 18); c.beginPath(); c.moveTo(-9, -9); c.lineTo(9, 9); c.stroke(); c.restore(); }
      if (parts) for (const p of parts) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.angle);
        if (p.head) { c.fillStyle = '#ffd60a'; c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill(); c.fillStyle = '#000'; c.fillRect(-1, -9, 2, 18); c.fillRect(-9, -1, 18, 2); }
        else { c.fillStyle = '#ffd60a'; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.strokeStyle = '#00000050'; c.lineWidth = 1; c.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        c.restore();
      } else {
        // the dummy standing ready
        const s = START(); c.fillStyle = '#ffd60a';
        c.fillRect(s.x - 8, s.y - 15, 16, 30); c.beginPath(); c.arc(s.x, s.y - 24, 9, 0, 7); c.fill();
        c.fillRect(s.x - 22, s.y - 9, 44, 6); c.fillRect(s.x - 9, s.y + 14, 7, 40); c.fillRect(s.x + 2, s.y + 14, 7, 40);
        c.fillStyle = '#000'; c.fillRect(s.x - 1, s.y - 33, 2, 18); c.fillRect(s.x - 9, s.y - 25, 18, 2);
        if (aim) { const v = fling(); c.strokeStyle = '#d00000'; c.lineWidth = 3; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + v.vx * .15, s.y + v.vy * .15); c.stroke(); c.setLineDash([]); }
      }
      feel.end(c, W, H);
      c.textAlign = 'right'; c.fillStyle = '#283618'; c.font = '700 15px Rubik, sans-serif'; c.fillText(`flings ${throws}`, W - 16, 60);
      if (!run && !aim && throws === 3) { c.textAlign = 'center'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Drag back from the dummy, let go', W / 2, 110); }
    },
    down(x, y) { if (run || parts) return; aim = { x0: x, y0: y, x, y }; },
    move(x, y, pr) { if (aim && pr) { aim.x = x; aim.y = y; } },
    up() {
      if (!aim) return;
      const v = fling(); aim = null;
      if (Math.hypot(v.vx, v.vy) < 80) return;
      parts = dummy(v.vx, v.vy); run = { time: 0, got: 0 }; still = 0; cool = new Map();
      sfx(300, .15, 'triangle', .04, 300); haptic('medium');
    },
  };

  function fling() { const dx = aim.x0 - aim.x, dy = aim.y0 - aim.y; return { vx: clamp(dx * 5, -900, 900), vy: clamp(dy * 5, -900, 900) }; }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'dummy-tumble',
  title: 'Dummy Tumble',
  tag: 'Casual · Physics',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 40,
  hint: 'Drag back from the crash-test dummy and let go to fling it down the stairs. Hard bumps score, head bumps double; knock crates off and land in the bin. Three flings.',
  make,
};
