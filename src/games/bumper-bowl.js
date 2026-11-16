// Bumper Bowl: toy bumper cars on a round table with no rails. Drag to drive (your car points where you
// drag), ram the others off the edge and keep yourself on. Each car you knock off scores; each round adds
// one more rival, and the table shrinks a little. Fall off three times and the fair closes.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { sounds } = gs.sound;
const { haptic } = gs.device;
const { Juice } = gs.juice;
const { Stick, Keys } = gs.controls;
const { View, G, part, grp, blob } = gs.toon;

let W = 192, H = 176;
const COLS = ['#e84848', '#f8c030', '#48b8f0', '#a060e0', '#f080b0', '#60d070'];

let v3;
function view3d() {
  if (!v3) {
    v3 = new View({ bg: '#283850', sun: [-.5, 1, .5] });
    v3.def('table', () => part(G.cyl, '#e8d8b0', { y: -.5 }));
    v3.def('rim', () => part(G.cyl, '#b08850', { y: -.5 }));
    for (let i = 0; i < COLS.length; i++) v3.def('car' + i, () => grp(
      part(G.box, COLS[i], { sx: 10, sy: 4, sz: 8, y: 3 }),
      part(G.box, '#202830', { sx: 11.5, sy: 2, sz: 9.5, y: 1.2 }),
      part(G.ball, '#f8c890', { s: 4, y: 7.5, x: -1 }),
      part(G.pill, '#d0d8e0', { sx: 1, sy: 8, sz: 1, y: 9, x: 3 }),
      blob(6)));
  }
  v3.board(W, H, .75);
  return v3;
}

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const fx = new Juice();
  const stick = new Stick({ r: 26, floating: true, zone: [0, 0, 9999, 9999] });
  const keys = new Keys();
  let cars, me, score, lives, round, t, R, msg, ml, ended, respawn;
  const CX = () => W / 2, CY = () => H / 2 + 6;

  function car(x, y, col, ai) { return { x, y, vx: 0, vy: 0, a: 0, col, ai, out: 0, r: 7, hit: 0, wob: Math.random() * 6 }; }
  function newRound() {
    round++; R = Math.max(46, 70 - round * 3);
    me = me && me.out ? car(CX(), CY(), 0, false) : me || car(CX(), CY(), 0, false);
    me.x = CX(); me.y = CY() + R * .4; me.vx = me.vy = 0; me.out = 0;
    cars = [me];
    const n = Math.min(5, round);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * .9; cars.push(car(CX() + Math.cos(a) * R * .6, CY() + Math.sin(a) * R * .6, 1 + (i % 5), true)); }
    msg = `ROUND ${round}`; ml = 1.4;
  }

  return {
    reset() { score = 0; lives = 3; round = 0; t = 0; me = null; ready.reset(); ended = false; respawn = 0; newRound(); fx.clear(); stick.release(); keys.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      fx.update(dt); t += dt; if (ml > 0) ml -= dt;
      if (!ready.playing) return;
      // you: push toward where you drag
      const k = keys.axis(), ax = stick.active ? stick.x : k.x, ay = stick.active ? stick.y : k.y;
      if (!me.out) { me.vx += ax * 150 * dt; me.vy += ay * 150 * dt; if (Math.hypot(ax, ay) > .2) me.a = Math.atan2(ay, ax); }
      // rivals: drive at the nearest car that is closer to the edge than they are, but back off the rim
      for (const c of cars) {
        if (!c.ai || c.out) continue;
        let tgt = null, bd = 1e9;
        for (const o of cars) if (o !== c && !o.out) { const d = Math.hypot(o.x - c.x, o.y - c.y) - (o === me ? 20 : 0); if (d < bd) { bd = d; tgt = o; } }
        let dx = 0, dy = 0;
        if (tgt) { dx = tgt.x - c.x; dy = tgt.y - c.y; }
        const fromC = Math.hypot(c.x - CX(), c.y - CY());
        if (fromC > R - 16) { dx += (CX() - c.x) * 2; dy += (CY() - c.y) * 2; }
        const l = Math.hypot(dx, dy) || 1, pow = 95 + round * 6;
        dx += Math.sin(t * 2 + c.wob) * l * .3;
        c.vx += dx / l * pow * dt; c.vy += dy / l * pow * dt; c.a = Math.atan2(c.vy, c.vx);
      }
      for (const c of cars) {
        if (c.out) { c.out += dt; continue; }
        const f = Math.exp(-1.8 * dt); c.vx *= f; c.vy *= f;
        c.x += c.vx * dt; c.y += c.vy * dt; c.hit = Math.max(0, c.hit - dt);
      }
      // bumps: springy, and the faster car shoves harder
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j]; if (a.out || b.out) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, o = a.r + b.r - d;
        if (o <= 0) continue;
        const nx = dx / d, ny = dy / d, rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        a.x -= nx * o / 2; a.y -= ny * o / 2; b.x += nx * o / 2; b.y += ny * o / 2;
        if (rel > 0) {
          const imp = rel * 1.5; a.vx -= nx * imp * .5; a.vy -= ny * imp * .5; b.vx += nx * imp * .5; b.vy += ny * imp * .5;
          if (rel > 25) { sounds.hit(); a.hit = b.hit = .2; a.last = b; b.last = a; if (a === me || b === me) { haptic(rel > 60 ? 'medium' : 'light'); fx.shake(Math.min(4, rel / 20)); } }
        }
      }
      // off the edge
      for (const c of cars) {
        if (c.out) continue;
        if (Math.hypot(c.x - CX(), c.y - CY()) > R + 2) {
          c.out = .001;
          if (c === me) { lives--; sounds.lose(); haptic('error'); fx.flash('#ff4040', .3); msg = lives > 0 ? 'OFF THE TABLE!' : 'FAIR CLOSED'; ml = 1.4; respawn = 1.2; }
          else { const mine = c.last === me; score += mine ? 2 : 1; api.score(score); sounds.coin(1 + score * .02); haptic('success'); fx.burst(c.x, c.y, { n: 16, speed: 80, size: 3, color: [COLS[c.col], '#fff'] }).pop(c.x, c.y - 10, mine ? '+2' : '+1'); }
        }
      }
      if (respawn > 0) {
        respawn -= dt;
        if (respawn <= 0) { if (lives <= 0) { if (!ended) { ended = true; api.over(); } return; } me.out = 0; me.x = CX(); me.y = CY(); me.vx = me.vy = 0; }
      }
      if (!me.out && cars.every(c => c === me || c.out)) { sounds.powerup(); newRound(); }
    },
    draw(c) {
      const v = view3d(); v.frame();
      v.put('rim', v.at(CX(), CY(), -1.5), { sx: R + 3, sy: 2, sz: (R + 3) / v.sin });
      v.put('table', v.at(CX(), CY()), { sx: R, sy: 1, sz: R / v.sin });
      for (const k of cars) {
        if (k.out > .6) continue;
        const drop = k.out ? -k.out * k.out * 120 : 0;
        v.put('car' + k.col, v.at(k.x, k.y, drop + (k.hit ? 2 : 0)), { ry: -k.a });
      }
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      stick.draw(c);
      c.textAlign = 'left'; c.font = '700 10px Rubik, sans-serif'; c.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? COLS[0] : '#ffffff30'; c.fillRect(6 + i * 9, 6, 7, 7); }
      c.textAlign = 'center';
      if (ml > 0) { c.font = '800 16px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg, W / 2, H * .3); }
      if (!ready.playing) { c.fillStyle = '#000a'; c.fillRect(0, H - 22, W, 18); c.fillStyle = '#fff'; c.font = '600 9px Rubik, sans-serif'; c.fillText('Drag to drive. Ram the others off the table', W / 2, H - 10); }
    },
    down: (x, y, id) => { ready.go(); stick.down(x, y, id); },
    move: (x, y, pr, id) => stick.move(x, y, pr, id),
    up: (x, y, id) => stick.up(x, y, id),
    key: (k, d) => { if (d) ready.go(); keys.key(k, d); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'bumper-bowl',
  title: 'Bumper Bowl',
  tag: 'Console · Party',
  retro: true, era: 'console', pal: 'berry',
  w: 192, h: 176, maxW: 300, maxH: 280,
  goal: 20,
  hint: 'Drag to drive your red bumper car. Ram the others off the round table without falling off yourself. Fall off three times and it is over.',
  make,
};
